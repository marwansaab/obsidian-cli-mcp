# `smart_connections_similar`

## Overview

Return the typed list of semantically-similar block-level matches for a single source note via the Smart Connections plugin's similarity API as `{ count, matches: [{ path, headingPath, score }] }`.

Plugin-backed primitive: routes into the plugin's runtime object at `app.plugins.plugins["smart-connections"].env.smart_sources.items[<key>].find_connections({limit})`. Wraps the Obsidian CLI's `eval` subcommand — there is no native similarity subcommand. The agent does not need to know this; the call surface is a typed MCP tool.

## When to use this tool

| You want to | Reach for |
|---|---|
| Find notes semantically similar to a source note | `smart_connections_similar` |
| Get the count of similar notes without the list | `smart_connections_similar` with `total: true` |
| Free-text semantic search across the vault | [`smart_connections_query`](./smart_connections_query.md) |
| Get outgoing links from a note (deterministic structure, not semantic) | [`links`](./links.md) |
| Get incoming links to a note | [`backlinks`](./backlinks.md) |
| Find notes by frontmatter property | [`find_by_property`](./find_by_property.md) |
| Find notes by tag | [`tag`](./tag.md) |
| Get the body bytes of a matched block | [`read_heading`](./read_heading.md) — join the match's `path` + `headingPath.join('::')` |

The tool supports two target modes:

- **specific** — name the vault and exactly one of `file` (wikilink) or `path` (vault-relative path).
- **active** — operate on the currently focused note in the focused vault. No `vault`, `file`, or `path` argument is permitted.

## Input contract

Every field is rejected at the boundary as `VALIDATION_ERROR` if the constraints fail. Unknown top-level keys are rejected (`additionalProperties: false`).

### Specific mode

```json
{
  "target_mode": "specific",
  "vault": "<vault name>",
  "file": "<wikilink-style name>",
  "path": "<vault-relative path>",
  "limit": 20,
  "total": false
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"specific"` | YES | discriminator |
| `vault` | string | YES | length ≥ 1 |
| `file` | string | XOR | exactly one of `file` / `path` |
| `path` | string | XOR | exactly one of `file` / `path` |
| `limit` | integer | OPTIONAL | 1..100, default 20 |
| `total` | boolean | OPTIONAL | defaults to `false` |

### Active mode

```json
{
  "target_mode": "active",
  "limit": 20,
  "total": false
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"active"` | YES | discriminator |
| `limit` | integer | OPTIONAL | 1..100, default 20 |
| `total` | boolean | OPTIONAL | defaults to `false` |
| `vault` | (n/a) | FORBIDDEN | rejected at the schema layer |
| `file` | (n/a) | FORBIDDEN | rejected at the schema layer |
| `path` | (n/a) | FORBIDDEN | rejected at the schema layer |

### Per-field policy

- **`file`** — wikilink-style file name (resolved inside the eval JS via `app.metadataCache.getFirstLinkpathDest`). The `.md` extension is accepted but not required.
- **`path`** — exact vault-relative path. Path-traversal patterns (`../escape.md`, absolute paths) are looked up against `app.vault.getAbstractFileByPath` — Obsidian's index uses vault-relative keys without `..` resolution, so the lookup returns null and the wrapper surfaces `CLI_REPORTED_ERROR(FILE_NOT_FOUND)`. No filesystem mutation occurs outside the vault.
- **`limit`** — caps the matches list length AND the count. Mirrors the plugin's `find_connections({limit})` parameter. The wrapper also applies a final `.slice(0, limit)` after sorting so that any plugin-internal cap below `limit` is honoured.
- **`total`** — when `true`, the response carries `matches: []` with `count` set to the total match count. The `count` is identical between `total: false` and `total: true` for the same note state at the same instant.

## Output shape

Uniform envelope across both modes; the only difference is whether `matches` is populated.

### Default mode (`total !== true`)

```json
{
  "count": 4,
  "matches": [
    { "path": "Topics/AI.md",     "headingPath": ["Overview"],            "score": 0.91 },
    { "path": "Topics/AI.md",     "headingPath": ["History", "1956"],     "score": 0.85 },
    { "path": "Notes/ML.md",      "headingPath": [],                       "score": 0.78 },
    { "path": "Bibliography.md",  "headingPath": ["---frontmatter---"],   "score": 0.70 }
  ]
}
```

### Count-only mode (`total: true`)

```json
{ "count": 4, "matches": [] }
```

| Field | Type | Description |
|-------|------|-------------|
| `count` | integer ≥ 0 | Total post-filter, post-self-exclusion match count. Identical across both `total` branches for the same source file. |
| `matches` | array | One entry per block-level match in `(score desc, path byte-asc, headingPath.join('#') byte-asc)` order. Populated in default mode; always `[]` in count-only mode. |
| `matches[].path` | string ending `.md` | Source file's vault-relative path with `.md` extension preserved — everything before the FIRST `#` in the plugin's match key. Directly pasteable into other typed tools' `path=` field. |
| `matches[].headingPath` | array of strings | Heading-path segments locating the matched block within `path` — split on `#` AFTER the first `#`. Empty `[]` for source-level matches; literal `["---frontmatter---"]` for frontmatter-block matches (plugin sentinel preserved verbatim, NOT normalised by the wrapper); multi-segment array for nested-heading-block matches. |
| `matches[].score` | finite number | Raw plugin-returned score (pass-through; no clamp / normalise / round). Embedding-model-dependent semantics — transformers.js ≈ `[0, 1]`; OpenAI ada-002 ≈ `[0, 1]`. |

### Block-vs-source granularity

The tool returns **block-level matches by default** — this is the plugin's natural output shape. A single source note can produce multiple entries (one per matching heading block, plus optionally a frontmatter-block entry, plus optionally a source-level entry). Agents wanting source-level granularity collapse to `path` client-side:

```js
Object.values(Object.fromEntries(matches.map(m => [m.path, m])))
```

keeps the highest-scoring entry per source.

### Filters applied inside the eval

- **Non-finite-score filter**: entries where `score` is `NaN`, `Infinity`, `-Infinity`, `null`, `undefined`, or any non-number are silently dropped. No envelope code is emitted for the filter event — bad entries simply don't appear.
- **Source-path-keyed self-exclusion**: entries where `m.path === sourceKey` are removed. This excludes the source note AND any block inside the source from the result list (block-inside-source matches would otherwise dominate short notes per the plugin's natural output).

## Worked examples

### Example 1 — Specific mode, indexed note by path

```json
{
  "name": "smart_connections_similar",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "Source/Note.md",
    "limit": 10
  }
}
```

Fires one `invokeCli` (`obsidian vault=Demo eval code=<rendered-js>`). Example response:

```json
{
  "count": 4,
  "matches": [
    { "path": "Topics/AI.md",    "headingPath": ["Overview"],          "score": 0.91 },
    { "path": "Topics/AI.md",    "headingPath": ["History", "1956"],   "score": 0.85 },
    { "path": "Notes/ML.md",     "headingPath": [],                     "score": 0.78 },
    { "path": "Bibliography.md", "headingPath": ["---frontmatter---"], "score": 0.70 }
  ]
}
```

### Example 2 — Specific mode by wikilink basename

```json
{
  "name": "smart_connections_similar",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "file": "Note"
  }
}
```

Structurally equivalent to Example 1 when `Note` resolves unambiguously to the same note via `app.metadataCache.getFirstLinkpathDest("Note", "")`. When the basename matches multiple files, Obsidian's wikilink-resolution semantics decide which file (the wrapper does NOT impose disambiguation).

### Example 3 — Active mode, focused note

```json
{
  "name": "smart_connections_similar",
  "arguments": { "target_mode": "active" }
}
```

Fires one `invokeCli` (`obsidian eval code=<rendered-js>` — no `vault=`). The eval resolves the source via `app.workspace.getActiveFile()`. When no note is focused, the response is a structured `ERR_NO_ACTIVE_FILE` error.

### Example 4 — Count-only pre-flight

```json
{
  "name": "smart_connections_similar",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "Source/Note.md",
    "total": true
  }
}
```

Same single eval invocation as Example 1; the envelope branch on `a.total` inside the eval JS suppresses the per-entry list. Response:

```json
{ "count": 4, "matches": [] }
```

Use this for token-economical pre-flight reads (size estimation, fan-out check, whether the source has any semantic neighbours at all).

### Example 5 — Plugin not installed

```json
{
  "name": "smart_connections_similar",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "Source/Note.md"
  }
}
```

When the Smart Connections plugin is not enabled in `Demo`, the in-eval lifecycle check fires and returns an envelope `SMART_CONNECTIONS_NOT_INSTALLED`. The wrapper maps to `CLI_REPORTED_ERROR(stage:'envelope-error', code:'SMART_CONNECTIONS_NOT_INSTALLED')`.

### Example 6 — Closed-but-registered vault retry pattern

```json
{
  "name": "smart_connections_similar",
  "arguments": {
    "target_mode": "specific",
    "vault": "The Setup",
    "path": "Process/notes.md"
  }
}
```

If `The Setup` is registered with Obsidian but the vault window is not currently open, two response shapes are possible:

- the documented `CLI_REPORTED_ERROR(details.code: 'VAULT_NOT_FOUND', details.reason: 'not-open')` from the wrapper's stage-0 detection branch, OR
- `CLI_REPORTED_ERROR` with stderr `Error: Command "eval" not found.` because closing the vault unloaded the Integrated CLI plugin (which the Smart Connections eval call needs).

Treat both surfaces as "vault unavailable" and retry the same call after a brief delay (typically 1–3 s) while Obsidian finishes opening the vault.

## Error roster

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed the schema (missing `target_mode`, missing `vault` in specific mode, neither `file` nor `path` in specific mode, both `file` AND `path` in specific mode, `vault`/`file`/`path` in active mode, `limit` out of range / non-integer, `total` non-boolean, unknown top-level key, `vault` empty). | Retry with corrected input. `details.issues` carries per-issue `path` + `message` + zod code. |
| `CLI_REPORTED_ERROR` (`details.code: "VAULT_NOT_FOUND"`, `details.reason: "unknown"` or absent) | Specific mode + `vault` not registered with Obsidian. Upstream emits `Vault not found.` and the cli-adapter reclassifies. | Supply a registered vault display name. |
| `CLI_REPORTED_ERROR` (`details.code: "VAULT_NOT_FOUND"`, `details.reason: "not-open"`, `details.stage: "handler-stage-0"`) | Specific mode + `vault` IS registered but is NOT currently open in Obsidian. The CLI emitted empty stdout + exit 0 AND transparently OPENED the vault as a side effect; the wrapper's stage-0 detection branch fires. May also surface as `CLI_REPORTED_ERROR` with stderr `Error: Command "eval" not found.` when closing the vault also unloaded the Integrated CLI plugin. | Retry the same call after a brief delay (typically 1–3 s). |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "SMART_CONNECTIONS_NOT_INSTALLED"`) | The Smart Connections plugin is not enabled in the target vault. | Ask the user to enable the plugin in Obsidian's community-plugins settings. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "FILE_NOT_FOUND"`) | `path` does not match any file in the vault, OR `file` (basename) does not resolve via `getFirstLinkpathDest`. `details.detail` distinguishes (`path: <path>` vs `wikilink: <file>`). | Verify the path / basename; check for typos; confirm the vault contains the file. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "NOT_MARKDOWN"`) | The resolved file's extension is not `.md` (e.g. `.canvas`, `.pdf`, attachments). | Use a different tool, or read the source bytes via [`read`](./read.md). |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "SMART_CONNECTIONS_NOT_READY"`) | The plugin is loaded but its similarity API path (`env.smart_sources.items`) is unavailable — either initial indexing is still in progress OR a plugin-version drift has changed the API shape. | Wait for indexing to complete (visible in the plugin's UI as "X embeddings to make: 0"); or check that the installed plugin version matches the minimum probed v4.x — earlier v2.x / v3.x releases may have a different API path. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "SOURCE_NOT_INDEXED"`) | The source note exists in the vault but has not been indexed by the plugin yet (typical for just-created notes; the plugin's indexing-trigger debounce defaults to ~5 s). | Wait for the next indexing pass, or trigger a manual re-index from the plugin's UI. |
| `ERR_NO_ACTIVE_FILE` | `target_mode: "active"` was used but no Obsidian note is focused. The eval surfaces envelope `NO_ACTIVE_FILE` and the wrapper maps to this code. | Ask the user to open a note in Obsidian, OR call again with `target_mode: "specific"` and an explicit `vault` + `file`/`path`. |
| `CLI_REPORTED_ERROR` (`details.stage: "json-parse"`) | Stage-2 JSON parse on the eval stdout failed. Catch-all for upstream eval misbehaviour. | Investigate as a regression. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-parse"`) | Stage-3 envelope-schema validation failed. Catch-all for unexpected envelope keys (e.g. upstream version drift in the plugin's match shape). | Investigate as a regression. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (typical cause: output-cap kill on pathologically large match lists — essentially unreachable at `limit: 100` per the *Practical ceiling* note below). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |

## Error-precedence chain

Outer-to-inner, cheapest-first. Specific mode order:

```
VAULT_NOT_FOUND(unknown)            ← cli-adapter response inspection
 → VAULT_NOT_FOUND(not-open)        ← handler stage-0 detection
 → SMART_CONNECTIONS_NOT_INSTALLED  ← in-eval Stage 1
 → FILE_NOT_FOUND                   ← in-eval Stage 2
 → NOT_MARKDOWN                     ← in-eval Stage 3
 → SMART_CONNECTIONS_NOT_READY      ← in-eval Stage 4
 → SOURCE_NOT_INDEXED               ← in-eval Stage 5
 → success
```

Active mode skips the two vault steps (active mode forbids the `vault` argument). Each compound failure surfaces the FIRST condition in the chain that fails — agents see exactly one discriminator per failed call.

## Plugin-as-runtime-dependency

The plugin-lifecycle codes (`SMART_CONNECTIONS_NOT_INSTALLED` / `SMART_CONNECTIONS_NOT_READY` / `SOURCE_NOT_INDEXED`) surface the three discrete lifecycle states agents may encounter when calling this tool.

### Minimum probed Smart Connections plugin version

Verified against Smart Connections plugin **v4.5.0** (by Brian Petro; manifest `id: smart-connections`, `minAppVersion: 1.1.0`). The wrapper documents this as a **soft-pin** — the wrapper does NOT enforce a version check at runtime. Users on older or newer plugin versions whose API surface diverges from this baseline surface deterministically as `SMART_CONNECTIONS_NOT_READY` via the in-eval lifecycle check at Stage 4 of the JS template. The probed major version `4.x` clarifies that the plugin's API path (`env.smart_sources.items[<key>].find_connections({limit})`) is the v4-era shape; earlier v2.x / v3.x plugin releases may have a different API path.

### Closed-but-registered-vault retry pattern

When a registered vault is not currently open in Obsidian, the CLI emits empty stdout + exit 0 for the FIRST `eval` invocation against that vault AND transparently OPENS the vault as a side effect; the SECOND `eval` invocation against the now-open vault works normally. The wrapper's handler stage-0 detection branch surfaces the first call as `CLI_REPORTED_ERROR(reason:'not-open')`.

**Important detection caveat.** Closing a vault unloads the Integrated CLI plugin alongside the rest of the vault's plugins, so the documented `details.reason: 'not-open'` signature is not always reachable. In that case the actual error surface is `CLI_REPORTED_ERROR` with stderr `Error: Command "eval" not found.` Agents should treat **both** surfaces as "vault unavailable, retry after Obsidian opens it" and apply the same brief-delay retry pattern.

## Documented inherited limitations

### Embedding-model-dependent score bands

The `score` field is pass-through from the plugin. Different embedding models (transformers.js local, OpenAI ada-002, OpenAI text-embedding-3-small, etc.) produce different score ranges and distributions. The wrapper does NOT clamp, normalise, or round. Agents comparing scores across vaults should confirm the embedding model is identical.

### Indexing freshness

Results reflect the plugin's last embedding pass, NOT the vault's current HEAD state. Recently edited or just-created notes may surface as `SOURCE_NOT_INDEXED` until the next indexing pass completes (plugin default debounce ≈ 5 s). For just-edited notes, the score may reflect the previous version of the body text.

### Folder exclusions in plugin config

The Smart Connections plugin honours user-configured folder exclusions silently — excluded folders' notes never appear in `env.smart_sources.items` and therefore never appear in the result list, nor surface `SOURCE_NOT_INDEXED` (they are simply absent). The wrapper has no visibility into the plugin's exclusion config.

### Plugin-version drift surfaces as `SMART_CONNECTIONS_NOT_READY`

No runtime version check. API drift between minor plugin releases that changes the `env.smart_sources.items[<key>].find_connections` path surfaces deterministically as `SMART_CONNECTIONS_NOT_READY` via Stage 4 of the JS template. The wrapper will NOT silently return wrong results for an incompatible plugin version.

### Multi-vault basename ambiguity

The `vault=` parameter routes correctly to the named vault's `app` instance, BUT the `file` (basename) lookup is per-vault. Two vaults with notes sharing the same basename will each resolve `file: "Note"` to their own `Note.md` — the wrapper does NOT attempt cross-vault disambiguation. Use `path` for unambiguous identification.

## Out-of-scope surfaces

- **Free-text semantic query** — single-source-note primitive only; use [`smart_connections_query`](./smart_connections_query.md).
- **Chat / RAG** — out of wrapper scope.
- **Embedding retrieval** — out of scope; the wrapper does NOT return raw embedding vectors.
- **Embedding generation trigger** — read-only surface; the wrapper does NOT trigger re-indexing.
- **Folder filters at request layer** — callers filter results client-side.
- **Threshold parameter** — model-dependent; deferred (callers filter by score client-side).
- **`exclude_self` request flag** — wrapper enforces source-path-keyed self-exclusion defence-in-depth regardless.
- **Cross-vault similarity** — single-vault per call.
- **Ranking-metadata discriminator** — collapsed into single `score` field.

## Practical ceiling

At `limit: 100`, each emitted entry is ~120 bytes (`{"path":"Folder/Note.md","headingPath":["H1","H2"],"score":0.85}`); 100 matches × 120 bytes ≈ 12 KiB, **four orders of magnitude** below the cli-adapter's 10 MiB cap. Cap-kill via `CLI_NON_ZERO_EXIT` is effectively unreachable in practice but contractually preserved.
