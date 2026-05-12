# Data Model: Fix Write Gaps

**Feature**: 020-fix-write-gaps
**Date**: 2026-05-12
**Status**: Phase 1 output. Captures the short-form predicate truth table, the resolution flowchart, the FILE_EXISTS `details` shape transition, and the per-FR test inventory (8 cases) cross-referenced to acceptance criteria.

## Schema shape

### Input

UNCHANGED from 016-reliable-writer. The zod schema at [src/tools/write_note/schema.ts](../../src/tools/write_note/schema.ts) is frozen per FR-012.

```ts
export const writeNoteInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    file: safePathField.optional(),
    path: safePathField.optional(),
    content: z.string(),
    overwrite: z.boolean().optional().default(false),
    open: z.boolean().optional(),
  }),
).superRefine((input, ctx) => {
  // active-mode constraints (overwrite must be true, open forbidden) — unchanged
});
```

### Output

UNCHANGED from 016-reliable-writer. Per FR-013, the output schema stays:

```ts
export const writeNoteOutputSchema = z.object({
  created: z.boolean(),
  path: z.string(),
}).strict();
```

The `path` field's *value* changes for canonical short-form `file` inputs (now reports the resolved `<file>.md`); the *shape* is unchanged.

### Error envelope — FILE_EXISTS

The `details` payload on the hot-path FILE_EXISTS rejection grows by one field. The top-level error code (`FILE_EXISTS`) is unchanged. Full transition:

| Stage | `code` | `details` shape |
|-------|--------|----------------|
| Before this BI (016 surface) | `FILE_EXISTS` | `{ path: relPath, vault: input.vault ?? null }` |
| After this BI (020 surface) | `FILE_EXISTS` | `{ errno: "EEXIST", path: relPath, vault: input.vault ?? null }` |

**Additive enrichment**: the new `errno` field is added; the existing `path` and `vault` fields are preserved verbatim. Per FR-007.

## Short-form predicate (FR-001 / FR-001a)

The predicate that determines whether the FR-001 resolution rule fires:

```ts
function isCanonicalShortForm(file: string): boolean {
  return !file.includes("/") && !file.includes("\\") && !file.endsWith(".md");
}
```

### Truth table

| `file` value | Contains `/`? | Contains `\`? | Ends in `.md`? | Canonical? | Resolved path | Notes |
|---|---|---|---|---|---|---|
| `"Note"` | NO | NO | NO | **YES** | `"Note.md"` | Canonical happy path |
| `"Acceptance Probe"` | NO | NO | NO | **YES** | `"Acceptance Probe.md"` | Canonical with space — accepted |
| `"version_1.2.3"` | NO | NO | NO (ends in `.3`) | **YES** | `"version_1.2.3.md"` | Internal periods preserved |
| `"Notes.md"` | NO | NO | **YES** | NO | `"Notes.md"` verbatim | FR-001a passthrough |
| `"Folder/Note"` | **YES** | NO | NO | NO | `"Folder/Note"` verbatim | FR-001a passthrough |
| `"Folder/Note.md"` | **YES** | NO | **YES** | NO | `"Folder/Note.md"` verbatim | FR-001a passthrough |
| `"Folder\\Note"` | NO | **YES** | NO | NO | `"Folder\\Note"` verbatim | FR-001a passthrough (Windows) |
| `".md"` | NO | NO | **YES** | NO | `".md"` verbatim | FR-001a passthrough (weird but acceptable) |
| `"."` | NO | NO | NO | **YES** | `"..md"` | Fires rule (weird; passes schema) |
| `""` | (rejected by schema's `min(1)`) | — | — | — | — | VALIDATION_ERROR before handler |

### Resolution flowchart

```text
input arrives → schema parses → handler entry
                                   │
                                   ▼
                          target_mode === "active"?
                            │              │
                          YES              NO
                            │              │
                            ▼              ▼
                   eval focused file   vault registry lookup
                            │              │
                            ▼              ▼
                       parsed.path       input.path supplied?
                            │            │           │
                            │           YES          NO
                            │            │           │
                            │            ▼           ▼
                            │       input.path   isCanonicalShortForm(input.file)?
                            │       verbatim     │                     │
                            │            │      YES                   NO
                            │            │       │                     │
                            │            │       ▼                     ▼
                            │            │   <input.file>.md       input.file
                            │            │                          verbatim
                            ▼            ▼       ▼                     ▼
                           ─────────────────────────────────────────────
                                          relPath
                                            │
                                            ▼
                                   checkCanonicalPath(vaultRoot, relPath)
                                            │
                                            ▼
                              (write mechanism unchanged per FR-017)
                                            │
                                            ▼
                                  return { created, path: relPath }
```

## Per-FR test inventory (8 cases)

All cases land in [src/tools/write_note/handler.test.ts](../../src/tools/write_note/handler.test.ts).

| # | Test name | FR | Story / AC | Type |
|---|-----------|-----|------------|------|
| 1 | `resolves canonical short-form file to <file>.md and reports resolved path` | FR-001, FR-002, FR-003 | Story 1 AC#1 | Happy-path |
| 2 | `preserves internal periods in canonical short-form (version_1.2.3 → version_1.2.3.md)` | FR-001, FR-003 | Story 1 AC#5 | Happy-path |
| 3 | `passes file with trailing .md verbatim (FR-001a — Notes.md → Notes.md)` | FR-001a, FR-003 | Story 1 AC#6 | Boundary |
| 4 | `passes file with folder separator verbatim (FR-001a — Folder/Note → Folder/Note)` | FR-001a, FR-003 | Story 1 AC#7 | Boundary |
| 5 | `passes path-based identifier verbatim (regression — Subfolder/Note.md → Subfolder/Note.md)` | FR-004 | Story 1 AC#4 | Boundary (regression guard) |
| 6 | `FILE_EXISTS hot path carries additive details.errno: "EEXIST"` | FR-007, FR-008, FR-009 | Story 2 AC#1, AC#3 | Happy-path |
| 7 | `mapFsError EEXIST path preserves single-field { errno } details shape` | R4 (asymmetry guard) | (regression) | Boundary |
| 8 | `overwrite: true on existing succeeds with no rejection and no details.errno` | FR-010 | Story 2 AC#4 | Boundary |

### Coverage summary

| Coverage type | Count |
|---------------|-------|
| Happy-path | 3 |
| Boundary (FR-001a passthrough + regression guards + asymmetry guard + collision-disabled) | 5 |
| Total new / updated | 8 |

Constitution Principle II symmetric-coverage requirement satisfied: both Story 1 and Story 2 ship happy-path AND boundary cases in the same change.

## Module LOC budget

| Module | Change | LOC delta |
|--------|--------|-----------|
| `src/tools/write_note/handler.ts` | +`resolveSpecificModePath` helper (~8 LOC) + `errno: "EEXIST"` field add (~1 LOC) + call-site rewire (~2 LOC net) | **+~10 LOC** |
| `src/tools/write_note/handler.test.ts` | 8 NEW test cases @ ~10 LOC each (no UPDATED cases — audit-confirmation T005 verified zero existing `file`-parameter cases) | **+~80 LOC** |
| `src/tools/write_note/schema.ts` | (frozen per FR-012) | 0 |
| `src/tools/write_note/schema.test.ts` | (frozen) | 0 |
| `src/tools/write_note/index.ts` | (frozen) | 0 |
| `src/tools/write_note/index.test.ts` | (frozen) | 0 |
| `src/path-safety/**` | (frozen) | 0 |
| `src/target-mode/**` | (frozen) | 0 |
| `src/logger.ts` | (frozen per R7) | 0 |
| `src/errors.ts` | (frozen per FR-011) | 0 |
| `docs/tools/write_note.md` | Two callouts (canonical short-form rule + FILE_EXISTS additive details) | **+~25 LOC** |
| `CHANGELOG.md` | One entry (release-task decision at `/speckit-tasks` time) | +~5 LOC |
| `package.json` | Optional patch bump | +0–1 LOC |

**Total surface area**: ~10 LOC of source change + ~80 LOC of test additions + ~25 LOC of doc updates + ~5 LOC of CHANGELOG. Order-of-magnitude smaller than feature-additions (cf. 019-list-files: ~205 + ~920 LOC).

## Cross-references

- Spec FR-001 / FR-001a / FR-002 / FR-003 → handler test #1, #2, #3, #4
- Spec FR-004 → handler test #5 (regression guard on `path` form)
- Spec FR-005, FR-009, FR-015 → No new test; preserved by FR-017's freeze of the write mechanism
- Spec FR-006, FR-011, FR-012, FR-013, FR-014, FR-016, FR-017 → No new test; preserved by Phase 0 ground-truth verification and FR-014's freeze of other surfaces
- Spec FR-007 / FR-008 → handler test #6
- Spec FR-009 → handler test #6 also asserts the existing-file content is unchanged (preserves existing 016 invariant)
- Spec FR-010 → handler test #8
- Spec FR-018 → doc update at `docs/tools/write_note.md` (callouts (a) and (b))
- Research R4 → handler test #7 (asymmetry guard)
- Spec SC-001 → handler tests #1–#5 (per-input-shape coverage)
- Spec SC-002 → MANUAL quickstart scenario S-2 (live-Obsidian recognition check; cannot unit-test)
- Spec SC-003 → handler test #5 (regression guard on `path` form)
- Spec SC-004 / SC-005 / SC-006 / SC-007 → handler tests #6, #7, #8
- Spec SC-008 / SC-009 / SC-010 → No new test; verified by inspection at PR review (top-level error code roster + input contract + other-tools-surfaces verified diff-free)
- Spec SC-011 → doc-update inspection at PR review
