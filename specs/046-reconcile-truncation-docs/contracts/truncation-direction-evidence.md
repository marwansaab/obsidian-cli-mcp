# Probe evidence — Truncation visible-subset reconciliation (BI-046)

> **Status — Phase 1 stub.** This file is created during `/speckit-plan` with the structure locked but the per-probe rows empty. `/speckit-implement` populates the rows after running the FR-012 probe gate per [../quickstart.md](../quickstart.md) Step 1. The file is held to **mirror discipline** per spec.md Q1: every field below MUST appear on the corresponding canonical TC page; no fact is introduced here that the TC pages do not already carry.

**Probe date**: _to be filled at implement-time_
**Supersedes (for `search` and `context_search` only)**: [../../042-close-audit-findings/contracts/truncation-direction-evidence.md](../../042-close-audit-findings/contracts/truncation-direction-evidence.md) — the leading-of-sorted-set claim recorded there is empirically false for `search` and `context_search`; the `backlinks` row in that older file remains current.
**Canonical evidence (source of truth)**: `[[TC-00306]]` (search default + line modes) and `[[TC-00328]]` (context_search). The wrapper-repo cloner who lacks vault access reads this file as an offline mirror.

## Version triple (per spec.md Q3)

| Component | Value | Capture context |
|-----------|-------|-----------------|
| Wrapper package version | `@marwansaab/obsidian-cli-mcp@v0.7.1` | PR-time, per FR-012 anchor pin |
| Obsidian Integrated CLI plugin version | _to be filled at implement-time_ | probe-time host fact; record `unknown` if unobtainable (Q3 — degraded-reproducibility signal beats silent omission) |
| Obsidian desktop app version | _to be filled at implement-time_ | probe-time host fact; record `unknown` if unobtainable |

## Methodology

Empirical probe — NOT a code-read. Each probe invokes the MCP tool with the BI-0011 fixture corpus and `limit: 2`, captures the response (the "observed visible subset"), and separately re-runs the same probe with `limit` ≥ the full result set to derive (a) the engine pre-sort response and (b) the full sorted result set. The delta between the observed visible subset and the leading slice of the full sorted result set is what falsifies the BI-042 claim for `search` and `context_search`. See [../research.md](../research.md) Decision 1 for the why and Decision 3 for the dual-mode probe methodology.

## Per-probe rows

### P1 — `search` default mode (FR-001..FR-003)

| Field | Value |
|-------|-------|
| Probe ID | `P1-search-default` |
| Tool | `search` |
| Mode | `default` (no `context_lines`) |
| Upstream subcommand | `obsidian search` |
| Query | _to be filled_ |
| Folder | _to be filled_ |
| Limit | `2` |
| Observed visible subset (response order) | _to be filled_ |
| Engine pre-sort response (full, before wrapper sort) | _to be filled_ |
| Full sorted result set (output sort key: `path` asc) | _to be filled_ |
| Slice direction within engine pre-sort | _to be filled — expected `LEADING` per BI-042 code-read; v0.7.1 empirical confirmation required_ |
| Engine natural sort order | _to be filled — observation, not assumption_ |
| Canonical evidence | `[[TC-00306]]` (v0.7.1 default-mode row) |

### P2 — `search` line mode (FR-001..FR-003, FR-012 split-condition input)

| Field | Value |
|-------|-------|
| Probe ID | `P2-search-line` |
| Tool | `search` |
| Mode | `line` (`context_lines: true`) |
| Upstream subcommand | `obsidian search:context` (shared with `context_search` per research.md Decision 3) |
| Query | _to be filled_ |
| Folder | _to be filled_ |
| Limit | `2` |
| Observed visible subset (response order) | _to be filled_ |
| Engine pre-sort response (full, before wrapper sort) | _to be filled_ |
| Full sorted result set (output sort key: `path` asc, `line` asc) | _to be filled_ |
| Slice direction within engine pre-sort | _to be filled_ |
| Engine natural sort order | _to be filled_ |
| Canonical evidence | `[[TC-00306]]` (v0.7.1 line-mode row) OR new TC if line-mode row is added separately |

**FR-012 outcome decision**: comparing P1 vs P2 — if findings match, `search.md` truncation section is a single block with "applies to both modes" sentence; if they diverge, the section splits into per-mode subsections. Decision recorded at implement-time below this row.

### P3 — `context_search` (FR-004..FR-006)

| Field | Value |
|-------|-------|
| Probe ID | `P3-context_search` |
| Tool | `context_search` |
| Mode | `N/A` (single-shape) |
| Upstream subcommand | `obsidian search:context` |
| Query | _to be filled_ |
| Folder | _to be filled_ |
| Limit | `2` |
| Observed visible subset (response order) | _to be filled_ |
| Engine pre-sort response (full, before wrapper sort) | _to be filled_ |
| Full sorted result set (output sort key: `path` asc, `line` asc) | _to be filled_ |
| Slice direction within engine pre-sort | _to be filled_ |
| Engine natural sort order | _to be filled_ |
| Canonical evidence | `[[TC-00328]]` |

### P4 — `backlinks` parity sanity check (informs FR-008 + FR-013 validity)

| Field | Value |
|-------|-------|
| Probe ID | `P4-backlinks-parity` |
| Tool | `backlinks` |
| Mode | `specific` |
| Upstream subcommand | `obsidian eval` (per backlinks template) |
| Vault | _to be filled_ |
| Target (path) | _to be filled_ |
| Limit | `2` |
| Observed visible subset (response order) | _to be filled — expected: leading-of-sorted-set per existing claim_ |
| Full sorted result set (output sort key: `source` UTF-16 asc) | _to be filled_ |
| Confirms FR-008 + FR-013 still valid at v0.7.1? | _to be filled — YES / NO / DETAILS_ |

**Decision branch**: if P4 confirms `backlinks` still slices leading-of-sorted-set, FR-008 (byte-identical) and FR-013 (cohort-divergence sentence) stand. If P4 contradicts the assumption, STOP and escalate per [../research.md](../research.md) Decision 3 outcome table — the BI may need re-scoping.

## Per-tool summary (for the inline anchor in the doc body)

### `search` (per FR-003)

> _Filled at implement-time after P1 and P2 land. Form: "Engine `obsidian search` (default) / `obsidian search:context` (line) returns matches in `<engine natural sort order>` order; wrapper takes the LEADING N from that pre-sort response, then re-sorts the slice by `path asc, line asc` for output. The visible subset is therefore NOT the leading slice of the sorted result set — see P1/P2 above."_

Back-link: `[[TC-00306]]`.

### `context_search` (per FR-006)

> _Filled at implement-time after P3 lands. Same prose template as `search` per-tool summary, scoped to `obsidian search:context`._

Back-link: `[[TC-00328]]`.

## Comparison to BI-042 (for the cohort-divergence sentence per FR-013)

The BI-042 evidence file recorded slice direction by **code-read**, concluding `LEADING` based on `flat.slice(0, appliedCap)` in `src/tools/search/handler.ts:125`. The code-read was technically correct but incomplete — it observed the wrapper-side slice direction without distinguishing that the slice operates on the engine **pre-sort response**, not on the output-sorted set. For `backlinks` the two are equivalent (the eval JS sorts BEFORE slicing per `src/tools/backlinks/_template.ts:20-23`). For `search` / `context_search` they are NOT equivalent (the wrapper slices BEFORE sorting). The cohort thus diverges at the runtime layer, even though all three call `Array.prototype.slice(0, cap)` somewhere — what differs is whether the array passed to `slice` is already sorted by the wrapper's output sort key.

This file does NOT name the adjacent runtime-reconciliation BI by number, per spec.md Q5 (stale-link risk on BI renumbering).
