# Specification Quality Checklist: File Scope

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-06-30
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
- **House-style note on "implementation details"**: this project's spec convention (see the sibling [BI-038 spec](../../038-find-replace/spec.md)) prescribes error-code *behaviour* — typed error states the caller can branch on — as part of the published contract, governed by Constitution Principle IV (Explicit Upstream Error Propagation). The spec names existing top-level error codes it REUSES (`ERR_NO_ACTIVE_FILE`, the path-escape code, the vault-not-found discriminators) and existing shared infrastructure it depends on (the note-level cohort's focused-file resolution). These are contract/behaviour statements, not implementation prescriptions: the spec deliberately does NOT fix input-field names, module layout, or code structure — those are left to `/speckit-plan`. The "No implementation details" items are checked under that house-style reading.
- **Deferred to `/speckit-clarify`**: the precise `(top-level code, details.code, details.reason)` triples for the new scope-conflict and missing-named-note error states (the spec fixes the direction — reuse existing top-level codes, branchable sub-codes — and leaves the exact triples to the clarify session, parity with how BI-038 locked its triples).
- **Flagged for `/speckit-plan`**: the ADR-003 scope tension — BI-038 FR-013 deliberately excluded `target_mode`/`@active` from this vault-wide surface, and this feature reintroduces a file-targeted (open-note) dimension. Reconciling the mechanism likely warrants a new ADR or an ADR-003 amendment rather than a silent override (Assumptions §"ADR-003 scope tension").
