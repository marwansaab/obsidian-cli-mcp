# Relay digest: speckit-bugfix

| | |
|---|---|
| Run | `obsidian-cli-mcp-bugfix-bi-0203-2026-11-07` |
| Project | obsidian-cli-mcp-bugfix (pack speckit-bugfix) |
| Status | running |
| Started | 2026-11-06T15:56:04.672Z |
| Finished | not yet |
| Elapsed | 6 min 0 s |
| Questions | 1 (0 needed the owner) |
| Requests to the advisor | 2 (0 needed the owner) |
| Escalations | 0 |
| Edits by the advisor | 0 |

## Inputs

- `job_id`: BI-0203
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

### checks (`0dc4c80e-414e-45bf-954f-3bb07f8a226a`)

- Condition `file-exists` (start_when): met. C:\Github\obsidian-cli-mcp\.claude\skills\speckit-bug-assess\SKILL.md exists.

- **preflight**: done.

> Ready for BI-0203: all preflight checks pass.
>
> - **Vault identity:** pass. `000-Meta/Vault Identity.md` has `vault_id` = `my-setup`, which matches `expected_vault_id` `my-setup`. I read it through `My-Setup-Vault` just now. I also did the five session-start reads: MCP Tool Notes (index), Best Practices, Decision Log, Session Handover and About This Vault.
> - **Note:** found at `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0203 - Preserve List Items In Set Property.md`.
> - **Title:** BI-0203 — Preserve List Items In Set Property.
> - **Initiative:** pass. It is `[[Obsidian CLI MCP]]`.
> - **Status:** `queued` (awaiting owner triage). The work is not finished or abandoned, so the run carries on.
> - **Variant:** pass. It is `bug-fix` (tier `must-fix-bug`).
> - **Prompt section:** pass. The note has no "/speckit-bug-assess prompt" section, but it has a "/speckit-specify prompt" section. That section sets out the expected behaviour:
>   - Wikilink lists are stored as real YAML lists, one item per element, with or without `type: "list"`, including single-item lists.
>   - An item containing a comma stays one item.
>   - Reading the property back returns the same items in the same order.
>   - Plain-word lists are stored as before.
>   - Out of scope: repairing notes damaged by earlier writes, other property types, and removing properties.
>   - Evidence: TC-00904 and TC-00905, reproduced on the published 0.9.0.
> - **Clarify skill:** loaded (`anthropic-skills:speckit-clarify-skill`, args "BI-0203 - Preserve List Items In Set Property").
>
> Primed for BI-0203 — Preserve List Items In Set Property.
> Read: BI, Constitution (v1.5.1), Architecture (ARCH-014), the `set_property` feature page (FEAT-014), the `set_property` section of the Obsidian CLI MCP Tool Notes, and ADR mentions of `set_property` (ADR-009, ADR-010, ADR-046, ADR-056).
> Role: BA + Solution Architect, answering for the developer agent.
> Awaiting clarification questions.
>
> Observation for the assessment, not a blocker: the `set_property` feature page (FEAT-014, written at v0.4.1) lists the comma split as a known limitation ("List elements containing literal `,` characters … Fall back to `obsidian_exec`"). Its How-it-works step 5 also says a non-empty list is sent comma-joined (`value=<comma-joined>`). BI-0203 is the later note and treats both the comma split and the wikilink-list scalar as defects. That page is documentation, not an ADR or D-NN, so the BI governs, and the feature page's caveat will need revising when the fix ships.


### assess (`597a1566-8bd2-4789-99d7-8331d6e2895f`)

- **branch**: done, 4 turns.

> The working tree was clean. After fetching origin, main already matched origin/main, so the fast-forward changed nothing. No branch named fix/bi-0203 existed locally or on origin, so I created it from main and checked it out. Nothing else was changed.

- **bug-assess**: done, 39 turns.

> Assessed BI-0203 and wrote .specify/bugs/bi-0203/assessment.md: the bug is valid, severity high. The cause is serialiseValue in src/tools/set_property/handler.ts, which joins a list with commas before sending it to the Obsidian CLI. The CLI then splits on every comma, including commas inside an item, or stores text starting with `[` (any list of links) as one quoted string. Live tests in the test vault reproduced every symptom in the report. They also showed that sending the list as a JSON array (`value=["[[A]]","[[B]]"]`) stores exactly the items sent and reads them back unchanged, so the proposed fix is the one line `JSON.stringify(value)`. No schema, published tool surface or error codes change, and no core shared components are touched. Two existing test assertions change (handler.test.ts cases 5 and 6). One open question is recorded with a recommendation: should a list sent with an explicit non-list type also go out as JSON (option A, recommended) or keep today's comma join (option B)? The test files created in the vault's Sandbox are removed, and nothing is committed yet.

- **resolve-assessment**: in progress, 2 turns, 1 questions.

> The assessment's verdict is valid, severity high. The remediation is a repair, not new behaviour: it sends list values to the CLI as a JSON array instead of comma-joined text, and the published surface does not change. Nothing in the assessment is marked [NEEDS CLARIFICATION]. It has one open question, asked below, before I record the answer and commit.


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

None.

## Files

- Q&A log: `relay-qa-log.md`
- Run state: `C:\Marwan-Saab-ADO\My-Setup\Relay\.relay\runs\obsidian-cli-mcp-bugfix\obsidian-cli-mcp-bugfix-bi-0203-2026-11-07`
