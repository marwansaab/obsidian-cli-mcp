# Contract — `find_by_property` Handler

**Feature**: [014-find-by-property](../spec.md)
**Phase**: 1 (Design & Contracts)
**Layer**: internal — invariants between the `findByPropertyInputSchema` parse and the `invokeCli` call boundary, plus the eval response parse.

This document is the locked contract for the handler module at [src/tools/find_by_property/handler.ts](../../src/tools/find_by_property/handler.ts) (to be created). It captures: the dependency surface, the single `invokeCli` invocation shape, the JS template assembly, the response-parse logic, the failure propagation chain, and the test seam pattern.

---

## 1. Dependency surface

```ts
export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;       // injected for tests
  env?: NodeJS.ProcessEnv;   // injected for tests
}

export async function executeFindByProperty(
  input: FindByPropertyInput,
  deps: ExecuteDeps,
): Promise<FindByPropertyOutput> { /* ... */ }
```

The signature mirrors the existing typed-tool handlers (`executeReadProperty`, `executeDeleteNote`, `executeWriteNote`, `executeReadNote`). Tests inject `spawnFn` to control the underlying CLI invocation; production passes `spawnFn: undefined` and the dispatch layer uses `child_process.spawn`.

---

## 2. Single CLI call shape

The handler issues exactly ONE `invokeCli` invocation per request:

```ts
const target_mode = input.vault === undefined ? "active" : "specific";
await invokeCli(
  {
    command: "eval",
    vault: input.vault,
    parameters: { code: <rendered JS template> },
    flags: [],
    target_mode,
  },
  { spawnFn, env, logger, queue },
);
```

Argv assembly (specific mode, vault supplied):

```
[binary] vault=<v> eval code=<rendered-js>
```

Argv assembly (active mode, vault omitted):

```
[binary] eval code=<rendered-js>
```

Notes:

- The `target_mode` axis on `InvokeCliInput` is internal to the cli-adapter (it controls argv prefix + locator-strip). User-facing schema has NO `target_mode` field. The handler maps `vault === undefined ⇒ "active"`, `vault !== undefined ⇒ "specific"` per [research.md R4](../research.md#r4--adapter-target_mode-mapping-no-user-facing-target_mode).
- `flags: []` — no `active` flag is forwarded. The user-facing tool has no active-file concept.
- `parameters: { code: <js> }` — one parameter, the rendered JS template.

---

## 3. JS template assembly

The handler holds a frozen template constant:

```ts
const JS_TEMPLATE = `(()=>{
const a=JSON.parse(atob('__PAYLOAD_B64__'));
const m=[];
const eq=(x,y)=>(typeof x==='string'&&typeof y==='string'&&!a.caseSensitive)?x.toLowerCase()===y.toLowerCase():x===y;
const arrEq=(x,y)=>Array.isArray(x)&&Array.isArray(y)&&x.length===y.length&&x.every((e,i)=>eq(e,y[i]));
const prefix=a.folder?a.folder.replace(/[/\\\\]+$/,'')+'/':'';
const fc=app.metadataCache.fileCache;
const mc=app.metadataCache.metadataCache;
for(const p in fc){
  if(prefix&&!p.startsWith(prefix))continue;
  const fm=mc[fc[p].hash]&&mc[fc[p].hash].frontmatter;
  if(!fm||!(a.property in fm))continue;
  const v=fm[a.property];
  let hit=false;
  if(Array.isArray(v)){
    if(a.arrayMatch){hit=!Array.isArray(a.value)&&v.some(e=>eq(e,a.value));}
    else{hit=Array.isArray(a.value)&&arrEq(v,a.value);}
  } else {
    hit=!Array.isArray(a.value)&&eq(v,a.value);
  }
  if(hit)m.push(p);
}
return JSON.stringify({count:m.length,paths:m});
})()`;
```

The single placeholder `__PAYLOAD_B64__` is replaced at request time with the base64-encoded JSON payload:

```ts
const payloadJson = JSON.stringify({
  property: input.property,
  value: input.value,
  folder: input.folder ?? "",
  arrayMatch: input.arrayMatch,
  caseSensitive: input.caseSensitive,
});
const payloadB64 = Buffer.from(payloadJson, "utf-8").toString("base64");
const code = JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64);
```

**Anti-injection invariants**:
- The JS template is a frozen string constant — never built at runtime from user input.
- The base64 payload contains only `[A-Za-z0-9+/=]` — structurally safe inside any JS string literal.
- The `JSON.stringify` step produces a string that contains no characters in the base64 alphabet's exclusions; the subsequent `.toString("base64")` step renders any user-supplied character (`'`, `"`, `\`, control chars) as base64, which the JS template's `atob` decodes back to a string that `JSON.parse` rebuilds into the typed payload.
- No matter what the user supplies for `property`, `value`, `folder`, the rendered `code=<...>` argv parameter contains exactly the frozen JS template + a base64 string. There is no path for user input to escape into the JS source.

---

## 4. Eval response parsing

The CLI prefixes successful eval responses with `=> ` (literal `=`, `>`, space). The handler:

```ts
const result = await invokeCli(/* ... */);
let stdout = result.stdout.trimStart();
if (stdout.startsWith("=> ")) {
  stdout = stdout.slice(3);
}
let parsed: unknown;
try {
  parsed = JSON.parse(stdout);
} catch (err) {
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: err,
    details: { stdout: result.stdout, stage: "json-parse" },
    message: `find_by_property: eval response is not JSON: ${result.stdout.slice(0, 200)}`,
  });
}
const validated = findByPropertyOutputSchema.safeParse(parsed);
if (!validated.success) {
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: validated.error,
    details: { stdout: result.stdout, stage: "schema-parse" },
    message: `find_by_property: eval response shape unexpected`,
  });
}
return validated.data;
```

The two-stage parse (`JSON.parse` then schema validation) is the structural backstop against an Obsidian internal-API change that breaks the JS template's response shape — neither stage silently coerces.

**Defensive sanity check** (per [data-model.md §6](../data-model.md)): although the schema enforces `count: z.number().int().nonneg()` and `paths: z.array(z.string())`, the handler additionally asserts `validated.data.count === validated.data.paths.length` before returning. Mismatch surfaces as `CLI_REPORTED_ERROR` (would indicate a JS template bug — the bug report should be visible, not silent).

---

## 5. Failure propagation chain

| Stage | Failure | Code | Notes |
|---|---|---|---|
| `findByPropertyInputSchema.parse` | invalid input | `VALIDATION_ERROR` | `registerTool` factory wraps `ZodError → VALIDATION_ERROR` automatically; handler does not run |
| `invokeCli` | spawn fails | `CLI_BINARY_NOT_FOUND` | dispatch layer |
| `invokeCli` | exit non-zero | `CLI_NON_ZERO_EXIT` | dispatch layer |
| `invokeCli` | output cap kill (10 MiB) | `CLI_NON_ZERO_EXIT` | dispatch layer; surfaces as `dispatchKill` |
| `invokeCli` | timeout (10 s) | `CLI_NON_ZERO_EXIT` | dispatch layer; surfaces as `dispatchTimeout` |
| `invokeCli` | stdout `Vault not found.` exit 0 | `CLI_REPORTED_ERROR` | cli-adapter's 011-R5 inspection clause (R5 inheritance) |
| Handler | `JSON.parse` fails | `CLI_REPORTED_ERROR` | parse stage = `"json-parse"` |
| Handler | output schema rejects | `CLI_REPORTED_ERROR` | parse stage = `"schema-parse"` |
| Handler | `count !== paths.length` (defensive) | `CLI_REPORTED_ERROR` | parse stage = `"count-paths-mismatch"` |

Zero new error codes per FR-019 / SC-014. `ERR_NO_ACTIVE_FILE` is N/A for this tool (no active-file concept).

---

## 6. Test seam pattern

```ts
import { spawnRecorder } from "<test helpers>"; // existing project helper
const { spawnFn, calls } = spawnRecorder([
  { stdout: '=> {"count":1,"paths":["a/b.md"]}\n', stderr: "", exitCode: 0 },
]);

const result = await executeFindByProperty(
  { vault: "Demo", property: "id", value: "BI-030" },
  { spawnFn, env: process.env, logger: stubLogger, queue: stubQueue },
);

expect(calls.length).toBe(1);                                    // single-call architecture
expect(calls[0].args).toEqual([
  expect.stringContaining("vault=Demo"),
  "eval",
  expect.stringMatching(/^code=\(\(\)=>\{const a=JSON\.parse\(atob\('[A-Za-z0-9+/=]+'\)\);/),
]);
// Decode the base64 payload from the argv and assert it
const codeArg = calls[0].args.find((a: string) => a.startsWith("code="))!;
const b64Match = /atob\('([A-Za-z0-9+/=]+)'\)/.exec(codeArg)!;
const decodedPayload = JSON.parse(Buffer.from(b64Match[1], "base64").toString("utf-8"));
expect(decodedPayload).toEqual({
  property: "id",
  value: "BI-030",
  folder: "",
  arrayMatch: true,
  caseSensitive: true,
});
```

Each handler test:
1. Mocks ONE spawn invocation per request (single-call per R3).
2. Asserts the parsed result.
3. Asserts the argv prefix shape (binary + optional `vault=`+`eval`+`code=...`).
4. Asserts the base64 payload decodes to the expected `{property, value, folder, arrayMatch, caseSensitive}` object.

The argv-payload assertion locks (a) the anti-injection guarantee (R6 — base64 is the only user-input-derived part of the JS argv), (b) the input forwarding rules (`folder` defaulted to `""`, `arrayMatch`/`caseSensitive` defaulted to `true`).

---

## 7. Cross-references

- [data-model.md](../data-model.md) — input/output schema diagrams, JS template body, per-tool invariants, module LOC budget
- [research.md](../research.md) — R4 (target_mode mapping), R5 (unknown-vault inspection inheritance), R6 (anti-injection), R7 (in-eval matching), R12 (test seams)
- [contracts/find-by-property-input.contract.md](./find-by-property-input.contract.md) — public input contract
