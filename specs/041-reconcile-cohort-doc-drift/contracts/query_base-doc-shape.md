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

### After (revised 2026-05-21 per T006(c) capture)

> Source-property column names declared as `file.X` are emitted by upstream as the display label `"file X"` (with **embedded space**) — including `file.path` → `"file path"` and `file.name` → `"file name"`. The wrapper does NOT remap these display labels back to YAML segment names (out-of-scope per BI-041). Independent of the view's column declarations, the wrapper always injects a reserved `path` column at index 0 of every row carrying the source note's vault-relative path. This reserved `path` is sourced from upstream's row metadata and is **distinct from `file.path`** (which yields `"file path"`). A view declaring `file.path` and `file.name` therefore produces three columns: `["path", "file path", "file name"]` — the wrapper's reserved locator plus both display labels. Agents indexing rows by column name MUST use the exact emitted string, including the embedded space for display labels.

### Pre-edit "After" text revision (2026-05-21)

The original "After" text in this contract claimed `file.path` → reserved `path` injection. T006(c) empirically captured the actual upstream emission and revealed that `file.path` produces a **separate** display-label column `"file path"` distinct from the reserved row-locator `path`. The schema `.describe()` and `docs/tools/query_base.md` were written against the corrected empirical truth (revised "After" above), not the original assumption. The "Before" baseline (pre-BI claim about uniform stripping) was still wrong — non-uniform stripping IS the bug class — but the specific non-uniformity claim has been corrected: it's "both `file.path` and `file.name` become display labels with embedded spaces" rather than "`file.path` becomes the reserved `path`".

### Empirical anchor (T006(c) capture 2026-05-21)

Fixture: `.base` view `FileView` declaring columns `file.path` and `file.name`.
Invocation: `obsidian vault=TestVault-Obsidian-CLI-MCP base:query path=Sandbox/bi041-probes/file-cols.base view=FileView format=json`.
Actual captured response (verbatim stdout JSON):
```json
[
  {
    "path": "Sandbox/bi041-probes/intval.md",
    "file path": "Sandbox/bi041-probes/intval.md",
    "file name": "intval"
  }
]
```
After the wrapper's row-post-processing: `{ columns: ["path", "file path", "file name"], rows: [<as above>], truncated: false }`. Reserved `path` at index 0 (wrapper-injected from upstream metadata); both `file.path` and `file.name` emit as display labels with embedded spaces.

## Test additions (co-located per Principle II)

In `src/tools/query_base/schema.test.ts`:

1. **Empty-view columns claim present**: assert the `.describe()` text on the `query_base` schema contains the phrase about "zero rows" and `["path"]`. This is a brittle-string assertion; tolerated because the text IS the contract under the "doc IS the contract" invariant.
2. **Type-preservation passthrough claim present**: assert the `.describe()` text contains the phrase "stringified by upstream".
3. **`file.*` display-label emission claim present (revised 2026-05-21)**: assert the `.describe()` text contains both `` `file.path` → `"file path"` `` AND `` `file.name` → `"file name"` `` — the empirically-correct claims that both `file.X` columns produce display labels with embedded spaces.

Help-doc edits in `docs/tools/query_base.md` are reviewed by inspection during PR review — no automated assertion on the `.md` text (the schema description IS the canonical text per Principle III; the help-doc is its rendered companion).

## What is NOT in this edit

- No runtime change to `query_base`'s response shape. The wrapper continues to emit what upstream emits.
- No new fixture parsing. The `.base` YAML is not read by the wrapper at any point in this BI.
- No upstream-display-label remap. `"file name"` stays as-is.
- No type coercion. Integer-in-YAML stays as string-in-response.
