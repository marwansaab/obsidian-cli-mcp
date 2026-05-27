# `delete`

## Overview

Delete a note from an Obsidian vault. Wraps the Obsidian CLI's `delete` subcommand and returns `{ deleted, path, toTrash }`. Default behaviour sends the file to the OS trash (recoverable until the trash is emptied); `permanent: true` skips the trash and removes the file unrecoverably.

> **Irreversibility warning.** `permanent: true` cannot be undone. There is no recovery path through Obsidian or the OS. Use the default (`permanent: false` or omit) whenever recoverability matters.

## When to use this tool

| You want to | Reach for |
|---|---|
| Delete a single note (recoverable via OS trash) | `delete` |
| Delete a single note permanently | `delete` with `permanent: true` |
| Remove a file you intend to recreate immediately | [`write_note`](./write_note.md) with `overwrite: true` |
| Rename a note in place | [`rename`](./rename.md) |
| Move a note to a different folder | [`move`](./move.md) |
| Delete via the CLI's `create` subcommand's `newtab` flag, or any unwrapped delete-adjacent subcommand | [`obsidian_exec`](./obsidian_exec.md) |

## Input Schema

`delete` consumes the discriminated union below. Every field is rejected at the boundary as `VALIDATION_ERROR` if the constraints fail. Unknown top-level keys are rejected (`additionalProperties: false`).

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
| `permanent` | boolean | no — defaults to `false` | `true` skips OS trash and deletes unrecoverably; `false` or omitted sends to OS trash |

The schema enforces "exactly one of `file` or `path`": providing both is rejected with two issues (one per locator field); providing neither is rejected with a root-level issue.

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
| `permanent` | boolean | no — defaults to `false` | same semantics as specific mode |
| `vault` | (n/a) | FORBIDDEN | rejected with one issue on `path: ["vault"]` |
| `file` | (n/a) | FORBIDDEN | same |
| `path` | (n/a) | FORBIDDEN | same |

> **Active mode + `permanent: true` TOCTOU caveat.** The focused note may shift between the time the agent decides to call and the time the CLI executes. Agents that need certainty about which file is deleted MUST use specific mode with an explicit locator, especially when combined with `permanent: true`.

### Per-mode field policy

| Field | Specific Mode | Active Mode | Default |
|-------|---------------|-------------|---------|
| `target_mode` | required (`"specific"`) | required (`"active"`) | none |
| `vault` | REQUIRED | FORBIDDEN | n/a |
| `file` | OPTIONAL (XOR with `path`) | FORBIDDEN | undefined |
| `path` | OPTIONAL (XOR with `file`) | FORBIDDEN | undefined |
| `permanent` | OPTIONAL | OPTIONAL | `false` |

`permanent` is permitted in active mode. The irreversibility applies regardless of how the locator is resolved.

## Output

```json
{ "deleted": true, "path": "Inbox/Old.md", "toTrash": true }
```

| Field | Type | Description |
|-------|------|-------------|
| `deleted` | literal `true` | Always `true` on success. Failures throw `UpstreamError` and never produce a `deleted: false` shape. |
| `path` | string | The CLI-canonical vault-relative path AT THE MOMENT OF DELETION. For wikilink-form input (`file=`) this is the resolved folder-prefixed path. |
| `toTrash` | boolean | `true` — file went to the OS trash (recoverable); `false` — file was permanently deleted. **Derived structurally from input**: `toTrash === !permanent`. |

### Audit-trail signal

`toTrash === false` is the audit signal for irreversible deletions. Operators auditing logs filter on `toTrash === false` to surface every irreversible deletion. The typed `permanent` flag IS the audit point — the structural derivation guarantees the two stay in lockstep regardless of CLI response wording.

## Behavioural notes

- **Wikilink-form (`file=`) resolves to a canonical path**: `file: "QuickNote"` resolves to the canonical folder-prefixed path the CLI echoes (e.g. `1000- Testing/QuickNote.md`). The returned `path` reflects the resolved location.
- **Active mode follows the focused note**: `target_mode: "active"` deletes the note currently focused in the Obsidian editor. If no note is focused, the CLI surfaces `ERR_NO_ACTIVE_FILE`. Combined with `permanent: true`, the TOCTOU caveat above applies — focus may shift between parse and execution.
- **Path-traversal is NOT normalised by the CLI**: vault-relative paths containing `../` segments are treated as literal multi-component path components, NOT resolved. `subdir/../foo.md` is looked up as the literal string, NOT as `foo.md`. There is no vault-escape vector via path-traversal on the CLI's side; the wrapper does not add a tool-layer reject.
- **Unknown vault names** surface as `CLI_REPORTED_ERROR` with the verbatim `Vault not found.` message.
- **File not found** surfaces as `CLI_REPORTED_ERROR` with the verbatim `Error: File "<path>" not found.` message. The path quoting in the message is the CLI's own — agents should not strip it.
- **OS-reserved names on Windows** (`CON`, `PRN`, `AUX`, etc.): the CLI is the trust boundary. Whatever the CLI does — accept, reject, normalise — the wrapper forwards verbatim. There is no tool-layer reserved-name list.
- **File locked by an external editor**: typically surfaces as `CLI_NON_ZERO_EXIT` on Windows (where the OS holds an exclusive lock). POSIX hosts generally allow the delete to proceed and the editor sees a stale buffer.
- **Trash-volume-full on Windows**: on a full Windows recycle bin, the CLI's behaviour is unverified — it may surface a structured error, OR it may silently fall back to permanent delete. Callers who require audit-grade confidence in the to-trash signal SHOULD verify the file's presence in the OS trash out-of-band when handling notes on volumes with constrained recycle-bin capacity.

## Errors

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | The input failed schema validation (missing `target_mode`, missing `vault` in specific mode, neither/both `file` and `path`, forbidden key in active mode, unknown top-level key, `permanent` non-boolean, etc.). | Retry with corrected input. `details.issues` carries the per-issue `path` + `message` + zod code. Note: `permanent: true` IS valid at the schema layer; the resulting deletion is NOT recoverable from the file system. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (file locked, permission error on Windows, etc.). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Inspect `stderr` for diagnostic output. |
| `CLI_REPORTED_ERROR` | The CLI exited 0 but reported a failure in-band — either stdout starts with `Error:` (file not found, etc.), OR the unknown-vault response (`Vault not found.`) was detected, OR the success-response was unparseable. | `details.message` (the first line of stdout, or the synthesised parse-failure message) names the specific failure. For "file not found": the file may already be gone — verify the path, retry with the right locator, or accept that the delete is already accomplished. |
| `ERR_NO_ACTIVE_FILE` | `target_mode: "active"` was used but no note is focused in Obsidian. | Open a note in the editor, OR call again with `target_mode: "specific"` and an explicit `vault` + `file`/`path`. **For an irreversible operation, specific mode is the safer choice regardless of whether a note is focused.** |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |

## Examples

### (i) Specific mode — to-trash delete by path (default, recoverable)

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

Spawns `obsidian vault=MyVault delete path=Inbox/Old.md`. Returns `{ "deleted": true, "path": "Inbox/Old.md", "toTrash": true }`. The file is recoverable from the OS trash until the trash is emptied.

### (ii) Specific mode — to-trash delete by wikilink (`file=`)

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

Spawns `obsidian vault=MyVault delete file=QuickNote`. The user-facing `file` field maps directly to the CLI's `file=` argv key. Returns `{ "deleted": true, "path": "<resolved canonical path>", "toTrash": true }`.

### (iii) Specific mode — permanent delete (irreversible)

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

Spawns `obsidian vault=MyVault delete path=Inbox/Old.md permanent`. Returns `{ "deleted": true, "path": "Inbox/Old.md", "toTrash": false }`.

> **This cannot be undone.** The file is removed from both the vault and the OS trash. There is no recovery path through Obsidian or the OS.

### (iv) Active mode — delete the focused note

```json
{
  "name": "delete",
  "arguments": {
    "target_mode": "active"
  }
}
```

Spawns `obsidian delete` (no vault, no locator). The CLI deletes the note currently focused in the Obsidian editor. Returns `{ "deleted": true, "path": "<focused note path>", "toTrash": true }`. If no note is focused, surfaces `ERR_NO_ACTIVE_FILE`.

### (v) Failure recovery — non-existent file

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

Surfaces as `CLI_REPORTED_ERROR` with `details.message: 'Error: File "Inbox/AlreadyGone.md" not found.'`. Verify the path, retry with the right locator if the path was wrong, or accept that the file is already gone (the desired end-state is already true).
