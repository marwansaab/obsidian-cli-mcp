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
| `case_sensitive` | boolean | OPTIONAL | defaults to `false` (upstream case-insensitive, accented letters included) |
| `context_lines` | boolean | OPTIONAL | **deprecated — prefer [`context_search`](./context_search.md).** Defaults to `false` |
| `vault` | string | OPTIONAL | length ≥ 1; routes to focused vault when omitted |

### Per-field policy

- **`query`** — phrase-matched as a single literal substring. Internal whitespace preserved verbatim — `"foo bar"` matches `foo bar` but not `foobar` or `foo  bar`. Empty / whitespace-only rejected. The whole query is one literal phrase: its words must appear together, in order, with the same spacing. It matches anywhere its characters occur, including part-way through a word: `ead170` finds `lead170`, `TC-0078` finds `TC-00783`, and `pha bet` finds `alpha beta`. Characters that mean something in Obsidian's own search box (double quotes, a leading `-`, `OR`, parentheses, square brackets, `tag:` / `path:` / `file:`-style prefixes, `/…/`, `*`, `\`) are matched as ordinary text; nothing needs escaping.
- **`folder`** — vault-relative folder prefix; leading/trailing `/` stripped. `folder: "/"` alone normalises to empty (unscoped). Case-sensitive segment-boundary match enforced by upstream — `folder=Projects` does NOT match `projects/`.
- **`limit`** — caps the returned array. Implicit cap is 1000.
- **`case_sensitive`** — when `true`, upstream's `case` flag is set; otherwise case-insensitive, accented letters included — `CAFÉ` matches `café`.
- **`context_lines`** — **deprecated.** When `true`, routes to `obsidian search:context` and returns line-level matches; otherwise routes to `obsidian search` and returns paths only. For per-line context, prefer [`context_search`](./context_search.md).
- **`vault`** — the vault display name. Unknown vault → `CLI_REPORTED_ERROR` with message and `details.message` `"Vault not found."` (no `details.code`).

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
| `matches` | object[] | One entry per matching line; sorted by `path` asc then `line` asc. Each matching line appears once, however many times the phrase occurs in it. |
| `matches[].path` | string | Vault-relative `.md` path. |
| `matches[].line` | integer ≥ 1 | 1-based line number of the matching line. |
| `matches[].text` | string | Matching-line content, capped at 500 chars + `…` (U+2026 ellipsis marker) if longer. |
| `truncated` | `true` | OPTIONAL — present only when truncation fired (absent === `false`). |

### Truncation slice direction

The wrapper does **not** forward your `limit` to upstream — it requests the entire match set, sorts it wrapper-side (UTF-16 ascending over paths for default mode; `(path asc, line asc)` for line mode), then takes `.slice(0, appliedCap)`. So the visible subset is always the **leading N of the deterministic ordering across the full match set**, never the leading N of upstream's own opaque result order. This holds whether or not truncation fired; when `truncated: true`, the slice dropped entries beyond position N. The ordering is stable across runs for the same vault state.

### Zero-match handling

`"No matches found."` on upstream stdout returns the empty envelope — `{ count: 0, paths: [] }` in default mode or `{ count: 0, matches: [] }` in line mode. **Never** an error.

## Examples — Worked examples

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

Routes to the named vault; an unknown vault surfaces as `CLI_REPORTED_ERROR` with `details.message: "Vault not found."`.

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
    "text": "{\"code\":\"VALIDATION_ERROR\",\"message\":\"search input failed schema validation\",\"details\":{\"issues\":[{\"path\":[\"query\"],\"message\":\"query is empty or whitespace-only (FR-010)\",\"code\":\"custom\"}]}}"
  }]
}
```

## Errors — Error roster

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed the schema (missing / empty / whitespace-only / oversize `query`; non-integer or out-of-range `limit`; empty `vault` / `folder`; unknown top-level key). | Retry with corrected input. `details.issues` carries per-issue zod context. |
| `CLI_REPORTED_ERROR` | (a) Upstream stdout was not JSON AND not the zero-match sentinel (`details.stage: "json-parse"`); (b) CLI JSON failed wire-schema parse (`details.stage: "wire-parse"`); (c) unknown vault (`details.message: "Vault not found."`, no `details.code`). | (a)+(b) investigate as an upstream-contract regression; (c) supply a valid vault name. |
| `CLI_NON_ZERO_EXIT` | Output-cap kill on extreme result sets. | Reduce scope with `folder` or a narrower `query` (lowering `limit` does not reduce upstream output bytes). |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN`. |
| `CLI_TIMEOUT` | Exceeded the 10-second timeout. | Reduce scope. |
| `CLI_OUTPUT_TOO_LARGE` | Output exceeded the 10 MiB cap. | Reduce scope; raising `limit` is NOT a recovery (the cap is on bytes, not entries). |

## Behavioural notes

### Filename-match inflation (default mode)

The default-mode result set may include files whose **filename** or metadata contains the query, even when no body line literally contains it. `query=Welcome` returns `Welcome.md` because the filename matches; the body need not contain "Welcome" at all. This is upstream behaviour and is preserved. The file name or metadata must contain the whole phrase.

### Line-mode count divergence

Line mode (`context_lines: true`) returns ONLY entries whose `matches` array was non-empty after upstream evaluation. Files matched by filename / metadata but with no body-line hit are dropped. Consequence: `count` in line mode can be **less than** `count` in default mode for the same query.

### Conservative truncation in line mode

`truncated: true` in line mode fires when the post-flatten match count is **greater than or equal to** the applied cap. The boundary case — flattened match count exactly equal to the cap, with nothing actually dropped — still fires; this is conservative (it may report `truncated` when no entry was removed) but preserves correctness over precision. Default mode is precise by contrast: it fires only when the match count **strictly exceeds** the cap.

### Non-`.md` files never appear

Upstream natively restricts to `.md`; the wrapper defensively re-filters via `endsWith(".md")`. `.canvas`, `.pdf`, etc. never reach the caller.

### Folder matching is case-sensitive byte-equal

`folder=Projects` does NOT match `projects/`. This is not affected by the `case_sensitive` flag (which governs the query text, not the folder filter).

### Case-insensitive mode folds accented letters too

When `case_sensitive: false` (the default), matching ignores case for accented letters as well as ASCII ones: `CAFÉ CRÈME` in the query matches `café crème` in the body (observed live, spec 087 research F7 and BI-0174). Use `case_sensitive: true` when the case must match exactly; then `CAFÉ` does not match `café`.

## Inherited limitations

### Output-cap ceiling

The wrapper requests the entire match set from upstream (it does **not** forward `limit`), so the full result set always crosses the CLI-to-wrapper pipe before the wrapper sorts and slices it. A common-term query against a very large vault may exceed the 10 MiB output cap and surface as `CLI_NON_ZERO_EXIT` / `CLI_OUTPUT_TOO_LARGE`. Narrow the scope with `folder` or a tighter `query`. Lowering `limit` does **not** help — the cap is on the bytes upstream emits, which the wrapper-side slice does not change.

### No relevance ranking

Upstream returns results in its own order; the wrapper imposes a deterministic sort. No TF-IDF / BM25 / fuzzy ranking is exposed. For semantic similarity use [`smart_connections_query`](./smart_connections_query.md).

### No `total: true` count-only mode

The `truncated` flag carries the "did we hit the cap?" signal; explicit pre-flight counting is not exposed.

### No regex / boolean / surrounding-context

The query is matched as one literal substring; boolean operators such as `OR` are matched as text. This section used to say upstream itself is substring-only. It is not: `obsidian search` reads Obsidian search syntax. The wrapper sends the query as one escaped regular expression, `/…/` with every regex syntax character and `/` escaped, so the CLI matches its characters literally, anywhere, including inside a word (spec 087, BI-0175). For regex use [`pattern_search`](./pattern_search.md). For surrounding-context lines (`N±k`) — not supported in either tool.

### Latency

Approximately 1× a single-call typed tool typical.
