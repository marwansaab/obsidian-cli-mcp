# get_active_file

Report the **active file** — the note Obsidian currently has focused — so an agent can confirm what is active before acting on it. The read counterpart of [`open_file`](./open_file.md): where `open_file` makes a file active, `get_active_file` tells you which file is active right now. It makes implicit focus state explicit — the discovery remedy for the ADR-003 risk of acting on a file the agent cannot see first.

## When to reach for it

- Before an `target_mode: "active"` write/edit, to confirm *which* file that will land on.
- To capture the focused file's `path` and reuse it as a stable locator for a follow-up operation.
- To branch on whether anything is active at all (`active === null`) without catching an error.

## Targeting — two modes

| Mode | `vault` | Reads |
|------|---------|-------|
| `target_mode: "active"` | forbidden | the **focused** vault's active file |
| `target_mode: "specific"` | required | the **named** vault's active file, cross-vault |

In `specific` mode the answer reflects the named vault's active file **even when that vault is open but not the focused window** (a background vault). You do **not** pre-focus the vault, and focus is **not** changed — this is a pure read. No `file` / `path` is accepted in either mode: the active file *is* the implicit target, there is no locator.

## Output

```json
{ "active": { "path": "Folder/note.md", "name": "note.md", "basename": "note", "extension": "md" } }
```

| Field | Meaning |
|-------|---------|
| `path` | Vault-relative path. Directly reusable as a `path` locator for a follow-up call against the same file. |
| `name` | File name including extension. `name === basename + extension`. |
| `basename` | Name without the final extension. `note.draft.md` → `note.draft`. |
| `extension` | Final dot-delimited segment without the dot, or `""` when the name has no dot (then `name === basename`). |

Non-ASCII characters in `path` / `name` are returned **raw** — exactly what Obsidian reports, with no NFC/NFD normalization, so the returned `path` round-trips against the on-disk name.

The response is **file-only**: no `vault` / `target_mode` echo, no pane / split / leaf info, no cursor / heading / block position.

## No active file is a success, not an error

When nothing is active — an empty workspace, all panes closed, or a non-file view (a plugin panel) in front — the result is:

```json
{ "active": null }
```

This is a **successful** result you branch on via `active === null`. `get_active_file` **never** raises `ERR_NO_ACTIVE_FILE` — a deliberate divergence from the rest of the eval cohort, whose tools treat "no active file" as a usage error because they need a target. Here, reporting presence *or absence* is the whole point.

## Timing limitations

- **Point-in-time snapshot.** The answer describes the active file at the moment of the lookup. There is no locking or pinning, so it may be stale by the time a follow-up action runs — if the user switches notes in between, the previously returned `path` no longer points at the active file. Re-read immediately before acting when freshness matters.
- **Post-launch focus.** If Obsidian was down and an app-down launch fired as inherited recovery (ADR-029/030), the relaunched vault's active file may differ (null / last-open) from the pre-down state — the answer reflects post-launch focus, not the focus before the app quit. Any focus change here is an inherited recovery side effect, not something this tool does (it never changes which file is active).

## Examples

### Example 1 — read the focused vault's active file

```json
{ "target_mode": "active" }
```

→ with `Folder/note.md` focused:

```json
{ "active": { "path": "Folder/note.md", "name": "note.md", "basename": "note", "extension": "md" } }
```

### Example 2 — field derivation (multi-dot, no extension)

A multi-dot name `note.draft.md` active:

```json
{ "active": { "path": "Drafts/note.draft.md", "name": "note.draft.md", "basename": "note.draft", "extension": "md" } }
```

An extension-less file (a name with no dot) active:

```json
{ "active": { "path": "Notes/README", "name": "README", "basename": "README", "extension": "" } }
```

### Example 3 — nothing active (success)

```json
{ "target_mode": "active" }
```

→ empty workspace / all panes closed / a non-file view in front:

```json
{ "active": null }
```

Branch on `active === null` — this is **not** an error.

### Example 4 — a named vault, cross-vault

With vault `A` focused and vault `B` open-but-unfocused (its active file `B-note.md`):

```json
{ "target_mode": "specific", "vault": "B" }
```

→ B's active file, no manual switch to B:

```json
{ "active": { "path": "B-note.md", "name": "B-note.md", "basename": "B-note", "extension": "md" } }
```

### Example 5 — confirm-before-act round-trip

```json
{ "target_mode": "active" }
```

→ take `active.path` and reuse it as the `path` locator for a follow-up `read` / edit in `target_mode: "specific"` against the same file. The returned `path` is the resolved vault-relative path, usable verbatim.

## Error roster

Every failure routes through `UpstreamError`. The no-active-file state is **not** in this table — it is `{ active: null }` success.

| `code` | `details` | Meaning | Recovery |
|--------|-----------|---------|----------|
| `VALIDATION_ERROR` | `issues[].path` | Missing `vault` in `specific` mode; `vault` supplied in `active` mode; any `file`/`path` locator; unknown field. Fires before any eval. | Fix the flagged field; supply `vault` only in `specific` mode; drop any locator. |
| `CLI_REPORTED_ERROR` | `code: "VAULT_NOT_FOUND"`, `reason: "unknown"`, `vault` | `vault` matches no registered Obsidian vault — the sole hard vault error. Never `{ active: null }`, never another vault's data. | Use `vaults` to list registered names; correct the typo. |
| `CLI_REPORTED_ERROR` | `stage: "json-parse" \| "envelope-parse"`, `stdout` | The eval returned a body the handler cannot interpret. Should not occur in normal operation. | Report with the payload; retry once for a transient failure. |
| `CLI_NON_ZERO_EXIT` | `reason: "obsidian-not-running"` | Obsidian is down and could not be launched within the bound — e.g. auto-launch is disabled (`OBSIDIAN_AUTO_LAUNCH=0`). | Start Obsidian (or enable auto-launch), then retry. |
| `CLI_BINARY_NOT_FOUND` | — | The `obsidian` CLI binary could not be found. | Install / expose the Obsidian CLI on `PATH` (or set `OBSIDIAN_BIN`); retry. |

A registered vault that is merely **closed** or **unfocused** is **not** an error — it is a success path (inherited dispatch recovery, ADR-029/030).

### Failure examples

```json
{ "target_mode": "specific" }
```
→ `VALIDATION_ERROR` — `vault` is required in `specific` mode.

```json
{ "target_mode": "active", "vault": "B" }
```
→ `VALIDATION_ERROR` — `vault` is not allowed in `active` mode.

```json
{ "target_mode": "active", "path": "x.md" }
```
→ `VALIDATION_ERROR` — no `file`/`path` locator is accepted; the active file is the implicit target.

```json
{ "target_mode": "specific", "vault": "NoSuchVault" }
```
→ `CLI_REPORTED_ERROR` / `VAULT_NOT_FOUND` / `reason: "unknown"` — the vault name is not registered.

For the full error roster and recovery hints inline in an MCP client, call `help({ tool_name: "get_active_file" })`.

## What get_active_file does NOT do

- Never changes which file is active (pure read — no focus change, even in `specific` mode).
- Reports no pane / split / leaf info, and no cursor / heading / block position.
- Does not report a non-file view (a plugin panel) as the active file — that maps to `{ active: null }`.
- Does not accept a `file` / `path` locator — it reports whatever is active, it does not look a file up.
