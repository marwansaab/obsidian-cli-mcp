# Relay Q&A log: speckit-bugfix

Run `obsidian-cli-mcp-bugfix-bi-0204-2026-11-07`, started 2026-11-07T00:48:50.117Z.

## 1. checks / preflight (2026-11-07T00:48:50.173Z)

**Question (verbatim):**

> Preflight for this Relay bug-fix run of job BI-0204. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0204 in the vault.
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

> Primed for BI-0204 — Reject Note Paths As Pattern Search Folders.
>
> All preflight checks pass.
>
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` → `vault_id: my-setup`, which equals `expected_vault_id: my-setup` (vault display name `My-Setup-Vault`). Session-start reads done: MCP Tool Notes index, Obsidian CLI MCP - Tool Notes, Best Practices, Decision Log, Session Handover, About This Vault.
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0204 - Reject Note Paths As Pattern Search Folders.md`. Title: "BI-0204 — Reject Note Paths As Pattern Search Folders".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: queued`, meaning the owner has not triaged it yet. The work is not finished or abandoned. Carrying on.
> 5. Variant: PASS. `variant: bug-fix`.
> 6. Prompt section: PASS. The note has no "/speckit-bug-assess prompt" section, but it does have a "/speckit-specify prompt" section. That section describes the expected behaviour: a note path given as `folder` fails with a "file, not a folder" error that names the path; the containing folder still returns its match; a missing folder still gets the same "folder not found" error; and `pattern_search` and `context_search` reject a note path in the same recognisable way. Out of scope: a single-note scope, how `"/"` is handled, and changes to the literal search or listing tools. Note not changed.
> 7. Clarify skill: PASS. `anthropic-skills:speckit-clarify-skill` is loaded with "BI-0204 - Reject Note Paths As Pattern Search Folders".
>
> Read: BI-0204, TC-00906 (evidence: 0.9.0 returns `{"count":0,"matches":[]}` for `folder` = a note path), Constitution v1.5.1 (Principle IV: no silent empty result), Architecture (folder-existence two-call probe), ADR-071 (meaning of `NOT_A_FOLDER`; disk `stat` check shared with `paths`/`pattern_search`), ADR-015 (sub-discriminators).
> Role: BA + Solution Architect, answering for the developer agent.
> Awaiting clarification questions.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0204 - Reject Note Paths As Pattern Search Folders.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Cases/TC-00906 - Pattern Search Folder Naming A Note Is Rejected.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-071 - Move Checks A Blocked Destination On Disk After The Rename Fails.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`

**Sent to the step:**

> Primed for BI-0204 — Reject Note Paths As Pattern Search Folders.
>
> All preflight checks pass.
>
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` → `vault_id: my-setup`, which equals `expected_vault_id: my-setup` (vault display name `My-Setup-Vault`). Session-start reads done: MCP Tool Notes index, Obsidian CLI MCP - Tool Notes, Best Practices, Decision Log, Session Handover, About This Vault.
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0204 - Reject Note Paths As Pattern Search Folders.md`. Title: "BI-0204 — Reject Note Paths As Pattern Search Folders".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: queued`, meaning the owner has not triaged it yet. The work is not finished or abandoned. Carrying on.
> 5. Variant: PASS. `variant: bug-fix`.
> 6. Prompt section: PASS. The note has no "/speckit-bug-assess prompt" section, but it does have a "/speckit-specify prompt" section. That section describes the expected behaviour: a note path given as `folder` fails with a "file, not a folder" error that names the path; the containing folder still returns its match; a missing folder still gets the same "folder not found" error; and `pattern_search` and `context_search` reject a note path in the same recognisable way. Out of scope: a single-note scope, how `"/"` is handled, and changes to the literal search or listing tools. Note not changed.
> 7. Clarify skill: PASS. `anthropic-skills:speckit-clarify-skill` is loaded with "BI-0204 - Reject Note Paths As Pattern Search Folders".
>
> Read: BI-0204, TC-00906 (evidence: 0.9.0 returns `{"count":0,"matches":[]}` for `folder` = a note path), Constitution v1.5.1 (Principle IV: no silent empty result), Architecture (folder-existence two-call probe), ADR-071 (meaning of `NOT_A_FOLDER`; disk `stat` check shared with `paths`/`pattern_search`), ADR-015 (sub-discriminators).
> Role: BA + Solution Architect, answering for the developer agent.
> Awaiting clarification questions.

## 2. assess / bug-assess (2026-11-07T00:49:50.888Z)

**Question (verbatim):**

> Return the bug report for job BI-0204 as one message in `answer`, built only from the note's own text. Do not edit, summarise or add to it.
> - If the note has a "/speckit-bug-assess prompt" section: its full content, verbatim and complete, without the surrounding code fence.
> - Otherwise exactly this, with each section's full content verbatim and complete: a first line `/speckit-bug-assess slug=BI-0204`, a blank line, the line `## Impact` followed by the note's "Impact" section, a blank line, the line `## Status and evidence` followed by the note's "Status" section, a blank line, and the line `## Expected behaviour` followed by the content of its "/speckit-specify prompt" section without the surrounding code fence. Leave out any of the first two sections the note doesn't have.
> If the note has neither prompt section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-bug-assess slug=BI-0204
>
> ## Impact
> Passing a note path to "search just this note" is a natural agent move, and the answer is a false negative: the agent concludes the pattern is absent. The Tool Notes rule that a negative result must state its scope exists because of this class of silent miss.
>
> ## Status and evidence
> *Queued* 2026-11-07 — awaiting owner triage. Filed from the imported-tool-notes sweep, reproduced on the published `@marwansaab/obsidian-cli-mcp@0.9.0` ([[TC-00906 - Pattern Search Folder Naming A Note Is Rejected|TC-00906]]). Reported by the Wrightyard, Slipwright and Funwright-Studio-Vault notes.
>
> **Defect.** `pattern_search` with `folder` set to a note's path (`Repro1106/single.md`) returns `{"count":0,"matches":[]}` though the note matches. A missing folder in the same parameter already gives `CLI_REPORTED_ERROR` / `FOLDER_NOT_FOUND`; `context_search` rejects a note path (`… is a file, not a folder.`) and `paths` does too.
>
> ## Expected behaviour
> Drafted 2026-11-07 with the `speckit-specify-skill`.
>
> /speckit-specify Reject note folders
>
> ## Feature
> When an agent's regular-expression search is limited to a "folder" that is actually a note, the search fails with a clear error naming the problem instead of reporting no matches.
>
> ## Why
> Today such a search reports zero matches even when the note contains the pattern, so the agent wrongly concludes the text is absent. Neighbouring search and listing requests already reject a note given as a folder.
>
> ## User stories
> - As an agent, I want a search limited to a note path to fail with a clear error, so that I do not mistake a wrong scope for "no matches".
> - As an agent, I want the error to say the path is a note, not a folder, so that I can fix the request (use the containing folder).
>
> ## Acceptance criteria
> **Story: note path rejected**
> - Given a note that contains "zebrafish", when the agent searches for "zebrafish" with the note's path as the folder, then the request fails with an error saying the path is a file, not a folder, and naming it.
> - Given the note's containing folder as the folder, when the agent runs the same search, then the match is returned as today.
> - Given a folder that does not exist, when the agent searches, then the existing "folder not found" error is returned unchanged.
>
> **Story: consistent with sibling requests**
> - Given the same note path, when the agent makes the equivalent literal-text search, then both searches fail in the same recognisable way.
>
> ## Out of scope
> - Adding a single-note scope to the regular-expression search.
> - Changing how the whole-vault scope ("/") is accepted or rejected across tools.
> - Changes to the literal-text search or listing requests.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0204 - Reject Note Paths As Pattern Search Folders.md`

**Sent to the step:**

> /speckit-bug-assess slug=BI-0204
>
> ## Impact
> Passing a note path to "search just this note" is a natural agent move, and the answer is a false negative: the agent concludes the pattern is absent. The Tool Notes rule that a negative result must state its scope exists because of this class of silent miss.
>
> ## Status and evidence
> *Queued* 2026-11-07 — awaiting owner triage. Filed from the imported-tool-notes sweep, reproduced on the published `@marwansaab/obsidian-cli-mcp@0.9.0` ([[TC-00906 - Pattern Search Folder Naming A Note Is Rejected|TC-00906]]). Reported by the Wrightyard, Slipwright and Funwright-Studio-Vault notes.
>
> **Defect.** `pattern_search` with `folder` set to a note's path (`Repro1106/single.md`) returns `{"count":0,"matches":[]}` though the note matches. A missing folder in the same parameter already gives `CLI_REPORTED_ERROR` / `FOLDER_NOT_FOUND`; `context_search` rejects a note path (`… is a file, not a folder.`) and `paths` does too.
>
> ## Expected behaviour
> Drafted 2026-11-07 with the `speckit-specify-skill`.
>
> /speckit-specify Reject note folders
>
> ## Feature
> When an agent's regular-expression search is limited to a "folder" that is actually a note, the search fails with a clear error naming the problem instead of reporting no matches.
>
> ## Why
> Today such a search reports zero matches even when the note contains the pattern, so the agent wrongly concludes the text is absent. Neighbouring search and listing requests already reject a note given as a folder.
>
> ## User stories
> - As an agent, I want a search limited to a note path to fail with a clear error, so that I do not mistake a wrong scope for "no matches".
> - As an agent, I want the error to say the path is a note, not a folder, so that I can fix the request (use the containing folder).
>
> ## Acceptance criteria
> **Story: note path rejected**
> - Given a note that contains "zebrafish", when the agent searches for "zebrafish" with the note's path as the folder, then the request fails with an error saying the path is a file, not a folder, and naming it.
> - Given the note's containing folder as the folder, when the agent runs the same search, then the match is returned as today.
> - Given a folder that does not exist, when the agent searches, then the existing "folder not found" error is returned unchanged.
>
> **Story: consistent with sibling requests**
> - Given the same note path, when the agent makes the equivalent literal-text search, then both searches fail in the same recognisable way.
>
> ## Out of scope
> - Adding a single-note scope to the regular-expression search.
> - Changing how the whole-vault scope ("/") is accepted or rejected across tools.
> - Changes to the literal-text search or listing requests.
