---

description: "Task list for 091 Report unknown vault"
---

# Tasks: Report unknown vault

**Input**: Design documents from `specs/091-report-unknown-vault/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/unknown-vault-contract.md](contracts/unknown-vault-contract.md), [quickstart.md](quickstart.md)

**Tests**: requested. Constitution Principle II requires happy-path and failure tests for the modified `obsidian_exec` tool in the same change. All rows (U1–U14, B1, B2, R1) are written before the behaviour change, so the quickstart §1 red check can show that they bite.

**Organization**:

- Phase 2 writes every new test row against today's behaviour and records the red check (blocking).
- One phase per user story in priority order:
  - US1 (P1): a raw command against an unknown vault fails. This phase holds the only production code change.
  - US2 (P1): the error matches the typed tools'. Its rows go green with US1's code, and this phase verifies them.
  - US3 (P2): real output is not affected. Its rows are green before and after, and this phase verifies them.
- Phase 6 publishes the contract (description, baseline, help page, CHANGELOG), then runs the full gate, the live check and the structural check.
- Row IDs refer to the contract:
  - P1–P4: surface checks;
  - E-1 to E-4: the error contract;
  - U1–U14, B1, B2 and R1: test rows;
  - §X: existing-test edits (none);
  - §H: description and help text;
  - §C: the CHANGELOG text;
  - L1–L6: the live column.

**Scope**: `src/cli-adapter/invoke-bounded-cli.ts` (the check), `src/tools/obsidian_exec/index.ts` (the description) and a comment in `src/cli-adapter/cli-adapter.ts`. These stay unedited:

- `src/tools/obsidian_exec/handler.ts` and `schema.ts`;
- `src/cli-adapter/_dispatch.ts`;
- `src/errors.ts`;
- `src/server.ts`;
- every typed tool;
- every existing assertion (§X: none approved).

**Before any code edit**:

- load the `karpathy-guidelines` skill;
- read `.memory/refactor-decisions.md`. These items apply here:
  - §2: the byte-exact bar. Every unchanged success and failure must be identical;
  - §3: tests import only public exports (`executeObsidianExec`, `invokeBoundedCli`, `invokeCli`, `createObsidianExecTool`, `__resetInFlightRegistryForTests`);
  - §5: no existing-test edit is approved. If any existing assertion fails, stop and raise it, and do not edit that test;
  - §25: the `command` refine and the blocked-command gate are untouched;
  - §27(a): the baseline moves only for the `obsidian_exec` description;
  - §29: `executeObsidianExec` keeps passing its deps whole to `invokeBoundedCli`;
  - §41: `invokeBoundedCli` never carries `evalAnswer`, and the check must not rely on it.

**Before any live call**: read `.memory/test-execution-instructions.md`.

**Run vitest through PowerShell**, not the Bash tool.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US3 from spec.md

---

## Phase 1: Setup

**Purpose**: a known-green starting point.

- [X] T001 Before any edit, on branch `091-report-unknown-vault`, run `npm run typecheck; if ($?) { npm run lint }; if ($?) { npm test }` in PowerShell.
  - Create `specs/091-report-unknown-vault/post-implement.md`, headed `# Post-implement: 091 Report unknown vault`.
  - Record the result under `## T001 baseline`.
  - A failure here is pre-existing: report it, and do not fix it in this feature.

---

## Phase 2: Foundational: every test row first (blocks every story)

**Purpose**: write all rows against today's unchanged behaviour, and prove that the failure rows bite (quickstart §1 step 1).

- [ ] T002 [P] Create `src/tools/obsidian_exec/handler.unknown-vault.test.ts` with rows U1–U14 exactly as contract §T specifies.
  - **Header**: `// Original — no upstream. obsidian_exec unknown-vault rows (spec 091): a named vault whose whole stdout, trimmed, is "Vault not found." fails as CLI_REPORTED_ERROR; every other output and every call without vault is unchanged.`
  - **Harness**: drive `executeObsidianExec` with `{ logger: silentLogger(), queue: createQueue(), spawnFn, env: {} }`, the same as `obsidian_exec/handler.test.ts`, plus `allowEval: true` for U5 and U12. Do not set `OBSIDIAN_BIN`: the resolver `fs.access`-checks an override and never falls back, so every row would reject with `CLI_BINARY_NOT_FOUND` (analyze I1). Use `makeQueuedSpawn` / `captureRejection` from `src/tools/_handler-test-fixtures.ts`, and `__resetInFlightRegistryForTests()` in `beforeEach` / `afterEach`, as `handler.test.ts` does.
  - **Failure rows** (U1–U5, U13): assert with `toEqual` on the whole error: `code: "CLI_REPORTED_ERROR"`, `message: "Vault not found."`, `cause: null`, and `details: { argv, command, stdout, stderr, exitCode: 0, message: "Vault not found." }`.
    - `argv` is `[<binary>, "vault=NoSuchVault", <command>, ...kvs]`, with `<binary>` taken from `recorded[0].binary`.
    - `stdout` is the untrimmed stub text.
  - **Success rows** (U6–U12): assert the resolved value equals `{ stdout, stderr, exitCode: 0, argv }` from the stub.
  - **Spawn count**: U1 asserts `getCount()` is 1. U14c asserts 0 with `makeQueuedSpawn([])`.
- [ ] T003 [P] Append a `describe("invokeBoundedCli — unknown-vault answer (spec 091)")` with B1 and B2 to `src/cli-adapter/invoke-bounded-cli.test.ts`, using that file's own `makeStubSpawn` / `stubResolveBinary` / `pendingRejection` helpers.
  - **B1**: `deps` also carries a recording `launchFn` (`async () => { launches += 1; }`, typed `LaunchFn`). Assert E-1 with `toEqual`, one recorded spawn, and `launches === 0`.
  - **B2**: import `invokeCli` from `./cli-adapter.js`. Run both facades against the same stub (`"Vault not found.\n"`, exit 0): `invokeCli({ target_mode: "specific", command: "files", vault: "NoSuchVault", parameters: {}, flags: [] }, deps)`. Assert that `code`, `message` and `details.message` are equal across the two errors (E-4).
  - Update the file's header comment to add `the unknown-vault answer (spec 091)` to its list.
- [ ] T004 [P] Append `it` R1 to `src/tools/obsidian_exec/index.test.ts` (contract §T). Call the registered tool's `handler({ command: "files", vault: "NoSuchVault" })` with the file's `makeStubSpawn({ stdout: "Vault not found.\n" })`. Assert `isError: true`, and that `JSON.parse(content[0].text)` has `code: "CLI_REPORTED_ERROR"`, `message: "Vault not found."` and `details.message: "Vault not found."`.
- [ ] T005 Red check (quickstart §1 step 1): run `npx vitest run src/tools/obsidian_exec src/cli-adapter/invoke-bounded-cli.test.ts` in PowerShell.
  - Expected: U1–U5, U13, B1, B2 and R1 fail because the call succeeds (the vault check is missing), never with `CLI_BINARY_NOT_FOUND` or any other rejection; U6–U12 and U14a–c pass; every pre-existing test passes. Record each failing row's actual failure reason.
  - Record the pass/fail list under `## T005 red check` in `post-implement.md`.
  - If a pre-existing test fails, or a row's outcome differs from this expectation, stop and raise it.

**Checkpoint**: every row exists and the failure rows bite.

---

## Phase 3: User Story 1 — A raw command against an unknown vault fails (Priority: P1) 🎯 MVP

**Goal**: a call that names a vault the CLI does not know fails with the vault-not-found error instead of succeeding (FR-001, FR-003, FR-007).

**Independent Test**: U1–U5 and U13 in `handler.unknown-vault.test.ts`, and B1, pass.

- [ ] T006 [US1] In `src/cli-adapter/invoke-bounded-cli.ts`, add the check exactly as data-model E3/E4 and the per-call flow specify:
  - Add `import { UpstreamError } from "../errors.js";`, placed with the other value import, ahead of the `import type` lines.
  - Add the private constant `const UNKNOWN_VAULT_ANSWER = "Vault not found.";` with a one-line comment. The comment says that the CLI answers every command this way for an unknown vault (spec 091 research F1), and that the typed facade's `UNKNOWN_VAULT_PREFIX` in `cli-adapter.ts` applies a looser start-of-output rule.
  - Inside the existing `deps.queue.run` callback, after `dispatchCli` resolves and before `return out`, add `if (input.vault !== undefined && out.stdout.trim() === UNKNOWN_VAULT_ANSWER)` and throw `new UpstreamError({ code: "CLI_REPORTED_ERROR", cause: null, details: { argv: out.argv, command: input.command, stdout: out.stdout, stderr: out.stderr, exitCode: 0, message: UNKNOWN_VAULT_ANSWER }, message: UNKNOWN_VAULT_ANSWER })`. Keep that `details` key order.
  - Do not change `dispatchInput`, the `dispatchCli` deps object, the queue options or any export.
  - Extend line 1's header. After the 068 R11 sentence, append: `Spec 091: a call that names a vault and whose whole stdout, trimmed, is the CLI's "Vault not found." answer fails as CLI_REPORTED_ERROR; any other output, or a call without a vault, is returned unchanged.`
- [ ] T007 [US1] In `src/cli-adapter/cli-adapter.ts`, add one comment line directly above `const UNKNOWN_VAULT_PREFIX`: `// The raw facade (invoke-bounded-cli.ts) checks the same answer under a stricter rule: named vault, whole stdout (spec 091).` Make no code change. `runTyped` stays byte-identical (FR-008).
- [ ] T008 [US1] Run `npx vitest run src/tools/obsidian_exec/handler.unknown-vault.test.ts src/cli-adapter/invoke-bounded-cli.test.ts` in PowerShell. Expected: U1–U14 and B1 pass. Record the result under `## T008 US1` in `post-implement.md`.

**Checkpoint**: US1 delivered. A mistyped vault name now fails the raw call.

---

## Phase 4: User Story 2 — The error matches the typed tools' error (Priority: P1)

**Goal**: the raw tool's failure has the same `code`, `message` and `details.message` as the typed tools' (FR-002, E-4, SC-002).

**Independent Test**: B2 and R1 pass, and the typed facade's existing unknown-vault tests pass unchanged.

- [ ] T009 [US2] Run `npx vitest run src/cli-adapter src/tools/obsidian_exec` in PowerShell. Expected:
  - B2 and R1 pass;
  - every existing `cli-adapter.test.ts` `Vault not found.` row passes unchanged, which shows the typed rule did not move (FR-008).
  - Record the result under `## T009 US2` in `post-implement.md`.
  - If B2 fails on `message`, fix T006's `message` argument, not the test.

**Checkpoint**: US2 delivered. Agents can handle both surfaces' unknown-vault failure with one check.

---

## Phase 5: User Story 3 — Real output that mentions the phrase is not affected (Priority: P2)

**Goal**: known-vault output that contains the sentence, output from calls without `vault`, and eval answers keep succeeding unchanged (FR-004, FR-005, FR-006, SC-003).

**Independent Test**: U6–U12 and U14a–c pass, and every pre-existing `obsidian_exec` and facade test passes unchanged.

- [ ] T010 [US3] Re-run `npx vitest run src/tools/obsidian_exec src/cli-adapter/invoke-bounded-cli.test.ts` in PowerShell and confirm the following, recording the result under `## T010 US3` in `post-implement.md`:
  - U6–U12 and U14a–c still pass after T006, as they did at T005;
  - `git diff --stat main -- src/tools/obsidian_exec/handler.test.ts src/tools/obsidian_exec/schema.test.ts src/cli-adapter/cli-adapter.test.ts src/cli-adapter/_dispatch.test.ts` is empty (§X).

**Checkpoint**: every story is independently verified.

---

## Phase 6: Polish & cross-cutting

**Purpose**: publish the contract, then run the full gate, the live check and the structural check.

- [ ] T011 [P] In `src/tools/obsidian_exec/index.ts`, set `OBSIDIAN_EXEC_DESCRIPTION` to the exact text of contract §H1. The only change is `unknown vault, ` inserted after `in-band Error: prefix, `. Leave the header and every other line unchanged.
- [ ] T012 Surface gate (quickstart §2), after T011:
  1. Run `npx vitest run src/tools/_register` and confirm that it fails on the `obsidian_exec` description only.
  2. Run `npm run baseline:write`.
  3. Run `git diff src/tools/_register-baseline.json` and confirm that only the `obsidian_exec` entry's `description` moved (P2). Any other moved byte stops the change.
  4. Re-run step 1 and confirm that it passes.
  5. Record the result under `## T012 surface gate` in `post-implement.md`.
- [ ] T013 [P] In `docs/tools/obsidian_exec.md`, apply contract §H2 (the new error-table row after the `CLI_REPORTED_ERROR` row), §H3 (the corrected example in the existing `CLI_REPORTED_ERROR` row) and §H4 (the "Freeform escape hatch" sentence), word for word.
- [ ] T014 [P] In `CHANGELOG.md`, apply contract §C word for word: the `Spec 091-report-unknown-vault (BI-0173).` line after `Spec 090-classify-missing-destination.`, and the new first bullet under `### Fixed`.
- [ ] T015 Full gate: run `npm run typecheck; if ($?) { npm run lint }; if ($?) { npm test }` in PowerShell.
  - Expected: all green, and coverage at or above the floor in `vitest.config.ts`.
  - Record the result under `## T015 full gate` in `post-implement.md`.
  - If any pre-existing test fails, stop and raise it (§X), and do not edit that test.
- [ ] T016 Live check (quickstart §3), against `TestVault-Obsidian-CLI-MCP` and the unknown name `NoSuchVault-091` only:
  1. Run `npm run build`, then make sure the MCP client's registration of the built server (`obsidian-cli-mcp-local`) has reloaded the new `dist/`.
  2. Seed `Sandbox/091-probe/first-line.md` with `Vault not found.\nSecond line.\n`.
  3. Run L1–L6 (contract §L), quoting each result verbatim under `## T016 live check` in `post-implement.md`.
  4. Delete `Sandbox/091-probe/`, and confirm that `Sandbox/` is back to its pre-run entries and `Welcome.md` is untouched.
  5. If any row differs from §L, stop and report.
- [ ] T017 Structural check (quickstart §4, plan §CodeGraph structural check): run `codegraph sync`, then `codegraph_explore "invokeBoundedCli executeObsidianExec UpstreamError UNKNOWN_VAULT_ANSWER"`. Verify these four points and record them under `## T017 structural check` in `post-implement.md`:
  1. No new error class or code, and `src/errors.ts` is unchanged.
  2. `server.ts` is unchanged, and no handler imports `createLogger` / `createQueue`.
  3. `invoke-bounded-cli.ts` imports only `_dispatch.js`, `../errors.js` and the logger and queue types (no `cli-adapter.ts` import).
  4. `UNKNOWN_VAULT_ANSWER` is private and used by `invokeBoundedCli` only.
- [ ] T018 Close-out: in `post-implement.md`, map every FR-001–FR-009 and SC-001–SC-005 to the rows and tasks that proved it, following the plan's Spec alignment note. Mark every task above `[X]`.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)** runs first.
- **Foundational (T002–T005)** depends on T001 and blocks every story. T002, T003 and T004 are in different files ([P]). T005 runs after all three.
- **US1 (T006–T008)** depends on T005. T007 can run alongside T006: it is a comment-only edit in another file.
- **US2 (T009)** depends on T006, because B2 and R1 go green only with the check in place.
- **US3 (T010)** depends on T006, because it re-confirms the success rows after the change.
- **Polish**:
  - T011, T013 and T014 can start after T005, in parallel ([P], different files).
  - T012 depends on T011.
  - T015 depends on T006–T014.
  - T016 depends on T015.
  - T017 depends on T006 and T011.
  - T018 runs last.

### Structural task-dependency note (CodeGraph)

`codegraph_explore "invokeBoundedCli OBSIDIAN_EXEC_DESCRIPTION runTyped executeObsidianExec"` at HEAD `c632243` shows these paths:

- **`createObsidianExecTool` → `executeObsidianExec` → `invokeBoundedCli`**: `index.ts:22` → `handler.ts:55` → `invoke-bounded-cli.ts:51`. So R1 (T004, through the registered tool) and U1–U14 (T002, through the handler) both depend on T006's facade change, even though T006 edits neither tool file. The task graph above reflects this through T005 → T006 → T008/T009.
- **`OBSIDIAN_EXEC_DESCRIPTION` → `_register-baseline.json`**: `OBSIDIAN_EXEC_DESCRIPTION` reaches only `createObsidianExecTool` and `index.test.ts:46`, by identity. T011 is therefore independent of T006 and gates only T012.
- **`runTyped` ⟂ `invokeBoundedCli`**: no path between them. They are sibling facades over `dispatchCli`, so T007's comment cannot affect the raw facade, and T006 cannot affect the typed tools. B2 is the runtime proof of the second point.

---

## Parallel Example: Foundational

```text
Task: "T002 Create src/tools/obsidian_exec/handler.unknown-vault.test.ts (U1–U14)"
Task: "T003 Append B1, B2 to src/cli-adapter/invoke-bounded-cli.test.ts"
Task: "T004 Append R1 to src/tools/obsidian_exec/index.test.ts"
```

## Parallel Example: Polish

```text
Task: "T011 OBSIDIAN_EXEC_DESCRIPTION in src/tools/obsidian_exec/index.ts"
Task: "T013 docs/tools/obsidian_exec.md §H2–H4"
Task: "T014 CHANGELOG.md §C"
```

---

## Implementation Strategy

### MVP first (User Story 1)

1. T001 baseline.
2. T002–T005: every row, with the red check.
3. T006–T008: the check in the facade. **Stop and validate**: a mistyped vault now fails the raw call.

### Incremental delivery

1. US1 (T006–T008) gives the failure.
2. US2 (T009) proves parity with the typed tools. No extra code is needed.
3. US3 (T010) proves that nothing else moved. No extra code is needed.
4. Polish (T011–T018) publishes the surface change and runs the gates.

---

## Notes

- The production code change is one check in one facade (T006), plus one description string (T011). Every other task is a test, a doc or a gate.
- No existing test is edited (§X). A failing existing assertion is a stop-and-raise, never a test edit.
- [P] tasks touch different files and have no dependency on an incomplete task.
- Commit after the Phase 6 gates pass, using `/speckit-git-commit`.
