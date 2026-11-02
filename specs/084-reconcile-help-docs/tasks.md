---

description: "Task list for 084 Reconcile Help Documentation"
---

# Tasks: Reconcile Help Documentation

**Input**: Design documents from `specs/084-reconcile-help-docs/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/help-reconciliation-contract.md](contracts/help-reconciliation-contract.md), [quickstart.md](quickstart.md)

**Tests**: Requested. FR-008 and FR-012, the Q1 and Q3 clarifications, and Constitution Principle II require happy-path and failure tests for every behaviour change and for the new drift guard. Write each story's tests first and confirm they fail before the implementation task.

**Organization**: one phase per user story, in the spec's priority order. Row IDs (H1, N1, C1, …) refer to the contract.

Before any code edit, load the `karpathy-guidelines` skill and read `.memory/refactor-decisions.md` (checks 5, 6, 9, 10, 25, 27 and 30 apply here). Before any live call, read `.memory/test-execution-instructions.md`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: which user story the task belongs to (US1–US5)

---

## Phase 1: Setup

**Purpose**: a known-green starting point and the plan-time probe, both needed to prove the work later.

- [ ] T001 Run `npm run typecheck; if ($?) { npm run lint }; if ($?) { npm test }` in PowerShell on the branch before any edit and record the result. Every later gate is compared with it; a failure here is pre-existing and must be reported, not fixed in this feature.
- [ ] T002 Recreate the research F3 example probe outside the repository (for example `%TEMP%\probe084\examples.test.ts`) and extend it to both example formats (analysis C1). It imports `src/tools/<tool>/schema.ts` by absolute file URL, takes the export matching `/InputSchema$/` (or `obsidianExecSchema`), and `safeParse`s each candidate. Run it with `npx vitest run --root <dir> --dir <dir>`. Never commit the probe.

  It reads every fenced block in `docs/tools/*.md` that parses as a JSON object and classifies it as exactly one of:
  - **Call block**: has a string `name` and an object `arguments`. Validate `arguments` against `name`'s schema.
  - **Bare-argument block**: no `name` / `arguments`. Every top-level key is a published input property of the page's own tool, where the page is `<tool>.md`; take the property set from `tools/list` via `quietServer()` + `connectModernClient()` from `src/tools/_mcp-client-fixtures.ts`. Validate the block as that tool's arguments.
  - **Template**: a call or bare-argument block in which any string value matches `/<[^<>]+>/` (for example `"<string>"`, `"<3073+ characters>"`). Count it, do not validate it, and list it by page:line.
  - **Not an example**: anything else, for example a response, an error envelope or an output shape. Count only.

  For each validated block, print page, line, heading, kind (call / bare), pass or fail, and on failure the issue paths and messages. Also flag any parse result that carries `deprecated_parameters` (analysis U2). Print the four counts.

  Confirm the call-block results reproduce research F3 (157 call blocks, 11 rejections). Record the bare-argument results as the extended inventory in `post-implement.md`: research F3 covered only call blocks, and 72 further blocks hold argument-like keys. A bare-argument rejection under a heading or sentence that does not label it as failing is an invalid working example; add it to T015.

---

## Phase 2: Foundational (blocks US2, US3, US5 sign-off)

**Purpose**: confirm the plan's drift inventory against the BI-0122 audit records before closing the stories that depend on it.

- [ ] T003 Read TC-00586 and TC-00587 in My-Setup-Vault through `obsidian-cli-mcp` (`search` / `read` with `vault: "My-Setup-Vault"`; the owner must allow those tools). List every item they record under four headings: stale tool name, invalid example, outdated message, vault name. Record each against research F2–F5 in `specs/084-reconcile-help-docs/post-implement.md` (create it, headed `# Post-implement: 084 Reconcile Help Documentation`). Any item the plan missed becomes a sub-bullet of the matching story task before that task is closed: stale tool names → T013, invalid examples → T015, outdated messages → T027, vault names → T026. If the records cannot be read, say so in `post-implement.md` and apply research D8's fallback rule instead.

**Checkpoint**: inventory confirmed. US1 and US4 do not depend on it and can start in parallel with T003.

---

## Phase 3: User Story 1 — Help index matches the server (Priority: P1) 🎯 MVP

**Goal**: the help index and help pages list exactly the offered tools; a removed tool's help returns `HELP_TOOL_NOT_FOUND`; a test keeps it that way (FR-001–FR-003, FR-012).

**Independent Test**: `npx vitest run src/tools/help` passes, and `help` with no arguments lists the 35 tools from `tools/list` (quickstart L1, L2).

### Tests for User Story 1

- [ ] T004 [P] [US1] Create `src/tools/help/docs-sync.test.ts` with header `// Original — no upstream. Help-docs drift guard (spec 084 FR-012): the help pages and index entries in docs/tools match the offered tools exactly, the reverse of assertToolDocsExist.` Inside it, define a pure, test-local helper `helpDocsDrift(toolNames: readonly string[], pageNames: readonly string[], indexText: string)`. It returns `{ orphanPages, missingPages, extraIndexEntries, missingIndexEntries }`, each a sorted `string[]`. Index entries are the names captured by `/^- \*\*([^*]+)\*\* —/gm`; an entry listed twice counts once in `extraIndexEntries` beyond its first occurrence. Add self-tests:
  - H5 (happy path): matching names, pages and index give four empty lists;
  - H3 (failure): a page for a tool not offered lands in `orphanPages`, and an offered tool without a page lands in `missingPages`;
  - H4 (failure): a phantom index entry lands in `extraIndexEntries`, and an offered tool absent from the index lands in `missingIndexEntries`.

  Then add the real check (H1, H2):
  - `quietServer()` + `connectModernClient(app, "docs-sync")` (from `src/tools/_mcp-client-fixtures.ts`), `client.listTools()`, close the client;
  - page names from `readdirSync(join(process.cwd(), "docs", "tools"))` filtered to `*.md` minus `index.md`, with `.md` stripped;
  - the index text from `docs/tools/index.md`;
  - assert all four lists are `[]`.

  Do not add any export to a production file (research D2). Run it and confirm the real check FAILS, naming `list_notes` and `search_vault`.
- [ ] T005 [P] [US1] In `src/tools/help/handler.test.ts`, replace the case "returns content for orphaned doc files … (Edge Case 'doc file with no registered tool', remediation L1c)" (around line 145) with H6: `it.each(["list_notes", "search_vault"])`. Each case calls `executeHelp({ tool_name: name })`, expects it to reject with `UpstreamError` `code === "HELP_TOOL_NOT_FOUND"`, `details.requestedName === name`, and `details.availableTools` containing neither phantom. Use the file's existing rejection-capture idiom. This is an approved test edit (plan → Test-edit scope). Confirm it FAILS before T006.

### Implementation for User Story 1

- [ ] T006 [US1] Delete `docs/tools/list_notes.md` and `docs/tools/search_vault.md`, and remove their two lines (`- **list_notes** — _(documentation pending …)_.` and `- **search_vault** — …`) from `docs/tools/index.md`. Change no other index line.
- [ ] T007 [US1] In `docs/tools/help.md` (the `HELP_TOOL_NOT_FOUND` example, around line 67), replace the `availableTools` list in both the `message` text and `details.availableTools` with the 35 offered tool names in sorted order, exactly as `notFound` builds them (`src/tools/help/handler.ts:81-98`). Keep the rest of the example byte-identical.
- [ ] T008 [US1] Run `npx vitest run src/tools/help`. T004 (all cases) and T005 must pass. Run the local negative check from quickstart §1: copy a page to `docs/tools/zzz_phantom.md`, confirm the real check fails naming `zzz_phantom`, then delete the copy.

**Checkpoint**: US1 is complete and independently verifiable.

---

## Phase 4: User Story 2 — Only current tool names in guidance (Priority: P1)

**Goal**: every tool named in descriptions, parameter descriptions, help pages and recovery hints is offered; `rename`'s hint names `move` (FR-004, FR-005).

**Independent Test**: `npx vitest run src/tools/rename` passes, and the research F2 scan finds no non-offered tool name (contract N3).

### Tests for User Story 2

- [ ] T009 [P] [US2] In `src/tools/rename/schema.test.ts`, update the two cases at about lines 147–176 ("name with forward slash / backslash rejects with move_note recovery hint"). Rename each title to "… with `move` recovery hint". Assert the message equals `name must not contain folder separators; use move to relocate the file to a different folder` and does `not.toMatch(/move_note/)`. Approved test edit.
- [ ] T010 [P] [US2] In `src/tools/rename/index.test.ts` (about lines 140–141), change `expect(body).toContain("move_note")` to `expect(body).toMatch(/use move to relocate/)` plus `expect(body).not.toContain("move_note")`, and update the comment. Approved test edit. Confirm T009 and T010 FAIL before T011.

### Implementation for User Story 2

- [ ] T011 [US2] In `src/tools/rename/schema.ts:13`, change only the `.regex(/^[^/\\]+$/, …)` message to `name must not contain folder separators; use move to relocate the file to a different folder`. Do not touch the pattern: it is published in JSON Schema, and the FR-018 fingerprint must not move.
- [ ] T012 [US2] In `docs/tools/rename.md`, change the two descriptions of the hint (about line 128, "rejected at the schema layer with a `move_note` recovery hint", and about line 283, "a message naming the `move_note` recovery hint") to name `move`. The page's `[move](./move.md)` links stay.
- [ ] T013 [US2] Re-run the research F2 scan (backticked snake_case names, `tool_name: "…"`, `"name": "…"` call shapes, `./x.md` links, "`x` tool") over `docs/tools/*.md`, `src/tools/*/{index,schema}.ts` and `src/instructions/instructions.ts` (the server instructions, analysis U3; spec Assumptions expect them already compliant, so a hit there is reported, not silently fixed). Confirm no tool-shaped name outside the offered set remains, apart from known non-tool identifiers (parameter names such as `active_note`, the `find_connections` plugin method, property values such as `tags`) and any explicit "no longer exists" note. Add any T003 item here. Record the result in `post-implement.md`. Run `npx vitest run src/tools/rename`; it must pass.

**Checkpoint**: US2 is complete.

---

## Phase 5: User Story 3 — Worked examples are valid calls (Priority: P1)

**Goal**: every example presented as a working call passes input validation (FR-006, FR-007).

**Independent Test**: the T002 probe reports zero rejections outside the failing-labelled list (contract X1, X2).

### Implementation for User Story 3

- [ ] T014 [P] [US3] In `docs/tools/write_note.md`, replace both `obsidian_exec` examples that pass `"argv": ["create", "vault=MyVault", "path=Daily/2026-05-10.md", "template=Daily"]` (the "Migration from the legacy `write_note`" list item, about line 111, and the "Rewrite as:" block in "(iv) Migration", about line 240) with `{ "name": "obsidian_exec", "arguments": { "command": "create", "vault": "MyVault", "parameters": { "path": "Daily/2026-05-10.md", "template": "Daily" } } }`. Keep the labelled legacy failing example (about line 225) and the surrounding prose. Check whether the sentence "Template names are short enough that `obsidian_exec` dodges the upstream argv-IPC defect" is still accurate for the `parameters` form, and leave it unless it is wrong.
- [ ] T015 [US3] Fix every invalid working example the T002 probe found among bare-argument blocks, and any T003 "invalid example" item. Use the same rule as T014: make the call valid with current parameter names, without changing what the example demonstrates. Then re-run the T002 probe over both call and bare-argument blocks. Pass criteria:
  - every rejection is a failing-labelled example. The call-block ones are those listed in quickstart §2 (`context_search` Ex. 6, `search` Ex. 7, `properties` Ex. 5, `pattern_search` Ex. 4, `read_heading` Ex. 4, `vaults` Ex. 3, `views_base` Ex. 7, `rename` (vi), `write_note` (iv) legacy form), plus any labelled bare-argument rejections;
  - no validated block carries `deprecated_parameters`, unless it sits in a section that documents the deprecated names.

  Record the run in `post-implement.md`: counts per kind, pass count, the remaining labelled rejections, and the skipped templates.

**Checkpoint**: US3 is complete.

---

## Phase 6: User Story 4 — Documented errors match returned errors (Priority: P2)

**Goal**: `create_base` returns the documented `details.code` / `details.reason` / `details.field` (Q1 = B); `context_search`'s help page shows its missing-folder error as returned (Q2 = A) (FR-008, FR-009, FR-013).

**Independent Test**: `npx vitest run src/tools/create_base` passes C1–C10; `context_search.md` Example 4 equals data-model E6 field for field (quickstart L3).

### Tests for User Story 4

- [ ] T016 [US4] In `src/tools/create_base/index.test.ts`, add a `describe("createCreateBaseTool — validation error discriminators (spec 084 FR-008)")` block with rows C1–C10 from contract §4.
  - Build the tool with `vaultRegistry: registry`, `logger: silentLogger()`, `queue: createQueue()` and `spawnFn` from `makeQueuedSpawn([])` (C1–C9). Assert `getCount() === 0`, so validation failures never spawn.
  - Parse `result.content[0].text` and assert `code === "VALIDATION_ERROR"`, the exact `message`, `details.code`, `details.reason` (`toBeUndefined()` for C7 `CONTENT_TOO_LARGE`), `details.field`.
  - Assert that `details.issues` is an array whose first entry's `path[0]` equals `details.field`.
  - C8 sends the deprecated `path: "a.md"` and expects `details.field === "base_path"`.
  - C9 (`{ base_path: "T.base" }`) expects the generic envelope unchanged: `message === "create_base input failed schema validation"`, `details.code` undefined, `details.issues` present.
  - C10 is the happy path: stub `Created: New item.md\n` and expect the unchanged success result.
  - Use 1001-character strings for C4/C6 and a 3073-character `content` for C7.

  Do not edit the existing empty-`base_path` case at about lines 130–143; it must keep passing. Confirm C1–C8 FAIL before T017.

### Implementation for User Story 4

- [ ] T017 [US4] In `src/tools/create_base/index.ts`, add a local `mapZodIssuesToToolError(issues: z.core.$ZodIssue[]): ToolErrorPayload` and pass it as `mapValidationError` in `createCreateBaseTool`'s `registerTool` spec. Rules (research D3, data-model E5):
  - Build the generic issue list as `issues.map((i) => ({ path: i.path, message: i.message, code: i.code }))`.
  - Find the first issue with `i.code === "custom"` whose `params.code` is one of `"INVALID_BASE_PATH"`, `"INVALID_NAME"`, `"CONTENT_TOO_LARGE"`. For it, return `{ code: "VALIDATION_ERROR", message: issue.message, details: { code: params.code, ...(params.reason === undefined ? {} : { reason: params.reason }), field: params.field, issues: <generic list> } }`.
  - Otherwise return `{ code: "VALIDATION_ERROR", message: "create_base input failed schema validation", details: { issues: <generic list> } }`, byte-identical to `registerTool`'s default (`_register.ts:179-186`).

  Further constraints:
  - No new error code. No new `reason`. No change to `CREATE_BASE_DESCRIPTION`.
  - Import `type ToolErrorPayload` from `../_shared.js` and `type { z }` from `zod`, following `prepend/index.ts`.
  - Extend the file's `// Original — no upstream.` header line to describe the mapper.
- [ ] T018 [US4] Update `docs/tools/create_base.md`:
  - In the error-roster rows for `INVALID_BASE_PATH`, `INVALID_NAME` and `CONTENT_TOO_LARGE`, state that the error carries `details.code`, `details.reason` (`INVALID_BASE_PATH`: `empty` / `too-long` / `wrong-extension` / `path-traversal`; `INVALID_NAME`: `empty` / `too-long`; none for `CONTENT_TOO_LARGE`) and `details.field` (`base_path` / `name` / `content`), with the message being the issue's own (`INVALID_NAME/empty: name is empty`, …), and that `details.issues` keeps the full per-issue list.
  - Make Example 5 ("Content too large") show the returned envelope.
  - Keep line 37's statement that the deprecated `path` reports `base_path`.
  - Do not change the `UPSTREAM_TIMEOUT` row (out of scope, research follow-up).
- [ ] T019 [P] [US4] In `docs/tools/context_search.md` Example 4 ("Folder-not-found error path"), replace the error envelope with data-model E6: `"code": "CLI_REPORTED_ERROR"`, `"message": "CLI bridge upstream error: CLI_REPORTED_ERROR"`, and `details` with `argv` (`["<obsidian binary>", "folder", "path=DoesNotExist"]`), `command: "folder"`, `stdout`, `stderr: ""`, `exitCode: 0`, `message: "Error: Folder \"DoesNotExist\" not found."`. Add one sentence saying agents branch on `details.command === "folder"` and `details.message`, never on the top-level message. Keep the step list (step 5 "propagates verbatim") and the "Distinguishing outcomes" table. No change to `src/tools/context_search/{handler,index,schema}.ts` or `src/cli-adapter/**` (contract S2); the test pins are T020.
- [ ] T020 [US4] Pin `context_search`'s missing-folder error in tests (contract S1a, S1b; analysis C2 = A). The tests are additive and production code is unchanged.
  - In `src/tools/context_search/handler.test.ts`, extend H7 ("H7 zero-match + folder missing → probe throws CLI_REPORTED_ERROR, handler re-raises verbatim", about line 519). Below its existing assertions, which stay unedited, add `expect((err as UpstreamError).details.command).toBe("folder")` and `expect((err as UpstreamError).details.message).toBe('Error: Folder "DoesNotExist" not found.')`.
  - In `src/tools/context_search/index.test.ts`, add one case. Build `createContextSearchTool({ logger: silentLogger(), queue: createQueue(), spawnFn })` with `spawnFn` from `makeQueuedSpawn([{ stdout: "\nNo matches found.\n", exitCode: 0 }, { stdout: 'Error: Folder "DoesNotExist" not found.\n', exitCode: 0 }])`. Call `tool.handler({ query: "x", folder: "DoesNotExist" })`. Parse `content[0].text` and assert:
    - `isError === true`;
    - `code === "CLI_REPORTED_ERROR"`;
    - `message === "CLI bridge upstream error: CLI_REPORTED_ERROR"`;
    - `details.command === "folder"`;
    - `details.message === 'Error: Folder "DoesNotExist" not found.'`.

    Call `__resetInFlightRegistryForTests` as the file's other cases do.
  - Both assertions describe today's behaviour, so they pass immediately. If either fails, the help-page rewrite in T019 is built on a wrong premise: stop and report.
- [ ] T021 [US4] Run `npx vitest run src/tools/create_base src/tools/context_search`. All pass, including the untouched existing assertions.

**Checkpoint**: US4 is complete.

---

## Phase 7: User Story 5 — Examples show current messages and vault names (Priority: P3)

**Goal**: quoted validation messages and vault names in examples match current behaviour (FR-007, FR-010, FR-011).

**Independent Test**: each corrected example's input, sent to its tool's schema (T002 probe), returns the exact message the page quotes; the vault-name rule in research D8 holds for every example.

### Implementation for User Story 5

- [ ] T022 [P] [US5] In `docs/tools/context_search.md` Example 6, change the quoted issue message to `query is empty or whitespace-only (FR-008)`, as the schema returns it.
- [ ] T023 [P] [US5] In `docs/tools/search.md` Example 7, change the quoted issue message to `query is empty or whitespace-only (FR-010)`.
- [ ] T024 [P] [US5] In `docs/tools/properties.md` (Example 5, about line 180, and the unknown-key sentence, about line 184), replace the zod 3 wording with what zod 4 returns: `Too small: expected string to have >=1 characters` and `Unrecognized key: "file"`. Get the exact strings from a `safeParse` run (T002 probe or a one-off REPL), not from memory.
- [ ] T025 [P] [US5] In `docs/tools/views_base.md`, correct the claim that the wrong-extension rejection carries `params.code` / `params.reason`. This applies to Example 7 (about line 150), the supported-types sentence (about line 5) and the error-table row (about line 57). The error is the generic envelope: `message: "views_base input failed schema validation"` and `details.issues[0]` = `{ path: ["base_path"], message: "INVALID_BASE_PATH/wrong-extension: base_path must end with .base", code: "custom" }`. Get the exact top-level message from a handler run. Do not change `views_base` code (research D6; the fix is a follow-up).
- [ ] T026 [US5] Apply research D8 for vault names. Fix every vault-name item from T003. If T003 found the records unreadable, check each example whose response or prose names a vault against its own request and current behaviour, and fix only real mismatches. Leave placeholders (`MyVault`, `Demo`, `Work`, `<vault name>`). Record each change (page:line, before → after) or "none found" in `post-implement.md`.
- [ ] T027 [US5] Re-run the T002 probe (call and bare-argument blocks). Compare each failing-labelled example's quoted message with the probe's reported message for that input; all must match. Fix any bare-argument failing example whose quoted message differs, as in T022–T025. Record the result in `post-implement.md`.

**Checkpoint**: all five stories are complete.

---

## Phase 8: Polish & Cross-Cutting

- [ ] T028 Update `CHANGELOG.md` `[Unreleased]`:
  - add the line `Spec 084-reconcile-help-docs.` after the 083 line;
  - **Changed**: `create_base` validation errors now carry `details.code`, `details.reason` (when the rejection has one) and `details.field` next to the unchanged `details.issues`, and the message is the issue's own. `rename`'s folder-separator hint names `move`.
  - **Removed**: the `list_notes` and `search_vault` placeholder help pages and index entries; `help` now answers `HELP_TOOL_NOT_FOUND` for them.
  - **Fixed**: the `write_note` migration example's `obsidian_exec` call; quoted validation messages in `context_search`, `search` and `properties`; `views_base`'s wrong-extension detail; `context_search`'s missing-folder example envelope.

  Normal prose, matching the existing entries.
- [ ] T029 Run the full gate in PowerShell: `npm run typecheck; if ($?) { npm run lint }; if ($?) { npm test }`. Also run `npm run format:check`. All green. The FR-018 fingerprint test in `src/tools/_register.test.ts` must pass WITHOUT running `npm run baseline:write` (contract §6). If it fails, stop and find which published byte moved. Confirm with `git status` that `src/tools/_register-baseline.json` is unmodified.
- [ ] T030 Confirm the changed-file set matches plan.md → Source Code exactly. `git diff --stat main...HEAD` plus untracked files must show no change under `src/server.ts`, `src/errors.ts`, `src/cli-adapter/`, `src/tools/_register.ts`, `src/tools/help/{handler,index,schema}.ts`, `src/tools/context_search/{handler,index,schema}.ts` (its two test files change, T020), `src/tools/views_base/`, `src/tools/query_base/` or `src/tools/_base-path.ts`.
- [ ] T031 Post-implement structural verification (CLAUDE.md). Run `codegraph sync`, then `codegraph_explore "createCreateBaseTool mapZodIssuesToToolError renameInputSchema"`. Verify:
  1. no new error code or class, and `src/errors.ts` unchanged;
  2. no handler imports `createLogger` / `createQueue` / `createVaultRegistry`;
  3. `create_base/index.ts` gained only `ToolErrorPayload` and `zod` type imports, with no tool → tool edge;
  4. the mapper is reachable from `createCreateBaseTool` → `registerTool`, and `helpDocsDrift` exists only in the test file;
  5. the plan's kernel-node no-touch claim holds.

  Record the results in `post-implement.md`.
- [ ] T032 Live checks L1–L5 (quickstart §3). Steps:
  - read `.memory/test-execution-instructions.md`;
  - run `npm run build`;
  - restart the `obsidian-cli-mcp` server so it serves the edited `docs/tools/`;
  - confirm `TestVault-Obsidian-CLI-MCP` is focused (steps 1–4 there), then run L1–L5.

  L3 must match `context_search.md` Example 4 field for field (`argv[0]` is the resolved binary path). L4 and L5 must write nothing. Record outcomes in `post-implement.md`. If the test vault cannot be focused, stop and report; do not run against another vault.
- [ ] T033 Add the follow-ups to `post-implement.md`: `query_base` / `views_base` `INVALID_BASE_PATH` details; `UPSTREAM_TIMEOUT` vs `CLI_TIMEOUT`; any T003 item judged out of scope. Copy them from research → Follow-ups, with evidence.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001–T002)**: start immediately. T002 feeds T015, T024, T027.
- **Foundational (T003)**: blocks the sign-off tasks T013, T015 and T026 only; US1 and US4 do not wait for it.
- **US1 (T004–T008)**, **US2 (T009–T013)**, **US3 (T014–T015)**, **US4 (T016–T021)**, **US5 (T022–T027)**: independent of each other after Setup, with the cross-story notes below.
- **Polish (T028–T033)**: after all stories.

### Within each story

- Tests first, and seen failing: T004/T005 before T006–T007; T009/T010 before T011; T016 before T017.
- T008, T013, T015, T021 and T027 are each story's closing check.

### Cross-story notes (from the CodeGraph pair check)

- `quietServer` → `createServer` → `createCreateBaseTool`: the US1 real check (T004) builds the whole server, so it loads US4's `create_base/index.ts`. A compile error in T017 fails T004's file too. Run T008 again after T017 if US1 was closed first.
- `docs/tools/context_search.md` is edited by T019 (US4, Example 4) and T022 (US5, Example 6). Different sections, but do them sequentially, not in parallel.
- `docs/tools/create_base.md` (T018) and the T002 probe: Example 5 keeps its `"<3073+ characters>"` placeholder `content`, so the probe lists it as a template and does not parse it. Its error is pinned by contract row C7 (T016) instead.

## Parallel Example

```text
# After T001–T002, in parallel:
T004 [US1] docs-sync.test.ts          T009 [US2] rename/schema.test.ts
T005 [US1] help/handler.test.ts       T010 [US2] rename/index.test.ts
T014 [US3] write_note.md              T016 [US4] create_base/index.test.ts
T022 / T023 / T024 / T025 [US5]       (separate pages)
```

## Implementation Strategy

### MVP first (US1)

T001 → T004–T008. The help index is the agent's first map, and the drift guard stops it regressing. Validate with quickstart L1–L2.

### Incremental delivery

US1 → US2 → US3 (all P1, small) → US4 (the only behaviour change, with its C1–C10 tests) → US5 → Polish. Each story closes with its own check task.

## Notes

- **CodeGraph `/speckit-tasks` rule**: the task list crosses source modules (`help` tests, `rename`, `create_base`). The pair query `createCreateBaseTool renameInputSchema quietServer connectModernClient` returned one structural path, `quietServer → createServer → createCreateBaseTool`, reflected in the cross-story notes above. `renameInputSchema` and `createCreateBaseTool` share no path.
- **Approved test edits** are only those in plan.md → Test-edit scope (T005, T009, T010, and the additive T020 assertions). Any other failing existing test is a finding to report, not to rewrite (refactor-decisions check 5).
- **No new production symbol for tests**: `helpDocsDrift` stays inside `docs-sync.test.ts` (research D2; refactor-decisions items 10 and 30).
- **The probe (T002) is never committed.**
- After implementation: `/speckit-git-commit` → open PR → `/code-review` + fixes → `/speckit-docs-as-code <n>` → merge (CLAUDE.md lifecycle). Docs-as-code updates `.docs-as-code/capabilities/escape-hatch-and-meta.md:152`.
