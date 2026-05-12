# Implementation Plan: List Files — Typed Folder-Scoped File Enumeration

**Branch**: `019-list-files` | **Date**: 2026-05-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [/specs/019-list-files/spec.md](./spec.md)

## Summary

Add `list_files`, the eighth typed-tool wrap on top of the foundation completed by features 003–018 and the project's first FOLDER-scoped typed surface. Where the prior seven typed tools (`read_note`, `write_note`, `delete_note`, `read_property`, `find_by_property`, `read_heading`, `write_property`) all operate on a single named file or the focused file, `list_files` operates on a vault folder and returns the structured `{ count, paths }` shape. The user-facing surface: `list_files({ target_mode, vault?, folder?, ext?, total? })` returning `{ count: number, paths: string[] }`. Today the only path is `obsidian_exec` returning plain text that agents must line-parse; the typed surface returns the structured shape directly so downstream traversals, conditional creates, and inventory reports drop the brittle parse step.

**Technical approach** (locked at Phase 0 / [research.md](./research.md)):

- **CLI subcommand**: `files` (native, NOT eval). Verified live during plan (F1) — Obsidian exposes `files folder=<path> ext=<extension> total` as a first-class subcommand. The spec's "no eval injection vector" assertion holds because user inputs (`folder`, `ext`) flow through discrete argv parameters to `files`, never into an eval source-text template.
- **Per-mode call architecture (R3)**: ONE `invokeCli` call per request, regardless of `target_mode` or input parameters. No two-call branches.
  - **Specific mode**: `vault=<v> files [folder=<f>] [ext=<e>]`.
  - **Active mode**: `files [folder=<f>] [ext=<e>]` (no `vault=`).
- **Schema**: folder-scoped variant of the post-010 flat-extension idiom. Either a new helper `applyTargetModeRefinementForFolderScoped` lands in `src/target-mode/` (forbids `file` AND `path` in BOTH modes; preserves the existing in-specific-requires-vault / in-active-forbids-vault rules), OR the refinement is inlined locally in `src/tools/list_files/schema.ts` via `superRefine`. The pick is a /speckit-tasks decision; both implementations satisfy Constitution III. Recommended pick: the shared helper (folder-scoped pattern may recur). Tracked as a Tier-1 task.
- **Output schema**: `z.object({ count: z.number().int().nonnegative(), paths: z.array(z.string()) }).strict()`. Two fields, strict mode. Both branches of the `total` flag share the same shape; on `total: true` the `paths` field is `[]`.
- **Filter pipeline (R6 / R7 / R9 / R10)**: the CLI's `files` subcommand is **RECURSIVE by default** (F2) — this was the most consequential finding of the plan. The wrapper enforces FR-012's non-recursive contract by filtering result paths whose component count exceeds the folder's component count + 1 (R6). Three filters apply post-fetch:
  1. Sub-folder filter (FR-026, defence-in-depth — F19 says CLI never emits sub-folder entries).
  2. Dotfile filter (FR-028, defence-in-depth — F18 says CLI already filters dotfiles natively).
  3. Non-recursive filter (R6, **load-bearing** — F2 confirms CLI returns recursive subtree).

  After filtering, the wrapper applies the FR-027 lexical sort (R8 — UTF-8 byte-compare via `Buffer.compare`, NOT JavaScript's default UTF-16 code-unit compare; the difference is observable only for non-BMP characters).

- **`total: true` architecture (R7)**: the wrapper does NOT delegate to the CLI's native `total` flag. F12 found that the CLI's `total` count is RECURSIVE — incompatible with FR-007 + SC-005's requirement that `total: true` and `total: false` return identical counts. The wrapper applies the same fetch + filter pipeline in both modes; on `total: true`, the response's `paths` is set to `[]` after counting.
- **Plan-stage spec amendment (R12 / Plan-amendment-1)**: **SC-012 weakening — `total: true` is NOT a cap-evasion path.** Both modes apply the same CLI fetch and so face the same output-cap threshold. SC-018's wrapper→MCP-client token saving still holds; the spec's second sentence in SC-012 ("the same fixture queried with `total: true` succeeds with the full count") is unrealisable under the chosen architecture and is retired in research.md and surfaced as a Known Limitation in `docs/tools/list_files.md`.
- **Live-CLI characterisation status**: 18 of 21 case classes verified live during plan (F1–F20 in research.md). THREE deferred to T0 of `/speckit-implement`: emoji / non-ASCII / whitespace fixture pass, active-mode-no-focused-vault probe, synthetic 200K-file output-cap fixture. All three bundled into `T0xx` tasks during /speckit-tasks.
- **Registration**: via the existing `registerTool` factory at [src/tools/_register.ts](../../src/tools/_register.ts) — the factory auto-applies `stripSchemaDescriptions`, wraps `ZodError → VALIDATION_ERROR`, propagates `UpstreamError → asToolError`, and JSON-serialises typed output objects into the MCP `content[0].text` envelope (matching prior tools' pattern exactly).
- **Module layout**: `src/tools/list_files/{schema,handler,index}.ts` with co-located `*.test.ts` per the post-011 convention. All six new source files carry the `// Original — no upstream.` attribution header per Constitution V.

## Technical Context

**Language/Version**: TypeScript (strict mode, `tsc --noEmit` clean) — pinned in [tsconfig.json](../../tsconfig.json), runtime Node.js >= 22.11 per `engines.node` in [package.json](../../package.json).
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP transport), `zod` (validation, single source of truth per Constitution III), `zod-to-json-schema` (consumed via the existing `toMcpInputSchema` helper at [src/tools/_shared.ts](../../src/tools/_shared.ts)). One Node-builtin addition: `Buffer` (for the UTF-8 byte-compare sort per R8) — already implicitly available in the Node runtime; no `package.json` change.
**Storage**: N/A — the tool is stateless. The CLI enumerates files via Obsidian's running instance; `list_files` is the wrapper.
**Testing**: vitest with `@vitest/coverage-v8`. Co-located `*.test.ts` per module. The aggregate statements coverage threshold floor is **90.9%** ([vitest.config.ts:20](../../vitest.config.ts#L20)). Tests inject the cli-adapter's stub `spawnFn` via `deps.spawnFn` per the existing test-seam convention; no real `obsidian` binary executions in CI. **Every handler test asserts exactly ONE spawn** per the R13 single-spawn invariant; the unit suite uses synthetic stdout to exercise FR-026 / FR-028 defence-in-depth filters (the live CLI does not currently emit shapes that trigger them — F18 / F19).
**Target Platform**: cross-platform Node.js MCP server (Windows / macOS / Linux). The host shells out to the Obsidian CLI binary via `child_process.spawn`. Per the 017-cross-platform-support resolver chain, binary discovery is OS-independent. The wrapper's sort uses UTF-8 byte-compare via `Buffer.compare` (R8) — byte-for-byte reproducible across platforms.
**Project Type**: MCP server with one new typed tool. Per Constitution v1.2.0, the project exposes "an MCP server surface" only; `list_files` adds one entry to the registered-tool list at [src/server.ts:80-90](../../src/server.ts#L80-L90) (alphabetical: inserted between `createHelpTool` and `createObsidianExecTool`).
**Performance Goals**: per-call latency ≈ 1× existing single-call typed tools (one CLI invocation). Both the call and the response fit within the typed-tool 10 s timeout / 10 MiB output cap inherited from the cli-adapter. **Token savings on the response side** are the primary win per SC-018 — a structured `{ count, paths }` array replaces what previously required `obsidian_exec` returning plain text plus client-side line parsing. The `total: true` flag further reduces wrapper→MCP-client payload to a single integer for count-only queries.
**Constraints**:
- 10 s per-call timeout, 10 MiB output cap (typed-tool defaults applied automatically by `invokeCli` per [src/cli-adapter/cli-adapter.ts:10-11](../../src/cli-adapter/cli-adapter.ts#L10-L11)).
- Single-in-flight CLI queue gates all CLI invocations — single-spawn per request (R13) composes cleanly with the existing queue.
- 008-refactor surface frozen — `dispatchCli`, `invokeCli`, `invokeBoundedCli`, the in-flight registry, the four-priority error classification, the `obsidian_exec` argv-assembly contract, the `assertToolDocsExist` aggregator, the 011-R5 unknown-vault response-inspection clause are all frozen. `list_files` inherits without modification.
- The `files` CLI response shape is the locked coupling surface; future Obsidian version drift surfaces as test failures rather than silent regressions.
- The 017-cross-platform-support binary-resolver layer is frozen — `list_files` inherits cross-platform support below `dispatchCli` automatically.
- Folder-scoped surface introduces a **new target-mode helper** (or local refinement) — see Module layout. This is the ONE incremental change to the target-mode primitive in this feature; if implemented as a shared helper, it does not modify the existing `applyTargetModeRefinement` function used by the prior seven typed tools.
**Scale/Scope**: ~205 LOC of new source code across `schema.ts` / `handler.ts` / `index.ts`, plus three co-located test files totalling ~920 LOC. Plus possibly ~30 LOC in `src/target-mode/target-mode.ts` for the folder-scoped refinement helper (~10 LOC of test additions). One new doc at `docs/tools/list_files.md` (~250 lines including ≥4 worked examples, error roster, Plan-amendment-1 known limitation). Two lines of edit in `src/server.ts` (import + tools-array entry), one line each in `docs/tools/index.md`, `package.json`, `CHANGELOG.md`, and `CLAUDE.md` (plan-pointer).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Evidence |
|---|---|---|
| **I. Modular Code Organization** | ✅ PASS | New tool lives at `src/tools/list_files/` per the established `{schema, handler, index}.ts` per-surface layout (verified against existing siblings `obsidian_exec`, `help`, `read_note`, `write_note`, `delete_note`, `read_property`, `find_by_property`, `read_heading`, `write_property`). Downward-flow chain preserved: `index.ts` → `handler.ts` → `cli-adapter` → `child_process.spawn`. No upward or cyclic imports. The schema module imports from `target-mode/` (peer primitive — may add one helper); the handler imports from `cli-adapter/` (peer); `index.ts` imports from `_register.ts` (sibling helper). |
| **II. Public Surface Test Coverage** | ✅ PASS | `list_files` is a public MCP tool surface. Co-located tests at `src/tools/list_files/{schema,handler,index}.test.ts` (18 schema cases / 28 handler cases / 5 registration cases per FR-022 = **51 tests total**, exceeding SC-015's floor of 30). Happy-path AND failure-path coverage in every layer. The post-010 consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) automatically covers `list_files` via its `it.each` registry walk; no test-file modifications required. |
| **III. Boundary Input Validation with Zod** | ✅ PASS | Input schema is `applyTargetModeRefinementForFolderScoped(targetModeBaseSchema.extend({ folder, ext, total }).strict())` (or local-refinement variant) — composed from the project's single-source-of-truth `target_mode` primitive plus three list_files-specific fields. Inferred TypeScript type via `z.infer<typeof listFilesInputSchema>`. **Output type ALSO via zod schema** `listFilesOutputSchema = z.object({ count, paths }).strict()` (FR-009 / FR-011) — no hand-rolled types. The `folder` and `ext` fields are `z.string().min(1).optional()` — empty strings reject at the zod boundary (R15). `registerTool` parses input via `schema.parse` before the handler runs (auto-wrap `ZodError → VALIDATION_ERROR` with `details.issues`). Handler trusts validated input; no defensive checks. |
| **IV. Explicit Upstream Error Propagation** | ✅ PASS | Zero new error codes (per FR-020, Constitution Principle IV). Failures flow through `VALIDATION_ERROR` (zod) and `UpstreamError` codes from the cli-adapter (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`). The 011-R5 unknown-vault response-inspection clause in the cli-adapter is inherited verbatim — no `list_files`-specific handling needed (R5 / F13). Path-traversal (F15) and within-vault `..` (F16) and absolute paths (F17) are CLI-confined; the cli-adapter's classifier maps the resulting empty stdout to a successful empty response per FR-010 (no error — three branches of the conflated empty shape). Active-mode no-focused-vault detection maps to `ERR_NO_ACTIVE_FILE` (or `CLI_REPORTED_ERROR` depending on T0 verification). `registerTool`'s catch blocks propagate `UpstreamError` via `asToolError` and re-throw any other exception. No `catch + return null/empty/default` patterns. |
| **V. Attribution & Layered Composition Transparency** | ✅ PASS | Every new source file (`src/tools/list_files/{schema,handler,index}.ts` + three `*.test.ts`) carries the `// Original — no upstream. <one-line description>.` header per the established convention (FR-025). The Markdown doc at `docs/tools/list_files.md` is exempt per [005-help-tool](../005-help-tool/spec.md) FR-019. README's Attributions section is unchanged (no new lifted code). The optional folder-scoped target-mode helper, if added, carries the same `Original — no upstream.` header. |

**Coverage gate**: aggregate statements floor is 90.9% ([vitest.config.ts:20](../../vitest.config.ts#L20)); the new tests must not drop the aggregate below this. The new module is ~205 LOC; the 51 co-located test cases provide near-100% coverage of the new module, so the aggregate either stays flat or ratchets up.

**Constitution Compliance checklist** (for the eventual PR): all five principles expected to evaluate as Y. No deviations needed; no Complexity Tracking entries required.

**Plan-stage spec amendments documented in research.md (per R12 — not amended in spec.md)**:

- **Plan-amendment-1 — SC-012 weakening**: `total: true` is NOT a cap-evasion path. Both modes apply the same CLI fetch + filter pipeline and so face the same output-cap threshold. Documented in `docs/tools/list_files.md` Known Limitations. The mitigation for callers facing pathological folders is `obsidian_exec files folder=X total` (uses the CLI's native `total` flag, which is cap-friendly but produces a RECURSIVE count — distinct from the wrapper's non-recursive count).
- **Plan-amendment-2 — FR-026 / FR-028 are defence-in-depth, not load-bearing**: F18 confirms the CLI already filters dotfiles natively; F19 confirms it never emits sub-folder entries. The wrapper's filters protect against CLI version drift but are not currently observable against the live CLI. The unit-test suite uses synthetic stdout to exercise the filter rules; the live characterisation pass (FR-023) confirms the underlying CLI does NOT cause these filters to trigger.

These amendments are NOT applied to spec.md (R12 precedent — predecessor specs are not edited retroactively); they are documented in research.md and will be cited in the merge-stage Constitution Compliance checklist's evidence section.

## Project Structure

### Documentation (this feature)

```text
specs/019-list-files/
├── plan.md              # This file
├── research.md          # Phase 0 output — design decisions R1–R16 + plan-stage live-CLI findings F1–F20 + plan-stage spec amendments per R12
├── data-model.md        # Phase 1 output — input/output schema shapes, per-mode argv-mapping table, filter pipeline, per-tool invariants ↔ FR mapping, test inventory (51 cases)
├── quickstart.md        # Phase 1 output — verification scenarios (S-1..S-22) mapped 1:1 to SC-001..SC-022 + three manual T0 scenarios (M-1..M-3)
├── contracts/
│   ├── list-files-input.contract.md     # Public input contract (zod schema + emitted JSON Schema shape + field policy + six worked examples + validation/downstream failure rosters)
│   └── list-files-handler.contract.md   # Handler invariants (deps shape, single-spawn invariant, filter pipeline contract, sort algorithm, failure propagation, test-seam pattern, defence-in-depth synthetic-stdout pattern)
├── checklists/
│   └── requirements.md  # Spec quality checklist (filled at /speckit-specify time + 2nd iteration after /speckit-clarify)
└── tasks.md             # Phase 2 output (created by /speckit-tasks, NOT by this command)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── list_files/                       # NEW per-surface module (FR-001)
│   │   ├── schema.ts                     # listFilesInputSchema, listFilesOutputSchema, types via z.infer (FR-002..FR-009)
│   │   ├── schema.test.ts                # 18 cases per FR-022 (target-mode interactions + folder/ext non-empty + total bool + unknown-key)
│   │   ├── handler.ts                    # executeListFiles(input, deps) — single-spawn invokeCli wrapper + parseStdout + filter predicates (isFolderEntry, hasDotPrefixedComponent, isDirectChildOfFolder) + lexical sort via Buffer.compare (FR-013..FR-019, FR-026..FR-028); ~120 LOC
│   │   ├── handler.test.ts               # 28 cases per FR-022 (per-mode argv shape, stdout-parsing edge cases, filter behaviour, sort ordering, error code propagation)
│   │   ├── index.ts                      # createListFilesTool factory via registerTool (FR-021)
│   │   └── index.test.ts                 # 5 registration cases per FR-022 (descriptor name, stripped schema, help mention, doc presence, drift-detector parameterised lock)
│   ├── _register.ts                      # FROZEN (verified — no edits needed; registerTool covers list_files out-of-the-box)
│   ├── _register.test.ts                 # FROZEN — drift detector's it.each registry walk auto-covers list_files
│   ├── _shared.ts                        # FROZEN
│   ├── help/                             # FROZEN
│   ├── obsidian_exec/                    # FROZEN (SC-013 — zero substantive diff)
│   ├── read_note/                        # FROZEN (SC-013)
│   ├── write_note/                       # FROZEN (SC-013)
│   ├── delete_note/                      # FROZEN (SC-013)
│   ├── read_property/                    # FROZEN (SC-013)
│   ├── find_by_property/                 # FROZEN (SC-013)
│   ├── read_heading/                     # FROZEN (SC-013)
│   └── write_property/                   # FROZEN (SC-013)
├── server.ts                             # +2 lines: import + createListFilesTool({ logger, queue }) added to the tools array (alphabetical: inserted between createHelpTool and createObsidianExecTool)
├── server.test.ts                        # registry-consistency test auto-covers list_files's docs/ presence (no edits)
├── cli-adapter/                          # FROZEN (008-refactor surface + 011-R5 unknown-vault inspection clause)
├── binary-resolver/                      # FROZEN (017-cross-platform-support surface)
├── target-mode/                          # +1 helper (optional — applyTargetModeRefinementForFolderScoped) or untouched (if local-refinement variant chosen)
│   ├── target-mode.ts                    # IF helper added: +~30 LOC for applyTargetModeRefinementForFolderScoped + its export
│   └── target-mode.test.ts               # IF helper added: +~10 LOC for the new helper's tests
├── help/                                 # FROZEN
├── errors.ts                             # FROZEN (no new codes per FR-020)
├── logger.ts                             # FROZEN (per R1 — no callStart/callEnd events introduced)
└── queue.ts                              # FROZEN

docs/tools/
├── list_files.md                         # NEW non-stub doc per FR-021 (input schema, output shape both branches of total, error roster, ≥4 worked examples covering ≥4 distinct scenarios, Plan-amendment-1 known limitation re: total + cap, the recursive-count fallback via obsidian_exec)
├── index.md                              # +1 line entry per the existing convention
├── obsidian_exec.md                      # FROZEN
├── read_note.md                          # FROZEN
├── write_note.md                         # FROZEN
├── delete_note.md                        # FROZEN
├── read_property.md                      # FROZEN
├── find_by_property.md                   # FROZEN
├── read_heading.md                       # FROZEN
├── write_property.md                     # FROZEN
└── help.md                               # FROZEN

CHANGELOG.md                              # +1 entry under "Unreleased" or the patch version (release versioning is a /speckit-tasks decision)
package.json                              # description string updated to mention list_files alongside the existing typed tools
README.md                                 # tools-list section updated (if present)
CLAUDE.md                                 # plan-pointer updated by Phase 1 step 3 to reference this plan
```

**Structure Decision**: Single-project layout per the existing project shape. `src/tools/list_files/` is the entire functional surface for this feature; everything else is one-line wiring (server registration, docs index, package description) or out-of-tree documentation (CHANGELOG, README). The optional `src/target-mode/` helper extension is a /speckit-tasks decision; both implementation variants (shared helper OR local refinement) satisfy Constitution III. Per Constitution Principle I, the new module is single-purpose (typed folder-listing tool); per Principle II, tests are co-located with sources.

## Phase 0: Research Decisions Summary

Full detail in [research.md](./research.md). Brief index of decisions ratified there:

- **R1 — Logger surface**: thin handler, no per-call events. Mirrors 011–018 actual implementation.
- **R2 — CLI subcommand selection**: `files` (native). NOT eval, NOT obsidian_exec. F1 confirms.
- **R3 — Per-mode call architecture**: ONE invokeCli call per request, regardless of mode. Specific mode includes `vault=`; active mode omits.
- **R4 — Target-mode mapping**: STANDARD. In specific mode `vault` flows through; in active mode the cli-adapter's `stripTargetLocators` defence-in-depth strip removes any leaked `vault` / `file` / `path`.
- **R5 — Unknown-vault response inspection**: inherited from cli-adapter's 011-R5 clause unchanged.
- **R6 — Folder filter is recursive at CLI; wrapper enforces non-recursive contract post-fetch**: F2 found `files folder=X` returns recursive subtree. Wrapper filters by component count. **THIS IS THE MOST CONSEQUENTIAL ARCHITECTURAL FINDING OF THE PLAN.**
- **R7 — Wrapper does NOT delegate to CLI's `total` flag**: F12 found CLI's `total` is recursive, incompatible with FR-007 + SC-005's identical-count-across-modes requirement. Wrapper applies same fetch + filter pipeline in both modes; on `total: true`, `paths` set to `[]`.
- **R8 — Sort algorithm**: UTF-8 byte-compare via `Buffer.compare`. Differs from JavaScript default UTF-16 code-unit compare only for non-BMP characters.
- **R9 — Filter pipeline order is observably commutative**: implementation orders cheapest-rejecting first, but result is identical regardless of order.
- **R10 — Ext filter delegated to CLI**: CLI handles `md` vs `.md` (F7), case-sensitively (F8); wrapper passes through verbatim.
- **R11 — Output schema**: `{ count, paths }` strict, two fields.
- **R12 — Don't amend predecessor specs**: research.md is source of record for plan-stage findings.
- **R13 — Test seams: ONE spawn per request**: handler tests assert `spawnFn.callCount === 1` per request.
- **R14 — Path-traversal handled at CLI layer**: F15 / F16 / F17 confirm. FR-016 satisfied natively.
- **R15 — Empty-string `folder` / `ext` rejected at schema**: `z.string().min(1).optional()`. Tighter contract; rejects an almost-certainly-buggy caller shape.
- **R16 — Stdout parsing**: line-split + trim + filter-empty. Total over any string.

**Plan-stage status**: all 16 design decisions ratified. 18 of 21 FR-023 cases verified live during plan (F1–F20 in research.md). THREE deferred to T0 of `/speckit-implement` and bundled into a `T0xx` task at /speckit-tasks time: emoji / non-ASCII / whitespace fixture pass; active-mode-no-focused-vault probe; synthetic 200K-file output-cap fixture.

## Phase 1: Design Artifacts

Generated in this command run:

- **[research.md](./research.md)** — design decisions R1–R16 + plan-stage live-CLI findings F1–F20 + Phase 0 amendment record per R12 + FR-023 characterisation roster coverage table.
- **[data-model.md](./data-model.md)** — input/output schema shapes, per-mode CLI argv-mapping table, filter pipeline diagrams, per-tool invariants ↔ FR mapping, module layout LOC budget, test inventory (51 cases — 18 schema / 28 handler / 5 registration).
- **[contracts/list-files-input.contract.md](./contracts/list-files-input.contract.md)** — public input contract: zod schema, emitted JSON Schema shape, field-by-field rules, six worked examples (one per distinct input shape), validation failure roster (11 cases), downstream failure roster (7 cases).
- **[contracts/list-files-handler.contract.md](./contracts/list-files-handler.contract.md)** — handler invariants: deps shape, single-spawn invariant (R13), the argv shape table (exhaustive across all valid input combinations), the filter pipeline contract (R6 / R9), the sort algorithm (R8), helper-function contracts (parseStdout, isFolderEntry, hasDotPrefixedComponent, isDirectChildOfFolder), failure propagation chain (with diagram), test-seam pattern with synthetic-stdout fixtures for defence-in-depth filter coverage.
- **[quickstart.md](./quickstart.md)** — 22 verification scenarios (S-1..S-22) mapped 1:1 to SC-001..SC-022 + three manual T0 scenarios (M-1..M-3) for live-CLI characterisation gaps deferred from plan stage.
- **CLAUDE.md plan-pointer update** — the plan reference is updated to point at this plan file (Phase 1 step 3).

## Constitution Re-Check (Post-Design)

| Principle | Compliance | Notes |
|---|---|---|
| I. Modular Code Organization | ✅ PASS | Phase 1 confirmed the per-surface layout. The optional folder-scoped target-mode helper is a peer primitive in `src/target-mode/`, NOT a cross-tool import; if added it preserves the existing downward-flow chain. The single-spawn architecture (R13) is internal to `handler.ts`; doesn't change the import topology. |
| II. Public Surface Test Coverage | ✅ PASS | Test-set inventory frozen at 51 cases (18 schema / 28 handler / 5 registration). Drift detector auto-covers. Every handler test asserts the single-spawn invariant. The defence-in-depth filter tests (FR-026 / FR-028) use synthetic stdout because the live CLI does NOT currently produce shapes that trigger them — the unit suite is the contract enforcement. |
| III. Boundary Input Validation with Zod | ✅ PASS | Output schema also zod-derived per FR-009. No discriminator on output (both `total` branches share shape). `folder` and `ext` are `z.string().min(1).optional()` per R15; `total` is `z.boolean().optional()`. The folder-scoped target-mode refinement (whichever variant lands) enforces the file/path-forbidden rule in BOTH modes plus the standard vault-required-in-specific / vault-forbidden-in-active rules. |
| IV. Explicit Upstream Error Propagation | ✅ PASS | Zero new codes confirmed. R5 inherits the 011-R5 cli-adapter response-inspection clause without modification. R14 confirms CLI handles path-traversal natively (F15 / F16 / F17). The active-mode no-focused-vault case maps to `ERR_NO_ACTIVE_FILE` (or `CLI_REPORTED_ERROR`) per the CLI's actual output shape (T0 verifies). Output-cap exceeded → `CLI_NON_ZERO_EXIT` per the cap-exceeded kill path. |
| V. Attribution & Layered Composition | ✅ PASS | All six new source files carry the `// Original — no upstream.` header. No upstream code lifted. The R6 non-recursive filter, the R7 total-true-no-CLI-delegation architecture, the R8 UTF-8 byte-compare sort, and the R9 filter pipeline are all original wrapper logic; not derived from any external project. If the optional folder-scoped helper lands in `src/target-mode/`, it carries the same `Original — no upstream.` header. |

**No Complexity Tracking entries.** No deviations.

## Complexity Tracking

> **No deviations from constitution.** All five principles evaluate as `Y` for this feature. No `N` entries; no Complexity Tracking entries needed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | (n/a)      | (n/a)                               |

## Reporting

- **Branch**: `019-list-files`
- **Plan path**: `specs/019-list-files/plan.md`
- **Generated artifacts**:
  - `specs/019-list-files/research.md` — design decisions R1–R16 + plan-stage live-CLI findings F1–F20 + Plan-amendments 1+2
  - `specs/019-list-files/data-model.md` — schema shapes, per-mode argv-mapping table, filter pipeline, test inventory (51 cases)
  - `specs/019-list-files/contracts/list-files-input.contract.md` — public input contract
  - `specs/019-list-files/contracts/list-files-handler.contract.md` — handler invariants
  - `specs/019-list-files/quickstart.md` — 22 verification scenarios + 3 manual T0 scenarios
  - `CLAUDE.md` — plan reference updated (Phase 1 step 3)
- **Plan-stage spec amendments** (documented in research.md per R12; NOT applied to spec.md):
  - Plan-amendment-1 — SC-012 weakening (`total: true` is NOT a cap-evasion path; both modes face same output cap). Surface as Known Limitation in `docs/tools/list_files.md`.
  - Plan-amendment-2 — FR-026 / FR-028 are defence-in-depth, not load-bearing (CLI already filters dotfiles and never emits sub-folder entries; unit suite uses synthetic stdout to exercise these filters).
- **Plan-stage live-CLI characterisation status**:
  - 18 of 21 FR-023 cases verified live during plan (F1–F20 in research.md)
  - 3 cases deferred to T0 of `/speckit-implement` and bundled into a single `T0xx` task: emoji / non-ASCII / whitespace fixture pass; active-mode-no-focused-vault probe; synthetic 200K-file output-cap fixture
- **Plan-stage probe residue surfaced to user**: NONE. All plan-stage probes were READ-ONLY against the test vault. No fixtures created; no cleanup required.
- **Next command**: `/speckit-tasks` — produces `tasks.md` with dependency-ordered, atomic tasks (T001..TNNN) per the established convention.
