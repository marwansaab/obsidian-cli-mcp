# ADR-057 — Text searches send the query as one escaped literal phrase

- **Status:** Accepted; decision 4's `lineMatches` shape replaced by
  [ADR-058](ADR-058-context-search-reads-matched-lines-back-and-fails-when-one-cannot-be.md)
  (PR #121); decision 1 superseded by
  [ADR-063](ADR-063-text-searches-send-the-query-as-an-escaped-regular-expression.md)
  (PR #130), because a quoted phrase matches whole words only
- **Date:** 2026-11-02
- **Source:** PR #120 (`specs/087-match-literal-phrases/`, BI-0169,
  FR-001 to FR-013, Clarifications Q1 and Q2, research F5 to F9 and D1 to
  D3), commits `e145174` (the fix), `20e134c` and `6b29ecb` (the PR #120
  code-quality review's two findings)
- **Related:** ADR-040 (published parameter descriptions and server
  instructions), whose descriptions already said "literal substring" and did
  not move; ADR-015 (Sub-Discriminators via details.reason for Multi-State
  Error Codes), which this change does not use — no error state is added.

## Context

`search` and `context_search` wrap the CLI's `search` and `search:context`.
Both forwarded `input.query` unchanged (research F1), and the CLI reads its
query as Obsidian search syntax: it splits it into words and treats `-x`,
`OR`, `tag:`, `path:`, `[prop]` and similar as operators (F5). The tools'
descriptions and help pages promised a single literal substring. In fact a
query with spaces matched notes holding its words apart or in another order,
`-draft` returned the notes *without* `draft`, and `tag:urgent` returned the
note tagged `#urgent`. `search:context` also lists a line once per occurrence
of each word, so repeats inflated `count` and `truncated` (F2, F8).

## Decision

1. **Quote and escape the query.** `literalPhraseQuery`
   (`src/tools/search/literal-phrase.ts`) wraps the query in `"…"` after
   replacing `\` with `\\` and `"` with `\"`, in one pass. Both handlers send
   that form in all three modes (`search`, `search` with `context_lines`,
   `context_search`). Live probes showed the CLI then matches every probed
   character group literally, keeps whitespace exact and keeps its own
   file-name and metadata matching, case fold and folder scoping (F6).
   Single-word results are unchanged.
2. **One entry per line in the line-level modes.** Quoting does not stop
   `search:context` from repeating a line per occurrence (F8), so
   `oneMatchPerLine` keeps the first wire entry for each line, in wire order.
   It runs before counting, so `count` and `truncated` count lines.
3. **A line-break query keeps no lines.** No line can contain `\n` or `\r`,
   but the CLI returns the first line of a phrase that spans two (F6). The
   CLI call still runs, so `context_search`'s zero-match folder probe and
   every error path are unchanged.
4. **One line-level pipeline, not two.** As first implemented (`e145174`),
   each handler carried its own copy of the ordered steps. The PR #120
   code-quality review moved them into `lineMatches`
   (`src/tools/search/line-matches.ts`): the line-break rule, the `.md`
   filter, `oneMatchPerLine`, the 500-character cap, conservative truncation,
   the `(path, line)` sort and the slice. Each handler passes only its text
   normaliser (`context_search` strips a trailing `\r`; `search`'s
   deprecated line mode does not). A second review finding, ruled by the
   owner (option A), took the line-break rule out of `oneMatchPerLine`, which
   had held both rules under one name, and put it in `lineMatches`.
5. **No published-surface change.** Schemas, descriptions, annotations and
   error codes are unchanged; `_register-baseline.json` did not move. The new
   rule is stated on the help pages.

## Alternatives rejected

- **Leave the query raw and filter the results in the wrapper.** Path mode
  returns only paths, so false matches cannot be removed, and true matches
  the tokenised query missed cannot be added (research D1).
- **Replace the CLI search with an `eval` template, as `pattern_search`
  does.** It would reimplement file-name and metadata matching, the case fold
  and folder scoping, which Clarification Q1 and FR-008 require to stay as
  they are.
- **Escape only the characters probed as special.** Obsidian's syntax is
  wider than any probe list; inside quotes only `\` and `"` are special, so
  escaping exactly those is complete.
- **Re-check each returned line with a literal `includes`.** The CLI trims
  the returned text (F9) and its default case fold is wider than ASCII (F7),
  so a wrapper-side re-check would wrongly drop rows and need a second copy
  of the CLI's fold.
- **Skip the CLI call for a line-break query.** `context_search` would then
  return an empty result for a missing folder instead of
  `CLI_REPORTED_ERROR`, against FR-008 and constitution Principle IV.
- **A cohort leaf `src/tools/_literal-phrase.ts`.** Equally acyclic, but it
  would separate the helpers from `searchContextWireSchema`, the type they
  act on. The module sits in `search/` and `context_search` reaches it over
  the context_search → search edge that already existed (research D3).

## Consequences

- Agents cannot use Obsidian search syntax through `search` or
  `context_search`: `OR`, `-x`, `tag:`, `path:`, `file:`, `[prop]`, `/…/` and
  `*` are text. That is what the descriptions always promised. Raw syntax
  stays reachable through `obsidian_exec`, which forwards the CLI's `search`
  command and its query unchanged; tags and properties have their own tools
  (`tag`, `find_by_property`).
- Query text can no longer inject `path:` or `file:` operators that widen or
  redirect a folder-scoped search.
- Every argv row in both handlers' tests now shows `query="…"`; the two
  existing assertions that pinned `query=foo` were edited under the owner's
  conditional approval (option B).
- The CLI's default case fold covers more than ASCII (F7) and it trims the
  text of each returned line (F9). Both help pages and both descriptions
  still say the fold is ASCII-only; correcting the descriptions moves two
  fingerprints, so it is a follow-up backlog item, not part of this decision.
