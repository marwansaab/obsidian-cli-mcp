# Quickstart — Recover Closed Obsidian (manual validation)

**Feature**: 060-recover-closed-obsidian
**Date**: 2026-05-30

These are manual, real-CLI validation scenarios for a reviewer. They complement the in-process vitest unit tests (which mock `invokeCli`/`spawn`). Per `.memory/test-execution-instructions.md`, drive `Obsidian.com` (or bare `obsidian`), use the authorised `TestVault-Obsidian-CLI-MCP`, and keep probes read-only unless a scenario says otherwise. The Windows scenarios were exercised at plan-time (see contracts/t0-probe-findings.md); the macOS/Linux scenarios are the cross-platform gaps that need a host the author did not have.

> Note: scenarios that launch Obsidian will open a window on the desktop — expected. A launched app is left running (spec: not torn down).

---

## Scenario A — Operations complete when Obsidian is closed (P1 / US1) — Windows ✅ plan-time

1. Close Obsidian completely (`Get-Process Obsidian` → none).
2. Through the MCP server (or a harness calling `invokeCli`), issue a valid op, e.g. `files vault=TestVault-Obsidian-CLI-MCP`.
3. **Expect**: the call returns the normal file list on a single call, no manual start. A `dispatch.recovery` log line with `outcome:"recovered"` and a `readyMs` (~3000) is emitted.
4. **Verify** the raw mechanism (no MCP): with the app closed, run `obsidian vault=TestVault-Obsidian-CLI-MCP files` → app-down (`exit 1`, `unable to find Obsidian`); then `Start-Process "obsidian://open?vault=TestVault-Obsidian-CLI-MCP"`; re-run `files` within a few seconds → normal list.

## Scenario B — Actionable error when recovery impossible (P2 / US2)

1. Simulate "cannot launch": set the opt-out (Scenario D) **or** point the launcher at a non-existent opener.
2. With Obsidian closed, issue a valid op.
3. **Expect**: a single `UpstreamError` with `code:"CLI_NON_ZERO_EXIT"`, `details.reason:"obsidian-not-running"`, and a message naming the cause + "start Obsidian and try again." It is **not** a raw pass-through and is programmatically distinguishable from success / cold-start / a generic non-zero exit.

## Scenario C — Normal case unchanged (P3 / US3)

1. Start Obsidian, open the vault, wait until ready.
2. Issue a range of ops and compare latency/behaviour against the current baseline.
3. **Expect**: no `dispatch.recovery` log line, no launch, no measurable added latency — identical to today (the recovery loop is never entered because the first attempt does not throw app-not-running).

## Scenario D — Opt-out suppresses recovery (FR-013 / SC-006)

1. `OBSIDIAN_AUTO_LAUNCH=0` (or `false`/`no`/`off`).
2. Close Obsidian; issue a valid op.
3. **Expect**: **zero** application launches; the Scenario-B error surfaces immediately with the opt-out message (`auto-launch is disabled (OBSIDIAN_AUTO_LAUNCH)`); a `dispatch.recovery` line with `outcome:"disabled"`, `launched:false`.

## Scenario E — Mutation safety during recovery

1. Close Obsidian. Seed `Sandbox/recover-probe-<runId>.md` (use a unique per-run name).
2. Issue a mutating op against the closed app (e.g. `append` to that file) so it triggers app-down → launch → re-attempt.
3. **Expect**: the append applies **exactly once** (re-attempt is safe because the app-down first attempt never executed). Verify file content has a single appended block.
4. Clean up: delete the Sandbox fixture and any `.trash/` residue.

---

## Cross-platform gaps to validate (macOS / Linux) — flagged for the user

The launch mechanism and the app-down signal are CLI-emitted and expected identical across OSes, but were only verified on Windows. Please capture:

### macOS
1. Quit Obsidian. Run `obsidian vault=<your vault> files` → record exit code + stderr. **Expect** stderr contains `unable to find Obsidian`.
2. Run `open "obsidian://open?vault=<your vault>"`; poll `obsidian version` until `exit 0`. **Record** seconds-to-ready (should be < 30 s).

### Linux
1. Quit Obsidian (AppImage/flatpak/snap). Run `obsidian vault=<your vault> files` → record exit code + stderr. **Expect** `unable to find Obsidian`.
2. Run `xdg-open "obsidian://open?vault=<your vault>"`; poll `obsidian version` until `exit 0`. **Record** seconds-to-ready. (On a headless box with no desktop session, `xdg-open` will not launch — **expect** the Scenario-B distinct error after the bound, which is correct.)

Report any difference in the stderr literal (would require widening `APP_NOT_RUNNING_PATTERN`) or readiness time exceeding 30 s (would require raising `OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS`).
