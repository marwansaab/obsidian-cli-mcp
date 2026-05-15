# `move`

## Overview

Move a note within an Obsidian vault, optionally renaming it in the same
operation. Wraps the Obsidian CLI's `move` subcommand and returns a typed
`{ moved, fromPath, toPath }` envelope. Sibling to [`rename`](./rename.md)
on the file-scoped write-side cohort: where `rename` changes only the
filename in place, `move` changes the folder location (with or without a
filename change). Same-folder `move` calls (where `to` resolves to a
destination whose folder matches the source's folder) are equivalent to
`rename` — callers can choose between the two surfaces based on
ergonomic preference.

> **Link-rewriting is vault-config-dependent.** Obsidian's
> Settings → Files & Links → "Automatically update internal links"
> governs whether existing `[[wikilinks]]` and `[markdown](links)` to the
> moved note are rewritten to the new path. `move` does NOT enforce or
> override this setting — it documents the dependency so callers can
> verify the vault's configuration before relying on link integrity.
> Aliased wikilinks (`[[Real Path|Display]]`) have the path side
> rewritten while the display text persists; outgoing-link references
> inside the moved file may need separate attention.

The tool supports two target modes:

- **specific** — name the vault explicitly and locate the source note by
  either a wikilink (`file`) or a vault-relative `path`. Deterministic;
  the focused note in the editor cannot shift between parse and
  execution.
- **active** — target the active vault context. The CLI's `move`
  subcommand with no locator moves the note currently focused in the
  Obsidian editor. **Active mode + move has a TOCTOU caveat**: the
  focused note may shift between the time the agent decides to call and
  the time the CLI executes. Agents that need certainty about which file
  is moved should use specific mode.

## Input schema

`move` consumes the flat input shape below. Every field is rejected at
the boundary as `VALIDATION_ERROR` if the constraints fail. Unknown
top-level keys are rejected (`additionalProperties: false`).

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
| `file` | string | exactly one of `file`/`path` | wikilink form (e.g. `"QuickNote"`) — CLI resolves to the canonical folder-prefixed path |
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

## Destination (`to`) shape rules — LOAD-BEARING

> **ALWAYS include trailing `/` when you mean a folder target.** The
> wrapper uses a strict trailing-`/` discriminator: `to: "Archive/"` is
> a folder-target (source filename preserved inside the folder);
> `to: "Archive"` (no trailing `/`) is a full-path-target (the literal
> string is treated as the destination filename at the vault root). No
> heuristic disambiguation, no validation reject — the wrapper trusts
> the caller's shape. Callers who omit the trailing `/` get the
> full-path-target branch and the surprise outcome below.

The handler runs a small `resolveTo(to, fromPath)` transform on the
incoming `to` value, but ONLY when the caller uses specific mode with
the `path` locator (the wrapper-side guard cannot fire in `file=` or
active modes because the source is resolved by the CLI; in those modes
the wrapper forwards `to=` verbatim and accepts whatever the CLI's
native `move` subcommand does).

### Branch 1 — folder-target (`to` ends with `/`)

The wrapper appends the source basename to `to`. The source filename is
preserved at the new location.

| Input `to` | Input `path` | Forwarded `to=` |
|-----|-----|-----|
| `"Archive/"` | `"Inbox/Note.md"` | `"Archive/Note.md"` |
| `"Archive/2026/"` | `"Inbox/Tax-2026.md"` | `"Archive/2026/Tax-2026.md"` |
| `"Archive/"` | `"Drafts/Doc.v1.draft.md"` | `"Archive/Doc.v1.draft.md"` |

### Branch 2 — full-path-target (`to` does NOT end with `/`)

The wrapper forwards `to` as the destination filename. If the source
ends in `.md` AND the filename portion of `to` does NOT end in `.md`,
the wrapper appends `.md` to `to`. Both `endsWith` checks are literal
byte-equality, case-sensitive — `.MD` is NOT treated as `.md`.

**Source-`.md` guard**: when the source does NOT end in `.md`
(`.canvas`, `.pdf`, image attachments, etc.), the append rule is
**suppressed entirely**. This prevents silent cross-type conversion
(e.g. `to: "Archive/X"` on a `.canvas` source forwarding `Archive/X.md`
and producing a `.md` file containing the canvas's JSON).

| Input `to` | Input `path` | Forwarded `to=` | Why |
|-----|-----|-----|-----|
| `"Archive/Renamed.md"` | `"Inbox/Note.md"` | `"Archive/Renamed.md"` | Verbatim — filename already `.md` |
| `"Archive/Renamed"` | `"Inbox/Note.md"` | `"Archive/Renamed.md"` | Append fires — source `.md` AND filename non-`.md` |
| `"Archive/Doc.v1.draft"` | `"Inbox/Note.md"` | `"Archive/Doc.v1.draft.md"` | Append fires — internal periods preserved |
| `"Archive/Renamed.MD"` | `"Inbox/Note.md"` | `"Archive/Renamed.MD.md"` | Append fires — `.MD` ≠ `.md` case-sensitively |
| `"Archive/Renamed"` | `"Boards/Plan.canvas"` | `"Archive/Renamed"` | **Source-`.md` guard suppression** — non-`.md` source short-circuits the append rule; `to=` forwarded verbatim |
| `"Archive/Renamed.md"` | `"Boards/Plan.canvas"` | `"Archive/Renamed.md"` | Verbatim — caller-explicit `.md` preserved on non-`.md` source |
| `"Archive"` | `"Welcome.md"` | `"Archive.md"` | **Surprise case** — `to: "Archive"` (no trailing `/`) is a full-path-target; append fires; effective result is the file at vault-root `Archive.md`, NOT inside an `Archive/` folder |

### `to: "Archive"` — the surprise case worked twice

The strict trailing-`/` discriminator makes the two source extensions
behave differently when the caller writes the bare token `"Archive"`:

```json
{ "target_mode": "specific", "vault": "V", "path": "Welcome.md", "to": "Archive" }
```

This forwards `to=Archive.md` — the file lands at vault-root
`Archive.md`. If the caller actually meant "move this file into the
`Archive` folder", they MUST use `"Archive/"`.

```json
{ "target_mode": "specific", "vault": "V", "path": "Boards/Plan.canvas", "to": "Archive" }
```

This forwards `to=Archive` verbatim (source-`.md` guard suppression on
the non-`.md` source). The CLI handles the extensionless destination
per its native rules.

## Output

```json
{ "moved": true, "fromPath": "Inbox/Note.md", "toPath": "Archive/Note.md" }
```

| Field | Type | Description |
|-------|------|-------------|
| `moved` | literal `true` | Always `true` on success. Failures throw `UpstreamError`. |
| `fromPath` | string | The CLI-canonical vault-relative path of the source AT THE MOMENT OF THE MOVE. For wikilink-form input (`file=`) this is the resolved folder-prefixed path. |
| `toPath` | string | The CLI-canonical vault-relative path of the destination after the move. |

The handler parses the CLI's stdout against an anticipated single-line
pattern (`Moved: <fromPath> → <toPath>`) with fallbacks for a two-line
shape and an empty-stdout-plus-exit-0 shape. Unparseable success
responses surface as `CLI_REPORTED_ERROR` with `details.stage: "parse"`
and `details.stdout` carrying the verbatim output, so future CLI version
drift surfaces as a test failure rather than a silent regression.

### Same-folder move — rename equivalence

When `to` resolves to a destination whose folder matches the source's
folder, the operation is effectively a rename. The wrapper does NOT
special-case this; it forwards to the CLI uniformly and the CLI handles
the same-folder move identically to a cross-folder move. The structural
marker `dirname(fromPath) === dirname(toPath)` is observable from the
caller. Use `rename` when only the filename changes (the simpler
surface, no `to`-shape rules); use `move` with `to` whose folder portion
matches the source's folder if you prefer the unified surface.

## Scope

`move` operates on any vault file the CLI can address (`.md` notes,
`.canvas` files, `.pdf` attachments, image attachments, etc.). The
wrapper-side source-`.md` guard ensures the `.md` append rule only fires
when the source is itself `.md`, so cross-type conversion never happens
by accident.

Out of scope:

- **Cross-extension type conversion**: e.g. moving a `.md` note to a
  `.canvas` destination. The wrapper's full-path-target append rule
  appends `.md` to `.md` sources whose `to` filename portion is
  non-`.md`. For deliberate cross-type renames, route through
  [`obsidian_exec`](./obsidian_exec.md) directly, which bypasses the
  wrapper's source-`.md` guard.
- **In-place rename only** (no folder change): use [`rename`](./rename.md)
  — simpler surface, no `to`-shape rules to remember.
- **Folder-scoped moves** (relocating a whole folder): not supported by
  this tool's file-scoped contract. Route through `obsidian_exec move`
  directly if the CLI gains a folder-target subcommand.

## Errors

All failure surfaces flow through `UpstreamError` per Constitution
Principle IV. `move` introduces zero new error codes — the failure
surface is fully covered by codes already defined by the foundation
features.

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | The input failed `moveInputSchema` validation (missing `target_mode`, missing `vault` in specific mode, neither/both `file` and `path`, forbidden key in active mode, unknown top-level key, empty `to`, `to` non-string, etc.). | Agent retries with corrected input. `details.issues` carries the per-issue `path` + `message` + zod code. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (file locked by an external editor on Windows, permission error, etc.). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Agent inspects `stderr` for diagnostic output. |
| `CLI_REPORTED_ERROR` | The CLI exited 0 but reported a failure in-band — stdout starts with `Error:` (source not found, destination collision, **active-mode no-focused-note** — see note below), OR the unknown-vault response (`Vault not found.`) was matched by the cli-adapter's R5 inspection, OR the success response was unparseable. | `details.message` (the first line of stdout, or the synthesised parse-failure message) names the specific failure. For "Destination file already exists!": pick a different `to`. For source not found: verify the locator. |

> **Active-mode no-focused-note surfaces as `CLI_REPORTED_ERROR` with
> `details.message: "Error: No active file."`, NOT as
> `ERR_NO_ACTIVE_FILE`.** This is the inherited bridge-classifier
> behaviour documented across `delete` (TC-049), `rename` (TC-171), and
> `move` (BI-030 T0 case ix). The native CLI emits capital-N
> `Error: No active file.`; the bridge's lowercase-only matcher does
> not recognise it, so the call falls through to `CLI_REPORTED_ERROR`.
> A cross-cutting classifier fix is tracked under
> [[BI-0027 - Audit Tool Descriptions]] dimension C.2.

The canonical errors contract is at
[specs/001-add-cli-bridge/contracts/errors.contract.md](../../specs/001-add-cli-bridge/contracts/errors.contract.md);
`move` propagates the adapter's classification verbatim with no
rewrites.

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

Spawns `obsidian vault=MyVault move path=Inbox/Note.md to=Archive/Note.md`
(source basename preserved per folder-target branch). Returns
`{ "moved": true, "fromPath": "Inbox/Note.md", "toPath": "Archive/Note.md" }`.

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

Spawns `obsidian vault=MyVault move path=Inbox/Note.md to=Archive/Renamed.md`
(file moved and renamed in one operation). Returns
`{ "moved": true, "fromPath": "Inbox/Note.md", "toPath": "Archive/Renamed.md" }`.

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

If `Archive/B.md` already exists, surfaces as `CLI_REPORTED_ERROR` with
`details.message: "Error: Destination file already exists!"`.
Recommended caller response: pick a different `to`, OR delete the
collision target first.

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

The CLI moves the file. Whether existing wikilinks `[[Inbox/Note]]` in
other vault notes are rewritten to `[[Archive/Note]]` depends on the
vault's Settings → Files & Links → "Automatically update internal links"
setting. With the setting ENABLED, Obsidian rewrites the links;
DISABLED, the links remain pointing at the old path (and will resolve to
"unresolved" until the target exists again at that path).

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

Spawns `obsidian vault=MyVault move path=Boards/Plan.canvas to=Archive/Plan-Archived`
(no `.md` appended — the source-`.md` guard fires on the `.canvas`
source). The CLI handles the extensionless destination per its native
rules. **No silent `.canvas → .md` cross-type conversion**.

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

Spawns `obsidian vault=MyVault move path=Welcome.md to=Archive.md`. The
strict trailing-`/` discriminator treats `"Archive"` as a
full-path-target; the file is moved to vault-root `Archive.md`, NOT
into the `Archive/` folder. Callers wanting the folder-target shape
MUST include the trailing `/` (`to: "Archive/"`).

## Behavioural notes (live-CLI characterisation)

These behaviours are anticipated per the plan-stage live-CLI findings
(F1–F5b in
[specs/030-move-note/research.md](../../specs/030-move-note/research.md))
and the inherited bridge-classifier mismatch documented across `delete` /
`rename` / `move`.

- **Wikilink-form (`file=`) resolves to a canonical path**: the returned
  `fromPath` and `toPath` reflect the resolved folder-prefixed paths.
- **Same-folder move** succeeds via the CLI's native handling; the
  response carries `dirname(fromPath) === dirname(toPath)` as the
  observable rename-equivalence marker.
- **Source not found** surfaces as `CLI_REPORTED_ERROR` with the verbatim
  `Error: File "<path>" not found.` message (F3, plan-stage verified).
- **Destination collision** surfaces as `CLI_REPORTED_ERROR` with the
  CLI's verbatim wording (T0 case vi locks the exact text).
- **Unknown vault names** surface as `CLI_REPORTED_ERROR` with the
  verbatim `Vault not found.` message (per the cli-adapter's R5
  response-inspection clause; F2 verified).
- **Active mode no-focused-note** surfaces as `CLI_REPORTED_ERROR` with
  `details.message: "Error: No active file."` (capital-N; inherited
  classifier mismatch — see Errors section).
- **Path-traversal is guarded for SOURCE locators by the CLI**: `path:
  "../../etc/x.md"` surfaces as `Error: File "../../etc/x.md" not
  found.` — the CLI treats `..` as literal vault-relative segments that
  resolve to a non-existent file (F5/F5b verified). Whether the same
  guard applies to `to=` traversal is gated on the SC-012 T0 case (x)
  probe; if T0 surfaces silent vault-escape, the spec is amended
  pre-ship to add a validation-boundary reject.
- **Missing destination folder**: behaviour (auto-create vs fail) is
  CLI-version-dependent and captured at T0 case (xi).
- **Backslash in `to`** (Windows host): observable behaviour is
  platform-dependent and captured at T0 case (xii). If silent
  vault-escape is observed, the spec is amended pre-ship per the same
  SC-012 pattern as path-traversal.
- **External editor open during move** (e.g. the source has a live
  Obsidian tab): on Windows, an exclusive lock from an external process
  may surface as `CLI_NON_ZERO_EXIT`. POSIX hosts typically allow the
  move to proceed.

## References

- [030-move-note spec](../../specs/030-move-note/spec.md) — feature
  spec, user input acceptance criteria, FR-019 live-CLI characterisation
  requirements, /speckit-clarify Q1 (source-`.md`-guarded append) + Q2
  (strict trailing-`/` discriminator) session 2026-05-15.
- [030-move-note research](../../specs/030-move-note/research.md) —
  R1–R14 decisions plus the F1–F5b plan-stage findings and the
  deferred-T0 case roster.
- [cli-adapter spec](../../specs/003-cli-adapter/spec.md) — the
  centralised `invokeCli` adapter that `move` routes every call
  through, including the R5 unknown-vault response-inspection clause.
- [target-mode primitive spec](../../specs/004-target-mode-schema/spec.md) —
  the shared discriminated union the input schema composes via
  `applyTargetModeRefinement(targetModeBaseSchema.extend(...))`.
- [post-010 flat encoding](../../specs/010-flatten-target-mode/spec.md) —
  the `additionalProperties: false`, no-`oneOf` JSON Schema shape
  published in `tools/list`.
- [020-fix-write-gaps](../../specs/020-fix-write-gaps/spec.md) — the
  source of the `endsWith(".md")` byte-equality predicate that the
  full-path-target append rule mirrors.
- [021-rename-note](../../specs/021-rename-note/spec.md) — sibling
  file-scoped write-side tool whose Q1 lock established the byte-
  equality precedent that `move`'s Q1 extends with the source-`.md`
  guard departure.
- [help tool spec](../../specs/005-help-tool/spec.md) — the
  schema-stripping contract and `help({ tool_name })` lookup that
  surfaces this document.
- [rename](./rename.md) — the in-place rename tool; use it when only
  the filename changes.
- [delete](./delete.md) — sibling write-side tool.
- [write_note](./write_note.md) — sibling write-side tool.
- [obsidian_exec](./obsidian_exec.md) — the freeform escape hatch
  retained for cross-extension renames, deliberate `.md → .canvas`
  conversions, and any move shape this typed surface does not cover.
- [errors contract](../../specs/001-add-cli-bridge/contracts/errors.contract.md)
  — the canonical roster of `UpstreamError` codes.
