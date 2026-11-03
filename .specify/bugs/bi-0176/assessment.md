# Bug Assessment: write_note writes a bare name at the vault root instead of the existing note

- **Slug**: bi-0176
- **Created**: 2026-11-03
- **Source**: pasted text (backlog item BI-0176, filed 2026-11-02 from the 0.9.0-local test run)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

Condensed from the pasted BI-0176 text:

> `write_note`'s `file` parameter description says the name is "resolved like a wikilink", but for a write the tool resolves the name only at the vault root (its help documents root resolution for new notes). With `overwrite: true`, an existing note in a sub-folder is therefore not found, and the tool silently creates a second note at the root and reports success (`created: true`). Harms: (a) the caller believes it replaced the note, but the original is unchanged and stale; (b) a duplicate with the same frontmatter `id` now exists, breaking ID-indexed Bases and lookups; (c) the behaviour disagrees with sibling tools — `read` and, after BI-0171, `patch_heading` / `patch_block` resolve a bare name vault-wide.
>
> Secondary: the transient-lock failure returns `FS_WRITE_FAILED` with absolute disk paths in the error, whereas the sibling fs-direct writers (`append_note`, `prepend`, `patch_heading`, `patch_block`) classify the same condition as `EXTERNAL_EDITOR_CONFLICT` with vault-relative detail.
>
> Evidence: on `@marwansaab/obsidian-cli-mcp@0.9.0-local` built from `main`, in `My-Setup-Vault`, `write_note` with `target_mode: "specific"`, `file: "<note name>"` and `overwrite: true`, aimed at existing notes in the `Obsidian CLI MCP - Test Cases` sub-folder, returned `created: true` and wrote three stray root copies (TC-00299, TC-00300, TC-00302), each carrying a duplicate test-case id. On a transient Windows lock, `write_note` returned `FS_WRITE_FAILED` (EPERM) with absolute disk paths in `message` and `details.path`.

The report's acceptance criteria (summarised):

1. A note "Alpha" that exists only in a sub-folder, replaced by name with overwrite allowed, is replaced in place; the response reports a replacement; no root note appears; reading "Alpha" afterwards returns the new content.
2. A name that matches no note creates a new note where the documentation says, and the response reports a new note.
3. A name shared by two notes resolves to the note `read` returns for it, or fails with a clear ambiguity error, and the documentation says which.
4. A temporary lock fails with the same error code the other writers return for it, with no absolute disk path in the error.

Out of scope (per the report): writing by `path`; append / prepend / patch; automatic retry; how `bytes_written` is reported.

## Symptom

In specific mode, `write_note` turns a `file` name into `<name>.md` at the vault root without looking the name up, so a note that lives in a sub-folder is never found: the write creates a root duplicate and reports `created: true`, where the field description promises wikilink resolution and the sibling tools resolve the same name to the sub-folder note. Separately, a Windows sharing-violation errno on the write surfaces as `FS_WRITE_FAILED` with the OS's absolute path in `message` and `details.path`, where the sibling direct-fs writers return `CLI_REPORTED_ERROR` + `details.code: "EXTERNAL_EDITOR_CONFLICT"` with a vault-relative `details.path`.

## Reproduction

Primary defect:

1. In a vault, have a note `Sub/Alpha.md` and no `Alpha.md` at the root.
2. Call `write_note` with `{ target_mode: "specific", vault: "<vault>", file: "Alpha", content: "new", overwrite: true }`.
3. Observe `{ created: true, path: "Alpha.md", ... }`; a new `<vault>/Alpha.md` exists and `Sub/Alpha.md` is unchanged. `read` with `file: "Alpha"` still returns the old content of `Sub/Alpha.md` (Obsidian resolves the name; with a root `Alpha.md` now present, which note `read` returns depends on Obsidian's link resolution, so the result may even flip after the stray copy appears).

The same defect also applies with `overwrite: false` (the default): step 2 without `overwrite` creates the root duplicate instead of returning `FILE_EXISTS`, because the `wx` create is aimed at the root path. This follows from the code (see below) and was not in the report.

Secondary defect:

1. Hold `<vault>/Alpha.md` open with a program that takes a Windows sharing lock (or stub `fs.rename` / `fs.writeFile` / `fs.stat` to throw `{ code: "EPERM", syscall: "rename", path: "<abs>" }` in a unit test).
2. Call `write_note` on it.
3. Observe `FS_WRITE_FAILED` with `details.path` = the absolute OS path and the same path in `message`.

Resolved (Relay): which syscall reported the EPERM in the live run (`stat`, `rename` or the `wx` `open`) is not determined and not needed. The BI's Status section and the write_note entry in Tool Notes record only "`FS_WRITE_FAILED` (EPERM) with absolute disk paths in `message` and `details.path`", and the acceptance criterion concerns the error code and the absent absolute path, not the syscall. Every fs failure in the handler goes through the same mapper, so the fix and its tests cover all syscalls alike.

## Suspected Code Paths

- `src/tools/write_note/handler.ts:75` `resolveSpecificModePath()` — the root cause of the primary defect. `input.file` becomes `${file}.md` (canonical short form) or passes through verbatim; there is no lookup of the name, so the target is always vault-root-relative. Comment at line 72–74 documents this as the intended rule (FR-001 / R1 of an earlier spec).
- `src/tools/write_note/handler.ts:113-118` `executeWriteNote()` — specific mode calls `resolveVaultPath` then `resolveSpecificModePath`; it does not use the shared `resolveFsTarget` (`src/tools/_file-target.ts:75`) that `append_note`, `prepend`, `patch_block` and `patch_heading` use.
- `src/tools/write_note/handler.ts:181-185` — `created: sizeBefore === null` is computed from a `stat` of the root path, so a miss at the root reports `created: true` truthfully for that path; the lie is in the target, not in the flag.
- `src/tools/write_note/handler.ts:81` `mapFsError()` — root cause of the secondary defect. Every errno other than `EEXIST` becomes `FS_WRITE_FAILED` with `details.path` = the raw `ErrnoException.path` (absolute) and the same path in `message`. There is no editor-conflict branch.
- `src/tools/write_note/schema.ts:25` — the `file` description is `TARGET_MODE_FILE_DESCRIPTION` ("Note name, resolved like a wikilink …", `src/target-mode/target-mode.ts:9`) plus "For a new note, the name is created at the vault root." The first half is what the handler does not do.
- `docs/tools/write_note.md` — the `file` row ("Vault-root note name …"), the *Canonical short-form `file` resolution* paragraph, the *File types* table and the `FS_WRITE_FAILED` error row describe the current root-only rule and the EPERM/EACCES → `FS_WRITE_FAILED` mapping.
- Reference implementations of the expected behaviour:
  - `src/tools/_file-target.ts:75` `resolveFsTarget()` and `src/tools/_active-file.ts:242` `resolveFileByTsv()` — the one-spawn `obsidian file file=<name>` lookup; a miss surfaces from the dispatch layer as `CLI_REPORTED_ERROR` with `details.message: 'Error: File "<name>" not found.'` (spec 089 contract §E, row N4 in `src/tools/_note-name-locator-cases.ts:129`).
  - `src/tools/_fs-errors.ts:49` `mapFsWriteError()` — the cohort mapper: errno in `conflictErrnos` → `CLI_REPORTED_ERROR` + `details: { code: "EXTERNAL_EDITOR_CONFLICT", reason: "file-locked", path: <relPath>, errno }`; otherwise `FS_WRITE_FAILED` with `details.path = relPath`. `append_note` and `patch_heading` pass `{EBUSY, EPERM, EACCES}`; `patch_block` passes `{EBUSY, EPERM}`.
  - `src/tools/prepend/handler.ts:53-59` — the confirmed missing-note pattern `/^\s*Error: File ".*" not found\.\s*$/m`.

## Root Cause Hypothesis

High confidence. `write_note` predates the cohort's move to wikilink resolution of `file`: its specific-mode path rule (`resolveSpecificModePath`) is a purely lexical vault-root rule, and when spec 089 (BI-0171) moved `patch_heading` / `patch_block` onto `resolveFsTarget`, `write_note` was left out because it is the one tool in the cohort that must also create notes that do not exist yet — `resolveFsTarget` fails on a miss, which is right for an editor but wrong for a creator. The field description, which is shared text from `target-mode.ts`, already promised wikilink resolution, so the published contract and the handler disagree. The lock defect has the same origin: `write_note` kept its own `mapFsError` (it needed the `EEXIST → FILE_EXISTS` branch) when the other writers were consolidated onto `mapFsWriteError` in `_fs-errors.ts`, and the private mapper never gained the editor-conflict branch or the vault-relative path.

## Proposed Remediation

**Preferred**: resolve a `file` name the way the sibling tools do, and fall back to today's root rule only when Obsidian reports that the name matches no note.

In `executeWriteNote`'s specific branch, when `input.file` is given (never for `path`, never in active mode), call `resolveFileByTsv(deps, input.vault, input.file, "write_note")` after `resolveVaultPath` (keep the registry first, so an unknown vault still costs no spawn — refactor-decisions item 32). On success, the returned vault-relative path is the target: the write, `created`, `path`, the metadata refresh and `open` all use it, so "Alpha" in `Sub/` is replaced in place and the response reports `created: false`, `path: "Sub/Alpha.md"`. When the lookup fails with `CLI_REPORTED_ERROR` whose message matches Obsidian's missing-file line (`Error: File "<name>" not found.` — the same pattern `prepend` already relies on), fall back to the current `resolveSpecificModePath` rule unchanged, so a new name is still created at the vault root as documented. Any other lookup failure (TSV parse, CLI error, timeout) propagates unchanged; a write must not guess its target. Ambiguity needs no new code: `obsidian file` resolves a shared name exactly as `read` does (spec 089 live check L5), so the documented answer to acceptance criterion 3 is "the note `read` returns for that name", not an ambiguity error. With the lookup in place, `overwrite: false` against a sub-folder note correctly returns `FILE_EXISTS` at the resolved path.

For the lock, replace `mapFsError`'s generic branch with `mapFsWriteError(e, { relPath, conflictErrnos: new Set(["EBUSY", "EPERM"]), conflictVerb: "write" })`, keeping `write_note`'s `EEXIST → FILE_EXISTS` branch in front of it (its `details` shape is test-pinned per refactor-decisions). This gives `CLI_REPORTED_ERROR` + `details.code: "EXTERNAL_EDITOR_CONFLICT"`, `reason: "file-locked"`, vault-relative `details.path` for `EBUSY` and `EPERM`, and a vault-relative `FS_WRITE_FAILED` for every other errno, `EACCES` included. No new error code (Principle IV): `EXTERNAL_EDITOR_CONFLICT` is an existing `details.code` under the existing `CLI_REPORTED_ERROR`. The errno set is `patch_block`'s `{EBUSY, EPERM}` — the errnos every sibling treats as a lock — and not the `{EBUSY, EPERM, EACCES}` of `append_note` / `patch_heading`, because ADR-009 Decision point 7 names `EACCES` as a generic fs failure that must surface as `FS_WRITE_FAILED`, and the write_note feature page routes OS-reserved names (`CON.md` and similar, typically `EACCES`) to `FS_WRITE_FAILED` (see Open Questions, resolved).

Update the published `file` description (drop or reword "For a new note, the name is created at the vault root." into "A name that matches no note is created at the vault root.") and the help page: the `file` row, the short-form paragraph (it now applies only to a name that matches no note), the *File types* table, the success-envelope `path` row (it is the resolved path, not an echo), and the error roster (new `EXTERNAL_EDITOR_CONFLICT` row for `EBUSY` / `EPERM`; EPERM removed from the generic `FS_WRITE_FAILED` row, which keeps `EACCES`; `details.path` now vault-relative). The description change moves the registered-tool fingerprint baseline (`src/tools/_register-baseline.json`), which is the constitution's deliberate-change gate; regenerate it in the same change.

**Alternatives**:
- *Fail on a miss instead of creating at the root* (make `write_note` use `resolveFsTarget` as is). Simplest code and fully consistent with the editors, but it breaks the documented, widely used "create by name" path; new notes would need `path`. Rejected: acceptance criterion 2 wants a predictable, documented create-by-name.
- *Disk scan instead of the CLI lookup* (walk the vault for `<name>.md`). No spawn, but it re-implements Obsidian's link resolution (shortest-path / same-folder preference, case rules, aliases are not names) and can disagree with `read` on a shared name — exactly the inconsistency the report is about. Rejected.
- *Keep the root rule and fix the description only.* Makes the contract honest but leaves the silent-duplicate hazard and the cross-tool inconsistency. Rejected.

**Files likely to change**:
- `src/tools/write_note/handler.ts` — name lookup with miss fallback; error mapping via `mapFsWriteError`; header comment.
- `src/tools/write_note/schema.ts` — `file` description wording.
- `src/tools/write_note/index.ts` — only if the tool description should mention name resolution / the conflict error (optional).
- `src/tools/_register-baseline.json` — regenerated for the description change.
- `src/tools/write_note/handler.test.ts`, `src/tools/write_note/handler.file-type.test.ts` — existing `file:`-based cases now issue one `file` lookup spawn before the write; they need a queued TSV or not-found response.
- New `src/tools/write_note/handler.note-name.test.ts` (co-located, Principle II).
- `src/tools/write_note/_handler-fixtures.ts` — a not-found canned response if the fixture lacks one.
- `docs/tools/write_note.md`; `CHANGELOG.md` (`Fixed` entry).

**Tests to add or update**:
- Name in a sub-folder, `overwrite: true`: one `file` spawn with `file=Alpha`; the write targets `Sub/Alpha.md`; `created: false`; `path: "Sub/Alpha.md"`; no write or rename at the root; metadata refresh names `Sub/Alpha.md`.
- Name in a sub-folder, `overwrite: false`: `FILE_EXISTS` with `details.path: "Sub/Alpha.md"`; nothing written.
- Name at the root (boundary): resolves to `Alpha.md`, same outcome as today.
- Name not found (`Error: File "Beta" not found.` on exit 0): falls back to `Beta.md` at the root, `created: true`; the short-form cases (`"n.md"`, `"version_1.2.3"`) still resolve as today on a miss.
- Lookup failure other than not-found (TSV without a `path` line, CLI error): propagates; nothing written.
- `path` input and active mode: no `file` lookup spawn (spawn-count assertions).
- Unknown vault: registry error before any spawn.
- File-type: a name that resolves to a non-note (e.g. a canvas) is rejected `UNSUPPORTED_FILE_TYPE` before any write; `"Plan.canvas"` not found still rejected.
- Lock: `rename` / `writeFile` / `stat` / `mkdir` throwing `EPERM` and `EBUSY` with an absolute `path` → `CLI_REPORTED_ERROR`, `details.code: "EXTERNAL_EDITOR_CONFLICT"`, `reason: "file-locked"`, `details.path` vault-relative; the absolute path appears nowhere in `message` or `details`.
- Not a lock: `EACCES` (boundary, ADR-009 Decision point 7) and another errno (e.g. `ENOSPC`) with an absolute `path` → `FS_WRITE_FAILED` with a vault-relative `details.path`; the absolute path appears nowhere in `message` or `details`.
- Consider reusing the shared `describeNoteNameLocator` battery (`src/tools/_note-name-locator-cases.ts`) for the rows that apply; its N4 row (not found → error) does not apply to `write_note`, so either parameterise the miss expectation or write the write_note-specific rows directly.
- Live check (per `.memory/test-execution-instructions.md`): replace a sub-folder note by bare name in the authorised test vault; confirm in-place replacement, no root copy, and `read` by name returns the new content.

## Risks & Considerations

- **Behaviour change for existing callers.** A caller that relied on "a bare name always writes at the root" will now overwrite (or get `FILE_EXISTS` for) a same-named note elsewhere in the vault. That reliance contradicts the published `file` description, but it is a change in what gets written; record it in the CHANGELOG under `Fixed` with an explicit note.
- **`created` / `path` semantics shift.** `path` stops echoing the input for a name that resolves elsewhere; the docs' "echoes the input verbatim" wording must change.
- **One extra CLI spawn per name-based write** (the `obsidian file` lookup), and a dependence on Obsidian running for that lookup (the vault registry already requires it, so no new availability dependency). User content still never crosses argv (FR-005 / SC-007 unaffected: only the name does).
- **Miss detection relies on Obsidian's stdout text** (`Error: File "<name>" not found.`). It is the same confirmed signal `prepend` and the spec 089 contract use; a future Obsidian wording change would turn the create-by-name path into a propagated `CLI_REPORTED_ERROR` (fails loudly, never writes to the wrong place). Match it with one shared pattern rather than a new copy if practical.
- **Residual race.** A note moved or deleted between the lookup and the write is written at its old resolved path (re-creating it there). Same residual window the editors accept; out of scope.
- **Folder-qualified names.** `file: "Folder/Note"` is today rejected `UNSUPPORTED_FILE_TYPE`; with the lookup it will resolve to `Folder/Note.md` when that note exists (matching `read` and the editors, spec 089 row N3), and stay rejected on a miss. The *File types* table needs that nuance.
- **Error-contract change on the lock path.** Callers matching `FS_WRITE_FAILED` + `errno: "EPERM"` or `"EBUSY"` for `write_note` will now see `CLI_REPORTED_ERROR` / `EXTERNAL_EDITOR_CONFLICT`. Intended by the report (shared retry logic), but it is a published-contract change; document it. `EACCES` stays `FS_WRITE_FAILED` (ADR-009 Decision point 7); only its `details.path` and `message` become vault-relative.
- **Security.** Removing the absolute path from `message` / `details` closes a minor machine-layout leak. The resolved path still passes `assertCanonicalPath` (Layer 2), so a name that resolves through a link outside the vault is still refused.
- **Fingerprint baseline.** The schema description change requires a deliberate regeneration of `_register-baseline.json`; the constitution treats that as a reviewed change, not drift.

## CodeGraph structural check

Queried with `codegraph_explore` on `executeWriteNote`, `resolveSpecificModePath`, `mapFsError`, `WRITE_NOTE_DESCRIPTION`, `resolveFsTarget`, `resolveFileByTsv`, `mapFsWriteError`, `assertCanonicalPath`, `TARGET_MODE_FILE_DESCRIPTION`, `executePatchHeading`, and the kernel nodes.

- **Affected module**: `src/tools/write_note/` only (handler, schema, tests), plus the generated `src/tools/_register-baseline.json` and docs. `executeWriteNote` has one production caller, `createWriteNoteTool` (`src/tools/write_note/index.ts`), registered from the boot spine; its other dependents are the write_note test suites and the cross-tool suites `_plugin-noise.test.ts` (lists `write_note` among best-effort writers) and `_file-type-support.test.ts` (imports `WRITE_NOTE_SUPPORTED` / `WRITE_NOTE_DESCRIPTION`).
- **Shared helpers consumed, not changed**: `resolveFileByTsv` (`src/tools/_active-file.ts`; also used by `_file-target.ts` and `find_and_replace`) and `mapFsWriteError` (`src/tools/_fs-errors.ts`; used by `append_note`, `patch_block`, `patch_heading`). The fix adds `write_note` as a caller of each; neither signature needs to change. If the not-found pattern is factored into a shared constant, `prepend/handler.ts` becomes a second consumer — keep that move byte-preserving for `prepend`.
- **Imports stay one-directional** (Principle I): `write_note/handler.ts` already imports from `../_active-file.js` and `../_fs-errors.js`; nothing upward.
- **Error spine**: no new error code or class; `UpstreamError` is constructed with existing codes (`CLI_REPORTED_ERROR`, `FS_WRITE_FAILED`, `FILE_EXISTS`).
- **Kernel nodes**: the fix touches none of them. `createLogger()` / `createQueue()` stay confined to `server.ts` (the handler keeps receiving `logger` / `queue` through `ExecuteDeps`); `UpstreamError` is used, not modified; `createServer()` is unchanged.

## Open Questions

- Resolved (Relay): `write_note`'s editor-conflict errno set is `{EBUSY, EPERM}` (as `patch_block`), not `{EBUSY, EPERM, EACCES}` (as `append_note` and `patch_heading`). `EBUSY` and `EPERM` map to `EXTERNAL_EDITOR_CONFLICT`; `EACCES` stays `FS_WRITE_FAILED` with a vault-relative `details.path`. Reason: ADR-009 Decision point 7 names `EACCES` as a generic fs failure that must surface as `FS_WRITE_FAILED`, and the write_note feature page routes OS-reserved names (`CON.md` and similar, typically `EACCES`) to `FS_WRITE_FAILED`; including `EACCES` would reverse that for write_note. `{EBUSY, EPERM}` still fixes the observed EPERM case and matches every sibling on the errnos they all treat as a lock. The Proposed Remediation, Tests and Risks sections above reflect this.
