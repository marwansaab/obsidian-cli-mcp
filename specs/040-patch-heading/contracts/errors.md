# Error Contract: patch_heading

**Branch**: `040-patch-heading` | **Date**: 2026-05-21
**Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Data Model**: [../data-model.md](../data-model.md)

This document is the agent-facing error contract for the `patch_heading` typed MCP tool. Every failure mode routes through `UpstreamError` per Constitution Principle IV. All errors use existing top-level codes — zero new top-level codes introduced (seventeen-tool zero-new-codes streak preserved post-BI-040).

## Top-level code summary

| Top-level `code`         | Origin                                  | New `details.code` states introduced by this BI                                      |
|--------------------------|-----------------------------------------|--------------------------------------------------------------------------------------|
| `VALIDATION_ERROR`       | Zod / schema validation                 | `INVALID_HEADING_PATH` (5 sub-reasons); `EMPTY_CONTENT` (2 sub-reasons)               |
| `CLI_REPORTED_ERROR`     | wrapper + cli-adapter                   | `HEADING_NOT_FOUND` (single state); `HEADING_RACE` (single state); `EXTERNAL_EDITOR_CONFLICT` (2 sub-reasons) |
| `PATH_ESCAPES_VAULT`     | ADR-009 / path-safety                   | reused unchanged                                                                      |
| `FS_WRITE_FAILED`        | ADR-009 substrate                       | reused unchanged                                                                      |
| `VAULT_NOT_FOUND`        | vault-registry                          | reused unchanged                                                                      |
| `ERR_NO_ACTIVE_FILE`     | cohort active-mode (write_note lineage) | reused unchanged for FR-008                                                           |
| `INTERNAL_ERROR`         | wrapper invariant violation             | reused unchanged                                                                      |

## VALIDATION_ERROR errors

These fire at the input-validation boundary BEFORE any filesystem access, subprocess invocation, or vault registry lookup.

### `INVALID_HEADING_PATH`

The supplied `heading_path` is structurally malformed. Five mutually-exclusive sub-reasons.

| `details.reason`     | Meaning                                                                                                                 | Example caller payload                                  | Caller remediation                                                                  |
|----------------------|-------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------|-------------------------------------------------------------------------------------|
| `empty`              | `heading_path` is the empty string                                                                                      | `{ heading_path: "" }`                                  | Supply a non-empty path with at least two segments                                  |
| `empty-segment`      | After splitting on `#`, at least one segment is empty (caused by `##`, leading `#`, or trailing `#`)                    | `{ heading_path: "Top##Sub" }`, `{ heading_path: "#Sub" }` | Remove the empty segment; ensure no `##` and no leading/trailing `#`                |
| `contains-hash`      | A segment after splitting contains `#` (defensive sentinel — schema-level split prevents this case in practice)         | (unreachable in normal flow)                            | N/A — surfaces only on wrapper invariant violation                                  |
| `single-segment`     | The path has exactly one segment (would address a top-level heading; out of scope per FR-002)                           | `{ heading_path: "Tasks" }`                             | Add at least one ancestor segment — top-level headings are not patchable through this tool |
| `too-long`           | The `heading_path` string exceeds 1000 UTF-16 code units                                                                | `{ heading_path: "..." /* >1000 chars */ }`            | Use a shorter locator; typical heading paths are 10–100 chars                       |

Additional details: `details.value_length: number` (for `too-long`); `details.segment_index: number` (for `empty-segment`).

### `EMPTY_CONTENT`

For modes `append` and `prepend`, the `content` payload is empty (zero-length). Per FR-018a, the wrapper rejects this as malformed because empty content has no realistic use case in append/prepend (almost always a caller bug — uninitialised variable, missing string interpolation, stringified `null`). For mode `replace`, empty content is accepted (legitimate "clear the direct body" operation) — `EMPTY_CONTENT` does NOT fire for `replace`.

| `details.reason` | Meaning                                  | Caller remediation                                                            |
|------------------|------------------------------------------|-------------------------------------------------------------------------------|
| `append`         | mode='append' with empty content         | Check the caller's content construction; verify the source string is populated |
| `prepend`        | mode='prepend' with empty content        | Same as above                                                                  |

Additional details: `details.mode: "append" | "prepend"` echoes the mode that arrived with empty content (redundant with `details.reason` but matches the cohort's payload convention).

## CLI_REPORTED_ERROR errors

These fire after schema validation but before, during, or after the actual fs operations. The wrapper catches them and classifies via the `details.code` discriminator.

### `HEADING_NOT_FOUND`

The supplied `heading_path` does not resolve to any heading in the target note (FR-017). Single state — no `details.reason`.

Additional details: `details.heading_path: string` (the supplied path); `details.path: string` (the vault-relative note path).

Caller remediation: Verify the heading path against the note's actual heading hierarchy. Use `outline` or `read_heading` to inspect the note's headings before patching. Remember that matching is case-sensitive and whitespace-strict (FR-003).

### `HEADING_RACE`

The heading hierarchy along the resolved path changed between path-resolution and the pre-write re-walk — the leaf was renamed, an ancestor was renamed, or an intermediate level was restructured (FR-019). The file on disk was NOT modified.

Additional details: `details.heading_path: string`; `details.path: string`; `details.original_identity: HeadingIdentity` (the 3-tuple from the initial walk: `{ markerLineText, rank, parentChainText }`); `details.current_identity: HeadingIdentity | null` (the 3-tuple from the re-walk, or `null` if the path no longer resolves at all).

Caller remediation: Re-read the note's current heading hierarchy and re-issue the patch with the updated heading_path. The current_identity field in details tells the caller exactly which heading now sits where the original target was.

### `EXTERNAL_EDITOR_CONFLICT`

The reliable-writer substrate signalled that the target note is held open by an external editor in a way that prevents the write (FR-021). The file on disk was NOT modified.

| `details.reason`    | Meaning                                                                                                  | Caller remediation                                                  |
|---------------------|----------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------|
| `file-locked`       | The OS-level `fs.rename` or `fs.writeFile` failed with EBUSY / EPERM / EACCES indicating the file is open with non-shared-delete access (typical on Windows when an editor holds the file) | Save and close the file in the external editor, then retry. Or coordinate with the user holding the file. |
| `unsaved-changes`   | (Reserved for a future detection mechanism — currently unused but encoded in the schema for forward compatibility per ADR-015's multi-state-from-day-one preference) | Same as `file-locked`                                               |

Additional details: `details.path: string`; `details.errno: string` (the underlying OS errno, e.g. `"EBUSY"`, `"EPERM"`, `"EACCES"`).

**Detection-capability caveat**: On platforms or scenarios where the substrate cannot detect the unsaved-changes condition (Linux / macOS for editors that hold dirty state in-memory only), the edit lands on disk and the editor sees a refreshed file on next focus — no `EXTERNAL_EDITOR_CONFLICT` fires. This is unavoidable given the substrate has no signal to fail on.

## Reused top-level codes

### `PATH_ESCAPES_VAULT`

Surfaces unchanged per ADR-009 when the supplied path's canonical resolution escapes the vault root (e.g., via a symlink). Identical behaviour to `write_note`.

Additional details: `details.vault: string`; `details.attemptedPath: string`; `details.resolvedPath: string`.

### `FS_WRITE_FAILED`

Surfaces unchanged per ADR-009 for generic `fs.writeFile` / `fs.rename` failures NOT classified as `EXTERNAL_EDITOR_CONFLICT`. Examples: ENOSPC (disk full), EACCES (permission denied on parent dir), EROFS (read-only filesystem). The wrapper distinguishes EXTERNAL_EDITOR_CONFLICT (specific errno set on a previously-readable file) from FS_WRITE_FAILED (any other fs error).

Additional details: `details.errno: string`; `details.path: string`.

### `VAULT_NOT_FOUND`

Surfaces unchanged when the supplied `vault` (in specific mode) is unknown to the vault registry or is registered-but-not-open. Identical behaviour to every other typed tool with a `vault` parameter.

Additional details: `details.vault: string`; `details.reason: "unknown" | "not-open"`.

### `ERR_NO_ACTIVE_FILE`

Surfaces unchanged when `target_mode === "active"` but no file is focused in the user's Obsidian editor (FR-008). Identical top-level code to `write_note`'s active-mode failure. Note this is a TOP-LEVEL code in the cohort (not a `details.code` sub-discriminator) — the cohort precedent predates the ADR-015 sub-discriminator pattern and is preserved as-is per Principle IV's "no new top-level codes" rule and the spec's clarification that this BI reuses the existing active-mode cohort discriminator unchanged.

Additional details: `details: {}` (no further structured payload — the error message names the remediation: "Open a note in the editor, or call patch_heading with target_mode=specific + vault + file/path.").

### `INTERNAL_ERROR`

Surfaces unchanged on wrapper invariant violation (e.g., the output schema's `.strict()` parse rejects the assembled response). This should be unreachable in correct code; if it fires, it is a wrapper bug.

Additional details: vary by site of failure; carry `details.stage: string` naming the wrapper-internal step that failed.

## Failure-mode decision tree (caller-side switch site)

```typescript
try {
  const result = await callTool("patch_heading", input);
  // success — write landed; bytes_written tells you roughly how big the post-edit file is
} catch (err) {
  if (err.code === "VALIDATION_ERROR") {
    switch (err.details.code) {
      case "INVALID_HEADING_PATH":
        // err.details.reason tells you which sub-state — fix the heading_path
        break;
      case "EMPTY_CONTENT":
        // err.details.mode tells you which mode arrived with empty content — populate the content
        break;
      default:
        // Generic Zod issue (target_mode discriminator, unrecognized_keys, etc.)
    }
  } else if (err.code === "CLI_REPORTED_ERROR") {
    switch (err.details.code) {
      case "HEADING_NOT_FOUND":
        // err.details.heading_path and err.details.path tell you where you looked
        break;
      case "HEADING_RACE":
        // err.details.original_identity and err.details.current_identity tell you what changed
        // Re-resolve and retry with the updated path
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
