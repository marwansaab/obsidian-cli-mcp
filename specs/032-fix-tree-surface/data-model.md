# Phase 1 Data Model — Fix Tree Tool Surface

**Feature**: 032-fix-tree-surface | **Date**: 2026-05-15

The BI does not introduce new data types or modify the output schema. The "data model" delta is confined to two surfaces: the published input-schema shape and the registered tool descriptor (name + description). This document records the before/after of each plus the edit-surface inventory and the LOC budget.

## Surface 1 — `pathsInputSchema` (renamed from `treeInputSchema`)

### Before (`src/tools/tree/schema.ts` lines 9-16 at v0.5.7)

```typescript
export const treeInputSchema = applyTargetModeRefinementForFolderScoped(
  targetModeBaseSchema.extend({
    folder: z.string().min(1).optional(),
    depth: z.number().int().positive().optional(),
    ext: z.string().min(1).optional(),
    total: z.boolean().optional(),
  }),
);
```

Published `inputSchema.properties` keys (eight): `target_mode`, `vault`, `file`, `path`, `folder`, `depth`, `ext`, `total`. The two extras (`file`, `path`) leak through from the unomitted `targetModeBaseSchema`; runtime rejects them via `applyTargetModeRefinementForFolderScoped`'s `superRefine` block but the JSON Schema emitter does not see the refinement.

### After (`src/tools/paths/schema.ts` lines 9-16 post-edit)

```typescript
export const pathsInputSchema = applyTargetModeRefinementForFolderScoped(
  targetModeBaseSchema.omit({ file: true, path: true }).extend({
    folder: z.string().min(1).optional(),
    depth: z.number().int().positive().optional(),
    ext: z.string().min(1).optional(),
    total: z.boolean().optional(),
  }),
);
```

Published `inputSchema.properties` keys (six): `target_mode`, `vault`, `folder`, `depth`, `ext`, `total`. The `.omit({ file: true, path: true })` chain removes the two leaked fields BEFORE `.extend(…)` adds the folder-scoped ones. Because `targetModeBaseSchema` is `.strict()`, an input that includes `file` or `path` now fails at strict parse with `code: "unrecognized_keys"` BEFORE the `superRefine` block runs — matching the FR-002 / SC-006 transition (the runtime-refinement message becomes the dead-code path for the `paths` tool).

### Field policy (post-edit, exhaustive)

| Field | Type | Optional | Constraint | Notes |
|-------|------|----------|------------|-------|
| `target_mode` | `z.enum(["specific", "active"])` | Required | exhaustive enum | unchanged from v0.5.7 |
| `vault` | `z.string().min(1).optional()` | Optional in `active`; required in `specific` (refined) | min 1 char | unchanged; refinement helper enforces specific-requires / active-forbids |
| `folder` | `z.string().min(1).optional()` | Optional | min 1 char | unchanged from v0.5.7 |
| `depth` | `z.number().int().positive().optional()` | Optional | positive integer | unchanged |
| `ext` | `z.string().min(1).optional()` | Optional | min 1 char | unchanged |
| `total` | `z.boolean().optional()` | Optional | — | unchanged |
| ~~`file`~~ | ~~`z.string().optional()`~~ | ~~Refinement-rejected~~ | — | **REMOVED** post-edit; absent from published schema |
| ~~`path`~~ | ~~`z.string().optional()`~~ | ~~Refinement-rejected~~ | — | **REMOVED** post-edit; absent from published schema |

## Surface 2 — `pathsOutputSchema` (renamed from `treeOutputSchema`)

### Before AND after (no shape change per FR-016 byte-stability)

```typescript
export const pathsOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    paths: z.array(z.string()),
  })
  .strict();
```

The only delta is the export symbol's name (`treeOutputSchema` → `pathsOutputSchema`). The shape is byte-stable. The eval-envelope discriminated-union schema (`treeEvalEnvelopeSchema` → `pathsEvalEnvelopeSchema`) is similarly symbol-renamed only.

## Surface 3 — Registered descriptor (name + description)

### Before (v0.5.7)

| Field | Value |
|---|---|
| `name` | `"tree"` |
| `description` | ~2 600-character string containing FR-NNN codes, BI-NNN references, ordinal phrase "Fifteenth typed-tool wrap", internal module name `_eval-vault-closed-detection`, full per-parameter implementation details, and a terminal `help` pointer with `tool_name: "tree"`. |
| `inputSchema` | Derived from `treeInputSchema`; emits 8-key `properties` object. |

### After (post-edit)

| Field | Value |
|---|---|
| `name` | `"paths"` |
| `description` | ≤ 512-character string structured per R8 (opening flat-output sentence + trailing-slash note + 6-parameter summary + standard help pointer). Contains zero matches against the FR-005 regex set; zero literal matches against FR-007 substrings; opens with a sentence naming the output shape and characterising `paths` as flat (per FR-008 / SC-004). |
| `inputSchema` | Derived from `pathsInputSchema`; emits 6-key `properties` object. |

## Edit-surface inventory (exhaustive)

Source files RENAMED via directory-level `git mv src/tools/tree src/tools/paths`:

| Path (post-rename) | Pre-rename | Edit shape inside the file |
|---|---|---|
| `src/tools/paths/_template.ts` | `src/tools/tree/_template.ts` | Header comment narrates `paths` instead of `tree`; eval-template JS body BYTE-STABLE per FR-016 |
| `src/tools/paths/handler.ts` | `src/tools/tree/handler.ts` | Header comment; 3 log-message strings (`"tree:"` prefix → `"paths:"`); symbol-import renames (`treeEvalEnvelopeSchema` → `pathsEvalEnvelopeSchema`, etc., per R5); function name `executeTree` → `executePaths`; eval-template JS body BYTE-STABLE |
| `src/tools/paths/handler.test.ts` | `src/tools/tree/handler.test.ts` | Header comment; symbol-import renames; happy-path + failure-path test assertions byte-equivalent in coverage (assertions update the literal-name and constant-name references only) |
| `src/tools/paths/index.ts` | `src/tools/tree/index.ts` | Header comment; `TREE_TOOL_NAME` → `PATHS_TOOL_NAME`; `TREE_DESCRIPTION` → `PATHS_DESCRIPTION` (and the value rewritten to the ≤ 512-char string per R8); `createTreeTool` → `createPathsTool`; `executeTree` import → `executePaths` |
| `src/tools/paths/index.test.ts` | `src/tools/tree/index.test.ts` | Header comment; symbol-renames; name-string updates (`"tree"` → `"paths"`); the case (2) test's verbose description string and key-loop are updated to no longer mention `file`/`path` in the property set AND to add the absence-check (`expect(Object.hasOwn(props, "file")).toBe(false)`, same for `path`); the case (3) description-content assertions update `help({ tool_name: "tree" })` → `help({ tool_name: "paths" })`; the case (5) baseline assertion finds the entry by `name === "paths"` |
| `src/tools/paths/schema.ts` | `src/tools/tree/schema.ts` | Header comment; line 9-16 schema construction edited per R7 (insert `.omit({ file: true, path: true })`); symbol-renames (`treeInputSchema` → `pathsInputSchema`, etc.); TS type renames |
| `src/tools/paths/schema.test.ts` | `src/tools/tree/schema.test.ts` | Header comment; symbol-imports; the "file forbidden in specific mode" and "path forbidden" test assertions update to expect the strict-mode `code: "unrecognized_keys"` error rather than the refinement-layer message |

Docs file RENAMED via `git mv docs/tools/tree.md docs/tools/paths.md`:

| Path (post-rename) | Pre-rename | Edit shape inside the file |
|---|---|---|
| `docs/tools/paths.md` | `docs/tools/tree.md` | Top-level heading `# \`tree\`` → `# \`paths\``; nine occurrences of `"name": "tree"` inside JSON code blocks → `"name": "paths"`; bulk content (overview, worked examples, error roster, inherited-limitations list, parameter docs) byte-stable |

Files EDITED in place (no rename):

| Path | Edit shape |
|---|---|
| `src/server.ts` | Line 31 import path + factory-fn name; tools-array entry shifts alphabetically from between-`tag`-and-`write_note` to between-`outline`-and-`properties` |
| `src/server.test.ts` | Test name string updates `'tree'` → `'paths'` (one occurrence in the very long test name) AND the 19-tool names array reorders to drop `tree` and insert `paths` at its alphabetical position |
| `src/tools/_register-baseline.json` | Regenerated by `npm run baseline:write` — the `{name: "tree", ...}` entry at v0.5.7 position 22 is removed; a new `{name: "paths", ...}` entry is inserted alphabetically at position 13 (between `outline` and `properties`); all 18 other tools' fingerprints byte-stable |
| `.architecture/Obsidian CLI MCP - Architecture.md` | Each occurrence of the literal `tree` that names the tool (prose mentions like `the tree tool`, `tree's eval-driven cohort`) updated to `paths`; historical ordinal anchors ("the fifteenth typed-tool wrap") preserved |
| `package.json` | `"version": "0.5.8"` → `"version": "0.6.0"` (MINOR per R2) |

Files UNCHANGED (load-bearing absence of edit):

| Path | Why unchanged |
|---|---|
| `src/target-mode/target-mode.ts` | The refinement helper `applyTargetModeRefinementForFolderScoped` stays byte-stable per spec clarify decision and SC-011 (sibling-tool no-regress) |
| `src/tools/files/` | OUT OF SCOPE per user; sibling-tool schema and behaviour byte-stable |
| All other `src/tools/<name>/` directories | Not affected by the `tree` → `paths` rename |
| `src/cli-adapter/*` | The 008-refactor frozen-surface invariant (cli-adapter unchanged) |
| `src/tools/_register*.ts` (except the JSON) | The BI-022 baseline machinery is consumed without modification |
| `src/tools/_eval-vault-closed-detection/*` | Cross-cutting shared module unchanged |
| `src/tools/_registration-stub.ts` | BI-031 shared fixture unchanged; the test-file imports survive the directory rename |
| README.md, CHANGELOG.md | DEFERRED per FR-021 |
| Any test files outside `src/tools/tree/` and `src/server.test.ts` | No literal `tree` references per F3 |

Total edit surface: **14 files** (8 source-tree files renamed-and-edited inside `src/tools/tree/` → `src/tools/paths/`; 1 docs file renamed-and-edited; 5 in-place edits).

## LOC budget

| Region | Pre-edit | Post-edit | Delta |
|---|---|---|---|
| `PATHS_DESCRIPTION` string literal | ~2 600 chars | ≤ 512 chars | **−2 100 chars** (the headline win) |
| `paths/schema.ts` schema construction | 8 lines (lines 9-16) | 8 lines (lines 9-16) | 0 (insert `.omit()` between `.extend()` and base; no net line delta) |
| `paths/handler.ts` body | unchanged | unchanged | 0 |
| `paths/_template.ts` body | unchanged | unchanged | 0 |
| Header comments across renamed dir | byte-stable structure | byte-stable structure | ~ ±50 chars per file (narrative text edits) |
| `paths/index.test.ts` case (2) | 22 lines (existing) | 24 lines (+2 lines for absence-check) | +2 lines |
| `paths/schema.test.ts` "file forbidden" + "path forbidden" cases | 8 lines per case (16 total) | 8 lines per case (assertion message updated) | 0 |
| `server.ts` import + tools-array | 1 import + 1 tools-array entry | 1 import + 1 tools-array entry | 0 (entries shift position, not count) |
| `server.test.ts` names array | 19 entries | 19 entries | 0 (tree removed, paths inserted) |
| `_register-baseline.json` | 19 entries | 19 entries | 0 (alphabetical reposition of one entry; all fingerprints regenerated for `paths`; other 18 byte-stable) |
| `docs/tools/paths.md` | unchanged structurally | unchanged structurally | ~ ±20 chars (heading + 9 JSON-key updates) |
| `.architecture/Obsidian CLI MCP - Architecture.md` | unchanged structurally | unchanged structurally | ~ ±100 chars (textual `tree` → `paths` substitutions in tool-name prose) |
| `package.json` | `0.5.8` | `0.6.0` | 0 lines, 2 chars |

**Net change**: source-tree LOC ~+2 lines (the index.test.ts absence-check additions); description string −2 100 chars; total bytes-on-disk decrease ~ 2 000 chars. The "BI is a token-budget reduction" framing materialises as a measurable description-string compression.

## Test inventory (post-edit)

Per Principle II / FR-018 the existing co-located test count survives the rename byte-equivalently:

| Test file | Pre-edit case count | Post-edit case count | Net delta |
|---|---|---|---|
| `src/tools/paths/index.test.ts` | 5 cases (descriptor name, schema keys, description content, docs file presence, baseline entry) | 5 cases (same cases; assertions updated for the new name + schema shape + description content) | 0 |
| `src/tools/paths/handler.test.ts` | ~25 cases per BI-029 inventory | ~25 cases (assertions reference `paths` symbols/strings) | 0 |
| `src/tools/paths/schema.test.ts` | 18 cases per BI-029 inventory | 18 cases (file/path-forbidden assertions check strict-mode rejection rather than refinement message) | 0 |
| `src/server.test.ts` (single relevant test) | 1 names-array assertion | 1 names-array assertion (with `paths` instead of `tree`) | 0 |

The test inventory is byte-stable in case count and case names; only assertion specifics inside individual cases change. The "no new tests" out-of-scope is satisfied because no new vitest `it(...)` or `test(...)` blocks are added.

## Forward-going invariants documented by this BI

| Invariant | Anchor | Held by |
|---|---|---|
| Tool name = `paths` | FR-013 | `PATHS_TOOL_NAME` constant; `index.test.ts` case (1) |
| Description ≤ 512 chars | FR-011 / SC-001 | The string literal at `PATHS_DESCRIPTION`; observable via `PATHS_DESCRIPTION.length` (no enforcing test added by this BI per user's defer; deferred test would be a one-liner `expect(PATHS_DESCRIPTION.length).toBeLessThanOrEqual(512)`) |
| Description has no internal artefacts | FR-005..FR-007 / SC-002..SC-003 | `PATHS_DESCRIPTION` content (no enforcing test added by this BI per user's defer; deferred test would grep against the regex set + the literal-substring set) |
| Published `inputSchema` lacks `file` / `path` | FR-001 / SC-005 | `pathsInputSchema` shape via `.omit(…)`; `index.test.ts` case (2) absence-check (per R13 — added as an assertion update, not a new case) |
| Runtime behaviour byte-stable | FR-016 / SC-007 | Eval-template body byte-stable in `paths/_template.ts` and `paths/handler.ts`; `details.code` strings byte-stable |
| Baseline rolled forward | FR-017 / SC-009 | `_register-baseline.json` regenerated by `npm run baseline:write` in same commit |
| Sibling `files` schema byte-stable | SC-011 | Refinement helper untouched; `files/schema.ts` not edited; baseline fingerprint for `files` is byte-stable in the rolled-forward JSON |
