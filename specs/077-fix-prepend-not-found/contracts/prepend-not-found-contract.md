# Contract: `prepend` missing-note failure

**Feature**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

## §1 Inputs

Unchanged. `prependInputSchema` is not edited.

## §2 Output

Unchanged on success. `prependOutputSchema` is not edited.

## §3 Examples

Vault `TestVault` resolves to `/test-vault`. "Today" is the behaviour at HEAD `f60d1f0`.

| # | Call (specific mode unless noted) | On disk / Obsidian | Today | After this change |
|---|------|------|-------|-------------------|
| E1 | `path: "Sandbox/missing.md"`, default mode | no file | Pre-call stat `ENOENT` swallowed; Obsidian called; stdout `Error: File "Sandbox/missing.md" not found.` → `CLI_REPORTED_ERROR` with `details.stage: "prepend-cli"`, `details.stdout`, `details.message`; no `NOTE_NOT_FOUND` | `CLI_REPORTED_ERROR`, `details: { code: "NOTE_NOT_FOUND", path: "Sandbox/missing.md", vault: "TestVault" }`, message `Note "Sandbox/missing.md" not found in vault.`; Obsidian **not** called |
| E2 | as E1 with `inline: true` | no file | as E1 today | as E1 after |
| E3 | `path: "Sandbox/nofolder/missing.md"` | no folder | as E1 today | as E1 after, with that path |
| E4 | `path: "notes/plan.md"`, case-insensitive fs | file is `Notes/Plan.md`; stat succeeds; Obsidian prints `Error: File "notes/plan.md" not found.` | generic `prepend-cli` error | `NOTE_NOT_FOUND` with `path: "notes/plan.md"`, same message shape; `cause` is the dispatch error |
| E5 | `path: "Sandbox/gone.md"` | stat succeeds, file removed before Obsidian runs; Obsidian prints the E4 line | generic `prepend-cli` error | `NOTE_NOT_FOUND` as E4 |
| E6 | `append_note` with E1's input | no file | `NOTE_NOT_FOUND`, same `details` and message as E1 "after" | unchanged; equal to E1 "after" field by field |
| E7 | any input; Obsidian prints `Error: Folder "x" not found.` | stat succeeds | generic `prepend-cli` error | unchanged |
| E8 | any input; Obsidian prints a placeholder-matching line (`Error: Note not found.`, `No such file: …`) | stat succeeds | `NOTE_NOT_FOUND` | unchanged |
| E9 | `path: "Boards/Plan.canvas"`, missing | no file | `UNSUPPORTED_FILE_TYPE` (file-type check first) | unchanged |
| E10 | `file: "ghost"` that does not resolve | — | resolver failure, prepend never called | unchanged |
| E11 | active mode, focused note removed before the call | stat ENOENT | generic `prepend-cli` error from Obsidian | `NOTE_NOT_FOUND` with the focused path and the resolved vault display name; Obsidian not called |

## §4 Errors

| Top-level `code` | `details` | When | Change |
|---|---|---|---|
| `CLI_REPORTED_ERROR` | `{ code: "NOTE_NOT_FOUND", path, vault }` | No file at the target (pre-call check, Obsidian not called), or Obsidian reports `Error: File "<path>" not found.` (case mismatch, note removed in between) | Now produced for Obsidian's real wording and before the call; shape unchanged |
| every other row of `docs/tools/prepend.md` → Error states | unchanged | unchanged | none |

No new top-level code, `details.code` or `details.reason`.

## §5 Published surface

Title, annotations (`ADDITIVE_WRITE_HINTS`), input and output schemas and `PREPEND_DESCRIPTION` are unchanged, so `src/tools/_register-baseline.json` does not move.
