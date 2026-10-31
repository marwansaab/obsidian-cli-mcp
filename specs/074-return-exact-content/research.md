# Research: Return Exact Content

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-10-31

## Findings

### F1. The read path today

`executeReadNote` (`src/tools/read/handler.ts:26`) resolves the target with `resolveFileTarget` (`src/tools/_file-target.ts:44`), checks the file type, then runs `obsidian read` through `invokeCli` and returns `{ content: stdout }` untouched. The wrapper adds nothing. Every difference between the result and the note comes from the CLI.

`resolveFileTarget` already knows the vault-relative path in all three modes:

- `path`: as given;
- `file`: through the `obsidian file` TSV resolver;
- active: through the focused-file eval, which also returns the vault's absolute `base` (`resolveActiveFocusedFile`, `src/tools/_active-file.ts:184`). `FileTarget` drops that `base` today.

### F2. What the CLI's `read` does to the bytes (live probe, plan time)

The probe ran against the authorised test vault (`TestVault-Obsidian-CLI-MCP`, `Sandbox/t074/`, cleaned up afterwards), calling `obsidian read` directly through `Obsidian.com` per `.memory/test-execution-instructions.md`.

| Fixture | Bytes on disk | `obsidian read` stdout |
|---|---|---|
| `nolf` | `66 69 72 73 74` | `66 69 72 73 74 0a` |
| `lf` | `66 69 72 73 74 0a` | `66 69 72 73 74 0a` |
| `crlf` | `61 0d 0a 62 0d 0a` | `61 0d 0a 62 0d 0a` |
| `crlfnoend` | `61 0d 0a 62` | `61 0d 0a 62 0a` |
| `empty` | (none) | (none) |
| `cr` | `61 0d` | `61 0d 0a` |
| `lflf` | `61 0a 0a` | `61 0a 0a` |
| `onlylf` | `0a` | `0a` |
| `bom` | `ef bb bf 61` | `61 0a` |
| `bombom` | `ef bb bf ef bb bf 61` | `ef bb bf 61 0a` |
| `bomonly` | `ef bb bf` | (none) |
| `bomlf` | `ef bb bf 61 0a` | `61 0a` |
| `midbom` | `61 ef bb bf 62` | `61 ef bb bf 62 0a` |
| `file=nolf` | `66 69 72 73 74` | `66 69 72 73 74 0a` (same as `path=`) |

The CLI's output is a fixed function of the note's bytes. Let `t` be the note decoded as UTF-8 **with one leading byte-order mark removed**. Then:

```text
stdout = t                if t is empty or t ends with "\n"
stdout = t + "\n"         otherwise
```

So the CLI makes **two** changes, not one:

1. **Added line feed**: a line feed is added when the text after the byte-order mark is not empty and does not end with one. This is the defect the spec names. A lone CR ending is completed to CRLF (`cr`), and a CRLF note without a final line break gets a bare LF (`crlfnoend`).
2. **Byte-order mark removed**: one leading byte-order mark is removed (`bom`, `bombom`, `bomlf`, `bomonly`). A mark in the middle of the text is kept (`midbom`). This contradicts `docs/tools/read.md:9`, which says "no BOM strip". It also breaks spec FR-001 ("nothing removed"), the spec's byte-order-mark edge case and the User Story 4 round trip (`write_note` writes a leading `﻿` verbatim).

No other change was seen. CR, CRLF, repeated line breaks and mid-text marks all pass through unchanged.

### F3. The ground truth is on disk, and the project already reaches it

The spec's Assumptions name the stored content on disk as the authority. ADR-009 (Direct Filesystem Write Path Alongside CLI Bridge) already gives the project a vault-name → absolute-root map (`createVaultRegistry`, `src/vault-registry/registry.ts:68`, built in `createServer` and injected) and direct `node:fs` access behind a per-tool `fs` seam. The write cohort, `find_and_replace`, `get_active_file`, `open_file`, `query_base` and `views_base` already receive `vaultRegistry`. `read` does not yet.

### F4. A filesystem read failure has an existing code with a read-side shape

`find_and_replace` maps a failed `fs.readFile` during its scan to `FS_WRITE_FAILED` with `details: { reason: "read", errno, syscall?, path, vault? }`. This is documented in `docs/tools/find_and_replace.md` (the errors table), so a read-side filesystem failure already has a published shape. `getErrno` lives in `src/tools/_fs-errors.ts`.

### F5. Test seams

- `read/handler.test.ts` builds deps with `logger`, `queue`, `spawnFn` and `env`.
- `read/index.test.ts` calls `createReadTool` with the same deps.
- `_handler-test-fixtures.ts` already offers `stubVaultRegistry(name, root)`, `fileTsvResponse` and `focusedFileResponse`.
- `createReadTool` has no other production caller than `src/server.ts:134`, and no typed-result fixture (it publishes no `outputSchema`).

### F6. Published surface

`READ_DESCRIPTION` (`src/tools/read/index.ts:10`) says "Returns the file's raw UTF-8 text as { content: <stdout> }". The fingerprint baseline (`_register-baseline.json`, regenerated with `npm run baseline:write`) therefore moves for `read`'s description only. The input schema and the result shape do not change.

## Decisions

### D1. Keep the CLI `read`, then undo its two changes using two facts read from disk

**Decision**: `executeReadNote` keeps its `obsidian read` call exactly as today. That keeps the same argv, the same failures and the same output cap, timeout, cancellation and closed-vault auto-open. Only after that call succeeds does it read the note's bytes from disk and take two facts from them:

- `bom`: the bytes start with `EF BB BF`;
- `finalLf`: the last byte is `0A`.

It then undoes the CLI's two changes:

```text
content = stdout
if stdout ends with "\n" and not finalLf  → remove that one final "\n"
if bom                                    → put "﻿" back in front
```

Checked against every row of F2:

- `nolf` → `first`; `lf` → `first\n`; `crlfnoend` → `a\r\nb`; `cr` → `a\r`;
- `empty` → empty; `bom` → `﻿a`; `bombom` → `﻿﻿a`; `bomonly` → `﻿`; `bomlf` → `﻿a\n`;
- `midbom` → unchanged apart from the added line feed;
- `crlf`, `lflf` and `onlylf` → unchanged.

**Rationale**:

- The result is still the CLI's text, so every failure the CLI raises is raised exactly as before (FR-008, SC-005).
- The two disk facts are each one bit. What is returned is never disk content the CLI did not already return. That keeps the security reasoning simple: no containment check is needed, because the read cannot disclose anything outside what the CLI read.
- Both changes are undone, so FR-001 holds as written ("nothing added and nothing removed"), and so do the spec's byte-order-mark edge case and the round trip.

**Alternatives considered**:

- **Strip one final `\n` only when the note does not end with one, and leave the byte-order mark removed.** Rejected: it breaks FR-001 and the spec's byte-order-mark edge case. The plan implements the spec as clarified and corrects the docs' false "no BOM strip" claim instead of carrying it forward.
- **Return the disk text and use the CLI call only as a gate.** It is exact by construction, but the returned bytes would come from a path the wrapper joined itself, not from the CLI. That needs realpath containment (Security Defaults), and the containment would reject reads that succeed today, such as a symlinked note, which breaks SC-005. Rejected.
- **Replace the CLI read with a direct filesystem read.** Rejected: it changes every failure (`CLI_NON_ZERO_EXIT` / `CLI_REPORTED_ERROR` would become filesystem errors), drops closed-vault auto-open and the output cap, and needs containment (FR-008).
- **An extra `obsidian eval` returning `app.vault.read(file)` as JSON.** Rejected: one more CLI spawn on the most-used tool, and Obsidian's decoder removes the byte-order mark too (it is the likely source of change 2).
- **Strip any final `\n`.** Rejected: it loses real content (User Story 2).

### D2. Where the vault root comes from

**Decision**:

- **Active mode**: the focused-file eval's `base`, which `resolveFileTarget` already fetches. `FileTarget` gains an optional `vaultRoot`, set in active mode only. This is additive: `rename`, `move` and `outline` ignore it.
- **Specific mode**: `deps.vaultRegistry.resolveVaultPath(input.vault)`, called **after** the CLI read succeeds. An unknown vault therefore still fails exactly as today, at the CLI, and the registry is only asked about a vault the CLI has just read from. On a cache miss it re-probes (068 FR-037).

`createReadTool` receives `vaultRegistry` from `createServer`, as the direct-fs and registry-backed tools already do.

**Alternative**: `resolveFsTarget` (the direct-fs tools' locator). Rejected: it resolves the registry first, which turns an unknown vault into the registry's `VALIDATION_ERROR` before the CLI runs. That changes a failure (FR-008).

### D3. The filesystem seam

**Decision**: `ExecuteDeps` gains `vaultRegistry: VaultRegistry` and an optional `fs?: ReadFs`, where `ReadFs = { readFile: (p: string) => Promise<Buffer> }`. The default is `node:fs/promises`. The absolute path is `join(vaultRoot, relPath)`, which accepts either separator.

Reading the whole note is the simplest seam that matches the cohort's other `readFile` seams. Notes are small, the CLI already caps its own output at 10 MiB, and one extra local read costs little next to the CLI spawn.

**Alternative**: open a handle and read only the first three bytes and the last byte. Rejected for now: it adds a handle-based seam for a saving no measurement asks for.

### D4. Failure of the disk read

**Decision**: if the root cannot be resolved or the bytes cannot be read after a successful CLI read (a race with a delete or a lock, or a permission error), the handler throws `FS_WRITE_FAILED` with `details: { reason: "read", errno, syscall?, path }` and the message `read: filesystem read failed: <errno> for "<path>"`. This matches `find_and_replace`'s existing read-side shape. A registry failure propagates unchanged.

It never falls back to the uncorrected stdout (Principle IV: no silent fallback). This is the one new failure that spec FR-008 and SC-005 allow.

**Alternatives**:

- **A new `FS_READ_FAILED` code.** Rejected: it would break the zero-new-codes streak (Principle IV).
- **Falling back to stdout.** Rejected: it would return the very inexact text the feature removes, with no sign.

### D5. Race between the CLI read and the disk read

**Decision**: accepted and documented (spec Edge Cases). A write that lands between the two reads can change the two facts. The window is a few milliseconds of local I/O, and the outcome is the same last-write-wins the write cohort already accepts (ADR-009 §3 / FR-026). No locking is added.

### D6. Documentation and published description

**Decision**:

- `READ_DESCRIPTION`: "Returns the file's exact text as { content }: nothing added, nothing removed, line breaks and any byte-order mark kept."
- `docs/tools/read.md`:
  - the caveat paragraph is replaced with the exact-content contract;
  - the Output row is rewritten;
  - an Errors row is added for `FS_WRITE_FAILED` (`reason: "read"`);
  - the active-mode example is unchanged.
- `docs/tools/index.md`: the `read` line's "raw text" becomes "exact text".
- `CHANGELOG.md`: a `[Unreleased]` **Fixed** entry.
- `.docs-as-code/` waits for `/speckit-docs-as-code` after review, per CLAUDE.md.

### D7. Tests

**Decision**: `read/handler.test.ts` gains one case per F2 row, using stubbed `readFile` bytes and stubbed CLI stdout. The cases:

- every F2 row, as a table-driven case;
- each of `file`, `path` and active mode reading the right absolute path, with the active root coming from the eval `base`;
- an unknown vault still failing at the CLI, with the registry never called;
- a disk-read failure giving `FS_WRITE_FAILED` with `reason: "read"`;
- CLI failures making no disk read.

Existing tests get a registry stub and `fs` stub. `read/index.test.ts` asserts the new description. The baseline is regenerated. These are co-located tests in the same change (Principle II).

**Round trip with every writer (FR-007, SC-003)**: the correction depends only on the note's bytes on disk and the CLI's stdout, never on which tool wrote the note. The byte-table unit tests therefore cover the result for any writer. What a unit test cannot show is that the real CLI, reading a file each writer has just produced, behaves as research F2 says. The live check closes that gap with one round trip per note-writing tool: `write_note`, `append_note`, `prepend`, `patch_heading`, `patch_block`, `set_property` and `find_and_replace` (single-note commit). The writers themselves are not changed; they only produce the fixtures (quickstart §3 step 5, task T023).

### D8. Live check

The plan-time probe (F2) already pins the CLI behaviour, so no T0 gate blocks implementation. `quickstart.md` §3 re-runs the same fixtures end to end through the built server as the acceptance check.
