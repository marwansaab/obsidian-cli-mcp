---
description: "Task list for BI-029 list-files-recursive (tree) implementation"
---

# Tasks: List Files Recursive — `tree` typed tool (BI-029)

**Input**: Design documents from `/specs/029-list-files-recursive/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED — co-located vitest cases ship in the same change as their surface per Constitution Principle II. 43 cases minimum (18 schema / 20 handler / 5 registration) per the data-model.md inventory; the per-story task decomposition below realises ~30+ individual handler test cases, comfortably exceeding the SC-016 minimum of 40 total. Test scope is unit-only (per project memory); integration / T0-manual cases live in the user's external tracker and execute against the authorised test vault per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md).

**Coverage-bound notes** (handler-test architecture):

- **FR-017 path traversal**: rejection happens at the in-eval template OR the cli-adapter's vault-confinement layer — neither is fully testable in a mocked-dispatcher CI harness. T058 / T0-M4 is the authoritative gate. CI coverage limited to whatever the schema layer rejects structurally (currently no `..` regex).
- **FR-027 dotfile filter**: the filter lives in the JS template (T014), not the handler. A handler CI test against a mock envelope can only verify envelope pass-through, not the in-template filter logic. Coverage of the filter rests on (a) T011's SHA-256 byte-stability lock on `FROZEN_TEMPLATE` (any removal/regression of the filter clause changes the SHA and fails T011) and (b) T058 / T0-M3 live verification against the `Sandbox/bi029-dot/` fixture. Same coverage architecture as BI-026 / BI-027 / BI-028.

**Organization**: Tasks grouped by user story (US1..US9 from spec.md). Note that all nine user stories share a single implementation module — the per-story grouping primarily partitions TEST coverage; the JS template / handler code is shared. Implementation effort is dominantly foundational + US1; US2..US9 are largely test-coverage tasks plus one wire-up edit each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1..US9)
- File paths absolute from repo root

## Path Conventions

Single-project TypeScript layout. All new source under `src/tools/tree/`; all new tests co-located in the same directory (Principle II). Docs at `docs/tools/tree.md`. Registration edits in `src/server.ts` and `src/tools/_register.test.ts`. Baseline at `src/tools/_register-baseline.json`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No-op for BI-029 — repo already initialised; build pipeline, vitest config, eslint, prettier, tsconfig all in place. The shared cross-cutting module `src/tools/_eval-vault-closed-detection/` is already shipped (BI-027 lift, BI-028 second use). This phase is intentionally empty.

(No tasks in Phase 1.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Module skeleton + schemas + frozen JS template + handler scaffolding. MUST complete before any user-story implementation tasks. All nine user stories depend on these.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [X] T001 [P] Create `src/tools/tree/` directory.
- [X] T002 Create `src/tools/tree/schema.ts` — declare `treeInputSchema` (per data-model.md: `targetModeBaseSchema.extend({folder, depth, ext, total}).strict().superRefine(applyTargetModeRefinement)`), `treeOutputSchema` strict `{count, paths}`, `treeEnvelopeSchema` discriminated union on `ok` with `{ok:true, count, paths}` and `{ok:false, code: "FOLDER_NOT_FOUND" | "NOT_A_FOLDER", folder}` branches, and exported types (`TreeInput`, `TreeOutput`). Carry `// Original — no upstream.` header (Principle V / FR-026). Reuse `applyTargetModeRefinement` from `src/target-mode/target-mode.ts` with `forbidFileLocator: true, folderScoped: true`.
- [X] T003 Create `src/tools/tree/schema.test.ts` — 18 schema-level cases per data-model.md test inventory: valid minimal specific, valid minimal active, valid full specific (all optional fields set), specific missing vault → fail, active with vault → fail, file present → fail × 2 modes, path present → fail × 2 modes, unknown-key → fail, target_mode value out-of-enum → fail, depth zero / negative / non-integer / non-number → fail × 4, total non-boolean → fail × 3 (string/integer/null), folder non-string → fail × 2 (array/null), ext non-string → fail × 1 (array). Run in pairing with T002 (TDD — verify schema rejects malformed inputs before T002 lands).
- [X] T004 Create `src/tools/tree/handler.ts` — declare `FROZEN_TEMPLATE` constant (the ~70-LOC JS template from data-model.md, verbatim including the IIFE wrapper, stat-trichotomy gate, async walk with level counter, dotfile filter, ext filter, trailing-slash transform, sort, envelope-emit branched on `total`), `createTreeHandler` factory function signature with `HandlerDeps`-typed `{invokeCli, detectEvalVaultClosed}` dependencies, and skeleton multi-stage parse (stages 1-8 with placeholder logic that throws "not implemented" at every branch). Import the shared `detectEvalVaultClosed` from `src/tools/_eval-vault-closed-detection/`. Import `UpstreamError` from `src/upstream-error/`. Carry Original-no-upstream header.
- [X] T005 [P] Verify the shared closed-vault detector module exists at `src/tools/_eval-vault-closed-detection/index.ts` and its public API exposes a function whose signature accepts the `invokeCli` result shape AND throws `UpstreamError("CLI_REPORTED_ERROR", { details: { code: "VAULT_NOT_FOUND", reason: "not-open" } })` on detection. (No edit — verification step. If the import surface differs, this task documents what to import and how. Identical verification ran for BI-028 T005.)

**Checkpoint**: Foundation ready — module skeleton compiles, schemas parse, frozen template is byte-stable, handler is a stub that throws "not implemented" at every branch.

---

## Phase 3: User Story 1 — Specific-mode whole-vault recursive listing (Priority: P1) 🎯 MVP

**Goal**: An agent supplies `target_mode: "specific"`, a vault display name, and no `folder` — receives `{count, paths}` with the full flat recursive subtree of every file and folder under the vault root, sorted byte-asc, folders trailing-slashed, dotfiles excluded.

**Independent Test**: Q-9 (CI happy-path mock against simulated mixed-subtree envelope) + T0-M1 (live against TestVault with seeded `Sandbox/bi029-mixed/` fixture). MVP is shippable when these pass.

### Tests for User Story 1

- [X] T006 [P] [US1] Add to `src/tools/tree/handler.test.ts` — Q-9 default-mode happy path: mock `invokeCli` returns envelope with mixed file/folder paths matching the US1 scenario 1 fixture (`README.md`, `Inbox/a.md`, `Inbox/b.md`, `Inbox/Sub/c.md`, `Archive/old.md`, `Inbox/`, `Inbox/Sub/`, `Archive/`). Assert handler returns `{count: 8, paths: [...]}`; assert `count === paths.length`; assert every folder entry ends with `/`; assert every file entry does NOT end with `/`; assert `paths` is sorted byte-asc.
- [X] T007 [P] [US1] Add to `src/tools/tree/handler.test.ts` — empty-vault happy path: mock envelope `{ok:true, count:0, paths:[]}`; assert handler returns `{count:0, paths:[]}` — never throws (parity with US1 scenario 2).
- [X] T008 [P] [US1] Add to `src/tools/tree/handler.test.ts` — invariant I-2 single-spawn: assert `invokeCli` spy called exactly once for any successful call (parity with Q-23).
- [X] T009 [P] [US1] Add to `src/tools/tree/handler.test.ts` — invariant I-3 fixed dispatch shape: assert `invokeCli` call args are `{subcommand: "eval", targetMode: "specific", vault: "Demo", parameters: {code: <string>}}`; assert `code` contains `atob` token.
- [X] T010 [P] [US1] Add to `src/tools/tree/handler.test.ts` — invariant I-5 base64 payload round-trip: extract the base64 token from the captured `code` string via regex `atob\("([^"]+)"\)`; decode and `JSON.parse`; assert `{folder: null, depth: null, ext: null, total: false}` for a minimal US1 invocation.
- [X] T011 [P] [US1] Add to `src/tools/tree/handler.test.ts` — invariant I-4 frozen template byte-stability: compute SHA-256 of the `FROZEN_TEMPLATE` constant; lock the hex digest in a test constant. Drift fails the test (anti-injection structural regression detector — Q-25). **Workflow note**: T011 cannot be authored TDD-first (the template doesn't exist yet at test-writing time); the standard pattern is to write the test stub with a placeholder digest (e.g. `"TBD-fill-after-T014"`); on first run the assertion fails AND vitest's diff shows the actual SHA-256; copy the actual digest into the test constant; subsequent drift detection takes over. T011 lands AFTER T014 in execution order despite appearing before T013/T014 in the per-story task sequence.
- [X] T012 [P] [US1] Add to `src/tools/tree/handler.test.ts` — Q-17 unknown vault dispatch: mock `invokeCli` throws `UpstreamError("CLI_REPORTED_ERROR", { details: { code: "VAULT_NOT_FOUND", reason: "unknown" } })`; assert handler propagates unchanged.

### Implementation for User Story 1

- [X] T013 [US1] Implement `createTreeHandler` body in `src/tools/tree/handler.ts`: validation via `treeInputSchema.parse(input)` (throws ZodError → SDK serialises VALIDATION_ERROR per FR-021); base64 payload assembly (`{folder, depth, ext, total}` normalised to nulls-for-undefined, `total: !!input.total` default false → `JSON.stringify` → `Buffer.from(...).toString("base64")` → single `replace("__PAYLOAD_B64__", b64)` on the frozen template); single `invokeCli` call with `subcommand: "eval"`, `targetMode: input.target_mode`, optional `vault` flow-through; immediate call to `detectEvalVaultClosed(result)` post-dispatch; `=> ` prefix strip; multi-stage parse (`JSON.parse` → `treeEnvelopeSchema.safeParse` → discriminate on `ok` → throw `CLI_REPORTED_ERROR(stage: "envelope-error", code, folder)` for `ok: false`); final `treeOutputSchema.parse({count, paths})` validation at the return boundary.
- [X] T014 [US1] Implement the FROZEN_TEMPLATE constant body in `src/tools/tree/handler.ts` — the ~70-LOC JS template from data-model.md verbatim. Verify byte-stability across calls (T011 anti-injection test covers this structurally). Template MUST include: base64 payload decode via `atob` + `JSON.parse`; folder normalisation (strip trailing `/`; empty-string means vault root); `app.vault.adapter.stat()` trichotomy gate (skip stat for empty starting folder; return `FOLDER_NOT_FOUND` envelope for null stat; return `NOT_A_FOLDER` envelope for `stat.type === "file"`); DFS walk via `app.vault.adapter.list()` with level counter starting at 1; in-walk dotfile filter via `hasDotSegment` predicate (split on `/`, test each segment for `startsWith(".")`); depth-bound guard `if (depth !== null && level > depth) return`; post-walk ext filter (drops all folder entries when ext set; matches files via `toLowerCase().endsWith("." + extNormalised)`); trailing-slash map on folder entries; `out.sort()` byte-asc on the final string array; envelope emit branched on `total`.

**Checkpoint**: US1 fully functional. MVP shippable at this point. Tests T006-T012 pass. Handler returns `{count, paths}` with trailing-slash folder entries for valid US1 inputs; throws structured `UpstreamError` for every failure mode; never silent-fails.

---

## Phase 4: User Story 2 — Specific-mode sub-folder subtree listing (Priority: P1)

**Goal**: A sub-folder query (`folder: "Inbox"`) returns only entries beneath `Inbox/` (descendants only, starting folder excluded).

**Independent Test**: Q-10 (CI mock proving the in-eval walk starts at the named folder) + T0-M1 variant (live against TestVault with `folder: "Sandbox/bi029-mixed/Inbox"`).

### Tests for User Story 2

- [X] T015 [P] [US2] Add to `src/tools/tree/handler.test.ts` — Q-10 sub-folder happy path: mock envelope where `paths` contains only the `Inbox/`-rooted entries (`Inbox/a.md`, `Inbox/b.md`, `Inbox/Sub/`, `Inbox/Sub/c.md`). Assert handler returns these unchanged; assert starting folder `Inbox/` itself NOT in `paths` (the JS template's responsibility, but the handler-level test asserts the contract is met by the captured envelope).
- [X] T016 [P] [US2] Add to `src/tools/tree/handler.test.ts` — Q-15 missing-folder error: mock envelope `{ok: false, code: "FOLDER_NOT_FOUND", folder: "Missing"}`; assert handler throws `CLI_REPORTED_ERROR(stage: "envelope-error", code: "FOLDER_NOT_FOUND", folder: "Missing")` per I-9.
- [X] T017 [P] [US2] Add to `src/tools/tree/handler.test.ts` — Q-16 not-a-folder error: mock envelope `{ok: false, code: "NOT_A_FOLDER", folder: "notes/x.md"}`; assert handler throws `CLI_REPORTED_ERROR(stage: "envelope-error", code: "NOT_A_FOLDER", folder: "notes/x.md")`.
- [X] T018 [P] [US2] Add to `src/tools/tree/handler.test.ts` — empty existing folder: mock envelope `{ok:true, count:0, paths:[]}` against `folder: "Empty"`; assert handler returns `{count:0, paths:[]}` — distinguishable from missing-folder error path.
- [X] T019 [P] [US2] Add to `src/tools/tree/handler.test.ts` — invariant I-5 payload round-trip with `folder`: assert decoded payload carries the input folder value verbatim (no trailing-slash normalisation at this layer — that's the JS template's job).

### Implementation for User Story 2

- [X] T020 [US2] Verify the JS template's stat-trichotomy gate from T014 emits `FOLDER_NOT_FOUND` for null stat AND `NOT_A_FOLDER` for `stat.type === "file"`. This is a CODE REVIEW / inspection task to confirm the in-eval branch matches the envelope contract. Implementation is shared with T014; this task documents the FR-011 contract is held by the gate.

**Checkpoint**: US2 fully functional. Sub-folder queries correctly scope to the named subtree; missing-folder and not-a-folder cases surface as distinguishable structured errors. T0-M6 / T0-M7 verify live behaviour during /speckit-implement T0.

---

## Phase 5: User Story 3 — Depth-limited traversal (Priority: P1)

**Goal**: A `depth: N` query returns paths at depths 1..N from the starting folder; deeper entries are excluded.

**Independent Test**: Q-11 (CI mock with `depth: 1`) + T0-M2 (live against TestVault with depth caps applied to a known-depth fixture).

### Tests for User Story 3

- [X] T021 [P] [US3] Add to `src/tools/tree/handler.test.ts` — Q-11 depth-1 cap: mock envelope where the in-eval walk has stopped at level 1 (paths contains only immediate children, no descendants). Assert handler returns the captured envelope verbatim.
- [X] T022 [P] [US3] Add to `src/tools/tree/handler.test.ts` — depth-2 cap: mock envelope where paths contain depth-1 AND depth-2 entries; assert handler returns verbatim.
- [X] T023 [P] [US3] Add to `src/tools/tree/handler.test.ts` — depth-greater-than-actual-height: mock envelope identical to no-depth case; assert handler accepts `depth: 99` silently (the in-eval template's responsibility).
- [X] T024 [P] [US3] Add to `src/tools/tree/handler.test.ts` — payload round-trip with `depth`: assert decoded payload carries `depth: 1` (or 2 / 99) verbatim.
- [X] T025 [P] [US3] Add to `src/tools/tree/handler.test.ts` — depth validation at schema layer: assert `treeInputSchema.safeParse({target_mode: "specific", vault: "Demo", depth: 0})` fails (covered in schema.test.ts T003 — this task is a cross-suite reference noting the schema layer is responsible for depth validation BEFORE any handler call). No new code; verify cross-reference.

### Implementation for User Story 3

- [X] T026 [US3] Verify the JS template's level counter from T014 correctly enforces `level > depth` early-return. The implementation is shared with T014; this task is a CODE REVIEW / inspection task to confirm the in-eval walk respects the depth cap. T021–T023 cover the test seam.

**Checkpoint**: US3 fully functional. Depth-bounded traversals return only entries at depths 1..N. The "depth greater than subtree height is silently accepted" contract (FR-006 / Edge Case `CONTENT — depth bounding`) is verified by T023.

---

## Phase 6: User Story 4 — Extension filter on the recursive subtree (Priority: P1)

**Goal**: An `ext` query returns only files matching the extension; folder entries are excluded from `paths` when `ext` is set.

**Independent Test**: Q-12 (CI mock with `ext: "md"`) + T0 manual (live against TestVault with mixed-extension fixture).

### Tests for User Story 4

- [X] T027 [P] [US4] Add to `src/tools/tree/handler.test.ts` — Q-12 ext-md happy path: mock envelope where paths contains only `.md` files (no folder entries); assert handler returns unchanged; assert every entry in `paths` is a file (no trailing `/`).
- [X] T028 [P] [US4] Add to `src/tools/tree/handler.test.ts` — leading-dot vs bare ext: payload round-trip asserts decoded payload normalises `ext: ".md"` and `ext: "md"` identically (the schema or template handles normalisation; this test verifies the captured payload's `ext` matches one of the two forms — the actual normalisation is in the template per R11).
- [X] T029 [P] [US4] Add to `src/tools/tree/handler.test.ts` — ext-no-match: mock envelope `{ok:true, count:0, paths:[]}` against `ext: "qqq"`; assert success, not error.
- [X] T030 [P] [US4] Add to `src/tools/tree/handler.test.ts` — ext + depth composition: mock envelope where paths contains only `.md` files at depth ≤ 2; assert handler returns verbatim. (The in-eval template composes the filters; this test asserts the handler is mode-agnostic.)

### Implementation for User Story 4

- [X] T031 [US4] Verify the JS template's post-walk ext filter from T014 correctly: (a) drops ALL folder entries when `ext !== null`; (b) matches files via `toLowerCase().endsWith("." + extNormalised)`; (c) leaves files unchanged when `ext === null`; (d) accepts both `.md` and `md` forms via the leading-dot strip. Code review / inspection task.

**Checkpoint**: US4 fully functional. Ext-filtered listings return only matching files; folder entries excluded.

---

## Phase 7: User Story 5 — Active-mode listing against the focused vault (Priority: P1)

**Goal**: `target_mode: "active"` resolves to the focused vault at execution time; same `{count, paths}` shape as specific mode.

**Independent Test**: Q-13 (CI mock asserts dispatch shape) + T0 manual (live against TestVault with TestVault focused).

### Tests for User Story 5

- [X] T032 [P] [US5] Add to `src/tools/tree/handler.test.ts` — Q-13 active-mode dispatch shape: invoke handler with `{target_mode: "active"}`; assert `invokeCli` call args carry `targetMode: "active"` AND NO `vault` key. Verify per I-11 vault flow-through invariant.
- [X] T033 [P] [US5] Add to `src/tools/tree/handler.test.ts` — Q-19 active mode with no focused vault: mock `invokeCli` throws `UpstreamError("ERR_NO_ACTIVE_FILE", ...)` (the dispatch-layer classifier already handles this); assert handler propagates unchanged.
- [X] T034 [P] [US5] Add to `src/tools/tree/handler.test.ts` — Q-18 closed-vault detection in active mode: mock `invokeCli` returns the empty-stdout transparent-open signature; assert `detectEvalVaultClosed` spy fires AND throws `CLI_REPORTED_ERROR(VAULT_NOT_FOUND, reason: "not-open")`. Handler propagates.

### Implementation for User Story 5

- [X] T035 [US5] Verify the handler implementation from T013 correctly omits `vault` from the dispatch call args when `input.target_mode === "active"`. Code review / inspection task. No new code.

**Checkpoint**: US5 fully functional. Active-mode resolution flows through the cli-adapter unchanged; no-focused-vault error inherited.

---

## Phase 8: User Story 6 — Count-only mode (Priority: P2)

**Goal**: `total: true` returns `{count, paths: []}` — count reflects the filtered subtree size.

**Independent Test**: Q-14 (CI mock asserts cross-mode count invariant) + T0 manual (live count vs paths-length comparison).

### Tests for User Story 6

- [X] T036 [P] [US6] Add to `src/tools/tree/handler.test.ts` — Q-14 cross-mode count invariant (I-10): for an identical fixture mocked with `total: false` and `total: true`, assert the response `count` matches across both AND the `total: true` response carries `paths === []`.
- [X] T037 [P] [US6] Add to `src/tools/tree/handler.test.ts` — `total: true` + `ext` composition: mock envelope where `total: true` carries the filtered count for `ext: "md"`; assert response.
- [X] T038 [P] [US6] Add to `src/tools/tree/handler.test.ts` — `total: true` + `depth` composition: mock envelope where `total: true` carries the depth-1 count; assert response.
- [X] T039 [P] [US6] Add to `src/tools/tree/handler.test.ts` — payload round-trip with `total: true`: assert decoded payload carries `total: true` verbatim.

### Implementation for User Story 6

- [X] T040 [US6] Verify the JS template's envelope-emit branch from T014 correctly: (a) emits `{ok:true, count, paths: []}` when `payload.total === true`; (b) emits `{ok:true, count, paths: out}` when `payload.total === false` (or omitted). Code review task — the full walk runs unconditionally; only the SHAPE of the returned `paths` field differs.

**Checkpoint**: US6 fully functional. Count-only mode composes with `ext` and `depth` filters; cross-mode count invariant holds.

---

## Phase 9: User Story 7 — Validation rejects malformed inputs before the CLI is invoked (Priority: P1)

**Goal**: Every invalid input shape produces a `VALIDATION_ERROR` and the dispatcher is never called.

**Independent Test**: Q-1..Q-8 (CI mocked-dispatcher cases asserting spy.callCount === 0).

### Tests for User Story 7

The schema-test cases authored in T003 cover the schema-layer rejection. This phase adds the HANDLER-LEVEL assertion that invalid inputs never reach `invokeCli`.

- [X] T041 [P] [US7] Add to `src/tools/tree/handler.test.ts` — Q-1..Q-9 dispatcher-never-called: for each of the nine invalid input shapes from spec US7, invoke the handler with a mocked dispatcher spy; assert the handler throws `ZodError` (the SDK serialises as `VALIDATION_ERROR`) AND `dispatcher.callCount === 0`. Nine sub-cases in a single test file: missing-vault-in-specific, vault-present-in-active, file present × 2 modes, path present × 2 modes, unknown top-level key, target_mode out-of-enum, total non-boolean × 3 variants, folder/ext non-string variants, depth 0/-1/1.5/string/null.

### Implementation for User Story 7

- [X] T042 [US7] Verify the handler's stage-0 validation from T013 throws BEFORE the `invokeCli` call. Code review / inspection task — the `treeInputSchema.parse` call is the first non-trivial statement in `createTreeHandler`. T041 covers the test seam.

**Checkpoint**: US7 fully functional. Every invalid input shape rejects at the validation boundary; zero CLI calls on invalid inputs.

---

## Phase 10: User Story 8 — Documentation surface (Priority: P2)

**Goal**: `docs/tools/tree.md` carries the full per-field input contract, both output-shape branches, depth-bounding semantics, folders-vs-files rule, failure-mode roster, and at least four worked examples.

**Independent Test**: Q-28 (CI inspection: file exists, registry-consistency check from BI-005 passes) + Insp-4 (structural completeness check).

### Implementation for User Story 8

- [X] T043 [US8] Author `docs/tools/tree.md`. Carry: per-field input contract (target_mode, vault, folder, depth, ext, total); both output-shape branches (`total: false` vs `total: true`); FR-028 trailing-slash discrimination rule (one paragraph with examples); FR-006 / FR-012 depth-bounding semantics; FR-007 folder-vs-file inclusion rule; failure-mode roster (validation / unknown-vault / closed-vault / missing-folder / not-a-folder / no-active-file / json-parse / envelope-parse / output-cap); at least four worked examples (whole-vault recursive listing, sub-folder subtree with `ext`, depth-limited overview, count-only mode); multi-vault inherited limitation note; platform-dependent case-sensitivity note; symlinks / permission-denied pass-through note.
- [X] T044 [US8] Verify the file exists at `docs/tools/tree.md` and is not a stub. The BI-005 registry-consistency test at `src/server.test.ts` auto-asserts file existence once the tool is registered (covered by T046 below).

**Checkpoint**: US8 fully functional. Documentation surface complete; agents can discover the tool via the help facility.

---

## Phase 11: User Story 9 — Pathological-size traversals (Priority: P3)

**Goal**: A subtree exceeding the typed-tool output cap surfaces a structured "output too large" error rather than truncating.

**Independent Test**: T0-M5 (live against synthetic 5000-file fixture); CI cannot reasonably synthesise the cap-kill path in a mocked-dispatcher test, but it CAN verify the handler propagates `CLI_NON_ZERO_EXIT` from the adapter.

### Tests for User Story 9

- [X] T045 [P] [US9] Add to `src/tools/tree/handler.test.ts` — Q-22 adapter cap-kill propagation: mock `invokeCli` throws `UpstreamError("CLI_NON_ZERO_EXIT", ...)` (the adapter's BI-003 cap kill); assert handler propagates unchanged. Also assert the same fixture invoked with `total: true` succeeds via a separate mock envelope.

### Implementation for User Story 9

No new code — the output-cap mechanism is inherited from BI-003's cli-adapter and surfaces via `CLI_NON_ZERO_EXIT` automatically. T0-M5 verifies live behaviour during /speckit-implement T0.

**Checkpoint**: US9 fully functional. The pathological-size path is structurally protected by the inherited cap; callers fall back to `total: true` (single integer) or `depth: 1` (single-level listing).

---

## Phase 12: Registration & Release (Polish & Cross-Cutting)

**Purpose**: Wire the new tool into the registry, roll the baseline JSON forward, update CHANGELOG, bump version. This phase makes the tool publicly callable.

- [X] T046 [P] Create `src/tools/tree/index.ts` — export `createTreeTool(deps): RegisteredTool` factory that wraps `createTreeHandler` via `registerTool` from `src/registration/register-tool.ts`. Tool name `tree`. Description: one-line summary including the FR-028 trailing-slash promise (e.g. `"Recursively list every file and folder in a vault or sub-folder. Folder entries end with /; file entries do not. Optional depth cap and extension filter."`). Carry Original-no-upstream header. (5 registration tests in `index.test.ts` follow per T047.)
- [X] T047 [P] Create `src/tools/tree/index.test.ts` — 5 registration cases per data-model.md test inventory: (a) factory accepts deps + returns a `RegisteredTool` whose `name === "tree"`; (b) tool description carries the trailing-slash promise (string-includes assertion); (c) `inputSchema` is the JSON-Schema rendering of `treeInputSchema`; (d) registration baseline JSON roundtrip (the registered tool's fingerprint is included in `_register-baseline.json` after T048 — this test references the baseline file); (e) original-no-upstream attribution header present on all three module files (regex-check on file contents).
- [X] T048 Edit `src/server.ts` — add `import { createTreeTool } from "./tools/tree/index.js"` in alphabetical position (between existing `createTagTool` import and any subsequent — currently `createTagTool` is the alphabetically-last typed-tool import, so `createTreeTool` goes RIGHT AFTER it before any other code); add `createTreeTool(deps)` in the tools-array in matching alphabetical position. The only two edits in this file (one import, one array entry). Existing tools BYTE-STABLE.
- [X] T049 Roll `src/tools/_register-baseline.json` forward via `npm run baseline:write` — this is the FR-018 registry-stability baseline regen script (created in BI-022). The script captures the live registry's `(name, descriptionFingerprint, schemaFingerprint)` for every tool. After running, verify by `git diff` that ONLY the new `tree` entry is added; existing tool fingerprints byte-stable. If any existing fingerprint changed, the change is a regression — DO NOT commit; investigate.
- [X] T050 Verify `src/tools/_register.test.ts` passes — the durable baseline test from BI-022 auto-includes the new `tree` entry via the it.each registry walk. No edit to `_register.test.ts` itself; the test just needs to pick up the new tool. If the registry-stability baseline test fails on a non-`tree` row, investigate before continuing.
- [X] T051 Update `package.json` — bump version `0.5.6 → 0.5.7` (PATCH per the plan; additive surface).
- [X] T052 Update `CHANGELOG.md` — add a new `## [0.5.7]` section per the project's CHANGELOG convention. Headline: "Add `tree` typed tool — recursive subtree enumeration". Brief description covering: new `tree({target_mode, vault?, folder?, depth?, ext?, total?})` surface; trailing-slash discrimination on folder entries; depth bound + ext filter optional; zero new top-level error codes; two new `details.code` strings (`FOLDER_NOT_FOUND`, `NOT_A_FOLDER`) under existing `CLI_REPORTED_ERROR` per ADR-015. Reference the spec by short name `029-list-files-recursive`.

**Checkpoint**: Tool publicly callable. Registry baseline reflects the new entry; existing tools byte-stable; version bumped; CHANGELOG entry authored.

---

## Phase 13: Quality Gates (Pre-Merge)

**Purpose**: Run the merge-gating checks per Constitution section "Development Workflow & Quality Gates". These tasks MUST pass before the branch can merge.

- [X] T053 Run `npm run lint` — must pass with zero warnings (Constitution gate 1).
- [X] T054 Run `npm run typecheck` — must pass (Constitution gate 2).
- [X] T055 Run `npm run build` — must succeed (Constitution gate 3).
- [X] T056 Run `npm test` (vitest run) — must pass with all 43 new BI-029 cases AND every prior tool's existing cases (Constitution gate 4 + Principle II).
- [X] T057 Verify aggregate `statements` coverage threshold passes per `vitest.config.ts` (Constitution gate 5). If the threshold needs ratcheting (downward justified by an additive surface; upward if BI-029 raises it), do that as a one-line visible edit in `vitest.config.ts` and note the rationale in the PR description.
- [ ] T058 Live-CLI T0 characterisation: run quickstart.md scenarios T0-M1..T0-M7 against `…\TestVault-Obsidian-CLI-MCP\Sandbox\bi029-*` fixtures per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md). Seed `bi029-{mixed,small,deep,wide,dot,large}/` fixtures; execute scenarios; record observable behaviour; clean up fixtures post-run. Any divergence from spec drives a post-merge `/speckit-clarify` or a tasks adjustment. **DEFERRED to user's manual run per project memory `feedback_test_scope.md` — unit-test scope only; integration / T0-manual cases live in the user's external tracker.**

**Checkpoint**: Ship-ready. Merge after PR approval.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: empty for this BI — repo and tooling already initialised.
- **Phase 2 (Foundational)**: T001 → T002 ↔ T003 (pair) → T004 → T005. Blocks every user-story phase.
- **Phase 3 (US1 / MVP)**: T006–T012 [P] (tests) → T013 → T014. Implementation tasks T013 / T014 are NOT [P] — they touch the same file (`handler.ts`). All seven test tasks T006–T012 are [P] (different test fixtures in the same test file; vitest runs them as independent `it` blocks).
- **Phases 4–11 (US2–US9)**: depend on Phase 3 completion (T013 / T014 must be in place; the handler body and template are shared across all stories). Each phase's tests are [P] within the phase; implementation tasks within each phase are inspection / verification (no new handler code), so they can run in any order.
- **Phase 12 (Registration)**: depends on Phases 2–9 completion (handler must work end-to-end). T046 / T047 [P]; T048 / T049 / T050 sequential (server.ts edit → baseline regen → baseline test passes); T051 / T052 [P].
- **Phase 13 (Quality gates)**: depends on Phase 12 completion. T053–T058 sequential (lint → typecheck → build → test → coverage → T0 live).

### Within Each User Story

- Tests in the testing sub-phase are [P] (different fixtures; same test file).
- Implementation is a single task per story (most are code-review tasks because the handler is shared; only US1 has new code).
- Story complete when checkpoint passes.

### Parallel Opportunities

- Foundational schema-test + handler-stub can be parallelised IF the schema is locked first: T001 → (T002 ↔ T003 paired) → (T004 || T005).
- All test tasks T006..T012 (US1), T015..T019 (US2), T021..T025 (US3), T027..T030 (US4), T032..T034 (US5), T036..T039 (US6), T041 (US7), T045 (US9) can run in parallel within each story.
- Phase 12: T046 / T047 / T051 / T052 are [P]; T048 / T049 / T050 are sequential.

---

## Parallel Example: User Story 1 tests

```bash
# Launch all seven US1 test tasks together (different fixtures, same test file):
Task: "T006 [US1] Q-9 default-mode happy path test"
Task: "T007 [US1] Empty-vault happy path test"
Task: "T008 [US1] Single-spawn invariant test"
Task: "T009 [US1] Fixed dispatch shape test"
Task: "T010 [US1] Base64 payload round-trip test"
Task: "T011 [US1] Frozen template byte-stability SHA-256 test"
Task: "T012 [US1] Unknown vault dispatch propagation test"
```

Then sequentially: T013 → T014 land the implementation.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2 (Foundational): T001 → T002+T003 → T004 → T005. ~30 minutes.
2. Complete Phase 3 (US1): T006–T012 [P] (tests) → T013 → T014. ~1.5 hours.
3. **STOP and VALIDATE**: Run vitest. Verify US1 tests pass. Verify schema tests pass. T0-M1 (live verification against TestVault) optional but recommended at this gate.

If US1 passes, the MVP is in the can. Subsequent stories add coverage but don't change the implementation.

### Incremental Delivery (Production Track)

1. MVP per above.
2. Add US2..US9 in priority order (P1 first). Each phase adds 1–7 test tasks. Each phase produces one checkpoint that proves the story works.
3. Phase 12 wires the tool into the registry — the public surface is exposed at this checkpoint. Before Phase 12, the tool is callable internally but not registered.
4. Phase 13 runs the merge gates.

### Parallel Team Strategy

Single-developer feature; parallelism is intra-task (parallel test runs via vitest's default parallel mode) rather than per-developer.

---

## Notes

- [P] tasks = different fixtures within the same test file, OR different files entirely. Vitest's default parallel mode runs `it` blocks concurrently within the same suite.
- [Story] label maps task to specific user story for traceability.
- Each user story is INDEPENDENTLY TESTABLE — the test suite per story exercises just that story's contract via mocked dispatcher fixtures. The implementation is shared across stories, but the verification surface is partitioned.
- Test scope is unit-only per project memory. T0 live cases live in the user's external tracker; T058 captures the T0 cleanup expectation but does not scaffold TC-XXX files.
- Commit after each phase checkpoint OR at logical boundaries (per CONTRIBUTING.md scope-honesty principle).
- Stop at any checkpoint to validate the story independently before proceeding.
- AVOID: vague tasks, same-file conflicts (handler.ts edits are sequential within a phase), cross-story dependencies that break the per-story independence claim.
- The T0 fixture protocol (seed-probe-cleanup, all under `Sandbox/`) is governed by [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) — do not skip the cleanup step.
