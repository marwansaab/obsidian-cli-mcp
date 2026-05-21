# `pattern_search`

## Overview

Scan every Markdown note in a vault (or under a named sub-folder) for an
ECMAScript-regex pattern and return one entry per non-empty match
carrying `{ path, line, offset, match, text }`. Sixteenth typed-tool
wrap. The regex-search companion to the keyword-only sibling
[`context_search`](./context_search.md) (BI-035) — `context_search` is
literal-substring, `pattern_search` is regex.

This tool is **vault-scoped** — there is no `target_mode` discriminator,
no `file` / `path` / `active` argument. The optional `vault` field
routes to a named vault; omitting it uses the focused vault.

**CRITICAL — case-sensitivity default flips from `context_search`.**
`pattern_search` defaults to **case-sensitive** matching
(`case_sensitive: true`) per spec FR-007 — diverges from
`context_search`'s case-insensitive default. Agents porting predicates
between the two tools must opt into case-insensitive matching
explicitly via `case_sensitive: false`.

## Input contract

`pattern_search` consumes the schema below. Every field is rejected at
the boundary as `VALIDATION_ERROR` if the constraints fail. Unknown
top-level keys are rejected (`additionalProperties: false`).

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
| `case_sensitive` | boolean | OPTIONAL | **defaults to `true`** (FR-007 — flips from `context_search`) |
| `vault` | string | OPTIONAL | length ≥ 1; routes to focused vault when omitted |

### Per-field policy

- **`pattern`** — interpreted as an ECMAScript regex (Node `RegExp`,
  V8). Supports `\d`, `\w`, `\b`, character classes, alternation,
  quantifiers, named captures (`(?<name>…)`), lookahead (`(?=…)`,
  `(?!…)`), and lookbehind (`(?<=…)`, `(?<!…)`). The `i` flag is
  applied when `case_sensitive: false`; the `u` flag is NOT exposed at
  v1 (so `\d` is ASCII-only and `\b` is the ASCII word-boundary).
  Invalid regex syntax is detected at the zod boundary via a
  `superRefine` block that instantiates `new RegExp(pattern, flags)`
  inside a `try/catch` — `SyntaxError` surfaces as `VALIDATION_ERROR`
  with `details.issues[0].path === ["pattern"]` and the engine's
  message verbatim. Empty / whitespace-only is rejected at the same
  layer.
- **`folder`** — vault-relative folder prefix; leading/trailing `/`
  are stripped wrapper-side. `folder: "/"` alone normalises to empty
  and is treated as no folder restriction (whole-vault scan).
  Recursive subtree-prefix match — `folder: "Projects"` matches every
  `.md` note whose path begins with `Projects/`. Case-sensitive byte-equal.
- **`limit`** — caps the returned `matches` array. The implicit cap
  is 1000. Out-of-band values fail the schema with `VALIDATION_ERROR`.
- **`case_sensitive`** — when `false`, the eval template instantiates
  `new RegExp(pattern, "gi")`; otherwise `new RegExp(pattern, "g")`.
  The `g` flag is mandatory for `String.prototype.matchAll` and not
  caller-controllable.
- **`vault`** — the vault display name. Unknown vault →
  `CLI_REPORTED_ERROR` with `details.message: "Vault not found."` via
  the cli-adapter's success-path stdout inspection. Closed-but-registered
  vault → `CLI_REPORTED_ERROR` with `details.code: "VAULT_NOT_FOUND"`,
  `details.reason: "not-open"`.

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

- **Zero matches, no `folder` argument**: returns the empty envelope
  `{ count: 0, matches: [] }`. **Never** an error.
- **Zero matches, `folder` supplied**: the eval template performs a
  `app.vault.adapter.stat(folder)` existence check BEFORE scanning. If
  the folder is missing, the envelope is the failure branch and the
  handler raises `CLI_REPORTED_ERROR` with `details.code: "FOLDER_NOT_FOUND"`
  and `details.folder` echoing the unknown name. If the folder exists
  but contains no matches, the empty success envelope is returned —
  distinguishing folder-not-found from folder-exists-empty per FR-011.

### Zero-length match skip (FR-016)

Patterns that match zero characters at a position (`^`, `$`, `a*`,
`\b`, lookarounds) are **skipped** — they never produce response
entries. The eval template advances the regex engine's `lastIndex` past
zero-width hits to guarantee termination. A pattern that ONLY produces
zero-width hits returns the empty envelope.

### Locator non-echo

The response carries `count`, `matches`, and optionally `truncated`
only. `vault`, `pattern`, `folder`, `limit`, and `case_sensitive` are
never echoed in the response (project memory: read tools don't echo
locator).

## Worked examples

### Example 1 — BI-token cross-reference (happy path)

```json
{
  "name": "pattern_search",
  "arguments": { "pattern": "BI-\\d{4}" }
}
```

Response (against a representative vault):

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

The underlying match set fit within the implicit cap of 1000, so the
response carries no `truncated` field.

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

Both `TODO` and `todo` match (the `i` flag); the matched substring
appears in the source's original case. Equivalent forms — `folder:
"/_scratch/037"`, `folder: "_scratch/037/"`, `folder: "/_scratch/037/"`
all normalise to `_scratch/037`.

### Example 3 — Folder not found (FR-011)

```json
{
  "name": "pattern_search",
  "arguments": { "pattern": "anything", "folder": "_scratch/no-such-folder" }
}
```

Error envelope:

```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "{\"code\":\"CLI_REPORTED_ERROR\",\"message\":\"pattern_search: folder not found in vault\",\"details\":{\"code\":\"FOLDER_NOT_FOUND\",\"folder\":\"_scratch/no-such-folder\",\"stage\":\"handler-stage-3\"}}"
  }]
}
```

Distinguishes "wrong folder" from "no matches" at the wire layer —
agents can branch on `details.code === "FOLDER_NOT_FOUND"`.

### Example 4 — Invalid pattern (FR-010)

```json
{
  "name": "pattern_search",
  "arguments": { "pattern": "BI-(\\d{4}" }
}
```

(Unbalanced parenthesis.) Detected at the zod `superRefine` layer
BEFORE any vault scan runs — no partial matches are returned alongside
the error.

```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "{\"code\":\"VALIDATION_ERROR\",\"message\":\"pattern_search input failed schema validation\",\"details\":{\"issues\":[{\"path\":[\"pattern\"],\"message\":\"Invalid regular expression: /BI-(\\\\d{4}/: Unterminated group\",\"code\":\"custom\"}]}}"
  }]
}
```

### Example 5 — Truncation flag (FR-008 / SC-003)

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
    { "path": "_scratch/037/many-hits.md", "line": 2, "offset": 0, "match": "truncate-me", "text": "truncate-me line 2" },
    { "path": "_scratch/037/many-hits.md", "line": 3, "offset": 0, "match": "truncate-me", "text": "truncate-me line 3" },
    { "path": "_scratch/037/many-hits.md", "line": 4, "offset": 0, "match": "truncate-me", "text": "truncate-me line 4" },
    { "path": "_scratch/037/many-hits.md", "line": 5, "offset": 0, "match": "truncate-me", "text": "truncate-me line 5" }
  ],
  "truncated": true
}
```

`truncated: true` fires when the underlying match-set could have
produced more entries than the applied cap.

## Error roster

All failure surfaces flow through `UpstreamError` per Constitution
Principle IV. `pattern_search` introduces **zero new top-level error
codes** and **zero new `details.code` strings** — the sixteen-tool
zero-new-codes streak is preserved (invalid pattern routes through
`VALIDATION_ERROR`).

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed the schema: missing / empty / whitespace-only / oversize `pattern`; **invalid regex syntax** (`details.issues[0].path === ["pattern"]`, `code: "custom"`); `limit` out of `1..10000` or non-integer; `case_sensitive` not a boolean; unknown top-level key; empty `vault` / `folder`. | Agent retries with corrected input. `details.issues` carries per-issue zod context. |
| `CLI_REPORTED_ERROR` | (a) CLI stdout was not JSON (`details.stage: "json-parse"`); (b) CLI JSON failed envelope wire-schema parse (`details.stage: "envelope-parse"`); (c) folder-not-found (`details.code: "FOLDER_NOT_FOUND"`, `details.folder: "<name>"`, `details.stage: "handler-stage-3"`); (d) unknown vault (`details.message: "Vault not found."`); (e) closed-but-registered vault (`details.code: "VAULT_NOT_FOUND"`, `details.reason: "not-open"`, `details.stage: "handler-stage-0"`). | (a)+(b) investigate as an upstream-contract regression; (c) supply a valid folder; (d) supply a valid vault name; (e) retry after Obsidian finishes opening the vault. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (typical cause: output-cap kill on extreme result sets). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Reduce scope with `folder`, `limit`, or a narrower pattern. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |
| `CLI_TIMEOUT` | The CLI exceeded the 10-second typed-tool timeout. | Reduce scope with `folder`, `limit`, or a narrower pattern. |
| `CLI_OUTPUT_TOO_LARGE` | The CLI's stdout exceeded the cli-adapter's 10 MiB output cap. | Reduce scope; raising `limit` is NOT a recovery (the cap is on bytes, not entries). |

### Dual validation envelope (BI-042 cohort acknowledgement)

Field-level input rejections produce two distinct wire envelopes depending on the MCP client class:

| Constraint family | Wrapped envelope (`UpstreamError`) | MCP transport envelope |
|---|---|---|
| String / numeric `min`/`max`/`length` on `pattern`, `limit`, `vault`, `folder` | `VALIDATION_ERROR` with `details.issues` — fires when the offending value reaches the wrapper (Cowork pathway, or strict-rich clients that forward un-validated input). | `-32602 Invalid Params` with a zod-issue body — fires when the strict-rich client validates against the published `inputSchema` and rejects before forwarding. |
| Custom `superRefine` (invalid regex syntax) | `VALIDATION_ERROR` with `details.code` + `details.reason` per ADR-015 — wrapped envelope only; the regex-syntax constraint does not render into the published JSON Schema. | Not produced — strict-rich clients pass the offending pattern through to the wrapper. |
| Unknown top-level keys (`additionalProperties: false`) | `VALIDATION_ERROR(unrecognized_keys)` — strict-rich pathway only; Cowork strips client-side and never reaches the wrapper. | `-32602` — when the strict-rich client validates the published schema client-side. |

The dual envelope is structurally inherent to the wrapper + MCP transport architecture and is uniform across the cohort (`search`, `context_search`, `pattern_search`, `find_and_replace`, `find_by_property`, `backlinks`, `query_base`, `tag`). See [BI-042 dual-envelope evidence](../../specs/042-close-audit-findings/contracts/dual-envelope-evidence.md) and [BI-042 dual-envelope contract](../../specs/042-close-audit-findings/contracts/dual-validation-envelope-roster.md).

## Behavioural notes

### 1. Single-call architecture

Each `pattern_search` invocation fires exactly **one** `invokeCli`
call to the `eval` subcommand. The frozen JS template enumerates `.md`
files, performs the folder-existence stat, scans each line, and emits
the wire envelope in one round-trip. End-to-end latency is approximately
1× a single-call typed tool.

### 2. ECMAScript-dialect notes

The regex runs inside the Obsidian Electron Node runtime — V8 RegExp
semantics. Notable points:

- `\d`, `\w`, `\s` are ASCII-only (the `u` flag is NOT exposed at v1).
- `\b` is the ASCII word-boundary.
- Lookbehind (`(?<=…)`, `(?<!…)`) is supported (V8 ≥ 6.2).
- Named captures (`(?<name>…)`) are supported but NOT surfaced in the
  response — only the full match (`m[0]`) is returned as the `match`
  field. Use a non-capturing group with the full match if you need the
  surrounding context.
- The `g` flag is mandatory (used internally for `matchAll`); the `i`
  flag is applied when `case_sensitive: false`. Other regex flags
  (`m`, `s`, `u`, `y`, `d`) are NOT exposed.

### 3. Read-only (FR-015)

`pattern_search` is read-only — find-and-replace is explicitly out of
scope (a separate future tool). The eval template only invokes
`app.vault.getMarkdownFiles`, `app.vault.cachedRead`, and
`app.vault.adapter.stat`; mutating Obsidian APIs (`modify`, `create`,
`delete`, `adapter.write`, `adapter.remove`, `fileManager.renameFile`)
are not in the template's surface and are structurally absent.

### 4. Plain-text scanning (FR-013)

Matches inside fenced code blocks, frontmatter, or HTML comments ARE
returned same as any other position. Markdown-aware exclusion is out
of scope — `pattern_search` scans the raw text content of every
`.md` note, line-by-line.

### 5. Line-scoped matching (FR-012)

Each line is matched independently. The eval template splits each
note's body on `/\r?\n/` BEFORE running the regex, so a regex
containing `\n` cannot match across line boundaries. Cross-line patterns
return zero matches, not an error.

### 6. Per-occurrence emission (FR-003)

Each non-empty match becomes one entry in the response — three
matches on the same line produce three entries differing only in
`offset`. The `offset` field guarantees deterministic order when
multiple matches occur on the same line (R2 third sort key).

### 7. Match-substring vs line cap

`match` is emitted verbatim from the regex engine — NEVER capped. The
surrounding line is capped at 500 UTF-16 code units + `…` (U+2026)
marker (per Q2). When the match begins past offset 500 (the match
substring would be in the truncated portion), the `text` field carries
the clipped prefix + `…` and the `match` field still carries the
matched substring intact — agents act on `match` directly when the
context is unhelpful.

### 8. Argv anti-injection guarantee

User input (`pattern`, `folder`, `case_sensitive`, `limit`) flows
through a base64-encoded JSON payload that is decoded INSIDE the
Obsidian Node runtime via `JSON.parse(atob(…))`. No user input ever
reaches the JS source as text — pattern strings containing template
delimiters, `*/`, `});`, or other JS-syntax fragments cannot escape
the template. Sibling parity with BI-014 / BI-019 / BI-025 / BI-036.

## Related tools

- [context_search](./context_search.md) — vault-text-search with
  literal keyword matching and simpler per-match payloads
  (`{ path, line, text }` — no `offset`, no `match`). **Case-insensitive
  by default** — note the divergent default.
- [search](./search.md) — vault-text-search returning paths only
  (lighter payload than `context_search`).
- [tag](./tag.md) — find notes by tag (frontmatter and inline).
- [find_by_property](./find_by_property.md) — find notes by frontmatter
  property value.
- [smart_connections_query](./smart_connections_query.md) — semantic
  similarity, NOT pattern matching.

## References

- [037-pattern-search spec](../../specs/037-pattern-search/spec.md)
  — feature spec with clarifications (Q1 ECMAScript dialect lock;
  Q2 500-UTF-16 line cap + `…` marker; Q3 zero-length match skip).
- [037-pattern-search research](../../specs/037-pattern-search/research.md)
  — R1–R12 design decisions plus the T0 live-CLI capture against the
  authorised test vault.
- [037-pattern-search data-model](../../specs/037-pattern-search/data-model.md)
  — schema shapes, wire-envelope structure, sort order, response
  invariants.
- [037-pattern-search quickstart](../../specs/037-pattern-search/quickstart.md)
  — caller-facing walkthroughs covering the eight canonical journeys.
- [errors contract](../../specs/001-add-cli-bridge/contracts/errors.contract.md)
  — canonical roster of `UpstreamError` codes.
- [help tool spec](../../specs/005-help-tool/spec.md) — the
  schema-stripping contract and `help({ tool_name })` lookup that
  surfaces this document.
