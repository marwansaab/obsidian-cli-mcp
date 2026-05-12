# Quickstart: Fix Write Gaps Verification Scenarios

**Feature**: 020-fix-write-gaps
**Date**: 2026-05-12
**Status**: Phase 1 output. 11 verification scenarios (S-1..S-11) mapped 1:1 to SC-001..SC-011. Nine are unit-testable; two are manual / inspection scenarios.

## Scenarios overview

| ID | SC | Type | Description |
|----|----|------|-------------|
| S-1 | SC-001 | UNIT | Canonical short-form `file` resolves to `<file>.md` at vault root + response reports resolved path |
| S-1b | SC-001 | UNIT | Non-canonical `file` (with `/` or `.md`) passes through verbatim + response reports value verbatim |
| S-2 | SC-002 | MANUAL | Live Obsidian recognises the resolved file as a markdown note (file explorer, `app.vault.getMarkdownFiles()`, wikilink resolution) |
| S-3 | SC-003 | UNIT | `path: "Subfolder/Note.md"` (vault-relative path with extension) → response reports verbatim, no double-extension |
| S-4 | SC-004 | UNIT | FILE_EXISTS rejection carries `details.errno: "EEXIST"` AND preserves existing `path` + `vault` fields |
| S-5 | SC-005 | UNIT | FILE_EXISTS rejection leaves existing file's content byte-identical + produces no auto-renamed sibling |
| S-6 | SC-006 | UNIT | `overwrite: true` against existing target succeeds + response carries standard success envelope (no `details.errno`) |
| S-7 | SC-007 | INSPECTION | Schema for `FILE_EXISTS.details.errno` field-name parity with `FS_WRITE_FAILED.details.errno` value vocabulary |
| S-8 | SC-008 | INSPECTION | Top-level error code roster diff-free (no new codes, no rename / retire) |
| S-9 | SC-009 | INSPECTION | Input schema diff-free (no new parameters, no rule changes) |
| S-10 | SC-010 | INSPECTION | Other tools' surfaces diff-free (`read_note` / `read_property` / `read_heading` / `find_by_property` / `delete_note` / `obsidian_exec` / `help` / `write_property` / `list_files`) |
| S-11 | SC-011 | INSPECTION | Help update at `docs/tools/write_note.md` covers both fixes per FR-018 callouts (a) + (b) |

## S-1 (UNIT) — Canonical short-form resolution

**Maps to**: SC-001 (positive branch), FR-001, FR-002, FR-003, Story 1 AC#1, AC#2 (post-resolution path correctness), AC#5 (internal periods)

**Setup**: vitest case in `handler.test.ts` with `deps.spawnFn`, `nodeFs.writeFile`, `nodeFs.realpath`, `vaultRegistry.resolveVaultPath` injected stubs.

**Steps**:

1. Mock `vaultRegistry.resolveVaultPath("V")` → `"C:/vaults/V"`.
2. Mock `nodeFs.realpath` per the existing pattern.
3. Mock `nodeFs.writeFile` to succeed.
4. Call handler with `{ target_mode: "specific", vault: "V", file: "Acceptance Probe", content: "..." }`.
5. **Expect**: `relPath` passed to `nodeFs.writeFile` ends with `"Acceptance Probe.md"`; response `{ created: true, path: "Acceptance Probe.md" }`.
6. **Expect**: separate case — `file: "version_1.2.3"` → response `{ created: true, path: "version_1.2.3.md" }`.

**Pass criteria**: handler test #1 and handler test #2 pass.

## S-1b (UNIT) — Non-canonical `file` passthrough

**Maps to**: SC-001 (negative branch), FR-001a, FR-003, Story 1 AC#6, AC#7

**Setup**: same fixtures as S-1.

**Steps**:

1. Call handler with `{ target_mode: "specific", vault: "V", file: "Notes.md", content: "..." }`.
2. **Expect**: `relPath` passed to `nodeFs.writeFile` is `"Notes.md"` verbatim (no double-extension); response `{ created: true, path: "Notes.md" }`.
3. Repeat with `file: "Folder/Note"` → `relPath` is `"Folder/Note"` verbatim (no `.md` appended); response `{ created: true, path: "Folder/Note" }`.
4. Repeat with `file: "Folder/Note.md"` → `relPath` is `"Folder/Note.md"` verbatim; response `{ created: true, path: "Folder/Note.md" }`.

**Pass criteria**: handler tests #3 and #4 pass (case #4 covers both folder-only and folder-plus-extension).

## S-2 (MANUAL) — Live Obsidian recognition

**Maps to**: SC-002, Story 1 AC#2, AC#3

**Setup**: requires a real Obsidian instance, a real test vault (per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md)), and the built MCP server pointed at that vault. Scratch subdirectory per the test-execution instructions.

**Steps**:

1. Open the test vault in Obsidian; open another note in the editor.
2. From the MCP client (e.g. Inspector), call `write_note` with `{ target_mode: "specific", vault: <test vault name>, file: "QS-S2 Acceptance Probe", content: "# Probe\n\nbody\n" }` against a scratch subdirectory location (adjust `file` to land inside the authorised scratch path).
3. **Verify (a)**: Obsidian's file explorer shows the new file with the `.md` extension under the scratch subdirectory.
4. **Verify (b)**: from the Obsidian developer console, `app.vault.getMarkdownFiles().some(f => f.path.endsWith("QS-S2 Acceptance Probe.md"))` returns `true`.
5. **Verify (c)**: create or edit another note in the same vault with the body `[[QS-S2 Acceptance Probe]]`. After Obsidian reindexes (or via `app.metadataCache.resolvedLinks`), the wikilink resolves to the newly-created file (rendered as a hyperlink, not as a broken-link).
6. **Cleanup**: delete the probe file and the linking note per the scratch-subdirectory cleanup protocol.

**Pass criteria**: all three verifications pass; cleanup is complete; no residue outside the scratch subdirectory.

## S-3 (UNIT) — Path-based identifier verbatim

**Maps to**: SC-003, FR-004, Story 1 AC#4

**Setup**: same fixtures as S-1.

**Steps**:

1. Call handler with `{ target_mode: "specific", vault: "V", path: "Subfolder/Note.md", content: "..." }`.
2. **Expect**: `relPath` passed to `nodeFs.writeFile` is `"Subfolder/Note.md"` verbatim — no double-extension; response `{ created: true, path: "Subfolder/Note.md" }`.

**Pass criteria**: handler test #5 passes.

## S-4 (UNIT) — FILE_EXISTS additive details

**Maps to**: SC-004, FR-007, FR-008, FR-009, Story 2 AC#1

**Setup**: same fixtures as S-1 plus `nodeFs.writeFile` mocked to reject with `Object.assign(new Error("EEXIST: file already exists"), { code: "EEXIST" })` when the `wx` flag is set.

**Steps**:

1. Call handler with `{ target_mode: "specific", vault: "V", path: "Existing.md", content: "...", overwrite: false }` (collision protection enabled is the default — `overwrite` defaults to `false`).
2. **Expect**: handler throws `UpstreamError` with `code: "FILE_EXISTS"`, `details: { errno: "EEXIST", path: "Existing.md", vault: "V" }`, and `message` matching the existing 016 message shape.

**Pass criteria**: handler test #6 passes.

## S-5 (UNIT) — FILE_EXISTS preserves existing file

**Maps to**: SC-005, FR-009

**Setup**: same as S-4.

**Steps**:

1. Trigger the FILE_EXISTS rejection per S-4.
2. **Expect**: `nodeFs.writeFile` was called exactly once with the `wx` flag (the atomic create-or-fail probe); no subsequent `nodeFs.rename` call (the rename only fires on the `overwrite: true` branch); no temp-file unlink calls.

**Pass criteria**: handler test #6 also asserts the no-secondary-call invariant; OR a separate spec assertion in test #6 confirms the call chain.

## S-6 (UNIT) — Overwrite-true success on existing target

**Maps to**: SC-006, FR-010, Story 2 AC#4

**Setup**: same fixtures as S-1 plus `nodeFs.realpath(absPath)` mocked to succeed (target exists), `nodeFs.writeFile` (to tmp) mocked to succeed, `nodeFs.rename` mocked to succeed.

**Steps**:

1. Call handler with `{ target_mode: "specific", vault: "V", path: "Existing.md", content: "new", overwrite: true }`.
2. **Expect**: handler returns `{ created: false, path: "Existing.md" }`; no UpstreamError thrown; no `details.errno` in the response.
3. **Expect**: `nodeFs.writeFile` called once with a `.tmp` suffix path; `nodeFs.rename` called once from `.tmp` to `Existing.md`.

**Pass criteria**: handler test #8 passes.

## S-7 (INSPECTION) — Field-name parity

**Maps to**: SC-007, FR-008

**Setup**: inspect `src/tools/write_note/handler.ts` and `src/tools/write_note/handler.test.ts` post-implementation.

**Steps**:

1. Grep `"errno"` in `handler.ts`:
   - FILE_EXISTS hot path → `details.errno: "EEXIST"` (post-implementation)
   - FS_WRITE_FAILED → `details.errno: <e.code>` (`"ENOSPC"`, `"EACCES"`, `"EROFS"`, `"ENOENT"`, etc.)
   - `mapFsError` EEXIST path → `details.errno: errno` (`"EEXIST"`)
2. Confirm all references use the same field name (`details.errno`) and the same value vocabulary (standard POSIX errno strings).

**Pass criteria**: field-name parity confirmed by inspection; reviewer agrees the cross-failure-type contract holds.

## S-8 (INSPECTION) — Error code roster diff-free

**Maps to**: SC-008, FR-011

**Setup**: post-implementation `git diff` against the branch base.

**Steps**:

1. `git diff main..HEAD -- src/logger.ts` — confirm zero changes to the `ErrorCode` union.
2. `git diff main..HEAD -- src/errors.ts` — confirm zero changes.

**Pass criteria**: both diffs empty.

## S-9 (INSPECTION) — Input contract diff-free

**Maps to**: SC-009, FR-012

**Setup**: post-implementation `git diff` against the branch base.

**Steps**:

1. `git diff main..HEAD -- src/tools/write_note/schema.ts` — confirm zero changes.
2. `git diff main..HEAD -- src/tools/write_note/schema.test.ts` — confirm zero changes (other than no-op refactors if any).
3. `git diff main..HEAD -- src/target-mode/` — confirm zero changes (the schema's target-mode primitive is unchanged).

**Pass criteria**: all three diffs empty.

## S-10 (INSPECTION) — Other tools diff-free

**Maps to**: SC-010, FR-014

**Setup**: post-implementation `git diff` against the branch base.

**Steps**:

1. For each peer tool: `git diff main..HEAD -- src/tools/<peer>/` — confirm zero changes. Peers: `read_note`, `read_property`, `read_heading`, `find_by_property`, `delete_note`, `obsidian_exec`, `help`, `write_property`, `list_files`.
2. `git diff main..HEAD -- src/server.ts` — confirm zero changes (no new tool registered).
3. `git diff main..HEAD -- src/tools/_register.ts src/tools/_register.test.ts` — confirm zero changes.
4. For each peer tool doc: `git diff main..HEAD -- docs/tools/<peer>.md` — confirm zero changes.

**Pass criteria**: every diff empty.

## S-11 (INSPECTION) — Help update coverage

**Maps to**: SC-011, FR-018

**Setup**: post-implementation `docs/tools/write_note.md` content review.

**Steps**:

1. Confirm the doc carries callout (a) — canonical short-form `file` shape definition (no folder separator, not ending in `.md`) + at least one worked example showing the `<file>.md` resolution + a note that non-canonical `file` values (containing a folder separator OR ending in `.md`) pass through verbatim.
2. Confirm the doc carries callout (b) — FILE_EXISTS rejection shape with `details.errno: "EEXIST"` named explicitly + additive enrichment note (`path` and `vault` preserved alongside `errno`).
3. Confirm both callouts reference the same field-name convention (`details.errno`) used by FS_WRITE_FAILED.

**Pass criteria**: both callouts present; field-name convention consistent.

## Cleanup protocol

All UNIT scenarios are vitest-mocked — no filesystem touch, no cleanup required.

S-2 (MANUAL) creates real files in the authorised scratch subdirectory per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md). Cleanup obligations:

- Delete the probe file (`QS-S2 Acceptance Probe.md`).
- Delete the linking note (if created in step 5).
- Confirm no other residue in the scratch subdirectory after the run.
- The vault state outside the scratch subdirectory MUST be byte-identical before and after the manual run.

## Phase ordering

Scenarios can run in any order. Suggested implementation order matches the task numbering in `tasks.md`:

1. S-1, S-1b (canonical / passthrough resolution) — `resolveSpecificModePath` helper lands first
2. S-3 (path-based regression guard) — same test file, immediate regression coverage
3. S-4, S-5 (FILE_EXISTS additive details) — second handler edit
4. S-6 (overwrite-true regression guard) — confirms collision-disabled path still works
5. S-7..S-10 (inspection diffs) — runs at PR review time
6. S-11 (help update inspection) — runs at PR review time
7. S-2 (live-Obsidian manual) — runs before merge as the acceptance check
