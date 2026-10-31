# ADR-049 — `prepend` keeps Obsidian's write and removes the line break it adds to a bodiless note

- **Status:** Accepted
- **Date:** 2026-10-31
- **Source:** PR #104 (`specs/076-fix-empty-prepend/`, research F2, D1 to
  D3, clarification Q1, contract E1 to E12), commits `073ca04`, `a90ed90`
  and `eaba135`
- **Related:** ADR-009 (Direct Filesystem Write Path Alongside CLI Bridge),
  whose `writeAtomic` and metadata refresh the corrective write reuses, and
  whose 2026-05-26 amendment records why `prepend` stayed on the CLI;
  ADR-015 (Sub-Discriminators via details.reason for Multi-State Error
  Codes), under which the new `extra-trailing-newline` reason sits;
  [ADR-048](ADR-048-bytes-written-is-the-size-change.md) (`bytes_written` Is
  the Size Change), whose meaning the corrected figure keeps

Neither the spec nor the plan asked for this record. It is written because
the PR chose one repair over four alternatives, and the rejected ones are
the obvious next ideas for anyone who meets the same defect again. It is
numbered as 1 + the highest ADR number used anywhere; the vault's Decision
Log needs the matching entry.

## Context

`prepend` wraps the CLI's own `prepend` subcommand rather than writing to
disk, because spec 045 FR-005b forbids a wrapper-side frontmatter parser:
Obsidian, not the wrapper, decides where text lands relative to a properties
block (spec 045 research R1).

The 076 T0 live probe (research F2) showed that, in default mode, Obsidian
appends one LF after the content on every call. On a note with a body that
LF is the separator. On a note with no body — empty, or a properties block
only — it is an extra trailing line break: `""` + `"first"` gave `"first\n"`,
and `bytes_written` counted the extra byte (6, not 5). `append_note` on the
same empty note gave `"first"` / 5. `inline: true` was already exact.

## Decision

1. **Obsidian keeps the main write.** The wrapper still never detects a
   properties block. After the call it only checks whether Obsidian's
   insertion landed at the very end of the note it read before the call
   (research D1).
2. **One pure predicate decides.** `landedAtEmptyBody(before, content,
   after)` in `src/tools/prepend/empty-body.ts` is true when
   `after === before + content + "\n"` and `before` does not end with the
   primitive root of `content + "\n"` (research D2). That ending is the one
   shape where the same bytes could also come from an insertion higher up a
   note with a body, so the predicate refuses it.
3. **The correction is one atomic write.** When the predicate holds, the
   handler writes `before + content` through the cohort's `writeAtomic`,
   refreshes the metadata cache with `invalidateMetadataCache`, and reports
   `bytes_written` one byte lower. Both helpers come from
   `src/tools/_note-io.ts`, so `prepend` now uses the direct-filesystem
   substrate for this one write.
4. **Default mode only.** The note is read before the call only when
   `inline` is false, and read back only when it grew by exactly
   `byteLength(content) + 1`. This narrowing came from review (finding 3,
   owner's option A, commit `eaba135`): reading before inline calls cost a
   full-note read for nothing and added a new way for them to fail.
5. **A concurrent edit wins.** If another writer changed the note between
   the call and the read-back, the predicate is false, nothing is rewritten,
   and the measured size change is reported (clarification Q1).
6. **Failures stay under `FS_WRITE_FAILED`.** A failed rewrite, or a failed
   read-back of a note that was empty, carries the new
   `details.reason: "extra-trailing-newline"`. A failed read-back of a
   non-empty note, and a non-`ENOENT` failure of the pre-call read, carry
   `{ errno, syscall: "open", path }` with no reason. No top-level code is
   added.

## Alternatives rejected

- **Write empty notes directly, bypassing Obsidian.** Fixes `""` with one
  write but not properties-only notes, which would still need a correction
  after the write: two mechanisms instead of one.
- **Move `prepend` to the direct-write path with its own frontmatter
  parser.** Breaks spec 045 FR-005b, reverses spec 045 research R1, and is a
  far larger change for a one-byte defect.
- **Ask Obsidian's metadata cache where the properties block ends before the
  call.** Spec 045 research R1 already rejected this: the cache may not be
  warm, so the answer can be stale.
- **Pass `inline` to Obsidian whenever the note has no body.** Knowing that
  in advance is exactly the frontmatter detection FR-005b forbids.
- **Correct every result that ends in `content + "\n"`, with no ambiguity
  guard.** It would turn `"x\n"` + `"x"` — a note **with** a body — into
  `"x\nx"`, changing behaviour the spec (FR-006) says must not change.

## Consequences

- An empty note or a properties-only note ends with exactly the supplied
  content, and `prepend`'s `bytes_written` matches `append_note`'s on the
  same note (spec 076 SC-003).
- A default-mode `prepend` reads the whole note up to twice more than it did
  before: once before the call and, because Obsidian always adds one LF, once
  after almost every successful call. The content cap (3072 code units)
  bounds the predicate's cost, but not the note's size.
- A properties-only note whose end already repeats `content + "\n"` (for
  example `content: "---"`, `"-"` or only line breaks) keeps Obsidian's
  extra trailing line break (contract E12). The limitation is documented in
  `docs/tools/prepend.md`.
- A default-mode call on a note the server cannot read now fails before
  Obsidian is called, where before PR #104 the wrapper only `stat`ed it and
  left the write to Obsidian. Inline calls keep their pre-076 behaviour.
- `prepend` is no longer a pure CLI wrap. Its `ExecuteFs` gained `readFile`,
  `writeFile`, `rename` and `unlink`, the same seam the direct-filesystem
  cohort uses.
- The separator behaviour on notes that already have a body is unchanged,
  including the drift research F3 found in `docs/tools/prepend.md`; that is a
  separate item.
