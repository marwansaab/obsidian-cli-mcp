# Relay digest: speckit

| | |
|---|---|
| Run | `obsidian-cli-mcp-bi-0109-2026-10-31` |
| Project | obsidian-cli-mcp (pack speckit) |
| Status | running |
| Started | 2026-10-31T09:12:36.471Z |
| Finished | not yet |
| Elapsed | 38 min 44 s |
| Questions | 4 (1 needed the owner) |
| Requests to the advisor | 2 (0 needed the owner) |
| Escalations | 1 |
| Edits by the advisor | 3 |

## Inputs

- `job_id`: BI-0109
- `dry_run`: no
- `continue_feature`: 
- `continue_branch`: 
- `tasks_scope`: 
- `repo`: C:\Github\obsidian-cli-mcp
- `cowork_path`: C:\Marwan-Saab-ADO\My-Setup\My-Setup\My-Setup
- `initiative`: Obsidian CLI MCP
- `base_branch`: main
- `pr_check`: gh-pr-open
- `identity_note`: 000-Meta/Vault Identity.md

## Sessions and steps

### checks (`9cbb702c-c2f2-4d0a-8345-391b677203db`)

- Condition `file-exists` (start_when): met. C:\Github\obsidian-cli-mcp\.specify exists.

- **preflight**: done.

> Primed for BI-0109 — Standardise Cohort Tool Parameter Names.
> Read: BI, Constitution (v1.5.1), Architecture (ARCH-014), ADR-010, plus Tool Notes (TN-003) and the five session-start reads (MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault).
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.
>
> Preflight results:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` has `vault_id` = `my-setup`, which matches `expected_vault_id` (read via display name `My-Setup-Vault`). Session-start reads done.
> 2. Backlog note: PASS. Found at `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0109 - Standardise Cohort Tool Parameter Names.md`. Title: "BI-0109 — Standardise Cohort Tool Parameter Names".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: planned`, re-validated 2026-10-31 against 0.9.0-local. Not finished or abandoned.
> 5. Specify prompt: PASS. The `## /speckit-specify prompt` section exists. Its command starts with exactly `/speckit-specify` (dash form), followed by the three-word prefix "Align parameter names". Note not changed.
> 6. Clarify skill: loaded (`anthropic-skills:speckit-clarify-skill`, ref "BI-0109 - Standardise Cohort Tool Parameter Names"). Its answer rules (letter only, or a caveman-full directive with a cited rationale) apply to every question that follows.
>
> Context worth carrying into the questions: ADR-010 covers tool names only. This BI is about parameter names and has no governing ADR yet. The BI keeps "upstream-fidelity vs cohort consistency" as a case-by-case judgement, and the BI body sets the transition policy: accept both names for one minor version, warn at runtime, remove the old name in the next major.


### pre-implementation (`c59ff9d8-4593-4a64-bded-f41ad439737d`)

- Condition `shell-exit-0` (run_when): met. "node -e "process.exit('' === '' ? 0 : 1)"" exited 0.
- Condition `file-exists` (done_when): met. C:\Github\obsidian-cli-mcp\specs\073-align-parameter-names\tasks.md exists.

- **specify**: done, 31 turns, 1 questions.

> Spec 073-align-parameter-names now includes the answer on how the transition ends. FR-015 is a release-based trigger: old names are accepted with a deprecation notice in this release, and removal ships in the next major release as a separate follow-up feature, with no operator setting and no calendar date, per BI-0109 Impact. FR-014, User Story 2 scenarios 4–5 and SC-003 stay as the end-state contract, marked as delivered and tested by the removal follow-up. No [NEEDS CLARIFICATION] markers remain and the quality checklist passes. The optional after_specify commit hook was skipped, so nothing is committed yet. Ready for /speckit-clarify or /speckit-plan.

- **clarify**: done, 19 turns, 2 questions.

> Clarify session for spec 073 is complete: 2 questions asked and answered. Q1 (A): the deprecation notice goes in one optional result field, with the same name on find_by_property, find_and_replace and create_base, appearing identically in the text JSON and in structuredContent; the three output schemas change deliberately. Q2 (A): the convention record is a new ADR alongside ADR-010, mirrored in .docs-as-code/decisions/, with no constitution change. The edits touched Clarifications, FR-009, FR-011, FR-016, Key Entities and Assumptions. The spec quality checklist stays at 16/16. The optional before_clarify and after_clarify commit hooks were skipped, so nothing is committed yet. Ready for /speckit-plan.

- **plan**: done, 33 turns.

> Wrote the plan for 073-align-parameter-names: plan.md, research.md, data-model.md, contracts/parameter-names-contract.md and quickstart.md; CLAUDE.md now points at the new plan. Each of the three tools' zod input schemas declares both the old and the new names: validation rejects calls that send both, and a transform hands the handler new names only. A new leaf module, src/tools/_deprecated-params.ts, adds the optional result field deprecated_parameters. registerTool, error codes and CLI arguments are unchanged, so no T0 gate is needed. The constitution and ADR gates all pass, no kernel node is touched, and ADR-046 records the convention. Zod emission of both keys and of the deprecated flag was probed at plan time. The optional before_plan and after_plan commit hooks were skipped, so nothing is committed. Next: /speckit-tasks.

- **tasks**: done, 15 turns.

> Wrote specs/073-align-parameter-names/tasks.md with 34 tasks: Setup T001, Foundational T002–T003 (the _deprecated-params.ts shared module), US1 T004–T017 (new names on the three tools), US2 T018–T024 (deprecated_parameters field, registration wrappers, descriptions, old-name and conflict tests, fixtures, baseline regeneration), US3 T025–T026 (ADR-046 and its tracked mirror), and Polish T027–T034. Every task follows the checklist format. The CodeGraph pair checks are recorded in Notes. Three small fixes to the earlier documents: the fixture round-trip test is _surface.test.ts, not _register.output.test.ts (fixed in plan, research and quickstart); the handler-input deprecated_parameters list is now optional (data-model, research); and research now lists a third old-name fixture for find_and_replace. The optional before_tasks and after_tasks commit hooks were skipped, so nothing is committed. Next: /speckit-implement.

- **analyze**: done, 44 turns, 1 questions.

> Applied fixes for the four analysis findings across the spec documents; no code written, nothing committed. I1: the contract's descriptions for the new names now open with their siblings' wording, verbatim, per a new "FR-008 shared wording" table in contract §1 (case_sensitive "Match case exactly when true. Default true.", folder copied from context_search, name copied from read_property with "match", view_name copied from query_base without the length range). C1: added test task T017 in _register.test.ts that checks those openings; later tasks renumbered, 35 total. I2: spec Assumptions, plan constraints and research D3 now say FR-009 means runtime defaults and that the published default value is dropped for three keys during the transition. U1: FR-016, plan, research, data-model, quickstart and tasks now treat the vault (200-Decisions/) as the ADR's canonical location, with the repository mirror written under the placeholder ADR-NNN and a note that the vault copy is pending sync; no .decisions/ or vault writes and no constitution row. New T027 lists every place that carries the placeholder for replacement at sync. Also aligned research D2's helper signatures with T002 (low-severity I3). Four low-severity items remain open (SC-005 wording, T016 wording, typecheck missing from quickstart, assumed vault name). Next: /speckit-implement.

- **resolve-analysis**: done, 10 turns.

> Fixed all analysis findings and committed the feature folder on 073-align-parameter-names as 21a4eea (not pushed). No finding needed a product, scope or design decision, so no questions were asked. This round fixed A1 (SC-005 now measurable: one ADR table row per rename and per exception), A2 (T016 lists the full expected parameter lists and drops the line-number reference) and I4 (quickstart §1 runs npm run typecheck); U2 is moot because no task touches the vault any more. The previous round's I1, C1, I2, U1 and I3 fixes are in the same commit. The commit message follows CONTRIBUTING.md, with each finding listed by ID and severity. Left out of the commit: relay-digest.md and relay-qa-log.md (still being written by this run; they get their own commit at the end, as in 072), and CLAUDE.md plus .specify/feature.json (outside the feature folder; they only point at the 073 plan and can go in with the implement commit). No CRITICAL or HIGH finding remains open.


### continue

Skipped.

- Condition `shell-exit-0` (run_when): not met. "node -e "process.exit('' === '' ? 1 : 0)"" exited 1.

- **prepare**: skipped.

### implementation (`dfa22c7d-93fc-4ed6-a893-e8eea16f2197`)

- Condition `file-exists` (start_when): met. C:\Github\obsidian-cli-mcp\specs\073-align-parameter-names\tasks.md exists.

- **implement**: done, 153 turns.

> All 35 tasks are done and marked [X]. Seven parameters now use their family's name: find_by_property takes name, array_match and case_sensitive; find_and_replace takes case_sensitive (opposite of the old flag) and folder; create_base takes base_path and view_name. The renaming is handled by a new shared module, src/tools/_deprecated-params.ts, that imports only zod. Each tool's schema still accepts both names. A call that sends an old name and its new name together is rejected. An old-name call gets the same result plus a deprecated_parameters field. The old keys stay published, marked deprecated: true. CLI arguments are unchanged, and tests check that. Tests were added per tool for outcomes O1–O7, plus family-name and shared-wording checks in _register.test.ts and old-name typed-result fixtures. The baseline was regenerated: only those three tools' description, schema and output fingerprints moved. Docs were updated (three reference pages, the tool index, README, CHANGELOG), and an ADR copy was written under the placeholder number ADR-NNN in .docs-as-code/decisions/. typecheck, lint, build and npm test pass (3452 passed, 6 skipped). The post-implement code-structure check passed. research.md records three places where the result differs slightly from the task text: (1) pattern_search's case_sensitive description continues with ';' rather than '.', so its check uses the opening without the period; (2) a wrong type or empty value on an old key is reported at the old key's path, as the tasks specified; (3) when create_base is missing both name and base_path it now reports only 'name is required'. research.md also lists every place the ADR-NNN placeholder must be replaced at vault sync. The optional live check (T035) was skipped. The optional commit hooks were skipped, so nothing is committed or pushed.

- **open-pr**: in progress.

### review

- **code-review**: not run.
- **fix**: not run.

### docs

- **document**: not run.

### record

- **record-in-vault**: not run.

## Escalations

- **BI-0109 (dry run: no): clarify question needs you (decision)** (advisor, 2026-10-31T09:19:22.496Z): The BI asks only for a "contract document". Recording it as an ADR creates a new decision, which only you can make. ADR numbering has also drifted: the vault's highest ADR is ADR-037 and the repo mirror's is ADR-045, so the number needs your allocation.
  - Choices: 1. A: new ADR, no constitution row; 2. B: maintainer page only, no ADR; 3. C: ADR plus constitution row
  - Answer: choice 1 (A: new ADR, no constitution row) via cli

## Edits made by the advisor

| File | Change | Triggered by |
|---|---|---|
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0109 - Standardise Cohort Tool Parameter Names.md` | Appended 2026-10-31 HTML-comment clarification: transition end is release-based (removal in next major, separate follow-up BI); post-transition criterion specified here, delivered by follow-up. | pre-implementation / specify: Question 1: How the transition period ends |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0109 - Standardise Cohort Tool Parameter Names.md` | Appended 2026-10-31 HTML-comment clarification: deprecation notice is one optional, same-named field in the result object (text = structuredContent), with the rationale for rejecting the second text block and _meta. | pre-implementation / clarify: **Question 1 — Where does the deprecation notice go in a successful response?** |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0109 - Standardise Cohort Tool Parameter Names.md` | Appended 2026-10-31 HTML comment recording the owner ruling: the convention record is a new ADR (sibling of ADR-010) mirrored in .docs-as-code/decisions/, with no constitution row. ADR number is still unallocated because the vault (037) and repo (045) have drifted. | pre-implementation / clarify: **Question 2 — Where does the naming convention record live?** |

## Files

- Q&A log: `relay-qa-log.md`
- Run state: `C:\Marwan-Saab-ADO\My-Setup\Relay\.relay\runs\obsidian-cli-mcp\obsidian-cli-mcp-bi-0109-2026-10-31`
