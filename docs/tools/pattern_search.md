# `pattern_search`

## Overview

Scan every Markdown note in a vault (or under a named sub-folder) for an ECMAScript-regex pattern and return one entry per non-empty match carrying `{ path, line, offset, match, text }`.

This tool is **vault-scoped** — there is no `target_mode` discriminator, no `file` / `path` / `active` argument. The optional `vault` field routes to a named vault; omitting it uses the focused vault.

**CRITICAL — case-sensitivity default flips from `context_search`.** `pattern_search` defaults to **case-sensitive** matching (`case_sensitive: true`) — diverges from [`context_search`](./context_search.md)'s case-insensitive default. Agents porting predicates between the two tools must opt into case-insensitive matching explicitly via `case_sensitive: false`.

## When to use this tool

| You want to | Reach for |
|---|---|
| Regex matches across vault content | `pattern_search` |
| Literal substring matches with line context | [`context_search`](./context_search.md) (simpler payload) |
| Path-only matches | [`search`](./search.md) (lightest payload) |
| Find-AND-REPLACE matched text (preview then commit) | [`find_and_replace`](./find_and_replace.md) |
| Semantic similarity, not pattern matching | [`smart_connections_query`](./smart_connections_query.md) |
| Find notes by tag | [`tag`](./tag.md) |
| Find notes by frontmatter property value | [`find_by_property`](./find_by_property.md) |

## Input contract

`pattern_search` consumes the schema below. Every field is rejected at the boundary as `VALIDATION_ERROR` if the constraints fail. Unknown top-level keys are rejected (`additionalProperties: false`).

```json
{
  "pattern": "<regex source>",
  "folder": "<folder/path>",
  "limit": 100,
  "case_sensitive": true,
  "vault": "<vault name>"
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `pattern` | string | YES | length 1..1000, non-empty post-trim, parses as a valid ECMAScript regex with the chosen flags |
| `folder` | string | OPTIONAL | length ≥ 1; leading/trailing `/` stripped wrapper-side |
| `limit` | integer | OPTIONAL | inclusive 1..10000; defaults to implicit 1000 cap |
| `case_sensitive` | boolean | OPTIONAL | **defaults to `true`** (flips from `context_search`) |
| `vault` | string | OPTIONAL | length ≥ 1; routes to focused vault when omitted |

### Per-field policy

- **`pattern`** — interpreted as an ECMAScript regex (Node `RegExp`, V8). Supports `\d`, `\w`, `\b`, character classes, alternation, quantifiers, named captures (`(?<name>…)`), lookahead (`(?=…)`, `(?!…)`), and lookbehind (`(?<=…)`, `(?<!…)`). The `i` flag is applied when `case_sensitive: false`; the `u` flag is NOT exposed (so `\d` is ASCII-only and `\b` is the ASCII word-boundary). Invalid regex syntax is detected at the schema boundary — `SyntaxError` surfaces as `VALIDATION_ERROR` with `details.issues[0].path === ["pattern"]` and the engine's message verbatim. Empty / whitespace-only is rejected at the same layer.
- **`folder`** — vault-relative folder prefix; leading/trailing `/` are stripped. `folder: "/"` alone normalises to empty and is treated as no folder restriction (whole-vault scan). Recursive subtree-prefix match — `folder: "Projects"` matches every `.md` note whose path begins with `Projects/`. Case-sensitive byte-equal.
- **`limit`** — caps the returned `matches` array. The implicit cap is 1000.
- **`case_sensitive`** — when `false`, the engine runs with the `gi` flags; otherwise `g` only. The `g` flag is mandatory (for `matchAll`) and not caller-controllable.
- **`vault`** — the vault display name. Unknown vault → `CLI_REPORTED_ERROR` with `details.message: "Vault not found."`. Closed-but-registered vault → `CLI_REPORTED_ERROR` with `details.code: "VAULT_NOT_FOUND"`, `details.reason: "not-open"` — retry after the vault has opened.

## Output shape

```json
{
  "count": 3,
  "matches": [
    { "path": "Notes/a.md", "line": 1, "offset": 0,  "match": "BI-0042", "text": "BI-0042" },
    { "path": "Notes/b.md", "line": 7, "offset": 13, "match": "BI-0099", "text": "Reference to BI-0099 in this line." },
    { "path": "Notes/c.md", "line": 2, "offset": 4,  "match": "BI-0123", "text": "    BI-0123 in code fence" }
  ]
}
```

With truncation:

```json
{
  "count": 1000,
  "matches": [{ "path": "...", "line": 1, "offset": 0, "match": "x", "text": "..." }, "..."],
  "truncated": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `count` | integer ≥ 0 | Number of entries; equals `matches.length`. |
| `matches` | object[] | One entry per non-empty match; sorted by `path` asc (UTF-16) then `line` asc then `offset` asc. |
| `matches[].path` | string | Vault-relative `.md` path. |
| `matches[].line` | integer ≥ 1 | 1-based line number of the matching line. |
| `matches[].offset` | integer ≥ 0 | 0-based start offset of the match within the (pre-clip) line. |
| `matches[].match` | string | The substring that matched the regex. NEVER capped — emitted verbatim. |
| `matches[].text` | string | The full line. Capped at 500 UTF-16 code units + `…` (U+2026 ellipsis marker) if longer (final length 501 for capped lines). |
| `truncated` | `true` | OPTIONAL — present **only** when truncation fired (absent === `false`). |

### Zero-match handling

- **Zero matches, no `folder` argument**: returns the empty envelope `{ count: 0, matches: [] }`. **Never** an error.
- **Zero matches, `folder` supplied**: the wrapper checks folder existence before scanning. If the folder is missing, raises `CLI_REPORTED_ERROR` with `details.code: "FOLDER_NOT_FOUND"` and `details.folder` echoing the unknown name. If the folder exists but contains no matches, the empty success envelope is returned.

### Zero-length match skip

Patterns that match zero characters at a position (`^`, `$`, `a*`, `\b`, lookarounds) are **skipped** — they never produce response entries. A pattern that ONLY produces zero-width hits returns the empty envelope.

### Locator non-echo

The response carries `count`, `matches`, and optionally `truncated` only. `vault`, `pattern`, `folder`, `limit`, and `case_sensitive` are never echoed.

## Worked examples

### Example 1 — BI-token cross-reference (happy path)

```json
{
  "name": "pattern_search",
  "arguments": { "pattern": "BI-\\d{4}" }
}
```

Response:

```json
{
  "count": 3,
  "matches": [
    { "path": "Daily/2026-05-17.md", "line": 8, "offset": 6, "match": "BI-0037", "text": "Today: BI-0037 implementation." },
    { "path": "Notes/release.md",    "line": 1, "offset": 0, "match": "BI-0035", "text": "BI-0035 shipped this week." },
    { "path": "Projects/queue.md",   "line": 4, "offset": 13, "match": "BI-0099", "text": "Next priority: BI-0099 spec." }
  ]
}
```

### Example 2 — Folder-scoped + case-insensitive

```json
{
  "name": "pattern_search",
  "arguments": {
    "pattern": "TODO",
    "folder": "_scratch/037",
    "case_sensitive": false
  }
}
```

Response:

```json
{
  "count": 2,
  "matches": [
    { "path": "_scratch/037/case-mix.md", "line": 1, "offset": 0, "match": "TODO", "text": "TODO: write docs" },
    { "path": "_scratch/037/case-mix.md", "line": 2, "offset": 0, "match": "todo", "text": "todo: lowercase variant" }
  ]
}
```

Both `TODO` and `todo` match (the `i` flag); the matched substring appears in the source's original case.

### Example 3 — Folder not found

```json
{
  "name": "pattern_search",
  "arguments": { "pattern": "anything", "folder": "_scratch/no-such-folder" }
}
```

```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "{\"code\":\"CLI_REPORTED_ERROR\",\"message\":\"pattern_search: folder not found in vault\",\"details\":{\"code\":\"FOLDER_NOT_FOUND\",\"folder\":\"_scratch/no-such-folder\",\"stage\":\"handler-stage-3\"}}"
  }]
}
```

Distinguishes "wrong folder" from "no matches" — branch on `details.code === "FOLDER_NOT_FOUND"`.

### Example 4 — Invalid pattern

```json
{
  "name": "pattern_search",
  "arguments": { "pattern": "BI-(\\d{4}" }
}
```

(Unbalanced parenthesis.) Detected at the schema boundary BEFORE any vault scan runs:

```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "{\"code\":\"VALIDATION_ERROR\",\"message\":\"pattern_search input failed schema validation\",\"details\":{\"issues\":[{\"path\":[\"pattern\"],\"message\":\"Invalid regular expression: /BI-(\\\\d{4}/: Unterminated group\",\"code\":\"custom\"}]}}"
  }]
}
```

### Example 5 — Truncation flag

```json
{
  "name": "pattern_search",
  "arguments": { "pattern": "truncate-me", "folder": "_scratch/037", "limit": 5 }
}
```

Response (against a folder with > 5 matches):

```json
{
  "count": 5,
  "matches": [
    { "path": "_scratch/037/many-hits.md", "line": 1, "offset": 0, "match": "truncate-me", "text": "truncate-me line 1" },
    "...",
    { "path": "_scratch/037/many-hits.md", "line": 5, "offset": 0, "match": "truncate-me", "text": "truncate-me line 5" }
  ],
  "truncated": true
}
```

## Error roster

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed the schema: missing / empty / whitespace-only / oversize `pattern`; **invalid regex syntax** (`details.issues[0].path === ["pattern"]`, `code: "custom"`); `limit` out of `1..10000` or non-integer; `case_sensitive` not a boolean; unknown top-level key; empty `vault` / `folder`. | Retry with corrected input. `details.issues` carries per-issue zod context. |
| `CLI_REPORTED_ERROR` (`details.code: "FOLDER_NOT_FOUND"`) | Folder doesn't exist. `details.folder` echoes the unknown name. | Supply a valid folder, or use the no-`folder` form to scan the whole vault. |
| `CLI_REPORTED_ERROR` (`details.message: "Vault not found."`) | Unknown vault. | Verify the vault name. |
| `CLI_REPORTED_ERROR` (`details.code: "VAULT_NOT_FOUND"`, `details.reason: "not-open"`) | Closed-but-registered vault — the CLI is opening it. | Retry after a brief delay. |
| `CLI_REPORTED_ERROR` (`details.stage: "json-parse"` or `"envelope-parse"`) | Upstream output unexpected. | Investigate as a regression. |
| `CLI_NON_ZERO_EXIT` | Output-cap kill on extreme result sets. | Reduce scope with `folder`, `limit`, or a narrower pattern. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN`. |
| `CLI_TIMEOUT` | Exceeded the 10-second typed-tool timeout. | Reduce scope with `folder`, `limit`, or a narrower pattern. |
| `CLI_OUTPUT_TOO_LARGE` | Output exceeded the 10 MiB cap. | Reduce scope; raising `limit` is NOT a recovery (the cap is on bytes, not entries). |

## Behavioural notes

### ECMAScript-dialect notes

The regex runs inside the Obsidian Electron Node runtime — V8 RegExp semantics:

- `\d`, `\w`, `\s` are ASCII-only (the `u` flag is NOT exposed).
- `\b` is the ASCII word-boundary.
- Lookbehind (`(?<=…)`, `(?<!…)`) is supported (V8 ≥ 6.2).
- Named captures (`(?<name>…)`) are supported but NOT surfaced in the response — only the full match (`m[0]`) is returned as the `match` field.
- The `g` flag is mandatory (used internally for `matchAll`); the `i` flag is applied when `case_sensitive: false`. Other regex flags (`m`, `s`, `u`, `y`, `d`) are NOT exposed.

### Read-only

`pattern_search` is read-only — find-and-replace is out of scope. Use [`find_and_replace`](./find_and_replace.md) for matched-text replacement (preview-then-commit semantics).

### Plain-text scanning

Matches inside fenced code blocks, frontmatter, or HTML comments ARE returned same as any other position. Markdown-aware exclusion is out of scope — `pattern_search` scans the raw text content of every `.md` note, line-by-line.

### Line-scoped matching

Each line is matched independently. The wrapper splits each note's body on `/\r?\n/` BEFORE running the regex, so a regex containing `\n` cannot match across line boundaries. Cross-line patterns return zero matches, not an error.

### Per-occurrence emission

Each non-empty match becomes one entry in the response — three matches on the same line produce three entries differing only in `offset`. The `offset` field guarantees deterministic order when multiple matches occur on the same line.

### Match-substring vs line cap

`match` is emitted verbatim from the regex engine — NEVER capped. The surrounding line is capped at 500 UTF-16 code units + `…` (U+2026) marker. When the match begins past offset 500 (the match substring would be in the truncated portion), the `text` field carries the clipped prefix + `…` and the `match` field still carries the matched substring intact — act on `match` directly when the context is unhelpful.

### Latency

Approximately 1× a single-call typed tool typical.
