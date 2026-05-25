# Data Model: Append Note (Phase 1)

**Branch**: `044-append-note` | **Date**: 2026-05-25
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

This document specifies the input, success-response envelope, and error-envelope shapes that the `append_note` typed tool exposes at its MCP boundary, plus the wrapper-internal separator-decide algorithm and its byte-stability invariants. The Zod schemas in [src/tools/append_note/schema.ts](../../src/tools/append_note/schema.ts) are the single source of truth at runtime; this document is the human-readable cross-reference.

## Input

A single Zod object built on the project's `targetModeBaseSchema` (per ADR-003), extended with `content` and `inline` fields plus a custom refinement on `file` for FR-001a wikilink-form bracket rejection. Strict mode is enforced via `applyTargetModeRefinement` — unknown top-level keys are rejected at validation, producing `VALIDATION_ERROR`.

| Field         | Type                       | Required    | Constraints                                                                                                                                                                          | Validation error if violated                                                                                                                       |
|---------------|----------------------------|-------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| `target_mode` | `"specific" \| "active"`    | yes         | Discriminator per ADR-003. In `specific` mode, `vault` is required and exactly one of `file` / `path` is required. In `active` mode, none of `vault` / `file` / `path` may be supplied. | `VALIDATION_ERROR` with `details.code: "invalid_union"` or `details.code: "unrecognized_keys"` per the cohort's target-mode primitive.            |
| `vault`       | string                     | conditional | Required iff `target_mode === "specific"`. Must be non-empty; resolved via the lazy vault registry; unknown vault → `VAULT_NOT_FOUND` (cohort reuse).                                | `VAULT_NOT_FOUND` with `details.reason ∈ {"unknown", "not-open"}`                                                                                  |
| `file`        | string                     | conditional | One of `file` / `path` required iff `target_mode === "specific"`. Subject to the project's structural path-safety refinement (`isStructurallySafePath`) AND a per-tool refinement rejecting `[[` / `]]` brackets (FR-001a). | `VALIDATION_ERROR` with details from `STRUCTURALLY_UNSAFE_PATH_MESSAGE` or the bracket-rejection message ("wikilink-form locator MUST NOT contain `[[` or `]]` brackets — supply the bare note name"). |
| `path`        | string                     | conditional | Alternative to `file`. Subject to the project's structural path-safety refinement. Brackets are NOT a special case under `path` (vault-relative paths can in principle contain `[` characters; brackets are a wikilink-syntax artefact only). | Same as `file` minus the bracket-rejection rule.                                                                                                   |
| `content`     | string                     | yes         | Non-empty per FR-013 (`z.string().min(1)`). No explicit max-length cap per research.md R3 (substrate-bounded).                                                                       | `VALIDATION_ERROR` + `details.code: "CONTENT_EMPTY"` when the supplied content is the empty string (per ADR-015 single-state sub-discriminator).  |
| `inline`      | boolean (default `false`)   | no          | Optional; defaults to `false`. When `true`, the wrapper writes `content` immediately after the file's existing trailing byte with NO separator inserted (FR-007). When `false`, the wrapper applies the FR-006 / FR-006a default-separator rule. | n/a — no validation rejection                                                                                                                       |

Type alias: `type AppendNoteInput = z.infer<typeof appendNoteInputSchema>`.

### Validation order

The numbered list below is a categorical inventory of the validation layers, NOT a strict temporal order across all paths. The actual temporal order depends on `target_mode`:

- **Specific mode**: Zod → Layer 2 path-safety → file read.
- **Active mode**: Zod → Active-mode eval (resolves the focused-file path so Layer 2 has a path to canonicalise) → Layer 2 path-safety → file read.

Layers:

1. **Schema-level (Zod)** — always runs first, before any filesystem access or subprocess invocation:
   1. Target-mode discriminator + cohort-standard `vault` / `file` / `path` mutual-exclusion via `applyTargetModeRefinement`.
   2. `content` non-empty check via `z.string().min(1)`. The `CONTENT_EMPTY` `details.code` is surfaced when this fails.
   3. `file` wikilink-form bracket-rejection refinement (FR-001a) — composed with `isStructurallySafePath`.
   4. `path` structural-path-safety refinement (`isStructurallySafePath`).
   5. `inline` boolean type check.
2. **Path-safety Layer 2 (canonical-path check)** — only after schema validation passes AND after the locator has been resolved (immediately after step 1 for specific mode; after step 3 for active mode). Resolves the supplied vault-relative path to an absolute filesystem path via `fs.realpath` on the parent directory and verifies `startsWith(realVaultRoot + sep)`. Violations surface as `PATH_ESCAPES_VAULT` (existing top-level code per ADR-009).
3. **Active-mode pre-write eval** — only for `target_mode === "active"`; runs between step 1 and step 2 in temporal order. A small bug-safe `obsidian eval` returns `{ base: vaultRoot, path: vaultRelativePath }` for the currently-focused file, or `path: null` if no file is focused. `null` → `ERR_NO_ACTIVE_FILE` (cohort reuse from `write_note` / `patch_heading` / `patch_block`). Successful resolution feeds the resolved path to step 2.

No vault read, no append-edit, and no fs.write occur before steps 1–3 complete.

## Append-edit algorithm

The wrapper-private `append-edit.ts` implements one pure function consumed by `handler.ts`.

### `appendEdit(existing: string, content: string, inline: boolean): string`

Pure; deterministic; ~30-40 LOC. Returns the post-edit file content as a single string.

```text
appendEdit(existing, content, inline):
  // FR-007 — inline opt-in overrides everything else
  if inline === true:
    return existing + content

  // FR-009 — 0-byte file → no leading separator
  if existing.length === 0:
    return content

  // FR-006a — existing trailing line break IS the separator
  if existing endsWith "\r\n":
    return existing + content
  if existing endsWith "\n":
    return existing + content

  // FR-006 — file ends on non-newline; insert separator matching existing convention
  separator = detectLineEnding(existing)    // "\r\n" if any CRLF present, "\n" otherwise
  return existing + separator + content
```

```text
detectLineEnding(existing):
  // Scan for the first newline in the file; report its convention.
  for i in 0..existing.length - 1:
    if existing[i] === "\n":
      if i > 0 AND existing[i-1] === "\r":
        return "\r\n"
      return "\n"
  // No newline anywhere — default to POSIX "\n"
  return "\n"
```

**Byte-stability invariants** (enforced by the algorithm + verified by `append-edit.test.ts`):

- **FR-010 (prior content byte-stable)**: `appendEdit(existing, content, inline).startsWith(existing)` for all inputs. The algorithm only appends bytes; it never inserts, replaces, or removes bytes from `existing`.
- **FR-010a (content verbatim)**: Wherever `content` appears in the output, it appears byte-for-byte identical to the input. No trim, no normalise, no auto-appended trailing newline.
- **FR-008 (line-ending preservation)**: Any separator the algorithm inserts under the default-separator branch matches the convention `detectLineEnding(existing)` returns. The convention is taken from the file's own bytes; the wrapper never introduces a foreign convention.
- **FR-011 (frontmatter immutable)**: The algorithm never inspects or modifies the file's leading bytes. YAML frontmatter (if present) sits at the file head and is preserved verbatim by the `startsWith(existing)` invariant.

The algorithm is testable as a table-driven pure-function suite across the 8 input shapes (4 file-tail shapes × 2 inline states) without any fs or process mocking. The `append-edit.test.ts` suite documented in plan.md ships these cases plus the content-verbatim invariant.

## Output

```typescript
interface AppendNoteOutput {
  path: string;            // Vault-relative path of the note that was written
  vault: string;           // Vault display name (resolved from input.vault or active-mode eval)
  bytes_written: number;   // Total bytes the wrapper wrote in this call (post-edit file size minus pre-edit file size)
  inline: boolean;         // Echo of the inline mode actually applied (helps callers confirm the intended mode landed)
}
```

`path` is ALWAYS the canonical vault-relative path of the written file, regardless of which locator shape the caller supplied (FR-003 canonicalisation). A caller who supplied `file: "My Note"` receives `path: "My Note.md"` (or whatever shortform-resolution yields) in the response.

`bytes_written` is the delta — pre-call file size subtracted from post-call file size. For a default-separator append against a 100-byte file with 50 bytes of new content, `bytes_written` is either 51 (one byte of separator inserted) or 50 (file already ended in `\n` and FR-006a's "existing trailing line break IS the separator" applied). For inline opt-in or 0-byte file cases, `bytes_written === content.length` exactly.

`inline` echoes the mode that the wrapper actually applied. For default calls (no `inline` in input or `inline: false`), the field is `false` in the response. For `inline: true` input, the field is `true` in the response.

## Error envelope

All errors route through `UpstreamError` per Constitution Principle IV. Detailed mapping is in [contracts/errors.md](./contracts/errors.md). Summary:

| Top-level `code`       | `details.code` (when applicable)  | Origin                                                                                |
|------------------------|-----------------------------------|---------------------------------------------------------------------------------------|
| `VALIDATION_ERROR`     | `CONTENT_EMPTY` (NEW, single state) | FR-013 — empty content                                                              |
| `VALIDATION_ERROR`     | n/a (Zod issue path)              | FR-001 / FR-014 / FR-015 — target-mode / locator-mutex / unknown-extra-field / bracket-rejection |
| `CLI_REPORTED_ERROR`   | `NOTE_NOT_FOUND` (reused)         | FR-016 — fs.readFile ENOENT                                                          |
| `CLI_REPORTED_ERROR`   | `EXTERNAL_EDITOR_CONFLICT` (reused, 2-sub-reason enum) | FR-022 — substrate-signalled                                            |
| `PATH_ESCAPES_VAULT`   | n/a                               | ADR-009 / Layer 2 canonical-path check                                                |
| `FS_WRITE_FAILED`      | n/a                               | ADR-009 substrate — non-ENOENT non-EBUSY fs errors                                    |
| `VAULT_NOT_FOUND`      | n/a                               | vault-registry — unknown vault                                                        |
| `ERR_NO_ACTIVE_FILE`   | n/a                               | FR-004 — active-mode no focused file                                                  |

Zero new top-level error codes; one new `details.code` value (`CONTENT_EMPTY`). Constitution Principle IV streak preserved — count becomes nineteen tools post-BI-044.

## Key entities (cross-reference to spec)

- **Note**: addressed by vault-relative path / wikilink-form name / focused-note locator. Resolved canonically into `path: string` in the output.
- **Append content**: the `content` field of the input. Must be non-empty (FR-013). Preserved verbatim in the output file (FR-010a).
- **Default separator**: inserted between prior content and new content under the default-separator branch of `appendEdit`. Bytes match the file's existing line-ending convention (FR-008). Absent when the file ends in `\n` / `\r\n` (FR-006a) or is 0 bytes (FR-009).
- **Inline opt-in**: the `inline` boolean field. Default `false`. When `true`, suppresses the wrapper-inserted separator (FR-007).
- **Focused note**: resolved at request time via the cohort's `FOCUSED_FILE_TEMPLATE` eval. Absent → `ERR_NO_ACTIVE_FILE` (FR-004).
