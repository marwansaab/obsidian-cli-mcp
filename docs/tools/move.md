# `move`

## Overview

Move a file within an Obsidian vault, optionally renaming it in the same operation. Returns a typed `{ moved, fromPath, toPath }` envelope.

**Works on any file type** (notes, canvases, bases, attachments and others), and **the file keeps its type**: a destination without an extension gets the file's own extension, and a destination carrying another core type's extension is rejected with `UNSUPPORTED_FILE_TYPE` before anything is moved (spec 070). Changing a file's type deliberately goes through [`obsidian_exec`](./obsidian_exec.md). See *Destination (`to`) shape rules* below.

Same-folder `move` calls (where `to` resolves to a destination whose folder matches the source's folder) are equivalent to a rename — callers can choose between `move` and [`rename`](./rename.md) based on ergonomic preference.

> **Link-rewriting is vault-config-dependent.** Obsidian's Settings → Files & Links → "Automatically update internal links" governs whether existing `[[wikilinks]]` and `[markdown](links)` to the moved note are rewritten to the new path. `move` does NOT enforce or override this setting — it documents the dependency so callers can verify the vault's configuration before relying on link integrity. Aliased wikilinks (`[[Real Path|Display]]`) have the path side rewritten while the display text persists; outgoing-link references inside the moved file may need separate attention.

## When to use this tool

| You want to | Reach for |
|---|---|
| Move a note, canvas, base, attachment or other file to a different folder (with or without renaming) | `move` |
| Rename a file in place (no folder change) | [`rename`](./rename.md) |
| Delete a note | [`delete`](./delete.md) |
| Create / overwrite a note's contents | [`write_note`](./write_note.md) |
| Change a file's type (e.g. `.md` → `.canvas`) | [`obsidian_exec`](./obsidian_exec.md) — `move` keeps a file's type |
| Move a whole folder | Not supported by this tool — route through [`obsidian_exec`](./obsidian_exec.md) |

## Input schema

`move` consumes the flat input shape below. Every field is rejected at the boundary as `VALIDATION_ERROR` if the constraints fail. Unknown top-level keys are rejected (`additionalProperties: false`).

### Specific mode

```json
{
  "target_mode": "specific",
  "vault": "<vault name>",
  "path": "<vault-relative path>",
  "to": "<destination>"
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"specific"` | YES | discriminator |
| `vault` | string | YES | length ≥ 1 |
| `file` | string | exactly one of `file`/`path` | wikilink form (e.g. `"QuickNote"`) — the CLI resolves to the canonical folder-prefixed path |
| `path` | string | exactly one of `file`/`path` | vault-relative path (e.g. `"Inbox/Typo.md"`) |
| `to` | string | YES | length ≥ 1; trailing `/` discriminates folder-target from full-path-target |

### Active mode

```json
{
  "target_mode": "active",
  "to": "<destination>"
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"active"` | YES | discriminator |
| `to` | string | YES | same constraints as specific mode |
| `vault` | (n/a) | FORBIDDEN | rejected with one issue on `path: ["vault"]` |
| `file` | (n/a) | FORBIDDEN | same |
| `path` | (n/a) | FORBIDDEN | same |

**Source resolution.** With `file`, the wrapper first resolves the name with one extra `obsidian file file=<name>` call (so the destination rule below can see the source's type), then forwards the original `file=` to `move`. In active mode, it first resolves the focused file with one extra focused-file `eval` call, then moves that resolved path with `path=<focused path>` and no `vault=`, so the CLI uses the same vault the lookup read and a focus change to another file between the two calls cannot redirect the move. Resolution failures (a `file` name that does not resolve, `ERR_NO_ACTIVE_FILE`) surface before anything else. `path` calls need no extra call.

**Active mode caveat:** the focused file may not be the one the agent had in mind when it decided to call. Agents that need certainty about which file is moved should use specific mode.

## Destination (`to`) shape rules — LOAD-BEARING

> **ALWAYS include trailing `/` when you mean a folder target.** The wrapper uses a strict trailing-`/` discriminator: `to: "Archive/"` is a folder-target (source filename preserved inside the folder); `to: "Archive"` (no trailing `/`) is a full-path-target (the literal string is treated as the destination filename at the vault root). No heuristic disambiguation, no validation reject — the wrapper trusts the caller's shape.

The handler runs a small `resolveTo(to, fromPath)` transform on the incoming `to` value, where `fromPath` is the source's path (the resolved path for `file` and active calls). The type-preservation rule of Branch 2 applies in every mode. The folder-target expansion of Branch 1 is spelled out by the wrapper only for the `path` locator; in `file=` and active modes a folder-target `to` is forwarded as given and the CLI keeps the basename itself.

### Branch 1 — folder-target (`to` ends with `/`)

The wrapper appends the source basename to `to`. The source filename, extension included, is preserved at the new location.

| Input `to` | Input `path` | Forwarded `to=` |
|-----|-----|-----|
| `"Archive/"` | `"Inbox/Note.md"` | `"Archive/Note.md"` |
| `"Archive/2026/"` | `"Inbox/Tax-2026.md"` | `"Archive/2026/Tax-2026.md"` |
| `"Archive/"` | `"Drafts/Doc.v1.draft.md"` | `"Archive/Doc.v1.draft.md"` |
| `"Archive/"` | `"Boards/Plan.canvas"` | `"Archive/Plan.canvas"` |

### Branch 2 — full-path-target (`to` does NOT end with `/`)

The wrapper treats the final segment of `to` as the destination filename, and **the file keeps its type** (spec 070). Comparing the source's extension with the extension of `to`'s final segment (the text after its last `.`):

1. If `to` ends in a **core** extension (`.md`, `.canvas`, `.base`, or an attachment extension such as `.png` or `.pdf`) that differs from the source's, ignoring case, the call is rejected with `VALIDATION_ERROR` + `details.code: "UNSUPPORTED_FILE_TYPE"`, `details.reason: "type-change"`. Nothing is moved.
2. If the source has no extension, `to` is forwarded as given.
3. If `to` already carries the source's extension, it is forwarded as given. For a `.md` source this check is the literal, case-sensitive `endsWith(".md")` it has always been — `.MD` is NOT treated as `.md` — so Markdown behaviour is unchanged; for every other source it ignores case.
4. Otherwise the wrapper appends `.` plus the source's extension, in the source's own spelling. An extension that is not a core type (`.v1`, `.draft`, `.txt`) counts as part of the name.

The append in step 4 is required for every source type, not only notes: the CLI reads an extensionless `to` as a **folder**, so `to: "Archive/Roadmap"` forwarded as given on a canvas would try to create `Archive/Roadmap/Plan.canvas` (and fail with `ENOENT` when that folder does not exist). This rule replaces the earlier source-`.md` guard, which forwarded a non-`.md` source's extensionless `to` as given and a caller-explicit `.md` verbatim.

| Input `to` | Input `path` | Forwarded `to=` | Why |
|-----|-----|-----|-----|
| `"Archive/Renamed.md"` | `"Inbox/Note.md"` | `"Archive/Renamed.md"` | Verbatim — filename already `.md` (unchanged) |
| `"Archive/Renamed"` | `"Inbox/Note.md"` | `"Archive/Renamed.md"` | Source extension appended (unchanged) |
| `"Archive/Doc.v1.draft"` | `"Inbox/Note.md"` | `"Archive/Doc.v1.draft.md"` | Non-core segments are part of the name (unchanged) |
| `"Archive/Renamed.MD"` | `"Inbox/Note.md"` | `"Archive/Renamed.MD.md"` | Markdown keeps the byte-exact check: `.MD` ≠ `.md` (unchanged) |
| `"Archive/Sketch.canvas"` | `"Inbox/Note.md"` | — | Rejected: `type-change` |
| `"Archive/Roadmap"` | `"Boards/Plan.canvas"` | `"Archive/Roadmap.canvas"` | Source extension appended (the CLI would otherwise read `Archive/Roadmap` as a folder) |
| `"Archive/Roadmap.canvas"` | `"Boards/Plan.canvas"` | `"Archive/Roadmap.canvas"` | Verbatim, no doubling |
| `"Archive/Plan.md"` | `"Boards/Plan.canvas"` | — | Rejected: `type-change` (before spec 070 this was forwarded verbatim and made the canvas a `.md` file) |
| `"Archive/Plan.v2"` | `"Boards/Plan.canvas"` | `"Archive/Plan.v2.canvas"` | Non-core segment is part of the name |
| `"Archive/Open Tasks"` | `"Views/Tasks.base"` | `"Archive/Open Tasks.base"` | Source extension appended |
| `"Archive/New"` | `"Att/Photo.PNG"` | `"Archive/New.PNG"` | Appended in the source's spelling |
| `"Archive/New.png"` | `"Att/Photo.PNG"` | `"Archive/New.png"` | Same type, case-only difference |
| `"Archive/New.jpg"` | `"Att/Photo.png"` | — | Rejected: `type-change` (a different attachment type) |
| `"Archive/Readme2"` | `"Misc/README"` | `"Archive/Readme2"` | Source has no extension, so there is none to keep |
| `"Archive/done"` | `"Misc/todo.txt"` | `"Archive/done.txt"` | Non-core source extension kept |
| `"Archive"` | `"Welcome.md"` | `"Archive.md"` | **Surprise case** — `to: "Archive"` (no trailing `/`) is a full-path-target; the extension is appended; effective result is the file at vault-root `Archive.md`, NOT inside an `Archive/` folder |

### `to: "Archive"` — the surprise case worked twice

```json
{ "target_mode": "specific", "vault": "V", "path": "Welcome.md", "to": "Archive" }
```

This forwards `to=Archive.md` — the file lands at vault-root `Archive.md`. If the caller actually meant "move this file into the `Archive` folder", they MUST use `"Archive/"`.

```json
{ "target_mode": "specific", "vault": "V", "path": "Boards/Plan.canvas", "to": "Archive" }
```

This forwards `to=Archive.canvas` — the canvas keeps its type and lands at vault-root `Archive.canvas`. Again, use `"Archive/"` to move it into the folder.

## Output

```json
{ "moved": true, "fromPath": "Inbox/Note.md", "toPath": "Archive/Note.md" }
```

| Field | Type | Description |
|-------|------|-------------|
| `moved` | literal `true` | Always `true` on success. Failures throw `UpstreamError`. |
| `fromPath` | string | The CLI-canonical vault-relative path of the source at the moment of the move. For wikilink-form input (`file=`) this is the resolved folder-prefixed path. |
| `toPath` | string | The CLI-canonical vault-relative path of the destination after the move. |

### Same-folder move — rename equivalence

When `to` resolves to a destination whose folder matches the source's folder, the operation is effectively a rename. The wrapper does NOT special-case this; the CLI handles the same-folder move identically to a cross-folder move. The structural marker `dirname(fromPath) === dirname(toPath)` is observable from the caller. Use [`rename`](./rename.md) when only the filename changes (simpler surface, no `to`-shape rules); use `move` with `to` whose folder portion matches the source's folder if you prefer the unified surface.

## Errors

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | The input failed schema validation (missing `target_mode`, missing `vault` in specific mode, neither/both `file` and `path`, forbidden key in active mode, unknown top-level key, empty `to`, `to` non-string, etc.). | Retry with corrected input. `details.issues` carries the per-issue `path` + `message` + zod code. |
| `VALIDATION_ERROR` (`details.code: "UNSUPPORTED_FILE_TYPE"`, `details.reason: "type-change"`) | The final segment of `to` ends in a core extension different from the source's (for example `"Archive/Plan.md"` on a `.canvas` source). Raised before the `move` call; for `file` and active calls, after the source resolves. `details` carries `path` (the resolved source path), `extension` (the source's, original case), `supported` (all four categories: `["note", "canvas", "base", "attachment"]`), `destination` (`to` as given), `destinationExtension`, and `alternative: "obsidian_exec"`. | Nothing was changed. Omit the extension (or give the source's own) to keep the type, or use [`obsidian_exec`](./obsidian_exec.md) to change the type deliberately. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN`. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (file locked by an external editor on Windows, permission error, etc.). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Inspect `stderr` for diagnostic output. |
| `CLI_REPORTED_ERROR` (`details.message: "Vault not found."`) | Unknown vault. | Verify the vault name; ensure the vault is registered in Obsidian. |
| `CLI_REPORTED_ERROR` (`details.message: 'Error: File "<path>" not found.'`) | Source not found (for `file`, reported by the resolver call before the move). | Verify the locator (`file` or `path`). |
| `CLI_REPORTED_ERROR` (`details.message: "Error: Destination file already exists!"`) | Destination collision. | Pick a different `to`, OR delete the collision target first. |
| `CLI_REPORTED_ERROR` (`details.stage: "parse"`) | Unparseable success response — upstream output drift. | `details.stdout` carries verbatim output. Investigate as a regression. |
| `ERR_NO_ACTIVE_FILE` | Active mode invoked while no file is focused. Raised by the focused-file lookup before the `move` call: either the lookup reports no focused file, or the CLI replies `"Error: No active file."` and the dispatch classifier reclassifies it as this typed code. | Switch to specific mode with explicit `vault` + `file`/`path`, OR ask the user to open a note in Obsidian. |

## Examples

### (i) Folder-target move

```json
{
  "name": "move",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/Note.md",
    "to": "Archive/"
  }
}
```

Spawns `obsidian vault=MyVault move path=Inbox/Note.md to=Archive/Note.md` (source basename preserved per folder-target branch). Returns `{ "moved": true, "fromPath": "Inbox/Note.md", "toPath": "Archive/Note.md" }`.

### (ii) Full-path-target move with rename

```json
{
  "name": "move",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/Note.md",
    "to": "Archive/Renamed.md"
  }
}
```

Spawns `obsidian vault=MyVault move path=Inbox/Note.md to=Archive/Renamed.md` (file moved and renamed in one operation). Returns `{ "moved": true, "fromPath": "Inbox/Note.md", "toPath": "Archive/Renamed.md" }`.

### (iii) Destination collision

```json
{
  "name": "move",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/A.md",
    "to": "Archive/B.md"
  }
}
```

If `Archive/B.md` already exists, surfaces as `CLI_REPORTED_ERROR` with `details.message: "Error: Destination file already exists!"`. Pick a different `to`, OR delete the collision target first.

### (iv) Auto-link-update caveat (setting-dependent)

```json
{
  "name": "move",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/Note.md",
    "to": "Archive/"
  }
}
```

The CLI moves the file. Whether existing wikilinks `[[Inbox/Note]]` in other vault notes are rewritten to `[[Archive/Note]]` depends on the vault's Settings → Files & Links → "Automatically update internal links" setting. With the setting ENABLED, Obsidian rewrites the links; DISABLED, the links remain pointing at the old path (and will resolve to "unresolved" until the target exists again at that path).

### (v) A canvas keeps its type

```json
{
  "name": "move",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Boards/Plan.canvas",
    "to": "Archive/Plan-Archived"
  }
}
```

Spawns `obsidian vault=MyVault move path=Boards/Plan.canvas to=Archive/Plan-Archived.canvas` — the source's `.canvas` extension is appended, so the file lands at `Archive/Plan-Archived.canvas` rather than being read by the CLI as a folder. Returns `{ "moved": true, "fromPath": "Boards/Plan.canvas", "toPath": "Archive/Plan-Archived.canvas" }`. **No silent `.canvas → .md` conversion**: the same call with `to: "Archive/Plan.md"` is rejected before any `move` call:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "move: Boards/Plan.canvas is a canvas; the destination \"Archive/Plan.md\" would make it a note. rename and move keep a file's type. Nothing was changed. Omit the extension to keep it a canvas, or use obsidian_exec to change the type deliberately.",
  "details": {
    "code": "UNSUPPORTED_FILE_TYPE",
    "reason": "type-change",
    "path": "Boards/Plan.canvas",
    "extension": "canvas",
    "supported": ["note", "canvas", "base", "attachment"],
    "destination": "Archive/Plan.md",
    "destinationExtension": "md",
    "alternative": "obsidian_exec"
  }
}
```

### (vi) The `to: "Archive"` surprise case

```json
{
  "name": "move",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Welcome.md",
    "to": "Archive"
  }
}
```

Spawns `obsidian vault=MyVault move path=Welcome.md to=Archive.md`. The strict trailing-`/` discriminator treats `"Archive"` as a full-path-target; the file is moved to vault-root `Archive.md`, NOT into the `Archive/` folder. Callers wanting the folder-target shape MUST include the trailing `/` (`to: "Archive/"`).

## Behavioural notes

- **Wikilink-form (`file=`) resolves to a canonical path**: the returned `fromPath` and `toPath` reflect the resolved folder-prefixed paths. The CLI resolves an extensionless `file` name only to a `.md` note, so to move a canvas, base or attachment by `file`, include its extension (`"Plan.canvas"`).
- **Same-folder move** succeeds via the CLI's native handling; the response carries `dirname(fromPath) === dirname(toPath)` as the observable rename-equivalence marker.
- **Source not found** surfaces as `CLI_REPORTED_ERROR` with the verbatim `Error: File "<path>" not found.` message.
- **Destination collision** surfaces as `CLI_REPORTED_ERROR` with the verbatim `Error: Destination file already exists!`.
- **Unknown vault names** surface as `CLI_REPORTED_ERROR` with the verbatim `Vault not found.` message.
- **Active mode no-focused-file** surfaces as `ERR_NO_ACTIVE_FILE` from the focused-file lookup, before the `move` call. When the CLI itself replies with the verbatim `Error: No active file.` on stdout (exit 0), the dispatch classifier reclassifies it as the same typed code.
- **Path-traversal**: the CLI treats `..` as literal vault-relative segments that resolve to a non-existent file — `path: "../../etc/x.md"` surfaces as `Error: File "../../etc/x.md" not found.`
- **External editor open during move** (e.g. the source has a live Obsidian tab): on Windows, an exclusive lock from an external process may surface as `CLI_NON_ZERO_EXIT`. POSIX hosts typically allow the move to proceed.
