# Bug Fix: No-active-file advice names inputs or tools the caller cannot use

- **Slug**: bi-0193
- **Fixed**: 2026-11-07
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Six tools built their `ERR_NO_ACTIVE_FILE` message in a way that the caller could not follow. `find_and_replace` was told to pass `target_mode`, which it does not accept. `set_property` was told to call the retired `write_property`. `backlinks`, `links`, `read_heading` and `smart_connections_similar` said "switch to specific mode" but named no vault and no note. The five tools with a target mode now use the shared cohort sentence `noActiveFileMessage(<tool>)`, which names `target_mode=specific`, a vault and `file`/`path`. `find_and_replace` rethrows through the existing `throwIfNoActiveFile` with advice that names only its own inputs. The code, cause and `details` of every error are unchanged, and the dispatch-level default is unchanged (Relay Q1 = A).

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/_active-file.ts` | modified | `noActiveFileMessage(toolName)` is now exported, with its text unchanged. Its JSDoc says which tools may use it: only tools whose input has `target_mode`, `vault`, `file` and `path`. |
| `src/tools/set_property/handler.ts` | modified | The active-mode no-file message is now `noActiveFileMessage("set_property")`. `details: {}` and the code are unchanged. The three `write_property:` `CLI_REPORTED_ERROR` messages are left as they are (Relay Q3 = A). |
| `src/tools/backlinks/handler.ts`, `src/tools/links/handler.ts`, `src/tools/read_heading/handler.ts`, `src/tools/smart_connections_similar/handler.ts` | modified | The envelope `NO_ACTIVE_FILE` → `ERR_NO_ACTIVE_FILE` mapping now uses `noActiveFileMessage("<tool>")`. `details` (`stage: "envelope-error"`, `detail`) and the eval templates are byte-identical. |
| `src/tools/find_and_replace/handler.ts` | modified | `resolveSingleNoteScope`'s `active_note` branch catches the resolver's error and rethrows through `throwIfNoActiveFile(err, NO_ACTIVE_FILE_MESSAGE)`. A new module constant holds the advice. Other errors are rethrown unchanged. |
| `src/tools/{backlinks,links,read_heading,smart_connections_similar}/handler.test.ts` | added test | Each pins the exact new message and the exact `details` (`toEqual`). |
| `src/tools/set_property/handler.test.ts` | added test | Pins the exact message, checks it does not contain `write_property`, and checks `details` is `{}`. |
| `src/tools/find_and_replace/scope.test.ts` | added test | Pins the exact message, checks it does not contain `target_mode`, and checks that `cause` is null and `details` is `{}`. |
| `src/tools/smart_connections_similar/handler.lifecycle.test.ts` | modified assertion | Only the `NO_ACTIVE_FILE.message` expectation (line 138) changed, to the new sentence. This is the one edit the owner approved (Relay Q2 = A, 2026-11-07). The `details` expectation is unchanged. |
| `src/tools/_no-active-file-advice.test.ts` | added test | Cross-tool acceptance guard, described below. |

## Diff Highlights

```ts
// src/tools/find_and_replace/handler.ts
const NO_ACTIVE_FILE_MESSAGE =
  "No active file in Obsidian. Open a note in the editor, or call find_and_replace with path or file (and vault) instead of active_note.";
...
    let active: ActiveFileLocator;
    try {
      active = await resolveActiveFocusedFile(deps, "find_and_replace");
    } catch (err) {
      // BI-0193: the resolver's advice names target_mode, which this tool does not take.
      throwIfNoActiveFile(err, NO_ACTIVE_FILE_MESSAGE);
      throw err;
    }
```

```ts
// src/tools/set_property/handler.ts (and the same shape in the four eval tools)
        message: noActiveFileMessage("set_property"),
```

## Tests Added or Updated

- `src/tools/_no-active-file-advice.test.ts` › `ERR_NO_ACTIVE_FILE advice names only the tool's own inputs (BI-0193)` (one row per tool: `backlinks`, `links`, `read_heading`, `smart_connections_similar`, `set_property`, `find_and_replace`). Each row runs the real handler in its active-note form with no note open and checks four things. (1) The error is `ERR_NO_ACTIVE_FILE`. (2) The advice says `call <this tool> with`. (3) Every input key of these six tools that the advice names, as a whole word, is a key of this tool's published `descriptor.inputSchema`. (4) A tool with `target_mode` is told `target_mode=specific`, a vault and `file`/`path`; a tool without it is never told `target_mode`. A mutation check confirmed the guard works: with the two old handlers stashed, the `set_property` and `find_and_replace` rows fail, which catches both the retired tool name and the unaccepted input.
- `src/tools/backlinks/handler.test.ts`, `links/handler.test.ts`, `read_heading/handler.test.ts`, `smart_connections_similar/handler.test.ts` › `… advice names target_mode=specific + vault + file/path (BI-0193)`: exact message, and `details` exactly `{ stage: "envelope-error", detail }`.
- `src/tools/set_property/handler.test.ts` › `active no-focused-file — ERR_NO_ACTIVE_FILE advice names set_property + target_mode=specific + vault + file/path (BI-0193)`.
- `src/tools/find_and_replace/scope.test.ts` › `no note open → advice names path / file (and vault), never target_mode (BI-0193)`.
- `src/tools/smart_connections_similar/handler.lifecycle.test.ts` (approved edit): the A1/A3 lifecycle rows now expect the new message.

## Local Verification

- `npx tsc --noEmit` → exit 0.
- `npx vitest run` on the affected suites (the six tools, `_active-file.test.ts` and the new guard): 28 files passed, 718 tests passed.
- `npm test` (full suite with coverage, including the FR-018 register-baseline fingerprint gate): 204 files passed, 1 skipped; 5109 tests passed, 6 skipped; exit 0. Apart from the one approved assertion, no existing test needed an edit, and the published tool surface did not move (no `baseline:write`).
- `npx eslint .` → exit 0. `npm run build` → exit 0.
- `npx prettier --check` reports style warnings on almost every file in the touched folders, including files this fix did not touch (for example `find_and_replace/schema.ts` and `set_property/index.ts`). These warnings come from the checkout, not from this change. No files were reformatted.
- Mutation check: `git stash` of `set_property/handler.ts` and `find_and_replace/handler.ts`, then a run of the guard → 2 failed (`set_property`, `find_and_replace`) and 4 passed; then `git stash pop`.
- Docs grep: no page in `docs/`, `README.md`, `CONTRIBUTING.md` or `.docs-as-code/` quotes the old sentences. `docs/tools/find_and_replace.md:140` already gives the matching advice.
- Not run: the live re-check TC-00776. It needs the owner to focus the test vault and close its tabs (`owner_input: required`). That is for `/speckit-bug-test`.

## CodeGraph structural verification

The index was synced (`codegraph sync`) before these checks. `codegraph_explore` was run on `noActiveFileMessage`, `throwIfNoActiveFile`, `resolveSingleNoteScope` and `executeWriteProperty`.

1. **No new error codes (Principle IV).** `src/errors.ts` is unchanged (`git diff` is empty). Every changed path still raises `ERR_NO_ACTIVE_FILE` through `UpstreamError`; only `message` changed.
2. **No boot-time DI factories in handlers.** None of the changed production files adds an import of `createLogger`, `createQueue` or `createServer`. The only added imports are `noActiveFileMessage`, `throwIfNoActiveFile` and the `ActiveFileLocator` type from `../_active-file.js`.
3. **Module placement and import direction (Principle I).** `noActiveFileMessage` stays in `src/tools/_active-file.ts`, the shared tools-layer helper. The new imports run from tool handlers to that sibling helper, the same direction as the existing `views_base` / `obsidian_exec` imports of `throwIfNoActiveFile`. `set_property` → `_active-file` is a new edge. It creates no cycle, because `_active-file.ts` imports nothing from `tools/*`.
4. **Reachability.** `noActiveFileMessage` now has production callers in `_active-file.ts` (`resolveActiveFocusedFile`) and in the `backlinks`, `links`, `read_heading`, `smart_connections_similar` and `set_property` handlers. `throwIfNoActiveFile` gains `find_and_replace`'s `resolveSingleNoteScope` as a production caller. The new `NO_ACTIVE_FILE_MESSAGE` constant in `find_and_replace/handler.ts` is read by that function.

**Kernel-node claim.** `assessment.md` says the fix touches none of the kernel nodes. That holds. `createLogger()`, `createQueue()` and `createServer()` are not changed and not newly imported, and `UpstreamError` is only constructed with its existing shape and an existing code. No boot-spine file (`server.ts`, `tools/_register.ts`) changed.

## Deviations from Assessment

- **Wording of `find_and_replace`'s advice.** The assessment gave an example sentence, prefixed "for example": `… or call find_and_replace without active_note and name the note with path or file (and vault).` The shipped sentence is `… or call find_and_replace with path or file (and vault) instead of active_note.` It names the same inputs (`path`, `file`, `vault`, `active_note`) and matches `docs/tools/find_and_replace.md:140`. The change came from the acceptance guard. It treats every input key of the six tools as a word the advice may name, and `name` is one of `set_property`'s inputs, so the example's "name the note" would read as naming an input that `find_and_replace` does not take.
- **Formatting of the approved assertion.** The new expected message in `handler.lifecycle.test.ts` is longer than one line, so the `message:` value now sits on the next line (lines 138–139). It is still the single approved assertion, and the `details` line is unchanged.
- **Location of the acceptance guard.** The assessment offered `_active-file.test.ts` or a small cross-tool test. It is a new file, `src/tools/_no-active-file-advice.test.ts`, so that `_active-file.test.ts` (the helper's own unit tests) stays unchanged. It covers the six tools this fix changes.

## Follow-ups

- **`set_property`'s other `write_property:` prefixes** (Relay Q3 = A, recorded here as asked). Three `CLI_REPORTED_ERROR` messages in `src/tools/set_property/handler.ts` still carry the retired tool name: `parseFileTSV`'s `write_property: file subcommand stdout did not contain a path line`, and the two active-mode eval parse failures, `write_property: active-mode focused-file eval returned unparseable response` and `… returned unexpected shape`. The owner decides whether to file a backlog item.
- **Residual risk: the eval C2 route** (accepted with Relay Q1 = A). If an eval prints no answer line and some line starts with `Error: no active file`, a tool without a target mode, or the folder-scoped `files` / `paths`, could still receive the dispatch default, which names `target_mode` and `file`. The root fix (caller-supplied advice at dispatch) is still open, as BI-0174 recorded.
- **Wider guard coverage.** The acceptance guard covers the six tools changed here. The file-cohort tools (`write_note`, `append_note`, `prepend`, `patch_block`, `patch_heading`, `read`, `rename`, `move`, `outline`) and the dispatch-default reachers (`delete`, `read_property`) are compliant today, but no row checks them. Adding them needs per-tool fs or spawn fixtures, so it is left as a candidate for later.
- **Docs-as-code pass.** Check the error tables in `docs/tools/{backlinks,links,read_heading,smart_connections_similar,set_property}.md` for any paraphrase of the old wording (the grep found no verbatim quote). Note that the four eval tools' messages lost their `<tool>: ` prefix.
- **Live re-check.** Re-run TC-00776 (`find_and_replace`, `active_note: true`, no note open) at `/speckit-bug-test`, with the owner focusing the test vault and closing its tabs.
