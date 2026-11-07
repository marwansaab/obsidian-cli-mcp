# Relay digest: speckit-bugfix

| | |
|---|---|
| Run | `obsidian-cli-mcp-bugfix-bi-0195-2026-11-07` |
| Project | obsidian-cli-mcp-bugfix (pack speckit-bugfix) |
| Status | running |
| Started | 2026-11-07T04:15:56.590Z |
| Finished | not yet |
| Elapsed | 46 min 33 s |
| Questions | 3 (2 needed the owner) |
| Requests to the advisor | 2 (0 needed the owner) |
| Escalations | 2 |
| Edits by the advisor | 3 |

## Inputs

- `job_id`: BI-0195
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

### checks (`1f920391-99a6-45a8-8e97-06a00fef9548`)

- Condition `file-exists` (start_when): met. C:\Github\obsidian-cli-mcp\.claude\skills\speckit-bug-assess\SKILL.md exists.

- **preflight**: done.

> Primed for BI-0195 — Classify Smart Connections Similar Embedding And Stale Index Failures.
> Read: BI, Constitution (v1.5.1), Architecture, ADR-014 (and its 2026-11-01 amendment from ADR-045), ADR-015.
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.
>
> Readiness checks:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` has `vault_id` = `my-setup`, which equals `expected_vault_id`. All five session-start reads done (MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault).
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0195 - Classify Smart Connections Similar Embedding And Stale Index Failures.md`.
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `planned` (not finished or abandoned).
> 5. Variant: PASS. `bug-fix`.
> 6. Prompt section: PASS. There is no "/speckit-bug-assess prompt" section. A "/speckit-specify prompt" section is present and describes the expected behaviour. Note left unchanged.
> 7. Clarify skill: loaded (`anthropic-skills:speckit-clarify-skill`, ref "BI-0195 - Classify Smart Connections Similar Embedding And Stale Index Failures").
>
> Scope notes for the developer agent:
> - Two defects. (1) A source note with no embedding yet returns the raw `Invalid vector input to nearest()` error. It should be typed as `SOURCE_NOT_INDEXED`. (2) A stale index entry with an empty path fails the whole call (`envelope-parse`). That entry should be skipped.
> - On 2026-11-05 the owner approved widening the job: skipping stale entries also applies to `smart_connections_query`.
> - The leaked script in `details.argv` is BI-0197, not this job.
> - Outcomes for plugin not installed, not ready, and non-Markdown source must stay unchanged (ADR-014 order of checks).


### assess (`b35b0ace-2f13-4b39-8e80-f9685a730f3a`)

- **branch**: done, 4 turns.

> Working tree was clean. Fetched origin; main already up to date with origin/main (78f732c). No fix/bi-0195 branch existed locally or on origin. Created and checked out fix/bi-0195 from main. No other changes made.

- **bug-assess**: done, 43 turns.

> Wrote .specify/bugs/bi-0195/assessment.md (slug user-provided as BI-0195, lowercased to bi-0195). Verdict valid, severity medium. Nothing was re-run live; root causes come from our code and the Smart Connections 4.7.2 plugin source in the test vault. Defect 1: smart_connections_similar's Stage 5 checks only that the plugin has an entry for the source, then calls find_connections; the plugin's nearest() throws 'Invalid vector input to nearest()' when the note has no vector yet, and the throw surfaces as a generic CLI_REPORTED_ERROR. Proposed fix: also report SOURCE_NOT_INDEXED when src.vec is not an array or typed array, reusing the existing mapping. Defect 2: both Smart Connections templates pass empty-keyed (stale) candidates through, and the empty path fails matchEntrySchema's .md rule at envelope-parse. Proposed fix: one shared filter in _smart-connections.ts, applied before SORT_SLICE_AND_EMIT. The assessment records two open questions to settle before the fix: Q1, which stale entries to drop (recommended A: keep only paths that are existing Markdown notes); Q2, owner approval under refactor-decisions item 5 for field-only test-stub edits (vec on stubbed sources, plus vault lookup in stubs if Q1=A). Also recommends an ADR-014 amendment line and notes that test-execution-instructions.md wrongly says the test vault has no plugins. No kernel nodes touched, no new error codes, no published-surface change. No extension hooks registered. Next: /speckit-bug-fix slug=bi-0195.

- **resolve-assessment**: in progress, 2 turns, 3 questions.

> Assessment verdict is valid (severity medium), and the remediation is a repair: it restores the documented SOURCE_NOT_INDEXED outcome and stops one stale entry from failing the whole call, with no new error code and no change to the published surface. No escalation needed. Three items need answers before the fix: one [NEEDS CLARIFICATION] in Reproduction and open questions Q1 and Q2.


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

- **BI-0195 (dry run: no): resolve-assessment question needs you (decision)** (advisor, 2026-11-07T04:22:39.985Z): Option A's 'catch both cases' would filter stale entries that keep their old path from smart_connections_query. That reverses BI-0074's Q2 decision (stale deleted-file paths are passed through verbatim, no existence check), and the 2026-11-05 widening of BI-0195 only cited the empty-path entry. Only the owner can say whether BI-0195 replaces that pass-through.
  - Choices: 1. Filter both; drop Q2 pass-through; 2. Filter old paths in similar only; 3. Empty-path only; keep Q2 as is
  - Answer: choice 2 (Filter old paths in similar only) via cli
- **BI-0195 (dry run: no): resolve-assessment question needs you (decision)** (advisor, 2026-11-07T04:59:02.627Z): The project rule reserves edits to existing tests for the owner, and no owner ruling covers these stub edits. The recommendation is A minus the query stub edit, which Question 2's ruling made unnecessary.
  - Choices: 1. Approve, similar stubs only; 2. Approve all edits as written; 3. Decline: use try/catch instead
  - Answer: choice 1 (Approve, similar stubs only) via cli

## Edits made by the advisor

| File | Change | Triggered by |
|---|---|---|
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0195 - Classify Smart Connections Similar Embedding And Stale Index Failures.md` | Appended to Status the 2026-11-07 owner ruling 'Filter old paths in similar only': similar leaves out empty-path and old-path stale entries; query leaves out only empty-path entries, and the BI-0074 Q2 pass-through stands. | assess / resolve-assessment: Question 1 of 3 — [NEEDS CLARIFICATION] in Reproduction: Can a moved or deleted note leave stale Sma |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0195 - Classify Smart Connections Similar Embedding And Stale Index Failures.md` | Frontmatter updated: 2026-11-05 → 2026-11-07. | assess / resolve-assessment: Question 1 of 3 — [NEEDS CLARIFICATION] in Reproduction: Can a moved or deleted note leave stale Sma |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0195 - Classify Smart Connections Similar Embedding And Stale Index Failures.md` | Appended to Status the 2026-11-07 owner ruling 'Approve, similar stubs only': field-only `vec` and `getAbstractFileByPath` stub edits in the two smart_connections_similar test files; query test untouched; no assertion, title or spawn-count changes; stop and go to the owner if any other test fails. | assess / resolve-assessment: Question 3 of 3 — Open question Q2: May the fix make field-only edits to existing test stubs (owner  |

## Files

- Q&A log: `relay-qa-log.md`
- Run state: `C:\Marwan-Saab-ADO\My-Setup\Relay\.relay\runs\obsidian-cli-mcp-bugfix\obsidian-cli-mcp-bugfix-bi-0195-2026-11-07`
