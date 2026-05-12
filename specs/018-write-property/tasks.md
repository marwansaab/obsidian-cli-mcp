---

description: "Task list for 018-write-property — typed surgical frontmatter write"
---

# Tasks: Write Property — Typed Surgical Frontmatter Write

**Input**: Design documents from [/specs/018-write-property/](./)
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED per Constitution Principle II — every public surface ships with happy-path AND failure-or-boundary tests in the same change. Test files are co-located with sources (`*.test.ts` next to `*.ts`) and locked at 57 cases total per [data-model.md test inventory](./data-model.md) (post-/speckit-analyze remediation: bumped 54 → 57 to close E1 + C1 — added active-mode cross-type retype case + two specific-mode cross-type retype pairs so SC-021's "at least three cross-type retype pairs" coverage holds).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing. The MVP scope is US1 (specific-mode write) — all subsequent stories layer on top.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **[Story]**: `[US1]`, `[US2]`, `[US3]`, `[US4]`, or `[US5]` — maps to user stories in [spec.md](./spec.md).
- Each task description includes the exact file path.

## Path Conventions

Single-project layout. All paths relative to repo root `c:\Github\obsidian-cli-mcp\`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Module scaffold with the project's mandatory header conventions per Constitution V.

- [X] T001 Create the per-surface module directory `src/tools/write_property/` and scaffold the six new files (`schema.ts`, `schema.test.ts`, `handler.ts`, `handler.test.ts`, `index.ts`, `index.test.ts`), each carrying a `// Original — no upstream.` one-line header per Constitution V / FR-032

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The zod schema is the single source of truth for both the input AND output AND types per Constitution III. Every test and handler import flows from these schemas, so they MUST land before any per-story work begins.

**⚠️ CRITICAL**: No user story work can begin until Phase 2 is complete.

- [X] T002 Implement `writePropertyInputSchema` in [src/tools/write_property/schema.ts](../../src/tools/write_property/schema.ts) per [contracts/write-property-input.contract.md](./contracts/write-property-input.contract.md): `applyTargetModeRefinement(targetModeBaseSchema.extend({ name: z.string().min(1), value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]), type: z.enum(PROPERTY_WRITE_TYPE_LABELS).optional() }))` plus the `PROPERTY_WRITE_TYPE_LABELS` constant (the six write-side labels, NOT seven; no `"unknown"` on write side per data-model.md)
- [X] T003 Implement `writePropertyOutputSchema` in [src/tools/write_property/schema.ts](../../src/tools/write_property/schema.ts) per FR-011: `z.object({ written: z.literal(true), path: z.string(), name: z.string() }).strict()` plus `WritePropertyInput` and `WritePropertyOutput` type exports via `z.infer`

**Checkpoint**: Schema source-of-truth in place. User stories can begin in parallel.

---

## Phase 3: User Story 3 — Validation rejects malformed inputs before the CLI is invoked (Priority: P1)

**Goal**: schema validation is the safety contract for every typed tool. Per FR-017 / SC-008, every invalid input shape MUST reject at the zod boundary AND zero underlying CLI invocations MUST occur. Lands FIRST among the P1 stories because it covers the broadest swathe of acceptance scenarios (12 scenarios) AND it's enforceable purely from the schema files — no handler logic needed.

**Independent Test**: run `schema.test.ts` in isolation; assert all 17 cases pass; assert no `cli-adapter` import is required in the schema-test file (validation is pure-zod).

- [X] T004 [P] [US3] Write all 17 schema tests in [src/tools/write_property/schema.test.ts](../../src/tools/write_property/schema.test.ts) per the [data-model.md test inventory](./data-model.md): specific+path happy, specific+file happy, active happy, specific+path with explicit `type`, specific without locator → VALIDATION_ERROR, specific with both locators → VALIDATION_ERROR, specific without vault → VALIDATION_ERROR, empty name → VALIDATION_ERROR, missing name → VALIDATION_ERROR, missing value → VALIDATION_ERROR, value=null → VALIDATION_ERROR, value=object → VALIDATION_ERROR, value=heterogeneous-array → VALIDATION_ERROR, type=invalid-string → VALIDATION_ERROR, active with vault → VALIDATION_ERROR, active with file → VALIDATION_ERROR, active with path → VALIDATION_ERROR (also covers `additionalProperties: false` via the strict() base)

**Checkpoint**: US3 (input validation) is fully testable independently. The schema is the only deliverable; no handler logic is needed for this story.

---

## Phase 4: User Story 1 — Specific-mode write preserves the value's intended YAML type (Priority: P1) 🎯 MVP

**Goal**: deliver the dominant write path — `write_property({ target_mode: "specific", vault, path|file, name, value, type? })` produces the on-disk YAML representation Obsidian's property-type system expects for each of the six types. This is the MVP — agents can replace `read_note` + `write_note` round-trips for surgical writes the moment this story lands.

**Independent Test**: stub `spawnFn` injection responding to `property:set` with `Set <name>: <value>\n` (specific+path) OR responding to `file` + `property:set` (specific+file with wikilink). Assert (a) spawn argv shape matches the data-model.md argv-mapping table; (b) response equals `{ written: true, path, name }`; (c) one spawn for specific+path, two spawns for specific+file.

### Implementation for User Story 1

- [X] T005 [US1] Implement the three pure helpers in [src/tools/write_property/handler.ts](../../src/tools/write_property/handler.ts) per [contracts/write-property-handler.contract.md](./contracts/write-property-handler.contract.md): (1) `inferType(value, explicit?): PropertyWriteTypeLabel` per FR-008 — explicit type wins; otherwise `boolean → "checkbox"`, `number → "number"`, `Array.isArray(value) → "list"`, `string → "text"`. (2) `serialiseValue(value): string` per R9 / R10 — pass-through `String(value)` for string/number; `"true"`/`"false"` for boolean; `value.join(",")` for non-empty array; **literal `"[]"` for empty array per FR-018 / R10 / F2** (this empty-array branch is the gate task for US5 — see T016). (3) `parseFileTSV(stdout): { path }` per R16 / F15 — split stdout on `\n`, find the line starting with `path\t`, return the post-tab substring; throw structured `CLI_REPORTED_ERROR` if no path line found.
- [X] T006 [US1] Implement the `executeWriteProperty` function's specific+path branch in [src/tools/write_property/handler.ts](../../src/tools/write_property/handler.ts) — one `invokeCli({ command: "property:set", vault: input.vault, parameters: { name, value: serialiseValue(input.value), [type], path: input.path }, target_mode: "specific" })` call; response `{ written: true, path: input.path, name: input.name }`. Trust validated input per Constitution III.
- [X] T007 [US1] Extend `executeWriteProperty` with the specific+file branch in [src/tools/write_property/handler.ts](../../src/tools/write_property/handler.ts) — pre-flight `invokeCli({ command: "file", vault: input.vault, parameters: { file: input.file }, target_mode: "specific" })` then parseFileTSV to get the canonical path; then property:set with the canonical path. Response.path = canonical.

### Tests for User Story 1

- [X] T008 [P] [US1] Write 12 handler tests in [src/tools/write_property/handler.test.ts](../../src/tools/write_property/handler.test.ts) covering the specific+path happy paths per data-model.md handler.test.ts inventory cases #1–#10 plus #31 and #32: text/number/boolean(true)/boolean(false)/list-3-elem/list-1-elem/date-with-type/datetime-with-type/explicit-type-override + response.path echoes input.path + response.written is literal true. Each test injects `deps.spawnFn` and asserts ONE spawn with the argv shape from the data-model.md argv-mapping table.
- [X] T009 [P] [US1] Write 2 handler tests in [src/tools/write_property/handler.test.ts](../../src/tools/write_property/handler.test.ts) covering the specific+file branch — wikilink resolution via TWO spawns (file → property:set), AND response.path = canonical-from-Call-A
- [X] T010 [P] [US1] Write 5 handler tests for cross-cutting concerns in [src/tools/write_property/handler.test.ts](../../src/tools/write_property/handler.test.ts) — name passthrough (dot, dash, colon), value passthrough (string with `#`, leading `!`); each test asserts the spawn's argv contains the name/value verbatim with no wrapper-side quoting

**Checkpoint**: US1 is fully functional and testable independently. Specific+path writes work end-to-end via stub spawn injection; specific+file wikilink resolution works via the TWO-call architecture. The MVP slice ships once US1 + the registration polish task (T020 / T022) lands.

---

## Phase 5: User Story 2 — Active-mode write against the focused note (Priority: P1)

**Goal**: the same write surface against `target_mode: "active"`. Adds the eval pre-flight resolver returning `{path, vault}` from `app.workspace.getActiveFile()` + `app.vault.getName()`. Resolves the canonical path BEFORE the property:set call, eliminating TOCTOU between resolution and write.

**Independent Test**: stub spawnFn that responds to (1) the eval pre-flight with `=> {"path":"x.md","vault":"V"}` then (2) property:set. Assert TWO spawns, response carries the focused path. For the no-focused-file case, stub the eval response to `=> {"path":null,"vault":"V"}` and assert ONE spawn (no property:set) + ERR_NO_ACTIVE_FILE thrown.

### Implementation for User Story 2

- [X] T011 [US2] Add the `FOCUSED_FILE_TEMPLATE` constant and the `parseEvalResponse` helper in [src/tools/write_property/handler.ts](../../src/tools/write_property/handler.ts) per [contracts/write-property-handler.contract.md](./contracts/write-property-handler.contract.md) — the template returns `{path, vault}` from `app.workspace.getActiveFile()` + `app.vault.getName()`; `parseEvalResponse` reuses the `=> ` prefix strip pattern from [src/tools/write_note/handler.ts:56-61](../../src/tools/write_note/handler.ts#L56-L61). The template is a FIXED string — NO user input interpolation per R15.
- [X] T012 [US2] Extend `executeWriteProperty` with the active-mode branch in [src/tools/write_property/handler.ts](../../src/tools/write_property/handler.ts) — pre-flight eval call, parse `{path, vault}`, throw `UpstreamError({ code: "ERR_NO_ACTIVE_FILE" })` when path is null, otherwise call property:set with the resolved `vault=<vault-from-eval>` and `path=<path-from-eval>` at adapter target_mode=specific. Response.path = resolved.

### Tests for User Story 2

- [X] T013 [P] [US2] Write 4 handler tests in [src/tools/write_property/handler.test.ts](../../src/tools/write_property/handler.test.ts) — (a) active happy (TWO spawns: eval → property:set); (b) active no-focused-file (ONE spawn: eval only; ERR_NO_ACTIVE_FILE thrown; property:set short-circuited); (c) active TOCTOU (focus shifts between probes; response.path reports the path resolved at step 1); (d) active-mode cross-type retype per US2 acceptance scenario #4 — eval resolves a focused note that has `count: 7` (number), `write_property({target_mode: "active", name: "count", value: "abc"})` lands with the resolved type as text; verifies the FR-033 + SC-021 contract holds in active mode

**Checkpoint**: US2 lands; the typed-write surface now matches every other typed tool's target-mode parity. US1 and US2 are independently testable from each other.

---

## Phase 6: User Story 4 — Documentation surface for the typed tool (Priority: P2)

**Goal**: replace the absent `docs/tools/write_property.md` stub with the full progressive-disclosure documentation per FR-028. Operator can discover the tool's contract via `help({ tool_name: "write_property" })` once this story lands.

**Independent Test**: invoke the help facility's MCP call for write_property; assert the response carries the per-field input contract, type-inference rules, date/datetime explicit-type requirement, output shape, failure-mode roster, and at least 4 worked examples covering at least 4 of the 6 YAML types.

- [X] T014 [US4] Write [docs/tools/write_property.md](../../docs/tools/write_property.md) (~270 lines) per [contracts/write-property-input.contract.md](./contracts/write-property-input.contract.md) and [contracts/write-property-handler.contract.md](./contracts/write-property-handler.contract.md): per-field input contract (target_mode, vault, file, path, name, value, type), type-inference rules table, date/datetime explicit-type rule, output shape, failure-mode roster (all six error codes from the input contract), 6 worked examples (one per YAML type), Known Limitations section covering R7 (YAML flow→block normalisation), R8 (CRLF preservation is partial), R9 (list-element-with-comma), and the multi-vault active-mode inheritance from R5 / F8
- [X] T015 [US4] Add the `write_property` entry to [docs/tools/index.md](../../docs/tools/index.md) — one-line table row consistent with the existing entries

**Checkpoint**: US4 lands. The help facility carries the discoverable contract for write_property.

---

## Phase 7: User Story 5 — Empty-list write produces a valid empty YAML list (Priority: P3)

**Goal**: `value: []` writes the on-disk YAML `tags: []`, not the property removed and not `null` substituted. Per FR-018 and the F2 live finding, the wrapper's `serialiseValue` must emit the literal string `"[]"` (NOT empty string `""`) when the input array is empty.

**Independent Test**: stub spawn responding to `property:set` with `Set <name>: []\n`. Assert the spawn argv contains `value=[]` literally (not `value=`). Assert response shape unchanged.

- [X] T016 [P] [US5] Verify the empty-array branch in `serialiseValue` covered in T005 emits the literal string `"[]"` — this is already implemented per T005's contract but US5 specifically gates the behaviour. Add an inline comment in [src/tools/write_property/handler.ts](../../src/tools/write_property/handler.ts) citing FR-018 + R10 + F2 above the empty-array branch
- [X] T017 [P] [US5] Write 1 handler test in [src/tools/write_property/handler.test.ts](../../src/tools/write_property/handler.test.ts) per data-model.md case #7 — input `value: []`, assert spawn argv includes `"value=[]"` AND `"type=list"` (inferred), assert response is `{ written: true, path, name }`

**Checkpoint**: US5 lands. Empty-list writes round-trip cleanly through the typed surface.

---

## Phase 8: Tool Registration + Error Code Propagation Tests (cross-story foundational)

**Purpose**: complete the registration surface and the remaining error-propagation handler tests. These cut across US1 / US2 / US5 but don't fit any one story's scope.

- [X] T018 [US1] Write 11 handler tests for the failure paths AND the cross-type retype suite in [src/tools/write_property/handler.test.ts](../../src/tools/write_property/handler.test.ts) per data-model.md handler-test inventory: non-existent file → CLI_REPORTED_ERROR (case #18); unknown vault → CLI_REPORTED_ERROR per 011-R5 (case #19); type-vs-value contradiction `value=abc type=number` → CLI_REPORTED_ERROR (case #20); type-vs-value contradiction `value=hello type=date` → CLI_REPORTED_ERROR (case #21); CLI_BINARY_NOT_FOUND propagates (case #22); CLI_NON_ZERO_EXIT propagates (case #23); path-traversal `../../etc/passwd` → CLI_REPORTED_ERROR (case #29); path-traversal `../OtherVault/x.md` → CLI_REPORTED_ERROR (case #30); **plus the three cross-type retype pairs that SC-021 mandates** — (a) number → text retype: pre-state `count: 7` (number) overwritten by `value: "abc"` (no explicit type) → post-state `count: "abc"` (text) per FR-033 (case #16); (b) text → number retype: pre-state `tag: "hello"` (text) overwritten by `value: 42, type: "number"` → post-state `tag: 42` (number) (case #33); (c) list → text retype: pre-state `tags: ["a", "b"]` (list) overwritten by `value: "scalar"` (no explicit type) → post-state `tags: "scalar"` (text) (case #34). Each retype case asserts spawn argv carries the new type token (or no type token when inferred) AND that no pre-write file-state-peek occurs (every write is treated identically per FR-033's "result depends only on the current call's (name, value, type?) triple").
- [X] T019 [P] [US1] Write the `createWritePropertyTool` factory in [src/tools/write_property/index.ts](../../src/tools/write_property/index.ts) — `registerTool({ name: "write_property", description: "<typed-write summary citing target_mode, name, value, type? — call help for full docs>", schema: writePropertyInputSchema, deps, handler: (input, d) => executeWriteProperty(input, d) })`. Pattern strictly mirrors [src/tools/read_property/index.ts](../../src/tools/read_property/index.ts).
- [X] T020 [P] [US1] Write 5 registration tests in [src/tools/write_property/index.test.ts](../../src/tools/write_property/index.test.ts) per data-model.md index.test.ts inventory: descriptor name = `"write_property"`; description includes the tool's typed-write summary token; inputSchema descriptions stripped via `stripSchemaDescriptions`; help facility references `write_property`; `docs/tools/write_property.md` exists (asserted via assertToolDocsExist at server boot)
- [X] T021 [US1] Register `createWritePropertyTool` in [src/server.ts](../../src/server.ts) — add the import line alphabetically and the array entry alphabetically between `createReadPropertyTool` and `createWriteNoteTool` (lines 86–87 of the current file). +2 lines total. NO other edits to `src/server.ts` per FR-031.

**Checkpoint**: the tool is registered; the server boots with the new entry; `help({ tool_name: "write_property" })` reads from the new doc; the drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) auto-covers the new tool via its `it.each` registry walk (NO edit to `_register.test.ts` needed).

---

## Phase 9: T0 Live-CLI Re-verification (the THREE deferred FR-030 cases)

**Purpose**: the plan-stage live-CLI characterisation pass verified 13 of 16 FR-030 cases (F1–F15 in research.md, **correcting the prior "15 of 16" tally per /speckit-analyze finding F1**). THREE cases are deferred to T0 of implementation because they require orchestrated probes that didn't fit the plan-stage timeboxed sweep — concurrent writes, anchors/aliases/comments-in-frontmatter behaviour, and external-editor-open behaviour. Run as a one-off probe set to lock observable behaviour. **Apply test-execution gates** per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) — Sandbox/ subdirectory, timestamped fixtures, cleanup after.

- [ ] T022 T0 Live-CLI probe set, ONE Sandbox seeding + cleanup pass covering the three deferred FR-030 cases: **(a) Concurrent writes** — two concurrent `property:set` invocations against the same Sandbox fixture (same `name`, then different `name`); capture exit codes, stdout for each, post-write FM block well-formedness, which write landed. Persist as F16+F17. **(b) Anchors / aliases / comments in frontmatter** — seed a Sandbox fixture with `---\n# header comment\nshared: &anchor "alpha"\nref_field: *anchor\nleaf: leaf-value\n---\nbody`; call `property:set name=tmp_018_test value=v` against it; capture: post-write state of comment line / anchor marker / alias reference / neighbouring `leaf` field; identify whether comments are stripped, anchors flattened, aliases dereferenced. Persist as F18. **(c) External editor open** — open the Sandbox fixture in a second process (e.g. `notepad` on Windows or any text editor that holds an OS file handle); while the file is open, call `property:set` against it; capture exit code, stdout, post-write state (write rejected / write landed / write landed but editor's in-memory copy clobbers on save). Persist as F19. Clean up Sandbox/ after. **Document each finding** in `docs/tools/write_property.md` Known Limitations section drafted by T014. **NO new test cases or handler logic depend on this probe set — these are diagnostic-only** (the typed surface contract is single-write-per-call; concurrent / anchor / external-editor edge cases are CLI-layer concerns).

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: external surfaces, release artefacts, final validation.

- [X] T023 [P] Update [package.json](../../package.json) description string to mention `write_property` alongside the existing typed tools — one-line edit per FR-028 / FR-031 ("only permitted edit to existing source is the addition of write_property to the registration list" — package.json description is documentation, not source)
- [X] T024 [P] Add an entry under "Unreleased" in [CHANGELOG.md](../../CHANGELOG.md) — one paragraph summarising: surgical single-frontmatter writes, target-mode parity with read_property, six YAML types supported, cross-type retype, R8 partial CRLF preservation known limitation, R9 list-element-with-comma limitation. Cite spec/plan paths.
- [X] T025 [P] Update [README.md](../../README.md) tools-list section if present — one row added alphabetically between read_property and write_note (consistent with existing entries)
- [X] T026 Run `npm run lint` and confirm zero warnings (Constitution Development Workflow gate 1)
- [X] T027 Run `npm run typecheck` and confirm zero errors (Constitution gate 2)
- [X] T028 Run `npm run build` and confirm successful build (Constitution gate 3)
- [X] T029 Run `npm test` (vitest run) and confirm: (a) all 54 new tests pass; (b) existing test suite still passes byte-stable per SC-013; (c) aggregate `statements` coverage threshold at [vitest.config.ts:20](../../vitest.config.ts#L20) remains at or above the existing 89.6% floor (Constitution gate 5). If coverage ratchets up, ratchet the threshold line by one-line edit; if it doesn't change, leave the line alone.
- [ ] T030 Walk through the 21 quickstart scenarios at [quickstart.md](./quickstart.md) — S-1..S-17 are unit-test verifications already covered by T004 / T008 / T009 / T010 / T013 / T017 / T018 / T020 / T022; tick each off. S-18..S-21 are manual end-to-end probes against `TestVault-Obsidian-CLI-MCP` — execute after the FS test vault residue from plan-stage probing (`mode: auto` on `Fixtures/BI-038/tc-mojibake-fbp.md`) has been reverted by the user; report any drift from the F1–F15 findings as a research.md amendment.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: no dependencies — start immediately.
- **Phase 2 (Foundational — schemas)**: depends on Phase 1. BLOCKS every user story.
- **Phase 3 (US3 validation)**: depends on Phase 2. PARALLEL with US1 / US2 / US4 / US5 once Phase 2 lands.
- **Phase 4 (US1)**: depends on Phase 2. PARALLEL with US2 / US3 / US4 / US5 once Phase 2 lands.
- **Phase 5 (US2)**: depends on Phase 4 (the active-mode branch extends the same `executeWriteProperty` function the specific-mode branch lives in — same file, sequential edits).
- **Phase 6 (US4 docs)**: depends on Phase 2 (the schema is the source of truth for the documented contract).
- **Phase 7 (US5 empty list)**: depends on Phase 4 (T016 references T005's `serialiseValue` empty-array branch).
- **Phase 8 (registration + error tests)**: depends on Phases 4 + 5 (handler must be feature-complete before registration tests can exercise the full surface).
- **Phase 9 (T0 live-CLI probe)**: independent — can run at any point after the handler exists. Recommended after Phase 5 so the concurrent-write probe exercises the production code path.
- **Phase 10 (Polish)**: depends on Phases 8 + 9 + 6.

### Within Each User Story

- Schema (T002, T003) before handler (T005..T012).
- Helpers (T005) before main function branches (T006, T007, T011, T012).
- Specific+path branch (T006) before specific+file branch (T007) — both edit the same function in the same file.
- Active-mode branch (T011, T012) extends the same file — sequential after US1's handler edits.
- Handler-complete before registration (T019) and registration tests (T020).
- Registration before server.ts wiring (T021).

### Parallel Opportunities

- Within Phase 2: T002 and T003 both edit `schema.ts` — same file, sequential.
- Within Phase 4: T008 / T009 / T010 are all [P] — different test sets in the same test file but logically independent; can be drafted in parallel by different contributors as long as the file edits don't conflict.
- Within Phase 6: T014 and T015 are [P] — different files.
- Within Phase 8: T019 and T020 are [P] — index.ts and index.test.ts (different files).
- Within Phase 10: T023 / T024 / T025 are [P] — package.json, CHANGELOG.md, README.md (different files).
- Constitutional gates (T026 / T027 / T028 / T029) run sequentially because they share the build output.

---

## Parallel Example: User Story 1 (Phase 4)

Once T002 / T003 / T005 / T006 / T007 land, the handler tests (T008 / T009 / T010) can be drafted in parallel by different contributors (or sequentially by one — the test file is a single shared resource). The handler implementation itself (T005–T007) is strictly sequential because it edits the same function in the same file.

```text
# Sequential within handler.ts:
T005 Implement inferType / serialiseValue / parseFileTSV helpers
T006 Specific+path branch of executeWriteProperty
T007 Specific+file branch of executeWriteProperty

# Parallel within handler.test.ts (test groups can be drafted by different contributors):
T008 [P] Specific+path happy-path tests (12 cases)
T009 [P] Specific+file branch tests (2 cases)
T010 [P] Cross-cutting argv-passthrough tests (5 cases)
```

---

## Implementation Strategy

### MVP First (US1 only — specific-mode write)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (schemas).
3. Complete Phase 3: US3 validation tests (covered by T004 — the schema test pass also gates US3).
4. Complete Phase 4: US1 implementation + tests.
5. **STOP and VALIDATE**: run `npm test` for the write_property module only. The MVP slice ships once T019 / T020 / T021 land for the basic specific-mode path.
6. **Deploy/demo**: agents can now do `write_property({ target_mode: "specific", vault, path|file, name, value, type? })` end-to-end.

### Incremental Delivery

1. Setup + Foundational → schemas in place.
2. US3 validation tests → boundary safety verified.
3. US1 specific-mode → MVP ships.
4. US2 active-mode → target-mode parity with the other typed tools.
5. US4 docs → discoverability for operators.
6. US5 empty-list → edge case lands.
7. Polish + T0 probe → release-ready.

### Single-developer strategy

This feature is small enough (~205 LOC source, ~1,080 LOC test, ~270 LOC docs) that one developer carries the full task list in sequence. The dependency graph is essentially linear within `handler.ts` (T005 → T006 → T007 → T011 → T012); test files allow parallel drafting between contributors but in a one-developer scenario they're written in the same flow as the handler edits they cover.

---

## Notes

- **[P] marker discipline**: only tasks that edit DIFFERENT files OR write fresh code without depending on incomplete tasks earn `[P]`. Test files (`schema.test.ts`, `handler.test.ts`, `index.test.ts`) are SHARED resources — within a single test file, test groups are logically independent but co-edit the same file; `[P]` is granted only when contributors will not conflict.
- **Story label discipline**: every Phase 3–7 task carries the relevant `[US#]` label. Phase 1 / 2 / 8 / 9 / 10 tasks do NOT carry story labels (they're cross-cutting).
- **Each user story should be independently completable and testable**: US3 (validation) is fully covered by T004 + schemas (T002 / T003). US1 (specific-mode) ships once T005–T010 + T019 / T020 / T021 land. US2 (active mode) layers on T011–T013. US4 (docs) is just T014 / T015. US5 (empty list) is T016 / T017.
- **Constitutional gates**: T026 (lint) / T027 (typecheck) / T028 (build) / T029 (vitest with coverage floor) run after every story checkpoint AND once more at the very end. Coverage threshold ratchet via one-line visible edit at [vitest.config.ts:20](../../vitest.config.ts#L20) only if the aggregate moved.
- **Plan-stage probe residue**: the user must manually revert the `mode: auto` line from `TestVault/Fixtures/BI-038/tc-mojibake-fbp.md` before running T030's S-18 manual scenario (active mode would otherwise write to the wrong fixture again).
- **Test scope reminder** (from auto-memory): this repo covers vitest unit tests only; manual integration probes are reported in `research.md` / `quickstart.md` rather than scaffolded as `TC-*` test cases.
- **Verify tests fail before implementing**: vitest-style; write the test first (RED), watch it fail (the spawn-stub assertions, the response-shape assertions), then write the source change to flip it green.
- **Commit after each logical group**: T002+T003 land together (schema); T004 lands separately (US3 validation tests); T005+T006+T008+T009+T010 land together (US1 MVP slice); T007+T009 land for specific+file; T011+T012+T013 land together (US2); T014+T015 land together (US4); T016+T017 land together (US5); T018+T019+T020+T021 land together (registration); T022 lands separately (T0 probe diagnostic); T023+T024+T025 + T026..T030 land together (polish).
- **Stop at any checkpoint**: every user story phase ends at a checkpoint where the story is independently testable. Stop there to validate before moving to the next.
- **Avoid**: vague tasks (no file path), same-file conflicts in `[P]` tasks, cross-story dependencies that break the MVP slice's independence.

---

## Task count summary

- **Phase 1 (Setup)**: 1 task (T001)
- **Phase 2 (Foundational)**: 2 tasks (T002, T003)
- **Phase 3 (US3 validation)**: 1 task (T004)
- **Phase 4 (US1 specific-mode)**: 6 tasks (T005–T010)
- **Phase 5 (US2 active mode)**: 3 tasks (T011–T013)
- **Phase 6 (US4 docs)**: 2 tasks (T014, T015)
- **Phase 7 (US5 empty list)**: 2 tasks (T016, T017)
- **Phase 8 (Registration + error-path tests)**: 4 tasks (T018–T021)
- **Phase 9 (T0 live-CLI probe)**: 1 task (T022)
- **Phase 10 (Polish)**: 8 tasks (T023–T030)

**Total: 30 tasks.** Tests are co-merged with implementation per Constitution II. Format conforms to the strict checklist convention: `- [ ] TXXX [P?] [USx?] description with file path`.
