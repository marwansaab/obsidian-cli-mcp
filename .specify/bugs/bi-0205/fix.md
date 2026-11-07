# Bug Fix: `files` answers a missing folder as an empty folder

- **Slug**: bi-0205
- **Fixed**: 2026-11-07
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

When `files` is given a `folder` and the CLI lists nothing for it, the handler now checks that the folder exists with one `app.vault.adapter.stat` eval in the same vault, and raises `paths`' error shape (`CLI_REPORTED_ERROR`, `details: { stage: "envelope-error", code: "FOLDER_NOT_FOUND", folder }`) when it does not. A `folder` with a `..` segment fails the same way without the eval (owner ruling Q1 = A), because `stat` is not confined to the vault. An existing empty folder, a path that names a file and the vault root keep today's `{ count: 0, paths: [] }` answer.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/_folder-stat.ts` | added | Leaf module (no imports). `FOLDER_STAT_KIND_JS`: an in-eval async function expression `(path) => "missing" \| "file" \| "folder"`; a `stat` that answers `null` or throws is `"missing"`. Refactor rule 53: the stat rule is a shared fragment, not a third inline copy. |
| `src/tools/files/_template.ts` | added | `FOLDER_CHECK_TEMPLATE`: decodes the base64 payload and answers the `FOLDER_STAT_KIND_JS` fact for the folder as given, `{kind: "missing" \| "file" \| "folder"}`. The handler decides what each kind means (PR #154 review, owner ruling option A). |
| `src/tools/files/schema.ts` | modified | Adds `filesFolderEnvelopeSchema`, `z.strictObject({ kind: z.enum(["missing", "file", "folder"]) })`; header updated. Input and output schemas unchanged. |
| `src/tools/files/handler.ts` | modified | Adds `folderNotFound(folder)` (the one error builder) and `assertFolderExists(folder, vault, deps)`: the `..` guard on the raw value, then one trailing `/` stripped, `invokeEval` + `decodeEvalEnvelope`, and FOLDER_NOT_FOUND naming the stripped folder when `kind` is `"missing"`. `executeListFiles` runs it only when `input.folder` is set and `parseStdout` gives no entries, before the filters. Header no longer claims "single-spawn". |
| `src/tools/_folder-stat.test.ts` | added test | The fragment under `node:vm` against a stub `stat`. |
| `src/tools/files/_template.test.ts` | added test | The composed template's wiring against a stub adapter (stats the folder as given, answers `{kind}`), plus the base64 payload. |
| `src/tools/files/schema.test.ts` | added tests | Envelope schema accept / reject cases; header comment extended. |
| `src/tools/files/handler.test.ts` | modified + added tests | Approved edits to (2), (4), (9), (26), (27) only; new cases (29)–(39); helpers `FOLDER_CHECK_OK` / `FOLDER_CHECK_MISSING`; header comment extended. |
| `docs/tools/files.md` | modified | Rewrote "Single-call", the conflation section (now "Missing folder vs. empty folder") and "Path-traversal CLI-confined" (now "Path traversal"); updated the `folder` per-field policy; added a `FOLDER_NOT_FOUND` row under `CLI_REPORTED_ERROR`; rewrote the case-sensitivity note (see Deviations). |
| `CHANGELOG.md` | modified | Unreleased → Fixed entry for BI-0205, added when the PR was opened. |

## Diff Highlights

```ts
// src/tools/files/handler.ts
async function assertFolderExists(folder: string, vault: string | undefined, deps: ExecuteDeps): Promise<void> {
  if (folder.split(/[/\\]/).includes("..")) throw folderNotFound(folder);
  const stripped = folder.replace(/\/$/, "");
  const result = await invokeEval({ code: composeEvalCode(FOLDER_CHECK_TEMPLATE, { folder: stripped }), vault }, deps);
  const { kind } = decodeEvalEnvelope(result, filesFolderEnvelopeSchema, { toolName: "files", malformedCode: "CLI_REPORTED_ERROR" });
  if (kind === "missing") throw folderNotFound(stripped);
}
...
const entries = parseStdout(result.stdout);
if (input.folder !== undefined && entries.length === 0) await assertFolderExists(input.folder, input.vault, deps);
```

```ts
// src/tools/_folder-stat.ts
export const FOLDER_STAT_KIND_JS =
  "(async p=>{let s=null;try{s=await app.vault.adapter.stat(p);}catch(e){s=null;}return s===null?'missing':s.type==='folder'?'folder':'file';})";
```

## Tests Added or Updated

Existing tests changed, exactly the set the owner approved (Q1 = A, Q2 = A); no other existing test was edited:

- (2) `specific+folder no-ext …`, (4) `active+folder …`, (26) `trailing-slash folder='Inbox/' …`: only the stub `stdout`, from `""` to one direct child (`Inbox/a.md`, `Daily/a.md`, `Inbox/a.md`). Titles and assertions unchanged, including (2)'s one-spawn check.
- (9) rewritten: `empty stdout + missing folder → CLI_REPORTED_ERROR / FOLDER_NOT_FOUND naming the folder (BI-0205)`. It queues the check's eval answer and expects `details.code` / `details.folder`.
- (27) `path-traversal folder='../../etc' …`: now expects `FOLDER_NOT_FOUND` with no eval spawn; its argv assertion stays.

New:

- `handler.test.ts` (29): criterion 1. The exact `paths`-shaped error (`cause: null`, `details`, message `files: FOLDER_NOT_FOUND for folder "NoSuchFolder"`); the check is the second spawn, an `eval` with `vault=V` and payload `{ folder }`.
- `handler.test.ts` (30) ×2: criterion 2. An existing empty folder gives `{ count: 0, paths: [] }` with `total` false and true.
- `handler.test.ts` (31): criterion 3. The vault root with empty stdout gives `{ count: 0, paths: [] }` in one spawn.
- `handler.test.ts` (32): a non-empty listing that the filters empty makes no eval spawn.
- `handler.test.ts` (33): in active mode the check's eval carries no `vault=`.
- `handler.test.ts` (34) ×3: `Sandbox/../Sandbox`, `Sandbox\..\Sandbox` and `..` fail as `FOLDER_NOT_FOUND` with no eval spawn.
- `handler.test.ts` (35): `C:/x` takes the normal eval check.
- `handler.test.ts` (36)/(37): a non-JSON or wrong-shape check answer (`{kind:"symlink"}`) surfaces `decodeEvalEnvelope`'s `CLI_REPORTED_ERROR` (`stage` `json-parse` / `envelope-parse`).
- `handler.test.ts` (38): `folder: "Inbox/"` sends the payload `{ folder: "Inbox" }`, and a miss names `Inbox` (the strip moved from the template to the handler in the PR #154 review).
- `handler.test.ts` (39): a check answering `kind: "file"` keeps `{ count: 0, paths: [] }`.
- `_folder-stat.test.ts`: `null` → missing, folder → folder, file → file, throwing `stat` → missing; the path is stat-ed as given.
- `_template.test.ts`: wiring only. The template stats the payload's folder as given and answers `{kind}` from the fragment; the folder travels only in the base64 payload.
- `schema.test.ts`: the envelope accepts each `kind` and rejects an unknown kind, extra keys, the old `{ok}` shape and `{}`.

Test (16) (`.obsidian`) and `_plugin-noise.test.ts` are unchanged and pass, as the assessment predicted.

## Local Verification

- `npx vitest run src/tools/files src/tools/_folder-stat.test.ts` → 5 files, 80 tests passed.
- The same handler suite run against the unfixed `HEAD` handler (handler swapped back temporarily, then restored) → 12 failed, 28 passed: every new or changed missing-folder case fails without the fix.
- `npm test` (vitest with coverage, as CI runs it) → 206 files passed, 1 skipped; 5144 tests passed, 6 skipped. This includes `_register.test.ts` (the fingerprint baseline did not move), `architecture.test.ts`, `_surface.test.ts` and the help / docs-dir tests.
- `npm run typecheck` → clean. `npm run lint` → clean.
- `prettier --check` reports the touched files, but it also reports untouched files such as `files/index.ts` and `paths/*`, and CI does not run it, so it was not applied.
- No live-CLI run in this step. TC-00907 live confirmation is planned for `/speckit-bug-test`, under `.memory/test-execution-instructions.md`.

## CodeGraph structural verification

Index synced (`codegraph sync`), then `codegraph_explore` on `FOLDER_STAT_KIND_JS`, `FOLDER_CHECK_TEMPLATE`, `filesFolderEnvelopeSchema`, `assertFolderExists`, `folderNotFound` and `executeListFiles`:

1. **No new error codes.** `src/errors.ts` is unchanged. The new failure is `CLI_REPORTED_ERROR` with the existing `details.code` value `FOLDER_NOT_FOUND`, already used by `paths`, `move` and `pattern_search`. `UpstreamError` is only instantiated.
2. **No boot-time DI factory imports.** The handler still receives `logger` / `queue` through `ExecuteDeps`; nothing new imports `createLogger` / `createQueue` / `server.ts`.
3. **Placement and import direction.** `_folder-stat.ts` is a leaf with no imports. `files/_template.ts` imports downward (`../_folder-stat.js`, `../_shared.js`). `files/handler.ts` imports `invokeEval` from the cli-adapter facade and `decodeEvalEnvelope` / `composeEvalCode` from the shared tool helpers, the same edges `paths/handler.ts` has. No tool→tool edge. `architecture.test.ts` passes.
4. **Reachability.** `FOLDER_STAT_KIND_JS` → `FOLDER_CHECK_TEMPLATE` → `assertFolderExists` → `executeListFiles` → `createFilesTool` (registered from `server.ts`). No orphaned production symbol.

**Kernel-node claim held.** The assessment said the fix touches none of `createLogger()`, `createQueue()`, `UpstreamError` (definition) or `createServer()`. None of them changed.

## Deviations from Assessment

- **Case-sensitivity note in `docs/tools/files.md` rewritten, not only extended.** The assessment asked for the case-only-misspelling caveat "next to the existing case-sensitivity note". That note said that on Windows and macOS `folder: "inbox"` and `folder: "Inbox"` "resolve equivalently". The assessment's own probe shows the CLI listing is case-sensitive on Windows (`folder=sandbox/BI-0008` lists nothing, `Sandbox/BI-0008` lists its notes). Adding the caveat beside it would have contradicted it, so the paragraph (renamed "Case-sensitivity on `folder`") now says the listing is case-sensitive on every platform, and that only the existence check follows the file system. Same file, no code impact.
- **`details.folder` on the `..` guard is the value as given.** The check strips one trailing `/` (as `paths` does), but the guard runs first, on the raw value, and reports `input.folder` unchanged. So `../x/` reports `../x/`, while a missing `Gone/` reports `Gone`. The docs page says so.
- **The check's envelope is the stat fact `{kind}`, not the assessment's `{ok:true}` / `{ok:false, code:"FOLDER_NOT_FOUND", folder}` (PR #154 thermo-nuclear review, owner ruling option A, 2026-11-07, recorded in BI-0205 Status).** The handler never read the failure arm's `code`, and its `folder` was the handler's own input with one `/` removed, so the decision was made twice. Now the template returns `FOLDER_STAT_KIND_JS`'s answer, `filesFolderEnvelopeSchema` is `z.strictObject({ kind: z.enum(["missing","file","folder"]) })`, and `assertFolderExists(folder, vault, deps)` owns the strip and the decision (the `..` guard on the raw value, strip, `kind === "missing"` → `folderNotFound(stripped)`), the shape of `move`'s `BLOCKER_TEMPLATE`. Every caller-visible error code, message and `details` is byte-identical (the exact-error tests (9), (27), (29), (34), (35) pass unchanged), and the published surface and baseline did not move. Test edits, as the ruling allows: the PR's own new tests (`_template.test.ts`, the `schema.test.ts` envelope rows, the helpers (now `FOLDER_CHECK_OK` / `FOLDER_CHECK_MISSING`, both `{kind}` answers), (37)'s malformed row) and the new (38) / (39); existing test (9) changed only its queued eval answer; no other existing test was edited.
- **Test-file header comments.** The one-line header comments of `handler.test.ts` and `schema.test.ts` were extended to mention BI-0205. No test body outside the approved set changed.

## Follow-ups

- Move `paths/_template.ts` and `pattern_search/_template.ts` onto `FOLDER_STAT_KIND_JS` (the BI-0204 / refactor-decision item 71 follow-up). `paths` already matches the fragment's semantics (a throwing `stat` is missing); `pattern_search` lets `stat` throw today, so moving it changes that tool's behaviour.
- BI-0208: `paths` makes the same unguarded `stat` and `adapter.list`, so `folder: ".."` may list the vault's parent directory.
- `NOT_A_FOLDER` for a `folder` that names a file is out of scope here. The check already answers `kind: "file"`, so adding it is a one-line change in `assertFolderExists`.
- Rewrite TC-00154's Expected (traversal now fails as `FOLDER_NOT_FOUND`) when the fix ships, and confirm TC-00907 live in `/speckit-bug-test`.
- Spec 019 FR-010's "missing = empty = file" conflation is now reversed for the missing case. `/speckit-docs-as-code` should carry that into `.docs-as-code/`.
