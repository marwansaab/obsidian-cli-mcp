# `move`

## Overview

Move a note within an Obsidian vault, optionally renaming it in the same operation. Returns a typed `{ moved, fromPath, toPath }` envelope.

Same-folder `move` calls (where `to` resolves to a destination whose folder matches the source's folder) are equivalent to a rename — callers can choose between `move` and [`rename`](./rename.md) based on ergonomic preference.

> **Link-rewriting is vault-config-dependent.** Obsidian's Settings → Files & Links → "Automatically update internal links" governs whether existing `[[wikilinks]]` and `[markdown](links)` to the moved note are rewritten to the new path. `move` does NOT enforce or override this setting — it documents the dependency so callers can verify the vault's configuration before relying on link integrity. Aliased wikilinks (`[[Real Path|Display]]`) have the path side rewritten while the display text persists; outgoing-link references inside the moved file may need separate attention.

## When to use this tool

| You want to | Reach for |
|---|---|
| Move a note to a different folder (with or without renaming) | `move` |
| Rename a note in place (no folder change) | [`rename`](./rename.md) |
| Delete a note | [`delete`](./delete.md) |
| Create / overwrite a note's contents | [`write_note`](./write_note.md) |
| Cross-extension type conversion (e.g. `.md` → `.canvas`) | [`obsidian_exec`](./obsidian_exec.md) (bypasses the source-`.md` guard) |
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

**Active mode TOCTOU caveat:** the focused note may shift between the time the agent decides to call and the time the CLI executes. Agents that need certainty about which file is moved should use specific mode.

## Destination (`to`) shape rules — LOAD-BEARING

> **ALWAYS include trailing `/` when you mean a folder target.** The wrapper uses a strict trailing-`/` discriminator: `to: "Archive/"` is a folder-target (source filename preserved inside the folder); `to: "Archive"` (no trailing `/`) is a full-path-target (the literal string is treated as the destination filename at the vault root). No heuristic disambiguation, no validation reject — the wrapper trusts the caller's shape.

The handler runs a small `resolveTo(to, fromPath)` transform on the incoming `to` value, but ONLY when the caller uses specific mode with the `path` locator. In `file=` or active modes the source is resolved by the CLI; the wrapper forwards `to=` verbatim.

### Branch 1 — folder-target (`to` ends with `/`)

The wrapper appends the source basename to `to`. The source filename is preserved at the new location.

| Input `to` | Input `path` | Forwarded `to=` |
|-----|-----|-----|
| `"Archive/"` | `"Inbox/Note.md"` | `"Archive/Note.md"` |
| `"Archive/2026/"` | `"Inbox/Tax-2026.md"` | `"Archive/2026/Tax-2026.md"` |
| `"Archive/"` | `"Drafts/Doc.v1.draft.md"` | `"Archive/Doc.v1.draft.md"` |

### Branch 2 — full-path-target (`to` does NOT end with `/`)

The wrapper forwards `to` as the destination filename. If the source ends in `.md` AND the filename portion of `to` does NOT end in `.md`, the wrapper appends `.md` to `to`. Both `endsWith` checks are literal byte-equality, case-sensitive — `.MD` is NOT treated as `.md`.

**Source-`.md` guard**: when the source does NOT end in `.md` (`.canvas`, `.pdf`, image attachments, etc.), the append rule is **suppressed entirely**. This prevents silent cross-type conversion (e.g. `to: "Archive/X"` on a `.canvas` source forwarding `Archive/X.md` and producing a `.md` file containing the canvas's JSON).

| Input `to` | Input `path` | Forwarded `to=` | Why |
|-----|-----|-----|-----|
| `"Archive/Renamed.md"` | `"Inbox/Note.md"` | `"Archive/Renamed.md"` | Verbatim — filename already `.md` |
| `"Archive/Renamed"` | `"Inbox/Note.md"` | `"Archive/Renamed.md"` | Append fires — source `.md` AND filename non-`.md` |
| `"Archive/Doc.v1.draft"` | `"Inbox/Note.md"` | `"Archive/Doc.v1.draft.md"` | Append fires — internal periods preserved |
| `"Archive/Renamed.MD"` | `"Inbox/Note.md"` | `"Archive/Renamed.MD.md"` | Append fires — `.MD` ≠ `.md` case-sensitively |
| `"Archive/Renamed"` | `"Boards/Plan.canvas"` | `"Archive/Renamed"` | **Source-`.md` guard suppression** — non-`.md` source short-circuits the append rule |
| `"Archive/Renamed.md"` | `"Boards/Plan.canvas"` | `"Archive/Renamed.md"` | Verbatim — caller-explicit `.md` preserved on non-`.md` source |
| `"Archive"` | `"Welcome.md"` | `"Archive.md"` | **Surprise case** — `to: "Archive"` (no trailing `/`) is a full-path-target; append fires; effective result is the file at vault-root `Archive.md`, NOT inside an `Archive/` folder |

### `to: "Archive"` — the surprise case worked twice

```json
{ "target_mode": "specific", "vault": "V", "path": "Welcome.md", "to": "Archive" }
```

This forwards `to=Archive.md` — the file lands at vault-root `Archive.md`. If the caller actually meant "move this file into the `Archive` folder", they MUST use `"Archive/"`.

```json
{ "target_mode": "specific", "vault": "V", "path": "Boards/Plan.canvas", "to": "Archive" }
```

This forwards `to=Archive` verbatim (source-`.md` guard suppression on the non-`.md` source). The CLI handles the extensionless destination per its native rules.

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
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN`. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (file locked by an external editor on Windows, permission error, etc.). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Inspect `stderr` for diagnostic output. |
| `CLI_REPORTED_ERROR` (`details.message: "Vault not found."`) | Unknown vault. | Verify the vault name; ensure the vault is registered in Obsidian. |
| `CLI_REPORTED_ERROR` (`details.message: 'Error: File "<path>" not found.'`) | Source not found. | Verify the locator (`file` or `path`). |
| `CLI_REPORTED_ERROR` (`details.message: "Error: Destination file already exists!"`) | Destination collision. | Pick a different `to`, OR delete the collision target first. |
| `CLI_REPORTED_ERROR` (`details.stage: "parse"`) | Unparseable success response — upstream output drift. | `details.stdout` carries verbatim output. Investigate as a regression. |
| `ERR_NO_ACTIVE_FILE` | Active mode invoked while no note is focused. The CLI emits `"Error: No active file."` and the dispatch classifier reclassifies it as this typed code. | Switch to specific mode with explicit `vault` + `file`/`path`, OR ask the user to open a note in Obsidian. |

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

### (v) Source-`.md`-guard suppression on non-`.md` source

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

Spawns `obsidian vault=MyVault move path=Boards/Plan.canvas to=Archive/Plan-Archived` (no `.md` appended — the source-`.md` guard fires on the `.canvas` source). The CLI handles the extensionless destination per its native rules. **No silent `.canvas → .md` cross-type conversion.**

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

- **Wikilink-form (`file=`) resolves to a canonical path**: the returned `fromPath` and `toPath` reflect the resolved folder-prefixed paths.
- **Same-folder move** succeeds via the CLI's native handling; the response carries `dirname(fromPath) === dirname(toPath)` as the observable rename-equivalence marker.
- **Source not found** surfaces as `CLI_REPORTED_ERROR` with the verbatim `Error: File "<path>" not found.` message.
- **Destination collision** surfaces as `CLI_REPORTED_ERROR` with the verbatim `Error: Destination file already exists!`.
- **Unknown vault names** surface as `CLI_REPORTED_ERROR` with the verbatim `Vault not found.` message.
- **Active mode no-focused-note** surfaces as `ERR_NO_ACTIVE_FILE`. The CLI emits the verbatim `Error: No active file.` on stdout (exit 0); the dispatch classifier reclassifies it as the typed code.
- **Path-traversal**: the CLI treats `..` as literal vault-relative segments that resolve to a non-existent file — `path: "../../etc/x.md"` surfaces as `Error: File "../../etc/x.md" not found.`
- **External editor open during move** (e.g. the source has a live Obsidian tab): on Windows, an exclusive lock from an external process may surface as `CLI_NON_ZERO_EXIT`. POSIX hosts typically allow the move to proceed.
