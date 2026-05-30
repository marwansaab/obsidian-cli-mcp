# Implementation Plan: Recover Closed Obsidian

**Branch**: `060-recover-closed-obsidian` | **Date**: 2026-05-30 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/060-recover-closed-obsidian/spec.md`

## Summary

When the Obsidian **application** is not running at all, every vault operation fails today with a generic `CLI_NON_ZERO_EXIT` ("The CLI is unable to find Obsidian…") and blocks the caller until a human starts the app — making unattended/scheduled use impossible. This feature makes the dispatch layer **recover automatically**: it recognises the app-not-running signal, launches Obsidian via the OS-agnostic `obsidian://open?vault=…` URI (Windows `start` / macOS `open` / Linux `xdg-open`), waits a bounded period for readiness, and re-runs the original command so the caller gets the normal result from a single call. When recovery cannot succeed (launch impossible, or opt-out set), it surfaces a distinct, documented error — the existing `CLI_NON_ZERO_EXIT` code carrying `details.reason: "obsidian-not-running"` (ADR-015 sub-discriminator; **no new top-level code**). The already-running success path is untouched (recovery is reactive). The feature sits **in front of** ADR-029 / BI 059 (which handles a registered-but-closed *vault* inside a *running* app) and composes with — does not duplicate — its cold-start retry.

Technical approach is fully grounded in plan-time **live T0 probes** (Windows, `Obsidian.com`): the app-down signal is byte-identical across commands (exit 1, empty stdout, stderr `unable to find Obsidian`), and the `obsidian://` URI launch reached readiness in ~3 s. See [research.md](research.md) and [contracts/t0-probe-findings.md](contracts/t0-probe-findings.md).

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11 — unchanged.
**Primary Dependencies**: `@modelcontextprotocol/sdk`, `zod`, `node:child_process` (spawn). No new runtime dependency (the launcher uses `node:child_process` + the OS URI handler).
**Storage**: N/A (in-memory dispatch behaviour only).
**Testing**: `vitest` (`vitest run`, V8 coverage), co-located `*.test.ts`. Manual real-CLI scenarios in [quickstart.md](quickstart.md).
**Target Platform**: Windows, macOS, Linux (OS-agnostic by design — per user input). Launch mechanism is one URI + a per-platform opener; the app-down signal is CLI-emitted (OS-invariant). Windows verified at plan-time; macOS/Linux flagged for user validation (quickstart macOS/Linux scenarios).
**Project Type**: Single project — MCP server (`src/**`).
**Performance Goals**: Zero added latency on the already-running success path (FR-011/SC-002). Recovery path bounded by `OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS = 30 000 ms` (T0: ~3 s typical on Windows).
**Constraints**: At most one launch per operation; bounded termination (FR-004/FR-010); single-flight via the existing queue (FR-006); no new top-level error code (Principle IV); side-effect-safe re-attempt (app-down ⇒ command never executed).
**Scale/Scope**: Two new files (`src/app-launcher/app-launcher.ts` + test); edits to `src/cli-adapter/_dispatch.ts`, `src/logger.ts`, `src/cli-adapter/architecture.test.ts`, plus co-located dispatch/facade tests and logger test-mocks.

**Resolved unknowns** (all from research.md): D1 detection signal, D2 cross-platform launch, D3 readiness bound, D4 error encoding (clarify-locked), D5 opt-out, D6 module/guardrail, D7 observability. No remaining NEEDS CLARIFICATION.

## Constitution Check

*GATE: must pass before Phase 0 — re-checked after Phase 1 design (below).*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | New `src/app-launcher/` module (pure launch primitive), imported one-directionally by `_dispatch` (`_dispatch → app-launcher`, no cycle), mirroring the `binary-resolver` precedent. Recovery orchestration stays in `dispatchCli` (the single recovery brain, where the ADR-029 retry already lives). |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | No new MCP tool, but the dispatch behaviour is exercised through both facades. New/updated co-located tests: `app-launcher.test.ts` (happy + opener-ENOENT/boundary), `_dispatch.test.ts` (`isAppNotRunning`, classification reason, recovery loop, bound, opt-out, shutdown guard, side-effect-safety), `cli-adapter.test.ts` / `invoke-bounded-cli.test.ts` (both facades inherit recovery), `architecture.test.ts` (extended guardrail + self-tests). |
| **III. Boundary Input Validation with Zod** | **N/A** | No new caller-facing boundary/tool input. The only externally-influenced input is the `OBSIDIAN_AUTO_LAUNCH` env var, parsed by a narrow internal helper (env vars are not a zod boundary surface; consistent with `OBSIDIAN_BIN` in `binary-resolver`). |
| **IV. Explicit Upstream Error Propagation** | **Y** | The unrecoverable/opt-out case is an `UpstreamError` reusing `CLI_NON_ZERO_EXIT` + `details.reason: "obsidian-not-running"` — **no new top-level code**, no silent fallback, no swallowed failure. Non-app-down failures keep single-shot behaviour (FR-009). |
| **V. Attribution & Layered Composition** | **Y** | New files carry `// Original — no upstream.` headers. The `obsidian://` URI scheme and per-OS openers are platform facilities, not lifted code. |
| **ADR-010** (native-CLI-wrapper tool naming) | **N/A** | No new typed tool added. |
| **ADR-013** (plugin-namespace tool naming) | **N/A** | No plugin-backed tool added. |
| **ADR-014** (plugin-backed runtime-dependency pattern) | **N/A** | No plugin-backed tool added. |
| **ADR-015** (sub-discriminators via `details.reason`) | **Y** | Adds `details.reason: "obsidian-not-running"` on `CLI_NON_ZERO_EXIT`. Three-condition gate met: agent-actionable ("start Obsidian"), ≥2 sub-states (generic non-zero exit vs obsidian-not-running), closed enum documented (contracts/recovery-contract.md §4, data-model §2). |

**No `N` verdicts → no Complexity Tracking entry required.**

**Kernel-node attention (per CLAUDE.md)**: this plan touches the **`createLogger`** kernel node (new `dispatchRecovery` event — high blast radius because `Logger` is injected everywhere, but additive/mechanical) and **uses** the **`UpstreamError`** error-spine value type (new `details.reason` value, no new code/class node). It does **not** touch `createQueue` or `createServer`. Reviewer attention is warranted on the `createLogger` interface change and the `architecture.test.ts` guardrail extension even though no principle is violated. See the Graphify structural check below.

**ADR note**: this feature extends the ADR-029 D8 no-bypass guardrail (a second sanctioned spawn site) and introduces the `obsidian://`-URI launch mechanism, the `obsidian-not-running` sub-discriminator, and the `OBSIDIAN_AUTO_LAUNCH` opt-out — warranting a new **ADR-030**. ADR authoring is a deliberate act and is flagged for the user, not performed in this plan.

## Project Structure

### Documentation (this feature)

```text
specs/060-recover-closed-obsidian/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1–D7, T0-pinned
├── data-model.md        # Phase 1 — types & recovery state transitions
├── quickstart.md        # Phase 1 — manual validation (Win done; macOS/Linux flagged)
├── contracts/
│   ├── recovery-contract.md     # behavioural contract (detection, launcher, state machine, error, opt-out)
│   └── t0-probe-findings.md     # live-CLI probe evidence
├── checklists/
│   └── requirements.md  # spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
src/
├── app-launcher/
│   ├── app-launcher.ts          # NEW — launchObsidian(): obsidian:// URI via per-OS opener (the 2nd spawn site)
│   └── app-launcher.test.ts     # NEW — happy path per platform + opener-ENOENT boundary
├── cli-adapter/
│   ├── _dispatch.ts             # EDIT — APP_NOT_RUNNING_PATTERN, isAppNotRunning, reason classification,
│   │                            #        recovery loop in dispatchCli, autoLaunchEnabled(env), launchFn seam
│   ├── _dispatch.test.ts        # EDIT — predicate, classification, recovery loop, bound, opt-out, shutdown, mutation-safety
│   ├── cli-adapter.ts           # (no change expected — facade already threads DispatchDeps)
│   ├── cli-adapter.test.ts      # EDIT — invokeCli inherits recovery
│   ├── invoke-bounded-cli.test.ts # EDIT — invokeBoundedCli inherits recovery
│   └── architecture.test.ts     # EDIT — allowlist app-launcher.ts as 2nd spawn site + "no obsidian-CLI spawn" assertion
└── logger.ts                    # EDIT — DispatchRecoveryEvent + dispatchRecovery() on Logger/createLogger
```

**Structure Decision**: Single project, additive. The launcher is a new sibling module under `src/` (like `binary-resolver`), keeping the cross-platform launch concern isolated and one-directionally imported by the dispatch layer. All recovery control-flow stays in `_dispatch.ts` so both facades inherit it (FR-010) and `createServer` is untouched.

## Phase 1 re-check (post-design Constitution Check)

Re-evaluated after the data-model/contracts were written: no new top-level code (IV holds), no new tool boundary (III N/A holds), modular boundaries intact (I holds), tests enumerated for every changed surface (II holds), headers planned (V holds), ADR-015 gate satisfied. **No gate regressed; no violations.**

## Graphify structural check

Per the CLAUDE.md `/speckit-plan` rule — affected communities (graph) + kernel-node touch surface (direct lookup). Scope includes `src/**` and `*.test.ts`, so the full rule applies.

**Affected communities** (from `graphify-out/graph.json`, queried at plan-time):
- The **runtime-spine / dispatch** community that holds `isColdStart` (the ADR-029 predicate node). The new `isAppNotRunning` predicate and `APP_NOT_RUNNING_PATTERN` are its structural siblings and land in/adjacent to it.
- A **new `app-launcher` community** (new module) — expected to form its own small cluster, structurally connected via the single `_dispatch → app-launcher` import edge (not orphaned; production file, so connectivity is required, not noise-floor).
- The **error-spine** community (where `UpstreamError`, the high-centrality star, and `binary-resolver`/`resolveBinary` sit) is referenced but not restructured — only a new `details.reason` value flows through it.

**Kernel-node touch surface** (the four god-nodes — `createLogger`, `createQueue`, `UpstreamError`, `createServer`):
- **`createLogger` — TOUCHED**: new `dispatchRecovery` event on the `Logger` interface + `createLogger` impl + every logger test-mock. Highest-attention change (Logger is injected into every handler).
- **`UpstreamError` — USED, not modified**: new `details.reason` value on the existing `CLI_NON_ZERO_EXIT`; no new error-class node (the post-implement check "no new error-class node outside `src/errors.ts`" stays satisfied).
- **`createQueue` — NOT touched**: existing serialization supplies single-flight (FR-006).
- **`createServer` — NOT touched**: the `launchFn` seam defaults at the dispatch layer; the opt-out env flows through existing `deps.env`. (Verifies the explicit no-touch claim the post-implement step checks against.)

**Guardrail / invariant impact**: extends the ADR-029 D8 `architecture.test.ts` invariant (i) to a second sanctioned spawn site (`app-launcher.ts`) with a narrower "must not spawn the obsidian CLI" assertion. Invariant (ii) (`dispatchCli` imported only by the two facades) is preserved — the launcher is invoked by `_dispatch`, not by any tool. No production handler will import the launcher or the boot-time DI factories.

**Post-implement structural verification** (to run after `/speckit-implement`, before BI complete): (1) no new top-level error code — confirm `ErrorCode` union unchanged; (2) no production handler imports `createLogger`/`createQueue` directly (launcher must not either); (3) `app-launcher` lands in its own community, `isAppNotRunning` near `isColdStart`; (4) `app-launcher.ts` is structurally connected (one import edge from `_dispatch`), not orphaned.

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
