---
description: "Task list for Retry Cold Start (ADR-029)"
---

# Tasks: Retry Cold Start

**Input**: Design documents from `/specs/059-retry-cold-start/`
**Prerequisites**: plan.md, spec.md (required); research.md, data-model.md, contracts/dispatch-retry.contract.md, quickstart.md (all present)

**Tests**: INCLUDED and test-first. Constitution Principle II mandates co-located happy-path + failure/boundary tests in the same change; the plan and quickstart specify the exact cases. Within each story, write the test, confirm it fails, then implement.

**Organization**: Tasks are grouped by user story. Note that the three stories are facets of one shared mechanism (the single retry inside `dispatchCli`), so they slice by **guarantee**, not by disjoint code: US1 lands the core wrapper, US2 verifies/hardens its no-masking failure path, US3 adds the cross-cutting bounds, observability, and the no-bypass guardrail.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files / independent, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 — story-phase tasks only
- All paths are repository-relative.

## Path Conventions

Single project. All production changes are confined to `src/cli-adapter/`. The retry locus is `src/cli-adapter/_dispatch.ts`; tests are co-located `*.test.ts`.

---

## Phase 1: Setup & Test Infrastructure

**Purpose**: Confirm the baseline and build the one piece of test infrastructure the retry tests require.

- [ ] T001 Confirm green baseline on branch `059-retry-cold-start`: `npm run lint` (zero warnings), `npm run typecheck`, `npm run build`, `npx vitest run` (2595+ pass), and statements coverage ≥ 96 per `vitest.config.ts`. Record the starting coverage number.
- [ ] T002 [P] Add a per-call-varying spawn stub `makeScriptedSpawn(specs: StubChildSpec[])` (returns `{ spawnFn, calls }`, serving `specs[callCount++]`) plus an `emitError?: Error` field on `StubChildSpec` (a full raw `Error`, distinct from the existing `emitErrno`) to `src/cli-adapter/_dispatch.test.ts`. The existing static `makeStubSpawn` cannot vary call 1 vs call 2; the retry tests need this. Expose `calls()` for exact spawn-count assertions.

---

## Phase 2: T0 Live-CLI Probes (GATE — requires a user-prepared closed vault) 🔬

**Purpose**: Validate the load-bearing empirical assumptions before/at the start of implementation, per the project's T0 convention. **Read `.memory/test-execution-instructions.md` first.** These pin `COLD_START_INVARIANT` and **decide whether form (b) ships** (T007). Invoke the `obsidian` binary directly (not through `dist/index.js`) to observe raw stdout/stderr/exit.

**⚠️ Coordination**: requires the user to set `TestVault-Obsidian-CLI-MCP` **registered-but-closed** (Obsidian running, that vault not focused). For T007, seed a unique-per-run fixture under `Sandbox/` and capture pre-state first.

- [ ] T003 Read `.memory/test-execution-instructions.md`; coordinate with the user to put `TestVault-Obsidian-CLI-MCP` in the registered-but-closed state.
- [ ] T004 Probe **P0-1 / P0-7** (OQ-001, OQ-007): issue a read, a list, a search, a write/mutating command, and a tab/open eval as the first command against the closed vault. Capture verbatim `exitCode` + stdout for each. Confirm form (a) `exitCode: 0` + the invariant substring `not found. It may require a plugin to be enabled.` is identical across kinds; note any divergence (especially whether the tab/open eval cold-starts as form (a) vs a `VAULT_NOT_FOCUSED` envelope per FR-013). **Pin the exact `COLD_START_INVARIANT` literal.**
- [ ] T005 Probe **P0-2** (OQ-002, research D4): elicit/observe a `Stream closed` first attempt. Record how it surfaces through `dispatchCli` — raw rejected `Error` (PATH 2), `CLI_NON_ZERO_EXIT` (PATH 3), or the dangerous `exitCode: 0` stdout that resolves as success (PATH 4) — plus exit code, which stream carries the literal, the verbatim substring, and frequency (reliable vs intermittent).
- [ ] T006 Probe **P0-3** (OQ-003): immediately re-issue after a cold first attempt; confirm an immediate retry succeeds or measure that it races the launch. Quantify typical launch ms. Default stays immediate; justify a single small fixed bounded delay only if it races.
- [ ] T007 Probe **P0-4 — THE FORM-(b) GATE** (OQ-005): force a `Stream closed` against a mutating command (`rename`/`move`/`delete`) targeting the closed vault under `Sandbox/`; inspect vault state for partial application (did the mutation land? did an append double?). **Decide: enable form (b) blanket only if `Stream closed` is proven to always fire pre-execution; otherwise DROP form (b) entirely.** Clean up fixtures + any `.trash/` residue per the destructive-probe protocol.
- [ ] T008 Probe **P0-5** (OQ-004): issue a genuinely unknown command (a typo, or TUI-only `vault:open`) against the closed vault; confirm it still fails after exactly one retry with the original error preserved.
- [ ] T009 Probe **P0-6** (OQ-006): confirm both a typed-tool path and the `obsidian_exec` passthrough exhibit the cold-start failure and both recover.
- [ ] T010 Record all probe results verbatim in a `specs/059-retry-cold-start/contracts/t0-probe-findings.md` evidence file; note the pinned invariant, the form-(b) ship/drop decision, and the delay decision. These feed ADR-029 (T033) and the architecture doc (T034).

**Checkpoint**: `COLD_START_INVARIANT` pinned; form-(b) scope decided; `STREAM_CLOSED_SURFACE` characterized (or form (b) dropped). Implementation can now proceed with confidence.

---

## Phase 3: Foundational (Blocking Prerequisite — behavior-preserving refactor)

**Purpose**: Restructure `dispatchCli` so a retry can wrap a single attempt, WITHOUT changing observable behaviour. No user-story work begins until this is green.

**⚠️ CRITICAL**: must complete before US1/US2/US3.

- [ ] T011 In `src/cli-adapter/_dispatch.ts`, extract the spawn-and-classify `Promise<DispatchOutput>` body into an inner `async function dispatchOnce(input, deps): Promise<DispatchOutput>`; move `callId` and `startedAt` **inside** `dispatchOnce` so each attempt has its own id/clock (research D7). `dispatchCli` calls `dispatchOnce` exactly once for now (no retry yet — pure refactor). Update the `// Original — no upstream.` header's one-line description to mention the forthcoming single-retry policy (ADR-029).
- [ ] T012 Run `npx vitest run src/cli-adapter` and confirm ALL existing dispatch + facade tests stay green (the refactor is behavior-preserving). This is the regression gate for the extraction.

**Checkpoint**: `dispatchOnce` exists; the retry seam is in place; behaviour unchanged.

---

## Phase 4: User Story 1 — Valid command against a closed vault succeeds (Priority: P1) 🎯 MVP

**Goal**: Form (a) cold-start on the first attempt is absorbed by one retry; the caller sees the command's real success.

**Independent Test**: a scripted spawn returning the form-(a) cold-start signature on call 1 and success on call 2 → `dispatchCli` resolves with the call-2 output; `calls() === 2`. Inherited through `invokeCli`.

### Tests for User Story 1 (write first, confirm fail) ⚠️

- [ ] T013 [P] [US1] In `src/cli-adapter/_dispatch.test.ts`, add `describe("dispatchCli — ADR-029 cold-start single retry")` with the case: `specs = [{stdout: COLD_START_STDOUT, exitCode: 0}, {stdout: "ok\n", exitCode: 0}]` → resolves `{stdout: "ok\n", exitCode: 0}`, `calls() === 2`. Use `COLD_START_STDOUT` built from the pinned `COLD_START_INVARIANT` (T015); pass `resolveBinary: stubResolveBinary` for host-independence.
- [ ] T014 [P] [US1] In `src/cli-adapter/cli-adapter.test.ts`, add a facade inheritance test mirroring the existing R5/T002 pattern: cold-start on call 1 → success on call 2 → `invokeCli` resolves; spawn called exactly twice (single `queue.run` slot).

### Implementation for User Story 1

- [ ] T015 [US1] In `src/cli-adapter/_dispatch.ts`, add the exported production constant `COLD_START_INVARIANT` (the T004-pinned literal) and the `isColdStart(value: unknown): boolean` predicate — form (a) only for now: `value instanceof UpstreamError && value.code === "CLI_REPORTED_ERROR" && typeof value.details?.stdout === "string" && value.details.stdout.includes(COLD_START_INVARIANT)`. Type-guard before any property read. Import `COLD_START_INVARIANT` into the test as the single source of truth.
- [ ] T016 [US1] In `src/cli-adapter/_dispatch.ts`, wrap `dispatchCli`: run `dispatchOnce`; if it rejects and `isColdStart(error)`, run `dispatchOnce` exactly once more and return that second outcome verbatim (resolve or throw); otherwise return/throw the first outcome unchanged. Make T013/T014 pass.

**Checkpoint**: the MVP — a form-(a) cold-start recovers transparently through the primitive and the typed-tool facade.

---

## Phase 5: User Story 2 — Genuine failures still surface unchanged (Priority: P2)

**Goal**: The retry never masks a real error: the second attempt is authoritative, genuine unknowns propagate, non-cold-start failures are never retried.

**Independent Test**: drive a genuine-unknown command (cold-start on both attempts) → propagates after exactly one retry; a non-cold-start failure → no retry (`calls() === 1`); a different-error-on-retry → attempt-2 error surfaces.

### Tests for User Story 2 (write first, confirm fail) ⚠️

- [ ] T017 [P] [US2] `_dispatch.test.ts`: cold-start → DIFFERENT real error (Q1): `specs = [{stdout: COLD_START_STDOUT, exitCode: 0}, {stderr: "boom", exitCode: 1}]` → rejects `CLI_NON_ZERO_EXIT` (attempt 2), assert `details` parity proves attempt-1 was discarded; `calls() === 2`.
- [ ] T018 [P] [US2] `_dispatch.test.ts`: cold-start → cold-start (no loop): `specs = [cold, cold]` → rejects `CLI_REPORTED_ERROR` with `details.stdout` containing the invariant; `calls() === 2` EXACTLY (bounded, not a loop).
- [ ] T019 [P] [US2] `_dispatch.test.ts`: non-cold-start first failure → NO retry: `specs = [{stderr: "boom", exitCode: 1}]` → rejects `CLI_NON_ZERO_EXIT`; `calls() === 1`. Add parallel cases for `CLI_TIMEOUT`-shaped and `ERR_NO_ACTIVE_FILE`-shaped first failures asserting `calls() === 1`.
- [ ] T020 [P] [US2] `_dispatch.test.ts`: zero-new-codes — assert the propagated `UpstreamError.code` is within the known union (`CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`, `CLI_NON_ZERO_EXIT`, `ERR_NO_ACTIVE_FILE`, `CLI_REPORTED_ERROR`) and the retry mints none.
- [ ] T021 [P] [US2] `src/cli-adapter/cli-adapter.test.ts`: NEGATIVE — the existing exit-0 `Vault not found.` facade re-classification does NOT trigger the dispatch retry (`Vault not found.` is not the cold-start invariant); spawn called exactly once. Guards against over-matching the adjacent R5 precedent.

### Implementation for User Story 2

- [ ] T022 [US2] Verify the T016 wrapper already satisfies T017–T021 (the no-masking failure path is intrinsic: it only retries on `isColdStart`, and propagates the second attempt's error otherwise). Tighten `isColdStart`'s negatives only if any case fails — e.g. ensure it never matches `CLI_TIMEOUT` / `CLI_OUTPUT_TOO_LARGE` / `CLI_NON_ZERO_EXIT` / `ERR_NO_ACTIVE_FILE` / a non-invariant `Error:` stdout. No new error code introduced.

**Checkpoint**: US1 + US2 — the retry recovers cold-start AND provably cannot hide a real error.

---

## Phase 6: User Story 3 — One consistent behaviour for every command (Priority: P3)

**Goal**: The behaviour is uniform across both facades, bounded to one attempt, terminates when the vault never comes up, observable, shutdown-safe, and **build-enforced against bypass**.

**Independent Test**: the retry fires identically through `invokeBoundedCli`; `calls()` never exceeds 2; a shutdown in the retry gap orphans no child; the guardrail test fails the build if a new spawn site or `dispatchCli` caller is introduced.

### Tests for User Story 3 (write first, confirm fail) ⚠️

- [ ] T023 [P] [US3] `src/cli-adapter/invoke-bounded-cli.test.ts`: facade inheritance — cold-start on call 1 → success on call 2 → `invokeBoundedCli` resolves; spawn called exactly twice.
- [ ] T024 [P] [US3] `_dispatch.test.ts`: bounded/terminate — assert `calls()` is at most 2 across all trigger cases, and that "vault never available" (both attempts return the cold-start signature) terminates by propagating after exactly one retry (no hang/loop).
- [ ] T025 [P] [US3] `_dispatch.test.ts`: observability — on a retry, a `dispatch.retry` log line is emitted carrying both attempt `callId`s (assert via the captured logger).
- [ ] T026 [P] [US3] `_dispatch.test.ts`: shutdown race — simulate shutdown beginning in the gap between attempt-1 settle and attempt-2 spawn (set the `shuttingDown` flag) → the retry is skipped, attempt-1 error propagates, NO second spawn (`calls() === 1`), no orphaned child (research D6).
- [ ] T027 [P] [US3] Create `src/cli-adapter/architecture.test.ts` (NEW; `// Original — no upstream.` header) implementing FR-012: source-scan `src/**` and FAIL if (i) a `node:child_process` VALUE import of `spawn`/`spawnSync`/`exec`/`execFile` appears in any production file other than `src/cli-adapter/_dispatch.ts` (type-only imports excluded), or (ii) `dispatchCli` is imported by any production file other than `cli-adapter.ts` and `invoke-bounded-cli.ts`. Confirm it passes on the current tree and fails when a violating import is introduced (temporary local check).

### Implementation for User Story 3

- [ ] T028 [US3] In `src/cli-adapter/_dispatch.ts` (and `src/logger.ts` if a new channel is needed), emit a `dispatch.retry` log line via the injected `logger` when the retry fires, carrying both attempt `callId`s (research D7). Confirm `src/logger.ts` has or gains a `dispatchRetry(...)` structured method consistent with `dispatchTimeout`/`dispatchCap`/`dispatchKill`.
- [ ] T029 [US3] In `src/cli-adapter/_dispatch.ts`, add a module-level `shuttingDown` flag set by the existing shutdown path (wire from `killInFlightChildren` / `server.ts` `triggerShutdown`), and check it before issuing the retry: if shutdown began, skip the retry and propagate the first attempt's error (research D6). Confine the change to `_dispatch.ts` unless the probe/wiring shows a `server.ts` hook is required; if so, keep it minimal.

**Checkpoint**: all three stories functional; the no-bypass guarantee is build-enforced.

---

## Phase 7: Form (b) — `Stream closed` (CONDITIONAL on the T007 / P0-4 gate)

**Purpose**: Extend the trigger to the transport-level variant — **only if** T007 proved `Stream closed` always fires pre-execution. If T007 showed it can fire post-mutation (or was inconclusive), this phase is **dropped** and recorded as such (default-safe posture: ship form (a) only).

- [ ] T030 IF the T007 gate cleared form (b): extend `isColdStart` in `src/cli-adapter/_dispatch.ts` to also recognize the pinned `STREAM_CLOSED_SURFACE` (type-guarding a raw `Error` vs `UpstreamError`); if the T005 probe showed the dangerous PATH-4 exit-0 resolve manifestation is real, also consult `isColdStart` on the resolved `DispatchOutput.stdout` before returning success (research D4). IF the gate did NOT clear: write a one-line note in `t0-probe-findings.md` and the spec that form (b) is dropped; make NO code change.
- [ ] T031 [P] IF form (b) enabled: `_dispatch.test.ts` — `Stream closed` (form b) on call 1 → success on retry (`calls() === 2`); `Stream closed` twice → propagate after one retry (`calls() === 2`); using the `emitError`/PATH-specific stub from T002 and the pinned `STREAM_CLOSED_SURFACE` constant.

**Checkpoint**: trigger scope finalized per empirical evidence.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T032 [P] Finalize the `src/cli-adapter/_dispatch.ts` header description to accurately state the shipped single-retry policy and trigger scope (form (a) always; form (b) per the gate) — Principle V.
- [ ] T033 [P] Update `.decisions/ADR-029 - Retry Once on Cold-Start Vault-Launch Failure.md`: flip Proposed → Decided; record the pinned invariant, the form-(b) ship/drop decision, the delay decision, and the date_decided. (Gitignored mirror; note the vault-side sync per project convention.)
- [ ] T034 [P] Update `.architecture/Obsidian CLI MCP - Architecture.md` error-mapping / dispatch pipeline to record the retry step (amended on ship, per ADR-029's documentation discipline).
- [ ] T035 Run the full merge gate: `npm run lint`, `npm run typecheck`, `npm run build`, `npx vitest run`; confirm statements coverage ≥ 96 (the T001 baseline). Add focused tests if the retry code dropped coverage below the gate.
- [ ] T036 Post-implement graphify structural verification: run `/graphify --update`, then confirm (1) no new top-level error-code node outside `src/errors.ts`; (2) no production handler imports the boot-time DI factories (`createLogger`/`createQueue` stay in `server.ts`); (3) `dispatchOnce`/`isColdStart` land in the CLI-dispatch community (not a surprise community) and are not orphaned; (4) `architecture.test.ts` is weakly connected (expected for a test node). Record results in the plan's post-implement note.

---

## Dependencies & Execution Order

### Phase order

- **Phase 1 (Setup)**: no dependencies.
- **Phase 2 (T0 probes)**: depends on Setup; **gates** the `COLD_START_INVARIANT` literal (T015) and the form-(b) phase (Phase 7). Requires the user-prepared closed vault.
- **Phase 3 (Foundational)**: depends on Setup; can run alongside Phase 2 (it is a pure refactor independent of probe results), but must be green before any story implementation.
- **Phase 4 → 5 → 6 (US1 → US2 → US3)**: each depends on Foundational. They are **not** fully independent — US2's no-masking is the same wrapper's failure path (T016), and US3 adds cross-cutting guards on top. Recommended order is priority order P1 → P2 → P3.
- **Phase 7 (Form b)**: depends on the Phase 2 T007 gate AND the US1 wrapper (T016).
- **Phase 8 (Polish)**: depends on all desired stories complete and the probes recorded.

### Story dependencies (honest note)

These stories slice by **guarantee**, not by disjoint modules — all three modify the single `dispatchCli` wrapper. US1 is the MVP and lands the wrapper; US2 is largely verification (T017–T021) plus a negative-match tightening (T022) of the same wrapper; US3 adds genuinely new cross-cutting code (retry log T028, shutdown guard T029, guardrail test T027). This is expected for a centralized dispatch-layer feature and does not violate independent *testability* — each story's acceptance criteria are independently assertable.

### Within each story

Tests first (confirm fail) → implementation → checkpoint green.

### Parallel opportunities

- T002 (test infra) is [P] with the Phase 2 probe prep.
- Probe tasks T004–T009 are sequential against one live vault (one vault state at a time), not parallel.
- Within a story, the test tasks marked [P] touch different test files or independent `describe` blocks and can be written together (T013/T014; T017–T021; T023–T027).
- Polish tasks T032–T034 are [P] (different files).

## Parallel Example: User Story 2 tests

```text
# Write these together (independent assertions in _dispatch.test.ts + cli-adapter.test.ts):
T017 cold-start → different error (attempt-2 authoritative)
T018 cold-start → cold-start (bounded, no loop)
T019 non-cold-start → no retry
T020 zero-new-codes
T021 Vault-not-found does NOT retry (cli-adapter.test.ts)
```

## Implementation Strategy

### MVP (User Story 1 only)

Phase 1 → Phase 2 (at least T004 to pin the invariant; T007 may defer if form (a) is the MVP) → Phase 3 → Phase 4. Stop and validate: a form-(a) cold-start recovers through `dispatchCli` and `invokeCli`. This alone delivers the core value (no more spurious "command not found" on the first call).

### Incremental delivery

US1 (recovery) → US2 (no-masking verification) → US3 (uniformity + no-bypass guardrail) → Form (b) iff the gate clears → Polish. Each increment keeps the suite green and coverage ≥ 96.

## Notes

- **Graph rule (`/speckit-tasks`) — N/A**: the cross-two-or-more-source-modules trigger does not fire. All production changes land in a single source file, `src/cli-adapter/_dispatch.ts` (plus `src/logger.ts` only if a `dispatchRetry` channel is added, and a new test-only `architecture.test.ts`). The two facades (`cli-adapter.ts`, `invoke-bounded-cli.ts`) are touched only by inheritance *tests*, not modified. No `/graphify path A B` pair-tracing is warranted; the structural verification is deferred to the post-implement `/graphify --update` (T036).
- Tests are co-located `*.test.ts` (Principle II). `[P]` = different files / independent. Verify each test fails before implementing.
- The retry adds **no new top-level `UpstreamError.code`** (Constitution IV; asserted by T020).
- Form (b) is **probe-gated, all-or-nothing** — never gated per-command (no per-tool idempotency flag).
- Commit after each logical group; the `/speckit-git-commit` flow groups by scope.
