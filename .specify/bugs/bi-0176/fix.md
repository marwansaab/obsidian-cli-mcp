# Bug Fix: write_note resolves a note name only at the vault root

- **Slug**: bi-0176
- **Fixed**: 2026-11-03
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`write_note` now resolves a specific-mode `file` name through the same `obsidian file` lookup (`resolveFileByTsv`) that `read`, `patch_heading` and `patch_block` use, so an existing note is written wherever it is. Only a name Obsidian reports as not found (`Error: File "<name>" not found.`) falls back to the documented vault-root short-form rule; any other lookup failure propagates and nothing is written. Filesystem failures other than `EEXIST` now go through the cohort's `mapFsWriteError`: a lock (`EBUSY` / `EPERM`) is `CLI_REPORTED_ERROR` / `EXTERNAL_EDITOR_CONFLICT`, and every `FS_WRITE_FAILED` (`EACCES` included) carries the vault-relative path instead of the absolute disk path.

## Owner rulings for this step (2026-11-03)

- **Q1 = B: the lookup is `resolveFileByTsv`, as the assessment proposes.** No vault-confirming eval and no `VAULT_MISMATCH` sub-code are built. This supersedes item 51 of `.memory/refactor-decisions.md`, which describes a `NAME_LOOKUP_TEMPLATE` eval, `lookupNoteByName` and `VAULT_MISMATCH`. That item records the closed, never-merged dry-run PR #126 and does not apply to this change. **Code review: do not apply item 51 to this PR.** Rationale (owner): it matches the BI's acceptance criterion ("the note chosen is the one reading by that name returns") and ADR-032's cohort parity rule.
- **Q2 = A: the existing-test edits listed under *Tests Added or Updated* are approved, and nothing else** (refactor-decisions item 5). No other existing assertion failed.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/write_note/handler.ts` | modified | `resolveSpecificModePath` is now async. For a `file` name it calls `resolveFileByTsv(deps, vault, file, "write_note")` after the registry's `resolveVaultPath` (an unknown vault still costs no spawn). It falls back to the short-form rule only when the `CLI_REPORTED_ERROR`'s `details.message` matches `FILE_NOT_FOUND_LINE`; anything else is rethrown. `mapFsError(e, relPath)` keeps the `EEXIST → FILE_EXISTS { errno }` branch and routes every other errno to `mapFsWriteError` with `EDITOR_CONFLICT_ERRNOS = {EBUSY, EPERM}` and `conflictVerb: "write"`. Header comment updated. |
| `src/tools/write_note/schema.ts` | modified | `file` description: "An existing note of that name is the one written, wherever it is; a name no note has is created at the vault root." |
| `src/tools/_register-baseline.json` | regenerated | `npm run baseline:write`. Only `write_note`'s `schemaFingerprint` moved, plus the branch and date header. A deliberate published-surface change. |
| `src/tools/write_note/_handler-fixtures.ts` | modified | Adds `fileNotFoundResponse(name)`, Obsidian's not-found answer. Still vitest-free. |
| `src/tools/write_note/handler.note-name.test.ts` | added test | The name-resolution battery (below). |
| `src/tools/write_note/handler.fs-errors.test.ts` | added test | The lock and vault-relative-path battery (below). |
| `src/tools/write_note/handler.test.ts` | modified (approved) | The four `020/US1` `file` cases queue one not-found lookup reply; #9 (rename `EPERM`) expects `CLI_REPORTED_ERROR` / `EXTERNAL_EDITOR_CONFLICT`, title updated. 984 lines, under the 1000-line gate. |
| `src/tools/write_note/handler.file-type.test.ts` | modified (approved) | The `file` cases queue one not-found lookup reply; no assertion changed. |
| `src/tools/write_note/handler.bytes-written.test.ts` | modified (approved) | The stat-`EACCES` case expects `details.path: "n.md"` instead of `"/test-vault/n.md"`; the code stays `FS_WRITE_FAILED`. |
| `src/tools/_fs-errors.ts` | modified (comments only) | The header and the `conflictErrnos` doc no longer say write_note keeps its own mapper. |
| `docs/tools/write_note.md` | modified | Overview, `file` row, new *`file` resolution* paragraph (lookup first, shared-name rule, folder-qualified names, not-found fallback, propagation) followed by the *Short-form rule* paragraph, *File types* table, `path` output row, `FILE_EXISTS` row, new `EXTERNAL_EDITOR_CONFLICT` row, `FS_WRITE_FAILED` row (vault-relative path; `EPERM` moved out, `EACCES` kept), two new lookup-failure `CLI_REPORTED_ERROR` rows (`file-tsv-parse`, other `Error:` line). |
| `CHANGELOG.md` | modified | Unreleased → Fixed entry, with the `overwrite: false` behaviour change and the error-contract change. |

## Diff Highlights

```ts
const EDITOR_CONFLICT_ERRNOS: ReadonlySet<string> = new Set(["EBUSY", "EPERM"]);
const FILE_NOT_FOUND_LINE = /^\s*Error: File ".*" not found\.\s*$/m;

async function resolveSpecificModePath(input: WriteNoteInput, deps: ExecuteDeps): Promise<string> {
  if (input.path !== undefined) return input.path;
  const file = input.file!;
  try {
    return await resolveFileByTsv(deps, input.vault!, file, "write_note");
  } catch (e) {
    if (!(e instanceof UpstreamError) || !FILE_NOT_FOUND_LINE.test(stringDetail(e.details, "message"))) {
      throw e;
    }
  }
  return isCanonicalShortForm(file) ? `${file}.md` : file;
}

function mapFsError(e: unknown, relPath: string): UpstreamError {
  if (getErrno(e) === "EEXIST") {
    return new UpstreamError({ code: "FILE_EXISTS", cause: e, details: { errno: "EEXIST" } });
  }
  return mapFsWriteError(e, { relPath, conflictErrnos: EDITOR_CONFLICT_ERRNOS, conflictVerb: "write" });
}
```

## Tests Added or Updated

- `handler.note-name.test.ts` (new):
  - Sub-folder name, `overwrite: true`: one `obsidian file` spawn with `vault=TestVault` and `file=Alpha`; the rename lands on `Sub/Alpha.md`, every write is under `Sub/`, the response is `{ created: false, path: "Sub/Alpha.md", bytes_written: 0 }`, and the metadata refresh names `Sub/Alpha.md`.
  - Sub-folder name, `overwrite: false`: `FILE_EXISTS` with `details` `{ errno, path: "Sub/Alpha.md", vault }`; the `wx` create is tried only on `Sub/Alpha.md`.
  - Root name (boundary): resolves to `Alpha.md`, as before.
  - A name resolving to a non-note (`Att/Plan.png`): `UNSUPPORTED_FILE_TYPE`, nothing written.
  - A folder-qualified name that exists (`Folder/Note` → `Folder/Note.md`) resolves to it.
  - Cold start: `Error: Command "file" not found.` then the TSV; the lookup is re-run and succeeds.
  - Not found → fallback: `Beta` → `Beta.md`, `Beta.md` → `Beta.md`, `version_1.2.3` → `version_1.2.3.md`, `Folder/Beta.md` verbatim, each `created: true`; `overwrite: false` creates the root note with the `wx` flag.
  - Other lookup failures propagate with nothing written: a TSV without a `path` line (`file-tsv-parse`) and a different `Error:` line (message passed through).
  - No lookup where none is needed: unknown vault → `VALIDATION_ERROR` with zero spawns; `path` and active mode make no `file=` spawn.
- `handler.fs-errors.test.ts` (new):
  - `EPERM` / `EBUSY` on the rename → `CLI_REPORTED_ERROR` with `details` exactly `{ code: "EXTERNAL_EDITOR_CONFLICT", reason: "file-locked", path: "Sub/Alpha.md", errno }`; the vault root appears nowhere in `message` or `details`; the tmp file is unlinked.
  - `EPERM` on `stat`, `writeFile` and `mkdir` → the same conflict, no absolute path.
  - `ENOSPC` and `EACCES` (ADR-009 Decision point 7 boundary) → `FS_WRITE_FAILED` with `details` exactly `{ errno, syscall, path: "Sub/Alpha.md" }` and the exact vault-relative message.
  - `EPERM` on the `overwrite: false` create → the editor conflict.
- Approved edits to existing tests: see the *Changes* table. The `EEXIST` asymmetry test (`020/US2 mapFsError EEXIST keeps single-field details`) is unchanged and green.

## Local Verification

- `npx vitest run src/tools/write_note src/tools/_fs-errors.test.ts src/tools/_plugin-noise.test.ts src/tools/_file-type-support.test.ts` → 10 files, 567 tests passed.
- `npm run baseline:write` → 35 entries; only `write_note`'s `schemaFingerprint` changed.
- `npm run lint` → exit 0. `npx tsc --noEmit` → exit 0. `npm run build` → exit 0.
- `npm test` (full suite, coverage floor) → 193 files passed (1 skipped), 4515 tests passed (6 skipped); statements 97.07%, branches 94.72%, functions 92.33%, lines 97.84% (floor 91.3%).
- Live probes were not run in this step. The sub-folder overwrite by name, the not-found fallback, `overwrite: false` on a sub-folder name and the Windows lock probe need the built server against the authorised test vault (`.memory/test-execution-instructions.md`) and belong to `/speckit-bug-test`.

## CodeGraph structural verification

Run with `codegraph_explore` (after `codegraph sync`) on `resolveSpecificModePath`, `FILE_NOT_FOUND_LINE`, `EDITOR_CONFLICT_ERRNOS`, `mapFsError`, `createWriteNoteTool` and `fileNotFoundResponse`.

1. **No new error codes (Principle IV).** Only existing codes are used: `FILE_EXISTS`, `FS_WRITE_FAILED`, `CLI_REPORTED_ERROR` (with the existing `EXTERNAL_EDITOR_CONFLICT` sub-code, built by `mapFsWriteError`) and the propagated lookup errors. `src/errors.ts` is untouched; no `VAULT_MISMATCH` exists.
2. **No boot-time DI factory in the handler.** `write_note/handler.ts` imports neither `createLogger()` nor `createQueue()`; `logger` and `queue` arrive through `ExecuteDeps` and pass to `resolveFileByTsv` as deps.
3. **Placement and import direction (Principle I).** The new symbols live in `src/tools/write_note/handler.ts`. Its new imports (`resolveFileByTsv` from `_active-file.ts`, `mapFsWriteError` from `_fs-errors.ts`, `stringDetail` from `errors.ts`) run down to tools-level shared modules and the error module, like its existing imports. No upward or cyclic edge.
4. **Reachability.** `resolveSpecificModePath`, `FILE_NOT_FOUND_LINE`, `EDITOR_CONFLICT_ERRNOS` and `mapFsError` are reached from `executeWriteNote`, which `createWriteNoteTool` (`write_note/index.ts`) calls. `fileNotFoundResponse` is test support used by three test files.

**Kernel-node claim.** The assessment said the fix touches no kernel node, and that held: `createLogger()`, `createQueue()` and `createServer()` are untouched; `UpstreamError` is constructed, not modified.

## Deviations from Assessment

- **`handler.bytes-written.test.ts` changed**, though not listed under *Files likely to change*: its stat-`EACCES` case pinned the absolute OS path, which the remediation deliberately replaces with the vault-relative path. Owner-approved (Q2).
- **Existing test #9 in `handler.test.ts` changed its expected code** (`EPERM` rename → `EXTERNAL_EDITOR_CONFLICT`), the case the assessment moves out of `FS_WRITE_FAILED`. Owner-approved (Q2).
- **The lock and error tests are in a new co-located file, `handler.fs-errors.test.ts`**, so `handler.test.ts` stays under the 1000-line gate.
- **`src/tools/_fs-errors.ts` (comments only) changed**: its header and `conflictErrnos` doc said write_note keeps its own mapper.
- **`mapFsError` checks `getErrno(e) === "EEXIST"` instead of the raw `.code` cast.** For a fixed-string predicate the two are equivalent; the `FILE_EXISTS` details stay `{ errno: "EEXIST" }`. Non-`EEXIST` errno extraction is now `mapFsWriteError`'s.
- **The not-found pattern is a local `FILE_NOT_FOUND_LINE`, not a shared constant.** The assessment suggested one shared pattern "if practical"; sharing it means editing `prepend/handler.ts`, outside this fix's file list, so it is left as a follow-up. The regex is byte-identical to the first entry of `prepend`'s `NOTE_NOT_FOUND_PATTERNS`.
- **`describeNoteNameLocator` is not reused.** Its N4 row expects a miss to fail, which is the opposite of write_note's documented create-by-name, so the write_note rows are written directly in `handler.note-name.test.ts` (the assessment allowed either).
- **`src/tools/write_note/index.ts` is unchanged.** `WRITE_NOTE_DESCRIPTION` lists no typed errors, so nothing needed adding (optional per the assessment).

## Follow-ups

- `/speckit-bug-test slug=bi-0176`: run the live probes in the authorised test vault: a sub-folder note overwritten by bare name (in place, no root copy, `read` by name returns the new content), the not-found fallback, `overwrite: false` on a sub-folder name (`FILE_EXISTS`), and the Windows lock probe (expect `EXTERNAL_EDITOR_CONFLICT`, no absolute path, file unchanged).
- `.memory/refactor-decisions.md` item 51 is stale: it describes the dry-run eval design that the owner ruling (Q1 = B) superseded. The owner, or the code review with the owner's leave, should rewrite or remove it. The note at its lines on `write_note.mapFsError` (conflict set `{EBUSY, EPERM}`, vault-relative `relPath`) is accurate for this change.
- ~~Share the `Error: File "<name>" not found.` pattern between `prepend` and `write_note`~~: done in the code-review fixes below.
- `/speckit-docs-as-code` should update `.docs-as-code/` for write_note's name resolution and error mapping.

## Code review fixes (PR #127, 2026-11-03)

The thermo-nuclear code-quality review of PR #127 raised three findings. None changes behaviour, and no existing assertion changed.

- **The not-found check moved to the lookup module.** `_active-file.ts` now exports `FILE_NOT_FOUND_LINE` (Obsidian's `Error: File "<name>" not found.` line) and `findFileByTsv`, which is `resolveFileByTsv` returning `null` only for a `CLI_REPORTED_ERROR` whose `details.message` is that line; every other failure propagates unchanged. `write_note`'s `resolveSpecificModePath` is now `path ?? findFileByTsv(...) ?? short-form rule`, without the try/catch, the local regex or the `stringDetail` import. `resolveFileByTsv` is unchanged. `prepend`'s `NOTE_NOT_FOUND_PATTERNS` takes its first entry from the shared constant (the same regex, so prepend is byte-neutral). New `findFileByTsv` cases in `_active-file.test.ts`. This supersedes the *Deviations* note that kept the pattern local.
- **`mapFsError` is a closure built once after the path is resolved**, as in the sibling writers, instead of taking `relPath` at five call sites. Same mapping.
- **`fileNotFoundResponse` moved to `_handler-test-fixtures.ts`** beside `fileTsvResponse`, because Obsidian's not-found answer is not specific to write_note. Other test files that type the line by hand are left until they are next touched.

Left as they were: the duplicated `rejection()` test helper (the shared fixture module must stay free of vitest, and the battery's copy is private to it). The review's proposal to name the two editor-conflict errno sets in `_fs-errors.ts` would touch `append_note`, `patch_block` and `patch_heading`, which the assessment's remediation does not cover, so it was put to the owner as a question rather than done here.
