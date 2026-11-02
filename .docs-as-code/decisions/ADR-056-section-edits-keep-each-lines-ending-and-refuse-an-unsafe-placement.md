# ADR-056 — Section edits keep each line's ending and refuse an unsafe placement

- **Status:** Accepted
- **Date:** 2026-11-02
- **Source:** PR #119 (`specs/086-fix-section-replacement/`, BI-0168,
  FR-001 to FR-018, Clarifications Q1, which put `patch_block` in scope by
  owner ruling, research D1 to D4), commits `211ad03` and `c069194` (the
  code-quality review's findings F1 and F2)
- **Related:** ADR-009 (Direct Filesystem Write Path Alongside CLI Bridge),
  whose read, atomic write and metadata refresh are unchanged; ADR-015
  (Sub-Discriminators via details.reason for Multi-State Error Codes), which
  the new condition does not use — it is a `details.code`, like
  `HEADING_RACE` and `BLOCK_ON_HEADING`.

## Context

`patch_heading` and `patch_block` locate their target with a scanner that
returns line indices, then splice an array of the note's lines at those
indices. The scanners split on every `\n`; the handlers split on `\r\n` alone
whenever the note held a single CRLF. On a note that mixes LF and CRLF the
two arrays disagreed, and the edit landed lower down the note, over unrelated
text, or at its end, while the call reported success (spec 086 research F1,
F2, F5). The usual source of such a note is a property edit that writes an LF
frontmatter onto a CRLF note on Windows. `patch_heading`'s race check
compares heading identity, not the edit array, so it passed the bad write
(F3); `patch_block` has no race check.

## Decision

1. **Split the edit array where the finders split.** A cohort leaf,
   `src/tools/_note-lines.ts`, owns the finders' split (`splitLinesForScan`)
   and the editors' split of the same text at the same line feeds
   (`splitNoteLines`). Both finders import the first; both handlers use the
   second. The indices agree by construction, not by two copies of a rule
   kept in step.
2. **Each line keeps its own terminator.** Lines the edit keeps are written
   back byte for byte. Lines it adds take the ending of the anchor line (the
   heading line, or the block's marker line), else of the nearest earlier
   line that has one, else LF. On a uniform note this is the note's one
   ending, so uniform notes get the same bytes as before.
3. **Leave the splice helpers alone.** They only slice and insert at
   indices and never read an existing line (research F6), so they and their
   tests are unchanged. The file-wide `detectLineEnding` in each tool, left
   with no caller, was deleted.
4. **Check the placement before any write.** `placeEdit` joins the edited
   lines and requires that the anchor line still reads the finder's text and
   that the original bytes before and after the edit are kept. Otherwise the
   call fails with `CLI_REPORTED_ERROR`, `details.code: "UNSAFE_PLACEMENT"`,
   and nothing is written. In `patch_heading` the check runs before the race
   re-read.
5. **One placement step, not two.** As first implemented, each handler
   carried the same join-and-check block and each finder its own copy of the
   split. The PR #119 code-quality review moved both into the leaf
   (`splitLinesForScan`, `placeEdit`); each handler builds only its own
   error.

## Alternatives rejected

- **Normalise the note to one line ending before editing.** It would rewrite
  every line the caller did not touch, which spec 086 FR-004 forbids.
- **Split the edit array on `/\r?\n/` and join with one file-wide ending.**
  The indices would agree, but every kept line would be rewritten to one
  ending.
- **A text array plus a parallel array of endings.** The helpers' output does
  not say which elements are original, so the endings could not be realigned
  without repeating each helper's splice.
- **Change the helpers to return a splice or take `{text, ending}` records.**
  Cleaner in isolation, but it rewrites every helper and its tests for no
  behavioural gain.
- **Report the refusal as `INTERNAL_ERROR`.** That code is kept for an
  output-contract break, and agents of these tools already branch on
  `CLI_REPORTED_ERROR` plus `details.code`.
- **Re-walk the edited note and compare.** A full rescan, and it would not
  prove the bytes outside the edit unchanged.
- **Mode-specific bounds for `patch_heading`** (the direct-body end for
  `replace`). Stronger for one mode, but it repeats the helpers' clamp logic;
  the shared bounds already give the spec's guarantee.
- **Keep the agreement by convention, with a test comparing the two splits.**
  This was the first implementation; review found it repeated the very
  disagreement the fix was for, in a third copy of the rule.

## Consequences

- On a mixed note the edit lands at the named heading or found block, and
  every line outside it is unchanged, in all three `patch_heading` modes and
  in `patch_block`.
- A finder and an editor that disagree again become a refused call, not
  silent damage. The check is two string comparisons per call; with the
  shared split it is not expected to fire on any note.
- `UNSAFE_PLACEMENT` joins each tool's published typed-error list, which
  moved exactly the two description fingerprints. Input and output schemas,
  annotations, `bytes_written` and every other error are unchanged.
- The refusal is tested through the real handlers with `vi.mock`, the
  repository's first use of it, confined to the two
  `handler.unsafe-placement.test.ts` files.
- What makes notes mixed — `set_property`'s LF frontmatter on a CRLF note —
  is not changed here and is tracked as its own item.
