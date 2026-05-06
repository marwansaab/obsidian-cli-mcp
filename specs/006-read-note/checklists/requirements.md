# Specification Quality Checklist: Read Note Typed MCP Tool

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-06
**Feature**: [Link to spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
  - Note: this spec intentionally references concrete project artefacts (zod, vitest, the adapter's `invokeCli` signature, the `RegisteredTool` aggregator pattern, the `stripSchemaDescriptions` utility) because it is a typed-tool BI that composes shipped foundations under [003-cli-adapter](../../003-cli-adapter/spec.md), [004-target-mode-schema](../../004-target-mode-schema/spec.md), and [005-help-tool](../../005-help-tool/spec.md). Per the project's convention (visible in 003/004/005's specs), each typed-tool BI cites the exact composition points it inherits from. The "no implementation details" rule is read as "no fabricated framework names that aren't already constitutional fixtures" — every name cited in this spec is anchored in a prior shipped spec.
- [x] Focused on user value and business needs (the agent-facing read primitive)
- [x] Written for stakeholders who can read TS-flavored discourse — appropriate for this codebase's audience (all readers are working in the Obsidian-CLI-MCP code path)
- [x] All mandatory sections completed (User Scenarios, Requirements, Success Criteria)

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous (every FR has a clear success/failure condition; every AC names the input shape and the expected outcome)
- [x] Success criteria are measurable (every SC has a verification mechanism — npm run test, grep, file inspection, or registry-iteration test)
- [x] Success criteria are technology-agnostic where possible. Where they cite project artefacts (`vitest`, `zod`, `invokeCli`), the artefact is a constitutional fixture from a prior shipped spec, not fresh implementation detail.
- [x] All acceptance scenarios are defined (20 scenarios across 6 user stories)
- [x] Edge cases are identified (11 edge-case bullets covering empty-vault, empty-locator, path-traversal-shaped values, forbidden-key explicit-undefined, unknown extra keys, leading whitespace, CRLF, large output, binary content, and protocol-level extras)
- [x] Scope is clearly bounded (Out of Scope section lists 10 explicit exclusions, mirroring the user input's "Out of scope" enumeration plus consequential exclusions)
- [x] Dependencies and assumptions identified (Assumptions section enumerates 12 assumptions, including the user-input ↔ shipped-foundation reconciliations for `vault: optional` and `ObsidianCLIAdapter.execute(...)`)

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria (FR-001 through FR-015 each map to one or more user-story acceptance scenarios)
- [x] User scenarios cover primary flows (file=, path=, active mode), failure modes (zod-validation failures, CLI failures), and structural compliance (strip + help description)
- [x] Feature meets measurable outcomes defined in Success Criteria (10 SCs covering test passage, structural-compliance grep checks, doc population, and the registry-consistency test)
- [x] No fabricated implementation details leak into specification — every cited artefact (`invokeCli`, `stripSchemaDescriptions`, `targetModeSpecificBaseSchema`, `applyTargetModeSpecificRefinement`, `RegisteredTool`, `asToolError`) exists in the codebase as of this spec's creation date

## Notes

- **Reconciled discrepancies between user input and shipped foundations** (documented in Assumptions, not surfaced as Clarifications):
  1. User input states `vault: string (optional)` — shipped target-mode primitive (FR-003 of [004-target-mode-schema](../../004-target-mode-schema/spec.md)) requires vault on the specific branch. Spec follows the primitive (Constitution Principle III: zod schema is single source of truth); user input's wording is interpreted as "field is part of input shape," not as "schema permits specific mode without vault."
  2. User input phrases the adapter call as `ObsidianCLIAdapter.execute("read", args, target_mode)` — shipped adapter (FR-002 of [003-cli-adapter](../../003-cli-adapter/spec.md)) exposes `invokeCli(input, deps?)`. Spec follows the actually-shipped API. Semantic intent preserved.
  3. User input's AC #3 names `CLI_NON_ZERO_EXIT` for the nonexistent-file failure mode — adapter's classification could also produce `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`, or `CLI_BINARY_NOT_FOUND` depending on what the CLI does. Spec requires propagation of whatever code the adapter raises, rather than committing the spec to a single code for a failure mode the CLI controls. The user-input AC is honoured (Story 5 AC#1 covers `CLI_NON_ZERO_EXIT`) and extended (Story 5 AC#2–#4 cover the other adapter codes).
- **Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`**: none. This spec is ready for `/speckit-clarify` (if reviewers want to confirm the reconciliations above) or `/speckit-plan`.
