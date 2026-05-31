# Specification Quality Checklist: Open Cross-Vault Files

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-06-01
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
- **Borderline — proper-noun grounding, not implementation leakage**: the spec names existing
  project artifacts (BI-057 `open_file`, ADR-029, ADR-030, ADR-015, BI-059, BI-060, upstream
  limitation B1) in Assumptions / Dependencies / Requirements. These are referenced as *prior
  decisions and the superseded contract*, not as a prescription of how to build this feature —
  required by CLAUDE.md's supersede-don't-drift rule, which obliges the spec to surface the
  BI-057 contract inversion rather than silently override it. The WHAT/WHY of each FR remains
  implementation-agnostic; the named artifacts sit in the rationale layer.
- **Deliberate supersession flagged for plan-phase ADR**: this feature inverts BI-057 FR-010
  (no vault switching) and FR-011 (focused-vault guard). Per the project rule, the supersession
  must be recorded in a new ADR during `/speckit-plan`, not enacted silently. Surfaced in
  Assumptions and Dependencies.
- **Plan-phase probes (not spec ambiguities)**: placement observability (new tab vs reuse vs
  active), cross-window focus reliability, the recovery bound, and the exact error-code/reason
  literals are deferred to plan-phase T0 probes with reasonable defaults stated — they are
  parameters to pin, not unresolved scope decisions, so no [NEEDS CLARIFICATION] markers are used.
