# Specification Quality Checklist: Fix Write Gaps

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-12
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

## Validation Notes (run 3 — 2026-05-12 — post-/speckit-analyze remediation)

`/speckit-analyze` 2026-05-12 surfaced 5 LOW-severity findings (zero CRITICAL / HIGH / MEDIUM). User requested full remediation. All 5 findings closed in-place; the bullets below capture the resolution per finding ID:

- **U1 — FR-005 no-impact contract assertion**: reframed as an explicit no-impact delegation that names FR-001 (resolution rule), 016-FR-011 (cache invalidation), and SC-002 (testability path). The annotation `*(no-impact contract delegation — no testable handler-side rule)*` makes the delegation visible at scan time so future maintainers don't search for a handler-side rule that doesn't exist.
- **U2 — T005 open-ended audit scope**: the audit was performed at remediation time. `grep -n "file:" src/tools/write_note/handler.test.ts` returned empty on the current branch HEAD — ZERO existing handler.test.ts cases use the `file` parameter; every existing case uses `path: "..."` exclusively. T005 was converted from a "discover failing cases after T004 lands" task to an "audit-confirmation gate" — the implementing agent runs the grep, confirms it's still empty, and T005 is satisfied with no edits. Propagated to: research.md R9, data-model.md module LOC budget, plan.md (three locations: Testing context line, Coverage gate line, Project Structure source-tree line, Phase 0 R9 entry), contracts/write-note-handler-delta.contract.md test-seam pattern section, tasks.md (Tests header + T001 description + T005 wording).
- **C1 — T010 maps to R4 only**: T010's wording now carries explicit anchors to BOTH research decision R4 (preserved mapFsError asymmetry) AND Constitution Principle II (Public Surface Test Coverage — NON-NEGOTIABLE: happy-path + failure-or-boundary tests in the same change). T010 is the boundary-test side of the symmetric-coverage requirement for US2's surface modification.
- **I3 — path-anchor convention varies between plan.md and tasks.md**: tasks.md's "Path Conventions" section now explicitly documents that paths in tasks.md are relative-to-this-file (`../../src/tools/...`) while plan.md uses repo-root-relative paths — established project precedent (cf. 019-list-files). The asymmetry is intentional; the note prevents reader confusion.
- **M5 — SC-002 operator-gated manual verification**: SC-002 and T017 both gained prominent `⚠️ OPERATOR-GATED` / `⚠️ MERGE GATE` flags. SC-002's wording now explicitly states "This is the only SC in this BI that cannot be unit-tested" + "the merging reviewer MUST confirm S-2 was run and passed before approving the PR". T017's wording now requires the verification outcome to be recorded in the PR description with a `S-2: PASS` (or `FAIL` with diagnostics) line.

All 16 checklist items continue to pass after remediation. The post-remediation artifact set is internally consistent across spec.md, plan.md, research.md, data-model.md, contracts/, tasks.md, and quickstart.md (quickstart.md required no edits — its scenarios already correctly reflect the post-remediation reality).

## Validation Notes (run 2 — 2026-05-12 — post-/speckit-clarify)

Two clarifications integrated after the initial pass (recorded in the spec's `## Clarifications > Session 2026-05-12` section):

- **Q1 — `details` object shape on `FILE_EXISTS` rejection**: additive. The `errno: "EEXIST"` field is added alongside the existing `{ path, vault }` fields rather than replacing them. Field-name parity on `details.errno` (not full `details`-object parity) is the contract across filesystem-level failure responses. Touched: FR-007, FR-008, FR-018 (b), Story 2 description / Independent Test / AC#1-AC#2, Key Entities `Precise filesystem-level diagnostic indicator`, SC-004, SC-007, SC-011 (b).
- **Q2 — `file` parameter semantics for non-canonical inputs**: literal short-form rule. The Story 1 `.md`-appending resolution fires only when `file` has no folder separator AND does not end in `.md`; any other `file` value passes through verbatim. Asymmetric on input shape by design; help update documents the canonical shape. Touched: Story 1 description / Independent Test / AC#1-AC#7, FR-001 / FR-001a / FR-002 / FR-003 / FR-018 (a), Key Entities `Resolved location`, Edge Cases (file-with-extension, file-with-folder-separator), Assumptions (existing-input-contract bullet), SC-001, SC-011 (a).

All 16 checklist items pass after re-validation. No `[NEEDS CLARIFICATION]` markers remain. No contradictory pre-clarification statements survive (the two Edge Cases bullets that previously deferred to the schema have been replaced with precise FR-001a passthrough statements; the SC and FR wording has been normalised to `<file>.md` / `details.errno` / additive throughout).

## Validation Notes (run 1 — 2026-05-12)

**Content Quality**:
- Spec scopes both fixes against the operation's public contract without naming languages, frameworks, or specific file paths in user-facing sections. The Assumptions section names Node's `fs.writeFile` `wx` flag and `EEXIST` once each, but only as the standard POSIX errno name (technology-agnostic identifier) and the rationale for why the indicator's value is `"EEXIST"`. The user input itself anchored the diagnostic to "the precise filesystem-level diagnostic indicator", so naming the standard POSIX errno name in the indicator's expected value is unavoidable without inventing a parallel vocabulary; the same naming convention is what the prior surface (016-reliable-writer FS_WRITE_FAILED) already publishes to callers.
- Cross-cutting non-impact requirements (FR-011..FR-017) and the Out-of-scope assumptions explicitly preserve every architectural property of the underlying surface — input contract, top-level error code roster, response shape, write mechanism, retired parameters' retired status, other tools' surfaces, connector-client carve-out, symlink/network/read-only behaviour. Nothing leaks into implementation territory.

**Requirement Completeness**:
- All FRs are testable: each names a specific input shape, the expected response/disk outcome, and the conditions under which the rule fires.
- SC-001 through SC-011 are measurable: each names a 100%, 0%, or "verifiable by inspection" outcome with the measurement surface (response payload, filesystem inspection, Obsidian-side assertion, published-schema inspection, help-payload inspection).
- No `[NEEDS CLARIFICATION]` markers were emitted. The user input was precise enough on (a) what "short-form name" means, (b) what "precise filesystem-level diagnostic indicator" means via the 016 FS_WRITE_FAILED `details.errno` parity claim, and (c) the Out-of-scope boundary covering top-level error codes, input contract, write mechanism, retired parameters, connector carve-out, and symlink/network/read-only behaviour. Edge cases around `file` with extension or folder separator are handled by the Assumptions section (existing schema preserved verbatim) and the Edge Cases section.
- Edge cases section names short-form-collision composition, short-form-with-extension, short-form-with-folder-separator, active-mode interaction, empty-existing-file collision, other-filesystem-error during short-form, and path-without-extension — covering the boundaries identified during analysis.
- Scope boundary is explicit in Out-of-scope-aligned cross-cutting FRs (FR-011..FR-017) and in the Assumptions section.
- Dependencies on existing surface properties (016's `FS_WRITE_FAILED` shape, Obsidian's `.md` extension default, post-write cache-freshness handling) are named in the Assumptions section.

**Feature Readiness**:
- Both user stories are P1, both independently testable, both shippable independently — Story 1 alone restores short-form-name correctness (existing collision diagnostic unchanged from current state); Story 2 alone restores precise diagnostic on collision (short-form-name still broken). Either alone is a measurable contract-restoration ship.
- Success criteria SC-001..SC-011 cover both stories' acceptance outcomes plus the cross-cutting non-impact guarantees.
- No implementation details (no module paths, no helper-function names, no test-case counts, no specific Node API calls in the FRs or SC sections).

All items pass on first validation run; no spec updates required.
