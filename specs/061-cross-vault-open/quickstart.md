# Quickstart: Open Cross-Vault Files

Manual validation scenarios for the modified `open_file`. Run against the authorised `TestVault-Obsidian-CLI-MCP` plus a **second** registered vault (confirm/stage with the user — do not register vaults unprompted). Drive `Obsidian.com`. Fixtures under `Sandbox/`; clean up after. Windows is the reference host; macOS/Linux scenarios are flagged for user validation.

Let **A** = `TestVault-Obsidian-CLI-MCP`, **B** = the second vault. Each scenario lists the call, the expected response, and the FR/SC it covers.

## S1 — Open in an open-but-unfocused vault (US1, P1)

1. Open both A and B in Obsidian; make **A** the focused vault.
2. Seed `Sandbox/cv-s1.md` in **B**.
3. Call `open_file({ vault: "B", path: "Sandbox/cv-s1.md" })`.
4. **Expect**: focus switches to **B**; `cv-s1.md` is the active file; response `{ opened: "Sandbox/cv-s1.md", vault: "B", new_tab: false, placement: "active_tab_used" }`. (FR-001, FR-003, FR-019; SC-001, SC-006)
5. Confirm A is still open in its own window (focus only moved). (FR-004; SC-007)

## S2 — Open in a closed-but-registered vault (US2, P2)

1. Ensure **B** is **closed** (registered, not open) and Obsidian (app) is running on A.
2. Call `open_file({ vault: "B", path: "Sandbox/cv-s2.md" })` (seed the file first via a one-off, or expect `FILE_NOT_FOUND` and seed then re-run).
3. **Expect**: B is brought up and focused; the file opens; single successful response — no manual open of B, no caller retry, even though the first internal attempt hit the switch/cold-launch window. (FR-002, FR-005; SC-002)

## S3 — App fully down (US2 + inherited BI-060)

1. Quit Obsidian entirely.
2. Call `open_file({ vault: "B", path: "Sandbox/cv-s2.md" })`.
3. **Expect**: Obsidian launches focused toward the requested vault (inherited dispatch recovery), the file opens, single successful response. (FR-002, FR-005)
4. **Opt-out variant**: set `OBSIDIAN_AUTO_LAUNCH=0`, quit Obsidian, repeat → **error** `CLI_NON_ZERO_EXIT` / `details.reason:"obsidian-not-running"`, nothing launched. (FR-016; SC-009)

## S4 — Placement outcomes (US3/US4)

With **B** focused (after S1):
1. `open_file({ vault:"B", path:"Sandbox/cv-s1.md", new_tab:true })` → `placement:"new_tab_created"`; A-side prior file still open in its own tab. (FR-009; SC-004)
2. With `cv-s1.md` already open, `open_file({ vault:"B", path:"Sandbox/cv-s1.md" })` (new_tab false) → `placement:"existing_tab_reused"`; no duplicate tab. (FR-010; SC-005)
3. With a not-yet-open `Sandbox/cv-s4.md`, `open_file({ vault:"B", path:"Sandbox/cv-s4.md" })` → `placement:"active_tab_used"`. (FR-011)
4. With `cv-s1.md` open, `open_file({ vault:"B", path:"Sandbox/cv-s1.md", new_tab:true })` → `placement:"new_tab_created"` (forced fresh tab). (FR-009)

Each placement is read from the response alone — no visual inspection needed. (SC-003)

## S5 — Distinct errors (US5)

1. `open_file({ vault: "NoSuchVault", path: "x.md" })` → `CLI_REPORTED_ERROR` / `details.code:"VAULT_NOT_FOUND"` / `reason:"unknown"`; nothing opened. (FR-013; SC-004)
2. `open_file({ vault: "B", path: "Sandbox/does-not-exist.md" })` → `CLI_REPORTED_ERROR` / `details.code:"FILE_NOT_FOUND"`; nothing opened, no fabricated success. (FR-014; SC-005)
3. Confirm (1) is distinguishable from a closed-but-openable B (S2 succeeds where (1) errors). (FR-015; US5-AC1)

## S6 — Bare-name locator scoped to the requested vault (FR-006a)

1. Seed a note named `dup-name.md` in **both** A (`Sandbox/`) and B (`Sandbox/`), with distinguishable content.
2. With **A** focused, call `open_file({ vault:"B", file:"dup-name" })`.
3. **Expect**: focus switches to B; the **B** copy opens (verify by content), never A's copy; `placement` per S4 rules. A miss → `FILE_NOT_FOUND`. (FR-006a, FR-014)

## S7 — Same-vault open unchanged (regression — performance/behaviour)

1. With **A** focused, `open_file({ vault:"A", path:"Sandbox/cv-s7.md" })`.
2. **Expect**: opens immediately with no extra overhead (one vault-targeted eval) — behaviour identical to BI-057 plus the new `placement` field. (Technical Context "same-vault untouched")

## macOS / Linux flag

Cross-vault open is a plain `vault=X eval` through `dispatchCli`; app-down/cold-start recovery rides ADR-029/030 (already cross-platform). Re-run S1–S3 on macOS/Linux to confirm cross-vault routing and recovery behave equivalently; record any platform divergence.

## Cleanup

Remove all `Sandbox/cv-*.md` and `dup-name.md` fixtures from both vaults; restore the user's original focused vault; leave `Welcome.md` untouched.
