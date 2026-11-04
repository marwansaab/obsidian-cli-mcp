# Relay Q&A log: speckit-bugfix

Run `obsidian-cli-mcp-bugfix-bi-0179-2026-11-04`, started 2026-11-04T02:41:05.159Z.

## 1. checks / preflight (2026-11-04T02:41:05.203Z)

**Question (verbatim):**

> Preflight for this Relay bug-fix run of job BI-0179. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0179 in the vault.
> 3. Its `initiative` must refer to "Obsidian CLI MCP". It is usually a wikilink, such as "[[Obsidian CLI MCP]]".
> 4. Its `status` must not mean the work is finished or abandoned (for example shipped, done, cancelled, superseded). Any other status (planned, in-flight, deferred and so on): report it and carry on.
> 5. Its `variant` must be `bug-fix`. This run repairs broken behaviour; a feature goes through the full spec-kit workflow instead.
> 6. It must have a "/speckit-bug-assess prompt" section, or else a "/speckit-specify prompt" section, which describes the expected behaviour. Don't change the note.
> 7. If you haven't already in this conversation, load the clarify skill with the Skill tool, using the reference "<id> - <title>" from the note. It may be listed as `speckit-clarify-skill` or `anthropic-skills:speckit-clarify-skill`. Follow its answering rules for every question that follows. If you can't load it, follow the answer format in your role instead, and say so in the summary; don't escalate for that.
>
> Answer with a short readiness summary: the vault id, the note's path, title, status and variant, and the result of each check.
> Escalate if a check fails, with at most 2 short choices (Relay adds "Stop the run" as a third):
> - `ungrounded`: the vault identity doesn't match, or the note or both prompt sections are missing. Choices: "Fixed: check again".
> - `scope`: the note belongs to another initiative, its status says the work is finished, or its variant isn't `bug-fix`. Choices: "Run it anyway", "Fixed: check again".

**Advisor** (escalate: none):

> Primed for BI-0179 — Report Current Base Parser Error In Views Base.
> Read: BI-0179, Constitution (v1.5.1), Architecture (ARCH-014), ADR-015, BI-0137 (the originating BI, shipped 0.9.0), Obsidian CLI MCP Tool Notes (`views_base` entry). Session-start reads done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault.
> Role: BA + Solution Architect, answering for Claude Code. Clarify skill `anthropic-skills:speckit-clarify-skill` loaded with "BI-0179 - Report Current Base Parser Error In Views Base".
>
> Preflight results:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` has `vault_id` = `my-setup`, which matches `expected_vault_id` (vault display name `My-Setup-Vault`).
> 2. Note found: PASS. Path `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0179 - Report Current Base Parser Error In Views Base.md`; title "BI-0179 — Report Current Base Parser Error In Views Base".
> 3. Initiative: PASS. `initiative` = `"[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status` = `planned`, so the work is not finished or abandoned.
> 5. Variant: PASS. `variant` = `bug-fix`.
> 6. Prompt section: PASS. There is no "/speckit-bug-assess prompt" section, but the "/speckit-specify prompt" section is there ("Attribute parser complaints"). Its acceptance criteria cover A→B and B→A ordering, independence from what was focused before (valid Base, note, or malformed Base), and the case where the parser gives no complaint (still malformed, and no other Base's complaint is included). Out of scope: top-level message, category and reason; running or creating items in a Base; repairing Bases. The note was not changed.
> 7. Clarify skill: PASS. Loaded.
>
> Context for the questions that follow: evidence is TC-00736 (fails on 0.9.0-local). The likely cause recorded on the note is that the parse state is read before the newly focused Base has re-rendered. Error shape stays as set by BI-0137 / spec 081: CLI_REPORTED_ERROR with `details.code: BASE_MALFORMED` and the ADR-015 `details.reason`. No new top-level codes (Constitution Principle IV).
>
> Ready for questions.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0179 - Report Current Base Parser Error In Views Base.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0137 - Classify Malformed Base As Base Malformed In Views Base.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`, `000-Meta/MCP Tool Notes.md`, `210-Guidelines/Best Practices.md`, `200-Decisions/Decision Log.md`, `220-Planning/Session Handover.md`, `000-Meta/About This Vault.md`

**Sent to the step:**

> Primed for BI-0179 — Report Current Base Parser Error In Views Base.
> Read: BI-0179, Constitution (v1.5.1), Architecture (ARCH-014), ADR-015, BI-0137 (the originating BI, shipped 0.9.0), Obsidian CLI MCP Tool Notes (`views_base` entry). Session-start reads done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault.
> Role: BA + Solution Architect, answering for Claude Code. Clarify skill `anthropic-skills:speckit-clarify-skill` loaded with "BI-0179 - Report Current Base Parser Error In Views Base".
>
> Preflight results:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` has `vault_id` = `my-setup`, which matches `expected_vault_id` (vault display name `My-Setup-Vault`).
> 2. Note found: PASS. Path `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0179 - Report Current Base Parser Error In Views Base.md`; title "BI-0179 — Report Current Base Parser Error In Views Base".
> 3. Initiative: PASS. `initiative` = `"[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status` = `planned`, so the work is not finished or abandoned.
> 5. Variant: PASS. `variant` = `bug-fix`.
> 6. Prompt section: PASS. There is no "/speckit-bug-assess prompt" section, but the "/speckit-specify prompt" section is there ("Attribute parser complaints"). Its acceptance criteria cover A→B and B→A ordering, independence from what was focused before (valid Base, note, or malformed Base), and the case where the parser gives no complaint (still malformed, and no other Base's complaint is included). Out of scope: top-level message, category and reason; running or creating items in a Base; repairing Bases. The note was not changed.
> 7. Clarify skill: PASS. Loaded.
>
> Context for the questions that follow: evidence is TC-00736 (fails on 0.9.0-local). The likely cause recorded on the note is that the parse state is read before the newly focused Base has re-rendered. Error shape stays as set by BI-0137 / spec 081: CLI_REPORTED_ERROR with `details.code: BASE_MALFORMED` and the ADR-015 `details.reason`. No new top-level codes (Constitution Principle IV).
>
> Ready for questions.

## 2. assess / bug-assess (2026-11-04T02:42:21.289Z)

**Question (verbatim):**

> Return the bug report for job BI-0179 as one message in `answer`, built only from the note's own text. Do not edit, summarise or add to it.
> - If the note has a "/speckit-bug-assess prompt" section: its full content, verbatim and complete, without the surrounding code fence.
> - Otherwise exactly this, with each section's full content verbatim and complete: a first line `/speckit-bug-assess slug=BI-0179`, a blank line, the line `## Impact` followed by the note's "Impact" section, a blank line, the line `## Status and evidence` followed by the note's "Status" section, a blank line, and the line `## Expected behaviour` followed by the content of its "/speckit-specify prompt" section without the surrounding code fence. Leave out any of the first two sections the note doesn't have.
> If the note has neither prompt section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-bug-assess slug=BI-0179
>
> ## Impact
> BI-0137 keeps the parser complaint as secondary detail in `details.message` (spec 081 FR-005, FR-006) so a caller can show the user what is wrong with the Base. When the previously active file was a different malformed Base, that detail describes the wrong file: line numbers and quoted content point at a Base the caller did not ask about. An agent that relays or acts on the complaint sends the user to the wrong file or "fixes" a line that does not exist in the named Base. The headline, code, reason and path are correct, so callers that branch only on the code are unaffected. The TC's likely-cause note: the parse state is read before the newly focused Base has re-rendered. Low frequency (needs two malformed Bases in succession) but it silently misattributes the diagnosis.
>
> ## Status and evidence
> *Planned.* Filed 2026-11-02 from the 0.9.0-local test run of the 24 in-review BIs. Follow-up to [[BI-0137 - Classify Malformed Base As Base Malformed In Views Base]] (spec `081-classify-malformed-base`), which stays in review. Evidence: [[TC-00736 - Views Base Malformed Base Message Is Plain And Parser Report Is Bounded Detail]] (fail on `@marwansaab/obsidian-cli-mcp@0.9.0-local`). In `TestVault-Obsidian-CLI-MCP`, calling `views_base` on `_validation-056/broken.base` and then on `Fixtures/BI-0137/broken.base` returned, for the second call, `details.code: "BASE_MALFORMED"`, the correct `reason`, `base_path` and headline — but `details.message` carried the parser complaint about `_validation-056/broken.base` (`name: [unclosed`, `messageLength: 148`) instead of the named Base's own complaint (`name: [a, b`, 128). Reproduced in both directions. When the previously active file was a valid Base or a note, the complaint matched the named Base.
>
> ## Expected behaviour
> /speckit-specify Attribute parser complaints
>
> ## Feature
> When an agent lists the views of a Base that cannot be parsed, the parser complaint included in the error always describes that Base, never a Base that was open before.
>
> ## Why
> Today, if another broken Base was open just before, the error for the named Base carries the earlier Base's parser complaint, with its line numbers and content. The agent then reports or fixes the wrong problem in the wrong file.
>
> ## User stories
> - As an agent, I want the parser complaint in a malformed-Base error to describe the Base I named, so that I can tell the user exactly what is wrong with it.
> - As an agent, I want the result to be the same whatever file was open before my call, so that I can trust the error without checking what was focused.
>
> ## Acceptance criteria
>
> **Story: complaint describes the named Base**
> - Given two malformed Bases A and B with different faults, when the agent lists A's views and then B's views, then B's error carries B's complaint and its length, not A's.
> - Given the same two Bases, when the agent lists them in the opposite order, then each error still carries its own Base's complaint.
>
> **Story: independent of prior focus**
> - Given a malformed Base B, when the agent lists its views after a valid Base, a note, or another malformed Base was open, then the complaint and its reported length are the same in every case.
> - Given the parser cannot supply a complaint for the named Base, when the error is returned, then it still identifies the Base as malformed and does not include another Base's complaint.
>
> ## Out of scope
> - The top-level message, error category and specific reason, which are already correct.
> - Running a view of a Base or creating items in it.
> - Repairing malformed Bases.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0179 - Report Current Base Parser Error In Views Base.md`

**Sent to the step:**

> /speckit-bug-assess slug=BI-0179
>
> ## Impact
> BI-0137 keeps the parser complaint as secondary detail in `details.message` (spec 081 FR-005, FR-006) so a caller can show the user what is wrong with the Base. When the previously active file was a different malformed Base, that detail describes the wrong file: line numbers and quoted content point at a Base the caller did not ask about. An agent that relays or acts on the complaint sends the user to the wrong file or "fixes" a line that does not exist in the named Base. The headline, code, reason and path are correct, so callers that branch only on the code are unaffected. The TC's likely-cause note: the parse state is read before the newly focused Base has re-rendered. Low frequency (needs two malformed Bases in succession) but it silently misattributes the diagnosis.
>
> ## Status and evidence
> *Planned.* Filed 2026-11-02 from the 0.9.0-local test run of the 24 in-review BIs. Follow-up to [[BI-0137 - Classify Malformed Base As Base Malformed In Views Base]] (spec `081-classify-malformed-base`), which stays in review. Evidence: [[TC-00736 - Views Base Malformed Base Message Is Plain And Parser Report Is Bounded Detail]] (fail on `@marwansaab/obsidian-cli-mcp@0.9.0-local`). In `TestVault-Obsidian-CLI-MCP`, calling `views_base` on `_validation-056/broken.base` and then on `Fixtures/BI-0137/broken.base` returned, for the second call, `details.code: "BASE_MALFORMED"`, the correct `reason`, `base_path` and headline — but `details.message` carried the parser complaint about `_validation-056/broken.base` (`name: [unclosed`, `messageLength: 148`) instead of the named Base's own complaint (`name: [a, b`, 128). Reproduced in both directions. When the previously active file was a valid Base or a note, the complaint matched the named Base.
>
> ## Expected behaviour
> /speckit-specify Attribute parser complaints
>
> ## Feature
> When an agent lists the views of a Base that cannot be parsed, the parser complaint included in the error always describes that Base, never a Base that was open before.
>
> ## Why
> Today, if another broken Base was open just before, the error for the named Base carries the earlier Base's parser complaint, with its line numbers and content. The agent then reports or fixes the wrong problem in the wrong file.
>
> ## User stories
> - As an agent, I want the parser complaint in a malformed-Base error to describe the Base I named, so that I can tell the user exactly what is wrong with it.
> - As an agent, I want the result to be the same whatever file was open before my call, so that I can trust the error without checking what was focused.
>
> ## Acceptance criteria
>
> **Story: complaint describes the named Base**
> - Given two malformed Bases A and B with different faults, when the agent lists A's views and then B's views, then B's error carries B's complaint and its length, not A's.
> - Given the same two Bases, when the agent lists them in the opposite order, then each error still carries its own Base's complaint.
>
> **Story: independent of prior focus**
> - Given a malformed Base B, when the agent lists its views after a valid Base, a note, or another malformed Base was open, then the complaint and its reported length are the same in every case.
> - Given the parser cannot supply a complaint for the named Base, when the error is returned, then it still identifies the Base as malformed and does not include another Base's complaint.
>
> ## Out of scope
> - The top-level message, error category and specific reason, which are already correct.
> - Running a view of a Base or creating items in it.
> - Repairing malformed Bases.

## 3. assess / resolve-assessment (2026-11-04T02:48:53.924Z)

**Question (verbatim):**

> Question 1 of 2 — Untested order: a malformed Base A open, then a valid Base B named (Reproduction section).
>
> Context: the report only tested malformed A → malformed B, plus valid-or-note → malformed B. If the focus switch also fails when B is valid, `views_base` would report a valid B as BASE_MALFORMED and attach A's complaint. Spec 081's live run went from the broken fixture to the control fixture and listed the control correctly, which suggests this order is unaffected. The proposed fix checks `getActiveFile()` against the named file whether B is valid or not, so it covers this order either way.
>
> | Option | Description |
> |---|---|
> | A (recommended) | Keep it in scope as a check. The fix's first live probe also runs malformed A → valid B and records the result, and /speckit-bug-test adds that order to its live check (B must list its own views). No extra code is needed, because the focus check already covers it. |
> | B | Probe only. Record what the probe shows in fix.md, but add no live check or test for this order. |
> | C | Leave it out. The report doesn't ask for it, so neither the probe nor the bug test looks at it. |
>
> Recommended: A. It costs one extra probe step and one extra live-check step, and it confirms the fix also stops the worse failure: a valid Base reported as malformed.

**Advisor** (escalate: none):

> 1. A
>
> The BI-0179 user story "result to be the same whatever file was open before my call" covers every prior-focus case, including a valid B listed after a malformed A. It is a verification step and adds no code, so scope does not change.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0179 - Report Current Base Parser Error In Views Base.md`

**Sent to the step:**

> 1. A
>
> The BI-0179 user story "result to be the same whatever file was open before my call" covers every prior-focus case, including a valid B listed after a malformed A. It is a verification step and adds no code, so scope does not change.

## 4. assess / resolve-assessment (2026-11-04T02:49:04.482Z)

**Question (verbatim):**

> Question 2 of 2 — How should `views_base` report a named Base it could not bring to the front? This only happens on the new focus-failure path.
>
> Context: today the only failure the focus step reports is FILE_NOT_FOUND, which `executeViewsBase` (src/tools/views_base/handler.ts:221-231) remaps to BASE_NOT_FOUND / named-missing. Eval envelope failures elsewhere already carry `details.stage` (`decodeEvalEnvelope` in src/tools/_active-file.ts emits `stage: "json-parse"` / `"envelope-parse"`). The fix adds a template result `{ok:false, code:'FOCUS_NOT_APPLIED', active}` for an open that did not land, so no base:views runs against the wrong file. That result still needs a published error shape.
>
> | Option | Shape | Trade-off |
> |---|---|---|
> | A (recommended) | `CLI_REPORTED_ERROR`, `details: { stage: "focus", base_path, active }`, no `details.code`, message such as `views_base: could not bring base file at "<path>" to the front` | Falls under the roster's existing "Other upstream CLI failure, retry" row. No new `details.code` or reason, so ADR-015's closed sets stay as they are. Follows the existing `details.stage` convention and tells the caller this is transient and retryable, not a property of the Base. |
> | B | `CLI_REPORTED_ERROR`, `details: { code: "BASE_NOT_FOUND", reason: "not-focused", base_path }` | Branchable under a code callers already handle, but it adds a value to a closed reason set and calls a Base that exists "not found", which is misleading. |
> | C | `INTERNAL_ERROR` | Treats a host-app behaviour as a bridge invariant violation. It doesn't tell the caller to retry, and it hides an upstream condition. |
>
> Recommended: A. It reports exactly what happened (the Base exists, Obsidian did not switch to it) without widening any closed set, and it matches the existing `stage` convention.

**Advisor** (escalate: none):

> 2. A
>
> Under ADR-015 the `details.reason` sets are closed, and adding a reason is a contract change. Option A adds no code and no reason, and it fits the existing CLI_REPORTED_ERROR envelope (Constitution IV), so option B is out. The error must not carry another Base's parser complaint (BI-0179 criterion "does not include another Base's complaint").

Sources: `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0179 - Report Current Base Parser Error In Views Base.md`

**Sent to the step:**

> 2. A
>
> Under ADR-015 the `details.reason` sets are closed, and adding a reason is a contract change. Option A adds no code and no reason, and it fits the existing CLI_REPORTED_ERROR envelope (Constitution IV), so option B is out. The error must not carry another Base's parser complaint (BI-0179 criterion "does not include another Base's complaint").

## 5. repair / settle-verdict (2026-11-04T03:00:31.100Z)

**Question (verbatim):**

> BI-0179 sign-off: /speckit-bug-test returned **partial**. Every live acceptance sequence passed on the post-fix code: A→B and B→A each carry their own complaint (148 / 128), a valid Base or a note open first gives the same 128 for B, and malformed A → valid B lists `GoodView`. The full suite (4906 passed), typecheck and lint pass. Three checks were not exercised:
>
> 1. **Pre-fix reproduction of TC-00736.** The symptom never appeared on this machine, even before the fix (Obsidian 1.15.0, installer 1.14.4), so there is no before/after proof that the fix removes what the TC saw. Needs: an environment where it fails, probably Obsidian 1.14.4 (the version the TC likely ran on), or the TC's exact conditions.
> 2. **The new `FOCUS_NOT_APPLIED` error, live.** No live run made the focus switch fail, so `CLI_REPORTED_ERROR` with `details.stage: "focus"` is pinned only by unit tests (vm template tests + handler tests). Needs: a way to make Obsidian drop or delay an open, which today means test-only code or Obsidian state outside the contract. Likely available only together with gap 1.
> 3. **The MCP transport.** The live checks drove the built `views_base` handler module directly, not over stdio. Needs: permission to call the `obsidian-cli-mcp-local` `views_base` tool, and that server restarted on this build.
>
> | Option | What happens |
> |---|---|
> | **A (recommended)** | Accept the partial result and open the PR. The three gaps stay recorded in test.md under "Residual Risks", and TC-00736 is re-run through the MCP server after merge or restart. |
> | B | Widen the fix: add the retry the assessment held in reserve (step 2: if the open has not landed after the wait, retry once with `app.workspace.getLeaf(false).openFile(f, {active:true})`, then check again). This would make a dropped open recover instead of failing, but it closes none of the three gaps, and the evidence shows no dropped open. |
> | C | Hold the PR until TC-00736 is re-run through a restarted MCP server (and ideally on Obsidian 1.14.4), then decide based on what it shows. |
>
> Recommended: **A**. The fix holds by construction: `base:views` parses the active file, and the handler now lists only once the named Base is active. Every acceptance criterion passes live, and nothing regressed. Gaps 1 and 2 depend on an environment we don't have, and B would add code for a failure mode nobody has observed. Gap 3 is cheap to close after the PR by re-running TC-00736 on the restarted server.

**Advisor** (escalate: decision: The developer agent asks for sign-off to accept a partial bug-test result (TC-00736 never reproduced before the fix, the new focus error only unit-tested, no MCP transport run) and open the PR. Approving a partial result is the owner's call.):

> Recommendation: A. Accept the partial result and open the PR. Record the three gaps in test.md under "Residual Risks". Re-run TC-00736 through a restarted `obsidian-cli-mcp-local` server after merge or restart. Do not widen the fix (B): no dropped open has been seen, and the BI-0179 scope covers attributing the complaint, not recovering from a failed focus.
>
> Rationale: every BI-0179 acceptance criterion passed live, including the prior-focus case the owner added. Vault precedent: BI-0137 shipped with a known gap tracked separately (owner decision 2026-11-03), and the handover rule says a BI may ship with one failing TC when the defect has its own BI. That precedent covers shipping, though, not accepting a partial test result, so this needs the owner's sign-off.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0179 - Report Current Base Parser Error In Views Base.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0137 - Classify Malformed Base As Base Malformed In Views Base.md`, `220-Planning/Session Handover.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0179 - Report Current Base Parser Error In Views Base.md`: Appended a dated HTML-comment audit line with the partial /speckit-bug-test result: live passes, the three unexercised checks (no pre-fix repro on Obsidian 1.15.0, focus-failure error only unit-tested, no stdio transport run), and that sign-off went to the owner.

**Advisor, after the owner ruled** (escalate: none):

> A
>
> Owner ruling 2026-11-04: accept the partial result and open the PR. List the three gaps in test.md under "Residual Risks": no pre-fix reproduction of TC-00736, the focus-failure error tested only by unit tests, and no run over the MCP stdio transport. Re-run TC-00736 through the restarted `obsidian-cli-mcp-local` server after merge or restart. Don't add the reserve retry.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0179 - Report Current Base Parser Error In Views Base.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0179 - Report Current Base Parser Error In Views Base.md`: Appended a dated HTML-comment line recording the owner ruling: accept the partial bug-test result and open the PR, keep the three gaps as residual risks, re-run TC-00736 through the restarted server after merge or restart, no reserve retry.

**Owner:** choice 1 (Accept partial, open PR), via cli, 2026-11-04T03:01:23.453Z.

**Sent to the step:**

> A
>
> Owner ruling 2026-11-04: accept the partial result and open the PR. List the three gaps in test.md under "Residual Risks": no pre-fix reproduction of TC-00736, the focus-failure error tested only by unit tests, and no run over the MCP stdio transport. Re-run TC-00736 through the restarted `obsidian-cli-mcp-local` server after merge or restart. Don't add the reserve retry.
