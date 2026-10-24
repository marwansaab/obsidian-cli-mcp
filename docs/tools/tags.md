# `tags`

## Overview

Return the tag inventory of an Obsidian vault, or the tag set of one
note, as a typed envelope `{ total, tags: [{ name, count? }] }`. It
wraps the Obsidian Integrated CLI's native `tags` subcommand with one
call per request (`tags format=json counts`, plus `file=` / `path=` /
`active` for a single-note scope). The wrapper itself does four things:

- strips exactly one leading `#` from each name;
- sorts the list (alphabetically or by count);
- drops `count` when asked;
- validates the result against a strict output schema.

`tags` answers "which tags exist, and how often?". Its sibling
[tag](./tag.md) answers the inverse question, "which notes carry tag
X?". A bare name from `tags` can be passed straight to `tag`.

The tool follows the sibling-locator addressing pattern (ADR-032 — Find
And Replace File Scope via Sibling Locators): an optional `vault` plus
at most one single-note locator. There is **no `target_mode`**
discriminator.

## Input contract

```json
{
  "vault": "<vault display name>",
  "file": "<bare note name>",
  "path": "<vault-relative/path.md>",
  "activeOnly": false,
  "sortByCount": false,
  "includeCounts": true
}
```

Every field is optional. `{}` is a valid request: the vault-wide tag
index of the focused vault, alphabetical, with counts. Unknown
top-level keys are rejected (`additionalProperties: false`).

| Field | Type | Required | Default | Constraint |
|-------|------|----------|---------|------------|
| `vault` | string | no | focused vault | length ≥ 1. Forbidden with `activeOnly: true`. |
| `file` | string | no | — | length ≥ 1; structurally safe; no `[[` / `]]`. Bare note name, resolved like a wikilink. |
| `path` | string | no | — | length ≥ 1; structurally safe. Vault-relative, extension included. |
| `activeOnly` | boolean | no | `false` | `true` forbids `vault`, `file` and `path`. |
| `sortByCount` | boolean | no | `false` | — |
| `includeCounts` | boolean | no | `true` | — |

### Per-field policy

- **`vault`**: the vault display name. When it is omitted the focused
  vault is used. It may accompany `file` / `path` to choose the note's
  vault. An unregistered name fails with `CLI_REPORTED_ERROR`
  (`Vault not found.`).
- **`file`**: a bare note name such as `Alpha`, resolved by Obsidian's
  shortest-unique-name rule, as a wikilink would be. The `[[Alpha]]`
  bracket form is rejected with a `VALIDATION_ERROR` asking for the
  bare name.
- **`path`**: an exact vault-relative path such as `Projects/Alpha.md`.
- **`activeOnly`**: when `true`, the listing covers the note open in the
  editor. The active note belongs to the focused vault, so `vault`
  cannot be supplied with it. `activeOnly: false` counts as not set, so
  it may be combined with `file` or `path`.
- **`sortByCount`**: when `true`, entries are ordered by count, highest
  first, and equal counts are ordered by name.
- **`includeCounts`**: when `false`, no entry carries a `count` key. The
  `sortByCount` order still applies, because sorting happens before
  counts are dropped.

**Structural path safety** (`file` and `path`): a value is rejected
before any CLI call if it is empty, starts with `/` or `\`, starts with
a drive letter (`C:`), contains a `..` segment, or contains a control
character or DEL. The rejection is `VALIDATION_ERROR` with
`details.code: "INVALID_NOTE"`, `details.reason: "path-traversal"`.

### Scope matrix

Rows are checked in order, and the first match is the single reason
reported.

| # | Combination | Verdict | Error |
|---|---|---|---|
| 1 | `file` + `path` | reject | `VALIDATION_ERROR`, `details.code: "SCOPE_CONFLICT"`, `details.reason: "file+path"` |
| 2 | `activeOnly: true` + (`file` or `path`) | reject | `VALIDATION_ERROR`, `SCOPE_CONFLICT` / `active+note` |
| 3 | `activeOnly: true` + `vault` | reject | `VALIDATION_ERROR`, `SCOPE_CONFLICT` / `active+vault` |
| 4 | (`file` or `path`), with or without `vault` | allow | — |
| 5 | `vault` only, or nothing | allow (vault-wide) | — |
| 6 | `activeOnly: true` only | allow (active note) | — |

**Client-class note (unknown keys)**: some MCP clients drop keys that
are absent from the published `inputSchema` before sending. On those
clients an unknown key such as `target_mode` or `sort` never reaches
the server, and the call proceeds as if the key were absent. The
server-side `VALIDATION_ERROR` for unknown keys is directly observable
only on clients that forward them.

## Output shape

```json
{
  "total": 3,
  "tags": [
    { "name": "alpha", "count": 4 },
    { "name": "beta", "count": 1 },
    { "name": "parent/child", "count": 2 }
  ]
}
```

With `includeCounts: false`:

```json
{ "total": 3, "tags": [{ "name": "alpha" }, { "name": "beta" }, { "name": "parent/child" }] }
```

An empty scope (an untagged vault or an untagged note) is a success:

```json
{ "total": 0, "tags": [] }
```

| Field | Type | Description |
|-------|------|-------------|
| `total` | integer ≥ 0 | Number of entries. Always `=== tags.length`. |
| `tags[].name` | string | The index's tag name with exactly one leading `#` removed. Nothing else changes: no case-folding, normalisation, roll-up or split. |
| `tags[].count` | integer ≥ 0 | The index's occurrence count for the tag in the requested scope. Present on every entry, or absent from every entry when `includeCounts: false`. |

Guarantees:

1. `total === tags.length`.
2. Each `name` appears at most once.
3. Default order: names compared lower-cased first, then by UTF-16
   code unit as a tiebreak (`Alpha` before `alpha`). The order never
   depends on the locale.
4. `sortByCount: true`: count descending, ties broken by the same name
   rule.
5. The upstream order is never relied on.
6. A success is never partial. Oversized output is
   `CLI_OUTPUT_TOO_LARGE`, never a truncated list.

## Worked examples

### Example 1 — Vault-wide index with counts

```json
{ "name": "tags", "arguments": { "vault": "TestVault-Obsidian-CLI-MCP" } }
```

Spawns `obsidian vault=TestVault-Obsidian-CLI-MCP tags format=json counts`.
Response:

```json
{
  "total": 4,
  "tags": [
    { "name": "café", "count": 1 },
    { "name": "project", "count": 3 },
    { "name": "project/alpha", "count": 2 },
    { "name": "todo", "count": 5 }
  ]
}
```

Omit `vault` (`{}`) to list the focused vault instead.

### Example 2 — File-scoped listing

```json
{ "name": "tags", "arguments": { "file": "Meeting notes" } }
```

Lists only the tags carried by the note named `Meeting notes` in the
focused vault. `count` is the number of occurrences within that note:

```json
{ "total": 2, "tags": [{ "name": "meeting", "count": 1 }, { "name": "todo", "count": 3 }] }
```

### Example 3 — Path-scoped listing in a named vault

```json
{
  "name": "tags",
  "arguments": { "vault": "Work", "path": "Projects/Alpha.md" }
}
```

Spawns `obsidian vault=Work tags format=json path=Projects/Alpha.md counts`.
A path that names no note fails with `CLI_REPORTED_ERROR`, with the
upstream message `Error: File "Projects/Alpha.md" not found.` in
`details.message`; it never returns an empty list.

### Example 4 — Most-used tags first (sortByCount)

```json
{ "name": "tags", "arguments": { "sortByCount": true } }
```

```json
{
  "total": 3,
  "tags": [
    { "name": "todo", "count": 5 },
    { "name": "alpha", "count": 2 },
    { "name": "beta", "count": 2 }
  ]
}
```

Equal counts (`alpha`, `beta`) are ordered by name. To get the
frequency order without the numbers, add `"includeCounts": false`:
the result is `[{ "name": "todo" }, { "name": "alpha" }, { "name": "beta" }]`.

### Example 5 — The active note (activeOnly)

```json
{ "name": "tags", "arguments": { "activeOnly": true } }
```

Lists the tags of the note open in the editor. Do **not** pass
`vault`; that combination fails with `SCOPE_CONFLICT` / `active+vault`.
If no note is open, the call fails with `ERR_NO_ACTIVE_FILE` and the
message *"No active file in Obsidian. Open a note in the editor, or
call tags with `file` or `path` instead of `activeOnly`."*

### Example 6 — Error envelope for a scope conflict

```json
{ "name": "tags", "arguments": { "file": "Alpha", "path": "Projects/Alpha.md" } }
```

```json
{
  "code": "VALIDATION_ERROR",
  "message": "tags: `file` and `path` are mutually exclusive — supply at most one single-note locator",
  "details": {
    "code": "SCOPE_CONFLICT",
    "reason": "file+path",
    "issues": [{ "path": [], "message": "…", "code": "custom" }]
  }
}
```

No CLI call is made.

## Error roster

All failures flow through `UpstreamError` (Constitution Principle IV).
`tags` introduces **zero new top-level error codes** and no new
`details.code` / `details.reason` pairs. Every `VALIDATION_ERROR`
carries `details.issues: [{ path, message, code }]`, the field paths
zod reported.

| Code | `details` | When | Recovery |
|------|-----------|------|----------|
| `VALIDATION_ERROR` | `code: "SCOPE_CONFLICT"`, `reason: "file+path"` | `file` and `path` both set | Supply one locator. |
| `VALIDATION_ERROR` | `code: "SCOPE_CONFLICT"`, `reason: "active+note"` | `activeOnly: true` with `file` or `path` | Drop `activeOnly`, or drop the locator. |
| `VALIDATION_ERROR` | `code: "SCOPE_CONFLICT"`, `reason: "active+vault"` | `activeOnly: true` with `vault` | Drop `vault`; the active note picks its vault. |
| `VALIDATION_ERROR` | `code: "INVALID_NOTE"`, `reason: "path-traversal"` | `file` or `path` structurally unsafe | Supply a vault-relative locator. |
| `VALIDATION_ERROR` | generic `issues` | unknown key, wrong type, empty `vault`, `[[…]]` in `file` | Correct the input. |
| `ERR_NO_ACTIVE_FILE` | inherited dispatch `details` (upstream: `Error: No active file. Use file=<name> or path=<path> to specify a file.`) | `activeOnly: true` and no note is open | Open a note, or use `file` / `path`. |
| `CLI_REPORTED_ERROR` | `message: "Vault not found."` | unregistered `vault` (the CLI exits 0; the adapter re-classifies) | Check the vault name. |
| `CLI_REPORTED_ERROR` | `message`: the upstream text, e.g. `Error: File "<locator>" not found.` | `file` / `path` names no note | Check the locator. |
| `CLI_REPORTED_ERROR` | `stage: "json-parse"` or `"upstream-shape"`, full `stdout` | the CLI output was not the expected JSON array | Investigate as an upstream regression. |
| `CLI_OUTPUT_TOO_LARGE` | `limitBytes` | the CLI output exceeded 10 MiB | Narrow the scope to one note. |
| `CLI_TIMEOUT` | inherited | the CLI did not finish within 10 s | Check vault size and index health. |
| `CLI_NON_ZERO_EXIT` | inherited | the CLI exited non-zero | Inspect `details.stderr`. |
| `CLI_BINARY_NOT_FOUND` | inherited | no `obsidian` binary on `PATH` and no valid `OBSIDIAN_BIN` | Install the CLI or set `OBSIDIAN_BIN`. |
| `INTERNAL_ERROR` | zod `issues` | the wrapper's own result failed its output schema (should be unreachable) | Report as a bug. |

Vault-not-open and Obsidian-not-running recovery (cold-start retry and
app launch) is inherited from the shared dispatch layer.

## Inherited limitations

These behaviours come from Obsidian's own tag index. The wrapper
passes them through unchanged. They were characterised by live T0
probes on 2026-10-24 (`specs/068-list-tags/contracts/t0-probe-plan.md`).

### Count meaning

`count` is the number of **occurrences**, not the number of notes.
Three `#todo` markers in one note give `count: 3`, both in that note's
listing and in the vault-wide listing.

### Case variants

- **Vault-wide** listings merge tags that differ only by case (`#Alpha`
  and `#alpha`) into one entry. Its count sums both, and its name keeps
  the first-seen casing.
- **Single-note** listings keep them as separate entries.

The wrapper never merges or splits. As a result, the byte-order
tiebreak in the default sort is **unobservable end-to-end for
vault-wide listings**; it only takes effect in single-note listings.

### Hierarchical tags

- **Vault-wide**, every ancestor of a nested tag appears as its own
  entry, and its count **includes** its descendants' occurrences. For
  example, `#project/alpha` alone yields both `project` (1) and
  `project/alpha` (1); adding a standalone `#project` makes `project` 2.
- A **single-note** listing shows only the literal tags in that note.

The wrapper does not add or remove parent entries.

### Non-ASCII tags

Tags such as `#café` and `#日本語` are recognised like ASCII tags and
returned byte-identical. No normalisation, case-folding or
transliteration is applied. They sort by the same code-unit rule as
every other name.

### Fenced code blocks

Tag-shaped tokens inside fenced code blocks are excluded by the index
and do not appear or count. A regression test locks this with a
fixture captured from a live note.

### Frontmatter and inline tags

Tags from a frontmatter `tags:` list and inline `#hashtag` markers both
appear (frontmatter tags carry a `#` upstream too, which the wrapper
strips). This is an inherited index behaviour with no wrapper logic,
so it is verified live (T0 probe P4 and quickstart scenario 2), not by
an in-process test.

### Staleness window

The listing is a single snapshot of the index at the moment it is
read. Obsidian updates the index asynchronously after a file changes,
so a listing can lag a just-made edit by the index's refresh delay
(typically under a second). The tool does not wait for, or force,
re-indexing.

### Size ceiling

There is no pagination or truncation. The CLI's JSON costs about 53
bytes per entry at typical name lengths, so on the order of 10⁵
distinct tags fit under the 10 MiB output cap. Larger inventories fail
with `CLI_OUTPUT_TOO_LARGE`; narrow the scope to one note in that case.

## Related tools

- [tag](./tag.md): the inverse lookup, returning the notes that carry
  a given tag.
- [properties](./properties.md): the vault-wide frontmatter property
  inventory.
- [read_property](./read_property.md): reads one note's frontmatter
  values.
- [obsidian_exec](./obsidian_exec.md): the freeform escape hatch for
  native `tags` output such as `format=tsv`.
