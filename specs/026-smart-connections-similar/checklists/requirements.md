# Specification Quality Checklist: Smart Connections Similar — Semantic Similarity for a Single Note

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

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`
- **Content Quality caveats**: This spec, like all specs in this repo for BI-NNN features, references project-specific implementation conventions (eval subcommand, base64 anti-injection, BI-014/015/025 cohort, ADR-003, 011-R5 clause) because the project's typed-tool surface is itself the product domain — agents are the user and the contracts ARE the user-visible behaviour. Implementation-detail mentions are scoped to assumptions / rationale, not to the user stories or functional requirements themselves.
- **Eleven locked decisions from grilling session 2026-05-15** (Q1–Q11 spec-stage): similarity-from-a-note primitive (Q1=a), eval mechanism (Q2=a), source-only granularity (Q3=a), limit-only input knob (Q4=i), discriminator-only error pattern (Q5=β), plugin-namespace tool name `smart_connections_similar` (Q6=d → d1), pass-through score + descending sort + path-byte-compare tiebreak (Q7), 8-code error roster (Q8), total flag + limit 1..100/default 20 + path-with-.md (Q9), plan-stage live-plugin probe (Q10), 11-decision synthesis (Q11). All eleven decisions are reflected in FRs and SCs.
- **Five clarifications-session decisions 2026-05-15** (Q1–Q5 post-spec): Q1 docs-only soft-pin for minimum plugin version (FR-022 + assumptions + inherited-limitations list); Q2 silently drop non-finite scores via in-eval `Number.isFinite` filter (FR-009a + Edge Cases addition); Q3 in-eval vault-mismatch detection — **REVISED by live-probe-driven amendment below**; Q4 outer-to-inner / cheapest-first error precedence chain (FR-017b + SC-011b + FR-022 docs surface); Q5 architecture doc SNAPSHOT semantics — new file is BI-026-frozen, base file is canonical forward-going (FR-030 rewrite + new FR-030a + new SC-028a).
- **Two live-probe-driven amendments 2026-05-15** (post-test, supersedes prior Q3 and grilling Q3): probe of `obsidian vault=<name> eval` against three open vaults revealed (i) `vault=` routes the eval correctly to the named vault's `app` instance (FR-017a's "wrong-vault" premise was false) AND (ii) `find_connections()` returns block-level matches by default (grilling Q3's source-only assumption was false). Amendment 1 (post-Q3): repurpose FR-017a for vault-not-currently-open detection (`details.reason = "not-open"` instead of `"not-focused"`); multi-vault basename ambiguity returns to inherited-limitations list (#5); FR-017b precedence-chain updated; SC-011a / SC-011b updated; closed-vault detection mechanism deferred to plan-stage probe per FR-024. Amendment 2 (post-grilling-Q3): switch v1 per-match shape from `{path, score}` (source-only) to `{path, headingPath, score}` (block-level — plugin's natural output); FR-007 / FR-008 / FR-010 / Key Entities all rewritten; sort gains tertiary tiebreak on `headingPath`; "block-level matches deferred" REMOVED from both inherited-limitations and OOS lists; new SC-007a (three-field shape exhaustive contract); US1 acceptance scenario 1 rewritten with block-level example.
- **Plan-phase deliverables per user input**: FR-029 (create ADR-013 codifying plugin-namespace tool-naming convention) and FR-030 + FR-030a (snapshot the architecture-with-SC file AND roll forward the base architecture file). All three are explicit success criteria (SC-027, SC-028, SC-028a).
- **Plan-stage prerequisite**: TestVault must have Smart Connections plugin installed and initial indexing completed before `/speckit-plan` runs (FR-024 is BLOCKING).
