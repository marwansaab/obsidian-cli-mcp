# ADR-071 — `move` checks a blocked destination on disk after the rename fails

- **Status:** Accepted; decision 1 amended by
  [ADR-077](ADR-077-move-reads-the-clis-already-exists-line-as-a-possible-blocker-only-for-a-folder-form-it-forwarded.md)
- **Date:** 2026-11-04
- **Amends:** decision 2 of
  [ADR-060](ADR-060-move-classifies-its-failure-after-the-cli-and-keeps-the-vault-folder-out.md)
  (`move` classifies its failure after the CLI reports it, and keeps the
  vault's folder out of every failure). ADR-060 read every non-root ENOENT
  rename line as a missing folder with no lookup; that no longer holds. Its
  other decisions (classify after the CLI fails, the vault-root rewrite, the
  after-the-failure root lookup, the pass-throughs) still stand.
- **Source:** PR #139 (BI-0177, `.specify/bugs/bi-0177/`: assessment, fix
  and test reports, assessment rulings Q1 to Q3, owner rulings on the PR #139
  review of 2026-11-04), commits `57ca042` (the fix), `9b26193` (the review's
  closed-type refactor) and `3a23d9d` (the review's switch from the index to
  the disk)
- **Related:** ADR-015 (Sub-Discriminators via details.reason for
  Multi-State Error Codes), under which the `CLI_REPORTED_ERROR` /
  `NOT_A_FOLDER` pair `paths` already publishes is reused with no
  `details.reason`;
  [ADR-044](ADR-044-file-path-tools-check-the-resolved-file-and-keep-its-type.md),
  whose folder-form expansion for a `path` locator is what sends the CLI a
  path through the file.

## Context

TC-00701 moved a note with `to: "Inbox/Note.md/"` where `Inbox/Note.md` is a
note, and got `FOLDER_NOT_FOUND` with advice to create the folder. The agent
cannot follow that advice: the file already holds the name. Spec 090's edge
case "Destination folder name exists as a file" forbids that signal.

For a `path` locator, `executeMove` expands the folder form into a full path
(`to=Inbox/Note.md/MoveMe.md`). On Windows the CLI's rename then prints the
same `Error: ENOENT: no such file or directory, rename '…' -> '…'` line as a
missing folder (PR #139's T0 probe through `Obsidian.com`, verbatim in
`fix.md`), so the line alone cannot tell the two apart. On POSIX libuv gives
`ENOTDIR` instead; that form is inferred, not captured. Spec 090's probe P5
had sent the raw folder form, which the tool never forwards, so it missed
this.

## Decision

1. **One check, only after a rename failure into a non-root folder.**
   `moveFailure` matches `^Error: (ENOENT|ENOTDIR): [^,]*, rename '` and only
   then runs one `invokeEval` in the vault the move used (`target.vault`;
   `undefined`, the focused vault, in active mode). A successful move and
   every other failure (`EPERM`, an existing destination file, a rename into
   the vault root) make the calls they made before. ADR-060's
   "classify after, never before" stands.
2. **Ask the disk, not Obsidian's index.** The frozen `BLOCKER_TEMPLATE`
   (`src/tools/move/_template.ts`) walks the destination folder's prefixes
   from the shortest through `app.vault.adapter.stat`, the missing / file /
   folder check `paths` and `pattern_search` already use. The first prefix
   that exists and is not a folder is the blocker. A missing prefix ends the
   walk with `null`, since nothing below it can exist. The folder travels
   only in the base64 payload (`composeEvalCode`), and the answer is decoded
   by `decodeEvalEnvelope` against `moveBlockerEnvelopeSchema`.
3. **A blocker is `NOT_A_FOLDER`.** `CLI_REPORTED_ERROR` with
   `details: { code: "NOT_A_FOLDER", folder: <file> }` and `cause: null`, the
   same shape as `FOLDER_NOT_FOUND`, with "rename or remove that file, or pick
   another destination" and never "create the folder" (assessment Q1).
4. **No blocker keeps the old answer.** ENOENT stays `FOLDER_NOT_FOUND`,
   byte-identical. ENOTDIR with nothing in the way is not a missing folder;
   it falls through to the vault-root rewrite as the CLI said it.
5. **A failed check withholds the CLI text** (assessment Q2, spec 090
   data-model E4c). The move keeps its code, `details` is
   `{ source, destination }`, and the check's `UpstreamError` is the `cause`;
   it is never reported as `FOLDER_NOT_FOUND`. Cancellation is not an
   `UpstreamError` and passes through. `withheldFailure` gained a closed
   `"vault-folder" | "destination-folder"` key for the clause naming what
   could not be checked, so ADR-060's message is byte-identical.

## Alternatives rejected

- **Obsidian's index (`app.vault.getAbstractFileByPath`).** This was the
  first implementation (commit `57ca042`). The PR #139 review found that it
  is case-sensitive and blind to a file Obsidian has not indexed yet, so a
  real file in the way still got the create-folder advice BI-0177 names as
  the harm. The owner ruled for the disk (Q1 = A, commit `3a23d9d`).
- **Stopping the folder-form expansion for `path` locators,** so the CLI
  sees the folder form as P5 did. It would change spec 070's argv contract
  (ADR-044); out of scope by ruling.
- **A server-side `fs.stat` of the destination.** It adds file-system
  surface to a CLI-wrap tool for one failure branch; out of scope by ruling.
- **A pre-flight check on every move.** Rejected in ADR-060 for the same
  reasons: a call on every success, and a race with the CLI.
- **A new `details.code` or a `details.reason` on `FOLDER_NOT_FOUND`.**
  `NOT_A_FOLDER` already means "a path that names a file where a folder is
  needed" in `paths`; one meaning across tools is ADR-015's rule, and the
  condition has one state.
- **A second withheld-failure builder.** One builder with the closed key
  keeps the two messages from drifting (the review's refactor, commit
  `9b26193`).

## Consequences

- The missing-folder branch now costs one extra CLI call. ADR-060's Context
  sentence "the missing folder needs no lookup (F7)" was true when written
  and is not since PR #139.
- A name that differs from the file's only in case counts as that file
  wherever the file system ignores case (Windows, default macOS volumes);
  `details.folder` then carries the name as written in `to`. On a
  case-sensitive file system it stays `FOLDER_NOT_FOUND`.
- A `stat` that rejects reads as a missing prefix, so the walk ends and the
  result is `FOLDER_NOT_FOUND`, not a withheld failure. Only a failure of the
  eval itself withholds.
- `MOVE_DESCRIPTION` gained a sentence, so `move`'s `descriptionFingerprint`
  in `_register-baseline.json` moved on purpose. The schema, title,
  annotation and output fingerprints, `src/errors.ts` and the boot spine did
  not change. No kernel node is touched.
- The POSIX `ENOTDIR` line is inferred from libuv and covered only by unit
  rows; a live POSIX capture is a residual of PR #139.
