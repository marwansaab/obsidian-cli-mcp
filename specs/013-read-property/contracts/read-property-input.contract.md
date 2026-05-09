# Contract — `read_property` Input Schema

**Feature**: [013-read-property](../spec.md)
**Date**: 2026-05-09
**Stability**: pre-1.0 internal API. The schema, JSON Schema emit shape, and field semantics MAY change in future releases until v1.0.0. Within the post-010 contract regime, the schema follows the post-010 flat-encoding shape (single top-level object, `additionalProperties: false`, properties inline, no `oneOf` envelope) verifiable via the consolidated drift detector.

This document is the public input contract for the `read_property` MCP tool. It is the source of truth for the JSON Schema shape MCP clients see in `tools/list` and the runtime parse contract the bridge enforces.

---

## Source of truth: `readPropertyInputSchema`

The zod schema at `src/tools/read_property/schema.ts` is the single source of truth (Constitution Principle III). Everything below derives from it via `zod-to-json-schema` and the project's `stripSchemaDescriptions` helper.

```ts
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";
import { z } from "zod";

export const readPropertyInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    name: z.string().min(1),
  }),
);
```

**Note the absence of a `.superRefine(...)` chain beyond the target-mode primitive's** — same posture as `delete_note`. The `name` field has well-defined semantics in both modes; no tool-specific active-mode rules.

---

## Emitted JSON Schema (the wire shape MCP clients see)

After `zodToJsonSchema(readPropertyInputSchema)` and `stripSchemaDescriptions(...)`, the descriptor's `inputSchema` is:

```json
{
  "type": "object",
  "properties": {
    "target_mode": { "type": "string", "enum": ["specific", "active"] },
    "vault": { "type": "string", "minLength": 1 },
    "file": { "type": "string" },
    "path": { "type": "string" },
    "name": { "type": "string", "minLength": 1 }
  },
  "required": ["target_mode", "name"],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

(Exact key ordering and the `$schema` URL depend on `zod-to-json-schema`'s output; the consolidated drift detector at [src/tools/_register.test.ts](../../../src/tools/_register.test.ts) walks every registered tool and asserts the structural invariants.)

### Departures from a naive flat schema

- **`vault` is in `properties` but NOT in `required`**. The conditional "required in specific mode, forbidden in active mode" rule is enforced at runtime via `applyTargetModeRefinement`'s `superRefine`, NOT in the JSON Schema's `required` array. The flat shape is more permissive on paper than the runtime contract; the runtime is the authoritative gate.
- **`name` IS in `required`**. Unlike `vault`, `name` is unconditionally required across both modes, so it appears in the JSON Schema's `required` array directly.
- **No `description` keys at any depth**. The strip utility removes them all.
- **No `oneOf` / `anyOf` envelope**. The post-010 flat encoding emits a single top-level object schema.

---

## Per-mode field policy (runtime, post-`superRefine`)

| Field | Specific Mode | Active Mode | Default |
|-------|---------------|-------------|---------|
| `target_mode` | required (`"specific"`) | required (`"active"`) | none |
| `vault` | REQUIRED | FORBIDDEN | n/a |
| `file` | OPTIONAL (XOR with `path`) | FORBIDDEN | undefined |
| `path` | OPTIONAL (XOR with `file`) | FORBIDDEN | undefined |
| `name` | REQUIRED (non-empty) | REQUIRED (non-empty) | n/a |
| (any other key) | UNRECOGNIZED → `unrecognized_keys` issue | UNRECOGNIZED → `unrecognized_keys` issue | n/a |

`name` is the single tool-specific field beyond the target-mode primitive. Its `min(1)` constraint guarantees `parsed.name.length >= 1` after parse.

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
| Missing `name` | `["name"]` | `invalid_type` |
| `name === ""` | `["name"]` | `too_small` |
| Unknown top-level key (e.g., `pancakes`) | `["pancakes"]` | `unrecognized_keys` |
| `target_mode` is `"unknown"` or absent | `["target_mode"]` | `invalid_enum_value` or `invalid_type` |

Each violation surfaces as its own `details.issues[]` entry. Multiple violations in one input produce multiple issues in one parse failure (no fail-fast).

---

## `name` field semantics (FR-018, FR-019)

The `name` field is caller-supplied and passed through to the wrapper's frontmatter-extraction logic verbatim. The wrapper does NOT:
- Sanitise the name.
- Escape characters.
- Rewrite YAML reserved words.
- Trim whitespace.

The wrapper extracts the property by name client-side using `Object.prototype.hasOwnProperty.call(parsedJson, input.name)` and `parsedJson[input.name]`. The CLI is invoked with no `name=` argv parameter — the wrapper's name handling is post-CLI-response, not part of the CLI invocation.

**Argv structural anti-injection guarantee**: `name` is never interpolated into a shell-evaluated string. The CLI invocation does not include `name=` because the wrapper post-filters client-side. Even if a hypothetical future implementation passed `name=` to the CLI, the cli-adapter's argv-array passing (per [src/cli-adapter/_dispatch.ts:50-58](../../../src/cli-adapter/_dispatch.ts#L50-L58)) prevents shell-metacharacter and command-injection attacks structurally.

---

## Versioning & stability

- **Pre-1.0 internal API**: this schema may change without notice until the project ships v1.0.0. Field additions, removals, type changes, and per-mode rule changes are all allowed. Downstream consumers must pin a specific version of `obsidian-cli-mcp` to avoid silent drift.
- **Post-010 flat encoding contract**: while pre-1.0, the schema's emitted JSON Schema MUST conform to the post-010 flat shape. The consolidated drift detector enforces this on every registered tool.
- **No new error codes** (Constitution Principle IV): the schema's parse-time failures all surface as `VALIDATION_ERROR`. New codes require a constitution amendment.

---

## Cross-references

- [spec.md](../spec.md) — FRs that drive this contract (FR-002, FR-003, FR-004, FR-005, FR-006)
- [data-model.md](../data-model.md) — input schema diagram, per-mode field policy, JSON Schema emit shape
- [research.md](../research.md) — R3 (two-call architecture rationale), R11 (locator argv direct map)
- [read-property-handler.contract.md](./read-property-handler.contract.md) — handler invariants that consume the parsed input
- [012-delete-note/contracts/delete-note-input.contract.md](../../012-delete-note/contracts/delete-note-input.contract.md) — sibling artifact this one mirrors (with `name` substituted for `permanent`)
