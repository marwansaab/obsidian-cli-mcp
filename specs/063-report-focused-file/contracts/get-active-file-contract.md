# Behavioural Contract: `get_active_file`

The MCP-surface contract for the active-file read. Maps to FR-001..020 / SC-001..007. This is the design intent the implementation and tests assert against.

## Tool

- **Name**: `get_active_file` (eval-composed; ADR-010 N/A — no native subcommand).
- **Purpose**: report the active file (the note Obsidian currently has focused) of the targeted vault, so an agent can confirm what is active before acting (the explicit-discovery remedy for the ADR-003 implicit-active-state risk).

## Input

```jsonc
// active mode — the focused vault's active file
{ "target_mode": "active" }

// specific mode — a named vault's active file (cross-vault)
{ "target_mode": "specific", "vault": "MyVault" }
```

Rules (FR-009/014):
- `target_mode` required, one of `"active"` | `"specific"`.
- `vault` required in `specific`, forbidden in `active`.
- No `file` / `path` accepted in either mode (no locator — the active file is the implicit target).
- Strict: any unknown field is rejected.

## Output (success)

```jsonc
// a file is active
{ "active": { "path": "Folder/note.md", "name": "note.md", "basename": "note", "extension": "md" } }

// nothing is active (empty workspace / all panes closed / non-file view) — SUCCESS, not error
{ "active": null }
```

Guarantees:
- **C1 (FR-001)**: when a file is active, `active` carries its vault-relative `path`, `name`, `basename`, `extension`.
- **C2 (FR-002)**: `name === basename + extension`; `extension` is the final dot-delimited segment, `basename` the remainder. `"note.draft.md"` → `basename:"note.draft"`, `extension:"md"`.
- **C3 (FR-003)**: a name with no dot → `extension:""` and `name === basename`.
- **C4 (FR-004)**: non-ASCII characters returned raw (no NFC/NFD normalization).
- **C5 (FR-005/006)**: no active file → `{ active: null }`, a successful result distinguishable from a present one via `active === null`. Never an error, never a fabricated file. A non-file view in front maps here too (FR-020).
- **C6 (FR-007)**: the returned `path` is the resolved vault-relative path; it is directly usable as a `path` locator for a follow-up operation against the same file.
- **C7 (FR-011)**: in `specific` mode, `active` reflects the **named** vault's active file even when that vault is open but not the focused window (cross-vault; no focused-vault guard).
- **C8 (FR-015)**: response is file-only — no `vault` / `target_mode` echo, no pane / split / leaf info.

## Errors (FR-016 — zero new top-level codes)

| Condition | `code` | `details` |
|-----------|--------|-----------|
| Wrong/missing mode fields, locator supplied, unknown field, wrong type | `VALIDATION_ERROR` | zod field paths |
| `specific`, vault not registered | `CLI_REPORTED_ERROR` | `{ code:"VAULT_NOT_FOUND", reason:"unknown", vault }` |
| Malformed / non-JSON eval response | `CLI_REPORTED_ERROR` | `{ stage:"json-parse" \| "envelope-parse", stdout }` |
| App down and not launchable (`OBSIDIAN_AUTO_LAUNCH=0`) | `CLI_NON_ZERO_EXIT` | `{ reason:"obsidian-not-running", ... }` |
| `obsidian` binary missing | `CLI_BINARY_NOT_FOUND` | adapter details |

- **E1 (FR-010)**: an unregistered vault is a typed `VAULT_NOT_FOUND/unknown` error — never `{ active: null }` and never another vault's data.
- **E2**: a registered-but-closed vault, or app-down, is handled by inherited `dispatchCli` recovery (cold-start retry / launch); only an unrecoverable app-down surfaces `obsidian-not-running` (FR-012). `not-open` is **not** emitted (B1 false).

## Timing / recovery caveats (documented in `help`)

- **T1 (FR-008)**: the answer describes the active file at the moment of the lookup — a point-in-time snapshot that may be stale by the time a follow-up action runs. No locking/pinning.
- **T2 (FR-013)**: if an app-down launch fired, the relaunched vault's active file may differ (null / last-open) from the pre-down state — the answer reflects post-launch focus.

## Out of scope (negative guarantees)

- No pane / split / leaf info (FR-017). No cursor / heading / block position (FR-018). Never changes which file is active (FR-019). Non-file views are not reported as the active file (FR-020).

## Success-criteria trace

SC-001 ⇐ C1 (single active-mode call). SC-002 ⇐ C2/C3. SC-003 ⇐ C4. SC-004 ⇐ C5. SC-005 ⇐ C6. SC-006 ⇐ C7 + E1. SC-007 ⇐ T1 + T2.
