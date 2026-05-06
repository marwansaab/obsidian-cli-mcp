# Contract: `stripSchemaDescriptions` (schema-stripping utility)

**Module**: [src/help/strip-schema.ts](../../../src/help/strip-schema.ts)
**Test**: [src/help/strip-schema.test.ts](../../../src/help/strip-schema.test.ts)
**Spec**: [../spec.md](../spec.md) §Requirements §Component 1
**Plan**: [../plan.md](../plan.md) §Summary §P1 §P2
**Research**: [../research.md](../research.md) §P1 §P2 §"Strip-utility implementation sketch"

## Purpose

A pure, deterministic, side-effect-free function that removes `description` annotations from a JSON Schema document at every depth below the root. Consumed by every MCP tool registration site to satisfy [ADR-005's](../../../.decisions/ADR-005%20-%20Token-Optimized%20Tool%20Definitions%20via%20Progressive%20Disclosure.md) decision #1 (Automated Schema Stripping). The strip preserves all structural validation keys (`type`, `properties`, `required`, `enum`, `anyOf`, `oneOf`, `items`, `$ref`, `additionalProperties`, etc.) so the agent can still construct valid payloads from the published `inputSchema`; only the documentation-bearing `description` keys are removed.

## Interface

### Signature

```ts
export function stripSchemaDescriptions(schema: JsonSchemaObject): JsonSchemaObject;
```

`JsonSchemaObject` is a typed alias narrow enough to capture the relevant `zod-to-json-schema` output but loose enough to admit recursion: an object with optional `type`, `properties`, `items`, `anyOf`, `oneOf`, `additionalProperties`, plus an `unknown` index signature for the long tail of JSON Schema keys (`required`, `enum`, `default`, `minimum`, `pattern`, etc.). The exact alias definition is implementation-internal; the public signature is "JSON Schema in, JSON Schema out, deep copy."

### Inputs

A JSON Schema document produced by `zodToJsonSchema(schema, { $refStrategy: "none" })` (per the project's existing precedent at [src/tools/obsidian_exec/schema.ts:18-20](../../../src/tools/obsidian_exec/schema.ts#L18-L20)). Typical structure:

```json
{
  "type": "object",
  "description": "(root description — preserved by this utility)",
  "properties": {
    "field_a": { "type": "string", "description": "(STRIPPED)" },
    "field_b": {
      "anyOf": [
        { "type": "number", "description": "(STRIPPED)" },
        { "type": "string", "description": "(STRIPPED)" }
      ]
    }
  },
  "required": ["field_a"],
  "additionalProperties": false
}
```

### Output

A deep-copy `JsonSchemaObject` where every `description` field below the root has been removed. The root's `description` (if present) is preserved.

The returned object shares no reference with the input at any depth — `structuredClone` produces an independent object graph (P2).

### Behavioural rules

1. **R1 (FR-002, recursion targets)**: The walker MUST visit and recurse into every: (a) value of every `properties` object; (b) value of `items` (whether a single object or an array of object tuples); (c) every element of `anyOf`; (d) every element of `oneOf`; (e) the value of `additionalProperties` if it is an object (NOT if it is a boolean). Inside each visited object, the walker removes that object's own `description` key (if any) and recurses into the same five constructs that may appear within it.
2. **R2 (FR-003, root preservation)**: The root document's own `description` field (if present) MUST NOT be removed.
3. **R3 (FR-004, structural-key preservation)**: Every key OTHER than `description` MUST be preserved at every nesting level — `type`, `properties`, `required`, `enum`, `anyOf`, `oneOf`, `items`, `$ref`, `additionalProperties`, `default`, `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `format`, `title`, `examples`, and any other present key. The strip is keyed on field name, not on value type.
4. **R4 (FR-005a, no mutation)**: The input object MUST be deep-equal to its pre-call state after the function returns. Verifiable by snapshotting the input pre-call and comparing post-call.
5. **R5 (FR-005b–d, purity)**: The function MUST NOT (a) read or write the filesystem, (b) read or write the network, (c) emit log lines, (d) reference any module-level mutable state. The function's behavior depends ONLY on its argument.
6. **R6 (idempotence)**: `stripSchemaDescriptions(stripSchemaDescriptions(s))` MUST produce a result structurally equal to `stripSchemaDescriptions(s)`. (Non-binding — implied by R1–R3 — but useful as a confirmatory test.)
7. **R7 (non-string `description` values)**: If the input contains a `description` field whose value is not a string (e.g., `description: { foo: "bar" }` — a malformed JSON Schema), the field is removed regardless of value type. The strip is keyed on the field name, not on the value's type.

### Out of scope

- The walker does NOT visit `definitions` / `$defs` / `$ref` targets. The project invokes `zodToJsonSchema` with `$refStrategy: "none"` so refs do not appear; this is a documented assumption of the contract. If a future schema needs `$ref`, the walker is extended in a separate BI without breaking this contract.
- The walker does NOT remove `title`, `examples`, or any other documentation-adjacent JSON Schema key — only `description`. Broader stripping would require a new contract.
- The walker is NOT generic over arbitrary object trees — it knows JSON Schema's structure and visits only the documented constructs. Passing a non-JSON-Schema object would still produce a deep copy but the walker may not visit every nested object.

## Test requirements (FR-017 strip-utility minimum)

The co-located test file MUST exercise at least these cases (per the [data-model test coverage map](../data-model.md#test-coverage-map) and [research.md test count summary](../research.md#test-count-summary)):

| ID | Case | Story / FR / Edge Case |
|----|------|------------------------|
| 1 | Flat schema strip — two `.describe()` annotations on top-level properties; verify both removed; verify `type`/`required` intact | Story 1 AC#1, FR-002 |
| 2 | Nested schema strip — discriminated union (`oneOf`) with branches containing `z.array(z.object({...}))` with `.describe()` on inner properties; verify ALL descriptions at all depths removed | Story 1 AC#2, FR-002, FR-004 |
| 3 | No-descriptions input — schema with zero `.describe()` annotations; verify output is structurally equivalent to input | Story 1 AC#3 |
| 4 | Mutation safety — snapshot input pre-call (deep clone); call utility; verify input deep-equals snapshot | Story 1 AC#4, FR-005, SC-004 |
| 5 (recommended) | Structural-key preservation — schema with `enum`, `anyOf`/`oneOf`, `items`, `additionalProperties`, `pattern`, `default`; verify ALL preserved | Story 1 AC#6, FR-004 |
| 6 (recommended) | Non-string `description` value — `description: { foo: "bar" }` at a nested property; verify it is still removed | Edge Case "non-string description value", FR-002 |

All six cases use plain zod schemas constructed inline, fed through `zodToJsonSchema(...)`, then passed to the utility. No filesystem, no network — pure unit tests.

## Module header

Per Constitution Principle V (FR-018), the source file MUST carry:

```ts
// Original — no upstream. Pure function: deep-copy a JSON Schema and remove every `description` field below the root.
```

The test file MUST carry an analogous header.

## Consumers (post-this-BI)

- [src/tools/obsidian_exec/tool.ts](../../../src/tools/obsidian_exec/tool.ts) — wraps `obsidianExecInputJsonSchema` through this utility before passing to the SDK.
- [src/tools/help/tool.ts](../../../src/tools/help/tool.ts) — wraps `helpInputJsonSchema` through this utility before passing to the SDK.
- Every future typed-tool BI (BI-003 through BI-025) — same pattern at its own `tool.ts`.
