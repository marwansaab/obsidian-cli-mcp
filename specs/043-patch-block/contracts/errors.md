# Error Contract: patch_block

**Branch**: `043-patch-block` | **Date**: 2026-05-25
**Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Data Model**: [../data-model.md](../data-model.md)

This document is the agent-facing error contract for the `patch_block` typed MCP tool. Every failure mode routes through `UpstreamError` per Constitution Principle IV. All errors use existing top-level codes — zero new top-level codes introduced (eighteen-tool zero-new-codes streak preserved post-BI-043).

## Top-level code summary

| Top-level `code`         | Origin                                  | New `details.code` states introduced by this BI                                       |
|--------------------------|-----------------------------------------|---------------------------------------------------------------------------------------|
| `VALIDATION_ERROR`       | Zod / schema validation                 | `INVALID_BLOCK_ID` (4 sub-reasons)                                                     |
| `CLI_REPORTED_ERROR`     | wrapper + cli-adapter                   | `BLOCK_NOT_FOUND` (single state); `BLOCK_ON_HEADING` (single state); plus reuse of `NOTE_NOT_FOUND` (existing read-side cohort discriminator) and `EXTERNAL_EDITOR_CONFLICT` (inherited from BI-040, 2 sub-reasons byte-stably) |
| `PATH_ESCAPES_VAULT`     | ADR-009 / path-safety                   | reused unchanged                                                                       |
| `FS_WRITE_FAILED`        | ADR-009 substrate                       | reused unchanged                                                                       |
| `VAULT_NOT_FOUND`        | vault-registry                          | reused unchanged                                                                       |
| `ERR_NO_ACTIVE_FILE`     | cohort active-mode (write_note lineage) | reused unchanged for FR-006                                                            |
| `INTERNAL_ERROR`         | wrapper invariant violation             | reused unchanged                                                                       |

## VALIDATION_ERROR errors

These fire at the input-validation boundary BEFORE any filesystem access, subprocess invocation, or vault registry lookup.

### `INVALID_BLOCK_ID`

The supplied `block_id` is structurally malformed. Four mutually-exclusive sub-reasons.

| `details.reason`            | Meaning                                                                                                       | Example caller payload                       | Caller remediation                                                                            |
|-----------------------------|---------------------------------------------------------------------------------------------------------------|----------------------------------------------|-----------------------------------------------------------------------------------------------|
| `empty`                     | `block_id` is the empty string                                                                                | `{ block_id: "" }`                           | Supply a non-empty identifier matching `^[A-Za-z0-9-]+$`                                       |
| `contains-invalid-chars`    | `block_id` contains characters outside the alphanumeric + hyphen-minus alphabet                               | `{ block_id: "block_one" }` (underscore), `{ block_id: "v1.2" }` (period) | Replace with an alphabet-conforming id; common alternatives: hyphen for underscore, drop punctuation |
| `leading-caret`             | `block_id` begins with `^` (the caret is the wikilink delimiter, not part of the identifier)                  | `{ block_id: "^foo" }`                       | Drop the leading `^` and supply just the bare identifier                                       |
| `too-long`                  | The `block_id` string exceeds 1000 UTF-16 code units                                                          | `{ block_id: "..." /* >1000 chars */ }`      | Use a shorter identifier; typical block-ids are 4–40 chars                                     |

Additional details: `details.value_length: number` (for `too-long`); `details.offending_index: number` (0-indexed position of the first invalid character, for `contains-invalid-chars`).

## CLI_REPORTED_ERROR errors

These fire after schema validation but before, during, or after the actual fs operations. The wrapper catches them and classifies via the `details.code` discriminator.

### `BLOCK_NOT_FOUND`

The supplied `block_id` does not match any eligible `^block-id` marker in the target note (FR-017). Single state — no `details.reason`. Includes the case where the id appears only inside a fenced code block (FR-011 — fenced-code markers are content, not eligible targets, so the scanner does not bind them).

Additional details: `details.block_id: string` (the supplied id); `details.path: string` (the vault-relative note path).

Caller remediation: Verify the block-id against the note's actual `^block-id` markers. Use `read` to inspect the note and find the intended marker. Remember that matching is case-sensitive (FR-003) and that markers inside fenced code blocks are NOT eligible targets — if your id only appears inside a fence, the wrapper will not bind it.

### `BLOCK_ON_HEADING`

The supplied `block_id` resolves to a `^block-id` marker attached to a heading line — ATX (`# Heading ^foo`) or setext (`Heading\n=== ^foo`) — and patching the heading's marker line is out of scope for this tool per FR-019a. The file on disk was NOT modified.

Additional details: `details.block_id: string`; `details.path: string`; `details.heading_shape: "atx" | "setext"` (which heading shape the marker is attached to — both route to `patch_heading`; the shape hint helps callers surface a shape-aware message).

Caller remediation: Route the request to `patch_heading` instead. The `patch_heading` tool's `replace` mode rewrites a heading's section body without touching the heading marker line — that is the right surface for heading-anchored edits.

### `NOTE_NOT_FOUND`

The supplied path does not correspond to an existing note in the vault (FR-018). Reused from the read-side cohort (`read`, `read_heading`, `outline`) — same `details.code` value, same payload shape. No note was created.

Additional details: `details.path: string`; `details.vault: string`.

Caller remediation: Verify the path against the vault contents. Use `list_files` to enumerate notes in the directory.

### `EXTERNAL_EDITOR_CONFLICT`

The reliable-writer substrate signalled that the target note is held open by an external editor in a way that prevents the write (FR-021). The file on disk was NOT modified. Inherited byte-stably from BI-040's classification.

| `details.reason`    | Meaning                                                                                                  | Caller remediation                                                  |
|---------------------|----------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------|
| `file-locked`       | The OS-level `fs.rename` or `fs.writeFile` failed with EBUSY / EPERM / EACCES indicating the file is open with non-shared-delete access (typical on Windows when an editor holds the file) | Save and close the file in the external editor, then retry. Or coordinate with the user holding the file. |
| `unsaved-changes`   | (Reserved per BI-040 for a future detection mechanism — currently unused but encoded in the schema for forward compatibility per ADR-015's multi-state-from-day-one preference) | Same as `file-locked`                                               |

Additional details: `details.path: string`; `details.errno: string` (the underlying OS errno, e.g. `"EBUSY"`, `"EPERM"`, `"EACCES"`).

**Detection-capability caveat**: On platforms or scenarios where the substrate cannot detect the unsaved-changes condition (Linux / macOS for editors that hold dirty state in-memory only), the edit lands on disk and the editor sees a refreshed file on next focus — no `EXTERNAL_EDITOR_CONFLICT` fires. This is unavoidable given the substrate has no signal to fail on. Inherited verbatim from BI-040 R6.

## Reused top-level codes

### `PATH_ESCAPES_VAULT`

Surfaces unchanged per ADR-009 when the supplied path's canonical resolution escapes the vault root (e.g., via a symlink). Identical behaviour to `write_note` / `patch_heading`.

Additional details: `details.vault: string`; `details.attemptedPath: string`; `details.resolvedPath: string`.

### `FS_WRITE_FAILED`

Surfaces unchanged per ADR-009 for generic `fs.writeFile` / `fs.rename` failures NOT classified as `EXTERNAL_EDITOR_CONFLICT`. Examples: ENOSPC (disk full), EACCES (permission denied on parent dir), EROFS (read-only filesystem). The wrapper distinguishes EXTERNAL_EDITOR_CONFLICT (specific errno set on a previously-readable file) from FS_WRITE_FAILED (any other fs error).

Additional details: `details.errno: string`; `details.path: string`.

### `VAULT_NOT_FOUND`

Surfaces unchanged when the supplied `vault` (in specific mode) is unknown to the vault registry or is registered-but-not-open. Identical behaviour to every other typed tool with a `vault` parameter.

Additional details: `details.vault: string`; `details.reason: "unknown" | "not-open"`.

### `ERR_NO_ACTIVE_FILE`

Surfaces unchanged when `target_mode === "active"` but no file is focused in the user's Obsidian editor (FR-006). Identical top-level code to `write_note`'s / `patch_heading`'s active-mode failure. Note this is a TOP-LEVEL code in the cohort (not a `details.code` sub-discriminator) — the cohort precedent predates the ADR-015 sub-discriminator pattern and is preserved as-is per Principle IV's "no new top-level codes" rule and the spec's clarification that this BI reuses the existing active-mode cohort discriminator unchanged.

Additional details: `details: {}` (no further structured payload — the error message names the remediation: "Open a note in the editor, or call patch_block with target_mode=specific + vault + file/path.").

### `INTERNAL_ERROR`

Surfaces unchanged on wrapper invariant violation (e.g., the output schema's `.strict()` parse rejects the assembled response). This should be unreachable in correct code; if it fires, it is a wrapper bug.

Additional details: vary by site of failure; carry `details.stage: string` naming the wrapper-internal step that failed.

## Failure-mode decision tree (caller-side switch site)

```typescript
try {
  const result = await callTool("patch_block", input);
  // success — write landed; result.block_shape tells you which surgery mechanic the wrapper applied;
  // result.bytes_written tells you roughly how big the post-edit file is
} catch (err) {
  if (err.code === "VALIDATION_ERROR") {
    switch (err.details.code) {
      case "INVALID_BLOCK_ID":
        // err.details.reason tells you which sub-state — fix the block_id input
        break;
      default:
        // Generic Zod issue (target_mode discriminator, unrecognized_keys, etc.)
    }
  } else if (err.code === "CLI_REPORTED_ERROR") {
    switch (err.details.code) {
      case "BLOCK_NOT_FOUND":
        // err.details.block_id and err.details.path tell you where you looked
        // Note: a block_id that appears only inside a fenced code block surfaces here too,
        // because fenced-code markers are content (FR-011), not eligible targets.
        break;
      case "BLOCK_ON_HEADING":
        // err.details.heading_shape ("atx" | "setext") hints at the routing message
        // Switch the call to patch_heading with replace mode
        break;
      case "NOTE_NOT_FOUND":
        // err.details.path doesn't exist in the vault — verify the path
        break;
      case "EXTERNAL_EDITOR_CONFLICT":
        // err.details.reason and err.details.errno tell you why
        // Coordinate with the user holding the file open
        break;
      case "VAULT_NOT_FOUND":
        // err.details.reason: "unknown" | "not-open"
        break;
      default:
        // Other cli-adapter classifications (json-parse, envelope-parse, etc.)
    }
  } else if (err.code === "PATH_ESCAPES_VAULT") {
    // err.details.attemptedPath escaped the vault root — fix the path
  } else if (err.code === "FS_WRITE_FAILED") {
    // err.details.errno tells you the OS-level cause
  } else if (err.code === "ERR_NO_ACTIVE_FILE") {
    // No file focused in Obsidian — focus a note or switch to target_mode="specific"
  } else if (err.code === "INTERNAL_ERROR") {
    // Wrapper bug — file an issue with err.details.stage
  }
}
```
