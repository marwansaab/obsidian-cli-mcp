# Phase 1 Data Model: Tech Stack Upgrade

**Feature**: `067-upgrade-tech-stack` | **Date**: 2026-07-04

This BI adds no domain entities. The "data model" is the set of externally observable
invariant shapes the upgrade must hold fixed, plus the one new internal shape (the
normalizer) that holds them fixed.

## Invariant 1 — Published tool descriptor (per tool, 34 today)

The MCP `inputSchema` served in `tools/list`. Canonical key surface (census across all
34 published schemas — closed set):

```
type, minLength, additionalProperties, properties, $schema, required, enum, default,
maxLength, maximum, minimum, description, items, anyOf, pattern, exclusiveMinimum
```

- `$schema` is ALWAYS `"http://json-schema.org/draft-07/schema#"` (inside hashed
  bytes — clarify-Q1 correction).
- No `oneOf`, `const`, `allOf`, `not`, or `propertyNames` is published today; the
  normalizer must keep it that way.
- **Identity**: `sha256(canonicalJSON(inputSchema))` per tool, recorded in
  `src/tools/_register-baseline.json` (`schemaVersion`, `tools[]` with
  `schemaFingerprint`). `canonicalJSON` sorts object keys; array element order is
  significant (required/enum/anyOf orders must match).
- **Lifecycle rule (FR-009)**: the baseline file is read-only for this BI. It gates
  the migration; it is never regenerated to match it.

## Invariant 2 — Validation error envelope

Produced by `registerTool`'s catch of `ZodError` in `src/tools/_register.ts`:

```
{ path: (string|number)[], message: string, code: string }  // per issue
```

- `code` values observed: `invalid_type`, `custom`, `unrecognized_keys`, etc. —
  unchanged across v3→v4 for every repo pattern (probe-proven).
- **Sub-discrimination (ADR-015)**: custom issues carry `params: { code: MACHINE_CODE,
  reason, … }` — machine codes (e.g. `INVALID_HEADING_PATH`, `INVALID_BASE_PATH`)
  survive v4 verbatim; `customIssueParams` test helpers are the consumers.
- **Accepted drift**: `message` text on fields WITHOUT custom errors rewords under v4
  locale (documented; no test asserts these strings).

## Invariant 3 — Dependency manifest floors (FR-012)

| Field | Value after BI | Why it is the floor |
|---|---|---|
| `dependencies.zod` | `^4.4.3` | probe suite verified at exactly 4.4.3; emission details churn across 4.x minors |
| `dependencies.@modelcontextprotocol/sdk` | `^1.29.0` | zod-4 peer support began 1.23.0; 1.29.0 is what parity was proven against |
| `devDependencies.typescript` | `~6.0.3` | typescript-eslint peer cap `<6.1.0` — tilde prevents auto-breach |
| `devDependencies.prettier` | `3.8.5` (exact) | 3.9-line regression hold (#19510 open) |
| `devDependencies.vitest` = `@vitest/coverage-v8` | `^4.1.9` both | coverage-v8 peer-pins vitest exactly — lockstep required |
| `engines.node` | `>=22.11` (unchanged) | constitution amendment trigger not pulled; dev-only ≥22.13 documented in prose |

## New internal shape — descriptor normalizer (US4)

`normalizeToDraft7Parity(schema: JsonSchemaObject): JsonSchemaObject` (name final at
implement time), private to `src/tools/_shared.ts`, applied inside `toMcpInputSchema`
after `z.toJSONSchema(schema, { io: "input", target: "draft-7" })`.

Recursive post-order walk; four rules (full semantics in
[contracts/descriptor-parity.contract.md](contracts/descriptor-parity.contract.md)):

| # | Match | Action | Load-bearing today |
|---|---|---|---|
| 1 | `propertyNames` deep-equals `{"type":"string"}` | delete it | obsidian_exec.parameters |
| 1b | else `additionalProperties` === `{}` | set to `true` | (future looseObject publishes) |
| 2 | `anyOf` where every branch is bare `{type: primitive}`, node has no own `type` | collapse to `type: [...]`, branch order preserved | obsidian_exec, find_by_property |
| 3 | integer node with `maximum === 9007199254740991` / `minimum === -9007199254740991` | delete the bound(s) | paths.depth |
| 4 | `oneOf` key present | rename to `anyOf` | (future discriminated-union publishes) |

Rule ordering: 1 before 1b (propertyNames marker disambiguates record-of-unknown from
looseObject). State transitions: none — pure function, no caching.

**Test obligations (Principle II)**: one unit test per rule (fires) + one boundary per
rule (does NOT fire: mixed union stays anyOf; hand-bounded int keeps `.max`; checked
record keys keep propertyNames; record-of-unknown keeps `additionalProperties: {}`),
co-located in `src/tools/_shared.test.ts`; the FR-018 fingerprint baseline test is the
integration gate across all 34 real descriptors.
