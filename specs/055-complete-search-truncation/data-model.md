# Phase 1 Data Model: Complete Search Truncation

This BI changes no Zod schemas and introduces no new entities. The "data model" here is the **transformation pipeline** inside the two handlers — the order of operations and the data each stage sees. The published input/output shapes (`searchInputSchema`, `searchDefaultOutputSchema`, `searchLineOutputSchema`, `contextSearchInputSchema`, `contextSearchOutputSchema`) are unchanged.

## Conceptual entities (unchanged shapes, corrected scope)

| Entity | Definition | Change |
|--------|------------|--------|
| **Match set** | Every vault note (default mode) or per-line match record (line / context mode) whose content satisfies the query. | Scope corrected: the wrapper now obtains the **entire** match set from upstream, not the upstream-clipped leading-N subset. No shape change. |
| **Path-ascending ordering** | Total order over the match set: default mode `String.sort()` UTF-16 ascending over paths; line/context mode `(path asc, line asc)`. | Unchanged — same comparator as BI-0084. |
| **`appliedCap`** | `input.limit ?? DEFAULT_CAP` (`DEFAULT_CAP = 1000`). | Role narrowed: now **only** the wrapper-side output-slice bound. No longer forwarded to upstream (FR-010). |
| **`truncated`** | `z.literal(true).optional()` — present only when truncation fires. | Firing condition re-derived against the full collection; observable behaviour preserved per the truth table below. |
| **`count`** | `=== returned-array length`, enforced by output-schema `.refine`. | Unchanged. |

## Pipeline transformation

### Before (current — buggy)

```
caller limit ──► forwarded to upstream (default: cap+1; line/context: cap)
                      │
                      ▼
            upstream clips to leading-N of ITS OWN opaque order   ◄── bug: non-representative subset
                      │
                      ▼
            wrapper sorts the clipped subset path-ascending
                      │
                      ▼
            wrapper slices to appliedCap
```

### After (fixed)

```
caller limit ──► appliedCap (wrapper-side output bound only; NOT forwarded)
                      │
upstream call carries NO limit ──► upstream returns the FULL match set
                      │
                      ▼
            wrapper sorts the FULL set path-ascending     ◄── leading-N now computed over everything
                      │
                      ▼
            wrapper slices to appliedCap  ──► leading N of the full deterministic ordering
```

## `truncated` firing — per-mode rule and truth table

Let `S` = full-collection size for the mode (`mdOnly.length` for default; `flat.length` for line/context). All comparisons are against `appliedCap`.

| Mode | Rule | Reason |
|------|------|--------|
| `search` default | `truncated = S > appliedCap` | Precise. Preserves the current default-mode character (the `cap+1` probe fired only on a strict exceed). |
| `search` line | `truncated = S >= appliedCap` | Conservative. Preserves the Out-of-Scope-mandated fire at count==limit-with-no-drop. |
| `context_search` | `truncated = S >= appliedCap` | Same as line mode. |

| Mode | S vs cap | drop? | `truncated` | `count` |
|------|----------|-------|-------------|---------|
| default | S > cap | yes | `true` | cap |
| default | S == cap | no | absent | cap |
| default | S < cap | no | absent | S |
| line / context | S > cap | yes | `true` | cap |
| line / context | S == cap | no | `true` | cap |
| line / context | S < cap | no | absent | S |

`trimmed = sorted.slice(0, appliedCap)` is correct in every row (`slice` is a no-op when `S <= cap`).

## Acceptance-criteria trace

| Spec scenario | Mode | S | cap | Expected | Pipeline result |
|---------------|------|---|-----|----------|-----------------|
| search, 5 notes, limit 2 → body-1,2; count 2; truncated true | default | 5 | 2 | body-1,body-2; count 2; truncated true | sort→[body-1..5]; slice(0,2)→[body-1,body-2]; 5>2→truncated ✓ |
| search, 5 notes, limit 3 → body-1,2,3 | default | 5 | 3 | body-1,2,3 | slice(0,3)→[body-1,2,3]; 5>3→truncated ✓ |
| search, total ≤ limit → all, path-asc, no drop | default | ≤cap | — | all, sorted, no drop | sort; slice no-op ✓ |
| context_search, 5 notes, limit 2 → cover body-1,2; count 2; truncated true | context | ≥5 | 2 | body-1,body-2 matches; count 2; truncated true | sort→path-asc; slice(0,2); S≥2→truncated ✓ |
| context_search, total ≤ limit → all, path-asc, no drop | context | ≤cap | — | all, sorted, no drop | sort; slice no-op; truncated only if S==cap ✓ |
