# `tag`

## Overview

Return the vault-relative paths of every Markdown note carrying a given
tag as a typed envelope `{ count, paths: string[] }` (default mode) or
a bare integer (count-only mode). Wraps the Obsidian Integrated CLI's
`eval` subcommand (not the native `obsidian tag` subcommand — see the
[Inherited limitations](#why-eval-not-native-tag) for why) and walks
`app.metadataCache.fileCache` × `app.metadataCache.metadataCache`
directly. Fourteenth typed-tool wrap and the project's first
**tag-index retrieval primitive**. Sixth member of the eval-driven
typed-tool cohort and third consumer of the cross-cutting
`_eval-vault-closed-detection` shared module.

This tool is **vault-only** — there is no `target_mode` discriminator,
no `file` / `path` / `active` argument. Per-file frontmatter is
covered by [read_property](./read_property.md); the value-to-file
inverse is [find_by_property](./find_by_property.md); the link-graph
sibling is [links](./links.md).

## Input contract

`tag` consumes the schema below. Every field is rejected at the
boundary as `VALIDATION_ERROR` if the constraints fail. Unknown
top-level keys are rejected (`additionalProperties: false`).

```json
{
  "tag": "<tag string>",
  "vault": "<vault name>",
  "total": false
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `tag` | string | YES | length 1..220 raw; trimmed; single leading `#` stripped; ≤200 chars post-strip; no empty hierarchical segments. NO charset regex (Q2). |
| `vault` | string | OPTIONAL | length ≥ 1 — see [Inherited limitations: multi-vault basename ambiguity](#multi-vault-basename-ambiguity). |
| `total` | boolean | OPTIONAL | defaults to `false` |

### Per-field policy

- **`tag`** — the tag string. The wrapper runs a structural
  normalisation chain at the schema layer: trim → strip leading `#`
  → reject empty post-strip → reject length >200 post-strip → reject
  empty hierarchical segments (`/foo`, `foo/`, `foo//bar`). NO
  charset regex (Q2 defer-to-upstream) — Unicode + symbols flow
  through verbatim. The matcher is **case-insensitive** via
  wrapper-side ASCII lower-fold inside the eval template (FR-008 /
  R14 amendment 1 — Obsidian's native `tag` subcommand is
  case-sensitive; the wrapper restores the tag-pane UX expectation).
- **`vault`** — the vault display name. When omitted, the focused
  vault is used. **Inherited limitation**: multi-vault basename
  ambiguity (open the target vault first in Obsidian).
- **`total`** — when `true`, the response is a bare integer count
  with no `paths` array surfaced (token-economical pre-flight read).
  The count is invariant across both modes for the same vault state.

Out-of-scope upstream surfaces (rejected at the schema layer per
FR-005):

| Upstream surface | Why not exposed | Alternative |
|---|---|---|
| `obsidian tag name=<>` native subcommand | Plain-text output, case-sensitive, errors on zero-match, no child subsumption | Wrapper routes via `eval` for the structured envelope and child subsumption |
| `obsidian tags` (plural) subcommand | Vault-wide tag inventory — different operation | Out-of-scope at v1 (potential future BI) |
| `obsidian search query="#tag"` | Substring/regex search — would match tags inside fenced code blocks | n/a — `tag` uses the metadata cache, not text search |
| Pagination / limit / offset | Out-of-scope at v1 | Re-slice the `paths` array client-side |
| Folder-prefix filter | Out-of-scope at v1 | Filter the `paths` array client-side |
| Multi-tag boolean query | Out-of-scope at v1 | Re-intersect client-side |

## Output shape

### Default mode (`total !== true`)

```json
{
  "count": 2,
  "paths": ["Notes/alpha.md", "Notes/beta.md"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `count` | integer ≥ 0 | Number of distinct notes carrying the queried tag (or any descendant). |
| `paths` | array of strings | Vault-relative paths sorted byte-ascending. `count === paths.length` always. |

### Count-only mode (`total: true`)

```json
5
```

A bare integer. **No envelope object.** Suitable for pre-flight token-
economical reads.

### Zero-match

`{ count: 0, paths: [] }` in default mode or `0` in count-only mode.
**Never an error.**

### Sort order

`paths` is sorted byte-ascending wrapper-side inside the eval JS
template (`out.sort()`). Parity with
[smart_connections_similar](./smart_connections_similar.md) /
[smart_connections_query](./smart_connections_query.md).

## Worked examples

### Example 1 — Simple happy path (default mode)

```json
{
  "name": "tag",
  "arguments": { "tag": "alpha" }
}
```

Spawns one call: `obsidian eval code=<frozen-template-with-base64-payload>`.
The eval walks `app.metadataCache` and returns every `.md` note
carrying `#alpha` (or any descendant like `#alpha/beta`). Response:

```json
{ "count": 2, "paths": ["Notes/alpha.md", "Notes/beta.md"] }
```

### Example 2 — Leading `#` and whitespace

```json
{
  "name": "tag",
  "arguments": { "tag": "  #alpha  " }
}
```

The wrapper trims, strips the leading `#`, normalises to `"alpha"`.
Identical response to Example 1.

### Example 3 — Hierarchical parent query

```json
{
  "name": "tag",
  "arguments": { "tag": "project" }
}
```

Returns paths for notes tagged `project`, `project/alpha`,
`project/alpha/v1`, `project/beta`, etc. — segment-bounded child
subsumption (FR-004 / FR-016).

### Example 4 — Leaf-tag precision

```json
{
  "name": "tag",
  "arguments": { "tag": "project/alpha" }
}
```

Returns paths only for files tagged `project/alpha` or any descendant
(`project/alpha/v1`, etc.). The plain-`project`-tagged file is
**excluded** — the trailing-slash precision rule rejects substring-
prefix matches like `projectile`.

### Example 5 — Case-variant query

```json
{
  "name": "tag",
  "arguments": { "tag": "ALPHA" }
}
```

The wrapper applies ASCII lower-fold inside the eval template (FR-008
/ amendment 1 driven by live-probe F2). Identical response to
Example 1. **Limitation**: ASCII lower-fold only — non-ASCII case
variants (e.g. Turkish dotless i, German ß) are NOT folded at v1.

### Example 6 — Explicit vault

```json
{
  "name": "tag",
  "arguments": { "tag": "alpha", "vault": "TestVault-Obsidian-CLI-MCP" }
}
```

Routes via the `vault=` parameter; happy path otherwise. Note: see
[Inherited limitations: multi-vault basename ambiguity](#multi-vault-basename-ambiguity).

### Example 7 — Count-only mode

```json
{
  "name": "tag",
  "arguments": { "tag": "alpha", "total": true }
}
```

Returns the bare integer count `N` (no `paths` array). The count
matches the default-mode `paths.length` for the same vault state.

### Example 8 — Zero-match

```json
{
  "name": "tag",
  "arguments": { "tag": "never-used-tag" }
}
```

Returns `{ "count": 0, "paths": [] }`. **Never an error** — the
natural empty-result path of the JS template.

## Error roster

All failure surfaces flow through `UpstreamError` per Constitution
Principle IV. `tag` introduces **zero new top-level error codes** and
**zero new `details.code` values** (preserves the fourteen-tool
zero-new-codes streak).

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed the schema (empty / whitespace-only / empty-segment / length >200 / unknown top-level key / wrong type). | Agent retries with corrected input. `details.issues` carries per-issue `path` + `message` + zod code. |
| `CLI_REPORTED_ERROR` (details.code:"VAULT_NOT_FOUND", details.reason:"unknown") | Unknown vault — the cli-adapter's 011-R5 inspection clause fires on `Vault not found.` stdout. | Verify the vault name; ensure the vault is registered in Obsidian. |
| `CLI_REPORTED_ERROR` (details.code:"VAULT_NOT_FOUND", details.reason:"not-open", stage:"handler-stage-0") | Closed-but-registered vault — the shared `_eval-vault-closed-detection` module fires on the empty-stdout + exit-0 signature. The CLI transparently opens the vault as a side effect; retry after a brief delay. | Retry once the vault has opened. |
| `CLI_REPORTED_ERROR` (details.stage:"json-parse") | Eval stdout is non-JSON after the `=> ` strip — upstream contract divergence. | Investigate as a regression. |
| `CLI_REPORTED_ERROR` (details.stage:"envelope-parse") | Eval JSON parses but doesn't match the envelope union — upstream contract divergence. | Investigate as a regression. |
| `CLI_REPORTED_ERROR` (details.stage:"envelope-error", details.code:`<as-emitted>`) | Reserved for future eval-template envelope-level failures (e.g. cache-not-ready). | v1 template never emits `ok:false` — investigate as a regression. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN`. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (typical cause: output-cap kill on pathologically large result arrays). | Use `total: true` to bypass cap-risk, OR reduce vault scope. |
| `CLI_DISPATCH_TIMEOUT` | The CLI did not complete within the typed-tool 10-second cap. | Investigate vault size / metadata cache health. |
| `CLI_DISPATCH_CAP_KILL` | Output exceeded the 10 MiB cap (rare for tag-index walks). | Use `total: true`, OR reduce vault scope. |
| `CLI_DISPATCH_KILL` | Dispatch killed externally (signal / shutdown). | Retry. |

## Inherited limitations

### Multi-vault basename ambiguity

The CLI's `vault=` parameter routes correctly for `eval` (verified
live; unregistered vault names surface as `CLI_REPORTED_ERROR` with
`details.code: "VAULT_NOT_FOUND"`, `details.reason: "unknown"` per
the error-roster row above), but multi-vault setups still suffer
from basename ambiguity — two vaults sharing the same display name
are indistinguishable by the `vault=` argument.
**Recommendation**: open the target vault in Obsidian before
invoking `tag`. Parity with the other eval-cohort members.
(Empirical anchor: probe captured 2026-05-21 against obsidian-cli
1.12.7; see
[specs/042-close-audit-findings/contracts/vault-probe-evidence.md](../../specs/042-close-audit-findings/contracts/vault-probe-evidence.md)
T014; re-verify on next audit cycle.)

### ASCII-only lower-fold

Wrapper-side case-insensitivity uses JavaScript's `String#toLowerCase()`
ASCII semantics inside the eval JS template. Non-ASCII case variants
(Turkish dotless i, German ß, etc.) are NOT folded at v1. Callers
needing locale-aware case-folding should normalise client-side before
calling.

### Metadata cache freshness

The eval JS template reads `app.metadataCache.metadataCache` — the
same cache that Obsidian's tag pane reads. If the vault has been
edited but the cache has not yet caught up (typical lag: <1s), the
returned paths reflect the cache state, not the disk state. Parity
with the tag pane.

### Output cap inherited from cli-adapter

The cli-adapter applies a 10 MiB stdout cap per invocation. For a
result with very long path strings, this could fire — though for
typical vaults the cap is unreachable (a 10 000-path result with
50-char paths averages ~500 KB). Use `total: true` to bypass the
cap-risk entirely.

### No pagination at v1

`tag` returns the full match set in one response. Callers needing
pagination re-slice the `paths` array client-side. A future BI may
add `limit` / `offset` parameters.

### Markdown-only tag-cache scope

Obsidian's metadata cache only indexes `.md` files. Tags in Canvas /
PDF annotations / attachments are NOT surfaced. The wrapper guards
this explicitly via an in-eval `path.endsWith('.md')` filter.

### Latency

Approximately 50–200 ms typical against a 1 000-note vault; ≤1 s against a 10 000-note vault. The closed-vault recovery path may add one retry round-trip.

## Related tools

- [links](./links.md) — link-graph sibling; returns the outgoing
  links of a single note.
- [find_by_property](./find_by_property.md) — value-to-file inverse
  for frontmatter properties.
- [properties](./properties.md) — vault-wide frontmatter property
  inventory.
- [outline](./outline.md) — heading structure of a single note.
- [obsidian_exec](./obsidian_exec.md) — freeform escape hatch for
  `tag verbose` plain-text renderings.
