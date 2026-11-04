# ADR-073 — Validation sub-codes are lifted into `details` only where the help page promises them

- **Status:** Accepted
- **Date:** 2026-11-04
- **Source:** PR #142 (BI-0174, `.specify/bugs/bi-0174/`: assessment item 7
  and its new instances, owner ruling Q1 = C of 2026-11-04), commits
  `46299b9` (the lifts) and `8f24069` (the code-quality review's shared
  loop, findings F2 and F3)
- **Related:** ADR-015 (Sub-Discriminators via details.reason for
  Multi-State Error Codes), whose `details.code` / `details.reason` form the
  lifted errors take; ADR-042 (typed results checked in `registerTool`),
  which owns the envelope the lifts sit beside; ADR-054 (help pages are
  checked against the offered tools by a test), which checks the pages'
  names but not what they claim.

## Context

Schema refinements that reject a call attach ADR-015 `params` to their zod
issue: `{ code, reason?, field?, … }`. `registerTool`'s generic
`VALIDATION_ERROR` envelope cuts each issue to `path`, `message` and `code`
(`validationIssues` in `src/tools/_register.ts`), so the `params` never
reach the caller unless the tool passes a `mapValidationError` hook. Before
PR #142 only `create_base` lifted them (PR #115, spec 084 FR-008);
`prepend` and `find_and_replace` hooked only their own size or scope
errors.

The 0.9.0-local test run (BI-0174) found five tools whose help pages and
descriptions promised a `details.code` the server did not return:
`patch_heading` (`EMPTY_CONTENT`, `INVALID_HEADING_PATH`), `patch_block`
(`INVALID_BLOCK_ID`), `query_base` (`INVALID_BASE_PATH`,
`INVALID_VIEW_NAME`), and `append_note` / `prepend`, which returned empty
content as a plain `too_small` instead of `CONTENT_EMPTY`. `views_base`
returned the generic envelope too, but its page, corrected in PR #115,
already said so. `patch_heading` and `patch_block` messages carry no code
prefix, so without the lift an agent could tell their reasons apart only by
matching English text.

BI-0174 is a documentation bug. It allows a behaviour change only where an
error must change to agree with its documentation.

## Decision

1. **Lift where the page promises it, and nowhere else.** The five tools
   above get a `mapValidationError`; `views_base` keeps the generic envelope
   and its page is left describing it.
2. **One leaf holds the lifts.** `src/tools/_validation-details.ts`
   exports `liftSubCodedIssue` (the first custom issue with a `params.code`:
   every param into `details`, the issue's own message as `message`),
   `liftSubCodedIssueKeys(keys)` (the same, keeping only the named params;
   `create_base` uses `code`, `reason`, `field`) and `liftEmptyContent`
   (`too_small` on `content` as `details.code: "CONTENT_EMPTY"`). It imports
   only downward-safe symbols (`validationIssues`, a `_shared.ts` type) and
   is imported by tool registrations alone.
3. **Additive to the envelope.** Every lift keeps `details.issues` beside
   the lifted keys and keeps `VALIDATION_ERROR` as the code. A lift returns
   `undefined` for any failure it does not recognise, which gets the generic
   envelope (the PR #115 seam).
4. **No new code.** Every lifted `details.code` value was already in the
   tools' schemas and pages; `src/errors.ts` did not change.

## Alternatives rejected

- **Docs only** (Q1 option A). Rewrite every page to show
  `details.issues[0]` with `code: "custom"`. No behaviour change, but it
  documents ADR-015's machine-readable contract away and leaves message
  matching as the only way to branch on `patch_heading` / `patch_block`
  reasons.
- **Lift `views_base` too** (Q1 option B, the assessment's recommendation).
  It gives the Bases family one validation shape, closing the inconsistency
  the report flagged in its item 10. The owner chose C because `views_base`'s
  live error already matched its help page, and the BI rules out changing an
  error that does. The cost is accepted: `query_base` and `views_base` now
  report the same `INVALID_BASE_PATH` mistake in two shapes, and their pages
  say so.
- **Lift inside the generic envelope.** Have `validationIssues` copy each
  custom issue's `params` into `details.issues[i].params`. One change in
  `_register.ts`, additive for every tool, but it puts the sub-code a level
  deeper than the `details.code` convention `create_base` already used, so
  most pages would still have changed, and it touches a symbol among the
  most-depended-on on the boot spine.
- **`create_base` on `liftSubCodedIssue` unchanged.** That lift copies every
  param, because `patch_heading`'s page promises `segment_index` and
  `value_length`; `create_base` would have gained `value` / `value_length`
  in its errors. It keeps its three keys through `liftSubCodedIssueKeys`.

## Consequences

- A lifted tool's validation error now carries `details.code` (and
  `details.reason` and extra params where the issue has them) next to the
  unchanged `details.issues`. A caller that read `details.issues[0]` still
  works; the top-level `message` is now the issue's own message instead of
  "`<tool>` input failed schema validation".
- The validation shape is per tool, and the help page is its record. A new
  tool that promises a sub-code on a schema rejection needs one of the
  three lifts, or its page must describe the generic envelope; no test ties
  the two together, so this rests on review.
- `views_base` is the one Bases tool whose validation failures carry no
  `details.code`. Lifting it later is a behaviour change to a documented
  error and needs its own BI.
- `find_and_replace` still hand-copies the generic fallback in its own
  mapper; `prepend`'s copy was removed when it moved to `liftEmptyContent`.
- No kernel node was touched. `registerTool` and `validationIssues` did not
  change: the lifts plug into the existing hook.
