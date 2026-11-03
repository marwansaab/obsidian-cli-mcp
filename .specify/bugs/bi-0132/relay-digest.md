# Relay digest: speckit-bugfix

| | |
|---|---|
| Run | `obsidian-cli-mcp-bugfix-bi-0132-2026-11-04` |
| Project | obsidian-cli-mcp-bugfix (pack speckit-bugfix) |
| Status | running |
| Started | 2026-11-03T22:25:15.467Z |
| Finished | not yet |
| Elapsed | 5 min 31 s |
| Questions | 4 (0 needed the owner) |
| Requests to the advisor | 2 (0 needed the owner) |
| Escalations | 0 |
| Edits by the advisor | 0 |

## Inputs

- `job_id`: BI-0132
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

### checks (`41ffe90c-cf9a-466c-87bb-a1351cd4e2fb`)

- Condition `file-exists` (start_when): met. C:\Github\obsidian-cli-mcp\.claude\skills\speckit-bug-assess\SKILL.md exists.

- **preflight**: done.

> Primed for BI-0132 — Classify CLI Disabled Stdout As Structured Error.
>
> Readiness summary:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` → `vault_id: my-setup`, which matches `expected_vault_id` `my-setup` (CLI display name `My-Setup-Vault`). Session-start reads done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover and About This Vault, plus the per-MCP Obsidian CLI MCP Tool Notes.
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0132 - Classify CLI Disabled Stdout As Structured Error.md`. Title: "BI-0132 — Classify CLI Disabled Stdout As Structured Error".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `queued` (not finished or abandoned). It was re-validated 2026-11-03 against 0.9.0-local. Live reproduction still needs the owner to turn off Obsidian's Command line interface setting. A source check found no classifier rule for the `Command line interface is not enabled.` notice.
> 5. Variant: PASS. `variant: bug-fix`.
> 6. Prompt section: PASS. `## /speckit-specify prompt` is present and describes the expected behaviour. There is no `/speckit-bug-assess prompt` section. The note was not changed.
> 7. Clarify skill: LOADED (`anthropic-skills:speckit-clarify-skill`, ref "BI-0132 - Classify CLI Disabled Stdout As Structured Error").
>
> Read: BI, Constitution (v1.5.1, Principle IV), Architecture (error mapping, adapter R5 clause, ADR-029 cold-start retry, vault registry), ADR-007 (incl. 2026-05-07 amendment on the unprefixed `Vault not found.` signature) and ADR-015 (`details.reason` sub-discriminator; 2026-11-01 amendment per ADR-045).
> Role: BA + Solution Architect, answering for Claude Code.
> Scope notes for the fix: the BI covers every surface, not just `obsidian_exec`:
> - `obsidian_exec`
> - plain CLI-backed typed tools
> - eval-backed tools
> - the `vaults` tool and the vault-registry lookups used by named-vault writers and `query_base`
> - help and description text that names "CLI integration disabled"
>
> Match the exact upstream notice only (the BI-0173 false-positive lesson). Add no new top-level error code. BI-0174 item 3 overlaps the help-text correction and should follow this BI's outcome.
> Awaiting clarification questions.


### assess (`6e4d0ea8-7379-4b8c-8fa5-1fe0caf6a70e`)

- **branch**: done, 4 turns.

> Working tree was clean. Fetched origin; main already up to date with origin/main (ebdea19). No fix/bi-0132 branch existed locally or on origin. Created and checked out fix/bi-0132 from main. No other changes made.

- **bug-assess**: done, 30 turns.

> Assessment for BI-0132 is written to .specify/bugs/bi-0132/assessment.md. Verdict: valid, severity low. The slug came from the user and was normalised to bi-0132. Root cause: dispatchOnce in src/cli-adapter/_dispatch.ts only treats exit-0 output as a failure when a line starts with "Error:" or the no-active-file phrase. Obsidian's disabled-CLI notice has neither, so it comes back as success. From there it shows up as raw obsidian_exec output, as the note text from read, as an empty vault list (the vault-registry probe skips lines without a tab), and as an opaque eval json-parse error. Proposed fix: one new exit-0 rule in dispatchOnce, matching only when the whole trimmed stdout is the exact notice. It rejects with CLI_REPORTED_ERROR, details.reason "cli-disabled", the original notice in details.stdout and a message telling the user to turn the setting on. No new top-level error code; neither the cold-start retry nor auto-launch fires. Both facades, every typed tool and the registry get the rule automatically, and recovery needs no restart. The fix also corrects the closedVaultNote description and the 8 docs pages that wrongly name a disabled CLI as a cause of the 'Error: Command "<cmd>" not found.' failure, which means a deliberate fingerprint-baseline regeneration. The CodeGraph check found no kernel node is modified; the fix adds one new place that raises UpstreamError. Open questions are recorded with recommendations: match rule (exact whole output vs prefix), discriminator shape (details.reason vs details.code), and an owner-run live check. The notice wording comes from a single 2026-05-30 probe and is not recorded anywhere in the repo. No extension hooks are registered for bug-assess. Next step: /speckit-bug-fix slug=bi-0132.

- **resolve-assessment**: in progress, 2 turns, 4 questions.

> The verdict is valid and the severity low, so no escalation on the verdict. The remediation is a repair within what BI-0132's acceptance criteria ask for: one exit-0 classification rule in dispatchOnce, a details.reason under the existing CLI_REPORTED_ERROR code, and corrections to the guidance that currently describes this failure wrongly. It adds no behaviour or public surface beyond the report, so there is no scope escalation. The assessment has four open items: one [NEEDS CLARIFICATION] under Reproduction and three Open Questions. I am asking each one below before writing them back as Resolved (Relay) and committing.


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
- Run state: `C:\Marwan-Saab-ADO\My-Setup\Relay\.relay\runs\obsidian-cli-mcp-bugfix\obsidian-cli-mcp-bugfix-bi-0132-2026-11-04`
