# Feature Specification: Report unknown vault

**Feature Branch**: `091-report-unknown-vault`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Report unknown vault — When an agent runs a raw editor command against a vault name the editor does not know, the call fails with the same "vault not found" error the dedicated tools return. The editor's command line reports an unknown vault as an ordinary successful output line. The dedicated tools turn that into an error, but the general-purpose command tool returns it as success, so a mistyped vault name can go unnoticed unless the agent reads the output text. Out of scope: reclassifying other unprefixed upstream messages; changing how the dedicated tools report unknown vaults."

## Context

The Obsidian command line answers a request against a vault name it does not know with a single output line, `Vault not found.`, and a successful exit status. Every dedicated tool on this server already recognises that answer and fails with a structured error: code `CLI_REPORTED_ERROR`, message `Vault not found.`, and the same text in `details.message`. The general-purpose raw command tool, `obsidian_exec`, does not: it returns the line as ordinary successful output, so an agent that only checks whether the call succeeded never learns that its vault name was wrong.

This feature brings the raw command tool in line with the dedicated tools for this one answer: the same error code and message. The raw tool recognises the answer by a stricter rule of its own (see Clarifications), so that real output from a known vault is never mistaken for it. The dedicated tools and their matching rule do not change.

## Clarifications

### Session 2026-11-02

- Q: Which raw-command outputs should the raw command tool treat as the editor's unknown-vault answer? → A: Option C. The call fails only when it names a vault and its whole output, with surrounding whitespace trimmed, is exactly `Vault not found.`; any other output succeeds, even output that starts with that line. Per BI-0173: every recorded unknown-vault answer (the BI's Status and Impact sections, and Tool Notes under "Exit-code semantics") is exactly `Vault not found.\n`, so this rule catches them all, while the "no change for real output" story rules out failing a known vault's note whose first line is that sentence. The "consistent error" story asks for the same error type and signal, not the same matching rule, so the dedicated tools keep their own start-of-output rule (changing them is out of scope).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A raw command against an unknown vault fails (Priority: P1)

An agent runs a raw command (for example `files`, `read` or `search`) and names a vault the editor does not know, perhaps because of a typo. Instead of a successful result whose output happens to say `Vault not found.`, the call fails with a clear vault-not-found error, so the agent notices the wrong vault name without having to read the output text.

**Why this priority**: This is the defect itself. A silent success on a wrong vault name can lead an agent to conclude that a vault is empty, that a note does not exist, or that a write succeeded, when nothing ran against the intended vault.

**Independent Test**: Run the raw command tool with any command and a vault name that is not registered with the editor; confirm the call fails rather than succeeds, and that the failure says the vault was not found.

**Acceptance Scenarios**:

1. **Given** a vault name the editor does not know, **When** an agent runs any raw command against it, **Then** the call fails with a vault-not-found error rather than succeeding.
2. **Given** a vault name the editor does not know, **When** the editor's answer has blank lines or whitespace before or after `Vault not found.` (for example `\nVault not found.\n`) and nothing else, **Then** the call still fails with the vault-not-found error.
3. **Given** a vault name the editor does not know, **When** the call fails, **Then** the failure still carries what the raw command tool reports today on its other failures: the command that was run, the exact arguments sent, and the editor's full output.

---

### User Story 2 - The error matches the dedicated tools' error (Priority: P1)

An agent that already handles the dedicated tools' vault-not-found error can handle the raw command tool's failure with the same code, without a special case for the raw tool.

**Why this priority**: A new error that differs from the existing one would force every agent to learn a second way of spotting the same mistake, which defeats the point of reporting it.

**Independent Test**: Call one dedicated tool and the raw command tool with the same unknown vault name; compare the error code, the message and the `details.message` value of the two failures.

**Acceptance Scenarios**:

1. **Given** the same unknown vault name, **When** the agent calls a dedicated tool and then the raw command tool, **Then** both fail with the same error code (`CLI_REPORTED_ERROR`).
2. **Given** the same unknown vault name, **When** both calls fail, **Then** both carry the same message, `Vault not found.`, both as the error message and as `details.message`.

---

### User Story 3 - Real output that mentions the phrase is not affected (Priority: P2)

An agent runs a raw command against a known vault, and the output happens to contain the words "Vault not found" somewhere inside other text (for example a search hit, a note's content, or a log line partway through the output). The call succeeds and returns that output unchanged.

**Why this priority**: A false failure would hide real results. It ranks below the defect fix because it guards against a regression rather than delivering the fix.

**Independent Test**: Run the raw command tool against a known vault where the output contains "Vault not found" after other text on the same line, or on a line after the first; confirm the call succeeds with the output returned verbatim.

**Acceptance Scenarios**:

1. **Given** a known vault whose command output contains "Vault not found" inside other text, **When** the raw command runs, **Then** the call is not treated as a failure and returns the output unchanged.
2. **Given** a known vault whose command output has some other first line and a later line reading `Vault not found.`, **When** the raw command runs, **Then** the call succeeds.
3. **Given** a known vault whose command output starts with the line `Vault not found.` and continues with more text (for example reading a note whose first line is that sentence), **When** the raw command runs, **Then** the call succeeds and returns the output unchanged.
4. **Given** a raw command that names no vault (it runs against the focused vault), **When** its output is exactly `Vault not found.`, **Then** the call succeeds, because the focused vault is always known to the editor.
5. **Given** a raw `eval` whose output includes an answer line (a line starting `=> `) and also a `Vault not found.` line printed ahead of it by another plugin, **When** the raw command runs, **Then** the call succeeds, as it does today, because the answer shows the code ran.

---

### Edge Cases

- **No vault named**: a raw command that names no vault runs against the focused vault, which the editor always knows; the unknown-vault check does not apply to it, so such a call is never failed by this feature.
- **Blocked commands**: a command refused before it runs (code-running and developer-tooling commands, while the vault owner has not allowed them) is still refused with its existing error, whatever vault it names; the vault-not-found check applies only to commands that actually ran.
- **Other failures take precedence**: a non-zero exit, a timeout, output over the size limit, a missing editor binary, a cancelled request, or an answer starting `Error:` is reported exactly as today; the vault-not-found check applies only to an answer that would otherwise be returned as success.
- **Not retried**: a vault-not-found answer is final. It does not trigger the editor start-up retry or the automatic launch, the same as for the dedicated tools.
- **Different spelling**: output that is not exactly the editor's `Vault not found.` wording (for example lower-case, or without the full stop) is not treated as an unknown vault.
- **A known vault whose output begins with the exact phrase**: if a known vault's output starts with the line `Vault not found.` and has more text after it (for example reading a note whose first line is that sentence), the raw command tool succeeds. The dedicated tools still fail on such output under their own rule; that difference is deliberate and out of scope here.
- **A known vault whose whole output is the exact phrase**: if a call names a known vault and its entire output, trimmed, is exactly `Vault not found.` (for example reading a note whose only content is that sentence), the raw command tool fails. This is the accepted limit of recognising the editor's answer by its text.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a raw command names a vault, runs to completion with a successful exit status, and its whole standard output, with leading and trailing whitespace and blank lines trimmed, is exactly the editor's unknown-vault answer `Vault not found.`, the raw command tool MUST fail the call instead of returning the output as success. A raw command that names no vault is never failed by this check.
- **FR-002**: That failure MUST use the same error code (`CLI_REPORTED_ERROR`) and the same message the dedicated tools use for an unknown vault: `Vault not found.`, as both the error message and `details.message`.
- **FR-003**: That failure MUST carry the command name, the exact arguments sent to the editor, the editor's full standard output and standard error, and the exit status, so an agent can see what was run, as the raw command tool already does for its other reported failures.
- **FR-004**: Any other output MUST still be returned as success, unchanged: output that contains the phrase after other text, on a later line, or as its first line followed by more text, and output of any kind from a call that names no vault.
- **FR-005**: For a raw `eval` whose output includes an answer line, the call MUST keep succeeding as it does today, even when a `Vault not found.` line appears ahead of the answer (such output is never exactly `Vault not found.`, so FR-001 does not apply).
- **FR-006**: The check MUST NOT change how any other answer is classified: non-zero exits, `Error:` answers, no-active-file answers, timeouts, oversize output, cancellation, missing binary and blocked commands keep their current codes, messages and precedence.
- **FR-007**: A vault-not-found failure from the raw command tool MUST NOT trigger the editor start-up retry or the automatic launch of the editor.
- **FR-008**: The dedicated tools' vault-not-found behaviour MUST stay exactly as it is today (code, message, details and their own start-of-output matching rule); the raw command tool's stricter rule applies to the raw command tool only.
- **FR-009**: The raw command tool's published description MUST list the unknown-vault answer among the failures it reports as structured errors, so an agent reading the tool list knows to expect it.

### Key Entities

- **Unknown-vault answer**: the editor's reply to a request naming a vault it does not know — output that is exactly `Vault not found.` apart from surrounding whitespace (recorded as `Vault not found.\n`), with a successful exit status.
- **Vault-not-found error**: the structured failure the server returns for that answer, identified by its code and its message; shared by the dedicated tools and, after this feature, the raw command tool.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of raw commands run against a vault name the editor does not know fail with a vault-not-found error; none is returned as success.
- **SC-002**: For the same unknown vault name, the raw command tool's failure and a dedicated tool's failure share the same error code and the same message in every case tested.
- **SC-003**: 0 raw commands against a known vault are reported as unknown-vault failures when their output contains anything besides the bare `Vault not found.` sentence, including output whose first line is that sentence; and 0 raw commands that name no vault are reported as unknown-vault failures.
- **SC-004**: An agent can detect a mistyped vault name from the call's success or failure alone, without reading the output text, in every case covered by the acceptance scenarios.
- **SC-005**: Every existing behaviour of the dedicated tools and every other failure the raw command tool reports is unchanged, as shown by the existing test suite passing without edits to its expectations.

## Assumptions

- The editor gives the same answer, exactly `Vault not found.\n` with a successful exit status and nothing else on standard output, for every command run against an unknown vault, as recorded in BI-0173 and in Tool Notes under "Exit-code semantics". This is confirmed against a live editor during implementation; if a command's unknown-vault answer turns out to carry extra output, it is not caught by this rule, and that is reported rather than widening the rule silently.
- "The same error type and signal" in the request means the same error code and the same message (`CLI_REPORTED_ERROR`, `Vault not found.`). The raw command tool's failure may carry extra context the dedicated tools' does not (such as the exact arguments sent), because the raw tool already includes it on every other failure; that extra context is not a difference in the error itself.
- "Inside other text" means any output that holds anything besides the bare sentence, including output whose first line is the sentence. Only a known vault whose entire output is the bare sentence is indistinguishable from the editor's answer by text alone; that case fails, as the accepted limit.
- The matching rule is deliberately stricter than the dedicated tools' start-of-output rule; "consistent error" covers the error code and message, not the matching rule.
- No new error code is introduced; the feature reuses the existing `CLI_REPORTED_ERROR` code.
- Reclassifying other unprefixed messages from the editor, and any change to how the dedicated tools report an unknown vault, are out of scope.
