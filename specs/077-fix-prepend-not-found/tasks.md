---

description: "Task list for 077-fix-prepend-not-found"
---

# Tasks: Report Missing Notes on Add-to-Top

**Input**: Design documents from `specs/077-fix-prepend-not-found/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/prepend-not-found-contract.md](contracts/prepend-not-found-contract.md), [quickstart.md](quickstart.md)

**Tests**: required. Constitution Principle II (NON-NEGOTIABLE) requires happy-path and failure-or-boundary tests, co-located as `*.test.ts`, in the same change that modifies a tool. Spec FR-009 requires tests for both detection points.

**Organization**: tasks are grouped by user story. The production change sits entirely in `src/tools/prepend/handler.ts`. US1 carries all of it; US2, US3 and US4 add tests against that code, so they depend on US1's implementation but are tested independently.

Load the `karpathy-guidelines` skill before writing any code or test (user's global CLAUDE.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story the task belongs to (US1 to US4)

---

## Phase 1: Setup

**Purpose**: confirm a green starting point.

- [ ] T001 Run `npm run typecheck`, `npm run lint` and `npm test` on branch `077-fix-prepend-not-found` before any edit, and record any pre-existing failure so it is not later blamed on this change.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: none needed. prepend's `ExecuteFs`, `_handler-fixtures.ts` (`fakeFs` with `over.stat`, `fakeRegistry`, `deps`, `PREPEND_OK`) and `makeQueuedSpawn` in `src/tools/_handler-test-fixtures.ts` already support every test below (research F5). No seam or fixture change.

---

## Phase 3: User Story 1 — Documented not-found classification (Priority: P1) 🎯 MVP

**Goal**: `prepend` on a missing note fails with `CLI_REPORTED_ERROR` / `details.code: NOTE_NOT_FOUND`, in default and inline mode, whether the wrapper's pre-call check or Obsidian's report detects it, and nothing is written (spec FR-001, FR-001a, FR-001b, FR-005, FR-006, FR-009; contract E1–E5, E11).

**Independent Test**: with mocked `invokeCli` and `fakeFs`, (a) a first `stat` throwing `ENOENT` yields `NOTE_NOT_FOUND` with no spawn; (b) a succeeding `stat` plus stdout `Error: File "<path>" not found.\n` (exit 0) yields `NOTE_NOT_FOUND`.

### Tests for User Story 1 ⚠️ write first, confirm they fail

- [ ] T002 [P] [US1] Create `src/tools/prepend/handler.not-found.test.ts` with header `// Original — no upstream. Spec 077 — prepend's missing-note failure: the pre-call stat check and Obsidian's confirmed "File not found" line both report NOTE_NOT_FOUND, with the same shape as append_note.` Reuse `fakeFs`, `fakeRegistry`, `deps`, `VAULT_ROOT` and `PREPEND_OK` from `./_handler-fixtures.js` and `makeQueuedSpawn` from `../_handler-test-fixtures.js`. Use vault `"TestVault"` and path `"Sandbox/missing.md"`. Add a local `enoent()` helper returning an `Error` with `code: "ENOENT"`. In a `describe("pre-call check (spec 077 FR-001a)")` block:
  - **E1** default mode: `fakeFs({ over: { stat: async () => { throw enoent(); } } })`, `makeQueuedSpawn([PREPEND_OK])`. Expect an `UpstreamError` with `code: "CLI_REPORTED_ERROR"`, `details` **toEqual** `{ code: "NOTE_NOT_FOUND", path: "Sandbox/missing.md", vault: "TestVault" }`, `message` `Note "Sandbox/missing.md" not found in vault.`, `cause` being the thrown ENOENT error, `recorded.length === 0` (Obsidian not called), `fs.readCalls` empty and `fs.writes` empty.
  - **E2**: as E1 with `inline: true`; same expectations.
  - **E3**: as E1 with path `"Sandbox/nofolder/missing.md"`; `details.path` and the message carry that path.
  - **E11** active mode: `makeQueuedSpawn([focusedFileResponse("gone.md", VAULT_ROOT)])` (`focusedFileResponse(relPath, base)` from `../_handler-test-fixtures.js`), `fakeRegistry({ Knowledge: VAULT_ROOT })` (its built-in reverse lookup returns `"Knowledge"`), `stat` throwing ENOENT. Expect `NOTE_NOT_FOUND` with `path: "gone.md"`, `vault: "Knowledge"`, and only the focused-file eval spawned (`recorded.length === 1`).
- [ ] T003 [P] [US1] In the same file, a `describe("Obsidian's report (spec 077 FR-001b, FR-009)")` block, with the default `fakeFs({ sizes: [3, 3] })` (stat succeeds):
  - **E4** case mismatch: path `"notes/plan.md"`, `makeQueuedSpawn([{ stdout: 'Error: File "notes/plan.md" not found.\n', exitCode: 0 }])`. Expect `code: "CLI_REPORTED_ERROR"`, `details` toEqual `{ code: "NOTE_NOT_FOUND", path: "notes/plan.md", vault: "TestVault" }`, the message, `cause` an `UpstreamError` (the dispatch error) whose `details.stdout` holds the line, and `fs.writes` empty.
  - **E5** removed in between, inline: as E4 with path `"Sandbox/gone.md"`, `inline: true` and the matching line. Same expectations.
  - A CRLF-terminated line (`'Error: File "notes/plan.md" not found.\r\n'`) is also recognised.
  - These are the tests that pin the T0-confirmed wording (research F2): they must fail if the pattern stops matching it.
- [ ] T004 [US1] In `src/tools/prepend/handler.test.ts`, rewrite the test "pre-stat ENOENT → preCallSize defaults to 0, call proceeds and succeeds (FR-016)" in the `describe("US1 pre-stat errno handling (FR-016 absent-target)")` block (research F5): rename it "pre-stat ENOENT → NOTE_NOT_FOUND before Obsidian is called (spec 077 FR-001a)", keep its `stat` override (first call throws ENOENT) and `makeQueuedSpawn([PREPEND_OK])`, and expect `CLI_REPORTED_ERROR` / `details.code: "NOTE_NOT_FOUND"` with `details.path: "Sandbox/new-note.md"`, `details.vault: "TestVault"`, and `recorded.length === 0`. Replace the old explanatory comment with one line citing spec 077. Leave the sibling EACCES test unchanged.

### Implementation for User Story 1

- [ ] T005 [US1] In `src/tools/prepend/handler.ts`, add a module-private builder below `extractErrno` (research D3, data-model R1):
  ```ts
  /** Spec 077 — the missing-note failure, same shape as append_note's (FR-002 – FR-004). */
  function noteNotFound(relPath: string, vaultDisplayName: string | null, cause: unknown): UpstreamError
  ```
  returning `new UpstreamError({ code: "CLI_REPORTED_ERROR", cause, details: { code: "NOTE_NOT_FOUND", path: relPath, vault: vaultDisplayName }, message: \`Note "${relPath}" not found in vault.\` })`. Replace the inline construction in `classifyUpstreamFailure`'s not-found branch with `throw noteNotFound(relPath, vaultDisplayName, err);`. Behaviour-neutral on its own.
- [ ] T006 [US1] In `src/tools/prepend/handler.ts`, add the T0-confirmed pattern as the first entry of `NOTE_NOT_FOUND_PATTERNS`: `/^\s*Error: File ".*" not found\.\s*$/m` (research D2). Replace the comment above the array: the first entry is Obsidian's confirmed missing-note line (spec 077 T0 probe, research F2: stdout, exit 0, default and inline mode); the remaining entries are the original unconfirmed placeholders, kept so nothing they match today is reported differently (spec 077 FR-007). Do not touch `EDITOR_CONFLICT_PATTERNS`. Makes T003 pass. Depends on T005 (same file).
- [ ] T007 [US1] In `src/tools/prepend/handler.ts` `executePrepend`, replace the pre-call stat block (research D1):
  - On `ENOENT`, `throw noteNotFound(relPath, vaultDisplayName, e)`; any other error is still rethrown unchanged. Since the ENOENT branch no longer falls through, `preCallSize` can be assigned directly from the `stat` (no `= 0` default).
  - Replace the comment above it: the pre-call stat brackets the byte-count delta and is the missing-note check (spec 077 FR-001a), mirroring append_note's pre-write read; Obsidian is not called for a note that is not there.
  - In the spec 076 pre-read comment, change "ENOENT leaves it null too (upstream's NOTE_NOT_FOUND stays the contract surface)" to say an ENOENT here means the note was removed after the stat, so it is left null and Obsidian's report is classified as NOT_FOUND (spec 077 FR-001b). The code of that block does not change.
  - Update the file header's intent line: replace "stat + read (pre; default mode only)" with "stat (pre; ENOENT → NOTE_NOT_FOUND before the call, spec 077) + read (pre; default mode only)", and "NOTE_NOT_FOUND (FR-016) + EXTERNAL_EDITOR_CONFLICT (FR-022) re-classification on upstream stdout/stderr inspection" with "NOTE_NOT_FOUND (FR-016; Obsidian's T0-confirmed `Error: File "<path>" not found.` line, spec 077) + EXTERNAL_EDITOR_CONFLICT (FR-022) re-classification on upstream stdout/stderr inspection".
  - Makes T002 and T004 pass. Depends on T006 (same file).
- [ ] T008 [US1] Run `npm test -- src/tools/prepend`. T002–T004 pass; every other prepend test (`handler.test.ts`, `handler.empty-body.test.ts`, `handler.bi047.test.ts`, `handler.file-type.test.ts`, `index.test.ts`, `schema.test.ts`, `empty-body.test.ts`) passes unchanged. Depends on T007.

**Checkpoint**: MVP. A missing note reports the documented classification from both detection points.

---

## Phase 4: User Story 2 — Same report as add-to-end (Priority: P2)

**Goal**: for the same missing path in the same named vault, `prepend` and `append_note` fail with equal `code`, `details` and `message` (spec FR-004, SC-002; contract E6).

**Independent Test**: one test drives both handlers against the same missing path and compares the three fields.

- [ ] T009 [US2] In `src/tools/prepend/handler.not-found.test.ts`, add `describe("parity with append_note (spec 077 FR-004)")`, following the mirror pattern already in `handler.empty-body.test.ts` (test-only import of `executeAppendNote` from `../append_note/handler.js`; production modules gain no tool→tool edge, Principle I). For path `"Sandbox/missing.md"` and for `"Sandbox/nofolder/missing.md"`:
  - run `executePrepend` as in T002 E1 and capture the rejection;
  - run `executeAppendNote` with the same `{ target_mode: "specific", vault: "TestVault", path, content: "x", inline: false }`, the same `fakeRegistry`, a `makeQueuedSpawn([])`, and an inline append_note `ExecuteFs` literal whose `realpath` resolves `VAULT_ROOT` and throws ENOENT otherwise, whose `readFile` throws ENOENT, and whose `writeFile` / `rename` / `unlink` are no-ops;
  - assert both are `UpstreamError`, `prependErr.code === appendErr.code`, `expect(prependErr.details).toEqual(appendErr.details)` and `prependErr.message === appendErr.message`.
  - Depends on T007.

**Checkpoint**: parity verified.

---

## Phase 5: User Story 3 — Location and vault echoed, message specific (Priority: P2)

**Goal**: the failure's `details` holds exactly the supplied path and the vault name, and the message names the path, from either detection point (spec FR-002, FR-003, SC-005).

**Independent Test**: T002 E1 and T003 E4 already assert `details` with `toEqual` (no extra keys) and the exact message. This phase adds the `file`-addressed case.

- [ ] T010 [US3] In `src/tools/prepend/handler.not-found.test.ts`, add a case for a `file`-addressed note that resolves but whose file is missing (input `file: "ghost"`, resolver reply `FILE_TSV_OK("Sandbox/ghost.md")` from `./_handler-fixtures.js`, then `stat` throwing ENOENT): expect `details` toEqual `{ code: "NOTE_NOT_FOUND", path: "Sandbox/ghost.md", vault: "TestVault" }` and the message `Note "Sandbox/ghost.md" not found in vault.`, with only the resolver spawned. Assert in every not-found case of this file that the message does not contain `prepend-cli` or `Error: File` (no raw command output, FR-003). Depends on T007.

**Checkpoint**: echoed fields and message verified.

---

## Phase 6: User Story 4 — Other failures unchanged (Priority: P3)

**Goal**: failures that are not a missing note keep their code, `details` and message; upstream lines that mention "not found" about something else are not `NOTE_NOT_FOUND` (spec FR-007; contract E7, E8; data-model R3, R4).

**Independent Test**: stubbed upstream replies for folder, vault and cold-start "not found" lines produce the generic `details.stage: "prepend-cli"` failure.

- [ ] T011 [US4] In `src/tools/prepend/handler.not-found.test.ts`, add `describe("other failures unchanged (spec 077 FR-007)")` with a succeeding `stat` (`fakeFs({ sizes: [3, 3] })`). For each upstream reply below, expect `code: "CLI_REPORTED_ERROR"`, `details.stage: "prepend-cli"`, no `details.code`, and the original `details.stdout`:
  - `{ stdout: 'Error: Folder "Sandbox/x" not found.\n', exitCode: 0 }`;
  - `{ stdout: "Vault not found.\n", exitCode: 0 }` (`invokeCli` in `src/cli-adapter/cli-adapter.ts` reclassifies this exit-0 line as `CLI_REPORTED_ERROR` with `details.stdout`, so it reaches `classifyUpstreamFailure` and must take the generic `prepend-cli` path);
  - a cold-start line on both attempts: `makeQueuedSpawn([coldStartResponse("prepend"), coldStartResponse("prepend")])` (`coldStartResponse` from `../_handler-test-fixtures.js`; the dispatch layer retries once, ADR-029); assert only that the failure is not `NOTE_NOT_FOUND`.
  - Depends on T006.
- [ ] T012 [US4] Run `npm test`. All suites pass; in particular the existing placeholder-wording tests in `handler.test.ts` ("upstream stderr 'note not found' …", "upstream stderr 'no such file' …", the active-mode NOTE_NOT_FOUND case), the EACCES pre-stat test, the editor-conflict tests, `handler.bi047.test.ts`, `handler.file-type.test.ts`, `handler.empty-body.test.ts` and `src/tools/_surface.test.ts` pass unchanged (spec SC-004). Depends on T008–T011.

**Checkpoint**: no regression.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T013 [P] In `docs/tools/prepend.md` → Error states, rewrite the `CLI_REPORTED_ERROR` / `details.code: NOTE_NOT_FOUND` row's "What triggered it" cell: the target note does not exist. Reported before Obsidian is called when no file is at the path; or from Obsidian's own report when the file exists only under a different letter case (Obsidian's vault paths are case-sensitive) or was removed just before the call. `details` carries `path` (the vault-relative path) and `vault`; the message is `Note "<path>" not found in vault.`, the same as `append_note`. Nothing is written. Keep the "What to do" cell. Also, in the **File-type check** paragraph, keep the sentence about `Boards/Plan.canvas` as is (still true). (spec FR-010)
- [ ] T014 [P] In `CHANGELOG.md` `[Unreleased]`, add a `Spec 077-fix-prepend-not-found.` line beside the other spec lines, and under `### Fixed` an entry: "`prepend` on a missing note now reports `CLI_REPORTED_ERROR` with `details.code: NOTE_NOT_FOUND`, `details.path`, `details.vault` and the message `Note "<path>" not found in vault.`, the same as `append_note` (spec 077). Previously it returned a generic upstream error with `details.stage: "prepend-cli"`. A note missing on disk is now reported before Obsidian is called." Follow the file's existing heading layout.
- [ ] T015 Run `npm run baseline:write` then `git diff --exit-code src/tools/_register-baseline.json`; expect no diff (contract §5). Run `npm run typecheck`, `npm run lint` and `npm run format:check` (format only the files this BI touched if needed). Depends on T012–T014.
- [ ] T016 Post-implement structural verification per CLAUDE.md (run `codegraph sync` first): `codegraph_explore "noteNotFound classifyUpstreamFailure executePrepend NOTE_NOT_FOUND_PATTERNS"` and confirm (1) `src/errors.ts` unchanged, no new code or error class; (2) no handler imports `createLogger` / `createQueue`, `server.ts` unchanged; (3) `noteNotFound` is module-private to `prepend/handler.ts`, `handler.ts` gained no import, no tool→tool production import; (4) `noteNotFound` is reachable from `executePrepend` (both call sites) → `createPrependTool` → `createServer`. Record the result in the PR description's Constitution Compliance section. Depends on T015.
- [ ] T017 Live check per [quickstart.md](quickstart.md) §3, after reading `.memory/test-execution-instructions.md`. **First confirm `TestVault-Obsidian-CLI-MCP` is the vault open in Obsidian; if it is not, stop and report rather than run any write** (research F2 probe-environment note). Run steps 1–5 against `Sandbox/077-<run>/`, quote every failure verbatim, and clean up the run folder. This run is the spec FR-009 confirmation in the authorised test vault (the plan-time probe ran against the open `My-Setup-Vault`, research F2): record step 4's `cause.details.stdout` (Obsidian's raw line, reached through the case mismatch) verbatim in the PR description to show the wording `Error: File "<path>" not found.` in `TestVault-Obsidian-CLI-MCP`. Step 1's pre-call check fires before Obsidian, so its `cause` is the fs error; for the plain missing-note line also run one direct `obsidian prepend vault=TestVault-Obsidian-CLI-MCP path=Sandbox/077-<run>/missing.md content=x` through `Obsidian.com` per the instructions, and quote its stdout. Depends on T015.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: empty.
- **US1 (Phase 3)**: after Setup. T002, T003 and T004 can be written in parallel (T002/T003 share a new file but are written together; T004 is a different file). T005 → T006 → T007 run in order (same file). T008 after T007.
- **US2 (Phase 4)**, **US3 (Phase 5)**: after T007; they add cases to the same test file, so run them one after the other.
- **US4 (Phase 6)**: T011 after T006; T012 after T008–T011.
- **Polish (Phase 7)**: T013 and T014 can run any time after T007, in parallel; T015 after T012–T014; T016 and T017 after T015.

### User Story Dependencies

- **US1 (P1)**: carries all production code. No dependency on other stories.
- **US2 (P2)**, **US3 (P2)**, **US4 (P3)**: test-only; depend on US1's implementation, independent of each other.

### Parallel Opportunities

- T002/T003 (new file) ‖ T004 (`handler.test.ts`).
- T013 (`docs/tools/prepend.md`) ‖ T014 (`CHANGELOG.md`) ‖ US2–US4 test tasks.

---

## Parallel Example: User Story 1

```text
Task: "T002/T003 Create src/tools/prepend/handler.not-found.test.ts (pre-call check + Obsidian's report)"
Task: "T004 Rewrite the pre-stat ENOENT test in src/tools/prepend/handler.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001.
2. T002–T004 (tests fail).
3. T005–T007 (tests pass), T008.
4. **Stop and validate**: a missing note reports `NOTE_NOT_FOUND` from both detection points.

### Incremental Delivery

US1 delivers the fix. US2–US4 add parity, field and regression coverage. Polish documents the behaviour and verifies the surface, structure and live behaviour. All of it ships in one PR.

---

## Notes

- **CodeGraph task-pair check (CLAUDE.md `/speckit-tasks` rule)**: production changes touch one source file (`src/tools/prepend/handler.ts`), so the pair rule is otherwise N/A. The one cross-module pair, the T009 parity test calling `executePrepend` and `executeAppendNote`, was checked with `codegraph_explore "executePrepend executeAppendNote"`: no structural path runs between the two handlers (they share only `resolveFsTarget`, which is read, not edited), and `handler.empty-body.test.ts` already imports `executeAppendNote` test-only, so no task-dependency note is needed.
- No edit to `src/tools/append_note/**`, `src/errors.ts`, `src/cli-adapter/**`, `src/tools/_file-target.ts`, `src/tools/_active-file.ts`, `src/tools/prepend/{schema,index,empty-body,_handler-fixtures}.ts` or `src/tools/_register-baseline.json` (plan Constraints).
- `.docs-as-code/` is updated later by `/speckit-docs-as-code <n>`, not in these tasks.
- Commit after each phase or logical group.
