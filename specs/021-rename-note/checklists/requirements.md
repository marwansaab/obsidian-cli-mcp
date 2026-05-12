# Specification Quality Checklist: Rename Note Typed MCP Tool

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-12
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

Notes:
- Spec references TypeScript / zod / vitest / `child_process.spawn` in FR / SC sections. This is consistent with sibling specs (012, 013, 015, 018, 019, 020) for this project — every typed-tool wrap BI cites the load-bearing primitives (cli-adapter, target-mode primitive, schema utilities) by file path because the constitutional contract binds the implementation to those modules. The project's audience for these specs is the maintaining engineer plus the LLM agent driving /speckit-plan; the "non-technical stakeholders" carve-out is satisfied at the Background and User Story narrative levels, which are plain prose. PASS.

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

Notes:
- The spec carries two **/speckit-clarify-deferred** decisions (Q1 extension-preservation rule, Q2 folder-separator-rejection rule). These are NOT [NEEDS CLARIFICATION] markers — they are explicit /speckit-clarify deferrals with default resolutions documented in the Assumptions section so the spec binds either way the clarification resolves. This matches the post-016 precedent (016-reliable-writer had a /speckit-clarify-deferred Q1 on the writer's atomicity granularity that resolved during the clarification phase). PASS.
- "Technology-agnostic" SC notes: SC-001 through SC-016 cite vitest, `wc -l`, grep, npm — the same toolchain the existing 8 typed-tool specs cite. The project's Constitution v1.2.0 names vitest as the merge-gating test framework (Technical Standards & Stack Constraints), so this is project-level grounding, not a leak of implementation detail.

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Mapping coverage

User input acceptance criteria mapped to spec stories / FRs:

| User input AC | Priority | Spec coverage |
|---------------|----------|---------------|
| #1 Specific-mode in-place rename with link-rewriting | P1 | Story 1, FR-007, FR-010 |
| #2 `.md` extension preservation | P1 | Story 1 AC#2, Story 3 AC#2, FR-016 case (b), SC-013, /speckit-clarify Q1 |
| #3 Explicit extension used (no double-extension) | P1 | Story 3, FR-016 case (c), SC-013, /speckit-clarify Q1 |
| #4 Source-not-found structured error | P1 | Story 4 AC#1, Story 7 AC#3, FR-016 case (h) |
| #5 Destination-exists structured error | P1 | Story 4 AC#2, FR-016 case (h) |
| #6 Specific-mode without locator fails validation | P1 | Story 6 AC#1, FR-016 case (e) |
| #7 Specific-mode with both locators fails validation | P1 | Story 6 AC#2, FR-016 case (f) |
| #8 Empty `name` fails validation | P1 | Story 6 AC#6, FR-016 case (j), FR-003 |
| #9 Unknown top-level key fails validation | P1 | Story 6 AC#5, FR-016 case (i) |
| #10 Active-mode forbidden key fails validation | P1 | Story 6 AC#4, Story 5 AC#2, FR-016 case (h) |
| #11 Active-mode focused-note rename | P1 | Story 5, FR-016 case (e), FR-007 |
| #12 Active-mode no-focused-note structured error | P1 | Story 5 AC#3, FR-016 case (i) |
| #13 Vault-config link-rewriting caveat documented | P1 | FR-012 (top-level description), FR-014 (docs body), Edge Case "Auto-update-links setting disabled" |
| #14 Doc with per-field input contract + 4 examples | P2 | FR-014, FR-015, Story 8 AC#4, SC-006 |
| #15 Regression tests for each AC | P2 | FR-016 (full test enumeration), SC-001 |
| #16 Same-name rename success no-op | P3 | Story 9, FR-016 case (k), FR-010 |

User input edge-case categories mapped to spec coverage:

| Category | Coverage |
|----------|----------|
| CONCURRENCY: concurrent operations | Edge Cases ("Two concurrent rename_note calls"), FR-008 (queue) |
| CONCURRENCY: external editor open | Edge Cases ("External editor has the file open"), FR-014 |
| CONCURRENCY: active-mode TOCTOU | Edge Cases ("Active-mode TOCTOU"), Out of Scope (TOCTOU mitigations per-tool) |
| FILESYSTEM: reserved characters | Edge Cases ("Reserved Windows characters in `name`"), FR-014 |
| FILESYSTEM: case-only renames | Edge Cases ("Case-only renames"), FR-019 case (x), SC-011 |
| FILESYSTEM: Unicode normalisation | Edge Cases ("Unicode normalisation of `name`"), Out of Scope |
| LINK-UPDATE: vault-config dependence | FR-012, FR-014, Edge Cases ("Auto-update-links setting disabled") |
| LINK-UPDATE: aliased wikilinks | Edge Cases ("Aliased wikilinks"), FR-014 |
| UNDERLYING: unknown vault | Edge Cases ("unknown vault display name"), inherited 011-R5 |
| CLIENT-CLASS: unknown-key observability | Edge Cases ("Strict-rich vs strict-naive"), Story 6 AC#5 |
| SECURITY: caller-supplied input | Edge Cases ("Caller-supplied … argv-shell metacharacters"), FR-019 case (ix), SC-012 |

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.
- All 16 user-input acceptance criteria are covered; all 5 user-input edge-case categories (CONCURRENCY, FILESYSTEM, LINK-UPDATE, UNDERLYING, CLIENT-CLASS, SECURITY) are covered.
- The two /speckit-clarify-deferred questions (Q1 extension-preservation rule, Q2 folder-separator-rejection rule) bind the spec via documented defaults so `/speckit-plan` can proceed even if /speckit-clarify is skipped — but the recommended next step is `/speckit-clarify` to lock those decisions before planning.
