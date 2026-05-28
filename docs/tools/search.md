# `search`

## Overview

Return the vault-relative paths of every Markdown note whose body or filename contains a query string, OR the per-line matches with surrounding text (deprecated mode — prefer [`context_search`](./context_search.md)).

This tool is **vault-scoped** — there is no `target_mode` discriminator, no `file` / `path` / `active` argument. The optional `vault` field routes to a named vault; omitting it uses the focused vault.

> **DEPRECATION**: `context_lines: true` mode is retained for backward compatibility but is **deprecated** — call [`context_search`](./context_search.md) instead for per-line-context queries. The dedicated tool ships CRLF normalisation, structured folder-not-found errors, and a cleaner shape. `context_lines=true` will be removed in a future release.

## When to use this tool

| You want to | Reach for |
|---|---|
| Just the file paths that contain the phrase (lightest payload) | `search` |
| Per-match line context with file path + line number | [`context_search`](./context_search.md) |
| Regex query (not literal substring) | [`pattern_search`](./pattern_search.md) |
| Find-AND-REPLACE matched text (preview then commit) | [`find_and_replace`](./find_and_replace.md) |
| Semantic similarity, not substring | [`smart_connections_query`](./smart_connections_query.md) |
| Find notes by tag | [`tag`](./tag.md) |
| Find notes by frontmatter property value | [`find_by_property`](./find_by_property.md) |
| Enumerate notes by folder structure (no body-text query) | [`files`](./files.md) or [`paths`](./paths.md) |

## Input contract

`search` consumes the schema below. Every field is rejected at the boundary as `VALIDATION_ERROR` if the constraints fail. Unknown top-level keys are rejected (`additionalProperties: false`).

```json
{
  "query": "<text>",
  "folder": "<folder/path>",
  "limit": 100,
  "case_sensitive": false,
  "context_lines": false,
  "vault": "<vault name>"
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `query` | string | YES | length 1..1000, non-empty post-trim |
| `folder` | string | OPTIONAL | length ≥ 1; leading/trailing `/` stripped wrapper-side |
| `limit` | integer | OPTIONAL | inclusive 1..10000; defaults to implicit 1000 cap |
| `case_sensitive` | boolean | OPTIONAL | defaults to `false` (upstream case-insensitive ASCII-fold) |
| `context_lines` | boolean | OPTIONAL | **deprecated — prefer [`context_search`](./context_search.md).** Defaults to `false` |
| `vault` | string | OPTIONAL | length ≥ 1; routes to focused vault when omitted |

### Per-field policy

- **`query`** — phrase-matched as a single literal substring. Internal whitespace preserved verbatim — `"foo bar"` matches `foo bar` but not `foobar` or `foo  bar`. Empty / whitespace-only rejected.
- **`folder`** — vault-relative folder prefix; leading/trailing `/` stripped. `folder: "/"` alone normalises to empty (unscoped). Case-sensitive segment-boundary match enforced by upstream — `folder=Projects` does NOT match `projects/`.
- **`limit`** — caps the returned array. Implicit cap is 1000.
- **`case_sensitive`** — when `true`, upstream's `case` flag is set; otherwise ASCII-fold case-insensitive. Folding is ASCII-only — `É` does NOT match `é`.
- **`context_lines`** — **deprecated.** When `true`, routes to `obsidian search:context` and returns line-level matches; otherwise routes to `obsidian search` and returns paths only. For per-line context, prefer [`context_search`](./context_search.md).
- **`vault`** — the vault display name. Unknown vault → `CLI_REPORTED_ERROR` with `details.code: "VAULT_NOT_FOUND"`.

## Output shape

Two output shapes, picked at the response boundary based on `context_lines`.

### Default mode (`context_lines !== true`)

```json
{
  "count": 2,
  "paths": ["Projects/alpha.md", "Projects/beta.md"]
}
```

With truncation:

```json
{
  "count": 1000,
  "paths": ["..."],
  "truncated": true
}
```

### Line mode (`context_lines: true`, deprecated)

```json
{
  "count": 2,
  "matches": [
    { "path": "Projects/alpha.md", "line": 3, "text": "<line 3 text>" },
    { "path": "Projects/beta.md",  "line": 12, "text": "<line 12 text>" }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `count` | integer ≥ 0 | Number of entries; equals `paths.length` (default) or `matches.length` (line). |
| `paths` | string[] | Vault-relative paths. Sorted UTF-16 ascending. Only `.md` files. |
| `matches` | object[] | One entry per matching line; sorted by `path` asc then `line` asc. |
| `matches[].path` | string | Vault-relative `.md` path. |
| `matches[].line` | integer ≥ 1 | 1-based line number of the matching line. |
| `matches[].text` | string | Matching-line content, capped at 500 chars + `…` (U+2026 ellipsis marker) if longer. |
| `truncated` | `true` | OPTIONAL — present only when truncation fired (absent === `false`). |

### Truncation slice direction

When `truncated: true`, the response carries the **first N entries of the wrapper's deterministic sort**. The wrapper sorts the full collection first (UTF-16 ascending for default mode; `(path asc, line asc)` for line mode), then takes `.slice(0, appliedCap)`. The visible subset under truncation is the leading N of the deterministic ordering — stable across runs for the same vault state.

### Zero-match handling

`"No matches found."` on upstream stdout returns the empty envelope — `{ count: 0, paths: [] }` in default mode or `{ count: 0, matches: [] }` in line mode. **Never** an error.

## Worked examples

### Example 1 — Minimal default-mode call

```json
{ "name": "search", "arguments": { "query": "Welcome" } }
```

Response:

```json
{
  "count": 2,
  "paths": ["Fixtures/BI-017/inline-markdown.md", "Welcome.md"]
}
```

`Welcome.md` is included even though no body line literally contains "Welcome" — the upstream matches against filenames and metadata too. See *Filename-match inflation* below.

### Example 2 — Line mode (deprecated; prefer `context_search`)

```json
{ "name": "search", "arguments": { "query": "Welcome", "context_lines": true } }
```

Response:

```json
{
  "count": 1,
  "matches": [
    { "path": "Fixtures/BI-017/inline-markdown.md", "line": 7, "text": "### [Wikilink](Welcome) text" }
  ]
}
```

`Welcome.md` does NOT appear in line-mode because no body line literally contains "Welcome" — see *Line-mode count divergence*.

### Example 3 — Folder-scoped call

```json
{ "name": "search", "arguments": { "query": "Welcome", "folder": "Fixtures" } }
```

```json
{
  "count": 1,
  "paths": ["Fixtures/BI-017/inline-markdown.md"]
}
```

Equivalent forms — `folder: "/Fixtures"`, `folder: "Fixtures/"`, `folder: "/Fixtures/"` all normalise to `Fixtures`. `folder: "/"` alone normalises to empty (no folder restriction).

### Example 4 — Capped result with `truncated: true`

```json
{ "name": "search", "arguments": { "query": "the", "limit": 3 } }
```

Response (against a vault with > 3 hits):

```json
{
  "count": 3,
  "paths": ["a.md", "b.md", "c.md"],
  "truncated": true
}
```

### Example 5 — Case-sensitive query

```json
{ "name": "search", "arguments": { "query": "Welcome", "case_sensitive": true } }
```

Only files whose text contains an exact-case "Welcome" appear.

### Example 6 — Cross-vault routing

```json
{ "name": "search", "arguments": { "query": "alpha", "vault": "ResearchVault" } }
```

Routes to the named vault; an unknown vault surfaces as `CLI_REPORTED_ERROR(VAULT_NOT_FOUND)`.

### Example 7 — Validation rejection

```json
{ "name": "search", "arguments": { "query": "   " } }
```

Whitespace-only `query` fails the schema:

```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "{\"code\":\"VALIDATION_ERROR\",\"message\":\"search input failed schema validation\",\"details\":{\"issues\":[{\"path\":[\"query\"],\"message\":\"query is empty or whitespace-only\",\"code\":\"custom\"}]}}"
  }]
}
```

## Error roster

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed the schema (missing / empty / whitespace-only / oversize `query`; non-integer or out-of-range `limit`; empty `vault` / `folder`; unknown top-level key). | Retry with corrected input. `details.issues` carries per-issue zod context. |
| `CLI_REPORTED_ERROR` | (a) Upstream stdout was not JSON AND not the zero-match sentinel (`details.stage: "json-parse"`); (b) CLI JSON failed wire-schema parse (`details.stage: "wire-parse"`); (c) unknown vault (`details.code: "VAULT_NOT_FOUND"`). | (a)+(b) investigate as an upstream-contract regression; (c) supply a valid vault name. |
| `CLI_NON_ZERO_EXIT` | Output-cap kill on extreme result sets. | Reduce scope with `folder`, `limit`, or a narrower `query`. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN`. |
| `CLI_TIMEOUT` | Exceeded the 10-second timeout. | Reduce scope. |
| `CLI_OUTPUT_TOO_LARGE` | Output exceeded the 10 MiB cap. | Reduce scope; raising `limit` is NOT a recovery (the cap is on bytes, not entries). |

## Behavioural notes

### Filename-match inflation (default mode)

The default-mode result set may include files whose **filename** or metadata contains the query, even when no body line literally contains it. `query=Welcome` returns `Welcome.md` because the filename matches; the body need not contain "Welcome" at all. This is upstream behaviour and is preserved.

### Line-mode count divergence

Line mode (`context_lines: true`) returns ONLY entries whose `matches` array was non-empty after upstream evaluation. Files matched by filename / metadata but with no body-line hit are dropped. Consequence: `count` in line mode can be **less than** `count` in default mode for the same query.

### Conservative truncation in line mode

`truncated: true` in line mode fires when **either** the post-flatten match-count exceeds the applied cap, **or** the underlying file-count equals the applied cap. The second condition is conservative — it may fire when no actual drop occurred — but preserves correctness over precision.

### Non-`.md` files never appear

Upstream natively restricts to `.md`; the wrapper defensively re-filters via `endsWith(".md")`. `.canvas`, `.pdf`, etc. never reach the caller.

### Folder matching is case-sensitive byte-equal

`folder=Projects` does NOT match `projects/`. This is not affected by the `case_sensitive` flag (which governs the query text, not the folder filter).

### Case-insensitive mode is ASCII-fold only

When `case_sensitive: false` (the default), folding is ASCII-only — Latin-1 accented characters are NOT case-folded against each other. `É` in the query does NOT match `é` in the body. Use `case_sensitive: true` when exact-case matching across non-ASCII is required.

## Inherited limitations

### Output-cap ceiling

Very large vaults may exceed the 10 MiB output cap and surface as `CLI_NON_ZERO_EXIT`. Narrow the scope with `folder`, tighten `query`, or lower `limit`.

### No relevance ranking

Upstream returns results in its own order; the wrapper imposes a deterministic sort. No TF-IDF / BM25 / fuzzy ranking is exposed. For semantic similarity use [`smart_connections_query`](./smart_connections_query.md).

### No `total: true` count-only mode

The `truncated` flag carries the "did we hit the cap?" signal; explicit pre-flight counting is not exposed.

### No regex / boolean / surrounding-context

Upstream is substring-only. For regex use [`pattern_search`](./pattern_search.md). For surrounding-context lines (`N±k`) — not supported in either tool.

### Latency

Approximately 1× a single-call typed tool typical.
