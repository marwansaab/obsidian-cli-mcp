# Contract: Published tool surface

**Serves**: FR-019–FR-034, FR-036, FR-039–FR-042, FR-057 · **PRs**: 3, 4, 5
**Research**: R2, R3, R6, R7, R8, R9 · **Data model**: §2–§5

## Descriptor (per tool, as a client receives it)

```jsonc
{
  "name": "write_note",                       // unchanged (FR-057)
  "title": "Write Note",                      // PR 4
  "description": "…",                         // PR 4: no cross-cutting rules, no "call help first"
  "inputSchema": { "$schema": "https://json-schema.org/draft/2020-12/schema",
                   "type": "object", "properties": { … every property has "description" … },
                   "additionalProperties": false, "required": [ … ] },     // PR 3 dialect, PR 4 descriptions
  "annotations": { "readOnlyHint": false, "destructiveHint": true,
                   "idempotentHint": false, "openWorldHint": false },     // PR 4
  "outputSchema": { … }                       // PR 5, only where R6 says so
}
```

The `inputSchema` and `outputSchema` bytes are what zod 4 emits for
`{target: "draft-2020-12"}` through the SDK's Standard Schema path. No project
normalisation (constitution → Schema dialect).

## Titles and annotations (PR 4)

A title is the tool name in words (for example `find_by_property` → "Find By
Property"), except where a clearer phrase is chosen in review. Annotations follow spec
FR-024 exactly:

| Tools | readOnly | destructive | idempotent | openWorld |
|---|---|---|---|---|
| read, read_heading, read_property, search, context_search, pattern_search, find_by_property, tag, backlinks, links, outline, files, paths, properties, bases, views_base, query_base, get_active_file, help, vaults, smart_connections_query, smart_connections_similar | true | false | true | false |
| append_note, prepend, patch_heading, patch_block, create_base | false | false | false | false |
| set_property | false | false | true | false |
| write_note, delete, move, rename, find_and_replace | false | true | false | false |
| open_file | false | false | true | false |
| obsidian_exec | false | true | false | true |

## Parameter descriptions (PR 4)

- Every property at every depth has a one-line `description`: what it is, its format, and
  its default if any.
- Target-mode family (19 tools), written once in `src/target-mode/target-mode.ts`:
  - `target_mode`: `"specific"` targets a named vault and note (use for automation);
    `"active"` targets the note focused in Obsidian.
  - `vault`: Obsidian display name. Required when `target_mode` is `"specific"`; omit
    when `"active"`.
  - `file`: note name resolved like a wikilink. With `"specific"`, give exactly one of
    `file` or `path`; omit both with `"active"`.
  - `path`: exact vault-relative path. Same rule as `file`.
  - The folder-scoped variant (`files`, `paths`, `get_active_file`) states its own rule:
    no `file`/`path`; `vault` required in specific mode and omitted in active mode.
- The flat schema stays (no `oneOf`); runtime `superRefine` enforces the rules as today.

## Server instructions (PR 4)

- Fixed opening ≤ 512 characters, ending on a sentence; names no hideable tool.
- Then routing lines and rules, each kept only if every tool it names is offered.
- Full text < 2,000 characters. Built once at boot; identical for both eras.

## Results (PR 5)

| Tool kind | Success | Failure |
|---|---|---|
| has `outputSchema` | `content: [{type: "text", text: JSON.stringify(r)}]`, `structuredContent: r` | text-only envelope, `isError: true` |
| no `outputSchema` (`read`, `help`, `tag`, `obsidian_exec`: results that are not always a structured object) | unchanged from today | unchanged |

Union-of-objects results (`search`, `find_and_replace`) publish an object-root schema that
wraps the variants: `{ "type": "object", "anyOf" | "oneOf": [ …variants as zod emits
them… ] }`. It is identical for both eras and validated by zod (research R6). There are
no era exceptions; a tool that cannot meet this is raised to the owner.

## `vaults` (PR 5)

- Input: `{}` (no properties; `additionalProperties: false`).
- Output: `{ count: integer, vaults: [{ name: string, path: string, open: boolean | null }] }`.
- Annotations: read-only row.

## Deliberate-change gate (PR 3 onward)

- `src/tools/_register-baseline.json` is `schemaVersion: 2`. Per tool it holds
  fingerprints of `description`, `inputSchema`, then `title` and `annotations` (from
  PR 4) and `outputSchema` (from PR 5), taken from `client.listTools()` against an
  in-process server built with the default configuration.
- Any difference fails `vitest run`. The fix is `npm run baseline:write` plus review,
  in the same PR.

## Enforcement tests

- Every tool has a non-empty `title` and all four hints as booleans.
- The classification table above is pinned (one assertion per tool).
- Every `inputSchema` property, recursively, has a `description`.
- No description contains `Call help(` or the cross-cutting rule sentences.
- For every tool with `outputSchema`, a fixture success result validates against it and
  `JSON.parse(text)` deep-equals `structuredContent`.
