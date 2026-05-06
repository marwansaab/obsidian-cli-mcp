---
description: "Task list for feature 004-target-mode-schema"
---

# Tasks: Target Mode Schema Primitives

**Input**: Design documents from [specs/004-target-mode-schema/](./)
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED for this feature. FR-012 mandates co-located vitest cases at `src/target-mode/target-mode.test.ts` covering the 16 acceptance scenarios from User Stories 1–3 (six Story 1 + five Story 2 + five Story 3) plus 13 supplementary edge-case scenarios from the spec's Edge Cases section plus 3 `expectTypeOf` type-system assertions for Story 4 — 32 test bodies total. All tests use `safeParse` (not `parse`) for failure-path assertions so the `ZodError` is structurally available. Coverage floor of 84.3% statements per FR-013 + [vitest.config.ts](../../vitest.config.ts) enforces the merge gate.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4); omitted for setup/foundational/polish
- File paths in descriptions are repository-relative

## Path conventions

This is a single-library MCP server (per [plan.md](./plan.md#project-structure)). Source lives at `src/`, tests are co-located as `*.test.ts` per Constitution Principle II. The new module lives at a new top-level directory `src/target-mode/` parallel to `src/cli-adapter/` and `src/tools/`. No edits to any existing source file. No edits to `README.md` (no new `UpstreamError.code` introduced — the primitive raises `ZodError`). No edits to the canonical errors contract at `specs/001-add-cli-bridge/contracts/errors.contract.md`.

---

## Phase 1: Setup

**Purpose**: Verify the baseline so any failure observed later is attributable to this feature, not pre-existing state.

- [X] T001 Verify baseline at HEAD: run `npm run lint && npm run typecheck && npm run build && npm test` and confirm all four pass. Capture the baseline statements-coverage number from the vitest report to compare against the post-implementation number in T024; the floor is 84.3% per FR-013 / [vitest.config.ts](../../vitest.config.ts), and the actual number is expected to move *up* (~0.4–0.6 pp) once T003-T020's exhaustively-tested module lands.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Module scaffolding that BLOCKS every US1/US2/US3/US4 task. Without the file existing with its headers and shared imports, no subsequent task can typecheck.

**⚠️ CRITICAL**: T003-T024 cannot land until T002 lands.

- [X] T002 Create the module scaffolding for the new target-mode primitive:
   - Create directory `src/target-mode/`.
   - Create [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) with: (1) original-contribution header `// Original — no upstream. Shared zod discriminated-union schema primitives for target_mode (ADR-003 / BI-029).` per FR-011; (2) the `import { z } from "zod";` line; (3) the shared constant `const FORBIDDEN_KEYS_IN_ACTIVE = ["vault", "file", "path"] as const;` — `as const` is required so TypeScript narrows the loop variable to the literal-union `"vault" | "file" | "path"` inside the active-mode refinement (per [research.md](./research.md) §"Refinement-site analysis"). The file is otherwise empty at this stage; subsequent tasks add the five schemas, two helpers, and three types in declaration order.
   - Create [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) with: (1) original-contribution header `// Original — no upstream. Co-located vitest cases for the target-mode primitive (FR-012: 16 AC + 13 edge + 3 type assertions).` per FR-011; (2) imports `import { describe, it, expect, expectTypeOf } from "vitest"; import { z } from "zod"; import { zodToJsonSchema } from "zod-to-json-schema";` plus the schema/type imports from `./target-mode.js` (which will resolve as the implementation tasks land); (3) one `describe("target-mode primitive", () => { ... })` block as the empty harness.
   - Run `npm run typecheck` after creating both files. The test file's import of `./target-mode.js` will fail until T003 lands its first export — that is expected; T002's correctness is the source-file header + the constant + the test-file scaffolding.
   - Verifies FR-001 (file paths + module structure), FR-009 (no forbidden imports), FR-011 (original-contribution headers).

**Checkpoint**: Foundation ready — US1/US2/US3/US4 implementation can begin. The shared `FORBIDDEN_KEYS_IN_ACTIVE` constant exists for US2's helper to consume.

---

## Phase 3: User Story 1 — Specific-mode inputs validate against the documented "vault required, exactly one note locator" contract (Priority: P1) 🎯 MVP

**Goal**: Build the `"specific"`-branch half of the primitive — base z.object, the "exactly one of file/path" refinement helper, the refined schema, and the inferred type. Direct callers can parse `{ target_mode: "specific", vault: "V", file: "F" }` (or `path`) successfully and receive structured zod errors for the four documented failure modes.

**Independent Test**: With the per-branch schema available (T005), calling `targetModeSpecificSchema.safeParse({ target_mode: "specific", vault: "MyVault", file: "Note" })` returns `{ success: true, data: ... }` with the typed-narrowed value carrying `vault` and `file`. Calling `targetModeSpecificSchema.safeParse({ target_mode: "specific", vault: "V" })` (no locator) returns `{ success: false, error: ZodError }` with at least one issue whose `.message.includes("exactly one of")` is `true`. Verifiable by running just T007/T008 with `npx vitest run src/target-mode/target-mode.test.ts`.

### Implementation for User Story 1

- [X] T003 [US1] Implement `targetModeSpecificBaseSchema` (export #1) in [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) per FR-001 (export #1) and [contracts/target-mode.contract.md](./contracts/target-mode.contract.md) §Exports: `export const targetModeSpecificBaseSchema = z.object({ target_mode: z.literal("specific"), vault: z.string().min(1), file: z.string().optional(), path: z.string().optional() }).passthrough();`. The `.passthrough()` is mandatory per [research.md](./research.md) §"Refinement-site analysis" — without it, zod's default `.strip()` would silently delete extra keys at parse time, breaking Pattern (a)/(b) downstream composition. Sequential after T002 (same file).

- [X] T004 [US1] Implement `applyTargetModeSpecificRefinement` (export #6) in [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) per FR-001 (export #6), FR-003, plan-stage P3. The function takes a `ZodObject` (typed via the generic constraint shown in [contracts/target-mode.contract.md](./contracts/target-mode.contract.md)) and returns a `ZodEffects` wrapping it with the "exactly one of file/path" `.superRefine()`. Body: iterate over the input — `const hasFile = (input as { file?: unknown }).file !== undefined; const hasPath = (input as { path?: unknown }).path !== undefined;` — then if neither: `ctx.addIssue({ code: z.ZodIssueCode.custom, path: [], message: "exactly one of \`file\` or \`path\` must be provided in specific mode (got neither)" });`; if both: emit two issues (one with `path: ["file"]`, one with `path: ["path"]`, both with message `"exactly one of \`file\` or \`path\` must be provided in specific mode (got both)"`). The literal phrase `"exactly one of"` MUST appear in every emitted message per FR-003 + plan-stage P3 (upgraded from "recommended" to required for searchability). Sequential after T003 (same file).

- [X] T005 [US1] Derive `targetModeSpecificSchema` (export #3) in [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) per FR-001 (export #3): `export const targetModeSpecificSchema = applyTargetModeSpecificRefinement(targetModeSpecificBaseSchema);`. This is the canonical `"specific"`-branch parser AND the discriminated-union's specific branch (consumed by T015). Sequential after T004 (same file).

- [X] T006 [US1] Export the inferred TypeScript type `TargetModeSpecific` (export #8) in [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) per FR-001 (export #8) + FR-010: `export type TargetModeSpecific = z.infer<typeof targetModeSpecificSchema>;`. NO hand-written `interface` or `type` literal — only the `z.infer` derivation. Sequential after T005 (same file).

### Tests for User Story 1 ⚠️

- [X] T007 [US1] Add Story 1 happy-path vitest cases to [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) for AC #1 + AC #2 (two test bodies). For AC #1: `targetModeSpecificSchema.safeParse({ target_mode: "specific", vault: "MyVault", file: "Note" })` MUST return `{ success: true, ... }` and the typed `data` MUST satisfy `data.target_mode === "specific"`, `data.vault === "MyVault"`, `(data as { file?: string }).file === "Note"`. For AC #2: same but with `path: "Notes/Note.md"` instead of `file` — MUST succeed with `data.path === "Notes/Note.md"`. Sequential after T006 (same file).

- [X] T008 [US1] Add Story 1 failure-path vitest cases to [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) for AC #3, #4, #5, #6 (four test bodies). All use `safeParse` and assert `result.success === false`:
   - **AC #3** (no locator): `targetModeSpecificSchema.safeParse({ target_mode: "specific", vault: "MyVault" })` → `result.error.issues.some(i => i.message.includes("exactly one of"))` MUST be `true`.
   - **AC #4** (both locators): `targetModeSpecificSchema.safeParse({ target_mode: "specific", vault: "MyVault", file: "Note", path: "Notes/Note.md" })` → at least one issue's message includes `"exactly one of"`.
   - **AC #5** (vault missing): `targetModeSpecificSchema.safeParse({ target_mode: "specific", file: "Note" })` → at least one issue has `.path.includes("vault")`.
   - **AC #6** (vault empty string): `targetModeSpecificSchema.safeParse({ target_mode: "specific", vault: "", file: "Note" })` → at least one issue has `.path.includes("vault")` AND that same issue's `.message` matches at least one of `/at least 1/i`, `/non-empty/i`, or `/empty/i` (the AC's "indicates a non-empty value is required" requirement, satisfied by zod's default `.min(1)` message `"String must contain at least 1 character(s)"` — assertion remains tolerant of zod-version wording variation while still verifying message-content quality, not just path).
   Sequential after T007 (same file).

**Checkpoint**: US1 fully functional and testable independently. Direct callers using only `targetModeSpecificSchema` have a working contract for the specific-mode side. The MVP is shippable here for the *specific-mode* path; US2 adds active mode, US3 adds the discriminated union and composability, US4 adds the type assertions.

---

## Phase 4: User Story 2 — Active-mode inputs validate against the "no target-locator keys" contract (Priority: P1)

**Goal**: Build the `"active"`-branch half of the primitive — base z.object, the forbidden-key refinement helper (with the Q2-pinned message contract: name the key + name "active mode" + NO recovery directives), the refined schema, and the inferred type. Direct callers can parse `{ target_mode: "active" }` successfully and receive per-key zod errors for any vault/file/path leak.

**Independent Test**: With the per-branch schema available (T011), calling `targetModeActiveSchema.safeParse({ target_mode: "active" })` returns `{ success: true }`. Calling `targetModeActiveSchema.safeParse({ target_mode: "active", vault: "V" })` returns `{ success: false }` with at least one issue whose `.path.includes("vault")` is `true` AND whose `.message` includes both `"vault"` and `"active mode"` AND does NOT include any recovery substring (`"switch to"`, `"specific mode"`, `"instead"`). Verifiable by running T013/T014 against the post-T011 implementation. The discriminator-invalid AC (Story 2 AC #5) is tested against the union schema in US3 phase (T017) since `z.discriminatedUnion` produces the cleanest "lists valid values" error the AC expects.

### Implementation for User Story 2

- [X] T009 [US2] Implement `targetModeActiveBaseSchema` (export #2) in [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) per FR-001 (export #2): `export const targetModeActiveBaseSchema = z.object({ target_mode: z.literal("active") }).passthrough();`. The `.passthrough()` is mandatory for the same composition reason as T003. Sequential after T006 (same file).

- [X] T010 [US2] Implement `applyTargetModeActiveRefinement` (export #7) in [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) per FR-001 (export #7), FR-004, plan-stage P2, and Clarification 2026-05-06 Q2. The function takes a `ZodObject` (any shape via the generic constraint shown in the contract) and returns a `ZodEffects` wrapping it with the forbidden-key `.superRefine()`. Body: `for (const key of FORBIDDEN_KEYS_IN_ACTIVE) { if (Object.hasOwn(input, key)) { ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: \`${key} is not allowed in active mode\` }); } }`. The `Object.hasOwn` (NOT `key in input` and NOT `input[key] !== undefined`) is what catches the explicit-`undefined` edge case `{ target_mode: "active", vault: undefined }` — `hasOwn` is `true` for `{vault: undefined}` and `false` for `{}`. Per Q2, the message MUST satisfy two semantic elements (key name + `"active mode"`) and MUST NOT contain recovery directives. Sequential after T009 (same file).

- [X] T011 [US2] Derive `targetModeActiveSchema` (export #4) in [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) per FR-001 (export #4): `export const targetModeActiveSchema = applyTargetModeActiveRefinement(targetModeActiveBaseSchema);`. The canonical `"active"`-branch parser AND the discriminated-union's active branch. Sequential after T010 (same file).

- [X] T012 [US2] Export the inferred TypeScript type `TargetModeActive` (export #9) in [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) per FR-001 (export #9) + FR-010: `export type TargetModeActive = z.infer<typeof targetModeActiveSchema>;`. Sequential after T011 (same file).

### Tests for User Story 2 ⚠️

- [X] T013 [US2] Add Story 2 happy-path vitest case to [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) for AC #1 (one test body). `targetModeActiveSchema.safeParse({ target_mode: "active" })` MUST return `{ success: true, ... }` with `data.target_mode === "active"`. Sequential after T008 (same file).

- [X] T014 [US2] Add Story 2 forbidden-key vitest cases to [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) for AC #2, #3, #4 (three test bodies — one per forbidden key). For each `key` in `["vault", "file", "path"]` with a representative value (`vault: "V"`, `file: "Note"`, `path: "Notes/Note.md"`):
   - `targetModeActiveSchema.safeParse({ target_mode: "active", [key]: <value> })` → `result.success === false`.
   - `result.error.issues` MUST contain at least one issue with `.path.includes(key)` AND `.message.includes(key)` AND `.message.includes("active mode")` (the Q2 two-semantic-elements requirement).
   - `result.error.issues[i].message.includes("switch to")` MUST be `false`.
   - `result.error.issues[i].message.includes("specific mode")` MUST be `false`.
   - `result.error.issues[i].message.includes("instead")` MUST be `false`.
   The negative substring assertions enforce the Q2 no-recovery-directive rule. The three test bodies MAY be expressed as a single `it.each([...])`-driven block or as three separate `it(...)` calls — either is acceptable. Sequential after T013 (same file).

**Checkpoint**: US1 + US2 both work independently. Direct callers parsing against either `targetModeSpecificSchema` or `targetModeActiveSchema` get correct validation for both branches. The discriminator-invalid AC (Story 2 AC #5) is deferred to US3 (T017) where the union exists.

---

## Phase 5: User Story 3 — Downstream tool schemas extend the primitive without losing the target-mode contract (Priority: P1)

**Goal**: Build the discriminated-union export (`targetModeSchema`) and the union inferred type (`TargetMode`), then verify both composition patterns end-to-end. Pattern (a) — `targetModeSchema.and(z.object({content}))` — must preserve both per-branch refinements through the intersection AND survive `zod-to-json-schema` round-trip. Pattern (b) — `z.discriminatedUnion("target_mode", [apply…Refinement(targetMode…BaseSchema.extend({...})), ...])` — must allow per-branch divergent fields while keeping the per-branch refinements intact.

**Independent Test**: With `targetModeSchema` available (T015), calling `targetModeSchema.safeParse({ target_mode: "active" })` succeeds and `targetModeSchema.safeParse({ target_mode: "unknown" })` fails with a discriminator-invalid error that names `"target_mode"` as the offending field and lists both `"specific"` and `"active"` as valid values. Pattern (a) and Pattern (b) composed schemas (constructed inline in T018-T020) parse the documented inputs correctly. Verifiable by running T017–T020 against the post-T015/T016 implementation.

### Implementation for User Story 3

- [X] T015 [US3] Implement `targetModeSchema` (export #5) in [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) per FR-001 (export #5), FR-002, FR-005: `export const targetModeSchema = z.discriminatedUnion("target_mode", [targetModeSpecificSchema, targetModeActiveSchema]);`. zod 3.x's `z.discriminatedUnion` accepts `ZodEffects<ZodObject>` branches in 3.20+ — both `targetModeSpecificSchema` (T005) and `targetModeActiveSchema` (T011) are `ZodEffects<ZodObject>` so this is well-formed. Sequential after T012 (same file).

- [X] T016 [US3] Export the inferred TypeScript type `TargetMode` (export #10) in [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) per FR-001 (export #10) + FR-010: `export type TargetMode = z.infer<typeof targetModeSchema>;`. This is the canonical discriminated-union type — `TargetMode["target_mode"]` recovers the literal-union `"specific" | "active"` without a parallel hand-written declaration. Sequential after T015 (same file).

### Tests for User Story 3 ⚠️

- [X] T017 [US3] Add Story 2 AC #5 vitest case (deferred from US2 phase per T014's checkpoint) to [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) — invalid discriminator (one test body). `targetModeSchema.safeParse({ target_mode: "unknown" })` MUST return `{ success: false }` with at least one issue whose `.path.includes("target_mode")` is `true` AND whose `.code` matches `/invalid_union_discriminator|invalid_literal/` (zod-version flexibility). Per AC #5, the message MUST list the valid discriminator values — assert that the message includes `"specific"` AND `"active"`. Sequential after T014 (same file).

- [X] T018 [US3] Add Story 3 Pattern (a) vitest cases to [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) for AC #1, #2, #3 (three test bodies). Construct the test-only schema inline: `const writeNoteSchemaA = targetModeSchema.and(z.object({ content: z.string() }));`. Then:
   - **AC #1**: `writeNoteSchemaA.safeParse({ target_mode: "specific", vault: "V", file: "F", content: "Hello" })` → `success === true`, `data.content === "Hello"` (and the target-mode fields).
   - **AC #2**: `writeNoteSchemaA.safeParse({ target_mode: "active", vault: "V", content: "Hello" })` → `success === false`, at least one issue with `.path.includes("vault")` (the active-mode forbidden-key rule survives intersection).
   - **AC #3**: `writeNoteSchemaA.safeParse({ target_mode: "specific", vault: "V", file: "F" })` (missing `content`) → `success === false`, at least one issue with `.path.includes("content")`.
   Sequential after T017 (same file).

- [X] T019 [US3] Add Story 3 AC #4 vitest case to [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) — Pattern (a) zod-to-json-schema round-trip (one test body). Reuse the `writeNoteSchemaA` schema constructed in T018 (or re-construct it inline if T018's variable isn't in scope). Assert `expect(() => zodToJsonSchema(writeNoteSchemaA)).not.toThrow()` AND `expect(zodToJsonSchema(writeNoteSchemaA)).toBeTypeOf("object")` AND `expect(zodToJsonSchema(writeNoteSchemaA)).not.toBeNull()`. The result MUST be in a shape suitable for direct use as an MCP tool's `inputSchema` — verified structurally by the round-trip not throwing. Sequential after T018 (same file).

- [X] T020 [US3] Add Story 3 AC #5 vitest case to [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) — Pattern (b) per-branch divergent extension (one test body). Construct the test-only schema inline using the corrected Pattern (b) syntax (per spec FR-005 + plan-stage P4):
   ```ts
   const writeNoteSchemaB = z.discriminatedUnion("target_mode", [
     applyTargetModeSpecificRefinement(
       targetModeSpecificBaseSchema.extend({ contentForSpecific: z.string() }),
     ),
     applyTargetModeActiveRefinement(
       targetModeActiveBaseSchema.extend({ contentForActive: z.string() }),
     ),
   ]);
   ```
   Then assert (three sub-assertions inside one `it(...)`):
   - `writeNoteSchemaB.safeParse({ target_mode: "specific", vault: "V", file: "F", contentForSpecific: "S" })` → `success === true`, `data.contentForSpecific === "S"`.
   - `writeNoteSchemaB.safeParse({ target_mode: "active", contentForActive: "A" })` → `success === true`, `data.contentForActive === "A"`.
   - `writeNoteSchemaB.safeParse({ target_mode: "active", contentForSpecific: "S" })` → `success === false`, at least one issue with `.path.includes("contentForActive")` (the active branch requires `contentForActive`, not `contentForSpecific` — proves per-branch extensions stay branch-scoped and the original primitive's per-branch refinements survive `.extend()` + helper-wrap).
   Sequential after T019 (same file).

**Checkpoint**: US1 + US2 + US3 all fully functional. The full ten-export surface exists and both composition patterns are proven end-to-end. The discriminator-invalid behavior is verified. Pattern (a)'s round-trip through `zod-to-json-schema` confirms downstream typed-tool BIs can register their composed schemas as MCP `inputSchema` without surprises.

---

## Phase 6: User Story 4 — TypeScript types are inferred from the schema; no parallel hand-written interface exists (Priority: P2)

**Goal**: Verify Principle III's "single source of truth" rule via compile-time `expectTypeOf` assertions plus the grep-mechanical SC-003 check (covered in Polish phase T023). Direct callers can construct values typed against the inferred types and TypeScript narrows them correctly when discriminating on `target_mode`.

**Independent Test**: The two `expectTypeOf` assertions in T021 satisfy AC #1 and AC #2 at compile time AND at vitest test-collection time. AC #3 is the grep-mechanical "no parallel hand-written types" check, validated in T023 alongside SC-007 and SC-008.

### Implementation for User Story 4

(No source-file implementation needed — the inferred types from T006, T012, T016 are the deliverable. Story 4 is purely an assertion of those types' correctness.)

### Tests for User Story 4 ⚠️

- [X] T021 [US4] Add Story 4 `expectTypeOf` assertions to [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) for AC #1 + AC #2 (two test bodies). Use vitest's built-in `expectTypeOf` (imported in T002):
   - **AC #1** (specific narrowing): `expectTypeOf<Extract<TargetMode, { target_mode: "specific" }>>().toMatchTypeOf<{ target_mode: "specific"; vault: string; file?: string; path?: string }>();` — asserts that narrowing `TargetMode` on the `"specific"` discriminator yields the documented shape.
   - **AC #2** (active narrowing): `const activeOnly: TargetMode = { target_mode: "active" }; expectTypeOf(activeOnly).toMatchTypeOf<TargetMode>(); expectTypeOf<Extract<TargetMode, { target_mode: "active" }>>().toMatchTypeOf<{ target_mode: "active" }>();` — asserts that narrowing yields the active branch with no REQUIRED locator fields. **Do NOT add a `// @ts-expect-error` directive over an assignment like `{ target_mode: "active", vault: "V" }`** — that assignment WILL compile because the active branch's underlying schema uses `.passthrough()` (FR-005 composition tolerance), which widens the inferred type with `& { [key: string]: unknown }`. The runtime refinement at FR-004 (verified by T014) is the active-mode forbidden-key enforcement layer, not the type system. Add a one-line comment in the test body documenting this trade-off so future readers don't confuse the absence of a negative type-test for an oversight: `// Note: active-branch forbidden-key rule is runtime-only; passthrough catchall admits {[k]: unknown} at the type level (FR-005). Runtime enforcement covered by T014.`
   - (AC #3 is the grep-mechanical no-parallel-types check, verified in T023.)
   Sequential after T020 (same file).

**Checkpoint**: All four user stories' acceptance criteria are exercised. The discriminated-union narrowing works at compile time; the parse-time refinements work at runtime. Story 4 AC #3 remains for the polish phase.

---

## Phase 7: Edge-case batch (supplementary coverage beyond strict ACs)

**Purpose**: The spec's Edge Cases section enumerates 13 boundary scenarios that pin behavior at corners not directly named by an AC. Without these tests, regressions at those corners would land silently (e.g., a future refactor that switches `Object.hasOwn` to `key in input` would break the `{vault: undefined}` case). FR-012 lists these as "supplementary cases" the test set MUST include.

- [X] T022 Add the 13 edge-case vitest cases to [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) as a single batch. Each case is a `safeParse` + a one-line assertion. Group inside a nested `describe("edge cases", () => { ... })` block for log clarity. The 13 cases (in spec order):
   1. **Specific + extra unknown key**: `{ target_mode: "specific", vault: "V", file: "F", unrelated: "x" }` → `success === true` (passthrough at base).
   2. **Active + extra non-locator key**: `{ target_mode: "active", lines: 5 }` → `success === true` (only the three locator keys are forbidden).
   3. **target_mode field absent**: `{ vault: "V", file: "F" }` → `success === false`, issue identifies `target_mode` as the missing required discriminator.
   4. **target_mode non-string**: `{ target_mode: 123 }` → `success === false`, discriminator-value error identifies `target_mode`.
   5. **vault explicit undefined**: `{ target_mode: "specific", vault: undefined, file: "F" }` → `success === false`, issue at `["vault"]` (zod treats explicit-undefined as missing for required).
   6. **vault whitespace-only**: `{ target_mode: "specific", vault: "   ", file: "F" }` → `success === true` (per Assumptions: trim is NOT enforced at primitive level; downstream tools refine if needed).
   7. **file empty string**: `{ target_mode: "specific", vault: "V", file: "" }` → `success === true` (per Assumptions: file/path emptiness is downstream tools' concern).
   8. **active + explicit-undefined forbidden key**: `{ target_mode: "active", vault: undefined }` → `success === false` (Object.hasOwn distinguishes "property exists" from "property absent"; this proves the implementation choice is correct).
   9. **Discriminator typo**: `{ target_mode: "Specific" }` (capital S) → `success === false`, discriminator-invalid (case-sensitive literal).
   10. **target_mode null**: `{ target_mode: null }` → `success === false`, discriminator-invalid.
   11. **Empty input object**: `{}` → `success === false`, issue identifies missing `target_mode`.
   12. **Non-object input**: `targetModeSchema.safeParse("specific")` → `success === false`, type error indicates object expected. Repeat for `null`, `undefined`, `42` — at least one of these in the test body, the rest are equivalent and may be omitted.
   13. **Composed schema with name-collision** (this one is structural, not a parse-time test): construct `const collision = z.discriminatedUnion("target_mode", [applyTargetModeActiveRefinement(targetModeActiveBaseSchema.extend({ vault: z.string() })), targetModeSpecificSchema]);` and demonstrate (via comment or a `safeParse` that fails) that this is a self-contradictory composition the consuming tool MUST avoid — the primitive does not police downstream extensions. The body MAY be a `// @ts-expect-error` annotation on the composition itself if zod's types reject it at compile time, OR a runtime parse demonstrating the conflict. Either form is acceptable — the goal is to document that the failure mode exists and is the consuming tool's responsibility.
   Sequential after T021 (same file).

**Checkpoint**: 32 test bodies total (16 AC + 13 edge + 3 type assertions counted as 2-3 expectTypeOf calls). The schema's behavioral surface is exhaustively pinned.

---

## Phase 8: Polish & merge gates

**Purpose**: SC verifications (mechanical greps) plus the final quality-gate suite that confirms the merge-floor is held.

- [X] T023 [P] Run the SC-003, SC-007, SC-008 grep verifications from the spec's Success Criteria:
   - **SC-003**: `grep -nE "^(interface|type) (Specific|Active|TargetMode)\\b" src/target-mode/target-mode.ts` MUST return zero matches that re-declare any of the schema shapes. The `export type TargetModeSpecific = z.infer<typeof targetModeSpecificSchema>;` lines (and analogous) ARE allowed because they derive from the schema; only HAND-WRITTEN type literals like `interface TargetModeSpecific { ... }` or `type TargetModeSpecific = { ... };` (NOT using `z.infer`) are forbidden. Manually verify the matches.
   - **SC-007**: `grep -nE "\\.describe\\(" src/target-mode/target-mode.ts` MUST return zero matches. The primitive is annotation-free per FR-007.
   - **SC-008**: `grep -nE "from \"(child_process|node:fs|node:net|node:http|node:https|.*src/cli-adapter|.*src/tools|.*src/logger)" src/target-mode/target-mode.ts` MUST return zero matches. The primitive imports nothing from those modules per FR-009.
   If any grep returns unexpected matches, fix the source file and re-run before T024. Parallel with T024 only insofar as T023 is read-only and T024 includes T023's checks as part of the broader gate; in practice run T023 first, then T024.

- [X] T024 Run the full quality-gate suite: `npm run lint && npm run typecheck && npm run build && npm test`. Confirm zero lint warnings, zero typecheck errors, build success, and all tests green (T007, T008, T013, T014, T017–T021, T022). Confirm aggregate statements coverage is at or above the FR-013 floor (84.3%, captured as the baseline in T001). Report the post-implementation coverage number alongside the baseline — per [research.md](./research.md) projection, it should move *up* by ~0.4–0.6 pp. Verify [src/server.ts](../../src/server.ts)'s tool-registration list is unchanged from its pre-feature state per FR-008 (the primitive is internal, no MCP registration). **Verify SC-002 (target-mode contract single-sourced) via a two-step check** (the simpler single-grep version yields false positives for legitimate Pattern (b) downstream consumers per FR-005, which compose their own `z.discriminatedUnion("target_mode", ...)` against the BASE schemas + helpers): **Step 1**: run `grep -lrn 'z.discriminatedUnion("target_mode"' src/ --include="*.ts" --exclude="*.test.ts"` to enumerate candidate source files containing the literal. **Step 2**: for each candidate file: (a) if the path is `src/target-mode/target-mode.ts`, the match is the primitive itself — accept. (b) Otherwise, verify the file imports from the primitive (i.e., contains `from ".*target-mode/target-mode\.js"` somewhere) — if yes, the file is a legitimate Pattern (b) consumer composing against the published BASE + helpers; accept. (c) If neither, the file has redefined the contract independently — SC-002 violation; fail T024 and investigate before merging. As of this feature (no typed tools yet exist), Step 1 returns exactly one match (the primitive itself) and Step 2's check (a) accepts it. Verify the FR-014 Constitution Compliance checklist: I/Y, II/Y, III/Y, IV/N-A, V/Y. If any gate fails, fix and re-run before marking T024 complete. Final task — must be the last one.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)**: No dependencies — runs first to capture baseline coverage.
- **Foundational (T002)**: Depends on T001. **BLOCKS US1, US2, US3, US4** — every subsequent task references symbols defined or set up in T002 (the constant + the file scaffolding).
- **US1 (T003-T008)**: T003 depends on T002. T004 depends on T003 (helper signature is generic but the `.superRefine` body inspects `file`/`path` which the base declares). T005 depends on T004. T006 depends on T005. T007/T008 depend on T006 (need `targetModeSpecificSchema` and `TargetModeSpecific` to compile against).
- **US2 (T009-T014)**: T009 depends on T006 (sequential within `target-mode.ts`). T010 depends on T009 + T002's `FORBIDDEN_KEYS_IN_ACTIVE` constant. T011 depends on T010. T012 depends on T011. T013/T014 depend on T012 and are sequential within the test file.
- **US3 (T015-T020)**: T015 depends on T012 (need both refined schemas). T016 depends on T015. T017–T020 depend on T016 and are sequential within the test file.
- **US4 (T021)**: Depends on T020 (sequential within the test file). The implementation it asserts against (T006, T012, T016) already exists.
- **Edge cases (T022)**: Depends on T021 (sequential within the test file).
- **Polish (T023, T024)**: T023 depends on every implementation task (T002–T016) being complete (the greps run against the final source file). T024 is the last task.

### Critical path

`T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022 → T023 → T024`

### User story dependencies

- **US1** depends on T002 (foundational).
- **US2** depends on T002 + US1's source-file additions (T003-T006) only because they share the same file `src/target-mode/target-mode.ts` and must sequence on it. Logically, US2 has no semantic dependency on US1's exports — US2's tests parse against `targetModeActiveSchema` only.
- **US3** depends on T002 + US1's `targetModeSpecificSchema` (T005) + US2's `targetModeActiveSchema` (T011) — both branches must exist before the discriminated union can be assembled.
- **US4** depends on T002 + US1/US2/US3's type exports (T006, T012, T016).

The single-file constraint on `src/target-mode/target-mode.ts` (every implementation task edits it) and on `src/target-mode/target-mode.test.ts` (every test task edits it) means most tasks sequence on those two files even when they belong to different stories.

### Parallel opportunities

- **No within-`target-mode.ts` parallelism**: every implementation task (T002–T016) edits the single source file and must run sequentially.
- **No within-`target-mode.test.ts` parallelism**: every test task (T007, T008, T013, T014, T017–T022) edits the single test file and must run sequentially.
- **Polish phase**: T023 (greps, read-only) and T024 (full gate suite) can in principle run in parallel because T024's full gate runs the same greps as part of typecheck/build, but in practice run T023 first (cheap, fast feedback) then T024.

### Within each user story

- US1: source declarations in dependency order (base → helper → refined → type), then tests.
- US2: same pattern (base → helper → refined → type), then tests; the active-branch helper additionally reads the `FORBIDDEN_KEYS_IN_ACTIVE` constant from T002.
- US3: union → type → tests. The Story 2 AC #5 deferred test (T017) lands first in US3 phase to clear the carry-over from US2 before the Pattern (a)/(b) tests.
- US4: tests only — the implementation it asserts against was completed in earlier phases.
- Polish: greps before final gate.

---

## Parallel example — Polish phase (read-only checks)

```bash
# T023 is read-only (greps); T024 includes its own typecheck/build/test runs.
# T023 can run concurrently with T024's static checks if needed, but in
# practice run T023 first for fast feedback:
Task: "Run SC-003/SC-007/SC-008 grep verifications (T023)"
# Then:
Task: "Run full quality-gate suite (T024)"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. T001 (baseline) → T002 (scaffolding) → T003-T006 (specific cluster + type) → T007/T008 (Story 1 tests).
2. **STOP and VALIDATE**: run `npx vitest run src/target-mode/` — the six new test cases (AC #1-#6) should be green; the rest of the project's tests should still pass; coverage should not regress below 84.3%. If yes, the MVP is shippable for the *specific-mode* path.
3. Optional: ship the MVP if a hard ship deadline forces it. Otherwise continue to US2/US3/US4 — the typed-tool BIs that consume the primitive (e.g., `read_note`) will need both branches plus the discriminated union to compose against.

### Incremental delivery

1. Setup + Foundational (T001-T002) → foundation ready.
2. US1 (T003-T008) → MVP shippable (specific-branch contract + tests).
3. US2 (T009-T014) → active branch + forbidden-key contract + Q2 message-content assertions.
4. US3 (T015-T020) → discriminated union + invalid-discriminator AC + both composition patterns end-to-end + zod-to-json-schema round-trip.
5. US4 (T021) → type assertions verified at compile time.
6. Edge cases (T022) → 13 boundary scenarios pinned.
7. Polish (T023-T024) → grep verifications + final merge gate.

### Sequential strategy (single-developer)

The single-file constraints on both `target-mode.ts` (every impl task edits it) and `target-mode.test.ts` (every test task edits it) make parallel execution impractical for a single developer. The recommended order is the critical path enumerated above. The test-file tasks can be batched into fewer commits if the developer prefers (e.g., one commit per user story instead of one per task) — the per-task split exists for clear traceability against the spec ACs, not as a hard commit boundary.

---

## Notes

- [P] tasks = different files, no dependencies. Most US1/US2/US3/US4 tasks cannot use [P] because they share `target-mode.ts` (impl) or `target-mode.test.ts` (tests).
- [Story] label maps task to specific user story for traceability.
- The MVP is genuinely the US1 phase; downstream typed-tool BIs that primarily exercise specific mode can ship against US1 alone if needed. US2/US3/US4 are co-required for completeness.
- Verify tests fail before implementing where possible (TDD). The test cases in T007/T008 describe behaviour the post-T002 stub does not yet exhibit; running them against the post-T002 file (with no exports yet) should produce a clear typecheck failure on the import line — useful red. Once T003-T006 land, the tests should turn green incrementally.
- Commit after each task or logical group per CONTRIBUTING.md.
- Stop at any checkpoint to validate the active story independently.
- Avoid: vague tasks (every task names a file), same-file conflicts (sequenced explicitly above), cross-story dependencies that break independence (US3's T015 is the only cross-story coupling — it depends on T005 (US1) AND T011 (US2) both existing — and is explicitly sequenced after T012).
- The Story 2 AC #5 test deferral to US3 phase (T017) is intentional: the AC is technically about the discriminator-invalid behavior of the union, which only exists once T015 lands. Testing AC #5 against the per-branch `targetModeActiveSchema` would produce a different (less informative) error and fail to satisfy the AC's "lists the valid values" requirement.
