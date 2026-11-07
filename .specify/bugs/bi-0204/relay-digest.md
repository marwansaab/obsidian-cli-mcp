# Relay digest: speckit-bugfix

| | |
|---|---|
| Run | `obsidian-cli-mcp-bugfix-bi-0204-2026-11-07` |
| Project | obsidian-cli-mcp-bugfix (pack speckit-bugfix) |
| Status | running |
| Started | 2026-11-07T00:48:50.117Z |
| Finished | not yet |
| Elapsed | 8 min 27 s |
| Questions | 0 (0 needed the owner) |
| Requests to the advisor | 2 (0 needed the owner) |
| Escalations | 0 |
| Edits by the advisor | 0 |

## Inputs

- `job_id`: BI-0204
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

### checks (`ec34eff3-9dcb-400b-889f-d78376bfca19`)

- Condition `file-exists` (start_when): met. C:\Github\obsidian-cli-mcp\.claude\skills\speckit-bug-assess\SKILL.md exists.

- **preflight**: done.

> Primed for BI-0204 — Reject Note Paths As Pattern Search Folders.
>
> All preflight checks pass.
>
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` → `vault_id: my-setup`, which equals `expected_vault_id: my-setup` (vault display name `My-Setup-Vault`). Session-start reads done: MCP Tool Notes index, Obsidian CLI MCP - Tool Notes, Best Practices, Decision Log, Session Handover, About This Vault.
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0204 - Reject Note Paths As Pattern Search Folders.md`. Title: "BI-0204 — Reject Note Paths As Pattern Search Folders".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: queued`, meaning the owner has not triaged it yet. The work is not finished or abandoned. Carrying on.
> 5. Variant: PASS. `variant: bug-fix`.
> 6. Prompt section: PASS. The note has no "/speckit-bug-assess prompt" section, but it does have a "/speckit-specify prompt" section. That section describes the expected behaviour: a note path given as `folder` fails with a "file, not a folder" error that names the path; the containing folder still returns its match; a missing folder still gets the same "folder not found" error; and `pattern_search` and `context_search` reject a note path in the same recognisable way. Out of scope: a single-note scope, how `"/"` is handled, and changes to the literal search or listing tools. Note not changed.
> 7. Clarify skill: PASS. `anthropic-skills:speckit-clarify-skill` is loaded with "BI-0204 - Reject Note Paths As Pattern Search Folders".
>
> Read: BI-0204, TC-00906 (evidence: 0.9.0 returns `{"count":0,"matches":[]}` for `folder` = a note path), Constitution v1.5.1 (Principle IV: no silent empty result), Architecture (folder-existence two-call probe), ADR-071 (meaning of `NOT_A_FOLDER`; disk `stat` check shared with `paths`/`pattern_search`), ADR-015 (sub-discriminators).
> Role: BA + Solution Architect, answering for the developer agent.
> Awaiting clarification questions.


### assess (`158cf12c-dda7-4d21-869c-7f344f60ad22`)

- Condition `file-exists` (done_when): met. C:\Github\obsidian-cli-mcp\.specify\bugs\bi-0204\assessment.md exists.

- **branch**: done, 4 turns.

> The working tree was clean. I fetched origin, and main was already level with origin/main, so the fast-forward changed nothing. No branch named fix/bi-0204 existed locally or on origin, so I created it from main and checked it out. Nothing else was changed.

- **bug-assess**: done, 21 turns.

> Slug: bi-0204 (taken from the job's slug=BI-0204 and lower-cased). I wrote the assessment to .specify/bugs/bi-0204/assessment.md. The report is valid and I rated it medium severity. The cause is in src/tools/pattern_search/_template.ts:8-9: the template only checks that the folder exists (stat() is not null) and never checks that it is a folder. A note path passes that check, the filter on paths starting with folder + "/" then keeps no notes, and the search returns an empty result. Two read-only CLI probes on the test vault confirm it: stat on a note returns {"type":"file"}, and the folder probe that context_search runs answers `Error: "Welcome.md" is a file, not a folder.` The proposed fix copies the type check that paths already makes and reuses its NOT_A_FOLDER error code, so no new error code is needed. The error message will contain the CLI's own "is a file, not a folder" phrase, and the existing FOLDER_NOT_FOUND error stays exactly as it is. The tool's published description and schemas do not change, and the fix touches none of the kernel nodes. There are no open questions and no bug-assess hooks are registered. I did not commit anything. The next step is /speckit-bug-fix slug=bi-0204.

- **resolve-assessment**: done, 7 turns.

> The assessment is settled and committed as fe204f0 on fix/bi-0204 (not pushed). The verdict is valid and the severity medium. The cause is in src/tools/pattern_search/_template.ts:8: the template only checks that the scope folder exists. A note's stat() is not null (its type is "file"), so a note path passes the check. The filter on paths starting with folder + "/" then finds no notes, and the search reports {count:0, matches:[]}. The fix is a plain repair, with nothing that would need to go back to the full spec-kit workflow. The template rejects any path that is not a folder with NOT_A_FOLDER, the error code paths and move already use (ADR-071). The eval envelope's failure branch is widened to allow it. The handler raises CLI_REPORTED_ERROR with details {code:"NOT_A_FOLDER", folder, stage}, and its message carries the CLI's "is a file, not a folder" phrase so pattern_search fails the same way context_search does. The existing FOLDER_NOT_FOUND error is left exactly as it is. No new error code is added, the published surface does not change and no kernel node is touched. The files that change are the template, schema and handler, their three test files and docs/tools/pattern_search.md. The assessment raised no open questions and no [NEEDS CLARIFICATION] items, so I asked the owner nothing. I recorded a "Resolved (Relay):" note saying so in the Open Questions section. The commit covers the whole .specify/bugs/bi-0204 folder, as the step asked: assessment.md plus the relay-digest.md and relay-qa-log.md files Relay had already placed there.


### repair (`ed4d8ff1-c3bc-42c4-ab91-a79b975f38a8`)

- Condition `ready-to-implement` (start_when): met. C:\Github\obsidian-cli-mcp\.specify\bugs\bi-0204\assessment.md exists, and Obsidian has TestVault-Obsidian-CLI-MCP focused.

- **bug-fix**: done, 37 turns.

> Applied the bi-0204 fix (slug passed explicitly). The pattern_search template now checks the folder's stat().type and answers NOT_A_FOLDER for a note path. The envelope schema accepts that code, and the handler raises it as CLI_REPORTED_ERROR with details { code: NOT_A_FOLDER, folder, stage: handler-stage-3 } and a message containing '"<path>" is a file, not a folder'; the FOLDER_NOT_FOUND error is unchanged. Added template, handler and schema tests and updated docs/tools/pattern_search.md. pattern_search tests (74) and the full suite (5114 passed, 6 skipped) pass, and tsc and eslint are clean. The fingerprint baseline did not move, no new error code was added, and no kernel node was touched. One departure, recorded in fix.md: the assessment assumed a template test for the missing-folder case already existed; none did, so one was added. No existing test was edited. No bug-fix hooks are registered. Nothing is committed yet. fix.md is written with status 'applied'. Next step: /speckit-bug-test slug=bi-0204.

- **bug-test**: done, 13 turns.

> Verified bi-0204 (slug passed explicitly). I ran the rebuilt handlers against the live TestVault-Obsidian-CLI-MCP through the real CLI. pattern_search with a note path as folder (TC-00906 Repro1106/single.md and a fresh Sandbox note) now fails with CLI_REPORTED_ERROR / details.code NOT_A_FOLDER, naming the path. The containing folder still returns the match, a missing folder still gives FOLDER_NOT_FOUND unchanged, and context_search fails with the same 'is a file, not a folder' phrase, so criteria 1–4 all hold. Whole-vault scope is unchanged. The pattern_search suite (74), full suite (5114 passed, 6 skipped), tsc and eslint are all clean. The Sandbox fixture was cleaned up and Welcome.md was not touched. Residual risk: context_search's details shape differs from pattern_search's; aligning it is out of scope. test.md is written with result 'verified'.

- **settle-verdict**: done, 2 turns.

> test.md says 'verified', so no extra round was needed. All four acceptance criteria held against the live test vault, and the full test suite, type check and lint passed. Ready to open the pull request.

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

None.

## Files

- Q&A log: `relay-qa-log.md`
- Run state: `C:\Marwan-Saab-ADO\My-Setup\Relay\.relay\runs\obsidian-cli-mcp-bugfix\obsidian-cli-mcp-bugfix-bi-0204-2026-11-07`
