# Data Model: Fix Search Truncation

**Branch**: `053-fix-search-truncation` | **Date**: 2026-05-27

## Entities

No new entities are introduced. The fix modifies the internal pipeline order of existing entities.

### SearchDefaultOutput (existing, unchanged schema)

```
{ count: number, paths: string[], truncated?: true }
```

- `paths`: UTF-16 ascending sorted array of `.md` file paths matching the query.
- `count`: length of `paths` after truncation.
- `truncated`: present and `true` only when the underlying match set may have exceeded `appliedCap`.

### SearchLineOutput (existing, unchanged schema)

```
{ count: number, matches: { path: string, line: number, text: string }[], truncated?: true }
```

- `matches`: sorted by `(path asc, line asc)` after truncation.
- `count`: length of `matches` after truncation.

### ContextSearchOutput (existing, unchanged schema)

```
{ count: number, matches: { path: string, line: number, text: string }[], truncated?: true }
```

- Identical shape to `SearchLineOutput`.

## Pipeline Order Change

### Before (current, buggy)

```
CLI wire → filter .md → detect truncation → slice(0, cap) → sort → output schema parse
```

### After (fixed)

```
CLI wire → filter .md → detect truncation → sort → slice(0, cap) → output schema parse
```

The `detect truncation` step reads from the untruncated collection in both cases (counts are order-independent). The only change is that `sort` moves before `slice`, so the slice operates on the deterministically-ordered collection rather than the CLI-ordered collection.

## State Transitions

N/A — no lifecycle or state machine involved.

## Validation Rules

No new validation rules. Existing Zod schemas (`searchDefaultOutputSchema`, `searchLineOutputSchema`, `contextSearchOutputSchema`) remain the boundary validators. The schemas are shape-only (they validate types and field presence, not entry ordering), so the pipeline reorder is invisible to them.
