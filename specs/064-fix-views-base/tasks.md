---
description: "Task list for 064-fix-views-base"
---

# Tasks: Fix Views Base

**Input**: Design documents from `specs/064-fix-views-base/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: Co-located `*.test.ts` are **mandatory** here, not optional — Constitution Principle II (NON-NEGOTIABLE) requires every modified public surface to ship happy-path + failure/boundary tests in the same change. Test scope is **vitest unit only** (project memory: integration/manual TC-XXX live in the user's tracker, not under `specs/`).

**Organization**: Tasks grouped by user story (US1=P1 clean names, US2=P2 named Base, US3=P3 distinguishable failures). Modifying ONE existing module (`src/tools/views_base/**`), so the handler/test files are shared across stories → those tasks are sequential, not parallel.

## Format: `[ID] [P?] [Story?] Description with file path`

- **[P]**: parallelizable (different file, no incomplete dependency)
- **[Story]**: US1 / US2 / US3 (story phases only)

---

## Phase 1: Setup

**Purpose**: Establish the green-before baseline and clear the live-CLI gate.

- [X] T001 [P] Run the existing `views_base` vitest suite to capture green-before-change state: `npx vitest run src/tools/views_base` (records the stale clean-name fixtures that T009 will correct).
- [X] T002 Read [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md); confirm the authorised TestVault, the scratch subdir, the destructive-probe protocol, and that probes drive `Obsidian.com` (NOT `Obsidian.exe`). Gate for Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites) — T0 forcing-gate probe

**Purpose**: Decide the named-Base mechanism arm and finalise the label-strip BEFORE any handler change. Per [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md). Drives `Obsidian.com`.

**⚠️ CRITICAL**: No user-story work begins until T007 resolves the arm.

- [X] T003 Run probe **P1** (real active-mode `base:views` output: the injected type-label shape/delimiter + the closed view-type token set; capture a Base with space/punctuation view names). Record findings in [research.md](research.md) (D5) / a `contracts/` evidence note.
- [X] T004 Run probe **P2** (re-test `base:views path="<rel>"` and `base:views vault="<unfocused>" path="<rel>"` against a **non-focused** `.base` in an **unfocused** vault — distrust 054 R-003). Record PASS/FAIL.
- [X] T005 Run probe **P3** (focus-then-active reliability: focus a `.base` via the open mechanism → active `base:views` reads THAT Base, no race; confirm a missing named `.base` yields a distinct `FILE_NOT_FOUND`). Record RELIABLE/RACY.
- [X] T006 (Conditional) If **both** P2 and P3 fail, run probe **P4** (in-eval Bases view-enumeration API). If only a client-side `.base`-YAML read is viable → **STOP and author a new ADR** (BI-041 norm) before proceeding. Record.
- [X] T007 Resolve the mechanism arm — `path=` (1 call) | focus-first (2 calls) | eval-fallback — finalise `stripTypeLabel` (token set + delimiter), and confirm the locked `BASE_NOT_FOUND` `details.reason` mapping (`named-missing`/`not-open`) holds for the resolved arm (focus arm remaps upstream `FILE_NOT_FOUND`); update [data-model.md](data-model.md) + [research.md](research.md) with the resolved arm. **Unblocks Phase 3+.**

**Checkpoint**: arm decided, label-strip spec'd, error-roster finalised.

---

## Phase 3: User Story 1 — Clean view names (Priority: P1) 🎯 MVP

**Goal**: Every returned view name is plain (no type label/delimiter/trailing space) and accepted verbatim by `query_base`; internal spaces/punctuation preserved.

**Independent Test**: Focus a Base (no `base_path`), list, confirm names carry no label and feed each verbatim into `query_base view_name=`.

- [X] T008 [US1] Implement `stripTypeLabel` in `src/tools/views_base/handler.ts` (anchored to the P1 token set/delimiter — never a blind trailing-token trim) and apply it in the enumeration map for both modes (FR-001/002/003).
- [X] T009 [US1] Update `src/tools/views_base/handler.test.ts`: correct the stale clean-name fixtures to the real P1 emission; add multi-view strip + space-bearing + punctuation-bearing cases asserting the stripped name equals the `query_base`-accepted form (SC-001/003).

**Checkpoint**: open-Base listing returns clean, query-ready names.

---

## Phase 4: User Story 2 — List the views of a named Base (Priority: P2)

**Goal**: An agent names a Base by its vault-relative `.base` path (optionally a `vault`) and gets THAT Base's views, regardless of focus; the no-argument open-Base path is unchanged.

**Independent Test**: With Base A focused, name Base B → get B's views; cross-vault with `vault` → get the named vault's Base; no args → focused Base (unchanged).

- [X] T010 [US2] Add optional `base_path` to `src/tools/views_base/schema.ts` with an `INVALID_BASE_PATH` `superRefine` (empty / too-long / path-traversal / wrong-extension), byte-parity with `query_base`; keep `vault` optional; output schema unchanged (FR-012, D6).
- [X] T011 [P] [US2] Update `src/tools/views_base/schema.test.ts`: `base_path` valid; each `INVALID_BASE_PATH` reason; `base_path` optional (omitted parses); `toMcpInputSchema` `properties` = `["vault","base_path"]`.
- [X] T012 [US2] Add `vaultRegistry` to `ExecuteDeps` in `src/tools/views_base/handler.ts` and inject it at `createViewsBaseTool(...)` in `src/server.ts` (sanctioned composition-root DI line — see Notes; enables typed `VAULT_NOT_FOUND/unknown` cohort parity).
- [X] T013 [P] [US2] (focus-first arm only — SKIP if T007 chose `path=`) Add `src/tools/views_base/_template.ts` (frozen focus eval composing `app.workspace` open of `base_path`, via `composeEvalCode`, **no `open_file` import** — Principle I) + `src/tools/views_base/_template.test.ts` (recorded eval string + anti-injection).
- [X] T014 [US2] Implement the named branch in `src/tools/views_base/handler.ts` per the T007 arm: `base_path` present → (`path=` single `base:views` call) OR (`resolveVaultRootOrRemap` when `vault` given → focus eval → active `base:views`); `base_path` absent → existing active path; the T008 strip applies to both (FR-004/005, D3/D7).
- [X] T015 [US2] Update `src/tools/views_base/handler.test.ts`: named-Base happy path (focus-then-active sequence / `path=` argv); cross-vault `vault=` routing; open-Base regression still passes; extend `makeDeps` with a stub `vaultRegistry`; assert the output stays `{views, count}` (names-only) and no write/mutating CLI command is issued (read-only, FR-011).
- [X] T016 [US2] Rewrite the description in `src/tools/views_base/index.ts` (named Base + cross-vault + clean names + new errors; **remove the Active-mode-only claim**) and update `src/tools/views_base/index.test.ts` (drop the `"Active-mode-only"`/`"active"` assertions, add a `base_path` mention, keep length ≥ 400 + cohort cross-pointers, add `vaultRegistry` to the `createViewsBaseTool` calls).
- [X] T017 [P] [US2] Rewrite `docs/tools/views_base.md`: `base_path`, cross-vault routing, clean-names guarantee, worked examples (open / named / cross-vault).
- [X] T018 [US2] Regenerate the `views_base` description + schema fingerprints in `src/tools/_register-baseline.json` (per the baseline-update procedure) and confirm `src/tools/_register-baseline.test.ts` passes. Run after T010 (schema) + T016 (description).

**Checkpoint**: named-Base + cross-vault listing works; open-Base path unchanged; registry baseline current.

---

## Phase 5: User Story 3 — Failure causes stay distinguishable (Priority: P3)

**Goal**: named-not-found vs no-base-open vs invalid-locator vs malformed vs bad-vault are mutually distinguishable, consistent with the cohort, and never silently substitute the open Base.

**Independent Test**: name a missing Base, a non-`.base` path, a `.base` in a bad vault, and (no arg) an unfocused non-Base — each yields a distinct typed error; none returns the focused Base's views.

- [X] T019 [US3] Finalise the error mapping in `src/tools/views_base/handler.ts`: no-base-open → `BASE_NOT_FOUND/not-open`; named-not-found → `BASE_NOT_FOUND/named-missing` (remap the focus arm's upstream `FILE_NOT_FOUND`, do not leak it); malformed → `BASE_MALFORMED`; bad vault → `VAULT_NOT_FOUND/unknown`; guarantee **no silent open-Base substitution** on any named-path failure (FR-007/008/009/010, D8/D8a).
- [X] T020 [US3] Add the full error roster to `src/tools/views_base/handler.test.ts`: named-not-found ≠ no-base-open (distinct `details.reason` — `named-missing` vs `not-open` — under one `BASE_NOT_FOUND` code); invalid locator → `VALIDATION_ERROR`/`INVALID_BASE_PATH`; malformed → `BASE_MALFORMED`; bad vault → `VAULT_NOT_FOUND`; assert no-silent-substitution (SC-004/006).
- [X] T021 [P] [US3] Add the error roster + recovery hints to `docs/tools/views_base.md` (named-not-found, no-base-open, invalid-locator, malformed, vault) with worked failure examples.

**Checkpoint**: all failure causes distinct; no fallback to the open Base.

---

## Phase 6: Polish & Cross-Cutting

- [X] T022 Run `npm run lint` + `npm run typecheck` + `npm run build` — zero warnings (constitution gates 1–3).
- [X] T023 Run the full suite with coverage via the Windows-safe procedure (project memory): `mkdir -p coverage/.tmp` then `npx vitest run --coverage --pool=forks --no-file-parallelism`; confirm the statements threshold holds (gate 5).
- [X] T024 Execute [quickstart.md](quickstart.md) scenarios (US1/US2/US3 + the empty-views edge) against the authorised TestVault (`Obsidian.com`).
- [X] T025 Post-implement structural verification: run `/graphify --update`, then verify (1) no new top-level error code (no new error-class node outside `src/errors.ts`); (2) the `views_base` handler imports neither `createLogger`/`createQueue`/`createServer` nor the `open_file` module; (3) `views_base` stays in the Bases-family community (or record the deliberate eval migration if the D9 fallback was taken); (4) modified production files remain structurally connected.

---

## Dependencies & Execution Order

- **Phase 1** → **Phase 2** (T002 gate before probes) → **T007** (resolves arm) → **Phase 3** → **Phase 4** → **Phase 5** → **Phase 6**.
- **US1 (P1)**: depends only on T007. MVP — deliverable alone (open-Base clean names).
- **US2 (P2)**: depends on US1 (strip present) + T007. Within US2: T010 → T011; T012 → T014; T013 (focus arm) → T014; T014 → T015; T018 after T010 + T016.
- **US3 (P3)**: depends on US2 (named branch exists). T019 → T020.
- **handler.ts** is touched by T008, T012, T014, T019 → strictly sequential (same file). **handler.test.ts** by T009, T015, T020 → sequential. **docs/tools/views_base.md** by T017, T021 → sequential.

### Parallel opportunities

- T001 [P] (read-only) alongside T002.
- Within US2: T011 [P] (schema.test.ts) ∥ T013 [P] (_template.ts) ∥ T017 [P] (docs) — distinct files, once their deps are met.
- T021 [P] (docs) ∥ T019/T020 (handler / handler.test) within US3 — distinct files.

---

## Implementation Strategy

- **MVP**: Phases 1–2 + US1 → clean, query-ready names on the open Base. Stop, validate (quickstart US1).
- **Increment 2**: US2 → named Base + cross-vault. Validate (quickstart US2).
- **Increment 3**: US3 → distinguishable failures. Validate (quickstart US3).
- **Close**: Phase 6 gates + structural verification.

---

## Notes

- **Resolution (T007)**: arm = **native focus-first**. T0 P2 confirmed `base:views` ignores `path=`/`vault=` (active-only); P3 confirmed focus-then-active is reliable, so T006/P4 was correctly NOT run (eval fallback unused) and T013 (`_template.ts`, focus arm) shipped. The label delimiter is a **TAB** with closed type set `{table, cards, list}` (D5 space-delimiter assumption corrected). Evidence: [contracts/t0-probe-findings.md](contracts/t0-probe-findings.md); outcome in [post-implement.md](post-implement.md).
- **Graphify `path` rule (CLAUDE.md `/speckit-tasks`)**: this BI modifies ONE source module (`src/tools/views_base/**`); the only cross-module edge is the sanctioned DI injection of `vaultRegistry` into `createViewsBaseTool` at `src/server.ts` (T012). The structural path `createServer → createViewsBaseTool → ExecuteDeps.vaultRegistry` is known by direct lookup (cohort with `query_base`/`open_file`); a `graphify path` query adds nothing. Rule satisfied by direct lookup.
- **Plan corrected (was flagged for `/speckit-analyze`, now resolved)**: plan.md Scale/Scope, the kernel-node note, the source tree, and the Graphify check now record the ONE sanctioned `server.ts`/`createServer` DI line (`vaultRegistry`) that T012 adds, so the named+`vault` arm emits a typed `VAULT_NOT_FOUND/unknown` (cohort parity). This is a composition-root DI injection, NOT a structural change to `createServer`. Deliberate, not drift.
- **Arm-conditional tasks**: T013 (`_template.ts`) exists only for the focus-first arm; if T007 resolves `path=`, skip it. If the D9 eval-fallback arm is taken, T013/T014 are replaced by a single-eval load+enumerate (and a new ADR per T006) — record the deviation in the post-implement artifact.
- **Baseline regen (T018)** is the expected reviewed path for modifying a tool's published surface (schema + description fingerprints move), not drift (plan Graphify check).
- **Zero new top-level error codes** (Principle IV) across all tasks; `BASE_NOT_FOUND` gains an additive `details.reason` (`named-missing`/`not-open`) so named-not-found and no-base-open stay distinguishable under one code (ADR-015), cohort-consistent with `query_base`.
