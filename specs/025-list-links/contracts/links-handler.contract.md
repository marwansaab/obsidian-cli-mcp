# Handler Contract — `links` Typed MCP Tool

**Feature**: [025-list-links](../spec.md)
**Date**: 2026-05-13
**Source of truth**: [src/tools/links/handler.ts](../../../src/tools/links/handler.ts) (created at /speckit-implement T-phase)

This document is the handler-invariant contract: the dependency shape, the single `invokeCli` call shape (× 2 modes — collapsed to one call shape branched on the base64 payload), the eval JS template render step, the multi-stage parse step, the envelope-error → `UpstreamError` mapping table, the failure propagation chain, the test seam pattern, and the single-spawn invariant.

---

## Handler signature

```typescript
// src/tools/links/handler.ts
import { type CliAdapter } from "../../cli-adapter/cli-adapter.js";
import { type Logger } from "../../logger.js";
import { UpstreamError } from "../../errors.js";
import {
  linksEvalResponseSchema,
  type LinksInput,
  type LinksOutput,
} from "./schema.js";

export type LinksHandlerDeps = {
  invokeCli: CliAdapter["invokeCli"];
  logger?: Logger;
};

export async function executeLinks(
  input: LinksInput,
  deps: LinksHandlerDeps,
): Promise<LinksOutput>;
```

`input` is already-validated by `registerTool` before `executeLinks` is called. The handler trusts its input per Constitution III. The `logger` is optional (R1 — thin handler, no `callStart` / `callEnd` events).

---

## Single `invokeCli` call shape

The handler issues EXACTLY ONE `invokeCli` invocation per request, regardless of mode. The `subcommand` is always `eval`; the `parameters.code` carries the rendered eval-JS string with the base64 payload substituted.

```typescript
const payloadJson = JSON.stringify({
  active: input.target_mode === "active",
  path:   input.target_mode === "specific" ? input.path ?? null : null,
  file:   input.target_mode === "specific" ? input.file ?? null : null,
  total:  input.total === true,
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
- Output capture with 10 MiB cap.
- 10 s timeout.
- The four-priority error classification (`CLI_BINARY_NOT_FOUND` / `CLI_NON_ZERO_EXIT` / `CLI_REPORTED_ERROR` / `ERR_NO_ACTIVE_FILE`).
- The 011-R5 unknown-vault response-inspection clause (FIRES for this feature — R5 / F7).

The handler does NOT touch the spawn primitives directly. The single-spawn invariant is enforced both by the architecture (R3) and by handler tests that assert the stub `spawnFn` was called exactly once per request.

---

## Eval JS template render

The handler renders the eval JS by ONE `String.prototype.replace` of `__PAYLOAD_B64__` with the assembled `payloadB64`. The template is a FROZEN string constant:

```typescript
const JS_TEMPLATE = `(()=>{
const a=JSON.parse(atob('__PAYLOAD_B64__'));
let f;
if(a.active){
  f=app.workspace.getActiveFile();
  if(!f)return JSON.stringify({ok:false,code:'NO_ACTIVE_FILE',detail:'No note focused; switch to specific mode or focus a note.'});
}else if(a.path){
  f=app.vault.getFiles().find(x=>x.path===a.path);
  if(!f)return JSON.stringify({ok:false,code:'FILE_NOT_FOUND',detail:'path: '+a.path});
}else{
  f=app.metadataCache.getFirstLinkpathDest(a.file,'');
  if(!f)return JSON.stringify({ok:false,code:'FILE_NOT_FOUND',detail:'wikilink: '+a.file});
}
if(f.extension!=='md')return JSON.stringify({ok:false,code:'NOT_MARKDOWN',detail:'path: '+f.path+' extension: '+f.extension});
const c=app.metadataCache.getFileCache(f)||{};
const wrap=function(e,kindOf,lineOf){
  const o={target:e.link,line:lineOf(e),_col:(e.position&&e.position.start.col)||0,kind:kindOf(e)};
  if(e.displayText!==e.link)o.displayText=e.displayText;
  return o;
};
const entries=[]
  .concat((c.frontmatterLinks||[]).map(e=>wrap(e,()=>'wikilink',()=>1)))
  .concat((c.links||[]).map(e=>wrap(e,x=>x.original.startsWith('[[')?'wikilink':'markdown',x=>x.position.start.line+1)))
  .concat((c.embeds||[]).map(e=>wrap(e,()=>'embed',x=>x.position.start.line+1)));
entries.sort((x,y)=>x.line-y.line||x._col-y._col);
const out=entries.map(({_col,...rest})=>rest);
return JSON.stringify({ok:true,count:out.length,links:a.total?[]:out});
})()`;
```

Frozen invariants (see data-model.md § Template invariants):

1. No template-literal interpolation / no string concatenation.
2. Single `__PAYLOAD_B64__` substitution point.
3. Synchronous IIFE (no async — metadataCache is sync).
4. Returns `JSON.stringify(...)` in every code path.
5. Defensive `|| []` coalescing.
6. `f.extension === 'md'` guard.
7. `_col` stripped before emission.
8. `a.total` branch at envelope-emission.
9. displayText omit-when-equal.
10. Kind synthesis per-array.

Handler tests assert the rendered `code` parameter starts with the frozen prefix `(()=>{\nconst a=JSON.parse(atob('` and ends with the frozen suffix `'))...; })()` — only the b64 region between the quotes varies per call.

---

## Multi-stage parse step

After `invokeCli` returns `{ stdout, stderr, exitCode }`:

```typescript
// Stage 0 — drop the `=> ` prefix that eval prepends to its return value
const trimmed = result.stdout.replace(/^=> /, "").trimEnd();

// Stage 1 — JSON.parse
let parsed: unknown;
try {
  parsed = JSON.parse(trimmed);
} catch (cause) {
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    message: "links eval returned non-JSON stdout",
    cause,
    details: { stage: "json-parse", stdout: trimmed.slice(0, 200) },
  });
}

// Stage 2 — envelope safeParse
const envelopeResult = linksEvalResponseSchema.safeParse(parsed);
if (!envelopeResult.success) {
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    message: "links eval envelope did not match schema",
    cause: envelopeResult.error,
    details: { stage: "envelope-parse", issues: envelopeResult.error.issues },
  });
}

// Stage 3 — discriminate on ok
const envelope = envelopeResult.data;
if (!envelope.ok) {
  // Map envelope.code to UpstreamError code per R13 table
  throw mapEnvelopeError(envelope.code, envelope.detail);
}

// Stage 4 — return the LinksOutput
return { count: envelope.count, links: envelope.links };
```

`mapEnvelopeError`:

```typescript
function mapEnvelopeError(code: LinksEvalErrorCode, detail: string): UpstreamError {
  switch (code) {
    case "NO_ACTIVE_FILE":
      // R13: locked at T0 — either ERR_NO_ACTIVE_FILE or CLI_REPORTED_ERROR per BI-015 precedent.
      // Both satisfy FR-013 and FR-017.
      return new UpstreamError({
        code: "ERR_NO_ACTIVE_FILE",
        message: detail,
        details: { stage: "envelope-error", code, detail },
      });
    case "FILE_NOT_FOUND":
    case "NOT_MARKDOWN":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        message: detail,
        details: { stage: "envelope-error", code, detail },
      });
  }
}
```

The switch is exhaustive over `LINKS_EVAL_ERROR_CODES` per `linksEvalResponseSchema`'s discriminated union. TypeScript's exhaustiveness checking locks this at compile time.

---

## Failure propagation chain (diagram)

```
input
  │
  ├─ ZodError → VALIDATION_ERROR
  │                (raised by registerTool BEFORE handler runs)
  │
  ▼
executeLinks(input, deps)
  │
  ├─ payload assemble + b64 + JS_TEMPLATE.replace
  │
  ▼
deps.invokeCli({subcommand: "eval", parameters: {code}, ...})
  │
  ├─ ENOENT / no binary → CLI_BINARY_NOT_FOUND
  │
  ├─ exit code non-zero (10 MiB cap kill, etc.) → CLI_NON_ZERO_EXIT
  │
  ├─ "Vault not found." stdout (F7 / R5 — 011-R5 inspection) → CLI_REPORTED_ERROR(code: 'VAULT_NOT_FOUND')
  │
  ├─ "Error: <msg>" stdout (catch-all for unexpected eval throws) → CLI_REPORTED_ERROR(code: 'EVAL_ERROR', detail: <msg>)
  │
  │  (the dispatch layer's Error:-prefix classifier catches eval JS runtime errors;
  │   for THIS BI, the eval JS itself catches expected error paths (NO_ACTIVE_FILE /
  │   FILE_NOT_FOUND / NOT_MARKDOWN) and emits structured ok:false envelopes —
  │   the catch-all path fires only for truly unexpected runtime errors)
  │
  ▼
result.stdout
  │
  ├─ JSON.parse failure → CLI_REPORTED_ERROR(stage: 'json-parse')
  │
  ├─ envelope schema safeParse failure → CLI_REPORTED_ERROR(stage: 'envelope-parse')
  │
  ├─ envelope.ok === false:
  │    ├─ NO_ACTIVE_FILE  → ERR_NO_ACTIVE_FILE  (or CLI_REPORTED_ERROR per T0 lock)
  │    ├─ FILE_NOT_FOUND  → CLI_REPORTED_ERROR(stage: 'envelope-error', code: 'FILE_NOT_FOUND')
  │    └─ NOT_MARKDOWN    → CLI_REPORTED_ERROR(stage: 'envelope-error', code: 'NOT_MARKDOWN')
  │
  ▼
envelope.ok === true → LinksOutput {count, links}
```

Every failure path produces an `UpstreamError` with `code`, `cause`, and `details`. NO `catch + return empty/null/default` patterns. Constitution Principle IV satisfied.

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
2. Asserts the payload's `active` / `path` / `file` / `total` fields equal the user's input bit-for-bit. Locks R6's anti-injection contract structurally.
3. Returns a configured stdout response (success envelope JSON, error envelope JSON, malformed JSON, or empty cache).
4. Tracks invocation count via `stubSpawn.callCount` — assertable as `=== 1` per request (R3 / R12).

The handler tests do NOT invoke the real `obsidian` binary. End-to-end live-CLI verification is deferred to T0 of `/speckit-implement` (per the quickstart.md scenarios).

---

## Argv invariants

| Field | Value | Source |
|---|---|---|
| `subcommand` | `"eval"` | R2 — load-bearing eval per F1 |
| `target_mode` | passed through from input | ADR-003 standard mapping |
| `vault` (specific mode) | `input.vault` | flows as `vault=<value>` data parameter |
| `vault` (active mode) | `undefined` (stripped) | cli-adapter `stripTargetLocators` defence-in-depth |
| `parameters.code` | `JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64)` | rendered eval JS |
| `parameters.file` | NEVER SET | user's `file` flows through the b64 payload only — anti-injection |
| `parameters.path` | NEVER SET | user's `path` flows through the b64 payload only — anti-injection |

`file` and `path` from user input NEVER appear as CLI argv parameters — they ONLY appear inside the base64 payload, which is parsed at JS runtime via `atob` + `JSON.parse`. The frozen JS template's `__PAYLOAD_B64__` substitution point is the ONLY place user input enters the argv stream, and that placeholder is replaced with a base64-encoded string drawn from `[A-Za-z0-9+/=]` (no characters with shell meaning). FR-023 / SC-023 verified structurally.

---

## Single-spawn invariant

Each call to `executeLinks(input, deps)` results in EXACTLY ONE call to `deps.invokeCli` (which in turn results in EXACTLY ONE `spawnFn` invocation). Both modes (`total: false` and `total: true`) follow this invariant — the count-only branching happens inside the eval JS at envelope-emission, NOT at the CLI invocation level.

Locked by handler tests via `expect(stubSpawn).toHaveBeenCalledTimes(1)` on every test case.
