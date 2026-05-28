# `create_base`

Create a new item (Markdown note) within an Obsidian Bases (`.base`) file. Member of the Bases-family cohort (siblings: `bases`, `query_base`, `views_base`).

## When to use this tool

| You want to | Reach for |
|---|---|
| Create a new item in a `.base` file | `create_base` |
| Discover all `.base` files in the vault | `bases` |
| Enumerate views inside a `.base` file | `views_base` |
| Query rows from a named view | `query_base` |

## Input

| Field     | Type   | Required | Notes |
|-----------|--------|----------|-------|
| `path`    | string | yes      | Vault-relative path to the `.base` file. Must end with `.base` (case-insensitive). Length cap 1000 UTF-16 code units. Path-traversal shapes rejected. |
| `name`    | string | yes      | Name for the new item (becomes the Markdown filename). Length cap 1000 UTF-16 code units. |
| `content` | string | no       | Body text for the new item. Max 3072 UTF-16 code units — over-limit fails fast with `CONTENT_TOO_LARGE` before invoking the CLI. |
| `view`    | string | no       | View name within the base. Not validated by the CLI — nonexistent view names are silently accepted. |
| `vault`   | string | no       | Vault display name. **Note**: silently ignored by the current CLI. Accepted for forward compatibility. |

## Output

```json
{
  "path": "220-Planning/Backlog (Base)/New feature request.md",
  "name": "New feature request.md"
}
```

- `path` — vault-relative path of the created item (wrapper-constructed from the base file's directory + the CLI-returned filename).
- `name` — actual filename of the created item. May differ from the requested name due to auto-increment on collision.

## Name collision auto-increment

When a note with the requested name already exists in the base's directory, the CLI auto-increments the filename by appending ` 1`, ` 2`, etc. The wrapper surfaces the **actual** created filename in the `name` field, which may differ from what was requested.

Example: requesting `name: "Task"` when `Task.md` already exists yields `name: "Task 1.md"`.

## Content parameter

The `content` parameter is accepted by the CLI but is not listed in the CLI's help text. It is subject to a size limit of 3072 UTF-16 code units (matching the `prepend` tool's cap), bounded by an upstream Obsidian CLI defect that hangs the host process around 4 KB on Windows.

## Vault routing limitation

The `vault` parameter is silently ignored by the underlying CLI for the `base:create` subcommand. This is an inherited CLI limitation, preserved for cohort parity with `query_base`.

## Error roster

| Top-level `code`     | `details.code`       | When | Recovery |
|----------------------|----------------------|------|----------|
| `VALIDATION_ERROR`   | `INVALID_BASE_PATH`  | Empty / over-cap / wrong-extension / path-traversal | Inspect `details.reason`; supply a valid vault-relative `.base` path. |
| `VALIDATION_ERROR`   | `INVALID_NAME`       | Empty / over-cap | Supply a non-empty name within the length cap. |
| `VALIDATION_ERROR`   | `CONTENT_TOO_LARGE`  | Content exceeds 3072 UTF-16 code units | Reduce content size; use `write_note` for larger content. |
| `CLI_REPORTED_ERROR` | `BASE_NOT_FOUND`     | Specified `.base` file does not exist | Verify the path; use `bases` to enumerate `.base` files in the vault. |
| `UPSTREAM_TIMEOUT`   | —                    | Subprocess exceeded 10 s | Retry. |

## Worked examples

### Example 1 — Happy path

```json
{
  "name": "create_base",
  "arguments": {
    "path": "220-Planning/Backlog (Base).base",
    "name": "New feature request",
    "content": "## Description\nAgent-discovered feature gap."
  }
}
```

Response:

```json
{
  "path": "220-Planning/Backlog (Base)/New feature request.md",
  "name": "New feature request.md"
}
```

### Example 2 — Name collision (auto-increment)

```json
{
  "name": "create_base",
  "arguments": {
    "path": "220-Planning/Backlog (Base).base",
    "name": "New feature request"
  }
}
```

When `New feature request.md` already exists:

```json
{
  "path": "220-Planning/Backlog (Base)/New feature request 1.md",
  "name": "New feature request 1.md"
}
```

### Example 3 — Base not found

```json
{
  "name": "create_base",
  "arguments": {
    "path": "nonexistent.base",
    "name": "Test"
  }
}
```

Returns `CLI_REPORTED_ERROR` with `details.code: "BASE_NOT_FOUND"`. Use `bases` to find valid `.base` file paths.

### Example 4 — Content too large

```json
{
  "name": "create_base",
  "arguments": {
    "path": "Tasks.base",
    "name": "Item",
    "content": "<3073+ characters>"
  }
}
```

Returns `VALIDATION_ERROR` with `details.code: "CONTENT_TOO_LARGE"` — rejected before CLI invocation.
