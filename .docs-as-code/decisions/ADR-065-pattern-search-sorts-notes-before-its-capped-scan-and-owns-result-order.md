# ADR-065 — `pattern_search` sorts notes before its capped scan, and its template owns result order

- **Status:** Accepted
- **Date:** 2026-11-03
- **Source:** PR #132 (BI-0183, `.specify/bugs/bi-0183/assessment.md`
  remediation and alternatives, `fix.md` Deviations), commits `9bb9a05`
  (the template sort) and `a0d9708` (the review fix, owner ruling
  2026-11-03, option A)
- **Related:** ADR-055 (Smart Connections tools fetch a fixed candidate list
  before sorting), the same leading-slice guarantee for the Smart
  Connections templates, which also sort and cut inside the template.

## Context

`pattern_search` documents its matches as sorted by `(path, line, offset)`
ascending and `limit` as a cap on that list, so a capped result reads as the
first N matches. The eval template applied the cap while it walked notes in
`app.vault.getMarkdownFiles()` order, which is Obsidian's file-map order, not
path order, and stopped early at the cap. The handler then sorted only the
matches that survived. A small `limit` returned an arbitrary subset that
looked like the top of the list, and raising `limit` did not extend the
earlier result. In the PR's live check, `limit: 5` over 76 backlog matches
returned BI-0182 to BI-0186, the tail of the path order.

## Decision

1. **Sort the note list by path before the scan.** The template sorts the
   folder-filtered `getMarkdownFiles()` list by UTF-16 code unit
   (`x.path<y.path?-1:…`), not with `localeCompare`, so `B` sorts before `a`
   and `a.md` before `a/c.md`. Within a note the scan already emits matches
   in `(line, offset)` order, so the existing in-template cap keeps exactly
   the leading `limit` matches, and `truncated` stays exact.
2. **Keep the early exit.** Output stays bounded by `limit`.
3. **The template is the one owner of result order.** The handler no longer
   re-sorts; after its defensive `.md` filter it returns the envelope's
   order. `comparePatternSearchMatch` was deleted.

## Alternatives rejected

- **Return every match and sort and slice in the handler.** Correct, but it
  gives up the early exit, so a broad pattern over a large vault risks
  `CLI_OUTPUT_TOO_LARGE` and `CLI_TIMEOUT` for a result the caller capped.
- **Collect every match in the template, then sort and cut.** The same result
  as the chosen fix with more work, since sorting notes first already yields
  the full order.
- **Keep the handler's re-sort as a defensive step.** This was the fix as
  first written, and the assessment's choice. The PR #132 code review argued
  it out: the cap is applied inside the template, so a handler sort can only
  reorder the capped subset, never recover a match the template dropped. If
  the template's order ever drifted, the sort would make the response look
  sorted while the subset was wrong, which is the BI-0183 symptom itself. On
  every envelope the template can emit the sort did nothing, and it kept the
  path rule in two places, held in step only by a comment.
- **A shared in-eval fragment for the comparison.** The template compares one
  key, the path; it is not a copy of a three-key comparator, and after the
  review there is no TypeScript comparator left to share it with.

## Consequences

- For any `limit` N < M, the N-result call returns the first N matches of
  the M-result call. `src/tools/pattern_search/_template.test.ts` runs the
  template under `node:vm` against notes listed out of path order and checks
  the first N for every N below the total, a cut between offsets on one line,
  and `truncated` at its boundaries. It is the one place the order is tested.
- This departs from the handler-side sort of research R2 in
  `specs/037-pattern-search/`, the spec that introduced the tool, whose
  promise that a capped result is "the deterministic prefix per R2's sort
  key" the code did not keep until this fix. Every real response is byte-identical to the
  re-sorted one; only a stubbed out-of-order envelope, as in the handler
  tests, now comes back unsorted.
- Input and output schemas, error codes, the description and its fingerprint
  are unchanged. The description still says only that `limit` caps the
  `matches` array.
