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
| `case_sensitive` | boolean | OPTIONAL | defaults to `false` (upstream case-insensitive, accented letters included) |
| `vault` | string | OPTIONAL | length ≥ 1; routes to focused vault when omitted |

### Per-field policy

- **`query`** — phrase-matched as a single literal substring. Internal whitespace is preserved verbatim — `"foo bar"` matches `foo bar` but not `foobar` or `foo  bar`. Empty / whitespace-only is rejected with a custom validation issue on `path: ["query"]`. The whole query is one literal phrase: its words must appear together, in order, with the same spacing. It matches anywhere its characters occur, including part-way through a word: `ead170` finds `lead170`, `TC-0078` finds `TC-00783`, and `pha bet` finds `alpha beta`. Characters that mean something in Obsidian's own search box (double quotes, a leading `-`, `OR`, parentheses, square brackets, `tag:` / `path:` / `file:`-style prefixes, `/…/`, `*`, `\`) are matched as ordinary text; nothing needs escaping.
- **`folder`** — vault-relative folder prefix; leading/trailing `/` are stripped before forwarding. `folder: "/"` alone normalises to empty and is omitted (effectively unscoped). Recursive subtree-prefix match — `folder=Projects` matches `Projects/foo.md`, `Projects/sub/bar.md`, and `Projects/a/b/c.md`. Case-sensitive segment-boundary equality enforced by upstream — `folder=Projects` does NOT match `projects/`.
- **`limit`** — caps the returned `matches` array (post-flatten, post-strip). The implicit cap is 1000.
- **`case_sensitive`** — when `true`, the wrapper sets the upstream `case` flag; otherwise upstream's default case-insensitive matching applies, accented letters included — `CAFÉ` matches `café`.
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
| `matches` | object[] | One entry per matching line; sorted by `path` asc then `line` asc. Each matching line appears once, however many times the phrase occurs in it. |
| `matches[].path` | string | Vault-relative `.md` path. |
| `matches[].line` | integer ≥ 1 | 1-based line number of the matching line. |
| `matches[].text` | string | Matching line content. Single trailing `\r` stripped. Capped at 500 chars + `…` (U+2026 ellipsis marker) if longer (final length 501 for capped lines). |
| `truncated` | `true` | OPTIONAL — present **only** when truncation fired (absent === `false`). |

### Truncation slice direction

The wrapper does **not** forward your `limit` to upstream — it requests the entire match set, then sorts the full flattened collection by `(path asc, line asc)` and takes `.slice(0, appliedCap)`. So the visible subset is always the **leading N of the deterministic ordering across the full match set**, never the leading N of upstream's own opaque result order. This holds whether or not truncation fired; when `truncated: true`, the slice dropped entries beyond position N. The ordering is stable across runs for the same vault state.

### Zero-match handling

- `"No matches found."` on upstream stdout AND `folder` was **not** supplied: returns the empty envelope `{ count: 0, matches: [] }`. **Never** an error.
- `"No matches found."` on upstream stdout AND `folder` **was** supplied: the wrapper fires a second `obsidian folder path=<folder>` probe to distinguish "folder exists with no matches" from "folder missing". If the probe succeeds, the empty envelope is returned. If the probe raises `CLI_REPORTED_ERROR` (the dispatch classifier catches the upstream `Error: Folder "X" not found.` stdout), that error is returned wrapped: the top-level `message` is the generic `CLI bridge upstream error: CLI_REPORTED_ERROR`, and Obsidian's line is in `details.message`. Branch on `details.command` and `details.message`.

### Locator non-echo

The response carries `count`, `matches`, and optionally `truncated` only. `vault`, `query`, `folder`, `limit`, and `case_sensitive` are never echoed in the response.

## Examples — Worked examples

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

Truncation is conservative — `truncated: true` fires when the post-flatten match count is **greater than or equal to** the applied cap (so the boundary case of exactly `limit` matches with no actual drop still fires).

### Example 4 — Folder-not-found error path

```json
{
  "name": "context_search",
  "arguments": { "query": "anything", "folder": "DoesNotExist" }
}
```

Sequence:
1. First call: `obsidian search:context query="anything" path=DoesNotExist format=json` (no `limit` is forwarded — the wrapper requests the full match set).
2. Upstream returns the zero-match sentinel `"No matches found.\n"`.
3. Handler detects sentinel AND `folder` was supplied → fires the second-call existence probe: `obsidian folder path=DoesNotExist`.
4. Upstream `folder` returns stdout `Error: Folder "DoesNotExist" not found.` with exit 0.
5. The dispatch layer returns it as `CLI_REPORTED_ERROR` with the generic top-level message; Obsidian's line is kept in `details.message`. No re-classification.

Error envelope:

```json
{
  "code": "CLI_REPORTED_ERROR",
  "message": "CLI bridge upstream error: CLI_REPORTED_ERROR",
  "details": {
    "argv": ["<obsidian binary>", "folder", "path=DoesNotExist"],
    "command": "folder",
    "stdout": "Error: Folder \"DoesNotExist\" not found.\n",
    "stderr": "",
    "exitCode": 0,
    "message": "Error: Folder \"DoesNotExist\" not found."
  }
}
```

The top-level `message` is the generic CLI-bridge text; branch on `details.command === "folder"` and `details.message`, never on the top-level `message`.

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
    "text": "{\"code\":\"VALIDATION_ERROR\",\"message\":\"context_search input failed schema validation\",\"details\":{\"issues\":[{\"path\":[\"query\"],\"message\":\"query is empty or whitespace-only (FR-008)\",\"code\":\"custom\"}]}}"
  }]
}
```

## Errors — Error roster

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed the schema: missing / empty / whitespace-only / oversize `query`; `limit` out of `1..10000` or non-integer; unknown top-level key; empty `vault` / `folder`. Clients that check the published schema themselves (Cowork) reject an out-of-range `limit` before the call with MCP transport error `-32602` (Invalid Params) instead, and strip an unknown top-level key, so neither reaches this code there. | Retry with corrected input. `details.issues` carries per-issue zod context. |
| `CLI_REPORTED_ERROR` | (a) CLI stdout was not JSON AND not the zero-match sentinel (`details.stage: "json-parse"`); (b) CLI JSON failed wire-schema parse (`details.stage: "wire-parse"`); (c) folder-not-found (`details.message` starts `Error: Folder`); (d) unknown vault (`details.message: "Vault not found."`); (e) a matched line could not be read back (`details.code: "MATCH_LINE_UNAVAILABLE"`, `details.reason` `note-not-found` / `read-failed` / `line-changed`, with `details.path` and `details.line`); (f) the read-back call's answer was not JSON (`details.stage: "json-parse"`) or had an unexpected shape (`details.stage: "envelope-parse"`). | (a)+(b)+(f) investigate as an upstream-contract regression; (c) supply a valid folder, or use the no-`folder` form to scan the whole vault; (d) supply a valid vault name; (e) run the search again; the note changed while the search ran. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (typical cause: output-cap kill on extreme result sets). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Reduce scope with `folder` or a narrower `query` (lowering `limit` does not reduce upstream output bytes). |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN`. |
| `CLI_TIMEOUT` | The CLI exceeded the 10-second typed-tool timeout. | Reduce scope with `folder` or a narrower `query`. |
| `CLI_OUTPUT_TOO_LARGE` | The CLI's stdout exceeded the 10 MiB output cap. | Reduce scope; raising `limit` is NOT a recovery (the cap is on bytes, not entries). |

## Behavioural notes

### Calls per request

When the search finds lines, context_search reads those lines back from the notes with one more Obsidian call (more for very large results), because Obsidian's search reports each line with its surrounding whitespace removed. A search that finds no lines makes exactly one call, except for the folder probe below, which is unchanged.

### Two-call architecture (probe path)

When `folder` is supplied AND the first call returns the zero-match sentinel, the handler fires a second `obsidian folder` call to distinguish "folder exists with no matches" from "folder missing". Two-call latency is approximately 2× a single-call typed tool, but only fires on the cold-error path.

### Conservative truncation

`truncated: true` fires when the post-flatten match count is **greater than or equal to** the applied cap. The boundary case — flattened match count exactly equal to the cap, with nothing actually dropped — still fires; this is conservative (it may report `truncated` when no entry was removed) but preserves correctness over precision. This is the same rule as [`search`](./search.md)'s line mode.

### Empty `matches: []` entries dropped

Files where upstream returned `matches: []` (filename-only matches with no body-text hit) are dropped silently during flatten. Consequence: `context_search`'s `count` can be less than `search`'s `count` for the same query against the same vault.

### Non-`.md` files never appear

Upstream natively restricts to `.md`; the wrapper defensively re-filters via `endsWith(".md")`. `.canvas`, `.pdf`, etc. never reach the caller.

### CRLF normalisation

Each match's `text` is the matching line exactly as it is in the note, without its line ending (`\n` or `\r\n`). Leading and trailing spaces, tabs and other whitespace are kept, and so is a `\r` in the middle of a line. Text longer than 500 characters is cut to 500 and followed by `…`; leading whitespace counts towards the 500.

### Folder matching is case-sensitive byte-equal

`folder=Projects` does NOT match `projects/`. This is not affected by the `case_sensitive` flag (which governs the query text, not the folder filter).

### Case-insensitive mode folds accented letters too

When `case_sensitive: false` (the default), matching ignores case for accented letters as well as ASCII ones: `CAFÉ CRÈME` in the query matches `café crème` in the body (observed live, spec 087 research F7 and BI-0174). Use `case_sensitive: true` when the case must match exactly; then `CAFÉ` does not match `café`.

## Migration from `search` with `context_lines=true`

The shipped [`search`](./search.md) tool's `context_lines=true` mode is retained for backward compatibility but is **deprecated** — prefer `context_search` for per-line-context queries.

If you currently call:

```json
{ "name": "search", "arguments": { "query": "TODO", "context_lines": true, "limit": 50, "folder": "Notes" } }
```

migrate by:

1. Change the tool name from `search` to `context_search`.
2. Drop the `context_lines` field.

Same response shape; same `truncated` semantics; identical sort order. Three behavioural differences:

- **CRLF strip**: the new tool strips trailing `\r` from `text`; `search`'s line-mode does not.
- **Whitespace**: the new tool returns each line with its leading and trailing whitespace; `search`'s line mode returns the line trimmed, as Obsidian's search reports it.
- **Folder-not-found**: the new tool surfaces a structured `CLI_REPORTED_ERROR` for a missing folder; `search`'s line-mode returns `count=0`.

## Inherited limitations

### Output-cap ceiling

The wrapper requests the entire match set from upstream (it does **not** forward `limit`), so the full result set always crosses the CLI-to-wrapper pipe before the wrapper sorts and slices it. A common-term query against a very large vault may exceed the 10 MiB output cap and surface as `CLI_NON_ZERO_EXIT` or `CLI_OUTPUT_TOO_LARGE`. Narrow the scope with `folder` or a tighter `query`. Lowering `limit` does **not** help — the cap is on the bytes upstream emits, which the wrapper-side slice does not change.

### No relevance ranking

Upstream returns results in its own order; the wrapper imposes a deterministic sort by `(path, line)` ascending. No TF-IDF / BM25 / fuzzy ranking is exposed. Callers needing semantic similarity use [`smart_connections_query`](./smart_connections_query.md) instead.

### No regex / boolean / surrounding-context

The query is matched as one literal substring — no regex queries (use [`pattern_search`](./pattern_search.md) for that), no `AND` / `OR` boolean operators, no surrounding-context-lines (lines `N±k`). Each match entry contains exactly the matching line itself. This section used to say upstream itself is substring-only. It is not: `obsidian search:context` reads Obsidian search syntax, including `OR`. The wrapper sends the query as one escaped regular expression, `/…/` with every regex syntax character and `/` escaped, so the operators are matched as text and the query matches anywhere, including inside a word (spec 087, BI-0175).

### Latency

Approximately 1× a single-call typed tool typical; up to 2× on the cold folder-not-found probe path. A search that finds lines makes one more Obsidian call to read them back, plus one per further batch for results spread over many notes. Observed on one Windows machine (2026-11-02, measurements, not guarantees): 6 lines in 6 notes took 1 read-back call and about 0.2 s end to end; 300 lines in 300 notes took 10 read-back calls and about 0.9 s; 306 lines with `limit: 1000` took 10 calls and about 0.9 s.
