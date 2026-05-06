# Contract — Flat `targetModeSchema` Public Export Surface

**Feature**: `010-flatten-target-mode`
**Module**: [src/target-mode/target-mode.ts](../../../src/target-mode/target-mode.ts)
**Status**: Plan-stage contract; SUPERSEDES [feature 004's target-mode.contract.md](../../004-target-mode-schema/contracts/target-mode.contract.md) for the post-010 export surface.

This contract enumerates the post-010 public exports from [src/target-mode/target-mode.ts](../../../src/target-mode/target-mode.ts), their TypeScript signatures, and worked examples for every reuse pattern. The contract is binding on the implementer: any post-010 code that imports from `target-mode/` MUST use only the exports listed below, and the implementer MUST NOT add exports beyond those listed without amending this contract first.

---

## §1 — Public exports (post-010)

```ts
// Schemas
export const targetModeBaseSchema: z.ZodObject<{
  target_mode: z.ZodEnum<["specific", "active"]>;
  vault: z.ZodOptional<z.ZodString>;
  file: z.ZodOptional<z.ZodString>;
  path: z.ZodOptional<z.ZodString>;
}, "strict">;

export const targetModeSchema: z.ZodEffects<typeof targetModeBaseSchema>;

// Helper
export function applyTargetModeRefinement<T extends z.ZodObject<z.ZodRawShape, z.UnknownKeysParam>>(
  schema: T,
): z.ZodEffects<T>;

// Inferred type
export type TargetMode = z.infer<typeof targetModeSchema>;
// ≡ { target_mode: "specific" | "active"; vault?: string; file?: string; path?: string }
```

**Total exports**: 4 (down from 10 in feature 004's surface; FR-017 deletes 8 — six per-mode schemas/helpers and two per-mode types — and FR-001 / clarification C7 / research R3 add 2 — `targetModeBaseSchema` and `applyTargetModeRefinement`).

---

## §2 — `targetModeBaseSchema` — composable `ZodObject`

The bare `ZodObject` *before* `.superRefine`. Pattern (a) consumers use this as the extension target.

**Shape**:
- `target_mode: z.enum(["specific", "active"])` — required.
- `vault: z.string().min(1).optional()` — optional at the type level; required when `target_mode === "specific"` (enforced by `applyTargetModeRefinement`'s `superRefine`, not by zod's `required` array).
- `file: z.string().optional()` — optional; XOR with `path` when `target_mode === "specific"`.
- `path: z.string().optional()` — optional; XOR with `file` when `target_mode === "specific"`.
- `.strict()` — unknown top-level keys produce `code: "unrecognized_keys"` at parse time.

**Permitted operations**:
- `targetModeBaseSchema.extend({ <new fields> })` — Pattern (a) extension. Preserves `.strict()` (research R2). PREFERRED idiom.
- `targetModeBaseSchema.merge(z.object({ <new fields> }))` — also valid, but resets `unknownKeys` to `"strip"` (research R2). NOT the canonical idiom; use only if `"strip"` semantics are explicitly desired.
- `targetModeBaseSchema.parse(...)` — direct runtime parsing of the *unrefined* schema. Does NOT enforce the per-mode rules. Useful for tests that exercise the base shape only; production tools should use `targetModeSchema` (refined) or apply the helper.

**Forbidden operations**:
- Calling `.passthrough()` or `.strip()` on the base — would defeat the FR-002 strict-mode carve-out. Lint / review enforced.

---

## §3 — `applyTargetModeRefinement` — the dispatcher helper

Attaches the per-mode rules to any `ZodObject` whose shape includes the four target-mode keys.

**Signature**:
```ts
applyTargetModeRefinement<T extends z.ZodObject<z.ZodRawShape, z.UnknownKeysParam>>(
  schema: T,
): z.ZodEffects<T>
```

The generic `T` propagates the input's full shape (including any extension keys) and the input's `unknownKeys` mode through to the returned `ZodEffects`. `z.infer<ReturnType<typeof applyTargetModeRefinement<typeof extended>>>` correctly includes extension-added fields.

**Behaviour**:
- When `input.target_mode === "specific"`:
  - If `input.vault === undefined` → issue at `path: ["vault"]`, `code: "custom"`, message `"vault is required in specific mode"`.
  - If neither `file` nor `path` → issue at `path: []`, `code: "custom"`, message `"exactly one of \`file\` or \`path\` must be provided in specific mode (got neither)"`.
  - If both `file` and `path` → two issues at `path: ["file"]` and `path: ["path"]`, both `code: "custom"`, message `"exactly one of \`file\` or \`path\` must be provided in specific mode (got both)"`.
- When `input.target_mode === "active"`:
  - For each of `["vault", "file", "path"]` present in the input → issue at `path: [<key>]`, `code: "custom"`, message `"<key> is not allowed in active mode"`.

**Per-issue text preservation**: Per FR-002 / FR-003, the messages above are character-equivalent to the pre-010 implementation in [target-mode.ts:6-41](../../../src/target-mode/target-mode.ts#L6-L41). The 31 existing target-mode tests' message-content assertions pass without modification.

**No-throws**: The helper itself never throws. Refinement issues are captured via `ctx.addIssue` and surface through `safeParse`'s `.error.issues` / `.parse`'s thrown `ZodError`.

---

## §4 — `targetModeSchema` — the canonical refined export

```ts
export const targetModeSchema = applyTargetModeRefinement(targetModeBaseSchema);
```

This is what `read_note` registers. The published JSON Schema (after `zodToJsonSchema` + `stripSchemaDescriptions`) is the flat-object descriptor at [data-model.md §4](../data-model.md#§4--zodtojsonschema-emit-shape-the-published-inputschema). No-extension consumers import this directly; extension consumers use `targetModeBaseSchema` + `applyTargetModeRefinement`.

---

## §5 — Worked examples

### Example A — `read_note` (no-extension consumer)

```ts
// src/tools/read_note/schema.ts (post-010)
import { targetModeSchema, type TargetMode } from "../../target-mode/target-mode.js";

export const readNoteInputSchema = targetModeSchema;
export type ReadNoteInput = TargetMode;
```

The published `inputSchema` for `read_note` is the flat-object descriptor at [data-model.md §4](../data-model.md#§4--zodtojsonschema-emit-shape-the-published-inputschema). No envelope helper sits between the schema and the wire.

### Example B — Pattern (a) consumer (planned `write_note`)

```ts
// src/tools/write_note/schema.ts (NOT part of this feature; illustrative)
import { z } from "zod";
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const writeNoteInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    note_text: z.string().min(1),
  }),
);

export type WriteNoteInput = z.infer<typeof writeNoteInputSchema>;
// ≡ { target_mode: "specific" | "active"; vault?: string; file?: string; path?: string; note_text: string }
```

The published `inputSchema` is identical to `read_note`'s plus `note_text` in `properties` and `"note_text"` in `required`.

### Example C — Drift-detector fixture (`synthetic_pattern_a`)

```ts
// In src/tools/_register.test.ts (Group 1 invariant table)
const syntheticPatternASchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({ note_text: z.string() }),
);
const tool = registerTool({
  name: "synthetic_pattern_a",
  description: "drift-detector fixture",
  schema: syntheticPatternASchema,
  handler: async () => ({ content: [{ type: "text" as const, text: "" }] }),
});
// Assertions: tool.descriptor.inputSchema satisfies the synthetic_pattern_a row in the §5 table of data-model.md
```

### Example D — DON'T (the historically-canonical `.merge()` form, not preferred post-010)

```ts
// FUNCTIONALLY VALID but NOT CANONICAL post-010 — use Example B's .extend() form instead.
const writeNoteInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.merge(z.object({ note_text: z.string() })),
);
// Wire descriptor: identical to Example B's.
// Runtime parse: silently STRIPS unknown top-level keys (because .merge() resets unknownKeys to "strip"),
//   so { target_mode: "active", note_text: "x", typo_field: "y" } parses successfully with typo_field dropped.
// Use .extend() instead to preserve .strict() and FR-002's strict-mode carve-out.
```

### Example E — DON'T (the infeasible `targetModeSchema.<method>()` form)

```ts
// COMPILE-TIME / LOAD-TIME ERROR — targetModeSchema is ZodEffects<ZodObject>, not ZodObject.
// .extend() and .merge() are ZodObject methods.
const broken = targetModeSchema.extend({ note_text: z.string() }); // TypeError
```

Use Example B's pattern (extend the base, then re-apply the refinement).

---

## §6 — TypeScript signature surface

The implementation MUST satisfy the following compile-time properties:

| Property | Verifier |
|---|---|
| `targetModeSchema._def.schema.constructor.name === "ZodObject"` | Runtime test in `target-mode.test.ts` |
| `z.infer<typeof targetModeSchema>` ≡ flat object type at [data-model.md §3](../data-model.md#§3--zinfertypeof-targetmodeschema-typescript-shape) | `expectTypeOf<TargetMode>().toEqualTypeOf<{...}>()` test (vitest) |
| `applyTargetModeRefinement(targetModeBaseSchema)` returns `ZodEffects<typeof targetModeBaseSchema>` | TypeScript inference (no test needed; `tsc --noEmit` enforces) |
| `applyTargetModeRefinement(targetModeBaseSchema.extend({ x: z.string() }))` infers a type that includes `x: string` | `expectTypeOf` test in `target-mode.test.ts` |

---

## §7 — JSON Schema emit shape

For the canonical `targetModeSchema` (no extension):

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "target_mode": { "type": "string", "enum": ["specific", "active"] },
    "vault": { "type": "string", "minLength": 1 },
    "file": { "type": "string" },
    "path": { "type": "string" }
  },
  "required": ["target_mode"],
  "additionalProperties": false
}
```

For an extended schema via `applyTargetModeRefinement(targetModeBaseSchema.extend({ note_text: z.string() }))`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "target_mode": { "type": "string", "enum": ["specific", "active"] },
    "vault": { "type": "string", "minLength": 1 },
    "file": { "type": "string" },
    "path": { "type": "string" },
    "note_text": { "type": "string" }
  },
  "required": ["target_mode", "note_text"],
  "additionalProperties": false
}
```

The shapes above are the actual `zodToJsonSchema(schema, { $refStrategy: "none" })` output at the pinned dependency versions, empirically verified during plan-stage research (R1).

---

## §8 — Cross-feature anchors

- **Constitution Principle III**: Reaffirmed by this contract — the JSON Schema is mechanically derived from the zod schema; no parallel hand-written shape; no companion JSON Schema export. The flat encoding makes the derivation TRIVIAL (one `zodToJsonSchema` call, no envelope synthesis).
- **ADR-003** (post-amendment per R7): The "discriminated union" wording on line 20 changes to "flat `z.object` with a `superRefine`"; the rationale (force explicit intent, validate at boundary, separate co-pilot from orchestrator context) preserved verbatim. The per-mode rules this contract codifies are exactly the rules ADR-003 mandates.
- **Feature 004's contract** ([target-mode.contract.md](../../004-target-mode-schema/contracts/target-mode.contract.md)): superseded for the post-010 surface. Pattern (b) — Per-branch divergent extension — is removed from the canonical roster (clarification C4 + FR-013). Feature 004's spec, plan, and contracts remain as historical records (R10); this contract is the live source of truth post-010.
- **Feature 009's contract** ([envelope-helper.contract.md](../../009-fix-inputschema-publication/contracts/envelope-helper.contract.md)): superseded. The envelope-helper wrap branch is deleted by FR-005; the helper itself shrinks to a one-line delegate (or is removed entirely if `_register.ts` calls `zodToJsonSchema` directly). The drift detector that 009's contract referenced is consolidated per [drift-detector.contract.md](drift-detector.contract.md).
