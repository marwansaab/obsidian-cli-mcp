# `create_base`

Create a new item (Markdown note) within an Obsidian Bases (`.base`) file. Member of the Bases-family cohort (siblings: `bases`, `query_base`, `views_base`).

**Supported file types:** bases only (`base_path`). A `base_path` that does not end in `.base` is rejected as before, with `VALIDATION_ERROR` + `INVALID_BASE_PATH` (`wrong-extension`). The created item is a note.

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
| `base_path` | string | yes (or the deprecated `path`) | Vault-relative path to the `.base` file. Must end with `.base` (case-insensitive). Length cap 1000 UTF-16 code units. Path-traversal shapes rejected. Not in the published `required` list during the transition, so that calls using `path` validate; a call with neither fails with `base_path is required`. |
| `name`    | string | yes      | Name for the new item (becomes the Markdown filename). Length cap 1000 UTF-16 code units. |
| `content` | string | no       | Body text for the new item. Max 3072 UTF-16 code units — over-limit fails fast with `CONTENT_TOO_LARGE` before invoking the CLI. |
| `view_name` | string | no     | Exact, case-sensitive name of the view to create the item in (as listed by `views_base`). Not validated by the CLI — nonexistent view names are silently accepted. |
| `vault`   | string | no       | Vault display name (min length 1). Creates the item in that vault's Base. Omit for the vault in front. See *Vault routing and containment*. |

Required `base_path` (string, 1..1000 chars): vault-relative path to the `.base` file; must end with `.base` (case-insensitive). Optional `view_name` (string): view name within the base; not validated by the CLI (nonexistent views silently accepted). Optional `vault` (string): creates the item in that vault's Base; omit for the vault in front.

### Deprecated names

Deprecated names (accepted until the next major release; a successful call that uses one gets `deprecated_parameters` in its result; error responses do not carry it): `path` → `base_path`, `view` → `view_name`.

Spec 073 aligned this tool's parameter names with `query_base` and `views_base`. The old names are accepted until the next major release:

| Old name | New name |
|---|---|
| `path` | `base_path` |
| `view` | `view_name` |

- A successful call that uses an old name gets the same result as the new name, plus a `deprecated_parameters` field (see *Output*). Error responses do not carry `deprecated_parameters`.
- A call that sends an old name together with its new name (even with the same value) fails with `VALIDATION_ERROR`, before the CLI is invoked. The issue sits at the old name's path and names both.
- Validation reports the new name whichever key was used: an `INVALID_BASE_PATH` error carries `details.field: "base_path"`, and its issue in `details.issues` carries `path: ["base_path"]`. Likewise an empty `view` is reported as `view_name`: `view: ""` gets the same issue as `view_name: ""`, at `path: ["view_name"]`. If the call has another mistake too, the `view` call also reports it, while the `view_name` call stops at the `view_name` issue; every issue names the current key.
- The old keys stay in the published input schema, marked `deprecated: true`.

## Output

```json
{
  "path": "220-Planning/Backlog/New feature request.md",
  "name": "New feature request.md"
}
```

`path` is the vault-relative path of the note Obsidian created (not the `.base` file), and `name` is that note's file name.

- `path` — vault-relative path of the note Obsidian created, as the CLI reports it. Obsidian places the item in the Base's `file.inFolder("<folder>")` folder when its top-level `filters` has one, otherwise in the vault's new-note location, joined with any folder part of `name`. The path does not depend on where the `.base` file sits. This is the created note, not the `.base` file, which the input names `base_path`; read or edit the item with this `path`.
- `name` — file name of the created item (the last segment of `path`, with `.md`). May differ from the requested name due to auto-increment on collision.
- `deprecated_parameters` — present only when the call used a deprecated name, e.g. `[{ "parameter": "path", "replacement": "base_path" }]`. Absent otherwise.

## Name collision auto-increment

When a note with the requested name already exists in the folder the item lands in, the CLI auto-increments the filename by appending ` 1`, ` 2`, etc. The wrapper surfaces the **actual** created filename in the `name` field, which may differ from what was requested.

Example: requesting `name: "Task"` when `Task.md` already exists yields `name: "Task 1.md"`.

## Content parameter

The `content` parameter is accepted by the CLI but is not listed in the CLI's help text. It is subject to a size limit of 3072 UTF-16 code units (matching the `prepend` tool's cap), bounded by an upstream Obsidian CLI defect that hangs the host process around 4 KB on Windows.

## Vault routing and containment

- **`vault` omitted**: the item is created in the vault in front, exactly as before. No containment check runs on this path.
- **`vault` named**: the item is created in that vault's Base, whether the vault is in front, open behind another vault, or closed. The vault in front stays in front. Before anything is created, the tool checks that two paths resolve inside the named vault (following links):
  1. `base_path`;
  2. the folder the item will land in. Obsidian chooses it; the tool mirrors the choice as the Base's folder when its top-level `filters` is a single `file.inFolder("<folder>")` expression, or a block-style `and:` list with exactly one such entry, and otherwise the vault's new-note folder. Any folder part of `name` (for example `sub/Item`) is added to it. A filter written in flow style (`filters: {and: [...]}`) or inside an `or`/`not` group is not read, so the new-note folder is checked instead; the check after creation still applies.

  If either escapes, the call fails with `PATH_ESCAPES_VAULT` and nothing is created. After creation, the path the CLI reports is checked again. If it resolves outside the vault, the call fails with `PATH_ESCAPES_VAULT` whose `details.createdPath` names the item: the item was written and is **not** deleted, so you can inspect or remove it.
- **Closed vault**: a registered vault that is not open is opened automatically and the call returns its normal result (the first call takes longer). If it cannot be brought up, the call fails with `CLI_REPORTED_ERROR` whose `details.stdout` starts `Error: Command "base:create" not found.`: open the vault in Obsidian, then call again. This is a failure, never an empty result.
- **Unregistered name**: the call fails with `VAULT_NOT_FOUND` before the CLI runs; nothing is created in any vault.

## Errors — Error roster

| Top-level `code`     | `details.code`       | When | Recovery |
|----------------------|----------------------|------|----------|
| `VALIDATION_ERROR`   | `INVALID_BASE_PATH`  | Empty / over-cap / wrong-extension / path-traversal. `details.reason` is `empty` / `too-long` / `wrong-extension` / `path-traversal`; `details.field` is `base_path` | Inspect `details.reason`; supply a valid vault-relative `.base` path. |
| `VALIDATION_ERROR`   | `INVALID_NAME`       | Empty / over-cap. `details.reason` is `empty` / `too-long`; `details.field` is `name` | Supply a non-empty name within the length cap. |
| `VALIDATION_ERROR`   | `CONTENT_TOO_LARGE`  | Content exceeds 3072 UTF-16 code units. No `details.reason`; `details.field` is `content` | Reduce content size; use `write_note` for larger content. |

These three validation errors carry `details.code`, `details.reason` (when the rejection has one) and `details.field`. Their `message` is the rejection's own, for example `INVALID_NAME/empty: name is empty` or `INVALID_BASE_PATH/wrong-extension: base_path must end with .base`. `details.issues` keeps the full per-issue list (`path`, `message`, `code`). When several inputs are wrong, the first rejection in the order `base_path`, `name`, `content` sets `details.code`. Any other validation failure (a missing `name`, an unknown key, an old name sent with its new name) returns `message: "create_base input failed schema validation"` with `details.issues` only.
| `CLI_REPORTED_ERROR` | `BASE_NOT_FOUND`     | Specified `.base` file does not exist (`details.path` carries the `base_path` value; with `vault` named, `details.vault` names the vault and the message names it too) | Verify the `base_path`; use `bases` to enumerate `.base` files in the vault. |
| `CLI_REPORTED_ERROR` | `VAULT_NOT_FOUND` (`details.reason: "unknown"`) | The `vault` display name is not registered with Obsidian | Check the name with `vaults`. A vault added after the server started is found without a restart. |
| `CLI_REPORTED_ERROR` | `VAULT_NOT_FOUND` (`details.reason: "folder-missing"`) | `vault` named only: the vault is registered, but its folder is missing on disk (`details.vault`; no disk path in the message). Raised before the CLI runs; nothing is created | Ask the user to restore the folder, or re-open the vault in Obsidian, then call again. |
| `CLI_REPORTED_ERROR` | —                    | `vault` named only: the vault's folder could not be checked for another reason (`details.stage: "vault-root-check"`, `details.errno`, `details.vault`); nothing is created | Inspect `details.errno` (for example a permission problem); fix it, then call again. |
| `PATH_ESCAPES_VAULT` | —                    | `vault` named only: `base_path`, the item's folder, or the created path resolves outside the vault (`details.vault`, `details.attemptedPath`, `details.resolvedPath`; plus `details.createdPath` when caught after creation). Before creation the message is the generic `CLI bridge upstream error: PATH_ESCAPES_VAULT`; after creation it is `create_base: the item was created at "<path>", which resolves outside vault "<vault>"; it was not deleted`. | Before creation nothing was written; after creation, inspect the item at `details.createdPath`. |
| `UPSTREAM_TIMEOUT`   | —                    | Subprocess exceeded 10 s | Retry. |

`PATH_ESCAPES_VAULT` (only when `vault` is named) means `base_path`, the item's folder or the created path resolves outside that vault; when the post-creation check catches it, `details.createdPath` names the item, which was written and is kept.

## Examples — Worked examples

### Example 1 — Happy path

```json
{
  "name": "create_base",
  "arguments": {
    "base_path": "220-Planning/Backlog (Base).base",
    "name": "New feature request",
    "content": "## Description\nAgent-discovered feature gap."
  }
}
```

Response, when the Base's top-level `filters` is `file.inFolder("220-Planning/Backlog")`:

```json
{
  "path": "220-Planning/Backlog/New feature request.md",
  "name": "New feature request.md"
}
```

### Example 2 — Name collision (auto-increment)

```json
{
  "name": "create_base",
  "arguments": {
    "base_path": "220-Planning/Backlog (Base).base",
    "name": "New feature request"
  }
}
```

When `New feature request.md` already exists:

```json
{
  "path": "220-Planning/Backlog/New feature request 1.md",
  "name": "New feature request 1.md"
}
```

### Example 3 — Base not found

```json
{
  "name": "create_base",
  "arguments": {
    "base_path": "nonexistent.base",
    "name": "Test"
  }
}
```

Returns `CLI_REPORTED_ERROR` with `details.code: "BASE_NOT_FOUND"`. Use `bases` to find valid `.base` file paths.

### Example 4 — A named vault

```json
{
  "name": "create_base",
  "arguments": {
    "vault": "Work",
    "base_path": "Projects/Tasks.base",
    "name": "Write release notes"
  }
}
```

Creates the item in the `Work` vault, even when another vault is in front. When `Projects/Tasks.base` filters on `file.inFolder("Projects/Tasks")`, the item lands in `Projects/Tasks`; both that folder and `Projects/Tasks.base` are checked to stay inside `Work` before the item is created. A `base_path` that does not exist in `Work` fails with `details: { "code": "BASE_NOT_FOUND", "path": "Projects/Tasks.base", "vault": "Work" }`.

### Example 5 — Content too large

```json
{
  "name": "create_base",
  "arguments": {
    "base_path": "Tasks.base",
    "name": "Item",
    "content": "<3073+ characters>"
  }
}
```

Rejected before CLI invocation:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "CONTENT_TOO_LARGE: content exceeds 3072 UTF-16 code units",
  "details": {
    "code": "CONTENT_TOO_LARGE",
    "field": "content",
    "issues": [
      { "path": ["content"], "message": "CONTENT_TOO_LARGE: content exceeds 3072 UTF-16 code units", "code": "custom" }
    ]
  }
}
```
