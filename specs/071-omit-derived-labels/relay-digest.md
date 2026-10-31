# Relay digest: speckit

| | |
|---|---|
| Run | `obsidian-cli-mcp-bi-0072-2026-10-31` |
| Project | obsidian-cli-mcp (pack speckit) |
| Status | done |
| Started | 2026-10-31T06:59:43.017Z |
| Finished | 2026-10-31T07:50:35.232Z |
| Elapsed | 50 min 52 s |
| Questions | 7 (1 needed the owner) |
| Requests to the advisor | 3 (0 needed the owner) |
| Escalations | 1 |
| Edits by the advisor | 8 |

## Inputs

- `job_id`: BI-0072
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

### checks (`10a3a29f-beca-4b66-902a-3d1a98ae771a`)

- Condition `file-exists` (start_when): met. C:\Github\obsidian-cli-mcp\.specify exists.

- **preflight**: done.

> Preflight for BI-0072: ready. All checks pass.
>
> - Vault identity: `000-Meta/Vault Identity.md` → `vault_id: my-setup`, which equals `expected_vault_id` `my-setup` (CLI display name `My-Setup-Vault`). PASS. The session-start reads are done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover and About This Vault. The Obsidian CLI MCP per-tool notes are read too.
> - Note: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md`. Title: "Refine Links DisplayText Emission For Fragment Bearing Wikilinks". Found. PASS.
> - Initiative: `"[[Obsidian CLI MCP]]"`. PASS.
> - Status: `planned` (re-validated 2026-10-31 against 0.9.0-local, still reproduces). The work is not finished or abandoned. PASS.
> - Specify prompt: the `## /speckit-specify prompt` section is present, and its command is exactly `/speckit-specify` (dash form), with the 3-word prefix "Omit derived labels". The note was not changed. PASS.
> - Clarify skill: `anthropic-skills:speckit-clarify-skill` loaded with "BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks". Its answering rules (bare letter for a perfect match, otherwise a caveman-full directive plus a cited rationale) apply to every question that follows.
>
> Primed for BI-0072 — Refine Links DisplayText Emission For Fragment Bearing Wikilinks.
> Read: BI, Constitution (v1.5.1), Architecture (Canonical contracts), ADR-003, `links` feature page (FEAT-013), Obsidian CLI MCP Tool Notes (`links` quirks).
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.


### pre-implementation (`5bfb6c54-4181-48a6-aa31-7692022b3d7f`)

- Condition `shell-exit-0` (run_when): met. "node -e "process.exit('' === '' ? 0 : 1)"" exited 0.
- Condition `file-exists` (done_when): met. C:\Github\obsidian-cli-mcp\specs\071-omit-derived-labels\tasks.md exists.

- **specify**: done, 12 turns.

> I created branch 071-omit-derived-labels and wrote the spec at specs/071-omit-derived-labels/spec.md, plus a quality checklist at checklists/requirements.md. Every checklist item passed on the first run, and the spec has no clarification markers. .specify/feature.json now points at the new folder. The spec has five user stories: unaliased heading and block links get no label; embeds follow the same rule; aliases the author wrote are kept exactly; plain links behave as before; and the help states a single rule with no workaround. It also has eight functional requirements. FR-003 says the decision must come from what the note's source contains, not from how a label looks; an edge case where an author writes an alias shaped like "Note > Heading" tests this. I filled three gaps with defaults and listed them under Assumptions: an alias identical to the target is still left out, as now; an empty alias counts as no alias; and same-note heading and block links follow the same rule. I skipped the optional after_specify commit hook, so nothing is committed yet. Next step is /speckit-clarify or /speckit-plan.

- **clarify**: done, 25 turns, 2 questions.

> Clarify finished after 2 of 5 questions; both answers are written into specs/071-omit-derived-labels/spec.md. Q1 (answer A): the rule covers every fragment-bearing wiki link or embed, PDF pages included, not just headings and blocks. Q2 (answer A): size text on an image embed (e.g. a width written after the separator) is still reported exactly as written, as it is today. The rule now reads: 'the text the author wrote after the alias separator'. Sections changed: Clarifications (new), User Story 2 (new PDF-page scenario), User Story 4, Edge Cases, FR-001/002/004/006/008, Key Entities, SC-001/SC-004 and Assumptions. Wording now says 'fragment' everywhere instead of 'heading or block'. The checklist re-validated at 16/16, unchanged. Coverage is Clear or Resolved in every category except one, left for planning: whether an empty alias on a plain link (e.g. [[Note|]]) gets a label today. It is low impact and needs a live-CLI probe to settle. Both optional commit hooks were skipped, so nothing is committed. Next step: /speckit-plan.

- **plan**: done, 43 turns, 2 questions.

> The plan for specs/071-omit-derived-labels is written, and both rulings are in the spec. Clarifications Q3 brings links declared in properties into scope: the out-of-scope bullet is removed, FR-004 corrected, and acceptance scenario US1-3 added. Q4 treats an empty or blank alias as no alias everywhere (new FR-004a); edge cases, success criteria and assumptions were updated to match. The plan changes one condition in the links eval template's shared wrap function. For wiki-form entries (body links, embeds and frontmatter links), displayText is emitted only when the raw source text has a '|', the label is non-empty, and it differs from the target. Markdown-form entries keep today's rule. A live probe of 27 link shapes backs this: the separator is present for every written alias and for no derived label. A new co-located test will run the real template in node:vm against those 27 recorded cache shapes; until now the template's transform was never executed in tests. One description sentence is replaced and the docs/tools/links.md displayText row is rewritten without the caveat or the regex workaround. The fingerprint baseline is regenerated, and only links.descriptionFingerprint should move. The constitution check passes (Y or N/A on every gate), no kernel nodes are touched, and there is no schema or error change. Three implement-time live probes remain: alias trimming (wording only), end-to-end through the built tool, and aliased frontmatter list items keeping '|' in their source text. Each has a fallback. The CLAUDE.md plan pointer now names this plan. I skipped the optional commit hooks, so nothing is committed.

- **tasks**: done, 8 turns.

> I wrote specs/071-omit-derived-labels/tasks.md with 19 tasks across 8 phases, and every task follows the checklist format. Tests are included because FR-008 and Principle II require them. Phase 1 (T001–T003) runs the live checks before coding: whether Obsidian trims alias whitespace, whether aliased frontmatter list items keep the '|' separator, and a capture of current output for the end-to-end comparison. Phase 2 (T004) builds a test that runs the real eval template in node:vm. Today's tests only feed in pre-built envelopes, so the label logic is never executed in tests now. Story tasks: US1 has 3 (T005–T007: failing row tests first, then the one-condition change to wrap, then the header line). US2 has 1 (T008), US3 has 2 (T009–T010), US4 has 2 (T011–T012, including checks that nothing else in the output changes), and US5 has 4 (T013–T016: description test, description sentence, docs page, baseline regenerated with only the links description fingerprint expected to move). Polish (T017–T019) covers the full suite, the end-to-end live check, and the graph checks recorded in post-implement.md. T013 and T015 can run in parallel with the test work; the rest run in order because they share _template.test.ts. The suggested MVP is T001–T007. The graphify path rule does not apply because all source changes sit in one module. I skipped the optional commit hooks, so nothing is committed.

- **analyze**: done, 19 turns, 1 questions.

> All five fixes from the analysis are now in the spec documents. I1, option (b): contracts/display-label.md now splits the rule. Wiki links and embeds get a label only for a non-empty alias written after '|'. Markdown links and images report their bracketed or alt text as written, empty included. The new description sentence and the help-page row match, and the help page's worked rows add row 26 ([](x) → ""). I added a note in data-model.md, a plan D1/D2 note, and a spec edge-case line on Markdown links; T010 is unchanged. I2: added task T002 after T001. If the trimming probe shows Obsidian trims spaces around aliases, it amends FR-002, FR-006 and the US3 independent test to 'as written, with surrounding whitespace trimmed, as the editor parses it' and records a Clarifications bullet; otherwise it leaves the wording and notes that in research F5. Later tasks were renumbered (now T001–T020) and the dependency notes updated. A1: the T014 docs check now looks for exact strings (the CAVEAT, the regex workaround, the old embed-omit sentence). F1: the plan says once that 'frontmatter (property) links' are what the spec calls 'property links'. U1: the description sentence now covers image alt text. No code changed and nothing is committed. Next step: /speckit-implement.

- **resolve-analysis**: done, 5 turns.

> All analysis findings are resolved, and nothing is left open: 0 critical, 0 high, 0 low. The previous turn had already applied every fix according to the owner's rulings, so no new questions were needed. I1 (option b): the non-empty-alias condition covers wiki links and embeds only; Markdown link text and image alt text are reported as written, empty included. I2: a new task, T002, runs after the trimming probe and amends FR-002, FR-006 and the US3 test wording only if Obsidian is found to trim aliases. A1: T014 checks for exact strings. F1: the terminology note is in the plan. U1: the description sentence now names image alt text. I committed specs/071-omit-derived-labels as 794c2d3 'docs(071): specify, plan and remediate the derived-label fix for links' on 071-omit-derived-labels, with the body format CONTRIBUTING.md asks for. It is not pushed. One deviation from precedent: the commit also picked up relay-digest.md and relay-qa-log.md, which Relay wrote into the feature folder mid-run. The 070 spec commit (9c5a4c8) left those out for a later records commit, and my commit message does not mention them. I did not rewrite the commit; amend it if they should come out. CLAUDE.md (plan pointer) and .specify/feature.json are still uncommitted, left for the separate agent-context commit as in 9c5a4c8. Next step: /speckit-implement.


### continue

Skipped.

- Condition `shell-exit-0` (run_when): not met. "node -e "process.exit('' === '' ? 1 : 0)"" exited 1.

- **prepare**: skipped.

### implementation (`6db05366-710b-4f40-a724-67e07010f451`)

- Condition `file-exists` (start_when): met. C:\Github\obsidian-cli-mcp\specs\071-omit-derived-labels\tasks.md exists.
- Condition `gh-pr-open` (done_when): met. Pull request #98 is open.

- **implement**: done, 88 turns.

> Spec 071 is implemented. All 20 tasks in tasks.md are done, and the full suite passes: 3395 tests, plus typecheck and lint. Nothing has been committed yet. The optional /speckit-git-commit hook was skipped under the Relay rules.
>
> Code change: in src/tools/links/_template.ts, the shared `wrap` function now emits displayText for a wiki-form entry (`original` starts with `[[` or `![[`, frontmatter links included) only when `original` contains `|`, the label is not empty, and the label differs from the link. Markdown links and images keep the old omit-when-equal rule. The header intent line was updated to match.
>
> Tests: the new src/tools/links/_template.test.ts runs the real template in node:vm against the live cache shapes. It covers all 27 data-model rows plus an aliased frontmatter link, and the FR-005 order/line/kind/count invariants in default and total modes. The 13 derived-label and empty-label cases failed on the old template before the fix.
>
> Help text: the LINKS_DESCRIPTION sentence was replaced with the contract text. In docs/tools/links.md, the displayText row was rewritten without the CAVEAT, the regex workaround or the "embeds omit the field" claim, and a "Display label rule" section with worked rows was added. index.test.ts asserts all of this. The regenerated baseline moves only links.descriptionFingerprint, plus the generatedFromBranch stamp the writer sets on every run.
>
> Live probes (T0 gates):
> - G1: Obsidian trims spaces around an alias (`"  Padded  "` comes back as `"Padded"`). Recorded as research F5. Per T002, the spec's FR-002, FR-006 and US3 Independent Test now say "as written, with surrounding whitespace trimmed, as the editor parses it", and a Clarifications bullet was added.
> - G3: an aliased frontmatter list item keeps `|` in `original` and reports `"Fm Alias"`. Recorded as research F6; the fallback was not needed.
> - G2: the built tool returned 29 entries before and after the change. Target, line, kind, order and count are identical in both modes. Every displayText matches the data model: the derived labels and empty labels are gone, and all author aliases and Markdown labels are kept. Saved as contracts/g2-before.json and g2-after.json.
> - The fixtures were removed and Welcome.md is untouched.
>
> Graph refresh:
> - `graphify update .` and `/graphify --update` both ran. The semantic refresh re-extracted 33 docs (about 373K subagent tokens), including the backlog spec 070 had skipped.
> - The shrink guard refused the first export because 214 nodes were missing. All of them came from re-extracted files, so the export was forced, following the spec 068 precedent.
> - All five structural checks pass and are recorded in specs/071-omit-derived-labels/post-implement.md.

- **open-pr**: done, 18 turns.

> The spec 071 work is committed on 071-omit-derived-labels, pushed to origin, and open as PR #98 into main. It is not a draft, since dry run is no, and it has not been merged.
>
> Before committing I ran lint, typecheck, build and the full test suite: all pass, 3395 tests with 6 skipped and 97.06% statement coverage. Prettier flagged the new src/tools/links/_template.test.ts, so I formatted it and re-ran its tests (99 pass).
>
> There are two commits, following the CONTRIBUTING.md message convention:
> - a97aea5 fix(071) holds the display-label rule change in _template.ts, the new template test, the description and help-page rewrite, the regenerated baseline, and the spec 071 evidence, spec and research changes.
> - fcff465 chore(071) holds the agent-context pointer in CLAUDE.md, .specify/feature.json and the Relay digest; these changes were already in the working tree before this step.
>
> The repository has no pull request template file. The PR description follows the layout of PR #97: Summary, Evidence, Test results, and a Constitution Compliance table marking each gate Y or N/A with no N, followed by a line on kernel-node touch (none). The working tree is clean. Per CLAUDE.md, /code-review and /speckit-docs-as-code 98 come next before merge.


### review (`e2a2ad01-006f-4e9e-8598-4801ae1bd446`)

- Condition `gh-pr-open` (start_when): met. Pull request #98 is open.
- Condition `gh-pr-open` (done_when): met. Pull request #98 is open.

- **code-review**: done, 12 turns.

> Thermo-nuclear code-quality review of PR #98 (071-omit-derived-labels vs main). Production change is small and correct (2 template lines, description, docs, baseline); links suites green (99/99). Not approved as-is: 2 structural findings (duplicated `original` sniff + a silent `e.original||''` fallback that defaults into the derived-label-leaking branch), 1 test-design finding (452-line row table that copies expected values and retypes story lists by hand, plus a test oracle that mirrors production kind logic and position special-cases written twice), 1 docs finding (rule restated twice on the help page; 'single presence check' claim is exact only for kind:wikilink since kind:embed also covers Markdown images), 1 low finding (index.test.ts copies the 300-char description sentence the FR-018 fingerprint already pins; T014 mandated it). No file crosses 1k lines, no new error codes, no kernel-node touch. Durable facts appended as item 33 in .memory/refactor-decisions.md. Nothing posted to the PR.
>
> FINDINGS
> 1. [structural, medium] src/tools/links/_template.ts:21-22 + :27. `original` is sniffed twice with different prefix sets: kindOf (`'[['`) and wrap's `w` (`'[['||'![['`). Inside the links array they are equivalent (embeds never land there, T0-verified). Code-judo: compute `const wiki=/^!?\[\[/.test(e.original)` once in wrap and pass it to kindOf (links: `wiki?'wikilink':'markdown'`). One concept, one place, no change to behaviour.
> 2. [boundary, medium] _template.ts:21 `const r=e.original||''`. This is a silent fallback, and its default is the unsafe one: '' gives w=false, which takes the Markdown branch, which emits the derived 'Tgt > Head' label, which is the exact bug 071 fixes. `Reference.original` is always present (t0-cache-shapes.json, frontmatter included), and kindOf at :27 already dereferences `x.original` without a guard. Drop `||''`: if `original` is ever missing, the eval throws and the result fails loudly. It does not quietly regress.
> 3. [test design, medium] _template.test.ts (452 lines). (a) `expected` copies `cacheDisplayText` in every kept row, but data-model.md says the emitted value is always the cache value unmodified. Make it `emitted: boolean` and assert `displayText === cacheDisplayText`. Each row then fits on one prettier line, which removes about 200 lines. (b) Put `story` on the row and use `it.each(ROWS.filter(r => r.story === "US1"))("row $id: $original", expectRow)`. This deletes the hand-retyped `[id, label]` lists, `rowById` and its throw, and the risk that a label drifts away from its row. (c) The `kindOf(row)` oracle copies production's `original.startsWith('[[')` rule, so it is circular. State `kind` on each row, or map it from source alone. (d) The position special cases are written twice with different formulas: mixedCache `id==="10"?[1,0]:id==="1"?[1,20]:[Number(id),0]`, and the expectation `id==="10"||id==="1"?2:Number(id)+1`. Both depend on 'fm-alias' never reaching `Number()`. Use a single `positionOf(row)` helper, or explicit line/col on each row.
> 4. [docs, medium] docs/tools/links.md:98-120. The displayText rule is stated in full twice on one page: in the table cell, with examples, and again in '### Display label rule' with a second example table. help serves this page verbatim, so the duplication costs tokens on every call and doubles the places it can drift (refactor memory item 31). Fix: cut the table cell to one line and point it at the section. Separately, 'A single presence check identifies author-written aliases' / 'check "displayText" in entry on the wikilink and embed entries' is exact only for kind:"wikilink". kind:"embed" also covers `![alt](img.png)`, so an embed's displayText may be alt text. Qualify the claim, or limit it to wikilinks and wiki embeds and say the output cannot tell the two embed forms apart.
> 5. [test, low] src/tools/links/index.test.ts:109-130. RULE_SENTENCE is a verbatim copy of the 300-char description sentence, and the FR-018 fingerprint already pins every byte of it (item 27(a)). `not.toContain(" > ")` would also break on unrelated future wording, and the docs negative greps only catch a word-for-word revert. Task T014 mandated asserting the sentence, so this is the owner's call. Suggestion: assert a short distinctive fragment.
>
> NOT FLAGGED: no file over 1k lines (test is 452); no new error codes; no kernel-node touch; the baseline moved only links.descriptionFingerprint, as expected; the template remains frozen and composeEvalCode/vm execution follows the _shared.test.ts pattern (item 31's recommended approach, now adopted for links).

- **fix**: done, 32 turns, 2 questions.

> All five review findings are fixed and pushed to 071-omit-derived-labels in two commits, so both are on PR #98. Lint, typecheck and build are clean. 3395 of 3395 tests pass (6 skipped), with 97.06% statement coverage against the 91.3% floor.
>
> Commit 2423926 (`refactor`) changes no behaviour for any recorded cache shape:
> - **Template:** `wrap()` in `links/_template.ts` now computes `wiki` once and passes it to `kindOf`, so the kind and the display-label rule use the same check.
> - **Fallback removed:** `e.original||''` is gone. Its default sent an entry without `original` down the Markdown branch, which re-emits the derived "Tgt > Head" label that spec 071 removes. `original` is present on every recorded entry, so if one were missing the eval would now fail loudly.
> - **Template tests:** `_template.test.ts` shrinks from 452 to 242 lines and keeps the same 31 cases:
>   - rows are one-line calls grouped by user story;
>   - each row records whether the cache label is emitted, rather than repeating the expected string;
>   - the expected kind no longer copies the template's own rule;
>   - the setup and position helpers are each written once.
>   Run against main's template, the same 13 cases fail as before.
> - **Help page wording:** the presence-check sentence in `docs/tools/links.md` now says the check is exact on `kind: "wikilink"` entries, and that an embed entry may carry a Markdown image's alt text instead of an alias.
>
> Commit 3f235e3 (`docs`) applies your two rulings:
> - **Q1 = C:** the "Display label rule" section of the help page now carries only what the table row lacks:
>   - the rule is decided from the source, never from a label's shape;
>   - the table-safe `\|` separator counts like `|`;
>   - aliases are trimmed.
>   The worked-rows table and the closing presence-check sentence stay, and the row keeps the contract text word for word. `tasks.md` T016 is amended to match; `contracts/display-label.md` is unchanged on this point.
> - **Q2 = B:** `index.test.ts` now checks a short distinctive fragment of the description instead of the full 300-character sentence. The negative checks and the help-page checks stay. T014 and `contracts/display-label.md` are amended to say the FR-018 fingerprint pins the exact bytes.
>
> Nothing is left open. The Relay files `relay-digest.md` and `relay-qa-log.md` already had uncommitted changes from outside this work; I left them out of both commits and did not touch them.


### docs (`00ee98d8-fd76-4200-b821-1bbc6be54fd3`)

- Condition `gh-pr-open` (start_when): met. Pull request #98 is open.
- Condition `gh-pr-open` (done_when): met. Pull request #98 is open.

- **document**: done, 2 turns.

> PR #98 (OPEN, no review decision, 071-omit-derived-labels -> main). I committed the docs as d18608e and pushed them to the PR branch, so CI is re-running. Two pages changed: `.docs-as-code/capabilities/search-and-discovery.md` (the links display-label rule, the review changes, and a known limit on embed entries) and `.docs-as-code/architecture.md` (how eval templates are tested). No `docs/tools` page needed fixing. I added a `## Documentation` section to the PR body. Things to act on: (1) CHANGELOG.md has no entry for this user-visible `links` change. (2) The graph is not refreshed. Both semantic-extraction agents finished and wrote their chunk files, but I never merged or rebuilt, so graph.json is unchanged. Run `/graphify --update` to finish. (3) Uncommitted changes to relay-digest.md and relay-qa-log.md were already in the tree; I left them unstaged and untouched. I wrote no new ADR. Nothing is still running in the background.


### record (`0e68d9c6-392f-4202-98d9-0c02c73b8eaf`)

- **record-in-vault**: done.

> Recorded on BI-0072, following the in-review backlog-item convention used on BI-0039:
> - Frontmatter `status`: planned → `in-review`. That value is in the backlog-item vocabulary in Vault Frontmatter Convention.
> - Frontmatter `spec_branch`: `071-omit-derived-labels`. `updated` was already 2026-10-31.
> - `## Status`: a new "In review — 2026-10-31" paragraph at the top. It links PR #98 (https://github.com/marwansaab/obsidian-cli-mcp/pull/98) and names the spec branch and the feature folder `specs/071-omit-derived-labels`.
> - Audit-trail footer: a dated HTML comment saying Relay run obsidian-cli-mcp-bi-0072-2026-10-31 produced PR #98, with the branch, the folder and the status flip.
> All of it was checked by reading the note back.


## Escalations

- **BI-0072 (dry run: no): plan question needs you (scope)** (advisor, 2026-10-31T07:06:29.867Z): The BI's specify prompt puts property-declared links explicitly out of scope, on the false premise that they already follow the rule. Bringing them in changes the scope the BI wrote down, though its Impact section asks for uniform behaviour.
  - Choices: 1. Include property links; 2. Keep out; document exception; 3. Stop the run
  - Answer: choice 1 (Include property links) via cli

## Edits made by the advisor

| File | Change | Triggered by |
|---|---|---|
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md` | Appended a dated footer comment. It records the probe evidence that property links do carry derived labels (contradicting the prompt's out-of-scope bullet), notes the owner ruling is pending, and logs the clarify rulings so far (every # fragment covered; image-size text reported as written). | pre-implementation / plan: **Plan question 1 of 2: should links declared in properties follow the same rule?** |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md` | Appended a dated footer comment recording the owner ruling: property links are in scope, and this supersedes the specify prompt's false out-of-scope bullet. The prompt text was left unedited because the find_and_replace permission was denied. The earlier footer comment still says the ruling is pending; the new comment below it supersedes it. | pre-implementation / plan: **Plan question 1 of 2: should links declared in properties follow the same rule?** |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md` | Appended a dated footer comment recording the plan Q2 answer: an empty or blank alias counts as no alias on every wiki-style link and embed. It includes the probe evidence and grounds. | pre-implementation / plan: **Plan question 2 of 2: how should an empty alias be reported?** |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md` | Appended a dated footer comment recording the analyze-stage answers. I1: Markdown link text, empty included, is reported as written; the non-empty rule applies to wiki-form links only. I2: aliases are reported as parsed, and the spec wording changes to 'whitespace trimmed' if T001 confirms trimming. | pre-implementation / analyze: Would you like me to suggest concrete remediation edits for the top 5 issues? |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md` | Set frontmatter status planned → in-review. | record / record-in-vault: The work for job BI-0072 is now a reviewed, documented pull request. Record that on the job's note,  |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md` | Set frontmatter spec_branch to 071-omit-derived-labels. | record / record-in-vault: The work for job BI-0072 is now a reviewed, documented pull request. Record that on the job's note,  |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md` | Prepended an 'In review — 2026-10-31' paragraph to ## Status. It links PR #98 and names the spec branch and the feature folder specs/071-omit-derived-labels. | record / record-in-vault: The work for job BI-0072 is now a reviewed, documented pull request. Record that on the job's note,  |
| `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0072 - Refine Links DisplayText Emission For Fragment Bearing Wikilinks.md` | Appended a dated audit-trail HTML comment: Relay run obsidian-cli-mcp-bi-0072-2026-10-31 produced PR #98, with the branch, the folder and the status flip. | record / record-in-vault: The work for job BI-0072 is now a reviewed, documented pull request. Record that on the job's note,  |

## Files

- Q&A log: `relay-qa-log.md`
- Run state: `C:\Marwan-Saab-ADO\My-Setup\Relay\.relay\runs\obsidian-cli-mcp\obsidian-cli-mcp-bi-0072-2026-10-31`
