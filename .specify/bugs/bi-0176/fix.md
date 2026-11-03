# Bug Fix: write_note resolves a note name only at the vault root

- **Slug**: bi-0176
- **Fixed**: 2026-11-03
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`write_note` now resolves a specific-mode `file` name through the same `obsidian file` lookup that `read`, `patch_heading` and `patch_block` use. An existing note is written wherever it is, and only a name Obsidian reports as not found falls back to the documented vault-root short-form rule. Filesystem failures other than `EEXIST` now go through the cohort's `mapFsWriteError`. A lock (`EBUSY` / `EPERM`) is reported as `CLI_REPORTED_ERROR` / `EXTERNAL_EDITOR_CONFLICT`, and every `FS_WRITE_FAILED` carries the vault-relative path instead of the absolute disk path.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/write_note/handler.ts` | modified | `resolveSpecificModePath` is now async. It calls `resolveFileByTsv` for a `file` name, and falls back to the short-form rule only when `details.message` matches `Error: File "<name>" not found.`; any other failure propagates. The vault registry still resolves first. `mapFsError(e, relPath)` keeps the `EEXIST → FILE_EXISTS {errno}` branch and routes every other errno to `mapFsWriteError` with `CONFLICT_ERRNOS = {EBUSY, EPERM}` and `conflictVerb: "write"`. Header comment updated. |
| `src/tools/write_note/schema.ts` | modified | `file` description: "An existing note of that name is the one written, wherever it is; a name no note has is created at the vault root." |
| `src/tools/_register-baseline.json` | regenerated | `npm run baseline:write`. Only `write_note`'s `schemaFingerprint` moved, plus the branch and date header. This is a deliberate published-surface change. |
| `src/tools/write_note/_handler-fixtures.ts` | modified | Adds `fileNotFoundResponse(name)`, the canned not-found answer. Still vitest-free. |
| `src/tools/write_note/handler.note-name.test.ts` | added test | The name-resolution battery (see below). |
| `src/tools/write_note/handler.fs-errors.test.ts` | added test | The lock and vault-relative-path battery (see below). |
| `src/tools/write_note/handler.test.ts` | modified | The four 020/US1 `file` cases queue a not-found lookup response; no assertion changed. The rename-`EPERM` case (#9) now expects `CLI_REPORTED_ERROR` / `EXTERNAL_EDITOR_CONFLICT` (title updated; the tmp-unlink assertion is unchanged). 982 lines, under the 1000-line gate. |
| `src/tools/write_note/handler.file-type.test.ts` | modified | The `file` cases queue a not-found lookup response; no assertion changed. |
| `src/tools/write_note/handler.bytes-written.test.ts` | modified | The stat-`EACCES` case expects `details.path: "n.md"` (vault-relative) instead of the OS path. |
| `src/tools/_fs-errors.ts` | modified (comments only) | The header and `conflictErrnos` doc no longer say write_note keeps its own mapper. |
| `docs/tools/write_note.md` | modified | Overview, `file` row, the `file` resolution section (lookup first, short-form rule for a name no note has), File types table, `path` output row, `FILE_EXISTS` row, new `EXTERNAL_EDITOR_CONFLICT` row, `FS_WRITE_FAILED` row (vault-relative path; EPERM moved out), new lookup-failure `CLI_REPORTED_ERROR` row. |
| `CHANGELOG.md` | modified | Unreleased → Fixed entry, including the `overwrite: false` behaviour change and the error-contract change. |

## Diff Highlights

```ts
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
  return mapFsWriteError(e, { relPath, conflictErrnos: CONFLICT_ERRNOS, conflictVerb: "write" });
}
```

## Tests Added or Updated

- `handler.note-name.test.ts`:
  - "overwrite=true replaces that note": one `obsidian file file=Alpha vault=TestVault` spawn. The rename lands on `Sub/Alpha.md`, every write is under `Sub/`, the response is `{ created: false, path: "Sub/Alpha.md" }`, and the refresh eval names `Sub/Alpha.md`.
  - "overwrite=false returns FILE_EXISTS for the resolved note": the `wx` create is attempted only on `Sub/Alpha.md`, `details` is `{ errno, path: "Sub/Alpha.md", vault }`, and nothing is renamed.
  - "a name resolving to a non-note file": `UNSUPPORTED_FILE_TYPE` on the resolved `Att/Plan.png`, with no mkdir and no write.
  - "a name no note has falls back": `Beta` becomes `Beta.md`, `Beta.md` becomes `Beta.md`, and `Folder/Beta.md` passes through verbatim; each reports `created: true`.
  - "any other lookup failure propagates": an answer with no path line, and a non-not-found `Error:` line, each give `CLI_REPORTED_ERROR` with no mkdir, write or rename.
  - Order and regression guards: an unknown vault with `file` gives `VALIDATION_ERROR` with zero spawns; `path` and active mode make no `file=` spawn.
- `handler.fs-errors.test.ts`:
  - `EPERM` / `EBUSY` from the fs double's `rename` (the regression gate for the lock): `CLI_REPORTED_ERROR` with `details` `{ code: "EXTERNAL_EDITOR_CONFLICT", reason: "file-locked", path: "Sub/Alpha.md", errno }`. The vault root appears nowhere in `message` or `details`, and the tmp file is unlinked.
  - `ENOSPC` / `EACCES`: `FS_WRITE_FAILED` with `details` exactly `{ errno, syscall, path: "Sub/Alpha.md" }`, the exact vault-relative message, and no absolute path.
  - `EPERM` on the `overwrite: false` create is also the editor conflict.
- The existing `EEXIST` asymmetry test (`020/US2 mapFsError EEXIST keeps single-field details`) is unchanged and green.

## Local Verification

- `npx vitest run src/tools/write_note src/tools/_fs-errors.test.ts src/tools/_plugin-noise.test.ts` → 9 files, 541 tests passed.
- `npm run baseline:write` → 35 entries written; only `write_note` `schemaFingerprint` changed.
- `npx tsc --noEmit` → exit 0.
- `npm run lint` → exit 0.
- `npm test` (full suite with the coverage floor) → 193 files passed (1 skipped), 4507 tests passed (6 skipped); statements 97.07%, above the 91.3% floor.
- Live probes were not run in this step: neither the T0 sub-folder overwrite and not-found fallback probe nor the Windows lock probe (TC-00412 harness). They need the built server against the authorised test vault and belong to `/speckit-bug-test`, as the assessment's Q3 resolution says. The injected-errno test is the gate for the lock.

## CodeGraph structural verification

Run with `codegraph_explore` on `executeWriteNote`, `resolveSpecificModePath`, `mapFsError`, `FILE_NOT_FOUND_LINE` and `CONFLICT_ERRNOS`.

1. **No new error codes (Principle IV).** The fix uses only existing codes: `FILE_EXISTS`, `FS_WRITE_FAILED`, `CLI_REPORTED_ERROR` (with the existing `EXTERNAL_EDITOR_CONFLICT` sub-code) and `VALIDATION_ERROR`. `src/errors.ts` is untouched, and every new failure goes through `UpstreamError`, built by the shared `mapFsWriteError` or by the existing branches.
2. **No boot-time DI factory in a handler.** `write_note/handler.ts` imports neither `createLogger()` nor `createQueue()`; `logger` and `queue` still arrive through `ExecuteDeps`. The `createQueue` import in `_handler-fixtures.ts` is pre-existing test support.
3. **Module placement and import direction (Principle I).** The new symbols live in `src/tools/write_note/handler.ts`. Its new imports (`resolveFileByTsv` from `_active-file.ts`, `mapFsWriteError` from `_fs-errors.ts`, `stringDetail` from `errors.ts`) run to tools-level shared modules and to the error module, the same direction as its existing imports. No upward or cyclic edge was added.
4. **Reachability.** `resolveSpecificModePath`, `mapFsError`, `FILE_NOT_FOUND_LINE` and `CONFLICT_ERRNOS` are reached from `executeWriteNote`, which `createWriteNoteTool` (`write_note/index.ts`) calls. `fileNotFoundResponse` is test support used by three test files.

**Kernel-node claim.** The assessment said the fix touches no kernel node, and that held. `createLogger()`, `createQueue()` and `createServer()` were not touched. `UpstreamError` is constructed but not modified.

## Deviations from Assessment

- **`handler.file-type.test.ts` and `handler.bytes-written.test.ts` also changed.** Neither is in *Files likely to change*. In the file-type suite, the `file` cases now make the lookup spawn, so each queues a not-found response; no assertion changed. In the bytes-written suite, the stat-`EACCES` case pinned the absolute OS path in `details.path`, which the assessment's remediation (step 3) deliberately replaces with the vault-relative path, so that one expected value changed.
- **Existing test #9 in `handler.test.ts` changed its expected code.** It injects `EPERM` on the rename, which is exactly the lock case the assessment moves from `FS_WRITE_FAILED` to `EXTERNAL_EDITOR_CONFLICT`. The expectation and the title follow the new contract; the tmp-unlink assertion is unchanged.
- **The lock and error tests went into a new co-located file, `handler.fs-errors.test.ts`.** Adding them to `handler.test.ts` would have pushed that file past the 1000-line gate.
- **`src/tools/_fs-errors.ts` (comments only), `CHANGELOG.md` and the gitignored `.memory/refactor-decisions.md` were updated.** Their text had become stale: the `_fs-errors.ts` header said write_note keeps its own mapper, and the memory file said write_note keeps a raw errno cast. The assessment's Risks section asks for the CHANGELOG entry.
- **`mapFsError` now checks `getErrno(e) === "EEXIST"` instead of the raw `.code` cast.** For a fixed-string predicate the two are equivalent. The `FILE_EXISTS` details stay `{ errno: "EEXIST" }`, byte-identical, and the non-`EEXIST` extraction is now `mapFsWriteError`'s.
- **`src/tools/write_note/index.ts` is unchanged.** `WRITE_NOTE_DESCRIPTION` lists no typed errors, so it gained nothing, as the assessment allowed.

## Follow-ups

- `/speckit-bug-test slug=bi-0176` should run the live probes:
  - T0 against the authorised test vault: a sub-folder note overwritten by name, the not-found fallback, and `overwrite: false` on a sub-folder name.
  - The TC-00412 Windows lock probe (`FileShare.ReadWrite` without `FileShare.Delete`): expect `EXTERNAL_EDITOR_CONFLICT` with `errno: "EPERM"`, the file byte-identical, then `$f.Close()`. If the run cannot hold the lock, record the probe as owner-input.
- `/speckit-docs-as-code` should update `.docs-as-code/` for write_note's name resolution and error mapping.
- The *Declined / deferred cleanups* entry in `.memory/refactor-decisions.md`, "Merge the per-handler mapFsError/mapFsWriteError variants", is now partly done for write_note. The code review may want to reword it.

## Amendment: owner ruling, scope (a) (2026-11-03)

- **Status**: applied

The owner ruled on the bug-test escalation: widen the fix in write_note only, so that a `file` name is used only when the lookup is confirmed to have run in the named vault, and otherwise fail with a structured error and write nothing. This section supersedes the earlier `resolveFileByTsv` / `FILE_NOT_FOUND_LINE` description above. Those symbols are no longer used by write_note.

### What changed

| File | Change | Notes |
|------|--------|-------|
| `src/tools/write_note/_template.ts` | added | `NAME_LOOKUP_TEMPLATE`, a frozen eval with a base64 payload. It returns `{vault: app.vault.getName(), path: getFirstLinkpathDest(file, '')?.path ?? null}`. |
| `src/tools/write_note/schema.ts` | modified | Adds `nameLookupEvalResponseSchema` (`strictObject {vault: string, path: string \| null}`), next to the input/output schemas as backlinks and create_base do. It is not a published schema, so the descriptor fingerprint did not move (the FR-018 gate passed without `baseline:write`). |
| `src/tools/write_note/handler.ts` | modified | `resolveSpecificModePath` runs one `invokeEval({code, vault: input.vault})`, so `vault=` comes ahead of `eval` and the cold-start retry is inherited. It decodes the answer through `decodeEvalEnvelope` (`CLI_REPORTED_ERROR`, `json-parse` / `envelope-parse`). If `lookup.vault !== input.vault`, it throws `CLI_REPORTED_ERROR` with `details: { code: "VAULT_MISMATCH", vault, answeredBy, file }` before any fs access. A null `path` falls back to the short-form rule; a non-null `path` is the target. The `resolveFileByTsv`, `stringDetail` and `FILE_NOT_FOUND_LINE` uses are removed. |
| `src/tools/write_note/_handler-fixtures.ts` | modified | `fileNotFoundResponse` replaced by `nameLookupResponse(path, vault = "TestVault")`. |
| `src/tools/write_note/handler.note-name.test.ts` | rewritten | See below. |
| `src/tools/write_note/_template.test.ts` | added | Runs the template under `node:vm` through `runEvalTemplate` with a stub `app`. It covers a resolved name (asserting the `(file, '')` call), a missing name, and a hostile name that stays inside the payload. |
| `handler.test.ts`, `handler.file-type.test.ts`, `handler.fs-errors.test.ts` | modified | The queued lookup reply is now the eval stub (`nameLookupResponse`). No assertion changed. |
| `docs/tools/write_note.md` | modified | The `file` resolution section describes the vault-targeted lookup, the vault confirmation and the cold-start reopen. New `VAULT_MISMATCH` error row; the lookup parse-failure row now names `json-parse` / `envelope-parse` instead of `file-tsv-parse`. |
| `CHANGELOG.md` | modified | The BI-0176 entry names `VAULT_MISMATCH`. |

### Why an eval, not `obsidian file` plus a separate check

A separate confirmation call could be answered by a different vault than the lookup. One eval that both resolves the name and reports its vault confirms the very call whose answer is used, with no race. Before choosing it, a live parity probe on 2026-11-03 compared `getFirstLinkpathDest(name, '')` with `obsidian vault=<test vault> file file=<name>` on six names: a shared name in two folders, the same with `.md`, two folder-qualified forms, a unique name and a missing name. They picked the same note every time, so the documented "same note `read` picks" still holds. ADR-031 already establishes that a vault-targeted eval runs in the named vault, open or closed-but-registered, and `open_file` resolves names with the same call.

### Tests added (Principle II failure path)

`handler.note-name.test.ts`:
- **VAULT_MISMATCH**: another vault answers and found a note, or found none → `CLI_REPORTED_ERROR` with `details` exactly `{code:"VAULT_MISMATCH", vault:"TestVault", answeredBy:"OtherVault", file:"Alpha"}`, the exact message, no mkdir, no write, no rename, and one spawn. The same holds with `overwrite: false` (no root create).
- A closed-but-registered vault: the cold-start reply, then the lookup, succeeds on the retry against `vault=TestVault`.
- Lookup parse failures: a reply with no answer line gives `json-parse`, and an answer of the wrong shape gives `envelope-parse`. Nothing is written in either case.
- The earlier rows are kept: sub-folder overwrite (now also asserting that argv starts `vault=TestVault eval` and that the code uses `getFirstLinkpathDest(a.file,'')`), `overwrite: false` → `FILE_EXISTS`, a non-note resolution, the three fallback forms, unknown vault with zero spawns, and no lookup for `path` or active mode.

### Local verification

- `npx vitest run src/tools/write_note` → 8 files, 122 tests passed.
- `npm test` → 194 files passed (1 skipped), 4515 tests passed (6 skipped); statements 97.08%. The FR-018 descriptor-baseline gate passed unchanged.
- `npx tsc --noEmit` → 0. `npm run lint` → 0.

### CodeGraph structural verification (amendment)

1. **No new top-level code.** `VAULT_MISMATCH` is a new `details.code` under the existing `CLI_REPORTED_ERROR`, the same pattern as `FOLDER_NOT_FOUND` and `UNSAFE_PLACEMENT`. `src/errors.ts` is untouched.
2. **No DI factory in the handler.** `logger` and `queue` still arrive through `ExecuteDeps`.
3. **Import direction (Principle I).** The new imports in `handler.ts` are `./_template.js`, `./schema.js` (tool-local), `invokeEval` from the cli-adapter, and `composeEvalCode` and `decodeEvalEnvelope` from the tools-level shared modules. These are the same edges the other eval tools have; there is no upward edge.
4. **Reachability.** `NAME_LOOKUP_TEMPLATE` and `nameLookupEvalResponseSchema` are reached from `resolveSpecificModePath`, then `executeWriteNote`, then `createWriteNoteTool`.

The kernel-node claim still holds: none was touched.

### Deviation note

The assessment's preferred remediation named `resolveFileByTsv`. The owner ruling (scope (a)) needs the lookup to confirm its own vault, which the `obsidian file` TSV cannot report, so write_note now resolves through a vault-targeted eval instead. `resolveFileByTsv` itself is unchanged, and its other callers see no difference.
