# `links`

## Overview

Return the flat ordered list of every outgoing link in a Markdown note as a typed envelope `{ count, links: [{ target, line, kind, displayText? }] }`. Replaces the agent's previous fallback (full-file `read` + client-side Markdown parse) with a single typed call at one to two orders of magnitude less token cost.

## When to use this tool

| You want to | Reach for |
|---|---|
| Outgoing links from one Markdown note | `links` |
| Inbound links / who links to this note | [`backlinks`](./backlinks.md) |
| Heading structure of one note | [`outline`](./outline.md) |
| One section's body | [`read_heading`](./read_heading.md) |
| Full file body bytes | [`read`](./read.md) |
| Find notes by frontmatter property value | [`find_by_property`](./find_by_property.md) |

## Input contract

`links` consumes the schema below. Every field is rejected at the boundary as `VALIDATION_ERROR` if the constraints fail. Unknown top-level keys are rejected (`additionalProperties: false`).

### Specific mode

```json
{
  "target_mode": "specific",
  "vault": "<vault name>",
  "file": "<wikilink-style name>",
  "path": "<vault-relative path>",
  "total": false
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"specific"` | YES | discriminator |
| `vault` | string | YES | length ≥ 1 |
| `file` | string | XOR | exactly one of `file` / `path` |
| `path` | string | XOR | exactly one of `file` / `path` |
| `total` | boolean | OPTIONAL | defaults to false |

### Active mode

```json
{
  "target_mode": "active",
  "total": false
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"active"` | YES | discriminator |
| `total` | boolean | OPTIONAL | defaults to false |
| `vault` | (n/a) | FORBIDDEN | rejected at the schema layer |
| `file` | (n/a) | FORBIDDEN | rejected at the schema layer |
| `path` | (n/a) | FORBIDDEN | rejected at the schema layer |

### Per-field policy

- **`file`** — wikilink-style file name (the `.md` extension is accepted but not required). Resolved via Obsidian's metadata cache.
- **`path`** — exact vault-relative path. Path-traversal patterns (`../escape.md`, absolute paths) are looked up against Obsidian's index, which uses vault-relative keys without `..` resolution — the lookup returns null and the wrapper surfaces `CLI_REPORTED_ERROR(FILE_NOT_FOUND)`. No filesystem mutation occurs outside the vault.
- **`total`** — when `true`, the response carries `links: []` with `count` set to the total outgoing-link entry count. The `count` is identical between `total: false` and `total: true` for the same note state at the same instant.

## Output shape

Uniform envelope across both modes (the only difference is whether `links` is populated).

### Default mode (`total !== true`)

```json
{
  "count": 4,
  "links": [
    { "target": "Other-Note",         "line": 1, "kind": "wikilink" },
    { "target": "Roadmap",            "line": 5, "kind": "wikilink" },
    { "target": "diagrams/system.png","line": 7, "kind": "embed" },
    { "target": "Other-Note.md",      "line": 9, "kind": "markdown", "displayText": "See Other" }
  ]
}
```

### Count-only mode (`total: true`)

```json
{ "count": 4, "links": [] }
```

| Field | Type | Description |
|-------|------|-------------|
| `count` | integer ≥ 0 | Total outgoing-link entry count. Identical across both `total` branches for the same source file. |
| `links` | array | One entry per occurrence in source order. Populated in default mode; always `[]` in count-only mode. |
| `links[].target` | string | Link target byte-faithful to source. Heading and block fragments are EMBEDDED in the string (e.g. `"Target#Heading"`, `"Target#^block-id"`); no separate `fragment` field. |
| `links[].line` | integer ≥ 1 | 1-based source line. Body link/embed entries: source position from Obsidian's metadata cache. Frontmatter-declared link entries: synthetic `line: 1` (the cache has no per-entry position data for frontmatter links). |
| `links[].kind` | enum | Closed three-value enum: `"wikilink"` (body `[[…]]` AND frontmatter wikilinks AND wiki embeds-without-`!`), `"embed"` (body `![[…]]` AND `![alt](…)`), `"markdown"` (body `[text](…)` to vault-internal targets). Bare URLs in body prose are NOT surfaced. |
| `links[].displayText` | string OPTIONAL | Present when the source carries an alias distinct from `target`. **CAVEAT**: for fragment-bearing wikilinks (`[[Target#Heading]]`, `[[Target#^block-id]]`) without an explicit `\|alias`, Obsidian auto-populates `displayText` with a `"<file> > <fragment>"` shape. Bare wikilinks (`[[Roadmap]]`) and wiki embeds (`![[diagrams/x.png]]`) omit the field. Callers wanting strict "absent when no source alias" semantics should treat fragment-bearing entries as a special case: `entry.target.includes("#") && /^.+ > .+$/.test(entry.displayText)` indicates an auto-derived value, not a real alias. |

### Per-occurrence semantic

Every textual occurrence of an outgoing link is a separate entry. A note that references `[[Apple]]` twice on different lines produces TWO entries. A note that references `[[Apple]]` twice on the same line produces TWO entries, ordered left-to-right via an internal column tiebreak (column position is not surfaced).

### Source-order sort

Entries are sorted by `(line ascending, column ascending)`. Frontmatter-declared entries carry synthetic `line: 1` and therefore appear first; body entries follow in source order. Within the frontmatter cohort, entries appear in upstream declaration order.

### Empty-link notes

A `.md` note with no outgoing links returns `{ count: 0, links: [] }` in both modes.

## Worked examples

### Example 1 — Specific mode, multi-link note by path

```json
{
  "name": "links",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "Projects/brief.md"
  }
}
```

Example response:

```json
{
  "count": 5,
  "links": [
    { "target": "Other-Note",          "line": 1, "kind": "wikilink" },
    { "target": "Roadmap",             "line": 4, "kind": "wikilink" },
    { "target": "Glossary",            "line": 4, "kind": "wikilink", "displayText": "Terms" },
    { "target": "diagrams/system.png", "line": 7, "kind": "embed" },
    { "target": "Other-Note.md",       "line": 9, "kind": "markdown", "displayText": "See Other" }
  ]
}
```

The first entry (`Other-Note` at `line: 1`) is a frontmatter-declared wikilink; lines 4–9 are body links/embeds.

### Example 2 — Specific mode by wikilink basename

```json
{
  "name": "links",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "file": "brief"
  }
}
```

Structurally equivalent to Example 1 when `brief` resolves unambiguously to the same note. When the basename matches multiple files, Obsidian's wikilink-resolution semantics decide which file (the wrapper does NOT impose disambiguation).

### Example 3 — Active mode, focused note

```json
{
  "name": "links",
  "arguments": { "target_mode": "active" }
}
```

Resolves the currently-focused note. When no note is focused, the response is `ERR_NO_ACTIVE_FILE`.

### Example 4 — Count-only, multi-link file

```json
{
  "name": "links",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "Projects/brief.md",
    "total": true
  }
}
```

Response:

```json
{ "count": 5, "links": [] }
```

Use this for token-economical pre-flight reads (size estimation, fan-out check, whether the note has any links at all).

### Example 5 — Unresolved path (file not found)

```json
{
  "name": "links",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "Missing.md"
  }
}
```

Response:

```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "{\"code\":\"CLI_REPORTED_ERROR\",\"message\":\"links: file not found (path: Missing.md)\",\"details\":{\"stage\":\"envelope-error\",\"code\":\"FILE_NOT_FOUND\",\"detail\":\"path: Missing.md\"}}" }]
}
```

### Example 6 — Non-Markdown filetype rejection

```json
{
  "name": "links",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "Whiteboards/Architecture.canvas"
  }
}
```

Returns `CLI_REPORTED_ERROR(stage:'envelope-error', code:'NOT_MARKDOWN')`. Use [`read`](./read.md) for non-Markdown file contents.

## Frontmatter-link inclusion

Frontmatter-declared wikilinks appear in the listing alongside body links, intermingled in source order via `line`. Examples:

```yaml
---
related: "[[Project]]"
tags:
  - "[[Topic-A]]"
  - "[[Topic-B]]"
---
```

All three entries (`Project`, `Topic-A`, `Topic-B`) appear in the response with `line: 1` and `kind: "wikilink"`, identical classification to body wikilinks. No `source: "frontmatter" | "body"` discriminator is surfaced — the agent can infer by the `line: 1` ordering relative to body entries, but the contract makes no commitment.

## Out-of-scope surfaces

- **Bare URLs in body prose** (e.g. `https://example.org` in a paragraph) — NOT surfaced. Obsidian classifies them as body content, not links.
- **Heading / block fragment as a separate field** — EMBEDDED in `target` byte-faithful (e.g. `"Target#Heading"`, `"Target#^block-id"`).
- **Per-entry column position** — NOT surfaced.
- **`source: "frontmatter" | "body"` discriminator** — NOT surfaced.
- **`resolved: boolean` broken-link detection** — NOT surfaced.
- **`original` raw-source-span** — NOT surfaced.
- **Inbound links / backlinks** — use [`backlinks`](./backlinks.md).
- **Multi-hop traversal** — single-hop only; callers compose.
- **Vault-wide link inventory** — one note at a time; compose with [`paths`](./paths.md) or [`files`](./files.md).
- **Canonical-path resolution** — `target` is byte-faithful to source; callers resolve.
- **Request-side filter / sort** — callers filter / re-sort client-side.

## Error roster

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed the schema (missing `target_mode`, missing `vault` in specific mode, neither `file` nor `path` in specific mode, both `file` AND `path` in specific mode, `vault`/`file`/`path` in active mode, `total` non-boolean, unknown top-level key, `vault` empty). | Retry with corrected input. `details.issues` carries per-issue `path` + `message` + zod code. |
| `CLI_REPORTED_ERROR` (`details.code: "VAULT_NOT_FOUND"`) | Specific mode + `vault` not registered. | Supply a registered vault display name. Unknown vault names emit `CLI_REPORTED_ERROR` — the wrapper does NOT silently route to the focused vault. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "FILE_NOT_FOUND"`) | `path` does not match any file in the vault, OR `file` (basename) does not resolve. `details.detail` distinguishes (`path: <path>` vs `wikilink: <file>`). | Verify the path / basename; check for typos; confirm the vault contains the file. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "NOT_MARKDOWN"`) | The resolved file's extension is not `.md`. | Use [`read`](./read.md) for non-Markdown file contents. |
| `ERR_NO_ACTIVE_FILE` | `target_mode: "active"` was used but no Obsidian note is focused. | Ask the user to open a note in Obsidian, OR call again with `target_mode: "specific"` and an explicit `vault` + `file`/`path`. |
| `CLI_REPORTED_ERROR` (`details.stage: "json-parse"` or `"envelope-parse"`) | Upstream output was unparseable or the envelope schema mismatched. | Investigate as a regression. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (typical cause: output-cap kill on pathologically large link lists, tens of thousands of links). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Use `total: true` to bypass the cap-risk entirely. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN`. |

## Inherited limitations

### Output-cap ceiling

Very long link lists (tens of thousands of links per note) may exceed the 10 MiB output cap and surface as `CLI_NON_ZERO_EXIT`. The `total: true` mode bypasses this risk entirely — the per-entry JSON is suppressed.

### Latency

Approximately 80–200 ms per call. All invocations serialise through the wrapper's single-in-flight queue.

### Multi-vault basename ambiguity

Multi-vault setups suffer from basename ambiguity — two vaults sharing the same display name are indistinguishable by the `vault=` argument. **Recommendation**: open the target vault in Obsidian before invoking `links`.
