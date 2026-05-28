# `views_base`

List the views defined inside the currently focused Obsidian Bases (`.base`) file. Member of the Bases-family cohort (siblings: `bases`, `query_base`, `create_base`).

## When to use this tool

| You want to | Reach for |
|---|---|
| Enumerate views inside the focused `.base` file | `views_base` |
| Discover all `.base` files in the vault | `bases` |
| Query rows from a named view | `query_base` |
| Create a new item in a `.base` file | `create_base` |

## Active-mode-only limitation

This tool operates **exclusively** on the file currently focused in Obsidian. There is no `path` parameter — the user must have a `.base` file open and focused for this tool to succeed. If the focused file is not a `.base` file (or no file is focused), the tool returns a structured `BASE_NOT_FOUND` error.

## Input

| Field   | Type   | Required | Notes |
|---------|--------|----------|-------|
| `vault` | string | no       | Vault display name. **Note**: silently ignored by the current CLI. Accepted for forward compatibility. |

## Output

```json
{
  "views": ["All", "Active", "Completed"],
  "count": 3
}
```

- `views` — view names defined in the focused `.base` file, in CLI emission order.
- `count` — number of views found; always equals `views.length`.
- Zero-view base returns `{ "views": [], "count": 0 }`.

## Vault routing limitation

The `vault` parameter is silently ignored by the underlying CLI for the `base:views` subcommand. The tool always operates on the active vault context. This is an inherited CLI limitation, preserved for cohort parity with `query_base`.

## Error roster

| Top-level `code`     | `details.code`   | When | Recovery |
|----------------------|------------------|------|----------|
| `CLI_REPORTED_ERROR` | `BASE_NOT_FOUND` | Focused file is not a `.base` file, or no file is focused | Ask the user to focus a `.base` file in Obsidian. |
| `CLI_REPORTED_ERROR` | —                | Other upstream CLI failure | Retry; check that Obsidian is running. |
| `VALIDATION_ERROR`   | —                | Malformed input (e.g. unknown keys) | Fix input shape. |
| `UPSTREAM_TIMEOUT`   | —                | Subprocess exceeded 10 s | Retry. |

## Worked examples

### Example 1 — Happy path (`.base` file focused)

```json
{
  "name": "views_base",
  "arguments": {}
}
```

Response:

```json
{
  "views": ["All", "Active", "Completed"],
  "count": 3
}
```

### Example 2 — Focused file is not a `.base` file

```json
{
  "name": "views_base",
  "arguments": {}
}
```

Returns `CLI_REPORTED_ERROR` with `details.code: "BASE_NOT_FOUND"`. Ask the user to open a `.base` file in Obsidian and retry.

### Example 3 — No views defined

```json
{
  "name": "views_base",
  "arguments": {}
}
```

```json
{ "views": [], "count": 0 }
```
