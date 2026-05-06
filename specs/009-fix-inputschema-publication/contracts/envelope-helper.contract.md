# Contract: `toMcpInputSchema` — widened envelope helper

**Feature**: 009-fix-inputschema-publication
**Surface**: [src/tools/_shared.ts](../../../src/tools/_shared.ts) → `toMcpInputSchema(zodSchema)` and its private helpers (`unionTopLevelProperties`, `intersectionTopLevelRequired`, `stripInnerObjectType`)
**Status**: SUPERSEDES [specs/007-fix-list-tools-schema/contracts/envelope-helper.contract.md](../../007-fix-list-tools-schema/contracts/envelope-helper.contract.md) — that contract described the pre-widening behaviour and is now historical.

This contract specifies what `toMcpInputSchema` MUST produce for each kind of zod input that today's tool authors and tomorrow's typed-tool roadmap exercise. The contract is enforced by the co-located unit cases in [src/tools/_shared.test.ts](../../../src/tools/_shared.test.ts) and by the per-tool drift detector in [src/tools/_register.test.ts](../../../src/tools/_register.test.ts).

## Public signature (unchanged)

```typescript
export function toMcpInputSchema(zodSchema: ZodTypeAny): JsonSchemaObject;
```

- Input: ANY zod schema (`ZodTypeAny`).
- Output: `JsonSchemaObject` — a JSON Schema Draft 7 object whose top-level `type` is `"object"`.
- No-throws (R1 / feature 007 P4): malformed inputs yield a well-formed but possibly unhelpful envelope. Not a runtime validator.
- `zodToJsonSchema` is called EXACTLY ONCE per invocation (FR-013 binding).
- Input zod schema is NOT consumed for runtime validation (the helper is a SHAPE renderer; runtime validation lives in the caller's `spec.schema.parse(args)` path inside `registerTool`).

## Behaviour by input kind

### Kind A — flat `z.object({...})` (with `.strict()` or `.passthrough()`)

```typescript
const flatSchema = z.object({ command: z.string() }).strict();
toMcpInputSchema(flatSchema);
```

**Pre-condition**: `zodToJsonSchema` returns `{ type: "object", properties: {...}, required: [...], additionalProperties: ..., $schema }`.

**Behaviour**: NO-OP BRANCH. Returns a fresh shallow copy of the raw output (`{ ...raw, type: "object" }`). The widening is NOT applied.

**Post-condition**: output equals the raw `zodToJsonSchema` output verbatim (modulo the shallow-copy reference identity).

**Worked example** (`obsidian_exec`'s schema):

Input → output is byte-stable from feature 007 / 008 / 009. Drift detector enforces this (FR-005 / FR-007).

---

### Kind B — `z.discriminatedUnion(...)` (no `.superRefine`)

```typescript
const baseUnion = z.discriminatedUnion("target_mode", [
  z.object({ target_mode: z.literal("specific"), vault: z.string(), file: z.string().optional(), path: z.string().optional() }).passthrough(),
  z.object({ target_mode: z.literal("active") }).passthrough(),
]);
toMcpInputSchema(baseUnion);
```

**Pre-condition**: `zodToJsonSchema` returns `{ anyOf: [<branch1>, <branch2>], $schema }`. NO top-level `type`.

**Behaviour**: WRAP BRANCH + WIDENING. The helper:

1. Takes `branches = raw.anyOf`.
2. Computes `oneOfBranches = branches.map(stripInnerObjectType)` (strip inner `type: "object"` since the outer envelope's `type: "object"` suffices).
3. Computes `properties = unionTopLevelProperties(branches)` — union of every branch's `properties` keys, leaf-`{}` widened (with discriminator special case for keys that appear with `type: "string"` in every branch).
4. Computes `required = intersectionTopLevelRequired(branches)` — intersection of every branch's `required` array.
5. Returns:

   ```json
   {
     "type": "object",
     "additionalProperties": true,
     "properties": <unioned>,
     "required": <intersected>,
     "oneOf": <oneOfBranches>,
     "$schema": <preserved>
   }
   ```

**Post-condition**:

- `output.type === "object"`
- `output.additionalProperties === true`
- `output.properties` is a record where:
  - Every property name from every branch's top-level `properties` appears as a key.
  - The `target_mode` discriminator is widened to `{ type: "string" }` (the value-level constraint stays inside `oneOf`).
  - Every other property's value is `{}` (no constraint at top level).
- `output.required` is the intersection of branch `required` arrays.
- `output.oneOf` is the array of branches with inner `type: "object"` stripped.
- `output.$schema` matches `raw.$schema` if present.

---

### Kind C — `ZodEffects<ZodDiscriminatedUnion>` (`targetModeSchema`-shape)

```typescript
const targetModeSchema = baseUnion.superRefine((input, ctx) => {/* ... */});
toMcpInputSchema(targetModeSchema);
```

**Pre-condition**: `zodToJsonSchema` returns the SAME shape as Kind B — the `superRefine` doesn't alter the JSON Schema output. Empirical, R5.

**Behaviour and Post-condition**: IDENTICAL to Kind B. The drift detector at `_register.test.ts` MUST cover this case explicitly because it's the read-`note` tool's actual registered schema.

---

### Kind D — Pattern (a): `targetModeSchema.and(z.object({...}))`

```typescript
const patternA = targetModeSchema.and(z.object({ note_text: z.string() }));
toMcpInputSchema(patternA);
```

**Pre-condition**: `zodToJsonSchema` returns:

```json
{
  "allOf": [
    { "anyOf": [<branch1>, <branch2>] },
    { "type": "object", "properties": { "note_text": ... }, "required": ["note_text"] }
  ],
  "$schema": "..."
}
```

NO top-level `type`. NO top-level `anyOf` / `oneOf` / `properties`.

**Behaviour**: WRAP BRANCH + WIDENING (extended for `allOf`). The helper:

1. Detects `raw.allOf` is an array. Walks each `arm`:
   - **If `arm.anyOf` (or `arm.oneOf`)**: extract its branches. Add their union-of-properties and intersection-of-required to the running aggregates. Set `oneOfBranches = branches.map(stripInnerObjectType)`.
   - **Else if `arm.properties` is a record**: add each `arm.properties` key to the running properties union (each as `{}` — no discriminator special case; only the discriminator branch arm contributes that). Add each `arm.required` entry to the running required-set as a UNION (extras-arm contributes additively to required, NOT intersectively).
2. Returns:

   ```json
   {
     "type": "object",
     "additionalProperties": true,
     "properties": <unioned>,
     "required": <combined>,
     "oneOf": <oneOfBranches>,
     "allOf": [<extras-arm-preserved-verbatim>],
     "$schema": "..."
   }
   ```

   The `allOf` survives with the extras arm only (the inner-anyOf arm is folded into `oneOf`).

**Post-condition** (worked-example for `targetModeSchema.and(z.object({ note_text: z.string() }))`):

```json
{
  "type": "object",
  "additionalProperties": true,
  "properties": {
    "target_mode": { "type": "string" },
    "vault": {}, "file": {}, "path": {}, "note_text": {}
  },
  "required": ["note_text", "target_mode"],
  "oneOf": [<branch1-stripped>, <branch2-stripped>],
  "allOf": [{ "type": "object", "properties": { "note_text": { "type": "string" } }, "required": ["note_text"] }],
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

Order of `required` is implementation-defined but stable across runs (the test asserts `expect.arrayContaining(["note_text", "target_mode"])`, not exact order).

---

### Kind E — Pattern (b): fresh discriminated union with `.superRefine()`

```typescript
const writeNoteSpecific = z.object({ target_mode: z.literal("specific"), vault: z.string(), /* ... */, note_text: z.string() }).passthrough();
const writeNoteActive   = z.object({ target_mode: z.literal("active"), note_text: z.string() }).passthrough();
const patternB = z.discriminatedUnion("target_mode", [writeNoteSpecific, writeNoteActive])
  .superRefine((input, ctx) => {/* ... */});
toMcpInputSchema(patternB);
```

**Pre-condition**: same as Kind C — top-level `anyOf`, no `allOf`, no `type`.

**Behaviour and Post-condition**: IDENTICAL to Kind B / Kind C. The widening picks up `note_text` from BOTH branches' `properties`, yielding `output.properties` includes `target_mode`, `vault`, `file`, `path`, `note_text`. Pattern (b) consumers inherit the fix without per-tool plumbing.

---

## Invariants across all kinds

These hold for every input regardless of kind (asserted by the drift detector at `_register.test.ts`):

1. `output.type === "object"` (FR-001).
2. `output` is a fresh object — calling `toMcpInputSchema` twice on the same input produces structurally-equal outputs but distinct object references (FR-009 — output may be extended by consumers without affecting later calls).
3. `output` is JSON-serializable via `JSON.stringify` (no functions, no symbols, no cycles).
4. The published shape never CONTRADICTS the runtime — if `targetModeSchema.parse(x)` accepts `x`, then `x` MUST satisfy the published `inputSchema`'s top-level constraints (every required key is present, every key is in `properties` or `additionalProperties: true` permits it). Strict-rich clients additionally apply `oneOf` and may reject when the runtime would also reject; strict-naive clients only apply top-level constraints.
5. `additionalProperties === true` for wrap-branch outputs; `additionalProperties === false` for `obsidian_exec`-shape no-op-branch outputs (FR-005 / FR-007).

## Negative invariants (the helper MUST NOT)

- ✗ Throw on any input. Malformed inputs yield a well-formed but possibly unhelpful envelope (no-throws — R1 / feature 007 P4).
- ✗ Mutate the raw `zodToJsonSchema` output. Returns are fresh objects (shallow copy at minimum).
- ✗ Call `zodToJsonSchema` more than once per invocation (FR-013).
- ✗ Strip `description` keys at any depth — that's `stripSchemaDescriptions`'s job, applied AFTER `toMcpInputSchema` in `registerTool`. The helper preserves descriptions verbatim.
- ✗ Add keys not in the published-shape contract (no telemetry, no debug fields, no schema metadata beyond `$schema`).
- ✗ Reorder keys of the input zod schema. Property order in the wrap-branch output's `properties` follows iteration order of the branch property maps (deterministic across runs).

## What the contract does NOT cover

- The runtime parse path (`registerTool`'s `spec.schema.parse(args)`) — that's the zod validator's contract, not this helper's.
- The `stripSchemaDescriptions` post-processing — separate contract at [src/help/strip-schema.ts](../../../src/help/strip-schema.ts).
- The `setRequestHandler(ListToolsRequestSchema, ...)` registration in `server.ts` — that's the SDK's contract; this helper produces the descriptors that flow into it.

## Coverage in test files

- **Unit cases** at [src/tools/_shared.test.ts](../../../src/tools/_shared.test.ts) — one case per kind (A through E) plus the no-op regression guard (kind A revisited under `obsidian_exec` shape).
- **Drift-detector cases** at [src/tools/_register.test.ts](../../../src/tools/_register.test.ts) — observes the actual published descriptors for the registered tools and asserts per-tool invariants from [data-model.md](../data-model.md) §5.
- **Integration cases** at [src/tools/_register.test.ts](../../../src/tools/_register.test.ts) — full `InMemoryTransport` round-trip via `client.listTools()` to assert the SDK preserves the envelope on the wire.
