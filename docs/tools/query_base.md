# `query_base`

Run a named view from an Obsidian Bases (`.base`) file and return its matched rows as a structured JSON envelope. The typed wrapper for the upstream `obsidian base:query` subcommand; first member of the Bases-family cohort (siblings: `bases`, `views_base`, `create_base`).

## When to reach for this tool

- You know the `.base` file's vault-relative path AND the view's exact name, and you want the view's matched rows in a structured shape (instead of CSV/TSV/Markdown).
- You need native JSON types preserved (`number`, `boolean`, `null`, nested objects, ISO-date strings) without re-parsing tabular text.
- You want the four typed failure states (`BASE_NOT_FOUND` / `BASE_MALFORMED` / `VIEW_NOT_FOUND` / `VAULT_NOT_FOUND`) distinguishable via `details.code` so caller logic can branch cleanly.

Prefer `bases` to enumerate `.base` files first; prefer `views_base` to enumerate available views in a known `.base` before invoking `query_base`.

## Input

Authoritative source: [src/tools/query_base/schema.ts](../../src/tools/query_base/schema.ts) and [specs/039-query-base/contracts/input.schema.json](../../specs/039-query-base/contracts/input.schema.json).

| Field        | Type   | Required | Notes |
|--------------|--------|----------|-------|
| `base_path`  | string | yes      | Vault-relative path to the `.base` file. Must end with `.base` (case-insensitive on the extension). Length cap 1000 UTF-16 code units. No path-traversal shapes. |
| `view_name`  | string | yes      | Name of the view inside the `.base` file. Exact case-sensitive match — no trim, no fold, no fuzzy. Length cap 1000 UTF-16 code units. |
| `vault`      | string | no       | Optional vault display name. When absent, routes to the focused vault. |

## Output

Authoritative source: [specs/039-query-base/contracts/output.schema.json](../../specs/039-query-base/contracts/output.schema.json).

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
- `rows` — up to 1000 row objects keyed by the column names; **frontmatter values are stringified by upstream** regardless of their declared YAML type (see "Response-shape characterisation" below).
- `truncated` — always present; `true` when the row set was sliced down to 1000.
- `total_rows` — present only when `truncated: true`; reports upstream's full match count.

### Response-shape characterisation (BI-041)

The three claims below are empirically captured against the live `obsidian base:query` binary and pinned in [schema.ts](../../src/tools/query_base/schema.ts) `.describe()`. Agents writing parsing code MUST plan for them.

#### Empty-view columns (FR-006)

When a view matches **zero rows**, `columns` carries only `["path"]` — the wrapper has no signal for view-declared column names absent row data, and does NOT parse the `.base` YAML client-side to enumerate them. View-declared columns appear in `columns` only when at least one row matches. Empirical anchor: a `.base` view whose filter excludes all notes yields `{ columns: ["path"], rows: [], truncated: false }`.

#### Type-preservation passthrough (FR-007)

Frontmatter values are **stringified by upstream** regardless of their declared YAML type. The wrapper is passthrough — it does NOT coerce back to native JSON types. Empirical anchors: integer YAML `count: 42` surfaces as the string `"42"`; boolean YAML `done: true` surfaces as `"true"`. Agents must parse the string value if numeric or boolean semantics are required. The wrapper does NOT begin type-coercing values (out-of-scope per BI-041).

#### `file.*` column-name emission (FR-008)

Source-property column names declared as `file.X` are emitted by upstream as the display label `"file X"` (with **embedded space**) — including `file.path` → `"file path"` and `file.name` → `"file name"`. The wrapper does NOT remap these display labels back to YAML segment names (out-of-scope per BI-041).

Independent of the view's column declarations, the wrapper always injects a reserved `path` column at index 0 of every row carrying the source note's vault-relative path. This reserved `path` is sourced from upstream's row metadata and is distinct from `file.path` (which yields `"file path"`).

A view declaring `file.path` and `file.name` therefore produces three columns: `["path", "file path", "file name"]` — the wrapper's reserved locator plus both display labels. Agents indexing rows by column name MUST use the exact emitted string, including the embedded space for display labels.

Empirical anchor: a `.base` view declaring `file.path` + `file.name` yields a row of the form `{ "path": "Sandbox/intval.md", "file path": "Sandbox/intval.md", "file name": "intval" }`.

Empty views return success with `rows: []` and `columns: ["path"]` (the zero-row degenerate case above).

## Errors

See [specs/039-query-base/contracts/errors.md](../../specs/039-query-base/contracts/errors.md) for the complete error roster + caller-side switch template.

Quick reference:

| Top-level `code`        | `details.code`        | When                                            |
|-------------------------|-----------------------|-------------------------------------------------|
| `VALIDATION_ERROR`      | `INVALID_BASE_PATH`   | Empty / over-cap / wrong-extension / path-traversal |
| `VALIDATION_ERROR`      | `INVALID_VIEW_NAME`   | Empty / over-cap                                |
| `CLI_REPORTED_ERROR`    | `BASE_NOT_FOUND`      | `.base` file missing at the supplied path       |
| `CLI_REPORTED_ERROR`    | `BASE_MALFORMED`      | File present but unusable (`details.reason` narrows: `empty`, `invalid-yaml`, `missing-required-key`, `unsupported-schema-version`, `unknown`) |
| `CLI_REPORTED_ERROR`    | `VIEW_NOT_FOUND`      | File fine, view missing or case-mismatched      |
| `CLI_REPORTED_ERROR`    | `VAULT_NOT_FOUND`     | Unknown vault / closed-but-registered vault     |
| `PATH_ESCAPES_VAULT`    | —                     | `base_path` resolves outside the vault root     |
| `UPSTREAM_TIMEOUT`      | —                     | Subprocess exceeded 10 s wall-clock             |
| `OUTPUT_CAP_EXCEEDED`   | —                     | Upstream stdout exceeded 10 MiB                 |
| `INTERNAL_ERROR`        | —                     | Wrapper invariant violation (file a bug)        |

## Examples

See [specs/039-query-base/quickstart.md](../../specs/039-query-base/quickstart.md) for the eleven worked examples (happy path, empty view, truncation, reserved-key collision, missing file / malformed / missing view / case-mismatch / path-traversal / over-cap input / vault selection).

## Cohort

- **Bases family**: `bases` (enumerate `.base` files), `views_base` (enumerate views in a `.base`), `create_base` (create a new `.base`).
- **Cohort conventions**: `path`-locator reserved row field (ADR-003), `details.code` sub-discriminators (ADR-015), Layer 1 + Layer 2 path safety (ADR-009).
