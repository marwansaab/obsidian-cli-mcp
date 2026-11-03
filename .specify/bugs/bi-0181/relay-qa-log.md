# Relay Q&A log: speckit-bugfix

Run `obsidian-cli-mcp-bugfix-bi-0181-2026-11-03`, started 2026-11-03T10:17:25.657Z.

## 1. checks / preflight (2026-11-03T10:17:25.705Z)

**Question (verbatim):**

> Preflight for this Relay bug-fix run of job BI-0181. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0181 in the vault.
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

> Primed for BI-0181 — Normalise Tag Hash Prefix In Property Tools.
>
> - Vault identity: `000-Meta/Vault Identity.md` `vault_id` = `my-setup`, which equals `expected_vault_id` `my-setup`. PASS.
> - Session-start reads done: MCP Tool Notes (index), Best Practices, Decision Log, Session Handover, About This Vault. Also read the per-MCP Obsidian CLI MCP - Tool Notes.
> - Note: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0181 - Normalise Tag Hash Prefix In Property Tools.md`. Found. PASS.
> - Initiative: `[[Obsidian CLI MCP]]`. PASS.
> - Status: `planned`. Not finished or abandoned. PASS.
> - Variant: `bug-fix`. PASS.
> - Prompt section: no "/speckit-bug-assess prompt" section, but a "/speckit-specify prompt" section is present. It gives the expected behaviour: tag search finds every tagged note whatever the cache state, the same result on every repeat, a leading `#` is optional in the query, and the read form is consistent and documented. Out of scope: nested tags, inline body tags, other properties, how tags are stored. The note body also leaves it to the fix to check whether the `tag` tool shows the same two forms. Note not changed. PASS.
> - Clarify skill: loaded `anthropic-skills:speckit-clarify-skill` with "BI-0181 - Normalise Tag Hash Prefix In Property Tools". PASS.
> - Also read: Obsidian CLI MCP - Constitution (v1.5.1), Obsidian CLI MCP - Architecture, ADR-046 (Shared Parameter Names Within A Tool Family; covers `find_by_property` / `read_property`). Tool Notes already record the defect under `find_by_property` and `read_property`.
>
> Role: BA + Solution Architect, answering for the developer agent. Ready for questions.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0181 - Normalise Tag Hash Prefix In Property Tools.md`, `000-Meta/MCP Tool Notes.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`, `210-Guidelines/Best Practices.md`, `200-Decisions/Decision Log.md`, `220-Planning/Session Handover.md`, `000-Meta/About This Vault.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-046 - Shared Parameter Names Within A Tool Family.md`

**Sent to the step:**

> Primed for BI-0181 — Normalise Tag Hash Prefix In Property Tools.
>
> - Vault identity: `000-Meta/Vault Identity.md` `vault_id` = `my-setup`, which equals `expected_vault_id` `my-setup`. PASS.
> - Session-start reads done: MCP Tool Notes (index), Best Practices, Decision Log, Session Handover, About This Vault. Also read the per-MCP Obsidian CLI MCP - Tool Notes.
> - Note: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0181 - Normalise Tag Hash Prefix In Property Tools.md`. Found. PASS.
> - Initiative: `[[Obsidian CLI MCP]]`. PASS.
> - Status: `planned`. Not finished or abandoned. PASS.
> - Variant: `bug-fix`. PASS.
> - Prompt section: no "/speckit-bug-assess prompt" section, but a "/speckit-specify prompt" section is present. It gives the expected behaviour: tag search finds every tagged note whatever the cache state, the same result on every repeat, a leading `#` is optional in the query, and the read form is consistent and documented. Out of scope: nested tags, inline body tags, other properties, how tags are stored. The note body also leaves it to the fix to check whether the `tag` tool shows the same two forms. Note not changed. PASS.
> - Clarify skill: loaded `anthropic-skills:speckit-clarify-skill` with "BI-0181 - Normalise Tag Hash Prefix In Property Tools". PASS.
> - Also read: Obsidian CLI MCP - Constitution (v1.5.1), Obsidian CLI MCP - Architecture, ADR-046 (Shared Parameter Names Within A Tool Family; covers `find_by_property` / `read_property`). Tool Notes already record the defect under `find_by_property` and `read_property`.
>
> Role: BA + Solution Architect, answering for the developer agent. Ready for questions.

## 2. assess / bug-assess (2026-11-03T10:18:37.168Z)

**Question (verbatim):**

> Return the bug report for job BI-0181 as one message in `answer`, built only from the note's own text. Do not edit, summarise or add to it.
> - If the note has a "/speckit-bug-assess prompt" section: its full content, verbatim and complete, without the surrounding code fence.
> - Otherwise exactly this, with each section's full content verbatim and complete: a first line `/speckit-bug-assess slug=BI-0181`, a blank line, the line `## Impact` followed by the note's "Impact" section, a blank line, the line `## Status and evidence` followed by the note's "Status" section, a blank line, and the line `## Expected behaviour` followed by the content of its "/speckit-specify prompt" section without the surrounding code fence. Leave out any of the first two sections the note doesn't have.
> If the note has neither prompt section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-bug-assess slug=BI-0181
>
> ## Impact
> Frontmatter tags are written without `#` (`tags: [bi-0166]`), and that is the form agents use when they look them up. Because the metadata cache adds `#` once Obsidian re-parses a note, the same tag is reported in two forms depending on cache state, and a lookup by the written form silently misses every re-parsed note. Harms: (a) `find_by_property` on `tags` returns incomplete or empty results with no error — the answer changes as Obsidian re-parses notes in the background, which is why consecutive calls disagreed; (b) `read_property` returns a value that does not match the file's text, so read-compare-write logic sees a spurious difference; (c) tags are the most common lookup key in this vault's workflows (BI and TC tags, initiative tags). Normalising the leading `#` on both the read side and the comparison side makes the result independent of cache state.
>
> ## Status and evidence
> *Planned.* Filed 2026-11-02 from the 0.9.0-local test run of the 24 in-review BIs. Observed on `@marwansaab/obsidian-cli-mcp@0.9.0-local`, with no dedicated TC yet: after Obsidian re-parsed a note, its metadata cache reported the `tags` values with a leading `#`. `read_property` on `tags` returned `"#bi-0166"` for such a note, while notes not yet re-parsed returned the raw value `bi-0166`. `find_by_property` on `tags` with value `bi-0166` returned 0 matches; with `#bi-0166` it returned 11. An earlier probe in the same run saw the same `tags` lookup return 2 and then 0 results.
>
> ## Expected behaviour
> /speckit-specify Normalise tag prefixes
>
> ## Feature
> When an agent reads or searches by a note's tags, the tag values are reported and compared in one consistent form, whether or not the tag carries a leading hash sign in the vault's internal index.
>
> ## Why
> Once the vault re-indexes a note, its tags are reported with a leading hash sign, while notes not yet re-indexed report them without. A search by the tag as written in the note then misses every re-indexed note, and results change from one call to the next as indexing proceeds, with no error to warn the agent.
>
> ## User stories
> - As an agent, I want a search by tag to find every note carrying that tag, so that the result does not depend on when the vault last re-indexed each note.
> - As an agent, I want a search to accept the tag with or without a leading hash sign, so that either way of writing it works.
> - As an agent, I want reading a note's tags to return them in one documented form, so that I can compare them with what I wrote.
>
> ## Acceptance criteria
>
> **Story: complete tag search**
> - Given eleven notes tagged "project-x", some re-indexed by the vault and some not, when the agent searches by tag "project-x", then all eleven notes are returned.
> - Given the same notes, when the agent repeats the search, then the result is the same each time.
>
> **Story: hash sign optional in the query**
> - Given the same notes, when the agent searches by tag "#project-x", then the same eleven notes are returned.
>
> **Story: consistent read**
> - Given a note tagged "project-x", when the agent reads its tags before and after the vault re-indexes it, then the value is the same both times and matches the documented form.
>
> ## Out of scope
> - Nested tag hierarchies and partial tag matching.
> - Tags written inline in the note body.
> - Properties other than tags.
> - Changing how tags are stored in notes.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0181 - Normalise Tag Hash Prefix In Property Tools.md`

**Sent to the step:**

> /speckit-bug-assess slug=BI-0181
>
> ## Impact
> Frontmatter tags are written without `#` (`tags: [bi-0166]`), and that is the form agents use when they look them up. Because the metadata cache adds `#` once Obsidian re-parses a note, the same tag is reported in two forms depending on cache state, and a lookup by the written form silently misses every re-parsed note. Harms: (a) `find_by_property` on `tags` returns incomplete or empty results with no error — the answer changes as Obsidian re-parses notes in the background, which is why consecutive calls disagreed; (b) `read_property` returns a value that does not match the file's text, so read-compare-write logic sees a spurious difference; (c) tags are the most common lookup key in this vault's workflows (BI and TC tags, initiative tags). Normalising the leading `#` on both the read side and the comparison side makes the result independent of cache state.
>
> ## Status and evidence
> *Planned.* Filed 2026-11-02 from the 0.9.0-local test run of the 24 in-review BIs. Observed on `@marwansaab/obsidian-cli-mcp@0.9.0-local`, with no dedicated TC yet: after Obsidian re-parsed a note, its metadata cache reported the `tags` values with a leading `#`. `read_property` on `tags` returned `"#bi-0166"` for such a note, while notes not yet re-parsed returned the raw value `bi-0166`. `find_by_property` on `tags` with value `bi-0166` returned 0 matches; with `#bi-0166` it returned 11. An earlier probe in the same run saw the same `tags` lookup return 2 and then 0 results.
>
> ## Expected behaviour
> /speckit-specify Normalise tag prefixes
>
> ## Feature
> When an agent reads or searches by a note's tags, the tag values are reported and compared in one consistent form, whether or not the tag carries a leading hash sign in the vault's internal index.
>
> ## Why
> Once the vault re-indexes a note, its tags are reported with a leading hash sign, while notes not yet re-indexed report them without. A search by the tag as written in the note then misses every re-indexed note, and results change from one call to the next as indexing proceeds, with no error to warn the agent.
>
> ## User stories
> - As an agent, I want a search by tag to find every note carrying that tag, so that the result does not depend on when the vault last re-indexed each note.
> - As an agent, I want a search to accept the tag with or without a leading hash sign, so that either way of writing it works.
> - As an agent, I want reading a note's tags to return them in one documented form, so that I can compare them with what I wrote.
>
> ## Acceptance criteria
>
> **Story: complete tag search**
> - Given eleven notes tagged "project-x", some re-indexed by the vault and some not, when the agent searches by tag "project-x", then all eleven notes are returned.
> - Given the same notes, when the agent repeats the search, then the result is the same each time.
>
> **Story: hash sign optional in the query**
> - Given the same notes, when the agent searches by tag "#project-x", then the same eleven notes are returned.
>
> **Story: consistent read**
> - Given a note tagged "project-x", when the agent reads its tags before and after the vault re-indexes it, then the value is the same both times and matches the documented form.
>
> ## Out of scope
> - Nested tag hierarchies and partial tag matching.
> - Tags written inline in the note body.
> - Properties other than tags.
> - Changing how tags are stored in notes.

## 3. assess / resolve-assessment (2026-11-03T10:25:50.528Z)

**Question (verbatim):**

> Question 1 of 3 — Which form should `read_property` return `tags` values in, and which form should `find_by_property` compare them in?
>
> Context: Obsidian's metadata cache holds a `tags` list as written (`bi-0166`) after a file-watcher parse, but as `#bi-0166` after Obsidian's own frontmatter write (`property:set`, which `set_property` uses). The 11 `bi-0166` notes in My-Setup-Vault have no `#` in their file text. The `tag` tool already strips a leading `#` from its input (`src/tools/tag/schema.ts:13`).
>
> | Option | Description |
> |---|---|
> | A (recommended) | Without `#`: the form written in the file and the form agents write. `read_property` strips the `#`, and `find_by_property` strips it on both sides before comparing. |
> | B | With `#` (Obsidian's `getAllTags` form): add a `#` wherever it is missing. Consistent, but it differs from the file text, which is the report's read-compare-write harm (b). |
> | C | Leave `read_property` as it is and normalise only `find_by_property`'s comparison. Fixes search, but fails acceptance criterion 3 (a consistent read). |
>
> Recommended: A. It matches the file text, what agents write and the `tag` tool's rule, and it meets all three acceptance criteria.

**Advisor** (escalate: none):

> A
>
> The BI says harm (b) is that `read_property` returns a value that doesn't match the file text, and its tags are written without `#` (`tags: [bi-0166]`). The Impact section says to normalise the leading `#` on both the read side and the comparison side. Option A is the only one that meets all three acceptance criteria. Source: BI-0181, sections Impact and /speckit-specify prompt.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0181 - Normalise Tag Hash Prefix In Property Tools.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0181 - Normalise Tag Hash Prefix In Property Tools.md`: Added a ## Clarifications section before ## Related, recording the Q1 answer (tags reported and compared without a leading #) and the cache-state cause the developer agent reported (property:set gives the #-prefixed form).
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0181 - Normalise Tag Hash Prefix In Property Tools.md`: Set frontmatter updated to 2026-11-03.

**Sent to the step:**

> A
>
> The BI says harm (b) is that `read_property` returns a value that doesn't match the file text, and its tags are written without `#` (`tags: [bi-0166]`). The Impact section says to normalise the leading `#` on both the read side and the comparison side. Option A is the only one that meets all three acceptance criteria. Source: BI-0181, sections Impact and /speckit-specify prompt.

## 4. assess / resolve-assessment (2026-11-03T10:26:17.828Z)

**Question (verbatim):**

> Question 2 of 3 — Which property keys should the `#` normalisation apply to?
>
> Context: in the live probes (Obsidian 1.15.0, test vault), only a lowercase `tags` key holding a list was cached with `#` after `property:set`. `Tags: [cap]`, `tag: [sing]`, `aliases: [al]`, a custom list `keywords: [kw]` and a scalar `tags: single` all stayed raw. Both tools already match `name` exactly and case-sensitively (`find_by_property/_template.ts:15` uses `a.property in fm`; `read_property/handler.ts:59` uses `hasOwnProperty.call(parsedA, input.name)`). The report puts properties other than tags out of scope.
>
> | Option | Description |
> |---|---|
> | A (recommended) | Exactly `tags`, matched case-sensitively like every other `name`. Applies to string values, both list elements and a scalar string. |
> | B | `tags`, `tag` and any case variant (`Tags`, `TAGS`), matched case-insensitively. Broader, but no evidence these keys get the `#` form, and it diverges from the tools' exact-name rule. |
> | C | Every property whose Obsidian type is `tags` (from the `properties` catalogue). `read_property` has the type from Call B, but `find_by_property`'s eval would need an extra type lookup. More moving parts for no observed gain. |
>
> Recommended: A. It is the minimal repair, matches the probe evidence and the out-of-scope line, and keeps the tools' exact-name lookup unchanged.

**Advisor** (escalate: none):

> A
>
> The BI's /speckit-specify prompt puts "Properties other than tags" out of scope. The fix must not change how `name` is looked up in the property tools, which ADR-046 treats as one family sharing the `name` parameter.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0181 - Normalise Tag Hash Prefix In Property Tools.md`, `200-Decisions/ADR-046 - Shared Parameter Names Within A Tool Family.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0181 - Normalise Tag Hash Prefix In Property Tools.md`: Appended the Q2 answer to ## Clarifications: normalisation applies only to the exact key `tags` (case-sensitive), for list elements and a scalar string; recorded the developer agent's probe evidence.

**Sent to the step:**

> A
>
> The BI's /speckit-specify prompt puts "Properties other than tags" out of scope. The fix must not change how `name` is looked up in the property tools, which ADR-046 treats as one family sharing the `name` parameter.

## 5. assess / resolve-assessment (2026-11-03T10:26:37.371Z)

**Question (verbatim):**

> Question 3 of 3 — How many leading `#` characters should be stripped from a tag value?
>
> Context: the `tag` tool's input schema strips exactly one (`s.startsWith("#") ? s.slice(1) : s`, `src/tools/tag/schema.ts:13`). Obsidian adds exactly one `#` in its cache form.
>
> | Option | Description |
> |---|---|
> | A (recommended) | Exactly one leading `#`, on both the cached value and the query. A cached `##x` becomes `#x` and is matched only by the query `##x`. Same rule as the `tag` tool. |
> | B | All leading `#` characters (`/^#+/`). `##x`, `#x` and `x` all compare equal. More forgiving, but diverges from the `tag` tool and merges values Obsidian treats as distinct. |
>
> Recommended: A. It is consistent with the `tag` tool, reverses exactly what the cache adds, and is the smallest change.

**Advisor** (escalate: none):

> A
>
> BI-0181 asks to normalise "the leading `#`", the single `#` the metadata cache adds when a note is re-parsed. The `tag` tool strips one leading `#` from its input, and the fix uses the same rule (per the `tag` tool's description). Changing more than that would merge values the file keeps distinct, which is outside the bug.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0181 - Normalise Tag Hash Prefix In Property Tools.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0181 - Normalise Tag Hash Prefix In Property Tools.md`: Appended the Q3 answer to ## Clarifications: strip exactly one leading # on both the cached value and the query, matching the tag tool's rule.

**Sent to the step:**

> A
>
> BI-0181 asks to normalise "the leading `#`", the single `#` the metadata cache adds when a note is re-parsed. The `tag` tool strips one leading `#` from its input, and the fix uses the same rule (per the `tag` tool's description). Changing more than that would merge values the file keeps distinct, which is outside the bug.
