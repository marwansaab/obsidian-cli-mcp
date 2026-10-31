# ADR-048 — `bytes_written` is the size change on every single-note text writer

- **Status:** Accepted
- **Date:** 2026-10-31
- **Source:** PR #103 (BI-0116, `specs/075-unify-size-reporting/`, research
  F1 to F7 and D1 to D8, clarifications Q1 to Q3, live check T031), commits
  `15b7cda` and `4a203e0`
- **Related:** ADR-009 (Direct Filesystem Write Path Alongside CLI Bridge),
  whose `fs` seam and canonical `absPath` the new `stat` uses and whose
  last-write-wins the figure accepts; ADR-015 (Sub-Discriminators via
  details.reason for Multi-State Error Codes), under which `prepend`'s
  `post-stat-byte-delta-zero` reason stays as it was;
  [ADR-042](ADR-042-typed-results-checked-in-registertool.md) (Typed Results
  Checked in registerTool), which publishes the output schemas whose bounds
  and descriptions this decision changes

Research D8 asked for this record in the docs-as-code pass and left the
number to be allocated "at the next vault sync". It is numbered here as 1 +
the highest ADR number used anywhere, as every record in this folder is; the
vault's Decision Log needs the matching entry.

## Context

Five tools write one note's text: `write_note`, `append_note`, `prepend`,
`patch_heading` and `patch_block`. Three of them returned a `bytes_written`
figure, and it meant three different things (research F1):

- `append_note` and `prepend`: the note's size after the write minus its size
  before.
- `patch_heading` and `patch_block`: the note's total size after the edit,
  floored at `min(0)` in the output schema.
- `write_note`: no figure; its strict result was `{ created, path }`.

None of the five output schemas described the field. A caller that checked a
write against `bytes_written` got a correct check from one tool and a
misleading one from its sibling, and the patch tools' `docs/tools/` pages told
readers to treat a near-zero value as "a red flag", which only made sense
under the total-size meaning.

## Decision

1. **One meaning.** `bytes_written` is the note's size in bytes after the
   write minus its size before, counting a note that did not exist as 0. It is
   0 when the size did not change and negative when the note shrank, and it is
   never clamped (spec 075 FR-001, data-model R1 and R2).
2. **The field name stays** `bytes_written` on all five tools (clarification
   Q2), so the adders' results do not change at all.
3. **Each tool measures from what it already holds.** `append_note`,
   `patch_heading` and `patch_block` subtract the UTF-8 length of the text they
   read from that of the text they write, through `sizeChange(before, after)`
   in `src/tools/_note-io.ts`. `prepend` keeps its `stat`-before and
   `stat`-after bracket around the CLI call. `write_note` subtracts the old
   size from the content's UTF-8 length.
4. **`write_note` measures before it writes, or does not write.** Its
   `overwrite: true` existence probe changes from `realpath` to `stat`, which
   gives existence and size in one call. `ENOENT` is a create with old size 0;
   any other errno fails as the existing `FS_WRITE_FAILED { errno, syscall:
   "stat", path }` before anything is written (clarification Q3, FR-006a,
   data-model R4). The `wx` create needs no probe: a write that lands proves
   the note did not exist.
5. **One published description.** `BYTES_WRITTEN_DESCRIPTION` in
   `src/tools/_shared.ts` describes the field on all five output schemas. The
   patch tools drop `min(0)`; the adders keep `min(1)`, because a successful
   add always grows the note (FR-005).
6. **Scope is the five writers** (clarification Q1). `set_property`,
   `find_and_replace` and `create_base` report no size, and adding one is a
   separate item.

## Alternatives rejected

- **Keep the patch tools' total and document the difference.** Leaves a field
  with one name and two meanings in one tool group, which is the defect the BI
  was raised for.
- **A new field name, or old and new fields side by side.** Rejected in
  clarification Q2: BI-0116 names the field `bytes_written` and keeps the
  adders' meaning, whose figure was already right, and reporting both fields
  is out of its scope.
- **Re-`stat` the file after every write** (research D1). Adds I/O to four
  tools and opens a window in which another program's edit leaks into the
  figure, against data-model R5.
- **Keep `realpath` in `write_note` and add a `stat`** (research D2). Two
  round trips for one fact, with a window between them. Reading the whole old
  note just to get its length was rejected for the same reason.
- **Write anyway and omit or guess the figure** when the old size cannot be
  read. Rejected in clarification Q3: a figure without a measurement is the
  silent fallback constitution Principle IV forbids.
- **A shared zod field for `bytes_written`** (research D4). Each schema chains
  its own bound, and a description attached before a chained bound would not
  reliably carry over; a shared string attached last does.
- **No shared helper for the subtraction** was the plan's position (research
  D1: "an abstraction for one line"). The PR #103 code-quality review
  (commit `4a203e0`) argued it the other way after finding the byte delta
  written three ways, and `sizeChange` was added. `write_note` does not use
  it: it holds a size from `stat`, not the old text.

## Consequences

- A check written once — "the reported figure equals the size after minus the
  size before" — holds on all five tools; PR #103's tests apply exactly that
  check to each writer (SC-002), and its live check (T031) matched the
  measured file-size change in all 12 steps.
- `patch_heading` and `patch_block` results change for every call: a caller
  that compared `bytes_written` with the note's total size must compare it
  with the intended change, or read the note. The CHANGELOG's `[Unreleased]`
  entry carries that migration note.
- `write_note`'s result gains a key, and its strict output schema changed with
  it. Its `FS_WRITE_FAILED` from the overwrite probe now reports
  `details.syscall: "stat"` instead of `"realpath"`; no code, reason or
  `details` key was added.
- `write_note`'s injected `ExecuteFs` gained a required `stat`, so every test
  fake of it must provide one.
- Five `outputSchemaFingerprint`s in `src/tools/_register-baseline.json`
  moved, deliberately; no description, input-schema, title or annotation
  fingerprint did.
- The figure describes this write against the text it read. In
  `patch_heading`'s tolerated race, and in any last-write-wins overlap, it does
  not report what another program did to the file meanwhile (data-model R5).
- The maintainer's architecture note on upstream limitations still advises
  trusting `bytes_written` from the patch tools "for byte-exact size"; under
  this decision that no longer gives a total, and the note is due to change in
  the vault sync that records this ADR (spec 075 plan, Follow-ups).
