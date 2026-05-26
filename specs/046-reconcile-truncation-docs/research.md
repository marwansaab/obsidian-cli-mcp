# Phase 0 Research — Reconcile Truncation Docs

**Feature**: 046-reconcile-truncation-docs
**Date**: 2026-05-26
**Inputs**: [spec.md](spec.md) (Clarifications session 2026-05-26), `graphify-out/graph.json` (commit-time AST snapshot)

## Purpose

All five spec-level NEEDS CLARIFICATION items were resolved during `/speckit-clarify` (recorded under `spec.md` `## Clarifications` → Session 2026-05-26). This research phase therefore does NOT re-resolve them; it consolidates the framework for the dual-mode probe gate (FR-012), the BI-042-vs-BI-046 reconciliation, and the engine-pre-sort-vs-output-sort distinction that underlies the corrected per-tool descriptions.

## Decision 1 — Why the existing leading-of-sorted-set claim is empirically false

**Decision**: The corrected truncation sections describe the visible subset as the LEADING entries of the **engine pre-sort response**, sliced wrapper-side and then **re-sorted by the wrapper's output sort key** before being returned. Not the leading entries of the sorted output set.

**Rationale**: A code-read against `src/tools/search/handler.ts` (community 9 per `graphify-out/graph.json`) shows the slicing happens BEFORE the output sort is applied. The wrapper invokes upstream `obsidian search` or `obsidian search:context`, receives the engine's pre-sort response, slices `flat.slice(0, appliedCap)` LEADING entries from that pre-sort response, and only THEN sorts by `path asc, line asc` for output. The BI-042 evidence file (`specs/042-close-audit-findings/contracts/truncation-direction-evidence.md`) recorded this as "slice direction: LEADING" without distinguishing that the slice operates on the engine pre-sort response, not on the output-sorted set. The two are only equivalent when the engine pre-sort order happens to match the wrapper's output sort — which is the case for `backlinks` (the eval JS sorts FIRST, then slices) but NOT for `search` / `context_search` (the wrapper slices FIRST, then sorts). That asymmetry is the real cohort divergence FR-013 names.

**Alternatives considered**:
- *Re-validate as "leading of output-sorted set" by changing the wrapper code*: rejected — this is a runtime change, out of scope per FR-009. Tracked separately under the adjacent runtime-reconciliation BI per spec out-of-scope item.
- *Describe both modes generically as "indeterminate subset, sort applied for output"*: rejected — the visible subset IS deterministic (leading of engine pre-sort response). Vagueness does not serve agents trying to pick a narrowing strategy.

## Decision 2 — Why `backlinks` stays byte-identical and is structurally correct as-is

**Decision**: `docs/tools/backlinks.md` truncation section is preserved per FR-008. The existing leading-of-sorted-set claim is empirically true for `backlinks` because its eval template applies `allKeys.filter(...).sort()` BEFORE `sources.slice(0, cap)` (per `src/tools/backlinks/_template.ts:20-23`, as recorded in the BI-042 evidence file).

**Rationale**: The wrapper-side slicing order differs between `backlinks` (sort-then-slice → leading-of-sorted-set is correct) and `search`/`context_search` (slice-then-sort → leading-of-pre-sort-set is what actually happens). Fixing `backlinks.md` would damage a true claim. The cohort-uniformity sentence inside `backlinks.md` is itself now technically false (it asserts `search`/`context_search` slice the leading subset of the sorted set, which they don't), but the user scoped this BI to leave `backlinks.md` unchanged. The residual inconsistency is the explicit Edge Case in `spec.md`.

**Alternatives considered**:
- *Also fix the cohort-uniformity sentence in `backlinks.md`*: rejected per spec scope decision and FR-008.
- *Bundle the `backlinks.md` cohort-sentence fix with the adjacent runtime-reconciliation BI*: noted as a candidate fold target; not decided here.

## Decision 3 — FR-012 dual-mode probe gate: methodology

**Decision**: Before locking the `search.md` truncation-section structure, run two empirical probes against the BI-0011 fixture set at wrapper version `v0.7.5`, `limit: 2`, both recorded on `[[TC-00306]]` (extend with a v0.7.5 line-mode row) OR on a new TC dedicated to the line-mode probe:

| Probe | Upstream command | Tool invocation | Expected pre-sort source |
|---|---|---|---|
| P1 — search default mode | `obsidian search query=<q> path=<folder> format=json limit=3` | `search` tool with no `context_lines` | Upstream `obsidian search` subcommand's emission order |
| P2 — search line mode | `obsidian search:context query=<q> path=<folder> format=json limit=2` | `search` tool with `context_lines: true` | Upstream `obsidian search:context` subcommand's emission order (SAME subcommand used by `context_search`) |
| P3 — context_search | `obsidian search:context query=<q> path=<folder> format=json limit=2` | `context_search` tool | Same as P2 — shared upstream subcommand |
| P4 — backlinks parity check | `obsidian eval ...` (per backlinks template) | `backlinks` tool | Engine `allKeys.filter(...).sort()` output (pre-slice in this tool) |

P1 and P2 cover the FR-012 gate. P3 confirms `context_search` behaviour matches the spec's already-stated divergence. P4 is a parity sanity check — if `backlinks` no longer slices leading-of-sorted-set at v0.7.5 (e.g., upstream changed `getBacklinksForFile()` semantics), FR-013's cohort-divergence sentence is itself wrong and FR-008's preservation rule needs re-examination.

**Outcomes that drive the doc structure**:
- *P1 == P2*: single block in `search.md` truncation section with "applies to both modes" sentence (FR-012 happy path).
- *P1 != P2*: per-mode subsections in `search.md`, each carrying its own inline anchor and its own pointer into the mirror file (FR-012 split path).
- *P3 confirms divergence*: `context_search.md` correction stands as designed.
- *P3 contradicts the assumed divergence*: `context_search.md` correction reverts to per-tool description with no cohort-divergence sentence (FR-013 partial trigger).
- *P4 contradicts backlinks-leading-of-sorted-set*: STOP — escalate to the user; FR-008 + FR-013 are jointly wrong and the BI needs re-scoping.

**Rationale**: Probe-then-write discipline is the same shape the connector Best Practices "explicit `vault=<unfocused>` probe before locking a routing claim" rule applies — name the upstream subcommand, capture both modes, only then lock the doc structure. The shared `obsidian search:context` upstream subcommand between P2 and P3 means the engine pre-sort response should be identical for the same query+folder+limit; that's why running both is a cross-check, not redundant work.

**Alternatives considered**:
- *Trust P3 + the BI-042 code-read for P1/P2*: rejected — the BI-042 read concluded "LEADING" but missed that the slice operates on the pre-sort response. A v0.7.5 code-read at `src/tools/search/handler.ts` should re-confirm, but an empirical probe at v0.7.5 is the source of truth per the spec's "current shipped version" framing.
- *Probe only P1 (default mode) and infer P2 from P3*: rejected — P2 and P3 share the `obsidian search:context` upstream, but the wrapper-side handlers differ (`search` line mode flattens via its own handler at `src/tools/search/handler.ts`; `context_search` has its own handler at `src/tools/context_search/handler.ts`). The wrapper-side flatten may impose a different slice direction. Cannot infer.

## Decision 4 — Mirror file shape and mirror discipline

**Decision**: `specs/046-reconcile-truncation-docs/contracts/truncation-direction-evidence.md` mirrors the relevant rows of canonical TC pages `[[TC-00306]]` and `[[TC-00328]]` for wrapper-repo cloners without vault access. It records: (a) the version triple (wrapper `@marwansaab/obsidian-cli-mcp@v0.7.5`, Obsidian Integrated CLI plugin version, Obsidian desktop app version — `unknown` permitted for any unobtainable component per Q3); (b) per-probe rows (probe inputs, observed visible subset, full sorted result set); (c) back-links to `[[TC-00306]]` and `[[TC-00328]]`. The file holds nothing the TC pages don't already carry.

**Rationale**: Mirror discipline is the explicit Q1 scope decision. The connector Architecture has the same rule for the wrapper-vault mirror — single source of truth lives vault-side, repo mirror is a convenience for cloners. Applying the same discipline here keeps the source-of-truth contract crisp and prevents three-way drift between `docs/tools/*.md` (where the inline summary lives), `specs/046-reconcile-truncation-docs/contracts/` (the repo mirror), and the canonical TC pages.

**Alternatives considered**:
- *Embed the full evidence inline in `docs/tools/*.md`*: rejected by Q1 (busts the one-line inline anchor budget).
- *Skip the mirror file entirely, link directly to TC pages from the doc*: rejected — TC pages are vault-side, not accessible to wrapper-repo cloners. The mirror file is the cloner accommodation.
- *Make the mirror file the source of truth and back-link to TC pages as evidence*: rejected — inverts the mirror-discipline rule. TC pages are canonical because they carry the execution log and the Test Case Page Template metadata that the wrapper repo cannot host.

## Decision 5 — Stale BI-042 link disposition (FR-011 mechanics)

**Decision**: `docs/tools/search.md` and `docs/tools/context_search.md` drop the `specs/042-close-audit-findings/contracts/truncation-direction-evidence.md` link from their truncation sections entirely. A one-line forward-pointer is inserted at the top of the BI-042 evidence file itself: `> **Superseded by BI-046** — the leading-of-sorted-set claim recorded below is empirically false for `search` and `context_search`; current truth lives at [specs/046-reconcile-truncation-docs/contracts/truncation-direction-evidence.md](../../046-reconcile-truncation-docs/contracts/truncation-direction-evidence.md).` (exact prose to be finalized in /speckit-implement; the structural commitment is "one line, top of file, points to BI-046 mirror").

**Rationale**: Spec clarification Q2 selected option B (replace-in-doc + forward-pointer-in-source) over A (annotate-in-place) and C (replace-in-doc only). The reason: keeping the BI-042 link alive in the corrected doc invites a reader to follow it and re-derive the now-false claim; dropping it without the reverse signpost leaves external citers of the BI-042 file stranded.

**Alternatives considered**: A (annotate-in-place) and C (replace-only) — both rejected during /speckit-clarify Q2.

## Decision 6 — No NEEDS CLARIFICATION items remain

All Technical Context fields are resolved:
- Language/version: Markdown + `@marwansaab/obsidian-cli-mcp@v0.7.5` anchor.
- Dependencies: none for the diff; probe uses the host's Obsidian Integrated CLI plugin + desktop app.
- Storage / Testing / Target Platform / Project Type / Performance / Constraints / Scale: all filled in `plan.md` without NEEDS CLARIFICATION markers.

Phase 0 closes. Proceed to Phase 1.
