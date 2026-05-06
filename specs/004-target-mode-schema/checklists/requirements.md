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
  - 16 scenarios across Stories 1–3 (6 + 5 + 5; Story 3 AC#5 was added in /speckit-clarify session 2026-05-06 to cover Composition Pattern (b)) plus 3 type-system scenarios in Story 4. Edge Cases section adds 13 more behavioral specifications for boundary inputs.
- [x] Edge cases are identified
  - Edge Cases section enumerates 13 boundary scenarios: extra unknown keys at base level (specific & active), missing/non-string discriminator, undefined/whitespace/empty-string vault, empty-string locators, undefined-valued forbidden keys in active mode, discriminator typo, null discriminator, empty input object, non-object input, composed-schema name collision.
- [x] Scope is clearly bounded
  - Out of Scope section enumerates 9 explicit exclusions (MCP registration, CLI invocation, .describe() annotations, vault-less specific mode, strict-against-unknown-keys at base level, content validation beyond non-empty vault, localisation, obsidian_exec refactor, ADR-003 modification).
- [x] Dependencies and assumptions identified
  - Assumptions section lists 14 explicit assumptions covering ADR-003 alignment, single-source-of-truth, vault-empty-string semantics, refinement vs. .never() implementation latitude, base-permissive composition, undefined-key semantics, JSON Schema generator identity, default module path, and constitutional bindings.

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
  - FR-002 ↔ Story 1 AC#1, Story 2 AC#5, Edge Case "discriminator absent". FR-003 ↔ Story 1 AC#1–6. FR-004 ↔ Story 2 AC#1–4 + Edge Case "active+undefined forbidden key". FR-005, FR-006 ↔ Story 3 AC#1–5. FR-010 ↔ Story 4 AC#1–3 + SC-003. Each FR maps to at least one acceptance scenario or success criterion.
- [x] User scenarios cover primary flows
  - Story 1 (specific-mode happy + failures), Story 2 (active-mode happy + failures), Story 3 (composability — both Patterns (a) and (b) per Clarification 2026-05-06), Story 4 (typed-API correctness). Each is independently testable per its Independent Test paragraph.
- [x] Feature meets measurable outcomes defined in Success Criteria
  - SC-001 directly enumerates the test count (16, updated from 15 by Clarification 2026-05-06 Q1 → Story 3 AC#5). SC-003, SC-007, SC-008 are grep-mechanical. SC-005 is the constitutional coverage gate. SC-002, SC-006 become measurable as the typed-tool BIs that consume this primitive land.
- [x] No implementation details leak into specification
  - Same reasoning as Content Quality item 1: zod/zod-to-json-schema/z.infer are surface contract, not implementation. The spec is silent on internal helper functions, the exact names of the exported types, the file/folder choice (it offers a default and defers to plan), and the exact composition operator (.and() vs .merge() vs .extend()).

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.
- All checklist items pass on first pass — the user input was unusually well-specified (14 explicit MUST items in the framework section + 12 acceptance criteria + 3 out-of-scope items + 4 derived constraints from ADR-003), leaving little spec-stage interpretation surface and zero `[NEEDS CLARIFICATION]` markers needed. This is the same posture as spec 003 (also a follow-on to a binding ADR with detailed user input).
- /speckit-clarify session 2026-05-06 pinned two further decisions that were nominally plan-stage but materially affected the public API and test design: (Q1) **composition export shape** = three exports (per-branch object schemas + discriminated union); (Q2) **active-mode forbidden-key error message** = custom prose naming the key + the active mode, with NO recovery instruction. Both are recorded in the spec's Clarifications section and propagated into FR-001, FR-004, FR-005, FR-010, FR-012, Story 2 ACs #2–4, Story 3 (Independent Test + AC#5), Out of Scope, Key Entities, SC-001, SC-004, and Assumptions.
- Plan-stage decisions still deferred from this spec (per FR-001, FR-004, FR-010, FR-012): module path (`src/target-mode/target-mode.ts` vs. `src/schemas/target-mode.ts`), exact zod API for the active-mode forbidden-key rejection (`.refine()` vs `.never().optional()` with custom errorMap vs `.superRefine()` — Clarification 2026-05-06 Q2 pinned the message contract but not the API), exact export names for the three schemas and inferred types, type-system test mechanism (`expectTypeOf` vs `tsc --noEmit` only).
- Recommended next step: proceed to `/speckit-plan`. The two highest-impact ambiguities are now resolved; remaining deferrals are genuine plan-stage concerns.
- /speckit-analyze session 2026-05-06 surfaced four cross-artifact findings (1 HIGH, 1 MEDIUM, 2 LOW), all remediated in-place before /speckit-implement: **(H1)** Story 4 AC #2 + tasks T021 + quickstart Scenario 8 claimed a type-level negative test (`{ target_mode: "active", vault: "V" }` should fail compilation) that is not enforceable because the underlying base schemas use `.passthrough()` (FR-005 composition tolerance widens the inferred type with `& { [key: string]: unknown }`); reworded to acknowledge runtime-only enforcement at FR-004 / T014. **(M1)** T024's SC-002 grep `z.discriminatedUnion("target_mode", ...)` would yield false positives for legitimate Pattern (b) downstream consumers; replaced with a two-step check (find candidates, then verify each is the primitive itself or imports from it). **(L1)** T008 AC #6 message-content assertion strengthened from path-only to also verify a non-emptiness substring (`/at least 1/i`, `/non-empty/i`, or `/empty/i`) per Story 1 AC #6's "indicates a non-empty value is required." **(L2)** FR-009's forbidden-imports list expanded from 3 to 8 entries to match SC-008 / T023 (single source of truth in the FR).
