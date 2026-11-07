# Relay Q&A log: speckit-bugfix

Run `obsidian-cli-mcp-bugfix-bi-0177-2026-11-07`, started 2026-11-07T03:30:17.262Z.

## 1. checks / preflight (2026-11-07T03:30:17.308Z)

**Question (verbatim):**

> Preflight for this Relay bug-fix run of job BI-0177. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0177 in the vault.
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

> Primed for BI-0177 — Distinguish File Blocking Move Destination Folder (re-read 2026-11-07; the note was redrafted 2026-11-05 for the remaining scope).
> Read: BI-0177 (current text), Constitution (v1.5.1), Architecture, ADR-015; earlier in this conversation also BI-0172, TC-00701 and the Obsidian CLI MCP Tool Notes.
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.
>
> Readiness checks:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` `vault_id` = `my-setup`, which matches `expected_vault_id` (vault `My-Setup-Vault`). Session-start reads were already done in this conversation.
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`. Title: "BI-0177 — Distinguish File Blocking Move Destination Folder".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: planned`. It was set back to planned on 2026-11-04 after the 0.9.0-local validation. The first fix (PR #139, moves by `path`) shipped, but two TCs still fail.
> 5. Variant: PASS. `variant: bug-fix`.
> 6. Prompt section: PASS. No "/speckit-bug-assess prompt" section. The "/speckit-specify prompt" ("Report blocked destinations", redrafted 2026-11-05) describes the expected behaviour:
>    - A move by note name or of the active note must also return the "file in the way" failure (`NOT_A_FOLDER`), like a move by `path`; failing evidence: TC-00865 step 4 and TC-00900 (active mode).
>    - The `move` short description must name the failure (TC-00867). Owner ruling 2026-11-05: drop "(change it with `obsidian_exec`)" so the description stays within the 400-character cap.
>    - `FOLDER_NOT_FOUND` and destination-file-exists keep their current failures.
>    - Note left unchanged.
> 7. Clarify skill: already loaded in this conversation (`anthropic-skills:speckit-clarify-skill`, "BI-0177 - Distinguish File Blocking Move Destination Folder"). Its answering rules stay in force.
>
> Context: the 2026-11-04 clarifications on the note still apply: `NOT_A_FOLDER` with `details.folder`, the withheld-failure rule when the lookup fails, the disk-stat blocker check and the T0 probe through `Obsidian.com`. The frontmatter still carries `spec_branch: fix/bi-0177` from the shipped PR #139.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`

**Sent to the step:**

> Primed for BI-0177 — Distinguish File Blocking Move Destination Folder (re-read 2026-11-07; the note was redrafted 2026-11-05 for the remaining scope).
> Read: BI-0177 (current text), Constitution (v1.5.1), Architecture, ADR-015; earlier in this conversation also BI-0172, TC-00701 and the Obsidian CLI MCP Tool Notes.
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.
>
> Readiness checks:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` `vault_id` = `my-setup`, which matches `expected_vault_id` (vault `My-Setup-Vault`). Session-start reads were already done in this conversation.
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`. Title: "BI-0177 — Distinguish File Blocking Move Destination Folder".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: planned`. It was set back to planned on 2026-11-04 after the 0.9.0-local validation. The first fix (PR #139, moves by `path`) shipped, but two TCs still fail.
> 5. Variant: PASS. `variant: bug-fix`.
> 6. Prompt section: PASS. No "/speckit-bug-assess prompt" section. The "/speckit-specify prompt" ("Report blocked destinations", redrafted 2026-11-05) describes the expected behaviour:
>    - A move by note name or of the active note must also return the "file in the way" failure (`NOT_A_FOLDER`), like a move by `path`; failing evidence: TC-00865 step 4 and TC-00900 (active mode).
>    - The `move` short description must name the failure (TC-00867). Owner ruling 2026-11-05: drop "(change it with `obsidian_exec`)" so the description stays within the 400-character cap.
>    - `FOLDER_NOT_FOUND` and destination-file-exists keep their current failures.
>    - Note left unchanged.
> 7. Clarify skill: already loaded in this conversation (`anthropic-skills:speckit-clarify-skill`, "BI-0177 - Distinguish File Blocking Move Destination Folder"). Its answering rules stay in force.
>
> Context: the 2026-11-04 clarifications on the note still apply: `NOT_A_FOLDER` with `details.folder`, the withheld-failure rule when the lookup fails, the disk-stat blocker check and the T0 probe through `Obsidian.com`. The frontmatter still carries `spec_branch: fix/bi-0177` from the shipped PR #139.

## 2. assess / bug-assess (2026-11-07T03:30:55.802Z)

**Question (verbatim):**

> Return the bug report for job BI-0177 as one message in `answer`, built only from the note's own text. Do not edit, summarise or add to it.
> - If the note has a "/speckit-bug-assess prompt" section: its full content, verbatim and complete, without the surrounding code fence.
> - Otherwise exactly this, with each section's full content verbatim and complete: a first line `/speckit-bug-assess slug=BI-0177`, a blank line, the line `## Impact` followed by the note's "Impact" section, a blank line, the line `## Status and evidence` followed by the note's "Status" section, a blank line, and the line `## Expected behaviour` followed by the content of its "/speckit-specify prompt" section without the surrounding code fence. Leave out any of the first two sections the note doesn't have.
> If the note has neither prompt section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-bug-assess slug=BI-0177
>
> ## Impact
> Spec 090's edge case "Destination folder name exists as a file" says a destination whose folder segment names an existing file is not a missing folder and must not carry the destination-folder-not-found signal. The tool classifies it as `FOLDER_NOT_FOUND` anyway, and the recovery hint (create the folder, then retry) cannot be followed, because a file already holds that name. An agent acting on the hint will either fail to create the folder or loop. Low frequency — it needs a destination path that runs through a file name — but it is a plain contract violation of the spec BI-0172 just shipped, and the misleading recovery advice is the harm the classification was meant to remove.
>
> ## Status and evidence
> *Planned* 2026-11-05 (Open Bugs triage after the 0.9.0 validation): still valid, narrowed to the two failures below — the `file`-locator variant (TC-00865 step 4) and the `move` description lacking `NOT_A_FOLDER` (TC-00867). Prompt redrafted for this scope; ratings unchanged. **Widened 2026-11-05 (repo-session assessment C1, owner-approved):** active mode very likely fails the same way, because it also forwards the folder form unexpanded; the unit test for it stubs an ENOENT line it probably never receives live (inferred from the code, not observed). **Live check done 2026-11-05** ([[TC-00900 - Move Active Note To Folder Form Through A File Returns NOT_A_FOLDER|TC-00900]], fail as expected): active mode returns the same raw `Error: Destination file already exists!` with no `details.code`. Its argv resolves the source to `path=…` but forwards `to=Fixtures/BI-0177/v01/Blocker.md/` unexpanded, with no `vault=`; nothing changed on disk. **Owner ruling 2026-11-05:** drop "(change it with `obsidian_exec`)" from the `move` description so the `NOT_A_FOLDER` sentence fits the 400-character cap (397 characters, no audit exception); the help page keeps that routing.
>
>
> **Back to planned — 2026-11-04 (0.9.0-local validation).** Black-box validation on the post-#145 0.9.0-local build, run on TestVault, failed one of this item's own acceptance points. A `move` that names the source by `file` (not `path`), with a destination folder segment that is an existing file, returns the raw untyped `Destination file already exists!` (`CLI_REPORTED_ERROR`, no `details.code`) instead of `NOT_A_FOLDER`. The same move by `path` is correct. Failing TC: [[TC-00865 - Move Destination Through A File Variants Return NOT_A_FOLDER Naming The Blocking File|TC-00865]] (step 4). Also failing: [[TC-00867 - Move Description And Help Document The NOT_A_FOLDER Failure|TC-00867]], because the `move` tool description does not name `NOT_A_FOLDER`; the help page does. The owner ruled on 2026-11-05 that this item's clarification wins over [[BI-0027 - Audit Tool Descriptions|BI-0027]]'s description budget: the `move` description must name `NOT_A_FOLDER` (confirmed absent on the live MCP Inspector `tools/list`), and that is part of this item's fix. Passing: TC-00701 (Expected refreshed), TC-00695, TC-00707, TC-00866. Unit-only (not reachable black-box): blocker-lookup failure, POSIX `ENOTDIR`.
>
> **Shipped — 2026-11-04.** Merged to main via [marwansaab/obsidian-cli-mcp#139](https://github.com/marwansaab/obsidian-cli-mcp/pull/139) on 2026-11-04 at 02:40 UTC. Status recorded 2026-11-04 at the owner's direction. `npm_version_shipped` is not set yet: the release this merge goes out in has not been confirmed.
>
> **Live checks still open (gaps accepted by the owner, 2026-11-04).** (1) The POSIX `ENOTDIR` line for a rename through a file, still inferred (only the Windows line was captured live). (2) [[TC-00701 - Move Destination Folder Segment Naming A File Is Not FOLDER_NOT_FOUND|TC-00701]] re-run on the next published local release.
>
> **In review — 2026-11-04.** The fix is a reviewed, documented pull request: [marwansaab/obsidian-cli-mcp#139](https://github.com/marwansaab/obsidian-cli-mcp/pull/139), fix branch `fix/bi-0177`, bug folder `.specify/bugs/bi-0177` in the repo (assessment, fix and test reports). Covers `move`. Awaiting owner merge.
>
> *Planned.* Filed 2026-11-02 from the 0.9.0-local test run of the 24 in-review BIs. Follow-up to [[BI-0172 - Classify Move Missing Destination Folder Error]] (spec `090-classify-missing-destination`), which stays in review. Evidence: [[TC-00701 - Move Destination Folder Segment Naming A File Is Not FOLDER_NOT_FOUND]] (fail on `@marwansaab/obsidian-cli-mcp@0.9.0-local`). In `TestVault-Obsidian-CLI-MCP`, `move` with `path: "Fixtures/BI-0172/c07/MoveMe.md"` and `to: "Fixtures/BI-0172/c07/Blocker.md/"`, where `Blocker.md` is an existing note, returned `CLI_REPORTED_ERROR` with `details.code: "FOLDER_NOT_FOUND"`, `details.folder: "Fixtures/BI-0172/c07/Blocker.md"` and a message saying that folder "does not exist in the vault" and advising the caller to create it and retry. No absolute path leaked and nothing changed on disk, so the other BI-0172 rules held.
>
> ## Expected behaviour
> Redrafted 2026-11-05 with the `speckit-specify-skill` for the remaining scope only: the blocked-destination failure shipped in PR #139 for moves by path, but a move that names its source by note name still gets the raw "already exists" text (TC-00865 step 4), and the tool description does not name the failure (TC-00867). The previous draft is in the vault's git history.
>
> /speckit-specify Report blocked destinations
>
> ## Feature
> Whenever a move is blocked because a file sits where the destination folder should be, the agent gets the same clear "a file is in the way" failure, however it named the note to move, and the move tool's short description tells agents this failure exists.
>
> ## Why
> A move that names its note by path already reports a file in the way. The same move naming the note by its name instead returns raw text saying the destination file already exists, which points the agent at the wrong file. Agents also cannot learn of the failure from the tool's description, so they do not plan for it.
>
> ## User stories
> - As an agent, I want a move blocked by a file in the destination's folder position to give the same failure whether I named the note by path, by name or moved the active note, so that one recovery step works for all three.
> - As an agent, I want the move tool's description to name this failure, so that I know to expect it before I call the tool.
> - As an agent, I want a genuinely missing destination folder and an existing destination file to keep their current failures, so that their recovery advice still applies.
>
> ## Acceptance criteria
> **Story: same failure however the note is chosen**
> - Given a note "Blocker.md" exists, when the agent moves another note, named by its note name, to "Blocker.md/" in the same folder, then the move fails with the "a file is in the way" failure naming "Blocker.md", and nothing changes on disk.
> - Given the same setup, when the agent names the note by path instead, then the result is the same failure, as today.
> - Given the same setup, when the agent moves the active note instead, then the result is the same failure, and the blocking file is looked up in the vault that is focused.
> - Given either failure, when the agent reads its advice, then it suggests renaming or removing the blocking file or choosing another destination, and never creating the folder.
>
> **Story: description names the failure**
> - Given the list of tools, when an agent reads the move tool's short description, then it names the "a file is in the way" failure.
> - Given the move tool's help page, when an agent reads it, then the failure is still documented there, as today.
>
> **Story: other failures unchanged**
> - Given the destination folder does not exist and no file has its name, when the agent moves a note there, then the error still reports a missing destination folder.
> - Given a file already exists at the full destination path, when the agent moves a note there, then the error still reports that the destination file exists.
>
> ## Out of scope
> - Creating destination folders automatically.
> - Renaming or removing the blocking file.
> - Other tools' descriptions or the overall description length budget, beyond adding this failure to the move tool's description.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`

**Sent to the step:**

> /speckit-bug-assess slug=BI-0177
>
> ## Impact
> Spec 090's edge case "Destination folder name exists as a file" says a destination whose folder segment names an existing file is not a missing folder and must not carry the destination-folder-not-found signal. The tool classifies it as `FOLDER_NOT_FOUND` anyway, and the recovery hint (create the folder, then retry) cannot be followed, because a file already holds that name. An agent acting on the hint will either fail to create the folder or loop. Low frequency — it needs a destination path that runs through a file name — but it is a plain contract violation of the spec BI-0172 just shipped, and the misleading recovery advice is the harm the classification was meant to remove.
>
> ## Status and evidence
> *Planned* 2026-11-05 (Open Bugs triage after the 0.9.0 validation): still valid, narrowed to the two failures below — the `file`-locator variant (TC-00865 step 4) and the `move` description lacking `NOT_A_FOLDER` (TC-00867). Prompt redrafted for this scope; ratings unchanged. **Widened 2026-11-05 (repo-session assessment C1, owner-approved):** active mode very likely fails the same way, because it also forwards the folder form unexpanded; the unit test for it stubs an ENOENT line it probably never receives live (inferred from the code, not observed). **Live check done 2026-11-05** ([[TC-00900 - Move Active Note To Folder Form Through A File Returns NOT_A_FOLDER|TC-00900]], fail as expected): active mode returns the same raw `Error: Destination file already exists!` with no `details.code`. Its argv resolves the source to `path=…` but forwards `to=Fixtures/BI-0177/v01/Blocker.md/` unexpanded, with no `vault=`; nothing changed on disk. **Owner ruling 2026-11-05:** drop "(change it with `obsidian_exec`)" from the `move` description so the `NOT_A_FOLDER` sentence fits the 400-character cap (397 characters, no audit exception); the help page keeps that routing.
>
>
> **Back to planned — 2026-11-04 (0.9.0-local validation).** Black-box validation on the post-#145 0.9.0-local build, run on TestVault, failed one of this item's own acceptance points. A `move` that names the source by `file` (not `path`), with a destination folder segment that is an existing file, returns the raw untyped `Destination file already exists!` (`CLI_REPORTED_ERROR`, no `details.code`) instead of `NOT_A_FOLDER`. The same move by `path` is correct. Failing TC: [[TC-00865 - Move Destination Through A File Variants Return NOT_A_FOLDER Naming The Blocking File|TC-00865]] (step 4). Also failing: [[TC-00867 - Move Description And Help Document The NOT_A_FOLDER Failure|TC-00867]], because the `move` tool description does not name `NOT_A_FOLDER`; the help page does. The owner ruled on 2026-11-05 that this item's clarification wins over [[BI-0027 - Audit Tool Descriptions|BI-0027]]'s description budget: the `move` description must name `NOT_A_FOLDER` (confirmed absent on the live MCP Inspector `tools/list`), and that is part of this item's fix. Passing: TC-00701 (Expected refreshed), TC-00695, TC-00707, TC-00866. Unit-only (not reachable black-box): blocker-lookup failure, POSIX `ENOTDIR`.
>
> **Shipped — 2026-11-04.** Merged to main via [marwansaab/obsidian-cli-mcp#139](https://github.com/marwansaab/obsidian-cli-mcp/pull/139) on 2026-11-04 at 02:40 UTC. Status recorded 2026-11-04 at the owner's direction. `npm_version_shipped` is not set yet: the release this merge goes out in has not been confirmed.
>
> **Live checks still open (gaps accepted by the owner, 2026-11-04).** (1) The POSIX `ENOTDIR` line for a rename through a file, still inferred (only the Windows line was captured live). (2) [[TC-00701 - Move Destination Folder Segment Naming A File Is Not FOLDER_NOT_FOUND|TC-00701]] re-run on the next published local release.
>
> **In review — 2026-11-04.** The fix is a reviewed, documented pull request: [marwansaab/obsidian-cli-mcp#139](https://github.com/marwansaab/obsidian-cli-mcp/pull/139), fix branch `fix/bi-0177`, bug folder `.specify/bugs/bi-0177` in the repo (assessment, fix and test reports). Covers `move`. Awaiting owner merge.
>
> *Planned.* Filed 2026-11-02 from the 0.9.0-local test run of the 24 in-review BIs. Follow-up to [[BI-0172 - Classify Move Missing Destination Folder Error]] (spec `090-classify-missing-destination`), which stays in review. Evidence: [[TC-00701 - Move Destination Folder Segment Naming A File Is Not FOLDER_NOT_FOUND]] (fail on `@marwansaab/obsidian-cli-mcp@0.9.0-local`). In `TestVault-Obsidian-CLI-MCP`, `move` with `path: "Fixtures/BI-0172/c07/MoveMe.md"` and `to: "Fixtures/BI-0172/c07/Blocker.md/"`, where `Blocker.md` is an existing note, returned `CLI_REPORTED_ERROR` with `details.code: "FOLDER_NOT_FOUND"`, `details.folder: "Fixtures/BI-0172/c07/Blocker.md"` and a message saying that folder "does not exist in the vault" and advising the caller to create it and retry. No absolute path leaked and nothing changed on disk, so the other BI-0172 rules held.
>
> ## Expected behaviour
> Redrafted 2026-11-05 with the `speckit-specify-skill` for the remaining scope only: the blocked-destination failure shipped in PR #139 for moves by path, but a move that names its source by note name still gets the raw "already exists" text (TC-00865 step 4), and the tool description does not name the failure (TC-00867). The previous draft is in the vault's git history.
>
> /speckit-specify Report blocked destinations
>
> ## Feature
> Whenever a move is blocked because a file sits where the destination folder should be, the agent gets the same clear "a file is in the way" failure, however it named the note to move, and the move tool's short description tells agents this failure exists.
>
> ## Why
> A move that names its note by path already reports a file in the way. The same move naming the note by its name instead returns raw text saying the destination file already exists, which points the agent at the wrong file. Agents also cannot learn of the failure from the tool's description, so they do not plan for it.
>
> ## User stories
> - As an agent, I want a move blocked by a file in the destination's folder position to give the same failure whether I named the note by path, by name or moved the active note, so that one recovery step works for all three.
> - As an agent, I want the move tool's description to name this failure, so that I know to expect it before I call the tool.
> - As an agent, I want a genuinely missing destination folder and an existing destination file to keep their current failures, so that their recovery advice still applies.
>
> ## Acceptance criteria
> **Story: same failure however the note is chosen**
> - Given a note "Blocker.md" exists, when the agent moves another note, named by its note name, to "Blocker.md/" in the same folder, then the move fails with the "a file is in the way" failure naming "Blocker.md", and nothing changes on disk.
> - Given the same setup, when the agent names the note by path instead, then the result is the same failure, as today.
> - Given the same setup, when the agent moves the active note instead, then the result is the same failure, and the blocking file is looked up in the vault that is focused.
> - Given either failure, when the agent reads its advice, then it suggests renaming or removing the blocking file or choosing another destination, and never creating the folder.
>
> **Story: description names the failure**
> - Given the list of tools, when an agent reads the move tool's short description, then it names the "a file is in the way" failure.
> - Given the move tool's help page, when an agent reads it, then the failure is still documented there, as today.
>
> **Story: other failures unchanged**
> - Given the destination folder does not exist and no file has its name, when the agent moves a note there, then the error still reports a missing destination folder.
> - Given a file already exists at the full destination path, when the agent moves a note there, then the error still reports that the destination file exists.
>
> ## Out of scope
> - Creating destination folders automatically.
> - Renaming or removing the blocking file.
> - Other tools' descriptions or the overall description length budget, beyond adding this failure to the move tool's description.

## 3. assess / bug-assess (2026-11-07T03:31:54.516Z)

**Question (verbatim):**

> `.specify/bugs/bi-0177/assessment.md` already exists. It is the record of the first BI-0177 round, shipped in PR #139 (with fix.md, test.md, relay-digest.md and relay-qa-log.md beside it). This second round (the `file`-locator and active-mode variants returning raw `Destination file already exists!`, plus the `move` description naming `NOT_A_FOLDER`) needs its own assessment, and `/speckit-bug-fix` and `/speckit-bug-test` will then write fix.md and test.md in the same folder. Where should the new records go?
>
> | Option | Description |
> |---|---|
> | A | New folder `.specify/bugs/bi-0177-2/` (slug `bi-0177-2`). The PR #139 records stay untouched; the new assessment links back to them. |
> | B | Overwrite the files in `.specify/bugs/bi-0177/` (slug `bi-0177`). One folder per BI; the first round's records survive only in git history (commit 57ca042 and its neighbours). |
>
> **Recommended: A.** The skill's own rule for an existing assessment in unattended runs is to pick a new unique slug rather than overwrite, and the shipped round's assessment, fix and test reports are still cited from the backlog item ("bug folder `.specify/bugs/bi-0177` … assessment, fix and test reports"), so rewriting them would make those citations describe a different change.

**Advisor** (escalate: none):

> A
>
> Why: BI-0177's Status section cites `.specify/bugs/bi-0177` as the assessment, fix and test record for PR #139. Overwriting it would make that shipped citation describe a different change.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`: Appended a 2026-11-07 comment recording that the second round's records go in .specify/bugs/bi-0177-2 (slug bi-0177-2), with .specify/bugs/bi-0177 left untouched as the PR #139 record.

**Sent to the step:**

> A
>
> Why: BI-0177's Status section cites `.specify/bugs/bi-0177` as the assessment, fix and test record for PR #139. Overwriting it would make that shipped citation describe a different change.

## 4. assess / bug-assess (2026-11-07T03:35:18.912Z)

**Question (verbatim):**

> Q1 — the spec 070 assertion that `MOVE_DESCRIPTION` names `obsidian_exec`.
>
> **Context.** `src/tools/_file-type-support.test.ts:78-83` asserts that both `RENAME_DESCRIPTION` and `MOVE_DESCRIPTION` contain `"keeps its type"` and `"obsidian_exec"`. Your 2026-11-05 ruling drops "(change it with `obsidian_exec`)" from the `move` description so the `NOT_A_FOLDER` sentence fits the 400-character cap (397 characters with `A destination through an existing file fails with \`NOT_A_FOLDER\`.`). That removes the only `obsidian_exec` in `MOVE_DESCRIPTION`, so the assertion fails as written. `.memory/refactor-decisions.md` (spec 092 recorded approval) says such assertions are kept by wording the descriptions, not by editing tests, unless an edit is approved; its X-P rule moves an assertion's subject to `docs/tools/<tool>.md` with the same phrase and matcher. `docs/tools/move.md` already carries the `obsidian_exec` routing (lines 7 and 21).
>
> | Option | Description |
> |---|---|
> | A | X-P-style retarget: for `move`, assert `obsidian_exec` on `docs/tools/move.md` instead of the description. `keeps its type` stays asserted on `MOVE_DESCRIPTION`; the `rename` half of the test is unchanged. |
> | B | Keep `obsidian_exec` in the description by shortening other wording to stay within 400 characters. No test edit, but it departs from your ruling's exact edit. |
> | C | Delete the `move` half of the `obsidian_exec` assertion; nothing asserts the routing for `move`. |
>
> **Recommended: A.** It follows your ruling exactly (the help page keeps the routing, so that is where the test checks it), uses the already-approved X-P pattern rather than inventing a new kind of test edit, and keeps the spec 070 guarantee that an agent can find the `obsidian_exec` route for `move`. B re-opens a wording you settled, and C loses the coverage.

**Advisor** (escalate: decision: This edits an existing test, which the repo's refactor-decisions rule reserves for the owner's approval. The earlier test-edit approvals on this job covered other tests only.):

> A (recommended, pending the owner's sign-off). In `src/tools/_file-type-support.test.ts:78-83`, retarget only the `move` half of the `obsidian_exec` assertion to `docs/tools/move.md`, with the same phrase and matcher (the X-P pattern). Keep `keeps its type` asserted on `MOVE_DESCRIPTION`. Leave the `rename` half unchanged. Record the edit in the round's `fix.md` as owner-approved. Do not edit until the owner rules.
>
> Why: the owner ruling of 2026-11-05 on BI-0177 drops "(change it with `obsidian_exec`)" from the `move` description and says that "the help page keeps that routing". A test asserting the routing on the help page therefore follows that ruling as written. Option B reopens the settled wording, and option C loses the spec 070 coverage.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`

**Advisor, after the owner ruled** (escalate: none):

> 1. A. In `src/tools/_file-type-support.test.ts:78-83`, retarget only the `move` half of the `obsidian_exec` assertion to `docs/tools/move.md`, with the same phrase and matcher (X-P pattern). Keep `keeps its type` asserted on `MOVE_DESCRIPTION`, and leave the `rename` half unchanged. Record the edit in `fix.md` as owner-approved.
>
> Why: owner ruling of 2026-11-07 on this job. It applies the 2026-11-05 ruling that the help page keeps the `obsidian_exec` routing.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`: Appended a 2026-11-07 comment recording the owner ruling: retarget the move half of the obsidian_exec assertion in _file-type-support.test.ts:78-83 to docs/tools/move.md (X-P), with the rest unchanged.

**Owner:** choice 1 (A: retarget to docs/tools/move.md), via cli, 2026-11-07T03:44:55.726Z.

**Sent to the step:**

> 1. A. In `src/tools/_file-type-support.test.ts:78-83`, retarget only the `move` half of the `obsidian_exec` assertion to `docs/tools/move.md`, with the same phrase and matcher (X-P pattern). Keep `keeps its type` asserted on `MOVE_DESCRIPTION`, and leave the `rename` half unchanged. Record the edit in `fix.md` as owner-approved.
>
> Why: owner ruling of 2026-11-07 on this job. It applies the 2026-11-05 ruling that the help page keeps the `obsidian_exec` routing.

## 5. assess / resolve-assessment (2026-11-07T03:46:02.279Z)

**Question (verbatim):**

> Reproduction gap — the CLI's reply when the blocking file sits further up the path, given the trailing-`/` destination as sent (for example `file=MoveMe to=…/Blocker.md/Sub/`).
>
> **Context.** Earlier probes captured two CLI replies. The trailing-`/` destination naming the file itself gives `Error: Destination file already exists!` (spec 090 probe P5; TC-00865 step 4 and TC-00900 for `file` and the active note). The trailing-`/` destination into a missing folder gives the ENOENT rename error (spec 090 probe P1). The reply for a blocking file further up the path, with a `file` or active-note move, has never been captured: it is one of those two. The proposed fix sends both replies to the existing file-in-the-way lookup (`findBlockingFile`, `src/tools/move/handler.ts:85`), so the move reports `NOT_A_FOLDER` either way. The answer decides only which unit test uses a captured reply and which is marked inferred.
>
> | Option | Description |
> |---|---|
> | A | `/speckit-bug-fix` captures it in its live CLI probe, through the production `Obsidian.com` shim under `.memory/test-execution-instructions.md`, sending exactly what `executeMove` forwards for a `file` locator, and records the reply verbatim in `fix.md`. Test rows cover both replies; the row whose reply was not seen is marked inferred. |
> | B | No probe: cover both replies with unit rows, both marked inferred, and list the gap as a residual in `fix.md`. |
> | C | Leave the case for a blocking file further up the path out of this fix's tests: only the case where the last segment is the file (the reported TC-00865/TC-00900 shape) is tested. |
>
> **Recommended: A.** It is one extra argv in the live probe the fix already runs to capture the `file`-locator reply. It turns an inference into a recorded reply, the same way round one closed its ENOENT gap. The fix code is the same under every option, so A costs nothing in scope, and C would leave a reachable path untested (Principle II).

**Advisor** (escalate: none):

> A
>
> Why: this applies BI-0177's 2026-11-04 clarification (a fix-time live probe through `Obsidian.com`, reply recorded verbatim, unseen variants marked inferred) and the Best Practices rule to drive `Obsidian.com` for CLI probes. Option C would leave a reachable path untested, against Constitution Principle II.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`, `210-Guidelines/Best Practices.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`: Appended a 2026-11-07 comment recording the answer: capture the deeper-blocker CLI reply in the fix's live probe through Obsidian.com, record it verbatim, cover both replies in unit rows and mark the unseen one inferred.

**Sent to the step:**

> A
>
> Why: this applies BI-0177's 2026-11-04 clarification (a fix-time live probe through `Obsidian.com`, reply recorded verbatim, unseen variants marked inferred) and the Best Practices rule to drive `Obsidian.com` for CLI probes. Option C would leave a reachable path untested, against Constitution Principle II.
