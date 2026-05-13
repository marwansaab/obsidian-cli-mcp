# Contract — `properties` handler

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

Identical to the `files` / `outline` handler's `ExecuteDeps`. The `spawnFn` and `env` fields are test seams — production callers omit them and the cli-adapter's defaults are used.

## Single `invokeCli` call shape

The handler issues exactly ONE `invokeCli` invocation per request. The shape varies only by `input.total`:

### Default mode (`input.total !== true`)

```typescript
await invokeCli(
  {
    command: "properties",
    parameters: {
      format: "json",                          // hardcoded literal
      ...(input.vault !== undefined ? { vault: input.vault } : {}),
    },
    flags: [],
    // NO target_mode field — properties is vault-only.
  },
  { spawnFn, env, logger, queue },
);
```

### Count-only mode (`input.total === true`)

```typescript
await invokeCli(
  {
    command: "properties",
    parameters: {
      ...(input.vault !== undefined ? { vault: input.vault } : {}),
    },
    flags: ["total"],                         // total flag — no format=json
    // NO target_mode field.
  },
  { spawnFn, env, logger, queue },
);
```

The cli-adapter's argv assembly handles the rest: each parameter becomes a separate process argument (`format=json`, `vault=…`); each flag becomes a bare argument (`total`). The cli-adapter's defence-in-depth `stripTargetLocators` does NOT execute (no `target_mode` field; this is a vault-only surface). Per F2, the wrapper does NOT pass the upstream `counts` flag — `count` is always present in `format=json` output. Per F14, the wrapper does NOT pass an explicit `sort=name` — upstream's default IS name-sort AND the wrapper applies its own post-fetch sort regardless of upstream order.

## Multi-stage parse step (default mode)

```typescript
const trimmed = result.stdout.trim();

// Stage 1: JSON.parse
let parsed: unknown;
try {
  parsed = JSON.parse(trimmed);
} catch (cause) {
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    message: `Properties JSON parse failed: ${(cause as Error).message}`,
    cause,
    details: { stage: "json-parse", stdout: trimmed },
  });
}

// Stage 2: zod validation against upstream array schema
const upstreamArray = propertiesUpstreamArraySchema.parse(parsed);

// Stage 3: drop type, rename count → noteCount
const properties = upstreamArray.map(({ name, count }) => ({
  name,
  noteCount: count,
}));

// Stage 4: wrapper-side post-fetch sort (FR-013 — case-insensitive primary + byte-tiebreak)
properties.sort((a, b) => {
  const aLower = a.name.toLowerCase();
  const bLower = b.name.toLowerCase();
  if (aLower !== bLower) return aLower < bLower ? -1 : 1;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
});

return { count: properties.length, properties };
```

If stage 2's zod parse throws (upstream returned malformed JSON shape), the `ZodError` propagates as-is — `registerTool`'s catch at the registration layer converts it to `VALIDATION_ERROR`. Note: this is an EDGE case — upstream's `format=json` output is contract-stable per F1. If this fires in production, it's a sign upstream contract changed and should be investigated rather than silently re-mapped. Same architectural decision as BI-023 outline-handler.contract — pass-through preferred over wrapper-side catch.

## Single-stage parse step (count-only mode)

```typescript
const trimmed = result.stdout.trim();

// Stage 1: integer parse
const count = Number.parseInt(trimmed, 10);
if (!Number.isInteger(count) || count < 0 || String(count) !== trimmed) {
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    message: `Properties total mode returned non-integer stdout: ${JSON.stringify(trimmed)}`,
    details: { stage: "total-parse", stdout: trimmed },
  });
}

return { count, properties: [] };
```

The `String(count) !== trimmed` check rejects `"42 "` (trailing whitespace; trimmed already runs but explicit), `"42abc"` (Number.parseInt would accept), and `"007"` (leading zero — should be exact). It locks the upstream's exact-integer-string contract from F3.

**No empty-vault sentinel branch** at plan stage (R9 deferred to T0). The natural empty paths — `[]` JSON array in default mode and integer `0` in count-only mode — produce `{ count: 0, properties: [] }` via the parse-and-map-and-sort chain (empty array stays empty; integer 0 stays 0) without any special-case code. If T0 reveals a sentinel string, the handler gains a sentinel-detection branch parallel to BI-023 R9. Planning contingency only.

## Wrapper-side post-fetch sort

Per FR-013 (locked at the 2026-05-13 clarifications session Q1), the wrapper applies case-insensitive primary sort with byte-order tiebreak post-fetch. Implementation:

```typescript
properties.sort((a, b) => {
  const aLower = a.name.toLowerCase();
  const bLower = b.name.toLowerCase();
  if (aLower !== bLower) return aLower < bLower ? -1 : 1;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
});
```

Notes:

- `toLowerCase()` is JS-default Unicode-aware case folding. For pure-ASCII property names (the dominant case in YAML frontmatter), this matches the byte-order case-fold. For non-ASCII names (rare in Obsidian frontmatter but legal in YAML), the JS `toLowerCase()` provides a reasonable Unicode case-fold; the wrapper is not locked to ASCII-only semantics.
- The comparison is `<` and `>` rather than `.localeCompare()` — this gives byte-order semantics for the tiebreak (`A`=0x41 < `a`=0x61 places `Apple` before `apple` consistently). `localeCompare` introduces locale-dependent ordering that the spec explicitly does NOT want.
- The sort is **stable** in modern JavaScript engines (post-ES2019). For identical case-folded names, the byte-order tiebreak is deterministic.
- For empty array (`count === 0`), the sort is a no-op.

## Failure propagation chain

```
caller MCP request
  ↓
registerTool → schema.parse(input)
  ↓ (ZodError → VALIDATION_ERROR via _shared.asValidationError)
executeProperties(input, deps)
  ↓
invokeCli(...)
  ↓ (CLI_BINARY_NOT_FOUND | CLI_NON_ZERO_EXIT — dispatch layer auto-classified per R10)
parse step (one of two)
  ↓ (CLI_REPORTED_ERROR with details.stage = "json-parse" | "total-parse" — handler-imposed)
  ↓ (ZodError on upstream array shape → VALIDATION_ERROR — pass-through; contract-divergence signal)
post-fetch sort (default mode only)
  ↓ (always succeeds — no failure path)
return PropertiesOutput
  ↓
registerTool wraps to MCP content[0].text envelope
```

**Zero new error codes** (FR-018 / Constitution Principle IV).

**No `ERR_NO_ACTIVE_FILE` propagation** — this tool has no active mode; the dispatch layer's `no active file` classifier cannot fire for the `properties` subcommand because no input combination causes upstream to emit that response.

**No `CLI_REPORTED_ERROR` for unknown vault** — upstream silently honours-as-noop the `vault=` parameter (F4 / R5). The 011-R5 inspection clause is bypassed. Documented as inherited limitation per FR-015 plan-stage resolution.

## Test seam pattern

Tests inject a stub `spawnFn` per the existing convention. Because the handler issues ONE invocation per request, the stub is simple:

```typescript
const spawnFn = vi.fn().mockResolvedValue({
  stdout: '[{"name":"author","type":"text","count":5},{"name":"tags","type":"tags","count":4}]\n',
  stderr: "",
  exitCode: 0,
});

const result = await executeProperties(
  { vault: "X" },
  { logger, queue, spawnFn, env: {} },
);

expect(spawnFn).toHaveBeenCalledTimes(1);
const argv = spawnFn.mock.calls[0][1];     // SpawnLike's argv parameter
expect(argv).toContain("properties");
expect(argv).toContain("format=json");
expect(argv).not.toContain("total");
expect(argv).toContain("vault=X");
expect(result).toEqual({
  count: 2,
  properties: [
    { name: "author", noteCount: 5 },
    { name: "tags", noteCount: 4 },
  ],
});
```

For count-only mode, the assertions invert: `argv` contains `total` and NOT `format=json`; `spawnFn` mock returns `stdout: "2\n"` (or whatever distinct-names count is being asserted).

For omitted-vault tests, `argv.find((a) => a.startsWith("vault="))` is asserted to be `undefined`.

For sort-order tests, the mocked upstream emits an UNSORTED array (e.g. `[Tags, tags, Banana, Aardvark, aardvark]`); the wrapper output's `properties` is asserted to be `[Aardvark, aardvark, Banana, Tags, tags]` exactly.

For empty-vault tests, `spawnFn` mock returns `stdout: "[]\n"` (default mode) or `stdout: "0\n"` (count-only mode); the handler returns `{ count: 0, properties: [] }` for both.

## Single-spawn invariant

The handler MUST NOT issue a second `invokeCli` call under any code path. This is asserted in the handler test suite via `expect(spawnFn).toHaveBeenCalledTimes(1)` on every test case. Future maintainers adding code paths (e.g., a vault-registry pre-check OR a sentinel-detection branch that re-probes) MUST update this invariant explicitly via spec amendment + plan re-evaluation. The R9 deferred-to-T0 sentinel-detection contingency, if needed, becomes a synchronous handler-side string check — NOT a second invocation.
