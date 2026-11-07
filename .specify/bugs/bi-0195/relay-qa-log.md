# Relay Q&A log: speckit-bugfix

Run `obsidian-cli-mcp-bugfix-bi-0195-2026-11-07`, started 2026-11-07T04:15:56.590Z.

## 1. checks / preflight (2026-11-07T04:15:56.653Z)

**Question (verbatim):**

> Preflight for this Relay bug-fix run of job BI-0195. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0195 in the vault.
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

> Primed for BI-0195 — Classify Smart Connections Similar Embedding And Stale Index Failures.
> Read: BI, Constitution (v1.5.1), Architecture, ADR-014 (and its 2026-11-01 amendment from ADR-045), ADR-015.
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.
>
> Readiness checks:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` has `vault_id` = `my-setup`, which equals `expected_vault_id`. All five session-start reads done (MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault).
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0195 - Classify Smart Connections Similar Embedding And Stale Index Failures.md`.
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `planned` (not finished or abandoned).
> 5. Variant: PASS. `bug-fix`.
> 6. Prompt section: PASS. There is no "/speckit-bug-assess prompt" section. A "/speckit-specify prompt" section is present and describes the expected behaviour. Note left unchanged.
> 7. Clarify skill: loaded (`anthropic-skills:speckit-clarify-skill`, ref "BI-0195 - Classify Smart Connections Similar Embedding And Stale Index Failures").
>
> Scope notes for the developer agent:
> - Two defects. (1) A source note with no embedding yet returns the raw `Invalid vector input to nearest()` error. It should be typed as `SOURCE_NOT_INDEXED`. (2) A stale index entry with an empty path fails the whole call (`envelope-parse`). That entry should be skipped.
> - On 2026-11-05 the owner approved widening the job: skipping stale entries also applies to `smart_connections_query`.
> - The leaked script in `details.argv` is BI-0197, not this job.
> - Outcomes for plugin not installed, not ready, and non-Markdown source must stay unchanged (ADR-014 order of checks).

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0195 - Classify Smart Connections Similar Embedding And Stale Index Failures.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-014 - Plugin-Backed Typed Tools Runtime-Dependency Pattern.md`, `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`, `000-Meta/MCP Tool Notes.md`, `210-Guidelines/Best Practices.md`, `200-Decisions/Decision Log.md`, `220-Planning/Session Handover.md`, `000-Meta/About This Vault.md`

**Sent to the step:**

> Primed for BI-0195 — Classify Smart Connections Similar Embedding And Stale Index Failures.
> Read: BI, Constitution (v1.5.1), Architecture, ADR-014 (and its 2026-11-01 amendment from ADR-045), ADR-015.
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.
>
> Readiness checks:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` has `vault_id` = `my-setup`, which equals `expected_vault_id`. All five session-start reads done (MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault).
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0195 - Classify Smart Connections Similar Embedding And Stale Index Failures.md`.
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `planned` (not finished or abandoned).
> 5. Variant: PASS. `bug-fix`.
> 6. Prompt section: PASS. There is no "/speckit-bug-assess prompt" section. A "/speckit-specify prompt" section is present and describes the expected behaviour. Note left unchanged.
> 7. Clarify skill: loaded (`anthropic-skills:speckit-clarify-skill`, ref "BI-0195 - Classify Smart Connections Similar Embedding And Stale Index Failures").
>
> Scope notes for the developer agent:
> - Two defects. (1) A source note with no embedding yet returns the raw `Invalid vector input to nearest()` error. It should be typed as `SOURCE_NOT_INDEXED`. (2) A stale index entry with an empty path fails the whole call (`envelope-parse`). That entry should be skipped.
> - On 2026-11-05 the owner approved widening the job: skipping stale entries also applies to `smart_connections_query`.
> - The leaked script in `details.argv` is BI-0197, not this job.
> - Outcomes for plugin not installed, not ready, and non-Markdown source must stay unchanged (ADR-014 order of checks).

## 2. assess / bug-assess (2026-11-07T04:16:52.910Z)

**Question (verbatim):**

> Return the bug report for job BI-0195 as one message in `answer`, built only from the note's own text. Do not edit, summarise or add to it.
> - If the note has a "/speckit-bug-assess prompt" section: its full content, verbatim and complete, without the surrounding code fence.
> - Otherwise exactly this, with each section's full content verbatim and complete: a first line `/speckit-bug-assess slug=BI-0195`, a blank line, the line `## Impact` followed by the note's "Impact" section, a blank line, the line `## Status and evidence` followed by the note's "Status" section, a blank line, and the line `## Expected behaviour` followed by the content of its "/speckit-specify prompt" section without the surrounding code fence. Leave out any of the first two sections the note doesn't have.
> If the note has neither prompt section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-bug-assess slug=BI-0195
>
> ## Impact
> An agent asking for notes similar to one it has just written gets an untyped plugin error it cannot act on, so it cannot tell "wait and retry" from "this is broken". A single moved or deleted note makes every similar-notes call that would have reached that entry fail outright, until the plugin re-indexes, which can take minutes. Both failures defeat the tool's typed-lifecycle contract ([[ADR-014 - Plugin-Backed Typed Tools Runtime-Dependency Pattern]]). The documented `SOURCE_NOT_INDEXED` state is effectively unreachable for the common case of a fresh note.
>
> ## Status and evidence
> *Planned* 2026-11-05 (Open Bugs triage: still valid; prompt already follows the `speckit-specify-skill`). **Widened 2026-11-05 (repo-session assessment C5, owner-approved):** the stale empty-path entry also fails `smart_connections_query` the same way (reproduced in-process, not live), so skipping outdated entries is in scope for both tools; the prompt's Out of scope line and one criterion changed to match. Filed 2026-11-05 from the black-box validation of the 0.9.0 BIs on the post-#145 0.9.0-local build, in `TestVault-Obsidian-CLI-MCP` with Smart Connections installed and indexed. At the owner's direction, this one BI holds every `smart_connections_similar` error-handling failure found in that run. Two defects:
>
> 1. **A source note with no embedding yet returns the plugin's raw error.** The plugin lists a note as a source before it has embedded it, so the "source not indexed" check passes and the plugin's lookup then throws. The tool returns `CLI_REPORTED_ERROR`, message `CLI bridge upstream error: CLI_REPORTED_ERROR`, stdout `Error: Invalid vector input to nearest()`, with no `details.code`. The whole internal script appears in `details.argv` (see [[BI-0197 - Withhold Internal Script From Error Details]]). This happens on any brand-new note probed straight after writing, and always on a short note. So `SOURCE_NOT_INDEXED` can't be reached for fresh notes on this plugin version. Evidence: [[TC-00892 - Smart Connections Similar Fresh Note Returns SOURCE_NOT_INDEXED Then Results|TC-00892]] (fail), [[TC-00899 - Smart Connections Similar Unembedded Source Returns Typed Error Not Raw Plugin Error|TC-00899]] (fail). The "then results" half of TC-00892 passed about 1–2 minutes later.
> 2. **One stale index entry fails the whole call.** After a note was moved, the plugin still held an entry for the old location. That entry comes back with an empty path, and the call fails with `smart_connections_similar: eval response shape unexpected` / `details.stage: "envelope-parse"`. A `limit` that cuts just above the stale entry succeeds. Evidence: [[TC-00225 - Smart Connections Similar Per Match Shape Is Exactly Three Fields|TC-00225]] (fail).
>
> Not a failure of [[BI-0077 - Add Regression Fixtures For Smart Connections Lifecycle States|BI-0077]] (its regression fixtures and lifecycle precedence pass) or of [[BI-0184 - Return Empty Heading Path For Pre-Heading Smart Connections Blocks|BI-0184]]. Both shipped in 0.9.0 under the owner's "ship + file new BI" rule.
>
> ## Expected behaviour
> /speckit-specify Classify similarity failures
>
> ## Feature
> Finding notes similar to a source note gives a clear, typed answer when the source has not been processed by the similarity plugin yet, and keeps working when the plugin's index still refers to a note that has since moved or been deleted.
>
> ## Why
> Today a brand-new or very short source note produces an unexplained plugin error instead of the documented "not indexed yet" answer, so agents cannot tell whether to wait or give up. A single outdated index entry makes the whole similar-notes request fail until the plugin catches up, even though every other result is valid.
>
> ## User stories
> - As an agent, I want a source note that has not been processed yet to be reported as not indexed, so that I know to wait and try again.
> - As an agent, I want the not-indexed answer to name the note, so that I can tell the user which note is still being processed.
> - As an agent, I want similar-notes results to still come back when the index refers to a note that no longer exists, so that one outdated entry does not block the whole request.
> - As a user, I want my agent to explain why similar notes are not available yet for a note I just wrote, so that I am not shown a confusing error.
>
> ## Acceptance criteria
>
> **Story: unprocessed source reported as not indexed**
> - Given a note written moments ago that the plugin lists but has not processed, when the agent asks for similar notes, then it receives the "source not indexed" outcome naming that note, not a raw plugin error.
> - Given a very short note that the plugin never processes, when the agent asks for similar notes, then it receives the "source not indexed" outcome, not a raw plugin error.
> - Given the same note once the plugin has processed it, when the agent asks again, then it receives similar-note results.
>
> **Story: outdated index entry does not break the request**
> - Given the plugin's index still holds an entry for a note that was moved or deleted, when the agent asks for similar notes, then the request succeeds and returns the valid matches, leaving out or clearly marking the outdated entry.
> - Given an outdated entry would have been among the results, when the agent reads the results, then no result has an empty or missing note path.
> - Given the same outdated entry, when the agent runs a free-text semantic search that would have matched it, then that search also succeeds without the outdated entry.
>
> **Story: unchanged outcomes stay unchanged**
> - Given the plugin is not installed, not ready, or the source is not a Markdown note, when the agent asks for similar notes, then it receives the same outcome as today.
>
> ## Out of scope
> - Making the plugin process new notes faster.
> - Rebuilding or repairing the plugin's index.
> - Changes to the free-text semantic search tool beyond skipping outdated index entries.
> - Changing which notes the plugin considers similar, or their scores and order.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0195 - Classify Smart Connections Similar Embedding And Stale Index Failures.md`

**Sent to the step:**

> /speckit-bug-assess slug=BI-0195
>
> ## Impact
> An agent asking for notes similar to one it has just written gets an untyped plugin error it cannot act on, so it cannot tell "wait and retry" from "this is broken". A single moved or deleted note makes every similar-notes call that would have reached that entry fail outright, until the plugin re-indexes, which can take minutes. Both failures defeat the tool's typed-lifecycle contract ([[ADR-014 - Plugin-Backed Typed Tools Runtime-Dependency Pattern]]). The documented `SOURCE_NOT_INDEXED` state is effectively unreachable for the common case of a fresh note.
>
> ## Status and evidence
> *Planned* 2026-11-05 (Open Bugs triage: still valid; prompt already follows the `speckit-specify-skill`). **Widened 2026-11-05 (repo-session assessment C5, owner-approved):** the stale empty-path entry also fails `smart_connections_query` the same way (reproduced in-process, not live), so skipping outdated entries is in scope for both tools; the prompt's Out of scope line and one criterion changed to match. Filed 2026-11-05 from the black-box validation of the 0.9.0 BIs on the post-#145 0.9.0-local build, in `TestVault-Obsidian-CLI-MCP` with Smart Connections installed and indexed. At the owner's direction, this one BI holds every `smart_connections_similar` error-handling failure found in that run. Two defects:
>
> 1. **A source note with no embedding yet returns the plugin's raw error.** The plugin lists a note as a source before it has embedded it, so the "source not indexed" check passes and the plugin's lookup then throws. The tool returns `CLI_REPORTED_ERROR`, message `CLI bridge upstream error: CLI_REPORTED_ERROR`, stdout `Error: Invalid vector input to nearest()`, with no `details.code`. The whole internal script appears in `details.argv` (see [[BI-0197 - Withhold Internal Script From Error Details]]). This happens on any brand-new note probed straight after writing, and always on a short note. So `SOURCE_NOT_INDEXED` can't be reached for fresh notes on this plugin version. Evidence: [[TC-00892 - Smart Connections Similar Fresh Note Returns SOURCE_NOT_INDEXED Then Results|TC-00892]] (fail), [[TC-00899 - Smart Connections Similar Unembedded Source Returns Typed Error Not Raw Plugin Error|TC-00899]] (fail). The "then results" half of TC-00892 passed about 1–2 minutes later.
> 2. **One stale index entry fails the whole call.** After a note was moved, the plugin still held an entry for the old location. That entry comes back with an empty path, and the call fails with `smart_connections_similar: eval response shape unexpected` / `details.stage: "envelope-parse"`. A `limit` that cuts just above the stale entry succeeds. Evidence: [[TC-00225 - Smart Connections Similar Per Match Shape Is Exactly Three Fields|TC-00225]] (fail).
>
> Not a failure of [[BI-0077 - Add Regression Fixtures For Smart Connections Lifecycle States|BI-0077]] (its regression fixtures and lifecycle precedence pass) or of [[BI-0184 - Return Empty Heading Path For Pre-Heading Smart Connections Blocks|BI-0184]]. Both shipped in 0.9.0 under the owner's "ship + file new BI" rule.
>
> ## Expected behaviour
> /speckit-specify Classify similarity failures
>
> ## Feature
> Finding notes similar to a source note gives a clear, typed answer when the source has not been processed by the similarity plugin yet, and keeps working when the plugin's index still refers to a note that has since moved or been deleted.
>
> ## Why
> Today a brand-new or very short source note produces an unexplained plugin error instead of the documented "not indexed yet" answer, so agents cannot tell whether to wait or give up. A single outdated index entry makes the whole similar-notes request fail until the plugin catches up, even though every other result is valid.
>
> ## User stories
> - As an agent, I want a source note that has not been processed yet to be reported as not indexed, so that I know to wait and try again.
> - As an agent, I want the not-indexed answer to name the note, so that I can tell the user which note is still being processed.
> - As an agent, I want similar-notes results to still come back when the index refers to a note that no longer exists, so that one outdated entry does not block the whole request.
> - As a user, I want my agent to explain why similar notes are not available yet for a note I just wrote, so that I am not shown a confusing error.
>
> ## Acceptance criteria
>
> **Story: unprocessed source reported as not indexed**
> - Given a note written moments ago that the plugin lists but has not processed, when the agent asks for similar notes, then it receives the "source not indexed" outcome naming that note, not a raw plugin error.
> - Given a very short note that the plugin never processes, when the agent asks for similar notes, then it receives the "source not indexed" outcome, not a raw plugin error.
> - Given the same note once the plugin has processed it, when the agent asks again, then it receives similar-note results.
>
> **Story: outdated index entry does not break the request**
> - Given the plugin's index still holds an entry for a note that was moved or deleted, when the agent asks for similar notes, then the request succeeds and returns the valid matches, leaving out or clearly marking the outdated entry.
> - Given an outdated entry would have been among the results, when the agent reads the results, then no result has an empty or missing note path.
> - Given the same outdated entry, when the agent runs a free-text semantic search that would have matched it, then that search also succeeds without the outdated entry.
>
> **Story: unchanged outcomes stay unchanged**
> - Given the plugin is not installed, not ready, or the source is not a Markdown note, when the agent asks for similar notes, then it receives the same outcome as today.
>
> ## Out of scope
> - Making the plugin process new notes faster.
> - Rebuilding or repairing the plugin's index.
> - Changes to the free-text semantic search tool beyond skipping outdated index entries.
> - Changing which notes the plugin considers similar, or their scores and order.

## 3. assess / resolve-assessment (2026-11-07T04:21:53.974Z)

**Question (verbatim):**

> Question 1 of 3 — [NEEDS CLARIFICATION] in Reproduction: Can a moved or deleted note leave stale Smart Connections index entries that keep the note's OLD, non-empty path (for example its block entries `old.md#Heading`), as well as the empty-path entry seen in TC-00225?
>
> Context: TC-00225 observed only an entry with an empty path after a note was moved. In plugin 4.7.2 an item's key is `data.key || data.path`, so an item whose data is cleared has no key, but the moved note's block entries (keyed `<old path>#<heading>` in `smart_blocks`) could still carry the old path. This assessment did not reproduce that live. The answer decides how wide the stale-entry filter must be (Question 2).
>
> | Option | Description |
> |---|---|
> | A (recommended) | Unknown, so treat it as possible: assume stale entries may keep an old path, and design the filter to catch both cases. |
> | B | Yes, it has been observed: entries with the old path do come back after a move or delete. |
> | C | No: only empty-path entries occur; entries that keep an old path need not be handled. |
>
> Recommended: A. No live evidence rules it out, and the plugin's block keys make it plausible. Assuming it costs only the vault-lookup filter in Question 2.

**Advisor** (escalate: decision: Option A's 'catch both cases' would filter stale entries that keep their old path from smart_connections_query. That reverses BI-0074's Q2 decision (stale deleted-file paths are passed through verbatim, no existence check), and the 2026-11-05 widening of BI-0195 only cited the empty-path entry. Only the owner can say whether BI-0195 replaces that pass-through.):

> 1. Treat as possible, not observed. Record in Reproduction: old-path stale entries are unconfirmed live. Neither the vault nor any TC rules them out. Do not mark as observed (B) or excluded (C). Do not widen the filter to old-path entries for `smart_connections_query` until the owner rules (see Question 2).
>
> The vault holds no observation either way. TC-00225 saw only the `path: ""` entry. TC-00261 expects a deleted note's old path to come back verbatim, but both of its runs were blocked: the plugin removed the deleted note before the next call. Caution: the Q2 clarification for `smart_connections_query` (BI-0074, Smart Connections Query feature page Caveats, TC-00261) fixed stale deleted-file paths as passed through verbatim, with no existence check. Filtering old-path entries there would reverse that decision.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0195 - Classify Smart Connections Similar Embedding And Stale Index Failures.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Cases/TC-00225 - Smart Connections Similar Per Match Shape Is Exactly Three Fields.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Cases/TC-00261 - Smart Connections Query Stale Index Deleted File Path Passes Through Unchanged.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/Smart Connections Query.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0074 - Add Smart Connections Query.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`

**Advisor, after the owner ruled** (escalate: none):

> 1. Treat as possible, not observed. In Reproduction, record that stale entries keeping a note's old, non-empty path are unconfirmed live and not ruled out. Size the filter per the owner ruling. `smart_connections_similar`: leave out both empty-path entries and entries whose old path no longer resolves to a vault note. `smart_connections_query`: leave out only empty-path entries; still pass non-empty stale paths through verbatim, with no existence check.
>
> Owner ruling 2026-11-07, "Filter old paths in similar only", now in the BI-0195 Status section. BI-0074 Q2 pass-through for query stands (TC-00261). TC-00225 saw only `path: ""`; both TC-00261 runs were blocked.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0195 - Classify Smart Connections Similar Embedding And Stale Index Failures.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Cases/TC-00225 - Smart Connections Similar Per Match Shape Is Exactly Three Fields.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Cases/TC-00261 - Smart Connections Query Stale Index Deleted File Path Passes Through Unchanged.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/Smart Connections Query.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0074 - Add Smart Connections Query.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0195 - Classify Smart Connections Similar Embedding And Stale Index Failures.md`: Appended to Status the 2026-11-07 owner ruling 'Filter old paths in similar only': similar leaves out empty-path and old-path stale entries; query leaves out only empty-path entries, and the BI-0074 Q2 pass-through stands.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0195 - Classify Smart Connections Similar Embedding And Stale Index Failures.md`: Frontmatter updated: 2026-11-05 → 2026-11-07.

**Owner:** choice 2 (Filter old paths in similar only), via cli, 2026-11-07T04:58:06.359Z.

**Sent to the step:**

> 1. Treat as possible, not observed. In Reproduction, record that stale entries keeping a note's old, non-empty path are unconfirmed live and not ruled out. Size the filter per the owner ruling. `smart_connections_similar`: leave out both empty-path entries and entries whose old path no longer resolves to a vault note. `smart_connections_query`: leave out only empty-path entries; still pass non-empty stale paths through verbatim, with no existence check.
>
> Owner ruling 2026-11-07, "Filter old paths in similar only", now in the BI-0195 Status section. BI-0074 Q2 pass-through for query stands (TC-00261). TC-00225 saw only `path: ""`; both TC-00261 runs were blocked.

## 4. assess / resolve-assessment (2026-11-07T04:58:38.927Z)

**Question (verbatim):**

> Question 2 of 3 — Open question Q1: Which outdated index entries should the shared filter (new fragment in `src/tools/_smart-connections.ts`, applied in both Smart Connections templates before the sort and the cut to `limit`) drop?
>
> Context: both templates turn each plugin candidate into a match via `TO_MATCH_JS` (`src/tools/_smart-connections.ts:11`; `smart_connections_similar/_template.ts:33`, `smart_connections_query/_template.ts:19`). Today they drop only non-finite scores before `SORT_SLICE_AND_EMIT`. An empty key gives `path: ""`, which fails `matchEntrySchema` (`path: z.string().endsWith(".md")`) and fails the whole call at `envelope-parse`.
>
> | Option | Description |
> |---|---|
> | A (recommended) | Keep a match only when its path is a Markdown note that exists in the vault now (`app.vault.getAbstractFileByPath(path)` returns a file with extension `md`). Drops empty paths and the old paths of moved or deleted notes. One in-memory lookup per candidate (at most 100), no extra spawn. The template test stubs must know the candidate paths (part of Question 3). |
> | B | Drop only matches whose path is empty. Fixes the observed failure with the fewest test edits, but an outdated entry that keeps its old path is still returned as a valid-looking match. |
> | C | Drop matches whose path does not end in `.md` (the output schema's rule). Also stops any other schema-rejected path from failing the call, but has the same gap as B for old paths. |
>
> Recommended: A. The acceptance criterion names entries "for a note that was moved or deleted", and only A leaves out the ones that still carry a real-looking path.

**Advisor** (escalate: none):

> 2. Use a separate filter per tool, not one shared filter for both. `smart_connections_similar`: apply A. Keep a match only when `app.vault.getAbstractFileByPath(path)` returns a file with extension `md`; drop everything else, including empty paths and the old paths of moved or deleted notes. `smart_connections_query`: apply B only. Drop matches whose path is empty; pass every non-empty path through verbatim, with no existence check. In both templates, run the filter before the sort and the cut to `limit`. A shared helper is fine only if each template picks its own rule.
>
> Per the owner ruling of 2026-11-07, "Filter old paths in similar only" (BI-0195 Status). The BI-0074 Q2 pass-through for stale non-empty paths in query stands (TC-00261 and the Smart Connections Query Caveats). Don't add a `.md`-suffix filter (C) to query; the ruling allows dropping only empty-path entries there.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0195 - Classify Smart Connections Similar Embedding And Stale Index Failures.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Cases/TC-00261 - Smart Connections Query Stale Index Deleted File Path Passes Through Unchanged.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/Smart Connections Query.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Cases/TC-00225 - Smart Connections Similar Per Match Shape Is Exactly Three Fields.md`

**Sent to the step:**

> 2. Use a separate filter per tool, not one shared filter for both. `smart_connections_similar`: apply A. Keep a match only when `app.vault.getAbstractFileByPath(path)` returns a file with extension `md`; drop everything else, including empty paths and the old paths of moved or deleted notes. `smart_connections_query`: apply B only. Drop matches whose path is empty; pass every non-empty path through verbatim, with no existence check. In both templates, run the filter before the sort and the cut to `limit`. A shared helper is fine only if each template picks its own rule.
>
> Per the owner ruling of 2026-11-07, "Filter old paths in similar only" (BI-0195 Status). The BI-0074 Q2 pass-through for stale non-empty paths in query stands (TC-00261 and the Smart Connections Query Caveats). Don't add a `.md`-suffix filter (C) to query; the ruling allows dropping only empty-path entries there.

## 5. assess / resolve-assessment (2026-11-07T04:58:50.728Z)

**Question (verbatim):**

> Question 3 of 3 — Open question Q2: May the fix make field-only edits to existing test stubs (owner approval required by `.memory/refactor-decisions.md` item 5)?
>
> Proposed scope, and nothing else: (1) add a `vec` array to every stubbed indexed source in `src/tools/smart_connections_similar/_template.test.ts` (the `items[SRC]` stub) and `src/tools/smart_connections_similar/handler.lifecycle.test.ts` (`indexed()`), because the new vector check would otherwise report those stubs as not indexed; (2) only if Question 2 = A, give the template stubs in `smart_connections_similar/_template.test.ts` and `smart_connections_query/_template.test.ts`, and the lifecycle test's simulated vault, a `getAbstractFileByPath` that knows every candidate note path in their fixtures. No assertion, expected value, test title or spawn count may change. If any other existing test fails, the work stops and goes to the owner.
>
> | Option | Description |
> |---|---|
> | A (recommended) | Approve the edits above as written. |
> | B | Decline. Defect 1 then uses a `try/catch` on the plugin's error text `Invalid vector input to nearest()` (tied to one plugin message string), and Question 2 is limited to options B or C (no vault lookup). |
>
> Recommended: A. The edits only add the fields the real plugin objects already have, and they keep the fix independent of the plugin's error wording.

**Advisor** (escalate: decision: The project rule reserves edits to existing tests for the owner, and no owner ruling covers these stub edits. The recommendation is A minus the query stub edit, which Question 2's ruling made unnecessary.):

> 3. Recommended: A, narrowed to the Question 2 answer. Edit (1) as written: add `vec` to the `items[SRC]` stub in `smart_connections_similar/_template.test.ts` and to `indexed()` in `smart_connections_similar/handler.lifecycle.test.ts`. Edit (2) only for `smart_connections_similar`: add a `getAbstractFileByPath` that knows the candidate paths to the `smart_connections_similar/_template.test.ts` stubs and the lifecycle test's simulated vault. Leave `smart_connections_query/_template.test.ts` alone: query does no vault lookup, only drops empty paths. No assertion, expected value, title or spawn count may change. If any other existing test fails, stop and take it to the owner.
>
> Per Question 2 (owner ruling 2026-11-07, "Filter old paths in similar only", in BI-0195 Status), query has no existence check, so its stubs need no vault lookup. Edits to existing tests need the owner's own approval; no ruling on these items exists yet.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0195 - Classify Smart Connections Similar Embedding And Stale Index Failures.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `200-Decisions/ADR-014 - Plugin-Backed Typed Tools Runtime-Dependency Pattern.md`

**Advisor, after the owner ruled** (escalate: none):

> 3. Make the field-only stub edits for `smart_connections_similar` only. (1) Add a `vec` array to the `items[SRC]` stub in `smart_connections_similar/_template.test.ts` and to `indexed()` in `smart_connections_similar/handler.lifecycle.test.ts`. (2) Give the `smart_connections_similar/_template.test.ts` stubs and the lifecycle test's simulated vault a `getAbstractFileByPath` that knows every candidate note path in their fixtures. Don't edit `smart_connections_query/_template.test.ts`. Don't change any assertion, expected value, test title or spawn count. If any other existing test fails, stop and take it to the owner.
>
> Owner ruling 2026-11-07, "Approve, similar stubs only", is recorded in the BI-0195 Status section. Query needs no stub change: its filter drops only empty paths and does no vault lookup (Question 2 ruling).

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0195 - Classify Smart Connections Similar Embedding And Stale Index Failures.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0195 - Classify Smart Connections Similar Embedding And Stale Index Failures.md`: Appended to Status the 2026-11-07 owner ruling 'Approve, similar stubs only': field-only `vec` and `getAbstractFileByPath` stub edits in the two smart_connections_similar test files; query test untouched; no assertion, title or spawn-count changes; stop and go to the owner if any other test fails.

**Owner:** choice 1 (Approve, similar stubs only), via cli, 2026-11-07T05:02:14.242Z.

**Sent to the step:**

> 3. Make the field-only stub edits for `smart_connections_similar` only. (1) Add a `vec` array to the `items[SRC]` stub in `smart_connections_similar/_template.test.ts` and to `indexed()` in `smart_connections_similar/handler.lifecycle.test.ts`. (2) Give the `smart_connections_similar/_template.test.ts` stubs and the lifecycle test's simulated vault a `getAbstractFileByPath` that knows every candidate note path in their fixtures. Don't edit `smart_connections_query/_template.test.ts`. Don't change any assertion, expected value, test title or spawn count. If any other existing test fails, stop and take it to the owner.
>
> Owner ruling 2026-11-07, "Approve, similar stubs only", is recorded in the BI-0195 Status section. Query needs no stub change: its filter drops only empty paths and does no vault lookup (Question 2 ruling).
