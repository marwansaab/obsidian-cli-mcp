# Relay Q&A log: speckit

Run `obsidian-cli-mcp-bi-0077-2026-11-04`, started 2026-11-04T10:06:28.404Z.

## 1. checks / preflight (2026-11-04T10:06:28.449Z)

**Question (verbatim):**

> Preflight for this Relay run of job BI-0077. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0077 in the vault.
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

> Primed for BI-0077 — Add Regression Fixtures For Smart Connections Lifecycle States.
>
> - Vault id: `my-setup` (read from `000-Meta/Vault Identity.md` in `My-Setup-Vault`). It matches `expected_vault_id`. PASS.
> - Session-start reads done: MCP Tool Notes index, Obsidian CLI MCP - Tool Notes, Best Practices, Decision Log, Session Handover, About This Vault.
> - Note: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0077 - Add Regression Fixtures For Smart Connections Lifecycle States.md`. Found. PASS.
> - Title: "BI-0077 — Add Regression Fixtures For Smart Connections Lifecycle States".
> - Initiative: `[[Obsidian CLI MCP]]`. PASS.
> - Status: `planned`. Not finished or abandoned. PASS. The note says it was re-validated on 0.9.0-local on 2026-11-03.
> - "/speckit-specify prompt" section: present. The prompt starts `/speckit-specify Verify lifecycle errors`, which is the exact dash form and a three-word feature prefix. PASS. The note was not changed.
> - Clarify skill: loaded (`anthropic-skills:speckit-clarify-skill`, ref "BI-0077 - Add Regression Fixtures For Smart Connections Lifecycle States").
> - Skill reads: the BI, the Obsidian CLI MCP Constitution (v1.5.1), Obsidian CLI MCP - Architecture (Pipeline elements: plugin-API routing via eval), and ADR-014 (with its ADR-045 amendment).
> - Scope from the note: the prompt covers only the code-side gap, meaning the in-eval lifecycle and file-type checks and their precedence order (ADR-014). The live TCs stay manual work under *Operational steps*.
>
> Role: Business Analyst and Solution Architect, answering for Claude Code. Awaiting clarification questions.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0077 - Add Regression Fixtures For Smart Connections Lifecycle States.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-014 - Plugin-Backed Typed Tools Runtime-Dependency Pattern.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`, `210-Guidelines/Best Practices.md`

**Sent to the step:**

> Primed for BI-0077 — Add Regression Fixtures For Smart Connections Lifecycle States.
>
> - Vault id: `my-setup` (read from `000-Meta/Vault Identity.md` in `My-Setup-Vault`). It matches `expected_vault_id`. PASS.
> - Session-start reads done: MCP Tool Notes index, Obsidian CLI MCP - Tool Notes, Best Practices, Decision Log, Session Handover, About This Vault.
> - Note: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0077 - Add Regression Fixtures For Smart Connections Lifecycle States.md`. Found. PASS.
> - Title: "BI-0077 — Add Regression Fixtures For Smart Connections Lifecycle States".
> - Initiative: `[[Obsidian CLI MCP]]`. PASS.
> - Status: `planned`. Not finished or abandoned. PASS. The note says it was re-validated on 0.9.0-local on 2026-11-03.
> - "/speckit-specify prompt" section: present. The prompt starts `/speckit-specify Verify lifecycle errors`, which is the exact dash form and a three-word feature prefix. PASS. The note was not changed.
> - Clarify skill: loaded (`anthropic-skills:speckit-clarify-skill`, ref "BI-0077 - Add Regression Fixtures For Smart Connections Lifecycle States").
> - Skill reads: the BI, the Obsidian CLI MCP Constitution (v1.5.1), Obsidian CLI MCP - Architecture (Pipeline elements: plugin-API routing via eval), and ADR-014 (with its ADR-045 amendment).
> - Scope from the note: the prompt covers only the code-side gap, meaning the in-eval lifecycle and file-type checks and their precedence order (ADR-014). The live TCs stay manual work under *Operational steps*.
>
> Role: Business Analyst and Solution Architect, answering for Claude Code. Awaiting clarification questions.

## 2. pre-implementation / specify (2026-11-04T10:07:09.993Z)

**Question (verbatim):**

> Return the full content of the "/speckit-specify prompt" section of job BI-0077's note, verbatim and complete, in `answer`, without the surrounding code fence. Do not edit or summarise it. If the note has no such section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-specify Verify lifecycle errors
>
> ## Feature
> The similar-notes search reports each state of the semantic-search plugin (not installed, installed but not ready, source note not yet indexed) and a target that is not a note with its own documented failure, in the documented order of precedence, and each of these is proven on demand without having to catch the plugin while it is starting or indexing.
>
> ## Why
> These failures tell an agent whether to install the plugin, wait, retry shortly or pick a different file. Two of them occur only in short windows, while the plugin starts up or indexes a new note, so they have never been observed end to end, and today's checks confirm only how a ready-made answer is reported, not that the search itself detects each state in the right order. A later change could swap or drop a check and nothing would notice.
>
> ## User stories
> - As an agent, I want a distinct failure when the plugin is installed but not ready, so that I know to wait and retry.
> - As an agent, I want a distinct failure when my source note has not been indexed yet, so that I retry shortly instead of assuming it has no similar notes.
> - As an agent, I want a distinct failure when my target is not a note, so that I choose a note instead.
> - As an agent, I want the most fundamental problem reported first when several apply, so that I fix things in the right order.
> - As a maintainer, I want each of these states produced and confirmed on demand, without a live plugin in a passing state, so that a change that breaks detection or order is caught before release.
>
> ## Acceptance criteria
>
> **Story: not ready**
> - Given the plugin is installed but its similarity lookup is not yet available, when an agent asks for notes similar to an existing note, then the not-ready failure is returned with its reason and no results.
>
> **Story: source not indexed**
> - Given the plugin is ready but the source note is not in its index, when the agent asks for similar notes, then the not-indexed failure is returned and names the note.
> - Given the plugin has since indexed the note, when the agent repeats the call, then results are returned.
>
> **Story: not a note**
> - Given the target is a canvas, a base or an attachment, when the agent asks for similar notes, then the not-a-note failure is returned and names the file and its type.
>
> **Story: precedence**
> - Given the target is not a note and the plugin is not ready, when the agent asks for similar notes, then the not-a-note failure is returned.
> - Given the plugin is not ready and the source note is not indexed, when the agent asks, then the not-ready failure is returned.
> - Given the plugin is not installed and the target is missing or not a note, when the agent asks, then the not-installed failure is returned.
>
> **Story: proven on demand**
> - Given each state above, when the checks for a release are run, then each state is produced on demand and its failure and precedence are confirmed, without waiting for the plugin to start or index.
>
> ## Out of scope
> - Changing which failures exist, their wording or their order of precedence.
> - Making the search wait for indexing to finish, or adding a mode that forces a state.
> - The related-notes-for-a-question search, unless it shares the same checks.
> - Installing the plugin in the test vault or writing the live test-case pages, which stay manual steps.
> - Rejecting unknown input fields, which is already covered.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0077 - Add Regression Fixtures For Smart Connections Lifecycle States.md`

**Sent to the step:**

> /speckit-specify Verify lifecycle errors
>
> ## Feature
> The similar-notes search reports each state of the semantic-search plugin (not installed, installed but not ready, source note not yet indexed) and a target that is not a note with its own documented failure, in the documented order of precedence, and each of these is proven on demand without having to catch the plugin while it is starting or indexing.
>
> ## Why
> These failures tell an agent whether to install the plugin, wait, retry shortly or pick a different file. Two of them occur only in short windows, while the plugin starts up or indexes a new note, so they have never been observed end to end, and today's checks confirm only how a ready-made answer is reported, not that the search itself detects each state in the right order. A later change could swap or drop a check and nothing would notice.
>
> ## User stories
> - As an agent, I want a distinct failure when the plugin is installed but not ready, so that I know to wait and retry.
> - As an agent, I want a distinct failure when my source note has not been indexed yet, so that I retry shortly instead of assuming it has no similar notes.
> - As an agent, I want a distinct failure when my target is not a note, so that I choose a note instead.
> - As an agent, I want the most fundamental problem reported first when several apply, so that I fix things in the right order.
> - As a maintainer, I want each of these states produced and confirmed on demand, without a live plugin in a passing state, so that a change that breaks detection or order is caught before release.
>
> ## Acceptance criteria
>
> **Story: not ready**
> - Given the plugin is installed but its similarity lookup is not yet available, when an agent asks for notes similar to an existing note, then the not-ready failure is returned with its reason and no results.
>
> **Story: source not indexed**
> - Given the plugin is ready but the source note is not in its index, when the agent asks for similar notes, then the not-indexed failure is returned and names the note.
> - Given the plugin has since indexed the note, when the agent repeats the call, then results are returned.
>
> **Story: not a note**
> - Given the target is a canvas, a base or an attachment, when the agent asks for similar notes, then the not-a-note failure is returned and names the file and its type.
>
> **Story: precedence**
> - Given the target is not a note and the plugin is not ready, when the agent asks for similar notes, then the not-a-note failure is returned.
> - Given the plugin is not ready and the source note is not indexed, when the agent asks, then the not-ready failure is returned.
> - Given the plugin is not installed and the target is missing or not a note, when the agent asks, then the not-installed failure is returned.
>
> **Story: proven on demand**
> - Given each state above, when the checks for a release are run, then each state is produced on demand and its failure and precedence are confirmed, without waiting for the plugin to start or index.
>
> ## Out of scope
> - Changing which failures exist, their wording or their order of precedence.
> - Making the search wait for indexing to finish, or adding a mode that forces a state.
> - The related-notes-for-a-question search, unless it shares the same checks.
> - Installing the plugin in the test vault or writing the live test-case pages, which stay manual steps.
> - Rejecting unknown input fields, which is already covered.

## 3. pre-implementation / clarify (2026-11-04T10:10:33.699Z)

**Question (verbatim):**

> **Question:** Should each new check run in one step from the simulated plugin state to the failure the agent receives, or should it prove only that the search detects the state and leave the reporting to the existing checks? (FR-010)
>
> Why it matters: if detection and reporting are proven separately, a change in how one of them talks to the other can slip through, which is the gap the item is meant to close. Joining them in one step makes each check bigger and slower.
>
> **Context:** CodeGraph shows two separate layers today. Detection lives in `JS_TEMPLATE` (`src/tools/smart_connections_similar/_template.ts`), and the existing template tests run it against a stub plugin through the shared `runEvalTemplate` harness (`src/tools/_eval-template-fixtures.ts`, node:vm), but only in the ready state. Reporting lives in `mapEnvelopeError` (`src/tools/smart_connections_similar/handler.ts:56`), and `handler.test.ts` checks it only with ready-made answers. Today no check passes the template's own answer through `executeSmartConnectionsSimilar` to the `UpstreamError` the agent gets back.
>
> **Recommended:** Option A. It is the only option that fully meets FR-010 ("the failure as the agent receives it") and SC-001. It also stays in-process with no Obsidian, because the stand-in for the CLI call runs the real template against the simulated vault and plugin.
>
> | Option | Description |
> |--------|-------------|
> | A | One step: each check calls the similar-notes search with a stand-in for the CLI call that runs the real detection script against the simulated vault and plugin, then confirms the returned failure (code, `details.code`, detail, reason) or the returned results. |
> | B | Detection only: each check runs the detection script against the simulated vault and plugin and confirms the raw detection answer. How that answer becomes the agent's failure stays covered by the existing reporting checks. |
> | C | Both layers: detection-only checks for every state and combination, plus one-step checks for each distinct failure (six), with no one-step checks for the combinations. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> A
>
> The BI's acceptance criteria are written as the failure "returned" to the agent, including precedence. Its Why and Impact name the gap: checks today confirm only how a ready-made answer is reported, not detection plus order. ADR-014 places all lifecycle codes in-eval, surfacing as `CLI_REPORTED_ERROR` with a `details.code`, so the check has to run from the template through to the envelope.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0077 - Add Regression Fixtures For Smart Connections Lifecycle States.md`, `200-Decisions/ADR-014 - Plugin-Backed Typed Tools Runtime-Dependency Pattern.md`

**Sent to the step:**

> A
>
> The BI's acceptance criteria are written as the failure "returned" to the agent, including precedence. Its Why and Impact name the gap: checks today confirm only how a ready-made answer is reported, not detection plus order. ADR-014 places all lifecycle codes in-eval, surfacing as `CLI_REPORTED_ERROR` with a `details.code`, so the check has to run from the template through to the envelope.

## 4. pre-implementation / clarify (2026-11-04T10:11:21.277Z)

**Question (verbatim):**

> **Question:** Should the checks also cover active mode, where the search uses the note focused in Obsidian and fails with `ERR_NO_ACTIVE_FILE` when no note is focused, or only specific mode, where the agent names the vault and note? (FR-006)
>
> Why it matters: the backlog item's acceptance criteria name only a missing or non-note target. If active mode is left out, its place in the order (after not-installed, before not-ready) stays unproven, and the spec's current Edge Cases and FR-006 text, which include it, would have to be cut back.
>
> **Context:** CodeGraph shows that active mode takes its own branch in `JS_TEMPLATE` (`src/tools/smart_connections_similar/_template.ts:10-12`). That branch runs after the not-installed check and before the not-a-note and not-ready checks. `mapEnvelopeError` (`handler.ts:61-69`) turns it into a different top-level code, `ERR_NO_ACTIVE_FILE` rather than `CLI_REPORTED_ERROR`, so it is the one lifecycle-adjacent failure that does not reach the agent as `details.code`. The documented precedence chain says active mode puts `NO_ACTIVE_FILE` in the place of `FILE_NOT_FOUND`.
>
> **Recommended:** Option B. It costs two or three small checks with the same stand-ins, and it proves the one branch whose failure reaches the agent differently. Option A would leave the order of a documented, different failure path unproven.
>
> | Option | Description |
> |--------|-------------|
> | A | Specific mode only: cover the states and combinations the backlog item names, and drop active mode from FR-006 and Edge Cases. |
> | B | Specific mode in full, plus active mode with no note focused: alone, under not-installed (not-installed wins), and with not-ready (no-focused-note wins). |
> | C | Both modes in full: repeat every state and combination in active mode as well. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> B
>
> The BI's Feature line requires failures "in the documented order of precedence". ADR-014 documents a separate active-mode chain: `NOT_INSTALLED` → `NO_ACTIVE_FILE` → `NOT_MARKDOWN` → `NOT_READY` → `SOURCE_NOT_INDEXED`. Its no-focused-note step is the only one in that chain that reaches the agent differently, so prove it there. Running the full active-mode matrix again goes beyond the BI's precedence criteria.

Sources: `200-Decisions/ADR-014 - Plugin-Backed Typed Tools Runtime-Dependency Pattern.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0077 - Add Regression Fixtures For Smart Connections Lifecycle States.md`

**Sent to the step:**

> B
>
> The BI's Feature line requires failures "in the documented order of precedence". ADR-014 documents a separate active-mode chain: `NOT_INSTALLED` → `NO_ACTIVE_FILE` → `NOT_MARKDOWN` → `NOT_READY` → `SOURCE_NOT_INDEXED`. Its no-focused-note step is the only one in that chain that reaches the agent differently, so prove it there. Running the full active-mode matrix again goes beyond the BI's precedence criteria.

## 5. pre-implementation / clarify (2026-11-04T10:12:21.942Z)

**Question (verbatim):**

> **Question:** How should the item prove that the new checks really catch a detection step that is swapped or dropped: one recorded manual exercise while it is built, a permanent automated check, or the coverage argument alone? (FR-012, SC-003)
>
> Why it matters: this promise is the reason the item exists. How it is proven decides whether the proof is a one-time record or something that runs on every build, and how much brittle test code the item adds.
>
> **Context:** CodeGraph shows that the five detection steps are not separate, reorderable units. They are inline `if (...) return JSON.stringify({ok:false,...})` lines inside the single frozen `JS_TEMPLATE` string (`src/tools/smart_connections_similar/_template.ts:8-29`), and ADR-014 keeps those lifecycle branches byte-identical. A permanent automated check would have to rewrite that string, for example by swapping or deleting lines, and run each altered copy through the new checks. Such a check breaks whenever the template's text changes, even when its behaviour does not.
>
> **Recommended:** Option A. The combination checks in FR-008 already fail on any adjacent swap by construction. A one-off exercise, recorded with its outcome, shows this held in practice without committing string-surgery tests that ADR-014's frozen template would make brittle.
>
> | Option | Description |
> |--------|-------------|
> | A | One recorded manual exercise: while the item is built, swap each adjacent pair of steps and drop each step in a scratch copy, run the new checks, and record in the item's records which check failed for each change. Nothing extra is committed to the test suite. |
> | B | Permanent automated check: a committed test makes altered copies of the template (each adjacent swap, each drop) and asserts that the new checks fail on every copy, on every build. |
> | C | Coverage argument only: rely on FR-008 covering every adjacent pair that can occur at once, with no exercise run or recorded. Drop SC-003's "confirmed once, by hand". |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> A
>
> The permanent guard is the precedence checks themselves; the BI asks that these run before every release ("Story: precedence", "Story: proven on demand"). The BI is tier-3 / `impact: 03-low`, and nothing in it or in the Constitution asks for committed mutation tests. A one-off recorded exercise gives the evidence without brittle string-surgery code.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0077 - Add Regression Fixtures For Smart Connections Lifecycle States.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

**Sent to the step:**

> A
>
> The permanent guard is the precedence checks themselves; the BI asks that these run before every release ("Story: precedence", "Story: proven on demand"). The BI is tier-3 / `impact: 03-low`, and nothing in it or in the Constitution asks for committed mutation tests. A one-off recorded exercise gives the evidence without brittle string-surgery code.

## 6. pre-implementation / analyze (2026-11-04T10:21:38.873Z)

**Question (verbatim):**

> Would you like me to suggest concrete remediation edits for the top 3 issues (C1: add the FR-014 stop rule to tasks.md Standing rules; F2: fix the T018/T020 post-implement.md ordering; F1: narrow FR-012 to adjacent swaps or add one non-adjacent swap such as S1↔S4 to the exercise)?

**Advisor** (escalate: none):

> Yes. Suggest and apply all three.
>
> - C1: add the FR-014 stop rule to the tasks.md Standing rules.
> - F2: fix the T018/T020 ordering of post-implement.md.
> - F1: narrow FR-012 to adjacent swaps plus single-step drops. Add no non-adjacent swap.
>
> F1 follows the earlier clarify answer on FR-012 (option A): swap each adjacent pair and drop each step, once, by hand. The BI asks for precedence proven between adjacent states only ("Story: precedence"). C1 and F2 are consistency fixes inside the spec artefacts and change nothing in scope.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0077 - Add Regression Fixtures For Smart Connections Lifecycle States.md`, `200-Decisions/ADR-014 - Plugin-Backed Typed Tools Runtime-Dependency Pattern.md`

**Sent to the step:**

> Yes. Suggest and apply all three.
>
> - C1: add the FR-014 stop rule to the tasks.md Standing rules.
> - F2: fix the T018/T020 ordering of post-implement.md.
> - F1: narrow FR-012 to adjacent swaps plus single-step drops. Add no non-adjacent swap.
>
> F1 follows the earlier clarify answer on FR-012 (option A): swap each adjacent pair and drop each step, once, by hand. The BI asks for precedence proven between adjacent states only ("Story: precedence"). C1 and F2 are consistency fixes inside the spec artefacts and change nothing in scope.

## 7. implementation / implement (2026-11-04T10:30:33.843Z)

**Question (verbatim):**

> T014 swap-and-drop exercise: edit M2 (swap S2 ↔ S3) failed 20 of the 24 checks, but contract §M says "all" must fail. L1, P3, P4 and A2 still pass. Each of them has the plugin `absent`, so S1 returns not-installed before the moved S3 guard runs. The M2 edit changes nothing in those states, so no check could catch it there. The other eight edits (M1, M3–M9) failed exactly the checks §M lists. Every edit failed at least one check, which meets SC-003. How should this be resolved?
>
> | Option | Description |
> |---|---|
> | A | Amend contract §M's M2 row from "all" to "all except the plugin-absent checks (L1, P3, P4, A2)". Record the amendment in exercise.md and in the contract. Mark T014 passed and continue with T015–T020. |
> | B | Keep §M as written and treat this as a gap in the checks. Add a check that can catch M2 in a plugin-absent state. This is impossible by design, because S1's early return comes first, so it would mean redesigning the exercise. |
> | C | Something else (please describe). |
>
> **Recommended: A.** The four checks that pass are states where a reordering of S2 and S3 has no effect: S1 returns before either step runs. So this is an error in the contract's expected list, not a gap in what the checks detect. The edit is still caught by 20 checks, and SC-003 ("every edit fails at least one check") is met.

**Advisor** (escalate: none):

> A
>
> ADR-014 places `NOT_INSTALLED` first in both chains, so when the plugin is absent the result does not depend on the order of the later steps. A swap of S2 and S3 cannot show up there. The contract's "all" was the error, not the checks. The BI's goal (a swapped or dropped check gets caught) is still met by the 20 failing checks and by SC-003.

Sources: `200-Decisions/ADR-014 - Plugin-Backed Typed Tools Runtime-Dependency Pattern.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0077 - Add Regression Fixtures For Smart Connections Lifecycle States.md`

**Sent to the step:**

> A
>
> ADR-014 places `NOT_INSTALLED` first in both chains, so when the plugin is absent the result does not depend on the order of the later steps. A swap of S2 and S3 cannot show up there. The contract's "all" was the error, not the checks. The BI's goal (a swapped or dropped check gets caught) is still met by the 20 failing checks and by SC-003.
