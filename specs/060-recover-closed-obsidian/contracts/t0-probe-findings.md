# T0 Live-CLI Probe Findings — Recover Closed Obsidian

**Feature**: 060-recover-closed-obsidian
**Date**: 2026-05-30
**Host**: Windows 11, `C:\Program Files\Obsidian\Obsidian.com` (CLI 1.12.7 / installer 1.12.7)
**Vault**: `TestVault-Obsidian-CLI-MCP` (authorised test vault; bare, no plugins)
**Binary discipline**: all probes drove the production-resolved **`Obsidian.com`** shim (never the GUI `Obsidian.exe`, whose detached stdio gives a misleading empty-exit-0). stdout/stderr captured to separate files via `Start-Process -RedirectStandardOutput/-RedirectStandardError`. Per `.memory/test-execution-instructions.md`.

All probes were read-only (`version`, `files`, `read`) — no destructive operations, no vault mutation.

---

## Probe 1 — application-not-running signal (app fully closed)

Pre-condition: **no Obsidian process running** (`Get-Process Obsidian` → none).

| argv | exit | stdout | stderr |
|------|------|--------|--------|
| `obsidian version` | `1` | *(empty)* | `The CLI is unable to find Obsidian. Please make sure Obsidian is running and try again.\n` |
| `obsidian vault=TestVault-Obsidian-CLI-MCP files` | `1` | *(empty)* | `The CLI is unable to find Obsidian. Please make sure Obsidian is running and try again.\n` |
| `obsidian vault=TestVault-Obsidian-CLI-MCP read file=Welcome` | `1` | *(empty)* | `The CLI is unable to find Obsidian. Please make sure Obsidian is running and try again.\n` |

**Findings**:
- The signal is **byte-identical across all three commands** → command-agnostic (confirms FR-002).
- **exit code 1, empty stdout, the message on stderr.** This maps to the dispatch four-priority classifier's **priority (a) → `CLI_NON_ZERO_EXIT`** (`code !== 0`).
- The message is emitted by the **CLI itself**, independent of the OS → expected identical on macOS/Linux (unverified — see quickstart.md validation steps).
- Distinct from the ADR-029 cold-start signal (`exit 0` + stdout `Error: Command "<cmd>" not found.`). The two never collide: app-down is a non-zero exit with stderr; cold-start is exit-0 with stdout. (Confirms FR-001 — recovery and the in-application retry are told apart.)
- **Pinned pattern**: `APP_NOT_RUNNING_PATTERN = /unable to find Obsidian/i` (tolerant match on the invariant CLI clause). The dispatch layer attaches `details.reason = "obsidian-not-running"` to the `CLI_NON_ZERO_EXIT` when stderr matches.

---

## Probe 2 — launch via `obsidian://` URI + readiness window

Pre-condition: **no Obsidian process running** (app-down confirmed: `version` and `files` both APP_DOWN before launch).

Action: `Start-Process "obsidian://open?vault=TestVault-Obsidian-CLI-MCP"` (the Windows equivalent of the `cmd /c start "" "<uri>"` opener), then poll `version` (app-level) and `files vault=…` (vault-level) every ~1 s, classifying each.

| t (s) | `version` | `files` |
|-------|-----------|---------|
| pre   | APP_DOWN  | APP_DOWN |
| ~3.1  | **READY** | **READY** |

**Findings**:
- The `obsidian://open?vault=X` URI **launched the closed application** and reached full readiness in **~3 s**.
- App-level and vault-level readiness arrived **together** — the URI focused the target vault, so **no cold-start (`Command "<cmd>" not found.`) window appeared** in this run. ADR-029's retry remains the backstop for the case where the URI does not fully prime the vault.
- Classification helper used (mirrors the planned dispatch logic):
  - `APP_DOWN` = exit 1 ∧ stderr matches `unable to find Obsidian`
  - `COLD_START` = exit 0 ∧ stdout matches `^\s*Error: Command "[^"]*" not found\.`
  - `READY` = exit 0 ∧ stdout does not start with `Error:`

**Bound derivation**: observed ~3 s on Windows → `OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS` default **30 000 ms** gives ~10× headroom for slower macOS/Linux cold starts while guaranteeing bounded termination (FR-004 / FR-010). Poll interval ~750 ms.

---

## Residue / cleanup

- No files created in the vault; nothing to clean under `Sandbox/`.
- The launch probe **started Obsidian** (it was intentionally closed by the user for this session). Per spec FR (a launched application is not torn down), the process was left running. The user may close it.

## Deferred to macOS/Linux (no host access this session)

- Confirm Probe 1's stderr literal is identical on macOS/Linux (assumed — CLI-emitted).
- Confirm Probe 2's launch via `open "<uri>"` (macOS) and `xdg-open "<uri>"` (linux) reaches readiness within the bound.

Both are scripted in [quickstart.md](../quickstart.md) for the user to run.
