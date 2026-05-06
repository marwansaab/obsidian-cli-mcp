# Contract — `invokeCli`

**Module**: `src/cli-adapter/cli-adapter.ts` (repurposed; the typed-tool facade)
**Status**: design — public surface for typed tools (`read_note` and every future typed tool unless it justifies different bounds per FR-013).

The thin facade that applies fixed typed-tool bounds and routes through the FIFO single-flight queue before invoking `dispatchCli`.

---

## Constants

```ts
export const TYPED_TOOL_TIMEOUT_MS = 10_000;
export const TYPED_TOOL_OUTPUT_CAP_BYTES = 10 * 1024 * 1024;
```

These are NOT part of the public interface. Callers cannot override. A future typed tool that legitimately needs different bounds takes one of two paths per FR-013:

- **(a)** justifies a bump of `TYPED_TOOL_TIMEOUT_MS` or `TYPED_TOOL_OUTPUT_CAP_BYTES` for ALL typed tools (preferred — keeps "typed tools share one default" honest), or
- **(b)** routes through `invokeBoundedCli` directly with explicit per-call bounds (the rare case).

There is NO override knob on `invokeCli` itself — that would collapse the type-of-call signal between `invokeCli` and `invokeBoundedCli` (per ADR-007's Pattern X / Pattern Y discussion).

---

## Signature

```ts
export type TargetMode = "specific" | "active";

export interface InvokeCliInput {
  command: string;
  parameters: Record<string, string | number | boolean | undefined>;
  flags: string[];
  target_mode: TargetMode;
  copy?: boolean;          // optional; defaults to false
}

export interface InvokeCliSuccess {
  stdout: string;
  stderr: string;
}

export interface InvokeCliDeps {
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
  logger: Logger;          // forwarded to dispatchCli for failure-lifecycle emissions
  queue: Queue;            // FIFO single-flight queue
}

export function invokeCli(input: InvokeCliInput, deps: InvokeCliDeps): Promise<InvokeCliSuccess>;
```

---

## Pipeline

1. **Locator strip** — when `input.target_mode === "active"`, drop `vault`, `file`, `path` from `input.parameters` (preserves today's behavior at [src/cli-adapter/cli-adapter.ts:33](../../src/cli-adapter/cli-adapter.ts#L33) and [src/cli-adapter/cli-adapter.ts:119-129](../../src/cli-adapter/cli-adapter.ts#L119-L129)). The strip is a pure function — it does not mutate `input`.
2. **Translate to `DispatchInput`** — the `target_mode` field is dropped (dispatchCli has no `target_mode` concept); the stripped `parameters` (along with `command`, `flags`, optional `copy`) flow through; `vault` is extracted from `parameters` if present (today's adapter style — vault appears under `parameters.vault` for typed tools, NOT as a separate field).
3. **Wrap through queue** — `return deps.queue.run(() => dispatchCli(dispatchInput, dispatchDeps))`.
4. **Project the result** — `dispatchCli` returns `{ stdout, stderr, exitCode: 0, argv }`; `invokeCli`'s public output drops `exitCode` and `argv` to match today's `InvokeCliSuccess` shape.

---

## Bounds passed to `dispatchCli`

Always:

```ts
const dispatchInput: DispatchInput = {
  command: input.command,
  vault: extractedVault,                         // from input.parameters.vault, then dropped
  parameters: strippedParams,                    // post-locator-strip
  flags: input.flags,
  copy: input.copy ?? false,
  timeoutMs: TYPED_TOOL_TIMEOUT_MS,             // 10_000 — fixed
  outputCapBytes: TYPED_TOOL_OUTPUT_CAP_BYTES,  // 10 * 1024 * 1024 — fixed
};
```

---

## Error propagation

`dispatchCli` rejects with `UpstreamError` for all six failure verdicts. `invokeCli` re-throws unchanged — no transformation, no wrapping. The handler at the next level up (the per-tool `handler.ts` calling `invokeCli`) lets the `UpstreamError` propagate to `registerTool`'s wrapped handler, which surfaces it as the structured-error envelope.

This matches today's [src/cli-adapter/cli-adapter.ts:36-117](../../src/cli-adapter/cli-adapter.ts#L36-L117) error-propagation discipline — the typed-tool facade is a thin pass-through for errors.

---

## Behavior change vs today

Today's `invokeCli` ([src/cli-adapter/cli-adapter.ts](../../src/cli-adapter/cli-adapter.ts)):
- ❌ NO timeout
- ❌ NO output cap
- ❌ NO queue wrapping
- ❌ NO active-child registry insertion (the `obsidian_exec` registry is uninvolved)

After this feature:
- ✅ 10 s timeout, 10 MiB output cap (per `dispatchCli`'s always-on bounds, FR-009 / FR-010)
- ✅ Queue-wrapped (per research R6 — necessary for the single-cell registry's at-most-one invariant)
- ✅ Active-child registry insertion atomic with spawn (per FR-015 / FR-015a)
- ✅ Failure-lifecycle log emissions for timeout / cap / kill (per FR-018a)

These changes are operator-observable (read_note calls now have a 10 s ceiling and serialize with obsidian_exec) and must be called out in CHANGELOG.md per research R12.

---

## Test coverage

Co-located at `src/cli-adapter/cli-adapter.test.ts` (modified). The existing classification tests are preserved (they exercise the four-priority logic via `invokeCli` calls); new tests cover:

- **Bounds**: synthetic spawn that hangs ≥ 11 s rejects with `CLI_TIMEOUT` within ~10.5 s; synthetic spawn that emits 11 MiB rejects with `CLI_OUTPUT_TOO_LARGE` and the partial buffer is ≤ 10 MiB.
- **Queue serialization**: two `invokeCli` calls dispatched concurrently — the second waits for the first to complete (assertion: completion timestamps are monotonically ordered).
- **Locator strip**: `target_mode: "active"` with `parameters: { vault: "x", file: "y" }` — assert `dispatchCli` receives `parameters: {}` and `vault: undefined`.
- **No bounds knob**: TypeScript compilation alone enforces this — there is no overrides parameter in `InvokeCliInput`. A documentation note in the test file references FR-013.
