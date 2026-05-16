---
description: "Task list for BI-035 context-search implementation"
---

# Tasks: Add Context Search (BI-035)

**Input**: Design documents from `/specs/035-context-search/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED — co-located vitest cases ship in the same change as their surface per Constitution Principle II. ~39 cases total (~22 schema / ~16 handler / 1 index smoke) per [data-model.md](data-model.md) test inventory plus two analyzer-driven additions (T023a output-too-large pass-through, T036a recursion characterisation — both folded in from `/speckit-analyze` remediation 2026-05-17). Test scope is unit-only (per project memory `feedback_test_scope`); integration / TC-XXX cases live in the user's external tracker.

**Organization**: Tasks grouped by the four user stories (US1..US4 from [spec.md](spec.md)). The four stories share a single new module (`src/tools/context_search/`); per-story grouping primarily partitions tests and progressively layers handler-behaviour features. US1 ships the per-match line-context happy path (MVP); US2 adds help-tool discoverability + the `search` help-text deprecation marker; US3 adds folder normalisation + `limit` + `case_sensitive` + the conservative `truncated` flag; US4 adds the second CLI invocation for FR-013 folder-existence probing + verifies vault-not-found pass-through.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files OR independent test cases within the same `handler.test.ts`).
- **[Story]**: Which user story this task belongs to (US1..US4). Setup / Foundational / Polish tasks omit the label.
- File paths absolute from repo root.

## Path Conventions

Single-project TypeScript layout. All new source under `src/tools/context_search/`; all new tests co-located in the same directory (Principle II). Three external touches: `src/tools/_register.ts` (registration call), `src/tools/_register-baseline.json` (FR-018 stability lock), `src/tools/search/index.ts` (SEARCH_DESCRIPTION deprecation cross-pointer), `src/tools/help/<content-file>` (new help block + `search` deprecation marker).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No-op for BI-035 — repo already initialised; build pipeline, vitest config, eslint, prettier, tsconfig all in place. No new shared module is introduced (R6 re-uses BI-033's `stripBoundarySlashes`; R8 re-uses `searchContextWireSchema` — both imports from existing `src/tools/search/`). This phase is intentionally empty.

(No tasks in Phase 1.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Module skeleton + input/output schemas + handler scaffolding + registration wiring + baseline lock. MUST complete before any user story implementation tasks. All four user stories depend on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T001 [P] Create `src/tools/context_search/` directory.
- [ ] T002 Create `src/tools/context_search/schema.ts` — declare `contextSearchInputSchema` (per [data-model.md](data-model.md) Entities table: `query` (string, min 1, max 1000, non-empty-post-trim superRefine), `folder?` (string, min 1), `limit?` (integer, 1..10000), `case_sensitive?` (boolean), `vault?` (string, min 1), `.strict()`); `contextSearchMatchSchema` ({path: string min 1, line: int >= 1, text: string}, `.strict()`); `contextSearchOutputSchema` ({count: int >= 0, matches: array, truncated?: literal(true)}, `.strict()`, refine count === matches.length). Export `ContextSearchInput`, `ContextSearchMatch`, `ContextSearchOutput` via `z.infer`. Carry `// Original — no upstream. context_search input/output schemas — vault-scoped per-line context primitive. NO context_lines flag (always returns line-level matches). Re-uses search/schema.ts's wire shape (searchContextWireSchema) for the upstream parse step (R8).` header (Principle V).
- [ ] T003 Create `src/tools/context_search/schema.test.ts` — ~22 schema-level cases per data-model.md "Test inventory > schema.test.ts" table: happy paths for `{query}` alone, `{query, folder}`, `{query, limit}`, `{query, case_sensitive}`, `{query, vault}`, all-fields × 1; reject missing query, empty query, whitespace-only query (superRefine), query > 1000 chars; accept query exactly 1000 chars; reject limit 0 / -1 / 10001 / 50.5; accept limit 1 and 10000 (boundaries); reject unknown top-level key (strict / FR-009); phrase-match preserves internal whitespace verbatim (FR-001); inferred type compile-check (`expectTypeOf` against representative shapes); output schema strict (extra field rejected); output schema refine (count !== matches.length rejected). Tests must FAIL before T002 lands (TDD order — in practice run T002+T003 as a pair).
- [ ] T004 Create `src/tools/context_search/handler.ts` — declare module-level constants (`TEXT_CAP = 500`, `ELLIPSIS = "…"`, `DEFAULT_CAP = 1000`, `ZERO_MATCH_SENTINEL = "No matches found."`); helper functions `stripCr(s: string): string` (per R5 — strips trailing `\r` only) and `capLine(text: string): string` (post-strip 500-char cap + U+2026 marker on overflow); import `searchContextWireSchema` from `../search/schema.js` and `stripBoundarySlashes` from `../search/handler.js` (R6 / R8); import `invokeCli` + `SpawnLike` from `../../cli-adapter/cli-adapter.js`; import `UpstreamError` from `../../errors.js`; import `Logger`, `Queue` types; export `ExecuteDeps` interface (parity with `search/handler.ts`); export `executeContextSearch(input: ContextSearchInput, deps: ExecuteDeps): Promise<ContextSearchOutput>` with a stub body that throws `not implemented`. Carry `// Original — no upstream. context_search handler — single-subcommand wrapper over obsidian search:context with FR-013 post-empty folder-existence probe (R4) and FR-012 CRLF strip (R5). Re-uses BI-033's stripBoundarySlashes + searchContextWireSchema via direct imports (R6 / R8 — module direction context_search → search, no cycle).` header.
- [ ] T005 Create `src/tools/context_search/index.ts` — declare `CONTEXT_SEARCH_TOOL_NAME = "context_search"` (ADR-010 strict reversal of `search:context` per R2); export `CONTEXT_SEARCH_DESCRIPTION` (rich one-paragraph text describing the input contract, output shape, error roster, and the "Prefer this over `search` when..." guidance line per FR-020); export `createContextSearchTool(deps: RegisterDeps): RegisteredTool` factory calling `registerTool({name, description, schema: contextSearchInputSchema, deps, handler: async (input, d) => executeContextSearch(input, d)})`. Look at `src/tools/search/index.ts` for the canonical factory shape; mirror structure minus the `context_lines` references. Carry `// Original — no upstream. context_search tool registration via registerTool — vault-text-search-with-line-context primitive returning { count, matches: [{ path, line, text }], truncated? } in one call (eighteenth typed-tool wrap). Tool name `context_search` follows ADR-010 strict composite-namespace reversal of upstream `obsidian search:context` — parity with read_property (property:read) / set_property (property:set).` header.
- [ ] T006 Create `src/tools/context_search/index.test.ts` — I1 smoke test: `createContextSearchTool` returns a `RegisteredTool` with `name === "context_search"` and `description.length > 0`. Parity with `src/tools/search/index.test.ts`.
- [ ] T007 Modify `src/tools/_register.ts` — add `createContextSearchTool` import and registration call. Position alphabetically among existing tool registrations; mirror the surrounding code shape exactly.
- [ ] T008 Regenerate `src/tools/_register-baseline.json` via the project's canonical regenerator workflow — run `npm run baseline:write` (which executes `scripts/write-register-baseline.ts`) AFTER T007's `_register.ts` change is in place. The script produces the canonical JSON including fingerprint hashes for the new `context_search` entry; do NOT hand-edit the JSON file (manual edits would diverge from the regenerator's canonicalisation and the FR-018 stability test would re-fail on the next run). The helper module `src/tools/_register-baseline.ts` (fingerprint utilities) is NOT touched — it contains no tool-name list, only hashing helpers. Note added by /speckit-analyze remediation 2026-05-17.
- [ ] T009 Modify `src/tools/_register.test.ts` — update the assertion target count (existing tools + 1 = 18) and/or any snapshot that enumerates registered tool names. The baseline JSON drives the assertion; this task touches only the test if it carries a parallel constant.

**Checkpoint**: Foundation ready — module skeleton compiles (`tsc --noEmit` clean), schemas parse, handler is a stub that throws "not implemented", index.ts wires schema + handler into a `RegisteredTool`, the new tool is registered and present in the FR-018 baseline. T003 + T006 pass.

---

## Phase 3: User Story 1 — Per-match context returned inline (Priority: P1) 🎯 MVP

**Goal**: A caller supplies a non-empty `query` and the tool returns `{count, matches: [{path, line, text}]}` for every matching line in the vault — in one CLI call. Per FR-001 / FR-002 / FR-017 / FR-018 / FR-012 / FR-008 / FR-009.

**Independent Test**: Populate a vault with a single note whose text spans multiple lines and contains `K` on lines 2 and 5. Call `context_search({ query: "K" })`. Assert `count === 2` and `matches` contains entries for lines 2 and 5 with full text.

### Tests for User Story 1

- [ ] T010 [P] [US1] Add to `src/tools/context_search/handler.test.ts` — H1 happy path single file, two matches, single CLI call: mock `invokeCli` (1st call) returns `{stdout: '[{"file":"a.md","matches":[{"line":2,"text":"foo"},{"line":5,"text":"foo"}]}]', stderr: "", exitCode: 0}`; input `{query: "foo"}`; assert exactly ONE invokeCli call with `command: "search:context"`, `parameters.query === "foo"`, `parameters.format === "json"`, `parameters.limit === "1000"`; response `{count: 2, matches: [{path: "a.md", line: 2, text: "foo"}, {path: "a.md", line: 5, text: "foo"}]}`; NO `truncated` field; NO second invokeCli call (no folder param → no probe).
- [ ] T011 [P] [US1] Add to `src/tools/context_search/handler.test.ts` — H3 vault flow-through (note: vault is a **top-level field** of `InvokeCliInput`, not inside `parameters` — see [src/cli-adapter/cli-adapter.ts:21](../../src/cli-adapter/cli-adapter.ts#L21)): input `{query: "foo", vault: "MyVault"}`; assert the constructed CLI `argv` contains `"vault=MyVault"` verbatim (parity with [src/tools/search/handler.test.ts:263-274](../../src/tools/search/handler.test.ts#L263-L274)'s shipped pattern). With `input.vault` undefined, assert `argv.find((a) => a.startsWith("vault=")) === undefined`. The assertion target is the resulting argv array (or the spawnFn spy's recorded argv parameter), NOT `parameters.vault`. Reworded by /speckit-analyze remediation 2026-05-17.
- [ ] T012 [P] [US1] Add to `src/tools/context_search/handler.test.ts` — H5 zero-match sentinel no folder: mock stdout `"\nNo matches found.\n"`; input `{query: "absent"}`; assert exactly ONE invokeCli call; response `{count: 0, matches: []}`; NO `truncated`; output-schema validation passes.
- [ ] T013 [P] [US1] Add to `src/tools/context_search/handler.test.ts` — H8 malformed JSON in first-call stdout: mock stdout `"not json {{{"`; input `{query: "foo"}`; assert throws `UpstreamError` with `code === "CLI_REPORTED_ERROR"`, `details.stage === "json-parse"`, and `cause` preserved.
- [ ] T014 [P] [US1] Add to `src/tools/context_search/handler.test.ts` — H9 wire-shape parse failure: mock stdout `'[{"file":"a.md","matches":"not-array"}]'`; input `{query: "foo"}`; assert throws `UpstreamError` with `code === "CLI_REPORTED_ERROR"`, `details.stage === "wire-parse"`.
- [ ] T015 [P] [US1] Add to `src/tools/context_search/handler.test.ts` — H10 non-`.md` wire entry filtered (FR-017 / R10): mock CLI returns `[{"file":"Sandbox/note.md","matches":[{"line":1,"text":"x"}]},{"file":"Sandbox/note.canvas","matches":[{"line":1,"text":"y"}]}]`; assert response `matches` contains ONLY the `note.md` row; `count === 1`.
- [ ] T016 [P] [US1] Add to `src/tools/context_search/handler.test.ts` — H11 per-line text > 500 chars capped + U+2026 marker (FR-012 / R5): mock CLI with `text = "x".repeat(501)`; assert `matches[0].text === "x".repeat(500) + "…"`, `matches[0].text.length === 501`.
- [ ] T017 [P] [US1] Add to `src/tools/context_search/handler.test.ts` — H12 per-line text === 500 chars verbatim (no ellipsis): mock CLI with `text = "x".repeat(500)`; assert `matches[0].text === "x".repeat(500)`, length 500, no `…`.
- [ ] T018 [P] [US1] Add to `src/tools/context_search/handler.test.ts` — H13 CRLF strip (R5): four sub-assertions in one test. (a) Input line text ending `\r`: `text === "foo\r"`; assert response `text === "foo"`. (b) Trailing spaces before CRLF preserved: `text === "foo  \r"`; assert response `text === "foo  "` (two trailing spaces preserved, `\r` stripped). (c) Embedded `\r` mid-line NOT stripped: `text === "foo\rbar"`; assert response `text === "foo\rbar"` (verbatim — only TRAILING `\r` is stripped). (d) LF-only line verbatim: `text === "foo"` (no trailing `\r`); assert response `text === "foo"`.
- [ ] T019 [P] [US1] Add to `src/tools/context_search/handler.test.ts` — H14a deterministic sort by `(path, line)` ascending (FR-018): mock CLI returns `[{"file":"z.md","matches":[{"line":1,"text":"x"}]},{"file":"a.md","matches":[{"line":5,"text":"y"},{"line":2,"text":"z"}]}]`; assert response `matches` is `[{path:"a.md",line:2,text:"z"},{path:"a.md",line:5,text:"y"},{path:"z.md",line:1,text:"x"}]`.
- [ ] T020 [P] [US1] Add to `src/tools/context_search/handler.test.ts` — Validation-error-before-spawn invariants: assert `invokeCli` spy NEVER called for: empty query, whitespace-only query, query > 1000 chars, limit ≤ 0, limit > 10000, non-integer limit, unknown input key. Seven sub-cases. (Parity with BI-033 Q-21..Q-24.)
- [ ] T021 [P] [US1] Add to `src/tools/context_search/handler.test.ts` — Response-key-set invariant: assert `Object.keys(response).sort()` is exactly `["count", "matches"]` for non-truncated; `["count", "matches", "truncated"]` for truncated. NO `vault` / `query` / `folder` / `limit` / `case_sensitive` echo in any response shape (FR-021 / read-tool memory note).
- [ ] T022 [P] [US1] Add to `src/tools/context_search/handler.test.ts` — Byte-identical repeated call (FR-018 / SC-007): same input + same mocked CLI return → `JSON.stringify(r1) === JSON.stringify(r2)`.
- [ ] T023 [P] [US1] Add to `src/tools/context_search/handler.test.ts` — Drop entries with empty `matches: []` (R8 inherited from BI-033 R9): mock CLI returns `[{"file":"a.md","matches":[]},{"file":"b.md","matches":[{"line":1,"text":"y"}]}]`; assert response `{count: 1, matches: [{path:"b.md", line:1, text:"y"}]}` — `a.md` dropped naturally by flatMap (zero rows from empty array).
- [ ] T023a [P] [US1] Add to `src/tools/context_search/handler.test.ts` — FR-019 / inherited `CLI_OUTPUT_TOO_LARGE` pass-through: mock `invokeCli` THROWS `UpstreamError({code: "CLI_OUTPUT_TOO_LARGE", cause: null, details: { argv: [...], stream: "stdout", limitBytes: 10485760 } })` (simulating the dispatch-layer kill at `_dispatch.ts:263`); assert handler re-raises unchanged (no swallow, no wrapping, no re-classification). Parity with T040's vault-not-found pass-through pattern; characterises FR-019's defer-to-cli-adapter contract at the handler boundary. Added by /speckit-analyze remediation 2026-05-17 to close C2 coverage gap.

### Implementation for User Story 1

- [ ] T024 [US1] Implement `executeContextSearch` body in `src/tools/context_search/handler.ts` for the single-call happy path: zod parse implicit (caller passes already-parsed input via the registered tool); `appliedCap = input.limit ?? DEFAULT_CAP`; assemble `parameters` (`query`, `format: "json"`, `limit: String(appliedCap)` — NOT +1, line-mode conservative per R9); single `await invokeCli({command: "search:context", vault: input.vault, parameters, flags: [], target_mode: "specific"}, deps)`; stage-0 zero-match sentinel check (`result.stdout.trim() === ZERO_MATCH_SENTINEL` → return `{count: 0, matches: []}`); JSON.parse with try/catch throwing `UpstreamError(CLI_REPORTED_ERROR, {cause, details: {stage: "json-parse", stdout: result.stdout.slice(0, 500)}})`; `searchContextWireSchema.safeParse(parsed)` with `!success` throwing `UpstreamError(..., details: {stage: "wire-parse", stdout: ...})`; file-level `.md` filter (`wire.filter((f) => f.file.toLowerCase().endsWith(".md"))`); flatten via `flatMap` ((f) => f.matches.map((m) => ({path: f.file, line: m.line, text: capLine(stripCr(m.text))}))); sort by `path` asc then `line` asc; `contextSearchOutputSchema.parse({count: sorted.length, matches: sorted})` boundary check; return. **Defer to US3**: folder normalisation (skip if `input.folder` undefined; T037 fills in), `case_sensitive` mapping (T038), truncation flag (T039). **Defer to US4**: post-empty folder-existence probe (T044).

**Checkpoint**: US1 fully functional for the no-folder / no-limit / no-case-sensitive / non-truncated path. MVP shippable when T010-T023a pass. Handler returns `{count, matches}` for valid inputs; throws structured `UpstreamError` for every failure mode; never silent-fails. Folder filter / `limit` / case-sensitivity / truncation flag / folder-not-found probe are still no-op or absent (deferred to US3-US4).

---

## Phase 4: User Story 2 — Distinct sibling alongside the path-only tool (Priority: P2)

**Goal**: An agent reading the help docs sees BOTH `search` (path-only) and `context_search` (new) listed side-by-side with one-sentence guidance on which to prefer. The shipped `search` tool's `context_lines` parameter is marked `deprecated` in help text, with a cross-pointer to `context_search`. No code-behaviour change to `search`'s handler / schema (per spec Clarification Q1=B).

**Independent Test**: Call `help({ tool_name: "search" })` and assert the response includes a deprecation marker on `context_lines` and a cross-pointer to `context_search`. Call `help({ tool_name: "context_search" })` and assert the response is non-empty and includes the four worked examples + guidance line. Call `help()` (no arg) and assert both tools appear in the index.

**⚠️ PRECONDITION** (added by /speckit-analyze remediation 2026-05-17): the exact file paths in T025-T030 use placeholders (`<help-test-file>`, `<content-source>`) because the help-tool's content data structure was not pinned down at plan stage. Before starting US2, inspect `src/tools/help/` (and locate any per-tool help blocks for shipped tools like `search`, `read_property`, `find_by_property` etc.) to identify (a) the canonical content file(s) carrying the help blocks and (b) the corresponding test file(s). Update tasks T025-T030 in place with the resolved file paths before implementation begins. This unblocks parallel execution of US2 with US1.

### Tests for User Story 2

- [ ] T025 [P] [US2] Add to `src/tools/help/<help-test-file>` (resolve per the precondition above) — assert `help({ tool_name: "context_search" })` response: (a) non-empty body, (b) contains the four worked examples (minimal, folder-scoped, capped+truncated, CRLF-source), (c) lists the input parameters `query / folder / limit / case_sensitive / vault`, (d) lists the failure roster (VALIDATION_ERROR / CLI_REPORTED_ERROR / CLI_BINARY_NOT_FOUND / CLI_TIMEOUT / CLI_OUTPUT_TOO_LARGE / CLI_NON_ZERO_EXIT), (e) contains the "Prefer this over `search` when..." guidance line.
- [ ] T026 [P] [US2] Add to `src/tools/help/<help-test-file>` — assert `help({ tool_name: "search" })` response now contains: (a) a `deprecated` marker on the `context_lines` parameter row, (b) the one-sentence cross-pointer to `context_search`, (c) the existing six-behavioural-notes block (no regression on BI-033's prior content). Verify the marker text matches `deprecated — prefer the dedicated context_search tool` exactly (or whichever phrasing the help-tool implementation supports).
- [ ] T027 [P] [US2] Add to `src/tools/help/<help-test-file>` — assert `help()` (no tool_name argument) index lists both `search` and `context_search` (alphabetical order; `context_search` precedes `search`). Assert the index includes every tool registered through `_register.ts` (use the same registry the existing help-index iterates — do not bake in a brittle integer count, since the project's typed-tool surface continues to grow). Note: brittle-integer claim removed by /speckit-analyze remediation 2026-05-17.

### Implementation for User Story 2

- [ ] T028 [US2] Add the `context_search` help block to `src/tools/help/<content-source>` — full input contract, output shape, error roster, four worked examples (parity with [quickstart.md](quickstart.md) walkthroughs 1-4), and the "Prefer this over `search` when..." guidance line. The exact data-structure layout depends on how the project's help tool is structured (per-tool object array, registry map, or factory function — inspect existing entries for `find_by_property` / `read_property` / `search` to mirror).
- [ ] T029 [US2] Modify the `search` help block in `src/tools/help/<content-source>` — (a) mark the `context_lines` parameter row as `deprecated — prefer the dedicated context_search tool`, (b) add a one-sentence cross-pointer to `context_search` in the description body or examples section: "For per-line context, prefer `context_search` (added in BI-035); `context_lines=true` is retained for backward compatibility but will be removed in a future BI." Do NOT touch any other part of the existing block.
- [ ] T030 [US2] Modify `src/tools/search/index.ts` `SEARCH_DESCRIPTION` constant — append a one-line deprecation cross-pointer at the end of the existing description string: "DEPRECATION: `context_lines=true` is retained for backward compatibility; prefer the dedicated `context_search` tool (BI-035) for per-line-context queries." Do NOT modify any other character of the existing description. No other files in `src/tools/search/` are touched (per spec Clarification Q1=B).

**Checkpoint**: US2 fully functional. Help-tool surfaces both tools side-by-side with the deprecation guidance. T025-T027 pass. The existing `search` handler/schema/tests are unchanged; BI-033's test suite continues to pass.

---

## Phase 5: User Story 3 — Scoped and capped result set (Priority: P2)

**Goal**: A caller scopes a search with `folder=F` (recursive subtree-prefix); the response contains only files under `F/`. A caller caps the result with `limit=N`; the response contains at most N entries with a `truncated: true` flag when the underlying match set exceeded N. A caller toggles `case_sensitive=true`; lines differing only in letter case are excluded.

**Independent Test**: (a) Populate a vault with `Projects/alpha.md` and `Archive/old.md` both containing `K`; call `context_search({ query: "K", folder: "Projects" })`; assert only the `Projects/alpha.md` row appears. (b) Populate with 10 files each containing `K`; call with `limit=3`; assert exactly 3 entries AND `truncated: true`. (c) Populate `note-a.md` containing `Foo` and `note-b.md` containing `foo`; call with `case_sensitive=true` and `query=Foo`; assert only `note-a.md`'s line is returned.

### Tests for User Story 3

- [ ] T031 [P] [US3] Add to `src/tools/context_search/handler.test.ts` — H2 folder supplied + results found, single CLI call: input `{query: "foo", folder: "Projects"}`; mock CLI returns one-file response with matches; assert exactly ONE invokeCli call with `parameters.path === "Projects"`; assert NO second invokeCli call (path returned results → no folder-existence probe).
- [ ] T032 [P] [US3] Add to `src/tools/context_search/handler.test.ts` — Folder normalisation: input `{query: "foo", folder: "/Projects/"}`; assert `parameters.path === "Projects"`. Also test `Projects/`, `/Projects`, `Projects` all produce same `path: "Projects"`. Four sub-cases.
- [ ] T033 [P] [US3] Add to `src/tools/context_search/handler.test.ts` — Folder is `/` alone: input `{query: "foo", folder: "/"}`; assert `parameters.path` is ABSENT (empty post-strip → omit CLI parameter). Also assert handler's two-call-path NOT triggered for this case (empty post-strip is treated like absent folder for the FR-013 probe — see R4).
- [ ] T034 [P] [US3] Add to `src/tools/context_search/handler.test.ts` — `folder` undefined → `parameters.path` is ABSENT (default; no folder restriction). Already covered by T010 (H1) implicitly; this task explicitly asserts the negative.
- [ ] T035 [P] [US3] Add to `src/tools/context_search/handler.test.ts` — H4 `case_sensitive=true` sets `case` flag: input `{query: "Foo", case_sensitive: true}`; assert `parameters.case === true` (presence-only boolean flag). Also test `case_sensitive: false` → `parameters.case` ABSENT; `case_sensitive` omitted → `parameters.case` ABSENT.
- [ ] T036 [P] [US3] Add to `src/tools/context_search/handler.test.ts` — H14 truncation flag (R9 conservative): mock CLI returns `appliedCap` files each with one match (where `appliedCap = input.limit`). Two sub-cases: (a) `limit: 3`, CLI returns 3 files × 1 match each → `truncated: true`, `count: 3`, `matches.length: 3`. (b) `limit: 3`, CLI returns 3 files × 2 matches each (flat → 6 entries) → `truncated: true` (flatExceedsCap fires), trimmed to `count: 3, matches.length: 3`. (c) `limit: 3`, CLI returns 2 files × 1 match each (flat → 2 entries, under cap) → `truncated` ABSENT (or false), `count: 2`. (d) `limit` omitted, CLI returns 1000 files × 1 match each → `truncated: true`, `matches.length: 1000`. (e) `limit` omitted, CLI returns 999 files × 1 match each → `truncated` ABSENT.
- [ ] T036a [P] [US3] Add to `src/tools/context_search/handler.test.ts` — FR-003 / SC-003 recursive subtree-prefix characterisation: input `{query: "foo", folder: "Projects"}`; mock CLI returns `[{"file":"Projects/foo.md","matches":[{"line":1,"text":"x"}]},{"file":"Projects/sub/bar.md","matches":[{"line":1,"text":"y"}]},{"file":"Projects/a/b/c.md","matches":[{"line":1,"text":"z"}]}]`; assert response `matches` contains all three entries with paths preserved verbatim and sorted by `(path, line)` ascending. Verifies the wrapper forwards nested-subfolder rows from upstream without filtering them out (per Clarification Q2=A). Added by /speckit-analyze remediation 2026-05-17 to close C1 coverage gap (the recursion shape is inherited from upstream's `path=` flag; this test characterises the forward step at the wrapper layer, complementing the live-CLI probe in T050).

### Implementation for User Story 3

- [ ] T037 [US3] Extend `executeContextSearch` in `src/tools/context_search/handler.ts` with folder normalisation: if `input.folder !== undefined`, compute `normalisedFolder = stripBoundarySlashes(input.folder)`; if `normalisedFolder.length > 0`, set `parameters.path = normalisedFolder`; otherwise omit `parameters.path`. The normalisedFolder variable is also retained for the US4 post-empty probe.
- [ ] T038 [US3] Extend `executeContextSearch` with `case_sensitive` mapping: if `input.case_sensitive === true`, set `parameters.case = true` (presence-only boolean). Otherwise omit. Parity with `search/handler.ts:67`.
- [ ] T039 [US3] Extend `executeContextSearch` with truncation flag computation: compute `cliFileCapFired = (mdOnly.length === appliedCap)`, `flatExceedsCap = (flat.length > appliedCap)`, `truncated = cliFileCapFired || flatExceedsCap` (R9 / BI-033 R3 conservative line-mode). Trim `flat` to `appliedCap` entries if `flatExceedsCap` (`flat.slice(0, appliedCap)`). Sort. Build output as `{count: sorted.length, matches: sorted, ...(truncated ? { truncated: true as const } : {})}`. Boundary-validate via `contextSearchOutputSchema.parse(...)`.

**Checkpoint**: US3 fully functional. Folder scoping with normalisation, `limit` capping with `truncated` flag, and case-sensitivity toggle all work. T031-T036a pass. Combined with US1, the tool now satisfies every spec requirement except FR-013 (folder-not-found-as-error), which is US4.

---

## Phase 6: User Story 4 — Structured errors for missing targets (Priority: P3)

**Goal**: A caller whose `vault` is unrecognised receives a structured vault-not-found error (inherited from `cli-adapter.ts:87-97`). A caller whose `folder` doesn't exist receives a structured folder-not-found error (post-empty probe via `obsidian folder`, surfacing the inherited `_dispatch.ts:308-318` priority (c) `Error:` classifier).

**Independent Test**: (a) Call `context_search({ query: "x", vault: "does-not-exist" })`; assert structured `UpstreamError(CLI_REPORTED_ERROR, details.message: "Vault not found.")` is thrown. (b) Call `context_search({ query: "x", folder: "DoesNotExist" })` against a known vault; assert `UpstreamError(CLI_REPORTED_ERROR, details.message: 'Error: Folder "DoesNotExist" not found.')` is thrown. (c) Call `context_search({ query: "x" })` against an empty vault (no matches, no folder); assert `{count: 0, matches: []}` returned — no error.

### Tests for User Story 4

- [ ] T040 [P] [US4] Add to `src/tools/context_search/handler.test.ts` — Vault-not-found pass-through: mock `invokeCli` THROWS `UpstreamError("CLI_REPORTED_ERROR", {cause: null, details: {command: "search:context", stdout: "Vault not found.\n", stderr: "", exitCode: 0, message: "Vault not found."}, message: "Vault not found."})` (simulating the cli-adapter's classifier firing); assert handler re-raises unchanged (no swallow, no wrapping, no re-classification). Parity with BI-033 Q-25.
- [ ] T041 [P] [US4] Add to `src/tools/context_search/handler.test.ts` — H6 zero-match + folder exists → two-call path returns empty envelope: first invokeCli call returns zero-match sentinel `"No matches found.\n"`; second invokeCli call resolves with a non-error stdout (e.g. `"Sandbox\nSandbox/sub\n"` representing the `obsidian folder info=folders` output, OR whatever the upstream's normal `folder` subcommand returns for an existing folder). Assert exactly TWO invokeCli calls; first call has `command: "search:context"`; second call has `command: "folder"`, `parameters.path === <normalised folder>`. Response: `{count: 0, matches: []}`. No error thrown.
- [ ] T042 [P] [US4] Add to `src/tools/context_search/handler.test.ts` — H7 zero-match + folder missing → two-call path propagates structured error: first invokeCli call returns zero-match sentinel; second invokeCli call THROWS `UpstreamError("CLI_REPORTED_ERROR", {cause: null, details: {argv: [...], command: "folder", stdout: 'Error: Folder "DoesNotExist" not found.\n', stderr: "", exitCode: 0, message: 'Error: Folder "DoesNotExist" not found.'}, message: 'Error: Folder "DoesNotExist" not found.'})` (simulating the dispatch classifier firing); assert handler re-raises unchanged. Two invokeCli calls.
- [ ] T043 [P] [US4] Add to `src/tools/context_search/handler.test.ts` — Two-call-path is NOT triggered when folder absent: input `{query: "x"}` (no folder); mock first invokeCli returns zero-match sentinel; assert exactly ONE invokeCli call (no probe); response `{count: 0, matches: []}`. Parity assertion with T012 (already covers this); this task explicitly characterises the call-count gate.

### Implementation for User Story 4

- [ ] T044 [US4] Extend `executeContextSearch` in `src/tools/context_search/handler.ts` with the post-empty folder-existence probe (R4): after the stage-0 zero-match sentinel check, if `input.folder !== undefined` AND `normalisedFolder.length > 0`, invoke a second `await invokeCli({command: "folder", vault: input.vault, parameters: { path: normalisedFolder }, flags: [], target_mode: "specific"}, deps)`. If the second call succeeds (returns a result), return the empty envelope `{count: 0, matches: []}`. If it throws (the dispatch classifier catches `Error: Folder ...` and throws `UpstreamError(CLI_REPORTED_ERROR, ...)`), let the throw propagate verbatim (no try/catch wrapping). The vault-not-found path is handled at the FIRST invokeCli call by `cli-adapter.ts:87-97`'s classifier — no additional handler-side work needed for FR-014.

**Checkpoint**: US4 fully functional. T040-T043 pass. The handler now distinguishes "folder exists with no matches" from "folder missing" by emitting a structured `CLI_REPORTED_ERROR` on the latter. The full FR-013 contract is honoured. Together with US1-US3, the entire BI-035 spec is implemented.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final quality gates, documentation cross-check, and the project's CI-equivalent verification before merge.

- [ ] T045 Run `npm run lint` — must pass with zero warnings (Constitution §Lint & format gate).
- [ ] T046 Run `npm run typecheck` — must pass with zero errors (`tsc --noEmit` clean per Constitution §Language).
- [ ] T047 Run `npm run build` — must succeed (Constitution §Build gate).
- [ ] T048 Run `vitest run` — full test suite must pass (Constitution Principle II + §5 coverage gate). Confirm the new ~39 test cases (T003 + T006 + T010-T023a + T025-T027 + T031-T036a + T040-T043) all pass.
- [ ] T049 Run the aggregate statements coverage gate per `vitest.config.ts` `test.coverage.thresholds.statements` (Constitution §5). Should not regress; if it raises naturally with the new file, optionally ratchet the threshold upward by one-line edit (Constitution §5 single-source-of-truth pattern).
- [ ] T050 Manual verification against [quickstart.md](quickstart.md) walkthroughs 1-5 using `TestVault-Obsidian-CLI-MCP` per `.memory/test-execution-instructions.md`. Seed the sandbox with fixtures matching each walkthrough; assert response shapes match the documented examples. Clean up `Sandbox/` artifacts after the run. This is the T0 live-CLI characterisation gate.
- [ ] T051 [P] Confirm `src/tools/_register-baseline.json` reflects the new `context_search` registration (the FR-018 lock); confirm `_register.test.ts` passes against the updated baseline. (Already covered by T008/T009 but re-checked here as the project's pre-merge gate.)
- [ ] T052 [P] Cross-check: open [data-model.md](data-model.md)'s module-boundary diagram and confirm imports in `src/tools/context_search/handler.ts` match (`../search/schema.js` for `searchContextWireSchema`; `../search/handler.js` for `stripBoundarySlashes`; `../../cli-adapter/cli-adapter.js` for `invokeCli`; `../../errors.js` for `UpstreamError`). No cycles, no upward imports (Principle I).
- [ ] T053 [P] Cross-check: confirm all source files carry the `Original — no upstream.` header (Principle V). Five new files (schema.ts / schema.test.ts / handler.ts / handler.test.ts / index.ts / index.test.ts) — verify each carries the header.
- [ ] T054 [P] Update `package.json` — insert `context_search, ` immediately before `delete, ` in the `description` field's typed-tools enumeration (alphabetical position — `c` precedes `d`). The current list starts `Typed tools: delete, files, ...`; after the edit it reads `Typed tools: context_search, delete, files, ...`. Keeps the npm-registry description in sync with the registered surface. Added by /speckit-analyze remediation 2026-05-17 to close I2 (package.json description sync).

**Checkpoint**: BI-035 ready to merge. All Constitution gates green. Quickstart walkthroughs verified against live CLI.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Empty — no dependencies, no tasks.
- **Foundational (Phase 2)**: No dependencies on prior phases — BLOCKS all user stories. T001 (mkdir) → T002+T003 (schema pair) → T004 (handler stub) → T005+T006 (index + smoke) → T007+T008+T009 (registration triple).
- **US1 (Phase 3)**: Depends on Foundational. T024 (handler impl) is the load-bearing implementation task; T010-T023a are the tests for it.
- **US2 (Phase 4)**: Depends on Foundational (the new tool must be registered for the help index to enumerate it). Independent of US1's handler implementation — the help-tool integration only depends on the tool's registered name + schema, not on the runtime behaviour. Can run in parallel with US1.
- **US3 (Phase 5)**: Depends on US1 (extends the same handler). Cannot run in parallel with US1's implementation T024 (same file). Tests within US3 (T031-T036a) can be authored against the stub-and-test-fail discipline before T037-T039 land.
- **US4 (Phase 6)**: Depends on US1 (extends the same handler with a second invokeCli call). Cannot run in parallel with US1 or US3's implementations (same file). Tests within US4 (T040-T043) can be authored TDD-style before T044 lands.
- **Polish (Phase 7)**: Depends on all prior phases.

### User Story Dependencies

- **US1 (P1)**: Independent. MVP shippable on its own (no folder scoping, no truncation flag, no folder-not-found structured error — but full per-match line context works).
- **US2 (P2)**: Independent of US1's handler — only depends on the tool being registered. Can ship before, after, or in parallel with US1.
- **US3 (P2)**: Depends on US1's handler shell. US3's features (folder, limit, case_sensitive, truncation) are extensions; the handler shell must exist first.
- **US4 (P3)**: Depends on US1's handler shell. The FR-013 probe is a second invokeCli call grafted onto the zero-match sentinel branch; the branch must exist first.

### Within Each User Story

- Tests authored FIRST per Principle II TDD discipline. Test cases must FAIL before implementation lands.
- Schema before handler (T002/T003 before T004 — except in parallel-pair execution).
- Handler before registration tests (T024 before T010-T023a can pass — but the tests are authored first).

### Parallel Opportunities

- T001 (mkdir) — standalone.
- T002+T003 (schema pair) — same file; sequential.
- T010-T023a — all `[P]` because each adds an independent test case to `handler.test.ts`. Can be authored in parallel by different developers OR drafted together in one editor session.
- T025-T027 — all `[P]` (different help test cases).
- T031-T036a — all `[P]` (different handler test cases).
- T040-T043 — all `[P]` (different handler test cases).
- T045-T053 — Polish phase parallelism: T045-T048 are sequential (lint → typecheck → build → test); T049-T053 can fan out after T048 passes.

---

## Parallel Example: User Story 1 tests

```bash
# Launch all US1 handler tests together (each adds an independent test case
# to handler.test.ts; they can be drafted in parallel):
Task T010 — H1 happy path single file + two matches
Task T011 — H3 vault flow-through
Task T012 — H5 zero-match sentinel no folder
Task T013 — H8 malformed JSON
Task T014 — H9 wire-shape parse failure
Task T015 — H10 non-.md filter
Task T016 — H11 line text > 500 capped
Task T017 — H12 line text === 500 verbatim
Task T018 — H13 CRLF strip variants
Task T019 — H14a deterministic sort
Task T020 — Validation-error-before-spawn invariants
Task T021 — Response-key-set invariant
Task T022 — Byte-identical repeated call
Task T023 — Drop empty matches entries
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (T001-T009).
2. Complete Phase 3: US1 (T010-T024).
3. **STOP and VALIDATE**: Run the BI-035 test suite. Verify the new `context_search` tool answers happy-path queries returning per-line `{path, line, text}` matches. Confirm zero new top-level codes, zero failures in BI-033's existing test suite.
4. Deploy / demo if ready. This is a real, useful MVP — the dominant grep-style three-call pattern is already collapsed to one call.

### Incremental Delivery

1. Setup + Foundational → Foundation ready (T001-T009).
2. US1 → Test independently → MVP deploy (T010-T024, including T023a output-too-large pass-through).
3. US2 → Test help-surface independently → docs deploy (T025-T030). Can run in parallel with US3/US4 since it touches only help-tool files.
4. US3 → Test scoped+capped queries independently → deploy (T031-T039).
5. US4 → Test structured-error paths independently → deploy (T040-T044). Completes the full FR-013 contract.
6. Polish (T045-T053) → merge-ready.

Each phase adds value without breaking previous phases. The BI-033 `search` test suite continues to pass throughout — no regressions on the sibling tool (per spec Clarification Q1=B; per T030 narrow help-text-only touch).

### Parallel Team Strategy

With multiple developers, after Foundational (T001-T009) is complete:

- Developer A: US1 implementation (T024) + drives the TDD test cases T010-T023a.
- Developer B: US2 help-tool integration (T028-T030) + tests T025-T027.
- Developer C: Wait for US1's T024 to land, then take US3 (T031-T039).
- Developer D: Wait for US1's T024 to land, then take US4 (T040-T044).

A + B can run truly in parallel (different file sets). C + D wait for A, then can run in parallel only if careful about handler.ts edits (US3 and US4 both extend the same file — recommend sequential to avoid merge conflicts, or careful coordination).

---

## Notes

- `[P]` tasks = different files OR independent test cases within the same `handler.test.ts` (drafts can be authored in parallel; commits can be parallel-prepared even when the file is shared, then merged).
- `[Story]` label maps task to specific user story for traceability (US1=P1, US2=P2 docs, US3=P2 scope+cap, US4=P3 structured errors).
- Each user story should be independently completable and testable.
- Verify tests FAIL before implementing (TDD discipline; Principle II implication).
- Commit after each task or logical group per CONTRIBUTING.md scope-honesty.
- Stop at any checkpoint to validate story independently.
- Zero new top-level error codes (Constitution Principle IV); zero new `details.code` values (ADR-015 N/A). The eighteenth typed tool extends the zero-new-codes streak.
- Tool name `context_search` per ADR-010 strict reversal of `obsidian search:context` (R2). Parallels `read_property` (`property:read`) and `set_property` (`property:set`).
- Avoid: vague tasks, same-file conflicts during parallel implementation phases, cross-story dependencies that break independence.
