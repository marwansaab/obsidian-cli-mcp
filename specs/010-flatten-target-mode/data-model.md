# Phase 1 Data Model — Flatten `targetModeSchema`

**Feature**: `010-flatten-target-mode`
**Date**: 2026-05-07
**Source of truth**: zod schemas in [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) (post-010). Every shape below is mechanically derivable from the zod schema via `z.infer<...>` (TypeScript) and `zodToJsonSchema(...)` (JSON Schema). No parallel hand-written types are permitted (Constitution Principle III).

This is a refactor of an existing primitive. There are no new domain entities — only a re-encoding of `targetModeSchema` and its export surface. The "data model" here is the **export inventory** of [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) before vs. after the flatten, plus the per-tool invariant table the drift detector asserts against.

---

## §1 — Export inventory diff (pre-010 → post-010)

### Schemas

| # | Pre-010 export | Post-010 export | Change | Reason |
|---|---|---|---|---|
| 1 | `targetModeSpecificBaseSchema` | — | **DELETED** (FR-017 / C2) | Pattern (b) consumer base; no remaining consumer after Pattern (b) removal (C4). |
| 2 | `targetModeActiveBaseSchema` | — | **DELETED** (FR-017 / C2) | Same as #1. |
| 3 | `targetModeSpecificSchema` | — | **DELETED** (FR-017 / C2) | Per-mode refined export; six test cases migrate to call `targetModeSchema` directly with `target_mode: "specific"`. |
| 4 | `targetModeActiveSchema` | — | **DELETED** (FR-017 / C2) | Same as #3 with `"active"`. |
| 5 | `targetModeSchema` | `targetModeSchema` | **REWRITTEN** (FR-001) | Encoding flips from `ZodEffects<ZodDiscriminatedUnion>` to `ZodEffects<ZodObject>` via the new helper: `applyTargetModeRefinement(targetModeBaseSchema)`. `z.infer` flattens. |
| 6 | — | `targetModeBaseSchema` | **NEW** (FR-001 / C7 / R2) | The bare `z.object({ target_mode, vault?, file?, path? }).strict()` *before* `.superRefine`. A `ZodObject`, composable via `.extend({...})`. |

### Helpers

| # | Pre-010 export | Post-010 export | Change | Reason |
|---|---|---|---|---|
| 7 | `applyTargetModeSpecificRefinement` | — | **DELETED** (FR-017 / C2) | Pattern (b) helper — no remaining consumer. |
| 8 | `applyTargetModeActiveRefinement` | — | **DELETED** (FR-017 / C2) | Same as #7. |
| 9 | — | `applyTargetModeRefinement` | **NEW** (FR-001 / C7 / R3) | Single dispatcher. Signature: `<T extends z.ZodObject<z.ZodRawShape, z.UnknownKeysParam>>(schema: T): z.ZodEffects<T>`. Branches on `input.target_mode`; applies the per-mode rule body. The pre-010 `refineSpecificBranch` / `refineActiveBranch` private functions inline into this dispatcher. |

### Types

| # | Pre-010 export | Post-010 export | Change | TypeScript shape |
|---|---|---|---|---|
| 10 | `TargetModeSpecific` | — | **DELETED** (FR-017 / C2) | The per-mode type was a narrowed branch of the discriminated union; the flat encoding removes the discriminator-narrowed types. |
| 11 | `TargetModeActive` | — | **DELETED** (FR-017 / C2) | Same as #10. |
| 12 | `TargetMode` | `TargetMode` | **FLATTENED** (FR-004) | Pre: `({ target_mode: "specific", vault: string, file?: string, path?: string, [k: string]: unknown }) \| ({ target_mode: "active", [k: string]: unknown })`. Post: `{ target_mode: "specific" \| "active"; vault?: string; file?: string; path?: string }` (no index signature — `.strict()` omits it; FR-004). |

### Net change

- **Deletions**: 8 exports (4 per-mode schemas including 2 base schemas, 2 per-mode helpers, 2 per-mode types).
- **Additions**: 2 exports (`targetModeBaseSchema`, `applyTargetModeRefinement`).
- **Modifications**: 2 exports (`targetModeSchema` re-encoded, `TargetMode` flattened).
- **Module-level LOC change**: ~−60 LOC (estimate; final number lands in the implementation diff).

---

## §2 — Flat schema shape (the canonical encoding)

The post-010 schema is constructed in three layers, all in [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts):

### Layer A — `targetModeBaseSchema` (the bare `ZodObject`)

```ts
export const targetModeBaseSchema = z
  .object({
    target_mode: z.enum(["specific", "active"]),
    vault: z.string().min(1).optional(),
    file: z.string().optional(),
    path: z.string().optional(),
  })
  .strict();
```

- `target_mode`: required, enum-discriminated by string literals.
- `vault`: optional (the `superRefine` enforces "required when specific").
- `file` / `path`: optional (the `superRefine` enforces "exactly one of, when specific" + "neither, when active").
- `.strict()`: rejects unknown top-level keys at parse time with `code: "unrecognized_keys"`.

### Layer B — `applyTargetModeRefinement` (the helper)

```ts
export function applyTargetModeRefinement<T extends z.ZodObject<z.ZodRawShape, z.UnknownKeysParam>>(
  schema: T,
): z.ZodEffects<T> {
  return schema.superRefine((input, ctx) => {
    if (input.target_mode === "specific") {
      // vault required when specific
      if (input.vault === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["vault"],
          message: "vault is required in specific mode",
        });
      }
      // exactly one of file or path
      const hasFile = input.file !== undefined;
      const hasPath = input.path !== undefined;
      if (!hasFile && !hasPath) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [],
          message: "exactly one of `file` or `path` must be provided in specific mode (got neither)",
        });
      } else if (hasFile && hasPath) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["file"],
          message: "exactly one of `file` or `path` must be provided in specific mode (got both)",
        });
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["path"],
          message: "exactly one of `file` or `path` must be provided in specific mode (got both)",
        });
      }
    } else {
      // active mode: forbid the locator keys
      for (const key of ["vault", "file", "path"] as const) {
        if (Object.hasOwn(input, key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is not allowed in active mode`,
          });
        }
      }
    }
  });
}
```

The body is the union of `refineSpecificBranch` and `refineActiveBranch` from feature 004's [target-mode.ts:6-41](../../src/target-mode/target-mode.ts#L6-L41), inlined and dispatched on `input.target_mode`. Per-issue path/code/message text preserved verbatim per FR-002.

### Layer C — `targetModeSchema` (the canonical refined export)

```ts
export const targetModeSchema = applyTargetModeRefinement(targetModeBaseSchema);
export type TargetMode = z.infer<typeof targetModeSchema>;
```

`targetModeSchema` is the canonical export for no-extension consumers (`read_note`). Pattern (a) consumers extend the base and re-apply the helper:

```ts
// Pattern (a) — write_note example (not part of this feature)
const writeNoteSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({ note_text: z.string() }),
);
```

`.extend()` over `.merge()` because `.extend()` preserves `.strict()`; `.merge()` resets to `"strip"` (research R2).

---

## §3 — `z.infer<typeof targetModeSchema>` (TypeScript shape)

```ts
type TargetMode = {
  target_mode: "specific" | "active";
  vault?: string;
  file?: string;
  path?: string;
};
```

No index signature (`.strict()` omits it). Compare to the pre-010 discriminated-union type:

```ts
// PRE-010 (DELETED)
type TargetMode =
  | { target_mode: "specific"; vault: string; file?: string; path?: string; [k: string]: unknown }
  | { target_mode: "active"; [k: string]: unknown };
```

The post-010 type loses two properties of the discriminated form: (a) `vault` becomes `string | undefined` rather than `string` in the specific branch (handler tweak per clarification C1: `input.vault!` with comment naming the `superRefine` invariant); (b) the index signature disappears (strict consumers can no longer rely on `parsed[arbitraryKey]` typing as `unknown`).

---

## §4 — `zodToJsonSchema` emit shape (the published `inputSchema`)

```json
{
  "type": "object",
  "properties": {
    "target_mode": { "type": "string", "enum": ["specific", "active"] },
    "vault": { "type": "string", "minLength": 1 },
    "file": { "type": "string" },
    "path": { "type": "string" }
  },
  "required": ["target_mode"],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

After `stripSchemaDescriptions` (called by `registerTool` in [src/tools/_register.ts:27](../../src/tools/_register.ts#L27)), nothing changes — there are no `description` fields below the root. This is the exact wire shape `read_note` publishes via `tools/list`.

For the Pattern (a) extended schema, the only differences are: (a) `properties` adds `note_text: { type: "string" }` (or whatever the consumer's extension types it as); (b) `required` adds `"note_text"` (because it's not `.optional()`); (c) the four base keys remain in `properties` and `required` unchanged. The `additionalProperties: false` is preserved through `.extend()` (research R2 verified).

---

## §5 — Per-tool drift-detector invariants (post-010)

The post-010 [src/tools/_register.test.ts](../../src/tools/_register.test.ts) drift detector (FR-008) asserts each registered tool's published `inputSchema` against this table:

| Tool | `type` | `properties_equals_set` | `required_equals` | `additionalProperties` | Notes |
|---|---|---|---|---|---|
| `read_note` | `"object"` | `["target_mode", "vault", "file", "path"]` | `["target_mode"]` | `false` | Flips from `additionalProperties: true` (post-009 Cowork accommodation) to `false` (post-010 strict-mode tightening per C3). |
| `obsidian_exec` | `"object"` | `["command", "vault", "parameters", "flags", "copy", "timeoutMs"]` | `["command"]` | `false` | Unchanged from `0.2.0` / `0.2.1` (FR-007). |
| `help` | `"object"` | (whatever help's current shape requires — typically `["tool_name"]`) | `[]` (zero-arg invocation permitted) | `false` | Unchanged from `0.2.0` / `0.2.1`. |
| `synthetic_pattern_a` | `"object"` | `["target_mode", "vault", "file", "path", "note_text"]` | `["target_mode", "note_text"]` | `false` | New fixture replacing 009's two synthetic fixtures (Pattern (a) + Pattern (b)). Verifies that flat-extension consumers inherit the post-010 publication-pipeline contract automatically. |

The detector iterates this table via `it.each`, asserting every key. A tool entry without a row in the table fails an "every tool has an invariant" pre-check (preserving feature 009's "force future tool authors to declare a published-shape contract" behaviour).

The `synthetic_pattern_a` fixture is built inline in the test:

```ts
const syntheticPatternASchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({ note_text: z.string() }),
);
const tool = registerTool({
  name: "synthetic_pattern_a",
  description: "drift-detector fixture",
  schema: syntheticPatternASchema,
  handler: async () => ({ content: [{ type: "text" as const, text: "" }] }),
});
```

It is NOT registered with the live server — the drift detector consumes it directly from the `registerTool` return value.

---

## §6 — Test-case migration map (FR-003 / FR-017 / R6)

The six cases in [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) that today consume `targetModeSpecificSchema` / `targetModeActiveSchema` migrate as follows. Per-issue path/code/message assertions are preserved verbatim — only the schema reference and the input object's `target_mode` key change.

| # | Pre-010 case (sketched) | Post-010 case (sketched) |
|---|---|---|
| 1 | `targetModeSpecificSchema.safeParse({ vault: "V", file: "F" })` → `success: true`, `data.target_mode === "specific"` | `targetModeSchema.safeParse({ target_mode: "specific", vault: "V", file: "F" })` → same outcome |
| 2 | `targetModeSpecificSchema.safeParse({ vault: "V", path: "P" })` → `success: true` | `targetModeSchema.safeParse({ target_mode: "specific", vault: "V", path: "P" })` → same outcome |
| 3 | `targetModeSpecificSchema.safeParse({ vault: "V" })` → reject, `path: []`, message `~/exactly one/` | `targetModeSchema.safeParse({ target_mode: "specific", vault: "V" })` → same outcome |
| 4 | `targetModeActiveSchema.safeParse({})` → `success: true` | `targetModeSchema.safeParse({ target_mode: "active" })` → same outcome |
| 5 | `targetModeActiveSchema.safeParse({ vault: "V" })` → reject, `path: ["vault"]`, message `~/not allowed/` | `targetModeSchema.safeParse({ target_mode: "active", vault: "V" })` → same outcome |
| 6 | `targetModeActiveSchema.safeParse({ file: "F", path: "P" })` → reject with two issues | `targetModeSchema.safeParse({ target_mode: "active", file: "F", path: "P" })` → same outcome |

All other cases in `target-mode.test.ts` (~25 cases) already call `targetModeSchema` directly and are unchanged.

**New cases added** (FR-015 / R4):

- **N1**: `targetModeSchema.safeParse({ target_mode: "active", random: "x" })` → reject, single issue, `code: "unrecognized_keys"`, `keys: ["random"]`, `path: []`. Verifies the strict-mode carve-out (FR-002 / C3).
- **N2**: `applyTargetModeRefinement(targetModeBaseSchema.extend({ note_text: z.string() })).safeParse({ target_mode: "specific", vault: "V", file: "F", note_text: "x" })` → `success: true`. Verifies the helper preserves `.strict()` through `.extend()` (R2) and the per-mode rules fire on the extended shape.

Total post-010 case count: 31 → 33 (six migrate, two new).

---

## §7 — Constraints & invariants

| Invariant | Source | Enforced by |
|---|---|---|
| `targetModeSchema._def.schema.constructor.name === "ZodObject"` | FR-001 | Type-level via `z.ZodEffects<z.ZodObject<...>>` generic; runtime via test in `target-mode.test.ts` (a small `expect(targetModeSchema._def.schema.constructor.name).toBe("ZodObject")`). |
| `zodToJsonSchema(targetModeSchema).additionalProperties === false` | FR-006 | Drift detector at `_register.test.ts` (the `read_note` row). |
| Six per-mode exports unreachable post-010 | FR-017 | TypeScript build error if anything tries to import them; lint catches `import {...}` of removed names. |
| Pattern (a) idiom uses `.extend()` | R2 | Documented in [contracts/flat-target-mode.contract.md](contracts/flat-target-mode.contract.md). The Pattern (a) drift-detector fixture uses `.extend()` directly; if a future consumer uses `.merge()`, the published descriptor is identical (passes the detector) but runtime parse silently strips unknown keys (visible in their own boundary tests). |
| Constitution Principle III: zod is single source of truth | constitution.md | The post-010 publication pipeline is `zodToJsonSchema(targetModeSchema, ...)` — one call, no parallel JSON Schema. Verified by [_shared.ts](../../src/tools/_shared.ts) shrinking to a one-line delegate (or being deleted with `_register.ts` calling `zodToJsonSchema` directly). |

---

## §8 — Test coverage map (FR-015)

| Source change | Test file | Cases added/modified |
|---|---|---|
| `target-mode.ts` rewrite (FR-001) | `target-mode.test.ts` | 6 migrated (§6 #1–#6); 2 new (§6 N1–N2); 25 unchanged. Total: 33. |
| `_shared.ts` shrink (FR-005) | `_shared.test.ts` | 6 wrap-branch cases deleted; 1 no-op case survives; `asToolError` + `JsonSchemaObject` cases survive. Total: ~3 (down from ~9). |
| `_register.test.ts` consolidation (FR-008 / FR-009) | `_register.test.ts` | Three groups → one. Pattern (b) fixture deleted; Pattern (a) rewritten to flat-extension and folded into Group 1. Total: ~270 LOC (down from 473). |
| `read_note/handler.ts` non-null assertion (C1) | `read_note/handler.test.ts` | Existing cases pass without modification (runtime unchanged). No new cases. |

Aggregate test count delta: ~−10 tests (6 wrap-branch + 1 Pattern (b) fixture + ~3 Group 2/3 fixtures deleted; 6 migrated in place; 2 new). Aggregate statements coverage projected: +0.5 to +1.5 pp post-feature (R9).
