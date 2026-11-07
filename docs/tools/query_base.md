# `query_base`

Run a named view from an Obsidian Bases (`.base`) file and return its matched rows as a structured JSON envelope. First member of the Bases-family cohort (siblings: `bases`, `views_base`, `create_base`).

**Supported file types:** bases only (`base_path`). A `base_path` that does not end in `.base` is rejected as before, with `VALIDATION_ERROR` + `INVALID_BASE_PATH` (`wrong-extension`).

## When to use this tool

| You want to | Reach for |
|---|---|
| Rows from a named view in a known `.base` file | `query_base` |
| Enumerate `.base` files in the vault | `bases` |
| Enumerate views inside a known `.base` file | `views_base` |
| Add an item note to an existing `.base` file | `create_base` |

## Input

| Field        | Type   | Required | Notes |
|--------------|--------|----------|-------|
| `base_path`  | string | yes      | Vault-relative path to the `.base` file. Must end with `.base` (case-insensitive on the extension). Length cap 1000 UTF-16 code units. No path-traversal shapes. |
| `view_name`  | string | yes      | Name of the view inside the `.base` file. Exact case-sensitive match — no trim, no fold, no fuzzy. Length cap 1000 UTF-16 code units. |
| `vault`      | string | no       | Optional vault display name. When absent, routes to the focused vault. |

**Closed vault.** A registered vault that is not open is opened automatically, and the call returns its normal result (the first call takes longer). A vault that cannot be brought up is a failure, not an empty result: see **Vault unavailable** in the [error roster](#errors--error-roster).

## Output

```json
{
  "columns": ["path", "id", "status", "priority"],
  "rows": [
    { "path": "Issues/BI-0039.md", "id": "BI-0039", "status": "open", "priority": "1" }
  ],
  "truncated": false
}
```

- `columns` — view-declared column names; reserved `path` always at index 0; a view-defined `path` is renamed to `path_view` per the reserved-key collision rule.
- `rows` — up to 1000 row objects keyed by the column names; **values are passed through as strings** even when the YAML declared a number/boolean (see *Type-preservation caveat* below).
- `truncated` — always present; `true` when the row set was sliced down to 1000.
- `total_rows` — present only when `truncated: true`; reports upstream's full match count.
- `group_by` — present only for a [grouped view](#grouped-views): `{ property, direction }`, where `property` is the view's `groupBy.property` as written and `direction` is `"ASC"` or `"DESC"`.

Read-only — the tool never mutates vault contents.

### Grouped views

Obsidian's own `base:query` ignores a view's `groupBy` and returns flat rows in file-path order. For a view grouped by a property, `query_base` therefore does the grouping itself: it reads the view's `groupBy` from the `.base` file, asks Obsidian for each row's group value, and returns the rows in the order of the groups Obsidian shows.

```json
{
  "columns": ["path", "group", "file name"],
  "rows": [
    { "path": "Sandbox/b-note.md", "group": "one", "file name": "b-note" },
    { "path": "Sandbox/a-note.md", "group": "two", "file name": "a-note" },
    { "path": "Sandbox/c-note.md", "group": "two", "file name": "c-note" }
  ],
  "truncated": false,
  "group_by": { "property": "note.status", "direction": "ASC" }
}
```

- **`group`** is a reserved key right after `path`, in every row and in `columns`. It holds the row's group value as Obsidian prints it (a string), or `null` for the group of rows with no value. The group property does not have to be a view column.
- **`group_view`.** A view column also named `group` is renamed `group_view`, in the rows and in `columns`, the same way a view column named `path` becomes `path_view`.
- **Order.** Groups come in Obsidian's group order for the view's `direction`. Rows keep the view's order inside their group. The `null` group is last in both directions.
- **What shares a group.** Obsidian's loose equality decides, not the printed text: `9` and `"9"` share a group, so do `true` and `1`, a one-element list and its element, and a string and a link to that note. `"two"` and `"Two"` are separate groups.
- **`""` is not `null`.** An empty string, an empty list, or `file.tags` on a note with no tags each form a group whose `group` is `""`. That group is separate from the `null` group and is ordered with the other values, as in Obsidian.
- **Duplicate labels.** `file.ctime` and `file.mtime` groups are told apart to the millisecond but printed to the second (`YYYY-MM-DDTHH:mm:ss`, local time), so two neighbouring groups can carry the same `group` string, exactly as Obsidian shows them.
- **Supported properties.** Note (frontmatter) properties, written `note.<name>` or bare, and `file.folder`, `file.ext`, `file.tags`, `file.ctime` and `file.mtime`. Formula grouping, any other `file.*` property and a custom group order fail with `GROUPING_UNSUPPORTED` (see the [error roster](#errors--error-roster)); they never come back as flat rows.
- **When a view counts as grouped.** As in Obsidian, only when its `groupBy` has a non-empty `property` and a `direction` of exactly `ASC` or `DESC`. Any other `groupBy` leaves the view ungrouped, and Obsidian shows it ungrouped too. The `groupBy` must be in the block-style YAML Obsidian writes; a shape the server cannot read fails with `GROUPING_UNSUPPORTED` / `unreadable-group-by`.
- **The cap applies after grouping.** The 1000 rows returned are the first 1000 in group order, and `truncated` / `total_rows` work as for any view.
- **Cost.** Reading the group values takes extra `eval` calls, about one per 12 rows for long paths (~100 characters) and one per 70 rows for short ones. A zero-row grouped view makes none.

An ungrouped view's response has no `group_by` and no `group` key, and is exactly what it was before grouped views were supported.

### Empty-view columns

When a view matches **zero rows**, `columns` carries only `["path"]` (`["path", "group"]` for a grouped view) — the wrapper has no signal for view-declared column names absent row data, and does NOT parse the `.base` YAML client-side to enumerate them (it reads the `.base` only for the view's `groupBy`). **View-declared columns appear in `columns` only when at least one row matches.** A `.base` view whose filter excludes all notes yields `{ columns: ["path"], rows: [], truncated: false }`.

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

## Errors — Error roster

| Top-level `code`        | `details.code`        | When | Recovery |
|-------------------------|-----------------------|------|----------|
| `VALIDATION_ERROR`      | `INVALID_BASE_PATH`   | Empty / over-cap / wrong-extension / path-traversal. `details` carries `reason` (`empty`, `too-long`, `wrong-extension`, `path-traversal`), `field: "base_path"`, `value_length` (empty, too-long) or `value` (the other two), and the generic `issues` list. The top-level `message` is the issue's own text, for example `INVALID_BASE_PATH/wrong-extension: base_path must end with .base`. | Inspect `details.reason`; supply a valid vault-relative `.base` path. |
| `VALIDATION_ERROR`      | `INVALID_VIEW_NAME`   | Empty / over-cap. `details` carries `reason` (`empty`, `too-long`), `field: "view_name"`, `value_length` and the generic `issues` list; the top-level `message` is the issue's own text, for example `INVALID_VIEW_NAME/empty: view_name is empty`. | Supply a non-empty view name within the length cap. |
| `CLI_REPORTED_ERROR`    | `BASE_NOT_FOUND`      | `.base` file missing at the supplied path (checked before the query, and again when the file is read for the view's `groupBy` after it) | Verify the path; use `bases` to enumerate `.base` files in the vault. |
| `CLI_REPORTED_ERROR`    | `GROUPING_UNSUPPORTED` | The view is grouped in a way the server cannot reproduce. `details.reason` narrows: `custom-group-order` (the view sets a `groupOrder` list); `unreadable-group-by` (the `groupBy` is not in the block-style YAML Obsidian writes; `details.detail` says what was found); `property` (formula grouping, or a `file.*` property other than `folder`, `ext`, `tags`, `ctime`, `mtime`; `details.property`); `value-type` (a row's value cannot be matched, such as an object or a non-finite number; `details.path` and `details.value_type`); `collator-locale` (Obsidian sorts groups in a locale this server's ICU lacks; `details.locale`). `details.base_path` and `details.view_name` accompany the first two. | Remove the custom group order or group by a supported property, or query an ungrouped view of the same Base. The server never falls back to flat rows. |
| `CLI_REPORTED_ERROR`    | — (`details.stage: "group-values"`, `details.reason: "note-not-found"`) | A grouped view's row named a note that was gone by the time its group value was read (`details.path`). | Call again. |
| `CLI_REPORTED_ERROR`    | — (`details.stage: "json-parse"` or `"envelope-parse"`) | Reading a grouped view's group values failed: Obsidian's answer was missing or malformed, answered for a different number of rows (`details.asked`, `details.answered`), or reported different sort locales across calls (`details.locales`). | Call again; if it persists, file a bug with the `details`. |
| `CLI_REPORTED_ERROR`    | `BASE_MALFORMED`      | File present but unusable (`details.reason` narrows: `empty`, `invalid-yaml`, `missing-required-key`, `unsupported-schema-version`, `unknown`) | Inspect `details.reason`; ask the user to fix the `.base` file in Obsidian. |
| `CLI_REPORTED_ERROR`    | `VIEW_NOT_FOUND`      | File fine, view missing or case-mismatched | Use `views_base` to enumerate the actual view names; retry with the exact name. |
| `CLI_REPORTED_ERROR`    | `VAULT_NOT_FOUND`     | Unknown vault (`details.reason: "unknown"`) | Verify the vault name. |
| `CLI_REPORTED_ERROR`    | `VAULT_NOT_FOUND`     | The vault is registered, but its folder is missing on disk (`details.reason: "folder-missing"`, `details.vault`). Raised before the CLI runs; the message carries no disk path. | Ask the user to restore the folder, or re-open the vault in Obsidian, then call again. |
| `CLI_REPORTED_ERROR`    | —                     | The vault's folder could not be checked for another reason (`details.stage: "vault-root-check"`, `details.errno`, `details.vault`) | Inspect `details.errno` (for example a permission problem); fix it, then call again. |
| `CLI_REPORTED_ERROR`    | —                     | **Vault unavailable.** `details.stdout` starts `Error: Command "base:query" not found.`: the named vault is registered but could not be brought up after the server's automatic retry. This is a failure, not an empty result. | Open the vault in Obsidian, then call again. Do not retry in a loop; the server has already retried once. |
| `CLI_REPORTED_ERROR`    | — (`details.reason: "cli-disabled"`) | **Command line turned off.** Obsidian's **Command line interface** setting (Settings > General > Advanced) is off. The message is `Obsidian's command line interface is turned off. Ask the user to turn on Settings > General > Advanced > Command line interface in Obsidian, then call again.`, and `details.stdout` holds Obsidian's notice `Command line interface is not enabled. Please turn it on in Settings > General > Advanced.` | Ask the user to turn the setting on, then call again. This is a failure, never an empty result. |
| `PATH_ESCAPES_VAULT`    | —                     | `base_path` resolves outside the vault root. The message is the generic `CLI bridge upstream error: PATH_ESCAPES_VAULT`; `details: { vault, attemptedPath, resolvedPath }`. | Caller's bug — fix the path. |
| `UPSTREAM_TIMEOUT`      | —                     | Subprocess exceeded 10 s wall-clock | Narrow the view's filter, or investigate the `.base` complexity. |
| `OUTPUT_CAP_EXCEEDED`   | —                     | Upstream stdout exceeded 10 MiB | The view returns too much data; narrow the filter or paginate via a view declaration that limits row count. |
| `INTERNAL_ERROR`        | —                     | Wrapper invariant violation | File a bug. |

`BASE_MALFORMED` (except `empty`) carries the upstream report verbatim in `details.message`, with no length bound and no `details.messageLength`. `views_base` reports the same `invalid-yaml` complaint bounded to its first and last 500 characters when it is longer than 1,000, with `details.messageLength`; `query_base` was deliberately left unchanged by spec 081.

## Examples — Worked examples

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

### Example 5 — Grouped view, descending

A view in `Bases/Issues.base` declares `groupBy: { property: note.status, direction: DESC }` and the column `file.name`; `status` is not a column, and one note has no `status`.

```json
{
  "name": "query_base",
  "arguments": {
    "base_path": "Bases/Issues.base",
    "view_name": "By Status"
  }
}
```

```json
{
  "columns": ["path", "group", "file name"],
  "rows": [
    { "path": "Issues/a.md", "group": "two", "file name": "a" },
    { "path": "Issues/c.md", "group": "two", "file name": "c" },
    { "path": "Issues/b.md", "group": "one", "file name": "b" },
    { "path": "Issues/d.md", "group": null, "file name": "d" }
  ],
  "truncated": false,
  "group_by": { "property": "note.status", "direction": "DESC" }
}
```

The `null` group (no `status`) stays last even in descending order. A view that also set `groupOrder` would instead fail with `CLI_REPORTED_ERROR`, `details.code: "GROUPING_UNSUPPORTED"`, `details.reason: "custom-group-order"`.
