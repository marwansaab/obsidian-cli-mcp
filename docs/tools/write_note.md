# `write_note`

## Overview

Create a new note in an Obsidian vault, or overwrite an existing one when
`overwrite: true`. Wraps the Obsidian CLI's `create` subcommand and returns a
typed result describing whether a fresh file was written or an existing one was
replaced. Direct counterpart of [`read_note`](./read_note.md): where `read_note`
retired `obsidian_exec` for reads, `write_note` retires it for create/overwrite
operations. Use [`obsidian_exec`](./obsidian_exec.md) only for the `newtab` flag
or unwrapped subcommands.

The tool supports two target modes:

- **specific** — name the vault explicitly and locate the note by either a
  wikilink (`file`) or a vault-relative `path`. Use this when the agent has the
  vault and locator already in hand.
- **active** — target the active vault context. The CLI's `create` subcommand
  has no native "rewrite the focused note" primitive, so active mode wraps
  `obsidian create content=<...> overwrite` with no locator. The CLI creates a
  new file with default naming (`Untitled.md` or an auto-incremented sibling)
  in the active vault. Active mode does NOT rewrite the focused note's
  content — for that, use specific mode with the focused note's path.

The discriminator is `target_mode`. The schema composes the shared
[target-mode primitive](../../specs/004-target-mode-schema/spec.md) with three
write_note-specific active-mode rules per Clarifications 2026-05-08
([spec.md](../../specs/011-write-note/spec.md)).

## Input Schema

`write_note` consumes the discriminated union below. Every field is rejected at
the boundary as `VALIDATION_ERROR` if the constraints fail. Unknown top-level
keys are rejected (`additionalProperties: false`) — the schema is strict.

### Specific mode

```json
{
  "target_mode": "specific",
  "vault": "<vault name>",
  "path": "<vault-relative path>",
  "content": "<note body>",
  "overwrite": false,
  "open": false,
  "template": "<template name>"
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"specific"` | YES | discriminator |
| `vault` | string | YES | length ≥ 1 |
| `file` | string | exactly one of `file`/`path` | wikilink form (e.g. `"Recipe"`) — lands at vault root by default |
| `path` | string | exactly one of `file`/`path` | vault-relative path (e.g. `"Inbox/Idea.md"`) |
| `content` | string | YES | any string including `""` (empty notes are valid) |
| `template` | string | no | template name; forwarded verbatim to the CLI when present |
| `overwrite` | boolean | no — defaults to `false` | when `true`, an existing target is replaced; when `false` AND the target exists, the CLI silently auto-renames the new note (see "Behavioural notes" below) |
| `open` | boolean | no — defaults to `false` (handler reads `parsed.open ?? false`) | when `true`, the CLI opens the new file in Obsidian after creating |

The schema enforces "exactly one of `file` or `path`": providing both is
rejected with two issues (one per locator field), and providing neither is
rejected with a root-level issue.

### Active mode

```json
{
  "target_mode": "active",
  "content": "<note body>",
  "overwrite": true
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"active"` | YES | discriminator |
| `content` | string | YES | any string including `""` |
| `overwrite` | boolean | YES — must be exactly `true` | active mode is treated as a destructive operation; the explicit-opt-in posture binds uniformly (Clarifications 2026-05-08 Q1) |
| `vault` | (n/a) | FORBIDDEN | rejected at the schema layer with one issue on `path: ["vault"]` |
| `file` | (n/a) | FORBIDDEN | same |
| `path` | (n/a) | FORBIDDEN | same |
| `template` | (n/a) | FORBIDDEN | rejected per Clarifications 2026-05-08 Q3 |
| `open` | (n/a) | FORBIDDEN | rejected per Clarifications 2026-05-08 Q3 |

For the discriminator's full contract see the
[target-mode primitive spec](../../specs/004-target-mode-schema/spec.md).

## Output

```json
{ "created": true, "path": "Inbox/Idea.md" }
```

| Field | Type | Description |
|-------|------|-------------|
| `created` | boolean | `true` for fresh creations (CLI emits `Created: <path>`); `false` for overwrites of existing files (CLI emits `Overwrote: <path>`). |
| `path` | string | The canonical vault-relative path the CLI reports. May differ from the input `file` (wikilink) — the CLI resolves wikilinks to a concrete location. May also differ from the input `path` when the CLI auto-renames on collision (see below). |

The handler parses the CLI's stdout against `^(Created|Overwrote):\s+(.+?)\s*$`
and maps the prefix to the boolean. Unparseable success responses raise
`CLI_REPORTED_ERROR`.

## Behavioural notes (live-CLI characterisation)

These behaviours are captured in
[research.md T0 Live-CLI Capture](../../specs/011-write-note/research.md) and
are observable by callers — agents should plan for them.

- **Wikilink-form (`file=`) lands at vault root**: `file: "Recipe"` resolves to
  `Recipe.md` at the vault root by default, regardless of the input. The
  returned `path` reflects the resolved location.
- **Silent auto-rename on collision when `overwrite=false`**: if the target
  path already exists and `overwrite` is omitted or `false`, the CLI does NOT
  raise an error — it auto-renames the new file (e.g. `Existing.md` →
  `Existing 1.md`) and returns `created: true` with the renamed path. Callers
  who require strict-fail-on-collision semantics MUST pass `overwrite: true`
  AND inspect the returned `path` against the input.
- **Active mode auto-naming**: `target_mode: "active"` produces `Untitled.md`
  (or an auto-incremented sibling if `Untitled.md` already exists) at the
  active vault's default location. Active mode does NOT rewrite the focused
  note's content.
- **Empty `content` is valid**: `content: ""` creates a zero-byte note.
- **Verbatim payloads**: line endings, BOMs, and Unicode normalisation are
  passed through to the CLI verbatim — the bridge does not transform content.
- **OS argv-length ceilings**: very large `content` values fail at spawn time
  (≈32 KiB on Windows, ≈2 MiB on Linux). The bridge does not chunk; oversize
  inputs surface as `CLI_NON_ZERO_EXIT` or platform-specific spawn errors.
- **Path-traversal**: vault-relative paths containing `../` segments are
  rejected by the CLI with an unstructured `TypeError` (exit 0, no file
  written). The bridge does NOT add a tool-layer path-traversal reject —
  callers SHOULD sanitize paths upstream rather than rely on the CLI's
  unstructured rejection wording.
- **Unknown vault names** surface as `CLI_REPORTED_ERROR` with the verbatim
  `Vault not found.` message (per the cli-adapter's R5 / T002
  response-inspection clause). Listing valid vault names is out of scope for
  `write_note`; use `obsidian_exec` with `command=vaults` if needed.
- **Non-existent template / no template folder** surfaces as
  `CLI_REPORTED_ERROR` with the verbatim `Error: No template folder
  configured.` message (or similar) — the CLI conflates "template folder
  missing" and "named template not found" under the same wording.

## Errors

All failure surfaces flow through `UpstreamError` per Constitution Principle
IV. `write_note` introduces zero new error codes — the failure surface is
fully covered by codes already defined by the foundation features.

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | The input failed `writeNoteInputSchema` validation (missing `target_mode`, missing `vault` / `content` in specific mode, neither/both `file` and `path`, forbidden key in active mode, active mode without `overwrite: true`, active mode with `template` / `open`, unknown top-level key, etc.). | Agent retries with corrected input. `details.issues` carries the per-issue `path` + `message` + zod code. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (target outside vault, permission error, etc.). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Agent inspects `stderr` for diagnostic output. |
| `CLI_REPORTED_ERROR` | The CLI exited 0 but reported a failure in-band — either stdout starts with `Error:`, OR the unknown-vault response (`Vault not found.`) was matched by the cli-adapter's R5 inspection, OR the success-response was unparseable. | `details.message` (the first line of stdout, or the synthesised parse-failure message) names the specific failure. |
| `ERR_NO_ACTIVE_FILE` | `target_mode: "active"` was used but the underlying CLI invocation reported no active file. | Operator-side: open a note in the editor, OR call again with `target_mode: "specific"` and an explicit `vault` + `file`/`path`. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |

The canonical errors contract is at
[specs/001-add-cli-bridge/contracts/errors.contract.md](../../specs/001-add-cli-bridge/contracts/errors.contract.md);
`write_note` propagates the adapter's classification verbatim with no rewrites.

## Examples

### Specific mode — fresh creation by path

```json
{
  "name": "write_note",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/Idea.md",
    "content": "# Idea\n\nBody\n"
  }
}
```

Spawns `obsidian vault=MyVault create path=Inbox/Idea.md content="# Idea\n\nBody\n"`.
Returns `{ "created": true, "path": "Inbox/Idea.md" }`.

The TypeScript-flavoured form: `write_note({ target_mode: "specific", vault: "MyVault", path: "Inbox/Idea.md", content: "# Idea\n\nBody\n" })`.

### Specific mode — fresh creation by wikilink (`file=`)

```json
{
  "name": "write_note",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "file": "Recipe",
    "content": "# Recipe\n\nIngredients...\n"
  }
}
```

Spawns `obsidian vault=MyVault create name=Recipe content="# Recipe\n\nIngredients...\n"`.
The user-facing `file` field is renamed to the CLI's `name=` argv key (the
`create` subcommand uses `name=` while `read` uses `file=` — `write_note`
unifies the user-facing field for parity). Returns
`{ "created": true, "path": "Recipe.md" }` (resolved canonical path).

### Specific mode — overwrite an existing note

```json
{
  "name": "write_note",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/Idea.md",
    "content": "# Idea (revised)\n",
    "overwrite": true
  }
}
```

Spawns `obsidian vault=MyVault create path=Inbox/Idea.md content="..." overwrite`.
Returns `{ "created": false, "path": "Inbox/Idea.md" }` — `created` is `false`
because the CLI emitted `Overwrote:`, signalling an existing file was
replaced.

### Active mode — write in active vault context

```json
{
  "name": "write_note",
  "arguments": {
    "target_mode": "active",
    "content": "# Quick capture\n",
    "overwrite": true
  }
}
```

Spawns `obsidian create content="# Quick capture\n" overwrite` (no vault, no
locator). The CLI uses the active vault and creates `Untitled.md` (or an
auto-incremented sibling) at the active vault's default location. Returns
`{ "created": true, "path": "Untitled.md" }`. Use specific mode if you need
deterministic placement.

### Specific mode with a template

```json
{
  "name": "write_note",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Daily/2026-05-08.md",
    "content": "Body\n",
    "template": "Daily"
  }
}
```

Spawns `obsidian vault=MyVault create path=Daily/2026-05-08.md content=Body\n template=Daily`.
The CLI's behaviour when both `content` and `template` are present is its own
contract — refer to your Obsidian template configuration. If no template
folder is configured, the call surfaces as `CLI_REPORTED_ERROR` with the
verbatim `Error: No template folder configured.` message.

## References

- [011-write-note spec](../../specs/011-write-note/spec.md) — feature spec, the
  three Clarifications 2026-05-08 active-mode rules, the FR-019 live-CLI
  characterisation requirements.
- [011-write-note research](../../specs/011-write-note/research.md) — R1–R10
  decisions plus the T0 Live-CLI Capture (2026-05-08) section that drove the
  observable behaviours documented above.
- [cli-adapter spec](../../specs/003-cli-adapter/spec.md) — the centralised
  `invokeCli` adapter that `write_note` routes every call through, including
  the R5 / T002 unknown-vault response-inspection clause added by this BI.
- [target-mode primitive spec](../../specs/004-target-mode-schema/spec.md) —
  the shared discriminated union the input schema composes via
  `applyTargetModeRefinement(targetModeBaseSchema.extend(...))`.
- [post-010 flat encoding](../../specs/010-flatten-target-mode/spec.md) — the
  `additionalProperties: false`, no-`oneOf` JSON Schema shape published in
  `tools/list`.
- [help tool spec](../../specs/005-help-tool/spec.md) — the schema-stripping
  contract and `help({ tool_name })` lookup that surfaces this document.
- [read_note](./read_note.md) — the symmetric typed read tool.
- [obsidian_exec](./obsidian_exec.md) — the freeform escape hatch retained
  for the `newtab` flag and unwrapped subcommands.
- [errors contract](../../specs/001-add-cli-bridge/contracts/errors.contract.md)
  — the canonical roster of `UpstreamError` codes.
