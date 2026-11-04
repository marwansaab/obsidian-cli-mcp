# ADR-060 — `move` classifies its failure after the CLI reports it, and keeps the vault's folder out of every failure

- **Status:** Accepted; decision 2 amended by
  [ADR-071](ADR-071-move-checks-a-blocked-destination-on-disk-after-the-rename-fails.md)
  (PR #139), because a rename through an existing file gives the same ENOENT
  line, so the missing-folder branch now makes one disk check first
- **Date:** 2026-11-02
- **Source:** PR #123 (`specs/090-classify-missing-destination/`, BI-0172,
  FR-001 to FR-012, Clarifications Q1 to Q3, research F1 to F12 and D1 to
  D9, analyze finding U1), commits `8bd65a8` (the classifier and the
  rewrite) and `7c42952` (the PR #123 code-quality review's extraction of
  the rewrite and the vault-root lookup)
- **Related:** ADR-015 (Sub-Discriminators via details.reason for
  Multi-State Error Codes), under which the existing
  `CLI_REPORTED_ERROR` / `FOLDER_NOT_FOUND` pair is reused with no
  `details.reason`;
  [ADR-047](ADR-047-read-corrects-the-cli-text-from-two-disk-facts.md),
  whose after-the-call vault-root lookup `move` now shares;
  [ADR-044](ADR-044-file-path-tools-check-the-resolved-file-and-keep-its-type.md),
  which made `resolvedTo` the full vault-relative destination for every
  locator.

## Context

A `move` into a folder that does not exist fails in the CLI with Node's
file error, `Error: ENOENT: no such file or directory, rename '<abs source>'
-> '<abs destination>'`, on exit 0. The dispatch layer turns it into
`CLI_REPORTED_ERROR` with the line in `details.message` and `details.stdout`,
and `move` passed it through. The agent got no stable signal, and the
operator's absolute vault folder twice (research F1). Any other Node file
error during a move (`EPERM`, `EBUSY`, `EXDEV`) has the same shape (F5, F8).
The handler already knows the full vault-relative destination, `resolvedTo`,
for every locator (F6), so the missing folder needs no lookup (F7).

## Decision

1. **Classify after the CLI fails; no pre-check** (D1). `executeMove` wraps
   the CLI call and the response parse in one `try`; a successful move makes
   the calls it always made (FR-012, SC-006).
2. **Recognise the missing folder by the ENOENT rename line** (D2). A
   `CLI_REPORTED_ERROR` whose message matches `^Error: ENOENT: [^,]*,
   rename '` becomes `CLI_REPORTED_ERROR` with `details: { code:
   "FOLDER_NOT_FOUND", folder }` and `cause: null`, unless the destination
   is at the vault root. `folder` is the part of `resolvedTo` before its last
   `/`, with forward slashes (D3, D7). The pair and the `details.folder`
   shape are the ones `paths` and `pattern_search` already publish
   (Clarification Q2), so no code or sub-code is added.
3. **Rewrite the vault root out of every other failure** (D4, Clarification
   Q3). The code, the `cause` and all other wording are kept; only the
   vault's absolute folder becomes vault-relative. The rewrite is the
   tool-agnostic `withVaultRelativePaths` in `src/tools/_vault-relative-error.ts`.
4. **Find the root only after the failure** (D5). Active mode uses the
   focused-file eval's `base`, already fetched; specific mode asks the vault
   registry, which `move` now receives as a required dependency (D6). An
   unregistered vault returns the original failure untouched, because the
   CLI acted on no vault folder (F10). Any other lookup failure withholds the
   CLI text: the code is kept, `details` is `{ source, destination }`, and
   the lookup error is the `cause` (analyze U1, owner ruling).
5. **`CLI_BINARY_NOT_FOUND` and cancellation pass through.** The first
   names install paths, not a vault (Clarification Q1); the second is not an
   `UpstreamError`.

## Alternatives rejected

- **A pre-flight check of the destination folder** (`fs.stat` or `obsidian
  folder`). It adds a call to every move, can disagree with the CLI if the
  folder changes in between, and would block a move a later Obsidian might
  complete by creating the folder (D1).
- **Matching any `ENOENT` text.** Too broad: a note body can contain it (D2).
- **Withholding the CLI text from every failure** (Clarification Q3, option
  B). The owner ruled for the rewrite, which keeps the CLI's diagnosis.
  Withholding survives only where the root cannot be known.
- **Rethrowing the original failure on any lookup failure.** The plan's
  first D5 did this; analyze finding U1 showed a cold registry whose probe
  times out would then leak the root, which FR-005 admits no residual for.
- **Deriving the root from the ENOENT line, or from an extra
  `app.vault.adapter.basePath` eval.** The first works only for path-shaped
  Node errors and infers what the registry knows; the second costs a CLI call
  on every failure (D5).
- **Looking the root up before the move.** It changes the unknown-vault
  failure and adds a probe to the success path on first use (D5).
- **An optional `vaultRegistry?`.** Production always passes one; the
  branch for "no registry" could exist only in tests (D6).
- **Keeping the rewrite private to `move`'s handler.** That was the first
  implementation. The PR #123 review moved it to the leaf module and folded
  `read`'s inline per-mode root lookup and `move`'s into one
  `fileTargetVaultRoot` in `_file-target.ts`, since neither is specific to
  one tool.

## Consequences

- `MOVE_DESCRIPTION` gained one sentence, so `move`'s `descriptionFingerprint`
  in `_register-baseline.json` moved on purpose. The schemas and
  `src/errors.ts` did not change.
- `createServer` passes `vaultRegistry` to `createMoveTool`, a one-argument
  change to the boot spine; nothing new is constructed.
- Recovery from `FOLDER_NOT_FOUND` goes through `write_note`, which creates
  parent folders but also writes a note; no tool creates an empty folder
  (F12).
- `rename` and the shared resolution stage (`_active-file.ts`) still pass
  CLI text through unrewritten. `withVaultRelativePaths` is ready for them;
  using it there is a cross-tool follow-up.
- A source deleted between Obsidian's own check and the rename is reported
  as `FOLDER_NOT_FOUND`; the retry reports the missing source (D2, an
  accepted residual).
