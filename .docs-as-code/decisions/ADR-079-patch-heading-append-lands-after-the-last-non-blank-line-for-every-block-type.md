# ADR-079 — patch_heading append lands after the last non-blank line, for every block type

- **Status:** Accepted
- **Date:** 2026-11-07
- **Source:** PR #157 (BI-0206, `.specify/bugs/bi-0206/assessment.md` Q1
  and Q2, `fix.md`, `test.md`), commits `fd31656`, `4e1f9ff`
- **Related:** [ADR-056](ADR-056-section-edits-keep-each-lines-ending-and-refuse-an-unsafe-placement.md),
  whose placement check and line-ending rules are unchanged.
  [ADR-074](ADR-074-tool-descriptions-route-within-a-budget-and-the-help-page-holds-the-contract.md)
  and [ADR-040](ADR-040-published-parameter-descriptions-and-server-instructions.md),
  which put the placement rule on the help page and not on the tool surface.

## Context

`patch_heading` `mode: "append"` inserted its content at the end of the
heading's reach: immediately before the next equal-or-higher-rank heading,
after the blank lines that close the section. A list or table ending the
section was split in two, and the new line sat directly on the next heading
with no blank line before it (TC-00908, reproduced on the published 0.9.0).
The help page showed the split list as the intended result.

`applyAppend` is a pure line helper that adds no line breaks of its own. Any
fix had to choose where the content goes for each kind of last block, and
whether the helper starts reading Markdown structure.

## Decision

1. **One rule for every block type** (owner ruling, assessment Q1 = A).
   `applyAppend` steps back from the reach end over blank or whitespace-only
   lines (`trim() === ""`), never past the heading's line, and inserts
   there. The closing blank lines stay after the new content. No block-type
   detection.
2. **The helper still adds no line breaks.** A paragraph appended after a
   paragraph continues it. To start a separate block, the caller begins
   `content` with a blank line. The help page documents the idiom.
3. **No tool-surface change** (assessment Q2 = A). "Adds at the end of the
   heading's section" stays true, so the description and the `mode`
   description are unchanged and the registration fingerprint baseline does
   not move. The placement rule is on `docs/tools/patch_heading.md`.

## Alternatives rejected

- **Attach only when the section ends in a list or table** (Q1 option B).
  It keeps paragraph appends as separate paragraphs, but needs Markdown block
  detection in a pure line helper (task lists, nested lists, indented
  continuations, tables without leading pipes), and a paragraph appended
  after a paragraph would still sit directly on the next heading.
- **The uniform rule plus an added blank line after a paragraph** (Q1
  option C). It brings the same block detection back, and makes the helper
  add line breaks the caller did not send.
- **Insert after the blank lines and add one before the next heading.** It
  keeps the separation but still splits the list or table.
- **Mention the placement in the description or the `mode` description**
  (Q2 options B, C). ADR-074 keeps a description to when to use the tool, and
  ADR-040 keeps a parameter description to what the parameter is; both moves
  would also move the fingerprint baseline for no routing gain.

## Consequences

- Lists and tables are extended in place, and the blank line before the next
  heading is kept, on LF, CRLF and mixed notes (`test.md`: five live cases on
  the test vault).
- **Behaviour change by design:** an append of a paragraph after a paragraph
  now joins it, which Markdown renders as one paragraph. A caller that relied
  on the old placement for a separate paragraph now needs the leading blank
  line.
- `applyAppend` now reads existing lines, so its result depends on the edit
  array having no phantom empty last element. Unit fixtures build on
  `splitNoteLines` for that reason (PR #157 review, commit `4e1f9ff`).
- The placement check's kept suffix still starts at the reach end, so it does
  not cover the moved blank lines; handler tests pin them instead. Tightening
  `keepFromLine` to the insertion index stays available.
- A section ending in a horizontal rule and a blank line gets the same
  treatment. Rule-ended sections are a separate decision that starts from
  this one.
- `prepend`, `replace`, `patch_block`, the error codes and `handler.ts` are
  unchanged.
