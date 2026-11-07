# ADR-077 — `move` reads the CLI's "already exists" line as a possible blocker only for a folder form it forwarded

- **Status:** Accepted
- **Date:** 2026-11-07
- **Amends:** decision 1 of
  [ADR-071](ADR-071-move-checks-a-blocked-destination-on-disk-after-the-rename-fails.md)
  (`move` checks a blocked destination on disk after the rename fails).
  ADR-071 ran the blocked-destination lookup only after an ENOENT or ENOTDIR
  rename line and listed "an existing destination file" among the failures
  that make no extra call; for a `file` or active call with a folder-form
  `to`, that no longer holds. Its other decisions (ask the disk, a blocker is
  `NOT_A_FOLDER`, no blocker keeps the old answer, a failed check withholds)
  still stand and apply unchanged to the new trigger.
- **Source:** PR #155 (BI-0177 second round, `.specify/bugs/bi-0177-2/`:
  assessment, fix and test reports, owner rulings of 2026-11-05 on the
  description and of 2026-11-07 on Q1 and the reproduction gap), commits
  `611a77b` (the fix) and `c176f61` (the code-quality review's one-step
  classifier)
- **Related:**
  [ADR-044](ADR-044-file-path-tools-check-the-resolved-file-and-keep-its-type.md),
  whose argv contract keeps a `file` call's folder form byte-stable;
  [ADR-074](ADR-074-tool-descriptions-route-within-a-budget-and-the-help-page-holds-the-contract.md),
  the budget the new description sentence fits inside.

## Context

PR #139 made a file in the way of the destination folder `NOT_A_FOLDER`, but
only for a `path` locator. `executeMove` expands the folder form itself only
for `path`; a `file` or active call forwards `to: "Inbox/Note.md/"` as given
(spec 070 `contracts/tool-support.md` invariant 4). The CLI then expands it to
the file in the way and answers `Error: Destination file already exists!`
(spec 090 probe P5; PR #155's T0 probe through `Obsidian.com`, verbatim in
`fix.md`), not a rename errno. ADR-071's lookup never ran, and the agent got
the raw line with no `details.code` (TC-00865 step 4, TC-00900).

The same line is also the CLI's answer to a genuine collision: a file that
already exists at the destination. So the line alone cannot tell a blocker
from a collision.

## Decision

1. **One classifier with two signals.** `folderSignal(e,
   cliExpandsFolderForm)` in `src/tools/move/handler.ts` returns
   `missing-or-blocked` for the ENOENT rename line, `maybe-blocked` for the
   ENOTDIR rename line or for the exact message
   `Error: Destination file already exists!` when `cliExpandsFolderForm` is
   true, and `undefined` otherwise. `moveFailure` runs ADR-071's lookup on
   either signal; only `missing-or-blocked` with no blocker becomes
   `FOLDER_NOT_FOUND`.
2. **The trigger is gated on who expanded the folder form.**
   `cliExpandsFolderForm` is the condition `executeMove` already used to pick
   the forwarded `to` (`input.path === undefined && input.to.endsWith("/")`),
   now named and passed in. A full-path `to` and every `path` call never send
   `already exists` to the lookup, so their collisions stay one CLI call.
3. **The exact string, not a pattern.** The trigger compares the whole
   message to the captured line. A reworded line falls back to the raw error,
   unclassified rather than misclassified.
4. **The description names the failure.** By owner ruling of 2026-11-05,
   `MOVE_DESCRIPTION` adds "A destination through an existing file fails with
   `NOT_A_FOLDER`." and drops "(change it with `obsidian_exec`)" to stay
   within ADR-074's 400 characters (397). The type-change route stays on
   `docs/tools/move.md`, where `_file-type-support.test.ts` now asserts it
   (Q1 = A, 2026-11-07).

## Alternatives rejected

- **Expanding the folder form for `file` and active calls too,** so the CLI
  would answer with a rename errno as it does for `path`. It changes the
  argv spec 070 invariant 4 and ADR-044 keep byte-stable; ADR-071 rejected
  the mirror image (stopping the expansion for `path`) for the same reason.
- **Sending every `already exists` line to the lookup.** A full-path or
  `path`-expanded collision cannot be a folder blocked by a file, so it would
  pay an eval for nothing.
- **A second predicate beside `renameFailureErrno`.** This was the fix as
  first committed (`611a77b`). The PR #155 code-quality review found two
  trigger checks plus a second errno test in `moveFailure`, and folded them
  into the one classifier (`c176f61`). Behaviour did not change.

## Consequences

- A `file` or active move with a folder-form `to` onto a file that really
  exists at the destination now makes one extra eval before the CLI's own
  error is returned. That branch is covered by unit row B9 only; a live
  fixture would need two notes of the same name.
- If a later CLI rewords `Destination file already exists!`, `file` and
  active calls go back to the raw error. Unit row B8 pins the captured line.
- A blocker further up the path (`to: "…/Blocker.md/Sub/"`) gives the ENOENT
  rename line for a `file` call too (T0 probe), so it already took ADR-071's
  branch; the `already exists` form of that case is inferred (unit row B11b).
- `move`'s `descriptionFingerprint` in `_register-baseline.json` moved on
  purpose; the schema, title, annotation and output fingerprints,
  `src/errors.ts` and the boot spine did not. No kernel node is touched.
  `src/tools/_description-audit-record.json` still holds the old
  description's fingerprint, so the audit shows `move` as needing review
  until it is re-judged (a PR #155 follow-up).
