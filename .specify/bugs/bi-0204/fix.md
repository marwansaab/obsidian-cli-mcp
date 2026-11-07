# Bug Fix: pattern_search treats a note given as `folder` as an empty folder

- **Slug**: bi-0204
- **Fixed**: 2026-11-07
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`pattern_search`'s frozen eval template now checks the scope folder's `stat().type`, as `paths` does, and answers `{ ok:false, code:"NOT_A_FOLDER", folder }` when `folder` names a note or other file. The handler raises that as `CLI_REPORTED_ERROR` with `details.code: "NOT_A_FOLDER"` and a message carrying the CLI's own `"<path>" is a file, not a folder` phrase, instead of returning the false-negative `{ count: 0, matches: [] }`.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/pattern_search/_template.ts` | modified | After the `s===null` check, `if(s.type!=="folder")return …NOT_A_FOLDER…`. Missing-folder branch, scan and success envelope unchanged. Header comment updated. |
| `src/tools/pattern_search/schema.ts` | modified | Eval envelope failure branch widened to `code: z.enum(["FOLDER_NOT_FOUND", "NOT_A_FOLDER"])`, as in `paths`. Input and output schemas unchanged. Header comment updated. |
| `src/tools/pattern_search/handler.ts` | modified | Stage 7 raises `CLI_REPORTED_ERROR` for `NOT_A_FOLDER` (`cause: null`, `details: { code, folder, stage: "handler-stage-3" }`). The `FOLDER_NOT_FOUND` error stays byte-identical. Header comment no longer claims "zero new details.code values"; it names `NOT_A_FOLDER` as an existing project-wide value, new to this tool. |
| `src/tools/pattern_search/_template.test.ts` | added tests | New `describe` running the template under `node:vm` for a file `stat`, a `null` `stat` and a folder `stat`. |
| `src/tools/pattern_search/handler.test.ts` | added test | (21b) `NOT_A_FOLDER` envelope → error shape and message. |
| `src/tools/pattern_search/schema.test.ts` | added test | Envelope accepts `ok:false, code:"NOT_A_FOLDER"`. |
| `docs/tools/pattern_search.md` | modified | `folder` bullet (a note path is rejected; pass its folder), zero-matches bullet, and a `NOT_A_FOLDER` row in the error roster. Served at runtime by `help`. |

## Diff Highlights

```js
if(a.folder!==null){const s=await app.vault.adapter.stat(a.folder);if(s===null)return JSON.stringify({ok:false,code:"FOLDER_NOT_FOUND",folder:a.folder});if(s.type!=="folder")return JSON.stringify({ok:false,code:"NOT_A_FOLDER",folder:a.folder});}
```

```ts
if (validated.data.code === "NOT_A_FOLDER") {
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: { code: "NOT_A_FOLDER", folder: validated.data.folder, stage: "handler-stage-3" },
    message: `pattern_search: "${validated.data.folder}" is a file, not a folder. Pass the folder that contains it, or omit folder to search the whole vault.`,
  });
}
```

## Tests Added or Updated

- `_template.test.ts` › "rejects a folder that names a file with NOT_A_FOLDER and reads no note": a `{ type: "file" }` stat gives `{ ok:false, code:"NOT_A_FOLDER", folder }` and `cachedRead` is never called (acceptance criterion 1, template side).
- `_template.test.ts` › "still answers FOLDER_NOT_FOUND when stat returns null": criterion 3, template side.
- `_template.test.ts` › "still scans a folder's notes when stat reports a folder": criterion 2, template side (the containing folder returns the `zebrafish` match).
- `handler.test.ts` › "US2 (21b) NOT_A_FOLDER envelope → CLI_REPORTED_ERROR(details.code:NOT_A_FOLDER) naming the path": exact `details`, `cause: null`, and the message contains `"Repro1106/single.md" is a file, not a folder` (criteria 1 and 4).
- `schema.test.ts` › "patternSearchEvalEnvelopeSchema: ok:false branch accepts code='NOT_A_FOLDER' (BI-0204)".
- Unchanged and passing: handler (21) `FOLDER_NOT_FOUND` (criterion 3), C4 (32) existing folder with no matches (criterion 2), schema test rejecting `code: "OTHER"`. No existing assertion was edited (`.memory/refactor-decisions.md` item 5).

## Local Verification

- `npx vitest run src/tools/pattern_search` → 4 files, 74 tests passed.
- `npx vitest run` (full suite) → 204 files passed, 1 skipped; 5114 tests passed, 6 skipped. Includes the registry fingerprint baseline, which did not move (no description or schema change).
- `npx tsc --noEmit` → clean.
- `npx eslint src/tools/pattern_search` → clean.
- Manual checks: none. The live-CLI confirmation of TC-00906 (note path rejected, containing folder matches, missing folder unchanged, `context_search` with the same path) belongs to `/speckit-bug-test`, under `.memory/test-execution-instructions.md`.

## CodeGraph structural verification

Run on `executePatternSearch`, `createPatternSearchTool`, `JS_TEMPLATE`, `patternSearchEvalEnvelopeSchema` and `UpstreamError` after the change.

1. **No new top-level error code** — holds. The new branch raises the existing `CLI_REPORTED_ERROR`; `src/errors.ts` is unchanged. `NOT_A_FOLDER` is an existing `details.code` sub-discriminator (`paths`, `move`).
2. **No handler imports the boot-time DI factories** — holds. `handler.ts` imports are unchanged; `logger` / `queue` still arrive through `ExecuteDeps`.
3. **Module placement and import direction** — holds. All changes sit in `src/tools/pattern_search/`; no import was added.
4. **Reachability** — holds. No new symbol was added; the new branch lives in `executePatternSearch`, reached through `createPatternSearchTool` from `server.ts`.

Kernel-node claim from `assessment.md` (touches none of `createLogger()`, `createQueue()`, `UpstreamError`, `createServer()`): **held**. `UpstreamError` is only instantiated, as every handler does.

## Deviations from Assessment

- The assessment's test list says the existing `_template.test.ts` "`stat === null` case still gives `FOLDER_NOT_FOUND`". No such case existed: every existing template test stubs `stat` as `{ type: "folder" }`. The fix adds that case, plus a folder-scan case, alongside the new `NOT_A_FOLDER` case, so all three branches of the folder check are pinned at template level. No existing test changed.

## Follow-ups

- `/speckit-bug-test slug=bi-0204`: live TC-00906 confirmation, including `context_search` with the same note path for criterion 4.
- `/speckit-docs-as-code <n>` after review: `.docs-as-code/` pages that describe `pattern_search`'s error roster.
