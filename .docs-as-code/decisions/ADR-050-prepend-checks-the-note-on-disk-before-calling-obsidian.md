# ADR-050 — `prepend` checks the note on disk before calling Obsidian, and one builder reports a missing note

- **Status:** Accepted
- **Date:** 2026-11-01
- **Source:** PR #105 (`specs/077-fix-prepend-not-found/`, research F1 to F4,
  D1 to D4, clarification Q1, contract E1 to E11), commits `00c1365` and
  `cdbd8af`
- **Related:** ADR-009 (Direct Filesystem Write Path Alongside CLI Bridge),
  whose contained `absPath` the check stats;
  ADR-015 (Sub-Discriminators via details.reason for Multi-State Error
  Codes), under whose rule the failure reuses `details.code: NOTE_NOT_FOUND`
  rather than adding a code;
  [ADR-049](ADR-049-prepend-keeps-obsidians-write-and-removes-the-added-line-break.md)
  (`prepend` keeps Obsidian's write), whose pre-call read this check now
  precedes

Neither the spec nor the plan asked for this record. It is written because
the PR settled where a missing note is detected, and review then overturned
the plan's choice of where the failure is built. It is numbered as 1 + the
highest ADR number used anywhere (ADR-046 is reserved by spec 073's plan for
the record its README entry names); the vault's Decision Log needs the
matching entry.

## Context

`prepend` documented `CLI_REPORTED_ERROR` with `details.code: NOTE_NOT_FOUND`
for a missing note, but returned a generic `CLI_REPORTED_ERROR` with
`details.stage: "prepend-cli"` (research F1). Two things hid the case:

- the pre-call `fs.stat` swallowed `ENOENT` and set the size to 0, leaving
  detection to Obsidian;
- the classifier's four patterns were placeholders written before any live
  probe, and none matched Obsidian's real line. The spec 077 T0 probe
  (research F2) recorded it: `Error: File "<path>" not found.` on stdout,
  exit 0, in default and inline mode.

The same probe found two facts that bear on the choice. Obsidian's vault
paths are case-sensitive, so a wrong-case path is "not found" to Obsidian
while `fs.stat` succeeds on Windows and default macOS. And the CLI ran the
probe's commands against the vault open in Obsidian despite `vault=`, so a
call that relies on Obsidian alone to notice a missing note depends on which
vault Obsidian has open.

`append_note` already reported the case as documented, from its pre-write
read (research F3); `query_base` stats its `.base` file before calling
Obsidian and also classifies Obsidian's report (research F4).

## Decision

1. **Two detection points** (clarification Q1, option A). The existing
   pre-call `stat` maps `ENOENT` to `NOTE_NOT_FOUND`, with the fs error as
   `cause`, before Obsidian is called (FR-001a, research D1). It runs in
   default and inline mode. Any other `stat` error is rethrown unchanged.
   Obsidian's own report is still classified, for the cases the stat cannot
   see: a case mismatch, or a note removed between the stat and the call
   (FR-001b).
2. **One confirmed pattern, placeholders kept.**
   `/^\s*Error: File ".*" not found\.\s*$/m` heads `NOTE_NOT_FOUND_PATTERNS`
   (research D2). It names the subject `File` and requires the quoted path,
   so Obsidian's folder, vault and cold-start "not found" lines stay generic
   (FR-007). The four unconfirmed placeholders stay, so nothing they matched
   before is reported differently.
3. **One builder for the cohort.** `noteNotFound(relPath, vault, cause)` in
   `src/tools/_fs-errors.ts` returns the `UpstreamError`: `CLI_REPORTED_ERROR`,
   `details: { code: "NOTE_NOT_FOUND", path, vault }`, message
   `Note "<path>" not found in vault.`. `prepend` calls it at both detection
   points; `append_note` and `patch_block` replaced their inline copies with
   it (commit `cdbd8af`).
4. **`vault` stays the caller's.** The builder takes the value and does not
   choose one. `append_note` passes `input.vault ?? null`, `patch_block`
   `input.vault ?? "<focused>"`, and `prepend` the resolved display name
   (research D4). In specific mode all three equal `input.vault`.

## Alternatives rejected

- **Rely on Obsidian's report alone** (fix only the pattern). It cannot be
  made to cover the plainly missing note without calling Obsidian first, and
  the probe showed the CLI may act in whichever vault is open. Checking the
  file under the vault root the registry resolves removes that dependency
  for the common case.
- **Fail on the pre-call `readFile` `ENOENT` instead of the `stat`**
  (research D1). Inline calls skip that read since PR #104, so inline mode
  would not be covered.
- **A new, separate existence check** (research D1). The `stat` already is
  one, and already brackets the size change.
- **A builder private to `prepend/handler.ts`** (research D3, the plan's
  choice). The plan kept it there because touching `append_note` was out of
  scope. PR #105's code-quality review argued the PR out of it: parity with
  `append_note` then held only because a test compared the two handlers'
  output. Moving the builder beside `mapFsWriteError` makes the shape one
  definition for every handler that reports it, at the cost of touching
  `append_note` and `patch_block` (byte-identical output, pinned by a direct
  test in `src/tools/_fs-errors.test.ts`).
- **Pick one `vault` policy in the builder.** It would change `append_note`'s
  or `patch_block`'s active-mode output, which spec 077 keeps out of scope.
- **Require the quoted path to equal `relPath`; remove the placeholder
  patterns** (research D2). The first couples the classifier to Obsidian's
  echo format and prevents no failure; the second would change how outputs
  the placeholders match today are reported.

## Consequences

- A missing note fails before Obsidian is called, so Obsidian is never asked
  to act on a note the wrapper knows is absent, and a missing-note call
  cannot reach another vault through the CLI's open-vault routing.
- `prepend`'s failure matches `append_note`'s field by field in specific
  mode. In active mode `prepend` echoes the focused vault's name,
  `append_note` `null` and `patch_block` `"<focused>"`; aligning them is a
  separate item (plan Follow-ups).
- A note removed between the `stat` and the default-mode `readFile` still
  goes to Obsidian, and is reported from Obsidian's line. Mapping that
  `readFile` `ENOENT` straight to `NOTE_NOT_FOUND` was left for the owner in
  commit `cdbd8af`, because research D1 and FR-001b keep today's behaviour.
- The four placeholder patterns remain unconfirmed against any real
  Obsidian output. Replacing them is its own item.
- A test that asserted success for a stat `ENOENT` (research F5) encoded an
  outcome Obsidian never produces; PR #105 removed it, and the race test now
  uses Obsidian's real line instead of an invented one.
