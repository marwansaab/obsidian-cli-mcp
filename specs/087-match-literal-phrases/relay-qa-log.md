# Relay Q&A log: speckit

Run `obsidian-cli-mcp-bi-0169-2026-11-02`, started 2026-11-02T06:14:00.936Z.

## 1. checks / preflight (2026-11-02T06:14:00.981Z)

**Question (verbatim):**

> Preflight for this Relay run of job BI-0169. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0169 in the vault.
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

> Primed for BI-0169 — Match Multi Word Search Queries As Literal Phrases.
>
> Preflight results:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` `vault_id` = `my-setup`, which matches `expected_vault_id` `my-setup` (vault display name `My-Setup-Vault`). The CLAUDE.md session-start reads are done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault, plus the per-MCP file Obsidian CLI MCP - Tool Notes.
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0169 - Match Multi Word Search Queries As Literal Phrases.md`, title "BI-0169 — Match Multi Word Search Queries As Literal Phrases".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: planned` (tier must-fix-bug, variant bug-fix). Not finished or abandoned.
> 5. Specify prompt: PASS. The `## /speckit-specify prompt` section is present and its command is exactly `/speckit-specify` (`/speckit-specify Match literal phrases`). Note not changed.
> 6. Clarify skill: LOADED (`anthropic-skills:speckit-clarify-skill`, arg "BI-0169 - Match Multi Word Search Queries As Literal Phrases"). Its answer rules apply to every question that follows.
>
> Read: BI, Constitution (v1.5.1), Architecture (ARCH-014), feature page `context_search` (FEAT-021), Obsidian CLI MCP - Tool Notes. ADRs: the BI cites none. ADR-007 and ADR-010 are relevant (cited on the feature page and the Architecture page). They were not read in full. Their substance is known from the Architecture and Constitution summaries, and they will be read in full if a question touches them.
>
> Context for the questions ahead: Tool Notes records a related single-term quirk (Observed 2026-11-01). A line holding the term twice comes back as two identical `context_search` entries, so `count` counts occurrences, not lines. This is relevant to the BI's "one entry per matching line" acceptance criterion. The BI's Out of scope excludes `pattern_search` and match-text trimming (BI-0170).
>
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0169 - Match Multi Word Search Queries As Literal Phrases.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/context_search.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`, `000-Meta/MCP Tool Notes.md`, `210-Guidelines/Best Practices.md`, `200-Decisions/Decision Log.md`, `220-Planning/Session Handover.md`, `000-Meta/About This Vault.md`

**Sent to the step:**

> Primed for BI-0169 — Match Multi Word Search Queries As Literal Phrases.
>
> Preflight results:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` `vault_id` = `my-setup`, which matches `expected_vault_id` `my-setup` (vault display name `My-Setup-Vault`). The CLAUDE.md session-start reads are done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault, plus the per-MCP file Obsidian CLI MCP - Tool Notes.
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0169 - Match Multi Word Search Queries As Literal Phrases.md`, title "BI-0169 — Match Multi Word Search Queries As Literal Phrases".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: planned` (tier must-fix-bug, variant bug-fix). Not finished or abandoned.
> 5. Specify prompt: PASS. The `## /speckit-specify prompt` section is present and its command is exactly `/speckit-specify` (`/speckit-specify Match literal phrases`). Note not changed.
> 6. Clarify skill: LOADED (`anthropic-skills:speckit-clarify-skill`, arg "BI-0169 - Match Multi Word Search Queries As Literal Phrases"). Its answer rules apply to every question that follows.
>
> Read: BI, Constitution (v1.5.1), Architecture (ARCH-014), feature page `context_search` (FEAT-021), Obsidian CLI MCP - Tool Notes. ADRs: the BI cites none. ADR-007 and ADR-010 are relevant (cited on the feature page and the Architecture page). They were not read in full. Their substance is known from the Architecture and Constitution summaries, and they will be read in full if a question touches them.
>
> Context for the questions ahead: Tool Notes records a related single-term quirk (Observed 2026-11-01). A line holding the term twice comes back as two identical `context_search` entries, so `count` counts occurrences, not lines. This is relevant to the BI's "one entry per matching line" acceptance criterion. The BI's Out of scope excludes `pattern_search` and match-text trimming (BI-0170).
>
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.

## 2. pre-implementation / specify (2026-11-02T06:15:03.677Z)

**Question (verbatim):**

> Return the full content of the "/speckit-specify prompt" section of job BI-0169's note, verbatim and complete, in `answer`, without the surrounding code fence. Do not edit or summarise it. If the note has no such section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-specify Match literal phrases
>
> ## Feature
> When an agent searches the vault for text that contains spaces, both text-search capabilities treat the whole query as one literal phrase, exactly as their documentation says.
>
> ## Why
> Both text-search capabilities are documented as literal substring searches, but a query with several words is currently split into separate words: files containing all the words in any order match, and the line-level search returns every line containing any one of the words, duplicating lines that contain several. Agents looking for an exact sentence get false matches and inflated counts.
>
> ## User stories
> - As an agent, I want a multi-word query to match only text containing that exact phrase, so that results mean what the documentation says.
> - As an agent using line-level search, I want each matching line returned once, so that counts are accurate.
> - As an agent, I want my query matched literally even if it contains quotation marks or other characters with meaning to the editor's own search syntax, so that I never have to escape anything.
>
> ## Acceptance criteria
>
> **Story: phrase matching**
> - Given a note containing "alpha beta" on one line and notes containing only "alpha" or only "beta", when an agent searches for "alpha beta", then only the note with the exact phrase matches.
> - Given a note containing "beta alpha" but not "alpha beta", when an agent searches for "alpha beta", then the note does not match.
>
> **Story: one entry per matching line**
> - Given a line containing the phrase, when line-level results are returned, then that line appears exactly once.
>
> **Story: literal characters**
> - Given a query that contains double quotes or other search-syntax characters, when an agent searches, then the query is matched as literal text.
>
> ## Out of scope
> - Adding a non-literal or multi-term search mode.
> - Regular-expression search (a separate capability).
> - Changes to case-sensitivity rules, folder scoping, truncation or ordering.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0169 - Match Multi Word Search Queries As Literal Phrases.md`

**Sent to the step:**

> /speckit-specify Match literal phrases
>
> ## Feature
> When an agent searches the vault for text that contains spaces, both text-search capabilities treat the whole query as one literal phrase, exactly as their documentation says.
>
> ## Why
> Both text-search capabilities are documented as literal substring searches, but a query with several words is currently split into separate words: files containing all the words in any order match, and the line-level search returns every line containing any one of the words, duplicating lines that contain several. Agents looking for an exact sentence get false matches and inflated counts.
>
> ## User stories
> - As an agent, I want a multi-word query to match only text containing that exact phrase, so that results mean what the documentation says.
> - As an agent using line-level search, I want each matching line returned once, so that counts are accurate.
> - As an agent, I want my query matched literally even if it contains quotation marks or other characters with meaning to the editor's own search syntax, so that I never have to escape anything.
>
> ## Acceptance criteria
>
> **Story: phrase matching**
> - Given a note containing "alpha beta" on one line and notes containing only "alpha" or only "beta", when an agent searches for "alpha beta", then only the note with the exact phrase matches.
> - Given a note containing "beta alpha" but not "alpha beta", when an agent searches for "alpha beta", then the note does not match.
>
> **Story: one entry per matching line**
> - Given a line containing the phrase, when line-level results are returned, then that line appears exactly once.
>
> **Story: literal characters**
> - Given a query that contains double quotes or other search-syntax characters, when an agent searches, then the query is matched as literal text.
>
> ## Out of scope
> - Adding a non-literal or multi-term search mode.
> - Regular-expression search (a separate capability).
> - Changes to case-sensitivity rules, folder scoping, truncation or ordering.

## 3. pre-implementation / clarify (2026-11-02T06:18:39.971Z)

**Question (verbatim):**

> ## Question 1
>
> **Question:** When an agent searches for a phrase with `search` in its default path mode, should a note still match if the phrase appears only in its file name (or other metadata) and not in any line of its text? (FR-008)
>
> **Why it matters:** This decides whether the path search and the line-level searches can return different notes for the same phrase, and what the tests must check.
>
> **Context:** Today `executeSearch` (`src/tools/search/handler.ts:55`) sends the query unchanged to the editor's `search` command, then returns the paths that command gives back, keeping only `.md` files (line 141). The help reference describes the result as "filename-match inflation": `query=Welcome` returns `Welcome.md` even when no line of the note contains "Welcome", and line mode leaves such notes out. The current draft keeps this behaviour (FR-008 and the Assumptions section), but the user's out-of-scope list does not say whether to keep it.
>
> **Recommended:** Option A. It keeps the documented contract and limits this feature to how the query is matched. Removing file-name matching would be a separate change to what the path search looks at.
>
> | Option | Description |
> |--------|-------------|
> | A | Keep it. The path search still matches notes whose file name or metadata contains the whole phrase, as documented today. The line-level modes look at text lines only. |
> | B | Text only. The path search returns exactly the notes that have at least one line containing the phrase, so it always agrees with the line-level modes. This drops the documented "filename-match inflation" behaviour. |
> | C | File name only. The path search also matches notes whose file name contains the phrase, but not other metadata. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> A
>
> BI-0169 limits the fix to how the query is matched. Its Feature section is about phrase matching, and filename matching is not listed as something to change. The vault records filename matching as existing, documented behaviour: Tool Notes `context_search` says filename-only matches are dropped, "count can be lower than sibling `search` (which matches filenames)", and the `context_search` feature page carries a "Filename-match drop (inherited)" caveat. Dropping filename matching would change what `search` looks at, which is outside this BI's scope.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0169 - Match Multi Word Search Queries As Literal Phrases.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/context_search.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`

**Sent to the step:**

> A
>
> BI-0169 limits the fix to how the query is matched. Its Feature section is about phrase matching, and filename matching is not listed as something to change. The vault records filename matching as existing, documented behaviour: Tool Notes `context_search` says filename-only matches are dropped, "count can be lower than sibling `search` (which matches filenames)", and the `context_search` feature page carries a "Filename-match drop (inherited)" caveat. Dropping filename matching would change what `search` looks at, which is outside this BI's scope.

## 4. pre-implementation / clarify (2026-11-02T06:19:25.898Z)

**Question (verbatim):**

> ## Question 2
>
> **Question:** If a query begins or ends with spaces, for example `" alpha beta "`, should those spaces count as part of the phrase that must be found? (FR-002)
>
> **Why it matters:** This decides whether `" alpha"` can match `alpha` at the very start of a line, and which fixtures the tests must use.
>
> **Context:** Both input schemas reject an empty or whitespace-only query by trimming it for the check only (`searchInputSchema` superRefine, `src/tools/search/schema.ts:40`; the same check in `contextSearchInputSchema`). The query that is sent on is not trimmed. The help references say internal whitespace is "preserved verbatim" but say nothing about the ends. The current draft keeps the leading and trailing spaces (FR-002 and the Assumptions section).
>
> **Recommended:** Option A. "Literal substring" means every character counts. Trimming would silently change what the agent asked for, and an agent can always leave the spaces out.
>
> | Option | Description |
> |--------|-------------|
> | A | Keep them. Leading and trailing whitespace is part of the phrase, like internal whitespace, so `" alpha"` does not match `alpha` at the start of a line. |
> | B | Trim them. Leading and trailing whitespace is removed before matching. Internal whitespace is still kept exactly. |
> | C | Reject them. A query with leading or trailing whitespace fails validation with an error. This adds a new validation rule, which conflicts with FR-009. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> A
>
> The BI's third user story asks for the query to be "matched literally". Both tools are documented as literal substring searches, and the `context_search` description says whitespace is "preserved verbatim" (`"foo bar"` does not match `foo  bar`). The vault documents no trimming of the query at either end; the whitespace-only check is validation only (the `context_search` feature page, schema step 1).

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0169 - Match Multi Word Search Queries As Literal Phrases.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/context_search.md`

**Sent to the step:**

> A
>
> The BI's third user story asks for the query to be "matched literally". Both tools are documented as literal substring searches, and the `context_search` description says whitespace is "preserved verbatim" (`"foo bar"` does not match `foo  bar`). The vault documents no trimming of the query at either end; the whitespace-only check is validation only (the `context_search` feature page, schema step 1).

## 5. pre-implementation / plan (2026-11-02T06:31:14.652Z)

**Question (verbatim):**

> ## Question: approve the two test-line edits?
>
> **Question:** May the implementation change exactly two existing test lines, `src/tools/search/handler.test.ts:41` and `src/tools/context_search/handler.test.ts:44`, from `expect(argv).toContain("query=foo");` to `expect(argv).toContain('query="foo"');`?
>
> **Why it matters:** The fix has to change what is sent as `query=`, so these two checks fail as written. Under `.memory/refactor-decisions.md` item 5, any change that forces an existing test edit needs your approval first.
>
> **Recommended:** Option A. These are the only two lines in the codebase that check the search tools' `query=` value, and nothing else in either test file depends on the old form. The plan requires both test files to otherwise pass unchanged, which is the check that single-word results didn't change.
>
> | Option | Description |
> |--------|-------------|
> | A | Approve exactly those two one-line edits, recorded under item 5. No other existing test line may change. |
> | B | Approve, but only if the implement step finds those are the only existing assertions that fail. Any other failure stops the work for review. |
> | C | Don't approve. Keep the existing tests unchanged. The fix then can't change what is sent to the CLI, so FR-001 and FR-003 can't be met. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: decision: The repo's refactor-decisions item 5 reserves approval of edits to existing tests to the owner, and no vault note gives that approval to the advisor. The vault supports the change, but the approval itself is the owner's decision.):

> A (recommended, pending owner approval). Change exactly those two assertions to `expect(argv).toContain('query="foo"');` and record the change under refactor-decisions item 5. Leave every other existing test line as it is. If any other existing assertion fails, stop and raise it for review.
>
> Rationale: BI-0169 requires the whole query to be matched as one literal phrase. Tool Notes records double-quoting the phrase as the working fix (`context_search` and `search` sections). The new form also has to quote single-word queries, and the BI lists no single-word behaviour change, so both test files must otherwise pass unchanged; that is the regression check. Constitution Principle II requires test updates in the same change.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0169 - Match Multi Word Search Queries As Literal Phrases.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

**Advisor, after the owner ruled** (escalate: none):

> B
>
> Edit exactly two assertions, `src/tools/search/handler.test.ts:41` and `src/tools/context_search/handler.test.ts:44`, from `query=foo` to `query="foo"`, and record the change under refactor-decisions item 5. This approval holds only if those two are the only existing assertions that fail during implement. If any other existing test fails, stop and raise it for owner review. Do not edit that test.
>
> Rationale: owner ruling 2026-11-02, recorded on BI-0169. The double-quoted phrase is the literal-phrase mechanism recorded in Tool Notes. The rest of both test files still passing unchanged is the regression check for single-word queries.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0169 - Match Multi Word Search Queries As Literal Phrases.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0169 - Match Multi Word Search Queries As Literal Phrases.md`: Appended a 2026-11-02 HTML-comment audit entry recording the owner's ruling B (the two test-line edits are approved only if they are the only existing failures; any other failure stops the work for review), plus the clarify answers so far (filename matching kept, edge whitespace kept).
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0169 - Match Multi Word Search Queries As Literal Phrases.md`: Frontmatter `updated` 2026-10-31 → 2026-11-02 (path-scoped find_and_replace, previewed first).

**Owner:** choice 2 (Approve if only these fail (B)), via cli, 2026-11-02T06:32:23.419Z.

**Sent to the step:**

> B
>
> Edit exactly two assertions, `src/tools/search/handler.test.ts:41` and `src/tools/context_search/handler.test.ts:44`, from `query=foo` to `query="foo"`, and record the change under refactor-decisions item 5. This approval holds only if those two are the only existing assertions that fail during implement. If any other existing test fails, stop and raise it for owner review. Do not edit that test.
>
> Rationale: owner ruling 2026-11-02, recorded on BI-0169. The double-quoted phrase is the literal-phrase mechanism recorded in Tool Notes. The rest of both test files still passing unchanged is the regression check for single-word queries.

## 6. pre-implementation / analyze (2026-11-02T06:37:04.976Z)

**Question (verbatim):**

> Would you like me to suggest concrete remediation edits for the top 6 issues?

**Advisor** (escalate: none):

> Yes. Suggest concrete edits for all 6, then apply the ones that only bring spec/plan/tasks into line with BI-0169 and the clarifications recorded so far: filename matching kept, edge whitespace kept, and the two test-line edits approved only if they are the only failures. Send any edit that would change scope, create or reverse a decision, or touch an existing test beyond the two approved lines back as a question first.
>
> Rationale: the Constitution's spec-kit workflow requires the spec to have no underspecified items left, and the plan to pass the Constitution Check, before `/speckit-implement`. The BI-0169 audit entry for 2026-11-02 records the boundaries that apply.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0169 - Match Multi Word Search Queries As Literal Phrases.md`

**Sent to the step:**

> Yes. Suggest concrete edits for all 6, then apply the ones that only bring spec/plan/tasks into line with BI-0169 and the clarifications recorded so far: filename matching kept, edge whitespace kept, and the two test-line edits approved only if they are the only failures. Send any edit that would change scope, create or reverse a decision, or touch an existing test beyond the two approved lines back as a question first.
>
> Rationale: the Constitution's spec-kit workflow requires the spec to have no underspecified items left, and the plan to pass the Constitution Check, before `/speckit-implement`. The BI-0169 audit entry for 2026-11-02 records the boundaries that apply.

## 7. pre-implementation / analyze (2026-11-02T06:39:10.162Z)

**Question (verbatim):**

> ## Question: should the live check become a required gate?
>
> **Question:** Should the live vault check (T029, quickstart §3) become a required pre-merge gate, or should FR-013 be reworded so the automated tests prove the quoted query and the earlier live probes stand as the evidence for matching? (FR-013(a), SC-001, SC-003, SC-006)
>
> **Why it matters:** The handler tests replace the Obsidian CLI with canned answers, so they can only check that the query is sent quoted and escaped. Proof that only exact-phrase notes and lines come back needs the real CLI. Right now that check is optional (plan decision D6), which leaves FR-013(a) and SC-001, SC-003 and SC-006 without a required proof.
>
> **Recommended:** Option A. These success criteria are about what agents actually see, and only the real CLI can show it. The live probes ran before implementation, against raw CLI calls rather than the built server. The check costs about one fixture folder in the test vault Sandbox.
>
> | Option | Description |
> |--------|-------------|
> | A | Make T029 required. It must pass, with results recorded in `post-implement.md`, before the work is marked complete. FR-013 stays as written: the automated rows prove the query sent to the CLI, and T029 proves the matching. Reverses plan D6. |
> | B | Keep T029 optional. Reword FR-013(a) and (e) to "automated tests MUST prove that each mode sends the query as the escaped, double-quoted phrase", and cite research F5/F6 as the evidence for SC-001 and SC-003. Narrows a spec requirement. |
> | C | Both: make T029 required, and also reword FR-013 so it says which proof each check provides. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: decision: Option A reverses plan decision D6, which made the live check optional. The vault supports live validation, but reversing a recorded plan decision is the owner's call.):

> A (recommended, pending owner ruling, because it reverses plan D6). Make T029 required: it must pass against the built server in the TestVault Sandbox, with results recorded in `post-implement.md`, before the work is marked complete. Keep FR-013 as written. The automated rows prove the escaped, quoted query is sent; T029 proves the matching (SC-001, SC-003, SC-006).
>
> Rationale: Best Practices defines a shipped feature as one "empirically validated against the live MCP". All of BI-0169's evidence comes from live probes (TestVault `Sandbox/TN/G2/`, `Sandbox/BV/B/`), and the BI says "No test case yet". Canned CLI answers cannot show the phrase-only result the BI's acceptance criteria require.

Sources: `210-Guidelines/Best Practices.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0169 - Match Multi Word Search Queries As Literal Phrases.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`

**Advisor, after the owner ruled** (escalate: none):

> A
>
> Make T029 required: it must pass against the built server in the TestVault Sandbox, with results recorded in `post-implement.md`, before the work is marked complete. Record that plan D6 is reversed. Keep FR-013 as written. The automated rows prove the escaped, quoted query is sent; T029 proves phrase-only matching (SC-001, SC-003, SC-006).
>
> Rationale: owner ruling 2026-11-02, recorded on BI-0169. Best Practices treats empirical validation against the live MCP as the bar for shipped, and canned CLI answers cannot show which notes and lines actually match.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0169 - Match Multi Word Search Queries As Literal Phrases.md`, `210-Guidelines/Best Practices.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0169 - Match Multi Word Search Queries As Literal Phrases.md`: Appended a 2026-11-02 HTML-comment audit entry recording the owner's ruling A: live check T029 is a required gate (plan D6 reversed) and FR-013 is unchanged.

**Owner:** choice 1 (Make T029 required (A)), via cli, 2026-11-02T06:40:00.087Z.

**Sent to the step:**

> A
>
> Make T029 required: it must pass against the built server in the TestVault Sandbox, with results recorded in `post-implement.md`, before the work is marked complete. Record that plan D6 is reversed. Keep FR-013 as written. The automated rows prove the escaped, quoted query is sent; T029 proves phrase-only matching (SC-001, SC-003, SC-006).
>
> Rationale: owner ruling 2026-11-02, recorded on BI-0169. Best Practices treats empirical validation against the live MCP as the bar for shipped, and canned CLI answers cannot show which notes and lines actually match.

## 8. review / fix (2026-11-02T06:59:28.790Z)

**Question (verbatim):**

> The review found that `oneMatchPerLine(query, wire)` (src/tools/search/literal-phrase.ts) holds two rules under one name: it removes duplicate lines, and when the query contains a line break it also empties every file's matches, returning `{file, matches: []}` entries that nothing reads. Fixing this means changing a helper contract that spec 087 sets out. contracts/literal-phrase-contract.md fixes the signature `oneMatchPerLine(query, wire)` and row L8 ("every file's `matches` is `[]`; file entries are kept"), and research D2 describes the same thing. What tool callers see is unaffected either way: a line-break query still returns no lines in line mode (FR-004, handler tests S7 and C7 unchanged).
>
> | Option | What changes |
> |---|---|
> | A (recommended) | `oneMatchPerLine(wire)` only removes duplicate lines; the line-break guard (`if (/[\r\n]/.test(query)) return the empty result`) moves into `lineMatches`. Amend contract row L8 and research D2 to match. L8 becomes a test of the line-break rule through `lineMatches`, and L7 drops its `query` argument. |
> | B | Keep `oneMatchPerLine(query, wire)` and L8 exactly as the contract says; only rename or document it. Finding 2 stays partly open. |
> | C | Leave it as it is; record finding 2 as declined in refactor-decisions with the contract as the reason. |
>
> Recommendation: A. Callers see the same results, the two rules each get one clear name, and the empty per-file entries that L8 pins (something no consumer reads) go away. The cost is a small amendment to the 087 contract and research text, plus edits to L7 and L8, both of which are new in this PR. Which option?

**Advisor** (escalate: none):

> A
>
> Constitution Principle I requires small, single-purpose units, and a unit that takes on a second responsibility must be split. Callers see no change: FR-004 and handler tests S7 and C7 are untouched. L7 and L8 are new in this PR, so this is not an edit to an existing test. Amend contract row L8 and research D2 in the same change and record the amendment in the spec's Clarifications.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0169 - Match Multi Word Search Queries As Literal Phrases.md`

**Sent to the step:**

> A
>
> Constitution Principle I requires small, single-purpose units, and a unit that takes on a second responsibility must be split. Callers see no change: FR-004 and handler tests S7 and C7 are untouched. L7 and L8 are new in this PR, so this is not an edit to an existing test. Amend contract row L8 and research D2 in the same change and record the amendment in the spec's Clarifications.

## 9. record / record-in-vault (2026-11-02T07:07:37.754Z)

**Question (verbatim):**

> The work for job BI-0169 is now a reviewed, documented pull request. Record that on the job's note, following the vault's conventions for backlog items:
> - the spec branch: 087-match-literal-phrases
> - the feature folder in the code repository: specs/087-match-literal-phrases
> - the pull request: https://github.com/marwansaab/obsidian-cli-mcp/pull/120 (number 120)
> - the status that means "in review" in this vault (if the vault has no such status, escalate `decision` with up to 3 choices)
> - a dated HTML comment saying Relay run obsidian-cli-mcp-bi-0169-2026-11-02 produced it.
>
> Dry run: no. In a dry run, change nothing: list each edit you would make in `vault_edits`, starting its change with "Would". Otherwise list each edit you made.

**Advisor** (escalate: none):

> BI-0169 is now recorded as in review, using the same pattern as BI-0135 (PR #110).
>
> - `status`: changed from `planned` to `in-review`. The vault's backlog-item statuses (Vault Frontmatter Convention) are `queued | planned | in-flight | in-review | shipped | deferred | superseded | retired`.
> - `spec_branch`: set to `087-match-literal-phrases`. An empty `npm_version_shipped: ""` was added after `feature`, as on BI-0135.
> - `## Status`: a paragraph "**In review — 2026-11-02.**" now opens the section. It links [marwansaab/obsidian-cli-mcp#120](https://github.com/marwansaab/obsidian-cli-mcp/pull/120) and names the spec branch and the feature folder `specs/087-match-literal-phrases`. The existing *Planned.* paragraph is kept below it.
> - An HTML comment dated 2026-11-02 at the end of the note says Relay run obsidian-cli-mcp-bi-0169-2026-11-02 produced PR #120 and gives the branch and folder.
>
> I read `status` and `spec_branch` back afterwards and both show the new values. `updated` was already 2026-11-02 from an earlier edit in this run.

Sources: `000-Meta/Vault Frontmatter Convention.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0135 - Harden Eval Response Parsing Against Plugin Stdout Noise.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0169 - Match Multi Word Search Queries As Literal Phrases.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0169 - Match Multi Word Search Queries As Literal Phrases.md`: Frontmatter `status` planned → in-review (path-scoped find_and_replace, previewed first).
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0169 - Match Multi Word Search Queries As Literal Phrases.md`: Frontmatter: added `spec_branch: 087-match-literal-phrases` and `npm_version_shipped: ""` after `feature` (BI-0135 pattern).
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0169 - Match Multi Word Search Queries As Literal Phrases.md`: ## Status: added an 'In review — 2026-11-02' paragraph with the PR #120 link, spec branch and feature folder `specs/087-match-literal-phrases`, above the existing Planned paragraph.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0169 - Match Multi Word Search Queries As Literal Phrases.md`: Appended an HTML comment dated 2026-11-02 saying Relay run obsidian-cli-mcp-bi-0169-2026-11-02 produced PR #120 (branch and folder named).

**Sent to the step:**

> BI-0169 is now recorded as in review, using the same pattern as BI-0135 (PR #110).
>
> - `status`: changed from `planned` to `in-review`. The vault's backlog-item statuses (Vault Frontmatter Convention) are `queued | planned | in-flight | in-review | shipped | deferred | superseded | retired`.
> - `spec_branch`: set to `087-match-literal-phrases`. An empty `npm_version_shipped: ""` was added after `feature`, as on BI-0135.
> - `## Status`: a paragraph "**In review — 2026-11-02.**" now opens the section. It links [marwansaab/obsidian-cli-mcp#120](https://github.com/marwansaab/obsidian-cli-mcp/pull/120) and names the spec branch and the feature folder `specs/087-match-literal-phrases`. The existing *Planned.* paragraph is kept below it.
> - An HTML comment dated 2026-11-02 at the end of the note says Relay run obsidian-cli-mcp-bi-0169-2026-11-02 produced PR #120 and gives the branch and folder.
>
> I read `status` and `spec_branch` back afterwards and both show the new values. `updated` was already 2026-11-02 from an earlier edit in this run.
