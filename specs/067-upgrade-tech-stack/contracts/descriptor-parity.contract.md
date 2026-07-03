# Contract: Descriptor Parity Pipeline (`toMcpInputSchema`)

**Feature**: `067-upgrade-tech-stack` (US4) | **Date**: 2026-07-04
**Consumer surfaces**: every MCP client calling `tools/list`; `registerTool()`
(src/tools/_register.ts); help subsystem (src/help/strip-schema.ts); FR-018 fingerprint
baseline test.

## Purpose

Replace the deprecated `zod-to-json-schema` delegate with zod 4's built-in conversion
while keeping every published tool descriptor **byte-identical after canonicalization**
— proven by the committed fingerprint baseline passing unregenerated.

## Signature (unchanged)

```ts
export function toMcpInputSchema(zodSchema: z.ZodType): JsonSchemaObject
```

(Parameter type modernizes from deprecated `ZodTypeAny` to `z.ZodType`; callers
unchanged.)

## Behaviour

1. `raw = z.toJSONSchema(zodSchema, { io: "input", target: "draft-7" })`
   - `io: "input"` — REQUIRED. Default output mode marks `.optional().default()`
     fields as required (probe-proven wrong for descriptors).
   - `target: "draft-7"` — REQUIRED. Emits `$schema:
     "http://json-schema.org/draft-07/schema#"` byte-identical to today's published
     key. Do NOT strip `$schema` — it is inside the hashed baseline bytes (clarify-Q1
     correction, live-dump-proven).
2. Apply the four normalization rules (recursive, post-order, pure):

| Rule | Condition | Action |
|---|---|---|
| N1 | node has `propertyNames` deep-equal `{"type":"string"}` | `delete node.propertyNames` |
| N1b | *else if* `node.additionalProperties` deep-equals `{}` | `node.additionalProperties = true` |
| N2 | `node.anyOf` present, node has no own `type`, and EVERY branch is exactly one key `{type: <primitive-string>}` | replace with `node.type = [branch types in original order]`, delete `anyOf` |
| N3 | `node.type === "integer"` | delete `maximum` iff `=== 9007199254740991`; delete `minimum` iff `=== -9007199254740991` |
| N4 | `node.oneOf` present | rename key to `anyOf` (values untouched) |

**Rule-order constraint**: N1 must be evaluated before N1b on the same node — the
`propertyNames` marker is what distinguishes a v4 record emission (whose
`additionalProperties` sub-schema must be preserved, including legitimate `{}` for
record-of-unknown) from a looseObject emission (whose `{}` must become `true`).

## Invariants (verified by tests)

- All 34 committed `schemaFingerprint` values in `src/tools/_register-baseline.json`
  match post-migration with the baseline file untouched (FR-018 test = the gate).
- Output publishes no `oneOf`, `propertyNames`, or safe-integer sentinel bounds.
- `required` / `enum` / `anyOf` array element ORDER is preserved (canonicalJSON sorts
  object keys only — array order is significant in the hash).
- Pure function: no mutation of the zod schema, no I/O, deterministic.

## Non-goals / guards

- N3 cannot distinguish a hand-authored `.max(9007199254740991)` — none exists in the
  repo; a comment in the normalizer must warn future authors (add a fixture before
  authoring one).
- Shape families absent from the repo (tuples, intersections, `.nullable()`, `z.lazy`,
  pipes/transforms, catch, branded) are unprobed: a BI introducing one MUST add a
  parity fixture before shipping (extend `_shared.test.ts`).
- Emission verified at zod **4.4.3 exactly**; if the zod pin moves, re-run the parity
  fixtures (they live in the test suite precisely so this is cheap).

## Test obligations (Principle II)

- Happy path: representative schema through the full pipeline equals the pre-migration
  `zodToJsonSchema` capture (fixtures from probe A's 22-fixture suite, at minimum one
  per rule plus one untouched-shape control).
- Boundary per rule: N1 leaves checked-key records alone; N1b leaves record-of-unknown
  `additionalProperties: {}` alone; N2 leaves mixed unions as `anyOf`; N3 leaves
  hand-authored explicit bounds; N4 no-op when absent.
- Integration: FR-018 baseline test green, unregenerated.
- help pipeline: `strip-schema.test.ts` fixtures regenerated through the new pipeline
  produce identical stripped-help output.
