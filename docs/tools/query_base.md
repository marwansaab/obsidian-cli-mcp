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
- `rows` — up to 1000 row objects keyed by the column names; native JSON types preserved.
- `truncated` — always present; `true` when the row set was sliced down to 1000.
- `total_rows` — present only when `truncated: true`; reports upstream's full match count.

Empty views return success with `rows: []` and `columns` still populated.

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
