# `views_base`

List the views defined inside an Obsidian Bases (`.base`) file. Member of the Bases-family cohort (siblings: `bases`, `query_base`, `create_base`).

## When to use this tool

| You want to | Reach for |
|---|---|
| Enumerate the views inside a `.base` file (named or focused) | `views_base` |
| Discover all `.base` files in the vault | `bases` |
| Query rows from a named view | `query_base` |
| Create a new item in a `.base` file | `create_base` |

## Two modes

`views_base` works the same whether you name a Base or let it read the focused one.

| `base_path` | `vault` | Behaviour |
|---|---|---|
| absent | any | **Open-Base mode.** List the views of the `.base` currently focused in Obsidian. (`vault` is an inherited no-op here.) |
| present | absent | **Named-Base mode.** List the views of the named `.base` in the focused vault, regardless of what is focused. |
| present | present | **Named-Base, cross-vault.** List the views of the named `.base` in the named vault — reached whether that vault is focused, open-but-unfocused, or closed. |

A named Base **always wins** over whatever is focused; the open Base is never silently substituted for a named target. Naming a Base focuses it as a side effect (which file is active changes) — the tool is otherwise read-only and never creates, modifies, or deletes vault content.

## Input

| Field       | Type   | Required | Notes |
|-------------|--------|----------|-------|
| `base_path` | string | no       | Vault-relative path to the `.base` file (the identifier `bases` emits and `query_base`/`create_base` accept). Omit to read the focused Base. Validated like `query_base.base_path` (must be a structurally safe path ending in `.base`, ≤ 1000 UTF-16 units). |
| `vault`     | string | no       | Vault display name (min length 1). With `base_path`, routes the listing cross-vault. Without `base_path`, ignored by the underlying active subcommand (preserved for cohort parity). |

## Output

```json
{
  "views": ["Obsidian CLI MCP - Backlog", "Obsidian CLI MCP - Open Bugs"],
  "count": 2
}
```

- `views` — the view names defined in the Base, in CLI emission order.
- `count` — number of views; always equals `views.length`.
- Zero-declared-views Base returns whatever Obsidian materialises (typically a single default view); a genuinely empty result is `{ "views": [], "count": 0 }`.

## Clean, query-ready names

The native `base:views` subcommand emits each line as `<view name>\t<view type>` — the view name followed by a TAB and the view's type token (`table`, `cards`, or `list`). `views_base` strips that injected `\t<type>` label so each returned name is **exactly** the name defined in the `.base` file and **accepted verbatim** as `query_base`'s `view_name` for the same Base — no caller-side cleanup. Because the delimiter is a TAB (which a view name cannot contain), internal spaces, hyphens, colons, and parentheses in the name are preserved character-for-character. The strip is anchored to the known view-type token set, so a view literally named `table` keeps its name and loses only the label.

## Error roster

| Top-level `code`     | `details.code`     | `details.reason` | When | Recovery |
|----------------------|--------------------|------------------|------|----------|
| `VALIDATION_ERROR`   | —                  | `params.code: "INVALID_BASE_PATH"` (`empty` / `too-long` / `path-traversal` / `wrong-extension`) | `base_path` is malformed (empty, > 1000 units, traversal shape, or not ending in `.base`) | Fix the `base_path` value. A non-`.base` path is a validation failure, distinct from "named Base not found". |
| `CLI_REPORTED_ERROR` | `BASE_NOT_FOUND`   | `named-missing`  | A named `.base` does not exist at `base_path` in the resolved vault | Check the path with `bases`; the named Base is not substituted by the open one. |
| `CLI_REPORTED_ERROR` | `BASE_NOT_FOUND`   | `not-open`       | Open-Base mode: the focused file is not a `.base`, or nothing is focused | Focus a `.base` in Obsidian, or pass `base_path`. |
| `CLI_REPORTED_ERROR` | `BASE_MALFORMED`   | —                | The named `.base` exists but Obsidian cannot use it | Repair the `.base` file. |
| `CLI_REPORTED_ERROR` | `VAULT_NOT_FOUND`  | `unknown`        | The `vault` display name is not registered with Obsidian | Check the name with `vaults`; restart the bridge if the vault was added after it started. |
| `CLI_REPORTED_ERROR` | —                  | —                | Other upstream CLI failure / app down / binary missing | Retry; confirm Obsidian is running. |
| `UPSTREAM_TIMEOUT`   | —                  | —                | Subprocess exceeded 10 s | Retry. |

`BASE_NOT_FOUND` carries a `details.reason` so "named Base not found" (`named-missing`) and "no Base open" (`not-open`) stay distinguishable under one code. No named-path failure is ever resolved by returning the views of whatever Base happened to be focused.

## Worked examples

### Example 1 — Open-Base mode (a `.base` is focused)

```json
{ "name": "views_base", "arguments": {} }
```

```json
{ "views": ["All", "Active", "Completed"], "count": 3 }
```

### Example 2 — Named Base (no human re-focus needed)

```json
{ "name": "views_base", "arguments": { "base_path": "Projects/Tasks.base" } }
```

Lists the views of `Projects/Tasks.base` even if a different note or Base is focused.

### Example 3 — Named Base, cross-vault

```json
{ "name": "views_base", "arguments": { "base_path": "Planning/Roadmap.base", "vault": "Work" } }
```

Reaches `Planning/Roadmap.base` in the `Work` vault whether it is focused, unfocused, or closed.

### Example 4 — Round-trip into `query_base`

```json
{ "name": "views_base", "arguments": { "base_path": "Projects/Tasks.base" } }
```

```json
{ "views": ["Active Tasks", "Done (archived)"], "count": 2 }
```

Each name is fed verbatim into `query_base` — no edits:

```json
{ "name": "query_base", "arguments": { "base_path": "Projects/Tasks.base", "view_name": "Done (archived)" } }
```

### Example 5 — Named Base not found vs no Base open

```json
{ "name": "views_base", "arguments": { "base_path": "Nope/Missing.base" } }
```

Returns `CLI_REPORTED_ERROR` with `details.code: "BASE_NOT_FOUND"`, `details.reason: "named-missing"`.

```json
{ "name": "views_base", "arguments": {} }
```

with a non-`.base` note focused returns `CLI_REPORTED_ERROR` with `details.code: "BASE_NOT_FOUND"`, `details.reason: "not-open"` — a distinct cause.

### Example 6 — Invalid locator

```json
{ "name": "views_base", "arguments": { "base_path": "Notes/Daily.md" } }
```

Returns `VALIDATION_ERROR` with `params.code: "INVALID_BASE_PATH"`, `params.reason: "wrong-extension"` — distinct from "named Base not found".
