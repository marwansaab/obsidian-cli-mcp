# `read`

## Overview

Read a note's raw text from an Obsidian vault. Returns the note's UTF-8 content
verbatim from the CLI's stdout — no transformation, no normalization.

The tool supports two target modes:

- **specific** — name the vault explicitly and locate the note by either a
  wikilink (`file`) or a vault-relative `path`. Use this when the agent has the
  vault and locator already in hand.
- **active** — read whatever note is currently focused in Obsidian's editor.
  Use this when the agent wants to inspect what the user is working on without
  asking for a vault or filename.

The discriminator is `target_mode`. The schema is the shared
[target-mode primitive](../../specs/004-target-mode-schema/spec.md) — read
adds zero tool-specific fields beyond what the primitive defines.

## Input Schema

`read` consumes the discriminated union below. Every field is rejected at
the boundary as `VALIDATION_ERROR` if the constraints fail.

### Specific mode

```json
{
  "target_mode": "specific",
  "vault": "<vault name>",
  "file": "<wikilink>"
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"specific"` | YES | discriminator |
| `vault` | string | YES | length ≥ 1 |
| `file` | string | exactly one of `file`/`path` | wikilink form (e.g. `"Recipe"`) |
| `path` | string | exactly one of `file`/`path` | vault-relative path (e.g. `"Templates/Recipe.md"`) |

The schema enforces "exactly one of `file` or `path`": providing both is rejected
with two issues (one per locator field), and providing neither is rejected with
a root-level issue. Empty-string locators (`file: ""` or `path: ""`) are NOT
rejected at the schema layer — they forward to the CLI verbatim and surface as
`CLI_NON_ZERO_EXIT` or `CLI_REPORTED_ERROR` if the CLI rejects them.

### Active mode

```json
{ "target_mode": "active" }
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"active"` | YES | discriminator |

`vault`, `file`, and `path` are FORBIDDEN in active mode and rejected at the
schema layer (one issue per forbidden key found, even if the value is
explicitly `undefined`).

For the discriminator's full contract see the
[target-mode primitive spec](../../specs/004-target-mode-schema/spec.md).

## Output

```json
{ "content": "<note text>" }
```

| Field | Type | Description |
|-------|------|-------------|
| `content` | string | The note's UTF-8 raw text, verbatim from `stdout`. Empty strings are valid (empty notes succeed). |

The bridge does not trim, transform, normalize line endings, strip BOMs, or
post-process the body in any way. Whatever the Obsidian CLI emits to stdout is
what the agent receives.

## Errors

All failure surfaces flow through `UpstreamError` per Constitution Principle IV.
Read_note introduces zero new error codes — the failure surface is fully covered
by codes already defined by the foundation features.

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | The input failed `readNoteInputSchema` validation (missing `target_mode`, missing `vault` in specific mode, neither/both `file` and `path`, forbidden key in active mode, etc.). | Agent retries with corrected input. `details.issues` carries the per-issue path + message + zod code. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (note doesn't exist, vault unknown, etc.). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Agent inspects `stderr` for diagnostic output. |
| `CLI_REPORTED_ERROR` | The CLI exited 0 but stdout (after `.trimStart()`) starts with `Error:` (and is NOT the more-specific `Error: no active file` case). | `details.message` (the first line of stdout) names the specific failure. |
| `ERR_NO_ACTIVE_FILE` | `target_mode: "active"` was used but no note is focused in Obsidian. | Operator-side: open a note in the editor, OR call again with `target_mode: "specific"` and explicit `vault` + `file`/`path`. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |

The canonical errors contract is at
[specs/001-add-cli-bridge/contracts/errors.contract.md](../../specs/001-add-cli-bridge/contracts/errors.contract.md);
read propagates the adapter's classification verbatim with no rewrites.

## Examples

### Specific mode by wikilink

```json
{
  "name": "read",
  "arguments": { "target_mode": "specific", "vault": "MyVault", "file": "Recipe" }
}
```

Spawns `obsidian read vault=MyVault file=Recipe`. Returns
`{ "content": "<the raw text of Recipe.md>" }`.

The TypeScript-flavoured form: `read({ target_mode: "specific", vault: "MyVault", file: "Recipe" })`.

### Specific mode by vault-relative path

```json
{
  "name": "read",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Templates/Recipe.md"
  }
}
```

Spawns `obsidian read vault=MyVault path=Templates/Recipe.md`. Returns the
template's body in `content`.

### Active mode

```json
{ "name": "read", "arguments": { "target_mode": "active" } }
```

The TypeScript-flavoured form: `read({ target_mode: "active" })`. Spawns
`obsidian read` with no key=value tokens. Returns the focused note's body, OR
raises `ERR_NO_ACTIVE_FILE` if no note is focused.

## References

- [cli-adapter spec](../../specs/003-cli-adapter/spec.md) — the centralised
  adapter `invokeCli` that read routes every call through.
- [target-mode primitive spec](../../specs/004-target-mode-schema/spec.md) —
  the shared discriminated union read re-exports as its input schema.
- [help tool spec](../../specs/005-help-tool/spec.md) — the schema-stripping
  contract and `help({ tool_name })` lookup that surfaces this document.
- [errors contract](../../specs/001-add-cli-bridge/contracts/errors.contract.md)
  — the canonical roster of `UpstreamError` codes.
