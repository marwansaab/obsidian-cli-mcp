# Bug Assessment: write_note resolves a note name only at the vault root

- **Slug**: bi-0176
- **Created**: 2026-11-03
- **Source**: pasted text (backlog item BI-0176, filed 2026-11-02 from the 0.9.0-local test run)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

Condensed from the pasted BI-0176 text.

**Impact.** `write_note`'s `file` parameter description says the name is "resolved like a wikilink", but for a write the tool resolves the name only at the vault root (its help documents root resolution for new notes). With `overwrite: true`, an existing note in a sub-folder is therefore not found, and the tool silently creates a second note at the root and reports success (`created: true`). The caller believes it replaced the note, the original stays stale, and a duplicate carrying the same frontmatter `id` breaks ID-indexed Bases and lookups. The behaviour also disagrees with `read`, and, since BI-0171 (spec 089, PR #122), with `patch_heading` and `patch_block`, which resolve a bare name vault-wide.

**Secondary.** On a transient file lock, `write_note` returns `FS_WRITE_FAILED` (EPERM) with absolute disk paths in `message` and `details.path`. The sibling fs-direct writers (`append_note`, `prepend`, `patch_heading`, `patch_block`) report the same condition as `EXTERNAL_EDITOR_CONFLICT` with vault-relative detail. The absolute path leaks machine layout, and the different code defeats a caller's shared retry rule.

**Evidence.** Observed on `@marwansaab/obsidian-cli-mcp@0.9.0-local` built from `main`, in `My-Setup-Vault`: `write_note` with `target_mode: "specific"`, `file: "<note name>"` and `overwrite: true`, aimed at existing test-case notes in the `Obsidian CLI MCP - Test Cases` sub-folder, returned `created: true` and wrote a new note of the same name at the vault root. Three stray root copies resulted (the names of TC-00299, TC-00300 and TC-00302), each with a duplicate test-case id. They were trashed and the intended notes rewritten by `path`.

**Expected behaviour (from the report's acceptance criteria).**

- A note "Alpha" that exists only in a sub-folder, replaced by name with `overwrite: true`: that note's content is replaced, the response reports a replacement (`created: false`), and no note appears at the vault root. Reading "Alpha" by name afterwards returns the new content.
- A name "Beta" that matches no note anywhere: a new note is created where the documentation says, and the response reports a new note.
- A name two notes share: the note replaced is the one reading by that name returns, or the call fails with a clear ambiguity error, and the documentation says which.
- A briefly locked target: the error code matches the one the other writing tools return, and the error carries no absolute disk path.

**Out of scope (from the report).** Writing by full path; appending, prepending or patching; automatic retries; how `bytes_written` is reported.

## Symptom

`write_note` in specific mode with a `file` name turns the name into `<name>.md` at the vault root without asking Obsidian where a note of that name lives. When the note lives in a sub-folder, `overwrite: true` writes a new root note and returns `created: true` instead of replacing the existing note, which is what reading by the same name would address. Separately, every non-`EEXIST` filesystem failure, including a Windows sharing-violation `EPERM` on the atomic rename, comes back as `FS_WRITE_FAILED` with the OS's absolute path in `message` and `details.path`, where the sibling writers return `CLI_REPORTED_ERROR` / `details.code: "EXTERNAL_EDITOR_CONFLICT"` with the vault-relative path.

## Reproduction

1. In a test vault, create `Sub/Alpha.md` with some content and make sure no `Alpha.md` exists at the vault root.
2. Call `write_note` with `target_mode: "specific"`, `vault: "<test vault>"`, `file: "Alpha"`, `content: "new"`, `overwrite: true`.
3. Observe `{ created: true, path: "Alpha.md", ... }`; `Alpha.md` now exists at the vault root and `Sub/Alpha.md` is unchanged.
4. Call `read` with `file: "Alpha"`: which of the two notes it returns now depends on Obsidian's link resolution, but before step 2 it returned `Sub/Alpha.md`.

Lock variant (Windows, the TC-00412 lock harness):

1. In PowerShell, hold the note open without delete sharing: `$f = [System.IO.File]::Open("<abs path to Sub/Alpha.md>", [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::ReadWrite)` (no `FileShare.Delete`).
2. Call `write_note` with `path: "Sub/Alpha.md"`, `overwrite: true`.
3. Observe `FS_WRITE_FAILED`, `details.errno: "EPERM"`, `details.syscall: "rename"`, and an absolute disk path in `details.path` and `message`.
4. Release the lock with `$f.Close()`.

Resolved (Relay): The reporter's program and timing are not needed, and the fix does not wait for them. TC-00412 shows that a PowerShell handle opened without `FileShare.Delete` produces `EPERM` on the rename every time, so the lock reproduces deterministically; Notepad-style editors do not lock the file. The regression gate is an in-process test that injects `EPERM` and `EBUSY` from the fs double's `rename`. The live probe above runs during `/speckit-bug-test` (see *Tests to add or update*).

## Suspected Code Paths

- `src/tools/write_note/handler.ts:62` `isCanonicalShortForm()` and `:75` `resolveSpecificModePath()`: the whole of specific-mode name resolution. A canonical `file` becomes `${file}.md` (vault root), anything else passes through verbatim. No `obsidian file` lookup is made, unlike every other file-locator tool.
- `src/tools/write_note/handler.ts:139-150`: with `overwrite: true`, a `stat` ENOENT at the root path is read as "the note does not exist", so `sizeBefore` stays `null` and the response reports `created: true`. This is where the wrong resolution turns into a false success.
- `src/tools/write_note/handler.ts:156-168`: with `overwrite: false`, the `wx` create at the root also succeeds when the name exists in a sub-folder, so the same duplicate appears without `overwrite`.
- `src/tools/write_note/handler.ts:81` `mapFsError()`: maps every non-`EEXIST` errno to `FS_WRITE_FAILED` and copies the raw `ErrnoException.path` (absolute) into `details.path` and the message. It has no editor-conflict branch.
- `src/tools/write_note/schema.ts:25`: the `file` description is `TARGET_MODE_FILE_DESCRIPTION` ("Note name, resolved like a wikilink", `src/target-mode/target-mode.ts:9`) plus "For a new note, the name is created at the vault root." The first half promises the lookup the handler does not make.
- `docs/tools/write_note.md:47`, `:53`, `:153`: the help page documents the root-only short-form rule and the `FS_WRITE_FAILED` row for EACCES / EPERM.
- For comparison, the sibling behaviour the fix should match:
  - `src/tools/_file-target.ts:40` `specificRelPath()` / `:75` `resolveFsTarget()`: registry `resolveVaultPath` first, then `resolveFileByTsv` (`src/tools/_active-file.ts:242`, one `obsidian file file=<name>` spawn returning the `path\t` line). Used by `append_note`, `prepend`, `patch_heading`, `patch_block`.
  - `src/tools/_fs-errors.ts:49` `mapFsWriteError()`: conflict errnos → `CLI_REPORTED_ERROR` with `details: { code: "EXTERNAL_EDITOR_CONFLICT", reason: "file-locked", path: <relPath>, errno }`; everything else → `FS_WRITE_FAILED` with `details.path` = the vault-relative path. Conflict sets: `append_note` and `patch_heading` `{EBUSY, EPERM, EACCES}`, `patch_block` `{EBUSY, EPERM}`.

## Root Cause Hypothesis

`write_note` was built (spec 020, ADR-009) with its own literal short-form rule for `file` and never adopted the shared wikilink resolver that the other direct-fs tools use. Spec 089 (BI-0171) moved `patch_heading` and `patch_block` onto `resolveFsTarget` but left `write_note` alone, so it is now the only `file`-accepting tool that does not ask Obsidian where the name points, even though it publishes the same "resolved like a wikilink" description. A name in a sub-folder therefore maps to a root path that does not exist, and the overwrite branch reads the `stat` ENOENT as "new note". The secondary defect has a separate cause: `write_note` kept its own `mapFsError` (refactor-decisions: "write_note (FILE_EXISTS, no editor-conflict) … keep their own mappers") when the cohort's mapping was centralised in `_fs-errors.ts`, so it has no conflict classification and echoes the OS path. Confidence: high. Both causes are visible directly in the handler, and spec 089 research F7 and F12 record the CLI behaviour the fix relies on (an unmatched name prints `Error: File "<name>" not found.` with exit 0; a shared name resolves to the same note `read` picks).

## Proposed Remediation

**Preferred**: Resolve a specific-mode `file` through the same `obsidian file` lookup the siblings use, and fall back to today's documented root rule only when Obsidian reports that no note has that name.

1. In `executeWriteNote`'s specific-mode branch, keep `deps.vaultRegistry.resolveVaultPath(input.vault!)` first (refactor-decisions item 32: an unknown vault fails before any spawn). When `input.file` is given, call `resolveFileByTsv(deps, input.vault!, input.file, "write_note")`:
   - a `path\t` line → that vault-relative path is `relPath`. The rest of the pipeline (type check, canonical-path check, `stat`, atomic write or `wx` create, cache refresh, open) runs unchanged on it, so `created` is `false` for an existing note and `path` reports the resolved note.
   - `CLI_REPORTED_ERROR` whose `details.message` is Obsidian's not-found line (`/^\s*Error: File ".*" not found\.\s*$/m`, the pattern `prepend` already matches for the same output) → no note has that name; `relPath` = `resolveSpecificModePath(input)` as today (root `<name>.md` for a canonical name, verbatim otherwise).
   - any other failure (app down, `file-tsv-parse`, etc.) propagates unchanged; nothing is written.
   `input.path` and active mode are untouched (no new spawn on those paths). A small local helper in `write_note/handler.ts` keeps `resolveFileByTsv` itself unchanged, so `find_and_replace` and `_file-target.ts` see no difference.
2. A name two notes share resolves to the note Obsidian's `file` command picks, which spec 089 research F12 showed is the note `read` picks. No ambiguity error is added; the docs say "a name two notes share resolves to the same note `read` picks", the wording already used for `patch_heading` / `patch_block`.
3. Replace `mapFsError`'s non-`EEXIST` branch with `mapFsWriteError(e, { relPath, conflictErrnos, conflictVerb: "write" })` from `_fs-errors.ts`, keeping the existing `EEXIST → FILE_EXISTS` branch and its test-pinned `{ errno }`-only details as they are. This gives `CLI_REPORTED_ERROR` / `details.code: "EXTERNAL_EDITOR_CONFLICT"` for a lock and a vault-relative `details.path` (no `fsPath`) for every other `FS_WRITE_FAILED`, the same as `append_note`. Use the conflict set `{EBUSY, EPERM}` (the errno observed, and `patch_block`'s set), which leaves the existing "EACCES on writeFile → FS_WRITE_FAILED" test and the help page's EACCES-as-permissions guidance true (settled in Open Questions, Q1).
4. Update the published text: the `file` description in `write_note/schema.ts` ("Note name, resolved like a wikilink … An existing note of that name is the one written, wherever it is; a name no note has is created at the vault root"), `docs/tools/write_note.md` (parameter row, the short-form section, the error table with the new `EXTERNAL_EDITOR_CONFLICT` row and the vault-relative `details.path`), and the typed-errors list if `WRITE_NOTE_DESCRIPTION` gains one. Regenerate `src/tools/_register-baseline.json` deliberately, since the descriptor fingerprint changes.

**Alternatives**:
- *Move `write_note` onto `resolveFsTarget` and catch its not-found failure.* Same spawn and same order, but `resolveFsTarget` also returns `vaultDisplayName` and takes the active branch through `resolveActiveLocatorWithVault`, which `write_note` deliberately does not use (its output has no `vault` field; `_active-file.ts:219`). Reasonable if the reviewer prefers one entry point; slightly more surface than the preferred helper.
- *Fail with an ambiguity error when two notes share the name.* Rejected: spec 089 settled that a shared name picks the note `read` picks, and an error here would make `write_note` disagree with `read`, `patch_heading` and `patch_block`, which is the inconsistency this BI removes.
- *Search the vault on disk instead of asking Obsidian.* Rejected: it would reimplement Obsidian's link resolution and could pick a different note than `read`.

**Files likely to change**:
- `src/tools/write_note/handler.ts`
- `src/tools/write_note/schema.ts`
- `src/tools/write_note/index.ts` (only if the description gains the new error)
- `src/tools/write_note/handler.test.ts` (existing `file`-based cases need the extra `obsidian file` spawn response queued; `makeQueuedSpawn` throws on overflow)
- `src/tools/write_note/handler.note-name.test.ts` (new, co-located)
- `src/tools/write_note/_handler-fixtures.ts` (if a TSV response canner is needed; must stay vitest-free)
- `src/tools/_register-baseline.json`
- `docs/tools/write_note.md`

**Tests to add or update**:
- Name in a sub-folder, `overwrite: true`: one `obsidian file` spawn, the write lands on `Sub/Alpha.md`, nothing is written at the root, response `{ created: false, path: "Sub/Alpha.md" }`.
- Name in a sub-folder, `overwrite: false`: `FILE_EXISTS` naming the resolved path, nothing written.
- Name that matches no note (`Error: File "Beta" not found.`): falls back to `Beta.md` at the root, `created: true`; with a folder-qualified or `.md` name, the fallback is today's verbatim rule.
- Lookup failure other than not-found (e.g. a stdout with no `path\t` line): the `CLI_REPORTED_ERROR` propagates, no `mkdir`, no write.
- `path` and active mode: no `obsidian file` spawn (regression guard).
- Unknown vault with `file`: `VAULT_NOT_FOUND` with no spawn (order guard).
- `EPERM` and `EBUSY` injected from the fs double's `rename` (the regression gate for the lock): `CLI_REPORTED_ERROR`, `details.code: "EXTERNAL_EDITOR_CONFLICT"`, `details.path` vault-relative, and no absolute path anywhere in `message` or `details`.
- `ENOSPC` / `EACCES`: still `FS_WRITE_FAILED`, now with the vault-relative `details.path`; the existing `EEXIST` asymmetry test stays green.
- A live T0 probe per `.memory/test-execution-instructions.md` confirming the sub-folder overwrite and the not-found fallback against the authorised test vault.
- A live Windows lock probe during `/speckit-bug-test` (TC-00412 harness), in `TestVault-Obsidian-CLI-MCP`: hold the target note with `[System.IO.File]::Open(<abs path>, Open, ReadWrite, FileShare.ReadWrite)` (no `FileShare.Delete`), call `write_note` with `overwrite: true`, expect the lock envelope with `errno: "EPERM"` and the file byte-identical to before the call, then release with `$f.Close()`. If the run cannot hold the lock itself, record the probe as owner-input; the injected-errno test remains the gate.

## Risks & Considerations

- **Behaviour change for `overwrite: false`.** A name that exists in a sub-folder now returns `FILE_EXISTS` instead of creating a second note at the root (confirmed in Open Questions, Q2). This follows from "the same name means the same note", but a caller that relied on root creation must use `path`. The help page and CHANGELOG must say so.
- **One extra spawn per name-based write, and a dependency on the app.** A `file` write now needs Obsidian to answer the lookup before writing. If Obsidian cannot be reached, the call fails instead of writing; today it writes and only the best-effort cache refresh fails. The siblings already have this dependency.
- **Not-found detection is text-based.** It relies on Obsidian's `Error: File "<name>" not found.` line (captured in spec 089 research, P2). If Obsidian changes that wording, the fallback stops matching and name-based creation of new notes fails with `CLI_REPORTED_ERROR` rather than silently writing somewhere wrong, which is the safe direction.
- **A name that resolves to a non-note file** (e.g. `file: "Plan"` resolving to an attachment) is rejected by the existing `UNSUPPORTED_FILE_TYPE` check on the resolved path, before any write.
- **Error contract changes.** `details.path` for `FS_WRITE_FAILED` becomes vault-relative, and the lock case moves from `FS_WRITE_FAILED` to `CLI_REPORTED_ERROR` / `EXTERNAL_EDITOR_CONFLICT`. Both are deliberate and match the siblings; the CHANGELOG and help page must say so. No new top-level error code is introduced (Constitution Principle IV).
- **Security.** The canonical-path check still runs on the resolved path, so a name Obsidian resolves through a link cannot escape the vault. Removing the absolute path from errors closes a small information leak.
- **Descriptor fingerprint.** The `file` description change moves the published schema; the baseline must be regenerated as a deliberate change.

## CodeGraph structural check

- **Affected modules.** `src/tools/write_note/` (handler, schema, tests, docs). Reused unchanged: `resolveFileByTsv` (`src/tools/_active-file.ts`, also called by `find_and_replace` and `_file-target.ts`), `mapFsWriteError` (`src/tools/_fs-errors.ts`, also called by `append_note`, `patch_block`, `patch_heading`), `resolveSpecificModePath` / `isCanonicalShortForm` (kept as the not-found fallback).
- **Blast radius.** `executeWriteNote` is called only from `createWriteNoteTool` (`src/tools/write_note/index.ts`) and its own tests (`handler.test.ts`, `handler.bytes-written.test.ts`, `handler.file-type.test.ts`). The shared helpers are consumed, not modified, so their other callers see no change. The import direction stays `write_note/handler.ts → _active-file.ts` / `_fs-errors.ts` (sibling tools-level modules, already imported by the handler), so Principle I holds.
- **Kernel nodes.** The fix touches none of them. `createLogger()` and `createQueue()` stay confined to `server.ts`; the handler keeps receiving `logger` and `queue` through `ExecuteDeps`. `UpstreamError` is constructed (through `mapFsWriteError` and the existing `FILE_EXISTS` branch) but not modified, and no code is added to `src/errors.ts`. `createServer()` is not touched.

## Open Questions

- **Q1: conflict errno set for `write_note`.** Options: A `{EBUSY, EPERM}` (recommended); B `{EBUSY, EPERM, EACCES}`, matching `append_note` and `patch_heading`. Resolved (Relay): A. `{EBUSY, EPERM}` covers the observed errno and matches `patch_block`'s set. EACCES stays a permissions failure (`FS_WRITE_FAILED`, now with a vault-relative path), so the existing EACCES test and the help page's EACCES guidance stay unchanged.
- **Q2: `overwrite: false` with a name that exists in a sub-folder.** Options: A return `FILE_EXISTS` for the resolved note and write nothing (recommended); B keep creating a new note at the root and resolve vault-wide only when `overwrite` is true. Resolved (Relay): A. The name resolves to the existing note whatever `overwrite` says, so with `overwrite: false` the `wx` create on the resolved path returns `FILE_EXISTS` and nothing is written. A caller who wants a second note at the root uses `path`.
- **Q3: how to reproduce the transient lock** (the reporter's program and timing were not recorded). Options: A in-process injection only (recommended); B injection plus a live Windows probe; C wait for the reporter. Resolved (Relay): B, corrected: the live probe is deterministic, not timing-sensitive. Gate: inject `EPERM` and `EBUSY` from the fs double's `rename` and assert `CLI_REPORTED_ERROR` / `details.code: "EXTERNAL_EDITOR_CONFLICT"`, a vault-relative `details.path`, and no absolute path in `message` or `details`. Live probe during `/speckit-bug-test`: the TC-00412 harness (PowerShell `[System.IO.File]::Open(<abs path>, Open, ReadWrite, FileShare.ReadWrite)`, no `FileShare.Delete`) in `TestVault-Obsidian-CLI-MCP`, `write_note` with `overwrite: true`, expecting the lock envelope with `errno: "EPERM"` and the file byte-identical to before; release with `$f.Close()`. If the run cannot hold the lock itself, record the probe as owner-input and keep the injected-errno test as the gate. Do not wait for the reporter's details. Rationale: TC-00412 shows that a PowerShell lock without delete sharing produces `EPERM` on the rename every time, and Notepad-style editors do not lock.
