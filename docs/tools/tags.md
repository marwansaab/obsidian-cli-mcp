# `tags`

## Overview

Return the tags in a vault, or the tags written in one note, as a typed envelope `{ total, tags: [{ name, count? }] }`. `tags` is the **tag inventory**: which tags exist, and how often each occurs. It is the counterpart of [`tag`](./tag.md), which answers the opposite question: which notes carry one given tag.

The tool wraps Obsidian's native `tags` subcommand and makes exactly **one** CLI call per request. It strips the leading `#` from each name, turns upstream's string counts into integers, and sorts the result on the wrapper side, so the order is the same on every call.

## When to use this tool

| You want to | Reach for |
|---|---|
| The list of tags in a vault, with how often each occurs | `tags` |
| The tags written in one note | `tags` with `file`, `path` or `activeOnly: true` |
| The notes that carry one tag | [`tag`](./tag.md) |
| The list of frontmatter property names | [`properties`](./properties.md) |
| Raw upstream output, such as TSV or CSV | [`obsidian_exec`](./obsidian_exec.md) |

## Input contract

`tags` consumes the schema below. Every field is checked at the boundary; a failure is a `VALIDATION_ERROR` and **no CLI call is made**. Unknown top-level keys are rejected (`additionalProperties: false`).

```json
{
  "target_mode": "specific",
  "vault": "<vault display name>",
  "file": "<note name>",
  "path": "<vault-relative/path.md>",
  "activeOnly": false,
  "sortByCount": false,
  "includeCounts": true
}
```

| Field | Type | Required | Default | Constraint |
|---|---|---|---|---|
| `target_mode` | `"specific"` \| `"active"` | YES | — | |
| `vault` | string | specific: YES; active: forbidden | — | length ≥ 1 |
| `file` | string | no | — | length ≥ 1. The note name as Obsidian resolves it (the link text, without `[[ ]]`). |
| `path` | string | no | — | length ≥ 1. A vault-relative path with its extension. Must not start with `/` or `\`, must not start with a drive letter, must not contain a `..` segment or control characters. |
| `activeOnly` | boolean | no | `false` | The note focused in the editor of the targeted vault. |
| `sortByCount` | boolean | no | `false` | Sort by count, highest first. |
| `includeCounts` | boolean | no | `true` | `false` returns names only. |

### Scope matrix (ADR-038)

`tags` keeps the cohort's `target_mode` field, but its scope rules are its own:

- **`target_mode: "specific"`** requires `vault`. **`target_mode: "active"`** forbids `vault` and uses the focused vault.
- **At most one** of `file`, `path` and `activeOnly: true` may be set. If none is set, the listing covers the whole vault. `activeOnly: false` counts as not set, so `{ "file": "Alpha", "activeOnly": false }` is valid.
- All three scopes are allowed in **both** modes:

| Scope set | `target_mode: "specific"` (with `vault`) | `target_mode: "active"` |
|---|---|---|
| none | every tag in the named vault | every tag in the focused vault |
| `file` | the named note, resolved inside the named vault | the named note, resolved inside the focused vault |
| `path` | the note at that path inside the named vault | the note at that path inside the focused vault |
| `activeOnly: true` | the note focused in the **named** vault's editor, even when that vault is open but not the focused one (verified live) | the note focused in the focused vault |

Upstream knobs that are **not** exposed:

| Upstream parameter | Why |
|---|---|
| `sort=count` | upstream does not order ties deterministically; use `sortByCount: true`, which the wrapper sorts itself |
| `total` | `total` in the output is the length of the parsed list |
| `format=tsv` / `format=csv` | the wrapper always reads JSON; use [`obsidian_exec`](./obsidian_exec.md) for raw formats |

## Output shape

```json
{
  "total": 3,
  "tags": [
    { "name": "project", "count": 4 },
    { "name": "project/alpha", "count": 1 },
    { "name": "réunion", "count": 2 }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `total` | integer ≥ 0 | The number of entries in `tags`. |
| `tags[].name` | string | The tag in **bare form**: exactly one leading `#` removed and nothing else changed. The name can be passed straight to [`tag`](./tag.md). |
| `tags[].count` | integer ≥ 0 | The number of **occurrences** of the tag: inline tags plus frontmatter tags, with no per-note de-duplication. A note that writes `#shared` three times and also lists `shared` in its frontmatter contributes 4. This is **not** the number of notes, which is what [`tag`](./tag.md) counts. |

- With `includeCounts: false`, each entry is `{ "name": "…" }` and the `count` key is absent, not `null`.
- Either every entry has `count` or none does.
- A scope with no tags returns exactly `{ "total": 0, "tags": [] }`. This is a success, not an error.

### Ordering rule

- **Default**: by name, ASCII-case-insensitively. Only `A`–`Z` are folded to lower case for the comparison; the folded names are compared in UTF-8 byte order, and names that fold to the same key are ordered by the UTF-8 bytes of the original name, so upper case comes first. For example, `Banana`, `aardvark`, `Aardvark` sort as **`Aardvark`, `aardvark`, `Banana`**. Non-ASCII letters are never folded: `Élan` sorts after every ASCII name.
- **`sortByCount: true`**: by `count`, highest first; equal counts follow the default order. This still applies when `includeCounts: false` hides the counts.

Upstream's own order is always discarded, so the same vault state gives the same order on every call.

## Scope semantics inherited from upstream

The wrapper passes through exactly what Obsidian reports; it does not merge, split or synthesise tags. Obsidian treats the vault-wide scope and the single-note scopes differently:

| Aspect | Vault-wide | `file` / `path` / `activeOnly` |
|---|---|---|
| Case variants (`Project` / `project`) | merged into one entry under the casing Obsidian met first, with the counts added together | separate entries |
| Hierarchical tags (`#deep/a/b`) | every ancestor is listed (`deep`, `deep/a`, `deep/a/b`), including ancestors no note writes; an ancestor's count includes its descendants' | only the tags actually written in the note |
| Tags inside fenced code blocks or inline code | excluded | excluded |
| Frontmatter tags and inline tags | both counted | both counted |
| Frontmatter tags written with a `#` (`"#hashfm"`) | listed once as `hashfm` | listed once as `hashfm` |
| Non-ASCII names (`café`, `日本語`) | listed and counted like any other tag | listed and counted like any other tag |
| Tags shaped like plugin or built-in markers (`todo`, `excalidraw`, `daily-note`) | ordinary tags, returned as written | ordinary tags, returned as written |

Because the vault-wide scope merges case variants, its result never contains two names that differ only in case; the ordering tie-break is only visible in single-note scopes.

## Worked examples

The examples use a small fixture vault: `Alpha` (frontmatter `[fm-only, Project, shared]`; inline `#shared` three times, `#project`, `#parent/child`, `#café`, `#日本語`, plus `#fencedonly` inside a code block), `Beta` (frontmatter `["#hashfm", shared]`; inline `#Aardvark #aardvark #Banana #parent #shared`), `Gamma` (`#solo/leaf #deep/a/b`) and `Empty` (no tags).

### Example 1 — vault-wide listing with counts

```json
{ "target_mode": "specific", "vault": "Work" }
```

```json
{
  "total": 15,
  "tags": [
    { "name": "Aardvark", "count": 2 },
    { "name": "Banana", "count": 1 },
    { "name": "café", "count": 1 },
    { "name": "deep", "count": 1 },
    { "name": "deep/a", "count": 1 },
    { "name": "deep/a/b", "count": 1 },
    { "name": "fm-only", "count": 1 },
    { "name": "hashfm", "count": 1 },
    { "name": "parent", "count": 2 },
    { "name": "parent/child", "count": 1 },
    { "name": "Project", "count": 2 },
    { "name": "shared", "count": 6 },
    { "name": "solo", "count": 1 },
    { "name": "solo/leaf", "count": 1 },
    { "name": "日本語", "count": 1 }
  ]
}
```

`Aardvark` and `Project` absorb their lower-case variants; `deep`, `deep/a` and `solo` are implied ancestors; `parent` counts Beta's `#parent` plus Alpha's `#parent/child`; `fencedonly` is absent.

### Example 2 — one note by `file`, in active mode

```json
{ "target_mode": "active", "file": "Alpha" }
```

```json
{
  "total": 7,
  "tags": [
    { "name": "café", "count": 1 },
    { "name": "fm-only", "count": 1 },
    { "name": "parent/child", "count": 1 },
    { "name": "Project", "count": 1 },
    { "name": "project", "count": 1 },
    { "name": "shared", "count": 4 },
    { "name": "日本語", "count": 1 }
  ]
}
```

In a single note, `Project` and `project` stay separate, and `parent` is not listed because the note only writes `#parent/child`.

### Example 3 — `sortByCount` with names only

```json
{ "target_mode": "specific", "vault": "Work", "sortByCount": true, "includeCounts": false }
```

```json
{
  "total": 15,
  "tags": [
    { "name": "shared" },
    { "name": "Aardvark" },
    { "name": "parent" },
    { "name": "Project" },
    { "name": "Banana" },
    { "name": "café" },
    { "name": "deep" },
    { "name": "deep/a" },
    { "name": "deep/a/b" },
    { "name": "fm-only" },
    { "name": "hashfm" },
    { "name": "parent/child" },
    { "name": "solo" },
    { "name": "solo/leaf" },
    { "name": "日本語" }
  ]
}
```

The three tags with count 2 follow the default name order among themselves.

### Example 4 — the focused note with `activeOnly`

With `Beta` open in the editor:

```json
{ "target_mode": "active", "activeOnly": true }
```

```json
{
  "total": 6,
  "tags": [
    { "name": "Aardvark", "count": 1 },
    { "name": "aardvark", "count": 1 },
    { "name": "Banana", "count": 1 },
    { "name": "hashfm", "count": 1 },
    { "name": "parent", "count": 1 },
    { "name": "shared", "count": 2 }
  ]
}
```

With no note open, the same call fails with `ERR_NO_ACTIVE_FILE`.

### Example 5 — one note by `path`

```json
{ "target_mode": "specific", "vault": "Work", "path": "Notes/Gamma.md" }
```

```json
{ "total": 2, "tags": [ { "name": "deep/a/b", "count": 1 }, { "name": "solo/leaf", "count": 1 } ] }
```

A note without tags (`"path": "Notes/Empty.md"`) returns `{ "total": 0, "tags": [] }`.

### Example 6 — validation rejection

```json
{ "target_mode": "specific", "vault": "Work", "file": "Alpha", "path": "Notes/Alpha.md" }
```

```json
{
  "code": "VALIDATION_ERROR",
  "message": "tags input failed schema validation",
  "details": {
    "issues": [
      { "path": ["file"], "message": "at most one of `file`, `path`, `activeOnly` may be set", "code": "custom" },
      { "path": ["path"], "message": "at most one of `file`, `path`, `activeOnly` may be set", "code": "custom" }
    ]
  }
}
```

## Errors

No new error codes are introduced. Every failure is an `UpstreamError` with a stable `code`.

### Error roster

| Code | When | Distinguishing details | Recovery |
|---|---|---|---|
| `VALIDATION_ERROR` | Two or more of `file` / `path` / `activeOnly: true`; specific mode without `vault`; active mode with `vault`; an unknown key; a wrong type; an empty `file` or `path`; an unsafe `path` (`..` segment, leading `/` or `\`, drive letter, control characters) | `details.issues[].path` names the offending field(s). No CLI call is made. | Fix the named field. |
| `ERR_NO_ACTIVE_FILE` | `activeOnly: true` and no note is focused in the targeted vault | `details.tool: "tags"`; the dispatch-layer error is kept as `cause` | Focus a note in the editor, or call `tags` with `file` or `path` instead. |
| `CLI_REPORTED_ERROR` | The vault name is not registered | `details.message: "Vault not found."` | Check the vault's display name. |
| `CLI_REPORTED_ERROR` | `file` or `path` does not resolve to a note | `details.stdout` starts with `Error: File "` | Check the note name or path. A missing note is never reported as an empty list. |
| `CLI_REPORTED_ERROR` | Obsidian's reply cannot be read | `details.stage` is `json-parse`, `shape-parse` or `count-parse` | Report it; this means the upstream reply format changed. |
| `CLI_OUTPUT_TOO_LARGE` | The reply is over the 10 MiB output cap | never a truncated list | Scope the call to one note with `file` or `path`. |
| `CLI_TIMEOUT` | The CLI did not answer within 10 s | — | Retry; check that Obsidian is responsive. |
| `CLI_NON_ZERO_EXIT` | The CLI exited with a non-zero code | `details.exitCode` | Check that Obsidian is running. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` binary could not be found | — | Install the Obsidian CLI, or set `OBSIDIAN_BIN`. |

### Unknown keys and client classes

There are two paths by which an unknown top-level key is rejected:

- **Server-side.** A client that forwards unknown keys reaches the server, where the input schema rejects them with `VALIDATION_ERROR` before any CLI call.
- **Client-side.** A client that validates against the published `inputSchema` (`additionalProperties: false`) rejects the call itself, so the server never sees it.

Both outcomes are correct; which one you observe depends on the client.

## Inherited limitations

### Snapshot and staleness

One call reads Obsidian's in-memory metadata cache once. An edit that Obsidian has not yet re-indexed is not reflected: usually that window is under a second after a save, but it can be longer during a bulk external sync. The tool does not retry or reconcile.

### Practical size ceiling

The 10 MiB output cap (10,485,760 bytes) applies to Obsidian's raw reply, not to the wrapper's output.

**Derived from measurement.** A vault-wide call over 2,015 unique tags (2,000 generated tags of 14 bytes each, such as `t068-bulk-0001`, plus a small fixture) returned 112,736 bytes: **about 56 bytes per tag**. Each entry costs a fixed 40 bytes of pretty-printed JSON, plus the tag's UTF-8 length including its `#`, plus the digits of its count. That puts the ceiling at:

- about **187,000** unique tags for names of around 14 bytes (10,485,760 ÷ 56);
- about **140,000–200,000** unique tags for names of 10–30 bytes.

`includeCounts: false` does not raise the ceiling, because the wrapper always asks upstream for counts. Over the ceiling, the call fails with `CLI_OUTPUT_TOO_LARGE`, never with a truncated list; scope the call with `file` or `path`.

### No pagination

The whole listing is returned in one envelope.

### Latency

One CLI round trip (typically 50–200 ms) plus an in-process sort.

## Out of scope

| Not offered | Use instead |
|---|---|
| Renaming, adding or removing tags | not available as a typed tool |
| Listing the notes that carry a tag | [`tag`](./tag.md) |
| Aggregating tags across several vaults | one call per vault |
| Rolling up per-note hierarchical counts on the wrapper side | the vault-wide scope, where Obsidian rolls them up |
| Pagination | scope with `file` or `path` |

## Related tools

- [`tag`](./tag.md) — the notes that carry a given tag.
- [`properties`](./properties.md) — the vault's frontmatter property names.
- [`read_property`](./read_property.md) — one frontmatter value in one note.
