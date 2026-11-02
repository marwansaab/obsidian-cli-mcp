# Relay digest: speckit

| | |
|---|---|
| Run | `obsidian-cli-mcp-bi-0167-2026-11-02` |
| Project | obsidian-cli-mcp (pack speckit) |
| Status | running |
| Started | 2026-11-02T04:31:49.866Z |
| Finished | not yet |
| Elapsed | 14 min 46 s |
| Questions | 2 (0 needed the owner) |
| Requests to the advisor | 2 (0 needed the owner) |
| Escalations | 0 |
| Edits by the advisor | 0 |

## Inputs

- `job_id`: BI-0167
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
- `live_vault`: TestVault-Obsidian-CLI-MCP
- `obsidian_bin`: C:\Users\sirzi\AppData\Local\Programs\Obsidian\Obsidian.com

## Sessions and steps

### checks (`dd0a5910-c90a-49c6-bf2c-63ee3dd72182`)

- Condition `file-exists` (start_when): met. C:\Github\obsidian-cli-mcp\.specify exists.

- **preflight**: done.

> Primed for BI-0167 — Apply Smart Connections Query Limit After Tie Break Sort.
>
> Readiness summary:
> - Vault identity: `000-Meta/Vault Identity.md` vault_id = `my-setup`, which matches expected_vault_id `my-setup`. PASS. Session-start reads done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault.
> - Note: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0167 - Apply Smart Connections Query Limit After Tie Break Sort.md`. Found. PASS.
> - Title: "BI-0167 — Apply Smart Connections Query Limit After Tie Break Sort".
> - Initiative: `[[Obsidian CLI MCP]]`. PASS.
> - Status: `planned` (not finished or abandoned). PASS. Tier must-fix-bug, variant bug-fix.
> - "/speckit-specify prompt" section is present and starts with `/speckit-specify Stabilise query ordering` (dash form). PASS.
> - Clarify skill: `anthropic-skills:speckit-clarify-skill` loaded with "BI-0167 - Apply Smart Connections Query Limit After Tie Break Sort". PASS.
>
> Read: the BI, the Constitution (v1.5.1), the Architecture (Canonical contracts and Design-shaping constraints), the feature page Smart Connections Query (FEAT-015), and BI-0110's status (shipped, same slice-before-sort class). ADRs checked by targeted search: ADR-013, ADR-014, ADR-015, ADR-045, ADR-046, ADR-052.
> Background for the questions: FEAT-015 says the wrapper passes `filter: {limit}` into the plugin's `lookup`, then sorts by score desc, path asc, headingPath asc, then caps. So the plugin itself may cut tied entries before the wrapper's tie-break runs. Expect questions about over-fetching, and about whether `smart_connections_similar` shares the same step (the BI's out-of-scope note says to check it and fix it in the same change if it does).
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.


### pre-implementation (`1186435d-bf55-4cd5-8066-ba24363077c5`)

- Condition `shell-exit-0` (run_when): met. "node -e "process.exit('' === '' ? 0 : 1)"" exited 0.

- **specify**: done, 15 turns.

> I wrote the spec for 085-stabilise-query-ordering. The mandatory before_specify hook created the branch, and .specify/feature.json now points at the new spec folder.
>
> What the code shows: smart_connections_query asks the Smart Connections plugin for exactly `limit` matches. The plugin cuts that list itself before the tool applies the documented score/path/headingPath sort. So when scores tie at the cut, the plugin decides which match survives, not the documented tie-break.
>
> The spec has two stories:
> - P1: a smaller limit returns the first N results of a larger limit.
> - P2: equal scores come back in the documented tie-break order.
>
> It has 10 functional requirements. The key ones:
> - FR-002: the set of candidates that gets sorted must not depend on `limit`, and must hold at least 100.
> - FR-009: the tool description and the help page must say the limit is applied after sorting.
>
> Schemas, score values, the default and maximum limit, and error codes stay as they are.
>
> The spec has no [NEEDS CLARIFICATION] markers, and every quality-checklist item passes. One question is left for the plan: whether the plugin can return its full candidate list. It is recorded in Assumptions.
>
> Out of scope: smart_connections_similar has the same limit-before-tie-break step and needs its own backlog item.
>
> I skipped the optional after_specify hooks (git commit, agent-context update), so nothing has been committed. Next step is /speckit-clarify or /speckit-plan.

- **clarify**: done, 15 turns, 1 questions.

> Clarification for spec 085 is finished. I asked one question; the answer was Option A, a fixed fetch of 100 candidates. I found no other ambiguity big enough to ask about.
>
> Changes to specs/085-stabilise-query-ordering/spec.md:
> - Added a Clarifications section (Session 2026-11-02).
> - FR-002 now says every call asks the plugin for exactly 100 candidates, then sorts them, then cuts to `limit`.
> - FR-009 now also requires the help page to say that equal-score matches at the plugin's 100th place are ranked by the plugin.
> - FR-010(c) now tests that the plugin request always asks for 100.
> - Edge Cases: the candidate-edge entry was rewritten, and a new one covers non-finite scores shrinking the list.
> - Key Entities: the Candidate set definition was updated.
> - Assumptions: the open question about the plugin's full list was replaced by the decision.
>
> The quality checklist still passes 16/16 with no regressions. I updated its note on the candidate-set decision.
>
> Every coverage category is now Clear or Resolved; none is Outstanding or Deferred.
>
> I skipped the optional before/after git commit hooks, so nothing is committed. Next step is /speckit-plan.

- **plan**: done, 36 turns.

> The plan for 085-stabilise-query-ordering is written. Nothing is committed yet.
>
> New files in specs/085-stabilise-query-ordering/:
> - plan.md: every Constitution Check gate is Y or N/A, with no Complexity Tracking entry. The CodeGraph structural check found no kernel-node touch.
> - research.md: findings F1–F6, decisions D1–D4, and one follow-up.
> - data-model.md
> - contracts/ordering-contract.md: template rows T1–T9 and surface rows S1–S3.
> - quickstart.md
>
> The core change:
> - `schema.ts` exports `MAX_LIMIT = 100` and uses it as the limit maximum.
> - `_template.ts` asks the plugin for `filter:{limit:${MAX_LIMIT}}` instead of the agent's limit. The existing sort and the cut to the agent's limit stay as they are.
> - A new `_template.test.ts` runs the real template under node:vm, against a stub plugin that truncates its answer and returns ties in reverse path order. Before the fix, rows T1, T2, T4 and T5 fail.
> - The tool description gets one leading-slice sentence, which moves only this tool's descriptionFingerprint, so the baseline is regenerated. The help page gets the same guarantee plus the 100th-candidate edge.
> - `CHANGELOG.md` gets an entry.
>
> The handler, its payload and the existing tests are unchanged. The follow-up is smart_connections_similar, which has the same defect.
>
> Hooks:
> - The optional git commit hooks were skipped.
> - The mandatory agent-context hook ran, but both the PowerShell and the bash script stopped early because Python 3 with PyYAML is not installed. I made the update it was meant to make by hand: the plan pointer in CLAUDE.md now points to `specs/085-stabilise-query-ordering/plan.md`.
>
> Next step is /speckit-tasks.

- **tasks**: done, 8 turns.

> I wrote specs/085-stabilise-query-ordering/tasks.md. It has 19 tasks, T001–T019, all in the checklist format with an ID, a story label where needed and file paths.
>
> | Phase | Tasks | What |
> |---|---|---|
> | Setup | T001 | Record a green starting point |
> | Foundational | T002–T003 | `MAX_LIMIT` in `schema.ts`, and proof that the published schema does not move |
> | US1 (P1, MVP) | T004–T012 | 9 tasks; see below |
> | US2 (P2) | T013–T014 | Tie-break rows T3, T4, T7, plus a red check that reverts the fix and restores it |
> | Polish | T015–T019 | CHANGELOG, full gate, CodeGraph structural verification, optional read-only live check, and a note on the smart_connections_similar follow-up |
>
> The nine US1 tasks:
> - the vm template test harness with rows T1, T2, T5, T6, T8 and T9;
> - a red proof against the unfixed template;
> - the one-line fix in the template;
> - the S1 and S2 text assertions;
> - the description sentence and the help page edits;
> - the baseline regeneration, where only one fingerprint may change.
>
> Tasks that can run in parallel: T008, T010 and T015.
>
> How each story is tested on its own:
> - US1: `npx vitest run src/tools/smart_connections_query`, with T1, T2, T5, T6, T8, T9, S1 and S2 passing.
> - US2: rows T3, T4 and T7 pass in `_template.test.ts`.
>
> I ran the CodeGraph pair check. It confirmed that the baseline regeneration must come after the description edit (T009 before T011) and that `MAX_LIMIT` must land before the template work. Both orderings are in the task graph.
>
> I skipped the optional git hooks, so nothing is committed. Next step is /speckit-analyze or /speckit-implement.

- **analyze**: done, 28 turns, 1 questions.

> I applied the analysis fixes to the spec-085 documents. The analysis found no CRITICAL or HIGH issues, so every edit below comes from the MEDIUM and LOW findings or from the scope exception you allowed. No source code changed, and nothing is committed.
>
> **Scope exception applied: smart_connections_similar is now in scope.** Research had already confirmed it has the same slice-before-sort step: `_template.ts:29` asks the plugin with `find_connections({limit:a.limit})` and only then sorts and slices. Under BI-0167's note it is now fixed together with the query tool, for that one step only. Its target resolution, self-exclusion, lifecycle checks and errors stay as they are. Scoring and the default and maximum limit stay unchanged for both tools.
>
> What changed for that:
> - **spec.md**: a new clarification bullet records the scope decision. The context, US1 (new scenario AS4), US2 and the edge cases (the source note's own blocks can shrink the list) now cover both tools. FR-001–FR-010 now apply per tool.
> - **research.md**: the similar-tool finding is now in scope, and a new decision D5 gives that tool its own `MAX_LIMIT`, the same template fix, a vm test, a description sentence and help-page edits. No follow-ups remain.
> - **data-model.md**: there is one `MAX_LIMIT` per tool, since one tool may not import from another. A new rule V7 says self-exclusion is unchanged.
> - **contract**: new template rows T10–T15 for the similar tool and new surface rows S4–S5 for its description and help page.
> - **plan.md**: rewritten for both tools. The Constitution Check is still all Y or N/A, and no kernel node is touched.
> - **tasks.md**: regenerated as 25 tasks, T001–T025, with matching tasks for both tools.
>
> The five analysis findings:
>
> | ID | Fix |
> |---|---|
> | I1 | Contract S3, quickstart §2 and task T017 now say the baseline diff changes exactly two fingerprints (both tools' descriptions), and that the `generatedFromBranch` / `generatedAt` metadata changing is expected. |
> | U1 | SC-005 now has a fallback, and task T025 makes recording it mandatory: verified live, or recorded as unverified with the fallback evidence. |
> | I2 | The tests now check every N < M limit pair (rows T2 and T11), not a sample. |
> | C1 | Row T4 (task T019) now repeats the call and checks the result is the same, covering US2 AS3 and SC-002. |
> | D1 | No change: FR-001 states the mechanism and FR-003 the property, so both stay. |
>
> The checklist note is updated and all 16 items still pass. Next step is /speckit-implement.

- **resolve-analysis**: in progress.

### continue

- **prepare**: not run.

### implementation

- **implement**: not run.
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
- Run state: `C:\Marwan-Saab-ADO\My-Setup\Relay\.relay\runs\obsidian-cli-mcp\obsidian-cli-mcp-bi-0167-2026-11-02`
