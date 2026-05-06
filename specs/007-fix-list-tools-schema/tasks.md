---

description: "Task list for feature 007-fix-list-tools-schema implementation"
---

# Tasks: Fix `tools/list` Schema Validation

**Input**: Design documents from `/specs/007-fix-list-tools-schema/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/envelope-helper.contract.md](contracts/envelope-helper.contract.md), [quickstart.md](quickstart.md)

**Tests**: Tests are mandatory in this codebase per Constitution Principle II (Public Surface Test Coverage — NON-NEGOTIABLE) — every modified surface ships its co-located tests in the same change. Test tasks are explicit, not optional.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps task to spec.md user story (US1, US2, US3)
- All paths absolute or repo-relative; concrete files in every task

## Path Conventions

Single-project TypeScript repo per [plan.md](plan.md) Project Structure: `src/` at repo root with co-located `*.test.ts` files. No separate `tests/` tree (Constitution Principle II).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm a clean baseline before any code change. No project-init tasks — this is a mature repo on branch `007-fix-list-tools-schema`.

- [ ] T001 Verify pre-flight baseline: run `npm run typecheck`, `npm run lint`, and `npm test` against `main` (or the current branch tip) and confirm all three pass with zero warnings and zero failing tests. Record the baseline statements-coverage percentage from the V8 reporter — Phase 6 must not lower it (Constitution Gate #5).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement the generic envelope helper that every user story consumes. Without it, no user story can be delivered.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T002 Implement `toMcpInputSchema(zodSchema)` helper in [src/tools/_shared.ts](../../src/tools/_shared.ts) per [contracts/envelope-helper.contract.md](contracts/envelope-helper.contract.md). Add the export `JsonSchemaObject` interface. Wrap top-level `anyOf` outputs into `{ type: "object", additionalProperties: true, oneOf: [...] }` with inner `type: "object"` stripped from each branch. Rewrite top-level `anyOf` → `oneOf` (research P2). Preserve `$schema` if present. Do not mutate the raw `zodToJsonSchema` output. Pass `{ $refStrategy: "none" }` to match the existing convention. The file already carries `// Original — no upstream.` header; do not duplicate. Import `ZodTypeAny` from `zod` and `zodToJsonSchema` from `zod-to-json-schema` (both already in `package.json`).

- [ ] T003 Create [src/tools/_shared.test.ts](../../src/tools/_shared.test.ts) (NEW file) with header `// Original — no upstream. Co-located tests for the tool aggregator's shared utilities.` and these test bodies (per the data-model test-coverage map):
  1. `toMcpInputSchema` returns a `z.object({...}).passthrough()` schema verbatim (no-op path).
  2. `toMcpInputSchema` wraps a `z.discriminatedUnion(...)` into the envelope shape — top-level `type: "object"`, `additionalProperties: true`, two-element `oneOf` whose branches preserve `properties` and `required`.
  3. `toMcpInputSchema` rewrites top-level `anyOf` → `oneOf`.
  4. `toMcpInputSchema` strips inner `"type": "object"` from each `oneOf` branch.
  5. `toMcpInputSchema` preserves the `$schema` keyword from the raw output.
  6. `toMcpInputSchema` does not mutate its `zodToJsonSchema` raw output (referential equality / post-call deep-equal of the raw object).
  7. `asToolError` returns the `{ isError: true, content: [{ type: "text", text: <JSON-stringified payload> }] }` envelope (retroactive Principle II coverage per research P8).

  **Dependency**: T002 must define `toMcpInputSchema`'s signature before this test file compiles.

**Checkpoint**: Foundation ready — the envelope helper is callable and tested. User stories can now proceed.

---

## Phase 3: User Story 1 — Server is loadable by any compliant MCP client (Priority: P1) 🎯 MVP

**Goal**: After this phase, the in-process `tools/list` response from `createServer(...)` returns descriptors whose `inputSchema.type === "object"` for every registered tool, satisfying FR-001 / FR-002.

**Independent Test**: Per [quickstart.md](quickstart.md) Scenario 6 — boot the built server (`node dist/index.js`) and point any compliant MCP client at it; the client's `tools/list` call validates with zero errors and lists all three tools. Acceptance verification is automated by US3's invariant (c) test in Phase 5.

### Implementation for User Story 1

- [ ] T004 [US1] Add `targetModeJsonSchema` companion export to [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) — at the bottom of the file, after the `targetModeSchema` export, add:
  ```ts
  import { toMcpInputSchema } from "../tools/_shared.js";
  export const targetModeJsonSchema = toMcpInputSchema(targetModeSchema);
  ```
  Do NOT modify any existing export, type, or refinement function in this file (FR-004). The file's existing `// Original — no upstream.` header continues to apply.

  **Dependency**: T002.

- [ ] T005 [P] [US1] Extend [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) with new assertions covering `targetModeJsonSchema`:
  1. `targetModeJsonSchema.type === "object"` (FR-002 anchor).
  2. `targetModeJsonSchema.oneOf` is an array of length 2.
  3. Branch 0 (`oneOf[0]`) has `properties.target_mode.const === "specific"` and includes `vault` in `required`.
  4. Branch 1 (`oneOf[1]`) has `properties.target_mode.const === "active"` and `required === ["target_mode"]`.
  5. `targetModeJsonSchema.additionalProperties === true` (mirrors runtime passthrough — research P3).
  6. **Drift detector** (Principle III anti-drift): assert that the union of `Object.keys(oneOf[0].properties) ∪ Object.keys(oneOf[1].properties)` equals `["target_mode", "vault", "file", "path"]` (sorted) — i.e., the published descriptor's property set is exactly the runtime's property set.

  Existing assertions in this file (covering `targetModeSchema.parse(...)` runtime behaviour) MUST remain unchanged and continue to pass.

  **Dependency**: T004.

- [ ] T006 [P] [US1] Re-point [src/tools/read_note/schema.ts](../../src/tools/read_note/schema.ts) to consume the primitive's companion export. Replace the file body with:
  ```ts
  // Original — no upstream. read_note input schema: re-export of the target-mode primitive (BI-029) — read_note adds zero tool-specific fields, so the primitive IS the schema. JSON Schema is the primitive's companion export, which goes through the envelope helper to satisfy MCP `Tool.inputSchema` (feature 007 / FR-002).
  import { targetModeSchema, targetModeJsonSchema, type TargetMode } from "../../target-mode/target-mode.js";

  export const readNoteInputSchema = targetModeSchema;
  export type ReadNoteInput = TargetMode;
  export const readNoteInputJsonSchema = targetModeJsonSchema;
  ```
  Remove the `import { zodToJsonSchema } from "zod-to-json-schema";` line — it is no longer used in this file. The downstream import at [src/tools/read_note/tool.ts:8](../../src/tools/read_note/tool.ts#L8) (`import { readNoteInputSchema, readNoteInputJsonSchema } from "./schema.js"`) continues to work without edit because both names are preserved.

  **Dependency**: T004. (Independent of T005 — different file, no shared mutable state, hence [P].)

**Checkpoint**: User Story 1 is functionally delivered. The in-process `tools/list` response now returns valid descriptors. Acceptance can be verified ad-hoc; formal regression test arrives in Phase 5.

---

## Phase 4: User Story 2 — `read_note` runtime contract preserved (Priority: P1)

**Goal**: Confirm that the runtime semantics of `read_note` — specific vs. active branches, XOR enforcement, forbidden-keys-in-active rejection — are unchanged after Phase 3.

**Independent Test**: Per [quickstart.md](quickstart.md) Scenario 4 — running the existing `read_note` test suite produces zero failures.

### Verification for User Story 2

- [ ] T007 [US2] Run `npx vitest run src/tools/read_note/` and confirm every existing test passes without modification — `schema.test.ts` (parser), `handler.test.ts` (CLI routing + queue + logger), `tool.test.ts` (registration + envelope). NO source-code edits in this task; this is the FR-003 / FR-004 / FR-005 verification gate. If ANY test fails, halt and investigate — Phase 3 has introduced an unintended runtime regression that must be corrected before proceeding.

  **Dependency**: T006 must be complete (read_note's `schema.ts` re-pointed) so the test suite runs against the post-fix code.

**Checkpoint**: User Story 2 verified — no runtime regressions introduced by the publication-side fix.

---

## Phase 5: User Story 3 — Future typed tools cannot reintroduce this regression (Priority: P2)

**Goal**: Add a dynamic registry-iterating guardrail test so any future tool whose published `inputSchema` lacks top-level `type: "object"` is caught at CI time, not at user-install time.

**Independent Test**: Per [quickstart.md](quickstart.md) Scenario 8 — temporarily sabotage the helper to drop `type: "object"`, run the registry test, observe failure. Revert before merge.

### Implementation for User Story 3

- [ ] T008 [US3] Add **Invariant (c)** to the existing `describe("registry consistency", ...)` block in [src/server.test.ts](../../src/server.test.ts#L166) (immediately after the existing Invariant (b) `it(...)` at line 179). Test name (per data-model): `every registered tool's inputSchema declares type === "object" at the top level (Story 1 AC#2, FR-002, FR-006, SC-001)`. Body: iterate over the live `tools/list` result; for each tool assert `(tool.inputSchema as Record<string, unknown>)?.type === "object"` with failure message `\`Tool '${tool.name}' has inputSchema.type === ${JSON.stringify(actual)}, expected "object"\`` to mirror the user's original error-path locator (`tools[N].inputSchema.type`). Use the same `createServer({ ctx }) → handlers.get("tools/list")` boilerplate as the existing two invariants. The block automatically picks up every future tool (FR-006).

  **Dependency**: T006 must be complete so the test passes for `read_note` (otherwise Invariant (c) would fail on `main` before the fix lands, which is fine for TDD ordering but requires careful sequencing in the implementation log).

- [ ] T009 [US3] Perform the **deliberate-malformation drill** (one-time; per [quickstart.md](quickstart.md) Scenario 8). Locally and temporarily, modify `toMcpInputSchema` in [src/tools/_shared.ts](../../src/tools/_shared.ts) so it strips `type: "object"` from its return value. Run `npx vitest run src/server.test.ts -t "registry consistency"` and **confirm Invariant (c) FAILS** with a message naming `read_note` (and possibly `help`/`obsidian_exec` if all tools route through the helper after the fix). Revert the temporary modification BEFORE COMMIT — this drill must NOT appear in the final diff. Record the observation (drill performed, test failed as expected, modification reverted) in the PR description as evidence for SC-004.

  **Dependency**: T008 must be in place so there is a test to fail.

**Checkpoint**: User Story 3 delivered — the regression cannot recur for any current or future tool registration without breaking CI.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Release preparation and final verification. No story-specific work.

- [ ] T010 Bump `version` field in [package.json](../../package.json) from `0.1.6` to `0.1.7` (FR-007 — patch increment matching the prior cadence). No other field in `package.json` changes. This is a single-line edit.

- [ ] T011 Run the full test suite with coverage: `npm test`. Confirm (a) zero failing tests, (b) the aggregate **statements** coverage threshold in [vitest.config.ts](../../vitest.config.ts) passes, (c) the threshold value itself is unchanged from the T001 baseline (Constitution Gate #5 — ratchet upward only). If coverage dropped below the threshold despite all new tests landing, investigate before proceeding — do NOT lower the threshold.

  **Dependency**: All implementation tasks (T002–T010) complete.

- [ ] T012 Run the constitution gates: `npm run typecheck && npm run lint && npm run build`. Confirm zero warnings, zero type errors, and a successful build artefact in `dist/`. (Gates #1, #2, #3.)

  **Dependency**: T011 (run after the test pass to fail-fast on test issues first).

- [ ] T013 Manual end-to-end verification per [quickstart.md](quickstart.md) Scenarios 6 and 7: boot `node dist/index.js`, connect from a compliant MCP client (MCP Inspector + one other), confirm `tools/list` validates and returns all three tools, then call `read_note` with each branch (`{target_mode:"specific", vault, file}`, `{target_mode:"specific", vault, path}`, `{target_mode:"active"}`) plus the two error cases (XOR violation, forbidden vault in active). Record outcomes in the PR description.

  **Dependency**: T012 (built artefact required).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately on a clean working tree.
- **Phase 2 (Foundational)**: Depends on Phase 1. **BLOCKS** all user stories.
- **Phase 3 (US1)**: Depends on Phase 2. Delivers the MVP fix.
- **Phase 4 (US2)**: Depends on Phase 3 (specifically T006). Pure verification — no code edits.
- **Phase 5 (US3)**: Depends on Phase 3 (specifically T006). Adds the regression guardrail.
- **Phase 6 (Polish)**: Depends on all of Phases 2–5.

### User Story Dependencies

- **US1 (P1)** — implementation (T004–T006) — depends on T002 only. The MVP.
- **US2 (P1)** — verification (T007) — depends on T006. Pure regression check; no implementation.
- **US3 (P2)** — guardrail (T008–T009) — depends on T006 (for Invariant (c) to pass after the fix lands).

US2 and US3 are both independent of each other and could be worked in parallel by separate developers after T006 lands.

### Within Each User Story

- US1: T004 first (companion export), then T005 + T006 in parallel.
- US2: single task T007.
- US3: T008 first (add invariant), then T009 (one-time drill).

### Parallel Opportunities

- **Within Phase 3**: T005 and T006 are [P] — different files, both depend only on T004.
- **Across phases (after T006)**: T007 (US2 verification) and T008 (US3 invariant) are different files, both depend only on T006 — could be worked in parallel.
- T010 (version bump) does not strictly depend on T002–T009 in terms of file conflicts, but should occur in Phase 6 to avoid premature version commits if implementation regresses.

---

## Parallel Example: User Story 1

```text
# After T004 (target-mode companion export) is complete:
Task: T005 — Extend src/target-mode/target-mode.test.ts with targetModeJsonSchema assertions
Task: T006 — Re-point src/tools/read_note/schema.ts to re-export targetModeJsonSchema
```

Both tasks edit different files (`target-mode.test.ts` vs `read_note/schema.ts`), depend only on T004, and have no shared mutable state.

## Parallel Example: After T006 (US2 + US3 launch in parallel)

```text
Task: T007 — Verify src/tools/read_note/ existing tests still pass (verification, no code)
Task: T008 — Add Invariant (c) to src/server.test.ts registry-consistency block
```

T007 reads only the read_note source files (already finalized at T006); T008 edits `src/server.test.ts` (untouched by T007). No conflict.

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete T001 (baseline check).
2. Complete T002 + T003 (foundational helper + tests).
3. Complete T004, T005, T006 (US1 implementation).
4. **STOP and VALIDATE**: Manually verify the in-process `tools/list` returns valid descriptors. The server is now loadable — the user's reported regression is closed.
5. Optionally cut a 0.1.7 release here if US3's guardrail is being deferred.

### Incremental Delivery

1. Phase 1 + Phase 2 → foundation ready.
2. Phase 3 (US1) → MVP delivered. Bug closed.
3. Phase 4 (US2) → runtime regression check passes.
4. Phase 5 (US3) → CI guardrail in place; future tools cannot reintroduce.
5. Phase 6 (Polish) → version bump, full gates, manual e2e, ready for merge + release.

### Parallel Team Strategy

For a single-developer fix (typical for this size of change), execute phases sequentially. With two developers:

- Developer A: T002 + T003 (helper + helper tests) — Foundational.
- Developer B: drafts T005 + T008 test bodies in advance using the contract document.
- After T002 lands: Developer A picks up T004 + T006; Developer B finishes T005 + T008.
- Developer A then runs T007 + T009; Developer B handles Phase 6.

For a fix this small, the value of parallelism is minimal — sequential execution is recommended.

---

## Notes

- This is a bug fix on a maintained branch. Every task targets a specific named file with a specific named export — no exploratory work is in scope.
- Constitution Compliance for the PR description: all five principles are Y (per [plan.md](plan.md) Constitution Check). No deviations to track.
- Coverage threshold MUST NOT be lowered as part of this change (Constitution Gate #5).
- T009 (deliberate-malformation drill) MUST NOT appear in the merged diff — it is an evidence-gathering step performed once during implementation.
- Commit cadence: one commit per phase (5 commits total — Setup, Foundational, US1, US2+US3, Polish), or one commit per task. Either is acceptable; the project's prior cadence (single coherent commits per BI) suggests one commit per phase.
- After T013, the change is ready for `/ultrareview` and merge to `main`. Publishing to npm (the actual `npm publish` step) is post-merge release-pipeline work and is NOT a task in this list.
