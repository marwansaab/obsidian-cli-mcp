# Bug Fix: `patch_heading` append lands after the section's trailing blank line

- **Slug**: bi-0206
- **Fixed**: 2026-11-07
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`applyAppend` now inserts the content right after the last non-blank line of the heading's reach, instead of immediately before the next heading's marker. The blank lines that closed the section stay after the new content, so a list or table ending the section is extended rather than split, and the separation before the next heading is kept. This is the assessment's preferred remediation (the uniform rule, Open Question 1 resolved as A); the tool surface is unchanged (Open Question 2 resolved as A).

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/patch_heading/body-edit.ts` | modified | `applyAppend` steps back from the clamped reach end over blank lines (`lineText(line).trim() === ""`), never past `reachStartLineIndex`, and inserts there. Imports `lineText` from `../_note-lines.js` (downward, as `heading-walk.ts` already does). Doc comment and file header updated. Since the PR #157 review the check is `line.trim() === ""` and the import is gone (see Review fixes). |
| `src/tools/patch_heading/body-edit.test.ts` | added tests, updated one | New `describe` block for BI-0206 (ten cases, built with `splitNoteLines` and compared through `lineText`). The existing EOF case now uses `splitNoteLines` (the handler's edit array, no phantom empty last element) instead of `content.split("\n")`. |
| `src/tools/patch_heading/handler.line-endings.test.ts` | added test | Handler-level `it.each` on the reported list note, asserting exact written bytes for LF, CRLF, and a CRLF note whose closing blank line is LF. Header comment mentions BI-0206. |
| `src/tools/patch_heading/handler.test.ts` | updated assertion | The US1 "append against ### TODO" test asserted the defect (`"- Submit timesheet\n\n- File expense report\n### Done"`); it now asserts `"- Submit timesheet\n- File expense report\n\n### Done"`, and its comment describes the new placement. |
| `docs/tools/patch_heading.md` | modified | The `append` section and its worked example now show the list being extended with the blank line kept before `### Done`, mention table rows, and document the leading-blank-line idiom for a separate paragraph and the empty/blank-only body case. |

`src/tools/patch_heading/index.ts`, `schema.ts` and `handler.ts` are unchanged; the registration fingerprint baseline did not move.

## Diff Highlights

```ts
export function applyAppend(lines, resolved, content) {
  let insertAt = clampReachEnd(resolved.reachEndLineIndex, lines.length);
  while (insertAt > resolved.reachStartLineIndex && lineText(lines[insertAt - 1]!).trim() === "") {
    insertAt--;
  }
  const contentLines = splitContentLines(content);
  return [...lines.slice(0, insertAt), ...contentLines, ...lines.slice(insertAt)];
}
```

## Tests Added or Updated

`src/tools/patch_heading/body-edit.test.ts`, describe "applyAppend keeps the section's trailing blank lines after the content (BI-0206)":

- `extends a list that ends the section, blank line kept before the next heading`: acceptance criterion 1.
- `makes an appended table row the table's last row`: acceptance criterion 2.
- `keeps one blank line before the next heading after a paragraph`: acceptance criterion 3.
- `starts a separate block when the content begins with a blank line`: the documented idiom (`"\nNew paragraph."`).
- `at end of note with a trailing blank line, keeps the blank line after the content`: acceptance criterion 4 with a trailing blank line.
- `keeps several blank lines, all after the content`
- `treats a whitespace-only line as blank`
- `on a body of only blank lines, lands right after the heading and keeps the blanks after it`
- `with a child subtree, lands after the last child's content, its blank line kept after`
- `lands multi-line content as a whole before the blank line`
- Existing `lands content at end-of-file when the heading is the last in the note (EOF reach)`: acceptance criterion 4 without a trailing blank line, now on the handler's edit array (expectation `["# Top\n", "## A\n", "a1\n", "appended"]`).
- The empty-body case (`lands content immediately after marker on empty-body heading`) and the child-subtree, multi-line and no-modify cases stay as they were and still pass.

`src/tools/patch_heading/handler.line-endings.test.ts`:

- `BI-0206: append after a trailing blank line extends the list (LF | CRLF | CRLF with an LF blank line)`: exact written bytes through `executePatchHeading`; the added line takes the heading line's ending, and the moved blank line keeps its own terminator.

`src/tools/patch_heading/handler.test.ts`:

- `append against ### TODO lands the new bullet before ### Done`: assertion updated to the fixed placement.

## Local Verification

- Pre-fix check: with `body-edit.ts` stashed, `npx vitest run src/tools/patch_heading` → 14 failed (the ten new unit cases, the three new handler cases, and the updated `### TODO` assertion), 205 passed. With the fix restored, all pass.
- `npx vitest run src/tools/patch_heading src/tools/_note-lines.test.ts` → 10 files, 245 tests passed.
- `npm test` (full suite with coverage) → 207 files passed, 1 skipped; 5180 tests passed, 6 skipped. Re-run with `npx vitest run` after the docs edit: same result.
- `npm run typecheck` → clean. `npm run lint` → clean.
- `prettier --check`: `handler.line-endings.test.ts` was prettier-clean before the change and still is (the new `it.each` title was wrapped to match). `body-edit.ts`, `body-edit.test.ts` and `handler.test.ts` were already not prettier-clean at HEAD (the repository has about 1,576 such files and CI does not run `format:check`), so they were not reformatted.
- Manual checks: no live-CLI probes were run; the fix is pure line arithmetic exercised through the handler with the fixture fs.

## CodeGraph structural verification

Ran after `codegraph sync`, with `codegraph_explore` on `applyAppend`, `executePatchHeading` and `lineText`.

1. **No new error codes**: no `UpstreamError` construction was added; `body-edit.ts` still throws nothing. The handler's error paths are unchanged. Principle IV streak intact.
2. **No boot-time DI factories in handlers**: `body-edit.ts` does not reference `createLogger()` or `createQueue()`; its imports are `./heading-walk.js` and `../_note-lines.js` only (since the PR #157 review, `./heading-walk.js` only).
3. **Module placement and import direction**: the change stays in `src/tools/patch_heading/`. The new import `body-edit.ts` → `src/tools/_note-lines.ts` runs downward to the shared leaf module, the same edge `heading-walk.ts` and `handler.ts` already have. No upward or cyclic import. (The PR #157 review removed this edge again.)
4. **Reachability**: no new production symbol; `applyAppend` keeps its single production caller `executePatchHeading` (reached from `createPatchHeadingTool` on the boot spine).

**Kernel-node claim**: `assessment.md` stated the fix touches none of the kernel nodes (`createLogger()`, `createQueue()`, `UpstreamError`, `createServer()`). The claim held: none is referenced by the changed code.

## Deviations from Assessment

- **Optional placement-check tightening not taken.** The assessment offered tightening the handler's `keepFromLine` for append to the insertion index (exposing it from `body-edit.ts`). It was left out to keep the change minimal: the existing check (`keepFromLine: resolved.reachEndLineIndex`) still holds, and the new handler tests pin the moved blank lines byte for byte, including a mixed-terminator case. `handler.ts` is therefore unchanged.
- **Handler-level cases placed in `handler.line-endings.test.ts`, not `handler.test.ts`.** `handler.test.ts` is at 971 lines and the patch_heading test files are kept under 1000 lines (see the `handler.bytes-written.test.ts` header). The assessment allowed either file.
- **One existing assertion changed in `handler.test.ts`.** The US1 `### TODO` append test pinned the defective output. The assessment lists `handler.test.ts` among the files to change but names only the `body-edit.test.ts` EOF case as an expectation to update; this second expectation is the same defect seen through the handler, and no other existing assertion changed.
- **`docs/tools/patch_heading.md` updated in this change** rather than left to the docs-as-code pass (the assessment allowed either). The help tool serves this page verbatim, so leaving it would have documented the old placement as intended.

## Follow-ups

- `/speckit-docs-as-code` pass: check `.docs-as-code/` for any description of `patch_heading` append placement.
- Once released, retire the list/table part of the "Obsidian CLI MCP - Tool Notes" gotcha in the vault, and re-run TC-00908 against the published package.
- Horizontal-rule-ended sections (out of scope here): the uniform rule now puts the closing blank line below the appended content there too; the separate decision on rule-ended sections should take that as the new baseline.
- `specs/040-patch-heading/quickstart.md` still describes the old placement; it is a historical spec artifact and was left unchanged.

## Review fixes (PR #157)

The code-quality review of PR #157 raised two code points and one process note.

- **Unit fixtures moved onto the handler's edit array.** `body-edit.test.ts` still split most fixtures with a local `splitLines` (`content.split("
")`), whose phantom empty last element `applyAppend` now reads as a blank line; those tests passed only because no reach in them ended at end of file. The file now builds every fixture with `splitNoteLines`, as the assessment's "Tests to add or update" recommends: one `edit(apply, note, segments, content)` helper runs any of the three `apply*` functions and compares the result as `lineText`, replacing both `splitLines` and the BI-0206 block's `appendText`. The expected arrays of the earlier append, prepend, replace and multi-line cases lose their trailing `""` (the phantom element), and nothing else in them changes. The two no-modify-guarantee cases compare raw elements, so they now check the kept lines' terminators byte for byte (`out.slice(-3)` becomes `out.slice(-2)` for the same reason). The EOF case is unchanged. Against main's `applyAppend` the ten BI-0206 unit cases still fail.
- **Redundant `lineText` dropped.** `applyAppend`'s blank check is now `lines[insertAt - 1]!.trim() === ""`. `trim()` already removes `` and `
`, so the result is the same for every line, and `body-edit.ts` no longer imports `../_note-lines.js`.
- **Left as is: the `### TODO` assertion change in `handler.test.ts`.** The review flagged it for the owner's awareness only (it pinned the defect, and Deviations above discloses it); there is nothing to fix in code.

Quality gates after the fixes: lint, typecheck and build clean; `npm test` 5180 passed, 6 skipped, 97.19% statements.
