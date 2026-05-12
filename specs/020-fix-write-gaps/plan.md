# Implementation Plan: Fix Write Gaps — Short-Form Resolution + FILE_EXISTS Diagnostic Enrichment

**Branch**: `020-fix-write-gaps` | **Date**: 2026-05-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [/specs/020-fix-write-gaps/spec.md](./spec.md)

## Summary

Two narrow handler-layer corrections to the `write_note` operation against the 016-reliable-writer surface. Both are P1 contract-restoration fixes caught during acceptance testing of the 016 overhaul; both close gaps where the direct-fs rewrite inadvertently chipped contract details downstream automation depends on.

**Fix 1 — short-form-name target resolution (Story 1, FR-001 / FR-001a / FR-002 / FR-003)**: when `input.file` matches the canonical short-form shape (no `/` or `\` folder separator AND does not end in `.md`), the handler resolves the target to `<input.file>.md` at the vault root and the response's `path` field reports the resolved value. Any other `input.file` shape passes through verbatim. The `path`-based identifier form (`input.path`) is unchanged — already verbatim today.

**Fix 2 — FILE_EXISTS `details.errno` enrichment (Story 2, FR-007 / FR-008 / FR-009 / FR-010)**: when the `wx`-flag write rejects with EEXIST on the hot path, the handler adds `errno: "EEXIST"` to the existing `details` object alongside the existing `path` and `vault` fields (additive — not a replacement). Final shipping shape: `details: { errno: "EEXIST", path: <caller relPath>, vault: <vault name|null> }`. Field-name parity on `details.errno` (the value callers branch on) is the cross-failure-type contract; broader `details`-object shape may differ per failure type.

**Technical approach** (locked at Phase 0 / [research.md](./research.md)):

- **Touch surface**: ONE source file (`src/tools/write_note/handler.ts`), ONE co-located test file (`src/tools/write_note/handler.test.ts`), ONE doc file (`docs/tools/write_note.md`). No schema changes (Out of scope per FR-012). No new modules. No new error codes (FR-011). No new ADRs. No ADR amendments. No changes to other tools (FR-014). No CHANGELOG-blocking version-bump architecture decisions are pre-empted at plan stage — the patch version bump is a /speckit-tasks decision per the project's release-task convention.
- **Short-form rule placement (R1)**: inline in `handler.ts` at the `relPath` assignment site (current line 149). A new local helper `resolveSpecificModePath(input): string` encapsulates the FR-001 / FR-001a rule for testability. The function is ≤ 8 LOC; lives in the same module per Constitution Principle I (single-responsibility module — target resolution is part of the handler's responsibility, not a peer concern worth a separate module).
- **Canonical short-form predicate (R2)**: `isCanonicalShortForm(file) = !file.includes('/') && !file.includes('\\') && !file.endsWith('.md')`. Three conditions, all literal-character checks. Captures Q2 Option A's literal rule from the spec's clarifications session.
- **Path-safety check sequencing (R14)**: the short-form rule fires at the `relPath` assignment step — BEFORE `checkCanonicalPath` runs. So the canonical-root check validates the RESOLVED path (`<file>.md` for canonical short-form inputs), not the raw input. This is correct — path-safety should validate what's actually written, not what was passed in.
- **FILE_EXISTS details enrichment (R3)**: ONE call site at `handler.ts:207-213`. Replace `details: { path: relPath, vault: input.vault ?? null }` with `details: { errno: "EEXIST", path: relPath, vault: input.vault ?? null }`. Three-character key + value addition.
- **`mapFsError` asymmetry preserved (R4)**: the separate `mapFsError` path (`handler.ts:79-87`) that maps unexpected EEXIST during `mkdir` or `rename` to FILE_EXISTS continues to emit `details: { errno: "EEXIST" }` only — the existing shape. This path fires rarely (mkdir or rename racing against an outside actor); the hot path is the `wx`-flag collision path that the user's spec targets. Documented as a known asymmetry; reconciling would require adding `path` and `vault` to the generic `mapFsError` signature, which is wider-scope than the contract-restoration. Out of scope for this BI; tracked as a follow-up consideration.
- **Active-mode interaction (R8)**: active mode never enters the short-form rule (schema forbids `input.file` in active mode per the existing `applyTargetModeRefinement` rules). The active-mode path resolves through the focused-file eval result (`parsed.path`) and uses it verbatim. NO change to active-mode handler logic.
- **FR-001a passthrough for non-canonical `file`**: when `input.file` contains a folder separator OR ends in `.md`, the handler treats `input.file` like `input.path` — uses it verbatim. The handler's existing `(input.path ?? input.file)` collapse becomes more precise: `path` if supplied, otherwise apply the FR-001 / FR-001a rule to `file`.
- **Response `path` field (FR-003)**: returned as the relative path used for the on-disk write. For canonical short-form inputs this is `<input.file>.md`; for FR-001a passthrough on `file`, this is `input.file` verbatim; for `path` inputs, this is `input.path` verbatim. The existing handler already returns `relPath` in the response (line 253: `return { created, path: relPath }`); no structural change.
- **Test expectations (R9)**: existing handler test cases for the short-form `file` input shape MUST be updated to expect the new resolved behaviour. New test cases cover (a) canonical short-form happy path, (b) internal-period preservation (`version_1.2.3` → `version_1.2.3.md`), (c) FR-001a passthrough on `file: "Notes.md"`, (d) FR-001a passthrough on `file: "Folder/Note"`, (e) FR-001a passthrough on `file: "Folder/Note.md"`, (f) `path: "Subfolder/Note.md"` verbatim (regression guard), (g) hot-path FILE_EXISTS rejection carries the additive details shape, (h) regression guard that mapFsError EEXIST path keeps its `{ errno }`-only shape.
- **Help update (FR-018)**: `docs/tools/write_note.md` gains two short callouts — (a) canonical short-form `file` shape definition + `<file>.md` worked example + non-canonical passthrough note; (b) FILE_EXISTS rejection shape including `details.errno: "EEXIST"` and the additive enrichment note. Both callouts under the existing input/error-roster sections; no new section structure.
- **Logger surface (R7)**: unchanged. FILE_EXISTS does NOT emit per-call logger events per 016-FR-029; the new `errno` field does not change that. PATH_ESCAPES_VAULT continues to emit `logger.pathEscapeAttempt`. No new logger methods, no `ErrorCode` union amendments.

## Technical Context

**Language/Version**: TypeScript (strict mode, `tsc --noEmit` clean) — pinned in [tsconfig.json](../../tsconfig.json), runtime Node.js >= 22.11 per `engines.node` in [package.json](../../package.json).
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP transport, unchanged), `zod` (validation, unchanged — schema is not amended). Node-builtin `fs/promises` for the existing write mechanism (unchanged per FR-017).
**Storage**: N/A — the tool is stateless. The fix touches in-memory string handling in the handler.
**Testing**: vitest with `@vitest/coverage-v8`. Co-located `*.test.ts` per module. The aggregate statements coverage threshold floor is set in [vitest.config.ts](../../vitest.config.ts). Tests inject `deps.spawnFn` per the existing test-seam convention; no real `obsidian` binary executions in CI. Updated and new handler tests use `nodeFs.writeFile` mocking and `nodeFs.realpath` mocking via dependency injection per the existing 016 handler-test pattern.
**Target Platform**: cross-platform Node.js MCP server (Windows / macOS / Linux). Per the 017-cross-platform-support resolver chain. The short-form rule's separator check covers both `/` (POSIX) and `\` (Windows) since `safePathField` accepts paths with either separator.
**Project Type**: MCP server. This BI does NOT add a typed tool — it patches the existing `write_note` typed tool's handler. The registered-tool list at [src/server.ts](../../src/server.ts) is unchanged.
**Performance Goals**: per-call latency unchanged from 016. The short-form rule adds three constant-time string checks (≤ 1 µs). The FILE_EXISTS details enrichment adds one field assignment.
**Constraints**:
- Top-level error code roster FROZEN (FR-011). No new codes; no rename / retire.
- Input contract FROZEN (FR-012). No schema changes; no new parameters; no per-mode rule changes.
- Success response shape FROZEN (FR-013). `{ created: boolean, path: string }` is preserved; only the `path` value-shape changes for canonical short-form inputs.
- Other tools' surfaces FROZEN (FR-014). Zero diffs against `read_note` / `read_property` / `read_heading` / `find_by_property` / `delete_note` / `obsidian_exec` / `help` / `write_property` / `list_files`.
- Retired parameters STAY RETIRED (FR-015 / FR-016). No `template` restoration; no silent-auto-rename restoration.
- Write mechanism UNCHANGED (FR-017). Temp-file-then-rename atomic write (016 FR-008), canonical-root path-safety check (016 FR-014), lazy vault-registry probe (016 FR-012), post-write `metadataCache` invalidation (016 FR-011) all preserved verbatim. The `mapFsError` function preserved verbatim. The `wx`-flag collision detection preserved.
- 008-refactor surface FROZEN — `dispatchCli`, `invokeCli`, `invokeBoundedCli`, the in-flight registry, the four-priority error classification, the `obsidian_exec` argv-assembly contract, the `assertToolDocsExist` aggregator, the 011-R5 unknown-vault response-inspection clause are all frozen.
- 017-cross-platform-support binary-resolver FROZEN.
- `applyTargetModeRefinement` primitive FROZEN — the schema's target-mode discriminator and refinement is unchanged.
**Scale/Scope**: ~10 LOC of source-code edit in `src/tools/write_note/handler.ts` (~8 LOC for the `resolveSpecificModePath` helper + 2 LOC for the FILE_EXISTS details additive enrichment). ~80 LOC of new and updated test cases in `src/tools/write_note/handler.test.ts` covering the eight new / changed scenarios listed above. ~25 LOC of doc updates in `docs/tools/write_note.md`. ZERO LOC change in schema, registration, error catalogue, ADRs, other tools, or any peer module.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Evidence |
|---|---|---|
| **I. Modular Code Organization** | ✅ PASS | The fix lands inside the existing `src/tools/write_note/` per-surface module, preserving the `{schema, handler, index}.ts` layout. The new `resolveSpecificModePath` helper is local to `handler.ts` — target resolution is part of the handler's responsibility (it already computes `relPath` from `input.path ?? input.file`); extracting it to its own module would be premature abstraction for ≤ 8 LOC. Downward-flow chain preserved: `index.ts` → `handler.ts` → `cli-adapter` / `node:fs`. No new imports, no upward or cyclic dependencies. |
| **II. Public Surface Test Coverage** | ✅ PASS | `write_note` is the public MCP tool surface being modified. Per Constitution II, modifications to a public surface MUST ship with happy-path AND failure-or-boundary tests in the same change. The plan adds (a) canonical short-form happy path (Story 1 AC#1), (b) internal-period preservation (Story 1 AC#5), (c) three FR-001a passthrough cases on `file` (Story 1 AC#6, AC#7 + extension-only edge), (d) `path`-form verbatim regression guard (Story 1 AC#4), (e) FILE_EXISTS hot-path additive details (Story 2 AC#1), (f) `mapFsError` regression guard (preserves `{ errno }`-only shape), (g) overwrite-true on existing → success with no `details.errno` (Story 2 AC#4). Eight new / updated cases — happy-path AND boundary-path coverage in the same change. The post-010 consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) auto-covers `write_note`'s presence; no registration-test edits required (schema is unchanged). |
| **III. Boundary Input Validation with Zod** | ✅ PASS | The schema at [src/tools/write_note/schema.ts](../../src/tools/write_note/schema.ts) is UNCHANGED. The fix lives in the handler, not the schema. The zod schema continues to be the single source of truth for the input shape. The output schema (`{ created, path }.strict()`) is unchanged. No new types, no hand-rolled type declarations. The `resolveSpecificModePath` helper's TypeScript signature uses the existing `z.infer<typeof writeNoteInputSchema>` indirectly via the handler's parameter type. |
| **IV. Explicit Upstream Error Propagation** | ✅ PASS | Zero new error codes — verified. The FILE_EXISTS code is unchanged; the enrichment is additive to its `details` payload. The `UpstreamError` class shape is unchanged. The cli-adapter's four-priority error classifier is untouched. The 011-R5 unknown-vault response-inspection clause is untouched. The `logger.pathEscapeAttempt` typed event is untouched. The PATH_ESCAPES_VAULT / FS_WRITE_FAILED / ERR_NO_ACTIVE_FILE codes are untouched. No `catch + return null/empty/default` patterns introduced. |
| **V. Attribution & Layered Composition Transparency** | ✅ PASS | No new source files are created. The edited file `src/tools/write_note/handler.ts` already carries the `// Original — no upstream.` header (verified during plan). The new `resolveSpecificModePath` helper inherits the file's existing header; no per-helper header is required (the convention is per-file, not per-function). The doc update at `docs/tools/write_note.md` is exempt per [005-help-tool](../005-help-tool/spec.md) FR-019. README's Attributions section is unchanged (no new lifted code). |

**Coverage gate**: aggregate statements floor is set in [vitest.config.ts](../../vitest.config.ts). The handler edit is a tiny diff; the eight new / updated test cases provide near-100% coverage of the edited code paths, so the aggregate either stays flat or ratchets up. No coverage drop expected; final figure verified in the post-implement quality gate.

**Constitution Compliance checklist** (for the eventual PR): all five principles expected to evaluate as Y. No deviations needed; no Complexity Tracking entries required.

**Plan-stage spec amendments**: NONE. The two clarifications integrated during `/speckit-clarify` (Q1 additive details shape, Q2 literal short-form rule) closed both ambiguities at spec stage. No further amendments needed at plan stage.

## Project Structure

### Documentation (this feature)

```text
specs/020-fix-write-gaps/
├── plan.md              # This file
├── research.md          # Phase 0 output — R1..R15 design decisions + verification of the ground-truth touch surface against the current handler / schema source
├── data-model.md        # Phase 1 output — short-form predicate truth table, resolution flowchart, FILE_EXISTS details shape transition (before / after), per-FR test inventory (8 cases)
├── quickstart.md        # Phase 1 output — verification scenarios (S-1..S-11) mapped 1:1 to SC-001..SC-011
├── contracts/
│   └── write-note-handler-delta.contract.md  # Handler delta contract: what changes, what stays the same, the resolveSpecificModePath helper signature, the FILE_EXISTS details shape transition, the FR-001a passthrough rule, the mapFsError preserved-asymmetry note
├── checklists/
│   └── requirements.md  # Spec quality checklist (filled at /speckit-specify time + re-validated post-/speckit-clarify)
└── tasks.md             # Phase 2 output (created by /speckit-tasks, NOT by this command)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── write_note/                                  # EDITED per-surface module — Constitution I preserved
│   │   ├── schema.ts                                # FROZEN per FR-012 (no input contract changes)
│   │   ├── schema.test.ts                           # FROZEN (no schema changes → no schema-test changes)
│   │   ├── handler.ts                               # EDITED — +~8 LOC for resolveSpecificModePath helper inline; +1 LOC for FILE_EXISTS details errno key
│   │   ├── handler.test.ts                          # EDITED — +~80 LOC for 8 new / updated test cases per FR-022's symmetric coverage rule
│   │   ├── index.ts                                 # FROZEN
│   │   └── index.test.ts                            # FROZEN (no descriptor changes)
│   ├── _register.ts                                 # FROZEN
│   ├── _register.test.ts                            # FROZEN (drift detector's it.each registry walk auto-covers write_note — no list change)
│   ├── _shared.ts                                   # FROZEN
│   ├── help/                                        # FROZEN
│   ├── obsidian_exec/                               # FROZEN (FR-014)
│   ├── read_note/                                   # FROZEN (FR-014)
│   ├── delete_note/                                 # FROZEN (FR-014)
│   ├── read_property/                               # FROZEN (FR-014)
│   ├── find_by_property/                            # FROZEN (FR-014)
│   ├── read_heading/                                # FROZEN (FR-014)
│   ├── write_property/                              # FROZEN (FR-014)
│   └── list_files/                                  # FROZEN (FR-014)
├── server.ts                                        # FROZEN (no registration changes — write_note is already registered)
├── server.test.ts                                   # FROZEN (registry-consistency test auto-covers write_note — no list change)
├── cli-adapter/                                     # FROZEN (008-refactor surface + 011-R5 unknown-vault inspection clause)
├── binary-resolver/                                 # FROZEN (017-cross-platform-support surface)
├── target-mode/                                     # FROZEN (FR-012 / applyTargetModeRefinement primitive untouched)
├── vault-registry/                                  # FROZEN (016 FR-012)
├── path-safety/                                     # FROZEN (016 FR-013 / FR-014 — short-form rule fires BEFORE canonical check, so safety validates resolved path)
├── help/                                            # FROZEN
├── errors.ts                                        # FROZEN (no new codes per FR-011)
├── logger.ts                                        # FROZEN (no new events per R7)
└── queue.ts                                         # FROZEN

docs/tools/
├── write_note.md                                    # EDITED — +~25 LOC across two callouts: canonical short-form shape + worked example + non-canonical passthrough note; FILE_EXISTS rejection shape with details.errno: "EEXIST" + additive enrichment note
├── index.md                                         # FROZEN (no new tool registered)
└── (all other tool docs)                            # FROZEN (FR-014)

CHANGELOG.md                                         # +1 entry under "Unreleased" or the next patch version (release-task decision at /speckit-tasks time)
package.json                                         # Possibly +1 line for version bump (patch — purely additive surface fix); release-task decision
CLAUDE.md                                            # Plan-pointer updated by Phase 1 step 3 to reference this plan
```

**Structure Decision**: ZERO new files. ZERO new modules. ALL changes land inside the existing `src/tools/write_note/` per-surface module already established by 011-write-note and rewritten by 016-reliable-writer. The fix is purely a handler-layer patch under Constitution Principle I's single-purpose-module rule (target resolution is already part of `handler.ts`'s responsibility). Per Principle II, all new test cases are co-located in `handler.test.ts` alongside the existing test suite.

## Phase 0: Research Decisions Summary

Full detail in [research.md](./research.md). Brief index of decisions ratified there:

- **R1 — Short-form rule placement**: inline in `handler.ts` via a local `resolveSpecificModePath` helper. Constitution Principle I respected (single-purpose module). Rejected: separate module under `src/path-safety/` (premature abstraction for ≤ 8 LOC) or `src/target-mode/` (target-mode is about modes, not name resolution).
- **R2 — Canonical short-form predicate**: literal three-condition check `!file.includes('/') && !file.includes('\\') && !file.endsWith('.md')`. Captures Q2 Option A's spec wording exactly. Rejected: regex-based matching (no benefit at this complexity), URI-style parsing (overkill).
- **R3 — FILE_EXISTS details enrichment placement**: one call site at `handler.ts:207-213` (the hot-path `wx`-flag collision throw). Three-character change. Rejected: enrich the `mapFsError` path too (wider scope — see R4).
- **R4 — `mapFsError` asymmetry preserved**: the separate `mapFsError` path that maps unexpected EEXIST during mkdir/rename to FILE_EXISTS continues to emit `{ errno }`-only details. This path is rare (race conditions during mkdir or rename); the user's spec targets the hot-path collision. Reconciling would require widening `mapFsError`'s signature and adding `path`/`vault` to its caller boilerplate — out of scope. Documented in research.md and the handler delta contract.
- **R5 — Path-safety check sequencing**: the short-form rule fires BEFORE `checkCanonicalPath`. `checkCanonicalPath` validates the RESOLVED path (`<file>.md` for canonical short-form), not the raw input. This is the correct order — path safety should validate what's actually written.
- **R6 — Schema unchanged**: per FR-012 / Out of scope, the schema's `file` and `path` fields stay as `safePathField` with identical structural validation. The handler's interpretation of `file` for canonical short-form inputs is the only behavioural change.
- **R7 — Logger surface unchanged**: FILE_EXISTS does NOT emit logger events per 016-FR-029. The new `errno` field does not change that. No new typed logger methods; no `ErrorCode` union amendments.
- **R8 — Active mode untouched**: active mode forbids `input.file` per the existing schema rule. Active mode resolves through the focused-file eval result (`parsed.path`) and uses it verbatim. No handler changes for active mode.
- **R9 — Test surface**: eight new / updated handler test cases. Existing cases for short-form `file` input need updating to expect the new resolved behaviour (the prior expectations were against 016's broken behaviour).
- **R10 — Edge cases enumerated**: `file: ".md"` (ends in `.md` → verbatim → writes to `<vault-root>/.md`), `file: "."` (passes schema → fires short-form rule → resolves to `..md` — weird but acceptable, no auto-rename), `file: ""` (rejected by schema's `min(1)`).
- **R11 — Response `path` value**: returned as `relPath`, which after the fix reflects the resolved path for canonical short-form `file` and the verbatim value otherwise. The handler's existing `return { created, path: relPath }` line is unchanged structurally; only the `relPath` computation upstream changes.
- **R12 — No plan-stage spec amendments**: the two `/speckit-clarify` Q&A bullets in spec.md closed both ambiguities. No further amendments.
- **R13 — Test seam pattern**: co-located handler tests inject `nodeFs` writeFile/realpath/mkdir/rename via deps; the existing 016 test-seam pattern is preserved. No new test-seam introductions.
- **R14 — Help update scope**: two short callouts in `docs/tools/write_note.md`. No new section structure; updates land under existing sections.
- **R15 — Release versioning**: a /speckit-tasks decision per the project's release-task convention. Expected patch bump (contract-restoration fix, purely additive on `details.errno`).

**Plan-stage status**: all 15 design decisions ratified at plan stage. Ground truth verified by reading `src/tools/write_note/handler.ts` and `src/tools/write_note/schema.ts` during plan; the touch surface and current behaviour are confirmed. No T0 deferrals; the implementation can proceed directly from this plan once `/speckit-tasks` runs.

## Phase 1: Design Artifacts

Generated in this command run:

- **[research.md](./research.md)** — design decisions R1–R15 + ground-truth verification table (handler line numbers, current behaviour, change shape) + FR-coverage mapping.
- **[data-model.md](./data-model.md)** — short-form predicate truth table (with examples per row), resolution flowchart, FILE_EXISTS `details` shape transition diagram (before / after), per-FR test inventory (8 cases) cross-referenced to acceptance criteria.
- **[contracts/write-note-handler-delta.contract.md](./contracts/write-note-handler-delta.contract.md)** — handler delta contract: what changes (the `resolveSpecificModePath` helper signature, the FILE_EXISTS details additive enrichment), what stays the same (the schema, the write mechanism, the path-safety check, the `mapFsError` path, the active-mode path, the post-write cache invalidation, the optional editor-open), the FR-001a passthrough rule, the `mapFsError` preserved-asymmetry note, the cross-failure-type field-name-parity contract.
- **[quickstart.md](./quickstart.md)** — 11 verification scenarios (S-1..S-11) mapped 1:1 to SC-001..SC-011. All scenarios are unit-testable except SC-002 (the live-Obsidian recognition assertion), which is a manual quickstart scenario per project precedent (memory note: this repo covers vitest unit tests only; manual / integration TC-XXX cases live elsewhere).
- **CLAUDE.md plan-pointer update** — the plan reference is updated to point at this plan file (Phase 1 step 3).

## Constitution Re-Check (Post-Design)

| Principle | Compliance | Notes |
|---|---|---|
| I. Modular Code Organization | ✅ PASS | Phase 1 confirmed the per-surface module layout. The `resolveSpecificModePath` helper stays local to `handler.ts`; no new module needed. Downward-flow chain preserved. Touch surface verified at one source file + one test file + one doc file. |
| II. Public Surface Test Coverage | ✅ PASS | Test inventory frozen at 8 cases. Drift detector auto-covers (no registration change). Happy-path AND failure-or-boundary cases included for each story (Story 1: canonical happy + internal-period + three FR-001a passthrough cases + `path` regression guard; Story 2: hot-path additive details + `mapFsError` regression guard + overwrite-true-no-rejection guard). |
| III. Boundary Input Validation with Zod | ✅ PASS | Schema unchanged per FR-012. Zod-as-single-source-of-truth maintained. Output schema unchanged. The `resolveSpecificModePath` helper receives the already-validated input via the handler's type parameter; no new type declarations. |
| IV. Explicit Upstream Error Propagation | ✅ PASS | Zero new codes. `UpstreamError` class unchanged. The cli-adapter's four-priority error classifier is untouched. The 011-R5 clause is untouched. The PATH_ESCAPES_VAULT / FS_WRITE_FAILED / ERR_NO_ACTIVE_FILE / FILE_EXISTS codes are untouched as top-level identifiers. The FILE_EXISTS `details` enrichment is purely additive. |
| V. Attribution & Layered Composition | ✅ PASS | No new source files. Edited `handler.ts` retains its existing `// Original — no upstream.` header. Doc update is exempt per 005-help-tool FR-019. README's Attributions section unchanged. |

**No Complexity Tracking entries.** No deviations.

## Complexity Tracking

> **No deviations from constitution.** All five principles evaluate as `Y` for this feature. No `N` entries; no Complexity Tracking entries needed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | (n/a)      | (n/a)                               |
