# Feature Specification: Reconcile Help Documentation

**Feature Branch**: `084-reconcile-help-docs`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Reconcile help documentation. Every piece of reference guidance the server publishes — the help index, each tool's long-form help, and each tool's short description — names only tools that exist, shows only calls that work, and describes errors exactly as they are returned. After the latest release's tool renames and validation changes, the published guidance still lists removed tools, points to old tool names, shows an example call the server rejects, and describes error details that the errors do not carry. Agents rely on this guidance as their only map of the server, so each mismatch costs failed calls or error-handling code that never fires."

## Clarifications

### Session 2026-11-02

- Q: For `create_base`, should the help page change to describe the error as returned, or should the returned error change to carry the documented `details.code` and `details.reason`? → A: The returned error changes to match the docs (Option B). The oversized-content, invalid-name and invalid-base-path rejections return `details.code`, `details.reason` (where one exists) and `details.field`, as `prepend` and `find_and_replace` already do under the ADR-015 sub-discriminator convention. No new error codes. Happy-path and failure tests cover all three rejections (Constitution Principle II). The docs change only where a detail they state differs from the result.
- Q: For `context_search`'s missing-folder error, should the help page change to show the generic top-level message as returned, or should the error change so its top-level message is the CLI's folder text? → A: Docs only (Option A). The error is unchanged and the CLI layer stays frozen. The folder-existence probe's contract stands: a `CLI_REPORTED_ERROR` with `details.command: "folder"` passes through unchanged. Example 4 and the page's text show the error exactly as returned: the generic top-level message, the folder text in `details.message`, `details.command: "folder"` and `argv`.
- Q: Which kinds of drift should this feature's automated tests guard against permanently? → A: The help index and help pages only, checked against the offered tools (Option A). The permanent guard is the reverse of the existing check that every registered tool has a help page: it fails when a help page or index entry names a tool the server does not offer, or when the index omits one it does. It has a happy-path test and a failure test (Constitution Principle II). Stale tool names (SC-003) and invalid examples (SC-004) are verified once during implementation. Later re-checks re-run the BI-0122 audit pattern, which already has re-runnable records (TC-00586, TC-00587).
- Q: Should FR-008 require the `create_base` short description to name `details.code`, `details.reason` and `details.field`, or only the help page, with the description required not to contradict them? → A: Only the help page (Option A), in line with the Q1 rule that docs change only where a detail differs. ADR-040 makes `help` the home for long-form error rosters and keeps descriptions short. The description already names the codes and sub-reasons correctly, so it and its published fingerprint stay unchanged.
- Q: Should this feature pin `context_search`'s missing-folder error fields (`details.command`, `details.message`, the top-level message) in tests, or verify FR-009 only once? → A: Pin them in tests (Option A). Under Constitution Principle II, tests are what enforce the agent contract, and the architecture's folder-existence probe already names `details.command: "folder"` as the contract. The assertions are test-only, so FR-009's docs-only fix and the frozen CLI layer both hold. They are behaviour tests, not a docs-drift guard, so FR-012's single permanent guard is unaffected.

## User Scenarios & Testing *(mandatory)*

The "agent" in every story is an AI client connected to the server, whose only map of the server is the guidance the server itself publishes: the help index, each tool's long-form help page, each tool's short description (including its parameter descriptions), and the recovery hints carried by its validation messages.

### User Story 1 - Help index matches the server (Priority: P1)

An agent asks for the help index to discover what it can do. Today the index lists two tools the server does not offer (`list_notes` and `search_vault`), each with a "documentation pending" placeholder, and asking for either one's help returns that placeholder page instead of saying the tool does not exist. The agent wants the index to list exactly the tools the server offers, and a request for a removed tool's help to say plainly that no such tool exists.

**Why this priority**: The index is the agent's first and broadest map. A phantom entry sends the agent toward a call that always fails, and a placeholder page tells it the tool is merely undocumented, so it may keep trying.

**Independent Test**: Compare the tools named in the help index with the tools the server lists to a connected client; then ask for help on each removed name and check the answer.

**Acceptance Scenarios**:

1. **Given** the server is running with its default configuration, **When** an agent asks for the help index, **Then** the tools listed are exactly the tools the server offers, no more and no fewer.
2. **Given** a tool name that was removed (`list_notes`, `search_vault`), **When** an agent asks for its help, **Then** the answer is the help tool's existing "no such tool" error, which lists only tools the server offers, rather than a placeholder page.
3. **Given** the help tool's own help page, **When** an agent reads its example of a "no such tool" error, **Then** the list of available tools in that example names only tools the server offers.

---

### User Story 2 - Only current tool names in guidance (Priority: P1)

An agent follows fallback or recovery advice from a description, a help page, or a validation message. Today some of that advice names a tool that no longer exists — for example, `rename` tells an agent that hits a folder separator in `name` to use `move_note`, but the tool is `move`. The agent wants every tool named in guidance to be one it can call.

**Why this priority**: Recovery advice is read at the moment a call has already failed; pointing at a non-existent tool turns one failure into two.

**Independent Test**: Collect every tool name mentioned in every tool description, parameter description, help page and validation recovery hint, and check each one against the tools the server offers.

**Acceptance Scenarios**:

1. **Given** any tool description, parameter description or help page, **When** an agent reads it, **Then** every tool it names is one the server currently offers.
2. **Given** `rename` rejects a `name` containing a folder separator, **When** the agent reads the rejection's recovery hint and `rename`'s help page, **Then** both name `move` as the tool to use, and the help page's description of the message matches the message returned.

---

### User Story 3 - Worked examples are valid calls (Priority: P1)

An agent copies a worked example from a help page and sends it as written. Today at least one example call is rejected by the server's input validation. The agent wants every example presented as a working call to be accepted.

**Why this priority**: Examples are the most-copied part of any reference; one that fails validation teaches the agent a wrong call shape.

**Independent Test**: Extract every example call from every help page and run each one through its tool's input validation without contacting Obsidian.

**Acceptance Scenarios**:

1. **Given** any worked example in any help page that is presented as a working call, **When** it is sent to the server as written, **Then** it passes input validation.
2. **Given** an example that deliberately demonstrates a rejected input, **When** an agent reads it, **Then** it is clearly labelled as a failing example and the error it shows is the error the server returns for that input.

---

### User Story 4 - Documented errors match returned errors (Priority: P2)

An agent writes error-handling code by reading a tool's help page. Today `create_base`'s help page says its oversized-content, invalid-name and invalid-path rejections carry the specific reason in `details.code` and `details.reason`, as the sibling write tools' errors do. The error the server returns carries it only as a prefix of each validation issue's message, so code that branches on the documented fields never fires. The documented shape is the one that stays: `create_base`'s returned error changes to carry it. Separately, `context_search`'s help page shows the missing-folder error with the CLI's folder text as its top-level message. The error actually returned carries the generic CLI-reported-error message at top level and the folder text in `details.message`. The help page is corrected to the returned error; the error is unchanged.

**Why this priority**: Branching on a field that is never present fails silently; the agent's error handling looks correct but does nothing.

**Independent Test**: Trigger each documented `create_base` validation rejection and the `context_search` missing-folder error, and compare each returned error, field by field, with what the help page says (and check that the short description does not contradict it).

**Acceptance Scenarios**:

1. **Given** `create_base` rejects oversized content, an invalid name, or an invalid base path, **When** the agent compares the returned error with the help page and description, **Then** the returned error is `VALIDATION_ERROR` carrying `details.code` (`CONTENT_TOO_LARGE`, `INVALID_NAME` or `INVALID_BASE_PATH`), `details.reason` where the rejection has a sub-reason (for example `empty`, `too-long`, `wrong-extension`, `path-traversal`) and `details.field`, exactly as the help page states, and nothing in the short description contradicts it.
2. **Given** a valid `create_base` input, **When** it passes validation, **Then** the call proceeds unchanged; the new error shape applies only to the three rejections.
3. **Given** a `context_search` call names a folder that does not exist, **When** the error is returned, **Then** its top-level message is exactly what `context_search`'s help page says it will be, and every details field the help page shows for that error (including `details.command: "folder"` and `details.message`) is present with the value shown.

---

### User Story 5 - Examples show current messages and vault names (Priority: P3)

An agent compares what it sees with the examples in a help page. Today some examples quote validation messages in wording the server no longer uses, or name vaults in a way that no longer matches current behaviour. The agent wants quoted messages and vault names in examples to match what the server returns today.

**Why this priority**: These mismatches mislead less than a wrong tool name or a wrong error field, but they still break string matching and erode trust in the reference.

**Independent Test**: For every example that quotes a validation message, produce the same rejection and compare the wording; for every example that shows a vault name, check it is either a clearly generic placeholder or a name consistent with the example's described behaviour.

**Acceptance Scenarios**:

1. **Given** any example that quotes a validation message, **When** the same input is sent to the server, **Then** the returned message has the wording the example shows.
2. **Given** any example that shows a vault name, **When** an agent reads it, **Then** the name and the behaviour the example describes for it match current behaviour.

---

### Edge Cases

- **Owner access settings.** With read-only mode, an allow list or a deny list in force, the server offers fewer tools than its full set. The help index is a fixed document and keeps listing the full set; it is not filtered by owner settings (see Assumptions).
- **Help for the reserved name `index`.** It stays a "no such tool" answer, unchanged.
- **Deprecated parameter names.** An example that uses a deprecated parameter name is still accepted by validation but teaches an old name; examples use the current parameter names.
- **Examples of failing calls.** Examples written to show a rejection are exempt from "passes input validation" but must be labelled as failing and must show the error actually returned.
- **Mentions of removed tools in history notes.** A help page may mention a removed tool's name only where it explicitly says the tool no longer exists (for example, a migration note); it must never recommend calling it.
- **Plugin or code identifiers that look like tool names.** Names such as a Smart Connections plugin method or a parameter name (`active_note`) are not tool names and are not affected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The help index MUST list exactly the tools the server offers in its default configuration — every offered tool once, and no tool the server does not offer.
- **FR-002**: The help pages for removed tools (`list_notes`, `search_vault`) MUST be withdrawn, so that asking for their help returns the help tool's existing "no such tool" error rather than a placeholder page.
- **FR-003**: The "no such tool" error's list of available tools MUST name only tools the server offers, and the help tool's own help page MUST show an example of that error whose list matches.
- **FR-004**: Every tool named in any tool description, parameter description, help page, or validation-message recovery hint MUST be a tool the server currently offers, except where a help page explicitly states that a named tool no longer exists.
- **FR-005**: `rename`'s folder-separator rejection MUST name `move` as the recovery tool, and `rename`'s help page MUST describe that message as returned.
- **FR-006**: Every worked example presented as a working call MUST pass its tool's input validation exactly as written, using current parameter names.
- **FR-007**: Every example that demonstrates a rejected input MUST be labelled as a failing example and MUST show the error the server returns for that input.
- **FR-008**: `create_base`'s oversized-content, invalid-name and invalid-base-path rejections MUST return `VALIDATION_ERROR` with `details.code` (`CONTENT_TOO_LARGE`, `INVALID_NAME`, `INVALID_BASE_PATH`), `details.reason` where the rejection has a sub-reason, and `details.field`, following the ADR-015 sub-discriminator convention that `prepend` and `find_and_replace` already follow. For these three rejections the top-level message becomes the validation issue's own message (for example `INVALID_NAME/empty: name is empty`) instead of the generic `create_base input failed schema validation`, as in those sibling tools. `details.issues` stays as it is today, and every other validation failure keeps the generic envelope unchanged. No new error codes are introduced. The help page MUST name `details.code`, `details.reason` and `details.field` as the fields to branch on. The short description MUST NOT contradict them, and changes only where a detail it states differs from the returned error. Each of the three rejections MUST be covered by tests, alongside a passing-input case.
- **FR-009**: `context_search`'s help page MUST show its missing-folder error exactly as returned: `CLI_REPORTED_ERROR` with the generic top-level message, `details.command: "folder"`, the CLI's `Error: Folder "…" not found.` line in `details.message`, and the other details fields the error carries. The error itself and the shared CLI layer MUST NOT change. Tests MUST pin the fields the help page tells agents to branch on (`details.command`, `details.message`) and the top-level message, with no change to production code.
- **FR-010**: Every validation message quoted in an example MUST match the wording the server returns for the same input.
- **FR-011**: Every vault name shown in an example MUST either be an evident placeholder or be consistent with the behaviour the example describes, as the server behaves today.
- **FR-012**: The project's automated checks MUST fail when a help page or help-index entry names a tool the server does not offer, or when the help index omits a tool it does offer. This complements the existing check that every offered tool has a help page, so the divergence in FR-001 cannot recur unnoticed. The new check MUST have a passing test and a failing test. It is the only permanent drift guard this feature adds: tool-name references and worked examples are verified once during implementation, and later re-checks belong to the recurring BI-0122 audit (records TC-00586, TC-00587).
- **FR-013**: Changes to tool behaviour MUST be limited to what is needed to make a documented error or message agree with its real counterpart; inputs, outputs, error codes and the tool set MUST otherwise stay unchanged.

### Key Entities

- **Help index**: the single page listing every tool with a one-line summary; returned when help is called with no tool name.
- **Help page**: one tool's long-form reference — inputs, outputs, worked examples, error table and recovery hints.
- **Tool description**: the short text published with each tool, together with the description of each of its parameters.
- **Worked example**: a call (tool name plus arguments) shown in a help page, optionally with the result or error it produces; either a working call or a labelled failing call.
- **Documented error**: an error code, details fields and message as a help page or description states them, paired with the error the server actually returns.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The set of tools in the help index equals the set of tools the server offers: 0 extra entries and 0 missing entries.
- **SC-002**: Asking for help on each removed tool name returns a "no such tool" answer in 100% of cases; 0 placeholder pages remain.
- **SC-003**: 0 references to non-existent tools remain across all tool descriptions, parameter descriptions, help pages and validation recovery hints (excluding explicit "this tool no longer exists" notes).
- **SC-004**: 100% of worked examples presented as working calls pass input validation when sent as written.
- **SC-005**: For each of `create_base`'s three documented rejection kinds and `context_search`'s missing-folder error, an agent that branches on the field or message named in the help page takes the intended branch on the first try, in 100% of trials.
- **SC-006**: 100% of quoted validation messages in examples match the returned wording character for character.
- **SC-007**: Adding a help page or index entry for a tool the server does not offer, or removing an offered tool from the index, makes the project's automated checks fail.

## Assumptions

- "The tools the server offers" means the full tool set with no owner access settings applied. The help index is a fixed document and is not filtered by read-only mode or allow and deny lists; filtering it would change the help tool's behaviour, which is out of scope.
- The removed tools are `list_notes` and `search_vault`, the two index entries with "documentation pending" placeholders and no matching tool; no other removed tool is known to appear in the index.
- The known stale tool name is the `move_note` recovery hint in `rename`'s validation message and help page. Changing that validation message is in scope because the message itself is published recovery guidance and its help page must agree with it.
- Where a documented error and its real counterpart disagree, the side that changes is decided per error (see Clarifications): for `create_base` the returned error changes to match the documented shape, and for `context_search` the help page changes to match the returned error. No new error codes are introduced in any case.
- The specific example rejected by validation, and the specific out-of-date messages and vault names, were identified during planning by checking the repository and every example against current behaviour (research F1–F5). They are confirmed against the BI-0122 audit records (TC-00586, TC-00587) at implementation, because the records could not be read at plan time. The requirements above fix the outcome, not the list.
- The server instructions published at session start already name only offered tools and are not changed, beyond keeping them consistent if a fix touches a tool they name.
- A general re-audit of every help page for other kinds of drift, and any rewrite for style or length, are out of scope; they belong to a separate recurring audit.
- Documentation outside the server's published guidance (`README.md`, `CONTRIBUTING.md`, `.docs-as-code/`) is updated by the project's normal docs-as-code pass after review, not by this feature's requirements.
