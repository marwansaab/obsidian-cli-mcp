# Relay digest: speckit-bugfix

| | |
|---|---|
| Run | `obsidian-cli-mcp-bugfix-bi-0181-2026-11-03` |
| Project | obsidian-cli-mcp-bugfix (pack speckit-bugfix) |
| Status | running |
| Started | 2026-11-03T10:17:25.657Z |
| Finished | not yet |
| Elapsed | 17 min 34 s |
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

- Condition `file-exists` (done_when): met. C:\Github\obsidian-cli-mcp\.specify\bugs\bi-0181\assessment.md exists.

- **branch**: done, 4 turns.

> Working tree was clean. Fetched origin; main already up to date with origin/main (fast-forward no-op). No existing fix/bi-0181 locally or on origin. Created and checked out fix/bi-0181 from main. No other changes.

- **bug-assess**: done, 43 turns.

> Assessed BI-0181. Reproduced live in TestVault Sandbox (probe note cleaned up): Obsidian's metadata cache holds a `tags` list as written ("x") after a watcher parse but as "#x" after Obsidian's own frontmatter write (property:set, used by set_property) and once after computeFileMetadataAsync. Confirmed My-Setup-Vault's 11 bi-0166 notes have no '#' in file text. Root cause: find_by_property/_template.ts compares with strict === and read_property/handler.ts returns the cached value verbatim. Proposed fix: strip one leading '#' on `tags` only, in the template (both sides) and in read_property's returned value; documented form without '#'; update descriptions/docs, regenerate fingerprint baseline, add a node:vm template test. Verdict valid, severity high. No kernel-node touch. Wrote .specify/bugs/bi-0181/assessment.md (uncommitted). No bug-assess hooks registered.

- **resolve-assessment**: done, 9 turns, 3 questions.

> Settled the BI-0181 assessment. Verdict: valid. Severity: high. Obsidian's cache holds the tags list either as written or #-prefixed, depending on which path last updated the note (property:set adds the #). read_property returns the cached value as is, and find_by_property compares with ===, so lookups silently miss notes and give different results from call to call. Remediation, a repair within the report's scope: for the `tags` key only, strip one leading # on both sides of find_by_property's template comparison and from read_property's returned value. Add the rule to both tool descriptions and help pages, regenerate _register-baseline.json, and add a node:vm template test. No new error code, no kernel node touched. Answers recorded as Resolved (Relay): Q1=A, documented form without # (matches the file text, read and compare sides); Q2=A, exact case-sensitive `tags` key only (other properties out of scope, ADR-046's name lookup unchanged); Q3=A, exactly one leading # stripped (same rule as the tag tool). These confirmed the provisional choices, so no other section changed, and no [NEEDS CLARIFICATION] items remain. Committed .specify/bugs/bi-0181 (assessment.md plus Relay's digest and QA log) on fix/bi-0181 as 3a55525, following CONTRIBUTING.md. Not pushed.


### repair (`08cb31ac-263c-4b18-b7e1-456326d390ab`)

- Condition `ready-to-implement` (start_when): met. C:\Github\obsidian-cli-mcp\.specify\bugs\bi-0181\assessment.md exists, and Obsidian has TestVault-Obsidian-CLI-MCP focused.

- **bug-fix**: done, 56 turns.

> Applied the BI-0181 remediation; fix.md status `applied`, nothing committed. For the property `tags` only, find_by_property's comparison code (run inside Obsidian) now strips one leading `#` from both the cached value and the query, and read_property returns tags values without a leading `#`. The one-`#` rule lives in a new leaf module, src/tools/_tag-hash.ts (stripTagHash), used by read_property and the `tag` tool's schema. That schema change is beyond the assessment's file list; it is behaviour-identical and logged under Deviations. New tests: find_by_property/_template.test.ts (8 cases run under node:vm; 5 fail on the pre-fix template), 5 read_property handler cases, and _tag-hash.test.ts. Updated tool descriptions, the regenerated registration baseline (only find_by_property's schema fingerprint and read_property's description fingerprint moved), both docs/tools pages and CHANGELOG. Typecheck, lint and the full test suite (4788 passed, 6 skipped) are clean. CodeGraph checks pass, and the claim that no kernel node is touched held. The live check against the test vault is left for /speckit-bug-test. No after_bug_fix hooks are registered. Next step: /speckit-bug-test slug=bi-0181.

- **bug-test**: done, 17 turns.

> Wrote .specify/bugs/bi-0181/test.md; result `verified`. Live check in TestVault-Obsidian-CLI-MCP against a real mixed cache: Fixtures/BI-0076/closed-note.md cached as `#bi0076closed` (only read) plus a new Sandbox note cached as `bi0076closed`. Before the fix (comparison rebuilt by reversing the fix's two lines in the built template), each query found only 1 note, one per cache form. This branch's find_by_property returns both notes for `bi0076closed` (twice) and for `#bi0076closed`, and read_property returns ["bi0076closed"] for both, while the raw CLI reports `#bi0076closed` for the fixture. Obsidian's own trigger for the `#` form (property:set, computeFileMetadataAsync, processFrontMatter) did not fire this session; this is recorded as a residual risk, and the fix does not depend on it. The live run called the built handlers directly, not through an MCP client. Targeted suites (217 tests), full suite (4788 passed, 6 skipped), typecheck, lint and build pass. Sandbox restored and the fixture is unchanged; scratch scripts removed. No after_bug_test hooks registered.

- **settle-verdict**: done, 2 turns.

> Final result: `verified`, as recorded in .specify/bugs/bi-0181/test.md. No extra fix or re-test round was needed. Live check on a real mixed cache in the test vault: before the fix, each query form found only one of the two notes; after it, both forms return both notes on repeated calls, and read_property returns the written form (no `#`) for both. Full suite (4788 passed, 6 skipped), typecheck and lint pass. Recorded under Residual Risks in test.md: Obsidian's own trigger for the `#` cache form could not be reproduced on demand, so the check used a note already cached in that form; the fix does not depend on the trigger.

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
