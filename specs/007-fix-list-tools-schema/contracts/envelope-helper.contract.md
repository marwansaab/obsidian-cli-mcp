# Contract: `toMcpInputSchema(zodSchema)` envelope helper

**Feature**: 007-fix-list-tools-schema
**Source**: `src/tools/_shared.ts`
**Consumed by**: `src/target-mode/target-mode.ts` (today: `targetModeJsonSchema`); future typed-tool BIs that build their own zod schemas from the BI-029 idiom.

---

## Purpose

Render any zod schema to a JSON Schema whose top-level `type` is `"object"`, so the result is a valid `inputSchema` for an MCP `Tool` descriptor (per the MCP `Tool` definition's normative requirement that every tool's `inputSchema` is an object schema).

The helper exists because `zodToJsonSchema` produces top-level `anyOf` / `oneOf` / `allOf` for unions, discriminated unions, and certain refined schemas — outputs that satisfy JSON Schema validity but **do not** satisfy the MCP `Tool` definition's narrower requirement.

---

## Signature

```ts
import type { ZodTypeAny } from "zod";

export interface JsonSchemaObject {
  type: "object";
  [key: string]: unknown;
}

export function toMcpInputSchema(zodSchema: ZodTypeAny): JsonSchemaObject;
```

---

## Behaviour

### Input contract

- `zodSchema` must be a non-`null`, non-`undefined` zod schema. Any `ZodTypeAny` is accepted.
- The helper passes `{ $refStrategy: "none" }` to `zodToJsonSchema` to keep output flat (matches the existing convention at [src/tools/read_note/schema.ts:9](../../src/tools/read_note/schema.ts#L9)).

### Output contract

The returned object MUST satisfy ALL of:

1. **`result.type === "object"`** (the binding constraint from FR-002).
2. The result is a fresh object — the helper does not mutate its input or `zodToJsonSchema`'s output.
3. If the raw output already had `"type": "object"` at the top level, the result equals the raw output deep-by-value (the helper is a no-op on already-valid object schemas).
4. If the raw output had top-level `anyOf` (the discriminated-union case), the result has:
   - `type: "object"` at the top level.
   - `additionalProperties: true` at the top level (mirrors runtime `passthrough()` behaviour).
   - Top-level **`oneOf`** carrying the original branches (rewritten from `anyOf`; see P2 in [research.md](../research.md)).
   - The inner `"type": "object"` of each branch is stripped (the outer one suffices; deduplication keeps the descriptor minimal).
5. If the raw output had top-level `oneOf` or `allOf`, those keywords are preserved verbatim inside the envelope (no rewrite — `oneOf` is already what the helper would have chosen, and `allOf` is preserved for forward compatibility).
6. The `$schema` keyword from the raw output is preserved (placed at any position in the result; consumers should not assume key order).

### Error contract

The helper does not throw. Inputs that produce schema-shape outputs incompatible with an object envelope (e.g., a top-level `enum` of strings) yield a well-formed but unhelpful envelope (`{ type: "object", enum: [...] }`). This is treated as developer-time misuse, not a runtime error path. There is no `UpstreamError` propagation involved (the helper does not cross any boundary surface in the Principle IV sense).

---

## Examples

### Example 1: `z.object({...})` → no-op

**Input** (zod):
```ts
z.object({ vault: z.string(), file: z.string() }).passthrough()
```

**`zodToJsonSchema` raw output**:
```json
{
  "type": "object",
  "properties": { "vault": { "type": "string" }, "file": { "type": "string" } },
  "required": ["vault", "file"],
  "additionalProperties": true,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

**`toMcpInputSchema` output**: identical to raw output (returned verbatim).

---

### Example 2: discriminated union → wrap

**Input** (zod):
```ts
z.discriminatedUnion("target_mode", [
  z.object({ target_mode: z.literal("specific"), vault: z.string() }).passthrough(),
  z.object({ target_mode: z.literal("active") }).passthrough(),
]).superRefine(/* per-branch refinement */)
```

**`zodToJsonSchema` raw output**:
```json
{
  "anyOf": [
    { "type": "object", "properties": { "target_mode": { "type": "string", "const": "specific" }, "vault": { "type": "string" } }, "required": ["target_mode", "vault"], "additionalProperties": true },
    { "type": "object", "properties": { "target_mode": { "type": "string", "const": "active" } }, "required": ["target_mode"], "additionalProperties": true }
  ],
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

**`toMcpInputSchema` output**:
```json
{
  "type": "object",
  "additionalProperties": true,
  "oneOf": [
    { "properties": { "target_mode": { "type": "string", "const": "specific" }, "vault": { "type": "string" } }, "required": ["target_mode", "vault"], "additionalProperties": true },
    { "properties": { "target_mode": { "type": "string", "const": "active" } }, "required": ["target_mode"], "additionalProperties": true }
  ],
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

Note: top-level `anyOf` rewritten to `oneOf`; inner `"type": "object"` stripped from each branch.

---

## Test obligations (Principle II)

The helper MUST ship with the following co-located tests in `src/tools/_shared.test.ts` in the same change that adds it:

- **Happy**: produces top-level `type: "object"` for `z.object({...})` (no-op path).
- **Happy**: wraps `z.discriminatedUnion` into the envelope shape, with `oneOf` branches preserving `properties` / `required`.
- **Boundary**: rewrites top-level `anyOf` → `oneOf`.
- **Boundary**: sets top-level `additionalProperties: true` on the wrap path.
- **Boundary**: preserves `$schema` keyword.
- **Boundary**: does not mutate the raw `zodToJsonSchema` output (asserts referential distinctness or post-call equality of the raw object).

These six bodies plus the retroactive `asToolError` happy-path test (per P8 in research) make `_shared.test.ts` Principle-II-compliant.

---

## Backwards compatibility

This helper is **new in feature 007**; no prior consumers exist. The signature, output shape, and error semantics above are the v1 contract. Any future relaxation (e.g., accepting non-zod inputs) requires either an extension that preserves this contract or an ADR.

The two existing in-tree consumers after this fix lands:

- `targetModeJsonSchema` at [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) — built via `toMcpInputSchema(targetModeSchema)`.
- `readNoteInputJsonSchema` at [src/tools/read_note/schema.ts](../../src/tools/read_note/schema.ts) — re-exported from `targetModeJsonSchema`.

Future consumers — typed-tool BIs that extend the target-mode primitive (BI-004 read_heading and beyond) — call `toMcpInputSchema(<their own zod schema>)` directly to get the same envelope guarantee.
