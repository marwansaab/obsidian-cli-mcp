# `bases`

Enumerate all Obsidian Bases (`.base`) files in the vault and return their vault-relative paths as a sorted list. Member of the Bases-family cohort (siblings: `query_base`, `views_base`, `create_base`).

## When to use this tool

| You want to | Reach for |
|---|---|
| Discover all `.base` files in the vault | `bases` |
| Enumerate views inside a known `.base` file | `views_base` |
| Query rows from a named view | `query_base` |
| Create a new item in a `.base` file | `create_base` |

## Input

| Field   | Type   | Required | Notes |
|---------|--------|----------|-------|
| `vault` | string | no       | Vault display name. **Note**: silently ignored by the current CLI — the tool always operates on the active vault context. Accepted for forward compatibility. |

## Output

```json
{
  "bases": [
    "000-Meta/Bases/Type ID Index.base",
    "220-Planning/Backlog (Base).base",
    "Vault Health Check.base"
  ],
  "count": 3
}
```

- `bases` — vault-relative paths to `.base` files, sorted lexicographically (path-ascending).
- `count` — number of `.base` files found; always equals `bases.length`.
- Empty vault returns `{ "bases": [], "count": 0 }`.
- No truncation — all paths returned unconditionally.

## Vault routing limitation

The `vault` parameter is silently ignored by the underlying CLI for the `bases` subcommand. The tool always returns bases from the currently active vault context, regardless of the `vault` value provided. This is an inherited CLI limitation. The parameter is preserved for cohort parity with `query_base` (which does honour vault routing) and for forward compatibility.

## Error roster

| Top-level `code`     | When | Recovery |
|----------------------|------|----------|
| `CLI_REPORTED_ERROR` | Upstream CLI failure | Retry; check that Obsidian is running. |
| `VALIDATION_ERROR`   | Malformed input (e.g. unknown keys in strict mode) | Fix input shape. |
| `UPSTREAM_TIMEOUT`   | Subprocess exceeded 10 s | Retry; investigate vault size. |

## Worked examples

### Example 1 — Happy path

```json
{
  "name": "bases",
  "arguments": {}
}
```

Response:

```json
{
  "bases": [
    "000-Meta/Bases/Type ID Index.base",
    "220-Planning/Backlog (Base).base",
    "Vault Health Check.base"
  ],
  "count": 3
}
```

### Example 2 — Empty vault

```json
{
  "name": "bases",
  "arguments": {}
}
```

```json
{ "bases": [], "count": 0 }
```

### Example 3 — With vault parameter (ignored)

```json
{
  "name": "bases",
  "arguments": { "vault": "Work" }
}
```

Returns bases from the active vault context, not the specified vault. The `vault` parameter is silently ignored.
