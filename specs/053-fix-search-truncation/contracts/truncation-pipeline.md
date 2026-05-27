# Contract: Truncation Pipeline Order

**Status**: Proposed | **Date**: 2026-05-27

## Scope

Defines the required order of operations in the post-CLI truncation pipeline for `search` (both modes) and `context_search`. This contract is the normative reference for the sort-before-slice invariant introduced by this BI.

## Invariant

For every code path that applies `limit`-driven truncation:

```
sort(full_collection) → slice(sorted, 0, appliedCap)
```

The `.sort()` call MUST operate on the full untruncated collection (after `.md` filtering). The `.slice(0, appliedCap)` call MUST operate on the already-sorted collection. Reversing this order (slice-then-sort) is the bug this BI fixes and constitutes a regression.

## Affected Sites

| Handler | Mode | Sort comparator | Slice expression |
|---------|------|-----------------|-----------------|
| `executeSearch` | default | `.sort()` (UTF-16 ascending) | `.slice(0, appliedCap)` |
| `executeSearch` | line | `.sort((a,b) => path asc, line asc)` | `.slice(0, appliedCap)` |
| `executeContextSearch` | — | `.sort((a,b) => path asc, line asc)` | `.slice(0, appliedCap)` |

## Truncation Detection

Truncation detection (`cliFileCapFired`, `flatExceedsCap`, `mdOnly.length === appliedCap + 1`) MUST read from the pre-sort, pre-slice collection. These are count-based signals and are order-independent.

## Verification

Each site MUST have at least one test that:
1. Supplies CLI results in a deliberately unsorted order (not matching the deterministic sort).
2. Invokes the handler with a `limit` that triggers truncation.
3. Asserts that the returned entries are exactly the first N entries of the deterministic sort applied to the full collection — not an arbitrary N from the CLI order.
