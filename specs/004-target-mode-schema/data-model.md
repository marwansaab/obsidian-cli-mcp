# Data Model: Target Mode Schema Primitives

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-06

This feature introduces no persistent entities (the primitive is stateless per [plan.md](./plan.md) §Storage). It introduces a single new module that exports five zod schemas, two refinement helper functions, and three TypeScript types. No new `UpstreamError.code` is added — the primitive raises `ZodError` (zod's own error type) on parse failure, not a project boundary error.

## Module exports (ten total)

The new module at [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) exports the following ten items, in declaration order:

| # | Export | Type | Role |
|---|--------|------|------|
| 1 | `targetModeSpecificBaseSchema` | `z.ZodObject<{ target_mode: z.ZodLiteral<"specific">, vault: z.ZodString, file: z.ZodOptional<z.ZodString>, path: z.ZodOptional<z.ZodString> }, "passthrough">` | Unrefined `"specific"`-branch z.object. Pattern (b) `.extend()` extension target. Permissive against unknown extra keys via `.passthrough()` so `.extend()` chains compose cleanly. |
| 2 | `targetModeActiveBaseSchema` | `z.ZodObject<{ target_mode: z.ZodLiteral<"active"> }, "passthrough">` | Unrefined `"active"`-branch z.object. Pattern (b) extension target. `.passthrough()` for the same composition reason. |
| 3 | `targetModeSpecificSchema` | `z.ZodEffects<typeof targetModeSpecificBaseSchema>` | `targetModeSpecificBaseSchema` with the "exactly one of `file` or `path`" refinement applied via `.superRefine()`. Direct caller's parser; also the discriminated union's specific branch. |
| 4 | `targetModeActiveSchema` | `z.ZodEffects<typeof targetModeActiveBaseSchema>` | `targetModeActiveBaseSchema` with the forbidden-key refinement applied via `.superRefine()`. Direct caller's parser; also the discriminated union's active branch. |
| 5 | `targetModeSchema` | `z.ZodDiscriminatedUnion<"target_mode", [typeof targetModeSpecificSchema, typeof targetModeActiveSchema]>` | The primary export. Direct callers parse against this; Pattern (a) consumers compose against this via `.and()`. |
| 6 | `applyTargetModeSpecificRefinement` | `<T extends z.ZodObject<…>>(s: T) => z.ZodEffects<T>` | Helper. Applies the "exactly one of" refinement to any ZodObject whose shape includes `file?: string` and `path?: string`. Used by Pattern (b) consumers after `targetModeSpecificBaseSchema.extend({...})`. |
| 7 | `applyTargetModeActiveRefinement` | `<T extends z.ZodObject<…>>(s: T) => z.ZodEffects<T>` | Helper. Applies the forbidden-key refinement to any ZodObject. Used by Pattern (b) consumers after `targetModeActiveBaseSchema.extend({...})`. |
| 8 | `TargetModeSpecific` | `z.infer<typeof targetModeSpecificSchema>` | Inferred type. Equivalent to `{ target_mode: "specific", vault: string, file?: string, path?: string } & { [key: string]: unknown }` (the passthrough widens). |
| 9 | `TargetModeActive` | `z.infer<typeof targetModeActiveSchema>` | Inferred type. Equivalent to `{ target_mode: "active" } & { [key: string]: unknown }`. |
| 10 | `TargetMode` | `z.infer<typeof targetModeSchema>` | Inferred type. Discriminated union of `TargetModeSpecific` and `TargetModeActive`. The canonical union type. |

The two BASE schemas (#1, #2) intentionally do NOT have separate exported inferred types — their `z.infer` shapes are structurally equivalent to the refined versions (#3, #4) modulo the runtime refinement, so a separate type export would duplicate the source of truth (Principle III) and add maintenance burden for no caller benefit. Pattern (b) consumers who need a typed handle to a "base + extension" intermediate schema can derive it themselves: `type MyExtended = z.infer<ReturnType<typeof targetModeSpecificBaseSchema.extend<…>>>`.

## Schema shapes

### `targetModeSpecificBaseSchema` / `targetModeSpecificSchema`

```ts
{
  target_mode: "specific",
  vault: string,            // .min(1) — non-empty
  file?: string,            // optional; either this OR path must be provided in refined version
  path?: string,            // optional; either this OR file must be provided in refined version
  [key: string]: unknown,   // .passthrough() admits unknown extra keys at base level
}
```

The refinement on `targetModeSpecificSchema` enforces:

- `(input.file === undefined) === (input.path === undefined)` → fail with `"exactly one of \`file\` or \`path\` must be provided in specific mode"` message.
- Both-absent case: one issue at object-level (`path: []`).
- Both-present case: two issues, one at `path: ["file"]` and one at `path: ["path"]`.

### `targetModeActiveBaseSchema` / `targetModeActiveSchema`

```ts
{
  target_mode: "active",
  [key: string]: unknown,   // .passthrough() admits unknown extra keys at base level
}
```

The refinement on `targetModeActiveSchema` enforces:

- For each `key` in `["vault", "file", "path"]`: if `Object.hasOwn(input, key)` → fail with `` `${key} is not allowed in active mode` `` message at `path: [key]`.
- The `Object.hasOwn` check (rather than `key in input` or `input[key] !== undefined`) catches the explicit-`undefined` edge case: `{ target_mode: "active", vault: undefined }` MUST fail because the property exists even though its value is `undefined`.

### `targetModeSchema`

```ts
z.discriminatedUnion("target_mode", [targetModeSpecificSchema, targetModeActiveSchema])
```

Inputs route by the `target_mode` discriminator:

- `target_mode === "specific"` → `targetModeSpecificSchema` (with refinement).
- `target_mode === "active"` → `targetModeActiveSchema` (with refinement).
- `target_mode` is any other value (or missing) → zod discriminator-invalid error.

## Refinement helper signatures

```ts
export function applyTargetModeSpecificRefinement<
  T extends z.ZodObject<{ file?: z.ZodOptional<z.ZodString>; path?: z.ZodOptional<z.ZodString>; [key: string]: z.ZodTypeAny }, "passthrough" | "strip" | "strict">
>(schema: T): z.ZodEffects<T> {
  return schema.superRefine((input, ctx) => {
    /* exactly-one rule */
  });
}

export function applyTargetModeActiveRefinement<
  T extends z.ZodObject<z.ZodRawShape, "passthrough" | "strip" | "strict">
>(schema: T): z.ZodEffects<T> {
  return schema.superRefine((input, ctx) => {
    /* forbidden-key rule */
  });
}
```

The TypeScript generics are intentionally permissive (`z.ZodRawShape` for the active variant) — the refinement reads only `Object.hasOwn(input, key)` which works for any shape, so the helper imposes no constraint on what additional fields the extended schema declares. The specific variant's generic constrains the extended schema to include `file?` and `path?` because those fields ARE the refinement's subject; without them the refinement would be a no-op and the caller has likely composed the wrong base.

## Inferred type shapes

```ts
export type TargetModeSpecific = z.infer<typeof targetModeSpecificSchema>;
// {
//   target_mode: "specific";
//   vault: string;
//   file?: string;
//   path?: string;
// } & { [key: string]: unknown }    // passthrough widening

export type TargetModeActive = z.infer<typeof targetModeActiveSchema>;
// {
//   target_mode: "active";
// } & { [key: string]: unknown }

export type TargetMode = z.infer<typeof targetModeSchema>;
// TargetModeSpecific | TargetModeActive
```

The discriminator literal type is recoverable as `TargetMode["target_mode"]` (= `"specific" | "active"`) without a parallel hand-written declaration.

## State transitions

The primitive has no state. Per call, the lifecycle is:

```text
schema.safeParse(unknown input)
  │
  ├─ if !isObject(input) → ZodError [invalid_type, expected: "object"]
  │
  ├─ check input.target_mode discriminator
  │   ├─ if "specific" → route to targetModeSpecificSchema
  │   │   ├─ vault validation: missing/undefined/"" → ZodError [path: ["vault"]]
  │   │   ├─ file/path optional-string validation
  │   │   └─ superRefine "exactly one of":
  │   │       ├─ neither present → ZodError [path: [], message: "exactly one of …"]
  │   │       ├─ both present → ZodError [path: ["file"], …] + ZodError [path: ["path"], …]
  │   │       └─ exactly one present → success
  │   ├─ if "active" → route to targetModeActiveSchema
  │   │   └─ superRefine forbidden-keys:
  │   │       ├─ for each k in {vault, file, path}: Object.hasOwn(input, k) → ZodError [path: [k], message: "<k> is not allowed in active mode"]
  │   │       └─ none present → success
  │   └─ otherwise (missing, null, "Specific", 123, etc.) → ZodError [discriminator-invalid]
  │
  └─ on success → typed-narrowed value on the matched branch
```

The state space is a function of input only — no module-level state, no cross-call coupling.

## Test coverage map (FR-012 → spec ACs)

| Test case | Maps to spec AC(s) | Path classification |
|-----------|--------------------|--------------------:|
| Story 1 AC #1 | `{specific, vault, file}` succeeds | Happy |
| Story 1 AC #2 | `{specific, vault, path}` succeeds | Happy |
| Story 1 AC #3 | `{specific, vault}` (no locator) fails with "exactly one of" | Failure |
| Story 1 AC #4 | `{specific, vault, file, path}` fails with "exactly one of" | Failure |
| Story 1 AC #5 | `{specific, file}` (no vault) fails with vault-required | Failure |
| Story 1 AC #6 | `{specific, vault: "", file}` fails with vault-non-empty | Failure |
| Story 2 AC #1 | `{active}` succeeds | Happy |
| Story 2 AC #2 | `{active, vault}` fails with vault-forbidden + "active mode" message | Failure |
| Story 2 AC #3 | `{active, file}` fails with file-forbidden + "active mode" message | Failure |
| Story 2 AC #4 | `{active, path}` fails with path-forbidden + "active mode" message | Failure |
| Story 2 AC #5 | `{target_mode: "unknown"}` fails with discriminator-invalid | Failure |
| Story 3 AC #1 | Pattern (a) `targetModeSchema.and(z.object({content: z.string()}))` parses success | Happy / Composability |
| Story 3 AC #2 | Pattern (a) extended schema rejects `{active, vault, content}` | Failure / Composability |
| Story 3 AC #3 | Pattern (a) extended schema rejects `{specific, vault, file}` (missing content) | Failure / Composability |
| Story 3 AC #4 | Pattern (a) extended schema survives `zod-to-json-schema` round-trip | Boundary / Composability |
| Story 3 AC #5 | Pattern (b) `apply…Refinement(targetMode…BaseSchema.extend({...}))` per-branch divergence | Composability |
| Story 4 AC #1 (compile-time) | `expectTypeOf<TargetMode>().toMatchTypeOf<{target_mode: "specific" \| "active"}>()` | Type / Compile |
| Story 4 AC #2 (compile-time) | `expectTypeOf<{target_mode: "active"}>().toMatchTypeOf<TargetMode>()` | Type / Compile |
| Story 4 AC #3 (grep-mechanical) | source file has zero `^(interface\|type) (Specific\|Active\|TargetMode)` matches | SC-003 |

Plus 13 supplementary edge-case tests from the spec's Edge Cases section: extra unknown keys (specific + active), missing/non-string discriminator, undefined/whitespace vault, empty-string locators, undefined-valued forbidden keys, capitalisation typo, null discriminator, empty input, non-object input, name-collision composition.

Total: 16 acceptance scenarios + 13 edge cases + 3 type assertions = 32 test bodies. The `expectTypeOf` assertions cost no runtime (compile-time only); the runtime test count is 29.

## Logger.ErrorCode union — NOT extended this feature

Feature 002 extended `Logger.ErrorCode` to include `"CLI_REPORTED_ERROR"`. Feature 003 deliberately did NOT extend it for `ERR_NO_ACTIVE_FILE`. **Feature 004 does NOT extend the union either**: the primitive emits `ZodError`, not `UpstreamError`. The existing `VALIDATION_ERROR` code (already in the union, used by [src/tools/obsidian_exec/tool.ts:61](../../src/tools/obsidian_exec/tool.ts#L61)) is the right code for typed-tool consumers to log when a `targetModeSchema.safeParse()` call fails — but wiring that is each typed-tool BI's job, not this feature's.

## Surface enumeration (post-feature)

After this feature lands, the project's public exports gain ten new items in a new module path:

```ts
import {
  // Schemas
  targetModeSpecificBaseSchema,
  targetModeActiveBaseSchema,
  targetModeSpecificSchema,
  targetModeActiveSchema,
  targetModeSchema,
  // Helpers
  applyTargetModeSpecificRefinement,
  applyTargetModeActiveRefinement,
  // Types
  type TargetModeSpecific,
  type TargetModeActive,
  type TargetMode,
} from "./target-mode/target-mode.js";
```

The `UpstreamError.code` enumeration is unchanged (still 8 codes from features 001/002/003: `TOOL_NOT_FOUND`, `VALIDATION_ERROR`, `CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`).
