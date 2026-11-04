# Relay Q&A log: speckit

Run `obsidian-cli-mcp-bi-0087-2026-11-04`, started 2026-11-04T08:48:24.714Z.

## 1. checks / preflight (2026-11-04T08:48:24.761Z)

**Question (verbatim):**

> Preflight for this Relay run of job BI-0087. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0087 in the vault.
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

> Primed for BI-0087 — Audit Remaining Eval Composition Tools For Non ASCII Coverage.
>
> Readiness checks:
> 1. Vault identity: PASS. `vault_id` in `000-Meta/Vault Identity.md` is `my-setup`, which matches `expected_vault_id`. The vault display name is `My-Setup-Vault`. The session-start reads are done: MCP Tool Notes index, Obsidian CLI MCP - Tool Notes, Best Practices, Decision Log, Session Handover and About This Vault.
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0087 - Audit Remaining Eval Composition Tools For Non ASCII Coverage.md`.
> 3. Initiative: PASS. It is `"[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. It is `planned` (tier closing-pass, variant operational), so the work is not finished or abandoned.
> 5. Specify prompt: PASS. The `## /speckit-specify prompt` section exists, and the prompt starts with `/speckit-specify Verify non-ASCII handling` (dash form). The note was not changed.
> 6. Clarify skill: loaded (`anthropic-skills:speckit-clarify-skill`, reference "BI-0087 - Audit Remaining Eval Composition Tools For Non ASCII Coverage").
>
> Read: BI-0087, BI-0042 (the parent fix), Constitution v1.5.1, Architecture (ARCH-014), ADR-004, ADR-014.
> Role: BA + Solution Architect, answering for Claude Code.
> Context for the questions: 4 of 5 tools pass on 0.9.0-local (outline, links, paths, pattern_search). The `smart_connections_similar` success path has not been probed: Smart Connections is not installed in the TestVault, and My-Setup-Vault has no note with a non-ASCII path.
> Awaiting clarification questions.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0087 - Audit Remaining Eval Composition Tools For Non ASCII Coverage.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0042 - Fix Eval Atob Utf8 Mojibake.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-004 - Centralized Obsidian CLI Adapter.md`, `200-Decisions/ADR-014 - Plugin-Backed Typed Tools Runtime-Dependency Pattern.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`

**Sent to the step:**

> Primed for BI-0087 — Audit Remaining Eval Composition Tools For Non ASCII Coverage.
>
> Readiness checks:
> 1. Vault identity: PASS. `vault_id` in `000-Meta/Vault Identity.md` is `my-setup`, which matches `expected_vault_id`. The vault display name is `My-Setup-Vault`. The session-start reads are done: MCP Tool Notes index, Obsidian CLI MCP - Tool Notes, Best Practices, Decision Log, Session Handover and About This Vault.
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0087 - Audit Remaining Eval Composition Tools For Non ASCII Coverage.md`.
> 3. Initiative: PASS. It is `"[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. It is `planned` (tier closing-pass, variant operational), so the work is not finished or abandoned.
> 5. Specify prompt: PASS. The `## /speckit-specify prompt` section exists, and the prompt starts with `/speckit-specify Verify non-ASCII handling` (dash form). The note was not changed.
> 6. Clarify skill: loaded (`anthropic-skills:speckit-clarify-skill`, reference "BI-0087 - Audit Remaining Eval Composition Tools For Non ASCII Coverage").
>
> Read: BI-0087, BI-0042 (the parent fix), Constitution v1.5.1, Architecture (ARCH-014), ADR-004, ADR-014.
> Role: BA + Solution Architect, answering for Claude Code.
> Context for the questions: 4 of 5 tools pass on 0.9.0-local (outline, links, paths, pattern_search). The `smart_connections_similar` success path has not been probed: Smart Connections is not installed in the TestVault, and My-Setup-Vault has no note with a non-ASCII path.
> Awaiting clarification questions.

## 2. pre-implementation / specify (2026-11-04T08:49:29.647Z)

**Question (verbatim):**

> Return the full content of the "/speckit-specify prompt" section of job BI-0087's note, verbatim and complete, in `answer`, without the surrounding code fence. Do not edit or summarise it. If the note has no such section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-specify Verify non-ASCII handling
>
> ## Feature
> Every tool that looks up notes, folders, headings, links or text patterns inside Obsidian handles names and text containing non-ASCII characters (accented letters, CJK characters, em-dashes, emoji) exactly as written, and each such tool has a repeatable check proving it.
>
> ## Why
> An earlier defect garbled non-ASCII input on its way into Obsidian, so lookups for accented or CJK names silently failed or returned nothing. The fix was confirmed for some tools but never for every tool that passes caller text the same way, so a silent failure could still hide in an unchecked tool. Users with non-English note names need every tool to work for them, not only the ones that were tested.
>
> ## User stories
> - As an agent, I want to list the headings of a note whose path contains non-ASCII characters, so that I can navigate notes with any name.
> - As an agent, I want to list the outgoing links of such a note and see non-ASCII link targets as written, so that I can follow them.
> - As an agent, I want to list the contents of a folder whose name contains non-ASCII characters, so that I can browse it.
> - As an agent, I want to search with a pattern containing non-ASCII characters, optionally limited to a non-ASCII folder, so that I can find text in any language.
> - As an agent, I want to find notes similar to a note whose path contains non-ASCII characters, so that semantic discovery works for every note.
> - As a maintainer, I want each of these guarantees backed by a repeatable check, so that a later change cannot silently bring the garbling back.
>
> ## Acceptance criteria
>
> **Story: headings of a non-ASCII note**
> - Given a note in a folder named with CJK characters, whose own name has accented and CJK characters and whose headings contain an em-dash, accented letters and an emoji, when the agent lists its headings, then every heading is returned exactly as written, with its level.
>
> **Story: links of a non-ASCII note**
> - Given that note links to a note whose name contains accented and CJK characters, when the agent lists its links, then the link target is returned exactly as written.
>
> **Story: non-ASCII folder listing**
> - Given a folder whose name contains CJK characters, when the agent lists it, then its notes are listed with their names exactly as written.
> - Given a non-ASCII folder name that does not exist, when the agent lists it, then the agent gets a folder-not-found error showing the folder name as written, not an empty list.
>
> **Story: non-ASCII pattern search**
> - Given a note containing the token "café42", when the agent searches for a pattern matching "café" followed by digits, then the match and its line are returned exactly as written.
> - Given the same search limited to the non-ASCII folder, when it runs, then only matches inside that folder are returned.
>
> **Story: similar notes for a non-ASCII note**
> - Given an indexed note whose path contains non-ASCII characters, when the agent asks for notes similar to it, then results are returned and the source note itself is not among them.
> - Given a non-ASCII path that does not exist, when the agent asks for similar notes, then the not-found error shows the path exactly as written.
>
> **Story: repeatable checks**
> - Given the checks for all five capabilities, when they are run against a new release, then each reports pass or fail on its own, and any failure names the capability and the input that failed.
>
> ## Out of scope
> - Capabilities already confirmed by the original fix: reading a heading, reading a property, finding notes by a property value, semantic search by free text, and writing a property.
> - Capabilities that pass text to Obsidian by a different route: reading, writing, deleting, moving and renaming notes, listing one folder level, and literal text search.
> - Case-insensitive matching of accented letters in literal text search.
> - Fixing any failure the checks find; each failure becomes its own item.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0087 - Audit Remaining Eval Composition Tools For Non ASCII Coverage.md`

**Sent to the step:**

> /speckit-specify Verify non-ASCII handling
>
> ## Feature
> Every tool that looks up notes, folders, headings, links or text patterns inside Obsidian handles names and text containing non-ASCII characters (accented letters, CJK characters, em-dashes, emoji) exactly as written, and each such tool has a repeatable check proving it.
>
> ## Why
> An earlier defect garbled non-ASCII input on its way into Obsidian, so lookups for accented or CJK names silently failed or returned nothing. The fix was confirmed for some tools but never for every tool that passes caller text the same way, so a silent failure could still hide in an unchecked tool. Users with non-English note names need every tool to work for them, not only the ones that were tested.
>
> ## User stories
> - As an agent, I want to list the headings of a note whose path contains non-ASCII characters, so that I can navigate notes with any name.
> - As an agent, I want to list the outgoing links of such a note and see non-ASCII link targets as written, so that I can follow them.
> - As an agent, I want to list the contents of a folder whose name contains non-ASCII characters, so that I can browse it.
> - As an agent, I want to search with a pattern containing non-ASCII characters, optionally limited to a non-ASCII folder, so that I can find text in any language.
> - As an agent, I want to find notes similar to a note whose path contains non-ASCII characters, so that semantic discovery works for every note.
> - As a maintainer, I want each of these guarantees backed by a repeatable check, so that a later change cannot silently bring the garbling back.
>
> ## Acceptance criteria
>
> **Story: headings of a non-ASCII note**
> - Given a note in a folder named with CJK characters, whose own name has accented and CJK characters and whose headings contain an em-dash, accented letters and an emoji, when the agent lists its headings, then every heading is returned exactly as written, with its level.
>
> **Story: links of a non-ASCII note**
> - Given that note links to a note whose name contains accented and CJK characters, when the agent lists its links, then the link target is returned exactly as written.
>
> **Story: non-ASCII folder listing**
> - Given a folder whose name contains CJK characters, when the agent lists it, then its notes are listed with their names exactly as written.
> - Given a non-ASCII folder name that does not exist, when the agent lists it, then the agent gets a folder-not-found error showing the folder name as written, not an empty list.
>
> **Story: non-ASCII pattern search**
> - Given a note containing the token "café42", when the agent searches for a pattern matching "café" followed by digits, then the match and its line are returned exactly as written.
> - Given the same search limited to the non-ASCII folder, when it runs, then only matches inside that folder are returned.
>
> **Story: similar notes for a non-ASCII note**
> - Given an indexed note whose path contains non-ASCII characters, when the agent asks for notes similar to it, then results are returned and the source note itself is not among them.
> - Given a non-ASCII path that does not exist, when the agent asks for similar notes, then the not-found error shows the path exactly as written.
>
> **Story: repeatable checks**
> - Given the checks for all five capabilities, when they are run against a new release, then each reports pass or fail on its own, and any failure names the capability and the input that failed.
>
> ## Out of scope
> - Capabilities already confirmed by the original fix: reading a heading, reading a property, finding notes by a property value, semantic search by free text, and writing a property.
> - Capabilities that pass text to Obsidian by a different route: reading, writing, deleting, moving and renaming notes, listing one folder level, and literal text search.
> - Case-insensitive matching of accented letters in literal text search.
> - Fixing any failure the checks find; each failure becomes its own item.

## 3. pre-implementation / specify (2026-11-04T08:52:24.326Z)

**Question (verbatim):**

> ## Question 1: Where the similar-notes check runs
>
> **Context**: User Story 5 — "In a vault where the semantic-search plugin is installed and has indexed the fixtures, ask for notes similar to the source note; then ask for a non-ASCII path that does not exist. [NEEDS CLARIFICATION: Which vault does the similar-notes check run in? The authorised test vault is kept free of plugins, and without the semantic-search plugin both scenarios below return a "plugin not installed" error before the path is ever looked up, so neither can be proven there.]"
>
> The similar-notes tool checks that Smart Connections is loaded *before* it resolves the path, so in the bare `TestVault-Obsidian-CLI-MCP` both acceptance scenarios (results excluding the source note, and the not-found error showing the path as written) come back as `SMART_CONNECTIONS_NOT_INSTALLED`. The test-execution rules say that vault stays plugin-free, and spec 034 skipped this tool's live probe for the same reason.
>
> **What we need to know**: Which vault should the similar-notes check run in, given that the authorised test vault has no plugins?
>
> **Suggested Answers**:
>
> | Option | Answer | Implications |
> |--------|--------|--------------|
> | A (recommended) | Run the similar-notes check in a separate vault you name that already has Smart Connections installed and indexed. The check seeds its non-ASCII fixtures in that vault's own scratch folder, waits for them to be indexed, and removes them afterwards. | Proves both Story 5 scenarios end to end, the same as the other four capabilities. Needs a vault name and a scratch folder you authorise for fixture writes, and the run depends on Smart Connections finishing indexing the new fixtures. |
> | B | Keep every check in the bare test vault. The similar-notes check reports "could not run: Smart Connections not installed" there, and runs fully only when pointed at a vault that has the plugin. | No new vault is authorised now, but in the normal run Story 5 is never actually proven: the check exists but stays at could-not-run until someone points it at a plugin vault. |
> | C | Drop similar notes from this item and open a separate item for it once a Smart Connections test vault is set up. | This item covers four capabilities instead of five and keeps the test-vault rules as they are. The similar-notes guarantee stays unproven until that later item. |
> | Custom | Provide your own answer | For example, name the vault and scratch folder to use, or set a different rule for plugin-dependent checks. |
>
> **Your choice**: _[Wait for user response]_

**Advisor** (escalate: decision: The success scenario needs the owner to authorise one of two things: staging a non-ASCII note in My-Setup-Vault, or installing Smart Connections in the TestVault for a while. BI-0087 reserves both for the owner. Option A's seed-and-remove would also break the GL-003 rule that keeps My-Setup-Vault read-only.):

> 1. Run the similar-notes check read-only against `My-Setup-Vault`, and make the vault a run-time setting rather than hard-coding it. The check never seeds or removes fixtures there. Prove the not-found scenario there as it stands. The success scenario has a precondition: a non-ASCII-path note, staged by the owner and already indexed by Smart Connections. If that note is missing or not indexed, the check reports `blocked` and names the missing precondition. It must not report pass or fail in that case.
>
> Rationale: GL-003 (Test Execution Instructions) says Smart Connections TCs that need an index run read-only against `My-Setup-Vault` and never make a destructive call there. Option A's seed-and-remove would write to that vault, so it breaks this rule. BI-0087's Status and Operational steps say `My-Setup-Vault` has 0 non-ASCII notes. They also make staging one there, or installing Smart Connections in the TestVault, an owner step. The not-found locator round-trip has already been confirmed there.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Execution Instructions.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0087 - Audit Remaining Eval Composition Tools For Non ASCII Coverage.md`, `200-Decisions/ADR-014 - Plugin-Backed Typed Tools Runtime-Dependency Pattern.md`

**Advisor, after the owner ruled** (escalate: none):

> 1. Run the similar-notes check read-only against `My-Setup-Vault`, with the vault set at run time, not hard-coded. The check never seeds or removes fixtures there. Prove the not-found scenario there as it stands. The success scenario has a precondition: a non-ASCII-path note, staged by the owner and already indexed by Smart Connections. If that note is missing or not indexed, the check reports `blocked` and names the missing precondition. It must not report pass or fail in that case. All other checks stay in `TestVault-Obsidian-CLI-MCP`.
>
> Rationale: this is the owner's ruling of 2026-11-04, now recorded in BI-0087 Operational steps (a). It is consistent with GL-003 (Test Execution Instructions): Smart Connections TCs that need an index run read-only against `My-Setup-Vault`, and never make a destructive call there.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0087 - Audit Remaining Eval Composition Tools For Non ASCII Coverage.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Execution Instructions.md`, `200-Decisions/ADR-014 - Plugin-Backed Typed Tools Runtime-Dependency Pattern.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0087 - Audit Remaining Eval Composition Tools For Non ASCII Coverage.md`: Operational steps (a): replaced the either/or (stage a note in My-Setup-Vault or install Smart Connections in the TestVault) with the owner ruling of 2026-11-04: read-only in My-Setup-Vault with the vault set at run time, an owner-staged indexed non-ASCII note, and `blocked` when that note is absent.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0087 - Audit Remaining Eval Composition Tools For Non ASCII Coverage.md`: Frontmatter `updated` changed from 2026-11-03 to 2026-11-04.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0087 - Audit Remaining Eval Composition Tools For Non ASCII Coverage.md`: Appended a 2026-11-04 HTML audit-trail comment recording the owner ruling on where the similar-notes check runs.

**Owner:** choice 1 (Read-only My-Setup-Vault + owner note), via cli, 2026-11-04T09:04:44.287Z.

**Sent to the step:**

> 1. Run the similar-notes check read-only against `My-Setup-Vault`, with the vault set at run time, not hard-coded. The check never seeds or removes fixtures there. Prove the not-found scenario there as it stands. The success scenario has a precondition: a non-ASCII-path note, staged by the owner and already indexed by Smart Connections. If that note is missing or not indexed, the check reports `blocked` and names the missing precondition. It must not report pass or fail in that case. All other checks stay in `TestVault-Obsidian-CLI-MCP`.
>
> Rationale: this is the owner's ruling of 2026-11-04, now recorded in BI-0087 Operational steps (a). It is consistent with GL-003 (Test Execution Instructions): Smart Connections TCs that need an index run read-only against `My-Setup-Vault`, and never make a destructive call there.

## 4. pre-implementation / clarify (2026-11-04T09:07:09.718Z)

**Question (verbatim):**

> **Question:** What form should the repeatable non-ASCII checks take, so that a maintainer can re-run them against each new release? (FR-009)
>
> Why it matters: this decides what the item delivers (a runnable program, a test suite, or a written procedure), how the per-scenario pass / fail / `blocked` report gets produced, and whether a re-run needs a person to follow steps by hand.
>
> Context: the checks have to go through a real Obsidian, so they cannot run in CI. The repo already has a precedent for this: `scripts/probe-stdio.ts` (`npm run probe:stdio`) launches the built server (`node dist/index.js`) over real stdio with the MCP client, calls tools against a named vault, prints the results and exits non-zero on any failure. It is run by hand after `npm run build`.
>
> **Recommended:** Option A - It follows the `probe:stdio` precedent and calls the five published tools exactly as an agent would. It can also print one pass / fail / `blocked` line per scenario, with the capability, input, expected and actual results, which FR-010 to FR-012 require. A written procedure (B) depends on a person following it each time, and a live test suite that is skipped by default (C) mixes live runs into the unit-test tree, which the project keeps free of real Obsidian calls.
>
> | Option | Description |
> |--------|-------------|
> | A | A committed script under `scripts/` with its own npm command (in the style of `probe:stdio`). It launches the built server over stdio, takes the test vault and the semantic-search vault (plus the staged note path) as run-time arguments, seeds and cleans up the test-vault fixtures itself, and prints one pass / fail / `blocked` line per scenario. It exits non-zero if any scenario fails. Run by hand before a release. |
> | B | A written step-by-step procedure (a quickstart) that a maintainer or agent follows by hand against the two vaults, recording each scenario's outcome. No new code. |
> | C | A vitest suite that calls the real Obsidian and is skipped unless an environment flag is set, so CI stays green and a maintainer turns it on locally before a release. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> A. Two constraints apply. The script never writes to the semantic-search vault: there it only reads the owner-staged note path it is given, and it reports `blocked` when that note is missing or not indexed. It writes and removes fixtures only in `TestVault-Obsidian-CLI-MCP`.
>
> Rationale: in BI-0087 the guarantee is that the checks can be re-run against each new release and each one reports pass or fail on its own. A committed script delivers that without someone following steps by hand. GL-003 confines destructive calls to the TestVault and keeps Smart Connections runs read-only in `My-Setup-Vault` (owner ruling 2026-11-04). The script's output is the evidence for the vault TC pages in BI-0087 step 4.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0087 - Audit Remaining Eval Composition Tools For Non ASCII Coverage.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Execution Instructions.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `210-Guidelines/Best Practices.md`

**Sent to the step:**

> A. Two constraints apply. The script never writes to the semantic-search vault: there it only reads the owner-staged note path it is given, and it reports `blocked` when that note is missing or not indexed. It writes and removes fixtures only in `TestVault-Obsidian-CLI-MCP`.
>
> Rationale: in BI-0087 the guarantee is that the checks can be re-run against each new release and each one reports pass or fail on its own. A committed script delivers that without someone following steps by hand. GL-003 confines destructive calls to the TestVault and keeps Smart Connections runs read-only in `My-Setup-Vault` (owner ruling 2026-11-04). The script's output is the evidence for the vault TC pages in BI-0087 step 4.

## 5. pre-implementation / clarify (2026-11-04T09:08:55.451Z)

**Question (verbatim):**

> **Question:** Should this item also check the other tools that pass caller text into Obsidian the same way as the five, but are not among them (`backlinks`, `open_file`, `views_base`, `create_base`), or stay at five and leave those to a follow-up item?
>
> Why it matters: the spec's own reason for this item is that a silent failure could hide in an unchecked tool. If these four stay out with nothing recorded, that gap stays open without anyone noticing. Adding them grows the fixtures, the script and the number of test-case pages.
>
> Context (from the code index): the five in-scope tools apart from `outline` (`links`, `paths`, `pattern_search`, `smart_connections_similar`), plus the already-confirmed `read_heading`, `tag`, `find_by_property` and `smart_connections_query`, all hand caller text to Obsidian through the shared `composeEvalCode` payload in `src/tools/_shared.ts`. Four more production handlers call `composeEvalCode` with a caller-supplied note or file name, and none of them appears in the spec's stories or its out-of-scope list: `backlinks/handler.ts` (a note's incoming links), `open_file/handler.ts` (show a note), `views_base/handler.ts` and `create_base/handler.ts` (a named base file). `move` and `context_search` also call it, but the user's out-of-scope list already excludes them (moving notes, literal text search). `backlinks` has only an in-process non-ASCII test (`BI-034: non-ASCII source path (CJK) preserved in payload`), which stands in for Obsidian.
>
> **Recommended:** Option A - BI-0087 and its test-case pages are written around exactly five capabilities, and the user's request says "all five". Keeping the item at five with the other four named as an explicit follow-up keeps this item bounded and makes sure the gap is recorded rather than left silently unchecked.
>
> | Option | Description |
> |--------|-------------|
> | A | Stay at five. Record `backlinks`, `open_file`, `views_base` and `create_base` in the spec as known unchecked tools on the same route, to be covered by a follow-up item. |
> | B | Add `backlinks` only, as a sixth read-only check in the test vault (the source note already has a non-ASCII target note to link back from). Leave `open_file`, `views_base` and `create_base` to a follow-up item. |
> | C | Add all four as extra checks in this item: `backlinks` and `open_file` against the existing fixtures, and `views_base` and `create_base` against a non-ASCII-named base fixture in the test vault. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> A
>
> Rationale: BI-0087's Coverage matrix and Impact are written around exactly five tools, and its Out of scope section says not to widen the item. The four other tools are now recorded in BI-0087's Out of scope section as a known gap on the same payload route, left to a follow-up item. Name them in the spec the same way.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0087 - Audit Remaining Eval Composition Tools For Non ASCII Coverage.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0087 - Audit Remaining Eval Composition Tools For Non ASCII Coverage.md`: Out of scope: added a bullet naming `backlinks`, `open_file`, `views_base` and `create_base`. They use the same shared payload route but have no real-Obsidian non-ASCII check, so they are recorded as a known gap for a follow-up item (not filed).

**Sent to the step:**

> A
>
> Rationale: BI-0087's Coverage matrix and Impact are written around exactly five tools, and its Out of scope section says not to widen the item. The four other tools are now recorded in BI-0087's Out of scope section as a known gap on the same payload route, left to a follow-up item. Name them in the spec the same way.

## 6. pre-implementation / analyze (2026-11-04T09:20:04.110Z)

**Question (verbatim):**

> Would you like me to suggest concrete remediation edits for the top 3 issues (U1, U2, C1)?

**Advisor** (escalate: none):

> Yes. Suggest concrete remediation edits for U1, U2 and C1, and keep each one inside BI-0087's scope as recorded:
> - exactly five capabilities;
> - `backlinks`, `open_file`, `views_base` and `create_base` named only as a known gap for a follow-up item;
> - the similar-notes check read-only in `My-Setup-Vault`, reporting `blocked` when the owner-staged note is absent;
> - a committed `scripts/` probe in the style of `probe:stdio`;
> - fixtures written only to the TestVault.
>
> If a fix would widen scope, add a capability, or contradict one of these rulings, flag it as needing a decision rather than proposing it as a plain edit.
>
> I can't see U1, U2 or C1 from here. Name the issue ids and the affected text in each suggestion so the fixes can be checked against the spec.
>
> Rationale: the Constitution's spec-kit workflow wants underspecified items resolved and traceable before the plan. BI-0087's Out of scope section forbids widening the item, and the rulings above are recorded in its Operational steps (a) and Out of scope sections.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0087 - Audit Remaining Eval Composition Tools For Non ASCII Coverage.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Execution Instructions.md`

**Sent to the step:**

> Yes. Suggest concrete remediation edits for U1, U2 and C1, and keep each one inside BI-0087's scope as recorded:
> - exactly five capabilities;
> - `backlinks`, `open_file`, `views_base` and `create_base` named only as a known gap for a follow-up item;
> - the similar-notes check read-only in `My-Setup-Vault`, reporting `blocked` when the owner-staged note is absent;
> - a committed `scripts/` probe in the style of `probe:stdio`;
> - fixtures written only to the TestVault.
>
> If a fix would widen scope, add a capability, or contradict one of these rulings, flag it as needing a decision rather than proposing it as a plain edit.
>
> I can't see U1, U2 or C1 from here. Name the issue ids and the affected text in each suggestion so the fixes can be checked against the spec.
>
> Rationale: the Constitution's spec-kit workflow wants underspecified items resolved and traceable before the plan. BI-0087's Out of scope section forbids widening the item, and the rulings above are recorded in its Operational steps (a) and Out of scope sections.

## 7. pre-implementation / analyze (2026-11-04T09:21:07.213Z)

**Question (verbatim):**

> Should I apply the proposed edits U1-a to U1-c, U2-a to U2-f and C1-a to C1-e to tasks.md, research.md, data-model.md and contracts/non-ascii-check-contract.md as written?

**Advisor** (escalate: decision: The developer agent is asking for approval to apply 14 named edits to the spec artefacts, and I cannot see their text. Only the owner can approve them as written; my recommendation is conditional on each edit staying within the recorded rulings.):

> Recommended: apply U1-a to U1-c, U2-a to U2-f and C1-a to C1-e if every edit stays inside the recorded rulings:
> - exactly five capabilities;
> - `backlinks`, `open_file`, `views_base` and `create_base` named only as a known gap for a follow-up item;
> - the similar-notes check read-only in `My-Setup-Vault`, reporting `blocked` when the owner-staged, indexed non-ASCII note is absent;
> - a committed `scripts/` probe in the style of `probe:stdio`, taking its vaults and the staged note path at run time;
> - fixtures written and removed only in `TestVault-Obsidian-CLI-MCP`.
>
> Hold back any edit that adds a capability, writes to `My-Setup-Vault`, or moves live Obsidian calls into the vitest tree, and list it separately.
>
> Rationale: BI-0087's Out of scope section forbids widening the item. Operational steps (a) and GL-003 hold the vault rules.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0087 - Audit Remaining Eval Composition Tools For Non ASCII Coverage.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Execution Instructions.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

**Advisor, after the owner ruled** (escalate: none):

> Apply U1-a to U1-c, U2-a to U2-f and C1-a to C1-e to tasks.md, research.md, data-model.md and contracts/non-ascii-check-contract.md, but only where each edit stays within the recorded rulings:
> - exactly five capabilities;
> - `backlinks`, `open_file`, `views_base` and `create_base` named only as a known gap for a follow-up item;
> - the similar-notes check read-only in `My-Setup-Vault`, reporting `blocked` when the owner-staged, indexed non-ASCII note is absent;
> - a committed `scripts/` probe in the style of `probe:stdio`, taking its vaults and the staged note path at run time;
> - fixtures written and removed only in `TestVault-Obsidian-CLI-MCP`.
>
> Do not apply any edit that adds a capability, writes to `My-Setup-Vault`, or moves live Obsidian calls into the vitest tree. Report each one you skip by its id, with the reason.
>
> Rationale: this is the owner's ruling of 2026-11-04, now recorded in BI-0087. The scope limits come from BI-0087's Out of scope section and Operational steps (a), and the vault rules from GL-003.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0087 - Audit Remaining Eval Composition Tools For Non ASCII Coverage.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Execution Instructions.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0087 - Audit Remaining Eval Composition Tools For Non ASCII Coverage.md`: Appended a 2026-11-04 HTML audit-trail comment recording the owner ruling: apply the analyze remediation edits U1/U2/C1 to the spec artefacts only where they stay within the recorded rulings, and hold back any that do not.

**Owner:** choice 1 (Apply, within recorded rulings), via cli, 2026-11-04T09:22:59.273Z.

**Sent to the step:**

> Apply U1-a to U1-c, U2-a to U2-f and C1-a to C1-e to tasks.md, research.md, data-model.md and contracts/non-ascii-check-contract.md, but only where each edit stays within the recorded rulings:
> - exactly five capabilities;
> - `backlinks`, `open_file`, `views_base` and `create_base` named only as a known gap for a follow-up item;
> - the similar-notes check read-only in `My-Setup-Vault`, reporting `blocked` when the owner-staged, indexed non-ASCII note is absent;
> - a committed `scripts/` probe in the style of `probe:stdio`, taking its vaults and the staged note path at run time;
> - fixtures written and removed only in `TestVault-Obsidian-CLI-MCP`.
>
> Do not apply any edit that adds a capability, writes to `My-Setup-Vault`, or moves live Obsidian calls into the vitest tree. Report each one you skip by its id, with the reason.
>
> Rationale: this is the owner's ruling of 2026-11-04, now recorded in BI-0087. The scope limits come from BI-0087's Out of scope section and Operational steps (a), and the vault rules from GL-003.
