# Quickstart: query_base

**Branch**: `039-query-base` | **Date**: 2026-05-20
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Data Model**: [data-model.md](./data-model.md)

Worked examples for the `query_base` typed MCP tool — happy paths, error envelopes, truncation, and the reserved-key collision rule. Aimed at agents calling the tool and at reviewers verifying acceptance against the contract.

## 1. Happy path — single view, default columns

**Input**:

```json
{
  "base_path": "Indexes/Active BIs.base",
  "view_name": "Open"
}
```

**Response**:

```json
{
  "columns": ["path", "id", "status", "priority", "created"],
  "rows": [
    { "path": "Issues/BI-0039.md", "id": "BI-0039", "status": "open", "priority": 1, "created": "2026-05-20" },
    { "path": "Issues/BI-0048.md", "id": "BI-0048", "status": "open", "priority": 2, "created": "2026-05-18" }
  ],
  "truncated": false
}
```

**What this confirms**: the reserved `path` field is at `columns[0]`; non-`path` keys (`id`, `status`, `priority`, `created`) are upstream-passthrough; row values preserve their native JSON types (`priority: 1` as a `number`, `status: "open"` as a `string`); the row set fit in the cap so `truncated: false` and `total_rows` is omitted.

## 2. Empty view — successful zero-row response

**Input**:

```json
{
  "base_path": "Indexes/Active BIs.base",
  "view_name": "Closed Today"
}
```

**Response**:

```json
{
  "columns": ["path", "id", "status", "closed_at"],
  "rows": [],
  "truncated": false
}
```

**What this confirms**: an empty view returns success — NOT an error (FR-006). The `columns` vector is still populated (FR-002c) so the agent learns the view's schema even when zero rows match.

## 3. Truncation — view matches more than 1000 rows

**Input**:

```json
{
  "base_path": "Vault/All Notes.base",
  "view_name": "Every Note"
}
```

**Response** (first 1000 rows shown abbreviated):

```json
{
  "columns": ["path", "id", "created"],
  "rows": [
    { "path": "Notes/aardvark.md", "id": null, "created": "2024-01-01" },
    "… 998 more rows in path ascending order …",
    { "path": "Notes/zyzzyva.md", "id": null, "created": "2026-04-30" }
  ],
  "truncated": true,
  "total_rows": 4527
}
```

**What this confirms**: when truncation fires, `truncated: true` AND `total_rows` is present with the upstream's full match count (FR-013). The agent can plan narrowing: 4527 → too broad; narrow by tag or folder or date range. A view that legitimately matches exactly 1000 notes would surface `truncated: false` (NOT a false-positive — FR-013).

## 4. Reserved-key collision — view defines a column named `path`

**Input**:

```json
{
  "base_path": "Indexes/Custom Paths.base",
  "view_name": "with-custom-path-column"
}
```

The view declares columns `path` (a user-defined column emitting some custom string) and `priority`.

**Response**:

```json
{
  "columns": ["path", "path_view", "priority"],
  "rows": [
    {
      "path": "Issues/BI-0039.md",
      "path_view": "Custom path for this row, from the view's path column",
      "priority": 1
    }
  ],
  "truncated": false
}
```

**What this confirms**: the wrapper-injected `path` (vault-relative source-note path) wins under the collision rule (FR-002b); the view-defined column surfaces as `path_view` at the index the view declared for the original `path` column. Both names are visible in `columns` so callers disambiguate without re-probing the row shape.

## 5. Missing base file — typed error with sub-discrimination

**Input**:

```json
{
  "base_path": "Indexes/does-not-exist.base",
  "view_name": "anything"
}
```

**Error envelope**:

```json
{
  "code": "CLI_REPORTED_ERROR",
  "details": {
    "code": "BASE_NOT_FOUND",
    "base_path": "Indexes/does-not-exist.base"
  },
  "message": "query_base: base file not found at the supplied vault-relative path"
}
```

**What this confirms**: file-missing fires a typed error programmatically distinguishable from view-missing (FR-004). Top-level `CLI_REPORTED_ERROR` with `details.code: "BASE_NOT_FOUND"`. Caller's remediation path: fix the filename.

## 6. Missing view — typed error distinguishable from missing file

**Input**:

```json
{
  "base_path": "Indexes/Active BIs.base",
  "view_name": "Nonexistent View"
}
```

**Error envelope**:

```json
{
  "code": "CLI_REPORTED_ERROR",
  "details": {
    "code": "VIEW_NOT_FOUND",
    "view_name": "Nonexistent View",
    "base_path": "Indexes/Active BIs.base"
  },
  "message": "query_base: view not found in base file"
}
```

**What this confirms**: same top-level code (`CLI_REPORTED_ERROR`) but different `details.code` ("VIEW_NOT_FOUND" vs "BASE_NOT_FOUND"). The caller can branch on `details.code` to distinguish the two states (FR-005, cohort parity with `VAULT_NOT_FOUND` / `NOTE_NOT_FOUND`).

## 7. Malformed base file — invalid YAML

**Input**:

```json
{
  "base_path": "Indexes/broken.base",
  "view_name": "any"
}
```

The file exists but contains syntactically-broken YAML.

**Error envelope**:

```json
{
  "code": "CLI_REPORTED_ERROR",
  "details": {
    "code": "BASE_MALFORMED",
    "reason": "invalid-yaml",
    "base_path": "Indexes/broken.base",
    "message": "<upstream's verbatim error message>"
  },
  "message": "query_base: base file is structurally unusable (invalid YAML)"
}
```

**What this confirms**: three distinct states in the "something is wrong with the base" family (FR-005b). `BASE_NOT_FOUND` → fix filename; `BASE_MALFORMED` → fix file content (`reason` narrows to one of `empty` / `invalid-yaml` / `missing-required-key` / `unsupported-schema-version` / `unknown`); `VIEW_NOT_FOUND` → use a valid view name. Each surfaces with a different `details.code` so callers' switch sites branch cleanly.

## 8. Case-mismatch on view name — exact match, no silent fix

**Input**:

```json
{
  "base_path": "Indexes/Active BIs.base",
  "view_name": "open"
}
```

The file declares a view named `"Open"` (capital O). The caller passed lowercase `"open"`.

**Error envelope**:

```json
{
  "code": "CLI_REPORTED_ERROR",
  "details": {
    "code": "VIEW_NOT_FOUND",
    "view_name": "open",
    "base_path": "Indexes/Active BIs.base"
  },
  "message": "query_base: view not found in base file"
}
```

**What this confirms**: exact case-sensitive matching (FR-005a) — the wrapper does NOT silently fold case. The caller's typo surfaces as a clean error; remediation is to use the exact-cased view name (recoverable from a `views_base` call to the same base file).

## 9. Path-traversal input — rejected at validation boundary

**Input**:

```json
{
  "base_path": "../../etc/secrets.base",
  "view_name": "any"
}
```

**Error envelope** (no subprocess invocation, no filesystem access):

```json
{
  "code": "VALIDATION_ERROR",
  "details": {
    "code": "INVALID_BASE_PATH",
    "reason": "path-traversal",
    "field": "base_path",
    "value": "../../etc/secrets.base"
  },
  "message": "query_base: base_path contains path-traversal shapes"
}
```

**What this confirms**: input-validation boundary rejects path-traversal shapes (`../`, leading `/` or `\`, drive-letter prefix, control characters) BEFORE any filesystem access (FR-010 Layer 1, ADR-009).

## 10. Over-cap input — rejected at validation boundary

**Input** (a `view_name` 5028 chars long, e.g., from a paste-accident):

```json
{
  "base_path": "Indexes/Active BIs.base",
  "view_name": "<5028-character paste of note contents>"
}
```

**Error envelope**:

```json
{
  "code": "VALIDATION_ERROR",
  "details": {
    "code": "INVALID_VIEW_NAME",
    "reason": "too-long",
    "field": "view_name",
    "value_length": 5028
  },
  "message": "query_base: view_name exceeds 1000 UTF-16 code units"
}
```

**What this confirms**: 1000-character cap on `base_path` and `view_name` (FR-011a, parity with BI-033 / BI-038). Paste-accident surfaces as a hard error at the input boundary, no subprocess spawn, no log noise beyond the validation refusal.

## 11. Vault selection — focused-vault default

**Input**:

```json
{
  "base_path": "Indexes/Active BIs.base",
  "view_name": "Open"
}
```

No `vault` field — operation runs against the focused vault.

**Input** (named vault):

```json
{
  "base_path": "Indexes/Active BIs.base",
  "view_name": "Open",
  "vault": "Work"
}
```

Routes through the lazy vault registry; unknown / closed-but-registered vault surfaces `CLI_REPORTED_ERROR` + `details.code: "VAULT_NOT_FOUND"` + `details.reason ∈ {"unknown", "not-open"}` (cohort reuse, FR-009).

## Acceptance verification against the spec

This quickstart's eleven examples cover every user-story acceptance scenario in the spec:

| Quickstart example | Spec story / scenario |
|--------------------|-----------------------|
| 1 — happy path single view | User Story 1, scenarios 1 + 3 |
| 2 — empty view | User Story 1 scenario 4; User Story 2 scenario 3 |
| 3 — truncation | Edge Cases (>1000 rows) + FR-013 |
| 4 — collision rule | Edge Cases (view-defined `path` collision) + FR-002b |
| 5 — missing file | User Story 2 scenario 1 |
| 6 — missing view | User Story 2 scenario 2 |
| 7 — malformed base | FR-005b + edge case (invalid-yaml) |
| 8 — case mismatch | FR-005a + edge case |
| 9 — path traversal | FR-010 Layer 1 + edge case |
| 10 — over-cap input | FR-011a + edge cases |
| 11 — vault selection | FR-009 |

Independent test design pulls fixtures from these examples in /speckit-tasks.
