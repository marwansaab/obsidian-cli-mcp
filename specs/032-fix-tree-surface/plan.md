# Implementation Plan: Fix Tree Tool Surface

**Branch**: `032-fix-tree-surface` | **Date**: 2026-05-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/032-fix-tree-surface/spec.md`

## Summary

Correct four agent-visible defects in the `tree` tool's v0.5.7 surface — a misleading name, a ~2 600-character bloated description, internal project artefacts bleeding into the caller-facing string, and an `inputSchema` that advertises `file` / `path` top-level fields the runtime permanently rejects. The fix is mechanical: rename `tree` → `paths` via `git mv` of the source-tree directory and the docs file (BI-022 lockstep convention); replace the description with a ≤ 512-character string that opens with the flat-output statement, names the six parameters, and ends with the standard `Call help({ tool_name: "paths" }) for …, and the error roster.` pointer; rewrite the schema construction in `paths/schema.ts` to `targetModeBaseSchema.omit({ file: true, path: true }).extend({ folder, depth, ext, total })` so the published JSON Schema lacks the two leaked fields; roll forward `src/tools/_register-baseline.json` and the canonical architecture document in the same commit. Runtime behaviour, output shape, error codes, traversal logic, and per-mode argv assembly stay byte-stable per FR-016. No new ADRs, no Constitution amendment, no new top-level error codes. Version bump `0.5.8 → 0.6.0` (MINOR) per BI-022's breaking-rename precedent (R2). Test additions covering the new invariants (description-length cap, schema-shape absence checks, name-anchor checks) deferred to the next BI per the user's explicit out-of-scope statement.

## Technical Context

**Language/Version**: TypeScript 5.x, strict mode, `tsc --noEmit` clean (constitution-pinned).
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP transport), `zod` (sole boundary-validation library), `zod-to-json-schema` (published `inputSchema` emitter). No new dependencies; no version bumps.
**Storage**: N/A — the wrapper holds no state of its own; the `paths` tool reads `app.vault.adapter` inside the Obsidian CLI's `eval` subcommand and the bridge writes nothing.
**Testing**: `vitest` with `@vitest/coverage-v8`, co-located `*.test.ts` per Principle II. The merge-gate is `vitest run` (CI); statements-coverage floor is read from `vitest.config.ts`.
**Target Platform**: Node.js ≥ 22.11 (constitution-pinned). Cross-platform (Windows / macOS / Linux) per BI-017.
**Project Type**: Single-project Node CLI / MCP server wrapper around the Obsidian Integrated CLI binary.
**Performance Goals**: Carried from v0.5.7 unchanged — single CLI spawn per request, ~200 ms baseline, 10 MiB output cap inherited from `cli-adapter`. No performance contract changes.
**Constraints**: FR-011 ≤ 512-char description cap; FR-016 byte-stable runtime behaviour; FR-017 baseline-rolled-forward in same commit; FR-018 `npm test` exit code 0 post-change.
**Scale/Scope**: 8 source-tree files renamed via `git mv` (`src/tools/tree/{schema,handler,index,_template}.ts` + 3 `*.test.ts` + `docs/tools/tree.md`); 4 files edited outside the renamed dir (`src/server.ts`, `src/server.test.ts`, `src/tools/_register-baseline.json`, `package.json`); 1 architecture doc rolled forward; ~30 in-file edits (symbol renames + literal-name updates + description rewrite + schema-construction rewrite). LOC delta: ~−2 200 net (description shrinks from ~2 600 chars to ≤ 512 chars).

## Constitution Check

*Constitution v1.5.0 ratified 2026-05-03, last amended 2026-05-15. Compliance evaluated initial + post-Phase-1.*

| Gate | Status | Evidence |
|------|--------|----------|
| Principle I — Modular Code Organization | PASS | The renamed tool keeps the `{schema, handler, index}.ts` per-surface module layout. `_template.ts` and the three co-located `*.test.ts` files move with it. Cross-module imports flow downward only (tool → cli-adapter → spawn). No new module boundary crossings. |
| Principle II — Public Surface Test Coverage (NON-NEGOTIABLE) | **N — deviation; see Complexity Tracking** | The rename-mechanic coverage is preserved byte-equivalently: co-located `handler.test.ts` / `schema.test.ts` / `index.test.ts` move with the source directory via `git mv`, their in-place assertion updates reflect the new name + new schema shape + new help-pointer literal, and T012 strengthens `index.test.ts` case (2) with `expect(Object.hasOwn(props, "file")).toBe(false)` + same for `path` (FR-001 / SC-005 covered). T013 updates schema.test.ts's file/path-forbidden cases to expect strict-mode `code: "unrecognized_keys"` (FR-002 / SC-006 covered). HOWEVER, FR-005..FR-012 (description length cap, forbidden-regex set, forbidden-substring set, opening flat-output sentence, six-parameter naming presence, help-pointer literal-form) introduce NEW invariants on the modified surface that have NO automated test coverage in this BI — the user's spec input ([spec.md#out-of-scope-surfaces](./spec.md#out-of-scope-surfaces-explicitly-excluded)) explicitly defers new test additions to the next session. This is the deviation; justification + scope are recorded in [Complexity Tracking](#complexity-tracking) below. The deferred-test specification is pinned verbatim in [contracts/description-quality.contract.md §verification anchors](./contracts/description-quality.contract.md#verification-anchors) so the next BI lands the assertions without re-deriving them. |
| Principle III — Boundary Input Validation with Zod | PASS | The schema-fix tightens — not loosens — the boundary validation. `paths/schema.ts` continues to be the single source of truth via `treeInputSchema → pathsInputSchema` rename; the post-edit shape uses `.omit({ file: true, path: true })` so `file` / `path` are now rejected at parse time by strict mode rather than after parse by `superRefine`. The zod-inferred type `PathsInput = z.infer<typeof pathsInputSchema>` remains the canonical downstream type; no parallel TypeScript interface is introduced. |
| Principle IV — Explicit Upstream Error Propagation | PASS | Zero error-handling changes. The `paths` tool continues to surface `VALIDATION_ERROR`, `CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR` (with `details.code` ∈ `{FOLDER_NOT_FOUND, NOT_A_FOLDER, VAULT_NOT_FOUND}` and `details.reason: "not-open"` on closed-vault) via `UpstreamError` per FR-016 byte-stability. No new top-level error codes; no new `details.code` strings (per spec out-of-scope). The fifteen-tool zero-new-top-level-codes streak preserved. |
| Principle V — Attribution & Layered Composition Transparency | PASS | All edited source files retain the `// Original — no upstream.` header per the rename-mechanic invariant. The header comment text is updated to swap `tree` for `paths` where the comment narrates the tool name, but the header's structural shape (Original — no upstream. + one-line intent) is preserved. |
| ADR-010 — Typed Tool Names Mirror Upstream CLI Subcommand | N/A | The `paths` tool does NOT wrap a single named native CLI subcommand. It composes via the `eval` subcommand (parity with `find_by_property`, `read_heading`, `links`, `tree`, `tag`, `smart_connections_*`, the entire eval-cohort). The upstream CLI has no `paths` / `tree` / `walk` / `find` subcommand. ADR-010 governs single-subcommand-wrap naming only. |
| ADR-013 — Plugin-Namespace Tool Naming Convention | N/A | `paths` does not wrap a plugin-exposed API. ADR-013 applies only to plugin-backed typed tools. |
| ADR-014 — Plugin-Backed Typed Tools Runtime-Dependency Pattern | N/A | Not plugin-backed (same reasoning as ADR-013). |
| ADR-015 — Sub-Discriminators via `details.reason` for Multi-State Error Codes | N/A | This BI introduces no new `(top-level-code, details.code)` pair with multiple sub-states; the existing `VAULT_NOT_FOUND(reason: "not-open")` sub-discriminator is byte-stable per FR-016. |

**Verdict**: Principles I, III, IV, V PASS on initial + post-Phase-1 evaluation; ADR-010 / ADR-013 / ADR-014 / ADR-015 N/A as reasoned per row. Principle II is **N (deviation)** — the description-quality invariants FR-005..FR-012 ship without automated test coverage per the user's explicit "no new tests" scope statement; the deviation is tracked in the Complexity Tracking section below and the deferred-test specification is pinned in `contracts/description-quality.contract.md` so the next BI is mechanical.

## Project Structure

### Documentation (this feature)

```text
specs/032-fix-tree-surface/
├── plan.md                                 # This file (/speckit-plan output)
├── spec.md                                 # /speckit-specify + /speckit-clarify output
├── research.md                             # Phase 0 output (decisions R1..R20 + plan-stage findings F1..F5)
├── data-model.md                           # Phase 1 output (edit-surface inventory, LOC budget, before/after schema shapes)
├── contracts/
│   ├── description-quality.contract.md     # FR-005..FR-012 + SC-001..SC-004 normative contract
│   └── schema-shape.contract.md            # FR-001..FR-004 + SC-005..SC-006 normative contract
├── quickstart.md                           # Phase 1 output (Q-1..Q-N verification scenarios)
├── checklists/
│   └── requirements.md                     # /speckit-specify validation checklist
└── tasks.md                                # Phase 2 output (created by /speckit-tasks, NOT this command)
```

### Source Code (repository root)

```text
src/
├── server.ts                               # EDITED — import path + name; tools-array alphabetical position shifts
├── server.test.ts                          # EDITED — 19-tool names array + description string updated for `tree` → `paths` (alphabetical reposition)
├── target-mode/
│   └── target-mode.ts                      # UNCHANGED — refinement helper byte-stable per spec clarify decision
└── tools/
    ├── _register.ts                        # UNCHANGED (registry-construction layer)
    ├── _register-baseline.json             # ROLLED FORWARD via `npm run baseline:write` — `tree` entry removed, `paths` entry inserted alphabetically (between `outline` and `properties`)
    ├── _register-baseline.ts               # UNCHANGED (canonical-JSON / SHA-256 helper from BI-022)
    ├── _register-baseline.test.ts          # UNCHANGED (durable test from BI-022)
    ├── _registration-stub.ts               # UNCHANGED (shared fixture from BI-031)
    ├── _shared.ts                          # UNCHANGED
    ├── _eval-vault-closed-detection/       # UNCHANGED (cross-cutting shared module)
    ├── files/                              # UNCHANGED (sibling folder-scoped tool, OUT OF SCOPE per spec)
    ├── tree/                               # RENAMED via `git mv` to ↓
    └── paths/                              # NEW directory (post-rename) holding:
        ├── _template.ts                    # `git mv` from tree/_template.ts; header comment updated
        ├── handler.ts                      # `git mv` from tree/handler.ts; header comment + log strings + symbol-renames; eval-template JS body BYTE-STABLE per FR-016
        ├── handler.test.ts                 # `git mv` from tree/handler.test.ts; symbol-renames + literal-name updates
        ├── index.ts                        # `git mv` from tree/index.ts; PATHS_TOOL_NAME + PATHS_DESCRIPTION + createPathsTool; description rewritten ≤ 512 chars
        ├── index.test.ts                   # `git mv` from tree/index.test.ts; name + constant + description + baseline assertion updates
        ├── schema.ts                       # `git mv` from tree/schema.ts; pathsInputSchema with .omit({file:true, path:true}) inline; refinement helper call BYTE-STABLE
        └── schema.test.ts                  # `git mv` from tree/schema.test.ts; symbol-renames + the file/path-rejection-message tests updated to expect strict-mode rejection (FR-002 / SC-006)

docs/
└── tools/
    ├── tree.md                             # RENAMED via `git mv` to ↓
    └── paths.md                            # POST-RENAME — top-level heading + in-file `"name": "tree"` JSON examples (9 occurrences observed) updated to `"name": "paths"`; bulk content preserved

.architecture/
└── Obsidian CLI MCP - Architecture.md      # ROLLED FORWARD — `tree`-named references updated to `paths`; ordinal "fifteenth typed-tool wrap" reference stays as historical-snapshot anchor

package.json                                # EDITED — `"version": "0.5.8"` → `"version": "0.6.0"` (MINOR per BI-022 breaking-rename precedent, R2)
```

**Structure Decision**: Single-project layout, no new top-level directories, no new shared modules. The rename is mechanical and follows the BI-022 lockstep convention verbatim (per spec FR-014 / FR-015). The only structural movement is the `git mv` of `src/tools/tree/` → `src/tools/paths/` and `docs/tools/tree.md` → `docs/tools/paths.md`. The renamed dir keeps the established `{schema, handler, index}.ts` + co-located-tests-plus-`_template.ts` per-surface layout — Principle I preserved by construction.

## Complexity Tracking

| Gate | Deviation | Justification | Mitigation | Sunset |
|------|-----------|---------------|------------|--------|
| Principle II — Public Surface Test Coverage (NON-NEGOTIABLE) | FR-005..FR-012 (description-quality invariants on the modified `paths` surface) ship without automated test coverage in this BI. | (1) User's spec input explicitly defers new test additions to the next session — see [spec.md "Out-of-Scope Surfaces"](./spec.md#out-of-scope-surfaces-explicitly-excluded), second bullet ("Tests covering the corrected surface. The user explicitly defers test additions to the next session."). (2) The rename-mechanic coverage IS preserved byte-equivalently — the renamed co-located `*.test.ts` files continue to cover the descriptor name, schema shape, description-content fragments (trailing-slash substring + help-pointer literal via existing case (3)), and baseline-entry presence; T012 + T013 add FR-001 / FR-002 / SC-005 / SC-006 absence and strict-mode assertions inside existing test cases. (3) The deferred invariants (length cap, forbidden-regex set, forbidden-substring set, leading-flat-output sentence) are mechanical and content-only — they do not gate runtime behaviour, which is byte-stable per FR-016. A description that violates one of these invariants is agent-visible but does not corrupt vault state. | The contract `contracts/description-quality.contract.md` pins the deferred assertions verbatim (length ≤ 512, regex-set zero-match, substring-set zero-match, leading-80-char paths-and-flat-synonym, help-pointer literal-form). Reviewers verify FR-005..FR-012 by inspection during this BI per quickstart Q-1..Q-4. The `_register-baseline.json` SHA-256 fingerprint of the new `PATHS_DESCRIPTION` is locked at T016, providing drift-detection if the description is altered post-merge without a baseline roll-forward. | Next BI lands the deferred assertions as a minimal test-additions-only commit. Tracking note added to `docs/tools/paths.md` follow-up sweep (out of scope here; carried in the same next-session work that picks up FR-021 README/CHANGELOG updates). |

## Graph consultation (added retroactively)

The original plan commit (`7840256`) skipped the CLAUDE.md `/speckit-plan` graph-consultation gate. This section was added on user prompt to repair the gap; full detail in [research.md "Graph consultation"](./research.md#graph-consultation-added-retroactively-per-claudemd-speckit-plan-rule) (entries G1..G6).

**Kernel-node interaction (CLAUDE.md mandates explicit naming)**: This plan TOUCHES `createServer` — one of the four kernel god-nodes per CLAUDE.md. The interaction is the lowest-blast-radius possible: a single outbound `--calls-->` edge label change at `src/server.ts:31` (`createServer --calls--> createTreeTool` → `createServer --calls--> createPathsTool`). Zero edges added; zero edges deleted; zero changes to the other 18 outbound `--calls-->` edges to sibling tool factories. The other three kernel nodes (`createLogger`, `createQueue`, `UpstreamError`) are NOT perturbed by this BI. The three-spine model (boot / runtime / error) holds: only the boot spine sees the rename; runtime and error spines are byte-stable per FR-016.

**Affected communities** (per `graphify-out/GRAPH_REPORT.md`):

- Community 12 "tree + move spec docs" — the 032 spec artefacts join this community on next `/graphify --update`.
- Community 94 (`tree JS_TEMPLATE`, `executeTree` co-located with tag-tool symbols) — symbol renames; semantic-similarity edges to tag persist.
- Community 105 (tree schema-symbol cluster: `treeInputSchema`, `treeOutputSchema`, etc.) — eight symbols rename in lockstep.
- Community 141 (tree schema-test cluster) — symbol renames.
- Community 47 "target-mode shared module" — NOT edited; the schema fix uses `.omit()` inline, leaving the shared helper byte-stable.

**No surprise community placements expected.** No new community is created. No new error-class nodes outside the `errors.ts` community (Principle IV preserved structurally).

**Out-of-scope stale references surfaced by graph (NOT touched by this BI)**:

- `docs/tools/smart_connections_query.md` carries an `eval subcommand --references--> tree tool` edge. After rename, this textual cross-tool docs reference becomes stale. Spec FR-019's one-tool-docs-only scope explicitly excludes sibling tool docs from this BI.
- `.scratch/pre-rename-tools.json` is a historical pre-022 snapshot tracked by the graph. Intentionally preserved as historical artefact; never edited.
- `specs/030-move-note/contracts/move-input.contract.md` carries an inferred semantic-similarity edge to `tree input contract (029)`. Cross-spec history reference; not load-bearing for runtime.

**Sibling structural-similarity cohort** surfaced (G5): the `tag` tool shares multiple inferred semantic-similarity edges with `tree` symbols. `tag` was correctly excluded from this BI's edit surface. The cohort relationship suggests `tag`'s description (2 423 chars per F1) is the natural next-BI candidate for the same description-trim treatment.

**Net structural verdict**: graph consultation surfaces NO contradictions with the plan's existing claims. The plan's 14-file edit-surface inventory is complete for in-scope work; two out-of-scope stale-reference files are flagged for future-sweep traceability; the `createServer` god-node touch is the lowest-blast-radius kernel-node interaction possible. Constitution Check status unchanged: all gates PASS.
