# Implementation Plan: Fix Empty Bases

**Branch**: `065-fix-empty-bases` | **Date**: 2026-06-30 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/065-fix-empty-bases/spec.md`

> **Modify the existing `bases` typed tool** (it is NOT a new tool). One defect: against a vault with zero `.base` files, the native `bases` subcommand exits 0 and prints an informational line ("No base files found in vault") to stdout; the handler currently line-splits stdout blind, so that one line becomes a fake Base and the listing reports `{ bases: ["No base files found in vault"], count: 1 }`. The clarify phase settled the **mechanism**: replace the blind line-split with a **positive `.base` filter** — on clean exit, keep only lines ending in `.base` (case-insensitive); drop everything else. This restores the contract the tool already advertises (`Empty vault returns { bases: [], count: 0 }`) without touching the published surface, the schema, or the error spine.

## Summary

`bases` answers "what Base files does this vault contain?" as a sorted, names-only list with a count. Against an empty vault it lies: the count is one and the single "name" is the underlying CLI's informational message — a fake every downstream Bases operation rejects, and a value that makes "count is zero" useless as an empty-vault probe.

**Primary requirements** (from spec, post-clarify): an empty vault returns `{ bases: [], count: 0 }` (FR-001 / SC-001/002); on clean exit, only lines ending in `.base` (case-insensitive) are Base names — the informational message, blank, and whitespace-only lines are dropped, so empty-signal recognition is independent of the message's wording (FR-002 / SC-001); the count equals the real Base count, never inflated by an informational line (FR-003); the populated path is byte-identical to today's output — same membership, same sort order (FR-004 / SC-003); a single real Base still reports count one (FR-005); genuine failures stay plainly distinct from the empty result via the existing upstream-failure path, with no new top-level error code (FR-006 / SC-004); the fix is confined to the empty-listing path — names-only shape and the named-`vault` argument unchanged (FR-007).

**Technical approach** (confined to `src/tools/bases/handler.ts` + its co-located `handler.test.ts`; the tool stays in the **native-CLI-wrapper Bases family**; **no kernel-node touch**, **no published-surface change**):

- **Mechanism — positive `.base` filter.** Replace the current `split → trim → filter(non-empty) → sort` pipeline with `split → trim → filter(line ⇒ line.toLowerCase().endsWith(".base")) → sort`. The only behavioural change is the membership predicate: "non-empty" becomes "ends in `.base`". On a populated vault every stdout line is already a `.base` path, so the filtered output is byte-identical to today's (FR-004). On an empty vault the lone informational line is dropped, yielding `{ bases: [], count: 0 }` (FR-001). The `trim()` (retained from the current handler) also absorbs a trailing CR so a CRLF `…\.base\r` line still matches.
- **Error path unchanged.** Genuine failures (non-zero exit, dispatch error, cold-start/recovery failure) are raised by `invokeCli` as `UpstreamError` **before** stdout is parsed — the filter only ever runs on a clean (exit-0) success. So Story 3 holds with zero new error-handling code and **zero new top-level error codes** (FR-006, Principle IV). The handler continues to classify none of its own failures; it relies on the runtime spine exactly as today.
- **Tests corrected.** The existing `handler.test.ts` case "happy: empty vault returns count=0" uses a *stale* fixture (`stdout: ""`) that does not reproduce the real defect. It is corrected to the **real** empty emission (`stdout: "No base files found in vault\n"`, exit 0) — the test that would have caught this bug. New cases cover: message-line mixed with real `.base` paths (only paths survive); whitespace-only / blank stdout; a single real `.base` (count 1, FR-005); case-insensitive `.base` matching; and the unchanged upstream-failure → `UpstreamError` path (Story 3).

**T0 forcing-gate probe (implement-time, drives `Obsidian.com` per `.memory/test-execution-instructions.md`)**: P1 — empty vault: capture exit code + stdout + stderr of the native `bases` subcommand against a vault with zero `.base` files (expected: exit 0, the informational line on stdout, no `.base` line). P2 — populated vault: confirm one `.base` path per line with no informational text intermixed (regression baseline) and the on-disk extension casing. See [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md). The probe **confirms** the empty-case channel (exit-0-on-stdout) that the defect itself already implies; it is a verification gate, not a design fork — the positive-`.base`-filter mechanism is arm-independent.

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11 — unchanged.
**Primary Dependencies**: `@modelcontextprotocol/sdk`, `zod`; `invokeCli` (`src/cli-adapter/cli-adapter.ts`); `basesOutputSchema` (`src/tools/bases/schema.ts`, unchanged). **No new runtime dependency.**
**Storage**: N/A (reads vault state via the CLI; no project state).
**Testing**: `vitest` (`vitest run`, V8 coverage), co-located `*.test.ts`. In-process unit tests mock `invokeCli` via the existing `makeSpawn` stub — no live CLI for the unit suite. Live-CLI T0 evidence per `.memory/test-execution-instructions.md` (drive `Obsidian.com`, authorised TestVault scratch subdir); probe plan in [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md).
**Target Platform**: Windows (reference, probed), macOS, Linux. Cross-platform recovery rides ADR-029/030 (inherited via `dispatchCli`); untouched here.
**Project Type**: Single project — MCP server (`src/**`).
**Performance Goals**: One `bases` round-trip (unchanged). The filter change is O(lines) on already-collected stdout — no measurable cost.
**Constraints**: Zero new top-level error code (Principle IV); no new `details.reason` (no new failure state — the empty case is a *success*, not an error); names-only output (shape `{ bases, count }` unchanged); published surface frozen (description + input/output schema unchanged → `_register-baseline.json` `bases` fingerprints MUST NOT move; the FR-018 baseline-stability test stays green untouched); populated-path output byte-identical (FR-004); no tool→tool import (Principle I).
**Scale/Scope**: One existing module — `src/tools/bases/handler.ts` (the membership predicate) + its co-located `src/tools/bases/handler.test.ts` (corrected stale fixture + new cases). **No edits to** `schema.ts`, `index.ts`, `_register-baseline.json`, `server.ts`, `docs/tools/bases.md` (already documents the empty→empty contract), `cli-adapter.ts`, `_dispatch.ts`, `errors.ts`, `logger.ts`, `queue.ts`, or any sibling tool module.

**Resolved unknowns**: the contract is settled by the spec (the doc already advertises empty→empty). The mechanism is settled by the clarify session (positive `.base` filter). The remaining item is one **empirical verification gate**, not a design `NEEDS CLARIFICATION`: confirm the empty-vault emission channel (exit code / stdout / stderr) via T0 P1 — its expected value is already implied by the defect (the count=1 symptom is only reachable on a clean exit with the message on stdout).

## Constitution Check

*GATE: must pass before Phase 0 — re-checked after Phase 1 design (below).*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | Change confined to the existing per-surface module `src/tools/bases/` (`handler.ts` only; `{schema, index}.ts` untouched). Imports flow tool → adapter (`invokeCli`); no upward/cyclic deps, no sibling-tool import. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | Modified MCP tool → updated happy-path + failure/boundary tests in the same change, co-located in `handler.test.ts`: empty-vault (corrected to real `"No base files found in vault\n"` emission → `{ bases: [], count: 0 }`), populated regression (unchanged sorted output), message-mixed-with-paths, whitespace/blank, single real `.base` (count 1), case-insensitive `.base`, and the unchanged upstream-failure → `UpstreamError` boundary case (retained). |
| **III. Boundary Input Validation with Zod** | **Y / N/A** | Input schema (`basesInputSchema`) and output schema (`basesOutputSchema`, strict + `count === bases.length` refine) are **unchanged** — the fix is downstream of validation, in stdout post-processing. The output continues to be `basesOutputSchema.parse(...)`-validated, so the `count === bases.length` invariant is enforced for the new empty result too. No hand-rolled types; no `typeof`/`instanceof` at the boundary. |
| **IV. Explicit Upstream Error Propagation** | **Y** | **Zero new top-level codes; zero new sub-states.** The empty vault is a **success** (exit 0), not an error — it must NOT be surfaced as `UpstreamError`. Genuine failures continue to surface through `invokeCli`'s existing `UpstreamError` (`CLI_REPORTED_ERROR` + inherited `CLI_*` recovery codes), raised before the filter runs. No `catch` masks a failure as empty; the positive filter never converts an error into `{ bases: [], count: 0 }` because it only executes on the clean-exit path (FR-006). |
| **V. Attribution & Layered Composition** | **Y** | `handler.ts` keeps its `// Original — no upstream.` header (one-line intent updated to note the `.base` membership filter). No lifted code. |
| **ADR-010** (native-CLI-wrapper tool naming) | **Y / N/A** | No rename and no new tool. `bases` stays a native wrapper over the `bases` subcommand (name unchanged; existing ADR-010 assertion preserved). |
| **ADR-013 / ADR-014** (plugin cohort) | **N/A** | Not plugin-backed — Bases is core, reached via the native `bases` subcommand (no `app.plugins`). |
| **ADR-015** (sub-discriminators via `details.reason`) | **N/A** | No new `(top-level-code, details.code)` pair and no new sub-state — the empty case is a success, not a failure state. The existing error roster is untouched. |

**No `N` verdicts → no Complexity Tracking entry required.**

**Kernel-node attention (per CLAUDE.md)**: touches **none** of the four kernel nodes' definitions. `createLogger` / `createQueue` are injected via `ExecuteDeps` (the handler never constructs/imports them — DI discipline preserved); `UpstreamError` is **not referenced by the handler at all** (it is raised upstream by `invokeCli` and asserted only in the test) — unmodified; `createServer` is **not touched** — `createBasesTool`'s registration line is unchanged (no new DI argument; the published surface does not move). Blast radius: one membership predicate in one existing leaf module of the native Bases family + its co-located test. No baseline fingerprint moves.

**ADR note**: no new ADR required. The positive-`.base`-filter is handler-side response inspection on a clean exit — the same idiom already used elsewhere in the codebase for inspecting successful CLI output; it adds no client-side `.base`-YAML parse (it only reads the path string the CLI already emitted), so it does not brush against the BI-041 "no client-side `.base` parse" norm.

## Project Structure

### Documentation (this feature)

```text
specs/065-fix-empty-bases/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1–D7 + the empty-channel verification gate
├── data-model.md        # Phase 1 — entities, the membership-predicate delta, handler flow, unchanged error roster
├── quickstart.md        # Phase 1 — manual validation scenarios mapped to US1/US2/US3
├── contracts/
│   ├── bases-contract.md     # behavioural contract (empty / populated / failure; positive-.base rule)
│   └── t0-probe-plan.md      # implement-T0 verification probe (P1 empty channel; P2 populated baseline)
├── checklists/requirements.md   # spec quality checklist (clarify-updated)
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
src/tools/bases/
├── handler.ts       # EDIT — membership predicate: filter(non-empty) → filter(lower.endsWith(".base"));
│                    #        update the `// Original — no upstream.` one-line intent
└── handler.test.ts  # EDIT — correct the stale empty-vault fixture to the real "No base files found in vault\n"
                     #        emission; add message-mixed, whitespace/blank, single-.base, case-insensitive cases;
                     #        retain the upstream-failure → UpstreamError boundary case (Story 3)

# UNCHANGED (explicitly not edited): schema.ts, schema.test.ts, index.ts, index.test.ts,
#   src/tools/_register-baseline.json (bases fingerprints frozen), src/server.ts,
#   docs/tools/bases.md (already documents empty → { bases: [], count: 0 })
```

**Structure Decision**: Single project; modify the existing leaf module in the **native-CLI-wrapper Bases family** (`bases` / `query_base` / `views_base` / `create_base`). The fix is a one-line predicate change in `handler.ts` plus its test corrections — the smallest change that restores the already-documented contract. No schema, description, baseline, server, or doc change; no sibling-tool import.

## Phase 0: Research → research.md

Decisions resolving the design (full detail in [research.md](research.md)):

- **D1 — Modify, don't add.** `bases` exists and is registered; this BI changes only its handler's membership predicate + tests. No new tool, no `server.ts` line, no schema change.
- **D2 — Positive `.base` filter, not message-match (clarify-settled).** Keep only clean-exit lines ending in `.base` (case-insensitive); drop everything else. Wording-independent (FR-002); no re-coupling to upstream copy. Negative message-match and hybrid cross-check both rejected at clarify (see spec Clarifications 2026-06-30).
- **D3 — Empty vault is a SUCCESS, not an error.** The CLI exits 0 and prints an informational line; `invokeCli` returns normally. The correct result is `{ bases: [], count: 0 }`, NOT an `UpstreamError`. This is why no new error code / sub-state is introduced (Principle IV; FR-006).
- **D4 — Populated path is byte-identical.** On a populated vault every stdout line is a `.base` path, so adding the `.base` predicate removes nothing; the sorted output equals today's exactly (FR-004 / SC-003). The regression test asserts this.
- **D5 — Retain `trim()`; match `.base` case-insensitively.** The existing per-line `trim()` is kept (absorbs CRLF trailing CR and any stray surrounding whitespace) so `…\.base\r` still matches; the predicate lowercases before `endsWith(".base")` per the clarification. P2 records the on-disk casing to confirm lowercase `.base` is the real-world norm (the case-insensitive predicate is correct regardless).
- **D6 — Correct the stale test fixture.** The current "empty vault" test feeds `stdout: ""`, which never reproduced the defect (empty stdout already yields count 0). It is corrected to the real emission `"No base files found in vault\n"` — the fixture that fails on `main` and passes after the fix, making the test a genuine regression guard.
- **D7 — Empty-channel verification gate (T0 P1).** Confirm the empty-vault emission is exit-0 + informational-line-on-stdout (the channel the defect already implies). Defined per-outcome: if confirmed → positive filter on stdout is exactly right (the plan of record). The expected value is strongly implied by the count=1 symptom; the probe removes the last empirical doubt without forking the design.

**Output**: research.md with all decisions recorded. No `NEEDS CLARIFICATION` remains; the one open item is a T0 verification gate whose expected outcome the defect itself implies.

## Phase 1: Design & Contracts

- **data-model.md** — entities (Base name; Bases listing result; Empty-result signal); the handler-pipeline delta (membership predicate `non-empty` → `lower.endsWith(".base")`, everything else unchanged); the control flow (clean exit → filter → sort → `basesOutputSchema.parse`; error path owned by `invokeCli`, untouched); the unchanged error roster.
- **contracts/bases-contract.md** — the behavioural contract: empty vault → `{ bases: [], count: 0 }`; populated vault → today's sorted names + count; failure → existing `UpstreamError`, never empty; the positive-`.base` membership rule and its wording-independence.
- **contracts/t0-probe-plan.md** — the implement-time verification probe (P1 empty-vault channel: exit/stdout/stderr; P2 populated baseline + extension casing) and the (single-arm) decision tree.
- **quickstart.md** — manual validation scenarios mapped to US1 (empty), US2 (populated unchanged), US3 (failure distinct).
- **Agent context** — update the plan reference inside the `<!-- SPECKIT START/END -->` markers in `CLAUDE.md` from the 064 plan to this plan.

## Phase 1 re-check (post-design Constitution Check)

Re-evaluated after data-model/contracts: input + output schemas unchanged (III N/A on input shape; output still `basesOutputSchema.parse` with the `count === bases.length` refine enforcing the empty result); the empty vault surfaces as a success not an error, zero new top-level codes, zero new sub-states, no `catch`-masking (IV); change confined to one predicate in the native Bases-family handler with no sibling import and no `createServer` touch (I); the modified surface keeps co-located happy + failure tests, including the corrected regression fixture (II); `// Original — no upstream.` header retained (V); ADR-010 unchanged, ADR-013/014/015 N/A. Published surface frozen → `_register-baseline.json` `bases` fingerprints do not move. **No gate regressed; no violations; Complexity Tracking empty.**

## Graphify structural check

Per the CLAUDE.md `/speckit-plan` rule. Grounded by a scoped graph lookup (`/graphify explain executeBases`) plus direct source lookup (`bases/handler.ts`, `bases/schema.ts`, `bases/index.ts`, `cli-adapter.ts`, `_register-baseline.json`); the relevant symbols were all named in the spec/conversation, so per CLAUDE.md the scoped lookups (not the report) are the correct interface.

**Affected community**: the **native-CLI-wrapper Bases family** (`bases` / `query_base` / `views_base` / `create_base`). The change lands entirely in `bases/handler.ts`. The **runtime spine** (`invokeCli → dispatchCli`) and **error spine** (`UpstreamError`) are referenced indirectly through `invokeCli`, not restructured.

**Kernel-node touch surface**: graph fact — `executeBases()` has **degree 4**, with edges only to `invokeCli()`, its `handler.test.ts`, its module `handler.ts`, and `index.ts`; it has **no edge to `UpstreamError`** and no edge to `createLogger`/`createQueue`/`createServer`. So: `createLogger` / `createQueue` — injected via `ExecuteDeps`, never imported by the handler (DI discipline preserved). `UpstreamError` — not referenced by the handler (raised upstream by `invokeCli`); unmodified. `createServer` — **not touched**; `createBasesTool`'s registration is unchanged. The plan touches **none** of the four kernel nodes.

**Guardrail / invariant impact**: the FR-018 registry-stability baseline (`_register-baseline.json` + its test) does **NOT** change — `bases`'s description and input/output schema are untouched, so its fingerprints stay put and the baseline test stays green without regen. This is the *positive* signal that the published surface is frozen. ADR-030's two-spawn-site invariant is untouched (no new spawn site; `invokeCli` call unchanged).

**Post-implement structural verification** (after `/speckit-implement`, run `/graphify --update` first): (1) no new top-level error code (no new error-class node outside `src/errors.ts`); no new `details.*` literal (the empty case is a success). (2) the `bases` handler still imports neither `createLogger`/`createQueue`/`createServer` nor `UpstreamError` directly, and imports no sibling tool module — `executeBases`'s edge set stays {`invokeCli`, its test, its module, `index.ts`}. (3) `bases` stays in the Bases-family community (no surprise migration). (4) the modified production file (`handler.ts`) remains structurally connected (its test is weakly connected by design).

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
