# T0 Live-CLI Probe Findings — Retry Cold Start (ADR-029)

**Run**: 2026-05-30 | **Host**: Windows 11 Pro
**Vault**: `TestVault-Obsidian-CLI-MCP` (no plugins), driven in the **registered-but-closed** state per `.memory/test-execution-instructions.md`. stdout/stderr/exit captured separately via `Start-Process -RedirectStandardOutput/-RedirectStandardError`.

> ## Correction notice (binary): probes re-run against `Obsidian.com`
>
> The **first probe pass used `C:\Program Files\Obsidian\Obsidian.exe` directly** — the 210 MB GUI-subsystem Electron binary. That was wrong: per the project rule (Best Practices + CLI Tool Notes, 2026-05-27) direct-CLI probes must drive **`Obsidian.com`**, the 22 KB console shim, which is what the production `binary-resolver` actually spawns (`OBSIDIAN_BIN` unset → win32 skips platform-default → bare `"obsidian"` → PATH+PATHEXT resolves `.COM` ahead of `.EXE`). The GUI `.exe` detaches stdio in a console, producing a **misleading empty-stdout/exit-0** for cold commands and surfacing no errors — exactly the false-clean class the rule warns about (the same trap behind the reverted BI-0120 / ADR-009 / TC-00458 false-flips). All load-bearing findings below are from the **`.com` re-run**; the `.exe` empty-exit-0 is recorded only as the artifact it was.
>
> (`.memory/test-execution-instructions.md` states `obsidian` resolves to `…\obsidian.exe` on this host — that line is inaccurate and was flagged to the user for correction; not edited here.)

These findings close OQ-001..OQ-007, pin the cold-start signature, decide the form-(b) ship/drop gate, and decide the pre-retry delay. They feed ADR-029 (Decided) and the architecture doc.

## Pinned signature — the command-not-found PREFIX (not a suffix)

The cold-start of any command issued against a registered-but-closed vault is, on **exit 0, stdout**:

```
Error: Command "<cmd>" not found.<suffix>
```

The **suffix varies by edit-distance** to known commands, so it is NOT part of the invariant:

| Command (state) | exit | stdout (verbatim, `.com`) |
|---|---|---|
| `read` (cold) | 0 | `Error: Command "read" not found. Did you mean: sync:read, daily:read, template:read?` |
| `eval` (cold) | 0 | `Error: Command "eval" not found. It may require a plugin to be enabled.` |
| `frobnicate` (unknown, warm) | 0 | `Error: Command "frobnicate" not found. It may require a plugin to be enabled.` |

The invariant is the **prefix** `Error: Command "<cmd>" not found.`, matched by `COLD_START_PATTERN = /^\s*Error: Command "[^"]*" not found\./` (command- and suffix-independent, FR-002). `dispatchCli` priority (c) classifies it as **`CLI_REPORTED_ERROR`**. The pattern deliberately excludes the adjacent `File not found` / `Folder "x" not found.` / facade `Vault not found.` signatures (not command-registry misses).

> An earlier (`.exe`-era) pin used the substring `"not found. It may require a plugin to be enabled."`. That **silently missed the `read`-style "Did you mean" cold-start** — a correctness bug, since `read` is a core MCP path. Corrected to the prefix pattern.

## Decisions

| Decision | Outcome | Evidence |
|---|---|---|
| **Form (a) ship** | **SHIP, unconditional, all commands** | The `Error: Command "<cmd>" not found.` signature is real on `.com`, exit-0, stdout, classified `CLI_REPORTED_ERROR`; the registry was not loaded so the command did not execute → safe for mutating commands too. |
| **Form (b) `Stream closed`** | **NOT retried (dropped)** | Decided on **safety**, not on a negative observation: a dropped transport pipe carries no evidence of *where* in the command lifecycle it fired, so retrying it could double-apply a non-idempotent mutation (research D5). The default-safe posture is to leave `Stream closed` single-shot. (No `Stream closed` was elicited in the `.com` probes either, but `Stream closed` is intermittent — a non-observation is explicitly NOT treated as evidence it cannot occur.) |
| **Pre-retry delay** | **NONE (immediate)** | The immediate retry recovered on `.com` for both `read` and `eval` (attempt 2 returned real output). The ~1.0–1.04 s per-call cost is constant CLI round-trip overhead (warm calls cost the same), not a launch window the retry races. |

## Probe results (verbatim, `.com`)

### Warm baseline (vault OPEN) — confirms commands are valid on `.com`

| Command | exit | stdout |
|---|---|---|
| `read path=Welcome.md` | 0 | full Welcome.md body (240 B) |
| `files total` | 0 | `325` |
| `search query=vault` | 0 | 7 matching paths |
| `eval code=app.vault.getName()` | 0 | `=> TestVault-Obsidian-CLI-MCP` |

### P0-1 / P0-7 — cold manifestation + signature uniformity (OQ-001, OQ-007)

From a freshly-closed vault, the **first** command (cold) then an immediate re-issue:

| Probe | exit | stdout |
|---|---|---|
| `read path=Welcome.md` (attempt 1, cold) | 0 | `Error: Command "read" not found. Did you mean: sync:read, daily:read, template:read?` |
| `read path=Welcome.md` (attempt 2, immediate) | 0 | full Welcome.md body → **recovered** |
| `eval code=app.vault.getName()` (attempt 1, cold) | 0 | `Error: Command "eval" not found. It may require a plugin to be enabled.` |
| `eval` (attempt 2, immediate) | 0 | `=> TestVault-Obsidian-CLI-MCP` → **recovered** |

Three cold/unknown samples (`read`, `eval`, `frobnicate`) confirm the `Command "<cmd>" not found.` prefix is command-independent; the suffix is not. **No empty-exit-0 on `.com`** — that manifestation was purely an `.exe` stdio-detachment artifact.

### P0-2 — `Stream closed` surface form (OQ-002, D4)

**Not elicited** across the `.com` probes (read/eval/files/search/unknown, cold and warm). Because `Stream closed` is intermittent and the form-(b) drop rests on a *safety* argument (above), a non-observation neither clears nor is required to drop it. No `STREAM_CLOSED_SURFACE` constant is defined.

### P0-3 — pre-retry delay (OQ-003)

**Immediate retry succeeds** (see P0-1: attempt 2 recovered for both `read` and `eval` with no inserted delay). ~1 s per call is constant overhead, not a launch window. **Decision: immediate, no delay.**

### P0-4 — form-(b) mutation safety (OQ-005, D5 gate)

**N/A — not run.** Needed only to *clear form (b) for shipping*; since form (b) is dropped on the safety argument regardless, no destructive `Stream closed`-vs-mutation probe was performed. No `Sandbox/` fixtures were seeded; no `.trash/` residue produced.

### P0-5 — no-masking on a genuine unknown (OQ-004)

`frobnicate` / `vault:open` return the form-(a) signature; a genuinely unknown command re-runs identically on retry (still "Command not found") and the original `CLI_REPORTED_ERROR` propagates after exactly one retry. Bounded single-retry + second-attempt-authoritative behaviour is exercised deterministically in the unit suite (`_dispatch.test.ts` US2 cases).

### P0-6 — both facades (OQ-006)

Both facades route every command through the single `dispatchCli` primitive (verified structurally: exactly two facade callers). The retry is inherited identically; asserted in the unit suite via facade-inheritance tests using the verbatim `.com` "Did you mean" cold stdout (`cli-adapter.test.ts`, `invoke-bounded-cli.test.ts`).

## Net effect on the implementation

- `COLD_START_PATTERN = /^\s*Error: Command "[^"]*" not found\./` — the command-not-found prefix, command- and suffix-independent.
- `isColdStart` = **form (a) only**: `value instanceof UpstreamError && value.code === "CLI_REPORTED_ERROR" && typeof value.details?.stdout === "string" && COLD_START_PATTERN.test(value.details.stdout)`.
- **No form (b)**: `Stream closed` is left single-shot on the mutation-safety argument; no matcher, no PATH-4 resolved-stdout inspection, no `Stream closed` test. The `emitError` stub (T002) remains as harmless infrastructure.
- **No pre-retry delay.**
- The `.exe` empty-exit-0 manifestation is an artifact of probing the wrong binary, not a real production behaviour; the earlier FR-013 "cold valid command returns empty success" claim is withdrawn. (FR-013's distinct eval-envelope focused-vault-mismatch case — a vault opens but the wrong one is focused, yielding a well-formed `VAULT_NOT_FOCUSED`/`VAULT_NOT_FOUND` envelope handled by the tool's own guard — remains real and out of dispatch-layer scope; it is unrelated to the `.exe` artifact.)
