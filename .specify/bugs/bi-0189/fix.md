# Bug Fix: open_file reports success without checking that the file became active

- **Slug**: bi-0189
- **Fixed**: 2026-11-07
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`open_file`'s eval now confirms, after every placement branch, that the resolved file is Obsidian's active file (object identity, polled every 50 ms for up to 1 s), and returns a `FOCUS_NOT_APPLIED` envelope when it is not. The handler maps that envelope to `CLI_REPORTED_ERROR` with `details: { stage: "focus", path, vault, active }` and a message that names the file and the recovery, the shape BI-0179 settled for `views_base`.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/open_file/_template.ts` | modified | Focus check after the placement branch, for all three placements: `for(...20...&&getActiveFile()!==f) await 50 ms`, then `{ok:false, code:'FOCUS_NOT_APPLIED', opened:f.path, active:g?g.path:null}` on a miss. Placement branches unchanged, no retry of the open. Header comment explains why. |
| `src/tools/open_file/schema.ts` | modified | `openEvalResponseSchema`'s `ok:false` arm is now a nested `discriminatedUnion("code")` with a strict `FOCUS_NOT_APPLIED` variant (`opened: string`, `active: string \| null`), as in `focusBaseEvalResponseSchema`. The `OpenFileEvalErrorCode` type, whose only user was the old `mapEvalError` signature, is removed. |
| `src/tools/open_file/handler.ts` | modified | `mapEvalError` takes the narrowed `ok:false` envelope and gains the `FOCUS_NOT_APPLIED` case; the `switch` is exhaustive with a `never` default (as `focusNamedBase`). Header comment updated. |
| `src/tools/open_file/_template.test.ts` | added tests | `node:vm` suite through `runEvalTemplate` on fake timers. |
| `src/tools/open_file/schema.test.ts` | added tests | New variant accepted; strict rejections. |
| `src/tools/open_file/handler.test.ts` | added tests | Focus-failure mapping, resolved path, `active: null`, no disk path; the "every failure rejects" table gains the focus row. |
| `docs/tools/open_file.md` | modified | Error roster gains the `stage: "focus"` row; "nothing is opened" sentence now excepts it; the "When to reach for it" bullet says a non-active open is an error. |
| `CHANGELOG.md` | modified | `[Unreleased]` → Fixed entry. |

`src/tools/open_file/index.ts` is unchanged, so the tool description and the fingerprint baseline did not move (the `_register` baseline test passes).

## Diff Highlights

```js
else{await app.workspace.openLinkText(f.path,'',false);placement='active_tab_used';}
for(let i=0;i<20&&app.workspace.getActiveFile()!==f;i++)await new Promise(r=>setTimeout(r,50));
const g=app.workspace.getActiveFile();
if(g!==f)return JSON.stringify({ok:false,code:'FOCUS_NOT_APPLIED',opened:f.path,active:g?g.path:null});
return JSON.stringify({ok:true,opened:f.path,new_tab:a.new_tab,placement});
```

```ts
case "FOCUS_NOT_APPLIED":
  return new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: { stage: "focus", path: data.opened, vault, active: data.active },
    message:
      `open_file: "${data.opened}" did not become the active file in vault "${vault}"; retry open_file, ` +
      `or act on it with target_mode "specific", vault "${vault}" and path "${data.opened}" instead of an active-mode call`,
  });
```

## Tests Added or Updated

- `src/tools/open_file/_template.test.ts` › "focus check after every placement (BI-0189)", run for each of `new_tab_created`, `existing_tab_reused`, `active_tab_used`:
  - open lands at once → `ok:true` with that placement, exactly one open call of the right kind (`openLinkText` with the right `new_tab` argument, or `setActiveLeaf`), two `getActiveFile()` reads (no polling);
  - lands late → `ok:true` after polling (five reads);
  - never lands → `FOCUS_NOT_APPLIED` with `opened` and `active` after the bounded wait (21 reads), and the open was issued once (no retry);
  - nothing in front → `active: null`;
  - a different file object with the same path text is not taken for the file (`FOCUS_NOT_APPLIED`).
- Same suite: a bare `file` name resolves, and the envelope's `opened` is the resolved path; `FILE_NOT_FOUND` and `UNSUPPORTED_FILE_TYPE` return before any open call or focus read.
- `src/tools/open_file/schema.test.ts` › `openEvalResponseSchema`: `FOCUS_NOT_APPLIED` accepted with `active` a string or `null`; rejected when `active` or `opened` is missing, with a stray key, with `ok:true`, and when `opened`/`active` ride on `FILE_NOT_FOUND`.
- `src/tools/open_file/handler.test.ts`:
  - `FOCUS_NOT_APPLIED` → `CLI_REPORTED_ERROR`, `cause` null, `details` exactly `{ stage: "focus", path: "B.md", vault: "Work", active: "A.md" }`, the exact message, one spawn (`makeQueuedSpawn` with one response);
  - bare `file` locator → `details.path` and the message carry the resolved path `Projects/Roadmap.md`;
  - `active: null` → same path, and neither message nor details contain the registry base path `/vaults/Work`;
  - "every failure case rejects" now includes the focus row.
- Existing byte-stability, anti-injection, happy-path, placement, `new_tab`, error-roster and app-down tests are unchanged and green.

## Local Verification

- `npx vitest run src/tools/open_file` → 4 files, 108 tests passed.
- `npm test` (full suite with coverage) → 203 files passed, 1 skipped; 5106 tests passed, 6 skipped.
- `npx tsc --noEmit` → clean.
- `npx eslint .` → clean.
- Manual checks: none. Live checks against the authorised vault (every file type and placement, plus the cross-vault case) belong to `/speckit-bug-test`, as the assessment's Resolved (Relay) note settles.

## CodeGraph structural verification

Run with `codegraph_explore` on `mapEvalError`, `executeOpenFile`, `openEvalResponseSchema`, `JS_TEMPLATE` and `createOpenFileTool` after the change.

1. **No new top-level error codes** (Principle IV): `src/errors.ts` is untouched. The new failure is classified through `UpstreamError` under the existing `CLI_REPORTED_ERROR`, with `details.stage: "focus"` and no `details.code` / `details.reason`, so no ADR-015 closed set grows.
2. **No production handler imports the boot-time DI factories**: `handler.ts`'s imports are unchanged apart from the type `OpenFileEvalResponse` replacing `OpenFileEvalErrorCode` from `./schema.js`. `createLogger()` / `createQueue()` stay in `server.ts`; the handler receives them through `ExecuteDeps`.
3. **Module placement and import direction** (Principle I): every change is inside `src/tools/open_file/`. The template still imports only `B64_PAYLOAD_DECODE_EXPR` from `../_shared.js`; the test imports `runEvalTemplate` from `../_eval-template-fixtures.js` (test support, downward). No import of `views_base`; the shape is copied by convention, not by an edge.
4. **Reachability**: the call path `createOpenFileTool → executeOpenFile → mapEvalError` holds, and the new `FOCUS_NOT_APPLIED` case is reached from the template's new return through `decodeEvalEnvelope` and `openEvalResponseSchema`. No orphaned production symbol; the one symbol the change made unused (`OpenFileEvalErrorCode`) was removed.

**Kernel-node claim held**: the assessment says the fix touches none of the kernel nodes. It does not: `createLogger()`, `createQueue()`, `UpstreamError` (used, not changed) and `createServer()` are untouched. Shared helpers `decodeEvalEnvelope`, `resolveVaultRootOrRemap`, `composeEvalCode` and `runEvalTemplate` are used unchanged, as the assessment required.

## Deviations from Assessment

- **Removed `OpenFileEvalErrorCode`** (`schema.ts`). Not listed in the assessment. `mapEvalError` now takes the narrowed `ok:false` envelope (so the `FOCUS_NOT_APPLIED` case can read `opened` and `active`), which left this exported type with no user; it was removed as an orphan of this change. `OPEN_FILE_EVAL_ERROR_CODES` stays, as the enum of the two original codes.
- **Handler header comment** gained one clause saying the BI-0189 focus wait runs inside the one eval and is not a per-tool retry, because the existing sentence "open_file adds NO per-tool retry/poll/launch" would otherwise read as contradicted by the template's poll.

No other departure: the files changed are the ones the assessment lists, and `index.ts` stayed unchanged as it expected.

## Follow-ups

- `/speckit-bug-test slug=bi-0189`: the live checks from the assessment (note, canvas, PDF or image, `.base`, in all three placements, each followed by `get_active_file`; plus the cross-vault note followed by `get_active_file` with `target_mode: "specific"`).
- `write_note`'s `open` option opens through `openLinkText` with no check: same failure class, out of scope here (assessment, Risks & Considerations). Mention it in the PR as a possible follow-up.
- `.docs-as-code/` pages that describe `open_file`'s error roster are updated by `/speckit-docs-as-code` after review.
