# Contract: `open_file` cross-vault open

The behavioural contract for the modified `open_file` tool. Supersedes the BI-057 focused-vault-precondition contract. Maps each clause to spec FRs.

**Mechanism (ADR-031)**: `open_file` stays eval-composed; the in-eval focused-vault guard is demoted to a `VAULT_NOT_FOCUSED` switch-signal, on which the handler fires ADR-030's `obsidian://open?vault=<requested>` opener (reused `launchObsidian`) + a bounded verify-poll until focus lands. App-down/cold-start recovery is inherited from `dispatchCli`; the locator resolves in the verified-focused target vault; `placement` is derived in-eval via an explicit three-way branch. The native `open`/`tab:open` route was probed and **rejected (OQ-1, 2026-06-01)** — native `open` opens in the active leaf and cannot focus an existing tab, so it cannot deliver `existing_tab_reused`; only an eval can. See research.md D1/D8 + contracts/t0-probe-findings.md.

## Input (unchanged from BI-057)

- `vault` (string, required) — the **requested** vault to open in (focused, open-but-unfocused, or closed-but-registered).
- Exactly one of `path` (vault-relative) or `file` (bare name; no `[[ ]]`).
- `new_tab` (boolean, default `false`).
- `.strict()` — unknown fields rejected.

Locator acceptance is **static** — it never depends on which vault is focused at call time (FR-006a, Principle III).

## Success output

```json
{ "opened": "<resolved vault-relative path>", "vault": "<requested vault>", "new_tab": <bool>, "placement": "<outcome>" }
```

- `vault` names the vault the file was opened in (FR-019, US1-AC2).
- `placement` ∈ { `new_tab_created`, `existing_tab_reused`, `active_tab_used` } — exactly one (FR-008).

## Behaviour

1. **Cross-vault focus switch** (FR-001, FR-002, FR-003): the open switches Obsidian's focus to the requested vault regardless of which vault was focused at call time — open-but-unfocused vaults are re-focused, closed-but-registered vaults are brought up and focused. No human pre-switch.
2. **Previously-focused vault preserved** (FR-004): focus moves; the prior vault stays open; no Obsidian setting/config is changed (FR-021).
3. **Transient-failure recovery** (FR-005, FR-006, US2-AC2): the switch-landing/cold-launch window is absorbed automatically — the handler's bounded verify-poll for the app-up case, the inherited `dispatchCli` recovery (ADR-030 launch / ADR-029 cold-start) for the app-down/warm-up case. Bounded; no caller retry; no hang (SC-009).
4. **Placement reporting** (FR-008..FR-011):
   - `new_tab:true` → `new_tab_created`.
   - `new_tab:false` & file already open in the target vault → `existing_tab_reused` (no duplicate).
   - `new_tab:false` & not already open → `active_tab_used`.
5. **Locator scoped to the requested vault** (FR-006a, FR-014): `path`/bare-`file` resolve in the now-focused target vault; a miss → `FILE_NOT_FOUND`, never a silent open of a same-named file in another vault.
6. **Type generality retained** (FR-020): every recognised type opens via its native viewer with the same output shape; no new per-type handling.

## Error roster (all reuse existing codes/reasons — FR-018)

| Condition | `code` | `details` |
|-----------|--------|-----------|
| Unknown/unregistered vault (FR-013) — **sole hard vault error** | `CLI_REPORTED_ERROR` | `code:"VAULT_NOT_FOUND"`, `reason:"unknown"`, `vault` |
| File not found in requested vault (FR-014) | `CLI_REPORTED_ERROR` | `code:"FILE_NOT_FOUND"`, `path`, `vault` |
| Unsupported file type (retained from BI-057) | `CLI_REPORTED_ERROR` | `code:"UNSUPPORTED_FILE_TYPE"`, `extension`, `path`, `vault` |
| Requested vault could not be focused/brought up within bound, or app-down + `OBSIDIAN_AUTO_LAUNCH` opt-out (FR-016) | `CLI_NON_ZERO_EXIT` | `reason:"obsidian-not-running"` |
| Input validation (missing vault; both/neither locator; bracketed `file`; unsafe `path`/`file`; unknown field; non-bool `new_tab`) | `VALIDATION_ERROR` | field paths |
| Malformed eval envelope | `INTERNAL_ERROR` | `stage` |

The three vault/file/launch outcomes are mutually distinguishable (FR-015): `VAULT_NOT_FOUND/unknown` vs `FILE_NOT_FOUND` vs `obsidian-not-running`.

**No new top-level error code; no new `details.reason`.** `VAULT_NOT_FOUND/reason:"not-open"` is no longer emitted by `open_file` (its case is now a success path) but remains in the ADR-015 enum (additive-only).

## Distinguishability matrix (US5)

| Requested vault state | Outcome |
|-----------------------|---------|
| Unregistered / typo | **error** `VAULT_NOT_FOUND/unknown` |
| Closed but registered | **success** (brought up + focused) |
| Open but unfocused | **success** (focused) |
| Registered, app down, recoverable | **success** (inherited launch) |
| Registered, app down, opt-out/launch-failed | **error** `obsidian-not-running` |
| Valid vault, file absent | **error** `FILE_NOT_FOUND` |

## Out of scope (negative — retained)

No Obsidian settings/config change (FR-021); no vault creation (FR-022); no pane/leaf ids or split geometry (FR-012/FR-023); no external paths, content edits, intra-file navigation, or tab management beyond the `new_tab` opt-in (BI-057 retained).
