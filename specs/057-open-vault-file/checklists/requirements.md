# Specification Quality Checklist: Open Vault File

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-29
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
- **Content Quality nuance**: per the project's spec house-style (see `specs/044-append-note/spec.md`), Assumptions deliberately ground the contract in the cohort's *observable* conventions (error-code vocabulary via ADR-015, the read-vs-write echo convention, upstream limitation B1) and name candidate mechanisms (eval-composed open per ADR-009). Functional Requirements remain framed as observable behaviour; the mechanism references live in Assumptions and are explicitly plan-refinable, so the spec stays decision-driving without prescribing an implementation.
- **Open decisions — RESOLVED in Clarifications Session 2026-05-29**: (1) vault precondition → active focused-vault guard (`resolveVaultPath` vs FOCUSED_VAULT_TEMPLATE), reuse `VAULT_NOT_FOUND`+`not-open` with broadened semantic, ADR-014 stage order `unknown → not-open → FILE_NOT_FOUND`, guard before file resolution; (2) locator shapes → both `path` and bare `file` name (cohort parity); (3) `new_tab: true` while already open → honor literally (fresh tab). Encoded into FR-011/FR-012/FR-012a/FR-014/FR-001/FR-008 and Assumptions.
- **Still plan-phase (deliberately deferred, not ambiguities)**: the unsupported-type `details.code` (FR-009) and the Obsidian-not-running classification both depend on a T0 substrate probe against the authorised test vault; the spec fixes the distinguishability contract and leaves the literal value to the plan. The specific-mode-only decision (no `target_mode: "active"`) stands as a documented Assumption — opening the already-focused file is a no-op, so no clarification was warranted.
