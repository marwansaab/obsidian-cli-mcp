# Quickstart: Verify Retry Cold Start

Two layers: (A) the in-process unit suite (fast, deterministic, the merge gate) and (B) the implement-phase T0 live-CLI probes (require a real closed vault; gated by `.memory/test-execution-instructions.md`).

## A. Unit suite (vitest — the merge gate)

```powershell
npm run lint        # zero warnings
npm run typecheck   # tsc --noEmit clean
npm run build
npx vitest run src/cli-adapter
```

Expect these new/changed cases to pass:

**`src/cli-adapter/_dispatch.test.ts`** (new `describe("dispatchCli — ADR-029 cold-start single retry")`, using a new `makeScriptedSpawn(specs[])` per-call-varying stub):
1. cold-start (form a) → success: `specs = [{stdout: COLD_START_STDOUT, exitCode: 0}, {stdout: "ok\n", exitCode: 0}]` → resolves `{stdout: "ok\n"}`, `calls() === 2`.
2. cold-start → different error (Q1): `[cold, {stderr: "boom", exitCode: 1}]` → rejects `CLI_NON_ZERO_EXIT` (attempt 2), `calls() === 2`.
3. cold-start → cold-start (no loop): `[cold, cold]` → rejects `CLI_REPORTED_ERROR` with `details.stdout` including the invariant, `calls() === 2` exactly.
4. non-cold-start first failure → no retry: `[{stderr: "boom", exitCode: 1}]` → rejects `CLI_NON_ZERO_EXIT`, `calls() === 1`.
5. zero-new-codes: the propagated error's `code` is within the known union.
6. *(form b, only if probe P0-4 enables it)* `Stream closed` → success on retry; and `Stream closed` twice → propagate, `calls() === 2`.

**`src/cli-adapter/cli-adapter.test.ts`**: facade inheritance — cold-start on call 1 → success on call 2 → `invokeCli` resolves, spawn called twice; **negative**: the existing `Vault not found.` re-classification does NOT retry (spawn called once).

**`src/cli-adapter/invoke-bounded-cli.test.ts`**: facade inheritance — same, through `invokeBoundedCli`.

**`src/cli-adapter/architecture.test.ts`** (new, FR-012): fails if any production file outside `_dispatch.ts` value-imports `node:child_process` spawn, or if `dispatchCli` gains a caller beyond the two facades.

Also sweep existing spawn-count assertions (e.g. `obsidian_exec` FR-018 "spawn never called", `find_by_property` spawn-spy) for the new two-attempt behaviour — none should regress because none feed a cold-start signature.

## B. T0 live-CLI probes (implement phase — needs your help)

> **Read `.memory/test-execution-instructions.md` first.** Vault `TestVault-Obsidian-CLI-MCP`; fixtures under `Sandbox/`; invoke `obsidian` directly; clean up after.

**Vault state you (the user) set up**: Obsidian running, but `TestVault-Obsidian-CLI-MCP` **registered and CLOSED** (not the focused/open vault). I'll give exact open/close steps at implement time; for the mutating probe (P0-4) I'll seed a unique `Sandbox/` fixture first and capture pre-state.

Walkthrough (maps to research.md probe table):
1. **P0-1 / P0-7** — first command (a read) against the closed vault: capture raw `exitCode` + stdout. Confirm `Error: Command "<cmd>" not found. It may require a plugin to be enabled.` and exit 0. Repeat for a list, a search, a write, a tab/open eval; note any divergence. Pin the invariant literal.
2. **P0-3** — immediately re-issue: does attempt 2 succeed, or is it still cold? Time the launch window.
3. **P0-2** — try to elicit `Stream closed`; record exactly how it surfaces (reject vs resolve, exit code, which stream, verbatim substring) and how often.
4. **P0-4** (gate) — force `Stream closed` against `rename`/`move`/`delete` on the closed vault under `Sandbox/`; inspect whether the mutation applied on attempt 1. **This decides whether form (b) ships or is dropped.**
5. **P0-5** — a typo / TUI-only `vault:open`: confirm it still fails after one retry, original error preserved.
6. **P0-6** — confirm a typed-tool path and `obsidian_exec` both show the cold-start and both recover.

Record verbatim outputs; feed back into ADR-029 (flip Proposed → Decided) and the architecture error-mapping pipeline on ship.

## Done-when

- Unit suite green (lint/typecheck/build/vitest), coverage threshold holds.
- T0 probes recorded; form-(b) ship/drop decided by P0-4; invariant literal pinned.
- `/graphify --update` post-implement structural verification passes (no new error-code node; DI factories confined to `server.ts`; `dispatchOnce`/`isColdStart` in the dispatch community, not orphaned).
- ADR-029 updated to Decided with the probe answers.
