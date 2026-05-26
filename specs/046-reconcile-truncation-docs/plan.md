# Implementation Plan: Reconcile Truncation Docs

**Branch**: `046-reconcile-truncation-docs` | **Date**: 2026-05-26 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/046-reconcile-truncation-docs/spec.md`

## Summary

Doc-only correction of two empirically false claims in the truncation sections of `docs/tools/search.md` and `docs/tools/context_search.md`: (1) that the truncated response carries the **leading** subset of the *sorted* result set, and (2) that truncation behaviour is **uniform across the search-tool cohort**. The corrected sections describe per-tool behaviour with the actual visible-subset shape (engine pre-sort response → leading slice within that pre-sort → wrapper output-sort applied to the slice), anchored by a hybrid evidence scheme: a one-line inline summary per anchor (probe inputs + observed visible subset + capture date) plus a wrapper-repo mirror file under `specs/046-reconcile-truncation-docs/contracts/` that back-links to canonical TC pages `[[TC-00306]]` (search) and `[[TC-00328]]` (context_search). `docs/tools/backlinks.md` stays byte-identical (still slices leading-of-sorted-set per its own code path). `specs/042-close-audit-findings/contracts/truncation-direction-evidence.md` gains one forward-pointer line to BI-046 for external citers.

## Technical Context

**Language/Version**: Markdown documentation; underlying wrapper pinned at `@marwansaab/obsidian-cli-mcp@v0.7.5` (anchor pin per spec clarification Q3 — no wrapper code touched).
**Primary Dependencies**: None for the doc diff itself. The empirical probe gate (FR-012) invokes the Obsidian Integrated CLI plugin and the Obsidian desktop app on the user's host; versions are recorded in the mirror file per Q3, with `unknown` permitted for any unobtainable component.
**Storage**: N/A. All artifacts are text files under `docs/tools/` and `specs/046-reconcile-truncation-docs/contracts/`.
**Testing**: No `*.test.ts` additions. Constitution Principle II is N/A for this PR (docs-only, no MCP surface added/renamed/modified). Project memory rule: this repo holds unit tests only — manual probe captures land on canonical TC pages in the user's external test tracker, not as TCs under `specs/`. Re-run discipline is enforced by the inline summary + mirror file being sufficient to reproduce the documented behaviour against the current shipped version.
**Target Platform**: Published reference documentation at `docs/tools/*.md`, consumed by human readers and LLM agents that treat the docs as a behavioural contract.
**Project Type**: Docs-only feature within a TypeScript MCP-server library (`@marwansaab/obsidian-cli-mcp`).
**Performance Goals**: N/A.
**Constraints**: (a) Mirror discipline — the contracts/ file holds no facts not present on the canonical TC pages, no divergence from them; (b) one-line inline anchor budget per Q1; (c) cohort-divergence sentence carries no forward-pointer to the adjacent runtime-reconciliation BI per Q5 (stale-link risk on BI renumbering); (d) FR-012 probe gate — `search.md` doc-structure decision (single-block vs per-mode subsections) is locked only after the dual-mode v0.7.5 probe runs and lands on `[[TC-00306]]`.
**Scale/Scope**: 4 file diffs total — 2 doc edits (`search.md`, `context_search.md`), 1 new mirror file (`specs/046-reconcile-truncation-docs/contracts/truncation-direction-evidence.md`), 1 single-line forward-pointer insertion (`specs/042-close-audit-findings/contracts/truncation-direction-evidence.md`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Doc-only feature; constitution prose at `.specify/memory/constitution.md:440-446` explicitly grants N/A to Principles II–V and ADR-010 / ADR-013 / ADR-014 for docs-only PRs and PRs that add no typed tool / no new error-code pair.

| Gate | Verdict | Evidence |
|------|---------|----------|
| Principle I — Modular Code Organization | **N/A** | No source modules touched. Diff scope is `docs/tools/*.md` plus two `specs/<BI>/contracts/*.md` files. |
| Principle II — Public Surface Test Coverage | **N/A** | No MCP tool added, renamed, or modified. No published-surface code path changes. Constitution `:441` carves out docs-only PRs explicitly. |
| Principle III — Boundary Input Validation with Zod | **N/A** | No schema touched. `src/tools/search/schema.ts` (graph community 322 — dual-mode types intact), `src/tools/context_search/schema.ts` (community 414), `src/tools/backlinks/schema.ts` (community 285) all unchanged. |
| Principle IV — Explicit Upstream Error Propagation | **N/A** | No handler code touched. `UpstreamError` (kernel node, graph community 9) unaffected. Zero new top-level error codes. |
| Principle V — Attribution & Layered Composition | **N/A** | No new source modules introduced. Mirror file under `specs/.../contracts/` is a spec-artifact mirror, not a source module — no SPDX header required (per BI-042's precedent at `specs/042-close-audit-findings/contracts/truncation-direction-evidence.md`). |
| ADR-010 — Typed Tool Names Mirror Upstream CLI Subcommand | **N/A** | No new typed tool. |
| ADR-013 — Plugin-Namespace Tool Naming Convention | **N/A** | No new typed tool. |
| ADR-014 — Plugin-Backed Typed Tools Runtime-Dependency Pattern | **N/A** | No new typed tool. |
| ADR-015 — Sub-Discriminators via details.reason for Multi-State Error Codes | **N/A** | No new `(top-level-code, details.code)` pair; no new sub-states added to existing pairs. |

All gates N/A → Complexity Tracking table is empty (no violations to justify). Gate re-check after Phase 1 design: re-affirmed unchanged — Phase 1 artifacts add planning text only, no constitution-relevant deltas.

### Graphify structural check (per `CLAUDE.md` `/speckit-plan` discipline)

Pre-plan queries against `graphify-out/graph.json` (commit-time AST snapshot):

- **Affected source-code communities**: handlers for the three tools all share community `9` (the runtime spine — `executeSearch`, `executeContextSearch`, `executeBacklinks`, `UpstreamError`, `mapEnvelopeError`). Schemas are in tool-specific communities (`322` search, `414` context_search, `285` backlinks). **No source community is touched by this PR** — FR-009 bounds the diff to documentation.
- **Kernel node touch**: `UpstreamError` is the only kernel-node-class symbol that appears anywhere in the three tools' source files (community 9). **Not touched**. `createLogger`, `createQueue`, `createServer` do not appear in the affected file set.
- **Dual-mode schema confirmation**: `src/tools/search/schema.ts` community 322 hosts BOTH default-mode (`SearchDefaultOutput`, `searchDefaultOutputSchema`, `searchDefaultWireSchema`) AND line-mode (`SearchLineMatch`, `searchLineMatchSchema`, `SearchLineOutput`, `searchLineOutputSchema`, `searchContextWireFileSchema`, `searchContextWireMatchSchema`, `searchContextWireSchema`) types. **Structural confirmation that Q4's dual-mode probe gate (FR-012) reflects schema-layer reality** — the doc must mirror this dual-shape unless the probe shows the two modes behave identically under truncation.
- **Doc nodes**: `docs/tools/search.md` (57 extracted semantic nodes across 9 communities), `docs/tools/context_search.md` (51 nodes / 9 communities), `docs/tools/backlinks.md` (58 nodes / 8 communities). Doc nodes are weakly connected (semantic prose), so doc edits do not ripple to runtime communities — confirms low blast radius for the edits FR-001 through FR-013 prescribe.
- **Cohort sibling discipline**: handlers share community 9, so an agent reading any one tool's handler sees the other two siblings nearby. This is the structural reason Q5's cohort-divergence sentence (FR-013) belongs in each corrected doc — the structural cohort is real; only the runtime *behaviour* now diverges.

No structural contradictions with the ADRs or the architecture notes. No graph drift to flag.

## Project Structure

### Documentation (this feature)

```text
specs/046-reconcile-truncation-docs/
├── plan.md                                 # this file
├── spec.md                                 # feature spec (already exists)
├── research.md                             # Phase 0 output (this command)
├── data-model.md                           # Phase 1 output (this command — mirror-file entity shape)
├── quickstart.md                           # Phase 1 output (this command — probe re-run + doc-edit walkthrough)
├── contracts/
│   └── truncation-direction-evidence.md    # Phase 1 output — BI-046 wrapper-repo mirror file (per FR-007); populated by /speckit-implement after the FR-012 probe runs
├── checklists/
│   └── requirements.md                     # spec-quality checklist (already exists)
└── tasks.md                                # Phase 2 (created by /speckit-tasks — not this command)
```

### Touched paths outside the feature directory

```text
docs/tools/
├── search.md                               # truncation section corrected — FR-001..FR-003, FR-011..FR-013
├── context_search.md                       # truncation section corrected — FR-004..FR-006, FR-011..FR-013
└── backlinks.md                            # BYTE-IDENTICAL — FR-008 (no edits, including the now-false cohort-uniformity sentence per scope decision)

specs/042-close-audit-findings/contracts/
└── truncation-direction-evidence.md        # one-line forward-pointer inserted — FR-011
```

**Structure Decision**: Doc-only feature; no `src/` layout choice to make. The mirror file under `specs/046-reconcile-truncation-docs/contracts/` parallels the existing BI-042 pattern (`specs/042-close-audit-findings/contracts/truncation-direction-evidence.md`) so a reader who knows the BI-042 convention finds the BI-046 evidence in the analogous location.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

All Constitution Check gates returned **N/A**; no violations to justify. Table intentionally empty.
