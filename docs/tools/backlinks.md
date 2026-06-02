# `backlinks`

## Overview

Return the flat ordered list of every source note that references a target Markdown note, as a typed envelope `{ count, backlinks: [{ source, count? }], truncated? }`. Inverse of the outgoing-links sibling [`links`](./links.md) — together the two surfaces give complete 1-hop link-graph reads from any note. Replaces the agent's previous fallback (vault-wide body-text `search` for the target's name) at one to two orders of magnitude less token cost.

## When to use this tool

| You want to | Reach for |
|---|---|
| Inbound links / who links to this note | `backlinks` |
| Outgoing links from this note | [`links`](./links.md) |
| Heading structure of a note | [`outline`](./outline.md) |
| One section's body | [`read_heading`](./read_heading.md) |
| Full file body bytes | [`read`](./read.md) |
| Line-with-context near a literal phrase | [`context_search`](./context_search.md) |
| Find notes by frontmatter property value | [`find_by_property`](./find_by_property.md) |

## Input contract

`backlinks` consumes the schema below. Every field is rejected at the boundary as `VALIDATION_ERROR` if the constraints fail. Unknown top-level keys are rejected (`additionalProperties: false`).

### Specific mode

```json
{
  "target_mode": "specific",
  "vault": "<vault name>",
  "file": "<wikilink-style name>",
  "path": "<vault-relative path>",
  "with_counts": false,
  "total": false,
  "limit": 1000
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"specific"` | YES | discriminator |
| `vault` | string | YES | length ≥ 1 |
| `file` | string | XOR | exactly one of `file` / `path` |
| `path` | string | XOR | exactly one of `file` / `path` |
| `with_counts` | boolean | OPTIONAL | defaults to false |
| `total` | boolean | OPTIONAL | defaults to false |
| `limit` | integer | OPTIONAL | 1..10000 inclusive; defaults to implicit 1000 cap |

### Active mode

```json
{
  "target_mode": "active",
  "with_counts": false,
  "total": false,
  "limit": 1000
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"active"` | YES | discriminator |
| `with_counts` | boolean | OPTIONAL | defaults to false |
| `total` | boolean | OPTIONAL | defaults to false |
| `limit` | integer | OPTIONAL | 1..10000 inclusive |
| `vault` | (n/a) | FORBIDDEN | rejected at the schema layer |
| `file` | (n/a) | FORBIDDEN | rejected at the schema layer |
| `path` | (n/a) | FORBIDDEN | rejected at the schema layer |

### Per-field policy

- **`file`** — wikilink-style file name. The `.md` extension is accepted but not required.
- **`path`** — exact vault-relative path. Path-traversal patterns (`../escape.md`, absolute paths) resolve to a non-existent file and surface `CLI_REPORTED_ERROR(FILE_NOT_FOUND)`. No filesystem mutation occurs outside the vault.
- **`with_counts`** — when `true`, each per-source entry in `backlinks[]` carries an integer `count` aggregating all references from that source (body wikilinks + body markdown links + body embeds + frontmatter wikilinks contribute uniformly).
- **`total`** — when `true`, the response carries `backlinks: []` with `count` set to the full source-note count. **`total: true` BYPASSES the implicit 1000-source cap** and reports the pre-cap count (use this for outsized vaults where the entry-list mode would clip and you only need the headline number).
- **`limit`** — overrides the implicit 1000-source cap on `backlinks.length`. Only applies in entry-list modes (`total !== true`). Out-of-range values (`0`, negative, `> 10000`, non-integer) are rejected at the schema.

## Output shape

Uniform envelope across all modes; `backlinks` array population and `truncated` presence vary.

### Default mode (no counts, no total)

```json
{
  "count": 3,
  "backlinks": [
    { "source": "Notes/Alpha.md" },
    { "source": "Notes/Beta.md" },
    { "source": "Projects/Gamma.md" }
  ]
}
```

### With per-source counts (`with_counts: true`)

```json
{
  "count": 3,
  "backlinks": [
    { "source": "Notes/Alpha.md", "count": 1 },
    { "source": "Notes/Beta.md", "count": 5 },
    { "source": "Projects/Gamma.md", "count": 2 }
  ]
}
```

### Count-only mode (`total: true`)

```json
{ "count": 3, "backlinks": [] }
```

### Truncated (default / `with_counts: true`; NEVER under `total: true`)

```json
{
  "count": 1000,
  "backlinks": [ /* 1000 entries */ ],
  "truncated": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `count` | integer ≥ 0 | Source-note count. Equals `backlinks.length` in entry-list modes. Equals the FULL pre-cap source count under `total: true`. |
| `backlinks` | array | One entry per source note (NOT per occurrence — multiplicity goes into `count` under `with_counts: true`). Sorted by source path (UTF-16 ascending). Empty array under `total: true`. |
| `backlinks[].source` | string | Vault-relative path of the source note. Always `.md` (`.canvas` / `.base` / plugin-config / attachment sources excluded). |
| `backlinks[].count` | integer ≥ 1 OPTIONAL | Total reference count from this source to the target (body + frontmatter combined). Present only under `with_counts: true`. Never `0` — sources only appear when they reference the target at least once. |
| `truncated` | `true` OPTIONAL | Present only when the underlying source set exceeded the applied cap AND `total: false`. When present, the response carries the **FIRST `<cap>` entries** of the sorted source list (the **leading** subset). Sort key: `source` path UTF-16 ascending. |

### Cross-folder reach

When a target note's filename basename is **unique vault-wide**, `backlinks` returns every cross-folder source that references the target via the bare-basename wikilink syntax `[[<basename>]]`, NOT only sources in the same folder as the target. This is because Obsidian's wikilink resolver is vault-scoped, not folder-scoped, when the basename is unique.

**Basename-uniqueness gate**: Obsidian's wikilink resolver is case-insensitive at the basename level. When two notes share a case-folded basename (e.g. `target.md` and `Target.md` in different folders), the resolver picks a single canonical destination for `[[target]]`, and the non-canonical sibling receives zero backlinks via that bare-basename wikilink. Debugging zero-backlink responses on a note whose basename collides with a sibling: add a folder-prefixed wikilink (`[[Folder/target]]`) or rename the colliding files.

**Folder-scoped recovery**: Agents writing folder-scoped recovery logic against the returned source list must filter the result themselves — for example, by keeping only sources whose `source` field shares a path prefix with the target.

### Per-source aggregation semantic

Each source note appears in `backlinks[]` AT MOST ONCE — multiplicity goes into the per-source `count` under `with_counts: true`. A source note that references the target via three body wikilinks plus one frontmatter wikilink produces ONE entry with `count: 4`. A source that references the target once produces ONE entry with `count: 1` (or no `count` field when `with_counts: false`).

### Source-path sort

Entries are sorted by `source` ascending (UTF-16 code-unit lexicographic). Deterministic across repeated calls on an unchanged vault state.

### Empty backlinks list

A `.md` note with no incoming references returns `{ count: 0, backlinks: [] }` in all modes. No error, no sentinel — empty is the normal observable.

## Worked examples

### Example 1 — Specific mode, popular target

```json
{
  "name": "backlinks",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "Concepts/Modular-Code.md"
  }
}
```

```json
{
  "count": 4,
  "backlinks": [
    { "source": "Notes/Alpha.md" },
    { "source": "Notes/Beta.md" },
    { "source": "Projects/Gamma.md" },
    { "source": "Reviews/Q1-Roadmap.md" }
  ]
}
```

### Example 2 — Active mode, focused note

```json
{
  "name": "backlinks",
  "arguments": { "target_mode": "active" }
}
```

Resolves the currently-focused note. When no note is focused, the response is `ERR_NO_ACTIVE_FILE`.

### Example 3 — With per-source counts

```json
{
  "name": "backlinks",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "Concepts/Modular-Code.md",
    "with_counts": true
  }
}
```

```json
{
  "count": 4,
  "backlinks": [
    { "source": "Notes/Alpha.md", "count": 1 },
    { "source": "Notes/Beta.md", "count": 6 },
    { "source": "Projects/Gamma.md", "count": 2 },
    { "source": "Reviews/Q1-Roadmap.md", "count": 1 }
  ]
}
```

### Example 4 — Count-only with cap bypass

```json
{
  "name": "backlinks",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "Hubs/PKM.md",
    "total": true
  }
}
```

For a hub note referenced by 1,500 sources:

```json
{ "count": 1500, "backlinks": [] }
```

The `truncated` field is ABSENT — count-only mode does not clip. Use this for token-economical pre-flight reads.

### Example 5 — Capped with truncation signal

```json
{
  "name": "backlinks",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "Hubs/PKM.md",
    "limit": 50
  }
}
```

Returns the first 50 sources (UTF-16-ascending) AND signals truncation:

```json
{
  "count": 50,
  "backlinks": [ /* 50 entries */ ],
  "truncated": true
}
```

### Example 6 — Unresolved path (file not found)

```json
{
  "name": "backlinks",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "Missing.md"
  }
}
```

```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "{\"code\":\"CLI_REPORTED_ERROR\",\"message\":\"backlinks: file not found (path: Missing.md)\",\"details\":{\"stage\":\"envelope-error\",\"code\":\"FILE_NOT_FOUND\",\"detail\":\"path: Missing.md\"}}" }]
}
```

### Example 7 — Non-Markdown target rejection

```json
{
  "name": "backlinks",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "Whiteboards/Architecture.canvas"
  }
}
```

Returns `CLI_REPORTED_ERROR(stage:'envelope-error', code:'NOT_MARKDOWN')`. Use [`read`](./read.md) for non-Markdown file contents.

## Source-corpus restriction

The source corpus is restricted to `.md` files only (case-insensitive extension match — `.md`, `.MD`, `.Md` accepted). Sources stored as `.canvas`, `.base`, plugin configurations, or attachments are EXCLUDED from the response even if Obsidian's combined backlinks cache lists them.

## Self-reference inclusion

A target note that references itself (e.g. via `[[self-target]]` in its own body or frontmatter) appears in its own backlinks list. This matches Obsidian's "Backlinks" pane semantic. Callers that want external-only backlinks filter the response client-side by comparing each `source` to the input `path` / `file`.

## Frontmatter-link inclusion

Frontmatter-declared wikilinks contribute to per-source `count` (under `with_counts: true`) UNIFORMLY with body wikilinks. A source note that declares the target in BOTH its frontmatter (`related: "[[target]]"`) AND its body (`Reference to [[target]] here.`) appears as ONE entry with `count: 2`.

## Alias attribution

Aliased wikilinks (`[[Target|Display]]`) are attributed to the resolved target, NOT the alias text. A source containing `[[Concepts/Modular-Code|MoCo]]` contributes to the `backlinks` of `Concepts/Modular-Code.md`. The alias `MoCo` is NEVER surfaced in the response.

## Code-block exclusion

References inside fenced or indented code blocks are EXCLUDED from the cache. A documentation note that contains only ` ```[[example-target]]``` ` does NOT appear in `example-target`'s backlinks.

## Error roster

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed the schema (missing `target_mode`, missing `vault` in specific mode, neither `file` nor `path` in specific mode, both `file` AND `path` in specific mode, `vault`/`file`/`path` in active mode, `with_counts`/`total` non-boolean, `limit` out of `1..10000` or non-integer, unknown top-level key, `vault` empty). | Retry with corrected input. `details.issues` carries per-issue `path` + `message` + zod code. |
| `CLI_REPORTED_ERROR` (`details.code: "VAULT_NOT_FOUND"`) | Specific mode + `vault` not registered. | Supply a registered vault display name. The wrapper does NOT silently route to the focused vault. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "FILE_NOT_FOUND"`) | `path` does not match any file in the vault, OR `file` (basename) does not resolve. `details.detail` distinguishes (`path: <path>` vs `wikilink: <file>`). | Verify the path / basename; check for typos; confirm the vault contains the file. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "NOT_MARKDOWN"`) | The resolved target file's extension is not `.md`. | Use [`read`](./read.md) for non-Markdown file contents. |
| `ERR_NO_ACTIVE_FILE` | `target_mode: "active"` was used but no Obsidian note is focused. | Ask the user to open a note in Obsidian, OR call again with `target_mode: "specific"` and an explicit `vault` + `file`/`path`. |
| `CLI_REPORTED_ERROR` (`details.stage: "json-parse"` or `"envelope-parse"`) | Upstream output was unparseable or the envelope schema mismatched. | Investigate as a regression. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (typical cause: output-cap kill on pathologically large source lists exceeding the 10 MiB stdout cap). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Use `total: true` to bypass the cap-risk entirely. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN`. |

## Out-of-scope surfaces

- **Per-occurrence enumeration** — `backlinks` aggregates per-source. To inspect per-occurrence line / column / context, read the source note via [`read`](./read.md) and parse client-side.
- **Source-side text snippets** — NOT surfaced. Use [`context_search`](./context_search.md) for line-context near a literal phrase.
- **Multi-hop traversal** — single-hop only; callers compose for multi-hop graph traversal.
- **Vault-wide inbound-reference inventory** — one target at a time; compose with [`paths`](./paths.md) or [`files`](./files.md).
- **Canonical-path resolution** — `source` is byte-faithful to Obsidian's vault-relative key; callers resolve.
- **Request-side filter / sort** — callers filter / re-sort client-side.

## Inherited limitations

### Implicit 1000-source cap + `truncated` signal

The default cap on `backlinks.length` is 1000 sources. When the underlying source set exceeds the applied cap (default 1000 OR the explicit `limit` value), the response carries `truncated: true` and the entry list is sliced to the cap (leading subset by source-path UTF-16 sort). The `truncated` flag is NEVER present under `total: true`.

For hub notes referenced by thousands of sources where you need only the count, use `total: true` to bypass the cap entirely.

### Output-cap ceiling

Very long source lists with pathologically long path strings may still exceed the 10 MiB output cap and surface as `CLI_NON_ZERO_EXIT`. The `total: true` mode bypasses this risk entirely — the per-entry JSON is suppressed.

### Multi-vault basename ambiguity

Multi-vault setups can still suffer from basename ambiguity: two vaults sharing the **same display name** are indistinguishable by the `vault=` argument, so a call may resolve to the wrong same-named vault. This is a genuine name-collision limit, and **focusing a vault neither fixes it nor is required for routing** — a specific-mode `vault=` read routes into the named vault even when that vault is open but unfocused (verified live per-tool by the BI-0134 forcing gate — [t0-probe-findings.md](../../specs/062-verify-cross-vault-routing/contracts/t0-probe-findings.md)). To disambiguate, give the colliding vaults distinct display names.

### Latency

Approximately 80–200 ms per call. All invocations serialise through the wrapper's single-in-flight queue.
