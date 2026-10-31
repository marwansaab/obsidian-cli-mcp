# Feature Specification: Align Closed-Vault Reporting

**Feature Branch**: `072-align-closed-vault-reporting`
**Created**: 2026-10-31
**Status**: Draft
**Input**: User description: "Align closed-vault reporting — every operation that names a vault reports a registered-but-closed vault consistently with what actually happens: the closed vault is brought up and the operation succeeds, or, if it cannot be brought up, the caller receives one clear 'vault unavailable' failure. The documentation of each affected operation stops advertising a 'vault not open' failure sub-state that is never produced."

## Background

Six read operations — semantic search (`smart_connections_query`), similar-notes lookup (`smart_connections_similar`), Base query (`query_base`), recursive path listing (`paths`), regex search (`pattern_search`) and tag lookup (`tag`) — each carry their own check for a "registered but not open" vault. The check fires only when the named vault answers with nothing at all, then asks Obsidian for its vault list and, if the vault is listed, reports a "vault not found / not open" failure with advice to retry after a brief delay.

That signal is never produced in practice. A closed vault is now recovered by the shared dispatch behaviour every operation inherits (the single cold-start retry of ADR-029, Retry Once on Cold-Start Vault-Launch Failure, and the application auto-launch of BI-060), and the "nothing at all" answer the check waits for was traced to an artefact of driving the desktop executable rather than the command-line shim (specs/059-retry-cold-start T0 probe findings). When recovery does fail, the caller sees the existing `CLI_REPORTED_ERROR` that the retry passes on (stdout `Error: Command "…" not found. …`). That outcome is correct, but none of the six operations' reference pages describes it. The operations that were already moved onto the shared recovery behaviour (`open_file`, `get_active_file`) and the README's failure table already describe a closed vault as recovered automatically; these six, and a few other tool reference pages, still describe the old signal.

## Clarifications

### Session 2026-10-31

- Q: Which operations report the new vault-unavailable failure? → A: None gets a new failure. No new failure code, sub-reason or classifier is added. The six named operations keep the existing `CLI_REPORTED_ERROR` that the ADR-029 retry already passes on (stdout `Error: Command "…" not found. …`). That error **is** the vault-unavailable failure: it is documented as such in those six operations' reference pages and short descriptions, separately from the unknown-vault failure and from an empty result. The dispatch layer, the cold-start retry and `obsidian_exec` stay unchanged. Rationale: the backlog item (BI-0076) says the current post-retry envelope is correct and only needs a clear description, and its dedicated sub-reason option belongs to the resolution not chosen (this feature takes the "Retire" resolution). ADR-029's retry behaviour is also out of scope.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A closed registered vault just works (Priority: P1)

An agent names a vault that Obsidian knows about but that is not open right now. The agent runs one of the six affected operations. The vault is brought up by the shared recovery behaviour and the operation returns the same result it would have returned had the vault been open from the start. The agent writes no special handling for a closed vault.

**Why this priority**: This is the common case and the whole point of the shared recovery behaviour. If it does not hold, the rest of the feature (clean reporting, clean docs) describes a contract that the operations do not keep.

**Independent Test**: Close a registered vault in the authorised test vault set, run each of the six operations naming it, and confirm each returns its normal result on the first call, with no "not open" failure in between.

**Acceptance Scenarios**:

1. **Given** a registered vault that is closed, **When** an agent runs a semantic search naming that vault, **Then** the vault is brought up and the search returns its normal result.
2. **Given** a registered vault that is closed, **When** an agent runs a similar-notes lookup naming that vault, **Then** the vault is brought up and the lookup returns its normal result.
3. **Given** a registered vault that is closed, **When** an agent runs a Base query naming that vault, **Then** the vault is brought up and the query returns its normal result.
4. **Given** a registered vault that is closed, **When** an agent runs a recursive path listing naming that vault, **Then** the vault is brought up and the listing returns its normal result.
5. **Given** a registered vault that is closed, **When** an agent runs a regex search naming that vault, **Then** the vault is brought up and the search returns its normal result.
6. **Given** a registered vault that is closed, **When** an agent runs a tag lookup naming that vault, **Then** the vault is brought up and the lookup returns its normal result.

---

### User Story 2 - A vault that cannot be brought up is clearly reported (Priority: P1)

An agent names a registered vault that the shared recovery behaviour cannot bring up. For example, the vault's command-line integration is disabled, so even after the retry the command is still not recognised. The agent receives one failure: the existing `CLI_REPORTED_ERROR` whose stdout reads `Error: Command "…" not found. …`. Each affected operation's documentation names that failure as "vault unavailable". The agent can tell it apart from an unknown vault name (fix the name) and from an empty result (the query matched nothing).

**Why this priority**: Without this, removing the dead "not open" signal leaves the agent holding a "command not found" failure that no page explains, which reads like a server defect rather than a vault state. Equal priority with Story 1 because each is half of "report what actually happens".

**Independent Test**: With a registered vault whose command-line integration is unavailable (or a simulated persistent "command not found" answer after the retry), run each of the six operations naming it. Confirm the failure is the one the operation's documentation lists as vault unavailable, not the unknown-vault failure and not an empty success.

**Acceptance Scenarios**:

1. **Given** a registered vault that cannot be brought up, **When** an agent runs any of the six operations naming it, **Then** the agent receives the `CLI_REPORTED_ERROR` that the cold-start retry passes on (stdout `Error: Command "…" not found. …`), unchanged in category, details and wording.
2. **Given** that failure, **When** an agent checks it against the operation's documentation, **Then** the documentation names it as the vault-unavailable failure in its own entry. That entry says how to recognise it (the `Command "…" not found.` stdout signature) and that it is a failure, never an empty result. It does not restate or cross-reference the unknown-vault entry, which stays as it is.
3. **Given** a vault name that is not registered, **When** an agent runs any of the six operations naming it, **Then** the agent receives exactly the unknown-vault failure it receives today — same category, same markers, same wording.

---

### User Story 3 - Documentation lists only failures that can occur (Priority: P2)

An agent (or the human who configures it) reads an operation's published reference page or its short tool description to decide what failures to handle. For a closed vault, they find the automatic-recovery behaviour and the vault-unavailable failure — not a "registered but not open" sub-state with retry-after-a-delay advice.

**Why this priority**: The documentation drift is what misleads agents today, but it depends on Stories 1 and 2 being true first; documenting the new contract before it holds would trade one inaccuracy for another.

**Independent Test**: Read the reference page and short description of each affected operation and confirm no "registered but not open" vault sub-state is advertised, and the closed-vault behaviour reads the same way it does for `open_file`, `get_active_file` and the README.

**Acceptance Scenarios**:

1. **Given** the published reference pages and short descriptions of the six affected operations, **When** a reader looks up the closed-vault failure, **Then** no "registered but not open" vault sub-state is listed and closed-vault handling is described as automatic recovery.
2. **Given** any other operation's reference page that lists the same "registered but not open" vault sub-state although the operation never produces it, **When** a reader checks that page, **Then** the sub-state is gone there too.
3. **Given** the reference pages after the change, **When** a reader compares the closed-vault description across operations, **Then** the wording agrees with the operations that already document automatic recovery.

---

### User Story 4 - No dead handling left behind (Priority: P3)

A maintainer changing one of the six operations finds no separate closed-vault check, no extra vault-list lookup triggered by an empty answer, and no tests that pin a failure the operation cannot produce. The closed-vault outcome comes from the shared recovery behaviour alone.

**Why this priority**: Pure maintainability. Agents see no difference, but leaving the dead path invites future changes to preserve it as if it carried weight.

**Independent Test**: Review the six operations and confirm none of them performs its own closed-vault detection, and that the shared detection helper they used is gone because nothing else uses it.

**Acceptance Scenarios**:

1. **Given** the six affected operations, **When** a closed registered vault is targeted, **Then** the outcome is produced by the shared recovery behaviour alone, with no per-operation closed-vault path.
2. **Given** the shared closed-vault detection helper, **When** no operation depends on it any longer, **Then** it is removed together with its tests.
3. **Given** an operation that names a vault and receives an empty, unexplained answer, **When** the extra vault-list lookup no longer happens, **Then** the operation still never reports that answer as an empty success.

---

### Edge Cases

- **Empty answer with no error from a named vault.** With the per-operation check gone, an empty answer that is not a recognised failure must still surface as a structured failure (as it already does for the eval-based operations' parse stage), never as an empty success. Operations whose normal result can legitimately be empty (for example a path listing of an empty folder, or a tag with no notes) keep their existing, documented way of telling "empty result" from "no answer".
- **Recovery succeeds on the retry.** The caller sees only the normal result; no failure, warning or retry advice is surfaced.
- **Application not running.** Covered by the existing auto-launch behaviour and its existing distinct failures (auto-launch disabled; could not launch in time). Unchanged by this feature.
- **Unknown vault name.** Unchanged: the existing unknown-vault failure, with its current category, markers and wording.
- **Operation run without naming a vault (active vault).** Not affected: the closed-vault question does not arise for the focused vault.
- **Older agents matching on the retired sub-state.** They no longer see it. Because the sub-state was never produced, no working agent depended on receiving it; the retirement is noted in the changelog.
- **Raw command passthrough (`obsidian_exec`).** Not affected. Its "command not found" failure can also mean the caller mistyped a command name, so it is neither relabelled nor documented as vault unavailable.
- **"Command not found" output that is not a closed vault.** The shared layer already classifies it as `CLI_REPORTED_ERROR`, and this feature does not change that classification. The six operations run fixed commands, so for them the signature after the retry means the vault could not be brought up.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When any of the six affected operations names a registered vault that is closed, the system MUST bring the vault up through the shared recovery behaviour and return the operation's normal result, with no intermediate "not open" failure.
- **FR-002**: When any of the six affected operations names a registered vault that the shared recovery behaviour cannot bring up, the system MUST return the existing `CLI_REPORTED_ERROR` that the ADR-029 cold-start retry already passes on (stdout `Error: Command "…" not found. …`), unchanged in category, details and wording. This is the vault-unavailable failure.
- **FR-003**: No new failure code, sub-reason or classifier is introduced (Constitution Principle IV). The dispatch layer, the cold-start retry, the auto-launch and `obsidian_exec` stay unchanged.
- **FR-004**: When any of the six affected operations names a vault that is not registered, the system MUST return the existing unknown-vault failure unchanged.
- **FR-005**: The six affected operations MUST NOT perform their own closed-vault detection, MUST NOT issue an extra vault-list lookup in response to an empty answer, and MUST NOT emit the "registered but not open" vault sub-state.
- **FR-006**: The shared closed-vault detection helper used only by those six operations MUST be removed, together with tests that exist only to exercise it.
- **FR-007**: An empty, unexplained answer from a named vault MUST still surface as a structured failure and never as an empty success, for every affected operation.
- **FR-008**: The reference page and short tool description of each of the six affected operations MUST NOT advertise a "registered but not open" vault sub-state or retry-after-a-delay advice for a closed vault, and MUST describe closed-vault handling as automatic recovery. Each page MUST also list the vault-unavailable failure: the post-retry `CLI_REPORTED_ERROR` with the `Command "…" not found.` stdout signature, its meaning (the named vault could not be brought up, for example because its command-line integration is disabled) and what to do about it. It MUST be stated as its own sentence (in the description) or row (on the page). It MUST NOT merge into, alter or cross-reference any existing unknown-vault text, and it MUST say that this is a failure, not an empty result.
- **FR-009**: Any other operation's reference page that advertises the "registered but not open" vault sub-state although that operation never produces it MUST be corrected in the same way.
- **FR-010**: The general rule that a failure covering several states carries a nested sub-reason MUST remain in force; only the unreachable closed-vault sub-state is withdrawn. Unrelated uses of the same sub-reason word for other failures (for example "no Base open" on the Base views operation) MUST be left unchanged.
- **FR-011**: Each affected operation MUST ship tests covering, at minimum, the closed-vault-recovers path, the vault-unavailable path (the post-retry `CLI_REPORTED_ERROR` reaches the caller unchanged, with no extra vault-list lookup) and the unknown-vault path, replacing the tests that pinned the retired sub-state (Constitution Principle II).
- **FR-012**: The changelog MUST record that the "registered but not open" vault sub-state is retired from the affected operations, and that the existing post-retry `CLI_REPORTED_ERROR` is now documented as their vault-unavailable failure.

### Key Entities

- **Registered vault**: A vault Obsidian knows by display name (it appears in the vault list), whether or not it is open right now.
- **Closed vault**: A registered vault that is not open at the moment an operation names it; recoverable by the shared recovery behaviour.
- **Unavailable vault**: A registered vault the shared recovery behaviour could not bring up within its single retry (for example, its command-line integration is disabled). It is reported by the vault-unavailable failure.
- **Vault-unavailable failure**: The existing `CLI_REPORTED_ERROR` that the cold-start retry passes on when its second attempt still answers `Error: Command "…" not found. …`. No new code or sub-reason: it is recognised by that stdout signature and documented under this name.
- **Unknown vault**: A name that does not match any registered vault; reported by the existing unknown-vault failure.
- **Retired sub-state**: The "registered but not open" vault sub-reason that the six affected operations can emit only on an answer that never arrives, and that their reference pages (plus two other operations' pages) advertise.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For each of the six affected operations, a call naming a closed registered vault returns its normal result on the first call in 100% of runs against the authorised test vault, with no intermediate failure.
- **SC-002**: In the automated tests for each of the six affected operations, a call naming a registered vault that cannot be brought up returns the vault-unavailable failure every time, and never the unknown-vault failure or an empty success. The tests simulate this by having the "command not found" answer persist after the single retry. Where the environment can safely disable one test vault's command-line integration, the optional live check shows the same failure.
- **SC-003**: For each of the six affected operations, a call naming an unregistered vault returns a failure identical in category, markers and wording to the one returned before the change.
- **SC-004**: Zero published reference pages or short tool descriptions advertise the "registered but not open" vault sub-state after the change.
- **SC-005**: Zero affected operations retain their own closed-vault check, and zero code paths remain that can only be reached by a failure the system never produces.
- **SC-006**: Zero new failure codes, sub-reasons or classifiers are introduced, and the dispatch layer, the cold-start retry and `obsidian_exec` are unchanged.
- **SC-007**: Each of the six affected operations' reference pages and short descriptions lists the vault-unavailable failure in its own sentence or row. Any existing unknown-vault text in those descriptions and pages is unchanged, except where `not-open` is removed from it.

## Assumptions

- **The retired signal is unreachable.** The "nothing at all" answer the per-operation check waits for is the desktop-executable artefact recorded in the 059 cold-start T0 probe findings; the command-line shim the server drives answers a closed vault with the "command not found" signature that the shared cold-start retry already handles. A live probe against the authorised test vault during implementation confirms this before the check is removed; if the probe contradicts it, the feature stops and the finding is surfaced.
- **Scope is the six named operations for behaviour, wider for documentation.** Behavioural changes bind the six operations listed in the acceptance criteria. Documentation corrections also cover other reference pages that list the same unreachable vault sub-state (at the time of writing, `find_and_replace` and `patch_block`), since those pages mislead agents in the same way.
- **The vault-unavailable failure is the existing failure, documented.** Per the backlog item (BI-0076), the post-retry `CLI_REPORTED_ERROR` is the correct outcome for a vault that cannot be brought up and only needs describing clearly. A dedicated sub-reason belongs to the alternative resolution this feature does not take. Documenting it as vault unavailable is limited to the six affected operations.
- **The shared recovery behaviour itself is unchanged.** The cold-start retry, the auto-launch, its opt-out and its timing stay exactly as they are, and so does the failure a final unrecoverable outcome produces. Only its documentation changes.
- **Changing the published short descriptions is a deliberate surface change.** The tool-surface fingerprint baseline moves with this feature and is updated as a recorded, deliberate change.
- **The disabled command-line integration case is reported, not fixed.** Re-enabling the integration, or behaving differently when it is permanently off, is out of scope beyond the clear failure.

## Out of Scope

- The unknown-vault failure contract.
- Correcting how the five eval tools' docs and descriptions word the unknown-vault failure. They say `VAULT_NOT_FOUND` / `unknown`, but those handlers return `details.message: "Vault not found."`, and the `paths` description has no unknown-vault wording at all. The unknown-vault surface (TC-00228, TC-00105, TC-00209) stays outside this feature; the mismatch is recorded on BI-0076 as a candidate follow-up BI.
- The general rule that multi-state failures carry a nested sub-reason.
- How an operation behaves when a vault's command-line integration is permanently disabled, beyond reporting it clearly.
- Changes to the automatic recovery behaviour itself (cold-start retry count, auto-launch, timing, opt-out).
- The Base views operation's "no Base open" sub-reason, which describes a different, reachable state.
