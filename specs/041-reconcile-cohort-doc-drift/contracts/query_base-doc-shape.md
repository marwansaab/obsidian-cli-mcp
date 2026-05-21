# Contract: query_base response-shape doc reconciliation

**Anchor**: `docs/tools/query_base.md` + `src/tools/query_base/schema.ts` `.describe()` strings.
**FRs satisfied**: FR-006, FR-007, FR-008.

## Edit 1 — Empty-view columns (FR-006)

### Before (current doc, paraphrased)

> The response `columns` vector reflects the view-declared columns plus the reserved `path` prefix.

### After

> When a view matches at least one row, `columns` carries the reserved `path` prefix plus the view-declared columns derived from the first row's key set. When a view matches **zero rows**, `columns` carries only `["path"]` — the wrapper has no signal for view-declared column names absent row data, and does NOT parse the `.base` YAML client-side to enumerate them (out-of-scope per BI-041). Agents writing parsing code MUST handle the zero-row case without assuming the full column set.

### Empirical anchor

Fixture: `.base` file declaring view `EmptyView` whose filter excludes all notes.
Invocation: `query_base { base_path: "fixtures/empty-view.base", view_name: "EmptyView" }`.
Expected response: `{ columns: ["path"], rows: [], truncated: false }`.

## Edit 2 — Type-preservation passthrough (FR-007)

### Before (current doc, paraphrased)

> Frontmatter values preserve their declared YAML type in the response.

### After

> Frontmatter values are **stringified by upstream** regardless of their declared YAML type. The wrapper is passthrough — it does NOT coerce back to native JSON types. An integer YAML frontmatter value `count: 42` surfaces in the response as the string `"42"`. A boolean `done: true` surfaces as `"true"`. Agents must parse the string value if numeric or boolean semantics are required. The wrapper does NOT begin type-coercing values (out-of-scope per BI-041).

### Empirical anchor

Fixture: note `intval.md` with body:
```
---
count: 42
---
content
```
`.base` view `AllRows` declaring `count` as a column.
Invocation: `query_base { base_path: "fixtures/intval.base", view_name: "AllRows" }`.
Expected response (relevant row): `{ path: "intval.md", count: "42" }` — `count` is the string `"42"`, NOT integer `42`.

## Edit 3 — `file.*` column-name emission (FR-008)

### Before (current doc, paraphrased)

> Source-property columns declared as `file.X` strip uniformly to `X` in the response column names.

### After

> Source-property column names are stripped **non-uniformly**. `file.path` becomes the reserved `path` injection (with collision management: if the view also declares a column literally named `path`, the wrapper renames the view-declared column to `path_view` per the existing collision-management contract). `file.name` becomes the upstream display label `"file name"` — note the **embedded space** — NOT the segment `name`. The display-label form is upstream behaviour, not a wrapper choice; the wrapper does NOT remap upstream display labels back to YAML segment names (out-of-scope per BI-041). Agents indexing rows by column name MUST use the exact emitted string, including the embedded space for display labels.

### Empirical anchor

Fixture: `.base` view `FileView` declaring columns `file.path` and `file.name`.
Invocation: `query_base { base_path: "fixtures/file-cols.base", view_name: "FileView" }`.
Expected response (relevant row + columns): `{ columns: ["path", "file name"], rows: [{ path: "note.md", "file name": "note" }] }`.

## Test additions (co-located per Principle II)

In `src/tools/query_base/schema.test.ts`:

1. **Empty-view columns claim present**: assert the `.describe()` text on the `query_base` schema contains the phrase "When a view matches **zero rows**, `columns` carries only `[\"path\"]`" (or equivalent post-formatting). This is a brittle-string assertion; tolerated because the text IS the contract under the "doc IS the contract" invariant.
2. **Type-preservation passthrough claim present**: assert the `.describe()` text contains the phrase "Frontmatter values are **stringified by upstream**".
3. **`file.*` non-uniform emission claim present**: assert the `.describe()` text contains the phrase "`file.path` becomes the reserved `path` injection" AND "`file.name` becomes the upstream display label `\"file name\"`".

Help-doc edits in `docs/tools/query_base.md` are reviewed by inspection during PR review — no automated assertion on the `.md` text (the schema description IS the canonical text per Principle III; the help-doc is its rendered companion).

## What is NOT in this edit

- No runtime change to `query_base`'s response shape. The wrapper continues to emit what upstream emits.
- No new fixture parsing. The `.base` YAML is not read by the wrapper at any point in this BI.
- No upstream-display-label remap. `"file name"` stays as-is.
- No type coercion. Integer-in-YAML stays as string-in-response.
