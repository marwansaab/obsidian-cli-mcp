# Phase 0 Research: Recover Closed Obsidian

**Feature**: 060-recover-closed-obsidian
**Date**: 2026-05-30
**Inputs**: spec.md (incl. Clarifications 2026-05-30), ADR-029, BI 059-retry-cold-start, live T0 probes (this session).

This document resolves every NEEDS-CLARIFICATION / deferred parameter the spec left for plan-phase. Timing and signature parameters were pinned against live `Obsidian.com` probes (the production-resolved shim — never the GUI `.exe`, per `.memory/test-execution-instructions.md`). Full probe transcript in [contracts/t0-probe-findings.md](contracts/t0-probe-findings.md).

---

## D1 — Detection signal & classification

**Decision**: The application-not-running condition is the dispatch four-priority classifier's priority-(a) outcome — `CLI_NON_ZERO_EXIT` (exit code 1, empty stdout) — whose `details.stderr` matches `APP_NOT_RUNNING_PATTERN`, a tolerant, case-insensitive match on the invariant CLI-emitted clause `unable to find Obsidian`. At classification time in `dispatchOnce`, when a non-zero-exit's stderr matches that pattern, attach `details.reason = "obsidian-not-running"`. The recovery layer keys off a new exported predicate `isAppNotRunning(value)` — the structural sibling of the existing `isColdStart(value)` (ADR-029):

```
isAppNotRunning(value) ===
  value instanceof UpstreamError &&
  value.code === "CLI_NON_ZERO_EXIT" &&
  value.details?.reason === "obsidian-not-running"
```

**Rationale**: The T0 probe (Windows, `Obsidian.com`, app fully closed) produced a byte-identical signal across `version`, `files`, and `read`:
- exit code **1**, stdout **empty**, stderr **`The CLI is unable to find Obsidian. Please make sure Obsidian is running and try again.\n`**.

This is **command-agnostic** (confirms FR-002) and is emitted by the **CLI itself**, not the OS — so it is expected identical on macOS/Linux (see D2 cross-platform note). It is structurally distinct from the ADR-029 cold-start signal (`exit 0` + stdout `Error: Command "<cmd>" not found.` matching `COLD_START_PATTERN`), so the two never conflate (FR-001). The classification sits exactly where the existing `ERR_NO_ACTIVE_FILE` / `CLI_REPORTED_ERROR` sub-classifications already live in `dispatchOnce`.

**Pattern choice**: match the distinctive clause `unable to find Obsidian` rather than (a) exact full-string equality — brittle to a punctuation/version/localization change — or (b) exit-code-1 alone — far too broad (many failures exit 1). The tolerant substring is specific enough to avoid false positives yet survives minor upstream wording drift. The literal is pinned in code and covered by a regression test (the ADR-029 brittleness-note precedent).

**Alternatives considered**: exact full-string match (rejected — brittle); a new top-level error code for app-down (rejected — see D4, breaks the zero-new-codes streak); classifying in a facade rather than `dispatchOnce` (rejected — would not be inherited by both facades uniformly, FR-010).

**Open risk (flagged for user validation)**: the stderr literal is verified on Windows only. macOS/Linux are assumed identical because the string is CLI-emitted; the tolerant pattern absorbs minor differences but a localized or reworded message on those OSes would need the pattern widened. quickstart.md includes a macOS/Linux capture step.

---

## D2 — Launch mechanism (OS-agnostic)

**Decision**: Launch Obsidian by handing the `obsidian://open?vault=<URL-encoded vault>` URI to the platform's default-URI opener, selected by `process.platform`:

| Platform | Opener invocation |
|----------|-------------------|
| `win32`  | the registered protocol handler via the shell `start` verb (spawned through `cmd /c start "" "<uri>"`) |
| `darwin` | `open "<uri>"` |
| `linux`  | `xdg-open "<uri>"` |

When the triggering command carries no `vault=`, fall back to a vault-less application start (bare `obsidian://` / platform app-open). The opener is spawned **detached, stdio ignored, `unref`'d** — fire-and-forget. Readiness is observed by re-dispatching the original CLI command (D3), **never** by the opener's own exit code.

**Rationale**: Obsidian registers the `obsidian://` protocol handler on all three OSes at install time, so a single URI plus three tiny opener commands covers every platform. This **sidesteps per-OS GUI-binary path discovery** — the hardest cross-platform problem (Linux ships as AppImage / flatpak / snap with no canonical path; `binary-resolver` only resolves the **CLI**, not the GUI app). The URI also **focuses the target vault**, priming it so the post-launch cold-start window is minimized.

T0 evidence (Windows): `obsidian://open?vault=TestVault-Obsidian-CLI-MCP` launched the closed app and reached readiness in **~3 s** — both app-level (`version`) and vault-level (`files`) returned READY together on the first poll, and **no cold-start window appeared** (the URI primed the vault). Transcript in contracts/t0-probe-findings.md.

**Alternatives considered**:
- Resolve & spawn the GUI binary per-OS — rejected: brittle Linux discovery, no single install path; duplicates install-detection that the URI handler already encapsulates.
- `open -a Obsidian` (macOS) / app-name launch — rejected: not vault-aware, platform-specific idiom, no Linux analogue.
- Extend `binary-resolver` to find a GUI binary — rejected: the resolver's contract is the CLI binary; the GUI app path differs and varies by install method.

**Open risk (flagged)**: macOS/Linux launch is unverified here (no host access). The mechanism degrades safely: a missing/unregistered handler or a headless Linux box with no `xdg-open` desktop session means the launch no-ops, the readiness bound (D3) elapses, and the distinct error (D4) fires — which is exactly the correct out-of-scope behavior for a broken/missing/headless install. quickstart.md includes macOS/Linux launch validation steps for the user.

---

## D3 — Readiness strategy & bound

**Decision**: On `isAppNotRunning` + auto-launch enabled (D5) + not shutting down, `dispatchCli`:
1. invokes the launcher **exactly once**;
2. re-attempts the **original command** in a bounded poll loop — interval ~**750 ms**, total bound `OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS` default **30 000 ms** — where each attempt flows through the existing `dispatchOnce` + ADR-029 cold-start retry;
3. treats the **first non-app-not-running outcome** as authoritative (success → resolve; cold-start resolved by the inner retry → resolve; any real error → throw it);
4. on bound exhaustion, throws the enriched `CLI_NON_ZERO_EXIT` (`details.reason = "obsidian-not-running"`, D4) with an actionable message.

**Rationale**:
- **Re-attempting the original command is side-effect-safe for every command, including mutations.** The app-not-running signal is exit 1 + empty stdout — the CLI errored *before* connecting to any running app, so the command provably never executed (a stronger guarantee than form-(a) cold-start, which relies on registry-not-ready). There is no double-apply risk for `rename`/`move`/`delete`/`obsidian_exec`.
- **Bound chosen from T0 + margin**: Windows reached readiness in ~3 s; a 30 s bound gives generous headroom for slower macOS/Linux cold starts while guaranteeing termination (FR-004, FR-010).
- **Composes with ADR-029 (FR-005)**: the app-launch recovery is the *outer* layer; the cold-start single-retry remains the *inner* per-attempt layer. If the launch URI does not fully prime the vault, the inner retry absorbs the residual warm-up — 060 sits in front of 059, neither duplicates the other.
- **Latency**: zero added work on the already-running success path (the loop is reached only after an app-not-running throw). On the recovery path, wall-clock is bounded by the readiness bound — this intentionally exceeds the typed-tool 10 s per-attempt nominal, which is acceptable because FR-006 bounds the *success* path, not the recovery path.

**Single-flight (FR-006)**: both facades wrap `dispatchCli` in `deps.queue.run(...)`, and `createQueue` serializes; concurrent operations that all hit the app-down condition are processed one at a time, so by the time the second runs the app is already up — single-flight launch falls out of the existing queue with no new concurrency primitive.

**Alternatives considered**: poll a cheap `version` probe then run the original once (rejected — extra spawns; re-attempting the original is already safe); a single fixed delay then one retry (rejected — races slower cold starts); unbounded wait (rejected — FR-004/FR-010).

**Sustained-closed cost (accepted for v1)**: when the app genuinely cannot start (uninstalled/broken/headless), each subsequent operation re-launches and waits the full bound before erroring. A negative-cache / cooldown (short-circuit to the distinct error after a recent failed launch) would improve sustained-closed throughput but adds module state and a cooldown parameter the clarify did not surface; it is recorded as an explicit **future enhancement, out of scope for v1**. Correctness is unaffected (each op terminates bounded).

---

## D4 — Distinct-error encoding (clarify-locked)

**Decision**: Reuse the existing top-level code `CLI_NON_ZERO_EXIT` and distinguish the unrecoverable case with the ADR-015 sub-discriminator `details.reason = "obsidian-not-running"`. **No new top-level error code.** Closed enum for this surface: `details.reason ∈ {"obsidian-not-running"}`. The `message` states cause + action, varying only by mode:
- recovery failed: `"Obsidian is not running and could not be auto-launched within {N}s — start Obsidian and try again."`
- opt-out set (D5): `"Obsidian is not running and auto-launch is disabled (OBSIDIAN_AUTO_LAUNCH) — start Obsidian and try again."`

**Rationale**: Clarification 2026-05-30. Preserves the zero-new-top-level-codes streak (Constitution Principle IV; the `ErrorCode` union in `src/logger.ts` is unchanged). Satisfies the ADR-015 three-condition actionability gate: (1) the sub-state is operationally actionable — "start Obsidian" is a distinct remediation from a generic non-zero exit; (2) ≥2 sub-states exist — a generic `CLI_NON_ZERO_EXIT` (no `reason`) vs the `obsidian-not-running` sub-state; (3) closed enum documented here and in the contract. A single `reason` value covers both "launch failed" and "launch disabled" per the clarify decision (the mode difference lives in `message`, not in a second `reason`).

**Alternatives considered**: a new top-level code `OBSIDIAN_NOT_RUNNING` (rejected — breaks the streak, adds an error-class node flagged by the post-implement structural check, requires a Complexity Tracking entry); message-only distinction (rejected — fails FR-007 programmatic-distinguishability).

---

## D5 — Auto-launch opt-out (clarify-locked)

**Decision**: Environment variable `OBSIDIAN_AUTO_LAUNCH`, default **on**. Auto-launch is disabled when the value (trimmed, lower-cased) is one of `0 | false | no | off`; any other value (including unset) leaves it on. Read from `deps.env ?? process.env`, mirroring how `binary-resolver` reads `OBSIDIAN_BIN`. When disabled, `dispatchCli` skips the launch entirely and surfaces the enriched `CLI_NON_ZERO_EXIT` (`reason: "obsidian-not-running"`, disabled-mode message) directly — no added attempt, no added delay.

**Rationale**: Clarification 2026-05-30; follows the established `OBSIDIAN_BIN` env-config precedent; gives headless/CI/locked-down hosts a zero-code safety valve while keeping the unattended default friction-free. The already-running success path (FR-011) is untouched regardless of the toggle, because detection is reactive (the toggle is only consulted *after* an app-not-running throw).

**Alternatives considered**: opt-in default (rejected — defeats the unattended-by-default goal); no toggle (rejected — no escape hatch for GUI-forbidden hosts).

---

## D6 — Module structure & the no-bypass guardrail

**Decision**:
- New module **`src/app-launcher/app-launcher.ts`** exposing `launchObsidian(input, deps): Promise<void>` — the pure launch primitive (build the URI, select the opener by `process.platform`, spawn it detached). Co-located test `app-launcher.test.ts`. Header: `// Original — no upstream.` (Principle V).
- Recovery **orchestration** (detect → launch → bounded poll → authoritative result / enriched error) lives in **`_dispatch.ts`** inside `dispatchCli`, the single recovery brain — mirroring where the ADR-029 retry already lives. `isAppNotRunning` and `APP_NOT_RUNNING_PATTERN` are exported from `_dispatch.ts` alongside `isColdStart` / `COLD_START_PATTERN`.
- The launcher is injected via a new optional `DispatchDeps.launchFn?` test seam, defaulting to the real `launchObsidian`. `createServer` is **not** touched — the default binds at the dispatch layer and the opt-out env already flows through `deps.env`.

**Guardrail extension (ADR-029 D8)**: `src/cli-adapter/architecture.test.ts` invariant (i) currently fails the build if any `node:child_process` spawn-family value-import appears outside `_dispatch.ts`. The launcher must spawn the OS opener, so:
- extend the allowlist from `{_dispatch.ts}` to `{_dispatch.ts, app-launcher.ts}`; **and**
- add a narrower assertion that `app-launcher.ts` spawns **only** the OS opener / `obsidian://` URI and **never** the `obsidian` CLI binary (e.g., it must not import `resolveBinary`, and must not spawn `obsidian`/`Obsidian.com`).

This preserves the guardrail's *intent* — "no tool reaches the **obsidian CLI** without inheriting the retry" — while admitting a second, distinct spawn site whose purpose is starting the GUI app, not running a CLI command. Invariant (ii) (`dispatchCli` imported only by the two facades) is unchanged; the launcher is invoked by `_dispatch`, not by any tool.

**Rationale**: Principle I — one-directional imports (`_dispatch → app-launcher`, no cycle), per-concern module mirroring the `binary-resolver` precedent (a separate module imported by `_dispatch`). Keeping orchestration in `_dispatch` keeps both facades inheriting the behavior (FR-010) and `createServer` untouched (minimizing kernel-node blast radius).

**ADR recommendation (surfaced, not authored here)**: 060 introduces a second sanctioned spawn site, the `obsidian://`-URI launch mechanism, the `obsidian-not-running` sub-discriminator, and the `OBSIDIAN_AUTO_LAUNCH` opt-out — all of which extend the ADR-029 D8 invariant. This warrants a new **ADR-030 ("Auto-launch Obsidian on app-not-running")**. Authoring an ADR is a deliberate act; it is flagged for the user rather than created unilaterally, consistent with the project rule that superseding/extending an ADR is intentional.

---

## D7 — Observability (logger event)

**Decision**: Add `dispatchRecovery(event)` to the `Logger` interface and `createLogger` implementation, emitting a `dispatch.recovery` JSON-line with `{ command, launched: boolean, outcome: "recovered" | "unrecoverable" | "disabled", attempts: number, readyMs?: number }`. All existing logger test-mocks gain the method.

**Rationale**: Parity with the existing `dispatch.retry` event; makes the recovery path observable (which calls triggered a launch, how long readiness took, whether it succeeded). This is a **kernel-node touch** (`createLogger`) acknowledged in the plan's Constitution Check and Graphify structural check — high blast radius because `Logger` is injected everywhere, but additive and mechanical.

**Alternatives considered**: reuse `dispatchRetry` (rejected — semantically a different event); emit nothing (rejected — loses recovery observability, and the recovery path is exactly where operators need a signal).

---

## Cross-cutting: kernel-node touch summary (for the plan)

| Kernel node | Touched? | How |
|-------------|----------|-----|
| `createLogger` | **Yes** | new `dispatchRecovery` event method (D7) |
| `UpstreamError` | Used, not modified | new `details.reason` **value** on existing `CLI_NON_ZERO_EXIT`; no new code/class node, `details` is an open `Record` (D4) |
| `createQueue` | No | existing queue serialization provides single-flight (D3) |
| `createServer` | No | launcher defaults at the dispatch layer; opt-out env flows through existing `deps.env` (D6) |

## Resolved unknowns checklist

- [x] App-not-running signal literal & classification → D1 (T0-pinned)
- [x] Cross-platform launch mechanism (Win/macOS/Linux) → D2 (Win T0-verified; macOS/Linux flagged)
- [x] "Ready" definition + bounded wait → D3 (re-dispatch poll, 30 s bound)
- [x] Distinct-error encoding → D4 (clarify-locked: reuse code + `details.reason`)
- [x] Opt-out variable & semantics → D5 (`OBSIDIAN_AUTO_LAUNCH`)
- [x] Module placement + guardrail handling → D6 (new `app-launcher`, extend ADR-029 D8 allowlist; ADR-030 recommended)
- [x] Observability → D7 (`dispatch.recovery`)
