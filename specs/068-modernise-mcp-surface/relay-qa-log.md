# Relay Q&A log: speckit

Run `obsidian-cli-mcp-bi-0165-2026-10-28`, started 2026-10-27T13:20:28.098Z.

## 1. pre-implementation / preflight (2026-10-27T13:20:28.145Z)

**Question (verbatim):**

> Preflight for this Relay run of job BI-0165. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0165 in the vault.
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

**Advisor** (escalate: conflict: BI-0165's specify prompt starts with `/speckit.specify` (the dot form), not `/speckit-specify`. The owner should change that line in the note to `/speckit-specify Modernise MCP surface`.):

> Readiness summary for BI-0165. One check failed.
>
> - Vault: `My-Setup-Vault`, `vault_id` = `my-setup`. Matches `expected_vault_id`. PASS. Session-start reads done: MCP Tool Notes index plus the obsidian-cli-mcp per-MCP notes, Best Practices, Decision Log, Session Handover, About This Vault.
> - Note: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`. Title: "BI-0165 — Ship 0.9.0 SDK V2 And Safety Release". Found. PASS.
> - Initiative: `[[Obsidian CLI MCP]]`. PASS.
> - Status: `queued` (not finished or abandoned). PASS.
> - Specify-prompt section: the `## /speckit-specify prompt` heading is there. **FAIL on the command.** The prompt's command line is `/speckit.specify Modernise MCP surface`, the older dot form, not `/speckit-specify`. The Part 1 banner and the section's intro text also say `/speckit.specify`. The note was not changed.
> - Clarify skill: `anthropic-skills:speckit-clarify-skill` loaded with "BI-0165 - Ship 0.9.0 SDK V2 And Safety Release". Its pre-flight reads are done: the BI, the Constitution v1.5.1, the Architecture, ADR-036 (marked pending supersession, with the dual-era direction already decided) and ADR-005. Answering rules are active for the questions that follow.
>
> Fix needed before the run: in the BI-0165 note, change the first line of Part 1 from `/speckit.specify Modernise MCP surface` to `/speckit-specify Modernise MCP surface`. Optionally do the same in the Part 1 banner and the intro text. The title "Modernise MCP surface" (three words, starting with a verb) can stay.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-036 - Modern-Only Protocol Era For Obsidian CLI MCP.md`, `200-Decisions/ADR-005 - Token-Optimized Tool Definitions via Progressive Disclosure.md`, `210-Guidelines/Best Practices.md`

**Advisor, after the owner ruled** (escalate: none):

> Preflight for BI-0165 passed on the re-check. All six checks pass.
>
> Primed for BI-0165 — Ship 0.9.0 SDK V2 And Safety Release.
>
> - **Vault identity:** `My-Setup-Vault` returns `vault_id` = `my-setup`, which matches `expected_vault_id`. PASS. The session-start reads were done earlier in this conversation: the MCP Tool Notes index and the obsidian-cli-mcp notes, Best Practices, Decision Log, Session Handover and About This Vault.
> - **Note:** `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`, titled "BI-0165 — Ship 0.9.0 SDK V2 And Safety Release". PASS.
> - **Initiative:** `[[Obsidian CLI MCP]]`. PASS.
> - **Status:** `queued`, so the work is not finished or abandoned. PASS.
> - **Specify-prompt section:** the "/speckit-specify prompt" section is there. Its command now reads `/speckit-specify Modernise MCP surface`, the dash form. The Part 1 banner, the Part 2 banner and the intro now use `/speckit-specify` too. PASS. I did not change the note.
> - **Clarify skill:** `anthropic-skills:speckit-clarify-skill` is loaded for "BI-0165 - Ship 0.9.0 SDK V2 And Safety Release". As the skill requires, I read:
>   - the BI
>   - the Constitution, v1.5.1
>   - the Architecture note
>   - ADR-036, which is pending supersession by a dual-era ADR the owner has already decided on
>   - ADR-005
>
>   Its answering rules apply to every question that follows. Two open owner decisions are flagged in the BI: B3 and C1. A2 is open too, covering the constitution amendment wording.
>
> Awaiting clarification questions.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-036 - Modern-Only Protocol Era For Obsidian CLI MCP.md`, `200-Decisions/ADR-005 - Token-Optimized Tool Definitions via Progressive Disclosure.md`

**Owner:** choice 1 (Fixed: check again), via cli, 2026-10-27T13:49:11.762Z.

**Sent to the step:**

> Preflight for BI-0165 passed on the re-check. All six checks pass.
>
> Primed for BI-0165 — Ship 0.9.0 SDK V2 And Safety Release.
>
> - **Vault identity:** `My-Setup-Vault` returns `vault_id` = `my-setup`, which matches `expected_vault_id`. PASS. The session-start reads were done earlier in this conversation: the MCP Tool Notes index and the obsidian-cli-mcp notes, Best Practices, Decision Log, Session Handover and About This Vault.
> - **Note:** `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`, titled "BI-0165 — Ship 0.9.0 SDK V2 And Safety Release". PASS.
> - **Initiative:** `[[Obsidian CLI MCP]]`. PASS.
> - **Status:** `queued`, so the work is not finished or abandoned. PASS.
> - **Specify-prompt section:** the "/speckit-specify prompt" section is there. Its command now reads `/speckit-specify Modernise MCP surface`, the dash form. The Part 1 banner, the Part 2 banner and the intro now use `/speckit-specify` too. PASS. I did not change the note.
> - **Clarify skill:** `anthropic-skills:speckit-clarify-skill` is loaded for "BI-0165 - Ship 0.9.0 SDK V2 And Safety Release". As the skill requires, I read:
>   - the BI
>   - the Constitution, v1.5.1
>   - the Architecture note
>   - ADR-036, which is pending supersession by a dual-era ADR the owner has already decided on
>   - ADR-005
>
>   Its answering rules apply to every question that follows. Two open owner decisions are flagged in the BI: B3 and C1. A2 is open too, covering the constitution amendment wording.
>
> Awaiting clarification questions.

## 2. pre-implementation / specify (2026-10-27T13:49:32.574Z)

**Question (verbatim):**

> Return the full content of the "/speckit-specify prompt" section of job BI-0165's note, verbatim and complete, in `answer`, without the surrounding code fence. Do not edit or summarise it. If the note has no such section, set escalate to ungrounded.

**Advisor** (escalate: none):

> =====================================================================
> PART 1 — /speckit-specify INPUT (paste from the next line to the end of Part 1)
> =====================================================================
>
> /speckit-specify Modernise MCP surface
>
> ## Feature
> The Obsidian CLI MCP server is brought up to date with how current MCP clients and models work. It serves both the current and the previous MCP protocol revision, tells clients truthfully which tools only read, gives the model enough guidance to call each tool correctly first time, returns results in a declared shape, and lets the vault owner restrict what it can do. It blocks arbitrary code execution by default, no longer leaves Obsidian's view of a note stale after a write, and refuses writes that would escape the vault.
>
> ## Why
> MCP clients have moved two protocol revisions ahead and now act on tool information this server does not publish. As a result, every tool looks destructive, reads cannot run in parallel, users face extra permission prompts, and the model starts each session with nothing but bare tool names. At the same time, one tool lets anything that reaches the model run code inside the user's Obsidian, a write can silently leave Obsidian's metadata for a note out of date, and a write into a new folder under a linked folder can land outside the vault.
>
> ## User stories
> - As an AI agent, I want a property I just wrote to be visible to my next search, so that follow-up steps act on current data.
> - As a user of a current-generation MCP client, I want the server to connect and list its tools, so that I can use it without downgrading my client.
> - As a user of an older MCP client, I want the server to keep working after the upgrade, so that my existing setup does not break.
> - As a user, I want to cancel a slow call, so that the server is free for my next request.
> - As a user, I want progress updates during long waits, so that I know a slow call is still alive.
> - As a Windows user, I want Windows-specific behaviour checked on every change, so that releases do not regress on my platform.
> - As a vault owner, I want any write that would land outside my vault through a linked folder to be refused, so that files elsewhere on my machine stay safe.
> - As a user of an MCP client, I want every tool to show a readable name and to declare whether it only reads, changes, or can destroy data, so that my client runs reads without prompts and in parallel and warns me before destructive actions.
> - As an AI model, I want the server to tell me at the start of a session what it is for and which tool suits which task, so that I choose the right tool first time.
> - As a vault owner, I want to run the server read-only, or limit it to the tools I name, so that I can give an assistant only the access I am comfortable with.
> - As a vault owner, I want to be asked to confirm before a permanent delete or a vault-wide replace is carried out, so that irreversible changes never happen without me.
> - As an AI agent, I want to list the vaults I can use, and to use a vault opened after the server started, so that I can target the right vault without restarting anything.
> - As an AI agent, I want structured results to come in a declared shape, so that I can rely on their fields without parsing prose.
> - As an AI model, I want every tool parameter described, including which combinations are valid, so that my calls pass validation first time.
> - As a vault owner, I want arbitrary code execution through the general-purpose passthrough tool blocked unless I deliberately allow it, so that a malicious note cannot run code on my machine.
> - As a maintainer, I want any change to the published tool definitions to fail the build until it is reviewed, so that the tool surface only changes on purpose.
>
> ## Acceptance criteria
>
> **Story: a written property is visible to the next search**
> - Given a note in a test vault, when an agent writes a new frontmatter property and immediately searches the vault by that property, then the search returns the note.
> - Given several open vaults, when an agent writes to a vault that is not the focused one, then that vault's metadata is refreshed, not the focused vault's.
> - Given an append, a heading edit, or a committed find-and-replace, when the agent searches straight afterwards, then the search reflects the change.
> - Given a write that asks to open the note afterwards, when it completes, then the correct note opens in the correct vault.
> - Given the metadata refresh fails, when the write completes, then the write still succeeds and the failure is reported in the server's diagnostic log rather than silently dropped.
>
> **Story: current-generation client connects**
> - Given a client using the current protocol revision, when it discovers the server, then it receives the full tool list and can call tools.
> - Given such a client, when it reads and writes a note in a test vault, then both calls succeed.
>
> **Story: older client keeps working**
> - Given a client using the previous protocol revision's start-up handshake, when it connects, then it receives the full tool list and can call tools.
> - Given either client generation, when a tool call fails, then the client receives the same structured error information as before the upgrade.
>
> **Story: cancel a slow call**
> - Given a call waiting behind another call, when the client cancels it, then it never starts and the next waiting call proceeds.
> - Given a call already running, when the client cancels it, then its work is stopped, the call ends, and the next waiting call proceeds.
> - Given calls are processed one at a time today, when this feature ships, then they are still processed one at a time.
>
> **Story: progress during long waits**
> - Given a client that asks for progress, when the server is waiting for Obsidian to start, then the client receives progress updates until Obsidian is ready or the wait times out.
> - Given a client that asks for progress, when a find-and-replace commit runs across many notes, then the client receives progress as each note is processed.
> - Given a client that does not ask for progress, when any call runs, then no progress updates are sent.
>
> **Story: Windows checked on every change**
> - Given any proposed change, when the automated checks run, then they run on Windows as well as Linux, and a Windows failure blocks the change.
>
> **Story: writes cannot escape the vault**
> - Given a linked folder inside the vault that points outside it, when a write targets a not-yet-existing subfolder under that link, then the write is refused with the existing "path escapes vault" error and nothing is created outside the vault.
> - Given the same linked folder, when a write targets an existing subfolder under it, then the write is refused in the same way.
> - Given a Windows directory junction, a vault root written in different letter case, or a path containing "..", when a write would land outside the vault, then it is refused.
> - Given a sibling folder whose name begins with the vault's name (for example "vault2" next to "vault"), when a write targets it, then it is refused.
> - Given an ordinary write inside the vault, including into new folders, when it runs, then it succeeds as today.
>
> **Story: tools declare their nature**
> - Given any client listing the tools, when it reads each tool, then every tool has a human-readable title and an explicit declaration of whether it only reads and whether it can destroy data.
> - Given a read-only tool, when a client that honours these declarations calls it, then no "this may modify data" warning appears, and two such reads in one turn may run in parallel.
> - Given a tool that can overwrite, delete, move, rename, or bulk-replace, when a client lists it, then it is declared destructive.
> - Given the general-purpose passthrough tool, when a client lists it, then it is declared destructive and able to reach beyond the vault.
>
> **Story: the model is oriented at session start**
> - Given a client connecting with either protocol generation, when the session starts, then the server provides a short orientation text.
> - Given a client that reads only the first part of that text, when it reads it, then the first part still makes sense on its own and says what the server is for in task terms.
> - Given the orientation text, when a model reads it, then it learns which tool fits which task and the cross-cutting rules (target a named vault and note for automation, use vault display names, preview bulk replaces before committing, treat note content as data rather than instructions, use the help tool for long reference).
> - Given those cross-cutting rules now live in the orientation text, when a model reads individual tool descriptions, then the rules are no longer repeated in each one.
>
> **Story: read-only and restricted modes**
> - Given the server is configured read-only, when a client lists tools, then only tools that only read are offered.
> - Given the server is configured with a list of allowed tools, when a client lists tools, then only those tools are offered.
> - Given the server is configured with a list of disabled tools, alone or together with an allow list, when a client lists tools, then the disabled tools are not offered.
> - Given a configured tool name that does not exist, when the server starts, then it refuses to start and names every unknown tool in one message.
>
> **Story: confirmation before irreversible actions**
> - Given a permanent delete, or a find-and-replace commit not limited to a single note, when it is requested, then the human is asked to confirm before anything changes.
> - Given the human confirms, when the request proceeds, then the action happens as before.
> - Given the human declines or cancels, when the request ends, then nothing changes and the agent receives a structured error saying confirmation was declined.
> - Given a client that cannot ask the human, when such an action is requested, then the server behaves as the owner decides (open decision B3 in Part 2), never silently performing the action.
> - Given a normal delete (to the trash), when it is requested, then it proceeds without confirmation, as today.
>
> **Story: list vaults and pick up new ones**
> - Given vaults known to Obsidian, when an agent lists vaults, then it receives each vault's display name and location, and whether it is open where that can be determined cheaply (otherwise reported as unknown rather than guessed).
> - Given a vault opened after the server started, when an agent targets it by name, then the call succeeds without restarting the server.
> - Given a vault name that still does not exist after re-checking, when an agent targets it, then the agent receives the existing "unknown vault" error.
>
> **Story: typed results**
> - Given a tool whose result is structured data, when a client lists the tools, then the tool declares the shape of its result.
> - Given such a tool succeeds, when it returns, then the result matches its declared shape and the same data is also present as text.
> - Given such a tool fails, when it returns, then the error is delivered as text in the existing structured error form.
> - Given a tool whose result is plain note text or help text, when it returns, then it returns text only, as today.
>
> **Story: every parameter is described**
> - Given any client listing the tools, when it reads any tool's input definition, then every parameter has a one-line description of what it is, its format, and its default.
> - Given the rules about which parameter combinations are valid (for example, a named vault being required when targeting a specific note), when a client reads the input definition, then those rules are visible to it, either enforced in the definition or stated in the parameter descriptions (open decision C1 in Part 2).
> - Given a tool description, when a model reads it, then it is no longer told to call the help tool before every use; the help tool remains available for long reference and worked examples.
>
> **Story: code execution is blocked by default**
> - Given the default configuration, when the passthrough tool is asked to run arbitrary code, open developer tools, install/enable/disable plugins, or restart Obsidian, then the request is refused with a structured error naming the blocked command, and nothing is run.
> - Given the vault owner has explicitly allowed these commands, when the same request is made, then it runs as before.
> - Given the default configuration, when any dedicated (non-passthrough) tool runs, then it works exactly as before.
>
> **Story: tool-surface changes are deliberate**
> - Given the published tool definitions, when anyone changes them without updating the reviewed record, then the build fails.
> - Given the change is reviewed and the record updated in the same change, when the build runs, then it passes.
>
> ## Out of scope
> - Rewriting every tool description to a strict size budget (descriptions may shrink as a side effect of the orientation text and parameter descriptions).
> - Limiting output size or adding paging to note reads and searches.
> - Changing how the remaining argument-passed write tools send their content.
> - Merging, renaming, or consolidating tools; the tool list stays as it is apart from the new vault-listing tool.
> - Release automation, package metadata, and the changelog.
> - Listing the server in public registries, or packaging it as a client plugin.
> - New tools for daily notes, tasks, templates, or history.
> - Removing internal process identifiers from help documents, except where descriptions are rewritten anyway.
> - Guidance on prompt injection beyond the single line in the orientation text.
> - Trace propagation, result-type markers, caching hints, and server identity in per-result metadata (tracked separately).
>
> =====================================================================
> PART 2 — SESSION BRIEF FOR THE CLAUDE CODE SESSION (obsidian-cli-mcp repo)
> Not /speckit-specify input. Use it at /speckit-plan and implementation.
> =====================================================================
>
> 0. BEFORE YOU START
> - Load the `karpathy-guidelines` skill before planning or changing any code or config. The repo's own rules outrank it where they disagree: `CLAUDE.md` (spec-kit workflow, the test-execution gate in `.memory/test-execution-instructions.md`, PR lifecycle with `/speckit-docs-as-code`) and the constitution (`.specify/memory/constitution.md`).
> - Evidence for every item lives in the review research: `C:\Marwan-Saab-ADO\Research\Research\_Research\researches\obsidian-cli-mcp-review\` — start with `SUMMARY.md`, then `items\<file>.md` named per item below. Original handover: `handover\0.8.20-scope.md`.
> - Line references are to commit `0b02f8c`; re-check them.
> - Do not commit, push or publish unless the owner asks.
> - Note: `.memory/test-execution-instructions.md` still has the pre-2026-10-20 test-vault path. Current path: `C:\Marwan-Saab-ADO\My-Setup\My-Setup\TestVault-Obsidian-CLI-MCP`. Ask the owner before editing `.memory`.
>
> 1. RELEASE SHAPE
> - One release (0.9.0), not one spec. Part 1 describes the whole release. If the repo process wants one spec per PR, draft each per-PR spec from the Part 1 stories that PR covers (mapping in section 6), keeping the 3-word verb-led title rule.
> - Each PR: /speckit-implement → /speckit-git-commit → open PR → /code-review and fixes → /speckit-docs-as-code <n> → merge.
> - Bump the version to 0.9.0 at the end.
>
> 2. OWNER DECISIONS (2026-10-28) — already made, do not reopen
> - Protocol era: DUAL-ERA. Serve 2025-11-25 (initialize) and 2026-07-28 (server/discover) clients via SDK v2 `serveStdio`. This overturns vault ADR-036 ("Modern-Only Protocol Era For Obsidian CLI MCP"). Deliverable: a new ADR superseding ADR-036 (the vault ADR also gets an amendment stanza; the owner does that vault side).
> - Release label: 0.9.0, not 0.8.20.
> - Vault BIs BI-0151..BI-0155 are superseded by this work. BI-0156 (trace context), BI-0157 (result type), BI-0158 (caching hints), BI-0159 (server info in _meta) are NOT in scope; re-check them after SDK v2 lands (v2 may provide some for free).
> - Vault BI-0043 (a typed eval tool) is deliberately deferred because of C2.
>
> 3. OPEN DECISIONS — ask the owner when you reach them; do not guess
> - B3: behaviour when the client cannot do elicitation. Recommended: refuse with a structured error explaining how to confirm out of band. Alternative: set `_meta["anthropic/requiresUserInteraction"]: true` on those tools so Claude Code prompts every call.
> - C1: a zod discriminated union on `target_mode` (emits `oneOf`, valid JSON Schema 2020-12) now; or keep the flat schema and state the rules in parameter descriptions now, union later.
> - A2: constitution amendment wording (owner ratifies). Proposed: "the official MCP TypeScript SDK (v2 packages)" and "`McpServer.registerTool`".
>
> 4. ITEM DETAIL
>
> A. MUST CHANGE
>
> A1 — Fix the silent metadata-cache refresh after direct-to-disk writes. Research: change-cache-invalidation-bug.md
> - Now: after `write_note`, `append_note`, `patch_heading`, `patch_block` write to disk, `invalidateMetadataCache` in `src/tools/_note-io.ts` runs `obsidian eval` asking Obsidian to recompute metadata. Defect 1: it passes the absolute OS path to `app.vault.getFileByPath`, which takes a vault-relative path; the lookup returns null and the `if (f)` guard skips the refresh (`_note-io.ts:50`). Defect 2: it runs with `target_mode: "active"` and no `vault`, so multi-vault it hits the focused vault (`_note-io.ts:66`). `find_and_replace` commits use the same `writeAtomic` but never call the refresh (`find_and_replace/handler.ts:650`) — include it. The function swallows every failure; handler tests only assert argv shape, so the suite is green. The same absolute path reaches `app.workspace.openLinkText` for `write_note` `open: true` (template `write_note/handler.ts:43`, call line 160).
> - Not yet confirmed live. First task: a live probe under the test-execution gate showing a property written with `write_note` is not visible to `find_by_property` straight away, and is once fixed.
> - Outcome: refresh uses the vault-relative, forward-slash path, with `vault=` on the eval for the written vault; `open: true` opens the right note in the right vault; failures stay best-effort but are logged to stderr.
> - Accept: unit tests assert the template receives a vault-relative path and the eval carries `vault=<written vault>`; one live probe (authorised test vault only) writes a frontmatter property and reads it back via `find_by_property` in the next call; the same probe passes for `append_note`, `patch_heading` and a `find_and_replace` commit.
>
> A2 — Move to SDK v2, McpServer and dual-era stdio. Research: change-sdk-v2.md
> - Now: `src/server.ts:91` builds the SDK's deprecated low-level `Server` (with an eslint-disable) and hand-writes `tools/list` / `tools/call`; dependency `@modelcontextprotocol/sdk` ^1.29.0; `src/index.ts` uses `server.connect(new StdioServerTransport())`, which serves only 2025-era clients even on v2.
> - Outcome: TypeScript SDK v2 — `@modelcontextprotocol/server`, stdio from `@modelcontextprotocol/server/stdio`; every tool registered with `registerTool` on `McpServer`; served with `serveStdio(() => createServer())` so 2025-11-25 (initialize) and 2026-07-28 (server/discover) clients both work. `src/cli-adapter/`, `src/queue.ts`, `src/app-launcher/` unchanged. Error contract (`isError: true` with `{code, message, details}`) unchanged, except an unknown tool may become a protocol error (-32602), v2's default.
> - Carries A3, B1, B2, B3, C1 — do it first, or land the scaffolding first.
> - Facts: codemod `npx @modelcontextprotocol/codemod@latest v1-to-v2 .`; v2 needs zod ^4.2 (repo ^4.4.3) and Node 20+ (floor 22.11). Migration guide https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2 ; stdio https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio.html . Do NOT adopt Roots, Sampling or the Logging capability (deprecated in 2026-07-28); keep logging to stderr.
> - Governance: constitution amendment (Technical Standards ~lines 420–422 say `@modelcontextprotocol/sdk` is "the sole MCP transport" and registration "MUST go through the SDK's `Server` API"); a new ADR superseding the low-level-`Server` decision in `server.ts`'s BI-067 comment (may be combined with the ADR superseding ADR-036 if the owner prefers); a dependency justification in the PR description.
> - Accept: `tsc --noEmit`, eslint (zero warnings), `vitest run` and the coverage floor pass; no `eslint-disable @typescript-eslint/no-deprecated` remains for the SDK; a stdio probe with the 2025-11-25 initialize handshake lists all tools; a stdio probe with server/discover (2026-07-28) lists all tools; Claude Code connects and calls `read` and `write_note` against the test vault.
>
> A3 — Support cancellation and progress. Research: change-cancel-progress.md
> - Now: every CLI call waits in one FIFO single-flight queue (`src/queue.ts`); `notifications/cancelled` is ignored; no progress is sent, including the auto-launch wait of up to 30 s (`_dispatch.ts:19`) and long `find_and_replace` commits. `invoke-bounded-cli.ts:53` silently clamps `timeoutMs` to 120,000, which the schema already enforces — dead code.
> - Outcome: a cancelled request is dropped from the queue if not started; a running CLI child is killed (SIGTERM, then SIGKILL after the existing grace period); the call ends without blocking the queue. With a client `progressToken`, emit progress during the auto-launch readiness loop and per note during `find_and_replace` commits. Keep the single-flight queue.
> - Accept: unit tests for cancel-while-queued (never spawns), cancel-while-running (child killed, next task runs), progress notifications carrying the client's token; the dead clamp removed or justified.
>
> A4 — Add a Windows CI runner. Research: change-windows-ci.md
> - Now: `.github/workflows/ci.yml:16` runs only `ubuntu-latest` (Node 22 and 24). Windows-specific logic: the `Obsidian.com` shim, `cmd /c start` for auto-launch, `realpath` and drive-letter case, CRLF handling. The suite passes on Windows 11 locally.
> - Outcome: matrix includes `windows-latest` with at least Node 22; `fail-fast: false` stays.
> - Accept: CI green on both OSes.
>
> A5 — Close the vault-escape gap for new folders under a symlink. Research: change-symlink-gap.md
> - Now: `src/path-safety/canonical.ts:47` — when `realpath(parentDir)` fails with ENOENT, the check falls back to the lexical parent. A vault with `Linked/` → outside the vault; a write to `Linked/New/Note.md` with `New` not yet existing passes the lexical check, then `mkdir -p` (`write_note/handler.ts:108`) creates `New` outside the vault. Bug class of CVE-2025-53109.
> - Outcome: walk up to the nearest existing ancestor, `realpath` it, re-append the missing segments, compare against canonical root + path separator. An escaping write returns `PATH_ESCAPES_VAULT` and logs the existing `pathEscapeAttempt` event.
> - Accept: tests for a symlinked folder with an existing and a not-yet-existing child; a Windows junction; a mixed-case vault root on Windows; `..` segments; the prefix-collision case (`/vault` vs `/vault2`).
>
> B. MUST ADD
>
> B1 — Annotations and a title on every tool. Research: add-annotations-title.md
> - Now: descriptors have only `name`, `description`, `inputSchema`. Spec defaults (readOnlyHint false, destructiveHint true, idempotentHint false, openWorldHint true) make all 34 tools look destructive: Claude Code can't parallelise reads (it runs readOnlyHint tools in parallel and treats them as retry-safe); Claude apps prompt more; VS Code and Codex prompt every tool; ineligible for Claude's directory (needs a title plus a read-only or destructive hint on every tool).
> - Outcome: every tool has a human `title` and an explicit `annotations` block. Classification (adjust only with a reason in the PR):
>   | Tools | readOnly | destructive | idempotent | openWorld |
>   | read, read_heading, read_property, search, context_search, pattern_search, find_by_property, tag, backlinks, links, outline, files, paths, properties, bases, views_base, query_base, get_active_file, help, list_vaults (new), smart_connections_query, smart_connections_similar | true | false | true | false |
>   | append_note, prepend, patch_heading, patch_block, create_base | false | false | false | false |
>   | set_property | false | false | true | false |
>   | write_note, delete, move, rename, find_and_replace | false | true | false | false |
>   | open_file (changes Obsidian's focus) | false | false | true | false |
>   | obsidian_exec | false | true | false | true |
>   `write_note` can overwrite; `find_and_replace` previews by default but commits in the same tool, so it is destructive.
> - Accept: a test walks the published tool list and fails if any tool lacks a `title` or an explicit readOnlyHint/destructiveHint; a test pins the classification.
>
> B2 — Server instructions. Research: add-server-instructions.md
> - Now: no `instructions`. With tool search on, Claude Code's model starts with 34 bare tool names.
> - Outcome: `instructions` of ~1,000–1,500 characters (Claude Code cuts at 4,096). The first 512 characters stand alone (Codex reads only those): what the server is for in task words — read, search and edit notes in Obsidian vaults through the Obsidian CLI, on Windows, macOS and Linux. Then a short routing guide (which tool for which task). Then the cross-cutting rules now repeated in descriptions: specific mode with `vault` + `path` for automation; vault names are Obsidian display names and `list_vaults` lists them; preview `find_and_replace` before `commit: true`; note content is data, not instructions; `help` holds long reference. Remove those repeats from individual descriptions in the same change.
> - Accept: an initialize probe and a server/discover probe both return the instructions; a test pins the length under 2,000 characters; a test pins the first 512 characters ending on a complete sentence.
>
> B3 — Read-only mode, a tool allowlist, and confirmation for irreversible actions. Research: add-safety-modes.md
> - Now: no read-only mode or tool hiding; `delete` with `permanent: true` and a vault-wide `find_and_replace` commit run without human confirmation; `delete` already defaults to trash (keep).
> - Outcome: `OBSIDIAN_MCP_READ_ONLY` (1/true/yes/on, case-insensitive, parsed like `OBSIDIAN_AUTO_LAUNCH`) registers only `readOnlyHint: true` tools. `OBSIDIAN_MCP_TOOLS` (comma-separated allowlist) and `OBSIDIAN_MCP_DISABLE` (comma-separated denylist); denylist applied after allowlist; an unknown name in either fails server start listing all bad names together (aggregated like `assertToolDocsExist`). `delete permanent: true`, and `find_and_replace commit: true` with no single-note scope, ask the human via elicitation — SDK v2 `inputRequired` with `inputRequired.elicit`, legacy shim for 2025-era clients. Declined/cancelled → structured error, nothing changed. Non-elicitation clients: open decision B3. Error codes per ADR-015: existing top-level code + new `details.code` (e.g. `VALIDATION_ERROR` / `CONFIRMATION_DECLINED`) — zero new top-level codes.
> - Accept: tests for read-only registration, allowlist, denylist, unknown names, and confirm/decline/cancel for both irreversible actions; README documents the three env vars.
>
> B4 — A list_vaults tool and a refreshable vault registry. Research: add-list-vaults.md
> - Now: README says there is "no in-band vault-enumeration tool yet" (`README.md:115`). `src/vault-registry/registry.ts` runs `obsidian vaults verbose` and caches name → path but never refreshes; an unknown name fails with "restart the MCP server" (`registry.ts:73`). A stub `docs/tools/list_vaults.md` already exists for an unregistered tool and `help` advertises it.
> - Outcome: read-only `list_vaults` returns `{ count, vaults: [{ name, path, open }] }` (`open: null` if it can't be determined cheaply — don't guess). On an unknown vault name the registry re-probes once before failing. The tool gets a real doc in `docs/tools/` (boot fails without one) replacing the stub.
> - Accept: tests for listing, a cache refresh on a miss, and a still-unknown name after refresh; the README sentence updated.
>
> B5 — Typed results (output schemas and structured content). Research: add-structured-output.md
> - Now: results are `JSON.stringify`-ed into one text block (`src/tools/_register.ts:97`); most tools define a zod output schema internally (e.g. `deleteNoteOutputSchema`) but none is published.
> - Outcome: tools whose result is a JSON object publish it as `outputSchema` via `registerTool` and return it as `structuredContent`, AND return the identical JSON as the text block (required: the spec says tools SHOULD include serialised text; Claude Code users report only `structuredContent` reaches the model when both are present, and that `isError` results drop `structuredContent`). Errors stay text-only. `read` and other plain-text tools (`help`) stay text-only, no `outputSchema`.
> - Accept: for every tool with an `outputSchema`, a sample success result validates against it and the text block parses to the same object.
>
> C. MUST REMOVE
>
> C1 — Stop stripping parameter descriptions from published schemas. Research: remove-schema-stripping.md
> - Now: `registerTool` publishes `stripSchemaDescriptions(toMcpInputSchema(schema))` (`src/tools/_register.ts:37`) — ADR-005 "Token-Optimized Tool Definitions via Progressive Disclosure". The model sees names and types, not what `file` vs `path`, `inline`, `overwrite` or `target_mode` mean; every description says call `help` first. The conditional rules (vault required in specific mode; exactly one of file/path; no locators in active mode) live only in zod `superRefine` (`src/target-mode/target-mode.ts:15`), so the published schema is looser than the real one.
> - Why ADR-005 no longer holds: clients now defer tools (idle schema cost ~zero); Anthropic's tool search matches argument names and descriptions; descriptions grew back to 77,513 bytes anyway.
> - Outcome: strip step removed; every parameter has a one-line `.describe()` (what, format, default); target-mode rules visible to clients (open decision C1); descriptions stop saying call `help` before every use (`help` stays); a short ADR supersedes ADR-005 (the vault ADR-005 also gets an amendment stanza; the owner does that vault side).
> - Accept: a test walks every published `inputSchema` and fails on any property without a `description`; if the union route is chosen, a probe client validating `{target_mode: "specific"}` without `vault` against the published schema rejects it.
>
> C2 — Gate unrestricted eval in obsidian_exec. Research: remove-open-eval.md
> - Now: `obsidian_exec` accepts any non-empty `command` (`src/tools/obsidian_exec/schema.ts:6`), including `eval code=<javascript>`, `dev:cdp`, `devtools`, plugin install/enable. Obsidian is unsandboxed and can reach the filesystem, so one call — or one instruction planted in a note — runs arbitrary code with the user's rights. Peer CLI wrappers ship eval off or blocked.
> - Outcome: by default `obsidian_exec` refuses `eval`; `dev:*` and `devtools`; commands that install, enable or disable plugins; `restart`. Refusal returns `VALIDATION_ERROR` with `details.code: "COMMAND_BLOCKED"` and the command name, before anything spawns. `OBSIDIAN_MCP_ALLOW_EVAL=1` (parsed like the other flags) restores them; README documents it with a plain warning. The typed tools' internal eval (frozen templates with base64 payloads via `invokeCli`, not via `obsidian_exec`) is out of scope and must keep working — the gate goes in the `obsidian_exec` handler or schema, NOT the shared dispatch. `obsidian_exec` annotated destructive + open-world (B1).
> - Accept: each blocked command returns `COMMAND_BLOCKED` and spawns nothing; the flag re-enables them; every typed tool's existing eval-based tests still pass.
>
> C3 — Retire the draft-07 byte-parity normaliser. Research: remove-parity-machinery.md
> - Now: `toMcpInputSchema` (`src/tools/_shared.ts:236`) emits JSON Schema draft-07 and runs `normalizeToDraft7Parity` (`_shared.ts:148`), four rules (rewrite `oneOf` → `anyOf`, delete `propertyNames`, …) whose purpose is reproducing the retired zod 3 converter byte-for-byte so the fingerprint baseline passes unregenerated. The spec's default dialect has been JSON Schema 2020-12 since 2025-11-25.
> - Outcome: schemas emitted by the SDK or zod 4's own conversion in v2's dialect; `normalizeToDraft7Parity` and its tests deleted; the fingerprint baseline (`src/tools/_register-baseline.json`, `scripts/write-register-baseline.ts`) regenerated once; the baseline test kept as a deliberate-change gate (any published-tool-list change fails it; fix = review and regenerate in the same PR).
> - Accept: normaliser gone, baseline regenerated, gate still fails on an unreviewed descriptor change.
>
> 5. GOVERNANCE DELIVERABLES
> - Constitution amendment (A2) — wording ratified by the owner (open decision A2).
> - New ADR superseding ADR-036 (dual-era) — repo `.decisions/` mirror plus vault (owner adds the vault amendment stanza).
> - New ADR superseding the low-level-`Server` decision (A2); may be combined with the ADR-036 supersession.
> - New short ADR superseding ADR-005 (C1).
> - Dependency justification in the A2 PR description.
> - `.docs-as-code/`, `README.md` and `docs/tools/*.md` describe the system as built, including the new env vars (`OBSIDIAN_MCP_READ_ONLY`, `OBSIDIAN_MCP_TOOLS`, `OBSIDIAN_MCP_DISABLE`, `OBSIDIAN_MCP_ALLOW_EVAL`) and `list_vaults`.
>
> 6. SUGGESTED PR ORDER (story mapping refers to Part 1)
> | PR | Items | Part 1 stories | Why this order |
> | 1 | A1, A4, A5 | written property visible; Windows checked; writes cannot escape | Small, independent fixes on the current SDK; ship value now and give A2 a Windows CI safety net |
> | 2 | C2 | code execution blocked by default | Security gate; SDK-independent and small |
> | 3 | A2, C3 | current-generation client; older client; tool-surface changes deliberate | SDK v2, McpServer, serveStdio, regenerated baseline, constitution amendment, ADRs. Behaviour unchanged apart from the protocol |
> | 4 | B1, B2, C1 | tools declare their nature; model oriented; every parameter described | What the model sees; supersede ADR-005; regenerate the baseline deliberately |
> | 5 | B4, B5 | list vaults; typed results | list_vaults and typed results |
> | 6 | B3, A3 | read-only/restricted modes; confirmation; cancel; progress | Lean on v2's request context |
>
> 7. RELEASE-LEVEL ACCEPTANCE (0.9.0 is done when)
> - All 13 items meet their Accept checks.
> - CI green on Ubuntu and Windows, Node 22 and 24; lint zero warnings; coverage at or above the floor.
> - A 2025-era client (initialize) and a 2026-07-28 client (server/discover) both list and call tools over stdio.
> - In Claude Code, read-only tools run without "modify data" warnings in clients that honour annotations, and two reads in one turn run in parallel.
> - `OBSIDIAN_MCP_READ_ONLY=1` exposes only read tools; `obsidian_exec` refuses `eval` unless `OBSIDIAN_MCP_ALLOW_EVAL=1`.
> - A write followed at once by `find_by_property` sees the new property (A1 live probe).
> - `.docs-as-code/`, `README.md`, `docs/tools/*.md` describe the system as built.
> - The constitution amendment and the new ADRs are recorded.
>
> 8. OUT OF SCOPE — technical references (research item per line)
> - Description size budget (77 KB today, 229–4,890 chars each) — change-description-budget.md.
> - Output bounds and paging for `read` and search tools — change-output-bounds.md.
> - Moving `prepend`, `set_property`, `create_base` off CLI argv — change-argv-writes.md.
> - Consolidating 34 tools to ~22 — change-consolidate-tools.md. No renames or merges in this release.
> - Release hygiene: release workflow, npm metadata (`repository`, `license`, `keywords`, `mcpName`), changelog — change-release-hygiene.md.
> - MCP Registry listing, Claude Code plugin with a skill, MCPB — add-distribution.md.
> - Typed tools for daily notes, tasks, templates, history — add-missing-surfaces.md.
> - Removing internal process IDs from `docs/tools` — remove-internal-jargon.md (except descriptions C1 rewrites anyway).
> - Prompt-injection documentation beyond B2's one line — add-injection-guidance.md.
> - Trace context, result type, caching hints, server info in `_meta` — vault BI-0156..BI-0159.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`

**Sent to the step:**

> =====================================================================
> PART 1 — /speckit-specify INPUT (paste from the next line to the end of Part 1)
> =====================================================================
>
> /speckit-specify Modernise MCP surface
>
> ## Feature
> The Obsidian CLI MCP server is brought up to date with how current MCP clients and models work. It serves both the current and the previous MCP protocol revision, tells clients truthfully which tools only read, gives the model enough guidance to call each tool correctly first time, returns results in a declared shape, and lets the vault owner restrict what it can do. It blocks arbitrary code execution by default, no longer leaves Obsidian's view of a note stale after a write, and refuses writes that would escape the vault.
>
> ## Why
> MCP clients have moved two protocol revisions ahead and now act on tool information this server does not publish. As a result, every tool looks destructive, reads cannot run in parallel, users face extra permission prompts, and the model starts each session with nothing but bare tool names. At the same time, one tool lets anything that reaches the model run code inside the user's Obsidian, a write can silently leave Obsidian's metadata for a note out of date, and a write into a new folder under a linked folder can land outside the vault.
>
> ## User stories
> - As an AI agent, I want a property I just wrote to be visible to my next search, so that follow-up steps act on current data.
> - As a user of a current-generation MCP client, I want the server to connect and list its tools, so that I can use it without downgrading my client.
> - As a user of an older MCP client, I want the server to keep working after the upgrade, so that my existing setup does not break.
> - As a user, I want to cancel a slow call, so that the server is free for my next request.
> - As a user, I want progress updates during long waits, so that I know a slow call is still alive.
> - As a Windows user, I want Windows-specific behaviour checked on every change, so that releases do not regress on my platform.
> - As a vault owner, I want any write that would land outside my vault through a linked folder to be refused, so that files elsewhere on my machine stay safe.
> - As a user of an MCP client, I want every tool to show a readable name and to declare whether it only reads, changes, or can destroy data, so that my client runs reads without prompts and in parallel and warns me before destructive actions.
> - As an AI model, I want the server to tell me at the start of a session what it is for and which tool suits which task, so that I choose the right tool first time.
> - As a vault owner, I want to run the server read-only, or limit it to the tools I name, so that I can give an assistant only the access I am comfortable with.
> - As a vault owner, I want to be asked to confirm before a permanent delete or a vault-wide replace is carried out, so that irreversible changes never happen without me.
> - As an AI agent, I want to list the vaults I can use, and to use a vault opened after the server started, so that I can target the right vault without restarting anything.
> - As an AI agent, I want structured results to come in a declared shape, so that I can rely on their fields without parsing prose.
> - As an AI model, I want every tool parameter described, including which combinations are valid, so that my calls pass validation first time.
> - As a vault owner, I want arbitrary code execution through the general-purpose passthrough tool blocked unless I deliberately allow it, so that a malicious note cannot run code on my machine.
> - As a maintainer, I want any change to the published tool definitions to fail the build until it is reviewed, so that the tool surface only changes on purpose.
>
> ## Acceptance criteria
>
> **Story: a written property is visible to the next search**
> - Given a note in a test vault, when an agent writes a new frontmatter property and immediately searches the vault by that property, then the search returns the note.
> - Given several open vaults, when an agent writes to a vault that is not the focused one, then that vault's metadata is refreshed, not the focused vault's.
> - Given an append, a heading edit, or a committed find-and-replace, when the agent searches straight afterwards, then the search reflects the change.
> - Given a write that asks to open the note afterwards, when it completes, then the correct note opens in the correct vault.
> - Given the metadata refresh fails, when the write completes, then the write still succeeds and the failure is reported in the server's diagnostic log rather than silently dropped.
>
> **Story: current-generation client connects**
> - Given a client using the current protocol revision, when it discovers the server, then it receives the full tool list and can call tools.
> - Given such a client, when it reads and writes a note in a test vault, then both calls succeed.
>
> **Story: older client keeps working**
> - Given a client using the previous protocol revision's start-up handshake, when it connects, then it receives the full tool list and can call tools.
> - Given either client generation, when a tool call fails, then the client receives the same structured error information as before the upgrade.
>
> **Story: cancel a slow call**
> - Given a call waiting behind another call, when the client cancels it, then it never starts and the next waiting call proceeds.
> - Given a call already running, when the client cancels it, then its work is stopped, the call ends, and the next waiting call proceeds.
> - Given calls are processed one at a time today, when this feature ships, then they are still processed one at a time.
>
> **Story: progress during long waits**
> - Given a client that asks for progress, when the server is waiting for Obsidian to start, then the client receives progress updates until Obsidian is ready or the wait times out.
> - Given a client that asks for progress, when a find-and-replace commit runs across many notes, then the client receives progress as each note is processed.
> - Given a client that does not ask for progress, when any call runs, then no progress updates are sent.
>
> **Story: Windows checked on every change**
> - Given any proposed change, when the automated checks run, then they run on Windows as well as Linux, and a Windows failure blocks the change.
>
> **Story: writes cannot escape the vault**
> - Given a linked folder inside the vault that points outside it, when a write targets a not-yet-existing subfolder under that link, then the write is refused with the existing "path escapes vault" error and nothing is created outside the vault.
> - Given the same linked folder, when a write targets an existing subfolder under it, then the write is refused in the same way.
> - Given a Windows directory junction, a vault root written in different letter case, or a path containing "..", when a write would land outside the vault, then it is refused.
> - Given a sibling folder whose name begins with the vault's name (for example "vault2" next to "vault"), when a write targets it, then it is refused.
> - Given an ordinary write inside the vault, including into new folders, when it runs, then it succeeds as today.
>
> **Story: tools declare their nature**
> - Given any client listing the tools, when it reads each tool, then every tool has a human-readable title and an explicit declaration of whether it only reads and whether it can destroy data.
> - Given a read-only tool, when a client that honours these declarations calls it, then no "this may modify data" warning appears, and two such reads in one turn may run in parallel.
> - Given a tool that can overwrite, delete, move, rename, or bulk-replace, when a client lists it, then it is declared destructive.
> - Given the general-purpose passthrough tool, when a client lists it, then it is declared destructive and able to reach beyond the vault.
>
> **Story: the model is oriented at session start**
> - Given a client connecting with either protocol generation, when the session starts, then the server provides a short orientation text.
> - Given a client that reads only the first part of that text, when it reads it, then the first part still makes sense on its own and says what the server is for in task terms.
> - Given the orientation text, when a model reads it, then it learns which tool fits which task and the cross-cutting rules (target a named vault and note for automation, use vault display names, preview bulk replaces before committing, treat note content as data rather than instructions, use the help tool for long reference).
> - Given those cross-cutting rules now live in the orientation text, when a model reads individual tool descriptions, then the rules are no longer repeated in each one.
>
> **Story: read-only and restricted modes**
> - Given the server is configured read-only, when a client lists tools, then only tools that only read are offered.
> - Given the server is configured with a list of allowed tools, when a client lists tools, then only those tools are offered.
> - Given the server is configured with a list of disabled tools, alone or together with an allow list, when a client lists tools, then the disabled tools are not offered.
> - Given a configured tool name that does not exist, when the server starts, then it refuses to start and names every unknown tool in one message.
>
> **Story: confirmation before irreversible actions**
> - Given a permanent delete, or a find-and-replace commit not limited to a single note, when it is requested, then the human is asked to confirm before anything changes.
> - Given the human confirms, when the request proceeds, then the action happens as before.
> - Given the human declines or cancels, when the request ends, then nothing changes and the agent receives a structured error saying confirmation was declined.
> - Given a client that cannot ask the human, when such an action is requested, then the server behaves as the owner decides (open decision B3 in Part 2), never silently performing the action.
> - Given a normal delete (to the trash), when it is requested, then it proceeds without confirmation, as today.
>
> **Story: list vaults and pick up new ones**
> - Given vaults known to Obsidian, when an agent lists vaults, then it receives each vault's display name and location, and whether it is open where that can be determined cheaply (otherwise reported as unknown rather than guessed).
> - Given a vault opened after the server started, when an agent targets it by name, then the call succeeds without restarting the server.
> - Given a vault name that still does not exist after re-checking, when an agent targets it, then the agent receives the existing "unknown vault" error.
>
> **Story: typed results**
> - Given a tool whose result is structured data, when a client lists the tools, then the tool declares the shape of its result.
> - Given such a tool succeeds, when it returns, then the result matches its declared shape and the same data is also present as text.
> - Given such a tool fails, when it returns, then the error is delivered as text in the existing structured error form.
> - Given a tool whose result is plain note text or help text, when it returns, then it returns text only, as today.
>
> **Story: every parameter is described**
> - Given any client listing the tools, when it reads any tool's input definition, then every parameter has a one-line description of what it is, its format, and its default.
> - Given the rules about which parameter combinations are valid (for example, a named vault being required when targeting a specific note), when a client reads the input definition, then those rules are visible to it, either enforced in the definition or stated in the parameter descriptions (open decision C1 in Part 2).
> - Given a tool description, when a model reads it, then it is no longer told to call the help tool before every use; the help tool remains available for long reference and worked examples.
>
> **Story: code execution is blocked by default**
> - Given the default configuration, when the passthrough tool is asked to run arbitrary code, open developer tools, install/enable/disable plugins, or restart Obsidian, then the request is refused with a structured error naming the blocked command, and nothing is run.
> - Given the vault owner has explicitly allowed these commands, when the same request is made, then it runs as before.
> - Given the default configuration, when any dedicated (non-passthrough) tool runs, then it works exactly as before.
>
> **Story: tool-surface changes are deliberate**
> - Given the published tool definitions, when anyone changes them without updating the reviewed record, then the build fails.
> - Given the change is reviewed and the record updated in the same change, when the build runs, then it passes.
>
> ## Out of scope
> - Rewriting every tool description to a strict size budget (descriptions may shrink as a side effect of the orientation text and parameter descriptions).
> - Limiting output size or adding paging to note reads and searches.
> - Changing how the remaining argument-passed write tools send their content.
> - Merging, renaming, or consolidating tools; the tool list stays as it is apart from the new vault-listing tool.
> - Release automation, package metadata, and the changelog.
> - Listing the server in public registries, or packaging it as a client plugin.
> - New tools for daily notes, tasks, templates, or history.
> - Removing internal process identifiers from help documents, except where descriptions are rewritten anyway.
> - Guidance on prompt injection beyond the single line in the orientation text.
> - Trace propagation, result-type markers, caching hints, and server identity in per-result metadata (tracked separately).
>
> =====================================================================
> PART 2 — SESSION BRIEF FOR THE CLAUDE CODE SESSION (obsidian-cli-mcp repo)
> Not /speckit-specify input. Use it at /speckit-plan and implementation.
> =====================================================================
>
> 0. BEFORE YOU START
> - Load the `karpathy-guidelines` skill before planning or changing any code or config. The repo's own rules outrank it where they disagree: `CLAUDE.md` (spec-kit workflow, the test-execution gate in `.memory/test-execution-instructions.md`, PR lifecycle with `/speckit-docs-as-code`) and the constitution (`.specify/memory/constitution.md`).
> - Evidence for every item lives in the review research: `C:\Marwan-Saab-ADO\Research\Research\_Research\researches\obsidian-cli-mcp-review\` — start with `SUMMARY.md`, then `items\<file>.md` named per item below. Original handover: `handover\0.8.20-scope.md`.
> - Line references are to commit `0b02f8c`; re-check them.
> - Do not commit, push or publish unless the owner asks.
> - Note: `.memory/test-execution-instructions.md` still has the pre-2026-10-20 test-vault path. Current path: `C:\Marwan-Saab-ADO\My-Setup\My-Setup\TestVault-Obsidian-CLI-MCP`. Ask the owner before editing `.memory`.
>
> 1. RELEASE SHAPE
> - One release (0.9.0), not one spec. Part 1 describes the whole release. If the repo process wants one spec per PR, draft each per-PR spec from the Part 1 stories that PR covers (mapping in section 6), keeping the 3-word verb-led title rule.
> - Each PR: /speckit-implement → /speckit-git-commit → open PR → /code-review and fixes → /speckit-docs-as-code <n> → merge.
> - Bump the version to 0.9.0 at the end.
>
> 2. OWNER DECISIONS (2026-10-28) — already made, do not reopen
> - Protocol era: DUAL-ERA. Serve 2025-11-25 (initialize) and 2026-07-28 (server/discover) clients via SDK v2 `serveStdio`. This overturns vault ADR-036 ("Modern-Only Protocol Era For Obsidian CLI MCP"). Deliverable: a new ADR superseding ADR-036 (the vault ADR also gets an amendment stanza; the owner does that vault side).
> - Release label: 0.9.0, not 0.8.20.
> - Vault BIs BI-0151..BI-0155 are superseded by this work. BI-0156 (trace context), BI-0157 (result type), BI-0158 (caching hints), BI-0159 (server info in _meta) are NOT in scope; re-check them after SDK v2 lands (v2 may provide some for free).
> - Vault BI-0043 (a typed eval tool) is deliberately deferred because of C2.
>
> 3. OPEN DECISIONS — ask the owner when you reach them; do not guess
> - B3: behaviour when the client cannot do elicitation. Recommended: refuse with a structured error explaining how to confirm out of band. Alternative: set `_meta["anthropic/requiresUserInteraction"]: true` on those tools so Claude Code prompts every call.
> - C1: a zod discriminated union on `target_mode` (emits `oneOf`, valid JSON Schema 2020-12) now; or keep the flat schema and state the rules in parameter descriptions now, union later.
> - A2: constitution amendment wording (owner ratifies). Proposed: "the official MCP TypeScript SDK (v2 packages)" and "`McpServer.registerTool`".
>
> 4. ITEM DETAIL
>
> A. MUST CHANGE
>
> A1 — Fix the silent metadata-cache refresh after direct-to-disk writes. Research: change-cache-invalidation-bug.md
> - Now: after `write_note`, `append_note`, `patch_heading`, `patch_block` write to disk, `invalidateMetadataCache` in `src/tools/_note-io.ts` runs `obsidian eval` asking Obsidian to recompute metadata. Defect 1: it passes the absolute OS path to `app.vault.getFileByPath`, which takes a vault-relative path; the lookup returns null and the `if (f)` guard skips the refresh (`_note-io.ts:50`). Defect 2: it runs with `target_mode: "active"` and no `vault`, so multi-vault it hits the focused vault (`_note-io.ts:66`). `find_and_replace` commits use the same `writeAtomic` but never call the refresh (`find_and_replace/handler.ts:650`) — include it. The function swallows every failure; handler tests only assert argv shape, so the suite is green. The same absolute path reaches `app.workspace.openLinkText` for `write_note` `open: true` (template `write_note/handler.ts:43`, call line 160).
> - Not yet confirmed live. First task: a live probe under the test-execution gate showing a property written with `write_note` is not visible to `find_by_property` straight away, and is once fixed.
> - Outcome: refresh uses the vault-relative, forward-slash path, with `vault=` on the eval for the written vault; `open: true` opens the right note in the right vault; failures stay best-effort but are logged to stderr.
> - Accept: unit tests assert the template receives a vault-relative path and the eval carries `vault=<written vault>`; one live probe (authorised test vault only) writes a frontmatter property and reads it back via `find_by_property` in the next call; the same probe passes for `append_note`, `patch_heading` and a `find_and_replace` commit.
>
> A2 — Move to SDK v2, McpServer and dual-era stdio. Research: change-sdk-v2.md
> - Now: `src/server.ts:91` builds the SDK's deprecated low-level `Server` (with an eslint-disable) and hand-writes `tools/list` / `tools/call`; dependency `@modelcontextprotocol/sdk` ^1.29.0; `src/index.ts` uses `server.connect(new StdioServerTransport())`, which serves only 2025-era clients even on v2.
> - Outcome: TypeScript SDK v2 — `@modelcontextprotocol/server`, stdio from `@modelcontextprotocol/server/stdio`; every tool registered with `registerTool` on `McpServer`; served with `serveStdio(() => createServer())` so 2025-11-25 (initialize) and 2026-07-28 (server/discover) clients both work. `src/cli-adapter/`, `src/queue.ts`, `src/app-launcher/` unchanged. Error contract (`isError: true` with `{code, message, details}`) unchanged, except an unknown tool may become a protocol error (-32602), v2's default.
> - Carries A3, B1, B2, B3, C1 — do it first, or land the scaffolding first.
> - Facts: codemod `npx @modelcontextprotocol/codemod@latest v1-to-v2 .`; v2 needs zod ^4.2 (repo ^4.4.3) and Node 20+ (floor 22.11). Migration guide https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2 ; stdio https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio.html . Do NOT adopt Roots, Sampling or the Logging capability (deprecated in 2026-07-28); keep logging to stderr.
> - Governance: constitution amendment (Technical Standards ~lines 420–422 say `@modelcontextprotocol/sdk` is "the sole MCP transport" and registration "MUST go through the SDK's `Server` API"); a new ADR superseding the low-level-`Server` decision in `server.ts`'s BI-067 comment (may be combined with the ADR superseding ADR-036 if the owner prefers); a dependency justification in the PR description.
> - Accept: `tsc --noEmit`, eslint (zero warnings), `vitest run` and the coverage floor pass; no `eslint-disable @typescript-eslint/no-deprecated` remains for the SDK; a stdio probe with the 2025-11-25 initialize handshake lists all tools; a stdio probe with server/discover (2026-07-28) lists all tools; Claude Code connects and calls `read` and `write_note` against the test vault.
>
> A3 — Support cancellation and progress. Research: change-cancel-progress.md
> - Now: every CLI call waits in one FIFO single-flight queue (`src/queue.ts`); `notifications/cancelled` is ignored; no progress is sent, including the auto-launch wait of up to 30 s (`_dispatch.ts:19`) and long `find_and_replace` commits. `invoke-bounded-cli.ts:53` silently clamps `timeoutMs` to 120,000, which the schema already enforces — dead code.
> - Outcome: a cancelled request is dropped from the queue if not started; a running CLI child is killed (SIGTERM, then SIGKILL after the existing grace period); the call ends without blocking the queue. With a client `progressToken`, emit progress during the auto-launch readiness loop and per note during `find_and_replace` commits. Keep the single-flight queue.
> - Accept: unit tests for cancel-while-queued (never spawns), cancel-while-running (child killed, next task runs), progress notifications carrying the client's token; the dead clamp removed or justified.
>
> A4 — Add a Windows CI runner. Research: change-windows-ci.md
> - Now: `.github/workflows/ci.yml:16` runs only `ubuntu-latest` (Node 22 and 24). Windows-specific logic: the `Obsidian.com` shim, `cmd /c start` for auto-launch, `realpath` and drive-letter case, CRLF handling. The suite passes on Windows 11 locally.
> - Outcome: matrix includes `windows-latest` with at least Node 22; `fail-fast: false` stays.
> - Accept: CI green on both OSes.
>
> A5 — Close the vault-escape gap for new folders under a symlink. Research: change-symlink-gap.md
> - Now: `src/path-safety/canonical.ts:47` — when `realpath(parentDir)` fails with ENOENT, the check falls back to the lexical parent. A vault with `Linked/` → outside the vault; a write to `Linked/New/Note.md` with `New` not yet existing passes the lexical check, then `mkdir -p` (`write_note/handler.ts:108`) creates `New` outside the vault. Bug class of CVE-2025-53109.
> - Outcome: walk up to the nearest existing ancestor, `realpath` it, re-append the missing segments, compare against canonical root + path separator. An escaping write returns `PATH_ESCAPES_VAULT` and logs the existing `pathEscapeAttempt` event.
> - Accept: tests for a symlinked folder with an existing and a not-yet-existing child; a Windows junction; a mixed-case vault root on Windows; `..` segments; the prefix-collision case (`/vault` vs `/vault2`).
>
> B. MUST ADD
>
> B1 — Annotations and a title on every tool. Research: add-annotations-title.md
> - Now: descriptors have only `name`, `description`, `inputSchema`. Spec defaults (readOnlyHint false, destructiveHint true, idempotentHint false, openWorldHint true) make all 34 tools look destructive: Claude Code can't parallelise reads (it runs readOnlyHint tools in parallel and treats them as retry-safe); Claude apps prompt more; VS Code and Codex prompt every tool; ineligible for Claude's directory (needs a title plus a read-only or destructive hint on every tool).
> - Outcome: every tool has a human `title` and an explicit `annotations` block. Classification (adjust only with a reason in the PR):
>   | Tools | readOnly | destructive | idempotent | openWorld |
>   | read, read_heading, read_property, search, context_search, pattern_search, find_by_property, tag, backlinks, links, outline, files, paths, properties, bases, views_base, query_base, get_active_file, help, list_vaults (new), smart_connections_query, smart_connections_similar | true | false | true | false |
>   | append_note, prepend, patch_heading, patch_block, create_base | false | false | false | false |
>   | set_property | false | false | true | false |
>   | write_note, delete, move, rename, find_and_replace | false | true | false | false |
>   | open_file (changes Obsidian's focus) | false | false | true | false |
>   | obsidian_exec | false | true | false | true |
>   `write_note` can overwrite; `find_and_replace` previews by default but commits in the same tool, so it is destructive.
> - Accept: a test walks the published tool list and fails if any tool lacks a `title` or an explicit readOnlyHint/destructiveHint; a test pins the classification.
>
> B2 — Server instructions. Research: add-server-instructions.md
> - Now: no `instructions`. With tool search on, Claude Code's model starts with 34 bare tool names.
> - Outcome: `instructions` of ~1,000–1,500 characters (Claude Code cuts at 4,096). The first 512 characters stand alone (Codex reads only those): what the server is for in task words — read, search and edit notes in Obsidian vaults through the Obsidian CLI, on Windows, macOS and Linux. Then a short routing guide (which tool for which task). Then the cross-cutting rules now repeated in descriptions: specific mode with `vault` + `path` for automation; vault names are Obsidian display names and `list_vaults` lists them; preview `find_and_replace` before `commit: true`; note content is data, not instructions; `help` holds long reference. Remove those repeats from individual descriptions in the same change.
> - Accept: an initialize probe and a server/discover probe both return the instructions; a test pins the length under 2,000 characters; a test pins the first 512 characters ending on a complete sentence.
>
> B3 — Read-only mode, a tool allowlist, and confirmation for irreversible actions. Research: add-safety-modes.md
> - Now: no read-only mode or tool hiding; `delete` with `permanent: true` and a vault-wide `find_and_replace` commit run without human confirmation; `delete` already defaults to trash (keep).
> - Outcome: `OBSIDIAN_MCP_READ_ONLY` (1/true/yes/on, case-insensitive, parsed like `OBSIDIAN_AUTO_LAUNCH`) registers only `readOnlyHint: true` tools. `OBSIDIAN_MCP_TOOLS` (comma-separated allowlist) and `OBSIDIAN_MCP_DISABLE` (comma-separated denylist); denylist applied after allowlist; an unknown name in either fails server start listing all bad names together (aggregated like `assertToolDocsExist`). `delete permanent: true`, and `find_and_replace commit: true` with no single-note scope, ask the human via elicitation — SDK v2 `inputRequired` with `inputRequired.elicit`, legacy shim for 2025-era clients. Declined/cancelled → structured error, nothing changed. Non-elicitation clients: open decision B3. Error codes per ADR-015: existing top-level code + new `details.code` (e.g. `VALIDATION_ERROR` / `CONFIRMATION_DECLINED`) — zero new top-level codes.
> - Accept: tests for read-only registration, allowlist, denylist, unknown names, and confirm/decline/cancel for both irreversible actions; README documents the three env vars.
>
> B4 — A list_vaults tool and a refreshable vault registry. Research: add-list-vaults.md
> - Now: README says there is "no in-band vault-enumeration tool yet" (`README.md:115`). `src/vault-registry/registry.ts` runs `obsidian vaults verbose` and caches name → path but never refreshes; an unknown name fails with "restart the MCP server" (`registry.ts:73`). A stub `docs/tools/list_vaults.md` already exists for an unregistered tool and `help` advertises it.
> - Outcome: read-only `list_vaults` returns `{ count, vaults: [{ name, path, open }] }` (`open: null` if it can't be determined cheaply — don't guess). On an unknown vault name the registry re-probes once before failing. The tool gets a real doc in `docs/tools/` (boot fails without one) replacing the stub.
> - Accept: tests for listing, a cache refresh on a miss, and a still-unknown name after refresh; the README sentence updated.
>
> B5 — Typed results (output schemas and structured content). Research: add-structured-output.md
> - Now: results are `JSON.stringify`-ed into one text block (`src/tools/_register.ts:97`); most tools define a zod output schema internally (e.g. `deleteNoteOutputSchema`) but none is published.
> - Outcome: tools whose result is a JSON object publish it as `outputSchema` via `registerTool` and return it as `structuredContent`, AND return the identical JSON as the text block (required: the spec says tools SHOULD include serialised text; Claude Code users report only `structuredContent` reaches the model when both are present, and that `isError` results drop `structuredContent`). Errors stay text-only. `read` and other plain-text tools (`help`) stay text-only, no `outputSchema`.
> - Accept: for every tool with an `outputSchema`, a sample success result validates against it and the text block parses to the same object.
>
> C. MUST REMOVE
>
> C1 — Stop stripping parameter descriptions from published schemas. Research: remove-schema-stripping.md
> - Now: `registerTool` publishes `stripSchemaDescriptions(toMcpInputSchema(schema))` (`src/tools/_register.ts:37`) — ADR-005 "Token-Optimized Tool Definitions via Progressive Disclosure". The model sees names and types, not what `file` vs `path`, `inline`, `overwrite` or `target_mode` mean; every description says call `help` first. The conditional rules (vault required in specific mode; exactly one of file/path; no locators in active mode) live only in zod `superRefine` (`src/target-mode/target-mode.ts:15`), so the published schema is looser than the real one.
> - Why ADR-005 no longer holds: clients now defer tools (idle schema cost ~zero); Anthropic's tool search matches argument names and descriptions; descriptions grew back to 77,513 bytes anyway.
> - Outcome: strip step removed; every parameter has a one-line `.describe()` (what, format, default); target-mode rules visible to clients (open decision C1); descriptions stop saying call `help` before every use (`help` stays); a short ADR supersedes ADR-005 (the vault ADR-005 also gets an amendment stanza; the owner does that vault side).
> - Accept: a test walks every published `inputSchema` and fails on any property without a `description`; if the union route is chosen, a probe client validating `{target_mode: "specific"}` without `vault` against the published schema rejects it.
>
> C2 — Gate unrestricted eval in obsidian_exec. Research: remove-open-eval.md
> - Now: `obsidian_exec` accepts any non-empty `command` (`src/tools/obsidian_exec/schema.ts:6`), including `eval code=<javascript>`, `dev:cdp`, `devtools`, plugin install/enable. Obsidian is unsandboxed and can reach the filesystem, so one call — or one instruction planted in a note — runs arbitrary code with the user's rights. Peer CLI wrappers ship eval off or blocked.
> - Outcome: by default `obsidian_exec` refuses `eval`; `dev:*` and `devtools`; commands that install, enable or disable plugins; `restart`. Refusal returns `VALIDATION_ERROR` with `details.code: "COMMAND_BLOCKED"` and the command name, before anything spawns. `OBSIDIAN_MCP_ALLOW_EVAL=1` (parsed like the other flags) restores them; README documents it with a plain warning. The typed tools' internal eval (frozen templates with base64 payloads via `invokeCli`, not via `obsidian_exec`) is out of scope and must keep working — the gate goes in the `obsidian_exec` handler or schema, NOT the shared dispatch. `obsidian_exec` annotated destructive + open-world (B1).
> - Accept: each blocked command returns `COMMAND_BLOCKED` and spawns nothing; the flag re-enables them; every typed tool's existing eval-based tests still pass.
>
> C3 — Retire the draft-07 byte-parity normaliser. Research: remove-parity-machinery.md
> - Now: `toMcpInputSchema` (`src/tools/_shared.ts:236`) emits JSON Schema draft-07 and runs `normalizeToDraft7Parity` (`_shared.ts:148`), four rules (rewrite `oneOf` → `anyOf`, delete `propertyNames`, …) whose purpose is reproducing the retired zod 3 converter byte-for-byte so the fingerprint baseline passes unregenerated. The spec's default dialect has been JSON Schema 2020-12 since 2025-11-25.
> - Outcome: schemas emitted by the SDK or zod 4's own conversion in v2's dialect; `normalizeToDraft7Parity` and its tests deleted; the fingerprint baseline (`src/tools/_register-baseline.json`, `scripts/write-register-baseline.ts`) regenerated once; the baseline test kept as a deliberate-change gate (any published-tool-list change fails it; fix = review and regenerate in the same PR).
> - Accept: normaliser gone, baseline regenerated, gate still fails on an unreviewed descriptor change.
>
> 5. GOVERNANCE DELIVERABLES
> - Constitution amendment (A2) — wording ratified by the owner (open decision A2).
> - New ADR superseding ADR-036 (dual-era) — repo `.decisions/` mirror plus vault (owner adds the vault amendment stanza).
> - New ADR superseding the low-level-`Server` decision (A2); may be combined with the ADR-036 supersession.
> - New short ADR superseding ADR-005 (C1).
> - Dependency justification in the A2 PR description.
> - `.docs-as-code/`, `README.md` and `docs/tools/*.md` describe the system as built, including the new env vars (`OBSIDIAN_MCP_READ_ONLY`, `OBSIDIAN_MCP_TOOLS`, `OBSIDIAN_MCP_DISABLE`, `OBSIDIAN_MCP_ALLOW_EVAL`) and `list_vaults`.
>
> 6. SUGGESTED PR ORDER (story mapping refers to Part 1)
> | PR | Items | Part 1 stories | Why this order |
> | 1 | A1, A4, A5 | written property visible; Windows checked; writes cannot escape | Small, independent fixes on the current SDK; ship value now and give A2 a Windows CI safety net |
> | 2 | C2 | code execution blocked by default | Security gate; SDK-independent and small |
> | 3 | A2, C3 | current-generation client; older client; tool-surface changes deliberate | SDK v2, McpServer, serveStdio, regenerated baseline, constitution amendment, ADRs. Behaviour unchanged apart from the protocol |
> | 4 | B1, B2, C1 | tools declare their nature; model oriented; every parameter described | What the model sees; supersede ADR-005; regenerate the baseline deliberately |
> | 5 | B4, B5 | list vaults; typed results | list_vaults and typed results |
> | 6 | B3, A3 | read-only/restricted modes; confirmation; cancel; progress | Lean on v2's request context |
>
> 7. RELEASE-LEVEL ACCEPTANCE (0.9.0 is done when)
> - All 13 items meet their Accept checks.
> - CI green on Ubuntu and Windows, Node 22 and 24; lint zero warnings; coverage at or above the floor.
> - A 2025-era client (initialize) and a 2026-07-28 client (server/discover) both list and call tools over stdio.
> - In Claude Code, read-only tools run without "modify data" warnings in clients that honour annotations, and two reads in one turn run in parallel.
> - `OBSIDIAN_MCP_READ_ONLY=1` exposes only read tools; `obsidian_exec` refuses `eval` unless `OBSIDIAN_MCP_ALLOW_EVAL=1`.
> - A write followed at once by `find_by_property` sees the new property (A1 live probe).
> - `.docs-as-code/`, `README.md`, `docs/tools/*.md` describe the system as built.
> - The constitution amendment and the new ADRs are recorded.
>
> 8. OUT OF SCOPE — technical references (research item per line)
> - Description size budget (77 KB today, 229–4,890 chars each) — change-description-budget.md.
> - Output bounds and paging for `read` and search tools — change-output-bounds.md.
> - Moving `prepend`, `set_property`, `create_base` off CLI argv — change-argv-writes.md.
> - Consolidating 34 tools to ~22 — change-consolidate-tools.md. No renames or merges in this release.
> - Release hygiene: release workflow, npm metadata (`repository`, `license`, `keywords`, `mcpName`), changelog — change-release-hygiene.md.
> - MCP Registry listing, Claude Code plugin with a skill, MCPB — add-distribution.md.
> - Typed tools for daily notes, tasks, templates, history — add-missing-surfaces.md.
> - Removing internal process IDs from `docs/tools` — remove-internal-jargon.md (except descriptions C1 rewrites anyway).
> - Prompt-injection documentation beyond B2's one line — add-injection-guidance.md.
> - Trace context, result type, caching hints, server info in `_meta` — vault BI-0156..BI-0159.

## 3. pre-implementation / specify (2026-10-27T13:54:05.936Z)

**Question (verbatim):**

> ## Question 1: How parameter-combination rules are made visible (owner decision C1)
>
> **Context**: FR-031: "Parameter-combination rules (a named vault is required when targeting a specific note; exactly one of the two note locators; no note locator when targeting the active note) MUST be visible to clients [NEEDS CLARIFICATION]". Constitution v1.6.0 (MCP Tool Surface Standards → Visible input rules) accepts either form. Today these rules exist only in server-side validation, so the published input definition is looser than the rules the server actually enforces.
>
> **What we need to know**: Should the combination rules be enforced in the structure of the published input definition, or stated in the parameter descriptions for now, with structural enforcement left for later?
>
> **Suggested Answers**:
>
> | Option | Answer | Implications |
> |--------|--------|--------------|
> | A (recommended) | Structural now: a union keyed on the targeting mode (a `oneOf` in JSON Schema 2020-12) | Clients that validate against the published definition reject `{target_mode: "specific"}` without `vault` before the call is sent. Acceptance adds a probe-client rejection test. The published shape changes more (one deliberate fingerprint-baseline regeneration in PR 4). Some clients render `oneOf` less clearly. |
> | B | Descriptions now, union later | The flat definition stays and the rules are written into the descriptions of `target_mode`, `vault`, `file` and `path`. This is a smaller change with lower client-rendering risk, but nothing structural stops an invalid combination before the call. A union would come in a later release. |
> | Custom | Provide your own answer | For example: a union for some tool groups only. Say which. |
>
> **Your choice**: _[Wait for user response]_

**Advisor** (escalate: decision: BI-0165 lists C1 as an open owner decision. Option A would also reverse ADR-003's flat-encoding amendment, so it needs your ruling and an ADR-003 amendment if you choose it.):

> 1. B
>
> Recommended pending owner ruling. Keep flat `target_mode` schema; state combination rules in `target_mode`, `vault`, `file`, `path` descriptions. Mark structural union as later work. Drop probe-client rejection test from acceptance.
> Rationale: BI-0165 Part 2 §3 lists C1 as open owner decision ("ask the owner, do not guess"). ADR-003 (amendment 2026-05-07) fixes encoding as flat `z.object().strict()` + `superRefine`. Option A reverses that encoding. That needs ADR-003 amendment, likely inside the PR 4 ADR that supersedes ADR-005. Option B fits current ADRs as is.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`, `200-Decisions/ADR-003 - Enforce Target Mode in Typed Tools.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`

**Advisor, after the owner ruled** (escalate: none):

> 1. B
>
> Keep flat `target_mode` schema in 0.9.0. Write combination rules into `target_mode`, `vault`, `file`, `path` parameter descriptions: `vault` required when `target_mode: "specific"`; exactly one of `file`/`path` in specific mode; no `vault`/`file`/`path` in active mode. Put the structural `target_mode` union (`oneOf`) in Out of Scope as deferred. Drop the probe-client rejection test from acceptance. Clear the NEEDS CLARIFICATION marker on FR-031.
> Rationale: owner ruled C1 on 2026-10-28, recorded on the BI-0165 note. ADR-003's flat `z.object().strict()` + `superRefine` encoding stays, so no ADR-003 amendment is needed.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`, `200-Decisions/ADR-003 - Enforce Target Mode in Typed Tools.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`: Added a footer HTML comment recording the 2026-10-28 C1 ruling: descriptions now, union deferred, ADR-003 stands, no probe-client test. In-place edits to the Part 2 §3 C1 line and the Skill notes line were not made because find_and_replace permission was denied, so the comment says it supersedes the §3 line.

**Owner:** choice 1 (B: descriptions now, union later), via ntfy, 2026-10-27T13:55:25.183Z.

**Sent to the step:**

> 1. B
>
> Keep flat `target_mode` schema in 0.9.0. Write combination rules into `target_mode`, `vault`, `file`, `path` parameter descriptions: `vault` required when `target_mode: "specific"`; exactly one of `file`/`path` in specific mode; no `vault`/`file`/`path` in active mode. Put the structural `target_mode` union (`oneOf`) in Out of Scope as deferred. Drop the probe-client rejection test from acceptance. Clear the NEEDS CLARIFICATION marker on FR-031.
> Rationale: owner ruled C1 on 2026-10-28, recorded on the BI-0165 note. ADR-003's flat `z.object().strict()` + `superRefine` encoding stays, so no ADR-003 amendment is needed.

## 4. pre-implementation / specify (2026-10-27T13:55:53.316Z)

**Question (verbatim):**

> ## Question 2: Behaviour when the client cannot ask the human to confirm (owner decision B3)
>
> **Context**: FR-049: "When the client cannot ask the human, the action MUST NOT proceed unconfirmed [NEEDS CLARIFICATION]". This applies to `delete` with `permanent: true` and to a `find_and_replace` commit that is not limited to a single note. Constitution v1.6.0 (Security Defaults → Confirmation of irreversible operations) allows either a refusal with a structured error or a per-call permission prompt that the client enforces.
>
> **What we need to know**: When the connected client does not support elicitation, should the server refuse these actions, or declare the tools as needing human interaction on every call so that the client prompts?
>
> **Suggested Answers**:
>
> | Option | Answer | Implications |
> |--------|--------|--------------|
> | A (recommended) | Refuse with a structured error (an existing top-level code plus a sub-code) that explains how to confirm out of band | Safe on every client and deterministic. Users of clients without elicitation cannot run a permanent delete or a vault-wide replace through the server. They would trash-delete instead, or limit the replace to one note at a time. |
> | B | Set `_meta["anthropic/requiresUserInteraction"]: true` on these tools so the client prompts on every call | The action still runs on clients that honour the marker, such as Claude Code. Clients that ignore the marker would run it unconfirmed, so this needs a fallback. It also adds a prompt to every call of the tool, including safe ones such as a trash delete or a single-note replace. |
> | C | Both: mark the tools as in B, and still refuse when elicitation is unavailable | This is the strictest option. The marker adds a prompt on top, while a refusal still happens without elicitation. |
> | Custom | Provide your own answer | Describe the behaviour you want. |
>
> **Your choice**: _[Wait for user response]_

**Advisor** (escalate: decision: BI-0165 lists B3 as an open owner decision ("ask the owner, do not guess"). The note recommends refusal but leaves the choice to you.):

> 2. A
>
> Recommended, pending owner ruling. When the client cannot do elicitation, refuse `delete permanent: true` and `find_and_replace commit: true` without a single-note scope before any change happens. Return the existing top-level code with a new `details.code` (for example `VALIDATION_ERROR` / `CONFIRMATION_UNAVAILABLE`), and include a message saying how to confirm out of band. Add no `_meta["anthropic/requiresUserInteraction"]` marker.
> Rationale: BI-0165 Part 2 §3 lists B3 as an open owner decision and recommends refusal with a structured error. ADR-015 and Constitution Principle IV require zero new top-level codes.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`, `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

**Advisor, after the owner ruled** (escalate: none):

> 2. A
>
> If the client cannot do elicitation, refuse `delete permanent: true` and `find_and_replace commit: true` without single-note scope. Refuse before anything changes. Return the existing top-level code plus a new `details.code` (e.g. `VALIDATION_ERROR` / `CONFIRMATION_UNAVAILABLE`). The message must say how to confirm out of band, e.g. delete to trash, or replace one note at a time. Do not add the `_meta["anthropic/requiresUserInteraction"]` marker. Remove the NEEDS CLARIFICATION marker from FR-049. Add an acceptance test: client without elicitation → refusal, nothing changed, nothing spawned.
> Rationale: owner ruled B3 on 2026-10-28; the ruling is recorded on the BI-0165 note. ADR-015 and Constitution Principle IV allow zero new top-level codes.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`, `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`: Appended footer HTML comment recording 2026-10-28 B3 ruling (refuse with structured error when no elicitation; no requiresUserInteraction marker); notes it supersedes the still-open Part 2 §3 B3 line.

**Owner:** choice 1 (A: refuse with structured error), via ntfy, 2026-10-27T13:56:57.682Z.

**Sent to the step:**

> 2. A
>
> If the client cannot do elicitation, refuse `delete permanent: true` and `find_and_replace commit: true` without single-note scope. Refuse before anything changes. Return the existing top-level code plus a new `details.code` (e.g. `VALIDATION_ERROR` / `CONFIRMATION_UNAVAILABLE`). The message must say how to confirm out of band, e.g. delete to trash, or replace one note at a time. Do not add the `_meta["anthropic/requiresUserInteraction"]` marker. Remove the NEEDS CLARIFICATION marker from FR-049. Add an acceptance test: client without elicitation → refusal, nothing changed, nothing spawned.
> Rationale: owner ruled B3 on 2026-10-28; the ruling is recorded on the BI-0165 note. ADR-015 and Constitution Principle IV allow zero new top-level codes.

## 5. pre-implementation / clarify (2026-10-27T13:58:45.456Z)

**Question (verbatim):**

> ## Question 1: Cancelling a find-and-replace commit that is already writing notes
>
> **Context**: User Story 15 says a cancelled running call has its work stopped. A multi-note `find_and_replace` commit is the one long operation that changes many files. Structurally, the commit loop (`find_and_replace/handler.ts:638-650`) writes notes one by one, and each note's atomic temp+rename write is its own task on the single-flight Queue that `createQueue()` builds in `server.ts` and injects into the handlers. The tool already has a partial-commit outcome (`partial: true` + `failing_note_locator`) for write failures. Under MCP, a cancelled request receives no response, so the agent cannot be told which notes were written.
>
> **Recommended:** Option A. It honours the cancel promptly and never leaves a half-written note, because each note write is atomic. It reuses the partial-commit idea that already exists. The stderr record makes the vault state recoverable even though the cancelled call gets no reply.
>
> | Option | Description |
> |--------|-------------|
> | A | Stop between notes. A note already written stays written, the note in flight finishes its atomic write, and no further notes are touched. The server logs to stderr which notes were committed and which were skipped. |
> | B | Ignore cancellation once the first note write has begun, and finish the whole commit. Cancellation only takes effect before writing starts (during scan and drift re-check). |
> | C | Stop between notes and roll back the notes already written in this call, restoring their prior content. |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> 1. A
>
> Stop between notes. Notes already written stay written. The note in flight finishes its atomic write. Touch no further notes and roll nothing back. Log the committed and skipped note locators to stderr. Record this in spec Clarifications. That entry is the Constitution Principle IV authorisation for the partial outcome, because a cancelled request has no response payload to carry it.
> Rationale: BI-0165 A3 / Part 1 'cancel a slow call' says a running call's work is stopped and the queue proceeds, so B does not match. C adds rollback, which no source asks for.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`: Appended a footer HTML comment recording the clarification: cancelling a find_and_replace commit stops between notes, with no rollback and a stderr record of committed and skipped notes.

**Sent to the step:**

> 1. A
>
> Stop between notes. Notes already written stay written. The note in flight finishes its atomic write. Touch no further notes and roll nothing back. Log the committed and skipped note locators to stderr. Record this in spec Clarifications. That entry is the Constitution Principle IV authorisation for the partial outcome, because a cancelled request has no response payload to carry it.
> Rationale: BI-0165 A3 / Part 1 'cancel a slow call' says a running call's work is stopped and the queue proceeds, so B does not match. C adds rollback, which no source asks for.

## 6. pre-implementation / clarify (2026-10-27T13:59:33.156Z)

**Question (verbatim):**

> ## Question 2: Orientation text when tools are filtered out
>
> **Context**: FR-027 requires the orientation text to carry a task-to-tool routing guide and cross-cutting rules. Those rules name specific tools, for example "preview a find-and-replace before committing it", "the vault-listing tool lists vault names" and "the help tool holds long reference". FR-043/FR-044 let the owner hide tools through read-only mode, an allow list or a deny list. In the graph, `createServer()` (`src/server.ts`) calls every `createXTool()` factory and `assertToolDocsExist()` on the boot spine. That means the registered set is fully known at boot, before the instructions are published. If the text names a hidden tool, the model may try to call a tool that does not exist, which is a protocol-level unknown-tool error under FR-016.
>
> **Recommended:** Option B. The model is never pointed at a tool it cannot call. The text is still built once at boot, so the length and 512-character tests stay deterministic: pin them against the full, unfiltered text, which is the longest case.
>
> | Option | Description |
> |--------|-------------|
> | A | One fixed text for every configuration. It may mention tools that the configuration hides. |
> | B | Build the text at boot from the registered set. The standalone opening stays fixed; routing-guide lines and rules that name a tool are left out when that tool is not registered. |
> | C | A fixed text written so it names no individual tool, using task terms only (e.g. "preview bulk replaces before committing"). The routing guide is dropped. |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> 2. B
>
> Build the orientation text once at boot from the registered tool set. Keep the first 512 characters fixed so they read correctly on their own and name no tool that can be hidden. Leave out any routing-guide line or cross-cutting rule that names a tool the current configuration hides. Pin the length test and the 512-character test against the full, unfiltered text. Add one test: in read-only mode the text names no write tool.
> Rationale: BI-0165 B2 requires the routing guide and the tool-naming rules, which rules out C. Under B3, hidden tools are not registered, so text that names them (A) would send the model to unknown-tool errors.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`: Appended a footer HTML comment recording the clarification: instructions are built at boot from the registered set, the opening stays fixed, lines naming hidden tools are left out, and tests pin the unfiltered text.

**Sent to the step:**

> 2. B
>
> Build the orientation text once at boot from the registered tool set. Keep the first 512 characters fixed so they read correctly on their own and name no tool that can be hidden. Leave out any routing-guide line or cross-cutting rule that names a tool the current configuration hides. Pin the length test and the 512-character test against the full, unfiltered text. Add one test: in read-only mode the text names no write tool.
> Rationale: BI-0165 B2 requires the routing guide and the tool-naming rules, which rules out C. Under B3, hidden tools are not registered, so text that names them (A) would send the model to unknown-tool errors.

## 7. pre-implementation / clarify (2026-10-27T14:00:30.987Z)

**Question (verbatim):**

> ## Question 3: How wide is the passthrough tool's default block?
>
> **Context**: FR-010 blocks, by default, commands that run arbitrary code, drive developer tooling, install/enable/disable plugins, or restart Obsidian. `obsidian_exec` takes the command name in its own `command` field (`src/tools/obsidian_exec/schema.ts:6`), with arguments in `parameters`, so the gate can match on that field alone. In the graph, `obsidian_exec` is its own community: `createServer()` → `createObsidianExecTool()` → `registerTool()` / `executeObsidianExec()`. The gate therefore sits in that handler and not in the shared `invokeCli` dispatch, as FR-013 requires. Two gaps remain. (1) The Obsidian CLI's `command id=<id>` runs any command-palette command, including plugin commands that execute user JavaScript (e.g. Templater user scripts). (2) `plugin:reload` reloads plugin code. The research note (remove-open-eval.md) proposed an allowlist of safe commands; the release brief lists a fixed denylist.
>
> **Recommended:** Option B. It closes the obvious indirect code-execution path (palette commands into script-running plugins) and the reload variant, while keeping the brief's denylist model and one opt-in flag. Option C would block many harmless commands today and need upkeep whenever the CLI adds commands.
>
> | Option | Description |
> |--------|-------------|
> | A | Denylist exactly as briefed: `eval`, `dev:*`, `devtools`, plugin install/enable/disable, `restart`. Command-palette execution and `plugin:reload` stay allowed. |
> | B | The briefed denylist, plus `command` (command-palette execution) and `plugin:reload`. The same single opt-in flag re-enables all of them. |
> | C | Allowlist: only an enumerated set of known-safe CLI commands runs by default; everything else needs the opt-in flag. |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: scope: BI-0165 C2 lists the blocked commands exactly. Adding `command` (all palette commands) and `plugin:reload` widens the default block past that list, though it fits the 'no code execution' story.):

> 3. B
>
> Recommended, pending owner ruling. Block by default: `eval`, `dev:*`, `devtools`, plugin install/enable/disable, `restart`, plus `plugin:reload` and `command` (command-palette execution). Match on the `command` field in the `obsidian_exec` handler only. One `OBSIDIAN_MCP_ALLOW_EVAL=1` flag re-enables the whole set. Return `VALIDATION_ERROR` / `details.code: "COMMAND_BLOCKED"` naming the command. Spawn nothing.
> Rationale: The Part 1 story asks that a malicious note cannot run code through the passthrough tool. `command id=` reaches script-running plugins, and `plugin:reload` is in effect disable plus enable. But BI-0165 C2 lists the denylist exactly, and adding `command` blocks every palette command, so the owner needs to rule on it.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`

**Advisor, after the owner ruled** (escalate: none):

> 3. A
>
> Use the denylist exactly as briefed. By default, block `eval`, `dev:*`, `devtools`, plugin install/enable/disable and `restart`. Match on the `command` field inside the `obsidian_exec` handler only. Leave `command` (command-palette execution) and `plugin:reload` allowed. Record the palette-command code-execution path as an accepted residual risk in spec Assumptions or Out of Scope.
> Rationale: the owner ruled on 2026-10-28 that the BI-0165 C2 list stands unchanged. The ruling is recorded on the BI-0165 note.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`: Appended a footer HTML comment recording the 2026-10-28 ruling on how wide the C2 gate is: the denylist stays exactly as briefed, and `command` and `plugin:reload` stay allowed as an accepted residual risk.

**Owner:** choice 2 (A: denylist exactly as briefed), via ntfy, 2026-10-27T20:24:55.522Z.

**Sent to the step:**

> 3. A
>
> Use the denylist exactly as briefed. By default, block `eval`, `dev:*`, `devtools`, plugin install/enable/disable and `restart`. Match on the `command` field inside the `obsidian_exec` handler only. Leave `command` (command-palette execution) and `plugin:reload` allowed. Record the palette-command code-execution path as an accepted residual risk in spec Assumptions or Out of Scope.
> Rationale: the owner ruled on 2026-10-28 that the BI-0165 C2 list stands unchanged. The ruling is recorded on the BI-0165 note.

## 8. pre-implementation / plan (2026-10-27T20:36:50.260Z)

**Question (verbatim):**

> ## Question 1: Test-vault path in `.memory/test-execution-instructions.md`
>
> **Context**: Per `CLAUDE.md`, every live probe must follow `.memory/test-execution-instructions.md`. That file still names the authorised test vault as `C:\Marwan-Saab-ADO\Marwan at Metcash\Obsidian\TestVault-Obsidian-CLI-MCP`. The release brief says the current path is `C:\Marwan-Saab-ADO\My-Setup\My-Setup\TestVault-Obsidian-CLI-MCP`, and that I must ask before editing `.memory`. The plan's quickstart includes the A1 live probe (write a property, then `find_by_property` in the next call), plus the symlink and junction containment probes, which stage bait folders next to the vault.
>
> **Recommended:** Option A. The gate file stays the single source of truth for the probe, and the stale path cannot send a destructive probe to the wrong place.
>
> | Option | Description |
> |--------|-------------|
> | A | I update the vault path (and the bait-folder sibling location) in `.memory/test-execution-instructions.md` to `C:\Marwan-Saab-ADO\My-Setup\My-Setup\TestVault-Obsidian-CLI-MCP`, and the quickstart cites the gate file. |
> | B | Leave `.memory` untouched. The quickstart states the new path explicitly and says it overrides the gate file's path for this release. |
> | C | You update `.memory` yourself. The quickstart cites the gate file only. |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: decision: BI-0165 §0 says the owner must be asked before anyone edits `.memory`. The new path is settled, but who edits the gate file is the owner's call.):

> 1. A
>
> Recommended, pending owner permission. In `.memory/test-execution-instructions.md`, set the vault path and the bait-folder sibling location to `C:\Marwan-Saab-ADO\My-Setup\My-Setup\TestVault-Obsidian-CLI-MCP`. Make the quickstart cite the gate file only. Run no live probe until the edit lands.
> Rationale: The vault path comes from BI-0165 Part 2 §0 and the My-Setup `CLAUDE.md`, where the test vault moved on 2026-10-20. The same §0 says "Ask the owner before editing `.memory`", so this edit needs the owner's OK.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`

**Advisor, after the owner ruled** (escalate: none):

> 1. A
>
> In `.memory/test-execution-instructions.md`, change the authorised vault path and the bait-folder sibling location to `C:\Marwan-Saab-ADO\My-Setup\My-Setup\TestVault-Obsidian-CLI-MCP`. Change nothing else in the file. Have the quickstart cite only the gate file. Run live probes (A1, symlink, junction) only after that edit has landed.
> Rationale: the owner gave permission on 2026-10-28, which is the approval BI-0165 Part 2 §0 requires. The ruling is recorded on the BI note.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`: Added a footer HTML comment recording the owner's 2026-10-28 approval for the agent to update the `.memory` test-vault path. The quickstart cites only the gate file, and no probe runs before the edit.

**Owner:** choice 1 (A: agent updates .memory), via ntfy, 2026-10-27T20:38:00.392Z.

**Sent to the step:**

> 1. A
>
> In `.memory/test-execution-instructions.md`, change the authorised vault path and the bait-folder sibling location to `C:\Marwan-Saab-ADO\My-Setup\My-Setup\TestVault-Obsidian-CLI-MCP`. Change nothing else in the file. Have the quickstart cite only the gate file. Run live probes (A1, symlink, junction) only after that edit has landed.
> Rationale: the owner gave permission on 2026-10-28, which is the approval BI-0165 Part 2 §0 requires. The ruling is recorded on the BI note.

## 9. pre-implementation / plan (2026-10-27T20:38:14.206Z)

**Question (verbatim):**

> ## Question 2: The new vault-listing tool's name vs ADR-010
>
> **Context**: ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand), rule 1: "Single-word upstream subcommand → tool name equals the upstream subcommand name verbatim". The new tool wraps the CLI's single-word `vaults` subcommand (`obsidian vaults verbose`) one-to-one, so ADR-010 would name it `vaults`. The name `list_vaults` is already used by the brief (B4), the ratified constitution v1.6.0 (Sync Impact Report B4 line), the shipped stub `docs/tools/list_vaults.md`, the help index `docs/tools/index.md:18` and the `docs/tools/help.md:65` example. ADR-010 makes the name a plan-time Constitution Compliance row; an `N` needs a Complexity Tracking entry. CLAUDE.md requires surfacing ADR conflicts rather than overriding them silently. The plan currently records ADR-010 = N with a provisional Complexity Tracking entry. This blocks PR 5 only.
>
> **Recommended:** Option A. Every existing reference, and the constitution you ratified, already says `list_vaults`, and 'list' states the read-only intent plainly. The deviation stays recorded in the plan.
>
> | Option | Description |
> |--------|-------------|
> | A | Keep `list_vaults` as a one-off deviation from ADR-010, recorded in this plan's Complexity Tracking. No ADR change. |
> | B | Keep `list_vaults` and amend ADR-010's scope (rule 3) to exempt vault and workspace enumeration tools. Short ADR amendment in PR 5. |
> | C | Rename to `vaults` to comply with ADR-010. PR 5 renames the stub doc, the help index and the example, and spec/constitution wording is corrected to `vaults`. |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: conflict: BI-0165 B4 and the ratified constitution v1.6.0 name the tool `list_vaults`. ADR-010 requires `vaults` and calls out the `list_` prefix as an example of what it forbids. Choosing between them means either following the ADR or recording a deviation from it.):

> 2. C
>
> Recommended, pending owner ruling. Name the tool `vaults`, following ADR-010 rule 1 (single-word upstream subcommand, used verbatim). In PR 5, rename the stub doc `docs/tools/list_vaults.md` → `docs/tools/vaults.md` and update the help index and the `help.md` example. Correct the spec, the B2 instructions text and the README wording to `vaults`. Mark the ADR-010 row Y; no Complexity Tracking entry is needed.
> Rationale: ADR-010 names `list_files` → `files` as the case it exists to prevent ("forbids wrapper-invented affixes"). `list_vaults` wraps `obsidian vaults` one-to-one. BI-0165 B4 and constitution v1.6.0 say `list_vaults`, so the sources disagree.

Sources: `200-Decisions/ADR-010 - Typed Tool Names Mirror Upstream CLI Subcommand.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`, `210-Guidelines/Best Practices.md`

**Advisor, after the owner ruled** (escalate: none):

> 2. C
>
> Name the tool `vaults`. Drop `list_vaults` everywhere. In PR 5:
> - Rename stub `docs/tools/list_vaults.md` → `docs/tools/vaults.md`.
> - Update `docs/tools/index.md:18` and the `docs/tools/help.md:65` example.
> - Change the spec, B1 annotation table, B2 instructions text, README and env-var docs wording to `vaults`.
>
> Set the ADR-010 plan row to Y. Delete the provisional Complexity Tracking entry. Constitution v1.6.0 Sync Impact Report mentions `list_vaults`. Correct it via the A2 amendment PR, or flag it to the owner if that PR has already merged.
>
> Rationale: Owner ruled 2026-10-28 to follow ADR-010 rule 1 (`obsidian vaults` → `vaults`; no wrapper-invented `list_` affix). Ruling recorded on the BI-0165 note.

Sources: `200-Decisions/ADR-010 - Typed Tool Names Mirror Upstream CLI Subcommand.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`: Appended footer HTML comment recording 2026-10-28 ruling: tool named `vaults` per ADR-010, superseding all `list_vaults` mentions in the note. Flags the Architecture page's `list_vaults` mention as a follow-up for when B4 ships.

**Owner:** choice 1 (C: rename to vaults (ADR-010)), via ntfy, 2026-10-27T20:39:44.340Z.

**Sent to the step:**

> 2. C
>
> Name the tool `vaults`. Drop `list_vaults` everywhere. In PR 5:
> - Rename stub `docs/tools/list_vaults.md` → `docs/tools/vaults.md`.
> - Update `docs/tools/index.md:18` and the `docs/tools/help.md:65` example.
> - Change the spec, B1 annotation table, B2 instructions text, README and env-var docs wording to `vaults`.
>
> Set the ADR-010 plan row to Y. Delete the provisional Complexity Tracking entry. Constitution v1.6.0 Sync Impact Report mentions `list_vaults`. Correct it via the A2 amendment PR, or flag it to the owner if that PR has already merged.
>
> Rationale: Owner ruled 2026-10-28 to follow ADR-010 rule 1 (`obsidian vaults` → `vaults`; no wrapper-invented `list_` affix). Ruling recorded on the BI-0165 note.

## 10. pre-implementation / analyze (2026-10-27T20:47:24.224Z)

**Question (verbatim):**

> ## Specification Analysis Report
>
> | ID | Category | Severity | Location(s) | Summary | Recommendation |
> |----|----------|----------|-------------|---------|----------------|
> | C1 | Inconsistency | HIGH | spec.md FR-049; research.md R12; tasks.md T077, T080 | FR-049 requires the 'client cannot confirm' refusal to happen before any Obsidian process starts. T080 asks for confirmation after the commit re-scan, but `find_and_replace` first resolves the vault by running a CLI eval (`FOCUSED_VAULT_TEMPLATE`, handler.ts:187) or a registry probe (`resolveVaultRootOrRemap`, :216). In the unavailable case a process would already have started. | Split the step in two. Check the capability at handler entry, before vault resolution, and return `CONFIRMATION_UNAVAILABLE`. Ask the human only after the re-scan. Add `call.canConfirm()` to the T077 call context, and add a T080 test that the spawn function is never called in the unavailable case. Update R12 and data-model §8 to match. |
> | C2 | Inconsistency | HIGH | spec.md FR-039; research.md R6; tasks.md T066, T068 | FR-039 says every tool whose result is a structured object MUST publish an `outputSchema`. R6 and T066 allow union-of-objects tools (`search`, `find_and_replace`) to go without one if the 2025-era codec wraps them. That would break the spec's MUST, although the constitution only says SHOULD. | Amend FR-039 to allow documented exceptions where a published schema would make `structuredContent` differ between protocol eras, with each exception listed in the PR. Or decide now to publish unions regardless of era differences. |
> | U1 | Underspecification | MEDIUM | tasks.md T024, T036, T074 | T024 says to pass the environment through the server ctx "as the tests already do", but `createServer`'s ctx has no `env` field today. Only `deps.env` exists, in `_dispatch.ts` and `find_and_replace`. T036 also relies on a queue factory being injectable through ctx, which it is not. | Add an explicit sub-step to T024 to add `ctx.env` to the `createServer` ctx, and to T036 to add a `ctx.createQueue` test seam (or assert by spying on the module), noting the kernel-node touch. |
> | U2 | Underspecification | MEDIUM | tasks.md T009 | The metadata refresh after each `find_and_replace` write goes through `invokeCli` and so through the single-flight queue. If it is called inside the `queue.run(() => writeAtomic(...))` callback (handler.ts:650), the queue deadlocks. | Make T009 say: call the refresh after the queued write's promise resolves, outside the queue task, and add a test that a commit of 2 notes finishes. |
> | D1 | Constitution | MEDIUM | tasks.md (new files) | Principle V requires an attribution header on every source file. Only T038, T053 and T078 mention `// Original — no upstream.`. New files `src/server.protocol.test.ts`, `src/tools/_surface.test.ts`, `src/tools/vaults/*`, `src/instructions/instructions.test.ts` and `src/tools/_confirm.test.ts` do not. | Add a Notes line saying every new file, tests included, carries the Original header. Add it to T036, T047, T054 and T063. |
> | A1 | Ambiguity | MEDIUM | spec.md SC-006, US6 #2; tasks.md T058 | "Two reads in one turn run in parallel" depends on the client and is not deterministically testable. Only a manual check in Claude Code covers it. | Restate SC-006 as checkable server facts (every read tool has `readOnlyHint: true` and `destructiveHint: false`), keeping the Claude Code check as supporting evidence. |
> | T1 | Terminology | LOW | spec.md FR-036 vs data-model §6, contracts | The spec says openness is reported as "unknown"; the data model and contracts use `open: null`. | Add "(`open: null`)" to FR-036. |
> | T2 | Inconsistency | LOW | spec.md FR-043; research.md R4 | FR-043 says to accept "the same truthy values as the server's existing on/off settings", but the only existing setting (`OBSIDIAN_AUTO_LAUNCH`) defines a disable set (`0/false/no/off`), not a truthy set. | Reword FR-043 to say "1, true, yes or on, case-insensitive, mirroring `OBSIDIAN_AUTO_LAUNCH`'s off set". |
> | T3 | Terminology | LOW | spec.md (orientation text) vs plan, research, tasks (instructions) | The same concept is called two names. | Add one parenthetical to spec FR-025: "(published as the server `instructions`)". |
>
> **Coverage Summary Table** (groups; every key has ≥ 1 task):
>
> | Requirement Key | Has Task? | Task IDs | Notes |
> |-----------------|-----------|----------|-------|
> | FR-001–FR-005 (metadata refresh) | Yes | T004–T010 | U2 |
> | FR-006–FR-009 (containment) | Yes | T011–T013 | |
> | FR-010–FR-013 (passthrough gate) | Yes | T020–T026 | |
> | FR-014–FR-018 (both eras) | Yes | T029–T038, T042 | U1 |
> | FR-019–FR-024 (titles, annotations) | Yes | T045–T047 | |
> | FR-025–FR-028, FR-026a (instructions) | Yes | T051, T053–T055, T065 | T3 |
> | FR-029–FR-032 (descriptions) | Yes | T048–T052 | |
> | FR-033–FR-034 (surface gate) | Yes | T031–T032, T039–T040, T056, T070 | |
> | FR-035 (Windows CI) | Yes | T014–T015 | |
> | FR-036–FR-038 (vaults) | Yes | T061–T065 | T1 |
> | FR-039–FR-042 (typed results) | Yes | T066–T070 | C2 |
> | FR-043–FR-046 (restricted modes) | Yes | T074–T076 | T2 |
> | FR-047–FR-050, FR-049a (confirmation) | Yes | T077–T081 | C1 |
> | FR-051–FR-055, FR-052a (cancel, progress) | Yes | T082–T088 | |
> | FR-056–FR-059 (cross-cutting, ADRs) | Yes | T041, T057, T092, per-PR docs-as-code | |
> | SC-001–SC-014 | Yes | T010, T013, T026, T042, T047, T052, T054, T058, T015, T075, T079–T080, T082–T084, T071, T092–T093 | A1 |
>
> **Constitution Alignment Issues:** D1 (Principle V headers on new files). PR-3 keeps description stripping inside the new adapter (T031). That is existing non-conformance pending C1, permitted by Governance → Adoption of v1.6.0; it is not new. T043 records it as "N/A (pending C1)".
>
> **Unmapped Tasks:** none. T001–T003, T016–T019, T027–T028, T043–T044, T059–T060, T072–T073 and T089–T094 are lifecycle, release or governance tasks tied to the PR scheme.
>
> **Graph check (optional analyze rule):** no BI has landed since the plan-time queries (HEAD unchanged at `b5d5fb9`), so the kernel-node claims still hold. `UpstreamError` is not touched; `createServer`, `createQueue` and `createLogger` touches are as declared.
>
> **Metrics:**
> - Total requirements: 62 FRs (FR-001–FR-059 plus FR-026a, FR-049a, FR-052a) and 14 SCs
> - Total tasks: 94
> - Coverage: 100% (requirements with ≥ 1 task)
> - Ambiguity count: 1
> - Duplication count: 0
> - Critical issues count: 0
>
> **Next Actions:**
> - There are no CRITICAL issues, so `/speckit-implement` may proceed. Fix C1 and C2 before PR-5 and PR-6 respectively. They do not block PR-0 through PR-4.
> - C1: edit research R12, data-model §8 and tasks T077/T080 by hand (capability check at entry, prompt after the scan).
> - C2: re-run `/speckit-specify` refinement (or edit FR-039 by hand) to allow era-difference exceptions, or rule that unions are always published.
> - U1, U2, D1: edit tasks T024, T036, T009 and the Notes section by hand.
> - A1, T1–T3: small wording edits in spec.md.
>
> Would you like me to suggest concrete remediation edits for the top 6 issues (C1, C2, U1, U2, D1, A1)?

**Advisor** (escalate: none):

> Yes. Apply all nine remediations now, before `/speckit-implement`. Per-ID directives below.
>
> - **C1.** Do the two-step split. `call.canConfirm()` goes in the T077 context. The capability check runs at `find_and_replace`/`delete` handler entry, before vault resolution. If elicitation is unavailable, return `CONFIRMATION_UNAVAILABLE` and spawn nothing. The human prompt comes only after the commit re-scan. Add a T080 test that the spawn function is never called. Update R12 and data-model §8 to match. This follows the B3 ruling: refuse before any change.
> - **C2.** FR-039 stays a MUST, with no era exceptions. Publish unions-of-objects (`search`, `find_and_replace`) as a root `type: "object"` schema wrapping the variants, so the schema is valid in both eras. Fix R6 and T066 to match. If a tool truly cannot carry an identical schema across eras, stop and raise it; do not exempt it silently. Source: BI-0165 B5.
> - **U1.** Add explicit sub-steps: `ctx.env` on `createServer` (T024) and a `ctx.createQueue` test seam (T036). Declare both kernel-node touches.
> - **U2.** In T009, call the refresh after the queued write's promise resolves, outside the `queue.run` callback. Add a test that a 2-note commit completes.
> - **D1.** Add a Notes rule: every new file, tests included, carries `// Original — no upstream. <intent>.` Add it to T036, T047, T054, T063 and the `src/tools/vaults/*` tasks. Source: Constitution Principle V.
> - **A1.** Restate SC-006 as server facts: every read tool publishes `readOnlyHint: true` and `destructiveHint: false`, pinned by the B1 classification test. Keep the manual Claude Code parallel-read check as release evidence, per BI §7.
> - **T1, T2, T3.** Use the suggested wording as is. FR-036 gets "(`open: null`)". FR-043 gets "1, true, yes or on, case-insensitive, mirroring `OBSIDIAN_AUTO_LAUNCH`'s off set". FR-025 gets "(published as the server `instructions`)".
> - **Constitution note.** C1 is now decided (descriptions now, union later). Change T043 from "N/A (pending C1)" to: stripping stays in PR 3, PR 4 removes it per the C1 ruling, and the ADR superseding ADR-005 is due in PR 4.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`: Appended a footer HTML comment recording two analyze clarifications. B5 outputSchema stays a MUST: unions are published as a root-object schema, with no blanket exception. B3 refusal is two-step: capability check at entry before vault resolution, human prompt after the re-scan.

**Sent to the step:**

> Yes. Apply all nine remediations now, before `/speckit-implement`. Per-ID directives below.
>
> - **C1.** Do the two-step split. `call.canConfirm()` goes in the T077 context. The capability check runs at `find_and_replace`/`delete` handler entry, before vault resolution. If elicitation is unavailable, return `CONFIRMATION_UNAVAILABLE` and spawn nothing. The human prompt comes only after the commit re-scan. Add a T080 test that the spawn function is never called. Update R12 and data-model §8 to match. This follows the B3 ruling: refuse before any change.
> - **C2.** FR-039 stays a MUST, with no era exceptions. Publish unions-of-objects (`search`, `find_and_replace`) as a root `type: "object"` schema wrapping the variants, so the schema is valid in both eras. Fix R6 and T066 to match. If a tool truly cannot carry an identical schema across eras, stop and raise it; do not exempt it silently. Source: BI-0165 B5.
> - **U1.** Add explicit sub-steps: `ctx.env` on `createServer` (T024) and a `ctx.createQueue` test seam (T036). Declare both kernel-node touches.
> - **U2.** In T009, call the refresh after the queued write's promise resolves, outside the `queue.run` callback. Add a test that a 2-note commit completes.
> - **D1.** Add a Notes rule: every new file, tests included, carries `// Original — no upstream. <intent>.` Add it to T036, T047, T054, T063 and the `src/tools/vaults/*` tasks. Source: Constitution Principle V.
> - **A1.** Restate SC-006 as server facts: every read tool publishes `readOnlyHint: true` and `destructiveHint: false`, pinned by the B1 classification test. Keep the manual Claude Code parallel-read check as release evidence, per BI §7.
> - **T1, T2, T3.** Use the suggested wording as is. FR-036 gets "(`open: null`)". FR-043 gets "1, true, yes or on, case-insensitive, mirroring `OBSIDIAN_AUTO_LAUNCH`'s off set". FR-025 gets "(published as the server `instructions`)".
> - **Constitution note.** C1 is now decided (descriptions now, union later). Change T043 from "N/A (pending C1)" to: stripping stays in PR 3, PR 4 removes it per the C1 ruling, and the ADR superseding ADR-005 is due in PR 4.
