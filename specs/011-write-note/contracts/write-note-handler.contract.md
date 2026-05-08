# Contract — `write_note` Handler

**Feature**: [011-write-note](../spec.md)
**Date**: 2026-05-08

This document is the public contract for `executeWriteNote(input, deps)` — the handler function that powers the `write_note` MCP tool. It captures the dependency shape, the `invokeCli` call invariants, the argv-mapping rules, the success-response parsing, and the failure propagation chain.

---

## Signature

```ts
// src/tools/write_note/handler.ts
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import type { WriteNoteInput, WriteNoteOutput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export async function executeWriteNote(
  input: WriteNoteInput,
  deps: ExecuteDeps,
): Promise<WriteNoteOutput>;
```

The deps shape mirrors `executeReadNote` exactly. `spawnFn` and `env` are test seams (per R7); `logger` and `queue` are the production wiring (passed by `src/server.ts` from the shared `createServer` setup).

---

## Invariants

### Pre-condition: input is parsed and validated

The handler trusts its `input` parameter. It MUST NOT re-parse against the schema, MUST NOT defensively check for missing required fields, and MUST NOT inspect raw user input. The `registerTool` factory parses input via `writeNoteInputSchema.parse(args)` and only invokes the handler with a successfully-parsed `WriteNoteInput`. Per Constitution Principle III: "validated values MUST be passed to inner functions as already-typed objects, not re-validated downstream."

Specifically, the handler relies on these post-parse guarantees:
- `input.target_mode === "specific" || input.target_mode === "active"`
- If `input.target_mode === "specific"`: `input.vault` is a non-empty string; exactly one of `input.file` / `input.path` is defined.
- If `input.target_mode === "active"`: `input.vault === undefined`, `input.file === undefined`, `input.path === undefined`, `input.template === undefined`, `input.open === undefined`, `input.overwrite === true`.
- `input.content` is a string (possibly empty).
- `input.overwrite` is `boolean` (post-`.default(false)`).
- No unknown top-level keys (post-`.strict()`).

### Argv assembly invariants

1. **Subcommand**: always `"create"`.
2. **Vault hoisting**: `vault` is passed as a top-level field to `invokeCli`; the cli-adapter's `dispatchCli` hoists it to the `vault=<value>` argv-prefix slot. The handler does NOT include `vault` inside `parameters`.
3. **File rename**: `input.file` (user-facing wikilink-form locator) maps to `parameters.name` (the CLI's `create` argv key). The handler does NOT pass `file` as a parameter for the create subcommand. (See R3 in [research.md](../research.md).)
4. **Locator XOR**: at most one of `parameters.name` / `parameters.path` is present per call. Schema's `superRefine` guarantees the input had at most one; handler propagates.
5. **Content emission**: `parameters.content = input.content` always (specific AND active modes). Empty string is a valid value; the handler does NOT short-circuit on empty content.
6. **Template forwarding**: `parameters.template = input.template` only when `input.template !== undefined`. Specific mode only (active mode's `template === undefined` is guaranteed).
7. **Overwrite flag**: append `"overwrite"` to `flags` only when `input.overwrite === true`. Active mode unconditionally appends (parse guarantees `true`); specific mode appends only on caller opt-in.
8. **Open flag**: append `"open"` to `flags` only when `(input.open ?? false) === true`. Active mode never appends (parse guarantees `input.open === undefined`); specific mode appends only on caller opt-in. Note: handler reads `input.open ?? false` because the schema does NOT default `open` (R6).
9. **No newtab**: this BI does NOT support the `newtab` flag (out of scope per spec). Agents needing it use `obsidian_exec`.
10. **target_mode forwarded**: `target_mode: input.target_mode` is passed to `invokeCli` as-is so the adapter applies its active-mode locator-stripping defence-in-depth (per [src/cli-adapter/cli-adapter.ts:60-62](../../../src/cli-adapter/cli-adapter.ts#L60-L62)).

### Response parsing invariants

1. **Success path**: the handler parses `{ stdout, stderr }` from the `InvokeCliSuccess` return value. The parsing logic locks against the live CLI's output (R4 / T0.1–T0.3) — currently `Created: <path>` for fresh creations; hypothesised `Updated: <path>` (or similar) for overwrites. T0 verifies; if the signal is unreliable, R4 amends per its trigger.
2. **Returned shape**: `{ created: boolean, path: string }` derived from the parsed CLI line. Both fields are always populated; no `undefined` in the success envelope.
3. **Path verbatim**: the `path` value is the CLI's reported value, NOT a re-derivation from the input locator. For wikilink-form input (`file=`) the CLI resolves to a canonical path that may include a folder prefix; the handler propagates the resolved value verbatim.
4. **No content echo**: the response does NOT include `content` (the bytes were sent to the CLI; round-tripping them through the response would double the payload size and mislead callers about the on-disk state if the CLI normalised anything).

### Failure propagation invariants

1. **No swallowing**: the handler does NOT catch `UpstreamError` to mask, mutate, or re-classify. It propagates the adapter's classification verbatim; `registerTool`'s outer catch wraps it via `asToolError`.
2. **Re-throw on unexpected**: any non-`UpstreamError` exception (e.g., a runtime TypeError from a bug in argv-assembly) is allowed to escape; `registerTool` re-throws, the SDK's outer envelope catches and serialises as a generic error. Mirrors the `obsidian_exec` / `read_note` precedent.
3. **No new error codes**: zero new codes are introduced (FR-018). The four propagated codes from the adapter (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`) plus `VALIDATION_ERROR` from `registerTool`'s wrap cover the entire failure surface.
4. **Unparseable success**: if the CLI exits 0 but the stdout doesn't match any known success-response pattern (per R4), the handler throws `UpstreamError({ code: "CLI_REPORTED_ERROR", message: "write_note could not parse CLI response: ...", details: { stdout } })`. Treats unparseable success as an in-band CLI error rather than crashing the bridge.
5. **Active-mode no-active-file**: the cli-adapter classifies "no active file" responses as `ERR_NO_ACTIVE_FILE` (per [003-cli-adapter](../../003-cli-adapter/spec.md) FR-008(b)). The handler propagates verbatim; the recovery message ("focus a note or switch to specific mode" or substantively equivalent) is the adapter's, not the handler's.

---

## `invokeCli` call shape (canonical)

### Specific mode

```ts
const parameters: Record<string, string> = {
  ...(input.file !== undefined ? { name: input.file } : {}),
  ...(input.path !== undefined ? { path: input.path } : {}),
  content: input.content,
  ...(input.template !== undefined ? { template: input.template } : {}),
};
const flags: string[] = [];
if (input.overwrite === true) flags.push("overwrite");
if ((input.open ?? false) === true) flags.push("open");

const { stdout } = await invokeCli(
  {
    command: "create",
    vault: input.vault!,                // non-null assertion justified by primitive's superRefine invariant
    parameters,
    flags,
    target_mode: "specific",
  },
  { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
);
return parseCreateResponse(stdout);
```

### Active mode

```ts
// Schema guarantees: parsed.overwrite === true, parsed.template === undefined, parsed.open === undefined.
const parameters: Record<string, string> = { content: input.content };
const flags: string[] = ["overwrite"];   // unconditionally emitted; parse-guaranteed

const { stdout } = await invokeCli(
  {
    command: "create",
    vault: undefined,
    parameters,
    flags,
    target_mode: "active",
  },
  { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
);
return parseCreateResponse(stdout);
```

The two branches share the same `parseCreateResponse` helper; the only difference is argv shape.

---

## Test seam (FR-016 Handler Tests)

`deps.spawnFn` is the canonical injection point. Tests construct stub `SpawnLike` factories that return mock `ChildProcess` objects with controlled exit codes, stdout, and stderr. The cli-adapter's existing test patterns (`src/cli-adapter/_dispatch.test.ts`) demonstrate the shape; `write_note`'s handler tests reuse them.

Example handler test scaffold:

```ts
import { test, expect } from "vitest";
import { executeWriteNote } from "./handler.js";
import { createLogger } from "../../logger.js";
import { createQueue } from "../../queue.js";
import { makeStubSpawn } from "../../cli-adapter/test-helpers.js";  // hypothetical helper

test("happy-path specific path mode (Story 1 IT)", async () => {
  const argvCalls: string[][] = [];
  const stubSpawn = makeStubSpawn({
    onSpawn: (binary, argv) => argvCalls.push(argv),
    exitCode: 0,
    stdout: "\nCreated: Inbox/Idea.md\n",
  });
  const result = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "MyVault",
      path: "Inbox/Idea.md",
      content: "# Idea\n\nBody\n",
      overwrite: false,
      // open omitted (undefined per R6)
    },
    { logger: createLogger(), queue: createQueue(), spawnFn: stubSpawn },
  );
  expect(result).toEqual({ created: true, path: "Inbox/Idea.md" });
  expect(argvCalls[0]).toEqual([
    "vault=MyVault", "create", "path=Inbox/Idea.md", "content=# Idea\n\nBody\n",
  ]);
});
```

Argv shape in the test reflects `dispatchCli`'s actual hoisting — `vault=` first, then subcommand, then key=value parameters, then flags. (The handler doesn't construct this exact array; the handler passes structured `{vault, parameters, flags, target_mode}` to `invokeCli`, which then hoists into `dispatchCli`'s argv assembly. Tests verify the final argv that hits `spawnFn`.)

---

## Handler module size budget (SC-007)

Total file LOC ≤ 70. Breakdown estimate:
- `// Original — no upstream.` header: 1
- imports: ~6
- `ExecuteDeps` interface: ~6
- `parseCreateResponse` helper: ~15
- `executeWriteNote` body: ~30
- blank lines / comments: ~12

Tight ceiling forces the handler to remain a thin transformer. If it grows beyond 70 LOC, that's a signal to extract logic to the adapter (R5's response-inspection clause is a good example — it lives in the adapter, not in the handler).

---

## Stability

- **Internal**: yes. The handler is not exported from `src/index.ts`; its only consumer is `src/tools/write_note/index.ts`.
- **Test contract**: the `ExecuteDeps` interface is the test surface. Renaming or restructuring it requires updating the co-located handler tests in the same change.
- **Adapter coupling**: the handler is tightly coupled to `invokeCli`'s `InvokeCliInput` shape. If the adapter's signature changes (e.g., the 008-refactor surface unfreezes in a future BI), the handler updates in lock-step.
