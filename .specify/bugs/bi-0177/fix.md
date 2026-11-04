# Bug Fix: move reports a file blocking the destination folder as FOLDER_NOT_FOUND

- **Slug**: bi-0177
- **Fixed**: 2026-11-04
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

When `move` fails with a rename error into a non-root folder (the ENOENT line, or ENOTDIR on POSIX), the handler now runs one lookup eval in the vault the move used. The eval asks the disk (`app.vault.adapter.stat`) for each part of the destination folder's path and looks for one that exists and is not a folder. If it finds one, the move fails as `CLI_REPORTED_ERROR` with `details: { code: "NOT_A_FOLDER", folder: <that file> }` and advice to rename or remove the file, never to create the folder. If it finds none, the move reports today's `FOLDER_NOT_FOUND`. If the lookup itself fails, the CLI text is withheld and the lookup failure becomes the cause, so the error is never reported as `FOLDER_NOT_FOUND`. This follows the assessment's preferred remediation and its answers to Q1–Q3, except that the lookup reads the disk instead of Obsidian's index (owner ruling on the PR #139 review; see Deviations).

## T0 live probe (Q3)

Windows 11, production `Obsidian.com` shim (`C:\Users\sirzi\AppData\Local\Programs\Obsidian\Obsidian.com`, never `Obsidian.exe`), vault `TestVault-Obsidian-CLI-MCP`, fixtures `Sandbox/BI-0177-t0/{MoveMe.md,Blocker.md}`, captured with `Start-Process -RedirectStandardOutput/-RedirectStandardError`. Each probe sent the argv `executeMove` forwards for a `path` locator. The fixtures were removed afterwards; `Welcome.md` was untouched and the probes left nothing behind.

| Probe | argv (after `vault=TestVault-Obsidian-CLI-MCP move path=Sandbox/BI-0177-t0/MoveMe.md`) | Exit | stdout (verbatim) | stderr |
|---|---|---|---|---|
| P1 file as the folder | `to=Sandbox/BI-0177-t0/Blocker.md/MoveMe.md` | 0 | `Error: ENOENT: no such file or directory, rename 'C:\Marwan-Saab-ADO\My-Setup\My-Setup\TestVault-Obsidian-CLI-MCP\Sandbox\BI-0177-t0\MoveMe.md' -> 'C:\Marwan-Saab-ADO\My-Setup\My-Setup\TestVault-Obsidian-CLI-MCP\Sandbox\BI-0177-t0\Blocker.md\MoveMe.md'` | (empty) |
| P2 file as an ancestor | `to=Sandbox/BI-0177-t0/Blocker.md/Sub/MoveMe.md` | 0 | `Error: ENOENT: no such file or directory, rename '…\Sandbox\BI-0177-t0\MoveMe.md' -> '…\Sandbox\BI-0177-t0\Blocker.md\Sub\MoveMe.md'` (same root as P1) | (empty) |
| P3 missing folder (control) | `to=Sandbox/BI-0177-t0/Missing/MoveMe.md` | 0 | `Error: ENOENT: no such file or directory, rename '…\Sandbox\BI-0177-t0\MoveMe.md' -> '…\Sandbox\BI-0177-t0\Missing\MoveMe.md'` (same root as P1) | (empty) |

P1 and P3 print the same line. This confirms the root cause: the CLI's text cannot tell "a file is in the way" from "the folder is missing". No probe changed either file.

The prefix-walk logic was also run live through `obsidian eval` in the same vault, with the payload base64-encoded as in the template. The probe used `TextDecoder('utf-8')` instead of `"utf-8"`, because of PowerShell argument quoting.

| Folder sent | Answer |
|---|---|
| `Sandbox/BI-0177-t0/Blocker.md` | `{"ok":true,"blocker":"Sandbox/BI-0177-t0/Blocker.md"}` |
| `Sandbox/BI-0177-t0/Blocker.md/Sub` | `{"ok":true,"blocker":"Sandbox/BI-0177-t0/Blocker.md"}` |
| `Sandbox/BI-0177-t0/Missing` | `{"ok":true,"blocker":null}` |
| `Sandbox/BI-0177-t0` | `{"ok":true,"blocker":null}` |
| `Sandbox/BI-0177-t0/blocker.md` (case mismatch) | `{"ok":true,"blocker":null}` (the index template's case limit, removed by the review fix below) |

The POSIX `ENOTDIR` line was not probed. Its unit row (B3) is marked inferred, and it is listed as a residual below.

### T0 re-check after the PR #139 review fix (disk-based template)

Same host, shim and vault, 2026-11-04. Fixtures `Sandbox/BI-0177-t0b/{MoveMe.md,Blocker.md}` were seeded on disk. A Node script imported the built `dist/` and called the production `executeMove` and `invokeEval`. Bare `obsidian` resolves to `Obsidian.com`, with `OBSIDIAN_BIN` unset. Before and after, `Welcome.md` and both fixtures had identical SHA-256 hashes. The fixture folder was removed afterwards, and no residue remained.

| Lookup eval, folder sent | Answer |
|---|---|
| `Sandbox/BI-0177-t0b/Blocker.md` | `{"ok":true,"blocker":"Sandbox/BI-0177-t0b/Blocker.md"}` |
| `Sandbox/BI-0177-t0b/Blocker.md/Sub` | `{"ok":true,"blocker":"Sandbox/BI-0177-t0b/Blocker.md"}` |
| `Sandbox/BI-0177-t0b/Missing` | `{"ok":true,"blocker":null}` |
| `Sandbox/BI-0177-t0b` | `{"ok":true,"blocker":null}` |
| `Sandbox/BI-0177-t0b/blocker.md` (case mismatch) | `{"ok":true,"blocker":"Sandbox/BI-0177-t0b/blocker.md"}` |

| `move` from `path: "Sandbox/BI-0177-t0b/MoveMe.md"`, `to:` | Result |
|---|---|
| `Sandbox/BI-0177-t0b/Blocker.md/` (TC-00701's shape) | `CLI_REPORTED_ERROR`, `details: {"code":"NOT_A_FOLDER","folder":"Sandbox/BI-0177-t0b/Blocker.md"}` |
| `Sandbox/BI-0177-t0b/Blocker.md/Sub/` | `NOT_A_FOLDER`, `folder: "Sandbox/BI-0177-t0b/Blocker.md"` |
| `Sandbox/BI-0177-t0b/Missing/` | `FOLDER_NOT_FOUND`, `folder: "Sandbox/BI-0177-t0b/Missing"` |
| `Sandbox/BI-0177-t0b/blocker.md/` (case mismatch) | `NOT_A_FOLDER`, `folder: "Sandbox/BI-0177-t0b/blocker.md"` (the name as written in `to`) |
| `Sandbox/BI-0177-t0b/Blocker.md/Renamed.md` | `NOT_A_FOLDER`, `folder: "Sandbox/BI-0177-t0b/Blocker.md"` |

Every message was the one the unit tests pin, and none contained an absolute path. TC-00701's shape still gives `NOT_A_FOLDER`.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/move/_template.ts` | added | `BLOCKER_TEMPLATE`, a frozen async eval with an `Original — no upstream` header. The folder arrives only through the base64 JSON payload (`B64_PAYLOAD_DECODE_EXPR`). The eval walks the prefixes from the shortest through `app.vault.adapter.stat`, the same missing/file/folder check `paths` uses. It returns the first prefix that exists and is not a folder. It returns `null` as soon as a prefix is missing, or when every prefix is a folder. |
| `src/tools/move/schema.ts` | modified | Adds `moveBlockerEnvelopeSchema` (`{ ok: true, blocker: string \| null }`, strict). The input and output schemas are unchanged. Header summary updated. |
| `src/tools/move/handler.ts` | modified | `ENOENT_RENAME_RE` becomes `RENAME_FAILURE_RE` (`ENOENT\|ENOTDIR`), and `isMissingDestinationFolder` becomes `renameFailureErrno`, which returns `"ENOENT" \| "ENOTDIR" \| undefined`. New `findBlockingFile` (`invokeEval` in `target.vault` + `decodeEvalEnvelope`) and `notAFolder`. `withheldFailure` takes a closed key (`"vault-folder" \| "destination-folder"`) that maps to the "what could not be checked" clause in `UNCHECKED`, so M18's message stays byte-identical. `moveFailure` takes the whole `ExecuteDeps` (refactor-decisions item 29a), not just the registry. Attribution header updated. |
| `src/tools/move/index.ts` | modified | `MOVE_DESCRIPTION` names `NOT_A_FOLDER`, `details.folder` and the rename-or-remove recovery, next to `FOLDER_NOT_FOUND`. Header summary updated. |
| `src/tools/_register-baseline.json` | regenerated | Only the `move` entry's `descriptionFingerprint` changed, plus the file's `generatedFromBranch`/`generatedAt` metadata. Schema, title, annotations and output-schema fingerprints are unchanged. This is the deliberate description change the assessment anticipated. |
| `docs/tools/move.md` | modified | New Errors row for `NOT_A_FOLDER`: when it happens, the details shape, the extra eval on the failure path, a pointer to the withheld-failure rule under "No absolute paths" (which now also names the failed check), the case rule on case-insensitive file systems, and the recovery. New Behavioural-notes bullet. |
| `src/tools/move/handler.missing-destination.test.ts` | modified + added tests | M rows re-provisioned and new rows B1–B7 (see below). M15's title drops the "also what a file used as a folder gives" claim. |
| `src/tools/move/_template.test.ts` | added test | Runs the template in-process (`runEvalTemplate`, node:vm) against a stub vault index. This file was not in the assessment's list; see Deviations. |
| `src/tools/move/index.test.ts` | modified (stub only) | Owner-approved, outside the assessment's file list; see Deviations. |
| `src/tools/_handler-test-fixtures.ts` | modified | Adds `evalPayload(spawn)`, the JSON payload a recorded eval spawn sent. Its decoder, `codePayload(code)`, serves the template tests, which hold composed code instead of a spawn. Owner-approved, outside the assessment's file list; see Deviations. |
| 13 test files: `backlinks`, `find_by_property`, `links`, `open_file`, `paths`, `pattern_search`, `read_heading`, `smart_connections_query`, `smart_connections_similar` and `tag` `handler.test.ts`; `open_file`, `views_base` and `create_base` `_template.test.ts` | modified | Each hand-written base64 payload decoder is replaced by `evalPayload` / `codePayload`. No assertion, expected value or test title changed. Owner-approved; see Deviations. |

## Diff Highlights

```ts
const RENAME_FAILURE_RE = /^Error: (ENOENT|ENOTDIR): [^,]*, rename '/;

const errno = folder === "" ? undefined : renameFailureErrno(e);
if (errno !== undefined) {
  let blocker: string | null;
  try {
    blocker = await findBlockingFile(folder, target.vault, deps);
  } catch (lookupErr) {
    // Cancellation reaches here as a non-UpstreamError abort reason; it passes through untouched.
    if (!(lookupErr instanceof UpstreamError)) return lookupErr;
    return withheldFailure(e, target.relPath, resolvedTo, lookupErr, "the destination folder could not be checked");
  }
  if (blocker !== null) return notAFolder(blocker);
  if (errno === "ENOENT") return folderNotFound(folder);
  // ENOTDIR with no file in the way is not a missing folder; it is reported as the CLI said it.
}
```

The new failure's message is: `move: "<file>" is an existing file, where the destination needs a folder of that name. Nothing was moved. Rename or remove that file, or pick another destination, then retry the move.` Its `details` is exactly `{ code: "NOT_A_FOLDER", folder: <file> }`, with no `reason` and `cause: null`.

## Tests Added or Updated

All tests run in-process with spawns stubbed through `makeQueuedSpawn`.

- `handler.missing-destination.test.ts` (the lookup's payload is read with the shared `evalPayload`)
  - **M1–M4, M7, M19** (`FOLDER_ROWS` table): each spawn queue gains the lookup's `{ok:true,blocker:null}` answer, which the assessment approved for these rows. The expected spawn count is now 2. The title reads "2 spawns (the move, then a blocker lookup finding no file), no registry lookup". New assertions check that the lookup carries `vault=Work` and is sent exactly the row's folder. Expected payloads are unchanged, so these rows also cover the assessment's "lookup answers null → byte-identical to M1" test.
  - **M5, M6**: each gains the null lookup answer, so the spawn count is now 3. M6 also asserts that the lookup eval carries no `vault=` in active mode.
  - **M14**: unchanged. Its `runM1()` call picks up the re-provisioned runner.
  - **M15**: title only.
  - **B1**: TC-00701's shape, stubbing the ENOENT line T0 captured, rebuilt with the test's Windows root. Expects `NOT_A_FOLDER` naming `Fixtures/c07/Blocker.md`, an exact shape, no `reason` key, `cause: null`, no "does not exist" or "Create the folder", no absolute path, 2 spawns, the forwarded `to=…/Blocker.md/MoveMe.md`, the lookup in `vault=Work` sent that folder, and no registry lookup.
  - **B2**: the file is an ancestor (`to: "Inbox/Note.md/Sub/"`), so the error names `Inbox/Note.md`.
  - **B3**: POSIX `ENOTDIR` line (inferred, not probed) with a file in the way gives `NOT_A_FOLDER`, with no `/home/u` in the payload.
  - **B4**: `ENOTDIR` with no file found does not give `FOLDER_NOT_FOUND`. It falls through to the root-rewritten CLI error, with 1 registry lookup.
  - **B5a/b/c**: the lookup fails (non-zero exit, unparseable answer, wrong shape). The CLI text is withheld: code `CLI_REPORTED_ERROR`, `details: { source, destination }`, the lookup's `UpstreamError` as cause, an exact message, and no `ENOENT` or `Vaults` text.
  - **B6**: a full-path `to` through a file (`Inbox/Note.md/Renamed.md`) gives `NOT_A_FOLDER`, and `to=` is forwarded as given.
  - **B7**: active mode gives `NOT_A_FOLDER`. The lookup carries no `vault=`, and no registry lookup is made.
  - **M9, M10, M15, M16, M17, M18**: untouched and still passing. EPERM, an existing destination file, success and the vault-root ENOENT stay at one spawn with no lookup eval.
- `_template.test.ts` (stub `vault.adapter.stat`): the last segment is a file; an ancestor is a file; a missing folder; a missing ancestor ends the walk; every prefix an existing folder; a case-different name is absent on a case-sensitive disk and is the file in the way, named as written, on a case-insensitive disk; a rejecting stat reads as missing. A hostile folder string appears only inside the base64 payload, and the composed code equals the template with the placeholder filled.
- `index.test.ts`: the R1 wire-payload test passes again with the queued stub (see Deviations). The description test (`toBe(MOVE_DESCRIPTION)`) and the registry baseline test pass against the regenerated fingerprint. The `help` docs-sync test passes with the new `docs/tools/move.md` row.

## Local Verification

- `npx vitest run` (full suite): 197 files passed, 1 skipped; 4884 tests passed, 6 skipped, 0 failed. After the PR #139 review fix: 4887 passed, 6 skipped, 0 failed. The +3 are the new `_template.test.ts` rows. The 14 files the decoder consolidation touched run 412 tests before and after.
- `npx tsc --noEmit`: clean.
- `npx eslint src/tools/move`: clean.
- `npm run baseline:write`: wrote 35 entries. The diff touches only `move.descriptionFingerprint` and the metadata.
- Manual checks: the T0 live probe and its re-check above (Windows, `Obsidian.com`, Sandbox), run under `.memory/test-execution-instructions.md`.

## CodeGraph structural verification

These checks ran on `findBlockingFile`, `notAFolder`, `renameFailureErrno`, `moveFailure`, `withheldFailure`, `BLOCKER_TEMPLATE` and `moveBlockerEnvelopeSchema`.

1. **No new top-level error code.** No error class was added outside `src/errors.ts`. `NOT_A_FOLDER` is an existing `details.code` sub-discriminator (published by `paths`) under the existing `CLI_REPORTED_ERROR`. Every new failure is an `UpstreamError`.
2. **No boot-time DI factory imports.** `createLogger()` and `createQueue()` are neither imported nor constructed in `move/*` production code. `logger` and `queue` still arrive through `ExecuteDeps`, and the handler passes `deps` whole to `invokeCli`/`invokeEval`. The index test's logger drift lock still passes: there is no `deps.logger`, and `invokeCli(…, deps)` is present.
3. **One-directional imports.** The new symbols sit in `src/tools/move/`. They import downward only: `./_template.js`, `./schema.js`, `../_active-file.js` (`decodeEvalEnvelope`), `../_shared.js` (`composeEvalCode`, `B64_PAYLOAD_DECODE_EXPR`) and `../../cli-adapter/cli-adapter.js` (`invokeEval`). No tool imports another tool, and there are no cycles.
4. **Reachable, not orphaned.** `BLOCKER_TEMPLATE` and `moveBlockerEnvelopeSchema` are used by `findBlockingFile`. `findBlockingFile`, `renameFailureErrno` and `notAFolder` are called by `moveFailure`, and `moveFailure` is called by `executeMove`, which is registered by `createMoveTool`.

The PR #139 review fix keeps all four checks. `BLOCKER_TEMPLATE` changed its body, not its callers. `UNCHECKED` and the narrowed `renameFailureErrno` stay private to `move/handler.ts`. `evalPayload` and `codePayload` are test support in the vitest-free `_handler-test-fixtures.ts`, so they have no production caller, by design. They import nothing new.

**The kernel-node claim held.** The fix touches none of the kernel nodes: `createLogger()`, `createQueue()` and `createServer()` are untouched, and `UpstreamError` is only instantiated. No structural deviations.

## Deviations from Assessment

- **`src/tools/move/index.test.ts`, owner-approved, outside the assessment's file list** (owner ruling 2026-11-04 on this job, option A). The R1 test "tool.handler returns the FOLDER_NOT_FOUND payload as an isError result (spec 090 R1)" used the single-spec `makeStubSpawn`. That stub answered the new lookup eval with the same ENOENT line, which made the lookup fail and produced the withheld failure. The only edit switches its stub to `makeQueuedSpawn([<the same ENOENT response>, { stdout: '=> {"ok":true,"blocker":null}\n', exitCode: 0 }])` and adds `makeQueuedSpawn` to the import. The title, assertions and expected values are byte-identical. The owner's reason: the test keeps pinning the FOLDER_NOT_FOUND wire payload through the new two-call flow, which BI-0177's "missing folder unchanged" criterion requires. The assessment had listed `index.test.ts` only "if an assertion pins the description's wording".
- **`src/tools/move/_template.test.ts`, added outside the file list.** Handler tests stub the eval's answer, so they cannot catch a wrong prefix walk inside Obsidian. The repo's standing review rule (refactor-decisions item 31) asks for an in-process vm test of a frozen template's logic instead of relying only on a live probe. This is a new co-located test file; it changes no existing test.
- **`withheldFailure` gained a fifth parameter** (the clause naming what could not be checked) instead of a second builder. The vault-lookup call passes the old wording, so M18's message is byte-identical. This keeps the one E4c builder that refactor-decisions item 49 settled.
- **The lookup reads the disk, not Obsidian's index** (owner ruling 2026-11-04 on the PR #139 review, option A). The assessment's Preferred remediation named `app.vault.getAbstractFileByPath`. `BLOCKER_TEMPLATE` now uses `app.vault.adapter.stat` → `type`, the check `paths` (and `pattern_search` for its folder) already uses for `FOLDER_NOT_FOUND` / `NOT_A_FOLDER`. A prefix that exists and is not a folder is the file in the way (`NOT_A_FOLDER`). A missing prefix ends the walk, so the result stays `FOLDER_NOT_FOUND`. A case-different name that is a file on disk now gives `NOT_A_FOLDER`, wherever the file system matches names regardless of case. Where the file system treats it as absent, the result stays `FOLDER_NOT_FOUND`. Why: BI-0177's Impact names the harm as create-folder advice that cannot be followed because a file holds the name. That is true whenever the disk has the file, whatever the index says. Tool Notes (fs-direct writers) records index lag right after writes. The index's case and staleness limits are gone from the help page and the Follow-ups, and the `_template.test.ts` case row now expects a match. The T0 re-check above covers the change and TC-00701's shape.
- **The payload decoders are consolidated across the test suite** (owner ruling 2026-11-04 on the PR #139 review, option B). This goes beyond the assessment's file list. `evalPayload(spawn)` in `_handler-test-fixtures.ts` replaces move's `lookupFolder` and every hand-written base64 payload decoder in 13 other test files. The three `_template.test.ts` files hold composed code, not a recorded spawn, so they use `codePayload(code)`, the decoder `evalPayload` calls. No assertion, expected value or test title changed, and the 14 files run the same 412 tests.
- **No separate test for "lookup answers null".** The re-provisioned M1–M7/M19 rows are that test: same stub plus a null answer, with the expected payload byte-identical to before.

## Follow-ups

- **Residual, POSIX `ENOTDIR` form unprobed.** The rename-through-a-file line on macOS/Linux is inferred from libuv (spec 090 F5) and pinned only by the inferred rows B3/B4. Capture it on a POSIX host when one is available.
- **Untested branch, cancellation pass-through.** A non-`UpstreamError` abort reason from the lookup is returned untouched. No deterministic in-process seam aborts between the move's spawn and the lookup's `queue.run`, so this one-line branch has no unit test.
- **Docs-as-code.** Spec 090's F7 statement ("needs no vault lookup") no longer holds for the rename-failure branch. `/speckit-docs-as-code` should update `.docs-as-code/` and drop it. Also consider noting in the `FOLDER_NOT_FOUND` row of `docs/tools/move.md` that it now costs the same extra eval. The `NOT_A_FOLDER` row already says so.
- **Acceptance.** Re-run TC-00701 on the next `-local` build (`/speckit-bug-test slug=bi-0177`).
