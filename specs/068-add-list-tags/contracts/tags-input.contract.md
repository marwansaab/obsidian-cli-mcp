# Contract: `tags` public input and output

**Feature**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md) | **ADR**: ADR-038 (Tags Tool-Local Target-Mode Scope Matrix)

This is the MCP-facing contract. It is published as the tool's `inputSchema`, rendered from `tagsInputSchema` by the existing `toMcpInputSchema` (`z.toJSONSchema`, io `input`, draft-7, descriptions stripped per ADR-005).

## Input

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

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `target_mode` | `"specific"` \| `"active"` | YES | — | |
| `vault` | string, min 1 | specific: YES; active: forbidden | — | |
| `file` | string, min 1 | no | — | Note name as Obsidian resolves it (the link text, without `[[ ]]`). |
| `path` | string, min 1, structurally safe | no | — | Vault-relative path with extension. |
| `activeOnly` | boolean | no | `false` | The note focused in the editor of the targeted vault. |
| `sortByCount` | boolean | no | `false` | |
| `includeCounts` | boolean | no | `true` | |

Scope rule (ADR-038):

- At most one of `file`, `path`, `activeOnly: true` may be set. If none is set, the listing is vault-wide.
- All three are allowed in both modes. In active mode, `file` / `path` resolve inside the focused vault.
- In specific mode, `activeOnly` is routed with the named vault. The expectation is the named vault's focused note; the T0-observed behaviour is documented.

Unknown top-level keys are rejected.

## Output

```json
{ "total": 3, "tags": [ { "name": "project", "count": 4 }, { "name": "project/alpha", "count": 1 }, { "name": "réunion", "count": 2 } ] }
```

- `name` is in bare form, with no leading `#`.
- `count` is an integer: the number of occurrences, inline plus frontmatter, with no per-note de-duplication.
- When `includeCounts: false`, entries are `{ "name": "…" }` with **no** `count` key.
- `total` equals `tags.length`.
- An empty result is `{ "total": 0, "tags": [] }`.

Ordering:

- **Default**: ASCII-case-insensitive, then UTF-8 byte order.
- **`sortByCount: true`**: count descending, with ties ordered as in the default.

## Scope semantics inherited from upstream (documented, not reshaped)

| Aspect | Vault-wide | `file` / `path` / `activeOnly` |
|---|---|---|
| Case variants (`Project` / `project`) | merged into one entry under the first-encountered casing | separate entries |
| Hierarchical ancestors | every ancestor listed, including implied-only ones; an ancestor's count includes its descendants | only tags actually written in the note |
| Fenced-code and inline-code tag tokens | excluded | excluded |
| Frontmatter vs inline | both counted | both counted |
| Non-ASCII names | first-class | first-class |

## Worked examples

**A. Vault-wide with counts (AC 1)**

```json
{ "target_mode": "specific", "vault": "Work" }
→ { "total": 4, "tags": [ { "name": "deep", "count": 1 }, { "name": "deep/a", "count": 1 }, { "name": "Project", "count": 2 }, { "name": "shared", "count": 6 } ] }
```

**B. A single note by name (AC 2), in active mode**

```json
{ "target_mode": "active", "file": "Beta" }
→ { "total": 3, "tags": [ { "name": "Aardvark", "count": 1 }, { "name": "aardvark", "count": 1 }, { "name": "Banana", "count": 1 } ] }
```

**C. Sorted by count, names only (AC 5, AC 6)**

```json
{ "target_mode": "specific", "vault": "Work", "sortByCount": true, "includeCounts": false }
→ { "total": 3, "tags": [ { "name": "shared" }, { "name": "Project" }, { "name": "deep" } ] }
```

**D. The focused note (AC 4)**

```json
{ "target_mode": "active", "activeOnly": true }
→ { "total": 2, "tags": [ { "name": "parent", "count": 1 }, { "name": "shared", "count": 2 } ] }
```

**E. A note by path (AC 3)**

```json
{ "target_mode": "specific", "vault": "Work", "path": "Projects/Alpha.md" }
```

## Error roster

No new top-level codes are introduced.

| Code | When | Distinguishing details |
|---|---|---|
| `VALIDATION_ERROR` | two or more scopes; specific mode without `vault`; active mode with `vault`; unknown key; wrong type; empty `file` / `path`; unsafe `path` (`..`, absolute, drive letter, control characters) | `details.issues[].path` names the field(s). **No CLI call is made.** |
| `ERR_NO_ACTIVE_FILE` | `activeOnly: true` and no note is focused in the targeted vault | message: focus a note, or use `file` / `path` |
| `CLI_REPORTED_ERROR` | unknown vault | `details.message: "Vault not found."` |
| `CLI_REPORTED_ERROR` | `file` / `path` does not resolve | `details.stdout` starts with `Error: File "` |
| `CLI_REPORTED_ERROR` | upstream reply cannot be interpreted | `details.stage` is `json-parse`, `shape-parse` or `count-parse` |
| `CLI_OUTPUT_TOO_LARGE` | upstream reply over 10 MiB | never a truncated list; scope with `file` / `path` |
| `CLI_BINARY_NOT_FOUND` / `CLI_NON_ZERO_EXIT` / `CLI_TIMEOUT` | transport failures | inherited from dispatch |

## Client-class note (AC 11)

There are two pathways for unknown-key rejection:

- **Server-side.** Clients that forward unknown keys reach the server, where `tagsInputSchema` rejects them with `VALIDATION_ERROR` before any CLI call.
- **Client-side.** Clients that pre-validate against the published `inputSchema` (`additionalProperties: false`) reject the call themselves, so the server never sees it.

The AC 11 regression test drives the server-side pathway directly, through the registered tool's handler, and states this distinction in its title.

## Out of scope (not exposed)

| Upstream surface | Why |
|---|---|
| `sort=count` | ties are non-deterministic upstream; the wrapper sorts |
| `total` | `total` is derived from the parsed list |
| `format=tsv` / `format=csv` | the wrapper always parses JSON |
| Tag mutation, files-by-tag, cross-vault aggregation, wrapper-side rollup, pagination | spec Out of scope (files-by-tag is the `tag` tool) |
