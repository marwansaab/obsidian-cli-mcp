# Research: Fix Search Truncation

**Branch**: `053-fix-search-truncation` | **Date**: 2026-05-27

## R1 — Root Cause: Sort-After-Slice Order of Operations

**Decision**: The bug is a sort-after-slice ordering error, not a slice-direction error.

**Rationale**: All three truncation code paths in the current codebase follow the pattern:

```
CLI results (CLI-determined order) → filter .md → slice(0, appliedCap) → sort deterministically
```

The `.slice(0, appliedCap)` call is already taking a leading-N slice — but from the **CLI's return order**, which is non-deterministic from the wrapper's perspective (upstream is a black box per the spec's Assumptions). The subsequent `.sort()` then re-orders only the already-truncated subset. The caller sees a sorted subset of an **arbitrary** N items, not the first N items of the deterministic ordering.

The fix is to swap the order: sort ALL results first, THEN slice the leading N:

```
CLI results → filter .md → sort deterministically → slice(0, appliedCap)
```

**Alternatives considered**:

| Alternative | Rejected because |
|-------------|------------------|
| Change `.slice(0, N)` to `.slice(-N)` | The slice direction is already correct (leading); the problem is what collection it operates on |
| Request upstream CLI to sort before returning | Out of scope per spec Assumptions; upstream is a black box |
| Add a post-slice re-sort | Already present — the re-sort is the wrong fix because it sorts an arbitrary subset |

## R2 — Affected Code Paths

Three independent truncation sites, all in the post-CLI pipeline:

| Site | File | Lines | Current pattern |
|------|------|-------|----------------|
| search default mode | `src/tools/search/handler.ts` | 144–148 | `mdOnly → slice → sort()` |
| search line mode | `src/tools/search/handler.ts` | 113–128 | `flat → slice → sort(path,line)` |
| context_search | `src/tools/context_search/handler.ts` | 135–150 | `flat → slice → sort(path,line)` |

Each site applies the same swap: move the `.sort()` call before the `.slice()` call, operating on the full untruncated collection. The truncation detection logic (`cliFileCapFired`, `flatExceedsCap`, `mdOnly.length === appliedCap + 1`) is unaffected — it reads from the pre-sort, pre-slice collections.

## R3 — Truncation Detection Is Sort-Order-Independent

**Decision**: The truncation detection signals do not depend on result ordering and need no change.

**Rationale**:

- **Default mode probe trick**: CLI is invoked with `limit = appliedCap + 1`. If the CLI returns exactly `appliedCap + 1` items (after `.md` filter), `truncated = true`. This is a count-based check on the filtered set, independent of ordering.
- **Line-mode dual signal**: `cliFileCapFired = mdOnly.length === appliedCap` (file-count signal) and `flatExceedsCap = flat.length > appliedCap` (flat-match-count signal). Both are count-based, independent of ordering.
- The conservative `truncated: true` when count equals limit (FR-005) is preserved by construction: the detection runs on the untruncated collection, and the counts don't change when you sort before slicing.

## R4 — Help-Doc Worked Examples Already Describe Leading-N

**Decision**: No help-doc edits required. The worked examples in `docs/tools/search.md` (Example 4) and `docs/tools/context_search.md` (Example 3) use illustrative filenames (`a.md`, `b.md`, `c.md` / `Daily/2024-01-01.md`, ..., `Worknotes/team.md`) that are consistent with leading-N truncation of a deterministic sort. After the runtime fix lands, the worked examples match the runtime output without spec-side edits.

**Alternatives considered**: Updating the help-doc examples to use fixture-vault filenames — rejected because the current examples are already correct and more readable than fixture-specific names.

## R5 — Existing Tests Cover Count and Flag, Not Entry Identity

**Decision**: Existing truncation tests (Q-10 through Q-14 in `search/handler.test.ts`; US3 truncation tests in `context_search/handler.test.ts`) verify `count`, `truncated`, and array length but do NOT assert which specific entries survive truncation. New tests are needed to verify the leading-N entry identity.

**Rationale**: The existing tests use sequentially-named fixtures (`f000.md`, `f001.md`, ...) where the CLI stub returns them in sorted order anyway, so the sort-before-slice vs. slice-before-sort distinction is invisible. To expose the bug, tests must supply CLI results in a deliberately unsorted order and assert that the returned entries match the first N of the deterministic sort.
