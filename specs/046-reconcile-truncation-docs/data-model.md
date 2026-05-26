# Phase 1 Data Model — Reconcile Truncation Docs

**Feature**: 046-reconcile-truncation-docs
**Date**: 2026-05-26
**Scope note**: Doc-only feature; "data model" here describes the **mirror-file artifact** under `specs/046-reconcile-truncation-docs/contracts/` and the **inline anchor summary** in each corrected doc — not a runtime data shape. No code-level entities, no Zod schemas, no DB tables.

## Entity 1 — Inline anchor summary

**Where**: One-line summary inserted into each corrected truncation section in `docs/tools/search.md` (FR-001..FR-003) and `docs/tools/context_search.md` (FR-004..FR-006). One summary per probe; if FR-012 splits `search.md` into per-mode subsections, each subsection carries its own summary.

**Fields** (per Q1 + Q3 budget — one line, no full sorted set, no version triple):

| Field | Type | Constraint | Source |
|-------|------|------------|--------|
| `tool_name` | string | one of `search` / `context_search` | doc identity |
| `probe_inputs.fixture_set` | string | `BI-0011` | spec Q2 anchor input |
| `probe_inputs.limit` | integer | `2` | spec Q2 anchor input |
| `observed_visible_subset` | string | the actual paths/lines returned, in the order they appear in the response | empirical probe output |
| `capture_date` | string | ISO `YYYY-MM-DD` | probe-time host fact |
| `mirror_pointer` | relative-path string | `../../specs/046-reconcile-truncation-docs/contracts/truncation-direction-evidence.md` | mirror file location |

**Format constraint**: The six fields MUST render as a single line of doc prose (not a table, not a code block). Example shape:
`> Probe (BI-0011 fixture, limit=2, captured 2026-MM-DD): visible subset = ["<path-A>", "<path-B>"]. Full sorted set + version triple at [mirror](...).`

**Validation rules**:
- `capture_date` MUST be a real date observed at probe time; backdating is a violation of mirror discipline.
- `mirror_pointer` MUST resolve to an existing file in the same PR.
- `observed_visible_subset` MUST byte-match the corresponding row in the mirror file (mirror-discipline cross-check).

## Entity 2 — Mirror file (wrapper-repo evidence artifact)

**Where**: `specs/046-reconcile-truncation-docs/contracts/truncation-direction-evidence.md`. Single file, parallels BI-042's `specs/042-close-audit-findings/contracts/truncation-direction-evidence.md` structure.

**Sections**:

### 2a. File header

| Field | Type | Constraint |
|-------|------|------------|
| `title` | H1 | "Probe evidence — Truncation visible-subset reconciliation (BI-046)" |
| `probe_date` | ISO date | wall-clock date the probe ran |
| `version_triple.wrapper` | string | `@marwansaab/obsidian-cli-mcp@x.y.z`, PR-time, MUST resolve to `v0.7.1` per FR-012 |
| `version_triple.obsidian_integrated_cli_plugin` | string \| `unknown` | probe-time host fact (Q3) |
| `version_triple.obsidian_desktop_app` | string \| `unknown` | probe-time host fact (Q3) |
| `canonical_backlinks` | wikilink list | `[[TC-00306]]`, `[[TC-00328]]` |
| `superseded_artifact` | relative-path string | `../../042-close-audit-findings/contracts/truncation-direction-evidence.md` |

### 2b. Per-probe rows (one block per FR-012 / FR-007 probe)

| Field | Type | Constraint |
|-------|------|------------|
| `probe_id` | string | `P1-search-default` / `P2-search-line` / `P3-context_search` / `P4-backlinks-parity` |
| `tool` | string | `search` / `context_search` / `backlinks` |
| `mode` | string | `default` / `line` / `N/A` |
| `upstream_subcommand` | string | `obsidian search` / `obsidian search:context` / `obsidian eval` |
| `query` | string | exact probe input |
| `folder` | string \| null | exact probe input |
| `limit` | integer | `2` |
| `observed_visible_subset` | ordered array of strings | the response's visible entries IN RESPONSE ORDER |
| `engine_pre_sort_response` | ordered array of strings | the upstream subcommand's response BEFORE wrapper sort, IF observable |
| `full_sorted_result_set` | ordered array of strings | the would-be result set sorted by the wrapper's output sort key (path asc, line asc for search/context_search; source UTF-16 asc for backlinks), to demonstrate the delta with `observed_visible_subset` |
| `slice_direction_within_pre_sort` | enum | `LEADING` / `TRAILING` / `OTHER` |
| `engine_natural_sort_order` | string | description of what order the engine emits in (e.g., "vault traversal order", "filesystem stat order", "unknown") |

### 2c. Per-tool summary section

| Field | Type | Constraint |
|-------|------|------------|
| `tool` | string | `search` / `context_search` |
| `visible_subset_rule` | string prose | the per-tool sentence the doc body cites |
| `back_link` | wikilink | `[[TC-00306]]` for search, `[[TC-00328]]` for context_search |

**Validation rules**:
- Mirror discipline (FR-007 + Q1): every field value in this file MUST be present on the corresponding TC page. The mirror file MUST NOT introduce facts the TC pages don't carry.
- Version-triple completeness (Q3): each of the three version components records either a real version string OR the literal `unknown`. Silent omission is a violation.
- Cross-check with inline anchor (FR-010): `observed_visible_subset` in this file MUST byte-match `observed_visible_subset` recorded inline in the corresponding doc body.

## Entity 3 — Forward-pointer line in BI-042 evidence file

**Where**: `specs/042-close-audit-findings/contracts/truncation-direction-evidence.md`. Inserted as the first line after the existing H1 (per FR-011 Q2-mechanics decision).

**Fields**:

| Field | Type | Constraint |
|-------|------|------------|
| `superseded_by` | string | `BI-046` |
| `current_truth_pointer` | relative-path string | `../../046-reconcile-truncation-docs/contracts/truncation-direction-evidence.md` |
| `affected_tools` | string | `search` and `context_search` (NOT `backlinks` — `backlinks` row in BI-042 stays correct) |

**Format constraint**: ONE line. Blockquote form. Example shape:
`> **Superseded by BI-046 for `search` and `context_search`** — current truth at [contracts/truncation-direction-evidence.md](../../046-reconcile-truncation-docs/contracts/truncation-direction-evidence.md). The `backlinks` row below remains current.`

**Validation rules**:
- MUST be exactly one line of prose (blockquote permitted).
- MUST NOT alter any other content in the BI-042 file — single-line insertion only.
- MUST explicitly call out that the `backlinks` row in the BI-042 file is still current, so a reader doesn't assume the entire BI-042 file is stale.

## Entity 4 — Cohort-divergence sentence (FR-013)

**Where**: One sentence in each corrected truncation section in `docs/tools/search.md` and `docs/tools/context_search.md`.

**Fields**:

| Field | Type | Constraint |
|-------|------|------------|
| `naming_divergence` | string prose | states that `backlinks` slices the leading subset of the sorted result set while this tool does not |
| `pointer_to_actual_behaviour` | string | "see inline summary" or equivalent in-section reference |
| `forward_pointer_to_runtime_BI` | absent | per Q5, MUST NOT include — stale-link risk |

**Validation rule**: The sentence MUST mention `backlinks` by name (the divergence is cohort-named, not generic). It MUST NOT name the adjacent runtime-reconciliation BI by number.

## Cross-entity invariants

1. **Mirror-pointer reciprocity**: Entity 1 (`mirror_pointer`) ↔ Entity 2 (`title` / file existence). The path each side names MUST resolve to the other.
2. **Forward-pointer reciprocity**: Entity 3 (`current_truth_pointer`) ↔ Entity 2 (`superseded_artifact`). The two MUST name each other.
3. **TC back-link reciprocity**: Entity 2 (`canonical_backlinks`) — the `[[TC-00306]]` and `[[TC-00328]]` wikilinks MUST resolve to live TC pages at PR-merge time. If a TC page is renamed, both ends update in the same PR.
4. **Version-triple consistency**: Entity 2's `version_triple.wrapper` MUST match the `@marwansaab/obsidian-cli-mcp` `package.json` version at PR-merge time (`v0.7.1` for this BI).
5. **No runtime entities**: No Zod schemas added, no error codes added, no MCP tool surfaces added. Constitution Principles II–V N/A is preserved.
