# Contract: Truncation slice direction documented per tool

**Story**: User Story 6 (FR-018, FR-019, FR-020)
**Surface**: per-tool `docs/tools/<name>.md` output-contract section
**Cohort**: `search`, `context_search`, `backlinks`

## Slice direction from code-read (as of 2026-05-21)

| Tool | Slice direction | Source |
|---|---|---|
| `search` | LEADING (first N) | `src/tools/search/handler.ts:125` — `flat.slice(0, appliedCap)` |
| `context_search` | LEADING (first N) | `src/tools/context_search/handler.ts:147` — `flat.slice(0, appliedCap)` |
| `backlinks` | TBD (passthrough from upstream eval) | `src/tools/backlinks/handler.ts:77` — `if (validated.data.truncated === true) out.truncated = true;` (no wrapper-side slicing); upstream determines direction |

## Probe required (Phase 2)

Against a target note whose filename basename is unique vault-wide AND whose cross-folder source count exceeds the `backlinks` cap, capture:
- The full ordered source list emitted by upstream
- The truncated subset returned by the wrapper
- Compare: is the truncated subset the leading entries or the trailing entries of the full list?

Persisted to `truncation-direction-evidence.md` during `/speckit-implement`.

## Doc-edit deliverable per tool

Single sentence in the output-contract section:

> When `truncated: true`, the response carries the FIRST `<cap>` entries of the sorted result set (the leading subset).

Plus, only if the cohort produces divergent directions (i.e., `backlinks` slices trailing while `search` / `context_search` slice leading, or vice versa), a divergence call-out is added next to the slice statement on each affected tool:

> Sibling tool `<name>` uses the OPPOSITE slice direction (trailing subset). Agents pinning page-direction expectations across tools must check per tool.

If all three cohort tools produce the SAME direction (all leading), the divergence call-out is dropped; the doc text reduces to the slice-direction statement alone. The Out-of-Scope note about the runtime backlog item that standardises the slice direction across the sibling cohort is included in either case as a forward-pointer.

## Sort order pin

The "sorted set" referenced in the doc-edit text refers to the wrapper's existing sort discipline per tool:
- `search`: path asc, line asc (`handler.ts:127` `[...trimmed].sort(...)`)
- `context_search`: path asc, line asc (`handler.ts:149`)
- `backlinks`: source-path asc (per upstream eval order; passthrough)

The slice direction interacts with the sort order — LEADING + path-asc means "lowest paths in the sorted order" are kept; TRAILING + path-asc would mean "highest paths in the sorted order." The doc-edit text MUST name both the sort key and the slice direction so the cumulative behaviour is unambiguous.
