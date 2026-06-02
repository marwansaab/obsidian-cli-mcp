---
description: "Task list for Verify Cross-Vault Routing (BI-0134)"
---

# Tasks: Verify Cross-Vault Routing

**Input**: Design documents from `specs/062-verify-cross-vault-routing/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: This is a verification + documentation feature; the expected outcome is documentation-only (research.md D5). Test tasks are therefore **contingent** — they appear only inside Phase 5 (US3), exercised solely if a probe surfaces a genuine limitation that wires an existing signal into a handler (Constitution Principle II). No upfront TDD tasks for the doc work.

**Organization**: Tasks are grouped by user story. The natural unit of work is **per tool**: classify (done at plan time) → forcing-gate probe (US1) → correct documentation (US2) → contingency signal (US3) → evidence/immutability audit (US4).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies). NOTE: live forcing-gate **probes are NOT [P]** — they share one focused-vault state and the wrapper's single-in-flight CLI queue, so they serialize. **Doc edits ARE [P]** (different files).
- **[Story]**: US1–US4 map to spec.md user stories.

## At-risk set (from research.md D1 / contracts/t0-probe-plan.md)

Eval-composed read/query, specific/`vault=` path only: `backlinks`, `links`, `read_heading` (reads); `find_by_property`, `tag`, `paths`, `pattern_search`, `smart_connections_query`, `smart_connections_similar` (queries). Group 1 docs carry the false "focus first" caveat (`read_heading`, `tag`, `paths`, `backlinks`, `links`); Group 2 already accurate (`find_by_property`, `pattern_search`, `smart_connections_query`, `smart_connections_similar`). Native-wrappers swept separately. `open_file` + write tools excluded.

---

## Phase 1: Setup (Verification Environment)

**Purpose**: Stand up the two-vault forcing-gate environment and fixtures per `.memory/test-execution-instructions.md`.

- [X] T001 Read `.memory/test-execution-instructions.md`; confirm a **clean git working tree** (`git status` clean — mandatory before any doc edit, rollback `git restore .`); confirm the driver is `Obsidian.com` (production-resolved shim), never the GUI `Obsidian.exe`.
- [X] T002 Bring up the environment: vault **A** (the "other" vault, e.g. `The Setup`) **focused**; vault **B** = `TestVault-Obsidian-CLI-MCP` open but **not** focused. Confirm both are registered and open via `obsidian vaults verbose`.
- [X] T003 [P] Stage per-tool B-only discriminators in `TestVault-Obsidian-CLI-MCP/Sandbox/` per `specs/062-verify-cross-vault-routing/contracts/t0-probe-plan.md` (a B-only backlink/forward-link target; a note with a B-only heading body; a B-only frontmatter property/value; a B-only tag; a B-only file path + content pattern; a note indexed by Smart Connections in B). Confirm the Smart Connections index covers B for the `smart_connections_*` probes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Settle the at-risk set and the evidence ledger before any probe runs.

**⚠️ CRITICAL**: No probe (US1) may run until the classification is re-confirmed and the findings ledger exists.

- [X] T004 Re-confirm Step-0 classification: re-grep `src/tools/*/handler.ts` for the issued `command:` and verify the nine-tool at-risk eval read/query set is unchanged since plan time (research.md D1). If a handler drifted (e.g. a tool now issues `eval` that did not, or vice-versa), update the at-risk set and note it before probing.
- [X] T005 Scaffold `specs/062-verify-cross-vault-routing/contracts/t0-probe-findings.md` with one empty row per at-risk tool: `tool | focused vault | target vault | discriminator | exact call | returned-from (B/A/error) | verdict`.

**Checkpoint**: At-risk set settled, ledger ready — probing can begin.

---

## Phase 3: User Story 1 - Read/query the named, unfocused vault (Priority: P1) 🎯 MVP

**Goal**: Confirm, per tool on its own evidence, that the specific/`vault=` path returns vault B's content while A stays focused.

**Independent Test**: With A focused and B open-but-unfocused, each tool called with `vault=B` against a B-only discriminator returns B's content (not A's). PASS = answer from B **and focus stays on A** (a `vault=B` read routes into B but does NOT move focus — unchanged focus is NOT a failure; research.md D2). FAIL (hard stop) = answer reflects A (FR-012).

> Probes serialize (shared focus state + single-in-flight CLI) — run T006–T014 back-to-back without re-setup. **Do NOT probe active mode** — focused-by-design, must not be flipped (research.md D3).

- [X] T006 [US1] Probe `backlinks` specific-mode `vault=B` against the B-only link target; assert B's backlink set; record the row in `contracts/t0-probe-findings.md`.
- [X] T007 [US1] Probe `links` specific-mode `vault=B`; assert B's forward-link set; record.
- [X] T008 [US1] Probe `read_heading` specific-mode `vault=B` against the B-only heading note; assert B's heading body; record.
- [X] T009 [US1] Probe `paths` specific-mode `vault=B` against the B-only path; assert B's path set; record.
- [X] T010 [US1] Probe `tag` vault-named `vault=B` against the B-only tag; assert B's tagged-file set; record.
- [X] T011 [US1] Probe `find_by_property` vault-named `vault=B` against the B-only property/value; assert it is found in B; record.
- [X] T012 [US1] Probe `pattern_search` vault-named `vault=B` against the B-only content pattern; assert B's matches; record.
- [X] T013 [US1] Probe `smart_connections_query` vault-named `vault=B` against the B-indexed note; assert B's results; record.
- [X] T014 [US1] Probe `smart_connections_similar` specific-mode `vault=B` against the B-indexed source; assert B's similar set; record.
- [X] T015 [US1] Aggregate verdicts in `contracts/t0-probe-findings.md`: assign each tool a `ToolVerdict` (expected `ROUTING_CONFIRMED`). Any `returned-from = A` is a hard stop (FR-012) — flag that tool for Phase 5 (US3); do NOT proceed to its doc correction as `ROUTING_CONFIRMED`.

**Checkpoint**: Every at-risk tool has its own recorded verdict. MVP delivered — cross-vault routing confirmed (or a genuine limitation isolated) per tool.

---

## Phase 4: User Story 2 - Documentation reflects reality (Priority: P2)

**Goal**: Correct each doc to its tool's confirmed verdict; remove the false "focus first" caveat where routing is confirmed; keep genuine limitations stated.

**Independent Test**: Read each cohort doc — Group 1 no longer instructs "open the target vault first"; the same-display-name collision remains as the real, scoped limitation; Group 2's accurate framing is confirmed; native-wrapper docs carry no focus-first error.

> Each correction is gated on **that tool's own** `ROUTING_CONFIRMED` row (FR-003). Doc edits are [P] (different files).

### Group 1 — remove the false focus-first caveat (per doc-correction-contract.md)

> **Anchor note (analyze A1):** the `~L` line numbers below are approximate and may have drifted. Locate each edit by the **caveat text** in the doc's **"Multi-vault basename ambiguity"** section, not the line number.

- [X] T016 [P] [US2] `docs/tools/read_heading.md` (~L95): remove the "open the target vault in Obsidian before invoking `read_heading`" precondition; reword the same-display-name collision as the real, scoped limit (focus does not fix a true name collision). Active-mode `ERR_NO_ACTIVE_FILE` rows untouched.
- [X] T017 [P] [US2] `docs/tools/tag.md` (~L248): remove the focus-first precondition; surface the doc's own "`vault=` routes correctly for eval (verified live)" as the headline; keep the collision note.
- [X] T018 [P] [US2] `docs/tools/paths.md` (~L268): remove the focus-first precondition; keep the collision note; active-mode lines untouched.
- [X] T019 [P] [US2] `docs/tools/backlinks.md` (~L351): remove the focus-first precondition; keep the collision note; active-mode rows untouched.
- [X] T020 [P] [US2] `docs/tools/links.md` (~L281): remove the focus-first precondition; keep the collision note; active-mode rows untouched.

### Group 2 — confirm already-accurate framing (light/no edit)

- [X] T021 [P] [US2] `docs/tools/find_by_property.md` (~L68): confirm the "pass `vault` explicitly / omit → focused default" framing; tighten only if any wording implies the named-`vault` path needs focus. No false caveat to remove.
- [X] T022 [P] [US2] `docs/tools/pattern_search.md`: confirm the "routes to a named vault; omit → focused" framing; no focus-first caveat present.
- [X] T023 [P] [US2] `docs/tools/smart_connections_query.md`: confirm "omit → focused vault"; plugin-index caveats untouched.
- [X] T024 [P] [US2] `docs/tools/smart_connections_similar.md`: confirm the specific-mode `vault=` cross-vault behaviour; active-mode (focused-by-design) row and the basename "use `path`" note unchanged.

### Native-wrapper sweep + shared register

- [X] T025 [US2] Native-wrapper doc sweep: grep `docs/tools/{read,read_property,outline,search,context_search,bases,files,properties,views_base,query_base}.md` for any focus-first line; correct any found one **without** the eval/B1 framing (native commands honour `vault=`). `views_base`'s focused-`.base` requirement is correct-by-design and stays; `query_base`'s `eval`-based closed-vault `not-open` signal stays (out of positive scope).
- [X] T026 [US2] Update the B1 affected-features list + mitigation status in `.architecture/Obsidian CLI - Upstream Issues and Limitations.md`: mark B1 removed per `ROUTING_CONFIRMED` tool; record native-wrappers as never-a-B1-victim (not B1-resolved); leave B1 standing only where a tool's own probe genuinely confirmed it (expected: none).

**Checkpoint**: Every cohort + native-wrapper doc matches its tool's evidence; the shared register is reconciled.

---

## Phase 5: User Story 3 - Genuine limitations signal clearly (Priority: P2) — CONTINGENT

**Goal**: For any tool whose probe returned A (silent wrong-vault), surface a structured signal or record a deferral — never leave a silent wrong-vault path or the false caveat.

**Independent Test**: For each flagged tool, calling `vault=B` either returns a structured error identifying the unreachable vault, or its doc states the confirmed limitation with the signal deferred to a dedicated BI. No flagged tool silently answers from A.

> **Expected empty** (research.md D5 — B1 already false for the shared read-eval mechanism). Execute only for tools flagged by T015.

- [X] T027 [US3] **N/A — no tool flagged by T015 (all ROUTING_CONFIRMED); contingency not triggered (research.md D5).** `LIMITATION_SIGNALLED`: for a flagged tool whose signal can be produced by reusing an **already-emitted sibling** signal, wire that existing signal in `src/tools/<tool>/handler.ts` — **zero new top-level code, zero new `details.reason`** (FR-013) — and add the co-located failure-path case in `src/tools/<tool>/handler.test.ts` in the same change (Principle II). Update the tool's doc to state the real limitation. **Caution (analyze I1):** the only existing reachability signal, `VAULT_NOT_FOUND`/`reason:"not-open"`, is closed-vault-semantic — do NOT force-fit it onto an open-but-unfocused mis-route; if no already-emitted signal genuinely fits that state, use T028 instead.
- [X] T028 [US3] **N/A — no tool flagged by T015; contingency not triggered.** `LIMITATION_DEFERRED`: for a flagged tool whose signal would require **net-new detection**, state the real limitation in its doc, file a dedicated BI (per FR-014 / BI-0134's own out-of-scope), and link it from `spec.md` and `research.md`. Do NOT mark the tool failed (FR-009c). This is the **expected contingency** for an open-but-unfocused mis-route (no true-fit existing signal to reuse — analyze I1).

**Checkpoint**: No tool is left silently wrong; every genuine limitation is either signalled (reuse) or recorded as deferred.

---

## Phase 6: User Story 4 - Per-tool evidence & focused-only immutability (Priority: P3)

**Goal**: Prove every published claim rests on that tool's own evidence and that focused-only modes are untouched.

**Independent Test**: Each doc correction cites its own tool's findings row; active-mode/focused-only behaviour and docs are byte-unchanged.

- [X] T029 [US4] Evidence audit: confirm each doc correction (T016–T024) and each B1-register row (T026) maps to **that tool's own** `t0-probe-findings.md` row — no claim inferred from another tool (FR-003 / SC-001).
- [X] T030 [US4] Active-mode immutability check: confirm no edit touched any focused-by-design path — the `ERR_NO_ACTIVE_FILE` rows in `read_heading`/`backlinks`/`links`, the `smart_connections_similar` active-mode example, the `paths` active-mode line, and (out of cohort) the `set_property` active-mode pre-flight are byte-unchanged (FR-004 / SC-006).

**Checkpoint**: Contract is trustworthy — per-tool evidenced, focused-only modes intact.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T031 [P] Run the `quickstart.md` §5 acceptance mapping end-to-end (US1→SC-002, US2→SC-003/SC-004, US3→SC-005, US4→SC-001/SC-006).
- [X] T032 `git diff` audit: confirm `src/errors.ts` is unchanged (zero new top-level error codes) and no new `details.reason` literal was introduced (FR-013 / SC-007). If any handler was touched in Phase 5, run `npm run lint && npm run typecheck && npm run build`, then the Windows-safe coverage run: `mkdir -p coverage/.tmp && npx vitest run --coverage --pool=forks --no-file-parallelism`.
- [X] T033 (fixtures + harness cleaned; no vault closed/reconfigured; A-focus restore + SC-revert are user-side, see report) Restore vault A's focus; clean up `Sandbox/` fixtures; confirm no vault was closed or reconfigured and no Obsidian setting changed (FR-021 parity / SC-007). **Confirm FR-015**: no Obsidian plugin was changed, suppressed, or special-cased — the `smart_connections_*` plugin caveats are left untouched.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — BLOCKS all probing.
- **US1 (Phase 3)**: depends on Foundational. The MVP.
- **US2 (Phase 4)**: depends on US1 — each doc correction is gated on its tool's probe verdict (FR-003).
- **US3 (Phase 5)**: depends on US1 — fires only for tools T015 flagged `returned-from = A` (expected none).
- **US4 (Phase 6)**: depends on US2 (and US3 if it ran) — audits the corrections.
- **Polish (Phase 7)**: depends on all desired stories complete.

### Within US1

- Probes serialize (shared focused-vault state + single-in-flight CLI) — not parallel despite touching different tools.

### Parallel Opportunities

- T003 fixture staging is [P] with other setup reads.
- **US2 doc edits (T016–T024) are [P]** — different files, each gated only on its own US1 row.
- T031 is [P] with the final audit reads.

---

## Parallel Example: User Story 2 (doc corrections)

```bash
# After US1 verdicts are recorded, the Group-1 + Group-2 doc edits run in parallel (different files):
Task: "T016 read_heading.md — remove focus-first precondition"
Task: "T017 tag.md — remove focus-first precondition"
Task: "T018 paths.md — remove focus-first precondition"
Task: "T019 backlinks.md — remove focus-first precondition"
Task: "T020 links.md — remove focus-first precondition"
Task: "T021 find_by_property.md — confirm framing"
# ... T022–T024 likewise
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → Phase 2 Foundational → Phase 3 US1 probes.
2. **STOP and VALIDATE**: every at-risk tool has a recorded verdict; cross-vault routing is confirmed (or a limitation isolated) on each tool's own evidence.

### Incremental Delivery

1. US1 (probes) → US2 (docs match reality) → ship the documentation correction (the feature's core value).
2. US3 only if a probe surfaced a genuine limitation (expected none).
3. US4 audit → Polish.

---

## Notes

- **Graphify path rule (CLAUDE.md `/speckit-tasks`): N/A.** This BI is expected documentation-only; its contingent code path (Phase 5, US3) touches at most a single source module (`src/tools/<tool>/handler.ts` + its co-located test), so the task list does not cross two or more source modules and no `/graphify path A B` cross-module dependency query is required. If Phase 5 ends up touching more than one handler, run the path query at that point.
- [P] = different files, no dependencies. Live probes are intentionally NOT [P].
- Each at-risk tool's doc correction is gated on its own probe row (FR-003) — never inferred from another tool.
- Non-destructive by default; any write-needing probe uses `TestVault-Obsidian-CLI-MCP` only; clean git tree before doc edits; rollback `git restore .`.
- Re-confirm any negative against `Obsidian.com` (the `.exe` detached-stdio false-clean artifact).
- Commit after each logical group (e.g. US1 findings, US2 Group-1 edits, register update).
