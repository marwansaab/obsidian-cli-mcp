# Relay Q&A log: speckit

Run `obsidian-cli-mcp-bi-0072-2026-10-31`, started 2026-10-31T06:59:43.017Z.

## 1. checks / preflight (2026-10-31T06:59:43.065Z)

**Question (verbatim):**

> Preflight for this Relay run of job BI-0072. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0072 in the vault.
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

> Preflight for BI-0072: ready. All checks pass.
>
> - Vault identity: `000-Meta/Vault Identity.md` → `vault_id: my-setup`, which equals `expected_vault_id` `my-setup` (CLI display name `My-Setup-Vault`). PASS. The session-start reads are done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover and About This Vault. The Obsidian CLI MCP per-tool notes are read too.
> - Note: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md`. Title: "Refine Links DisplayText Emission For Fragment Bearing Wikilinks". Found. PASS.
> - Initiative: `"[[Obsidian CLI MCP]]"`. PASS.
> - Status: `planned` (re-validated 2026-10-31 against 0.9.0-local, still reproduces). The work is not finished or abandoned. PASS.
> - Specify prompt: the `## /speckit-specify prompt` section is present, and its command is exactly `/speckit-specify` (dash form), with the 3-word prefix "Omit derived labels". The note was not changed. PASS.
> - Clarify skill: `anthropic-skills:speckit-clarify-skill` loaded with "BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks". Its answering rules (bare letter for a perfect match, otherwise a caveman-full directive plus a cited rationale) apply to every question that follows.
>
> Primed for BI-0072 — Refine Links DisplayText Emission For Fragment Bearing Wikilinks.
> Read: BI, Constitution (v1.5.1), Architecture (Canonical contracts), ADR-003, `links` feature page (FEAT-013), Obsidian CLI MCP Tool Notes (`links` quirks).
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-003 - Enforce Target Mode in Typed Tools.md`, `links (FEAT-013 feature page)`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`, `000-Meta/MCP Tool Notes.md`, `210-Guidelines/Best Practices.md`, `200-Decisions/Decision Log.md`, `220-Planning/Session Handover.md`, `000-Meta/About This Vault.md`

**Sent to the step:**

> Preflight for BI-0072: ready. All checks pass.
>
> - Vault identity: `000-Meta/Vault Identity.md` → `vault_id: my-setup`, which equals `expected_vault_id` `my-setup` (CLI display name `My-Setup-Vault`). PASS. The session-start reads are done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover and About This Vault. The Obsidian CLI MCP per-tool notes are read too.
> - Note: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md`. Title: "Refine Links DisplayText Emission For Fragment Bearing Wikilinks". Found. PASS.
> - Initiative: `"[[Obsidian CLI MCP]]"`. PASS.
> - Status: `planned` (re-validated 2026-10-31 against 0.9.0-local, still reproduces). The work is not finished or abandoned. PASS.
> - Specify prompt: the `## /speckit-specify prompt` section is present, and its command is exactly `/speckit-specify` (dash form), with the 3-word prefix "Omit derived labels". The note was not changed. PASS.
> - Clarify skill: `anthropic-skills:speckit-clarify-skill` loaded with "BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks". Its answering rules (bare letter for a perfect match, otherwise a caveman-full directive plus a cited rationale) apply to every question that follows.
>
> Primed for BI-0072 — Refine Links DisplayText Emission For Fragment Bearing Wikilinks.
> Read: BI, Constitution (v1.5.1), Architecture (Canonical contracts), ADR-003, `links` feature page (FEAT-013), Obsidian CLI MCP Tool Notes (`links` quirks).
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.

## 2. pre-implementation / specify (2026-10-31T07:00:20.759Z)

**Question (verbatim):**

> Return the full content of the "/speckit-specify prompt" section of job BI-0072's note, verbatim and complete, in `answer`, without the surrounding code fence. Do not edit or summarise it. If the note has no such section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-specify Omit derived labels
>
> ## Feature
> When an agent lists a note's outgoing links, a link that points at a heading or block inside another note reports a display label only when the note's author actually wrote one, the same as every other link.
>
> ## Why
> Today an unaliased link to a heading or block, and an unaliased embed of a heading or block, come back with a made-up display label in the form "Note > Heading", copied from the editor's own link pane. The note contains no such label. Agents that detect author-written aliases by checking whether a label is present get false positives, and the help page has to teach a pattern-matching workaround instead of the tool keeping its own promise that a label appears only when the source has one. The same help page also says embeds never carry a label, which is not true for embeds of a heading or block.
>
> ## User stories
> - As an agent listing a note's outgoing links, I want links to a heading or block to carry no display label unless the author wrote one, so that I can detect real aliases with a single presence check.
> - As an agent listing a note's outgoing links, I want embeds of a heading or block to follow the same rule, so that links and embeds behave alike.
> - As an agent, I want author-written aliases on heading and block links to keep coming back exactly as written, so that no real information is lost.
> - As an agent reading the tool's help, I want it to describe the label rule without exceptions or workarounds, so that I can rely on the documentation.
>
> ## Acceptance criteria
>
> **Story: unaliased heading and block links carry no label**
> - Given a note containing a link to a heading in another note with no alias, when the agent lists its outgoing links, then that entry has no display label.
> - Given a note containing a link to a block in another note with no alias, when the agent lists its outgoing links, then that entry has no display label.
>
> **Story: unaliased heading and block embeds carry no label**
> - Given a note containing an embed of a heading in another note with no alias, when the agent lists its outgoing links, then that entry has no display label.
>
> **Story: author-written aliases are kept**
> - Given a link to a heading with the alias "Custom Display", when the agent lists outgoing links, then the entry's display label is "Custom Display".
> - Given a link to a block with the alias "Other Label", when the agent lists outgoing links, then the entry's display label is "Other Label".
> - Given a plain link with the alias "Alias", when the agent lists outgoing links, then the entry's display label is "Alias".
>
> **Story: existing plain-link behaviour unchanged**
> - Given a plain link or plain embed with no alias and no heading or block, when the agent lists outgoing links, then the entry has no display label, as today.
>
> **Story: help matches behaviour**
> - Given the tool's help page, when an agent reads the description of the display label, then it states the single rule (present only when the author wrote an alias) with no caveat or workaround for heading and block links.
>
> ## Out of scope
> - Links declared in a note's properties, which already follow the rule.
> - Display labels on standard Markdown links, which already report the written link text.
> - How the link target itself is reported, including the heading or block part.
> - Changing the editor's own link pane or how it labels links.
> - Incoming links (backlinks).

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md`

**Sent to the step:**

> /speckit-specify Omit derived labels
>
> ## Feature
> When an agent lists a note's outgoing links, a link that points at a heading or block inside another note reports a display label only when the note's author actually wrote one, the same as every other link.
>
> ## Why
> Today an unaliased link to a heading or block, and an unaliased embed of a heading or block, come back with a made-up display label in the form "Note > Heading", copied from the editor's own link pane. The note contains no such label. Agents that detect author-written aliases by checking whether a label is present get false positives, and the help page has to teach a pattern-matching workaround instead of the tool keeping its own promise that a label appears only when the source has one. The same help page also says embeds never carry a label, which is not true for embeds of a heading or block.
>
> ## User stories
> - As an agent listing a note's outgoing links, I want links to a heading or block to carry no display label unless the author wrote one, so that I can detect real aliases with a single presence check.
> - As an agent listing a note's outgoing links, I want embeds of a heading or block to follow the same rule, so that links and embeds behave alike.
> - As an agent, I want author-written aliases on heading and block links to keep coming back exactly as written, so that no real information is lost.
> - As an agent reading the tool's help, I want it to describe the label rule without exceptions or workarounds, so that I can rely on the documentation.
>
> ## Acceptance criteria
>
> **Story: unaliased heading and block links carry no label**
> - Given a note containing a link to a heading in another note with no alias, when the agent lists its outgoing links, then that entry has no display label.
> - Given a note containing a link to a block in another note with no alias, when the agent lists its outgoing links, then that entry has no display label.
>
> **Story: unaliased heading and block embeds carry no label**
> - Given a note containing an embed of a heading in another note with no alias, when the agent lists its outgoing links, then that entry has no display label.
>
> **Story: author-written aliases are kept**
> - Given a link to a heading with the alias "Custom Display", when the agent lists outgoing links, then the entry's display label is "Custom Display".
> - Given a link to a block with the alias "Other Label", when the agent lists outgoing links, then the entry's display label is "Other Label".
> - Given a plain link with the alias "Alias", when the agent lists outgoing links, then the entry's display label is "Alias".
>
> **Story: existing plain-link behaviour unchanged**
> - Given a plain link or plain embed with no alias and no heading or block, when the agent lists outgoing links, then the entry has no display label, as today.
>
> **Story: help matches behaviour**
> - Given the tool's help page, when an agent reads the description of the display label, then it states the single rule (present only when the author wrote an alias) with no caveat or workaround for heading and block links.
>
> ## Out of scope
> - Links declared in a note's properties, which already follow the rule.
> - Display labels on standard Markdown links, which already report the written link text.
> - How the link target itself is reported, including the heading or block part.
> - Changing the editor's own link pane or how it labels links.
> - Incoming links (backlinks).

## 3. pre-implementation / clarify (2026-10-31T07:02:54.761Z)

**Question (verbatim):**

> **Question 1 of up to 5 — which link fragments does the rule cover?**
>
> **Context**: FR-001 limits the fix to wiki-style links and embeds that point at a **heading or a block**. But Obsidian also accepts other `#` fragments in wiki links, such as PDF page fragments (`![[paper.pdf#page=3]]`). With no alias written, the editor most likely builds the same "File > fragment" label for those too. Graph fact: the `links` tool's eval template (`src/tools/links/_template.ts::JS_TEMPLATE`) is used only by `links/handler.ts` and its test. No other tool shares it (`backlinks` has its own template and reports no labels), so widening the rule stays inside the `links` tool.
>
> **What we need to know**: Should the "no label unless the author wrote one" rule cover only heading and block fragments, or every fragment?
>
> **Recommended:** Option A. The feature promises a single rule with no exceptions. Limiting it to headings and blocks would leave an undocumented exception for PDF pages and other fragments, and agents would still see false positives there.
>
> | Option | Description |
> |--------|-------------|
> | A | Cover any fragment-bearing wiki link or embed (heading, block, PDF page, or any other `#` fragment): no label unless the author wrote an alias |
> | B | Cover heading and block fragments only; other fragments keep today's behaviour, and the help says so |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> 1. A
>
> The BI's Impact section says the fix restores the Q1 contract ("displayText absent when source has no alias") uniformly across all wikilink and embed shapes. A heading-and-block-only rule would leave the exception the BI exists to remove.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md`, `links (FEAT-013 feature page)`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`

**Sent to the step:**

> 1. A
>
> The BI's Impact section says the fix restores the Q1 contract ("displayText absent when source has no alias") uniformly across all wikilink and embed shapes. A heading-and-block-only rule would leave the exception the BI exists to remove.

## 4. pre-implementation / clarify (2026-10-31T07:03:45.193Z)

**Question (verbatim):**

> **Question 2 of up to 5: does an image-size suffix count as an author-written alias?**
>
> **Context**: Obsidian reuses the alias separator on image embeds to set a size, for example `![[diagram.png|300]]` or `![[diagram.png|300x200]]`. The author wrote that text, but it is a size, not a display label. This is a plain embed (no fragment), so under FR-004 it keeps today's behaviour, which most likely reports `"300"` as the label. The help text will state one rule, so it has to say how this case fits that rule.
>
> **What we need to know**: How should size text after the separator on an embed be treated?
>
> **Recommended:** Option A. It keeps FR-004 intact (plain embeds unchanged) and keeps the rule mechanical and source-based: text the author wrote after the separator is reported as written. Telling sizes apart from labels would add parsing and a new exception, which is outside this feature's scope.
>
> | Option | Description |
> |--------|-------------|
> | A | Unchanged: size text is author-written text after the separator, so it is reported as the label exactly as written. The help phrases the rule as "the text the author wrote after the alias separator" |
> | B | Treat size text as not a label: omit it on embeds (changes plain-embed behaviour today, adds a size-detection rule) |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> 2. A
>
> The BI's specify prompt keeps existing plain-link and plain-embed behaviour unchanged, and it only removes labels the source never contains. Size text is written in the source, so detecting sizes would be new scope this BI does not carry.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md`, `links (FEAT-013 feature page)`

**Sent to the step:**

> 2. A
>
> The BI's specify prompt keeps existing plain-link and plain-embed behaviour unchanged, and it only removes labels the source never contains. Size text is written in the source, so detecting sizes would be new scope this BI does not carry.

## 5. pre-implementation / plan (2026-10-31T07:06:11.267Z)

**Question (verbatim):**

> **Plan question 1 of 2: should links declared in properties follow the same rule?**
>
> **Context**: The spec's Out of Scope list (and FR-004) says links declared in a note's properties "already follow the rule". A live probe against the test vault shows they do not: a property value `related: "[[Tgt#Head]]"` comes back from Obsidian's link cache with the derived label `"Tgt > Head"`, and the `links` tool reports it today as `displayText: "Tgt > Head"` on a `kind: "wikilink"` entry at `line: 1`. The fix needs no extra work for property links: each cache entry keeps the raw source text (`[[Tgt#Head]]`), so the same alias check applies.
>
> **Recommended:** Option A. Your Q1 answer framed this feature as restoring the label rule uniformly across all wikilink and embed shapes. Property links are reported as ordinary `wikilink` entries, so leaving them out would keep exactly the kind of exception this feature removes, and the help would still need a caveat.
>
> | Option | Description |
> |--------|-------------|
> | A | Include property links: a fragment-bearing link in a property carries no label unless the author wrote an alias. The spec's out-of-scope bullet and FR-004 are corrected to match the evidence |
> | B | Keep property links out of scope: they keep reporting derived labels, and the help documents that one exception |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: scope: The BI's specify prompt puts property-declared links explicitly out of scope, on the false premise that they already follow the rule. Bringing them in changes the scope the BI wrote down, though its Impact section asks for uniform behaviour.):

> 1. A. Include property links. Fragment-bearing link in a property: no label unless the author wrote an alias. Remove the "links declared in properties already follow the rule" out-of-scope bullet and correct FR-004 to match the probe.
>
> The BI's Impact section says the fix restores the Q1 contract "uniformly across all wikilink and embed shapes". The out-of-scope exclusion rested on a factual premise the probe disproved, and `links` reports property links as ordinary `wikilink` entries.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md`, `links (FEAT-013 feature page)`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md`: Appended a dated footer comment. It records the probe evidence that property links do carry derived labels (contradicting the prompt's out-of-scope bullet), notes the owner ruling is pending, and logs the clarify rulings so far (every # fragment covered; image-size text reported as written).

**Advisor, after the owner ruled** (escalate: none):

> 1. A
>
> Owner ruling 2026-10-31: include property links. Remove the "links declared in properties already follow the rule" out-of-scope bullet, correct FR-004, and add an acceptance criterion: a property containing an unaliased heading link reports an entry with no display label. This matches the BI's Impact section, which asks for uniform behaviour across all wikilink and embed shapes.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md`, `links (FEAT-013 feature page)`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md`: Appended a dated footer comment recording the owner ruling: property links are in scope, and this supersedes the specify prompt's false out-of-scope bullet. The prompt text was left unedited because the find_and_replace permission was denied. The earlier footer comment still says the ruling is pending; the new comment below it supersedes it.

**Owner:** choice 1 (Include property links), via cli, 2026-10-31T07:07:23.758Z.

**Sent to the step:**

> 1. A
>
> Owner ruling 2026-10-31: include property links. Remove the "links declared in properties already follow the rule" out-of-scope bullet, correct FR-004, and add an acceptance criterion: a property containing an unaliased heading link reports an entry with no display label. This matches the BI's Impact section, which asks for uniform behaviour across all wikilink and embed shapes.

## 6. pre-implementation / plan (2026-10-31T07:07:57.258Z)

**Question (verbatim):**

> **Plan question 2 of 2: how should an empty alias be reported?**
>
> **Context**: The spec says an empty alias on a fragment-bearing link carries no label, and that plain links keep today's empty-alias behaviour, which planning was to confirm. The probe shows Obsidian reports an empty label (`""`) for `[[Tgt|]]`, `[[Tgt#Head|]]` and `[[Tgt#Head| ]]` (a space-only alias is trimmed to empty), and the `links` tool passes it through today as `displayText: ""`, plain links included. So keeping plain links unchanged and dropping the empty label on fragment links would need a special case that splits one shape across two rules.
>
> **Recommended:** Option A. An empty label carries no information, and agents doing a single presence check would count it as an alias, which is the false positive this feature exists to remove. It is the same kind of defect on plain links, and changing it keeps one rule with no exceptions. The only visible change is that `displayText: ""` disappears from entries whose alias is empty or blank.
>
> | Option | Description |
> |--------|-------------|
> | A | One rule everywhere: an empty or blank alias counts as no alias, so no label on any wiki-style link or embed, plain or fragment-bearing (plain `[[Tgt|]]` stops reporting `""`) |
> | B | One rule the other way: writing the separator counts as an alias, so an empty label `""` is reported for plain and fragment-bearing links alike (the spec's empty-alias edge case is reversed) |
> | C | Split, as the spec reads now: no label on fragment-bearing links, `""` kept on plain links (a documented special case) |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> 2. A
>
> The BI's user story wants real aliases detectable "with a single presence check", and its Impact section asks for the Q1 contract to apply uniformly across all wikilink and embed shapes. `displayText: ""` breaks the presence check on any shape. The "plain links unchanged" story covers only plain links with no alias, so dropping `""` leaves it intact.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md`, `links (FEAT-013 feature page)`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md`: Appended a dated footer comment recording the plan Q2 answer: an empty or blank alias counts as no alias on every wiki-style link and embed. It includes the probe evidence and grounds.

**Sent to the step:**

> 2. A
>
> The BI's user story wants real aliases detectable "with a single presence check", and its Impact section asks for the Q1 contract to apply uniformly across all wikilink and embed shapes. `displayText: ""` breaks the presence check on any shape. The "plain links unchanged" story covers only plain links with no alias, so dropping `""` leaves it intact.

## 7. pre-implementation / analyze (2026-10-31T07:14:53.536Z)

**Question (verbatim):**

> Would you like me to suggest concrete remediation edits for the top 5 issues?
>
> The two HIGH issues need a decision before /speckit-implement:
>
> - **I1 (HIGH)**: The published rule in contracts/display-label.md says displayText appears only for a **non-empty** alias, Markdown links included. But data-model row 26 `[](Tgt.md#Head)` emits `displayText: ""`, and task T009 asserts it, because Markdown labels are out of scope (FR-004). Options: (a) apply the empty-label check to Markdown entries too, a one-term change that alters Markdown behaviour; or (b) keep `""` and limit the rule's non-empty condition to wiki-form aliases, documenting that empty Markdown text is reported as written.
> - **I2 (HIGH)**: FR-002, FR-006 and the US3 independent test say aliases come back "exactly as written, character for character". The plan emits Obsidian's parsed value, which may trim surrounding spaces (live probe G1, task T001, is pending). The remedy is to add a step after T001 that amends the spec wording to "as written, with surrounding whitespace trimmed, as the editor parses it" if trimming is confirmed. That matches today's plain-link behaviour.
>
> LOW: A1, make the T013 docs assertion an exact string; F1, use "frontmatter (property) links" once in the plan; U1, add "or image alt text" to the description sentence.

**Advisor** (escalate: none):

> Yes. Apply remediation edits for all five.
>
> I1: option (b). Keep `displayText: ""` on Markdown entries. Scope the non-empty-alias condition in contracts/display-label.md to wiki-form links and embeds. Document that Markdown link text, empty included, is reported as written. T009 stays as is.
> Rationale: the BI prompt's Out of scope puts "Display labels on standard Markdown links, which already report the written link text" outside the job.
>
> I2: accept your remedy. Add a step after T001. If the probe confirms trimming, amend FR-002, FR-006 and the US3 independent test to "as written, with surrounding whitespace trimmed, as the editor parses it". If no trimming, leave the wording.
> Rationale: the BI story's aim is "no real information is lost". Surrounding whitespace is not real information, and the parsed value matches today's plain-link behaviour, which the BI keeps unchanged.
>
> A1, F1, U1: apply as proposed.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md`, `links (FEAT-013 feature page)`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md`: Appended a dated footer comment recording the analyze-stage answers. I1: Markdown link text, empty included, is reported as written; the non-empty rule applies to wiki-form links only. I2: aliases are reported as parsed, and the spec wording changes to 'whitespace trimmed' if T001 confirms trimming.

**Sent to the step:**

> Yes. Apply remediation edits for all five.
>
> I1: option (b). Keep `displayText: ""` on Markdown entries. Scope the non-empty-alias condition in contracts/display-label.md to wiki-form links and embeds. Document that Markdown link text, empty included, is reported as written. T009 stays as is.
> Rationale: the BI prompt's Out of scope puts "Display labels on standard Markdown links, which already report the written link text" outside the job.
>
> I2: accept your remedy. Add a step after T001. If the probe confirms trimming, amend FR-002, FR-006 and the US3 independent test to "as written, with surrounding whitespace trimmed, as the editor parses it". If no trimming, leave the wording.
> Rationale: the BI story's aim is "no real information is lost". Surrounding whitespace is not real information, and the parsed value matches today's plain-link behaviour, which the BI keeps unchanged.
>
> A1, F1, U1: apply as proposed.
