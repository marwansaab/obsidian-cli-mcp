# Target Mode Schema Primitives Contract

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Date**: 2026-05-06

This document is the canonical contract for the internal target-mode schema primitive at [src/target-mode/target-mode.ts](../../../src/target-mode/target-mode.ts). The module is **internal** — it has no MCP tool registration, no `inputSchema` for clients to inspect (FR-008), and makes no CLI calls. This contract documents the in-process TypeScript boundary that typed-tool schema modules consume.

## Module path

- Source: [src/target-mode/target-mode.ts](../../../src/target-mode/target-mode.ts)
- Co-located test: [src/target-mode/target-mode.test.ts](../../../src/target-mode/target-mode.test.ts)
- Both files MUST carry an original-contribution header: `// Original — no upstream. <one-line description>.` (FR-011, Constitution Principle V)

## Exports (ten total)

```ts
import { z } from "zod";

// =================================================================================================
// SCHEMAS (5)
// =================================================================================================

// (1) Unrefined "specific"-branch z.object — Pattern (b) extension target.
export const targetModeSpecificBaseSchema: z.ZodObject<
  {
    target_mode: z.ZodLiteral<"specific">;
    vault: z.ZodString;
    file: z.ZodOptional<z.ZodString>;
    path: z.ZodOptional<z.ZodString>;
  },
  "passthrough"
>;

// (2) Unrefined "active"-branch z.object — Pattern (b) extension target.
export const targetModeActiveBaseSchema: z.ZodObject<
  { target_mode: z.ZodLiteral<"active"> },
  "passthrough"
>;

// (3) Refined "specific"-branch — direct parser AND discriminated-union branch.
export const targetModeSpecificSchema: z.ZodEffects<typeof targetModeSpecificBaseSchema>;

// (4) Refined "active"-branch — direct parser AND discriminated-union branch.
export const targetModeActiveSchema: z.ZodEffects<typeof targetModeActiveBaseSchema>;

// (5) The primary export — discriminated union over the two refined branches.
export const targetModeSchema: z.ZodDiscriminatedUnion<
  "target_mode",
  [typeof targetModeSpecificSchema, typeof targetModeActiveSchema]
>;

// =================================================================================================
// REFINEMENT HELPERS (2)
// =================================================================================================

// (6) Apply the "exactly one of file/path" refinement to any ZodObject whose shape
//     includes file?: string and path?: string. Used by Pattern (b) consumers after
//     calling .extend({...}) on targetModeSpecificBaseSchema.
export function applyTargetModeSpecificRefinement<
  T extends z.ZodObject<
    { file?: z.ZodOptional<z.ZodString>; path?: z.ZodOptional<z.ZodString>; [k: string]: z.ZodTypeAny },
    z.UnknownKeysParam
  >
>(schema: T): z.ZodEffects<T>;

// (7) Apply the forbidden-key refinement (vault/file/path forbidden in active mode)
//     to any ZodObject. Used by Pattern (b) consumers after calling .extend({...})
//     on targetModeActiveBaseSchema.
export function applyTargetModeActiveRefinement<
  T extends z.ZodObject<z.ZodRawShape, z.UnknownKeysParam>
>(schema: T): z.ZodEffects<T>;

// =================================================================================================
// INFERRED TYPES (3) — derived from schemas via z.infer; no parallel hand-written types.
// =================================================================================================

export type TargetModeSpecific = z.infer<typeof targetModeSpecificSchema>;
export type TargetModeActive   = z.infer<typeof targetModeActiveSchema>;
export type TargetMode         = z.infer<typeof targetModeSchema>;
```

A consuming module imports any subset of these from one path:

```ts
import {
  targetModeSchema,
  type TargetMode,
} from "../../target-mode/target-mode.js";
```

This satisfies FR-001 / Story 4 AC #1 (single import path).

## Schema input/output contract

### `targetModeSpecificSchema`

**Accepts**:

```ts
{
  target_mode: "specific",
  vault: string,           // required, length >= 1
  file?: string,           // exactly one of file/path required
  path?: string,           // exactly one of file/path required
  [key: string]: unknown,  // extra keys allowed at base (passthrough)
}
```

**Rejects** (zod issues, `path` field is the zod-issue path):

| Failure | `path` | `message` |
|---------|--------|-----------|
| `vault` missing | `["vault"]` | zod default: `"Required"` (or "Required: vault" depending on zod version) |
| `vault === ""` (empty string) | `["vault"]` | zod default for `.min(1)`: `"String must contain at least 1 character(s)"` |
| `vault === undefined` (explicit) | `["vault"]` | same as missing |
| `vault` is a non-string | `["vault"]` | zod default: `"Expected string, received <type>"` |
| `file` is a non-string | `["file"]` | zod default |
| `path` is a non-string | `["path"]` | zod default |
| Both `file` AND `path` absent | `[]` (object-level) | `"exactly one of \`file\` or \`path\` must be provided in specific mode (got neither)"` |
| Both `file` AND `path` present | `["file"]` AND `["path"]` (two issues) | `"exactly one of \`file\` or \`path\` must be provided in specific mode (got both)"` |

### `targetModeActiveSchema`

**Accepts**:

```ts
{
  target_mode: "active",
  [key: string]: unknown,  // extra keys allowed at base (passthrough), EXCEPT vault/file/path
}
```

**Rejects** (zod issues):

| Failure | `path` | `message` |
|---------|--------|-----------|
| `vault` key present (any value, including `undefined`) | `["vault"]` | `"vault is not allowed in active mode"` |
| `file` key present (any value, including `undefined`) | `["file"]` | `"file is not allowed in active mode"` |
| `path` key present (any value, including `undefined`) | `["path"]` | `"path is not allowed in active mode"` |

If multiple forbidden keys are present, multiple issues are emitted — one per offender. The order of issues in `ZodError.issues` matches the order of the `["vault", "file", "path"]` constant.

### `targetModeSchema`

**Routes by discriminator** (`target_mode` field):

| `target_mode` value | Branch parsed | Failure mode if branch fails |
|---------------------|----------------|------------------------------|
| `"specific"` | `targetModeSpecificSchema` | as above |
| `"active"` | `targetModeActiveSchema` | as above |
| any other (string, number, missing, `null`) | n/a | discriminator-invalid: `path: ["target_mode"]`, `code: "invalid_union_discriminator"` (or zod-version equivalent), `message` lists the valid values `"specific"` and `"active"` |

## Refinement helper contract

### `applyTargetModeSpecificRefinement(s)`

Takes a ZodObject whose shape includes `file?: z.ZodOptional<z.ZodString>` and `path?: z.ZodOptional<z.ZodString>`. Returns a `ZodEffects` wrapping the input that adds the same "exactly one of file/path" refinement that `targetModeSpecificSchema` carries. Pure function — does not mutate the input schema.

```ts
const myWriteNoteSpecific = applyTargetModeSpecificRefinement(
  targetModeSpecificBaseSchema.extend({ content: z.string() })
);
// myWriteNoteSpecific is z.ZodEffects<z.ZodObject<{...base..., content: ZodString}>>
// with the exactly-one-of-file/path rule applied.
```

### `applyTargetModeActiveRefinement(s)`

Takes a ZodObject (any shape). Returns a `ZodEffects` wrapping the input that adds the same forbidden-key refinement (`vault`/`file`/`path` forbidden) that `targetModeActiveSchema` carries. Pure function.

```ts
const myWriteNoteActive = applyTargetModeActiveRefinement(
  targetModeActiveBaseSchema.extend({ content: z.string() })
);
```

## Composition patterns

### Pattern (a) — Uniform extension across both branches

```ts
const writeNoteSchema = targetModeSchema.and(
  z.object({ content: z.string() })
);
// Result type: z.ZodIntersection<typeof targetModeSchema, z.ZodObject<{content: ...}>>
// Inferred: TargetMode & { content: string }
```

This works in one line. Both per-branch refinements survive end-to-end. The discriminated-union narrowing on `target_mode` is preserved because zod intersects the union with the extension element-wise.

### Pattern (b) — Per-branch divergent extension

```ts
const writeNoteSchema = z.discriminatedUnion("target_mode", [
  applyTargetModeSpecificRefinement(
    targetModeSpecificBaseSchema.extend({ contentForSpecific: z.string() })
  ),
  applyTargetModeActiveRefinement(
    targetModeActiveBaseSchema.extend({ contentForActive: z.string() })
  ),
]);
// Result: z.ZodDiscriminatedUnion with two branches that have different extra fields.
```

The base + `.extend()` + helper-wrap + re-build pattern is required because zod 3.x's `.extend()` is a `ZodObject` method, not a `ZodEffects` method — calling `.extend()` directly on `targetModeSpecificSchema` (a `ZodEffects`) is a compile-time error.

## Behavioural contract

The primitive MUST:

1. Define `targetModeSpecificBaseSchema` as a `z.object` with `.passthrough()` and the four declared fields (target_mode literal, vault non-empty string, file optional string, path optional string).
2. Define `targetModeActiveBaseSchema` as a `z.object` with `.passthrough()` and the single declared field (target_mode literal).
3. Wrap each base schema with `.superRefine()` to produce the corresponding refined schema.
4. The "exactly one of" refinement (FR-003) MUST emit issues whose `message` contains the literal substring `"exactly one of"` so consumers can grep / pattern-match (FR-003 + plan-stage P3).
5. The forbidden-key refinement (FR-004) MUST use `Object.hasOwn(input, key)` to detect property presence (regardless of value) and emit one issue per offender with `path: [key]` and `message` containing both the key name and the literal substring `"active mode"` (Q2).
6. The forbidden-key refinement messages MUST NOT contain recovery directives — no `"switch to"`, `"specific mode"`, `"instead"` (Q2).
7. Define `targetModeSchema` as `z.discriminatedUnion("target_mode", [targetModeSpecificSchema, targetModeActiveSchema])`.
8. Export the two refinement-helper functions with the documented generic signatures.
9. Export the three inferred types via `z.infer<typeof …>`. NO hand-written `interface` or `type` literal that re-declares any of the schema shapes is permitted (Principle III, FR-010, SC-003).
10. NOT register itself as an MCP tool (FR-008). The MCP server's `Server` registration list at [src/server.ts](../../../src/server.ts) MUST NOT change.
11. NOT invoke any CLI binary, perform any filesystem access, or call any network service (FR-009). Forbidden imports: `child_process`, `node:fs`, `node:net`, `node:http`, `node:https`, `src/cli-adapter/`, `src/tools/`, `src/logger.ts`. Verifiable via grep (SC-008).
12. NOT add `.describe()` annotations to any field (FR-007). Verifiable via grep (SC-007).
13. NOT log. The primitive emits no log lines.

## Test coverage requirements (Principle II)

[src/target-mode/target-mode.test.ts](../../../src/target-mode/target-mode.test.ts) MUST cover, at minimum, the 16 acceptance scenarios from the spec's User Stories 1–3, the 13 edge cases from the Edge Cases section, and the 3 `expectTypeOf` assertions for User Story 4. See [data-model.md](../data-model.md) §"Test coverage map" for the full enumeration.

Specific test patterns:

- Use `safeParse` (not `parse`) for failure-path assertions so the `ZodError` is returned in a structured shape rather than thrown — easier to assert against `result.error.issues`.
- Assert `.message` substrings via `.toContain(...)` — the spec's literal-substring requirements (FR-003, FR-004, Story 2 ACs #2–4) are substring matches, not exact-equality matches, to leave the implementer wording flexibility within the binding semantic content.
- For the negative recovery-directive assertions (Story 2 ACs #2–4): assert `.not.toContain("switch to")`, `.not.toContain("specific mode")`, `.not.toContain("instead")` to enforce Q2's no-recovery rule.
- For Pattern (a) and Pattern (b) tests: construct the test-only composed schemas inline in the test file (no separate fixtures module).
- For `expectTypeOf` assertions: import `expectTypeOf` from `"vitest"` (not from a third-party package) per plan-stage P5.

## Validation (acceptance criteria for the contract)

After this contract is implemented and the 16 enumerated acceptance scenarios pass, the contract MUST satisfy:

- The ten exports listed above are all present and exported by name from the module's single source file.
- `targetModeSchema.safeParse(input)` returns `{ success: true, data: TargetMode }` for every input that satisfies one of the two branch contracts; returns `{ success: false, error: ZodError }` for every input that violates them.
- The MCP server's tool-registration list at [src/server.ts](../../../src/server.ts) is unchanged from its pre-feature state — primitive is internal (FR-008).
- `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run test` all pass (constitution gates 1–4).
- The aggregate statements coverage threshold remains ≥ 84.3% (FR-013, constitution gate 5).
- A grep against the source file finds zero `\.describe\(` calls (FR-007 / SC-007).
- A grep against the source file finds zero imports from `child_process|node:fs|node:net|node:http|node:https|src/cli-adapter/|src/tools/|src/logger` (FR-009 / SC-008).
- A grep against the source file finds zero `^(interface|type) (Specific|Active|TargetMode)` declarations that re-declare the schema shape (FR-010 / SC-003).
- The README error-codes table is unchanged (no new `UpstreamError.code` introduced by this feature).
