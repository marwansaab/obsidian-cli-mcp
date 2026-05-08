# Contract — `write_note` Input Schema

**Feature**: [011-write-note](../spec.md)
**Date**: 2026-05-08
**Stability**: pre-1.0 internal API. The schema, JSON Schema emit shape, and field semantics MAY change in future releases until the project ships v1.0.0. Within the post-010 contract regime, the schema follows the post-010 flat-encoding shape (single top-level object, `additionalProperties: false`, properties inline, no `oneOf` envelope) verifiable via the consolidated drift detector.

This document is the public input contract for the `write_note` MCP tool. It is the source of truth for the JSON Schema shape MCP clients will see in `tools/list` and the runtime parse contract the bridge enforces.

---

## Source of truth: `writeNoteInputSchema`

The zod schema at `src/tools/write_note/schema.ts` is the single source of truth (Constitution Principle III). Everything below derives from it via `zod-to-json-schema` and the project's `stripSchemaDescriptions` helper.

```ts
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";
import { z } from "zod";

export const writeNoteInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    content: z.string(),
    template: z.string().optional(),
    overwrite: z.boolean().optional().default(false),
    open: z.boolean().optional(),
  })
).superRefine((input, ctx) => {
  if (input.target_mode !== "active") return;
  if (input.overwrite !== true) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["overwrite"], message: "overwrite must be true in active mode (active mode is destructive by definition; explicit-opt-in posture binds uniformly)" });
  }
  if (input.template !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["template"], message: "template is not allowed in active mode" });
  }
  if (input.open !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["open"], message: "open is not allowed in active mode" });
  }
});
```

---

## Emitted JSON Schema (the wire shape MCP clients see)

After `zodToJsonSchema(writeNoteInputSchema)` and `stripSchemaDescriptions(...)`, the descriptor's `inputSchema` is:

```json
{
  "type": "object",
  "properties": {
    "target_mode": {
      "type": "string",
      "enum": ["specific", "active"]
    },
    "vault": {
      "type": "string",
      "minLength": 1
    },
    "file": {
      "type": "string"
    },
    "path": {
      "type": "string"
    },
    "content": {
      "type": "string"
    },
    "template": {
      "type": "string"
    },
    "overwrite": {
      "type": "boolean",
      "default": false
    },
    "open": {
      "type": "boolean"
    }
  },
  "required": ["target_mode", "content"],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

Notes on the emit:
- The shape is a single flat object (post-010 flat encoding per [010-flatten-target-mode](../../010-flatten-target-mode/contracts/flat-target-mode.contract.md)). No `oneOf` envelope.
- `additionalProperties: false` (inherited from `targetModeBaseSchema.strict()`); unknown top-level keys produce `unrecognized_keys` zod errors at runtime.
- `required: ["target_mode", "content"]` — only the unconditionally-required-in-both-modes fields are listed. `vault` is required-in-specific, but the JSON Schema's `required` array doesn't express conditional-on-discriminator-value logic; the runtime `superRefine` enforces it (Story 6 AC#3). MCP clients that rely on the `required` array (instead of the runtime parse) will accept some inputs the bridge then rejects — this is the post-010 trade-off and is consistent with `read_note`'s post-010 emit.
- `overwrite` carries `"default": false` in the emitted schema (`zod-to-json-schema` propagates `.default()`); MCP clients MAY hide the field or pre-fill `false`. The runtime parse still applies the default, so omitted-in-input always becomes `false` after parse.
- `open` does NOT carry `"default": false` because the schema does NOT have `.default(false)` (per R6 — the active-mode `superRefine` needs to distinguish absent from present-with-false, which `.default(false)` would mask).
- Zero `description` keys at any depth (post-strip per ADR-005).
- Zero `$ref` indirection — all properties typed inline.

The drift detector at [src/tools/_register.test.ts](../../../src/tools/_register.test.ts) verifies this shape automatically via its `it.each` registry walk.

---

## Per-mode field policy

### Specific mode (`target_mode === "specific"`)

| Field | Required? | Type | Constraint |
|---|---|---|---|
| `target_mode` | yes | enum | `"specific"` |
| `vault` | yes | string | `min(1)` (from primitive); enforced by primitive `superRefine` |
| `file` | exactly one of {file, path} | string | enforced by primitive `superRefine` |
| `path` | exactly one of {file, path} | string | enforced by primitive `superRefine` |
| `content` | yes | string | any string including `""` (no `min(1)` floor) |
| `template` | no | string | optional; forwarded verbatim to CLI when present |
| `overwrite` | no (default `false`) | boolean | optional; `.default(false)` applies; emitted as flag only when `true` per FR-007 |
| `open` | no (default `false` via handler) | boolean | optional; handler reads `parsed.open ?? false`; emitted as flag only when `true` |
| any other key | no — REJECTED | (n/a) | `unrecognized_keys` from `.strict()` |

### Active mode (`target_mode === "active"`)

| Field | Required? | Type | Constraint |
|---|---|---|---|
| `target_mode` | yes | enum | `"active"` |
| `vault` | **forbidden** | (n/a) | rejected by primitive `superRefine` if present |
| `file` | **forbidden** | (n/a) | rejected by primitive `superRefine` if present |
| `path` | **forbidden** | (n/a) | rejected by primitive `superRefine` if present |
| `content` | yes | string | any string including `""` |
| `template` | **forbidden** | (n/a) | rejected by write_note `superRefine` (R6 / Clarifications 2026-05-08 Q3) |
| `overwrite` | **must be exactly `true`** | boolean | rejected by write_note `superRefine` if `false` or absent (R6 / Clarifications 2026-05-08 Q1) |
| `open` | **forbidden** | (n/a) | rejected by write_note `superRefine` if present (R6 / Clarifications 2026-05-08 Q3) |
| any other key | no — REJECTED | (n/a) | `unrecognized_keys` from `.strict()` |

---

## Failure mode roster (the propagated `VALIDATION_ERROR` shapes)

| Bad input | `details.issues[]` entry | Story 6 AC | Notes |
|---|---|---|---|
| Specific without `vault` | `{ path: ["vault"], message: "vault is required in specific mode" }` | AC#3 | from primitive |
| Specific without locator | `{ path: [], message: "exactly one of … (got neither)" }` | AC#1 | from primitive |
| Specific with both locators | TWO entries: `["file"]` and `["path"]` | AC#2 | from primitive |
| Active with `vault` | `{ path: ["vault"], message: "vault is not allowed in active mode" }` | AC#4 | from primitive |
| Active with `file` | `{ path: ["file"], message: "file is not allowed in active mode" }` | AC#4 | from primitive |
| Active with `path` | `{ path: ["path"], message: "path is not allowed in active mode" }` | AC#4 | from primitive |
| Missing `content` | `{ path: ["content"], code: "invalid_type", received: "undefined" }` | AC#5 | from base |
| Unknown top-level key | `{ code: "unrecognized_keys", keys: [<key>], path: [] }` | AC#6 | from `.strict()` |
| Invalid `target_mode` value | `{ path: ["target_mode"], code: "invalid_enum_value" }` | AC#7 | from base |
| Active without `overwrite: true` | `{ path: ["overwrite"], message: "overwrite must be true in active mode ..." }` | AC#8 | from write_note (R6) |
| Active with `template` | `{ path: ["template"], message: "template is not allowed in active mode" }` | AC#9 | from write_note (R6) |
| Active with `open` (true OR false) | `{ path: ["open"], message: "open is not allowed in active mode" }` | AC#10 | from write_note (R6) |

All failures surface as `VALIDATION_ERROR` (the project's standard zod-failure code via `registerTool`'s `ZodError → asToolError` wrap). The handler is never invoked; the CLI is never invoked.

---

## Versioning & compatibility

- **Stability**: pre-1.0; the schema MAY change in future minor releases. Breaking changes are disclosed in `CHANGELOG.md` per project convention.
- **Predecessor contracts**: this contract has no predecessor; `write_note` is a new tool.
- **Sibling contracts**: structurally identical to `read_note`'s input shape (composed via the same `applyTargetModeRefinement(targetModeBaseSchema)` primitive) plus four additional fields (`content`, `template`, `overwrite`, `open`) and three additional active-mode `superRefine` clauses.
- **TypeScript export**: `WriteNoteInput` (via `z.infer<typeof writeNoteInputSchema>`) is internal-only. Not re-exported from `src/index.ts`. Per the post-010 precedent (`TargetMode` not re-exported), no public-API impact.
- **JSON Schema stability**: the emitted `inputSchema` shape (top-level `properties`, `required`, `additionalProperties`) is the contract MCP clients build against. Stability matches the project's overall pre-1.0 posture.
