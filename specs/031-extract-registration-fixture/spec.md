# Feature Specification: Extract Registration Stub Fixture

**Feature Branch**: `031-extract-registration-fixture`
**Created**: 2026-05-15
**Status**: Draft
**Input**: User description: "Extract Registration Fixture — Consolidate the duplicated `makeStubSpawn()` helper across `src/tools/*/index.test.ts` files into a shared fixture so each new typed tool can import it rather than re-declare it."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — New typed tool inherits the registration stub via a one-line import (Priority: P1)

A maintainer adds the next typed tool (BI-032 or later) under `src/tools/<name>/`. The tool needs an `index.test.ts` file that exercises the descriptor, the stripped input schema, the help-pointer convention, the docs-file presence check, and the thin-handler logger-drift lock — the same five-to-seven cases every typed tool already ships. Today the maintainer copy-pastes the 16-to-22-line `makeStubSpawn()` body from a sibling tool's `index.test.ts`. With this feature shipped, the maintainer instead writes one import line and reuses the shared fixture. The new test file is shorter, the duplication does not grow, and a future fix to the stub propagates automatically.

**Why this priority**: The duplication compounds with every new typed tool. The project has shipped 16 such tools and the cadence is roughly one tool per BI. Each tool currently pays a ~750-byte tax and risks introducing yet another trivial divergence. Extracting the fixture is the smallest investment that stops the bleed.

**Independent Test**: Add a throwaway `src/tools/<sentinel>/index.test.ts` that imports the shared fixture, instantiates a stub spawn function, and verifies a happy-path registration flow. If the import resolves, the stub builds, and the test passes under `npm test`, Story 1 is satisfied. The throwaway can be added and removed in a single commit without touching the 16 existing callers.

**Acceptance Scenarios**:

1. **Given** a new `index.test.ts` file under `src/tools/<name>/`, **When** it imports `makeRegistrationStubSpawn` from the shared fixture and invokes it with no arguments, **Then** the returned function satisfies the `SpawnLike` contract used by `cli-adapter/_dispatch.ts` and produces a child process that emits `exit 0` with empty stdout and empty stderr.
2. **Given** the shared fixture is invoked with `{ stdout: "...", exitCode: N }`, **When** the consuming test awaits the spawn lifecycle, **Then** stdout receives the provided buffer and the child emits `exit` with code `N`.
3. **Given** every typed tool's `index.test.ts` file in the repository, **When** `npm test` runs, **Then** every previously-passing registration test continues to pass with no behavioural change in the vitest report — test count, names, and outcomes are byte-identical pre vs post.

---

### User Story 2 — Stub-quirk fix lands once and benefits every caller (Priority: P2)

A maintainer discovers that the stub needs an adjustment — for example, the child must flush an empty stdout chunk before `exit` to suppress an unrelated vitest warning, or the `child.kill()` return value must change to satisfy a new lint rule. Today the fix has to be applied 16 times across the codebase, each application risking a transcription error or a missed file. With the shared fixture in place, the maintainer edits one file. Every consuming `index.test.ts` picks up the fix on the next test run with no further edits.

**Why this priority**: This is the standing-wave benefit of consolidation. It is real but only materialises when a stub-level fix arises, which is rare. The primary value is captured by Story 1.

**Independent Test**: Edit the shared fixture to change a structural detail (for example, change the `child.pid` literal or add a deterministic delay before `setImmediate`), run `npm test`, observe that every consuming test still passes without any edit to caller files, then revert.

**Acceptance Scenarios**:

1. **Given** a structural change to the shared fixture's child-process construction, **When** `npm test` runs, **Then** every consuming registration test exercises the new construction without any edit to caller files.

---

### Edge Cases

- **The `obsidian_exec` carve-out**: this tool's `index.test.ts` declares an extended `makeStubSpawn` that takes two additional fields (`stderr?: string` for separate stderr emission, `errorOnSpawn?: NodeJS.ErrnoException` for synchronous-throw simulation) and routes them through additional setImmediate logic. Folding those fields into the shared fixture would create a multi-flag options bag where most fields are unused by most callers, defeating the consolidation's clarity benefit. The carve-out is structural — `src/tools/obsidian_exec/index.test.ts` keeps its local `makeStubSpawn` declaration verbatim and does NOT import from the shared fixture.
- **Trivial value-only divergences in the existing 16 callers**: five of the sixteen callers currently declare a `child.pid` literal that differs from the `child.pid = 7` baseline — `tree`, `tag`, `properties` use `13`; `outline` uses `12`; `files` uses `11`. The literal is unused — no test in those five files references `pid` outside the stub body itself. The shared fixture unifies on a single literal (`7`) and the value-only divergences are absorbed without adding a `pid?: number` option. If a future caller genuinely needs a per-call pid, the options bag can grow at that point.
- **Future caller divergences**: a future typed tool may need a stub feature that the shared template does not provide. The rollback story is mechanical — that tool's `index.test.ts` declares a local `makeStubSpawn` (the pre-extraction status quo) instead of importing the shared fixture. No options bag growth, no shared-fixture edit, no ripple to the other 15 callers.
- **Build-system reach**: the shared fixture must live at a path that is both compiled by `tsc` and discoverable by the vitest `include` glob. The repository's `tsconfig.json` pins `rootDir: "src"` and `include: ["src/**/*.ts"]`, and `vitest.config.ts` pins `test.include: ["src/**/*.test.ts"]` with `coverage.include: ["src/**"]`. A fixture under a top-level `tests/` directory would sit outside `rootDir` and would not be reachable from the type-checked source. The fixture therefore lives under `src/`; the exact path within `src/` is deferred to plan stage.
- **Coverage gate interaction**: the shared fixture is test-supporting code, not product code. Its inclusion in coverage measurement could perturb the `statements: 91.3` floor pinned in `vitest.config.ts`. Coverage interaction is verified at plan / implement stage — zero-net-change is the target.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST expose exactly one shared module that exports a function named `makeRegistrationStubSpawn` returning a `SpawnLike` (the existing type defined in `src/cli-adapter/_dispatch.ts`).
- **FR-002**: The exported function MUST accept an optional options argument with the same shape currently used by the 11 byte-identical callers — `{ stdout?: string; exitCode?: number }` — and no additional fields. The shape of this options bag stands as the contract; future growth requires a deliberate change to this spec.
- **FR-003**: The exported function MUST produce a child process whose runtime behaviour is byte-equivalent to the 788-byte template currently duplicated across the 11 byte-identical callers — same construction sequence (`EventEmitter`, two empty `Readable` streams, `child.pid` literal, `child.kill` thunk), same `setImmediate` lifecycle (stdout write if `opts.stdout` provided, push null on stdout, push null on stderr, emit exit with `opts.exitCode ?? 0`), same return type cast.
- **FR-004**: The shared module MUST live at a path that is inside `tsconfig.json`'s `rootDir` AND is NOT matched by `vitest.config.ts`'s `test.include` glob (so the file itself is not executed as a test) AND does not push the `statements` coverage metric below the pinned `91.3` floor. The specific path within `src/` is a plan-stage decision; the constraints above are spec-level invariants.
- **FR-005**: Sixteen `src/tools/*/index.test.ts` files MUST be edited to remove their local `makeStubSpawn` function declaration and replace it with an import of the shared module's export. The exact sixteen files are: `delete`, `files`, `find_by_property`, `links`, `move`, `outline`, `properties`, `read`, `read_heading`, `read_property`, `rename`, `set_property`, `smart_connections_query`, `smart_connections_similar`, `tag`, `tree`. The import MAY rename the export to `makeStubSpawn` at the import site (preserving call-site identifiers) or use the export name verbatim (call-site identifier change). The choice is per-file and is a plan-stage decision.
- **FR-006**: The `src/tools/obsidian_exec/index.test.ts` file MUST retain its local extended `makeStubSpawn` declaration unchanged. This file MUST NOT import from the shared fixture module.
- **FR-007**: After the consolidation, the full `npm test` run MUST produce the same number of test files, the same number of test cases, the same case names, and the same pass / fail counts as before the consolidation. The vitest report's test inventory is the contract; the only permitted differences are byte-level diffs inside the affected files' module-private setup region.
- **FR-008**: The `npm run baseline:write` command and the `src/tools/_register-baseline.test.ts` durable test MUST continue to pass without baseline regeneration. This refactor does not touch tool descriptors, schemas, or registration order, so the registry-stability fingerprint set is byte-stable.
- **FR-009**: The shared module MUST carry the project's `// Original — no upstream.` source-file attribution header per Constitution Principle V.
- **FR-010**: The shared module MUST NOT introduce any new dependency on `src/tools/` from `src/cli-adapter/` or vice-versa beyond the existing `SpawnLike` type import that every current `makeStubSpawn` caller already performs.

### Out-of-Scope Surfaces (explicitly excluded)

- The six `handler.test.ts` stubs across `delete`, `move`, `read`, `rename` (and the two `cli-adapter` test files that also match the grep) are NOT consolidated. Each of those stubs is customised per caller — different fields from a multi-flag options bag, different lifecycle sequences, different injection points — and extracting a shared helper would produce a union-of-needs surface that ripples to callers that did not want the change. Family A is documented as out-of-scope and is not revisited under this feature; revisiting requires a separate BI with its own spec.
- The `obsidian_exec/index.test.ts` stub is NOT consolidated (see FR-006).
- The `src/cli-adapter/{cli-adapter,invoke-bounded-cli,_dispatch}.test.ts` files use stub-spawn shapes bound to the adapter's internal contract, not the registration contract this fixture serves. They are NOT consolidated.
- No tool descriptor, schema, handler, or registration surface is touched. No production-code file (anything not ending `.test.ts`) is modified. The package version bump and CHANGELOG entry decision is deferred to plan stage.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The number of `src/tools/*/index.test.ts` files containing a `function makeStubSpawn(` declaration drops from 17 to 1 — the surviving `obsidian_exec/index.test.ts` file.
- **SC-002**: The number of byte-distinct `makeStubSpawn` function bodies in the repository drops from 5 (788-byte e92c..., 789-byte ae069..., 789-byte f6753..., 789-byte 78417..., 971-byte edacb...) to 2 — the shared fixture's body and `obsidian_exec`'s extended body. The "5 distinct bodies" figure reflects the actual current state at spec time, not the user-input pre-flight estimate of "10 identical + 5 trivial + 1 extended" which implied 4 distinct shapes.
- **SC-003**: `npm test` exit code is `0` after the refactor, with no change in total test count, test-file count, or per-file case count vs the pre-refactor baseline.
- **SC-004**: `npm run typecheck` exit code is `0` — every consuming `index.test.ts` file resolves the shared-module import under `tsconfig.json`'s `rootDir`, `module`, and `moduleResolution` settings.
- **SC-005**: The vitest coverage report's `statements` metric remains at or above the pinned `91.3` threshold from `vitest.config.ts`. No coverage regression.
- **SC-006**: Net source diff: one new file under `src/` (the shared fixture, expected to be roughly 800 bytes including the source-file header and the export declaration); sixteen modified `index.test.ts` files where each modification deletes the ~22-line local `makeStubSpawn` block and adds one import line. Total expected net reduction: roughly 12 KB of duplicated bytes traded for one ~800-byte shared file plus 16 import lines — approximately 85% reduction on the affected surface.
- **SC-007**: The `src/tools/_register-baseline.test.ts` durable test passes on the post-refactor codebase WITHOUT running `npm run baseline:write` between the pre- and post-refactor states. This locks the refactor's behaviour-preserving claim against the registry-stability machinery.
- **SC-008**: A reviewer can verify the refactor in one pass by reading the shared module (one file) and checking that every consuming `index.test.ts` file's diff shows exactly: deletion of the local function block, insertion of exactly one import line, no other edits.

## Assumptions

- The trivial value-only divergences in the five 789-byte callers are absorbed by unifying on `child.pid = 7` in the shared fixture. The pid literal is referenced nowhere in any test assertion — verified by `grep -n "pid" src/tools/{tree,tag,properties,outline,files}/index.test.ts`; every match is inside the stub body itself — so unification is safe. The shared fixture's options surface does NOT grow a `pid?: number` field for this consolidation.
- The shared fixture lives under `src/`, not under a new top-level `tests/` directory. The `tsconfig.json`'s `rootDir: "src"` constraint and the vitest `include: ["src/**/*.test.ts"]` glob make `src/` the only location that satisfies both type-checking and test-include reach. The exact path within `src/` is a plan-stage decision (candidate: `src/tools/_registration-stub.ts`, following the existing `_register.ts`, `_register-baseline.ts`, `_shared.ts` underscore-prefix shared-module convention).
- The user-input description's count of "15 non-`obsidian_exec` files" reflects a pre-flight estimate. Empirical inspection at spec time finds 16 consumable files (11 byte-identical + 5 trivially-divergent). FR-005 locks the corrected count.
- The user-input description's count of "10 byte-identical" reflects a pre-flight estimate. Empirical inspection finds 11 byte-identical bodies. SC-002 locks the corrected count.
- The user-input description's characterisation of trivial divergences as "whitespace, a parameter rename, an extra line" reflects a pre-flight estimate. Empirical inspection finds that all five trivial divergences differ from the base template in exactly one location: the `child.pid` integer literal. No whitespace differences, no parameter renames, no extra lines. The consolidation is therefore simpler than the user-input suggested — no new options-bag fields are needed for the 16 callers.
- The package version bump (currently `0.5.8`) and CHANGELOG entry shape are deferred to plan stage. This feature is internal test-infrastructure refactoring; the public surface is unchanged.
- No new ADR is needed. The shared-fixture extraction is mechanical refactoring well within existing test-infrastructure conventions (precedent: `src/tools/_eval-vault-closed-detection/` shared module from BI-027 / BI-029, `src/tools/_register-baseline.ts` shared module from BI-022).
- No Constitution amendment is needed. Principle II (co-located unit tests) is unchanged — the shared fixture is module-private support code consumed by co-located tests, not itself a test. Principle V (Original-no-upstream attribution) is satisfied by FR-009.
- The handler-layer `handler.test.ts` stubs across `delete`, `move`, `read`, `rename` remain genuinely customised and are NOT touched by this feature. Family A — the per-handler stub variants — is out-of-scope and is not revisited.
