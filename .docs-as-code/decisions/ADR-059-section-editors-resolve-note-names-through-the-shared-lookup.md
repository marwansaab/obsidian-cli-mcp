# ADR-059 — The section editors resolve note names through the shared lookup, and pass its not-found failure through

- **Status:** Accepted
- **Date:** 2026-11-02
- **Source:** PR #122 (`specs/089-resolve-note-names/`, BI-0171,
  FR-001 to FR-012, Clarifications Q1 and Q2, research F1, F7, F9 to F12
  and D1 to D3), commits `7384cda` (the handler switch) and `f69c5f6` (the
  PR #122 code-quality review's shared test rows)
- **Related:** ADR-044 (File-Path Tools Check the Resolved File and Keep Its
  Type), which introduced `resolveFsTarget` for `append_note` and `prepend`;
  ADR-009 (Direct Filesystem Write Path Alongside CLI Bridge), whose write
  path runs unchanged on the resolved path; ADR-015 (Sub-Discriminators via
  details.reason for Multi-State Error Codes), under which no new sub-code
  was added.

## Context

`patch_heading` and `patch_block` publish the shared `file` description, a
note name "resolved like a wikilink". Each handler had its own
`resolveLocator`, which used `file` as a literal path from the vault root
(research F1). A note in a sub-folder could not be edited by its bare name,
a root note needed its `.md`, and a missing name failed as a filesystem
error. `append_note` and `prepend` already resolved a name through
`resolveFsTarget` in `src/tools/_file-target.ts`, which asks Obsidian with
`obsidian file` — the lookup the reading tools rely on (F10 to F12).

## Decision

1. **Both editors call `resolveFsTarget`.** Their `resolveLocator` copies are
   deleted. The registry still resolves the vault first, then a `file` name
   goes through the `obsidian file` TSV lookup before any filesystem access.
   `path` and active mode behave exactly as before. `patch_block` is in
   scope because it shares the defect (Clarification Q1, option B).
2. **The unmatched-name failure passes through unchanged** (Clarification
   Q2, option A). A name that matches no note gives `CLI_REPORTED_ERROR`
   whose message is Obsidian's `Error: File "<name>" not found.`, with no
   `details.code` — what `read`, `append_note` and `prepend` return for the
   same name (F7, F11). No new code, mapping or sub-code.
3. **Ambiguity is Obsidian's.** A name two notes share edits the note the
   lookup returns, which is the note `read` picks (F12). No ambiguous-name
   error.
4. **No file-type check is added** (research D2; spec 070 FR-013 kept the
   editors out of the type check, and adding it is its own item).

## Alternatives rejected

- **Convert the miss to `NOTE_NOT_FOUND` in the editors only**
  (Clarification Q2, option B). The editors would then disagree with `read`,
  `append_note` and `prepend` for the same name.
- **Return `NOTE_NOT_FOUND` from the shared resolver** (option C). It would
  change the published errors of every tool that looks up a name — `read`,
  `rename`, `move`, `outline`, `append_note`, `prepend`, `find_and_replace` —
  which is outside BI-0171.
- **Fall back to the literal path when the lookup fails.** It hides a
  failure, which constitution Principle IV forbids, and would edit a
  different note from the one `read` reads whenever both exist.
- **Fix each editor's `resolveLocator` in place.** Two more copies of the
  logic `resolveFsTarget` already holds; the copies drifting apart is how
  the defect arose.
- **One test suite for both editors.** Constitution Principle II and
  research §T keep a co-located suite per tool. The PR #122 review instead
  moved the shared rows into `src/tools/_note-name-locator-cases.ts`, which
  each editor's suite calls with its own subject.

## Consequences

- A `file` call to either editor costs one more Obsidian call; `path` calls
  cost nothing extra.
- The editors' missing-note failure now depends on the locator: a `file`
  name gives the resolver's `CLI_REPORTED_ERROR` with no `details.code`; a
  missing `path` still gives `NOTE_NOT_FOUND` in `patch_block` and
  `FS_WRITE_FAILED` in `patch_heading`, whose description lists a
  `NOTE_NOT_FOUND` it never throws (F9). Aligning them changes a published
  error and is a recorded follow-up.
- The descriptions, schemas, annotations and `_register-baseline.json` did
  not move; the shared `file` description became true.
- `resolveFsTarget` is now the locator for every direct-filesystem single-note
  editor except `write_note`.
