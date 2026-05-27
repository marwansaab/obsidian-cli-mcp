# `query_base`

Run a named view from an Obsidian Bases (`.base`) file and return its matched rows as a structured JSON envelope. First member of the Bases-family cohort (siblings: `bases`, `views_base`, `create_base`).

## When to use this tool

| You want to | Reach for |
|---|---|
| Rows from a named view in a known `.base` file | `query_base` |
| Enumerate `.base` files in the vault | `bases` |
| Enumerate views inside a known `.base` file | `views_base` |
| Create a new `.base` file | `create_base` |

## Input

| Field        | Type   | Required | Notes |
|--------------|--------|----------|-------|
| `base_path`  | string | yes      | Vault-relative path to the `.base` file. Must end with `.base` (case-insensitive on the extension). Length cap 1000 UTF-16 code units. No path-traversal shapes. |
| `view_name`  | string | yes      | Name of the view inside the `.base` file. Exact case-sensitive match — no trim, no fold, no fuzzy. Length cap 1000 UTF-16 code units. |
| `vault`      | string | no       | Optional vault display name. When absent, routes to the focused vault. |

## Output

```json
{
  "columns": ["path", "id", "status", "priority"],
  "rows": [
    { "path": "Issues/BI-0039.md", "id": "BI-0039", "status": "open", "priority": 1 }
  ],
  "truncated": false
}
```

- `columns` — view-declared column names; reserved `path` always at index 0; a view-defined `path` is renamed to `path_view` per the reserved-key collision rule.
- `rows` — up to 1000 row objects keyed by the column names; **values are passed through as strings** even when the YAML declared a number/boolean (see *Type-preservation caveat* below).
- `truncated` — always present; `true` when the row set was sliced down to 1000.
- `total_rows` — present only when `truncated: true`; reports upstream's full match count.

### Empty-view columns

When a view matches **zero rows**, `columns` carries only `["path"]` — the wrapper has no signal for view-declared column names absent row data, and does NOT parse the `.base` YAML client-side to enumerate them. **View-declared columns appear in `columns` only when at least one row matches.** A `.base` view whose filter excludes all notes yields `{ columns: ["path"], rows: [], truncated: false }`.

### Type-preservation caveat

Frontmatter values are **stringified by upstream** regardless of their declared YAML type. The wrapper is passthrough — it does NOT coerce back to native JSON types.

- Integer YAML `count: 42` surfaces as the string `"42"`.
- Boolean YAML `done: true` surfaces as `"true"`.

Parse the string value client-side if numeric or boolean semantics are required.

### `file.*` column-name emission

Source-property column names declared as `file.X` are emitted by upstream as the display label `"file X"` (with **embedded space**) — including `file.path` → `"file path"` and `file.name` → `"file name"`. The wrapper does NOT remap these back to YAML segment names.

Independent of the view's column declarations, the wrapper always injects a reserved `path` column at index 0 of every row carrying the source note's vault-relative path. This reserved `path` is sourced from upstream's row metadata and is **distinct** from `file.path` (which yields `"file path"`).

A view declaring `file.path` and `file.name` therefore produces three columns: `["path", "file path", "file name"]` — the wrapper's reserved locator plus both display labels. Index rows by the exact emitted string, including the embedded space.

Example row: `{ "path": "Sandbox/intval.md", "file path": "Sandbox/intval.md", "file name": "intval" }`.

## Error roster

| Top-level `code`        | `details.code`        | When | Recovery |
|-------------------------|-----------------------|------|----------|
| `VALIDATION_ERROR`      | `INVALID_BASE_PATH`   | Empty / over-cap / wrong-extension / path-traversal | Inspect `details.reason`; supply a valid vault-relative `.base` path. |
| `VALIDATION_ERROR`      | `INVALID_VIEW_NAME`   | Empty / over-cap | Supply a non-empty view name within the length cap. |
| `CLI_REPORTED_ERROR`    | `BASE_NOT_FOUND`      | `.base` file missing at the supplied path | Verify the path; use `bases` to enumerate `.base` files in the vault. |
| `CLI_REPORTED_ERROR`    | `BASE_MALFORMED`      | File present but unusable (`details.reason` narrows: `empty`, `invalid-yaml`, `missing-required-key`, `unsupported-schema-version`, `unknown`) | Inspect `details.reason`; ask the user to fix the `.base` file in Obsidian. |
| `CLI_REPORTED_ERROR`    | `VIEW_NOT_FOUND`      | File fine, view missing or case-mismatched | Use `views_base` to enumerate the actual view names; retry with the exact name. |
| `CLI_REPORTED_ERROR`    | `VAULT_NOT_FOUND`     | Unknown vault (`details.reason: "unknown"`) or closed-but-registered (`"not-open"`) | Verify the vault name; for `"not-open"`, retry after a brief delay (the CLI is opening the vault). |
| `PATH_ESCAPES_VAULT`    | —                     | `base_path` resolves outside the vault root | Caller's bug — fix the path. |
| `UPSTREAM_TIMEOUT`      | —                     | Subprocess exceeded 10 s wall-clock | Narrow the view's filter, or investigate the `.base` complexity. |
| `OUTPUT_CAP_EXCEEDED`   | —                     | Upstream stdout exceeded 10 MiB | The view returns too much data; narrow the filter or paginate via a view declaration that limits row count. |
| `INTERNAL_ERROR`        | —                     | Wrapper invariant violation | File a bug. |

## Worked examples

### Example 1 — Happy path

```json
{
  "name": "query_base",
  "arguments": {
    "base_path": "Bases/Issues.base",
    "view_name": "Open Issues"
  }
}
```

Response:

```json
{
  "columns": ["path", "id", "status", "priority"],
  "rows": [
    { "path": "Issues/BI-0039.md", "id": "BI-0039", "status": "open", "priority": "1" }
  ],
  "truncated": false
}
```

### Example 2 — Empty view

```json
{
  "name": "query_base",
  "arguments": {
    "base_path": "Bases/Issues.base",
    "view_name": "Resolved Before 2020"
  }
}
```

```json
{ "columns": ["path"], "rows": [], "truncated": false }
```

Note: `columns` carries only `["path"]` — view-declared columns only surface when ≥ 1 row matches.

### Example 3 — Truncation

```json
{
  "name": "query_base",
  "arguments": {
    "base_path": "Bases/AllNotes.base",
    "view_name": "Default"
  }
}
```

For a view that matches 2,500 rows:

```json
{
  "columns": ["path", "title", "tags"],
  "rows": [/* 1000 entries */],
  "truncated": true,
  "total_rows": 2500
}
```

Narrow the view's filter to reduce the match count, or paginate via a view declaration.

### Example 4 — View not found

```json
{
  "name": "query_base",
  "arguments": {
    "base_path": "Bases/Issues.base",
    "view_name": "open issues"
  }
}
```

(Wrong case.) Returns `CLI_REPORTED_ERROR` with `details.code: "VIEW_NOT_FOUND"`. Use `views_base` to enumerate the actual view names.
