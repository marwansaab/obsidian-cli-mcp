# Relay Q&A log: speckit

Run `obsidian-cli-mcp-bi-0118-2026-10-31`, started 2026-10-31T11:53:33.184Z.

## 1. checks / preflight (2026-10-31T11:53:33.232Z)

**Question (verbatim):**

> Preflight for this Relay run of job BI-0118. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0118 in the vault.
> 3. Its `initiative` must refer to "Obsidian CLI MCP". It is usually a wikilink, such as "[[Obsidian CLI MCP]]".
> 4. Its `status` must not mean the work is finished or abandoned (for example shipped, done, cancelled, superseded). Any other status (planned, in-flight, deferred and so on): report it and carry on.
> 5. It must have a "/speckit-specify prompt" section, and the command at the start of that prompt must be exactly `/speckit-specify` (the dash form). Don't change the note.
> 6. If you haven't already in this conversation, load the clarify skill with the Skill tool, using the reference "<id> - <title>" from the note. It may be listed as `speckit-clarify-skill` or `anthropic-skills:speckit-clarify-skill`. Follow its answering rules for every question that follows. If you can't load it, follow the answer format in your role instead, and say so in the summary; don't escalate for that.
>
> Answer with a short readiness summary: the vault id, the note's path, title and status, and the result of each check.
> Escalate if a check fails, with at most 2 short choices (Relay adds "Stop the run" as a third):
> - `ungrounded`: the vault identity doesn't match, or the note or its specify-prompt section is missing. Choices: "Fixed: check again".
> - `scope`: the note belongs to another initiative, or its status says the work is finished. Choices: "Run it anyway", "Fixed: check again".
> - `conflict`: the command isn't `/speckit-specify` (for example the older `/speckit.specify`). Say that the owner should change the note's command to `/speckit-specify`. Choices: "Fixed: check again".

**Advisor** (escalate: none):

> Primed for BI-0118 — Fix Prepend Empty File FR-009 Divergence.
>
> - Vault id: `my-setup` (from `000-Meta/Vault Identity.md`), which matches `expected_vault_id`. PASS.
> - Session-start reads done: MCP Tool Notes (index), Best Practices, Decision Log, Session Handover, About This Vault.
> - Note: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0118 - Fix Prepend Empty File FR-009 Divergence.md`
> - Title: Fix Prepend Empty File FR-009 Divergence
> - Status: `planned`. It is not finished or abandoned, so carry on. PASS.
> - Initiative: `[[Obsidian CLI MCP]]`. PASS.
> - Specify prompt: the `## /speckit-specify prompt` section exists and its command is `/speckit-specify Fix empty-note insertion` (dash form). PASS. Note not changed.
> - Clarify skill: `anthropic-skills:speckit-clarify-skill` loaded with the reference "BI-0118 - Fix Prepend Empty File FR-009 Divergence". PASS.
> - Read: BI-0118, the Constitution (v1.5.1), the Architecture (Pipeline elements, Canonical contracts, Design-shaping constraints) and the `prepend` feature page (FEAT-029). ADR-003, ADR-009 and ADR-010 were found, all with status `decided`. I will read their bodies when a question needs them.
> - Flag for later questions: the Session Handover (2026-10-27) says the vault's notes on `prepend` cohort membership are known to be wrong until Fix-It Phase 1 lands. The `prepend` feature page says CLI-wrap; the live tool descriptions put `prepend` in the fs-direct cohort. Any question about which pipeline `prepend` uses may need repo confirmation, or I will escalate it.
> - Role: BA + Solution Architect, answering for Claude Code.
>
> Waiting for clarification questions.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0118 - Fix Prepend Empty File FR-009 Divergence.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/prepend.md`, `220-Planning/Session Handover.md`, `000-Meta/MCP Tool Notes.md`, `210-Guidelines/Best Practices.md`, `200-Decisions/Decision Log.md`, `000-Meta/About This Vault.md`

**Sent to the step:**

> Primed for BI-0118 — Fix Prepend Empty File FR-009 Divergence.
>
> - Vault id: `my-setup` (from `000-Meta/Vault Identity.md`), which matches `expected_vault_id`. PASS.
> - Session-start reads done: MCP Tool Notes (index), Best Practices, Decision Log, Session Handover, About This Vault.
> - Note: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0118 - Fix Prepend Empty File FR-009 Divergence.md`
> - Title: Fix Prepend Empty File FR-009 Divergence
> - Status: `planned`. It is not finished or abandoned, so carry on. PASS.
> - Initiative: `[[Obsidian CLI MCP]]`. PASS.
> - Specify prompt: the `## /speckit-specify prompt` section exists and its command is `/speckit-specify Fix empty-note insertion` (dash form). PASS. Note not changed.
> - Clarify skill: `anthropic-skills:speckit-clarify-skill` loaded with the reference "BI-0118 - Fix Prepend Empty File FR-009 Divergence". PASS.
> - Read: BI-0118, the Constitution (v1.5.1), the Architecture (Pipeline elements, Canonical contracts, Design-shaping constraints) and the `prepend` feature page (FEAT-029). ADR-003, ADR-009 and ADR-010 were found, all with status `decided`. I will read their bodies when a question needs them.
> - Flag for later questions: the Session Handover (2026-10-27) says the vault's notes on `prepend` cohort membership are known to be wrong until Fix-It Phase 1 lands. The `prepend` feature page says CLI-wrap; the live tool descriptions put `prepend` in the fs-direct cohort. Any question about which pipeline `prepend` uses may need repo confirmation, or I will escalate it.
> - Role: BA + Solution Architect, answering for Claude Code.
>
> Waiting for clarification questions.

## 2. pre-implementation / specify (2026-10-31T11:54:19.872Z)

**Question (verbatim):**

> Return the full content of the "/speckit-specify prompt" section of job BI-0118's note, verbatim and complete, in `answer`, without the surrounding code fence. Do not edit or summarise it. If the note has no such section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-specify Fix empty-note insertion
>
> ## Feature
> Adding text to the top of an empty note leaves the note containing exactly that text, with no extra line break added, matching what adding the same text to the end of an empty note already does.
>
> ## Why
> The reference documentation promises that adding text to the top of an empty note inserts no separator, and its worked example shows the note ending up with exactly the supplied text. In practice an extra trailing line break is added, and the reported size counts it, while adding the same text to the end of an empty note produces exactly the supplied text. Agents that check the note against what they wrote, or that treat the two capabilities as mirror images, get a silent mismatch.
>
> ## User stories
> - As an agent adding text to the top of a freshly created empty note, I want the note to hold exactly my text, so that checking the note against what I wrote succeeds.
> - As an agent that uses both add-to-top and add-to-end on empty notes, I want both to produce the same result for the same text, so that I can treat them as mirror images.
> - As a reader of the reference documentation, I want the documented empty-note result to match what actually happens, so that I can trust the documentation.
>
> ## Acceptance criteria
>
> **Story: Empty note holds exactly the supplied text**
> - Given an existing note with no content, when the agent adds "first" to its top, then the note contains exactly "first" with no trailing line break.
> - Given the same call succeeds, when the result is returned, then the reported size change equals the length of the supplied text exactly.
>
> **Story: Mirror behaviour with add-to-end**
> - Given two empty notes and the same text, when the agent adds the text to the top of one and to the end of the other, then both notes end up byte-for-byte identical.
>
> **Story: Notes with only a properties block**
> - Given a note that has a properties block and no body, when the agent adds text to its top, then the text lands after the properties block with no extra trailing line break, as the documentation promises.
>
> **Story: Documentation matches behaviour**
> - Given the reference documentation's empty-note rule and worked example, when the agent compares them with the actual result, then they agree.
>
> ## Out of scope
> - Separator behaviour for notes that already have content.
> - Where text lands relative to a properties block.
> - Empty-note behaviour of the section and block editors.
> - Changes to Obsidian itself.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0118 - Fix Prepend Empty File FR-009 Divergence.md`

**Sent to the step:**

> /speckit-specify Fix empty-note insertion
>
> ## Feature
> Adding text to the top of an empty note leaves the note containing exactly that text, with no extra line break added, matching what adding the same text to the end of an empty note already does.
>
> ## Why
> The reference documentation promises that adding text to the top of an empty note inserts no separator, and its worked example shows the note ending up with exactly the supplied text. In practice an extra trailing line break is added, and the reported size counts it, while adding the same text to the end of an empty note produces exactly the supplied text. Agents that check the note against what they wrote, or that treat the two capabilities as mirror images, get a silent mismatch.
>
> ## User stories
> - As an agent adding text to the top of a freshly created empty note, I want the note to hold exactly my text, so that checking the note against what I wrote succeeds.
> - As an agent that uses both add-to-top and add-to-end on empty notes, I want both to produce the same result for the same text, so that I can treat them as mirror images.
> - As a reader of the reference documentation, I want the documented empty-note result to match what actually happens, so that I can trust the documentation.
>
> ## Acceptance criteria
>
> **Story: Empty note holds exactly the supplied text**
> - Given an existing note with no content, when the agent adds "first" to its top, then the note contains exactly "first" with no trailing line break.
> - Given the same call succeeds, when the result is returned, then the reported size change equals the length of the supplied text exactly.
>
> **Story: Mirror behaviour with add-to-end**
> - Given two empty notes and the same text, when the agent adds the text to the top of one and to the end of the other, then both notes end up byte-for-byte identical.
>
> **Story: Notes with only a properties block**
> - Given a note that has a properties block and no body, when the agent adds text to its top, then the text lands after the properties block with no extra trailing line break, as the documentation promises.
>
> **Story: Documentation matches behaviour**
> - Given the reference documentation's empty-note rule and worked example, when the agent compares them with the actual result, then they agree.
>
> ## Out of scope
> - Separator behaviour for notes that already have content.
> - Where text lands relative to a properties block.
> - Empty-note behaviour of the section and block editors.
> - Changes to Obsidian itself.

## 3. pre-implementation / clarify (2026-10-31T11:57:19.274Z)

**Question (verbatim):**

> ## Question 1: What happens when the exact empty-note result cannot be guaranteed
>
> **Context**: Today `prepend` hands the whole write to Obsidian's own add-to-top operation (`invokeCli` with `command: "prepend"`, src/tools/prepend/handler.ts:158), and that operation is what adds the extra trailing line break. Spec 045's FR-005b forbids a wrapper-side frontmatter parser, so whatever the fix looks like, it may involve more than one step against the note (for example, Obsidian writes, then the wrapper removes the line break Obsidian added). That opens two rare situations: (1) the step that removes the extra line break fails (file locked, disk error), leaving the supplied text in the note plus the extra line break; (2) someone else (the user in Obsidian, a sync tool) edits the note between the steps. The spec currently says both FR-007 "the call MUST NOT report success while the note holds something other than the result this specification requires" and FR-009 "MUST NOT change ... its failure behaviour for any input", which contradict each other in these cases. The only post-write failure `prepend` has today is `FS_WRITE_FAILED` with `reason: post-stat-byte-delta-zero` (handler.ts:183); the direct-write tools (`append_note`, `patch_block`, `patch_heading`) write through `writeAtomic` (src/tools/_note-io.ts:31) with last-write-wins for concurrent edits.
>
> **Recommended:** Option A - it never hides a failure of the tool's own making, never overwrites another writer's edit, reuses an existing error code (Principle IV zero-new-codes), and matches the write cohort's last-write-wins rule for concurrent edits.
>
> | Option | Description |
> |--------|-------------|
> | A | If removing the extra line break fails, the call fails with the existing `FS_WRITE_FAILED` code and a new `reason` value saying the text landed with an extra trailing line break. If the note was changed by someone else in between, the tool leaves the note alone and succeeds, reporting the note's actual size change (last-write-wins, as for the other writers). FR-009 is narrowed to allow exactly this one new failure reason. |
> | B | Strict: any time the note does not end up holding exactly the required result, including a concurrent edit by someone else, the call fails with `FS_WRITE_FAILED` and a new `reason` value. |
> | C | Best effort: the call always succeeds and reports the note's actual size change, even if the extra line break could not be removed; the failure is only logged. FR-007 is narrowed accordingly; no failure behaviour changes. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> 1. A
>
> Constitution Principle IV forbids masking a failure that is logged but not reported, which rules out C. ADR-015 allows a new `details.reason` under an existing code, which keeps the zero-new-codes streak. A concurrent edit is not a failure of the tool's own making, so last-write-wins (as in the write cohort) applies rather than B's strict failure.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0118 - Fix Prepend Empty File FR-009 Divergence.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/prepend.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0118 - Fix Prepend Empty File FR-009 Divergence.md`: Appended a dated audit comment recording the Q1 clarify ruling (A: FS_WRITE_FAILED plus a new reason if the strip step fails; last-write-wins on a concurrent edit; FR-009 narrowed) and the developer's confirmation that prepend is still CLI-wrap via invokeCli under FR-005b.

**Sent to the step:**

> 1. A
>
> Constitution Principle IV forbids masking a failure that is logged but not reported, which rules out C. ADR-015 allows a new `details.reason` under an existing code, which keeps the zero-new-codes streak. A concurrent edit is not a failure of the tool's own making, so last-write-wins (as in the write cohort) applies rather than B's strict failure.

## 4. pre-implementation / analyze (2026-10-31T12:09:51.646Z)

**Question (verbatim):**

> ## Specification Analysis Report
>
> | ID | Category | Severity | Location(s) | Summary | Recommendation |
> |----|----------|----------|-------------|---------|----------------|
> | C1 | Constitution (Principle IV) | CRITICAL | research.md D3 (third bullet); data-model.md §Sequence `readFile → before … other errno → rethrow`; tasks.md T008(a), T006 "Pre-read non-ENOENT (EACCES) … rethrown unchanged" | The new pre-call `readFile` rethrows any non-ENOENT fs error raw. A raw error is not an `UpstreamError`, and `registerTool` (`src/tools/_register.ts:231`) re-throws it to the SDK. Principle IV: "Errors propagated to callers MUST be instances of … `UpstreamError`". The step also adds a failure point that does not exist today, so FR-009 ("MUST NOT change its failure behaviour for any input") is broken as well. The pre-call `stat` has the same raw rethrow, but that one is pre-existing; this plan copies the pattern into new code. | Classify a non-ENOENT pre-read failure as `UpstreamError` `FS_WRITE_FAILED` with `{ errno, syscall: "open", path }` (cohort shape; no new reason), raised before the Obsidian call so nothing is written. Amend FR-009's exception list to allow it. Update research D3, data-model §Sequence, contract §4, and tasks T006/T008(a). |
> | I1 | Inconsistency / FR-006, FR-009 | HIGH | data-model.md §Sequence (`if … bytesWritten === byteLength(content) + 1: readFile → after  failure → FS_WRITE_FAILED extra-trailing-newline`); contract §4; tasks.md T006 "Read-back fails", T008(b)/(d) | Research F2 shows Obsidian adds exactly one LF on every default-mode call, so the pre-filter matches every default-mode call, including notes that have a body. If the read-back fails on such a note, the call would fail with `extra-trailing-newline`. That message is false (nothing extra was added), and it turns today's success into a failure for notes with content (FR-006, FR-009). | Pick one: (A) fail with `extra-trailing-newline` on a read-back failure only when `before === ""` (the note is certainly bodiless); otherwise keep today's success and measured size. (B) Treat any read-back failure as a new reason such as `post-write-check-failed`, which is honest but still a new failure for notes with a body, so FR-009 must be amended. (C) Use the Obsidian-written size alone when `before === ""`, skip the read-back for empty notes, and fail only on the write. A is the smallest change consistent with FR-006. |
> | I2 | Inconsistency (conflicting requirement) | HIGH | spec.md FR-002, SC-002 ("In 100% of trials … properties-only note") vs spec.md Edge Cases "Properties-only note and content that repeats the end of the note" | FR-002 and SC-002 are absolute, but the Edge Cases (added at plan time, research D2) carve out the ambiguous inputs. | Add "except the ambiguous case in Edge Cases" to FR-002 and SC-002. |
> | I3 | Inconsistency | MEDIUM | research.md D1 rationale ("The pre-filter on the size delta means calls that cannot be the defective case do not even read the note after the write"); plan.md Performance Goals | By research F2 the pre-filter excludes only inline calls and failed or no-op writes; every default-mode call reads the note back. The wording overstates the saving. | Reword: "inline calls skip the read-back; every default-mode call reads the note once more". |
> | I4 | Inconsistency | MEDIUM | spec.md FR-007 ("the tool MUST NOT overwrite or alter that change") vs research.md D3 ("A residual window remains between reading `after` and the rename") | The spec states an absolute guarantee; the plan accepts a small race window, as `patch_heading` does. | Reword FR-007: "MUST NOT overwrite a change it has observed; a residual window between the check and the atomic rename is accepted, as for `patch_heading`". |
> | G1 | Coverage | LOW | spec.md FR-008 ("the shipped system documentation"); tasks.md | No task updates `.docs-as-code/`. It is covered by the PR lifecycle (`/speckit-docs-as-code <n>` after review), but tasks.md does not say so. | Add a note to tasks.md Notes that FR-008's shipped-docs part is delivered by `/speckit-docs-as-code`. |
> | T1 | Terminology | LOW | spec.md ("properties block"), docs/tools/prepend.md and plan ("frontmatter") | The two terms name the same concept. | Optional: in the docs edit (T013), say "properties block (frontmatter)" once. |
>
> **Coverage Summary Table:**
>
> | Requirement Key | Has Task? | Task IDs | Notes |
> |-----------------|-----------|----------|-------|
> | FR-001 empty note exact | Yes | T005–T009 | |
> | FR-002 properties-only exact | Yes | T011, T012 | see I2 |
> | FR-003 default and inline | Yes | T006 (E2), T012 (E6) | |
> | FR-004 size equals content | Yes | T006, T012 | |
> | FR-005 mirror with append_note | Yes | T010 | |
> | FR-006 unchanged for notes with body | Yes | T004, T005 negatives, T009 | at risk from I1 |
> | FR-007 failure / race semantics | Yes | T006 | see C1, I1, I4 |
> | FR-008 docs agree | Partial | T013, T015 | shipped docs via lifecycle (G1) |
> | FR-009 surface and errors unchanged | Yes | T015, T016 | broken by C1 and I1 as planned |
> | FR-010 no Obsidian change | Yes (by construction) | all | |
> | SC-001 | Yes | T006, T018 | |
> | SC-002 | Yes | T012, T018 | see I2 |
> | SC-003 | Yes | T006, T010 | |
> | SC-004 | Yes | T004, T009, T016 | |
> | SC-005 | Yes | T013, T018 | |
>
> **Constitution Alignment Issues:** C1 (Principle IV: a raw fs error propagated from new code). Everything else aligns: Principle I (downward imports only), II (co-located tests), III (schemas untouched), V (headers), ADR-015 (one new reason under an existing code), MCP Tool Surface Standards (no fingerprint moves) and Security Defaults (the write is contained by `assertCanonicalPath`). CodeGraph at HEAD `1f7ac44`: `executePrepend`, `writeAtomic`, `invalidateMetadataCache` and `fakeFs` match the plan's claims. The only kernel-node touch is the new `UpstreamError` construction site, as stated.
>
> **Unmapped Tasks:** none. T001 (baseline), T017 (structural check) and T018 (live check) are cross-cutting.
>
> **Metrics:**
>
> - Total Requirements: 15 (10 FR, 5 SC)
> - Total Tasks: 18
> - Coverage: 100% (FR-008 partial, delivered by the lifecycle)
> - Ambiguity Count: 0
> - Duplication Count: 0
> - Critical Issues Count: 1
>
> ### Next Actions
>
> - Resolve **C1** before `/speckit-implement`: change the plan, data model, contract and tasks, and amend spec FR-009.
> - Resolve **I1** (choose option A, B or C) and **I2**, both HIGH, before implementing; they change what T006/T008 assert.
> - I3, I4, G1 and T1 are wording fixes that can be folded into the same edit.
>
> Would you like me to suggest concrete remediation edits for the top 4 issues (C1, I1, I2, I3)? For I1 my recommendation is option A.

**Advisor** (escalate: none):

> Yes. Apply remediation for all findings, as follows.
>
> C1. Accept. Wrap a non-ENOENT failure of the pre-read as `UpstreamError` `FS_WRITE_FAILED` `{ errno, syscall: "open", path }`, with no new `reason`. Raise it before the Obsidian call, so nothing is written. Add this case to FR-009's exception list. Update research D3, data-model §Sequence, contract §4, and T006/T008(a). Leave the pre-existing raw rethrow from `stat` alone; it is outside this BI's scope.
> Constitution Principle IV requires an `UpstreamError` at every boundary and supersedes the spec where they disagree (Governance).
>
> I1. Option A, with one change: the condition is "`before` was bodiless" (empty, or properties-only as the plan already classifies it without a wrapper-side parser), not only `before === ""`. In that class, a failed read-back fails with `FS_WRITE_FAILED` and `reason: extra-trailing-newline`. In every other case, keep today's success and measured size.
> FR-006 protects notes that have a body. The Q1 ruling allows one new reason, and only for the defective class. FR-002 makes properties-only notes part of that class, so a bare `before === ""` would let the defect through silently on those notes.
>
> I2. Accept. Add "except the ambiguous case in Edge Cases" to FR-002 and SC-002.
>
> I3. Accept the reword: "inline calls skip the read-back; every default-mode call reads the note once more."
>
> I4. Accept the FR-007 reword: "MUST NOT overwrite a change it has observed; a residual window between the check and the atomic rename is accepted." It is consistent with the Q1 last-write-wins ruling.
>
> G1. Accept. Add a note to tasks.md that FR-008's shipped-docs part is delivered by `/speckit-docs-as-code`.
>
> T1. Accept. Say "properties block (frontmatter)" once in the T013 docs edit.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0118 - Fix Prepend Empty File FR-009 Divergence.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/prepend.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0118 - Fix Prepend Empty File FR-009 Divergence.md`: Appended a dated audit comment recording the answers to the /speckit-analyze findings: C1 wrap as FS_WRITE_FAILED with no new reason; I1 option A widened to the bodiless class; I2/I3/G1/T1 accepted; I4 FR-007 reworded.

**Sent to the step:**

> Yes. Apply remediation for all findings, as follows.
>
> C1. Accept. Wrap a non-ENOENT failure of the pre-read as `UpstreamError` `FS_WRITE_FAILED` `{ errno, syscall: "open", path }`, with no new `reason`. Raise it before the Obsidian call, so nothing is written. Add this case to FR-009's exception list. Update research D3, data-model §Sequence, contract §4, and T006/T008(a). Leave the pre-existing raw rethrow from `stat` alone; it is outside this BI's scope.
> Constitution Principle IV requires an `UpstreamError` at every boundary and supersedes the spec where they disagree (Governance).
>
> I1. Option A, with one change: the condition is "`before` was bodiless" (empty, or properties-only as the plan already classifies it without a wrapper-side parser), not only `before === ""`. In that class, a failed read-back fails with `FS_WRITE_FAILED` and `reason: extra-trailing-newline`. In every other case, keep today's success and measured size.
> FR-006 protects notes that have a body. The Q1 ruling allows one new reason, and only for the defective class. FR-002 makes properties-only notes part of that class, so a bare `before === ""` would let the defect through silently on those notes.
>
> I2. Accept. Add "except the ambiguous case in Edge Cases" to FR-002 and SC-002.
>
> I3. Accept the reword: "inline calls skip the read-back; every default-mode call reads the note once more."
>
> I4. Accept the FR-007 reword: "MUST NOT overwrite a change it has observed; a residual window between the check and the atomic rename is accepted." It is consistent with the Q1 last-write-wins ruling.
>
> G1. Accept. Add a note to tasks.md that FR-008's shipped-docs part is delivered by `/speckit-docs-as-code`.
>
> T1. Accept. Say "properties block (frontmatter)" once in the T013 docs edit.

## 5. pre-implementation / analyze (2026-10-31T12:11:48.026Z)

**Question (verbatim):**

> ## I1 follow-up: the read-back failure cannot classify properties-only notes
>
> I applied C1, I2, I3, I4, G1 and T1. I1 as worded cannot be implemented.
>
> **Context**: the plan never classifies `before` on its own. It decides "bodiless" from the pair (`before`, `after`): `landedAtEmptyBody(before, content, after)` checks whether Obsidian's write put `content + "\n"` at the very end of the note (research D2). That is what lets it avoid a wrapper-side frontmatter parser (spec 045 FR-005b). When the read-back of `after` fails, the only parser-free fact left is whether `before === ""`. Telling a properties-only `before` (for example `"---\nkey: v\n---\n"`) from a note with a body would require detecting the properties block in the wrapper, which FR-005b forbids. Obsidian adds one LF on every default-mode call (research F2), so the size check cannot tell them apart either.
>
> So on a read-back failure with a non-empty `before`, the tool cannot know whether it is in the defective class. Which way should that unknown case go?
>
> **Recommended:** Option B. It is the only option that never makes a false claim and never stays silent, as Principle IV requires. The message says the content landed and must not be re-sent, so an agent will not duplicate the text. It uses the cohort's existing `FS_WRITE_FAILED { errno, syscall, path }` shape, with no new reason. The cost is a failure result for a note with a body, but only when a read fails immediately after Obsidian's own successful write, which should be very rare.
>
> | Option | Description |
> |--------|-------------|
> | A | `before === ""` → `FS_WRITE_FAILED` `reason: extra-trailing-newline`. Any non-empty `before` → today's success and measured size. Properties-only notes then get the extra line break silently in this rare case, the gap you rejected. |
> | B | `before === ""` → `FS_WRITE_FAILED` `reason: extra-trailing-newline` (certain). Any non-empty `before` → `FS_WRITE_FAILED` `{ errno, syscall: "open", path }` with no `reason`, and a message saying the content landed, must not be re-sent, and that the tool could not check whether Obsidian left an extra trailing line break. Honest in both directions. FR-009 gains exception (c), and FR-006 notes this narrow case. |
> | C | Any read-back failure → `FS_WRITE_FAILED` `reason: extra-trailing-newline`, including for notes with a body. The reason is then sometimes false. It breaks FR-006 and goes beyond the Q1 ruling's "defective class only". |
> | D | Retry the read-back once, then apply A or B to a second failure. This narrows the window but still needs A or B; say which. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> B
>
> My earlier I1 answer is replaced: the tool cannot detect a properties-only note without a wrapper-side parser, which FR-005b forbids. Constitution Principle IV rules out A, which stays silent, and C, which makes a false claim.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0118 - Fix Prepend Empty File FR-009 Divergence.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/prepend.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0118 - Fix Prepend Empty File FR-009 Divergence.md`: Appended a dated audit comment recording the I1 revision to option B (an empty `before` gives the extra-trailing-newline reason; a non-empty `before` gives FS_WRITE_FAILED with no reason and a content-landed message; FR-009 gains exception (c)), replacing the earlier widened-class answer.

**Sent to the step:**

> B
>
> My earlier I1 answer is replaced: the tool cannot detect a properties-only note without a wrapper-side parser, which FR-005b forbids. Constitution Principle IV rules out A, which stays silent, and C, which makes a false claim.

## 6. review / fix (2026-10-31T12:30:24.103Z)

**Question (verbatim):**

> Review finding 3: prepend now reads the whole note before every call, inline calls included, but an inline call never uses that text (Obsidian's inline write is already exact, research F2). The cost is a full-note read on every inline prepend, plus a new way for inline calls to fail: an unreadable note (any errno except ENOENT) now fails with FS_WRITE_FAILED before Obsidian is called, where before 076 it went through. Skipping that read for inline calls changes behaviour that specs/076-fix-empty-prepend/data-model.md (`before` is read before every call) and contract tests E2/E6 (`readCalls` has length 1 in inline mode) pin. FR-009 (b) allows that failure but does not require it for inline calls.
>
> | Option | What changes |
> |---|---|
> | A (recommended) | Read the note before the call only when `inline` is false. Inline calls go back to their behaviour before 076: no pre-read and no pre-read failure. The correction gate `before !== null` then excludes inline calls on its own; the size pre-filter stays as the cheap check that skips the read-back. Update data-model.md (the `before` row: read only in default mode, otherwise null), change E2/E6 to assert `readCalls` is empty, add one test that an unreadable note still prepends inline, and add a docs/tools/prepend.md note if the error table names inline. |
> | B | Keep the current behaviour (the pre-read runs on every call) and record finding 3 as declined in the review notes. |
>
> Recommended: A. Inline calls gain nothing from the read, and A brings them back in line with FR-009's base rule (failure behaviour unchanged for any input) instead of relying on the exception. Which option should I take?

**Advisor** (escalate: none):

> A
>
> Inline writes are already exact (research F2), so the pre-read gains nothing for them. Skipping it keeps inline calls under FR-009's base rule (failure behaviour unchanged), and BI-0118 is scoped to the defective empty-note and properties-only case only.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0118 - Fix Prepend Empty File FR-009 Divergence.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0118 - Fix Prepend Empty File FR-009 Divergence.md`: Appended a dated audit comment recording review finding 3 answered A: pre-read only in default mode; inline calls go back to their pre-076 behaviour.

**Sent to the step:**

> A
>
> Inline writes are already exact (research F2), so the pre-read gains nothing for them. Skipping it keeps inline calls under FR-009's base rule (failure behaviour unchanged), and BI-0118 is scoped to the defective empty-note and properties-only case only.

## 7. record / record-in-vault (2026-10-31T12:35:24.852Z)

**Question (verbatim):**

> The work for job BI-0118 is now a reviewed, documented pull request. Record that on the job's note, following the vault's conventions for backlog items:
> - the spec branch: 076-fix-empty-prepend
> - the feature folder in the code repository: specs/076-fix-empty-prepend
> - the pull request: https://github.com/marwansaab/obsidian-cli-mcp/pull/104 (number 104)
> - the status that means "in review" in this vault (if the vault has no such status, escalate `decision` with up to 3 choices)
> - a dated HTML comment saying Relay run obsidian-cli-mcp-bi-0118-2026-10-31 produced it.
>
> Dry run: no. In a dry run, change nothing: list each edit you would make in `vault_edits`, starting its change with "Would". Otherwise list each edit you made.

**Advisor** (escalate: none):

> Recorded on BI-0118, the same way as the in-review sibling BI-0115.
> - Status: `planned` → `in-review`, the backlog-item status meaning "in review" per the Vault Frontmatter Convention vocab (`queued | planned | in-flight | in-review | shipped | deferred | superseded | retired`).
> - `spec_branch`: `076-fix-empty-prepend`.
> - The `## Status` section now opens with an "In review — 2026-10-31" paragraph. It links PR #104 (https://github.com/marwansaab/obsidian-cli-mcp/pull/104) and names the spec branch and the feature folder `specs/076-fix-empty-prepend`.
> - A dated HTML comment at the end of the note says that Relay run obsidian-cli-mcp-bi-0118-2026-10-31 produced PR #104.
> - `updated` was already 2026-10-31.
> - Read back the status and the Status section to check them.

Sources: `000-Meta/Vault Frontmatter Convention.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0115 - Fix Read Trailing Newline Normalisation.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0118 - Fix Prepend Empty File FR-009 Divergence.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0118 - Fix Prepend Empty File FR-009 Divergence.md`: Frontmatter status planned → in-review.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0118 - Fix Prepend Empty File FR-009 Divergence.md`: Frontmatter spec_branch set to 076-fix-empty-prepend.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0118 - Fix Prepend Empty File FR-009 Divergence.md`: Added an 'In review — 2026-10-31' paragraph at the top of the ## Status section linking PR #104, the spec branch and the feature folder specs/076-fix-empty-prepend.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0118 - Fix Prepend Empty File FR-009 Divergence.md`: Appended a dated HTML comment: Relay run obsidian-cli-mcp-bi-0118-2026-10-31 produced PR #104 (spec branch, feature folder, status flip).

**Sent to the step:**

> Recorded on BI-0118, the same way as the in-review sibling BI-0115.
> - Status: `planned` → `in-review`, the backlog-item status meaning "in review" per the Vault Frontmatter Convention vocab (`queued | planned | in-flight | in-review | shipped | deferred | superseded | retired`).
> - `spec_branch`: `076-fix-empty-prepend`.
> - The `## Status` section now opens with an "In review — 2026-10-31" paragraph. It links PR #104 (https://github.com/marwansaab/obsidian-cli-mcp/pull/104) and names the spec branch and the feature folder `specs/076-fix-empty-prepend`.
> - A dated HTML comment at the end of the note says that Relay run obsidian-cli-mcp-bi-0118-2026-10-31 produced PR #104.
> - `updated` was already 2026-10-31.
> - Read back the status and the Status section to check them.
