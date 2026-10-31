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
