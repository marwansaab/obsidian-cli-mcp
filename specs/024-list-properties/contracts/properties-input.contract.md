# Contract — `properties` input

## Tool registration

- **Name**: `properties`
- **Source dir**: `src/tools/properties/`
- **Factory**: `createPropertiesTool({ logger, queue })`

## Input zod schema

```typescript
import { z } from "zod";

export const propertiesInputSchema = z
  .object({
    vault: z.string().min(1).optional(),
    total: z.boolean().optional(),
  })
  .strict();
```

## Emitted JSON Schema (visible to MCP clients via `tools/list`)

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "vault": { "type": "string", "minLength": 1 },
    "total": { "type": "boolean" }
  }
}
```

(Descriptions are stripped at registration via `stripSchemaDescriptions` per ADR-005.)

## Field policy

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `vault` | non-empty string | no | (focused vault — inherited limitation per R5 / F4) | Silently honoured-as-noop by upstream — parity with `files` / `outline` / `read_heading` / `find_by_property` |
| `total` | boolean | no | `false` | Count-only switch — wrapper sends `total` flag to upstream and discards property entries |

NO `file` / `path` / `active` / `name` / `sort` / `counts` / `format` fields — these upstream surfaces are explicitly out of scope per FR-004. Per-file frontmatter dumps are covered by the existing `read_property` surface; per-name lookups by the existing `find_by_property` surface.

## Output schema

```typescript
export const propertiesOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    properties: z.array(
      z
        .object({
          name: z.string(),
          noteCount: z.number().int().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();
```

| Field | Type | Notes |
|---|---|---|
| `count` | non-negative integer | Number of distinct property names. Same value across `total: false` and `total: true` for the same vault state (FR-006a cross-mode invariant). |
| `properties[i].name` | string | YAML key byte-faithful from source. Case-sensitive deduplication. |
| `properties[i].noteCount` | non-negative integer | Number of notes carrying this property. |
| Order of `properties` | — | Alphabetical ascending by name, case-insensitive primary key + byte-order tiebreak (FR-013). Wrapper-side post-fetch sort. |

## Worked examples

### A — Default-scope happy path

Input:

```json
{}
```

Upstream stdout (`obsidian properties format=json`):

```json
[
  { "name": "aliases", "type": "aliases", "count": 0 },
  { "name": "author", "type": "text", "count": 5 },
  { "name": "status", "type": "text", "count": 12 },
  { "name": "tags", "type": "tags", "count": 8 }
]
```

Wrapper output:

```json
{
  "count": 4,
  "properties": [
    { "name": "aliases", "noteCount": 0 },
    { "name": "author", "noteCount": 5 },
    { "name": "status", "noteCount": 12 },
    { "name": "tags", "noteCount": 8 }
  ]
}
```

(Note: the upstream entry for `aliases` with `count: 0` may appear if the upstream's bookkeeping retains the reserved property name even when no note declares it. The wrapper passes this through verbatim — `noteCount: 0` is a legitimate value if upstream emits it. If the user prefers entries with `noteCount > 0` only, they filter client-side.)

### B — Named-vault scoping (multi-vault setup)

Input:

```json
{ "vault": "Architecture Notes" }
```

Upstream call shape: `obsidian properties vault="Architecture Notes" format=json`. Note that per F4, upstream silently honours-as-noop the `vault=` parameter — the focused vault is used regardless. The wrapper still passes the `vault=` argument as data per FR-024; the multi-vault limitation is documented in `docs/tools/properties.md`.

Output: same wire shape as Example A, scoped to whichever vault is focused at the time of the call.

### C — Count-only mode

Input:

```json
{ "total": true }
```

Upstream stdout (`obsidian properties total`):

```
73
```

Wrapper output:

```json
{
  "count": 73,
  "properties": []
}
```

### D — Empty vault (default mode)

Input:

```json
{}
```

Upstream stdout (assuming an empty-vault probe at T0 confirms `[]` is emitted):

```json
[]
```

Wrapper output:

```json
{
  "count": 0,
  "properties": []
}
```

### E — Case-distinct property names (sort-order demonstration)

Input:

```json
{}
```

Upstream stdout (unsorted hypothetical — upstream typically returns sorted but the wrapper does not depend on that):

```json
[
  { "name": "Tags", "type": "text", "count": 1 },
  { "name": "tags", "type": "tags", "count": 4 },
  { "name": "Banana", "type": "text", "count": 2 },
  { "name": "Aardvark", "type": "text", "count": 1 },
  { "name": "aardvark", "type": "text", "count": 3 }
]
```

Wrapper output (alphabetical case-insensitive primary + byte-order tiebreak per FR-013):

```json
{
  "count": 5,
  "properties": [
    { "name": "Aardvark", "noteCount": 1 },
    { "name": "aardvark", "noteCount": 3 },
    { "name": "Banana", "noteCount": 2 },
    { "name": "Tags", "noteCount": 1 },
    { "name": "tags", "noteCount": 4 }
  ]
}
```

Case-distinct pairs (`Aardvark`/`aardvark`, `Tags`/`tags`) appear adjacent — supporting the user's drift-detection motivation per the 2026-05-13 clarifications session Q1.

### F — Validation rejection (unknown top-level key)

Input:

```json
{ "vault": "Demo", "file": "note.md" }
```

Output (error):

```
VALIDATION_ERROR — additional properties not allowed (got: file)
```

(`file=` is part of the upstream subcommand's per-file scope, but the wrapper rejects at the schema layer per FR-004 / FR-005.)

### G — Validation rejection (empty vault string)

Input:

```json
{ "vault": "" }
```

Output (error):

```
VALIDATION_ERROR — vault: String must contain at least 1 character(s)
```

## Error response roster

| Code | When | Source |
|---|---|---|
| `VALIDATION_ERROR` | Schema violation (any case from US3 scenarios 1–5) | `registerTool` wraps `ZodError` per FR-018 |
| `CLI_REPORTED_ERROR` | JSON-parse failure, integer-parse failure (count-only mode) | Handler's two parse-failure paths (`details.stage = "json-parse"` or `"total-parse"`) |
| `CLI_NON_ZERO_EXIT` | Output-cap kill on very large inventories | Dispatch layer (R10) |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` binary cannot be located | Cli-adapter binary-resolver |

NO `ERR_NO_ACTIVE_FILE` — this tool has no active mode. NO `CLI_REPORTED_ERROR` for unknown-vault — upstream silently honours-as-noop the `vault=` parameter (FR-015 resolves to documented inherited limitation per R5 / F4).

## Multi-vault inherited limitation

Per F4 (probed 2026-05-13), the `vault=` parameter is silently honoured-as-noop by the upstream `properties` subcommand — the focused vault is what's actually used. Multi-vault users MUST open the target vault before invoking. Parity with `files` (BI-019), `outline` (BI-023), `read_heading` (BI-015), `find_by_property` (BI-014). The wrapper still accepts and passes the `vault=` argument per FR-002 / FR-024 (structural data-passing); the limitation is documented in `docs/tools/properties.md` per FR-019.

## Out-of-scope upstream surfaces

The upstream `obsidian properties` subcommand accepts additional parameters that this wrapper deliberately does NOT expose:

| Upstream parameter | Why not exposed | Alternative |
|---|---|---|
| `file=<name>` | Per-file frontmatter dump — different wire shape (object, not array) | Use `read_property` for per-note property reads |
| `path=<path>` | Per-file frontmatter dump (path-style) | Use `read_property` |
| `active` | Per-file frontmatter dump (focused file) | Use `read_property` |
| `name=<name>` | Single-property note count (returns plain integer) | Use `find_by_property` for value-to-file lookups |
| `sort=count` | Frequency-ordered list | Re-sort the `properties` list client-side |
| `counts` | No-op when `format=json` is set (per F2); only matters for yaml/tsv | N/A — wrapper always emits counts via JSON |
| `format=yaml|tsv` | Alternative output formats — wrapper hardcodes `format=json` for stable parsing | N/A |

These exclusions are LOCKED at the schema layer via `additionalProperties: false` (FR-005). Schema rejection short-circuits before any CLI invocation, so an MCP client forwarding any of these keys to the server receives a `VALIDATION_ERROR` immediately.
