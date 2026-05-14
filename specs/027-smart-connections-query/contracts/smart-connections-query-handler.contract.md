# Handler Contract — `smart_connections_query`

Handler invariants for `executeSmartConnectionsQuery`. The handler is the typed-tool implementation that the registration factory wraps via `registerTool`.

---

## Deps Shape

```typescript
export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}
```

`logger` and `queue` are required (Constitution dependency-injection precedent). `spawnFn` and `env` are optional test-seam overrides — production omits both.

## Handler Signature

```typescript
export async function executeSmartConnectionsQuery(
  input: SmartConnectionsQueryInput,
  deps: ExecuteDeps,
): Promise<SmartConnectionsQueryOutput>
```

The `input` parameter is **already validated** by `registerTool`'s zod parse pass. Handler trusts the type per Constitution III.

---

## Invariants

### I-1: Base64 payload assembly

```typescript
const payloadJson = JSON.stringify({
  query: input.query,
  limit: input.limit,
  total: input.total === true,
});
const payloadB64 = Buffer.from(payloadJson, "utf-8").toString("base64");
const code = JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64);
```

- The payload contains EXACTLY three fields: `query`, `limit`, `total`.
- `total` is normalised to a strict boolean (the schema's `.optional()` allows undefined; the handler flattens to `false`).
- `vault` is NOT in the payload — it goes through `invokeCli`'s top-level `vault` field per the cli-adapter contract.
- `JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64)` is the ONE AND ONLY substitution. The template MUST contain exactly one occurrence of the slot.

### I-2: Single `invokeCli` call (plus optional second `vaults` call from shared detector)

```typescript
const result = await invokeCli(
  {
    command: "eval",
    vault: input.vault,
    parameters: { code },
    flags: [],
    target_mode: input.vault ? "specific" : "active", // see I-2a
  },
  { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
);
```

**I-2a — `target_mode` mapping**: the cli-adapter's `invokeCli` API requires a `target_mode` field for its locator-strip safety net. BI-027 has no `target_mode` on its public surface, so the handler synthesises one: `"specific"` when `vault` is supplied (vault gets passed through), `"active"` when `vault` is omitted (cli-adapter strips any leaked locators). This is a defence-in-depth measure — BI-027's payload has no locator fields, so the strip is a no-op.

**I-2b — Closed-vault stage-0 branch**: when `input.vault` is supplied AND `result.stdout.trim().length === 0`, the handler invokes the shared `_eval-vault-closed-detection` detector, which fires a SECOND `invokeCli` to the `vaults` subcommand with `flags: ["verbose"]`, parses the stdout via the BOM-aware registry-parser, and returns `true` if `input.vault` is in the registry. If true, the handler throws `UpstreamError(CLI_REPORTED_ERROR, details.code = "VAULT_NOT_FOUND", details.reason = "not-open")`.

```typescript
if (input.vault && result.stdout.trim().length === 0) {
  const isRegistered = await detectIfClosed({
    vaultName: input.vault,
    deps,
  });
  if (isRegistered) {
    throw new UpstreamError({ /* not-open */ });
  }
  // else fall through to stage 1 — empty stdout will surface as json-parse failure
}
```

The detector is the cross-cutting shared module extracted in this BI. BI-026's handler is refactored to consume the same detector in this BI.

### I-3: Stage-1 JSON extraction with LAST `=> ` strategy

```typescript
// Stage 1 — extract JSON from the LAST `=> ` occurrence
// (plugin-side console output captures BEFORE the eval-return marker on lookup-based calls)
let payload: string;
const marker = "\n=> ";
const idx = result.stdout.lastIndexOf(marker);
if (idx >= 0) {
  payload = result.stdout.slice(idx + marker.length);
} else if (result.stdout.startsWith("=> ")) {
  payload = result.stdout.slice(3);
} else {
  payload = result.stdout;
}
```

This differs from BI-026's stage-1 (which uses `trimStart` + `startsWith('=> ') ? slice(3) : passthrough`). BI-027 needs the LAST-marker strategy because `lookup` triggers plugin-side `console.log` calls (`"Found and returned N smart_blocks."`) AND warning lines (`[warn] hypotheticals is required`) that capture to stdout BEFORE the `=> ` line.

### I-4: Stage-2 JSON parse + Stage-3 envelope safeParse

```typescript
// Stage 2 — JSON.parse
let parsedJson: unknown;
try {
  parsedJson = JSON.parse(payload);
} catch (err) {
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: err,
    details: { stage: "json-parse", stdout: result.stdout.slice(0, 500) },
    message: `smart_connections_query: eval response is not JSON: ${result.stdout.slice(0, 200)}`,
  });
}

// Stage 3 — envelope safeParse
const validated = smartConnectionsQueryEvalResponseSchema.safeParse(parsedJson);
if (!validated.success) {
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: validated.error,
    details: { stage: "envelope-parse", stdout: result.stdout.slice(0, 500) },
    message: "smart_connections_query: eval response shape unexpected",
  });
}
```

Stage 2 + 3 protect against (a) the eval JS throwing an unexpected runtime error caught by Obsidian and emitted to stdout as a non-JSON message; (b) the eval JS returning a shape the wrapper does not recognise (defensive against future plugin-version drift).

### I-5: Stage-4 discriminate on `ok` + map error codes

```typescript
if (validated.data.ok === true) {
  return { count: validated.data.count, matches: validated.data.matches };
}

throw mapEnvelopeError(validated.data.code, validated.data.detail);
```

### I-6: Envelope → UpstreamError mapping table

| Envelope `code` | Maps to `UpstreamError({...})` |
|---|---|
| `SMART_CONNECTIONS_NOT_INSTALLED` | `{ code: "CLI_REPORTED_ERROR", details: { code: "SMART_CONNECTIONS_NOT_INSTALLED", stage: "envelope-error", detail }, message: ... }` |
| `SMART_CONNECTIONS_NOT_READY_API_MISSING` | `{ code: "CLI_REPORTED_ERROR", details: { code: "SMART_CONNECTIONS_NOT_READY", reason: "api-missing", stage: "envelope-error", detail }, message: ... }` |
| `SMART_CONNECTIONS_NOT_READY_EMBED_FAILED` | `{ code: "CLI_REPORTED_ERROR", details: { code: "SMART_CONNECTIONS_NOT_READY", reason: "embed-failed", stage: "envelope-error", detail }, message: ... }` |

The envelope's flat 3-code roster (vs BI-026's 6-code) is intentional — BI-027 has fewer in-eval lifecycle stages because the call site is simpler (no source-file resolution, no source-key lookup, no extension check). The two NOT_READY sub-discriminators ride on separate envelope codes for parse-time discrimination; the handler unflattens them into `(details.code, details.reason)` for ADR-015 compliance.

### I-7: Single-spawn invariant

For a request that does NOT trigger the closed-vault stage-0 branch (the common case), the handler MUST issue EXACTLY ONE spawn invocation. For a request that triggers the stage-0 branch, EXACTLY TWO spawn invocations (the original eval call + the `vaults verbose` call from inside the shared detector).

The handler tests assert spawn counts via a queue spy:
```typescript
expect(spawnFn).toHaveBeenCalledTimes(1); // happy path
expect(spawnFn).toHaveBeenCalledTimes(2); // closed-vault path
```

### I-8: Base64 round-trip assertion

Handler tests with input variation (different `query`, `limit`, `total`) assert the spawned `code` argv decodes byte-equally to the input:

```typescript
const spawnCall = spawnFn.mock.calls[0];
const codeArg = spawnCall[1].find(a => a.startsWith("code="));
const b64Match = codeArg.match(/__PAYLOAD_B64__'[\s)S]*atob\('([^']+)'\)/) ?? codeArg.match(/atob\('([A-Za-z0-9+/=]+)'\)/);
const payload = JSON.parse(Buffer.from(b64Match[1], "base64").toString("utf-8"));
expect(payload).toEqual({ query: input.query, limit: input.limit, total: input.total === true });
```

(The exact regex depends on the rendered template; the assertion principle is: there is ONE base64 string in the argv, and it decodes to the expected payload.)

### I-9: Anti-injection structural lock

The handler MUST contain exactly ONE `JS_TEMPLATE.replace("__PAYLOAD_B64__", ...)` call. The template constant MUST contain exactly ONE `__PAYLOAD_B64__` token. Any user input that reaches the `code=...` argv via a path other than the base64 payload is a structural violation.

A static test asserts:
```typescript
expect(JS_TEMPLATE.match(/__PAYLOAD_B64__/g)?.length).toBe(1);
```

---

## Failure Propagation Chain

```
Input → registerTool zod parse (Stage 0a — VALIDATION_ERROR if invalid)
  → executeSmartConnectionsQuery
    → base64 payload assembly
    → invokeCli with command="eval" (Stage 0b — CLI_BINARY_NOT_FOUND / CLI_NON_ZERO_EXIT / CLI_OUTPUT_TOO_LARGE / CLI_TIMEOUT / CLI_REPORTED_ERROR via 011-R5)
    → Stage 0c — closed-vault detection (CLI_REPORTED_ERROR with VAULT_NOT_FOUND + reason=not-open) IF empty-stdout signature
    → Stage 1 — LAST-`=> ` extraction
    → Stage 2 — JSON.parse (CLI_REPORTED_ERROR + stage=json-parse on failure)
    → Stage 3 — envelope safeParse (CLI_REPORTED_ERROR + stage=envelope-parse on failure)
    → Stage 4 — discriminate ok
      → ok=true → return SmartConnectionsQueryOutput
      → ok=false → mapEnvelopeError → throw UpstreamError per the I-6 mapping table
```

The full precedence (cheapest-first, outer-to-inner) is locked by FR-017:

```
VALIDATION_ERROR
  ↓
CLI_BINARY_NOT_FOUND
  ↓
VAULT_NOT_FOUND (reason: unknown — 011-R5 inspection)
  ↓
VAULT_NOT_FOUND (reason: not-open — shared detector)
  ↓
SMART_CONNECTIONS_NOT_INSTALLED (envelope)
  ↓
SMART_CONNECTIONS_NOT_READY (reason: api-missing — envelope)
  ↓
SMART_CONNECTIONS_NOT_READY (reason: embed-failed — envelope)
  ↓
success
```

CLI_TIMEOUT / CLI_NON_ZERO_EXIT / CLI_OUTPUT_TOO_LARGE / json-parse / envelope-parse are dispatch-layer or handler-internal failures that fire at the appropriate stage if the upstream layer encounters them — they are NOT in the agent-facing precedence chain because they are not expected on the happy path.

---

## Test Seam Pattern

Handler tests inject `deps.spawnFn` using the cli-adapter's existing test-seam convention. Each test provides a queue of responses keyed by call index:

```typescript
const responses = [
  { stdout: 'Found and returned 5 smart_blocks.\n=> {"ok":true,"count":3,"matches":[...]}', stderr: "", exit: 0 },
];
const spawnFn = createQueuedSpawnFn(responses);
const result = await executeSmartConnectionsQuery(input, { logger: noopLogger, queue: testQueue, spawnFn });
expect(result.count).toBe(3);
expect(spawnFn).toHaveBeenCalledTimes(1);
```

For closed-vault tests, two responses are queued:
```typescript
const responses = [
  { stdout: "", stderr: "", exit: 0 }, // first call: empty stdout (closed-vault signature)
  { stdout: "Other\tC:\\path\\Other\nDemo\tC:\\path\\Demo", stderr: "", exit: 0 }, // second call: vaults verbose
];
```

---

## Handler-Side Test Cases (26 total — per data-model.md inventory)

Grouped by behaviour category. See data-model.md for the full enumeration.

- **Happy paths** (4): default mode multi-block; default mode source-level match (empty headingPath); count-only mode; frontmatter-block sentinel preserved.
- **Cross-mode invariance** (1): paired-fixture assertion of cross-mode `count` equality.
- **Sort** (3): score-desc; score-tie path-tiebreak; score-tie path-tie headingPath-tiebreak.
- **Filter** (1): non-finite-score drops (NaN / Infinity / null / undefined / missing).
- **Limit** (1): limit cap honoured at boundary (1, 100).
- **Anti-injection** (2): shell-metacharacters round-trip; Unicode round-trip.
- **Plugin lifecycle** (3): SMART_CONNECTIONS_NOT_INSTALLED; api-missing; embed-failed.
- **Vault errors** (2): unknown via 011-R5; closed-but-registered via shared detector.
- **Parse failures** (2): json-parse; envelope-parse.
- **Adapter inheritance** (1): output-cap kill.
- **Precedence chain** (4): four compound-failure fixtures verifying earlier-priority discriminator fires.
- **Single-spawn invariant** (1): spawn count assertion across happy + closed-vault path.
- **Empty-result success** (1): zero matches after filter.

---

## Behaviour-Preservation Tests for BI-026 Ripples (3 cases — per data-model.md inventory)

Located in `src/tools/smart_connections_similar/handler.test.ts` (existing file, +3 new cases):

1. `details.reason: "api-missing"` emission on `env.smart_sources` absent — new behaviour from the ripple.
2. `details.reason: "api-missing"` emission on `env.smart_sources.items[key]` having no `find_connections` method — new behaviour from the ripple.
3. Behaviour-preservation regression: the refactored stage-0 closed-vault detection produces byte-equal error responses to the pre-refactor inline implementation (compares against captured fixture strings from the pre-refactor commit).

The `_register-baseline.json` fingerprint for `smart_connections_similar` MUST remain unchanged across the refactor (the baseline locks the inputSchema + description text, NOT runtime behaviour — both are byte-stable across the ripple).

---

## Single-File Layout

```
src/tools/smart_connections_query/
├── schema.ts        (~50 LOC)
├── schema.test.ts   (~280 LOC, 16 cases)
├── _template.ts     (~35 LOC)
├── handler.ts       (~85 LOC)
├── handler.test.ts  (~550 LOC, 26 cases)
├── index.ts         (~25 LOC)
└── index.test.ts    (~120 LOC, 5 cases)
```

All files carry the `// Original — no upstream.` header per Constitution V.
