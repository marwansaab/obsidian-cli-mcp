# Specification Quality Checklist: Query Base

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-20
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

## Decisions Locked at Spec Time (Revisitable in `/speckit-clarify`)

Two design axes were resolved with cohort-aligned defaults rather than flagged as `[NEEDS CLARIFICATION]`:

- **FR-013** — row-count cap: 1000 rows with a truncation signal in the envelope. Parity with BI-033 `search_vault_content` and BI-035 `context_search`. Rationale: unbounded payloads risk blowing the agent's context window; capping with a typed signal preserves the predictable-shape contract.
- **FR-014** — column-value typing: native JSON types preserved verbatim (number / boolean / null / nested object), no string-coercion. Parity with `read_property` and the read-side cohort. Rationale: string-coercion would defeat the typed-retrieval value proposition the feature exists to deliver.

Both choices use the established cohort precedent and can be revisited in `/speckit-clarify` if the user wants to override either default before planning.

## Validation Notes

- Tool name (`query_base`), vault selection contract (focused-vault default with optional `vault` field), and path-safety posture (ADR-009 layered check) are documented as Assumptions — the cohort precedent makes the choice unambiguous (read-side parity with `read_note` / `read_property` / `pattern_search`).
- No new top-level error codes are introduced; new states are expressed via `details.code` sub-discrimination per ADR-015 (Constitution Principle IV — fifteen-tool zero-new-codes streak preserved).
- New `details.code` sub-discriminators (`BASE_NOT_FOUND`, `VIEW_NOT_FOUND`, `INVALID_BASE_PATH`) are introduced — their final spelling and top-level-code mapping is a planning concern, closed in `/speckit-clarify` if non-obvious.
- All quality checks pass. Spec is ready for `/speckit-clarify` (recommended next step to confirm or override the two locked defaults above) or `/speckit-plan` if the user is satisfied with the locked defaults.
