# Quickstart: Target Mode Schema Primitives

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-06

This walkthrough verifies the new target-mode primitive end-to-end. The primitive is **internal** — it has no MCP tool registration and makes no CLI calls, so end-to-end verification is a unit-test concern (vitest with `safeParse`) rather than an MCP-client concern. The MCP-client surface remains the existing `obsidian_exec` tool (unchanged by this feature) plus the future typed tools that compose against this primitive. The primitive's correctness is validated by the 32 co-located vitest cases (16 acceptance + 13 edge cases + 3 type assertions); the typed-tool BIs that land on top of it are the empirical validators of the composability story (per [spec.md](./spec.md) Assumptions row 14).

## Prerequisites

- This branch (`004-target-mode-schema`) checked out and built (`npm run build`).
- The repository's existing test toolchain configured (`vitest`, `@vitest/coverage-v8`).
- For the optional consumer-side smoke (Scenario 8 below): a typed-tool BI on top of the primitive (e.g., a future `read_note` BI). Until that lands, Scenarios 1–7 fully verify the primitive in isolation.

## Verification scenarios

### Scenario 1 — Specific-mode happy path (Story 1 AC #1, #2)

The primitive accepts well-formed `"specific"`-branch inputs with vault + exactly one of file/path.

```ts
import { targetModeSchema } from "../../src/target-mode/target-mode.js";

const r1 = targetModeSchema.safeParse({ target_mode: "specific", vault: "MyVault", file: "Note" });
expect(r1.success).toBe(true);
if (r1.success) {
  expect(r1.data.target_mode).toBe("specific");
  expect((r1.data as { vault: string }).vault).toBe("MyVault");
}

const r2 = targetModeSchema.safeParse({ target_mode: "specific", vault: "V", path: "Notes/N.md" });
expect(r2.success).toBe(true);
```

### Scenario 2 — Specific-mode failures (Story 1 AC #3, #4, #5, #6)

The four documented failure modes for the specific branch.

```ts
// AC #3 — neither file nor path
const r3 = targetModeSchema.safeParse({ target_mode: "specific", vault: "V" });
expect(r3.success).toBe(false);
if (!r3.success) {
  expect(r3.error.issues.some((i) => i.message.includes("exactly one of"))).toBe(true);
}

// AC #4 — both file and path
const r4 = targetModeSchema.safeParse({ target_mode: "specific", vault: "V", file: "F", path: "P" });
expect(r4.success).toBe(false);
if (!r4.success) {
  expect(r4.error.issues.some((i) => i.message.includes("exactly one of"))).toBe(true);
}

// AC #5 — vault missing
const r5 = targetModeSchema.safeParse({ target_mode: "specific", file: "Note" });
expect(r5.success).toBe(false);
if (!r5.success) {
  expect(r5.error.issues.some((i) => i.path.includes("vault"))).toBe(true);
}

// AC #6 — vault empty string
const r6 = targetModeSchema.safeParse({ target_mode: "specific", vault: "", file: "Note" });
expect(r6.success).toBe(false);
if (!r6.success) {
  expect(r6.error.issues.some((i) => i.path.includes("vault"))).toBe(true);
}
```

### Scenario 3 — Active-mode happy path (Story 2 AC #1)

Bare `{ target_mode: "active" }` is the well-formed shape for the active branch at the primitive level.

```ts
const r = targetModeSchema.safeParse({ target_mode: "active" });
expect(r.success).toBe(true);
if (r.success) {
  expect(r.data.target_mode).toBe("active");
}
```

### Scenario 4 — Active-mode forbidden-key failures (Story 2 AC #2, #3, #4)

The three forbidden keys (`vault`, `file`, `path`) MUST each fail with a custom prose message that names the key AND identifies "active mode", with NO recovery directives (Q2).

```ts
for (const [key, value] of [["vault", "V"], ["file", "Note"], ["path", "Notes/N.md"]] as const) {
  const r = targetModeSchema.safeParse({ target_mode: "active", [key]: value });
  expect(r.success).toBe(false);
  if (!r.success) {
    const issue = r.error.issues.find((i) => i.path.includes(key));
    expect(issue).toBeDefined();
    expect(issue!.message).toContain(key);            // names the offending key
    expect(issue!.message).toContain("active mode");  // identifies the mode (or a substring containing "active")
    // Q2: NO recovery directives
    expect(issue!.message).not.toContain("switch to");
    expect(issue!.message).not.toContain("specific mode");
    expect(issue!.message).not.toContain("instead");
  }
}
```

### Scenario 5 — Invalid discriminator (Story 2 AC #5)

A `target_mode` value not in the discriminator set fails with a discriminator-invalid error.

```ts
const r = targetModeSchema.safeParse({ target_mode: "unknown" });
expect(r.success).toBe(false);
if (!r.success) {
  const issue = r.error.issues.find((i) => i.path.includes("target_mode"));
  expect(issue).toBeDefined();
  // zod's invalid_union_discriminator (or invalid_literal in some versions)
  expect(issue!.code).toMatch(/invalid_union_discriminator|invalid_literal/);
}
```

### Scenario 6 — Composition Pattern (a) — uniform extension (Story 3 AC #1, #2, #3, #4)

A test-only schema constructed via `targetModeSchema.and(z.object({ content: z.string() }))` exercises all four Pattern (a) acceptance criteria.

```ts
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { targetModeSchema } from "../../src/target-mode/target-mode.js";

const writeNoteSchemaA = targetModeSchema.and(z.object({ content: z.string() }));

// AC #1 — well-formed input parses
const r1 = writeNoteSchemaA.safeParse({
  target_mode: "specific", vault: "V", file: "F", content: "Hello",
});
expect(r1.success).toBe(true);

// AC #2 — active-mode forbidden-key rule survives extension
const r2 = writeNoteSchemaA.safeParse({
  target_mode: "active", vault: "V", content: "Hello",
});
expect(r2.success).toBe(false);
if (!r2.success) {
  expect(r2.error.issues.some((i) => i.path.includes("vault"))).toBe(true);
}

// AC #3 — extension's content requirement is enforced
const r3 = writeNoteSchemaA.safeParse({
  target_mode: "specific", vault: "V", file: "F",  // missing content
});
expect(r3.success).toBe(false);
if (!r3.success) {
  expect(r3.error.issues.some((i) => i.path.includes("content"))).toBe(true);
}

// AC #4 — survives zod-to-json-schema round-trip
expect(() => zodToJsonSchema(writeNoteSchemaA)).not.toThrow();
const json = zodToJsonSchema(writeNoteSchemaA);
expect(typeof json).toBe("object");
expect(json).not.toBeNull();
```

### Scenario 7 — Composition Pattern (b) — per-branch divergent extension (Story 3 AC #5)

A test-only schema constructed via the base + `.extend()` + helper-wrap + re-build pattern proves per-branch divergent fields stay branch-scoped.

```ts
import { z } from "zod";
import {
  targetModeSpecificBaseSchema,
  targetModeActiveBaseSchema,
  applyTargetModeSpecificRefinement,
  applyTargetModeActiveRefinement,
} from "../../src/target-mode/target-mode.js";

const writeNoteSchemaB = z.discriminatedUnion("target_mode", [
  applyTargetModeSpecificRefinement(
    targetModeSpecificBaseSchema.extend({ contentForSpecific: z.string() })
  ),
  applyTargetModeActiveRefinement(
    targetModeActiveBaseSchema.extend({ contentForActive: z.string() })
  ),
]);

// Specific branch with its own field
const r1 = writeNoteSchemaB.safeParse({
  target_mode: "specific", vault: "V", file: "F", contentForSpecific: "S",
});
expect(r1.success).toBe(true);

// Active branch with its own field
const r2 = writeNoteSchemaB.safeParse({
  target_mode: "active", contentForActive: "A",
});
expect(r2.success).toBe(true);

// Cross-branch contamination: active branch with the SPECIFIC field — should fail
const r3 = writeNoteSchemaB.safeParse({
  target_mode: "active", contentForSpecific: "S",  // missing contentForActive
});
expect(r3.success).toBe(false);
if (!r3.success) {
  expect(r3.error.issues.some((i) => i.path.includes("contentForActive"))).toBe(true);
}
```

### Scenario 8 — Type narrowing (Story 4 AC #1, #2 — compile-time only)

Vitest's `expectTypeOf` asserts the discriminated union narrows correctly. These assertions are no-ops at runtime; they fail at compile time AND at vitest test-collection time.

```ts
import { expectTypeOf } from "vitest";
import type { TargetMode } from "../../src/target-mode/target-mode.js";

// AC #1 — narrowing on specific branch
expectTypeOf<Extract<TargetMode, { target_mode: "specific" }>>().toMatchTypeOf<{
  target_mode: "specific";
  vault: string;
  file?: string;
  path?: string;
}>();

// AC #2 — active branch carries no locator fields
const activeOnly: TargetMode = { target_mode: "active" };
expectTypeOf(activeOnly).toMatchTypeOf<TargetMode>();
// The following would NOT compile (Story 4 AC #2 negative case):
// const bad: TargetMode = { target_mode: "active", vault: "V" };  // type error
```

### Scenario 9 — Consumer-side smoke (deferred to first typed-tool BI)

When the first typed-tool BI lands on top of this primitive (e.g., `read_note`), an end-to-end test against a real Obsidian instance verifies the integration. The shape of that test is:

1. Compose `read_note`'s zod schema using one of Pattern (a) or (b).
2. Register the resulting schema as the tool's MCP `inputSchema` via `zodToJsonSchema(...)`.
3. Invoke via an MCP client with `{ target_mode: "active", vault: "V" }`.
4. Expect MCP response with `isError: true` and a zod-validation failure that names `vault` AND `active mode` in its message.
5. Invoke again with `{ target_mode: "specific", vault: "V", file: "Note" }`.
6. Expect a success response that routes through the [CLI adapter (feature 003)](../003-cli-adapter/spec.md).

This scenario is not part of feature 004 (the typed tool does not exist yet) but is the empirical validator of the primitive's composability story per spec.md Assumptions row 14.

## Acceptance check

After running the unit-test scenarios 1–8 above:

- All 16 FR-012 acceptance scenarios + 13 edge cases + 3 `expectTypeOf` assertions pass on first run (SC-001).
- `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run test` all pass (constitution gates 1–4).
- The aggregate statements coverage threshold remains ≥ 84.3% (FR-013, constitution gate 5).
- The MCP server's tool-registration list at [src/server.ts](../../src/server.ts) is unchanged (FR-008).
- A grep against [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) finds zero `\.describe\(` calls (SC-007).
- A grep against the same file finds zero imports from `child_process|node:fs|node:net|node:http|node:https|src/cli-adapter/|src/tools/|src/logger` (SC-008).
- A grep against the same file finds zero `^(interface|type) (Specific|Active|TargetMode)` declarations that re-declare the schema shape (SC-003).

If any of these checks fail, refer to:
- [data-model.md](./data-model.md) — the ten exports' shapes, refinement contracts, state transitions.
- [contracts/target-mode.contract.md](./contracts/target-mode.contract.md) — the canonical interface contract (signatures, behavioural rules, test patterns).
- [research.md](./research.md) — the plan-stage decisions (P1–P5) and their rationale.

## Smoke test (no real Obsidian needed)

```pwsh
npm run lint
npm run typecheck
npm run build
npm run test
```

All four MUST pass. The vitest run MUST report ≥ 84.3% statements coverage (per FR-013) and the new test cases under [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) MUST appear in the green list.

## Rollback

Should the change need to be reverted, `git revert <SHA>` of the implementation commit suffices — the change is purely additive (one new directory `src/target-mode/`, no edits to any existing source file, no new error code in the canonical contract, no new row in the README error-codes table). No data migration; no caller-state to unwind. Pre-revert callers that imported any of the ten exports from `src/target-mode/target-mode.js` would lose those imports and require their own revert; until typed-tool BIs land on top of this primitive, no such caller exists in tree.

ADR-003 already names this primitive's contract; it is unaffected by either landing or reverting this feature. Same for the [Architecture document](../../.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md).
