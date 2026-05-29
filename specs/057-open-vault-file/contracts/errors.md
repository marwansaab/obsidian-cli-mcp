# Error Contract: open_file

**Branch**: `057-open-vault-file` | **Date**: 2026-05-29
**Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Data Model**: [../data-model.md](../data-model.md)

Agent-facing error contract for the `open_file` typed MCP tool. Every failure mode routes through `UpstreamError` (Constitution Principle IV). **Zero new top-level codes** — the streak is preserved. One new single-state `details.code` value (`UNSUPPORTED_FILE_TYPE`) is introduced per ADR-015. On every failure mode, nothing is opened and the workspace focus is unchanged (FR-017).

## Top-level code summary

| Top-level `code` | Origin | `details.code` states |
|------------------|--------|-----------------------|
| `VALIDATION_ERROR` | Zod / schema validation | none assigned — surfaces via the Zod issue path (cohort channel) |
| `CLI_REPORTED_ERROR` | handler classifier over the eval result + registry remap | `VAULT_NOT_FOUND` (`details.reason: unknown` \| `not-open`) — reused; `FILE_NOT_FOUND` — reused (`backlinks`/`links`); `UNSUPPORTED_FILE_TYPE` — **NEW (single state)** |
| `CLI_BINARY_NOT_FOUND` / `CLI_NON_ZERO_EXIT` | cli-adapter (`invokeCli`) | reused unchanged — Obsidian-not-running / eval spawn failure |
| `INTERNAL_ERROR` | wrapper invariant violation | reused — malformed/un-parseable eval result |

## Classifier stage order (FR-012a / ADR-014)

`VAULT_NOT_FOUND(unknown)` → `VAULT_NOT_FOUND(not-open)` → `FILE_NOT_FOUND` → `UNSUPPORTED_FILE_TYPE` → success. The vault guard fires before file resolution, so a wrong/unfocused vault never reports a wrong-vault `FILE_NOT_FOUND`.

## VALIDATION_ERROR (input boundary — before any eval)

Fires before the vault registry lookup and before any subprocess. Surfaces via the cohort's `VALIDATION_ERROR` envelope with `details.issues[].path` / `details.issues[].message`.

| Scenario | Issue path | Caller remediation |
|----------|-----------|--------------------|
| `vault` missing | `["vault"]` | Supply the vault display name. |
| Both `path` AND `file` supplied | `["path"]` and `["file"]` | Supply exactly one. |
| Neither `path` NOR `file` supplied | `[]` | Supply exactly one of `path` or `file`. |
| `file` contains `[[` or `]]` (FR-004) | `["file"]` | Strip the brackets; supply the bare name (`My Note`, not `[[My Note]]`). |
| `path`/`file` structurally unsafe (FR-013) | `["path"]` / `["file"]` | Use a vault-relative path with no leading slash, drive letter, `..` segment, or control chars. |
| Unknown extra field (FR-015) | `["<field>"]` | Drop the unknown field — schema is strict. |
| `new_tab` non-boolean | `["new_tab"]` | Supply `true`/`false` or omit (default `false`). |

## CLI_REPORTED_ERROR

### `VAULT_NOT_FOUND` (reused; two `details.reason` states)

The requested vault cannot receive the open. Specific to this BI's active focused-vault guard (FR-011/FR-012). No file opened.

| `details.reason` | Meaning | Caller remediation |
|------------------|---------|--------------------|
| `unknown` | `vault` does not match any registered Obsidian vault (the registry lookup `resolveVaultPath` raised). Detected before any eval. | Use `vaults` to list registered names; correct the typo. |
| `not-open` | `vault` is registered but is **not the currently focused vault** — closed, OR open in a background window but not focused. (Broadened semantic — settled at Clarifications 2026-05-29; no `not-focused` member added.) The eval guard found `app.vault.adapter.basePath` ≠ the requested vault's base path. | Make the requested vault active in Obsidian (open/focus it), then retry. The open always lands in the *focused* vault (upstream B1). |

Additional details: `details.vault: string` (the supplied display name).

### `FILE_NOT_FOUND` (reused from the eval-composed cohort)

The vault guard passed, but no file exists at the resolved location in the focused vault — the locator named no file, or named a folder (FR-014). Distinguishable from `UNSUPPORTED_FILE_TYPE` (the file does not exist at all) and from `VAULT_NOT_FOUND` (the vault is fine). No file opened.

Additional details: `details.code: "FILE_NOT_FOUND"`; `details.path: string` (the vault-relative path or bare name attempted); `details.vault: string`.

Caller remediation: verify the path with `files`; if the intent was to create the file, use `write_note`.

### `UNSUPPORTED_FILE_TYPE` (NEW — single state)

The file exists, but its type is one Obsidian does not recognise or cannot display — no view is registered for its extension (FR-009). Distinguishable from `FILE_NOT_FOUND` (the file is present; only its type is unrenderable). Single state — no `details.reason` per ADR-015. No file opened.

Additional details: `details.code: "UNSUPPORTED_FILE_TYPE"`; `details.path: string`; `details.extension: string` (the unrecognised extension); `details.vault: string`.

**Detection-capability caveat**: distinguishing "type not supported" relies on the eval inspecting `app.viewRegistry` for a registered view of the extension (confirmed at T0 — research R7.1). Where the substrate cannot positively signal the condition, the contract degrades to "the target did not become the active file", and the handler reports the open as not having taken effect rather than fabricating success — never a silent success that opened nothing (FR-009). This is the eval-composed cohort's detection-capability posture (cf. `append_note`/`patch_*` external-editor-conflict caveat).

Caller remediation: the file type cannot be displayed in Obsidian; surface it to the user through another channel, or convert it to a recognised type.

## Reused codes (no `details.code` added)

### `CLI_BINARY_NOT_FOUND` / `CLI_NON_ZERO_EXIT` / generic `CLI_REPORTED_ERROR`

Obsidian is not running, the `obsidian` binary is missing, or the eval spawn failed in a way the cohort's `invokeCli` already classifies. The open did not happen and is reported loud — never a silent success. (Exact classification confirmed at T0 — research R7.4.)

Caller remediation: ensure Obsidian is running with the target vault focused, and that the `obsidian` CLI is installed/resolvable; retry.

### `INTERNAL_ERROR`

The eval returned a result the handler cannot interpret (malformed JSON, or an envelope that fails `openEvalResponseSchema.safeParse`). Should not occur in normal operation. `details.stage: "json-parse" | "envelope-parse"`; `details.cause: unknown`.

Caller remediation: report with the full payload; retry once for a transient eval failure, not indefinitely.

## Not produced by this tool

- **`PATH_ESCAPES_VAULT`**: not produced. `open_file` performs no `fs.realpath` (it does no filesystem syscalls — Obsidian resolves the vault-relative locator internally and cannot escape the vault for a read-only open). Traversal/absolute/drive-letter inputs are rejected earlier at the schema structural-safety layer as `VALIDATION_ERROR` (FR-013 permits "PATH_ESCAPES_VAULT *or* the validation-layer reject"; this tool takes the validation-layer reject).
- **`FS_WRITE_FAILED`** / **`FILE_EXISTS`**: not produced — no filesystem write.
- **`ERR_NO_ACTIVE_FILE`**: not produced — `open_file` has no active mode (R4).
