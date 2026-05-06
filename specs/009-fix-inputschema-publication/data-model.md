# Phase 1: Data Model — Fix Empty Published `inputSchema`

**Feature**: 009-fix-inputschema-publication
**Date**: 2026-05-07
**Status**: Complete — Phase 1 of three (data-model, contracts, quickstart)

This feature is a publication-pipeline bugfix; there are no domain entities. This document captures **schema shapes** — the type-level contracts that the widened `toMcpInputSchema` must satisfy and the per-tool invariant case-table the drift detector asserts. Every shape declared here is mechanically derived from a zod schema (Principle III); no parallel hand-written types are introduced.

---

## 1. The widened envelope shape (output of `toMcpInputSchema`'s wrap branch)

**Type-level contract** (TypeScript-shaped pseudocode — NOT a runtime type):

```typescript
interface WidenedEnvelope extends JsonSchemaObject {
  type: "object";                           // unchanged from feature 007
  additionalProperties: true;               // unchanged — runtime is .passthrough() (R3)
  $schema?: string;                         // preserved verbatim from raw output
  oneOf: Array<JsonSchemaObject>;           // unchanged — branches with inner type stripped
  properties: Record<string, JsonSchemaObject>;  // NEW — union of branch top-level properties
  required?: Array<string>;                 // NEW — intersection of branch required keys
  allOf?: Array<JsonSchemaObject>;          // preserved when input was Pattern (a) — see §4
}
```

**Invariants** (asserted by `_shared.test.ts` cases per R12 and `_register.test.ts` per R7):

- `output.type === "object"` always.
- `output.additionalProperties === true` for every wrap-branch result.
- `output.oneOf.length === input.anyOf.length` (or `input.oneOf.length`); branches preserved 1:1.
- `Object.keys(output.properties)` ⊇ `union of Object.keys(branch.properties)` for every branch (no property dropped).
- Every value in `output.properties` is either `{}` (leaf widening — see §3) or `{ type: "string" }` (only for the discriminator special case — see §3).
- `output.required` (when present) is the **intersection** of `branch.required` across all branches.
- `output.$schema === raw.$schema` when `raw.$schema` is a string (preserved verbatim).
- For Pattern (a) inputs (input had `allOf` containing one inner-anyOf arm and one extras arm), `output.properties` includes the union of the inner-anyOf branches' properties AND the extras arm's properties; `output.required` includes the intersection-across-branches AND the extras arm's required keys (see §4).

---

## 2. The no-op shape (output of `toMcpInputSchema`'s no-op branch)

**Unchanged from feature 007** — a flat `z.object({...}).strict()` (or `.passthrough()`) input emits a top-level `{ type: "object", properties: {...}, required: [...], additionalProperties: ... }` from `zodToJsonSchema`, which the helper returns verbatim (with a fresh shallow copy per the existing "do not mutate the raw output" invariant). The widening DOES NOT FIRE on this branch — `obsidian_exec` and other flat-`z.object` tools are byte-identical to today.

**Drift-detector assertion for `obsidian_exec`** (R7 / FR-007):

```typescript
{
  type: "object",
  properties: {
    command: { type: "string", minLength: 1 },
    parameters: { type: "object", additionalProperties: { type: ["string", "number", "boolean"] } },
    vault: { type: "string", minLength: 1 },
    flags: { type: "array", items: { type: "string", minLength: 1, pattern: "^(?!--).*" } },
    copy: { type: "boolean" },
    timeoutMs: { type: "integer", exclusiveMinimum: 0, maximum: 120000 },
  },
  required: ["command"],
  additionalProperties: false,
  $schema: "http://json-schema.org/draft-07/schema#",
}
```

The exact shape MUST be byte-stable across this fix — the no-op branch never enters the widening logic for flat-`z.object` schemas, so this is a regression guard.

---

## 3. Top-level `properties` widening algorithm

**Function signatures** (private to `_shared.ts`):

```typescript
function unionTopLevelProperties(
  branches: ReadonlyArray<JsonSchemaObject>,
): Record<string, JsonSchemaObject>;

function intersectionTopLevelRequired(
  branches: ReadonlyArray<JsonSchemaObject>,
): Array<string>;
```

**Algorithm** (`unionTopLevelProperties`):

1. Start with an empty record `union: Record<string, JsonSchemaObject> = {}`.
2. For each `branch` in `branches`:
   - If `branch.properties` is a record, for each `[key, value]` pair:
     - **Discriminator special case**: if `key === "target_mode"` AND `value.type === "string"` (regardless of whether `const` is present), set `union[key] = { type: "string" }` (idempotent across branches — every branch has the same widened shape).
     - **Default case**: set `union[key] = {}` (leaf widening — see R2 rationale; per-branch typed shape lives inside the `oneOf`).
3. Return `union`.

**Generalised discriminator detection** (forward-looking — applies if any future tool uses a non-`target_mode` discriminator): if a property name appears in EVERY branch with `type === "string"` AND with a `const` value (different per branch), widen its top-level published shape to `{ type: "string" }`. The check is "every branch has it as `{ type: "string", const: <something> }`", and the widened shape strips the `const` since the branches disagree on the value. For non-discriminator properties, `{}` is always the correct widening because branches can disagree on whether the property is present, optional, or typed.

**Algorithm** (`intersectionTopLevelRequired`):

1. If `branches.length === 0`, return `[]`.
2. Initialise `result = new Set(branches[0].required ?? [])`.
3. For each subsequent `branch`:
   - Let `branchRequired = new Set(branch.required ?? [])`.
   - `result = result ∩ branchRequired`.
4. Return `Array.from(result)` (deterministic order — sort for stability across runs).

For `targetModeSchema`: branch 1 (`specific`) has `required: ["target_mode", "vault"]`; branch 2 (`active`) has `required: ["target_mode"]`. Intersection: `["target_mode"]`. ✅

---

## 4. Pattern (a) `allOf` handling

**Input shape** (empirical, from R4):

```json
{
  "allOf": [
    { "anyOf": [<branch1-with-properties>, <branch2-with-properties>] },
    { "type": "object", "properties": {<extras>}, "required": [<extras-required>] }
  ],
  "$schema": "..."
}
```

**Wrap-branch algorithm extension**:

1. Detect `raw.allOf` is an array of length ≥ 1.
2. Walk each `arm` in `raw.allOf`:
   - If `arm.anyOf` or `arm.oneOf` is an array — extract branches via `unionTopLevelProperties(branches)` and `intersectionTopLevelRequired(branches)`. Merge into the running union/intersection. Set `envelope.oneOf = branches.map(stripInnerObjectType)`.
   - Else if `arm.properties` is a record — merge `arm.properties` keys into the union (each with `{}` leaf widening unless it's a discriminator). Merge `arm.required ?? []` into the running required-set as a UNION (extras arm contributes additively to required, since the extras arm is conjunctively combined with the branches).
3. Preserve any non-anyOf/oneOf arms in a top-level `allOf: [<extras-arm>, ...]` so strict-rich clients can still process the per-tool extension constraints.

**Worked example** (Pattern (a) — `targetModeSchema.and(z.object({ note_text: z.string() }))`):

```json
// Input (zodToJsonSchema output)
{
  "allOf": [
    { "anyOf": [
        { "type": "object", "properties": { "target_mode": { "type": "string", "const": "specific" }, "vault": ..., "file": ..., "path": ... }, "required": ["target_mode", "vault"], "additionalProperties": true },
        { "type": "object", "properties": { "target_mode": { "type": "string", "const": "active" } }, "required": ["target_mode"], "additionalProperties": true }
      ] },
    { "type": "object", "properties": { "note_text": { "type": "string" } }, "required": ["note_text"] }
  ],
  "$schema": "http://json-schema.org/draft-07/schema#"
}

// After widening
{
  "type": "object",
  "additionalProperties": true,
  "properties": {
    "target_mode": { "type": "string" },
    "vault": {},
    "file": {},
    "path": {},
    "note_text": {}
  },
  "required": ["note_text", "target_mode"],
  "oneOf": [
    { "properties": { "target_mode": { "type": "string", "const": "specific" }, "vault": ..., "file": ..., "path": ... }, "required": ["target_mode", "vault"], "additionalProperties": true },
    { "properties": { "target_mode": { "type": "string", "const": "active" } }, "required": ["target_mode"], "additionalProperties": true }
  ],
  "allOf": [
    { "type": "object", "properties": { "note_text": { "type": "string" } }, "required": ["note_text"] }
  ],
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

This shape gives:

- **Strict-naive clients** the five property names (`target_mode`, `vault`, `file`, `path`, `note_text`) at top level + the two cross-cutting required keys (`target_mode`, `note_text`).
- **Strict-rich clients** the discriminator-checked `oneOf` AND the `note_text`-required `allOf` arm, exactly the runtime behaviour.

---

## 5. Per-tool invariant case-table (drift detector — R7)

**Driver** (`describe.each`-style or equivalent in vitest):

```typescript
type ToolInvariant = {
  type: "object";
  // strict-naive readable properties (case 1: superset; case 2: equality)
  properties_includes?: ReadonlyArray<string>;
  properties_equals_set?: ReadonlyArray<string>;
  required_includes?: ReadonlyArray<string>;
  required_equals?: ReadonlyArray<string>;
  // toplevel additionalProperties (default: skip the assertion)
  additionalProperties?: true | false;
};

const invariants: Readonly<Record<string, ToolInvariant>> = {
  read_note: {
    type: "object",
    properties_includes: ["target_mode", "vault", "file", "path"],
    required_includes: ["target_mode"],
    additionalProperties: true,
  },
  obsidian_exec: {
    type: "object",
    properties_equals_set: ["command", "vault", "parameters", "flags", "copy", "timeoutMs"],
    required_equals: ["command"],
    additionalProperties: false,
  },
  help: {
    type: "object",
    properties_includes: ["tool_name"],
    // no `required` invariant — help's runtime schema permits zero-arg or with-arg invocation
  },
};
```

**Coverage rule**: every entry in the live registry from `createServer({ registerSignalHandlers: false })` MUST appear in `invariants`. A tool whose entry is missing fails the test with the message *"Tool '${name}' has no invariant entry — add one to specs/009-fix-inputschema-publication/data-model.md §5 and to src/tools/_register.test.ts"*. This forces every future typed tool to declare its published-shape contract in this file when it lands.

**Per-invariant assertions** (run for each tool):

- `descriptor.inputSchema.type === invariant.type`
- If `properties_includes`: `expect(Object.keys(descriptor.inputSchema.properties ?? {})).toEqual(expect.arrayContaining(invariant.properties_includes))`
- If `properties_equals_set`: `expect(new Set(Object.keys(descriptor.inputSchema.properties ?? {}))).toEqual(new Set(invariant.properties_equals_set))`
- If `required_includes`: `expect(descriptor.inputSchema.required).toEqual(expect.arrayContaining(invariant.required_includes))`
- If `required_equals`: `expect(descriptor.inputSchema.required).toEqual(invariant.required_equals)`
- If `additionalProperties`: `expect(descriptor.inputSchema.additionalProperties).toBe(invariant.additionalProperties)`

**Two layers** (R7 + R8):

- **Unit layer**: assertions on `tool.descriptor.inputSchema` directly from the registry.
- **Integration layer**: same assertions on `client.listTools()`'s `tool.inputSchema` after a full `InMemoryTransport` round-trip. Catches future MCP SDK changes that might transform the published shape.

---

## 6. Test-coverage map

| Source change | Co-located test | Cases covered |
|---|---|---|
| `src/tools/_shared.ts` wrap-branch widening (~60 new LOC) | `src/tools/_shared.test.ts` | 4 new cases (R12): simple union, ZodEffects union, Pattern (a) intersection, no-op branch regression guard |
| Drift-detector contract (R7 / FR-006 / FR-007 / FR-008) | `src/tools/_register.test.ts` (NEW) | 1 parameterised case-set over the registry × 5 assertions per tool, plus 1 integration round-trip case |
| `src/target-mode/target-mode.ts` | (UNCHANGED) | The 31 existing cases pass without modification (FR-004 / SC-005) |
| `package.json` version bump | (none — manifest, not a public surface) | — |
| `CHANGELOG.md` 0.2.1 entry | (none — docs, not a public surface) | — |

---

## 7. Out-of-scope shapes (deliberately not addressed)

- **Top-level `oneOf` of un-discriminated objects** (e.g. `z.union([z.object({...}), z.object({...})])` with no shared discriminator literal). Today's helper handles it via the existing `oneOf` / `anyOf` branch; the R2 widening will compute a top-level `properties` union for it. No tool today uses this shape; the widening's behaviour for it is therefore additive but untested in this feature. A future tool that adopts un-discriminated unions MUST add a per-tool invariant entry to §5.
- **Recursive `oneOf` inside branches** (a branch is itself a `oneOf`). Empirically `zodToJsonSchema` does not produce this for any Pattern (a) / Pattern (b) / re-export shape; deferred until a future tool needs it.
- **JSON Schema 2020-12 keywords** (`prefixItems`, `unevaluatedProperties`, etc.). The MCP spec uses Draft 7-shaped `Tool.inputSchema`; `zod-to-json-schema` defaults to Draft 7; we don't emit 2020-12 keywords.

These shapes are NOT in the spec's FR roster and have no tool consumers today; the plan does not handle them. A future spec (010+) will pick them up if a tool consumer arrives.
