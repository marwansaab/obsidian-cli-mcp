# Handler Contract — `smart_connections_similar` Typed MCP Tool

**Feature**: [026-smart-connections-similar](../spec.md)
**Date**: 2026-05-15
**Source of truth**: [src/tools/smart_connections_similar/handler.ts](../../../src/tools/smart_connections_similar/handler.ts) (created at /speckit-implement T-phase)

This document is the handler-invariant contract: the dependency shape, the single `invokeCli` call shape, the frozen JS template render step, the multi-stage parse step (with the closed-vault empty-stdout detection branch at stage 0), the envelope-error → `UpstreamError` mapping table, the failure propagation chain, the test seam pattern, and the single-spawn invariant.

---

## Handler signature

```typescript
// src/tools/smart_connections_similar/handler.ts
import { type CliAdapter } from "../../cli-adapter/cli-adapter.js";
import { type Logger } from "../../logger.js";
import { type Queue } from "../../queue.js";
import { UpstreamError } from "../../errors.js";
import {
  smartConnectionsSimilarEvalResponseSchema,
  type SmartConnectionsSimilarInput,
  type SmartConnectionsSimilarOutput,
} from "./schema.js";

export type SmartConnectionsSimilarHandlerDeps = {
  logger?: Logger;
  queue: Queue;
  invokeCli: CliAdapter["invokeCli"];
};

export async function executeSmartConnectionsSimilar(
  input: SmartConnectionsSimilarInput,
  deps: SmartConnectionsSimilarHandlerDeps,
): Promise<SmartConnectionsSimilarOutput>;
```

`input` is already-validated by `registerTool` before `executeSmartConnectionsSimilar` is called — `limit` is already coerced to the default `20` when omitted; `total` is already coerced to the default `false` when omitted. The handler trusts its input per Constitution III. The `logger` is optional (R1 — thin handler, no `callStart` / `callEnd` events). The `queue` parameter is the single-in-flight CLI queue gating all CLI invocations (project-wide invariant); `invokeCli` is dispatched through the queue.

The test seam injects `deps.invokeCli` directly (or, equivalently, a stub `spawnFn` via the queue's adapter), allowing handler tests to assert spawn invocations without spawning real subprocesses.

---

## Single `invokeCli` call shape

The handler issues EXACTLY ONE `invokeCli` invocation per request, regardless of mode (default vs count-only). The `subcommand` is always `eval`; the `parameters.code` carries the rendered eval-JS string with the base64 payload substituted.

```typescript
const payloadJson = JSON.stringify({
  active: input.target_mode === "active",
  path:   input.target_mode === "specific" ? input.path ?? null : null,
  file:   input.target_mode === "specific" ? input.file ?? null : null,
  limit:  input.limit,
  total:  input.total === true,
  vault:  input.target_mode === "specific" ? input.vault : null,
});
const payloadB64 = Buffer.from(payloadJson, "utf-8").toString("base64");
const code = JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64);

const result = await deps.invokeCli({
  target_mode: input.target_mode,
  vault:       input.target_mode === "specific" ? input.vault : undefined,
  subcommand:  "eval",
  parameters:  { code },
});
```

The cli-adapter's `invokeCli` handles:

- Argv assembly: `["vault=<vault>", "eval", "code=<code>"]` (specific mode) or `["eval", "code=<code>"]` (active mode after `stripTargetLocators` defence-in-depth strip).
- Binary resolution via `binary-resolver`.
- Subprocess spawn via `child_process.spawn` (or test-seam `spawnFn` injection).
- Output capture with 10 MiB cap (`CLI_OUTPUT_TOO_LARGE` on cap-kill).
- 10 s timeout (`CLI_TIMEOUT` on exceed).
- The four-priority error classification (`CLI_BINARY_NOT_FOUND` / `CLI_NON_ZERO_EXIT` / `CLI_REPORTED_ERROR` / `ERR_NO_ACTIVE_FILE`).
- The 011-R5 unknown-vault response-inspection clause (FIRES for unregistered vault — R5 / FR-017).

The cli-adapter does NOT detect the closed-but-registered-vault case (R5a) — that detection lives in the handler at stage 0 below, NOT in the cli-adapter (per the plan's Note on cli-adapter scope: widening the dispatch layer to detect plugin-tool-specific empty-stdout signatures would couple it to the typed-tool surface).

The handler does NOT touch the spawn primitives directly. The single-spawn invariant is enforced both by the architecture (R3) and by handler tests that assert the stub `spawnFn` was called exactly once per request.

---

## Frozen JS template render

The handler renders the eval JS by ONE `String.prototype.replace` of `__PAYLOAD_B64__` with the assembled `payloadB64`. The template is a FROZEN string constant of ~60–80 LOC. Full body is captured in [../data-model.md](../data-model.md) § "JS template body"; the structural outline (relevant for parse-step understanding) is:

```typescript
const JS_TEMPLATE = `(async()=>{
  const a=JSON.parse(atob('__PAYLOAD_B64__'));
  // === FR-017b precedence chain — outer-to-inner / cheapest-first ===
  // (cli-adapter 011-R5 inspection has already fired for unknown-vault BEFORE this code runs)
  const plugin=app.plugins.plugins["smart-connections"];
  if(!plugin)return JSON.stringify({ok:false,code:'SMART_CONNECTIONS_NOT_INSTALLED',detail:'plugin not present in this vault'});
  // file resolution
  let f;
  if(a.active){
    f=app.workspace.getActiveFile();
    if(!f)return JSON.stringify({ok:false,code:'NO_ACTIVE_FILE',detail:'No note focused'});
  }else if(a.path){
    f=app.vault.getFiles().find(x=>x.path===a.path);
    if(!f)return JSON.stringify({ok:false,code:'FILE_NOT_FOUND',detail:'path: '+a.path});
  }else{
    f=app.metadataCache.getFirstLinkpathDest(a.file,'');
    if(!f)return JSON.stringify({ok:false,code:'FILE_NOT_FOUND',detail:'wikilink: '+a.file});
  }
  if(f.extension!=='md')return JSON.stringify({ok:false,code:'NOT_MARKDOWN',detail:'path: '+f.path+' extension: '+f.extension});
  // plugin readiness
  const sources=plugin.env&&plugin.env.smart_sources;
  if(!sources||!sources.items)return JSON.stringify({ok:false,code:'SMART_CONNECTIONS_NOT_READY',detail:'similarity-API path unavailable'});
  const src=sources.items[f.path];
  if(!src||typeof src.find_connections!=='function')return JSON.stringify({ok:false,code:'SOURCE_NOT_INDEXED',detail:'no embedding for: '+f.path});
  // similarity query
  const raw=await src.find_connections({limit:a.limit});
  const sourcePath=f.path;
  const entries=(raw||[])
    .map(m=>{
      const key=(m.item&&m.item.key)||'';
      const i=key.indexOf('#');
      const path=i<0?key:key.slice(0,i);
      const headingPath=i<0?[]:key.slice(i+1).split('#');
      return {path,headingPath,score:m.score};
    })
    .filter(m=>Number.isFinite(m.score))      // FR-009a non-finite-score filter
    .filter(m=>m.path!==sourcePath)            // FR-010 source-path-keyed self-exclusion
    .sort((x,y)=>
      y.score-x.score                          // primary: score desc
      || (x.path<y.path?-1:x.path>y.path?1:0)  // secondary: path byte-asc
      || (function(){
           const xh=x.headingPath.join('#'),yh=y.headingPath.join('#');
           return xh<yh?-1:xh>yh?1:0;          // tertiary: headingPath byte-asc
         })()
    )
    .slice(0,a.limit);
  return JSON.stringify({ok:true,count:entries.length,matches:a.total?[]:entries});
})()`;
```

Frozen invariants (see data-model.md § Template invariants):

1. No template-literal interpolation / no string concatenation outside the IIFE body.
2. Single `__PAYLOAD_B64__` substitution point.
3. Async IIFE (the plugin's `find_connections` is async).
4. Returns `JSON.stringify(...)` in every code path.
5. Defensive `|| []` / `|| ''` coalescing.
6. `f.extension === 'md'` guard (FR-013 / R12).
7. `Number.isFinite(score)` filter applied BEFORE sort (FR-009a / R10).
8. Source-path-keyed self-exclusion via `.filter(m => m.path !== sourcePath)` (FR-010 / R9).
9. `a.total` branch at envelope-emission (R3 — same JS in both modes).
10. Plugin-lifecycle checks ordered per FR-017b precedence chain.

Handler tests assert the rendered `code` parameter starts with the frozen prefix `(async()=>{\n  const a=JSON.parse(atob('` and ends with the frozen suffix `'))...; })()` — only the b64 region between the quotes varies per call.

---

## Multi-stage parse step

After `invokeCli` returns `{ stdout, stderr, exitCode }`:

```typescript
// === Stage 0 — closed-vault empty-stdout detection (R5a / FR-017a / SC-011a) ===
// Signature: empty stdout + exit 0 + vault= supplied + vault name in 'obsidian vaults' output.
// Per F7 / F8: CLI emits empty stdout + exit 0 for the FIRST eval call against a closed
// registered vault AND transparently OPENS the vault as a side effect.
// The cli-adapter's 011-R5 inspection clause does NOT fire (no "Vault not found." string).
if (
  input.target_mode === "specific" &&
  result.exitCode === 0 &&
  result.stdout.trim().length === 0
) {
  // Confirm the vault IS registered (distinguishes from genuinely unknown vault, which the
  // 011-R5 clause already routed to VAULT_NOT_FOUND(unknown) before reaching here).
  const known = await isVaultRegistered(input.vault, deps);
  if (known) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      message: `Vault "${input.vault}" is registered but not currently open in Obsidian; the CLI has begun opening it — retry after a brief delay.`,
      details: {
        code: "VAULT_NOT_FOUND",
        reason: "not-open",
        stage: "handler-detection",
      },
    });
  }
  // Empty stdout + unknown vault should have been intercepted by the 011-R5 clause upstream
  // of this branch. Falling through to stage 1 (json-parse) preserves the safety net for
  // truly anomalous empty-stdout cases (which will surface as json-parse failure).
}

// === Stage 1 — strip the `=> ` prefix that eval prepends to its return value ===
const trimmed = result.stdout.replace(/^=> /, "").trimEnd();

// === Stage 2 — JSON.parse ===
let parsed: unknown;
try {
  parsed = JSON.parse(trimmed);
} catch (cause) {
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    message: "smart_connections_similar eval returned non-JSON stdout",
    cause,
    details: { stage: "json-parse", stdout: trimmed.slice(0, 200) },
  });
}

// === Stage 3 — envelope safeParse ===
const envelopeResult = smartConnectionsSimilarEvalResponseSchema.safeParse(parsed);
if (!envelopeResult.success) {
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    message: "smart_connections_similar eval envelope did not match schema",
    cause: envelopeResult.error,
    details: { stage: "envelope-parse", issues: envelopeResult.error.issues },
  });
}

// === Stage 4 — discriminate on `ok` ===
const envelope = envelopeResult.data;
if (!envelope.ok) {
  // Map envelope.code → UpstreamError per the mapping table below
  throw mapEnvelopeError(envelope.code, envelope.detail);
}

// === Stage 5 — return validated output ===
return { count: envelope.count, matches: envelope.matches };
```

The closed-vault detection at stage 0 runs BEFORE the json-parse stage so the actionable `not-open` signal is preserved instead of being conflated with a generic parse failure (per FR-017a's explicit prohibition: "MUST NOT classify the empty-stdout case as a generic JSON parse failure").

`isVaultRegistered(name, deps)` issues a separate `obsidian vaults` invocation through `deps.invokeCli` to check vault presence. (Implementation detail: a single-flight cache OR a one-call probe per request — locked at T0 of /speckit-implement; the test seam allows the stub to short-circuit this lookup deterministically.) This is the ONLY scenario in which `executeSmartConnectionsSimilar` makes more than one CLI call; the second call is the registry confirmation, not the similarity query.

`mapEnvelopeError`:

```typescript
function mapEnvelopeError(
  code: SmartConnectionsSimilarEvalErrorCode,
  detail: string,
): UpstreamError {
  switch (code) {
    case "NO_ACTIVE_FILE":
      return new UpstreamError({
        // R13: locked at T0 — either ERR_NO_ACTIVE_FILE or CLI_REPORTED_ERROR per
        // BI-015 / BI-025 precedent alignment. Both satisfy FR-018 and FR-021.
        code: "ERR_NO_ACTIVE_FILE",
        message: detail,
        details: { stage: "envelope-error", code, detail },
      });
    case "FILE_NOT_FOUND":
    case "NOT_MARKDOWN":
    case "SMART_CONNECTIONS_NOT_INSTALLED":
    case "SMART_CONNECTIONS_NOT_READY":
    case "SOURCE_NOT_INDEXED":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        message: detail,
        details: { stage: "envelope-error", code, detail },
      });
  }
}
```

The switch is exhaustive over the eval envelope's error-code discriminated union per `smartConnectionsSimilarEvalResponseSchema`. TypeScript's exhaustiveness checking locks this at compile time.

---

## Envelope-error → UpstreamError mapping table

| envelope.code | UpstreamError code | UpstreamError details |
|---|---|---|
| `NO_ACTIVE_FILE` | `ERR_NO_ACTIVE_FILE` (or `CLI_REPORTED_ERROR` per T0 alignment with BI-015 / BI-025) | `{ stage: "envelope-error", code: "NO_ACTIVE_FILE", detail }` |
| `FILE_NOT_FOUND` | `CLI_REPORTED_ERROR` | `{ stage: "envelope-error", code: "FILE_NOT_FOUND", detail }` |
| `NOT_MARKDOWN` | `CLI_REPORTED_ERROR` | `{ stage: "envelope-error", code: "NOT_MARKDOWN", detail }` |
| `SMART_CONNECTIONS_NOT_INSTALLED` | `CLI_REPORTED_ERROR` | `{ stage: "envelope-error", code: "SMART_CONNECTIONS_NOT_INSTALLED", detail }` |
| `SMART_CONNECTIONS_NOT_READY` | `CLI_REPORTED_ERROR` | `{ stage: "envelope-error", code: "SMART_CONNECTIONS_NOT_READY", detail }` |
| `SOURCE_NOT_INDEXED` | `CLI_REPORTED_ERROR` | `{ stage: "envelope-error", code: "SOURCE_NOT_INDEXED", detail }` |

The `VAULT_NOT_FOUND(reason: "not-open")` sub-case is NOT in this table because it does NOT travel via the envelope — it is detected by the handler at stage 0 from the dispatch-layer's empty-stdout response. The `VAULT_NOT_FOUND(reason: "unknown")` sub-case is also NOT in this table because it is intercepted upstream of the handler by the cli-adapter's 011-R5 inspection clause (the `Vault not found.` text response is matched in the dispatch layer, never reaches `executeSmartConnectionsSimilar`).

---

## Failure propagation chain (diagram)

```
input
  │
  ├─ ZodError → VALIDATION_ERROR
  │              (raised by registerTool BEFORE handler runs;
  │               covers missing target_mode / missing vault in specific /
  │               XOR violation / active-forbid violation / limit out-of-range /
  │               limit non-integer / total non-boolean / unknown top-level key)
  │
  ▼
executeSmartConnectionsSimilar(input, deps)
  │
  ├─ payload assemble + b64 + JS_TEMPLATE.replace
  │
  ▼
deps.invokeCli({subcommand: "eval", parameters: {code}, ...})
  │
  ├─ ENOENT / no binary → CLI_BINARY_NOT_FOUND
  │                       (inherited from binary-resolver; bubbles unchanged)
  │
  ├─ timeout exceeded → CLI_TIMEOUT
  │                     (inherited from cli-adapter dispatch layer; 10 s default)
  │
  ├─ output cap kill → CLI_OUTPUT_TOO_LARGE
  │                    (inherited from cli-adapter dispatch layer; 10 MiB default)
  │
  ├─ generic non-zero exit → CLI_NON_ZERO_EXIT
  │                          (catch-all; bubbles unchanged)
  │
  ├─ "Vault not found." stdout (FR-017 / R5)
  │   → cli-adapter 011-R5 inspection clause fires
  │   → CLI_REPORTED_ERROR(details.code: 'VAULT_NOT_FOUND',
  │                        details.reason: absent or "unknown")
  │
  ├─ "Error: <msg>" stdout (catch-all for unexpected eval throws)
  │   → cli-adapter Error:-prefix classifier
  │   → CLI_REPORTED_ERROR(code: 'EVAL_ERROR', detail: <msg>)
  │   (rare — the JS template catches all expected error paths and emits
  │    structured envelopes; only truly unexpected runtime errors land here)
  │
  ▼
result.stdout
  │
  ├─ === Stage 0: closed-vault detection (R5a / FR-017a) ===
  │   IF specific mode AND exit 0 AND stdout empty AND vault registered
  │   → CLI_REPORTED_ERROR(details.code: 'VAULT_NOT_FOUND',
  │                        details.reason: 'not-open',
  │                        details.stage: 'handler-detection')
  │
  ├─ === Stage 1: strip `=> ` prefix === (no failure mode)
  │
  ├─ === Stage 2: JSON.parse ===
  │   ON failure → CLI_REPORTED_ERROR(details.stage: 'json-parse')
  │
  ├─ === Stage 3: envelope safeParse ===
  │   ON failure → CLI_REPORTED_ERROR(details.stage: 'envelope-parse')
  │
  ├─ === Stage 4: discriminate on envelope.ok ===
  │   IF envelope.ok === false, map per FR-017b precedence chain:
  │     ├─ SMART_CONNECTIONS_NOT_INSTALLED → CLI_REPORTED_ERROR(envelope-error)
  │     ├─ NO_ACTIVE_FILE  → ERR_NO_ACTIVE_FILE  (or CLI_REPORTED_ERROR per T0 lock)
  │     ├─ FILE_NOT_FOUND  → CLI_REPORTED_ERROR(envelope-error)
  │     ├─ NOT_MARKDOWN    → CLI_REPORTED_ERROR(envelope-error)
  │     ├─ SMART_CONNECTIONS_NOT_READY → CLI_REPORTED_ERROR(envelope-error)
  │     └─ SOURCE_NOT_INDEXED → CLI_REPORTED_ERROR(envelope-error)
  │
  ▼
envelope.ok === true → SmartConnectionsSimilarOutput {count, matches}
```

Every failure path produces an `UpstreamError` with `code`, `cause`, and `details`. NO `catch + return empty/null/default` patterns. Constitution Principle IV satisfied.

The FR-017b precedence chain is enforced INSIDE THE EVAL JS at template-source-order — the JS evaluates checks in order (plugin installed → active-file-resolve OR file-resolve → file extension → plugin-readiness → source-indexed) and returns the FIRST failing envelope. The handler's stage 4 mapping table preserves the order on the way out. Compound-failure fixtures (six per spec SC-011b) verify each adjacent pair.

---

## Test seam pattern

`deps.invokeCli` is injected — the same convention as every prior typed tool. Handler tests use the `createStubCliAdapter` helper from `src/cli-adapter/cli-adapter.test-helpers.ts` (or equivalent) to provide a stub `spawnFn` that:

1. Decodes the base64 payload from the `code` parameter:
   ```typescript
   const codeArg = stubSpawn.lastCall.args.find(a => a.startsWith("code="))!.slice("code=".length);
   const payloadB64Match = /atob\('([^']+)'\)/.exec(codeArg);
   const payloadJson = Buffer.from(payloadB64Match[1], "base64").toString("utf-8");
   const payload = JSON.parse(payloadJson);
   ```
2. Asserts the payload's `active` / `path` / `file` / `limit` / `total` / `vault` fields equal the user's input bit-for-bit. Locks FR-028 / SC-025 anti-injection contract structurally.
3. Returns a configured stdout response:
   - Success envelope JSON (`{ok: true, count, matches}`),
   - Error envelope JSON (`{ok: false, code, detail}`),
   - Malformed JSON (locks stage-2 failure path),
   - Schema-shaped-but-key-unknown JSON (locks stage-3 failure path),
   - **Empty stdout + exit 0 + registered vault** (locks stage-0 closed-vault detection path),
   - **Empty stdout + exit 0 + unregistered vault** (verifies stage-0 falls through to stage 2 → json-parse failure as expected for the truly-anomalous case).
4. Tracks invocation count via `stubSpawn.callCount` — assertable as `=== 1` per request (R3 / single-spawn invariant) for every code path EXCEPT the stage-0 closed-vault detection branch, which issues a second `obsidian vaults` call to confirm vault registration (`=== 2` for the not-open path).

The handler tests do NOT invoke the real `obsidian` binary. End-to-end live-CLI verification is deferred to T0 of `/speckit-implement` (per the quickstart.md scenarios) — particularly the closed-vault scenario which requires user-side state change (closing a vault window) that is intrusive at handler-test time.

The base64 round-trip assertion appears in EVERY payload-affecting handler test (per the 57-test inventory § R6 / FR-028 lock). Sample assertion:

```typescript
it("encodes the path field via base64 payload, never as raw argv text", async () => {
  await executeSmartConnectionsSimilar(
    { target_mode: "specific", vault: "Demo", path: "Topics/ML.md", limit: 20 },
    { invokeCli: stubInvokeCli, queue: stubQueue }
  );
  expect(stubInvokeCli).toHaveBeenCalledTimes(1);
  const args = stubInvokeCli.mock.calls[0][0];
  expect(args.parameters.code).not.toContain("Topics/ML.md");  // raw path NEVER in source
  expect(args.parameters.code).toMatch(/atob\('[A-Za-z0-9+/=]+'\)/);
  // round-trip:
  const b64 = /atob\('([^']+)'\)/.exec(args.parameters.code)![1];
  const decoded = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
  expect(decoded.path).toBe("Topics/ML.md");
  expect(decoded.limit).toBe(20);
});
```

---

## Argv invariants

| Field | Value | Source |
|---|---|---|
| `subcommand` | `"eval"` | R2 — no native similarity subcommand exists |
| `target_mode` | passed through from input | ADR-003 standard mapping |
| `vault` (specific mode) | `input.vault` | flows as `vault=<value>` data parameter (cli-adapter argv) |
| `vault` (active mode) | `undefined` (stripped) | cli-adapter `stripTargetLocators` defence-in-depth |
| `parameters.code` | `JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64)` | rendered eval JS |
| `parameters.file` | NEVER SET | user's `file` flows through the b64 payload only — anti-injection |
| `parameters.path` | NEVER SET | user's `path` flows through the b64 payload only — anti-injection |
| `parameters.limit` | NEVER SET | user's `limit` flows through the b64 payload only |

`file`, `path`, `limit`, and `total` from user input NEVER appear as CLI argv parameters — they ONLY appear inside the base64 payload, which is parsed at JS runtime via `atob` + `JSON.parse`. The frozen JS template's `__PAYLOAD_B64__` substitution point is the ONLY place user input enters the argv stream, and that placeholder is replaced with a base64-encoded string drawn from `[A-Za-z0-9+/=]` (no characters with shell meaning). FR-028 / SC-025 verified structurally.

The `vault` field DOES appear in the CLI argv stream as the `vault=<value>` data parameter (per cli-adapter convention) AND is duplicated inside the base64 payload (used by the JS template for the registered-but-closed-vault stage-0 detection's vault-name assertion). Both surfaces handle `vault` strings as opaque data — the argv-stream value is URL/shell-quoted by the cli-adapter; the payload value is base64-encoded.

---

## Single-spawn invariant

Each successful call to `executeSmartConnectionsSimilar(input, deps)` results in EXACTLY ONE call to `deps.invokeCli` (which in turn results in EXACTLY ONE `spawnFn` invocation). Both modes (`total: false` and `total: true`) follow this invariant — the count-only branching happens inside the eval JS at envelope-emission, NOT at the CLI invocation level (R3).

**Exception**: the stage-0 closed-vault detection branch issues a SECOND `invokeCli` (`obsidian vaults`) to confirm vault registration before classifying as `not-open`. This second call fires ONLY for the empty-stdout + exit 0 + `vault=` supplied + specific-mode signature — a narrow exceptional path. The handler test fixtures distinguish the single-spawn happy path (`expect(spawn).toHaveBeenCalledTimes(1)`) from the closed-vault detection path (`expect(spawn).toHaveBeenCalledTimes(2)`).

Locked by handler tests via `expect(stubSpawn).toHaveBeenCalledTimes(1)` on every non-closed-vault test case AND `expect(stubSpawn).toHaveBeenCalledTimes(2)` on the dedicated closed-vault detection fixture.
