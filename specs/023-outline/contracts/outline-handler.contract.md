# Contract — `outline` handler

## `ExecuteDeps` shape

```typescript
import type { SpawnLike } from "../../cli-adapter/cli-adapter.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}
```

Identical to the `files` handler's `ExecuteDeps`. The `spawnFn` and `env` fields are test seams — production callers omit them and the cli-adapter's defaults are used.

## Single `invokeCli` call shape

The handler issues exactly ONE `invokeCli` invocation per request. The shape varies only by `input.total`:

### Default mode (`input.total !== true`)

```typescript
await invokeCli(
  {
    command: "outline",
    vault: input.vault,                  // undefined in active mode
    parameters: {
      format: "json",                    // hardcoded literal
      ...(input.file !== undefined ? { file: input.file } : {}),
      ...(input.path !== undefined ? { path: input.path } : {}),
    },
    flags: [],
    target_mode: input.target_mode,
  },
  { spawnFn, env, logger, queue },
);
```

### Count-only mode (`input.total === true`)

```typescript
await invokeCli(
  {
    command: "outline",
    vault: input.vault,                  // undefined in active mode
    parameters: {
      ...(input.file !== undefined ? { file: input.file } : {}),
      ...(input.path !== undefined ? { path: input.path } : {}),
    },
    flags: ["total"],                    // total flag — no format=json (mutually exclusive per F14)
    target_mode: input.target_mode,
  },
  { spawnFn, env, logger, queue },
);
```

The cli-adapter's argv assembly handles the rest: each parameter becomes a separate process argument (`format=json`, `path=…`, `vault=…`); each flag becomes a bare argument (`total`); the `target_mode` discriminator gates the cli-adapter's defence-in-depth strip of vault/file/path in active mode.

## Two-stage parse step (default mode)

```typescript
const trimmed = result.stdout.trim();

// Stage 0: empty-outline sentinel detection (R9 / F7)
if (trimmed === "No headings found.") {
  return { count: 0, headings: [] };
}

// Stage 1: JSON.parse
let parsed: unknown;
try {
  parsed = JSON.parse(trimmed);
} catch (cause) {
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    message: `Outline JSON parse failed: ${(cause as Error).message}`,
    cause,
    details: { stage: "json-parse", stdout: trimmed },
  });
}

// Stage 2: zod validation against upstream array schema
const upstreamArray = outlineUpstreamArraySchema.parse(parsed);

// Stage 3: field rename heading → text
const headings = upstreamArray.map((h) => ({
  level: h.level,
  text: h.heading,
  line: h.line,
}));

return { count: headings.length, headings };
```

If stage 2's zod parse throws (upstream returned malformed JSON shape), the `ZodError` propagates as-is — `registerTool`'s catch at the registration layer converts it to `VALIDATION_ERROR`. Note: this is an EDGE case — upstream's `format=json` output is contract-stable per F1. If this fires in production, it's a sign upstream contract changed and should be investigated rather than silently re-mapped.

Alternative — the handler could explicitly catch the ZodError from stage 2 and rethrow as `CLI_REPORTED_ERROR` with `details.stage = "envelope-parse"` for symmetry with the JSON.parse failure mapping. **Decision**: pass-through is preferred — `VALIDATION_ERROR` distinguishes "the tool's contract was misused" (input) from "the upstream contract diverged" (output). A ZodError on the upstream output is a contract-divergence signal that deserves a distinct surface. Reviewers can distinguish based on the stack trace.

## Single-stage parse step (count-only mode)

```typescript
const trimmed = result.stdout.trim();

// Stage 0: empty-outline sentinel detection (R9 / F7)
if (trimmed === "No headings found.") {
  return { count: 0, headings: [] };
}

// Stage 1: integer parse
const count = Number.parseInt(trimmed, 10);
if (!Number.isInteger(count) || count < 0 || String(count) !== trimmed) {
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    message: `Outline total mode returned non-integer stdout: ${JSON.stringify(trimmed)}`,
    details: { stage: "total-parse", stdout: trimmed },
  });
}

return { count, headings: [] };
```

The `String(count) !== trimmed` check rejects `"42 "` (trailing whitespace, but trimmed already runs), `"42abc"` (Number.parseInt would accept), and `"007"` (leading zero — should be exact). It locks the upstream's exact-integer-string contract from F6.

## Failure propagation chain

```
caller MCP request
  ↓
registerTool → schema.parse(input)
  ↓ (ZodError → VALIDATION_ERROR via _shared.asValidationError)
executeOutline(input, deps)
  ↓
invokeCli(...)
  ↓ (CLI_BINARY_NOT_FOUND | CLI_NON_ZERO_EXIT | CLI_REPORTED_ERROR | ERR_NO_ACTIVE_FILE — dispatch layer auto-classified per R7/R8/R10/R13)
parse step (one of two)
  ↓ (CLI_REPORTED_ERROR with details.stage = "json-parse" | "total-parse" — handler-imposed)
  ↓ (ZodError on upstream array shape → VALIDATION_ERROR — pass-through; contract-divergence signal)
return OutlineOutput
  ↓
registerTool wraps to MCP content[0].text envelope
```

**Zero new error codes** (FR-020 / Constitution Principle IV).

## Test seam pattern

Tests inject a stub `spawnFn` per the existing convention. Because the handler issues ONE invocation per request, the stub is simple:

```typescript
const spawnFn = vi.fn().mockResolvedValue({
  stdout: '[{"level":1,"heading":"Top","line":1}]\n',
  stderr: "",
  exitCode: 0,
});

const result = await executeOutline(
  { target_mode: "specific", vault: "X", path: "y.md" },
  { logger, queue, spawnFn, env: {} },
);

expect(spawnFn).toHaveBeenCalledTimes(1);
const argv = spawnFn.mock.calls[0][1];   // SpawnLike's argv parameter
expect(argv).toContain("outline");
expect(argv).toContain("format=json");
expect(argv).not.toContain("total");
expect(argv).toContain("vault=X");
expect(argv).toContain("path=y.md");
expect(result).toEqual({
  count: 1,
  headings: [{ level: 1, text: "Top", line: 1 }],
});
```

For count-only mode, the assertions invert: `argv` contains `total` and NOT `format=json`; `spawnFn` mock returns `stdout: "1\n"`.

For empty-outline tests, `spawnFn` mock returns `stdout: "No headings found.\n"`; the handler returns `{ count: 0, headings: [] }` regardless of mode.

## Single-spawn invariant

The handler MUST NOT issue a second `invokeCli` call under any code path. This is asserted in the handler test suite via `expect(spawnFn).toHaveBeenCalledTimes(1)` on every test case. Future maintainers adding code paths (e.g., a vault-registry pre-check) MUST update this invariant explicitly via spec amendment + plan re-evaluation.
