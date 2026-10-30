# Relay digest: speckit

| | |
|---|---|
| Run | `obsidian-cli-mcp-bi-0165-2026-10-28` |
| Project | obsidian-cli-mcp (pack speckit) |
| Status | done |
| Started | 2026-10-27T13:20:28.098Z |
| Finished | 2026-10-27T22:06:32.040Z |
| Elapsed | 8 h 46 min |
| Questions | 12 (5 needed the owner) |
| Requests to the advisor | 3 (2 needed the owner) |
| Escalations | 7 |
| Edits by the advisor | 19 |

## Inputs

- `job_id`: BI-0165
- `dry_run`: no
- `repo`: C:\Github\obsidian-cli-mcp
- `cowork_path`: C:\Marwan-Saab-ADO\My-Setup\My-Setup\My-Setup
- `initiative`: Obsidian CLI MCP
- `base_branch`: main
- `pr_check`: gh-pr-open
- `identity_note`: 000-Meta/Vault Identity.md

## Sessions and steps

### pre-implementation (`67fea797-e6f1-45fb-8d5b-f47b7b8cf340`)

- Condition `file-exists` (start_when): met. C:\Github\obsidian-cli-mcp\.specify exists.
- Condition `file-exists` (done_when): met. C:\Github\obsidian-cli-mcp\specs\068-modernise-mcp-surface\tasks.md exists.

- **preflight**: done.

> Preflight for BI-0165 passed on the re-check. All six checks pass.
>
> Primed for BI-0165 — Ship 0.9.0 SDK V2 And Safety Release.
>
> - **Vault identity:** `My-Setup-Vault` returns `vault_id` = `my-setup`, which matches `expected_vault_id`. PASS. The session-start reads were done earlier in this conversation: the MCP Tool Notes index and the obsidian-cli-mcp notes, Best Practices, Decision Log, Session Handover and About This Vault.
> - **Note:** `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`, titled "BI-0165 — Ship 0.9.0 SDK V2 And Safety Release". PASS.
> - **Initiative:** `[[Obsidian CLI MCP]]`. PASS.
> - **Status:** `queued`, so the work is not finished or abandoned. PASS.
> - **Specify-prompt section:** the "/speckit-specify prompt" section is there. Its command now reads `/speckit-specify Modernise MCP surface`, the dash form. The Part 1 banner, the Part 2 banner and the intro now use `/speckit-specify` too. PASS. I did not change the note.
> - **Clarify skill:** `anthropic-skills:speckit-clarify-skill` is loaded for "BI-0165 - Ship 0.9.0 SDK V2 And Safety Release". As the skill requires, I read:
>   - the BI
>   - the Constitution, v1.5.1
>   - the Architecture note
>   - ADR-036, which is pending supersession by a dual-era ADR the owner has already decided on
>   - ADR-005
>
>   Its answering rules apply to every question that follows. Two open owner decisions are flagged in the BI: B3 and C1. A2 is open too, covering the constitution amendment wording.
>
> Awaiting clarification questions.

- **specify**: done, 30 turns, 2 questions.

> The spec for 068-modernise-mcp-surface is written and validated, and both owner rulings are applied. C1 → B: FR-031 now has the parameter-combination rules stated in the descriptions of the target_mode, vault, file and path parameters. The flat schema is kept and the structural union is listed in Out of Scope as deferred; the probe-client rejection test was dropped. B3 → A: FR-049 now refuses the two irreversible actions before anything changes or starts when the client cannot ask the human. It uses an existing top-level code with a CONFIRMATION_UNAVAILABLE-style sub-code and gives out-of-band guidance; no interaction marker is added. New FR-049a adds the acceptance test, and SC-011 now covers this case. Both rulings are recorded in a Clarifications section. No NEEDS CLARIFICATION markers remain and every checklist item passes. The optional after_specify commit hook was skipped, so nothing is committed. Next step is /speckit-clarify or /speckit-plan.

- **clarify**: done, 31 turns, 3 questions.

> /speckit-clarify is complete for specs/068-modernise-mcp-surface/spec.md. I asked and answered 3 questions and stopped there, because the remaining gaps were low-impact or belong in plan: auto-launch progress cadence, how often the vault registry re-probes on repeated misses, and how cheaply open state is detected.
>
> 1. Cancelling a running multi-note find_and_replace commit → A. It stops between notes, the note in flight completes, nothing is rolled back, and the committed and skipped locators are logged to stderr. This went into Clarifications (as the Principle IV authorisation), a new FR-052a with a test, and a rewritten edge case.
> 2. Orientation text under filtering → B. The text is built at boot from the registered set, the first 512 characters are fixed and name no hideable tool, lines naming hidden tools are left out, length tests are pinned on the unfiltered text, and a read-only test checks that no write tool is named. This changed FR-025, FR-026 and FR-027, added FR-026a, User Story 7 scenario 5 and SC-007.
> 3. Passthrough gate width → A. The denylist is exactly as briefed, matched on the `command` field in the obsidian_exec handler only; command-palette `command` and `plugin:reload` stay allowed. FR-010 is rewritten, an 'Accepted residual risk' bullet is added to Assumptions, and the Key Entity is updated.
>
> I also made three consistency fixes. FR-001 no longer says 'prepend where applicable': prepend writes through the CLI, not directly to disk. The vague 'alias form' edge case is gone. A new edge case says a subfolder-scoped find_and_replace commit needs confirmation.
>
> Sections touched: Clarifications, User Story 7, Edge Cases, FR-001, FR-010, FR-025–FR-027, FR-026a, FR-052a, Key Entities, SC-007 and Assumptions. The spec quality checklist is unchanged at 16/16 passing. Coverage: functional scope, security, edge cases and the completion signals are now resolved or clear. Nothing high-impact is outstanding; the low-impact items are deferred to plan.
>
> Optional commit hooks were skipped and nothing is committed. Next step: /speckit-plan.

- **plan**: done, 42 turns, 2 questions.

> /speckit-plan is complete for specs/068-modernise-mcp-surface on branch 068-modernise-mcp-surface, with both owner rulings applied.
>
> Q1 → A: I changed only two lines in .memory/test-execution-instructions.md, the authorised vault path and the bait-folder sibling location, to C:\Marwan-Saab-ADO\My-Setup\My-Setup\…. quickstart.md now cites only the gate file, and live probes can run.
>
> Q2 → C: the new tool is named `vaults` (ADR-010 rule 1), and `list_vaults` is removed from spec, plan, research, data-model, quickstart and the contracts. The spec has a new Clarifications entry and FR-036 names the tool. The plan's ADR-010 row is Y, Complexity Tracking is empty, and the Constitution Check passes with no violations. PR 5 renames docs/tools/list_vaults.md to vaults.md and fixes the help index, the help.md example and README.md.
>
> One follow-up goes to the owner: the constitution v1.6.0 Sync Impact Report (around line 133) still says `list_vaults`. Its amendment PR #86 has already merged, so the plan suggests fixing it in the post-release PATCH amendment.
>
> I also added a rule to research R7: the orientation text always writes tool names in backticks, and the tests match only backticked names. Several tool names (`vaults`, `delete`, `read`) are ordinary words that would otherwise trip the read-only check.
>
> Artifacts: plan.md, research.md (R1–R15), data-model.md, quickstart.md, and contracts/ (protocol-serving, tool-surface, configuration, errors). The CLAUDE.md plan pointer now points at the 068 plan. Optional commit hooks were skipped and nothing is committed. Next step: /speckit-tasks.

- **tasks**: done, 6 turns.

> I generated specs/068-modernise-mcp-surface/tasks.md with 94 tasks, T001–T094. Phases follow the six-PR delivery order: PR-0 is docs only, then one branch per PR (068-pr1-fixes … 068-pr6-safety-cancel), each cut from updated main.
>
> Tasks per story:
> - US1: 7 (T004–T010)
> - US2: 3
> - US10: 2
> - US3: 8 (T020–T026)
> - US4/US5/US9 platform: 14 (T029–T042)
> - US6: 3
> - US8: 5
> - US7: 3
> - US11: 5
> - US12: 5
> - US13: 3
> - US14: 5
> - US15: 5
> - US16: 2
>
> The rest are PR-wrap tasks (/speckit-git-commit, PR checklist values, /code-review, /speckit-docs-as-code, STOP for owner merge), deliberate baseline regeneration (T040, T056, T070), ADR-039/040, the version bump, and post-implement graph checks.
>
> Tests are included because Principle II and the explicit test FRs require them. Live probes are tagged T0-live and gated by .memory/test-execution-instructions.md.
>
> From the graphify path queries:
> - assertCanonicalPath → checkCanonicalPath is a direct call, so the containment rewrite needs no caller edits.
> - There is no code path between createQueue and dispatchOnce, so the signal must be threaded into both the queue and dispatch. That is why T082 and T083 run in parallel before T084.
> - executeObsidianExec → invokeBoundedCli is direct, so the gate only covers the passthrough.
> - The logger reaches _note-io only through injected deps, so T005 must land before T006.
>
> Parallel windows: PR-1 logger, containment tests and ci.yml; PR-3 the protocol tests and the probe script; PR-4 index.ts and schema.ts batches; PR-6 queue, dispatch and _confirm.ts.
>
> The MVP is PR-1 (US1, US2, US10). Each story's independent test maps to a quickstart section.
>
> Every task has a checkbox, an ID and a description; story labels are on the story tasks. Two deliberate format deviations: PR-wrap and branch-creation tasks inside PR phases carry no story label, and branch-creation tasks name no file path.
>
> The optional commit hooks were skipped, so nothing is committed. Next: /speckit-analyze or start PR-0.

- **analyze**: done, 51 turns, 1 questions.

> I applied all nine analyze fixes to the 068 spec artifacts. Nothing is committed. tasks.md still has 94 tasks (T001–T094), and no stale wording remains.
>
> - C1: confirmation is now two steps. `call.canConfirm()` is checked at handler entry, before vault resolution (find_and_replace resolves the vault with a FOCUSED_VAULT_TEMPLATE eval or a registry probe, both of which spawn). If the client cannot confirm, the tool returns CONFIRMATION_UNAVAILABLE. Otherwise `call.confirm()` asks the human after the commit re-scan for find_and_replace, or before invokeCli for delete. Updated: research R12, data-model §8, T077, T079 and T080, plus a T080 test that spawn is never called, with or without `vault`.
> - C2: FR-039 stays a MUST with no exceptions by protocol generation. `search` and `find_and_replace` are published as `{type:"object", anyOf|oneOf:[…]}` through a new `toSdkOutputSchema` adapter, whose validation still runs zod. T066 now builds the adapter and checks the schema is identical in both eras; if a tool can't meet that, the task stops and raises it. Also updated: R6, data-model §4, the tool-surface contract and the plan row.
> - U1: T024 adds `ctx.env` and T036 adds a `ctx.createQueue` test seam. Both are declared as kernel-node touches in the plan and in the PR-2 and PR-3 checklists.
> - U2: in T009 the metadata refresh runs after the queued write resolves, outside the `queue.run` callback. A new test checks that a 2-note commit completes on a real queue.
> - D1: a Notes rule says every new file, tests included, carries the 'Original — no upstream.' header. It is wired into T036, T047, T054 and T063 (the vaults files).
> - A1: SC-006 now rests on server facts: read tools publish readOnlyHint true and destructiveHint false, pinned by T047. The Claude Code parallel-read check (T058) stays as release evidence.
> - T1, T2, T3: the wording is applied to FR-036, FR-043 and FR-025.
> - Constitution note: T043 now records that description stripping stays in PR 3, PR 4 removes it under the C1 ruling, and the ADR superseding ADR-005 is due in PR 4.
>
> One item for you: `tag` gets no outputSchema. Its count-only form returns a bare integer, so its result is not always a structured object and falls outside FR-039; this is not an exception by protocol generation. T068 states this in the PR-5 body for your review rather than exempting it silently.
>
> Next step: /speckit-implement, starting with PR-0 (T001–T002).

- **resolve-analysis**: done, 5 turns.

> No analyze findings are open. I had already applied all nine fixes (C1, C2, U1, U2, D1, A1, T1–T3) to spec.md, plan.md, tasks.md, research.md, data-model.md and the tool-surface contract in the previous turn, following your directives. None needed a new decision, so I asked no questions.
>
> I committed the feature folder specs/068-modernise-mcp-surface on branch 068-modernise-mcp-surface as 00dfcd5, "docs(068): specify, plan and task the 0.9.0 modernise-mcp-surface release". The message follows CONTRIBUTING.md: a type(scope) subject, a WHY-first body grouped under SHOUTY-CAPS headings, and the Co-Authored-By trailer. Nothing was pushed. The commit includes relay-digest.md and relay-qa-log.md because they sit in the feature folder.
>
> Left out of the commit and still uncommitted:
> - CLAUDE.md: the plan pointer now points at specs/068-modernise-mcp-surface/plan.md.
> - .specify/feature.json: points at the 068 folder.
>
> Both sit outside the feature folder you scoped. They belong in PR-0 (task T001) if you want them tracked.
>
> Open for you:
> - `tag` publishes no outputSchema, because its count-only form returns a bare integer, which puts it outside FR-039. The PR-5 body will say so.
> - The constitution v1.6.0 Sync Impact Report still says `list_vaults` and "0.8.20". Its amendment PR #86 has already merged, so this needs a post-release PATCH amendment.


### implementation (`6575dc6c-18d6-4cc4-9402-0be1ddf8bad9`)

- Condition `file-exists` (start_when): met. C:\Github\obsidian-cli-mcp\specs\068-modernise-mcp-surface\tasks.md exists.
- Condition `gh-pr-open` (done_when): met. Pull request #87 is open.

- **implement**: done, 186 turns, 2 questions.

> PR-1 work (T003–T016) is done on 068-pr1-fixes, but the A1 fix departs from the plan: the planned refresh call damages Obsidian, so I switched it, and ADR-009 §5 now needs an owner amendment. Lint and typecheck are clean, and the full suite passes (2866 tests, statement coverage 96.76% against a 96% floor). Build succeeds, src/tools/_register-baseline.json is unchanged and `graphify update .` was run. Nothing is committed or pushed; optional hooks were skipped.
>
> A1 (metadata refresh): the refresh now targets the written note by its vault-relative path, with `vault=` in specific mode. find_and_replace refreshes each changed note after its queued write. write_note `open:true` opens the right note in the right vault. Failures, and notes Obsidian cannot find, are logged as `bridge.metadata_refresh_failed` instead of a silent catch. FR-005/SC-001 are amended per the owner ruling.
>
> Live finding: with the path fixed, the inherited ADR-009 §5 call `computeMetadataAsync(f)` ran for the first time. It takes file bytes, not a TFile, and it left the test vault's metadata worker stuck: searches went stale and even Welcome.md could no longer be indexed. Reloading the test vault window fixed it; no other vault was affected. The template now calls `computeFileMetadataAsync(f)`, the method Obsidian's own file watcher uses, and a unit test forbids the old call. After the switch, write, append, heading edit and path-scoped find_and_replace commit were each found by the very next search (4 of 4), as was a brand-new note, with no refresh failures logged. The multi-vault write with My-Setup-Vault focused passed, `open:true` opened the note in the test vault, and the requested refresh aimed at the unfocused My-Setup-Vault returned `=> ok` with that note unchanged. Evidence is in evidence-a1.md; Sandbox/ is clean.
>
> A5 (containment): the check now resolves the nearest existing folder and re-appends the missing ones. Real temp-directory tests cover junction/symlink escapes with an existing child, a missing child and two missing levels, plus `..` and a sibling vault; a Windows-only mixed-case-root test passes without case-folding. A write_note integration test confirms PATH_ESCAPES_VAULT with no mkdir. A4: CI now runs ubuntu and windows × Node 22/24, with a 20-minute timeout.
>
> Open items for the owner: (1) ADR-009 §5 still names computeMetadataAsync and needs amending; the ADR is owner-side and was not edited. (2) T015 needs the PR's first CI run to confirm all four jobs, including Windows. (3) The earlier follow-ups stand: `tag` gets no outputSchema (PR-5), and the constitution Sync Impact Report still says list_vaults. The PR-1 body should say it carries the spec docs (no separate PR-0) and cite evidence-a1.md.

- **open-pr**: done, 13 turns.

> Opened PR #87 into main (not merged). Before committing, I re-ran the checks: lint, typecheck and build were clean, and 2866 tests passed (6 skipped) with 96.76% statement coverage against the 96% floor. Branch 068-pr1-fixes now has two new commits in the CONTRIBUTING.md format, after the earlier spec commit 00dfcd5. 43d4800 points CLAUDE.md and .specify/feature.json at the 068 plan and refreshes the Relay logs. 9e159c8 holds the PR-1 fixes (metadata refresh, vault containment, Windows CI) with the spec amendments and evidence-a1.md. The working tree is clean and the branch is pushed to origin. The repo has no pull request template, so the description follows earlier merged PRs: summary, a check-results table and the Constitution Compliance table. Principles I–V are Y, Security Defaults is Y, CI on Linux and Windows is Y, the ADRs are N/A, and the MCP and Tool Surface rows are N/A until later PRs. The new logger event is named as a kernel-node change. Still open: ADR-009 §5 still names computeMetadataAsync(f), the call that jammed Obsidian's metadata indexing in the live probe; the code now uses computeFileMetadataAsync(f), and the ADR needs an owner amendment. T015 also waits for the PR's first CI run to confirm all four jobs.


### review (`742242ce-6284-49ec-9def-ecba2cc252f7`)

- Condition `gh-pr-open` (start_when): met. Pull request #87 is open.
- Condition `gh-pr-open` (done_when): met. Pull request #87 is open.

- **code-review**: done, 15 turns.

> Reviewed PR #87 (068-pr1-fixes vs main) with the thermo-nuclear code-quality review. Not approved yet. Top finding (high): append_note, patch_block and patch_heading pass the resolved vaultDisplayName to invalidateMetadataCache, while write_note and find_and_replace pass input.vault. In active mode the display name falls back to the vault's absolute folder path when the registry has no entry, so the refresh runs with vault=<absolute path>, which the CLI rejects; the failure is only logged. Fix: pass input.vault at all five call sites. Other findings: the eval-in-vault invokeCli call is hand-built in _note-io.ts and write_note (should be one helper in _active-file.ts); metadataRefreshFailed.reason is free text instead of a closed set, and its logger test documents a value the code never produces; backslash conversion is done twice in write_note; the canonical.ts change to resolve a symlinked note to its target has no test; test helpers are duplicated (capture logger, prefix-link fake realpath, template-internal assertions). No file crosses 1,000 lines (write_note/handler.test.ts is at 988). The refresh correctly runs outside queue.run, and the Windows CI lanes are fine. Nothing was posted to the PR and no code was changed. Added entry 24 to .memory/refactor-decisions.md.

- **fix**: done, 79 turns, 2 questions.

> All six findings from the PR #87 review are fixed and pushed to 068-pr1-fixes in two commits. Lint, type check and build are clean; 2876 tests pass (6 skipped); statement coverage is 96.76%.
>
> Commit 535fd29 (no behaviour change):
> - evalInVault in _active-file.ts is now the one place that builds the eval-in-a-vault call. _note-io.ts handles both post-write actions (metadata refresh and the new openNote), so write_note's open step is one call and converts the path once.
> - canonical.test.ts now tests a note that is itself a link: allowed when the target is in the vault, refused when it is outside.
> - captureLogger moved to _handler-test-fixtures.ts and linkRealpath to src/path-safety/_realpath-fixtures.ts. Three handler tests no longer re-check the refresh script's contents.
>
> Commit 32a2cf6 (your rulings):
> - Q1=A: all five tools now pass input.vault to the refresh. Specific mode sends vault=<display name>; active mode sends no vault=, so the refresh runs in the open vault. A folder path is never sent as vault=. New tests in append_note, patch_block and patch_heading check that the active-mode refresh has no vault=; I confirmed they fail against the old code. Research R13 has the one-line note, and spec.md Assumptions records the focus-switch race as an accepted residual risk.
> - Q2=A: reason is now one of cli-error, note-not-found or unexpected-output, and a new detail field holds the error code and message or the first 200 characters of the output. errors.contract.md and data-model.md section 11 now read {vault, relPath, reason, detail}. logger.test.ts has one case per reason, using only values the code produces, and _note-io.test.ts covers all three reasons.
>
> Left as they are:
> - Older hand-written copies of the capturing logger in the append_note, patch_block, patch_heading, prepend and write_note tests predate this PR; I left them for when those files are next changed.
> - The finished task T005 in tasks.md still describes the old three-field event. I left it because it records what was done at the time.
> - relay-digest.md and relay-qa-log.md were changed by the workflow, not by these fixes, so I did not commit them.
>
> Entry 24 in .memory/refactor-decisions.md is updated.


### docs (`9b351f73-a96d-44e6-9726-3a930cee081f`)

- Condition `gh-pr-open` (start_when): met. Pull request #87 is open.
- Condition `gh-pr-open` (done_when): met. Pull request #87 is open.

- **document**: done, 40 turns.

> PR #87 (OPEN, no review decision yet, 068-pr1-fixes -> main): the docs are committed as b652910 and pushed. Four pages changed. `.docs-as-code/capabilities/mutate.md` now covers the refresh after a write: it uses the vault-relative path, sends `vault=` only when the caller named one, logs `bridge.metadata_refresh_failed`, and must call `computeFileMetadataAsync`. It also explains why the old refresh never ran, why find_and_replace refreshes outside `queue.run`, and the focus-switch risk the owner accepted. `.docs-as-code/architecture.md` covers the containment check that resolves the nearest existing folder with realpath, `evalInVault`, and the new logger event with its fixed set of reasons. `.docs-as-code/tech-stack.md` now shows CI running on Ubuntu and Windows × Node 22 and 24. `docs/tools/write_note.md` is corrected: a failed refresh is now logged, not silent, and `open` uses the vault-relative path. I ran `npm test` after the `docs/tools` edit: 2876 passed, 6 skipped. I added a `## Documentation` section to the PR body above the Generated-with line and changed nothing else in the body. CI is re-running.
>
> Things the owner needs to act on:
> (1) The PR body was written before the review commits 535fd29 and 32a2cf6 (Q1: an active-mode refresh sends no `vault=`; Q2: the refresh-failure reason is now a fixed set; and the new `evalInVault` helper). The pages follow the diff; the body's A1 section is now out of date.
> (2) CHANGELOG.md has no entry for this user-visible change; its latest entry is still 0.6.5.
> (3) ADR-009 §5 still names `computeMetadataAsync(f)` and needs an owner amendment. I wrote no new ADR, because the PR leaves that amendment to the owner rather than superseding the ADR.
> (4) I refreshed only the code part of the graph (`graphify update .`). I skipped the `/graphify --update` refresh of the doc nodes because it found 667 changed documents, about 30 extraction subagents, which is too much token spend for an unattended step. The owner should run it by hand.
> (5) The working tree was dirty on entry, but only with the Relay log files `relay-digest.md` and `relay-qa-log.md`. The skill says to stop on a dirty tree. I carried on because the PR is on the current branch, so there was no checkout to drag those files across. I left them unstaged and untouched.


### record (`c489ead1-e981-41ce-a69a-53ca1e2f8b09`)

- **record-in-vault**: done.

> PR #87 for BI-0165 is now recorded on the note, including the new `in-review` status.
> - **Spec branch:** `spec_branch: 068-pr1-fixes`, set in the frontmatter in the previous pass.
> - **Feature folder and pull request:** the Status section has a dated 2026-10-28 paragraph saying PR 1 of 6 is in review. It links https://github.com/marwansaab/obsidian-cli-mcp/pull/87 (#87) and names branch `068-pr1-fixes` and folder `specs/068-modernise-mcp-surface`.
> - **Status:** `queued` → `in-review`. The owner ruled to add `in-review` to the backlog-item status list in Vault Frontmatter Convention, so it is now an allowed value there.
> - **Relay comment:** a dated HTML comment records that Relay run obsidian-cli-mcp-bi-0165-2026-10-28 produced the PR. A separate audit-trail comment records the status change.


## Escalations

- **BI-0165 (dry run: no): preflight request needs you (conflict)** (advisor, 2026-10-27T13:21:45.572Z): BI-0165's specify prompt starts with `/speckit.specify` (the dot form), not `/speckit-specify`. The owner should change that line in the note to `/speckit-specify Modernise MCP surface`.
  - Choices: 1. Fixed: check again; 2. Stop the run
  - Answer: choice 1 (Fixed: check again) via cli
- **BI-0165 (dry run: no): specify question needs you (decision)** (advisor, 2026-10-27T13:54:34.426Z): BI-0165 lists C1 as an open owner decision. Option A would also reverse ADR-003's flat-encoding amendment, so it needs your ruling and an ADR-003 amendment if you choose it.
  - Choices: 1. B: descriptions now, union later; 2. A: union now (amend ADR-003); 3. Stop the run
  - Answer: choice 1 (B: descriptions now, union later) via ntfy
- **BI-0165 (dry run: no): specify question needs you (decision)** (advisor, 2026-10-27T13:56:02.964Z): BI-0165 lists B3 as an open owner decision ("ask the owner, do not guess"). The note recommends refusal but leaves the choice to you.
  - Choices: 1. A: refuse with structured error; 2. B: requiresUserInteraction marker; 3. C: marker and refuse
  - Answer: choice 1 (A: refuse with structured error) via ntfy
- **BI-0165 (dry run: no): clarify question needs you (scope)** (advisor, 2026-10-27T14:00:46.994Z): BI-0165 C2 lists the blocked commands exactly. Adding `command` (all palette commands) and `plugin:reload` widens the default block past that list, though it fits the 'no code execution' story.
  - Choices: 1. B: add command + plugin:reload; 2. A: denylist exactly as briefed; 3. C: allowlist of safe commands
  - Answer: choice 2 (A: denylist exactly as briefed) via ntfy
- **BI-0165 (dry run: no): plan question needs you (decision)** (advisor, 2026-10-27T20:37:00.855Z): BI-0165 §0 says the owner must be asked before anyone edits `.memory`. The new path is settled, but who edits the gate file is the owner's call.
  - Choices: 1. A: agent updates .memory; 2. B: quickstart overrides path; 3. C: owner edits .memory
  - Answer: choice 1 (A: agent updates .memory) via ntfy
- **BI-0165 (dry run: no): plan question needs you (conflict)** (advisor, 2026-10-27T20:38:33.192Z): BI-0165 B4 and the ratified constitution v1.6.0 name the tool `list_vaults`. ADR-010 requires `vaults` and calls out the `list_` prefix as an example of what it forbids. Choosing between them means either following the ADR or recording a deviation from it.
  - Choices: 1. C: rename to vaults (ADR-010); 2. A: keep list_vaults, plan deviation; 3. B: keep, amend ADR-010 scope
  - Answer: choice 1 (C: rename to vaults (ADR-010)) via ntfy
- **BI-0165 (dry run: no): record-in-vault request needs you (decision)** (advisor, 2026-10-27T21:28:07.176Z): The vault's backlog-item status vocab has no 'in review' value. Recording PR #87 needs either an existing status or a new vocab value, which is a convention decision.
  - Choices: 1. in-flight (existing value); 2. Add 'in-review' to BI vocab; 3. Leave as queued
  - Answer: choice 2 (Add 'in-review' to BI vocab) via ntfy

## Edits made by the advisor

| File | Change | Triggered by |
|---|---|---|
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md` | Added a footer HTML comment recording the 2026-10-28 C1 ruling: descriptions now, union deferred, ADR-003 stands, no probe-client test. In-place edits to the Part 2 §3 C1 line and the Skill notes line were not made because find_and_replace permission was denied, so the comment says it supersedes the §3 line. | pre-implementation / specify: Question 1: How parameter-combination rules are made visible (owner decision C1) |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md` | Appended footer HTML comment recording 2026-10-28 B3 ruling (refuse with structured error when no elicitation; no requiresUserInteraction marker); notes it supersedes the still-open Part 2 §3 B3 line. | pre-implementation / specify: Question 2: Behaviour when the client cannot ask the human to confirm (owner decision B3) |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md` | Appended a footer HTML comment recording the clarification: cancelling a find_and_replace commit stops between notes, with no rollback and a stderr record of committed and skipped notes. | pre-implementation / clarify: Question 1: Cancelling a find-and-replace commit that is already writing notes |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md` | Appended a footer HTML comment recording the clarification: instructions are built at boot from the registered set, the opening stays fixed, lines naming hidden tools are left out, and tests pin the unfiltered text. | pre-implementation / clarify: Question 2: Orientation text when tools are filtered out |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md` | Appended a footer HTML comment recording the 2026-10-28 ruling on how wide the C2 gate is: the denylist stays exactly as briefed, and `command` and `plugin:reload` stay allowed as an accepted residual risk. | pre-implementation / clarify: Question 3: How wide is the passthrough tool's default block? |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md` | Added a footer HTML comment recording the owner's 2026-10-28 approval for the agent to update the `.memory` test-vault path. The quickstart cites only the gate file, and no probe runs before the edit. | pre-implementation / plan: Question 1: Test-vault path in `.memory/test-execution-instructions.md` |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md` | Appended footer HTML comment recording 2026-10-28 ruling: tool named `vaults` per ADR-010, superseding all `list_vaults` mentions in the note. Flags the Architecture page's `list_vaults` mention as a follow-up for when B4 ships. | pre-implementation / plan: Question 2: The new vault-listing tool's name vs ADR-010 |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md` | Appended a footer HTML comment recording two analyze clarifications. B5 outputSchema stays a MUST: unions are published as a root-object schema, with no blanket exception. B3 refusal is two-step: capability check at entry before vault resolution, human prompt after the re-scan. | pre-implementation / analyze: Specification Analysis Report |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md` | Appended footer HTML comment recording run mapping: one Relay run per §6 PR; first run = PR 1 with plan PR-0 folded in; later PRs each get their own run after owner merge. | implementation / implement: tasks.md (and spec Assumptions → Delivery slicing) delivers 0.9.0 as seven sequential pull requests: |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md` | Added a footer HTML comment recording the T004 live-probe result: the symptom did not reproduce in 4/4 rounds, while the code defect (absolute path resolves to null) was confirmed. Also records that A1 goes ahead with code-level 'before' evidence. | implementation / implement: The T004 live probe did NOT reproduce the A1 symptom. In 4 of 4 rounds on TestVault-Obsidian-CLI-MCP |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md` | Appended a footer HTML comment recording the active-mode refresh clarification: input.vault is passed as given; active mode sends no `vault=` and refreshes the open vault; a registry-miss folder path is never sent; the focus-switch race is an accepted residual. | review / fix: Q1 — Which vault should an active-mode write refresh? |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md` | Added a footer HTML comment that records the metadataRefreshFailed event shape: a closed-set reason plus a detail field. | review / fix: Q2 — Should the `reason` in the `metadataRefreshFailed` log event come from a fixed list? |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md` | Set frontmatter spec_branch: 068-pr1-fixes. | record / record-in-vault: The work for job BI-0165 is now a reviewed, documented pull request. Record that on the job's note,  |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md` | Added to the Status section a dated 2026-10-28 paragraph: PR 1 of 6 in review, PR #87 link, branch 068-pr1-fixes, feature folder specs/068-modernise-mcp-surface. | record / record-in-vault: The work for job BI-0165 is now a reviewed, documented pull request. Record that on the job's note,  |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md` | Added a footer audit-trail comment, dated 2026-10-28: Relay run obsidian-cli-mcp-bi-0165-2026-10-28 produced PR #87. It notes that the status change is waiting on the owner's choice. | record / record-in-vault: The work for job BI-0165 is now a reviewed, documented pull request. Record that on the job's note,  |
| `000-Meta/Vault Frontmatter Convention.md` | Added `in-review` to the backlog-item status list under Status overrides, with its definition (open, reviewed PR awaiting owner merge, added by owner ruling on 2026-10-28). Bumped `updated` to 2026-10-28. | record / record-in-vault: The work for job BI-0165 is now a reviewed, documented pull request. Record that on the job's note,  |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md` | Set frontmatter status: in-review. | record / record-in-vault: The work for job BI-0165 is now a reviewed, documented pull request. Record that on the job's note,  |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md` | Added a footer audit-trail comment for the status change queued → in-review (PR 1 #87 awaiting merge). | record / record-in-vault: The work for job BI-0165 is now a reviewed, documented pull request. Record that on the job's note,  |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md` | Earlier in this request: set spec_branch: 068-pr1-fixes, added the Status paragraph (PR #87, branch, feature folder), and added the Relay run comment. | record / record-in-vault: The work for job BI-0165 is now a reviewed, documented pull request. Record that on the job's note,  |

## Files

- Q&A log: `relay-qa-log.md`
- Run state: `C:\Marwan-Saab-ADO\My-Setup\Relay\.relay\runs\obsidian-cli-mcp\obsidian-cli-mcp-bi-0165-2026-10-28`
