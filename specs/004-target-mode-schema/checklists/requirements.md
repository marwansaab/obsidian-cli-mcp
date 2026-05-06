# Specification Quality Checklist: Target Mode Schema Primitives

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-06
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
  - Note: zod and `zod-to-json-schema` are explicitly named because they are constitutionally mandated (§Validation, §MCP) and the user's input names them by API ("zod refinement", ".and()/.merge()", "z.infer"). Per the Constitution, the schema *is* the surface contract — naming the validation library at the spec level is pinning the surface, not leaking implementation. Same precedent as spec 003 naming `child_process.spawn` and `UpstreamError`.
- [x] Focused on user value and business needs
  - User value here is "every typed-tool author and every LLM caller gets a single, consistent target-mode contract instead of N drifting copies." Stories 1–4 each frame the value to a specific consumer (caller, agent, downstream tool author, type-checker).
- [x] Written for non-technical stakeholders
  - The Background section explains the why-it-exists in plain language; user stories use scenario-narrative form before falling into Given/When/Then specifics.
- [x] All mandatory sections completed
  - User Scenarios & Testing, Requirements (with Functional Requirements, Out of Scope, Key Entities), Success Criteria, Assumptions all present. No [TBD] placeholders.

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
  - Spec was authored without any clarifications because the user input enumerated 12 acceptance criteria covering every behavioral edge.
- [x] Requirements are testable and unambiguous
  - FR-001 through FR-014 each name a specific behavior with a verification method (parse-input → expected-outcome, code-search → expected-zero-matches, etc.).
- [x] Success criteria are measurable
  - SC-001 (15/15 scenarios pass), SC-003 (zero hand-written interfaces — grep-verifiable), SC-007 (zero `.describe()` calls — grep-verifiable), SC-008 (zero forbidden imports — grep-verifiable). All others are similarly mechanical.
- [x] Success criteria are technology-agnostic (no implementation details)
  - The technology references that exist (zod, zod-to-json-schema) are surface contract per the Content Quality note above. SC-002, SC-006 are framed in user-author terms ("typed-tool author can declare X in Y lines").
- [x] All acceptance scenarios are defined
  - 15 scenarios across Stories 1–3 (6 + 5 + 4) plus 3 type-system scenarios in Story 4. Edge Cases section adds 12 more behavioral specifications for boundary inputs.
- [x] Edge cases are identified
  - Edge Cases section enumerates 13 boundary scenarios: extra unknown keys at base level (specific & active), missing/non-string discriminator, undefined/whitespace/empty-string vault, empty-string locators, undefined-valued forbidden keys in active mode, discriminator typo, null discriminator, empty input object, non-object input, composed-schema name collision.
- [x] Scope is clearly bounded
  - Out of Scope section enumerates 9 explicit exclusions (MCP registration, CLI invocation, .describe() annotations, vault-less specific mode, strict-against-unknown-keys at base level, content validation beyond non-empty vault, localisation, obsidian_exec refactor, ADR-003 modification).
- [x] Dependencies and assumptions identified
  - Assumptions section lists 14 explicit assumptions covering ADR-003 alignment, single-source-of-truth, vault-empty-string semantics, refinement vs. .never() implementation latitude, base-permissive composition, undefined-key semantics, JSON Schema generator identity, default module path, and constitutional bindings.

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
  - FR-002 ↔ Story 1 AC#1, Story 2 AC#5, Edge Case "discriminator absent". FR-003 ↔ Story 1 AC#1–6. FR-004 ↔ Story 2 AC#1–4 + Edge Case "active+undefined forbidden key". FR-005, FR-006 ↔ Story 3 AC#1–4. FR-010 ↔ Story 4 AC#1–3 + SC-003. Each FR maps to at least one acceptance scenario or success criterion.
- [x] User scenarios cover primary flows
  - Story 1 (specific-mode happy + failures), Story 2 (active-mode happy + failures), Story 3 (composability — the only reason this primitive exists), Story 4 (typed-API correctness). Each is independently testable per its Independent Test paragraph.
- [x] Feature meets measurable outcomes defined in Success Criteria
  - SC-001 directly enumerates the test count (15). SC-003, SC-007, SC-008 are grep-mechanical. SC-005 is the constitutional coverage gate. SC-002, SC-006 become measurable as the typed-tool BIs that consume this primitive land.
- [x] No implementation details leak into specification
  - Same reasoning as Content Quality item 1: zod/zod-to-json-schema/z.infer are surface contract, not implementation. The spec is silent on internal helper functions, the exact names of the exported types, the file/folder choice (it offers a default and defers to plan), and the exact composition operator (.and() vs .merge() vs .extend()).

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.
- All checklist items pass on first pass — the user input was unusually well-specified (14 explicit MUST items in the framework section + 12 acceptance criteria + 3 out-of-scope items + 4 derived constraints from ADR-003), leaving little spec-stage interpretation surface and zero `[NEEDS CLARIFICATION]` markers needed. This is the same posture as spec 003 (also a follow-on to a binding ADR with detailed user input).
- Plan-stage decisions deferred from this spec (per FR-001, FR-004, FR-010, FR-012): module path (`src/target-mode/target-mode.ts` vs. `src/schemas/target-mode.ts`), exact zod API for the active-mode forbidden-key rule (`.refine()` vs `.never().optional()` vs `.superRefine()`), exact composition operator the primitive documents (`.and()` vs `.merge()` vs `.extend()`), exact export names for the schema and inferred types, type-system test mechanism (`expectTypeOf` vs `tsc --noEmit` only).
- Recommended next step: proceed directly to `/speckit-plan` (no `/speckit-clarify` needed). The spec contains zero `[NEEDS CLARIFICATION]` markers and the deferred plan-stage decisions are explicitly enumerated in the bullet above.
