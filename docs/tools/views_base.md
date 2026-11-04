# `views_base`

List the views defined inside an Obsidian Bases (`.base`) file. Member of the Bases-family cohort (siblings: `bases`, `query_base`, `create_base`).

**Supported file types:** bases only (`base_path`). A `base_path` that does not end in `.base` is rejected as before, with `VALIDATION_ERROR` whose issue message starts `INVALID_BASE_PATH/wrong-extension:`.

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
| absent | absent | **Open-Base mode.** List the views of the `.base` focused in the vault in front. |
| absent | present | **Open-Base mode, named vault.** List the views of the `.base` open in the named vault, whether that vault is in front, open behind another vault, or closed. |
| present | absent | **Named-Base mode.** List the views of the named `.base` in the focused vault, regardless of what is focused. |
| present | present | **Named-Base, cross-vault.** List the views of the named `.base` in the named vault — reached whether that vault is focused, open-but-unfocused, or closed. |

A named Base **always wins** over whatever is focused; the open Base is never silently substituted for a named target. Naming a Base focuses it as a side effect (which file is active changes) — the tool is otherwise read-only and never creates, modifies, or deletes vault content.

## Input

| Field       | Type   | Required | Notes |
|-------------|--------|----------|-------|
| `base_path` | string | no       | Vault-relative path to the `.base` file (the identifier `bases` emits and `query_base`/`create_base` accept). Omit to read the focused Base. Validated like `query_base.base_path` (must be a structurally safe path ending in `.base`, ≤ 1000 UTF-16 units). |
| `vault`     | string | no       | Vault display name (min length 1). Routes to that vault in both modes: with `base_path`, the named Base in that vault; without it, the Base open in that vault. Omit for the vault in front. An unregistered name fails with `VAULT_NOT_FOUND` before the CLI runs. |

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
| `VALIDATION_ERROR`   | —                  | — (the `details.issues[0].message` prefix is `INVALID_BASE_PATH/empty`, `/too-long`, `/path-traversal` or `/wrong-extension`) | `base_path` is malformed (empty, > 1000 units, traversal shape, or not ending in `.base`) | Fix the `base_path` value. A non-`.base` path is a validation failure, distinct from "named Base not found". |
| `CLI_REPORTED_ERROR` | `BASE_NOT_FOUND`   | `named-missing`  | A named `.base` does not exist at `base_path` in the resolved vault | Check the path with `bases`; the named Base is not substituted by the open one. |
| `CLI_REPORTED_ERROR` | `BASE_NOT_FOUND`   | `not-open`       | Open-Base mode: the focused file is not a `.base`. With `vault` named, `details.vault` names the vault and the message names it too | Focus a `.base` in Obsidian, or pass `base_path`. |
| `CLI_REPORTED_ERROR` | `BASE_MALFORMED`   | `invalid-yaml`   | Named or open mode: Obsidian cannot parse the `.base` file's YAML | Repair the YAML in the `.base` file (the bounded parser report is in `details.message`). |
| `CLI_REPORTED_ERROR` | `BASE_MALFORMED`   | `unknown`        | Named mode: the `.base` exists but Obsidian reports it is not usable as a Base, with no parser complaint | Open the file in Obsidian and investigate. |
| `CLI_REPORTED_ERROR` | `VAULT_NOT_FOUND`  | `unknown`        | The `vault` display name is not registered with Obsidian | Check the name with `vaults`. A vault added after the server started is found without a restart. |
| `CLI_REPORTED_ERROR` | —                  | —                | Named mode, `details.stage: "focus"`: the named `.base` did not become Obsidian's active file within about a second. `details` is `{ stage, base_path, active }`, where `active` is the file still in front (or `null`); no views are listed and no parser report is attached | Retry. |
| `CLI_REPORTED_ERROR` | —                  | —                | Other upstream CLI failure / app down / binary missing | Retry; confirm Obsidian is running. |
| `UPSTREAM_TIMEOUT`   | —                  | —                | Subprocess exceeded 10 s | Retry. |

In open-Base mode, a vault with no file open at all (the vault in front, or the named vault) fails with top-level `ERR_NO_ACTIVE_FILE`, not `BASE_NOT_FOUND`; naming a vault does not change that answer.

`BASE_NOT_FOUND` carries a `details.reason` so "named Base not found" (`named-missing`) and "no Base open" (`not-open`) stay distinguishable under one code. No named-path failure is ever resolved by returning the views of whatever Base happened to be focused.

`BASE_MALFORMED`'s `details.reason` set is closed (`invalid-yaml` | `unknown`, a subset of `query_base`'s), and `details.message` / `details.messageLength` carry the upstream report, bounded to its first and last 500 characters when it is longer than 1,000. In named mode the report always describes the named Base, whatever was open before the call: the views are listed only once the named Base is the active file.

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

### Example 4 — Open Base in a named vault

```json
{ "name": "views_base", "arguments": { "vault": "Work" } }
```

Lists the views of the Base open in the `Work` vault, even when another vault is in front:

```json
{ "views": ["All", "By Status"], "count": 2 }
```

When the file open in `Work` is not a `.base`, the call fails with `CLI_REPORTED_ERROR`, `details: { "code": "BASE_NOT_FOUND", "reason": "not-open", "vault": "Work" }` and the message `views_base: active file in vault "Work" is not a base file`. A closed vault is opened automatically (the first call takes longer); if it cannot be brought up, the call fails with `CLI_REPORTED_ERROR` whose `details.stdout` starts `Error: Command "base:views" not found.`.

### Example 5 — Round-trip into `query_base`

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

### Example 6 — Named Base not found vs no Base open

```json
{ "name": "views_base", "arguments": { "base_path": "Nope/Missing.base" } }
```

Returns `CLI_REPORTED_ERROR` with `details.code: "BASE_NOT_FOUND"`, `details.reason: "named-missing"`.

```json
{ "name": "views_base", "arguments": {} }
```

with a non-`.base` note focused returns `CLI_REPORTED_ERROR` with `details.code: "BASE_NOT_FOUND"`, `details.reason: "not-open"` — a distinct cause.

### Example 7 — Invalid locator

```json
{ "name": "views_base", "arguments": { "base_path": "Notes/Daily.md" } }
```

Returns `VALIDATION_ERROR` — distinct from "named Base not found":

```json
{
  "code": "VALIDATION_ERROR",
  "message": "views_base input failed schema validation",
  "details": {
    "issues": [
      { "path": ["base_path"], "message": "INVALID_BASE_PATH/wrong-extension: base_path must end with .base", "code": "custom" }
    ]
  }
}
```

The sub-reason is the prefix of the issue's `message` (`INVALID_BASE_PATH/wrong-extension:`); the error carries no `details.code` or `details.reason`.

### Example 8 — Malformed Base (YAML Obsidian cannot parse)

```json
{ "name": "views_base", "arguments": { "base_path": "Projects/Broken.base" } }
```

```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "{\"code\":\"CLI_REPORTED_ERROR\",\"message\":\"views_base: base file at \\\"Projects/Broken.base\\\" is malformed: its YAML cannot be parsed\",\"details\":{\"code\":\"BASE_MALFORMED\",\"reason\":\"invalid-yaml\",\"base_path\":\"Projects/Broken.base\",\"message\":\"Error: Flow sequence in block collection must be sufficiently indented and end with a ] at line 4, column 1:\\n\\n    name: [a, b\\n\\n^\",\"messageLength\":128}}"
  }]
}
```

The headline names the Base and carries no parser text; the parser report is in `details.message`. In open-Base mode the same file fails with the same `details.code` and `details.reason`, no `base_path`, and the headline `views_base: the open base file is malformed: its YAML cannot be parsed`.
