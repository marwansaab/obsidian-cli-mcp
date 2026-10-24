# Tasks: List Tags

**Input**: Design documents from `specs/068-list-tags/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)
**Governing decisions**: ADR-010 (naming), ADR-015 (sub-discriminators), ADR-032 (sibling locators), ARCH-014 (Tool categories), plus the spec's plan-stage ruling (no `target_mode`).

**Tests**: REQUIRED. Constitution Principle II is non-negotiable, and spec FR-024 / AC-15 require every acceptance criterion to be locked by a regression test. Tests are co-located `*.test.ts` files that run in-process with a mocked spawn (`makeRegistrationStubSpawn` from `src/tools/_registration-stub.ts`, or the `_handler-test-fixtures.ts` helpers). They need no live CLI. Live probes (Phase 1) and live quickstart scenarios (T043) are gated by `.memory/test-execution-instructions.md`.

**This is a NEW-tool feature.** All production code lives in `src/tools/tags/`, plus one registration line in `src/server.ts`. It reuses, without editing, `src/cli-adapter/cli-adapter.ts` (`invokeCli`), `src/path-safety/schema.ts` (`isStructurallySafePath`, `STRUCTURALLY_UNSAFE_PATH_MESSAGE`), `src/tools/_register.ts` (`registerTool`, the `mapValidationError` hook) and `src/errors.ts` (`UpstreamError`). `src/tools/tags/schema.ts` MUST NOT import `src/target-mode/target-mode.ts` (plan-stage ruling).

> **Post-analyze remediation (2026-10-24)**: owner-approved fixes R1–R7 are logged in spec Clarifications ("analyze remediation"). In this file: T032/T035 now require `details.issues` (zod field paths) on every validation error (R1); `[P]` was removed from same-file test siblings T017, T018, T023, T027 and T031 (R4); and T043 adds quickstart scenario 14 for SC-005 (R7).

**Header rule (Principle V)**: every new `.ts` file starts with `// Original — no upstream. <one-line intent>.`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different file, no dependency on an incomplete task)
- **[Story]**: US1–US5 (user-story phases only)

---

## Phase 1: Setup & T0 Probes (live CLI — gated)

**Purpose**: Pin the upstream wire format and failure signatures that the handler and its tests depend on. Every probe follows [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md) and records evidence there.

**⚠️ GATE**: read `.memory/test-execution-instructions.md` first. It was ABSENT at plan and tasks time. If it is still absent, STOP and escalate to the owner; do not probe any vault.

- [X] T001 Read `.memory/test-execution-instructions.md`, confirm the authorised test vault and scratch subdirectory, and create the seven fixture notes (`fence.md`, `mixed.md`, `hier.md`, `case.md`, `intl.md`, `count.md`, `empty.md`) listed in [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md) inside that scratch subdirectory.
- [X] T002 Run probe P1 (`vault=<V> tags format=json counts`, plus the no-`counts` and `format=tsv` variants) and record verbatim evidence under "## P1 evidence" in [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md): JSON field names, whether names carry a leading `#`, and the count type. If `format=json` is unusable, apply the TSV fallback from [research.md](research.md) § "T0 fallback table" and note it as D1-amend in research.md.
- [X] T003 Run probe P2 (empty-result stdout for `path=<scratch>/empty.md`, and for a tagless vault if the gate file provides one) and record under "## P2 evidence". Decide the `EMPTY_TAGS_SENTINEL` value, or drop the sentinel per the fallback table.
- [X] T004 Run probes P3, P4 and P5 (fenced-code exclusion; frontmatter + inline, hierarchy, case variants, non-ASCII; per-note count meaning) and record under "## P3/P4/P5 evidence". Save the P3 `fence.md` stdout verbatim for reuse as the handler test fixture in T017.
- [X] T005 Run probes P6, P7, P8 and P10 (bare-name `file` resolution and missing-note stdout; `active` with and without a focused note; unknown-vault stdout and exit code; focused-vault `file` without `vault=`) and record under "## P6/P7/P8/P10 evidence". Apply any matching fallback from the research.md fallback table. If the P6 fallback fires (missing note returns an empty listing), amend [plan.md](plan.md) before writing code, because it adds `vaultRegistry` DI.
- [X] T006 Run probe P9 (bytes per entry from the P1 output) and record the derived size ceiling (10 MiB ÷ bytes per entry) under "## P9 evidence".
- [X] T007 Write the probe results back into [spec.md](spec.md) Edge Cases: case variants (observed merged or separate — and if merged, add the "unobservable end-to-end" label to FR-011's byte-order tiebreak per Clarifications Q3), hierarchical presentation, per-note `count` meaning, non-ASCII handling, and the size ceiling. Replace the "characterised by the implement-time T0 probe" pending statements with the observed results.
- [X] T008 Delete the scratch fixture notes per the gate file's cleanup expectations, and record the cleanup in [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md).

**Checkpoint**: wire format, empty signal, and the no-active-note, missing-note and unknown-vault signatures are pinned. The handler can now be written against facts.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The module skeleton, schemas and registration that every story builds on. Each story phase then adds its slice of handler behaviour and its tests.

**⚠️ CRITICAL**: no user-story work begins until this phase completes.

- [X] T009 Create [src/tools/tags/schema.ts](../../src/tools/tags/schema.ts) with: `tagsInputSchema` as a flat `z.strictObject({ vault: z.string().min(1).optional(), file: z.string().min(1).optional(), path: z.string().min(1).optional(), activeOnly: z.boolean().optional(), sortByCount: z.boolean().optional(), includeCounts: z.boolean().optional() })` (no `.default()`s; the scope `superRefine` is added in T034); `tagsUpstreamArraySchema` (a `.loose()` entry schema using the field names pinned by T002); `tagEntrySchema` (`z.strictObject({ name: z.string().min(1), count: z.number().int().nonnegative().optional() })`); and `tagsOutputSchema` (`z.strictObject({ total, tags })` plus a `superRefine` enforcing `total === tags.length`, unique names, and count present on all entries or on none). Export `TagsInput`, `TagsOutput` and `TagEntry` via `z.infer`. Do NOT import `src/target-mode/target-mode.ts`.
- [X] T010 [P] Create [src/tools/tags/schema.test.ts](../../src/tools/tags/schema.test.ts) with output-schema tests: accepts a valid envelope with and without counts; rejects `total !== tags.length`, duplicate names, mixed count presence, an empty `name`, and an extra entry key; accepts `{ total: 0, tags: [] }`. Add an input-schema happy-path test (`{}` and each single field parse). (depends T009)
- [X] T011 Create [src/tools/tags/handler.ts](../../src/tools/tags/handler.ts) with the `ExecuteDeps` interface (`logger`, `queue`, `spawnFn?`, `env?`; parity with `outline/handler.ts`) and the `executeTags(input, deps)` skeleton. It calls `invokeCli({ command: "tags", vault: input.vault, parameters: { format: "json" }, flags: ["counts"], target_mode: "specific" }, …)`, which is the optional-`vault` facade idiom from `properties/handler.ts`. It then parses trimmed stdout as JSON (failure → `UpstreamError` `CLI_REPORTED_ERROR` with `details: { stage: "json-parse", stdout }`), validates it with `tagsUpstreamArraySchema.safeParse` (failure → `CLI_REPORTED_ERROR` with `details: { stage: "upstream-shape", stdout }`), and returns `tagsOutputSchema.parse(...)` of a provisional mapping. Name transform, empty handling, sorting and scoping are added by the story phases. (depends T009)
- [X] T012 Create [src/tools/tags/index.ts](../../src/tools/tags/index.ts) with `TAGS_TOOL_NAME = "tags"`, a provisional `TAGS_DESCRIPTION` (finalised in T039), `RegisterDeps = ExecuteDeps`, and `createTagsTool(deps)` built with `registerTool({ name, description, schema: tagsInputSchema, deps, handler: (input, d) => executeTags(input, d) })`. Leave the `mapValidationError` hook unset for now (added in T035). (depends T011)
- [X] T013 Create the minimal [docs/tools/tags.md](../../docs/tools/tags.md) (title, overview, link to `index.md`) so `assertToolDocsExist` passes at boot. The full page is written in T038.
- [X] T014 Register the tool in [src/server.ts](../../src/server.ts): add `import { createTagsTool } from "./tools/tags/index.js";` and `createTagsTool({ logger, queue }),` in alphabetical position in the tool list (after `createTagTool`). No other edit to `createServer()`; this is a kernel-node touch, so keep it to this one line. (depends T012, T013)
- [X] T015 Create [src/tools/tags/index.test.ts](../../src/tools/tags/index.test.ts) with registration tests: the descriptor name is `tags`; the published `inputSchema` has exactly the six properties, `additionalProperties: false`, and no `target_mode`; a happy-path call through the registered handler with a stub spawn returns a JSON text content block. (depends T012)

**Checkpoint**: `npm run typecheck` and `npm run build` pass; the server boots with `tags` registered; the skeleton returns a parsed envelope.

---

## Phase 3: User Story 1 — Vault-wide tag index with counts (Priority: P1) 🎯 MVP

**Goal**: `tags({})` or `tags({ vault })` returns every distinct tag in the vault, with counts, as bare names in alphabetical order, with `total` equal to the number of entries.

**Independent Test**: With a stubbed upstream array of known tags and counts, the call returns each tag once with its count, `#` stripped, ordered by `compareTagNames`, and `total` equal to the length. Empty upstream returns `{ total: 0, tags: [] }`.

### Tests for User Story 1

- [X] T016 [P] [US1] In [src/tools/tags/handler.test.ts](../../src/tools/tags/handler.test.ts), add argv tests (AC-1, AC-10): with no `vault`, argv contains `tags format=json counts` with no `vault=`, `file=`, `path=` or `active`; with `vault: "V"`, argv starts with `vault=V`.
- [X] T017 [US1] In [src/tools/tags/handler.test.ts](../../src/tools/tags/handler.test.ts), add content tests:
  - AC-1: counts carried; `total` equals the length.
  - FR-013: exactly one leading `#` stripped (`#alpha` → `alpha`; `##x` → `#x`; a name without `#` is left unchanged); hierarchical `parent/child` and non-ASCII `café` / `日本語` pass through byte-identical.
  - AC-16: built-in-looking names (`todo`, `inbox`, `important`) pass through unchanged.
  - AC-8: the T004 `fence.md` stdout fixture yields `t068-real` and not `t068-fenced`.
  - Default order: case-insensitive first, then byte tiebreak (`Alpha` before `alpha`; `beta` after both), independent of upstream order.
- [X] T018 [US1] In [src/tools/tags/handler.test.ts](../../src/tools/tags/handler.test.ts), add empty and failure tests:
  - AC-7: `[]` and, if T003 pinned one, the exact sentinel → `{ total: 0, tags: [] }`; a near-miss sentinel string → `CLI_REPORTED_ERROR` `json-parse`.
  - UNDERLYING: stub stdout `Vault not found.` with exit 0 → `CLI_REPORTED_ERROR` (the `invokeCli` re-classification, locked for `tags`; plus the explicit handler check if T005 applied the P8 fallback).
  - Non-JSON stdout → `json-parse`; a wrong array shape → `upstream-shape`; over-cap output → `CLI_OUTPUT_TOO_LARGE`.
- [X] T019 [P] [US1] In [src/tools/tags/index.test.ts](../../src/tools/tags/index.test.ts), add a test that an upstream array producing a duplicate name after the `#` strip (e.g. `#a` and `a`) surfaces as `INTERNAL_ERROR` through `registerTool`'s runtime-ZodError branch (FR-010 safety net).

### Implementation for User Story 1

- [X] T020 [US1] In [src/tools/tags/handler.ts](../../src/tools/tags/handler.ts), implement and export `stripLeadingHash(name)` (removes exactly one leading `#`) and `compareTagNames(a, b)` (compare `a.toLowerCase()` with `b.toLowerCase()` by UTF-16 code unit, then `a` with `b` by code unit; never `localeCompare`). Then map upstream entries to `{ name, count }`, sort ascending by `compareTagNames`, and build `{ total, tags }`. (depends T011)
- [X] T021 [US1] In [src/tools/tags/handler.ts](../../src/tools/tags/handler.ts), add empty-result handling per research D5: export `EMPTY_TAGS_SENTINEL` with the T003 value (or omit it per the fallback); treat trimmed-empty stdout (only if T003 observed it), `[]`, and an exact sentinel match as `{ total: 0, tags: [] }` before JSON parsing. Add the explicit unknown-vault signature check only if T005 applied the P8 fallback. (depends T020)

**Checkpoint**: US1 tests green. `tags({ vault })` is a usable MVP.

---

## Phase 4: User Story 2 — Scope the listing to a single note (Priority: P1)

**Goal**: `file`, `path` or `activeOnly: true` restricts the listing to one note's tags. No active note gives `ERR_NO_ACTIVE_FILE` with the `tags`-specific recovery hint, and a missing note is a structured error, never an empty list.

**Independent Test**: Stubbed argv carries `file=` / `path=` / `active` as specified, and a `vault=` prefix exactly when `vault` is supplied. The no-active-note stdout yields `ERR_NO_ACTIVE_FILE` whose message names `file` and `path`. The missing-note stdout yields `CLI_REPORTED_ERROR`.

### Tests for User Story 2

- [X] T022 [P] [US2] In [src/tools/tags/handler.test.ts](../../src/tools/tags/handler.test.ts), add scope argv tests:
  - AC-2: `file: "Note"` → `file=Note`.
  - AC-3: `path: "dir/Note.md"` → `path=dir/Note.md`.
  - AC-10: `file` and `path` each with and without `vault` → `vault=` prefix present only when supplied.
  - AC-4: `activeOnly: true` → `active` flag and no `vault=`.
  - `activeOnly: false` adds no flag.
- [X] T023 [US2] In [src/tools/tags/handler.test.ts](../../src/tools/tags/handler.test.ts), add scope failure tests:
  - AC-13: the T005-pinned no-active-note stdout (expected `Error: No active file.`) → `ERR_NO_ACTIVE_FILE`; the message equals the `tags` message naming `file` and `path`; `cause` is the dispatch error; the original `details` are preserved.
  - FR-017: the T005-pinned missing-note stdout → `CLI_REPORTED_ERROR` carrying the upstream message.
  - An untagged note → `{ total: 0, tags: [] }`.

### Implementation for User Story 2

- [X] T024 [US2] In [src/tools/tags/handler.ts](../../src/tools/tags/handler.ts), add `file` / `path` to `parameters` when set, and the `active` flag when `activeOnly === true`. The `invokeCli` facade `target_mode` stays `"specific"`, so `file` and `path` are never stripped (research D2). (depends T021)
- [X] T025 [US2] In [src/tools/tags/handler.ts](../../src/tools/tags/handler.ts), wrap the `invokeCli` call: catch an `UpstreamError` whose `code === "ERR_NO_ACTIVE_FILE"`, and re-throw `new UpstreamError({ code: "ERR_NO_ACTIVE_FILE", cause: err, details: err.details, message: "No active file in Obsidian. Open a note in the editor, or call tags with `file` or `path` instead of `activeOnly`." })`. Re-throw every other error unchanged; no fallback result (Principle IV). Add the explicit no-active-note signature detection only if T005 applied the P7 fallback. (depends T024)

**Checkpoint**: US1 and US2 tests green. Single-note scoping works independently of the ordering options.

---

## Phase 5: User Story 3 — Control ordering and payload weight (Priority: P1)

**Goal**: `sortByCount: true` orders by count descending, with ties broken by `compareTagNames`. `includeCounts: false` removes the `count` key from every entry, and the count order still applies.

**Independent Test**: Stubbed upstream tags with distinct and tied counts in scrambled order: `sortByCount` output has non-increasing counts with name-ordered ties; default output is name-ordered; `includeCounts: false` entries have exactly the key set `["name"]`.

### Tests for User Story 3

- [X] T026 [P] [US3] In [src/tools/tags/handler.test.ts](../../src/tools/tags/handler.test.ts), add ordering tests (AC-5): `sortByCount: true` gives count descending with ties broken by `compareTagNames`, including a case-variant tie pair (`Alpha` / `alpha`) and a non-ASCII pair; the default ignores counts; upstream order never leaks; argv never contains `sort=count`.
- [X] T027 [US3] In [src/tools/tags/handler.test.ts](../../src/tools/tags/handler.test.ts), add projection tests (AC-6): with `includeCounts: false`, every entry's `Object.keys` equals `["name"]`; combined with `sortByCount: true`, the order is still by count; argv still contains `counts` in both cases.

### Implementation for User Story 3

- [X] T028 [US3] In [src/tools/tags/handler.ts](../../src/tools/tags/handler.ts), sort by count descending then `compareTagNames` when `input.sortByCount === true`; otherwise use `compareTagNames` alone. Sort before projection, using the upstream counts. (depends T021)
- [X] T029 [US3] In [src/tools/tags/handler.ts](../../src/tools/tags/handler.ts), project the entries: when `input.includeCounts === false`, build `{ name }` only (key absent, not `undefined`); otherwise build `{ name, count }`. (depends T028)

**Checkpoint**: US1–US3 tests green. Every P1 output behaviour is in place.

---

## Phase 6: User Story 4 — Reject malformed requests before anything runs (Priority: P1)

**Goal**: Scope conflicts, `activeOnly` with `vault`, unsafe `file` or `path`, a bracketed `file`, and unknown keys all fail as `VALIDATION_ERROR` before any spawn. Conflicts carry `details.code: "SCOPE_CONFLICT"` with `details.reason` set to one of the [contracts/input.md](contracts/input.md) reasons; unsafe locators carry `INVALID_NOTE` / `path-traversal`.

**Independent Test**: For every row of the scope matrix and every field-level rejection, calling the registered handler with a spawn spy returns the expected error payload, and the spawn spy is never called.

### Tests for User Story 4

- [X] T030 [P] [US4] In [src/tools/tags/schema.test.ts](../../src/tools/tags/schema.test.ts), add `superRefine` tests:
  - Each scope-matrix row emits one `custom` issue with the right `params.subCode` / `params.subReason`: `file+path`, `active+note` (with `file`, and with `path`), `active+vault`. A four-way conflict reports only the first row's reason.
  - Allowed rows parse: `file`+`vault`, `path`+`vault`, `vault` alone, `activeOnly: true` alone, `activeOnly: false`+`file`.
  - Unsafe `file` / `path` (`../x.md`, `/abs.md`, `\\abs.md`, `C:\\x.md`, a control character) → `INVALID_NOTE` / `path-traversal`.
  - `file: "[[Note]]"` is rejected; `vault: ""` is rejected.
- [X] T031 [US4] In [src/tools/tags/schema.test.ts](../../src/tools/tags/schema.test.ts), add the unknown-key tests (AC-11): `{ target_mode: "specific" }`, `{ sort: "count" }` and `{ foo: 1 }` → `unrecognized_keys`. The test description states the dual-pathway distinction: clients that strip keys absent from the published schema never send them, so this server-side rejection is observable only on forwarding clients; this test exercises the server path directly.
- [X] T032 [P] [US4] In [src/tools/tags/index.test.ts](../../src/tools/tags/index.test.ts), add end-to-end validation tests through the registered handler, each using a spawn spy asserted never called (AC-9, AC-11, AC-12, FR-007):
  - `{file, path}` → `VALIDATION_ERROR` / `SCOPE_CONFLICT` / `file+path`.
  - `{activeOnly: true, file}` → `active+note`.
  - `{activeOnly: true, vault}` → `active+vault`.
  - `{path: "../x.md"}` → `INVALID_NOTE` / `path-traversal`.
  - `{file: "[[x]]"}` → generic `VALIDATION_ERROR` whose message asks for the bare name.
  - An unknown key → generic `VALIDATION_ERROR` with `issues`.
  - For every case above, `details.issues` is a non-empty array of `{ path, message, code }`. For `INVALID_NOTE`, `details.issues[0].path` equals `["file"]` or `["path"]` (Principle III field paths; remediation R1).

### Implementation for User Story 4

- [X] T033 [US4] In [src/tools/tags/schema.ts](../../src/tools/tags/schema.ts), add field-level checks to a `superRefine` on `tagsInputSchema`:
  - `file` / `path` failing `isStructurallySafePath` → a `custom` issue on that path with `STRUCTURALLY_UNSAFE_PATH_MESSAGE` and `params: { subCode: "INVALID_NOTE", subReason: "path-traversal" }`.
  - `file` containing `[[` or `]]` → a `custom` issue with no `params`, whose message asks for the bare note name (parity with `find_and_replace/schema.ts`).

  (depends T009)
- [X] T034 [US4] In [src/tools/tags/schema.ts](../../src/tools/tags/schema.ts), add the scope-matrix check to the same `superRefine`, treating `activeOnly !== true` as not set. Check the rows in contract order (`file+path`, `active+note`, `active+vault`) and emit exactly one `custom` issue for the first match, with `params: { subCode: "SCOPE_CONFLICT", subReason }` and a message from a local `SCOPE_CONFLICT_MESSAGES` map. Do not extract a shared helper (research D3). (depends T033)
- [X] T035 [US4] In [src/tools/tags/index.ts](../../src/tools/tags/index.ts), add `mapZodIssuesToToolError` and pass it as `mapValidationError`:
  - Build `mappedIssues = issues.map(i => ({ path: i.path, message: i.message, code: i.code }))` once.
  - A `custom` issue with `params.subCode` → `{ code: "VALIDATION_ERROR", message, details: { code: subCode, reason: subReason, issues: mappedIssues } }`. This is the exact shape of `find_and_replace/index.ts` `mapZodIssuesToToolError`, so the zod field paths are always reported (Constitution Principle III; remediation R1).
  - Otherwise → the generic `VALIDATION_ERROR` envelope with `details: { issues: mappedIssues }`.

  No new top-level code. (depends T034, T012)

**Checkpoint**: All P1 stories are complete; SC-003 holds (no invalid shape reaches the CLI).

---

## Phase 7: User Story 5 — Discover the contract through the help facility (Priority: P2)

**Goal**: `help({ tool_name: "tags" })` returns the full page, and the help index lists `tags` with a summary that sets it apart from `tag`.

**Independent Test**: The docs page contains the input table, the output shape, the error roster, the inherited limitations, and at least four worked-example headings (vault-wide, file-scoped, sortByCount, activeOnly). The index line exists.

### Tests for User Story 5

- [X] T036 [P] [US5] In [src/tools/tags/index.test.ts](../../src/tools/tags/index.test.ts), add a docs test (AC-14): read `docs/tools/tags.md` and assert it contains the six field names, `total`, every error code from [contracts/errors.md](contracts/errors.md), and at least four example headings covering vault-wide, file-scoped, `sortByCount` and `activeOnly`. Read `docs/tools/index.md` and assert a `**tags**` line exists.

### Implementation for User Story 5

- [X] T037 [P] [US5] Add the `tags` line to [docs/tools/index.md](../../docs/tools/index.md) in alphabetical position after `tag`. It summarises the return shape `{ total, tags: [{ name, count? }] }`, bare names, the scope options, `sortByCount` / `includeCounts`, and how it differs from `tag` (inventory vs. per-tag file list).
- [X] T038 [US5] Write the full [docs/tools/tags.md](../../docs/tools/tags.md), following the section structure of `docs/tools/tag.md` (Overview, Input contract, Per-field policy, Output, Errors, Examples, Inherited limitations). Include:
  - the input table and scope matrix from [contracts/input.md](contracts/input.md), with the AC-11 client-class note;
  - the output guarantees from [contracts/output.md](contracts/output.md);
  - the error roster from [contracts/errors.md](contracts/errors.md), quoting the T005-pinned upstream wording;
  - five worked examples: vault-wide, file-scoped, path-scoped with `vault`, `sortByCount`, and `activeOnly` (plus `includeCounts: false` inline);
  - the inherited limitations, using the T004/T006/T007 results: staleness window, case variants (plus the tiebreak label if case variants merge), non-ASCII, hierarchy, per-note count meaning, fenced-code exclusion, frontmatter + inline, and the size ceiling. State explicitly that frontmatter + inline coverage (FR-015) is an inherited index behaviour verified live (probe P4, quickstart scenario 2), not by an in-process test, because the wrapper adds no logic there (analyze finding C2).
  
  (depends T007)
- [X] T039 [US5] Finalise `TAGS_DESCRIPTION` in [src/tools/tags/index.ts](../../src/tools/tags/index.ts). It must cover: the return shape; optional `vault` (focused vault when omitted); at most one of `file` / `path` / `activeOnly`; `activeOnly` forbids `vault`; bare names; alphabetical or `sortByCount` order; `includeCounts: false`; the contrast with `tag`; and a pointer to `help({ tool_name: "tags" })`. (depends T035)
- [X] T040 [P] [US5] Add a `tags` row to the tools table in [README.md](../../README.md) after the `tag` row: "Vault-wide tag inventory (or one note's tags) with optional per-tag counts."

**Checkpoint**: All five stories are complete.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T041 Regenerate the registry baseline with `npm run baseline:write` and review the [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) diff: exactly one added `tags` entry, and no other tool's fingerprints moved. (depends T039, all schema tasks)
- [X] T042 Run `npm run lint`, `npm run typecheck`, `npm run build` and `npm test`. All must be green, with zero lint warnings and the statements coverage threshold held. Then run `npx vitest run src/tools/tags` three times and confirm identical results (SC-004 / FR-024). Confirm the AC → test map in [research.md](research.md) § D9 is fully covered, and fill any gap.
- [X] T043 Run the live quickstart scenarios 1–14 in [quickstart.md](quickstart.md). Scenario 14 validates SC-005: build the four documented example requests from `help({ tool_name: "tags" })` output alone; remediation R7. Run them against the authorised test vault (gated by `.memory/test-execution-instructions.md`; recreate and then clean up the fixture notes per the gate). Record the outcomes in `specs/068-list-tags/post-implement.md`.
- [X] T044 Post-implement structural verification per the plan's "Graphify structural check" section. If `graphify-out/` exists, run `/graphify --update`; otherwise verify by source lookup.
  1. No new top-level error code.
  2. `tags/handler.ts` imports no DI factory or sibling tool.
  3. `tags/schema.ts` does not import `target-mode.ts`.
  4. The new production files are connected.
  5. Only the `tags` baseline entry changed.
  6. `createServer()` gained only the one registration line.
  
  Record the results in `specs/068-list-tags/post-implement.md`.
- [X] T045 Confirm every new `.ts` file in `src/tools/tags/` starts with an `// Original — no upstream.` header (Principle V), and that [CLAUDE.md](../../CLAUDE.md) points at `specs/068-list-tags/plan.md` (already rotated at plan time).

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (T0)** blocks Phase 2: T009 needs the P1 field names (T002), and the story tests use the pinned stdout fixtures (T003–T005). If the gate file is absent, the whole BI is blocked; escalate.
- **Phase 2** blocks every story. Inside Phase 2: T009 → (T010 ∥ T011) → T012 → (T014 after T013) ; T015 after T012.
- **US1 (Phase 3)** → **US2 (Phase 4)** and **US3 (Phase 5)**: both build on T021's pipeline in `handler.ts`, and since they edit the same file their implementation tasks run one after another (T024 → T025, T028 → T029; either order between the stories).
- **US4 (Phase 6)** depends only on Phase 2 (`schema.ts` and `index.ts`), so it can run in parallel with US1–US3 implementation if staffed separately. T033 → T034 → T035.
- **US5 (Phase 7)**: T038 needs T007 (probe write-back); T039 needs T035; T037, T040 are independent.
- **Polish**: T041 after T039 and every schema edit; T042 after all; T043 and T044 after T042.

### Cross-module dependency notes (CLAUDE.md `/speckit-tasks` graph rule)

The task list crosses four source modules: `src/tools/tags/**`, `src/server.ts`, `src/cli-adapter/cli-adapter.ts` (consumed) and `src/path-safety/schema.ts` (consumed). The rule asks for `/graphify path` per touched symbol pair, but `graphify-out/` is absent in this checkout, so source lookup stands in. The pairs and their structural paths are:

- `createTagsTool` ↔ `createServer`: direct import edge (T014). It depends on T012 (export exists) and T013 (`assertToolDocsExist` requires the docs file at boot); both dependencies are encoded above.
- `executeTags` ↔ `invokeCli` → `dispatchCli`: a direct call. `dispatchCli` owns the `ERR_NO_ACTIVE_FILE` classification that T025 re-messages, and `invokeCli` owns the unknown-vault re-classification T018 locks. Neither file is edited.
- `tagsInputSchema` ↔ `isStructurallySafePath`: direct import (T033). No transitive path to `target-mode.ts` may exist; T044 verifies this.
- `registerTool` ↔ `mapZodIssuesToToolError` (T035): this is the hook seam, with no `_register.ts` edit. The baseline (T041) transitively depends on `registerTool`'s `toMcpInputSchema` output of the final schema, hence its position after every schema task.

### Parallel opportunities

- Phase 2: T010 (schema tests) ∥ T011 (handler skeleton) once T009 lands. T013 (docs stub) can run any time.
- `[P]` marks only tasks whose file differs from that of every other unfinished task they could run alongside (remediation R4). Same-file siblings (T016 → T017 → T018; T022 → T023; T026 → T027; T030 → T031) run one after another.
- US1: the T016 → T017 → T018 chain (`handler.test.ts`) ∥ T019 (`index.test.ts`).
- US4: the T030 → T031 chain (`schema.test.ts`) ∥ T032 (`index.test.ts`). The whole of US4 can run ∥ US1–US3, because it touches different files apart from `index.ts` (T035 after T012).
- US5: T036 ∥ T037 ∥ T040.

### Parallel example: User Story 4

```text
Task: "T030 [US4] superRefine matrix tests in src/tools/tags/schema.test.ts"
Task: "T032 [US4] end-to-end no-spawn validation tests in src/tools/tags/index.test.ts"
# then sequentially: T033 → T034 (schema.ts) → T035 (index.ts)
```

---

## Implementation Strategy

### MVP first (US1)

1. Phase 1 T0 probes (gated) → 2. Phase 2 skeleton → 3. Phase 3 US1 → **stop and validate**: `tags({ vault })` returns the full bare-name index with counts, alphabetical. Demo-able.

### Incremental delivery

US2 (scoping) → US3 (ordering and projection) → US4 (validation hardening; can land in parallel) → US5 (docs). Each phase ends green and independently testable. All four P1 stories (US1–US4) must ship together for the BI's P1 gate. US5 is P2.

### Notes

- The `/speckit-tasks` graph rule could not use the graph, because `graphify-out/` is absent; source-lookup substitutes are listed above. Re-run the path queries during `/speckit-analyze` if a graph is built by then.
- Live-CLI work (Phase 1, T043) is the only gated work. Every other task is in-process.
- Commit after each phase checkpoint via `/speckit-git-commit`.
