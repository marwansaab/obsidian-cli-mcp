# Bug Fix: move by note name or active note reports a file in the destination's folder position as NOT_A_FOLDER; move's description names NOT_A_FOLDER

- **Slug**: bi-0177-2
- **Fixed**: 2026-11-07
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`moveFailure` now sends the CLI's `Error: Destination file already exists!` to the existing blocked-destination lookup when, and only when, a `file` or active call forwarded the folder form (`to` ending in `/`) for the CLI to expand. A file in the way therefore gives `NOT_A_FOLDER` for all three locators. `MOVE_DESCRIPTION` drops "(change it with `obsidian_exec`)" and names `NOT_A_FOLDER`, per the owner's 2026-11-05 ruling (397 characters).

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/move/handler.ts` | modified | `DESTINATION_EXISTS_LINE` + `isDestinationExists`; `moveFailure` gains `cliExpandsFolderForm` and runs `findBlockingFile` on the folder-form "already exists" answer; `executeMove` names the existing `forwardedTo` condition `cliExpandsFolderForm` and passes it; attribution header updated. Every forwarded argument is byte-unchanged. |
| `src/tools/move/index.ts` | modified | `MOVE_DESCRIPTION`: `(change it with \`obsidian_exec\`)` removed, `A destination through an existing file fails with \`NOT_A_FOLDER\`.` added before the file-type sentence; header line corrected. |
| `src/tools/_register-baseline.json` | regenerated | `npm run baseline:write`: only `move`'s `descriptionFingerprint` moved (plus `generatedFromBranch` / `generatedAt`); schema, title, annotations and output-schema fingerprints unchanged. |
| `src/tools/move/handler.missing-destination.test.ts` | B7 stub corrected; B8–B13 added | See below. |
| `src/tools/_file-type-support.test.ts` | one assertion retargeted (owner-approved) | Q1 option A, owner ruling 2026-11-07: `move`'s `obsidian_exec` assertion now reads `docs/tools/move.md` (`toContain("obsidian_exec")`, X-P); `keeps its type` is still asserted on both descriptions, and the `rename` half is unchanged. |
| `docs/tools/move.md` | modified | `NOT_A_FOLDER` row: the same failure for `path`, `file` and active calls, looked up in the focused vault in active mode. `Destination file already exists!` row: a folder-form `to` through a file is reported as `NOT_A_FOLDER` instead. Behavioural note: "for every way of naming the source". |

## Diff Highlights

```ts
// Spec 090 P5, BI-0177 round 2 T0: given a raw folder form whose last segment is an existing file,
// the CLI expands it to that file and answers this line, not a rename errno.
const DESTINATION_EXISTS_LINE = "Error: Destination file already exists!";

// in moveFailure
const existsThroughFolderForm = folder !== "" && cliExpandsFolderForm && isDestinationExists(e);
if (errno !== undefined || existsThroughFolderForm) {
  // unchanged: findBlockingFile → notAFolder / withheldFailure; FOLDER_NOT_FOUND only for ENOENT
}

// in executeMove
const cliExpandsFolderForm = input.path === undefined && input.to.endsWith("/");
const forwardedTo = cliExpandsFolderForm ? input.to : resolvedTo;
```

## Tests Added or Updated

All in `src/tools/move/handler.missing-destination.test.ts`, stubbed through `makeQueuedSpawn`:

- **B7 (corrected)** — active mode now stubs `Error: Destination file already exists!`, the line TC-00900 saw live, instead of the ENOENT line it never receives. Assertions kept; added: `to=Inbox/Note.md/` forwarded as given and no `vault=` on the move. This is the stub correction the assessment lists, recorded here as a correction of a stub the live run disproved.
- **B8** (TC-00865 step 4) — `file` locator, `to: "Inbox/Note.md/"` → exactly `NOT_A_FOLDER` naming `Inbox/Note.md`; three spawns; `file=Other` and `to=Inbox/Note.md/` forwarded unchanged; lookup carries `vault=Work`; no registry lookup.
- **B9** — `file` locator, folder form onto a genuinely existing destination file → today's CLI error (no `details.code`, verbatim message) after a lookup finding no file; one registry lookup.
- **B10** — active mode, the lookup after the "already exists" line fails → the withheld failure (`details: { source, destination }`, `CLI_NON_ZERO_EXIT` cause), never `FOLDER_NOT_FOUND`, no raw CLI text.
- **B11a / B11b** — `file` locator, `to: "Inbox/Note.md/Sub/"` (ancestor blocker) → `NOT_A_FOLDER` naming `Inbox/Note.md`. B11a stubs the ENOENT line the T0 probe captured; B11b stubs the "already exists" line and is marked "inferred, not seen by the T0 probe" in its title.
- **B12** — `path` + folder form getting "already exists" (the handler expanded it) → today's error, one spawn, no lookup.
- **B13** — `file` + full-path `to` getting "already exists" → today's error, no lookup.
- M15, M5, M6, M17 and B1–B6 are unchanged and pass.

Run against the pre-fix `handler.ts` (stashed), B7, B8, B9, B10 and B11b fail; B11a, B12 and B13 pass there too (B11a's ENOENT path already worked; B12/B13 pin the unchanged behaviour).

## Local Verification

- `npm run typecheck` → clean.
- `npm run lint` → clean.
- `npm test` → 206 files passed, 1 skipped; 5151 tests passed, 6 skipped. Includes `_description-quality.test.ts` (per-tool and total budgets), the registry baseline test against the regenerated fingerprint, `move/index.test.ts` and the `help` docs tests.
- `MOVE_DESCRIPTION.length` → 397 (budget 400, no audit exception).
- `npm run build` → clean.

### T0 live probe (2026-11-07)

Under `.memory/test-execution-instructions.md`: vault `TestVault-Obsidian-CLI-MCP` (confirmed with `eval code=app.vault.getName()` → `=> TestVault-Obsidian-CLI-MCP`), fixtures `Sandbox/BI-0177-2/MoveMe-0177r2.md` and `Sandbox/BI-0177-2/Blocker-0177r2.md`, binary `C:\Users\sirzi\AppData\Local\Programs\Obsidian\Obsidian.com` (the production shim, never `Obsidian.exe`), stdout and stderr captured separately with `Start-Process`. Each argv is exactly what `executeMove` forwards for a `file` locator.

| Probe | argv | exit | stdout (verbatim) | stderr |
|---|---|---|---|---|
| Last segment is the file | `vault=TestVault-Obsidian-CLI-MCP move file=MoveMe-0177r2 to=Sandbox/BI-0177-2/Blocker-0177r2.md/` | 0 | `Error: Destination file already exists!` | empty |
| Ancestor is the file | `vault=TestVault-Obsidian-CLI-MCP move file=MoveMe-0177r2 to=Sandbox/BI-0177-2/Blocker-0177r2.md/Sub/` | 0 | `Error: ENOENT: no such file or directory, rename 'C:\Marwan-Saab-ADO\My-Setup\My-Setup\TestVault-Obsidian-CLI-MCP\Sandbox\BI-0177-2\MoveMe-0177r2.md' -> 'C:\Marwan-Saab-ADO\My-Setup\My-Setup\TestVault-Obsidian-CLI-MCP\Sandbox\BI-0177-2\Blocker-0177r2.md\Sub'` | empty |

The ancestor case answers the ENOENT rename line (spec 090 P1's line, not P5's), so B11a is the captured row and B11b the inferred one. The CLI renamed to `…\Blocker-0177r2.md\Sub` with no basename: given a folder form whose folder does not exist, it treats the last segment as the new name. The ENOENT branch classifies it from the handler's own `resolvedTo` folder, so the missing basename does not matter here.

Then the built `executeMove` (`dist/tools/move/handler.js`, real logger, queue and vault registry) with `file: "MoveMe-0177r2"`:

- `to: "Sandbox/BI-0177-2/Blocker-0177r2.md/"` → `CLI_REPORTED_ERROR`, `details: {"code":"NOT_A_FOLDER","folder":"Sandbox/BI-0177-2/Blocker-0177r2.md"}`, `cause: null`, message `move: "Sandbox/BI-0177-2/Blocker-0177r2.md" is an existing file, where the destination needs a folder of that name. Nothing was moved. Rename or remove that file, or pick another destination, then retry the move.`
- `to: "Sandbox/BI-0177-2/Blocker-0177r2.md/Sub/"` → the same `NOT_A_FOLDER` failure naming `Sandbox/BI-0177-2/Blocker-0177r2.md`.

Both fixture files were unchanged afterwards (same names, 12 bytes each, nothing moved). Cleanup: `Sandbox/BI-0177-2/` and the temp capture and harness folders deleted; `Welcome.md` present; no `.trash/` entries. Other `Sandbox/` content predates this run and was left alone.

Not run live: active mode (needs a focused note; covered by TC-00900's re-run on the next local build, as the assessment plans) and a folder-form `file` move onto a genuinely existing destination file (B9 covers it; a live fixture would need two notes of the same name, which makes the `file` resolution ambiguous).

## Deviations from Assessment

None in the code or the approved test edits. Two notes:

- `src/tools/_description-audit-record.json` was not edited. Its `move` entry holds fingerprints and verdicts, not the description text, so the assessment's "only if it quotes the old description" condition did not apply. The description audit will show `move`'s judged checks as needing review until the record is re-judged; no test gates on that (see Follow-ups).
- B7's title was kept; only its stub changed and two `argv` assertions were added (forwarded `to=` and no `vault=` on the move), which the assessment lists for the corrected row.

## CodeGraph structural verification

Run with `codegraph_explore` on `isDestinationExists`, `DESTINATION_EXISTS_LINE`, `moveFailure`, `executeMove`, `createMoveTool` and `MOVE_DESCRIPTION` after the change.

1. **No new error codes** — holds. No new class or code; `src/errors.ts` unchanged. The new branch reaches the existing `notAFolder` / `withheldFailure` builders, and `NOT_A_FOLDER` already existed on `move`.
2. **No boot-time DI factories in production handlers** — holds. `handler.ts` imports only types for `Logger` / `Queue` and receives them through `ExecuteDeps`; `createLogger()` / `createQueue()` stay in `server.ts`.
3. **Module placement and import direction** — holds. The new symbols are private to `src/tools/move/handler.ts`; no import was added. The test file's new `DOCS_DIR` import (`help/handler.js`) is the existing pattern in `bases`, `create_base` and `find_by_property` index tests.
4. **Reachability** — holds. Call path `createMoveTool → executeMove → moveFailure → isDestinationExists`; `DESTINATION_EXISTS_LINE` is read by `isDestinationExists`.

**Kernel-node claim** (assessment: touches none of them) — held. `createLogger()`, `createQueue()` and `createServer()` are untouched, and `UpstreamError` is only instantiated through the existing helpers.

## Follow-ups

- Re-judge the `move` entry in `src/tools/_description-audit-record.json` against the new description (its `descriptionFingerprint` is now stale, so the audit reports `move` as needing review).
- Re-run TC-00865 (step 4), TC-00867 and TC-00900 on the next local build. TC-00900 is the live check for active mode.
- `/speckit-docs-as-code` after review: `.docs-as-code/` pages that quote `move`'s description or describe the `NOT_A_FOLDER` trigger.
