# Post-implement: 090 Classify missing destination

## T001 baseline

Branch `090-classify-missing-destination`, before any edit.

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm test`: pass. 188 test files passed, 1 skipped; 4437 tests passed, 6 skipped. Coverage: statements 97.02%, branches 94.66%, functions 92.14%, lines 97.8%.

No pre-existing failure.

## T008 dependency added

T002 (`ExecuteDeps.vaultRegistry` + type import), T003 (`server.ts`: `createMoveTool({ logger, queue, vaultRegistry })`) and X1–X6 applied. X3 touched exactly 25 inline literals (26 matches of the literal, the 26th being the `deps()` body, which is X2).

- `npm run typecheck`: pass.
- `npx vitest run src/tools/move src/tools/_plugin-noise.test.ts src/tools/_register.test.ts src/tools/_register-baseline.test.ts src/tools/_surface.test.ts src/server.test.ts`: 8 files, 717 tests, all pass. No assertion outside X1–X6 failed; the baseline did not move.

## T011 red check

`npx vitest run src/tools/move/handler.missing-destination.test.ts src/tools/move/index.test.ts` against the unchanged behaviour: 17 failed, 10 passed (27).

| Row | Result | Reason |
|-----|--------|--------|
| M1–M7, M19 | fail | raw `CLI_REPORTED_ERROR` with the absolute ENOENT line, no `FOLDER_NOT_FOUND` |
| M8 | fail | payload contains `C:\Vaults\Work` |
| M9, M10, M11, M20 | fail | `details.message` / `details.stdout` still carry the root |
| M12 | fail | `details.stderr` still carries the root |
| M18 | fail | raw EPERM payload instead of the withheld failure |
| M14 | fail | the contrast half: M1 has no `details.code` yet |
| R1 | fail | wire payload is the raw ENOENT error |
| M13, M15, M16, M17 | pass | today's behaviour |

The remaining 6 passes are the existing `index.test.ts` cases.

Two rows were corrected before this run (row bugs, not handler changes): M10/M14/M15 expected `details.argv` without the binary (dispatch's `argv` starts with the resolved binary, so the rows now prepend `recorded[0].binary`), and M13 asserted a registry call, which is post-change behaviour the contract does not ask for, so that assertion was dropped.

## T013 US1

T012 applied (`ENOENT_RENAME_RE`, `destinationFolder`, `isMissingDestinationFolder`, `folderNotFound`, and the `try`/`catch` around the CLI call and the parse).

- `npm run typecheck`: pass.
- `npx vitest run src/tools/move`: 4 files, 121 tests; 115 pass, 6 fail. The failures are exactly M9, M10, M11, M12, M18 and M20 (US2). M1–M8, M13–M17, M19, R1 and every existing test pass (M8 passes here because the FOLDER_NOT_FOUND payload already carries no path).

## T015 US2

T014 applied (`withVaultRelativePaths`, `withheldFailure`, the root lookup as the catch's last step, and the header).

- `npm run typecheck`: pass.
- `npx vitest run src/tools/move src/tools/_plugin-noise.test.ts`: 5 files, 535 tests, all pass. M1–M20 and R1 pass; every existing test passes with no edit beyond X1–X6.

## T016 US3

- `npx vitest run src/tools/move/handler.missing-destination.test.ts -t "M1[3-5]"`: 3 passed (M13, M14, M15).
- `npx vitest run src/tools/move/handler.test.ts`: 68 passed, including Case 16 (source not found) and Case 17 (destination collision) unchanged. No handler change needed; no sub-code added to the missing-source failure.

## T018 surface gate

T017 applied (§H1 sentence appended to `MOVE_DESCRIPTION`; header updated).

- P1: the fingerprint comparison lives in `src/tools/_register.test.ts` ("live registry fingerprints match the checked-in baseline"), not in `_register-baseline.test.ts`, which passed before and after (it checks the baseline file itself). Before regeneration that one `_register.test.ts` case failed, on `move`'s `descriptionFingerprint` only (`d9811f6b…` → `9df0fa86…`). No other tool, and no `move` schema, title or annotation fingerprint, moved.
- P2: `npm run baseline:write` wrote 35 entries. `git diff -- src/tools/_register-baseline.json` shows the `move` `descriptionFingerprint` and the script's own `generatedFromBranch` header (`086-fix-section-replacement` → `090-classify-missing-destination`); nothing else.
- Re-run of `_register-baseline.test.ts`, `_register.test.ts`, `_surface.test.ts`: 3 files, 179 tests, all pass.
- P3, P4: `git diff --exit-code main -- src/errors.ts src/tools/move/schema.ts` printed nothing (exit 0).

## T019 / T020 docs

- `docs/tools/move.md`: §H2 Errors row, §H3 "No absolute paths" paragraph, §H4 Behavioural-notes bullet, §H5 Branch 2 wording, verbatim.
- `CHANGELOG.md`: `Spec 090-classify-missing-destination.` after the spec 089 line, and the §C `Fixed` entry at the top of `[Unreleased]` → `### Fixed`.
- `npx vitest run src/tools/help src/tools/move/index.test.ts`: 5 files, 44 tests, all pass (docs-sync guard and move docs test).

## T021 live check

Followed `.memory/test-execution-instructions.md`. `npm run build` passed. Pre-state: `Sandbox/` had 13 entries; `Welcome.md` SHA-256 `94194952…C8D5`; no `.trash/`. Seeded `Sandbox/090-live/Note.md` (`# Note\n\nSpec 090 live fixture.\n`, SHA-256 `1AD097D8…6877`) and `Sandbox/090-live/Live090Unique.md`.

The calls went through the built server (`node dist/index.js` over stdio, raw JSON-RPC, protocol `2025-06-18`, driver script kept outside the repository and deleted afterwards). Verbatim results:

```text
=== L1 (move) isError=true
{"code":"CLI_REPORTED_ERROR","message":"move: the destination folder \"Sandbox/090-live/Missing\" does not exist in the vault. Nothing was moved. Create the folder (writing a note into it with write_note creates it), then retry the move.","details":{"code":"FOLDER_NOT_FOUND","folder":"Sandbox/090-live/Missing"}}
=== L2 (move) isError=true
{"code":"CLI_REPORTED_ERROR","message":"move: the destination folder \"Sandbox/090-live/Missing\" does not exist in the vault. Nothing was moved. Create the folder (writing a note into it with write_note creates it), then retry the move.","details":{"code":"FOLDER_NOT_FOUND","folder":"Sandbox/090-live/Missing"}}
=== L3 (move) isError=true
{"code":"CLI_REPORTED_ERROR","message":"move: the destination folder \"Sandbox/090-live/A/B\" does not exist in the vault. Nothing was moved. Create the folder (writing a note into it with write_note creates it), then retry the move.","details":{"code":"FOLDER_NOT_FOUND","folder":"Sandbox/090-live/A/B"}}
=== L5 (move) isError=true
{"code":"CLI_REPORTED_ERROR","message":"CLI bridge upstream error: CLI_REPORTED_ERROR","details":{"argv":["obsidian","vault=TestVault-Obsidian-CLI-MCP","move","path=Sandbox/090-live/Nope.md","to=Sandbox/090-live/Missing2/Nope.md"],"command":"move","stdout":"Error: File \"Sandbox/090-live/Nope.md\" not found.\n","stderr":"","exitCode":0,"message":"Error: File \"Sandbox/090-live/Nope.md\" not found."}}
=== L6 (move) isError=true
{"code":"CLI_REPORTED_ERROR","message":"Vault not found.","details":{"command":"move","stdout":"Vault not found.\n","stderr":"","exitCode":0,"message":"Vault not found."}}
```

After L1–L3 and L5: `Sandbox/090-live/` held only `Note.md` (31 bytes, same SHA-256) and `Live090Unique.md`; no `Missing`, `A` or `Missing2` folder was created.

```text
=== L4a (write_note) isError=false
{"created":true,"path":"Sandbox/090-live/Missing/keep.md","bytes_written":5}
=== L4b (move) isError=false
{"moved":true,"fromPath":"Sandbox/090-live/Note.md","toPath":"Sandbox/090-live/Missing/Note.md"}
```

| Row | Result |
|-----|--------|
| L1 | pass: E-1, `folder: "Sandbox/090-live/Missing"`; nothing moved, no folder |
| L2 | pass: E-1, same folder |
| L3 | pass: E-1, `folder: "Sandbox/090-live/A/B"` |
| L4 | pass: `write_note` created the folder; the retried move returned `toPath: "Sandbox/090-live/Missing/Note.md"` |
| L5 | pass: today's missing-source error, no `details.code` |
| L6 | pass: today's `Vault not found.` error |
| L7 | pass: no L1–L6 failure payload contains `C:\Marwan-Saab-ADO` (or `Marwan`) in any case or separator form |

7 attempted, 7 passed, 0 failed. Cleanup: removed `Sandbox/090-live/` (including `Missing/`). Post-state: `Sandbox/` has 13 entries, `Welcome.md` SHA-256 unchanged, no `.trash/` (nothing was trashed). No residue.

## T022 structural verification

`codegraph sync`, then `codegraph_explore "executeMove withVaultRelativePaths folderNotFound withheldFailure isMissingDestinationFolder destinationFolder"`, plus `git diff main` and greps.

1. **Codes**: `git diff --exit-code main -- src/errors.ts` is empty. The new `new UpstreamError` sites in `move/handler.ts` are `folderNotFound` (`CLI_REPORTED_ERROR`), `withVaultRelativePaths` (`e.code`, the caught error's own) and `withheldFailure` (`e.code`). No new error class, top-level code or `details.code` value (`FOLDER_NOT_FOUND` already exists in `paths` and `pattern_search`).
2. **DI**: no `handler.ts` under `src/tools/` mentions `createLogger` or `createQueue`. `git diff main -- src/server.ts` is the single line `createMoveTool({ logger, queue })` → `createMoveTool({ logger, queue, vaultRegistry })`. Kernel-node touch as claimed by the plan: `createServer()` one argument; `UpstreamError` not edited (new construction sites in `move/handler.ts` only); `createLogger()` / `createQueue()` not edited, no new caller.
3. **Imports**: `move/handler.ts` imports `cli-adapter/cli-adapter`, `errors`, `file-type/file-type`, `_file-target`, its own `schema`, and the types `Logger`, `Queue`, `VaultRegistry`; all downward. Outside `move/`, only `server.ts` and the test-support modules (`_file-type-support.test.ts`, `_plugin-noise.test.ts`, `_typed-result-fixtures.ts`) import from `move/`; no other tool does.
4. **No orphans**: CodeGraph shows each new helper (`destinationFolder`, `isMissingDestinationFolder`, `folderNotFound`, `withVaultRelativePaths`, `withheldFailure`; also the small `isPlainRecord` used by the rewrite) with exactly one caller, inside `move/handler.ts`, reached from `executeMove`. The handler's exports are unchanged (`MOVE_SUPPORTED`, `ExecuteDeps`, `executeMove`).

No structural deviation. Note for the docs-as-code pass: refactor-decisions item 32(b) says the four CLI-pass-through tools "carry no `vaultRegistry`, and `createServer` matches main"; `move` now carries one (plan D6, owner-approved), used only after a failure and never to build `vault=`, so the item 32(b) argv rule (active mode sends no `vault=`) still holds.

## T023 full gate

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm run format:check`: **fails, pre-existing**. It names 1355 files, including untouched ones (`src/tools/rename/handler.ts`, `src/tools/write_note/handler.ts`), and fails even with `--end-of-line auto`. The `main` versions of every pre-existing file this feature touches (`move/handler.ts`, `move/handler.test.ts`, `move/index.test.ts`, `server.ts`, `_typed-result-fixtures.ts`, `_plugin-noise.test.ts`, `docs/tools/move.md`, `CHANGELOG.md`) already fail Prettier, and CI (`.github/workflows/ci.yml`) does not run `format:check`. `npx prettier --write` was therefore run only on the one wholly new file, `src/tools/move/handler.missing-destination.test.ts`; running it on the pre-existing files would have reformatted lines this feature does not own. T001 did not run `format:check`, so this was first seen here.
- `npm test`: pass. 189 test files passed, 1 skipped; 4458 tests passed, 6 skipped (T001: 4437 + 21 new = M1–M20 + R1). Coverage: statements 97.03%, branches 94.6%, functions 92.27%, lines 97.83%; the floor holds.
- `move/handler.ts` coverage: lines 100%, branches 92.3%. The uncovered branches are the pre-existing parse fallback (line 52), `isPlainRecord`'s null-prototype case, the empty-root guard in `withVaultRelativePaths`, and the non-`UpstreamError` lookup failure (`<lookup code>` = `unknown`); the contract's rows do not exercise them.
- Line counts (`[System.IO.File]::ReadAllLines(p).Length`): `handler.missing-destination.test.ts` 461, `handler.test.ts` 625, `index.test.ts` 180, `_plugin-noise.test.ts` 541; all under 1000.
