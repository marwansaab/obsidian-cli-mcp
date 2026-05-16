# Contract: `search` Tool — Public Input

**Branch**: `033-search-vault-content`
**Date**: 2026-05-16
**Surface**: `tools.search` (MCP tool name `search`)
**Authority**: spec.md FR-001..FR-024, SC-001..SC-011 + plan-stage Amendments 1-2 + research.md R1..R16

## Input field policy

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `query` | `string` | YES | — | Non-empty post-trim AND ≤ 1000 chars raw (FR-010). Phrase-matched as a single literal substring; internal whitespace preserved verbatim (FR-001 / Q2). |
| `folder` | `string` | no | — | Vault-relative folder prefix; leading/trailing `/` normalised wrapper-side (FR-006). Case-sensitive segment-boundary match enforced by upstream CLI (FR-005 / F3). |
| `limit` | `integer` | no | implicit 1000 cap (FR-022) | Inclusive range `1..10000` (FR-007 / FR-008 / Q3). |
| `case_sensitive` | `boolean` | no | `false` | When `true`, sets CLI `case` flag; otherwise omitted → CLI default insensitive (FR-009 / Q5 / F5). |
| `context_lines` | `boolean` | no | `false` | When `true`, routes to `obsidian search:context`; otherwise `obsidian search` (R2). |
| `vault` | `string` | no | — | Plain vault-only routing (FR-016 restated by Amendment 1). Unknown vault → `CLI_REPORTED_ERROR(VAULT_NOT_FOUND)` (F8). |

Unknown keys → `VALIDATION_ERROR` (Principle III / FR-011 strict schema).

## JSON Schema (zod-derived; `additionalProperties: false`)

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["query"],
  "properties": {
    "query": { "type": "string", "minLength": 1, "maxLength": 1000 },
    "folder": { "type": "string", "minLength": 1 },
    "limit": { "type": "integer", "minimum": 1, "maximum": 10000 },
    "case_sensitive": { "type": "boolean" },
    "context_lines": { "type": "boolean" },
    "vault": { "type": "string", "minLength": 1 }
  }
}
```

The post-trim emptiness check (FR-010 "whitespace-only") is enforced via a zod `superRefine` and reported with `path: ["query"]`.

## Output shapes

### Default mode (`context_lines: false` or absent)

```json
{
  "count": 0,
  "paths": ["Projects/alpha.md", "Projects/beta.md"]
}
```

OR, when underlying set exceeded the applied cap (FR-022 / FR-023):

```json
{
  "count": 1000,
  "paths": ["..."],
  "truncated": true
}
```

Invariants: `count === paths.length`; `truncated` ONLY present when `true` (absent === `false`).

### Line mode (`context_lines: true`)

```json
{
  "count": 2,
  "matches": [
    { "path": "Projects/alpha.md", "line": 3, "text": "<line 3 text>" },
    { "path": "Projects/beta.md", "line": 12, "text": "<line 12 text>" }
  ]
}
```

OR, with truncation:

```json
{
  "count": 1000,
  "matches": [{ "path": "...", "line": 1, "text": "..." }, "..."],
  "truncated": true
}
```

Invariants: `count === matches.length`; `line ≥ 1` (1-based); `text` capped at 500 chars + `…` (U+2026) marker on truncated lines (FR-024).

## Worked examples

### A. Minimal default-mode call

```json
{ "query": "Welcome" }
```

Response (against TestVault-Obsidian-CLI-MCP):

```json
{
  "count": 2,
  "paths": ["Fixtures/BI-017/inline-markdown.md", "Welcome.md"]
}
```

### B. Line-mode call

```json
{ "query": "Welcome", "context_lines": true }
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

(`Welcome.md` is excluded from line-mode results because no body line contains the literal "Welcome" — R9 inherited limitation.)

### C. Folder-scoped call

```json
{ "query": "Welcome", "folder": "Fixtures" }
```

Response:

```json
{
  "count": 1,
  "paths": ["Fixtures/BI-017/inline-markdown.md"]
}
```

### D. Capped result

```json
{ "query": "the", "limit": 3 }
```

Response (against a vault with > 3 hits):

```json
{
  "count": 3,
  "paths": ["a.md", "b.md", "c.md"],
  "truncated": true
}
```

### E. Case-sensitive call

```json
{ "query": "Welcome", "case_sensitive": true }
```

Response (only files whose text capitalises "Welcome" exactly):

```json
{
  "count": 1,
  "paths": ["Welcome.md"]
}
```

### F. Cross-vault routing

```json
{ "query": "alpha", "vault": "ResearchVault" }
```

Routes to the named vault; unknown vault → `CLI_REPORTED_ERROR(VAULT_NOT_FOUND)`.

### G. Implicit-active vault

```json
{ "query": "todo" }
```

`vault` omitted → CLI defaults to the currently focused vault (FR-016 / R7).

### H. Long-line truncation in line mode

Underlying file has a 600-char line containing `query=foo` at character 10:

```json
{ "query": "foo", "context_lines": true }
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

The `text` is exactly 501 characters (500 + the ellipsis marker) per FR-024.

## Error response roster

| Failure | Top-level `code` | `details.code` / `stage` | Driver |
|---|---|---|---|
| `query` missing | `VALIDATION_ERROR` | — (zod field path) | FR-010 |
| `query` empty / whitespace-only | `VALIDATION_ERROR` | — (zod custom issue, `path: ["query"]`) | FR-010 |
| `query` > 1000 chars | `VALIDATION_ERROR` | — | FR-010 |
| `limit < 1` or `limit > 10000` or non-integer | `VALIDATION_ERROR` | — | FR-008 |
| Unknown input key | `VALIDATION_ERROR` | — (zod `unrecognized_keys`) | FR-011 |
| `vault` empty string | `VALIDATION_ERROR` | — | schema |
| `folder` empty string | `VALIDATION_ERROR` | — | schema |
| CLI binary not found | `CLI_BINARY_NOT_FOUND` | — | inherited |
| CLI exit ≠ 0 with non-sentinel stderr | `CLI_NON_ZERO_EXIT` | — | inherited |
| Unknown vault | `CLI_REPORTED_ERROR` | `code: "VAULT_NOT_FOUND"` | inherited (F8) |
| CLI stdout was non-JSON AND not zero-match sentinel | `CLI_REPORTED_ERROR` | `stage: "json-parse"` | R13 |
| CLI JSON failed wire-schema parse | `CLI_REPORTED_ERROR` | `stage: "wire-parse"` | R13 |
| Output cap exceeded (10 MiB cli-adapter cap) | `CLI_NON_ZERO_EXIT` | output-cap-kill | inherited |

ZERO new top-level error codes; ZERO new `details.code` strings. Constitution Principle IV preserved.

## Out-of-scope upstream surfaces (NOT exposed by this tool)

| Upstream feature | Why excluded |
|---|---|
| `search total=true` (CLI count-only flag) | spec uses `truncated` instead; v1 has no `total` field. |
| `search:open` subcommand | UX command (opens Obsidian search view); not a data primitive. |
| `format=text` plain output | wrapper always requests `format=json`; plain text never reaches the caller. |
| Regex queries | upstream is substring-only (R1); explicit out of scope per spec. |
| Multi-keyword boolean (`AND`/`OR`) | single keyword per call at v1. |
| Surrounding-context-lines (lines N±k) | line mode returns only the matching line itself (FR-003). |
| Cross-vault aggregation | callers iterate per vault as needed. |
| Frontmatter-property lookups | handled by `find_by_property` (BI-014). |

## Behavioural notes (documented in tool docs)

1. **Default-mode result set may include filename / metadata matches with no body-line hits** — e.g. `query=Welcome` returns `Welcome.md` because the filename contains "Welcome" even though the body doesn't (F7).
2. **Line-mode `count` may be LESS than default-mode `count` for the same query** — files matched by filename / metadata with no body-line match are dropped in line mode (R9 / F7).
3. **`truncated: true` in line mode is conservative** — may fire when the underlying line-set is exactly at the applied cap because the CLI file-cap fired (R3 trade-off).
4. **Non-`.md` files never appear in results** — natively enforced by upstream (F6) and defensively re-filtered wrapper-side (R6 / FR-021).
5. **Folder matching is case-sensitive byte-equal** — `folder=Projects` does NOT match `projects/` (F3).
6. **Case-insensitive mode is ASCII-fold only** — `É` query does NOT match `é` in file text (FR-009 / Q5).
