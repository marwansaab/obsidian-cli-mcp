# Feature Specification: Recover Closed Obsidian

**Feature Branch**: `060-recover-closed-obsidian`  
**Created**: 2026-05-30  
**Status**: Draft  
**Input**: User description: "Recover Closed Obsidian — when the Obsidian application is not running, the connector recovers automatically so the caller's vault operation still completes, instead of failing and requiring a person to start Obsidian by hand."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operations complete when Obsidian is closed (Priority: P1)

An operator runs vault automation while the Obsidian application happens to be entirely closed (no Obsidian process running at all). The operator issues a valid vault operation. Instead of failing and waiting for a human to start Obsidian, the connector recognises that the application is down, brings the environment to a ready state on its own, and the original operation completes and returns its normal result — all from the single call the operator made.

**Why this priority**: This is the whole reason the feature exists and the minimum viable slice. Today, with Obsidian closed, every vault operation fails identically and the caller is fully blocked until a person starts the application by hand — which makes unattended and scheduled use impossible and stalls a session at its very first step. Recovering automatically so the operation still completes is the core value; the other stories refine the failure signal and protect the normal case around it.

**Independent Test**: With no Obsidian process running, issue a single known-valid vault operation. Verify the caller receives the operation's normal successful result on that one call, with no manual start of Obsidian and no caller-side retry, and that the application-not-running condition is never surfaced to the caller as the final outcome.

**Acceptance Scenarios**:

1. **Given** the Obsidian application is not running, **When** the caller issues a valid vault operation, **Then** the connector brings the environment to a ready state and the original operation completes successfully and returns its normal result as the caller's single final outcome.
2. **Given** the Obsidian application is not running, **When** recovery is in progress, **Then** the caller is not required to take any manual action for the operation to proceed (no human starts Obsidian, no caller-issued retry).
3. **Given** the application has just been brought up and the target vault is itself still cold, **When** the operation runs, **Then** the post-launch vault warm-up window is absorbed by the existing cold-start retry behaviour (ADR-029 / BI 059-retry-cold-start) and the operation still returns its normal result.

---

### User Story 2 - Actionable signal when recovery is impossible (Priority: P2)

An agent issues a vault call while Obsidian is closed, but the connector cannot bring the application to a ready state (for example the launch never reaches readiness within the bound, or the application cannot be started at all). Rather than receiving a raw underlying message it has to parse, the agent receives a distinct, documented error that states the cause and the action a person needs to take, so it can handle the situation deliberately.

**Why this priority**: Automatic recovery is only trustworthy if its failure is legible. When recovery cannot succeed, a raw or generic error leaves the agent unable to distinguish "Obsidian could not be brought up" from any other failure, and it cannot tell a human what to do. A distinct, documented signal — separate from a normal success, from the in-application cold-start case, and from genuinely unrelated failures — is what makes the P1 recovery safe to rely on. It is P2 because the recovery path (US1) is demonstrable on its own, but in practice the two ship together: the error is the defined behaviour for the branch where recovery does not succeed.

**Independent Test**: Put the environment in a state where the application cannot be brought to readiness (application unavailable, or readiness not reached within the bound). Issue a vault operation. Verify the caller receives a single distinct, documented error that names the cause and the required human action, that this error is programmatically distinguishable from a success and from other failure classes, and that it is not a verbatim pass-through of the raw underlying message.

**Acceptance Scenarios**:

1. **Given** the application is not running and the connector cannot bring it to a ready state, **When** the caller issues an operation, **Then** the caller receives a distinct, documented error that states the cause and the action needed, rather than a raw underlying message.
2. **Given** an operation depends on live-application features that cannot be served while Obsidian is closed and the application cannot be brought up, **When** the caller issues that operation, **Then** the caller receives a clear error identifying that limitation rather than a misleading generic failure.
3. **Given** recovery cannot succeed, **When** the distinct error is returned, **Then** it is programmatically distinguishable from a normal success, from the in-application cold-start retry case, and from genuinely unrelated failures (so a caller can branch on it deliberately).

---

### User Story 3 - Normal case unchanged (Priority: P3)

A user already has Obsidian open and ready. They issue a vault operation. The recovery machinery does nothing observable: behaviour and timing are exactly as they are today, with no recovery step taken and no added delay.

**Why this priority**: The recovery path must never tax the common case. The overwhelming majority of operations run against an already-running application; if recovery added a liveness check or any latency to those, it would slow every normal call to protect a rare one. Guaranteeing the normal case is untouched — reacting only to the application-not-running condition, never probing pre-emptively — is what makes the feature acceptable to ship. It is P3 because it constrains rather than adds capability, but it is a hard constraint on US1's implementation.

**Independent Test**: With Obsidian already running and ready, issue a range of vault operations and compare behaviour and timing against the current baseline. Verify there is no measurable added latency, no extra attempt, and no behavioural change versus today, and that no recovery (no application launch) is triggered.

**Acceptance Scenarios**:

1. **Given** Obsidian is already running and ready, **When** the caller issues an operation, **Then** behaviour and timing are unchanged from today and no recovery step is taken.
2. **Given** Obsidian is already running and ready, **When** the caller issues an operation that succeeds, **Then** zero additional attempts and zero added delay are incurred on the success path (recovery is reactive to the application-down condition, not a pre-flight probe).

---

### Edge Cases

- **Application is launching but not yet ready within a single round-trip**: the recovery brings the application up, but readiness (the point at which the operation can complete) is not reached immediately. The connector waits a bounded amount of time for readiness and then either completes the operation or — if the bound elapses — terminates and returns the distinct documented error (US2). It never hangs or loops indefinitely.
- **Application comes up but the target vault is itself still cold**: launching the application is not the same as the target vault being ready. Once the application is up, the residual vault cold-launch window is the already-handled case (ADR-029 / BI 059): the existing single retry absorbs it. This feature composes with that retry — it sits in front of it — and does not re-implement or duplicate it.
- **Application cannot be started at all (missing, broken, or not installed)**: recovery cannot succeed. Repairing or installing Obsidian is out of scope; the required behaviour is the distinct documented error of US2 (cause + action), not a generic failure and not an attempt to fix the installation.
- **Several operations arrive while the application is launching**: concurrent callers that hit the application-down condition during a single launch share that one launch and one readiness wait; the connector does not start a separate application instance per waiting operation (no launch storm).
- **A genuinely unrelated failure occurs after recovery**: after the application is brought to readiness, the operation may still fail for its own reasons (a missing target file, a validation error, a timeout). Those failures surface as themselves — the recovery path neither retries them as if they were application-down nor masks them.
- **The application-down condition must be told apart from the in-application cold-start condition**: the signal that the application is not running is distinct from the signal that a registered vault inside a running application is merely warming up (ADR-029's `Command "<cmd>" not found.`). Recovery (launch the application) fires for the former; the existing single retry handles the latter. The two are not conflated.
- **A non-application-down failure on the first attempt**: any first-attempt failure that is not the application-down condition keeps its current single-shot behaviour and is never subjected to an application launch.

## Requirements *(mandatory)*

### Functional Requirements

#### Detection

- **FR-001**: The system MUST recognise the condition in which the Obsidian application is not running, distinguishing it from a normal success, from the in-application cold-start condition that ADR-029 already handles (a registered-but-closed vault warming up inside a running application), and from every genuinely unrelated failure. Detection MUST be reactive — driven by the observable application-not-running signal produced by the caller's operation — and MUST NOT add a pre-flight liveness probe to operations, so the normal (already-running) case incurs no added work.
- **FR-002**: The system MUST treat detection as command-agnostic: the same application-not-running condition governs recovery regardless of which vault operation surfaced it, with no per-operation signature table and no per-operation opt-in.

#### Recovery

- **FR-003**: On recognising that the application is not running, the system MUST bring the environment to a ready state on the caller's behalf — without requiring any manual human action — and then complete the original operation, returning its normal result as the caller's single final outcome.
- **FR-004**: The system MUST keep recovery bounded. It MUST trigger at most one application-launch recovery per operation (no recovery loop, no escalating retries of the launch), and it MUST wait for readiness only for a bounded period before terminating. When the application never becomes ready, the operation MUST terminate and surface the distinct documented error rather than hanging or retrying indefinitely.
- **FR-005**: The system MUST compose with — not duplicate or replace — the existing ADR-029 single cold-start retry. Once the application has been brought up, any residual target-vault warm-up MUST be left to the existing retry; this feature MUST NOT re-implement that retry and MUST NOT conflict with it.
- **FR-006**: When several operations encounter the application-not-running condition while a single launch is in progress, the system MUST NOT start more than one application instance to satisfy them; the concurrent operations MUST share the in-progress launch and its readiness wait (single-flight recovery).

#### Failure signalling

- **FR-007**: When the system cannot bring the application to a ready state, it MUST return a distinct, documented error that states the cause (the application could not be brought to a ready state) and the action a person needs to take (start Obsidian), rather than passing through the raw underlying message. The error MUST be programmatically distinguishable from a normal success, from the ADR-029 in-application cold-start case, and from genuinely unrelated failures.
- **FR-008**: When an operation depends on live-application features that cannot be served while Obsidian is closed and the application cannot be brought up, the system MUST return a clear error that identifies that limitation, rather than a misleading generic failure. (This feature does not redefine which operations are inherently dependent on the live application versus answerable from vault data on disk; it only requires that, where such an operation cannot be served, the limitation is stated clearly.)
- **FR-009**: The recovery path MUST NOT mask or rewrite a genuine failure. Any first-attempt failure that is not the application-not-running condition MUST keep its current single-shot behaviour and surface unchanged, and after a successful recovery, a failure of the original operation for its own reasons MUST surface as that failure — not as an application-down error and not as a swallowed/defaulted result (Constitution Principle IV).

#### Scope of application and normal-case protection

- **FR-010**: The system MUST apply recovery uniformly across the command-dispatch layer, so every operation — those issued through a purpose-built tool and those issued through the general command passthrough — inherits the identical behaviour with no per-operation re-implementation.
- **FR-011**: When the application is already running and ready, the system MUST take no recovery step and MUST leave behaviour and timing unchanged from today, incurring zero additional attempts and zero added delay on the success path.
- **FR-012**: The system MUST NOT alter the upstream Obsidian CLI's own requirement that the application be running, MUST NOT attempt to repair, reinstall, or otherwise recover a missing/broken/uninstalled Obsidian (beyond surfacing the FR-007 distinct error), and MUST NOT re-handle the already-handled registered-but-closed-vault-inside-a-running-application case.

### Key Entities *(include if feature involves data)*

- **Application liveness state**: the condition of the Obsidian application as observed by the connector — not running, launching, or ready. Recovery transitions it from not-running toward ready; the operation completes only once it is ready.
- **Application-not-running signal**: the observable indication, surfaced by a caller's operation, that the application is not running — distinct from the in-application cold-start signal and from unrelated failures. It is the sole trigger for recovery.
- **Recovery outcome**: the result of a recovery attempt — either recovered (the application reached readiness and the original operation completed and returned its normal result) or unrecoverable (the distinct documented error of FR-007/FR-008).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the Obsidian application not running, a valid vault operation completes successfully and returns its normal result from the single call the caller made, with no manual start of Obsidian and no caller-issued retry — in 100% of cases where the application can be brought to readiness within the bound.
- **SC-002**: When the application is already running and ready, operations incur no measurable added latency and no behavioural change versus the current baseline, and trigger zero application launches (the normal case is untouched).
- **SC-003**: When the application cannot be brought to a ready state, the caller receives a distinct, documented error naming the cause and the required human action in 100% of such cases — never a raw underlying message — and that error is programmatically distinguishable from a success and from every other failure class.
- **SC-004**: Recovery is bounded: an unrecoverable case terminates within a fixed time bound (no indefinite hang or loop), and at most one application launch is triggered per operation regardless of how many callers concurrently hit the application-down condition.
- **SC-005**: The recovery path never masks a genuine failure: failures that are not the application-not-running condition surface unchanged on the first attempt (zero false recoveries), and a post-recovery failure of the original operation surfaces as itself.

## Assumptions

- **Reactive detection, not pre-flight probing**: the application-not-running condition is recognised from the observable signal produced by the caller's own operation (mirroring ADR-029's reactive cold-start pattern), so the already-running success path is unchanged. The exact signal literal/shape is fixed at plan-phase against a live-CLI probe (see "Deferred to plan-phase").
- **Composition with ADR-029**: this feature sits in front of the existing single cold-start retry. Bringing the application up is its job; absorbing the residual target-vault warm-up after the application is up is left to ADR-029 / BI 059. The two are sequential, not overlapping.
- **Auto-recovery is on by default and unconditional in v1**: there is no configuration toggle to enable/disable auto-launch in this version; environments that must never spawn the application are not a v1 concern. A configuration gate is a possible later enhancement, explicitly out of scope here.
- **"Ready" is defined operationally**: readiness means the original operation can complete against the target vault; it is observed by the operation succeeding (in concert with the ADR-029 retry for the post-launch vault window), not by a separate health endpoint or liveness API.
- **Single-flight recovery**: concurrent operations that hit the application-down condition during one launch share that launch and its readiness wait rather than each starting an instance.
- **Launched application is not torn down**: an application instance brought up by recovery (or left running after a recovery) is not killed afterward — a running Obsidian benefits subsequent calls and may be the user's own session; the connector does not terminate it.
- **Launch is OS-level application start**: recovery starts the application the way the platform starts it; a GUI window may appear. Headless operation, window hiding/minimising, and any change to how the application presents are out of scope (no headless Obsidian exists).
- **Today's baseline ("fails identically")**: with the application closed, the connector currently surfaces a generic CLI failure (the dispatch layer classifies the application-down condition as a generic non-zero-exit / binary-not-found class — "Obsidian not running / spawn failure") and blocks the caller. This is the status quo the feature replaces on the recovery path; the distinct FR-007 error replaces it on the unrecoverable path.
- **Grounding note on ADR-029's context**: ADR-029's Context states "if Obsidian is not running, the first command you run launches Obsidian." A live-CLI probe (2026-05-30, against the production-resolved `Obsidian.com` shim) shows this holds for a registered-but-closed *vault* inside a *running* application, but not for a fully *closed application* — with no Obsidian process running, the shim returns an explicit "unable to find Obsidian / make sure Obsidian is running" failure and does not launch the application. That gap is precisely the condition this feature recovers from; it is recorded here as the empirical basis for the boundary, and any reconciliation of ADR-029's wording is a separate decision, not part of this spec.

### Deferred to plan-phase (resolved against a live-CLI probe, per the project's ADR-029 / BI 059 precedent)

These are timing/signature parameters, not scope questions; the spec fixes the behaviour, the plan-phase probe fixes the numbers and literals:

- The exact observable application-not-running signal literal/shape, and how it is told apart from the ADR-029 cold-start signal and from unrelated CLI failures.
- The definition-in-practice of "ready" and the bounded wait/poll for readiness after launch (the fixed upper bound and any poll cadence), including whether an immediate post-launch attempt suffices or a small bounded wait is needed.
- Whether the distinct FR-007 error is expressed as a sub-discriminator on an existing top-level error code (per ADR-015, preserving the zero-new-top-level-codes streak under Constitution Principle IV) or otherwise — the spec requires only that it be distinct, documented, and programmatically distinguishable.

### Dependencies

- **ADR-029 / BI 059-retry-cold-start**: depended upon for the post-launch target-vault warm-up window. This feature requires that retry to remain in place and composes with it.
- **Constitution Principle IV** (explicit upstream error propagation; no silent fallbacks) governs the FR-007/FR-008/FR-009 error behaviour, and **ADR-015** (sub-discriminators via `details.reason`) is the likely vehicle for the distinct error without a new top-level code.

## Out of Scope

- Changing the upstream Obsidian CLI's own requirement that the application be running (third-party, not modifiable here).
- The already-handled case of a registered-but-closed vault inside an already-running application (ADR-029 / BI 059).
- Redefining which operations are inherently dependent on the live application versus answerable from vault data on disk.
- Recovering from an Obsidian installation that is missing, broken, or not installed at all (only a clear FR-007/FR-008 error is required there).
- A configuration toggle to enable/disable auto-recovery, headless operation, or hiding/minimising the launched application window.
- Tearing down or managing the lifecycle of an application instance after it has been launched.
