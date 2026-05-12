# Implementation Plan: Rename Typed Tools to Match Upstream CLI Subcommand Names

**Branch**: `022-rename-typed-tools` | **Date**: 2026-05-12 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/022-rename-typed-tools/spec.md`

## Summary

Rename five typed MCP tools to match the upstream Obsidian CLI subcommand names they wrap: `read_note` → `read`, `delete_note` → `delete`, `list_files` → `files`, `write_property` → `set_property`, `rename_note` → `rename`. Single-release MINOR-bump breaking change (`0.4.4` → `0.5.0`). Per Clarifications Q1 (2026-05-12), the rename is applied in lockstep across registered tool names, source directories (`src/tools/<old>/` → `src/tools/<new>/`), and factory function names (`createXxxNoteTool` → `createXxxTool`). Per Q2, a permanent registry-stability test (snapshot of `tools/list` against a checked-in JSON baseline) ships as durable machinery so future BIs cannot accidentally rename a tool. Per Q3, the cross-reference rewrite is scoped narrowly to `README.md`, `docs/tools/*.md`, and `CLAUDE.md`'s active-narrative top block — `.decisions/`, `.architecture/`, `CONTRIBUTING.md`, source-code comments, and predecessor `specs/0XX-*/` files are NOT proactively swept.

Technical approach: a mechanical rename sweep with no behaviour changes. Every renamed tool's `schema.ts` / `handler.ts` / `index.ts` body keeps its zod schema verbatim, its handler logic verbatim, and its factory function body verbatim — only the factory function's exported name and the registered tool name change. Co-located test files migrate with their directories; their `describe(...)` block titles may be updated to the new name but the assertions stay byte-identical. The handler-layer filetype widening that the new names imply (e.g. `read` operating on Canvas / PDF / attachments, not just Markdown) is **deferred to BI-060** — that BI ships after this rename per the spec's out-of-scope guard. Zero new error codes; zero new ADRs; zero schema-field changes.

## Technical Context

**Language/Version**: TypeScript 5.6.x (strict mode); `tsc --noEmit` clean.
**Primary Dependencies**: `@modelcontextprotocol/sdk` ^1.0.4, `zod` ^3.23.8, `zod-to-json-schema` ^3.23.5. No new dependencies introduced by this BI.
**Storage**: N/A — the wrapper is stateless; no persistence touched.
**Testing**: `vitest` ^4.1.5 with `@vitest/coverage-v8` ^4.1.5. Co-located `*.test.ts` files per Constitution Principle II. Statements-coverage threshold (single source of truth in `vitest.config.ts`) is the merge floor.
**Target Platform**: tri-platform (macOS / Linux / Windows) Node.js ≥ 22.11 per [017-cross-platform-support](../017-cross-platform-support/plan.md).
**Project Type**: MCP server (single TypeScript project; no separate frontend / backend / mobile split). Source under `src/`; tests co-located.
**Performance Goals**: No change. Rename is build-time / boot-time only; runtime path is byte-identical to pre-rename for every renamed tool.
**Constraints**: Constitutional gates (lint zero-warning, typecheck clean, build succeeds, full test suite passes, coverage threshold met). Spec-locked constraints: no new error codes (FR-008), no schema-field renames (FR-016), no rename of `write_note` / `find_by_property` / `read_heading` / `obsidian_exec` / `help` (FR-017).
**Scale/Scope**: 5 source-directory renames; 5 factory-function renames; 5 doc-file renames; 1 server.ts registration block re-sort; 1 `_register.test.ts` invariants-map key sweep; 1 new durable registry-stability test (FR-018); 1 CHANGELOG migration block; 1 package.json version bump; CLAUDE.md active-narrative top-block rewrite.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

All five principles satisfied without amendment:

| Principle | How this BI satisfies it |
|-----------|--------------------------|
| **I. Modular Code Organization** | The `{schema, handler, index}.ts` per-surface module layout is preserved verbatim through the rename — only the parent directory name changes. Cross-module import flow (tool → cli-adapter → external SDK) is preserved. Each renamed tool's module body keeps its single clear responsibility; no responsibility is added, removed, or migrated. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | Co-located tests migrate with their source directories — every renamed tool keeps its `schema.test.ts` / `handler.test.ts` / `index.test.ts` files alongside the renamed source. No public surface is renamed without its tests in the same change. Additionally, the durable registry-stability test (FR-018) is a NEW public-surface protection that explicitly tests "what the server publishes via tools/list" against a checked-in baseline — covers happy-path (registry matches baseline → pass) AND boundary cases (any registry deviation → fail with the specific deviation named). |
| **III. Boundary Input Validation with Zod** | Every renamed tool's zod schema is preserved byte-identical through the rename. The `z.infer<typeof schema>` types stay the canonical types. No schema-field names change (FR-016). The `applyTargetModeRefinement(targetModeBaseSchema.extend({...}))` idiom every renamed tool uses is unchanged. |
| **IV. Explicit Upstream Error Propagation** | Zero new `UpstreamError` codes (FR-008). The set of error codes each renamed tool can produce equals the set its pre-rename counterpart produced. The `cli-adapter`'s four-priority classifier + 011-R5 unknown-vault inspection clause + dispatch-layer signal classification are all inherited unchanged. |
| **V. Attribution & Layered Composition Transparency** | Every renamed source file keeps its `// Original — no upstream.` header through the move. No new attributions are needed (no upstream code is lifted into this BI). The README "Attributions" section is unaffected by the rename. |

No principle deviations → no Complexity Tracking entries needed.

**Spec-driven workflow gate (Principle II + dev-workflow #4):** the rename diff includes tests for every renamed surface (the existing co-located tests migrate; the new durable registry-stability test ships in the same change). Coverage threshold in `vitest.config.ts` is unaffected — the rename neither adds nor removes statements net of itself; it relocates them.

**Constitution check status: PASS** (initial and post-Phase-1 evaluation).

## Project Structure

### Documentation (this feature)

```text
specs/022-rename-typed-tools/
├── plan.md                                                    # This file
├── spec.md                                                    # Already authored (3 clarifications resolved)
├── research.md                                                # Phase 0 — decisions R1..R10
├── data-model.md                                              # Phase 1 — rename punch-list, baseline schema, sort tables
├── quickstart.md                                              # Phase 1 — verification scenarios mapped to SC-001..SC-010
├── contracts/
│   ├── registry-baseline.contract.md                          # Phase 1 — FR-018 durable test contract
│   └── changelog-migration-block.contract.md                  # Phase 1 — FR-010 migration block shape
├── checklists/
│   └── requirements.md                                        # Already authored (16/16 passing)
└── tasks.md                                                   # /speckit-tasks output (not produced by this command)
```

### Source Code (repository root)

Touch surface table — every file changed by this BI:

```text
RENAMED (git mv preserves history; one-shot dir rename per Q1 lockstep):
  src/tools/read_note/         → src/tools/read/
  src/tools/delete_note/       → src/tools/delete/
  src/tools/list_files/        → src/tools/files/
  src/tools/write_property/    → src/tools/set_property/
  src/tools/rename_note/       → src/tools/rename/
    (each contains: schema.ts, schema.test.ts, handler.ts,
                    handler.test.ts, index.ts, index.test.ts)

EDITED (factory-function exports, internal imports):
  src/tools/read/index.ts                 (export createReadTool, not createReadNoteTool;
                                           registered name "read")
  src/tools/delete/index.ts               (export createDeleteTool; registered name "delete")
  src/tools/files/index.ts                (export createFilesTool; registered name "files")
  src/tools/set_property/index.ts         (export createSetPropertyTool; registered name "set_property")
  src/tools/rename/index.ts               (export createRenameTool; registered name "rename")
  src/tools/<name>/index.test.ts          (assertion of registered name updated for each of the 5)

EDITED (orchestration / registry / drift detector):
  src/server.ts                           (5 import-name updates + tools-array re-sort)
  src/tools/_register.test.ts             (5 invariants-map key renames; ordered alphabetically)

NEW (per FR-018 durable registry-stability gate; design refined at /speckit-analyze U6 remediation 2026-05-12):
  src/tools/_register-baseline.json       (checked-in tools[].name + per-tool fingerprint baseline)
  src/tools/_register-baseline.ts         (shared fingerprint module — sha256, canonicalJSON,
                                           fingerprintLiveRegistry — consumed by BOTH the test and
                                           the regeneration script; prevents writer/verifier drift)
  src/tools/_register-baseline.test.ts    (co-located test for the shared module per Principle II)
  scripts/write-register-baseline.ts      (regeneration script invoked via `npm run baseline:write`)
  (FR-018 assertions added to src/tools/_register.test.ts — same file; consumes the shared module)

RENAMED (per FR-019 doc-file migration; git mv):
  docs/tools/read_note.md      → docs/tools/read.md
  docs/tools/delete_note.md    → docs/tools/delete.md
  docs/tools/list_files.md     → docs/tools/files.md
  docs/tools/write_property.md → docs/tools/set_property.md
  docs/tools/rename_note.md    → docs/tools/rename.md

EDITED (per FR-012 / FR-020 narrow rewrite scope):
  docs/tools/index.md                     (5 entry-row name updates; tool-grouping alphabetical re-sort)
  docs/tools/<each renamed>.md            (any in-body self-reference uses the new name;
                                           filetype-scope language preserved per BI-060 split)
  README.md                               (tool-list section: 5 name updates; any in-body cross-references)
  CLAUDE.md                               (active-narrative top-block rewritten for 022;
                                           predecessor blocks for 021..015 RETAINED unchanged)

EDITED (release mechanics):
  CHANGELOG.md                            (new "## [0.5.0]" section atop; single migration block listing
                                           all 5 renames with rationale per FR-010)
  package.json                            (version: "0.4.4" → "0.5.0"; AND scripts.baseline:write
                                           wiring for `scripts/write-register-baseline.ts` per
                                           /speckit-analyze U6 remediation)
  .gitignore                              (one new line `.scratch/` if not already present, for the
                                           T001 witness file per /speckit-analyze U5 remediation)

NOT TOUCHED (per Q3 narrow scope):
  .decisions/**.md                        (ADR text references old names; left as historical record)
  .architecture/**.md                     (architecture docs reference old names; left)
  CONTRIBUTING.md                         (contributor workflow; left)
  src/**/*.ts comments                    (source-code comments naming old tools; left)
  specs/0XX-*/**.md                       (predecessor specs; FR-020 explicit exemption)
```

**Structure Decision**: This BI follows the existing single-project TypeScript layout under `src/` with co-located tests per Constitution Principle II. No new top-level directories are added. The rename sweep relocates five `src/tools/<name>/` directories in lockstep with their registered tool names; the rest of the source tree (`src/cli-adapter/`, `src/target-mode/`, `src/help/`, `src/vault-registry/`, `src/binary-resolver/`, `src/logger.ts`, `src/queue.ts`, `src/errors.ts`, `src/server.ts`, `src/index.ts`) is untouched apart from `src/server.ts`'s 5-line import-update + tools-array re-sort and `src/tools/_register.test.ts`'s invariants-map key renames + new baseline assertion.

## Phase 0 — Outline & Research

All ten decisions resolved in [research.md](research.md). Summary:

| # | Decision | Resolution |
|---|----------|------------|
| R1 | Source-dir rename mechanic | `git mv` per dir (5 invocations); preserves git-blame history under new paths |
| R2 | FR-018 baseline format | JSON file at `src/tools/_register-baseline.json` storing `{ tools: [{ name, descriptionFingerprint, schemaFingerprint }] }`; fingerprints are SHA-256 of canonicalised JSON |
| R3 | Doc-file rename mechanic | `git mv` per doc (5 invocations); same as R1 |
| R4 | CHANGELOG migration block shape | Single `## [0.5.0]` section atop CHANGELOG.md; one migration block listing all 5 renames with rationale + the two-clause naming convention |
| R5 | Version bump | `0.4.4` → `0.5.0` (MINOR per FR-011; pre-v1.0 semver permits MINOR-level breaking changes) |
| R6 | `src/server.ts` edit shape | 5 import-name updates + tools-array re-sort to keep alphabetical-by-factory-name order |
| R7 | `_register.test.ts` invariants-map sweep | 5 key renames; `liveRegistryToolNames` derived array auto-updates; per-tool invariants are otherwise byte-identical |
| R8 | README + docs/tools/index.md sweep | One-pass search-and-replace for the 5 retired names → 5 new names in the two files; verify by grepping that no retired name remains |
| R9 | CLAUDE.md active-narrative rewrite | Top-block rewritten to describe 022 as the active feature (the sweep itself, not a tool wrap); 021..015 predecessor blocks retained unchanged |
| R10 | Test execution + baseline capture timing | Baseline JSON written into the rename branch's first commit (after `git mv` but before factory-name updates); FR-018 test added in a later commit; full test suite verified green at end of branch |

No NEEDS CLARIFICATION markers remained after Phase 0 (the three /speckit-clarify resolutions had already collapsed the major ambiguities at spec stage).

**Phase 0 output**: [research.md](research.md).

## Phase 1 — Design & Contracts

**Prerequisites**: research.md complete ✓.

### Entity extraction → data-model.md

[data-model.md](data-model.md) documents:

1. **Rename punch-list** — the canonical 5-entry table mapping `(old tool name, old dir, old factory)` → `(new tool name, new dir, new factory)` with each row's "why" cell citing the naming-convention clause (single-word verbatim vs `namespace:action` reversal).
2. **Alphabetical-sort tables** — pre/post import block ordering in `src/server.ts`, pre/post tools-array ordering, pre/post `_register.test.ts` invariants-map key ordering.
3. **Baseline JSON schema** — the `{tools: [{name, descriptionFingerprint, schemaFingerprint}]}` shape with worked example for the post-rename state.
4. **Per-tool invariants confirmation** — each renamed tool's input-schema `properties / required / additionalProperties` triple from `_register.test.ts` confirmed byte-identical pre vs post rename (only the keying tool-name changes).
5. **CLAUDE.md active-narrative top-block** — outline of the new block describing 022 (the sweep itself: surface change, Q1/Q2/Q3 clarifications, naming convention, no-aliases policy).

### Interface contracts → contracts/

Two contracts cover the externally-visible artifacts this BI ships:

1. **[contracts/registry-baseline.contract.md](contracts/registry-baseline.contract.md)** — the durable registry-stability test contract per FR-018. Defines the baseline JSON schema, the fingerprint canonicalisation rule, the test's pass/fail semantics, the baseline-roll-forward protocol for future BIs, and the failure-message format. Pinned to a path of `src/tools/_register-baseline.json`; the test lives inside `src/tools/_register.test.ts` as a new `describe(...)` block beside the existing drift detector.
2. **[contracts/changelog-migration-block.contract.md](contracts/changelog-migration-block.contract.md)** — the CHANGELOG migration block shape per FR-010. Defines the section header (`## [0.5.0] - 2026-05-12`), the required content (one migration block listing all 5 renames; the two-clause naming convention; caller migration instructions; the BI-060 forward reference), and the required structure (mappings in a single contiguous block, not scattered across other entries).

The renamed tools' input-schema / output-shape / error-code contracts are NOT re-stated as new contract documents — they are inherited verbatim from each tool's predecessor BI (`specs/006-read-note/contracts/`, `specs/011-write-note/contracts/`, etc.) and explicitly affirmed by spec FR-005..FR-008.

### Quickstart → quickstart.md

[quickstart.md](quickstart.md) defines 12 verification scenarios mapped to SC-001..SC-010:

| Scenario | Verifies | Test type |
|----------|----------|-----------|
| Q-1 | `tools/list` exposes 5 new names | unit (existing drift detector covers) |
| Q-2 | `tools/list` does NOT expose 5 retired names | unit |
| Q-3 | Each renamed tool's input-schema field set is byte-identical to pre-rename | unit (existing `_register.test.ts` invariants) |
| Q-4 | Each renamed tool's output shape matches pre-rename for valid inputs | unit (handler tests migrated from old paths) |
| Q-5 | Each renamed tool's error codes match pre-rename for failure inputs | unit (handler tests migrated) |
| Q-6 | `help({ tool_name: <new> })` returns the doc body | unit (help tool test) |
| Q-7 | `help({ tool_name: <old> })` returns tool-not-found error | unit (help tool test) |
| Q-8 | `package.json.version` reflects 0.4.4 → 0.5.0 MINOR bump | manual / CI |
| Q-9 | `CHANGELOG.md` contains the migration block with all 5 mappings | manual / docs-audit |
| Q-10 | `README.md` and `docs/tools/index.md` contain no retired-name references | manual grep |
| Q-11 | `docs/tools/<new>.md` exists for each new name (5 files); `docs/tools/<old>.md` absent for each retired (5 files removed) | filesystem assertion / `assertToolDocsExist` |
| Q-12 | FR-018 durable test passes against current baseline; fails with a clear deviation message when the baseline or the registry is tampered with | unit (the new FR-018 test itself; tamper-test asserts failure message shape) |

### Agent context update

The rename of the active feature requires rewriting CLAUDE.md's top-block per Q3. The rewrite happens via the `/speckit-plan` agent-context step: the block between `<!-- SPECKIT START -->` and `<!-- SPECKIT END -->` is updated to point at `specs/022-rename-typed-tools/plan.md`. The 021..015 predecessor narrative blocks beneath that marker are retained byte-identical — they describe historical state and are NOT rewritten by this BI per the FR-020 narrow scope.

**Phase 1 output**: [data-model.md](data-model.md), [contracts/registry-baseline.contract.md](contracts/registry-baseline.contract.md), [contracts/changelog-migration-block.contract.md](contracts/changelog-migration-block.contract.md), [quickstart.md](quickstart.md), updated [CLAUDE.md](../../CLAUDE.md) active-narrative top block.

### Constitution re-check (post-Phase-1)

All five principles still satisfied; no new violations introduced by the Phase 1 design artifacts. The durable registry-stability test (R2 / R10 / FR-018) is itself a Principle II strengthener — it adds coverage to the public-surface registry shape that previously was only exercised through tool-by-tool drift checks. The baseline JSON (per R2) is a checked-in artifact, not a generated one, so no fixture-generation rule applies.

**Constitution check status: PASS** (post-Phase-1).

## Complexity Tracking

> Fill only if Constitution Check has violations that must be justified.

No violations. No entries.

## Phase 2 — Task generation outline (for /speckit-tasks)

This section is informational only; `/speckit-tasks` produces the actual `tasks.md`. The task IDs sketched below are **planning placeholders**; tasks.md's authoritative IDs (T001..T036) supersede them (clarified at /speckit-analyze I7 remediation 2026-05-12). The expected task shape:

- **T0**: baseline-capture task. Run `npm test` against pre-rename `main` to capture the registry baseline values (tool names, schema fingerprints) used to seed `src/tools/_register-baseline.json`. Pre-rename state is needed to know what "no behaviour change" means for the registry; the baseline values get rewritten by T001..T005 (registered names change) and re-locked at the end of the branch.
- **T001..T005**: per-renamed-tool tasks. Each is a `git mv` of `src/tools/<old>/` → `src/tools/<new>/` + factory rename + co-located test-title updates + `src/server.ts` import + `_register.test.ts` invariants-map key. Done one tool at a time; tests passing at each tool's commit boundary.
- **T006**: re-sort the `src/server.ts` tools array + import block to alphabetical-by-factory-name (deferred to a single tidy-up commit because doing it incrementally during T001..T005 creates noisy intermediate diffs).
- **T007**: docs sweep — `git mv docs/tools/<old>.md docs/tools/<new>.md` × 5; update `docs/tools/index.md` and `README.md`.
- **T008**: durable registry-stability test (FR-018). Add `src/tools/_register-baseline.json` and the matching `describe(...)` block in `src/tools/_register.test.ts`.
- **T009**: CHANGELOG migration block + package.json version bump.
- **T010**: CLAUDE.md active-narrative top-block rewrite.
- **T011**: full quality-gate run (`npm run lint`, `npm run typecheck`, `npm run build`, `npm test`) — expected green throughout but verified at branch tip.

The actual `/speckit-tasks` output will be more granular and dependency-ordered.
