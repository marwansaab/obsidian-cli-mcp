# Relay digest: speckit-bugfix

| | |
|---|---|
| Run | `obsidian-cli-mcp-bugfix-bi-0203-2026-11-07` |
| Project | obsidian-cli-mcp-bugfix (pack speckit-bugfix) |
| Status | running |
| Started | 2026-11-06T15:56:04.672Z |
| Finished | not yet |
| Elapsed | 11 min 12 s |
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

- Condition `file-exists` (done_when): met. C:\Github\obsidian-cli-mcp\.specify\bugs\bi-0203\assessment.md exists.

- **branch**: done, 4 turns.

> The working tree was clean. After fetching origin, main already matched origin/main, so the fast-forward changed nothing. No branch named fix/bi-0203 existed locally or on origin, so I created it from main and checked it out. Nothing else was changed.

- **bug-assess**: done, 39 turns.

> Assessed BI-0203 and wrote .specify/bugs/bi-0203/assessment.md: the bug is valid, severity high. The cause is serialiseValue in src/tools/set_property/handler.ts, which joins a list with commas before sending it to the Obsidian CLI. The CLI then splits on every comma, including commas inside an item, or stores text starting with `[` (any list of links) as one quoted string. Live tests in the test vault reproduced every symptom in the report. They also showed that sending the list as a JSON array (`value=["[[A]]","[[B]]"]`) stores exactly the items sent and reads them back unchanged, so the proposed fix is the one line `JSON.stringify(value)`. No schema, published tool surface or error codes change, and no core shared components are touched. Two existing test assertions change (handler.test.ts cases 5 and 6). One open question is recorded with a recommendation: should a list sent with an explicit non-list type also go out as JSON (option A, recommended) or keep today's comma join (option B)? The test files created in the vault's Sandbox are removed, and nothing is committed yet.

- **resolve-assessment**: done, 14 turns, 1 questions.

> Assessment settled and committed on fix/bi-0203 as 7674920 (not pushed). Verdict: valid. Severity: high, because list writes report success while storing the wrong items. Cause: serialiseValue (src/tools/set_property/handler.ts:38) joins a list with commas, so the Obsidian CLI stores a list of links as one quoted value or splits items that contain a comma. Remediation, a repair with no new behaviour or published-surface change: serialiseValue(value, resolvedType) sends JSON.stringify(value) when the resolved type is list, and live probes show the CLI then stores exactly the items sent. A list sent with an explicit non-list type keeps today's output byte for byte. Existing test cases 5 and 6 change to expect the JSON form, and new cases cover the reported scenarios plus a lock that value ["a","b"] with type text is stored as the text a,b. Recorded answer: the one open question is marked "Resolved (Relay): Option B", with the owner's reasons (other property types are out of scope; FEAT-014 honours an explicit type with no silent coercion), and the remediation, tests and risks sections were updated to match. No [NEEDS CLARIFICATION] items remain. The commit also includes relay-digest.md and relay-qa-log.md from the bug folder.


### repair (`3dfdd520-ec6a-4623-b9b3-826ee483154a`)

- Condition `ready-to-implement` (start_when): met. C:\Github\obsidian-cli-mcp\.specify\bugs\bi-0203\assessment.md exists; focused TestVault-Obsidian-CLI-MCP in Obsidian (it had Game-Server-Vault focused).

- **bug-fix**: done, 29 turns.

> Fix applied for bi-0203 (slug passed in explicitly; no hooks registered before or after the fix). `serialiseValue(value, resolvedType)` in src/tools/set_property/handler.ts now sends an array whose resolved type is `list` as a JSON array (`value=["[[A]]","[[B]]"]`). The empty list is still the literal `[]`. An array sent with an explicit non-list `type` keeps today's comma-joined form, per owner ruling option B. In handler.test.ts, the two assertions the assessment approved (cases 5 and 6) were updated and 8 new cases were added: wikilink lists with and without `type`, a one-link list, an item containing a comma, JSON escaping, `type: "text"`, and the specific+file and active modes. docs/tools/set_property.md was updated: the serialisation table, Example 2, and the comma known-limitation, which the fix removes. tsc and eslint are clean, the full vitest suite passes (5079 passed, 6 skipped), and the schema fingerprint baseline is unchanged. Structural verification is recorded in fix.md: no new error codes, no imports of the DI factories, the change stays in one module, and the claim that no kernel nodes are touched held. Changes are not committed yet. Next step: /speckit-bug-test slug=bi-0203, including live-CLI checks of TC-00904 and TC-00905.

- **bug-test**: done, 12 turns.

> Verified bi-0203 (slug given explicitly; no before_bug_test or after_bug_test hooks are registered). The report is at .specify/bugs/bi-0203/test.md, result: verified. A live run drove the built handler against the real Obsidian CLI in TestVault-Obsidian-CLI-MCP/Sandbox/BI-0203-test/ and passed all 10 cases. Covered: wikilink lists with and without a type, a one-link list, an item containing a comma (TC-00904 and TC-00905), plain items, edge-case items, an explicit text type (option B, unchanged), the empty list, specific+file mode, and repair of an already damaged note. Each case was read back through read_property and from disk. A control run that sends the old comma-joined value still produces the scalar, which shows the check detects the bug. The set_property tests (73), the full suite with coverage (5079 passed, 6 skipped), typecheck, lint and build all pass. The test fixtures were cleaned up and Welcome.md is intact. Residual risk: active mode was checked only by unit tests, not live. Changes are not committed yet.

- **settle-verdict**: done, 2 turns.

> The result in test.md is verified, so no extra fix round was needed. Against the real Obsidian CLI, all 10 cases passed, including TC-00904 and TC-00905. A control that sends the old comma-joined wire form still reproduces the scalar bug. The full suite, typecheck and lint pass. Residual risks recorded in test.md: active mode was tested by unit tests only, the live run was on Windows only, and an array with an explicit non-list type is still comma-joined, which is intended under option B. Changes are not committed yet. Next: open the PR, then code review and docs-as-code.

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
- Run state: `C:\Marwan-Saab-ADO\My-Setup\Relay\.relay\runs\obsidian-cli-mcp-bugfix\obsidian-cli-mcp-bugfix-bi-0203-2026-11-07`
