# Data Model: Patch Heading (Phase 1)

**Branch**: `040-patch-heading` | **Date**: 2026-05-21
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

This document specifies the input, success-response envelope, and error-envelope shapes that the `patch_heading` typed tool exposes at its MCP boundary, plus the wrapper-internal heading-walk algorithm and race-detection identity primitive. The Zod schemas in [src/tools/patch_heading/schema.ts](../../src/tools/patch_heading/schema.ts) are the single source of truth at runtime; this document is the human-readable cross-reference.

## Input

A single Zod object built on the project's `targetModeBaseSchema` (per ADR-003), extended with `heading_path`, `mode`, and `content` fields. Strict mode is enforced via `applyTargetModeRefinement` — unknown top-level keys are rejected at validation, producing `VALIDATION_ERROR`.

| Field         | Type                              | Required | Constraints                                                                                                                                                                                  | Validation error if violated                                                                                                                                                       |
|---------------|-----------------------------------|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `target_mode` | `"specific" \| "active"`           | yes      | Discriminator per ADR-003. In `specific` mode, `vault` is required and exactly one of `file` / `path` is required. In `active` mode, none of `vault` / `file` / `path` may be supplied.       | `VALIDATION_ERROR` with `details.code: "invalid_union"` or `details.code: "unrecognized_keys"` per the cohort's target-mode primitive.                                            |
| `vault`       | string                            | conditional | Required iff `target_mode === "specific"`. Must be non-empty; resolved via the lazy vault registry; unknown vault → `VAULT_NOT_FOUND` (cohort reuse).                                       | `VAULT_NOT_FOUND` with `details.reason ∈ {"unknown", "not-open"}`                                                                                                                  |
| `file`        | string                            | conditional | One of `file` / `path` required iff `target_mode === "specific"`. Subject to the project's structural path-safety refinement.                                                                | `VALIDATION_ERROR` with details from `STRUCTURALLY_UNSAFE_PATH_MESSAGE`                                                                                                            |
| `path`        | string                            | conditional | Alternative to `file`. Same constraints as `file`.                                                                                                                                            | Same as `file`                                                                                                                                                                     |
| `heading_path`| string                            | yes       | Non-empty; ≤ 1000 UTF-16 code units; segments split on the literal `#` character produce at least two non-empty segments; no segment may be empty (no `##` or leading/trailing `#`).         | `VALIDATION_ERROR` + `details.code: "INVALID_HEADING_PATH"` + `details.reason ∈ {"empty", "empty-segment", "contains-hash", "single-segment", "too-long"}`                          |
| `mode`        | `"append" \| "prepend" \| "replace"` | yes    | One of the three placement modes per FR-009.                                                                                                                                                  | `VALIDATION_ERROR` with `details.code: "invalid_enum_value"`                                                                                                                       |
| `content`     | string                            | yes      | For `mode === "append" \| "prepend"`: non-empty (FR-018a). For `mode === "replace"`: any string including empty.                                                                              | `VALIDATION_ERROR` + `details.code: "EMPTY_CONTENT"` + `details.reason ∈ {"append", "prepend"}`                                                                                    |

Type alias: `type PatchHeadingInput = z.infer<typeof patchHeadingInputSchema>`.

### Validation order

1. **Schema-level (Zod)** — runs first, before any filesystem access or subprocess invocation:
   1. Target-mode discriminator + cohort-standard `vault` / `file` / `path` mutual-exclusion via `applyTargetModeRefinement`.
   2. `heading_path` non-empty, length cap, and segment-split + segment-non-empty + segment-count via Zod refinements. All `details.reason` sub-states fire here.
   3. `mode` enum check.
   4. `content` non-empty check via `superRefine` that has access to `mode` (so `replace` permits empty `content`).
2. **Path-safety Layer 2 (canonical-path check)** — only after schema validation passes. Resolves the supplied vault-relative path to an absolute filesystem path via `fs.realpath` on the parent directory and verifies `startsWith(realVaultRoot + sep)`. Violations surface as `PATH_ESCAPES_VAULT` (existing top-level code per ADR-009).
3. **Active-mode pre-write eval** — only for `target_mode === "active"`. A small bug-safe `obsidian eval` returns `{ base: vaultRoot, path: vaultRelativePath }` for the currently-focused file, or `path: null` if no file is focused. `null` → `ERR_NO_ACTIVE_FILE` (cohort reuse from `write_note`). Successful resolution proceeds to the file read.

No vault read, no heading walk, and no fs.write occur before steps 1–3 complete.

## Heading walk algorithm

The wrapper-private `heading-walk.ts` implements two pure functions consumed by `handler.ts`.

### `parseHeadingPath(headingPath: string): string[]`

Splits the locator on the literal `#` character (per FR-004) and returns the segment array. Schema-layer validation ensures no segment is empty and the array has length ≥ 2. Pure; deterministic.

### `walkHeadings(content: string, segments: string[]): ResolvedHeading | null`

Scans `content` once line-by-line, maintaining `inFence: boolean` per the R3 fenced-code-opacity rule. For each non-fence line whose lstripped form begins with one to six `#` characters followed by a space (ATX heading per R2), parses the heading's rank (count of `#` characters) and text (the remaining line content with any trailing `#`-run preserved as text per R2).

Walking the supplied segment array:

- Start with `targetRank = 1`, `targetText = segments[0]`. Scan from offset 0 until a heading with `(rank === 1 && text === segments[0])` is found. If none, return `null`.
- Set the first-match heading as the current ancestor. Increment `targetRank` to 2 and `targetText` to `segments[1]`. Continue scanning from the line after the ancestor's marker; stop at the first heading with `(rank === targetRank && text === targetText && rank's-direct-parent === current-ancestor)`. The "direct parent" relationship is the most-recently-seen heading at `rank - 1` since the previous heading of `rank <= rank - 1` (the parent-chain bookkeeping done line-by-line).
- Repeat for each remaining segment.
- The returned `ResolvedHeading` carries: `markerLineIndex` (0-indexed line number of the heading marker line), `markerLineText` (the literal marker line bytes), `rank` (count of `#` characters), `parentChainText` (the segments-joined-with-`#` text of the resolved heading's ancestors, NOT including the leaf itself), `reachStartLineIndex` (the first line after the marker), `reachEndLineIndex` (one past the last line of the heading's reach — the next equal-or-higher-rank heading's marker line index, or `content.split('\n').length`), `directBodyEndLineIndex` (one past the last line of the direct body — the first child heading's marker line index, or equal to `reachEndLineIndex` if no child exists).

The function returns `null` (not throws) on resolution failure; the handler converts `null` to a `HEADING_NOT_FOUND` `UpstreamError`.

### `resolveHeadingIdentity(resolved: ResolvedHeading): HeadingIdentity`

Computes the race-detection 3-tuple per R4:

```typescript
interface HeadingIdentity {
  markerLineText: string;     // The literal marker line bytes (e.g. "## My Heading")
  rank: number;                // 1..6
  parentChainText: string;     // Empty string if rank === 1; otherwise the segments-joined-with-`#` of ancestors
}
```

Two identities compare equal iff all three fields are byte-identical. Used by `handler.ts` to compare the initial-walk identity against the pre-write re-walk identity; mismatch fires `HEADING_RACE`.

### First-match-wins rule (FR-006)

When the same `(rank, text)` pair appears more than once at the same level under the same parent, `walkHeadings` returns the **first** occurrence in document order. The contract is documented in tool help and is part of the published behaviour.

## Body-edit algorithm

The wrapper-private `body-edit.ts` implements three pure functions, one per placement mode. Each consumes a `ResolvedHeading` plus the file's line array (split on `\n`, preserving the original line-ending character per R11 probe-3) plus the new `content` string, and returns the post-edit line array.

### `applyAppend(lines: string[], resolved: ResolvedHeading, content: string): string[]`

Per FR-010: insert `content` at the end of the heading's full reach — immediately before `lines[resolved.reachEndLineIndex]` (or at end-of-array if `reachEndLineIndex === lines.length`). Preserves child-heading subtrees and the existing direct body. The `content` string is inserted as-is, split on `\n` if it contains them, so multi-line content lands as multiple lines.

### `applyPrepend(lines: string[], resolved: ResolvedHeading, content: string): string[]`

Per FR-011: insert `content` immediately after the heading marker line — at `lines[resolved.markerLineIndex + 1]`. Preserves the existing direct body and child subtrees.

### `applyReplace(lines: string[], resolved: ResolvedHeading, content: string): string[]`

Per FR-012: replace `lines[resolved.reachStartLineIndex .. resolved.directBodyEndLineIndex]` with the new `content` (split on `\n` if multi-line). Preserves the heading marker line at `markerLineIndex` and every line from `directBodyEndLineIndex` onwards (the child-heading subtrees and beyond).

### Line-ending and trailing-newline preservation

The handler determines the file's line-ending convention by inspecting the raw bytes returned from `fs.readFile`: if the file contains any `\r\n`, the convention is CRLF; otherwise LF. The split-and-join in `body-edit.ts` uses the detected convention.

The handler determines the trailing-newline convention by checking whether the raw bytes end with `\n` (or `\r\n`). The post-edit reassembly preserves that convention: a file that ended with one newline still ends with one; a file that did not, still does not. FR-014 and FR-015 are satisfied at this layer, independently of the placement mode.

## Success response envelope

The response is a JSON object with five top-level fields:

```typescript
interface PatchHeadingOutput {
  path: string;            // Vault-relative path of the note that was patched (echo for write-verification)
  vault: string;           // Vault display name (resolved from input.vault or focused-vault default)
  heading_path: string;    // The supplied heading_path, echoed back verbatim
  mode: "append" | "prepend" | "replace";
  bytes_written: number;   // Total bytes written to disk (post-edit file size in UTF-8 bytes)
}
```

Strict (`.strict()` per cohort convention). Unknown fields would be a wrapper-internal invariant violation surfaced as `INTERNAL_ERROR`.

Type alias: `type PatchHeadingOutput = z.infer<typeof patchHeadingOutputSchema>`.

### Field semantics

- **`path`** — Vault-relative path. For `target_mode: "specific"`, byte-identical to the input's `file` or `path` (the input field whichever was supplied). For `target_mode: "active"`, the focused-file path returned by the pre-write eval.
- **`vault`** — Vault display name. For `target_mode: "specific"`, byte-identical to the input's `vault`. For `target_mode: "active"`, the display name corresponding to the focused-file's vault root (looked up in the vault registry by the `base` field of the pre-write eval response).
- **`heading_path`** — Echoed verbatim from the input.
- **`mode`** — Echoed verbatim from the input.
- **`bytes_written`** — The size of the final file content in UTF-8 bytes (the byte count passed to `fs.writeFile`). Provides a coarse confirmation signal — a near-zero value when the caller intended a substantial write is a red flag.

## Error envelope

All failures route through `UpstreamError` (`src/errors.ts`) per Constitution Principle IV. The thrown error carries `{ code, cause, details, message }` where `code` is one of the existing top-level codes — zero new top-level codes introduced (seventeen-tool zero-new-codes streak preserved post-BI-040).

### Top-level codes used

| Top-level `code`        | Origin                                | New `details.code` states introduced by this BI                                       |
|-------------------------|---------------------------------------|---------------------------------------------------------------------------------------|
| `VALIDATION_ERROR`      | Zod schema validation                 | `INVALID_HEADING_PATH` (new, 5 sub-reasons); `EMPTY_CONTENT` (new, 2 sub-reasons)     |
| `CLI_REPORTED_ERROR`    | wrapper + cli-adapter                 | `HEADING_NOT_FOUND` (new); `HEADING_RACE` (new); `EXTERNAL_EDITOR_CONFLICT` (new, 2 sub-reasons) |
| `PATH_ESCAPES_VAULT`    | ADR-009 / path-safety                 | reused unchanged                                                                       |
| `FS_WRITE_FAILED`       | ADR-009 substrate                     | reused unchanged — fires for generic `fs.writeFile` / `fs.rename` failures (ENOSPC, EACCES, EROFS, etc.) not classified as `EXTERNAL_EDITOR_CONFLICT` |
| `VAULT_NOT_FOUND`       | vault-registry                        | reused unchanged                                                                       |
| `ERR_NO_ACTIVE_FILE`    | cohort active-mode (write_note lineage) | reused unchanged for FR-008                                                          |
| `INTERNAL_ERROR`        | wrapper invariant violation           | reused unchanged                                                                       |

### New `details.code` sub-discriminator map

| `details.code`              | Under `code`         | `details.reason` sub-states                                                          | Driving FR  |
|-----------------------------|----------------------|--------------------------------------------------------------------------------------|-------------|
| `INVALID_HEADING_PATH`      | `VALIDATION_ERROR`   | `empty`, `empty-segment`, `contains-hash`, `single-segment`, `too-long`              | FR-018      |
| `EMPTY_CONTENT`             | `VALIDATION_ERROR`   | `append`, `prepend`                                                                  | FR-018a     |
| `HEADING_NOT_FOUND`         | `CLI_REPORTED_ERROR` | — (single state)                                                                     | FR-017      |
| `HEADING_RACE`              | `CLI_REPORTED_ERROR` | — (single state)                                                                     | FR-019      |
| `EXTERNAL_EDITOR_CONFLICT`  | `CLI_REPORTED_ERROR` | `unsaved-changes`, `file-locked`                                                     | FR-021      |

### Error-envelope payload conventions

Every thrown `UpstreamError` carries a `details` record with at minimum the `details.code` discriminator. Additionally:

- `INVALID_HEADING_PATH` carries `details.value_length: number` (UTF-16 length of the offending input) for `"too-long"` triage, and `details.segment_index: number` (0-indexed position of the offending segment) for `"empty-segment"` triage. For `"single-segment"`, no extra field. For `"contains-hash"`, no extra field (the schema-level split prevents this case in practice; it remains as a defensive sentinel).
- `EMPTY_CONTENT` carries `details.mode: "append" | "prepend"` echoing the mode that arrived with empty content.
- `HEADING_NOT_FOUND` carries `details.heading_path` (the supplied path) and `details.path` (the vault-relative note path) for caller cross-reference.
- `HEADING_RACE` carries `details.heading_path`, `details.path`, `details.original_identity` and `details.current_identity` (both `HeadingIdentity` 3-tuples) so the caller can see what changed.
- `EXTERNAL_EDITOR_CONFLICT` carries `details.reason` (`"file-locked"` or `"unsaved-changes"`), `details.path` (the locked file's vault-relative path), and `details.errno` (the underlying OS errno string, e.g. `"EBUSY"`, `"EPERM"`).

The `cause` field carries the original thrown value (e.g., a `fs.rename` error for `EXTERNAL_EDITOR_CONFLICT`, the resolved `HeadingIdentity` mismatch for `HEADING_RACE` with `null` as the JS cause, the Zod error for `INVALID_HEADING_PATH`) per Principle IV.

## Entities

- **Note** — Markdown file inside the vault, addressed by `path` + `vault`. Carries an optional YAML frontmatter block (not touched by this tool per FR-016) followed by a body of headings, body text, fenced code blocks, and other markdown constructs. Has a line-ending convention (LF or CRLF) and a trailing-newline convention (present or absent) that the wrapper preserves.
- **Heading** — ATX-style heading line (one to six `#` characters at the start of a non-fence line, followed by a single space and the heading text). Has a `rank` (1..6) and a `text` (line bytes minus the marker characters and the separator space). Defines a `reach` (lines from its marker through to the next equal-or-higher-rank heading or EOF) and a `directBody` (lines from its marker through to the first child heading or, if no child exists, the same boundary as `reach`).
- **Heading path** — Composed string with segments joined by the literal `#` character per FR-004. Identifies a unique target heading by walking the note's heading hierarchy. Subject to FR-006 first-match-wins on duplicate sibling text.
- **Heading identity** — 3-tuple `(markerLineText, rank, parentChainText)` carried from the initial walk to the pre-write re-walk for race detection. Distinct from heading path: a heading path is the locator the caller supplies; a heading identity is the wrapper-computed fingerprint of which heading the path resolved to.
- **Placement mode** — One of `append` (insert at end of reach, preserve everything else), `prepend` (insert immediately after marker line, preserve everything else), `replace` (swap direct body, preserve marker line + child subtrees).
- **Resolved heading** — Internal representation of a heading found by `walkHeadings`. Carries `markerLineIndex`, `markerLineText`, `rank`, `parentChainText`, `reachStartLineIndex`, `reachEndLineIndex`, `directBodyEndLineIndex`.
- **Vault** — Obsidian vault hosting the note. Resolved via `vault-registry/` (cohort parity with `write_note`).
- **Focused file** — The note currently open in the user's Obsidian editor; resolved via a small bug-safe `obsidian eval` per ADR-009. Only used when `target_mode === "active"`.
