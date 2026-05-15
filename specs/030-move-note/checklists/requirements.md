# Specification Quality Checklist: Move Note Typed MCP Tool

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-15
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

This spec is a sibling track to [021-rename-note](../../021-rename-note/spec.md) and reuses
its house style verbatim where the contracts match. Two intentional departures from a
strict "no implementation details" reading:

1. **The `Background` block names concrete module paths and code-level conventions**
   (`src/tools/move/`, `applyTargetModeRefinement`, `targetModeBaseSchema.extend`, the
   `.endsWith(".md")` rule). This is the established house style for typed-tool specs in
   this project — every prior typed-tool spec (006, 011, 012, 013, 014, 015, 018, 019, 021,
   023, 024, 025, 026, 027, 028, 029) does the same. The implementation references are
   load-bearing because they cross-reference foundational ADRs and contracts that constrain
   the feature's design space; treating them as forbidden "implementation details" would
   force a re-derivation of the same constraints inline and produce a less coherent spec.
   Acceptable per the project's typed-tool track convention.

2. **FR-003 prescribes a wrapper-owned `to`-shape transform rule** with explicit byte-level
   semantics (`to.endsWith("/")`, case-sensitive `.endsWith(".md")`). This rule is the
   spec's load-bearing decision — leaving it for plan-stage would re-open the trailing-`/`
   discriminator design question that the user input already resolved ("a folder path ending
   in `/` ... or a full vault-relative path with filename"). FR-003 records the resolution
   so the contract is locked at spec stage; plan-stage refines argv shapes and CLI wording,
   not the wrapper's user-facing transform rule.

The four reasonable-default calls documented in the Assumptions section (trailing-`/` strict
discriminator; `.md` append rule on full-path-target's filename portion; backslash-in-`to`
forwarded verbatim with plan-stage characterisation; no /speckit-clarify session before
/speckit-plan) are recorded inline rather than as `[NEEDS CLARIFICATION]` markers per the
session-wide instruction to work without stopping. If reviewers disagree with any call,
/speckit-clarify can run before /speckit-plan.

Items marked incomplete (none currently) would require spec updates before `/speckit-clarify`
or `/speckit-plan`.
