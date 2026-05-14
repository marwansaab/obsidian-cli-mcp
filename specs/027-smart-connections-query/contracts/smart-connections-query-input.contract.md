# Input Contract — `smart_connections_query`

Public input contract for the typed tool registered as `smart_connections_query`.

---

## Zod Schema

```typescript
import { z } from "zod";

export const smartConnectionsQueryInputSchema = z
  .object({
    query: z.string().trim().min(1).max(4000),
    vault: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(100).default(20),
    total: z.boolean().optional(),
  })
  .strict();
```

The schema is the **single source of truth** (Constitution Principle III). The MCP `inputSchema` published via `zod-to-json-schema` derives from this object verbatim.

## Emitted JSON Schema Shape

```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string", "minLength": 1, "maxLength": 4000 },
    "vault": { "type": "string", "minLength": 1 },
    "limit": { "type": "integer", "minimum": 1, "maximum": 100, "default": 20 },
    "total": { "type": "boolean" }
  },
  "required": ["query"],
  "additionalProperties": false
}
```

Field-level descriptions are stripped at registration via `stripSchemaDescriptions` (ADR-005). Agents reading the published schema see structural information only; semantic guidance lives in `docs/tools/smart_connections_query.md`.

## Field Policy

| Field | Required? | Type | Constraints | Notes |
|---|---|---|---|---|
| `query` | YES | string | `.trim().min(1).max(4000)` | Trimmed before length check. Whitespace-only rejected. 4000-char cap is wrapper-side; local embed models truncate further silently (inherited limitation #5). |
| `vault` | NO | string | `.min(1)` when supplied | Empty string explicitly rejected. When omitted, routes to focused vault per upstream eval behaviour. |
| `limit` | NO | integer | `.min(1).max(100)`, default 20 | Non-integer (e.g. 5.5) rejected; out-of-range rejected; non-numeric (e.g. `"20"`) rejected. |
| `total` | NO | boolean | strict boolean | Truthy non-boolean (e.g. `"true"`, `1`) rejected. When `true`, response carries `count` only with `matches: []`. |

## Worked Examples

### Example A — minimal default-mode query against focused vault

```json
{ "query": "deployment rollback procedure" }
```

Expected envelope (success):
```json
{
  "count": 20,
  "matches": [
    { "path": "Ops/Rollbacks.md", "headingPath": ["Rollbacks", "Procedure"], "score": 0.87 },
    { "path": "Incidents/2025-Q3-Retro.md", "headingPath": ["Q3 Retro", "Action Items"], "score": 0.82 },
    "…"
  ]
}
```

### Example B — explicit vault, limit cap, count-only

```json
{ "query": "embedding model fine-tuning", "vault": "Demo", "limit": 50, "total": true }
```

Expected envelope (success):
```json
{ "count": 50, "matches": [] }
```

### Example C — default limit, count-only mode

```json
{ "query": "What did we decide about the new auth flow?", "total": true }
```

Expected envelope (success):
```json
{ "count": 20, "matches": [] }
```

### Example D — empty vault / very narrow corpus

```json
{ "query": "Renaissance painting techniques", "vault": "Software-Engineering-Notes" }
```

Expected envelope (success — zero results possible only when embed model returns purely non-finite scores for all matches, OR vault has nothing indexed):
```json
{ "count": 0, "matches": [] }
```

### Example E — query with shell metacharacters and Unicode (anti-injection lock)

```json
{ "query": "\"; rm -rf $(pwd); echo 'pwn' && cat /etc/passwd  漢字 emoji 🚀" }
```

Expected: the wrapper's base64 payload preserves the query byte-exact; the embedding model embeds it as a text input; no shell command escape occurs.

### Example F — unknown vault

```json
{ "query": "any query", "vault": "DoesNotExist" }
```

Expected error response:
```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "{\"code\":\"CLI_REPORTED_ERROR\",\"details\":{\"code\":\"VAULT_NOT_FOUND\",\"reason\":\"unknown\",\"vault\":\"DoesNotExist\"},\"message\":\"Vault not found.\"}" }]
}
```

### Example G — closed-but-registered vault

```json
{ "query": "any query", "vault": "Other" }
```
Where `Other` IS registered in `obsidian vaults` output but the vault window is closed.

Expected error response:
```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "{\"code\":\"CLI_REPORTED_ERROR\",\"details\":{\"code\":\"VAULT_NOT_FOUND\",\"reason\":\"not-open\",\"stage\":\"handler-stage-0\",\"vault\":\"Other\"},\"message\":\"Vault \\\"Other\\\" is registered but not currently open in Obsidian; the CLI has begun opening it — retry after a brief delay.\"}" }]
}
```

### Example H — embed-failed (configured embed model unavailable)

```json
{ "query": "machine learning" }
```
Where the configured Smart Connections embed model is not loaded (or the OpenAI API key is invalid, or the cloud model is rate-limited).

Expected error response:
```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "{\"code\":\"CLI_REPORTED_ERROR\",\"details\":{\"code\":\"SMART_CONNECTIONS_NOT_READY\",\"reason\":\"embed-failed\",\"stage\":\"envelope-error\",\"detail\":\"Embedding search is not enabled.\"},\"message\":\"smart_connections_query: lookup returned an error sentinel (Embedding search is not enabled.)\"}" }]
}
```

## Error Response Roster

| # | Top-level | details.code | details.reason | Trigger | Stage |
|---|---|---|---|---|---|
| 1 | `VALIDATION_ERROR` | — | — | Input shape violation | Zod boundary, before any CLI call |
| 2 | `CLI_REPORTED_ERROR` | `VAULT_NOT_FOUND` | `unknown` (or absent) | Named vault not in host's registry | cli-adapter 011-R5 inspection |
| 3 | `CLI_REPORTED_ERROR` | `VAULT_NOT_FOUND` | `not-open` | Named vault registered but closed | Shared `_eval-vault-closed-detection` detector (handler stage 0) |
| 4 | `CLI_REPORTED_ERROR` | `SMART_CONNECTIONS_NOT_INSTALLED` | — | Plugin absent from target vault | In-eval Stage 1 |
| 5 | `CLI_REPORTED_ERROR` | `SMART_CONNECTIONS_NOT_READY` | `api-missing` | `env.smart_sources.lookup` not a function | In-eval Stage 2 |
| 6 | `CLI_REPORTED_ERROR` | `SMART_CONNECTIONS_NOT_READY` | `embed-failed` | Lookup returned `{error: <string>}` sentinel | In-eval Stage 4 |
| 7 | `CLI_REPORTED_ERROR` | (stage discriminator) | — | `json-parse` failure (eval response not JSON) | Handler stage 2 |
| 8 | `CLI_REPORTED_ERROR` | (stage discriminator) | — | `envelope-parse` failure (envelope shape mismatch) | Handler stage 3 |
| 9 | `CLI_NON_ZERO_EXIT` | — | — | Output-cap kill at impractical match-list size | cli-adapter dispatch layer |
| 10 | `CLI_TIMEOUT` | — | — | Embed call exceeds `TYPED_TOOL_TIMEOUT_MS = 10_000` | cli-adapter dispatch layer; most commonly indicates embed-model latency (inherited limitation #7) |
| 11 | `CLI_BINARY_NOT_FOUND` | — | — | Obsidian CLI binary not resolvable | cli-adapter dispatch layer |

## Out-of-Scope Upstream Surfaces

The following upstream `lookup` features are intentionally NOT exposed by the wrapper's input contract:

| Upstream feature | Why deferred |
|---|---|
| Multi-hypothetical HyDE input | Q6 grilling lock — single string surface; future BI may widen to `string | string[]` |
| Pre-computed embedding (World B) | Q3 grilling lock — World A only; wrapper relies on plugin's embed-internally pipeline |
| `filter.exclude_keys` | Out-of-scope per spec Assumptions block |
| `filter.key_starts_with` (folder-prefix filtering) | Out-of-scope; plugin's `exclude_folders` setting is the only supported folder filter |
| `filter.collection` (set to other than `smart_blocks`) | Wrapper-fixed at `"smart_blocks"`; block-level granularity is the locked contract |
| `params.k` (legacy limit field) | Wrapper uses `filter.limit` only |
| `params.skip_blocks` (auto-set by lookup-on-smart_sources dispatch) | Internal plugin behaviour; not exposed |
| Wrapper-side score threshold | Out-of-scope; plugin's internal threshold (or absence thereof per F9) governs |
| Bare URLs / non-block matches | `collection: 'smart_blocks'` returns block-level keys only |
| `frontmatterLinks` integration | N/A for this tool; chain `links` for that |
| Cross-vault queries | Out-of-scope; single vault per call |

---

## Multi-Vault Behaviour

When `vault` is supplied: the call routes to the named vault's `app` instance via `vault=<name> eval` (F12 verified). The closed-vault detection (R5a) handles registered-but-closed via the shared detector.

When `vault` is omitted: the call routes to whichever vault is currently focused in Obsidian's window. If no vault is focused, the upstream `eval` failure surfaces via the cli-adapter's standard dispatch error.

**Inherited limitation #5 (basename ambiguity)**: N/A for `smart_connections_query` because the tool does not perform basename lookup (no `file?` parameter).

---

## Versioning Compatibility

Adding fields to a future revision is backwards-compatible iff the new field is optional in the schema. Adding required fields, narrowing types, or tightening `.min` / `.max` bounds is a breaking change requiring a MINOR (pre-v1.0) or MAJOR (post-v1.0) version bump.

Adding new ERROR codes under existing `details.code` values via the `details.reason` sub-discriminator pattern (ADR-015) is additive — does NOT require a version bump beyond PATCH.
