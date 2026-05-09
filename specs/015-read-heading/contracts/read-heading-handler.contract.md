# Handler Contract — `read_heading`

**Feature**: [015-read-heading](../spec.md)
**Date**: 2026-05-09
**Companion**: [read-heading-input.contract.md](./read-heading-input.contract.md) for the public input contract.

This document records the handler-layer invariants for `read_heading`: the `executeReadHeading` function shape, the deps shape, the single `invokeCli` call shape, the JS template assembly + base64 payload renderer, the two-stage eval response parse, the envelope-error → UpstreamError mapping, the failure propagation chain, and the test seam pattern with argv-payload decode assertion.

---

## Function shape

```typescript
// src/tools/read_heading/handler.ts

import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import {
  HEADING_PATH_SEPARATOR,
  readHeadingEvalResponseSchema,
  type ReadHeadingInput,
  type ReadHeadingOutput,
} from "./schema.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export async function executeReadHeading(
  input: ReadHeadingInput,
  deps: ExecuteDeps,
): Promise<ReadHeadingOutput>;
```

### Invariants

- `executeReadHeading` is **pure** with respect to its inputs given the test-seam stub (`deps.spawnFn`).
- `executeReadHeading` MUST NOT call any other CLI subcommand than `eval`.
- `executeReadHeading` MUST issue exactly ONE `invokeCli` call per request (R3).
- `executeReadHeading` MUST NOT cache the result across requests; every call re-walks the cache via the eval template.
- `executeReadHeading` MUST surface every failure via `UpstreamError` (or via the `VALIDATION_ERROR` already raised by `registerTool`'s parse step).

---

## Deps shape

`ExecuteDeps` mirrors the established pattern from 011 / 012 / 013 / 014:

| Field | Type | Required | Notes |
|---|---|---|---|
| `logger` | `Logger` | Yes | Forwarded to the cli-adapter for `dispatchTimeout` / `dispatchCap` / `dispatchKill` events. The handler does NOT emit per-call `callStart` / `callEndSuccess` / `callEndFailure` events (R1). |
| `queue` | `Queue` | Yes | Forwarded to the cli-adapter; serialises in-flight CLI invocations. |
| `spawnFn` | `SpawnLike?` | No | Test seam — handler tests inject a stub; production omits and the cli-adapter falls back to `node:child_process.spawn`. |
| `env` | `NodeJS.ProcessEnv?` | No | Test seam — overrides for environment-dependent CLI behaviour. |

---

## Single `invokeCli` call shape

```typescript
const result = await invokeCli(
  {
    command: "eval",
    vault: input.target_mode === "specific" ? input.vault : undefined,
    parameters: { code },
    flags: [],
    target_mode: input.target_mode,
  },
  { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
);
```

### Argv shape (locked by test)

| Mode | argv (after binary) |
|---|---|
| Specific | `["vault=<v>", "eval", "code=<JS>"]` |
| Active | `["eval", "code=<JS>"]` |

In active mode there is NO `vault=` prefix. The cli-adapter's `stripTargetLocators` defence-in-depth strip ensures `vault` / `file` / `path` never leak into `parameters`.

### Latency budget

- Per-call wire latency: ~200 ms (probed live for `eval` invocations of comparable size at plan stage; see [research.md F3](../research.md#f3-obsidian-eval-returns-prefix-result-on-stdout)).
- Eval CPU latency inside Obsidian: O(heading_count) for the metadata walk + O(file_size) for the `app.vault.adapter.read` call + O(body_size) for the slice and JSON encode. Typical: <10 ms.
- Total budget: well within the 10 s typed-tool timeout.

---

## JS template assembly + base64 payload renderer

```typescript
const JS_TEMPLATE = `(async()=>{ ... })()`;  // see data-model.md § JS template body

const payloadJson = JSON.stringify({
  active: input.target_mode === "active",
  path:   input.target_mode === "specific" ? input.path ?? null : null,
  file:   input.target_mode === "specific" ? input.file ?? null : null,
  segments: input.heading.split(HEADING_PATH_SEPARATOR),
});
const payloadB64 = Buffer.from(payloadJson, "utf-8").toString("base64");
const code = JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64);
```

### Anti-injection invariants (R6)

1. `JS_TEMPLATE` is a **frozen string constant**. It contains exactly one occurrence of the placeholder `__PAYLOAD_B64__`.
2. `payloadB64` is the output of `Buffer.from(..., "utf-8").toString("base64")`. Every byte in the output is in the alphabet `[A-Za-z0-9+/=]`. None of these characters has any meaning inside a JavaScript single-quoted string literal — no quotes, no backslashes, no template-literal interpolation chars, no newlines.
3. The substituted string is therefore guaranteed to be a syntactically inert region inside the JS source. User-controlled input (heading segments, path, file) flows through `JSON.stringify` → `base64` → `atob` + `JSON.parse` at runtime, never reaching the JS source as text.
4. Test coverage (R12): the handler test's stub `spawnFn` decodes the base64 back to JSON and asserts the `segments` / `path` / `file` / `active` fields round-trip the user's input bit-for-bit.

---

## Two-stage eval response parse

```typescript
let stdout = result.stdout.trimStart();
if (stdout.startsWith("=> ")) stdout = stdout.slice(3);

// Stage 1: JSON parse
let parsedJson: unknown;
try {
  parsedJson = JSON.parse(stdout);
} catch (err) {
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: err,
    details: { stage: "json-parse", stdout: result.stdout.slice(0, 500) },
    message: `read_heading: eval response is not JSON: ${result.stdout.slice(0, 200)}`,
  });
}

// Stage 2: envelope-schema parse
const validated = readHeadingEvalResponseSchema.safeParse(parsedJson);
if (!validated.success) {
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: validated.error,
    details: { stage: "envelope-parse", stdout: result.stdout.slice(0, 500) },
    message: "read_heading: eval response shape unexpected",
  });
}

// Envelope ok:false → mapped UpstreamError per R13
if (!validated.data.ok) {
  if (validated.data.code === "NO_ACTIVE_FILE") {
    throw new UpstreamError({
      code: "ERR_NO_ACTIVE_FILE",
      cause: null,
      details: { stage: "envelope-error", detail: validated.data.detail },
      message: "read_heading: no note focused; switch to specific mode or focus a note.",
    });
  }
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: {
      stage: "envelope-error",
      code: validated.data.code,                  // FILE_NOT_FOUND | HEADING_NOT_FOUND
      detail: validated.data.detail,
    },
    message: validated.data.code === "FILE_NOT_FOUND"
      ? `read_heading: file not found (${validated.data.detail})`
      : `read_heading: heading path not found in file (${validated.data.detail})`,
  });
}

// Envelope ok:true → return the body
return { content: validated.data.content };
```

---

## Envelope-error → `UpstreamError` mapping

| Envelope shape | UpstreamError `code` | UpstreamError `details.stage` | UpstreamError `details` extras |
|---|---|---|---|
| `{ok: true, content: <string>}` | (no error; return `{content}`) | — | — |
| `{ok: false, code: "NO_ACTIVE_FILE", detail}` | `ERR_NO_ACTIVE_FILE` | `envelope-error` | `detail` |
| `{ok: false, code: "FILE_NOT_FOUND", detail}` | `CLI_REPORTED_ERROR` | `envelope-error` | `code: "FILE_NOT_FOUND"`, `detail` |
| `{ok: false, code: "HEADING_NOT_FOUND", detail}` | `CLI_REPORTED_ERROR` | `envelope-error` | `code: "HEADING_NOT_FOUND"`, `detail` |
| `JSON.parse` throws | `CLI_REPORTED_ERROR` | `json-parse` | `stdout: <prefix>` |
| envelope-schema-parse fails | `CLI_REPORTED_ERROR` | `envelope-parse` | `stdout: <prefix>` |
| (Inherited from cli-adapter) `Vault not found.` reclassified | `CLI_REPORTED_ERROR` | (no stage; classified at adapter layer) | `command: "eval"`, `stdout`, `exitCode: 0`, `message: "Vault not found."` |
| (Inherited from cli-adapter) Output cap fires | `CLI_NON_ZERO_EXIT` | (no stage; killReason carries cap details) | `killReason: {kind: "cap", stream: "stdout", capturedBytes}` |
| (Inherited from dispatch layer) `Error: no active file` reclassified | `ERR_NO_ACTIVE_FILE` | (no stage) | (whatever the dispatch layer carries) |
| (Inherited) Any other `Error: <...>` reclassified | `CLI_REPORTED_ERROR` | (no stage) | (dispatch-layer details) |

---

## Failure propagation chain

```
                    user input
                        │
                        ▼
         ┌──────────────────────────────┐
         │  registerTool (parse step)   │  → ZodError → VALIDATION_ERROR
         └──────────────┬───────────────┘
                        │ (validated input)
                        ▼
         ┌──────────────────────────────┐
         │  executeReadHeading          │
         │  • assemble payload          │
         │  • base64 encode             │
         │  • render JS template        │
         └──────────────┬───────────────┘
                        ▼
         ┌──────────────────────────────┐
         │  invokeCli                   │
         │  • queue.run                 │
         │  • dispatchCli               │  → CLI_BINARY_NOT_FOUND
         │  • 011-R5 unknown-vault      │  → CLI_REPORTED_ERROR
         │  • dispatch error classifier │  → ERR_NO_ACTIVE_FILE / CLI_REPORTED_ERROR / CLI_NON_ZERO_EXIT
         └──────────────┬───────────────┘
                        │ (success path: stdout)
                        ▼
         ┌──────────────────────────────┐
         │  Stage 1: JSON.parse         │  → CLI_REPORTED_ERROR (stage: json-parse)
         └──────────────┬───────────────┘
                        ▼
         ┌──────────────────────────────┐
         │  Stage 2: envelope safeParse │  → CLI_REPORTED_ERROR (stage: envelope-parse)
         └──────────────┬───────────────┘
                        ▼
         ┌──────────────────────────────┐
         │  Envelope discriminator      │
         │  • ok: false / NO_ACTIVE_…   │  → ERR_NO_ACTIVE_FILE (stage: envelope-error)
         │  • ok: false / FILE_NOT_…    │  → CLI_REPORTED_ERROR (stage: envelope-error, code: FILE_NOT_FOUND)
         │  • ok: false / HEADING_NOT_… │  → CLI_REPORTED_ERROR (stage: envelope-error, code: HEADING_NOT_FOUND)
         │  • ok: true                  │
         └──────────────┬───────────────┘
                        ▼
                 { content: <string> }
                        │
                        ▼
         ┌──────────────────────────────┐
         │  registerTool (output wrap)  │  → JSON-serialise into MCP content[0].text
         └──────────────────────────────┘
```

Every arrow that produces an error code is locked by at least one handler test. Specifically:
- ZodError pass-through: schema tests assert validation rejects without calling the dispatcher.
- 011-R5 inheritance: handler test stubs "Vault not found." stdout and asserts the propagated UpstreamError.
- Dispatch error classifier: handler tests stub "Error: no active file" stdout and asserts `ERR_NO_ACTIVE_FILE` propagates; stub other "Error:" stdout for general `CLI_REPORTED_ERROR`; stub cap-trigger for `CLI_NON_ZERO_EXIT`.
- Stage 1 / Stage 2 / envelope-discriminator: handler tests stub each shape and assert the right UpstreamError + details.

---

## Test seam pattern (R12)

```typescript
// In handler.test.ts (sketch):

it("locks R6 anti-injection: payload round-trips user input bit-for-bit", async () => {
  const adversarialHeading = `Outer::Inner"); doSomething(); //`;
  let capturedArgv: string[] | undefined;

  const stubSpawnFn: SpawnLike = (binary, argv, _options) => {
    capturedArgv = argv;
    return makeStubChild({ stdout: '=> {"ok":true,"content":"body"}\n', exitCode: 0 });
  };

  await executeReadHeading(
    {
      target_mode: "specific",
      vault: "WorkVault",
      path: "x.md",
      heading: adversarialHeading,
    },
    { logger: noopLogger, queue: testQueue, spawnFn: stubSpawnFn },
  );

  expect(capturedArgv).toBeDefined();
  // argv = ["vault=WorkVault", "eval", "code=(async()=>{...})()"]
  const codeArg = capturedArgv![2];
  expect(codeArg.startsWith("code=")).toBe(true);
  const code = codeArg.slice("code=".length);

  // Extract the base64 payload
  const m = code.match(/atob\('([A-Za-z0-9+/=]+)'\)/);
  expect(m).toBeTruthy();
  const payloadJson = Buffer.from(m![1], "base64").toString("utf-8");
  const payload = JSON.parse(payloadJson);

  expect(payload.segments).toEqual(["Outer", `Inner"); doSomething(); //`]);
  expect(payload.path).toBe("x.md");
  expect(payload.file).toBeNull();
  expect(payload.active).toBe(false);
});
```

This test is the structural lock for the anti-injection contract. If a future code change interpolates user input as text into the JS template, the regex extraction of `atob('<base64>')` will either fail to match (because the payload region was replaced) or the decoded JSON will not equal the user's input (because something else got encoded).

---

## Single-spawn invariant (R3)

Every handler test's stub `spawnFn` MUST be called exactly ONCE per `executeReadHeading` invocation. The test infrastructure asserts a counter:

```typescript
let spawnCount = 0;
const stubSpawnFn: SpawnLike = (binary, argv, options) => {
  spawnCount++;
  return makeStubChild({ ... });
};

await executeReadHeading(input, { ..., spawnFn: stubSpawnFn });

expect(spawnCount).toBe(1);
```

Two-call regression (e.g. someone refactoring to add a pre-flight vault probe) would surface as `spawnCount === 2` and fail the test.

---

## Notes on inherited surfaces

- The cli-adapter's `dispatchCli` / `invokeCli` / `invokeBoundedCli` are **frozen** by 008-refactor. `read_heading`'s handler does not modify them.
- The 011-R5 unknown-vault response-inspection clause at [src/cli-adapter/cli-adapter.ts:86](../../src/cli-adapter/cli-adapter.ts#L86) is inherited unchanged. `read_heading`'s handler tests assert the inherited path by stubbing "Vault not found." stdout and checking the propagated UpstreamError.
- The dispatch layer's four-priority error classifier at [src/cli-adapter/_dispatch.ts:254-274](../../src/cli-adapter/_dispatch.ts#L254-L274) is inherited unchanged. `read_heading`'s handler tests assert pass-through for `Error: no active file` (→ `ERR_NO_ACTIVE_FILE`) and general `Error: <...>` (→ `CLI_REPORTED_ERROR`).
- The output-cap mechanism is inherited from the cli-adapter's `TYPED_TOOL_OUTPUT_CAP_BYTES = 10 * 1024 * 1024` constant. `read_heading` makes no per-tool cap override.
