# Contract: `src/cli-adapter/_dispatch.ts` ↔ `src/binary-resolver/`

**Feature**: `017-cross-platform-support`
**Plan**: [../plan.md](../plan.md) | **Research**: [../research.md](../research.md)

This contract is the integration boundary between the existing dispatch layer and the new binary-resolver module. It pins (a) where the resolver is called from, (b) how the spawn-time ENOENT classification consumes the resolver's `attempts` array, (c) the structure of the resulting `CLI_BINARY_NOT_FOUND` UpstreamError details, and (d) which existing dispatch invariants are preserved unchanged.

## Where `resolveBinary` is called

`src/cli-adapter/_dispatch.ts` line 60 area (today: `const binary = env.OBSIDIAN_BIN ?? "obsidian";`). The replacement:

```ts
import { resolveBinary, type ResolutionAttempt } from "../binary-resolver/binary-resolver.js";
import * as fsPromises from "node:fs/promises";
import * as os from "node:os";

export async function dispatchCli(input: DispatchInput, deps: DispatchDeps): Promise<DispatchOutput> {
  const env = deps.env ?? process.env;

  // [REPLACED] formerly: const binary = env.OBSIDIAN_BIN ?? "obsidian";
  const resolved = await resolveBinary({
    env,
    platform: process.platform,
    homedir: os.homedir,
    access: fsPromises.access,
  });
  const binary = resolved.path;

  const argv = assembleArgv(input, binary);
  const spawnArgs = argv.slice(1);
  // ... rest of dispatchCli unchanged ...
}
```

## ENOENT classification (spawn-side)

The two existing ENOENT paths in `_dispatch.ts` (line 84 — spawn-throw catch; line 163 — child error event) are amended to consume `resolved.attempts`. Both paths produce the same structured error:

```ts
function buildBinaryNotFoundError(err: NodeJS.ErrnoException): UpstreamError {
  return new UpstreamError({
    code: "CLI_BINARY_NOT_FOUND",
    cause: err,
    details: {
      platform: process.platform,
      attempts: settlePathAttempt(resolved.attempts, "not-found"),
      PATH: env.PATH,
    },
  });
}
```

Where `settlePathAttempt` is a small helper:

```ts
function settlePathAttempt(
  attempts: ResolutionAttempt[],
  outcome: "resolved" | "not-found",
): ResolutionAttempt[] {
  // The trailing PATH attempt (if any) is settled by the dispatch layer
  // after the spawn outcome is known. If the trailing entry has source
  // === "PATH" and outcome === "pending", overwrite its outcome.
  const last = attempts[attempts.length - 1];
  if (last?.source === "PATH" && last.outcome === "pending") {
    return [
      ...attempts.slice(0, -1),
      { source: "PATH", path: last.path, outcome },
    ];
  }
  return attempts;
}
```

The `settlePathAttempt` helper lives in `_dispatch.ts` (private; not exported) — it is dispatch-layer logic that depends on the resolver's pending-attempt convention but doesn't belong in the resolver itself.

## Resolver-thrown errors propagate untouched

When `resolveBinary` itself throws (the OBSIDIAN_BIN-set-and-failed case per FR-008 / FR-020), the dispatch layer does NOT catch and re-wrap. The thrown UpstreamError already has the correct shape — it propagates out of `dispatchCli` as-is.

```ts
// In dispatchCli, around the resolveBinary call:
const resolved = await resolveBinary({...});  // throws CLI_BINARY_NOT_FOUND directly when OBSIDIAN_BIN fails
// No try/catch here — UpstreamError propagates.
```

This means the dispatch layer's promise rejects with the same error shape regardless of whether the failure was decided by the resolver (`OBSIDIAN_BIN` failed) or by the spawn (`PATH` failed). Both produce `{code: "CLI_BINARY_NOT_FOUND", details: {platform, attempts, PATH}}`.

## Preserved invariants (unchanged from v0.3.0)

The following dispatch behaviours are NOT changed by this BI:

| Invariant | Source | How preserved |
|---|---|---|
| Argv assembly | `assembleArgv(input, binary)` at line 50 | Function unchanged; called with the resolved binary as the first arg. |
| Atomic in-flight registry | `inFlightChild`, `inFlightContext` at lines 43-44 + line 80 | Unchanged. |
| Timeout / output-cap kill paths | `killChild`, `scheduleSigkill` | Unchanged. |
| Four-priority classification of exit results | line 187+ (`onTerminal`) | Unchanged: timeout, cap, non-zero, ERR_NO_ACTIVE_FILE, CLI_REPORTED_ERROR, success. |
| `dispatchTimeout` / `dispatchCap` / `dispatchKill` logger events | logger calls at lines 188, 213, 311 | Unchanged. |
| `assembleArgv` exported function | line 50 | Unchanged. |
| `dispatchCli` exported function signature | line 60 | Unchanged (still `(input, deps) => Promise<DispatchOutput>`). |
| `killInFlightChildren` exported function | line 294 | Unchanged. |

## Modified call sites in tests

| File | Lines | Change |
|---|---|---|
| `src/cli-adapter/_dispatch.test.ts` | 185-195 | Test name and `toMatchObject` assertion updated for new `details` shape (`platform`, `attempts`, `PATH`). |
| `src/cli-adapter/_dispatch.test.ts` | 198-205 | Same shape update for the child.error ENOENT case. |
| `src/cli-adapter/_dispatch.test.ts` | 392-area | `it.each` table at line 392 only asserts `code`; no edit. |
| `src/cli-adapter/_dispatch.test.ts` | NEW (~+30 LOC) | 2 new cases: (a) OBSIDIAN_BIN-set-and-not-executable propagation; (b) happy-path verification that `spawnFn` receives `resolved.path` as the binary. |
| `src/tools/obsidian_exec/handler.test.ts` | 111-122 | Test name unchanged; one assertion updated from `err.details.binaryAttempted` to `err.details.attempts.find(a => a.source === "PATH")?.path`. |

## Failure propagation chain (post-BI)

```text
Tool handler (e.g., obsidian_exec, read_note, write_note, ...)
  ↓
invokeCli / invokeBoundedCli (cli-adapter facade — unchanged)
  ↓
dispatchCli (cli-adapter)
  ↓ awaits
resolveBinary (binary-resolver) ────────┐
  ↓ returns {path, attempts}            │ throws CLI_BINARY_NOT_FOUND
spawn(resolved.path, ...)               │ when OBSIDIAN_BIN-set-failed
  ↓ events                              │
onSpawnError("ENOENT")                  │
  ↓ buildBinaryNotFoundError            │
UpstreamError(CLI_BINARY_NOT_FOUND) ────┴──→ propagates to tool handler → MCP error response
```

The two failure paths converge on the same structured error. The tool-handler-level test (e.g., `obsidian_exec/handler.test.ts:111-122`) doesn't need to know which path produced the error — it only asserts the converged shape.

## Test seam invariants

`_dispatch.test.ts`'s tests inject `spawnFn` (existing seam) AND should NOT need to inject the resolver's own deps — `dispatchCli` constructs the resolver's deps from `process.platform` / `os.homedir` / `fsPromises.access` directly. The test asserts on the resulting `details` shape; the host platform's real `process.platform` value flows through. This is acceptable because:

- The resolver's per-platform behaviour is independently tested in `binary-resolver.test.ts` with seam-injected platform values.
- The dispatch-layer integration tests just need to confirm the `details` shape is well-formed AND that the resolver's `attempts` propagate.
- Tests that need to assert behaviour on a non-host platform (e.g., a Windows-runtime test running on a Linux CI) use the resolver's seam directly, not the dispatch layer's.

If a future test needs to inject a non-host platform into `dispatchCli`, the dispatch layer's `DispatchDeps` interface CAN be extended with optional `binaryResolver?: typeof resolveBinary` (allowing the test to substitute a stub resolver). This extension is NOT in scope for this BI — the existing test coverage at the resolver layer is sufficient.
