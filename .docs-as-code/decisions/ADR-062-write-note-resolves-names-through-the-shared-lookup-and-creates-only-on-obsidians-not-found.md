# ADR-062 — `write_note` resolves note names through the shared lookup, and creates by name only on Obsidian's not-found answer

- **Status:** Accepted
- **Date:** 2026-11-03
- **Source:** PR #127 (BI-0176, `.specify/bugs/bi-0176/assessment.md`,
  `fix.md` owner rulings Q1 and Q2, `test.md`), commit `4fac32d`; PR #128,
  which carries the PR #127 code-quality review's fixes, commits `72f63c5`
  (the not-found check moved into the lookup module) and `5f943b6` (the
  errno-set ruling)
- **Related:** ADR-059 (the section editors resolve note names through the
  shared lookup, and pass its not-found failure through), whose lookup this
  reuses; ADR-009 (Direct Filesystem Write Path Alongside CLI Bridge),
  whose Decision point 7 keeps `EACCES` a generic failure; ADR-032 (Find
  And Replace File Scope via Sibling Locators), whose cohort parity rule
  the owner cited for Q1; ADR-015 (Sub-Discriminators via
  details.reason for Multi-State Error Codes), under which no new sub-code
  was added.

## Context

`write_note` publishes the shared `file` description, a note name
"resolved like a wikilink", but its `resolveSpecificModePath` applied a
lexical vault-root rule to every name. Overwriting `Sub/Alpha.md` by
`file: "Alpha"` created a second note at the root and reported
`created: true`; with `overwrite: false` it did the same instead of
returning `FILE_EXISTS`. PR #122 had moved `patch_heading` and `patch_block`
onto `resolveFsTarget` (ADR-059) and left `write_note` out, because that
resolver fails on a miss and `write_note` is the one tool in its cohort
that must create notes that do not exist yet. Its private `mapFsError` had
also missed the cohort's lock classification: a held file was
`FS_WRITE_FAILED` with the absolute disk path.

## Decision

1. **A `file` name is looked up with `obsidian file` first**, the lookup
   `read`, `patch_heading` and `patch_block` use, after the vault registry
   (an unknown vault still costs no spawn). A match is the target wherever it
   is, and every later step — type check, path check, write, `created`,
   `path`, refresh, `open` — uses the resolved path. A name two notes share
   writes the note `read` returns; there is no ambiguity error.
2. **Only Obsidian's `Error: File "<name>" not found.` falls back** to the
   existing short-form rule, so create-by-name still creates at the vault
   root. Every other lookup failure propagates and nothing is written: a
   write must not guess its target.
3. **The not-found answer belongs to the lookup module.** `_active-file.ts`
   exports `FILE_NOT_FOUND_LINE` and `findFileByTsv`, which returns `null`
   only for a `CLI_REPORTED_ERROR` carrying that line. `resolveFileByTsv` is
   unchanged. `prepend` takes the first of its `NOTE_NOT_FOUND_PATTERNS`
   from the same constant.
4. **Filesystem failures map like the sibling writers.** `EEXIST` keeps its
   `FILE_EXISTS { errno }` branch; every other errno goes through
   `mapFsWriteError` with `{EBUSY, EPERM}`, so a lock is
   `CLI_REPORTED_ERROR` / `EXTERNAL_EDITOR_CONFLICT` and every
   `FS_WRITE_FAILED` gives the vault-relative path.

## Alternatives rejected

- **Use `resolveFsTarget` as it is, failing on a miss.** Simplest and fully
  consistent with the editors, but it breaks the documented create-by-name
  path; new notes would need `path`.
- **Scan the disk for `<name>.md`.** No spawn, but it re-implements
  Obsidian's link resolution and can disagree with `read` on a shared name,
  the inconsistency the bug is about.
- **Fix the description only.** An honest contract that keeps the silent
  duplicate.
- **A vault-confirming lookup eval with a `VAULT_MISMATCH` sub-code**, the
  design of the closed, never-merged dry-run PR #126. The owner ruled for the
  plain `resolveFileByTsv` lookup (Q1, option B): it meets the bug's
  acceptance criterion, "the note chosen is the one reading by that name
  returns", and keeps parity with the cohort; a new sub-code would need
  ADR-015's process for no observed failure.
- **Test the lookup's error text in the handler.** PR #127 first did this,
  with a local regex that was a byte copy of `prepend`'s pattern. The
  review's blocking finding moved the text and the null-on-not-found variant
  into `_active-file.ts` (PR #128), so the module that runs the lookup owns
  its answers and the two tools cannot drift.
- **`EACCES` in the conflict set**, as `append_note` and `patch_heading`
  have. ADR-009 Decision point 7 names `EACCES` a generic failure that must
  surface as `FS_WRITE_FAILED`, and `write_note`'s page routes OS-reserved
  names, typically `EACCES`, there.
- **Name both conflict sets in `_fs-errors.ts` now** (the PR #127 review's
  proposal). It would edit `append_note`, `patch_block` and `patch_heading`,
  outside BI-0176's scope; the owner deferred it as a follow-up with no
  behaviour change (option B, `5f943b6`).

## Consequences

- A `file` call to `write_note` costs one Obsidian call and needs Obsidian
  to answer it; `path` and active calls cost nothing extra.
- `overwrite: false` on a name that exists in a sub-folder is now
  `FILE_EXISTS` rather than a new root note. Creating a root note of a name
  that exists elsewhere needs `path`.
- Callers that matched `FS_WRITE_FAILED` with `errno: "EPERM"` or `"EBUSY"`
  now see `EXTERNAL_EDITOR_CONFLICT`, the code the other writers return.
  `CHANGELOG.md` records both behaviour changes.
- Create-by-name depends on Obsidian's not-found wording. A wording change
  turns it into a propagated `CLI_REPORTED_ERROR`, never a write to the
  wrong note.
- `resolveFsTarget` remains the locator for every direct-filesystem
  single-note editor except `write_note`, which now shares its lookup but
  not its miss handling.
- The `file` description changed, so `write_note`'s fingerprint in
  `_register-baseline.json` moved, as a deliberate published-surface change.
