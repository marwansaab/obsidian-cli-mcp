# ADR-076 — `files` checks a named folder only when the CLI lists nothing

- **Status:** Accepted
- **Date:** 2026-11-07
- **Reverses:** for the missing-folder case only, spec 019 FR-010's
  "missing folder = empty folder = folder names a file" conflation
  (`specs/019-list-files/spec.md`, Clarifications). No ADR had recorded
  that choice. The file-path and empty-folder halves of it still stand.
- **Source:** PR #154 (BI-0205, `.specify/bugs/bi-0205/`: assessment, fix
  and test reports, assessment rulings Q1 and Q2, and the owner ruling on
  the PR #154 review of 2026-11-07), commits `b748096` (the fix) and
  `c256db9` (the review's move of the decision into the handler)
- **Related:** ADR-015 (Sub-Discriminators via details.reason for
  Multi-State Error Codes), under which `paths`' `CLI_REPORTED_ERROR` /
  `FOLDER_NOT_FOUND` value is reused with no `details.reason`;
  [ADR-071](ADR-071-move-checks-a-blocked-destination-on-disk-after-the-rename-fails.md),
  whose `move` check is the same shape: one `adapter.stat` eval, run only
  after the CLI's answer leaves the question open, and a template that
  returns a fact the handler interprets.

## Context

TC-00907 called `files` with `folder: "NoSuchFolder0205"` on the published
0.9.0 and got `{ count: 0, paths: [] }`, the answer an empty folder gives.
An agent that mistypes a folder, or names one that has moved, concludes it
holds no notes, and may create duplicates or report a falsely clean state.
`paths` already fails the same input with `FOLDER_NOT_FOUND`.

The Obsidian CLI's `files` subcommand prints nothing and exits 0 for a
missing folder, exactly as for an empty one (the assessment's read-only
probe), so the CLI's answer alone cannot tell them apart. The assessment's
probes also showed that `app.vault.adapter.stat` resolves `..` outside the
vault: `stat('..')` answers for the vault's parent directory. The absolute
forms (`/x`, `\x`, `C:/x`, `\\host\x`) resolve inside the vault.

## Decision

1. **One check, only when a named folder lists nothing.** `executeListFiles`
   (`src/tools/files/handler.ts`) still makes its one CLI `files` call. When
   `folder` is set and the CLI lists no entries, `assertFolderExists` runs one
   `invokeEval` in the vault the listing used (`vault` in specific mode, the
   focused vault in active mode). The vault root and every listing that
   returns entries stay single-spawn. The check keys on the CLI's raw
   entries, before the wrapper's own filters, so a folder whose entries the
   filters remove (`.obsidian`) needs no check: the CLI listed something.
2. **The template returns a fact; the handler decides.** The frozen
   `FOLDER_CHECK_TEMPLATE` (`src/tools/files/_template.ts`) answers
   `{ kind: "missing" | "file" | "folder" }` from the shared in-eval fragment
   `FOLDER_STAT_KIND_JS` (`src/tools/_folder-stat.ts`), in which a `stat`
   that answers `null` or throws counts as missing. The folder travels only
   in the base64 payload. `decodeEvalEnvelope` checks the answer against
   `filesFolderEnvelopeSchema`, and a malformed answer is
   `CLI_REPORTED_ERROR`. The handler strips one trailing `/` before the check,
   as `paths` does, and only `kind: "missing"` fails.
3. **A missing folder is `paths`' error.** `CLI_REPORTED_ERROR`, `cause: null`,
   `details: { stage: "envelope-error", code: "FOLDER_NOT_FOUND", folder }`,
   and the message `files: FOLDER_NOT_FOUND for folder "<folder>"`, built in
   one place (`folderNotFound`). No new top-level code and no new
   `details.code` value.
4. **A `..` segment fails without the check** (assessment Q1, owner option A).
   A `folder` with a `..` segment, split on `/` and `\`, that lists nothing
   fails as `FOLDER_NOT_FOUND` with no eval run, so the check cannot act as
   an existence oracle for paths outside the vault. `details.folder` is then
   the value as given, with no trailing-slash strip. Absolute forms take the
   normal check, because `stat` resolves them inside the vault.
5. **A path that names a file keeps the empty answer.** The check already
   answers `kind: "file"`, but reporting it as `NOT_A_FOLDER` was outside
   BI-0205's report.

## Alternatives rejected

- **The template decides** (`{ ok: true }` or
  `{ ok: false, code: "FOLDER_NOT_FOUND", folder }`). This was the first
  implementation (commit `b748096`). The PR #154 review found the decision
  made twice: the handler never read the failure arm's `code`, and its
  `folder` was the handler's own input with one `/` removed. The owner ruled
  for the fact envelope (option A, commit `c256db9`); every caller-visible
  error stayed byte-identical.
- **The CLI's `folder path=<folder>` subcommand,** as `context_search` probes
  after an empty search. Dispatch turns its `Error:` line into a
  `CLI_REPORTED_ERROR` with only `details.message`, so matching `paths`'
  `details` would mean parsing the CLI's prose. It also rejects a file path,
  which was out of scope.
- **A server-side `fs.stat` through the vault registry's root.** Confined by
  `realpath` containment, but it adds a `vaultRegistry` dependency to `files`
  and its tests, and the project settles folder-type questions on
  `adapter.stat`.
- **One eval that lists and checks together,** as `paths` does. It saves the
  second spawn on an empty answer, but rewrites the tool and its filter
  pipeline; out of proportion for the bug.
- **A check on every call.** A second spawn for every listing, when only an
  empty listing leaves the question open.
- **Running the check on `..` paths** (and so answering for what lies outside
  the vault), or guarding the absolute forms as well. The probes showed only
  `..` escapes, so the guard covers only it.

## Consequences

- An empty listing of a named folder now costs one extra CLI call. The vault
  root and every non-empty listing do not.
- The CLI's listing matches `folder` case-sensitively, but `stat` follows the
  host file system. On a case-insensitive file system (Windows, default
  macOS) a folder written in the wrong case lists nothing and is found by the
  check, so it answers `{ count: 0, paths: [] }`, not `FOLDER_NOT_FOUND`.
  Only Windows was exercised live (`.specify/bugs/bi-0205/test.md`, Residual
  Risks).
- In active mode the listing and the check are two calls in the focused
  vault; a focus change between them could check the wrong vault, the
  documented active-mode caveat.
- `FOLDER_STAT_KIND_JS` is the first shared in-eval folder-type fragment, and
  only `files` uses it. `paths/_template.ts` and
  `pattern_search/_template.ts` keep their own inline checks, which differ
  when `stat` throws; moving them onto the fragment is the BI-0204
  follow-up. `paths` still sends `..` to `stat` and `adapter.list`
  unguarded (BI-0208).
- The input and output schemas, the description and the
  `_register-baseline.json` fingerprints did not move. `src/errors.ts` and
  the boot spine did not change. No kernel node is touched.
