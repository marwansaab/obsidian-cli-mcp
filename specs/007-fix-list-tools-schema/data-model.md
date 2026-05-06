# Phase 1: Data Model — Fix `tools/list` Schema Validation

**Feature**: 007-fix-list-tools-schema
**Date**: 2026-05-06

This feature has **no domain entities** (no users, no records, no persistent state, no lifecycle transitions). The "data" in scope is the structural shape of the **published MCP tool descriptor**'s `inputSchema` field — a JSON Schema object that flows from the in-process tool registry to MCP clients via `tools/list`.

This document records the schema-shape transformations the fix introduces. The runtime zod schemas (`targetModeSchema`, the `read_note` runtime validator) are FROZEN by FR-003 / FR-004 and are not re-described here — see [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) and [specs/004-target-mode-schema/data-model.md](../004-target-mode-schema/data-model.md) for those.

---

## Shape 1 — `targetModeJsonSchema` (NEW companion export)

**Location**: [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) — new export added next to `targetModeSchema`.

**Source**: `toMcpInputSchema(targetModeSchema)` (the helper from Shape 2).

**Resulting JSON Schema**:

```jsonc
{
  "type": "object",
  "additionalProperties": true,
  "oneOf": [
    {
      "properties": {
        "target_mode": { "type": "string", "const": "specific" },
        "vault":       { "type": "string", "minLength": 1 },
        "file":        { "type": "string" },
        "path":        { "type": "string" }
      },
      "required": ["target_mode", "vault"],
      "additionalProperties": true
    },
    {
      "properties": {
        "target_mode": { "type": "string", "const": "active" }
      },
      "required": ["target_mode"],
      "additionalProperties": true
    }
  ],
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

**Notes**:
- Top-level `"type": "object"` is mandatory per FR-002 — this is the field whose absence broke 0.1.6.
- Top-level `oneOf` (not `anyOf`) per P2 in [research.md](research.md). The branch sub-schemas are produced by `zodToJsonSchema(targetModeSchema, { $refStrategy: "none" })` and have their inner `"type": "object"` stripped (the outer one suffices) to keep the descriptor minimal.
- The XOR-between-`file`-and-`path` rule is **deliberately absent** from the published descriptor per Clarifications 2026-05-06 Q1 — runtime is authoritative.
- The forbidden-keys-in-active rule is also absent for the same reason.
- `additionalProperties: true` mirrors the runtime `passthrough()` behaviour per P3 in [research.md](research.md).

---

## Shape 2 — `toMcpInputSchema(zodSchema)` helper output (NEW utility)

**Location**: [src/tools/_shared.ts](../../src/tools/_shared.ts) — new export.

**Signature**:

```ts
export function toMcpInputSchema(zodSchema: ZodTypeAny): JsonSchemaObject;
```

where:

```ts
export interface JsonSchemaObject {
  type: "object";
  [key: string]: unknown;
}
```

**Behaviour table**:

| Input zod kind                                | `zodToJsonSchema` raw output (top-level keys)              | Helper output                                                                                                            |
|-----------------------------------------------|------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------|
| `z.object({...})`                             | `{ type: "object", properties, required, ... }`            | Returned **verbatim** (already an object schema).                                                                        |
| `z.discriminatedUnion(...).superRefine(...)`  | `{ anyOf: [<branch1>, <branch2>], $schema }`               | `{ type: "object", additionalProperties: true, oneOf: [<branch1 sans inner type>, <branch2 sans inner type>], $schema }` |
| `z.union([...])`                              | `{ anyOf: [...], $schema }`                                | Same envelope shape as discriminated-union case.                                                                         |
| `z.object({...}).passthrough()`               | `{ type: "object", additionalProperties: true, ... }`      | Returned verbatim.                                                                                                       |

**Invariants** (must hold for every input):
- `result.type === "object"` (the binding constraint from FR-002).
- `result` retains every top-level keyword from the raw output that is compatible with an object envelope: `oneOf`, `anyOf`, `allOf`, `$schema`, `description`, `title`. Keywords that conflict with `type: "object"` (e.g., a top-level `enum` of strings) would be a developer-time misuse and produce an unhelpful but well-formed envelope per P4 in [research.md](research.md).
- The helper **never mutates** the raw output — it constructs a new object.
- `anyOf` at the top level is rewritten to `oneOf` per P2; this is the only structural rewrite the helper performs.

---

## Shape 3 — `read_note` published `inputSchema` (MODIFIED)

**Location**: [src/tools/read_note/schema.ts](../../src/tools/read_note/schema.ts).

**Before** (broken in 0.1.6):
```ts
export const readNoteInputJsonSchema = zodToJsonSchema(readNoteInputSchema, {
  $refStrategy: "none",
}) as Record<string, unknown>;
```
→ Produces `{ "anyOf": [...] }` with no top-level `type`. **Fails MCP `tools/list` validation.**

**After**:
```ts
import { targetModeSchema, targetModeJsonSchema, type TargetMode } from "../../target-mode/target-mode.js";
export const readNoteInputSchema = targetModeSchema;
export const readNoteInputJsonSchema = targetModeJsonSchema;
export type ReadNoteInput = TargetMode;
```
→ Inherits `targetModeJsonSchema` (Shape 1). **Passes MCP `tools/list` validation.**

**Notes**:
- The `zodToJsonSchema` import is removed from this file — it is now an implementation detail of the helper, not a per-tool concern.
- `readNoteInputSchema` is unchanged; it still re-exports `targetModeSchema` per BI-003 / spec 006's P1 decision.
- The type alias `ReadNoteInput` is unchanged.
- The downstream reference at [src/tools/read_note/tool.ts:8](../../src/tools/read_note/tool.ts#L8) (`import { readNoteInputSchema, readNoteInputJsonSchema } from "./schema.js"`) continues to work without edit.

---

## Shape 4 — Registry-consistency assertion (NEW invariant)

**Location**: [src/server.test.ts](../../src/server.test.ts), inside the existing `describe("registry consistency", ...)` block.

**Assertion**: For each `tool` in the live `tools/list` response, `tool.inputSchema.type === "object"`.

**Test name**: `every registered tool's inputSchema declares type === "object" at the top level (Story 1 AC#2, FR-002, FR-006, SC-001)`.

**Failure message format**: `Tool '<name>' has inputSchema.type === <actual value>, expected "object"`. Includes the tool name to match the error-path locator in the user's original bug report (`tools[N].inputSchema.type`).

**Coverage**: Picks up every future BI's tool registration automatically (the test iterates over the live registry, not over a hard-coded list). FR-006 is satisfied.

---

## Test-coverage map

| Test body                                                                                                                          | File                                                                                | Type           | Source FR / SC          |
|------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------|----------------|-------------------------|
| `toMcpInputSchema` returns input verbatim for a `z.object({...})`                                                                  | `src/tools/_shared.test.ts` (NEW)                                                   | Happy          | FR-002, P4              |
| `toMcpInputSchema` wraps a discriminated-union in a `{ type: "object", oneOf: [...] }` envelope                                    | `src/tools/_shared.test.ts` (NEW)                                                   | Happy          | FR-002, FR-002a, P2     |
| `toMcpInputSchema` rewrites top-level `anyOf` → `oneOf`                                                                            | `src/tools/_shared.test.ts` (NEW)                                                   | Boundary       | P2                      |
| `toMcpInputSchema` sets top-level `additionalProperties: true`                                                                     | `src/tools/_shared.test.ts` (NEW)                                                   | Boundary       | P3                      |
| `toMcpInputSchema` preserves `$schema` from the raw output                                                                         | `src/tools/_shared.test.ts` (NEW)                                                   | Boundary       | P4                      |
| `toMcpInputSchema` does not mutate its input                                                                                       | `src/tools/_shared.test.ts` (NEW)                                                   | Boundary       | P4                      |
| `asToolError` returns the correct `isError`/`content` envelope                                                                     | `src/tools/_shared.test.ts` (NEW)                                                   | Happy          | Principle II (retroactive) |
| `targetModeJsonSchema` has top-level `type: "object"` AND a two-branch `oneOf`                                                     | `src/target-mode/target-mode.test.ts`                                               | Happy          | FR-002, FR-002a, SC-001 |
| `targetModeJsonSchema`'s branch shapes match the runtime branches' field sets (drift detector)                                     | `src/target-mode/target-mode.test.ts`                                               | Boundary       | Principle III (anti-drift) |
| Every registered tool's `inputSchema.type === "object"` (registry-iterating)                                                       | `src/server.test.ts` (Invariant (c) added to existing block)                        | Happy + future | FR-002, FR-006, SC-001  |
| `readNoteInputJsonSchema` is identity-equal to `targetModeJsonSchema` AND has `type: "object"` (closes M1 from /speckit-analyze)   | `src/tools/read_note/schema.test.ts` (1 NEW test body added by T006)                | Happy          | FR-002, FR-002a, Principle II co-location |
| Existing `read_note` happy/failure tests continue to pass unchanged                                                                | `src/tools/read_note/schema.test.ts`, `handler.test.ts`, `tool.test.ts`             | (already exist) | FR-003, FR-004          |

**No new error codes**, **no new entities**, **no state transitions**. The data model is exhausted by the four shapes above.
