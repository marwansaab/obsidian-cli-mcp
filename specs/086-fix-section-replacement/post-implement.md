# Post-implement: 086 Fix section replacement

Run on branch `086-fix-section-replacement` (base `d81d797`), 2026-11-02, Windows, PowerShell.

## T001 — starting gate (before any edit)

`npm run typecheck; if ($?) { npm run lint }; if ($?) { npm test }`: all three passed. Coverage summary at the start: statements 96.87%, branches 94.55%, functions 91.68%, lines 97.69%. No pre-existing failure.

## Red evidence (tests written before the code they prove)

- **T003**: `_note-lines.test.ts` failed to load before `_note-lines.ts` existed (module not found). After T004: 22 passed.
- **T005 / T009 / T016**: `patch_heading/handler.line-endings.test.ts` was written in full before T006 and run on the unfixed handler: 42 failed, 13 passed. Every H1–H5 and H10 row failed, as did the mixed-note rows of H6, H7, H8 (`replace ""`) and H11.
- **T009, H9 regression anchor**: H9 was written and run **before T006**, on the unfixed handler: `-t "H9"` → 6 passed. It still passes after the fix. (The revert-only-the-handler procedure was not needed.)
- **T010 / T011**: on the unfixed `patch_block` handler, `handler.line-endings.test.ts` → 15 failed, 8 passed (B1, B2, B3, B4 failed; the 6 B5 rows and the 2 B6 rows passed, as required), and U2 failed (the edit was written instead of refused).
- **T017**: U1 failed before T018 (the edit was written instead of refused).

## T007 — `detectLineEnding` gate, `patch_heading`

Grep for `detectLineEnding` over `src/` (excluding `*.test.ts` and `append_note/`) after T006:

```text
src\tools\patch_block\handler.ts:8:  detectLineEnding,            ← patch_block's own symbol, from ./block-edit.js
src\tools\patch_block\handler.ts:113:  const lineEnding = detectLineEnding(originalContent);
src\tools\patch_block\block-edit.ts:121:export function detectLineEnding(...)
src\tools\patch_heading\body-edit.ts:90:export function detectLineEnding(...)   ← definition only
```

No caller of `patch_heading/body-edit.ts`'s `detectLineEnding` remained, so the gate allowed the deletion: the export and its doc comment were deleted, the two doc-comment corrections made, and T008 deleted the `describe("detectLineEnding", …)` block and the import from `body-edit.test.ts` (nothing else in that file changed).

## T013 — `detectLineEnding` gate, `patch_block`

Same Grep after T012:

```text
src\tools\patch_block\block-edit.ts:121:export function detectLineEnding(...)   ← definition only
```

No caller remained, so the export and its doc comment were deleted from `block-edit.ts`, the header comment was corrected (it said the handler detects the file's line ending), and the `describe("detectLineEnding (FR-013)", …)` block and the import were deleted from `block-edit.test.ts` (nothing else in that file changed). `append_note`'s `detectLineEnding` is a different symbol and is untouched.

## T021 — surface baseline (contract S1)

`npm run baseline:write`, then `git diff src/tools/_register-baseline.json`:

- `patch_block` `descriptionFingerprint` changed;
- `patch_heading` `descriptionFingerprint` changed;
- the file's `generatedFromBranch` stamp changed from `085-stabilise-query-ordering` to `086-fix-section-replacement`. This is the script's metadata, rewritten on every regeneration (085 moved it the same way); it is not a tool fingerprint.

No title, annotation, input-schema or output-schema fingerprint moved. `npx vitest run src/tools/_register.test.ts src/tools/_surface.test.ts` → 168 passed.

## T023 — full gate

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm test` (with the coverage floor): 179 files passed, 1 skipped; 4304 tests passed, 6 skipped. Coverage: statements 96.89%, branches 94.57%, functions 91.72%, lines 97.70% (each up on T001).
- `npm run format:check`: **fails, pre-existing and not caused by this change.** The working copy has `core.autocrlf=true`, so Prettier (`endOfLine: "lf"`) flags almost every file in the repository, including files this change does not touch (for example `CONTRIBUTING.md` and the `specs/04x` folders). CI does not run `format:check`. With line endings ignored (`--end-of-line auto`), every new file passes. Four touched files (`patch_heading/index.test.ts`, `patch_block/index.test.ts`, `patch_heading/body-edit.ts`, `patch_block/block-edit.ts`) were already not Prettier-clean at `HEAD`; they were not reformatted, to keep the diff to the planned edits.
- `git diff --stat` shows no change to `src/errors.ts`, `heading-walk.ts`, `block-scan.ts`, both `schema.ts`, `src/server.ts`, both `handler.test.ts`, both `handler.bytes-written.test.ts`, or either `_handler-fixtures.ts` (contract S4, U3; no fixture builder was missing).

## T024 — quickstart §1 red check

Each handler was temporarily edited, the US1 / B1–B2 rows run, and the file restored from a copy (confirmed restored afterwards; the full suite was re-run green).

| Handler | Step | Edit | Result |
|---|---|---|---|
| `patch_heading` | 1 | old split restored (`split(/\r\n/)` once any CRLF exists), check kept | H1–H5, H10: 11 failed, every failure the `UNSAFE_PLACEMENT` refusal ("could not be placed safely"), no other assertion error |
| `patch_heading` | 2 | old split, check bypassed | 11 failed on wrong bytes (assertion errors), no refusal |
| `patch_block` | 1 | old split restored, check kept | B1–B2: 6 failed, every failure the `UNSAFE_PLACEMENT` refusal |
| `patch_block` | 2 | old split, check bypassed | 6 failed on wrong bytes, no refusal |

## T025 — post-implement structural verification

`codegraph sync`, then `codegraph_explore` on the `_note-lines.ts` exports, `executePatchHeading` and `executePatchBlock`:

1. **No new error code or class.** Both refusals are `UpstreamError` with the existing `CLI_REPORTED_ERROR` and `details.code: "UNSAFE_PLACEMENT"`; `src/errors.ts` is unchanged.
2. **No DI-factory import.** Neither handler nor `_note-lines.ts` imports `createLogger` or `createQueue`; `server.ts` is unchanged and is still the only production file constructing them.
3. **Module position.** `_note-lines.ts` imports nothing. Its importers are exactly `patch_heading/handler.ts` and `patch_block/handler.ts`, plus `_note-lines.test.ts` and the two `handler.line-endings.test.ts` files. There is no `patch_heading` ↔ `patch_block` edge.
4. **Reachability.** Every export has a production caller: `splitNoteLines`, `lineText`, `insertEnding`, `joinNoteLines`, `lineStart` and `keepsOriginalAround` are each called by both handlers. `detectLineEnding` no longer exists in either tool.

Kernel nodes: `createServer()`, `createLogger()`, `createQueue()` and `UpstreamError` are not edited; each handler gains one `UpstreamError` construction with an existing code, as the plan claimed.

## T026 — optional live check (quickstart §3)

**Not run.** This implementation ran unattended, and the live check needs `TestVault-Obsidian-CLI-MCP` focused in a running Obsidian (`.memory/test-execution-instructions.md`). The automated rows (H1–H12, B1–B6, U1–U2) and the red check cover the behaviour in-process.
