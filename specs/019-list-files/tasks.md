---

description: "Task list for 019-list-files — typed folder-scoped file enumeration"
---

# Tasks: List Files — Typed Folder-Scoped File Enumeration

**Input**: Design documents from [/specs/019-list-files/](./)
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED per Constitution Principle II — every public surface ships with happy-path AND failure-or-boundary tests in the same change. Test files are co-located with sources (`*.test.ts` next to `*.ts`) and locked at 51 cases total per [data-model.md test inventory](./data-model.md) (SC-015 floor: 30).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing. The MVP scope is US1 (specific-mode listing) — all subsequent stories layer on top.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **[Story]**: `[US1]`, `[US2]`, `[US3]`, `[US4]`, `[US5]`, or `[US6]` — maps to user stories in [spec.md](./spec.md).
- Each task description includes the exact file path.

## Path Conventions

Single-project layout. All paths relative to repo root `c:\Github\obsidian-cli-mcp\`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Module scaffold with the project's mandatory header conventions per Constitution V.

- [ ] T001 Create the per-surface module directory `src/tools/list_files/` and scaffold the six new files (`schema.ts`, `schema.test.ts`, `handler.ts`, `handler.test.ts`, `index.ts`, `index.test.ts`), each carrying a `// Original — no upstream.` one-line header per Constitution V / FR-025

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The zod schema is the single source of truth for both the input AND output AND types per Constitution III. Every test and handler import flows from these schemas, so they MUST land before any per-story work begins. The folder-scoped target-mode refinement is the one new helper introduced by this feature.

**⚠️ CRITICAL**: No user story work can begin until Phase 2 is complete.

- [ ] T002 Decide-and-implement the folder-scoped target-mode refinement at one of: (a) a new helper `applyTargetModeRefinementForFolderScoped` in [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) (RECOMMENDED — pattern may recur; add ~30 LOC + ~10 LOC of co-located tests; carries the `// Original — no upstream.` header) OR (b) a local `superRefine` inlined in `src/tools/list_files/schema.ts`. Forbids `file` AND `path` in BOTH modes; preserves the existing in-specific-requires-vault / in-active-forbids-vault rules. Per the data-model.md schema spec and the spec's Assumptions section.
- [ ] T003 Implement `listFilesInputSchema` in [src/tools/list_files/schema.ts](../../src/tools/list_files/schema.ts) per [contracts/list-files-input.contract.md](./contracts/list-files-input.contract.md): `applyTargetModeRefinementForFolderScoped(targetModeBaseSchema.extend({ folder: z.string().min(1).optional(), ext: z.string().min(1).optional(), total: z.boolean().optional() }).strict())`. The `.min(1)` on `folder` / `ext` enforces R15 (empty-string rejection).
- [ ] T004 Implement `listFilesOutputSchema` in [src/tools/list_files/schema.ts](../../src/tools/list_files/schema.ts) per FR-009 / FR-011: `z.object({ count: z.number().int().nonnegative(), paths: z.array(z.string()) }).strict()` plus `ListFilesInput` and `ListFilesOutput` type exports via `z.infer`

**Checkpoint**: Schema source-of-truth in place. User stories can begin in parallel.

---

## Phase 3: User Story 4 — Validation rejects malformed inputs before the CLI is invoked (Priority: P1)

**Goal**: schema validation is the safety contract for every typed tool. Per FR-014 / SC-007, every invalid input shape MUST reject at the zod boundary AND zero underlying CLI invocations MUST occur. Lands FIRST among the P1 stories because it covers the broadest swathe of acceptance scenarios (8 scenarios) AND it's enforceable purely from the schema files — no handler logic needed.

**Independent Test**: run `schema.test.ts` in isolation; assert all 18 cases pass; assert no `cli-adapter` import is required in the schema-test file (validation is pure-zod).

- [ ] T005 [P] [US4] Write all 18 schema tests in [src/tools/list_files/schema.test.ts](../../src/tools/list_files/schema.test.ts) per the [data-model.md test inventory](./data-model.md): specific+vault+folder+ext happy, specific+vault no-folder no-ext happy (vault-root), active no-vault happy, active+folder+ext+total happy, specific without vault → VALIDATION_ERROR, active with vault → VALIDATION_ERROR, any mode with `file` → VALIDATION_ERROR, any mode with `path` → VALIDATION_ERROR, active with `path` → VALIDATION_ERROR, active with `file` → VALIDATION_ERROR, unknown top-level key → VALIDATION_ERROR (gates `additionalProperties: false` via the `.strict()` base), `target_mode: "nope"` → VALIDATION_ERROR, `total: "true"` (string) → VALIDATION_ERROR, `total: 1` (number) → VALIDATION_ERROR, `folder: ""` → VALIDATION_ERROR (R15), `ext: ""` → VALIDATION_ERROR (R15), `folder: []` (non-string) → VALIDATION_ERROR, `ext: 5` (non-string) → VALIDATION_ERROR

**Checkpoint**: US4 (input validation) is fully testable independently. The schema is the only deliverable; no handler logic is needed for this story.

---

## Phase 4: User Story 1 — Specific-mode listing returns a structured array of vault-relative paths (Priority: P1) 🎯 MVP

**Goal**: deliver the dominant read path — `list_files({ target_mode: "specific", vault, folder?, ext? })` produces the `{ count, paths }` structured shape with vault-relative paths directly inside the named folder, sorted lexically. This is the MVP — agents can replace `obsidian_exec` + client-side line parsing for folder enumeration the moment this story lands.

**Independent Test**: stub `spawnFn` injection responding to `files` with raw stdout containing direct-child paths. Assert (a) spawn argv shape matches the data-model.md argv-mapping table; (b) response equals `{ count: N, paths: [lex-sorted N paths] }`; (c) exactly ONE spawn per request.

### Implementation for User Story 1

- [ ] T006 [US1] Implement the four pure helpers in [src/tools/list_files/handler.ts](../../src/tools/list_files/handler.ts) per [contracts/list-files-handler.contract.md](./contracts/list-files-handler.contract.md): (1) `parseStdout(stdout: string): string[]` per R16 — split on `\n`, trim, filter empty (total over any string; never throws). (2) `isFolderEntry(path: string): boolean` per FR-026 — `endsWith("/") || endsWith("\\")`. (3) `hasDotPrefixedComponent(path: string): boolean` per FR-028 — split on `/`, `.some(seg => seg.startsWith("."))`. (4) Sort comparator: `Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"))` per R8 / FR-027 (UTF-8 byte-compare, NOT JavaScript default UTF-16 code-unit compare).
- [ ] T007 [US1] Implement `executeListFiles(input, deps)` in [src/tools/list_files/handler.ts](../../src/tools/list_files/handler.ts) per R3 / R6 / R7 / R9: ONE `invokeCli({ command: "files", vault: input.vault, parameters: <folder/ext if present>, flags: [], target_mode: input.target_mode })` call; parse stdout → apply filter pipeline (sub-folder filter → dotfile filter → non-recursive filter using component-count check from `folder` per R6) → apply UTF-8 byte-compare sort → set `count = filtered.length`; on `total === true` set `paths = []`, else `paths = filtered`. The CLI's `total` flag MUST NOT appear in argv (R7). Trust validated input per Constitution III.

### Tests for User Story 1

- [ ] T008 [P] [US1] Write 5 argv-shape handler tests in [src/tools/list_files/handler.test.ts](../../src/tools/list_files/handler.test.ts) per data-model.md handler.test.ts inventory cases #1–#5: specific+folder+ext (argv contains `vault=V`, `files`, `folder=F`, `ext=E`); specific+folder no-ext; specific no-folder; active+folder; active no-folder no-ext. Each test injects `deps.spawnFn` and asserts EXACTLY ONE spawn AND argv contains the expected discrete tokens AND argv does NOT contain the bare `total` token regardless of `input.total` (R7).
- [ ] T009 [P] [US1] Write 5 stdout-parsing + sort tests in [src/tools/list_files/handler.test.ts](../../src/tools/list_files/handler.test.ts) per cases #6–#11: 3-path stdout → sorted response (case #6); unsorted stdout → lex-sorted response (case #7); non-BMP character stdout (e.g. emoji-named file) → UTF-8 byte-order (DIFFERS from JavaScript default for non-BMP; case #8); empty stdout → `{ count: 0, paths: [] }` (case #9); trailing-newline-only stdout → empty response (case #10); mixed empty lines → empties dropped (case #11).
- [ ] T010 [P] [US1] Write 2 cross-cutting handler tests in [src/tools/list_files/handler.test.ts](../../src/tools/list_files/handler.test.ts) per cases #26 + #27: trailing-slash `folder=Inbox/` passes through verbatim (CLI normalises per F4 — assert argv contains `folder=Inbox/` literally); path-traversal `folder=../../etc` passes through verbatim (CLI confines per F15 — assert argv contains `folder=../../etc` literally and response is the empty-folder shape when CLI returns empty stdout).

**Checkpoint**: US1 is fully functional and testable independently. Specific-mode root listings, folder listings, and ext-filtered listings work end-to-end via stub spawn injection. The MVP slice ships once US1 + the registration polish task lands.

---

## Phase 5: User Story 3 — Count-only mode returns just the number (Priority: P1)

**Goal**: `total: true` returns `{ count: N, paths: [] }` where `N` matches what `total: false` would return on the same input. Wrapper does NOT delegate to the CLI's native `total` flag (R7) — the same fetch + filter pipeline runs in both modes; only the response payload differs.

**Independent Test**: stub `spawnFn` with a fixed-stdout fixture; call wrapper twice — once with `total: false`, once with `total: true`. Assert (a) both spawns have identical argv (no `total` token in either); (b) `count` values match across the two responses; (c) `total: true` response has `paths: []`; (d) `total: false` response has populated `paths`.

- [ ] T011 [P] [US3] Write 3 handler tests in [src/tools/list_files/handler.test.ts](../../src/tools/list_files/handler.test.ts) per cases #17, #18, #19: `total: true` + stdout of 5 direct-child paths → `{ count: 5, paths: [] }`; `total: false` + same stdout → `{ count: 5, paths: [...5 paths] }` (count matches `total: true`); `total: true` + ext filter → count reflects the (CLI-)filtered subset (the wrapper's count matches what the CLI would return after its ext filter; the wrapper doesn't re-filter on extension because that's delegated to the CLI per R10).

**Checkpoint**: US3 lands. The wrapper→MCP-client token saving from `total: true` is observable in tests via response-shape assertions; the CLI-side cost is identical to `total: false` per Plan-amendment-1.

---

## Phase 6: User Story 2 — Active-mode listing against the focused vault (Priority: P1)

**Goal**: same listing surface against `target_mode: "active"`. Same single-spawn architecture as US1 — the only argv difference is the absence of `vault=`. Active-mode no-focused-vault produces a structured error.

**Independent Test**: stub `spawnFn` to respond to the active-mode argv (no `vault=`) with: (a) a populated stdout → response carries the focused vault's listing; (b) a CLI error shape for no-focused-vault → structured `UpstreamError`.

- [ ] T012 [P] [US2] Write 2 active-mode handler tests in [src/tools/list_files/handler.test.ts](../../src/tools/list_files/handler.test.ts) per cases #4 + #5 + #25: active+folder happy path (argv contains `files`, `folder=F`; argv does NOT contain `vault=`; response shape matches); active no-folder happy path (argv contains only `files`); active no-focused-vault → CLI returns the no-active-file shape → handler throws `UpstreamError({ code: "ERR_NO_ACTIVE_FILE" })` or `CLI_REPORTED_ERROR` (the exact code depends on CLI behaviour verified at T0 — accept either at the test layer; the exact shape is locked by the M-2 manual probe in T020).

**Checkpoint**: US2 lands. Target-mode parity with every other typed tool is achieved.

---

## Phase 7: User Story 5 — Documentation surface for the typed tool (Priority: P2)

**Goal**: replace the absent `docs/tools/list_files.md` stub with the full progressive-disclosure documentation per FR-021. Operator can discover the tool's contract via `help({ tool_name: "list_files" })` once this story lands.

**Independent Test**: invoke the help facility's MCP call for `list_files`; assert the response carries the per-field input contract, output shape both branches of `total`, the documented ordering convention (lex UTF-8 byte-compare), the non-recursive contract, the failure-mode roster, AND at least 4 worked examples covering at least 4 distinct scenarios.

- [ ] T013 [US5] Write [docs/tools/list_files.md](../../docs/tools/list_files.md) (~250 lines) per [contracts/list-files-input.contract.md](./contracts/list-files-input.contract.md) and [contracts/list-files-handler.contract.md](./contracts/list-files-handler.contract.md): per-field input contract (target_mode, vault, folder, ext, total), output shape for both branches of `total`, the lexical UTF-8 byte-compare ordering convention, the non-recursive contract (with the wrapper-side filter explanation), the dotfile filter (FR-028 with the `folder: ".obsidian"` consequence worked out), the failure-mode roster (all six structured error codes from the input contract), 6 worked examples (specific root listing, specific folder + ext, active mode, count-only, dotfile-filtered example, large-folder-cap example), Known Limitations section covering Plan-amendment-1 (`total: true` is NOT a cap-evasion path; mitigation: `obsidian_exec files folder=X total` for recursive count cap-friendly), platform-dependent case-sensitivity on `folder`, and the active-mode TOCTOU caveat (no `vault` echo in response per spec clarification Q3).
- [ ] T014 [P] [US5] Add the `list_files` entry to [docs/tools/index.md](../../docs/tools/index.md) — one-line table row consistent with the existing entries (alphabetically inserted between `help` and `obsidian_exec`)

**Checkpoint**: US5 lands. The help facility carries the discoverable contract for list_files.

---

## Phase 8: User Story 6 — Output-cap fallback (Priority: P3)

**Goal**: pathological folders surface a structured "output too large" error rather than silently truncating. Per Plan-amendment-1, this applies in BOTH `total: false` AND `total: true` modes — they share the same fetch pipeline.

**Independent Test**: stub `spawnFn` to simulate an output-cap kill mid-stream (CLI exit non-zero with cap-exceeded `details`). Assert `UpstreamError({ code: "CLI_NON_ZERO_EXIT" })` surfaces; assert no `{ count: 0, paths: [...truncated] }` response is returned. Run the same test on the same fixture with `total: true` — assert identical error (NOT a successful empty response per the amended SC-012).

- [ ] T015 [P] [US6] Write 1 handler test in [src/tools/list_files/handler.test.ts](../../src/tools/list_files/handler.test.ts) per case #28: stub `spawnFn` to throw `UpstreamError({ code: "CLI_NON_ZERO_EXIT", details: { reason: "output-cap-exceeded" } })`; assert the wrapper re-throws unmodified for BOTH `total: false` AND `total: true` inputs against the same stub. The plan-amended SC-012 is gated by this test (no live characterisation needed at unit-test layer; the M-3 manual probe in T020 covers the live verification).

**Checkpoint**: US6 lands. The output-cap protection is observable at the unit-test layer in both modes.

---

## Phase 9: Filter Pipeline + Error Propagation + Registration (cross-story foundational)

**Purpose**: complete the filter pipeline tests (FR-026 / FR-028 defence-in-depth + R6 non-recursive load-bearing), the error-propagation tests, the registration surface, and the server-wiring. These cut across US1 / US2 / US3 / US6 but don't fit any one story's scope.

- [ ] T016 [US1] Write 5 filter-pipeline handler tests in [src/tools/list_files/handler.test.ts](../../src/tools/list_files/handler.test.ts) per cases #12, #13, #14, #15, #16, #20: case #12 — synthetic recursive stdout (CLI returned `Fixtures/BI-038/repro.md` AND `Fixtures/BI-038/v0.2.9/us1.md`) → non-recursive filter drops the 4-component path; case #13 — synthetic sub-folder entry stdout (path ends `/`) → FR-026 filter drops it; case #14 — synthetic dotfile stdout (filename starts `.`) → FR-028 filter drops it; case #15 — synthetic path with dot-prefixed sub-component (`folder/.hidden/file.md`) → FR-028 filter drops it (any segment, not just leaf); case #16 — `folder: ".obsidian"` + synthetic stdout of `.obsidian/app.json` paths → FR-028 eats every result → `{ count: 0, paths: [] }` (every result has dot-prefixed first segment); case #20 — vault-root listing (no `folder`) with stdout containing 1-component AND 2-component paths → non-recursive filter computes threshold from "1" (1-component paths kept, 2-component paths dropped).
- [ ] T017 [P] [US1] Write 5 error-propagation handler tests in [src/tools/list_files/handler.test.ts](../../src/tools/list_files/handler.test.ts) per cases #21, #22, #23, #24, #28: unknown vault → CLI returns `Vault not found.` (F13) → cli-adapter's 011-R5 inspection clause re-classifies → handler propagates `CLI_REPORTED_ERROR`; generic `Error: …` stdout → `CLI_REPORTED_ERROR` via the dispatch-layer four-priority classifier; CLI binary not found → `CLI_BINARY_NOT_FOUND` propagates unmodified; CLI non-zero exit → `CLI_NON_ZERO_EXIT` propagates unmodified; output-cap exceeded → `CLI_NON_ZERO_EXIT` with cap-exceeded `details` (assert details shape).
- [ ] T018 [P] [US1] Write the `createListFilesTool` factory in [src/tools/list_files/index.ts](../../src/tools/list_files/index.ts) — `registerTool({ name: "list_files", description: "<typed folder-listing summary citing target_mode, folder?, ext?, total? — call help for full docs>", schema: listFilesInputSchema, deps, handler: (input, d) => executeListFiles(input, d) })`. Pattern strictly mirrors [src/tools/read_property/index.ts](../../src/tools/read_property/index.ts) and [src/tools/write_property/index.ts](../../src/tools/write_property/index.ts).
- [ ] T019 [P] [US1] Write 5 registration tests in [src/tools/list_files/index.test.ts](../../src/tools/list_files/index.test.ts) per data-model.md index.test.ts inventory: descriptor name = `"list_files"`; description mentions `target_mode` AND `folder` AND `total`; inputSchema descriptions stripped via `stripSchemaDescriptions` (ADR-005); help facility references `list_files`; `docs/tools/list_files.md` exists (asserted via assertToolDocsExist at server boot).
- [ ] T020 [US1] Register `createListFilesTool` in [src/server.ts](../../src/server.ts) — add the import line alphabetically and the array entry alphabetically inserted between `createHelpTool` and `createObsidianExecTool` (per the existing tools-array order at [src/server.ts:80-90](../../src/server.ts#L80-L90)). +2 lines total. NO other edits to `src/server.ts` per FR-024.

**Checkpoint**: the tool is registered; the server boots with the new entry; `help({ tool_name: "list_files" })` reads from the new doc; the drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) auto-covers the new tool via its `it.each` registry walk (NO edit to `_register.test.ts` needed).

---

## Phase 10: T0 Live-CLI Re-verification (the THREE deferred FR-023 cases)

**Purpose**: the plan-stage live-CLI characterisation pass verified 18 of 21 FR-023 cases (F1–F20 in research.md). THREE cases are deferred to T0 of implementation because they require orchestrated probes that didn't fit the plan-stage timeboxed sweep — emoji / non-ASCII / whitespace-in-name fixture pass, active-mode-no-focused-vault behaviour, and synthetic-large-folder output-cap fixture. Run as a one-off probe set to lock observable behaviour. **Apply test-execution gates** per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) — Sandbox/ subdirectory, timestamped fixtures, cleanup after.

- [ ] T021 T0 Live-CLI probe set, ONE Sandbox seeding + cleanup pass covering the three deferred FR-023 cases per [quickstart.md M-1, M-2, M-3](./quickstart.md): **(M-1) Emoji / non-ASCII / whitespace fixture pass** — seed `Sandbox/list-files-T0/` with files containing `🌳-tree.md`, `日本語.md`, ` leading.md`, `trailing .md`; call wrapper against `folder=Sandbox/list-files-T0`; confirm every fixture name appears in `paths` exactly as on disk; confirm UTF-8 byte-compare sort order against a manually computed expected order; confirm `count === paths.length`; persist findings as `F21`. **(M-2) Active-mode no focused vault** — close all Obsidian windows so no vault is focused; call wrapper with `{ target_mode: "active" }`; capture the CLI's stdout / exit; confirm the wrapper maps it to a structured `UpstreamError` (T012 test #25 accepts either `ERR_NO_ACTIVE_FILE` OR `CLI_REPORTED_ERROR` — this probe locks which code is correct); re-open the test vault and confirm subsequent calls succeed; persist as `F22`. **(M-3) Output-cap pathological fixture** — generate `Sandbox/list-files-cap/` with ~200,000 empty `.md` files (small script: PowerShell `1..200000 | ForEach-Object { Set-Content -Path "Sandbox/list-files-cap/f$_.md" -Value "" }` or equivalent); call wrapper with `folder=Sandbox/list-files-cap` and confirm `UpstreamError(CLI_NON_ZERO_EXIT)` with cap-exceeded `details`; call wrapper again with `total: true` and confirm the SAME error (per Plan-amendment-1); persist as `F23`. Clean up `Sandbox/` after (~200K-file delete may take a minute). **Document findings** in `docs/tools/list_files.md` Known Limitations (if F22 narrows the active-mode no-focused-vault error code, update the failure-mode roster accordingly). **NO new test cases or handler logic depend on this probe set — these are diagnostic-only** (the typed surface contract is locked by the unit-test suite).

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: external surfaces, release artefacts, final validation.

- [ ] T022 [P] Update [package.json](../../package.json) description string to mention `list_files` alongside the existing typed tools — one-line edit per FR-021 / FR-024 ("only permitted edit to existing source is the addition of list_files to the registration list" — package.json description is documentation, not source)
- [ ] T023 [P] Add an entry under "Unreleased" in [CHANGELOG.md](../../CHANGELOG.md) — one paragraph summarising: typed folder enumeration with sub-folder + dotfile filters, wrapper-imposed UTF-8 byte-compare lexical sort, target-mode parity with the other typed tools, `total: true` count-only mode, Plan-amendment-1 known limitation re: total + output cap, the recursive-count fallback via `obsidian_exec files folder=X total`. Cite spec/plan paths.
- [ ] T024 [P] Update [README.md](../../README.md) tools-list section if present — one row added alphabetically (likely between `help` and `obsidian_exec`) consistent with existing entries
- [ ] T025 Run `npm run lint` and confirm zero warnings (Constitution Development Workflow gate 1)
- [ ] T026 Run `npm run typecheck` and confirm zero errors (Constitution gate 2)
- [ ] T027 Run `npm run build` and confirm successful build (Constitution gate 3)
- [ ] T028 Run `npm test` (vitest run) and confirm: (a) all 51 new tests pass; (b) existing test suite still passes byte-stable per SC-013; (c) aggregate `statements` coverage threshold at [vitest.config.ts:20](../../vitest.config.ts#L20) remains at or above the existing 90.9% floor (Constitution gate 5). If coverage ratchets up, ratchet the threshold line by one-line edit; if it doesn't change, leave the line alone.
- [ ] T029 Walk through the 22 quickstart scenarios at [quickstart.md](./quickstart.md) — S-1..S-19 are unit-test verifications already covered by T005 / T008 / T009 / T010 / T011 / T012 / T015 / T016 / T017 / T019; tick each off. S-20..S-22 are the live-CLI defence-in-depth + folder-names-a-file + dotfile-consequence cases already verified at the unit-test layer (T016) and the M-1..M-3 manual probes (T021); confirm each lands as documented; report any drift from the F1–F20 findings as a research.md amendment.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: no dependencies — start immediately.
- **Phase 2 (Foundational — schemas)**: depends on Phase 1. BLOCKS every user story.
- **Phase 3 (US4 validation)**: depends on Phase 2. PARALLEL with US1 / US2 / US3 / US5 / US6 once Phase 2 lands.
- **Phase 4 (US1)**: depends on Phase 2. PARALLEL with US2 / US3 / US4 / US5 / US6 once Phase 2 lands.
- **Phase 5 (US3 count-only)**: depends on Phase 4 (the total branch lives in the same `executeListFiles` function the specific-mode branch lives in — same file, sequential edits but functionally near-trivial: just `paths = total ? [] : filtered`).
- **Phase 6 (US2 active mode)**: depends on Phase 4 (active-mode behaviour comes for free once the handler exists — the cli-adapter handles target_mode plumbing; new tests only).
- **Phase 7 (US5 docs)**: depends on Phase 2 (the schema is the source of truth for the documented contract). PARALLEL with everything after Phase 2.
- **Phase 8 (US6 output-cap)**: depends on Phase 4 (handler must exist for the cap-exceeded path to surface).
- **Phase 9 (filter pipeline + error tests + registration)**: depends on Phases 4 + 5 + 6 (handler must be feature-complete before registration tests can exercise the full surface).
- **Phase 10 (T0 live-CLI probe)**: independent — can run at any point after the handler exists. Recommended after Phase 9 so the M-2 probe exercises the production code path.
- **Phase 11 (Polish)**: depends on Phases 9 + 10 + 7.

### Within Each User Story

- Schema (T003, T004) before handler (T006, T007).
- Helpers (T006) before main function body (T007).
- The single-spawn architecture means there is NO sequential ordering inside `executeListFiles` — one CLI call, one filter pipeline, one response composition.
- Handler-complete before registration (T018) and registration tests (T019).
- Registration before `server.ts` wiring (T020).

### Parallel Opportunities

- Within Phase 2: T002 (target-mode helper, if shared-helper variant chosen) is in `src/target-mode/`; T003 + T004 are in `src/tools/list_files/schema.ts` — T002 is [P] with T003/T004. T003 and T004 both edit `schema.ts` — sequential.
- Within Phase 3: T005 alone — no parallel opportunity inside.
- Within Phase 4: T008 / T009 / T010 are all [P] — different test groups in the same test file but logically independent; can be drafted in parallel by different contributors as long as the file edits don't conflict.
- Within Phase 5: T011 alone (one test group in handler.test.ts).
- Within Phase 6: T012 alone.
- Within Phase 7: T013 and T014 are [P] — different files.
- Within Phase 8: T015 alone.
- Within Phase 9: T016 (filter pipeline tests) is sequential with prior `handler.test.ts` edits; T017 / T018 / T019 are [P] — T017 is in `handler.test.ts` (same shared file but logically independent test group); T018 in `index.ts`; T019 in `index.test.ts`.
- Within Phase 11: T022 / T023 / T024 are [P] — `package.json`, `CHANGELOG.md`, `README.md` (different files).
- Constitutional gates (T025 / T026 / T027 / T028) run sequentially because they share the build output.

---

## Parallel Example: User Story 1 (Phase 4)

Once T002 / T003 / T004 / T006 / T007 land, the handler tests (T008 / T009 / T010) can be drafted in parallel by different contributors (or sequentially by one — the test file is a single shared resource). The handler implementation itself (T006–T007) is strictly sequential because T007 imports helpers from T006.

```text
# Sequential within handler.ts:
T006 Implement parseStdout, isFolderEntry, hasDotPrefixedComponent, sort comparator
T007 Implement executeListFiles (single invokeCli + filter pipeline + sort + response composition)

# Parallel within handler.test.ts (test groups can be drafted by different contributors):
T008 [P] Argv-shape tests (5 cases)
T009 [P] Stdout-parsing + sort tests (5 cases including non-BMP)
T010 [P] Trailing-slash + path-traversal pass-through tests (2 cases)
```

---

## Implementation Strategy

### MVP First (US1 only — specific-mode listing)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (schemas).
3. Complete Phase 3: US4 validation tests (covered by T005 — the schema test pass also gates US4).
4. Complete Phase 4: US1 implementation + tests.
5. **STOP and VALIDATE**: run `npm test` for the list_files module only. The MVP slice ships once T018 / T019 / T020 land for the basic specific-mode path.
6. **Deploy/demo**: agents can now do `list_files({ target_mode: "specific", vault, folder?, ext? })` end-to-end.

### Incremental Delivery

1. Setup + Foundational → schemas in place.
2. US4 validation tests → boundary safety verified.
3. US1 specific-mode → MVP ships.
4. US3 count-only → token-economy mode lands (trivial code addition).
5. US2 active-mode → target-mode parity with the other typed tools (test-only addition; handler already works).
6. US5 docs → discoverability for operators.
7. US6 output-cap test → cap protection verified.
8. Registration + cross-cutting tests → tool is live on the server.
9. T0 probes + polish → release-ready.

### Single-developer strategy

This feature is small enough (~205 LOC source, ~920 LOC test, ~250 LOC docs) that one developer carries the full task list in sequence. The dependency graph is essentially linear within `handler.ts` (T006 → T007); test files allow parallel drafting between contributors but in a one-developer scenario they're written in the same flow as the handler edits they cover.

---

## Notes

- **[P] marker discipline**: only tasks that edit DIFFERENT files OR write fresh code without depending on incomplete tasks earn `[P]`. Test files (`schema.test.ts`, `handler.test.ts`, `index.test.ts`) are SHARED resources — within a single test file, test groups are logically independent but co-edit the same file; `[P]` is granted only when contributors will not conflict.
- **Story label discipline**: every Phase 3–8 task carries the relevant `[US#]` label. Phase 1 / 2 / 9 / 10 / 11 tasks do NOT carry story labels (they're cross-cutting). Phase 9 tasks technically support multiple stories (US1 / US2 / US3 / US6) — they carry `[US1]` because US1 is the MVP gate and registration is needed before US1 can ship; the other stories share the same registration surface.
- **Each user story should be independently completable and testable**: US4 (validation) is fully covered by T005 + schemas (T003 / T004). US1 (specific-mode) ships once T006 / T007 / T008 / T009 / T010 + T018 / T019 / T020 land. US3 (total) is just T011 (with the trivial handler edit in T007 making it work). US2 (active) is just T012 (the handler already supports active mode). US5 (docs) is T013 / T014. US6 (output-cap) is T015.
- **Constitutional gates**: T025 (lint) / T026 (typecheck) / T027 (build) / T028 (vitest with coverage floor) run after every story checkpoint AND once more at the very end. Coverage threshold ratchet via one-line visible edit at [vitest.config.ts:20](../../vitest.config.ts#L20) only if the aggregate moved.
- **Test scope reminder** (from auto-memory): this repo covers vitest unit tests only; manual integration probes are reported in `research.md` / `quickstart.md` rather than scaffolded as `TC-*` test cases. The T021 T0 probe pass is reported in research.md as F21 / F22 / F23 amendments, NOT as new test cases.
- **Verify tests fail before implementing**: vitest-style; write the test first (RED), watch it fail (the spawn-stub assertions, the response-shape assertions), then write the source change to flip it green.
- **Commit after each logical group**: T001 alone (scaffold); T002 alone (target-mode helper if shared); T003+T004 land together (schemas); T005 lands separately (US4 validation tests); T006+T007 land together (handler with all branches); T008+T009+T010 land together (US1 happy-path tests); T011 lands separately (US3); T012 lands separately (US2); T013+T014 land together (US5); T015 lands separately (US6); T016+T017+T018+T019+T020 land together (filter tests + registration + wiring); T021 lands separately (T0 probe diagnostic); T022+T023+T024 + T025..T029 land together (polish).
- **Stop at any checkpoint**: every user story phase ends at a checkpoint where the story is independently testable. Stop there to validate before moving to the next.
- **Plan-stage spec amendments** (per R12): Plan-amendment-1 (SC-012 weakening — `total: true` is NOT cap-evasion) and Plan-amendment-2 (FR-026 / FR-028 are defence-in-depth) are documented in [research.md](./research.md) and must be reflected in the T013 documentation task's Known Limitations section. spec.md is NOT back-edited.
- **Folder-scoped target-mode pattern**: the new helper (or local refinement) introduced by T002 is the ONE incremental change to the target-mode primitive in this feature. If a future feature also needs folder-scoped semantics, the shared helper from T002 is the natural reuse point; if T002 lands as a local refinement instead, the future feature inherits the precedent of inlining.
- **Avoid**: vague tasks (no file path), same-file conflicts in `[P]` tasks, cross-story dependencies that break the MVP slice's independence.

---

## Task count summary

- **Phase 1 (Setup)**: 1 task (T001)
- **Phase 2 (Foundational)**: 3 tasks (T002, T003, T004)
- **Phase 3 (US4 validation)**: 1 task (T005)
- **Phase 4 (US1 specific-mode)**: 5 tasks (T006–T010)
- **Phase 5 (US3 count-only)**: 1 task (T011)
- **Phase 6 (US2 active mode)**: 1 task (T012)
- **Phase 7 (US5 docs)**: 2 tasks (T013, T014)
- **Phase 8 (US6 output-cap)**: 1 task (T015)
- **Phase 9 (Filter pipeline + Error propagation + Registration)**: 5 tasks (T016–T020)
- **Phase 10 (T0 live-CLI probe)**: 1 task (T021)
- **Phase 11 (Polish)**: 8 tasks (T022–T029)

**Total: 29 tasks.** Tests are co-merged with implementation per Constitution II. Format conforms to the strict checklist convention: `- [ ] TXXX [P?] [USx?] description with file path`.
