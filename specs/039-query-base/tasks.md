---

description: "Task list for query_base (BI-039) — dependency-ordered, organised by user story."
---

# Tasks: Query Base

**Input**: Design documents from `/specs/039-query-base/` — [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓.

**Tests**: Co-located `*.test.ts` unit tests are MANDATORY per Constitution Principle II (every MCP tool ships with happy-path + failure-or-boundary tests in the same change that adds it). Tests are NOT optional. T0 live-CLI scenarios from quickstart.md run at `/speckit-implement` time per CLAUDE.md `## Test Execution`.

**Organisation**: Tasks are grouped by user story. Setup + Foundational (Phase 1 + 2) build the shared Zod schemas and module scaffold. User stories then layer the handler logic incrementally — US1 ships the happy-path MVP (envelope construction, row passthrough, reserved `path` injection, truncation, ordering, registration); US2 layers in the diagnostic-error classification (BASE_NOT_FOUND / BASE_MALFORMED / VIEW_NOT_FOUND).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel — different files, no dependencies on incomplete tasks.
- **[Story]**: User story this task belongs to (US1, US2).
- File paths absolute or repo-rooted.

## Path Conventions

Single-project layout under `src/`. Test files co-located alongside source per Principle II — `src/tools/query_base/handler.ts` ↔ `src/tools/query_base/handler.test.ts`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the new per-surface module directory and prepare the docs placeholder.

- [X] T001 Create the new tool module directory at [src/tools/query_base/](src/tools/query_base/) and seed each file with an `// Original — no upstream.` one-line header per Constitution Principle V. Files to create as empty modules: `schema.ts`, `handler.ts`, `index.ts`. Co-located test files `schema.test.ts`, `handler.test.ts`, `index.test.ts` get header-only stubs too — tests are filled in by later tasks.
- [X] T002 [P] Create the docs placeholder at [docs/tools/query_base.md](docs/tools/query_base.md) — a header-only stub that is filled in during the Polish phase per ADR-005 progressive-disclosure convention.

**Checkpoint**: Module directory exists; every file carries its attribution header. No production logic yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the Zod schemas that every story consumes. Schema is the single source of truth for the published MCP `inputSchema` AND the runtime parse per Constitution Principle III.

**⚠️ CRITICAL**: No user story task can begin until this phase is complete. Foundational covers FR-002 / FR-002a / FR-002b / FR-002c / FR-002d / FR-010 (Layer 1) / FR-011 / FR-011a / FR-012 / FR-013 / FR-014 at the schema layer.

- [X] T003 [P] Implement the input + output Zod schemas in [src/tools/query_base/schema.ts](src/tools/query_base/schema.ts) per [data-model.md](data-model.md). **Input schema**: strict `z.object` carrying `base_path: z.string().min(1, "base_path is empty").max(1000, "base_path exceeds 1000 chars")` with `superRefine` running (a) extension check (ends with `.base` case-insensitive — surfaces `INVALID_BASE_PATH/wrong-extension`) and (b) path-traversal shape check via [src/path-safety/schema.ts](src/path-safety/schema.ts)'s `isStructurallySafePath` helper (surfaces `INVALID_BASE_PATH/path-traversal`); `view_name: z.string().min(1, "view_name is empty").max(1000, "view_name exceeds 1000 chars")` with the empty/too-long sub-states surfaced as `INVALID_VIEW_NAME` `details.code`; `vault: z.string().min(1).optional()`. Strict mode (`.strict()`) rejects unknown top-level keys. Export `z.infer<typeof queryBaseInputSchema>` as `QueryBaseInput`. **Output schema**: `z.object` with `columns: z.array(z.string().min(1))`, `rows: z.array(z.record(z.string(), z.unknown())).max(1000)`, `truncated: z.boolean()`, `total_rows: z.number().int().min(1001).optional()`, plus a `.refine` predicate enforcing `total_rows !== undefined IFF truncated === true` per FR-013. Export `z.infer<typeof queryBaseOutputSchema>` as `QueryBaseOutput`. **Wire envelope schema**: separate `queryBaseWireSchema` parsing upstream's raw stdout JSON — `z.array(z.record(z.string(), z.unknown()))` — used by the handler before the post-process (sort, cap, inject `path`, build `columns`). Per Principle III, schemas are the single source of truth — no parallel TypeScript interfaces.
- [X] T004 Implement the schema cohort tests in [src/tools/query_base/schema.test.ts](src/tools/query_base/schema.test.ts). Cases: happy-path validation of `{ base_path: "Indexes/Active.base", view_name: "Open" }`; happy-path with optional `vault`; empty `base_path` → `INVALID_BASE_PATH/empty`; empty `view_name` → `INVALID_VIEW_NAME/empty`; over-cap `base_path` (1001 chars) → `INVALID_BASE_PATH/too-long`; over-cap `view_name` (1001 chars) → `INVALID_VIEW_NAME/too-long`; wrong extension (`.md` / `.txt` / no extension / `.base.bak`) → `INVALID_BASE_PATH/wrong-extension`; extension case-insensitivity (`.BASE` / `.Base` accepted); path-traversal shapes (`../escape.base`, leading `/`, leading `\`, `C:\` drive-letter, `\x00` control char) → `INVALID_BASE_PATH/path-traversal`; unknown top-level field → `VALIDATION_ERROR` with Zod `unrecognized_keys`; missing required `base_path` → `VALIDATION_ERROR` with Zod issue path `["base_path"]`; missing required `view_name` → same path `["view_name"]`; non-string types → `VALIDATION_ERROR` Zod `invalid_type`. Output schema: accepts a well-formed envelope with `truncated: false` + no `total_rows`; accepts a well-formed envelope with `truncated: true` + `total_rows: 4527`; rejects `truncated: true` without `total_rows`; rejects `truncated: false` with `total_rows` present; rejects `rows.length > 1000`. Depends on T003.

**Checkpoint**: Schema ships with full validation-error cohort coverage. `handler.ts` is still a header-only stub. Tests pass `vitest run`. Every error envelope listed in [contracts/errors.md](contracts/errors.md) under the validation-layer section is asserted.

---

## Phase 3: User Story 1 - Retrieve rows of a named view as structured JSON (Priority: P1) 🎯 MVP

**Goal**: Ship the happy-path MVP. Caller invokes the tool naming a `.base` file and a view; receives the `{ columns, rows, truncated, total_rows? }` envelope with rows ordered per FR-003, the reserved `path` field on every row, native column-value types preserved, the reserved-key collision rule honoured, and truncation surfaced via `truncated: true` + `total_rows` when the cap fires. Includes registration through the boot spine so the tool is callable from MCP clients.

**Independent Test**: Run quickstart.md examples 1–4 + 11 against the authorised test vault — single-view happy path, empty view (zero-row success), truncation (4527-row case), reserved-key collision (view-defined `path` column surfaces as `path_view`), vault selection (focused default + named vault). Verify each response shape matches the envelope contract exactly.

This MVP includes the full happy-path envelope construction, FR-003 deterministic ordering, FR-013 truncation, FR-002a–d row-field rules, FR-014 native-type preservation, FR-009 vault selection, FR-010 Layer 2 canonical-path check, FR-015 read-only side-effect freedom, and the registration tail (factory + server wire + baseline update). It does NOT include the diagnostic-error classification (US2 covers BASE_NOT_FOUND / BASE_MALFORMED / VIEW_NOT_FOUND).

### Implementation for User Story 1

- [X] T005 [US1] Implement the `ExecuteDeps` shape and the handler skeleton in [src/tools/query_base/handler.ts](src/tools/query_base/handler.ts). Deps interface: `{ logger: Logger, queue: Queue, spawnFn?: SpawnLike, env?: NodeJS.ProcessEnv }` (cohort-uniform with [src/tools/pattern_search/handler.ts:21-26](src/tools/pattern_search/handler.ts#L21)). Export `executeQueryBase(input: QueryBaseInput, deps: ExecuteDeps): Promise<QueryBaseOutput>`. Body is a stub that throws "not implemented" — populated by T006–T012. Import the wire/output schemas from `./schema.js`, `invokeCli` + `SpawnLike` from `../../cli-adapter/cli-adapter.js`, `UpstreamError` from `../../errors.js`, types from `../../logger.js` + `../../queue.js`.
- [X] T006 [US1] Implement the upstream CLI invocation in handler.ts. Build the `InvokeCliInput`: `command: "base:query"`, `vault: input.vault`, `parameters: { path: input.base_path, view: input.view_name, format: "json" }`, `flags: []`, `target_mode: "specific"`. Call `await invokeCli(cliInput, { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue })`. Capture the returned `{ stdout, stderr }`. The existing cli-adapter `Vault not found.` reclassifier handles the unknown-vault path automatically per FR-009 (cohort reuse). Closed-but-registered vault detection is wired by T010 IF the live probe shows it's needed for non-`eval` subcommands. Depends on T005.
- [X] T007 [US1] Implement the stdout JSON.parse + wire-envelope safeParse in handler.ts. After upstream returns, parse the stdout via `JSON.parse(stdout)` inside a try/catch — on parse failure throw `UpstreamError` with `code: "CLI_REPORTED_ERROR"` + `details.stage: "json-parse"` + `details.stdout: stdout.slice(0, 500)` (cohort parity with [src/tools/pattern_search/handler.ts:86-95](src/tools/pattern_search/handler.ts#L86)). Pass the parsed value through `queryBaseWireSchema.safeParse`; on failure throw `UpstreamError` with `details.stage: "envelope-parse"` + the validation issues. The wire-validated value is `Array<Record<string, unknown>>` — the raw row array as upstream emits it. Depends on T006.
- [X] T008 [US1] Implement the row post-processing pipeline in handler.ts per [data-model.md §Success response envelope](data-model.md). For each upstream-emitted row: (a) extract or synthesise the reserved `path` per FR-002a — if upstream emitted a `path` key whose value is a non-empty string, use that; otherwise synthesise from row metadata (R2 in research.md — the implementation looks up the row's underlying note binding from upstream's emission; if neither is available, throw `INTERNAL_ERROR` + `details.stage: "row-locator-synthesis"` per the R2 invariant). (b) honour the collision rule per FR-002b — if the view-defined columns include a key named `path`, the wrapper-injected `path` wins; the view-defined value moves to `path_view`; the `columns` vector lists both names at their respective indices. (c) preserve non-`path` keys verbatim per FR-002d — no synthesis, suppression, or type coercion. Output is the row's `Record<string, unknown>` keyed by the columns vector. Depends on T007.
- [X] T009 [US1] Implement the deterministic row sort per FR-003 in handler.ts. The sort runs on the full upstream-emitted array (BEFORE the 1000-row cap is applied). Order: (1) **Primary** — the view's declared sort (trust upstream's emission order at this layer — the wrapper applies the sort below as a stable tiebreaker, not a primary re-sort). (2) **Secondary tiebreaker** — `row.path` ascending in UTF-16 code-unit order. Wrapped as a stable sort so that rows comparing equal on the primary axis fall back to `path` ascending, AND rows from a no-explicit-sort view receive `path`-asc as their baseline ordering. (3) **Tertiary tiebreaker** — upstream emission order, preserved by the stable-sort guarantee. The total ordering is deterministic for fixed input regardless of Bases' internal walk-order stability per SC-003. Depends on T008.
- [X] T010 [US1] Implement the 1000-row cap + `truncated` + `total_rows` envelope construction per FR-013 in handler.ts. After T009's sort, measure `upstreamRows.length`. When `> 1000`: slice the first 1000 in the post-sort order; set `truncated: true`; set `total_rows: upstreamRows.length`. When `<= 1000`: keep the full slice; set `truncated: false`; omit `total_rows`. Build the `columns: string[]` vector — start with the reserved `path` at index 0, then append every other column name in the order upstream's columns appear in the first row's key list (insertion order in the parsed JSON object; ECMAScript object-property-iteration order). If the view-defined columns include a `path` collision (per T008's rule), `path_view` appears in the vector at the index the view declared for the original `path`. Return the validated envelope via `queryBaseOutputSchema.parse({ columns, rows, truncated, ...(truncated ? { total_rows } : {}) })`. Depends on T009.
- [X] T011 [US1] Implement the empty-rows envelope branch per FR-006 + FR-002c in handler.ts. When upstream returns an empty array (`upstreamRows.length === 0`): the post-process still runs `columns` construction. For an empty-rows response the wrapper has no rows from which to derive column names — so it falls back to upstream's separate columns metadata. **Implementation detail**: the live probe in /speckit-implement T0 determines whether upstream emits the column schema alongside the row array (e.g., as a separate header object or as part of the response envelope). If upstream does NOT emit columns for an empty view, the wrapper degrades to `columns: ["path"]` (the reserved field alone) per the minimum-viable contract — the agent learns at least that `path` is always present. Document the fallback in handler.ts's inline comment + carry the runtime-discovered value in `details.stage: "empty-columns-fallback"` log breadcrumb. Depends on T010.
- [X] T012 [US1] Implement the closed-but-registered vault detection in handler.ts (cohort reuse, conditional). After T006's `invokeCli` returns, IF `input.vault !== undefined` AND `stdout.trim().length === 0` AND upstream did not surface a clear closed-vault message: call `detectIfClosed({ vaultName: input.vault, deps })` from [src/tools/_eval-vault-closed-detection/index.js](src/tools/_eval-vault-closed-detection/) (cohort parity with [src/tools/pattern_search/handler.ts:65-82](src/tools/pattern_search/handler.ts#L65)). On detection: throw `UpstreamError` with `code: "CLI_REPORTED_ERROR"` + `details.code: "VAULT_NOT_FOUND"` + `details.reason: "not-open"` + `details.vault: input.vault`. The live probe in /speckit-implement T0 confirms whether this branch fires for the non-`eval` `base:query` subcommand; if upstream surfaces closure cleanly via exit code or stderr (the more likely outcome for native subcommands), this detection is dead code and can be removed in the Polish phase. Depends on T006.
- [X] T013 [US1] Implement the unit test cohort in [src/tools/query_base/handler.test.ts](src/tools/query_base/handler.test.ts) covering US1's surface. Mocked `spawnFn` returns canned upstream stdout via the standard test pattern (cohort parity with [src/tools/pattern_search/handler.test.ts](src/tools/pattern_search/handler.test.ts)). Cases: happy-path single-row response (verify envelope shape, `path` at columns[0], native types preserved); happy-path multi-row response sorted by `path` ascending; **default-column-set introspection (FR-008)** — mocked fixture for a view that declares no explicit column selection emits every column the view exposes by default; verify the response's `columns` vector enumerates exactly those columns (plus reserved `path` at index 0) and every row carries values for each; empty-rows response → `rows: []`, `columns` still populated (the T011 fallback), `truncated: false`, `total_rows` omitted; **multi-view sibling-no-leak (FR-007 / SC-004)** — fixture with two views A and B in the same `.base` (distinct column shapes per view: A → `["path","status"]`, B → `["path","priority","tags"]`); invoke with `view_name: "A"`; assert response's `columns` vector contains ONLY view A's columns; assert no row carries a `priority` or `tags` key (B's exclusive columns); rerun with `view_name: "B"` and assert symmetric isolation; reserved-key collision — upstream emits a row with both `path` and a view-defined collision → wrapper surfaces as `path` (wrapper-injected) + `path_view` (view-defined renamed), columns vector lists both; truncation — upstream emits 1247 rows → response carries 1000 rows in sort order, `truncated: true`, `total_rows: 1247`; exact-1000-row case → `rows.length === 1000`, `truncated: false`, `total_rows` omitted (no false-positive per FR-013); native-type preservation — upstream emits values of type number / boolean / null / nested object / ISO-date string → each surfaces verbatim in the row (no coercion); deterministic sort — view's explicit sort by `created` desc + path-asc tiebreaker for equal-`created` rows; **repeat-invocation determinism (SC-003)** — invoke the handler twice against the same mocked spawn fixture (same canned stdout, same input); assert `JSON.stringify(result1) === JSON.stringify(result2)`; vault selection — `input.vault === undefined` does NOT trigger closed-vault detection; `input.vault: "Work"` with empty upstream stdout AND `detectIfClosed` returns true → `VAULT_NOT_FOUND/not-open`; unknown vault via the cli-adapter `Vault not found.` reclassifier → `CLI_REPORTED_ERROR` with the verbatim upstream message; CLI stdout parse failure → `CLI_REPORTED_ERROR + details.stage: "json-parse"`; wire envelope shape failure → `CLI_REPORTED_ERROR + details.stage: "envelope-parse"`. **Explicit read-only assertion** — no fs write calls anywhere in the test cohort per FR-015. Depends on T005..T012.
- [X] T014 [US1] Implement the factory + descriptor in [src/tools/query_base/index.ts](src/tools/query_base/index.ts). Export `createQueryBaseTool(deps: RegisterDeps): RegisteredTool` factory matching the pattern of [src/tools/pattern_search/index.ts](src/tools/pattern_search/index.ts). `RegisterDeps = ExecuteDeps`. Use `registerTool` from `../_register.js`. Export the canonical name as `export const QUERY_BASE_TOOL_NAME = "query_base"` (FR — derived from `base:query` per ADR-010). Export a one-paragraph `QUERY_BASE_DESCRIPTION` string summarising the spec's user-facing intent: when to reach for the tool, the envelope shape, the reserved `path` row field with collision rule, the truncation signal, the four error states (`BASE_NOT_FOUND`, `BASE_MALFORMED`, `VIEW_NOT_FOUND`, `VAULT_NOT_FOUND`), the read-only contract, and a pointer to `help({ tool_name: "query_base" })` for full docs (ADR-005 progressive disclosure). Depends on T003, T005.
- [X] T015 [US1] Implement the descriptor + registration tests in [src/tools/query_base/index.test.ts](src/tools/query_base/index.test.ts). Cases: descriptor shape matches the project convention (parity with [src/tools/pattern_search/index.test.ts](src/tools/pattern_search/index.test.ts)); tool name is exactly `"query_base"` (FR — ADR-010 derivation); the published `inputSchema` (via the centralised `zodToJsonSchema` step in `registerTool`) matches the contract in [contracts/input.schema.json](contracts/input.schema.json); registration via the factory wires the handler with the supplied deps. Depends on T014.
- [X] T016 [US1] Wire `createQueryBaseTool` into the boot spine at [src/server.ts](src/server.ts). Add the import line in alphabetical order with the existing tool imports (alongside `createPropertiesTool`, `createReadTool`, etc.). Add the factory call in the `createTool` registration list (matches the convention used by every other tool). Boot-spine ownership of `createQueue()`, `createLogger()` per Constitution Principle I — handler must not reach back into the composition root at runtime. Depends on T014.
- [X] T017 [US1] Append the `query_base` entry to [src/tools/_register-baseline.json](src/tools/_register-baseline.json) — the registry-stability baseline fixture (BI-031 / FR-018). The entry includes the tool name + the published `inputSchema` (the zod-to-json-schema-converted shape). Update the entry count and verify the baseline test in [src/tools/_register.test.ts](src/tools/_register.test.ts) passes. Depends on T016.

**Checkpoint**: US1 ships the happy-path MVP. `npm run lint && npm run typecheck && npm run build && vitest run` all pass. Quickstart examples 1–4 + 11 can run live against the authorised test vault. The tool is reachable via MCP clients but error states (BASE_NOT_FOUND, BASE_MALFORMED, VIEW_NOT_FOUND) still surface as raw `CLI_REPORTED_ERROR` envelopes without the diagnostic sub-discriminators — US2 layers those on.

---

## Phase 4: User Story 2 - Distinguish missing file from missing view through typed errors (Priority: P2)

**Goal**: Layer the diagnostic-error classification on top of US1's handler so the caller can branch on `details.code` to distinguish `BASE_NOT_FOUND` (file missing), `BASE_MALFORMED` (file present but unusable, five sub-reasons), and `VIEW_NOT_FOUND` (file fine, view missing). Each surfaces under `CLI_REPORTED_ERROR` with its own `details.code` per FR-004 / FR-005 / FR-005b.

**Independent Test**: Run quickstart.md examples 5 + 6 + 7 + 8 against the authorised test vault — invoke against a non-existent `.base` file (BASE_NOT_FOUND), against an existing `.base` with a missing view (VIEW_NOT_FOUND), against an empty `.base` (BASE_MALFORMED/empty), against an invalid-YAML `.base` (BASE_MALFORMED/invalid-yaml), against a case-mismatched view name (VIEW_NOT_FOUND per FR-005a). Verify each error envelope's `details.code` matches the contract exactly.

The schema-layer validation tasks (T003 / T004) already cover the input-validation boundary errors (`INVALID_BASE_PATH`, `INVALID_VIEW_NAME`). US2's task is the post-validation error classification at the wrapper layer.

### Implementation for User Story 2

- [X] T018 [US2] Implement the pre-flight `fs.stat` check in handler.ts per research.md R4 stage 1 + 2. Add an `fs` dep to `ExecuteDeps` (extends T005's interface): `fs: { stat: typeof import("node:fs/promises").stat }`. **Layer 2 path-safety first** — call `checkCanonicalPath(vaultRoot, input.base_path, deps)` from [src/path-safety/canonical.ts](src/path-safety/canonical.ts) BEFORE `fs.stat`; on `{ ok: false }` throw `PATH_ESCAPES_VAULT` + emit `pathEscapeAttempt` logger event per ADR-009 §2 / FR-010. Then `await deps.fs.stat(resolvedAbsPath)` inside a try/catch: on `ENOENT` throw `UpstreamError` with `code: "CLI_REPORTED_ERROR"` + `details.code: "BASE_NOT_FOUND"` + `details.base_path: input.base_path`. On success, inspect `stats.size`: if zero, throw `UpstreamError` with `code: "CLI_REPORTED_ERROR"` + `details.code: "BASE_MALFORMED"` + `details.reason: "empty"` + `details.base_path: input.base_path`. Otherwise proceed to T006's invokeCli call. The check fires BEFORE subprocess invocation per FR-004 / FR-005b — saves a spawn for the most common malformed-base failure mode. Depends on T005, T006.
- [X] T019 [US2] Implement the post-subprocess error classification in handler.ts per research.md R4 stage 3 + R5. After `invokeCli` returns: inspect `result.stderr` and `result.stdout` for known error patterns BEFORE attempting the JSON.parse path from T007. The classification table is populated empirically during /speckit-implement T0 probes against the authorised test vault — fixtures cover (a) invalid-yaml `.base` file, (b) missing-required-key (e.g., no `views:` block), (c) unsupported-schema-version, (d) view-name miss. The classifier maps upstream's verbatim error message (a substring or regex pattern per the captured T0 fixtures) to one of: `CLI_REPORTED_ERROR + details.code: "VIEW_NOT_FOUND" + details.view_name + details.base_path`; `CLI_REPORTED_ERROR + details.code: "BASE_MALFORMED" + details.reason ∈ {"invalid-yaml", "missing-required-key", "unsupported-schema-version", "unknown"} + details.base_path + details.message` (the upstream message verbatim per Principle IV chain-of-custody). When no pattern matches, fall back to `BASE_MALFORMED + details.reason: "unknown"` — chain-of-custody preserved via `details.message`. Implementation note: the pattern-match table lives as a private constant array in handler.ts (or a small classifier module if it grows beyond ~5 entries); each entry is `{ pattern: RegExp, classify: (match) => { code, reason? } }`. T0 fixtures populate the patterns; the classifier is regression-tested in T020. Depends on T018, T007.
- [X] T020 [US2] Implement the FR-005a view-name post-check in handler.ts per research.md R5. After T019's classification: IF upstream succeeded (no error classifier fired) AND the wire envelope parsed OK, the view exists. **Post-check**: if upstream's response includes a view-name echo (e.g., in metadata; confirmed at T0 probe time), compare against `input.view_name` for exact case-sensitive match. If they differ, surface as `CLI_REPORTED_ERROR + details.code: "VIEW_NOT_FOUND"` to preserve the FR-005a contract regardless of upstream's matching semantics. If upstream does NOT echo the view name (more likely), this task is a no-op — the FR-005a contract is enforced de facto by passing the caller's `view_name` verbatim. Document the resolved approach in handler.ts's inline comment. Depends on T019.
- [X] T021 [US2] Extend handler.test.ts with the US2 test cohort. Cases: BASE_NOT_FOUND — mocked `fs.stat` throws `ENOENT` → envelope is `CLI_REPORTED_ERROR + details.code: "BASE_NOT_FOUND" + details.base_path`; mocked `fs.stat` returns `{ size: 0 }` → envelope is `BASE_MALFORMED/empty`; mocked `fs.stat` returns valid stats AND mocked `spawnFn` returns the invalid-yaml fixture stderr → `BASE_MALFORMED/invalid-yaml`; mocked spawn returns the missing-required-key fixture → `BASE_MALFORMED/missing-required-key`; mocked spawn returns the unsupported-version fixture → `BASE_MALFORMED/unsupported-schema-version`; mocked spawn returns an unrecognised error → `BASE_MALFORMED/unknown` with the verbatim message preserved in `details.message`; mocked spawn returns the view-not-found fixture → `VIEW_NOT_FOUND` with `details.view_name` and `details.base_path`; PATH_ESCAPES_VAULT — mocked `realpath` returns a path outside the vault root → envelope is `PATH_ESCAPES_VAULT` + `pathEscapeAttempt` logger event asserted; mocked path-traversal `base_path` is caught at schema layer (already covered by T004 — this verifies the handler-layer check doesn't double-fire). All error envelopes include the expected `details` fields per [contracts/errors.md](contracts/errors.md). **Explicit read-only assertion** — no fs.writeFile / fs.rename calls anywhere in the test cohort per FR-015. Depends on T018, T019, T020.

**Checkpoint**: US2 ships the diagnostic-error classification. Quickstart examples 5–8 pass live. The four-state self-describing response (success-with-rows / success-with-empty-rows / error-missing-file / error-missing-view) per SC-002 is now exercised by tests + live probes.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: T0 live-CLI captures, docs, README update, baseline cleanup, quality-gate final pass.

- [X] T022 Author the progressive-disclosure docs at [docs/tools/query_base.md](docs/tools/query_base.md) — fills in the T002 placeholder. Sections: when to reach for this tool, input shape (link to [contracts/input.schema.json](contracts/input.schema.json)), output shape (link to [contracts/output.schema.json](contracts/output.schema.json)), error cohort (link to [contracts/errors.md](contracts/errors.md)), worked examples (lift from quickstart.md), Bases-family cohort cross-reference (siblings `bases`, `views_base`, `create_base`). Surfaced by `help()` per ADR-005. Depends on T017 (registration done, tool available for the doc to describe).
- [ ] T023 Run T0 live-CLI capture against the authorised test vault per quickstart.md (all 11 examples) and [.memory/test-execution-instructions.md](.memory/test-execution-instructions.md). Each example captures request payload + response payload + invariant verifications to `specs/039-query-base/t0-capture/example-N.md`. Pass / Fail recorded per example. Failures surface as remediation entries — added back into Phase 3 or 4 as fix-up tasks before merge. Includes the five R10-deferred probes from research.md: exact upstream error wording (drives T019 classifier), closed-vault behaviour (drives whether T012 is dead code), no-sort emission order (confirms T009 baseline behaviour), user-defined dotted-namespace column handling (confirms FR-002d passthrough), symlink-escape via `base_path` (confirms T018 Layer-2 check).
- [ ] T023a Based on T023's closed-vault probe finding: if upstream `base:query` surfaces a closed-but-registered vault cleanly via non-zero exit code or a recognisable stderr pattern (the more likely outcome for native subcommands), remove the T012 detection branch from handler.ts as dead code AND remove the corresponding "closed-vault detection" case from handler.test.ts. If upstream returns empty stdout silently (the eval-cohort failure mode), KEEP T012 and document the empirical finding inline in handler.ts. Either outcome is correct — this task records the decision once the probe data is in hand. Depends on T023.
- [X] T024 [P] Update [README.md](README.md) tool list (if the README enumerates typed tools) to add `query_base` with a one-line description. Sibling-parity check: BI-038 added `find_and_replace` to the same list — match the entry shape exactly.
- [X] T025 Verify the full quality-gate cohort passes per Constitution §Development Workflow & Quality Gates: `npm run lint` (zero warnings), `npm run typecheck`, `npm run build`, `vitest run` (full suite + the new query_base cohort), `vitest --coverage` (aggregate statements coverage at or above the configured threshold). Depends on every preceding task.

**Checkpoint**: BI-039 is ready for `/speckit-analyze` and PR.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies. T001 + T002 can run in parallel (T002 marked [P]).
- **Phase 2 (Foundational)**: Depends on Phase 1 completion. T003 + T004 are sequential (T004 imports types from T003).
- **Phase 3 (US1)**: Depends on Phase 2. Within US1: T005 is the gatekeeper; T006 → T007 → T008 → T009 → T010 → T011 form the response-shape chain; T012 layers on top; T013 (handler tests) is the integration gate; T014 + T015 + T016 + T017 are the registration tail.
- **Phase 4 (US2)**: Depends on Phase 3 (specifically T005 / T006 / T007 — extends the same handler). T018 → T019 → T020 → T021 sequential.
- **Phase 5 (Polish)**: T022 depends on T017; T023 depends on T016 (tool callable + handler complete through US2); T024 [P]; T025 final gate.

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational. Ships the MVP — caller has a usable happy-path query against any view in any `.base` file.
- **US2 (P2)**: Depends on US1's handler skeleton (T005, T006, T007). Strictly additive — does not modify US1 behaviour, only adds pre-flight and post-subprocess error-classification stages that intercept failure paths US1 left as raw upstream surface.

### Within Each User Story

- Tests are MANDATORY (Principle II) — co-located in the same task or the immediately-following task in the same phase.
- Schema before handler.
- Handler skeleton before specific stages.
- Handler complete before registration.
- Registration complete before baseline update.
- Quickstart validation only after every preceding task lands.

### Parallel Opportunities

- Phase 1: T001 + T002 parallel.
- Phase 2: T003 is the gatekeeper; T004 depends on it (cannot parallelise — schema types feed schema tests).
- Phase 3: T005..T012 must serialize because they all extend the same `handler.ts` file. T013 (handler.test.ts) waits on T012 but is a single file. T014 + T015 (index.ts + index.test.ts) are sequential by dependency. T016 + T017 (server.ts + baseline JSON) are sequential.
- Phase 4: T018..T021 serialize because they all extend the same `handler.ts` + `handler.test.ts`.
- Phase 5: T024 [P] (README — different file); the rest are gated by completion of preceding phases.

---

## Parallel Example: Phase 1 Setup

```text
# T001 + T002 can run together — they touch different files.
Task: "Create src/tools/query_base/ module directory with header-only stubs for schema.ts, handler.ts, index.ts, and their *.test.ts siblings (T001)"
Task: "Create docs/tools/query_base.md placeholder with attribution header (T002)"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Complete Phase 1: Setup (T001 + T002).
2. Complete Phase 2: Foundational (T003 + T004) — schema + schema tests.
3. Complete Phase 3: US1 (T005–T017) — happy-path envelope, ordering, truncation, registration.
4. **STOP and VALIDATE**: run quickstart.md examples 1–4 + 11 against the authorised test vault.
5. The MVP is shippable here — caller can query any view that exists with no diagnostic richness on the missing-thing failure modes (those still surface as raw upstream errors but route through `CLI_REPORTED_ERROR`).

### Incremental Delivery

1. MVP (US1) → demo / merge increment.
2. Add US2 (T018–T021) → callers can branch on `details.code` to distinguish BASE_NOT_FOUND / BASE_MALFORMED (five sub-reasons) / VIEW_NOT_FOUND.
3. Polish (T022–T025) → docs + T0 captures + README + quality-gate final pass.

### Critical-Path Sequential Dependencies

- T003 → T004 → handler can refer to schema types
- T005 → T006 → T007 → T008 → T009 → T010 → T011: response-shape chain MUST be built bottom-up
- T012: closed-vault detection layered on top of T006's `invokeCli` return
- T013 covers T005..T012 — single test file, single task
- T014 → T015 → T016 → T017: registration tail
- T018 → T019 → T020: US2 error-classification chain
- T017 → T022 (docs reference the registered tool name) → T023 (T0 captures run against the registered tool) → T025 (quality gates verify the full surface)

---

## Notes

- [P] = different files, no shared dependencies on incomplete tasks. Most handler tasks are NOT [P] because they all extend the same `handler.ts` file.
- [Story] label appears ONLY on user-story-phase tasks (US1 / US2). Setup, Foundational, and Polish tasks do NOT carry a Story label.
- Co-located test files are MANDATORY per Constitution Principle II — every task that adds production code in this BI carries the corresponding test extension in the same task OR in the immediately-following test task in the same phase.
- T0 live-CLI capture (T023) is gated by the unit-test cohort being green AND by the test-execution-instructions in `.memory/test-execution-instructions.md` — the assistant MUST read that file before any FS-touching probe.
- Commit boundaries: per Phase 2 (foundational batch), per User Story (story complete + test green + checkpoint validated), per Polish-task (each polish item is its own commit).
- Avoid: rewriting schema.ts in US1+ phases (schema is locked in T003 and only extended by Polish-stage doc tasks); cross-story dependencies that break independence (US2 is strictly additive to US1 — US1 must be shippable without US2's diagnostic richness).
- ADR-003 deviation: the schema does NOT use `target_mode` per the plan's Complexity Tracking entry — v1 excludes active-file targeting per the spec's out-of-scope clause. Tests should NOT assert any `target_mode` field on the input.
