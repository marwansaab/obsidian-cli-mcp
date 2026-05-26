# Error Contract: prepend

**Branch**: `045-prepend-note` | **Date**: 2026-05-26
**Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Data Model**: [../data-model.md](../data-model.md)

This document is the agent-facing error contract for the `prepend` typed MCP tool. Every failure mode routes through `UpstreamError` per Constitution Principle IV. All errors use existing top-level codes — zero new top-level codes introduced (twenty-tool zero-new-codes streak preserved post-BI-045).

## Top-level code summary

| Top-level `code`         | Origin                                  | New `details.code` states introduced by this BI |
|--------------------------|-----------------------------------------|-------------------------------------------------|
| `VALIDATION_ERROR`       | Zod / schema validation                 | `CONTENT_TOO_LARGE` (single state) — NEW. `CONTENT_EMPTY` reused from BI-044 unchanged. |
| `CLI_REPORTED_ERROR`     | wrapper + cli-adapter                   | none — reuses `NOTE_NOT_FOUND` (read-side cohort + BI-044) and `EXTERNAL_EDITOR_CONFLICT` (BI-040, 2 sub-reasons inherited byte-stably) |
| `PATH_ESCAPES_VAULT`     | Path-safety Layer 2 canonical check     | reused unchanged                                |
| `VAULT_NOT_FOUND`        | vault-registry                          | reused unchanged                                |
| `ERR_NO_ACTIVE_FILE`     | cohort active-mode (write_note lineage) | reused unchanged for FR-004                     |
| `INTERNAL_ERROR`         | wrapper invariant violation             | reused unchanged                                |

`FS_WRITE_FAILED` does NOT appear in this BI's error roster — the wrapper does not touch the filesystem directly. Filesystem-level write failures (disk full, read-only filesystem, permission denied) surface from upstream as generic `CLI_REPORTED_ERROR` without a `details.code` sub-discriminator (the wrapper passes upstream's stdout/stderr verbatim in `details.stage: "prepend-cli"` + `details.stdout` + `details.stderr`). This is a deliberate cohort divergence from BI-044's fs-direct `FS_WRITE_FAILED` classification — rationale in research.md R1.

## VALIDATION_ERROR errors

These fire at the input-validation boundary BEFORE any filesystem access, subprocess invocation, or vault registry lookup.

### `CONTENT_EMPTY` (reused from BI-044 unchanged)

The supplied `content` is the empty string (FR-013). Single state — no `details.reason` per ADR-015.

Surfaces dually: via the zod `too_small` issue (visible at `details.issues[].code === "too_small"` + `details.issues[].path === ["content"]`) AND via the ADR-015 envelope (`details.code === "CONTENT_EMPTY"`). Cohort parity with BI-044's dual-surface pattern.

Caller remediation: Supply a non-empty content payload. Prepending zero bytes is a no-op masquerading as an operation; the empty-content rejection surfaces the no-op so the caller can decide whether they meant to skip the call entirely.

### `CONTENT_TOO_LARGE` (NEW in BI-045)

The supplied `content` exceeds 24576 UTF-16 code units (24 KiB) (FR-018). Single state — no `details.reason` per ADR-015.

Surfaces dually: via the zod `too_big` issue (visible at `details.issues[].code === "too_big"` + `details.issues[].path === ["content"]` + `details.issues[].maximum === 24576`) AND via the ADR-015 envelope (`details.code === "CONTENT_TOO_LARGE"`). Cohort parity with `CONTENT_EMPTY`'s dual-surface pattern.

The 24 KiB cap is the FR-017 documented size ceiling for BI-045 — driven by the Windows command-line maximum (~32 767 chars) minus the cohort's worst-case argv envelope overhead. Rationale and budget breakdown in research.md R3.

Caller remediation: Reduce the content payload below the cap, OR use the full-replace `write_note` surface (which is fs-direct and cap-free) for payloads above the cap. Splitting a >24 KiB prepend into two sequential `prepend` calls is also valid but produces different observable bytes than a single >24 KiB prepend would have (because of the FR-006 / FR-006a separator interaction with each call's content tail); the `write_note` surface is the cleaner path for single-document prepends above the cap.

### Other VALIDATION_ERROR cases (no `details.code` assigned — surface via the Zod issue path)

These cases share the cohort's standard `VALIDATION_ERROR` envelope with `details.issues[].path` and `details.issues[].message` carrying the per-issue diagnostic. No tool-specific `details.code` is assigned because the cohort's existing channel is self-describing and no programmatic switch-arm is needed beyond the issue path itself. Cohort parity with BI-044.

| Scenario                                                                            | Issue path        | Issue message (representative)                                                                                                                                            | Caller remediation                                                                                       |
|-------------------------------------------------------------------------------------|-------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| `target_mode` missing                                                               | `["target_mode"]` | Cohort target-mode primitive's standard "Invalid enum value" message                                                                                                       | Supply `target_mode: "specific"` or `target_mode: "active"`.                                              |
| `specific` mode with both `file` AND `path`                                         | `["file"]` and `["path"]` | "exactly one of `file` or `path` must be provided in specific mode (got both)"                                                                                              | Supply exactly one of `file` or `path`.                                                                  |
| `specific` mode with neither `file` NOR `path`                                      | `[]`              | "exactly one of `file` or `path` must be provided in specific mode (got neither)"                                                                                          | Supply exactly one of `file` or `path`.                                                                  |
| `specific` mode missing `vault`                                                     | `["vault"]`       | "vault is required in specific mode"                                                                                                                                       | Supply the vault display name.                                                                           |
| `active` mode with any of `vault`/`file`/`path` supplied                            | `["vault"]` / `["file"]` / `["path"]` | "<key> is not allowed in active mode"                                                                                                                                       | Drop the locator field in active mode — the wrapper resolves the focused note via eval.                  |
| `file` field contains `[[` or `]]` brackets (FR-001a)                               | `["file"]`        | "wikilink-form locator MUST NOT contain `[[` or `]]` brackets — supply the bare note name (e.g. `My Note` not `[[My Note]]`)"                                              | Strip the brackets; supply the bare note name.                                                           |
| `file` or `path` fails structural-path-safety (`isStructurallySafePath`)            | `["file"]` / `["path"]` | "path is not structurally safe (must not start with '/', '\\\\', or a drive letter; must not contain '..' segments or control characters)"                                  | Use a vault-relative path with no leading slashes, drive letters, `..` segments, or control characters.  |
| Unknown extra input field present (`additionalProperties: false`)                   | `["<fieldname>"]` | Cohort's standard "unrecognized_keys" message                                                                                                                              | Drop the unknown field; the schema is strict (cohort parity with `write_note` / `append_note` / `patch_heading` / `patch_block`). |
| `inline` field present with a non-boolean value                                     | `["inline"]`      | Zod's standard "Expected boolean, received <type>" message                                                                                                                  | Supply `inline: true` or `inline: false` (or omit for the default `false`).                              |

## CLI_REPORTED_ERROR errors

These fire after schema validation, surfacing from upstream's stdout/stderr inspection. Detection patterns are confirmed at T0 (see research.md R2, R6).

### `NOTE_NOT_FOUND` (reused from read-side cohort + BI-044 unchanged)

The resolved target does not correspond to an existing note in the vault (FR-016). Surfaces from:

- The pre-flight `obsidian file` TSV resolver call (specific+file mode) — when the wikilink-form name doesn't resolve to any vault note, the resolver's stderr matches the cohort-known not-found pattern.
- The main `obsidian prepend` call (specific+path mode, active mode after focused-file eval, OR specific+file mode after resolver success but before the prepend lands — race window) — when the upstream's stderr matches the cohort-known not-found pattern.

No note was created. Single state — no `details.reason` per ADR-015.

Additional details: `details.code: "NOTE_NOT_FOUND"`; `details.path: string` (the vault-relative path or wikilink-form name the wrapper attempted to address); `details.vault: string | null` (vault display name in specific mode, `null` in active mode where the path came from the focused-file eval).

Caller remediation: Verify the path against the vault contents. Use `files` to enumerate notes in the directory. If the intent was to CREATE a new note, call `write_note` instead — prepend assumes the target exists per the published scope split (FR-012 / FR-025).

### `EXTERNAL_EDITOR_CONFLICT` (reused from BI-040 + BI-043 + BI-044 unchanged)

The upstream signalled that the target note is held open by an external editor in a way that prevents the prepend (FR-022). The file on disk was NOT modified. Detection-capability-bound — see caveat below. Two-state per `details.reason`:

| `details.reason`    | Meaning                                                                                                  | Caller remediation                                                  |
|---------------------|----------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------|
| `file-locked`       | Upstream's stderr matches the cohort-known file-lock pattern (typically EBUSY / EPERM / EACCES surfaced through upstream's process layer on Windows when an editor holds the file with non-shared-delete access) | Save and close the file in the external editor, then retry. Or coordinate with the user holding the file. |
| `unsaved-changes`   | Upstream's stderr matches the cohort-known unsaved-changes pattern (reserved per BI-040; the precise trigger conditions depend on upstream's detection — see T0 protocol in research.md R6) | Same as `file-locked`                                               |

Additional details: `details.code: "EXTERNAL_EDITOR_CONFLICT"`; `details.path: string`. `details.errno` MAY be present when the upstream surfaces the underlying OS errno through its stderr (T0-confirmed); otherwise absent.

**Detection-capability caveat**: On platforms or scenarios where the upstream cannot detect the external-editor condition (Linux / macOS for editors that hold dirty state in-memory only), the prepend lands and the editor sees a refreshed file on next focus — no `EXTERNAL_EDITOR_CONFLICT` fires. This is unavoidable given the upstream has no signal to fail on. Inherited verbatim from BI-040 R6 / BI-044 R10.

## Reused top-level codes (no `details.code` discriminator added by this BI)

### `PATH_ESCAPES_VAULT`

The supplied path resolves to a filesystem location OUTSIDE the resolved vault root — typically a symlink-escape attempt. Layer 2 path-safety check (cohort-shared `checkCanonicalPath` helper). The file on disk was NOT modified.

Additional details: `details.vault: string | null`; `details.attemptedPath: string`; `details.resolvedPath: string`.

Caller remediation: Use a path that resolves inside the vault root. If the target is a symlink, follow it manually and supply the resolved target's vault-relative path directly.

### `VAULT_NOT_FOUND`

The supplied `vault` display name does not match any registered vault. Specific mode only — active mode resolves the vault from the focused-file eval and never surfaces this code (the eval response carries the vault basePath directly).

Additional details: `details.reason: "unknown" | "not-open"`; `details.vault: string` (the supplied display name).

Caller remediation: Use `vaults` to list registered vault names. If the vault exists but is not currently open in Obsidian, the substrate may return `"not-open"` — open the vault in Obsidian and retry, or use a different vault that is currently open.

### `ERR_NO_ACTIVE_FILE`

Active mode (`target_mode: "active"`) was requested but the cohort's `FOCUSED_FILE_TEMPLATE` eval returned `path: null` — Obsidian has no currently-focused file. Per FR-004. No `obsidian prepend` call was issued; no write was attempted.

Additional details: `details.message: string` (the user-facing instruction to open a note in the editor or call prepend with `target_mode: "specific"` + vault + file/path).

Caller remediation: Open a note in the Obsidian editor before retrying, OR switch to `target_mode: "specific"` and supply the locator explicitly.

### `INTERNAL_ERROR`

The wrapper detected an invariant violation it cannot recover from (e.g. eval response shape malformed, unexpected throw from the TSV parser, unrecognised upstream stdout format). Should not occur in normal operation. Maps to the cohort's `INTERNAL_ERROR` top-level code.

Additional details: `details.stage: string` (where the violation was detected); `details.cause: unknown` (the underlying thrown value).

Caller remediation: Report the failure to the maintainers with the full error payload; retry once in case of transient eval failure but do not retry indefinitely.

### Unrecognised upstream failure (no `details.code` assigned)

When upstream's exit code is non-zero but stderr does not match any cohort-known pattern (NOTE_NOT_FOUND, EXTERNAL_EDITOR_CONFLICT, ERR_NO_ACTIVE_FILE, or VAULT_NOT_FOUND), the wrapper surfaces `code: "CLI_REPORTED_ERROR"` with `details: { stage: "prepend-cli", stdout, stderr }` — no `details.code` sub-discriminator. Programmatic callers should treat this as the "unknown upstream failure" case and surface the stdout/stderr to the operator for diagnosis. Cohort parity with `set_property`'s unrecognised-error path.

## Cohort-divergence note: missing `FS_WRITE_FAILED`

BI-044 (`append_note`) classifies fs.writeFile / fs.rename failures into `FS_WRITE_FAILED` because the BI-044 wrapper writes directly. BI-045 (`prepend`) does NOT have an equivalent code because the upstream owns the write. Filesystem-level failures (disk full, read-only filesystem, permission denied) surface as unrecognised upstream failures (the "unrecognised upstream failure" path above) until and unless future T0 work identifies a stable upstream stderr pattern for these conditions and surfaces them as a `details.code: "FS_WRITE_FAILED"` sub-discriminator under `CLI_REPORTED_ERROR`. The simpler path is left in place at BI-045 launch — `details.stdout` + `details.stderr` carry the diagnostic information the operator needs.
