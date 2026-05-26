# `context_search`

## Overview

Return each match of a literal phrase in a vault as a single entry carrying
the vault-relative file path, 1-based line number, and the matching line's
text — collapsing the dominant "find file → read file → locate line"
grep-style three-call pattern to a single MCP call. Wraps the upstream
Obsidian CLI's `search:context` subcommand natively. Eighteenth typed-tool
wrap and the project's dedicated per-line-context search primitive.

This tool is **vault-scoped** — there is no `target_mode` discriminator,
no `file` / `path` / `active` argument. The optional `vault` field routes
to a named vault; omitting it uses the focused vault.

`context_search` is the dedicated sibling of `search`. Prefer
`context_search` over `search` when you need per-match line context in a
single call. Prefer `search` when you only need the file paths (faster,
smaller payload, lighter cap budget).

## Input contract

`context_search` consumes the schema below. Every field is rejected at
the boundary as `VALIDATION_ERROR` if the constraints fail. Unknown
top-level keys are rejected (`additionalProperties: false`).

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

- **`query`** — phrase-matched as a single literal substring. Internal
  whitespace is preserved verbatim — `"foo bar"` matches `foo bar` but
  not `foobar` or `foo  bar`. Empty / whitespace-only is rejected via a
  `superRefine` issue on `path: ["query"]`.
- **`folder`** — vault-relative folder prefix; leading/trailing `/` are
  stripped wrapper-side before forwarding to the CLI as `path=`.
  `folder: "/"` alone normalises to empty and is omitted (effectively
  unscoped). Recursive subtree-prefix match — `folder=Projects` matches
  `Projects/foo.md`, `Projects/sub/bar.md`, and `Projects/a/b/c.md`.
  Case-sensitive segment-boundary equality enforced by upstream —
  `folder=Projects` does NOT match `projects/`.
- **`limit`** — caps the returned `matches` array (post-flatten,
  post-strip). The implicit cap is 1000. Out-of-band values fail the
  schema with `VALIDATION_ERROR`.
- **`case_sensitive`** — when `true`, the wrapper adds the upstream
  presence-only `case` flag; otherwise it's omitted and upstream's
  default insensitivity (ASCII fold only) applies. Folding is ASCII-only
  — `É` does NOT match `é`.
- **`vault`** — the vault display name. Unknown vault →
  `CLI_REPORTED_ERROR` with `details.message: "Vault not found."` via
  the cli-adapter's success-path stdout inspection.

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
| `matches[].text` | string | Matching line content. Single trailing `\r` stripped (FR-012). Capped at 500 chars + `…` (U+2026 ellipsis marker) if longer (final length 501 for capped lines). |
| `truncated` | `true` | OPTIONAL — present **only** when truncation fired (absent === `false`). |

### Truncation slice direction (BI-046 reconciliation)

When `truncated: true`, the response carries the **leading N entries of the engine pre-sort response**, **re-sorted** by the wrapper's output sort key before being returned.

Concretely, the wrapper invokes the engine subcommand `obsidian search:context` and receives a pre-sort response from the engine. It flattens the response to per-line entries, takes the **leading N** of the flattened or file-capped array (`flat.slice(0, appliedCap)` in `src/tools/context_search/handler.ts`), then **re-sorts the slice** by `path` ascending then `line` ascending for output. The engine's **natural sort order** in the pre-sort response is upstream-determined; on the BI-0011 fixture against this host it surfaced as reverse basename-numeric (`body-5, body-4, body-3, body-2, body-1` file order), but the engine emission order is unstable across upstream/vault state changes. The slice direction within the engine pre-sort response is **LEADING** (first N).

**Cohort divergence**: `backlinks` slices the leading subset of the **sorted** result set — its eval template applies `allKeys.filter(...).sort()` before `sources.slice(0, cap)`, so the slice operates on an already-sorted array and the visible subset under truncation is the leading-of-sorted-set. `context_search` does NOT behave this way: it slices the engine pre-sort response first, then sorts the slice. See the inline anchor below for the empirical visible subset on the canonical fixture.

> Probe (BI-0011 fixture, `query: "Zb1q9k2xBody"`, `folder: "Fixtures/BI-0011"`, `limit: 2`; captured 2026-05-26): visible subset = `[{path: "Fixtures/BI-0011/body-4.md", line: 3}, {path: "Fixtures/BI-0011/body-5.md", line: 3}]` (each `text` field carries `"Zb1q9k2xBody marker line in body-<N>."` — full mirror at the link below). Full sorted result set, engine pre-sort response, and version triple at [BI-046 truncation-direction evidence](../../specs/046-reconcile-truncation-docs/contracts/truncation-direction-evidence.md).

### Zero-match handling

- `"No matches found."` on upstream stdout AND `folder` was **not**
  supplied: returns the empty envelope `{ count: 0, matches: [] }`.
  **Never** an error.
- `"No matches found."` on upstream stdout AND `folder` **was** supplied:
  the wrapper fires a second `obsidian folder path=<folder>` probe to
  distinguish "folder exists with no matches" from "folder missing". If
  the probe succeeds, the empty envelope is returned. If the probe
  raises `CLI_REPORTED_ERROR` (the dispatch classifier catches the
  upstream `Error: Folder "X" not found.` stdout), the error propagates
  verbatim — distinguishing folder-not-found from folder-exists-empty
  per FR-013.

### Locator non-echo

The response carries `count`, `matches`, and optionally `truncated` only.
`vault`, `query`, `folder`, `limit`, and `case_sensitive` are never
echoed in the response (FR-021; project memory: read tools don't echo
locator).

## Worked examples

### Example 1 — Minimal happy path

```json
{
  "name": "context_search",
  "arguments": { "query": "TODO" }
}
```

Spawns one call: `obsidian search:context query=TODO format=json limit=1000`.

Response (against a representative vault):

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

The underlying match set fit within the implicit cap of 1000, so the
response carries no `truncated` field.

### Example 2 — Folder-scoped + case-sensitive

```json
{
  "name": "context_search",
  "arguments": { "query": "getUser", "folder": "Projects/api", "case_sensitive": true }
}
```

Spawns one call: `obsidian search:context query=getUser path=Projects/api case format=json limit=1000`.

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

Equivalent forms — `folder: "/Projects/api"`, `folder: "Projects/api/"`,
`folder: "/Projects/api/"` all normalise to `Projects/api`. `folder: "/"`
alone normalises to empty and is treated as no folder restriction.

### Example 3 — Capped + truncated

```json
{
  "name": "context_search",
  "arguments": { "query": "the", "limit": 50 }
}
```

Spawns one call: `obsidian search:context query=the format=json limit=50`.

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

Truncation is conservative — `truncated: true` fires when **either** the
underlying file-count equals the applied cap, **or** the post-flatten
match-set exceeds the applied cap.

### Example 4 — Folder-not-found error path (FR-013)

```json
{
  "name": "context_search",
  "arguments": { "query": "anything", "folder": "DoesNotExist" }
}
```

Sequence:
1. First call: `obsidian search:context query=anything path=DoesNotExist format=json limit=1000`.
2. Upstream returns the zero-match sentinel `"No matches found.\n"`.
3. Handler detects sentinel AND `folder` was supplied → fires the
   second-call existence probe: `obsidian folder path=DoesNotExist`.
4. Upstream `folder` returns stdout `Error: Folder "DoesNotExist" not found.`
   with exit 0.
5. The dispatch-layer classifier catches the `Error:` prefix and throws
   `UpstreamError(code: "CLI_REPORTED_ERROR", details: { ..., message: 'Error: Folder "DoesNotExist" not found.' })`.
6. Handler propagates the error verbatim — no wrapping, no re-classification.

Error envelope (returned to the MCP caller as the SDK's error-response
shape):

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

Vault contents (synthesised):

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

Both `text` fields are `\r`-free. The Windows-CRLF source's trailing
`\r` was stripped wrapper-side (FR-012 / R5). Indented Markdown lists,
code-block content, and intentional trailing spaces (Markdown
hard-break) are preserved verbatim — only the trailing `\r` is stripped.

### Example 6 — Validation rejection

```json
{
  "name": "context_search",
  "arguments": { "query": "   " }
}
```

Whitespace-only `query` fails the schema's `superRefine`; the
registration layer maps the `ZodError` to `VALIDATION_ERROR`:

```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "{\"code\":\"VALIDATION_ERROR\",\"message\":\"context_search input failed schema validation\",\"details\":{\"issues\":[{\"path\":[\"query\"],\"message\":\"query is empty or whitespace-only (FR-008)\",\"code\":\"custom\"}]}}"
  }]
}
```

## Error roster

All failure surfaces flow through `UpstreamError` per Constitution
Principle IV. `context_search` introduces **zero new top-level error
codes** and **zero new `details.code` strings** — the eighteen-tool
zero-new-codes streak is preserved.

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed the schema: missing / empty / whitespace-only / oversize `query`; `limit` out of `1..10000` or non-integer; unknown top-level key; empty `vault` / `folder`. | Agent retries with corrected input. `details.issues` carries per-issue zod context. |
| `CLI_REPORTED_ERROR` | (a) CLI stdout was not JSON AND not the zero-match sentinel (`details.stage: "json-parse"`); (b) CLI JSON failed wire-schema parse (`details.stage: "wire-parse"`); (c) folder-not-found (`details.message` starts `Error: Folder`); (d) unknown vault (`details.message: "Vault not found."`). | (a)+(b) investigate as an upstream-contract regression; (c) supply a valid folder; (d) supply a valid vault name. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (typical cause: output-cap kill on extreme result sets). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Reduce scope with `folder`, `limit`, or a narrower `query`. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |
| `CLI_TIMEOUT` | The CLI exceeded the 10-second typed-tool timeout. | Reduce scope with `folder`, `limit`, or a narrower `query`. |
| `CLI_OUTPUT_TOO_LARGE` | The CLI's stdout exceeded the cli-adapter's 10 MiB output cap. | Reduce scope; raising `limit` is NOT a recovery (the cap is on bytes, not entries). |

### Dual validation envelope (BI-042 cohort acknowledgement)

Field-level input rejections produce two distinct wire envelopes depending on the MCP client class:

| Constraint family | Wrapped envelope (`UpstreamError`) | MCP transport envelope |
|---|---|---|
| String / numeric `min`/`max`/`length` on `query`, `folder`, `limit`, `vault`, `before_context`, `after_context` | `VALIDATION_ERROR` with `details.issues` (zod issue body) — fires when the offending value reaches the wrapper (Cowork pathway, or strict-rich clients that forward un-validated input). | `-32602 Invalid Params` with a zod-issue body — fires when the strict-rich client validates against the published `inputSchema` and rejects before forwarding. |
| Custom `superRefine` rules | `VALIDATION_ERROR` — wrapped envelope only; the constraint does not render into the published JSON Schema. | Not produced — strict-rich clients pass through. |
| Unknown top-level keys (`additionalProperties: false`) | `VALIDATION_ERROR(unrecognized_keys)` — strict-rich pathway only; Cowork strips client-side and never reaches the wrapper. | `-32602` — when the strict-rich client validates the published schema client-side. |

The dual envelope is structurally inherent to the wrapper + MCP transport architecture and is uniform across the cohort (`search`, `context_search`, `pattern_search`, `find_and_replace`, `find_by_property`, `backlinks`, `query_base`, `tag`). See [BI-042 dual-envelope evidence](../../specs/042-close-audit-findings/contracts/dual-envelope-evidence.md) and [BI-042 dual-envelope contract](../../specs/042-close-audit-findings/contracts/dual-validation-envelope-roster.md).

## Behavioural notes

### 1. Single-call architecture (no probe path)

When `folder` is omitted or `folder: "/"` alone is supplied, each MCP
request fires exactly **one** `invokeCli` invocation. End-to-end
latency is approximately 1× a single-call typed tool.

### 2. Two-call architecture (probe path)

When `folder` is supplied AND the first `search:context` call returns
the zero-match sentinel, the handler fires a second `obsidian folder`
call to distinguish "folder exists with no matches" from "folder
missing" (FR-013). Two-call latency is approximately 2× a single-call
typed tool, but only fires on the cold-error path.

### 3. Conservative truncation

`truncated: true` fires when **either** the post-flatten match-count
exceeds the applied cap, **or** the underlying file-count equals the
applied cap (the latter signals upstream's file-side cap fired,
possibly dropping subsequent files entirely). The second condition is
conservative — it may fire when no actual drop occurred — but
preserves correctness over precision (R3 / R9 trade-off inherited
from BI-033).

### 4. Empty `matches: []` entries dropped

Files where upstream returned `matches: []` (filename-only matches with
no body-text hit) are dropped silently during flatten. Consequence:
`context_search`'s `count` can be less than `search`'s `count` for the
same query against the same vault — this is intentional and inherited.

### 5. Non-`.md` files never appear

Upstream's `search:context` subcommand natively restricts to `.md` (F6
inherited); the wrapper defensively re-filters wrapper-side via
`endsWith(".md")`. `.canvas`, `.pdf`, etc. never reach the caller.

### 6. CRLF normalisation

Each match's `text` field has a single trailing `\r` stripped before
the 500-char cap is measured. This eliminates Windows/macOS/Linux
snapshot-test drift. Embedded mid-line `\r` characters are NOT
stripped; trailing spaces before the `\r` are preserved verbatim.

### 7. Folder matching is case-sensitive byte-equal

`folder=Projects` does NOT match `projects/`. Upstream enforces
case-sensitive segment-boundary equality; this is not affected by the
`case_sensitive` flag (which governs the query text, not the folder
filter).

### 8. Case-insensitive mode is ASCII-fold only

When `case_sensitive: false` (the default), folding is ASCII-only — the
Latin-1 accented characters are NOT case-folded against each other. `É`
in the query does NOT match `é` in the body. Use `case_sensitive: true`
when exact-case matching across non-ASCII is required.

## Migration from `search` with `context_lines=true`

The shipped `search` tool's `context_lines=true` mode is retained for
backward compatibility but is **deprecated** — prefer the dedicated
`context_search` tool for per-line-context queries.

If you currently call:

```json
{ "name": "search", "arguments": { "query": "TODO", "context_lines": true, "limit": 50, "folder": "Notes" } }
```

migrate by:

1. Change the tool name from `search` to `context_search`.
2. Drop the `context_lines` field.

Same response shape; same `truncated` semantics; identical sort order.
Two behavioural differences:

- **CRLF strip** (FR-012): the new tool strips trailing `\r` from
  `text`; `search`'s line-mode does not. Snapshot tests asserting
  verbatim `\r` will need to be updated.
- **Folder-not-found** (FR-013): the new tool surfaces a structured
  `CLI_REPORTED_ERROR` for a missing folder; `search`'s line-mode
  returns `count=0`. Tests / agents asserting `count=0` on a
  missing-folder input will see an error envelope instead.

## Inherited limitations

### Output-cap ceiling

Very large vaults may exceed the cli-adapter's 10 MiB output cap and
surface as `CLI_NON_ZERO_EXIT` or `CLI_OUTPUT_TOO_LARGE`. Narrow the
scope with `folder`, tighten `query`, or lower `limit`.

### No relevance ranking

Upstream returns results in its own order; the wrapper imposes a
deterministic sort by `(path, line)` ascending. No TF-IDF / BM25 /
fuzzy ranking is exposed. Callers needing semantic similarity use
[smart_connections_query](./smart_connections_query.md) instead.

### No regex / boolean / surrounding-context

Upstream is substring-only — no regex queries, no `AND` / `OR` boolean
operators, no surrounding-context-lines (lines `N±k`). Each match
entry contains exactly the matching line itself.

### Argv anti-injection guarantee

User input (`query`, `folder`, `vault`) flows through discrete argv
parameters to the CLI via `child_process.spawn` — no shell
interpolation, no `eval` source-text concatenation. `context_search` is
a **native wrapper** cohort tool, not an eval-template tool — the
no-eval-injection-vector assertion holds structurally.

## Related tools

- [search](./search.md) — vault-text-search returning paths only
  (default mode) or per-line matches (deprecated `context_lines=true`).
- [tag](./tag.md) — find notes by tag (frontmatter and inline).
- [find_by_property](./find_by_property.md) — find notes by frontmatter
  property value.
- [smart_connections_query](./smart_connections_query.md) — semantic
  similarity, NOT substring matching.
- [obsidian_exec](./obsidian_exec.md) — freeform escape hatch for
  `search:open` (UX) or `search:context format=text` (plain-text
  rendering).

## References

- [035-context-search spec](../../specs/035-context-search/spec.md)
  — feature spec with clarifications (tool name; folder-existence
  mechanism; recursive subtree semantics).
- [035-context-search research](../../specs/035-context-search/research.md)
  — R1–R14 design decisions, F1–F4 live-CLI probe findings.
- [035-context-search data-model](../../specs/035-context-search/data-model.md)
  — schema shapes, two-call pipeline, post-process pipeline,
  per-tool invariants.
- [035-context-search quickstart](../../specs/035-context-search/quickstart.md)
  — caller-facing walkthroughs covering the minimal happy path,
  folder-scoped, capped+truncated, folder-not-found error, and
  CRLF-source vault.
- [errors contract](../../specs/001-add-cli-bridge/contracts/errors.contract.md)
  — canonical roster of `UpstreamError` codes.
- [help tool spec](../../specs/005-help-tool/spec.md) — the
  schema-stripping contract and `help({ tool_name })` lookup that
  surfaces this document.
