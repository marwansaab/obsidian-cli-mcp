# Phase 1 Data Model — Recover Closed Obsidian

**Feature**: 060-recover-closed-obsidian
**Date**: 2026-05-30

This feature adds no persistent storage and no new MCP tool input schema. The "data model" is the set of in-memory types and the recovery state transitions introduced at the dispatch layer. Types follow Principle III where a boundary exists; here there is no new caller-facing boundary, so types are internal TypeScript interfaces (zod is not required — there is no new external input to validate). The one externally-influenced input, the `OBSIDIAN_AUTO_LAUNCH` env var, is parsed by a narrow internal helper.

---

## 1. `AppLivenessState` (conceptual)

The observed condition of the Obsidian application during a single `dispatchCli` call. Not a stored field — it is the implicit state the recovery loop traverses.

| State | Observed via | Transition |
|-------|--------------|------------|
| `not-running` | first attempt throws `isAppNotRunning` | → `launching` (if auto-launch on) or terminal `unrecoverable` (if off) |
| `launching` | launcher invoked; re-attempts still `isAppNotRunning` | → `ready` (a re-attempt resolves / returns a non-app-down outcome) or terminal `unrecoverable` (bound elapsed) |
| `ready` | a re-attempt resolves, or returns cold-start (handled by ADR-029 inner retry) / a real error | terminal — the operation's authoritative outcome |

There is **no** persisted state machine; the transitions are the control flow of the recovery loop (contracts/recovery-contract.md §3).

## 2. `details.reason` sub-discriminator (extends an existing error)

No new error class. The existing `UpstreamError` carries an open `details: Record<string, unknown>`. This feature adds **one new value** to the `CLI_NON_ZERO_EXIT` details bag:

| Field | Type | Values | Set when |
|-------|------|--------|----------|
| `details.reason` | `string` (closed enum for this surface) | `"obsidian-not-running"` | a `CLI_NON_ZERO_EXIT` whose `details.stderr` matches `APP_NOT_RUNNING_PATTERN` |

ADR-015 compliance: a sub-discriminator within the `CLI_NON_ZERO_EXIT` top-level code; the enum is closed and documented; the distinction is agent-actionable ("start Obsidian"). No change to `src/errors.ts` (the class is unchanged) and no change to the `ErrorCode` union in `src/logger.ts` (Principle IV — zero new top-level codes).

## 3. `LaunchInput` / `LaunchDeps` (new module `app-launcher`)

```ts
interface LaunchInput {
  vault?: string;            // when present → obsidian://open?vault=<encodeURIComponent(vault)>
}
interface LaunchDeps {
  platform?: NodeJS.Platform;        // defaults to process.platform — test seam
  spawnFn?: SpawnLike;               // defaults to node:child_process spawn — test seam
}
launchObsidian(input: LaunchInput, deps?: LaunchDeps): Promise<void>
```

Validation / rules:
- `vault` is URL-encoded before interpolation into the URI (spaces, unicode).
- Opener is chosen by platform (contracts/recovery-contract.md §2); unknown platforms fall back to `xdg-open` (POSIX default).
- Spawn is detached / stdio ignore / unref'd; resolves on spawn, rejects on opener `ENOENT`.

## 4. `DispatchDeps` extension (existing interface, additive)

```ts
interface DispatchDeps {
  // …existing: spawnFn?, env?, logger, resolveBinary?
  launchFn?: typeof launchObsidian;   // NEW optional seam; defaults to the real launcher
}
```

No change to the two facade input contracts (`InvokeCliInput`, `InvokeBoundedCliInput`) — the seam is internal to the dispatch layer.

## 5. `DispatchRecoveryEvent` (new logger event)

```ts
interface DispatchRecoveryEvent {
  command: string;
  launched: boolean;                                   // false only in the disabled path
  outcome: "recovered" | "unrecoverable" | "disabled";
  attempts: number;                                    // re-attempts made during the poll loop
  readyMs?: number;                                    // present when outcome === "recovered"
}
```

Added to the `Logger` interface and `createLogger`; emitted as `dispatch.recovery`. Touches the `createLogger` kernel node (additive).

## 6. Tunable constants (pinned, plan-fixed)

| Constant | Value | Source |
|----------|-------|--------|
| `APP_NOT_RUNNING_PATTERN` | `/unable to find Obsidian/i` | T0 probe (research D1) |
| `OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS` | `30_000` | T0 ~3 s + margin (research D3) |
| `LAUNCH_POLL_INTERVAL_MS` | `750` | research D3 |
| `OBSIDIAN_AUTO_LAUNCH` disable-set | `{ "0", "false", "no", "off" }` | research D5 |
| `details.reason` literal | `"obsidian-not-running"` | clarify 2026-05-30 / research D4 |
