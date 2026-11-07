# Relay digest: speckit-bugfix

| | |
|---|---|
| Run | `obsidian-cli-mcp-bugfix-bi-0195-2026-11-07` |
| Project | obsidian-cli-mcp-bugfix (pack speckit-bugfix) |
| Status | running |
| Started | 2026-11-07T04:15:56.590Z |
| Finished | not yet |
| Elapsed | 1 h 3 min |
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

- Condition `file-exists` (done_when): met. C:\Github\obsidian-cli-mcp\.specify\bugs\bi-0195\assessment.md exists.

- **branch**: done, 4 turns.

> Working tree was clean. Fetched origin; main already up to date with origin/main (78f732c). No fix/bi-0195 branch existed locally or on origin. Created and checked out fix/bi-0195 from main. No other changes made.

- **bug-assess**: done, 43 turns.

> Wrote .specify/bugs/bi-0195/assessment.md (slug user-provided as BI-0195, lowercased to bi-0195). Verdict valid, severity medium. Nothing was re-run live; root causes come from our code and the Smart Connections 4.7.2 plugin source in the test vault. Defect 1: smart_connections_similar's Stage 5 checks only that the plugin has an entry for the source, then calls find_connections; the plugin's nearest() throws 'Invalid vector input to nearest()' when the note has no vector yet, and the throw surfaces as a generic CLI_REPORTED_ERROR. Proposed fix: also report SOURCE_NOT_INDEXED when src.vec is not an array or typed array, reusing the existing mapping. Defect 2: both Smart Connections templates pass empty-keyed (stale) candidates through, and the empty path fails matchEntrySchema's .md rule at envelope-parse. Proposed fix: one shared filter in _smart-connections.ts, applied before SORT_SLICE_AND_EMIT. The assessment records two open questions to settle before the fix: Q1, which stale entries to drop (recommended A: keep only paths that are existing Markdown notes); Q2, owner approval under refactor-decisions item 5 for field-only test-stub edits (vec on stubbed sources, plus vault lookup in stubs if Q1=A). Also recommends an ADR-014 amendment line and notes that test-execution-instructions.md wrongly says the test vault has no plugins. No kernel nodes touched, no new error codes, no published-surface change. No extension hooks registered. Next: /speckit-bug-fix slug=bi-0195.

- **resolve-assessment**: done, 22 turns, 3 questions.

> The BI-0195 assessment is settled and committed on fix/bi-0195 as 9ed84eb (not pushed). No escalation was needed.
>
> Verdict valid, severity medium. The remediation is a repair: it restores the documented SOURCE_NOT_INDEXED outcome and stops one stale index entry from failing a whole call. It adds no error code, no public surface and no kernel-node change.
>
> Remediation:
> - Defect 1: in the smart_connections_similar template's Stage 5 check, also report SOURCE_NOT_INDEXED when the source note has no vector yet (src.vec is not an array or typed array). Smart Connections 4.7.2 lists a note before embedding it, and its nearest() throws when the vector is missing. The existing error mapping is reused unchanged, and there is no try/catch around the plugin call.
> - Defect 2: one filter per tool, run before the sort and the cut to limit. smart_connections_similar keeps a match only when app.vault.getAbstractFileByPath returns an existing .md note. smart_connections_query drops only empty paths and passes every non-empty path through as is.
>
> Answers recorded as 'Resolved (Relay):':
> - [NEEDS CLARIFICATION]: stale entries that keep a moved or deleted note's old path are unconfirmed live and not ruled out. Filters are sized per tool under the owner ruling of 2026-11-07, 'Filter old paths in similar only'.
> - Q1: separate filters as above. Query keeps its BI-0074 Q2 pass-through (TC-00261) and gets no .md-suffix filter.
> - Q2: field-only stub edits approved for the two similar test files only, per the owner ruling of 2026-11-07, 'Approve, similar stubs only'. That means a vec array on the stubbed sources and a getAbstractFileByPath that knows the candidate paths. smart_connections_query/_template.test.ts is not edited, and no assertion, expected value, title or spawn count may change.
>
> Remediation, Files, Tests, Risks and the CodeGraph section were updated to match. Query's new tests go in a new co-located test file, and _smart-connections.ts changes only if a helper is used. No [NEEDS CLARIFICATION] is left.
>
> The commit also includes relay-digest.md and relay-qa-log.md, which were already in the bug folder.


### repair (`a0139931-1f88-4bad-983d-e18a8d6ebcf4`)

- Condition `ready-to-implement` (start_when): met. C:\Github\obsidian-cli-mcp\.specify\bugs\bi-0195\assessment.md exists; focused TestVault-Obsidian-CLI-MCP in Obsidian (it had Game-Server-Vault focused).

- **bug-fix**: done, 50 turns.

> Applied the bi-0195 fix (slug given explicitly). smart_connections_similar now reports SOURCE_NOT_INDEXED when the plugin lists the source but has not embedded it yet. The check runs before find_connections and uses the plugin's own nearest() condition. Similar also keeps only matches whose path is a Markdown note in the vault now. smart_connections_query drops only empty-path matches, per the owner ruling. Both filters run before the sort and the cut to limit. The Q2-approved stub edits made the 16 expected failures pass (238/238). New rows: 5 lifecycle, 5 similar template, and a new 4-row query file; 11 of them fail against the pre-fix templates. Full suite: 5167 passed, 6 skipped. Typecheck, lint and build are clean; the published baseline is unchanged. The CodeGraph check held (no kernel nodes touched). The fix report is at .specify/bugs/bi-0195/fix.md, status applied. The two docs/tools help pages are left for docs-as-code. Nothing committed or pushed. Next: /speckit-bug-test slug=bi-0195.

- **bug-test**: done, 21 turns.

> Verified bi-0195 live in TestVault-Obsidian-CLI-MCP (Smart Connections 4.7.2) with this branch's built server; slug was given explicitly. Defect 1: a new note and a short note probed straight after writing gave the typed SOURCE_NOT_INDEXED naming the note. Raw plugin state was listed with no vec, and the plugin's own find_connections throws 'Invalid vector input to nearest()'. The long note returned results within about 20 s; the short note stayed SOURCE_NOT_INDEXED for 244 s. Defect 2: after moving a similar note, the plugin returned an empty-keyed candidate at index 1. smart_connections_similar left it out and succeeded with count 49, no empty paths. The query side was not exercised live: raw lookup held no empty key. Targeted suites (253), full suite (5167 passed, 6 skipped), lint, typecheck and build pass; the baseline is unchanged. Fixtures were cleaned up. Result: verified, with residual risks recorded in test.md. Nothing committed or pushed.

- **settle-verdict**: done, 2 turns.

> test.md result is verified, so no extra fix or test round ran. Both defects were re-run live in the test vault with this branch's build. An unembedded new or short source now gets the typed SOURCE_NOT_INDEXED naming the note, then results once embedded. A real empty-keyed stale entry after a move is left out by smart_connections_similar instead of failing the call. Full suite, lint, typecheck and build pass. Three gaps were covered only in-process and are recorded under Residual Risks: the pre-fix failure was not re-run on an old build, the query-side empty key was not reproduced live, and no non-empty old paths were observed. Nothing committed or pushed.

- **open-pr**: in progress.

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
