# Tasks: Open Cross-Vault Files

**Input**: Design documents from `specs/061-cross-vault-open/`
**Prerequisites**: [plan.md](plan.md) (vault-targeted eval; ADR-031), [spec.md](spec.md) (5 user stories), [research.md](research.md) (D1–D9), [data-model.md](data-model.md) (schema/envelope/handler), [contracts/](contracts/) (behavioural contract + T0 evidence)

**Tests**: REQUIRED — Constitution Principle II (NON-NEGOTIABLE) mandates happy-path + failure/boundary tests co-located as `*.test.ts` in the same change. **Unit-only** (project scope): vitest over schema/handler/template; no `tests/` tree, no TC scaffolding (manual TC-00488/489 live in the user's tracker, exercised via quickstart).

**Scope reality**: a reimplementation of the existing `open_file` tool, **confined to `src/tools/open_file/**`** — `schema.ts`, `_template.ts`, `handler.ts`, `index.ts` + their co-located `*.test.ts`. The files are import-coupled (`schema → _template → handler → index`), so most source tasks are sequential; `[P]` is marked only for genuinely independent different-file work. **No edits** to `_dispatch.ts`, `cli-adapter.ts`, `logger.ts`, `server.ts`, `errors.ts`, `app-launcher.ts` (recovery is inherited; no spawn site).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different file, no dependency on an incomplete task → may run in parallel
- **[Story]**: maps to a spec.md user story (US1–US5)
- Exact file paths included

---

## Phase 1: Setup & T0 (live-CLI gate)

**Purpose**: pin the frozen eval string and confirm the one open caveat before touching source.

- [ ] T001 Read [.memory/test-execution-instructions.md](.memory/test-execution-instructions.md) before any live-CLI probe (gate: authorised vault `TestVault-Obsidian-CLI-MCP`, drive `Obsidian.com` never `Obsidian.exe`, `Sandbox/` scratch, cleanup).
- [ ] T002 Implement-T0 probe (per T001): pin the **exact frozen eval template string** for `src/tools/open_file/_template.ts` — specific-mode routing, locator resolution (`getFiles`/`getFirstLinkpathDest`), and the explicit placement branch — and **confirm complete intra-window leaf enumeration** (the D9 caveat: `iterateAllLeaves` must see a just-opened tab; one earlier snapshot omitted one). Append results to `specs/061-cross-vault-open/contracts/t0-probe-findings.md`. (B1-false / routing / cold-start / app-down already confirmed in the controlled session — D9; this only pins the byte-stable string + leaf enumeration.)

---

## Phase 2: Foundational (Blocking — schema is the contract everything imports)

**⚠️ CRITICAL**: no user-story work begins until the schema shape is fixed.

- [ ] T003 Update `src/tools/open_file/schema.ts`: add `placement: z.enum(["new_tab_created","existing_tab_reused","active_tab_used"])` to `openFileOutputSchema`; reshape `openEvalResponseSchema` (`ok:true` arm `+placement`; `ok:false` arm `code ∈ {FILE_NOT_FOUND, UNSUPPORTED_FILE_TYPE}` — **remove `VAULT_NOT_FOCUSED`** from `OPEN_FILE_EVAL_ERROR_CODES`); **input schema unchanged** (vault required, exactly-one-of path|file, new_tab bool — FR-006a / Principle III). Keep the `// Original — no upstream.` header.

**Checkpoint**: envelope + output types fixed — `_template`/`handler` can build against them.

---

## Phase 3: User Story 1 — Open in an open-but-unfocused vault (Priority: P1) 🎯 MVP

**Goal**: a single vault-targeted eval opens a file in any open-but-unfocused registered vault and switches focus to it (the headline cross-vault capability).

**Independent Test**: with two vaults open and vault B *not* focused, `open_file({vault:"B", path:"<B-only file>"})` → focus switches to B, the file is active, response names B (forcing-gate: the file is absent from A).

- [ ] T004 [US1] Rewrite the frozen eval in `src/tools/open_file/_template.ts` to the T002-pinned string: **remove the focused-vault guard** (no `expectedBase`, no `VAULT_NOT_FOCUSED`); resolve the locator (`app.vault.getFiles().find` for `path`; `app.metadataCache.getFirstLinkpathDest` for `file`) in the routed vault; `viewRegistry.isExtensionRegistered` type-check → `UNSUPPORTED_FILE_TYPE`; **explicit placement branch** (`new_tab`→open in a new leaf=`new_tab_created`; else existing leaf via `app.workspace.iterateAllLeaves` matching `view.file.path` → `setActiveLeaf(existing,{focus})`=`existing_tab_reused`; else `openLinkText(path,'',false)`=`active_tab_used`); return the discriminated envelope. Update the header comment.
- [ ] T005 [US1] Rewrite `src/tools/open_file/handler.ts`: issue `invokeCli({command:"eval", vault: input.vault, parameters:{code}, flags:[], target_mode:"specific"})` with `composeEvalCode(JS_TEMPLATE, {path, file, new_tab})` (no `expectedBase`); keep `resolveVaultRootOrRemap(deps.vaultRegistry, input.vault, TOOL_NAME)` as the pre-eval unknown-vault check; `decodeEvalEnvelope` → on `ok:true` return `{opened, vault: input.vault, new_tab, placement}`; **delete** the `VAULT_NOT_FOCUSED`/`not-open` mapping, any focus-switch/verify-poll, and the `launchFn` dependency.
- [ ] T006 [US1] Rewrite `OPEN_FILE_DESCRIPTION` in `src/tools/open_file/index.ts`: replace the B1 "Focused-vault precondition" prose with the cross-vault contract (opens in any open or closed registered vault; **switches focus to the requested vault**; reports `placement`; updated typed-error roster: `VAULT_NOT_FOUND/unknown` sole hard vault error, `FILE_NOT_FOUND`, `UNSUPPORTED_FILE_TYPE`, inherited `obsidian-not-running`). Drop any `launchFn` from `RegisterDeps`/`ExecuteDeps`. Update the header comment.
- [ ] T007 [P] [US1] Update `src/tools/open_file/_template.test.ts`: assert the recorded frozen eval code (guard removed; no `expectedBase` in the payload; placement branch + `iterateAllLeaves` present).
- [ ] T008 [P] [US1] Update `src/tools/open_file/schema.test.ts`: `placement` enum accept/reject; output shape is exactly `{opened, vault, new_tab, placement}` and (strict-mode) **carries no leaf/pane/split-geometry fields** (FR-012/FR-023); eval-envelope discriminated union has no `VAULT_NOT_FOCUSED`; input-schema behaviours retained (exactly-one-of path|file, bracket rejection, unknown-field strictness, defaults).
- [ ] T009 [US1] Add the happy-path cross-vault case to `src/tools/open_file/handler.test.ts` (mocked `invokeCli`): assert the dispatched argv is specific-mode (`vault=<requested>`, `command:"eval"`, `target_mode:"specific"`), and on an `ok:true` envelope the result is `{opened, vault:<requested>, new_tab, placement}` with the requested vault echoed.

**Checkpoint**: cross-vault open (open-but-unfocused) works end-to-end — MVP.

---

## Phase 4: User Story 3 — Report placement (P2) + User Story 4 — new-tab vs reuse control (P3)

**Goal**: every successful open reports exactly one placement outcome; the `new_tab` opt-in controls new-tab vs reuse (the explicit branch from T004; surfaced + verified here).

**Independent Test**: drive each placement (new tab / reuse / active) and read the `placement` field from the response — no visual inspection.

- [ ] T010 [US3] Add placement-report tests to `src/tools/open_file/handler.test.ts` (mocked eval envelopes): `new_tab:true`→`new_tab_created`; already-open + `new_tab:false`→`existing_tab_reused`; not-open + `new_tab:false`→`active_tab_used`; assert exactly one value is returned per success.
- [ ] T011 [US4] Add new-tab-control tests to `src/tools/open_file/handler.test.ts`: `new_tab:true` yields `new_tab_created` even when the file is already open (force-new); `new_tab:false` yields reuse/active per already-open state — confirming the opt-in maps to the placement branch.

**Checkpoint**: placement is machine-verifiable (closes the BI-0129 gap) and the new-tab control is exercised.

---

## Phase 5: User Story 5 — Distinct error for an unopenable vault (P2)

**Goal**: unknown/unregistered vault, file-not-found, and unsupported-type are distinct typed errors; the retired `not-open` is never emitted.

**Independent Test**: unknown vault → `VAULT_NOT_FOUND/reason:"unknown"`; valid vault + missing file → `FILE_NOT_FOUND`; each programmatically distinguishable.

- [ ] T012 [US5] Add the error-roster tests to `src/tools/open_file/handler.test.ts` (mocked): unknown vault (registry throws) → `CLI_REPORTED_ERROR` + `details.code:"VAULT_NOT_FOUND"` + `details.reason:"unknown"` (pre-eval); `FILE_NOT_FOUND` envelope → `CLI_REPORTED_ERROR/FILE_NOT_FOUND`; `UNSUPPORTED_FILE_TYPE` envelope → `CLI_REPORTED_ERROR/UNSUPPORTED_FILE_TYPE`; malformed envelope → `INTERNAL_ERROR`; **assert `VAULT_NOT_FOCUSED`/`reason:"not-open"` is never produced** (ADR-031; Principle IV — zero new codes/reasons).

**Checkpoint**: the fail-loud error contract holds; no new top-level code or reason.

---

## Phase 6: User Story 2 — Open in a closed-but-registered vault (P2, recovery inherited)

**Goal**: a closed/down vault is recovered automatically — **no `open_file` code**; the specific-mode `vault=requested` makes the inherited `dispatchCli` recovery vault-correct.

**Independent Test**: confirmed live in T002/D9 (closed vault → cold-start retry; app-down → vault-targeted launch). Here: confirm the tool adds no recovery and surfaces the inherited error.

- [ ] T013 [US2] Add inherited-recovery tests to `src/tools/open_file/handler.test.ts` (mocked `invokeCli`): when `invokeCli` throws `CLI_NON_ZERO_EXIT` + `details.reason:"obsidian-not-running"` the handler **propagates it unchanged** (no per-tool retry/launch); assert the handler contains no cold-start/app-down retry logic and no `launchFn`/`app-launcher` import (recovery is dispatch-layer, ADR-029/030). **By design, the closed-vault happy path (cold-start → success) is NOT re-unit-tested here** — it is dispatch-layer behaviour already covered by BI-059/BI-060 and proven live in T002; US2's `open_file`-level obligation is only non-interference + threading `vault=requested` (asserted by the T009 argv check). Reference T002 for the live cold-start/app-down evidence.

**Checkpoint**: closed-vault + app-down opens are covered, with zero added per-tool recovery code.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T014 [P] Update `src/tools/open_file/index.test.ts`: registration + description assertions (tool name `open_file`; description mentions cross-vault + `placement`; the stale B1 focused-vault precondition is gone).
- [ ] T015 Run the merge gates: `npm run lint` (zero warnings), `npm run typecheck`, `npm run build`, and coverage via the Windows-safe command (per project memory): `mkdir -p coverage/.tmp` then `npx vitest run --coverage --pool=forks --no-file-parallelism`. All green; aggregate statements threshold holds.
- [ ] T016 Manual quickstart validation per [quickstart.md](quickstart.md) (**S1–S8**) against `TestVault-Obsidian-CLI-MCP` via `Obsidian.com` (re-read T001 first): open-but-unfocused (S1, incl. **FR-004/SC-007** prior-vault-stays-open at S1 step 5), closed vault (S2), app-down (S3), placement variants (S4), unknown vault + file-not-found (S5), bare-name forcing-gate (S6), same-vault regression (S7), and **type-agnostic non-md open (S8 — FR-020/SC-008)**. These cover the side-effect/type FRs that are not unit-testable. Record outcomes (TC-00488/489 for placement).
- [ ] T017 Post-implement structural verification: run `/graphify --update`, then confirm (1) no new top-level error code/`details.reason`; (2) no `createLogger`/`createQueue`/`createServer` factory import in the handler; (3) `open_file` stays in the eval-composed cohort with **no** new edge to `app-launcher`; (4) `open_file` files structurally connected. Record in the BI's post-implement artifact.
- [ ] T018 On ship: flip `.decisions/ADR-031` (repo mirror) + the Decision Log row to **Decided**; note BI-0129 TC-00488/489 placement validation; confirm the canonical vault ADR is ratified by the user.

---

## Dependencies & Execution Order

### Phase order
- **Phase 1 (Setup/T0)** → **Phase 2 (schema, foundational, BLOCKS all)** → **Phase 3 (US1 MVP)** → **Phase 4 (US3/US4)** → **Phase 5 (US5)** → **Phase 6 (US2)** → **Phase 7 (Polish)**.
- US1 is the load-bearing mechanism; US2/US3/US4/US5 are layers/verification on the same files, so they run **after** US1 rather than fully in parallel (shared `handler.ts`/`handler.test.ts`).

### Import-chain dependencies (source)
- T003 (schema) → T004 (`_template` imports schema-adjacent shapes) → T005 (`handler` imports `JS_TEMPLATE` + schema types) → T006 (`index` imports `executeOpenFile` + schema). Strictly sequential.
- Test files depend on their source: T007←T004, T008←T003, T009/T010/T011/T012/T013←T005, T014←T006.

### Shared-file (sequential, NOT parallel)
- `handler.test.ts`: T009 → T010 → T011 → T012 → T013 (same file).
- `handler.ts`: T005 (single rewrite; US5 error mapping is part of T005).

### Parallel opportunities
- **T007 [P]** (`_template.test.ts`) and **T008 [P]** (`schema.test.ts`) — different files, run together once T004/T003 land.
- **T014 [P]** (`index.test.ts`) — independent of the handler test chain.

---

## Parallel Example (US1)

```text
# After T003 + T004 land, run the two independent test files together:
Task: "T007 Update src/tools/open_file/_template.test.ts (recorded eval code)"
Task: "T008 Update src/tools/open_file/schema.test.ts (placement enum + envelope)"
```

---

## Implementation Strategy

### MVP (US1 only)
1. Phase 1 (T0: pin the frozen string + leaf enumeration).
2. Phase 2 (schema).
3. Phase 3 (US1: `_template` → `handler` → `index` + US1 tests).
4. **STOP & VALIDATE**: cross-vault open in an open-but-unfocused vault works (quickstart S1) → demo.

### Incremental
- +US3/US4 (placement report + control, T010–T011) → S4.
- +US5 (error roster, T012) → S5.
- +US2 (inherited-recovery coverage, T013) → S2/S3.
- Polish (T014–T018) → gates green, quickstart green, structural check, ADR-031 ratified.

---

## Notes
- The whole change deletes machinery (guard, `VAULT_NOT_FOCUSED`, focus-switch, verify-poll, launcher) — lowest blast radius; recovery purely inherited (ADR-031).
- `[P]` = different file, no incomplete-task dependency.
- Constitution Principle II: every changed surface ships its co-located test in the same change — enforced by T007/T008/T009–T013/T014.
- T0 (T002) and quickstart (T016) touch the live CLI — gate on T001 (`.memory/test-execution-instructions.md`), drive `Obsidian.com`.
- Commit after each task or logical group; stop at any checkpoint to validate the story independently.
