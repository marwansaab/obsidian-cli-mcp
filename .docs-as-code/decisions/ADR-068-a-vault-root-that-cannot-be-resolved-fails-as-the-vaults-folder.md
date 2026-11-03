# ADR-068 — A vault root that cannot be resolved fails as the vault's folder, classified before the containment check

- **Status:** Accepted
- **Date:** 2026-11-04
- **Source:** PR #136 (BI-0185, `.specify/bugs/bi-0185/`: assessment, fix
  and test reports, owner rulings Q1 = A, Q2 = A, Q3 and Q4), commits
  `566094c` (the fix), `4e2076b` and `3f487bc` (the PR #136 code-quality
  review's fixes; `3f487bc` is the owner's option A on its finding (a))
- **Related:** ADR-015 (Sub-Discriminators via details.reason for
  Multi-State Error Codes), under which `folder-missing` joins `unknown` on
  `VAULT_NOT_FOUND`; PR #87 (spec 068 R5), which gave the canonical check
  its nearest-existing-ancestor walk;
  [ADR-061](ADR-061-obsidian-exec-fails-an-unknown-vault-only-on-the-exact-answer.md),
  the other unknown-vault record of the same release.

## Context

Eight tools run the shared canonical-path guard `assertCanonicalPath`
(`src/tools/_active-file.ts`) on a vault root they took from the vault
registry: `query_base`, `create_base` with `vault`, `find_and_replace`,
`write_note`, `append_note`, `prepend`, `patch_block` and `patch_heading`.
The registry knows only what Obsidian has registered. When the vault's folder
was renamed, deleted, or sat on a drive that was no longer there, the guard's
`realpath` of the root threw Node's `ENOENT`. Nothing classified it, and
`registerTool` passes on anything that is not an `UpstreamError` or a
`ZodError`, so the client got the SDK's free text,
`ENOENT: no such file or directory, realpath '<absolute vault path>'`, with no
code, no `details`, and the host's disk path (TC-00727; constitution
Principle IV).

The difficulty is telling a failure *of the root* from a failure *below* it.
`ENOENT` below the root never escapes, because the walk climbs to the nearest
existing ancestor. But `ENOTDIR`, `EACCES` and `ELOOP` can come from a
segment under a root that exists — `path: "Welcome.md/x.md"` gives `ENOTDIR`
on Linux — and reporting that as a missing vault folder would send the caller
to fix a vault that is fine.

## Decision

1. **The guard resolves the root itself, first.** `assertCanonicalPath`
   calls `realpath(vaultRoot)` before anything else, and only that call's
   failure is classified, by the private `vaultRootFailure`. A failure below
   a root that resolved propagates exactly as before, by construction rather
   than by inspecting the error.
2. **`path-safety` is split, not taught about envelopes.**
   `src/path-safety/canonical.ts` exports `checkUnderCanonicalRoot(vaultRoot,
   canonicalRoot, inputPath, deps)`, the former body of `checkCanonicalPath`
   without its own root `realpath`. `checkCanonicalPath` is now that realpath
   followed by the new function. `CanonicalCheckOutcome` did not change, and
   the module still knows nothing of `UpstreamError`, so imports run
   tools → path-safety only (Principle I).
3. **ENOENT and ENOTDIR on the root are the vault's folder missing.** They
   become `CLI_REPORTED_ERROR` with `details: {code: "VAULT_NOT_FOUND",
   reason: "folder-missing", vault}` and a message telling the caller to
   restore the folder or re-open the vault in Obsidian (Q1 = A).
   `folder-missing` is a new `details.reason` beside `remapVaultNotFound`'s
   `unknown`, not a new code.
4. **Any other errno on the root is wrapped, never passed on raw** (Q4).
   `CLI_REPORTED_ERROR` with `details: {stage: "vault-root-check", errno,
   vault}` and no recovery hint, since the cause is not known.
5. **No disk path on the wire.** Neither message nor `details` carries the
   absolute root; `details.vault` is the display name the caller gave
   (`null` in active mode, where the message says "the focused vault"). The
   errno stays on `cause`, which `registerTool` never serialises.

## Alternatives rejected

- **Map any `ENOENT` / `ENOTDIR` that escapes `checkCanonicalPath`** (the
  assessment's remediation). Simple, but `ENOTDIR` from below an existing
  root would be reported as a missing vault folder (acceptance criterion 4).
  The fix commit `566094c` did not ship it.
- **Re-probe the root after the check fails** (what `566094c` shipped). The
  guard caught the check's error and realpathed the root a second time to
  decide whose failure it was, returning either the original error or a new
  envelope as `unknown` for `throw await`. The PR #136 code-quality review
  argued it out: the check already realpaths the root, so splitting it at
  that step removes the guesswork, the second filesystem call and the
  untyped return (commit `3f487bc`, owner option A).
- **A third `CanonicalCheckOutcome`** (`{ ok: false, kind: "root-missing" }`).
  Rejected in the assessment: it widens the outcome union and every consumer
  of it for no behaviour the split does not already give.
- **A new top-level code (`VAULT_UNAVAILABLE`) or a parallel `details.code`.**
  The first breaks Principle IV's no-new-codes rule; the second splits one
  discriminator ("the vault you asked about is not usable") in two, which
  ADR-015 exists to avoid.

## Consequences

- The eight tools' `docs/tools/` error rosters list the `folder-missing` and
  `vault-root-check` rows (Q2 = A). Their `index.ts` descriptions and the
  FR-018 fingerprint baseline did not move; the wider wording is left to
  BI-0174.
- An available vault costs the same number of `realpath` calls as before;
  only their order changed (root first).
- `checkCanonicalPath` keeps its signature and behaviour, but after this PR
  only `canonical.test.ts` calls it.
- **Still raw:** errnos from below an existing root (`ENOTDIR`, `EACCES`,
  `ELOOP` on a sub-path) escape `assertCanonicalPath` unchanged, as before.
  That is the same Principle IV gap, outside BI-0185 by ruling, and listed in
  `fix.md` Follow-ups as a candidate BI.
- Routes that do not pass through the guard — the `file` locators, `bases`,
  `views_base` — reach Obsidian only through `invokeCli` / `invokeEval`, whose
  failures are already `UpstreamError`s, so none can leak a raw errno (Q3, by
  code reading). What Obsidian itself answers on those routes for a missing
  folder was not observed.
- Not exercised live: no vault Obsidian has registered with a missing folder
  could be set up unattended, because Obsidian keeps its vault list in
  memory. The owner accepted the `partial` test result; TC-00727 is named for
  the next owner-input validation pass (`test.md`, Residual Risks).
