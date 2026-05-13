# `links`

## Overview

Return the flat ordered list of every outgoing link in a Markdown note
as a typed envelope
`{ count, links: [{ target, line, kind, displayText? }] }`. The
project's first **link-graph** primitive — where `outline` (BI-023)
surfaces the heading skeleton and `read_heading` (BI-015) returns a
single section's body, `links` surfaces the outgoing-link inventory.
The agent's previous fallback (full-file `read` + client-side
Markdown parse) is replaced by a single typed call at one to two
orders of magnitude less token cost.

Wraps the Obsidian CLI's `eval` subcommand under the hood — the
native `links` subcommand is plain-text-only with no structured
output, so the wrapper routes through
`app.metadataCache.getFileCache(file).{links,embeds,frontmatterLinks}`
to produce the locked per-entry shape. The agent does not need to
know this — the call surface is a typed MCP tool.

The tool supports two target modes:

- **specific** — name the vault and exactly one of `file` (wikilink)
  or `path` (vault-relative path).
- **active** — operate on the currently focused note in the focused
  vault. No `vault`, `file`, or `path` argument is permitted.

The discriminator is `target_mode`. The schema composes the
[target-mode primitive](../../specs/004-target-mode-schema/spec.md)
with the standard file-scoped refinement (vault-required-in-specific,
file/path XOR in specific, vault/file/path forbidden in active). A
single optional `total` boolean field layers on top to switch the
tool into count-only mode.

## Input contract

`links` consumes the schema below. Every field is rejected at the
boundary as `VALIDATION_ERROR` if the constraints fail. Unknown
top-level keys are rejected (`additionalProperties: false`).

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

- **`file`** — wikilink-style file name (resolved inside the eval JS
  via `app.metadataCache.getFirstLinkpathDest`). The `.md` extension
  is accepted but not required.
- **`path`** — exact vault-relative path. Path-traversal patterns
  (`../escape.md`, absolute paths) are looked up against
  `app.vault.getFiles()` — Obsidian's index uses vault-relative keys
  without `..` resolution, so the lookup returns null and the wrapper
  surfaces `CLI_REPORTED_ERROR(FILE_NOT_FOUND)`. No filesystem
  mutation occurs outside the vault.
- **`total`** — when `true`, the response carries `links: []` with
  `count` set to the total outgoing-link entry count. The `count` is
  identical between `total: false` and `total: true` for the same
  note state at the same instant (cross-mode invariant, FR-005a).

## Output shape

Uniform envelope across both modes (the only difference is whether
`links` is populated).

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
| `links[].line` | integer ≥ 1 | 1-based source line. Body link/embed entries: source position from Obsidian's metadataCache. Frontmatter-declared link entries: synthetic `line: 1` (the cache has no per-entry position data for frontmatterLinks). |
| `links[].kind` | enum | Closed three-value enum: `"wikilink"` (body `[[…]]` AND frontmatter wikilinks AND wiki embeds-without-`!`), `"embed"` (body `![[…]]` AND `![alt](…)`), `"markdown"` (body `[text](…)` to vault-internal targets). Bare URLs in body prose are NOT surfaced. |
| `links[].displayText` | string OPTIONAL | Present ONLY when the source carries an alias distinct from `target`. For bare wikilinks (`[[Roadmap]]`) and wiki embeds (`![[diagrams/x.png]]`) the field is OMITTED. |

### Per-occurrence semantic

Every textual occurrence of an outgoing link is a separate entry. A
note that references `[[Apple]]` twice on different lines produces
TWO entries. A note that references `[[Apple]]` twice on the same
line produces TWO entries, ordered left-to-right via an internal
column tiebreak (the column position is not surfaced in the public
shape per Q5 — it's an internal-only sort key).

### Source-order sort

Entries are sorted by `(line ascending, column ascending)`.
Frontmatter-declared entries carry synthetic `line: 1` and therefore
appear first; body entries follow in source order. Within the
frontmatter cohort, entries appear in upstream `frontmatterLinks[]`
array order (typically declaration order, including list-of-wikilinks
property values).

### Empty-link notes

A `.md` note with no outgoing links returns `{ count: 0, links: [] }`
in both modes via the defensive `|| []` coalescing on each of
`frontmatterLinks` / `links` / `embeds`. No sentinel detection is
required.

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

Fires one `invokeCli` (`obsidian vault=Demo eval code=<rendered-js>`).
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

The first entry (`Other-Note` at `line: 1`) is a
frontmatter-declared wikilink; lines 4–9 are body links/embeds.

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

Structurally equivalent to Example 1 when `brief` resolves
unambiguously to the same note via
`app.metadataCache.getFirstLinkpathDest("brief", "")`. When the
basename matches multiple files, Obsidian's wikilink-resolution
semantics decide which file (the wrapper does NOT impose
disambiguation).

### Example 3 — Active mode, focused note

```json
{
  "name": "links",
  "arguments": { "target_mode": "active" }
}
```

Fires one `invokeCli` (`obsidian eval code=<rendered-js>` — no
`vault=`). The eval resolves the file via
`app.workspace.getActiveFile()`. When no note is focused, the
response is a structured `ERR_NO_ACTIVE_FILE` error.

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

Same single eval invocation as Example 1; the envelope branch on
`a.total` inside the eval JS suppresses the per-entry list. Response:

```json
{ "count": 5, "links": [] }
```

Use this for token-economical pre-flight reads (size estimation,
fan-out check, whether the note has any links at all).

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

The eval's `app.vault.getFiles().find(...)` returns null. Response:

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

The eval's `f.extension === 'md'` guard fires and returns an
envelope `NOT_MARKDOWN`. The wrapper maps to
`CLI_REPORTED_ERROR(stage:'envelope-error', code:'NOT_MARKDOWN')`.

## Error roster

All failure surfaces flow through `UpstreamError` per Constitution
Principle IV. `links` introduces **zero new error codes**.

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed the schema (missing `target_mode`, missing `vault` in specific mode, neither `file` nor `path` in specific mode, both `file` AND `path` in specific mode, `vault`/`file`/`path` in active mode, `total` non-boolean, unknown top-level key, `vault` empty). | Agent retries with corrected input. `details.issues` carries per-issue `path` + `message` + zod code. |
| `CLI_REPORTED_ERROR` (`details.code: "VAULT_NOT_FOUND"`) | Specific mode + `vault` not registered. Upstream emits `Vault not found.` and the cli-adapter's 011-R5 inspection clause reclassifies. | Supply a registered vault display name. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "FILE_NOT_FOUND"`) | `path` does not match any file in the vault, OR `file` (basename) does not resolve via `getFirstLinkpathDest`. `details.detail` distinguishes (`path: <path>` vs `wikilink: <file>`). | Verify the path / basename; check for typos; confirm the vault contains the file. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "NOT_MARKDOWN"`) | The resolved file's extension is not `.md` (e.g. `.canvas`, `.pdf`, attachments). | Use a different tool, or read the source bytes via `read`. |
| `ERR_NO_ACTIVE_FILE` | `target_mode: "active"` was used but no Obsidian note is focused. The eval surfaces `NO_ACTIVE_FILE` envelope and the wrapper maps to this code. | Operator-side: open a note in Obsidian, OR call again with `target_mode: "specific"` and an explicit `vault` + `file`/`path`. |
| `CLI_REPORTED_ERROR` (`details.stage: "json-parse"`) | Stage-0 JSON parse on the eval stdout failed. Catch-all for upstream eval misbehaviour. | Investigate as a regression — the upstream contract was stable per plan-stage F1/F2/F4/F5/F6. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-parse"`) | Stage-1 envelope-schema validation failed. Catch-all for unexpected envelope keys (e.g. upstream version drift in metadataCache shape). | Investigate as a regression. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (typical cause: output-cap kill on pathologically large link lists, tens of thousands of links). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Use `total: true` to bypass the cap-risk entirely. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |

The canonical errors contract is at
[specs/001-add-cli-bridge/contracts/errors.contract.md](../../specs/001-add-cli-bridge/contracts/errors.contract.md);
`links` propagates the adapter's classification verbatim with no
rewrites beyond the two parse-failure stages and the three
envelope-error mappings documented above.

## Multi-vault structured-error contract

Unlike `outline` (BI-023), `properties` (BI-024), and `files`
(BI-019) — where the upstream CLI silently honours `vault=` as a
noop for the native subcommand — the `eval` subcommand DOES emit
`Vault not found.` (plain text, exit 0) for an unregistered vault
display name. The cli-adapter's 011-R5 unknown-vault response-
inspection clause fires and reclassifies the response to
`CLI_REPORTED_ERROR(code: 'VAULT_NOT_FOUND')`.

Multi-vault callers MUST supply a registered display name; the
wrapper will NOT silently route to the focused vault for an
unrecognised name. This is the same contract as
[read_heading](./read_heading.md) and
[find_by_property](./find_by_property.md), both of which compose
against `eval`.

## Frontmatter-link inclusion

Frontmatter-declared wikilinks appear in the listing alongside body
links, intermingled in source order via `line`. Examples:

```yaml
---
related: "[[Project]]"
tags:
  - "[[Topic-A]]"
  - "[[Topic-B]]"
---
```

All three entries (`Project`, `Topic-A`, `Topic-B`) appear in the
response with `line: 1` and `kind: "wikilink"`, identical
classification to body wikilinks. No `source: "frontmatter" | "body"`
discriminator is surfaced; callers cannot distinguish frontmatter
from body entries purely by the public shape (the agent can infer by
the `line: 1` ordering relative to body entries, but the contract
makes no commitment).

## Out-of-scope surfaces

- **Bare URLs in body prose** (e.g. `https://example.org` in a
  paragraph) — NOT surfaced. Obsidian classifies them as body
  content, not links; the wrapper inherits this classification.
- **Heading / block fragment as a separate field** — EMBEDDED in
  `target` byte-faithful (e.g. `"Target#Heading"`,
  `"Target#^block-id"`).
- **Per-entry column position** — INTERNAL-ONLY sort key; NOT
  surfaced.
- **`source: "frontmatter" | "body"` discriminator** — NOT surfaced;
  frontmatter and body entries share the same shape.
- **`resolved: boolean` broken-link detection** — NOT surfaced.
- **`original` raw-source-span** — NOT surfaced.
- **Inbound links / backlinks** — separate primitive (future
  `backlinks` typed tool).
- **Multi-hop traversal** — single-hop only; callers compose.
- **Vault-wide link inventory** — one note at a time; callers compose
  with `files`.
- **Canonical-path resolution** — `target` is byte-faithful to
  source; callers resolve.
- **Request-side filter / sort** — callers filter / re-sort
  client-side.

## Inherited limitations

### Output-cap ceiling

Very long link lists (tens of thousands of links per note) may
exceed the cli-adapter's 10 MiB output cap and surface as
`CLI_NON_ZERO_EXIT`. The `total: true` mode bypasses this risk
entirely — the envelope inside the eval emits `links: []` when
`total` is set, so the per-entry JSON does not contribute to stdout
size.

### Single-call architecture

Each MCP request fires exactly ONE `invokeCli` invocation regardless
of `target_mode` or `total`. The count-only branch lives inside the
eval JS at the envelope-emission step. End-to-end latency is
approximately 1× a single-call typed tool (~80–200 ms typical). All
invocations serialise through the project's single-in-flight queue.

### Anti-injection guarantee

User inputs (`vault`, `file`, `path`, `target_mode`, `total`) flow
through a base64-encoded JSON payload substituted into a frozen JS
template at exactly one substitution point (`__PAYLOAD_B64__`). The
JS source itself never contains user-supplied text. At runtime the
eval JS decodes the payload via `atob()` + `JSON.parse(...)`. The
base64 alphabet (`[A-Za-z0-9+/=]`) contains no characters with shell
meaning, so the substituted payload cannot break out of the
`code=...` parameter. Parity with
[read_heading](./read_heading.md) and
[find_by_property](./find_by_property.md).

## Related tools

- [outline](./outline.md) — the heading skeleton for the same note;
  pairs with `links` for full structural discovery (outline first to
  see the section list, then `links` for the outgoing references).
- [read](./read.md) — full file content; use when you need the body
  bytes, not just the link inventory.
- [read_heading](./read_heading.md) — body of a single named heading.
- [find_by_property](./find_by_property.md) — frontmatter property
  search across the vault; the inverse direction (find notes by
  frontmatter content, vs `links` which lists outgoing references
  from one note).
- [obsidian_exec](./obsidian_exec.md) — freeform escape hatch when
  the wrapper's shape is insufficient.

## References

- [025-list-links spec](../../specs/025-list-links/spec.md) —
  feature spec; clarifications session 2026-05-13 (Q1 displayText
  absent-when-no-alias, Q2 fragment embedded in target, Q3 closed
  three-value kind enum, Q4 frontmatter-link inclusion, Q5 column
  not surfaced).
- [025-list-links research](../../specs/025-list-links/research.md)
  — R1–R14 design decisions, F1–F14 live findings, T0 capture.
- [025-list-links data-model](../../specs/025-list-links/data-model.md)
  — schema shapes, JS template, base64 payload, per-tool invariants,
  test inventory (51 cases).
- [errors contract](../../specs/001-add-cli-bridge/contracts/errors.contract.md)
  — canonical roster of `UpstreamError` codes.
- [target-mode primitive spec](../../specs/004-target-mode-schema/spec.md)
  — shared discriminator the input schema composes via the
  standard file-scoped refinement.
- [help tool spec](../../specs/005-help-tool/spec.md) — the
  schema-stripping contract and `help({ tool_name })` lookup that
  surfaces this document.
