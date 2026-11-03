# Relay digest: speckit-bugfix

| | |
|---|---|
| Run | `obsidian-cli-mcp-bugfix-bi-0185-2026-11-04` |
| Project | obsidian-cli-mcp-bugfix (pack speckit-bugfix) |
| Status | running |
| Started | 2026-11-03T21:29:09.405Z |
| Finished | not yet |
| Elapsed | 10 min 19 s |
| Questions | 4 (1 needed the owner) |
| Requests to the advisor | 2 (0 needed the owner) |
| Escalations | 1 |
| Edits by the advisor | 3 |

## Inputs

- `job_id`: BI-0185
- `dry_run`: no
- `repo`: C:\Github\obsidian-cli-mcp
- `cowork_path`: C:\Marwan-Saab-ADO\My-Setup\My-Setup\My-Setup
- `initiative`: Obsidian CLI MCP
- `base_branch`: main
- `pr_check`: gh-pr-open
- `identity_note`: 000-Meta/Vault Identity.md
- `live_vault`: TestVault-Obsidian-CLI-MCP
- `obsidian_bin`: C:\Users\sirzi\AppData\Local\Programs\Obsidian\Obsidian.com

## Sessions and steps

### checks (`5fd55aa8-fa3d-43f3-9605-57d62915d56a`)

- Condition `file-exists` (start_when): met. C:\Github\obsidian-cli-mcp\.claude\skills\speckit-bug-assess\SKILL.md exists.

- **preflight**: done.

> Primed for BI-0185 - Return Structured Error When Named Vault Folder Is Missing.
>
> Readiness summary:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` has `vault_id` = `my-setup`, which matches `expected_vault_id`. I re-checked it this turn through `My-Setup-Vault`. The session-start reads are done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover and About This Vault, plus the Obsidian CLI MCP Tool Notes.
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0185 - Return Structured Error When Named Vault Folder Is Missing.md`
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: planned`, so the work is not finished or abandoned.
> 5. Variant: PASS. `variant: bug-fix`.
> 6. Prompt section: PASS. The note has a "/speckit-specify prompt" section; it has no "/speckit-bug-assess prompt" section. The specify prompt sets out the expected behaviour: a registered vault whose folder is missing returns a structured "vault unavailable" error with a specific code and a recovery hint. The unknown-vault error stays unchanged, available vaults behave as before, and no bare system error without a code is ever returned. I did not change the note.
> 7. Clarify skill: LOADED (`anthropic-skills:speckit-clarify-skill`, reference "BI-0185 - Return Structured Error When Named Vault Folder Is Missing"). I will follow its answering rules for every question that follows.
>
> Context read for the questions to come:
> - Constitution v1.5.1, Principle IV: errors must be typed `UpstreamError` objects with `code`, `cause` and `details`; a bare `throw` is not allowed.
> - ADR-015: use a `details.reason` sub-discriminator for error codes that have several states.
> - ADR-014, amended by ADR-045: `VAULT_NOT_FOUND(not-open)` is retired, and a vault that stays unavailable comes back as `CLI_REPORTED_ERROR`.
> - Architecture, "Canonical contracts" section.
> - Tool Notes entry for this bug: `query_base` returns a raw `ENOENT` error, while `paths` already returns a structured `CLI_REPORTED_ERROR`.
>
> Role: BA + Solution Architect, answering for Claude Code. Waiting for the bug-assessment questions.


### assess (`812541b5-0627-401b-b391-b422bad71cf9`)

- **branch**: done, 4 turns.

> The working tree was clean. I fetched origin, checked out main and fast-forwarded it; it was already at origin/main. No branch named fix/bi-0185 existed locally or on origin, so I created it from main and checked it out. Nothing else was changed.

- **bug-assess**: done, 23 turns.

> I wrote the assessment for BI-0185 (slug from the user, bi-0185) to .specify/bugs/bi-0185/assessment.md. Verdict: valid. Severity: medium. Cause: checkCanonicalPath (src/path-safety/canonical.ts:59) calls realpath on a vault folder that no longer exists. The resulting ENOENT passes through assertCanonicalPath (src/tools/_active-file.ts) untyped, and registerTool rethrows anything that is not an UpstreamError, so the agent gets a free-text error with the absolute path. Eight tools are affected: query_base, create_base, find_and_replace, write_note, append_note, prepend, patch_block and patch_heading. Proposed fix: in assertCanonicalPath, turn that ENOENT into CLI_REPORTED_ERROR with details {code: "VAULT_NOT_FOUND", reason: "folder-missing", vault}, a recovery hint and no path. This follows ADR-015, adds no new code, and touches no kernel nodes. The assessment records four open questions with recommended answers: the reason literal, whether to list the new failure in the tool descriptions too (that would move the FR-018 baseline), live probes of the file-name lookups and of bases/views_base, and errors other than ENOENT. No extension hooks are registered for this step. Next step: /speckit-bug-fix slug=bi-0185.

- **resolve-assessment**: in progress, 2 turns, 4 questions.

> The assessment's verdict is valid and its severity medium. The remediation is a repair the report asks for: it maps the raw ENOENT that assertCanonicalPath lets through into a structured failure. That failure keeps the existing CLI_REPORTED_ERROR code and VAULT_NOT_FOUND discriminator and adds one new details.reason value, the extension ADR-015 allows. No escalation is needed. The assessment has four open questions, asked below one per question, each with a recommendation. Nothing is written or committed until they are answered.


### repair

- **bug-fix**: not run.
- **bug-test**: not run.
- **settle-verdict**: not run.
- **open-pr**: not run.

### review

- **code-review**: not run.
- **fix**: not run.

### docs

- **document**: not run.
- **ci**: not run.

### record

- **record-in-vault**: not run.

## Escalations

- **BI-0185 (dry run: no): resolve-assessment question needs you (conflict)** (advisor, 2026-11-03T21:37:48.630Z): BI-0185's Out of scope defers "error-roster and help wording for the new code" to BI-0174. ADR-015 (a constitution checklist gate) requires the new (code, reason) pair to be listed in each tool's docs/tools page, which help serves word for word. The owner should decide whether the roster rows ship with this fix.
  - Choices: 1. A: roster rows in this fix; 2. Defer all docs to BI-0174; 3. Stop the run
  - Answer: choice 1 (A: roster rows in this fix) via ntfy

## Edits made by the advisor

| File | Change | Triggered by |
|---|---|---|
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0185 - Return Structured Error When Named Vault Folder Is Missing.md` | Out of scope bullet narrowed to description/help wording beyond the roster rows; added the owner ruling of 2026-11-04 that the docs/tools roster row for VAULT_NOT_FOUND / folder-missing ships with this fix per ADR-015, with index.ts descriptions and the baseline unchanged. | assess / resolve-assessment: Question 2 of 4 — Where should the new failure be listed in each affected tool's error roster? |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0185 - Return Structured Error When Named Vault Folder Is Missing.md` | Frontmatter updated: 2026-11-03 → 2026-11-04. | assess / resolve-assessment: Question 2 of 4 — Where should the new failure be listed in each affected tool's error roster? |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0185 - Return Structured Error When Named Vault Folder Is Missing.md` | Appended a dated HTML audit comment recording the owner ruling on Relay clarify Q2. | assess / resolve-assessment: Question 2 of 4 — Where should the new failure be listed in each affected tool's error roster? |

## Files

- Q&A log: `relay-qa-log.md`
- Run state: `C:\Marwan-Saab-ADO\My-Setup\Relay\.relay\runs\obsidian-cli-mcp-bugfix\obsidian-cli-mcp-bugfix-bi-0185-2026-11-04`
