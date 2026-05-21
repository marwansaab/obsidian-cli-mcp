# Implementation Plan: Reconcile Cohort-Wide Tool Doc and Classifier Drift

**Branch**: `041-reconcile-cohort-doc-drift` | **Date**: 2026-05-21 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/041-reconcile-cohort-doc-drift/spec.md`

## Summary

Close two systemic drift classes across the seven cli-mcp tools listed in the spec, in a single coordinated pass that lets a fresh BI-0027 audit clear cohort-wide:

- **Dimension C (classifier widening)** — two targeted edits to the classifier ladder:
  1. `src/cli-adapter/_dispatch.ts:294` — make the `ERR_NO_ACTIVE_FILE` prefix match case-insensitive so the upstream's current capital-N canonical emit (`"Error: No active file."`) classifies; the eval-composed callers (`read_heading`, `find_by_property`) continue to fire through their existing paths because the dispatch-layer classifier is the shared source the spec calls out, and the change is monotonic-widening (the lowercase form keeps matching).
  2. `src/tools/query_base/handler.ts:387-389` — replace the prefer-stderr-fallback-to-stdout logic with a both-channel scan so the upstream's stdout + `exitCode: 0` emit (`"Error: View not found: <name>"`) reaches the existing `classifyUpstreamError()` regex (which already matches the phrase case-insensitively at `handler.ts:165`) and `VIEW_NOT_FOUND` fires with `details.view_name` + `details.base_path` as the handler already constructs them at `handler.ts:393-403`.
- **Dimension B (doc-only reconciliation)** — empirical-claim accuracy edits to four per-tool help-doc artefacts under `docs/tools/` and the matching zod-schema `.describe()` strings under `src/tools/<name>/schema.ts`: `query_base` (empty-view `columns`, type-preservation passthrough, `file.*` column-name emission), `search` (error roster reconciled to the Cowork pathway with explicit strict-rich-pathway-only carve-outs for the two BI-0086 codes), `read_property` (spec + help-doc unified to the live malformed-frontmatter shape captured by T0 probe), `properties` (case-insensitive frontmatter property-name collapse promoted from spec assertion to observed contract).

The two classifier-ladder edits are the only runtime behaviour changes. No new top-level error codes, no new `details.code` sub-discriminator values beyond what already exists, no type-coercion, no client-side YAML parsing, no upstream-display-label remapping. The Out-of-Scope ban from spec stands.

## Technical Context

**Language/Version**: TypeScript 5.x, strict mode (`tsc --noEmit` clean), `target: ES2024`, `module: NodeNext`.
**Primary Dependencies**: `@modelcontextprotocol/sdk` (^1.0.4) for MCP transport; `zod` (^3.23.8) for boundary validation; `zod-to-json-schema` (^3.23.5) for published `inputSchema` rendering.
**Storage**: None (the wrapper is stateless; vault state lives in upstream Obsidian).
**Testing**: `vitest` (^4.1.5) with `@vitest/coverage-v8` (V8 provider). Tests are co-located `*.test.ts` per Principle II. Mock-only at unit scope; T0 live-CLI probes per `.memory/test-execution-instructions.md` for empirical characterisation. Per the project test-scope memory, no integration TC scaffolding under `specs/041-.../test-cases/` — manual probes are tracker-side.
**Target Platform**: Node.js ≥ 22.11 (LTS floor per constitution Technical Standards); cross-platform (macOS / Linux / Windows) since the wrapper resolves the upstream `obsidian` binary across all three.
**Project Type**: Library / CLI bridge — TypeScript MCP server published as `@marwansaab/obsidian-cli-mcp` (`bin: obsidian-cli-mcp`). Single-project structure rooted at `src/`.
**Performance Goals**: Negligible — classifier widening adds one case-insensitive `startsWith` (constant-time over a short literal); both-channel scan replaces one ternary with a small loop. The subprocess spawn dominates by 3-4 orders of magnitude.
**Constraints**: Zero new top-level error codes (Principle IV streak). No regression on the fifteen-tool zero-new-codes streak. Eval-composed tools (`read_heading`, `find_by_property`) must continue to surface `ERR_NO_ACTIVE_FILE` on their canonical failure paths. The two BI-0086 carve-outs (`VALIDATION_ERROR(unrecognized_keys)`, out-of-range `limit`) stay flagged strict-rich-pathway-only in the `search` roster.
**Scale/Scope**: Seven tools in scope, two runtime-code files touched (`src/cli-adapter/_dispatch.ts`, `src/tools/query_base/handler.ts`), four help-doc files touched (`docs/tools/{query_base,search,read_property,properties}.md`), four schema files touched (`src/tools/{query_base,search,read_property,properties}/schema.ts`), and as many co-located test additions as the new acceptance scenarios warrant.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Y / N / N/A | Evidence |
|------|-------------|----------|
| Principle I — Modular Code Organization | **Y** | Edits stay within the established `src/cli-adapter/_dispatch.ts` + per-tool `src/tools/<name>/handler.ts` boundaries. No new modules, no cross-direction imports, no `{schema, tool, handler}.ts` rearrangement. The two classifier widenings are localised; the doc-only edits touch `docs/tools/*.md` and `schema.ts` `.describe()` strings (the published-shape source of truth per Principle III). |
| Principle II — Public Surface Test Coverage | **Y** | Each cohort tool already ships co-located `*.test.ts`; the FRs add new co-located test cases (no parallel `tests/` tree). The classifier widening adds happy-path + failure-or-boundary cases to `src/cli-adapter/_dispatch.test.ts` (capital-N canonical phrase classifies; eval-composed regression guard); the both-channel scan adds cases to `src/tools/query_base/handler.test.ts` (stdout + exitCode 0 emit classifies as VIEW_NOT_FOUND; BASE_NOT_FOUND missing-base branch unregressed). Doc-only edits exercise the help-doc + schema `.describe()` round-trip via `_register-baseline.test.ts` already in place. |
| Principle III — Boundary Input Validation with Zod | **Y** | No input-schema shape changes. `query_base` already emits `details.view_name` + `details.base_path` typed; the both-channel scan reuses the existing classification path. `search` doc reconciliation does not alter the published `inputSchema` (Cowork client-side strip remains a transport contract, not a wrapper schema relaxation). |
| Principle IV — Explicit Upstream Error Propagation | **Y** with one **conditional Complexity Tracking entry**. The two classifier widenings restore typed `details.code` paths that were silently swallowed under the catch-all `CLI_REPORTED_ERROR` — strictly tightening Principle IV compliance, not weakening it. The `read_property` malformed-frontmatter contingency (per Clarifications Q2) may produce a single Complexity Tracking entry if /speckit-analyze rules the captured live shape (empty-value-`type:"unknown"`) does NOT discharge Principle IV's intentional-best-effort-continue clause; the spec's Clarifications Q2 is the authorising decision per Principle IV's "Clarifications entry, ADR, or referenced issue" clause. The decision is **codify live emission, log Complexity Tracking entry if needed, no runtime change**. |
| Principle V — Attribution & Layered Composition | **Y** | All touched files (`_dispatch.ts`, `query_base/handler.ts`, the four schema files, the four help-docs) already carry their `Original — no upstream.` headers. No new files, no upstream code lifted. |
| ADR-010 — Typed Tool Names Mirror Upstream CLI Subcommand | **N/A** | No new typed tool added; the seven cohort tools' names are unchanged. |
| ADR-013 — Plugin-Namespace Tool Naming Convention | **N/A** | No new plugin-namespace tool added. |
| ADR-014 — Plugin-Backed Typed Tools Runtime-Dependency Pattern | **N/A** | No plugin-backed tool added; the seven cohort tools all wrap native upstream CLI subcommands. |
| ADR-015 — Sub-Discriminators via `details.reason` for Multi-State Error Codes | **N/A** | The two widened sub-discriminators (`ERR_NO_ACTIVE_FILE`, `VIEW_NOT_FOUND`) are existing `details.code` values, not new `details.reason` sub-states. No new `(top-level-code, details.code)` pair with multiple sub-states is introduced; no new sub-states are added to existing pairs. |

**Pre-research gate verdict**: PASS. One conditional Complexity Tracking entry is pre-authorised per Clarifications Q2 / Assumption A11 — to be populated only if T0 probe + /speckit-analyze rule the `read_property` live shape a Principle IV deviation. No other gates block.

## Project Structure

### Documentation (this feature)

```text
specs/041-reconcile-cohort-doc-drift/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output — T0 probe plan + classifier-widening empirical anchors + Cowork carve-out evidence
├── data-model.md        # Phase 1 output — touched entities: classifier ladder, sub-discriminator codes, help-doc artefacts, Cowork pathway carve-out roster
├── contracts/           # Phase 1 output — per-tool wire-contract deltas (query_base classification path; search error roster; read_property + properties doc reconciliation)
├── quickstart.md        # Phase 1 output — agent-walkthrough for the four user-visible doc reconciliations + two classifier-widening verification snippets
├── checklists/
│   └── requirements.md  # /speckit-specify quality checklist (already 16/16 pass)
└── tasks.md             # Phase 2 output (/speckit-tasks command — NOT created by /speckit-plan)
```

### Source Code (repository root)

The wrapper is a single TypeScript project rooted at `src/`. The Decision below names the existing layout the BI touches. No directory rearrangement.

```text
src/
├── cli-adapter/
│   ├── _dispatch.ts                  # ★ TOUCH — classifier-ladder ERR_NO_ACTIVE_FILE match widened case-insensitive
│   ├── _dispatch.test.ts             # ★ TOUCH — add capital-N classify + monotonic-widening regression tests
│   ├── cli-adapter.ts                # unchanged
│   ├── cli-adapter.test.ts           # ★ TOUCH — add capital-N classify test mirroring _dispatch.test.ts
│   └── invoke-bounded-cli.{ts,test.ts}
├── errors.ts                          # unchanged (UpstreamError is the typed-error vehicle)
├── tools/
│   ├── query_base/
│   │   ├── handler.ts                 # ★ TOUCH — replace prefer-stderr-fallback ternary with both-channel scan
│   │   ├── handler.test.ts            # ★ TOUCH — add stdout + exitCode 0 classifies-as-VIEW_NOT_FOUND case + BASE_NOT_FOUND regression guard
│   │   ├── schema.ts                  # ★ TOUCH — `.describe()` strings updated for empty-view columns, type-preservation, file.* column-name emission
│   │   ├── schema.test.ts             # ★ TOUCH — schema-description-text assertions on the three updated claims
│   │   ├── index.ts / index.test.ts   # unchanged (description-text assertions live in schema.test.ts)
│   ├── search/
│   │   ├── schema.ts                  # ★ TOUCH — `.describe()` error roster reconciled with Cowork pathway scope + strict-rich-pathway-only flags
│   │   ├── schema.test.ts             # ★ TOUCH — roster-string assertions on FR-009 (a)/(b)/(c)
│   │   ├── handler.ts                 # unchanged (no runtime change for search per Out-of-Scope)
│   │   └── handler.test.ts            # unchanged
│   ├── read_property/
│   │   ├── schema.ts                  # ★ TOUCH — `.describe()` malformed-YAML-frontmatter contract reconciled to live emission captured by T0
│   │   ├── schema.test.ts             # ★ TOUCH — assertion on the unified contract text
│   │   ├── handler.ts                 # unchanged (no runtime change for read_property per Q2 Option A)
│   │   └── handler.test.ts            # unchanged
│   ├── properties/
│   │   ├── schema.ts                  # ★ TOUCH — `.describe()` case-insensitive collapse rule promoted from spec assertion to observed contract
│   │   ├── schema.test.ts             # ★ TOUCH — case-insensitive collapse assertion
│   │   ├── handler.ts                 # unchanged (live emission already collapses per A3; the spec was wrong, not the runtime)
│   │   └── handler.test.ts            # ★ TOUCH — add case-variant-fixture-collapses test
│   ├── delete/                        # unchanged source; tests already cover ERR_NO_ACTIVE_FILE via the dispatch-layer classifier (lowercase fixture). Capital-N classification is exercised at the dispatch layer; no per-tool test change required because the dispatch classifier is the shared seam.
│   ├── rename/                        # same as delete — unchanged
│   ├── outline/                       # same as delete — unchanged
│   ├── read_heading/                  # eval-composed tool — unchanged; regression guard test at _dispatch.test.ts asserts the lowercase form still classifies (monotonic widening invariant)
│   └── find_by_property/              # eval-composed tool — same as read_heading
└── ...                                # other tools / infrastructure unchanged

docs/tools/
├── query_base.md                      # ★ TOUCH — three empirical-claim corrections (empty-view columns, type-preservation, file.* column-name emission)
├── search.md                          # ★ TOUCH — error roster reconciliation + Cowork pathway scope + BI-0086 carve-out flags
├── read_property.md                   # ★ TOUCH — unified malformed-YAML-frontmatter contract matching the live emission captured by T0
└── properties.md                      # ★ TOUCH — case-insensitive collapse rule + retire byte-tiebreak-ordering claim
```

**Structure Decision**: Single-project TypeScript layout per the project's established `src/{cli-adapter,errors,tools,...}` tree (verified by Glob over `src/` and confirmed by the existing fifteen-tool cohort). No new directories. Two runtime-code files touched (`src/cli-adapter/_dispatch.ts`, `src/tools/query_base/handler.ts`); four per-tool schema files touched; four help-docs touched; co-located test additions per Principle II. Help-docs live under `docs/tools/` and ship with the npm package per `package.json` `files: ["dist","docs/tools/**/*.md",...]`.

## Phase 0 — Outline & Research

Three unknowns drive `research.md`:

1. **Live ERR_NO_ACTIVE_FILE emit shape on `delete` / `rename` / `outline` (T0 probe)** — confirm the canonical phrase is `"Error: No active file."` (capital N + period terminator) on the supported upstream floor for all three subcommands. Decision payload: exact byte string per subcommand, exit code, output channel (stdout vs stderr).
2. **Live VIEW_NOT_FOUND emit shape on `query_base` (T0 probe)** — confirm the channel (stdout, per spec) and exit code (0, per spec) for the `Error: View not found: <name>` emit against a fixture `.base` with a declared view + a mis-named view-name argument. Decision payload: channel × exit code × verbatim message bytes × whether stderr is empty or carries an incidental warning.
3. **Live `read_property` malformed-YAML-frontmatter emit shape (T0 probe)** — capture the wire shape against a fixture note with intentionally broken frontmatter. Decision payload: which of {empty-value-`type:"unknown"`, typed UpstreamError code, mixed} the wrapper currently emits. Drives the Principle IV contingency: if shape is empty-value-`type:"unknown"`, /speckit-analyze rules whether it satisfies Principle IV's intentional-best-effort-continue clause; if not, Complexity Tracking entry per Q2.

Two best-practice / patterns tasks:

4. **Cowork pathway carve-out evidence for `search`** — verify the two BI-0086 carve-out codes (`VALIDATION_ERROR(unrecognized_keys)`, out-of-range `limit`) are Cowork-unreachable AND strict-rich-pathway-reachable. Decision payload: a minimal MCP request via each pathway demonstrating the asymmetry, plus the roster format the `search` help-doc adopts to flag strict-rich-pathway-only codes (e.g. `(strict-rich pathway only — BI-0086)` suffix).
5. **Doc-edit-vs-emission diff method for `query_base` Story 3** — for each of the three claims, draft the empirical-anchor capture (one minimal fixture per claim: an empty view; a view with an integer frontmatter column; a view with `file.path` + `file.name`). Decision payload: the doc text + the fixture command + the captured response, side-by-side, so the help-doc edit is verifiably accurate.

**Method**: Each T0 probe runs against the authorised test vault per `.memory/test-execution-instructions.md`. Mock-only unit tests handle the regression coverage; T0 probes anchor the empirical claims. No new test categories beyond what the project already runs.

**Output**: `research.md` with Decision / Rationale / Alternatives entries for each of the five tasks. All NEEDS CLARIFICATION items in the spec are already resolved (Q1 + Q2 in Clarifications); the Phase 0 outputs feed the doc-edit drafts in Phase 1.

## Phase 1 — Design & Contracts

**Prerequisites**: `research.md` complete with the five Decisions above.

### 1. Data model (`data-model.md`)

Touched entities (per spec Key Entities, with implementation anchors):

- **Classifier ladder** — instances at `src/cli-adapter/_dispatch.ts` (priorities a/b/c/d, line numbers 228–322) and `src/tools/query_base/handler.ts` (`classifyUpstreamError`, lines 159–190). Edit: case-insensitive `startsWith` on priority (b); both-channel message-source resolution in `query_base` stage 4.
- **Sub-discriminator code** — `details.code` values `ERR_NO_ACTIVE_FILE` (existing; widened classification entry), `VIEW_NOT_FOUND` (existing; widened channel scope), `BASE_NOT_FOUND` (unchanged regression-guard target). No new code values introduced.
- **Wrapper help doc / schema description** — paired artefacts: `docs/tools/<name>.md` (rendered help-doc, shipped via `package.json` `files`) + `src/tools/<name>/schema.ts` (zod `.describe()` strings, source of `inputSchema` published shape via `zod-to-json-schema`). The two MUST agree.
- **Cowork pathway carve-out** — `search` roster only. Two entries flagged strict-rich-pathway-only: `VALIDATION_ERROR(unrecognized_keys)`, out-of-range `limit`. Carve-out flag format pinned in `research.md` Task 4.
- **BI-0027 audit** — external verification gate; no in-repo data shape. The plan's deliverable is the conditions for cohort-wide pass clearance, not a re-implementation of the audit.

### 2. Contracts (`contracts/`)

Wire-contract deltas per touched tool. Each contract file documents the **before-vs-after** wire shape for the FR it satisfies. The format mirrors the project's established `contracts/` convention from BI-039 (`specs/039-query-base/contracts/`).

- `contracts/cli-adapter-classification.md` — priority-(b) widening: pattern table before/after; monotonic-widening invariant proof (lowercase form stays matched); eval-composed callers' regression-guard wire shapes.
- `contracts/query_base-classification.md` — stage-4 both-channel scan: before/after pseudo-code; VIEW_NOT_FOUND wire shape (matches existing `handler.test.ts:592` test); BASE_NOT_FOUND unchanged wire shape; the `[`-prefix short-circuit guard preserved.
- `contracts/query_base-doc-shape.md` — three empirical-claim corrections with the captured fixture responses from `research.md` Task 5.
- `contracts/search-roster.md` — full reconciled roster; BI-0086 carve-out flags inline; the assertion harness `schema.test.ts` will exercise.
- `contracts/read_property-malformed-frontmatter.md` — unified contract text matching the live shape from `research.md` Task 3; Complexity Tracking placeholder for the conditional Principle IV deviation.
- `contracts/properties-dedup.md` — case-insensitive collapse rule promoted from spec assertion; fixture-vault layout for the `noteCount: 2` test (`AaTest` + `aatest`).

### 3. Quickstart (`quickstart.md`)

Agent-walkthrough:

- **Verify ERR_NO_ACTIVE_FILE on delete/rename/outline**: spawn each in active mode against a vault with no focused file; assert `details.code: ERR_NO_ACTIVE_FILE` + verbatim recovery message (the verbatim string is already pinned at `_dispatch.ts:302`).
- **Verify VIEW_NOT_FOUND on query_base**: against a fixture `.base` with one declared view; query with a mis-named view; assert `details.code: VIEW_NOT_FOUND` + `details.view_name` + `details.base_path`.
- **Verify BASE_NOT_FOUND regression-guard**: against a non-existent `.base` path; assert `details.code: BASE_NOT_FOUND` (unchanged).
- **Verify search roster on Cowork pathway**: enumerate the post-strip-and-coerce reachable invocations; assert each fires a roster code; assert the two BI-0086 carve-outs do NOT fire on Cowork; cross-check the strict-rich pathway via MCP Inspector for the two carve-outs.
- **Verify query_base response-shape doc on three claims**: run the three captured fixtures from `research.md` Task 5; assert the doc text matches the response on each claim.
- **Verify read_property unified contract**: query a fixture note with malformed YAML; assert the live shape matches the spec + help-doc text (the unification target — not the runtime shape itself).
- **Verify properties case-insensitive collapse**: query a vault with `AaTest` + `aatest`; assert `noteCount: 2` + the help-doc collapse rule text.

### 4. Agent context update

The repo's `CLAUDE.md` carries the active-plan reference between `<!-- SPECKIT START -->` and `<!-- SPECKIT END -->` markers (per the spec-kit convention). The reference will be updated to point at `specs/041-reconcile-cohort-doc-drift/plan.md`. The active-narrative block stays minimal — no per-BI inline ADR additions (ADR-010 / ADR-013 / ADR-014 / ADR-015 references remain unchanged; this BI is N/A on all four per the Constitution Check table).

**Output**: `data-model.md`, `contracts/{cli-adapter-classification,query_base-classification,query_base-doc-shape,search-roster,read_property-malformed-frontmatter,properties-dedup}.md`, `quickstart.md`, updated `CLAUDE.md` plan reference. Re-run Constitution Check after these land — expected verdict: PASS with no new violations introduced by the design (the conditional Complexity Tracking entry for `read_property` remains conditional pending T0 probe + /speckit-analyze).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified.**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| **(Conditional)** Principle IV deviation on `read_property` malformed-YAML-frontmatter if live shape is empty-value-`type:"unknown"` and /speckit-analyze rules it does not discharge the intentional-best-effort-continue clause. | The wrapper's current emission is the source of truth per spec Clarifications Q2 (Option A) and Assumption A4. Codifying the live shape unifies spec + help-doc and unblocks the cohort-wide BI-0027 audit re-run. | (a) Runtime fix to emit a typed UpstreamError instead — REJECTED at spec time: Out-of-Scope explicitly bans runtime behaviour changes outside the two classifier widenings; expanding scope here breaks the single-pass discipline (FR-013) and forces a sixteenth cycle-cost beat. (b) Defer `read_property` to a separate per-tool BI — REJECTED at spec time: breaks the cohort-wide single-audit-re-run cycle commitment (Assumption A9), forces an extra BI-0027 run, and leaves `search` / `read_property` / `properties` / `query_base` partially reconciled at ship time. The authorising-decision citation chain: Constitution Principle IV → "Clarifications entry, ADR, or referenced issue" → spec Clarifications Q2 → spec Assumption A11. |

This row is populated only if Phase 0 Task 3 captures the empty-value-`type:"unknown"` shape AND /speckit-analyze rules it deviating. If T0 captures the typed-error shape, the row is removed; if T0 captures the empty-value-`type:"unknown"` shape but /speckit-analyze rules it satisfies the intentional-discriminator clause, the row is removed with a `data-model.md` note explaining the discharge.
