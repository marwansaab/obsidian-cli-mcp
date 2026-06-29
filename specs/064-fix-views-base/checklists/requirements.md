# Specification Quality Checklist: Fix Views Base

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-06-29
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

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.
- `/speckit-clarify` Session 2026-06-29 resolved both open decisions: (1) a named Base is its vault-relative `.base` path (no bare-name resolution layer); (2) "named target is not a Base" folds into the cohort error model (wrong-extension → input validation; broken `.base` → malformed-base) with no new failure type. Spec updated accordingly; no open clarifications remain.
- `/speckit-analyze` 2026-06-29 findings F1–F7 remediated: F1 locked named-not-found on `BASE_NOT_FOUND/named-missing` vs `not-open` (ADR-015 additive, cohort-consistent with `query_base`); F2 spec now states `vault` routes the named path cross-vault; F3 plan records the one sanctioned `server.ts` DI line; F4 FR-011 discloses the named-path focus side effect; F5 read-only/names-only assertion added to T015; F6 FR numbering reordered; F7 FR-008 defers wrong-extension to FR-012.
