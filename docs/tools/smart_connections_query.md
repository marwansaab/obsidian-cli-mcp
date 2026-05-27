# `smart_connections_query`

## Overview

Semantic search: return the block-level vault matches nearest to a free-text natural-language query via the Smart Connections plugin's lookup API. Returns a typed envelope `{ count, matches: [{ path, headingPath, score }] }`.

`smart_connections_query` answers "what's near this question?". Its sibling [`smart_connections_similar`](./smart_connections_similar.md) answers "what's near this source note?".

## When to use this tool

| You want to | Reach for |
|---|---|
| Notes semantically near a natural-language question | `smart_connections_query` |
| Notes semantically near a specific source note | [`smart_connections_similar`](./smart_connections_similar.md) |
| Literal-string search across vault content | [`search`](./search.md) or [`context_search`](./context_search.md) |
| Find notes by frontmatter property value | [`find_by_property`](./find_by_property.md) |

## Input contract

The schema is **flat** (no `target_mode` discriminator). Every field is rejected at the boundary as `VALIDATION_ERROR` if the constraints fail. Unknown top-level keys are rejected (`additionalProperties: false`).

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
| `query` | YES      | string  | trimmed, 1..2000 chars; whitespace-only rejected. **Hard cap** — see *Why the query cap is 2000* below. |
| `vault` | NO       | string  | min 1 char when supplied; omitted → focused vault                         |
| `limit` | NO       | integer | 1..100, default 20                                                        |
| `total` | NO       | boolean | strict boolean; `true` switches to count-only mode (`matches: []`)        |

## Why the query cap is 2000

The wrapper base64-encodes the query and embeds it in an `eval` JavaScript template before dispatching to the Obsidian CLI. The combined payload (template + encoded query) is sent as a single argv argument. An upstream defect in `Obsidian.com`'s argv-IPC channel hangs the host process around 4 KB of content on Windows. Queries above ~2000 chars push the rendered argv into the unsafe zone, triggering `CLI_TIMEOUT` at the 10 s wrapper timeout AND a 30–60 s recovery window during which subsequent calls also timeout.

The cap is enforced at the schema layer — over-cap queries fail fast with `VALIDATION_ERROR` and `details.code: "too_big"` before any spawn occurs. For longer text, summarise client-side before querying.

## Output contract

### Default mode (`total: false` or omitted)

```json
{
  "count": <number>,
  "matches": [
    { "path": "<vault-relative .md path>", "headingPath": ["H1", "H2"], "score": 0.87 }
  ]
}
```

### Count-only mode (`total: true`)

```json
{ "count": <number>, "matches": [] }
```

The `count` is identical across both modes for the same `(query, vault, limit)` tuple at the same instant.

Per-match shape:

- `path` — source file's vault-relative path with `.md` extension (everything before the first `#` in the plugin's match key).
- `headingPath` — array of heading segments after the first `#`. Empty `[]` for source-level matches. Literal `["---frontmatter---"]` for frontmatter-block matches (the plugin's sentinel is preserved verbatim). Multi-segment for nested-heading blocks. Sub-block ids like `#{1}` appear as ordinary segments.
- `score` — raw plugin-returned number; embedding-model-dependent semantics (pass-through; no clamp / normalise / round). Non-finite scores (`NaN`, `Infinity`, `null`, missing) are silently dropped.

Sort order: primary `score` descending, secondary `path` byte-asc, tertiary `headingPath.join("#")` byte-asc.

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

When `Other` is registered in `obsidian vaults` output but the vault window is closed:

```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "{\"code\":\"CLI_REPORTED_ERROR\",\"details\":{\"code\":\"VAULT_NOT_FOUND\",\"reason\":\"not-open\",\"stage\":\"handler-stage-0\",\"vault\":\"Other\"},\"message\":\"Vault \\\"Other\\\" is registered but not currently open in Obsidian; the CLI has begun opening it — retry after a brief delay.\"}" }]
}
```

The CLI transparently opens the vault as a side effect. Retry the call after a brief delay.

## Failure modes

| Top-level             | `details.code`                   | `details.reason`      | Trigger                                                | Recovery |
|-----------------------|----------------------------------|-----------------------|--------------------------------------------------------|----------|
| `VALIDATION_ERROR`    | —                                | —                     | Input shape violation (query empty / whitespace-only / over 2000 chars / wrong types) | Inspect `details.issues`; for over-cap queries, summarise the query client-side. |
| `CLI_REPORTED_ERROR`  | `VAULT_NOT_FOUND`                | `unknown` (or absent) | Named vault not in host's registry | Verify the vault name; ensure the vault is registered in Obsidian. |
| `CLI_REPORTED_ERROR`  | `VAULT_NOT_FOUND`                | `not-open`            | Named vault registered but currently closed | Retry after a brief delay — the CLI is opening the vault as a side effect. |
| `CLI_REPORTED_ERROR`  | `SMART_CONNECTIONS_NOT_INSTALLED`| —                     | Smart Connections plugin absent from target vault | Ask the user to install Smart Connections (by Brian Petro, ≥ v4.5.0). |
| `CLI_REPORTED_ERROR`  | `SMART_CONNECTIONS_NOT_READY`    | `api-missing`         | `env.smart_sources.lookup` is not a function | Ask the user to update Smart Connections; the plugin's API surface drifted. |
| `CLI_REPORTED_ERROR`  | `SMART_CONNECTIONS_NOT_READY`    | `embed-failed`        | Lookup returned `{error: <string>}` (embed model not configured, invalid API key, network failure) | Ask the user to check Smart Connections settings — embed model configuration / API key / network connectivity. |
| `CLI_REPORTED_ERROR`  | (stage discriminator)            | —                     | `json-parse` or `envelope-parse` — upstream output unexpected | Investigate as a regression. |
| `CLI_BINARY_NOT_FOUND`| —                                | —                     | Obsidian CLI binary not on PATH and `OBSIDIAN_BIN` unset/invalid | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN`. |
| `CLI_TIMEOUT`         | —                                | —                     | Embed call exceeded the 10-second timeout. Most common under cloud-model rate-limiting, network instability, or queries that crossed into the upstream argv-IPC defect zone. | Wait 30–60 s for the host process to recover before retrying. If the query was long, summarise it before retry. Persistent timeouts indicate plugin / network state needing user intervention. |
| `CLI_NON_ZERO_EXIT`   | —                                | —                     | Output-cap kill at impractical match-list size | Reduce `limit`, OR use `total: true` for a pre-flight count. |

## Error-precedence chain (outer to inner)

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

The earlier-priority discriminator fires first and short-circuits the remainder. `json-parse` / `envelope-parse` are handler-internal failures that surface only when the eval response is corrupt — not part of the agent-facing precedence chain.

## Inherited limitations

1. **Embedding-model-dependent score bands** — scores produced by different embed models are not directly comparable; the wrapper passes the raw score through with no normalisation. Use scores to rank within a single result set, not across vaults or model choices.
2. **Indexing freshness** — `lookup` only sees content the plugin has already indexed. New / edited notes since the last index run are not searchable. Ask the user to "refresh the Smart Connections index" if results look stale.
3. **Folder exclusions** — the plugin honours its `exclude_folders` setting. Notes in excluded folders are never returned. This is plugin-side configuration; the wrapper does not expose a folder filter.
4. **Plugin-version drift** — the wrapper is pinned to the minimum probed Smart Connections version (≥ v4.5.0). Future plugin API shapes may surface as `api-missing`.
5. **Local-model silent query truncation** — local embed models (e.g. transformers.js) silently truncate inputs at their context window (typically 512 tokens). A 2000-char query may embed only the leading prefix. Cloud models (OpenAI text-embedding-3-small) have larger context windows.
6. **Embed-call latency cap (10s)** — embed calls exceeding the 10-second timeout surface as `CLI_TIMEOUT`. After a timeout, wait 30–60 s before retrying — the host process may need to recover.
7. **Stale-index reverse direction** — if a match references a deleted file, the wrapper still surfaces the path verbatim. The plugin's index may lag deletion. Treat dangling matches as plugin-state artefacts.
8. **Low-information queries** — very short queries (single characters, single common stop-words) produce embeddings with little discriminative power; results may be incoherent. Prefer queries that are full sentences or noun phrases.
