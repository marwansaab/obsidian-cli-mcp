# Output Contract: `backlinks`

**Branch**: `036-get-backlinks`
**Date**: 2026-05-17
**Phase**: 1 (Design — Contracts)

The tool's typed-output envelope is derived from `backlinksOutputSchema`. The MCP wire shape wraps this envelope as `{ content: [{ type: "text", text: JSON.stringify(envelope) }] }` per `registerTool`'s default `responseFormat: "json"`.

## Schema (zod)

```ts
backlinkEntrySchema = z.object({
  source: z.string(),
  count: z.number().int().positive().optional(),
}).strict();

backlinksOutputSchema = z.object({
  count: z.number().int().nonnegative(),
  backlinks: z.array(backlinkEntrySchema),
  truncated: z.boolean().optional(),
}).strict();
```

## Field reference

### `count` (required)

- Type: non-negative integer
- Semantics: the source-note count for the response.
  - In default mode (`total: false`) AND the underlying source set fits the applied cap: equals `backlinks.length` and equals the pre-cap source count.
  - In default mode AND the underlying source set EXCEEDS the applied cap: equals `backlinks.length` (the post-cap entry-array length). The `truncated: true` flag signals clipping.
  - In count-only mode (`total: true`): equals the FULL pre-cap source-note count regardless of whether the implicit cap would have fired (per the 2026-05-17 Q1 clarification — count-only bypasses the cap).

### `backlinks` (required)

- Type: array of `BacklinkEntry`
- Semantics: ordered list of source notes that reference the target. Sort: `source` ascending (UTF-16 code-unit order — FR-008).
- Empty under `total: true` regardless of the underlying source-note count.
- Each entry is `{ source: string }` under default mode, or `{ source: string, count: integer }` under `with_counts: true`.

### `truncated` (optional)

- Type: `boolean`
- Present and `true` ONLY when `total: false` AND the underlying source set exceeded the applied cap (implicit 1000 OR user-supplied `limit`).
- ABSENT otherwise (callers MUST treat absent as equivalent to `false`).
- ABSENT in `total: true` mode regardless of underlying source set size (per Q1).

## Per-entry shape (`BacklinkEntry`)

### `source` (required)

- Type: `string`
- Semantics: vault-relative path to the source note, with forward-slash separators. Always ends in `.md` (per FR-020a source-corpus restriction; case preserved as the host's metadata cache reports it).

### `count` (optional)

- Type: positive integer (≥ 1)
- Present ONLY when the request supplied `with_counts: true`. ABSENT otherwise.
- Semantics: total number of references from this source to the target (aggregates body links + body embeds + frontmatter references uniformly per FR-016; aliased and bare wikilinks attribute uniformly to the resolved target per FR-015; same-line and cross-line repetition collapse into a single integer).
- `count: 0` is impossible — sources only appear in the response if they have at least one reference.

## Response shapes (worked examples)

### Variant A — Default mode, multiple sources

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

### Variant B — `with_counts: true`, multiple sources, mixed multiplicities

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

### Variant C — `total: true`, populated target

```json
{
  "count": 7,
  "backlinks": []
}
```

### Variant D — Zero backlinks (target unreferenced)

```json
{
  "count": 0,
  "backlinks": []
}
```

### Variant E — Truncated under default cap

```json
{
  "count": 1000,
  "backlinks": [ /* 1000 entries with source only */ ],
  "truncated": true
}
```

The pre-cap underlying source set exceeded 1000; the response carries the first 1000 (in `source`-ascending order) and signals clipping.

### Variant F — Truncated under explicit `limit`

```json
{
  "count": 50,
  "backlinks": [ /* 50 entries */ ],
  "truncated": true
}
```

The caller supplied `limit: 50`; the underlying source set exceeded 50.

### Variant G — Full set under explicit `limit`

```json
{
  "count": 27,
  "backlinks": [ /* 27 entries */ ]
}
```

The caller supplied `limit: 100` and the underlying source set has 27 entries (under the cap); `truncated` is absent.

### Variant H — `total: true` against MOC note (cap bypassed per Q1)

```json
{
  "count": 1500,
  "backlinks": []
}
```

The MOC note has 1500 source notes; `total: true` reports the full pre-cap count regardless of the implicit 1000 cap. The `truncated` field is absent (no clipping occurs in count-only mode).

### Variant I — Self-reference present (per FR-013)

```json
{
  "count": 4,
  "backlinks": [
    { "source": "Notes/Other.md" },
    { "source": "Notes/Self.md" },
    { "source": "Projects/A.md" },
    { "source": "Projects/B.md" }
  ]
}
```

Target is `Notes/Self.md` and the note links to itself; the source list includes `Notes/Self.md` (self-reference inclusion per FR-013). Callers wanting "external" backlinks only do a one-line client-side filter.

## MCP wire envelope (post-registerTool serialisation)

The `registerTool` factory wraps the typed envelope as MCP `content`:

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"count\":3,\"backlinks\":[{\"source\":\"Notes/Alpha.md\"},{\"source\":\"Notes/Beta.md\"},{\"source\":\"Projects/Gamma.md\"}]}"
    }
  ]
}
```

The MCP client is expected to `JSON.parse(content[0].text)` to recover the typed envelope. This is the project's uniform wire convention across all typed tools.

## Output invariants (verified by tests + zod safeParse at handler boundary)

| Invariant | Source |
|-----------|--------|
| `count >= 0` | `backlinksOutputSchema` (zod nonnegative) |
| `count` matches `backlinks.length` when `total: false && !truncated` | FR-005a (handler test 1-3 + 26-27) |
| `count` equals pre-cap source count when `total: true` | FR-005a + Q1 (handler test 28) |
| `backlinks.length === 0` when `total: true` | FR-004 (handler test 3, 7, 8, 28) |
| `backlinks.length <= cap` when `total: false` | FR-010 (handler test 26-27) |
| `truncated === true` iff `total: false && pre-cap > applied cap` | FR-011 (handler test 26-27) |
| `truncated` absent when `total: true` | Q1 + FR-011 (handler test 28) |
| Per-entry shape carries `count` iff `with_counts: true` | FR-003 (handler test 2 vs 1) |
| Per-entry `count >= 1` when present | `backlinkEntrySchema` (zod positive) |
| `source` strings end in `.md` (case-insensitive) | FR-020a (handler test 16-17) |
| Order is `source` ascending UTF-16 code-unit | FR-008 (handler test 30) |
| No locator echo (request inputs not present in response) | FR-025 (handler test all — implicit via output schema) |

The `backlinksOutputSchema.parse()` would also lock these structural invariants if called at the boundary; the handler's typed return value relies on the eval template + handler logic producing schema-compliant output by construction (no post-eval reshape step needed).
