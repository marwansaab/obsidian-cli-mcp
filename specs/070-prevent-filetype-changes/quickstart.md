# Quickstart: Prevent File Type Changes

**Feature**: `070-prevent-filetype-changes` · How to prove the feature works. Expected shapes live in [contracts/errors.md](contracts/errors.md), [contracts/tool-support.md](contracts/tool-support.md) and the worked rows in [data-model.md](data-model.md); this guide does not repeat them.

## Prerequisites

- `npm ci`; Node ≥ 22.11.
- For the manual scenarios: read [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) first. Use only `TestVault-Obsidian-CLI-MCP`, only under `Sandbox/`, with Obsidian running and the vault open. Seed the T0 fixtures (`P.canvas`, `T.base`, `I.png`, `N.md`) under `Sandbox/070-<run-id>/` and remove them afterwards.

## Automated gate

```
npm run lint
npm run typecheck
npx vitest run
npm run build
```

All green, on the CI Linux and Windows runners. The suites that carry this feature:

- `src/file-type/file-type.test.ts` — extension parsing, case-insensitive classification, the rejection envelope.
- `src/tools/{rename,move}/handler.test.ts` — every worked row in data-model.md; `file` mode resolves then forwards the original `file=`, active mode resolves then forwards `path=`; `type-change` rejection never spawns the rename/move CLI call.
- `src/tools/delete/handler.test.ts` — canvas and attachment paths forwarded unchanged (FR-003).
- `src/tools/{read,write_note,append_note,prepend,outline}/handler.test.ts` — `unsupported-type` rejection per locator form, with no CLI action call and no filesystem write; supported types pass through.
- Description test (table-driven over the declarations) — each in-scope description names its declared types (SC-002).
- `src/tools/_register.test.ts` — the regenerated `_register-baseline.json` matches (run `npm run baseline:write`, review the diff: only in-scope tools' fingerprints move).
- Pre-existing Markdown tests for the touched tools pass, with only the edits listed in tasks.md Notes (SC-005).

## Manual scenarios (through an MCP client against `node dist/index.js`)

**US1 — type kept on rename and move**

1. `rename` `{target_mode:"specific", vault, path:"Sandbox/070-x/P.canvas", name:"Roadmap"}` → `toPath` ends `Roadmap.canvas`; the file on disk is `Roadmap.canvas` with unchanged content.
2. `rename` the base to `Open Tasks` → `Open Tasks.base`.
3. `move` `I.png` to `Sandbox/070-x/Archive/` → `Archive/I.png`.
4. `move` the canvas to `Sandbox/070-x/Archive/Plan2` → `Archive/Plan2.canvas`.
5. Open the canvas in Obsidian; `rename` `{target_mode:"active", name:"Focus"}` → `Focus.canvas`.
6. `rename` `N.md` to `Renamed` → `Renamed.md` (unchanged Markdown behaviour).

**US2 — clear rejection, nothing changed**

1. `rename` the canvas with `name:"Plan.md"` → `VALIDATION_ERROR`, `details.code:"UNSUPPORTED_FILE_TYPE"`, `reason:"type-change"`, `alternative:"obsidian_exec"`; directory listing unchanged.
2. `move` `N.md` to `Sandbox/070-x/N.canvas` → same, `reason:"type-change"`.
3. `append_note` / `prepend` / `write_note` with `path` = the canvas → `reason:"unsupported-type"`, canvas bytes unchanged.
4. `write_note` `{file:"Plan.canvas", content:"x"}` → `unsupported-type`; no `Plan.canvas.md` created.
5. `read` `I.png` → `unsupported-type`, `alternative:"open_file"`. `read` the canvas and the base → their text.
6. `outline` the canvas → `unsupported-type` (was an undiscriminated `CLI_REPORTED_ERROR`).

**US3 — documented support**

1. List tools; for each in-scope tool in contracts/tool-support.md, the description names the declared types.
2. `help {tool_name:"rename"}` (and `move`, `read`) → the page states the same types and the `UNSUPPORTED_FILE_TYPE` reasons.

**US4 — no silent conversion**

Across US1 and US2, every successful result path has the input's extension; every call that would have changed it failed with `UNSUPPORTED_FILE_TYPE`.

## Cleanup

Delete `Sandbox/070-<run-id>/` and any `.trash/` residue from the run; confirm `Welcome.md` is untouched.

## Quickstart run

Run 2026-10-31 (task T034) through an MCP client (`@modelcontextprotocol/client`, stdio) against `node dist/index.js`, vault `TestVault-Obsidian-CLI-MCP`, fixtures `P.canvas`, `T.base`, `I.png`, `N.md` seeded under `Sandbox/070-qs/`. The automated gate passed first: `npm run lint` clean, `npm run typecheck` clean, `npx vitest run` 159 files / 3,361 tests passed (6 skipped), `npm run build` clean. `npm run format:check` was not used as a gate: it already fails on 1,064 of 1,079 tracked files in the repository; the files this change created are formatted.

| Scenario | Result | Observed |
|----------|--------|----------|
| US1.1 rename canvas → `Roadmap` | Pass | `{"renamed":true,"fromPath":"Sandbox/070-qs/P.canvas","toPath":"Sandbox/070-qs/Roadmap.canvas"}`; content unchanged |
| US1.2 rename base → `Open Tasks` | Pass | `toPath` `Sandbox/070-qs/Open Tasks.base` |
| US1.3 move `I.png` → `Archive/` | Pass | `toPath` `Sandbox/070-qs/Archive/I.png` |
| US1.4 move canvas → `Archive/Plan2` | Pass | `toPath` `Sandbox/070-qs/Archive/Plan2.canvas` |
| US1.5 active rename of the focused canvas → `Focus` | Pass | `toPath` `Sandbox/070-qs/Archive/Focus.canvas` |
| US1.6 rename `N.md` → `Renamed` | Pass | `toPath` `Sandbox/070-qs/Renamed.md` |
| US2.1 rename canvas → `Plan.md` | Pass | `VALIDATION_ERROR`, `"rename: Sandbox/070-qs/Archive/Focus.canvas is a canvas; the new name \"Plan.md\" would make it a note. rename and move keep a file's type. Nothing was changed. Omit the extension to keep it a canvas, or use obsidian_exec to change the type deliberately."`, `details.reason` `type-change`, `alternative` `obsidian_exec`; listing unchanged |
| US2.2 move `Renamed.md` → `N.canvas` | Pass | `VALIDATION_ERROR`, `reason` `type-change`, `destination` `Sandbox/070-qs/N.canvas`; listing unchanged |
| US2.3 append_note / prepend / write_note on the canvas | Pass | each `VALIDATION_ERROR`, `"<tool>: Sandbox/070-qs/Archive/Focus.canvas is a canvas (.canvas); <tool> supports notes. Nothing was changed."`, `reason` `unsupported-type`; canvas bytes unchanged |
| US2.4 write_note `file: "Plan.canvas"` | Pass | `reason` `unsupported-type`, `path` `Plan.canvas`; no `Plan.canvas.md` in the vault |
| US2.5 read `I.png` / canvas / base | Pass | png: `"read: Sandbox/070-qs/Archive/I.png is an attachment (.png); read supports notes, canvases and bases. Nothing was changed. Use open_file for this file instead."`, `alternative` `open_file`; canvas `{"content":"{\"nodes\":[],\"edges\":[]}\n"}`; base `{"content":"views: []\n"}` |
| US2.6 outline the canvas | Pass | `VALIDATION_ERROR`, `reason` `unsupported-type` (was `CLI_REPORTED_ERROR` "Error: File is not a markdown file.") |
| US3.1 tool list | Pass | all 16 in-scope descriptions carry their supported-types sentence |
| US3.2 `help` rename / move / read | Pass | each page names `UNSUPPORTED_FILE_TYPE` and its reason (`type-change` for rename/move, `unsupported-type` and canvases for read) |
| US4 no silent conversion | Pass | final listing `Archive/Focus.canvas`, `Archive/I.png`, `Open Tasks.base`, `Renamed.md`: every success kept its extension; every type-changing call failed with `UNSUPPORTED_FILE_TYPE` |

Cleanup: `Sandbox/070-qs/` removed; `Sandbox/` back to its pre-run listing; no `.trash/` folder in the vault; `Welcome.md` untouched.
