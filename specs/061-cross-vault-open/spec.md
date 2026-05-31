# Feature Specification: Open Cross-Vault Files

**Feature Branch**: `061-cross-vault-open`
**Created**: 2026-06-01
**Status**: Draft
**Input**: User description: "Open Cross-Vault Files — the file-open capability can surface a file in any vault that is currently open, and in a vault that is currently closed, switching focus to that vault regardless of which vault is focused when the request is made, for any file type. The response also reports how the file was placed: in a newly created tab, an existing tab that was reused, or the active tab."

## Clarifications

### Session 2026-06-01

- Q: Should `open_file` switch focus to the requested vault unconditionally, or only when a caller opts in? → A: **Unconditional** — replace the in-eval focused-vault guard (the `VAULT_NOT_FOCUSED` comparison in `open_file/_template.ts`) with a focus-switch; no opt-in flag. The guard is an eval-implementation artifact, not a hard Obsidian constraint, so removing it is the feature's core intent. **Error-taxonomy correction (ADR-015 closed-enum is additive-only)**: `details.reason: "not-open"` is NOT repurposed or renamed — repurposing an existing reason is forbidden without a constitution-level rename event. The former `"not-open"` case (registered-but-not-focused) simply becomes a **success path** (open-but-unfocused → switch focus; closed vault → recovered by the inherited ADR-029 cold-start retry + ADR-030 app-launch). `VAULT_NOT_FOUND / reason: "unknown"` (unregistered name or typo) remains the **sole hard vault error**. A genuinely unrecoverable launch reuses the existing `CLI_NON_ZERO_EXIT` + `details.reason: "obsidian-not-running"` (ADR-030) — no new top-level code and no new reason minted (a new reason only if a distinct "registered-but-launch-failed" state exists that ADR-030's does not already cover).
- Q: For a cross-vault open, which file-locator shapes should be accepted? → A: **Both, parity** — keep BI-057's exactly-one-of `path`/`file` locator set unchanged; **no schema change** (the static discriminated union per ADR-003; Constitution Principle III requires the Zod schema be the single source of truth, so locator acceptance MUST NOT depend on runtime focus state). **Safety correction**: the earlier "mid-switch mis-resolution is absorbed by the cold-start retry" rationale is wrong — ADR-029's retry fires only on `COLD_START_PATTERN` and explicitly excludes `…not found.`, so a bare name resolving against the pre-switch (wrong) vault would surface as `FILE_NOT_FOUND` or, worse, a silent open of a same-named file in the wrong vault. Safety MUST come from resolving the locator **inside the target-vault context**: bare-name resolution (`getFirstLinkpathDest`) MUST be scoped to the requested vault as part of the vault-targeted open, never against the pre-switch focused vault. If the native vault-targeted open resolves linktext atomically in the requested vault the risk does not arise (confirm at plan/T0); any separate eval-side resolution MUST target the requested vault explicitly, and a miss MUST surface as `FILE_NOT_FOUND`, never a silent wrong-vault open.
- Q: Does US2's "closed vault" include the case where the Obsidian application itself is not running? → A: **Yes — app-fully-down is in scope, and the recovery is inherited at the dispatch chokepoint, not bespoke per-tool wiring.** ADR-030 (shipped 0.8.4) has `dispatchCli` detect app-not-running (`CLI_NON_ZERO_EXIT`, exit 1, empty stdout, stderr `/unable to find Obsidian/i`) and launch via the vault-targeted `obsidian://open?vault=` opener; any tool routing through `dispatchCli` inherits it tool-agnostically. The feature MUST NOT re-implement a launcher in `open_file`. It MUST honor the `OBSIDIAN_AUTO_LAUNCH` opt-out (on-by-default, ADR-030); when launch is suppressed (opt-out) or fails, surface ADR-030's existing `CLI_NON_ZERO_EXIT` + `details.reason: "obsidian-not-running"` (no new code — Principle IV / ADR-015).

## User Scenarios & Testing *(mandatory)*

<!--
  These stories extend the existing `open_file` capability (BI-057). The base tool already
  surfaces a file in the *currently focused* vault, supports a new-tab opt-in, and returns
  typed not-found / unsupported-type errors. This feature removes the "must be the focused
  vault" precondition (it switches focus to the requested vault, open or closed) and adds a
  placement-outcome field to the response. See Assumptions for the deliberate supersession of
  BI-057's no-vault-switching contract.
-->

### User Story 1 - Open a file in an open-but-unfocused vault (Priority: P1)

An automation author wants to surface a file in a vault that is currently open in Obsidian but is not the vault that currently holds focus. Today the caller must first ask a human to click over to that vault; with this story the caller names the vault and the file, and the tool switches Obsidian's focus to that vault and opens the file there — no human pre-switch needed. The response names the vault the file was opened in so the caller can confirm the hand-off landed in the intended vault.

**Why this priority**: This is the single biggest limitation the feature removes and the minimum viable slice. The whole reason unattended file-opening stalls today is that an open only lands in the already-focused vault, so every cross-vault open depends on a person switching first (BI-057 FR-010/FR-011 deliberately forbade switching). Making an open-but-unfocused vault openable — by switching focus to it as part of the open — delivers the core value on its own, before the closed-vault and placement-reporting refinements layer on. It is the cleanest independent slice because it needs only a focus switch, not a vault bring-up or transient-failure recovery.

**Independent Test**: With two vaults open in Obsidian and vault B *not* focused (vault A is focused), issue an open against an existing file in vault B by its vault-relative path. Verify (a) Obsidian's focus switches to vault B and the file becomes the focused, visible file there, (b) the response names vault B as the vault the file was opened in, and (c) the request did not depend on anyone manually switching to vault B first.

**Acceptance Scenarios**:

1. **Given** a vault that is open but not the focused vault, **When** the caller requests to open a file in it by path, **Then** the file opens and Obsidian's focus switches to that vault.
2. **Given** that file opens, **When** the response returns, **Then** it names the vault the file was opened in.
3. **Given** any vault is focused (or none of the caller's interest is focused) at request time, **When** the caller requests an open in a different open vault, **Then** the request acts on the requested vault rather than the vault that happened to be focused — no human switches focus first.

---

### User Story 2 - Open a file in a closed-but-registered vault (Priority: P2)

An automation author wants to surface a file in a vault that is currently closed but is known (registered) to Obsidian. The caller names the closed vault and the file; the tool brings that vault up, switches focus to it, and opens the file — all from the single call, with no person manually opening the vault. Because a just-brought-up vault is briefly cold, a transient first-attempt failure during the bring-up window is recovered automatically, so the caller is never asked to retry.

**Why this priority**: Closed-vault opening is the second half of the cross-vault value named in the feature one-liner ("in a vault that is currently closed"). It is P2 rather than P1 only because it composes on more machinery than the open-but-unfocused slice — it must bring the vault up and absorb the cold-launch window — and is demonstrable on top of US1. In practice it ships with US1, since both rest on the same vault-targeted focus mechanism; the added work here is the bring-up and the transient-failure recovery.

**Independent Test**: With vault B closed but registered with Obsidian, issue an open against an existing file in vault B. Verify the vault is brought up, focus lands on it, the file opens, and the caller receives the normal successful open result on the single call — with no manual opening of vault B and no caller-issued retry — even though the first internal attempt hit the cold-launch window.

**Acceptance Scenarios**:

1. **Given** a vault that is currently closed but known to Obsidian, **When** the caller requests to open a file in it, **Then** the vault is brought up and the file opens, with focus on it.
2. **Given** the vault was closed, **When** the open is attempted, **Then** a transient first-attempt failure (the cold-launch window) is recovered automatically without the caller having to retry.
3. **Given** the recovery cannot bring the closed vault to a ready state within its bound, **When** the open terminates, **Then** the caller receives a distinct error rather than a hang or a fabricated success (see US5).

---

### User Story 3 - Report how the file was actually placed (Priority: P2)

A caller — or an automated test standing in for a human — wants to know, from the response alone, how the file was placed: whether a brand-new tab was created, an existing tab already showing the file was reused, or the file opened into the active tab. Today the new-tab behaviour can only be confirmed by a person watching Obsidian; this story makes the placement an observable field so the outcome is machine-verifiable.

**Why this priority**: This is the second value named in the feature's "Why" ("callers cannot tell whether a new tab was created or an existing one reused"). It is the contract that makes the new-tab control testable without a human in the loop. It is P2 because the open itself (US1/US2) is demonstrable without the placement report, but the report is what closes the verification gap the feature exists to close; it ships alongside the cross-vault opens.

**Independent Test**: Drive each placement in turn against a (now-focused) vault — open a file that is not already open with a new tab requested, open an already-open file with reuse allowed, and open a not-already-open file into the active tab — and verify the response carries a placement outcome of exactly one of {new tab created, existing tab reused, active tab used} that matches what actually happened, with no visual inspection of Obsidian.

**Acceptance Scenarios**:

1. **Given** any successful open, **When** the response returns, **Then** it includes a placement outcome of exactly one of: new tab created, existing tab reused, or active tab used.
2. **Given** new-tab was requested and honoured, **When** the response returns, **Then** the reported placement is "new tab created".
3. **Given** reuse was allowed and an existing tab was focused, **When** the response returns, **Then** the reported placement is "existing tab reused".
4. **Given** the file was not already open and no new tab was requested, **When** the response returns, **Then** the reported placement is "active tab used".

---

### User Story 4 - Control new-tab versus reuse (Priority: P3)

A caller wants to choose whether an open creates a fresh tab or reuses a tab already showing the file, so that placement matches intent: a new-tab request always opens a fresh tab (even when the file is already open elsewhere); reuse-allowed focuses an existing tab without creating a duplicate when the file is already open.

**Why this priority**: The new-tab opt-in already exists in the base tool (BI-057 FR-008); this story carries that control forward unchanged and ties it to the placement report of US3. It is P3 because it adds no new capability beyond what BI-057 shipped — its contribution is that the chosen placement is now confirmable via US3's report. A caller that always accepts the default placement is unaffected.

**Independent Test**: With a file not yet open, request it with a new tab and verify a fresh tab is created (placement "new tab created"). With that file now open, request it again with reuse allowed and verify the existing tab is focused with no duplicate created (placement "existing tab reused"). With the file open, request it again forcing a new tab and verify a fresh tab is created for it (placement "new tab created").

**Acceptance Scenarios**:

1. **Given** a file is not already open, **When** the caller requests it with a new tab, **Then** it opens in a freshly created tab.
2. **Given** a file is already open in a tab, **When** the caller requests it with reuse allowed, **Then** the existing tab is focused and no duplicate tab is created.
3. **Given** a file is already open in a tab, **When** the caller requests it with a new tab forced, **Then** a fresh tab is created for it.

---

### User Story 5 - Distinct error for an unopenable vault (Priority: P2)

A caller wants to tell apart a vault that Obsidian does not know at all (unknown/unregistered — genuinely unopenable) from a vault that is merely closed but openable (which US2 now handles as a success). When the requested vault is unknown, the caller receives a typed error that identifies it as unknown/unregistered, distinct from the closed-but-openable case. When the vault is valid but the requested file does not exist, the caller receives a file-not-found error rather than a fabricated success.

**Why this priority**: A cross-vault opener that auto-recovers closed vaults must not also silently swallow the case it genuinely cannot handle — a vault Obsidian has never been told about. Distinguishing "unknown vault" from "closed but openable" is what lets a caller decide whether to register the vault (a human action) versus simply re-issue (which now self-recovers). The file-not-found guarantee preserves the base tool's fail-loud contract. It is P2 because the happy paths (US1/US2) are demonstrable on their own, but the distinct-error contract is what makes the surface safe to automate; it ships with the recovery path it complements.

**Independent Test**: Issue an open naming a vault Obsidian does not know and verify a typed error identifying the vault as unknown/unregistered, programmatically distinguishable from the closed-but-openable outcome of US2. Then, against a valid (open or recoverable) vault, issue an open for a file path that does not exist and verify a file-not-found error, never a success.

**Acceptance Scenarios**:

1. **Given** a vault name that Obsidian does not know, **When** the caller requests to open a file in it, **Then** the request fails with an error that identifies the vault as unknown/unregistered — distinct from the closed-but-openable case.
2. **Given** a valid vault but a file path that does not exist, **When** the caller requests to open it, **Then** the request fails with a file-not-found error rather than reporting success.
3. **Given** a registered vault that cannot be brought to a ready state within the recovery bound, **When** the open terminates, **Then** the caller receives a distinct "vault could not be opened" error, programmatically distinguishable from the unknown-vault error and from a success.

---

### Edge Cases

- **Requested vault is already the focused vault**: the open behaves as the base tool does today — the file opens in the already-focused vault with no focus switch needed; the placement outcome is still reported. Cross-vault handling adds no penalty to the same-vault case.
- **Requested vault is open in a separate Obsidian window**: an open-but-unfocused vault includes one shown in a different OS window; focus is brought to that vault. Whether cross-window focus switching is reliable on each platform is characterised by a plan-phase probe against the authorised test vault.
- **Closed vault never reaches a ready state within the recovery bound**: the bounded recovery (inherited from the dispatch chokepoint) terminates and surfaces ADR-030's reused `CLI_NON_ZERO_EXIT` / `details.reason: "obsidian-not-running"` (FR-016) — never an indefinite hang and never a fabricated success.
- **Obsidian application is entirely closed (no process running)**: app-down recovery is inherited tool-agnostically at the dispatch chokepoint (BI-060 / ADR-030) — `dispatchCli` launches Obsidian focused on the *requested* vault via the vault-targeted `obsidian://open?vault=` URI; the file then opens there. If launch is suppressed by the `OBSIDIAN_AUTO_LAUNCH` opt-out or fails, the reused `obsidian-not-running` signal (FR-016) surfaces.
- **Bare-name locator during the focus switch**: a bare `file` name MUST resolve in the requested vault's link resolver, never the pre-switch focused vault (FR-006a); a same-named file in the wrong vault is never opened, and a genuine miss surfaces as `FILE_NOT_FOUND` (FR-014).
- **Unknown / unregistered vault**: surfaces as the vault-unknown error (`VAULT_NOT_FOUND/reason:"unknown"`), distinct from the closed-but-openable case (which is now a success path) and from the unrecoverable-launch case (`obsidian-not-running`, FR-016).
- **Valid vault, file path does not exist**: surfaces as file-not-found; nothing is opened and no success is fabricated.
- **File already open in the (now-focused) target vault, no new tab requested**: the existing tab is focused, no duplicate is created, and the placement outcome is "existing tab reused".
- **File already open, new tab forced**: a fresh tab is created and the placement outcome is "new tab created" — the new-tab request is honoured literally, as in the base tool.
- **Previously-focused vault after a cross-vault open**: it stays open; only focus moves. The open never closes, reconfigures, or otherwise changes the prior vault or any Obsidian setting.
- **Placement cannot be reliably observed**: whether the substrate can distinguish new-tab-created from existing-tab-reused from active-tab-used depends on what it can observe after the open (see Assumptions — placement observability is a capability caveat resolved by a plan-phase probe). The spec fixes that exactly one of the three is reported and matches reality; the plan confirms the substrate can signal it.
- **Unsupported file type / not-found / input-validation failures**: every failure mode the base tool already surfaces (unsupported type, mutually-exclusive locators, missing locator, bracketed name, out-of-vault path, unknown field) is retained unchanged; this feature adds no new file-type handling.

## Requirements *(mandatory)*

### Functional Requirements

#### Cross-vault open and focus

- **FR-001**: System MUST be able to open a file in a vault that is currently open but is not the focused vault, switching Obsidian's focus to the requested vault so that the file becomes the focused, visible file there. This supersedes the base tool's focused-vault precondition (BI-057 FR-011) and its no-vault-switching constraint (BI-057 FR-010); see Assumptions.
- **FR-002**: System MUST be able to open a file in a vault that is currently closed but registered with Obsidian — including when the Obsidian application itself is not running — bringing that vault up focused and surfacing the file, without requiring any person to manually open the vault or start the application.
- **FR-003**: System MUST act on the vault named in the request regardless of which vault (if any) is focused when the request is made. The caller MUST NOT have to switch focus to the target vault before issuing the request.
- **FR-004**: System MUST leave the previously-focused vault open; the open moves focus to the requested vault but does not close, reconfigure, or otherwise alter the previously-focused vault.

#### Automatic transient-failure recovery (closed vault)

- **FR-005**: When opening in a closed (cold) vault — whether the vault is closed inside a running Obsidian or the application itself is not running — System MUST recover the transient first-attempt failure automatically and return the real open result on the single call the caller made, without the caller issuing a retry. This recovery is **inherited from the shared dispatch chokepoint, not re-implemented per tool**: the cold-start retry (ADR-029 / BI-059) absorbs the vault warm-up window, and the application-launch recovery (ADR-030 / BI-060) — `dispatchCli` detecting app-not-running and launching via the vault-targeted `obsidian://open?vault=` opener — absorbs the application-down case. System MUST NOT add a bespoke launcher or a per-tool retry loop. It MUST honor the `OBSIDIAN_AUTO_LAUNCH` opt-out (on-by-default, ADR-030); recovery is bounded by those mechanisms (at most one cold-start retry; one bounded app-launch readiness wait), then terminates with the FR-016 signal rather than hanging or looping.
- **FR-006**: System MUST ensure the application-launch recovery focuses the **requested** vault (the vault named in the call), so a closed/down target is brought up focused on the right vault via ADR-030's vault-targeted `obsidian://open?vault=<requested>` URI — not whatever vault was last focused. The residual focus-switch window that BI-059 FR-013 carves out of the dispatch cold-start retry (the eval-composed `VAULT_NOT_FOCUSED`-envelope manifestation) MUST be eliminated by resolving and opening atomically in the requested vault (plan-phase mechanism), not by a new per-tool retry.

#### Locator resolution scoped to the requested vault

- **FR-006a**: System MUST resolve the file locator in the **requested** vault's context, never the vault that happens to be focused before the switch. The locator schema is unchanged from BI-057 (exactly one of `path` or `file`; static per ADR-003 / Constitution Principle III — acceptance MUST NOT depend on runtime focus state). A bare-name (`file`) locator MUST resolve via the requested vault's link resolver as part of the vault-targeted open; if the native vault-targeted open resolves linktext atomically in the requested vault that property holds for free, and any separate eval-side resolution MUST target the requested vault explicitly. A locator that matches no file in the requested vault MUST surface as `FILE_NOT_FOUND` (FR-014), never a silent open of a same-named file in a different (e.g. pre-switch) vault.

#### Placement control (retained from BI-057)

- **FR-007**: System MUST accept the existing new-tab opt-in. When the opt-in is enabled, the file opens in a freshly created tab (even when it is already open elsewhere). When the opt-in is disabled (default) and the file is already open in the target vault, System MUST focus the existing tab rather than create a duplicate; when it is disabled and the file is not already open, the file opens into the active tab. No new placement-control input is introduced by this feature.

#### Placement reporting (new)

- **FR-008**: On every successful open, System MUST report a placement outcome that is exactly one of: "new tab created", "existing tab reused", or "active tab used". Exactly one value is reported per successful open.
- **FR-009**: When a new tab was requested and honoured, the reported placement outcome MUST be "new tab created".
- **FR-010**: When reuse was allowed and an existing tab already showing the file was focused, the reported placement outcome MUST be "existing tab reused".
- **FR-011**: When the file was not already open and no new tab was requested (it opened into the active tab), the reported placement outcome MUST be "active tab used".
- **FR-012**: The placement outcome MUST be a single categorical value sufficient to confirm the open without visual inspection. System MUST NOT expose internal pane or leaf identifiers, or split-layout geometry, in the response.

#### Vault and file error distinction

- **FR-013**: When the requested vault is not registered / not known to Obsidian at all (unregistered name or typo), System MUST fail with the cohort's `CLI_REPORTED_ERROR` + `details.code: "VAULT_NOT_FOUND"` + `details.reason: "unknown"`, open nothing, and resolve this **before** any open or launch is attempted (the registry lookup already runs pre-eval). This is the **sole hard vault error**: an open-but-unfocused or closed-but-registered vault is a success path (FR-001, FR-002, FR-005), not an error.
- **FR-014**: When the requested vault is valid (focused, open, brought-up, or recoverable) but the requested file does not exist **in that requested vault**, System MUST fail with `FILE_NOT_FOUND` naming the requested location and open nothing — never a fabricated success and never a silent open of a same-named file in a different (e.g. pre-switch) vault. The locator resolution that backs this guarantee MUST be scoped to the requested vault (FR-006a).
- **FR-015**: System MUST keep the three distinct outcomes programmatically distinguishable: unknown-vault (FR-013, `VAULT_NOT_FOUND/reason:"unknown"`), file-not-found (FR-014, `FILE_NOT_FOUND`), and unrecoverable-launch (FR-016, `obsidian-not-running`). A caller can branch on each.
- **FR-016**: When the application is down (or a closed vault otherwise cannot be brought to a ready state) and launch is suppressed by the `OBSIDIAN_AUTO_LAUNCH` opt-out or fails within ADR-030's bound, System MUST surface ADR-030's existing `CLI_NON_ZERO_EXIT` + `details.reason: "obsidian-not-running"` — **reused, not newly minted**. System MUST NOT introduce a new top-level code or a new `details.reason` for this state (a new reason is warranted only if a distinct "registered-but-launch-failed" state exists that ADR-030's `obsidian-not-running` does not already cover; absent that, reuse is mandatory — Principle IV / ADR-015 closed-enum).

#### Error vocabulary and fail-loud guarantee

- **FR-017**: For every failure mode, System MUST open no file, leave no file falsely reported as opened, and surface a typed, programmatically distinguishable error. No silent no-op and no fabricated success ever occurs.
- **FR-018**: System MUST introduce no new top-level error code **and no new `details.reason`**. Every failure reuses an existing `(code, details.code, details.reason)` triple per ADR-015's additive-only closed-enum rule: unknown-vault → `VAULT_NOT_FOUND/reason:"unknown"`; file-not-found → `FILE_NOT_FOUND`; unrecoverable launch → `CLI_NON_ZERO_EXIT/reason:"obsidian-not-running"` (ADR-030). The BI-057 `reason:"not-open"` is NOT repurposed or renamed — it simply stops being emitted by this tool (its registered-but-not-focused case is now a success path). Constitution Principle IV's zero-new-top-level-codes streak is preserved.

#### Response shape

- **FR-019**: On a successful open, System MUST return a confirmation that (a) names the vault the file was opened in, (b) identifies the opened file by its resolved vault-relative location, and (c) reports the placement outcome (FR-008). The locator echo follows the project's read-vs-write echo convention (a mutating/observable-state operation echoes its locator for write-verification).

#### File-type generality (retained, unchanged)

- **FR-020**: System MUST keep every file type that is already openable openable, with no new per-type handling introduced. Type generality is inherited from the base tool unchanged; this feature changes vault addressing and response reporting, not which file types are supported.

#### Out of scope (negative requirements)

- **FR-021**: System MUST NOT auto-enable, reconfigure, or otherwise change the user's Obsidian settings or configuration as part of an open.
- **FR-022**: System MUST NOT open or create a vault that has never been registered with Obsidian. A closed-but-registered vault is brought up; an unregistered vault surfaces the FR-013 unknown-vault error.
- **FR-023**: System MUST NOT expose internal pane/leaf identifiers or split-layout geometry — a single placement outcome (FR-008) is the only placement signal returned.

### Key Entities

- **Requested vault**: The vault named in the request that owns the target file. It may be the focused vault, an open-but-unfocused vault, or a closed-but-registered vault; in every case the open switches focus to it (FR-001–FR-003). A vault Obsidian does not know surfaces the unknown-vault error (FR-013); the open never creates a vault (FR-022).
- **Placement outcome**: A single categorical value attached to every successful open — exactly one of "new tab created", "existing tab reused", or "active tab used" (FR-008) — that lets a caller or test confirm how the file was placed without visual inspection.
- **New-tab opt-in**: The retained boolean input (BI-057) whose enabled value forces a fresh tab and whose default reuses an existing tab (else opens into the active tab). It determines, together with whether the file is already open, which placement outcome is reported (FR-009–FR-011).
- **Transient first-attempt failure**: The recoverable failure produced by a closed vault's bring-up / cold-launch window, which the feature absorbs automatically so the caller receives the real open result on a single call (FR-005, FR-006).
- **Open result**: The success confirmation — names the vault opened in, identifies the resolved file location, and reports the placement outcome (FR-019).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An automation can open a file in a vault that is open but not focused, in a single call, with no person switching focus first — in 100% of cases where the requested vault is registered and reachable.
- **SC-002**: An automation can open a file in a closed-but-registered vault in a single call, with the transient first-attempt (cold-launch) failure recovered automatically and no caller retry — in 100% of cases where the vault can be brought to a ready state within the recovery bound.
- **SC-003**: Every successful open reports a placement outcome of exactly one of {new tab created, existing tab reused, active tab used} that matches what actually happened, enabling a caller or automated test to confirm new-tab versus reuse without visual inspection of Obsidian — in 100% of successful opens.
- **SC-004**: An unknown/unregistered vault surfaces a distinct error from a closed-but-openable vault in 100% of cases — never conflated, never a success.
- **SC-005**: A valid vault with a nonexistent file path surfaces file-not-found in 100% of cases — never a fabricated success.
- **SC-006**: The request acts on the requested vault regardless of which vault was focused at request time — in 0% of cases does the open land in the wrong (merely-focused) vault.
- **SC-007**: After a cross-vault open, the previously-focused vault remains open (only focus moved) in 100% of cross-vault opens; no Obsidian setting or configuration is changed.
- **SC-008**: Every file type openable before this feature remains openable, with no per-type behavioural change — 100% type-parity with the base tool.
- **SC-009**: When a registered vault cannot be brought to a ready state (launch suppressed by `OBSIDIAN_AUTO_LAUNCH` or failed within bound), the operation terminates in bounded time and surfaces the reused `obsidian-not-running` signal in 100% of such cases — it never hangs, loops, or fabricates success.

## Assumptions

- **Extends `open_file` (BI-057), and deliberately supersedes its no-switch contract**: This feature builds on the existing `open_file` tool. It supersedes BI-057 FR-010 (the open "MUST NOT switch to, focus, or open a different vault") and FR-011 (the active focused-vault guard — a single comparison in the eval template — that errored with `VAULT_NOT_FOUND` / `details.reason: "not-open"` when the requested vault was not focused). The guard is an eval-implementation artifact, not a hard Obsidian constraint; under this feature, "registered but not focused" and "closed but registered" become **success** paths (switch focus / bring up), and only "unknown/unregistered" remains a hard vault error. Per the project's supersede-don't-drift rule (CLAUDE.md, ".decisions/"), this contract inversion is a deliberate architectural event that MUST be recorded in a new ADR at plan-phase rather than silently overriding BI-057. The BI-057 `details.reason: "not-open"` is **not retired, renamed, or repurposed** — ADR-015's closed enum is additive-only — it simply stops being emitted by this tool once its registered-but-not-focused case becomes a success. This assumption surfaces the conflict explicitly; the ADR is authored in the plan phase.
- **Enabling mechanism — vault-targeted focus (overcoming upstream limitation B1)**: Opening in a non-focused vault is only possible because the project already has a mechanism to bring a *specific* vault to focus. The eval substrate ignores `vault=` and always runs against the focused vault (upstream limitation B1, `.architecture/Obsidian CLI - Upstream Issues and Limitations.md`); BI-057's guard existed precisely because of B1. ADR-030 (BI-060) shipped a vault-targeted `obsidian://open?vault=<name>` URI opener (`app-launcher`) that opens/focuses a named vault. The plan phase confirms how this feature reaches a non-focused or closed vault. **Resolved (ADR-031)**: `open_file` stays eval-composed; the in-eval focused-vault guard is demoted to a `VAULT_NOT_FOCUSED` switch-signal on which the handler reuses ADR-030's vault-targeted `obsidian://open?vault=` opener (no new spawn site) + a bounded verify-poll, with app-down/cold-start recovery inherited from `dispatchCli`. A 2026-06-01 live probe found native `open`/`tab:open` commands that honour `vault=` and switch focus cross-vault (B1 applies only to `eval`); that simpler native-wrapper route is tracked as **OQ-1** (T0 re-probe) and may supersede the eval design via a follow-up ADR once cross-platform/unsupported-type are confirmed. See [plan.md](plan.md) and [research.md](research.md).
- **Closed-vault recovery is inherited at the dispatch chokepoint, not re-implemented (ADR-029 / ADR-030)**: The "transient first-attempt failure recovered automatically" (FR-005) is provided by the shared dispatch chokepoint tool-agnostically: the cold-start retry (ADR-029 / BI-059) for the vault warm-up window, and the application-launch recovery (ADR-030 / BI-060) for the app-down case (`dispatchCli` detects app-not-running and launches via the vault-targeted `obsidian://open?vault=` opener, focused on the requested vault). The feature MUST NOT add a bespoke launcher or per-tool retry. The one residual manifestation is the eval-composed `VAULT_NOT_FOCUSED`-envelope that BI-059 FR-013 carves out of the dispatch retry; the plan eliminates it by routing the open through a vault-targeted mechanism that resolves and opens atomically in the requested vault, rather than by adding a per-tool retry. The `OBSIDIAN_AUTO_LAUNCH` opt-out is honored; the recovery bound is the inherited mechanisms' bound, pinned at plan-phase.
- **Placement observability is a capability caveat**: Whether the substrate can reliably distinguish "new tab created" from "existing tab reused" from "active tab used" depends on what it can observe after the open (e.g. the workspace leaf count / identity before versus after, or whether `openLinkText`/`openFile` created a new leaf). This mirrors BI-057's unsupported-type detection caveat. The spec fixes that exactly one of the three values is reported and matches reality; the plan-phase T0 probe (per `.memory/test-execution-instructions.md`, driven against the production-resolved `Obsidian.com` shim) confirms the substrate can signal the distinction and pins how each placement is detected. **Tension the plan MUST reconcile**: routing the open through the dispatch chokepoint so recovery is inherited (Clarifications Q3) must still leave the open able to report placement — e.g. an eval that runs post-switch and inspects leaf state, versus a pure native command that may not report placement. The plan picks a mechanism that satisfies both recovery-inheritance and placement reporting.
- **Error vocabulary — zero new top-level codes AND zero new reasons (Constitution Principle IV / ADR-015)**: Every failure reuses an existing `(code, details.code, details.reason)` triple (FR-018), and the literals are settled, not deferred: unknown-vault → `VAULT_NOT_FOUND/reason:"unknown"` (sole hard vault error); file-not-found → `FILE_NOT_FOUND`; unrecoverable launch → `CLI_NON_ZERO_EXIT/reason:"obsidian-not-running"` (reused from ADR-030). The BI-057 `reason:"not-open"` stops being emitted (its case is now a success) but is not removed from the enum. No new reason is minted unless a distinct "registered-but-launch-failed" state surfaces at plan/T0 that `obsidian-not-running` does not cover.
- **New-tab input retained as-is**: The new-tab opt-in is the same boolean BI-057 ships (default off = reuse/focus existing, on = force new tab). This feature adds no new placement-control input; its new contribution is the placement *report* (FR-008), not new placement *control*.
- **Obsidian must be installed with the target vault registered**: A closed-but-registered vault is brought up; a vault never registered with Obsidian is out of scope (FR-022) and surfaces the unknown-vault error. The feature does not create or register vaults, and does not change Obsidian settings (FR-021).
- **Retained out-of-scope boundaries from BI-057 still hold**: External (non-vault) paths, content editing, intra-file heading/block navigation, and tab management beyond opening remain out of scope and are not re-litigated here; this feature changes only vault addressing, transient-failure recovery, and response reporting.
- **Test scope is unit-level plus plan/implement-phase T0 probes**: Behavioural coverage is the project's vitest unit tests over the tool's schema/handler; the live-CLI placement and cross-vault-focus probes run against the authorised test vault per `.memory/test-execution-instructions.md` at the plan/implement T0 step, not as in-repo integration tests.

## Dependencies

- **BI-057 — Open Vault File** (`open_file`): the base capability this feature extends and whose no-switch / focused-vault-guard contract (FR-010 / FR-011) it supersedes. A new ADR records the supersession (see Assumptions).
- **ADR-030 — Sanctioned App-Launch Spawn Site** (Decided) / **BI-060 — Recover Closed Obsidian**: provides the vault-targeted `obsidian://open?vault=` URI opener and the two-sanctioned-spawn-site invariant the cross-vault focus mechanism reuses and must respect. App-down recovery is inherited tool-agnostically at the dispatch chokepoint (`dispatchCli`), and the unrecoverable signal `CLI_NON_ZERO_EXIT/reason:"obsidian-not-running"` is reused from here (FR-016).
- **ADR-029 — Retry Once on Cold-Start Vault-Launch Failure** (Decided) / **BI-059 — Retry Cold Start**: the dispatch-layer cold-start retry the closed-vault recovery inherits; its FR-013 carve-out of the eval-composed `VAULT_NOT_FOCUSED`-envelope manifestation is the residual window the plan eliminates by routing the open through a vault-targeted mechanism that resolves and opens atomically in the requested vault (FR-006), not a per-tool retry.
- **ADR-015 — Sub-Discriminators via `details.reason`** (Decided): the vehicle for distinguishing unknown-vault, unrecoverable-launch (`obsidian-not-running`), and file-not-found without a new top-level error code or a new reason (additive-only closed enum).
- **Upstream limitation B1** (`.architecture/Obsidian CLI - Upstream Issues and Limitations.md`): the eval-routes-to-focused-vault behaviour the cross-vault open must work around via the vault-targeted focus mechanism.

## Out of Scope

- Auto-enabling, reconfiguring, or otherwise changing the user's Obsidian settings or configuration.
- Exposing internal pane or leaf identifiers, or split-layout geometry — a single placement outcome is sufficient.
- Opening or creating a vault that has never been registered with Obsidian.
- Changing which file types are openable — every type already supported stays supported, with no new per-type handling introduced.
- (Retained from BI-057) external non-vault filesystem paths, editing the opened file's content, scrolling to a heading or block within the file, and tab management beyond opening.
