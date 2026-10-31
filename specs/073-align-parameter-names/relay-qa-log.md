# Relay Q&A log: speckit

Run `obsidian-cli-mcp-bi-0109-2026-10-31`, started 2026-10-31T09:12:36.471Z.

## 1. checks / preflight (2026-10-31T09:12:36.519Z)

**Question (verbatim):**

> Preflight for this Relay run of job BI-0109. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0109 in the vault.
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

> Primed for BI-0109 — Standardise Cohort Tool Parameter Names.
> Read: BI, Constitution (v1.5.1), Architecture (ARCH-014), ADR-010, plus Tool Notes (TN-003) and the five session-start reads (MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault).
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.
>
> Preflight results:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` has `vault_id` = `my-setup`, which matches `expected_vault_id` (read via display name `My-Setup-Vault`). Session-start reads done.
> 2. Backlog note: PASS. Found at `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0109 - Standardise Cohort Tool Parameter Names.md`. Title: "BI-0109 — Standardise Cohort Tool Parameter Names".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: planned`, re-validated 2026-10-31 against 0.9.0-local. Not finished or abandoned.
> 5. Specify prompt: PASS. The `## /speckit-specify prompt` section exists. Its command starts with exactly `/speckit-specify` (dash form), followed by the three-word prefix "Align parameter names". Note not changed.
> 6. Clarify skill: loaded (`anthropic-skills:speckit-clarify-skill`, ref "BI-0109 - Standardise Cohort Tool Parameter Names"). Its answer rules (letter only, or a caveman-full directive with a cited rationale) apply to every question that follows.
>
> Context worth carrying into the questions: ADR-010 covers tool names only. This BI is about parameter names and has no governing ADR yet. The BI keeps "upstream-fidelity vs cohort consistency" as a case-by-case judgement, and the BI body sets the transition policy: accept both names for one minor version, warn at runtime, remove the old name in the next major.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0109 - Standardise Cohort Tool Parameter Names.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-010 - Typed Tool Names Mirror Upstream CLI Subcommand.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`, `000-Meta/MCP Tool Notes.md`, `210-Guidelines/Best Practices.md`, `200-Decisions/Decision Log.md`, `220-Planning/Session Handover.md`, `000-Meta/About This Vault.md`

**Sent to the step:**

> Primed for BI-0109 — Standardise Cohort Tool Parameter Names.
> Read: BI, Constitution (v1.5.1), Architecture (ARCH-014), ADR-010, plus Tool Notes (TN-003) and the five session-start reads (MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault).
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.
>
> Preflight results:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` has `vault_id` = `my-setup`, which matches `expected_vault_id` (read via display name `My-Setup-Vault`). Session-start reads done.
> 2. Backlog note: PASS. Found at `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0109 - Standardise Cohort Tool Parameter Names.md`. Title: "BI-0109 — Standardise Cohort Tool Parameter Names".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: planned`, re-validated 2026-10-31 against 0.9.0-local. Not finished or abandoned.
> 5. Specify prompt: PASS. The `## /speckit-specify prompt` section exists. Its command starts with exactly `/speckit-specify` (dash form), followed by the three-word prefix "Align parameter names". Note not changed.
> 6. Clarify skill: loaded (`anthropic-skills:speckit-clarify-skill`, ref "BI-0109 - Standardise Cohort Tool Parameter Names"). Its answer rules (letter only, or a caveman-full directive with a cited rationale) apply to every question that follows.
>
> Context worth carrying into the questions: ADR-010 covers tool names only. This BI is about parameter names and has no governing ADR yet. The BI keeps "upstream-fidelity vs cohort consistency" as a case-by-case judgement, and the BI body sets the transition policy: accept both names for one minor version, warn at runtime, remove the old name in the next major.

## 2. pre-implementation / specify (2026-10-31T09:13:22.451Z)

**Question (verbatim):**

> Return the full content of the "/speckit-specify prompt" section of job BI-0109's note, verbatim and complete, in `answer`, without the surrounding code fence. Do not edit or summarise it. If the note has no such section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-specify Align parameter names
>
> ## Feature
> Tools in the same family use the same parameter name for the same concept, so a call pattern learned on one family member works on its siblings.
>
> ## Why
> The same concept carries different names across sibling tools: the property being read or written is identified by one parameter name on the property read and write tools but by a different one on the property search tool, and case handling, folder scope and base-file location are each named differently across their families. An agent that carries a call pattern from one sibling to another hits a validation error and wastes a round-trip.
>
> ## User stories
> - As an agent, I want the same concept to have the same parameter name across a tool family, so that a call that works on one tool works on its siblings.
> - As an agent with existing calls that use the old names, I want them to keep working for a transition period with a clear deprecation notice, so that my automation does not break without warning.
> - As a maintainer, I want a written list of every renamed parameter and every deliberately different one, so that future tools follow the same convention.
>
> ## Acceptance criteria
>
> **Story: consistent names**
> - Given the property read, write and search tools, when an agent names the property, then all three accept the same parameter name.
> - Given the search and replace tools, when an agent sets case handling or a folder scope, then the parameter has the same name and meaning across the family.
> - Given two parameters that look alike but mean different things, when the audit decides, then they keep distinct names and the difference is documented.
>
> **Story: transition period**
> - Given a call that uses a parameter's old name, when it is sent during the transition period, then it succeeds and the response says the name is deprecated.
> - Given the transition period has ended, when a call uses the old name, then it fails with a validation error that names the new parameter.
>
> **Story: documented convention**
> - Given the audit is complete, when a maintainer reads the result, then every family, its shared concepts, the chosen names and any justified exceptions are listed.
>
> ## Out of scope
> - Renaming tools themselves.
> - Changing any tool's behaviour beyond its parameter names.
> - Adding new tool families or tools.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0109 - Standardise Cohort Tool Parameter Names.md`

**Sent to the step:**

> /speckit-specify Align parameter names
>
> ## Feature
> Tools in the same family use the same parameter name for the same concept, so a call pattern learned on one family member works on its siblings.
>
> ## Why
> The same concept carries different names across sibling tools: the property being read or written is identified by one parameter name on the property read and write tools but by a different one on the property search tool, and case handling, folder scope and base-file location are each named differently across their families. An agent that carries a call pattern from one sibling to another hits a validation error and wastes a round-trip.
>
> ## User stories
> - As an agent, I want the same concept to have the same parameter name across a tool family, so that a call that works on one tool works on its siblings.
> - As an agent with existing calls that use the old names, I want them to keep working for a transition period with a clear deprecation notice, so that my automation does not break without warning.
> - As a maintainer, I want a written list of every renamed parameter and every deliberately different one, so that future tools follow the same convention.
>
> ## Acceptance criteria
>
> **Story: consistent names**
> - Given the property read, write and search tools, when an agent names the property, then all three accept the same parameter name.
> - Given the search and replace tools, when an agent sets case handling or a folder scope, then the parameter has the same name and meaning across the family.
> - Given two parameters that look alike but mean different things, when the audit decides, then they keep distinct names and the difference is documented.
>
> **Story: transition period**
> - Given a call that uses a parameter's old name, when it is sent during the transition period, then it succeeds and the response says the name is deprecated.
> - Given the transition period has ended, when a call uses the old name, then it fails with a validation error that names the new parameter.
>
> **Story: documented convention**
> - Given the audit is complete, when a maintainer reads the result, then every family, its shared concepts, the chosen names and any justified exceptions are listed.
>
> ## Out of scope
> - Renaming tools themselves.
> - Changing any tool's behaviour beyond its parameter names.
> - Adding new tool families or tools.

## 3. pre-implementation / specify (2026-10-31T09:16:25.344Z)

**Question (verbatim):**

> ## Question 1: How the transition period ends
>
> **Context**: The spec says: "During the transition period, every old name ... MUST be accepted and MUST produce the same result as the equivalent call under the new name" (FR-010). It also says: "After the transition period, a call that uses an old name MUST fail with a validation error that names the new parameter" (FR-014). Then: "The transition period MUST end by [NEEDS CLARIFICATION: how the transition period ends — a server setting the operator controls, a fixed later release, or a calendar date?]" (FR-015). Your acceptance criteria include behaviour both during and after the transition, so the end trigger decides whether this feature delivers and tests both phases. Old names stay declared (marked deprecated) in the published inputs for as long as the server recognises them, including after the transition, when they are only rejected. That way, clients that drop undeclared parameters cannot silently widen a scoped find_and_replace to the whole vault.
>
> **What we need to know**: What ends the transition period, during which old parameter names are accepted with a deprecation notice?
>
> **Suggested Answers**:
>
> | Option | Answer | Implications |
> |--------|--------|--------------|
> | A | A server setting the operator controls. It defaults to "accept old names with a notice" in this release; a later release flips the default to "reject". | Both phases ship and are tested in this feature. The operator can end the transition early or keep it longer. Adds one default-on setting alongside the existing environment flags. |
> | B | A fixed later release. This release accepts old names with a notice; the next minor release removes them in a separate follow-up feature. | Smallest change now. The post-transition acceptance criteria (rejection that names the new parameter) are specified here but delivered and tested in the follow-up feature, not this one. |
> | C | A calendar date (for example, 90 days after this release). After that date the server rejects old names on its own. | Both phases ship in this feature. Behaviour changes on a date with no release or operator action, which is harder to predict and to test. |
> | Custom | Provide your own answer | Describe the trigger, for example "remove at 1.0.0" or "setting, but default flips in 0.10.0". |
>
> **Recommended**: Option A. It is the only option that delivers and tests every acceptance criterion in your description within this feature. It also keeps the end of the transition a deliberate, reversible operator choice, not a date that passes on its own.
>
> **Your choice**: _[Wait for user response]_

**Advisor** (escalate: none):

> 1. Release-based trigger. This release: old names accepted, same result, deprecation notice in response. Removal (old name → validation error naming new parameter) ships in next major release as separate follow-up feature. No operator setting, no calendar date. Keep FR-014 in spec as end-state contract; mark it delivered and tested by removal follow-up, not this feature. FR-015: "Transition ends at the next major release; removal is a follow-up feature."
>
>    Per BI-0109 Impact: "accept both names for one minor version, deprecate the old name with a runtime warning, remove in the next major". Option A adds an operator setting the BI never asks for. Option B is close, but it says next minor; the BI says next major.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0109 - Standardise Cohort Tool Parameter Names.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0109 - Standardise Cohort Tool Parameter Names.md`: Appended 2026-10-31 HTML-comment clarification: transition end is release-based (removal in next major, separate follow-up BI); post-transition criterion specified here, delivered by follow-up.

**Sent to the step:**

> 1. Release-based trigger. This release: old names accepted, same result, deprecation notice in response. Removal (old name → validation error naming new parameter) ships in next major release as separate follow-up feature. No operator setting, no calendar date. Keep FR-014 in spec as end-state contract; mark it delivered and tested by removal follow-up, not this feature. FR-015: "Transition ends at the next major release; removal is a follow-up feature."
>
>    Per BI-0109 Impact: "accept both names for one minor version, deprecate the old name with a runtime warning, remove in the next major". Option A adds an operator setting the BI never asks for. Option B is close, but it says next minor; the BI says next major.

## 4. pre-implementation / clarify (2026-10-31T09:18:07.873Z)

**Question (verbatim):**

> **Question 1 — Where does the deprecation notice go in a successful response?**
>
> **Context**: FR-011 says a successful call that used an old name "MUST carry a deprecation notice in its response that names each old parameter used, its replacement and, for `case_insensitive`, the opposite polarity". The code index shows that `registerTool` (src/tools/_register.ts:205–237) checks each result against the tool's strict output schema (`spec.outputSchema?.parse(result)`). It then sends that one object twice, as the text JSON and as `structuredContent` (MCP Tool Surface Standards: `outputSchema` + `structuredContent` with identical text). The three affected tools (`find_by_property`, `find_and_replace`, `create_base`) all publish strict output schemas. So the notice either joins the published result or sits outside it.
>
> **Recommended:** Option A — the agent reads the result object, so a notice there is guaranteed to be seen. It keeps text and `structuredContent` identical as the standard requires, and it is easy to test. The cost is a deliberate output-schema change on three tools (the fingerprint baseline gate), which this feature's surface change needs anyway.
>
> | Option | Description |
> |--------|-------------|
> | A | Add one optional field with the same name on all three tools to the result object (in both the text JSON and `structuredContent`). It lists each old name used, its replacement and any polarity note, and is absent when only new names are used. The three output schemas change deliberately. |
> | B | Leave the result object unchanged and add the notice as a second text content block after the JSON. `structuredContent` stays as it is; text and structured data no longer match exactly when a notice is present. |
> | C | Put the notice in the result's protocol metadata (`_meta`) only. Neither the result object nor the output schemas change, but many clients never show `_meta` to the model, so the agent may never see the notice. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> A

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0126 - Standardise Heading Path Separator.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Cases/TC-00574 - Structured Tools Return Structured Content Identical To Text.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0109 - Standardise Cohort Tool Parameter Names.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0109 - Standardise Cohort Tool Parameter Names.md`: Appended 2026-10-31 HTML-comment clarification: deprecation notice is one optional, same-named field in the result object (text = structuredContent), with the rationale for rejecting the second text block and _meta.

**Sent to the step:**

> A

## 5. pre-implementation / clarify (2026-10-31T09:19:01.110Z)

**Question (verbatim):**

> **Question 2 — Where does the naming convention record live?**
>
> **Context**: FR-016 says "The project MUST hold a maintainer-facing convention record listing every tool family, the concepts its tools share, the parameter name each concept uses, every renamed parameter … and every deliberate exception with its reason". The Assumptions section only says it "lives in the repository's tracked maintainer documentation". The closest precedent is the tool-name convention: BI-0061 applied it, ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand) later made it normative, and the constitution then gained a per-PR Constitution Compliance row for it. Tracked ADR mirrors already live in `.docs-as-code/decisions/` (highest ADR-045).
>
> **Recommended:** Option A — the parameter-name convention is a durable rule that future tools must follow, which is what ADRs are for in this project. The ADR-010 precedent shows that leaving a convention only in feature prose loses it. The tracked mirror meets FR-016's "maintainer reads the result" without making this feature amend the constitution.
>
> | Option | Description |
> |--------|-------------|
> | A | A new ADR (next free number, a sibling of ADR-010) that records the convention: families, shared concepts, chosen names, the rename table and the exceptions. It is mirrored as a tracked page in `.docs-as-code/decisions/`. No constitution change. |
> | B | A tracked maintainer page only (for example, a section in `CONTRIBUTING.md` or a `.docs-as-code/` page). No ADR and no constitution change. |
> | C | Option A plus a constitution amendment that adds a Constitution Compliance checklist row, so every PR that adds or changes a parameter is checked against the convention (as ADR-010 got for tool names). |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: decision: The BI asks only for a "contract document". Recording it as an ADR creates a new decision, which only you can make. ADR numbering has also drifted: the vault's highest ADR is ADR-037 and the repo mirror's is ADR-045, so the number needs your allocation.):

> 2. A, pending owner ruling. Record convention in new ADR, sibling of ADR-010: families, shared concepts, chosen names, rename table, justified exceptions, upstream-fidelity vs cohort-consistency weighing. No constitution amendment, no Compliance row in this feature. Spec: FR-016 satisfied by that ADR plus its tracked mirror in `.docs-as-code/decisions/`. Leave ADR number as placeholder; owner allocates.
>
>    BI-0109 Impact asks for "a contract document listing all renames". ADR-010 Alternatives rejected "convention as BI prose only" because the rule loses its normative home. A constitution row is a separate amendment PR (Constitution Governance) and out of this BI's scope.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0109 - Standardise Cohort Tool Parameter Names.md`, `200-Decisions/ADR-010 - Typed Tool Names Mirror Upstream CLI Subcommand.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `200-Decisions/Decision Log.md`, `000-Meta/Bases/Type ID Index.base`

**Advisor, after the owner ruled** (escalate: none):

> A

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0109 - Standardise Cohort Tool Parameter Names.md`, `200-Decisions/ADR-010 - Typed Tool Names Mirror Upstream CLI Subcommand.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `000-Meta/Bases/Type ID Index.base`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0109 - Standardise Cohort Tool Parameter Names.md`: Appended 2026-10-31 HTML comment recording the owner ruling: the convention record is a new ADR (sibling of ADR-010) mirrored in .docs-as-code/decisions/, with no constitution row. ADR number is still unallocated because the vault (037) and repo (045) have drifted.

**Owner:** choice 1 (A: new ADR, no constitution row), via cli, 2026-10-31T09:21:10.967Z.

**Sent to the step:**

> A

## 6. pre-implementation / analyze (2026-10-31T09:31:58.420Z)

**Question (verbatim):**

> Would you like me to suggest concrete remediation edits for the top 4 issues (I1 description wording vs FR-008, C1 missing FR-008 test, I2 published-default note, U1 authoritative ADR location)?

**Advisor** (escalate: none):

> Yes. Suggest the remediation edits for all four and apply them to spec/plan/tasks. No approval round-trip is needed. Keep each fix within the behaviour the spec already settles: I1 changes the description wording to match FR-008, C1 adds the missing FR-008 test task, and I2 adds the published-default note. None of the three adds new scope.
>
> U1: the ADR's canonical authoring location is the vault (`200-Decisions/`). The repo's `.docs-as-code/decisions/` holds a verbatim tracked mirror, kept byte-equal after each sync. Write the repo mirror in this feature and use a placeholder for the ADR number (it is not allocated yet; the vault and repo numbering have drifted). Add a note that the vault copy is pending sync. The ADR carries no constitution row.
>
> Per ADR-010 Implementation (vault source plus repo mirror kept in lockstep) and the owner's Q2 ruling recorded on BI-0109.

Sources: `200-Decisions/ADR-010 - Typed Tool Names Mirror Upstream CLI Subcommand.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0109 - Standardise Cohort Tool Parameter Names.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

**Sent to the step:**

> Yes. Suggest the remediation edits for all four and apply them to spec/plan/tasks. No approval round-trip is needed. Keep each fix within the behaviour the spec already settles: I1 changes the description wording to match FR-008, C1 adds the missing FR-008 test task, and I2 adds the published-default note. None of the three adds new scope.
>
> U1: the ADR's canonical authoring location is the vault (`200-Decisions/`). The repo's `.docs-as-code/decisions/` holds a verbatim tracked mirror, kept byte-equal after each sync. Write the repo mirror in this feature and use a placeholder for the ADR number (it is not allocated yet; the vault and repo numbering have drifted). Add a note that the vault copy is pending sync. The ADR carries no constitution row.
>
> Per ADR-010 Implementation (vault source plus repo mirror kept in lockstep) and the owner's Q2 ruling recorded on BI-0109.
