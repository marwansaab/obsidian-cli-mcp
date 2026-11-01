# Feature Specification: Tolerate plugin noise

**Feature Branch**: `080-tolerate-plugin-noise`

**Created**: 2026-11-01

**Status**: Draft

**Input**: User description: "Tolerate plugin noise — every capability that runs a query inside Obsidian returns its normal result even when other Obsidian plugins print their own messages into the same output, so a successful operation is always reported as successful."

## Context

Several capabilities answer a request by running a small query inside the running Obsidian application and reading the query's answer back from Obsidian's command-line output. Other Obsidian plugins write to that same output. Some of them print status or start-up lines at moments the server cannot predict, most often just after Obsidian starts or recovers.

Today the in-Obsidian query capabilities expect the answer to be the first thing in the output. When a plugin line arrives first, they report a parse failure even though the query ran and, for editing capabilities, the change was applied. One capability, the semantic text search (`smart_connections_query`), already finds its answer after preceding plugin lines, because the Smart Connections plugin always prints such lines during that search. The others do not.

The affected capabilities are those that read an in-Obsidian query's answer:

- Reading and navigation: `read_heading`, `links`, `backlinks`, `get_active_file`, `open_file`.
- Search and metadata: `paths`, `pattern_search`, `find_by_property`, `tag`, `smart_connections_query`, `smart_connections_similar`.
- Bases: `views_base`, `query_base`.
- Editing: `set_property`, `find_and_replace`.
- The focused-note lookup that file capabilities run when called in active mode (for example `read`, `write_note`, `append_note`, `prepend`, `patch_heading`, `patch_block`), and the focused-vault lookup that `find_and_replace` and `query_base` run.

- The post-write metadata refresh that the write capabilities run, which reads an in-Obsidian query's answer. It is best effort and logs a mismatch rather than failing the call.

Capabilities that only run a plain Obsidian command and read its text output are not in scope.

The general escape-hatch command capability (`obsidian_exec`) keeps its answer handling unchanged: it sends the agent's code as given and returns the output verbatim. An `eval` run through `obsidian_exec` does inherit FR-011's error recognition. The reason is that the ADR-029 retry covers both entry points, and the 2026-11-01 ruling scopes that change by command (`eval`), not by tool.

## Clarifications

### Session 2026-11-01

- Q: When a plugin prints text after a capability's answer, should the capability still return its normal result, or report a parse error with the raw output? → A: Option A — the answer is read only up to the end of the line that carries the answer marker; later lines that carry no answer marker are ignored and the agent receives the normal result. Every affected capability, including the semantic text search, follows this one rule.
- Q: When plugin lines come before one of Obsidian's own error messages (including the "command not found" message Obsidian prints while it is still starting up), should the server still recognise that error, and the start-up retry it triggers, for the capabilities that run a query inside Obsidian? → A: Option B, as ruled by the owner (an amendment to ADR-029 dated 2026-11-01). The widened recognition applies only to the output of in-Obsidian queries (the `eval` command). If that output contains an answer, the answer wins over any `Error:` line. With no answer present, an `Error:` message at the start of any line is recognised: a start-up `Command "…" not found.` line triggers the existing single ADR-029 retry, and `No active file` maps to `ERR_NO_ACTIVE_FILE`. All other commands keep today's rule, where the error must be at the start of the output. The retry stays single and bounded. No new top-level error codes and no new `details.reason` values are added. Rationale: the cold-start acceptance criterion in BI-0135 needs it, ADR-029 rejects per-tool retries, and Constitution Principle IV holds because genuine errors still come through intact.
- Q: When the raw output attached to a parse error is longer than the size limit, should the error keep only the start of the output as it does today, or also keep its end, where Obsidian prints the answer or its own message? → A: Option B. `details.stdout` and the error message keep exactly today's content and limits. When the raw output is longer than the capability's limit, the error also carries the last part of the output, within the same limit, in one extra detail field that every affected capability shares. Capabilities that already attach the full output without a limit are unchanged.
- Analyze-time ruling (owner): Should plugin text that looks like an answer be handled only before the answer, or wherever it appears? → In every position, before or after the answer, and the criterion stays a testable requirement, not an accepted risk. Answer A above only made lines *without* a marker ignorable; it never extended to look-alike marker lines. The capability's own answer must be told apart from look-alikes. If no reliable way exists, the work stops and returns to the owner. The same ruling records two scope points. First, `obsidian_exec` answer handling stays unchanged, while an `eval` run through it inherits FR-011. Second, FR-010 is merged into FR-013.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Success reported despite preceding plugin output (Priority: P1)

An agent calls any affected capability while a plugin happens to print one or more lines into the output before the capability's answer. The agent receives exactly the result it would have received if no plugin had printed anything.

**Why this priority**: This is the false-failure defect itself. A successful edit reported as a failure leads agents to retry (and possibly apply a change twice) or to tell the user that a change failed when it did not.

**Independent Test**: For each affected capability, feed it output consisting of one or more arbitrary plugin lines followed by a valid answer, and confirm the returned result is identical to the result for the valid answer alone.

**Acceptance Scenarios**:

1. **Given** a plugin prints one line before the capability's answer, **When** the call completes, **Then** the agent receives the same result it would have received with no plugin output.
2. **Given** a plugin prints several lines (including blank lines and lines that contain brackets, colons or other punctuation) before the answer, **When** the call completes, **Then** the agent receives the same result it would have received with no plugin output.
3. **Given** the same preceding plugin output, **When** each affected capability is called in turn, **Then** every one of them returns its normal result; none reports a parse failure.
4. **Given** the answer itself reports a failure the capability knows about (for example "note not found" or "no note focused"), **When** plugin lines precede it, **Then** the agent receives that same specific failure, not a parse failure.

---

### User Story 2 - Opening a note right after Obsidian starts (Priority: P1)

An agent opens a note at a moment when the server has just started Obsidian (or Obsidian has just recovered), and plugins are printing their start-up messages. The call reports success on the first attempt.

**Why this priority**: Cold start is when plugin start-up messages are most likely, and opening a note is the usual first action of a recovery. A false failure here makes recovery itself look broken.

**Independent Test**: Simulate the server starting Obsidian, with plugin start-up lines appearing ahead of the open-note answer, and confirm the open-note call reports success with its normal result.

**Acceptance Scenarios**:

1. **Given** Obsidian has just been started by the server and a plugin prints start-up messages ahead of the answer, **When** the agent opens a note, **Then** the call reports success with the normal open-note result.
2. **Given** the same cold start, **When** the server's existing start-up recovery steps run before the answer is returned, **Then** those steps behave as they do today without plugin output, and the final answer is still identified correctly.
3. **Given** Obsidian is still loading its commands and prints its start-up "command not found" message after one or more plugin lines, with no answer in the output, **When** the agent opens a note, **Then** the server runs its existing single start-up retry, and the agent receives the outcome of that retry (success once Obsidian is ready).
4. **Given** plugin lines come before Obsidian's "no active file" message, with no answer in the output, **When** an affected capability is called in active mode, **Then** the agent receives the no-active-file error, not a parse failure.
5. **Given** a plugin prints a line that starts with `Error:` before a valid answer, **When** the call completes, **Then** the answer wins and the agent receives the normal result.

---

### User Story 3 - Genuine failures still reported, with the raw output (Priority: P2)

When the output contains no recognisable answer at all, the agent receives a parse failure, and an operator investigating it can see the raw output that could not be understood.

**Why this priority**: Tolerating noise must not hide real failures. The raw output is what lets an operator tell a genuine Obsidian problem from an unexpected plugin message.

**Independent Test**: Feed each affected capability output that contains only plugin lines and no answer, and confirm the result is a parse failure whose details include the raw output.

**Acceptance Scenarios**:

1. **Given** the output contains no recognisable answer, **When** the call completes, **Then** the agent receives a parse failure that includes the raw output.
2. **Given** plugin text that itself looks like an answer appears before the capability's own answer, after it, or both, **When** the call completes, **Then** the capability's own answer is the one returned, never the plugin's.
3. **Given** plugin text that looks like an answer appears and the capability's own answer is missing, **When** the call completes, **Then** the agent receives a parse failure that includes the raw output, never a result built from the look-alike.
4. **Given** the output contains something in the answer position that cannot be understood as an answer, **When** the call completes, **Then** the agent receives a parse failure that includes the raw output, never a result built from plugin text.

---

### User Story 4 - Output after the answer (Priority: P2)

A plugin prints a line after the capability's answer. The answer ends at the end of its own line, so the trailing line is ignored and the agent receives the normal result.

**Why this priority**: Less common than preceding output, but the same rule must hold: never a wrong result, and never an unexplained failure.

**Independent Test**: Feed each affected capability a valid answer followed by one or more plugin lines that carry no answer marker, and confirm every capability returns the normal result.

**Acceptance Scenarios**:

1. **Given** a plugin prints one or more lines after the capability's answer, **When** the call completes, **Then** the agent receives the normal result.
2. **Given** the same trailing output, **When** each affected capability is called, **Then** every one of them returns its normal result.
3. **Given** plugin lines both before and after the answer, **When** the call completes, **Then** the agent receives the normal result.

---

### User Story 5 - Works whatever plugins are installed (Priority: P2)

A user with any mix of plugins, including plugins the server has never seen, gets the behaviour above without configuring anything for their particular plugins.

**Why this priority**: Which plugins are installed, and what they print, is outside the server's control. Any per-plugin approach breaks the next time a plugin is installed, updated or removed.

**Independent Test**: Feed the affected capabilities preceding lines of arbitrary invented text, unlike any plugin message observed so far, and confirm the outcome matches the outcome for observed plugin messages, with no setting changed.

**Acceptance Scenarios**:

1. **Given** any plugin, including one the server has never seen, prints arbitrary text, **When** the call completes, **Then** the behaviour is the same as for the plugins observed so far.
2. **Given** a fresh installation with default settings, **When** plugin output appears, **Then** no plugin-specific setting is needed for the behaviour above.

---

### Edge Cases

- **No plugin output**: every affected capability returns exactly what it returns today, byte for byte, including its error results. The only exception is the added end-of-output field on parse failures whose raw output is longer than the limit (FR-014).
- **Blank or whitespace-only lines before the answer**: treated like any other preceding plugin output.
- **Plugin output that imitates the answer format, in any position**: the capability's own answer is the one used. It is recognised by a per-call marker that the server chooses and no plugin can know, not by its position (FR-003).
- **Two different answers both carrying this call's marker** (never observed): a parse failure with the raw output, never a guess.
- **Answer text that itself contains line breaks or answer-like text inside a value** (for example a note whose content contains such text): the answer is still read whole; content inside the answer is never mistaken for a separate answer.
- **Very long plugin output ahead of the answer**: the answer is still found. If a parse failure occurs, its existing raw-output excerpt (the start of the output) is unchanged. Because the output is longer than the limit, the failure also carries the end of the output, within the same limit, so the operator sees the part that could not be understood (FR-014).
- **Raw output within the limit**: the parse failure is exactly as it is today, with no extra end-of-output field.
- **Output that is entirely plugin text**: a parse failure with the raw output (Story 3).
- **Plugin lines before Obsidian's own error message, with no answer**: recognised as that error, as if the message began the output (FR-011). A start-up "command not found" message triggers the one existing retry. If the retry fails the same way, its error is the final outcome; there is no second retry.
- **A plugin line starting with `Error:` together with a valid answer**: the answer wins and the normal result is returned (FR-011).
- **Commands that are not in-Obsidian queries** (for example reading a note's raw text, whose content may contain a line starting with `Error:`): error recognition is unchanged, and only an error at the start of the output counts (FR-012).
- **The semantic text search capability**: keeps its current tolerance, and follows the same shared rule as every other affected capability.
- **Output with no answer from this call** (including output that holds only a look-alike): a parse failure with the raw output. Real Obsidian output always carries the call's answer when the query ran, so results without plugin output do not change (FR-008).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every affected capability MUST return the same result for output that has plugin lines before its answer as it returns for the answer alone.
- **FR-002**: All affected capabilities MUST identify their answer by one shared rule, so that the same output produces the same identification outcome in every one of them.
- **FR-003**: When plugin text that looks like an answer appears anywhere in the output (before the capability's own answer, after it, or both), the capability MUST use its own answer and MUST NOT build a result from the plugin text. The capability's own answer MUST be told apart from look-alikes by something no plugin can know, not by its position. When only look-alikes are present, the capability MUST return a parse failure with the raw output.
- **FR-004**: The answer MUST be read only up to the end of the line that carries the capability's own answer. Every other line MUST be ignored, whether it is a plain plugin line or a look-alike answer line, and the capability MUST return its normal result. It MUST NOT build any part of the result from any other line.
- **FR-005**: When the output contains no recognisable answer, the capability MUST return a parse failure that includes the raw output, using the same error code and failure stage it uses today for unparseable output.
- **FR-006**: The answer-identification rule MUST NOT depend on which plugins are installed or on the content of any plugin's messages, and MUST NOT require any per-plugin setting.
- **FR-007**: Opening a note immediately after the server has started Obsidian MUST report success when the only difference from a normal call is plugin start-up output ahead of the answer.
- **FR-008**: When no plugin output is present, every affected capability MUST return exactly what it returns today, for both results and errors. The one exception: a parse failure whose raw output is longer than the excerpt limit also carries the end-of-output field (FR-014). This only adds a field, and every existing field keeps its current content.
- **FR-009**: Failures the capability's answer itself reports (for example "note not found", "no note focused", "plugin not ready") MUST still be reported as those specific failures when plugin lines precede the answer.
- **FR-010**: *(Merged into FR-013 at analyze time, 2026-11-01. The ID is kept so references stay stable.)*
- **FR-011**: For the output of in-Obsidian queries only, when the output contains no answer, an Obsidian error message at the start of any line MUST be recognised as that error, exactly as it is today when it begins the output. A start-up "command not found" message MUST trigger the existing single, bounded start-up retry (no second retry is added), and a "no active file" message MUST map to the existing no-active-file error. When the output contains an answer, the answer MUST win over any line that looks like an error.
- **FR-012**: Every command other than an in-Obsidian query MUST keep today's error recognition unchanged, where an Obsidian error message is recognised only at the start of the output.
- **FR-013**: The change as a whole MUST add no new top-level error codes and no new error-detail reason values; every failure continues to classify through the existing error set (this absorbs the former FR-010). Errors recognised by the widened recognition keep the code, details and raw output they carry today.
- **FR-014**: When an affected capability returns a parse failure and the raw output is longer than the excerpt limit that capability already applies, the failure MUST also carry the last part of the raw output, no longer than that same limit, in one detail field that has the same name in every affected capability. The existing raw-output excerpt and the error message MUST keep exactly their current content and limits. When the raw output fits within the limit, or the capability already attaches the full output without a limit, the extra field MUST NOT be added.
- **FR-015**: Each affected capability MUST have tests showing its normal result with preceding plugin lines, and its parse failure with raw output when no answer is present.

### Key Entities

- **Command output**: everything Obsidian's command line printed for one call. May contain plugin lines, the capability's answer, or both, in any order.
- **Answer**: the value the capability's in-Obsidian query produced, printed by Obsidian on one marked line that also carries a per-call marker chosen by the server. This is the canonical term. The owner's ruling in Clarification Q2 calls it the "answer envelope", which means the same thing.
- **Look-alike**: plugin text in the answer line's format that does not carry this call's marker.
- **Plugin noise**: any text in the command output that is not the answer, from any plugin, in any format.
- **Parse failure**: the error a capability returns when it cannot identify or understand an answer. It carries the raw command output for diagnosis: the start of the output, as today, and, when the output is longer than the limit, also the end of the output.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every affected capability, a call whose output has one or more plugin lines before a valid answer returns the normal result in 100% of tested cases (zero false parse failures).
- **SC-002**: For every affected capability, the result for output with preceding plugin lines is identical to the result for the same answer without them in 100% of tested cases.
- **SC-003**: Opening a note right after the server starts Obsidian, with plugin start-up messages present, succeeds on the first call.
- **SC-004**: 100% of parse failures returned by affected capabilities include the raw command output. When the output is longer than the limit, 100% of them also include its end.
- **SC-005**: Zero plugin-specific settings or plugin-specific handling exist; behaviour with invented, never-seen plugin text matches behaviour with observed plugin text in every tested case.
- **SC-006**: With no plugin output, every existing test of the affected capabilities passes unchanged. The only allowed exception is an exact-match check on a parse failure whose raw output is longer than the limit, which may need the added end-of-output field (FR-014).
- **SC-007**: When plugin lines precede Obsidian's start-up "command not found" message in in-Obsidian query output, exactly one retry runs in 100% of tested cases, never more. Error recognition for every other command is unchanged in 100% of existing tests.

## Assumptions

- Plugin lines can appear anywhere in the output, including after the answer, and can imitate the answer line. Position therefore does not identify the answer. A per-call marker that the server chooses, and that Obsidian prints as part of the answer, does (FR-003). The plan's first step is a live check that confirms how Obsidian prints that marker. If no printed form keeps it reliably, the work stops and returns to the owner; the criterion is not weakened.
- An answer is printed as a single unit on one line. Values inside it (such as note content) cannot break it into a separate answer line, so the end of that line is a safe end for the answer. When the text on that line cannot be understood as an answer, the capability returns a parse failure with the raw output (FR-005). Returning a wrong result is never acceptable.
- The raw output attached to a parse failure keeps whatever length bound each capability already applies; this feature does not change those bounds. It only adds the end-of-output field when the output is longer than the bound (FR-014).
- The server's existing cold-start recovery (a single retry when Obsidian reports a command as not yet available, and the outer recovery that starts Obsidian when it is not running) keeps its shape and bounds. The only change, for in-Obsidian query output only, is that its start-up message is recognised after preceding plugin lines too (FR-011). The authority is the ADR-029 amendment of 2026-11-01. The outer not-running recognition already finds its message anywhere in the output and is unchanged.
- Capabilities that do not run an in-Obsidian query are out of scope, as are the size limit on text sent to Obsidian and other input-encoding concerns. The escape-hatch command capability keeps its answer handling unchanged; it inherits only FR-011's error recognition for `eval` (see Context).
