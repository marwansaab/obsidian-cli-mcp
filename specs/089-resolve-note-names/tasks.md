---

description: "Task list for 089 Resolve note names"
---

# Tasks: Resolve note names

**Input**: Design documents from `specs/089-resolve-note-names/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/note-name-contract.md](contracts/note-name-contract.md), [quickstart.md](quickstart.md)

**Tests**: requested. Constitution Principle II and spec FR-012 require happy-path and failure tests for both editors in the same change. All rows N1–N9 are written before the handler switch, so the quickstart §1 red check can show that they bite.

**Organization**:

- Phase 2 writes both suites (blocking).
- One phase per user story in priority order: US1 (P1), the handler switch; US2 (P2), the failure rows going green with no extra code; US3 (P3), the help pages.
- Row IDs refer to the contract:
  - P1–P3: surface checks;
  - §E: the error contract;
  - N1–N9: the per-editor rows;
  - §H: the help-page text;
  - §C: the CHANGELOG text;
  - L1–L5: the live column.

**Scope**: `patch_heading` and `patch_block` only. These stay unedited:

- both `index.ts` files (descriptions) and both `schema.ts` files;
- `src/target-mode/target-mode.ts`;
- `src/tools/_register-baseline.json`;
- `src/errors.ts`;
- `src/server.ts`;
- `src/cli-adapter/**`;
- `src/tools/_active-file.ts`;
- every existing `*.test.ts` and every fixture module (research F5).

**Before any code edit**:

- load the `karpathy-guidelines` skill;
- read `.memory/refactor-decisions.md`. These items apply here:
  - §2: the byte-exact bar for unchanged behaviour on the `path` and active routes;
  - §5: no existing-test edits are approved. If any existing assertion fails, stop and raise it for owner review, and do not edit that test;
  - §9: reuse the shared `fileTsvResponse` / `makeQueuedSpawn` and keep fixtures vitest-free;
  - §27(a): the baseline must not move;
  - §29: pass deps whole;
  - §32: `_file-target.ts` is THE target resolver; keep the registry-before-TSV order, and add no per-handler `resolveLocator`;
  - §38: Obsidian's missing-note line is `Error: File "<path>" not found.`, so tests faking it use that real line.

**Before any live call**: read `.memory/test-execution-instructions.md`.

**Run vitest through PowerShell**, not the Bash tool.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US3 from spec.md

---

## Phase 1: Setup

**Purpose**: a known-green starting point.

- [X] T001 Before any edit, on branch `089-resolve-note-names`, run `npm run typecheck; if ($?) { npm run lint }; if ($?) { npm test }` in PowerShell.
  - Create `specs/089-resolve-note-names/post-implement.md`, headed `# Post-implement: 089 Resolve note names`.
  - Record the result under `## T001 baseline`.
  - A failure here is pre-existing: report it, and do not fix it in this feature.

---

## Phase 2: Foundational: tests first (blocks every story)

**Purpose**: write both new suites with rows N1–N9 (contract §T) against the unchanged handlers, and prove that they bite.

**Shared rules for T002 and T003**:

- Header: `// Original — no upstream. <tool> note-name locator tests (spec 089, BI-0171): a \`file\` name resolves through the shared \`obsidian file\` lookup before any fs access (rows N1–N9 of contracts/note-name-contract.md).`
- Use `makeQueuedSpawn`, `fileTsvResponse` and `unwrapEvalCode` from `../_handler-test-fixtures.js`. Use `fakeFs`, `fakeRegistry`, `deps`, `EVAL_OK` and `VAULT_ROOT` from the tool's own `./_handler-fixtures.js`.
- Import `__resetInFlightRegistryForTests` from `../../cli-adapter/_dispatch.js` and add `beforeEach` / `afterEach(() => __resetInFlightRegistryForTests())`, the way the sibling `handler.test.ts` does (lines 9, 14–15).
- Registry: `fakeRegistry({ TestVault: VAULT_ROOT })`.
- Provision exactly the spawn responses each row consumes (`makeQueuedSpawn` throws on overflow).
- Build absolute paths with `join(VAULT_ROOT, ...)` from `node:path`, so the rows hold on Linux and Windows CI.
- Do not edit any fixture module.

- [X] T002 [P] Create `src/tools/patch_heading/handler.note-name.test.ts` calling `executePatchHeading`. Use the default `SAMPLE_NOTE` and `heading_path: "Daily#Tasks#TODO"`, `mode: "append"`, `content: "- Call dentist\n"` unless a row says otherwise.
  - **N1**: `file: "Meeting Notes"`, spawns `[fileTsvResponse("Projects/Deep/Meeting Notes.md"), EVAL_OK]`.
    - `fs.reads[0]` and `fs.renames[0][1]` equal `join(VAULT_ROOT, "Projects/Deep/Meeting Notes.md")`.
    - `result.path === "Projects/Deep/Meeting Notes.md"`, and the written text contains `- Call dentist` under `### TODO`.
    - `recorded.length === 2`. `recorded[0].argv` includes `file` (the command), `vault=TestVault` and `file=Meeting Notes`.
  - **N2**: same setup, but with `fakeFs({}, { readFile })`. The `readFile` override records `getCount()` (from `makeQueuedSpawn`) the first time it is called, then returns the tool's sample note.
    - The recorded count is `1`: the `file` lookup ran before any fs read (FR-002).
    - `unwrapEvalCode` of the second spawn's `code=` argument contains `Projects/Deep/Meeting Notes.md`, and does not contain the bare `"Meeting Notes"` as the `getFileByPath` argument.
  - **N3**: two cases (`it.each`), each with spawns `[fileTsvResponse("Projects/Meeting Notes.md"), EVAL_OK]`:
    - `file: "Projects/Meeting Notes.md"`;
    - `file: "Projects/Meeting Notes"` (folder, no `.md`).

    In each case the `file` spawn's argv carries the given value byte-for-byte (`file=Projects/Meeting Notes.md` / `file=Projects/Meeting Notes`), and `result.path === "Projects/Meeting Notes.md"`.
  - **N4**: `file: "Missing"`, spawns `[{ stdout: 'Error: File "Missing" not found.\n', exitCode: 0 }]`.
    - Rejects `UpstreamError` with code `CLI_REPORTED_ERROR`, `details.message === 'Error: File "Missing" not found.'` and `details.code === undefined`.
    - `fs.reads`, `fs.writes` and `fs.renames` are all empty. `recorded.length === 1`. The code is not `FS_WRITE_FAILED`.
  - **N5**: `file: "Meeting Notes"`, spawns `[{ stdout: "not a TSV line\n", exitCode: 0 }]`. Rejects `CLI_REPORTED_ERROR` with `details.stage === "file-tsv-parse"`, and `fs.reads` is empty.
  - **N6**: `vault: "Nope"`, `file: "Meeting Notes"`, spawns `[]`. Rejects with the registry's `VALIDATION_ERROR`, the code `fakeRegistry` throws. `recorded.length === 0` and `fs.reads` is empty.
  - **N7**: `file: "x"`, spawns `[fileTsvResponse("Projects/x.md")]`, and `fakeFs({ content: "# Other\n\nbody\n" })`. Rejects `CLI_REPORTED_ERROR` with `details.code === "HEADING_NOT_FOUND"` and `details.path === "Projects/x.md"`, and `fs.writes` is empty.
  - **N8**: `path: "n.md"`, spawns `[EVAL_OK]`. `recorded.length === 1`, no argv entry starts with `file=`, and `result.path === "n.md"`.
  - **N9** (vault-root boundary, US1 AS3): `file: "Daily"`, spawns `[fileTsvResponse("Daily.md"), EVAL_OK]`. `fs.reads[0]` and `fs.renames[0][1]` equal `join(VAULT_ROOT, "Daily.md")`, and `result.path === "Daily.md"`. The unchanged handler reads `join(VAULT_ROOT, "Daily")`, so this row must fail the T004 red check.
- [X] T003 [P] Create `src/tools/patch_block/handler.note-name.test.ts` calling `executePatchBlock`. Use `fakeFs({ content: "intro\n\nA simple paragraph. ^foo\n\nclosing\n" })`, `block_id: "foo"`, `content: "Replaced text."` unless a row says otherwise. It has the same rows N1–N9 as T002, with these differences:
  - In N1, the written text contains `Replaced text. ^foo`.
  - In N2, the `readFile` override returns the T003 default content (`"intro\n\nA simple paragraph. ^foo\n\nclosing\n"`).
  - N7 uses `fakeFs({ content: "no markers here\n" })` and expects `details.code === "BLOCK_NOT_FOUND"` with `details.path === "Projects/x.md"`.
  - N4's code must not be `CLI_REPORTED_ERROR` with `details.code === "NOTE_NOT_FOUND"`: assert `details.code === undefined`.
- [X] T004 Red check (quickstart §1). Run `npx vitest run src/tools/patch_heading/handler.note-name.test.ts src/tools/patch_block/handler.note-name.test.ts` against the unchanged handlers.
  - Expected: N1–N5 and N9 fail in both suites. N6–N8 may pass.
  - Record the pass/fail list per row in `post-implement.md` under `## T004 red check`.
  - If any of N1–N5 or N9 passes, the row does not bite: fix the row (not the handler) before going on.

**Checkpoint**: both suites exist and the fix-proving rows are red.

---

## Phase 3: User Story 1: edit a section by note name (Priority: P1) 🎯 MVP

**Goal**: a `file` name resolves the way the reading tools resolve it, and the edit lands on that note (FR-001, FR-002, FR-005, FR-007, FR-008, FR-011).

**Independent test**: rows N1–N3, N8 and N9 pass in both suites, and every existing suite passes unedited.

- [X] T005 [P] [US1] In `src/tools/patch_heading/handler.ts`:
  - Delete `resolveLocator` (lines 58–68).
  - Replace its call in `executePatchHeading` with `await resolveFsTarget(input, deps, "patch_heading")`.
  - Add `import { resolveFsTarget } from "../_file-target.js";` in import order.
  - Drop `resolveActiveLocatorWithVault` from the `../_active-file.js` import, keeping `assertCanonicalPath`.
  - Header: replace "specific-mode vault-registry resolve OR active-mode focused-file eval" with "locator via the shared resolveFsTarget (specific mode: vault-registry resolve, then a `file` name through the `obsidian file` lookup — spec 089; active mode: focused-file eval)".
  - Change nothing else in the file. That includes the ENOENT `FS_WRITE_FAILED` block (research F9, out of scope).
- [X] T006 [P] [US1] In `src/tools/patch_block/handler.ts`, make the same edit as T005, with `"patch_block"`:
  - Delete `resolveLocator` (lines 57–67) and switch the call site.
  - Add the `resolveFsTarget` import and drop `resolveActiveLocatorWithVault`.
  - Update the header the same way.
  - Leave the `noteNotFound` ENOENT mapping untouched.
- [X] T007 [US1] Run `npm run typecheck`, then `npx vitest run src/tools/patch_heading src/tools/patch_block src/tools/_surface.test.ts src/tools/_register.test.ts src/tools/_plugin-noise.test.ts`.
  - N1–N3, N8 and N9 must pass in both suites.
  - Every existing test must pass unedited.
  - If an existing assertion fails, stop and raise it for owner review (refactor-decisions §5), and do not edit the test.

**Checkpoint**: name-based edits land on the resolved note, and path and active mode are unchanged.

---

## Phase 4: User Story 2: clear failure when the name does not identify one note (Priority: P2)

**Goal**: an unmatched name fails with the reading tools' not-found error, before any fs access, and a shared name picks the note `read` picks (FR-003, FR-004, FR-006; Clarification Q2).

**Independent test**: rows N4–N7 pass in both suites, with no code beyond T005 and T006.

- [X] T008 [US2] Run both `handler.note-name.test.ts` suites.
  - N4–N7 must pass with no further production change: the resolver's errors pass through unchanged (research D3).
  - If one fails, fix the handler switch, not the row. Do not add any mapping to `NOTE_NOT_FOUND` or any other code (Clarification Q2).
  - Record the result in `post-implement.md` under `## T008 failure rows`.
  - FR-004 (a shared name) is proven live in T014 (L5), not in unit tests, because the choice is Obsidian's (research F12).

**Checkpoint**: failure behaviour matches `read`, `append_note` and `prepend` for the same name.

---

## Phase 5: User Story 3: the published contract is true (Priority: P3)

**Goal**: both help pages describe the note-name locator and the not-found failure as they now behave (FR-009, FR-010).

**Independent test**: contract §H text present, P1–P3 diff empty, every help-page statement about `file` holds against L1–L5.

- [X] T009 [P] [US3] In `docs/tools/patch_heading.md`, apply contract §H items 1, 3 and 4 verbatim:
  - the `file` row (line 41);
  - the new error-roster row before `PATH_ESCAPES_VAULT`;
  - the output `path` row (line 201).

  Leave the `FS_WRITE_FAILED` ENOENT row and the `path` row unchanged.
- [X] T010 [P] [US3] In `docs/tools/patch_block.md`, apply contract §H items 1 and 3 verbatim: the `file` row (line 42), and the new error-roster row before `PATH_ESCAPES_VAULT`. Leave the output `path` row unchanged (§H item 5).
- [X] T011 [US3] Surface gate (quickstart §2). Run `npx vitest run src/tools/_register.test.ts`, then `git diff --exit-code main -- src/tools/_register-baseline.json src/tools/patch_heading/index.ts src/tools/patch_block/index.ts src/tools/patch_heading/schema.ts src/tools/patch_block/schema.ts src/errors.ts src/target-mode/target-mode.ts`.
  - Both must pass with no `npm run baseline:write`.
  - Also run `npx vitest run src/tools/help` so the docs-sync guard (`src/tools/help/docs-sync.test.ts`) sees both edited pages.

**Checkpoint**: the docs match the behaviour, and the published fingerprint is unmoved.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T012 [P] In `src/tools/_file-target.ts`, edit the header comment only: change "`resolveFsTarget` serves the direct-fs tools (append_note, prepend)" to "`resolveFsTarget` serves the direct-fs tools (append_note, prepend, patch_block, patch_heading — spec 089)". No code change.
- [X] T013 [P] In `CHANGELOG.md`, add `Spec 089-resolve-note-names (BI-0171).` after the `Spec 088-preserve-match-whitespace (BI-0170).` line in `[Unreleased]`. Add the contract §C `Fixed` entry verbatim at the top of the `[Unreleased]` `### Fixed` list.
- [X] T014 Required live check (quickstart §3, contract §L). Read `.memory/test-execution-instructions.md` first.
  - Run `npm run build`.
  - Seed `Sandbox/089-live/` and run L1–L5 through the built server against `TestVault-Obsidian-CLI-MCP`.
  - Confirm no stray file was created.
  - Remove the fixtures, then confirm the `Sandbox/` entry count matches the pre-run count and that `Welcome.md` is untouched.
  - Record cases attempted, passed and failed, with verbatim output, in `post-implement.md` under `## T014 live check`.
  - If the vault is left in an unexpected state, stop and report.
- [X] T015 Post-implement structural verification (plan §CodeGraph structural check). Run `codegraph sync`, then `codegraph_explore "executePatchHeading executePatchBlock resolveFsTarget"`. Confirm and record under `## T015 structural verification`:
  1. `src/errors.ts` is unchanged, and neither handler adds a `new UpstreamError`.
  2. No handler imports `createLogger` or `createQueue`, and `server.ts` is unchanged.
  3. Both handlers import `resolveFsTarget` from `../_file-target.js` and no longer import `resolveActiveLocatorWithVault`; no `resolveLocator` symbol remains; `_file-target.ts` gains no import.
  4. `resolveFsTarget` has production callers in `append_note`, `prepend`, `patch_heading` and `patch_block`, and no new production export exists.
- [X] T016 Full gate: `npm run typecheck; if ($?) { npm run lint }; if ($?) { npm run format:check }; if ($?) { npm test }` in PowerShell. Everything must pass. Run `npx prettier --write` only on files this feature touched, if `format:check` names them. Record the result under `## T016 full gate`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)** → **Foundational (T002–T004)** → **US1 (T005–T007)** → **US2 (T008)** → **US3 (T009–T011)** → **Polish (T012–T016)**.
- US2 has no code of its own. It depends on US1's switch, because its rows run through `resolveFsTarget`.
- US3's docs (T009, T010) do not depend on code and could run after T004. T011 needs T005 and T006 done, so the surface gate checks the final code.
- T014 needs T005, T006 and the build. T015 needs every source edit (T005, T006, T012). T016 runs last.

### Structural dependency notes (CodeGraph, per CLAUDE.md `/speckit-tasks` rule)

- `codegraph_explore "executePatchHeading executePatchBlock resolveFsTarget resolveFileByTsv fileTsvResponse"` shows the flow `resolveFsTarget → specificRelPath → resolveFileByTsv` (`_file-target.ts:66 → :40 → _active-file.ts:242`), which then calls `invokeCli` with the caller's deps.
- There is no call path between the two handlers. T005 and T006 touch disjoint files and share only the unedited `resolveFsTarget`, so they are truly parallel.
- The new spawn reaches the single-flight queue through `invokeCli`. That is why every `file` row in T002 and T003 must queue the TSV response first, ahead of `EVAL_OK`.
- `resolveFsTarget`'s other production callers (`append_note`, `prepend`) and `resolveFileByTsv`'s (`find_and_replace`) are not edited, so they need no task. The T007 and T016 runs cover them unchanged.

### Parallel Opportunities

- T002 ∥ T003 (two new files).
- T005 ∥ T006 (two handlers).
- T009 ∥ T010 (two help pages).
- T012 ∥ T013 (header comment, changelog).

---

## Parallel Example: User Story 1

```text
Task: "T005 [US1] switch patch_heading/handler.ts to resolveFsTarget"
Task: "T006 [US1] switch patch_block/handler.ts to resolveFsTarget"
then
Task: "T007 [US1] typecheck + patch suites + surface/register/plugin-noise suites"
```

---

## Implementation Strategy

### MVP first (User Story 1)

1. T001 baseline.
2. T002–T004: both suites, red.
3. T005–T007: the switch. Name-based edits land on the resolved note. This is the MVP: the defect in BI-0171 is fixed.

### Incremental delivery

4. T008 (US2): the failure rows go green on the same switch.
5. T009–T011 (US3): the help pages are true, and the surface is unmoved.
6. T012–T016: header, changelog, live check, structural verification, full gate.

---

## Notes

- **Existing-test edits**: none approved and none expected (research F5). Stop on any failing existing assertion.
- **Two source modules**: the task list crosses `patch_heading/` and `patch_block/`, so the CodeGraph pair check above applies. It found no hidden dependency.
- **Out of scope** (research follow-ups):
  - patch_heading's `NOTE_NOT_FOUND` vs `FS_WRITE_FAILED` drift (F9);
  - the `[[`/`]]` schema rule;
  - the editors' missing file-type check.
