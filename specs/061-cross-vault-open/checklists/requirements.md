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
  (no vault switching) and FR-011 (focused-vault guard). Clarification 2026-06-01 confirmed the
  inversion is **unconditional** (no opt-in flag). Per the project rule, the supersession must be
  recorded in a new ADR during `/speckit-plan`, not enacted silently. Surfaced in the
  Clarifications session, Assumptions, and Dependencies.
- **Error vocabulary settled (was deferred)**: Clarification 2026-06-01 pinned the literals —
  unknown-vault → `VAULT_NOT_FOUND/reason:"unknown"` (sole hard error); file-not-found →
  `FILE_NOT_FOUND`; unrecoverable launch → reused `CLI_NON_ZERO_EXIT/reason:"obsidian-not-running"`
  (ADR-030). No new top-level code and no new reason; the BI-057 `reason:"not-open"` is not
  repurposed (ADR-015 additive-only) — it stops being emitted as its case becomes a success.
- **Remaining plan-phase probes (not spec ambiguities)**: placement observability (new tab vs
  reuse vs active), cross-window focus reliability, the recovery bound, and the open mechanism
  that satisfies both recovery-inheritance (route through `dispatchCli`) and placement reporting
  are deferred to plan-phase T0 probes with reasonable defaults stated — parameters to pin, not
  unresolved scope decisions, so no [NEEDS CLARIFICATION] markers are used.
