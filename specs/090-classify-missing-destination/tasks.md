---

description: "Task list for 090 Classify missing destination"
---

# Tasks: Classify missing destination

**Input**: Design documents from `specs/090-classify-missing-destination/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/missing-destination-contract.md](contracts/missing-destination-contract.md), [quickstart.md](quickstart.md)

**Tests**: requested. Constitution Principle II requires happy-path and failure tests for the modified `move` tool in the same change. Rows M1–M20 and R1 are written before the behaviour change, so the quickstart §1 red check can show that they bite.

**Organization**:

- Phase 2 adds the `vaultRegistry` dependency with the approved test edits, then writes the new suite (blocking).
- One phase per user story in priority order:
  - US1 (P1): the typed `FOLDER_NOT_FOUND` failure.
  - US2 (P1): the vault-root rewrite.
  - US3 (P2): distinguishable failures. Its rows go green with no extra code.
- Phase 6 publishes the contract: description, baseline, help page and CHANGELOG. It then runs the live check, the structural check and the full gate.
- Row IDs refer to the contract:
  - P1–P4: surface checks;
  - E-1 to E-3: the error contract;
  - M1–M20 and R1: test rows;
  - X1–X6: the approved test edits;
  - §H: description and help text;
  - §C: the CHANGELOG text;
  - L1–L7: the live column.

**Scope**: the `move` tool, plus the one `server.ts` argument. These stay unedited:

- `src/tools/move/schema.ts`;
- `src/errors.ts`;
- `src/cli-adapter/**`;
- `src/vault-registry/**`;
- `src/tools/_file-target.ts`;
- `src/tools/_active-file.ts`;
- `src/file-type/**`;
- every other tool;
- every existing test except the approved edits X1–X6.

**Before any code edit**:

- load the `karpathy-guidelines` skill;
- read `.memory/refactor-decisions.md`. These items apply here:
  - §2: the byte-exact bar. Unchanged failures must come back as the same object, and successes must be identical;
  - §5: only X1–X6 are approved (owner ruling, 2026-11-02, option A), as field additions only. If any other existing assertion fails, stop and raise it, and do not edit that test;
  - §9: reuse `makeQueuedSpawn` / `makeStubSpawn` / `fileTsvResponse` / `focusedFileResponse` / `stubVaultRegistry`. No `vi.fn` is needed;
  - §15: read `details` strings with `stringDetail` from `src/errors.ts`;
  - §27(a): the baseline moves only for the `move` description;
  - §29: pass deps whole to `invokeCli`;
  - §32(b), (d): active mode still forwards `path=` with no `vault=`, and the `forwardedTo` bytes are unchanged.

**Before any live call**: read `.memory/test-execution-instructions.md`.

**Run vitest through PowerShell**, not the Bash tool.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US3 from spec.md

---

## Phase 1: Setup

**Purpose**: a known-green starting point.

- [X] T001 Before any edit, on branch `090-classify-missing-destination`, run `npm run typecheck; if ($?) { npm run lint }; if ($?) { npm test }` in PowerShell.
  - Create `specs/090-classify-missing-destination/post-implement.md`, headed `# Post-implement: 090 Classify missing destination`.
  - Record the result under `## T001 baseline`.
  - A failure here is pre-existing: report it, and do not fix it in this feature.

---

## Phase 2: Foundational: the registry dependency and the tests first (blocks every story)

**Purpose**: give `move` the vault registry with no behaviour change (research D6), then write rows M1–M20 and R1 against the unchanged behaviour and prove that they bite.

- [X] T002 In `src/tools/move/handler.ts`, add `vaultRegistry: VaultRegistry;` to `ExecuteDeps`, after `queue`. Add `import type { VaultRegistry } from "../../vault-registry/registry.js";` with the other type imports, in import order. Change nothing else yet.
- [X] T003 In `src/server.ts` line 123, change `createMoveTool({ logger, queue })` to `createMoveTool({ logger, queue, vaultRegistry })`. This is the only `server.ts` change (plan, kernel-node attention).
- [X] T004 [P] Apply X1–X3 (contract §X) in `src/tools/move/handler.test.ts`:
  - import `stubVaultRegistry` from `../_handler-test-fixtures.js` into the existing import list;
  - add `const REGISTRY = stubVaultRegistry("V", "/vaults/V");` above `deps()`;
  - add `vaultRegistry: REGISTRY` to the `deps()` return value and to each of the 25 inline `{ logger: silentLogger(), queue: createQueue(), spawnFn, env: {} }` literals.

  Nothing else in the file changes.
- [X] T005 [P] Apply X4 in `src/tools/move/index.test.ts`: import `stubVaultRegistry` from `../_handler-test-fixtures.js`, and add `vaultRegistry: stubVaultRegistry("MyVault", "/vaults/MyVault"),` to the four `createMoveTool({...})` literals (lines 20, 32, 43, 64). Nothing else changes.
- [X] T006 [P] Apply X5 in `src/tools/_typed-result-fixtures.ts` (line 210): `build: () => createMoveTool({ ...cli(out("Moved: Inbox/Tax-2026.md → Archive/Tax-2026.md\n")), vaultRegistry: registryAt("/vaults/MyVault") }),`.
- [X] T007 [P] Apply X6 in `src/tools/_plugin-noise.test.ts` (line 230): `build: () => createMoveTool({ ...cli(focusedFileResponse("Inbox/a.md", NOTE_ROOT), out("Moved: Inbox/a.md → Archive/a.md\n")), vaultRegistry: registryAt(NOTE_ROOT) }),`.
- [X] T008 Run `npm run typecheck`, then `npx vitest run src/tools/move src/tools/_plugin-noise.test.ts src/tools/_register.test.ts src/tools/_register-baseline.test.ts src/tools/_surface.test.ts src/server.test.ts`.
  - Everything must pass: the dependency is added but not yet used, and the baseline does not move.
  - If an assertion outside X1–X6 fails, stop and raise it.
  - Record the result in `post-implement.md` under `## T008 dependency added`.
- [X] T009 Create `src/tools/move/handler.missing-destination.test.ts`.
  - **Header**: `// Original — no upstream. move missing-destination and vault-relative failure tests (spec 090): an ENOENT rename becomes CLI_REPORTED_ERROR + details.code FOLDER_NOT_FOUND with the vault-relative folder, and every other move failure has the vault's absolute folder rewritten out (rows M1–M20 of contracts/missing-destination-contract.md).`
  - **Imports**: `executeMove` from `./handler.js`; `__resetInFlightRegistryForTests` from `../../cli-adapter/_dispatch.js`, with `beforeEach` / `afterEach` reset as in `handler.test.ts`; `UpstreamError`; `createQueue`; and `captureRejection`, `fileTsvResponse`, `focusedFileResponse`, `makeQueuedSpawn`, `makeStubSpawn`, `silentLogger`, `stubVaultRegistry` from `../_handler-test-fixtures.js`.
  - **Fixtures**:
    - `WIN_ROOT = "C:\\Vaults\\Work"` and `POSIX_ROOT = "/home/u/Vault"`.
    - `enoent(root, sep, src, dest)` returns `{ stdout: \`Error: ENOENT: no such file or directory, rename '${root}${sep}${src}' -> '${root}${sep}${dest}'\n\`, exitCode: 0 }`, with `src` and `dest` already using `sep`.
    - A recording registry: `function recordingRegistry(root)`, built over `stubVaultRegistry("Work", root)`, whose `resolveVaultPath` pushes to a `calls: string[]` array before returning. Plain functions, no `vi.fn`.
    - A `deps(spawnFn, registry)` helper returning `{ logger: silentLogger(), queue: createQueue(), spawnFn, env: {}, vaultRegistry: registry }`.
  - **Rows**: write M1–M20 exactly as contract §T specifies.
    - The exact E-1 message is: `move: the destination folder "<folder>" does not exist in the vault. Nothing was moved. Create the folder (writing a note into it with write_note creates it), then retry the move.`
    - E-1 rows assert `toEqual` on `{ code: err.code, message: err.message, details: err.details }` against `{ code: "CLI_REPORTED_ERROR", message: …, details: { code: "FOLDER_NOT_FOUND", folder } }`.
    - Use `makeQueuedSpawn` (exact queue) for every row except M16, which uses `makeStubSpawn({ errorOnSpawn: Object.assign(new Error("ENOENT"), { code: "ENOENT" }) })` as `handler.test.ts` Case 18 does.
    - For M13, the registry's `resolveVaultPath` throws `new UpstreamError({ code: "VALIDATION_ERROR", cause: null, details: {}, message: "unknown" })`. Assert that the rejection's `code`, `message` and `details` equal today's: `code === "CLI_REPORTED_ERROR"`, `message === "Vault not found."` (set by `runTyped`, `cli-adapter.ts:154-159`) and `details.message === "Vault not found."`. M13 asserts current behaviour and changes none (analyze F1).
    - For M18, the registry's `resolveVaultPath` throws `new UpstreamError({ code: "CLI_TIMEOUT", cause: null, details: {} })`, a failed `vaults` probe. Assert the E-2b payload by `toEqual` on `{code, message, details}`:
      - `code: "CLI_REPORTED_ERROR"`;
      - message `move: moving "Inbox/Note.md" to "Archive/Note.md" failed with CLI_REPORTED_ERROR, and the vault's folder could not be looked up (CLI_TIMEOUT), so the command-line output is withheld to keep absolute paths out of this error. Retry the move.`;
      - `details: { source: "Inbox/Note.md", destination: "Archive/Note.md" }`.

      Also assert `err.cause` is the thrown lookup error (`toBe`), and that `JSON.stringify` of `{code, message, details}` contains neither `Vaults` nor `EPERM` (analyze U1).
    - For M19, `to: "Archive\\2026\\Old.md"` (a TypeScript string with single backslashes). Expect E-1 with `folder: "Archive/2026"`; the recorded argv carries `to=Archive\2026\Old.md` unchanged, and there are 0 registry calls (analyze C1).
    - For M20, the move answers `{ stdout: "Unexpected: C:\\Vaults\\Work\\Archive\\Note.md\n", exitCode: 0 }`. That is a single non-`Moved:` line, so `parseMoveResponse` throws `stage: "parse"`. Expect:
      - `code: "CLI_REPORTED_ERROR"`;
      - `details.stage === "parse"`;
      - `details.stdout === "Unexpected: Archive\\Note.md\n"`;
      - `err.message` contains no `C:\Vaults`;
      - 1 registry call.

      Because the parse step sits inside the same `try` as the CLI call (T012), the rewrite reaches it (analyze C2).
    - For M11, also include a sibling folder that shares the root's prefix (`C:\Vaults\Workshop\x.md`) and assert it is left unchanged. The rewrite must stop at a path-segment boundary.
- [X] T010 [P] In `src/tools/move/index.test.ts`, add one new `it` (R1) inside the existing `describe("createMoveTool — descriptor", …)` block, after Case 3b:
  - Build the tool with a `makeSuccessSpawn` / `makeStubSpawn` answering M1's ENOENT line and a `stubVaultRegistry`.
  - Call `tool.handler` with M1's input.
  - Assert `"isError" in result` and `result.isError === true`, and that there is no `structuredContent`.
  - Assert `JSON.parse(result.content[0]!.text)` equals the E-1 payload with `folder: "Archive/2026"`.
  - Do not touch the existing `it` blocks beyond X4.
- [X] T011 Red check (quickstart §1). Run `npx vitest run src/tools/move/handler.missing-destination.test.ts src/tools/move/index.test.ts` against the unchanged behaviour.
  - Expected: M1–M12, M14, M18–M20 and R1 fail; M13 and M15–M17 pass. M14 fails because its contrast half expects M1's `FOLDER_NOT_FOUND`.
  - Record the pass/fail list per row in `post-implement.md` under `## T011 red check`.
  - If any of M1–M12, M14, M18–M20 or R1 passes, that row does not bite: fix the row (not the handler) before going on.

**Checkpoint**: the dependency is wired, existing suites are green, and the fix-proving rows are red.

---

## Phase 3: User Story 1: typed failure for a missing destination folder (Priority: P1) 🎯 MVP

**Goal**: an ENOENT rename becomes `CLI_REPORTED_ERROR` with `details: { code: "FOLDER_NOT_FOUND", folder }`. Nothing moves, and no vault lookup is made (FR-001–FR-004, FR-009, FR-010; research D1–D3, D7).

**Independent test**: M1–M7 and R1 pass, and every existing suite passes.

- [X] T012 [US1] In `src/tools/move/handler.ts`, add three private helpers next to `parseMoveResponse` (data-model E3, E4a; contract E-1):
  - `const ENOENT_RENAME_RE = /^Error: ENOENT: [^,]*, rename '/;`
  - `destinationFolder(resolvedTo: string): string`: replace every `\` with `/`, then return the text before the last `/`, or `""` when there is none.
  - `isMissingDestinationFolder(e: UpstreamError): boolean`: `e.code === "CLI_REPORTED_ERROR" && ENOENT_RENAME_RE.test(stringDetail(e.details, "message"))`. Import `stringDetail` from `../../errors.js`.
  - `folderNotFound(folder: string): UpstreamError`: `code: "CLI_REPORTED_ERROR"`, `cause: null`, `details: { code: "FOLDER_NOT_FOUND", folder }` (exactly these two keys, no `reason`), and the E-1 message verbatim.

  In `executeMove`, wrap the `invokeCli` call and the `parseMoveResponse` call in `try { … } catch (e) { … }`:
  - Rethrow `e` unchanged unless it is an `UpstreamError`.
  - When `isMissingDestinationFolder(e)` and the folder is not `""`, throw `folderNotFound(folder)`.
  - Otherwise rethrow `e` (T014 replaces this last step).
  - Keep `invokeCli({ … }, deps,)` with `deps` passed whole, and keep the multi-line call shape, so the `index.test.ts` drift lock (`/invokeCli\([\s\S]*?\s+deps,\s*\)/`, no `deps.logger`) still matches.
  - The success path, argv and `forwardedTo` stay byte-identical.
- [X] T013 [US1] Run `npm run typecheck`, then `npx vitest run src/tools/move`.
  - M1–M7, M13–M17, M19 and R1 must pass.
  - M8–M12, M18 and M20 may still fail; they belong to US2.
  - Every existing test must pass.
  - Record the result in `post-implement.md` under `## T013 US1`.

**Checkpoint**: an agent can test `details.code === "FOLDER_NOT_FOUND"` and read `details.folder`.

---

## Phase 4: User Story 2: no absolute disk paths in move failures (Priority: P1)

**Goal**: every other move-step failure keeps its code and wording, with the vault's absolute folder rewritten to the vault-relative form (FR-005; Clarifications Q1, Q3; research D4, D5; data-model E5 R-a to R-f).

**Independent test**: M8–M13, M16, M18 and M20 pass, and every existing suite passes with their original error objects.

- [X] T014 [US2] In `src/tools/move/handler.ts`, add the private rewrite and use it as the catch's last step.
  - `withVaultRelativePaths(e: UpstreamError, root: string): UpstreamError`:
    - trim trailing `\` / `/` from `root`;
    - escape it for a regex, and let each separator in it match `[\\/]`;
    - match with flags `gi`;
    - replace `<root><separator>` with `""` and a bare `<root>` with `.`;
    - only match at a path-segment boundary, so `<root>shop\x` (a sibling folder) is left alone (M11);
    - apply it to `e.message` and, recursively, to every string inside `e.details` (arrays and plain records; numbers, booleans and `null` untouched);
    - count the replacements. With zero, return `e` itself. Otherwise return `new UpstreamError({ code: e.code, cause: e.cause, details: <rewritten>, message: <rewritten> })`.
  - The last step of the `catch`:
    - When `e.code === "CLI_BINARY_NOT_FOUND"`, rethrow `e`.
    - Otherwise the root is `target.vaultRoot` when `target.vault === undefined`. If not, the root comes from `deps.vaultRegistry.resolveVaultPath(target.vault)`. When that lookup throws:
      - **The registry's not-registered error** (`lookupErr instanceof UpstreamError && lookupErr.code === "VALIDATION_ERROR"`, `registry.ts:94-101`): rethrow the original `e` untouched. Comment, citing research D5: a vault the registry does not know is one the CLI did not act on.
      - **Any other lookup failure**: throw `withheldFailure(e, target.relPath, resolvedTo, lookupErr)`. This is a fourth private helper building data-model E4c / contract E-2b verbatim:
        - `code: e.code`;
        - `cause: lookupErr`;
        - `details: { source, destination }` (exactly these two keys);
        - the E-2b message, with `<move code>` = `e.code` and `<lookup code>` = `lookupErr.code` when `lookupErr` is an `UpstreamError`, otherwise `unknown`.

        Never throw `lookupErr` itself in the move failure's place (Principle IV; analyze U1).
    - Throw `withVaultRelativePaths(e, root)`.
  - The `FOLDER_NOT_FOUND` branch (T012) stays before the lookup, so it never consults the registry (V5).
  - Update the file header: append "Spec 090: a move-step failure is classified after the CLI reports it — an ENOENT rename becomes CLI_REPORTED_ERROR + details.code FOLDER_NOT_FOUND with the vault-relative destination folder (no lookup); every other failure but CLI_BINARY_NOT_FOUND has the vault's absolute folder (active: focused-file eval; specific: vault registry, after the failure) rewritten to the vault-relative form, the same object when nothing changed; when the specific-mode lookup fails for any reason but an unregistered vault, the CLI text is withheld (code kept, vault-relative source and destination named, lookup failure as cause)."
- [X] T015 [US2] Run `npm run typecheck`, then `npx vitest run src/tools/move src/tools/_plugin-noise.test.ts`.
  - All of M1–M20 and R1 pass.
  - Every existing test passes unchanged beyond X1–X6.
  - Record the result in `post-implement.md` under `## T015 US2`.

**Checkpoint**: no move failure in the suite carries the vault root, and the path-free failures are the original objects.

---

## Phase 5: User Story 3: distinguishable failures (Priority: P2)

**Goal**: a missing source and a missing destination folder differ by stable signal alone, and the existing failures keep their signal and text (FR-006, FR-007).

**Independent test**: M13–M15 pass, and M14 contrasts the two signals in one test, with no code beyond T012 and T014.

- [X] T016 [US3] Run `npx vitest run src/tools/move/handler.missing-destination.test.ts -t "M1[3-5]"`, then the whole `src/tools/move/handler.test.ts` (its existing source-not-found Case 16 and destination-collision Case 17 must pass unchanged).
  - If one fails, fix the handler, not the row. Do not add a sub-code to the missing-source failure (Clarification Q2).
  - Record the result under `## T016 US3`.

**Checkpoint**: an agent can branch on `details.code` alone.

---

## Phase 6: Polish: published contract, live check, verification

- [X] T017 [P] In `src/tools/move/index.ts`:
  - Append contract §H1 to `MOVE_DESCRIPTION`, as one more sentence after the existing text, separated by a space and kept inside the same template literal.
  - Update the header: append "Spec 090: the description names the FOLDER_NOT_FOUND failure and its recovery."
- [X] T018 Surface gate (quickstart §2).
  - Run `npx vitest run src/tools/_register-baseline.test.ts`. Expected: it fails on the `move` description only (P1).
  - Run `npm run baseline:write`, then `git diff -- src/tools/_register-baseline.json`, and confirm the only change is the `move` description string (P2).
  - Re-run the baseline test, `src/tools/_register.test.ts` and `src/tools/_surface.test.ts`; all pass.
  - `git diff --exit-code main -- src/errors.ts src/tools/move/schema.ts` prints nothing (P3, P4).
  - Record the result under `## T018 surface gate`.
- [X] T019 [P] In `docs/tools/move.md`, apply contract §H2–H5 verbatim:
  - the Errors-table row after the destination-collision row;
  - the "No absolute paths" paragraph directly under the Errors table;
  - the Behavioural-notes bullet after the destination-collision bullet;
  - the Branch 2 wording.

  Then run `npx vitest run src/tools/help src/tools/move/index.test.ts`; the docs-sync guard and the move docs test pass.
- [X] T020 [P] In `CHANGELOG.md`, add `Spec 090-classify-missing-destination.` after the `Spec 089-resolve-note-names (BI-0171).` line in `[Unreleased]`. Add the contract §C `Fixed` entry verbatim at the top of the `[Unreleased]` `### Fixed` list.
- [X] T021 Required live check (quickstart §3, contract §L). Read `.memory/test-execution-instructions.md` first.
  - Run `npm run build`.
  - Record the `Sandbox/` entry count (13 at plan time).
  - Seed `Sandbox/090-live/Note.md` and `Sandbox/090-live/Live090Unique.md`.
  - Run L1–L6 through the built server against `TestVault-Obsidian-CLI-MCP`, and check L7 across every failure payload.
  - After L1–L3 and L5, confirm that no folder was created and that `Note.md` is unchanged.
  - Remove `Sandbox/090-live/` and any `.trash/` entries from this run. Confirm that the `Sandbox/` count matches and that `Welcome.md` is untouched.
  - Record cases attempted, passed and failed, with verbatim payloads, under `## T021 live check`.
  - If the vault is left in an unexpected state, stop and report.
- [X] T022 Post-implement structural verification (plan §CodeGraph structural check).
  - Run `codegraph sync`, then `codegraph_explore "executeMove createMoveTool createServer withVaultRelativePaths folderNotFound"`.
  - Confirm and record under `## T022 structural verification`:
    1. `src/errors.ts` is unchanged, and every new `new UpstreamError` in `move/handler.ts` uses `CLI_REPORTED_ERROR` or the caught error's own code.
    2. No handler imports `createLogger` or `createQueue`, and `server.ts` differs from `main` only in the `createMoveTool` argument.
    3. `move/handler.ts` imports only downward (`cli-adapter`, `errors`, `file-type`, `_file-target`, the `VaultRegistry` type), and no other tool imports from `move/`.
    4. The new private helpers' only caller is `executeMove`, and there is no new production export.
- [X] T023 Full gate: `npm run typecheck; if ($?) { npm run lint }; if ($?) { npm run format:check }; if ($?) { npm test }` in PowerShell.
  - Everything must pass, including the coverage floor.
  - Run `npx prettier --write` only on files this feature touched, if `format:check` names them.
  - Check the 1000-line limit of every touched test file with `[System.IO.File]::ReadAllLines(p).Length`.
  - Record the result under `## T023 full gate`.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)** → **Foundational (T002–T011)** → **US1 (T012–T013)** → **US2 (T014–T015)** → **US3 (T016)** → **Polish (T017–T023)**.
- Within Phase 2:
  - T002 comes before T003–T007, which need the field to type-check.
  - T004–T007 can run in parallel.
  - T008 needs T002–T007.
  - T009 and T010 need T008.
  - T011 needs T009 and T010.
- US2 (T014) extends the `catch` that US1 (T012) adds, in the same file, so it is sequential.
- US3 has no code. It depends on T012 and T014.
- T017 must land before T018 (the baseline must capture the final description).
- T019 and T020 are docs and depend only on the final contract text.
- T021 needs every source edit and the build. T022 needs every source edit. T023 runs last.

### Structural dependency notes (CodeGraph, per CLAUDE.md `/speckit-tasks` rule)

- The task list crosses `move/` (handler, index), `server.ts` and two cross-tool fixture modules.
- `codegraph_explore "executeMove createMoveTool createServer resolveFileTarget resolveVaultPath focusedFileResponse stubVaultRegistry"` shows the path `createServer → createMoveTool → executeMove → resolveFileTarget` (`server.ts:92 → move/index.ts:14 → move/handler.ts:59 → _file-target.ts:44`). So:
  - T002 (the `ExecuteDeps` field) propagates through `RegisterDeps = BootDeps<ExecuteDeps>` to every `createMoveTool` caller: `server.ts` (T003), `_typed-result-fixtures.ts` (T006), `_plugin-noise.test.ts` (T007) and `move/index.test.ts` (T005). That is why T003–T007 all depend on T002, and why T008 type-checks them together.
  - `executeMove` reads `target.vaultRoot` from `resolveFileTarget`'s active-mode result. That module is unedited, so no task touches it.
  - `resolveVaultPath` is among the most-depended-on interfaces. Its production callers reach it through an injected registry (`read`, `write_note`, `query_base`, `_file-target.ts`, `_active-file.ts`), and the index under-reports calls made through injected deps. `move` becomes one more injected-dep consumer, like `read`, not an importer of `vault-registry/registry.ts`'s factory. The handler imports the `VaultRegistry` type only.
- There is no structural path between `move/` and any other tool. The two cross-tool fixture modules depend on `createMoveTool`, not the other way round.

### Parallel opportunities

- T004 ∥ T005 ∥ T006 ∥ T007 (four test files).
- T009 ∥ T010 (two test files).
- T017 ∥ T019 ∥ T020 (index.ts, help page, changelog). T018 waits for T017.

---

## Parallel Example: Phase 2 test edits

```text
Task: "T004 X1–X3 in src/tools/move/handler.test.ts"
Task: "T005 X4 in src/tools/move/index.test.ts"
Task: "T006 X5 in src/tools/_typed-result-fixtures.ts"
Task: "T007 X6 in src/tools/_plugin-noise.test.ts"
then
Task: "T008 typecheck + move/plugin-noise/register/surface/server suites"
```

---

## Implementation Strategy

### MVP first (User Story 1)

1. T001: baseline.
2. T002–T008: the dependency, wired with no behaviour change.
3. T009–T011: the suite, red.
4. T012–T013: the `FOLDER_NOT_FOUND` classification. This is the MVP: an agent gets a stable signal and the vault-relative folder.

### Incremental delivery

5. T014–T015 (US2): the vault-root rewrite closes the leak for every other failure.
6. T016 (US3): the existing failures are proven unchanged and distinguishable.
7. T017–T023: description and baseline, help page, changelog, live check, structural verification, full gate.

---

## Notes

- **Existing-test edits**: exactly X1–X6, approved by the owner (option A, 2026-11-02; refactor-decisions §5). Stop on any other failing existing assertion.
- **Multiple source modules**: the CodeGraph pair check above applies. It found the `RegisterDeps` propagation path, which is reflected in the T002 → T003–T008 dependencies.
- **Out of scope** (research follow-ups):
  - a folder-creation capability;
  - scrubbing resolution-stage failures in `_active-file.ts`;
  - `rename`'s identical pass-through of Node fs error text.
