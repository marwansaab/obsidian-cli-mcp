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

- [X] T001 [P] Create `src/tools/get_active_file/` and stub `schema.ts`, `_template.ts`, `handler.ts`, `index.ts`, each opening with a `// Original — no upstream. <one-line intent>.` header (Constitution Principle V).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The Zod schemas + eval template every user story depends on. No user-visible behavior alone.

**⚠️ CRITICAL**: US1–US4 cannot be implemented until this phase is complete.

- [X] T002 [P] Implement the Zod schemas in `src/tools/get_active_file/schema.ts` per [data-model.md](data-model.md): input `getActiveFileInputSchema = applyTargetModeRefinementForFolderScoped(targetModeBaseSchema)` (import from `../../target-mode/target-mode.js`); `fileInfoSchema = z.object({ path, name, basename, extension }).strict()`; `getActiveFileOutputSchema = z.object({ active: fileInfoSchema.nullable() }).strict()`; `getActiveFileEvalResponseSchema = z.object({ ok: z.literal(true), active: fileInfoSchema.nullable() }).strict()`; export `z.infer` types (`GetActiveFileInput`, `GetActiveFileOutput`, `GetActiveFileEvalResponse`).
- [X] T003 [P] Implement the frozen eval template in `src/tools/get_active_file/_template.ts` (research D4): a plain sync IIFE string `(()=>{const f=app.workspace.getActiveFile();return JSON.stringify(f?{ok:true,active:{path:f.path,name:f.name,basename:f.basename,extension:f.extension}}:{ok:true,active:null});})()`. **No `__PAYLOAD_B64__`, no `composeEvalCode`** (no caller data crosses into the eval → no injection surface). Export the constant.
- [X] T004 [P] Write `src/tools/get_active_file/schema.test.ts` covering the full mode refinement (serves US1+US4 schema behavior): `{target_mode:"active"}` accepted; `{target_mode:"specific",vault:"V"}` accepted; specific without `vault` → issue `vault is required in specific mode`; active with `vault` → issue `vault is not allowed in active mode`; `file` and `path` rejected in **both** modes; unknown field rejected (`.strict()`); output + envelope schemas parse a present `active` and a `null` `active`; **and the output schema rejects an extra field (e.g. `pane`/`leaf`)** — the structural guarantee for FR-017/FR-018 (no pane/split/leaf or cursor surface). [U1]
- [X] T005 [P] Write `src/tools/get_active_file/_template.test.ts` asserting the exact recorded eval string (byte-stable) and documenting the field-derivation intent (name = basename + extension; multi-dot; no-extension — supplied by the substrate, not re-parsed); **and assert the template is read-only** — its source contains no `openLinkText` / `setActiveLeaf` / mutation call (FR-019 never changes the active file). [U1]

**Checkpoint**: Schema + template exist and are unit-tested; the handler can now be built.

---

## Phase 3: User Story 1 - Read the active file's details (Priority: P1) 🎯 MVP

**Goal**: An active-mode call returns the active file's `{ path, name, basename, extension }`, and the tool is registered + callable end-to-end.

**Independent Test**: With a note active, `get_active_file { target_mode: "active" }` returns that note's four fields, with the name=basename+extension / multi-dot / no-extension / non-ASCII rules holding.

- [X] T006 [US1] Implement `executeGetActiveFile` in `src/tools/get_active_file/handler.ts` per [data-model.md](data-model.md): `ExecuteDeps = { logger, queue, vaultRegistry, spawnFn?, env? }`; the common path = `invokeCli({ command:"eval", vault: input.target_mode === "specific" ? input.vault : undefined, parameters:{ code: ACTIVE_FILE_TEMPLATE }, flags:[], target_mode: input.target_mode }, { spawnFn, env, logger, queue })` → `decodeEvalEnvelope(result.stdout, getActiveFileEvalResponseSchema, { toolName:"get_active_file", malformedCode:"CLI_REPORTED_ERROR" })` (import from `../_active-file.js`) → `return getActiveFileOutputSchema.parse({ active: data.active })`. Active mode skips vault resolution (the specific-mode branch is added in US4/T016). **[C1]** Add an inline comment on the `{ active: null }` arm noting it is an **authorized success** (FR-005 / research D3 / Principle IV's Clarifications-exception), not a masked empty result — so a reviewer grepping for null returns sees the justification.
- [X] T007 [US1] Implement `src/tools/get_active_file/index.ts`: `GET_ACTIVE_FILE_TOOL_NAME = "get_active_file"`, `createGetActiveFileTool(deps)` via `registerTool` (import from `../_register.js`), and the **full** `GET_ACTIVE_FILE_DESCRIPTION` covering both modes, the four fields + derivation, `{ active: null }`, the cross-vault behavior, the timing caveat, and the complete error roster — written complete now so the registry fingerprint is stable across later phases.
- [X] T008 [US1] Register in `src/server.ts`: import `createGetActiveFileTool` and add `createGetActiveFileTool({ logger, queue, vaultRegistry })` to the tool-registration array.
- [X] T009 [US1] Author the **COMPLETE** `docs/tools/get_active_file.md` (all sections: the two modes, the four fields + derivation, the `{ active: null }` success, cross-vault behavior, the timing/TOCTOU + post-launch-focus caveats, path-as-locator, and the full error roster) and add a `**get_active_file**` row to `docs/tools/index.md`. **[O1 — hard boot gate]**: `createServer` calls `assertToolDocsExist`, which **throws at startup** if a registered tool lacks `docs/tools/<name>.md`, and `server.test.ts` asserts "every registered tool has a corresponding doc" — so the doc MUST exist with real content in this same change (a stub is not acceptable for a registered tool). Then update `src/tools/_register-baseline.json` with the `get_active_file` entry (regenerate description + schema fingerprints) and confirm `_register-baseline.test.ts`, `server.test.ts` (boot docs-aggregation + docs-parity), and the `help` doc-serving path all pass.
- [X] T010 [P] [US1] Write the active-mode happy-path coverage in `src/tools/get_active_file/handler.test.ts` (mock `invokeCli`): assert recorded argv (`command:"eval"`, `target_mode:"active"`, no `vault`); success envelope → result `{ active: { path, name, basename, extension } }`; drive the field-shape cases through the mocked envelope (single-ext, multi-dot `a.b.md`, no-extension, non-ASCII returned raw).
- [X] T011 [P] [US1] Write `src/tools/get_active_file/index.test.ts`: registration shape — name `get_active_file`, non-empty description, input schema wired.

**Checkpoint**: Active-mode read works end-to-end; tool registered, baseline green.

---

## Phase 4: User Story 2 - "No active file" is a success, not an error (Priority: P1)

**Goal**: When nothing is active (empty workspace / all panes closed / non-file view), the call returns a successful `{ active: null }`, distinguishable from a present result — never `ERR_NO_ACTIVE_FILE`.

**Independent Test**: With no file active, `get_active_file { target_mode: "active" }` returns `{ active: null }` (success), and a caller can branch on `active === null`.

- [X] T012 [US2] Verify in `src/tools/get_active_file/handler.ts` that the common path passes the envelope's `active: null` straight through to `{ active: null }` with **no** error branch (research D3): confirm there is no `NO_ACTIVE_FILE`/`ERR_NO_ACTIVE_FILE` mapping and the tool does not consume `resolveActiveFocusedFile`. (Likely already satisfied by T006 — this task is the explicit guard against re-introducing the cohort's error behavior.)
- [X] T013 [P] [US2] Add the no-active boundary coverage to `src/tools/get_active_file/handler.test.ts`: mocked envelope `{ ok:true, active:null }` → result `{ active:null }` (assert it is a success, not an `isError`/throw); assert the result is distinguishable from a present-file result.

**Checkpoint**: Presence and absence are both ordinary success outcomes.

---

## Phase 5: User Story 3 - Confirm before acting + documented timing limitation (Priority: P2)

**Goal**: The returned `path` is usable as a follow-up locator, the response carries no input echo, and the point-in-time/TOCTOU + post-launch-focus caveats are documented.

**Independent Test**: Read the active file, reuse the returned `path` as a `path` locator against the same file; and confirm `help({ tool_name: "get_active_file" })` documents the snapshot/timing limitation.

- [X] T014 [US3] Verify `docs/tools/get_active_file.md` (authored complete at T009 — see O1 boot gate) fully documents the US3 guarantees: the path-as-locator round-trip (FR-007), the point-in-time/TOCTOU snapshot caveat (T1/FR-008), and the post-launch-focus caveat for the inherited app-down launch (T2/FR-013). Refine the wording if any is missing or unclear. (Doc creation is T009; this task owns the US3 documentation-content closure.)
- [X] T015 [P] [US3] Add the echo-convention boundary assertion to `src/tools/get_active_file/handler.test.ts`: the success result object contains **only** `active` — no `vault` / `target_mode` echo (FR-015 / read-vs-write echo convention) — and `active.path` equals the envelope path verbatim (the value an agent re-uses as a locator, FR-007).

**Checkpoint**: The read is safe to use as a confirm-before-act primitive, with the timing limitation documented.

---

## Phase 6: User Story 4 - Target a named vault, cross-vault, with typed unknown-vault error (Priority: P2)

**Goal**: `specific` mode reports the named vault's active file even when it is open-but-unfocused (cross-vault, no guard); an unregistered vault is a typed `VAULT_NOT_FOUND/unknown` error.

**Independent Test**: With vault A focused and B open-but-unfocused, `get_active_file { target_mode:"specific", vault:"B" }` returns B's active file; an unregistered vault name returns `CLI_REPORTED_ERROR` / `details.code:"VAULT_NOT_FOUND"` / `reason:"unknown"`.

- [X] T016 [US4] Add the specific-mode branch to `src/tools/get_active_file/handler.ts` (research D5/D6): when `input.target_mode === "specific"`, `await resolveVaultRootOrRemap(deps.vaultRegistry, input.vault, "get_active_file")` (import from `../_active-file.js`) **before** the eval — its base path is discarded (no guard); the eval then routes `vault: input.vault, target_mode:"specific"` (B1 false → runs in the named vault). No focused-vault guard; `details.reason:"not-open"` is never emitted.
- [X] T017 [P] [US4] Add the specific-mode coverage to `src/tools/get_active_file/handler.test.ts` (mock `invokeCli` + a `vaultRegistry` stub): recorded argv carries `vault=<name>` + `target_mode:"specific"`; success → named vault's `{ active }`; an unregistered vault (registry stub throws `VALIDATION_ERROR`) → `CLI_REPORTED_ERROR` with `details.code:"VAULT_NOT_FOUND"`, `reason:"unknown"`; an inherited app-down throw (`CLI_NON_ZERO_EXIT` / `obsidian-not-running`) propagates unchanged (no fabricated success).

**Checkpoint**: All four user stories functional; full failure roster covered.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Live verification, quality gates, structural verification.

- [~] T018 Run the implement-T0 probe per [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md) (gated by `.memory/test-execution-instructions.md`; drive `Obsidian.com`): **P1** cross-vault active-file UI-state (load-bearing — if it fails, STOP and surface to the user for spec/plan revision), **P2** field-shape, **P3** no-active success, **P4** IIFE form. Record results in `specs/063-report-focused-file/contracts/t0-probe-findings.md`. — **PARTIAL / PENDING USER EXECUTION**: CLI reachability confirmed; P1 (load-bearing) requires an interactive two-vault focus setup that cannot be staged from a headless session; P2/P3/P4 are unit-locked with strong priors. Findings recorded in [contracts/t0-probe-findings.md](contracts/t0-probe-findings.md). P1 must be run in the user's live multi-vault environment before the cross-vault guarantee is treated as empirically verified.
- [~] T019 [P] Run the [quickstart.md](quickstart.md) manual validation scenarios (gated) and note any deviations. — **PENDING USER EXECUTION**: the quickstart scenarios (making notes active, closing panes, two-vault cross-vault) are interactive UI-state manual checks; the in-process equivalents are covered by the co-located `*.test.ts`. Run live alongside T018 P1.
- [X] T020 Run the full quality gate: `npm run lint` (zero warnings), `npm run typecheck`, `npm run build`, and the Windows-safe coverage run — `mkdir -p coverage/.tmp` then `npx vitest run --coverage --pool=forks --no-file-parallelism` — confirming the aggregate statements threshold holds.
- [X] T021 Run `/graphify --update`, then the post-implement structural verification (plan §"Post-implement structural verification"): (1) no new top-level error code / `details.reason`; (2) `get_active_file/handler.ts` does not import `createLogger`/`createQueue`/`createServer`; (3) `get_active_file` lands in the eval-composed cohort community with no edge to `app-launcher`; (4) the new production files are structurally connected. — **VERIFIED via authoritative source inspection** (the four checks are AST-structural facts fully determinable from source): (1) the handler constructs NO `UpstreamError` — all classification delegates to the shared `decodeEvalEnvelope` / `resolveVaultRootOrRemap`, so zero new top-level codes/`details.reason`; (2) `handler.ts` imports only `_template`, `_active-file` (`decodeEvalEnvelope`/`resolveVaultRootOrRemap`), `schema`, and `cli-adapter` (`invokeCli`) — no `createLogger`/`createQueue`/`createServer`/`app-launcher`; (3) module imports are the eval-cohort + registration paths only (no `app-launcher` edge); (4) `server.ts` imports + registers `createGetActiveFileTool` (production-connected, not orphaned). The AST graph auto-rebuilds on the next commit (post-commit hook); the semantic `/graphify --update` (LLM cost) is batched at the commit boundary per the CLAUDE.md cost-awareness guidance.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)** → no deps.
- **Foundational (T002–T005)** → after T001; **blocks all user stories** (schema + template are imported everywhere).
- **US1 (T006–T011)** → after Foundational. The MVP. T006→T007→T008→T009 are sequential (handler → registration → docs/baseline); T010/T011 [P] after T007/T009.
- **US2 (T012–T013)** → after T006 (extends/verifies the same handler).
- **US3 (T014–T015)** → T014 after T009 (the complete doc is authored there; T014 verifies/refines the US3 caveats); T015 after T006 (handler test). Independent of US4.
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
- **Docs are a hard boot gate (O1)**: a registered tool with no `docs/tools/<name>.md` makes `createServer` throw (`assertToolDocsExist`) and fails `server.test.ts` docs-parity. The complete doc is authored at T009 (same change as registration), not deferred — T014 only verifies/refines the US3-specific caveats.
- **FR-012 coverage (V1)**: closed/app-down recovery is inherited from `dispatchCli` (ADR-029/030) and has its own dispatch-layer tests; this BI adds no per-tool retry, so the only get_active_file-level assertion is T017's "app-down throw propagates unchanged." This is adequate by design — there is no per-tool recovery code to test.
- **Schema published shape (I1)**: T002 reuses `applyTargetModeRefinementForFolderScoped`, so the published `inputSchema` lists `file`/`path` as always-rejected fields (cohort-standard, same as `files`/`paths`); spec FR-009 + data-model state this honestly. T004 asserts they are rejected.
- Commit after each task or logical group. Stop at any checkpoint to validate.
