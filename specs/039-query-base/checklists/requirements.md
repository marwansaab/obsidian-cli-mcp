# Specification Quality Checklist: Query Base

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-20
**Updated**: 2026-05-20 (post-`/speckit-clarify` Session 2)
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Clarifications Resolved (Session 2026-05-20)

Ten clarifications across two `/speckit-clarify` passes. All integrated into the spec under `## Clarifications > Session 2026-05-20` in chronological order.

### Pass 1 (initial scaffolding round)

1. **Row identity field** — wrapper guarantees reserved `path: string` on every row; collision rule surfaces conflicting view-defined column as `path_view`. Grounded in BI-0048 2026-05-18 live probe and ADR-003 cohort `path=` locator parity.
2. **Column order guarantee** — envelope carries explicit `columns: string[]` with reserved `path` at index 0; empty-rows responses still carry `columns`. Response shape moves from bare array to envelope `{ columns, rows, truncated, total_rows? }`.
3. **Error top-level code mapping** — `BASE_NOT_FOUND` and `VIEW_NOT_FOUND` both under `CLI_REPORTED_ERROR`, distinguished by `details.code`. `INVALID_BASE_PATH` under `VALIDATION_ERROR`. Cohort parity preserved.
4. **Truncation signal shape** — `truncated: boolean` always present, `total_rows: number` required when truncated and omitted otherwise.
5. **Canonical tool name** — `query_base` via ADR-010 mechanical mapping from upstream `base:query`. Bases-family cohort coherence with `bases` / `views_base` / `create_base`.

### Pass 2 (deepening round)

6. **`id` field reservation** — pure passthrough; wrapper reserves only `path`, treats every other key identically. Three-pronged decision criterion (universality, semantic stability, synthesis cost) — `path` clears all three, `id` clears none confidently. Future-proofed for later elevation if empirical evidence supports it.
7. **View-name matching semantics** — exact case-sensitive match, no whitespace trim, no fuzzy. Cohort parity with `read_property` / `read_note`.
8. **Input length caps** — uniform 1000 UTF-16 code units on `base_path` and `view_name`, validated at input boundary. Parity with BI-033 `query` cap and BI-038 `pattern` / `replacement` caps. New `details.code: "INVALID_VIEW_NAME"` sub-discriminator.
9. **Natural-order determinism** — wrapper post-sorts by `path` ascending when view defines no explicit sort; applies `path` ascending as tiebreaker for equal sort-key values when view does declare a sort. Cohort parity with BI-038's wrapper-controlled deterministic baseline. SC-003 holds independent of Bases' internal walk-order stability.
10. **Malformed-base handling** — new `details.code: "BASE_MALFORMED"` under `CLI_REPORTED_ERROR`, with sub-states `empty` / `invalid-yaml` / `missing-required-key` / `unsupported-schema-version` / `unknown`. Three distinct states for the "something is wrong with the base" family: `BASE_NOT_FOUND` (file missing), `BASE_MALFORMED` (file present but unusable), `VIEW_NOT_FOUND` (file fine, view missing).

## Validation Notes

- All ten clarifications materially impact downstream artifacts. None could be safely deferred to plan.
- Spec is now ready for `/speckit-plan`. No outstanding ambiguities.
- Constitution Principle IV streak: preserved. No new top-level error codes; all new states surface via `details.code` (`BASE_NOT_FOUND`, `BASE_MALFORMED`, `VIEW_NOT_FOUND`, `INVALID_BASE_PATH`, `INVALID_VIEW_NAME`) per ADR-015. Streak count becomes sixteen tools after BI-039 ships.
- ADR-010 anchors the `query_base` tool name mechanically from upstream `base:query`.
- ADR-003 path-locator cohort governs the reserved `path` row-field convention.
- ADR-009 layered path safety governs `base_path` validation.
- ADR-015 sub-discriminator pattern governs all `details.code` / `details.reason` mappings.
- Bases-family cohort siblings (`bases` BI-0049, `views_base` BI-0082, `create_base` BI-0083) should be cross-checked in planning for any shared envelope conventions worth inheriting.
- Plan should verify upstream `base:query` actually emits structured errors the wrapper can pin to `BASE_MALFORMED` sub-states (FR-005b). If upstream emits only a generic parse error, the wrapper's `details.reason` falls back to `"unknown"` and other sub-states remain best-effort.
- Plan should verify the wrapper can compute `total_rows` (FR-013) — Bases natively maintains row counts for views, but the upstream subcommand may or may not surface that count alongside the truncated `rows`.
