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

_To be filled at `/speckit-implement` T0 with verbatim CLI output, binary path and version, and the cleanup record._
