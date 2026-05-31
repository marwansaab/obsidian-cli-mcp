# T0 Probe Plan: Open Cross-Vault Files

Live-CLI probes per `.memory/test-execution-instructions.md` (authorised `TestVault-Obsidian-CLI-MCP`, `Sandbox/` scratch, **drive `Obsidian.com`**, capture stdout/stderr separately).

## Plan-time findings already captured (2026-06-01)

A user-requested probe was run at plan-time (unusually early) and **settled the mechanism**. Captured in research.md "T0 FINDINGS"; summary:

- Native `open` / `tab:open` commands exist and **honour `vault=`, switching focus cross-vault** (B1 applies only to `eval`). `open` (no `newtab`) reuses an open tab; `newtab` creates a new one; `tab:open` always new.
- Success stdout: `Opened: <resolved path>` (exit 0) — **no placement reported**.
- Errors: `Vault not found.` (→ `VAULT_NOT_FOUND/unknown`), `Error: File "…" not found.` (→ `FILE_NOT_FOUND`) — both disjoint from the cold-start signature.
- Spaced vault names pass verbatim as one `vault=<name>` argv token (production uses a spawn argv array).

## Remaining implement-phase probes (defaults stated)

| Probe | Question | Reasonable default |
|-------|----------|--------------------|
| **OQ-A** | Placement detection: does `tabs`/`tabs ids` honour `vault=` cross-vault (lists a non-focused vault's tabs; empty for a closed vault)? How to identify the target leaf from `[type] basename\t<id>` (basename-only, no active marker)? Reuse-vs-active reliability for `new_tab=false`. | before/after `tabs ids` diff in the requested vault; match resolved basename + leaf-id set; `new_tab=true` skips the check (deterministic `new_tab_created`). |
| **OQ-B** | Does native `open` surface a distinct **unsupported-file-type** signal vs `FILE_NOT_FOUND` (open a `.unknownext`)? | No distinct signal → drop `UNSUPPORTED_FILE_TYPE`; native viewer handles every recognised type (FR-020 holds). |
| **OQ-C** | Does `Opened: <path>` return the resolved vault-relative path for both `path=` and bare `file=` (incl. attachments — image/PDF/canvas)? | Yes → `opened` is canonical regardless of locator (FR-003 parity). |
| **OQ-D** | Cross-window focus: does `open vault=X` switch to a vault open in a **separate OS window** (plan-time probe used same-window switching)? macOS/Linux equivalence. | Yes; document any platform divergence (quickstart, spec edge case). |
| **OQ-E** | App-down: does the native `open` inherit the dispatch launch and land on the **requested** vault (specific-mode `vault=` threads into `obsidian://open?vault=`)? `OBSIDIAN_AUTO_LAUNCH=0` → `obsidian-not-running`, no launch? | Yes (specific mode sets `dispatchInput.vault`); opt-out → reused `obsidian-not-running`. |

## Safety / scope

- Cross-vault and closed-vault probes change which vault Obsidian shows — coordinate with the user (the plan-time probe switched the focused vault and was restored afterward). Do not close or reconfigure any vault. Repeated `open newtab` accumulates tabs in the test vault — harmless, closeable; note any residue.
- Bare-name wrong-vault probe (OQ-C/FR-006a): stage a same-named note in the target `Sandbox/` and a second vault; request it cross-vault; assert the **target** copy opened, never the other vault's.
- Clean up `Sandbox/` fixtures; leave `Welcome.md` untouched. Re-confirm any negative against `Obsidian.com` (`.exe` false-clean artifact).
