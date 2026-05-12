# Phase 0 Research: Fix Write Gaps

**Feature**: 020-fix-write-gaps
**Date**: 2026-05-12
**Status**: Complete — all 15 design decisions ratified; ground-truth verified against current `src/tools/write_note/` source.

## Ground-truth verification (current handler state)

Before drafting design decisions, the plan grounded every assumption against the current source. The following table records what was verified and where.

| Verified property | Source location | Current behaviour | Touch in this BI? |
|---|---|---|---|
| `file` and `path` use the same `safePathField` validator (no structural distinction) | [src/tools/write_note/schema.ts:10-18](../../src/tools/write_note/schema.ts#L10-L18) | Both `z.string().min(1).refine(isStructurallySafePath)` | NO (FR-012 freezes schema) |
| `safePathField` accepts paths with `/`, `\`, internal periods, multi-segment forms | [src/path-safety/schema.ts:13-20](../../src/path-safety/schema.ts#L13-L20) | Rejects only: empty, leading `/` or `\`, drive letter, `..` segments, control chars | NO (FR-012 freezes schema) |
| Handler collapses `file` and `path` to the same `relPath` value | [src/tools/write_note/handler.ts:149](../../src/tools/write_note/handler.ts#L149) | `relPath = (input.path ?? input.file)!` | **YES** — replace with `resolveSpecificModePath(input)` |
| Hot-path FILE_EXISTS rejection details shape | [src/tools/write_note/handler.ts:208-213](../../src/tools/write_note/handler.ts#L208-L213) | `details: { path: relPath, vault: input.vault ?? null }` (NO `errno` field) | **YES** — add `errno: "EEXIST"` |
| `mapFsError` EEXIST mapping path | [src/tools/write_note/handler.ts:79-87](../../src/tools/write_note/handler.ts#L79-L87) | `details: { errno }` only — fires from mkdir/rename EEXIST (rare race) | NO — preserved asymmetry per R4 |
| FS_WRITE_FAILED details shape | [src/tools/write_note/handler.ts:91-94](../../src/tools/write_note/handler.ts#L91-L94) | `details: { errno, syscall, path }` | NO (FR-014 freezes other shapes) |
| Path-safety check (`checkCanonicalPath`) call site | [src/tools/write_note/handler.ts:152](../../src/tools/write_note/handler.ts#L152) | Runs AFTER `relPath` is computed | NO — sequencing preserved per R5 |
| Active-mode path computation | [src/tools/write_note/handler.ts:128-146](../../src/tools/write_note/handler.ts#L128-L146) | Resolves via eval JSON envelope; `relPath = parsed.path` | NO (FR-014 freezes active path) |
| Active mode forbids `input.file` | [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) via `applyTargetModeRefinement` | Schema rejects `file` in active mode | NO (FR-012 freezes schema) |
| Response shape | [src/tools/write_note/handler.ts:253](../../src/tools/write_note/handler.ts#L253) | `return { created, path: relPath }` | NO (FR-013 freezes shape) |
| Schema's `applyTargetModeRefinement` integration | [src/tools/write_note/schema.ts:15-22](../../src/tools/write_note/schema.ts#L15-L22) | `applyTargetModeRefinement(targetModeBaseSchema.extend({ file, path, content, overwrite, open }))` | NO (FR-012 freezes schema) |
| Logger event for FILE_EXISTS | [src/logger.ts](../../src/logger.ts) via 016-FR-029 | NONE — FILE_EXISTS does not emit per-call logger events | NO (R7 preserves) |

The touch surface is one source file (`handler.ts`) at two locations: the `relPath` computation site and the hot-path FILE_EXISTS throw. Everything else stays.

## Decision R1 — Short-form rule placement

**Decision**: Inline the FR-001 / FR-001a rule inside `handler.ts` via a local helper function `resolveSpecificModePath(input)`.

**Rationale**: The rule is ≤ 8 LOC. The handler already owns the `(input.path ?? input.file)` computation that the rule extends. Constitution Principle I says split modules when they exceed a single responsibility; target resolution IS part of the handler's responsibility (it was always part of `handler.ts` — the rule restoration doesn't change the responsibility boundary). Extracting to a peer module under `src/path-safety/` or `src/target-mode/` would be premature abstraction.

**Alternatives considered**:
- *Peer module under `src/path-safety/`*: rejected. `path-safety` is about defence against malicious paths; the short-form rule is about default-extension convention.
- *Peer module under `src/target-mode/`*: rejected. `target-mode` is about discriminating specific vs active modes; the short-form rule is mode-internal to specific.
- *Inline expression at the assignment site (no helper)*: rejected. The named helper makes the rule testable as a unit and self-documenting.

## Decision R2 — Canonical short-form predicate

**Decision**: Three-condition literal check:
```ts
function isCanonicalShortForm(file: string): boolean {
  return !file.includes("/") && !file.includes("\\") && !file.endsWith(".md");
}
```

**Rationale**: Captures the spec's Clarifications-session Q2 Option A wording exactly — "value contains no folder separator (`/` or `\`) AND does not end in the `.md` extension". The `endsWith(".md")` check correctly preserves internal periods (e.g. `version_1.2.3` ends in `.3`, not `.md` — short-form rule fires; `version_1.2.3` → `version_1.2.3.md` per Story 1 AC#5). Three literal checks; no regex needed.

**Alternatives considered**:
- *Regex `/^[^/\\]+(?<!\.md)$/`*: rejected. No benefit at this complexity; harder to read.
- *Node `path.extname()` + separator check*: rejected. `path.extname("version_1.2.3")` returns `.3`, which would incorrectly skip the short-form rule. The literal `endsWith(".md")` is the precise contract.
- *URL-style parsing*: rejected. Overkill.

## Decision R3 — FILE_EXISTS details enrichment placement

**Decision**: ONE call-site change at the hot-path FILE_EXISTS throw ([handler.ts:208-213](../../src/tools/write_note/handler.ts#L208-L213)). The `details` object goes from `{ path: relPath, vault: input.vault ?? null }` to `{ errno: "EEXIST", path: relPath, vault: input.vault ?? null }`.

**Rationale**: The user's spec targets the hot-path collision (the `wx`-flag write rejection). This is the typical case where callers see FILE_EXISTS. The added `errno` field satisfies the cross-failure-type field-name parity contract from FR-008 without disturbing the existing `path` / `vault` fields (additive enrichment per FR-007 and Q1's Option A).

**Alternatives considered**:
- *Enrich the `mapFsError` path too*: rejected. See R4 — wider scope; out of scope for this BI.
- *Replace details with just `{ errno }`*: rejected. The user's spec is explicit on additive (Q1 Option A).

## Decision R4 — `mapFsError` asymmetry preserved

**Decision**: The separate `mapFsError` path that maps unexpected EEXIST from mkdir / rename failures to FILE_EXISTS continues to emit `details: { errno }` only — its existing shape.

**Rationale**: The `mapFsError` path fires rarely (race conditions during mkdir / rename — an outside actor created or deleted the target between operations). The user's spec targets the hot-path `wx`-flag collision detection (Story 2 — "an existing file at the target location" called with "collision protection enabled"). The hot path uses `O_CREAT | O_EXCL` semantics; the user's framing aligns with that mechanism. Reconciling the `mapFsError` path to also carry `{ path, vault }` would require:

1. Widening `mapFsError`'s signature to accept `relPath` and `vault` parameters
2. Threading those parameters through all `mapFsError` call sites (mkdir, writeFile-tmp, rename)
3. Updating all `mapFsError` tests to assert the new shape

This is wider scope than the contract-restoration. Documented as a known asymmetry; tracked as a follow-up consideration if downstream consumers report ambiguity. For the BI's contract: hot-path FILE_EXISTS carries `{ errno, path, vault }`; the rare mkdir/rename-EEXIST path keeps `{ errno }`.

**Alternatives considered**:
- *Widen `mapFsError`*: rejected per scope.
- *Switch the hot path to use `mapFsError`'s shape (drop `path`/`vault`)*: rejected. Loses caller-visible context per Q1 Option A.

## Decision R5 — Path-safety check sequencing

**Decision**: The short-form rule fires at the `relPath` assignment step (handler.ts:148-150) — BEFORE `checkCanonicalPath` runs (handler.ts:152). The `checkCanonicalPath` validates the RESOLVED path (`<file>.md` for canonical short-form inputs), not the raw `file` input.

**Rationale**: Path safety should validate what's actually written to disk. If the short-form rule appends `.md`, the canonical-root check should evaluate `<vault-root>/<file>.md`, not the raw input. The existing 016 FR-014 canonical check operates on `relPath`; preserving the call order achieves this naturally.

**Alternatives considered**:
- *Run canonical check on raw input first, then short-form rule*: rejected. Would allow `file: "../escape"` to fire the short-form rule and produce `../escape.md` — but that's already blocked at the schema layer by `isStructurallySafePath`'s `..` regex, so the sequencing doesn't matter in practice. Default to the simpler order (rule first, then check the result).

## Decision R6 — Schema unchanged

**Decision**: No edits to `src/tools/write_note/schema.ts` or to `src/target-mode/target-mode.ts`.

**Rationale**: FR-012 and Out of scope explicitly forbid input contract changes. The handler is the right layer for behaviour changes; the schema continues to accept the same set of inputs. The asymmetry in `file` interpretation (canonical → resolved, non-canonical → verbatim) is documented in the help update under FR-018 so callers learn the canonical shape.

## Decision R7 — Logger surface unchanged

**Decision**: No new typed logger methods, no `ErrorCode` union amendments, no per-call logger events for FILE_EXISTS rejections (with or without the new `errno` field).

**Rationale**: 016-FR-029 explicitly says FILE_EXISTS / FS_WRITE_FAILED / VALIDATION_ERROR for path shape do NOT emit per-call logger events. The new `errno` field on FILE_EXISTS doesn't change the failure-mode categorisation; it's still a structured failure shape that propagates through `registerTool`'s existing UpstreamError → tool-error envelope plumbing.

## Decision R8 — Active mode untouched

**Decision**: No handler changes for active-mode path resolution. The active-mode branch ([handler.ts:128-146](../../src/tools/write_note/handler.ts#L128-L146)) continues to resolve via the focused-file eval result.

**Rationale**: Active mode forbids `input.file` per the existing schema rule (active mode forbidden-keys: `vault` / `file` / `path` / `open`). The short-form rule's input (`input.file`) is structurally inaccessible in active mode. The `parsed.path` value from the focused-file eval is a full vault-relative path that Obsidian itself produced — it's already in canonical form. No resolution needed.

## Decision R9 — Test surface

**Decision**: Eight new / updated handler test cases in `src/tools/write_note/handler.test.ts`.

| Case | Story | Acceptance scenario | Type |
|------|-------|---------------------|------|
| `file: "Acceptance Probe"` → `Acceptance Probe.md` | 1 | AC#1 | Happy-path (canonical) |
| `file: "version_1.2.3"` → `version_1.2.3.md` | 1 | AC#5 | Happy-path (internal-period preservation) |
| `file: "Notes.md"` → verbatim `Notes.md` | 1 | AC#6 | FR-001a passthrough (ext-only edge) |
| `file: "Folder/Note"` → verbatim `Folder/Note` | 1 | AC#7 | FR-001a passthrough (folder edge) |
| `path: "Subfolder/Note.md"` → verbatim `Subfolder/Note.md` | 1 | AC#4 | Regression guard (path-based unchanged) |
| FILE_EXISTS hot path → `details: { errno: "EEXIST", path, vault }` | 2 | AC#1 | Happy-path (additive enrichment) |
| `mapFsError` EEXIST path → `details: { errno: "EEXIST" }` only | 2 | (regression) | Boundary guard (asymmetry preserved per R4) |
| Overwrite-true on existing → success envelope, no `details.errno` | 2 | AC#4 | Boundary guard |

**Rationale**: Eight cases cover all FR / AC scenarios for both stories, plus the R4 asymmetry guard. The existing test suite for `write_note` continues to pass for unaltered behaviour. **Audit update (post-/speckit-analyze)**: a pre-implementation grep of [src/tools/write_note/handler.test.ts](../../src/tools/write_note/handler.test.ts) confirmed ZERO existing test cases use the `file` parameter — every existing case uses `path: "..."` exclusively. The short-form rule therefore introduces no broken-expectation cases to update; T005 becomes an audit-confirmation gate (`grep -n "file:" handler.test.ts` expected empty) rather than a discover-and-fix task.

## Decision R10 — Edge cases enumerated

**Decision**: Enumerated edge cases with documented behaviour:

| Input | Canonical? | Resolved value | On-disk path | Notes |
|-------|-----------|----------------|--------------|-------|
| `file: "Note"` | YES (no sep, no .md) | `"Note.md"` | `<vault-root>/Note.md` | Canonical happy path |
| `file: "version_1.2.3"` | YES (no sep, ends in `.3`) | `"version_1.2.3.md"` | `<vault-root>/version_1.2.3.md` | Internal periods preserved |
| `file: "Notes.md"` | NO (ends in `.md`) | `"Notes.md"` verbatim | `<vault-root>/Notes.md` | FR-001a passthrough |
| `file: "Folder/Note"` | NO (contains `/`) | `"Folder/Note"` verbatim | `<vault-root>/Folder/Note` | FR-001a passthrough; no extension |
| `file: "Folder/Note.md"` | NO (both `/` and `.md`) | `"Folder/Note.md"` verbatim | `<vault-root>/Folder/Note.md` | FR-001a passthrough |
| `file: "Folder\\Note"` | NO (contains `\`) | `"Folder\\Note"` verbatim | OS-resolved relative | FR-001a passthrough; Windows path |
| `file: ".md"` | NO (ends in `.md`) | `".md"` verbatim | `<vault-root>/.md` | FR-001a passthrough; weird but acceptable |
| `file: "."` | YES (no sep, no .md) | `"..md"` | `<vault-root>/..md` | Weird; passes schema, fires rule; no auto-rename |
| `file: ""` | (rejected by schema's `min(1)`) | — | — | VALIDATION_ERROR |
| `path: "Subfolder/Note.md"` | (path-based) | `"Subfolder/Note.md"` verbatim | `<vault-root>/Subfolder/Note.md` | Unchanged from current behaviour |
| `path: "Subfolder/Note"` | (path-based) | `"Subfolder/Note"` verbatim | `<vault-root>/Subfolder/Note` | Spec Edge Cases note — no extension append on `path` |

**Rationale**: Captures the spec's Story 1 description, AC#1-AC#7, and Edge Cases bullets in tabular form. Documents the weird-but-acceptable cases (`.md`, `.`) so they're not surprises during implementation.

## Decision R11 — Response `path` value

**Decision**: The handler's existing `return { created, path: relPath }` line ([handler.ts:253](../../src/tools/write_note/handler.ts#L253)) is structurally unchanged. The `relPath` value upstream is what changes: for canonical short-form `file` inputs, `relPath` is `<file>.md`; for FR-001a passthrough on `file`, `relPath` is `input.file` verbatim; for `path` inputs, `relPath` is `input.path` verbatim (unchanged from current behaviour).

**Rationale**: Per FR-003 — the response's `path` field reports the resolved vault-relative path. Reusing the existing `relPath` variable keeps the response logic invariant.

## Decision R12 — No plan-stage spec amendments

**Decision**: NONE.

**Rationale**: The two `/speckit-clarify` Q&A bullets in spec.md (Q1 additive details shape, Q2 literal short-form rule) closed both ambiguities at spec stage. Plan-stage research did not surface any further unresolved questions. No amendments are needed.

## Decision R13 — Test seam pattern

**Decision**: Co-located handler tests inject the existing dependency seams: `nodeFs` (`writeFile` / `realpath` / `mkdir` / `rename` / `unlink`), `spawnFn`, `vaultRegistry.resolveVaultPath`, `env`, `logger`, `queue`. No new test-seam introductions.

**Rationale**: The 016-reliable-writer test suite already establishes the dependency-injection pattern for the handler. The new test cases reuse it.

## Decision R14 — Help update scope

**Decision**: Two short callouts in `docs/tools/write_note.md`, both under existing sections. No new section structure.

**Callout (a)** under the input contract section: canonical short-form `file` shape definition (no folder separator, not ending in `.md`) + worked example (`file: "Daily Note"` → file lands at `<vault-root>/Daily Note.md`) + non-canonical passthrough note (`file: "Notes.md"` or `file: "Folder/Note"` pass through verbatim — caller responsible for canonical shape if `.md` resolution is wanted).

**Callout (b)** under the error roster section, on the FILE_EXISTS row: rejection shape includes `details: { errno: "EEXIST", path: <relative path>, vault: <vault name|null> }` — additive enrichment, field-name parity on `details.errno` with `FS_WRITE_FAILED`'s `details.errno`.

**Rationale**: Per FR-018. The help update is in scope for the BI and ships with the code change.

## Decision R15 — Release versioning

**Decision**: Patch bump (e.g. `0.4.2` → `0.4.3`). Defer the actual version-bump task to `/speckit-tasks`.

**Rationale**: Per the project's release-task convention (e.g. 019-list-files's task T023 — version-bump task lands at /speckit-tasks time). This BI is purely additive (`details.errno` is added; canonical short-form returns a different value but the response shape is unchanged) so patch level is appropriate.

## FR coverage mapping

Every FR maps to either a code change, a doc change, or a no-impact assertion:

| FR | Coverage | Where |
|----|----------|-------|
| FR-001 | Code | `handler.ts` `resolveSpecificModePath` (canonical branch) |
| FR-001a | Code | `handler.ts` `resolveSpecificModePath` (passthrough branch) |
| FR-002 | Code | `handler.ts` — `relPath` flows into the existing write mechanism unchanged |
| FR-003 | Code | `handler.ts:253` — `return { created, path: relPath }` |
| FR-004 | Test | Existing `path`-based test cases regression-guard (no behavioural change) |
| FR-005 | No-impact | Inherits 016 FR-011 metadataCache invalidation; SC-002 verifies via manual scenario |
| FR-006 | No-impact | Top-level FILE_EXISTS code unchanged |
| FR-007 | Code | `handler.ts:208-213` — additive `errno: "EEXIST"` |
| FR-008 | Test | Asserts `details.errno` field name + `"EEXIST"` value |
| FR-009 | Test | Asserts existing file unchanged + no auto-rename (existing 016 invariant; regression-guarded) |
| FR-010 | Test | Overwrite-true on existing → success envelope (existing 016 invariant; regression-guarded) |
| FR-011 | No-impact | No new top-level codes — verified by inspection of `src/logger.ts` `ErrorCode` union |
| FR-012 | No-impact | Schema unchanged — verified by Phase 0 ground-truth table |
| FR-013 | No-impact | Output schema unchanged — verified by Phase 0 ground-truth table |
| FR-014 | No-impact | Other tools' surfaces unchanged — verified by git diff on completion |
| FR-015 | No-impact | Silent auto-rename behaviour not restored; FR-009 test asserts no auto-rename |
| FR-016 | No-impact | `template` parameter not restored; schema unchanged |
| FR-017 | No-impact | Write mechanism unchanged — Phase 0 ground-truth confirms |
| FR-018 | Doc | `docs/tools/write_note.md` — two callouts per R14 |

## Open questions

NONE at plan stage. All ambiguities closed by `/speckit-clarify`'s Q1 (additive details shape) and Q2 (literal short-form rule).
