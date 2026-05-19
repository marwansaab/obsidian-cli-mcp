# Specification Quality Checklist: Query Base

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-20
**Updated**: 2026-05-20 (post-`/speckit-clarify` session)
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

Five clarifications were asked and integrated into the spec under the `## Clarifications > Session 2026-05-20` block:

1. **Row identity field** — wrapper guarantees a reserved `path: string` on every row; collision rule surfaces conflicting view-defined column as `path_view`. Grounded in BI-0048 2026-05-18 live probe (upstream emits `[{"path": "...", "id": "..."}]`) and ADR-003 cohort `path=` locator parity.
2. **Column order guarantee** — envelope carries explicit `columns: string[]` in view-declared order with reserved `path` at index 0; empty-rows responses still carry `columns` so the agent learns the view's schema. Moves the response shape from a bare array to an envelope object `{ columns, rows, truncated, total_rows? }`.
3. **Error top-level code mapping** — `BASE_NOT_FOUND` and `VIEW_NOT_FOUND` both under `CLI_REPORTED_ERROR`, distinguished by `details.code`. Cohort parity with `VAULT_NOT_FOUND` / `NOTE_NOT_FOUND`. `INVALID_BASE_PATH` stays under `VALIDATION_ERROR`. Constitution IV streak preserved (no new top-level codes).
4. **Truncation signal shape** — `truncated: boolean` always present, `total_rows: number` required when truncated and omitted otherwise. Single-round-trip narrowing diagnostic for the agent.
5. **Canonical tool name** — `query_base` via ADR-010 mechanical mapping from upstream `base:query` (composite namespace:action). Same rule that produced `set_property` and `context_search`. Bases-family cohort coherence: siblings are `bases` (BI-0049), `views_base` (BI-0082), `create_base` (BI-0083) — NOT the eval-composed `read_*` surface (which is point-3 grandfather, not an ADR-010-enforced cohort).

## Validation Notes

- All five clarifications materially impact downstream artifacts (schema shape, error-handling pattern, source-tree path, documentation cohort assignment). None could be safely deferred to plan.
- Spec is now ready for `/speckit-plan`. No outstanding ambiguities.
- Constitution Principle IV streak: preserved. No new top-level error codes introduced; new states surface via `details.code` (`BASE_NOT_FOUND`, `VIEW_NOT_FOUND`, `INVALID_BASE_PATH`) per ADR-015.
- ADR-010 (typed tool names mirror upstream CLI subcommand) explicitly anchors the `query_base` name. Plan should cite ADR-010 in its tool-name decision rationale.
- ADR-003 (target-mode discipline) does not apply — `query_base` does not expose `target_mode`; the user input explicitly listed active-file targeting as out of scope v1.
- Bases-family cohort siblings (`bases` BI-0049, `views_base` BI-0082, `create_base` BI-0083) are listed in the spec; plan should cross-check those BIs for any shared envelope conventions that should be inherited.
