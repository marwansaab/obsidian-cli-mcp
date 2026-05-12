# `files`

## Overview

List files directly inside a vault folder. Wraps the Obsidian CLI's
`files` subcommand and returns a typed result `{ count, paths }` with
vault-relative paths sorted by UTF-8 byte order. The first FOLDER-scoped
typed tool — where the prior typed tools (`read`, `write_note`,
`delete`, `read_property`, `find_by_property`, `read_heading`,
`set_property`) all operate on a single named file or the focused
file, `files` operates on a vault folder.

The tool supports two target modes:

- **specific** — name the vault explicitly. The wrapper enumerates the
  named folder (or the vault root when `folder` is omitted) within the
  named vault.
- **active** — operate on the currently focused vault. No `vault`
  argument is permitted in this mode.

The discriminator is `target_mode`. The schema composes the
[target-mode primitive](../../specs/004-target-mode-schema/spec.md) with
a folder-scoped refinement that forbids the file-scoped locator fields
(`file` and `path`) in BOTH modes (introduced by this feature). Three
files-specific optional fields layer on top: `folder`, `ext`,
`total`.

## Input Schema

`files` consumes the discriminated union below. Every field is
rejected at the boundary as `VALIDATION_ERROR` if the constraints fail.
Unknown top-level keys are rejected (`additionalProperties: false`) —
the schema is strict.

### Specific mode

```json
{
  "target_mode": "specific",
  "vault": "<vault name>",
  "folder": "<optional vault-relative folder path>",
  "ext": "<optional file extension filter>",
  "total": false
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"specific"` | YES | discriminator |
| `vault` | string | YES | length ≥ 1 |
| `folder` | string | OPTIONAL | length ≥ 1; vault-relative folder path |
| `ext` | string | OPTIONAL | length ≥ 1; extension filter (`md` or `.md` both accepted) |
| `total` | boolean | OPTIONAL | when `true`, response carries `paths: []` |
| `file` | (n/a) | FORBIDDEN | folder-scoped tool — file locator has no meaning |
| `path` | (n/a) | FORBIDDEN | folder-scoped tool — path locator has no meaning |

### Active mode

```json
{
  "target_mode": "active",
  "folder": "<optional vault-relative folder path>",
  "ext": "<optional file extension filter>",
  "total": false
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"active"` | YES | discriminator |
| `folder` | string | OPTIONAL | same semantics as specific mode |
| `ext` | string | OPTIONAL | same semantics as specific mode |
| `total` | boolean | OPTIONAL | same semantics as specific mode |
| `vault` | (n/a) | FORBIDDEN | rejected at the schema layer |
| `file` | (n/a) | FORBIDDEN | folder-scoped tool — file locator has no meaning |
| `path` | (n/a) | FORBIDDEN | folder-scoped tool — path locator has no meaning |

### Per-field policy

- **`folder`** — when omitted, enumerates the vault root. When present,
  enumerates direct children of the named folder (non-recursive — see
  the filter pipeline below). Trailing slash (`folder: "Inbox/"`) and
  no trailing slash (`folder: "Inbox"`) produce byte-identical
  responses. Path-traversal patterns (`folder: "../../etc"`,
  `folder: "/absolute"`) are passed through verbatim and confined at
  the CLI — the wrapper does NOT pre-validate or normalise. Empty
  string rejects at validation.
- **`ext`** — when omitted, returns all files regardless of extension.
  When present, returns only files matching the extension. The CLI
  accepts both `ext: "md"` and `ext: ".md"`. The CLI matches extension
  **case-sensitively** — `ext: "MD"` does NOT match `.md` files. Empty
  string rejects at validation. An unrecognised extension
  (`ext: "qqq"`) returns the empty-folder shape, NOT an error.
- **`total`** — defaults to `false`. When `true`, the response payload
  carries `paths: []` with `count` set to the same value `total: false`
  would have returned. The wrapper does NOT delegate to the CLI's
  native `total` flag (see Known Limitations).

## Output

```json
{ "count": 3, "paths": ["Inbox/a.md", "Inbox/b.md", "Inbox/c.md"] }
```

| Field | Type | Description |
|-------|------|-------------|
| `count` | integer ≥ 0 | The number of file entries directly inside `folder` (or the vault root) after sub-folder, dotfile, and non-recursive filtering. Identical across both branches of `total`. |
| `paths` | string array | Vault-relative paths, sorted lexically by UTF-8 byte order. Always empty when `total: true`; populated when `total: false`. On `total: false`, `paths.length === count` is invariant. |

The response carries NO `vault` echo (per spec clarification Q3,
cross-tool consistency with `read_property` / `find_by_property` /
`read_heading`). For active-mode TOCTOU awareness, callers needing to
audit which vault was actually enumerated should use
`target_mode: "specific"` with an explicit `vault`.

## Filter pipeline (wrapper-side, post-CLI fetch)

The CLI's `files` subcommand returns the **recursive subtree** under
the named folder. The wrapper applies three filters and one sort
post-fetch to deliver the non-recursive, sorted, file-only contract:

1. **Sub-folder filter** — drops any result path ending in `/` or `\`.
   Defence-in-depth — the live CLI does not currently emit such
   entries from `files`.
2. **Dotfile filter** — drops any result path with any `/`-separated
   segment beginning with `.`. Defence-in-depth — the live CLI already
   filters dotfiles natively. Direct consequence: `folder: ".obsidian"`
   returns `{ count: 0, paths: [] }` because every result path's first
   segment is `.obsidian` (starts with `.`).
3. **Non-recursive filter** — drops paths whose component count
   exceeds the folder's component count + 1 (or 1 when `folder` is
   omitted). This filter is **load-bearing** — the CLI returns the
   recursive subtree, so the wrapper enforces FR-012's non-recursive
   contract post-fetch.

After filtering, the wrapper sorts the remaining paths by UTF-8 byte
order via `Buffer.compare`. This differs from JavaScript's default
string compare (UTF-16 code-unit order) only for non-BMP characters
(emoji, characters above U+FFFF). Byte-for-byte reproducible across
platforms.

## Behavioural notes (live-CLI characterisation)

These behaviours are captured in
[research.md](../../specs/019-list-files/research.md) (plan-stage
findings F1–F20) and are observable by callers — agents should plan
for them.

### Per-call architecture

Each MCP request fires **exactly ONE** `invokeCli` invocation
regardless of `target_mode` or input parameters. No two-call branches.
End-to-end latency is approximately 1× a single-call typed tool. All
invocations serialise through the project's single-in-flight queue.

### Missing folder / empty folder / folder-names-a-file all conflated

A `folder` value that names a missing folder, an empty folder, or a
file (not a folder) all return the same empty-folder shape
`{ count: 0, paths: [] }` — NOT a structured error. This conflation is
inherited from the CLI's `files` subcommand behaviour. Callers needing
to distinguish these cases should first verify folder existence via
`obsidian_exec` or out-of-band filesystem inspection.

### Path-traversal CLI-confined

`folder: "../../etc"`, `folder: "Fixtures/../Fixtures/X"`,
`folder: "/absolute"`, and similar traversal attempts are passed
through verbatim to the CLI and confined there. The CLI returns empty
stdout for non-vault paths; the wrapper surfaces the conflated
empty-folder shape `{ count: 0, paths: [] }`. The wrapper does NOT
pre-validate `folder` — the CLI is the confinement layer.

### Sort key — UTF-8 byte order, NOT JavaScript default

The wrapper sorts paths by UTF-8 byte order via `Buffer.compare`. For
ASCII-only and BMP-only paths, this matches JavaScript's default
string compare. For paths containing **non-BMP characters** (emoji,
historical scripts, supplementary planes), the order may differ from
JS default. Callers that round-trip the response through a different
sort should pin to byte-compare semantics if cross-platform
reproducibility matters.

### Active-mode TOCTOU caveat

In `target_mode: "active"`, the focused vault may shift between the
request and the CLI's response. The response carries no `vault` echo
(spec clarification Q3), so callers cannot audit which vault was
actually enumerated. Agents that need certainty should use specific
mode with an explicit `vault`.

### Argv anti-injection guarantee

User inputs (`folder`, `ext`) flow through discrete argv parameters to
the CLI's `files` subcommand via `child_process.spawn` — no shell
interpolation, no eval source-text concatenation. The spec's "no eval
injection vector" assertion holds because `files` does NOT route
through `obsidian_exec` or `eval`.

## Errors

All failure surfaces flow through `UpstreamError` per Constitution
Principle IV. `files` introduces **zero new error codes** — the
failure surface is fully covered by codes already defined by the
foundation features.

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | The input failed `listFilesInputSchema` validation (missing `target_mode`, missing `vault` in specific mode, `vault` present in active mode, `file` or `path` present in any mode, `folder` or `ext` empty, unknown top-level key, etc.). | Agent retries with corrected input. `details.issues` carries the per-issue `path` + `message` + zod code. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (typical cause: output-cap kill on pathologically large folders, or the CLI itself encountered a non-stdout-reported error). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. |
| `CLI_REPORTED_ERROR` | The CLI exited 0 but reported a failure in-band — either stdout starts with `Error:`, OR the unknown-vault response (`Vault not found.`) was matched by the cli-adapter's R5 inspection. | `details.message` (the first line of stdout) names the specific failure. |
| `ERR_NO_ACTIVE_FILE` | `target_mode: "active"` was used but no Obsidian instance is reachable / no vault is focused. Exact surface depends on the CLI's response shape — may also surface as `CLI_REPORTED_ERROR`. | Operator-side: open a vault in Obsidian, OR call again with `target_mode: "specific"` and an explicit `vault`. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |
| `CLI_OUTPUT_TOO_LARGE` | The CLI's stdout exceeded the cli-adapter's 10 MiB output cap (cap-exceeded kill). | Reduce the folder's size, OR use a more specific `folder` to narrow the recursive subtree. |

The canonical errors contract is at
[specs/001-add-cli-bridge/contracts/errors.contract.md](../../specs/001-add-cli-bridge/contracts/errors.contract.md);
`files` propagates the adapter's classification verbatim with no
rewrites. **No new codes** are introduced by this tool.

## Examples

### Example 1 — Specific mode, named folder

```json
{
  "name": "files",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "folder": "Inbox"
  }
}
```

Spawns one call: `obsidian vault=Demo files folder=Inbox`. The wrapper
applies the non-recursive filter, sorts by UTF-8 byte order, and
returns `{ count, paths }` with vault-relative paths directly inside
`Inbox/`. Example response:

```json
{ "count": 3, "paths": ["Inbox/a.md", "Inbox/b.md", "Inbox/c.md"] }
```

### Example 2 — Specific mode, vault root, ext filter

```json
{
  "name": "files",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "ext": "md"
  }
}
```

Spawns one call: `obsidian vault=Demo files ext=md`. Lists root-level
`.md` files only (non-recursive — direct children of the vault root).
Other extensions (`.png`, `.canvas`) are excluded by the CLI's `ext`
filter.

### Example 3 — Active mode, named folder

```json
{
  "name": "files",
  "arguments": {
    "target_mode": "active",
    "folder": "Daily"
  }
}
```

Spawns one call: `obsidian files folder=Daily` (no `vault=` argument).
Returns the focused vault's `Daily/` listing. The active-mode TOCTOU
caveat applies — the focused vault MAY change between submission and
execution; the response carries NO `vault` echo.

### Example 4 — Count-only (`total: true`)

```json
{
  "name": "files",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "folder": "Drafts",
    "total": true
  }
}
```

Spawns one call: `obsidian vault=Demo files folder=Drafts` (the
wrapper does NOT delegate to the CLI's native `total` flag — see
Known Limitations). The wrapper fetches, filters, counts, then
discards paths. Response:

```json
{ "count": 42, "paths": [] }
```

The token saving is realised at the wrapper→MCP-client boundary, not
at the CLI→wrapper boundary.

### Example 5 — Dotfile filter consequence (`folder: ".obsidian"`)

```json
{
  "name": "files",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "folder": ".obsidian"
  }
}
```

Spawns one call: `obsidian vault=Demo files folder=.obsidian`. Returns
`{ count: 0, paths: [] }` because every result path's first segment
(`.obsidian`) is dot-prefixed and the wrapper's uniform dotfile filter
drops every entry. To inspect `.obsidian/` contents, fall back to
`obsidian_exec` with the `files` subcommand directly.

### Example 6 — Combined ext + total

```json
{
  "name": "files",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "folder": "Assets",
    "ext": "png",
    "total": true
  }
}
```

Spawns one call: `obsidian vault=Demo files folder=Assets ext=png`.
Returns `{ count: <png count>, paths: [] }`. Useful for sizing-up a
folder before deciding whether to fetch the full path list.

## Known Limitations

### `total: true` is NOT a cap-evasion path

The wrapper does NOT delegate to the CLI's native `total` flag because
the CLI's `total` count is recursive — incompatible with FR-007's
identical-count-across-modes requirement. Both `total: true` and
`total: false` apply the same CLI fetch + filter pipeline, so they
face the same 10 MiB output-cap threshold. A pathologically large
folder that exceeds the cap with `total: false` will ALSO exceed it
with `total: true`. Callers needing recursive counts on pathological
folders can fall back to `obsidian_exec` with
`files folder=X total` — the CLI's native `total` flag is
cap-friendly but produces a recursive count distinct from the
wrapper's non-recursive count. Per Plan-amendment-1 in
[research.md](../../specs/019-list-files/research.md).

### Platform-dependent case-sensitivity on `folder`

The wrapper passes `folder` to the CLI verbatim without case
normalisation. On Windows and macOS (default case-insensitive
filesystems), `folder: "inbox"` and `folder: "Inbox"` resolve
equivalently. On Linux and case-sensitive macOS volumes, they do not.
Callers needing case-sensitivity-independent behaviour should
normalise upstream.

### Active-mode multi-vault inheritance

The Obsidian CLI's active-mode resolution targets the currently
focused vault. In multi-vault setups, callers cannot specify which
vault to enumerate via active mode. **Recommendation**: prefer
`target_mode: "specific"` with an explicit `vault` argument when the
target vault is known.

### Sub-folder and dotfile filters are defence-in-depth

The live CLI does NOT currently emit sub-folder entries from the
`files` subcommand (verified live during plan; see F19). The live CLI
also already filters dotfiles natively (verified live during plan;
see F18). The wrapper's sub-folder filter (FR-026) and dotfile filter
(FR-028) protect against future CLI version drift but are not
currently observable against the live CLI. Unit tests use synthetic
stdout to exercise these filters. Per Plan-amendment-2 in
[research.md](../../specs/019-list-files/research.md).

## References

- [019-list-files spec](../../specs/019-list-files/spec.md) — feature
  spec, user input acceptance criteria, FR-023 live-CLI
  characterisation requirements.
- [019-list-files research](../../specs/019-list-files/research.md) —
  R1–R16 design decisions, F1–F20 live findings, Plan-amendment-1
  (SC-012 weakening) and Plan-amendment-2 (defence-in-depth filters).
- [019-list-files data-model](../../specs/019-list-files/data-model.md)
  — schema shapes, per-mode argv-mapping table, filter pipeline
  diagrams, test inventory (51 cases).
- [obsidian_exec](./obsidian_exec.md) — freeform escape hatch for
  recursive enumeration, `.obsidian/` inspection, and any unwrapped
  `files` subcommand needs.
- [errors contract](../../specs/001-add-cli-bridge/contracts/errors.contract.md)
  — canonical roster of `UpstreamError` codes.
- [target-mode primitive spec](../../specs/004-target-mode-schema/spec.md)
  — shared discriminator the input schema composes via the
  folder-scoped refinement variant introduced by this feature.
- [help tool spec](../../specs/005-help-tool/spec.md) — the
  schema-stripping contract and `help({ tool_name })` lookup that
  surfaces this document.
