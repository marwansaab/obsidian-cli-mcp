# Implementation Plan: Preserve match whitespace

**Branch**: `088-preserve-match-whitespace` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/088-preserve-match-whitespace/spec.md` (BI-0170)

> **This change makes `context_search` read each matched line back from the note.** Today it returns the text Obsidian's `search:context` reports, and the CLI trims every line (research F6). After this change:
>
> - `context_search` selects its rows exactly as today, then reads back only those lines with one `obsidian eval` (`cachedRead`, split on `\n`), batched under a command-line budget;
> - it checks that each line, trimmed, still equals the CLI's text, removes one trailing `\r`, and only then applies the 500-character cap;
> - any line that cannot be read back faithfully fails the whole call with `CLI_REPORTED_ERROR` and `details.code: "MATCH_LINE_UNAVAILABLE"`.
>
> Search's deprecated line mode, both published descriptions, the input and output schemas and the fingerprint baseline do not change.

## Summary

Research ([research.md](research.md)) read the code at HEAD `03594f1` and probed the live CLI in the test vault Sandbox.

Code findings:

- **F1**: the wrapper only strips a trailing `\r`; the trimming is the CLI's.
- **F2**: `lineMatches` caps before it sorts and slices, but the cap is a pure per-row step.
- **F3**: about 40 existing context_search test sites stub exactly one spawn.
- **F4**: `invokeEval`, `composeEvalCode`, `parseEvalAnswer`, `runEvalTemplate`, `lineText` and the `CLI_REPORTED_ERROR` + `details.code` shape already exist.

Live-probe findings:

- **F5**: lines are 1-based over the whole note, split on `\n` only.
- **F6**: the CLI trims exactly like `String.prototype.trim`.
- **F7**: the CLI never shortens a line.
- **F8**: `cachedRead` + `split("\n")` + one `\r` stripped lines up with every CLI hit.
- **F9**: `search:context` has no untrimmed option.

Decisions:

- **D1**: read the selected lines back with an eval, after selection and before the cap.
- **D2**: split `selectLines` out of `lineMatches`, so selection stays one function and search keeps `lineMatches`.
- **D3** (revised at tasks time from F10, the bounded shim-limit probe): batch the read-back so each composed eval code is ≤ 2900 characters. The `code=` value then stays under 3,000, about 25% below the last length the shim answered (4,009). At 5,009 the shim returns nothing, and at 20,000 it broke the CLI until Obsidian restarted.
- **D4**: the error contract, `MATCH_LINE_UNAVAILABLE` with reasons `note-not-found`, `read-failed` and `line-changed` (Clarification Q1).
- **D5**: new tests (template, read-back, handler) plus `selectLines` rows.
- **D6**: no published-surface change; the help page is corrected.
- **D7**: the approved existing-test edits (owner ruling 2026-11-02, option A).
- **D8**: a required live check.

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. Unchanged.

**Primary Dependencies**: `@modelcontextprotocol/server` (SDK v2), `zod` 4. No new dependency.

**Storage**: none. `context_search` stays read-only. The read-back eval only calls `cachedRead`.

**Testing**:

- `vitest run` with co-located `*.test.ts`, run through PowerShell.
- Handler and read-back tests stub the spawn boundary with `makeQueuedSpawn` (`_handler-test-fixtures.ts`). A `"=> …"` stdout line is tagged automatically as the eval's answer.
- The template runs in-process under `runEvalTemplate` (`_eval-template-fixtures.ts`).
- The required live check (quickstart §3) runs the built server against `TestVault-Obsidian-CLI-MCP` and follows `.memory/test-execution-instructions.md`.

**Target Platform**: Windows, macOS and Linux; CI runs on Linux and Windows. The probes ran on Windows through Node's `spawn` with `shell: false`, the production path. The batching budget (D3) exists for the `Obsidian.com` shim's eval-length limit (research F10: answered at 4,009 characters, silent at 5,009). It is applied on every platform, so behaviour is the same everywhere.

**Project Type**: single project, an MCP server.

**Performance Goals**:

- A search that returns no lines costs exactly what it costs today: no read-back.
- A search that returns lines adds one eval per batch. Typical results need one. The default limit of 1000 over 1000 distinct notes with paths around 40 characters needs about 40 evals, which is roughly 40 more CLI round trips for that call. This is the price of the shim's eval-length limit (F10). The batches go through the single-flight queue, so other tool calls wait behind them. The spec sets no latency target. The live check (T022, quickstart §3) measures wall time and eval count for a 300-note and a 1000-row call, and records them in `post-implement.md` and the help page's Latency note (analyze finding U1).
- Each eval reads only the notes in its batch, through Obsidian's cache, and returns only the requested lines, so the answer grows with the result count, not with note size.

**Constraints**:

- FR-006: `count`, `truncated`, rows and order come from the unchanged selection.
- FR-008 and SC-005: search's handler and suites are untouched.
- FR-010: no fingerprint move.
- FR-011: no new top-level code, no partial result and no fallback.
- The existing-test edits are limited to the approved scope (D7).

**Scale/Scope**:

- **New code**:
  - `src/tools/context_search/_template.ts`: the frozen read-back `JS_TEMPLATE`.
  - `src/tools/context_search/read-back.ts`: `readBackLines(rows, vault, deps)`, which batches, calls `invokeEval`, parses, reconciles and throws the error contract.
- **Changed code**:
  - `src/tools/context_search/handler.ts`: `selectLines` → `readBackLines` → `capLine`. `stripCr` is removed and the header is updated.
  - `src/tools/context_search/schema.ts`: adds the read-back answer schema. The input and output schemas are untouched.
  - `src/tools/search/line-matches.ts`: exports `selectLines` and `capLine`, and `lineMatches` composes them. The header is updated.
  - `src/tools/_note-lines.ts`: the header comment now names context_search as a `lineText` consumer. No code change.
- **New tests**:
  - `context_search/_template.test.ts` (T1–T9);
  - `context_search/read-back.test.ts` (R1–R16);
  - `context_search/handler.whitespace.test.ts` (H20–H35);
  - `search/line-matches.test.ts` gains rows L9–L10 only, with existing rows unedited.
- **Edited tests**: the approved scope only (contract §E).
- **Docs**: `docs/tools/context_search.md`, `CHANGELOG.md`, and the `CLAUDE.md` plan pointer (after_plan hook).

**Resolved unknowns**: none open. The probes settled line numbering, the trim set, line length, CRLF and the cache read (research F5 to F9).

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | Two new modules inside the `context_search` directory. Its edges are: the existing context_search → search edge (now also importing `selectLines` and `capLine`); a downward edge to the cohort leaves `_note-lines.ts` (`lineText`), `_shared.ts` (`composeEvalCode`) and `_eval-parse.ts`; and `cli-adapter` (`invokeEval`), which every eval tool imports. There is no tool → tool edge besides the existing one, and no cycle. `line-matches.ts` gains no import. The `{schema, tool, handler}` layout is kept: the answer schema goes in `schema.ts`. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | `context_search` gets happy-path rows (H20–H26, R1, R8), boundary rows (H27, H28, H29, H30, R2, R3, T3, T4, T8) and failure rows (H31, H32, R4–R7, R9–R13, R16, T5, T6) in the same change. Search's suites stay green unedited. |
| **III. Boundary Input Validation with Zod** | **Y** | The eval answer, a new upstream boundary, is parsed with a zod schema in `context_search/schema.ts`, and its types come from `z.infer`. The input schema is untouched. |
| **IV. Explicit Upstream Error Propagation** | **Y** | Every read-back failure throws `UpstreamError` with an existing top-level code (`CLI_REPORTED_ERROR`) and an ADR-015 sub-discriminator (`details.code` + `details.reason`), naming `path` and `line` (Clarification Q1). There is no partial result, no trimmed-text fallback and no dropped row. Parse failures reuse the cohort's `json-parse` / `envelope-parse` stages, and `invokeEval` errors propagate unchanged. Cancellation: each batch's `invokeEval` receives the call's deps whole (refactor-decisions item 29), so a cancelled call drops queued batches and kills a running one. |
| **V. Attribution & Layered Composition** | **Y** | New files carry `// Original — no upstream.` with their purpose. The headers of `handler.ts`, `line-matches.ts` and `_note-lines.ts` are updated to describe the new step and consumer. |
| **ADR-010 / ADR-013** | **N/A** | No tool added or renamed. |
| **ADR-014** | **N/A** | Not plugin-backed. |
| **ADR-015** (sub-discriminators) | **Y** | `MATCH_LINE_UNAVAILABLE` ships with its three reasons from day one. |
| **ADR-040** (published descriptions) | **Y** | The description is unchanged and stays true ("trailing `\r` stripped"). The full rule goes to the help page. |
| **ADR-057** (literal phrase) | **Y** | The query path is untouched. ADR-057 rejected a wrapper-side `includes` re-check that would drop rows. D4's check compares trim against trim, which F6 shows is exact, and it fails loudly instead of dropping rows. The docs pass records this next to ADR-057. |
| **MCP Tool Surface Standards** | **Y** | Title, hints, description, input and output schemas unchanged; the baseline gate must pass without regeneration (P1, P2). |
| **Security Defaults** | **Y** | Still read-only. The eval is internal to a typed tool, like every other eval-composed read tool, and is not the `obsidian_exec` escape hatch. Paths from the CLI reach the eval only as base64 JSON data, never as code. No filesystem path is joined by the wrapper, so no new containment surface opens. |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**Kernel-node attention (per CLAUDE.md)**:

- `createServer()`, `createLogger()` and `createQueue()` are not edited, and no production file gains a call to them. `context_search` keeps receiving logger and queue through `ExecuteDeps`, and passes the deps whole to `invokeEval`.
- `UpstreamError` is not edited. It gains construction sites in `context_search/read-back.ts`, which is the error spine working as designed.

## Project Structure

### Documentation (this feature)

```text
specs/088-preserve-match-whitespace/
├── plan.md                                   # This file
├── research.md                               # T0 method, F1–F9, D1–D8, follow-ups
├── data-model.md                             # E1–E5, invariants V1–V10, per-call flow
├── quickstart.md                             # automated gate + red check, surface gate, required live check
├── contracts/
│   └── match-whitespace-contract.md          # P1–P3, error contract, T1–T9, R1–R16, L9–L10, H20–H35, §E, help text, live column
├── checklists/requirements.md
└── tasks.md                                  # Phase 2: /speckit-tasks
```

### Source Code (repository root)

```text
src/tools/search/line-matches.ts                          # selectLines + capLine exported; lineMatches composes them (D2)
src/tools/search/line-matches.test.ts                     # + L9–L10 (existing rows unedited)
src/tools/context_search/_template.ts                     # NEW: frozen read-back JS_TEMPLATE (D1)
src/tools/context_search/_template.test.ts                # NEW: T1–T9
src/tools/context_search/read-back.ts                     # NEW: readBackLines — batching, invokeEval, reconcile, errors (D1, D3, D4)
src/tools/context_search/read-back.test.ts                # NEW: R1–R16
src/tools/context_search/schema.ts                        # + read-back answer schema (input/output untouched)
src/tools/context_search/handler.ts                       # selectLines → readBackLines → capLine; stripCr removed; header
src/tools/context_search/handler.whitespace.test.ts       # NEW: H20–H35
src/tools/context_search/_handler-fixtures.ts             # NEW: readBackResponse / readBackAnswer stub builders (vitest-free)
src/tools/context_search/handler.test.ts                  # approved edits only (§E)
src/tools/context_search/handler.literal-phrase.test.ts   # approved edits only (§E)
src/tools/context_search/index.test.ts                    # line 64 only (§E)
src/tools/_typed-result-fixtures.ts                       # context_search entry only (§E)
src/tools/_note-lines.ts                                  # header comment only
docs/tools/context_search.md                              # what is removed, calls, error roster (contract help-page text)
CHANGELOG.md                                              # [Unreleased] spec line + Fixed entry

# UNCHANGED: src/tools/search/handler.ts and its tests, both index.ts (descriptions),
#   src/tools/_register-baseline.json, src/errors.ts, src/server.ts, src/cli-adapter/**
```

**Structure Decision**: single project. Production edits stay in the `context_search` directory, plus one exported split in `search/line-matches.ts`, which context_search already imports. The template follows the `_template.ts` / `JS_TEMPLATE` convention of the other eval-composed tools. The read-back is its own module, so the handler only orders the steps and the reconciliation rules have pure-ish tests.

**Test-edit scope** (per `.memory/refactor-decisions.md` item 5, spec 088 entry): only the four approved sites in contract §E change. In `handler.literal-phrase.test.ts` that means C1, C4, C5 and C6 only. The two H14 tests with 1000 and 999 notes may queue as many read-back responses as their batches need (owner ruling 2026-11-02). No expected `text`, `count`, `truncated` or argv value may change. **Owner approval (2026-11-02, option A, BI-0170) is conditional**: if any other existing assertion fails during implement, implementation stops and raises it for owner review, and that test is not edited.

**Docs-as-code**: `/speckit-docs-as-code <n>` after review updates the `.docs-as-code/` pages that describe context_search's line text. That means removing the F9 known limit in `capabilities/search-and-discovery.md` and adding a note to ADR-057's consequences, or a new ADR for the read-back.

## Phase 0: Research → research.md

- **T0 method**: live probes in the `TestVault-Obsidian-CLI-MCP` Sandbox, with fixtures created through Obsidian and removed afterwards (`Sandbox/` back to its 13 pre-run entries).
- **F1–F9**: code and live findings, summarised above.
- **D1–D8**: decisions, summarised above.
- **Analyze-time spec alignment** (finding I1): FR-006 now also allows failures of the read-back step itself, such as an eval that fails or an answer that cannot be parsed. They surface through existing codes with no partial result, as research D4 and Principle IV already required. The BOM assumption now says line 1 is returned without the mark (finding C2; V8, R15, H34).
- **Plan-time spec alignment**: none needed. The probes confirmed every statement in the spec. F6 also confirms the edge case on "whitespace other than spaces and tabs" (NBSP and U+3000 were trimmed by the CLI and will now be kept).
- **Follow-ups**: case-fold wording (from spec 087), and the deprecated `search` line mode's trimming, which is out of scope here.

**Output**: research.md, with no `NEEDS CLARIFICATION` remaining.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)**:
  - E1 wire file;
  - E2 selected row (V1–V4);
  - E3 read-back request (V5, V6);
  - E4 read-back answer (V7);
  - E5 restored row and output (V8–V10);
  - the per-call flow.
- **[contracts/match-whitespace-contract.md](contracts/match-whitespace-contract.md)**: the surface checks P1–P3, the error contract, rows T1–T9, R1–R16, L9–L10 and H20–H35, the approved edits (§E), the exact help-page text and the live column, each mapped to FR, US, AS and SC IDs.
- **[quickstart.md](quickstart.md)**: the automated gate with a red check, the surface gate, and the required live check.
- **Agent context**: the `CLAUDE.md` plan pointer is moved to this plan by the `after_plan` agent-context hook.

## Phase 1 re-check (post-design Constitution Check)

- **I**: new modules import downward or over the existing context_search → search edge; acyclic.
- **II**: happy, boundary and failure rows for `context_search` in the same change.
- **III**: the eval answer is zod-parsed in `schema.ts`.
- **IV**: one sub-discriminated code, no fallback, cancellation preserved.
- **V**: headers present and updated.
- **Tool Surface Standards**: zero fingerprint moves (P1, P2).
- **Security Defaults**: still read-only; data-only payload.

**No gate regressed; Complexity Tracking is empty.**

### Spec alignment note

- **FR-001**: D1, V8; T1, T2, H20–H26; live column.
- **FR-002 / FR-003**: T1, R8, H20, H21, H23, H26; live column.
- **FR-004**: T2, T3, R8, H24, H25.
- **FR-005**: D1 order, V9; H27, H28.
- **FR-006**: D2, V1–V4; L10, H29, H30, and the edited existing suites with their expected values unchanged.
- **FR-007**: D4; R6, R7, H32.
- **FR-008**: D2, P3; existing `line-matches.test.ts` rows and search's suites unedited.
- **FR-009**: D6; the contract's help-page text.
- **FR-010**: P1, P2.
- **FR-011**: D4; R4–R7, R9–R13, R16, H31, H32.
- **SC-001**: H20–H26 and the live column.
- **SC-002**: H27, H28 and the live column.
- **SC-003**: H29, L10 and the edited suites.
- **SC-004**: P1, P2 and the help-page text review.
- **SC-005**: P3.
- **SC-006**: H31, H32, R4–R7, R13.

### CodeGraph structural check

Run with `codegraph_explore` at plan time (HEAD `03594f1`).

**Affected symbols and blast radius**:

- `executeContextSearch` (`src/tools/context_search/handler.ts:49`): its only production caller is `createContextSearchTool` (`index.ts:37`) through `registerTool`. That factory is called by `server.ts` and `_typed-result-fixtures.ts`. Tests: `handler.test.ts`, `handler.literal-phrase.test.ts`, `index.test.ts`, plus the fixture's consumers `_surface.test.ts` and `_plugin-noise.test.ts`. The fixture and `index.test.ts:64` are in the approved edit scope. `_plugin-noise.test.ts` drives the typed-result fixtures and must pass unedited once the fixture answers both calls.
- `lineMatches` (`src/tools/search/line-matches.ts:16`): called by `search/handler.ts` (deprecated line mode) and, today, `context_search/handler.ts`. After the change only search calls it, and its output is identical (F2), so search is unaffected.
- `capLine` (`line-matches.ts:11`): today private and called only by `lineMatches`. It becomes exported for context_search.
- `oneMatchPerLine` / `literalPhraseQuery` (`search/literal-phrase.ts`): not edited.
- `searchContextWireSchema` (`search/schema.ts`): not edited.
- `lineText` (`src/tools/_note-lines.ts:40`): today used by the direct-fs editors' placement path (`placeEdit`) and their tests. context_search becomes a read-only consumer, and the function is not edited.
- `invokeEval` (`src/cli-adapter/cli-adapter.ts:116`): among the most-depended-on runtime-spine symbols. Not edited; context_search becomes one more caller.
- `CONTEXT_SEARCH_DESCRIPTION`, `contextSearchInputSchema`, `contextSearchOutputSchema`: not edited, so no fingerprint move.

**Kernel-node touch surface**:

- `createServer()`, `createLogger()` and `createQueue()` are not edited, and no production file gains a call to them.
- `UpstreamError` is not edited, and gains construction sites only in `context_search/read-back.ts`.

That is the explicit no-touch claim for post-implement verification.

**Post-implement structural verification** (after `codegraph sync`):

1. No new error class or top-level code: `src/errors.ts` is unchanged. Every new `UpstreamError` in `read-back.ts` uses `CLI_REPORTED_ERROR`.
2. No handler imports `createLogger` or `createQueue`; `server.ts` is unchanged.
3. `read-back.ts` and `_template.ts` sit in `context_search/`, and their imports run one way: to `search/schema.ts` (type `SearchLineOutput`), `_note-lines.ts`, `_shared.ts`, `_eval-parse.ts`, `cli-adapter.ts` (`invokeEval`, type `InvokeCliDeps`), `errors.ts`, `./_template.js` and `./schema.js`. Neither imports `./handler.js`. Nothing imports `context_search/*` except its own tests, `index.ts` and the typed-result fixture.
4. Every new export has a production caller:
   - `readBackLines` and `JS_TEMPLATE`, called by `handler.ts` and `read-back.ts`;
   - `selectLines`, called by `context_search/handler.ts` and `lineMatches`;
   - `capLine`, called by `context_search/handler.ts` and `lineMatches`;
   - the answer schema, called by `read-back.ts`.

## Follow-ups (out of scope)

- The case-fold wording drift recorded by spec 087 (its F7) is still open.
- The deprecated line mode of `search` still returns trimmed text (FR-008). Whether its help page should say so is left to the docs pass.
- Research F10 applies to every eval-composed tool. Past a few thousand characters of eval code, the `Obsidian.com` shim returns nothing with exit 0, and much larger code stalls the CLI until Obsidian restarts. Tools whose payload grows with input (for example `pattern_search` with a 1000-character pattern, or `find_and_replace`'s evals) should be checked against that limit in a backlog item. `invokeEval` reports the silent case as a missing answer, so nothing returns a false empty result. Still, the stall risk is not bounded centrally.

## Complexity Tracking

> No Constitution Check violations; the table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
