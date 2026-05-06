# Phase 0 Research — 008-refactor

**Status**: complete
**Date**: 2026-05-07

Twelve research items resolve the implicit "NEEDS CLARIFICATION" points the spec deferred to plan stage. Each item follows Decision / Rationale / Alternatives. None escalates to a `/speckit-clarify` re-entry — all are within the scope of "implementation tactics" that the spec's `## Assumptions` block explicitly defers.

---

## R1 — `dispatchCli` module location

**Decision**: New file at `src/cli-adapter/_dispatch.ts`. Exports `dispatchCli` (private — re-exported only from sibling files) and `killInFlightChildren` (public — re-exported from `cli-adapter.ts` for `server.ts` to import).

**Rationale**: Per [ADR-007](../../.decisions/ADR-007%20-%20Centralized%20CLI%20Bounds%20with%20Selective%20Override.md), the dispatch primitive lives in the cli-adapter layer; both facades sit on top. The leading underscore in `_dispatch.ts` signals "internal to the cli-adapter module" by repo convention (mirrors `src/tools/_shared.ts` and the planned `src/tools/_register.ts`). Co-located test file `_dispatch.test.ts` per Constitution Principle II.

**Alternatives**:
- `src/dispatch/` (new top-level dir): rejected — adds a directory with one file. The cli-adapter directory is the natural home; dispatchCli IS the centralized adapter, with two facade types.
- Inline inside `cli-adapter.ts`: rejected — the file would carry both the private primitive AND the typed-tool facade, blurring the distinction the ADR-007 architecture relies on. A separate `_dispatch.ts` keeps the seam visible.

---

## R2 — `obsidianExecSchema.timeoutMs.max(120000)` vs Q1 silent-clamp

**Decision**: Keep the `obsidianExecSchema.timeoutMs.max(120000)` zod constraint exactly as today. Implement the silent-clamp behavior INSIDE `invokeBoundedCli` as defense-in-depth — `effectiveTimeoutMs = Math.min(overrides.timeoutMs ?? OBSIDIAN_EXEC_DEFAULT_TIMEOUT_MS, OBSIDIAN_EXEC_MAX_TIMEOUT_MS)`. Today's MCP-facing path (where the zod schema validates first) cannot reach the clamp, but internal callers and future schema relaxations do.

**Rationale**: FR-019 binds the MCP wire surface (`name`, `description`, `inputSchema` shape) to byte-equivalence against 0.1.7. zod's `.max(120000)` renders as `"maximum": 120000` in the published JSON Schema; removing it would change the wire surface. The Q1 clarification ("silently clamp to 120 s, no `VALIDATION_ERROR`, no warning") is preserved at the dispatch-side bounds layer where it CAN be reached by future internal callers — so the contract is real and testable, just unreachable from MCP today.

**Alternatives**:
- **(a) Remove the zod `.max(120000)` constraint, expose clamping**: rejected — wire-surface change in violation of FR-019. Clients would see `"maximum"` disappear from the published `timeoutMs` field's JSON Schema.
- **(b) Reject `timeoutMs > 120000` at invokeBoundedCli with VALIDATION_ERROR**: rejected — directly contradicts Clarifications Q1's "no VALIDATION_ERROR is raised" answer.
- **(c) Defer clamping entirely; rely solely on the zod constraint**: rejected — fails FR-011 ("Timeout overrides MUST be subject to a hard ceiling of 120 s; ... silently clamped"); leaves a defense-in-depth hole when an internal caller bypasses the schema.

---

## R3 — Fate of existing `call.start` / `call.end*` logger events

**Decision**: REMOVE `call.start`, `call.end` (success), and `call.end` (failure) logger events from the call path. Today these are emitted from [src/tools/obsidian_exec/handler.ts:70](../../src/tools/obsidian_exec/handler.ts#L70) and following lines. The dispatch primitive emits ONLY the three failure-lifecycle events per FR-018a + SC-011 (one stderr line each for `dispatch.timeout`, `dispatch.cap`, `dispatch.kill`); ZERO log lines on the success path or the four non-lifecycle failure verdicts.

The Logger interface drops `callStart`, `callEndSuccess`, `callEndFailure`. New methods: `dispatchTimeout`, `dispatchCap`, `dispatchKill` (or one polymorphic `dispatchEvent({ kind, ... })`). The `shutdown` method is preserved (server.ts uses it).

This is a deliberate **operator-observable signal change**. Before: every `obsidian_exec` call emits 2 stderr JSON lines (`call.start` + `call.end`). After: every `obsidian_exec` call emits 0 stderr lines unless one of the three failure-lifecycle events fires. The change must be called out in CHANGELOG.md (per FR-021's release-notes mandate, by extension).

**Rationale**: SC-011 requires "**zero** log lines on the success path or other classification verdicts" emitted by the dispatch primitive. The existing call-lifecycle logging from `obsidian_exec/handler.ts` is structurally part of the dispatch path (it lives in the file the dispatch primitive is replacing); preserving it would leak above the new seam and contradict SC-011. Operators who relied on per-call observability lose that signal in exchange for the new failure-lifecycle visibility — a deliberate trade. Future work could re-introduce richer per-call signal at a higher layer (registerTool's wrapper) under a follow-up feature; out of scope here.

**Alternatives**:
- **(a) Move `call.start` / `call.end*` to registerTool's wrapper**: would preserve per-call observability for every tool uniformly (an arguable improvement — read_note today has none). Rejected for now because (i) it spreads the dispatch-side signal change across a larger surface, (ii) SC-011's "zero log lines on success path" is most naturally satisfied by removing the events entirely, (iii) any future reintroduction belongs to a separate observability-focused feature where format and content can be designed deliberately.
- **(b) Keep `call.start` / `call.end*` for `obsidian_exec` only, omit for `read_note`**: rejected — preserves the asymmetry (read_note has no call observability) while introducing a per-tool special-case in the registration pipeline. Centralization is the point of this feature; selective preservation undermines it.
- **(c) Treat SC-011 as "the dispatch primitive emits zero" but allow above-layer success-path lines**: rejected — same outcome as (a) with a more permissive reading. The cleaner interpretation is "remove and reintroduce later if needed."

---

## R4 — Target-mode locator stripping placement

**Decision**: `invokeCli` (the typed-tool facade) applies the existing `target_mode === "active"` locator strip BEFORE handing off to `dispatchCli`. `invokeBoundedCli` does NOT strip (preserves `obsidian_exec`'s "caller manages its own params" semantics). `dispatchCli` itself sees fully-resolved parameters; it has no awareness of `target_mode`.

**Rationale**: Today's [src/cli-adapter/cli-adapter.ts:33](../../src/cli-adapter/cli-adapter.ts#L33) strips `vault`, `file`, `path` when `target_mode === "active"`. That logic is `read_note`-shaped and `obsidian_exec` has no `target_mode` concept. Pushing it into the typed-tool facade keeps `dispatchCli`'s surface narrow (it just spawns and classifies), and preserves `obsidian_exec`'s full-control argv assembly.

**Alternatives**:
- **Push stripping into dispatchCli**: rejected — would couple the dispatch primitive to a typed-tool concept. `obsidian_exec` would then either need to opt out (more flags) or accept the strip (behavior change).
- **Keep stripping in read_note's handler, not at the facade**: rejected — the strip exists today AT the cli-adapter layer; relocating it upward is a bigger churn for no win.

---

## R5 — `--copy` suffix routing

**Decision**: `dispatchCli`'s input bag carries an optional `copy: boolean` field. If true, `--copy` is appended to argv per the documented order. `invokeBoundedCli`'s input flows the obsidian_exec schema's `copy` field through unchanged. `invokeCli`'s typed-tool input also accepts `copy` (read_note doesn't use it today, but the field is available so a future typed tool can opt in without facade changes).

**Rationale**: The argv ordering FR-012 specifies `[binary, vault=..., command, kvs..., flags..., --copy]` — `--copy` is at the tail. It is conditional on caller intent; making it part of `DispatchInput` rather than baked into a facade keeps the assembly logic in one place (dispatchCli) and uniform.

**Alternatives**:
- **`--copy` in `flags[]` array passed by the caller**: rejected — would require the obsidian_exec schema to accept `--copy` as a regex-allowed flag, but its current `flags` regex `^(?!--).*` explicitly forbids `--`-prefixed flags. The `copy: boolean` field exists today specifically for this reason.
- **Hardcoded `--copy` in `invokeCli` for read_note**: rejected — read_note doesn't use `--copy`; this would be dead code with no clear seam.

---

## R6 — Queue-wrapping of both facades

**Decision**: BOTH `invokeCli` AND `invokeBoundedCli` route their dispatch-call through `queue.run(...)` (the FIFO single-flight queue at [src/queue.ts](../../src/queue.ts)). This means typed-tool calls now serialize with `obsidian_exec` calls — a behavior change for `read_note`, which today (via cli-adapter.ts) is not queue-wrapped.

**Rationale**: ADR-007 explicitly assumes "the FIFO single-flight queue all CLI dispatches route through" as the load-bearing invariant for the single-cell registry. A typed-tool call that bypasses the queue could overlap with an `obsidian_exec` call in flight, violating the at-most-one-child invariant the registry depends on. This is a correctness requirement, not just a fairness preference.

The behavior change is operator-observable (a `read_note` call may now wait briefly for an in-flight `obsidian_exec` call to complete). It must be called out in CHANGELOG.md.

**Alternatives**:
- **Queue-wrap only invokeBoundedCli** (status quo for read_note): rejected — leaves the registry single-cell invariant unsound. The cell would race with overlapping read_note + obsidian_exec calls.
- **Replace single-cell registry with a Set immediately**: rejected — over-engineering for today's load. ADR-007 explicitly chose plural-named function over Set-from-day-one.

---

## R7 — In-flight registry data shape and export point

**Decision**: Single mutable cell at module-level inside `_dispatch.ts`:

```ts
let inFlightChild: ChildProcess | null = null;
```

`killInFlightChildren()` is a closed-over function exported from `_dispatch.ts`, re-exported from `cli-adapter/cli-adapter.ts`. `server.ts` imports it via `cli-adapter`:

```ts
// src/server.ts
import { killInFlightChildren } from "./cli-adapter/cli-adapter.js";
```

The cell is set synchronously after `spawn()` returns (per FR-015a) and cleared on `child.exit` / `child.error` (asynchronous removal is permitted per FR-015a's last sentence).

**Rationale**: Mirrors today's `obsidian_exec/handler.ts` pattern (module-level cell + closed-over kill function), just relocated to the new home and renamed. Plural function name `killInFlightChildren` anticipates a future Set upgrade if the queue's single-flight invariant changes; the data shape stays minimal today.

**Alternatives**:
- **Class-based registry**: rejected — class instance would need a single canonical home (DI or module-level singleton); module-level mutable cell achieves the same with less ceremony.
- **Set-from-day-one**: rejected per ADR-007 ("over-engineered relative to the queue's actual contract").

---

## R8 — Agent context update target

**Decision**: Update the `<!-- SPECKIT START -->` / `<!-- SPECKIT END -->` block in [CLAUDE.md](../../CLAUDE.md) to point to `specs/008-refactor/plan.md`, with a 7-bullet summary of this plan's scope.

**Rationale**: The plan template's Phase 1 step 3 specifies updating "the plan reference between the `<!-- SPECKIT START -->` and `<!-- SPECKIT END -->` markers". The current block (post-feature 007) carries a detailed multi-paragraph description; preserving that style for 008 keeps the block useful as a one-glance feature summary for future Claude sessions.

**Alternatives**: None considered — this is a mechanical step.

---

## R9 — Version bump direction (FR-020)

**Decision**: `0.1.7 → 0.2.0` (MINOR bump per pre-1.0 SemVer).

**Rationale**: Multiple operator-observable behavior changes ship in this release:
1. Typed-tool calls now bounded at 10 s / 10 MiB (today: unbounded).
2. Typed-tool calls now serialize through the FIFO queue (today: parallel with obsidian_exec).
3. `obsidian_exec` no longer emits `call.start` / `call.end*` per-call stderr lines (today: 2 lines per call).
4. `obsidian_exec` reachable error roster expands to include `ERR_NO_ACTIVE_FILE` (today: surfaced as `CLI_REPORTED_ERROR`).
5. `registerTool` factory is the only path from zod schema to MCP descriptor (today: per-tool publication).

Pre-1.0 SemVer is loose, but the project's prior cadence treats bug fixes as patch (007: 0.1.6 → 0.1.7 was a wire-surface bug fix) and behavioral refinements as minor. The four operator-observable changes above clearly meet the bar for minor. PATCH (0.1.7 → 0.1.8) would understate the size of the change.

**Alternatives**:
- **PATCH (0.1.7 → 0.1.8)**: rejected — operator-observable behavior changes deserve a minor bump under pre-1.0 conventions.
- **MAJOR (1.0.0)**: rejected — the project hasn't yet declared 1.0 stability; jumping to 1.0 is a separate decision about API maturity, not a release-discipline default for this feature.

---

## R10 — `targetModeJsonSchema` companion fate

**Decision**: REMOVE `targetModeJsonSchema` from [src/target-mode/target-mode.ts:108](../../src/target-mode/target-mode.ts#L108). Remove the corresponding test from `target-mode.test.ts`. Update `src/tools/read_note/schema.ts` to re-export only the zod schema (drop the `targetModeJsonSchema` import and `readNoteInputJsonSchema` re-export).

**Rationale**: The companion was added in feature 007 as a band-aid because `read_note/schema.ts` was the only consumer. With `registerTool` always applying `toMcpInputSchema` to every tool's zod schema, the companion is structurally redundant — every consumer that previously needed it now gets the equivalent for free via the publication pipeline. Removing dead code aligns with the constitution's anti-drift discipline.

The spec's `## Assumptions` explicitly authorizes this cleanup ("Whether to remove it or retain it as a re-export is a plan-stage cleanup decision, not a spec-level contract").

**Alternatives**:
- **Retain as a re-export for theoretical external consumers**: rejected — this is an internal package; no external consumers documented. Keeping unused exports has a maintenance cost (each future zod refactor must consider the companion).
- **Replace with a deprecation comment + retain for one release cycle**: rejected — pre-1.0 doesn't mandate deprecation cycles, and the test suite's typecheck will catch any stray import. Clean cut is simpler.

---

## R11 — `docs/tools/obsidian_exec.md` ERR_NO_ACTIVE_FILE addition placement

**Decision**: Add `ERR_NO_ACTIVE_FILE` to the existing error-codes section in [docs/tools/obsidian_exec.md](../../docs/tools/obsidian_exec.md) with its standard description (matching the wording in `docs/tools/read_note.md`'s entry for the same code). Append a one-line note that this code is reachable when stdout begins with `Error: no active file` literal — the same trigger condition as for `read_note`.

**Rationale**: FR-021 mandates the docs update. The standard description is the appropriate content; a one-line trigger note helps clients pattern-match correctly.

**Alternatives**:
- **Add only the code identifier without a description**: rejected — would confuse readers. The error roster's other codes carry full descriptions.
- **Cross-reference read_note.md instead of duplicating**: rejected — each tool's doc should be self-contained (operators reading one shouldn't need to load the other).

---

## R12 — CHANGELOG.md introduction

**Decision**: CREATE `CHANGELOG.md` at the repo root, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. Initial section is `## [0.2.0] - 2026-05-07` with subsections **Added**, **Changed**, **Removed**. Below the 0.2.0 section, optionally a `## [0.1.7] - 2026-05-06` retrospective entry summarizing feature 007's fix (the 0.1.6 → 0.1.7 bug-fix bump).

The 0.2.0 section enumerates:
- **Added**: `registerTool` factory, `dispatchCli` primitive, `invokeBoundedCli` facade, `assertToolDocsExist` aggregator, atomic registry insertion guarantee, failure-only stderr logging discipline, `ERR_NO_ACTIVE_FILE` newly reachable through `obsidian_exec`.
- **Changed**: typed-tool calls now bounded (10 s / 10 MiB) and queue-serialized; argv order unified to documented `[binary, vault=..., command, kvs..., flags..., --copy]`; `killActiveChild` renamed to `killInFlightChildren` (internal — no public API change for MCP clients).
- **Removed**: per-call `call.start` / `call.end*` stderr logger events from `obsidian_exec` (replaced by failure-lifecycle events at the dispatch primitive); the `targetModeJsonSchema` companion at `target-mode.ts` (subsumed by `registerTool`'s envelope application); the per-tool `tool.ts` boilerplate (collapsed into `index.ts`).

**Rationale**: FR-021 mandates a CHANGELOG / release-notes callout for the `ERR_NO_ACTIVE_FILE` reachable-set expansion. The repo has no CHANGELOG.md today, so this feature introduces one. Establishing the file now means future release-discipline (per the Spec Kit workflow) has a canonical landing page for changes — a small operational improvement aligned with the project's spec-driven discipline.

**Alternatives**:
- **Use git-tag release notes only (no CHANGELOG.md)**: rejected — git tags require a search to find; a CHANGELOG.md is the standard place for clients to look. FR-021's "release CHANGELOG / release notes" wording explicitly contemplates either, and the file is cheap to add.
- **README.md "Recent Changes" section**: rejected — pollutes the README with versioned content; CHANGELOG.md is the canonical home.
- **Skip the retrospective 0.1.7 entry**: acceptable if the retrospective scope expands too much; the 0.2.0 section is the binding deliverable. Plan-stage decision deferred to the implementer's judgment based on time available.
