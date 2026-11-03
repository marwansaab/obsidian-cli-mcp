# Relay Q&A log: speckit-bugfix

Run `obsidian-cli-mcp-bugfix-bi-0178-2026-11-03`, started 2026-11-03T12:08:21.422Z.

## 1. checks / preflight (2026-11-03T12:08:21.466Z)

**Question (verbatim):**

> Preflight for this Relay bug-fix run of job BI-0178. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0178 in the vault.
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

> Primed for BI-0178 — Classify Missing Named Note In Find And Replace.
> Read: BI-0178, Constitution (v1.5.1), Architecture (Canonical contracts), ADR-015, sibling BI-0171; session-start reads done (MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault).
> Role: BA + Solution Architect, answering for Claude Code.
>
> Preflight checks:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` `vault_id` = `my-setup`, which equals `expected_vault_id` `my-setup` (vault display name `My-Setup-Vault`).
> 2. Backlog note: FOUND at `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0178 - Classify Missing Named Note In Find And Replace.md`. Title: "BI-0178 — Classify Missing Named Note In Find And Replace".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: `planned`, so the work is not finished. PASS.
> 5. Variant: `bug-fix`. PASS.
> 6. Prompt section: PASS. There is no "/speckit-bug-assess prompt" section, but the note has a "/speckit-specify prompt" section describing the expected behaviour: a missing note named by name fails with the same documented error as the path form (`VALIDATION_ERROR`, `details.code: "INVALID_NOTE"`, `details.reason: "not-found"`, `details.note`), names the missing note, and writes nothing. The note was not changed.
> 7. Clarify skill: LOADED (`anthropic-skills:speckit-clarify-skill`, reference "BI-0178 - Classify Missing Named Note In Find And Replace").
>
> Heads-up for later questions: the BI's Impact section says the owner must choose between two fixes during clarification. One is to map the not-found result from the name lookup to the documented envelope. The other is to change the spec, description and help to the pass-through shape that BI-0171 chose for patch_heading / patch_block. That choice will be escalated as `decision` when it is asked.
> Awaiting clarification questions.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0178 - Classify Missing Named Note In Find And Replace.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes`, `BI-0171 - Resolve File Locator In Patch Heading`, `000-Meta/MCP Tool Notes.md`, `210-Guidelines/Best Practices.md`, `200-Decisions/Decision Log.md`, `220-Planning/Session Handover.md`, `000-Meta/About This Vault.md`

**Sent to the step:**

> Primed for BI-0178 — Classify Missing Named Note In Find And Replace.
> Read: BI-0178, Constitution (v1.5.1), Architecture (Canonical contracts), ADR-015, sibling BI-0171; session-start reads done (MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault).
> Role: BA + Solution Architect, answering for Claude Code.
>
> Preflight checks:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` `vault_id` = `my-setup`, which equals `expected_vault_id` `my-setup` (vault display name `My-Setup-Vault`).
> 2. Backlog note: FOUND at `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0178 - Classify Missing Named Note In Find And Replace.md`. Title: "BI-0178 — Classify Missing Named Note In Find And Replace".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: `planned`, so the work is not finished. PASS.
> 5. Variant: `bug-fix`. PASS.
> 6. Prompt section: PASS. There is no "/speckit-bug-assess prompt" section, but the note has a "/speckit-specify prompt" section describing the expected behaviour: a missing note named by name fails with the same documented error as the path form (`VALIDATION_ERROR`, `details.code: "INVALID_NOTE"`, `details.reason: "not-found"`, `details.note`), names the missing note, and writes nothing. The note was not changed.
> 7. Clarify skill: LOADED (`anthropic-skills:speckit-clarify-skill`, reference "BI-0178 - Classify Missing Named Note In Find And Replace").
>
> Heads-up for later questions: the BI's Impact section says the owner must choose between two fixes during clarification. One is to map the not-found result from the name lookup to the documented envelope. The other is to change the spec, description and help to the pass-through shape that BI-0171 chose for patch_heading / patch_block. That choice will be escalated as `decision` when it is asked.
> Awaiting clarification questions.

## 2. assess / bug-assess (2026-11-03T12:09:09.853Z)

**Question (verbatim):**

> Return the bug report for job BI-0178 as one message in `answer`, built only from the note's own text. Do not edit, summarise or add to it.
> - If the note has a "/speckit-bug-assess prompt" section: its full content, verbatim and complete, without the surrounding code fence.
> - Otherwise exactly this, with each section's full content verbatim and complete: a first line `/speckit-bug-assess slug=BI-0178`, a blank line, the line `## Impact` followed by the note's "Impact" section, a blank line, the line `## Status and evidence` followed by the note's "Status" section, a blank line, and the line `## Expected behaviour` followed by the content of its "/speckit-specify prompt" section without the surrounding code fence. Leave out any of the first two sections the note doesn't have.
> If the note has neither prompt section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-bug-assess slug=BI-0178
>
> ## Impact
> Spec 066 FR-008, the tool description and the help all state that a single-note scope naming a missing note, "by path or by name", fails with `VALIDATION_ERROR`, `details.code: "INVALID_NOTE"`, `details.reason: "not-found"` and `details.note`. The name form instead returns a generic `CLI_REPORTED_ERROR` whose only signal is free text in `details.stdout`. A caller branching on `details.code` as documented never matches for the name form, and sees two different shapes for the same condition depending on how it named the note. The safety property holds (nothing is written), so the harm is the error contract. Two resolutions are possible: map the pre-flight not-found to the documented envelope, or change the spec, description and help to the pass-through shape that [[BI-0171 - Resolve File Locator In Patch Heading]] chose for `patch_heading` / `patch_block`. The owner picks one during clarification; the two must not be left disagreeing.
>
> ## Status and evidence
> *Planned.* Filed 2026-11-02 from the 0.9.0-local test run of the 24 in-review BIs. Follow-up to [[BI-0114 - Add Single File Scope To Find And Replace]] (spec `066-file-scope`). Evidence: [[TC-00784 - Find And Replace Missing File Name Target Throws INVALID_NOTE Not Found]] (fail on `@marwansaab/obsidian-cli-mcp@0.9.0-local`). In `TestVault-Obsidian-CLI-MCP`, `find_and_replace` with `file: "bi0114-ghost-name"` (no such note) and `commit: true` returned `{"code":"CLI_REPORTED_ERROR","message":"CLI bridge upstream error: CLI_REPORTED_ERROR","details":{"command":"file","stdout":"Error: File \"bi0114-ghost-name\" not found.\n",…}}` — Obsidian's own not-found text passed through from the name-resolution pre-flight. Nothing was written. The path form, [[TC-00783 - Find And Replace Missing Path Target Throws INVALID_NOTE Not Found]], passes with the documented envelope.
>
> ## Expected behaviour
> /speckit-specify Classify missing note
>
> ## Feature
> When an agent limits a find-and-replace to one note and names a note that does not exist, the failure has the same documented shape whether the note was named by its full path or by its name.
>
> ## Why
> Today a missing note given by path returns the documented "note not found" error, but the same missing note given by name returns a generic upstream error with the reason buried in free text. Agents that handle the documented error never recognise the second form, and the published documentation promises the first shape for both.
>
> ## User stories
> - As an agent, I want a missing note named by name to fail with the same documented error as a missing note named by path, so that one error-handling branch covers both.
> - As an agent, I want the error to name the note that was not found, so that I can report or correct it.
> - As an agent, I want nothing changed in the vault when the named note is missing, so that a failed call is always safe.
>
> ## Acceptance criteria
>
> **Story: same error for name and path**
> - Given no note named "ghost" exists, when the agent runs a single-note find-and-replace naming "ghost" by name, then the call fails with the same error category and the same specific reason as the path form, as the documentation states.
> - Given no note exists at "Folder/ghost.md", when the agent runs the same call by path, then the error is unchanged from today.
>
> **Story: error names the note**
> - Given the failure above, when the agent reads the error, then it names "ghost" as the note that was not found.
>
> **Story: no change on failure**
> - Given the failure above, when the agent checks the vault, then no note was created or changed and no confirmation prompt appeared.
>
> ## Out of scope
> - Find-and-replace across folders or the whole vault.
> - Resolving names that match several notes.
> - Changing the error shape of other note-scoped tools.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0178 - Classify Missing Named Note In Find And Replace.md`

**Sent to the step:**

> /speckit-bug-assess slug=BI-0178
>
> ## Impact
> Spec 066 FR-008, the tool description and the help all state that a single-note scope naming a missing note, "by path or by name", fails with `VALIDATION_ERROR`, `details.code: "INVALID_NOTE"`, `details.reason: "not-found"` and `details.note`. The name form instead returns a generic `CLI_REPORTED_ERROR` whose only signal is free text in `details.stdout`. A caller branching on `details.code` as documented never matches for the name form, and sees two different shapes for the same condition depending on how it named the note. The safety property holds (nothing is written), so the harm is the error contract. Two resolutions are possible: map the pre-flight not-found to the documented envelope, or change the spec, description and help to the pass-through shape that [[BI-0171 - Resolve File Locator In Patch Heading]] chose for `patch_heading` / `patch_block`. The owner picks one during clarification; the two must not be left disagreeing.
>
> ## Status and evidence
> *Planned.* Filed 2026-11-02 from the 0.9.0-local test run of the 24 in-review BIs. Follow-up to [[BI-0114 - Add Single File Scope To Find And Replace]] (spec `066-file-scope`). Evidence: [[TC-00784 - Find And Replace Missing File Name Target Throws INVALID_NOTE Not Found]] (fail on `@marwansaab/obsidian-cli-mcp@0.9.0-local`). In `TestVault-Obsidian-CLI-MCP`, `find_and_replace` with `file: "bi0114-ghost-name"` (no such note) and `commit: true` returned `{"code":"CLI_REPORTED_ERROR","message":"CLI bridge upstream error: CLI_REPORTED_ERROR","details":{"command":"file","stdout":"Error: File \"bi0114-ghost-name\" not found.\n",…}}` — Obsidian's own not-found text passed through from the name-resolution pre-flight. Nothing was written. The path form, [[TC-00783 - Find And Replace Missing Path Target Throws INVALID_NOTE Not Found]], passes with the documented envelope.
>
> ## Expected behaviour
> /speckit-specify Classify missing note
>
> ## Feature
> When an agent limits a find-and-replace to one note and names a note that does not exist, the failure has the same documented shape whether the note was named by its full path or by its name.
>
> ## Why
> Today a missing note given by path returns the documented "note not found" error, but the same missing note given by name returns a generic upstream error with the reason buried in free text. Agents that handle the documented error never recognise the second form, and the published documentation promises the first shape for both.
>
> ## User stories
> - As an agent, I want a missing note named by name to fail with the same documented error as a missing note named by path, so that one error-handling branch covers both.
> - As an agent, I want the error to name the note that was not found, so that I can report or correct it.
> - As an agent, I want nothing changed in the vault when the named note is missing, so that a failed call is always safe.
>
> ## Acceptance criteria
>
> **Story: same error for name and path**
> - Given no note named "ghost" exists, when the agent runs a single-note find-and-replace naming "ghost" by name, then the call fails with the same error category and the same specific reason as the path form, as the documentation states.
> - Given no note exists at "Folder/ghost.md", when the agent runs the same call by path, then the error is unchanged from today.
>
> **Story: error names the note**
> - Given the failure above, when the agent reads the error, then it names "ghost" as the note that was not found.
>
> **Story: no change on failure**
> - Given the failure above, when the agent checks the vault, then no note was created or changed and no confirmation prompt appeared.
>
> ## Out of scope
> - Find-and-replace across folders or the whole vault.
> - Resolving names that match several notes.
> - Changing the error shape of other note-scoped tools.

## 3. assess / resolve-assessment (2026-11-03T12:11:34.616Z)

**Question (verbatim):**

> **Q1 — How should find_and_replace report a missing note named by `file` (by name)?** (BI-0178 assessment, Open Questions)
>
> Context: When a single note named by `file` does not exist, the lookup fails first. `resolveSingleNoteScope` (`src/tools/find_and_replace/handler.ts:484`) calls `resolveFileByTsv` (`src/tools/_active-file.ts:242`), and Obsidian's `Error: File "<name>" not found.` comes back unchanged as `CLI_REPORTED_ERROR`. The handler's existence check, `assertExists` (`handler.ts:430`), builds the documented envelope, but on the name form it never runs. The path form reaches `assertExists` and returns the envelope. `findFileByTsv` (`_active-file.ts:278`) already recognises Obsidian's not-found answer and returns null for it; `write_note` uses it (BI-0176). BI-0171 chose to pass Obsidian's error through unchanged for `patch_heading` / `patch_block` (spec 089 Clarifications). The report says the owner picks the resolution, and the code and the docs must not be left disagreeing.
>
> | Option | Description |
> |--------|-------------|
> | A (recommended) | Return the documented error for the name form too: `VALIDATION_ERROR` + `details.code: "INVALID_NOTE"` + `details.reason: "not-found"` + `details.note: <name as given>`, using `findFileByTsv`, with one shared error builder for both forms. Only code and tests change. Spec 066 FR-008, the tool description and the help stay as they are, and the fingerprint baseline does not move. |
> | B | Keep passing Obsidian's `CLI_REPORTED_ERROR` through unchanged, matching BI-0171. Change spec 066 FR-008, `FIND_AND_REPLACE_DESCRIPTION` (the fingerprint baseline moves) and `docs/tools/find_and_replace.md` to document that shape for the name form. The code does not change. |
>
> Recommended: **A**. It is what the report's expected behaviour and acceptance criteria ask for: the same error category and reason as the path form, and an error that names the note. FR-008 and the published docs already promise this, so it gives one error shape for one condition inside the tool without changing the published surface. B keeps two shapes for the same condition (path → `INVALID_NOTE`, name → pass-through), which is the harm the report describes, and it contradicts the report's acceptance criteria.
>
> Reply with A or B.

**Advisor** (escalate: decision: BI-0178's Impact section says the owner picks between mapping the error to the documented envelope (A) and documenting the pass-through shape (B) during clarification. The vault holds no ruling yet.):

> A
>
> Recommended, pending the owner's ruling. The BI's "/speckit-specify prompt" acceptance criteria call for the name form to fail with "the same error category and the same specific reason as the path form" and for the error to name the note. Spec 066 FR-008, the tool description and the help already promise that envelope. Option A meets all of that with code and test changes only. Option B would keep two error shapes for one condition, which is the harm the BI's Impact section describes. BI-0171's choice to pass the error through applies only to `patch_heading` / `patch_block`, and the prompt's "Out of scope" leaves other tools alone.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0178 - Classify Missing Named Note In Find And Replace.md`, `BI-0171 - Resolve File Locator In Patch Heading`, `ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes`

**Advisor, after the owner ruled** (escalate: none):

> A
>
> Owner ruling. Name form returns the documented envelope, same as the path form: `VALIDATION_ERROR`, `details.code: "INVALID_NOTE"`, `details.reason: "not-found"`, `details.note` = name as given. Spec 066 FR-008, description and help stay unchanged. Only code and tests change. BI-0171's pass-through is not adopted here. Ruling recorded in the BI-0178 Impact section.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0178 - Classify Missing Named Note In Find And Replace.md`, `BI-0171 - Resolve File Locator In Patch Heading`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0178 - Classify Missing Named Note In Find And Replace.md`: Appended a 'Clarified 2026-11-03 (bug-assess Q1, owner ruling)' paragraph to the Impact section: the name form maps to the documented INVALID_NOTE / not-found envelope, with docs unchanged and only code and tests changing.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0178 - Classify Missing Named Note In Find And Replace.md`: Set frontmatter `updated` from 2026-11-02 to 2026-11-03.

**Owner:** choice 1 (A: documented INVALID_NOTE envelope), via cli, 2026-11-03T12:13:08.785Z.

**Sent to the step:**

> A
>
> Owner ruling. Name form returns the documented envelope, same as the path form: `VALIDATION_ERROR`, `details.code: "INVALID_NOTE"`, `details.reason: "not-found"`, `details.note` = name as given. Spec 066 FR-008, description and help stay unchanged. Only code and tests change. BI-0171's pass-through is not adopted here. Ruling recorded in the BI-0178 Impact section.
