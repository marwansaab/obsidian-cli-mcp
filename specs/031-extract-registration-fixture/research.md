# Phase 0 Research — Extract Registration Stub Fixture

**Branch**: `031-extract-registration-fixture` | **Date**: 2026-05-15
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Seven plan-stage decisions are recorded here. Each is presented in **Decision / Rationale / Alternatives Considered** format and is referenced from the plan's Phase 0 section.

---

## R1 — Shared fixture file path

**Decision**: The shared fixture lives at `src/tools/_registration-stub.ts`. The co-located unit test lives at `src/tools/_registration-stub.test.ts`. No subdirectory; no nested namespace.

**Rationale**:

1. **Constraint-fit (the constraints in FR-004)**:
   - Inside `tsconfig.json`'s `rootDir: "src"` and matched by `include: ["src/**/*.ts"]` — `tsc` will compile and typecheck it.
   - NOT matched by `vitest.config.ts`'s `test.include: ["src/**/*.test.ts"]` — `_registration-stub.ts` (no `.test.ts` suffix) is NOT a test file and is NOT executed as one. The co-located `_registration-stub.test.ts` IS matched and IS executed, fulfilling Principle II.
   - Matched by `coverage.include: ["src/**"]` but executed by every consuming test at runtime — the file's statements enter the coverage numerator AND denominator together (R5 analyses the net impact).
2. **Precedent**: The project already houses three `_`-prefix shared-support modules under `src/tools/`: `_register.ts` (registration entry point), `_register-baseline.ts` (registry-stability fingerprint helper, BI-022), and `_shared.ts` (cross-tool helper). All three follow the exact pattern this BI applies — single file under `src/tools/`, leading underscore, co-located `.test.ts`. Adopting the same shape costs zero cognitive load on reviewers familiar with the existing precedent.
3. **Discoverability**: A new typed tool's author, browsing `src/tools/`, sees the underscore-prefixed siblings of the per-tool directories and knows immediately that `_registration-stub.ts` is module-private support code rather than an MCP surface.
4. **Locality**: The fixture is consumed ONLY by `src/tools/*/index.test.ts`. Placing it one directory level above the consumers (in `src/tools/`, not in `src/`) keeps the consuming import path short and consistent: `../_registration-stub.js`.

**Alternatives considered**:

- **`tests/fixtures/registration-stub.ts`** (the user-input's named location). Rejected: outside `tsconfig.json`'s `rootDir: "src"`, so `tsc` would refuse to compile a test file that imports it under the current `rootDir`/`include` settings. Also outside `coverage.include`, which would mean the fixture's runtime executions are invisible to the coverage gate — an obscured surface. Adopting this path requires widening `rootDir` (constitutional risk because every other module is `src/`-anchored) AND adding the path to `tsconfig.json`'s `include` AND widening `coverage.include`. Three config edits to achieve what one `src/tools/_<name>.ts` placement achieves natively.
- **`src/tools/_test-fixtures/registration-stub.ts`** (subdirectory). Rejected: introduces a new subdirectory for a single file. The `_eval-vault-closed-detection/` subdirectory exists because that shared module has THREE source files (detector, registry-parser, index). The registration stub has one file; a wrapping directory adds path length without adding structure.
- **`src/_test-fixtures/registration-stub.ts`** (top-level under `src/`). Rejected: the fixture is consumed only by `src/tools/*/` callers. Hoisting it above `tools/` implies cross-cutting consumers that do not exist. The discoverability win belongs at the consumer level, not at the project root.

---

## R2 — Per-caller import shape

**Decision**: Every consuming `src/tools/<name>/index.test.ts` imports the fixture using the renamed-at-import-site pattern, preserving the existing `makeStubSpawn` call-site identifier verbatim:

```typescript
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";
```

**Rationale**:

1. **Diff minimality**: Every consuming file currently calls `makeStubSpawn(...)` at the descriptor-test and stripped-schema-test cases. Renaming the call-site to `makeRegistrationStubSpawn(...)` would touch every invocation across 16 files (typically 3-7 invocations per file = ~50-100 invocation edits). Renaming at the import site touches one line per file and leaves every invocation byte-stable.
2. **Reviewer load**: The git diff per file consists of (a) deletion of the 22-line local function block and (b) one new import line + a small set of now-unused-import cleanups (R3). Pattern is identical across all 16 files — easy to skim.
3. **Rollback latency**: If a future caller turns out to need a local quirk, the rollback inlines the local function and removes the import. Both operations are mechanical and confined to the single file.
4. **The export name itself**: `makeRegistrationStubSpawn` is more specific than `makeStubSpawn` and disambiguates from the handler-layer Family A stubs that are explicitly out of scope. Spec FR-001 locks the export name; this decision locks the import alias.

**Alternatives considered**:

- **Use the verbatim export name at call sites** (`makeRegistrationStubSpawn(...)`). Rejected: the diff explodes to ~50-100 invocation edits per consuming file, defeating SC-008's "one-pass reviewer verification" goal.
- **Re-export the alias from a thin wrapper** (e.g. `import { makeStubSpawn } from "../_registration-stub-alias.js"`). Rejected: adds a second file whose only purpose is the rename. The TypeScript `as`-at-import-site clause does the same job inline.

---

## R3 — Now-unused-import cleanup per caller

**Decision**: After deleting the local `makeStubSpawn` function block, each consuming file MUST also remove the four-or-five node-built-in imports that the local stub previously required. The `tsconfig.json` flags `noUnusedLocals: true` and `noUnusedParameters: true` make this mandatory (not optional) — leaving the imports would fail `npm run typecheck`.

The exact per-file edit set is:

| Import to remove | Source module | Reason |
|------------------|---------------|--------|
| `type SpawnOptions` | `node:child_process` | Used only as the stub's inner function parameter annotation |
| `EventEmitter` | `node:events` | Used only to construct the child within the stub body |
| `Readable` (the type **and** the value) | `node:stream` | Used only inside the stub body to construct child.stdout / child.stderr; **trim** the import — `Writable` stays because it is used by the `silentLogger` factory |
| `type SpawnLike` | `../../cli-adapter/_dispatch.js` | Used only as the stub's outer return type — the fixture export carries the type internally; **trim** the import — `__resetInFlightRegistryForTests` (the other named import from this source) stays because it is used by `beforeEach`/`afterEach` |

After cleanup, each consuming file has exactly ONE new import line (the fixture) and FOUR import lines either deleted or trimmed. The deleted function block is the ~22-line `function makeStubSpawn(opts: ...) { ... }` declaration.

**Rationale**:

1. **Forced by `noUnusedLocals: true`**: skipping the cleanup is not optional — `tsc` would fail and the constitutional `npm run typecheck` gate (point 2 of Development Workflow) would not pass.
2. **The user-input's "one-line import" framing**: the user characterised the replacement as "a one-line import" — that is true for the line being added (the fixture import), but it omits the cleanup the local function's removal forces. This research note documents the corrected accounting so reviewers verifying SC-008 understand the per-file diff shape.
3. **Trim vs delete decision**: the `Readable` import from `node:stream` is trimmed (not deleted) because `Writable` from the same module is still used by `silentLogger`. The `__resetInFlightRegistryForTests` import from `_dispatch.js` is preserved because the `beforeEach`/`afterEach` hooks still need it. Both trim operations leave the import line shape intact (`import { X } from "..."`); only the named members change.

**Alternatives considered**:

- **Leave the unused imports and disable `noUnusedLocals` for these files**: rejected; loosening a constitutional `tsc` gate to make a refactor easier is a Complexity Tracking entry the Constitution Check does not allow without justification. The cleanup is mechanical and the diff stays small.
- **Move the unused imports into the new fixture file**: they already exist in the new fixture file (the fixture body uses `EventEmitter`, `Readable`, `SpawnOptions`, `SpawnLike` for its own implementation). No move needed — they live in the fixture's module scope, not in callers' module scopes.

---

## R4 — Fixture options shape

**Decision**: The fixture's options bag is exactly `{ stdout?: string; exitCode?: number }` with no additional fields. The `child.pid` literal is fixed at `7` inside the fixture body. No `pid?: number`, `stderr?: string`, or `errorOnSpawn?: NodeJS.ErrnoException` field is added.

**Rationale**:

1. **Empirical minimum**: 11 of the 16 consuming files use the options bag with exactly this shape today. The other 5 (`tree`, `tag`, `properties` use pid=13; `outline` uses pid=12; `files` uses pid=11) differ ONLY in the `child.pid` integer literal, and no test in those 5 files references `pid` outside the stub body itself. Verified at spec time by `grep -n "pid" src/tools/{tree,tag,properties,outline,files}/index.test.ts` — every match is inside the stub body.
2. **Carve-out preservation**: the extended `stderr?: string` and `errorOnSpawn?: NodeJS.ErrnoException` fields belong to `obsidian_exec`'s local declaration only (FR-006). Adding them to the shared fixture would create a multi-flag options bag where most fields are unused by most callers — exactly the anti-pattern the user-input cited when motivating the `obsidian_exec` carve-out.
3. **YAGNI for `pid?: number`**: a per-caller `pid` field would let the five 789-byte variants preserve their distinct pids, but the literals are unused. Adding the option to honour values nothing reads is dead surface.

**Alternatives considered**:

- **Add `pid?: number` to absorb the five trivial divergences**: rejected; the literals are unused. Adding the field to "match the user-input's pre-flight estimate" would propagate a phantom requirement.
- **Add `stderr?: string` because `obsidian_exec` has it**: rejected; `obsidian_exec` keeps its local declaration (FR-006). Adding the field to the shared fixture creates a discoverability hazard — a future typed tool author would wire up `stderr` and find that the existing 16 callers do not exercise it.

---

## R5 — Coverage-floor impact analysis

**Decision**: The new module is expected to be **statements-positive or statements-neutral** against the `statements: 91.3` floor pinned in `vitest.config.ts`. No threshold edit is anticipated. The post-implement step verifies the actual number via `npx vitest run --coverage` and reports it as a quality-gate result.

**Rationale**:

1. **Numerator and denominator move together**: the shared fixture's statements (~15-20 statements covering the EventEmitter / Readable construction + setImmediate lifecycle) enter the coverage **denominator** because `coverage.include: ["src/**"]` covers `src/tools/_registration-stub.ts`. They ALSO enter the coverage **numerator** because every consuming `index.test.ts` invokes the fixture at runtime — the stub is exercised by every descriptor test in every typed tool. The expected net impact is flat-to-positive.
2. **Existing precedent**: the `_register-baseline.ts` shared helper went through the same coverage calculus when it shipped under BI-022 (zero-net-change to the floor, verified empirically). The shape of this BI's coverage impact is identical.
3. **Co-located test contribution**: the new `_registration-stub.test.ts` (~5-7 cases per R6) ALSO contributes runtime invocations of the fixture, increasing the numerator further.

**Alternatives considered**:

- **Add `_registration-stub.ts` to `coverage.exclude` to sidestep the question entirely**: rejected; the constitution forbids adding `branches`/`functions`/`lines`/`perFile` keys to `test.coverage.thresholds` without an amendment, AND a coverage-exclusion edit to make a refactor easier is the kind of "obscured surface" reviewers should flag. Better to verify empirically that the metric stays at-or-above the floor.

---

## R6 — Co-located `_registration-stub.test.ts` shape

**Decision**: A co-located unit test ships in the same change as the fixture, with 5-7 cases mirroring the `_register-baseline.test.ts` shape:

1. **Happy path — no opts**: invoking `makeRegistrationStubSpawn()` returns a `SpawnLike` whose child emits `exit 0` with empty stdout and empty stderr.
2. **`opts.stdout` propagates**: invoking `makeRegistrationStubSpawn({ stdout: "hello" })` results in a child whose stdout receives the buffer `"hello"` before the `null` push.
3. **`opts.exitCode` propagates**: invoking `makeRegistrationStubSpawn({ exitCode: 2 })` results in a child that emits `exit 2`.
4. **Both opts together**: invoking `makeRegistrationStubSpawn({ stdout: "x", exitCode: 1 })` exercises the full pipeline.
5. **`SpawnLike` contract shape**: the returned function accepts a `(binary, argv, options)` triple and returns a child with `.stdout`, `.stderr`, `.pid`, and `.kill`.
6. **setImmediate ordering**: stdout push precedes null push; null push precedes exit emission (verified by attaching listeners and recording the sequence). Documents the invariant that the eight `*Buffer` flushes complete before `exit` fires.
7. **Default `exitCode` is 0** when `opts.exitCode` is omitted.

**Rationale**:

1. **Principle II compliance**: Principle II is non-negotiable. The shared fixture is internal test infrastructure, but the project's precedent (`_register-baseline.ts` + `_register-baseline.test.ts`) treats internal helpers the same way it treats MCP surfaces — co-located test coverage documents the contract.
2. **Future-fix safety**: case 6 (setImmediate ordering) locks the invariant that downstream tests rely on without realising they rely on it. If a future change to the fixture reorders the lifecycle, this test catches it before the 16 consuming tests do.
3. **Cohort with `_register-baseline.test.ts`**: that file ships 5 cases with the same intent (cover the canonicaliser, the fingerprint hash, and the baseline-read contract). Mirroring its size and structure costs zero design effort.

**Alternatives considered**:

- **No co-located test, rely on the 16 consumers to exercise the fixture indirectly**: rejected; Principle II's "every externally callable surface ... MUST ship with at least one happy-path test AND at least one failure-or-boundary test" applies by analogy even though the surface is internal. The precedent set by `_register-baseline.test.ts` is to ship co-located tests for internal helpers. Diverging from that precedent is a discoverability hazard.

---

## R7 — `obsidian_exec` carve-out treatment

**Decision**: `src/tools/obsidian_exec/index.test.ts` retains its local `makeStubSpawn` declaration verbatim — no edit. The local declaration's two extended fields (`stderr?: string`, `errorOnSpawn?: NodeJS.ErrnoException`) remain in place. No partial extraction is attempted (i.e. the local declaration does NOT call into the shared fixture for its base behaviour). The file is excluded from FR-005's 16-file list.

**Rationale**:

1. **FR-006 enforcement**: the spec locks this carve-out at the requirements level. The plan implements it as a deliberate no-op.
2. **Multi-flag-bag anti-pattern**: extending the shared fixture's options bag to absorb `stderr` and `errorOnSpawn` would make those fields available to all 16 other callers, none of which exercise them. Future typed tool authors would discover the fields, wire them up speculatively, and the dead surface would compound.
3. **Partial-extraction temptation**: one could imagine refactoring the local declaration to delegate to the shared fixture for the common 788-byte template and add a thin wrapper for the extensions. Rejected: the extensions touch the setImmediate sequence (stderr push between stdout-null-push and exit-emit) AND the synchronous spawn-throw path. Threading the extensions through a base call would require either (a) callbacks to inject the extra setImmediate work or (b) returning a partially-constructed child from the base for the wrapper to extend — both of which add complexity that beats the duplication.
4. **Reviewer signal**: a clean carve-out with `obsidian_exec` keeping its local declaration is easier to spot in code review than a partially-refactored version. The reviewer sees 16 files importing the fixture and one file declaring locally — the asymmetry IS the documentation.

**Alternatives considered**:

- **Refactor obsidian_exec to call into the shared fixture with a wrapper**: rejected as above.
- **Move `obsidian_exec`'s extended stub into the shared fixture as a second export (e.g. `makeExtendedStubSpawn`)**: rejected; the second export would be consumed by exactly one file, defeating the point of extraction. The duplication of the base template inside the obsidian_exec file is acceptable because (a) it is a localised one-file decision and (b) the 971-byte body's specific extensions are byte-level coupled to obsidian_exec's test fixtures.

---

## Summary table

| ID | Decision | Status |
|----|----------|--------|
| R1 | Fixture path: `src/tools/_registration-stub.ts` | Locked |
| R2 | Per-caller import shape: rename-at-import-site to preserve `makeStubSpawn` identifier | Locked |
| R3 | Per-caller now-unused-import cleanup: remove `SpawnOptions`, `EventEmitter`, trim `Readable` from `node:stream`, trim `SpawnLike` from `_dispatch.js` | Locked |
| R4 | Options shape: `{ stdout?: string; exitCode?: number }` only; `child.pid = 7` fixed | Locked |
| R5 | Coverage impact: flat-to-positive on `statements: 91.3` floor; empirical verification post-implement | Locked |
| R6 | Co-located test: ~5-7 cases mirroring `_register-baseline.test.ts` shape | Locked |
| R7 | `obsidian_exec` carve-out: local declaration retained verbatim; no partial extraction | Locked |

No NEEDS CLARIFICATION items remain. Phase 0 closed.
