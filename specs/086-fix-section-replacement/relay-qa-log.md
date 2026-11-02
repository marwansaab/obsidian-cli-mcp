# Relay Q&A log: speckit

Run `obsidian-cli-mcp-bi-0168-2026-11-02`, started 2026-11-02T05:18:42.678Z.

## 1. checks / preflight (2026-11-02T05:18:42.723Z)

**Question (verbatim):**

> Preflight for this Relay run of job BI-0168. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0168 in the vault.
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

> Primed for BI-0168 — Fix Patch Heading Replace On Mixed Line Ending Notes.
> Read: BI, Constitution (v1.5.1), Architecture (ARCH-014), ADR-009, ADR-048, feature page patch_heading (FEAT-026), Obsidian CLI MCP - Tool Notes (`patch_heading`, `set_property` sections). Session-start reads done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault.
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.
>
> Preflight checks:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` `vault_id` = `my-setup`, which matches `expected_vault_id` (read through vault `My-Setup-Vault`).
> 2. Backlog note: PASS. Found at `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0168 - Fix Patch Heading Replace On Mixed Line Ending Notes.md`. Title: "BI-0168 — Fix Patch Heading Replace On Mixed Line Ending Notes".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: planned` (not finished or abandoned). Body says the bug was re-validated on 2026-10-31 against 0.9.0-local and still happens; minimal repro is TC-00593.
> 5. Specify prompt: PASS. The `## /speckit-specify prompt` section exists and the prompt starts with `/speckit-specify Fix section replacement` (dash form). Note not changed.
> 6. Clarify skill: PASS. Loaded `anthropic-skills:speckit-clarify-skill` with "BI-0168 - Fix Patch Heading Replace On Mixed Line Ending Notes". Its answer rules apply from here on.
>
> Context for questions to come: the feature page's FR-015 says patch_heading keeps "the file's detected line ending (LF or CRLF)" when it rebuilds the note. A mixed-ending note breaks that single-ending assumption. The BI puts set_property's LF-frontmatter rewrite out of scope, and leaves append/prepend to be checked during the fix (fix them too only if they share the same offset fault). ADR-048: `bytes_written` is the change in size.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0168 - Fix Patch Heading Replace On Mixed Line Ending Notes.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-009 - Direct Filesystem Write Path Alongside CLI Bridge.md`, `200-Decisions/ADR-048 - Bytes Written Is The Size Change.md`, `patch_heading (FEAT-026)`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`, `000-Meta/MCP Tool Notes.md`, `210-Guidelines/Best Practices.md`, `200-Decisions/Decision Log.md`, `220-Planning/Session Handover.md`, `000-Meta/About This Vault.md`

**Sent to the step:**

> Primed for BI-0168 — Fix Patch Heading Replace On Mixed Line Ending Notes.
> Read: BI, Constitution (v1.5.1), Architecture (ARCH-014), ADR-009, ADR-048, feature page patch_heading (FEAT-026), Obsidian CLI MCP - Tool Notes (`patch_heading`, `set_property` sections). Session-start reads done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault.
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.
>
> Preflight checks:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` `vault_id` = `my-setup`, which matches `expected_vault_id` (read through vault `My-Setup-Vault`).
> 2. Backlog note: PASS. Found at `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0168 - Fix Patch Heading Replace On Mixed Line Ending Notes.md`. Title: "BI-0168 — Fix Patch Heading Replace On Mixed Line Ending Notes".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: planned` (not finished or abandoned). Body says the bug was re-validated on 2026-10-31 against 0.9.0-local and still happens; minimal repro is TC-00593.
> 5. Specify prompt: PASS. The `## /speckit-specify prompt` section exists and the prompt starts with `/speckit-specify Fix section replacement` (dash form). Note not changed.
> 6. Clarify skill: PASS. Loaded `anthropic-skills:speckit-clarify-skill` with "BI-0168 - Fix Patch Heading Replace On Mixed Line Ending Notes". Its answer rules apply from here on.
>
> Context for questions to come: the feature page's FR-015 says patch_heading keeps "the file's detected line ending (LF or CRLF)" when it rebuilds the note. A mixed-ending note breaks that single-ending assumption. The BI puts set_property's LF-frontmatter rewrite out of scope, and leaves append/prepend to be checked during the fix (fix them too only if they share the same offset fault). ADR-048: `bytes_written` is the change in size.

## 2. pre-implementation / specify (2026-11-02T05:19:29.705Z)

**Question (verbatim):**

> Return the full content of the "/speckit-specify prompt" section of job BI-0168's note, verbatim and complete, in `answer`, without the surrounding code fence. Do not edit or summarise it. If the note has no such section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-specify Fix section replacement
>
> ## Feature
> Replacing the body of a named heading writes the new body exactly under that heading and nowhere else, whatever mix of line endings the note uses.
>
> ## Why
> In notes whose top block uses one line-ending style and whose body uses another, replacing a section's body currently writes the new text further down the note, overwriting unrelated sections and leaving the target section unchanged, while reporting success. Setting a property on a Windows-style note produces exactly this mix, so the corruption follows naturally from normal use and is easy to miss.
>
> ## User stories
> - As an agent, I want a section replacement to change only the named section, so that the rest of the note is never overwritten.
> - As an agent working on notes with mixed line endings, I want section replacement to behave exactly as it does on uniform notes, so that I do not have to inspect line endings before every edit.
> - As a note owner, I want any line endings outside the replaced section kept exactly as they were, so that the edit does not churn the file.
>
> ## Acceptance criteria
>
> **Story: only the named section changes**
> - Given a note with a frontmatter block in one line-ending style and a body in the other, when an agent replaces the body of a heading near the end of the note, then the new body appears directly under that heading and every byte before the heading and after the section is unchanged.
> - Given the same note, when the agent replaces the body of the first heading, then the following sections are unchanged.
>
> **Story: same behaviour on mixed and uniform notes**
> - Given two notes with identical text, one with uniform line endings and one with mixed line endings, when the same replacement is made on each, then the resulting text of each note is identical apart from line endings.
>
> **Story: line endings preserved**
> - Given a note with mixed line endings, when a section body is replaced, then the line endings outside the replaced section are unchanged.
>
> **Story: no silent corruption**
> - Given a replacement that cannot be placed safely under the named heading, when the agent makes it, then the call fails with an error and the note is not changed.
>
> ## Out of scope
> - Changing how property edits write the frontmatter block's line endings (tracked separately).
> - The append and prepend modes of section editing, unless they share the same fault — verify and fix together if so.
> - Normalising line endings across a whole note.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0168 - Fix Patch Heading Replace On Mixed Line Ending Notes.md`

**Sent to the step:**

> /speckit-specify Fix section replacement
>
> ## Feature
> Replacing the body of a named heading writes the new body exactly under that heading and nowhere else, whatever mix of line endings the note uses.
>
> ## Why
> In notes whose top block uses one line-ending style and whose body uses another, replacing a section's body currently writes the new text further down the note, overwriting unrelated sections and leaving the target section unchanged, while reporting success. Setting a property on a Windows-style note produces exactly this mix, so the corruption follows naturally from normal use and is easy to miss.
>
> ## User stories
> - As an agent, I want a section replacement to change only the named section, so that the rest of the note is never overwritten.
> - As an agent working on notes with mixed line endings, I want section replacement to behave exactly as it does on uniform notes, so that I do not have to inspect line endings before every edit.
> - As a note owner, I want any line endings outside the replaced section kept exactly as they were, so that the edit does not churn the file.
>
> ## Acceptance criteria
>
> **Story: only the named section changes**
> - Given a note with a frontmatter block in one line-ending style and a body in the other, when an agent replaces the body of a heading near the end of the note, then the new body appears directly under that heading and every byte before the heading and after the section is unchanged.
> - Given the same note, when the agent replaces the body of the first heading, then the following sections are unchanged.
>
> **Story: same behaviour on mixed and uniform notes**
> - Given two notes with identical text, one with uniform line endings and one with mixed line endings, when the same replacement is made on each, then the resulting text of each note is identical apart from line endings.
>
> **Story: line endings preserved**
> - Given a note with mixed line endings, when a section body is replaced, then the line endings outside the replaced section are unchanged.
>
> **Story: no silent corruption**
> - Given a replacement that cannot be placed safely under the named heading, when the agent makes it, then the call fails with an error and the note is not changed.
>
> ## Out of scope
> - Changing how property edits write the frontmatter block's line endings (tracked separately).
> - The append and prepend modes of section editing, unless they share the same fault — verify and fix together if so.
> - Normalising line endings across a whole note.

## 3. pre-implementation / clarify (2026-11-02T05:22:00.475Z)

**Question (verbatim):**

> **Question:** Should this feature also fix `patch_block`, which lands its edits in the wrong place on notes with mixed line endings in the same way as `patch_heading`? (Out of Scope / Assumptions)
>
> **Why it matters:** If it is left out, block-reference edits on the same notes keep silently overwriting the wrong lines after this feature ships. If it is included, the plan, the tests and the help references grow to cover a second tool.
>
> **Context (from the code index):** `executePatchBlock` (`src/tools/patch_block/handler.ts:113-123`) splits the note only on CRLF as soon as the note contains a single CRLF. Its block finder `findBlock` → `scanBlocks` → `splitLinesForScan` (`src/tools/patch_block/block-scan.ts:65`) splits on every line feed. This is the same mismatch as `patch_heading`'s `walkHeadings` against its handler. `patch_block` also has no re-read race check, so nothing would catch a wrong placement. Precedent: in feature 085, the sibling tool `smart_connections_similar` was brought into scope once it was found to share the fault.
>
> **Recommended:** Option A - It is the same fault with the same fix shape, and it causes the same silent data loss on the same notes (any CRLF note after a property edit). Fixing it here follows the 085 precedent and avoids shipping a known corruption path next to the fix.
>
> | Option | Description |
> |--------|-------------|
> | A | Include `patch_block`: apply the same rules to it (edits land at the block found, line endings outside the edit are kept, mixed and uniform notes behave the same, and an unsafe placement is refused without writing), with tests and a help-reference update. |
> | B | Keep `patch_block` out of scope: record in the spec that it shares the fault, and leave it for a separate backlog item. |
> | C | Include only a safety net for `patch_block`: refuse edits on notes with mixed line endings with an error, without fixing the placement itself. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: scope: BI-0168 covers only `patch_heading`, and its fix-together clause names only the append and prepend modes. Adding `patch_block`, a second tool with no BI covering this fault, widens the job's scope.):

> A
>
> Rationale: BI-0168's Out of scope already says to "verify and fix together" any sibling path that shares the same offset fault (written for append/prepend). The same fault in `patch_block` causes the same silent data loss on the same notes: any CRLF note that has had a property set. Feature 085's precedent points the same way. If the owner rules B instead: record in the spec's Assumptions that `patch_block` shares the fault, and leave it for a separate BI.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0168 - Fix Patch Heading Replace On Mixed Line Ending Notes.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0097 - Add Patch Block.md`

**Advisor, after the owner ruled** (escalate: none):

> A
>
> Rationale: owner ruling 2026-11-02 puts `patch_block` in scope. Apply the same rules to it as to `patch_heading`: the edit lands at the block found, line endings outside the edit are kept, mixed and uniform notes behave the same, and an unsafe placement is refused without writing. Include tests and a help-reference update. Recorded under BI-0168 `## Out of scope` and `## Related`.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0168 - Fix Patch Heading Replace On Mixed Line Ending Notes.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0168 - Fix Patch Heading Replace On Mixed Line Ending Notes.md`: Out of scope section: added a bullet recording the owner ruling (2026-11-02) that patch_block is in scope, with the same rules, tests and help-reference update; the specify prompt was not changed.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0168 - Fix Patch Heading Replace On Mixed Line Ending Notes.md`: Related section: added a [[patch_block]] link noting the in-scope ruling.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0168 - Fix Patch Heading Replace On Mixed Line Ending Notes.md`: Frontmatter updated: 2026-10-31 → 2026-11-02; added a dated HTML audit comment at the end of the note.

**Owner:** choice 1 (A: include patch_block), via cli, 2026-11-02T05:22:54.608Z.

**Sent to the step:**

> A
>
> Rationale: owner ruling 2026-11-02 puts `patch_block` in scope. Apply the same rules to it as to `patch_heading`: the edit lands at the block found, line endings outside the edit are kept, mixed and uniform notes behave the same, and an unsafe placement is refused without writing. Include tests and a help-reference update. Recorded under BI-0168 `## Out of scope` and `## Related`.

## 4. pre-implementation / analyze (2026-11-02T05:36:03.251Z)

**Question (verbatim):**

> ## Specification Analysis Report
>
> | ID | Category | Severity | Location(s) | Summary | Recommendation |
> |----|----------|----------|-------------|---------|----------------|
> | G1 | Inconsistency (approval gate) | MEDIUM | plan.md Test-edit scope; tasks.md T008, T013 | The plan deletes the `detectLineEnding` describe blocks in `body-edit.test.ts` and `block-edit.test.ts`, and says this needs owner approval at plan review (`.memory/refactor-decisions.md` §5). No approval is recorded yet. | Record the owner's decision before `/speckit-implement`: approve the deletion, or switch T007/T008/T013 to the fallback (keep `detectLineEnding` exported, with its tests). |
> | I1 | Inconsistency | MEDIUM | tasks.md:257 (T015) | T015 says the FR-018 gate stays red "until T027", but there is no T027. The baseline task is T021 (the T020 checkpoint says T021). | Change "T027" to "T021". |
> | I2 | Inconsistency | MEDIUM | spec.md FR-011, FR-012, FR-017; plan.md / research D6; tasks T014, T019, T021 | The plan adds `UNSAFE_PLACEMENT` to both tools' published description enumerations, so two description fingerprints move. The spec never mentions a description change; FR-012 and FR-017 only name the help reference. SC-006 allows it, but the spec does not say so. | Extend FR-012 and FR-017: "the published description's typed-error list MUST include `UNSAFE_PLACEMENT`". Note in SC-006 that only the two description fingerprints move. |
> | C1 | Coverage gap | MEDIUM | spec.md Edge Cases (patch_block on a heading-attached block; marker inside frontmatter); tasks.md Phase 5 | The spec says `BLOCK_ON_HEADING` and frontmatter-marker exclusion behave the same on mixed notes, but every existing test uses uniform notes, and no B-row covers this. | Add contract row B6 and extend T010: on `mixFmLfBodyCrlf`, a heading-attached marker gives `BLOCK_ON_HEADING` and a frontmatter-only `^id` gives `BLOCK_NOT_FOUND`, both with no write. |
> | C2 | Coverage gap | MEDIUM | spec.md Edge Cases ("Content supplied with its own line endings"); contract H/B rows | No row checks that agent content containing CRLF is written with the FR-005 ending (the heading's line ending) on a mixed note. | Add contract row H11 and extend T016: on `mixFmCrlfBodyLf`, `replace` with content `"a\r\nb"` writes `"a\nb\n"`. |
> | A1 | Ambiguity / conflict | LOW | spec.md FR-002 against FR-006 | FR-002 says every byte up to the start of the direct body is unchanged, which includes the heading line's terminator. But when the last heading's body is replaced with empty content in a note with no final line break, FR-006 (today's rule) strips that terminator. The plan resolves this (prefix ends before the terminator; H8), but the spec contradicts itself in that edge case. | Add "subject to FR-006" to FR-002, and the same to the FR-014 byte clause. |
> | U1 | Underspecification | LOW | tasks.md T003 (N3) against contract N3 | T003 checks V1 against a restated copy of the scanner's split rule, not the real walker. A future change to `splitLinesForScan` would not be caught. | Also assert, in both mixes, that for every heading `walkHeadings` resolves, `lineText(splitNoteLines(raw)[markerLineIndex]) === markerLineText`. |
> | U2 | Underspecification | LOW | tasks.md T009 | "`git stash` the handler only" is risky with other uncommitted work in the tree. | Use "save the T006 diff (`git diff -- <file> > tmp.patch`), `git checkout -- <file>`, run H9, then `git apply tmp.patch`", or run H9 before T006. |
> | C3 | Coverage gap | LOW | spec.md Edge Cases (lone carriage returns) | Only the pure row N4 covers it; no handler-level row does. | Optional: a handler row whose last line is `## H\r`, with `append`, to show no false `UNSAFE_PLACEMENT`. |
> | I3 | Inconsistency | LOW | checklists/requirements.md Notes | The notes still say `patch_block` stays out of scope, which contradicts the clarification. (Clarify could only toggle the checkbox markers.) | Update the Notes bullet to record the Session 2026-11-02 ruling. |
>
> **Coverage Summary Table:**
>
> | Requirement Key | Has Task? | Task IDs | Notes |
> |-----------------|-----------|----------|-------|
> | FR-001 index agreement | Yes | T003, T004, T005, T006 | |
> | FR-002 replace placement | Yes | T005, T006 | A1 |
> | FR-003 append/prepend | Yes | T005, T006 | |
> | FR-004 kept endings | Yes | T016 | |
> | FR-005 insert ending | Yes | T004, T005 | C2 |
> | FR-006 final line break | Yes | T004, T016 | |
> | FR-007 mixed = uniform | Yes | T009 | |
> | FR-008 uniform unchanged | Yes | T009, T023 | |
> | FR-009 placement check | Yes | T017, T018 | |
> | FR-010 error code | Yes | T017, T018, T023 | |
> | FR-011 surface unchanged | Yes | T021, T023 | I2 |
> | FR-012 help reference | Yes | T019, T020 | I2 |
> | FR-013 heading tests | Yes | T003, T005, T009, T016, T017 | |
> | FR-014 block placement | Yes | T010, T012 | C1 |
> | FR-015 block endings | Yes | T010, T012 | |
> | FR-016 block refusal | Yes | T011, T012 | |
> | FR-017 block surface/help | Yes | T014, T015, T021 | I2 |
> | FR-018 block tests | Yes | T010, T011 | |
> | SC-001 | Yes | T005 | |
> | SC-002 | Yes | T009, T010 | |
> | SC-003 | Yes | T010, T016 | |
> | SC-004 | Yes | T009, T010 | |
> | SC-005 | Yes | T011, T017 | |
> | SC-006 | Yes | T021, T023 | |
> | SC-007 | Yes | T010 | |
>
> **Constitution Alignment Issues:** none. Principles I–V, ADR-009/015/040, the MCP Tool Surface Standards and the Security Defaults are all satisfied as planned. The new `vi.mock` usage breaks no constitution or lint rule (no restriction in `eslint.config.js`). Kernel-node no-touch claims: HEAD is still `926bac7`, the plan-time commit, so the plan's CodeGraph structural check stands.
>
> **Unmapped Tasks:** none. T001 and T021–T026 are setup and cross-cutting gates.
>
> **Metrics:**
> - Total Requirements: 25 (18 FR + 7 SC)
> - Total Tasks: 26
> - Coverage: 100% (requirements with at least one task)
> - Ambiguity Count: 1
> - Duplication Count: 0
> - Critical Issues Count: 0
>
> **Next Actions:** there are no CRITICAL or HIGH issues, so implementation may proceed. Resolve G1 (the owner's decision on the test deletion) before `/speckit-implement`. I1, I2, C1 and C2 are small edits to spec.md, tasks.md and the contract; A1, U1, U2, C3 and I3 are optional tidy-ups.
>
> Would you like me to suggest concrete remediation edits for the top N issues?

**Advisor** (escalate: decision: The plan itself makes deleting the `detectLineEnding` tests (G1) depend on the owner's approval at plan review. The vault has no ruling on it, so approving it here would create a decision.):

> Yes. Apply all remediations now, except G1, which waits for the owner.
>
> G1. Record the owner's decision in `.memory/refactor-decisions.md` §5 before `/speckit-implement`. Recommended: approve deleting the `detectLineEnding` describe blocks, but only if the fix leaves `detectLineEnding` with no callers in `src/`. If any caller remains, use the fallback: keep it exported, with its tests.
> I1. Change "T027" to "T021" in T015.
> I2. Extend FR-012 and FR-017: the published description's typed-error list MUST include `UNSAFE_PLACEMENT`. In SC-006, state that only the two description fingerprints move. Keep `UNSAFE_PLACEMENT` as a `details.code` under the existing top-level code, so no new top-level code is added (ADR-015).
> C1. Add contract row B6 and extend T010 as proposed: on mixed notes, `BLOCK_ON_HEADING` and the frontmatter-marker `BLOCK_NOT_FOUND`, both with no write.
> C2. Add H11 and extend T016 as proposed.
> A1. Add "subject to FR-006" to FR-002 and to the FR-014 byte clause.
> U1. Add the real-walker assertion to T003.
> U2. Use the `git diff > tmp.patch` / `checkout` / `apply` sequence, or run H9 before T006. Never `git stash` with other uncommitted work in the tree.
> C3. Add the lone-CR handler row. It is cheap, and it covers the risk of a false refusal.
> I3. Update the requirements-checklist Notes: `patch_block` is in scope (Session 2026-11-02 ruling).
>
> Rationale: BI-0168's "no silent corruption" acceptance criterion and Constitution Principle II (failure and boundary tests ship with the changed surface) support adding every coverage row. The `patch_block` scope ruling is recorded in BI-0168 under Out of scope.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0168 - Fix Patch Heading Replace On Mixed Line Ending Notes.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`

**Advisor, after the owner ruled** (escalate: none):

> Yes. Apply all remediations now.
>
> G1. Owner approved, on one condition. Record in `.memory/refactor-decisions.md` §5: delete the `detectLineEnding` describe blocks in `body-edit.test.ts` and `block-edit.test.ts` only if the fix leaves `detectLineEnding` with no callers in `src/`. Check this after T006/T012. If any caller remains, switch T007/T008/T013 to the fallback: keep it exported, with its tests.
> I1. Change "T027" to "T021" in T015.
> I2. Extend FR-012 and FR-017: the published description's typed-error list MUST include `UNSAFE_PLACEMENT`. In SC-006, state that only the two description fingerprints move. Keep `UNSAFE_PLACEMENT` as a `details.code` under the existing top-level code, so no new top-level code is added (ADR-015).
> C1. Add contract row B6 and extend T010 as proposed: on mixed notes, `BLOCK_ON_HEADING` and the frontmatter-marker `BLOCK_NOT_FOUND`, both with no write.
> C2. Add H11 and extend T016 as proposed.
> A1. Add "subject to FR-006" to FR-002 and to the FR-014 byte clause.
> U1. Add the real-walker assertion to T003.
> U2. Use the `git diff > tmp.patch` / `checkout` / `apply` sequence, or run H9 before T006. Never `git stash` with other uncommitted work in the tree.
> C3. Add the lone-CR handler row. It is cheap, and it covers the risk of a false refusal.
> I3. Update the requirements-checklist Notes: `patch_block` is in scope (Session 2026-11-02 ruling).
>
> Rationale: owner ruling 2026-11-02, recorded on BI-0168. BI-0168's "no silent corruption" acceptance criterion and Constitution Principle II support adding every coverage row.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0168 - Fix Patch Heading Replace On Mixed Line Ending Notes.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0168 - Fix Patch Heading Replace On Mixed Line Ending Notes.md`: Appended a dated HTML audit comment recording the owner's G1 ruling: delete the detectLineEnding test blocks only if detectLineEnding has no callers left in src/, otherwise use the fallback (keep it exported, with its tests).

**Owner:** choice 1 (Approve deletion if no callers), via cli, 2026-11-02T05:40:05.030Z.

**Sent to the step:**

> Yes. Apply all remediations now.
>
> G1. Owner approved, on one condition. Record in `.memory/refactor-decisions.md` §5: delete the `detectLineEnding` describe blocks in `body-edit.test.ts` and `block-edit.test.ts` only if the fix leaves `detectLineEnding` with no callers in `src/`. Check this after T006/T012. If any caller remains, switch T007/T008/T013 to the fallback: keep it exported, with its tests.
> I1. Change "T027" to "T021" in T015.
> I2. Extend FR-012 and FR-017: the published description's typed-error list MUST include `UNSAFE_PLACEMENT`. In SC-006, state that only the two description fingerprints move. Keep `UNSAFE_PLACEMENT` as a `details.code` under the existing top-level code, so no new top-level code is added (ADR-015).
> C1. Add contract row B6 and extend T010 as proposed: on mixed notes, `BLOCK_ON_HEADING` and the frontmatter-marker `BLOCK_NOT_FOUND`, both with no write.
> C2. Add H11 and extend T016 as proposed.
> A1. Add "subject to FR-006" to FR-002 and to the FR-014 byte clause.
> U1. Add the real-walker assertion to T003.
> U2. Use the `git diff > tmp.patch` / `checkout` / `apply` sequence, or run H9 before T006. Never `git stash` with other uncommitted work in the tree.
> C3. Add the lone-CR handler row. It is cheap, and it covers the risk of a false refusal.
> I3. Update the requirements-checklist Notes: `patch_block` is in scope (Session 2026-11-02 ruling).
>
> Rationale: owner ruling 2026-11-02, recorded on BI-0168. BI-0168's "no silent corruption" acceptance criterion and Constitution Principle II support adding every coverage row.

## 5. record / record-in-vault (2026-11-02T06:10:18.719Z)

**Question (verbatim):**

> The work for job BI-0168 is now a reviewed, documented pull request. Record that on the job's note, following the vault's conventions for backlog items:
> - the spec branch: 086-fix-section-replacement
> - the feature folder in the code repository: specs/086-fix-section-replacement
> - the pull request: https://github.com/marwansaab/obsidian-cli-mcp/pull/119 (number 119)
> - the status that means "in review" in this vault (if the vault has no such status, escalate `decision` with up to 3 choices)
> - a dated HTML comment saying Relay run obsidian-cli-mcp-bi-0168-2026-11-02 produced it.
>
> Dry run: no. In a dry run, change nothing: list each edit you would make in `vault_edits`, starting its change with "Would". Otherwise list each edit you made.

**Advisor** (escalate: none):

> Recorded on BI-0168, following the same pattern as sibling BI-0167 (also in review):
> - Frontmatter `status`: changed from `planned` to `in-review`. This is the vault's existing "in review" value; 18 other Obsidian CLI MCP BIs already use it.
> - Frontmatter `spec_branch`: set to `086-fix-section-replacement`.
> - `## Status`: added a dated paragraph at the top: "In review — 2026-11-02". It links PR #119, names spec branch `086-fix-section-replacement` and feature folder `specs/086-fix-section-replacement`, notes that the fix covers both `patch_heading` and `patch_block`, and says it is awaiting the owner's merge.
> - Added a dated HTML comment at the end of the note: Relay run obsidian-cli-mcp-bi-0168-2026-11-02 produced PR #119.
>
> Read the whole note back afterwards: all four edits are in place, the frontmatter is intact, and the `updated` date is still 2026-11-02.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0168 - Fix Patch Heading Replace On Mixed Line Ending Notes.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0167 - Apply Smart Connections Query Limit After Tie Break Sort.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0168 - Fix Patch Heading Replace On Mixed Line Ending Notes.md`: Frontmatter status: planned → in-review.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0168 - Fix Patch Heading Replace On Mixed Line Ending Notes.md`: Frontmatter spec_branch set to 086-fix-section-replacement.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0168 - Fix Patch Heading Replace On Mixed Line Ending Notes.md`: Added a dated 'In review — 2026-11-02' paragraph at the top of the Status section, with PR #119, the spec branch and the feature folder specs/086-fix-section-replacement.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0168 - Fix Patch Heading Replace On Mixed Line Ending Notes.md`: Appended a dated HTML comment: Relay run obsidian-cli-mcp-bi-0168-2026-11-02 produced PR #119.

**Sent to the step:**

> Recorded on BI-0168, following the same pattern as sibling BI-0167 (also in review):
> - Frontmatter `status`: changed from `planned` to `in-review`. This is the vault's existing "in review" value; 18 other Obsidian CLI MCP BIs already use it.
> - Frontmatter `spec_branch`: set to `086-fix-section-replacement`.
> - `## Status`: added a dated paragraph at the top: "In review — 2026-11-02". It links PR #119, names spec branch `086-fix-section-replacement` and feature folder `specs/086-fix-section-replacement`, notes that the fix covers both `patch_heading` and `patch_block`, and says it is awaiting the owner's merge.
> - Added a dated HTML comment at the end of the note: Relay run obsidian-cli-mcp-bi-0168-2026-11-02 produced PR #119.
>
> Read the whole note back afterwards: all four edits are in place, the frontmatter is intact, and the `updated` date is still 2026-11-02.
