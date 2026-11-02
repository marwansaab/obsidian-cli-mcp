# Relay Q&A log: speckit

Run `obsidian-cli-mcp-bi-0166-2026-11-02`, started 2026-11-02T03:34:43.499Z.

## 1. checks / preflight (2026-11-02T03:34:43.547Z)

**Question (verbatim):**

> Preflight for this Relay run of job BI-0166. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0166 in the vault.
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

> Primed for BI-0166 — Reconcile 0.9.0 Help Doc And Description Drift.
>
> Readiness summary:
> - Vault identity: PASS. `000-Meta/Vault Identity.md` → `vault_id: my-setup`, which equals the `expected_vault_id` (`my-setup`). Vault display name is `My-Setup-Vault`. All five session-start reads done (MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault), plus the per-MCP Obsidian CLI MCP Tool Notes.
> - Note found: PASS. Path `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0166 - Reconcile 0.9.0 Help Doc And Description Drift.md`, title "BI-0166 — Reconcile 0.9.0 Help Doc And Description Drift".
> - Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> - Status: PASS. `status: planned` (body re-validated 2026-10-31 against 0.9.0-local; all six drift items still present). Other fields: tier must-fix-bug, impact and value 02-medium, complexity 01-low.
> - Specify prompt: PASS. `## /speckit-specify prompt` section is present, and the prompt starts with exactly `/speckit-specify` (dash form). The 3-word prefix is "Reconcile help documentation". Note not changed.
> - Clarify skill: PASS. `anthropic-skills:speckit-clarify-skill` loaded with the reference "BI-0166 - Reconcile 0.9.0 Help Doc And Description Drift". Its answer rules (letter only, or a caveman-full directive with a 1–3 line cited rationale) apply to every question that follows.
>
> Read: BI, Constitution (vault mirror v1.5.1), Architecture (ARCH-014), Progressive Disclosure feature page (FEAT-002), ADR-005 (superseded), ADR-040 (supersedes ADR-005), and the cross-references to ADR-010 and ADR-033 that appear in the Constitution, Architecture and Tool Notes.
> Things to know for later questions:
> - ADR-040 retired schema stripping and the "call help first" sentence in 0.9.0. `help` and `docs/tools/` stay, and server `instructions` now hold the cross-cutting rules.
> - ADR-040 cites constitution v1.6.0 (MCP Tool Surface Standards), but the vault's Constitution mirror is still v1.5.1. Answers will rely on ADR-040 for the v1.6.0 tool-surface rules.
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0166 - Reconcile 0.9.0 Help Doc And Description Drift.md`, `Obsidian CLI MCP - Constitution`, `Obsidian CLI MCP - Architecture`, `Progressive Disclosure`, `ADR-005 - Token-Optimized Tool Definitions via Progressive Disclosure`, `ADR-040 - Published Parameter Descriptions and Server Instructions`, `Obsidian CLI MCP - Tool Notes`, `210-Guidelines/Best Practices.md`, `200-Decisions/Decision Log.md`, `220-Planning/Session Handover.md`, `000-Meta/About This Vault.md`, `000-Meta/MCP Tool Notes.md`

**Sent to the step:**

> Primed for BI-0166 — Reconcile 0.9.0 Help Doc And Description Drift.
>
> Readiness summary:
> - Vault identity: PASS. `000-Meta/Vault Identity.md` → `vault_id: my-setup`, which equals the `expected_vault_id` (`my-setup`). Vault display name is `My-Setup-Vault`. All five session-start reads done (MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault), plus the per-MCP Obsidian CLI MCP Tool Notes.
> - Note found: PASS. Path `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0166 - Reconcile 0.9.0 Help Doc And Description Drift.md`, title "BI-0166 — Reconcile 0.9.0 Help Doc And Description Drift".
> - Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> - Status: PASS. `status: planned` (body re-validated 2026-10-31 against 0.9.0-local; all six drift items still present). Other fields: tier must-fix-bug, impact and value 02-medium, complexity 01-low.
> - Specify prompt: PASS. `## /speckit-specify prompt` section is present, and the prompt starts with exactly `/speckit-specify` (dash form). The 3-word prefix is "Reconcile help documentation". Note not changed.
> - Clarify skill: PASS. `anthropic-skills:speckit-clarify-skill` loaded with the reference "BI-0166 - Reconcile 0.9.0 Help Doc And Description Drift". Its answer rules (letter only, or a caveman-full directive with a 1–3 line cited rationale) apply to every question that follows.
>
> Read: BI, Constitution (vault mirror v1.5.1), Architecture (ARCH-014), Progressive Disclosure feature page (FEAT-002), ADR-005 (superseded), ADR-040 (supersedes ADR-005), and the cross-references to ADR-010 and ADR-033 that appear in the Constitution, Architecture and Tool Notes.
> Things to know for later questions:
> - ADR-040 retired schema stripping and the "call help first" sentence in 0.9.0. `help` and `docs/tools/` stay, and server `instructions` now hold the cross-cutting rules.
> - ADR-040 cites constitution v1.6.0 (MCP Tool Surface Standards), but the vault's Constitution mirror is still v1.5.1. Answers will rely on ADR-040 for the v1.6.0 tool-surface rules.
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.

## 2. pre-implementation / specify (2026-11-02T03:35:26.962Z)

**Question (verbatim):**

> Return the full content of the "/speckit-specify prompt" section of job BI-0166's note, verbatim and complete, in `answer`, without the surrounding code fence. Do not edit or summarise it. If the note has no such section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-specify Reconcile help documentation
>
> ## Feature
> Every piece of reference guidance the server publishes — the help index, each tool's long-form help, and each tool's short description — names only tools that exist, shows only calls that work, and describes errors exactly as they are returned.
>
> ## Why
> After the latest release's tool renames and validation changes, the published guidance still lists removed tools, points to old tool names, shows an example call the server rejects, and describes error details that the errors do not carry. Agents rely on this guidance as their only map of the server, so each mismatch costs failed calls or error-handling code that never fires.
>
> ## User stories
> - As an agent, I want the help index to list exactly the tools the server offers, so that I never try to call a tool that does not exist.
> - As an agent, I want every description and help page to name current tools only, so that fallback and recovery advice leads to a tool I can call.
> - As an agent, I want every worked example to be a call the server accepts, so that copying an example works first time.
> - As an agent, I want each documented error detail to match the error the server actually returns, so that I can branch on it reliably.
> - As an agent, I want examples to show current validation messages and current vault names, so that the examples match what I will see.
>
> ## Acceptance criteria
>
> **Story: help index matches the server**
> - Given the server is running, when an agent asks for the help index, then the listed tools are exactly the tools the server offers, no more and no fewer.
> - Given a tool name that was removed, when an agent asks for its help, then the answer makes clear no such tool exists rather than returning a placeholder page.
>
> **Story: only current tool names**
> - Given any tool description or help page, when an agent reads it, then every tool it names is one the server currently offers.
>
> **Story: examples are valid calls**
> - Given any worked example in any help page, when it is sent to the server as written, then it passes input validation.
>
> **Story: documented errors match returned errors**
> - Given the base-creation tool rejects oversized content, an invalid name or an invalid path, when the agent compares the error to the help page, then the help page names the field that actually carries the specific reason.
> - Given a contextual search names a folder that does not exist, when the error is returned, then its message matches what that tool's help page says it will be.
>
> **Story: examples are current**
> - Given any example that shows a validation message or a vault name, when an agent reads it, then the message wording and vault name match current behaviour.
>
> ## Out of scope
> - Changing any tool's behaviour, inputs or outputs beyond what is needed to make a documented error and its real counterpart agree.
> - Adding or removing tools.
> - Rewriting help pages for style or length.
> - Re-auditing the whole surface for drift not listed here (a separate, recurring audit).

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0166 - Reconcile 0.9.0 Help Doc And Description Drift.md`

**Sent to the step:**

> /speckit-specify Reconcile help documentation
>
> ## Feature
> Every piece of reference guidance the server publishes — the help index, each tool's long-form help, and each tool's short description — names only tools that exist, shows only calls that work, and describes errors exactly as they are returned.
>
> ## Why
> After the latest release's tool renames and validation changes, the published guidance still lists removed tools, points to old tool names, shows an example call the server rejects, and describes error details that the errors do not carry. Agents rely on this guidance as their only map of the server, so each mismatch costs failed calls or error-handling code that never fires.
>
> ## User stories
> - As an agent, I want the help index to list exactly the tools the server offers, so that I never try to call a tool that does not exist.
> - As an agent, I want every description and help page to name current tools only, so that fallback and recovery advice leads to a tool I can call.
> - As an agent, I want every worked example to be a call the server accepts, so that copying an example works first time.
> - As an agent, I want each documented error detail to match the error the server actually returns, so that I can branch on it reliably.
> - As an agent, I want examples to show current validation messages and current vault names, so that the examples match what I will see.
>
> ## Acceptance criteria
>
> **Story: help index matches the server**
> - Given the server is running, when an agent asks for the help index, then the listed tools are exactly the tools the server offers, no more and no fewer.
> - Given a tool name that was removed, when an agent asks for its help, then the answer makes clear no such tool exists rather than returning a placeholder page.
>
> **Story: only current tool names**
> - Given any tool description or help page, when an agent reads it, then every tool it names is one the server currently offers.
>
> **Story: examples are valid calls**
> - Given any worked example in any help page, when it is sent to the server as written, then it passes input validation.
>
> **Story: documented errors match returned errors**
> - Given the base-creation tool rejects oversized content, an invalid name or an invalid path, when the agent compares the error to the help page, then the help page names the field that actually carries the specific reason.
> - Given a contextual search names a folder that does not exist, when the error is returned, then its message matches what that tool's help page says it will be.
>
> **Story: examples are current**
> - Given any example that shows a validation message or a vault name, when an agent reads it, then the message wording and vault name match current behaviour.
>
> ## Out of scope
> - Changing any tool's behaviour, inputs or outputs beyond what is needed to make a documented error and its real counterpart agree.
> - Adding or removing tools.
> - Rewriting help pages for style or length.
> - Re-auditing the whole surface for drift not listed here (a separate, recurring audit).

## 3. pre-implementation / clarify (2026-11-02T03:38:46.578Z)

**Question (verbatim):**

> ## Question 1: create_base validation errors
>
> **Context**: The `create_base` help page and short description say oversized content, an invalid name and an invalid base path come back as `VALIDATION_ERROR` with `details.code` (`CONTENT_TOO_LARGE` / `INVALID_NAME` / `INVALID_BASE_PATH`) and `details.reason` (`empty`, `too-long`, …). The code shows otherwise. `createCreateBaseTool` (src/tools/create_base/index.ts) registers with no `mapValidationError` hook. So the generic envelope in `registerTool` (src/tools/_register.ts:179-186) applies, and it keeps only `path`, `message` and `code: "custom"` for each issue. The specific reason survives only as a message prefix such as `details.issues[0].message = "INVALID_NAME/empty: name is empty"`. The `code` / `reason` / `field` values the schema sets are dropped. The sibling tools `prepend` (index.ts:96) and `find_and_replace` (index.ts:167) do supply a `mapValidationError` hook, and their errors carry `details.code` and `details.reason`, the ADR-015 sub-discriminator convention.
>
> **Question:** For create_base, should the help page change to describe the error as returned, or should the returned error change to carry the documented details.code and details.reason? (FR-008)
>
> **Why it matters**: The answer decides whether this item is a docs-only edit or a small, confined change to the error shape with tests, and which field agents will branch on.
>
> **Recommended:** Option B. The help page, the description, the ADR-015 convention and both sibling write tools already promise `details.code` and `details.reason`, so agents may already branch on them. Matching a message-prefix string is fragile. The change stays confined to these three rejections and adds no new error codes, which is within the spec's limit of changing only what makes a documented error agree with the real one.
>
> | Option | Description |
> |--------|-------------|
> | A | Docs only: the help page and description say the reason is in the `details.issues[].message` prefix (for example `INVALID_NAME/empty: …`). The error is unchanged. |
> | B | Error changes to match the docs: these three rejections return `details.code`, `details.reason` (where one exists) and `details.field`, as `prepend` and `find_and_replace` do. The docs are corrected only where details differ. |
> | C | Both: the error gains `details.code` / `details.reason` / `details.field` and also keeps the generic `details.issues` list. The docs describe both. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> 1. B
>
> Docs, sibling write tools (`prepend`, `find_and_replace`) and the ADR-015 `details.reason` convention already agree. Only `create_base` is out of line, because it registers no `mapValidationError` hook. The BI's cleanup constraint allows either fix. The spec's out-of-scope clause allows an error-shape change that is confined to making a documented error match the real one. Add no new codes, and add happy-path and failure tests for the three rejections (Constitution Principle II).

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0166 - Reconcile 0.9.0 Help Doc And Description Drift.md`, `ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes`, `Obsidian CLI MCP - Tool Notes`, `Obsidian CLI MCP - Constitution`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0166 - Reconcile 0.9.0 Help Doc And Description Drift.md`: Cleanup constraint, create_base bullet: added a 2026-11-02 clarification saying the errors change to carry details.code/reason/field (ADR-015, matching prepend and find_and_replace), and recording the root cause (no mapValidationError hook).

**Sent to the step:**

> 1. B
>
> Docs, sibling write tools (`prepend`, `find_and_replace`) and the ADR-015 `details.reason` convention already agree. Only `create_base` is out of line, because it registers no `mapValidationError` hook. The BI's cleanup constraint allows either fix. The spec's out-of-scope clause allows an error-shape change that is confined to making a documented error match the real one. Add no new codes, and add happy-path and failure tests for the three rejections (Constitution Principle II).

## 4. pre-implementation / clarify (2026-11-02T03:39:59.990Z)

**Question (verbatim):**

> ## Question 2: context_search missing-folder error
>
> **Context**: `context_search`'s help page (Example 4) shows the missing-folder error with top-level `message: "Error: Folder \"DoesNotExist\" not found."`. The code differs. `executeContextSearch` (src/tools/context_search/handler.ts:87) runs the `obsidian folder` probe and lets the failure through unchanged. That failure is raised by `dispatchCli`'s priority-(c) branch (src/cli-adapter/_dispatch.ts:628-640), which builds the `UpstreamError` with no `message`. So `UpstreamError` (src/errors.ts:16) falls back to the generic `"CLI bridge upstream error: CLI_REPORTED_ERROR"`. The folder text appears only in `details.message`, and `details` also carries an `argv` field that the example omits. The same help page's "Distinguishing outcomes" table and error table already tell agents to branch on `details.message.startsWith('Error: Folder ')`. Every exit-0 `Error:` failure from every CLI-backed tool returns that same generic top-level message.
>
> **Question:** For context_search's missing-folder error, should the help page change to show the generic top-level message as returned, with the folder text in details.message, or should context_search's error change so its top-level message is the CLI's folder text? (FR-009)
>
> **Why it matters**: The answer decides whether this item is a docs-only correction or a confined behaviour change with tests, and whether context_search's top-level message stays the same as every other CLI-reported error's.
>
> **Recommended:** Option A. The page's own branching guidance already points at `details.message`, which really does carry the folder text. The generic top-level message is shared by every CLI-reported error across the tools, so rewriting it for one tool would create a new inconsistency to fix the old one.
>
> | Option | Description |
> |--------|-------------|
> | A | Docs only: Example 4 shows the error exactly as returned (generic top-level message, `details.message` with the folder text, `argv` included), and the page's text matches. The error is unchanged. |
> | B | Error changes to match the docs: `context_search` re-raises the missing-folder failure with its top-level message set to the CLI's `Error: Folder "…" not found.` line. Details, code and other tools are unchanged; tests are added. |
> | C | Error changes for every CLI-reported error: the top-level message becomes the CLI's error line for all tools that use the shared CLI layer. This goes beyond the spec's out-of-scope limit. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> 2. A
>
> The BI allows either fix, but the spec's out-of-scope clause keeps behaviour changes to the minimum needed. Architecture (folder-existence two-call probe) already sets the contract: `CLI_REPORTED_ERROR` with `details.command: "folder"` passes through, and the cli-adapter surface stays frozen. Example 4 must also show `details.command: "folder"`, as Tool Notes records it.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0166 - Reconcile 0.9.0 Help Doc And Description Drift.md`, `Obsidian CLI MCP - Architecture`, `Obsidian CLI MCP - Tool Notes`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0166 - Reconcile 0.9.0 Help Doc And Description Drift.md`: Cleanup constraint, context_search bullet: added a 2026-11-02 clarification making the fix docs-only. Example 4 shows the generic top-level message, the folder text in details.message, details.command "folder" and argv.

**Sent to the step:**

> 2. A
>
> The BI allows either fix, but the spec's out-of-scope clause keeps behaviour changes to the minimum needed. Architecture (folder-existence two-call probe) already sets the contract: `CLI_REPORTED_ERROR` with `details.command: "folder"` passes through, and the cli-adapter surface stays frozen. Example 4 must also show `details.command: "folder"`, as Tool Notes records it.

## 5. pre-implementation / clarify (2026-11-02T03:40:53.989Z)

**Question (verbatim):**

> ## Question 3: automated drift checks
>
> **Context**: FR-012 currently asks only that automated checks fail when the help index lists a tool the server does not offer, or omits one it does. One check already exists: `assertToolDocsExist` (src/tools/_register.ts:277) runs at boot and fails when a registered tool has no `docs/tools/<name>.md` file. That covers "registered tool missing a page". Nothing covers the reverse (a page or index entry for a tool that is not registered), which is how `list_notes` and `search_vault` slipped through. SC-003 (no references to removed tools) and SC-004 (every worked example passes validation) would otherwise be checked once by hand during implementation. The spec's out-of-scope list puts a full re-audit of the help surface in a separate recurring audit.
>
> **Question:** Which kinds of drift should this feature's automated tests guard against permanently: only the help index and help pages against the offered tools, also every tool name mentioned in published guidance, or also every worked example passing input validation? (FR-012)
>
> **Why it matters**: The answer sets how much permanent test machinery this feature adds. Tool-name and example checks have to read Markdown help pages that use varied formats. It also decides whether SC-003 and SC-004 are enforced on every build or verified once.
>
> **Recommended:** Option A. It closes exactly the gap that let the phantom entries in, by completing the existing one-direction check. It stays within the spec's scope. The broader checks fit the separate recurring audit, where varied help-page formats can be handled deliberately rather than by a brittle parser added here. SC-003 and SC-004 are still verified once during implementation.
>
> | Option | Description |
> |--------|-------------|
> | A | Index and pages only: tests fail when the help index or the set of help pages names a tool the server does not offer, or misses one it does. Tool names and examples are verified once during implementation. |
> | B | A plus tool names: tests also fail when any tool description, parameter description, help page or validation recovery hint names a tool the server does not offer (outside explicit "no longer exists" notes). |
> | C | B plus examples: tests also extract every worked example call from every help page and fail when one presented as working does not pass its tool's input validation. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> 3. A
>
> The BI's Out of scope section moves full description and help-doc re-audits to a re-run of the BI-0122 audit pattern. Stale tool names and invalid examples already have re-runnable records in TC-00586 and TC-00587. So the only permanent guard needed here is the reverse direction of `assertToolDocsExist`. Give that guard a happy-path test and a failure test (Constitution Principle II).

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0166 - Reconcile 0.9.0 Help Doc And Description Drift.md`, `Obsidian CLI MCP - Constitution`, `Obsidian CLI MCP - Architecture`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0166 - Reconcile 0.9.0 Help Doc And Description Drift.md`: Out of scope, full re-audit bullet: added a 2026-11-02 clarification. The only permanent automated guard is help index and pages matching the registered tools. Tool names and examples are verified once and re-checked through TC-00586 and TC-00587.

**Sent to the step:**

> 3. A
>
> The BI's Out of scope section moves full description and help-doc re-audits to a re-run of the BI-0122 audit pattern. Stale tool names and invalid examples already have re-runnable records in TC-00586 and TC-00587. So the only permanent guard needed here is the reverse direction of `assertToolDocsExist`. Give that guard a happy-path test and a failure test (Constitution Principle II).

## 6. pre-implementation / analyze (2026-11-02T03:52:10.315Z)

**Question (verbatim):**

> Would you like me to suggest concrete remediation edits for the top N issues?

**Advisor** (escalate: none):

> Yes. Suggest concrete remediation edits for every CRITICAL and HIGH issue, plus any MEDIUM issue that touches FR-008, FR-009 or FR-012. Keep each edit consistent with the clarifications already given:
> - FR-008: `create_base` errors carry `details.code`, `details.reason` and `details.field`.
> - FR-009: the `context_search` fix is docs-only.
> - FR-012: the only permanent guard checks that the index and help pages match the registered tools.
> Before applying an edit that changes scope or reverses one of these answers, raise it as a question.
>
> The constitution's spec-kit workflow keeps clarifying until no underspecified items remain, and the plan must pass the Constitution Check, so fix spec gaps before `/speckit-plan`.

Sources: `Obsidian CLI MCP - Constitution`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0166 - Reconcile 0.9.0 Help Doc And Description Drift.md`

**Sent to the step:**

> Yes. Suggest concrete remediation edits for every CRITICAL and HIGH issue, plus any MEDIUM issue that touches FR-008, FR-009 or FR-012. Keep each edit consistent with the clarifications already given:
> - FR-008: `create_base` errors carry `details.code`, `details.reason` and `details.field`.
> - FR-009: the `context_search` fix is docs-only.
> - FR-012: the only permanent guard checks that the index and help pages match the registered tools.
> Before applying an edit that changes scope or reverses one of these answers, raise it as a question.
>
> The constitution's spec-kit workflow keeps clarifying until no underspecified items remain, and the plan must pass the Constitution Check, so fix spec gaps before `/speckit-plan`.

## 7. pre-implementation / analyze (2026-11-02T03:53:45.097Z)

**Question (verbatim):**

> ## Question I1: create_base short description (FR-008)
>
> **Context**: FR-008 says "The help page and short description MUST state exactly these fields" (`details.code`, `details.reason`, `details.field`). The plan (research D3, contract §6) keeps `CREATE_BASE_DESCRIPTION` (`src/tools/create_base/index.ts:11-24`) byte-stable. That constant names the codes and sub-reasons (`INVALID_BASE_PATH` with sub-reasons `empty`/`too-long`/…, `INVALID_NAME`, `CONTENT_TOO_LARGE`) but not the `details.*` field names. It is fingerprinted in `src/tools/_register-baseline.json` and asserted by `create_base/index.test.ts:95-97`. Your Q1 answer ended: "The docs change only where a detail they state differs from the result." The description states nothing that differs from the new error.
>
> **Question:** Should FR-008 be reworded so the help page names `details.code`, `details.reason` and `details.field` while the short description only has to not contradict them, or should the short description be edited to name those fields too, with the published-surface baseline regenerated on purpose?
>
> **Why it matters**: The literal FR-008 and the plan disagree; one of them must change before implementation, and option B moves a published fingerprint.
>
> **Recommended:** Option A. It matches your Q1 wording (docs change only where they differ), keeps the published surface and its fingerprint untouched, and the help page, the long reference agents read for error handling, still names all three fields.
>
> | Option | Description |
> |--------|-------------|
> | A | Reword FR-008: "The help page MUST name `details.code`, `details.reason` and `details.field` as the fields to branch on; the short description MUST NOT contradict them and changes only where a detail it states differs from the returned error." Plan, contract §6 and T028 (baseline unchanged) stay as they are. |
> | B | Keep FR-008 literal: edit `CREATE_BASE_DESCRIPTION` to say the codes arrive in `details.code` / `details.reason` / `details.field`. Run `npm run baseline:write` deliberately for that one entry. Update plan §6, contract §6, T017 and T028, and the `index.test.ts` description assertion. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> I1. A
>
> This matches the Q1 clarification recorded on BI-0166 (docs are corrected only where a detail differs). ADR-040 makes `help` the home for long-form error rosters and keeps descriptions short. The description already names the codes correctly, so the published fingerprint stays unchanged.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0166 - Reconcile 0.9.0 Help Doc And Description Drift.md`, `ADR-040 - Published Parameter Descriptions and Server Instructions`

**Sent to the step:**

> I1. A
>
> This matches the Q1 clarification recorded on BI-0166 (docs are corrected only where a detail differs). ADR-040 makes `help` the home for long-form error rosters and keeps descriptions short. The description already names the codes correctly, so the published fingerprint stays unchanged.

## 8. pre-implementation / analyze (2026-11-02T03:53:52.740Z)

**Question (verbatim):**

> ## Question C2: pinning context_search's missing-folder error (FR-009, SC-005)
>
> **Context**: After this feature, `context_search.md` Example 4 tells agents to branch on `details.command === "folder"` and `details.message`. The only test of that path, H7 in `src/tools/context_search/handler.test.ts:519-530`, asserts just `code === "CLI_REPORTED_ERROR"`. Nothing pins `details.command`, `details.message` or the generic top-level message `"CLI bridge upstream error: CLI_REPORTED_ERROR"`. Those come from `dispatchCli`'s priority (c) (`src/cli-adapter/_dispatch.ts:628-640`) and the `UpstreamError` default message (`src/errors.ts:16`). The plan lists `src/tools/context_search/**` as unchanged, and T029 enforces that. Adding assertions would be test-only (no production change, so FR-009's docs-only fix and the frozen CLI layer hold). It is a behaviour test, not a docs-drift guard, so FR-012's single permanent guard is unaffected.
>
> **Question:** Should this feature add test assertions that pin `context_search`'s missing-folder error fields (`details.command`, `details.message` and the top-level message) to what the corrected help page documents, or should FR-009 stay verified only once, by the live check and doc review?
>
> **Why it matters**: Without a pinned test, a future change to the CLI layer could silently break the branch the help page tells agents to use. That breaks SC-005, "takes the intended branch on the first try", with no failing test.
>
> **Recommended:** Option A. It costs a few assertions in test files only, keeps the fix docs-only for production code, and turns SC-005 for this error from a one-time check into a pinned contract.
>
> | Option | Description |
> |--------|-------------|
> | A | Add assertions, test files only. H7 in `context_search/handler.test.ts` additionally asserts `details.command === "folder"` and `details.message === 'Error: Folder "DoesNotExist" not found.'` (existing assertions unchanged). A new case in `context_search/index.test.ts` drives the registered tool and asserts the top-level `message` is `"CLI bridge upstream error: CLI_REPORTED_ERROR"`. Plan → Test-edit scope adds both files. The unchanged list and T029 narrow to `src/tools/context_search/{handler,index,schema}.ts`. A new task is added under US4. |
> | B | No new assertions: FR-009 stays docs-only and is verified once by contract S1 (doc review) and live check L3. The regression risk is accepted and recorded in `post-implement.md`. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> C2. A
>
> Under Constitution Principle II, tests are the only enforcement of the agent contract. Architecture (folder-existence two-call probe) already names `details.command: "folder"` as the contract. Pinning it adds no production change, so the FR-009 docs-only clarification and the frozen cli-adapter both hold.

Sources: `Obsidian CLI MCP - Constitution`, `Obsidian CLI MCP - Architecture`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0166 - Reconcile 0.9.0 Help Doc And Description Drift.md`

**Sent to the step:**

> C2. A
>
> Under Constitution Principle II, tests are the only enforcement of the agent contract. Architecture (folder-existence two-call probe) already names `details.command: "folder"` as the contract. Pinning it adds no production change, so the FR-009 docs-only clarification and the frozen cli-adapter both hold.
