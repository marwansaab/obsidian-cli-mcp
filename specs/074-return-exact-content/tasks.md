---

description: "Task list for 074-return-exact-content"
---

# Tasks: Return Exact Content

**Input**: Design documents from `specs/074-return-exact-content/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/read-exact-content-contract.md](contracts/read-exact-content-contract.md), [quickstart.md](quickstart.md)

**Tests**: tests are required. Constitution Principle II requires them for every modified tool, and spec FR-010 names the minimum cases. Test tasks come before their implementation task within each story.

**Organization**: tasks are grouped by user story (spec.md priorities). Before writing code, load the `karpathy-guidelines` skill, then make surgical changes that match the surrounding style.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story the task serves (US1 to US5)

## Path Conventions

Single project: `src/`, with co-located `*.test.ts`. Docs are in `docs/tools/`.

---

## Phase 1: Setup

**Purpose**: confirm a green starting point.

- [X] T001 Run `npm run typecheck`, `npm run lint` and `npm test` on branch `074-return-exact-content` before any edit, and note any pre-existing failure, so later failures can be attributed (repository root).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the plumbing every story needs (vault root, registry, filesystem seam). There is no behaviour change yet: after this phase, `read` still returns stdout unchanged.

**⚠️ CRITICAL**: no user-story work can begin until this phase is complete.

- [X] T002 In `src/tools/_file-target.ts`:
  - add an optional `vaultRoot?: string` to `FileTarget`, documented as "the vault's absolute folder, set in active mode only, from the focused-file eval's `base`";
  - in `resolveFileTarget`'s active branch, take `vaultRoot` from `resolveActiveFocusedFile` and return it;
  - leave the specific branch unchanged;
  - update the file's header intent line to mention it.

  `rename`, `move` and `outline` must compile and their tests stay green with no edit.
- [X] T003 In `src/tools/read/handler.ts`, extend `ExecuteDeps` with `vaultRegistry: VaultRegistry` (type import from `../../vault-registry/registry.js`) and `fs?: ReadFs`. Then:
  - export `interface ReadFs { readFile: (p: string) => Promise<Buffer> }`;
  - add `DEFAULT_FS` backed by `node:fs/promises` `readFile`;
  - do not change behaviour yet;
  - update the header intent line (research D1 to D4).

  Depends on T002.
- [X] T004 Update the existing deps builders so they compile against the new required `vaultRegistry`, using `stubVaultRegistry("MyVault", <root>)` from `../_handler-test-fixtures.js` and an `fs` stub whose `readFile` returns the bytes the test's stdout implies:
  - `deps()` and every inline deps object in `src/tools/read/handler.test.ts`;
  - every `createReadTool({...})` call in `src/tools/read/index.test.ts`.

  Existing assertions stay as they are. Depends on T003.
- [X] T005 In `src/server.ts` (`createServer`, a kernel node), change `createReadTool({ logger, queue })` to `createReadTool({ logger, queue, vaultRegistry })`. This must be the only change to `server.ts` (plan, Kernel-node attention). Depends on T003.

**Checkpoint**: `npm run typecheck` and `npm test` are green, and `read` behaviour is unchanged.

---

## Phase 3: User Story 1 — Read a note without a trailing line break exactly (Priority: P1) 🎯 MVP

**Goal**: a note that does not end with a line feed reads back with nothing added (FR-001, FR-002, FR-005, FR-008).

**Independent test**: a note on disk holding `first`, where the CLI stdout is `first\n`, gives `content === "first"`.

### Tests for User Story 1 ⚠️ (write first and confirm they fail)

- [X] T006 [US1] In `src/tools/read/handler.test.ts`, add a table-driven test over these contract §2 rows (disk bytes → stub stdout → expected `content`):
  - `first` → `first\n` → `first`;
  - `a\r\nb` → `a\r\nb\n` → `a\r\nb`;
  - `a\r` → `a\r\n` → `a\r`;
  - `# T\n\nlast line` → `# T\n\nlast line\n` → `# T\n\nlast line`.
- [X] T007 [US1] In `src/tools/read/handler.test.ts`, add the locator and ordering tests:
  - **`path` mode**: `readFile` is called with `join(<registry root>, "Templates/Recipe.md")`.
  - **`file` mode**: the TSV-resolved path is read, using `fileTsvResponse`.
  - **Active mode**: `join(<eval base>, "Daily/Today.md")` is read, with the root coming from `focusedFileResponse`'s base, and the registry is never called.
  - **Unknown vault**: in specific mode, a CLI failure (`CLI_REPORTED_ERROR` / `CLI_NON_ZERO_EXIT`) surfaces unchanged, with neither `resolveVaultPath` nor `readFile` called.
  - **Disk-read failure**: `readFile` rejecting with an `ENOENT` errno gives `UpstreamError` `FS_WRITE_FAILED`, with `details` `{ reason: "read", errno: "ENOENT", syscall, path: <relPath> }`, `cause` set, and no fallback content. This is the one new failure spec FR-008 and SC-005 allow.

### Implementation for User Story 1

- [X] T008 [US1] In `src/tools/read/handler.ts`, after the unchanged `invokeCli` call:
  - resolve the root: `target.vaultRoot ?? await deps.vaultRegistry.resolveVaultPath(target.vault!)`;
  - read `join(root, target.relPath)` through `deps.fs ?? DEFAULT_FS`;
  - wrap a read failure as `FS_WRITE_FAILED` with `details: { reason: "read", errno: getErrno(e) ?? "UNKNOWN", syscall?, path: target.relPath }` and the message `read: filesystem read failed: <errno> for "<relPath>"` (`getErrno` from `../_fs-errors.js`);
  - apply the line-feed half of the rule: if `stdout` ends with `"\n"` and the last byte is not `0x0A`, drop that one `"\n"` (data-model rule; R5 ordering).

  A registry failure propagates unchanged. Makes T006 and T007 pass. Depends on T006 and T007.

**Checkpoint**: US1 tests green. `read` no longer adds a line break.

---

## Phase 4: User Story 2 — Keep a real trailing line break (Priority: P1)

**Goal**: real final line breaks, LF or CRLF, single or repeated, come back exactly (FR-003).

**Independent test**: a note on disk holding `first\n`, where the CLI stdout is `first\n`, gives `first\n`.

### Tests for User Story 2 ⚠️

- [X] T009 [US2] In `src/tools/read/handler.test.ts`, extend the T006 table with these rows (disk bytes → stub stdout → expected `content`):
  - `first\n` → `first\n` → `first\n`;
  - `a\r\nb\r\n` → `a\r\nb\r\n` → `a\r\nb\r\n`;
  - `a\n\n` → `a\n\n` → `a\n\n`;
  - `\n` → `\n` → `\n`;
  - mixed `a\r\nb\nc\n` → unchanged.

### Implementation for User Story 2

- [X] T010 [US2] Confirm that the T008 rule in `src/tools/read/handler.ts` passes T009 with no further change. If a row fails, fix the rule and not the test. Depends on T008 and T009.

**Checkpoint**: US1 and US2 green together. No real line break is lost.

---

## Phase 5: User Story 3 — Empty note stays empty (Priority: P2)

**Goal**: an empty note reads as `""` and succeeds (FR-004).

**Independent test**: disk bytes empty and stdout `""` give `content === ""`.

- [X] T011 [US3] In `src/tools/read/handler.test.ts`, update the existing "US1 boundary empty stdout" test to give its `fs` stub empty bytes, and assert `{ content: "" }`. Depends on T008.

**Checkpoint**: the empty case is guarded.

---

## Phase 6: User Story 4 — Round trip with the writing capabilities (Priority: P2)

**Goal**: whatever a write tool leaves on disk reads back identically. That includes a leading byte-order mark, which the CLI drops (research F2, FR-001, FR-006, FR-007).

**Independent test**: disk bytes `EF BB BF 61`, where the CLI stdout is `a\n`, give `"﻿a"`.

### Tests for User Story 4 ⚠️

- [X] T012 [US4] In `src/tools/read/handler.test.ts`, extend the table with the byte-order-mark rows of contract §2 (disk bytes → stub stdout → expected `content`):
  - `EF BB BF 61` → `a\n` → `﻿a`;
  - `EF BB BF 61 0A` → `a\n` → `﻿a\n`;
  - `EF BB BF` → `""` → `﻿`;
  - `EF BB BF EF BB BF 61` → `﻿a\n` → `﻿﻿a`;
  - `61 EF BB BF 62` → `a﻿b\n` → `a﻿b`.
- [X] T013 [US4] In `src/tools/read/handler.test.ts`, add one canvas case (`file: "Plan.canvas"`, disk `{"nodes":[]}` with no trailing line feed, stdout with an added `\n`) and one base case (`path: "B.base"`), each returning the disk text exactly (FR-006).

### Implementation for User Story 4

- [X] T014 [US4] In `src/tools/read/handler.ts`, add the byte-order-mark half of the rule: when the disk bytes start with `EF BB BF`, prepend `"﻿"` to the corrected stdout. Keep R1: the result is built from stdout only. Makes T012 and T013 pass. Depends on T008, T012 and T013.

**Checkpoint**: every contract §2 row passes.

---

## Phase 7: User Story 5 — Documentation states the exact contract (Priority: P3)

**Goal**: the published description and the reference docs describe exact content, with no added-line-break caveat and no false "no BOM strip" claim (FR-009, SC-004).

**Independent test**: grepping `docs/tools/read.md` and `READ_DESCRIPTION` finds no "synthetic", "may append" or "no BOM strip", and does find "exact".

- [X] T015 [US5] In `src/tools/read/index.ts`, rewrite the second sentence of `READ_DESCRIPTION` to state the exact contract per contract §4: "Returns the file's exact text as { content }: nothing added or removed; line breaks and any byte-order mark are kept." Leave the rest (active mode, `describeSupport`, the attachment rejection, `open_file`) unchanged. Update the header intent line if it names stdout.
- [X] T016 [US5] In `src/tools/read/index.test.ts`, assert that the description contains "exact text" and no longer contains "<stdout>". Run `src/tools/_file-type-support.test.ts` to confirm that its supported-types sentence assertion still passes. Depends on T015.
- [X] T017 [P] [US5] In `docs/tools/read.md`:
  - **Overview line 5**: say "exact text" and drop "from the CLI's stdout".
  - **Line 9**: replace the "Trailing-newline caveat" paragraph with an "Exact content" paragraph: nothing added or removed; real final line breaks (LF, CRLF, repeated) kept; a missing final line break stays missing; a leading byte-order mark kept; read back after a write to verify it.
  - **Output row (line 95)**: rewrite it the same way.
  - **Errors table**: add a row for `FS_WRITE_FAILED` (`details.reason: "read"`) per contract §3. The row states that `read` reuses the project's existing filesystem-failure code for a failed read, with the same `reason: "read"` shape as `find_and_replace`, and that nothing was written.
- [X] T018 [P] [US5] In `docs/tools/index.md`, change the `read` line (line 29) from "Read the raw text" to "Read the exact text".
- [X] T019 [US5] Run `npm run baseline:write`, then `git diff src/tools/_register-baseline.json`. Confirm that only `read`'s description fingerprint changed (contract §5, quickstart §2). Depends on T015.

**Checkpoint**: docs and the published surface match the behaviour.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T020 [P] In `CHANGELOG.md`, add under `[Unreleased]` → **Fixed**:

  > `read` now returns a file's exact text. It no longer adds a final line break to a file that does not end with one, and it keeps a leading byte-order mark that the Obsidian CLI drops. A failed confirmation read reports `FS_WRITE_FAILED` with `reason: "read"`.

  Follow the file's existing entry style.
- [X] T021 Run `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm test` (quickstart §1), and fix any failure in the files this feature touched. Depends on T001 to T020.
- [X] T022 Post-implement structural verification (CLAUDE.md, plan "Post-implement structural verification"): run `codegraph sync`, then `codegraph_explore "executeReadNote resolveFileTarget FileTarget createServer createReadTool"`. Confirm all four checks:
  - no new error code, and `src/errors.ts` unchanged;
  - `server.ts` differs only by the one argument;
  - `read/handler.ts` imports run downward only;
  - the new code is reachable from `createServer`.

  Record the outcome in the PR description's Constitution Compliance section. Depends on T021.
- [X] T023 Live end-to-end check, quickstart §3. Read `.memory/test-execution-instructions.md` first. Then `npm run build`, seed `Sandbox/t074/` in `TestVault-Obsidian-CLI-MCP` with the contract §2 byte fixtures, and call `read` through the built server for each. Check:
  - one `file` call and one active-mode call;
  - the round trip with every note-writing tool (quickstart §3 step 5: `write_note`, `append_note`, `prepend`, `patch_heading`, `patch_block`, `set_property`, `find_and_replace` single-note commit), with an immediate `read` after each write compared with the disk bytes (FR-007, SC-003, research D7). The writing tools only produce the fixtures; none of them is changed.

  Compare against the disk bytes, remove `Sandbox/t074/`, confirm `Welcome.md` is untouched, and report the results verbatim. Depends on T021.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)**: none.
- **Foundational (T002 to T005)**: T002 → T003 → T004 and T005. Blocks every story.
- **US1 (T006 to T008)**: after Foundational. T008 holds the shared correction and error path that US2, US3 and US4 build on.
- **US2 (T009, T010)**, **US3 (T011)** and **US4 (T012 to T014)**: after T008. They are independent of each other, but all edit `read/handler.test.ts`, so run them one after another.
- **US5 (T015 to T019)**: independent of US2 to US4. It can start after Foundational. T019 needs T015.
- **Polish (T020 to T023)**: T020 any time; T021 after everything; T022 and T023 after T021.

### Structural dependencies (CodeGraph, tasks phase)

- `executeReadNote` → `resolveFileTarget`: a direct call (`src/tools/read/handler.ts:27`). T008 reads `FileTarget.vaultRoot`, so T002 must land first (already ordered T002 → T003 → T008). `resolveFileTarget`'s other callers (`rename`, `move` and `outline` handlers) are unaffected by an optional field; T021's full test run covers them.
- `createServer` → `createReadTool`: a direct call (`src/server.ts:134`). `RegisterDeps = BootDeps<ExecuteDeps>`, so T005 compiles only after T003 adds `vaultRegistry` to `ExecuteDeps` (ordered T003 → T005). `createServer` is reached by `_mcp-client-fixtures.ts` `serveOne`, which `_register.test.ts`, `_register.output.test.ts` and `_surface.test.ts` use, so T021 exercises the real wiring.

### Within each story

Tests first, and confirm they fail; then the implementation; then the checkpoint.

### Parallel opportunities

- T017, T018 and T020 are independent files and can run in parallel with each other and with any handler work.
- T015 and T016 can proceed alongside Phases 3 to 6 (different files).

## Parallel Example: User Story 5 alongside the handler stories

```text
Agent A: T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014   (read/handler.ts + handler.test.ts)
Agent B: T015 → T016 → T019                                             (read/index.ts + index.test.ts + baseline)
Agent C: T017, T018, T020                                               (docs/tools/read.md, docs/tools/index.md, CHANGELOG.md)
```

## Implementation Strategy

### MVP first (User Story 1)

1. Phase 1 and Phase 2 (plumbing, no behaviour change).
2. Phase 3 (US1): the added line break is gone, and the error path is in place.
3. Stop and validate: the T006 and T007 tests are green.

### Incremental delivery

1. Add US2: the guard against losing real line breaks.
2. Add US3: the empty-note guard.
3. Add US4: byte-order-mark restore, plus canvas and base coverage. Every contract §2 row now holds.
4. Add US5: description, docs and baseline.
5. Polish: changelog, full gate, structural verification and the live check.

## Notes

- **CodeGraph tasks rule**: the list crosses four source modules (`read/handler.ts`, `read/index.ts`, `_file-target.ts`, `server.ts`). Both pairs were queried, and the structural dependencies are recorded above. No path exists that the task graph does not already reflect.
- **Kernel node**: `createServer` changes by one injection argument only (T005).
- **Do not edit** `src/cli-adapter/**`, `src/errors.ts`, `src/vault-registry/**`, `src/tools/_register.ts`, `src/tools/_active-file.ts` or `src/tools/_fs-errors.ts` (plan, Constraints).
- `.docs-as-code/` is updated later by `/speckit-docs-as-code <n>` after review, not in this task list (CLAUDE.md, PR lifecycle). SC-004's "zero references" check extends to those pages in that pass: grep `.docs-as-code/` for "trailing", "synthetic" and "BOM" against `read`, and correct any caveat it still carries.
