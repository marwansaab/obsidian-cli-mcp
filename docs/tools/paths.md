# `paths`

## Overview

Recursively enumerate every file and folder under a vault or a
sub-folder beneath it as a typed envelope `{ count, paths: string[] }`
(default mode) or `{ count, paths: [] }` (count-only mode). Wraps the
Obsidian Integrated CLI's `eval` subcommand (not native `files` or
`folders` — see [Why `eval` not native `files`/`folders`?](#why-eval-not-native-filesfolders)
for why) and walks `app.vault.adapter` directly via `stat()` (existence
trichotomy) and `list()` (immediate-children enumeration) with an
in-template recursive descent + level counter for depth bounding.
Fifteenth typed-tool wrap and the project's **first recursive
subtree-enumeration primitive**. Seventh member of the eval-driven
typed-tool cohort and fourth consumer of the cross-cutting
`_eval-vault-closed-detection` shared module.

The trailing character of each entry in `paths` is the in-band
file-vs-folder signal: **folder entries end with `/`; file entries do
not.** This rule is FR-028 (locked at the 2026-05-15 clarifications
session) — agents distinguish files from folders without a sidecar
type field.

Sibling tools: [files](./files.md) is the non-recursive single-level
counterpart (immediate children only); [tag](./tag.md) is a tag-index
walk; [links](./links.md) is the link-graph walk for a single note.

## Input contract

`tree` consumes the schema below. Every field is rejected at the
boundary as `VALIDATION_ERROR` if the constraints fail. Unknown
top-level keys are rejected (`additionalProperties: false`).

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

- **`target_mode`** — standard ADR-003 discriminator. `"specific"`
  routes to the named vault via the CLI's `vault=` argument;
  `"active"` resolves to the focused vault at execution time.
- **`vault`** — display name of the target vault. Required in
  specific mode; forbidden in active mode. **Inherited limitation**:
  multi-vault basename ambiguity — see
  [Inherited limitations](#multi-vault-basename-ambiguity).
- **`folder`** — vault-relative folder path. Trailing `/` silently
  stripped (`"Inbox"` and `"Inbox/"` equivalent). When omitted,
  traversal starts at the vault root. **The starting folder itself
  never appears in `paths`** — only its descendants.
- **`depth`** — depth cap relative to the starting folder. `depth: 1`
  returns only immediate children; `depth: 2` returns depths 1 and 2;
  unbounded when omitted. `depth > actual-height` is silently
  accepted (no error). Rejected at the schema layer: 0, negative,
  non-integer, non-numeric, string-encoded.
- **`ext`** — extension filter. Leading-dot form (`.md`) and bare
  form (`md`) are equivalent. When set, **folder entries are
  excluded from `paths`** — the response shape is files-only. When
  omitted, both files and folders appear (folders trailing-slashed).
- **`total`** — when `true`, the response is `{ count, paths: [] }`.
  The count reflects the filtered subtree size and is invariant
  across both modes for the same vault state (token-economical
  pre-flight read).

Out-of-scope upstream surfaces (rejected at the schema layer or
documented as out-of-scope):

| Upstream surface | Why not exposed | Alternative |
|---|---|---|
| `obsidian files` native subcommand | Returns recursive flat FILE list only; no folder entries; no depth bound; no missing-folder distinguishability (F1 / F2 / F3 live probe). | Wrapper routes via `eval` for the combined file+folder envelope with trailing-slash discrimination AND in-band depth bound AND structured missing-folder error. |
| `obsidian folders` native subcommand | Returns recursive flat FOLDER list only; combining with `files` requires two spawns — violates R3 single-call architecture. | Same: wrapper composes via `eval`. |
| `app.vault.getAllLoadedFiles` | Returns minified class instances; opaque type discrimination. | `app.vault.adapter.{list,stat}` gives clean `{files, folders}` separation + type trichotomy. |
| Pagination / limit / offset | Out-of-scope at v1. | Re-slice `paths` client-side, OR use `depth` to bound subtree size, OR use `total: true` for a pre-flight count. |
| Glob / regex filter on paths | Out-of-scope at v1. | Filter `paths` client-side, OR re-call with a narrower `folder`. |
| Multi-extension filter | Out-of-scope at v1. | Re-call per extension and merge client-side. |
| Sort by mtime / size | Out-of-scope at v1. | Byte-asc sort only. |

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
| `paths` | array of strings | Vault-relative paths sorted byte-asc. Folder entries end with `/`; file entries do not (FR-028). `count === paths.length` always. |

### Count-only mode (`total: true`)

```json
{ "count": 8, "paths": [] }
```

The `paths` array is the literal empty array. The `count` is the
filtered subtree size (after ext / depth / dotfile filters applied).
**The count is invariant across both modes for the same vault state.**

### Zero-match

- Empty existing folder → `{ count: 0, paths: [] }` (default mode) or
  `{ count: 0, paths: [] }` (count-only mode). **Never an error.**
- Missing folder → structured `CLI_REPORTED_ERROR(details.code:
  "FOLDER_NOT_FOUND", folder: "<requested>")`. **Distinguishable
  from empty.**
- Folder path resolves to a file → structured `CLI_REPORTED_ERROR
  (details.code: "NOT_A_FOLDER", folder: "<requested>")`.

This three-way distinction is a deliberate **departure** from BI-019's
`files` tool, which conflates missing/not-a-folder/empty into a
single `{count:0, paths:[]}` shape (FR-011 / SC-005).

### Sort order

`paths` is sorted byte-ascending wrapper-side inside the eval JS
template (`out.sort()`). The sort runs on the FINAL trailing-slash-
rendered form — so `Inbox/` sorts before `Inbox/a.md` (since `/` ASCII
0x2F < `a` 0x61).

### Trailing-slash discrimination rule (FR-028)

- Folder entries: **end with `/`**. Examples: `Inbox/`, `Inbox/Sub/`,
  `Archive/`.
- File entries: **do NOT end with `/`**. Examples: `README.md`,
  `Inbox/a.md`, `Inbox/Sub/c.md`.
- Agents partition the response via `paths.filter(p => p.endsWith("/"))`
  for folders, `paths.filter(p => !p.endsWith("/"))` for files.

When `ext` is set, the trailing-slash rule is moot — `ext` filtering
excludes folder entries entirely; every entry in `paths` is a file
without a trailing slash.

### Folder-vs-file inclusion rule (FR-007)

- **Without `ext`**: both files and folders appear in `paths`. The
  trailing-slash rule discriminates.
- **With `ext`**: only matching files appear. Folder entries are
  excluded.

### Depth-bounding semantics (FR-006 / FR-012)

- `depth: N` returns entries at depths 1..N relative to the starting
  folder (vault root or `folder` value).
- `depth: 1` returns only immediate children.
- `depth > actual-height` is silently accepted — no error.
- The starting folder itself never appears in `paths`.

### Dotfile exclusion (FR-027)

Path segments starting with `.` are excluded from the walk. Both
files (`Inbox/.hidden.md`) and folders (`.config/`, `.git/`) are
dropped. Folder exclusion is recursive — dotfile folder children
never enter the walk. The filter applies uniformly across files and
folders.

## Worked examples

### Example 1 — Whole-vault recursive listing (specific mode)

```json
{
  "name": "paths",
  "arguments": { "target_mode": "specific", "vault": "Demo" }
}
```

Returns the full subtree of vault `Demo`: every file and folder,
folders trailing-slashed, sorted byte-asc. Dotfiles excluded.

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

Returns every `.md` file beneath `Inbox/` (recursive). Folder entries
excluded because `ext` is set. Starting folder `Inbox/` itself NOT
returned.

### Example 3 — Depth-limited overview

```json
{
  "name": "paths",
  "arguments": { "target_mode": "specific", "vault": "Demo", "depth": 1 }
}
```

Returns only the immediate children of the vault root (depth 1). A
quick top-level map.

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

Returns `{ count: N, paths: [] }` — the count of `.md` files in the
active vault beneath `Archive/`, recursive, no depth bound. Used as
a pre-flight to decide whether to issue the full-paths call.

### Example 5 — Active mode

```json
{
  "name": "paths",
  "arguments": { "target_mode": "active" }
}
```

Returns the full subtree of the currently focused vault. `vault` is
forbidden in active mode (would fail validation).

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

Returns `{ count: 0, paths: [] }` if `Empty/` exists but is empty.
**Never an error** — distinguishable from missing-folder.

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

Returns `CLI_REPORTED_ERROR` with `details.code: "FOLDER_NOT_FOUND"`,
`details.folder: "DoesNotExist"`. Agent recovers by either creating
the folder or revising the input.

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

Returns `CLI_REPORTED_ERROR` with `details.code: "NOT_A_FOLDER"`,
`details.folder: "README.md"`. Agent recovers by selecting a folder
path instead of a file.

## Error roster

All failure surfaces flow through `UpstreamError` per Constitution
Principle IV. `tree` introduces **zero new top-level error codes**
and **two new `details.code` values** (`FOLDER_NOT_FOUND`,
`NOT_A_FOLDER`) under the existing `CLI_REPORTED_ERROR` top-level
code per ADR-015 sub-discriminator pattern (preserves the twelve-tool
zero-new-top-level-codes streak).

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed the schema (missing vault in specific / vault in active / file or path present / depth ≤ 0 / depth non-integer / total non-boolean / unknown top-level key / wrong type). | Agent retries with corrected input. `details.issues` carries per-issue `path` + `message` + zod code. |
| `CLI_REPORTED_ERROR` (details.code:"VAULT_NOT_FOUND", details.reason:"unknown") | Unknown vault — the cli-adapter's 011-R5 inspection clause fires on `Vault not found.` stdout. | Verify the vault name; ensure the vault is registered in Obsidian. |
| `CLI_REPORTED_ERROR` (details.code:"VAULT_NOT_FOUND", details.reason:"not-open", stage:"handler-stage-0") | Closed-but-registered vault — the shared `_eval-vault-closed-detection` module fires on the empty-stdout + exit-0 signature. The CLI transparently opens the vault as a side effect; retry after a brief delay. | Retry once the vault has opened. |
| `CLI_REPORTED_ERROR` (details.stage:"envelope-error", details.code:"FOLDER_NOT_FOUND", details.folder:"<as-requested>") | Starting folder does not exist (in-eval `stat()` returned null). | Verify the folder path; check for typos or path-separator drift. |
| `CLI_REPORTED_ERROR` (details.stage:"envelope-error", details.code:"NOT_A_FOLDER", details.folder:"<as-requested>") | Folder path resolves to a file (in-eval `stat().type === "file"`). | Select a folder path instead of a file. |
| `CLI_REPORTED_ERROR` (details.stage:"json-parse") | Eval stdout is non-JSON after the `=> ` strip — upstream contract divergence. | Investigate as a regression. |
| `CLI_REPORTED_ERROR` (details.stage:"envelope-parse") | Eval JSON parses but doesn't match the envelope union — upstream contract divergence. | Investigate as a regression. |
| `ERR_NO_ACTIVE_FILE` | Active mode and no Obsidian instance reachable — the dispatch-layer classifier fires on `Error: no active file` stdout. | Open Obsidian on the target vault, OR use specific mode with `vault`. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN`. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (typical cause: output-cap kill on pathologically large subtrees). | Use `total: true` to bypass cap-risk, OR use `depth: 1` for a single-level listing, OR narrow `folder`. |
| `CLI_DISPATCH_TIMEOUT` | The CLI did not complete within the typed-tool 10-second cap. | Narrow `folder`, OR investigate vault size. |
| `CLI_DISPATCH_CAP_KILL` | Output exceeded the 10 MiB cap. | Use `total: true`, OR narrow `folder` / `depth`. |
| `CLI_DISPATCH_KILL` | Dispatch killed externally (signal / shutdown). | Retry. |

The canonical errors contract is at
[specs/001-add-cli-bridge/contracts/errors.contract.md](../../specs/001-add-cli-bridge/contracts/errors.contract.md);
`tree` propagates the adapter's classification verbatim with no
rewrites.

## Inherited limitations

### Multi-vault basename ambiguity

The CLI's `vault=` parameter routes correctly for `eval` (verified
live), but multi-vault setups still suffer from basename ambiguity —
two vaults sharing the same display name are indistinguishable by the
`vault=` argument. **Recommendation**: open the target vault in
Obsidian before invoking `tree`. Parity with the other eval-cohort
members.

### Platform-dependent case-sensitivity

The wrapper's `ext` matcher applies ASCII lower-fold inside the eval
JS template, but the underlying `app.vault.adapter` file lookups
inherit the platform's filesystem case-sensitivity (macOS HFS+ /
APFS: case-insensitive by default; Windows NTFS: case-insensitive;
Linux ext4: case-sensitive). For multi-platform vaults synced via
filesystem replication, case-only path drift may produce different
results on different hosts. Treat the wrapper's output as
authoritative for the host it runs on.

### Symlinks pass-through

Whatever `app.vault.adapter.list()` does with symlinks, the wrapper
accepts. Obsidian generally does not follow symlinks; symlinked
folders are typically NOT walked. Treat symlink behaviour as platform
+ Obsidian-version dependent.

### Permission-denied entries pass-through

If `app.vault.adapter.list()` rejects a sub-folder due to filesystem
permissions, the in-eval walk silently drops the branch. The wrapper
does NOT surface permission errors as structured CLI_REPORTED_ERROR —
the entry simply doesn't appear in `paths`.

### Output cap inherited from cli-adapter

The cli-adapter applies a 10 MiB stdout cap per invocation. For a
pathologically large subtree (~5000+ files, long path strings), this
could fire and surface as `CLI_NON_ZERO_EXIT`. Use `total: true` to
bypass the cap-risk entirely, OR narrow with `folder` / `depth`.

### No pagination at v1

`tree` returns the full filtered subtree in one response. Callers
needing pagination re-slice `paths` client-side. A future BI may add
`limit` / `offset` parameters.

### Why `eval` not native `files`/`folders`?

Live-probe findings F1 / F2 / F3 (2026-05-15) surfaced three contract
mismatches with the native subcommands:

1. **Native `files`** returns a recursive flat FILE list only — no
   folder entries; combining with `folders` would require two spawns
   (violates R3 single-call architecture).
2. **Native `folders`** is the folder-only counterpart — same
   single-call problem.
3. **Neither native subcommand** supports depth bounding or
   distinguishes missing-folder from empty (both yield empty stdout
   + exit 0).

The wrapper routes through `eval` and walks `app.vault.adapter`
directly to deliver:
- combined files + folders output in one spawn,
- in-template depth bounding,
- structured missing/not-a-folder errors (FR-011),
- the trailing-slash discrimination rule (FR-028).

## Single-call architecture

Each MCP request fires exactly ONE `invokeCli` invocation (default
mode) OR up to TWO (when the closed-vault stage-3 detector fires).
End-to-end latency is approximately 1× a single-call typed tool
(~50–500 ms typical against a 1 000-file vault; ≤2 s against a
10 000-file vault depending on depth).

## Anti-injection guarantee

User input (`folder`, `ext`) flows through a base64-encoded JSON
payload inside a frozen JS template. The base64 alphabet
`[A-Za-z0-9+/=]` cannot break out of the JS string literal. Parity
with the rest of the eval-driven typed-tool cohort
(find_by_property / read_heading / links / smart_connections_similar /
smart_connections_query / tag).

## Related tools

- [files](./files.md) — non-recursive single-level counterpart;
  immediate children only.
- [tag](./tag.md) — tag-index walk; vault-relative paths of every
  note carrying a tag.
- [links](./links.md) — link-graph walk for a single note's outgoing
  links.
- [outline](./outline.md) — heading-structure walk for a single note.
- [properties](./properties.md) — vault-wide frontmatter property
  inventory.
- [obsidian_exec](./obsidian_exec.md) — freeform escape hatch for
  `files verbose` / `folders verbose` plain-text renderings.

## References

- [029-list-files-recursive spec](../../specs/029-list-files-recursive/spec.md)
  — feature spec; clarifications session 2026-05-15 (Q1
  folder-entry representation → trailing-slash on folders + bare on
  files); zero plan-stage spec amendments.
- [029-list-files-recursive research](../../specs/029-list-files-recursive/research.md)
  — Phase 0 decisions R1..R15 + plan-stage findings F1..F12.
- [029-list-files-recursive data-model](../../specs/029-list-files-recursive/data-model.md)
  — schema shapes, frozen JS template, per-tool invariants I-1..I-14,
  test inventory (43 cases).
- [errors contract](../../specs/001-add-cli-bridge/contracts/errors.contract.md)
  — canonical roster of `UpstreamError` codes.
- [ADR-015 Sub-Discriminators via details.reason for Multi-State Error Codes](../../.decisions/ADR-015%20-%20Sub-Discriminators%20via%20details.reason%20for%20Multi-State%20Error%20Codes.md)
  — governs the `(top-level-code, details.code)` pattern used for
  the new `FOLDER_NOT_FOUND` / `NOT_A_FOLDER` discriminators.
- [help tool spec](../../specs/005-help-tool/spec.md) — the
  schema-stripping contract and `help({ tool_name })` lookup that
  surfaces this document.
