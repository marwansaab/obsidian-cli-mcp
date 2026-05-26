---

description: "Task list for BI-046 — reconcile truncation docs (docs-only feature)"
---

# Tasks: Reconcile Truncation Docs

**Input**: Design documents from [/specs/046-reconcile-truncation-docs/](./)
**Prerequisites**: [plan.md](plan.md) (required), [spec.md](spec.md) (required for user stories), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Not included. Docs-only feature; Constitution Principle II is N/A per `.specify/memory/constitution.md:441` (docs-only PR carve-out). Project memory rule: this repo holds unit tests only — manual probe captures land on canonical TC pages in the user's external test tracker, not as TCs under `specs/`.

**Organization**: Tasks are grouped by user story (US1 = P1, US2 = P2, US3 = P3) so each story can land independently. Phase 2 (foundational) holds the FR-012 empirical probe gate + the mirror file + the BI-042 forward-pointer — none of the user-story phases can start before Phase 2 lands because the inline doc anchors point into the mirror file and the search.md doc-structure decision depends on the P1-vs-P2 probe-divergence outcome.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Project root: `c:\Github\obsidian-cli-mcp\`. Touched paths:

- `docs/tools/search.md` — truncation section corrected
- `docs/tools/context_search.md` — truncation section corrected
- `docs/tools/backlinks.md` — BYTE-IDENTICAL (FR-008)
- `specs/046-reconcile-truncation-docs/contracts/truncation-direction-evidence.md` — mirror file populated
- `specs/042-close-audit-findings/contracts/truncation-direction-evidence.md` — one-line forward-pointer inserted

No `src/` or `*.test.ts` touched.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Pre-flight checks before any live-CLI probe runs.

- [ ] T001 Verify wrapper at `v0.7.1` — read `package.json` `version` field; if not `0.7.1`, STOP and either bump the working copy or rewrite the FR-012 anchor pin in [spec.md](spec.md), [research.md](research.md) Decision 3, and [data-model.md](data-model.md) Entity 2a, then re-run `/speckit-plan`. This is the anchor that locks the empirical evidence per spec clarification Q3.
- [ ] T002 [P] Read [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) — names the authorised test vault, the scratch subdirectory, and the destructive-probe protocol. Required gate for any live-CLI probe per `CLAUDE.md` `## Test Execution`.
- [ ] T003 [P] Confirm canonical TC pages exist in the user's external test tracker — `[[TC-00306]]` (search default + line modes) and `[[TC-00328]]` (context_search). The mirror file back-links to both per FR-007; missing TC pages break the mirror-discipline rule.

**Checkpoint**: pre-flight complete; safe to invoke live-CLI probes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Empirical probe gate (FR-012) + mirror-file population (FR-007) + BI-042 forward-pointer (FR-011). The user-story phases all read from the mirror file's per-probe rows; the search.md doc-structure decision depends on the P1-vs-P2 probe-divergence outcome.

**⚠️ CRITICAL**: No user-story work begins until Phase 2 lands.

- [ ] T004 [P] Probe P1 — `search` default mode at `v0.7.1` against the BI-0011 fixture set, `limit: 2`, no `context_lines`. Capture: observed visible subset (response order), engine pre-sort response (re-run with `limit ≥ full result set`), full sorted result set (re-sort by `path asc`), slice direction within engine pre-sort, engine natural sort order. Record on `[[TC-00306]]` (extend with `v0.7.1` default-mode row).
- [ ] T005 [P] Probe P2 — `search` line mode at `v0.7.1` against BI-0011, `limit: 2`, `context_lines: true`. Same capture set as T004, sort by `path asc, line asc`. Note: routes through upstream `obsidian search:context` — the SAME subcommand `context_search` uses (per [research.md](research.md) Decision 3). Record on `[[TC-00306]]` (extend with `v0.7.1` line-mode row) OR on a new TC dedicated to the line-mode probe.
- [ ] T006 [P] Probe P3 — `context_search` at `v0.7.1` against BI-0011, `limit: 2`. Same capture set as T005. Record on `[[TC-00328]]`.
- [ ] T007 [P] Probe P4 — `backlinks` parity sanity check at `v0.7.1` against BI-0011, `limit: 2`, target_mode `specific`. Capture: observed visible subset, full sorted result set (sort by `source` UTF-16 asc). Confirm `backlinks` still slices leading-of-sorted-set. If P4 contradicts the assumption, STOP and escalate — FR-008 and FR-013 are jointly wrong and the BI needs re-scoping per [research.md](research.md) Decision 3 outcome table.
- [ ] T008 Lock the `search.md` doc-structure decision from P1-vs-P2 outcome (FR-012 gate): if P1 ≡ P2 → single-block in `search.md` truncation section with "applies to both default and line mode" sentence; if P1 ≠ P2 → per-mode subsections, each with its own inline anchor and its own pointer into the mirror file. Record the decision (and the underlying response-delta) at the bottom of P2's row in [specs/046-reconcile-truncation-docs/contracts/truncation-direction-evidence.md](contracts/truncation-direction-evidence.md). Depends on T004 + T005.
- [ ] T009 Populate [specs/046-reconcile-truncation-docs/contracts/truncation-direction-evidence.md](contracts/truncation-direction-evidence.md) — fill the version triple (wrapper `@marwansaab/obsidian-cli-mcp@v0.7.1`, Obsidian Integrated CLI plugin version, Obsidian desktop app version; `unknown` permitted per Q3), the four per-probe rows from T004-T007 results, and the per-tool summary prose for `search` and `context_search` per [data-model.md](data-model.md) Entity 2. Mirror discipline: every field MUST appear on the corresponding TC page; no fact introduced here that the TC pages don't carry. Depends on T004, T005, T006, T007, T008.
- [ ] T010 [P] Insert one-line forward-pointer at the top of [specs/042-close-audit-findings/contracts/truncation-direction-evidence.md](../042-close-audit-findings/contracts/truncation-direction-evidence.md) per FR-011 + [data-model.md](data-model.md) Entity 3. Form: blockquote, one line, immediately after the existing H1, naming the supersession scope (`search` and `context_search` only) and explicitly noting that the `backlinks` row below remains current. MUST NOT alter any other content in the file. Independent of T004-T009 because the BI-046 stub mirror file already exists in the repo from `/speckit-plan` (commit `17a0c5f`).

**Checkpoint**: probe evidence captured, mirror file populated, BI-042 forward-pointer in place. Doc-edit phases can now begin in parallel.

---

## Phase 3: User Story 1 - Agent picks a correct narrowing strategy from the docs (Priority: P1) 🎯 MVP

**Goal**: Rewrite the truncation sections of `docs/tools/search.md` and `docs/tools/context_search.md` so an MCP agent reading either doc as a contract chooses a correct narrowing strategy on the first attempt — no more leading-of-sorted-set false claim, no more false cohort-uniformity sentence, instead a per-tool description naming the engine pre-sort response + the slice direction within it + the engine's natural sort order + the post-slice wrapper re-sort.

**Independent Test**: An agent (or human reader) opens the corrected `docs/tools/search.md` (resp. `docs/tools/context_search.md`) truncation section, reads the description, then runs the inline anchor's documented probe inputs against the current shipped version; the observed visible subset matches the documented description and the agent's chosen narrowing strategy (tighter `query` / `folder` / `limit`) lands on a valid result on the first attempt.

### Implementation for User Story 1

- [ ] T011 [US1] Rewrite the `### Truncation slice direction (BI-042 reconciliation)` section in [docs/tools/search.md](../../docs/tools/search.md) per FR-001 (drop leading-of-sorted-set claim), FR-002 (drop cohort-uniformity sentence), FR-003 (per-tool description: engine pre-sort response → leading slice within that pre-sort → wrapper output-sort applied to slice; name engine's natural sort order; name slice direction within pre-sort), FR-011 (drop the BI-042 evidence-link citation), FR-013 (one-sentence cohort-divergence call-out naming `backlinks`, NO forward-pointer to runtime BI). Embed the inline anchor summary per [data-model.md](data-model.md) Entity 1 (one line: fixture set + `limit: 2` + observed visible subset + capture date + mirror pointer). Rename section heading to exactly `### Truncation slice direction (BI-046 reconciliation)`. Doc structure (single block vs per-mode subsections) follows T008's locked decision. Depends on T008, T009.
- [ ] T012 [P] [US1] Rewrite the `### Truncation slice direction (BI-042 reconciliation)` section in [docs/tools/context_search.md](../../docs/tools/context_search.md) per FR-004 (drop leading-of-sorted-set claim), FR-005 (drop cohort-uniformity sentence), FR-006 (per-tool description, same four facts as FR-003 stated on its own terms — no cross-doc "see search.md" shortcut), FR-011 (drop BI-042 evidence-link citation), FR-013 (cohort-divergence sentence). Embed the inline anchor summary per Entity 1. Rename section heading to exactly `### Truncation slice direction (BI-046 reconciliation)`. Parallel with T011 — different file. Depends on T009.

**Checkpoint**: US1 fully functional and testable independently. A reader of either corrected doc can run the inline anchor's probe and confirm the description matches live behaviour. SC-001 satisfied (0 false claims about visible subset in `search.md` and `context_search.md`). SC-005 satisfied (agent picks correct narrowing strategy on first attempt).

---

## Phase 4: User Story 2 - Human reader gets a contract matching live behaviour (Priority: P2)

**Goal**: The reproducibility cross-check — the inline summary in the doc body, the mirror file under `specs/.../contracts/`, and the canonical TC pages all describe the same observation, byte-consistent. Without this, the doc rots back to the current broken state on the next behavioural drift because there's no reproducible anchor a future reader can re-derive truth from.

**Independent Test**: A reader follows the inline anchor's documented probe inputs against the current shipped version; observed visible subset byte-matches the inline anchor AND byte-matches the corresponding row in the mirror file AND is consistent with the canonical TC-page record.

### Implementation for User Story 2

- [ ] T013 [US2] Verify cross-entity invariant 1 for `search` — inline anchor in [docs/tools/search.md](../../docs/tools/search.md) (Entity 1) byte-matches `observed_visible_subset` of probe row P1 (and P2 if per-mode subsections) in [specs/046-reconcile-truncation-docs/contracts/truncation-direction-evidence.md](contracts/truncation-direction-evidence.md). If mismatch, fix the doc (the mirror is canonical against the TC page). Depends on T009, T011.
- [ ] T014 [P] [US2] Verify cross-entity invariant 1 for `context_search` — inline anchor in [docs/tools/context_search.md](../../docs/tools/context_search.md) (Entity 1) byte-matches `observed_visible_subset` of probe row P3 in the mirror file. Parallel with T013 — different file. Depends on T009, T012.

**Checkpoint**: US2 fully functional. SC-002 satisfied (probe inputs + observed-subset cross-consistent across doc / mirror / TC page). FR-010 satisfied (reproducibility without out-of-band knowledge).

---

## Phase 5: User Story 3 - Backlinks docs are preserved (Priority: P3)

**Goal**: Guardrail — the correction work for `search` and `context_search` does NOT collaterally rewrite a sentence that is currently true for `backlinks`. The cohort-uniformity sentence inside `backlinks.md` is deliberately left in place per the spec's explicit out-of-scope decision; this story enforces that nothing in this PR touches `backlinks.md`.

**Independent Test**: `git diff main -- docs/tools/backlinks.md` produces zero output after all other phases land.

### Implementation for User Story 3

- [ ] T015 [US3] Run `git diff main -- docs/tools/backlinks.md` from repo root; expect zero output (the baseline is the branch's merge-base with `main` per FR-008). If any change present (including editor-normalised whitespace or line-ending shifts), revert via `git checkout main -- docs/tools/backlinks.md`. The whole-file diff covers the cohort-uniformity sentence collateral-edit case (the cohort-uniformity sentence inside `backlinks.md` is deliberately left in place per spec Edge Cases bullet 1 — any in-section edit fails this check). Per FR-008 + SC-003.

**Checkpoint**: US3 fully functional. SC-003 satisfied (zero-byte diff inside `backlinks.md`).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cross-entity invariant verification (data-model.md "Cross-entity invariants" section) + structural drift check + final SC sweep before BI marks complete.

- [ ] T016 [P] Verify cross-entity invariant 2 — forward-pointer reciprocity between [specs/042-close-audit-findings/contracts/truncation-direction-evidence.md](../042-close-audit-findings/contracts/truncation-direction-evidence.md) (the line inserted in T010) and [specs/046-reconcile-truncation-docs/contracts/truncation-direction-evidence.md](contracts/truncation-direction-evidence.md) `Supersedes (for search and context_search only)` line. The two MUST name each other's relative path correctly. Depends on T009, T010.
- [ ] T017 [P] Verify cross-entity invariant 3 — TC back-link liveness for `[[TC-00306]]` and `[[TC-00328]]`. Both wikilinks MUST resolve to live TC pages in the user's external test tracker AND contain the same per-probe rows the mirror file mirrors. If a TC page was renamed during the BI, update both ends in this PR. Depends on T004, T005, T006, T009.
- [ ] T018 [P] Verify cross-entity invariant 4 — version-triple consistency. `package.json` `version` === `v0.7.1` === mirror file `version_triple.wrapper`. Depends on T001, T009.
- [ ] T019 Run `/graphify --update` per `CLAUDE.md` `/speckit-analyze` discipline. Verify: (a) the new mirror file under `specs/046-reconcile-truncation-docs/contracts/` lands in a fresh BI-046 community and is structurally connected (not orphaned), per the project's "new production code is structurally connected" check (adapted for spec-artifact files); (b) no new top-level error-code nodes were introduced (Principle IV — should be trivially satisfied because no source code touched); (c) no production handler imports the boot-time factories (createLogger, createQueue) directly — should be trivially satisfied for the same reason. Document any surprise community placement in this commit's message. Depends on all prior phases.
- [ ] T020 Final SC sweep against [quickstart.md](quickstart.md) "Done criteria" — verify SC-001 (0 false claims in corrected docs), SC-002 (probe reproduces inline-anchor behaviour), SC-003 (`git diff main -- docs/tools/backlinks.md` empty), SC-004 (diff scope confined to the 4 paths in plan.md "Touched paths" — `git diff --stat main..HEAD` shows ONLY `docs/tools/search.md`, `docs/tools/context_search.md`, `specs/046-reconcile-truncation-docs/contracts/truncation-direction-evidence.md`, `specs/042-close-audit-findings/contracts/truncation-direction-evidence.md`, plus the spec-artifact files added under `specs/046-reconcile-truncation-docs/` during `/speckit-specify` / `/speckit-plan` / `/speckit-tasks`), SC-005 (agent narrowing strategy correct on first attempt). Depends on all prior tasks.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No incoming dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories. T004-T007 in parallel; T008 depends on T004+T005; T009 depends on T004-T008; T010 [P] with T004-T009 (independent — link target file already exists).
- **User Stories (Phase 3+)**: Depend on Phase 2. Within Phase 2, US1 + US2 + US3 can start once T009 lands.
  - US1 (P1) — T011 needs T008 + T009; T012 [P] with T011 needs only T009.
  - US2 (P2) — T013 needs T009 + T011; T014 [P] with T013 needs T009 + T012.
  - US3 (P3) — T015 is a guard-rail diff check; can run after the doc edits (T011, T012) land but before commit.
- **Polish (Phase 6)**: T016-T020 run after the user-story phases land; T016-T018 [P] together; T019 depends on the file landing on disk (post-T009 minimum, ideally post-T015); T020 is the final gate.

### User Story Dependencies

- **US1 (P1)**: T011 depends on T008 (doc-structure decision) + T009 (mirror file populated). T012 depends on T009 only.
- **US2 (P2)**: Both tasks depend on the corresponding US1 task landing first (need the doc body in place to verify byte-match against the mirror file).
- **US3 (P3)**: Independent of US1/US2 in terms of file conflict, but logically belongs at the end so editor-side normalisation from US1/US2 edits doesn't accidentally touch `backlinks.md`.

### Within Each User Story

- No test tasks (project memory: unit tests only; manual probe captures land on TC pages).
- Doc edits before cross-entity verification.
- Each story's checkpoint maps directly to one or more SCs.

### Parallel Opportunities

- **Phase 1**: T002 + T003 in parallel (different reads, no dependency on T001's value beyond branch alive).
- **Phase 2**: T004 + T005 + T006 + T007 + T010 in parallel — five-way parallel. T008 sequential after T004+T005. T009 sequential after T004-T008.
- **Phase 3 (US1)**: T011 + T012 in parallel — different files.
- **Phase 4 (US2)**: T013 + T014 in parallel — different files.
- **Phase 5 (US3)**: T015 alone (single guard-rail check).
- **Phase 6**: T016 + T017 + T018 in parallel — different artifacts. T019 + T020 sequential at the end.

---

## Parallel Example: Phase 2 Foundational

```text
# Five-way parallel — independent probe runs / forward-pointer insertion:
Task T004: probe P1 (search default mode) at v0.7.1, BI-0011, limit=2, record on [[TC-00306]]
Task T005: probe P2 (search line mode) at v0.7.1, BI-0011, limit=2, record on [[TC-00306]]
Task T006: probe P3 (context_search) at v0.7.1, BI-0011, limit=2, record on [[TC-00328]]
Task T007: probe P4 (backlinks parity sanity) at v0.7.1, BI-0011, limit=2
Task T010: insert BI-042 forward-pointer line at top of specs/042-close-audit-findings/contracts/truncation-direction-evidence.md
```

Then sequentially:

```text
Task T008: lock search.md doc-structure decision from P1-vs-P2 outcome (depends on T004 + T005)
Task T009: populate contracts/truncation-direction-evidence.md per-probe rows + version triple + per-tool summary (depends on T004-T008)
```

## Parallel Example: User Story 1 (after Phase 2 lands)

```text
# Two-way parallel — different files:
Task T011: rewrite truncation section in docs/tools/search.md per FR-001..FR-003, FR-011, FR-013
Task T012: rewrite truncation section in docs/tools/context_search.md per FR-004..FR-006, FR-011, FR-013
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1 (Setup).
2. Complete Phase 2 (Foundational — probes + mirror file + forward-pointer).
3. Complete Phase 3 (US1 — agent-contract fix in both docs).
4. **STOP and VALIDATE**: SC-001 + SC-005 satisfied. An agent reading either corrected doc picks a correct narrowing strategy on the first attempt. MVP shippable here.

### Incremental Delivery

1. Setup + Foundational → empirical evidence captured, mirror file in place, BI-042 superseded.
2. + US1 → corrected docs ship; SC-001 + SC-005 satisfied. **MVP demo point.**
3. + US2 → cross-entity invariant 1 verified; SC-002 satisfied. Reproducibility durable.
4. + US3 → guard-rail check; SC-003 satisfied. `backlinks.md` byte-identical confirmed.
5. + Polish → SC-004 (diff scope) + cross-entity invariants 2-4 + `/graphify --update` structural check + final SC sweep. PR-ready.

### Parallel Team Strategy

Doc-only BI; single-developer is the realistic shape. If splitting:
- Developer A runs Phase 2 probes (T004-T007 [P], then T008 + T009).
- Developer B inserts the BI-042 forward-pointer (T010 [P] with the probes).
- After Phase 2 lands, Developer A takes T011 (search.md) and Developer B takes T012 (context_search.md) in parallel.
- T013-T018 [P] split across both developers in the polish phase.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- [Story] label maps task to specific user story for traceability.
- No tests in this task list — docs-only feature; project memory rule.
- T004-T007 are LIVE-CLI probes — gated by [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) per `CLAUDE.md` `## Test Execution`.
- T007 (P4 backlinks parity) is a STOP-condition probe — if the assumption fails, escalate to user before any other Phase 2 task lands; FR-008 + FR-013 may be jointly wrong and require BI re-scoping.
- T008's doc-structure decision (single block vs per-mode subsections) is the only schema-affecting choice in the whole BI — captured at the end of P2's row in the mirror file so future readers see the evidence behind the decision alongside the decision itself.
- Constitution Check (per [plan.md](plan.md)): all 5 principles + 4 ADRs return N/A; Complexity Tracking table empty.
- Commit after each task or logical group per `CONTRIBUTING.md`.
