---
description: "Task list for 010-flatten-target-mode — Flatten `targetModeSchema` and Retire the Wrap-Branch Envelope Helper"
---

# Tasks: Flatten `targetModeSchema` and Retire the Wrap-Branch Envelope Helper

**Input**: Design documents from [`/specs/010-flatten-target-mode/`](.)
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Co-located `*.test.ts` files per Constitution Principle II (NON-NEGOTIABLE — public surface coverage in same change-set). Tests are NOT requested as a separate red-green TDD loop; instead, every implementation task lands with its co-located test cases in the same task. The verify-fails-first sanity check is captured exactly once, manually, by T011 (the SC-012 deliberate-revert check on the implementer's machine).

**Organization**: Tasks are grouped by user story. The flatten of [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) is the foundational prerequisite for ALL three user stories — until T001 lands, the wire descriptor is still feature 009's wrapped envelope and no story-phase test would observe the post-010 shape. T001 also changes the `TargetMode` TypeScript type, which forces the [src/tools/read_note/handler.ts](../../src/tools/read_note/handler.ts) non-null assertion (clarification C1) and the migration of six test cases in [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) (FR-003 / R6) to land in the same atomic change. The drift-detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) is shared across US1 and US2; the wrap-branch deletion in [src/tools/_shared.ts](../../src/tools/_shared.ts) is US3's standalone deliverable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in this list)
- **[Story]**: Which user story this task belongs to (US1 / US2 / US3) — Setup / Foundational / Polish phases have no story label
- File paths are repo-relative

## Path Conventions

Single-project TypeScript layout per Constitution Principle I and the existing repo convention. All paths are relative to the repo root [`c:\Github\obsidian-cli-mcp\`](../../). Source code lives under [src/](../../src/); co-located tests live alongside their source modules per Principle II.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

No setup tasks — the repository's TypeScript / vitest / zod / `zod-to-json-schema` / MCP SDK tooling is already configured (predecessor features 001–009). This feature introduces no new dependencies (research R1 — keep current `zod-to-json-schema` pin). Skip directly to Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: All three user stories depend on the flatten of [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts). Until T001 lands, the published descriptor for `read_note` is still feature 009's wrapped envelope (`oneOf` + cross-branch property union + `additionalProperties: true`); the drift-detector assertions for the post-010 flat shape would all fail; and the build would fail at [src/tools/read_note/handler.ts](../../src/tools/read_note/handler.ts) because the `TargetMode` TypeScript type changes when the encoding flattens (FR-004).

- [ ] T001 Rewrite [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) to the flat encoding per [contracts/flat-target-mode.contract.md](contracts/flat-target-mode.contract.md) and [data-model.md](data-model.md) §2. Replace the `targetModeBaseUnion` discriminated union + `superRefine` dispatcher with `targetModeBaseSchema = z.object({...}).strict()` + `applyTargetModeRefinement<T extends z.ZodObject<...>>(s: T): z.ZodEffects<T>` + `targetModeSchema = applyTargetModeRefinement(targetModeBaseSchema)`. Inline the existing `refineSpecificBranch` / `refineActiveBranch` private functions into the helper's `superRefine` body (preserving per-issue `path` / `code` / `message` content verbatim per FR-002 / FR-003). DELETE the six per-mode exports per FR-017 / C2: `targetModeSpecificBaseSchema`, `targetModeActiveBaseSchema`, `targetModeSpecificSchema`, `targetModeActiveSchema`, `applyTargetModeSpecificRefinement`, `applyTargetModeActiveRefinement`. DELETE the deprecated `TargetModeSpecific` / `TargetModeActive` types. The `// Original — no upstream.` header at line 1 stays as-is. Migrate the six test cases in [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) per [data-model.md §6](data-model.md#§6--test-case-migration-map-fr-003--fr-017--r6) from `targetMode{Specific,Active}Schema.safeParse({...})` to `targetModeSchema.safeParse({ target_mode: "<mode>", ...rest })`; the other 25 cases are unchanged. Add 2 new co-located cases per [data-model.md §6 N1+N2](data-model.md#§6--test-case-migration-map-fr-003--fr-017--r6): N1 — strict-mode boundary asserting `code: "unrecognized_keys"` / `keys: ["random"]` / `path: []` (FR-002 carve-out / R4); N2 — extension happy-path verifying `applyTargetModeRefinement(targetModeBaseSchema.extend({ note_text: z.string() }))` accepts `{ target_mode: "specific", vault, file, note_text }` AND rejects an unknown key (R2 — `.extend()` preserves `.strict()`). Update [src/tools/read_note/handler.ts](../../src/tools/read_note/handler.ts) at lines 21-27 with `input.vault!` non-null assertion paired with a single-line comment naming the `superRefine` runtime invariant (clarification C1). Update [src/tools/read_note/schema.ts](../../src/tools/read_note/schema.ts) if needed (already a thin re-export of `targetModeSchema`; should not require edits — but verify the `TargetMode` import still resolves to the flattened type). Constitution: Principle I (no new module; `target-mode/` does not gain a dependency on `tools/`), Principle II (tests in same change), Principle III (the trivial `zodToJsonSchema` derivation is the cleanest possible single-source-of-truth compliance), Principle V (header preserved). FR-001 / FR-002 / FR-003 / FR-004 / FR-017.

**Checkpoint**: Foundation ready — `targetModeSchema` is now `ZodEffects<ZodObject>` over a `.strict()` `ZodObject`; `zodToJsonSchema(targetModeSchema, ...)` emits the flat-object descriptor at FR-006 directly; the wrap branch in [src/tools/_shared.ts](../../src/tools/_shared.ts) is unreachable but still present (deleted in Phase 5 / US3); the build is green; the 33-case `target-mode.test.ts` suite passes; the read_note handler compiles and runs. Proceed to Phase 3.

---

## Phase 3: User Story 1 — Future typed tools follow the same flat-`z.object` pattern as `obsidian_exec` (Priority: P1)

**Goal**: Verify that future Pattern (a) consumers (planned `write_note` / `append_note`) — which extend `targetModeBaseSchema` via `.extend({...})` and re-apply `applyTargetModeRefinement` — publish a well-formed flat `inputSchema` automatically. No per-tool plumbing, no companion JSON Schema export, no opt-in flag. The synthetic fixture is the forcing function that prevents the publication pipeline from regressing for future Pattern (a) consumers.

**Independent Test**: Per spec US1 — register a synthetic typed tool whose schema is `applyTargetModeRefinement(targetModeBaseSchema.extend({ note_text: z.string() }))`. Assert via the drift-detector test surface that its published `inputSchema` has `type: "object"`, contains `target_mode`, `vault`, `file`, `path`, and `note_text` in `properties` as the EXACT key set, has `required: ["target_mode", "note_text"]`, and `additionalProperties: false`. Assert via runtime parse that the per-mode rules fire on the extended schema AND that an unknown top-level key produces `VALIDATION_ERROR` with `code: "unrecognized_keys"` (verifying `.extend()` preserved `.strict()` per R2).

### Implementation for User Story 1

- [ ] T002 [US1] Add the post-010 synthetic Pattern (a) fixture to [src/tools/_register.test.ts](../../src/tools/_register.test.ts) per [contracts/drift-detector.contract.md §5](contracts/drift-detector.contract.md#§5--synthetic-pattern-a-fixture). Build the schema inline via `applyTargetModeRefinement(targetModeBaseSchema.extend({ note_text: z.string() }))`; register it via `registerTool({...})` directly (not via `createServer` — the fixture asserts on the `RegisteredTool` return value, not the live registry). Add a `synthetic_pattern_a` row to the `invariants` case-table per [data-model.md §5](data-model.md#§5--per-tool-drift-detector-invariants-post-010): `type: "object"`, `properties_equals_set: ["target_mode", "vault", "file", "path", "note_text"]`, `required_equals: ["target_mode", "note_text"]`, `additionalProperties: false`. The fixture-specific `it` block at the end of the consolidated drift-detector `describe` reads from this row via `assertInvariant("synthetic_pattern_a", tool.descriptor.inputSchema)`. Add an explicit boundary assertion that an unknown top-level key passed to the synthetic schema produces `VALIDATION_ERROR` with `code: "unrecognized_keys"` (R2 / FR-002 carve-out). The pre-010 Pattern (a) fixture at [_register.test.ts:415-434](../../src/tools/_register.test.ts#L415-L434) (the `targetModeSchema.and(z.object({...}))` `ZodIntersection` form) STAYS in place at this stage; T006 deletes it as part of the consolidation. FR-008 / SC-005 / SC-009. Depends on T001.

**Checkpoint**: US1 deliverable shipped. Future Pattern (a) consumers (`write_note`, `append_note`) are guaranteed to produce a well-formed flat `inputSchema` — the drift detector observes their wire shape automatically.

---

## Phase 4: User Story 2 — `read_note` continues to work end-to-end through every MCP client class (Priority: P1)

**Goal**: Verify that `read_note`'s wire descriptor flips from `0.2.1`'s wrapped envelope (`oneOf` + `additionalProperties: true`) to `0.2.2`'s flat object (`additionalProperties: false`) without any user-visible behaviour change for documented inputs. Both strict-rich (Claude Desktop, MCP Inspector) and strict-naive (Cowork) clients accept the new shape — `additionalProperties: false` is strictly more conservative than `true`; any client that accepted the latter accepts the former. The strict-mode behaviour change for unknown keys (FR-002 carve-out) is the only deliberate, narrow user-visible delta.

**Independent Test**: Per spec US2 — drive Cowork (strict-naive) and Claude Desktop / MCP Inspector (strict-rich) through `tools/list` → `read_note({ target_mode: "specific", vault, path })` → `read_note({ target_mode: "active" })` against a real Obsidian vault. Both modes return `{ content: <note-body> }`; argument-stripping in Cowork is NOT disabled; the visible `inputSchema` in MCP Inspector is the post-010 flat shape (no `oneOf`, no `allOf`, no `anyOf`). Recorded in `0.2.2` release notes.

### Implementation for User Story 2

- [ ] T003 [US2] Update the `read_note` row in the `invariants` case-table at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) per [data-model.md §5](data-model.md#§5--per-tool-drift-detector-invariants-post-010) and [contracts/drift-detector.contract.md §2](contracts/drift-detector.contract.md#§2--per-tool-invariant-table) — flip `additionalProperties: true` → `false` (FR-006 / C3); flip `properties_includes` → `properties_equals_set: ["target_mode", "vault", "file", "path"]` (tighter exact-match invariant per R5); keep `required_equals: ["target_mode"]`. Pin `obsidian_exec` and `help` byte-stable from `0.2.0` / `0.2.1` per FR-007 / FR-016 / [contracts/drift-detector.contract.md §7](contracts/drift-detector.contract.md#§7--stability-invariants). The two existing layers (Group 1 unit-layer registry walk + Group 2 SDK round-trip via `InMemoryTransport`) continue to fire `it.each` over the updated table; both layers' assertions observe the post-010 wire shape after T001 lands. FR-006 / FR-007 / SC-005 / SC-006. Depends on T001.

- [ ] T004 [US2] (manual, DEFERRED — runs after the `0.2.2` tarball is published; ordering: T010 quality gates → PR merge → publish `0.2.2` tarball → T004 against the published tarball) Execute [quickstart.md S-11 + S-12](quickstart.md#s-11--cowork-strict-naive-client-end-to-end-manual-sc-001--sc-002). Build the package (`npm run build && npm pack`), install the resulting `marwansaab-obsidian-cli-mcp-0.2.2.tgz` as the local MCP server target in (a) Cowork's client config and (b) Claude Desktop's `claude_desktop_config.json` (or MCP Inspector's connection target). For each client, drive: `tools/list` → inspect `read_note`'s `inputSchema` (each client's view MUST show a flat object with `properties` containing `target_mode`, `vault`, `file`, `path` AND `additionalProperties: false`; NO `oneOf` / `allOf` / `anyOf`) → invoke `read_note({ target_mode: "specific", vault: "<v>", path: "<p>" })` against a real vault → invoke `read_note({ target_mode: "active" })` with the user's currently-focused note. All four invocations (2 modes × 2 clients) MUST return `{ content: <note-body> }`. Argument-stripping in Cowork stays enabled. Paste each client's wire-side `inputSchema` snippet AND a one-line confirmation that all four invocations succeeded into the `0.2.2` release notes. SC-001 / SC-002 / SC-003 / FR-002.

**Checkpoint**: US2 deliverable shipped. `read_note`'s wire shape flips to the post-010 flat object; both strict-rich and strict-naive clients accept it; the runtime contract for documented inputs is preserved.

---

## Phase 5: User Story 3 — The publication pipeline is small and obvious (Priority: P2)

**Goal**: Land the deletion deliverable. After this phase, [src/tools/_shared.ts](../../src/tools/_shared.ts) is ≤ 100 lines (target ~75), the wrap branch + helpers are gone, `oneOf` does not appear in the file, and [src/tools/_register.test.ts](../../src/tools/_register.test.ts) is ≤ ~270 LOC with the three feature-009 groups consolidated to one. A future maintainer reading the publication pipeline sees a one-line `zodToJsonSchema` call, not a 140-LOC envelope synthesis algorithm.

**Independent Test**: Per spec US3 — `wc -l src/tools/_shared.ts` reports ≤ 100 lines; `grep -n oneOf src/tools/_shared.ts` reports zero matches; `wc -l src/tools/_register.test.ts` reports ≤ ~320 lines (down from 473); the consolidated drift detector still passes (US1's and US2's assertions hold).

### Implementation for User Story 3

- [ ] T005 [US3] Delete the wrap branch in [src/tools/_shared.ts](../../src/tools/_shared.ts) per FR-005. Shrink `toMcpInputSchema` to a one-line delegate `return zodToJsonSchema(zodSchema, { $refStrategy: "none" }) as JsonSchemaObject` (or — at the implementer's discretion — delete the helper entirely and inline the call at [src/tools/_register.ts:26-27](../../src/tools/_register.ts#L26-L27); both paths satisfy FR-005 / FR-014). DELETE the private subroutines `unionTopLevelProperties`, `intersectionTopLevelRequired`, `stripInnerObjectType`, and the wrap-branch comment block. PRESERVE `RegisteredTool`, `asToolError`, `JsonSchemaObject`, `ToolDescriptor`, `ToolCallResult`, `ToolCallHandler` interfaces and the `// Original — no upstream.` header verbatim. Concurrently, in [src/tools/_shared.test.ts](../../src/tools/_shared.test.ts), DELETE the six wrap-branch cases (anyOf-to-oneOf rewrite, inner-type strip, top-level properties union, top-level required intersection, Pattern (a) `allOf` walking, `$schema` preservation). PRESERVE the no-op-branch case (now the only branch — verifies a flat-`z.object` input produces a verbatim shallow copy of the raw output) and the `asToolError` happy-path case. Verify post-deletion that `wc -l src/tools/_shared.ts` reports ≤ 100 (target ~75) and `grep -n oneOf src/tools/_shared.ts` reports zero matches per [quickstart.md S-6](quickstart.md#s-6--_sharedts-shrinkage-and-oneof-absence-ci-sc-007). FR-005 / SC-007. Depends on T001.

- [ ] T006 [US3] Consolidate [src/tools/_register.test.ts](../../src/tools/_register.test.ts) per [contracts/drift-detector.contract.md §1](contracts/drift-detector.contract.md#§1--structure). DELETE the pre-010 Pattern (a) fixture at [_register.test.ts:415-434](../../src/tools/_register.test.ts#L415-L434) (the `targetModeSchema.and(z.object({...}))` `ZodIntersection` form). DELETE the pre-010 Pattern (b) fixture at [_register.test.ts:436-472](../../src/tools/_register.test.ts#L436-L472) per FR-009 — Pattern (b) is no longer canonical (clarification C4 / FR-013). MERGE the three pre-010 `describe` groups (unit-layer registry walk + integration-layer SDK round-trip + synthetic Pattern (a)/(b) fixtures) into the single post-010 `describe("registry: published inputSchema invariants (post-010)", ...)` block specified at [contracts/drift-detector.contract.md §1](contracts/drift-detector.contract.md#§1--structure) with two layers (Layer 1 — registry walk + per-tool invariants; Layer 2 — SDK round-trip via `InMemoryTransport`) plus the dedicated `synthetic Pattern (a)` `it` block from T002. The `assertInvariant` predicate simplifies to support `properties_equals_set` / `required_equals` / `type` / `additionalProperties` only (drop `properties_includes` / `required_includes` per R5 — exact-match is tighter and post-010 admits it). Preserve the `it("every registered tool has an invariant entry", ...)` precondition (still a forcing function for future tool authors to declare their published-shape contract). Verify post-consolidation that `wc -l src/tools/_register.test.ts` reports ≤ ~320 (target ~270 per SC-008) and that all assertions pass — both layers, the synthetic Pattern (a) fixture, and the precondition. FR-008 / FR-009 / SC-008. Depends on T001 + T002 + T003 + T005.

**Checkpoint**: US3 deliverable shipped. The publication pipeline is now a one-line `zodToJsonSchema` delegate; the drift detector is a single-group, two-layer test that observes both the unit-layer registry walk and the SDK wire side. `_shared.ts` and `_register.test.ts` line counts hit the SC-007 / SC-008 targets.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Release-blocking hygiene before tagging `0.2.2`.

- [ ] T007 [P] Amend [.decisions/ADR-003 - Enforce Target Mode in Typed Tools.md](../../.decisions/ADR-003%20-%20Enforce%20Target%20Mode%20in%20Typed%20Tools.md) in place per [research.md R7](research.md#r7--adr-003-amendment-text). Change line 20 wording from `"Every typed MCP tool will use a discriminated union in its Zod schema..."` to `"Every typed MCP tool will use a flat z.object with a superRefine that enforces the per-mode rules..."`. Bump the `updated:` frontmatter from `2026-05-05` to `2026-05-07`. Append the "Amendment 2026-05-07 — Encoding switch (feature 010)" stanza below the existing Related Notes section per the verbatim text in research R7. PRESERVE the Status, Decision rationale, Consequences, and Related Notes sections verbatim — only the encoding paragraph language changes. NO new ADR is created (clarification C5 / SC-013). FR-013 / SC-011.

- [ ] T008 [P] Bump version `0.2.1 → 0.2.2` in [package.json](../../package.json) (single-line change). FR-011 / clarification C6. The CHANGELOG entry lands in T009 alongside.

- [ ] T009 [P] Add `## [0.2.2] — 2026-05-07` entry to [CHANGELOG.md](../../CHANGELOG.md) ABOVE the existing `0.2.1` entry per [research.md R8](research.md#r8--changelogmd-022-entry-text). Body has two sub-headings — `### Changed` (name the simplification: `read_note`'s wrapped envelope flips to a flat object; future Pattern (a) consumers use the `applyTargetModeRefinement(targetModeBaseSchema.extend({...}))` idiom; credit feature 009 as the predecessor that shipped the working compatibility shim) AND `### Behaviour change` (explicitly flag the strict-mode carve-out — unknown top-level keys now produce `VALIDATION_ERROR` with `code: "unrecognized_keys"` instead of being silently passed through; for users who relied on `.passthrough()` silently tolerating extras, the change is observable but narrow). FR-012 / SC-010.

- [ ] T010 Run the full quality-gate sweep: `npm run lint && npm run typecheck && npm run build && npx vitest run --coverage`. All five Constitution operational gates (lint clean, typecheck clean, build clean, test suite pass, aggregate statements coverage threshold met) MUST pass. The 33-case [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) MUST pass (31 pre-010 with 6 migrated + 2 new — FR-003 / SC-004). The shrunken [src/tools/_shared.test.ts](../../src/tools/_shared.test.ts) (no-op + asToolError cases only) MUST pass. The consolidated [src/tools/_register.test.ts](../../src/tools/_register.test.ts) (Layer 1 + Layer 2 + synthetic_pattern_a) MUST pass — including the precondition `every registered tool has an invariant entry` and all four invariants rows (`read_note`, `obsidian_exec`, `help`, `synthetic_pattern_a`). Coverage MUST not regress; if the post-feature actual coverage measurably exceeds the pre-010 floor of `84.3` per [research R9](research.md#r9--vitestconfigts-coverage-threshold-ratchet), bump `test.coverage.thresholds.statements` in [vitest.config.ts](../../vitest.config.ts) to the actual rounded down to the nearest tenth (one-line visible edit per Constitution Development Workflow gate #5). **Verify-by-absence checks** (Constitution PR-review gate 8 — recorded in the PR description's Constitution Compliance checklist): zero new ADRs (`git diff --name-only main..HEAD -- .decisions/` shows ONLY `ADR-003 - Enforce Target Mode in Typed Tools.md` modified; no new files added — SC-013); zero new error codes (`git diff main..HEAD -- src/errors.ts` is empty — FR-010); the 008-refactor surface untouched outside `_shared.ts` and `target-mode.ts` (`git diff --stat main..HEAD -- src/cli-adapter/ src/server.ts src/queue.ts src/logger.ts` is empty — FR-016); `obsidian_exec`'s schema untouched (`git diff main..HEAD -- src/tools/obsidian_exec/` shows zero edits — FR-007); `zodToJsonSchema` still called exactly once per registration (audit `src/tools/_register.ts` and `src/tools/_shared.ts` — FR-014). SC-009. Depends on T001..T009.

- [ ] T011 (one-time, on the implementer's machine — NOT in CI per SC-012) Execute [quickstart.md S-13](quickstart.md#s-13--deliberate-revert-detector-check-manual-sc-012-once-per-release) — the deliberate-revert detector check. Confirm `npx vitest run src/tools/_register.test.ts` PASSES on the fixed source. On a scratch branch, revert [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) to its `0.2.1` content (the discriminated-union encoding). Re-run `npx vitest run src/tools/_register.test.ts -t "tool read_note"`; confirm it FAILS with a per-cell `expect` mismatch naming the offending key (e.g., `Tool 'read_note' inputSchema.properties keys (exact set): expected ["target_mode","vault","file","path"], got [...]`). Discard the scratch branch. Add a one-line confirmation to the PR description: `S-13 verified manually — detector fails when target-mode.ts is reverted to the pre-010 discriminated-union encoding`. Also verify the WRAP-BRANCH revert: temporarily restore the deleted wrap branch in `_shared.ts` (e.g., `git restore --source=HEAD~N src/tools/_shared.ts` from a pre-T005 commit) AND restore the discriminated union in `target-mode.ts`; the test should still fail (the wrap branch's output for the discriminated-union input has `additionalProperties: true`, which the post-010 `read_note` invariant pins to `false`). Discard the changes. SC-012. Depends on T010.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: empty.
- **Foundational (Phase 2)**: T001 has no upstream task dependencies; depends only on the design artifacts already shipped (research / data-model / contracts). T001 BLOCKS all three user-story phases AND Phase 6's polish.
- **User Stories (Phase 3+)**: every story task depends on T001. T002 (US1) and T003 (US2) both modify [_register.test.ts](../../src/tools/_register.test.ts) but in disjoint regions (T002 adds the synthetic_pattern_a row + dedicated `it`; T003 modifies the read_note row in the existing invariants table) — they can be authored in parallel but serialize on review/merge. T004 (US2 manual verification) depends on T003 + post-merge tarball.
- **US3 (Phase 5)**: T005 depends on T001 (the wrap branch becomes unreachable after T001 but is technically deletable any time — the test deletion in `_shared.test.ts` would fail if T001 hadn't landed because some cases assume the discriminated-union input). T006 depends on T001 + T002 + T003 + T005 — it consolidates the file that T002/T003 just edited.
- **Polish (Phase 6)**: T007 (ADR amend) is independent and can run any time; marked [P]. T008 (version bump) and T009 (CHANGELOG) are independent files and run [P]. T010 (quality gates) depends on T001..T009 (all code + docs in place). T011 (revert check) depends on T010 (scratch branch off the green main).

### User Story Dependencies

- **US1 (T002)**: depends on T001 only.
- **US2 (T003, T004)**: T003 depends on T001 only; T004 depends on T003 + the published `0.2.2` tarball (post-merge).
- **US3 (T005, T006)**: T005 depends on T001 only; T006 depends on T001 + T002 + T003 + T005.

### Within Each User Story

- Tests are co-located in the same change as the source change (Principle II — NON-NEGOTIABLE). No separate red-green TDD loop. T001 lands the schema rewrite + handler tweak + 33 test cases together. T002 / T003 / T005 / T006 each modify or extend the corresponding `*.test.ts` file in the same task (Principle II / FR-015).

### Parallel Opportunities

- T001 cannot be parallelized — it's the only Phase 2 task and the prerequisite for everything.
- T002 (US1 — synthetic_pattern_a) and T003 (US2 — invariants table update) edit DIFFERENT regions of [_register.test.ts](../../src/tools/_register.test.ts) and could be authored in parallel by different developers; merge serialization picks the order. Listed sequentially for clarity.
- T005 (US3 — `_shared.ts` shrink) and T006 (US3 — `_register.test.ts` consolidation) edit DIFFERENT files and are technically parallelizable, but T006 depends on T002+T003 having already landed; in practice, T005 and T006 are authored in sequence by the same implementer.
- T007 [P] (ADR amend), T008 [P] (version bump), T009 [P] (CHANGELOG) are genuinely parallelizable — different files, no cross-dependency.

---

## Parallel Example: Phase 6 Polish

```bash
# Polish tasks that touch different files can run in parallel:
Task: "Amend ADR-003 in place per R7 (T007)"
Task: "Bump version 0.2.1 → 0.2.2 in package.json (T008)"
Task: "Add 0.2.2 entry to CHANGELOG.md (T009)"

# Then sequentially:
Task: "Run quality-gate sweep + threshold ratchet (T010)"
Task: "S-13 deliberate-revert detector check (T011)"
```

---

## Implementation Strategy

### MVP First (Foundational + US1 + US2)

The MVP for feature 010 is the **flatten + drift-detector update + manual verification ladder** — enough to:

1. Complete Phase 1: Setup (empty — skip).
2. Complete Phase 2: Foundational (T001) — `target-mode.ts` re-encoded; `read_note/handler.ts` tweaked; 33 tests pass.
3. Complete Phase 3: User Story 1 (T002) — synthetic Pattern (a) fixture verifies future tools inherit the contract.
4. Complete Phase 4: User Story 2 (T003 + T004) — `read_note` continues to work; manual ladder S-11 + S-12 records the verification.
5. **STOP and VALIDATE**: At this point, the user-visible behaviour for `read_note` is preserved (modulo the strict-mode carve-out for unknown keys), the published descriptor is the post-010 flat shape, and the drift detector observes both the unit and wire layers. The wrap-branch source code is still present (140 LOC of unreachable code) but functionally inert.
6. The MVP is shippable. US3's deliverable is structural-cleanup-only — it can land in the same release or be deferred.

### Incremental Delivery

1. Foundational (T001) → ATOMIC commit (target-mode.ts + handler.ts + target-mode.test.ts together).
2. US1 (T002) → drift-detector receives synthetic_pattern_a → MVP STAGE 1.
3. US2 (T003) → drift-detector tightens read_note's invariant → MVP STAGE 2.
4. US3 (T005, T006) → publication pipeline shrinks → SC-007 / SC-008 hit.
5. Polish (T007, T008, T009, T010, T011) → release hygiene + verification ladder.

### Parallel Team Strategy

Single-implementer feature; no team strategy needed. T002 / T003 could be split across reviewers if the team wants to gate the US1 and US2 deliverables independently, but in practice this is one implementer's one PR.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- T001 is the largest task — the atomic flatten that touches `target-mode.ts` (rewrite), `target-mode.test.ts` (six migrations + two new cases), `read_note/handler.ts` (one-line non-null assertion + comment). Implementers MAY split T001 into multiple commits inside the same PR; the constraint is that the tree compile-clean at every commit (use `git commit --amend` or interactive rebase to maintain bisectability).
- Verify tests fail before implementing is captured EXACTLY ONCE by T011's deliberate-revert check. No separate red-green TDD loop is requested or required.
- Commit boundaries: T001 → 1 commit; T002 → 1 commit; T003 → 1 commit; T004 → release-notes append (post-merge); T005 → 1 commit; T006 → 1 commit; T007 / T008 / T009 → 1 commit each (or one bundled if the implementer prefers); T010 → 1 commit (only if vitest threshold ratchets); T011 → no commit (one-time manual sanity check).
- Stop at any checkpoint to validate the story independently. The MVP completion checkpoint is after Phase 4.
- Avoid: vague tasks, same-file conflicts (T002/T003 both edit `_register.test.ts` — implementer authors them in sequence to avoid merge conflicts), cross-story dependencies that break independence.
