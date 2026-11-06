# Bug Fix: find_and_replace drops regex replacements whose pattern uses lookbehind or lookahead

- **Slug**: bi-0202
- **Fixed**: 2026-11-07
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`applyReplacement` now expands a regex-mode replacement at the match's real position in its line, by running a sticky copy of the find regex against the whole line from the match start, instead of re-running the pattern against the matched substring alone. Lookbehind and lookahead assertions therefore keep the context they matched with, so the preview shows the expanded replacement and the commit writes it.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/find_and_replace/replace.ts` | modified | `applyReplacement(line, start, end, regex, replacement, mode)` takes the line and the match's line-relative offsets; regex mode runs `line.replace(stickyRegex, replacement)` with `lastIndex = start` and slices out the expansion. Header comment updated. Literal mode and the null-regex guard are unchanged. |
| `src/tools/find_and_replace/handler.ts` | modified | `scanNotes` call site only: passes `span.content` and `match.index/endIndex - span.startOffset` instead of `match.matchedSubstring`. |
| `src/tools/find_and_replace/replace.test.ts` | updated + added tests | Existing `$1` / `$&` / `$$` / two-group / literal / null-guard tests moved to the new signature (driven through `iterateLineMatches`, as `scanNotes` does); four BI-0202 cases added. |
| `src/tools/find_and_replace/handler.test.ts` | added tests | New `BI-0202 — regex lookaround replacements are applied` describe block. |

## Diff Highlights

```ts
// replace.ts — regex mode
const sticky = new RegExp(regex.source, regex.flags.replace("g", "") + "y");
sticky.lastIndex = start;
const result = line.replace(sticky, replacement);
return result.slice(start, result.length - (line.length - end));
```

The sticky regex is the same source and flags anchored at the same position of the same line, so it matches exactly the text `iterateLineMatches` found. A non-global `replace` with a sticky regex honours `lastIndex`, and the slice drops the unchanged prefix and suffix.

## Tests Added or Updated

- `replace.test.ts::applyReplacement > regex mode expands a lookbehind match (BI-0202)` — `(?<=Paren )word` → `WORD` on `Paren word here` expands to `WORD`.
- `replace.test.ts::applyReplacement > regex mode expands a lookahead match (BI-0202)` — `word(?= here)` → `WORD`.
- `replace.test.ts::applyReplacement > the capture-and-reinsert workaround still expands (BI-0202)` — `(Paren )word` → `$1WORD` gives `Paren WORD`.
- `replace.test.ts::applyReplacement > multiple matches on one line each expand at their own position (BI-0202)` — `(?<=a)(\d)` → `<$1>` on `a1 b2 a3` gives `<1>`, `<3>`.
- `replace.test.ts::applyReplacement` — the five pre-existing regex/literal/guard tests, updated to the new signature, still green.
- `handler.test.ts::BI-0202 > preview of a lookbehind match reports the expanded replacement` — acceptance criterion 3 (`replacement_substring: "WORD"`).
- `handler.test.ts::BI-0202 > commit of a lookbehind / lookahead match writes the replacement and counts it` — criteria 1, 4 and 5: the note reads `Paren WORD here`, `total_occurrences_replaced: 1`, note in `changed_notes`.
- `handler.test.ts::BI-0202 > commit where the lookbehind prefix is absent leaves the note unchanged and reports zero` — criterion 2.

## Local Verification

- Red check: with `replace.ts` and `handler.ts` stashed (unfixed code), `npx vitest run src/tools/find_and_replace/handler.test.ts -t "BI-0202"` → 3 failed, 1 passed (the preview and both commit cases fail with `replacement_substring: "word"` / `"Paren word here"`; the zero-prefix case passes before and after, as it should).
- `npx vitest run src/tools/find_and_replace` → 8 files passed (1 skipped), 203 tests passed, 6 skipped.
- `npx vitest run` (full suite) → 203 files passed (1 skipped), 5072 tests passed, 6 skipped.
- `npx tsc --noEmit -p tsconfig.json` → exit 0.
- `npx eslint src/tools/find_and_replace` → clean.
- Live-CLI confirmation of TC-00903 is left to `/speckit-bug-test`, per the assessment.

## CodeGraph structural verification

Run with `codegraph_explore` on `applyReplacement`, `scanNotes` and `replace.ts` after the change.

1. **No new error codes (Principle IV)**: none. No error class or `UpstreamError` code added; the pre-existing defensive `throw new Error` null-regex guard in `applyReplacement` is unchanged.
2. **No production handler imports the boot-time DI factories**: unchanged. `handler.ts` imports are identical; `replace.ts` has no imports.
3. **Module placement and import direction (Principle I)**: `applyReplacement` stays in `src/tools/find_and_replace/replace.ts`, a leaf imported only by `handler.ts`. No new edges.
4. **Reachability**: `applyReplacement` keeps its production caller, `scanNotes` in `handler.ts`, which both the preview and commit paths go through.

**Kernel-node claim**: the assessment said the fix touches none of the kernel nodes (`createLogger()`, `createQueue()`, `UpstreamError`, `createServer()`). It held: the change is confined to `replace.ts` and the `scanNotes` call site.

## Deviations from Assessment

None. The preferred remediation was applied as written, using the "`applyReplacement` takes the line and the match offsets" variant (the assessment allowed either that or having `iterateLineMatches` yield the expansion). `iterateLineMatches` and `LineMatch` are unchanged.

## Observable changes to note

- **`` $` `` and `$'` now carry their ECMAScript meaning.** Before the fix they expanded against the isolated matched substring and were always empty; now they expand to the text of the line before and after the match. The published contract (`schema.ts` replacement description, `docs/tools/find_and_replace.md`) names only `$1` / `$&` / `$$`, so this is a correction, not a contract break. No schema, description or fingerprint baseline moved.
- Identity replacements (for example `(a)` → `$1`) still count as occurrences and list the note as changed, per the Relay ruling (Option A) recorded in the assessment's Open Questions.

## Follow-ups

- `/speckit-bug-test slug=bi-0202`: live-CLI confirmation of TC-00903 (lookbehind and lookahead commits) in the authorised test vault.
- Docs pass (`/speckit-docs-as-code`): the Tool Notes' capture-and-reinsert workaround for lookbehind is no longer needed; consider whether `docs/tools/find_and_replace.md` should mention that lookarounds see the whole line (still single-line scope).
- Optional, its own BI if wanted: a guard that skips identity rewrites (see the assessment's Open Questions).
