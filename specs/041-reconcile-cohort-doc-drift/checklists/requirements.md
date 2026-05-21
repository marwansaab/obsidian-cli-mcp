# Specification Quality Checklist: Reconcile Cohort-Wide Tool Doc and Classifier Drift

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-21
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

## Validation Notes

**Content Quality** — passes:
- Spec speaks about `details.code` discriminators, `classifier ladder`, `wrapper-doc`, `BI-0027 audit` — these are project-level domain concepts established by the constitution + existing ADRs (Principles I–V, ADR-013, ADR-015), not language/framework leakage. The constitution itself uses the same vocabulary (e.g. "`class UpstreamError extends Error` ... `code` ... `details`"). Treated as ubiquitous domain language, not implementation detail.
- Cohort tool names (`delete`, `rename`, `outline`, `query_base`, `search`, `read_property`, `properties`) and `obsidian eval` are MCP tool surface names — the user-facing contract — not implementation choices.

**Requirement Completeness** — passes:
- No [NEEDS CLARIFICATION] markers in spec. The two latent ambiguities considered (the `read_property` malformed-frontmatter choice between empty-value-unknown vs typed-code; the `properties` collapse casing chosen for the merged entry) are both resolved by Assumption A4 — "live wrapper's current emission is the source of truth". Both are doc-only reconciliations against an observable shape, so the answer is empirical, not a design choice.
- All FRs cite testable conditions (canonical phrase + casing; channel sweep; doc contents match observation).
- SCs are measurable: 100% classification rate vs 0% baseline, zero conflicting claims, zero regression on eval-composed tools, exactly one merged entry for a fixture, one audit re-run vs six.
- Edge cases cover the four most likely doc-vs-emission boundary failures (case spectrum, similarly-named views, `file.*` collision, three-way case variants) plus the floor-version scope guard and the eval-channel compatibility guard.
- Scope bounded by explicit Out-of-Scope list referencing the originating per-tool BIs' contra-design constraints.
- Assumptions A1–A9 enumerate every empirical claim the spec relies on plus the cycle-management commitments (single audit re-run, no mid-cycle re-runs).

**Feature Readiness** — passes:
- Every FR has a paired SC and at least one acceptance scenario.
- Six user stories cover P1 classifier-ladder fixes (Stories 1–2), P2 doc reconciliations (Stories 3–5), P3 lower-impact doc reconciliations (Story 6). The seventh user story from the input ("BI-0027 audit pass clears cohort-wide") was reclassified as Success Criteria SC-001/SC-008 since it expresses an outcome, not an agent journey.
- No framework / language / tool choices leak — even the classifier ladder is described as "the single shared module" not by its file path or implementation.

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`. All items pass on first iteration.
- Constitution alignment surfaced to plan phase: this feature touches the classifier (Principle IV territory) and rendered help-docs. Plan phase will fill in the Constitution Compliance checklist with Y / N / N/A per principle plus ADR-010 / ADR-013 / ADR-014 / ADR-015. ADR-015 (sub-discriminators via `details.reason`) is structurally adjacent — the two widened sub-discriminators (`ERR_NO_ACTIVE_FILE`, `VIEW_NOT_FOUND`) are existing `details.code` values, not new `details.reason` sub-states, so ADR-015 is expected N/A; plan phase confirms.
