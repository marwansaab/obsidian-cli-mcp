# Contract — `write_property` input

Public input contract for the `write_property` MCP tool. Sourced from spec.md FR-001 through FR-010 and locked at plan stage. The zod schema in [src/tools/write_property/schema.ts](../../../src/tools/write_property/schema.ts) is the single source of truth per Constitution Principle III.

## Schema (zod, post-010 flat-extension idiom)

```typescript
applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    name: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
    type: z.enum(["text", "list", "number", "checkbox", "date", "datetime"]).optional(),
  }),
)
```

`targetModeBaseSchema` is `.strict()` — unknown top-level keys are rejected.

## Emitted JSON Schema shape (published via `inputSchema`)

The MCP server publishes the schema via `registerTool`'s `inputSchema` field, which derives from `toMcpInputSchema(writePropertyInputSchema)` and then `stripSchemaDescriptions(...)` per ADR-005. The emitted shape:

```json
{
  "type": "object",
  "properties": {
    "target_mode": { "type": "string", "enum": ["specific", "active"] },
    "vault": { "type": "string", "minLength": 1 },
    "file": { "type": "string" },
    "path": { "type": "string" },
    "name": { "type": "string", "minLength": 1 },
    "value": {
      "anyOf": [
        { "type": "string" },
        { "type": "number" },
        { "type": "boolean" },
        { "type": "array", "items": { "type": "string" } }
      ]
    },
    "type": {
      "type": "string",
      "enum": ["text", "list", "number", "checkbox", "date", "datetime"]
    }
  },
  "required": ["target_mode", "name", "value"],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

`target_mode`-specific rules (vault/file/path requirements) live in the `superRefine` clause and are NOT visible in the published JSON Schema. They are enforced server-side at zod's `.parse()` step; the JSON Schema layer (which strict MCP clients consume to validate inputs) intentionally permits the cross-field shape and lets the server reject ambiguous inputs.

## Field-by-field contract

| Field | Type | Required in specific | Required in active | Forbidden in active |
|---|---|---|---|---|
| `target_mode` | `"specific" \| "active"` | yes | yes | — |
| `vault` | `string` (non-empty) | yes | — | yes |
| `file` | `string` | exactly one of file/path | — | yes |
| `path` | `string` | exactly one of file/path | — | yes |
| `name` | `string` (non-empty) | yes | yes | — |
| `value` | `string \| number \| boolean \| string[]` | yes | yes | — |
| `type` | `"text" \| "list" \| "number" \| "checkbox" \| "date" \| "datetime"` | optional | optional | — |

### `name`

- MUST be a non-empty string (FR-005).
- Passed through to the underlying CLI verbatim (FR-019) — no wrapper-side sanitisation.
- Special characters (`.`, `-`, `:`, etc.) are accepted at the validation boundary; downstream rejection (if any) by Obsidian's YAML parser surfaces as `CLI_REPORTED_ERROR`.

### `value`

- MUST be one of: `string`, `number`, `boolean`, `string[]` (FR-006).
- **Excluded shapes**: `null`, `undefined`, objects/records, arrays with non-string elements, heterogeneous arrays. All rejected at the zod parse boundary with `VALIDATION_ERROR`.
- The empty array `[]` IS admitted and triggers the FR-018 empty-YAML-list path.
- String elements in arrays containing literal `,` characters are a **documented limitation** — the CLI wire format is comma-separated, so the on-disk YAML will contain split elements. Caller deferral path: `obsidian_exec`.

### `type`

- Optional. When omitted, the type is INFERRED from the JavaScript shape of `value` per FR-008:

  | `typeof value` | Inferred type |
  |---|---|
  | `boolean` | `"checkbox"` |
  | `number` | `"number"` |
  | `Array.isArray(value)` | `"list"` |
  | `string` | `"text"` |

- Date / datetime ARE NOT inferable (FR-009). A string value like `"2026-12-31"` is inferred as `"text"` unless `type: "date"` is supplied.
- When `type` is provided AND the value's shape contradicts it (e.g. `value: "abc"` with `type: "number"`), the CLI rejects at its own layer with `Error: Invalid <type>: <value>`; the dispatch-layer classifier maps to `CLI_REPORTED_ERROR` (FR-012, R6).

## Six worked examples (one per YAML type)

**A. Text** — specific mode, value-inferred-as-text:
```json
{ "target_mode": "specific", "vault": "Demo", "path": "notes/x.md", "name": "status", "value": "shipped" }
```

**B. Number** — specific mode, value-inferred-as-number:
```json
{ "target_mode": "specific", "vault": "Demo", "path": "notes/x.md", "name": "count", "value": 7 }
```

**C. Boolean** — specific mode, value-inferred-as-checkbox:
```json
{ "target_mode": "specific", "vault": "Demo", "path": "notes/x.md", "name": "archived", "value": true }
```

**D. List** — specific mode, value-inferred-as-list:
```json
{ "target_mode": "specific", "vault": "Demo", "path": "notes/x.md", "name": "tags", "value": ["alpha", "beta"] }
```

**E. Date** — specific mode, explicit type required:
```json
{ "target_mode": "specific", "vault": "Demo", "path": "notes/x.md", "name": "due", "value": "2026-12-31", "type": "date" }
```

**F. Datetime** — active mode, explicit type required:
```json
{ "target_mode": "active", "name": "updated", "value": "2026-05-10T14:30:00", "type": "datetime" }
```

## Validation failure roster

| Failure shape | Error code |
|---|---|
| `target_mode` missing or not in enum | `VALIDATION_ERROR` |
| Specific mode, missing `vault` | `VALIDATION_ERROR` |
| Specific mode, missing both `file` and `path` | `VALIDATION_ERROR` |
| Specific mode, both `file` and `path` set | `VALIDATION_ERROR` |
| Active mode, any of `vault` / `file` / `path` set | `VALIDATION_ERROR` |
| `name` missing or empty | `VALIDATION_ERROR` |
| `value` missing or shape outside the four-shape union | `VALIDATION_ERROR` |
| `type` not in the six-label enum | `VALIDATION_ERROR` |
| Unknown top-level key | `VALIDATION_ERROR` |

## Downstream (post-validation) failure roster

These flow through after a `VALIDATION_ERROR`-free input reaches the handler:

| Failure shape | Error code | Origin |
|---|---|---|
| `obsidian` binary not found | `CLI_BINARY_NOT_FOUND` | cli-adapter |
| Underlying CLI exits non-zero | `CLI_NON_ZERO_EXIT` | cli-adapter |
| CLI exits 0 but stdout begins `Error: ...` | `CLI_REPORTED_ERROR` | dispatch-layer four-priority classifier |
| CLI exits 0, stdout `Vault not found.` | `CLI_REPORTED_ERROR` | 011-R5 inheritance |
| CLI exits 0, stdout `Error: File "..." not found.` (non-existent file) | `CLI_REPORTED_ERROR` | F6 / R6 |
| CLI exits 0, stdout `Error: Invalid <type>: <value>` (type/value contradiction) | `CLI_REPORTED_ERROR` | F4 / R6 |
| Active mode, no focused file | `ERR_NO_ACTIVE_FILE` | eval pre-flight returns `parsed.path === null` |

## Version-stability guarantee

The fields listed in this contract are STABLE under the project's semver policy. Adding a new optional field is a MINOR; removing or renaming an existing field is MAJOR. The `type` enum's six labels are stable; adding a label is MINOR.

## Cross-references

- [spec.md FR-001 .. FR-010](../spec.md) — source FRs.
- [data-model.md — Input schema](../data-model.md) — schema source.
- [research.md R3, R10, R11](../research.md) — argv mapping and value-serialisation rules.
- [.decisions/ADR-003 - Enforce Target Mode in Typed Tools.md](../../../.decisions/) — target-mode discriminator.
- [.decisions/ADR-005 - Token-Optimized Tool Definitions.md](../../../.decisions/) — `stripSchemaDescriptions` published-schema policy.
- [.decisions/ADR-006 - Centralized Tool Registration.md](../../../.decisions/) — `registerTool` factory.
