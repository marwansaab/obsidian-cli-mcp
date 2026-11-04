# Relay Q&A log: speckit

Run `obsidian-cli-mcp-bi-0027-2026-11-04`, started 2026-11-04T07:07:55.795Z.

## 1. checks / preflight (2026-11-04T07:07:55.839Z)

**Question (verbatim):**

> Preflight for this Relay run of job BI-0027. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0027 in the vault.
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

> Preflight for BI-0027: all checks passed.
>
> - **Vault identity:** `000-Meta/Vault Identity.md` has `vault_id` = `my-setup`, which matches `expected_vault_id` (read through obsidian-cli-mcp on vault `My-Setup-Vault`). The five session-start reads are done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover and About This Vault. I also read the Obsidian CLI MCP Tool Notes.
> - **Note:** `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0027 - Audit Tool Descriptions.md`. The H1 title is "BI-027 — Audit Tool Descriptions"; the frontmatter has no `title`. A companion note, `BI-0027 - Audit Tool Descriptions - Archive and Change Log.md`, also exists. It is an archive, not the job note.
> - **Initiative:** passed. The value is `[[Obsidian CLI MCP]]`.
> - **Status:** passed. The value is `planned` (not finished). Note: the Status section says the v1.0 trigger has not fired, because the Roadmap names no v1.0 candidate yet. The /speckit-specify prompt was rewritten 2026-11-03 at the owner's direction, so I'm carrying on.
> - **Specify prompt:** passed. The `## /speckit-specify prompt` section exists, and its code block starts with exactly `/speckit-specify Audit tool descriptions`. I didn't change the note.
> - **Clarify skill:** loaded as `anthropic-skills:speckit-clarify-skill` with "BI-0027 - Audit Tool Descriptions". Its answering rules apply to every question that follows.
>
> Primed for BI-0027 — Audit Tool Descriptions.
> Read: the BI (Status, specify prompt, Constitution and Related sections), the Constitution (vault mirror v1.5.1), the Architecture (Canonical contracts, Design-shaping constraints), ADR-005 (superseded), ADR-040 and ADR-046.
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.
> Could not access: Constitution v1.6.0 "MCP Tool Surface Standards". ADR-040 cites v1.6.0, but the vault mirror is still v1.5.1. I'll flag any question that depends on that section.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0027 - Audit Tool Descriptions.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-005 - Token-Optimized Tool Definitions via Progressive Disclosure.md`, `200-Decisions/ADR-040 - Published Parameter Descriptions and Server Instructions.md`, `200-Decisions/ADR-046 - Shared Parameter Names Within A Tool Family.md`, `000-Meta/MCP Tool Notes.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`, `210-Guidelines/Best Practices.md`, `200-Decisions/Decision Log.md`, `220-Planning/Session Handover.md`, `000-Meta/About This Vault.md`

**Sent to the step:**

> Preflight for BI-0027: all checks passed.
>
> - **Vault identity:** `000-Meta/Vault Identity.md` has `vault_id` = `my-setup`, which matches `expected_vault_id` (read through obsidian-cli-mcp on vault `My-Setup-Vault`). The five session-start reads are done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover and About This Vault. I also read the Obsidian CLI MCP Tool Notes.
> - **Note:** `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0027 - Audit Tool Descriptions.md`. The H1 title is "BI-027 — Audit Tool Descriptions"; the frontmatter has no `title`. A companion note, `BI-0027 - Audit Tool Descriptions - Archive and Change Log.md`, also exists. It is an archive, not the job note.
> - **Initiative:** passed. The value is `[[Obsidian CLI MCP]]`.
> - **Status:** passed. The value is `planned` (not finished). Note: the Status section says the v1.0 trigger has not fired, because the Roadmap names no v1.0 candidate yet. The /speckit-specify prompt was rewritten 2026-11-03 at the owner's direction, so I'm carrying on.
> - **Specify prompt:** passed. The `## /speckit-specify prompt` section exists, and its code block starts with exactly `/speckit-specify Audit tool descriptions`. I didn't change the note.
> - **Clarify skill:** loaded as `anthropic-skills:speckit-clarify-skill` with "BI-0027 - Audit Tool Descriptions". Its answering rules apply to every question that follows.
>
> Primed for BI-0027 — Audit Tool Descriptions.
> Read: the BI (Status, specify prompt, Constitution and Related sections), the Constitution (vault mirror v1.5.1), the Architecture (Canonical contracts, Design-shaping constraints), ADR-005 (superseded), ADR-040 and ADR-046.
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.
> Could not access: Constitution v1.6.0 "MCP Tool Surface Standards". ADR-040 cites v1.6.0, but the vault mirror is still v1.5.1. I'll flag any question that depends on that section.

## 2. pre-implementation / specify (2026-11-04T07:09:11.053Z)

**Question (verbatim):**

> Return the full content of the "/speckit-specify prompt" section of job BI-0027's note, verbatim and complete, in `answer`, without the surrounding code fence. Do not edit or summarise it. If the note has no such section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-specify Audit tool descriptions
>
> ## Feature
> Before the first stable release, every tool's always-loaded description meets one quality bar — short, self-contained, free of internal project references and consistent with its sibling tools — with the full detail kept in the on-demand help, and a release audit records a verdict for every registered tool against that bar.
>
> ## Why
> Agents load every tool description up front, before calling anything. Most descriptions are currently full reference manuals, which costs every agent session a large share of its working context, and several quote internal tracking numbers and requirement codes that mean nothing to an agent. The help pages already hold the detail, so the up-front text can be short without losing anything. One audit before the stable release is the last chance to fix the surface before outside users depend on it.
>
> ## User stories
> - As an agent, I want each tool's up-front description to tell me in a sentence or two what the tool does and when to choose it over its siblings, so that I can pick the right tool without loading pages of detail.
> - As an agent, I want to know from the up-front text where the full contract for each tool lives, so that I can fetch detail only when I need it.
> - As an agent, I want the published descriptions, including parameter descriptions and the help index, to contain no internal ticket, requirement or decision numbers, so that every sentence I read is about the tool.
> - As an agent, I want related tools to describe their relationship to each other the same way, and shared input fields to mean the same thing on every tool, so that their guidance never contradicts.
> - As a user whose agent loads this server, I want the total size of the up-front descriptions kept within a stated budget, so that the server does not crowd out my agent's working context.
> - As a maintainer, I want an audit report listing every registered tool with a verdict per quality check, so that I can see what blocks the stable release.
>
> ## Acceptance criteria
>
> **Story: short up-front descriptions**
> - Given any registered tool, when an agent reads its up-front description, then it states the tool's purpose and when to use it within the agreed length budget.
> - Given a detail removed from an up-front description, when the agent opens that tool's help page, then the detail is there.
>
> **Story: pointer to the full contract**
> - Given any registered tool, when an agent reads the up-front material the server publishes, then it is told that the help page holds that tool's full contract and how to open it.
>
> **Story: no internal references**
> - Given the full published tool list, its parameter descriptions and the help index, when they are scanned for internal ticket, requirement, decision or test identifiers, then none are found.
>
> **Story: consistent related tools**
> - Given a family of related tools, when an agent reads each member's guidance on when to use it, then each names the others and none contradicts another.
> - Given an input field that appears on several tools, when an agent reads its description on each, then its meaning and default agree, or the difference is stated.
>
> **Story: total budget**
> - Given the full published tool list, when its up-front descriptions are measured, then the total is within the stated budget.
>
> **Story: audit report**
> - Given a release candidate, when the audit runs, then every registered tool appears in the report with a verdict per check, the number of rows equals the number of registered tools, and each failing verdict explains the gap.
>
> ## Out of scope
> - The specific help and description mismatches already filed from the latest test run: help page section names, example errors, quoted messages, recovery hints, the over-long find-and-replace description, unknown-vault wording and the Bases family wording.
> - Changing any tool's behaviour, inputs or outputs.
> - Translating descriptions into other languages.
> - Help page wording and style beyond the checks above.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0027 - Audit Tool Descriptions.md`

**Sent to the step:**

> /speckit-specify Audit tool descriptions
>
> ## Feature
> Before the first stable release, every tool's always-loaded description meets one quality bar — short, self-contained, free of internal project references and consistent with its sibling tools — with the full detail kept in the on-demand help, and a release audit records a verdict for every registered tool against that bar.
>
> ## Why
> Agents load every tool description up front, before calling anything. Most descriptions are currently full reference manuals, which costs every agent session a large share of its working context, and several quote internal tracking numbers and requirement codes that mean nothing to an agent. The help pages already hold the detail, so the up-front text can be short without losing anything. One audit before the stable release is the last chance to fix the surface before outside users depend on it.
>
> ## User stories
> - As an agent, I want each tool's up-front description to tell me in a sentence or two what the tool does and when to choose it over its siblings, so that I can pick the right tool without loading pages of detail.
> - As an agent, I want to know from the up-front text where the full contract for each tool lives, so that I can fetch detail only when I need it.
> - As an agent, I want the published descriptions, including parameter descriptions and the help index, to contain no internal ticket, requirement or decision numbers, so that every sentence I read is about the tool.
> - As an agent, I want related tools to describe their relationship to each other the same way, and shared input fields to mean the same thing on every tool, so that their guidance never contradicts.
> - As a user whose agent loads this server, I want the total size of the up-front descriptions kept within a stated budget, so that the server does not crowd out my agent's working context.
> - As a maintainer, I want an audit report listing every registered tool with a verdict per quality check, so that I can see what blocks the stable release.
>
> ## Acceptance criteria
>
> **Story: short up-front descriptions**
> - Given any registered tool, when an agent reads its up-front description, then it states the tool's purpose and when to use it within the agreed length budget.
> - Given a detail removed from an up-front description, when the agent opens that tool's help page, then the detail is there.
>
> **Story: pointer to the full contract**
> - Given any registered tool, when an agent reads the up-front material the server publishes, then it is told that the help page holds that tool's full contract and how to open it.
>
> **Story: no internal references**
> - Given the full published tool list, its parameter descriptions and the help index, when they are scanned for internal ticket, requirement, decision or test identifiers, then none are found.
>
> **Story: consistent related tools**
> - Given a family of related tools, when an agent reads each member's guidance on when to use it, then each names the others and none contradicts another.
> - Given an input field that appears on several tools, when an agent reads its description on each, then its meaning and default agree, or the difference is stated.
>
> **Story: total budget**
> - Given the full published tool list, when its up-front descriptions are measured, then the total is within the stated budget.
>
> **Story: audit report**
> - Given a release candidate, when the audit runs, then every registered tool appears in the report with a verdict per check, the number of rows equals the number of registered tools, and each failing verdict explains the gap.
>
> ## Out of scope
> - The specific help and description mismatches already filed from the latest test run: help page section names, example errors, quoted messages, recovery hints, the over-long find-and-replace description, unknown-vault wording and the Bases family wording.
> - Changing any tool's behaviour, inputs or outputs.
> - Translating descriptions into other languages.
> - Help page wording and style beyond the checks above.

## 3. pre-implementation / specify (2026-11-04T07:12:53.342Z)

**Question (verbatim):**

> ## Question 1: Description length budgets
>
> **Context**: The spec says: "FR-001: Every registered tool's up-front description MUST state what the tool does and when to choose it over its siblings, in one or two sentences, within the per-tool budget of [NEEDS CLARIFICATION] characters." It also says: "FR-014: The sum of the lengths of every published tool description MUST stay within the total budget of [NEEDS CLARIFICATION] characters." Today the 35 registered tools publish 62,067 characters of tool description, from 216 (`delete`) to 4,046 (`find_and_replace`) per tool, against the existing hard cap of 4,096. The budgets count the tool description field only. Parameter descriptions are checked for internal IDs and consistency but are not budgeted. The largest family, the note writers, has 6 members, so a writer that names its 5 siblings spends about 100 characters on that alone.
>
> **What we need to know**: What per-tool and total character budgets should the up-front descriptions meet?
>
> **Suggested Answers**:
>
> | Option | Answer | Implications |
> |--------|--------|--------------|
> | A (recommended) | Per tool at most 400 characters; total at most 12,000 | About an 80% cut, roughly 3,000 tokens for the whole list. That leaves room for two sentences, a safety caveat and naming up to 5 siblings, and some headroom as tools are added. |
> | B | Per tool at most 600 characters; total at most 18,000 | About a 70% cut. Leaves room for a short result-shape hint as well, but more reference detail will creep back in. |
> | C | Per tool at most 250 characters; total at most 8,000 | About an 87% cut. Strictly one or two sentences. Destructive tools and large families will struggle to fit both their caveat and their siblings. |
> | Custom | Provide your own answer | Give the per-tool and total numbers, in characters. |
>
> **Recommended**: Option A. It is the tightest budget that still fits FR-002 (the data-loss caveat) and FR-011 (naming every sibling) for the largest family, and it keeps most of the saving.
>
> **Your choice**: _[Wait for user response]_

**Advisor** (escalate: decision: BI-0027 sets a per-tool budget of about 40–80 tokens (≈160–320 chars), but that figure comes from ADR-005, which ADR-040 superseded without setting a new number, and no note sets a total budget. Choosing the release-gate numbers is a new decision.):

> 1. Use A for now, pending the owner's ruling: per-tool description ≤ 400 chars, total ≤ 12,000 chars, counting the top-level `description` field only.
>
> Rationale: the BI's A.1 budget is "~40–80 tokens" (≈160–320 chars at the BI's own ~4 chars/token). It was set under ADR-005, which ADR-040 has since superseded, and ADR-040 sets no replacement number. The rewritten prompt also adds sibling naming and the data-loss caveat, which the old budget did not need to fit. 400 / 12,000 is the tightest figure that fits those, but it is looser than the BI's written figure, so the owner must confirm it.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0027 - Audit Tool Descriptions.md`, `200-Decisions/ADR-005 - Token-Optimized Tool Definitions via Progressive Disclosure.md`, `200-Decisions/ADR-040 - Published Parameter Descriptions and Server Instructions.md`

**Advisor, after the owner ruled** (escalate: none):

> 1. A
>
> Owner ruling 2026-11-04 (recorded on BI-0027): each tool description is at most 400 characters, and all tool descriptions together are at most 12,000 characters. Only the top-level `description` field counts toward these budgets. Parameter descriptions are checked for internal IDs and consistency but are not budgeted. These budgets replace the BI's A.1 "~40–80 tokens" figure, which came from ADR-005; ADR-040 superseded ADR-005 and set no number of its own.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0027 - Audit Tool Descriptions.md`, `200-Decisions/ADR-005 - Token-Optimized Tool Definitions via Progressive Disclosure.md`, `200-Decisions/ADR-040 - Published Parameter Descriptions and Server Instructions.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0027 - Audit Tool Descriptions.md`: Annotated Dimension A.1's "Length budget: ~40–80 tokens" with the owner ruling of 2026-11-04: at most 400 characters per tool and 12,000 in total, top-level description field only.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0027 - Audit Tool Descriptions.md`: Appended a dated HTML-comment record of the /speckit-clarify Q1 owner ruling (budgets, scope of the count, what it replaces and why).

**Owner:** choice 1 (A: 400 per tool / 12,000 total), via cli, 2026-11-04T07:13:46.959Z.

**Sent to the step:**

> 1. A
>
> Owner ruling 2026-11-04 (recorded on BI-0027): each tool description is at most 400 characters, and all tool descriptions together are at most 12,000 characters. Only the top-level `description` field counts toward these budgets. Parameter descriptions are checked for internal IDs and consistency but are not budgeted. These budgets replace the BI's A.1 "~40–80 tokens" figure, which came from ADR-005; ADR-040 superseded ADR-005 and set no number of its own.

## 4. pre-implementation / clarify (2026-11-04T07:16:17.179Z)

**Question (verbatim):**

> **Question:** Should each tool's entry in the help index be the exact same text as that tool's published description, or may it be written separately as long as it agrees? (FR-013)
>
> Why it matters: this decides whether the standing tests can check the index automatically or a reviewer has to compare 35 entries by hand at every release.
>
> Context: `executeHelp` (`src/tools/help/handler.ts:54`) returns `docs/tools/index.md` exactly as stored when `help` is called with no name. The index is written by hand. The only check on it, `src/tools/help/docs-sync.test.ts`, confirms that every offered tool has a `- **<name>** —` entry. It does not compare what the entry says. Some entries have already drifted from their tool's description and carry internal references, for example `context_search` ("eighteenth typed-tool wrap") and `write_note` (ADR-009).
>
> **Recommended:** Option A. One text cannot drift from itself, the standing tests can enforce it, and every description is now at most 400 characters, so the index stays small.
>
> | Option | Description |
> |--------|-------------|
> | A | The index entry is the tool's published description, word for word, and a standing check fails on any difference. |
> | B | The index entry is the first sentence of the tool's published description, and a standing check enforces it. |
> | C | The index entry is a separate one-line summary written by hand. A reviewer checks that it agrees with the description, and the internal-ID scan still covers it. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> B
>
> Rationale: BI-0030 set the index format to one line per tool ("an index.md … listing all tools with a one-line summary each"), and BI-0027 Dimension B keeps it at one row per tool. Copying the whole description (two sentences, siblings and a caveat, up to 400 chars) would break that format. Using the first sentence keeps a single source of text, so a standing test can check it automatically. `help` still returns `index.md` byte-for-byte (Progressive Disclosure feature page), so enforce the rule with a test, not by transforming the index at runtime.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0030 - Implement Progressive Disclosure Help Tool.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0027 - Audit Tool Descriptions.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/Progressive Disclosure.md`

**Sent to the step:**

> B
>
> Rationale: BI-0030 set the index format to one line per tool ("an index.md … listing all tools with a one-line summary each"), and BI-0027 Dimension B keeps it at one row per tool. Copying the whole description (two sentences, siblings and a caveat, up to 400 chars) would break that format. Using the first sentence keeps a single source of text, so a standing test can check it automatically. `help` still returns `index.md` byte-for-byte (Progressive Disclosure feature page), so enforce the rule with a test, not by transforming the index at runtime.

## 5. pre-implementation / clarify (2026-11-04T07:17:09.969Z)

**Question (verbatim):**

> **Question:** When a detail cut from a tool's description is a rule about one of its inputs, may it also go into that input's own parameter description, or only onto the help page? (FR-004)
>
> Why it matters: if input rules move only to the help page, an agent that never opens help loses rules it needs to get its first call right. If they all move into parameter descriptions, the context cost moves there instead.
>
> Context: Today `SET_PROPERTY_DESCRIPTION` (`src/tools/set_property/index.ts:9-18`) holds input rules in the tool description: the targeting combinations, that `date` / `datetime` values need an explicit `type`, and a client caveat about passing `type` for non-string values. Once that description is cut to 400 characters, those rules leave the up-front text. ADR-040 says a rule about a parameter belongs in that parameter's description, as one line. The spec's acceptance criteria already require every cut detail to appear on the help page. Parameter descriptions are not budgeted, by your earlier ruling.
>
> **Recommended:** Option A. It keeps ADR-040's rule that a parameter rule lives in the schema the agent is filling, so first calls still validate. Limiting it to one line about that input stops the long reference from moving into the schema.
>
> | Option | Description |
> |--------|-------------|
> | A | The help page always gets the detail. A rule about one input may also be added to that input's parameter description, as at most one sentence, where that description does not already say it. Everything else (result shapes, caps, error rosters, examples) goes to the help page only. |
> | B | The help page only. Parameter descriptions change only to remove internal IDs or to fix shared-field consistency. |
> | C | A rule about one input goes into that input's parameter description, and the help page also gets it. There is no one-sentence limit. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> A
>
> Rationale: ADR-040 gives each rule one home: a parameter rule goes in that parameter's description, as one line, and `help` keeps the long-form examples and error rosters "so the one-liners stay short". The target-mode combination rules already live once in the shared target-mode base schema descriptions (ADR-040 decision 3), so don't repeat them per tool.
>
> Note: don't carry `set_property`'s Cowork "pass an explicit `type`" caveat into the parameter description. Tool Notes (`set_property`) record it as stale on 0.9.0-local (Cowork honours native value types, observed 2026-11-03), and BI-0027 flags it as possibly stale.

Sources: `200-Decisions/ADR-040 - Published Parameter Descriptions and Server Instructions.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0027 - Audit Tool Descriptions.md`

**Sent to the step:**

> A
>
> Rationale: ADR-040 gives each rule one home: a parameter rule goes in that parameter's description, as one line, and `help` keeps the long-form examples and error rosters "so the one-liners stay short". The target-mode combination rules already live once in the shared target-mode base schema descriptions (ADR-040 decision 3), so don't repeat them per tool.
>
> Note: don't carry `set_property`'s Cowork "pass an explicit `type`" caveat into the parameter description. Tool Notes (`set_property`) record it as stale on 0.9.0-local (Cowork honours native value types, observed 2026-11-03), and BI-0027 flags it as possibly stale.

## 6. pre-implementation / clarify (2026-11-04T07:18:02.391Z)

**Question (verbatim):**

> **Question:** How should the release audit report be produced: generated from the live tool list by a repeatable command, written by hand with a test checking its rows, or replaced by the test results alone? (FR-018, FR-019)
>
> Why it matters: this decides whether the feature builds a new report generator, and whether the release check can run without a person re-filling 35 rows by hand.
>
> Context: The project already has one per-tool record built from the live tool list. `fingerprintLiveRegistry` (`src/tools/_register-baseline.ts:56`) lists the published tools through an in-memory client, and `scripts/write-register-baseline.ts` (`npm run baseline:write`) writes one entry per tool to `src/tools/_register-baseline.json`. The spec's checks fall into two kinds. Mechanical checks (budgets, internal IDs, the help pointer, index first-sentence match, row count) a machine can compute. Judgement checks (purpose and when-to-use, safety caveat kept, detail preserved, family consistency) need a reviewer.
>
> **Recommended:** Option A. It reuses the baseline writer's pattern: the live tool list sets the rows, so the row count can never drift. Mechanical verdicts are always recomputed. Only the judgement verdicts are kept by hand, and the generator flags a judgement verdict as needing review once the tool's description has changed since it was recorded.
>
> | Option | Description |
> |--------|-------------|
> | A | A repeatable command builds the report from the live tool list. It computes the mechanical verdicts and merges in the reviewer's judgement verdicts from a small hand-kept file. A judgement verdict recorded against an older description is shown as needing review. The standing tests also enforce the mechanical checks. |
> | B | The report is a hand-written document with one row per tool. A standing test checks that its rows match the registered tools, and the mechanical checks run as standing tests separately. |
> | C | There is no separate report. The standing tests are the audit, and the judgement checks are recorded once in this feature's review notes. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> A, with these additions:
> - Use the verdict values PASS / PARTIAL / FAIL / N/A, one verdict per check per tool, and add a gap paragraph for every FAIL or PARTIAL.
> - Make the command output Markdown, so the maintainer can file it as the release audit report. Filing the report is outside this feature.
>
> Rationale: BI-0027's Coverage matrix says the matrix is "generated dynamically at audit time from the live `tools/list` enumeration … NOT enumerated here", with one row per registered tool. The report itself is filed as a vault note (Operational step 7, `Obsidian CLI MCP - Audit Reports/<date> - v1.0 Tool Description Audit.md`). A repeatable command also fits the BI's trigger: the formal audit run happens at the v1.0 ship gate, not in this feature.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0027 - Audit Tool Descriptions.md`

**Sent to the step:**

> A, with these additions:
> - Use the verdict values PASS / PARTIAL / FAIL / N/A, one verdict per check per tool, and add a gap paragraph for every FAIL or PARTIAL.
> - Make the command output Markdown, so the maintainer can file it as the release audit report. Filing the report is outside this feature.
>
> Rationale: BI-0027's Coverage matrix says the matrix is "generated dynamically at audit time from the live `tools/list` enumeration … NOT enumerated here", with one row per registered tool. The report itself is filed as a vault note (Operational step 7, `Obsidian CLI MCP - Audit Reports/<date> - v1.0 Tool Description Audit.md`). A repeatable command also fits the BI's trigger: the formal audit run happens at the v1.0 ship gate, not in this feature.

## 7. pre-implementation / clarify (2026-11-04T07:19:37.987Z)

**Question (verbatim):**

> **Question:** When a later change edits a tool's description, should the standing tests fail until that tool's reviewer judgement verdicts are re-recorded, or should the stale verdict only show as "needs review" in the audit report? (FR-017, FR-021a)
>
> Why it matters: this decides whether description drift is caught on every pull request, or builds up quietly until the next release audit, and how much work each future description edit costs.
>
> Context: The project already gates the published surface on every pull request. `_register.test.ts` compares the live registry against `src/tools/_register-baseline.json` through `fingerprintLiveRegistry` (`src/tools/_register-baseline.ts:56`). A description change therefore already fails CI until the author runs `npm run baseline:write` in the same PR, which the constitution calls the deliberate-change gate. Under FR-021a, each judgement verdict is recorded against the description text it was judged on, so the same comparison can tell when a verdict has gone stale.
>
> **Recommended:** Option B. Every description edit already passes through the baseline gate, so re-judging the one or two edited tools in the same PR is a small extra step. It keeps the surface audit-clean between releases instead of leaving the backlog for the release gate.
>
> | Option | Description |
> |--------|-------------|
> | A | The standing tests enforce the mechanical checks only. A stale or missing judgement verdict shows as "needs review" in the audit report and is caught at the release audit. |
> | B | The standing tests also fail when any tool's judgement verdict is stale or missing, naming the tool. The author re-records that tool's verdicts in the same PR, like regenerating the fingerprint baseline. |
> | C | The standing tests print a warning, without failing, when a judgement verdict is stale or missing. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> A
>
> Rationale: per BI-0027's Status section, the BI "exists so individual feature BIs don't need their own description-quality sub-tasks — feedback aggregates here as each feature ships, and a single audit pass closes the loop just before v1.0 ships". A per-PR gate on judgement verdicts (B) would put that sub-task back on every feature BI. The BI's Out of scope section also excludes mid-cycle audits. Keep CI on the mechanical checks plus the existing fingerprint baseline gate, and show stale or missing judgement verdicts as "needs review" in the report.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0027 - Audit Tool Descriptions.md`

**Sent to the step:**

> A
>
> Rationale: per BI-0027's Status section, the BI "exists so individual feature BIs don't need their own description-quality sub-tasks — feedback aggregates here as each feature ships, and a single audit pass closes the loop just before v1.0 ships". A per-PR gate on judgement verdicts (B) would put that sub-task back on every feature BI. The BI's Out of scope section also excludes mid-cycle audits. Keep CI on the mechanical checks plus the existing fingerprint baseline gate, and show stale or missing judgement verdicts as "needs review" in the report.

## 8. pre-implementation / clarify (2026-11-04T07:20:21.779Z)

**Question (verbatim):**

> **Question:** How should the project check that an agent, reading only the short descriptions and the server instructions, picks the right tool for each task on its first try? (SC-008)
>
> Why it matters: as written, SC-008 cannot be verified. The answer decides whether this feature has to build and run a model evaluation, or whether a reviewer check is enough to sign it off.
>
> Context: the server instructions' routing guide is the `ROUTING` list in `src/instructions/instructions.ts:12`. It has 15 task-to-tool lines, such as "Find text: `search` (matching paths), `context_search` (matching lines), `pattern_search` (regex)". `buildInstructions` (`:48`) keeps a line only when every tool it names is offered. Those lines are the natural task list for the check. BI-0027 rules out mid-cycle audits, and the formal audit happens at the v1.0 gate.
>
> **Recommended:** Option A. It turns SC-008 into a check that can be repeated, using the routing list the server already publishes, without building model-evaluation tooling or running a paid model as part of the feature. It fits the reviewer-judgement path chosen in Q3.
>
> | Option | Description |
> |--------|-------------|
> | A | A reviewer walk-through. For each routing line, the reviewer checks that the descriptions alone send the task to the routed tool, and that no sibling's description claims the same task. The result is recorded in the family-consistency judgement verdicts, so a gap appears as a FAIL or PARTIAL with a gap paragraph. |
> | B | A scripted model evaluation: a model is given the tool list and instructions plus one prompt per routing line, and must pick the routed tool every time. It runs as part of this feature. |
> | C | Drop SC-008. The family-consistency and when-to-use checks already cover it. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> A
>
> Rationale: in Best Practices (Connectors and Integrations), the check that a description is enough to guide use without other documentation is a reviewer step in the test routine, not a model evaluation. A scripted model eval would be new tooling, and BI-0027 asks for none: its audit is reviewer-scored per dimension (Dimension E.1 covers cross-tool consistency). Recording the result in the family-consistency verdicts fits the report built in your earlier report question (A).

Sources: `210-Guidelines/Best Practices.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0027 - Audit Tool Descriptions.md`

**Sent to the step:**

> A
>
> Rationale: in Best Practices (Connectors and Integrations), the check that a description is enough to guide use without other documentation is a reviewer step in the test routine, not a model evaluation. A scripted model eval would be new tooling, and BI-0027 asks for none: its audit is reviewer-scored per dimension (Dimension E.1 covers cross-tool consistency). Recording the result in the family-consistency verdicts fits the report built in your earlier report question (A).

## 9. pre-implementation / plan (2026-11-04T07:39:31.845Z)

**Question (verbatim):**

> **Question 1:** Do you approve the rule-based edit list for existing tests in contract §X (`specs/092-audit-tool-descriptions/contracts/description-audit-contract.md`), including its stop rule? (refactor-decisions item 5)
>
> Why it matters: cutting every description to 400 characters makes 119 existing assertions fail: 110 pin a detail that moves to the help page, and 9 set a minimum description length. Two more pin text this feature must change: `search/schema.test.ts:25` counts `per BI-0086`, and `instructions.test.ts:93` pins the old `help` line. Item 5 forbids editing them without an enumerated, approved list.
>
> What §X proposes, row by row:
> - **X-L:** delete the 9 length lower bounds (`>= 400`, `> 300`, `> 200`). The new standing check enforces the 400 upper bound.
> - **X-P / X-P+:** the same phrase with the same matcher, but asserted on `docs/tools/<tool>.md` instead of the description. For `+` rows, the phrase is added verbatim to the page; the test is not reworded.
> - **X-A:** the same phrase, asserted on the parameter description that now holds the rule. One row: prepend `3072` moves to `content`.
> - **X-LOOP:** drop the description from the `[desc, param, page]` loops in `patch_heading` and `read_heading`. The parameter and page subjects stay.
> - **X-CV:** only if Question 2 is ruled A. Nine `closedVaultNote` assertions move to the help page's `Command "<cmd>" not found.`, and the helper's `_shared.test.ts` test is deleted with the helper.
> - **One-offs:**
>   - `_surface.test.ts:158-163`: the expectation `["views_base"]` becomes `[]`.
>   - `search/schema.test.ts:24-25`: the regex drops `per BI-0086`, still with exactly 2 matches.
>   - `instructions.test.ts:93`: the new help-line phrase.
> - **Stop rule:** any other existing assertion that fails stops the work and comes back to you. No expected value outside the list changes. The 38 LIKELY-KEEP assertions (tool's own name, sibling names, trash/irreversible, link rewriting, `keeps its type`, `{ tool_name: "help" }`) are kept by wording the descriptions to satisfy them, not by editing tests.
>
> **Recommended:** Option A. It keeps every pinned fact pinned, now at its new home, and it is the only option that also proves FR-004 ("the detail is on the help page") mechanically.
>
> | Option | Description |
> |--------|-------------|
> | A | Approve §X as written, with the stop rule. |
> | B | Approve X-L and the one-offs only. Delete the detail assertions (X-P / X-A / X-LOOP / X-CV) instead of retargeting them, and leave help-page coverage to the reviewer `detail` verdict. |
> | C | No blanket approval. Implement drafts all 35 descriptions first, then stops with the exact per-line diff of every test edit for you to approve. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: decision: The question asks for approval of an enumerated list of edits to existing tests (refactor-decisions item 5). Edits to existing tests are reserved for the owner, and no ruling on this list exists yet.):

> A (recommended, pending the owner's sign-off)
>
> Rationale: retargeting each pinned phrase to its new home (help page, or the parameter description per ADR-040's one-home-per-rule) keeps every fact pinned. It also proves FR-004 ("detail is on the help page") mechanically, which BI-0027's Story "short up-front descriptions" requires. Keep the stop rule as written. Apply X-CV only if Question 2 is ruled A; otherwise leave those nine assertions out of the list.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0027 - Audit Tool Descriptions.md`, `200-Decisions/ADR-040 - Published Parameter Descriptions and Server Instructions.md`

**Advisor, after the owner ruled** (escalate: none):

> A
>
> Owner ruling 2026-11-04 (recorded on BI-0027): the contract §X edit list for existing tests is approved as written, with its stop rule. Apply X-CV only if Question 2 is ruled A. Any existing assertion that fails and is not on the list stops the work and goes back to the owner. Keep the 38 LIKELY-KEEP assertions by wording the descriptions to satisfy them, not by editing the tests.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0027 - Audit Tool Descriptions.md`, `200-Decisions/ADR-040 - Published Parameter Descriptions and Server Instructions.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0027 - Audit Tool Descriptions.md`: Appended a dated HTML-comment record of the owner ruling approving contract §X's test-edit list (rows X-L, X-P/X-P+, X-A, X-LOOP, conditional X-CV, three one-offs) with its stop rule.

**Owner:** choice 1 (A: approve §X with stop rule), via cli, 2026-11-04T07:40:12.314Z.

**Sent to the step:**

> A
>
> Owner ruling 2026-11-04 (recorded on BI-0027): the contract §X edit list for existing tests is approved as written, with its stop rule. Apply X-CV only if Question 2 is ruled A. Any existing assertion that fails and is not on the list stops the work and goes back to the owner. Keep the 38 LIKELY-KEEP assertions by wording the descriptions to satisfy them, not by editing the tests.

## 10. pre-implementation / plan (2026-11-04T07:40:28.328Z)

**Question (verbatim):**

> **Question 2:** Where should the closed-vault note go, given that ADR-045 decision 2 says the descriptions carry it as one shared sentence, `closedVaultNote(command)`? (ADR-045, FR-003)
>
> Why it matters: the note is about 380 characters and sits in 9 descriptions (`bases`, `create_base`, `paths`, `pattern_search`, `query_base`, `smart_connections_query`, `smart_connections_similar`, `tag`, `views_base`). It cannot share a 400-character budget with a purpose sentence. Moving it contradicts the ADR as written, so per CLAUDE.md it needs your ruling, not a silent override.
>
> Context: all 9 help pages already contain the vault-unavailable answer (`Command "<cmd>" not found`). Only `tag.md` lacks the "opened automatically" sentence. The server instructions have 3 characters of headroom, so they cannot take a new line without cuts elsewhere.
>
> **Recommended:** Option A. It is failure behaviour, which FR-003 sends to the help page. The pages already hold it, and nothing else in production calls the helper.
>
> | Option | Description |
> |--------|-------------|
> | A | Move it to the help pages. The 9 descriptions drop it, `tag.md` gains "opened automatically", and `closedVaultNote` plus its unit test are deleted. ADR-045 decision 2 is amended to say the reference pages carry the note (your vault-side amendment). |
> | B | Keep a shortened shared sentence of about 170 characters in the 9 descriptions, for example "Closed vault: opened automatically; if it cannot be, the call fails with `CLI_REPORTED_ERROR` (`Error: Command "<cmd>" not found.`), never an empty result." ADR-045 stands as written, at a cost of about 40% of those tools' budgets. |
> | C | Move it to one cross-cutting line in the server instructions, trimming other instruction lines to make room. The descriptions and the helper drop it, and ADR-045 is amended to name the instructions. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: decision: ADR-045 decision 2 says the tool descriptions carry the shared closed-vault sentence. Options A and C both amend that decision, and option B keeps it at a cost of about 40% of those tools' 400-character budgets.):

> A (recommended, pending the owner's ruling)
>
> Rationale: ADR-045 decision 2 already has "the six reference pages carry a vault-unavailable row", so the help pages hold the substance today, and FR-003 sends failure behaviour to help. Under the owner's 400-character ruling, keeping about 380 characters (or about 170 in option B) in 9 descriptions leaves little room for the purpose and sibling sentences. Moving the note to the help pages means amending ADR-045 decision 2 in place (an amendment stanza, original text kept). Wait for the ruling before deleting `closedVaultNote`; your §X row X-CV depends on it.

Sources: `200-Decisions/ADR-045 - Closed Vaults Recovered Only By The Dispatch Retry.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0027 - Audit Tool Descriptions.md`

**Advisor, after the owner ruled** (escalate: none):

> A
>
> Owner ruling 2026-11-04 (recorded as Amendment 2026-11-04 on ADR-045 and on BI-0027):
> - Drop the closed-vault sentence from the 9 descriptions (`bases`, `create_base`, `paths`, `pattern_search`, `query_base`, `smart_connections_query`, `smart_connections_similar`, `tag`, `views_base`).
> - On each of those help pages, state the vault-unavailable answer (`Error: Command "<cmd>" not found.`, an uncoded `CLI_REPORTED_ERROR`) and that a closed registered vault is opened automatically. `tag.md` gains that second sentence.
> - Delete `closedVaultNote` and its unit test.
> - Apply contract §X row X-CV.
>
> The rest of ADR-045 stays as decided: the error is unchanged, with no `details.code` or `details.reason`, and it is recognised by `COLD_START_PATTERN`.

Sources: `200-Decisions/ADR-045 - Closed Vaults Recovered Only By The Dispatch Retry.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0027 - Audit Tool Descriptions.md`

Edits:
- `200-Decisions/ADR-045 - Closed Vaults Recovered Only By The Dispatch Retry.md`: Appended in-place "Amendment 2026-11-04" stanza: decision 2 amended so the reference (help) pages, not the nine tool descriptions, carry the vault-unavailable note; helper deleted; rest of the decision unchanged; original text preserved.
- `200-Decisions/ADR-045 - Closed Vaults Recovered Only By The Dispatch Retry.md`: Bumped frontmatter `updated` to 2026-11-04.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0027 - Audit Tool Descriptions.md`: Appended a dated HTML-comment record of the Question 2 owner ruling (closed-vault note to help pages, X-CV applies, ADR-045 amended, repo mirror needs re-sync).

**Owner:** choice 1 (A: move to help pages, amend ADR), via cli, 2026-11-04T07:41:20.685Z.

**Sent to the step:**

> A
>
> Owner ruling 2026-11-04 (recorded as Amendment 2026-11-04 on ADR-045 and on BI-0027):
> - Drop the closed-vault sentence from the 9 descriptions (`bases`, `create_base`, `paths`, `pattern_search`, `query_base`, `smart_connections_query`, `smart_connections_similar`, `tag`, `views_base`).
> - On each of those help pages, state the vault-unavailable answer (`Error: Command "<cmd>" not found.`, an uncoded `CLI_REPORTED_ERROR`) and that a closed registered vault is opened automatically. `tag.md` gains that second sentence.
> - Delete `closedVaultNote` and its unit test.
> - Apply contract §X row X-CV.
>
> The rest of ADR-045 stays as decided: the error is unchanged, with no `details.code` or `details.reason`, and it is recognised by `COLD_START_PATTERN`.

## 11. pre-implementation / analyze (2026-11-04T07:46:46.154Z)

**Question (verbatim):**

> ## Specification Analysis Report
>
> | ID | Category | Severity | Location(s) | Summary | Recommendation |
> |----|----------|----------|-------------|---------|----------------|
> | C1 | Coverage | MEDIUM | spec.md FR-017; contract §T Q1–Q6; tasks T005 | FR-017 lists "one report row per registered tool" among the standing mechanical checks. Q1–Q6 never render the live report, so only the fixture row T-REP1 covers the row count. | Add Q7: `renderAuditReport(collectPublishedSurface(), record, meta)` has exactly `tools.length` matrix rows with 9 cells each. Do not assert the verdicts, per Clarification Q4. |
> | I1 | Inconsistency (task ordering) | MEDIUM | tasks T007, T008, T018 | T018 is [P] and may start right after Phase 2. It edits `search/schema.ts`, `properties/schema.ts` and `read_property/schema.ts`, the same files T007 and T008 may edit for S7 rule moves. Parallel edits to one file could clash. | Make T018 depend on T007 and T008, or have T007 and T008 leave those root descriptions to T018. |
> | U1 | Underspecification | MEDIUM | data-model E1; tasks T003 `collectPublishedSurface` | The collector calls `createServer({ registerSignalHandlers: false })` with no `env`, so it reads the `OBSIDIAN_MCP_*` access flags from `process.env`. A developer shell with read-only mode or an allow/deny list would shrink the list, and Q1/Q2/report would pass on fewer than the largest tool list (spec edge case, FR-014). | Pass `env: {}` by default, so the full default list is always used. Optionally add a `toolCount === 35`-style guard in the report header. |
> | I2 | Inconsistency | MEDIUM | spec Edge Cases (stale claim: "the audit row notes that the claim is possibly stale"); data-model E9 / E10; tasks T029 | The report shows `gap` text only for FAIL/PARTIAL. A PASS `detail` verdict with a staleness note (set_property's client caveat, which stays on the help page) would never appear, so the spec's "row notes it" is not met. | Render a `## Notes` entry for any cell whose record carries `gap` text, whatever the verdict. Allow `gap` on PASS / N/A in the schema, which E9 already does implicitly. |
> | I3 | Inconsistency | LOW | contract §A2 vs tasks T002 | The contract gives `runVitestDump(source, dumpPath)`; T002 gives `runVitestDump(testFileName, makeSource(dumpPath))`. | Align the contract with T002's signature, since the dump path is created inside the runner. |
> | I4 | Inconsistency (task ordering) | LOW | tasks T005 vs T006 | T005 is [P] with T006, but its red-state run expects Q6 to pass, and Q6 needs T006's record file. | Run T005's red-state step after T006, or drop the [P]. |
> | T1 | Terminology | LOW | spec FR-015 "link-graph tools" vs data-model E6 `note-structure` | The family was renamed at plan time (noted in plan Phase 0), but the spec still uses the old name. | Optionally add "(called `note-structure` in the roster)" to FR-015, or leave it, since the plan records the rename. |
> | A1 | Ambiguity | LOW | spec FR-008 "names no individual tool" vs contract §I1 (backticks `help`) | The plan reads this as "names only `help`". The spec text alone reads stricter. | Optionally reword FR-008 to "names no tool other than `help`". |
>
> **Coverage Summary Table:**
>
> | Requirement Key | Has Task? | Task IDs | Notes |
> |-----------------|-----------|----------|-------|
> | FR-001 / FR-002 / FR-003 | Yes | T007–T015, T017 | Q1 standing |
> | FR-004 / FR-004a | Yes | T007–T015 (§H, S7), T029 | detail verdict |
> | FR-005 / FR-007 | Yes | T003, T004, T018, T020 | Q3, T-ID1–3 |
> | FR-006 | Yes | T007–T015, T019, T029 | selfContained verdict |
> | FR-008 / FR-009 / FR-010 | Yes | T021–T023 | Q4; existing FORBIDDEN test |
> | FR-011 / FR-011a / FR-015 | Yes | T003, T024, T026, T029 | |
> | FR-012 / FR-016 | Yes | T003, T025, T029 | |
> | FR-013 | Yes | T019 | Q5 |
> | FR-014 | Yes | T027 | Q2 |
> | FR-017 | Partial | T005 | see C1 |
> | FR-018 – FR-021b | Yes | T003, T004, T028–T030, T034 | |
> | FR-022 | Yes | T031, §X stop rule | baseline diff limited to description and schema fingerprints |
> | SC-001 – SC-009 (buildable) | Yes | T017, T027, T020, T029, T030, T033 | SC-008 → T026/T029 |
>
> **Constitution Alignment Issues:** none. Principles I–V and the MCP Tool Surface Standards (visible input rules kept via S7, instructions under 2,000 characters, baseline regenerated deliberately) are all addressed. The ADR-045 conflict was resolved by the owner's amendment.
>
> **Unmapped Tasks:** none. T001/T002 are setup; T031–T035 are polish.
>
> **CodeGraph (analyze rule):** HEAD is unchanged since planning (`ca36d07`). The plan's claim that no kernel node is touched (`createServer()`, `createLogger()`, `createQueue()`, `UpstreamError`) still holds.
>
> **Metrics:**
> - Total requirements: 30 (25 FRs plus 5 buildable SCs)
> - Total tasks: 35
> - Coverage: 100% (FR-017 partial, see C1)
> - Ambiguity count: 1
> - Duplication count: 0
> - Critical issues: 0
>
> **Next Actions:** there are no CRITICAL or HIGH issues, so `/speckit-implement` can proceed. Fixing C1, I1, U1 and I2 first would avoid rework: they are small edits to tasks.md, data-model.md and the contract.
>
> Would you like me to suggest concrete remediation edits for the top 4 issues?

**Advisor** (escalate: none):

> Yes. Apply remediation for C1, I1, U1, I2, I3 and I4 now. T1 and A1 are optional; apply A1's rewording.
>
> - **C1:** add Q7 as proposed: row count equals `tools.length`, 9 cells per row, verdicts not asserted. The BI's Coverage matrix requires one row per registered tool, generated from the live list.
> - **I1:** have T007 and T008 leave the root descriptions of `search`, `properties` and `read_property` to T018, and make T018 depend on T007 and T008. One owner per file edit.
> - **U1:** pass `env: {}` by default so the collector always measures the full default tool list, and add the tool-count guard to the report header. Owner access settings must not shrink the audited surface; TC-00603 / BI-0166 hold that the help index lists the full set whatever the owner settings.
> - **I2:** allow `gap` on any verdict and render a Notes entry wherever it is present. The BI's "one paragraph per FAIL or PARTIAL" is the minimum, not a cap, and the spec's stale-claim edge case needs the note on PASS too.
> - **I3:** align the contract with T002's signature.
> - **I4:** drop the [P] from T005, or run its red-state step after T006.
> - **A1:** reword FR-008 to "names no tool other than `help`". That matches ADR-040: `help` holds the long reference.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0027 - Audit Tool Descriptions.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Cases/TC-00603 - Help Index Lists Full Tool Set In Read Only Mode.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0166 - Reconcile 0.9.0 Help Doc And Description Drift.md`, `200-Decisions/ADR-040 - Published Parameter Descriptions and Server Instructions.md`

**Sent to the step:**

> Yes. Apply remediation for C1, I1, U1, I2, I3 and I4 now. T1 and A1 are optional; apply A1's rewording.
>
> - **C1:** add Q7 as proposed: row count equals `tools.length`, 9 cells per row, verdicts not asserted. The BI's Coverage matrix requires one row per registered tool, generated from the live list.
> - **I1:** have T007 and T008 leave the root descriptions of `search`, `properties` and `read_property` to T018, and make T018 depend on T007 and T008. One owner per file edit.
> - **U1:** pass `env: {}` by default so the collector always measures the full default tool list, and add the tool-count guard to the report header. Owner access settings must not shrink the audited surface; TC-00603 / BI-0166 hold that the help index lists the full set whatever the owner settings.
> - **I2:** allow `gap` on any verdict and render a Notes entry wherever it is present. The BI's "one paragraph per FAIL or PARTIAL" is the minimum, not a cap, and the spec's stale-claim edge case needs the note on PASS too.
> - **I3:** align the contract with T002's signature.
> - **I4:** drop the [P] from T005, or run its red-state step after T006.
> - **A1:** reword FR-008 to "names no tool other than `help`". That matches ADR-040: `help` holds the long reference.
