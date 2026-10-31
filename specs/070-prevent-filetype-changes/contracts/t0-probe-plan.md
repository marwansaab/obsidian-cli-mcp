# T0 Probe Plan: Prevent File Type Changes

**Feature**: `070-prevent-filetype-changes` · Implement-time live-CLI verification gates. Per [.memory/test-execution-instructions.md](../../../.memory/test-execution-instructions.md): drive `Obsidian.com` (never `Obsidian.exe`), pass `vault=TestVault-Obsidian-CLI-MCP` explicitly, work only under `Sandbox/`, never touch `Welcome.md`, clean up afterwards. Each probe **verifies** an assumption in [research.md](../research.md); none forks the design, and each has a recorded fallback.

**Fixtures** (seed under `Sandbox/070-<run-id>/`): `P.canvas` (minimal `{"nodes":[],"edges":[]}`), `T.base` (minimal `views: []`), `I.png` (any small PNG), `N.md` (one heading). Capture `Get-ChildItem` before and after each destructive probe.

---

## P1 — Does the CLI keep, add or drop an extension on rename and move? (D5)

**Probes**: `rename path=…/P.canvas name=Q`; `rename path=…/Q.canvas name=R.canvas`; `move path=…/R.canvas to=…/Sub/S`; repeat the first rename for `T.base` and `I.png`. Capture stdout, stderr, exit code, resulting files.

**Expected**: the CLI renames to exactly the name given (`Q` with no extension, or keeps `.canvas`) — either outcome is compatible with D5, which always forwards a name that already carries the source extension. Record the response line shape (`Renamed: <from> -> <to>`, `Moved: <from> -> <to>`) for non-note sources so the existing response parsers are confirmed for them.

**Fallback**: if the response shape differs for non-note sources, extend the parser regex in the same change and record the capture here.

## P2 — Does `obsidian file` resolve non-note names? (D3)

**Probes**: `file file=P.canvas`, `file file=P`, `file file=T.base`, `file file=I.png`, `file file=I`.

**Expected**: names with their extension resolve to the right path (`path\t…/P.canvas`, `extension\tcanvas`). Extensionless names either resolve only to a `.md` note or fail. Record which.

**Fallback**: if non-note names with their extension do not resolve, `rename` / `move` / `read` / `outline` in `file` mode cannot address non-note files at all today either; record it, keep the check on whatever path the CLI resolves, and document "use `path` for non-note files" in the four docs pages.

## P3 — Does the focused-file eval report non-note active files? (D3)

**Probes**: open `P.canvas`, then `T.base`, then `I.png` in Obsidian; each time run `eval` with `FOCUSED_FILE_TEMPLATE`.

**Expected**: `{ path: "…/P.canvas", base: … }` etc. — a non-null path with the real extension.

**Fallback**: if a non-note view reports `path: null`, active-mode calls on that file surface `ERR_NO_ACTIVE_FILE` (nothing changes either way); record it and assert the observed behaviour in the handler tests.

## P4 — Before-state of `read` and `outline` on non-note files (D2)

**Probes**: `read path=…/P.canvas`, `read path=…/T.base`, `read path=…/I.png`, `outline path=…/P.canvas`.

**Expected**: canvas and base return their text (supports `read` declaring them supported); the PNG returns decoded binary (justifies rejecting attachments); outline returns `Error: File is not a markdown file.` (the undiscriminated error the new rejection replaces).

**Fallback**: if `read` of a canvas or base fails upstream, record it; the declaration stays (Clarifications Q3) and the upstream error surfaces as today.

## P5 — Attachment table cross-check (D8)

**Probe**: `eval` returning `Object.keys(app.viewRegistry.typeByExtension)` (read-only).

**Expected**: the set of built-in extensions matches the D1 table (the TestVault has no plugins, so the registry is the core set). Record any difference and update the table in the same change.

---

## Evidence

Run 2026-10-31 against `TestVault-Obsidian-CLI-MCP`, fixtures under `Sandbox/070-t0a/`. Binary: `C:\Users\sirzi\AppData\Local\Programs\Obsidian\Obsidian.com` (bare `obsidian`), `obsidian version` → `1.14.5 (installer 1.14.4)`. Every invocation passed `vault=TestVault-Obsidian-CLI-MCP`. All replies arrived on stdout; stderr was empty and the exit code was 0 for every call, including the `Error:` replies.

### P1 — rename / move extension behaviour: PASS (no fallback)

```text
rename path=Sandbox/070-t0a/P.canvas name=Q
Renamed: Sandbox/070-t0a/P.canvas -> Sandbox/070-t0a/Q.canvas
rename path=Sandbox/070-t0a/Q.canvas name=R.canvas
Renamed: Sandbox/070-t0a/Q.canvas -> Sandbox/070-t0a/R.canvas
move path=Sandbox/070-t0a/R.canvas to=Sandbox/070-t0a/Sub/S
Error: ENOENT: no such file or directory, rename 'C:\…\Sandbox\070-t0a\R.canvas' -> 'C:\…\Sandbox\070-t0a\Sub\S\R.canvas'
rename path=Sandbox/070-t0a/T.base name=U
Renamed: Sandbox/070-t0a/T.base -> Sandbox/070-t0a/U.base
rename path=Sandbox/070-t0a/I.png name=J
Renamed: Sandbox/070-t0a/I.png -> Sandbox/070-t0a/J.png
move path=Sandbox/070-t0a/U.base to=Sandbox/070-t0a/Sub/
Moved: Sandbox/070-t0a/U.base -> Sandbox/070-t0a/Sub/U.base
move path=Sandbox/070-t0a/J.png to=Sandbox/070-t0a/Sub/K.png
Moved: Sandbox/070-t0a/J.png -> Sandbox/070-t0a/Sub/K.png
move path=Sandbox/070-t0a/R.canvas to=Sandbox/070-t0a/Sub/S.canvas
Moved: Sandbox/070-t0a/R.canvas -> Sandbox/070-t0a/Sub/S.canvas
rename path=Sandbox/070-t0a/Sub/S.canvas name=X.md
Renamed: Sandbox/070-t0a/Sub/S.canvas -> Sandbox/070-t0a/Sub/X.md
rename path=Sandbox/070-t0a/Sub/X.md name=S.canvas
(empty stdout; the file became Sub/S.canvas)
```

Findings: the CLI's `rename` keeps the source extension for an extensionless name, so the D5 append step is redundant for rename but harmless. The CLI's `move` treats an extensionless `to` as a **folder** (`Sub/S` → `Sub/S/R.canvas`, ENOENT when the folder does not exist), so for move the D5 append step is required, not just harmless: it turns `to: "Archive/Plan2"` on a canvas into the file `Archive/Plan2.canvas`, as the existing source-`.md` guard already does for notes. The CLI does not refuse a cross-type name in either direction (canvas → `X.md`, `.md` → `S.canvas`), which confirms the `type-change` rejection must live in the wrapper. Response lines for canvas, base and attachment sources have the same `Renamed: <from> -> <to>` / `Moved: <from> -> <to>` shape the existing parsers match; no parser change.

### P2 — `obsidian file` resolution of non-note names: PASS (no fallback)

```text
file file=P.canvas   → path	Sandbox/070-t0a/P.canvas / name	P / extension	canvas / size	23 / created … / modified …
file file=P          → Error: File "P" not found.
file file=T.base     → path	Sandbox/070-t0a/T.base / extension	base
file file=I.png      → path	Sandbox/070-t0a/I.png / extension	png
file file=I          → Error: File "I" not found.
file file=N          → path	Sandbox/070-t0a/N.md / extension	md
```

Names with their extension resolve to the right non-note file; extensionless names resolve only to `.md` notes (and fail otherwise). `resolveFileByTsv` works unchanged for non-note files.

### P3 — focused-file eval on non-note views: PASS (no fallback)

```text
open path=Sandbox/070-t0a/Sub/S.canvas ; eval FOCUSED_FILE_TEMPLATE
=> {"path":"Sandbox/070-t0a/Sub/S.canvas","base":"C:\\Marwan-Saab-ADO\\My-Setup\\My-Setup\\TestVault-Obsidian-CLI-MCP"}
open path=Sandbox/070-t0a/Sub/U.base   → Opened: Sandbox/070-t0a/Sub/U.base
=> {"path":"Sandbox/070-t0a/Sub/U.base","base":"C:\\…\\TestVault-Obsidian-CLI-MCP"}
open path=Sandbox/070-t0a/Sub/K.png    → Opened: Sandbox/070-t0a/Sub/K.png
=> {"path":"Sandbox/070-t0a/Sub/K.png","base":"C:\\…\\TestVault-Obsidian-CLI-MCP"}
```

The eval reports the real path, with its extension, for canvas, base and image views.

### P4 — before-state of `read` / `outline`: as expected

```text
read path=Sandbox/070-t0a/P.canvas   → {"nodes":[],"edges":[]}
read path=Sandbox/070-t0a/T.base     → views: []
read path=Sandbox/070-t0a/I.png      → \r\n<U+FFFD>PNG\r\n\x1a\n\0\0\0\rIHDR… (binary decoded as text, signature byte replaced)
outline path=Sandbox/070-t0a/P.canvas → Error: File is not a markdown file.
outline path=Sandbox/070-t0a/T.base   → Error: File is not a markdown file.
outline path=Sandbox/070-t0a/I.png    → Error: File is not a markdown file.
```

### P5 — attachment table vs. `app.viewRegistry`: DIFFERENCE, table updated

```text
eval code=JSON.stringify(Object.keys(app.viewRegistry.typeByExtension))
=> ["md","bmp","png","jpg","jpeg","gif","svg","webp","avif","mp3","wav","m4a","3gp","flac","ogg","oga","opus","mp4","webm","ogv","mov","mkv","pdf","canvas","base"]
```

The registry has two audio extensions the D1 table lacked: `oga` and `opus`. Fallback taken: both added to the attachment row in research.md D1 and data-model.md `FileCategory`, and to the table in `src/file-type/file-type.ts`. Every other entry matches.

### Cleanup

`Sandbox/070-t0a/` (fixtures `P.canvas`, `T.base`, `I.png`, `N.md` and their renamed/moved forms) removed after the run; `Sandbox/` is back to its pre-run listing; no `.trash/` folder exists in the vault (no probe trashed anything); `Welcome.md` untouched.
