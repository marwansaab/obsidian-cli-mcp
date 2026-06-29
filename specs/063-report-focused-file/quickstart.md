# Quickstart: `get_active_file`

Manual validation mapped to the user stories. Live scenarios are gated by `.memory/test-execution-instructions.md` and drive `Obsidian.com`. In-process behaviour is covered by the co-located `*.test.ts` (mock `invokeCli`).

## US1 — Read the active file's details (active mode)

1. Open a note (e.g. `Folder/note.md`) in Obsidian; make it the active editor.
2. Call `get_active_file` with `{ "target_mode": "active" }`.
3. Expect: `{ "active": { "path": "Folder/note.md", "name": "note.md", "basename": "note", "extension": "md" } }`.
4. Field rules: make `note.draft.md` active → `basename:"note.draft"`, `extension:"md"`. Make an extension-less file active → `extension:""`, `name === basename`. Make a non-ASCII-named note active → characters returned raw.

## US2 — No active file is a success, not an error

1. Close all panes (empty workspace), or focus a non-file view (a plugin panel).
2. Call `get_active_file` with `{ "target_mode": "active" }`.
3. Expect: `{ "active": null }` — a successful result. Not an error; no `ERR_NO_ACTIVE_FILE`. Branch on `active === null`.

## US3 — Confirm before acting (round-trip + timing)

1. With `Folder/note.md` active, call `get_active_file` (active mode); take `active.path`.
2. Use that `path` as the locator for a follow-up operation (e.g. `read` `target_mode:"specific"` + `vault` + `path`) → it targets the same file.
3. Timing: read the active file, switch to a different note, then act on the previously returned path → the outcome reflects that the answer was a snapshot at lookup time. `help({ tool_name: "get_active_file" })` documents this (T1) and the post-launch-focus caveat (T2).

## US4 — Target a named vault, cross-vault

1. Open two vaults A and B; focus A. Make `B-note.md` active in B (B unfocused).
2. Call `get_active_file` with `{ "target_mode": "specific", "vault": "B" }`.
3. Expect: `{ "active": { "path": "B-note.md", ... } }` — B's active file, not A's. No manual switch to B.
4. Unknown vault: `{ "target_mode": "specific", "vault": "Nope" }` → `CLI_REPORTED_ERROR` with `details.code:"VAULT_NOT_FOUND"`, `details.reason:"unknown"` — not `{ active: null }`.
5. Active mode rejects `vault`: `{ "target_mode": "active", "vault": "B" }` → `VALIDATION_ERROR`.

## Validation errors (boundary)

- `{ "target_mode": "specific" }` (no vault) → `VALIDATION_ERROR` (`vault is required in specific mode`).
- `{ "target_mode": "active", "path": "x" }` / `{ "...", "file": "y" }` → `VALIDATION_ERROR` (no locator accepted).
- Unknown field → `VALIDATION_ERROR` (strict).

## Recovery (inherited)

- `specific` against a closed-but-registered vault → inherited cold-start retry brings it up; the read returns its active file (or `{ active: null }`).
- App down with `OBSIDIAN_AUTO_LAUNCH=0` → `CLI_NON_ZERO_EXIT` / `details.reason:"obsidian-not-running"`.
