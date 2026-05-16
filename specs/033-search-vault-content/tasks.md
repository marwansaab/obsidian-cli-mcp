---
description: "Task list for BI-033 search-vault-content implementation"
---

# Tasks: Search Vault Content (BI-033)

**Input**: Design documents from `/specs/033-search-vault-content/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED — co-located vitest cases ship in the same change as their surface per Constitution Principle II. ~60 cases total (~20 schema / ~35 handler / ~5 registration) per the data-model.md inventory. Test scope is unit-only (per project memory); integration / TC-XXX cases live in the user's external tracker.

**Organization**: Tasks grouped by user story (US1..US5 from spec.md). BI-033's five user stories share a single implementation module (`src/tools/search/`) — the per-story grouping primarily partitions TEST coverage; the handler and schema source code is largely shared. Implementation effort is dominantly foundational + US1 (default-mode happy path + zero-match sentinel + staged parse); US2 adds line-mode flatten + text cap; US3 adds folder normalisation; US4 adds the +1 probe / cap-clip / `truncated` flag; US5 adds the conditional `case` flag.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files OR independent test cases within the same handler.test.ts)
- **[Story]**: Which user story this task belongs to (US1..US5)
- File paths absolute from repo root

## Path Conventions

Single-project TypeScript layout. All new source under `src/tools/search/`; all new tests co-located in the same directory (Principle II). Docs at `docs/tools/search.md`. Registration edits in `src/server.ts` and `src/tools/_register.test.ts`. Baseline at `src/tools/_register-baseline.json`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No-op for BI-033 — repo already initialised; build pipeline, vitest config, eslint, prettier, tsconfig all in place. No new shared module is introduced (this BI is native-wrapper, NOT eval-driven; no `_eval-vault-closed-detection` consumption). This phase is intentionally empty.

(No tasks in Phase 1.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Module skeleton + input/output/wire schemas + handler scaffolding. MUST complete before any user story implementation tasks. All five user stories depend on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T001 [P] Create `src/tools/search/` directory.
- [ ] T002 Create `src/tools/search/schema.ts` — declare `searchInputSchema` (per data-model.md Input schema: `query` (min 1 max 1000 + post-trim refine), `folder?` (min 1), `limit?` (int 1..10000), `case_sensitive?`, `context_lines?`, `vault?`, `.strict()`); `searchDefaultOutputSchema` ({count, paths, truncated?}); `searchLineMatchSchema` ({path, line, text}); `searchLineOutputSchema` ({count, matches, truncated?}); `searchDefaultWireSchema` (`z.array(z.string().min(1))`); `searchContextWireMatchSchema`; `searchContextWireFileSchema`; `searchContextWireSchema`. Exported types via `z.infer`. Carry `// Original — no upstream.` header (Principle V).
- [ ] T003 Create `src/tools/search/schema.test.ts` — ~20 schema-level cases per data-model.md test inventory (Schema test list rows 1-20): happy paths × 7, reject empty/whitespace/oversize query × 3, accept-at-boundary (query exactly 1000 chars), reject non-positive / over-bound / non-integer limit × 3, accept-at-boundary (limit=1, limit=10000) × 2, reject unknown key (strict), and phrase-match preserves internal whitespace verbatim. Tests must FAIL before T002 lands (TDD order — in practice run T002+T003 as a pair).
- [ ] T004 Create `src/tools/search/handler.ts` — declare module-level constants (`TEXT_CAP = 500`, `ELLIPSIS = "…"`, `DEFAULT_CAP = 1000`, `ZERO_MATCH_SENTINEL = "No matches found."`), the `stripBoundarySlashes` helper, `searchHandler` factory function signature with `ExecuteDeps`-typed `invokeCli` dependency, and a stub body that throws `not implemented`. Import `UpstreamError` from project-wide `src/upstream-error/` (or wherever the existing typed tools import it from — verify path). Import all schema names from `./schema.js`. Carry `// Original — no upstream. search handler — two-subcommand router…` header per the data-model.md Handler shape excerpt.
- [ ] T005 Create `src/tools/search/index.ts` — `createSearchTool(deps: RegisterDeps)` factory returning the SDK `RegisteredTool` shape: `name: "search"`, `description: "<one-liner derived from spec.md Summary; under 200 chars>"`, `inputSchema: toMcpInputSchema(searchInputSchema)`, `handler: searchHandler(deps)`. Carry Original-no-upstream header. Look at `src/tools/tag/index.ts` for the canonical factory shape.

**Checkpoint**: Foundation ready — module skeleton compiles (`tsc --noEmit` clean), schemas parse, handler is a stub that throws "not implemented", index.ts wires schema + handler into a `RegisteredTool`.

---

## Phase 3: User Story 1 — Keyword to file paths (Priority: P1) 🎯 MVP

**Goal**: A caller supplies a non-empty `query`; the tool returns the count and vault-relative paths of every `.md` file containing that keyword.

**Independent Test**: Q-1 (CI happy-path mock) + Q-3 (zero-match sentinel) + T0-1 (live against TestVault with seeded `Sandbox/BI-033/single-line.md`). MVP is shippable when these pass.

### Tests for User Story 1

- [ ] T006 [P] [US1] Add to `src/tools/search/handler.test.ts` — Q-1 default-mode happy path: mock `invokeCli` returns `{stdout: '["a.md","b.md"]', stderr: "", exitCode: 0}`; assert handler returns `{count: 2, paths: ["a.md", "b.md"]}` and `invokeCli` called exactly once with `subcommand: "search"`, `parameters.format: "json"`, `parameters.query: "<input>"`, `parameters.limit: "1001"` (no input.limit → DEFAULT_CAP + 1).
- [ ] T007 [P] [US1] Add to `src/tools/search/handler.test.ts` — Q-3 zero-match sentinel default mode: mock stdout `"\nNo matches found.\n"`, assert returns `{count: 0, paths: []}` — never throws; no `truncated`; output-schema validation passes.
- [ ] T008 [P] [US1] Add to `src/tools/search/handler.test.ts` — Q-18 deterministic sort default mode: mock CLI returns `["z.md","a.md","m.md"]`; assert response `paths === ["a.md", "m.md", "z.md"]`.
- [ ] T009 [P] [US1] Add to `src/tools/search/handler.test.ts` — Q-21 / Q-22 / Q-24 validation-error-before-spawn invariants (I-1): assert `invokeCli` spy NEVER called for: empty query, whitespace-only query, query > 1000 chars, limit ≤ 0, limit > 10000, non-integer limit, unknown input key. Five sub-cases.
- [ ] T010 [P] [US1] Add to `src/tools/search/handler.test.ts` — Q-25 unknown-vault propagation (I-7): mock `invokeCli` THROWS `UpstreamError("CLI_REPORTED_ERROR", {details: {code: "VAULT_NOT_FOUND"}})`; assert handler re-raises unchanged (no swallow, no transformation).
- [ ] T011 [P] [US1] Add to `src/tools/search/handler.test.ts` — Q-32 JSON-parse failure: mock stdout `"not json {{{"`, assert throws `UpstreamError("CLI_REPORTED_ERROR", {details: {stage: "json-parse"}})`. Also verify the original parse error is preserved in `cause`.
- [ ] T012 [P] [US1] Add to `src/tools/search/handler.test.ts` — Q-33 wire-schema mismatch: mock stdout `'[null]'`, assert throws `UpstreamError("CLI_REPORTED_ERROR", {details: {stage: "wire-parse"}})`.
- [ ] T013 [P] [US1] Add to `src/tools/search/handler.test.ts` — Q-30 defensive `.md` filter default mode (I-9): mock CLI returns `["a.md", "b.canvas", "c.md"]`; assert response `paths === ["a.md", "c.md"]` (canvas filtered out); `count === 2`.
- [ ] T014 [P] [US1] Add to `src/tools/search/handler.test.ts` — Q-34 response-key-set assertion (I-14): assert `Object.keys(response).sort()` is exactly `["count", "paths"]` for non-truncated default; `["count", "paths", "truncated"]` for truncated. NO `vault` / `query` / `folder` / `limit` / etc. in any response shape.
- [ ] T015 [P] [US1] Add to `src/tools/search/handler.test.ts` — Q-35 byte-identical repeated call (I-13): same input + same mocked CLI return → `JSON.stringify(r1) === JSON.stringify(r2)`.
- [ ] T016 [P] [US1] Add to `src/tools/search/handler.test.ts` — vault flow-through (I-4): assert `invokeCli` `parameters.vault` is ABSENT when input.vault undefined; equals `"X"` verbatim when input.vault === "X".

### Implementation for User Story 1

- [ ] T017 [US1] Implement `searchHandler` body in `src/tools/search/handler.ts` for the DEFAULT-MODE path (no `context_lines`): zod parse → `appliedCap = input.limit ?? DEFAULT_CAP` → assemble `parameters` per I-4 (`query`, `format: "json"`, `limit: String(appliedCap + 1)`, conditional `vault`) → single `deps.invokeCli({subcommand: "search", parameters})` → stage-0 zero-match sentinel check → JSON.parse with try/catch throwing `UpstreamError(CLI_REPORTED_ERROR, {cause, details: {stage: "json-parse"}})` → `searchDefaultWireSchema.parse(...)` with stage failure throwing `UpstreamError(..., {details: {stage: "wire-parse"}})` → `.md`-only defensive filter (I-9 step 1) → `Array.prototype.sort()` → assemble `{count, paths}` (truncated handling deferred to US4) → `searchDefaultOutputSchema.parse(...)` at boundary (I-15) → return.

**Checkpoint**: US1 fully functional. MVP shippable when T006-T016 pass. Handler returns `{count, paths}` for valid inputs; throws structured `UpstreamError` for every failure mode; never silent-fails. Folder filter / limit / case-sensitivity / line mode are still no-op (deferred to US2-US5).

---

## Phase 4: User Story 2 — Line-level context mode (Priority: P2)

**Goal**: A caller enables `context_lines: true` and receives `{path, line, text}` entries for every matching line; long lines truncated to 500 chars + `…` marker.

**Independent Test**: Q-2 (CI happy-path mock) + Q-4 (line-mode zero-match) + Q-26 (drop empty matches) + T0-2 (live against TestVault).

### Tests for User Story 2

- [ ] T018 [P] [US2] Add to `src/tools/search/handler.test.ts` — Q-2 line-mode happy path (I-3 + I-4 + I-10): mock CLI returns `[{"file":"a.md","matches":[{"line":3,"text":"foo bar"}]}]`; input `{query: "foo", context_lines: true}`; assert subcommand `"search:context"`, `parameters.limit: "1000"` (no input.limit → applied cap, NOT +1 in line mode per R3 conservative), response `{count: 1, matches: [{path: "a.md", line: 3, text: "foo bar"}]}`.
- [ ] T019 [P] [US2] Add to `src/tools/search/handler.test.ts` — Q-4 zero-match line mode: mock stdout `"\nNo matches found.\n"`, `context_lines: true`, assert returns `{count: 0, matches: []}`.
- [ ] T020 [P] [US2] Add to `src/tools/search/handler.test.ts` — Q-26 drop empty matches (R9): mock CLI returns `[{"file":"a.md","matches":[]},{"file":"b.md","matches":[{"line":1,"text":"y"}]}]`; assert response `{count: 1, matches: [{path:"b.md", line:1, text:"y"}]}` — `a.md` dropped.
- [ ] T021 [P] [US2] Add to `src/tools/search/handler.test.ts` — Q-19 line-mode sort path-then-line (I-10 step 5 + FR-019): mock CLI returns `[{"file":"z.md","matches":[{"line":1,"text":"x"}]},{"file":"a.md","matches":[{"line":5,"text":"y"},{"line":2,"text":"z"}]}]`; assert response `matches` is `[{a.md,2,"z"},{a.md,5,"y"},{z.md,1,"x"}]`.
- [ ] T022 [P] [US2] Add to `src/tools/search/handler.test.ts` — Q-27 text cap at exactly 500 (I-12): mock CLI with `text = "x".repeat(500)`, `context_lines: true`; assert `matches[0].text === "x".repeat(500)` (no ellipsis appended).
- [ ] T023 [P] [US2] Add to `src/tools/search/handler.test.ts` — Q-28 text cap at 501 → 501-char output (I-12): mock CLI with `text = "x".repeat(501)`; assert `matches[0].text === "x".repeat(500) + "…"` (final length 501 — first 500 raw + the single U+2026 character).
- [ ] T024 [P] [US2] Add to `src/tools/search/handler.test.ts` — Q-29 text cap at 1000 (I-12): mock CLI with `text = "x".repeat(1000)`; assert `matches[0].text === "x".repeat(500) + "…"`.
- [ ] T025 [P] [US2] Add to `src/tools/search/handler.test.ts` — Q-31 line-mode defensive `.md` filter at FILE level (I-10 step 1): mock CLI returns `[{"file":"a.md","matches":[{"line":1,"text":"x"}]},{"file":"b.canvas","matches":[{"line":1,"text":"y"}]}]`; assert response `matches` contains ONLY the `a.md` row (canvas filtered before flatten).
- [ ] T026 [P] [US2] Add to `src/tools/search/handler.test.ts` — line-mode JSON-parse failure routes via wire-schema (`searchContextWireSchema`): mock stdout `'[{"file":"a.md","matches":"not-array"}]'`; assert `UpstreamError(stage: "wire-parse")`. Confirms wire-schema is per-mode (I-8).
- [ ] T027 [P] [US2] Add to `src/tools/search/handler.test.ts` — flatten multi-match: mock CLI returns `[{"file":"a.md","matches":[{"line":1,"text":"x"},{"line":5,"text":"y"}]}]`; assert response has 2 entries `[{a.md,1,"x"},{a.md,5,"y"}]`.

### Implementation for User Story 2

- [ ] T028 [US2] Extend `searchHandler` in `src/tools/search/handler.ts` with the LINE-MODE branch (`input.context_lines === true`): subcommand switches to `"search:context"`; `parameters.limit = String(appliedCap)` (NOT +1 — R3 line-mode conservative); zero-match sentinel returns `{count: 0, matches: []}` shape; JSON.parse + `searchContextWireSchema.parse(...)`; file-level `.md` filter (I-10 step 1); flatten via `flatMap` (I-10 step 2) — for each `{file, matches}` entry, emit `{path: file, line: m.line, text: capLine(m.text)}` where `capLine = text.length <= TEXT_CAP ? text : text.slice(0, TEXT_CAP) + ELLIPSIS`; drop entries with `matches: []` naturally (flatMap yields zero rows from empty matches arrays); sort by `path` asc then `line` asc; `searchLineOutputSchema.parse(...)` boundary check; return. Truncation handling stub — deferred to US4 (T039 fills it in).

**Checkpoint**: US2 fully functional. Line mode flattens, drops empty matches, caps text at 500 chars, sorts deterministically. Q-2 / Q-4 / Q-26..Q-29 / Q-31 pass.

---

## Phase 5: User Story 3 — Folder scoping (Priority: P2)

**Goal**: A caller supplies `folder` (e.g. `Projects/`); only files under that subtree are returned. Leading/trailing `/` normalised wrapper-side.

**Independent Test**: Q-5 (CI mock + folder parameter assertion) + Q-6 (normalisation) + Q-7 (`/` alone → no path) + T0-5 (live nested path).

### Tests for User Story 3

- [ ] T029 [P] [US3] Add to `src/tools/search/handler.test.ts` — Q-5 folder forwards: input `{query: "foo", folder: "Projects"}`; assert `invokeCli` `parameters.path === "Projects"`.
- [ ] T030 [P] [US3] Add to `src/tools/search/handler.test.ts` — Q-6 folder normalisation (I-5): input `{query: "foo", folder: "/Projects/"}`; assert `parameters.path === "Projects"`. Also test `Projects/`, `/Projects`, `Projects` all produce same `path: "Projects"`. Four sub-cases.
- [ ] T031 [P] [US3] Add to `src/tools/search/handler.test.ts` — Q-7 folder is `/` alone: input `{query: "foo", folder: "/"}`; assert `parameters.path` is ABSENT (empty post-strip, FR-006 / I-5).
- [ ] T032 [P] [US3] Add to `src/tools/search/handler.test.ts` — `folder` undefined → `parameters.path` is ABSENT (default; no folder restriction).
- [ ] T033 [P] [US3] Add to `src/tools/search/handler.test.ts` — folder propagates to line mode too: input `{query: "foo", folder: "Projects", context_lines: true}`; assert subcommand `"search:context"` AND `parameters.path === "Projects"`.

### Implementation for User Story 3

- [ ] T034 [US3] Verify `stripBoundarySlashes` from T004 strips AT MOST one leading `/` AND at most one trailing `/` (I-5). The wrapper helper was declared in Phase 2 but its semantics must be confirmed against I-5: input `//Projects//` → output `/Projects/` (only ONE level stripped on each side — defensive against accidental double-strip). Add `if (normalised.length > 0) params.path = normalised` to the handler parameter assembly (I-4 conditional inclusion). If T031 (folder=`/`) fails, the empty-post-strip omission is the bug to fix.

**Checkpoint**: US3 fully functional. `folder` parameter forwards as `path=<normalised>`. Q-5 / Q-6 / Q-7 pass. T0-5 ready to run post-implementation.

---

## Phase 6: User Story 4 — Result cap with `truncated` flag (Priority: P3)

**Goal**: A caller supplies `limit` (or accepts the implicit 1000 cap); at most that many entries appear in the response; `truncated: true` signals the underlying set was larger.

**Independent Test**: Q-8 (limit forwards +1 in default), Q-9 (limit forwards as-is in line mode), Q-10 / Q-11 / Q-12 (cap-clip detection), Q-13 / Q-14 (line-mode flat-exceeds + file-cap-fired conservative cases), Q-20 (post-cap output budget) + manual: probe a vault with > 1000 hits and verify `truncated: true`.

### Tests for User Story 4

- [ ] T035 [P] [US4] Add to `src/tools/search/handler.test.ts` — Q-8 limit forwards +1 in default: input `{query: "foo", limit: 50}`; assert `parameters.limit === "51"` (R3 probe).
- [ ] T036 [P] [US4] Add to `src/tools/search/handler.test.ts` — Q-9 limit forwards as-is in line mode: input `{query: "foo", limit: 50, context_lines: true}`; assert `parameters.limit === "50"`.
- [ ] T037 [P] [US4] Add to `src/tools/search/handler.test.ts` — Q-10 default-mode cap-clip detection: mock CLI returns 51 paths; input `limit: 50`; assert response `{count: 50, paths: [...50...], truncated: true}`; final entry of the 51 was trimmed.
- [ ] T038 [P] [US4] Add to `src/tools/search/handler.test.ts` — Q-11 default-mode no-truncation when underlying ≤ cap: mock CLI returns 49 paths; input `limit: 50`; assert response `{count: 49, paths: [...]}`; NO `truncated` key in the response object.
- [ ] T039 [P] [US4] Add to `src/tools/search/handler.test.ts` — Q-12 implicit 1000 cap when input.limit absent: mock CLI returns 1001 paths; input has no `limit`; assert `parameters.limit === "1001"`, response `{count: 1000, paths: [...1000...], truncated: true}`.
- [ ] T040 [P] [US4] Add to `src/tools/search/handler.test.ts` — Q-13 line-mode flat-exceeds-cap: mock CLI returns 1 file with 1500 match rows; input `context_lines: true` no `limit`; assert response `{count: 1000, matches: [...1000...], truncated: true}`.
- [ ] T041 [P] [US4] Add to `src/tools/search/handler.test.ts` — Q-14 line-mode CLI-file-cap-fired conservative: mock CLI returns 1000 files each with 1 match (mdOnly.length === appliedCap); input `context_lines: true` no `limit`; assert response `truncated: true` (conservative — R3 file-cap signal), `count: 1000`.
- [ ] T042 [P] [US4] Add to `src/tools/search/handler.test.ts` — line-mode no-truncation when neither condition fires: mock CLI returns 5 files × 2 matches each = 10 lines; input `context_lines: true` no `limit`; assert `count: 10`, NO `truncated` (10 < 1000 AND 5 < 1000).
- [ ] T043 [P] [US4] Add to `src/tools/search/handler.test.ts` — I-11 `truncated` encoding: when truncation fires, value MUST be literal `true`; when it doesn't, the field MUST be absent (not `false`). Assert via `Object.hasOwn(response, "truncated")` for both branches.

### Implementation for User Story 4

- [ ] T044 [US4] Update DEFAULT-MODE branch of `searchHandler`: after the `.md` filter, check `if (mdOnly.length === appliedCap + 1) { truncated = true; trimmed = mdOnly.slice(0, appliedCap); } else { trimmed = mdOnly; }`; sort the trimmed array; assemble response object with conditional spread `...(truncated ? {truncated: true as const} : {})`. The conditional spread enforces I-11 (field absent when false). Output-schema validates at boundary.
- [ ] T045 [US4] Update LINE-MODE branch of `searchHandler` (extends T028): after the file-level `.md` filter and BEFORE the flatten, compute `const cliFileCapFired = mdOnly.length === appliedCap`. After flatten, compute `const flatExceedsCap = flat.length > appliedCap`. Set `truncated = cliFileCapFired || flatExceedsCap`. If `flatExceedsCap`, `trimmed = flat.slice(0, appliedCap)`; else `trimmed = flat`. Sort the trimmed array. Conditional-spread `truncated` per I-11. Output-schema validates at boundary.

**Checkpoint**: US4 fully functional. `limit` + `truncated` flag work in both modes. Q-8 to Q-14 + Q-43 pass.

---

## Phase 7: User Story 5 — Case sensitivity toggle (Priority: P3)

**Goal**: A caller supplies `case_sensitive: true` to opt into exact-case matching; default is case-insensitive.

**Independent Test**: Q-15 (case flag added) + Q-16 (case flag omitted) + T0-3 (live verification of CLI default).

### Tests for User Story 5

- [ ] T046 [P] [US5] Add to `src/tools/search/handler.test.ts` — Q-15 `case_sensitive: true` adds the `case` presence flag: input `{query: "Foo", case_sensitive: true}`; assert `parameters.case === true`.
- [ ] T047 [P] [US5] Add to `src/tools/search/handler.test.ts` — Q-16 `case_sensitive` absent OR `false` omits the `case` flag: input `{query: "Foo"}` AND input `{query: "Foo", case_sensitive: false}`; assert `parameters.case` is ABSENT in both. Two sub-cases.
- [ ] T048 [P] [US5] Add to `src/tools/search/handler.test.ts` — `case` flag also propagates to line mode: input `{query: "Foo", case_sensitive: true, context_lines: true}`; assert subcommand `"search:context"` AND `parameters.case === true`.

### Implementation for User Story 5

- [ ] T049 [US5] Add to `searchHandler` parameter assembly: `if (input.case_sensitive === true) params.case = true;` — presence-only boolean per the upstream CLI convention. Must come AFTER `limit` assignment in the parameter-builder so `parameters` reflects assembly order. The handler's `invokeCli` invocation already includes whatever `parameters` contains, so this is a single-line addition.

**Checkpoint**: US5 fully functional. All five user stories now satisfied. Q-15 / Q-16 / Q-48 pass.

---

## Phase 8: Registration + Tool Wire-up

**Purpose**: Register the new tool with the MCP server, regenerate the registration baseline, write the registration tests.

- [ ] T050 [P] Add to `src/tools/search/index.test.ts` — Q-36 tool name: `createSearchTool(mockDeps).name === "search"`.
- [ ] T051 [P] Add to `src/tools/search/index.test.ts` — Q-37 description non-empty: `.description.length > 0`.
- [ ] T052 [P] Add to `src/tools/search/index.test.ts` — Q-38 inputSchema is zod-derived JSON Schema: round-trip via `toMcpInputSchema(searchInputSchema)` matches the published `.inputSchema`.
- [ ] T053 [P] Add to `src/tools/search/index.test.ts` — Q-39 handler is invokable with mocked deps (smoke test).
- [ ] T054 [P] Add to `src/tools/search/index.test.ts` — Q-40 baseline reference test (or auto-derived per BI-031 fixture — confirm at implement time by inspecting `_register.test.ts`).
- [ ] T055 Edit `src/server.ts` — add `import { createSearchTool } from "./tools/search/index.js";` (alphabetical insertion between `rename` and `set_property`) AND add `createSearchTool(deps)` to the tools-array entry (same alphabetical position). Verify `tsc --noEmit` clean after edit.
- [ ] T056 Run `npm run baseline:write` to regenerate `src/tools/_register-baseline.json` with the new `search` tool entry. Verify the diff is ADDITIVE only (one new entry, no fingerprint drift on existing tools). Run `npm run test -- _register` to confirm baseline test passes.

**Checkpoint**: Tool registered with the MCP server. Baseline rolled forward. `_register.test.ts` passes. Registration tests T050-T054 pass.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, version bump, CHANGELOG entry, T0 live verification, cleanup.

- [ ] T057 [P] Create `docs/tools/search.md` per FR-020 / FR-014 contract: full input contract (table from contracts/search-input.contract.md § Input field policy); both output shapes with field annotations; complete error roster (13 rows from contracts/search-input.contract.md § Error response roster); AT LEAST FOUR worked examples (use A, B, C, D from the input contract minimum — A minimal default; B line-mode; C folder-scoped; D capped+truncated); six behavioural notes from contracts/search-input.contract.md § Behavioural notes; inherited limitations from research.md (filename-match inflation, line-mode count divergence, conservative truncation, ASCII-fold only, no relevance ranking, no `total: true` count-only mode at v1).
- [ ] T058 Bump `package.json` `"version"` from `0.6.0` to `0.6.1` (PATCH; additive surface, no breaking changes).
- [ ] T059 Add new `## [0.6.1] - 2026-05-17` entry to top of `CHANGELOG.md` per the convention shown in 0.5.8 / 0.5.7 / 0.5.6 entries: PATCH release announcement; the new tool (`search` + `search:context` internal routing); the architectural pivot note (native wrapper, NOT eval — BI-028 departure point); two plan-stage spec amendments (FR-016 restated, FR-021 status documented); inherited limitations list; spec-id 033-search-vault-content, FR-001..FR-024, SC-001..SC-011.
- [ ] T060 Run the full local quality gate: `npm run lint` (zero warnings), `npm run typecheck` (tsc --noEmit clean), `npm run build` (succeeds), `npm run test` (all suites pass including the new `search` cases and the regenerated baseline). Fix any failures before proceeding.
- [ ] T061 Run T0 manual probes from quickstart.md § T0 manual probes — seed `Sandbox/BI-033/` fixtures per data-model.md § Fixture seeding plan, run T0-1 through T0-5 against the real CLI, verify outputs match the documented expectations. Read `.memory/test-execution-instructions.md` BEFORE seeding fixtures (CLAUDE.md gate). Quote any CLI output divergence verbatim; do NOT paraphrase. Cleanup `Sandbox/BI-033/` after probes complete (leave `Sandbox/` parent intact).
- [ ] T062 [P] Run `npm run graphify -- update` (or the project's graphify-update wrapper, if it differs) to roll the structural graph forward with the new `src/tools/search/` symbols. This is the `/speckit-analyze` prerequisite — the graph must reflect post-implementation reality before the analyze pass runs. Verify the new `search` handler symbols appear in `graphify-out/graph.json` and land in the typed-tool handler community as expected (per plan.md § Graph consultation — Community placement).
- [ ] T063 Verify Constitution Compliance checklist (per the .specify/memory/constitution.md gate): Principle I (modular `{schema, handler, index}.ts` layout ✓), Principle II (60 co-located tests ✓), Principle III (zod single source of truth ✓), Principle IV (zero new top-level error codes ✓), Principle V (Original-no-upstream headers on all new files ✓), ADR-010 (tool name `search` mirrors `obsidian search` ✓), ADR-013 (N/A — not plugin-backed), ADR-014 (N/A — not plugin-backed), ADR-015 (N/A — no new (top-level-code, details.code) pairs with sub-states). All N/A justifications match plan.md Constitution Check.

**Checkpoint**: BI-033 implementation complete. Ready for `/speckit-analyze`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No tasks; nothing to depend on.
- **Foundational (Phase 2)**: T001-T005. All sequential within the phase (T001 → T002 → T003 in pair → T004 → T005). T001 [P] is the only one parallel-eligible (single mkdir).
- **User Story 1 (Phase 3)**: Depends on Phase 2 complete. T006-T016 can all run in parallel (independent test cases in `handler.test.ts`). T017 implementation must wait for the tests to be in place (TDD red-first).
- **User Story 2 (Phase 4)**: Depends on Phase 2 + Phase 3 complete (the line-mode branch extends the default-mode handler; sharing `searchHandler` body requires US1 to be in place). T018-T027 parallel; T028 sequential (extends T017).
- **User Story 3 (Phase 5)**: Depends on Phase 2 only (folder normalisation is independent of mode). T029-T033 parallel; T034 sequential. CAN run in parallel with US2 if multiple developers.
- **User Story 4 (Phase 6)**: Depends on Phase 2 + Phase 3 + Phase 4 (truncation logic lives in BOTH mode branches). T035-T043 parallel; T044/T045 sequential (extend T017/T028).
- **User Story 5 (Phase 7)**: Depends on Phase 2 only (case flag is an independent parameter-assembly line). T046-T048 parallel; T049 sequential. CAN run in parallel with US2/US3/US4.
- **Phase 8 Registration**: Depends on all user stories complete (server.ts wire-up + baseline regen need the final handler).
- **Phase 9 Polish**: Depends on Phase 8 complete (CHANGELOG / version / T0 / graphify-update all assume the implementation is shipped).

### User Story Dependencies (per BI-033 architecture)

- **US1 (P1)**: Phase 2 only. The MVP. Default-mode happy path + sentinel + staged parse + sort + filter.
- **US2 (P2)**: US1 (extends the handler with line-mode branch). Independently testable via line-mode-only test cases.
- **US3 (P2)**: Phase 2 only — folder normalisation is mode-agnostic. INDEPENDENT of US2.
- **US4 (P3)**: US1 + US2 (truncation lives in both branches). INDEPENDENT of US3 + US5.
- **US5 (P3)**: Phase 2 only — case flag is an independent parameter line. INDEPENDENT of US2/US3/US4.

### Within Each User Story

- Tests (T006-T016 / T018-T027 / T029-T033 / T035-T043 / T046-T048) are all [P] within their phase — they're isolated `it(...)` blocks in `handler.test.ts`.
- Implementation tasks (T017 / T028 / T034 / T044+T045 / T049) modify the same `handler.ts` file and MUST be sequential within and across stories.
- Verify tests FAIL before implementing (TDD red-green).

### Parallel Opportunities

- All 11 US1 tests (T006-T016) — same file, isolated `it(...)` blocks.
- All 10 US2 tests (T018-T027) — same pattern.
- All 5 US3 tests (T029-T033) — same pattern.
- All 9 US4 tests (T035-T043) — same pattern.
- All 3 US5 tests (T046-T048).
- All 5 registration tests (T050-T054).
- US2, US3, US5 phases can be developed in parallel (independent code paths) IF multiple developers. US4 must wait for US1+US2 because truncation lives in both branches.
- T057 (docs) and T062 (graphify-update) can run after T060 (gate) completes — both are [P].

---

## Parallel Example: User Story 1

```bash
# Launch all 11 US1 test additions in parallel (different it(...) blocks
# in the same handler.test.ts — TDD red-first):
Task: T006 - Q-1 default-mode happy path
Task: T007 - Q-3 zero-match sentinel
Task: T008 - Q-18 deterministic sort
Task: T009 - Q-21/Q-22/Q-24 validation-before-spawn (5 sub-cases)
Task: T010 - Q-25 unknown-vault propagation
Task: T011 - Q-32 JSON-parse failure
Task: T012 - Q-33 wire-schema mismatch
Task: T013 - Q-30 defensive .md filter
Task: T014 - Q-34 response-key-set assertion
Task: T015 - Q-35 byte-identical repeated call
Task: T016 - vault flow-through

# Verify all 11 tests FAIL (handler is still the Phase-2 stub),
# then run T017 implementation as a single sequential task to make them PASS.
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (no-op) + Phase 2 (T001-T005) — module skeleton.
2. Complete Phase 3 (T006-T017) — default-mode happy path + sentinel + staged parse + sort + filter.
3. **STOP and VALIDATE**: Run `npm run test -- search/handler.test.ts` — all US1 tests pass. Run T0-1 against TestVault.
4. MVP is shippable here (single-tool, default-mode-only). US2-US5 are incremental.

### Incremental Delivery

1. Phase 2 → MVP foundation ready.
2. Phase 3 (US1) → default-mode shippable. Validate.
3. Phase 4 (US2) → line mode added. Validate independently.
4. Phase 5 (US3) → folder scoping added. CAN ship in parallel with US2.
5. Phase 6 (US4) → cap + `truncated` flag added. Depends on US1+US2.
6. Phase 7 (US5) → case-sensitivity added. CAN ship in parallel.
7. Phase 8 (registration) → tool exposed via MCP server.
8. Phase 9 (polish) → docs / version / CHANGELOG / T0 / graphify-update / Constitution check.

### Parallel Team Strategy

With multiple developers, after Phase 2 completes:
- Developer A: US1 (T006-T017) → handoff to Developer C for US4.
- Developer B: US2 (T018-T028) → handoff to Developer C for US4.
- Developer C: waits for A+B, then takes US4 (T035-T045).
- Developer D: US3 (T029-T034) — independent.
- Developer E: US5 (T046-T049) — independent.

US3 and US5 can ship before US1 if scheduled that way (they only depend on Phase 2). But by convention, US1 ships first because it's the MVP.

---

## Notes

- [P] tasks = independent test cases or different files; no implicit ordering. Within one `handler.test.ts` file, `it(...)` blocks are isolated by vitest's default test isolation, so test ADDITIONS are parallel-safe even when targeting the same file (the diffs don't conflict line-by-line in practice).
- Implementation tasks targeting `handler.ts` are sequential — T017, T028, T034, T044, T045, T049 all modify the single handler body. Order them as: T017 (US1 default-mode branch) → T028 (US2 line-mode branch) → T044 (US4 default-mode truncation) → T045 (US4 line-mode truncation) → T034 (US3 folder normalisation — confirms helper from Phase 2) → T049 (US5 case flag — single line addition).
- T0 live probes (T061) require fixture seeding in the authorised TestVault per `.memory/test-execution-instructions.md`. Read that gate before running.
- Commit after each completed phase. The `/speckit-git-commit` skill is available.
- Stop at any checkpoint to validate independently. MVP (after Phase 3) is a complete shipping unit.
- Avoid: vague tasks, cross-story implementation conflicts that break independence, skipping the Constitution Compliance verification at T063.
