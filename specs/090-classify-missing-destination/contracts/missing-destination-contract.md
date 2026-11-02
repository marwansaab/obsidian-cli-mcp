# Contract: `move` missing destination and vault-relative failures

**Feature**: [../spec.md](../spec.md) | **Research**: [../research.md](../research.md) | **Data model**: [../data-model.md](../data-model.md)

## §P — Published-surface checks

| ID | Check | Expected |
|----|-------|----------|
| P1 | The FR-018 fingerprint gate (`_register-baseline.test.ts`), before regeneration | Fails for `move` only, on `description`. No other tool and no `move` schema, title or annotation moves. |
| P2 | `npm run baseline:write`, then the gate | Passes. The baseline diff is the `move` description string alone (§H1). |
| P3 | `src/errors.ts`, and the `details.code` values used anywhere in `src/` | `errors.ts` unchanged. `FOLDER_NOT_FOUND` already exists (`pattern_search`, `paths`), and no new value is added (FR-008). |
| P4 | `move` input and output schemas | Unchanged. |

## §E — Error contract

**E-1 Destination folder not found** (FR-001–FR-004). This applies when the move's CLI call fails with `CLI_REPORTED_ERROR`, its `details.message` matches `^Error: ENOENT: [^,]*, rename '`, and the destination folder (data-model E3) is not `""`:

```json
{
  "code": "CLI_REPORTED_ERROR",
  "message": "move: the destination folder \"<folder>\" does not exist in the vault. Nothing was moved. Create the folder (writing a note into it with write_note creates it), then retry the move.",
  "details": { "code": "FOLDER_NOT_FOUND", "folder": "<folder>" }
}
```

`details` holds exactly these two keys. `cause` is `null`, and no vault lookup is made.

**E-2 Vault-relative rewrite** (FR-005, Clarification Q3). This applies to every other `UpstreamError` from the CLI call or the response parse, except `CLI_BINARY_NOT_FOUND`, using the rules in data-model E5:

- `code` is the same;
- `cause` is the same;
- `message` and every string in `details` have the vault root rewritten;
- the original object is returned when nothing was rewritten;
- the original object is returned when the specific-mode registry lookup throws the registry's not-registered `VALIDATION_ERROR` (an unknown vault).

**E-2b Withheld** (FR-005; research D5 amended at analyze U1). This applies when the specific-mode registry lookup throws anything else, for example a cold-cache `vaults` probe that fails:

```json
{
  "code": "<the move failure's own code>",
  "message": "move: moving \"<source>\" to \"<destination>\" failed with <move code>, and the vault's folder could not be looked up (<lookup code>), so the command-line output is withheld to keep absolute paths out of this error. Retry the move.",
  "details": { "source": "<target.relPath>", "destination": "<resolvedTo>" }
}
```

- `cause` is the lookup failure (never thrown in the move failure's place).
- `<lookup code>` is the lookup failure's `code`, or `unknown` when it is not an `UpstreamError`.
- `details` holds exactly these two keys.

**E-3 Unchanged** (FR-007). The failures listed below are returned exactly as today:

- the missing source (`Error: File "<path>" not found.`, no `details.code`);
- the existing destination file;
- the unknown vault (`Vault not found.`);
- `CLI_BINARY_NOT_FOUND`;
- cancellation;
- `UNSUPPORTED_FILE_TYPE`;
- every `resolveFileTarget` failure.

## §T — Test rows

### New file `src/tools/move/handler.missing-destination.test.ts`

The file is co-located and carries the header `// Original — no upstream. …`. It drives `executeMove` only. Spawns are stubbed with `makeQueuedSpawn` (exact queue, so an extra spawn throws) or `makeStubSpawn`. The registry is a local recording stub, built over `stubVaultRegistry` and counting `resolveVaultPath` calls, with no `vi.fn`.

Fixture lines:

- `WIN_ROOT = "C:\\Vaults\\Work"`
- `ENOENT(src, dest)` = `Error: ENOENT: no such file or directory, rename '<src>' -> '<dest>'\n`

| Row | Input | Stub | Expected | Covers |
|-----|-------|------|----------|--------|
| M1 | specific, `path: "Inbox/Note.md"`, `to: "Archive/2026/"` | the move answers the ENOENT line with Windows absolute paths under `WIN_ROOT` | rejects with E-1, `folder: "Archive/2026"`; `toEqual` on `{code, message, details}`; 1 spawn; 0 registry calls | FR-001, FR-002, FR-004; US1 AS1, AS2, AS4 |
| M2 | specific, `path`, `to: "Archive/2026/Old.md"` | ENOENT | E-1, `folder: "Archive/2026"` | US1 AS3 |
| M3 | specific, `path`, `to: "A/B/C/"` | ENOENT | E-1, `folder: "A/B/C"` | Edge: nested |
| M4 | specific, `path: "Boards/Plan.canvas"`, `to: "Archive/Roadmap"` | ENOENT | E-1, `folder: "Archive"`; the forwarded `to=` is `Archive/Roadmap.canvas` (unchanged) | FR-009 (file type) |
| M5 | specific, `file: "Note"`, `to: "Archive/"` | `fileTsvResponse("Inbox/Note.md")`, then ENOENT | E-1, `folder: "Archive"`; 2 spawns; the forwarded `to=Archive/` (unchanged) | FR-009 (locator) |
| M6 | active, `to: "Archive/"` | `focusedFileResponse("Inbox/Note.md", WIN_ROOT)`, then ENOENT | E-1, `folder: "Archive"`; 0 registry calls | FR-009 (active) |
| M7 | specific, `path`, `to: "Archive/"` | ENOENT with POSIX paths under `/home/u/Vault` | E-1, `folder: "Archive"` | FR-010 |
| M8 | M1's call | — | `JSON.stringify` of `{code, message, details}` contains neither `Vaults` nor `C:` (in any case) | FR-005, SC-002; US2 AS1 |
| M9 | specific, `path: "Inbox/Note.md"`, `to: "Renamed.md"` | ENOENT naming `WIN_ROOT\Renamed.md` | `CLI_REPORTED_ERROR`, no `details.code`; `details.message` and `details.stdout` read `… rename 'Inbox\Note.md' -> 'Renamed.md'`; 1 registry call | Edge: vault root |
| M10 | specific, `path`, `to: "Archive/"` | `Error: EPERM: operation not permitted, rename '<WIN_ROOT>\Inbox\Note.md' -> '<WIN_ROOT>\Archive\Note.md'` | same code, no `details.code`; `details.message` = `Error: EPERM: operation not permitted, rename 'Inbox\Note.md' -> 'Archive\Note.md'`; the same text inside `details.stdout`; `argv` unchanged; no `C:\Vaults` anywhere | FR-005; US2 AS2, AS3 |
| M11 | M10 with the root written as `c:/vaults/WORK` in one place, `C:\VAULTS\Work` in another, and the bare root once | — | every form rewritten (`<root><sep>` → `""`, bare root → `.`); a sibling folder that shares the root's prefix (`C:\Vaults\Workshop\x.md`) is left unchanged | Q3 (separators, case) |
| M12 | active, `to: "Archive/"` | focused eval (`WIN_ROOT`), then exit 1 with `WIN_ROOT` in stderr | `CLI_NON_ZERO_EXIT`; `details.stderr` rewritten; 0 registry calls | FR-005 (other codes); D5 |
| M13 | specific, `vault: "Nope"`, `path`, `to: "Archive/"` | `Vault not found.`; the registry throws `VALIDATION_ERROR` | today's error exactly (`toEqual` on `code`, `message`, `details`): `code: "CLI_REPORTED_ERROR"`, `message: "Vault not found."`, `details.message: "Vault not found."` | FR-007; Edge: unknown vault |
| M14 | specific, `path: "Inbox/Missing.md"`, `to: "Archive/"` | `Error: File "Inbox/Missing.md" not found.` | today's error exactly, `details.code` undefined; contrasted with M1's `FOLDER_NOT_FOUND` in the same test | FR-006; US3 AS1, AS3 |
| M15 | specific, `path`, `to: "Archive/B.md"` | `Error: Destination file already exists!` | today's error exactly | FR-007; Edge: a file used as a folder (research P5 gives this same line, so it is never `FOLDER_NOT_FOUND`) |
| M16 | specific, `path`, `to: "Archive/"` | spawn `ENOENT` (no binary) | `CLI_BINARY_NOT_FOUND` unchanged; 0 registry calls | Clarification Q1 |
| M17 | specific, `path`, `to: "Archive/"` | `Moved: Inbox/Note.md → Archive/Note.md` | today's result; 1 spawn; 0 registry calls | FR-012, SC-006 |
| M18 | specific, `path: "Inbox/Note.md"`, `to: "Archive/"` | M10's EPERM line (root inside); the registry's `resolveVaultPath` throws `new UpstreamError({ code: "CLI_TIMEOUT", cause: null, details: {} })` (a probe failure) | E-2b: `code: "CLI_REPORTED_ERROR"`; `toEqual` on `message` (with `CLI_REPORTED_ERROR` and `CLI_TIMEOUT`) and `details: { source: "Inbox/Note.md", destination: "Archive/Note.md" }`; `cause` is the lookup error (`toBe`); `JSON.stringify` of `{code, message, details}` contains neither `Vaults` nor `EPERM` | FR-005, V2; Principle IV (both failures reported) |
| M19 | specific, `path: "Inbox/Note.md"`, `to: "Archive\\2026\\Old.md"` | ENOENT under `WIN_ROOT` | E-1, `folder: "Archive/2026"`; the forwarded `to=` is `Archive\2026\Old.md` (unchanged); 0 registry calls | Edge: separators (full-path backslash form) |
| M20 | specific, `path: "Inbox/Note.md"`, `to: "Archive/"` | exit 0, stdout `Unexpected: C:\Vaults\Work\Archive\Note.md\n` (no `Moved:` line, a single line, so parse fails) | `CLI_REPORTED_ERROR` with `details.stage: "parse"`; `details.stdout` reads `Unexpected: Archive\Note.md\n`; the message contains no `C:\Vaults`; 1 registry call | FR-005; data-model E4b "Unparseable success" |

### New `it` in the existing `src/tools/move/index.test.ts`

| Row | Check | Covers |
|-----|-------|--------|
| R1 | `createMoveTool(...).handler(M1's input)` returns `isError: true`, and the text parses to E-1, with no `structuredContent` | wire shape; Principle II |

## §X — Existing-test edits (refactor-decisions item 5)

**Approved by the owner, option A, 2026-11-02**: exactly X1–X6 below, as field additions only. The ruling is also recorded in refactor-decisions item 5.

D6 makes `vaultRegistry` a required `move` dependency, so these existing constructions stop type-checking until the field is added. The edits below are the whole list. Each adds the field and nothing else: no assertion, expected value, title or spawn queue changes. If any other existing test fails during implement, stop and raise it.

| ID | File | Edit |
|----|------|------|
| X1 | `src/tools/move/handler.test.ts` | Import `stubVaultRegistry` from `../_handler-test-fixtures.js` and add a module constant `const REGISTRY = stubVaultRegistry("V", "/vaults/V")`. |
| X2 | `src/tools/move/handler.test.ts` | The `deps()` helper (line 19–21) returns `vaultRegistry: REGISTRY` as well. |
| X3 | `src/tools/move/handler.test.ts` | The 25 inline `{ logger: silentLogger(), queue: createQueue(), spawnFn, env: {} }` literals each gain `vaultRegistry: REGISTRY`. |
| X4 | `src/tools/move/index.test.ts` | Import `stubVaultRegistry`. The four `createMoveTool({...})` literals (lines 20, 32, 43, 64) gain `vaultRegistry: stubVaultRegistry("MyVault", "/vaults/MyVault")`. |
| X5 | `src/tools/_typed-result-fixtures.ts` (line 210) | `createMoveTool({ ...cli(out(…)), vaultRegistry: registryAt("/vaults/MyVault") })`, using the module's existing `registryAt`. |
| X6 | `src/tools/_plugin-noise.test.ts` (line 230) | `createMoveTool({ ...cli(…), vaultRegistry: registryAt(NOTE_ROOT) })`, using the module's existing `registryAt` and `NOTE_ROOT`. |

The stub root is never in any existing test's CLI text, so every existing failure test gets its original error object back (E-2, "the original object when nothing was rewritten").

## §H — Help and description text

**H1, `MOVE_DESCRIPTION`**. Append one sentence after the existing text:

> A destination folder that does not exist fails with CLI_REPORTED_ERROR, details.code FOLDER_NOT_FOUND and the folder's vault-relative path in details.folder; create the folder, then retry.

**H2, `docs/tools/move.md`, Errors table**. Add after the destination-collision row:

| Code | When | Recovery |
|------|------|----------|
| `CLI_REPORTED_ERROR` (`details.code: "FOLDER_NOT_FOUND"`) | The destination's folder does not exist (for example `to: "Archive/2026/"` or `to: "Archive/2026/Old.md"` with no `Archive/2026` folder). `details.folder` is that folder's vault-relative path, with forward slashes; `details` has no other keys. Nothing was moved and nothing was created. A call whose source is also missing reports the source instead. | Create the folder (writing a note into it with [`write_note`](./write_note.md) creates it), then retry the same call. |

**H3, `docs/tools/move.md`, a paragraph directly under the Errors table**:

> **No absolute paths.** No `move` failure carries the vault's location on disk. Where the CLI's own text names a file by its absolute path (for example an `EPERM` from a locked file), the vault's folder is removed from it, so the path reads vault-relative (`C:\Vaults\Work\Inbox\a.md` becomes `Inbox\a.md`). The error code and the rest of the text are unchanged. If the vault's folder cannot be looked up at that moment, the CLI's text is withheld instead: the error keeps its code, and its message names the vault-relative source and destination and the reason (`details: { source, destination }`). `CLI_BINARY_NOT_FOUND` is the exception: its search paths describe where the Obsidian CLI is installed, not the vault.

**H4, `docs/tools/move.md`, Behavioural notes**. Add after the destination-collision bullet:

> - **Missing destination folder** surfaces as `CLI_REPORTED_ERROR` with `details.code: "FOLDER_NOT_FOUND"` and `details.folder`; the source is checked first.

**H5, `docs/tools/move.md`, Branch 2**. Replace "would try to create `Archive/Roadmap/Plan.canvas` (and fail with `ENOENT` when that folder does not exist)" with "would try to create `Archive/Roadmap/Plan.canvas`, inside a folder that usually does not exist".

## §C — CHANGELOG

Under `[Unreleased]`, after `Spec 089-resolve-note-names (BI-0171).`:

> Spec 090-classify-missing-destination.

Under `### Fixed`:

> - **`move` reports a missing destination folder as `FOLDER_NOT_FOUND`** (spec 090). Moving a file into a folder that does not exist now fails with `CLI_REPORTED_ERROR`, `details.code: "FOLDER_NOT_FOUND"` and the folder's vault-relative path in `details.folder`, the shape `paths` and `pattern_search` already use. It previously failed with the operating system's raw `ENOENT` text and no `details.code`. No `move` failure now carries the vault's absolute folder: where the CLI's text names an absolute path, the vault's folder is removed. The missing-source, destination-exists and unknown-vault failures are unchanged.

## §L — Live column (quickstart §3)

| Row | Call (vault `TestVault-Obsidian-CLI-MCP`, fixtures under `Sandbox/090-live/`) | Expected |
|-----|----------------------------------------------------------------------------|----------|
| L1 | `path: "Sandbox/090-live/Note.md"`, `to: "Sandbox/090-live/Missing/"` | E-1, `folder: "Sandbox/090-live/Missing"`; `Note.md` unchanged; no `Missing` folder |
| L2 | `to: "Sandbox/090-live/Missing/Renamed.md"` | E-1, same folder |
| L3 | `file: "<unique note name>"`, `to: "Sandbox/090-live/A/B/"` | E-1, `folder: "Sandbox/090-live/A/B"` |
| L4 | `write_note` `Sandbox/090-live/Missing/keep.md`, then L1 again | the move succeeds: `toPath: "Sandbox/090-live/Missing/Note.md"` |
| L5 | `path: "Sandbox/090-live/Nope.md"`, `to: "Sandbox/090-live/Missing2/"` | today's missing-source error, with no `details.code` |
| L6 | `vault: "No-Such-Vault"` | today's `Vault not found.` error |
| L7 | every L1–L6 failure payload | contains no `C:\Marwan-Saab-ADO` in any case or separator form |
