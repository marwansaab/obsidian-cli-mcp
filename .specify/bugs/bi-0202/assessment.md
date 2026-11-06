# Bug Assessment: find_and_replace drops regex replacements whose pattern uses lookbehind or lookahead

- **Slug**: bi-0202
- **Created**: 2026-11-07
- **Source**: pasted text (BI-0202 backlog item; reproduction recorded in vault test case TC-00903 — "Find And Replace Regex Lookbehind Commit Writes The Replacement"). No URL was supplied, so the URL Trust Policy did not apply.
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

> **Impact.** A false success. Agents trust `total_occurrences_replaced` as proof of a write — the Tool Notes tell them to — so a lookbehind edit is silently lost and the agent moves on. Lookbehind is part of the ECMAScript dialect the tool's description promises, and it is the natural way to write "replace X only when preceded by Y". The workaround (capture the prefix and re-insert it with `$1`) is known only to readers of the Tool Notes.
>
> **Status and evidence.** Queued 2026-11-07 — awaiting owner triage. Filed from the sweep of tool notes imported from other projects (`My-Setup/Imported-Tools-Notes/`), reproduced on the published `@marwansaab/obsidian-cli-mcp@0.9.0` from Claude Code (TC-00903). First reported by the Funwright-Studio-Vault and Game-Server-Vault notes.
>
> **Defect.** A regex-mode `find_and_replace` whose pattern has a lookbehind assertion (`(?<=Paren )word` → `WORD`):
> - previews the match but shows the original text as `replacement_substring` (`"word"`);
> - on commit returns `total_occurrences_replaced: 1` with the note in `changed_notes`, and leaves the file byte-identical.

The report also carries an expected-behaviour draft (feature "Apply lookbehind replacements") with these acceptance criteria, which this assessment adopts as the fix's success criteria:

1. A note line `Paren word here`, committed with regex `(?<=Paren )word` → `WORD`, reads `Paren WORD here`.
2. Where the prefix does not precede the word, the note is unchanged and zero replacements are reported.
3. The preview of case 1 shows `WORD` as `replacement_substring`.
4. For any regex replacement, the reported count equals the number of changes in the note, and a note reported as changed has changed.
5. A lookahead condition behaves the same way (text changed, count accurate).

Out of scope (from the report): matching across line breaks; regular-expression features beyond the dialect already promised; changes to literal-mode replacement.

## Symptom

In regex mode, when the pattern's match depends on text outside the matched substring (a lookbehind or a lookahead), `find_and_replace` computes the replacement as the original matched text. The preview therefore shows the original text as the replacement, and the commit rewrites each match with itself — the note is byte-identical — while still reporting the occurrences as replaced and the note as changed. Expected: the matched text is replaced by the expanded replacement, in both the preview and the written note.

## Reproduction

1. Create a note containing the line `Paren word here`.
2. Call `find_and_replace` with `mode: "regex"`, `pattern: "(?<=Paren )word"`, `replacement: "WORD"`, scoped to that note, without `commit`. Observe `matched_substring: "word"` and `replacement_substring: "word"`.
3. Call it again with `commit: true`. Observe `total_occurrences_replaced: 1` and the note in `changed_notes`; the file is unchanged.

The same happens with a lookahead (`word(?= here)` → `WORD`). The root cause was reproduced in pure Node during assessment, outside any vault, by replaying `applyReplacement`'s logic:

```text
{"p":"(?<=Paren )word","matched":"word","today":"word","fixed":"WORD"}
{"p":"word(?= here)","matched":"word","today":"word","fixed":"WORD"}
{"p":"(Paren )word","matched":"Paren word","today":"Paren WORD","fixed":"Paren WORD"}
```

`today` is the current computation; `fixed` is the preferred remediation below. The third row is the Tool Notes workaround, which works today and must keep working.

## Suspected Code Paths

- `src/tools/find_and_replace/replace.ts:52` `applyReplacement()` — the defect. In regex mode it builds a non-global copy of the find regex and runs `matched.replace(singleUse, replacement)` against the **matched substring alone**. The substring no longer contains the text a lookbehind looks back at (or a lookahead looks ahead to), so the re-run finds no match, `String.prototype.replace` returns its input unchanged, and the "replacement" is the original text. A capture-and-reinsert pattern works only because its whole context is inside the match.
- `src/tools/find_and_replace/replace.ts:30` `iterateLineMatches()` — finds the matches correctly against the whole line (`regex.exec(line)`), but yields only `index` / `endIndex` / `matchedSubstring`, discarding the line context the replacement needs.
- `src/tools/find_and_replace/handler.ts:308-326` `scanNotes()` — the sole production caller: passes `match.matchedSubstring` (not the line) to `applyReplacement`, records the result as `replacement_substring`, and pushes it into the `replacements` list that `applyReplacements` stitches into `rewrittenContent`. Every match counts as an occurrence whatever its replacement text.
- `src/tools/find_and_replace/handler.ts:691-717` (commit loop in `executeFindAndReplace`) — writes `rewrittenContent` and adds the note's occurrence count to `total_occurrences_replaced` and the note to `changed_notes` without comparing against the source; it is where the false success becomes visible, but it is faithful to what `scanNotes` handed it.

## Root Cause Hypothesis

`applyReplacement` expands the replacement by re-matching the pattern against the matched substring in isolation instead of at the match's position in its line. Any assertion that reaches outside the match — positive lookbehind or positive lookahead — fails on the isolated substring, so `replace` is a no-op and returns the original text, which then flows unchanged into the preview, the rewritten content and the counts. The re-run can also diverge more subtly (a negative lookaround that now succeeds, or an alternation whose isolated re-run picks a different branch), but those all stem from the same isolation. Confidence: **high** — the code path is direct and the Node replay reproduces the exact reported outputs.

## Proposed Remediation

**Preferred**: expand the replacement at the match's real position in its line, keeping native ECMAScript substitution semantics. Have the replacement step receive the line and the match's line-relative start, build a sticky (`y`, non-global) copy of the find regex, set its `lastIndex` to the match start, and run `line.replace(sticky, replacement)`; the replacement text is the slice of the result between the match start and the unchanged line suffix (`result.slice(start, result.length - (line.length - end))`). Because the sticky regex is anchored at the same position against the same line, it matches exactly the text `iterateLineMatches` found, with full lookbehind/lookahead context, and `$1` / `$&` / `$$` / `$<name>` keep the semantics the native `replace` gives them today. Concretely, either `iterateLineMatches` yields the expanded replacement alongside the match (it already holds the line and the exec result), or `applyReplacement` takes the line and the match offsets; `scanNotes` then uses that value instead of re-matching the substring. Literal mode is untouched (it still returns `replacement` verbatim). Update the `replace.ts` header comment to describe the new expansion.

**Alternatives**:
- Expand `$`-tokens by hand from the `RegExpExecArray` that `iterateLineMatches` already has (`$1`…`$99`, `$&`, `$$`, `$<name>`). No second regex run, but it re-implements the ECMAScript `GetSubstitution` rules — exactly the hand-rolled boundary logic the native path avoids — and risks small divergences. Not recommended.
- Do one `line.replace(globalRegex, fn)` per line, recording each match's offsets and expansion. Same hand-expansion problem, since the callback receives the captures, not the expanded string. Not recommended.

**Files likely to change**:
- `src/tools/find_and_replace/replace.ts`
- `src/tools/find_and_replace/handler.ts` (the `scanNotes` call site only)
- `src/tools/find_and_replace/replace.test.ts`
- `src/tools/find_and_replace/handler.test.ts`

**Tests to add or update**:
- `replace.test.ts`: lookbehind (`(?<=Paren )word` → `WORD` on `Paren word here` gives `WORD`); lookahead (`word(?= here)` → `WORD`); the capture-and-reinsert workaround (`(Paren )word` → `$1WORD`) still gives `Paren WORD`; multiple matches on one line each expand at their own position; existing `$1` / `$&` / `$$` / two-group tests updated to the new signature and still green.
- `handler.test.ts`: preview of a lookbehind replacement reports `replacement_substring: "WORD"`; commit writes `Paren WORD here` and reports `total_occurrences_replaced: 1` with the note in `changed_notes`; a note without the prefix yields zero occurrences and no write; a lookahead commit behaves the same.
- Live-CLI confirmation of TC-00903 during `/speckit-bug-test`, following `.memory/test-execution-instructions.md` (authorised test vault and scratch folder only).

## Risks & Considerations

- **`` $` `` and `$'` change meaning.** Today they expand against the isolated matched substring, so both are always empty. After the fix they expand against the line (text before / after the match), which is the ECMAScript meaning. The published contract (`schema.ts` replacement description, `docs/tools/find_and_replace.md` `mode` row) names only `$1` / `$&` / `$$`, so this is a correction rather than a contract break, but it is an observable change and should be noted in `fix.md`.
- **Count and preview semantics otherwise unchanged.** Occurrence counting still comes from `iterateLineMatches`; only the replacement text changes. The preview/commit drift check compares occurrence counts, so it is unaffected.
- **Per-line scope preserved.** Lookarounds still see only their own line (the regex runs per line), which matches the schema's "matched within single lines" and the report's out-of-scope item on line breaks; a lookbehind that would need the previous line keeps not matching, which reports zero occurrences honestly.
- **Zero-width handling unchanged.** Pure-lookaround patterns stay zero-width and are skipped, as `docs/tools/find_and_replace.md` already documents.
- **No new error codes, no schema change, no published-surface change.** Tool description, parameter descriptions and the schema fingerprint baseline do not move. Performance cost is one extra anchored regex run per match, as today.
- **Security**: none. The pattern is already compiled from caller input at the same point; the sticky copy uses the same source and flags plus `y`.

## CodeGraph structural check

- **Affected module**: `src/tools/find_and_replace/` only. `replace.ts` is a pure leaf utility imported only by `handler.ts`; `applyReplacement` and `iterateLineMatches` have their only production call site in `scanNotes` (`handler.ts`), and their tests in `replace.test.ts`.
- **Blast radius**: the find_and_replace preview and commit paths (both go through `scanNotes`), and the handler tests that assert `replacement_substring`, `changed_notes` or `total_occurrences_replaced` (`handler.test.ts`, `scope.test.ts`, `confirm.test.ts`). No other tool imports `replace.ts`. The shared note-line helpers in `src/tools/_note-lines.ts` are not used by find_and_replace's line split (`splitIntoLineSpans` is local to `handler.ts`) and are not touched.
- **Kernel nodes**: the fix touches **none** of the kernel nodes — not `createLogger()`, not `createQueue()`, not `UpstreamError`, not `createServer()`. The commit loop's use of the injected `deps.queue` and `deps.logger` is unchanged, and no failure classification changes.

## Open Questions

- Should this fix also add a guard so that a note whose rewritten content equals its source is neither written nor listed in `changed_notes` (and its occurrences not counted)? Acceptance criterion 4 says "a note reported as changed has changed" for *any* regex replacement, which an identity replacement (for example `(a)` → `$1`) would still violate after the root-cause fix.

  **Resolved (Relay):** Option A — no guard in this fix. The root-cause fix removes the false success for lookarounds. An identity edit is what the caller explicitly asked for. A guard would also change literal mode (out of scope in the report) and the preview/commit occurrence-count contract that the drift check relies on, so it is new behaviour, not a repair. If wanted, it belongs in its own BI. Acceptance criterion 4 is therefore verified for non-identity regex replacements (lookbehind, lookahead and the capture-and-reinsert form). The root cause, remediation, files and tests above are unchanged.
