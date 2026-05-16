---

description: "Dependency-ordered task list for BI-034 Fix Unicode Lookups"
---

# Tasks: Fix Unicode Lookups

**Input**: Design documents at [specs/034-fix-unicode-lookups/](.)
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/README.md](contracts/README.md), [quickstart.md](quickstart.md)

**Tests**: MANDATORY per Constitution Principle II (Public Surface Test Coverage — NON-NEGOTIABLE). Every modified tool ships at least one happy-path + one non-ASCII boundary test in the same change set, co-located as `*.test.ts`.

**Organization**: Tasks are grouped by user story. The plan broadens fix scope from the spec's 3 named tools to a 7-tool cohort sharing the identical atob+base64 defect ([research.md §3](research.md)). The 3 user stories from spec.md (US1 read_heading P1, US2 read_property P2, US3 find_by_property P3) drive Phases 3-5. The 4 extended-cohort tools (paths, links, tag, smart_connections_similar, smart_connections_query) are NOT named in any user story but inherit the same fix; they live in Phase 6 (Extended Cohort) as cross-cutting per ADR-004's centralised-adapter discipline.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1, US2, US3 for user-story-phase tasks; absent for Setup / Foundational / Extended-Cohort / Polish

## Path Conventions

Single-project layout under [src/](../../src/). Tests are co-located with their source per Principle II (`src/foo.ts` → `src/foo.test.ts`).

---

## Phase 1: Setup — T0 fixture pre-staging

**Purpose**: Stage the non-ASCII vault fixtures the live-CLI T0 probes (Phase 7) will consume. Fixtures live under `…\TestVault-Obsidian-CLI-MCP\Sandbox\unicode\` per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md). Fixtures shipped under BI-038 (em-dash H1 at `Fixtures/BI-038/tc-108-roundtrip-5kb.md` and frontmatter `unicode_marker: "café — naïve"` at `Fixtures/BI-038/tc-mojibake-fbp.md`) are re-used; this phase stages only the 4 NEW fixtures the existing cohort doesn't already cover.

- [ ] T001 [P] Stage fixture for read_property non-ASCII KEY at `<TestVault>/Sandbox/unicode/non-ascii-key.md` with frontmatter `café_key: value-here` and `title: non-ASCII key probe`
- [ ] T002 [P] Stage fixture for paths non-ASCII folder: create directory `<TestVault>/Sandbox/unicode/cafés/` and inner note `<TestVault>/Sandbox/unicode/cafés/inner-note.md`
- [ ] T003 [P] Stage fixtures for links non-ASCII wikilink: `<TestVault>/Sandbox/unicode/café-target.md` (empty body) and `<TestVault>/Sandbox/unicode/links-from.md` (body contains `[[café-target]]`)
- [ ] T004 [P] Stage fixture for tag non-ASCII tag at `<TestVault>/Sandbox/unicode/tagged.md` with frontmatter `tags: [café-tag]`
- [ ] T005 Record fixture-cleanup checklist in this task block (per `.memory/test-execution-instructions.md` Sandbox convention) — fixtures from T001-T004 are removed after Phase 7 probes complete; do NOT touch the pre-existing `Fixtures/BI-038/` notes

**Checkpoint**: All 4 new fixtures present in `<TestVault>/Sandbox/unicode/`; BI-038 fixtures left untouched.

---

## Phase 2: Foundational — shared decoder + compose helper

**Purpose**: Build the centralised decoder snippet and compose helper that every user story phase will consume. **No user story or extended-cohort task can begin until this phase is complete.**

**Locus**: [src/tools/_shared.ts](../../src/tools/_shared.ts) (existing module, gains two exports) + [src/tools/_shared.test.ts](../../src/tools/_shared.test.ts) (existing module, gains two test groups).

- [ ] T006 Add `B64_PAYLOAD_DECODE_EXPR` text constant to `src/tools/_shared.ts` — the V8-eval-side decode expression `new TextDecoder("utf-8").decode(Uint8Array.from(atob('__PAYLOAD_B64__'),c=>c.charCodeAt(0)))` per [research.md §4.2](research.md), with `Original — no upstream` header preserved and an inline comment citing the spec branch
- [ ] T007 Add `composeEvalCode(template: string, payload: unknown): string` helper to `src/tools/_shared.ts` per [research.md §4.3](research.md) — performs `JSON.stringify` → `Buffer.from(payloadJson, "utf-8").toString("base64")` → `template.replace("__PAYLOAD_B64__", payloadB64)` and returns the rendered code string; signature `payload: unknown` is correct (callers pass already-shaped objects)
- [ ] T008 [P] Add unit tests for `B64_PAYLOAD_DECODE_EXPR` constant in `src/tools/_shared.test.ts` — at minimum: (a) the constant is a non-empty string, (b) the constant contains the literal `__PAYLOAD_B64__` placeholder so substitution works, (c) the constant does NOT contain `JSON.parse(atob(` (the broken expression) — to catch future regression
- [ ] T009 [P] Add unit tests for `composeEvalCode` in `src/tools/_shared.test.ts` — happy path: returns a string with the base64-encoded payload substituted into the placeholder; non-ASCII payload: an em-dash / accented-letter / CJK / emoji payload round-trips correctly when the returned code is evaluated in a V8 sandbox (or a Node `vm` context); ASCII payload: unchanged behaviour; rejects template that lacks the placeholder

**Checkpoint**: `_shared.ts` exports the decoder constant and the compose helper; `_shared.test.ts` covers both; `npm run typecheck && npm run lint && npm run test src/tools/_shared.test.ts` is clean.

---

## Phase 3: User Story 1 — read_heading non-ASCII (Priority: P1) 🎯 MVP

**Goal**: Resolve `read_heading` lookups whose heading path contains non-ASCII characters (em-dash, accented letter, CJK, emoji) — the most-exercised non-ASCII lookup case in real-world vault content and the case this project's own working notes surface immediately (every heading title here uses an em-dash separator).

**Independent Test**: Place a note in the test vault whose heading title contains an em-dash. Call `read_heading` with that exact heading text in the path. The response body is the section's content rather than the `HEADING_NOT_FOUND` envelope. A separate call with a pure-ASCII heading path continues to succeed. Covered by Probe 1 in [quickstart.md](quickstart.md).

### Tests for User Story 1

> Write these tests FIRST; verify they FAIL pre-fix (against current `_template.ts`) before applying the fix.

- [ ] T010 [P] [US1] Add non-ASCII heading-path test cases to `src/tools/read_heading/handler.test.ts` covering: (a) em-dash in single-segment heading, (b) accented letter in single-segment heading, (c) CJK character in single-segment heading, (d) emoji in single-segment heading, (e) nested path mixing ASCII-only segments with one non-ASCII segment. Each case mocks `invokeCli` to return the eval response that the FIXED template would produce; assertion is that the handler returns `{ content: "<expected body>" }`. The TEST verifies the handler-side wire shape — the actual template-eval correctness is verified at T012.

### Implementation for User Story 1

- [ ] T011 [US1] Update `src/tools/read_heading/_template.ts` — replace the line `const a=JSON.parse(atob('__PAYLOAD_B64__'));` with the UTF-8-safe decode using the shared expression: substitute `${B64_PAYLOAD_DECODE_EXPR}` (or expand inline if the template-literal approach proves awkward; see [plan.md Structure Decision](plan.md)). Preserve the file's existing `Original — no upstream` header, the R7 metadataCache reuse, the R14 Setext defence-in-depth filter, and the FR-010 leading-line-terminator strip — only the decode line changes
- [ ] T012 [US1] Refactor `src/tools/read_heading/handler.ts` — replace the inline `payloadJson` / `payloadB64` / `JS_TEMPLATE.replace(...)` triplet with a single `composeEvalCode(JS_TEMPLATE, payload)` call. The `payload` shape is unchanged. Existing two-stage envelope parse, discriminator-mapped `UpstreamError`, and Setext defence-in-depth filter all unchanged.

**Checkpoint**: `npm run test src/tools/read_heading/` passes — non-ASCII boundary cases turn green, every pre-existing ASCII test stays green. US1's MVP is shippable on its own at this point.

---

## Phase 4: User Story 2 — read_property non-ASCII verification (Priority: P2)

**Goal**: Verify that `read_property` correctly matches a property whose name contains non-ASCII characters. Per [research.md §2](research.md), static analysis shows `read_property` is structurally unaffected by the atob+base64 defect — it uses the argv path and a JS-native `Object.prototype.hasOwnProperty.call(parsedA, input.name)` comparison on two correctly-UTF-8-decoded strings. The user story still earns a verification test rather than being silently dropped, so a future regression in the unaffected path would still be caught.

**Independent Test**: Place a note in the test vault whose frontmatter contains a non-ASCII property key. Call `read_property` with that exact key as the `name` input. The response carries the property's value and resolved type. Covered by Probe 3 in [quickstart.md](quickstart.md). **Predicted outcome: PASS without any production code change.**

### Tests for User Story 2

- [ ] T013 [P] [US2] Add non-ASCII property-name verification test to `src/tools/read_property/handler.test.ts`: stub `invokeCli` so Call A returns JSON with a non-ASCII key (e.g. `{"café_key":"value-here"}`) and Call B returns the matching properties metadata; call `executeReadProperty` with `input.name: "café_key"`; assert the return is `{ value: "value-here", type: "text" }` rather than the `{ value: null, type: "unknown" }` absent-property sentinel. Also add an em-dash key variant and a CJK key variant for class coverage. **If this test FAILS unexpectedly**, halt and escalate per [research.md §2.3](research.md) — `read_property` has a non-atob Unicode defect path and the BI scope expands.

### Implementation for User Story 2

(Intentionally empty — no production code change. See research.md §2.3 for rationale.)

**Checkpoint**: `npm run test src/tools/read_property/` passes. If T013 unexpectedly fails, STOP and reopen investigation per the escalation path; do not proceed to Phase 5 with an undiagnosed defect in this tool.

---

## Phase 5: User Story 3 — find_by_property non-ASCII (Priority: P3)

**Goal**: Resolve `find_by_property` lookups whose value contains non-ASCII characters. Also extract the inlined JS template to a sibling `_template.ts` so the cohort layout becomes uniform per Principle I ([research.md §4.4](research.md)).

**Independent Test**: Place a note in the test vault whose frontmatter property carries a value containing non-ASCII characters (the existing `Fixtures/BI-038/tc-mojibake-fbp.md` with `unicode_marker: "café — naïve"` suffices). Call `find_by_property` with the same exact value text. The response includes that note's path in `paths` and `count == paths.length`. Covered by Probe 2 in [quickstart.md](quickstart.md).

### Tests for User Story 3

- [ ] T014 [P] [US3] Add non-ASCII value-match test cases to `src/tools/find_by_property/handler.test.ts` covering: (a) em-dash + accented letter (`"café — naïve"` against the BI-038 fixture shape), (b) CJK character value, (c) emoji value, (d) ASCII/non-ASCII interleaved value, (e) selectivity: when two notes share the same property name but one carries a non-ASCII value and the other an ASCII value, calling with the non-ASCII value MUST return only the non-ASCII note. Each case mocks `invokeCli` to return the eval response that the FIXED template would produce.

### Implementation for User Story 3

- [ ] T015 [US3] Extract `JS_TEMPLATE` from `src/tools/find_by_property/handler.ts` (lines 16-39) into a new `src/tools/find_by_property/_template.ts` per the cohort convention (matches `read_heading/_template.ts` etc.). The new file carries an `Original — no upstream` header summarising the eval-template's R6 anti-injection, R3 active/specific mode mapping, and array/scalar equality semantics. Export `JS_TEMPLATE` from the new file; import it back in `handler.ts`. No JS-template content change in this step — pure mechanical extraction.
- [ ] T016 [US3] Update `src/tools/find_by_property/_template.ts` (the newly-extracted file from T015) — replace the line `const a=JSON.parse(atob('__PAYLOAD_B64__'));` with the UTF-8-safe decode using the shared expression. Preserve the existing array-equality / scalar-equality / case-sensitive comparator logic — only the decode line changes.
- [ ] T017 [US3] Refactor `src/tools/find_by_property/handler.ts` — replace the inline `payloadJson` / `payloadB64` / `JS_TEMPLATE.replace(...)` triplet with a single `composeEvalCode(JS_TEMPLATE, payload)` call. Existing two-stage parse, count/paths invariant check, and target_mode mapping unchanged.

**Checkpoint**: `npm run test src/tools/find_by_property/` passes — non-ASCII selectivity case turns green, all existing ASCII / case-sensitivity / array-match tests stay green. US3 ships on its own at this point.

---

## Phase 6: Extended Cohort — paths, links, tag, smart_connections_* (cross-cutting; per Plan §3)

**Purpose**: Apply the same one-line decoder fix to the 4 atob+base64 cohort tools NOT named in any user story. Each tool earns its own Principle-II non-ASCII boundary test in the same change set. Skipping these would leave the cohort partially fixed and create the partial-fix landmine [research.md §3.2](research.md) calls out.

**Note**: Tasks within each tool's sub-block run sequentially (template → handler → tests share a logical unit); tasks ACROSS different tools are parallelisable since the files don't overlap.

### paths

- [ ] T018 Update `src/tools/paths/_template.ts` — replace the `JSON.parse(atob(...))` decode line with the shared UTF-8-safe expression; everything below the decode line (folder/depth handling, file walk, sort order) byte-stable
- [ ] T019 Refactor `src/tools/paths/handler.ts` — switch to `composeEvalCode(JS_TEMPLATE, payload)`; payload shape unchanged
- [ ] T020 [P] Add non-ASCII folder-input test case to `src/tools/paths/handler.test.ts` (folder name containing accented letter or CJK character); mock invokeCli; assert response includes the expected child paths under that folder

### links

- [ ] T021 Update `src/tools/links/_template.ts` — replace the `JSON.parse(atob(...))` decode line with the shared UTF-8-safe expression
- [ ] T022 Refactor `src/tools/links/handler.ts` — switch to `composeEvalCode(JS_TEMPLATE, payload)`
- [ ] T023 [P] Add non-ASCII wikilink-target test case to `src/tools/links/handler.test.ts` (a fixture note whose body contains `[[café-target]]`); mock invokeCli; assert the response's links list resolves the non-ASCII target correctly

### tag

- [ ] T024 Update `src/tools/tag/_template.ts` — replace the `JSON.parse(atob(...))` decode line with the shared UTF-8-safe expression; existing `payload.query.toLowerCase()` semantics unchanged (the lowercase fold happens AFTER the decode, so the fix is sufficient)
- [ ] T025 Refactor `src/tools/tag/handler.ts` — switch to `composeEvalCode(JS_TEMPLATE, payload)`
- [ ] T026 [P] Add non-ASCII tag-query test case to `src/tools/tag/handler.test.ts` (e.g. `query: "café-tag"`); mock invokeCli; assert matching notes are returned

### smart_connections_similar

- [ ] T027 Update `src/tools/smart_connections_similar/_template.ts` — replace ONLY the `JSON.parse(atob(...))` decode line. Verify the three ADR-014 lifecycle-state branches (`SMART_CONNECTIONS_NOT_INSTALLED` / `_NOT_READY` / `SOURCE_NOT_INDEXED`) below the decode line are BYTE-IDENTICAL pre/post-fix. Diff the file before/after to confirm
- [ ] T028 Refactor `src/tools/smart_connections_similar/handler.ts` — switch to `composeEvalCode(JS_TEMPLATE, payload)`; payload shape unchanged; ADR-014 stage-order behaviour unchanged
- [ ] T029 [P] Add non-ASCII query-input test case to `src/tools/smart_connections_similar/handler.test.ts` — mock invokeCli to return a Smart Connections-shaped success envelope; assert the input payload's non-ASCII field round-trips correctly through `composeEvalCode` (assert on the rendered code string OR on the eval-response shape — whichever pattern the existing tests in this file use). NO live plugin probe ([research.md §6.2 + Complexity Tracking](plan.md))

### smart_connections_query

- [ ] T030 Update `src/tools/smart_connections_query/_template.ts` — replace ONLY the `JSON.parse(atob(...))` decode line. Same byte-identical-lifecycle-branches check as T027
- [ ] T031 Refactor `src/tools/smart_connections_query/handler.ts` — switch to `composeEvalCode(JS_TEMPLATE, payload)`
- [ ] T032 [P] Add non-ASCII query-input test case to `src/tools/smart_connections_query/handler.test.ts` analogous to T029. NO live plugin probe

**Checkpoint**: All 5 extended-cohort tools fixed; `npm run test src/tools/{paths,links,tag,smart_connections_similar,smart_connections_query}/` passes. The cohort is now uniformly UTF-8-safe.

---

## Phase 7: Polish — quality gates, registry-baseline byte-stability, live-CLI probes

**Purpose**: Project-wide gate verification + the live-CLI T0 probes that confirm the in-process tests' assumptions about the real `obsidian` binary on Windows hold.

- [ ] T033 Run the full constitutional quality-gate sequence — `npm run lint` (zero warnings), `npm run typecheck` (clean), `npm run build` (clean), `npm run test` (all suites pass + aggregate statements coverage threshold preserved). Record results in this task line on completion
- [ ] T034 Verify `src/tools/_register-baseline.json` is BYTE-IDENTICAL to its pre-BI state — run `git diff main -- src/tools/_register-baseline.json` and confirm zero changes. This enforces FR-007 + SC-005 (zero schema/description drift) per [contracts/README.md](contracts/README.md). If the file changes, STOP — a schema/description leaked and must be reverted before merge
- [ ] T035 Execute the 6 live-CLI T0 probes in [quickstart.md](quickstart.md) against `TestVault-Obsidian-CLI-MCP` per `.memory/test-execution-instructions.md`. Record per-probe pass/fail; on any C-stage ASCII regression failure, halt and roll back. Probe 7 (smart_connections_*) is SKIPPED per the plan's Complexity Tracking entry
- [ ] T036 Clean up the 4 new fixtures created in T001-T004 from `<TestVault>/Sandbox/unicode/`. Leave the pre-existing `Fixtures/BI-038/` notes intact. Verify `Sandbox/` matches its pre-T001 state (or remains empty if it was empty)
- [ ] T037 `/graphify --update` per the project's phase-boundary convention. Confirms no new error-class nodes outside `errors.ts` community (Principle IV streak preserved), no new dependency from a tool's handler.ts on the boot-time factories, and that the new `_shared.ts` exports land in the expected `tools` community rather than surprise community placement
- [ ] T038 Update [CHANGELOG.md](../../CHANGELOG.md) — add a `0.6.2` (PATCH; defect repair, no public-surface change) entry summarising the seven-tool atob+base64 fix and the verified-as-unaffected `read_property` case. Mirror the existing 0.6.1 / 0.6.0 entry style

**Checkpoint**: All gates green; registration baseline byte-stable; live-CLI probes confirm wire shape; graph audit clean; CHANGELOG reflects the patch release.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup — fixture pre-staging)**: No code dependencies. Can run concurrently with Phase 2 since they touch disjoint targets (filesystem fixtures vs source code).
- **Phase 2 (Foundational — shared decoder + helper)**: BLOCKS all subsequent phases. The shared exports `B64_PAYLOAD_DECODE_EXPR` and `composeEvalCode()` must exist before any tool can adopt them. **No US1/US2/US3 or extended-cohort task can begin until T006-T009 are complete.**
- **Phase 3 (US1 read_heading P1)**: Depends on Phase 2 completion. Independent of US2/US3/Extended-Cohort.
- **Phase 4 (US2 read_property P2)**: Depends on Phase 2 only in spirit (the test uses neither the new constant nor the helper; T013 is a pure verification test that mocks `invokeCli`). Can run in parallel with Phase 3 / Phase 5 / Phase 6.
- **Phase 5 (US3 find_by_property P3)**: Depends on Phase 2 completion. Independent of US1/US2/Extended-Cohort.
- **Phase 6 (Extended Cohort)**: Depends on Phase 2 completion. Each tool's sub-block (e.g. T018-T020 for paths) is independent of every other tool's sub-block — five parallel slices.
- **Phase 7 (Polish — gates + live probes)**: Depends on every preceding phase. T035 (live-CLI probes) additionally depends on Phase 1 fixtures (T001-T004) being staged.

### User Story Dependencies

- **US1 (P1 — read_heading)**: After Phase 2. Independent of US2/US3.
- **US2 (P2 — read_property)**: After Phase 2 (only because the project convention is to gate everything on the foundational step). Independent of US1/US3. **Predicted to pass without production code; if it fails unexpectedly, escalates per research.md §2.3.**
- **US3 (P3 — find_by_property)**: After Phase 2. Independent of US1/US2.

### Within Each User Story

- Tests (per Principle II) are written FIRST and verified to fail pre-fix.
- Template fix → handler refactor → tests turn green.
- Each user story produces a complete shippable increment.

### Parallel Opportunities

- **Phase 1**: T001-T004 are all `[P]` — four independent fixture stages can be created in any order or concurrently. T005 is the documentation block; sequential after T001-T004.
- **Phase 2**: T006 and T007 add separate exports to the same file (`_shared.ts`) — sequential. T008 and T009 are `[P]` (different test groups in `_shared.test.ts` if separated, or sequential within one file).
- **Phase 3-5**: Within each user story, the test task is `[P]` against the implementation tasks since the test mocks `invokeCli`. The two implementation tasks (`_template.ts` change + `handler.ts` refactor) are sequential because the handler imports from the template.
- **Phase 6**: All five tool sub-blocks (`paths`, `links`, `tag`, `smart_connections_similar`, `smart_connections_query`) are mutually independent — full five-way parallelism if staffed.
- **Phase 7**: T033 (gates) and T034 (baseline check) are sequential against T035 (live probes) because the live probes consume the built artefact. T037 (graphify) and T038 (CHANGELOG) are `[P]` against each other once T033 / T034 pass.

---

## Parallel Example: Extended Cohort (Phase 6)

```text
# Five tool sub-blocks can ship as five concurrent PRs (or five serial commits) — each is independent:
Task block A: T018 + T019 + T020 (paths)
Task block B: T021 + T022 + T023 (links)
Task block C: T024 + T025 + T026 (tag)
Task block D: T027 + T028 + T029 (smart_connections_similar)
Task block E: T030 + T031 + T032 (smart_connections_query)
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Complete Phase 1: Setup (fixtures, parallelisable)
2. Complete Phase 2: Foundational (T006-T009)
3. Complete Phase 3: US1 (T010-T012)
4. **STOP and VALIDATE**: run Probe 1 from [quickstart.md](quickstart.md) against the test vault.
5. If green: ship MVP — the project's own working notes' em-dash headings are now reachable.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → ship MVP.
3. US3 → second slice; the find_by_property non-ASCII case turns green.
4. US2 → verification test added; predicted-passing, no production change.
5. Extended Cohort → close out the remaining 4 atob-cohort tools and prevent the partial-fix landmine.
6. Polish → live probes, baseline check, graph update, CHANGELOG.

### Bundling

Project history pattern (BI-026, BI-028, BI-033) ships per-BI as one or two commits per phase boundary rather than per-task. The task IDs are reference labels — commits group multiple tasks under one logical change set. The /speckit-git-commit flow at phase boundaries lets the assistant decide the commit grouping; tasks.md does not prescribe commit boundaries.

---

## Notes

- `[P]` tasks operate on different files with no in-phase dependencies; safe for concurrent edit.
- Tests precede implementation per the Principle II + plan-stage discipline; verify the new non-ASCII test FAILS against the pre-fix `_template.ts` before applying the fix, then re-run after to confirm it turns green.
- Per `.memory/test-execution-instructions.md`, live-CLI probes use `TestVault-Obsidian-CLI-MCP` only; Sandbox-area fixtures are staged with unique-per-run names and cleaned up.
- Per `.memory/test-execution-instructions.md`, do NOT touch `Welcome.md` at the vault root. All new fixtures live under `Sandbox/unicode/`.
- Per [research.md §6.2](research.md), each `smart_connections_*/_template.ts` edit must be diffed before/after to confirm the ADR-014 lifecycle branches below the decode line are byte-identical. Failure to confirm constitutes an ADR-014 regression and blocks merge.
- Per [plan.md Complexity Tracking](plan.md), smart_connections_* live-CLI probes are deliberately skipped; unit tests are the verification gate for those two tools.
