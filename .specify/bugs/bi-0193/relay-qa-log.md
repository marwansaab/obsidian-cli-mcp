# Relay Q&A log: speckit-bugfix

Run `obsidian-cli-mcp-bugfix-bi-0193-2026-11-07`, started 2026-11-07T00:04:32.478Z.

## 1. checks / preflight (2026-11-07T00:04:32.524Z)

**Question (verbatim):**

> Preflight for this Relay bug-fix run of job BI-0193. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0193 in the vault.
> 3. Its `initiative` must refer to "Obsidian CLI MCP". It is usually a wikilink, such as "[[Obsidian CLI MCP]]".
> 4. Its `status` must not mean the work is finished or abandoned (for example shipped, done, cancelled, superseded). Any other status (planned, in-flight, deferred and so on): report it and carry on.
> 5. Its `variant` must be `bug-fix`. This run repairs broken behaviour; a feature goes through the full spec-kit workflow instead.
> 6. It must have a "/speckit-bug-assess prompt" section, or else a "/speckit-specify prompt" section, which describes the expected behaviour. Don't change the note.
> 7. If you haven't already in this conversation, load the clarify skill with the Skill tool, using the reference "<id> - <title>" from the note. It may be listed as `speckit-clarify-skill` or `anthropic-skills:speckit-clarify-skill`. Follow its answering rules for every question that follows. If you can't load it, follow the answer format in your role instead, and say so in the summary; don't escalate for that.
>
> Answer with a short readiness summary: the vault id, the note's path, title, status and variant, and the result of each check.
> Escalate if a check fails, with at most 2 short choices (Relay adds "Stop the run" as a third):
> - `ungrounded`: the vault identity doesn't match, or the note or both prompt sections are missing. Choices: "Fixed: check again".
> - `scope`: the note belongs to another initiative, its status says the work is finished, or its variant isn't `bug-fix`. Choices: "Run it anyway", "Fixed: check again".

**Advisor** (escalate: none):

> Primed for BI-0193 — Align Shared No Active File Advice With Each Tool's Inputs.
>
> Readiness summary:
> - Vault id: `my-setup` (read from `000-Meta/Vault Identity.md` in `My-Setup-Vault`). Matches `expected_vault_id`. PASS.
> - Session-start reads done: MCP Tool Notes (index), Best Practices, Decision Log, Session Handover, About This Vault. I also read the per-MCP note "Obsidian CLI MCP - Tool Notes".
> - Note path: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0193 - Align Shared No Active File Advice With Each Tool's Inputs.md`. Found. PASS.
> - Title: BI-0193 — Align Shared No Active File Advice With Each Tool's Inputs.
> - Initiative: `[[Obsidian CLI MCP]]`. PASS.
> - Status: `planned` (not finished or abandoned). PASS.
> - Variant: `bug-fix`. PASS.
> - Prompt section: no "/speckit-bug-assess prompt" section, but there is a "/speckit-specify prompt" section (drafted 2026-11-05). It sets out the expected behaviour: the "no active file" recovery advice names only inputs the tool accepts; tools that have a target mode advise specific mode with a vault and a note; tools without one name their own inputs. Out of scope: `views_base` and `obsidian_exec` (fixed in BI-0174 item 10), which tools support active mode, and other error messages. Note left unchanged. PASS.
> - Clarify skill: `anthropic-skills:speckit-clarify-skill` loaded with "BI-0193 - Align Shared No Active File Advice With Each Tool's Inputs". PASS.
> - Read: BI, Constitution (v1.5.1), Architecture (ARCH-014: the error-mapping element covers the `ERR_NO_ACTIVE_FILE` recovery message; the target-mode element covers ADR-003 and the vault-wide tools' optional `vault`), ADR-003.
>
> Role: BA and Solution Architect, answering for Claude Code. Ready for the assessment questions.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0193 - Align Shared No Active File Advice With Each Tool's Inputs.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-003 - Enforce Target Mode in Typed Tools.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`

**Sent to the step:**

> Primed for BI-0193 — Align Shared No Active File Advice With Each Tool's Inputs.
>
> Readiness summary:
> - Vault id: `my-setup` (read from `000-Meta/Vault Identity.md` in `My-Setup-Vault`). Matches `expected_vault_id`. PASS.
> - Session-start reads done: MCP Tool Notes (index), Best Practices, Decision Log, Session Handover, About This Vault. I also read the per-MCP note "Obsidian CLI MCP - Tool Notes".
> - Note path: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0193 - Align Shared No Active File Advice With Each Tool's Inputs.md`. Found. PASS.
> - Title: BI-0193 — Align Shared No Active File Advice With Each Tool's Inputs.
> - Initiative: `[[Obsidian CLI MCP]]`. PASS.
> - Status: `planned` (not finished or abandoned). PASS.
> - Variant: `bug-fix`. PASS.
> - Prompt section: no "/speckit-bug-assess prompt" section, but there is a "/speckit-specify prompt" section (drafted 2026-11-05). It sets out the expected behaviour: the "no active file" recovery advice names only inputs the tool accepts; tools that have a target mode advise specific mode with a vault and a note; tools without one name their own inputs. Out of scope: `views_base` and `obsidian_exec` (fixed in BI-0174 item 10), which tools support active mode, and other error messages. Note left unchanged. PASS.
> - Clarify skill: `anthropic-skills:speckit-clarify-skill` loaded with "BI-0193 - Align Shared No Active File Advice With Each Tool's Inputs". PASS.
> - Read: BI, Constitution (v1.5.1), Architecture (ARCH-014: the error-mapping element covers the `ERR_NO_ACTIVE_FILE` recovery message; the target-mode element covers ADR-003 and the vault-wide tools' optional `vault`), ADR-003.
>
> Role: BA and Solution Architect, answering for Claude Code. Ready for the assessment questions.

## 2. assess / bug-assess (2026-11-07T00:05:29.136Z)

**Question (verbatim):**

> Return the bug report for job BI-0193 as one message in `answer`, built only from the note's own text. Do not edit, summarise or add to it.
> - If the note has a "/speckit-bug-assess prompt" section: its full content, verbatim and complete, without the surrounding code fence.
> - Otherwise exactly this, with each section's full content verbatim and complete: a first line `/speckit-bug-assess slug=BI-0193`, a blank line, the line `## Impact` followed by the note's "Impact" section, a blank line, the line `## Status and evidence` followed by the note's "Status" section, a blank line, and the line `## Expected behaviour` followed by the content of its "/speckit-specify prompt" section without the surrounding code fence. Leave out any of the first two sections the note doesn't have.
> If the note has neither prompt section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-bug-assess slug=BI-0193
>
> ## Impact
> Recovery advice that names an input the tool does not accept cannot be followed: the agent's retry fails validation, or it gives up. Same harm as BI-0174 item 10 for the tools it did not cover.
>
> ## Status and evidence
> *Planned* 2026-11-05 (Open Bugs triage: still valid after the 0.9.0 validation; prompt drafted). Filed 2026-11-04 at the owner's direction from a follow-up of [[BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation|BI-0174]]. The shared `ERR_NO_ACTIVE_FILE` message in the dispatch layer still advises `target_mode` for tools that do not have it. BI-0174 (item 10) gave `views_base` and `obsidian_exec` their own messages naming only their own inputs; every other tool that can raise the error still gets the shared advice.
>
> ## Expected behaviour
> Drafted 2026-11-05 with the `speckit-specify-skill`.
>
> /speckit-specify Align recovery advice
>
> ## Feature
> When a tool fails because Obsidian has no active file, its recovery advice names only inputs that this tool actually accepts.
>
> ## Why
> Most tools share one "no active file" message that advises switching to a target mode, which some tools do not have. Advice an agent cannot follow makes its retry fail validation, or makes it give up. Two tools were fixed earlier; the rest still give the shared advice.
>
> ## User stories
> - As an AI agent, I want "no active file" advice that matches the tool I called, so that my retry succeeds first time.
> - As an AI agent using a tool that has a target mode, I want the advice to tell me to name the vault and file in specific mode, so that I can carry on without the active file.
> - As an AI agent using a tool without a target mode, I want the advice to name that tool's own way to choose a note or vault, so that I do not send an input it rejects.
>
> ## Acceptance criteria
> **Story: matching advice**
> - Given no file is active, when the agent calls any tool that can raise this error, then every input the advice names is one that tool accepts.
> - Given no file is active, when the agent follows the advice exactly, then the retry passes validation.
>
> **Story: tools with a target mode**
> - Given no file is active, when the agent calls a tool that has a target mode in active mode, then the advice names specific mode with a vault and a note.
>
> **Story: tools without a target mode**
> - Given no file is active, when the agent calls a tool without a target mode, then the advice does not mention a target mode and names that tool's own inputs instead.
>
> ## Out of scope
> - The two tools whose advice was already fixed.
> - Changing which tools support active mode.
> - Other error messages.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0193 - Align Shared No Active File Advice With Each Tool's Inputs.md`

**Sent to the step:**

> /speckit-bug-assess slug=BI-0193
>
> ## Impact
> Recovery advice that names an input the tool does not accept cannot be followed: the agent's retry fails validation, or it gives up. Same harm as BI-0174 item 10 for the tools it did not cover.
>
> ## Status and evidence
> *Planned* 2026-11-05 (Open Bugs triage: still valid after the 0.9.0 validation; prompt drafted). Filed 2026-11-04 at the owner's direction from a follow-up of [[BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation|BI-0174]]. The shared `ERR_NO_ACTIVE_FILE` message in the dispatch layer still advises `target_mode` for tools that do not have it. BI-0174 (item 10) gave `views_base` and `obsidian_exec` their own messages naming only their own inputs; every other tool that can raise the error still gets the shared advice.
>
> ## Expected behaviour
> Drafted 2026-11-05 with the `speckit-specify-skill`.
>
> /speckit-specify Align recovery advice
>
> ## Feature
> When a tool fails because Obsidian has no active file, its recovery advice names only inputs that this tool actually accepts.
>
> ## Why
> Most tools share one "no active file" message that advises switching to a target mode, which some tools do not have. Advice an agent cannot follow makes its retry fail validation, or makes it give up. Two tools were fixed earlier; the rest still give the shared advice.
>
> ## User stories
> - As an AI agent, I want "no active file" advice that matches the tool I called, so that my retry succeeds first time.
> - As an AI agent using a tool that has a target mode, I want the advice to tell me to name the vault and file in specific mode, so that I can carry on without the active file.
> - As an AI agent using a tool without a target mode, I want the advice to name that tool's own way to choose a note or vault, so that I do not send an input it rejects.
>
> ## Acceptance criteria
> **Story: matching advice**
> - Given no file is active, when the agent calls any tool that can raise this error, then every input the advice names is one that tool accepts.
> - Given no file is active, when the agent follows the advice exactly, then the retry passes validation.
>
> **Story: tools with a target mode**
> - Given no file is active, when the agent calls a tool that has a target mode in active mode, then the advice names specific mode with a vault and a note.
>
> **Story: tools without a target mode**
> - Given no file is active, when the agent calls a tool without a target mode, then the advice does not mention a target mode and names that tool's own inputs instead.
>
> ## Out of scope
> - The two tools whose advice was already fixed.
> - Changing which tools support active mode.
> - Other error messages.

## 3. assess / resolve-assessment (2026-11-07T00:11:04.006Z)

**Question (verbatim):**

> **[NEEDS CLARIFICATION] (Reproduction): can a tool without a target mode still receive the dispatch-level no-active-file message?**
>
> Context: by tracing the code, the CLI commands that actually answer `Error: No active file.` are reached only by `delete` and `read_property` in active mode (both accept `target_mode`, `vault`, `file` and `path`) and by the already fixed `views_base` and `obsidian_exec`. Any other tool could reach the dispatch message only through the eval rule (spec 080 C2): an `obsidian eval` with no answer line, where some other plugin prints a line starting `Error: No active file`. Obsidian's eval does not print that line itself. Proving this live needs Obsidian focused on the test vault with no file open, which changes the user's workspace (BI-0174's test record skipped the same condition).
>
> | Option | What | Trade-off |
> |---|---|---|
> | **A (recommended)** | Accept the code-traced finding: only `delete` and `read_property` reach the dispatch message today. Record the eval path as a residual risk. No live probe. | No workspace disturbance; the residual risk is a path no real Obsidian call is known to take. |
> | B | Accept the finding now, and have `/speckit-bug-test` run a live probe (test vault, all tabs closed) of `delete`, `read_property` and `find_and_replace` with `active_note: true`, then restore the tabs. | Live evidence for the fix, but it closes the user's open tabs in the test vault during the test. |
> | C | Treat the finding as unproven and widen the fix to cover every eval-based tool. | Large diff for a path not shown to exist. |
>
> Recommendation: A. The code shows which commands answer `Error: No active file.`, and the eval route needs a third-party plugin to print that exact line.

**Advisor** (escalate: none):

> Reject the code-traced finding: a tool with no target mode does reach the no-active-file advice. `find_and_replace` with `active_note: true` reproduces it on 0.9.0-local. Use TC-00776 as the reproduction and don't add a new live probe.
>
> TC-00776 ran live on 2026-11-03 and 2026-11-04 and returned `ERR_NO_ACTIVE_FILE` with the message `No active file in Obsidian. Open a note in the editor, or call find_and_replace with target_mode=specific + vault + file/path.` The tool has no `target_mode`; its single-note scope is `path` / `file`. TC-00428 (`append_note`) returns the same message with its own tool name, so the message is built per tool, not only by the CLI. Re-trace where it is built, and include every tool that builds it. The BI covers every tool that can raise the error, except `views_base` and `obsidian_exec`. Re-running TC-00776 needs the owner to focus the test vault and close its tabs (`owner_input: required`), so don't close tabs yourself.
>
> Sources: TC-00776, TC-00428, BI-0193 (Status, "/speckit-specify prompt" section, Out of scope).

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Cases/TC-00776 - Find And Replace Active Note With No Open Note Throws ERR_NO_ACTIVE_FILE.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Cases/TC-00428 - Append Note Active Mode No Focused Note Surfaces ERR_NO_ACTIVE_FILE.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0193 - Align Shared No Active File Advice With Each Tool's Inputs.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0193 - Align Shared No Active File Advice With Each Tool's Inputs.md`: Added a 'Clarified 2026-11-07 (Relay, bug assessment — reproduction)' paragraph to Status: TC-00776 contradicts the code trace and is the reproduction; TC-00428 shows the message is built per tool.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0193 - Align Shared No Active File Advice With Each Tool's Inputs.md`: Frontmatter updated: 2026-11-05 → 2026-11-07.

**Sent to the step:**

> Reject the code-traced finding: a tool with no target mode does reach the no-active-file advice. `find_and_replace` with `active_note: true` reproduces it on 0.9.0-local. Use TC-00776 as the reproduction and don't add a new live probe.
>
> TC-00776 ran live on 2026-11-03 and 2026-11-04 and returned `ERR_NO_ACTIVE_FILE` with the message `No active file in Obsidian. Open a note in the editor, or call find_and_replace with target_mode=specific + vault + file/path.` The tool has no `target_mode`; its single-note scope is `path` / `file`. TC-00428 (`append_note`) returns the same message with its own tool name, so the message is built per tool, not only by the CLI. Re-trace where it is built, and include every tool that builds it. The BI covers every tool that can raise the error, except `views_base` and `obsidian_exec`. Re-running TC-00776 needs the owner to focus the test vault and close its tabs (`owner_input: required`), so don't close tabs yourself.
>
> Sources: TC-00776, TC-00428, BI-0193 (Status, "/speckit-specify prompt" section, Out of scope).

## 4. assess / resolve-assessment (2026-11-07T00:12:14.510Z)

**Question (verbatim):**

> **Q1: the dispatch-level message (`src/cli-adapter/_dispatch.ts:668-669`): change it in this fix?**
>
> Context: the message advises `target_mode: "specific"` and an explicit vault/file. CodeGraph shows `dispatchCli` under every `invokeCli` / `invokeEval` / `invokeBoundedCli` call. Its real reachers today are `delete` and `read_property`, and both accept every input it names. The two tools without a target mode that reach it (`views_base`, `obsidian_exec`) are already rewrapped by BI-0174's `throwIfNoActiveFile`.
>
> | Option | What | Trade-off |
> |---|---|---|
> | **A (recommended)** | Leave the dispatch message unchanged. Fix the six tool-level messages: `set_property`, `find_and_replace`, `backlinks`, `links`, `read_heading`, `smart_connections_similar`. | One existing-test edit (Q2); no change to the runtime spine. The eval-path risk stays for tools without a target mode. |
> | B | Add an optional caller-supplied advice field to the dispatch input (`DispatchInput`, `InvokeCliInput`, `InvokeEvalInput`, `InvokeBoundedCliInput`), the root fix BI-0174 named; `views_base` / `obsidian_exec` pass it instead of rethrowing. | Changes the adapter input contracts under every handler, and guarantees nothing beyond A unless every call site passes advice. |
> | C | Reword the dispatch default so it names no input (e.g. `No active file in Obsidian. Open a note in Obsidian, then call again.`); `delete` and `read_property` rethrow it with the target-mode advice. | Closes the eval path for every tool, including folder-scoped `files` / `paths`, but edits several pinned assertions in `_dispatch.test.ts`, `cli-adapter.test.ts` and `move/handler.test.ts:294-296`. |
>
> Recommendation: A. It fixes every reachable defect with the smallest test change; B and C pay a wider change for a path no real call is known to take.

**Advisor** (escalate: none):

> A. Leave the dispatch message as it is and fix the six tool-level messages: `set_property`, `find_and_replace`, `backlinks`, `links`, `read_heading` and `smart_connections_similar`. Record the eval route for tools without a target mode as a residual risk. This answer does not approve any edit to an existing test; that is Q2 and needs the owner's ruling.
>
> Why: BI-0174 item 10 (owner ruling 2026-11-04) fixed `views_base` and `obsidian_exec` and kept the dispatch message and its tests unchanged. BI-0193's Out of scope excludes those two tools and other error messages. The dispatch message's reachers (`delete`, `read_property`) accept every input it names, so it already meets BI-0193's acceptance criteria. TC-00776 shows the live defect is in the tool-level messages.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0193 - Align Shared No Active File Advice With Each Tool's Inputs.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Cases/TC-00776 - Find And Replace Active Note With No Open Note Throws ERR_NO_ACTIVE_FILE.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0193 - Align Shared No Active File Advice With Each Tool's Inputs.md`: Added a 'Clarified 2026-11-07 (Relay Q1, advisor answer from the vault)' paragraph to Status: dispatch message unchanged, the six tool-level messages fixed, eval route a residual risk, existing-test edits still need an owner ruling.

**Sent to the step:**

> A. Leave the dispatch message as it is and fix the six tool-level messages: `set_property`, `find_and_replace`, `backlinks`, `links`, `read_heading` and `smart_connections_similar`. Record the eval route for tools without a target mode as a residual risk. This answer does not approve any edit to an existing test; that is Q2 and needs the owner's ruling.
>
> Why: BI-0174 item 10 (owner ruling 2026-11-04) fixed `views_base` and `obsidian_exec` and kept the dispatch message and its tests unchanged. BI-0193's Out of scope excludes those two tools and other error messages. The dispatch message's reachers (`delete`, `read_property`) accept every input it names, so it already meets BI-0193's acceptance criteria. TC-00776 shows the live defect is in the tool-level messages.

## 5. assess / resolve-assessment (2026-11-07T00:12:54.746Z)

**Question (verbatim):**

> **Q2: may one existing test assertion be edited?**
>
> Context: `src/tools/smart_connections_similar/handler.lifecycle.test.ts:138` pins the `ERR_NO_ACTIVE_FILE` message `smart_connections_similar: no note focused; switch to specific mode or focus a note.` The fix changes that message to the shared target-mode advice (`No active file in Obsidian. Open a note in the editor, or call smart_connections_similar with target_mode=specific + vault + file/path.`) so it names the vault and note, as the acceptance criteria require. Under `.memory/refactor-decisions.md` item 5, an existing assertion changes only with owner approval (BI-0178 and BI-0174 Q2 are the precedent).
>
> | Option | What | Trade-off |
> |---|---|---|
> | **A (recommended)** | Approve exactly that one assertion (line 138 only; line 139's `details` stays unchanged), and pin the new message with a new test. If any other existing test fails, stop and raise it. | Smallest edit that lets `smart_connections_similar` meet the criterion. |
> | B | Approve no test edit; leave `smart_connections_similar`'s message as it is and fix the other five tools only. | No test edit, but one target-mode tool still fails the 'names a vault and a note' criterion. |
> | C | Approve edits to any existing assertion pinning the old wording in the four eval tools' suites. | More latitude than needed: a grep found only line 138 pinning the message. |
>
> Recommendation: A.

**Advisor** (escalate: decision: Under the project's rule, an existing test assertion changes only with the owner's approval, and BI-0174's ruling says each further edit needs a fresh ruling. No ruling covers this assertion for BI-0193.):

> Recommended: A. Edit only the assertion at `src/tools/smart_connections_similar/handler.lifecycle.test.ts:138` to the new message `No active file in Obsidian. Open a note in the editor, or call smart_connections_similar with target_mode=specific + vault + file/path.` Leave line 139's `details` unchanged, and add a new test that pins the new message. If any other existing test fails, stop and raise it. Hold the edit until the owner rules; this answer is not that approval.
>
> Why: BI-0193's story for tools with a target mode says the advice names specific mode with a vault and a note. The current text (`switch to specific mode or focus a note`) names neither. The BI-0174 precedent (item 10, Relay Q2) approved one named assertion, and said any other existing-test edit needs a fresh owner ruling.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0193 - Align Shared No Active File Advice With Each Tool's Inputs.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation.md`

**Advisor, after the owner ruled** (escalate: none):

> A. Edit only the assertion at `src/tools/smart_connections_similar/handler.lifecycle.test.ts:138`, to `No active file in Obsidian. Open a note in the editor, or call smart_connections_similar with target_mode=specific + vault + file/path.` Keep line 139's `details` unchanged, and add a new test that pins the new message. If any other existing test fails, stop and raise it: any other edit to an existing test needs a fresh owner ruling.
>
> Owner ruling 2026-11-07 (Relay Q2), recorded in the BI-0193 Status section.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0193 - Align Shared No Active File Advice With Each Tool's Inputs.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0193 - Align Shared No Active File Advice With Each Tool's Inputs.md`: Added an 'Owner ruling 2026-11-07 (Relay Q2)' paragraph to Status: only the assertion at smart_connections_similar handler.lifecycle.test.ts:138 may change; line 139 stays; a new test pins the message; any other existing-test edit needs a fresh ruling.

**Owner:** choice 1 (Approve line 138 only (A)), via cli, 2026-11-07T00:14:51.426Z.

**Sent to the step:**

> A. Edit only the assertion at `src/tools/smart_connections_similar/handler.lifecycle.test.ts:138`, to `No active file in Obsidian. Open a note in the editor, or call smart_connections_similar with target_mode=specific + vault + file/path.` Keep line 139's `details` unchanged, and add a new test that pins the new message. If any other existing test fails, stop and raise it: any other edit to an existing test needs a fresh owner ruling.
>
> Owner ruling 2026-11-07 (Relay Q2), recorded in the BI-0193 Status section.

## 6. assess / resolve-assessment (2026-11-07T00:15:10.553Z)

**Question (verbatim):**

> **Q3: `set_property`'s other `write_property:` prefixes**
>
> Context: besides its no-active-file message (in scope), `src/tools/set_property/handler.ts` carries the retired name `write_property` in three `CLI_REPORTED_ERROR` messages (lines 69, 100, 108: TSV-parse and active-mode eval-parse failures). The report puts 'Other error messages' out of scope.
>
> | Option | What | Trade-off |
> |---|---|---|
> | **A (recommended)** | Leave the three messages as they are in this fix; raise them as their own backlog item. | Keeps the fix inside the report's scope. |
> | B | Rename the prefix to `set_property:` in the same fix. | A small, related cleanup, but it changes error messages the report put out of scope, and may touch pinned assertions. |
>
> Recommendation: A.

**Advisor** (escalate: none):

> Leave the three `write_property:` messages unchanged in this fix, and record them as a follow-up finding in the fix report. Don't create a backlog item yourself; whether to file one is the owner's call. I've recorded the finding on BI-0193.
>
> Why: BI-0193's Out of scope excludes "Other error messages". Only the no-active-file message is in scope. The `write_property` → `set_property` rename was BI-0061.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0193 - Align Shared No Active File Advice With Each Tool's Inputs.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0009 - Add Write Property.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0193 - Align Shared No Active File Advice With Each Tool's Inputs.md`: Added a 'Clarified 2026-11-07 (Relay Q3)' paragraph to Status: the three set_property messages with the retired `write_property:` prefix stay out of scope; recorded as a follow-up finding, BI filing left to the owner.

**Sent to the step:**

> Leave the three `write_property:` messages unchanged in this fix, and record them as a follow-up finding in the fix report. Don't create a backlog item yourself; whether to file one is the owner's call. I've recorded the finding on BI-0193.
>
> Why: BI-0193's Out of scope excludes "Other error messages". Only the no-active-file message is in scope. The `write_property` → `set_property` rename was BI-0061.
