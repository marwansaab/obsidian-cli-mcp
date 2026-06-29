---
description: "Task list for Report Active File (get_active_file)"
---

# Tasks: Report Active File (`get_active_file`)

**Input**: Design documents from `specs/063-report-focused-file/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Co-located `*.test.ts` are **REQUIRED** here — Constitution Principle II mandates a happy-path + a failure/boundary test for every public surface, in the same change that adds it. They are not optional for this BI. (Per the project's unit-only test scope, these are vitest unit tests that mock `invokeCli`; live-CLI checks are the T0 probe + quickstart, gated by `.memory/test-execution-instructions.md`.)

**Organization**: `get_active_file` is a single, indivisible eval-composition tool surface — the four user stories are facets of one module, not separately shippable code increments. Tasks are grouped by user story where the handler/tests genuinely differ; the shared schema + template are Foundational. The MVP (US1+US2) is the working tool reporting an active file and the no-active-file absence; US3/US4 add behaviors of the same handler.

## Path Conventions

Single project — MCP server at `src/`. New module: `src/tools/get_active_file/`. Co-located tests as `*.test.ts`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Module scaffolding.

- [ ] T001 [P] Create `src/tools/get_active_file/` and stub `schema.ts`, `_template.ts`, `handler.ts`, `index.ts`, each opening with a `// Original — no upstream. <one-line intent>.` header (Constitution Principle V).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The Zod schemas + eval template every user story depends on. No user-visible behavior alone.

**⚠️ CRITICAL**: US1–US4 cannot be implemented until this phase is complete.

- [ ] T002 [P] Implement the Zod schemas in `src/tools/get_active_file/schema.ts` per [data-model.md](data-model.md): input `getActiveFileInputSchema = applyTargetModeRefinementForFolderScoped(targetModeBaseSchema)` (import from `../../target-mode/target-mode.js`); `fileInfoSchema = z.object({ path, name, basename, extension }).strict()`; `getActiveFileOutputSchema = z.object({ active: fileInfoSchema.nullable() }).strict()`; `getActiveFileEvalResponseSchema = z.object({ ok: z.literal(true), active: fileInfoSchema.nullable() }).strict()`; export `z.infer` types (`GetActiveFileInput`, `GetActiveFileOutput`, `GetActiveFileEvalResponse`).
- [ ] T003 [P] Implement the frozen eval template in `src/tools/get_active_file/_template.ts` (research D4): a plain sync IIFE string `(()=>{const f=app.workspace.getActiveFile();return JSON.stringify(f?{ok:true,active:{path:f.path,name:f.name,basename:f.basename,extension:f.extension}}:{ok:true,active:null});})()`. **No `__PAYLOAD_B64__`, no `composeEvalCode`** (no caller data crosses into the eval → no injection surface). Export the constant.
- [ ] T004 [P] Write `src/tools/get_active_file/schema.test.ts` covering the full mode refinement (serves US1+US4 schema behavior): `{target_mode:"active"}` accepted; `{target_mode:"specific",vault:"V"}` accepted; specific without `vault` → issue `vault is required in specific mode`; active with `vault` → issue `vault is not allowed in active mode`; `file` and `path` rejected in **both** modes; unknown field rejected (`.strict()`); output + envelope schemas parse a present `active` and a `null` `active`.
- [ ] T005 [P] Write `src/tools/get_active_file/_template.test.ts` asserting the exact recorded eval string (byte-stable) and documenting the field-derivation intent (name = basename + extension; multi-dot; no-extension — supplied by the substrate, not re-parsed).

**Checkpoint**: Schema + template exist and are unit-tested; the handler can now be built.

---

## Phase 3: User Story 1 - Read the active file's details (Priority: P1) 🎯 MVP

**Goal**: An active-mode call returns the active file's `{ path, name, basename, extension }`, and the tool is registered + callable end-to-end.

**Independent Test**: With a note active, `get_active_file { target_mode: "active" }` returns that note's four fields, with the name=basename+extension / multi-dot / no-extension / non-ASCII rules holding.

- [ ] T006 [US1] Implement `executeGetActiveFile` in `src/tools/get_active_file/handler.ts` per [data-model.md](data-model.md): `ExecuteDeps = { logger, queue, vaultRegistry, spawnFn?, env? }`; the common path = `invokeCli({ command:"eval", vault: input.target_mode === "specific" ? input.vault : undefined, parameters:{ code: ACTIVE_FILE_TEMPLATE }, flags:[], target_mode: input.target_mode }, { spawnFn, env, logger, queue })` → `decodeEvalEnvelope(result.stdout, getActiveFileEvalResponseSchema, { toolName:"get_active_file", malformedCode:"CLI_REPORTED_ERROR" })` (import from `../_active-file.js`) → `return getActiveFileOutputSchema.parse({ active: data.active })`. Active mode skips vault resolution (the specific-mode branch is added in US4/T016).
- [ ] T007 [US1] Implement `src/tools/get_active_file/index.ts`: `GET_ACTIVE_FILE_TOOL_NAME = "get_active_file"`, `createGetActiveFileTool(deps)` via `registerTool` (import from `../_register.js`), and the **full** `GET_ACTIVE_FILE_DESCRIPTION` covering both modes, the four fields + derivation, `{ active: null }`, the cross-vault behavior, the timing caveat, and the complete error roster — written complete now so the registry fingerprint is stable across later phases.
- [ ] T008 [US1] Register in `src/server.ts`: import `createGetActiveFileTool` and add `createGetActiveFileTool({ logger, queue, vaultRegistry })` to the tool-registration array.
- [ ] T009 [US1] Author `docs/tools/get_active_file.md` (minimum viable doc now; enriched in T014) so the dynamic `help` docs-completeness path passes, and add a row to `docs/tools/index.md` if it hand-enumerates tools. Then update `src/tools/_register-baseline.json` with the `get_active_file` entry (regenerate description + schema fingerprints) and confirm `_register-baseline.test.ts` passes.
- [ ] T010 [P] [US1] Write the active-mode happy-path coverage in `src/tools/get_active_file/handler.test.ts` (mock `invokeCli`): assert recorded argv (`command:"eval"`, `target_mode:"active"`, no `vault`); success envelope → result `{ active: { path, name, basename, extension } }`; drive the field-shape cases through the mocked envelope (single-ext, multi-dot `a.b.md`, no-extension, non-ASCII returned raw).
- [ ] T011 [P] [US1] Write `src/tools/get_active_file/index.test.ts`: registration shape — name `get_active_file`, non-empty description, input schema wired.

**Checkpoint**: Active-mode read works end-to-end; tool registered, baseline green.

---

## Phase 4: User Story 2 - "No active file" is a success, not an error (Priority: P1)

**Goal**: When nothing is active (empty workspace / all panes closed / non-file view), the call returns a successful `{ active: null }`, distinguishable from a present result — never `ERR_NO_ACTIVE_FILE`.

**Independent Test**: With no file active, `get_active_file { target_mode: "active" }` returns `{ active: null }` (success), and a caller can branch on `active === null`.

- [ ] T012 [US2] Verify in `src/tools/get_active_file/handler.ts` that the common path passes the envelope's `active: null` straight through to `{ active: null }` with **no** error branch (research D3): confirm there is no `NO_ACTIVE_FILE`/`ERR_NO_ACTIVE_FILE` mapping and the tool does not consume `resolveActiveFocusedFile`. (Likely already satisfied by T006 — this task is the explicit guard against re-introducing the cohort's error behavior.)
- [ ] T013 [P] [US2] Add the no-active boundary coverage to `src/tools/get_active_file/handler.test.ts`: mocked envelope `{ ok:true, active:null }` → result `{ active:null }` (assert it is a success, not an `isError`/throw); assert the result is distinguishable from a present-file result.

**Checkpoint**: Presence and absence are both ordinary success outcomes.

---

## Phase 5: User Story 3 - Confirm before acting + documented timing limitation (Priority: P2)

**Goal**: The returned `path` is usable as a follow-up locator, the response carries no input echo, and the point-in-time/TOCTOU + post-launch-focus caveats are documented.

**Independent Test**: Read the active file, reuse the returned `path` as a `path` locator against the same file; and confirm `help({ tool_name: "get_active_file" })` documents the snapshot/timing limitation.

- [ ] T014 [US3] Enrich `docs/tools/get_active_file.md` (help content) to cover: the two modes, the four fields + derivation, the `{ active:null }` success, the path-as-locator round-trip (FR-007), the point-in-time/TOCTOU caveat (T1/FR-008), the post-launch-focus caveat for the inherited app-down launch (T2/FR-013), and the full error roster with recovery hints.
- [ ] T015 [P] [US3] Add the echo-convention boundary assertion to `src/tools/get_active_file/handler.test.ts`: the success result object contains **only** `active` — no `vault` / `target_mode` echo (FR-015 / read-vs-write echo convention) — and `active.path` equals the envelope path verbatim (the value an agent re-uses as a locator, FR-007).

**Checkpoint**: The read is safe to use as a confirm-before-act primitive, with the timing limitation documented.

---

## Phase 6: User Story 4 - Target a named vault, cross-vault, with typed unknown-vault error (Priority: P2)

**Goal**: `specific` mode reports the named vault's active file even when it is open-but-unfocused (cross-vault, no guard); an unregistered vault is a typed `VAULT_NOT_FOUND/unknown` error.

**Independent Test**: With vault A focused and B open-but-unfocused, `get_active_file { target_mode:"specific", vault:"B" }` returns B's active file; an unregistered vault name returns `CLI_REPORTED_ERROR` / `details.code:"VAULT_NOT_FOUND"` / `reason:"unknown"`.

- [ ] T016 [US4] Add the specific-mode branch to `src/tools/get_active_file/handler.ts` (research D5/D6): when `input.target_mode === "specific"`, `await resolveVaultRootOrRemap(deps.vaultRegistry, input.vault, "get_active_file")` (import from `../_active-file.js`) **before** the eval — its base path is discarded (no guard); the eval then routes `vault: input.vault, target_mode:"specific"` (B1 false → runs in the named vault). No focused-vault guard; `details.reason:"not-open"` is never emitted.
- [ ] T017 [P] [US4] Add the specific-mode coverage to `src/tools/get_active_file/handler.test.ts` (mock `invokeCli` + a `vaultRegistry` stub): recorded argv carries `vault=<name>` + `target_mode:"specific"`; success → named vault's `{ active }`; an unregistered vault (registry stub throws `VALIDATION_ERROR`) → `CLI_REPORTED_ERROR` with `details.code:"VAULT_NOT_FOUND"`, `reason:"unknown"`; an inherited app-down throw (`CLI_NON_ZERO_EXIT` / `obsidian-not-running`) propagates unchanged (no fabricated success).

**Checkpoint**: All four user stories functional; full failure roster covered.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Live verification, quality gates, structural verification.

- [ ] T018 Run the implement-T0 probe per [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md) (gated by `.memory/test-execution-instructions.md`; drive `Obsidian.com`): **P1** cross-vault active-file UI-state (load-bearing — if it fails, STOP and surface to the user for spec/plan revision), **P2** field-shape, **P3** no-active success, **P4** IIFE form. Record results in `specs/063-report-focused-file/contracts/t0-probe-findings.md`.
- [ ] T019 [P] Run the [quickstart.md](quickstart.md) manual validation scenarios (gated) and note any deviations.
- [ ] T020 Run the full quality gate: `npm run lint` (zero warnings), `npm run typecheck`, `npm run build`, and the Windows-safe coverage run — `mkdir -p coverage/.tmp` then `npx vitest run --coverage --pool=forks --no-file-parallelism` — confirming the aggregate statements threshold holds.
- [ ] T021 Run `/graphify --update`, then the post-implement structural verification (plan §"Post-implement structural verification"): (1) no new top-level error code / `details.reason`; (2) `get_active_file/handler.ts` does not import `createLogger`/`createQueue`/`createServer`; (3) `get_active_file` lands in the eval-composed cohort community with no edge to `app-launcher`; (4) the new production files are structurally connected.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)** → no deps.
- **Foundational (T002–T005)** → after T001; **blocks all user stories** (schema + template are imported everywhere).
- **US1 (T006–T011)** → after Foundational. The MVP. T006→T007→T008→T009 are sequential (handler → registration → docs/baseline); T010/T011 [P] after T007/T009.
- **US2 (T012–T013)** → after T006 (extends/verifies the same handler).
- **US3 (T014–T015)** → after T007 (docs) / T006 (handler test). Independent of US4.
- **US4 (T016–T017)** → after T006 (adds the specific-mode branch to the same handler) and relies on T004's schema coverage.
- **Polish (T018–T021)** → after all desired stories.

### Same-file serialization (NOT parallel)

`handler.ts` is edited by T006 (US1), T012 (US2), T016 (US4) — sequential. `handler.test.ts` is appended by T010, T013, T015, T017 — sequential (same file). `schema.ts`/`schema.test.ts`/`_template.ts`/`_template.test.ts` are each single-task. `index.ts`/`server.ts`/`_register-baseline.json` are US1-only.

### Parallel Opportunities

- T002 + T003 (schema vs template — different files).
- T004 + T005 (schema.test vs _template.test) after their targets.
- T010 + T011 within US1 (handler.test vs index.test — but note handler.test is also touched later; run T010 first).
- T018 vs T019 (probe vs quickstart) are both live-CLI — run sequentially in practice to avoid workspace contention despite the [P] marker on T019.

---

## Implementation Strategy

**Single-surface reality**: `get_active_file` ships as one increment — schema + template + handler + registration + docs + tests land together for a green build (lint/typecheck/build/coverage at T020). The per-story checkpoints below are test-coverage milestones, not separately deployable artifacts.

1. **Setup + Foundational** (T001–T005): module + schema + template, unit-tested.
2. **MVP = US1 + US2** (T006–T013): the tool reports an active file and the no-active-file absence, registered and callable. This is the demoable core.
3. **US3** (T014–T015): documentation of the timing limitation + the echo-convention guarantee.
4. **US4** (T016–T017): cross-vault specific mode + the typed unknown-vault error.
5. **Polish** (T018–T021): live T0 probe (P1 gates the cross-vault guarantee), quickstart, quality gate, structural verification.

---

## Notes

- **Graphify path-query rule (CLAUDE.md `/speckit-tasks`)**: this BI is a single new source module (`src/tools/get_active_file/**`) plus the standard registration triad (`server.ts` line + `_register-baseline.json` + `docs/tools/`). The cross-module edges a task pair both touches — `handler.ts → _active-file.ts` (`decodeEvalEnvelope`, `resolveVaultRootOrRemap`), `handler.ts → target-mode.ts` (schema), `index.ts → _register.ts`, `server.ts → index.ts` — are the established eval-cohort + registration paths, already grounded by source lookup in the plan's `### Graphify structural check`. No additional `/graphify path` query adds information; rule satisfied by the plan grounding.
- Tests are required (Principle II), co-located, and mock `invokeCli` (unit scope). Live behavior is the T0 probe (T018) + quickstart (T019).
- Zero new top-level error codes (FR-016 / Principle IV) — the handler reuses `VAULT_NOT_FOUND/unknown`, `CLI_REPORTED_ERROR`, inherited `CLI_NON_ZERO_EXIT/obsidian-not-running`, and `VALIDATION_ERROR`; it must NOT emit `ERR_NO_ACTIVE_FILE`.
- Commit after each task or logical group. Stop at any checkpoint to validate.
