# Bug Fix: find_and_replace returns a pass-through CLI error for a missing note named by name

- **Slug**: bi-0178
- **Fixed**: 2026-11-03
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`find_and_replace`'s single-note `file` scope now looks the name up with `findFileByTsv`, so a name Obsidian reports as not found fails with the documented FR-008 envelope (`VALIDATION_ERROR`, `details: { code: "INVALID_NOTE", reason: "not-found", note: <name as given> }`) instead of the lookup's pass-through `CLI_REPORTED_ERROR`. The `path` form and the name form now build that envelope through one local helper, so they cannot drift apart. This is the assessment's Preferred remediation (owner ruling Q1 = A); the spec, tool description and help already describe this behaviour and are unchanged.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/find_and_replace/handler.ts` | modified | `resolveSingleNoteScope`'s `file` branch calls `findFileByTsv` (was `resolveFileByTsv`); a `null` result throws `invalidNoteNotFound(name, null)`. New private `invalidNoteNotFound(note, cause)` builds the FR-008 envelope; `assertExists` now uses it for the `path` form (byte-identical code, message and details). Import swapped from `resolveFileByTsv` to `findFileByTsv`; the `resolveSingleNoteScope` doc comment names the new behaviour. |
| `src/tools/find_and_replace/scope.test.ts` | added tests | Four BI-0178 cases beside the existing path-miss case (US1 describe block); imports `recordingCall` and `fileNotFoundResponse` from `_handler-test-fixtures.ts`. |
| `src/tools/_active-file.ts` | comment only | PR #134 review fix (a): `findFileByTsv`'s doc comment and the module header state the general contract (`null` only on Obsidian's not-found line, the caller decides what a miss means) and name both consumers. |
| `src/tools/_handler-test-fixtures.ts` | added helper | PR #134 review fix (b), owner ruling A: `recordingCall(toolName, answer?)` returns `{ call, asked }`, an `answeredCall` whose `confirm` records each question. |
| `src/tools/find_and_replace/confirm.test.ts` | call construction only | PR #134 review fix (b), owner ruling A: the "confirmed" and "subfolder scope" tests build their call with `recordingCall` instead of a hand-written recording wrapper. No assertion, expected value or title changed. |

## Diff Highlights (optional)

```ts
const name = input.file as string;
// A name Obsidian reports as not found gets the same FR-008 envelope as a
// missing `path` (BI-0178); every other lookup failure propagates.
const found = await findFileByTsv(deps, vaultName, name, "find_and_replace");
if (found === null) throw invalidNoteNotFound(name, null);
relPath = toVaultRelative(found);
```

```ts
function invalidNoteNotFound(note: string, cause: unknown): UpstreamError {
  return new UpstreamError({
    code: "VALIDATION_ERROR",
    cause,
    details: { code: "INVALID_NOTE", reason: "not-found", note },
    message: `find_and_replace: note "${note}" does not exist in vault`,
  });
}
```

The helper is named `invalidNoteNotFound`, not `noteNotFound` as the assessment suggested as an example, because `noteNotFound` is already the shared `NOTE_NOT_FOUND` builder in `src/tools/_fs-errors.ts` (a different error code). It stays private to the handler: it builds a `find_and_replace`-specific message and has no other caller.

## Tests Added or Updated

- `src/tools/find_and_replace/scope.test.ts` › "missing named file (preview) → INVALID_NOTE/not-found naming the name as given (BI-0178)" — lookup answers `Error: File "ghost" not found.` → `VALIDATION_ERROR`, `details` deep-equal `{ code: "INVALID_NOTE", reason: "not-found", note: "ghost" }`, exact message, one spawn, no read, no write.
- › "missing named file (commit, confirming client) → same envelope; no confirmation asked, nothing written (BI-0178)" — `commit: true` with a confirming client whose `confirm` records calls: same envelope, `confirm` never called, one spawn, no read, write or rename.
- › "name miss and path miss share one envelope shape (BI-0178 parity)" — same `code`, same `details` keys in the same order, same `details.code` / `details.reason`.
- › "a lookup answer with no path line still fails as CLI_REPORTED_ERROR file-tsv-parse (BI-0178: only the not-found line maps)" — other lookup failures still propagate unchanged.
- Existing "missing named note → INVALID_NOTE/not-found naming the note (US3-AC4)" (path form) passes unchanged.

## Local Verification

- Commands run:
  - `npx vitest run src/tools/find_and_replace` → 8 files passed, 1 skipped; 190 tests passed, 6 skipped.
  - Red check: with only `handler.ts` reverted, `npx vitest run src/tools/find_and_replace/scope.test.ts` → the three new name-miss / parity tests fail (the fourth, propagation, passes on both, as intended); with the fix restored all pass.
  - `npm run typecheck` → clean.
  - `npx eslint src/tools/find_and_replace` → clean.
  - `npm test` (full suite with coverage) → 196 files passed, 1 skipped; 4811 tests passed, 6 skipped.
  - After the PR #134 review fixes: `npm run lint`, `npm run typecheck` and `npm run build` clean; `npm test` → 196 files passed, 1 skipped; 4811 tests passed, 6 skipped; no existing test failed.
  - `npx prettier --check` on the two touched files reports style warnings, but it reports the same warnings on both files at HEAD before this change (pre-existing drift; not reformatted, to keep the diff surgical).
- Manual checks: none. The live check against the authorised test vault (TC-00784 name form, TC-00783 path form) belongs to `/speckit-bug-test`, per `.memory/test-execution-instructions.md`.

## CodeGraph structural verification

Index synced (`codegraph sync`) after the change; `codegraph_explore` on `invalidNoteNotFound`, `resolveSingleNoteScope`, `findFileByTsv` and the kernel nodes.

1. **No new error codes** (Principle IV): the fix constructs `UpstreamError` with the existing `VALIDATION_ERROR` code and the existing `INVALID_NOTE` / `not-found` sub-code. No error class was added outside `src/errors.ts`.
2. **No boot-time DI factory imports**: `find_and_replace/handler.ts` imports neither `createLogger()` nor `createQueue()`; both still receive their instances through `ExecuteDeps`. Their only production constructor remains `server.ts`.
3. **Module placement and import direction** (Principle I): `invalidNoteNotFound` sits in `src/tools/find_and_replace/handler.ts`; the new import (`findFileByTsv`) runs downward from the tool to the shared `_active-file.ts` leaf, the same edge the handler already had for `resolveFileByTsv`. No upward or sideways import.
4. **Reachability**: `invalidNoteNotFound` has two production callers (`assertExists` and `resolveSingleNoteScope`); `findFileByTsv` now has production callers in `write_note` and `find_and_replace`.

Kernel-node claim from `assessment.md` held: the fix touches none of `createLogger()`, `createQueue()`, `UpstreamError` (constructed, not changed) or `createServer()`. No deviations.

## Deviations from Assessment

- Helper name: `invalidNoteNotFound` instead of the assessment's example name `noteNotFound`, to avoid shadowing the shared `noteNotFound` (`NOTE_NOT_FOUND`) builder in `src/tools/_fs-errors.ts` (`.memory/refactor-decisions.md` item 38). Behaviour is as specified.
- The `handler.ts` line-1 attribution header does not list the single-note failure shapes, so it was not changed.

## Follow-ups

- `/speckit-bug-test slug=bi-0178`: repeat TC-00784 (`file: "<ghost name>"`, `commit: true`) and TC-00783 (`path` form) in the authorised test vault; confirm both return the documented envelope and nothing is written.
- CHANGELOG: note the behaviour change for callers who matched Obsidian's not-found text in `details.stdout` for `find_and_replace` (assessment Risks).
- `/speckit-docs-as-code`: check whether `.docs-as-code/capabilities/mutate.md` describes the single-note failure shapes.
