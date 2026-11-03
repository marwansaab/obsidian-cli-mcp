# Relay digest: speckit-bugfix

| | |
|---|---|
| Run | `obsidian-cli-mcp-bugfix-bi-0181-2026-11-03` |
| Project | obsidian-cli-mcp-bugfix (pack speckit-bugfix) |
| Status | running |
| Started | 2026-11-03T10:17:25.657Z |
| Finished | not yet |
| Elapsed | 9 min 27 s |
| Questions | 3 (0 needed the owner) |
| Requests to the advisor | 2 (0 needed the owner) |
| Escalations | 0 |
| Edits by the advisor | 4 |

## Inputs

- `job_id`: BI-0181
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

### checks (`3a718622-b411-4b38-8d59-9ed02826c60f`)

- Condition `file-exists` (start_when): met. C:\Github\obsidian-cli-mcp\.claude\skills\speckit-bug-assess\SKILL.md exists.

- **preflight**: done.

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


### assess (`b0c66d9f-5913-4b1a-beeb-685136f288dc`)

- **branch**: done, 4 turns.

> Working tree was clean. Fetched origin; main already up to date with origin/main (fast-forward no-op). No existing fix/bi-0181 locally or on origin. Created and checked out fix/bi-0181 from main. No other changes.

- **bug-assess**: done, 43 turns.

> Assessed BI-0181. Reproduced live in TestVault Sandbox (probe note cleaned up): Obsidian's metadata cache holds a `tags` list as written ("x") after a watcher parse but as "#x" after Obsidian's own frontmatter write (property:set, used by set_property) and once after computeFileMetadataAsync. Confirmed My-Setup-Vault's 11 bi-0166 notes have no '#' in file text. Root cause: find_by_property/_template.ts compares with strict === and read_property/handler.ts returns the cached value verbatim. Proposed fix: strip one leading '#' on `tags` only, in the template (both sides) and in read_property's returned value; documented form without '#'; update descriptions/docs, regenerate fingerprint baseline, add a node:vm template test. Verdict valid, severity high. No kernel-node touch. Wrote .specify/bugs/bi-0181/assessment.md (uncommitted). No bug-assess hooks registered.

- **resolve-assessment**: in progress, 2 turns, 3 questions.

> Assessment verdict is valid (severity high). The remediation is a repair within the report's scope: tags-only normalisation on the read and compare sides, plus the description and doc text the report's "documented form" criterion needs. There are no [NEEDS CLARIFICATION] items. The Open Questions section holds three provisional decisions, asked here for confirmation before they are recorded as Resolved (Relay).


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

None.


## Edits made by the advisor

| File | Change | Triggered by |
|---|---|---|
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0181 - Normalise Tag Hash Prefix In Property Tools.md` | Added a ## Clarifications section before ## Related, recording the Q1 answer (tags reported and compared without a leading #) and the cache-state cause the developer agent reported (property:set gives the #-prefixed form). | assess / resolve-assessment: Question 1 of 3 — Which form should `read_property` return `tags` values in, and which form should ` |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0181 - Normalise Tag Hash Prefix In Property Tools.md` | Set frontmatter updated to 2026-11-03. | assess / resolve-assessment: Question 1 of 3 — Which form should `read_property` return `tags` values in, and which form should ` |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0181 - Normalise Tag Hash Prefix In Property Tools.md` | Appended the Q2 answer to ## Clarifications: normalisation applies only to the exact key `tags` (case-sensitive), for list elements and a scalar string; recorded the developer agent's probe evidence. | assess / resolve-assessment: Question 2 of 3 — Which property keys should the `#` normalisation apply to? |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0181 - Normalise Tag Hash Prefix In Property Tools.md` | Appended the Q3 answer to ## Clarifications: strip exactly one leading # on both the cached value and the query, matching the tag tool's rule. | assess / resolve-assessment: Question 3 of 3 — How many leading `#` characters should be stripped from a tag value? |

## Files

- Q&A log: `relay-qa-log.md`
- Run state: `C:\Marwan-Saab-ADO\My-Setup\Relay\.relay\runs\obsidian-cli-mcp-bugfix\obsidian-cli-mcp-bugfix-bi-0181-2026-11-03`
