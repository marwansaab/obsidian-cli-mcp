# Contract: Note-name locator for `patch_heading` and `patch_block`

**Feature**: [../spec.md](../spec.md) | **Research**: [../research.md](../research.md) | **Data model**: [../data-model.md](../data-model.md)

## §P Published surface (must not move)

- **P1**: `PATCH_HEADING_DESCRIPTION`, `PATCH_BLOCK_DESCRIPTION`, both input schemas and both output schemas are byte-identical to HEAD `5bc2621` (FR-009).
- **P2**: `src/tools/_register-baseline.json` is unchanged, and `_register.test.ts`'s baseline equality passes without regeneration.
- **P3**: `src/errors.ts` is unchanged (FR-006).

## §E Error contract (name-based calls)

| Case | Code | `details` | Spawns | `fs` calls |
|---|---|---|---|---|
| Unknown vault | the registry's error, unchanged (as today for `path`) | unchanged | 0 | 0 |
| Name matches no note (CLI prints `Error: File "<name>" not found.`) | `CLI_REPORTED_ERROR` | `message: 'Error: File "<name>" not found.'`, no `code` key, passed through from the dispatch layer unchanged | 1 (`file`) | 0 |
| TSV has no `path\t` line | `CLI_REPORTED_ERROR` | `stage: "file-tsv-parse"`, `stdout` (first 500 chars) | 1 | 0 |
| Resolved path escapes the vault | `PATH_ESCAPES_VAULT` | `{vault, attemptedPath: <resolved relPath>, resolvedPath}` | 1 | realpath only |
| Heading or block not in the resolved note | `CLI_REPORTED_ERROR` `HEADING_NOT_FOUND` / `BLOCK_NOT_FOUND` | `path: <resolved relPath>` | 1 | 1 read |
| Resolved note vanished before the read | `patch_heading`: `FS_WRITE_FAILED` ENOENT (unchanged). `patch_block`: `NOTE_NOT_FOUND` (unchanged) | `path: <resolved relPath>` | 1 | 1 read |

No failure here may be `FS_WRITE_FAILED` because a name was treated as a path (US2 AS1, SC-002).

## §T Test rows

Two new suites: `src/tools/patch_heading/handler.note-name.test.ts` (NH) and `src/tools/patch_block/handler.note-name.test.ts` (NB). Each row exists in both suites, with the tool-specific error named in the row. The suites use `makeQueuedSpawn`, the shared `fileTsvResponse`, and each tool's own `_handler-fixtures.ts` (`fakeFs`, `fakeRegistry`, `deps`, `EVAL_OK`, `VAULT_ROOT`).

| Row | Given | Expect | Spec |
|---|---|---|---|
| **N1** happy, sub-folder | `file: "Meeting Notes"`, spawn queue `[fileTsvResponse("Projects/Deep/Meeting Notes.md"), EVAL_OK]` | `fs.reads[0]` and the rename target equal `join(VAULT_ROOT, "Projects/Deep/Meeting Notes.md")`. `result.path === "Projects/Deep/Meeting Notes.md"`. The edit lands under the named heading or block. 2 spawns, the first being `file` with `vault=TestVault` and `file=Meeting Notes`. | US1 AS1–AS2, FR-001, FR-005, SC-001 |
| **N2** lookup first; refresh targets the resolved note | same as N1, with an `fs.readFile` override that records the spawn count at its first call | when `fs.readFile` is first called, exactly 1 spawn (the `file` lookup) has run. The second spawn is the metadata-refresh eval, and its decoded code names `Projects/Deep/Meeting Notes.md`, not the bare name. | FR-002 (V2) |
| **N3** locator sent as given | two cases: `file: "Projects/Meeting Notes.md"`, and `file: "Projects/Meeting Notes"` (folder, no `.md`) | in each case the `file` spawn argv carries the given value byte-for-byte (`file=Projects/Meeting Notes.md` / `file=Projects/Meeting Notes`), and the call acts on the TSV path | US1 AS4 |
| **N4** name not found | spawn queue `[{stdout: 'Error: File "Missing" not found.\n', exitCode: 0}]` | rejects `CLI_REPORTED_ERROR`, `details.message === 'Error: File "Missing" not found.'`, `details.code` undefined. `fs.reads`, `fs.writes` and `fs.renames` are empty. 1 spawn. Not `FS_WRITE_FAILED`. | US2 AS1, FR-003, SC-002, Q2 |
| **N5** TSV parse failure | spawn queue `[{stdout: "not a TSV line\n", exitCode: 0}]` | `CLI_REPORTED_ERROR`, `details.stage === "file-tsv-parse"`, no `fs` calls | FR-006 (V4) |
| **N6** unknown vault before lookup | `vault: "Nope"`, empty spawn queue | rejects with the registry error, 0 spawns, no `fs` calls | edge case "Unknown vault" |
| **N7** target not in the resolved note | the TSV resolves to `Projects/x.md`, the note lacks the heading or block | `HEADING_NOT_FOUND` / `BLOCK_NOT_FOUND` with `details.path === "Projects/x.md"`, no write | edge case, FR-008 |
| **N8** `path` makes no lookup | `path: "n.md"`, spawn queue `[EVAL_OK]` | 1 spawn (the refresh), no argv starts `file=`. `result.path === "n.md"` | FR-007, SC-004 (V5) |
| **N9** happy, vault root (boundary) | `file: "Daily"`, spawn queue `[fileTsvResponse("Daily.md"), EVAL_OK]` | `fs.reads[0]` and the rename target equal `join(VAULT_ROOT, "Daily.md")`, and `result.path === "Daily.md"`. Today this reads `join(VAULT_ROOT, "Daily")`, so it must fail the red check. | US1 AS3, FR-001, SC-001 |

**Existing tests**: none is edited (research F5). Every existing suite in `patch_heading/`, `patch_block/`, `_typed-result-fixtures.ts` consumers, `_surface.test.ts`, `_plugin-noise.test.ts` and `_register.test.ts` must pass unchanged. If any existing assertion fails during implement, stop and raise it for owner review (refactor-decisions item 5).

## §H Help-page text (FR-010)

`docs/tools/patch_heading.md` and `docs/tools/patch_block.md`. In the text below, `<tool>` is the page's tool name.

1. **Parameter table, `file` row**: `Note name, resolved like a wikilink (e.g. "Meeting Notes", "Projects/Meeting Notes" or "Meeting Notes.md"). A pre-flight \`obsidian file\` call resolves the name to a vault-relative path before the note is read; the edit and the response's \`path\` use that path. A name two notes share resolves to the same note \`read\` picks.`
2. **Parameter table, `path` row**: unchanged.
3. **Error roster**, new row placed before `PATH_ESCAPES_VAULT`: `| \`CLI_REPORTED_ERROR\` | — | — | A \`file\` name matches no note. The message is Obsidian's own, \`Error: File "<name>" not found.\`, the same failure [\`read\`](./read.md) returns for that name. Nothing is read or written. Check the name, or pass the note's \`path\`. |` (`patch_block.md` uses its four-column header the same way.)
4. **`patch_heading.md` output table, `path` row**: `Vault-relative path of the note that was patched. For a \`path\` input, echoes it; for a \`file\` name, the path the name resolved to; for active mode, the focused-file path returned by the eval.`
5. **`patch_block.md` output table, `path` row**: unchanged. "Vault-relative path of the note that was patched" is already true.

No other wording changes. Specifically, the `FS_WRITE_FAILED` ENOENT row in `patch_heading.md` stays, because it describes path-based targeting (research F9, follow-up 1).

## §C CHANGELOG

- Add the line `Spec 089-resolve-note-names (BI-0171).` to the `[Unreleased]` list of spec lines.
- Add a `Fixed` entry: `**\`patch_heading\` and \`patch_block\` resolve a note name like the reading tools** (spec 089). A \`file\` locator is now looked up the way a wikilink is, so a note in a sub-folder can be edited by its bare name and the response's \`path\` is the resolved note. A name that matches no note fails with Obsidian's own \`File "<name>" not found.\` error, as \`read\` does, instead of a file-system write error. \`path\` and active-mode targeting are unchanged.`

## §L Live column (quickstart §3)

| Check | Expect |
|---|---|
| L1 `read` by bare name for `Sandbox/089-live/x/y/Live089.md` | the note's content |
| L2 `patch_heading` by bare name, `mode: "append"` | success, `path === "Sandbox/089-live/x/y/Live089.md"`. Re-reading shows the appended line under the heading. No new file anywhere in the vault. |
| L3 `patch_block` by bare name | success, same `path`, and the block body replaced |
| L4 both editors with `file: "Live089Missing"` | `CLI_REPORTED_ERROR`, message `Error: File "Live089Missing" not found.`, and no file created |
| L5 a duplicate name in two folders | each editor edits the note `read` returns for that name |
