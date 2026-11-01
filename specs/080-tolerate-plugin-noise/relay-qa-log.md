# Relay Q&A log: speckit

Run `obsidian-cli-mcp-bi-0135-dry-2026-11-01`, started 2026-11-01T04:07:31.203Z.

## 1. checks / preflight (2026-11-01T04:07:31.249Z)

**Question (verbatim):**

> Preflight for this Relay run of job BI-0135. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0135 in the vault.
> 3. Its `initiative` must refer to "Obsidian CLI MCP". It is usually a wikilink, such as "[[Obsidian CLI MCP]]".
> 4. Its `status` must not mean the work is finished or abandoned (for example shipped, done, cancelled, superseded). Any other status (planned, in-flight, deferred and so on): report it and carry on.
> 5. It must have a "/speckit-specify prompt" section, and the command at the start of that prompt must be exactly `/speckit-specify` (the dash form). Don't change the note.
> 6. If you haven't already in this conversation, load the clarify skill with the Skill tool, using the reference "<id> - <title>" from the note. It may be listed as `speckit-clarify-skill` or `anthropic-skills:speckit-clarify-skill`. Follow its answering rules for every question that follows. If you can't load it, follow the answer format in your role instead, and say so in the summary; don't escalate for that.
>
> Answer with a short readiness summary: the vault id, the note's path, title and status, and the result of each check.
> Escalate if a check fails, with at most 2 short choices (Relay adds "Stop the run" as a third):
> - `ungrounded`: the vault identity doesn't match, or the note or its specify-prompt section is missing. Choices: "Fixed: check again".
> - `scope`: the note belongs to another initiative, or its status says the work is finished. Choices: "Run it anyway", "Fixed: check again".
> - `conflict`: the command isn't `/speckit-specify` (for example the older `/speckit.specify`). Say that the owner should change the note's command to `/speckit-specify`. Choices: "Fixed: check again".

**Advisor** (escalate: none):

> Preflight: BI-0135 is ready. Every check passed.
>
> - **Vault identity:** `000-Meta/Vault Identity.md` has `vault_id` = `my-setup`, which matches `expected_vault_id` `my-setup` (CLI display name `My-Setup-Vault`). PASS.
> - **Session-start reads:** all five done (MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault). The per-MCP note `Obsidian CLI MCP - Tool Notes` was also read before using the tools.
> - **Note path:** `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0135 - Harden Eval Response Parsing Against Plugin Stdout Noise.md`
> - **Title:** BI-0135 — Harden Eval Response Parsing Against Plugin Stdout Noise
> - **Initiative:** `[[Obsidian CLI MCP]]`. PASS.
> - **Status:** `planned` (re-validated 2026-10-31 against 0.9.0-local), not finished. PASS.
> - **Specify prompt:** the "/speckit-specify prompt" section exists and starts with `/speckit-specify Tolerate plugin noise`, the dash form. The prefix "Tolerate plugin noise" is three words. PASS. The note was not changed.
> - **Clarify skill:** `anthropic-skills:speckit-clarify-skill` loaded with the reference "BI-0135 - Harden Eval Response Parsing Against Plugin Stdout Noise". PASS.
>
> Primed for BI-0135 — Harden Eval Response Parsing Against Plugin Stdout Noise.
> Read: BI, Constitution (v1.5.1), Architecture (ARCH-014), ADR-029, ADR-030, ADR-031. The Constitution's compliance gates for ADR-014 and ADR-015 were noted.
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0135 - Harden Eval Response Parsing Against Plugin Stdout Noise.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-029 - Retry Once on Cold-Start Vault-Launch Failure.md`, `200-Decisions/ADR-030 - Sanctioned App-Launch Spawn Site.md`, `200-Decisions/ADR-031 - Cross-Vault Open via Vault-Targeted Focus.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`

**Sent to the step:**

> Preflight: BI-0135 is ready. Every check passed.
>
> - **Vault identity:** `000-Meta/Vault Identity.md` has `vault_id` = `my-setup`, which matches `expected_vault_id` `my-setup` (CLI display name `My-Setup-Vault`). PASS.
> - **Session-start reads:** all five done (MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault). The per-MCP note `Obsidian CLI MCP - Tool Notes` was also read before using the tools.
> - **Note path:** `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0135 - Harden Eval Response Parsing Against Plugin Stdout Noise.md`
> - **Title:** BI-0135 — Harden Eval Response Parsing Against Plugin Stdout Noise
> - **Initiative:** `[[Obsidian CLI MCP]]`. PASS.
> - **Status:** `planned` (re-validated 2026-10-31 against 0.9.0-local), not finished. PASS.
> - **Specify prompt:** the "/speckit-specify prompt" section exists and starts with `/speckit-specify Tolerate plugin noise`, the dash form. The prefix "Tolerate plugin noise" is three words. PASS. The note was not changed.
> - **Clarify skill:** `anthropic-skills:speckit-clarify-skill` loaded with the reference "BI-0135 - Harden Eval Response Parsing Against Plugin Stdout Noise". PASS.
>
> Primed for BI-0135 — Harden Eval Response Parsing Against Plugin Stdout Noise.
> Read: BI, Constitution (v1.5.1), Architecture (ARCH-014), ADR-029, ADR-030, ADR-031. The Constitution's compliance gates for ADR-014 and ADR-015 were noted.
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.

## 2. pre-implementation / specify (2026-11-01T04:08:14.650Z)

**Question (verbatim):**

> Return the full content of the "/speckit-specify prompt" section of job BI-0135's note, verbatim and complete, in `answer`, without the surrounding code fence. Do not edit or summarise it. If the note has no such section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-specify Tolerate plugin noise
>
> ## Feature
> Every capability that runs a query inside Obsidian returns its normal result even when other Obsidian plugins print their own messages into the same output, so a successful operation is always reported as successful.
>
> ## Why
> Obsidian plugins share the output channel the server reads its answers from, and some print status or start-up messages at unpredictable moments, especially right after Obsidian starts or recovers. Today, when such a message appears ahead of the answer, most of these capabilities report a parse failure even though the operation worked; one of them already copes. Agents then retry, or wrongly conclude that a successful change failed. Which plugins are installed and what they print is outside the server's control, so the fix must work whatever is installed.
>
> ## User stories
> - As an agent, I want a call that succeeded inside Obsidian to be reported as a success even if a plugin printed messages at the same time, so that I do not retry or report a false failure.
> - As an agent opening a note right after Obsidian has started, I want the call to succeed despite plugin start-up messages, so that recovery after a cold start works first time.
> - As an operator diagnosing a genuine failure, I want the error to include the raw output that could not be understood, so that I can see what went wrong.
> - As a user with any mix of plugins installed, I want this to work without any setting for my particular plugins, so that installing or removing a plugin never breaks the server.
>
> ## Acceptance criteria
>
> **Story: noise before the answer**
> - Given a plugin prints one or more lines before the capability's answer, when the call completes, then the agent receives the same result it would have received with no plugin output.
> - Given the same noise, when each affected capability is called, then every one of them handles it the same way.
>
> **Story: noise after the answer**
> - Given a plugin prints a line after the capability's answer, when the call completes, then the agent receives the normal result, or a clear error that includes the raw output if the answer cannot be identified safely.
>
> **Story: cold start**
> - Given Obsidian has just been started by the server and a plugin prints start-up messages, when the agent opens a note, then the call reports success.
>
> **Story: genuine failures still reported**
> - Given the output contains no recognisable answer at all, when the call completes, then the agent receives a parse error that includes the raw output.
> - Given plugin text that itself looks like an answer, when the call completes, then the capability's own answer is the one returned.
>
> **Story: plugin-agnostic**
> - Given any plugin, including one the server has never seen, prints arbitrary text, when the call completes, then the behaviour is the same as for the plugins observed so far, with no plugin-specific setting.
>
> ## Out of scope
> - Stopping, detecting or filtering specific plugins' messages, or any per-plugin handling.
> - The size limit on text sent to Obsidian and other input-encoding concerns.
> - Capabilities that do not run a query inside Obsidian.
> - Changing what any capability returns when no plugin output is present.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0135 - Harden Eval Response Parsing Against Plugin Stdout Noise.md`

**Sent to the step:**

> /speckit-specify Tolerate plugin noise
>
> ## Feature
> Every capability that runs a query inside Obsidian returns its normal result even when other Obsidian plugins print their own messages into the same output, so a successful operation is always reported as successful.
>
> ## Why
> Obsidian plugins share the output channel the server reads its answers from, and some print status or start-up messages at unpredictable moments, especially right after Obsidian starts or recovers. Today, when such a message appears ahead of the answer, most of these capabilities report a parse failure even though the operation worked; one of them already copes. Agents then retry, or wrongly conclude that a successful change failed. Which plugins are installed and what they print is outside the server's control, so the fix must work whatever is installed.
>
> ## User stories
> - As an agent, I want a call that succeeded inside Obsidian to be reported as a success even if a plugin printed messages at the same time, so that I do not retry or report a false failure.
> - As an agent opening a note right after Obsidian has started, I want the call to succeed despite plugin start-up messages, so that recovery after a cold start works first time.
> - As an operator diagnosing a genuine failure, I want the error to include the raw output that could not be understood, so that I can see what went wrong.
> - As a user with any mix of plugins installed, I want this to work without any setting for my particular plugins, so that installing or removing a plugin never breaks the server.
>
> ## Acceptance criteria
>
> **Story: noise before the answer**
> - Given a plugin prints one or more lines before the capability's answer, when the call completes, then the agent receives the same result it would have received with no plugin output.
> - Given the same noise, when each affected capability is called, then every one of them handles it the same way.
>
> **Story: noise after the answer**
> - Given a plugin prints a line after the capability's answer, when the call completes, then the agent receives the normal result, or a clear error that includes the raw output if the answer cannot be identified safely.
>
> **Story: cold start**
> - Given Obsidian has just been started by the server and a plugin prints start-up messages, when the agent opens a note, then the call reports success.
>
> **Story: genuine failures still reported**
> - Given the output contains no recognisable answer at all, when the call completes, then the agent receives a parse error that includes the raw output.
> - Given plugin text that itself looks like an answer, when the call completes, then the capability's own answer is the one returned.
>
> **Story: plugin-agnostic**
> - Given any plugin, including one the server has never seen, prints arbitrary text, when the call completes, then the behaviour is the same as for the plugins observed so far, with no plugin-specific setting.
>
> ## Out of scope
> - Stopping, detecting or filtering specific plugins' messages, or any per-plugin handling.
> - The size limit on text sent to Obsidian and other input-encoding concerns.
> - Capabilities that do not run a query inside Obsidian.
> - Changing what any capability returns when no plugin output is present.

## 3. pre-implementation / clarify (2026-11-01T04:11:01.485Z)

**Question (verbatim):**

> **Question:** When a plugin prints text after a capability's answer, should the capability still return its normal result, or report a parse error with the raw output? (FR-004)
>
> **Why it matters:** As written, FR-004 and User Story 4 allow either outcome, so nobody can write a test with a definite expected result, and the affected capabilities could drift apart.
>
> **Context (from the code index):** Two parts of the code read the answer today:
> - `smart_connections_query` (`src/tools/smart_connections_query/handler.ts:51-58`) finds the last `\n=> ` marker and treats everything from there to the end of the output as the answer. Any text after the answer therefore ends up in `JSON.parse` and becomes a `json-parse` failure.
> - The shared `parseEvalStdout` (`src/tools/_active-file.ts:72`) is used by `decodeEvalEnvelope`, `parseFocusedVault` and `resolveActiveFocusedFile`. It only strips a leading `=> ` and has the same weakness with trailing text.
>
> The answer is always a single line of JSON, because line breaks inside values are escaped.
>
> **Recommended:** Option A. Plugin text after the answer is as normal as plugin text before it, and the single-line answer has a clear end, so the result can be read safely. Text after the answer that cannot be read as an answer still fails with the raw output, so no wrong result can come from it.
>
> | Option | Description |
> |--------|-------------|
> | A | Read the answer only up to the end of the line that carries the answer marker, and ignore later lines that carry no marker. The agent gets the normal result. Every affected capability, `smart_connections_query` included, follows this one rule. |
> | B | Treat any text other than whitespace after the answer as making the answer unsafe to read, and return a parse error with the raw output (today's `smart_connections_query` behaviour, made uniform). |
> | C | Allow only blank or whitespace lines after the answer. Any other trailing text gives a parse error with the raw output. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> A

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0135 - Harden Eval Response Parsing Against Plugin Stdout Noise.md`

**Sent to the step:**

> A

## 4. pre-implementation / clarify (2026-11-01T04:12:09.496Z)

**Question (verbatim):**

> **Question:** When plugin lines come before one of Obsidian's own error messages (including the "command not found" message Obsidian prints while it is still starting up), should the server still recognise that error, and the start-up retry it triggers, for the capabilities that run a query inside Obsidian?
>
> **Why it matters:** If it should not, the cold-start story (User Story 2, FR-007) only holds when plugin start-up lines come before a real answer. If plugin lines come before Obsidian's start-up error instead, the server skips the retry, and the agent gets a confusing parse failure instead of the success that one retry would have produced.
>
> **Context (from the code index):** Both checks live in `src/cli-adapter/_dispatch.ts`, in the layer every call to the command line passes through:
> - `dispatchOnce` treats output as an Obsidian-reported error only when it starts with `Error:`. Priority (b) at `_dispatch.ts:566` handles `Error: No active file`, and priority (c) at `_dispatch.ts:581` handles any other `Error:`. Both check the trimmed start of the output.
> - `COLD_START_PATTERN` (`_dispatch.ts:115`, `/^\s*Error: Command "[^"]*" not found\./`) is anchored to the start of the output, and `isColdStart` reads it to decide on the single ADR-029 retry in `dispatchWithColdStartRetry`.
> - So with a plugin line first, none of these checks match. The output reaches the handler as a "success", and the handler then fails with `json-parse`.
> - The outer check that Obsidian is not running, `APP_NOT_RUNNING_PATTERN` (`_dispatch.ts:17`), is not anchored and already copes.
>
> A catch: a plugin may itself print a line starting with `Error:` just before a valid answer. Any rule that looks for errors past the first line therefore has to let a real answer take precedence, or it creates exactly the false failure this feature removes.
>
> **Recommended:** Option B. It completes the cold-start story while staying inside the stated scope (only capabilities that run a query inside Obsidian). Letting the answer win keeps a plugin's own `Error:` line from turning a success into a failure. Other commands, which may return note content that starts with such text, keep today's strict start-of-output rule. The ADR-029 retry stays a single bounded retry, and the plan records the widened recognition as an amendment to ADR-029.
>
> | Option | Description |
> |--------|-------------|
> | A | No change to error and cold-start recognition. This feature only changes how answers are read. The cold-start story holds only when plugin lines come before a real answer. If they come before Obsidian's start-up error, the agent gets a parse failure carrying the raw output. |
> | B | For the capabilities that run a query inside Obsidian only: if the output has an answer, the answer wins. If it has no answer, an Obsidian error message at the start of any line is recognised as that error: a start-up "command not found" message triggers the existing single retry, and "no active file" maps to the no-active-file error. Other commands keep today's start-of-output rule. |
> | C | Apply option B's any-line rule to every command the server runs, not only the in-Obsidian query capabilities. This widens the change beyond the stated scope and risks new false matches on note content. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: decision: Option B changes the cold-start trigger that ADR-029's Decision Outcome pinned (prefix-anchored match) and makes it depend on the command, so ADR-029 needs an amendment. No probe yet shows plugin lines ever coming before Obsidian's cold-start error; the case is inferred from the code.):

> B
>
> Scope widened recognition to `eval` command output only. Answer envelope wins over any `Error:` line. Keep the single bounded ADR-029 retry. Non-eval commands keep the start-anchored rule. Record the change as an in-place amendment on ADR-029. Mark the rule NEEDS DECISION in the spec until the owner rules.
> Rationale: the BI cold-start AC requires success after start-up chatter. ADR-029 rejects per-tool retry, so recognition has to live in dispatch. But ADR-029's Decision Outcome pins a start-anchored `COLD_START_PATTERN`, and Architecture keeps the dispatch layer free of typed-tool coupling. That makes this an ADR amendment, not a spec detail.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0135 - Harden Eval Response Parsing Against Plugin Stdout Noise.md`, `200-Decisions/ADR-029 - Retry Once on Cold-Start Vault-Launch Failure.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

**Advisor, after the owner ruled** (escalate: none):

> B
>
> Limit the widened recognition to `eval` command output. If the output contains an answer envelope, the answer wins over any `Error:` line. With no envelope, match `Error:` at the start of any line: a cold-start `Command "…" not found.` line triggers the existing single ADR-029 retry, and `No active file` maps to `ERR_NO_ACTIVE_FILE`. Non-eval commands keep the start-anchored rule. Keep the retry single and bounded. Add no new top-level codes and no new `details.reason`. In the plan, cite the ADR-029 amendment of 2026-11-01 as the authority. Drop the NEEDS DECISION marker.
> Rationale: the owner ruled B (eval-only, amend ADR-029). The cold-start AC in BI-0135 needs it, and ADR-029 rejects per-tool retry. Constitution Principle IV holds because genuine errors still come through intact.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0135 - Harden Eval Response Parsing Against Plugin Stdout Noise.md`, `200-Decisions/ADR-029 - Retry Once on Cold-Start Vault-Launch Failure.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

Edits:
- `200-Decisions/ADR-029 - Retry Once on Cold-Start Vault-Launch Failure.md`: Would add an in-place 'Amendment 2026-11-01 (BI-0135)' stanza under Status. It would say that for `eval` command output only, cold-start and `Error:` recognition match at the start of any line when no answer envelope is present, and that an envelope takes precedence. Non-eval commands keep the start-anchored COLD_START_PATTERN. The retry stays single and bounded, with zero new codes. The stanza would also say the original Decision text is preserved verbatim, and frontmatter `updated` would be bumped to 2026-11-01.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0135 - Harden Eval Response Parsing Against Plugin Stdout Noise.md`: Would record the owner ruling of 2026-11-01 in the body: widened Error:/cold-start recognition is eval-only, the answer envelope wins, and ADR-029 is amended. It would add `[[ADR-029 - Retry Once on Cold-Start Vault-Launch Failure]]` to Related and bump frontmatter `updated` to 2026-11-01.

**Owner:** choice 1 (B: eval-only, amend ADR-029), via cli, 2026-11-01T04:14:09.262Z.

**Sent to the step:**

> B
>
> Limit the widened recognition to `eval` command output. If the output contains an answer envelope, the answer wins over any `Error:` line. With no envelope, match `Error:` at the start of any line: a cold-start `Command "…" not found.` line triggers the existing single ADR-029 retry, and `No active file` maps to `ERR_NO_ACTIVE_FILE`. Non-eval commands keep the start-anchored rule. Keep the retry single and bounded. Add no new top-level codes and no new `details.reason`. In the plan, cite the ADR-029 amendment of 2026-11-01 as the authority. Drop the NEEDS DECISION marker.
> Rationale: the owner ruled B (eval-only, amend ADR-029). The cold-start AC in BI-0135 needs it, and ADR-029 rejects per-tool retry. Constitution Principle IV holds because genuine errors still come through intact.

## 5. pre-implementation / clarify (2026-11-01T04:15:28.451Z)

**Question (verbatim):**

> **Question:** When the raw output attached to a parse error is longer than the size limit, should the error keep only the start of the output as it does today, or also keep its end, where Obsidian prints the answer or its own message?
>
> **Why it matters:** Plugin lines come before the answer. A long run of them fills the excerpt kept today, so the operator sees only plugin text and never the part that could not be understood. That defeats the operator story (User Story 3, FR-005, SC-004).
>
> **Context (from the code index):** Today's excerpt rules differ by code path:
> - `decodeEvalEnvelope` (`src/tools/_active-file.ts:89`, shared by `links`, `backlinks`, `open_file`, `views_base` and others) attaches `details.stdout: stdout.slice(0, 500)`, and the message carries the first 200 characters.
> - `smart_connections_query` (`handler.ts:69`) does the same.
> - `resolveActiveFocusedFile` (`_active-file.ts:199`) attaches the full stdout without limit.
> - The spec's Edge Cases currently say the excerpt keeps each capability's existing limit and is still enough to diagnose. Those two promises conflict once the plugin text runs past 500 characters.
> - The feature's out-of-scope list also forbids changing what any capability returns when no plugin output is present.
>
> **Recommended:** Option B. It fixes the diagnosis gap and changes nothing that already exists. `details.stdout` and the message keep today's content and limits, so existing callers and tests are untouched. The added field appears only when the output is too long to fit, which is exactly when the start alone can hide the problem. The added field is not a new error code, so Principle IV and FR-013 still hold.
>
> | Option | Description |
> |--------|-------------|
> | A | Keep today's excerpt rules unchanged (start of the output, each capability's current limit). Accept that a long run of plugin lines can hide the answer part from the operator. |
> | B | Keep `details.stdout` and the message exactly as they are today. When the output is longer than the limit, also attach the last part of the output, within the same limit, as one extra detail field shared by every affected capability. |
> | C | Replace today's excerpt with the start and the end of the output, joined by a gap marker, within the same total limit. This changes `details.stdout` for long malformed output even when no plugin printed anything. |
> | D | Always attach the full raw output, with no size limit, for every affected capability. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> B

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0135 - Harden Eval Response Parsing Against Plugin Stdout Noise.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

**Sent to the step:**

> B

## 6. pre-implementation / analyze (2026-11-01T04:25:44.297Z)

**Question (verbatim):**

> Would you like me to suggest concrete remediation edits for the top 2 issues (F1 and U1)?
>
> - **F1 (MEDIUM)**: the spec's Context says `obsidian_exec` is out of scope, but plan research D3 has an `eval` run through `obsidian_exec` inherit the new eval-only error recognition (FR-011). Suggested fix: one sentence in spec Context saying `obsidian_exec` answer handling is unchanged, but an `eval` run through it inherits FR-011, because ADR-029 covers both facades.
> - **U1 (MEDIUM)**: under the last-marker rule, a plugin line `=> {…}` printed after the real answer that also passes the schema check would be returned. Suggested fix: an accepted-risk note in research D1, saying this is not distinguishable and has never been observed, plus a matching contract §1 row.
>
> The four LOW findings (D1, U2, I1, T1) can be folded in at the same time if you want. Nothing will be edited until you approve.

**Advisor** (escalate: none):

> Yes. Apply the fixes, with U1 changed as below.
>
> - **F1:** apply as proposed. `obsidian_exec` answer handling stays unchanged. An `eval` run through `obsidian_exec` inherits FR-011, because the ADR-029 retry covers both facades and the 2026-11-01 ruling scopes the change by command (`eval`), not by tool.
> - **U1:** don't record this as accepted risk. The BI acceptance criterion "plugin text that itself looks like an answer → the capability's own answer is returned" is a requirement and must stay testable. Change the plan so the capability's own answer can be told apart from look-alike plugin lines in every position, before or after the answer. Add a contract §1 row and a test for a look-alike `=> {…}` line both before and after the real answer. If no reliable way to tell them apart exists, stop and raise it as a question. Don't weaken the criterion.
> - **LOW findings (D1, U2, I1, T1):** fold them in now.
>
> Rationale: the BI's "genuine failures still reported" story covers look-alike answers. Answer A (2026-11-01) only made lines with no marker ignorable, and never extended that to look-alike marker lines.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0135 - Harden Eval Response Parsing Against Plugin Stdout Noise.md`, `200-Decisions/ADR-029 - Retry Once on Cold-Start Vault-Launch Failure.md`

**Sent to the step:**

> Yes. Apply the fixes, with U1 changed as below.
>
> - **F1:** apply as proposed. `obsidian_exec` answer handling stays unchanged. An `eval` run through `obsidian_exec` inherits FR-011, because the ADR-029 retry covers both facades and the 2026-11-01 ruling scopes the change by command (`eval`), not by tool.
> - **U1:** don't record this as accepted risk. The BI acceptance criterion "plugin text that itself looks like an answer → the capability's own answer is returned" is a requirement and must stay testable. Change the plan so the capability's own answer can be told apart from look-alike plugin lines in every position, before or after the answer. Add a contract §1 row and a test for a look-alike `=> {…}` line both before and after the real answer. If no reliable way to tell them apart exists, stop and raise it as a question. Don't weaken the criterion.
> - **LOW findings (D1, U2, I1, T1):** fold them in now.
>
> Rationale: the BI's "genuine failures still reported" story covers look-alike answers. Answer A (2026-11-01) only made lines with no marker ignorable, and never extended that to look-alike marker lines.
