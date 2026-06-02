# `paths`

## Overview

Recursively enumerate every file and folder under a vault or a sub-folder beneath it as a typed envelope `{ count, paths: string[] }` (default mode) or `{ count, paths: [] }` (count-only mode).

The trailing character of each entry in `paths` is the in-band file-vs-folder signal: **folder entries end with `/`; file entries do not.** Agents distinguish files from folders without a sidecar type field.

## When to use this tool

| You want to | Reach for |
|---|---|
| Recursive list of every file + folder under a vault or sub-folder | `paths` |
| Single-level (non-recursive) immediate children only | [`files`](./files.md) |
| All notes carrying a tag | [`tag`](./tag.md) |
| Outgoing links from a single note | [`links`](./links.md) |
| Heading structure of a single note | [`outline`](./outline.md) |
| Vault-wide frontmatter property inventory | [`properties`](./properties.md) |
| Plain-text `files verbose` / `folders verbose` rendering | [`obsidian_exec`](./obsidian_exec.md) |

## Input contract

`paths` consumes the schema below. Every field is rejected at the boundary as `VALIDATION_ERROR` if the constraints fail. Unknown top-level keys are rejected (`additionalProperties: false`).

```json
{
  "target_mode": "specific",
  "vault": "<vault name>",
  "folder": "<vault-relative folder>",
  "depth": 3,
  "ext": "md",
  "total": false
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | string enum | YES | `"specific"` or `"active"`. |
| `vault` | string | REQUIRED in `specific`; FORBIDDEN in `active` | length ≥ 1. |
| `folder` | string | OPTIONAL | length ≥ 1; trailing `/` silently stripped; when omitted, traversal starts at the vault root. |
| `depth` | integer ≥ 1 | OPTIONAL | when omitted, traversal is unbounded. `depth: 1` returns only immediate children. |
| `ext` | string | OPTIONAL | length ≥ 1; leading-dot and bare forms equivalent (`.md` == `md`). When set, folder entries are excluded from `paths`. |
| `total` | boolean | OPTIONAL | defaults to `false`. When `true`, response is `{ count, paths: [] }`. |
| `file` | — | NEVER | folder-scoped tool — `file` is rejected in both modes. |
| `path` | — | NEVER | folder-scoped tool — `path` is rejected in both modes. |

### Per-field policy

- **`target_mode`** — `"specific"` routes to the named vault via the CLI's `vault=` argument; `"active"` resolves to the focused vault at execution time.
- **`vault`** — display name of the target vault. Required in specific mode; forbidden in active mode. See *Multi-vault basename ambiguity* in Inherited limitations.
- **`folder`** — vault-relative folder path. Trailing `/` silently stripped (`"Inbox"` and `"Inbox/"` equivalent). When omitted, traversal starts at the vault root. **The starting folder itself never appears in `paths`** — only its descendants.
- **`depth`** — depth cap relative to the starting folder. `depth: 1` returns only immediate children; `depth: 2` returns depths 1 and 2; unbounded when omitted. `depth > actual-height` is silently accepted (no error). Rejected at the schema layer: 0, negative, non-integer, non-numeric, string-encoded.
- **`ext`** — extension filter. Leading-dot form (`.md`) and bare form (`md`) are equivalent. When set, **folder entries are excluded from `paths`** — the response shape is files-only. When omitted, both files and folders appear (folders trailing-slashed).
- **`total`** — when `true`, the response is `{ count, paths: [] }`. The count reflects the filtered subtree size and is invariant across both modes for the same vault state (token-economical pre-flight read).

Out-of-scope surfaces (rejected at the schema layer or not exposed):

| Surface | Alternative |
|---|---|
| Pagination / `limit` / `offset` | Re-slice `paths` client-side, OR use `depth` to bound subtree size, OR use `total: true` for a pre-flight count. |
| Glob / regex filter on paths | Filter `paths` client-side, OR re-call with a narrower `folder`. |
| Multi-extension filter | Re-call per extension and merge client-side. |
| Sort by mtime / size | Not supported — byte-asc sort only. |

## Output shape

### Default mode (`total !== true`)

```json
{
  "count": 8,
  "paths": [
    "Archive/",
    "Archive/old.md",
    "Inbox/",
    "Inbox/Sub/",
    "Inbox/Sub/c.md",
    "Inbox/a.md",
    "Inbox/b.md",
    "README.md"
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `count` | integer ≥ 0 | Total number of entries in the filtered subtree. |
| `paths` | array of strings | Vault-relative paths sorted byte-asc. Folder entries end with `/`; file entries do not. `count === paths.length` always. |

### Count-only mode (`total: true`)

```json
{ "count": 8, "paths": [] }
```

The `paths` array is the literal empty array. The `count` is the filtered subtree size (after ext / depth / dotfile filters applied). **The count is invariant across both modes for the same vault state.**

### Zero-match three-way distinction

- Empty existing folder → `{ count: 0, paths: [] }` (default mode) or `{ count: 0, paths: [] }` (count-only mode). **Never an error.**
- Missing folder → structured `CLI_REPORTED_ERROR(details.code: "FOLDER_NOT_FOUND", folder: "<requested>")`. **Distinguishable from empty.**
- Folder path resolves to a file → structured `CLI_REPORTED_ERROR(details.code: "NOT_A_FOLDER", folder: "<requested>")`.

This is a deliberate **departure** from the [`files`](./files.md) tool, which conflates missing / not-a-folder / empty into a single `{count:0, paths:[]}` shape.

### Sort order

`paths` is sorted byte-ascending. The sort runs on the FINAL trailing-slash-rendered form — so `Inbox/` sorts before `Inbox/a.md` (since `/` ASCII 0x2F < `a` 0x61).

### Trailing-slash discrimination rule

- Folder entries: **end with `/`**. Examples: `Inbox/`, `Inbox/Sub/`, `Archive/`.
- File entries: **do NOT end with `/`**. Examples: `README.md`, `Inbox/a.md`, `Inbox/Sub/c.md`.
- Agents partition the response via `paths.filter(p => p.endsWith("/"))` for folders, `paths.filter(p => !p.endsWith("/"))` for files.

When `ext` is set, the trailing-slash rule is moot — `ext` filtering excludes folder entries entirely; every entry in `paths` is a file without a trailing slash.

### Folder-vs-file inclusion rule

- **Without `ext`**: both files and folders appear in `paths`. The trailing-slash rule discriminates.
- **With `ext`**: only matching files appear. Folder entries are excluded.

### Depth-bounding semantics

- `depth: N` returns entries at depths 1..N relative to the starting folder (vault root or `folder` value).
- `depth: 1` returns only immediate children.
- `depth > actual-height` is silently accepted — no error.
- The starting folder itself never appears in `paths`.

### Dotfile exclusion

Path segments starting with `.` are excluded from the walk. Both files (`Inbox/.hidden.md`) and folders (`.config/`, `.git/`) are dropped. Folder exclusion is recursive — dotfile folder children never enter the walk. The filter applies uniformly across files and folders.

## Worked examples

### Example 1 — Whole-vault recursive listing (specific mode)

```json
{
  "name": "paths",
  "arguments": { "target_mode": "specific", "vault": "Demo" }
}
```

Returns the full subtree of vault `Demo`: every file and folder, folders trailing-slashed, sorted byte-asc. Dotfiles excluded.

### Example 2 — Sub-folder + extension filter

```json
{
  "name": "paths",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "folder": "Inbox",
    "ext": "md"
  }
}
```

Returns every `.md` file beneath `Inbox/` (recursive). Folder entries excluded because `ext` is set. Starting folder `Inbox/` itself NOT returned.

### Example 3 — Depth-limited overview

```json
{
  "name": "paths",
  "arguments": { "target_mode": "specific", "vault": "Demo", "depth": 1 }
}
```

Returns only the immediate children of the vault root (depth 1). A quick top-level map.

### Example 4 — Count-only pre-flight

```json
{
  "name": "paths",
  "arguments": {
    "target_mode": "active",
    "folder": "Archive",
    "ext": "md",
    "total": true
  }
}
```

Returns `{ count: N, paths: [] }` — the count of `.md` files in the active vault beneath `Archive/`, recursive, no depth bound. Used as a pre-flight to decide whether to issue the full-paths call.

### Example 5 — Active mode

```json
{
  "name": "paths",
  "arguments": { "target_mode": "active" }
}
```

Returns the full subtree of the currently focused vault. `vault` is forbidden in active mode (would fail validation).

### Example 6 — Empty existing folder

```json
{
  "name": "paths",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "folder": "Empty"
  }
}
```

Returns `{ count: 0, paths: [] }` if `Empty/` exists but is empty. **Never an error** — distinguishable from missing-folder.

### Example 7 — Missing folder error

```json
{
  "name": "paths",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "folder": "DoesNotExist"
  }
}
```

Returns `CLI_REPORTED_ERROR` with `details.code: "FOLDER_NOT_FOUND"`, `details.folder: "DoesNotExist"`. Recover by either creating the folder or revising the input.

### Example 8 — Not-a-folder error

```json
{
  "name": "paths",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "folder": "README.md"
  }
}
```

Returns `CLI_REPORTED_ERROR` with `details.code: "NOT_A_FOLDER"`, `details.folder: "README.md"`. Recover by selecting a folder path instead of a file.

## Error roster

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed the schema (missing vault in specific / vault in active / file or path present / depth ≤ 0 / depth non-integer / total non-boolean / unknown top-level key / wrong type). | Retry with corrected input. `details.issues` carries per-issue `path` + `message` + zod code. |
| `CLI_REPORTED_ERROR` (`details.code: "VAULT_NOT_FOUND"`, `details.reason: "unknown"`) | Unknown vault display name. | Verify the vault name; ensure the vault is registered in Obsidian. |
| `CLI_REPORTED_ERROR` (`details.code: "VAULT_NOT_FOUND"`, `details.reason: "not-open"`, `stage: "handler-stage-0"`) | Closed-but-registered vault. The CLI transparently opens the vault as a side effect; retry after a brief delay. | Retry once the vault has opened. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "FOLDER_NOT_FOUND"`, `details.folder: "<as-requested>"`) | Starting folder does not exist. | Verify the folder path; check for typos or path-separator drift. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "NOT_A_FOLDER"`, `details.folder: "<as-requested>"`) | Folder path resolves to a file. | Select a folder path instead of a file. |
| `CLI_REPORTED_ERROR` (`details.stage: "json-parse"`) | Eval stdout is non-JSON after the `=> ` strip — upstream contract divergence. | Investigate as a regression. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-parse"`) | Eval JSON parses but doesn't match the envelope union — upstream contract divergence. | Investigate as a regression. |
| `ERR_NO_ACTIVE_FILE` | Active mode and no Obsidian instance reachable. | Open Obsidian on the target vault, OR use specific mode with `vault`. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN`. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (typical cause: output-cap kill on pathologically large subtrees). | Use `total: true` to bypass cap-risk, OR use `depth: 1` for a single-level listing, OR narrow `folder`. |
| `CLI_DISPATCH_TIMEOUT` | The CLI did not complete within the typed-tool 10-second cap. | Narrow `folder`, OR investigate vault size. |
| `CLI_DISPATCH_CAP_KILL` | Output exceeded the 10 MiB cap. | Use `total: true`, OR narrow `folder` / `depth`. |
| `CLI_DISPATCH_KILL` | Dispatch killed externally (signal / shutdown). | Retry. |

## Inherited limitations

### Multi-vault basename ambiguity

Multi-vault setups can still suffer from basename ambiguity: two vaults sharing the **same display name** are indistinguishable by the `vault=` argument, so a call may resolve to the wrong same-named vault. This is a genuine name-collision limit, and **focusing a vault neither fixes it nor is required for routing** — a specific-mode `vault=` read routes into the named vault even when that vault is open but unfocused (verified live per-tool by the BI-0134 forcing gate — [t0-probe-findings.md](../../specs/062-verify-cross-vault-routing/contracts/t0-probe-findings.md)). To disambiguate, give the colliding vaults distinct display names.

### Platform-dependent case-sensitivity

The `ext` matcher applies ASCII lower-fold, but underlying file lookups inherit the platform's filesystem case-sensitivity (macOS HFS+ / APFS: case-insensitive by default; Windows NTFS: case-insensitive; Linux ext4: case-sensitive). For multi-platform vaults synced via filesystem replication, case-only path drift may produce different results on different hosts. Treat the output as authoritative for the host it runs on.

### Symlinks pass-through

Whatever the underlying Obsidian vault adapter does with symlinks, the tool inherits. Obsidian generally does not follow symlinks; symlinked folders are typically NOT walked. Treat symlink behaviour as platform + Obsidian-version dependent.

### Permission-denied entries pass-through

If a sub-folder is rejected due to filesystem permissions, the walk silently drops the branch. Permission errors are NOT surfaced as structured `CLI_REPORTED_ERROR` — the entry simply doesn't appear in `paths`.

### Output cap

A 10 MiB stdout cap applies per invocation. For a pathologically large subtree (~5000+ files, long path strings), this could fire and surface as `CLI_NON_ZERO_EXIT`. Use `total: true` to bypass the cap-risk entirely, OR narrow with `folder` / `depth`.

### No pagination

`paths` returns the full filtered subtree in one response. Callers needing pagination re-slice `paths` client-side.

## Latency

Approximately 50–500 ms typical against a 1 000-file vault; up to ~2 s against a 10 000-file vault depending on depth. The closed-vault recovery path may add one retry round-trip.
