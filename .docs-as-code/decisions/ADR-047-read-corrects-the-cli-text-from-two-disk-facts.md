# ADR-047 — Read corrects the CLI's text from two disk facts

- **Status:** Accepted
- **Date:** 2026-10-31
- **Source:** PR #102 (BI-0115, `specs/074-return-exact-content/`, research
  F2 and D1 to D5, live check T023), commits `90ff2e7` and `57b17af`
- **Related:** ADR-009 (Direct Filesystem Write Path Alongside CLI Bridge),
  whose vault registry this decision reuses and whose last-write-wins it
  accepts for the race between the two reads; ADR-015 (Sub-Discriminators via
  details.reason for Multi-State Error Codes), whose existing `reason: "read"`
  value on `FS_WRITE_FAILED` the new failure reuses;
  [ADR-044](ADR-044-file-path-tools-check-the-resolved-file-and-keep-its-type.md)
  (File-Path Tools Check the Resolved File and Keep Its Type), which kept the
  vault registry out of what the CLI-pass-through tools forward

## Context

`read` returned `obsidian read`'s stdout as `{ content }`. A plan-time live
probe against 14 byte fixtures (research F2) showed that stdout is not the
file:

- the CLI appends `\n` when the file does not end with one (`first` →
  `"first\n"`, `a␍` → `"a\r\n"`);
- it removes one leading UTF-8 byte-order mark (`BOM a` → `"a\n"`).

`docs/tools/read.md` documented the first as a caveat and wrongly claimed "no
BOM strip". Spec 074 FR-001 asks for nothing added and nothing removed, and
User Story 4 asks that reading a note and writing the text back with the write
tools leaves it unchanged. The CLI's two changes broke both.

## Decision

1. **Keep the CLI read as it is.** Same argv, same failures, same output cap,
   timeout, cancellation and closed-vault auto-open. Every failure the CLI
   raises is raised exactly as before, before the disk is touched.
2. **Then take two one-bit facts from the file's bytes on disk** — the bytes
   start with `EF BB BF`; the last byte is `0x0A` — and undo the CLI's two
   changes: drop the final `\n` from stdout when the file has no final line
   feed, and put U+FEFF back when it had a byte-order mark. The result is
   built from stdout only. This is `exactContent(stdout, disk)` in
   `src/tools/read/handler.ts`.
3. **The vault root** comes from the focused-file `eval`'s `base` in active
   mode (`FileTarget.vaultRoot`) and from `vaultRegistry.resolveVaultPath`
   in specific mode, called **after** the CLI read, so an unknown vault still
   fails at the CLI.
4. **A failed disk read is `FS_WRITE_FAILED` with
   `details.reason: "read"`**, the shape `find_and_replace` already used. It
   never falls back to the uncorrected stdout.

## Alternatives rejected

- **Return the disk text and use the CLI call only as a gate.** Exact by
  construction, but the returned bytes would come from a path the server
  joined itself. That needs `realpath` containment (constitution Security
  Defaults), and containment would reject reads that succeed today, such as a
  symlinked note — breaking spec 074 SC-005, which keeps every existing
  success and failure.
- **Replace the CLI read with a direct filesystem read.** Every failure would
  change (`CLI_NON_ZERO_EXIT` / `CLI_REPORTED_ERROR` would become filesystem
  errors), the output cap and closed-vault auto-open would be lost, and
  containment would again be needed.
- **An extra `obsidian eval` returning `app.vault.read(file)`.** One more CLI
  spawn on the most-used tool, and Obsidian's decoder removes the byte-order
  mark too; it is the likely source of the second change.
- **Strip any final `\n`.** Loses real content: a file that does end with a
  line break would lose it.
- **Strip the added `\n` and leave the byte-order mark removed.** Breaks
  FR-001 and carries the false "no BOM strip" claim forward.
- **Resolve the root with `resolveFsTarget`**, the direct-filesystem tools'
  locator. It asks the registry first, which turns an unknown vault into the
  registry's `VALIDATION_ERROR` before the CLI runs — a changed failure.
- **A new `FS_READ_FAILED` code** for the disk read. It would add a
  top-level code (constitution Principle IV).

## Consequences

- `read`'s result is exact for notes, canvases and bases in all three locator
  modes, and the round trip with `write_note`, `append_note`, `prepend`,
  `patch_heading`, `patch_block`, `set_property` and a single-note
  `find_and_replace` commit matched the disk bytes at every step in PR #102's
  live check.
- Because no disk content reaches the result, `read` needs no containment
  check, and the security reasoning for it is unchanged: it cannot disclose
  anything the CLI did not already return.
- `read` gains one failure that did not exist before, after a successful CLI
  read. Its code says "write" on a read-only tool; that is the price of
  adding no code.
- A write between the two reads can change the facts; the outcome is
  ADR-009's last-write-wins, and no locking was added.
- Specific-mode `read` now depends on the vault registry, and `createServer`
  injects it into `createReadTool`.
- The correction is tied to what the CLI does today. If a future CLI stops
  appending `\n` or stops dropping the mark, the rules are no-ops rather than
  wrong: a stdout with no final `\n` is left alone, and a mark is only added
  when the disk has one. A CLI that kept the mark *and* the server adding it
  again would double it; the byte-table tests in
  `src/tools/read/handler.test.ts` pin today's behaviour, not the CLI's.
- `read_heading`, `read_property` and the search tools were not corrected and
  may show the same CLI changes. `obsidian_exec` running `read` keeps the raw
  output by design.
