# Feature Specification: Tech Stack Upgrade

**Feature Branch**: `067-upgrade-tech-stack`
**Created**: 2026-07-04
**Status**: Draft
**Input**: User description: "Upgrade Tech Stack - all recommended updates as per the suggested order"

## Overview

The project's toolchain has fallen behind the current ecosystem: eight known security
advisories ride in through transitive dependencies, and the compiler, linter, and
schema-validation libraries each have a stable major release available that the project
has not adopted. A prior verified analysis (2026-07-04) established that every pending
upgrade is unblocked and identified two deliberate exclusions (the code formatter's 3.9.x
line, which carries an open unresolved formatting regression, and the runtime floor,
which stays where it is until the current maintenance line reaches end of life).

This feature brings the stack current in five ordered, independently verifiable
increments while preserving the externally observable behavior of the published MCP
server: the tool catalog, the shape of every tool's published input descriptor, the
validation envelope, and the custom validation messages and machine-readable issue codes
that clients and tests depend on.

## Clarifications

### Session 2026-07-04

- Q: The new validation library's built-in descriptor conversion adds a top-level
  dialect-marker key (`$schema`, draft 2020-12) that the previous converter did not
  emit; the committed registry fingerprint baseline hashes the canonical descriptor
  JSON, so this key decides whether the baseline survives untouched or must be
  regenerated. Strip the key, or accept it into the published descriptors? → A: Strip
  it. Descriptors remain byte-identical to today, the committed fingerprint baseline
  stays valid with no regeneration, and clients observe zero drift. The MCP protocol
  already assumes the JSON Schema dialect, so the key carries no information.
  - *Plan-phase correction (2026-07-04, probe-proven)*: the question's premise ("the
    old converter emitted no such key") was wrong — today's descriptors already carry
    the draft-07 dialect key inside the hashed baseline bytes, so literally stripping
    would fail all 34 fingerprints. The decision's INTENT (byte-identical descriptors,
    baseline unregenerated, zero client drift) is preserved exactly; the MECHANISM is
    corrected to: emit the draft-07 dialect target (byte-identical key) plus a
    four-rule behavior-free normalization pass. Proven end-to-end: 22 shape fixtures +
    live dump of all 34 tools, fingerprint-identical. See plan.md / research.md R2.
- Q: The new validation major removes some API forms outright (four fields carrying
  eight custom-message parameters, one single-argument record declaration — mandatory
  fixes) but only deprecates others that keep working (the strict unknown-key
  shorthand at ~115 occurrences across ~43 schema files, the refinement hook at 20
  occurrences across 16 files, a legacy type alias in the shared chokepoints). How far does the
  migration go? → A: Full modernization. All deprecated API forms are replaced with
  their current-major equivalents inside this feature, leaving zero deprecation debt.
  Behavior preservation is gated by the registry fingerprint baseline (descriptors)
  and the machine-code assertions (validation behavior).
  - *Plan-phase correction (2026-07-04, probe-proven)*: the question's premise
    overstated what is deprecated — at the target validation-library version the
    strict unknown-key shorthand carries only a prose recommendation (no deprecation
    tag) and the refinement hook is not deprecated at all (it IS the current-major
    canonical form; its nominal successor is strictly worse for this codebase's
    pattern). Scope as corrected: all genuinely deprecated forms migrate (mandatory);
    the strict shorthand is still converted to its recommended replacement as the
    chosen modernization posture (descriptor parity proven); the refinement hook is
    deliberately KEPT. "Zero deprecation debt" (FR-016, SC-009) remains fully
    satisfied. See plan.md / research.md R3 and the zod4-api-mapping contract.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Vulnerability-Free Dependency Baseline (Priority: P1)

As a maintainer, I refresh the dependency lockfile and take all pending minor/patch
tooling updates, so that the project reports zero known security advisories and the
existing toolchain is current within its existing major versions.

**Why this priority**: One of the eight advisories affects a module that is actually
loaded at runtime by the published server; the rest are hygiene. This increment is pure
in-range refresh — no code changes — so it delivers the highest risk reduction at the
lowest cost and de-risks every later increment.

**Independent Test**: Run the project's security audit and the full test suite before
and after the refresh. Audit count drops from eight advisories to zero; the declared
direct-dependency list is unchanged by the audit fix; the suite stays green.

**Acceptance Scenarios**:

1. **Given** the current lockfile with eight known advisories, **When** the in-range
   refresh is applied, **Then** the security audit reports zero known vulnerabilities.
2. **Given** the refreshed lockfile, **When** the direct-dependency manifest is compared
   to its prior state, **Then** no direct dependency changed as a result of the audit
   fix (pending minor/patch bumps are taken as explicit, reviewed range updates).
3. **Given** the refreshed toolchain, **When** the full test suite, typecheck, lint, and
   build run, **Then** all pass with no source changes required.
4. **Given** the formatter's known upstream regression, **When** this increment
   completes, **Then** the formatter remains on its current 3.8.x line.

---

### User Story 2 - Current Compiler Major (Priority: P2)

As a maintainer, I move the project to the compiler's latest stable major release, so
that the project stays inside its lint toolchain's officially supported compiler window
and is positioned on the vendor's prescribed on-ramp for the next-generation compiler.

**Why this priority**: Cheapest verified win — the project's compiler configuration
already matches the new major's defaults except for one known, empirically confirmed
gap (the standard-library type definitions for the runtime must now be included
explicitly). Delaying leaves the project one major behind with no offsetting benefit.

**Independent Test**: Typecheck, build, and full test suite pass under the new compiler
major; the emitted build output (entry points, declarations, module layout) is
structurally unchanged; no deprecation warnings are produced by the project's compiler
configuration.

**Acceptance Scenarios**:

1. **Given** the current compiler configuration, **When** the compiler major is adopted
   and the runtime type definitions are explicitly included, **Then** typecheck and
   build complete with zero errors and zero deprecation warnings.
2. **Given** the new compiler major, **When** the published package is built, **Then**
   the built artifact layout (binary entry point, type declarations) is unchanged.
3. **Given** the lint toolchain's declared supported compiler range, **When** the new
   compiler version is checked against it, **Then** the version falls inside the
   officially supported window.

---

### User Story 3 - Current Linter Major (Priority: P3)

As a maintainer, I move the project to the linter's latest stable major and replace the
one abandoned plugin that blocks it with its actively maintained successor, so that lint
coverage is preserved on a supported toolchain and redundant duplicate lint dependencies
are removed.

**Why this priority**: The linter's previous major is now in maintenance mode. One
dormant plugin (no release in over a year) is the sole blocker; its maintained successor
provides the same rule. Depends on nothing from later increments.

**Independent Test**: Lint the unchanged codebase under the new linter major with the
successor plugin wired in; the run completes with zero new violations, and the
import-ordering rule still produces diagnostics when a deliberately mis-ordered import
is introduced.

**Acceptance Scenarios**:

1. **Given** the existing codebase with no source changes, **When** lint runs under the
   new linter major, **Then** it reports zero new violations.
2. **Given** the successor import plugin, **When** an intentionally mis-ordered import
   is linted, **Then** the import-ordering rule reports it (rule coverage preserved).
3. **Given** the dependency manifest, **When** this increment completes, **Then** the
   redundant legacy lint packages (superseded by the meta-package already in use) are
   removed and lint still runs identically.
4. **Given** the developer toolchain's new minimum runtime requirement (a patch level
   above the project's published floor), **When** this increment completes, **Then**
   the developer-facing minimum is documented without changing the published runtime
   floor.

---

### User Story 4 - Current Schema-Validation Major (Priority: P4)

As a maintainer, I move the project to the schema-validation library's latest stable
major and replace the deprecated schema-conversion dependency with the library's
built-in conversion, so that the validation stack is supported and the published tool
descriptors and validation behavior remain identical for MCP clients. Per
clarification (2026-07-04), the migration is a full modernization: every deprecated
API form of the validation library — not only the removed ones — is replaced with its
current-major equivalent in this increment, leaving zero deprecation debt.

**Why this priority**: Largest verified migration surface of the five increments, so it
goes last among the code-touching work. The conversion dependency is deprecated upstream
(unmaintained since late 2025), and the protocol SDK's next major is expected to drop
the current coupling entirely — being on the new major first makes that future jump
trivial. All prerequisites verified unblocked.

**Independent Test**: Capture every tool's published input descriptor before the
migration; after the migration, the normalized descriptors are identical, all custom
validation messages and machine-readable issue codes still surface, and the full test
suite passes.

**Acceptance Scenarios**:

1. **Given** the tool catalog before migration, **When** descriptors are regenerated
   under the new validation major, **Then** every tool's normalized descriptor
   (property sets, required lists, unknown-key policy, defaults) is identical to the
   pre-migration capture.
2. **Given** a tool input that previously produced a custom validation message with a
   machine-readable code, **When** the same invalid input is submitted after migration,
   **Then** the same custom message and the same machine-readable code are returned.
3. **Given** fields that are optional with defaults, **When** descriptors are
   regenerated, **Then** those fields remain optional in the published descriptor (not
   promoted to required).
4. **Given** the dependency manifest, **When** this increment completes, **Then** the
   deprecated conversion dependency is removed and the declared minimum versions of the
   validation library and the protocol SDK reflect the actual minimums the code
   requires.
5. **Given** the validation error envelope, **When** any validation failure occurs,
   **Then** the envelope shape (path, message, code) is unchanged.
6. **Given** the fully modernized schema code, **When** the codebase is scanned for
   deprecated validation-library API forms, **Then** zero remain, and every
   replacement preserved its prior behavior (unknown-key rejection, refinement issue
   codes and messages, descriptor output — the fingerprint baseline still passes).

---

### User Story 5 - Supported CI Runtime (Priority: P5)

As a maintainer, I move the CI workflow's actions to versions that run on a supported
automation runtime and extend the CI matrix to cover both the published runtime floor
and the current Active LTS line, so that CI stops emitting deprecation warnings and
regressions against either supported runtime line are caught before release.

**Why this priority**: Hygiene, not urgency — verification established there is no hard
breakage deadline (the platform migrates old actions rather than failing them). Lowest
risk, lowest value of the five; can land any time.

**Independent Test**: A CI run on the updated workflow completes green on both runtime
lanes with no runtime-deprecation warnings attributable to the workflow's actions.

**Acceptance Scenarios**:

1. **Given** the updated workflow, **When** CI runs, **Then** lint, typecheck, test, and
   build pass on both the runtime-floor lane and the Active LTS lane.
2. **Given** the updated workflow, **When** CI runs, **Then** no deprecation warnings
   about the actions' underlying runtime are emitted.
3. **Given** the published package manifest, **When** this increment completes, **Then**
   the published runtime floor is unchanged.

---

### Edge Cases

- A formatter update inside the excluded 3.9.x line must not ride in through the
  lockfile refresh; the formatter stays on 3.8.x until the upstream regression
  (blank-line injection around HTML comments in Markdown lists — a pattern present in
  this repository's documentation) is resolved.
- The new validation major silently ignores the old-style custom-message parameters
  rather than erroring: if the four affected fields (eight parameters) are not
  migrated, the custom messages vanish without any build or test failure unless a test
  asserts them. The migration must include explicit assertions on those messages.
- The built-in descriptor conversion defaults to a mode that promotes optional-with-
  default fields to required; the conversion must use the input-oriented mode and the
  descriptor-parity test must cover a defaulted-optional field.
- The built-in conversion defaults to a newer schema dialect than the one the
  descriptors carry today; per the corrected clarification (2026-07-04) the conversion
  targets the current dialect (byte-identical marker) and a four-rule normalization
  pass neutralizes the remaining emission differences, so the committed registry
  fingerprint baseline passes without regeneration.
- Default (non-custom) validation message text differs between the old and new
  validation majors; this drift is client-visible in the generic validation envelope.
  Custom messages and machine codes must not drift; default-text drift is accepted and
  documented.
- The linter's new major raises its minimum runtime a patch level above the project's
  published floor: a contributor on the exact published floor could no longer run lint
  locally. The documented developer minimum must call this out.
- The single-argument record-schema form is removed in the new validation major; the one
  affected declaration must be migrated to the two-argument form.
- The full-modernization sweep (per clarification 2026-07-04) touches ~43 schema files
  mechanically; a behavior drift hidden inside the sweep would be invisible in review
  by diff size alone. The registry fingerprint baseline and the message/machine-code
  assertions are the gates that make the sweep safe — they must pass unregenerated
  after the sweep, not be updated to match it.
- Coverage runs on Windows are known to race on cold runs; verification of each
  increment must use the known-reliable invocation so a flaky infrastructure failure is
  not misread as an upgrade regression.
- If the Active LTS CI lane fails while the floor lane passes, the failure indicates a
  runtime-compatibility regression that must be fixed before release, not a reason to
  drop the lane.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The project MUST carry zero known security advisories after the dependency
  refresh, achieved entirely through in-range transitive updates (no major-version
  changes introduced by the audit fix itself).
- **FR-002**: All pending minor/patch updates to the existing toolchain (test runner,
  coverage provider, lint tooling, runtime type definitions) MUST be taken within their
  current major lines.
- **FR-003**: The code formatter MUST remain on its current 3.8.x line; adopting the
  3.9.x line is out of scope until the known upstream Markdown regression is fixed.
- **FR-004**: The project MUST build, typecheck, lint, and test cleanly under the latest
  stable majors of the compiler, the linter, and the schema-validation library.
- **FR-005**: The compiler configuration MUST explicitly include the runtime's
  standard-library type definitions (required by the new compiler major's changed
  default) and MUST produce zero deprecation warnings, keeping the configuration clean
  for the announced next-generation compiler.
- **FR-006**: The abandoned import-plugin dependency MUST be replaced by its actively
  maintained successor with equivalent rule coverage (import ordering enforced; the
  intentionally disabled resolution rules remain disabled).
- **FR-007**: The redundant legacy lint packages that duplicate the meta-package already
  in use MUST be removed from the dependency manifest.
- **FR-008**: The deprecated schema-conversion dependency MUST be removed and replaced
  by the validation library's built-in conversion operating in input-oriented mode.
- **FR-009**: Every tool's published input descriptor MUST be byte-identical (after
  canonicalization) before and after the migration: same property sets, same required
  lists, same unknown-key policy, same defaults; the conversion MUST emit the same
  dialect marker the descriptors carry today (draft-07 target) followed by a
  behavior-free normalization pass at the single conversion point, and the committed
  registry fingerprint baseline MUST pass unregenerated.
- **FR-010**: All custom validation messages and machine-readable issue codes MUST
  survive the validation-library migration, including the four fields carrying the
  eight removed custom-message parameters and the one single-argument record
  declaration.
- **FR-011**: The validation error envelope shape (path, message, code per issue) MUST
  be unchanged; no new top-level error codes may be introduced.
- **FR-012**: The dependency manifest's declared minimum versions MUST be raised to the
  actual minimums the code requires (the validation library and protocol SDK floors are
  currently declared below what the code needs).
- **FR-013**: The published runtime floor (engines) MUST remain unchanged; the higher
  developer-toolchain minimum introduced by the linter major MUST be documented as a
  development-only requirement.
- **FR-014**: The CI workflow MUST use action versions running on a supported automation
  runtime and MUST validate the project on both the published runtime floor line and the
  current Active LTS line.
- **FR-015**: The five increments MUST land in the stated order, each leaving the
  project releasable (full suite green) so any increment can be shipped or reverted
  independently.
- **FR-016**: The validation-library migration MUST replace every deprecated API form
  with its current-major equivalent (full modernization per clarification 2026-07-04):
  zero deprecated validation-library API usage remains at feature completion. Each
  replacement MUST be behavior-preserving — unknown-key rejection policy, refinement
  issue codes/messages/metadata, and descriptor output are unchanged, gated by the
  registry fingerprint baseline (FR-009) and the message/machine-code assertions
  (FR-010).

### Key Entities

- **Dependency manifest**: The declared direct dependencies, their version ranges, and
  the published runtime floor; the artifact whose floors FR-012 raises and whose
  redundant entries FR-007 removes.
- **Lockfile**: The resolved dependency graph; the sole artifact changed by the FR-001
  security refresh.
- **Published tool descriptor**: The per-tool input schema served to MCP clients in the
  tool catalog; the parity target of FR-009.
- **Validation envelope**: The structured error surface (path, message, machine code per
  issue) returned for invalid tool input; the compatibility target of FR-010/FR-011.
- **CI workflow definition**: The automation pipeline configuration; the target of
  FR-014.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Security audit reports 0 known vulnerabilities (baseline: 8, including 1
  in a runtime-loaded module).
- **SC-002**: 100% of the existing test suite passes at the completion of every one of
  the five increments, using the project's reliable coverage invocation.
- **SC-003**: 100% of published tool descriptors are byte-identical (after
  canonicalization) before and after the validation-library migration, verified by the
  existing committed registry fingerprint baseline passing without regeneration.
- **SC-004**: 100% of custom validation messages and machine-readable issue codes
  observable before the migration remain observable after it.
- **SC-005**: CI is green on both supported runtime lanes with 0 action-runtime
  deprecation warnings.
- **SC-006**: The compiler, linter, and schema-validation library are each on their
  latest stable major line at feature completion; the formatter is deliberately not.
- **SC-007**: Lint reports 0 new violations on the unchanged codebase after the linter
  migration.
- **SC-008**: An MCP client connecting to the upgraded server observes the same tool
  catalog (same tool names, same descriptor shapes) as before the upgrade.
- **SC-009**: A static scan for deprecated validation-library API forms reports 0
  occurrences at feature completion, with SC-003 (descriptor parity) and SC-004
  (message/machine-code survival) still green after the modernization sweep.

## Assumptions

- The verified analysis of 2026-07-04 (workflow-audited, with adversarial verification
  of compatibility claims) is the authoritative source for what is unblocked: the
  protocol SDK already supports the new validation major, the lint toolchain already
  supports the new compiler major, and the sole linter blocker has a maintained
  drop-in successor.
- "All recommended updates as per the suggested order" means the five-increment order
  from that analysis, including its two deliberate exclusions: the formatter's 3.9.x
  line (open upstream regression) and the published runtime floor (stays at the current
  maintenance-LTS line until its end of life in April 2027).
- Default validation message text drift in the generic envelope is acceptable and will
  be documented; custom messages and machine codes are the compatibility contract.
- Whether the five increments ship as one pull request or several is a planning
  decision, not a spec constraint; the spec requires only that the ordered increments
  are each independently releasable.
- Test scope is the project's unit test suite (per project convention, manual and
  integration cases are tracked outside this repository); descriptor-parity capture is
  performed with in-process tests, not live vault probes.
- No new tools, tool behaviors, or features are added by this work; a client diffing
  the server before and after should detect nothing beyond the documented
  default-message text drift.
