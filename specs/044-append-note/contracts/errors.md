# Error Contract: append_note

**Branch**: `044-append-note` | **Date**: 2026-05-25
**Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Data Model**: [../data-model.md](../data-model.md)

This document is the agent-facing error contract for the `append_note` typed MCP tool. Every failure mode routes through `UpstreamError` per Constitution Principle IV. All errors use existing top-level codes — zero new top-level codes introduced (nineteen-tool zero-new-codes streak preserved post-BI-044).

## Top-level code summary

| Top-level `code`         | Origin                                  | New `details.code` states introduced by this BI |
|--------------------------|-----------------------------------------|-------------------------------------------------|
| `VALIDATION_ERROR`       | Zod / schema validation                 | `CONTENT_EMPTY` (single state)                  |
| `CLI_REPORTED_ERROR`     | wrapper + cli-adapter                   | none — reuses `NOTE_NOT_FOUND` (existing read-side cohort discriminator) and `EXTERNAL_EDITOR_CONFLICT` (inherited from BI-040, 2 sub-reasons byte-stably) |
| `PATH_ESCAPES_VAULT`     | ADR-009 / path-safety                   | reused unchanged                                |
| `FS_WRITE_FAILED`        | ADR-009 substrate                       | reused unchanged                                |
| `VAULT_NOT_FOUND`        | vault-registry                          | reused unchanged                                |
| `ERR_NO_ACTIVE_FILE`     | cohort active-mode (write_note lineage) | reused unchanged for FR-004                     |
| `INTERNAL_ERROR`         | wrapper invariant violation             | reused unchanged                                |

## VALIDATION_ERROR errors

These fire at the input-validation boundary BEFORE any filesystem access, subprocess invocation, or vault registry lookup.

### `CONTENT_EMPTY`

The supplied `content` is the empty string (FR-013). Single state — no `details.reason` per ADR-015.

Additional details: `details.field: "content"`.

Caller remediation: Supply a non-empty content payload. Appending zero bytes is a no-op masquerading as an operation; the empty-content rejection surfaces the no-op so the caller can decide whether they meant to skip the call entirely.

### Other VALIDATION_ERROR cases (no `details.code` assigned — surface via the Zod issue path)

These cases share the cohort's standard `VALIDATION_ERROR` envelope with `details.issues[].path` and `details.issues[].message` carrying the per-issue diagnostic. No tool-specific `details.code` is assigned because the cohort's existing channel is self-describing and no programmatic switch-arm is needed beyond the issue path itself.

| Scenario                                                                            | Issue path        | Issue message (representative)                                                                                                                                            | Caller remediation                                                                                       |
|-------------------------------------------------------------------------------------|-------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| `target_mode` missing                                                               | `["target_mode"]` | Cohort target-mode primitive's standard "Invalid enum value" message                                                                                                       | Supply `target_mode: "specific"` or `target_mode: "active"`.                                              |
| `specific` mode with both `file` AND `path`                                         | `["file"]` and `["path"]` | "exactly one of `file` or `path` must be provided in specific mode (got both)"                                                                                              | Supply exactly one of `file` or `path`.                                                                  |
| `specific` mode with neither `file` NOR `path`                                      | `[]`              | "exactly one of `file` or `path` must be provided in specific mode (got neither)"                                                                                          | Supply exactly one of `file` or `path`.                                                                  |
| `specific` mode missing `vault`                                                     | `["vault"]`       | "vault is required in specific mode"                                                                                                                                       | Supply the vault display name.                                                                           |
| `active` mode with any of `vault`/`file`/`path` supplied                            | `["vault"]` / `["file"]` / `["path"]` | "<key> is not allowed in active mode"                                                                                                                                       | Drop the locator field in active mode — the wrapper resolves the focused note via eval.                  |
| `file` field contains `[[` or `]]` brackets (FR-001a)                               | `["file"]`        | "wikilink-form locator MUST NOT contain `[[` or `]]` brackets — supply the bare note name (e.g. `My Note` not `[[My Note]]`)"                                              | Strip the brackets; supply the bare note name.                                                           |
| `file` or `path` fails structural-path-safety (`isStructurallySafePath`)            | `["file"]` / `["path"]` | "path is not structurally safe (must not start with '/', '\\\\', or a drive letter; must not contain '..' segments or control characters)"                                  | Use a vault-relative path with no leading slashes, drive letters, `..` segments, or control characters.  |
| Unknown extra input field present (`additionalProperties: false`)                   | `["<fieldname>"]` | Cohort's standard "unrecognized_keys" message                                                                                                                              | Drop the unknown field; the schema is strict (cohort parity with `write_note` / `patch_heading` / `patch_block`). |
| `inline` field present with a non-boolean value                                     | `["inline"]`      | Zod's standard "Expected boolean, received <type>" message                                                                                                                  | Supply `inline: true` or `inline: false` (or omit for the default `false`).                              |

## CLI_REPORTED_ERROR errors

These fire after schema validation but before, during, or after the actual fs operations. The wrapper catches them and classifies via the `details.code` discriminator.

### `NOTE_NOT_FOUND`

The resolved target does not correspond to an existing note in the vault (FR-016). Reused from the read-side cohort (`read`, `read_heading`, `outline`, `patch_heading`, `patch_block`) — same `details.code` value, same payload shape. Surfaces from the wrapper's `fs.readFile` ENOENT (per research.md R5). No note was created.

Additional details: `details.code: "NOTE_NOT_FOUND"`; `details.path: string` (the vault-relative path the wrapper attempted to read); `details.vault: string | null` (vault display name in specific mode, `null` in active mode where the path came from the focused-file eval).

Caller remediation: Verify the path against the vault contents. Use `files` to enumerate notes in the directory. If the intent was to CREATE a new note, call `write_note` instead — append assumes the target exists per the published scope split (FR-012 / FR-025).

### `EXTERNAL_EDITOR_CONFLICT`

The reliable-writer substrate signalled that the target note is held open by an external editor in a way that prevents the write (FR-022). The file on disk was NOT modified. Inherited byte-stably from BI-040's classification.

| `details.reason`    | Meaning                                                                                                  | Caller remediation                                                  |
|---------------------|----------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------|
| `file-locked`       | The OS-level `fs.rename` or `fs.writeFile` failed with EBUSY / EPERM / EACCES indicating the file is open with non-shared-delete access (typical on Windows when an editor holds the file) | Save and close the file in the external editor, then retry. Or coordinate with the user holding the file. |
| `unsaved-changes`   | (Reserved per BI-040 for a future detection mechanism — currently unused but encoded in the schema for forward compatibility per ADR-015's multi-state-from-day-one preference)             | Same as `file-locked`                                               |

Additional details: `details.code: "EXTERNAL_EDITOR_CONFLICT"`; `details.path: string`; `details.errno: string` (the underlying OS errno, e.g. `"EBUSY"`, `"EPERM"`, `"EACCES"`).

**Detection-capability caveat**: On platforms or scenarios where the substrate cannot detect the unsaved-changes condition (Linux / macOS for editors that hold dirty state in-memory only), the edit lands on disk and the editor sees a refreshed file on next focus — no `EXTERNAL_EDITOR_CONFLICT` fires. This is unavoidable given the substrate has no signal to fail on. Inherited verbatim from BI-040 R6.

## Reused top-level codes (no `details.code` discriminator added by this BI)

### `PATH_ESCAPES_VAULT`

The supplied path resolves (via `fs.realpath`) to a filesystem location OUTSIDE the resolved vault root — typically a symlink-escape attempt. Layer 2 path-safety per ADR-009. The file on disk was NOT modified.

Additional details: `details.vault: string | null`; `details.attemptedPath: string`; `details.resolvedPath: string`.

Caller remediation: Use a path that resolves inside the vault root. If the target is a symlink, follow it manually and supply the resolved target's vault-relative path directly.

### `FS_WRITE_FAILED`

The underlying `fs.writeFile` / `fs.rename` / `fs.mkdir` (for the `.tmp` parent directory) call failed with an errno that doesn't match the more-specific cases above (NOTE_NOT_FOUND for ENOENT, EXTERNAL_EDITOR_CONFLICT for EBUSY/EPERM/EACCES on rename). Mapped via the cohort's existing `mapFsError` helper.

Additional details: `details.errno: string`; `details.syscall: string`; `details.path: string`.

Caller remediation: Inspect the errno. Common causes: disk full (`ENOSPC`), read-only filesystem (`EROFS`), no permission to write to the directory (`EACCES` on the parent dir).

### `VAULT_NOT_FOUND`

The supplied `vault` display name does not match any registered vault. Specific mode only — active mode resolves the vault from the focused-file eval and never surfaces this code.

Additional details: `details.reason: "unknown" | "not-open"`; `details.vault: string` (the supplied display name).

Caller remediation: Use `vaults` to list registered vault names. If the vault exists but is not currently open in Obsidian, the substrate may return `"not-open"` — open the vault in Obsidian and retry, or use a different vault that is currently open.

### `ERR_NO_ACTIVE_FILE`

Active mode (`target_mode: "active"`) was requested but the cohort's `FOCUSED_FILE_TEMPLATE` eval returned `path: null` — Obsidian has no currently-focused file. Per FR-004. No filesystem access occurred; no write was attempted.

Additional details: `details.message: string` (the user-facing instruction to open a note in the editor or call append_note with `target_mode: "specific"` + vault + file/path).

Caller remediation: Open a note in the Obsidian editor before retrying, OR switch to `target_mode: "specific"` and supply the locator explicitly.

### `INTERNAL_ERROR`

The wrapper detected an invariant violation it cannot recover from (e.g. eval response shape malformed, unexpected throw from a pure helper). Should not occur in normal operation. Maps to the cohort's `INTERNAL_ERROR` top-level code.

Additional details: `details.stage: string` (where the violation was detected); `details.cause: unknown` (the underlying thrown value).

Caller remediation: Report the failure to the maintainers with the full error payload; retry once in case of transient eval failure but do not retry indefinitely.
