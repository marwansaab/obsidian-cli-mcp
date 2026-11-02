# Implementation Plan: Fix section replacement

**Branch**: `086-fix-section-replacement` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/086-fix-section-replacement/spec.md`

> **This change makes editing split a note where finding splits it.** Today `patch_heading` and `patch_block` find their target on a line-feed split, but edit an array that is split only on CRLF once the note holds a single CRLF. On a mixed note the indices disagree, and the edit lands somewhere else. After this change:
>
> - both handlers split through one new leaf module, `src/tools/_note-lines.ts`, where every line keeps its own terminator;
> - the existing splice helpers run unchanged on those lines;
> - reassembly keeps every kept line's terminator, and gives added lines the ending of the target's marker line;
> - a pure placement check refuses, with `CLI_REPORTED_ERROR` / `UNSAFE_PLACEMENT`, any edit that does not keep the original bytes around it.
>
> `append` and `prepend` are fixed with `replace`, because they share the indices. `patch_block` joined the scope at clarify (owner ruling). On uniform notes the output bytes are unchanged.

## Summary

Research ([research.md](research.md)) found, at HEAD `926bac7`:

- **F1/F2**: `walkHeadings` splits on `"\n"` (`heading-walk.ts:68`). `executePatchHeading` splits on `/\r\n/` once `detectLineEnding` sees any CRLF (`handler.ts:131-141`). Each LF-only break above the target shifts the edit one line down. With a CRLF frontmatter and an LF body, the new text is appended at the end of the note.
- **F3**: the race check compares heading identity, never the edit array, so it does not catch the mismatch.
- **F4**: all three modes splice the same indices.
- **F5**: `patch_block` has the same split mismatch (`handler.ts:113-123` against `block-scan.ts:65`), and no race check.
- **F6**: no splice helper reads existing line text, so the helpers work on any array whose indices match the scanner's.
- **F7**: the help pages wrongly say that the "file's detected line ending" is used. Each description enumerates its `details.code` values.
- **F8**: no mixed-note test exists; `detectLineEnding` is pinned in both edit test files.
- **F9**: note-level refusals are `CLI_REPORTED_ERROR` + `details.code`.
- **F10**: the scanners strip a lone trailing `\r`.
- **F11**: `append_note`'s own splitter is index-free, and out of scope.

The decisions:

- **D1**: new leaf `_note-lines.ts`: `splitNoteLines`, `lineText`, `insertEnding`, `joinNoteLines`, `lineStart`, `keepsOriginalAround`.
- **D2**: both handlers use it. Their local `reassemble` and the two `detectLineEnding` exports are deleted, along with those exports' two test blocks (an enumerated test edit).
- **D3**: the placement check (agreement on the marker line, plus original bytes kept before and after) runs before any further I/O, and refuses with `UNSAFE_PLACEMENT`.
- **D4**: the refusal is tested through the real handlers with a per-file `vi.mock` that shifts the finder's result.
- **D5**: new `_note-lines.test.ts` and `handler.line-endings.test.ts` per tool.
- **D6**: help pages, the two description enumerations (exactly two fingerprints move), and CHANGELOG.
- **D7**: an optional live reproduction in the Sandbox.

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. Unchanged.

**Primary Dependencies**: `@modelcontextprotocol/server` (SDK v2), `zod` 4. No new dependency.

**Storage**: notes on disk through the existing ADR-009 direct-write substrate (`writeAtomic`, `invalidateMetadataCache` in `_note-io.ts`). Unchanged.

**Testing**: `vitest run` with co-located `*.test.ts`, run through PowerShell. `vi.mock` is used for the first time in this repository, confined to the two `handler.unsafe-placement.test.ts` files (research D4). The optional live check (quickstart §3) follows `.memory/test-execution-instructions.md`.

**Target Platform**: Windows, macOS, Linux; CI on Linux and Windows. The change is pure string handling and platform-neutral. Mixed notes arise most on Windows.

**Project Type**: single project, an MCP server.

**Performance Goals**: one extra linear pass to split, and one prefix and one suffix comparison per call. This is negligible next to the file I/O.

**Constraints**:

- FR-004: no kept line changes its terminator.
- FR-008: on uniform notes the output bytes equal today's.
- FR-010: no new top-level error code.
- FR-011 and FR-017: input and output schemas, success shape and annotations unchanged.
- Only the two tools' `descriptionFingerprint` values may move (contract S1).
- No change to `walkHeadings`, `scanBlocks`, `findBlock` or any splice helper's behaviour.

**Scale/Scope**:

- **New code**: `src/tools/_note-lines.ts`.
- **Changed code**:
  - `src/tools/patch_heading/{handler.ts, body-edit.ts (delete detectLineEnding, fix doc comments), index.ts (one enumeration entry)}`;
  - `src/tools/patch_block/{handler.ts, block-edit.ts (same), index.ts (same)}`.
- **New tests**:
  - `src/tools/_note-lines.test.ts`;
  - `src/tools/patch_heading/handler.line-endings.test.ts`;
  - `src/tools/patch_heading/handler.unsafe-placement.test.ts`;
  - `src/tools/patch_block/handler.line-endings.test.ts`;
  - `src/tools/patch_block/handler.unsafe-placement.test.ts`.
- **Added test cases**: each tool's `index.test.ts` (S5).
- **Edited tests**: `body-edit.test.ts` and `block-edit.test.ts` lose their `detectLineEnding` block and import only (research D2).
- **Regenerated**: `src/tools/_register-baseline.json` (two fingerprints).
- **Docs**: `docs/tools/patch_heading.md`, `docs/tools/patch_block.md`, `CHANGELOG.md`, and the `CLAUDE.md` plan pointer.

**Resolved unknowns**: none open.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | One new cohort leaf module, `src/tools/_note-lines.ts`. It imports nothing, and is imported downward by the two handlers, like `_note-io.ts` and `_smart-connections.ts`. Neither tool imports the other, so there is no tool → tool edge. The `{schema, tool, handler}` layout is unchanged. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | Both changed tools get happy-path rows (H1–H5, H10; B1–B2), boundary rows (H6–H9; B3–B5) and failure rows (U1, U2) in the same change. The module's pure rows N1–N9 are co-located. The description change is pinned by S5, plus the S1 baseline. |
| **III. Boundary Input Validation with Zod** | **Y** | No schema touched. No hand-rolled input check is added; the placement check runs on internal state, not on caller input. |
| **IV. Explicit Upstream Error Propagation** | **Y** | The refusal is `UpstreamError` with the existing `CLI_REPORTED_ERROR` and a stable `details.code: "UNSAFE_PLACEMENT"`, `cause: null`, and `heading_path` / `block_id` plus `path`. The tool returns it as `isError: true` through `registerTool`. No silent fallback: today's silent wrong write becomes a loud refusal. No new top-level code or class; `src/errors.ts` is unchanged. |
| **V. Attribution & Layered Composition** | **Y** | Every new file carries `// Original — no upstream.` with its purpose. The changed handlers' and edit modules' header comments are updated to describe the per-line terminators and the placement check. |
| **ADR-009** (direct filesystem write path) | **Y** | Same substrate (`writeAtomic`, metadata refresh). Only the in-memory edit changes, and a refusal path is added before the write. |
| **ADR-010 / ADR-013** | **N/A** | No tool added or renamed. |
| **ADR-014** | **N/A** | Not plugin-backed. |
| **ADR-015** (sub-discriminators) | **Y** | `details.reason` is not used. The new value sits on `details.code`, beside `HEADING_RACE` and `BLOCK_ON_HEADING` (research F9). |
| **ADR-040** (published descriptions) | **Y** | Each description gains one enumeration entry with a short recovery note. The trigger and full recovery go to the help pages. Parameter descriptions are unchanged. |
| **MCP Tool Surface Standards** | **Y** | Titles, hints, input and output schemas are unchanged. Two descriptions change deliberately; the baseline is regenerated in this PR, and only those two fingerprints move (S1). |
| **Security Defaults** | **Y** | Untouched: same write paths, same `realpath` containment (`assertCanonicalPath`), no new command or mode. The change strengthens data safety: no write lands outside the named section or block. |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**Kernel-node attention (per CLAUDE.md)**:

- `createServer()`, `createLogger()` and `createQueue()` are not edited, and no production file gains a call to them.
- `UpstreamError` is not edited. The two handlers gain one new construction site each, with an existing code, as they already do for `HEADING_RACE` and `BLOCK_NOT_FOUND`.

## Project Structure

### Documentation (this feature)

```text
specs/086-fix-section-replacement/
├── plan.md                         # This file
├── research.md                     # F1–F11 findings, D1–D7 decisions
├── data-model.md                   # E1–E6, invariants V1–V7, state flow
├── quickstart.md                   # automated gate + red check, surface gate, optional live check
├── contracts/
│   └── placement-contract.md       # N1–N9, H1–H12, B1–B6, U1–U3, S1–S5
├── checklists/requirements.md
└── tasks.md                        # Phase 2: /speckit-tasks
```

### Source Code (repository root)

```text
src/tools/_note-lines.ts                                  # NEW leaf: split/text/insertEnding/join/lineStart/keepsOriginalAround (D1)
src/tools/_note-lines.test.ts                             # NEW: N1–N9 (D5)
src/tools/_line-ending-fixtures.ts                        # NEW, vitest-free test support: toCrlf / mix converters + HT / BT templates (matches the _*fixtures.ts build and coverage excludes)
src/tools/patch_heading/handler.ts                        # splitNoteLines + joinNoteLines; placement check → UNSAFE_PLACEMENT before race re-read; local reassemble deleted (D2, D3)
src/tools/patch_heading/body-edit.ts                      # detectLineEnding deleted; doc comments corrected (D2)
src/tools/patch_heading/body-edit.test.ts                 # detectLineEnding block + import removed (enumerated edit, D2)
src/tools/patch_heading/index.ts                          # + UNSAFE_PLACEMENT in the typed-error enumeration (D6)
src/tools/patch_heading/index.test.ts                     # + S5 case
src/tools/patch_heading/handler.line-endings.test.ts      # NEW: H1–H12 (D5)
src/tools/patch_heading/handler.unsafe-placement.test.ts  # NEW: U1, vi.mock("./heading-walk.js") (D4)
src/tools/patch_block/handler.ts                          # same split/join; placement check → UNSAFE_PLACEMENT; local reassemble deleted (D2, D3)
src/tools/patch_block/block-edit.ts                       # detectLineEnding deleted; doc comments corrected (D2)
src/tools/patch_block/block-edit.test.ts                  # detectLineEnding block + import removed (enumerated edit, D2)
src/tools/patch_block/index.ts                            # + UNSAFE_PLACEMENT in the typed-error enumeration (D6)
src/tools/patch_block/index.test.ts                       # + S5 case
src/tools/patch_block/handler.line-endings.test.ts        # NEW: B1–B6 (D5)
src/tools/patch_block/handler.unsafe-placement.test.ts    # NEW: U2, vi.mock("./block-scan.js") (D4)
src/tools/_register-baseline.json                         # regenerated; two description fingerprints move (S1)
docs/tools/patch_heading.md                               # Body-shape gotchas reworded; UNSAFE_PLACEMENT error row (D6)
docs/tools/patch_block.md                                 # line-endings sentence; UNSAFE_PLACEMENT error row (D6)
CHANGELOG.md                                              # [Unreleased] spec line + Fixed entry (D6)

# UNCHANGED: heading-walk.ts, block-scan.ts (finders), every splice helper's body, both schema.ts,
#   both _handler-fixtures.ts (unless a missing builder must be added, vitest-free),
#   both handler.test.ts and handler.bytes-written.test.ts, src/errors.ts, src/server.ts,
#   src/tools/_register.ts, src/tools/_note-io.ts, append_note/**, prepend/**
```

**Structure Decision**: single project. Production edits stay in each tool's own directory, plus one cohort leaf beside `_note-io.ts`. New tests are co-located and follow the spec 075 `handler.<topic>.test.ts` split.

**Test-edit scope** (per `.memory/refactor-decisions.md` §5): two existing test files change, and only by deletion:

- the `detectLineEnding` describe blocks at `body-edit.test.ts:201-213` and `block-edit.test.ts:197-213`;
- their imports at `body-edit.test.ts:8` and `block-edit.test.ts:7`.

These pin a function the change leaves without a production caller. No other existing assertion is edited. `patch_heading/handler.test.ts:189` (uniform CRLF) keeps passing unedited and is the FR-008 regression anchor. **Owner approval (2026-11-02, BI-0168, recorded in `.memory/refactor-decisions.md` §5) is conditional.** The deletion goes ahead only if, after the handler switch (tasks T006 / T012), a Grep finds no remaining caller of that tool's `detectLineEnding` in `src/`. If any caller remains, the fallback applies: keep `detectLineEnding` exported, with its tests unchanged (tasks T007, T008, T013).

**Docs-as-code**: `.docs-as-code/` pages describing either tool's editing or line-ending behaviour are updated by `/speckit-docs-as-code <n>` after review.

## Phase 0: Research → research.md

- **F1–F11**: code findings from CodeGraph and direct reads at HEAD `926bac7`.
- **D1–D7**: decisions, summarised above.
- **No follow-ups remain in scope.** F11 (`append_note`) is recorded as unaffected.

**Output**: research.md, with no `NEEDS CLARIFICATION` remaining.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)**:
  - E1 raw note;
  - E2 note line (new) with V1–V3;
  - E3 edit point;
  - E4 insert ending with V4;
  - E5 edited note with V5–V7;
  - E6 placement check;
  - the per-call state flow.
- **[contracts/placement-contract.md](contracts/placement-contract.md)**: N1–N9, H1–H12, B1–B6, U1–U3 and S1–S5, each mapped to the spec's FR, AS and SC IDs, plus the help-page error row text.
- **[quickstart.md](quickstart.md)**: the automated gate with a two-step red check (restore the old split, then remove the check), the baseline diff (exactly two fingerprints), and an optional live Sandbox reproduction through `set_property`.
- **Agent context**: the `CLAUDE.md` plan pointer is moved to this plan by the `after_plan` agent-context hook.

## Phase 1 re-check (post-design Constitution Check)

- **I**: `_note-lines.ts` is a leaf, imported downward by two handlers; acyclic, no cross-tool edge.
- **II**: failure (U1, U2), boundary (H6–H9, B3–B5, N-rows) and happy-path rows for both tools in the same change.
- **III**: no schema touched.
- **IV**: an existing code with a stable `details.code`; refusal before any write.
- **V**: headers present and updated.
- **Tool Surface Standards**: exactly two deliberate fingerprint moves.
- **Security Defaults**: untouched; data safety improved.

**No gate regressed; Complexity Tracking is empty.**

### Spec alignment note

- **FR-001 / FR-014**: E2 invariant V1, pinned by N3 and exercised by H1–H5 and B1–B2.
- **FR-002 / FR-003**: H1–H5.
- **FR-004 / FR-015 (endings kept)**: H7, B4.
- **FR-005 / FR-015 (insert ending)**: E4, N5–N6, H1, H4. The anchor is `markerLineIndex` for both tools. For `patch_block` that is the block's marker line, as spec FR-015 states.
- **FR-006**: H8, B4, N8.
- **FR-007**: H6, B3.
- **FR-008**: H9, B5, and the unedited `handler.test.ts:189`.
- **FR-009 / FR-016**: D3, N9, U1, U2.
- **FR-010 / FR-016 (error)**: `CLI_REPORTED_ERROR` + `UNSAFE_PLACEMENT`; U3 shows nothing else moved.
- **FR-011 / FR-017**: schemas, success shape and annotations unchanged.
- **FR-012 / FR-017 (help and description)**: S2 and S3 cover the help pages. S5 covers the `UNSAFE_PLACEMENT` entry each description's typed-error list must now include (analysis remediation I2). S1 and SC-006 hold the baseline to exactly those two description fingerprints. `UNSAFE_PLACEMENT` stays a `details.code` under `CLI_REPORTED_ERROR` (ADR-015).
- **FR-013 / FR-018**: the contract rows above.
- **SC-001–SC-007**: H-, B- and U-rows; S1 and S4 for SC-006.

### CodeGraph structural check

Run with `codegraph_explore` at plan time (HEAD `926bac7`).

**Affected symbols and blast radius**:

- `executePatchHeading` (`src/tools/patch_heading/handler.ts:94`): the only production caller is `createPatchHeadingTool` (`index.ts:31`) through `registerTool`. That factory is called by `server.ts` and `_typed-result-fixtures.ts`. Tests: `handler.test.ts`, `handler.bytes-written.test.ts`, `index.test.ts`. The success envelope is unchanged, so the fixtures are unaffected.
- `executePatchBlock` (`src/tools/patch_block/handler.ts:89`): the same pattern through `createPatchBlockTool` (`index.ts:33`).
- `detectLineEnding` in `body-edit.ts:90` and `block-edit.ts:121`: imported only by their own handler and their own `*-edit.test.ts` (grep at plan time confirms there is no other importer). Both are deleted.
- `applyAppend`, `applyPrepend`, `applyReplace`, `applyDetachReattach`, `applyVerbatimMarkerPreserve`: called only by their handler and their `*-edit.test.ts`. Their bodies are not edited.
- `walkHeadings`, `findBlock`, `scanBlocks`, `splitLinesForScan` (both): not edited. They are the index authority that `_note-lines.ts` mirrors (V1).
- `PATCH_HEADING_DESCRIPTION` and `PATCH_BLOCK_DESCRIPTION`: consumed by their factories and `index.test.ts`. Their fingerprints move deliberately, through `fingerprintLiveRegistry` → `createServer()`.
- `append_note`'s `detectLineEnding` (`append-edit.ts:3`): a different symbol, not touched (F11).

**Kernel-node touch surface**: `createServer()`, `createLogger()` and `createQueue()` are not edited, and no production file gains a call to them. `UpstreamError` is not edited; each handler adds one construction with the existing `CLI_REPORTED_ERROR`. That is the explicit no-touch claim for post-implement verification.

**Post-implement structural verification** (after `codegraph sync`):

1. No new error class or top-level code; `src/errors.ts` is unchanged.
2. No handler imports `createLogger` or `createQueue`; `server.ts` is unchanged.
3. `_note-lines.ts` imports nothing. Its importers are exactly the two handlers, plus its own test. No `patch_heading` ↔ `patch_block` edge.
4. Every `_note-lines.ts` export has a production caller in at least one handler: `splitNoteLines`, `lineText`, `insertEnding`, `joinNoteLines`, `lineStart` and `keepsOriginalAround`. Neither `detectLineEnding` export remains in either tool.

## Follow-ups (out of scope)

- `set_property` writing an LF frontmatter on a CRLF note is tracked separately (spec Out of Scope).
- `patch_block` has no re-read race check (spec Out of Scope). Raise it as its own backlog item if wanted.

## Complexity Tracking

> No Constitution Check violations; the table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
