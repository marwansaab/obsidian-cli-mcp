# Contract: Dispatch-Layer Cold-Start Retry

The behavioural contract `dispatchCli` upholds after this feature. It is an internal contract (no published MCP schema changes); the "consumers" are the two facades and, transitively, every tool. Implements ADR-029.

## Scope

- **Applies to**: every one-shot CLI invocation routed through `dispatchCli` — i.e. every command issued via `invokeCli` (typed tools, eval-composed tools) or `invokeBoundedCli` (`obsidian_exec` passthrough).
- **Does NOT apply to**: cold-start that an eval-composed tool converts into a well-formed `exitCode: 0` eval envelope (e.g. `VAULT_NOT_FOUND/reason:"not-open"` from a focused-vault mismatch) — `dispatchCli` sees success, so no retry fires; that manifestation is handled by the tool's own guard, out of scope (FR-013). Also does NOT apply to direct-fs paths (the write/edit cohort's specific-mode `node:fs` reads/writes never touch the CLI and never cold-start).

## Retry decision table

| First-attempt outcome | `isColdStart`? | Action | Final outcome |
|---|---|---|---|
| Success (normal) | no | return | the success (zero extra spawns) |
| `CLI_REPORTED_ERROR` + stdout matches `COLD_START_PATTERN` (`/^\s*Error: Command "[^"]*" not found\./`, **form a**) | **yes** | retry once | **the second attempt's outcome** (resolve or throw), verbatim |
| `Stream closed` (**form b** — NOT shipped) | no | propagate | the first attempt's outcome (single-shot). Dropped on the mutation-safety argument: a dropped pipe carries no lifecycle evidence, so retrying could double-apply a mutation (research D5). |
| `CLI_TIMEOUT` / `CLI_OUTPUT_TOO_LARGE` / `CLI_NON_ZERO_EXIT` / `CLI_BINARY_NOT_FOUND` / `ERR_NO_ACTIVE_FILE` / any other `Error:` not matching `COLD_START_PATTERN` (incl. `File`/`Folder`/`Vault not found.`) | no | propagate | the first attempt's outcome (single-shot, unchanged) |
| Retry's second attempt = cold-start signature again | n/a (no further retry) | propagate | the second attempt's structured error, unchanged |

## Guarantees

- **G1 — Bounded**: at most one extra attempt per `dispatchCli` call. No loop, no backoff. (FR-004; test asserts exact spawn `calls() === 2` on trigger, `=== 1` otherwise.)
- **G2 — Single final outcome**: the caller observes exactly one resolve/reject; the transient first attempt is never surfaced alongside a second result. (FR-005, SC-002.)
- **G3 — Second attempt authoritative**: on retry, the second attempt's success OR failure is the result; attempt 1's cold-start error is discarded and never masks a genuine post-launch error. (Q1, FR-005, FR-007.)
- **G4 — No masking**: a genuinely unknown command fails identically on retry and propagates unchanged; non-cold-start errors are never retried. No `catch` returns empty/default/null. (FR-007, FR-008, Constitution IV.)
- **G5 — Zero new codes**: no new top-level `UpstreamError.code`; on persistent failure the existing structured error propagates. (Constitution IV; regression test asserts the code stays within the known union.)
- **G6 — Side-effect safety**: form (a) is safe for mutating commands by registry-not-ready semantics (a `Command "<cmd>" not found.` means the command never executed). Form (b) `Stream closed` is NOT retried — it carries no lifecycle evidence and could fire post-mutation, so retrying it is unsafe; it is left single-shot (research D5). So a mutating command is retried only when provably non-executing on attempt 1. (FR-011, SC-009.)
- **G7 — In-slot, no new concurrency**: the retry runs inside the single `queue.run` slot both facades already hold; it does not re-enter the queue. (Latency accrues serially within one slot.)
- **G8 — Fresh attempt identity**: each attempt has its own `callId`/`startedAt`; a `dispatch.retry` log line records both when the retry fires. (D7.)
- **G9 — Shutdown-safe**: if shutdown begins between attempt-1 settle and attempt-2 spawn, the retry is skipped and attempt 1's error propagates — no orphaned child. (D6.)
- **G10 — No-bypass enforced**: a build-failing guardrail test asserts `node:child_process` spawn value-imports live only in `_dispatch.ts` and `dispatchCli` has exactly the two facade callers — so no future tool can reach the CLI without inheriting this contract. (FR-012, SC-008.)

## Inputs / outputs (unchanged)

`dispatchCli(input: DispatchInput, deps: DispatchDeps): Promise<DispatchOutput>` — signature, `DispatchInput`, `DispatchOutput`, and `DispatchDeps` are all **unchanged**. The retry is invisible to callers except that a cold-start first attempt no longer surfaces; the success/failure types are identical to today.
