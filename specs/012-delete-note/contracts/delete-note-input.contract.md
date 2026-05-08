# Contract — `delete_note` Input Schema

**Feature**: [012-delete-note](../spec.md)
**Date**: 2026-05-08
**Stability**: pre-1.0 internal API. The schema, JSON Schema emit shape, and field semantics MAY change in future releases until the project ships v1.0.0. Within the post-010 contract regime, the schema follows the post-010 flat-encoding shape (single top-level object, `additionalProperties: false`, properties inline, no `oneOf` envelope) verifiable via the consolidated drift detector.

This document is the public input contract for the `delete_note` MCP tool. It is the source of truth for the JSON Schema shape MCP clients will see in `tools/list` and the runtime parse contract the bridge enforces.

---

## Source of truth: `deleteNoteInputSchema`

The zod schema at `src/tools/delete_note/schema.ts` is the single source of truth (Constitution Principle III). Everything below derives from it via `zod-to-json-schema` and the project's `stripSchemaDescriptions` helper.

```ts
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";
import { z } from "zod";

export const deleteNoteInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    permanent: z.boolean().optional().default(false),
  }),
);
```

**Note the absence of a `.superRefine(...)` chain.** Unlike `write_note`, `delete_note` has no tool-specific active-mode refinement — `permanent` has well-defined semantics in both modes (per [research.md R6](../research.md)). The target-mode primitive's existing rules are the entire input contract.

---

## Emitted JSON Schema (the wire shape MCP clients see)

After `zodToJsonSchema(deleteNoteInputSchema)` and `stripSchemaDescriptions(...)`, the descriptor's `inputSchema` is:

```json
{
  "type": "object",
  "properties": {
    "target_mode": { "type": "string", "enum": ["specific", "active"] },
    "vault": { "type": "string", "minLength": 1 },
    "file": { "type": "string" },
    "path": { "type": "string" },
    "permanent": { "type": "boolean", "default": false }
  },
  "required": ["target_mode"],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

(Exact key ordering and the `$schema` URL depend on `zod-to-json-schema`'s output; the consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) walks every registered tool and asserts the structural invariants — top-level `type: "object"`, `additionalProperties: false`, no `oneOf` envelope, no `description` keys at any depth.)

### Departures from a naive flat schema

- **`vault` is in `properties` but NOT in `required`**. The conditional "required in specific mode, forbidden in active mode" rule is enforced at runtime via `applyTargetModeRefinement`'s `superRefine`, NOT in the JSON Schema's `required` array. This is the canonical post-010 trade-off (per the [drift-detector contract](../../010-flatten-target-mode/contracts/flat-target-mode.contract.md) — the flat shape is more permissive on paper than the runtime contract; the runtime is the authoritative gate).
- **No `description` keys at any depth**. The strip utility at [src/help/strip-schema.ts](../../src/help/strip-schema.ts) removes them all (per ADR-005). Parameter documentation lives in `docs/tools/delete_note.md` and is reachable via `help({ tool_name: "delete_note" })`.
- **No `oneOf` / `anyOf` envelope**. The post-010 flat encoding emits a single top-level object schema, not a union. The discriminated branches (`specific` vs `active`) are runtime-only; clients see one schema with `target_mode` as a regular enum field.

---

## Per-mode field policy (runtime, post-`superRefine`)

The post-`applyTargetModeRefinement` schema enforces:

| Field | Specific Mode | Active Mode | Default |
|-------|---------------|-------------|---------|
| `target_mode` | required (`"specific"`) | required (`"active"`) | none |
| `vault` | REQUIRED | FORBIDDEN | n/a |
| `file` | OPTIONAL (XOR with `path`) | FORBIDDEN | undefined |
| `path` | OPTIONAL (XOR with `file`) | FORBIDDEN | undefined |
| `permanent` | OPTIONAL | OPTIONAL | `false` (post-parse coercion) |
| (any other key) | UNRECOGNIZED → `unrecognized_keys` issue | UNRECOGNIZED → `unrecognized_keys` issue | n/a |

`permanent` is the single tool-specific field. Its default-false coercion guarantees `parsed.permanent` is always a boolean (never `undefined`) after parse — the handler relies on this guarantee.

---

## Failure modes (parse-time)

A `safeParse` failure produces a `ZodError` whose `issues[]` array describes what's wrong. `registerTool`'s outer wrap converts this to a `VALIDATION_ERROR` MCP error response with `details.issues` populated.

| Scenario | `issues[].path` | `issues[].code` |
|----------|----------------|-----------------|
| `target_mode === "specific"` with neither `file` nor `path` | `[]` | `custom` |
| `target_mode === "specific"` with both `file` AND `path` | `["file"]`, `["path"]` (two issues) | `custom` |
| `target_mode === "specific"` without `vault` | `["vault"]` | `invalid_type` (or `custom`) |
| `target_mode === "active"` with `vault` | `["vault"]` | `custom` |
| `target_mode === "active"` with `file` | `["file"]` | `custom` |
| `target_mode === "active"` with `path` | `["path"]` | `custom` |
| Unknown top-level key (e.g., `pancakes`) | `["pancakes"]` | `unrecognized_keys` |
| `target_mode` is `"unknown"` or absent | `["target_mode"]` | `invalid_enum_value` or `invalid_type` |
| `permanent` is a non-boolean (e.g., `"true"` string) | `["permanent"]` | `invalid_type` |

Each violation surfaces as its own `details.issues[]` entry. Multiple violations in one input produce multiple issues in one parse failure (no fail-fast).

---

## Versioning & stability

- **Pre-1.0 internal API**: this schema may change without notice until the project ships v1.0.0. Field additions, removals, type changes, and per-mode rule changes are all allowed. Downstream consumers must pin a specific version of `obsidian-cli-mcp` to avoid silent drift.
- **Post-010 flat encoding contract**: while pre-1.0, the schema's emitted JSON Schema MUST conform to the post-010 flat shape (single top-level object, `additionalProperties: false`, properties inline, no `oneOf` envelope, no `description` keys at any depth). The consolidated drift detector enforces this on every registered tool.
- **No new error codes** (Constitution Principle IV): the schema's parse-time failures all surface as `VALIDATION_ERROR` (the `registerTool` outer wrap). This is a stable contract; new codes require a constitution amendment per [005-help-tool](../../005-help-tool/spec.md)'s precedent.

---

## Cross-references

- [spec.md](../spec.md) — FRs that drive this contract (FR-002, FR-003, FR-005, FR-006)
- [data-model.md](../data-model.md) — input schema diagram, per-mode field policy, JSON Schema emit shape
- [research.md](../research.md) — R3 (locator argv keys match schema fields, no rename), R6 (no active-mode `superRefine`)
- [delete-note-handler.contract.md](./delete-note-handler.contract.md) — handler invariants that consume the parsed input
- [011-write-note/contracts/write-note-input.contract.md](../../011-write-note/contracts/write-note-input.contract.md) — sibling artifact this one mirrors (with the three active-mode `superRefine` clauses removed)
