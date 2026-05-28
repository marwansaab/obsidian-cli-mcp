# `context_search`

## Overview

Return each match of a literal phrase in a vault as a single entry carrying the vault-relative file path, 1-based line number, and the matching line's text. Collapses the "find file → read file → locate line" grep-style three-call pattern into a single MCP call.

This tool is **vault-scoped** — there is no `target_mode` discriminator, no `file` / `path` / `active` argument. The optional `vault` field routes to a named vault; omitting it uses the focused vault.

## When to use this tool

| You want to | Reach for |
|---|---|
| Per-match line context with file path + line number | `context_search` |
| Just the file paths that contain the phrase | [`search`](./search.md) (smaller payload) |
| Regex query (not literal) | [`pattern_search`](./pattern_search.md) |
| Semantic similarity (not literal substring) | [`smart_connections_query`](./smart_connections_query.md) |
| Find notes by tag | [`tag`](./tag.md) |
| Find notes by frontmatter property value | [`find_by_property`](./find_by_property.md) |

## Input contract

`context_search` consumes the schema below. Every field is rejected at the boundary as `VALIDATION_ERROR` if the constraints fail. Unknown top-level keys are rejected (`additionalProperties: false`).

```json
{
  "query": "<text>",
  "folder": "<folder/path>",
  "limit": 100,
  "case_sensitive": false,
  "vault": "<vault name>"
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `query` | string | YES | length 1..1000, non-empty post-trim |
| `folder` | string | OPTIONAL | length ≥ 1; leading/trailing `/` stripped wrapper-side |
| `limit` | integer | OPTIONAL | inclusive 1..10000; defaults to implicit 1000 cap |
| `case_sensitive` | boolean | OPTIONAL | defaults to `false` (upstream case-insensitive ASCII-fold) |
| `vault` | string | OPTIONAL | length ≥ 1; routes to focused vault when omitted |

### Per-field policy

- **`query`** — phrase-matched as a single literal substring. Internal whitespace is preserved verbatim — `"foo bar"` matches `foo bar` but not `foobar` or `foo  bar`. Empty / whitespace-only is rejected with a custom validation issue on `path: ["query"]`.
- **`folder`** — vault-relative folder prefix; leading/trailing `/` are stripped before forwarding. `folder: "/"` alone normalises to empty and is omitted (effectively unscoped). Recursive subtree-prefix match — `folder=Projects` matches `Projects/foo.md`, `Projects/sub/bar.md`, and `Projects/a/b/c.md`. Case-sensitive segment-boundary equality enforced by upstream — `folder=Projects` does NOT match `projects/`.
- **`limit`** — caps the returned `matches` array (post-flatten, post-strip). The implicit cap is 1000.
- **`case_sensitive`** — when `true`, the wrapper sets the upstream `case` flag; otherwise upstream's default insensitivity (ASCII fold only) applies. Folding is ASCII-only — `É` does NOT match `é`.
- **`vault`** — the vault display name. Unknown vault → `CLI_REPORTED_ERROR` with `details.message: "Vault not found."`.

## Output shape

```json
{
  "count": 2,
  "matches": [
    { "path": "Projects/alpha.md", "line": 3,  "text": "<line 3 text>" },
    { "path": "Projects/beta.md",  "line": 12, "text": "<line 12 text>" }
  ]
}
```

With truncation:

```json
{
  "count": 1000,
  "matches": [{ "path": "...", "line": 1, "text": "..." }, "..."],
  "truncated": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `count` | integer ≥ 0 | Number of entries; equals `matches.length`. |
| `matches` | object[] | One entry per matching line; sorted by `path` asc then `line` asc. |
| `matches[].path` | string | Vault-relative `.md` path. |
| `matches[].line` | integer ≥ 1 | 1-based line number of the matching line. |
| `matches[].text` | string | Matching line content. Single trailing `\r` stripped. Capped at 500 chars + `…` (U+2026 ellipsis marker) if longer (final length 501 for capped lines). |
| `truncated` | `true` | OPTIONAL — present **only** when truncation fired (absent === `false`). |

### Truncation slice direction

When `truncated: true`, the response carries the **first N entries of the wrapper's deterministic sort**. Concretely: the wrapper sorts the full flattened collection by `(path asc, line asc)`, then takes `.slice(0, appliedCap)`. The visible subset under truncation is the leading N of the deterministic ordering — stable across runs for the same vault state.

### Zero-match handling

- `"No matches found."` on upstream stdout AND `folder` was **not** supplied: returns the empty envelope `{ count: 0, matches: [] }`. **Never** an error.
- `"No matches found."` on upstream stdout AND `folder` **was** supplied: the wrapper fires a second `obsidian folder path=<folder>` probe to distinguish "folder exists with no matches" from "folder missing". If the probe succeeds, the empty envelope is returned. If the probe raises `CLI_REPORTED_ERROR` (the dispatch classifier catches the upstream `Error: Folder "X" not found.` stdout), the error propagates verbatim.

### Locator non-echo

The response carries `count`, `matches`, and optionally `truncated` only. `vault`, `query`, `folder`, `limit`, and `case_sensitive` are never echoed in the response.

## Worked examples

### Example 1 — Minimal happy path

```json
{
  "name": "context_search",
  "arguments": { "query": "TODO" }
}
```

Response:

```json
{
  "count": 4,
  "matches": [
    { "path": "Daily/2026-05-17.md", "line": 8,  "text": "- [ ] TODO: ship BI-035 plan" },
    { "path": "Notes/release.md",    "line": 22, "text": "TODO: confirm release manager" },
    { "path": "Notes/release.md",    "line": 31, "text": "  - TODO: bump version in package.json" },
    { "path": "Projects/auth.md",    "line": 5,  "text": "Status: TODO" }
  ]
}
```

### Example 2 — Folder-scoped + case-sensitive

```json
{
  "name": "context_search",
  "arguments": { "query": "getUser", "folder": "Projects/api", "case_sensitive": true }
}
```

Response:

```json
{
  "count": 2,
  "matches": [
    { "path": "Projects/api/auth/login.md",   "line": 12, "text": "function getUser(id) {" },
    { "path": "Projects/api/users/lookup.md", "line": 5,  "text": "getUser is the canonical resolver." }
  ]
}
```

Equivalent forms — `folder: "/Projects/api"`, `folder: "Projects/api/"`, `folder: "/Projects/api/"` all normalise to `Projects/api`. `folder: "/"` alone normalises to empty and is treated as no folder restriction.

### Example 3 — Capped + truncated

```json
{
  "name": "context_search",
  "arguments": { "query": "the", "limit": 50 }
}
```

Response (against a vault with > 50 hits):

```json
{
  "count": 50,
  "matches": [
    { "path": "Daily/2024-01-01.md", "line": 3, "text": "the morning routine continues..." },
    "...",
    { "path": "Worknotes/team.md", "line": 17, "text": "the team agreed to ..." }
  ],
  "truncated": true
}
```

Truncation is conservative — `truncated: true` fires when **either** the post-flatten match-count exceeds the applied cap, **or** the underlying file-count equals the applied cap.

### Example 4 — Folder-not-found error path

```json
{
  "name": "context_search",
  "arguments": { "query": "anything", "folder": "DoesNotExist" }
}
```

Sequence:
1. First call: `obsidian search:context query=anything path=DoesNotExist format=json limit=1000`.
2. Upstream returns the zero-match sentinel `"No matches found.\n"`.
3. Handler detects sentinel AND `folder` was supplied → fires the second-call existence probe: `obsidian folder path=DoesNotExist`.
4. Upstream `folder` returns stdout `Error: Folder "DoesNotExist" not found.` with exit 0.
5. The error propagates verbatim — no wrapping, no re-classification.

Error envelope:

```json
{
  "code": "CLI_REPORTED_ERROR",
  "message": "Error: Folder \"DoesNotExist\" not found.",
  "details": {
    "command": "folder",
    "stdout": "Error: Folder \"DoesNotExist\" not found.\n",
    "stderr": "",
    "exitCode": 0,
    "message": "Error: Folder \"DoesNotExist\" not found."
  }
}
```

Distinguishing outcomes:

| Outcome | Response | Detect via |
|---------|----------|-----------|
| Folder exists, matches found | `{count: N, matches: [...]}` | `count > 0` |
| Folder exists, no matches | `{count: 0, matches: []}` | `count === 0` + no error thrown |
| Folder missing | `UpstreamError` | `code === "CLI_REPORTED_ERROR"` + `details.message.startsWith('Error: Folder ')` |
| Vault missing | `UpstreamError` | `code === "CLI_REPORTED_ERROR"` + `details.message === "Vault not found."` |

### Example 5 — Mixed CRLF / LF source

Vault contents:

- `Notes/win.md` (CRLF endings): line 1 `Hello world\r\n`.
- `Notes/mac.md` (LF endings): line 1 `Hello there\n`.

```json
{
  "name": "context_search",
  "arguments": { "query": "Hello", "vault": "WorkNotes" }
}
```

Response:

```json
{
  "count": 2,
  "matches": [
    { "path": "Notes/mac.md", "line": 1, "text": "Hello there" },
    { "path": "Notes/win.md", "line": 1, "text": "Hello world" }
  ]
}
```

Both `text` fields are `\r`-free. The Windows-CRLF source's trailing `\r` was stripped wrapper-side. Indented Markdown lists, code-block content, and intentional trailing spaces (Markdown hard-break) are preserved verbatim — only the trailing `\r` is stripped.

### Example 6 — Validation rejection

```json
{
  "name": "context_search",
  "arguments": { "query": "   " }
}
```

Whitespace-only `query` fails the schema:

```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "{\"code\":\"VALIDATION_ERROR\",\"message\":\"context_search input failed schema validation\",\"details\":{\"issues\":[{\"path\":[\"query\"],\"message\":\"query is empty or whitespace-only\",\"code\":\"custom\"}]}}"
  }]
}
```

## Error roster

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed the schema: missing / empty / whitespace-only / oversize `query`; `limit` out of `1..10000` or non-integer; unknown top-level key; empty `vault` / `folder`. | Retry with corrected input. `details.issues` carries per-issue zod context. |
| `CLI_REPORTED_ERROR` | (a) CLI stdout was not JSON AND not the zero-match sentinel (`details.stage: "json-parse"`); (b) CLI JSON failed wire-schema parse (`details.stage: "wire-parse"`); (c) folder-not-found (`details.message` starts `Error: Folder`); (d) unknown vault (`details.message: "Vault not found."`). | (a)+(b) investigate as an upstream-contract regression; (c) supply a valid folder, or use the no-`folder` form to scan the whole vault; (d) supply a valid vault name. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (typical cause: output-cap kill on extreme result sets). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Reduce scope with `folder`, `limit`, or a narrower `query`. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN`. |
| `CLI_TIMEOUT` | The CLI exceeded the 10-second typed-tool timeout. | Reduce scope with `folder`, `limit`, or a narrower `query`. |
| `CLI_OUTPUT_TOO_LARGE` | The CLI's stdout exceeded the 10 MiB output cap. | Reduce scope; raising `limit` is NOT a recovery (the cap is on bytes, not entries). |

## Behavioural notes

### Single-call architecture (no probe path)

When `folder` is omitted or `folder: "/"` alone is supplied, each MCP request fires exactly **one** `invokeCli` invocation.

### Two-call architecture (probe path)

When `folder` is supplied AND the first call returns the zero-match sentinel, the handler fires a second `obsidian folder` call to distinguish "folder exists with no matches" from "folder missing". Two-call latency is approximately 2× a single-call typed tool, but only fires on the cold-error path.

### Conservative truncation

`truncated: true` fires when **either** the post-flatten match-count exceeds the applied cap, **or** the underlying file-count equals the applied cap. The second condition is conservative — it may fire when no actual drop occurred — but preserves correctness over precision.

### Empty `matches: []` entries dropped

Files where upstream returned `matches: []` (filename-only matches with no body-text hit) are dropped silently during flatten. Consequence: `context_search`'s `count` can be less than `search`'s `count` for the same query against the same vault.

### Non-`.md` files never appear

Upstream natively restricts to `.md`; the wrapper defensively re-filters via `endsWith(".md")`. `.canvas`, `.pdf`, etc. never reach the caller.

### CRLF normalisation

Each match's `text` field has a single trailing `\r` stripped before the 500-char cap is measured. Embedded mid-line `\r` characters are NOT stripped; trailing spaces before the `\r` are preserved verbatim.

### Folder matching is case-sensitive byte-equal

`folder=Projects` does NOT match `projects/`. This is not affected by the `case_sensitive` flag (which governs the query text, not the folder filter).

### Case-insensitive mode is ASCII-fold only

When `case_sensitive: false` (the default), folding is ASCII-only — Latin-1 accented characters are NOT case-folded against each other. `É` in the query does NOT match `é` in the body. Use `case_sensitive: true` when exact-case matching across non-ASCII is required.

## Migration from `search` with `context_lines=true`

The shipped [`search`](./search.md) tool's `context_lines=true` mode is retained for backward compatibility but is **deprecated** — prefer `context_search` for per-line-context queries.

If you currently call:

```json
{ "name": "search", "arguments": { "query": "TODO", "context_lines": true, "limit": 50, "folder": "Notes" } }
```

migrate by:

1. Change the tool name from `search` to `context_search`.
2. Drop the `context_lines` field.

Same response shape; same `truncated` semantics; identical sort order. Two behavioural differences:

- **CRLF strip**: the new tool strips trailing `\r` from `text`; `search`'s line-mode does not.
- **Folder-not-found**: the new tool surfaces a structured `CLI_REPORTED_ERROR` for a missing folder; `search`'s line-mode returns `count=0`.

## Inherited limitations

### Output-cap ceiling

Very large vaults may exceed the 10 MiB output cap and surface as `CLI_NON_ZERO_EXIT` or `CLI_OUTPUT_TOO_LARGE`. Narrow the scope with `folder`, tighten `query`, or lower `limit`.

### No relevance ranking

Upstream returns results in its own order; the wrapper imposes a deterministic sort by `(path, line)` ascending. No TF-IDF / BM25 / fuzzy ranking is exposed. Callers needing semantic similarity use [`smart_connections_query`](./smart_connections_query.md) instead.

### No regex / boolean / surrounding-context

Upstream is substring-only — no regex queries (use [`pattern_search`](./pattern_search.md) for that), no `AND` / `OR` boolean operators, no surrounding-context-lines (lines `N±k`). Each match entry contains exactly the matching line itself.

### Latency

Approximately 1× a single-call typed tool typical; up to 2× on the cold folder-not-found probe path.
