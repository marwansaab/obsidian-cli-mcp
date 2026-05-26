# Probe evidence — Truncation slice direction (Story 6)

> **Superseded by BI-046 for `search` and `context_search`** — current truth at [../../046-reconcile-truncation-docs/contracts/truncation-direction-evidence.md](../../046-reconcile-truncation-docs/contracts/truncation-direction-evidence.md). The leading-of-sorted-set claim recorded below is empirically false for `search` and `context_search` on the engine pre-sort response surface. The `backlinks` row below remains current (sort-then-slice template; leading-of-sorted-set holds by construction).

**Probe date**: 2026-05-21
**Binary version**: Obsidian CLI 1.12.7 (matches T001 anchor)
**Contract**: [contracts/truncation-direction-roster.md](truncation-direction-roster.md)

## Methodology

`search` and `context_search` slice direction is captured by code-read at `src/tools/search/handler.ts:125` and `src/tools/context_search/handler.ts:147` (both `flat.slice(0, appliedCap)` — LEADING). `backlinks` slice direction is captured by code-read at `src/tools/backlinks/_template.ts:23` (`sources.slice(0, cap)` — LEADING). The wrapper does not invert or re-order upstream's emitted source list before slicing; the slice operates on the post-sort, post-filter array.

Because the slicing happens wrapper-side (frozen JS template embedded in the eval payload), the direction is structurally deterministic and does not require a per-vault empirical probe to confirm. A wider truncation cap reduction would still slice from the front of the sorted array.

## Per-tool record

### `search`

```
Slice direction:    LEADING (first N)
Source-of-truth:    src/tools/search/handler.ts:125 — `flat.slice(0, appliedCap)`
Sort key:           path asc, line asc (handler.ts:127)
Probe date:         2026-05-21 (code-read)
```

### `context_search`

```
Slice direction:    LEADING (first N)
Source-of-truth:    src/tools/context_search/handler.ts:147 — `flat.slice(0, appliedCap)`
Sort key:           path asc, line asc (handler.ts:149)
Probe date:         2026-05-21 (code-read)
```

### `backlinks`

```
Slice direction:    LEADING (first N)
Source-of-truth:    src/tools/backlinks/_template.ts:23 — `sources.slice(0, cap)`
Sort key:           source-path asc (UTF-16 string sort on the deduplicated source array at template line 20: `allKeys.filter(...).sort()`)
Probe date:         2026-05-21 (code-read, anchored by the BI-025/BI-037 T0 probes that established the template's correctness)
```

## Cohort-wide finding

All three cohort tools (`search`, `context_search`, `backlinks`) slice **LEADING** — the response carries the FIRST `<cap>` entries of the sorted result set. The cohort is **UNIFORM** on slice direction.

Per the contract: **Branch A applies**. Each tool's output-contract section names the LEADING slice direction. The divergence call-out is **dropped** (no sibling carries the opposite direction). The forward-pointer note about runtime standardisation shipping on its own spec branch is included as written in the contract.
