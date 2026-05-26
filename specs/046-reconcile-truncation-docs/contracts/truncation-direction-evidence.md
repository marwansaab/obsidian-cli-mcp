# Probe evidence — Truncation visible-subset reconciliation (BI-046)

> **Status — populated.** Per-probe rows captured during `/speckit-implement` on 2026-05-26 against wrapper `@marwansaab/obsidian-cli-mcp@v0.7.5`. This file is held to **mirror discipline** per spec.md Q1: every field below MUST appear on the corresponding canonical TC page; no fact is introduced here that the TC pages do not already carry. Cloners of this wrapper repo without vault access read this file as an offline mirror of the canonical TC pages.

**Probe date**: 2026-05-26
**Supersedes (for `search` and `context_search` only)**: [../../042-close-audit-findings/contracts/truncation-direction-evidence.md](../../042-close-audit-findings/contracts/truncation-direction-evidence.md) — the leading-of-sorted-set claim recorded there is empirically false for `search` and `context_search` on the engine pre-sort response surface; the `backlinks` row in that older file remains current (sort-then-slice template — see P4 below).
**Canonical evidence (source of truth)**: `[[TC-00306]]` (search default + line modes) and `[[TC-00328]]` (context_search). The wrapper-repo cloner who lacks vault access reads this file as an offline mirror.

## Version triple (per spec.md Q3)

| Component | Value | Capture context |
|-----------|-------|-----------------|
| Wrapper package version | `@marwansaab/obsidian-cli-mcp@v0.7.5` | PR-time, per FR-012 anchor pin |
| Obsidian Integrated CLI plugin version | `1.12.7` (bundled with desktop app on this host; not surfaced as a separate community-plugin id) | probe-time host fact |
| Obsidian desktop app version | `1.12.7` (installer 1.12.7) | probe-time host fact, per `obsidian version` |

## Methodology

Empirical probe — NOT a code-read. Each MCP-wrapper probe is invoked via the published stdio MCP server (`dist/index.js`) so the wrapper-side slice + sort fires exactly as a real MCP client would observe. Each probe also captures the upstream subcommand's pre-sort response by invoking the underlying `obsidian` binary directly with `limit ≥ full result set`, so the delta between the visible subset and the leading slice of the full sorted result set is reproducible.

The delta between the observed visible subset and the leading slice of the full sorted result set is what falsifies the BI-042 claim for `search` and `context_search`. See [../research.md](../research.md) Decision 1 for the why and Decision 3 for the dual-mode probe methodology.

## Per-probe rows

### P1 — `search` default mode (FR-001..FR-003)

| Field | Value |
|-------|-------|
| Probe ID | `P1-search-default` |
| Tool | `search` |
| Mode | `default` (no `context_lines`) |
| Upstream subcommand | `obsidian search` |
| Query | `Zb1q9k2xBody` |
| Folder | `Fixtures/BI-0011` |
| Limit | `2` |
| Observed visible subset (response order) | `["Fixtures/BI-0011/body-4.md", "Fixtures/BI-0011/body-5.md"]` |
| Engine pre-sort response (limit+1 = 3, what the wrapper requests internally) | `["Fixtures/BI-0011/body-5.md", "Fixtures/BI-0011/body-4.md", "Fixtures/BI-0011/body-3.md"]` |
| Engine pre-sort response (full, `limit=100`) | `["Fixtures/BI-0011/body-5.md", "Fixtures/BI-0011/body-4.md", "Fixtures/BI-0011/body-3.md", "Fixtures/BI-0011/body-2.md", "Fixtures/BI-0011/body-1.md"]` |
| Full sorted result set (output sort key: `path` asc) | `["Fixtures/BI-0011/body-1.md", "Fixtures/BI-0011/body-2.md", "Fixtures/BI-0011/body-3.md", "Fixtures/BI-0011/body-4.md", "Fixtures/BI-0011/body-5.md"]` |
| Slice direction within engine pre-sort | `LEADING` (the wrapper applies `mdOnly.slice(0, appliedCap)` after detecting cap-clip via `mdOnly.length === appliedCap + 1`; see `src/tools/search/handler.ts` `executeSearch` default branch) |
| Engine natural sort order | reverse basename-numeric — `body-5, body-4, body-3, body-2, body-1`. Not the wrapper's output sort key (`path asc`), not byte-identical to filesystem stat order on this host. Upstream-`obsidian search` emission order is unstable across upstream/vault state changes (the v0.7.1 TC-00306 row recorded `[body-2, body-5]` against the same fixture — the slice rule is stable, the engine emission order is not). |
| Canonical evidence | `[[TC-00306]]` (v0.7.5 default-mode row) |

**Falsification of the BI-042 leading-of-sorted-set claim**: the full sorted result set is `[body-1, body-2, body-3, body-4, body-5]`; the leading 2 of that set would be `[body-1, body-2]`. The visible subset is `[body-4, body-5]`. Therefore the visible subset is NOT the leading slice of the sorted set; it is the leading slice of the engine pre-sort response, re-sorted by the wrapper's output sort key before being returned.

### P2 — `search` line mode (FR-001..FR-003, FR-012 split-condition input)

| Field | Value |
|-------|-------|
| Probe ID | `P2-search-line` |
| Tool | `search` |
| Mode | `line` (`context_lines: true`) |
| Upstream subcommand | `obsidian search:context` (shared with `context_search` per research.md Decision 3) |
| Query | `Zb1q9k2xBody` |
| Folder | `Fixtures/BI-0011` |
| Limit | `2` |
| Observed visible subset (response order) | `[{path: "Fixtures/BI-0011/body-4.md", line: 3, text: "Zb1q9k2xBody marker line in body-4."}, {path: "Fixtures/BI-0011/body-5.md", line: 3, text: "Zb1q9k2xBody marker line in body-5."}]` |
| Engine pre-sort response (full, `limit=100`) | `[{file: "Fixtures/BI-0011/body-5.md", matches: [{line: 3, ...}]}, {file: "Fixtures/BI-0011/body-4.md", ...}, {file: "Fixtures/BI-0011/body-3.md", ...}, {file: "Fixtures/BI-0011/body-2.md", ...}, {file: "Fixtures/BI-0011/body-1.md", ...}]` (file order; one match per file in this fixture) |
| Full sorted result set (output sort key: `path` asc, `line` asc) | `[{body-1@L3}, {body-2@L3}, {body-3@L3}, {body-4@L3}, {body-5@L3}]` (one match per file in this fixture) |
| Slice direction within engine pre-sort | `LEADING`. Line-mode handler requests upstream at `limit = appliedCap` (not `+1` — see `src/tools/search/handler.ts` `executeSearch` line-mode branch). Upstream's file-cap fires when `mdOnly.length === appliedCap`, marking `truncated = true`. The wrapper's flatten/slice/sort then operates on the leading-2-files-of-pre-sort, sorted by `path asc, line asc`. |
| Engine natural sort order | reverse basename-numeric — `body-5, body-4, body-3, body-2, body-1` (file order). Same as `obsidian search` on this fixture/host, BUT both subcommands' emission orders are unstable across upstream/vault state changes — co-equivalence on this host at this probe date is not a guaranteed invariant. |
| Canonical evidence | `[[TC-00306]]` (v0.7.5 line-mode row) — same TC as P1 since the visible-subset rule matches; no separate TC needed |

**FR-012 outcome decision (locked at implement-time)**: P1 ≡ P2 — the visible-subset rule (LEADING N of engine pre-sort response, re-sorted by `path asc` for default / `path asc, line asc` for line) is identical across the two modes. The `search.md` truncation section is therefore a **single block** with an explicit "applies to both default and line mode" sentence, NOT per-mode subsections. Single-block + dual-mode-sentence is the FR-012 happy path.

### P3 — `context_search` (FR-004..FR-006)

| Field | Value |
|-------|-------|
| Probe ID | `P3-context_search` |
| Tool | `context_search` |
| Mode | `N/A` (single-shape) |
| Upstream subcommand | `obsidian search:context` |
| Query | `Zb1q9k2xBody` |
| Folder | `Fixtures/BI-0011` |
| Limit | `2` |
| Observed visible subset (response order) | `[{path: "Fixtures/BI-0011/body-4.md", line: 3, text: "Zb1q9k2xBody marker line in body-4."}, {path: "Fixtures/BI-0011/body-5.md", line: 3, text: "Zb1q9k2xBody marker line in body-5."}]` |
| Engine pre-sort response (full) | `[{file: "Fixtures/BI-0011/body-5.md", ...}, ..., {file: "Fixtures/BI-0011/body-1.md", ...}]` — identical to P2 (shared upstream subcommand against the same fixture/host) |
| Full sorted result set (output sort key: `path` asc, `line` asc) | `[{body-1@L3}, {body-2@L3}, {body-3@L3}, {body-4@L3}, {body-5@L3}]` |
| Slice direction within engine pre-sort | `LEADING` (per `src/tools/context_search/handler.ts` — same wrapper-side flatten/slice/sort pipeline as `search` line mode) |
| Engine natural sort order | reverse basename-numeric — `body-5, body-4, body-3, body-2, body-1` (file order); same as P2 |
| Canonical evidence | `[[TC-00328]]` |

**Cross-check with P2**: P2 and P3 byte-match (same visible subset, same line numbers, same texts). This confirms research.md Decision 3's structural claim — the shared `obsidian search:context` upstream subcommand emits the same pre-sort response for the same query+folder+limit regardless of which wrapper-side tool initiates the call. The two are wrapper-side-distinct (different handlers) but upstream-side-equivalent.

### P4 — `backlinks` parity sanity check (informs FR-008 + FR-013 validity)

| Field | Value |
|-------|-------|
| Probe ID | `P4-backlinks-parity` |
| Tool | `backlinks` |
| Mode | `specific` |
| Upstream subcommand | `obsidian eval` (per backlinks template) |
| Vault | `TestVault-Obsidian-CLI-MCP` |
| Target (path) | `Fixtures/BI-0015/TruncTarget.md` (the canonical 4-source backlinks truncation fixture per `[[TC-00343]]`; the BI-0011 corpus does not host a backlinks-shaped fixture, so the parity check uses the BI-0015 truncation fixture instead — same fixture the TC-00343 lock has been running against since v0.6.4) |
| Limit | `2` |
| Observed visible subset (response order) | `[{source: "Fixtures/BI-0015/TruncSources/A.md"}, {source: "Fixtures/BI-0015/TruncSources/B.md"}]` |
| Full sorted result set (output sort key: `source` UTF-16 asc) | `[{source: "A.md"}, {source: "B.md"}, {source: "C.md"}, {source: "D.md"}]` (prefix omitted for brevity; full paths are `Fixtures/BI-0015/TruncSources/{A,B,C,D}.md`) |
| Confirms FR-008 + FR-013 still valid at v0.7.5? | **YES** — `backlinks` still slices leading-of-sorted-set: visible subset `[A, B]` is the leading 2 of the full sorted result set `[A, B, C, D]`. The eval template's `allKeys.filter(...).sort()` runs BEFORE `sources.slice(0, cap)` per `src/tools/backlinks/_template.ts`, so the slice operates on an already-sorted array — leading-of-sorted-set is the visible subset by construction. FR-008's "byte-identical preservation of `docs/tools/backlinks.md`" rule stands; FR-013's "cohort-divergence sentence names `backlinks`" rule stands. No BI re-scoping required. |

## Per-tool summary (for the inline anchor in the doc body)

### `search` (per FR-003)

> Engine subcommand `obsidian search` (default mode) and `obsidian search:context` (line mode) both return matches in **reverse basename-numeric order on this fixture/host** (engine pre-sort response — the engine natural sort order is unstable across upstream/vault state changes, so future probes may surface a different ordering). The wrapper takes the **leading N** of that pre-sort response (`mdOnly.slice(0, appliedCap)` in default mode; the file-cap path in line mode), then **re-sorts the slice** by `path asc` (default) / `path asc, line asc` (line) before returning. **The visible subset is therefore NOT the leading slice of the sorted result set**; it is the leading slice of the engine pre-sort response, then output-sorted. See P1/P2 above for the empirical capture.

Back-link: `[[TC-00306]]`.

### `context_search` (per FR-006)

> Engine subcommand `obsidian search:context` returns matches in **reverse basename-numeric order on this fixture/host** (engine pre-sort response — unstable across upstream/vault state changes). The wrapper flattens to per-line entries, **leading-N-slices** the flattened or file-capped array, then **re-sorts the slice** by `path asc, line asc` before returning. **The visible subset is therefore NOT the leading slice of the sorted result set**; it is the leading slice of the engine pre-sort response, then output-sorted. See P3 above for the empirical capture.

Back-link: `[[TC-00328]]`.

## Comparison to BI-042 (for the cohort-divergence sentence per FR-013)

The BI-042 evidence file recorded slice direction by **code-read**, concluding `LEADING` based on `flat.slice(0, appliedCap)` in `src/tools/search/handler.ts` and `src/tools/context_search/handler.ts`. The code-read was technically correct but incomplete — it observed the wrapper-side slice direction without distinguishing that the slice operates on the engine **pre-sort response**, not on the output-sorted set. For `backlinks` the two are equivalent (the eval JS sorts BEFORE slicing per `src/tools/backlinks/_template.ts`). For `search` / `context_search` they are NOT equivalent (the wrapper slices BEFORE sorting). The cohort thus diverges at the runtime layer, even though all three call `Array.prototype.slice(0, cap)` somewhere — what differs is whether the array passed to `slice` is already sorted by the wrapper's output sort key.

This file does NOT name the adjacent runtime-reconciliation BI by number, per spec.md Q5 (stale-link risk on BI renumbering).
