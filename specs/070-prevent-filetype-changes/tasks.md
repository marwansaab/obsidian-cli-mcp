---

description: "Task list for 070-prevent-filetype-changes"
---

# Tasks: Prevent File Type Changes

**Input**: Design documents from `specs/070-prevent-filetype-changes/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Required. Constitution Principle II makes happy-path and failure-or-boundary tests mandatory, co-located (`*.test.ts` beside the source), in the same change as every modified tool.

**Organization**: Tasks are grouped by user story. Load the `karpathy-guidelines` skill before any code task. Read `.memory/test-execution-instructions.md` before any task that runs the real `obsidian` CLI (T001, T034).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 from spec.md
- Paths are repository-relative

---

## Phase 1: Setup (live-CLI verification gates)

**Purpose**: Confirm the assumptions the design rests on before code changes. Each probe has a recorded fallback in [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md).

- [ ] T001 Run T0 probes P1–P5 per specs/070-prevent-filetype-changes/contracts/t0-probe-plan.md against `Obsidian.com` and `TestVault-Obsidian-CLI-MCP/Sandbox/070-<run-id>/` (seed `P.canvas`, `T.base`, `I.png`, `N.md`; capture before/after listings; clean up, including `.trash/`). Record verbatim stdout/stderr/exit codes, binary path and version, and the cleanup record in the `## Evidence` section of specs/070-prevent-filetype-changes/contracts/t0-probe-plan.md. Where a probe hits its fallback, note the fallback taken and update research.md / data-model.md in the same edit (P5 may change the attachment list in data-model.md `FileCategory`; P1 may require a response-regex change recorded for T009/T010).

**Checkpoint**: Evidence recorded; any fallback reflected in the design docs.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: The shared file-type helper and the DI change every code story depends on.

**⚠️ CRITICAL**: No user story code task can begin until this phase is complete.

- [ ] T002 Create src/file-type/file-type.ts with header `// Original — no upstream. <intent>` (research D1, D4, D8; data-model FileCategory): export `FileCategory` type (`"note" | "canvas" | "base" | "attachment"`), the extension table (final list from T001 P5), `extensionOf(path)` (substring after the last `.` of the final `/` segment, original case, `""` if none), `categoryOf(ext)` (case-insensitive, `null` for non-core), `ALL_CATEGORIES`, a `describeCategories(categories)` helper that renders the human list used in messages and descriptions (e.g. "notes, canvases and bases"), and `assertSupportedFileType({ relPath, supported, toolName, alternative? })` that throws `UpstreamError` `{ code: "VALIDATION_ERROR", details: { code: "UNSUPPORTED_FILE_TYPE", reason: "unsupported-type", path, extension, supported, alternative? } }` with the message shape in contracts/errors.md, plus `typeChangeError({ relPath, destination, toolName })` building the `reason: "type-change"` envelope (adds `destination`, `destinationExtension`, `supported: ALL_CATEGORIES`, `alternative: "obsidian_exec"`). Imports only `src/errors.ts`.
- [ ] T003 [P] Create src/file-type/file-type.test.ts: `extensionOf` (`a/b.md`→`md`, `a.b/c`→`""`, `Photo.PNG`→`PNG`, `README`→`""`, `x/.hidden`→`hidden`, `Doc.v1.draft`→`draft`); `categoryOf` for every table entry in lower and upper case and `null` for `txt`, `docx`, `""`; `assertSupportedFileType` passes a supported type, throws the exact `details` shape for an unsupported one (with and without `alternative`), and its message contains the path, the received type and each accepted category; `typeChangeError` shape (contracts/errors.md second example).
- [ ] T004 Add `vaultRegistry: VaultRegistry` to `ExecuteDeps` in src/tools/read/handler.ts, src/tools/rename/handler.ts, src/tools/move/handler.ts and src/tools/outline/handler.ts (import the type the way src/tools/append_note/handler.ts does), and pass `vaultRegistry` on the `createReadTool`, `createRenameTool`, `createMoveTool`, `createOutlineTool` lines of `createServer` in src/server.ts (research D3 DI consequence; plan Kernel-node attention). No other server.ts change.
- [ ] T005 Update every test fixture that constructs those four tools' deps so they typecheck with the new field: src/tools/{read,rename,move,outline}/index.test.ts and src/tools/{read,rename,move,outline}/handler.test.ts (pass a stub registry the way src/tools/append_note/handler.test.ts does). Run `npm run typecheck` and `npx vitest run src/tools/read src/tools/rename src/tools/move src/tools/outline` — all existing tests still pass with no assertion changes.

**Checkpoint**: Helper tested; four tools receive the registry; suite green.

---

## Phase 3: User Story 1 — Renaming or moving a non-Markdown file keeps its type (Priority: P1) 🎯 MVP

**Goal**: rename and move keep the source's extension for every file type (FR-003–FR-005, FR-009, FR-011, FR-012).

**Independent Test**: rename a canvas to `Roadmap`, move a base and an image, rename the focused canvas in active mode, delete a canvas and an image; every result keeps its extension; pre-existing Markdown rename/move tests pass with only the edits listed in Notes.

### Tests for User Story 1

- [ ] T006 [P] [US1] In src/tools/rename/handler.test.ts add a table-driven test over every data-model.md DestinationNameRule worked row that is not a rejection (forwarded `name=` token and returned `toPath` as listed), plus: `file` locator → `resolveFileByTsv` stub returns `Boards/Plan.canvas` → the resolution spawn is `file file=Plan` and the rename spawn forwards the original `file=Plan` (no `path=`) with `name=Roadmap.canvas`; a separate test asserts the resolution call on its own (argv, ordering before the rename spawn); `active` mode → focused-file eval stub returns `{ path: "Boards/Plan.canvas", base }` → argv is specific-mode with the registry's vault display name and `path=Boards/Plan.canvas`; a `file` resolution failure surfaces its existing `CLI_REPORTED_ERROR` and spawns no rename; `ERR_NO_ACTIVE_FILE` surfaces unchanged. Update existing Markdown `file`-mode tests mechanically so their assertions address the rename spawn (the second recorded spawn) — its arguments stay exactly as asserted today; update existing active-mode tests to expect the specific-mode `vault=` + `path=` action arguments (research D3 test consequence).
- [ ] T007 [P] [US1] In src/tools/move/handler.test.ts add the same coverage for `to`: worked rows on the final segment of `to`; folder form `Archive/` keeps the basename for `.canvas`, `.base`, `.png`; `to: "Archive/Plan2"` on `Boards/Plan.canvas` → `to=Archive/Plan2.canvas`; `file` mode runs the resolution spawn then forwards the original `file=` (resolution call asserted in its own test); `active` mode forwards the resolved `path=` in specific mode; resolution failures surface unchanged. Apply the same mechanical updates to existing Markdown `file`-mode (address the move spawn; arguments unchanged) and active-mode (specific `vault=` + `path=`) tests. Rewrite the existing test "SC-013 source-`.md`-guard suppression on non-`.md` source" (expected `to=Archive/Renamed` → now `to=Archive/Renamed.canvas`) and record the change in its title.

### Implementation for User Story 1

- [ ] T008 [US1] Add the destination-name rule to src/file-type/file-type.ts as `resolveDestinationName({ source, destination, toolName })` returning the forwarded name or throwing `typeChangeError` (data-model.md DestinationNameRule, research D5: reject a recognised destination extension that differs case-insensitively; Markdown source → byte-exact `endsWith(".md")` verbatim check; other sources → case-insensitive verbatim check; extensionless source → verbatim; else append `.` + source extension in source spelling). Extend src/file-type/file-type.test.ts with every worked row, including the three rejection rows.
- [ ] T009 [US1] In src/tools/rename/handler.ts replace `appendMdIfMissing` with: resolve the source (`path` as given; `file` → `resolveFileByTsv(deps, input.vault!, input.file, "rename")`; `active` → `resolveActiveFocusedFile(deps, "rename")` + `resolveVaultDisplayName(deps.vaultRegistry, vaultRoot)`), compute `name` with `resolveDestinationName`, then call `invokeCli`: `path` mode as today; `file` mode with the original `file=` locator unchanged; `active` mode in specific mode with the resolved vault display name and `path=<resolved>` (research D3, D5). Keep `parseRenameResponse` unless T001 P1 showed a different response shape for non-note sources. Update the file header intent. Makes T006 pass.
- [ ] T010 [US1] In src/tools/move/handler.ts replace the source-`.md` guard in `resolveTo` with `resolveDestinationName` applied to the final segment of `to` (folder form unchanged), resolve `file` / `active` sources the same way as T009, and forward the original `file=` in `file` mode and `path=<resolved>` (specific mode) in active mode. Keep `parseMoveResponse`'s empty-stdout fallback working with the resolved path. Update the file header intent. Makes T007 pass.
- [ ] T011 [P] [US1] In src/tools/delete/handler.test.ts add tests for FR-003 (Constitution II): happy path — `path: "Boards/Plan.canvas"` and `path: "Att/photo.png"` (and `permanent: true` for one of them) are forwarded unchanged to the `delete` CLI call and return the parsed result; boundary — the same paths through the `file` locator are forwarded unchanged, and a CLI not-found reply for `Att/missing.png` surfaces its existing error rather than any file-type rejection. No production change expected in src/tools/delete/handler.ts.

**Checkpoint**: US1 complete — type kept on rename and move in all three locator forms; delete accepts every type; Markdown tests pass with only the listed edits.

---

## Phase 4: User Story 2 — Notes-only tools reject other file types clearly (Priority: P1)

**Goal**: unsupported types are rejected before any vault change with `VALIDATION_ERROR` + `UNSUPPORTED_FILE_TYPE` (FR-003a, FR-006–FR-009); rename/move reject an explicit type change.

**Independent Test**: call each code-changed tool with a canvas and an image path (and `read` with an image); each fails with the documented `details`, no action CLI call is spawned, no file is written.

### Tests for User Story 2

- [ ] T012 [P] [US2] In src/tools/rename/handler.test.ts and src/tools/move/handler.test.ts add the three data-model rejection rows (`Note.md`→`Sketch.canvas`, `Plan.canvas`→`Plan.md`, `Photo.png`→`New.jpg`) in `path`, `file` and `active` forms: each throws `VALIDATION_ERROR` with `details` matching contracts/errors.md (`reason: "type-change"`, `alternative: "obsidian_exec"`) and the rename/move CLI call is never spawned. Rewrite the existing rename test "name='Sketch.canvas' → argv name=Sketch.canvas.md (cross-extension narrowing) (Story 3 b5)" and the move test "caller-explicit `.md` preserved on non-`.md` source" to expect the rejection, noting the superseded spec 021 / spec 030 locks in their titles.
- [ ] T013 [P] [US2] In src/tools/read/handler.test.ts: `.md`, `.canvas`, `.base` paths pass through (argv unchanged for `path`); `.png`, `.pdf`, `.txt`, extensionless → `unsupported-type` with `supported: ["note","canvas","base"]` and `alternative: "open_file"` for attachments, no `read` spawn; `file` → resolution spawn (asserted in its own test) then the `read` spawn with the original `file=` (existing `toEqual(["vault=MyVault", "read", "file=Recipe"])` assertion kept, retargeted to the second spawn); `active` → focused-file eval then specific `path=` with the registry's vault name (existing active-mode test updated to that argument shape); resolution failures surface unchanged.
- [ ] T014 [P] [US2] In src/tools/outline/handler.test.ts: `.md` passes; `.canvas`, `.png` → `unsupported-type`, no `outline` spawn (replace the existing `Sandbox/x.canvas` upstream-error case at line ~333 with the new rejection); `file` mode → resolution spawn (own test) then `outline` spawn with the original `file=WikiLinkName`; `active` mode → specific `vault=` + `path=`. Update the existing single-spawn invariant test (R3/R12) to state "single `outline` spawn" — it holds for `path` mode, and `file` / `active` modes add exactly one resolution spawn before it.
- [ ] T015 [P] [US2] In src/tools/write_note/handler.test.ts: `path: "Boards/X.canvas"`, `"Att/I.png"`, `"Folder/Note"`, `"Folder/todo.txt"` → `unsupported-type`, no filesystem write; `file: "Plan.canvas"` → `unsupported-type`, no `Plan.canvas.md` created; `file: "version_1.2.3"` → still writes `version_1.2.3.md`; active mode with a focused canvas → `unsupported-type`, no write; existing Markdown cases unchanged.
- [ ] T016 [P] [US2] In src/tools/append_note/handler.test.ts and src/tools/prepend/handler.test.ts: `path`, `file` (stubbed `resolveFileByTsv` returning a `.canvas`) and active (focused `.base`) targets → `unsupported-type`; no read, no write, and for prepend no `prepend` spawn; Markdown cases unchanged.

### Implementation for User Story 2

- [ ] T017 [US2] In src/tools/read/handler.ts declare `READ_SUPPORTED = ["note", "canvas", "base"] as const`, resolve `file` / `active` targets as in T009, call `assertSupportedFileType({ relPath, supported: READ_SUPPORTED, toolName: "read", alternative: "open_file" when the category is attachment })` before `invokeCli`, then forward the original `file=` in `file` mode and `path=` (specific mode) in active mode. Makes T013 pass.
- [ ] T018 [US2] In src/tools/outline/handler.ts declare `OUTLINE_SUPPORTED = ["note"] as const`, resolve as in T017, check, then forward as in T017 (original `file=` in `file` mode, `path=` in active mode). Makes T014 pass.
- [ ] T019 [US2] In src/tools/write_note/handler.ts declare `WRITE_NOTE_SUPPORTED = ["note"] as const`; before any write, reject a `file` whose trailing extension is a recognised non-note core type, then check the canonical write path (specific mode) or the resolved active `relPath` with `assertSupportedFileType`. Short-form `.md` append unchanged. Makes T015 pass.
- [ ] T020 [P] [US2] In src/tools/append_note/handler.ts declare `APPEND_NOTE_SUPPORTED = ["note"] as const` and call `assertSupportedFileType` on the resolved `relPath` (all three locator forms) before reading the note. Makes its T016 cases pass.
- [ ] T021 [P] [US2] In src/tools/prepend/handler.ts declare `PREPEND_SUPPORTED = ["note"] as const` and call `assertSupportedFileType` on the resolved `relPath` before `invokeCli` / `fs.stat`. Makes its T016 cases pass.

**Checkpoint**: US2 complete — every code-changed tool rejects unsupported types before acting; rename/move reject type changes.

---

## Phase 5: User Story 3 — Each tool documents the file types it supports (Priority: P2)

**Goal**: every in-scope tool's description and help page name its supported types, generated from the declaration (FR-010, SC-002).

**Independent Test**: list tools; each in-scope description names exactly its declared types; `help` pages agree.

### Tests for User Story 3

- [ ] T022 [US3] Add a table-driven test in src/tools/_surface.test.ts (or a new co-located src/tools/_file-type-support.test.ts) that, for each in-scope tool in contracts/tool-support.md, asserts the published description contains the sentence produced from its declaration and that description-only tools name their types (notes only / bases only / any file). Out-of-scope and non-file-path tools are excluded explicitly by name.

### Implementation for User Story 3

- [ ] T023 [US3] Add `describeSupport(declaration)` (or reuse `describeCategories` from T002) in src/file-type/file-type.ts producing the description sentence, e.g. "Supported file types: notes, canvases and bases." and, for any-file tools, "Works on any file type (notes, canvases, bases, attachments and others) and keeps its extension."; extend src/file-type/file-type.test.ts.
- [ ] T024 [P] [US3] Append the support sentence to the description constants of the seven code-changed tools: src/tools/{rename,move,read,outline,write_note,append_note,prepend}/index.ts. In rename/index.ts remove "Scoped to .md notes — non-.md targets use obsidian_exec rename directly." and state that a type change is rejected and goes through `obsidian_exec`. Update each tool's index.test.ts description assertion if it pins text.
- [ ] T025 [P] [US3] Append the support sentence to the description constants of the nine description-only tools: src/tools/{delete,open_file,find_and_replace,links,backlinks,smart_connections_similar,views_base,query_base,create_base}/index.ts (delete: "Delete a note" → "Delete a file"; create_base: bases, and the created item is a note). Update any index.test.ts description assertions that pin text. Principle II for these description-only changes: behaviour is untouched and each tool keeps its existing co-located happy and failure tests; the changed surface (the description) is covered by T022 and the baseline check in T030, and `delete` additionally gets T011.
- [ ] T026 [P] [US3] Reword the `name` parameter description in src/tools/rename/schema.ts and the `to` parameter description in src/tools/move/schema.ts to state the preservation rule (no extension → the file keeps its extension; a different type's extension is rejected) (MCP Tool Surface Standards: visible input rules). Update schema.test.ts if it pins the text.
- [ ] T027 [P] [US3] Update src/instructions/instructions.ts per contracts/tool-support.md "Server instructions" (read line names canvases and bases; "Move, rename or delete a file of any type"; one rule line on `UNSUPPORTED_FILE_TYPE` and type preservation) and its assertions in src/instructions/instructions.test.ts; confirm the length limits still pass.
- [ ] T028 [P] [US3] Update docs pages for the seven code-changed tools: docs/tools/{rename,move,read,outline,write_note,append_note,prepend}.md — supported types, the `UNSUPPORTED_FILE_TYPE` row in the errors table with its reason(s) and `details` fields (contracts/errors.md), worked examples from data-model.md for rename/move (replace the ".md-only" / "Cross-extension type conversion → obsidian_exec (bypasses the source-`.md` guard)" rows and the `.canvas` worked rows at docs/tools/move.md ~lines 19, 84, 92–93 and docs/tools/rename.md ~lines 17, 88, 111–112), the extra resolution call for `file` / `active` forms, and (read) the `open_file` alternative.
- [ ] T029 [P] [US3] Update docs pages for the nine description-only tools: docs/tools/{delete,open_file,find_and_replace,links,backlinks,smart_connections_similar,views_base,query_base,create_base}.md — supported types; open_file.md notes that its CLI-reported `UNSUPPORTED_FILE_TYPE` ("Obsidian cannot display this") differs from the new `VALIDATION_ERROR` one ("this tool does not handle this type").
- [ ] T030 [US3] Run `npm run baseline:write`, review the diff of src/tools/_register-baseline.json: `descriptionFingerprint` moves for exactly the 16 in-scope tools, `schemaFingerprint` moves for `rename` and `move` only, tool count stays 35. Then `npx vitest run src/tools/_register.test.ts src/tools/_register-baseline.test.ts src/tools/_surface.test.ts` green.

**Checkpoint**: US3 complete — surface text, help pages and server instructions match behaviour; baseline reviewed.

---

## Phase 6: User Story 4 — No silent conversion anywhere (Priority: P2)

**Goal**: the cross-tool invariant — a successful call never changes a file's extension (FR-011, SC-001).

**Independent Test**: one test asserts, for rename and move across every core category and locator form, that every success has the input's extension and every type-changing input fails.

- [ ] T031 [US4] Add an invariant test (in src/file-type/file-type.test.ts for the pure rule, plus one case per category in src/tools/rename/handler.test.ts and src/tools/move/handler.test.ts) that generates destinations for each `FileCategory` source × {no extension, same extension, same extension different case, unrecognised suffix, each other category's extension} and asserts: `extensionOf(result)` equals the source extension (case-insensitively, original spelling kept when appended) or the call throws `type-change`. For `write_note` (the one in-scope tool that creates files), assert in the same pass that its T015 success cases return a `.md` path for every accepted input and that every non-note input was rejected, so the invariant covers all tools that create, move or rename a file (spec US4 Independent Test). No new production code expected; if a case fails, fix `resolveDestinationName` (T008) or the T019 check.

**Checkpoint**: All four stories complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T032 [P] Confirm every edited source file's header intent line still describes the module (Principle V): rename, move, read, outline, write_note, append_note, prepend handlers; new file-type module has its `Original — no upstream` header.
- [ ] T033 Run the full gate: `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run build`, `npm run format:check`. Fix any failure. Confirm every pre-existing Markdown test for the seven code-changed tools passes with its action-call argument assertions unchanged for `path` and `file` modes (SC-005); the only permitted edits are the ones listed in the Notes "Existing tests whose expectations change on purpose".
- [ ] T034 Run the quickstart manual scenarios (specs/070-prevent-filetype-changes/quickstart.md, US1–US4) through an MCP client against `node dist/index.js` in `TestVault-Obsidian-CLI-MCP/Sandbox/070-<run-id>/` per `.memory/test-execution-instructions.md`; record outcomes (pass/fail, verbatim error envelopes) in a `## Quickstart run` section appended to specs/070-prevent-filetype-changes/quickstart.md; clean up fixtures and `.trash/` residue.
- [ ] T035 Post-implement structural verification per plan.md "Graphify structural check": run `graphify update .` then `/graphify --update`; verify (1) no new error-class node outside `src/errors.ts`, (2) no handler imports `createLogger` / `createQueue` / `createServer`, no tool module imports another, `server.ts` gained no import, (3) `src/file-type/` forms its own community connected to the seven handlers and `appendMdIfMissing` is gone, (4) `src/file-type/file-type.ts` is not orphaned, (5) only in-scope tools' fingerprints moved. Record results in specs/070-prevent-filetype-changes/post-implement.md.
- [ ] T036 [P] Update specs/070-prevent-filetype-changes/contracts/tool-support.md "Code change" column for read/rename/move/outline to mention the `vaultRegistry` DI change, and reconcile any wording that implementation changed (description sentence text, message text) across contracts/errors.md and data-model.md.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (T001)**: no dependencies; its outcomes may adjust T002 (attachment list), T009/T010 (response parsing).
- **Phase 2 (T002–T005)**: after T001. T003 after T002; T005 after T004. Blocks all story phases.
- **US1 (Phase 3)**: after Phase 2. T008 before T009 and T010; tests T006/T007 written first and fail until T009/T010. T011 (delete tests) has no production dependency and can run any time after Phase 2.
- **US2 (Phase 4)**: after Phase 2. Rename/move rejection (T012) depends on T008–T010 (US1) because it exercises the same `resolveDestinationName` path; T013–T021 (read, outline, write tools) are independent of US1.
- **US3 (Phase 5)**: after Phase 2; T023 before T024/T025; T030 after T024–T027 (all surface edits) and after US1/US2 code so the baseline is regenerated once.
- **US4 (Phase 6)**: after T008–T010 (rename/move rule) and T015/T019 (write_note check).
- **Polish (Phase 7)**: after all stories; T035 after T033.

### Structural dependencies (graph-checked)

- `graphify path createServer executeMove` → `createServer → createMoveTool → executeMove`: the T004 server.ts edit and the T009/T010/T017/T018 handler edits sit on one boot-spine path, so T004 (DI) must land before any of them; recorded in Phase 2.
- `executeReadNote` has no existing path to `resolveActiveFocusedFile` (graph: no directed path): T017 creates that edge, and likewise for rename, move and outline. These are new uses of the shared `_active-file.ts` module, not edits to it; no task edits `_active-file.ts`.
- `resolveFileByTsv` is already called by `append_note`, `prepend` and `find_and_replace`: T020/T021 add checks after an existing call and do not depend on the new resolution code in T009/T017.

### Parallel Opportunities

- T003 alongside T004.
- US1 tests T006 ∥ T007 ∥ T011 (delete tests, different file); US2 tests T013 ∥ T014 ∥ T015 ∥ T016.
- T020 ∥ T021 (different files).
- US3: T024 ∥ T025 ∥ T026 ∥ T027 ∥ T028 ∥ T029 after T023.
- US2's read/outline/write work (T013–T021) can run alongside US1 (T006–T011) once Phase 2 is done.

---

## Parallel Example: User Story 2

```text
Task: "T013 read handler tests in src/tools/read/handler.test.ts"
Task: "T014 outline handler tests in src/tools/outline/handler.test.ts"
Task: "T015 write_note handler tests in src/tools/write_note/handler.test.ts"
Task: "T016 append_note + prepend handler tests"
# then
Task: "T020 append_note check in src/tools/append_note/handler.ts"
Task: "T021 prepend check in src/tools/prepend/handler.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. T001 probes → T002–T005 foundation.
2. T006–T011: rename and move keep the type, delete proven for every type — fixes the reported defect.
3. Validate: rename a canvas in the TestVault; result is `.canvas`.

### Incremental Delivery

1. Foundation → US1 (defect fixed) → US2 (clear rejections, including rename/move type-change) → US3 (surface text, docs, baseline) → US4 (invariant test) → Polish.
2. The baseline regenerates once, in T030, after all surface text has moved.

---

## Notes

- Graphify tasks rule applied: the list crosses many source modules; path queries run for the pairs above (createServer↔executeMove, executeReadNote↔resolveActiveFocusedFile, resolveFileByTsv consumers) and their findings are recorded under "Structural dependencies".
- Existing tests whose expectations change on purpose:
  - Non-Markdown outcomes: rename "Sketch.canvas → Sketch.canvas.md" (T012), move "source-`.md`-guard suppression" (T007), move "caller-explicit `.md` preserved on non-`.md` source" (T012), outline `Sandbox/x.canvas` upstream error (T014).
  - Markdown `file`-mode tests for read, rename, move, outline: retargeted to the action spawn, which now follows the new resolution spawn; the action-call arguments they assert are unchanged (T006, T007, T013, T014). Outline's single-spawn test is restated as "single `outline` spawn" (T014).
  - Markdown active-mode tests for read, rename, move, outline: the expected action arguments change from the bare active form to specific mode with `vault=` and `path=` (research D3, FR-009) (T006, T007, T013, T014). This is the one deliberate argument change for Markdown calls; the file acted on and the result envelope are unchanged.
- Out of scope, do not edit: `read_heading`, `read_property`, `set_property`, `patch_heading`, `patch_block` (FR-013); `_active-file.ts`, `_register.ts`, `errors.ts`, `target-mode/**`, `cli-adapter/**`.
- Commit after each phase or logical group.
