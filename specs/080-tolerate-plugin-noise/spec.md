# Feature Specification: Tolerate plugin noise

**Feature Branch**: `080-tolerate-plugin-noise`
**Created**: 2026-11-01
**Status**: Draft
**Input**: User description: "Tolerate plugin noise — every capability that runs a query inside Obsidian returns its normal result even when other Obsidian plugins print their own messages into the same output, so a successful operation is always reported as successful."

## Context

Many typed capabilities do their work by running a short query inside Obsidian (the eval-composed cohort: for example `links`, `backlinks`, `open_file`, `get_active_file`, `paths`, `tag`, `find_by_property`, `pattern_search`, `read_heading`, `query_base`, `views_base`, `write_note`, `find_and_replace`, `set_property` in active mode, and the two Smart Connections capabilities). Obsidian answers on the same output channel that every installed plugin can also print to. The answer is one line that begins with the eval answer marker (`=> `), followed by the query's result.

Plugins print status, warning and start-up lines at moments the server does not control, most often right after Obsidian has started or recovered. When such a line arrives ahead of the answer:

- Most of the cohort expect the answer to be the very first thing in the output, so they report a parse failure although the operation succeeded inside Obsidian.
- One capability (`smart_connections_query`) already copes, because its own plugin is known to print lines ahead of the answer, intermittently; it looks for the last answer marker instead of the first.
- The cold-start recognition in the dispatch layer expects the cold-start signature (`Error: Command "…" not found.`) at the very start of the output, so a plugin start-up line printed ahead of it hides the cold start and the single recovery retry never fires.

Agents that receive a false parse failure retry needlessly or, worse, conclude that a change which did happen did not.

The owner has already ruled on the recognition rules for this work in the 2026-11-01 amendment to ADR-029 (Retry Once on Cold-Start Vault-Launch Failure), BI-0135. In summary: for query (`eval`) output only, an answer present anywhere in the output wins over any error line; for a typed capability the answer is the one carrying that call's own identification, so plugin look-alikes do not count; with no answer, an error line at the start of any line is recognised (a cold-start line triggers the existing single retry, and the no-active-file line maps to the existing no-active-file error); every other command keeps today's start-anchored rule. This specification states the user-visible outcomes of that ruling; it does not reopen it.

## Clarifications

### Session 2026-11-01

- Q: When a tool fails to read Obsidian's answer, how much of the raw output should its error include? → A: Option C. One shared limit across the whole cohort, the active-mode focused-file path included. Short output goes in whole. Long output goes in as its first 500 and last 500 characters with a visible cut marker between them, and the error also records the total output length. Rationale: the operator story needs the output that could not be understood, and head plus tail keeps both the plugin noise and the region where the answer was expected, which a head-only slice loses. Principle IV keeps the cause "where safe", so the error must not carry output up to the full capture cap.
- Q: When a call succeeds even though plugin output had to be skipped, should the server write anything to its stderr log? → A: Option A. Log nothing new. Skipping plugin output on a successful call stays silent; failures keep reporting through the error with its raw-output excerpt, and retries through the existing retry event. Rationale: the output channel is treated as noisy and the answer is extracted silently, per-plugin detection or handling is out of scope, and the logger covers only the failure lifecycle, which a successful skip is not. (The 2026-10-31 re-validation found the Smart Connections noise intermittent, not on every call; this does not change the answer.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Success despite noise before the answer (Priority: P1)

An agent calls any capability in the cohort while a plugin prints one or more lines just before Obsidian's answer. The agent receives exactly the result it would have received with no plugin output.

**Why this priority**: This is the reported failure: a successful operation reported as a parse failure. It drives false retries and false "the change failed" conclusions, and it affects most of the cohort.

**Independent Test**: For each capability in the cohort, simulate output in which one line, then several lines, of arbitrary plugin text precede the answer; confirm the returned result is identical to the result for the same answer with no preceding text.

**Acceptance Scenarios**:

1. **Given** a plugin prints one line before a cohort capability's answer, **When** the call completes, **Then** the agent receives the same result it would have received with no plugin output.
2. **Given** a plugin prints several lines (including blank lines and lines that begin with `Error:` or `[warn]`) before the answer, **When** the call completes, **Then** the agent receives the normal result.
3. **Given** the same noise, **When** each capability in the cohort is called in turn, **Then** every one of them handles it the same way, with no capability still reporting a parse failure.
4. **Given** no plugin output at all, **When** any cohort capability is called, **Then** its result and errors are unchanged from today.

---

### User Story 2 - Cold start succeeds first time (Priority: P1)

An agent opens a note (or makes any other cohort call) right after the server has started Obsidian, while plugins print their start-up messages. The call reports success, recovering through the existing single retry if Obsidian was not yet ready.

**Why this priority**: Cold start is when plugin start-up noise is most likely, and it is the moment an agent is recovering from Obsidian being closed. A false failure here defeats the existing cold-start recovery.

**Independent Test**: Simulate a first attempt whose output is plugin start-up lines followed by the cold-start signature, and a second attempt that returns a normal answer; confirm the call succeeds after exactly one retry. Then simulate a first attempt with start-up lines followed by a normal answer; confirm success with no retry.

**Acceptance Scenarios**:

1. **Given** Obsidian has just been started by the server and a plugin prints start-up messages, **When** the agent opens a note, **Then** the call reports success.
2. **Given** a query's first attempt prints plugin lines and then the cold-start signature, **When** the call runs, **Then** the existing single retry fires exactly once, and the retry's outcome is the final result.
3. **Given** a query's output contains both an answer and an error-looking line printed by a plugin, **When** the call completes, **Then** the answer wins and the call is a success, with no retry.
4. **Given** a non-query command's output begins with plugin lines followed by a cold-start-looking line, **When** the call completes, **Then** behaviour is unchanged from today (the widened recognition applies to query output only).

---

### User Story 3 - Genuine failures still reported, with the raw output (Priority: P2)

An operator diagnosing a real failure receives a parse error that includes the raw output that could not be understood, so they can see what Obsidian and the plugins actually printed.

**Why this priority**: Tolerance must never turn a real failure into a silent success or an empty result. The raw output is what makes a real failure diagnosable.

**Independent Test**: Simulate outputs with no answer at all, with an answer whose body is not valid, and with only plugin text; confirm each yields the capability's existing parse error carrying the raw output, and none yields a success or an empty result.

**Acceptance Scenarios**:

1. **Given** the output contains no recognisable answer at all, **When** the call completes, **Then** the agent receives a parse error that includes the raw output.
2. **Given** the output contains an answer whose body cannot be understood, **When** the call completes, **Then** the agent receives a parse error that includes the raw output, including any plugin lines around it.
3. **Given** the output has no answer and a line (not necessarily the first) reports that no file is active, **When** the call completes, **Then** the agent receives the existing no-active-file error, not a parse error.

---

### User Story 4 - The capability's own answer, not a look-alike (Priority: P2)

A plugin prints text that is itself formatted like an Obsidian answer, before or after the real one. The capability returns its own answer, never the plugin's.

**Why this priority**: Picking the wrong answer would be worse than failing: it would return plausible but wrong data, or report a change that did not happen.

**Independent Test**: Simulate outputs in which a plugin line formatted as an answer (marker plus valid-looking result) appears before, and separately after, the capability's real answer; confirm the real answer is returned in both cases.

**Acceptance Scenarios**:

1. **Given** plugin text that itself looks like an answer appears before the capability's answer, **When** the call completes, **Then** the capability's own answer is the one returned.
2. **Given** plugin text that looks like an answer appears after the capability's answer, **When** the call completes, **Then** the capability's own answer is the one returned.
3. **Given** the output contains plugin answer look-alikes but not the capability's own answer, **When** the call completes, **Then** the agent receives a parse error that includes the raw output, not the look-alike's content.

---

### User Story 5 - Noise after the answer (Priority: P3)

A plugin prints a line after the capability's answer. The agent receives the normal result, or, if the answer cannot be identified safely, a clear parse error that includes the raw output.

**Why this priority**: Observed noise so far arrives before the answer; trailing noise is plausible but rarer. The requirement is that it never produces a wrong result.

**Independent Test**: Simulate output in which one or more lines follow the answer on later lines; confirm the normal result. Simulate output in which trailing text makes the answer impossible to identify safely; confirm a parse error with the raw output.

**Acceptance Scenarios**:

1. **Given** a plugin prints a line after the capability's answer, **When** the call completes, **Then** the agent receives the normal result.
2. **Given** trailing plugin output that makes the answer impossible to identify safely, **When** the call completes, **Then** the agent receives a clear parse error that includes the raw output, never a guessed result.

---

### User Story 6 - Works with any plugin (Priority: P3)

A user installs, removes or updates any mix of plugins, including ones the server has never seen. The behaviour above holds with no setting for any particular plugin.

**Why this priority**: The set of plugins and what they print is outside the server's control; any per-plugin rule would break with the next plugin.

**Independent Test**: Run the Story 1 and Story 4 tests with arbitrary, randomly composed plugin text (not drawn from any known plugin) and confirm the same outcomes; confirm no configuration names any plugin.

**Acceptance Scenarios**:

1. **Given** any plugin, including one the server has never seen, prints arbitrary text, **When** the call completes, **Then** the behaviour is the same as for the plugins observed so far.
2. **Given** a fresh installation with default settings, **When** plugin noise occurs, **Then** it is tolerated with no plugin-specific setting.

### Edge Cases

- Noise that contains the answer marker inside a line rather than at its start: it is not treated as an answer.
- Noise printed on the same line as the answer, with no line break between them: the answer cannot be identified safely, so the call fails with a parse error that includes the raw output.
- An answer whose result is empty, `null`, `false` or an empty list, surrounded by noise: returned exactly as it would be without noise; never confused with "no answer".
- Output that is entirely blank lines plus noise: parse error with the raw output.
- Very large noise ahead of the answer: the answer is still found. If the call fails anyway, the error carries the first 500 and last 500 characters with a cut marker and the total output length (FR-013), so both the noise and the region where the answer was expected are visible.
- Output of exactly 1,000 characters: carried whole, with no cut marker; 1,001 characters: carried as head, cut marker, tail.
- Line-ending differences (`\n` versus `\r\n`) between Obsidian and plugins: tolerated the same way.
- A query whose answer reports a capability-level failure (for example file not found) surrounded by noise: the capability's normal typed error is returned, not a parse error.
- `obsidian_exec` running a query (only when the vault owner has allowed it): its raw output is returned unchanged as today; the dispatch-level rules (answer wins over error lines, cold-start recognition at any line) apply to it because they key on the command.
- A mutating capability (for example `write_note` or `find_and_replace` with commit) whose change succeeded while noise was printed: reported as success, so the agent does not repeat the change.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every capability in the eval-composed cohort MUST return the same result for an answer preceded by any amount of arbitrary plugin output as it returns for that answer alone.
- **FR-002**: All capabilities in the cohort MUST apply one shared rule for finding their answer in the output, so the same noise produces the same handling in every capability; `smart_connections_query`'s existing tolerance MUST be brought under the same rule without losing it.
- **FR-003**: A typed capability MUST distinguish its own answer from plugin text, including plugin text formatted exactly like an answer, and MUST return only its own answer.
- **FR-004**: Output lines that follow the capability's answer MUST NOT change the result when the answer can be identified safely; when it cannot, the capability MUST fail with its existing parse error rather than guess.
- **FR-005**: When the output contains no answer belonging to the call, or the answer's body cannot be understood, the capability MUST fail with its existing parse-failure error, and that error MUST include the raw output under the shared excerpt rule (FR-013). The capability MUST NOT return a success, an empty result or a default value in that case.
- **FR-006**: For query output only, an answer present anywhere in the output MUST take precedence over any error-looking line, so the call is classified as a success.
- **FR-007**: For query output with no answer, an error line MUST be recognised at the start of any line, not only at the start of the output: the cold-start signature MUST trigger the existing single cold-start retry (still exactly one, still in the dispatch layer), and the no-active-file line MUST map to the existing no-active-file error.
- **FR-008**: Every command other than the query command MUST keep today's start-of-output recognition unchanged.
- **FR-009**: The tolerance MUST work for any plugin and any text, with no plugin-specific setting, list, pattern or configuration.
- **FR-010**: When no plugin output is present, every capability's results, errors and published shapes MUST be unchanged, with two exceptions. (a) Parse-failure errors carry the raw-output excerpt and recorded length of FR-013. (b) The query text sent to Obsidian now carries the call's own answer identification (FR-003). That identification is therefore visible wherever an error already echoes the sent command (its argument list) or the raw output; no error gains or loses a field because of it.
- **FR-011**: The change MUST NOT add a new top-level error code or a new error sub-discriminator; every failure MUST continue to classify through the existing codes.
- **FR-012**: `obsidian_exec` MUST keep returning its raw output unchanged; it gains only the dispatch-level recognition of FR-006 and FR-007 when the command it runs is the query command.
- **FR-013**: Every parse-failure error in the cohort, the active-mode focused-file resolution included, MUST carry the raw output under one shared excerpt rule. Output of at most 1,000 characters goes in whole. Longer output goes in as its first 500 and last 500 characters, joined by a visible cut marker. The error MUST also record the total length of the output. No parse-failure error may carry more than this excerpt.
- **FR-014**: Skipping plugin output on a call that succeeds MUST be silent: the change MUST NOT add a log event, and MUST NOT log the skipped text or counts of it. Failures report through their error (FR-005, FR-013), and a cold-start retry through the existing retry log event.

### Key Entities

- **Output**: everything Obsidian printed for one call, made of lines from Obsidian and from any installed plugin, in any order.
- **Answer**: the single line Obsidian prints for the call's query, beginning with the answer marker and carrying the query's result; for a typed capability it is identifiable as belonging to that specific call.
- **Plugin noise**: any other line in the output, including lines that look like errors or like answers.
- **Eval-composed cohort**: the typed capabilities whose work runs as a query inside Obsidian; the exact inventory is pinned during planning.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For 100% of cohort capabilities, a successful operation with one or more noise lines before the answer is reported as a success with a result identical to the no-noise result.
- **SC-002**: 0 capabilities in the cohort report a parse failure for output whose only difference from a valid response is added plugin lines on their own lines.
- **SC-003**: A cold-start call with plugin start-up lines ahead of the cold-start signature succeeds after at most one retry in 100% of simulated cases.
- **SC-004**: In 100% of cases where plugin text formatted as an answer appears alongside the real answer, the real answer is returned.
- **SC-005**: 100% of genuine parse failures carry the raw output, and 0 produce a success or an empty result.
- **SC-006**: Every existing test that runs without plugin output passes unchanged, except assertions on the parse-error raw-output excerpt, which move to the FR-013 rule.
- **SC-007**: 0 plugin-specific settings or rules exist after the change.

## Assumptions

- The recognition rules are those the owner ruled in the 2026-11-01 amendment to ADR-029 (BI-0135); this specification does not revisit them.
- Obsidian prints a query's answer as a single line beginning with the answer marker; plugins print whole lines of their own. Text interleaved within the answer's own line is treated as unidentifiable (parse error), not repaired.
- "Includes the raw output" means the shared head-plus-tail excerpt of FR-013, never an unbounded copy. Parse errors for long output therefore change shape slightly (cut marker, total length) even without plugin noise. This is one of the two deliberate exceptions to "no change when no plugin output is present" (FR-010 (a)); short-output errors are unaffected apart from the recorded length. The other exception is the answer identification visible in errors that echo the sent command (FR-010 (b)).
- Real query output always carries the answer marker. The current fallback, which parses the whole output when no marker is present, is therefore dropped: output without an answer belonging to the call is a parse failure (FR-005). This changes nothing for any output Obsidian actually produces.
- The cohort is every typed capability that runs a query inside Obsidian; capabilities that run only other Obsidian commands are out of scope except where FR-008 requires them to stay unchanged.
- Out of scope: stopping, detecting or filtering specific plugins' messages or any per-plugin handling; the size limit on text sent to Obsidian and other input-encoding concerns; capabilities that do not run a query inside Obsidian; changing what any capability returns when no plugin output is present.
