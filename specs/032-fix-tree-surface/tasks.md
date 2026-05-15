---

description: "Task list for 032-fix-tree-surface — mechanical rename + description rewrite + schema fix for the tree → paths tool"
---

# Tasks: Fix Tree Tool Surface

**Input**: Design documents from `/specs/032-fix-tree-surface/`
**Prerequisites**: plan.md, spec.md, research.md (R1..R20 + F1..F5 + G1..G6), data-model.md, contracts/{schema-shape, description-quality}, quickstart.md (Q-1..Q-14)

**Tests**: New invariant tests are EXPLICITLY OUT OF SCOPE per the user's spec input. This task list updates EXISTING tests in place (assertion adjustments flowing from the rename + schema/description fixes per FR-018) but does NOT add brand-new test cases.

**Organization**: Tasks are organized along the BI's actual edit-dependency chain. The three user stories from spec.md (US1 description, US2 schema, US3 name) are not cleanly separable for IMPLEMENTATION because the rename mechanic (FR-014 / FR-015) couples them — the description and schema both live INSIDE the renamed directory. Each task carries a `[US?]` label indicating the PRIMARY story it serves; some cross-cutting tasks (baseline regen, arch-doc roll-forward, gate verifications) serve multiple stories and carry no story label.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task primarily serves (US1 description-quality, US2 schema-correctness, US3 name-correctness)
- Include exact file paths in descriptions

## Path Conventions

Single-project layout per plan.md. Renamed directories: `src/tools/tree/` → `src/tools/paths/` and `docs/tools/tree.md` → `docs/tools/paths.md`. All other paths under `src/` and `docs/` per the repo root.

---

## Phase 1: Setup

**Purpose**: Pre-change baseline confirmation.

- [ ] T001 Verify pre-change `_register-baseline.test.ts` passes against the current `src/tools/_register-baseline.json` (locks the "everything was fine before this BI" baseline). Run `npx vitest run src/tools/_register-baseline.test.ts` from repo root; expect exit code 0.

---

## Phase 2: Foundational (Lockstep `git mv`)

**Purpose**: Atomic directory + docs-file rename via `git mv` per R4. Everything downstream depends on the post-rename paths existing. This phase produces no behavioural change — `git mv` preserves file contents byte-for-byte; the symbol renames and description rewrite happen in subsequent phases.

**⚠️ CRITICAL**: All later phases reference `src/tools/paths/*` and `docs/tools/paths.md` paths. Do NOT skip these renames.

- [ ] T002 Execute `git mv src/tools/tree src/tools/paths` from repo root. Verifies that all seven inner files (`_template.ts`, `handler.ts`, `handler.test.ts`, `index.ts`, `index.test.ts`, `schema.ts`, `schema.test.ts`) move with the directory and that `git status` shows them as renamed-not-recreated (preserving blame per FR-015).
- [ ] T003 Execute `git mv docs/tools/tree.md docs/tools/paths.md` from repo root. Verifies docs file rename surfaces as a rename in `git status` (preserves blame for SC-010 / `git log --follow` traceability).

**Checkpoint**: Source-tree directory and docs file live at the new paths. Repository builds will FAIL until Phase 3 completes the import-name rewrites in `src/server.ts`. Do not commit yet.

---

## Phase 3: User Story 3 — Tool name does not suggest hierarchical output (Priority: P2)

**Goal**: Register the tool under the new name `paths`. Lockstep rename of all source-tree symbols (constants, factory function, schema/handler symbols, TS types) per R5 / FR-015. After this phase, `createServer` calls `createPathsTool` and no production source file references the literal `tree`.

**Independent Test**: After the phase, `npm run typecheck` succeeds (catches missed symbol renames). After the next-phase baseline regen, `tools/list` shows `"paths"` instead of `"tree"`.

### Implementation for User Story 3

- [ ] T004 [US3] Edit `src/tools/paths/index.ts`: update header comment to narrate `paths` (preserve `// Original — no upstream.` opening clause); rename exported constants `TREE_TOOL_NAME` → `PATHS_TOOL_NAME` AND change its string value from `"tree"` to `"paths"`; rename `TREE_DESCRIPTION` → `PATHS_DESCRIPTION` (the symbol name only — the description string value is rewritten in T010); rename `createTreeTool` → `createPathsTool`; update the `executeTree` import to `executePaths`. Eval-template imports unchanged. Do NOT touch the description content yet.
- [ ] T005 [US3] Edit `src/tools/paths/handler.ts`: update header comment; rename function `executeTree` → `executePaths`; update three log-message string literals from `"tree: eval response is not JSON: ..."` / `"tree: eval response shape unexpected"` / `` `tree: ${envelope.code} for folder "${envelope.folder}"` `` to use `"paths:"` prefix; rename schema-import symbols (`treeEvalEnvelopeSchema` → `pathsEvalEnvelopeSchema`, `treeOutputSchema` → `pathsOutputSchema`, `TreeInput` → `PathsInput`, `TreeOutput` → `PathsOutput`); the eval-template JS body inside the frozen-template literal MUST remain BYTE-STABLE per FR-016 / R14.
- [ ] T006 [US3] Edit `src/tools/paths/schema.ts`: update header comment; rename ALL exported and file-private symbols in lockstep — `treeInputSchema` → `pathsInputSchema`, `treeOutputSchema` → `pathsOutputSchema`, `treeEnvelopeOk` → `pathsEnvelopeOk`, `treeEnvelopeError` → `pathsEnvelopeError`, `treeEvalEnvelopeSchema` → `pathsEvalEnvelopeSchema`, TS types `TreeInput` → `PathsInput`, `TreeOutput` → `PathsOutput`, `TreeEvalEnvelope` → `PathsEvalEnvelope`. The `.omit(…)` chain on `targetModeBaseSchema` is inserted by T009 — leave it alone here.
- [ ] T007 [US3] Edit `src/tools/paths/_template.ts`: update header comment only. JS template body (the frozen-template string passed to `eval`) MUST remain BYTE-STABLE per FR-016 / R14.
- [ ] T008 [US3] Edit `src/server.ts` line 31: change `import { createTreeTool } from "./tools/tree/index.js";` to `import { createPathsTool } from "./tools/paths/index.js";`. The tools-array entry shifts alphabetically — `eslint --fix` applies the import/order rule automatically; same shift applies to the tools-array literal that registers tools in the factory list. Verify the tools-array position post-fix: the `paths` entry sits alphabetically between `outline` and `properties`.

**Checkpoint**: After T004..T008, `npm run typecheck` must succeed. `npm test` will still fail (the test files still reference the old names — those land in Phase 6).

---

## Phase 4: User Story 2 — Schema only exposes runtime-valid fields (Priority: P1)

**Goal**: Insert `.omit({ file: true, path: true })` into `pathsInputSchema` so the published JSON Schema lacks the two leaked fields. The refinement helper `applyTargetModeRefinementForFolderScoped` stays unchanged. The sibling `files` tool remains byte-stable.

**Independent Test**: After this task, `pathsInputSchema.safeParse({ target_mode: "specific", vault: "X", path: "Y/" })` returns a `ZodError` with `code: "unrecognized_keys"` (not the refinement-layer message). Confirms Q-6 / SC-006.

### Implementation for User Story 2

- [ ] T009 [US2] Edit `src/tools/paths/schema.ts` lines 9-16: rewrite the `pathsInputSchema` construction to insert `.omit({ file: true, path: true })` between the base schema and the `.extend(…)` chain. The chain order is `targetModeBaseSchema.omit({ file: true, path: true }).extend({ folder, depth, ext, total })` per R7. Verify the published JSON Schema shape — after this edit, `pathsInputSchema._def.schema.shape` has no `file` or `path` keys.

**Checkpoint**: After T009, the schema layer alone enforces FR-001 (no `file`/`path` in published schema). The refinement helper's `file`/`path` clauses are now dead code for the `paths` tool but remain active for the sibling `files` tool (SC-011 preserved by construction).

---

## Phase 5: User Story 1 — Description is concise and free of internal artefacts (Priority: P1)

**Goal**: Replace the ~2 600-character `TREE_DESCRIPTION` literal with a ≤ 512-character `PATHS_DESCRIPTION` literal structured per `contracts/description-quality.contract.md` (four sections: opening flat-output sentence + trailing-slash note + six-parameter summary + standard help-pointer per R1 / R8).

**Independent Test**: After this task, all four description-quality scenarios in `quickstart.md` (Q-1 length ≤ 512, Q-2 zero regex matches, Q-3 zero internal-substring matches, Q-4 first 80 chars name flat output) pass when run against the post-edit `PATHS_DESCRIPTION` literal.

### Implementation for User Story 1

- [ ] T010 [US1] Replace the value of `PATHS_DESCRIPTION` in `src/tools/paths/index.ts`. The new string MUST satisfy the contract at `specs/032-fix-tree-surface/contracts/description-quality.contract.md`: four sections concatenated by single-space joins — (1) opening sentence naming the output shape `{ count, paths: string[] }` and characterising `paths` as a flat list (FR-008, SC-004; first 80 chars carry both `paths` and a flat-output synonym); (2) trailing-slash note ("Folder entries end with `/`; file entries do not.") per FR-009 WITHOUT citing the historical spec-branch identifier of the trailing-slash decision; (3) six-parameter summary naming `target_mode`, optional `vault`, `folder`, `depth`, `ext`, `total` with one-clause-each descriptions per FR-012; (4) help-pointer `Call help({ tool_name: "paths" }) for full parameter docs, <one-or-two distinctive items>, and the error roster.` per FR-010 / R1. Total length ≤ 512 chars per FR-011 / SC-001. Zero matches against the forbidden-regex set and forbidden-substring set per FR-005..FR-007 / SC-002..SC-003. Use the R8 sample as a starting draft; refine wording but keep the section structure.

**Checkpoint**: After T010, the registered description satisfies SC-001..SC-004. `npm run baseline:write` in Phase 7 will lock the new SHA-256 fingerprint.

---

## Phase 6: In-place test-assertion updates (covers US1 + US2 + US3)

**Purpose**: Update existing co-located test cases inside the renamed directory + the registry-consistency test in `src/server.test.ts` to reflect the new name + new schema shape + new description content. NO new test cases are added per the user's explicit scope statement — assertions inside existing `it(…)` blocks are updated.

- [ ] T011 [P] [US3] Edit `src/tools/paths/index.test.ts`: update header comment; rename symbol imports (`createTreeTool` → `createPathsTool`, `TREE_TOOL_NAME` → `PATHS_TOOL_NAME`, `TREE_DESCRIPTION` → `PATHS_DESCRIPTION`); case (1) update `expect(tool.descriptor.name).toBe("tree")` to `.toBe("paths")` and the constant-compare line accordingly; case (3) update the description-content asserts — keep the `'end with "/"'` check (FR-009 invariant byte-stable) and update the help-pointer literal from `'help({ tool_name: "tree" })'` to `'help({ tool_name: "paths" })'`; case (5) update the baseline lookup from `t.name === "tree"` to `t.name === "paths"`.
- [ ] T012 [US2] Edit `src/tools/paths/index.test.ts` case (2): remove the verbose test-description string that says "covering {target_mode, vault, file, path, folder, depth, ext, total}" — replace with "covering {target_mode, vault, folder, depth, ext, total} AND asserting file/path absence per FR-001"; the existing `for (const key of [...])` loop is unchanged because it already covers only six keys; ADD two new assertion lines (NOT new test cases) inside the same `it(…)` block: `expect(Object.hasOwn(props, "file")).toBe(false)` and `expect(Object.hasOwn(props, "path")).toBe(false)`; remove the obsolete comment that explains "file/path appear in the property set because the folder-scoped refinement forbids them via superRefine, not via schema-shape removal" — it no longer describes reality. (Same file as T011; sequence after T011.)
- [ ] T013 [P] [US2] Edit `src/tools/paths/schema.test.ts` "file forbidden in specific mode" and "path forbidden in specific mode" test cases: update the expected error from refinement-layer `{ message: /file is not allowed/i, path: ["file"] }` to strict-mode `{ code: "unrecognized_keys", keys: ["file"] }` (and same for `path`); also update header comment + any literal-name string references. Other 16 schema tests are byte-stable per FR-016 / SC-008.
- [ ] T014 [P] [US3] Edit `src/tools/paths/handler.test.ts`: update header comment; rename symbol imports (`treeInputSchema` → `pathsInputSchema`, the `tree JS_TEMPLATE` import → `paths JS_TEMPLATE`); the existing argv assertions reference the eval-template body which is byte-stable per FR-016 — no test-body content changes needed beyond symbol renames. Log-string assertions update from `"tree: ..."` to `"paths: ..."` prefixes.
- [ ] T015 [P] [US3] Edit `src/server.test.ts` lines 42 + 51: in the test-name string at line 42, replace the single occurrence of `'tree'` with `'paths'`; in the names-array assertion at line 51, remove the `"tree"` entry (currently between `"tag"` and `"write_note"`) and insert `"paths"` at its new alphabetical position (between `"outline"` and `"properties"`). The BI-NNN parenthetical references in the test-name string are pre-existing historical anchors — preserve them as-is (the spec's FR-005 forbids BI-NNN in the REGISTERED DESCRIPTION but not in internal test-name strings).

**Checkpoint**: After T011..T015, `npm test` should pass with the post-rename test files. The `_register-baseline.test.ts` test STILL FAILS at this point — the baseline JSON has not been regenerated yet (next phase). That failure is expected and is fixed by T016.

---

## Phase 7: Cross-cutting (baseline + docs + architecture + version)

**Purpose**: Lock the new surface in the registry-stability baseline; roll forward the tool docs file (in-file edits, content byte-stable); roll forward the architecture document; bump the package version.

- [ ] T016 Run `npm run baseline:write` from repo root. Verify the regenerated `src/tools/_register-baseline.json` shows: a `{name: "paths", descriptionFingerprint, schemaFingerprint}` entry at the alphabetical position between `outline` and `properties`; the previous `{name: "tree", ...}` entry is gone; the 18 other entries' fingerprints are BYTE-STABLE relative to the pre-change baseline (verifiable via `git diff src/tools/_register-baseline.json` showing only the `tree`-removal and `paths`-insertion lines — no fingerprint churn on unrelated tools, in particular the sibling `files` entry per SC-011).
- [ ] T017 [P] Edit `docs/tools/paths.md` (the renamed docs file): change the top-level heading from `# \`tree\`` to `# \`paths\``; replace the nine occurrences of `"name": "tree"` inside JSON code blocks (worked examples) with `"name": "paths"` (lines 194, 206, 224, 236, 254, 266, 282, 299, and the ninth); preserve ALL other content byte-stable (parameter docs, four worked examples, error roster, inherited-limitations list). The historical "fifteenth typed-tool wrap" mention in the Overview section MAY stay as a historical anchor (matches spec FR-019's intent of preserving bulk content).
- [ ] T018 [P] Edit `.architecture/Obsidian CLI MCP - Architecture.md`: replace every literal `tree` that names the current tool with `paths` (prose mentions like "the tree tool", "tree's eval-driven cohort", "tree-keyed", etc.). Preserve structural / historical references that anchor a point in time ("the tool added by BI-029", "the fifteenth typed-tool wrap"). Per R3 / R12 — roll-forward in this BI's commit, not deferred.
- [ ] T019 [P] Edit `package.json`: change `"version": "0.5.8"` to `"version": "0.6.0"` (MINOR bump per R2 / BI-022 breaking-rename precedent). Other fields byte-stable.

**Checkpoint**: After T016..T019, the BI's source-tree changes are complete and self-consistent. Phase 8 verifies them against the SC roster and the build gates.

---

## Phase 8: Polish & verification gates

**Purpose**: Run the merge-gate command sequence (lint / typecheck / test / build) and execute the quickstart.md verification scenarios.

- [ ] T020 [P] Run `npm run typecheck` from repo root. Expect exit code 0. Catches any missed symbol-rename (a `treeInputSchema` import still lurking somewhere, etc.).
- [ ] T021 [P] Run `npm run lint` from repo root. Expect exit code 0 and zero warnings. If `import/order` flags the `server.ts` import-line position, apply `npm run lint -- --fix` once and re-run.
- [ ] T022 [P] Run `npm test` from repo root. Expect exit code 0 across all vitest suites. The `_register-baseline.test.ts` durable test passes (the regenerated JSON matches the live registry); the post-rename co-located tests in `src/tools/paths/*.test.ts` pass with the assertion updates from Phase 6; the `src/server.test.ts` names-array assertion passes with the post-rename array.
- [ ] T023 [P] Run `npm run build` from repo root. Expect exit code 0.
- [ ] T024 Verify quickstart Q-1 + Q-2 + Q-3 + Q-4 (description quality): `PATHS_DESCRIPTION.length ≤ 512` AND zero matches against the forbidden-regex set `(\b(FR|BI|ADR|SC|TC|US)-\d+\b)|(\b[FQR]-\d+[a-z]?\b)|(\b(first|second|third|...|seventeenth) typed-tool wrap\b)` AND zero literal-substring matches against `_eval-vault-closed-detection`, `targetModeBaseSchema`, `applyTargetModeRefinementForFolderScoped` AND first 80 chars of `PATHS_DESCRIPTION` contain both `paths` and a flat-output synonym. Use `node -e "import('./dist/tools/paths/index.js').then(m => {...})"` after build, or read the source literal directly.
- [ ] T025 Verify quickstart Q-5 + Q-6 (schema shape): `Object.keys(emittedJSONSchema.properties).sort()` equals `["depth","ext","folder","target_mode","total","vault"]` exactly (six keys, no `file`, no `path`) AND `pathsInputSchema.safeParse({ target_mode: "specific", vault: "X", path: "Y/" })` returns `success: false` with `error.issues[0].code === "unrecognized_keys"`.
- [ ] T026 Verify quickstart Q-7 (registry shape): no tool in the live `tools/list` response has `name === "tree"`; exactly one has `name === "paths"`; total count is 19.
- [ ] T027 Verify quickstart Q-9 + Q-11 (baseline coherence + sibling no-regress): `src/tools/_register-baseline.json` contains the `{name: "paths", ...}` entry; does NOT contain `{name: "tree", ...}`; the `{name: "files", ...}` entry's `schemaFingerprint` is byte-identical to the pre-change baseline (verified via `git diff` or by saving the pre-change fingerprint at T001 and comparing).
- [ ] T028 Verify quickstart Q-10 (docs file): `docs/tools/paths.md` exists; `docs/tools/tree.md` does NOT exist; `git log --follow docs/tools/paths.md` shows commit history tracing back to the pre-rename `docs/tools/tree.md` (the `git mv` operation surfaces in the log); top-level heading in `docs/tools/paths.md` is `# \`paths\``; no `"name": "tree"` literal substring remains in the file.
- [ ] T029 Verify quickstart Q-13 + Q-14 (release mechanics): `package.json` `"version": "0.6.0"`; `.architecture/Obsidian CLI MCP - Architecture.md` references `paths` where it previously referenced `tree` for the tool name.

**Checkpoint**: After T020..T029, all 11 success criteria (SC-001..SC-011) are verifiable as passing. The BI is implementation-complete.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)** → **Phase 2 (Foundational rename)** → all subsequent phases.
- Phase 2's `git mv` operations (T002, T003) MUST complete before any Phase 3+ task — all post-rename tasks reference the new paths.
- Phases 3 (US3 name rename), 4 (US2 schema fix), 5 (US1 description rewrite) edit DIFFERENT files inside `src/tools/paths/` and are partially parallelizable across files — but within the SAME file (e.g. T004 + T010 both touch `index.ts`) the edits must be sequenced.
- Phase 6 (test updates) depends on Phases 3, 4, 5 — the test assertions reference the post-edit symbol names + schema shape + description content.
- Phase 7 (cross-cutting) depends on Phases 3-6 — `npm run baseline:write` reads the live registry which requires the source code to be in its final post-edit state.
- Phase 8 (gates) depends on Phase 7 — the merge-gate commands run on the fully-edited tree.

### User Story Dependencies

- **US3 name** (Phase 3): not blocked by other stories; the rename mechanic itself MATERIALISES the name change.
- **US2 schema** (Phase 4 / T009): not blocked by other stories; can run after Phase 2 in isolation if you want a minimal US2-only commit — but the BI ships as one atomic commit per FR-014 / BI-022 precedent.
- **US1 description** (Phase 5 / T010): not blocked by other stories; same comment as US2.
- All three USs ship in the same commit; no per-US sub-commit is contemplated.

### Within Each Phase

- Phase 3 (T004..T008): T004 (`index.ts`) and T005 (`handler.ts`) can be done in parallel; T006 (`schema.ts`) can be parallel with both; T007 (`_template.ts`) is parallel with all three; T008 (`server.ts` outside the renamed dir) is parallel with all four. No cross-file dependencies within Phase 3.
- Phase 6 (T011..T015): T011 must precede T012 (same file). T013, T014, T015 are parallel with each other AND with T011 (different files).
- Phase 7 (T016..T019): T017, T018, T019 are parallel (different files). T016 depends on Phases 3-6 being complete.
- Phase 8 (T020..T023): parallel across the four merge-gate commands. T024..T029 are sequential by convention (read the same artefacts in order).

### Parallel Opportunities

```bash
# Phase 3 parallel batch (4 files):
Task T004: edit src/tools/paths/index.ts
Task T005: edit src/tools/paths/handler.ts
Task T006: edit src/tools/paths/schema.ts
Task T007: edit src/tools/paths/_template.ts
Task T008: edit src/server.ts

# Phase 6 parallel batch (4 files):
Task T011: edit src/tools/paths/index.test.ts (assertion + symbol-rename pass)
Task T013: edit src/tools/paths/schema.test.ts
Task T014: edit src/tools/paths/handler.test.ts
Task T015: edit src/server.test.ts

# Phase 7 parallel batch (3 files):
Task T017: edit docs/tools/paths.md
Task T018: edit .architecture/Obsidian CLI MCP - Architecture.md
Task T019: bump package.json

# Phase 8 parallel batch (4 gates):
Task T020: npm run typecheck
Task T021: npm run lint
Task T022: npm test
Task T023: npm run build
```

---

## Implementation Strategy

### Single-commit shipping (per FR-014 + BI-022 precedent)

This BI is a breaking-rename. Per FR-014 and the precedent set by BI-022's five-tool rename sweep, the entire change set ships as ONE git commit. There is NO per-user-story sub-commit. The MVP framing of "User Story 1 alone is a deliverable" does NOT apply here — all three USs are coupled via the rename mechanic.

**Recommended commit sequence**:

1. Work through Phases 1-8 sequentially (or with the parallel batches noted above).
2. Stage everything: `git add src/tools/paths/ src/server.ts src/server.test.ts src/tools/_register-baseline.json docs/tools/paths.md .architecture/Obsidian\ CLI\ MCP\ -\ Architecture.md package.json` — the `git mv` operations are already staged from T002 / T003.
3. Verify staged set: `git status` shows exactly the inventory from data-model.md (14 files touched).
4. Commit as `feat(032-fix-tree-surface): rename tree → paths, trim description, fix schema leak` with body referencing FR-001..FR-021, SC-001..SC-011, and the three clarify-locked decisions (name=paths, schema=`.omit()`, cap=512).

### Out-of-scope items (DEFERRED)

- New invariant tests covering FR-001..FR-013 — deferred to the next BI per user scope.
- README.md / CHANGELOG.md updates announcing the rename — deferred per FR-021.
- Sibling `files` tool's same schema defect — out of scope per spec.
- ADR-005 amendment formalising the description-quality contract — out of scope; this BI is a worked example, not an amendment.

### Risk reduction notes

- **Eval-template byte-stability is load-bearing**. T005 and T007 explicitly preserve the JS-template body. If a stray edit slips into the template, `npm test` will fail because the argv-payload base64 round-trip assertions in `handler.test.ts` decode the template body and compare against fixtures.
- **Refinement helper untouched**. T009 inserts `.omit()` in `schema.ts` only. The `applyTargetModeRefinementForFolderScoped` helper at `src/target-mode/target-mode.ts` is NOT edited. SC-011's sibling-`files` no-regress is preserved by construction.
- **Baseline roll-forward is the FINAL source-tree edit**. T016 reads the live registry, so any other source-tree edit AFTER T016 invalidates the baseline. Run T016 only when Phases 3-6 are complete.

---

## Notes

- [P] marks tasks that touch different files and have no incomplete dependencies; they can run in any order or concurrently.
- [US?] labels are PRIMARY-story attributions; cross-cutting tasks (T001, T002, T003, T016..T029) carry no label because they serve all three stories or are gate-machinery.
- Each task description carries the exact file path(s) and the specific edit shape — an implementer can execute each task with no additional context beyond the spec/plan/research/data-model/contracts/quickstart artefacts in this feature directory.
- The PRE-change `_register-baseline.json` SHA-256 fingerprints for the 18 unchanged tools should be recorded at T001 time for comparison at T027 (or relied on via `git diff` if the work is committed in one shot).
- Total task count: 29 (T001..T029). Estimated implementer time: 1.5-3 hours for a careful sequential pass; 45 minutes with parallel-batch execution.
