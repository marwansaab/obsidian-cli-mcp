# Specification Quality Checklist: Progressive Disclosure Help Tool

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-06
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

### Validation pass — 2026-05-06

**Content Quality**: PASS with one nuance.
- The spec names specific implementation surfaces (`zod-to-json-schema`, `import.meta.url`, `UpstreamError`, `vitest`, `node:url`, `node:path`, `process.cwd()`) because the feature itself IS implementation infrastructure: ADR-005 is a tactical decision about how to encode tool definitions in the MCP protocol, and the spec's "users" are the project's contributors and the LLM agents that consume the resulting tool surface, not external business stakeholders. Per the spec template's "non-technical stakeholders" guidance, this concession is intentional and matches the convention established by [001-add-cli-bridge/spec.md](../../001-add-cli-bridge/spec.md), [003-cli-adapter/spec.md](../../003-cli-adapter/spec.md), and [004-target-mode-schema/spec.md](../../004-target-mode-schema/spec.md), all of which name specific libraries and module paths because they are themselves architectural primitives. The spec keeps the WHY (token economy, agent self-recovery, single-source-of-truth schemas) front and centre and treats the HOW as bounding context for plan-stage.

**Requirement Completeness**: PASS.
- Zero [NEEDS CLARIFICATION] markers in the spec — every potentially-ambiguous decision was resolved by either (a) referencing the user input's explicit guidance, (b) following a precedent already set by ADR-005 / Constitution / prior specs, or (c) marking the decision as a plan-stage choice with a documented behavioral contract that binds and an explicit reasonable default. Examples of plan-stage deferrals: empty-string `tool_name` failure surface (FR-008 last bullet), missing-`docs/tools/`-directory error code choice (Edge Cases), exact module path/function name for the strip utility (FR-001), `obsidian_exec.md` content choice (FR-012), specific list of which stub files to ship (FR-012), registry-consistency-test choice (Out of Scope). All of these are bounded by an explicit reasonable default, so the spec is not under-specified.
- Every FR is testable: each names a verifiable behavior (file contents, error code, schema-key absence/presence, mutation invariant, packaging artifact contents, `import.meta.url` usage, etc.). Reviewers can author a vitest assertion directly from any FR.
- All 10 SCs are measurable: 5 are mechanical (grep, JSON-walk, file-existence checks), 4 are runtime test outcomes (vitest pass), 1 is a directional empirical measurement (SC-006 token reduction) that names the measurement procedure.
- Edge Cases section enumerates 12 distinct boundary conditions: empty string, case mismatch, path traversal, ambiguous `index` lookup, missing directory, empty file, registered-tool-no-doc, doc-no-registered-tool, non-object strip input, non-string description value, root-description preservation, registration-bypass regression. Coverage is exhaustive for the documented surfaces.
- Scope is bounded explicitly via the Out of Scope section, which lists 9 deliberate exclusions and names the future work that owns each.
- Assumptions section enumerates 13 assumptions with their constitutional/spec backing.

**Feature Readiness**: PASS.
- Every FR maps to one or more user stories' acceptance scenarios:
    - FR-001–006 (strip utility) → Story 1 AC#1–6.
    - FR-007–011 (`help` tool) → Story 2 AC#1–6, plus Story 4 AC#2 for FR-009.
    - FR-012–014 (docs files / packaging) → Story 4 AC#1, plus the ambient existence-checks in Story 2.
    - FR-015–016 (top-level descriptions) → Story 3 AC#1–3.
    - FR-017–021 (test/header/coverage gating) → constitutional gates (II, V, Development Workflow §5/§8) — orthogonal to user-facing scenarios.
- The four user stories cover the four primary flows: register-with-strip, look-up-docs, advertise-help-recovery-path, ship-the-docs.
- All 10 SCs are linked to FRs and acceptance scenarios; SC-001 explicitly enumerates the 17-scenario count and verification command.

### Final disposition

All checklist items pass on first iteration. Spec is ready for `/speckit-clarify` or `/speckit-plan`.

The deliberate plan-stage deferrals are recorded as such in the spec rather than left as [NEEDS CLARIFICATION] markers, because each carries a binding behavioral contract plus a documented reasonable default — which is the pattern this project established in 003-cli-adapter and 004-target-mode-schema for tactical implementation choices that benefit from research at plan stage rather than upfront speculation.

### Post-/speckit-clarify update — 2026-05-06

Five clarification questions were lifted from plan-stage deferrals to spec-stage clarifications and integrated into the spec:

- **Q1** — empty-string `tool_name` failure surface: zod boundary rejection (`VALIDATION_ERROR`); FR-007 schema upgraded to `z.string().min(1).optional()`. Edge Case + FR-008 last-bullet updated.
- **Q2** — `obsidian_exec.md` content: full doc authored in this BI, derived from 001's contracts; FR-012 + Out of Scope updated.
- **Q3** — stub roster: hybrid (FR-012's canonical 5 ∪ architecture-committed names) → six stub files today (`read_note`, `write_note`, `append_note`, `search_vault`, `list_notes`, `list_vaults`). FR-012 updated.
- **Q4** — missing-`docs/tools/`-directory error code: distinct `HELP_DOCS_MISSING` code (separate from `HELP_TOOL_NOT_FOUND`). FR-008, FR-011, Edge Cases, Key Entities, two Assumptions updated.
- **Q5** — registry-consistency test: include in this BI; FR-017 + new SC-011 added; Edge Cases + Out of Scope refined to clarify the inverse direction (orphan docs) is still tolerated.

Remaining plan-stage deferrals are limited to genuinely tactical choices: exact module path/function name for the strip utility, exact wording of top-level descriptions (FR-015/16), bypass-detection assertion location (Edge Cases line 119), and SC-006 measurement mechanism (benchmark vs one-off). All are bounded by binding behavioral contracts.

Spec is now ready for `/speckit-plan`.

### Post-/speckit-analyze remediation — 2026-05-06

`/speckit-analyze` flagged 7 cross-artifact findings (0 CRITICAL, 0 HIGH, 3 MEDIUM, 4 LOW). All 7 were remediated in a single pass before `/speckit-implement`. One LOW finding (L1a — `help({ tool_name: "index" })` Edge Case) was upgraded internally to a real correctness issue: the original handler implementation sketch in research.md would erroneously return `index.md`'s content for `help({ tool_name: "index" })` because `index.md` exists as a real file in the directory; the spec edge case binds the call to fail with `HELP_TOOL_NOT_FOUND`. The remediation added an explicit reserved-name guard to the handler.

**Findings remediated**:

- **I1** (MEDIUM, spec.md Key Entities): Updated row 2's `tool_name` shape from `z.string().optional()` to `z.string().min(1).optional()` to match FR-007 + Clarification Q1.
- **I2** (LOW, plan.md / research.md): Added **P8** plan-stage decision — the SDK-dispatch aggregator pattern (refactor `registerObsidianExecTool` to return descriptor + handler instead of calling `setRequestHandler` directly; aggregate both tools' registrations in `server.ts`). The MCP SDK constraint (one handler per request type) makes this required for two-tool registration; T017 + T019 land the refactor.
- **L1a** (upgraded LOW → correctness): Added reserved-name guard to the handler sketch in research.md, the handler implementation in T015, the help.contract.md (new B4a branch), and a dedicated test case (T016 case 9). The guard fires `HELP_TOOL_NOT_FOUND` for `tool_name === "index"` before the filesystem read.
- **L1b** (LOW, Edge Case "doc file exists but is empty"): Added T016 case 10 + data-model entry. Verifies an empty doc file returns `text: ""` per the spec.
- **L1c** (LOW, Edge Case "doc file exists but no tool with that name is registered"): Added T016 case 11 + data-model entry. Verifies orphan doc files are tolerated (filesystem-as-source-of-truth per FR-008).
- **L2** (LOW, plan.md Scale/Scope): Updated source-LOC estimate from "≲ 160 LOC" to "≲ 200 LOC" to reflect the P8 aggregator-pattern refactor (~30 LOC redistribution) plus the post-remediation test cases (~50 LOC additional tests).
- **L3** (LOW, T020 ambiguity): Disambiguated T020 — it now augments the existing tools/list test inline (no new `it`), keeping the test-count accounting consistent with the post-remediation 27 figure.
- **C1** (MEDIUM, Story 2 AC#6 coverage gap): Added T014 case 4 — non-string `tool_name` rejected with `code: "invalid_type"` and `path: ["tool_name"]`. Closes the explicit AC coverage gap.
- **C2** (MEDIUM, FR-003 coverage gap): Added T009 case 7 — root-description preservation. Verifies the rule that the strip utility leaves the schema's root `description` intact while removing all nested ones. Closes the explicit FR-003 coverage gap.

**Test count delta**: 22 → 27 new test bodies. Per-file: strip-schema.test.ts 6 → 7, schema.test.ts 3 → 4, handler.test.ts 8 → 11, tool.test.ts unchanged at 3, server.test.ts unchanged at 2.

**Files touched by remediation**: spec.md (I1), plan.md (I2 P8, L2, test counts), research.md (I2 P8, L1a handler sketch, test counts), data-model.md (L1a B-branch update, test coverage map), contracts/help.contract.md (L1a B4a branch, test list updates), tasks.md (L3 T020, C1 T014, C2 T009, L1a T015 + T016, preamble), quickstart.md (Scenario 4c' added), this checklist file.

**Source code unchanged so far** — all remediation is in planning artifacts. The implementation phase (T007 onward) consumes the corrected sketches and test specs.

**Final disposition**: Spec + plan + tasks now mutually consistent. 0 CRITICAL, 0 HIGH, 0 MEDIUM, 0 LOW outstanding. Ready for `/speckit-implement`.
