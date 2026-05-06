# Contract — `invokeBoundedCli`

**Module**: `src/cli-adapter/invoke-bounded-cli.ts`
**Status**: design — public surface for the `obsidian_exec` escape hatch.

The thin facade that applies escape-hatch defaults (30 s / 10 MiB), accepts a `timeoutMs` override (silently clamped at 120 s), and routes through the FIFO single-flight queue before invoking `dispatchCli`.

---

## Constants

```ts
export const OBSIDIAN_EXEC_DEFAULT_TIMEOUT_MS = 30_000;
export const OBSIDIAN_EXEC_OUTPUT_CAP_BYTES = 10 * 1024 * 1024;
export const OBSIDIAN_EXEC_MAX_TIMEOUT_MS = 120_000;
```

The `OBSIDIAN_EXEC_OUTPUT_CAP_BYTES` constant is NOT overridable today (matches today's behavior at [src/tools/obsidian_exec/handler.ts:13](../../src/tools/obsidian_exec/handler.ts#L13)). The `OBSIDIAN_EXEC_MAX_TIMEOUT_MS` constant is the silent-clamp ceiling per Clarifications 2026-05-07 Q1 / FR-011.

---

## Signature

```ts
export interface InvokeBoundedCliInput {
  command: string;
  parameters?: Record<string, string | number | boolean | undefined>;
  vault?: string;
  flags?: string[];
  copy?: boolean;
}

export interface InvokeBoundedCliOverrides {
  timeoutMs?: number;
}

export interface InvokeBoundedCliOutput {
  stdout: string;
  stderr: string;
  exitCode: 0;
  argv: string[];
}

export interface InvokeBoundedCliDeps {
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
  logger: Logger;
  queue: Queue;
}

export function invokeBoundedCli(
  input: InvokeBoundedCliInput,
  overrides: InvokeBoundedCliOverrides,
  deps: InvokeBoundedCliDeps,
): Promise<InvokeBoundedCliOutput>;
```

---

## Pipeline

1. **Compute effective timeout (with silent clamp)** —

   ```ts
   const requested = overrides.timeoutMs ?? OBSIDIAN_EXEC_DEFAULT_TIMEOUT_MS;
   const timeoutMs = Math.min(requested, OBSIDIAN_EXEC_MAX_TIMEOUT_MS);
   // No VALIDATION_ERROR, no warning, no log line. Clamp is silent per Q1/FR-011.
   ```

2. **No locator strip** — escape-hatch surface trusts the caller's parameters fully. Unlike `invokeCli`, there is no `target_mode` concept; `vault` (when present) goes into the documented argv prefix verbatim.

3. **Translate to `DispatchInput`** —

   ```ts
   const dispatchInput: DispatchInput = {
     command: input.command,
     vault: input.vault,
     parameters: input.parameters ?? {},
     flags: input.flags ?? [],
     copy: input.copy ?? false,
     timeoutMs,                                       // clamped
     outputCapBytes: OBSIDIAN_EXEC_OUTPUT_CAP_BYTES,  // 10 MiB — fixed for now
   };
   ```

4. **Wrap through queue** — `return deps.queue.run(() => dispatchCli(dispatchInput, dispatchDeps))`.

5. **Pass-through output** — `dispatchCli` returns `{ stdout, stderr, exitCode: 0, argv }` and `invokeBoundedCli` returns it unchanged. (Unlike `invokeCli`, the escape-hatch surface DOES surface `argv` and `exitCode` because `obsidian_exec`'s response includes them per its existing contract at [src/tools/obsidian_exec/handler.ts:15-20](../../src/tools/obsidian_exec/handler.ts#L15-L20).)

---

## Silent-clamp semantics (Clarifications 2026-05-07 Q1 / FR-011)

When `overrides.timeoutMs > OBSIDIAN_EXEC_MAX_TIMEOUT_MS`:

- The effective `timeoutMs` is set to `OBSIDIAN_EXEC_MAX_TIMEOUT_MS` (120 s).
- The dispatch proceeds with the clamped value.
- NO `VALIDATION_ERROR` is raised.
- NO warning is emitted to stderr.
- NO log line is written.
- The agent that supplied the over-the-ceiling value gets a successful response (or whatever `dispatchCli` resolves with) — possibly a `CLI_TIMEOUT` if the call still hangs past 120 s.

**Defense-in-depth caveat (research R2)**: today's `obsidianExecSchema.timeoutMs.max(120000)` zod constraint at [src/tools/obsidian_exec/schema.ts:12](../../src/tools/obsidian_exec/schema.ts#L12) rejects values > 120000 BEFORE they reach `invokeBoundedCli`. The clamp is therefore unreachable from the MCP path today. It exists for:
- Future schema relaxations (if the `.max(120000)` is removed at any point, the clamp catches the slack).
- Internal callers (tests, future tools using `invokeBoundedCli` directly) that don't go through the schema.

---

## Behavior parity vs today's `obsidian_exec/handler.ts`

| Behavior | Today | After this feature |
|---|---|---|
| Default timeout | 30 s ([handler.ts:11](../../src/tools/obsidian_exec/handler.ts#L11)) | 30 s (`OBSIDIAN_EXEC_DEFAULT_TIMEOUT_MS`) |
| Caller override | `timeoutMs` field, schema-capped at 120 s | `overrides.timeoutMs`, runtime-clamped at 120 s; schema still caps at 120 s |
| Output cap | 10 MiB ([handler.ts:13](../../src/tools/obsidian_exec/handler.ts#L13)) | 10 MiB (`OBSIDIAN_EXEC_OUTPUT_CAP_BYTES`) |
| SIGINT/SIGTERM handling | Active-child slot in handler.ts | Active-child cell in `_dispatch.ts` (FR-015) |
| argv order | `[vault=..., command, kvs..., flags..., --copy]` ([handler.ts:251-258](../../src/tools/obsidian_exec/handler.ts#L251-L258)) | Same — adopted as the documented contract for the unified primitive |
| Error classification | Three-priority (`CLI_NON_ZERO_EXIT` > generic `Error:` > success) | **Four-priority** with `ERR_NO_ACTIVE_FILE` between non-zero and `Error:` (FR-014); newly reachable per FR-021 |
| `call.start` / `call.end*` logger events | Emitted per call ([handler.ts:70](../../src/tools/obsidian_exec/handler.ts#L70) etc.) | **REMOVED** per research R3; replaced by failure-only `dispatch.*` events |
| Queue wrapping | Yes ([handler.ts:52](../../src/tools/obsidian_exec/handler.ts#L52)) | Yes (research R6) |

---

## Test coverage

Co-located at `src/cli-adapter/invoke-bounded-cli.test.ts` (NEW):

- **Default timeout**: synthetic spawn that hangs ≥ 31 s rejects with `CLI_TIMEOUT` and `details.timeoutMs === 30000`.
- **Override honored**: `overrides.timeoutMs: 90000` against a 91 s synthetic spawn → `CLI_TIMEOUT` with `details.timeoutMs === 90000`.
- **Silent clamp**: `overrides.timeoutMs: 200000` against a 121 s synthetic spawn → `CLI_TIMEOUT` with `details.timeoutMs === 120000`. **No `VALIDATION_ERROR`**, no warning, no extra log line.
- **`copy` flag**: `input.copy: true` → argv tail is `--copy`; `input.copy: false` (or omitted) → argv tail does NOT include `--copy`.
- **Queue serialization**: two `invokeBoundedCli` calls overlap → second waits.
- **Argv parity with today's `obsidian_exec/handler.ts`**: a snapshot test against `assembleSpawnArgs(input)`'s output for the same input shape (modulo argv prefix re-ordering).
- **`CLI_OUTPUT_TOO_LARGE` cap is fixed**: there is no `overrides.outputCapBytes` (TypeScript enforces; runtime would ignore unknown fields).
