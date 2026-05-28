# Quickstart: Fix Search Truncation

**Branch**: `053-fix-search-truncation` | **Date**: 2026-05-27

## What Changed

The `search` and `context_search` tools' `limit` parameter now returns the **first N entries** of the deterministic result ordering (leading-N), instead of an arbitrary N entries that happened to appear first in the CLI's return order (which was then re-sorted, giving the appearance of trailing-N in many cases).

## Root Cause

The post-CLI pipeline applied operations in the wrong order:

```
Before: CLI results → filter .md → slice(0, cap) → sort
After:  CLI results → filter .md → sort → slice(0, cap)
```

The slice was operating on unsorted CLI output, then the sort re-ordered only the truncated subset. Callers saw a sorted subset of an arbitrary N, not the first N of the deterministic ordering.

## How to Verify

### search (default mode)

```json
{ "name": "search", "arguments": { "query": "the", "limit": 3 } }
```

Expected: `paths` contains the first 3 entries of the UTF-16 ascending sort of all matching `.md` files. If the vault has `z.md`, `a.md`, `m.md`, `b.md` matching, `paths` is `["a.md", "b.md", "m.md"]` — not `["m.md", "z.md", "a.md"]` re-sorted to `["a.md", "m.md", "z.md"]`.

### context_search

```json
{ "name": "context_search", "arguments": { "query": "the", "limit": 3 } }
```

Expected: `matches` contains the first 3 entries of the `(path asc, line asc)` sort of all matching lines. Same principle as above.

## What Did NOT Change

- The deterministic sort orders (UTF-16 ascending for default mode; path asc + line asc for line/context modes).
- The `count` invariant (equals length of returned array).
- The `truncated` flag-firing rule (including the conservative equal-to-limit case).
- The Zod output schemas.
- The CLI invocation parameters (including the +1 probe trick for default mode).
- Help-doc worked examples (they already described leading-N behaviour).
