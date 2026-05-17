# Input Contract: `backlinks`

**Branch**: `036-get-backlinks`
**Date**: 2026-05-17
**Phase**: 1 (Design — Contracts)

The published MCP `inputSchema` is auto-derived from `backlinksInputSchema` via the project's `toMcpInputSchema` helper. Zod is the single source of truth (Constitution Principle III); this document mirrors the schema for human consumption and documents the seven worked example shapes.

## Schema (zod)

```ts
backlinksInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    with_counts: z.boolean().optional(),
    total: z.boolean().optional(),
    limit: z.number().int().min(1).max(10000).optional(),
  }),
);
```

## Published JSON Schema (emitted via toMcpInputSchema, post strip-descriptions)

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["target_mode"],
  "properties": {
    "target_mode": { "type": "string", "enum": ["specific", "active"] },
    "vault": { "type": "string", "minLength": 1 },
    "file": { "type": "string" },
    "path": { "type": "string" },
    "with_counts": { "type": "boolean" },
    "total": { "type": "boolean" },
    "limit": { "type": "integer", "minimum": 1, "maximum": 10000 }
  }
}
```

The `additionalProperties: false` constraint enforces FR-006 (strict input — unknown top-level keys rejected).

Note: the published JSON Schema does NOT carry the ADR-003 XOR refinement (`specific` mode requires exactly one of `file`/`path`; `active` mode forbids `vault`/`file`/`path`). Those rules are enforced at zod parse time via `applyTargetModeRefinement.superRefine` and surface as `VALIDATION_ERROR` with structured `details.issues`. MCP clients that pre-validate against the JSON Schema alone will accept invalid combinations; the server-side parse catches them.

## Worked examples

### Example A — Specific mode, by-path, default

```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Notes/Target.md"
}
```

Returns: source-note list, no per-source counts.

### Example B — Specific mode, by-basename, default

```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "file": "Target"
}
```

Returns: same source-note list as Example A (path / basename are interchangeable when basename resolves unambiguously).

### Example C — Active mode

```json
{
  "target_mode": "active"
}
```

Returns: focused note's source-note list. Errors with `ERR_NO_ACTIVE_FILE` if no note is focused.

### Example D — Per-source multiplicity

```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Notes/Target.md",
  "with_counts": true
}
```

Returns: source-note list, each entry decorated with `count` (positive integer).

### Example E — Count-only (cap-bypassed per Q1)

```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Notes/Target.md",
  "total": true
}
```

Returns: `{ count: <full pre-cap source count>, backlinks: [] }`. The 1000-source implicit cap (FR-010) is NOT applied in this mode.

### Example F — Capped result

```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Notes/Hub.md",
  "limit": 50
}
```

Returns: at most 50 source-note entries; `truncated: true` if the underlying source set exceeds 50.

### Example G — Capped result with counts

```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Notes/Hub.md",
  "with_counts": true,
  "limit": 50
}
```

Returns: at most 50 entries, each carrying a `count`; `truncated: true` if the underlying source set exceeds 50.

## Field reference

### `target_mode` (required)

- Type: `string`
- Enum: `"specific"` | `"active"`
- Semantics: ADR-003 discriminator. `specific` mode requires a vault + per-file locator; `active` mode operates on the focused note in the focused vault.

### `vault` (specific mode only)

- Type: `string`, non-empty
- Required when `target_mode === "specific"`; forbidden when `target_mode === "active"`.
- Semantics: registered vault display name. Unknown names surface as `CLI_REPORTED_ERROR(VAULT_NOT_FOUND)` via the cli-adapter's 011-R5 clause (eval-cohort).

### `file` (specific mode only, XOR with `path`)

- Type: `string`
- Required in specific mode if `path` not supplied; forbidden if `path` supplied.
- Semantics: vault-root basename (without `.md` extension); resolved via `app.metadataCache.getFirstLinkpathDest` (wikilink resolution).

### `path` (specific mode only, XOR with `file`)

- Type: `string`
- Required in specific mode if `file` not supplied; forbidden if `file` supplied.
- Semantics: vault-relative path (with `.md` extension typically); resolved via direct path lookup.

### `with_counts` (optional, all modes)

- Type: `boolean`
- Default: `false`
- Semantics: when `true`, each per-source entry in `backlinks` is decorated with a `count` integer (≥ 1) reflecting the total number of references from that source. When `false` or omitted, per-source entries carry `source` only.

### `total` (optional, all modes)

- Type: `boolean`
- Default: `false`
- Semantics: when `true`, response carries the count only — `backlinks: []`. Per the 2026-05-17 Q1 clarification, this mode BYPASSES the FR-010 implicit cap and reports the FULL pre-cap source-note count.

### `limit` (optional, all modes)

- Type: `integer`
- Range: `[1, 10000]` (inclusive)
- Default: `1000` (implicit cap)
- Semantics: maximum number of source-note entries in the response `backlinks` array. Only applies when `total: false`. When the underlying source set exceeds this value, the response includes `truncated: true`.

## Validation failure roster

| Failure | Surface |
|---------|---------|
| Missing `target_mode` | `VALIDATION_ERROR` (zod required-field violation) |
| Unknown `target_mode` enum value | `VALIDATION_ERROR` (zod enum violation) |
| Specific mode without `vault` | `VALIDATION_ERROR` (refinement rule: vault required in specific) |
| Specific mode without `file` AND without `path` | `VALIDATION_ERROR` (refinement rule: exactly one required) |
| Specific mode with BOTH `file` AND `path` | `VALIDATION_ERROR` (refinement rule: exactly one — got both) |
| Active mode with `vault` | `VALIDATION_ERROR` (refinement rule: vault forbidden in active) |
| Active mode with `file` | `VALIDATION_ERROR` (refinement rule: file forbidden in active) |
| Active mode with `path` | `VALIDATION_ERROR` (refinement rule: path forbidden in active) |
| `with_counts` non-boolean | `VALIDATION_ERROR` (zod type violation) |
| `total` non-boolean | `VALIDATION_ERROR` (zod type violation) |
| `limit` non-integer / out-of-range (< 1 or > 10000) | `VALIDATION_ERROR` (zod range violation) |
| Unknown top-level key | `VALIDATION_ERROR` (strict additionalProperties violation) |

All validation failures fire BEFORE any underlying CLI invocation (FR-021). Test seam: handler test injects a CLI dispatcher spy; assertion checks the spy was never called for invalid inputs.
