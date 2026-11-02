# Implementation Plan: Stabilise query ordering

**Branch**: `085-stabilise-query-ordering` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/085-stabilise-query-ordering/spec.md`

> **This change moves one number in each of two templates.** Today the eval templates of `smart_connections_query` and `smart_connections_similar` ask the Smart Connections plugin for the agent's `limit`. After this change each asks for a fixed `MAX_LIMIT` (100), then filters and sorts in the documented order and cuts to `limit`, as they already do. Around that number:
>
> - two new vm tests run the real templates;
> - each tool's description gains one sentence, and the baseline is regenerated for it;
> - each tool's help page gains two edits.
>
> No schema shape, error code, handler or payload changes. `smart_connections_similar` joined the scope at analysis, because it shares the slice-before-sort step (spec Clarifications; research F5, D5).

## Summary

Research ([research.md](research.md)) found, at HEAD `2734e99`:

- **F1**: `smart_connections_query/_template.ts:12` passes `filter:{limit:a.limit}` to the plugin's `lookup`. The plugin's own cut picks which equal-score blocks survive; the documented sort (`:25-30`) only reorders the survivors.
- **F2**: no test runs either template's logic.
- **F3**: `100` is only the literal `.max(100)` in each schema.
- **F4**: the descriptions and help pages state the sort, but not that `limit` applies after it.
- **F5**: `smart_connections_similar/_template.ts:29` has the same shape (`find_connections({limit:a.limit})`, then sort, then slice). It is now in scope.
- **F6**: the plugin-free test vault cannot exercise either tool.

The decisions:

- **D1** (`smart_connections_query`): export `MAX_LIMIT = 100` from `schema.ts`, use it in `.max(MAX_LIMIT)`, and interpolate it into the lookup as `filter:{limit:${MAX_LIMIT}}`.
- **D2**: a new `_template.test.ts` (vm, with a stub plugin that truncates to the requested limit and returns ties in reverse path order), covering T1–T9.
- **D3**: description sentence, help-page guarantee and 100-candidate edge, baseline regeneration.
- **D4**: CHANGELOG; docs-as-code after review.
- **D5**: D1–D3 again for `smart_connections_similar`. It gets its own `MAX_LIMIT`, `find_connections({limit:${MAX_LIMIT}})`, and a `_template.test.ts` covering T10–T15. Self-exclusion is unchanged.

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. Unchanged.

**Primary Dependencies**: `@modelcontextprotocol/server` (SDK v2), `zod` 4. No new dependency. The tests use `node:vm`, as `links/_template.test.ts` does.

**Storage**: none.

**Testing**: `vitest run` with co-located `*.test.ts`, run through PowerShell. There is no test-vault step: `TestVault-Obsidian-CLI-MCP` has no plugins. Quickstart §3 describes an optional read-only live check, and SC-005 is recorded as verified or unverified there.

**Target Platform**: Windows, macOS, Linux; CI on Linux and Windows. The templates run inside Obsidian on every platform; the change is platform-neutral.

**Project Type**: single project, an MCP server.

**Performance Goals**:
- **Plugin request**: every call of either tool now asks the plugin for 100 results. `limit: 100` is already an allowed input for both, so this is a request size each tool already makes.
- **Output**: the envelope is still cut to `limit` inside the eval, so the stdout size is unchanged (SC-005).

**Constraints**:
- FR-005: no score is touched.
- FR-006: the input and output schemas do not change.
- FR-008: no new error code; error envelopes and self-exclusion unchanged.
- Handlers, payloads and `src/cli-adapter/**` are unchanged.
- Only the two tools' `descriptionFingerprint` values may move (contract S3).

**Scale/Scope**:
- **Code**, in `src/tools/smart_connections_query/` and `src/tools/smart_connections_similar/`:
  - `schema.ts` (export `MAX_LIMIT`, use it in `.max`);
  - `_template.ts` (plugin request and header comment);
  - `index.ts` (one description sentence).
- **New tests**: `_template.test.ts` in each of the two directories.
- **Added cases**: each tool's `index.test.ts` (S1/S2, S4/S5).
- **Regenerated**: `src/tools/_register-baseline.json`.
- **Docs**:
  - `docs/tools/smart_connections_query.md`;
  - `docs/tools/smart_connections_similar.md`;
  - `CHANGELOG.md`;
  - the `CLAUDE.md` plan pointer (already set).

**Resolved unknowns**: none open.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | No new module. Each `_template.ts` gains an import from its sibling `./schema.js`, which is new for templates (the others import only `../_shared.js`). The edge is same-directory, one-directional and acyclic: neither `schema.ts` imports its template. Each tool has its own `MAX_LIMIT`, so there is no tool → tool edge. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | Each behaviour change is pinned by its tool's `_template.test.ts`, with failure and boundary rows (T1, T2, T4, T5; T10–T13) plus happy-path and boundary rows (T3, T6–T9; T14, T15). The description and help changes are pinned by S1, S2, S4 and S5. The existing suites run unedited. |
| **III. Boundary Input Validation with Zod** | **Y** | `limit` is still validated by each input schema. `.max(MAX_LIMIT)` emits the same JSON Schema as `.max(100)`. No hand-rolled check. |
| **IV. Explicit Upstream Error Propagation** | **Y** | No new code or class. Both tools' envelope codes and `UpstreamError` mappings are unchanged. No silent fallback. |
| **V. Attribution & Layered Composition** | **Y** | The new tests carry `// Original — no upstream.`. Each `_template.ts` header comment is updated: the plugin request is `MAX_LIMIT`, and the final slice is the only cut to `a.limit`. |
| **ADR-010 / ADR-013** | **N/A** | No tool added or renamed. |
| **ADR-014** (plugin-backed typed tools) | **Y** | The runtime-dependency pattern is unchanged: same plugin APIs (`lookup`, `find_connections`), same lifecycle stages and codes. Only the requested candidate count changes. |
| **ADR-015** (sub-discriminators) | **Y** | `api-missing` / `embed-failed` unchanged; no new value. |
| **ADR-040** (published descriptions) | **Y** | One guarantee sentence per tool description. The long-form edge case goes to the help pages. Parameter descriptions are unchanged. |
| **MCP Tool Surface Standards** | **Y** | Titles, hints, input and output schemas are unchanged. The two descriptions change deliberately, so the baseline is regenerated in this PR, and only those two fingerprints move (S3). |
| **Security Defaults** | **Y** | Untouched: read-only tools, no new command, mode or write path. The interpolated `MAX_LIMIT` is a compile-time numeric constant, not caller input. |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**Kernel-node attention (per CLAUDE.md)**: none of the kernel nodes is touched. `createServer()`, `createLogger()` and `createQueue()` are not edited, and no production file gains a call to them. `UpstreamError` is not constructed by any new code, and `src/errors.ts` is unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/085-stabilise-query-ordering/
├── plan.md                         # This file
├── research.md                     # F1–F6 findings, D1–D5 decisions
├── data-model.md                   # E1–E4, MAX_LIMIT, rules V1–V7
├── quickstart.md                   # automated gate + red check, surface gate, optional live check
├── contracts/
│   └── ordering-contract.md        # T1–T9 (query vm), T10–T15 (similar vm), S1–S5 (surface)
├── checklists/requirements.md
└── tasks.md                        # Phase 2: /speckit-tasks
```

### Source Code (repository root)

```text
src/tools/smart_connections_query/schema.ts            # export MAX_LIMIT = 100; .max(MAX_LIMIT) (D1)
src/tools/smart_connections_query/_template.ts         # filter:{limit:${MAX_LIMIT}}; header comment (D1)
src/tools/smart_connections_query/index.ts             # + leading-slice sentence after "Sort:" (D3)
src/tools/smart_connections_query/_template.test.ts    # NEW: vm tests T1–T9 (D2)
src/tools/smart_connections_query/index.test.ts        # + S1, S2 cases
src/tools/smart_connections_similar/schema.ts          # export MAX_LIMIT = 100; .max(MAX_LIMIT) (D5)
src/tools/smart_connections_similar/_template.ts       # find_connections({limit:${MAX_LIMIT}}); header comment (D5)
src/tools/smart_connections_similar/index.ts           # + leading-slice sentence after "Sort order:" (D5)
src/tools/smart_connections_similar/_template.test.ts  # NEW: vm tests T10–T15 (D5)
src/tools/smart_connections_similar/index.test.ts      # + S4, S5 cases
src/tools/_register-baseline.json                      # regenerated; two description fingerprints move (S3)
docs/tools/smart_connections_query.md                  # guarantee under sort order; Inherited limitation 9 (D3)
docs/tools/smart_connections_similar.md                # `limit` bullet rewritten; new inherited limitation (D5)
CHANGELOG.md                                           # [Unreleased] spec line + Fixed entry (D4)

# UNCHANGED: both tools' handler.ts (payloads stay {…, limit, total}), both tools' {handler,schema}.test.ts,
#   src/server.ts, src/errors.ts, src/cli-adapter/**, src/tools/_register.ts, src/tools/_shared.ts
```

**Structure Decision**: single project. Every production edit sits in its tool's own directory. The new tests are co-located with the templates they run, following `links/_template.test.ts`.

**Test-edit scope** (per `.memory/refactor-decisions.md` §2): no existing assertion is edited.
- Each `handler.test.ts` compares the spawned code with `JS_TEMPLATE` rendered on the fly (`smart_connections_query/handler.test.ts:577`, `smart_connections_similar/handler.test.ts:883`), so it follows the new template without an edit.
- The payload assertions still hold, because the payloads are unchanged.
- Each `index.test.ts` gains new cases only.

**Docs-as-code**: `.docs-as-code/` pages describing either tool's results or ordering are updated by `/speckit-docs-as-code <n>` after review.

## Phase 0: Research → research.md

- **F1–F6**: code findings from CodeGraph and direct reads at HEAD `2734e99`.
- **D1–D5**: decisions, summarised above.
- **No follow-ups remain**: F5 was folded in as D5.

**Output**: research.md, with no `NEEDS CLARIFICATION` remaining.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)**:
  - E1 match (unchanged);
  - E2 candidate set (changed, both tools);
  - E3 documented ordering;
  - E4 returned page;
  - per-tool `MAX_LIMIT`;
  - rules V1–V7.
- **[contracts/ordering-contract.md](contracts/ordering-contract.md)**: T1–T9, T10–T15 and S1–S5, each mapped to the spec's FR, AS and SC IDs.
- **[quickstart.md](quickstart.md)**: the automated gate with a red check for both templates, the baseline diff check (two fingerprints plus expected metadata), and an optional read-only live check that also records SC-005.
- **Agent context**: the `CLAUDE.md` plan pointer already names this plan.

## Phase 1 re-check (post-design Constitution Check)

- **I**: two sibling imports (`_template.ts` → `./schema.js`); acyclic, same-directory, no cross-tool edge.
- **II**: failure, boundary and happy-path rows for both tools in the same change; surface text asserted.
- **III**: Zod is still the only validator; the emitted schemas are the same.
- **IV**: existing codes only.
- **V**: headers present and updated.
- **Tool Surface Standards**: exactly two deliberate fingerprint movements.
- **Security Defaults**: untouched.

**No gate regressed; Complexity Tracking is empty.**

### Spec alignment note

- **FR-002 / clarification Option A**: the request is fixed at `MAX_LIMIT` in both tools. Interpolating it from each schema keeps "100" in one place per tool (research D1, D5).
- **Scope (analysis remediation)**: `smart_connections_similar` is in scope only for the slice-before-sort step. Its target resolution, self-exclusion, lifecycle checks and errors are unchanged (spec Out of Scope).
- **FR-009**: the descriptions carry the guarantee. The help pages carry the guarantee and the 100-candidate edge (ADR-040 split).
- **FR-010**:
  - (a) is T1 and T10;
  - (b) is T4 and T12;
  - (c) is T5 and T13.
- **SC-001**: T2 and T11 run every N < M pair from 1 to 100.
- **SC-002**: covered by T4's repeat run.
- **SC-005**: live where possible (quickstart §3); otherwise recorded as unverified, with the fallback evidence.

### CodeGraph structural check

Run with `codegraph_explore` at plan time and again at analysis (HEAD `2734e99`).

**Affected symbols and blast radius**:
- `JS_TEMPLATE` (`src/tools/smart_connections_query/_template.ts:4`): the only production caller is `executeSmartConnectionsQuery` (`handler.ts:28`, through `composeEvalCode`). It is tested through `handler.test.ts`, and the new `_template.test.ts` adds direct coverage.
- `JS_TEMPLATE` (`src/tools/smart_connections_similar/_template.ts:4`): the only production caller is that tool's `handler.ts`. It is tested through its `handler.test.ts`, and the new `_template.test.ts` adds direct coverage.
- `smartConnectionsQueryInputSchema` (`schema.ts:16`) and `smartConnectionsSimilarInputSchema` (`schema.ts:6`): consumed by their `create*Tool` factories through `registerTool`, and by their `schema.test.ts`. The emitted JSON Schema is unchanged (S3).
- `SMART_CONNECTIONS_QUERY_DESCRIPTION` and `SMART_CONNECTIONS_SIMILAR_DESCRIPTION`: consumed by their factories and asserted by their `index.test.ts`. Their fingerprints move deliberately, through `fingerprintLiveRegistry` → `createServer()`.
- `createSmartConnectionsQueryTool` and `createSmartConnectionsSimilarTool`: called by `server.ts`, `_typed-result-fixtures.ts` and `_plugin-noise.test.ts`. They are not edited. Those fixtures stub the spawned envelope, so the template changes do not affect them.
- Handlers: not edited.

**Kernel-node touch surface**: none. `createServer()`, `createLogger()`, `createQueue()` and `UpstreamError` are not edited, and no production file gains a call to them. That is the explicit no-touch claim for post-implement verification.

**Post-implement structural verification** (after `codegraph sync`):
1. No new error class or code; `src/errors.ts` is unchanged.
2. No handler imports `createLogger` / `createQueue`; `server.ts` is unchanged.
3. Each `_template.ts` imports only `../_shared.js` and its own `./schema.js`, and neither `schema.ts` imports its template. No tool → tool edge.
4. Each `MAX_LIMIT` has production callers: its `schema.ts` (`.max`) and its `_template.ts`, the latter reached from its handler.

## Follow-ups (out of scope)

None.

## Complexity Tracking

> No Constitution Check violations; the table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
