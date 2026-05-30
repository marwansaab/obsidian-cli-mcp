# Tasks: Recover Closed Obsidian

**Input**: Design documents from `/specs/060-recover-closed-obsidian/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: INCLUDED. Constitution Principle II (NON-NEGOTIABLE) requires a happy-path + a failure/boundary test co-located as `*.test.ts` for every changed public surface. Scope is **vitest unit tests only** — manual/real-CLI validation lives in [quickstart.md](quickstart.md) and the user's external tracker; do **not** scaffold `test-cases/` or TC-XXX files here.

**Organization**: grouped by user story (US1 P1 → US2 P2 → US3 P3) after a shared Setup + Foundational base, so each story is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no dependency on an incomplete task → parallelizable.
- **[Story]**: US1/US2/US3 (story phases only).

## Path Conventions

Single project, MCP server at repo root: `src/**`, co-located `*.test.ts`.

---

## Phase 1: Setup (Shared Scaffolding)

**Purpose**: create the new module shell + dispatch constants/seam that later phases fill in.

- [X] T001 [P] Create `src/app-launcher/app-launcher.ts` with the `// Original — no upstream.` header (Principle V), the `LaunchInput`/`LaunchDeps` types (data-model §3), and a `launchObsidian(input, deps?)` signature stub (no logic yet).
- [X] T002 [P] In `src/cli-adapter/_dispatch.ts` add the pinned recovery constants `APP_NOT_RUNNING_PATTERN = /unable to find Obsidian/i`, `OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS = 30_000`, `LAUNCH_POLL_INTERVAL_MS = 750` (data-model §6) and add the optional `launchFn?` seam to the `DispatchDeps` interface (data-model §4).

**Checkpoint**: module shell + constants/seam exist; nothing wired yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the detection + shared infrastructure every user story depends on (US1 launch decision, US2 error shape, US3 must-not-fire guarantee). **No story phase may start until this completes.**

- [X] T003 [P] Extend the logger in `src/logger.ts`: add `DispatchRecoveryEvent` (data-model §5) and a `dispatchRecovery(event)` method on the `Logger` interface and `createLogger` (emit a `dispatch.recovery` JSON-line). Do NOT add any new entry to the `ErrorCode` union (Principle IV — zero new top-level codes). **Add a `dispatch.recovery` emit test to `src/logger.test.ts`** asserting the JSON-line shape for each `outcome` (`recovered`/`unrecoverable`/`disabled`), at parity with the existing event-emit tests (analyze C2).
- [X] T004 [P] Update every Logger test-mock/stub across `src/**/*.test.ts` to implement the new `dispatchRecovery` method so the suite keeps compiling (grep for objects implementing `Logger`).
- [X] T005 Implement app-not-running classification in `dispatchOnce` priority (a) of `src/cli-adapter/_dispatch.ts`: when `code !== 0` and `APP_NOT_RUNNING_PATTERN.test(stderr)`, attach `details.reason: "obsidian-not-running"` to the `CLI_NON_ZERO_EXIT` (research D1, contract §1). Same-file as T006/T007 → sequential.
- [X] T006 Implement and export the `isAppNotRunning(value)` predicate in `src/cli-adapter/_dispatch.ts` (sibling of `isColdStart`: `UpstreamError` + `code === "CLI_NON_ZERO_EXIT"` + `details.reason === "obsidian-not-running"`) (contract §1).
- [X] T007 Implement the `autoLaunchEnabled(env)` helper in `src/cli-adapter/_dispatch.ts` (default ON; OFF when `env.OBSIDIAN_AUTO_LAUNCH` trimmed-lowercased ∈ `{0,false,no,off}`) (research D5).
- [X] T008 [P] Detection unit tests in `src/cli-adapter/_dispatch.test.ts`: classification attaches `reason` on the app-down stderr signature; `isAppNotRunning` truth matrix (app-down ✓ vs cold-start ✗ vs generic non-zero-exit ✗ vs CLI_TIMEOUT ✗); `autoLaunchEnabled` parsing of on/off values (depends on T005–T007).

**Checkpoint**: detection foundation ready — every story can now build on it.

---

## Phase 3: User Story 1 - Operations complete when Obsidian is closed (Priority: P1) 🎯 MVP

**Goal**: a valid op against a fully closed app launches Obsidian and completes from a single call.

**Independent Test**: with the app down, an op (via either facade) triggers exactly one launch and returns its normal result; `dispatch.recovery` logs `outcome:"recovered"`. (quickstart Scenario A.)

- [X] T009 [US1] Implement `launchObsidian` in `src/app-launcher/app-launcher.ts`: build `obsidian://open?vault=<encodeURIComponent(vault)>` (vault-less fallback when no vault), select the opener by `deps.platform ?? process.platform` (win32 → `cmd /c start "" "<uri>"`; darwin → `open`; linux/other → `xdg-open`), spawn detached / stdio ignore / unref; resolve on spawn, reject on opener `ENOENT`. This is the **second sanctioned spawn site** (research D2, contract §2). MUST land together with T010.
- [X] T010 [US1] Extend the guardrail in `src/cli-adapter/architecture.test.ts`: add `app-launcher.ts` to the invariant-(i) spawn allowlist, AND add an assertion that `app-launcher.ts` does **not** import `resolveBinary` nor spawn the `obsidian` CLI (preserves the ADR-029 D8 no-bypass intent — research D6). MUST land with T009 or CI breaks.
- [X] T011 [P] [US1] `launchObsidian` unit tests in `src/app-launcher/app-launcher.test.ts`: per-platform opener + argv (win32/darwin/linux via injected `platform` + `spawnFn`), vault URL-encoding (spaces/unicode), vault-less fallback, opener-`ENOENT` rejection.
- [X] T012 [US1] Implement the recovery orchestration in `dispatchCli` (`src/cli-adapter/_dispatch.ts`): refactor the existing ADR-029 cold-start retry into an inner `dispatchWithColdStartRetry`; on its `isAppNotRunning` throw + `autoLaunchEnabled(env)` + not `shuttingDown`, call `launchFn` once, then re-attempt in a bounded poll (interval `LAUNCH_POLL_INTERVAL_MS`, deadline `OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS`); the first non-app-down outcome is authoritative (success resolves; cold-start handled by the inner retry; real error throws). Emit `dispatchRecovery` `outcome:"recovered"` with `readyMs`/`attempts` (contract §3, research D3). Same-file as T005–T007 → sequential.
- [X] T013 [US1] Recovery-loop unit tests in `src/cli-adapter/_dispatch.test.ts` (fake timers, injected `launchFn`/`spawnFn`): app-down → exactly one launch → success on re-attempt resolves; bounded poll stops at deadline; cold-start on a re-attempt is absorbed by the inner retry; a real error on a re-attempt is authoritative; mutation-safety (launch once, original re-run once on success — no double-apply); **single-flight (FR-006/SC-004)** — two app-down operations issued through the queue trigger `launchFn` exactly once total (assert the queue serialization guarantee: the second op finds the app already up), with a comment that single-flight is structurally provided by `createQueue` not new code (analyze C1).
- [X] T014 [P] [US1] Facade-inheritance tests: `src/cli-adapter/cli-adapter.test.ts` (`invokeCli`) and `src/cli-adapter/invoke-bounded-cli.test.ts` (`invokeBoundedCli`) both inherit recovery (app-down → launch → success) via an injected `launchFn` (FR-010).

**Checkpoint**: closed-app recovery works end-to-end through both facades (MVP).

---

## Phase 4: User Story 2 - Actionable signal when recovery is impossible (Priority: P2)

**Goal**: when recovery can't succeed (bound elapsed) or is disabled (opt-out), surface a distinct, documented, programmatically-distinguishable error.

**Independent Test**: with launch impossible (opt-out, or no opener), an op returns `CLI_NON_ZERO_EXIT` + `details.reason:"obsidian-not-running"` + an actionable message — distinct from success/cold-start/generic non-zero exit. (quickstart Scenarios B & D.)

- [X] T015 [US2] Implement the give-up + opt-out branches in `dispatchCli` (`src/cli-adapter/_dispatch.ts`): on bound exhaustion, throw the enriched `CLI_NON_ZERO_EXIT` (`reason:"obsidian-not-running"`, "could not be auto-launched within {N}s — start Obsidian…" message) and emit `dispatchRecovery` `outcome:"unrecoverable"`; when `!autoLaunchEnabled`, skip the launch entirely and throw the enriched error (disabled message naming `OBSIDIAN_AUTO_LAUNCH`) with `outcome:"disabled"`, `launched:false` (research D4/D5, contract §4/§5). Same-file as T012 → sequential.
- [X] T016 [US2] Error-path unit tests in `src/cli-adapter/_dispatch.test.ts`: bound-exhaustion → `CLI_NON_ZERO_EXIT` + `reason` + could-not-launch message + no further attempts; opt-out set → zero launches, disabled message, `outcome:"disabled"`; the error is programmatically distinguishable from a generic `CLI_NON_ZERO_EXIT` (no `reason`), from success, and from a cold-start (SC-003, SC-006). **FR-008 coverage**: a live-application-dependent command issued while closed-and-unlaunchable surfaces the **same** `reason:"obsidian-not-running"` distinct error (confirms FR-008 is the launch-impossible branch of FR-007, not a separate code — analyze D1).

**Checkpoint**: US1 + US2 both work — recovery, and a clean actionable failure when it can't.

---

## Phase 5: User Story 3 - Normal case unchanged (Priority: P3)

**Goal**: prove the already-running success path is byte-for-byte untouched and recovery is strictly reactive.

**Independent Test**: with the app running, ops behave/time exactly as today; `launchFn` is never called and no `dispatch.recovery` line is emitted. (quickstart Scenario C.)

- [X] T017 [US3] No-overhead / no-false-fire unit tests in `src/cli-adapter/_dispatch.test.ts` (+ facade assertions): an already-running success returns from the first inner attempt with the recovery branch never entered (`launchFn` call-count 0, no `dispatch.recovery` emit); non-app-down failures — `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`, cold-start, generic `CLI_REPORTED_ERROR`, `CLI_BINARY_NOT_FOUND` — are NOT routed into recovery (FR-009); spawn/launch call-count proves zero added overhead on the success path (SC-002, SC-005).

**Checkpoint**: all three stories independently verified.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T018 [P] Run the merge gates: `npm run lint` (zero warnings), `npm run typecheck`, `npm run build`, and coverage via the Windows-safe command (`mkdir -p coverage/.tmp` then `npx vitest run --coverage --pool=forks --no-file-parallelism`); confirm the statements threshold still passes.
- [X] T019 [P] Document the new behaviour + `OBSIDIAN_AUTO_LAUNCH` env var in `README.md` (and any tool-docs that mention "Obsidian not running") so the opt-out is discoverable (FR-013); keep the "Attributions" section accurate (no new upstream).
- [ ] T020 Manual real-CLI validation: run quickstart.md Scenarios A–E on Windows against the authorised `TestVault-Obsidian-CLI-MCP` (per `.memory/test-execution-instructions.md`); record outcomes. (Not a unit test; no TC scaffolding.) **User-owned** — left unchecked: this step actually launches/closes the Obsidian GUI app, a disruptive side effect on the host, so it is for the user to run, not the assistant.
- [X] T021 Post-implement structural verification (confirmed by direct source checks 2026-05-30): (1) the `ErrorCode` union in `src/logger.ts` is unchanged — 9 codes, no new top-level code (Principle IV); (2) `app-launcher` is imported only by `_dispatch.ts` (single `_dispatch → app-launcher` edge) — no production handler imports the launcher, and `app-launcher` imports neither boot-time DI factory; (3) `app-launcher` is its own module, structurally connected (not orphaned); (4) `isAppNotRunning` sits beside `isColdStart` as a sibling export in `_dispatch.ts`. The semantic `/graphify --update` (token-costing prose extraction) was intentionally **not** run: this BI authored no new prose/semantic nodes (ADR-030 is flagged for the user, not authored here), so the AST-only graph refresh on the post-commit hook covers the structural facts above.

---

## Dependencies & Execution Order

### Phase order
- **Setup (P1: T001–T002)** → no deps.
- **Foundational (P2: T003–T008)** → after Setup; **blocks all stories**.
- **US1 (P3: T009–T014)** → after Foundational. T009+T010 land together; T012 needs T005–T007 (detection) + T009 (launcher) + T003 (logger event).
- **US2 (P4: T015–T016)** → after T012 (extends the same `dispatchCli` recovery code; same file → sequential).
- **US3 (P5: T017)** → after T012 (and ideally T015) — tests the full reactive behaviour. Independent of US2's error wording.
- **Polish (P6: T018–T021)** → after all desired stories.

### Same-file sequential chains (cannot be [P] together)
- `src/cli-adapter/_dispatch.ts`: T002 → T005 → T006 → T007 → T012 → T015.
- `src/cli-adapter/_dispatch.test.ts`: T008 → T013 → T016 → T017.

### Parallel opportunities
- T001 ∥ T002 (different files).
- T003 ∥ T004 (logger vs test-mocks).
- T009 ∥ T011 (impl vs its co-located test, write together) and T010 (different file) alongside.
- T014 runs against two facade test files, parallel to T013 (different files).
- T018 ∥ T019 (gates vs docs).

## Parallel Example: Foundational

```
# After Setup, run in parallel (different files):
Task T003: extend Logger with dispatchRecovery in src/logger.ts
Task T004: update Logger test-mocks across src/**/*.test.ts
# then the _dispatch.ts detection chain runs sequentially: T005 → T006 → T007 → T008
```

## Implementation Strategy

- **MVP = Setup + Foundational + US1 (T001–T014)**: a closed app auto-recovers through both facades. Stop and validate (quickstart Scenario A) before US2/US3.
- **Incremental**: add US2 (actionable failure) → add US3 (no-overhead proof) → Polish. Each phase is independently testable and additive.

## Notes

- **Test scope is vitest unit-only** (project memory): every changed surface gets co-located `*.test.ts`; manual scenarios stay in quickstart.md / the user's tracker — no `test-cases/` or TC-XXX scaffolding here.
- **Cross-module structural check** (CLAUDE.md `/speckit-tasks` rule): the list crosses `app-launcher` (new), `cli-adapter/_dispatch`, and `logger`. Graph check at plan-time confirms the **`_dispatch ↔ logger` edge already exists** (T003 only extends it — no new dependency) and **`app-launcher` has no existing nodes**, so the **only new structural edge is `_dispatch → app-launcher`** (T012 → T009), already reflected in the task order. No hidden transitive dependency the task graph misses.
- **T009 + T010 must land in the same change** — adding the launcher's spawn without extending the guardrail allowlist fails `architecture.test.ts`, and vice-versa.
- **Kernel-node touch**: T003 touches `createLogger` (additive). T005/T015 use `UpstreamError` (new `details.reason` value, no new class). `createQueue`/`createServer` untouched.
- **Follow-up flagged for the user (not a code task)**: author **ADR-030** capturing the `obsidian://`-URI launch, the second sanctioned spawn site, the `obsidian-not-running` sub-discriminator, and the `OBSIDIAN_AUTO_LAUNCH` opt-out (extends ADR-029). ADR authoring is a deliberate vault-side act.
- **Cross-platform**: T009 is OS-agnostic by construction; T011 verifies all three openers via injected `platform`. Real macOS/Linux validation (quickstart macOS/Linux scenarios) is the user's to run — Windows is plan-time verified.
- **/speckit-analyze remediation (2026-05-30)**: C1 (FR-006/SC-004 single-flight) folded into T013; C2 (logger `dispatch.recovery` emit test) folded into T003; D1 (FR-008 subsumed by FR-007) folded into T016. **F1** — FR-012's negative scope constraints ("don't repair a broken install; don't re-handle the registered-but-closed-vault-in-a-running-app 059 case") need no dedicated task: they are enforced structurally by T010 (the guardrail forbids a 2nd CLI spawn path) and T012 (the inner `dispatchWithColdStartRetry` is the 059 boundary, not re-implemented here), and there is no code path that attempts an install repair. A1 (SC-002 "no measurable latency") is operationalized by T017's zero-launch / first-attempt-return call-count assertions.
- Commit after each task or logical group.
