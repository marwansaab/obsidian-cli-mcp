# `backlinks`

## Overview

Return the flat ordered list of every source note that references a target Markdown note, as a typed envelope `{ count, backlinks: [{ source, count? }], truncated? }`. Inverse of the outgoing-links sibling [`links`](./links.md) — together the two surfaces give complete 1-hop link-graph reads from any note. Replaces the agent's previous fallback (vault-wide body-text `search` for the target's name) at one to two orders of magnitude less token cost.

Wraps the Obsidian CLI's `eval` subcommand under the hood — the wrapper routes through `app.metadataCache.getBacklinksForFile(file)` to produce the locked per-source shape with the uniform-source-corpus, per-source-aggregation, cap, and truncated-signal semantics the agent needs. The agent does not need to know this — the call surface is a typed MCP tool.

The tool supports two target modes:

- **specific** — name the vault and exactly one of `file` (wikilink) or `path` (vault-relative path).
- **active** — operate on the currently focused note in the focused vault. No `vault`, `file`, or `path` argument is permitted.

The discriminator is `target_mode`. The schema composes the [target-mode primitive](../../specs/004-target-mode-schema/spec.md) with the standard file-scoped refinement (vault-required-in-specific, file/path XOR in specific, vault/file/path forbidden in active). Three optional fields layer on top: `with_counts: boolean` for per-source multiplicity, `total: boolean` for count-only mode (cap-bypass per the 2026-05-17 Q1 clarification), and `limit: integer (1..10000)` to override the implicit 1000-source cap.

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

- **`file`** — wikilink-style file name (resolved inside the eval JS via `app.metadataCache.getFirstLinkpathDest`). The `.md` extension is accepted but not required.
- **`path`** — exact vault-relative path. Path-traversal patterns (`../escape.md`, absolute paths) are looked up against `app.vault.getFiles()` — Obsidian's index uses vault-relative keys without `..` resolution, so the lookup returns null and the wrapper surfaces `CLI_REPORTED_ERROR(FILE_NOT_FOUND)`. No filesystem mutation occurs outside the vault.
- **`with_counts`** — when `true`, each per-source entry in `backlinks[]` carries an integer `count` aggregating all references from that source (body wikilinks + body markdown links + body embeds + frontmatter wikilinks contribute uniformly because Obsidian's combined backlinks cache pre-merges them).
- **`total`** — when `true`, the response carries `backlinks: []` with `count` set to the full source-note count. **Per the 2026-05-17 Q1 clarification, `total: true` BYPASSES the implicit 1000-source cap and reports the pre-cap count** (use this for outsized vaults where the entry-list mode would clip and you only need the headline number).
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
| `count` | integer ≥ 0 | Source-note count. Equals `backlinks.length` in entry-list modes. Equals the FULL pre-cap source count under `total: true` (per Q1). |
| `backlinks` | array | One entry per source note (NOT per occurrence — multiplicity goes into `count` under `with_counts: true`). Sorted by source path (UTF-16 ascending). Empty array under `total: true`. |
| `backlinks[].source` | string | Vault-relative path of the source note. Always `.md` (`.canvas`/`.base`/plugin-config/attachment sources excluded per Q2). |
| `backlinks[].count` | integer ≥ 1 OPTIONAL | Total reference count from this source to the target (body + frontmatter combined). Present only under `with_counts: true`. Never `0` — sources only appear when they reference the target at least once. |
| `truncated` | `true` OPTIONAL | Present only when the underlying source set exceeded the applied cap AND `total: false`. Absent otherwise. When `truncated: true`, the response carries the **FIRST `<cap>` entries** of the sorted source list (the **leading** subset). Sort key: `source` path UTF-16 ascending (`src/tools/backlinks/_template.ts:20-23` — `allKeys.filter(...).sort()` then `sources.slice(0, cap)`). The sibling cohort (`search`, `context_search`) all slice the leading subset — the truncation direction is **uniform across the cohort** per the BI-042 reconciliation; no per-tool divergence call-out is needed. Forward pointer: runtime standardisation of the cohort's slice direction is tracked separately and is out of scope for BI-042. Empirical anchor: code-read 2026-05-21 against the wrapper sources at the named line; see [BI-042 truncation-direction evidence](../../specs/042-close-audit-findings/contracts/truncation-direction-evidence.md). |

### Cross-folder reach (BI-042 reconciliation)

When a target note's filename basename is **unique vault-wide**, `backlinks` returns every cross-folder source that references the target via the bare-basename wikilink syntax `[[<basename>]]`, NOT only sources in the same folder as the target.

This is because the wrapper defers to Obsidian's underlying wikilink resolution mechanism, which is vault-scoped, not folder-scoped, when the basename is unique. The wrapper does NOT folder-scope the source set.

**Basename-uniqueness gate**: Obsidian's wikilink resolver is case-insensitive at the basename level. When two notes share a case-folded basename (e.g. `target.md` and `Target.md` in different folders), the resolver picks a single canonical destination for `[[target]]`, and the non-canonical sibling receives zero backlinks via that bare-basename wikilink. Agents debugging zero-backlink responses on a note whose basename collides with a sibling must add a folder-prefixed wikilink (`[[Folder/target]]`) or rename the colliding files.

**Folder-scoped recovery**: Agents writing folder-scoped recovery logic against the returned source list must filter the result themselves — for example, by keeping only sources whose `source` field shares a path prefix with the target. A folder-scoped backlink count cannot be derived without that filter.

Empirical anchor: a fixture vault probe captured 2026-05-21 against upstream Obsidian CLI 1.12.7 confirmed both same-folder and different-folder sources return when the target basename is vault-unique; see [BI-042 cross-folder evidence](../../specs/042-close-audit-findings/contracts/backlinks-cross-folder-evidence.md).

### Per-source aggregation semantic

Each source note appears in `backlinks[]` AT MOST ONCE — multiplicity goes into the per-source `count` under `with_counts: true`. A source note that references the target via three body wikilinks plus one frontmatter wikilink produces ONE entry with `count: 4`. A source that references the target once produces ONE entry with `count: 1` (or no `count` field when `with_counts: false`).

### Source-path sort

Entries are sorted by `source` ascending (UTF-16 code-unit lexicographic — JavaScript default `.sort()`). Deterministic across repeated calls on an unchanged vault state.

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

Fires one `invokeCli` (`obsidian vault=Demo eval code=<rendered-js>`). Example response:

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

Fires one `invokeCli` (`obsidian eval code=<rendered-js>` — no `vault=`). The eval resolves the target via `app.workspace.getActiveFile()`. When no note is focused, the response is a structured `ERR_NO_ACTIVE_FILE` error.

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

Same single eval invocation as Example 1; each entry now carries `count`:

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

For a hub note referenced by 1,500 sources, the response is:

```json
{ "count": 1500, "backlinks": [] }
```

The `truncated` field is ABSENT — count-only mode does not clip per Q1. Use this for token-economical pre-flight reads.

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

The eval's `app.vault.getFiles().find(...)` returns null. Response:

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

The eval's `f.extension === 'md'` guard fires; the wrapper surfaces `CLI_REPORTED_ERROR(stage:'envelope-error', code:'NOT_MARKDOWN')`.

## Error roster

All failure surfaces flow through `UpstreamError` per Constitution Principle IV. `backlinks` introduces **zero new error codes**.

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed the schema (missing `target_mode`, missing `vault` in specific mode, neither `file` nor `path` in specific mode, both `file` AND `path` in specific mode, `vault`/`file`/`path` in active mode, `with_counts`/`total` non-boolean, `limit` out of `1..10000` or non-integer, unknown top-level key, `vault` empty). | Agent retries with corrected input. `details.issues` carries per-issue `path` + `message` + zod code. |
| `CLI_REPORTED_ERROR` (`details.code: "VAULT_NOT_FOUND"`) | Specific mode + `vault` not registered. Upstream emits `Vault not found.` and the cli-adapter's 011-R5 inspection clause reclassifies. | Supply a registered vault display name. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "FILE_NOT_FOUND"`) | `path` does not match any file in the vault, OR `file` (basename) does not resolve via `getFirstLinkpathDest`. `details.detail` distinguishes (`path: <path>` vs `wikilink: <file>`). | Verify the path / basename; check for typos; confirm the vault contains the file. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "NOT_MARKDOWN"`) | The resolved target file's extension is not `.md` (e.g. `.canvas`, `.pdf`, attachments). | Use a different tool, or read source bytes via `read`. |
| `ERR_NO_ACTIVE_FILE` | `target_mode: "active"` was used but no Obsidian note is focused. The eval surfaces `NO_ACTIVE_FILE` envelope and the wrapper maps to this code. | Operator-side: open a note in Obsidian, OR call again with `target_mode: "specific"` and an explicit `vault` + `file`/`path`. |
| `CLI_REPORTED_ERROR` (`details.stage: "json-parse"`) | Stage-0 JSON parse on the eval stdout failed. Catch-all for upstream eval misbehaviour. | Investigate as a regression — the upstream contract was stable per plan-stage F1–F4. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-parse"`) | Stage-1 envelope-schema validation failed. Catch-all for unexpected envelope keys. | Investigate as a regression. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (typical cause: output-cap kill on pathologically large source lists exceeding the 10 MiB stdout cap even after the 1000-source cap). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Use `total: true` to bypass the cap-risk entirely. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |

### Dual validation envelope (BI-042 cohort acknowledgement)

Field-level input rejections produce two distinct wire envelopes depending on the MCP client class:

| Constraint family | Wrapped envelope (`UpstreamError`) | MCP transport envelope |
|---|---|---|
| `target_mode` discriminator presence; `vault` / `file` / `path` string min-length; `limit` numeric range | `VALIDATION_ERROR` with `details.issues` — fires when the offending value reaches the wrapper (Cowork pathway, or strict-rich clients that forward un-validated input). | `-32602 Invalid Params` with a zod-issue body — fires when the strict-rich client validates against the published `inputSchema` and rejects before forwarding. |
| Custom `superRefine` rules (file/path mutual exclusion in specific mode; vault/file/path forbidden in active mode) | `VALIDATION_ERROR` — wrapped envelope only; the custom-discriminator rules do not render into the published JSON Schema. | Not produced — strict-rich clients pass through. |
| Unknown top-level keys (`additionalProperties: false`) | `VALIDATION_ERROR(unrecognized_keys)` — strict-rich pathway only; Cowork strips client-side and never reaches the wrapper. | `-32602` — when the strict-rich client validates the published schema client-side. |

The dual envelope is structurally inherent to the wrapper + MCP transport architecture and is uniform across the cohort (`search`, `context_search`, `pattern_search`, `find_and_replace`, `find_by_property`, `backlinks`, `query_base`, `tag`). See [BI-042 dual-envelope evidence](../../specs/042-close-audit-findings/contracts/dual-envelope-evidence.md) and [BI-042 dual-envelope contract](../../specs/042-close-audit-findings/contracts/dual-validation-envelope-roster.md).

The canonical errors contract is at [specs/001-add-cli-bridge/contracts/errors.contract.md](../../specs/001-add-cli-bridge/contracts/errors.contract.md); `backlinks` propagates the adapter's classification verbatim with no rewrites beyond the two parse-failure stages and the three envelope-error mappings documented above.

## Source-corpus restriction (`.md`-only, per the 2026-05-17 Q2 clarification)

The source corpus is restricted to `.md` files only (case-insensitive extension match — `.md`, `.MD`, `.Md` accepted). Sources stored as `.canvas`, `.base`, plugin configurations, or attachments are EXCLUDED from the response even if Obsidian's combined backlinks cache lists them. This restriction is uniform across all modes (default, `with_counts`, `total`).

## Self-reference inclusion (FR-013)

A target note that references itself (e.g. via `[[self-target]]` in its own body or frontmatter) appears in its own backlinks list. This matches Obsidian's "Backlinks" pane semantic. Callers that want external-only backlinks filter the response client-side by comparing each `source` to the input `path` / `file`.

## Frontmatter-link inclusion

Frontmatter-declared wikilinks contribute to per-source `count` (under `with_counts: true`) UNIFORMLY with body wikilinks — Obsidian's `getBacklinksForFile()` returns a `CustomArrayDict` whose per-source value array pre-merges body + frontmatter entries. A source note that declares the target in BOTH its frontmatter (`related: "[[target]]"`) and its body (`Reference to [[target]] here.`) appears as ONE entry with `count: 2`.

## Alias attribution

Aliased wikilinks (`[[Target|Display]]`) are attributed to the resolved target, NOT the alias text. A source containing `[[Concepts/Modular-Code|MoCo]]` contributes to the `backlinks` of `Concepts/Modular-Code.md`. The alias `MoCo` is NEVER surfaced in the response.

## Code-block exclusion (FR-014)

References inside fenced or indented code blocks are EXCLUDED from the cache (Obsidian's link parser does not extract code-block tokens). A documentation note that contains only ` ```[[example-target]]``` ` does NOT appear in `example-target`'s backlinks. This is inherited from Obsidian's metadataCache classification — the wrapper does no additional filtering.

## Multi-vault structured-error contract

The upstream Obsidian CLI emits `Vault not found.` (plain text, exit 0) for an unregistered vault display name. The cli-adapter's 011-R5 unknown-vault response-inspection clause fires and reclassifies the response to `CLI_REPORTED_ERROR` with `details.message: "Vault not found."`.

Multi-vault callers MUST supply a registered display name; the wrapper will NOT silently route to the focused vault for an unrecognised name. This is the same contract as [`links`](./links.md), [`read_heading`](./read_heading.md), and [`find_by_property`](./find_by_property.md), all of which compose against `eval`. The previously-documented contrast against `outline` (BI-023), `properties` (BI-024), and `files` (BI-019) — which claimed the native subcommands "silently honoured `vault=` as a noop" — is **retired as of BI-042 (2026-05-21)**: empirical probing against upstream Obsidian CLI 1.12.7 confirms that native subcommands now also emit `Vault not found.` for unregistered vault names; the cohort is uniform on this surface. (Empirical anchor: probe captured 2026-05-21 against obsidian-cli 1.12.7; see [specs/042-close-audit-findings/contracts/vault-probe-evidence.md](../../specs/042-close-audit-findings/contracts/vault-probe-evidence.md) T012; re-verify on next audit cycle.)

## Inherited limitations

### Implicit 1000-source cap + `truncated` signal

The default cap on `backlinks.length` is 1000 sources. When the underlying source set exceeds the applied cap (default 1000 OR the explicit `limit` value), the response carries `truncated: true` and the entry list is sliced to the cap. The `truncated` flag is NEVER present under `total: true` (count-only mode reports the full pre-cap count per Q1).

For hub notes referenced by thousands of sources where you need only the count, use `total: true` to bypass the cap entirely (single most token-economical mode).

### Output-cap ceiling

Very long source lists with pathologically long path strings (after the 1000-source cap is applied) may still exceed the cli-adapter's 10 MiB output cap and surface as `CLI_NON_ZERO_EXIT`. The `total: true` mode bypasses this risk entirely — the envelope inside the eval emits `backlinks: []` when `total` is set, so the per-entry JSON does not contribute to stdout size.

### Single-call architecture

Each MCP request fires exactly ONE `invokeCli` invocation regardless of `target_mode`, `with_counts`, `total`, or `limit`. All branching lives inside the eval JS at the envelope-emission step. End-to-end latency is approximately 1× a single-call typed tool (~80–200 ms typical). All invocations serialise through the project's single-in-flight queue.

### Anti-injection guarantee

User inputs (`vault`, `file`, `path`, `target_mode`, `with_counts`, `total`, `limit`) flow through a base64-encoded JSON payload substituted into a frozen JS template at exactly one substitution point (`__PAYLOAD_B64__`). The JS source itself never contains user-supplied text. At runtime the eval JS decodes the payload via the UTF-8-safe `TextDecoder` + `atob()` + `JSON.parse(...)` pattern (BI-034). The base64 alphabet (`[A-Za-z0-9+/=]`) contains no characters with shell meaning, so the substituted payload cannot break out of the `code=...` parameter. Parity with [`links`](./links.md), [`read_heading`](./read_heading.md), and [`find_by_property`](./find_by_property.md).

## Out-of-scope surfaces

- **Per-occurrence enumeration** — `backlinks` aggregates per-source. To inspect per-occurrence line / column / context, read the source note via [`read`](./read.md) and parse client-side.
- **Source-side text snippets** — NOT surfaced. Use [`context_search`](./context_search.md) for line-context near a literal phrase.
- **Multi-hop traversal** — single-hop only (sources that directly reference the target); callers compose for multi-hop graph traversal.
- **Vault-wide inbound-reference inventory** — one target at a time; callers compose with [`files`](./files.md) to enumerate, then call `backlinks` per file.
- **Inbound-vs-outbound aggregation** — separate primitives. Use [`links`](./links.md) for outgoing references; this tool for incoming.
- **Canonical-path resolution** — `source` is byte-faithful to Obsidian's vault-relative key; callers resolve.
- **Request-side filter / sort** — callers filter / re-sort client-side.

## Related tools

- [links](./links.md) — the dual direction: outgoing links from a single note. Pairs with `backlinks` for full 1-hop link-graph reads.
- [outline](./outline.md) — the heading skeleton for the same note; pairs with `backlinks` for full structural discovery (`outline` for the section list, `backlinks` for inbound references).
- [read](./read.md) — full file content; use when you need the body bytes, not just the source list.
- [read_heading](./read_heading.md) — body of a single named heading from a source note.
- [context_search](./context_search.md) — line-with-context primitive for source-side text inspection.
- [find_by_property](./find_by_property.md) — frontmatter-property search across the vault.
- [obsidian_exec](./obsidian_exec.md) — freeform escape hatch when the wrapper's shape is insufficient.

## References

- [036-get-backlinks spec](../../specs/036-get-backlinks/spec.md) — feature spec; clarifications session 2026-05-17 (Q1 `total: true` bypasses cap; Q2 `.md`-only source corpus).
- [036-get-backlinks research](../../specs/036-get-backlinks/research.md) — R1–R12 design decisions, F1–F4 T0 live findings (incl. the `CustomArrayDict.keys()` / `.get()` accessor finding driving the template implementation).
- [036-get-backlinks data-model](../../specs/036-get-backlinks/data-model.md) — schema shapes, JS template, base64 payload, per-tool invariants, test inventory.
- [errors contract](../../specs/001-add-cli-bridge/contracts/errors.contract.md) — canonical roster of `UpstreamError` codes.
- [target-mode primitive spec](../../specs/004-target-mode-schema/spec.md) — shared discriminator the input schema composes via the standard file-scoped refinement.
- [help tool spec](../../specs/005-help-tool/spec.md) — the schema-stripping contract and `help({ tool_name })` lookup that surfaces this document.
