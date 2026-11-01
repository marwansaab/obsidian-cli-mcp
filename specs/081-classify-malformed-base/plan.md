# Implementation Plan: Classify Malformed Base

**Branch**: `081-classify-malformed-base` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/081-classify-malformed-base/spec.md`

> **This change modifies one tool's failure classification.** It touches `views_base`'s handler, its published description and tool reference, and moves one regex literal out of `query_base` into a shared tool helper. `query_base` behaves byte-identically.
>
> It adds no tool, parameter, output field, top-level error code, `details.code` or `stage`. `BASE_MALFORMED` in `views_base` gains the closed `details.reason` set `invalid-yaml` | `unknown` and the keys `details.message` / `details.messageLength`. Only `views_base`'s `descriptionFingerprint` moves in `_register-baseline.json`.

## Summary

A `.base` whose YAML Obsidian cannot parse reaches the agent from `views_base` as the dispatch layer's generic `CLI_REPORTED_ERROR`. That error carries the raw, unbounded parser output, because `listFocusedViews` recognises only the "Active file is not a base file" report (research F1). This plan carries out the spec and its two clarifications:

- **D1 (one shared pattern)**: `query_base`'s `invalid-yaml` regex moves, unchanged, to `src/tools/_base-malformed.ts` as `INVALID_YAML_PATTERN`. Both tools use it, so one broken file classifies the same way in both (FR-011, SC-005) without a tool→tool import.
- **D2 (recognition)**: in `listFocusedViews`, the YAML check runs before the not-a-base check:
  - on the failure path, for `CLI_REPORTED_ERROR` or `CLI_NON_ZERO_EXIT`, over stderr and stdout;
  - on the clean-exit path, over stderr and the non-view stdout lines, so a view named "YAML notes" never trips it (F5).
- **D3 (shape)**: `CLI_REPORTED_ERROR` with `details: { code: "BASE_MALFORMED", reason, base_path?, message, messageLength }`:
  - `reason` is `invalid-yaml` for a YAML complaint, and `unknown` for the named-mode not-a-base report, which keeps its current headline;
  - `message` is the bounded report, using spec 080's `stdoutDetails` with renamed keys (Clarifications Q1);
  - the headline is plain ("… is malformed: its YAML cannot be parsed").
  `cause` is not serialised (F2), so the raw output no longer leaks.
- **D4 (never malformed)**: "no views defined" or absent-views wording, view lines and unrecognised failures are never classified as malformed. An unrecognised failure is rethrown unchanged.
- **D5 (surface)**: the description and `docs/tools/views_base.md` enumerate both reasons, the baseline is regenerated deliberately, and the CHANGELOG gets an entry.
- **D6 (tests)**: contract cases M1–M16, plus a pattern test.
- **D7 (T0)**: probes P1–P4 run before code. If no complaint surfaces at all, or a complaint does not match the shared pattern, implementation escalates. The shared pattern is never widened during implementation, because widening it would change `query_base`, which is out of scope.

The published behaviour is in [contracts/views_base-malformed-contract.md](contracts/views_base-malformed-contract.md).

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. Unchanged.

**Primary Dependencies**: `@modelcontextprotocol/server` (SDK v2), `zod` 4. **No new dependency.**

**Storage**: none.

**Testing**: `vitest run`, co-located `*.test.ts`. The existing `makeDeps` / `evalOk` helpers in `src/tools/views_base/handler.test.ts` are reused.

**Target Platform**: Windows, macOS and Linux; CI on Linux and Windows. Line splitting treats `\r\n` and `\n` alike, as `parseViews` already does.

**Project Type**: single project, an MCP server (`src/**`).

**Performance Goals**: one regex test over the report, on the paths that already scan for not-a-base. No extra CLI round trip.

**Constraints**:

- No new top-level code, `details.code` or `stage` (FR-008, Principle IV).
- `query_base` behaviour is byte-identical (spec Out of scope).
- The success envelope and Base selection are unchanged (FR-012).
- The open-mode not-a-base case stays `BASE_NOT_FOUND` / `not-open` (spec 064 roster, FR-007).
- The headline holds no report text (FR-005).
- `details.message` is at most 1,011 characters (FR-006).

**Scale/Scope**:

- **New code**: `src/tools/_base-malformed.ts` (one exported constant) and `src/tools/_base-malformed.test.ts`.
- **Changed code**:
  - `src/tools/views_base/handler.ts`: `listFocusedViews` and the two `onNotABase` callbacks become a classify step; the header intent line;
  - `src/tools/query_base/handler.ts`: the `invalid-yaml` entry references the constant;
  - `src/tools/views_base/index.ts`: the `BASE_MALFORMED` clause.
- **Tests**: `src/tools/views_base/handler.test.ts` (M1–M15; the existing malformed test gains its `reason` assertion) and `src/tools/views_base/index.test.ts` (M16, the invalid-locator cause of SC-002).
- **Docs**: `docs/tools/views_base.md`, `CHANGELOG.md`, `src/tools/_register-baseline.json` (regenerated), and the plan pointer in `CLAUDE.md`.

**Resolved unknowns**: all decisions are made. The one empirical unknown is the live channel and wording (F7), and T0 probes P1–P4 resolve it before code. If they show no complaint at all, or wording the shared pattern does not match, implementation stops and escalates (research D7).

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | `_base-malformed.ts` is a shared tool helper, the same layer as `_base-path.ts` and `_eval-parse.ts`. It is imported by `views_base/handler.ts` and `query_base/handler.ts` only. `views_base` also imports `stdoutDetails` from `_eval-parse.ts`. Imports run tool → shared helper. There is no tool→tool edge, no upward or cyclic edge, and the `{schema, tool, handler}.ts` layout is unchanged. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | `views_base`'s failure behaviour changes. Its happy path (M9, M11) and failure/boundary cases (M1–M8, M10, M12–M15) land in `handler.test.ts`, and the five-cause guard M16 in `index.test.ts`, in the same change. The new helper gets `_base-malformed.test.ts`. `query_base`'s existing classifier tests guard the refactor. |
| **III. Boundary Input Validation with Zod** | **N/A** | No input or output schema changes. |
| **IV. Explicit Upstream Error Propagation** | **Y** | The malformed Base is now a typed `UpstreamError` under an existing code and `details.code`. The cause is kept "where safe": a bounded `details.message` plus `messageLength`, and the dispatch error as `cause`. Unrecognised failures are rethrown unchanged, never masked or emptied. No new code. |
| **V. Attribution & Layered Composition** | **Y** | The new module and test carry `// Original — no upstream. …`. The intent headers of `views_base/handler.ts` and `query_base/handler.ts` are updated for the shared constant. |
| **ADR-015** (sub-discriminators) | **Y** | `BASE_MALFORMED` gains a closed `details.reason` set (`invalid-yaml` \| `unknown`) whose values call for different fixes (repair the YAML, or investigate). Both `(code, reason)` pairs are enumerated in `docs/tools/views_base.md`. `unknown` is the ADR's sanctioned default sub-state, and the set is a subset of `query_base`'s. |
| **ADR-029** (cold-start retry) | **N/A** | Dispatch is untouched. A cold-start `CLI_REPORTED_ERROR` matches no YAML phrase and is rethrown as today. |
| **ADR-010 / ADR-013 / ADR-014** | **N/A** | No tool added or renamed. No template is edited. |
| **ADR-040** (published descriptions) | **Y** | Only the tool description's `BASE_MALFORMED` clause changes. Parameter descriptions and server instructions are unchanged. |
| **MCP Tool Surface Standards** | **Y** | Title, annotations, input and output schemas and dialect are unchanged. The description fingerprint moves deliberately through `npm run baseline:write` (quickstart §2). Errors stay `isError: true` results. |
| **Security Defaults** | **Y** | No escape hatch, mode or write path changes. The change narrows what crosses the boundary: raw parser output is bounded to 1,011 characters, and the full output stays in the unserialised `cause`. |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**Kernel-node attention (per CLAUDE.md)**:

- `UpstreamError` is used, not changed; `src/errors.ts` is unchanged.
- `createLogger`, `createQueue` and `createServer` are not touched.
- No high-blast-radius non-kernel surface is edited: `invokeCli`, `dispatchCli` and `_register.ts` are unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/081-classify-malformed-base/
├── plan.md                                   # This file
├── research.md                               # F1–F7 findings, D1–D7 decisions
├── data-model.md                             # report, YAML complaint, view line, failure; V1–V8; state flow
├── quickstart.md                             # automated gate, baseline gate, T0 P1–P4, live end-to-end
├── contracts/
│   └── views_base-malformed-contract.md      # §1 recognition R1–R5, §2 shapes, §3 M1–M16, §4 unchanged
├── checklists/requirements.md
└── tasks.md                                  # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
src/tools/_base-malformed.ts                  # NEW: INVALID_YAML_PATTERN (moved verbatim from query_base)
src/tools/_base-malformed.test.ts             # NEW: positives (BI-057 phrase, YAMLException) / negatives (no views defined, …)
src/tools/views_base/handler.ts               # listFocusedViews: YAML check first (failure + clean-exit paths), view-line
                                              #   exclusion, BASE_MALFORMED {reason, message, messageLength}; header line
src/tools/views_base/handler.test.ts          # M1–M15
src/tools/views_base/index.test.ts            # M16 (invalid locator in the five-cause roster)
src/tools/views_base/index.ts                 # VIEWS_BASE_DESCRIPTION BASE_MALFORMED clause
src/tools/query_base/handler.ts               # invalid-yaml entry → INVALID_YAML_PATTERN; header line
src/tools/_register-baseline.json             # regenerated (views_base descriptionFingerprint only)
docs/tools/views_base.md                      # two BASE_MALFORMED rows + worked example
CHANGELOG.md                                  # [Unreleased] Fixed
CLAUDE.md                                     # plan pointer → this plan

# UNCHANGED: src/errors.ts, src/cli-adapter/**, src/server.ts, src/tools/_register.ts,
#   src/tools/_eval-parse.ts, every schema.ts, every _template.ts, query_base tests
```

**Structure Decision**: single project. The shared pattern sits beside the other cross-tool Bases helper (`_base-path.ts`), so the two Bases tools that run a view or list views agree on what a YAML complaint is. Classification stays in `views_base`'s handler, where the mode-specific error is already chosen.

**Docs-as-code**: `.docs-as-code/capabilities/bases.md` (its `BASE_MALFORMED` lines) is updated by `/speckit-docs-as-code <n>` after review, per the PR lifecycle in CLAUDE.md.

## Phase 0: Research → research.md

- **F1**: where the outcome is lost; the generic error's shape.
- **F2**: only `{code, message, details}` is serialised.
- **F3**: `query_base`'s classifier; the Principle I constraint.
- **F4**: spec 080's `stdoutDetails` is on `main`.
- **F5**: the view-name false-positive risk.
- **F6**: the published surface and baseline.
- **F7**: the live wording is not yet captured.
- **D1 to D7**: as summarised above.

**Output**: research.md, with no `NEEDS CLARIFICATION` remaining.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)**: upstream report, YAML complaint, view line, malformed-Base failure; invariants V1–V8; the state flow of one call.
- **[contracts/views_base-malformed-contract.md](contracts/views_base-malformed-contract.md)**: recognition R1–R5, failure shapes, test cases M1–M16, what stays unchanged.
- **[quickstart.md](quickstart.md)**: the automated gate, the baseline gate, T0 probes P1–P4 under `.memory/test-execution-instructions.md`, and the live end-to-end check.
- **Agent context**: the `CLAUDE.md` plan pointer now points at this plan.

## Phase 1 re-check (post-design Constitution Check)

- **I**: one new helper; imports run one way; no tool→tool edge.
- **II**: every contract row maps to a co-located test.
- **III**: N/A.
- **IV**: a typed failure, a bounded cause, unrecognised failures rethrown unchanged.
- **V**: headers on the new files; intent lines updated.
- **ADR-015**: closed reason set, enumerated in the docs.
- **MCP Tool Surface Standards**: the baseline moves for the description only.

**No gate regressed; Complexity Tracking is empty.**

### Spec alignment note

- **FR-007 and the open-mode not-a-base report**: it stays `BASE_NOT_FOUND` / `not-open`. Only a YAML complaint makes an open Base malformed. If the T0 probe P3 shows Obsidian reporting a malformed open Base **only** as "not a base file", with no parser text, the open-mode half of FR-002 cannot be met from the output. Implementation then escalates (research D7) rather than reclassifying `not-open`.
- **FR-011 / SC-005 and probe findings**: `INVALID_YAML_PATTERN` moves byte-identically and is never widened by this work. A phrase added to it would also change `query_base`, which BI-0137 §Out of scope excludes. A `views_base`-only phrase would weaken FR-011. So a T0 complaint the pattern does not match is recorded in `contracts/t0-probe-findings.md` and escalated to the owner before any code is written (research D7; spec Assumptions).
- **The named-mode `unknown` path**: it gains `reason: "unknown"` and the bounded `message` / `messageLength`. Its headline and `base_path` are unchanged, so the change is additive (ADR-015).

### CodeGraph structural check

Run with `codegraph_explore` at plan time (HEAD `03b90b5`).

**Affected symbols and blast radius**:

- `listFocusedViews` (`src/tools/views_base/handler.ts:96`): private to the handler. Its callers are the two `executeViewsBase` branches (`handler.ts:158`, `:169`).
- `executeViewsBase` (`handler.ts:121`): called by `createViewsBaseTool` (`src/tools/views_base/index.ts:25`). Tested by `handler.test.ts`.
- `createViewsBaseTool`: called by `src/server.ts` and `src/tools/_typed-result-fixtures.ts`. Tested by `views_base/index.test.ts`, `_plugin-noise.test.ts` and `_surface.test.ts` via the fixtures. Its success fixture (`out("All\ttable\nActive\ttable\n")`) is a clean-exit view-line case, so it must stay green (M9 / M11 class).
- `VIEWS_BASE_DESCRIPTION` (`index.ts:10`): read by `index.test.ts` and `_file-type-support.test.ts`, and fingerprinted in `_register-baseline.json`.
- `CLASSIFIER_PATTERNS` / `classifyUpstreamError` / `classifyAndThrow` (`src/tools/query_base/handler.ts:109`, `:141`, `:159`): private to `query_base`. The only change is that the regex literal becomes an imported constant. Guarded by `query_base/handler.test.ts`.
- `stdoutDetails` (`src/tools/_eval-parse.ts:26`): a shared helper already called across the eval cohort and by `query_base`. It is used, not changed.

**Kernel-node touch surface**: none.

- `UpstreamError` is used (new construction sites in `views_base`), not edited.
- `createLogger`, `createQueue` and `createServer` are untouched.
- `views_base` still receives `logger` and `queue` through `ExecuteDeps`.

**High-blast-radius surface**: none edited. `invokeCli` and `dispatchCli` are only called, never changed.

**Post-implement structural verification** (after `codegraph sync`):

1. There is no new error class or top-level code. `src/errors.ts` is unchanged, and the new failures are `CLI_REPORTED_ERROR` through `UpstreamError`.
2. No handler imports `createLogger` / `createQueue`, and `server.ts` is unchanged.
3. `_base-malformed.ts` is imported only by `views_base/handler.ts`, `query_base/handler.ts` and its own test. `views_base` imports nothing from `query_base`, and the reverse holds too.
4. `INVALID_YAML_PATTERN` is reachable from both production handlers, and the moved regex has no remaining inline copy. This check is SC-005's structural proof, and the live check (quickstart §4 step 5) is its runtime proof. No cross-tool unit test is added: one would need a test-only edge between the two tools, or new `query_base` tests, which research D6 leaves unchanged.

## Follow-ups (out of scope)

- **`query_base`'s unbounded `details.message`**: `query_base` still places the full complaint unbounded in `details.message`. Bounding it there too would be a `query_base` change, which this spec rules out. It is a candidate backlog item for cohort parity.
- **Open-mode `base_path`**: naming the open Base in open-mode failures would need an extra eval. It is not required (spec Assumptions).
- **Not-a-base on `CLI_NON_ZERO_EXIT`**: the not-a-base rule keeps its current `CLI_REPORTED_ERROR`-only scope.

## Complexity Tracking

> No Constitution Check violations; the table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
