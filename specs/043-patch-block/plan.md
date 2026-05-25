# Implementation Plan: Patch Block

**Branch**: `043-patch-block` | **Date**: 2026-05-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/043-patch-block/spec.md`

## Summary

Add a typed MCP tool `patch_block` that surgically replaces the body content tied to a specific `^block-id` block-reference marker inside a markdown note, leaving the marker itself byte-stable and every byte outside the targeted block unchanged. Single placement mode — `replace`. Three block shapes covered: paragraph (marker trailing on the paragraph's final line), list item (marker trailing on the item's line), and separately-placed-marker shapes (table / callout / blockquote / indented-code; marker line immediately following the block). The wrapper performs fs read-modify-write through the existing reliable-writer substrate (ADR-009): vault-registry resolution, two-layer path safety, atomic write-temp-then-rename. Block-id resolution uses a fresh in-tree scanner (`block-scan.ts`) that walks the note line-by-line, tracks fenced-code opacity, classifies each `^block-id` marker by block shape, and detects markers attached to heading lines (ATX + setext). First-match-wins on duplicate ids per FR-002a — cohort parity with `patch_heading` FR-006. Errors surface through `UpstreamError` with the existing `CLI_REPORTED_ERROR` / `VALIDATION_ERROR` / `PATH_ESCAPES_VAULT` / `FS_WRITE_FAILED` / `ERR_NO_ACTIVE_FILE` top-level codes; new states (`BLOCK_NOT_FOUND`, `BLOCK_ON_HEADING`, `INVALID_BLOCK_ID`) surface via `details.code` sub-discrimination per ADR-015; `EXTERNAL_EDITOR_CONFLICT` reuses `patch_heading`'s sub-discriminator with the same `details.reason` enum. Constitution Principle IV streak preserved — count becomes eighteen tools after BI-043 ships.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode, `tsc --noEmit` clean)
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP transport), `zod` (boundary validation), `zod-to-json-schema` (MCP `inputSchema` publication via the centralised `registerTool` factory). No new runtime dependencies — block-id scanning is in-tree (well-under-150-LOC line-based scanner per the Dependencies rule's in-tree bias).
**Storage**: Vault filesystem — direct `fs` read-modify-write through `src/path-safety/` and `src/vault-registry/`. No upstream subcommand wraps `patch_block`; this is an fs-direct tool in the `write_note` / `patch_heading` lineage (ADR-009 substrate).
**Testing**: `vitest` with `@vitest/coverage-v8`; tests co-located as `*.test.ts` alongside source modules per Principle II.
**Target Platform**: Node.js >= 22.11 LTS; MCP server transport over stdio; cross-platform (Linux / macOS / Windows). The `EXTERNAL_EDITOR_CONFLICT` detection-capability caveat (FR-021) is inherited from `patch_heading` byte-stably: Windows surfaces sharing-violation errors on `fs.rename` / `fs.open` for files held by external editors with unsaved changes; Linux / macOS surface the condition only when the editor takes an exclusive flock.
**Project Type**: MCP server typed-tool wrapper using the project's direct-fs substrate (ADR-009 lineage; cohort precedents: `write_note`, `patch_heading`).
**Performance Goals**: Read + scan + write within the cohort's per-call budget (write_note's empirical p95 is ~10 ms for typical notes, dominated by the metadataCache-invalidation eval at ~150 ms). No streaming or chunked rewrites — whole-file read into memory, modified in memory, written back atomically.
**Constraints**: 1000 UTF-16 code-unit input cap on `block_id` (cohort parity with BI-033 / BI-038 / BI-039 / BI-040); zero new top-level error codes (Constitution Principle IV); no modifications to YAML frontmatter (FR-014); preserve note's existing line-ending and trailing-newline conventions (FR-012, FR-013); no creation of new `^block-id` markers (FR-015 — markers are emitted by `write_note` / `patch_heading` when writing surrounding content); markers inside fenced code blocks are content, NOT eligible targets (FR-011).
**Scale/Scope**: One new typed tool (`patch_block`), one new source-tree module (`src/tools/patch_block/`) with five production files (`index.ts` / `schema.ts` / `handler.ts` / `block-scan.ts` / `block-edit.ts`) and five co-located test files. One new `details.code` value with `details.reason` enumeration (`INVALID_BLOCK_ID` under `VALIDATION_ERROR`, four sub-reasons); two new single-state `details.code` values (`BLOCK_NOT_FOUND`, `BLOCK_ON_HEADING` under `CLI_REPORTED_ERROR`); two existing `details.code` values reused unchanged (`NOTE_NOT_FOUND` under `CLI_REPORTED_ERROR`; `EXTERNAL_EDITOR_CONFLICT` under `CLI_REPORTED_ERROR` with its `unsaved-changes` / `file-locked` `details.reason` enum inherited from BI-040); one existing top-level code reused unchanged (`ERR_NO_ACTIVE_FILE`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| Principle I (Modular Code Organization) | Y | New surface lives in its own `src/tools/patch_block/` module with per-surface layout (Principle I); imports flow tool → handler → (block-scan / block-edit / path-safety / vault-registry / fs); no upward or cyclic dependencies. The two internal helpers (`block-scan.ts` and `block-edit.ts`) live inside the tool's module — they are not pulled up to a shared location because they are the tool's own private concerns (block-scan's per-shape classification + block-on-heading detection belongs to this tool, not to a shared "markdown" helper; block-edit's per-shape surgery semantics likewise). Same pattern as `patch_heading/` (`heading-walk.ts` + `body-edit.ts` are private to that module). |
| Principle II (Public Surface Test Coverage) | Y | `patch_block` is a publicly-registered MCP tool; ships with happy-path `handler.test.ts` (replace against three block shapes — paragraph, list item with sibling items, table; plus callout / blockquote / indented-code variants; plus empty-content `replace` per FR-008a/cohort parity with patch_heading FR-018a's replace-empty acceptance; plus byte-stability assertions for surrounding content) AND failure-or-boundary tests (BLOCK_NOT_FOUND for missing-id + for marker-inside-fenced-code; BLOCK_ON_HEADING for ATX + setext heading shapes; INVALID_BLOCK_ID for each of four `details.reason` sub-states; EXTERNAL_EDITOR_CONFLICT simulated by mocking `fs.rename` to throw EBUSY; PATH_ESCAPES_VAULT for symlink-escape; NOTE_NOT_FOUND for non-existent path; ERR_NO_ACTIVE_FILE for active mode with no focused file; first-match-wins on duplicate `^foo` markers in the same note); plus schema-shape tests in `schema.test.ts`, registration smoke test in `index.test.ts`, and dedicated helper tests in `block-scan.test.ts` (line-by-line scan, fenced-code opacity, per-shape classification, ATX + setext heading-line classification, first-match-wins, marker-position invariant per shape) and `block-edit.test.ts` (per-shape surgery byte-stability, trailing-newline preservation, line-ending preservation, marker-position invariant, empty replacement). |
| Principle III (Boundary Input Validation with Zod) | Y | Single zod input schema is the source of truth for both the published MCP `inputSchema` (via `registerTool`'s `zodToJsonSchema` step) and the runtime parse; downstream `executePatchBlock` consumes `z.infer<typeof patchBlockInputSchema>` directly; no hand-rolled `typeof` chains at the boundary. `block_id` validation (FR-019 sub-states: `empty`, `contains-invalid-chars`, `leading-caret`, `too-long`) lives in the schema layer via Zod refinements with the alphanumeric+hyphen regex. The `target_mode` discriminator reuses the existing `applyTargetModeRefinement` + `targetModeBaseSchema` (cohort parity with `write_note`, `find_and_replace`, `patch_heading`). |
| Principle IV (Explicit Upstream Error Propagation) | Y | All failure paths route through `UpstreamError`; new states surface via `details.code` sub-discrimination per ADR-015 (no new top-level error codes — eighteen-tool zero-new-codes streak preserved after this BI); no silent catches, no empty-result-on-error fallbacks. `BLOCK_NOT_FOUND` and `BLOCK_ON_HEADING` are the two new single-state `details.code` values under `CLI_REPORTED_ERROR`; `INVALID_BLOCK_ID` is the new multi-state `details.code` under `VALIDATION_ERROR`. `NOTE_NOT_FOUND` (under `CLI_REPORTED_ERROR`) and `EXTERNAL_EDITOR_CONFLICT` (with its full `details.reason` enum) are reused unchanged from the read-side cohort and from BI-040 respectively. The "no focused note" condition (FR-006) reuses the existing top-level `ERR_NO_ACTIVE_FILE` code unchanged (cohort parity with `write_note` / `patch_heading` active-mode failures). |
| Principle V (Attribution & Layered Composition) | Y | All five source files (`index.ts`, `schema.ts`, `handler.ts`, `block-scan.ts`, `block-edit.ts`) carry the `// Original — no upstream.` header with one-line intent descriptions; README's Attributions section unchanged (no new upstream code lifted — the block-id scanner is a small in-tree implementation per the Dependencies rule's in-tree bias, structurally parallel to `patch_heading`'s `heading-walk.ts`). |
| ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand) | N/A | No upstream `note:patch-block` (or similar) subcommand exists. The wrapper implements block-body patching directly via fs read-modify-write — same lineage as `write_note` and `patch_heading` (both fs-direct under ADR-009 and N/A on ADR-010 for the same reason). Tool name `patch_block` follows the `verb_noun` cohort convention used by other fs-direct or non-mechanically-mapped tools (`patch_heading`, `find_by_property`, `find_and_replace`, `read_heading`). |
| ADR-013 (Plugin-Namespace Tool Naming Convention) | N/A | This BI wraps no plugin-exposed API. The tool operates directly on vault filesystem files; no plugin runtime dependency. |
| ADR-014 (Plugin-Backed Typed Tools Runtime-Dependency Pattern) | N/A | Same as ADR-013 — no plugin dependency, no `<PLUGIN>_NOT_INSTALLED` / `_NOT_READY` / `SOURCE_NOT_INDEXED` lifecycle states needed. |
| ADR-015 (Sub-Discriminators via `details.reason` for Multi-State Error Codes) | Y | One new multi-state `(top-level-code, details.code)` pair introduced, carrying a `details.reason` enumeration per ADR-015: `INVALID_BLOCK_ID` under `VALIDATION_ERROR` with four sub-reasons (`empty`, `contains-invalid-chars`, `leading-caret`, `too-long`) per FR-019. The two new single-state `details.code` values (`BLOCK_NOT_FOUND`, `BLOCK_ON_HEADING`) carry no `details.reason` since they have no sub-states. The reused `EXTERNAL_EDITOR_CONFLICT` continues to carry its existing two-sub-reason enum (`unsaved-changes`, `file-locked`) per BI-040's prior ADR-015 conformance — no change to that surface. |
| ADR-003 (Enforce Target Mode in Typed Tools) | Y | `patch_block` uses the existing `target_mode` discriminator via `applyTargetModeRefinement(targetModeBaseSchema.extend(...))`. Both `target_mode: "specific"` (with `vault` + `file`/`path`) and `target_mode: "active"` (focused-note locator) are supported per FR-005; cohort parity with `write_note`, `find_and_replace`, `patch_heading`, the read-side tools. |
| ADR-009 (Direct Filesystem Write Path Alongside CLI Bridge) | Y | This BI extends the ADR-009 substrate's fs-direct write surface to a new operation (block-body patching). Reuses the lazy vault registry, two-layer path safety, atomic write-temp-then-rename, and post-write `metadataCache` invalidation eval. The active-mode pre-write `eval` for focused-file path resolution is byte-stable with `write_note`'s and `patch_heading`'s implementations. |

All Y or N/A. No N. No Complexity Tracking entry required.

## Project Structure

### Documentation (this feature)

```text
specs/043-patch-block/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 — resolved unknowns + block-id alphabet / per-shape surgery / fenced-code opacity / first-match-wins decisions
├── data-model.md        # Phase 1 — input schema, output envelope, error states, block-scan algorithm
├── quickstart.md        # Phase 1 — usage examples (replace happy paths × 3 block shapes + each error mode)
├── contracts/
│   ├── input.schema.json    # Phase 1 — published MCP inputSchema (JSON Schema form)
│   ├── output.schema.json   # Phase 1 — success envelope JSON Schema
│   └── errors.md            # Phase 1 — error code + sub-discriminator map
└── checklists/
    └── requirements.md  # /speckit-specify quality checklist (settled by /speckit-clarify Session 2026-05-25)
```

### Source Code (repository root)

```text
src/
├── tools/
│   └── patch_block/
│       ├── index.ts              # Tool registration + description string + createPatchBlockTool factory
│       ├── schema.ts             # zod input + output schemas; block_id alphanumeric+hyphen refinement (FR-004); target_mode wiring
│       ├── handler.ts            # executePatchBlock: resolve target_mode → vault → path safety → read → scan → first-match → block-on-heading reject → block-edit → atomic write → invalidate cache
│       ├── block-scan.ts         # Pure: line-by-line markdown scan; fenced-code opacity tracking; per-line `^block-id` detection with shape classification (paragraph | list-item | separately-placed | on-heading-ATX | on-heading-setext); first-match-wins on duplicate ids
│       ├── block-edit.ts         # Pure: per-shape surgery — paragraph/list-item detach-token + body-swap + re-attach-token; separately-placed preserve-marker-line + body-swap; preserves line-ending + trailing-newline conventions; preserves marker byte-position relative to block per FR-008 / FR-009 / FR-010
│       ├── index.test.ts         # Registration smoke test (name, schema published, deps wiring)
│       ├── schema.test.ts        # Input-validation tests (4 INVALID_BLOCK_ID sub-states, target_mode interaction)
│       ├── handler.test.ts       # Behaviour tests against fs mocks (happy paths × 3 block shapes × empty-content acceptance per FR-008a-equivalent; BLOCK_NOT_FOUND for missing-id + for marker-inside-fenced-code; BLOCK_ON_HEADING for ATX + setext; EXTERNAL_EDITOR_CONFLICT via mocked EBUSY; PATH_ESCAPES_VAULT; NOTE_NOT_FOUND; ERR_NO_ACTIVE_FILE; first-match-wins on duplicate `^foo` markers)
│       ├── block-scan.test.ts    # Pure-function tests: line-scan, fenced-code opacity (markers inside fences are content), per-shape classification (paragraph / list-item / table / callout / blockquote / indented-code / on-heading-ATX / on-heading-setext), first-match-wins on duplicate siblings, alphanumeric+hyphen alphabet, marker-position invariant per shape
│       └── block-edit.test.ts    # Pure-function tests: each block shape × byte-stable surgery; line-ending preservation; trailing-newline preservation; marker re-attachment byte-position invariant; empty replacement acceptance; multi-line content into single-line shape (accepted per Assumptions — caller responsibility)
│
├── tools/_register.ts            # No edits — patch_block registers through the existing centralised factory
├── tools/_register-baseline.json # 1-entry addition — registry-stability baseline fixture (BI-031 / FR-018)
├── path-safety/path-safety.ts    # No edits — reused unchanged for both layers
├── vault-registry/               # No edits — reused unchanged
├── cli-adapter/cli-adapter.ts    # No edits — only consumed by the small active-mode pre-write eval (focused-file resolution) and the post-write metadataCache invalidation eval, both reused byte-stably from write_note / patch_heading patterns
├── errors.ts                     # No edits — UpstreamError already carries `code` / `details.code` / `details.reason` per ADR-015
└── server.ts                     # 1-line import + 1-line factory call in the existing tool-registration block (cohort precedent — 27 prior tools follow this pattern)
```

**Structure Decision**: Single project, per-surface module at `src/tools/patch_block/` per Principle I. The module follows the five-file shape (`{index, schema, handler}.ts` + two helpers) precedented by `patch_heading/` because block patching has two pure helpers (`block-scan.ts` for line-by-line resolution + per-shape classification + block-on-heading detection + first-match-wins, `block-edit.ts` for per-shape byte-stable surgery) that are this tool's own concerns — neither helper has a re-use case in another tool and both deserve dedicated unit tests. Precedent: `patch_heading/` ships the same five-file shape with `heading-walk.ts` + `body-edit.ts`; `find_and_replace/` ships a six-file shape (`fence-scan.ts` + `region-scan.ts` + `replace.ts`). The new tool wires into the boot spine at `src/server.ts` via the standard one-line import + one-line factory call (cohort precedent — 27 prior tools follow this pattern). The `_register-baseline.json` fixture gets a one-entry append. All existing infrastructure (`invokeCli` for the small active-mode pre-write eval and the metadataCache-invalidation post-write eval, `vault-registry/`, `path-safety/`, `target-mode/`, `UpstreamError`) is consumed unchanged.

## Complexity Tracking

No constitution violations to track. All eleven gates above resolve to Y or N/A; no Complexity Tracking entry required.
