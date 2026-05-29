# Implementation Plan: Retry Cold Start

**Branch**: `059-retry-cold-start` | **Date**: 2026-05-30 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/059-retry-cold-start/spec.md`

## Summary

Implement ADR-029: a single, centralized cold-start retry inside `dispatchCli` — the sole spawn-and-classify primitive every command already flows through. When the first attempt against a registered-but-closed vault returns the cold-start signature, `dispatchCli` re-runs the spawn once; the second attempt is authoritative (success or failure). Because the retry lives at the single CLI chokepoint, every current and future tool (typed tools and the `obsidian_exec` passthrough alike) inherits it with **zero per-tool adaptation** — and a build-failing structural guardrail test makes that invariant enforced rather than conventional.

The technical approach was validated against the real dispatch code and stress-tested by an 8-agent adversarial workflow (run 2026-05-30). Three findings shaped this plan: (1) the retry must be placed **inside** `dispatchCli` (not a facade wrapper or a `spawnFn` decorator — only the in-primitive position is bypass-proof *and* classifier-aware); (2) the `Stream closed` transport variant is **not** unconditionally safe for mutating commands and is therefore probe-gated; (3) three implementation wrinkles (log/metric collision, the dangerous exit-0 resolve path, and an orphan-child shutdown race) must be handled beyond the naive try/catch sketch.

## Technical Context

**Language/Version**: TypeScript (strict, `module`/`moduleResolution` NodeNext, target ES2024); Node.js ≥ 22.11
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP transport), `zod` (boundary validation), `node:child_process` `spawn` (the sole CLI spawn, confined to `_dispatch.ts`); `vitest` + `@vitest/coverage-v8` (tests)
**Storage**: N/A (no persistence; the feature is dispatch-layer control flow)
**Testing**: `vitest run`; co-located `*.test.ts` per Principle II; plus implement-phase T0 live-CLI probes against the authorized test vault per `.memory/test-execution-instructions.md`
**Target Platform**: Node MCP server over stdio (Windows host for the test vault; cross-platform production)
**Project Type**: Single project — `src/` MCP server with per-surface tool modules and a centralized `cli-adapter/`
**Performance Goals**: Success path adds **zero** extra spawns and zero delay. Retry path adds **exactly one** extra spawn, serialized inside the same queue slot (no new concurrency), worst case bounded by one `TYPED_TOOL_TIMEOUT_MS` (10 s) / `OBSIDIAN_EXEC` timeout; an optional single small fixed bounded pre-retry delay is added only if the OQ-003 probe shows the immediate retry races the launch
**Constraints**: No new top-level `UpstreamError.code` (Constitution IV); retry bounded to one (no loop/backoff); retry stays inside the single `queue.run` slot both facades already hold; `isColdStart` must type-guard an `unknown` thrown value before reading `.code`/`.message`
**Scale/Scope**: One primitive (`dispatchCli`) + two facades (`invokeCli`, `invokeBoundedCli`); ~37 tool handlers inherit the behaviour transparently. The diff is confined to `src/cli-adapter/**` plus one new architecture guardrail test.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| Principle / ADR | Verdict | Evidence |
|---|---|---|
| I — Modular Code Organization | **Y** | `dispatchOnce` + `isColdStart` stay **inside** `src/cli-adapter/_dispatch.ts` (the retry is intrinsic to spawn-and-classify; splitting it across a new module would fragment the spawn lifecycle and need its own header for marginal benefit). Imports stay one-directional (tool → facade → `_dispatch` → `node:child_process`); no new upward/cyclic edges. The new `architecture.test.ts` lives in `src/cli-adapter/`. |
| II — Public Surface Test Coverage | **Y** | The dispatch behaviour is covered by new cases in `_dispatch.test.ts` (happy: cold-start→retry→success; boundary/failure: persistent signature, different-error-on-retry, no-retry-on-non-cold-start, exact spawn-count). Facade inheritance tests added to `cli-adapter.test.ts` and `invoke-bounded-cli.test.ts`. No MCP tool is added/renamed; the inherited behaviour is regression-tested at the primitive and both facades. |
| III — Boundary Input Validation with Zod | **N/A** | No new tool, no new boundary input shape, no schema change. (`isColdStart` type-guards an internal `unknown` thrown value — internal control flow, not a published boundary; Principle III governs tool inputs.) |
| IV — Explicit Upstream Error Propagation | **Y** | The retry is a Principle-IV "(a) handled with a documented recovery path" — ADR-029 is the citation. **Zero new top-level codes**: the trigger reuses the existing `CLI_REPORTED_ERROR` classification; on persistent failure the second attempt's existing `UpstreamError` propagates unchanged. No `catch` returns empty/default/null. A `dispatch.retry` log line preserves the chain-of-custody for the discarded first attempt (logging is not "handling"; the real retry + real propagation is). |
| V — Attribution & Layered Composition | **Y** | `_dispatch.ts` already carries `// Original — no upstream.`; its one-line description is updated to mention the single-retry policy (ADR-029). No new module ⇒ no new header obligation; the new `architecture.test.ts` gets an `// Original — no upstream.` header. |
| ADR-010 (typed tool names mirror upstream) | **N/A** | No typed tool added. |
| ADR-013 (plugin-namespace tool naming) | **N/A** | No plugin-backed tool added. |
| ADR-014 (plugin-backed runtime-dependency pattern) | **N/A** | No plugin-backed tool added. |
| ADR-015 (sub-discriminators via `details.reason`) | **N/A** | No new `(top-level-code, details.code)` pair and no new sub-state introduced. |

**Result: no violations → no Complexity Tracking entry required.** The current top-level `UpstreamError.code` union (verified from `src/errors.ts` + production: `CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`, `CLI_NON_ZERO_EXIT`, `ERR_NO_ACTIVE_FILE`, `CLI_REPORTED_ERROR`, `TOOL_NOT_FOUND`, `VALIDATION_ERROR`, `INTERNAL_ERROR`, `NOTE_NOT_FOUND`, `FS_WRITE_FAILED`, `FILE_EXISTS`, `EXTERNAL_EDITOR_CONFLICT`, `PATH_ESCAPES_VAULT`) is unchanged by this feature; a regression test asserts the retry adds none. (Strings like `VAULT_NOT_FOUND` / `FILE_NOT_FOUND` / `UNSUPPORTED_FILE_TYPE` are `details.code` sub-discriminators under `CLI_REPORTED_ERROR`, not top-level codes — also unchanged.)

### Graphify structural check

Per the project's plan-phase graph rule. Queried against the graph rebuilt 2026-05-30 (post-spec `/graphify --update`).

- **Affected community**: the CLI-dispatch / runtime-spine community — the "Centralized CLI Dispatch Architecture" hyperedge (`adr_004, adr_007, dispatchCli, invokeCli, invokeBoundedCli, four_priority_classifier`). The change is confined to this community plus a new test node.
- **Kernel-node touch surface** (single source of truth: CLAUDE.md "Validated architectural facts"):
  - `UpstreamError` (error-spine value type, a top god-node): **touched read-only** — `isColdStart` inspects an already-constructed `UpstreamError`'s `code`/`details`; `dispatchOnce` still constructs `UpstreamError` exactly as today. No new code, no new classification branch beyond the retry decision. This is a high-centrality node, so the touch warrants Constitution Compliance reviewer attention even though Principle IV is satisfied.
  - `createLogger()`, `createQueue()`, `createServer()`: the **factories are not constructed outside `server.ts`** — the retry uses the already-injected `logger` (for the `dispatch.retry` line) and constructs neither factory; it does not enter the boot spine. The `Logger` *surface* may gain one `dispatch.retry` method in `src/logger.ts` (D7) — a method addition, not a factory construction — so the DI-confinement invariant the post-implement structural verification checks (no production handler constructs the DI factories; they stay confined to `server.ts`) still holds. The `shuttingDown` guard (D6) is set inside `killInFlightChildren` within `_dispatch.ts`, so `server.ts` is not modified.
- **Blast radius**: high by reach (every command flows through `dispatchCli`), low by surface (one primitive, additive control flow). Flagged for reviewer attention per the kernel-adjacency rule, not because any principle is violated.
- **Post-implement verification** (after `/speckit-implement`, before marking complete): run `/graphify --update` and confirm (1) no new top-level error-code node outside `src/errors.ts`; (2) no production handler imports the boot-time DI factories; (3) `dispatchOnce`/`isColdStart` land in the dispatch community (not a surprise community); (4) the new `architecture.test.ts` is weakly connected (expected for a test node) and `dispatchOnce`/`isColdStart` are structurally connected, not orphaned.

## Project Structure

### Documentation (this feature)

```text
specs/059-retry-cold-start/
├── plan.md              # This file
├── spec.md              # Feature spec (amended through Clarifications 2026-05-30)
├── research.md          # Phase 0 — design decisions + the T0 probe protocol
├── data-model.md        # Phase 1 — the retry's "data" (predicate, attempt outcome, signature forms)
├── quickstart.md        # Phase 1 — how to verify the behaviour end-to-end
├── contracts/
│   └── dispatch-retry.contract.md   # the dispatch-layer retry behaviour contract
├── checklists/
│   └── requirements.md  # spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 — created by /speckit-tasks, NOT here
```

### Source Code (repository root)

```text
src/cli-adapter/
├── _dispatch.ts            # MODIFIED — extract dispatchOnce; add isColdStart + single-retry wrapper; shuttingDown guard; dispatch.retry log; header note
├── _dispatch.test.ts       # MODIFIED — add makeScriptedSpawn(specs[]); 6 retry cases + zero-new-codes + Vault-not-found-no-retry negative case
├── cli-adapter.ts          # UNCHANGED (inherits retry through dispatchCli; the existing Vault-not-found re-class stays above, untouched)
├── cli-adapter.test.ts     # MODIFIED — one facade inheritance test + assert Vault-not-found does NOT retry
├── invoke-bounded-cli.ts   # UNCHANGED (inherits retry through dispatchCli)
├── invoke-bounded-cli.test.ts  # MODIFIED — one facade inheritance test
└── architecture.test.ts    # NEW — FR-012 guardrail: single spawn-import site + dispatchCli two-caller invariant

src/
└── logger.ts               # POSSIBLY MODIFIED — add a dispatch.retry structured log channel (D7), or reuse an existing one
```

**Structure Decision**: Single project; the change is localized to `src/cli-adapter/` (plus a possible one-method addition to `src/logger.ts` for the `dispatch.retry` channel, per research D7). No tool module changes — that locality is the whole point (FR-009). The shutdown guard touches the `_dispatch.ts` module-level state already used by `killInFlightChildren` (invoked from `server.ts` shutdown); the exact wiring (a module-level `shuttingDown` flag set by the existing shutdown path vs. a check inside `dispatchOnce`) is fixed in research.md decision D6, and is confined to `_dispatch.ts` unless the probe shows a `server.ts` hook is required.

## Phase 0 — Outline & Research

See [research.md](research.md). It records the resolved design decisions (D1–D8) and the implement-phase T0 probe protocol that closes the remaining empirical unknowns (OQ-001..OQ-007). All "NEEDS CLARIFICATION" items from the spec are either decided (Clarifications 2026-05-30) or scoped to a named T0 probe with a safe default; none block Phase 1 design.

## Phase 1 — Design & Contracts

- [data-model.md](data-model.md) — the small set of "entities" this control-flow feature has: the `ColdStartTriggerForm` (a | b), the `AttemptOutcome`, the `isColdStart` predicate's inputs, and the signature constants.
- [contracts/dispatch-retry.contract.md](contracts/dispatch-retry.contract.md) — the behavioural contract the dispatch layer now upholds (inputs, the retry decision table, the no-masking and bounded-latency guarantees, and the guardrail invariant).
- [quickstart.md](quickstart.md) — end-to-end verification (unit suite + the implement-phase T0 probe walkthrough requiring a closed test vault).

## Complexity Tracking

> Not applicable — Constitution Check has no `N` verdicts. The design deliberately rejects the more complex alternatives (facade-level retry duplication; per-command idempotency classification) precisely to avoid added complexity and per-tool adaptation risk.
