# `delete`

## Overview

Delete a note from an Obsidian vault. Wraps the Obsidian CLI's `delete`
subcommand and returns a typed result describing whether the file was sent to
the OS trash or permanently deleted. Direct counterpart of
[`read`](./read.md) and [`write_note`](./write_note.md): where
`read` retired `obsidian_exec` for reads and `write_note` retired it for
create/overwrite, `delete` retires it for destructive single-file
removal. Use [`obsidian_exec`](./obsidian_exec.md) only for the `create`
subcommand's `newtab` flag or unwrapped subcommands.

> **Irreversibility warning**: `permanent: true` skips the OS trash and
> deletes the file unrecoverably. There is no undo. Default behaviour
> (`permanent: false`) sends the file to the OS trash where it remains
> recoverable until the trash is emptied.

The tool supports two target modes:

- **specific** — name the vault explicitly and locate the note by either a
  wikilink (`file`) or a vault-relative `path`. Use this when the agent has
  the vault and locator already in hand. Specific mode is the deterministic
  path; the focused note in the editor cannot shift between parse and
  execution.
- **active** — target the active vault context. The CLI's `delete` subcommand
  with no locator deletes the note currently focused in the Obsidian editor.
  **Active mode + an irreversible operation has a TOCTOU caveat**: the focused
  note may shift between the time the agent decides to call and the time the
  CLI executes. Agents that need certainty about which file is deleted MUST
  use specific mode with an explicit locator, especially when combined with
  `permanent: true`.

The discriminator is `target_mode`. The schema composes the shared
[target-mode primitive](../../specs/004-target-mode-schema/spec.md) plus the
`permanent` boolean flag. **Departure from `write_note`**: there are no
active-mode-specific rules — `permanent` is permitted in both modes.

## Input Schema

`delete` consumes the discriminated union below. Every field is rejected
at the boundary as `VALIDATION_ERROR` if the constraints fail. Unknown
top-level keys are rejected (`additionalProperties: false`) — the schema is
strict.

### Specific mode

```json
{
  "target_mode": "specific",
  "vault": "<vault name>",
  "path": "<vault-relative path>",
  "permanent": false
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"specific"` | YES | discriminator |
| `vault` | string | YES | length ≥ 1 |
| `file` | string | exactly one of `file`/`path` | wikilink form (e.g. `"QuickNote"`) — CLI resolves to the canonical folder-prefixed path |
| `path` | string | exactly one of `file`/`path` | vault-relative path (e.g. `"Inbox/Old.md"`) |
| `permanent` | boolean | no — defaults to `false` | when `true`, skip OS trash and delete unrecoverably; when `false` or omitted, send to OS trash (recoverable) |

The schema enforces "exactly one of `file` or `path`": providing both is
rejected with two issues (one per locator field), and providing neither is
rejected with a root-level issue.

### Active mode

```json
{
  "target_mode": "active",
  "permanent": false
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"active"` | YES | discriminator |
| `permanent` | boolean | no — defaults to `false` | same semantics as specific mode; permitted in both modes (see "Per-mode field policy" below) |
| `vault` | (n/a) | FORBIDDEN | rejected at the schema layer with one issue on `path: ["vault"]` |
| `file` | (n/a) | FORBIDDEN | same |
| `path` | (n/a) | FORBIDDEN | same |

For the discriminator's full contract see the
[target-mode primitive spec](../../specs/004-target-mode-schema/spec.md).

### Per-mode field policy

| Field | Specific Mode | Active Mode | Default |
|-------|---------------|-------------|---------|
| `target_mode` | required (`"specific"`) | required (`"active"`) | none |
| `vault` | REQUIRED | FORBIDDEN | n/a |
| `file` | OPTIONAL (XOR with `path`) | FORBIDDEN | undefined |
| `path` | OPTIONAL (XOR with `file`) | FORBIDDEN | undefined |
| `permanent` | OPTIONAL | OPTIONAL | `false` |

**Note**: `permanent` is permitted in active mode without restriction. This is
a deliberate departure from `write_note`'s active-mode rules — `permanent`
has well-defined semantics in both modes (the irreversibility applies
regardless of how the locator is resolved). This is the spec's user input
[P1] AC #9 made explicit.

## Output

```json
{ "deleted": true, "path": "Inbox/Old.md", "toTrash": true }
```

| Field | Type | Description |
|-------|------|-------------|
| `deleted` | literal `true` | Always `true` on success. Failures throw `UpstreamError` and never produce a `deleted: false` shape. |
| `path` | string | The CLI-canonical vault-relative path AT THE MOMENT OF DELETION. For wikilink-form input (`file=`) this is the resolved folder-prefixed path. |
| `toTrash` | boolean | `true` means the file went to the OS trash (recoverable); `false` means it was permanently deleted (unrecoverable). **Derived structurally from input**: `toTrash === !permanent`. NOT parsed from the CLI's response. |

The handler parses the CLI's stdout against
`^(Moved to trash|Deleted permanently):\s+(.+?)\s*$` and propagates the
captured path verbatim. Unparseable success responses raise
`CLI_REPORTED_ERROR`.

### Audit-trail signal

`toTrash === false` is the audit signal for irreversible deletions. Operators
auditing logs filter on `toTrash === false` to surface every irreversible
deletion. The typed `permanent` flag IS the audit point — the structural
derivation guarantees the two stay in lockstep regardless of CLI response
wording.

## Behavioural notes (live-CLI characterisation)

These behaviours are captured in
[research.md T0 Live-CLI Capture (2026-05-08)](../../specs/012-delete-note/research.md)
and are observable by callers — agents should plan for them.

- **Wikilink-form (`file=`) resolves to a canonical path**: `file: "QuickNote"`
  resolves to the canonical folder-prefixed path the CLI echoes (e.g.
  `1000- Testing/QuickNote.md`). The returned `path` reflects the resolved
  location.
- **Active mode follows the focused note**: `target_mode: "active"` deletes the
  note currently focused in the Obsidian editor. If no note is focused, the
  CLI surfaces `ERR_NO_ACTIVE_FILE`. Combined with `permanent: true`, the
  TOCTOU caveat above applies — focus may shift between parse and execution.
- **Path-traversal is NOT normalised by the CLI**: vault-relative paths
  containing `../` segments are treated as literal multi-component path
  components, NOT resolved. `subdir/../foo.md` is looked up as the literal
  string, NOT as `foo.md`. There is no vault-escape vector via path-traversal
  on the CLI's side; the bridge does not add a tool-layer reject.
- **Unknown vault names** surface as `CLI_REPORTED_ERROR` with the verbatim
  `Vault not found.` message (per the cli-adapter's R5 / T002
  response-inspection clause inherited from `write_note`).
- **File not found** surfaces as `CLI_REPORTED_ERROR` with the verbatim
  `Error: File "<path>" not found.` message. The path quoting in the message
  is the CLI's own — agents should not strip it.
- **OS-reserved names on Windows** (`CON`, `PRN`, `AUX`, etc.): the CLI is the
  trust boundary. Whatever the CLI does — accept, reject, normalise — the
  bridge forwards verbatim. There is no tool-layer reserved-name list.
- **File locked by an external editor**: typically surfaces as
  `CLI_NON_ZERO_EXIT` on Windows (where the OS holds an exclusive lock).
  POSIX hosts generally allow the delete to proceed and the editor sees a
  stale buffer.
- **Trash-volume-full on Windows**: NOT probed during T0 (best-effort case
  per FR-019). On a full Windows recycle bin, the CLI's behaviour is
  unverified — it may surface a structured error, OR it may silently fall
  back to permanent delete. **Until field-verified**, callers who require
  audit-grade confidence in the to-trash signal SHOULD verify the file's
  presence in the OS trash out-of-band when handling notes on volumes with
  constrained recycle-bin capacity. A future BI may add an on-disk
  verification step if this case surfaces in field reports.

## Errors

All failure surfaces flow through `UpstreamError` per Constitution Principle
IV. `delete` introduces zero new error codes — the failure surface is
fully covered by codes already defined by the foundation features.

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | The input failed `deleteNoteInputSchema` validation (missing `target_mode`, missing `vault` in specific mode, neither/both `file` and `path`, forbidden key in active mode, unknown top-level key, `permanent` non-boolean, etc.). | Agent retries with corrected input. `details.issues` carries the per-issue `path` + `message` + zod code. **Note**: `permanent: true` IS recoverable from the validation layer (the input is valid); but the resulting deletion is NOT recoverable from the file system. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (file locked, permission error on Windows, etc.). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Agent inspects `stderr` for diagnostic output. |
| `CLI_REPORTED_ERROR` | The CLI exited 0 but reported a failure in-band — either stdout starts with `Error:` (file not found, etc.), OR the unknown-vault response (`Vault not found.`) was matched by the cli-adapter's R5 inspection, OR the success-response was unparseable. | `details.message` (the first line of stdout, or the synthesised parse-failure message) names the specific failure. For "file not found": the file may already be gone — verify the path, retry with the right locator, or accept that the delete is already accomplished. |
| `ERR_NO_ACTIVE_FILE` | `target_mode: "active"` was used but the underlying CLI invocation reported no active file. | Operator-side: open a note in the editor, OR call again with `target_mode: "specific"` and an explicit `vault` + `file`/`path`. **For an irreversible operation, specific mode is the safer choice regardless of whether a note is focused.** |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |

The canonical errors contract is at
[specs/001-add-cli-bridge/contracts/errors.contract.md](../../specs/001-add-cli-bridge/contracts/errors.contract.md);
`delete` propagates the adapter's classification verbatim with no
rewrites. **No new codes** are introduced by this tool.

## Examples

### Specific mode — to-trash delete by path (default, recoverable)

```json
{
  "name": "delete",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/Old.md"
  }
}
```

Spawns `obsidian vault=MyVault delete path=Inbox/Old.md`. Returns
`{ "deleted": true, "path": "Inbox/Old.md", "toTrash": true }`. The file is
recoverable from the OS trash until the trash is emptied.

### Specific mode — to-trash delete by wikilink (`file=`)

```json
{
  "name": "delete",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "file": "QuickNote"
  }
}
```

Spawns `obsidian vault=MyVault delete file=QuickNote`. The user-facing `file`
field maps DIRECTLY to the CLI's `file=` argv key — no rename (departure from
`write_note` where `file` → `name=`). Returns
`{ "deleted": true, "path": "<resolved canonical path>", "toTrash": true }`.

### Specific mode — permanent delete (irreversible)

```json
{
  "name": "delete",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/Old.md",
    "permanent": true
  }
}
```

Spawns `obsidian vault=MyVault delete path=Inbox/Old.md permanent`. Returns
`{ "deleted": true, "path": "Inbox/Old.md", "toTrash": false }`.

> **This cannot be undone.** The file is removed from both the vault and the
> OS trash. There is no recovery path through Obsidian or the OS. Use the
> default (omit `permanent`) for any deletion where recoverability matters.

### Active mode — delete the focused note

```json
{
  "name": "delete",
  "arguments": {
    "target_mode": "active"
  }
}
```

Spawns `obsidian delete` (no vault, no locator). The CLI deletes the note
currently focused in the Obsidian editor. Returns
`{ "deleted": true, "path": "<focused note path>", "toTrash": true }`. If no
note is focused, surfaces `ERR_NO_ACTIVE_FILE`.

**TOCTOU caveat for active mode + permanent**: agents that need certainty
about which file is deleted MUST use specific mode with an explicit locator.
Active mode follows whatever is focused at the moment of the CLI call, which
may differ from the file the agent intended.

### Failure recovery — non-existent file

```json
{
  "name": "delete",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/AlreadyGone.md"
  }
}
```

Surfaces as
`CLI_REPORTED_ERROR` with `details.message` =
`Error: File "Inbox/AlreadyGone.md" not found.`. Recommended caller response:
verify the path, retry with the right locator if the path was wrong, or
accept that the file is already gone (the desired end-state — the file does
not exist — is already true).

## References

- [012-delete-note spec](../../specs/012-delete-note/spec.md) — feature spec,
  the user input acceptance criteria, the FR-019 live-CLI characterisation
  requirements, the SC-014 audit-trail invariant.
- [012-delete-note research](../../specs/012-delete-note/research.md) — R1–R10
  decisions plus the T0 Live-CLI Capture (2026-05-08) section that drove the
  observable behaviours documented above (including the
  `Moved to trash:` / `Deleted permanently:` response wording).
- [cli-adapter spec](../../specs/003-cli-adapter/spec.md) — the centralised
  `invokeCli` adapter that `delete` routes every call through, including
  the R5 / T002 unknown-vault response-inspection clause inherited from
  `write_note`.
- [target-mode primitive spec](../../specs/004-target-mode-schema/spec.md) —
  the shared discriminated union the input schema composes via
  `applyTargetModeRefinement(targetModeBaseSchema.extend(...))`.
- [post-010 flat encoding](../../specs/010-flatten-target-mode/spec.md) — the
  `additionalProperties: false`, no-`oneOf` JSON Schema shape published in
  `tools/list`.
- [help tool spec](../../specs/005-help-tool/spec.md) — the schema-stripping
  contract and `help({ tool_name })` lookup that surfaces this document.
- [read](./read.md) — the symmetric typed read tool.
- [write_note](./write_note.md) — the symmetric typed create/overwrite tool.
- [obsidian_exec](./obsidian_exec.md) — the freeform escape hatch retained
  for the `create` subcommand's `newtab` flag and unwrapped subcommands.
- [errors contract](../../specs/001-add-cli-bridge/contracts/errors.contract.md)
  — the canonical roster of `UpstreamError` codes.
