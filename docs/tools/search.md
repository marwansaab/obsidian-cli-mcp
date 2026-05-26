# `search`

## Overview

Return the vault-relative paths of every Markdown note whose body or
filename contains a query string, OR the per-line matches with surrounding
text. Wraps the upstream Obsidian CLI's `search` and `search:context`
subcommands natively — a single MCP tool that routes between two upstream
subcommands keyed on `context_lines`. Seventeenth typed-tool wrap and the
project's first vault-text-search primitive.

This tool is **vault-scoped** — there is no `target_mode` discriminator,
no `file` / `path` / `active` argument. The optional `vault` field routes
to a named vault; omitting it uses the focused vault.

## Input contract

`search` consumes the schema below. Every field is rejected at the
boundary as `VALIDATION_ERROR` if the constraints fail. Unknown
top-level keys are rejected (`additionalProperties: false`).

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
| `case_sensitive` | boolean | OPTIONAL | defaults to `false` (upstream case-insensitive) |
| `context_lines` | boolean | OPTIONAL | **deprecated — prefer the dedicated `context_search` tool.** Defaults to `false` (default mode); when `true`, routes to `search:context` |
| `vault` | string | OPTIONAL | length ≥ 1; routes to focused vault when omitted |

### Per-field policy

- **`query`** — phrase-matched as a single literal substring. Internal
  whitespace is preserved verbatim — `"foo bar"` matches `foo bar` but
  not `foobar` or `foo  bar` (FR-001 / Q2). Empty / whitespace-only is
  rejected via a `superRefine` issue on `path: ["query"]`.
- **`folder`** — vault-relative folder prefix; leading/trailing `/` are
  stripped wrapper-side before forwarding to the CLI as `path=`. `folder: "/"`
  alone normalises to empty and is omitted (effectively unscoped).
  Case-sensitive segment-boundary match enforced by upstream — `folder=Projects`
  does NOT match `projects/`.
- **`limit`** — caps the returned array (default mode `paths`; line mode
  `matches`). The implicit cap is 1000. Out-of-band values fail the
  schema with `VALIDATION_ERROR`.
- **`case_sensitive`** — when `true`, the wrapper adds the upstream
  presence-only `case` flag; otherwise it's omitted and upstream's
  default insensitivity (ASCII fold only) applies. Folding is ASCII-only
  — `É` does NOT match `é`.
- **`context_lines`** — **deprecated — prefer the dedicated
  [`context_search`](./context_search.md) tool.** When `true`, routes to
  `obsidian search:context` and returns line-level matches; otherwise
  routes to `obsidian search` and returns paths only. For per-line
  context, prefer `context_search` (added in BI-035); `context_lines=true`
  is retained for backward compatibility but will be removed in a future
  BI.
- **`vault`** — the vault display name. Unknown vault →
  `CLI_REPORTED_ERROR(details.code: "VAULT_NOT_FOUND")` via the
  cli-adapter's success-path stdout inspection.

## Output shape

Two output shapes, picked at the response boundary based on `context_lines`.

### Default mode (`context_lines !== true`)

```json
{
  "count": 2,
  "paths": ["Projects/alpha.md", "Projects/beta.md"]
}
```

With truncation (cap exceeded):

```json
{
  "count": 1000,
  "paths": ["..."],
  "truncated": true
}
```

### Line mode (`context_lines: true`)

```json
{
  "count": 2,
  "matches": [
    { "path": "Projects/alpha.md", "line": 3, "text": "<line 3 text>" },
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
| `count` | integer ≥ 0 | Number of entries in the response. Equals `paths.length` (default) or `matches.length` (line). |
| `paths` | string[] | Vault-relative paths. Sorted UTF-16 ascending. Only `.md` files. |
| `matches` | object[] | One entry per matching line; sorted by `path` asc then `line` asc. |
| `matches[].path` | string | Vault-relative `.md` path. |
| `matches[].line` | integer ≥ 1 | 1-based line number of the matching line. |
| `matches[].text` | string | Matching-line content, capped at 500 chars + `…` (U+2026 ellipsis marker) if longer. |
| `truncated` | `true` | OPTIONAL — present **only** when truncation fired. Absent === `false`. |

### Truncation slice direction (BI-046 reconciliation)

When `truncated: true`, the response carries the **leading N entries of the engine pre-sort response**, **re-sorted** by the wrapper's output sort key before being returned. This applies to both default mode and line mode (the FR-012 dual-mode probe at wrapper `v0.7.5` found the slice rule is identical across `obsidian search` and `obsidian search:context`).

Concretely, the wrapper invokes the engine subcommand — `obsidian search` in default mode, `obsidian search:context` in line mode — and receives a pre-sort response from the engine. It takes the **leading N** of that pre-sort response (`mdOnly.slice(0, appliedCap)` in default mode; the file-cap + flatten path in line mode), then **re-sorts the slice** by `path` ascending (default mode) or `path` ascending then `line` ascending (line mode) for output. The engine's **natural sort order** in the pre-sort response is upstream-determined; on the BI-0011 fixture against this host it surfaced as reverse basename-numeric (`body-5, body-4, body-3, body-2, body-1`), but the engine emission order is unstable across upstream/vault state changes. The slice direction within the engine pre-sort response is **LEADING** (first N).

**Cohort divergence**: `backlinks` slices the leading subset of the **sorted** result set — its eval template applies `allKeys.filter(...).sort()` before `sources.slice(0, cap)`, so the slice operates on an already-sorted array and the visible subset under truncation is the leading-of-sorted-set. `search` does NOT behave this way: it slices the engine pre-sort response first, then sorts the slice. See the inline anchor below for the empirical visible subset on the canonical fixture.

> Probe (BI-0011 fixture, `query: "Zb1q9k2xBody"`, `folder: "Fixtures/BI-0011"`, `limit: 2`; captured 2026-05-26): default-mode visible subset = `["Fixtures/BI-0011/body-4.md", "Fixtures/BI-0011/body-5.md"]`; line-mode visible subset = `[{path: "Fixtures/BI-0011/body-4.md", line: 3}, {path: "Fixtures/BI-0011/body-5.md", line: 3}]`. Full sorted result set, engine pre-sort response, and version triple at [BI-046 truncation-direction evidence](../../specs/046-reconcile-truncation-docs/contracts/truncation-direction-evidence.md).

### Zero-match handling

`No matches found.` on upstream stdout returns the empty envelope —
`{ count: 0, paths: [] }` in default mode or `{ count: 0, matches: [] }`
in line mode. **Never** an error (FR-012 / R4).

## Worked examples

### Example 1 — Minimal default-mode call

```json
{
  "name": "search",
  "arguments": { "query": "Welcome" }
}
```

Spawns one call: `obsidian search query=Welcome format=json limit=1001`.
Response (against `TestVault-Obsidian-CLI-MCP`):

```json
{
  "count": 2,
  "paths": ["Fixtures/BI-017/inline-markdown.md", "Welcome.md"]
}
```

`Welcome.md` is included even though no body line literally contains
"Welcome" — the upstream subcommand matches against filenames and
metadata too. This is the **filename-match inflation** behavioural note
below.

### Example 2 — Line mode

```json
{
  "name": "search",
  "arguments": { "query": "Welcome", "context_lines": true }
}
```

Spawns one call: `obsidian search:context query=Welcome format=json limit=1000`.
Response:

```json
{
  "count": 1,
  "matches": [
    { "path": "Fixtures/BI-017/inline-markdown.md", "line": 7, "text": "### [Wikilink](Welcome) text" }
  ]
}
```

`Welcome.md` does NOT appear in the line-mode response because no body
line in `Welcome.md` literally contains the substring "Welcome" — this
is the **line-mode count divergence** behavioural note below.

### Example 3 — Folder-scoped call

```json
{
  "name": "search",
  "arguments": { "query": "Welcome", "folder": "Fixtures" }
}
```

Spawns one call: `obsidian search query=Welcome path=Fixtures format=json limit=1001`.
Response:

```json
{
  "count": 1,
  "paths": ["Fixtures/BI-017/inline-markdown.md"]
}
```

Equivalent forms — `folder: "/Fixtures"`, `folder: "Fixtures/"`,
`folder: "/Fixtures/"` all normalise to `Fixtures`. `folder: "/"` alone
normalises to empty and is treated as no folder restriction.

### Example 4 — Capped result with `truncated: true`

```json
{
  "name": "search",
  "arguments": { "query": "the", "limit": 3 }
}
```

Spawns one call: `obsidian search query=the format=json limit=4`. The
wrapper requests `limit + 1` to detect cap-clip. Response (against a
vault with > 3 hits):

```json
{
  "count": 3,
  "paths": ["a.md", "b.md", "c.md"],
  "truncated": true
}
```

### Example 5 — Case-sensitive query

```json
{
  "name": "search",
  "arguments": { "query": "Welcome", "case_sensitive": true }
}
```

Spawns one call: `obsidian search query=Welcome case format=json limit=1001`.
Only files whose text contains an exact-case "Welcome" appear.

### Example 6 — Cross-vault routing

```json
{
  "name": "search",
  "arguments": { "query": "alpha", "vault": "ResearchVault" }
}
```

Routes to the named vault; an unknown vault surfaces as
`CLI_REPORTED_ERROR(VAULT_NOT_FOUND)`.

### Example 7 — Long-line truncation in line mode

Underlying file has a 600-char line containing the query at position 10:

```json
{
  "name": "search",
  "arguments": { "query": "foo", "context_lines": true }
}
```

Response:

```json
{
  "count": 1,
  "matches": [
    { "path": "Long/file.md", "line": 1, "text": "<first 500 chars of the line>…" }
  ]
}
```

The `text` is exactly 501 characters (500 raw + the single U+2026
ellipsis marker) per FR-024.

### Example 8 — Validation rejection

```json
{
  "name": "search",
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
    "text": "{\"code\":\"VALIDATION_ERROR\",\"message\":\"search input failed schema validation\",\"details\":{\"issues\":[{\"path\":[\"query\"],\"message\":\"query is empty or whitespace-only (FR-010)\",\"code\":\"custom\"}]}}"
  }]
}
```

## Error roster

All failure surfaces flow through `UpstreamError` per Constitution
Principle IV. `search` introduces **zero new top-level error codes**
and **zero new `details.code` strings** — the seventeen-tool zero-new-codes
streak is preserved.

The roster below is reconciled to the **Cowork pathway** (BI-041 FR-009 / SC-004). Two codes carry an explicit `*(strict-rich pathway only, per BI-0086 — <reason>)*` flag because Cowork's client-side transforms render them unreachable on the Cowork pathway; both remain in the roster because they DO fire on the strict-rich pathway (Claude Desktop, MCP Inspector) and agents on that pathway need to know what to recover from. The flag count is auditable: `grep -c "strict-rich pathway only, per BI-0086"` on this section yields exactly `2`.

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed the schema (Cowork-reachable subset): missing / empty / whitespace-only / oversize `query`; non-integer `limit`; empty `vault` / `folder`. | Agent retries with corrected input. `details.issues` carries per-issue zod context. |
| `VALIDATION_ERROR(unrecognized_keys)` | Unknown top-level key (e.g. `{ query, unknown_key }`) submitted via the strict-rich pathway. *(strict-rich pathway only, per BI-0086 — Cowork strips unknown top-level keys client-side per `additionalProperties: false`, so this code never fires on Cowork.)* | Strict-rich agents: drop the unknown key. Cowork agents: not reachable. |
| Out-of-range `limit` (wrapped `VALIDATION_ERROR`) | `limit` < 1 or > 10000 submitted via the strict-rich pathway. *(strict-rich pathway only, per BI-0086 — Cowork surfaces this as MCP transport error `-32602` (Invalid Params), not as the wrapper's wrapped `VALIDATION_ERROR`.)* | Strict-rich agents: clamp `limit` to `1..10000`. Cowork agents: recover from the `-32602` MCP transport error instead. |
| `CLI_REPORTED_ERROR` | Wrapper-imposed: (a) CLI stdout was not JSON AND not the zero-match sentinel (`details.stage: "json-parse"`); (b) CLI JSON failed wire-schema parse (`details.stage: "wire-parse"`); (c) unknown vault (`details.code: "VAULT_NOT_FOUND"` — inherited from cli-adapter). | (a)+(b) investigate as an upstream-contract regression; (c) supply a valid vault name. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (typical cause: output-cap kill on extreme result sets). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Reduce scope with `folder`, `limit`, or a narrower `query`. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |
| `CLI_OUTPUT_TOO_LARGE` | The CLI's stdout exceeded the cli-adapter's 10 MiB output cap. | Reduce scope; raise `limit` is NOT a recovery (the cap is on bytes, not entries). |

### Pathway distinction (BI-0086 / BI-041)

The wrapper serves two MCP client classes:

- **Cowork pathway** — the Cowork MCP client. Strict-naive-but-spec-conformant: strips unknown top-level keys client-side per `additionalProperties: false` AND coerces non-string payloads to strings on open-schema fields BEFORE bytes hit the wrapper. The two carve-out codes above never reach the wrapper here.
- **Strict-rich pathway** — Claude Desktop, MCP Inspector. Submits raw input; exercises the wrapper's full validation surface. The two carve-out codes fire as written.

The roster's reachability claims are bounded by the Cowork pathway with explicit strict-rich-pathway-only flags for the BI-0086 carve-outs.

### Dual validation envelope (BI-042 cohort acknowledgement)

The pathway distinction above produces two distinct wire envelopes per validation rejection:

| Constraint family | Wrapped envelope (`UpstreamError`) | MCP transport envelope |
|---|---|---|
| String / numeric `min`/`max`/`length` on `query`, `folder`, `limit`, `vault` | `VALIDATION_ERROR` with `details.issues` (zod issue body) — fires when the offending value reaches the wrapper (Cowork pathway, or strict-rich clients that forward un-validated input). | `-32602 Invalid Params` with a zod-issue body — fires when the strict-rich client validates against the published `inputSchema` and rejects before forwarding. |
| Custom `superRefine` (e.g. `query` trim non-empty) | `VALIDATION_ERROR` — wrapped envelope only; the constraint does not render into the published JSON Schema. | Not produced — strict-rich clients pass through. |
| Unknown top-level keys (`additionalProperties: false`) | `VALIDATION_ERROR(unrecognized_keys)` — strict-rich pathway only; Cowork strips client-side and never reaches the wrapper. | `-32602` — when the strict-rich client validates the published schema client-side. |

The dual envelope is structurally inherent to the wrapper + MCP transport architecture and is uniform across the cohort (`search`, `context_search`, `pattern_search`, `find_and_replace`, `find_by_property`, `backlinks`, `query_base`, `tag`). See [BI-042 dual-envelope evidence](../../specs/042-close-audit-findings/contracts/dual-envelope-evidence.md) and [BI-042 dual-envelope contract](../../specs/042-close-audit-findings/contracts/dual-validation-envelope-roster.md).

## Behavioural notes

### 1. Filename-match inflation (default mode)

The default-mode result set may include files whose **filename** or
metadata contains the query, even when no body line literally contains
it. `query=Welcome` returns `Welcome.md` because the filename matches;
the body need not contain "Welcome" at all. This is upstream behaviour
(F7) and is preserved by the wrapper.

### 2. Line-mode count divergence

Line mode (`context_lines: true`) returns ONLY entries whose `matches`
array was non-empty after upstream evaluation. Files matched by
filename / metadata but with no body-line hit are dropped (R9 / F7).
Consequence: `count` in line mode can be **less than** `count` in
default mode for the same query against the same vault. This is
intentional and inherited.

### 3. Conservative truncation in line mode

`truncated: true` in line mode fires when **either** the post-flatten
match-count exceeds the applied cap, **or** the underlying file-count
equals the applied cap (the latter signals upstream's file-side cap
fired, possibly dropping subsequent files entirely). The second
condition is conservative — it may fire when no actual drop occurred
— but preserves correctness over precision (R3 trade-off).

### 4. Non-`.md` files never appear

Upstream's `search` subcommand natively restricts to `.md` (F6); the
wrapper defensively re-filters wrapper-side via
`endsWith(".md")` (FR-021 / R6). `.canvas`, `.pdf`, etc. never reach
the caller.

### 5. Folder matching is case-sensitive byte-equal

`folder=Projects` does NOT match `projects/`. Upstream enforces
case-sensitive segment-boundary equality (F3); this is not affected by
the `case_sensitive` flag (which governs the query text, not the
folder filter).

### 6. Case-insensitive mode is ASCII-fold only

When `case_sensitive: false` (the default), folding is ASCII-only — the
Latin-1 accented characters are NOT case-folded against each other. `É`
in the query does NOT match `é` in the body. Use `case_sensitive: true`
when exact-case matching across non-ASCII is required.

## Inherited limitations

### Output-cap ceiling

Very large vaults may exceed the cli-adapter's 10 MiB output cap and
surface as `CLI_NON_ZERO_EXIT`. Narrow the scope with `folder`,
tighten `query`, or lower `limit` — the cap is enforced on raw stdout
bytes, so a smaller `limit` materially reduces the risk.

### No relevance ranking

Upstream returns results in its own order; the wrapper imposes a
deterministic sort (UTF-16 ascending for default mode; path-asc /
line-asc for line mode). No TF-IDF / BM25 / fuzzy ranking is exposed.
Callers needing semantic similarity use
[smart_connections_query](./smart_connections_query.md) instead.

### No `total: true` count-only mode at v1

Unlike `properties` / `tag` / `find_by_property`, `search` does NOT
expose a count-only mode. The `truncated` flag carries the "did we hit
the cap?" signal; explicit pre-flight counting requires a follow-up BI.

### No regex / boolean / surrounding-context

Upstream is substring-only — no regex queries, no `AND` / `OR` boolean
operators, no surrounding-context-lines (lines `N±k`). Line mode
returns only the matching line itself (FR-003). Cross-vault aggregation
is not exposed; callers iterate per vault.

### Single-call architecture

Each MCP request fires exactly ONE `invokeCli` invocation regardless of
mode. End-to-end latency is approximately 1× a single-call typed tool.
All invocations serialise through the project's single-in-flight queue.

### Argv anti-injection guarantee

User input (`query`, `folder`, `vault`) flows through discrete argv
parameters to the CLI via `child_process.spawn` — no shell
interpolation, no `eval` source-text concatenation. `search` is a
**native wrapper** (BI-019 / BI-024 / BI-030 cohort), not an
eval-template tool — the no-eval-injection-vector assertion holds
structurally.

## Related tools

- [tag](./tag.md) — find notes by tag (frontmatter and inline).
- [find_by_property](./find_by_property.md) — find notes by frontmatter
  property value.
- [smart_connections_query](./smart_connections_query.md) — semantic
  similarity, NOT substring matching.
- [files](./files.md) — enumerate notes by folder structure (no
  body-text query).
- [obsidian_exec](./obsidian_exec.md) — freeform escape hatch for
  `search:open` (UX) or `search format=text` (plain-text rendering).

## References

- [033-search-vault-content spec](../../specs/033-search-vault-content/spec.md)
  — feature spec with clarifications Q1–Q5 (Session 1) and Q1–Q3
  (Session 2), plus plan-stage Amendments 1–2 (FR-016 restated to plain
  `vault?`, FR-021 documented as defensive `.md` filter).
- [033-search-vault-content research](../../specs/033-search-vault-content/research.md)
  — R1–R16 design decisions, F1–F8 live-CLI probe findings.
- [033-search-vault-content data-model](../../specs/033-search-vault-content/data-model.md)
  — schema shapes, two-subcommand routing, post-process pipeline,
  per-tool invariants, fixture-seeding plan.
- [errors contract](../../specs/001-add-cli-bridge/contracts/errors.contract.md)
  — canonical roster of `UpstreamError` codes.
- [help tool spec](../../specs/005-help-tool/spec.md) — the
  schema-stripping contract and `help({ tool_name })` lookup that
  surfaces this document.
