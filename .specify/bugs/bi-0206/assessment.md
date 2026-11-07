# Bug Assessment: `patch_heading` append lands after the section's trailing blank line

- **Slug**: bi-0206
- **Created**: 2026-11-07
- **Source**: pasted text (BI-0206 backlog item; reproduction recorded in vault test case TC-00908 "Patch Heading Append Extends A Trailing List"). No URL was supplied, so the URL Trust Policy did not apply.
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> **Impact.** Appending a bullet or a table row under a heading is the commonest `append` use in every vault (rules lists, index tables, Decision Log rows). Each append degrades the note, and the agent has to switch to a full-body `replace`, which costs a read and a larger write.
>
> **Status and evidence.** Queued 2026-11-07, awaiting owner triage. Filed from the imported-tool-notes sweep, reproduced on the published `@marwansaab/obsidian-cli-mcp@0.9.0` (TC-00908). Reported by the Wrightyard notes (lists); the same behaviour for tables and trailing `---` rules is already a gotcha in "Obsidian CLI MCP - Tool Notes", with no BI until now.
>
> **Defect.** `patch_heading` `mode: "append"` on a section whose body ends in a list (or table) and a blank line inserts the new content after the blank line: `- one` / `- two` / blank / `- three` / `## After`. Markdown renders two lists (or a split table), and no blank line is left before the next heading.

The report also carries an expected-behaviour draft (feature "Keep appends attached"), whose acceptance criteria this assessment adopts as the fix's success criteria:

1. Given a section whose body is `- one`, `- two` and a blank line before the next heading, appending `- three` gives `- one`, `- two`, `- three`, then one blank line, then the next heading.
2. Given a section ending in a table and a blank line, an appended table row becomes the table's last row, and a blank line still precedes the next heading.
3. Given a section ending in a paragraph, appending a paragraph keeps one blank line before the next heading.
4. Given a section with no following heading (end of note), the content is added at the end without extra blank lines.

Out of scope, per the report: how `replace` and `prepend` handle blank lines; section bodies ending in a horizontal rule (decided separately); inserting content in the middle of a section.

## Symptom

`patch_heading` with `mode: "append"` inserts the content immediately before the next equal-or-higher-rank heading, i.e. after any blank lines that close the section. A list or table that ends the section is split in two by that blank line, and the appended line sits directly against the next heading. Expected: the content joins the section's last content line, and the section's trailing blank line(s) stay between the new content and the next heading.

## Reproduction

1. Create a note containing:
   ```markdown
   ## Before
   - one
   - two

   ## After
   ```
2. Call `patch_heading` with `heading_path` addressing `Before` (for example under a `# Top` parent, `Top#Before`), `mode: "append"`, `content: "- three"`.
3. Read the note. Observed:
   ```markdown
   ## Before
   - one
   - two

   - three
   ## After
   ```
   Expected:
   ```markdown
   ## Before
   - one
   - two
   - three

   ## After
   ```

The same placement follows from the code for a table (`| a | b |` rows, blank line, next heading) and for any other last block. Traced against the code (see below); the reproduction on the published 0.9.0 is recorded in TC-00908.

## Suspected Code Paths

- `src/tools/patch_heading/body-edit.ts:37` `applyAppend()` — inserts the content lines at `clampReachEnd(resolved.reachEndLineIndex, lines.length)`, the index of the next equal-or-higher-rank heading's marker (or the line count at end of file). Nothing skips back over blank lines that close the reach, so the content always lands after them. This is the defect.
- `src/tools/patch_heading/heading-walk.ts:141` `materialiseResolved()` — sets `reachEndLineIndex` to the next heading's marker line. Correct as the reach boundary; the fix should not move it, since `replace` and the placement check depend on it.
- `src/tools/patch_heading/handler.ts:119-139` `executePatchHeading()` — dispatches to `applyAppend` and runs `placeEdit` with `keepFromLine: resolved.reachEndLineIndex`. The placement check stays satisfied by the fix (the original bytes from the reach end on are still the edited note's suffix), so the handler needs no change for correctness.
- `src/tools/_note-lines.ts:24` `splitNoteLines()` / `:40` `lineText()` / `:68` `joinNoteLines()` — the handler's edit array: each element keeps its own terminator and there is no phantom empty last element, so a blank line is an element whose `lineText` is empty. Content lines are inserted without terminators and get the heading line's ending on reassembly, which already gives the right bytes when the insertion index moves earlier.
- `docs/tools/patch_heading.md:62-85` — documents the current behaviour as intended ("The new bullet lands at the line immediately before `### Done`. The intervening blank stays where it was."), with a worked example showing the split list. It must change with the fix.

## Root Cause Hypothesis

`applyAppend` treats "end of the heading's section" as "immediately before the next heading's marker line". In Markdown notes a section's last block is normally followed by one or more blank lines before the next heading, and those blank lines belong to the separation, not to the content. Inserting after them puts the new content in a new block (splitting a list or table) and removes the separation from the next heading. Confidence: high. The code path is one line, the documented example shows exactly the reported output, and no other code moves the insertion point.

## Proposed Remediation

**Preferred**: in `applyAppend`, compute the insertion index by starting at the clamped reach end and stepping back over blank lines (a line whose `lineText` is empty or whitespace-only), never going before `resolved.reachStartLineIndex`. Insert the content lines there, so the trailing blank lines that closed the section now follow the appended content unchanged. This one rule meets all four acceptance criteria:

- list or table ending the section: the new line directly follows the last row or item, and the blank line(s) stay before the next heading;
- paragraph ending the section: the blank line(s) stay before the next heading;
- end of note: a note ending in content gets the content at the end exactly as today; a note ending in blank lines keeps them after the new content, so no blank line is added or lost;
- a section whose body is empty or only blank lines: content lands right after the heading line, with the blank lines kept after it;
- a heading with child subtrees: the content still lands at the end of the full reach (after the last child's content), with the last child's trailing blank lines kept after it.

The helper keeps its contract of not adding or stripping newlines from the supplied content, so an agent that wants a separate block (a new paragraph after a paragraph) supplies a leading blank line in `content` (`"\nNew paragraph"`), which `splitContentLines` already preserves as an empty first line. Import `lineText` from `../_note-lines.js` into `body-edit.ts` (a downward import, the same one `heading-walk.ts` already makes for `splitLinesForScan`).

Optionally tighten the handler's placement check for append to `keepFromLine: <the insertion index>`, which proves the moved blank lines survived byte-for-byte. That needs the insertion index exposed from `body-edit.ts` (a small exported helper used by both `applyAppend` and the handler). It is a strengthening, not required for correctness; the fix step can decide by the refactor-decisions record.

Leave the tool description in `index.ts` and the `mode` field's `.describe()` text in `schema.ts` unchanged (resolved, see Open Questions): per ADR-074 a tool description says only when to use the tool, and per ADR-040 a parameter description says only what the parameter is, its format and its default. "Adds at the end of the heading's section" stays accurate, and the tool-surface fingerprint baseline does not move. The behaviour change is described in `docs/tools/patch_heading.md` (updated in the docs-as-code pass, or alongside the fix).

**Alternatives**:

- *Attach only when the section ends in a list or table.* Detect the last block's type and skip back over the blank lines only for list items (`-`, `*`, `+`, `1.`) and table rows (`|`); otherwise keep today's placement. Keeps paragraph appends as separate paragraphs, but adds Markdown block detection (task lists, nested lists, indented continuations, tables without leading pipes) to a pure line helper, and leaves acceptance criterion 3 unmet (a paragraph appended after a paragraph still sits directly on the next heading). Not preferred.
- *Insert after the blank lines but add a blank line before the next heading.* Keeps the separation but still splits the list or table; fails acceptance criteria 1 and 2. Rejected.

**Files likely to change**:

- `src/tools/patch_heading/body-edit.ts` (`applyAppend`, its doc comment, the file header's mode summary if it names the placement)
- `src/tools/patch_heading/body-edit.test.ts`
- `src/tools/patch_heading/handler.test.ts` (or `handler.line-endings.test.ts` for the CRLF case)
- `src/tools/patch_heading/handler.ts` only if the optional placement-check tightening is taken
- `docs/tools/patch_heading.md` (the `append` section and its worked example)

**Tests to add or update**:

- `applyAppend` unit cases, one per acceptance criterion: list + blank + next heading; table + blank + next heading; paragraph + blank + next heading; end of note with no trailing blank line; end of note with a trailing blank line.
- Boundary cases: several blank lines before the next heading (all kept, after the content); whitespace-only blank line; a body of only blank lines; an empty body (marker directly followed by the next heading, unchanged from today); a child subtree whose last content is followed by a blank line; multi-line content; content with a leading blank line (kept, so a separate paragraph is possible).
- Handler-level case through `executePatchHeading` with the fixture fs: the reported list note, asserting the exact written bytes, and the same on a CRLF note (added lines take `\r\n`, the moved blank line keeps its own terminator).
- The existing EOF case in `body-edit.test.ts` (`"lands content at end-of-file …"`) splits its fixture with `content.split("\n")`, which leaves a phantom empty last element that the new rule would read as a blank line. Its expectation changes with the fix; better, build the unit fixtures with `splitNoteLines` so they model the handler's edit array (no phantom element) instead of a split the handler never uses.

## Risks & Considerations

- **Behaviour change for paragraph appends.** Today, appending a paragraph after a paragraph that is followed by a blank line produces two paragraphs (with the new one sitting directly on the next heading). After the fix the new line follows the old paragraph directly, which Markdown renders as one paragraph (Obsidian shows a line break inside it unless strict line breaks are on). Agents wanting a separate paragraph must start `content` with a blank line. This is the cost of the uniform rule; the docs must state it, with an example. See Open Questions.
- **Documented behaviour changes.** `docs/tools/patch_heading.md` presents the current placement as intended. The docs must change in the same PR (docs-as-code), and the "Obsidian CLI MCP - Tool Notes" gotcha can be retired for lists and tables once released.
- **Horizontal rule endings (out of scope).** The uniform rule treats a trailing `---` like any other last content line: content lands directly after the rule, with the blank line moved below it. Today it lands after the rule and the blank line. Either way the content is after the rule; the separate decision on rule-ended sections is not pre-empted, but the fix will change the blank line's position there too.
- **No safety regression.** The placement check (`placeEdit`) still holds: the original bytes up to the heading text and from the reach end on are unchanged. No new error code, no change to `UNSAFE_PLACEMENT`, `HEADING_RACE` or the atomic write. `bytes_written` (size change) is the same for the same content, since only the position moves.
- **Line endings.** The moved blank lines keep their own terminators; added lines take the heading line's ending as today (spec 086). Mixed-ending notes are unaffected beyond the insertion position.
- **`prepend` and `replace` untouched**, as the report requires; `append_note` (whole-note append) is a different tool and not in scope.

## CodeGraph structural check

- **Affected module**: `src/tools/patch_heading/` only. `applyAppend` (`body-edit.ts:37`) has one production caller, `executePatchHeading` (`handler.ts:59`), and is tested by `body-edit.test.ts`. The call path is `createServer` → `createPatchHeadingTool` → `executePatchHeading` → `applyAppend` / `placeEdit`.
- **Blast radius**: narrow. The change is internal to `applyAppend`; its signature stays the same. It newly imports `lineText` from the shared leaf module `src/tools/_note-lines.ts` (already imported by `patch_heading/handler.ts` and `patch_heading/heading-walk.ts`, and used by `patch_block` and `context_search`); `lineText` itself does not change, so `patch_block` and `context_search` are unaffected. `walkHeadings` / `ResolvedHeading` do not change, so `applyReplace`, `applyPrepend` and the race check are unaffected.
- **Kernel nodes**: the fix touches none of them. `createLogger()` and `createQueue()` are not referenced by `body-edit.ts`; `UpstreamError` is not newly constructed (no new failure path; the handler's existing classifications stay as they are); `createServer()` and the boot spine are untouched.
- **Tool surface**: no schema change is proposed, so the registration fingerprint baseline (`_register-baseline.json`) should not move.

## Open Questions

- **Paragraph appends.** Should the uniform rule apply (a paragraph appended after a paragraph joins it unless `content` starts with a blank line), or should paragraphs keep today's "new block" placement? Options considered: (A) the uniform rule; (B) attach only when the section ends in a list or table; (C) the uniform rule plus an added blank line after a paragraph.
  **Resolved (Relay):** A, the uniform rule. Append always inserts after the section's last content line and keeps the trailing blank lines after the new content. An agent that wants a separate paragraph starts `content` with a blank line; `docs/tools/patch_heading.md` documents this. No block-type detection, and the helper adds no newlines of its own. The Proposed Remediation (Preferred) stands as written.
- **Tool-surface wording.** Should the tool's server-facing text (the `patch_heading` description in `index.ts` or the `mode` `.describe()` in `schema.ts`) mention the new placement and the leading-blank-line idiom? Options considered: (A) no tool-surface change, document on the help page only; (B) add a clause to the `mode` `.describe()`; (C) add a note to the tool description.
  **Resolved (Relay):** A, no tool-surface change. Per ADR-074 a tool description says only when to use the tool; placement rules and edge cases go on the help page (`docs/tools/patch_heading.md`). Per ADR-040 a parameter description says only what the parameter is, its format and its default, and "adds at the end of the heading's section" is still true after the fix. `index.ts` and `schema.ts` stay unchanged, and the registration fingerprint baseline does not move.
