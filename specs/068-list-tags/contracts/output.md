# Output Contract: `tags`

**Schema of record**: `tagsOutputSchema` in `src/tools/tags/schema.ts`. Details: [data-model.md](../data-model.md) §§ 3–5.

## Shape

```json
{ "total": 3, "tags": [ { "name": "alpha", "count": 4 }, { "name": "beta", "count": 1 }, { "name": "parent/child", "count": 2 } ] }
```

With `includeCounts: false`:

```json
{ "total": 3, "tags": [ { "name": "alpha" }, { "name": "beta" }, { "name": "parent/child" } ] }
```

Empty scope (an untagged vault or an untagged note):

```json
{ "total": 0, "tags": [] }
```

## Guarantees

1. `total === tags.length`.
2. Each `name` appears at most once.
3. `name` is the index's tag name with exactly one leading `#` removed; it is otherwise unchanged (no case-fold, normalisation, rollup or split).
4. `count` is present on every entry or on none, and only absent when `includeCounts: false`. Its value is the upstream count, verbatim.
5. Order: default is `compareTagNames` ascending. With `sortByCount`, count descending, ties broken by `compareTagNames`. Upstream order is never relied on.
6. A success is never partial: oversize output is `CLI_OUTPUT_TOO_LARGE`, never a truncated list.

## Inherited (characterised at T0, then documented)

Fenced-code exclusion · frontmatter + inline coverage · hierarchical presentation · case-variant handling · non-ASCII handling · per-note `count` meaning · staleness window · size ceiling. See [t0-probe-plan.md](t0-probe-plan.md).
