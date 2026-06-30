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
- **Resolved by `/speckit-clarify` (Session 2026-06-30)**: the precise `(top-level code, details.code, details.reason)` triples for the new scope-conflict, missing-named-note, and ineligible-target error states are now locked in FR-016 (all under `VALIDATION_ERROR`, parity with the existing `INVALID_SUBFOLDER`/`not-found` shape). The input-contract shape is locked to dedicated optional locator fields (no `target_mode` adoption). Bare-name resolution is locked to the cohort's `resolveFileByTsv` round-trip.
- **Remaining for `/speckit-plan` (direction set, authoring deferred)**: the ADR-003 scope tension is resolved in *direction* — the chosen mechanism does NOT extend `target_mode`, so ADR-003 stays intact and unamended; what remains is authoring a **new ADR** during planning to record the deliberate decision to add a file-targeted (open-note) dimension to a vault-wide surface (Assumptions §"ADR-003 scope tension").
