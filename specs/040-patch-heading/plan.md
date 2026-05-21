# Implementation Plan: Patch Heading

**Branch**: `040-patch-heading` | **Date**: 2026-05-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/040-patch-heading/spec.md`

## Summary

Add a typed MCP tool `patch_heading` that surgically rewrites the body under a specific heading inside a markdown note, identified by its full hierarchical path through the note's heading hierarchy. Three placement modes — `append`, `prepend`, `replace` — produce mode-dependent body semantics: `append` extends the heading's full reach (through child-heading subtrees, up to the next equal-or-higher-rank heading or EOF); `prepend` lands immediately after the heading marker line; `replace` swaps the direct body only and preserves child-heading subtrees. The wrapper performs fs read-modify-write through the existing reliable-writer substrate (ADR-009): vault-registry resolution, two-layer path safety, atomic write-temp-then-rename. Path resolution uses `#` as the segment separator (cohort parity with Obsidian wikilink anchors) and is re-walked pre-write to detect heading-text races (FR-019). Errors surface through `UpstreamError` with the existing `CLI_REPORTED_ERROR` / `VALIDATION_ERROR` / `PATH_ESCAPES_VAULT` / `FS_WRITE_FAILED` / `ERR_NO_ACTIVE_FILE` top-level codes; new states (`HEADING_NOT_FOUND`, `HEADING_RACE`, `EXTERNAL_EDITOR_CONFLICT`, `INVALID_HEADING_PATH`, `EMPTY_CONTENT`) surface via `details.code` sub-discrimination per ADR-015. Constitution Principle IV streak preserved — count becomes seventeen tools after BI-040 ships.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode, `tsc --noEmit` clean)
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP transport), `zod` (boundary validation), `zod-to-json-schema` (MCP `inputSchema` publication via the centralised `registerTool` factory). No new runtime dependencies — markdown heading parsing is in-tree (well-under-150-LOC ATX heading scanner per the Dependencies rule's in-tree bias).
**Storage**: Vault filesystem — direct `fs` read-modify-write through `src/path-safety/` and `src/vault-registry/`. No upstream subcommand wraps `patch_heading`; this is an fs-direct tool in the `write_note` lineage (ADR-009 substrate).
**Testing**: `vitest` with `@vitest/coverage-v8`; tests co-located as `*.test.ts` alongside source modules per Principle II.
**Target Platform**: Node.js >= 22.11 LTS; MCP server transport over stdio; cross-platform (Linux / macOS / Windows). The FR-021 `EXTERNAL_EDITOR_CONFLICT` detection-capability caveat applies: Windows surfaces sharing-violation errors on `fs.rename` / `fs.open` for files held by external editors with unsaved changes; Linux / macOS surface the condition only when the editor takes an exclusive flock.
**Project Type**: MCP server typed-tool wrapper using the project's direct-fs substrate (ADR-009 lineage; cohort precedent: `write_note`).
**Performance Goals**: Read + parse + write within the cohort's per-call budget (write_note's empirical p95 is ~10 ms for typical notes, dominated by the metadataCache-invalidation eval at ~150 ms). No streaming or chunked rewrites (FR-025) — whole-file read into memory, modified in memory, written back atomically.
**Constraints**: 1000 UTF-16 code-unit input cap on `heading_path` (cohort parity with BI-033 / BI-038 / BI-039); zero new top-level error codes (Constitution Principle IV); no modifications to YAML frontmatter (FR-016); preserve note's existing line-ending and trailing-newline conventions (FR-014, FR-015).
**Scale/Scope**: One new typed tool (`patch_heading`), one new source-tree module (`src/tools/patch_heading/`) with five production files (`index.ts` / `schema.ts` / `handler.ts` / `heading-walk.ts` / `body-edit.ts`) and five co-located test files. Five new `details.code` sub-discriminators across two existing top-level codes; one existing top-level code reused unchanged (`ERR_NO_ACTIVE_FILE`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| Principle I (Modular Code Organization) | Y | New surface lives in its own `src/tools/patch_heading/` module with per-surface layout (Principle I); imports flow tool → handler → (heading-walk / body-edit / path-safety / vault-registry / fs); no upward or cyclic dependencies. The two internal helpers (`heading-walk.ts` and `body-edit.ts`) live inside the tool's module — they are not pulled up to a shared location because they are the tool's own private concerns (heading-walk's path-re-walk semantics belong to this tool, not to a shared "markdown" helper). |
| Principle II (Public Surface Test Coverage) | Y | `patch_heading` is a publicly-registered MCP tool; ships with happy-path `handler.test.ts` (append / prepend / replace, each against multiple body shapes — empty body, body-with-child-subtree, body-with-fenced-code, last-heading-in-note, ATX rank 1 / 2 / 6) AND failure-or-boundary tests (HEADING_NOT_FOUND, INVALID_HEADING_PATH for each of five `details.reason` sub-states, HEADING_RACE simulated by injecting a heading rename between resolve and pre-write re-walk, EXTERNAL_EDITOR_CONFLICT simulated by mocking `fs.rename` to throw EBUSY, EMPTY_CONTENT for `append` and `prepend`, PATH_ESCAPES_VAULT for symlink-escape, ERR_NO_ACTIVE_FILE for active mode with no focused file); plus schema-shape tests in `schema.test.ts`, registration smoke test in `index.test.ts`, and dedicated helper tests in `heading-walk.test.ts` (segment parsing, walk algorithm, fenced-code opacity, ATX-only contract) and `body-edit.test.ts` (each placement mode's byte-stable boundary handling, trailing-newline preservation, line-ending preservation). |
| Principle III (Boundary Input Validation with Zod) | Y | Single zod input schema is the source of truth for both the published MCP `inputSchema` (via `registerTool`'s `zodToJsonSchema` step) and the runtime parse; downstream `executePatchHeading` consumes `z.infer<typeof patchHeadingInputSchema>` directly; no hand-rolled `typeof` chains at the boundary. `heading_path` validation (FR-018 sub-states) lives in the schema layer via Zod refinements; `content` empty-mode validation (FR-018a) lives in a `superRefine` that has access to both `mode` and `content`. The `target_mode` discriminator reuses the existing `applyTargetModeRefinement` + `targetModeBaseSchema` (cohort parity with `write_note`, `find_and_replace`). |
| Principle IV (Explicit Upstream Error Propagation) | Y | All failure paths route through `UpstreamError`; new states surface via `details.code` sub-discrimination per ADR-015 (no new top-level error codes — seventeen-tool zero-new-codes streak preserved after this BI); no silent catches, no empty-result-on-error fallbacks. `HEADING_RACE` and `EXTERNAL_EDITOR_CONFLICT` are the two new `details.code` values under `CLI_REPORTED_ERROR`; `HEADING_NOT_FOUND` is also a new `details.code` under `CLI_REPORTED_ERROR`; `INVALID_HEADING_PATH` and `EMPTY_CONTENT` are new `details.code` values under `VALIDATION_ERROR`. The "no focused note" condition (FR-008) reuses the existing top-level `ERR_NO_ACTIVE_FILE` code unchanged (cohort parity with `write_note`'s active-mode failure). |
| Principle V (Attribution & Layered Composition) | Y | All five source files (`index.ts`, `schema.ts`, `handler.ts`, `heading-walk.ts`, `body-edit.ts`) carry the `// Original — no upstream.` header with one-line intent descriptions; README's Attributions section unchanged (no new upstream code lifted — the ATX heading scanner is a small in-tree implementation per the Dependencies rule's in-tree bias). |
| ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand) | N/A | No upstream `note:patch` (or similar) subcommand exists. The wrapper implements heading-patching directly via fs read-modify-write — same lineage as `write_note` (which is also fs-direct under ADR-009 and is N/A on ADR-010 for the same reason). Tool name `patch_heading` follows the `verb_noun` cohort convention used by other fs-direct or non-mechanically-mapped tools (`find_by_property`, `find_and_replace`, `read_heading`). |
| ADR-013 (Plugin-Namespace Tool Naming Convention) | N/A | This BI wraps no plugin-exposed API. The tool operates directly on vault filesystem files; no plugin runtime dependency. |
| ADR-014 (Plugin-Backed Typed Tools Runtime-Dependency Pattern) | N/A | Same as ADR-013 — no plugin dependency, no `<PLUGIN>_NOT_INSTALLED` / `_NOT_READY` / `SOURCE_NOT_INDEXED` lifecycle states needed. |
| ADR-015 (Sub-Discriminators via `details.reason` for Multi-State Error Codes) | Y | Three new multi-state `(top-level-code, details.code)` pairs introduced, all carrying `details.reason` enumerations per ADR-015: (1) `INVALID_HEADING_PATH` under `VALIDATION_ERROR` with five sub-reasons (`empty`, `empty-segment`, `contains-hash`, `single-segment`, `too-long`) per FR-018; (2) `EMPTY_CONTENT` under `VALIDATION_ERROR` with two sub-reasons (`append`, `prepend`) per FR-018a; (3) `EXTERNAL_EDITOR_CONFLICT` under `CLI_REPORTED_ERROR` with two sub-reasons (`unsaved-changes`, `file-locked`) per FR-021. The two single-state new `details.code` values (`HEADING_NOT_FOUND`, `HEADING_RACE`) carry no `details.reason` since they have no sub-states. |
| ADR-003 (Enforce Target Mode in Typed Tools) | Y | `patch_heading` uses the existing `target_mode` discriminator via `applyTargetModeRefinement(targetModeBaseSchema.extend(...))`. Both `target_mode: "specific"` (with `vault` + `file`/`path`) and `target_mode: "active"` (focused-note locator) are supported per FR-007; cohort parity with `write_note`, `find_and_replace`, the read-side tools. |
| ADR-009 (Direct Filesystem Write Path Alongside CLI Bridge) | Y | This BI extends the ADR-009 substrate's fs-direct write surface to a new operation (heading-body patching). Reuses the lazy vault registry, two-layer path safety, atomic write-temp-then-rename, and post-write `metadataCache` invalidation eval. The active-mode pre-write `eval` for focused-file path resolution is byte-stable with `write_note`'s implementation. |

All Y or N/A. No N. No Complexity Tracking entry required.

## Project Structure

### Documentation (this feature)

```text
specs/040-patch-heading/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 — resolved unknowns + ATX-only / fenced-code / heading-walk decisions
├── data-model.md        # Phase 1 — input schema, output envelope, error states, walk algorithm
├── quickstart.md        # Phase 1 — usage examples (append / prepend / replace happy paths + each error mode)
├── contracts/
│   ├── input.schema.json    # Phase 1 — published MCP inputSchema (JSON Schema form)
│   ├── output.schema.json   # Phase 1 — success envelope JSON Schema
│   └── errors.md            # Phase 1 — error code + sub-discriminator map
└── checklists/
    └── requirements.md  # /speckit-specify quality checklist (Session 2026-05-21)
```

### Source Code (repository root)

```text
src/
├── tools/
│   └── patch_heading/
│       ├── index.ts              # Tool registration + description string + createPatchHeadingTool factory
│       ├── schema.ts             # zod input + output schemas; heading_path / content refinements; target_mode wiring
│       ├── handler.ts            # executePatchHeading: resolve target_mode → vault → path safety → read → walk → race-check → edit → atomic write → invalidate cache
│       ├── heading-walk.ts       # Pure: ATX heading scanner + path-segment splitter + walk-by-path + fenced-code opacity; race-detection identity primitive (heading marker line text + rank + parent-chain text)
│       ├── body-edit.ts          # Pure: append / prepend / replace byte-stable splice over (lines, boundaries) given a resolved heading and its reach; preserves line-ending + trailing-newline conventions
│       ├── index.test.ts         # Registration smoke test (name, schema published, deps wiring)
│       ├── schema.test.ts        # Input-validation tests (5 INVALID_HEADING_PATH sub-states, EMPTY_CONTENT per mode, target_mode interaction)
│       ├── handler.test.ts       # Behaviour tests against fs mocks (happy paths × 3 modes × multiple body shapes; HEADING_NOT_FOUND; HEADING_RACE via injected pre-write rename; EXTERNAL_EDITOR_CONFLICT via mocked EBUSY; PATH_ESCAPES_VAULT; ERR_NO_ACTIVE_FILE)
│       ├── heading-walk.test.ts  # Pure-function tests: ATX scan, fenced-code opacity, segment-split, walk-by-path, race-identity comparator, first-match-wins on duplicate siblings
│       └── body-edit.test.ts     # Pure-function tests: each placement mode × multiple boundary shapes; line-ending preservation; trailing-newline preservation; replace preserves child-heading subtree
│
├── tools/_register.ts            # No edits — patch_heading registers through the existing centralised factory
├── tools/_register-baseline.json # 1-entry addition — registry-stability baseline fixture (BI-031 / FR-018)
├── path-safety/path-safety.ts    # No edits — reused unchanged for both layers
├── vault-registry/               # No edits — reused unchanged
├── cli-adapter/cli-adapter.ts    # No edits — only consumed by the small active-mode pre-write eval (focused-file resolution) and the post-write metadataCache invalidation eval, both reused byte-stably from write_note's pattern
├── errors.ts                     # No edits — UpstreamError already carries `code` / `details.code` / `details.reason` per ADR-015
└── server.ts                     # 1-line import + 1-line factory call in the existing tool-registration block (cohort precedent — 26 prior tools follow this pattern)
```

**Structure Decision**: Single project, per-surface module at `src/tools/patch_heading/` per Principle I. The module is larger than the cohort's typical `{index, schema, handler}.ts` triplet because heading patching has two pure helpers (`heading-walk.ts` for path resolution + race-identity, `body-edit.ts` for mode-dependent byte-stable splicing) that are this tool's own concerns — neither helper has a re-use case in another tool and both deserve dedicated unit tests. Precedent: `find_and_replace/` already splits into `index` / `schema` / `handler` / `fence-scan` / `region-scan` / `replace` (six files), so the five-file shape here is squarely within the project's per-surface module-size norm. The new tool wires into the boot spine at `src/server.ts` via the standard one-line import + one-line factory call (cohort precedent — 26 prior tools follow this pattern). The `_register-baseline.json` fixture gets a one-entry append. All existing infrastructure (`invokeCli` for the small active-mode pre-write eval and the metadataCache-invalidation post-write eval, `vault-registry/`, `path-safety/`, `target-mode/`, `UpstreamError`) is consumed unchanged.

## Complexity Tracking

No constitution violations to track. All ten gates above resolve to Y or N/A; no Complexity Tracking entry required.
