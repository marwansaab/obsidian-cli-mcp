# ADR-062 — `write_note` resolves a note name by one eval that reports its vault, and writes nothing when the vault is not the named one

- **Status:** Accepted
- **Date:** 2026-11-03
- **Source:** PR #126 (BI-0176, bug path: `.specify/bugs/bi-0176/assessment.md`
  Q1 to Q3, `fix.md` and its *Amendment: owner ruling, scope (a)* and
  *Amendment: code-quality review*, `test.md` and its re-test), commits
  `6afc4ad` (the fix) and `cbcce78` (the PR #126 code-quality review's split
  of the lookup from the short-form fallback)
- **Related:** ADR-059 (the section editors resolve note names through the
  shared lookup), the resolver this decision does not use; ADR-031
  (Cross-Vault Open via Vault-Targeted Focus), which establishes that an
  `eval` sent with `vault=<name>` runs in that vault; ADR-029 (Retry Once
  on Cold-Start Vault-Launch Failure), which the lookup inherits; ADR-052 (typed evals carry a
  per-call answer tag), through which the answer is read; ADR-009 (Direct
  Filesystem Write Path Alongside CLI Bridge), whose write path runs
  unchanged on the resolved path.

## Context

`write_note` publishes the shared `file` description, a note name "resolved
like a wikilink", but mapped a name to `<name>.md` at the vault root without
asking Obsidian. Overwriting a note that lives in a sub-folder by name created
a second note at the root, with the same frontmatter id, and reported
`created: true` (assessment, Symptom).

The assessment's remedy was the shared `resolveFileByTsv` lookup
(`obsidian file`), as ADR-059 gave the section editors, falling back to the
root rule only on Obsidian's `Error: File "<name>" not found.` line. The first
`/speckit-bug-test` run then reported that the CLI ignores `vault=` for a vault
that is not focused, so the lookup could answer from another vault: a miss
would fall back to a root note, and a hit would hand back another vault's
path to write under the named one. The owner ruled for scope (a): widen the
fix in `write_note` only, so that a name is trusted only when the lookup is
confirmed to have run in the named vault.

The re-test then found that report was an artifact of the probe: it put
`vault=` after the subcommand, where the CLI does not read it. Production
argv puts it first and routes correctly for a vault that is open but
unfocused and for one that is closed but registered (`test.md`, *Correction
to the first run's finding*). The owner kept the confirmation anyway, as a
guard against any misrouting at no extra call.

## Decision

1. **One eval resolves the name and reports its vault.**
   `NAME_LOOKUP_TEMPLATE` in `src/tools/write_note/_template.ts` returns
   `{ vault: app.vault.getName(), path: getFirstLinkpathDest(file, '')?.path
   ?? null }`, sent through `invokeEval` with `vault=` ahead of the
   subcommand, the name in the base64 payload. A live parity probe found it
   picks the same note as `obsidian file` on six names, including a name two
   notes share, so "the note `read` picks" still holds.
2. **The answer is used only from the named vault.** If the reported vault is
   not the one the caller named, `lookupNoteByName` throws
   `CLI_REPORTED_ERROR` with `details: { code: "VAULT_MISMATCH", vault,
   answeredBy, file }` before any filesystem access. Neither the root
   fallback nor a path from another vault's answer is trusted.
3. **Only a name no note has falls back to the short-form rule.** A null
   `path` from the named vault creates `<file>.md` at the root for a canonical
   short form, or the name verbatim otherwise. Any other lookup failure fails
   the call. With `overwrite: false`, a name that exists in a sub-folder is
   `FILE_EXISTS` for that note (Q2).
4. **The scope is `write_note`.** The other callers of `resolveFileByTsv`
   (`append_note`, `prepend`, `patch_heading`, `patch_block`,
   `find_and_replace`, `read`'s type check) are unchanged.
5. **Its filesystem failures go through the cohort's mapper** (Q1). Every
   errno but `EEXIST` maps through `mapFsWriteError` with
   `EDITOR_CONFLICT_ERRNOS = {EBUSY, EPERM}`, `patch_block`'s set: a lock is
   `EXTERNAL_EDITOR_CONFLICT`, `EACCES` stays `FS_WRITE_FAILED`, and every
   `FS_WRITE_FAILED` carries the vault-relative path. `EEXIST` keeps its
   `FILE_EXISTS { errno }` shape.

## Alternatives rejected

- **`resolveFileByTsv`, the assessment's remedy.** The `obsidian file` TSV
  answer cannot say which vault produced it, so it cannot meet the owner's
  ruling.
- **`obsidian file` plus a separate check of the focused vault, or of the
  resolved path on disk** (the first test report's option (a) examples). A
  second call can be answered by a different vault than the first; one eval
  confirms the very answer it returns, with no race and no extra call.
- **Accept the residual and document a focused-vault requirement** (option
  (b)). The owner chose (a); the requirement also turned out not to exist.
- **Confirmation for the whole `resolveFileByTsv` cohort.** Outside the
  assessment's `write_note` scope; the owner ruling limited it.
- **Share the editor-conflict errno sets as exports of `_fs-errors.ts`**
  across `append_note`, `patch_block`, `patch_heading` and `write_note`
  (proposed by the PR #126 code-quality review). The owner ruled it out of
  this bug fix (option A) and recorded it as a follow-up for the next change
  to `_fs-errors.ts` or one of those handlers.

## Consequences

- A `file` write costs one Obsidian call before any filesystem access and
  now needs Obsidian to answer it; a `path` write costs nothing extra.
- `VAULT_MISMATCH` is a new `details.code` under `CLI_REPORTED_ERROR`, with
  one state, so no `details.reason` (ADR-015, Sub-Discriminators via
  details.reason for Multi-State Error Codes). It is proven by unit tests
  only: no live misrouting could be produced.
- The confirmation compares display names, so two vaults with the same name
  cannot be told apart, the same limit the vault registry has.
- The `file` description moved, so `_register-baseline.json` changed for
  `write_note`'s `schemaFingerprint` only.
- `write_note`'s lock and write failures now match the sibling writers'
  codes, and no longer carry the absolute disk path.
- `write_note` resolves names differently from the other direct-filesystem
  editors (ADR-059's `resolveFsTarget`), though both pick the same note.
