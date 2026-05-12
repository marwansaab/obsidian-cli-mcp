# `rename_note`

## Overview

Rename a `.md` note in an Obsidian vault **in place** — the file's folder
location is unchanged; only the filename changes. Wraps the Obsidian CLI's
`rename` subcommand and returns a typed `{ renamed, fromPath, toPath }`
envelope. Direct counterpart of [`read_note`](./read_note.md),
[`write_note`](./write_note.md), and [`delete_note`](./delete_note.md):
where those retire `obsidian_exec` for read, create/overwrite, and delete
respectively, `rename_note` retires it for in-place rename.

Folder relocation is a **separate operation** (the CLI's `move` subcommand,
wrapped by a future `move_note` typed tool). The schema rejects `name`
values containing `/` or `\` at the boundary with a `move_note` recovery
hint.

> **Link-rewriting is vault-config-dependent.** Obsidian's
> Settings → Files & Links → "Automatically update internal links" governs
> whether existing `[[wikilinks]]` and `[markdown](links)` to the renamed
> note are rewritten to the new name. `rename_note` does NOT enforce or
> override this setting — it documents the dependency so callers can verify
> the vault's configuration before relying on link integrity.

The tool supports two target modes:

- **specific** — name the vault explicitly and locate the source note by
  either a wikilink (`file`) or a vault-relative `path`. The deterministic
  path; the focused note in the editor cannot shift between parse and
  execution.
- **active** — target the active vault context. The CLI's `rename`
  subcommand with no locator renames the note currently focused in the
  Obsidian editor. **Active mode + rename has a TOCTOU caveat**: the
  focused note may shift between the time the agent decides to call and
  the time the CLI executes. Agents that need certainty about which file
  is renamed should use specific mode.

The discriminator is `target_mode`. The schema composes the shared
[target-mode primitive](../../specs/004-target-mode-schema/spec.md) plus
the `name` field with the folder-separator-rejection regex.

## Input Schema

`rename_note` consumes the discriminated union below. Every field is
rejected at the boundary as `VALIDATION_ERROR` if the constraints fail.
Unknown top-level keys are rejected (`additionalProperties: false`).

### Specific mode

```json
{
  "target_mode": "specific",
  "vault": "<vault name>",
  "path": "<vault-relative path>",
  "name": "<new file name>"
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"specific"` | YES | discriminator |
| `vault` | string | YES | length ≥ 1 |
| `file` | string | exactly one of `file`/`path` | wikilink form (e.g. `"QuickNote"`) — CLI resolves to the canonical folder-prefixed path |
| `path` | string | exactly one of `file`/`path` | vault-relative path (e.g. `"Inbox/Typo.md"`) |
| `name` | string | YES | length ≥ 1; MUST NOT contain `/` or `\` (use the future `move_note` to relocate to a different folder) |

The schema enforces "exactly one of `file` or `path`": providing both is
rejected with two issues (one per locator field); providing neither is
rejected with a root-level issue.

### Active mode

```json
{
  "target_mode": "active",
  "name": "<new file name>"
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"active"` | YES | discriminator |
| `name` | string | YES | same constraints as specific mode |
| `vault` | (n/a) | FORBIDDEN | rejected with one issue on `path: ["vault"]` |
| `file` | (n/a) | FORBIDDEN | same |
| `path` | (n/a) | FORBIDDEN | same |

### Per-mode field policy

| Field | Specific Mode | Active Mode | Default |
|-------|---------------|-------------|---------|
| `target_mode` | required (`"specific"`) | required (`"active"`) | none |
| `vault` | REQUIRED | FORBIDDEN | n/a |
| `file` | OPTIONAL (XOR with `path`) | FORBIDDEN | undefined |
| `path` | OPTIONAL (XOR with `file`) | FORBIDDEN | undefined |
| `name` | REQUIRED | REQUIRED | n/a |

### Extension-handling rule

The handler appends `.md` to `name` **only when** `name.endsWith(".md")`
returns `false`. Literal byte-equality, case-sensitive — the
predicate mirrors [020-fix-write-gaps R2](../../specs/020-fix-write-gaps/spec.md)
exactly.

| Input `name` | Forwarded as |
|---|---|
| `"Fixed"` | `"Fixed.md"` |
| `"Fixed.md"` | `"Fixed.md"` (verbatim) |
| `"Doc.v1.draft"` | `"Doc.v1.draft.md"` (internal periods preserved) |
| `"Renamed.MD"` | `"Renamed.MD.md"` (case-sensitive: `.MD` ≠ `.md`) |
| `"Sketch.canvas"` | `"Sketch.canvas.md"` (cross-extension narrowing — see Scope) |
| `"日記"` | `"日記.md"` |

## Output

```json
{ "renamed": true, "fromPath": "Inbox/Typo.md", "toPath": "Inbox/Fixed.md" }
```

| Field | Type | Description |
|-------|------|-------------|
| `renamed` | literal `true` | Always `true` on success. Failures throw `UpstreamError`. |
| `fromPath` | string | The CLI-canonical vault-relative path of the source AT THE MOMENT OF THE RENAME. For wikilink-form input (`file=`) this is the resolved folder-prefixed path. |
| `toPath` | string | The CLI-canonical vault-relative path of the destination. Folder-prefix matches `fromPath` (in-place rename). |

The handler parses the CLI's stdout against
`^Renamed: (.+?) -> (.+?)\s*$/m` (locked at T0 of /speckit-implement,
2026-05-12) and propagates the captured paths verbatim. Unparseable
success responses raise `CLI_REPORTED_ERROR`.

### Same-name no-op

When the source and destination resolve to identical canonical paths, the
CLI reports success and the response carries `fromPath === toPath` by
string equality. This is the documented audit-trail signal for "rename
was a no-op". Callers that need to distinguish "name actually changed"
from "no-op" should compare `fromPath` and `toPath` by string equality.

## Scope

`rename_note` is **scoped to `.md` notes**. The `.md` extension-handling
allowlist is exactly `{".md"}`. Out of scope:

- **Non-`.md` filename targets**: renaming `.canvas` files, `.pdf`
  attachments, image files (`.png`, `.jpg`, `.svg`), or any non-`.md`
  extension. The wrapper appends `.md` to a bare `name`, so attempting to
  rename `.canvas → .canvas` would produce `<name>.canvas.md` (a typed
  `.md` file with an internal-period that happens to look like a
  canvas extension).
- **Cross-extension type conversion**: changing `.md → .canvas`,
  `.md → .pdf`, etc. The wrapper enforces `.md` as the only recognised
  extension; supplying `name: "Sketch.canvas"` produces
  `"Sketch.canvas.md"` (still a `.md` file).
- **Folder relocation**: changing the file's folder location.
  Folder-separator characters (`/`, `\`) in `name` are rejected at the
  schema layer with a `move_note` recovery hint.

For any of the above, route through
[`obsidian_exec`](./obsidian_exec.md) directly:

```json
{
  "name": "obsidian_exec",
  "arguments": {
    "command": "rename",
    "vault": "MyVault",
    "parameters": { "path": "Drafts/Sketch.canvas", "name": "Sketch.canvas" }
  }
}
```

A future `move_note` typed tool will wrap the CLI's `move` subcommand
(parameters `file=` / `path=` / `to=`) for folder-relocation cases.

## Errors

All failure surfaces flow through `UpstreamError` per Constitution
Principle IV. `rename_note` introduces zero new error codes — the failure
surface is fully covered by codes already defined by the foundation
features.

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | The input failed `renameNoteInputSchema` validation (missing `target_mode`, missing `vault` in specific mode, neither/both `file` and `path`, forbidden key in active mode, unknown top-level key, empty `name`, `name` non-string, `name` containing `/` or `\`, etc.). | Agent retries with corrected input. `details.issues` carries the per-issue `path` + `message` + zod code. For `/` or `\` in `name`, the message includes the `move_note` recovery hint. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (file locked by an external editor on Windows, permission error, etc.). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Agent inspects `stderr` for diagnostic output. |
| `CLI_REPORTED_ERROR` | The CLI exited 0 but reported a failure in-band — either stdout starts with `Error:` (source not found, destination collision, etc.), OR the unknown-vault response (`Vault not found.`) was matched by the cli-adapter's R5 inspection, OR the success response was unparseable. | `details.message` (the first line of stdout, or the synthesised parse-failure message) names the specific failure. For "Destination file already exists!": pick a different `name`. For "File not found": verify the locator. |
| `ERR_NO_ACTIVE_FILE` | `target_mode: "active"` was used but the underlying CLI invocation reported no active file. | Operator-side: open a note in the editor, OR call again with `target_mode: "specific"` and an explicit `vault` + `file`/`path`. |

The canonical errors contract is at
[specs/001-add-cli-bridge/contracts/errors.contract.md](../../specs/001-add-cli-bridge/contracts/errors.contract.md);
`rename_note` propagates the adapter's classification verbatim with no
rewrites.

## Examples

### Specific mode — rename by path (bare `name`)

```json
{
  "name": "rename_note",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/Typo.md",
    "name": "Fixed"
  }
}
```

Spawns `obsidian vault=MyVault rename path=Inbox/Typo.md name=Fixed.md`
(`.md` appended by the wrapper). Returns
`{ "renamed": true, "fromPath": "Inbox/Typo.md", "toPath": "Inbox/Fixed.md" }`.

### Specific mode — verbatim `.md` in `name`

```json
{
  "name": "rename_note",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/Typo.md",
    "name": "Fixed.md"
  }
}
```

Spawns `obsidian vault=MyVault rename path=Inbox/Typo.md name=Fixed.md`
(no double-append: `.md` is detected via case-sensitive `endsWith`).
Returns the same shape as the previous example.

### Specific mode — internal periods preserved

```json
{
  "name": "rename_note",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Drafts/Note.md",
    "name": "Doc.v1.draft"
  }
}
```

Spawns `obsidian vault=MyVault rename path=Drafts/Note.md name=Doc.v1.draft.md`
(`.draft` is not `.md`, so `.md` is appended; internal periods kept).
Returns
`{ "renamed": true, "fromPath": "Drafts/Note.md", "toPath": "Drafts/Doc.v1.draft.md" }`.

### Active mode — rename the focused note

```json
{
  "name": "rename_note",
  "arguments": {
    "target_mode": "active",
    "name": "Today"
  }
}
```

Spawns `obsidian rename name=Today.md` (no `vault=`, no locator). Returns
`{ "renamed": true, "fromPath": "<focused note path>", "toPath": "<focused folder>/Today.md" }`.
If no note is focused, surfaces `ERR_NO_ACTIVE_FILE`.

### Failure recovery — destination collision

```json
{
  "name": "rename_note",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/A.md",
    "name": "B"
  }
}
```

If `Inbox/B.md` already exists, surfaces as `CLI_REPORTED_ERROR` with
`details.message` = `"Error: Destination file already exists!"`.
Recommended caller response: pick a different `name`, OR delete/move the
collision target first, OR delegate to the future `move_note` tool if
the source needs to land in a different folder.

### Failure recovery — folder separator in `name`

```json
{
  "name": "rename_note",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/Note.md",
    "name": "Subfolder/Note"
  }
}
```

Rejected at the schema boundary with `VALIDATION_ERROR`. The issue carries
the path `["name"]` and a message naming the `move_note` recovery hint.
Recommended caller response: use the future `move_note` tool (when
available), OR route through `obsidian_exec move` directly:

```json
{
  "name": "obsidian_exec",
  "arguments": {
    "command": "move",
    "vault": "MyVault",
    "parameters": { "path": "Inbox/Note.md", "to": "Subfolder/Note.md" }
  }
}
```

## Behavioural notes (live-CLI characterisation)

These behaviours are captured in
[research.md T0 Live-CLI Capture (2026-05-12)](../../specs/021-rename-note/research.md)
and are observable by callers.

- **Wikilink-form (`file=`) resolves to a canonical path**: the returned
  `fromPath` and `toPath` reflect the resolved folder-prefixed paths.
- **Same-name rename succeeds**: the CLI accepts source-equals-destination
  with a success response; `fromPath === toPath` in the result.
- **Source not found** surfaces as `CLI_REPORTED_ERROR` with the verbatim
  `Error: File "<path>" not found.` message.
- **Destination collision** surfaces as `CLI_REPORTED_ERROR` with the
  verbatim `Error: Destination file already exists!` message.
- **Unknown vault names** surface as `CLI_REPORTED_ERROR` with the
  verbatim `Vault not found.` message (per the cli-adapter's R5
  response-inspection clause).
- **Case-only rename on Windows NTFS** (`Note.md → note.md`): the CLI
  succeeds and emits a response with `fromPath` and `toPath` differing
  only in case. Callers that care about case-sensitivity should compare
  the two byte-perfectly.
- **Path-traversal is rejected by the CLI**: `path: "../../etc/x.md"`
  surfaces as `Error: File "../../etc/x.md" not found.` — the CLI's
  vault-relative path resolution refuses to escape the vault root. No
  tool-layer reject is added.
- **External editor open during rename** (e.g. the source note has a
  live Obsidian tab): unverified at T0; behaviour depends on Obsidian's
  buffer-management. On Windows, an exclusive lock from an external
  process may surface as `CLI_NON_ZERO_EXIT`. POSIX hosts typically allow
  the rename to proceed and the editor sees the renamed buffer.

## References

- [021-rename-note spec](../../specs/021-rename-note/spec.md) — feature
  spec, user input acceptance criteria, FR-019 live-CLI characterisation
  requirements, /speckit-clarify Q1 (extension-handling rule) + Q2
  (folder-separator-rejection rule) session 2026-05-12.
- [021-rename-note research](../../specs/021-rename-note/research.md) —
  R1–R10 decisions plus the T0 Live-CLI Capture (2026-05-12) section
  that drove the observable behaviours documented above (response
  wording, error message verbatim).
- [cli-adapter spec](../../specs/003-cli-adapter/spec.md) — the
  centralised `invokeCli` adapter that `rename_note` routes every call
  through, including the R5 unknown-vault response-inspection clause.
- [target-mode primitive spec](../../specs/004-target-mode-schema/spec.md) —
  the shared discriminated union the input schema composes via
  `applyTargetModeRefinement(targetModeBaseSchema.extend(...))`.
- [post-010 flat encoding](../../specs/010-flatten-target-mode/spec.md) —
  the `additionalProperties: false`, no-`oneOf` JSON Schema shape
  published in `tools/list`.
- [020-fix-write-gaps](../../specs/020-fix-write-gaps/spec.md) — the
  source of the `endsWith(".md")` byte-equality predicate that the
  extension-handling rule mirrors.
- [help tool spec](../../specs/005-help-tool/spec.md) — the
  schema-stripping contract and `help({ tool_name })` lookup that
  surfaces this document.
- [read_note](./read_note.md) — the symmetric typed read tool.
- [write_note](./write_note.md) — the symmetric typed create/overwrite tool.
- [delete_note](./delete_note.md) — the symmetric typed delete tool.
- [obsidian_exec](./obsidian_exec.md) — the freeform escape hatch retained
  for the `move` subcommand, cross-extension renames, and non-`.md`
  filename targets.
- [errors contract](../../specs/001-add-cli-bridge/contracts/errors.contract.md)
  — the canonical roster of `UpstreamError` codes.
