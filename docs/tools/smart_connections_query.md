# `smart_connections_query`

## Overview

Return the typed list of semantically-nearest block-level matches in a
vault for a free-text natural-language query, via the Smart
Connections plugin's lookup API as a typed envelope
`{ count, matches: [{ path, headingPath, score }] }`. The project's
**second plugin-backed typed-content primitive** — sibling to
[`smart_connections_similar`](smart_connections_similar.md), which
answers "what's near this source note?". `smart_connections_query`
answers "what's near this question?".

Wraps the Obsidian CLI's `eval` subcommand under the hood — there is
no native semantic-query subcommand. The wrapper renders a frozen JS
template that reaches
`app.plugins.plugins["smart-connections"].env.smart_sources.lookup({hypotheticals: [query], filter: {limit}, collection: "smart_blocks"})`
and emits a structured envelope. The agent does not need to know this
— the call surface is a typed MCP tool.

The schema is **flat** (no `target_mode` discriminator). One required
field — `query` — plus three optional fields: `vault?` routes to a
named vault when supplied (otherwise the focused vault), `limit?`
(integer 1..100, default 20) caps the matches list AND the count, and
`total?` (boolean) switches to count-only mode.

The tool name follows the
[ADR-013 plugin-namespace convention](../../.decisions/ADR-013%20-%20Plugin-Namespace%20Tool%20Naming%20Convention.md)
— `<plugin_name>_<operation>`.

## Input contract

Every field is rejected at the boundary as `VALIDATION_ERROR` if the
constraints fail. Unknown top-level keys are rejected
(`additionalProperties: false`).

```json
{
  "query": "<natural-language text>",
  "vault": "<vault name>",
  "limit": 20,
  "total": false
}
```

| Field   | Required | Type    | Constraints                                                              |
|---------|----------|---------|---------------------------------------------------------------------------|
| `query` | YES      | string  | trimmed, 1..4000 chars; whitespace-only rejected                          |
| `vault` | NO       | string  | min 1 char when supplied; omitted → focused vault                         |
| `limit` | NO       | integer | 1..100, default 20                                                        |
| `total` | NO       | boolean | strict boolean; `true` switches to count-only mode (`matches: []`)        |

## Output contract

### Default mode (`total: false` or omitted)

```json
{
  "count": <number>,
  "matches": [
    { "path": "<vault-relative .md path>", "headingPath": ["H1", "H2"], "score": 0.87 },
    ...
  ]
}
```

### Count-only mode (`total: true`)

```json
{ "count": <number>, "matches": [] }
```

The `count` is identical across both modes for the same
`(query, vault, limit)` tuple — cross-mode invariant (see FR-006a).

Per-match shape:

- `path` — source file's vault-relative path with `.md` extension
  (everything before the first `#` in the plugin's match key).
- `headingPath` — array of heading segments after the first `#`.
  Empty `[]` for source-level matches. Literal `["---frontmatter---"]`
  for frontmatter-block matches (the plugin's sentinel is preserved
  verbatim). Multi-segment for nested-heading blocks. Sub-block ids
  like `#{1}` appear as ordinary segments in this array.
- `score` — raw plugin-returned number; embedding-model-dependent
  semantics (pass-through; no clamp/normalise/round). Non-finite
  scores (`NaN`, `Infinity`, `null`, missing) are silently dropped.

Sort order: primary `score` descending, secondary `path` byte-asc,
tertiary `headingPath.join("#")` byte-asc.

## Worked examples

### Example A — minimal default-mode query against focused vault

```json
{ "query": "deployment rollback procedure" }
```

```json
{
  "count": 20,
  "matches": [
    { "path": "Ops/Rollbacks.md", "headingPath": ["Rollbacks", "Procedure"], "score": 0.87 },
    { "path": "Incidents/2025-Q3-Retro.md", "headingPath": ["Q3 Retro", "Action Items"], "score": 0.82 }
  ]
}
```

### Example B — explicit vault, count-only

```json
{ "query": "embedding model fine-tuning", "vault": "Demo", "total": true }
```

```json
{ "count": 12, "matches": [] }
```

### Example C — small limit + frontmatter-block hit

```json
{ "query": "ADR for token-optimised tool definitions", "vault": "Demo", "limit": 5 }
```

```json
{
  "count": 5,
  "matches": [
    { "path": "ADR-005.md", "headingPath": ["---frontmatter---"], "score": 0.91 },
    { "path": "ADR-005.md", "headingPath": ["Context"], "score": 0.84 }
  ]
}
```

### Example D — closed-but-registered vault

```json
{ "query": "any query", "vault": "Other" }
```

When `Other` is registered in `obsidian vaults` output but the vault
window is closed:

```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "{\"code\":\"CLI_REPORTED_ERROR\",\"details\":{\"code\":\"VAULT_NOT_FOUND\",\"reason\":\"not-open\",\"stage\":\"handler-stage-0\",\"vault\":\"Other\"},\"message\":\"Vault \\\"Other\\\" is registered but not currently open in Obsidian; the CLI has begun opening it — retry after a brief delay.\"}" }]
}
```

The CLI transparently opens the vault as a side effect. Retry the
call after a brief delay.

## Failure modes

| Top-level             | `details.code`                   | `details.reason` | Trigger                                                |
|-----------------------|----------------------------------|------------------|--------------------------------------------------------|
| `VALIDATION_ERROR`    | —                                | —                | Input shape violation                                   |
| `CLI_REPORTED_ERROR`  | `VAULT_NOT_FOUND`                | `unknown` (or absent) | Named vault not in host's registry (011-R5 inspection) |
| `CLI_REPORTED_ERROR`  | `VAULT_NOT_FOUND`                | `not-open`       | Named vault registered but currently closed             |
| `CLI_REPORTED_ERROR`  | `SMART_CONNECTIONS_NOT_INSTALLED`| —                | Plugin absent from target vault                         |
| `CLI_REPORTED_ERROR`  | `SMART_CONNECTIONS_NOT_READY`    | `api-missing`    | `env.smart_sources.lookup` is not a function            |
| `CLI_REPORTED_ERROR`  | `SMART_CONNECTIONS_NOT_READY`    | `embed-failed`   | Lookup returned `{error: <string>}` sentinel (e.g. embed model not configured, invalid API key) |
| `CLI_REPORTED_ERROR`  | (stage discriminator)            | —                | `json-parse` failure (eval response not JSON)           |
| `CLI_REPORTED_ERROR`  | (stage discriminator)            | —                | `envelope-parse` failure (envelope shape mismatch)      |
| `CLI_BINARY_NOT_FOUND`| —                                | —                | Obsidian CLI binary not resolvable                      |
| `CLI_TIMEOUT`         | —                                | —                | Embed call exceeded the 10-second typed-tool timeout (see limitation #6) |
| `CLI_NON_ZERO_EXIT`   | —                                | —                | Output-cap kill at impractical match-list size          |

## Error-precedence chain

Outer-to-inner, cheapest-first per FR-017:

```
VAULT_NOT_FOUND(unknown)
  ↓
VAULT_NOT_FOUND(not-open)
  ↓
SMART_CONNECTIONS_NOT_INSTALLED
  ↓
SMART_CONNECTIONS_NOT_READY(api-missing)
  ↓
SMART_CONNECTIONS_NOT_READY(embed-failed)
  ↓
success
```

The plugin-lifecycle stages live inside the eval JS template; the
earlier-priority discriminator fires first and short-circuits the
remainder. `json-parse` / `envelope-parse` are handler-internal
failures that surface only when the eval response is corrupt — not
part of the agent-facing precedence chain.

## Inherited limitations

1. **Embedding-model-dependent score bands** — scores produced by
   different embed models are not directly comparable; the wrapper
   passes the raw score through with no normalisation. Use scores
   to rank within a single result set, not across vaults or model
   choices.
2. **Indexing freshness** — `lookup` only sees content the plugin has
   already indexed. New / edited notes since the last index run are
   not searchable. Agents can ask the user to "refresh the Smart
   Connections index" if results look stale.
3. **Folder exclusions** — the plugin honours its
   `exclude_folders` setting. Notes in excluded folders are never
   returned. This is plugin-side configuration; the wrapper does not
   expose a folder filter.
4. **Plugin-version drift** — the wrapper is pinned to the minimum
   probed Smart Connections version (≥ v4.5.0). Future plugin API
   shapes may surface as `api-missing`.
5. **Local-model silent query truncation** — local embed models
   (e.g. transformers.js) silently truncate inputs at their context
   window (typically 512 tokens). A 4000-char query may embed only
   the leading prefix. Cloud models (OpenAI text-embedding-3-small)
   have larger context windows.
6. **Embed-call latency cap (10s)** — embed calls exceeding the 10-
   second typed-tool timeout surface as `CLI_TIMEOUT`. Most common
   under cloud-model rate-limiting or network instability. The agent
   can retry; persistent timeouts indicate plugin / network state
   needing user intervention.
7. **Stale-index reverse direction** — if a match references a
   deleted file, the wrapper still surfaces the path verbatim. The
   plugin's index may lag deletion. Treat dangling matches as
   plugin-state artefacts.
8. **Low-information queries** — very short queries (single
   characters, single common stop-words) produce embeddings with
   little discriminative power; results may be incoherent. Prefer
   queries that are full sentences or noun phrases.

## Cross-references

- Sibling tool: [`smart_connections_similar`](smart_connections_similar.md)
  — "what's near this source note?"
- Naming convention: [ADR-013](../../.decisions/ADR-013%20-%20Plugin-Namespace%20Tool%20Naming%20Convention.md)
- Failure-mode pattern: [ADR-014](../../.decisions/ADR-014%20-%20Plugin-Backed%20Typed%20Tools%20Runtime-Dependency%20Pattern.md)
- Sub-discriminator pattern: [ADR-015](../../.decisions/ADR-015%20-%20Sub-Discriminators%20via%20details.reason%20for%20Multi-State%20Error%20Codes.md)
- Feature spec: [BI-027 spec.md](../../specs/027-smart-connections-query/spec.md)
