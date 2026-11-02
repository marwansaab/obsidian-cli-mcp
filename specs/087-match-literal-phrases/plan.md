# Implementation Plan: Match literal phrases

**Branch**: `087-match-literal-phrases` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/087-match-literal-phrases/spec.md` (BI-0169)

> **This change makes the CLI read the query as text, not as search syntax.** Today `search` and `context_search` pass the agent's query to `obsidian search` / `search:context` unchanged, and Obsidian splits it into words and operators. After this change:
>
> - both handlers send the query as one double-quoted phrase, with `\` and `"` escaped, through one new helper, `literalPhraseQuery`;
> - both line-level paths keep one entry per `(path, line)` through a second helper, `oneMatchPerLine`, and return no lines for a query containing a line break (both run inside the shared pipeline `lineMatches`, per the 2026-11-02 amendment to research D2);
> - both helpers live in `src/tools/search/literal-phrase.ts`.
>
> Schemas, descriptions, annotations, error codes and the fingerprint baseline do not change.

## Summary

Research ([research.md](research.md)) read the code at HEAD `a96c2aa` and probed the live CLI in the test vault.

Code findings:

- **F1**: both handlers forward `input.query` verbatim.
- **F2**: both line-level paths flatten every wire entry, so repeats reach `count` and `truncated`.
- **F3**: an existing one-way context_search → search edge already carries the shared search helpers.
- **F4**: exactly two existing assertions pin `query=foo`.

Live-probe findings:

- **F5**: the raw query is split into words; `-x`, `OR`, `tag:`, `[prop]` are read as operators; lines repeat once per word.
- **F6**: `"…"` with `\` → `\\` and `"` → `\"` matched literally every character group probed. It kept leading, trailing and internal whitespace and tabs exact, and kept file-name matching, the case flag and folders. Single-word results were unchanged.
- **F7**: the default fold also folds `É`/`é`, today and after the change, against the documented "ASCII only". This is a follow-up.
- **F8**: quoted queries still repeat a line once per occurrence.
- **F9**: the CLI trims each returned line's text.

Decisions:

- **D1**: quote and escape the query in all three modes.
- **D2**: `oneMatchPerLine` keeps the first entry per line; `lineMatches` keeps none for a query containing `\n` or `\r` (amended 2026-11-02).
- **D3**: put both helpers in `src/tools/search/literal-phrase.ts`.
- **D4**: add a pure test suite plus one `handler.literal-phrase.test.ts` per tool. The two F4 assertions are edited, and that edit needs owner approval.
- **D5**: the published surface is untouched; help pages and CHANGELOG are updated.
- **D6**: a required live check against the built server in the test vault Sandbox (T029). It is the proof of SC-001, SC-003 and SC-006; owner ruling 2026-11-02 (option A, BI-0169) reversed the original "optional" decision.
- **D7**: the ASCII-fold wording drift stays out of scope.

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. Unchanged.

**Primary Dependencies**: `@modelcontextprotocol/server` (SDK v2), `zod` 4. No new dependency.

**Storage**: none. Both tools are read-only CLI wrappers.

**Testing**: `vitest run` with co-located `*.test.ts`, run through PowerShell. Handler tests stub the spawn boundary with `makeQueuedSpawn` (`_handler-test-fixtures.ts`). The required live check (quickstart §3, tasks T029) runs the built server against `TestVault-Obsidian-CLI-MCP` and follows `.memory/test-execution-instructions.md`. The automated rows prove the escaped, quoted query is sent; the live check proves phrase-only matching.

**Target Platform**: Windows, macOS and Linux; CI runs on Linux and Windows. The probes ran on Windows through Node's `spawn` with `shell: false`, which is the exact production path and the platform where quoting inside argv is riskiest. On POSIX the argv element is passed byte-for-byte.

**Project Type**: single project, an MCP server.

**Performance Goals**: one string pass to escape the query, and one pass over the wire matches to drop repeats. This is negligible next to the CLI call. The CLI output may shrink, because the phrase matches fewer notes than the split words did.

**Constraints**:

- FR-009: no new validation, so every valid query must survive D1's escape. This is pinned by contract L1 to L6.
- FR-011 and SC-005: no published-surface change, so `_register-baseline.json` must not move.
- FR-008: the folder probe, CR strip, text cap, sort and truncation rules are unchanged; they run on the reduced rows.
- The existing tests change only on the two F4 lines.

**Scale/Scope**:

- **New code**: `src/tools/search/literal-phrase.ts`.
- **Changed code**: `src/tools/search/handler.ts` and `src/tools/context_search/handler.ts`. In each, the `query` parameter, one `oneMatchPerLine` call in the line-level path, and the header comment change.
- **New tests**:
  - `src/tools/search/literal-phrase.test.ts`;
  - `src/tools/search/handler.literal-phrase.test.ts`;
  - `src/tools/context_search/handler.literal-phrase.test.ts`.
- **Edited tests**: `search/handler.test.ts:41` and `context_search/handler.test.ts:44`, one line each, approval-gated.
- **Docs**: `docs/tools/search.md`, `docs/tools/context_search.md`, `CHANGELOG.md`, and the `CLAUDE.md` plan pointer (after_plan hook).

**Resolved unknowns**: none open. The probes settled how the CLI reads quotes, escapes, whitespace, operators, case, CRLF and newlines (research F5 to F9).

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | One new module inside the `search` tool directory. It imports only a type from `./schema.js`, and is imported by `search/handler.ts` and by `context_search/handler.ts` over the existing one-way context_search → search edge (research F3). No new tool → tool edge and no cycle. `{schema, tool, handler}` layout unchanged. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | Both modified tools get happy-path rows (S1, S4, S8; C1, C4), boundary rows (S2, S3, S5–S7, S9; C2, C3, C5–C7, C9) and a failure row (C8, missing folder still errors) in the same change. The module's pure rows L1–L8 are co-located. |
| **III. Boundary Input Validation with Zod** | **Y** | No schema touched. The helpers act on the already-validated `input.query`; no hand-rolled input check is added. |
| **IV. Explicit Upstream Error Propagation** | **Y** | No new error code, class or `catch`. Every CLI failure, parse failure and folder-probe error propagates as today (C8). The empty result for a line-break query in line-level modes is the correct answer (no line can contain a line break; spec edge case, FR-004), not a masked failure: the CLI call still runs, and its errors still surface (research D2). |
| **V. Attribution & Layered Composition** | **Y** | The new module and test files carry `// Original — no upstream.` with their purpose. Both handler headers are updated to describe the quoting and per-line step. |
| **ADR-010 / ADR-013** | **N/A** | No tool added or renamed. |
| **ADR-014** | **N/A** | Not plugin-backed. |
| **ADR-015** (sub-discriminators) | **N/A** | No error states added or changed. |
| **ADR-040** (published descriptions) | **Y** | Descriptions unchanged; they already say "literal substring". The new rule text goes to the help pages. |
| **MCP Tool Surface Standards** | **Y** | Titles, hints, descriptions, input and output schemas unchanged; the baseline gate must pass without regeneration (contract P1). |
| **Security Defaults** | **Y** | Untouched: read-only tools, no new command or mode. Escaping closes a minor surprise surface: query text can no longer inject `path:` / `file:` operators that widen or redirect a folder-scoped search. |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**Kernel-node attention (per CLAUDE.md)**:

- `createServer()`, `createLogger()` and `createQueue()` are not edited, and no production file gains a call to them. Both handlers keep receiving logger and queue through `ExecuteDeps`.
- `UpstreamError` is not edited, and no new construction site is added.

## Project Structure

### Documentation (this feature)

```text
specs/087-match-literal-phrases/
├── plan.md                              # This file
├── research.md                          # T0 method, F1–F9 findings, D1–D7 decisions, follow-ups
├── data-model.md                        # E1–E5, invariants V1–V7, per-call flow
├── quickstart.md                        # automated gate + red check, surface gate, required live check
├── contracts/
│   └── literal-phrase-contract.md       # L1–L8, S1–S9, C1–C9, edited assertions, P1–P3, help-page text, live column
├── checklists/requirements.md
└── tasks.md                             # Phase 2: /speckit-tasks
```

### Source Code (repository root)

```text
src/tools/search/literal-phrase.ts                          # NEW: literalPhraseQuery, oneMatchPerLine (D1–D3)
src/tools/search/literal-phrase.test.ts                     # NEW: L1–L8 (D4)
src/tools/search/handler.ts                                 # query = literalPhraseQuery(input.query); oneMatchPerLine in line mode; header updated
src/tools/search/handler.test.ts                            # line 41 only: 'query="foo"' (approval-gated, D4)
src/tools/search/handler.literal-phrase.test.ts             # NEW: S1–S9 (D4)
src/tools/context_search/handler.ts                         # same two changes; header updated
src/tools/context_search/handler.test.ts                    # line 44 only: 'query="foo"' (approval-gated, D4)
src/tools/context_search/handler.literal-phrase.test.ts     # NEW: C1–C9 (D4)
docs/tools/search.md                                        # query policy, line-mode matches row, filename-match note (contract help-page text)
docs/tools/context_search.md                                # query policy, output note (contract help-page text)
CHANGELOG.md                                                # [Unreleased] spec line + Fixed entry

# UNCHANGED: both schema.ts, both index.ts (descriptions), src/tools/_register-baseline.json,
#   src/errors.ts, src/server.ts, src/cli-adapter/**, pattern_search/**, find_and_replace/**
```

**Structure Decision**: single project. Production edits stay in the two tools' directories. The shared helper sits beside `searchContextWireSchema` and `stripBoundarySlashes`, which context_search already imports from the `search` directory. New tests are co-located and follow the spec 075 `handler.<topic>.test.ts` split.

**Test-edit scope** (per `.memory/refactor-decisions.md` §5): exactly two existing lines change, `search/handler.test.ts:41` and `context_search/handler.test.ts:44`. Each moves from `toContain("query=foo")` to `toContain('query="foo"')`, because the argv element is now the quoted phrase (FR-001). No other existing assertion is edited. Both suites must otherwise pass unchanged, which is the FR-010 regression anchor. **Owner approval (2026-11-02, option B, BI-0169, recorded in `.memory/refactor-decisions.md` §5) is conditional.** The two edits go ahead only if those two are the only existing assertions that fail during implement. If any other existing test fails, implementation stops and raises it for owner review, and that test is not edited.

**Docs-as-code**: `.docs-as-code/` pages describing either tool's query handling are updated by `/speckit-docs-as-code <n>` after review.

## Phase 0: Research → research.md

- **T0 method**: live probes in `TestVault-Obsidian-CLI-MCP` `Sandbox/`, fixtures removed afterwards, plus the indexing gotcha for re-seeded files.
- **F1–F9**: code and live findings, summarised above.
- **D1–D7**: decisions, summarised above.
- **Plan-time spec alignment.** The probes corrected three statements in the spec, all in place:
  - the Case edge case and FR-007 no longer assert ASCII-only folding (F7);
  - FR-010 and SC-004 allow the repeated-line collapse that FR-005 requires for single words too (F8);
  - the line-break edge case says the path search matches across the break (F6).
- **Follow-ups**: case-fold wording (F7) and returned-text trimming (F9), both out of scope.

**Output**: research.md, with no `NEEDS CLARIFICATION` remaining.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)**:
  - E1 query;
  - E2 literal phrase query (new) with V1–V3;
  - E3 wire file;
  - E4 per-line wire (new) with V4–V6;
  - E5 rows and output with V7;
  - the per-call flow.
- **[contracts/literal-phrase-contract.md](contracts/literal-phrase-contract.md)**: L1–L8, S1–S9, C1–C9, the two edited assertions, the P1–P3 surface checks, the exact help-page text, and the live column, each mapped to FR, US, AS and SC IDs.
- **[quickstart.md](quickstart.md)**: the automated gate with a two-step red check (unquoted query, then no de-duplication), the surface gate (no baseline move), and the required live check (research D6 as amended 2026-11-02).
- **Agent context**: the `CLAUDE.md` plan pointer is moved to this plan by the `after_plan` agent-context hook.

## Phase 1 re-check (post-design Constitution Check)

- **I**: `literal-phrase.ts` imports only a sibling type. Its importers are the two handlers and its test, over the existing edge; acyclic.
- **II**: happy, boundary and failure rows for both tools in the same change.
- **III**: no schema touched.
- **IV**: no catch, code or fallback added; CLI and probe errors unchanged (C8).
- **V**: headers present and updated.
- **Tool Surface Standards**: zero fingerprint moves (P1).
- **Security Defaults**: untouched; operator injection through query text removed.

**No gate regressed; Complexity Tracking is empty.**

### Spec alignment note

- **FR-001 / FR-002**: D1, L1, L5, S1, S3, C1, C3; live column.
- **FR-003**: L2–L4, L6, S2, C2.
- **FR-004**: D2, L8, S7, C7.
- **FR-005**: D2, L7, S4, C4.
- **FR-006**: S5, S6, C5.
- **FR-007**: S8, S9, C9; the case flag is forwarded as today, and F6 shows it applies inside the quotes.
- **FR-008**: S8, C6, C7, C8, and both unchanged existing suites.
- **FR-009**: no schema change; L1–L6 cover every character class.
- **FR-010**: both existing suites, edited only on the two F4 lines; research F6, single-word parity.
- **FR-011**: P1, P2.
- **FR-012**: P3 and the contract's help-page text.
- **FR-013 (a)–(f)**: S/C rows. (a) S1/C1 for the query sent, plus the required live column (T029) for the matching; (b) S4/C4; (c) S2/C2 with L2–L6; (d) S8 and the existing suites; (e) S9/C9 (multi-word, with and without `case_sensitive`) and the live column; (f) S3 (both `search` modes) and C3 (leading and trailing).
- **SC-001–SC-006**: SC-001, SC-003 and SC-006 by the required live column (T029); SC-002 and SC-004 by the S/C rows and the existing suites; SC-005 by P1.

### CodeGraph structural check

Run with `codegraph_explore` at plan time (HEAD `a96c2aa`).

**Affected symbols and blast radius**:

- `executeSearch` (`src/tools/search/handler.ts:55`): the only production caller is `createSearchTool` (`index.ts:46`) through `registerTool`. That factory is called by `server.ts` and `_typed-result-fixtures.ts`. Tests: `handler.test.ts`, `index.test.ts`. The `_typed-result-fixtures.ts` search fixture stubs the spawn and asserts only the result shape, so it is unaffected.
- `executeContextSearch` (`src/tools/context_search/handler.ts:51`): the same pattern through `createContextSearchTool` (`index.ts:37`). The context_search typed-result fixture stubs one match at line 2 (`_typed-result-fixtures.ts:136`), so there are no repeats to collapse and it is unaffected.
- `searchContextWireSchema` / `SearchContextWireFile` (`src/tools/search/schema.ts:102-114`): consumed by both handlers. Not edited; the new module imports the type.
- `stripBoundarySlashes` (`search/handler.ts:48`): imported by context_search and pattern_search. Not edited.
- `pattern_search` (`executePatternSearch`): imports only `stripBoundarySlashes` from `search/handler.ts`. It does not reach the query path and is unaffected.
- `obsidian_exec`: passes raw `search query=…` argv through its own path. Not affected, and its tests' `query=` lines stay (research F4).
- `SEARCH_DESCRIPTION`, `CONTEXT_SEARCH_DESCRIPTION`: not edited, so no fingerprint move.

**Kernel-node touch surface**: `createServer()`, `createLogger()` and `createQueue()` are not edited, and no production file gains a call to them. `UpstreamError` is not edited and gains no construction site. That is the explicit no-touch claim for post-implement verification.

**Post-implement structural verification** (after `codegraph sync`):

1. No new error class or top-level code; `src/errors.ts` is unchanged, and neither handler gains an `UpstreamError` construction.
2. No handler imports `createLogger` or `createQueue`; `server.ts` is unchanged.
3. `literal-phrase.ts` imports only `./schema.js` (type-only). Its importers are exactly `search/handler.ts`, `context_search/handler.ts` and its own test, with no new cross-tool edge.
4. Both exports have production callers. `literalPhraseQuery` is called by both handlers. `oneMatchPerLine` is called by `search/handler.ts` (line mode) and `context_search/handler.ts`.

## Follow-ups (out of scope)

- The case-fold wording in both descriptions and help pages says ASCII-only, but the CLI also folds `É`/`é` (research F7). Raise a backlog item; fixing the descriptions moves two fingerprints.
- The CLI trims returned line text, which the help pages do not say (research F9).

## Complexity Tracking

> No Constitution Check violations; the table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
