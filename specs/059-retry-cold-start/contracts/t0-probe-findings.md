# T0 Live-CLI Probe Findings — Retry Cold Start (ADR-029)

**Run**: 2026-05-30 | **Host**: Windows 11 Pro | **Binary**: `C:\Program Files\Obsidian\obsidian.exe` (`Obsidian CLI`)
**Vault**: `TestVault-Obsidian-CLI-MCP` (no plugins), driven in the **registered-but-closed** state per `.memory/test-execution-instructions.md`. The `obsidian` binary was invoked directly (not through `dist/index.js`); stdout/stderr/exit captured separately via `Start-Process -RedirectStandardOutput/-RedirectStandardError`.

These findings close OQ-001..OQ-007, pin `COLD_START_INVARIANT`, decide the form-(b) ship/drop gate, and decide the pre-retry delay. They feed ADR-029 (flip Proposed → Decided, T033) and the architecture doc (T034).

## Pinned constant

- **`COLD_START_INVARIANT = "not found. It may require a plugin to be enabled."`** — confirmed verbatim. Captured exit-0 stdout for an unknown command:
  - `Error: Command "frobnicate" not found. It may require a plugin to be enabled.`
  - `Error: Command "vault:open" not found. It may require a plugin to be enabled.`
  - Both: `exitCode: 0`, literal on **stdout**, stderr empty. `dispatchCli` priority (c) classifies these as **`CLI_REPORTED_ERROR`** (stdout `trimStart()` begins `Error:`). The substring is command-name-independent (the interpolated command name precedes it), so the substring match (Q4) is correct; exact-equality would break FR-002.

## Decisions

| Decision | Outcome | Evidence |
|---|---|---|
| **Form (a) ship** | **SHIP, unconditional, all commands** | The `...not found. It may require a plugin to be enabled.` signature is real, exit-0, stdout, classified `CLI_REPORTED_ERROR`. Safe by registry-not-ready semantics. |
| **Form (b) `Stream closed`** | **DROPPED** | `Stream closed` was **never observed** across all probes (read/search/eval/files/unknown, cold and warm). Per the research default-safe posture (inconclusive → drop), form (b) ships nothing. No `STREAM_CLOSED_SURFACE` constant is defined; no `emitError`-driven form-(b) tests are added. |
| **Pre-retry delay** | **NONE (immediate)** | The immediate retry recovered (see P0-3). The ~1.0–1.04 s elapsed per call is the CLI's baseline round-trip overhead (present on warm `eval`/`files`/`unknown` calls too), not a cold-launch window the retry races. Default immediate retry stands. |

## Probe results (verbatim)

### P0-1 / P0-7 — form-(a) signature uniformity + command kinds (OQ-001, OQ-007)

| Command (state) | exit | stdout | manifestation |
|---|---|---|---|
| `read path=Welcome.md` (cold, attempt 1) | 0 | empty (bare `\n`) | **well-formed empty success** (index-not-ready), NOT form (a) |
| `read path=Welcome.md` (warm, attempt 2) | 0 | full Welcome.md body | success |
| `search query=vault` (cold) | 0 | empty | well-formed empty success |
| `eval code=app.vault.getName()` (warm by then) | 0 | `=> TestVault-Obsidian-CLI-MCP` | success |
| `eval code=1+1` (warm) | 0 | `=> 2` | success |
| `files` (warm) | 0 | full file listing (325 files) | success |
| `files total` (warm) | 0 | `325` | success |
| `frobnicate` (unknown) | 0 | `Error: Command "frobnicate" not found. It may require a plugin to be enabled.` | **form (a)** → `CLI_REPORTED_ERROR` |
| `vault:open` (unknown/TUI-only) | 0 | `Error: Command "vault:open" not found. It may require a plugin to be enabled.` | **form (a)** → `CLI_REPORTED_ERROR` |

**Key finding (honest scope note)**: on this host/version, a **valid core command** (`read`, `search`) issued against a cold (registered-but-closed) vault manifests as **empty stdout, exit 0** — the "well-formed empty/wrong success" manifestation, which `dispatchCli` resolves as **success**. The retry therefore does **not** fire for it — correctly, because retrying an exit-0 empty result is indistinguishable from a legitimately empty read/search and would risk masking a real empty result (the D4 PATH-4 danger). This manifestation is the **FR-013 out-of-scope** case (closes the FR-013 doc-guard, L2): it is the index-not-ready analogue of the focused-vault-mismatch eval envelope, handled — if at all — by a tool's own guards, never by the dispatch-layer retry.

The **form-(a) signature** (`Command "<cmd>" not found. It may require a plugin to be enabled.`) is the cold manifestation for commands **not in the active command registry** — genuinely unknown commands and, in the field, **plugin-backed commands whose plugin has not yet registered its command** on a freshly-loaded vault (e.g. the Smart Connections / Bases-backed tools). Those are exactly what form (a) recovers. The no-plugin test vault cannot exhibit a *valid* plugin command going from unregistered→registered, so the signature was elicited via unknown commands, which produce the byte-identical literal.

### P0-2 — `Stream closed` surface form (OQ-002, D4)

**Not observed.** No probe (cold or warm, read/search/eval/files/unknown) ever produced `Stream closed` on stdout, stderr, a raw rejection, or a non-zero exit. Form (b) cannot be characterized → **dropped** per the default-safe posture. `STREAM_CLOSED_SURFACE` is left undefined.

### P0-3 — pre-retry delay (OQ-003)

**Immediate retry succeeds.** Clean two-attempt capture of the identical command `read path=Welcome.md` from a freshly-closed state:
- Attempt 1: exit 0, **empty** stdout, 1028 ms.
- Attempt 2 (immediate, no delay): exit 0, **full Welcome.md content**, 1018 ms.

The vault load completed during/by the second attempt with no inserted delay. The ~1 s per-call cost is constant CLI overhead (warm calls cost the same), not a launch window. **Decision: immediate retry, no fixed delay.**

### P0-4 — form-(b) mutation safety (OQ-005, D5 gate)

**N/A — not run.** The destructive `Stream closed`-against-a-mutating-command probe is only needed to *clear form (b) for shipping*. Since P0-2 found no `Stream closed` to force, form (b) is dropped regardless; running a destructive mutation probe would add risk with no decision value. No `Sandbox/` fixtures were seeded; no `.trash/` residue produced. (Default-safe posture: form (a) only.)

### P0-5 — no-masking on a genuine unknown (OQ-004)

`frobnicate` and `vault:open` both return the form-(a) signature (exit 0, `Error: Command "..." not found. It may require a plugin to be enabled.`). A retry re-runs the identical command, which — the vault now warm — still yields `Command not found` for a genuinely unknown command, so the original `CLI_REPORTED_ERROR` propagates after exactly one retry. The bounded single-retry + second-attempt-authoritative behaviour is exercised deterministically in the unit suite (`_dispatch.test.ts` US2 cases T017–T020).

### P0-6 — both facades (OQ-006)

Both facades (`invokeCli` typed tools, `invokeBoundedCli`/`obsidian_exec` passthrough) route every command through the single `dispatchCli` primitive (verified structurally: `dispatchCli` has exactly the two facade callers). The cold-start signature and the retry are therefore inherited identically by both; this is asserted in the unit suite via facade-inheritance tests (`cli-adapter.test.ts`, `invoke-bounded-cli.test.ts`) rather than re-elicited live per facade.

## Net effect on the implementation

- `COLD_START_INVARIANT = "not found. It may require a plugin to be enabled."` — exact, pinned.
- `isColdStart` = **form (a) only**: `value instanceof UpstreamError && value.code === "CLI_REPORTED_ERROR" && typeof value.details?.stdout === "string" && value.details.stdout.includes(COLD_START_INVARIANT)`.
- **No form (b)**: Phase 7 (T030/T031) is dropped; no `Stream closed` matcher, no PATH-4 resolved-stdout inspection, no `emitError`-driven form-(b) test. The `emitError` stub field (T002) remains as harmless unused test infrastructure for any future form-(b) characterization.
- **No pre-retry delay.**
- The empty-exit-0 cold manifestation of core read commands is documented as **FR-013 out-of-scope** and is intentionally **not** retried (success-path inspection for it is rejected — masking risk).
