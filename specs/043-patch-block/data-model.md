# Data Model: Patch Block (Phase 1)

**Branch**: `043-patch-block` | **Date**: 2026-05-25
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

This document specifies the input, success-response envelope, and error-envelope shapes that the `patch_block` typed tool exposes at its MCP boundary, plus the wrapper-internal block-scan algorithm and per-shape surgery semantics. The Zod schemas in [src/tools/patch_block/schema.ts](../../src/tools/patch_block/schema.ts) are the single source of truth at runtime; this document is the human-readable cross-reference.

## Input

A single Zod object built on the project's `targetModeBaseSchema` (per ADR-003), extended with `block_id` and `content` fields. Strict mode is enforced via `applyTargetModeRefinement` — unknown top-level keys are rejected at validation, producing `VALIDATION_ERROR`.

| Field         | Type                       | Required    | Constraints                                                                                                                                                                          | Validation error if violated                                                                                                                       |
|---------------|----------------------------|-------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| `target_mode` | `"specific" \| "active"`    | yes         | Discriminator per ADR-003. In `specific` mode, `vault` is required and exactly one of `file` / `path` is required. In `active` mode, none of `vault` / `file` / `path` may be supplied. | `VALIDATION_ERROR` with `details.code: "invalid_union"` or `details.code: "unrecognized_keys"` per the cohort's target-mode primitive.            |
| `vault`       | string                     | conditional | Required iff `target_mode === "specific"`. Must be non-empty; resolved via the lazy vault registry; unknown vault → `VAULT_NOT_FOUND` (cohort reuse).                                | `VAULT_NOT_FOUND` with `details.reason ∈ {"unknown", "not-open"}`                                                                                  |
| `file`        | string                     | conditional | One of `file` / `path` required iff `target_mode === "specific"`. Subject to the project's structural path-safety refinement.                                                       | `VALIDATION_ERROR` with details from `STRUCTURALLY_UNSAFE_PATH_MESSAGE`                                                                            |
| `path`        | string                     | conditional | Alternative to `file`. Same constraints as `file`.                                                                                                                                   | Same as `file`                                                                                                                                     |
| `block_id`    | string                     | yes         | Non-empty; ≤ 1000 UTF-16 code units; matches `^[A-Za-z0-9-]+$`; MUST NOT begin with `^` (caret is the wikilink delimiter, not part of the identifier per FR-001).                  | `VALIDATION_ERROR` + `details.code: "INVALID_BLOCK_ID"` + `details.reason ∈ {"empty", "contains-invalid-chars", "leading-caret", "too-long"}`     |
| `content`     | string                     | yes         | Any string including empty (FR-007 single placement mode; empty content is the legitimate "clear the body" operation, cohort parity with patch_heading FR-018a's replace-empty acceptance). | n/a — no validation rejection                                                                                                                       |

Type alias: `type PatchBlockInput = z.infer<typeof patchBlockInputSchema>`.

### Validation order

The numbered list below is a categorical inventory of the validation layers, NOT a strict temporal order across all paths. The actual temporal order depends on `target_mode`:

- **Specific mode**: Zod → Layer 2 path-safety → file read.
- **Active mode**: Zod → Active-mode eval (resolves the focused-file path so Layer 2 has a path to canonicalise) → Layer 2 path-safety → file read.

Layers:

1. **Schema-level (Zod)** — always runs first, before any filesystem access or subprocess invocation:
   1. Target-mode discriminator + cohort-standard `vault` / `file` / `path` mutual-exclusion via `applyTargetModeRefinement`.
   2. `block_id` non-empty, length cap, alphabet, and leading-caret checks via Zod refinements. All four `details.reason` sub-states fire here.
2. **Path-safety Layer 2 (canonical-path check)** — only after schema validation passes AND after the locator has been resolved (immediately after step 1 for specific mode; after step 3 for active mode). Resolves the supplied vault-relative path to an absolute filesystem path via `fs.realpath` on the parent directory and verifies `startsWith(realVaultRoot + sep)`. Violations surface as `PATH_ESCAPES_VAULT` (existing top-level code per ADR-009).
3. **Active-mode pre-write eval** — only for `target_mode === "active"`; runs between step 1 and step 2 in temporal order. A small bug-safe `obsidian eval` returns `{ base: vaultRoot, path: vaultRelativePath }` for the currently-focused file, or `path: null` if no file is focused. `null` → `ERR_NO_ACTIVE_FILE` (cohort reuse from `write_note` / `patch_heading`). Successful resolution feeds the resolved path to step 2.

No vault read, no block-id scan, and no fs.write occur before steps 1–3 complete.

## Block-scan algorithm

The wrapper-private `block-scan.ts` implements two pure functions consumed by `handler.ts`.

### `scanBlocks(content: string): BlockMatch[]`

Scans `content` once line-by-line, maintaining four pieces of state:

- **`inFrontmatter: boolean`** — enforces FR-014's "no frontmatter modification" rule explicitly at the scan layer (divergence from sibling BI-040 where frontmatter enforcement is incidental-only). Entered when line 0 is exactly `---`; exited at the next line that is exactly `---`. Inside the frontmatter region, no `^block-id` token is bound — the scanner treats every line as opaque content. A note without leading `---` has no frontmatter region; the flag stays `false` for the whole scan.
- **`inFence: boolean`** — per the R3 fenced-code-opacity rule, toggled on any line whose lstripped form begins with ≥ 3 consecutive `` ` `` or `~`.
- **A one-line buffer for setext-heading lookahead** — when line N carries a trailing `^block-id`, the scanner buffers the candidate `BlockMatch` and reads line N+1 before emitting. If line N+1's lstripped form is all-`=` or all-`-` with ≥ 1 character and nothing else, the buffered shape promotes from `paragraph` / `list-item` to `on-heading-setext`. Otherwise the buffered shape stays as line-N's original classification.
- **A parent-block-shape tracker** — the previous-non-blank-non-fence line's shape, used for `separately-placed` classification when the current line is a standalone `^block-id` token whose preceding lines form a table / callout / blockquote / indented-code block.

For each non-frontmatter non-fence line containing a `^block-id` token matching the alphabet regex, emits a `BlockMatch` record describing the resolved marker:

```typescript
interface BlockMatch {
  blockId: string;                       // Bare identifier (no leading caret)
  shape:
    | "paragraph"                        // Trailing token on a paragraph's final line
    | "list-item"                        // Trailing token on a list-item line
    | "separately-placed"                // Standalone line immediately following a table / callout / blockquote / indented-code block
    | "on-heading-atx"                   // Trailing token on an ATX heading line (`# Heading ^foo`)
    | "on-heading-setext";               // Trailing token on the text line of a setext heading (next line is `===` or `---`)
  markerLineIndex: number;               // 0-indexed line number containing the `^block-id` token
  markerLineText: string;                // The literal marker line bytes
  // For paragraph / list-item / on-heading-atx / on-heading-setext, blockStartLineIndex === markerLineIndex.
  // For separately-placed, blockStartLineIndex is the first line of the preceding block whose marker line is markerLineIndex.
  blockStartLineIndex: number;
  // For paragraph / list-item / on-heading-atx / on-heading-setext, blockEndLineIndex === markerLineIndex.
  // For separately-placed, blockEndLineIndex is markerLineIndex - 1 (the line immediately before the marker line).
  blockEndLineIndex: number;
}
```

The setext lookahead is implemented as described above (one-line buffered classification); ditto the frontmatter scan-skip — once `inFrontmatter` is `true`, NO `BlockMatch` is emitted regardless of token content, including `^block-id` tokens that happen to appear inside YAML field values. A note where the same id appears once inside frontmatter and once in the body resolves to the BODY occurrence (first-match-wins applies only over the bound matches; frontmatter matches are never bound).

Pure; deterministic; O(lines).

### `findBlock(content: string, blockId: string): BlockMatch | null`

Calls `scanBlocks(content)` and returns the **first** `BlockMatch` whose `blockId === blockId` per FR-002a (first-match-wins on duplicate ids). Returns `null` if no match exists; the handler converts `null` to a `BLOCK_NOT_FOUND` `UpstreamError`.

### First-match-wins rule (FR-002a)

When the same `block_id` appears more than once in a single note (whether through authoring error or imported content), `findBlock` returns the first occurrence in document order — cohort parity with `patch_heading` FR-006. The contract is documented in tool help and is part of the published behaviour.

## Block-edit algorithm

The wrapper-private `block-edit.ts` implements two pure functions, one per surgery family (one for paragraph + list-item shapes which share the detach-token-swap-reattach mechanic; one for separately-placed shapes which preserve the marker line verbatim).

### `applyDetachReattach(lines: string[], match: BlockMatch, content: string): string[]`

For `match.shape ∈ {"paragraph", "list-item"}` per FR-008 / FR-009. The marker line at `match.markerLineIndex` ends with the trailing `^block-id` token (preceded by a single ASCII space). The surgery:

1. Compute the marker-line prefix: everything from the start of the line up to (but not including) the final ` ^<blockId>` substring.
2. For `shape === "paragraph"`: replace the marker line in `lines` with `<content> ^<blockId>`. If `content` is multi-line, the marker line becomes multiple lines with the marker token appended to the last line.
3. For `shape === "list-item"`: the marker-line prefix is the list-item marker bytes plus indentation plus the item content's leading bytes; replace the marker line with `<list-marker-and-indent><content> ^<blockId>`. The wrapper preserves the leading bytes (the list marker `-` / `*` / `+` / `\d+.` and any indentation) byte-stably.
4. The marker token retains its conventional position (trailing on the line / final line of the new content) with a single ASCII-space separator.

For empty `content`, the marker line becomes `<list-marker-and-indent> ^<blockId>` (for list-item shape) or ` ^<blockId>` (for paragraph shape — a single space followed by the marker token, since the body is empty); both forms preserve the marker per the spec contract while emitting a structurally-empty body.

### `applyVerbatimMarkerPreserve(lines: string[], match: BlockMatch, content: string): string[]`

For `match.shape === "separately-placed"` per FR-010. The marker line at `match.markerLineIndex` is preserved verbatim (its bytes are unchanged). The surgery replaces the block lines at `lines[match.blockStartLineIndex .. match.blockEndLineIndex + 1]` with the new `content` (split on `\n` if multi-line). The marker line's position relative to the block is preserved: it remains on the line immediately following the (possibly resized) block.

### Block-on-heading short-circuit

For `match.shape ∈ {"on-heading-atx", "on-heading-setext"}`, no surgery function is called. The handler short-circuits to a `BLOCK_ON_HEADING` `UpstreamError` per FR-019a, naming the resolved `block_id` and the file path. The file on disk is NOT modified.

### Line-ending and trailing-newline preservation

The handler determines the file's line-ending convention by inspecting the raw bytes returned from `fs.readFile`: if the file contains any `\r\n`, the convention is CRLF; otherwise LF. The split-and-join in `block-edit.ts` uses the detected convention.

The handler determines the trailing-newline convention by checking whether the raw bytes end with `\n` (or `\r\n`). The post-edit reassembly preserves that convention: a file that ended with one newline still ends with one; a file that did not, still does not. FR-012 and FR-013 are satisfied at this layer, independently of the block shape.

## Success response envelope

The response is a JSON object with five top-level fields:

```typescript
interface PatchBlockOutput {
  path: string;            // Vault-relative path of the note that was patched (echo for write-verification)
  vault: string;           // Vault display name (resolved from input.vault or focused-vault default)
  block_id: string;        // The matched block-id (bare identifier, echoed back)
  block_shape: "paragraph" | "list-item" | "separately-placed";  // Which surgery mechanic was applied
  bytes_written: number;   // Total bytes written to disk (post-edit file size in UTF-8 bytes)
}
```

Strict (`.strict()` per cohort convention). Unknown fields would be a wrapper-internal invariant violation surfaced as `INTERNAL_ERROR`.

Type alias: `type PatchBlockOutput = z.infer<typeof patchBlockOutputSchema>`.

### Field semantics

- **`path`** — Vault-relative path. For `target_mode: "specific"`, byte-identical to the input's `file` or `path` (whichever was supplied). For `target_mode: "active"`, the focused-file path returned by the pre-write eval.
- **`vault`** — Vault display name. For `target_mode: "specific"`, byte-identical to the input's `vault`. For `target_mode: "active"`, the display name corresponding to the focused-file's vault root (looked up in the vault registry by the `base` field of the pre-write eval response).
- **`block_id`** — Echoed verbatim from the input (bare identifier, no leading caret).
- **`block_shape`** — One of three success shapes — paragraph, list-item, separately-placed. The on-heading shapes never appear in the success envelope because they short-circuit to `BLOCK_ON_HEADING`.
- **`bytes_written`** — The size of the final file content in UTF-8 bytes (the byte count passed to `fs.writeFile`). Coarse confirmation signal — a near-zero value when the caller intended a substantial write is a red flag.

## Error envelope

All failures route through `UpstreamError` (`src/errors.ts`) per Constitution Principle IV. The thrown error carries `{ code, cause, details, message }` where `code` is one of the existing top-level codes — zero new top-level codes introduced (eighteen-tool zero-new-codes streak preserved post-BI-043).

### Top-level codes used

| Top-level `code`        | Origin                                | New `details.code` states introduced by this BI                                       |
|-------------------------|---------------------------------------|---------------------------------------------------------------------------------------|
| `VALIDATION_ERROR`      | Zod schema validation                 | `INVALID_BLOCK_ID` (new, 4 sub-reasons)                                                |
| `CLI_REPORTED_ERROR`    | wrapper + cli-adapter                 | `BLOCK_NOT_FOUND` (new); `BLOCK_ON_HEADING` (new); plus reuse of `NOTE_NOT_FOUND` (existing read-side cohort discriminator) and `EXTERNAL_EDITOR_CONFLICT` (existing from BI-040, full 2-sub-reason enum inherited byte-stably) |
| `PATH_ESCAPES_VAULT`    | ADR-009 / path-safety                 | reused unchanged                                                                       |
| `FS_WRITE_FAILED`       | ADR-009 substrate                     | reused unchanged — fires for generic `fs.writeFile` / `fs.rename` failures (ENOSPC, EACCES, EROFS, etc.) not classified as `EXTERNAL_EDITOR_CONFLICT` |
| `VAULT_NOT_FOUND`       | vault-registry                        | reused unchanged                                                                       |
| `ERR_NO_ACTIVE_FILE`    | cohort active-mode (write_note lineage) | reused unchanged for FR-006                                                          |
| `INTERNAL_ERROR`        | wrapper invariant violation           | reused unchanged                                                                       |

### New `details.code` sub-discriminator map

| `details.code`              | Under `code`         | `details.reason` sub-states                                                          | Driving FR  |
|-----------------------------|----------------------|--------------------------------------------------------------------------------------|-------------|
| `INVALID_BLOCK_ID`          | `VALIDATION_ERROR`   | `empty`, `contains-invalid-chars`, `leading-caret`, `too-long`                       | FR-019      |
| `BLOCK_NOT_FOUND`           | `CLI_REPORTED_ERROR` | — (single state)                                                                     | FR-017      |
| `BLOCK_ON_HEADING`          | `CLI_REPORTED_ERROR` | — (single state)                                                                     | FR-019a     |
| `NOTE_NOT_FOUND`            | `CLI_REPORTED_ERROR` | — (single state, reused from read-side cohort)                                       | FR-018      |
| `EXTERNAL_EDITOR_CONFLICT`  | `CLI_REPORTED_ERROR` | `unsaved-changes`, `file-locked` (inherited byte-stably from BI-040)                 | FR-021      |

### Error-envelope payload conventions

Every thrown `UpstreamError` carries a `details` record with at minimum the `details.code` discriminator. Additionally:

- `INVALID_BLOCK_ID` carries `details.value_length: number` (UTF-16 length of the offending input) for `"too-long"` triage, and `details.offending_index: number` (0-indexed position of the first invalid character) for `"contains-invalid-chars"` triage. For `"empty"` and `"leading-caret"`, no extra field.
- `BLOCK_NOT_FOUND` carries `details.block_id` (the supplied id) and `details.path` (the vault-relative note path) for caller cross-reference.
- `BLOCK_ON_HEADING` carries `details.block_id`, `details.path`, and `details.heading_shape ∈ {"atx", "setext"}` so the caller knows which routing path to take (both shapes route to `patch_heading`, but the routing hint helps callers that want to surface a shape-aware message).
- `NOTE_NOT_FOUND` carries `details.path` and `details.vault` for caller cross-reference (cohort parity).
- `EXTERNAL_EDITOR_CONFLICT` carries `details.reason` (`"file-locked"` or `"unsaved-changes"`), `details.path` (the locked file's vault-relative path), and `details.errno` (the underlying OS errno string, e.g. `"EBUSY"`, `"EPERM"`). Inherits the BI-040 classification byte-stably.

The `cause` field carries the original thrown value (e.g., a `fs.rename` error for `EXTERNAL_EDITOR_CONFLICT`, the Zod error for `INVALID_BLOCK_ID`) per Principle IV.

## Entities

- **Note** — Markdown file inside the vault, addressed by `path` + `vault`. Carries an optional YAML frontmatter block (not touched by this tool per FR-014) followed by a body of paragraphs, lists, tables, fenced code, callouts, and other markdown constructs. Has a line-ending convention (LF or CRLF) and a trailing-newline convention (present or absent) that the wrapper preserves.
- **Block reference** — Obsidian anchor formed by a `^block-id` token attached to a specific block in a note's body. Survives heading renames, list-item reordering, and table edits. The convention by which the marker attaches to its block depends on the block shape (paragraph / list-item: trailing token on the line; table / callout / blockquote / indented-code: on a separate line immediately following the block; ATX heading: trailing token on the heading line; setext heading: trailing token on the heading-text line whose next line is `===` or `---`).
- **Block-id** — Bare identifier portion of a block reference (the substring following the `^` delimiter). Alphanumeric + hyphen, case-sensitive, ≤ 1000 UTF-16 code units. Resolves a block reference uniquely inside a single note (first-match-wins on duplicates per FR-002a).
- **Block shape** — Classification produced by `scanBlocks` for each `^block-id` match. One of `paragraph`, `list-item`, `separately-placed`, `on-heading-atx`, `on-heading-setext`. The first three drive surgery; the last two short-circuit to `BLOCK_ON_HEADING`.
- **Block match** — Internal representation of a resolved `^block-id` marker. Carries `blockId`, `shape`, `markerLineIndex`, `markerLineText`, `blockStartLineIndex`, `blockEndLineIndex`.
- **Vault** — Obsidian vault hosting the note. Resolved via `vault-registry/` (cohort parity with `write_note`, `patch_heading`).
- **Focused file** — The note currently open in the user's Obsidian editor; resolved via a small bug-safe `obsidian eval` per ADR-009. Only used when `target_mode === "active"`.
