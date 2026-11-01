---
description: "Task list for 082-fix-active-file-messaging"
---

# Tasks: Fix active-file messaging

**Input**: Design documents from `specs/082-fix-active-file-messaging/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/get_active_file-messaging-contract.md](contracts/get_active_file-messaging-contract.md), [quickstart.md](quickstart.md)

**Tests**: required. Constitution Principle II makes co-located happy-path and failure/boundary tests mandatory in the same change that modifies a tool, and plan D5 names them. Write each story's tests first and confirm they fail before the implementation task.

**Organization**: tasks are grouped by user story, so each story can be implemented and tested on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task).
- **[Story]**: the user story the task belongs to (US1, US2).
- Paths are repository-relative. This is a single project (`src/`, co-located `*.test.ts`).

Before any code task, load the `karpathy-guidelines` skill and read `.memory/refactor-decisions.md`. Its standing rules apply: item 2 (byte-exact behaviour preservation), item 10 (no per-tool description loops), item 11 (target-mode test battery layout) and item 27(a) (the fingerprint baseline is the deliberate-change gate). Run vitest through PowerShell, not the Bash tool.

---

## Phase 1: Setup

**Purpose**: confirm the starting state, so the later gates have a baseline.

- [X] T001 Run `npx vitest run src/target-mode src/tools/get_active_file src/tools/files src/tools/paths` (PowerShell) and confirm it is green at HEAD. Confirm with `git diff --stat src/tools/_register-baseline.json` that the baseline is clean.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the shared refinement must accept a tool-specific locator message before US1 can pass its message in. US2 does not depend on this phase.

- [X] T002 Add tests to the folder-scoped variant's `describe` block in `src/target-mode/target-mode.test.ts`:
  - **U4**: with no second argument, `{target_mode:"specific", vault:"V", file:"F"}` yields an issue on `["file"]` whose message is exactly `file is not allowed for folder-scoped tools`, and `{…, path:"x.md"}` yields `path is not allowed for folder-scoped tools`.
  - **U5**: called with a custom `locatorMessage` (for example `(k) => \`custom ${k}\``), the `file` and `path` issues carry `custom file` / `custom path` on the same paths. In the same call, `{target_mode:"specific"}` still yields `vault is required in specific mode`, and `{target_mode:"active", vault:"V"}` still yields `vault is not allowed in active mode`.

  Confirm that U5 fails, because the parameter does not exist yet.
- [X] T003 In `src/target-mode/target-mode.ts`, give `applyTargetModeRefinementForFolderScoped` an optional second parameter, `locatorMessage: (key: "file" | "path") => string`, whose default is a private, unexported function returning `` `${key} is not allowed for folder-scoped tools` ``.
  - Replace the two literal messages with `locatorMessage("file")` and `locatorMessage("path")`.
  - Change nothing else: issue order, paths, codes, the explicit-`undefined` handling and the vault rules stay byte-identical (research D1).
  - Add one sentence to the comment above the function saying that a caller may supply its own locator message.
  - Confirm T002 passes.

**Checkpoint**: the shared primitive accepts a message, and `files` and `paths` still call it with one argument.

---

## Phase 3: User Story 1 - Accurate rejection when a note is named (Priority: P1) 🎯 MVP

**Goal**: when `get_active_file` rejects a `file` or `path` locator, in either mode, it says the active file is the implicit target and no note may be named, never "folder-scoped". `files` and `paths` keep their messages.

**Independent Test**: contract rows A1–A9 and U1–U3 ([contract §1](contracts/get_active_file-messaging-contract.md)) pass in the schema and index tests.

### Tests for User Story 1

- [X] T004 [P] [US1] Extend `src/tools/get_active_file/schema.test.ts`, inside the existing `for (const target_mode of ["active", "specific"])` loop:
  - in the `rejects file` and `rejects path` tests, assert that the issue on the field has the exact message `file is not allowed: the active file is the implicit target, so no note may be named` (or `path …`), and that no issue message contains `folder-scoped` (A1, A2, A4, A5);
  - add a `rejects both file and path` test per mode that asserts both issues carry their exact messages (A3, A6).

  Outside the loop, add:
  - **A7**: `{target_mode:"specific", file:"Note"}` gives the `file` message plus `vault is required in specific mode`;
  - **A8**: `{target_mode:"active", vault:"V", path:"x.md"}` gives the `path` message plus `vault is not allowed in active mode`;
  - **A9**: `{target_mode:"active", file: undefined}` parses.

  Use literal expected strings (an independent pin); do not import the message function. Confirm the new message assertions fail.
- [X] T005 [P] [US1] In `src/tools/get_active_file/index.test.ts`, extend the test `active mode with a locator → VALIDATION_ERROR (no locator accepted)`. Assert that `payload.details.issues[0].message` equals `path is not allowed: the active file is the implicit target, so no note may be named`, and that the payload text does not contain `folder-scoped` (A2 on the wire, research F2). Confirm it fails.
- [X] T006 [P] [US1] In `src/tools/files/schema.test.ts` cases (7) and (8), assert that the issue on `file` / `path` has the exact message `file is not allowed for folder-scoped tools` / `path is not allowed for folder-scoped tools` (U1, U2). This pins FR-005 and should pass before and after the change. `paths` (U3) needs no edit: its existing `unrecognized_keys` tests already prove it.

### Implementation for User Story 1

- [X] T007 [US1] In `src/tools/get_active_file/schema.ts`:
  - define a module-private function, `(key: "file" | "path") => \`${key} is not allowed: the active file is the implicit target, so no note may be named\``, and pass it as the second argument of `applyTargetModeRefinementForFolderScoped(folderScopedTargetModeBaseSchema, …)` (research D2);
  - update the header comment (lines 1–7) and the input comment (lines 15–18) to say that the tool supplies its own locator message rather than the folder-scoped wording.

  Depends on T003. Confirm T004 and T005 pass, and that T006 is still green.

**Checkpoint**: US1 is complete and independently testable. `files` and `paths` are unchanged.

---

## Phase 4: User Story 2 - Correct file-name formula in the documentation (Priority: P2)

**Goal**: the tool description and the help reference both state that `name` is `basename + "." + extension`, or just `basename` when `extension` is `""`.

**Independent Test**: contract rows F1–F3 ([contract §2](contracts/get_active_file-messaging-contract.md)) pass in `index.test.ts`; F3 checks that the worked examples in the help reference fit the stated relationship.

### Tests for User Story 2

- [X] T008 [US2] In `src/tools/get_active_file/index.test.ts`:
  - **F1**: extend the description test (`description references the tool name, …`), or add a sibling test, asserting that `GET_ACTIVE_FILE_DESCRIPTION` contains `` `basename + "." + extension` `` and does not match ``/basename`?\s*\+\s*`?extension/`` (no dot-less join, with any spacing or backticks);
  - **F2**: in the `docs/tools/get_active_file.md exists and is non-stub` test, assert the same two conditions on the docs body;
  - **F3**: in the same docs test, match every triplet with `/"name": "([^"]*)", "basename": "([^"]*)", "extension": "([^"]*)"/g`, assert at least 3 matches, and assert for each that ``name === (extension ? `${basename}.${extension}` : basename)``.

  Confirm F1 and F2 fail. F3 passes before and after the change, because the examples are already right, and from now on it guards them (FR-010, SC-005). This touches the same file as T005, so it is not [P] with T005.

### Implementation for User Story 2

- [X] T009 [P] [US2] In `src/tools/get_active_file/index.ts`, replace line 23 of `GET_ACTIVE_FILE_DESCRIPTION` with ``- \`name\` — file name including extension: \`basename + "." + extension\`, or just \`basename\` when \`extension\` is \`""\` (\`note.md\` → \`note\` + \`.\` + \`md\`).`` (research D3). Leave the other lines, including the `extension` line, unchanged.
- [X] T010 [P] [US2] In `docs/tools/get_active_file.md`, replace the `name` table row (line 29) with ``| `name` | File name including extension: `basename + "." + extension`, or just `basename` when `extension` is `""` (`note.md` → `note` + `.` + `md`). |``. Leave the `extension` row and every example unchanged. T008's F3 assertion checks that the worked examples fit the stated relationship (FR-010, SC-005).
- [X] T011 [P] [US2] Correct the internal comments that repeat the dot-less formula (research D4):
  - in `src/tools/get_active_file/schema.ts` line 23, `` `name` = `basename` + `extension` `` becomes `` `name` = `basename` + "." + `extension` (just `basename` when `extension` is "") ``;
  - in `src/tools/get_active_file/_template.ts` line 4, `name = basename + extension` becomes `name = basename + "." + extension`.

  Do NOT touch the `ACTIVE_FILE_TEMPLATE` string, which `_template.test.ts` pins byte for byte, and leave the `_template.test.ts` titles alone. The `schema.ts` edit is in the same file as T007, so run T011 after T007.
- [X] T012 [US2] Confirm T008 passes. Depends on T009 and T010.

**Checkpoint**: US1 and US2 both pass independently.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T013 Run `npm run baseline:write`, then `git diff src/tools/_register-baseline.json`. Expected: exactly one changed line, `get_active_file`'s `descriptionFingerprint` (quickstart §2, contract §3). If any `schemaFingerprint` or any other tool moved, stop and investigate before continuing. Depends on T009.
- [X] T014 [P] Add the line `Spec 082-fix-active-file-messaging.` to `CHANGELOG.md` under `## [Unreleased]`, after the 081 line. Add a `### Fixed` bullet: **`get_active_file` names the right reason when a note locator is supplied.** A `file` or `path` locator is still rejected in both modes, with the message "`<key>` is not allowed: the active file is the implicit target, so no note may be named" in place of the folder-scoped wording, and the description and help page now state `name` as `basename + "." + extension` (just `basename` with no extension). `files` and `paths` are unchanged.
- [X] T015 Run the full gate in PowerShell: `npm run typecheck; npm run lint; npm run format:check; npx vitest run`. All must be green. Depends on T001–T014.
- [X] T016 Post-implement structural verification (plan, CodeGraph structural check). Run `codegraph sync`, then `codegraph_explore "applyTargetModeRefinementForFolderScoped getActiveFileInputSchema filesInputSchema"`. Verify:
  - (1) there is no new error class or code, and `src/errors.ts` is unchanged;
  - (2) no handler imports `createLogger` / `createQueue`, and `src/server.ts` is unchanged;
  - (3) only `get_active_file/schema.ts` passes a second argument, while `files/schema.ts` and `paths/schema.ts` still pass one;
  - (4) the new message function is reachable from `getActiveFileInputSchema`.

  Record the result in `specs/082-fix-active-file-messaging/post-implement.md`.
- [ ] T017 (optional; skipped — validation fails before any CLI call, and index.test.ts A2 covers the wire; see post-implement.md) Run the live check in quickstart §3. Read `.memory/test-execution-instructions.md` first. The check makes no vault access, because validation fails before any CLI call.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)**: none.
- **Foundational (T002 → T003)**: blocks US1 only.
- **US1 (Phase 3)**: T004, T005 and T006 can start after T001. T007 needs T003.
- **US2 (Phase 4)**: independent of Phase 2 and of US1, apart from shared files. It can start after T001.
- **Polish**: T013 after T009; T015 after everything; T016 after T015.

### Same-file ordering (not [P] across these pairs)

- `src/tools/get_active_file/index.test.ts`: T005, then T008.
- `src/tools/get_active_file/schema.ts`: T007, then T011.

### Structural dependency notes

- `codegraph_explore` on `applyTargetModeRefinementForFolderScoped` and `getActiveFileInputSchema` shows a direct call edge, `get_active_file/schema.ts` → `target-mode.ts`. That edge is why T007 depends on T003.
- The same query lists `files/schema.ts` and `paths/schema.ts` as the refinement's other callers. That is why T006 pins `files`' text, and why T016(3) checks that both still pass one argument.
- `GET_ACTIVE_FILE_DESCRIPTION` reaches the fingerprint baseline through `createGetActiveFileTool`, so T013 must follow T009.

## Parallel Example: User Story 1

```text
Task: "T004 extend src/tools/get_active_file/schema.test.ts (A1–A9)"
Task: "T005 extend src/tools/get_active_file/index.test.ts (A2 on the wire)"
Task: "T006 pin files' messages in src/tools/files/schema.test.ts (U1, U2)"
```

## Parallel Example: User Story 2

```text
Task: "T009 fix the name line in src/tools/get_active_file/index.ts"
Task: "T010 fix the name row in docs/tools/get_active_file.md"
```

## Implementation Strategy

### MVP first (User Story 1)

1. T001.
2. T002 → T003.
3. T004 to T007.
4. Validate A1–A9 and U1–U3.

US1 alone moves no fingerprint, because superRefine is invisible to JSON Schema.

### Incremental delivery

1. Add US2 (T008 to T012). The description fingerprint moves, so run T013.
2. Polish: T014 to T016, then T017 if wanted.

## Notes

- **Pair queries**: this list crosses two source modules, `src/target-mode/` and `src/tools/get_active_file/` (plus test-only edits in `src/tools/files/`). The pair query above settles the only cross-module dependency, T003 → T007.
- No task touches a kernel node (`createLogger`, `createQueue`, `UpstreamError`, `createServer`).
- `.docs-as-code/` updates are not tasks here. They follow in `/speckit-docs-as-code <n>` after review (CLAUDE.md, PR lifecycle).
