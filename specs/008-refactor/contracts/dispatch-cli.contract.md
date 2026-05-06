# Contract — `dispatchCli`

**Module**: `src/cli-adapter/_dispatch.ts`
**Status**: design — private primitive; only `invokeCli` and `invokeBoundedCli` import it.

The single spawn-and-collect primitive. Owns argv assembly, the four-priority error classification, the in-flight child registry, and the always-on bounds enforcement.

---

## Signature

```ts
export interface DispatchInput {
  command: string;
  vault?: string;
  parameters?: Record<string, string | number | boolean | undefined>;
  flags?: string[];
  copy?: boolean;
  timeoutMs: number;
  outputCapBytes: number;
}

export interface DispatchOutput {
  stdout: string;
  stderr: string;
  exitCode: 0;
  argv: string[];
}

export interface DispatchDeps {
  spawnFn?: SpawnLike;       // injectable for testing
  env?: NodeJS.ProcessEnv;   // injectable for testing
  logger: Logger;            // failure-lifecycle log emissions go here
}

export function dispatchCli(input: DispatchInput, deps: DispatchDeps): Promise<DispatchOutput>;

export function killInFlightChildren(): boolean;
```

---

## argv assembly (FR-012)

```ts
const binary = deps.env?.OBSIDIAN_BIN ?? process.env.OBSIDIAN_BIN ?? "obsidian";
const vaultPrefix = input.vault !== undefined ? [`vault=${input.vault}`] : [];
const kvs = Object.entries(input.parameters ?? {})
  .filter(([, v]) => v !== undefined)
  .map(([k, v]) => `${k}=${String(v)}`);
const flags = input.flags ?? [];
const copySuffix = input.copy ? ["--copy"] : [];
const argv = [binary, ...vaultPrefix, input.command, ...kvs, ...flags, ...copySuffix];
```

This is the documented order at [docs/tools/obsidian_exec.md:27](../../docs/tools/obsidian_exec.md#L27): `[binary, vault=..., command, kvs..., flags..., --copy]`. Today's [src/cli-adapter/cli-adapter.ts:131-142](../../src/cli-adapter/cli-adapter.ts#L131-L142) produces a different order (`[command, vault=..., kvs..., flags...]`); the deepening adopts the documented order, fixing the divergence as a side effect.

`spawn(...)` receives the argv WITHOUT the leading binary (the binary is the first arg to `spawn`, and `argv` for record-keeping includes it).

---

## Bounds enforcement (FR-009 / FR-010 / FR-011)

Both bounds are enforced inside `dispatchCli`:

- **Timeout** — a `setTimeout(input.timeoutMs)` fires SIGTERM if the child has not exited by then. After SIGTERM, a 2 s grace timer schedules a SIGKILL. The classification verdict is `CLI_TIMEOUT`.
- **Output cap** — both stdout and stderr stream handlers check the running byte count against `input.outputCapBytes` per chunk. If a chunk pushes the count over, the same SIGTERM-then-2s-SIGKILL ladder fires. The classification verdict is `CLI_OUTPUT_TOO_LARGE`. The captured partial buffer is truncated to `outputCapBytes` for the error's `details.partial` field.

Both timers `unref()` so they don't keep the event loop alive past their purpose.

---

## In-flight child registry (FR-015 / FR-015a / FR-016)

Module-level state:

```ts
let inFlightChild: ChildProcess | null = null;
```

**Insertion is atomic with `spawn()`** (FR-015a):

```ts
const child = spawnFn(binary, argv.slice(1), { ... });
inFlightChild = child;  // synchronous, BEFORE any await
// ...
```

There MUST NOT be an `await` or microtask boundary between `spawn(...)` returning and the assignment. A SIGINT delivered during that window would otherwise leave a live child outside the registry's reach — the orphan US3 explicitly forbids.

**Removal** happens at `child.on("exit", ...)` and `child.on("error", ...)`:

```ts
child.on("exit", (code, signal) => {
  inFlightChild = null;
  // ... classify and resolve / reject
});
```

Removal is asynchronous (it runs on the next tick after exit). FR-015a's synchronicity rule applies only to insertion.

**`killInFlightChildren()` exported function**:

```ts
export function killInFlightChildren(): boolean {
  if (!inFlightChild) return false;
  const child = inFlightChild;
  const pid = child.pid;
  const command = /* recovered from a parallel cell or closure */;
  const startedAt = /* recovered similarly */;
  try { child.kill("SIGTERM"); } catch { /* already dead */ }
  setTimeout(() => {
    try { child.kill("SIGKILL"); } catch { /* already dead */ }
  }, 2_000).unref?.();
  deps.logger.dispatchKill({
    callId: /* call's UUID */,
    command: command,
    pid: pid ?? -1,
    durationMs: Date.now() - startedAt,
  });
  return true;
}
```

(The closure-over-deps for the kill function is awkward; in practice `dispatchCli` keeps a parallel cell `let inFlightContext: { callId, command, startedAt, logger } | null` populated synchronously alongside the child. The exported `killInFlightChildren` reads from both cells.)

---

## Four-priority error classification (FR-014)

On `child.exit(code, signal)`:

1. **Priority (a) — Non-zero exit** (or `code === null` for signal-only termination): `CLI_NON_ZERO_EXIT` with `details: { argv, stdout, stderr, exitCode: code ?? -1, signal }`. NO log emission.
2. **Priority (b) — `Error: no active file`** (when `code === 0` and `stdout.trimStart()` starts with the literal `"Error: no active file"`): `ERR_NO_ACTIVE_FILE` with `details: { command, stdout, stderr, exitCode: 0, message: <first stdout line, trimmed> }`. NO log emission. The error message field on the UpstreamError matches today's wording: `'No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: "specific" and an explicit vault/file.'` (per [src/cli-adapter/cli-adapter.ts:93-96](../../src/cli-adapter/cli-adapter.ts#L93-L96)).
3. **Priority (c) — `Error:` prefix (any other suffix)** (when `code === 0` and `stdout.trimStart()` starts with `"Error:"`): `CLI_REPORTED_ERROR` with `details: { argv, stdout, stderr, exitCode: 0, message: <first stdout line, trimmed> }`. NO log emission.
4. **Priority (d) — Success** (`code === 0` and stdout does not match (b) or (c)): resolve with `{ stdout, stderr, exitCode: 0, argv }`. NO log emission.

**Spawn-time errors**: `spawn(...)` throwing `ENOENT` (binary not found) or `child.on("error")` firing with `errno: ENOENT` raises `CLI_BINARY_NOT_FOUND` with `details: { binaryAttempted, PATH }`. NO log emission.

**Bounds-fired classifications** (timeout or cap): the `child.exit` handler observes `killReason` was set BEFORE classifying. If `killReason.kind === "timeout"`, raise `CLI_TIMEOUT` with `details: { argv, timeoutMs, partialStdout, partialStderr }` — and emit ONE `dispatch.timeout` log line via `deps.logger.dispatchTimeout(...)`. If `killReason.kind === "cap"`, raise `CLI_OUTPUT_TOO_LARGE` with `details: { argv, stream, limitBytes, capturedBytes, partial }` — and emit ONE `dispatch.cap` log line.

The classification table is summarized:

| Trigger | Verdict (UpstreamError code) | Log emission |
|---|---|---|
| ENOENT on spawn | `CLI_BINARY_NOT_FOUND` | none |
| `code !== 0` | `CLI_NON_ZERO_EXIT` | none |
| `code === 0`, stdout starts with `Error: no active file` | `ERR_NO_ACTIVE_FILE` | none |
| `code === 0`, stdout starts with `Error:` (any other suffix) | `CLI_REPORTED_ERROR` | none |
| `code === 0`, no error prefix | success | none |
| `setTimeout(timeoutMs)` fires | `CLI_TIMEOUT` | **`dispatch.timeout`** (one stderr line) |
| stdout/stderr exceeds `outputCapBytes` | `CLI_OUTPUT_TOO_LARGE` | **`dispatch.cap`** (one stderr line) |
| `killInFlightChildren()` invoked during shutdown | (the in-flight child receives SIGTERM/SIGKILL; the dispatch resolves/rejects via the normal exit handler) | **`dispatch.kill`** (one stderr line, emitted from `killInFlightChildren()` itself) |

---

## Failure-lifecycle log emissions (FR-018a / SC-011)

The dispatch primitive emits exactly **three** kinds of stderr log lines, one per occurrence:

- `{ event: "dispatch.timeout", ts, callId, command, pid, timeoutMs, durationMs }`
- `{ event: "dispatch.cap", ts, callId, command, pid, stream, capturedBytes, limitBytes }`
- `{ event: "dispatch.kill", ts, callId, command, pid, durationMs }`

`callId` is a `randomUUID()` generated at the top of each `dispatchCli` invocation — useful for correlating with future high-level logging. `ts` is `new Date().toISOString()`. `pid` is `child.pid ?? -1`. All other fields come from `DispatchInput` or runtime measurements.

**No success-path emissions**, no `dispatch.start`, no `dispatch.success`. The log surface is failure-only, per Clarifications 2026-05-07 Q3.

---

## Concurrency invariant

`dispatchCli` is **single-flight by contract** — both facades wrap calls through `queue.run(...)` ([src/queue.ts](../../src/queue.ts)) before invoking `dispatchCli`. The module-level `inFlightChild` cell is therefore at most one-set-at-a-time. If the queue invariant ever changes (per-tool queues, parallel dispatch), the cell must upgrade to a `Set<ChildProcess>` and the kill function's body iterates. The function name `killInFlightChildren` (plural) anticipates that future change without requiring a rename.

---

## Test coverage (per data-model.md §test-coverage map)

Co-located at `src/cli-adapter/_dispatch.test.ts`:

- **Argv assembly**: vault/command/parameters/flags/copy combinations match FR-012 ordering; assertion pinned against the documented obsidian_exec.md:27 contract.
- **Classification table**: each row of the table above has a synthetic-spawn fixture asserting the correct UpstreamError code + details shape.
- **Bounds**: synthetic timeout fires within `timeoutMs + 500ms` window; synthetic cap-overflow truncates to `outputCapBytes`.
- **Atomicity (FR-015a)**: a test that races a synthetic SIGINT against the spawn→insert window (e.g., a synthetic spawn that immediately schedules a `process.emit("SIGINT")` after `spawn()` returns). Assertion: `inFlightChild` is non-null at the moment SIGINT is delivered, so `killInFlightChildren()` returns true.
- **Log emissions**: stderr-capturing test asserts exactly ONE line per failure-lifecycle event; assertion for ZERO lines on the success path and on `CLI_NON_ZERO_EXIT` / `ERR_NO_ACTIVE_FILE` / `CLI_REPORTED_ERROR` / `CLI_BINARY_NOT_FOUND`.
- **`killInFlightChildren()`**: returns false when no child in flight; returns true and SIGTERMs the child when one is in flight; SIGKILL grace fires after 2 s if the child has not exited.
