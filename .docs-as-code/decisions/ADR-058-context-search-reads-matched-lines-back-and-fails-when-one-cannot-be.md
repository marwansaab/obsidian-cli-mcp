# ADR-058 — context_search reads its matched lines back, and fails when one cannot be

- **Status:** Accepted
- **Date:** 2026-11-02
- **Source:** PR #121 (`specs/088-preserve-match-whitespace/`, BI-0170,
  FR-001 to FR-011, Clarification Q1, research F5 to F10 and D1 to D4),
  commits `405c742` (the selection split), `970d38e` (the read-back) and
  `f88c9af` (the PR #121 code-quality review's six findings)
- **Related:** ADR-057 (Text searches send the query as one escaped literal
  phrase), whose decision 4 built both line-level modes through one
  `lineMatches` pipeline with a per-handler text normaliser; this decision
  replaces that shape (decision 3 below). ADR-015 (Sub-Discriminators via
  details.reason for Multi-State Error Codes), which the new failure follows
  from its first release.

## Context

`context_search`'s help page promised each matched line minus only its line
ending. It returned the line as Obsidian's `search:context` reports it, and
the CLI trims every line exactly like `String.prototype.trim` (research F6),
so indentation, tabs, NBSP and Markdown hard-break trailing spaces were lost.
The CLI has no option to return the untrimmed text (F9). Restoring it needs a
second read of each note.

Live probes during spec 088's task phase also found that the `Obsidian.com`
shim answers nothing, on exit 0, once an `eval`'s `code=` passes about 4,000
characters, and that a 20,000-character eval stalled the CLI until Obsidian
was restarted (F10).

## Decision

1. **Read back only the selected lines, through `eval`.** After selection
   (`.md` filter, one entry per line, truncation, sort, slice) and before the
   500-character cap, `readBackLines` (`src/tools/context_search/read-back.ts`)
   sends the selected `(path, line)` pairs to a frozen template
   (`context_search/_template.ts`). It reads each note through
   `app.vault.cachedRead`, the text Obsidian's search reads, splits it on
   `"\n"` as the CLI numbers lines (F5, F8), and returns each requested line
   raw. TypeScript then drops one trailing `\r` through `lineText`
   (`src/tools/_note-lines.ts`, shared with the section editors) and, on
   line 1 only, a byte-order mark. The cap applies after the read-back, so
   leading whitespace counts towards the 500 characters.
2. **Accept a line only when its trimmed text equals the CLI's.** F6 makes
   the comparison exact, and it stays correct if a later CLI trims less.
3. **Selection and output are two steps in `search/line-matches.ts`.**
   `selectLines` owns membership, order and truncation and returns the CLI's
   text uncapped; `lineOutput` caps each text and builds
   `{ count, matches, truncated? }`. `search`'s deprecated line mode calls
   `lineOutput(selectLines(…))`; `context_search` puts `readBackLines`
   between them. As first implemented (`405c742`, research D2) `lineMatches`
   survived as `selectLines` plus a normaliser; the PR #121 review (F1) found
   that once `context_search` stopped calling it, search's identity function
   was the only normaliser left, and removed `lineMatches` and the parameter.
4. **Batch under a fixed code budget.** Each batch's composed eval code is at
   most `READ_BACK_CODE_MAX = 2900` characters, so every `code=` stays under
   3,000, about 25% below the last length the shim answered. Batches are cut
   between rows, so one note's lines may span batches, and each batch holds
   at least one row. The template is pinned at 900 characters or fewer.
5. **Fail the whole call on any row that cannot be read back** (Clarification
   Q1, option A). The first such row, in output order, raises
   `CLI_REPORTED_ERROR` with `details.code: "MATCH_LINE_UNAVAILABLE"`,
   `details.reason` `note-not-found`, `read-failed` (with `details.detail`)
   or `line-changed` (past the note's end, or different text), plus
   `details.path` and `details.line`. A malformed answer fails the
   `json-parse` or `envelope-parse` stage through the shared
   `decodeEvalEnvelope`. No partial result, no trimmed fallback, no new
   top-level code.

## Alternatives rejected

- **Read the notes from disk in the handler.** It needs the vault root, from
  the registry or a focused-vault eval, and realpath containment for a path
  the wrapper joins, which would refuse symlinked notes the search did find.
  It also adds new filesystem failure modes (research D1).
- **One `eval` that both searches and returns lines.** ADR-057 already
  rejected moving search into an `eval`: it would reimplement the CLI's
  matching, case fold and folder scoping.
- **Return each whole note and split in the handler.** The answer would grow
  with note size rather than with the result count, against the output cap.
- **One unbounded `eval`, or a budget at the last length that answered
  (4,009).** The first breaks above about 4,000 characters (F10); the second
  leaves no margin for the vault argument, quoting or a later template
  change. One `eval` per note was also rejected: never fewer calls than
  batching, and up to 1000 at the default limit.
- **Fall back to the CLI's trimmed text, or drop the row, when a line cannot
  be read back** (Clarification Q1, options B and C). Both hide a failure,
  which constitution Principle IV forbids. Returning a per-row status
  (option D) changes the output shape.
- **`FS_WRITE_FAILED` with `details.reason: "read"`, as `read` uses.** That
  code names a failure of the wrapper's own filesystem I/O; here Obsidian does
  the read and reports it through the `eval` (research D4).
- **Separate reasons for "past the end" and "different text".** Both mean the
  line Obsidian found is no longer there, and the recovery is the same: search
  again.

## Consequences

- A search that finds lines costs at least one more Obsidian call. In the
  PR #121 live check 6 lines took one read-back call (about 0.2 s end to
  end) and 300 lines over 300 notes took 10 (about 0.9 s). A search with no
  lines makes no read-back call.
- A note edited between the search and the read-back now fails the call
  rather than returning stale text; the caller searches again.
- `search`'s deprecated `context_lines` mode still returns the CLI's trimmed
  text (FR-008), so the two line-level modes now differ in whitespace as
  well as in the `\r` and the missing-folder error.
- The description, schemas, annotations and `_register-baseline.json` did not
  move; the rule is on the help page.
- F10's limit applies to every `eval` whose code grows with its input, such
  as `pattern_search` and `find_and_replace`. Only `context_search`'s
  read-back is budgeted; checking the others is a separate backlog item.
