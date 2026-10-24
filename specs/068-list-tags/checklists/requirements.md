# Specification Quality Checklist: List Tags

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-24
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

- Validation pass 1 (2026-10-24): all items pass.
- "No implementation details": the feature *is* a published tool surface, so its input field names, output shape, and the project's existing error categories are the user-facing contract, not implementation. The spec names no language, framework, library, module path, or internal function; the choice of underlying mechanism (wrap the CLI `tags` subcommand directly vs. compose the data otherwise) is explicitly deferred to planning in Assumptions.
- No [NEEDS CLARIFICATION] markers were needed. Informed defaults recorded in Assumptions and open to `/speckit-clarify`:
  - Tag names returned verbatim as the underlying index reports them (leading `#` form recorded at plan stage).
  - Count ties under `sortByCount` broken alphabetically by name; count ordering still applies when `includeCounts: false`.
  - `activeOnly: false` counts as "not set" for the mutual-exclusion rule.
  - Path traversal rejected at the validation boundary (absolute paths and `..` segments).
  - No wrapper-side truncation; oversize responses fail with the existing output-too-large error.
- Discrepancy with the request recorded in Assumptions: AC-14 says "the current placeholder stub is replaced", but no `tags` documentation stub exists today (`docs/tools/` stubs exist only for `list_notes`, `list_vaults`, `search_vault`). The feature adds a new page and index entry.
- Candidate clarify topics (not blocking): leading-`#` in returned names; case-variant handling (merge vs. separate) — both currently defaulted to "inherit underlying behaviour, document it".
- Clarify session 2026-10-24 (3 questions): bare names with exactly one leading `#` stripped; case variants inherited with no merge or split, and the plan-stage probe result becomes the contract; "alphabetical" means a wrapper sort, case-insensitive first with a byte-order tiebreak (labelled "unobservable end-to-end" if the CLI merges case variants). Re-validated after clarify: all items still pass (16/16).
- Plan-stage amendment 2026-10-24: `target_mode` dropped in favour of ADR-032 sibling locators (`vault?` + `file`/`path`/`activeOnly`); AC-10 and AC-12 reworded; FR-002/003/006/007/018 updated; the active-mode edge case was replaced by the `activeOnly`+`vault` rule. Re-validated: 16/16 still pass.
- Analyze remediation 2026-10-24 (R1–R7, logged in spec Clarifications): FR-006, FR-007, FR-011, FR-017, Edge Cases, Assumptions and the Input note were updated. Re-validated: 16/16 still pass.
