# ADR-066 — `find_and_replace` reports a missing named note as `INVALID_NOTE`

- **Status:** Accepted
- **Date:** 2026-11-03
- **Source:** PR #134 (BI-0178, `.specify/bugs/bi-0178/`: assessment, fix
  and test reports, owner ruling Q1 = A), commits `d1a85a6` (the fix) and
  `1580876` (the PR #134 code-quality review's rewording of the
  `findFileByTsv` contract)
- **Related:** ADR-032 (Find And Replace File Scope via Sibling Locators),
  which added the `file` scope; ADR-015 (Sub-Discriminators via
  details.reason for Multi-State Error Codes), whose `INVALID_NOTE` /
  `not-found` sub-state the fix reuses;
  [ADR-059](ADR-059-section-editors-resolve-note-names-through-the-shared-lookup.md),
  which chose the opposite shape for the section editors;
  [ADR-062](ADR-062-write-note-resolves-names-through-the-shared-lookup-and-creates-only-on-obsidians-not-found.md),
  which introduced the null-on-miss lookup this record reuses.

## Context

`find_and_replace` takes a single-note scope by `path` or by `file` name
(spec 066). Spec 066 FR-008, the tool description and
`docs/tools/find_and_replace.md` all say a note that does not exist, "by path
or by name", fails with `VALIDATION_ERROR`, `details.code: "INVALID_NOTE"`,
`details.reason: "not-found"` and `details.note`. Only the `path` form did.
The `file` form looked the name up with `resolveFileByTsv`, which throws
Obsidian's own `Error: File "<name>" not found.` as a pass-through
`CLI_REPORTED_ERROR` before the handler's existence check, `assertExists`,
could build the documented envelope (TC-00783 passed, TC-00784 failed on
`0.9.0-local`). Nothing was written either way; the harm was two shapes for
one condition inside one tool, and a published contract the code broke.

## Decision

1. **The name form returns the documented envelope** (Q1 = A). The `file`
   branch of `resolveSingleNoteScope` looks the name up with
   `findFileByTsv`. A `null` result — Obsidian answered with its not-found
   line — throws `VALIDATION_ERROR` + `INVALID_NOTE` / `not-found`, with
   `details.note` set to the name as given and `cause: null`.
2. **Only Obsidian's not-found answer maps.** Every other lookup failure (an
   unknown vault, an answer with no `path` line, the binary not found)
   propagates unchanged, as it did before.
3. **One builder for both forms.** A private `invalidNoteNotFound(note,
   cause)` in `find_and_replace/handler.ts` builds the error for the name
   miss and for `assertExists`'s path miss, with byte-identical code,
   message and details. It is not called `noteNotFound`, the assessment's
   example name, because that is already the shared `NOTE_NOT_FOUND` builder
   in `src/tools/_fs-errors.ts`.
4. **The lookup module keeps owning the miss signature.** The handler does
   not re-match Obsidian's line. `findFileByTsv` in `_active-file.ts` now has
   two consumers with opposite miss policies, and its contract says so:
   `null` only on the not-found line, every other failure propagates, and
   the caller decides what a miss means — `write_note` creates the note,
   `find_and_replace` fails.
5. **The miss is raised before anything else runs.** It comes from
   `resolveScope`, ahead of the first read and of the commit confirmation,
   so a `commit: true` call with a confirming client asks nothing and writes
   nothing.

## Alternatives rejected

- **Adopt BI-0171's pass-through shape** (Q1 = B): keep Obsidian's
  `CLI_REPORTED_ERROR`, as `read`, `patch_heading` and `patch_block` give it
  (ADR-059), and rewrite FR-008, the description and the help page to match.
  It would align the name form across tools, but leave two shapes for one
  condition inside `find_and_replace`, contradict the report's acceptance
  criteria, and move the description fingerprint.
- **Catch the lookup's error in the handler and test its message against
  `FILE_NOT_FOUND_LINE`.** Same behaviour, but it copies the miss test into
  a handler, which PR #127's review had already moved into the lookup
  module (ADR-062).

## Consequences

- Callers that matched Obsidian's not-found text in `details.stdout` for
  `find_and_replace` no longer see it and should branch on `details.code`.
  The CHANGELOG entry calls this out as a behaviour change.
- A missing name now gives `INVALID_NOTE` / `not-found` in
  `find_and_replace` and Obsidian's pass-through in `read`, `append_note`,
  `prepend`, `patch_heading` and `patch_block`. That divergence already held
  for the `path` form and is what spec 066 specified; aligning the other
  tools is out of scope.
- No new error code, sub-code or reason (constitution Principle IV), and no
  published-surface change: the description, help, schemas and the
  register-baseline fingerprints did not move.
- A name matching several notes still resolves by Obsidian's own rule;
  unchanged and out of scope.
- Not exercised live: the published `0.9.0-local` package (TC-00784 is to
  be re-run on the next local release), macOS and Linux.
