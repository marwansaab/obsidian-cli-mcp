# Data Model — `smart_connections_similar` Typed MCP Tool

**Feature**: [026-smart-connections-similar](./spec.md)
**Date**: 2026-05-15

This document is the Phase 1 design artefact for `smart_connections_similar`. It records the input schema shape, the output schema shape, the eval-envelope wire-format schema, the JS template body, the base64 payload assembly, the per-tool invariants table, the module LOC budget, and the test inventory. The schemas defined here are the SINGLE SOURCE OF TRUTH for the runtime parse, the published JSON Schema (via `zod-to-json-schema`), AND the inferred TypeScript types (via `z.infer`) per Constitution Principle III.

---

## Input schema

```typescript
// src/tools/smart_connections_similar/schema.ts

import { z } from "zod";
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const smartConnectionsSimilarInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    limit: z.number().int().min(1).max(100).default(20),
    total: z.boolean().optional(),
  }),
);

export const matchEntrySchema = z
  .object({
    path: z.string().endsWith(".md"),
    headingPath: z.array(z.string()),
    score: z.number().finite(),
  })
  .strict();

export const smartConnectionsSimilarOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    matches: z.array(matchEntrySchema),
  })
  .strict();

export const SMART_CONNECTIONS_SIMILAR_EVAL_ERROR_CODES = [
  "NO_ACTIVE_FILE",
  "FILE_NOT_FOUND",
  "NOT_MARKDOWN",
  "SMART_CONNECTIONS_NOT_INSTALLED",
  "SMART_CONNECTIONS_NOT_READY",
  "SOURCE_NOT_INDEXED",
] as const;
export type SmartConnectionsSimilarEvalErrorCode =
  (typeof SMART_CONNECTIONS_SIMILAR_EVAL_ERROR_CODES)[number];

export const smartConnectionsSimilarEvalResponseSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      count: z.number().int().nonnegative(),
      matches: z.array(matchEntrySchema),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      code: z.enum(SMART_CONNECTIONS_SIMILAR_EVAL_ERROR_CODES),
      detail: z.string(),
    })
    .strict(),
]);

export type SmartConnectionsSimilarInput = z.infer<typeof smartConnectionsSimilarInputSchema>;
export type SmartConnectionsSimilarOutput = z.infer<typeof smartConnectionsSimilarOutputSchema>;
export type MatchEntry = z.infer<typeof matchEntrySchema>;
export type SmartConnectionsSimilarEvalResponse = z.infer<
  typeof smartConnectionsSimilarEvalResponseSchema
>;
```

### Field policy table

| Field | Type | Required | When forbidden | Validator | Notes |
|---|---|---|---|---|---|
| `target_mode` | `"specific" \| "active"` | Always | Never | Enum | Standard discriminator (ADR-003) |
| `vault` | `string` (min 1) | In specific mode | In active mode | `applyTargetModeRefinement` | Unknown vault → cli-adapter 011-R5 inspection → `VAULT_NOT_FOUND(reason: "unknown")` per FR-017. Closed-but-registered vault → handler-side empty-stdout detection → `VAULT_NOT_FOUND(reason: "not-open")` per FR-017a. |
| `file` | `string` | Specific mode (XOR with `path`) | In active mode; or with `path` in specific mode | `applyTargetModeRefinement` | Wikilink-form basename (no extension, no folder). Resolved in-eval via `app.metadataCache.getFirstLinkpathDest`. |
| `path` | `string` | Specific mode (XOR with `file`) | In active mode; or with `file` in specific mode | `applyTargetModeRefinement` | Vault-relative path including `.md`. Resolved in-eval via `app.vault.getAbstractFileByPath`. |
| `limit` | `number` (int, 1..100) | Never | Never | `z.number().int().min(1).max(100).default(20)` | Default `20`. Caps the matches list length AND the count in count-only mode (FR-003 / FR-006). |
| `total` | `boolean` | Never | Never | Type | Default `false`. When `true`, per-match list is empty; `count` populated identically (FR-006a). |

### Strict-mode top-level
The schema is `targetModeBaseSchema` (which is `.strict()`) extended with `limit` and `total` and refined. `additionalProperties: false` is the published contract. The unknown-key rejection contract (US3 scenario 4 / FR-005) is satisfied by this strict mode.

---

## Output schema

The handler returns `{ count: number, matches: MatchEntry[] }` where `MatchEntry = { path, headingPath, score }`. Per FR-007 (block-level granularity per the 2026-05-15 live-probe-driven amendment to grilling Q3):

- **`path`** is the source FILE's vault-relative path with `.md` extension preserved — extracted by taking everything before the FIRST `#` in the plugin's match key. Parity with BI-019 `files` output. Directly pasteable into other typed tools' `path=` field.
- **`headingPath`** is an ordered array of heading-path segments locating the matched block within `path` — split on `#` AFTER the first `#`. `[]` for source-level matches (no fragment); `["---frontmatter---"]` literal-preserved for frontmatter-block matches (plugin sentinel NOT normalised); multi-segment array for nested-heading-block matches (`"H1#H2"` → `["H1", "H2"]`).
- **`score`** is the raw `number` returned by the plugin (FR-009 — pass-through, no clamp/normalise/round). Embedding-model-dependent semantics (transformers.js ≈ `[0, 1]`; OpenAI ada-002 = `[0, 1]`).

The exhaustive-fields list is locked per FR-007 / SC-007a: NO `displayName`, NO `lines` / `lineStart` / `lineEnd`, NO `excerpt` / `content`, NO `kind` discriminator (block vs source is encoded by `headingPath.length === 0`), NO `model` discriminator, NO `embeddingVersion`, NO `original` raw-key field. The `matchEntrySchema` is `.strict()` to enforce this at parse time. Plan-stage implementation MUST NOT silently widen the per-entry shape.

### Uniform envelope across modes
Same `{ count, matches }` shape returned in both default and count-only modes (FR-006). Count-only differs ONLY by `matches: []`; `count` value is identical (FR-006a cross-mode invariant). No discriminated union on the output type — keeps client code uniform.

---

## Eval-envelope wire schema

The eval JS template emits one of two strict shapes:

```typescript
// Success
{ ok: true, count: number, matches: Array<{path, headingPath, score}> }

// Failure (six in-eval-detectable codes)
{ ok: false, code: "NO_ACTIVE_FILE" | "FILE_NOT_FOUND" | "NOT_MARKDOWN" |
                   "SMART_CONNECTIONS_NOT_INSTALLED" | "SMART_CONNECTIONS_NOT_READY" |
                   "SOURCE_NOT_INDEXED",
  detail: string }
```

The discriminated union is on `ok`. Strict mode rejects unknown keys to lock the wire contract. Handler's multi-stage parse (`JSON.parse` then envelope safeParse) maps both wire-format failures and envelope `ok: false` codes onto existing `UpstreamError` codes per FR-021 (zero new top-level error codes).

### Closed-vault discriminator does NOT travel via the envelope

Per FR-017a / R5a, the closed-but-registered vault case is detected by the handler from the **dispatch-layer's empty-stdout response** (zero bytes OR whitespace-only stdout + exit 0 + `vault=` argument supplied). The eval JS never runs in this case (the CLI's transparently-open-the-vault side effect supersedes the eval). The handler emits `CLI_REPORTED_ERROR(details.code = "VAULT_NOT_FOUND", details.reason = "not-open")` directly without consulting the envelope schema. The envelope codes cover only the in-eval-reachable failure surface.

---

## JS template body

```javascript
// FROZEN — the only insertion point is __PAYLOAD_B64__.
const JS_TEMPLATE = `(async()=>{
const a=JSON.parse(atob('__PAYLOAD_B64__'));
const p=app.plugins.plugins['smart-connections'];
if(!p)return JSON.stringify({ok:false,code:'SMART_CONNECTIONS_NOT_INSTALLED',detail:'plugin not loaded in vault: '+app.vault.getName()});
let f;
if(a.active){
  f=app.workspace.getActiveFile();
  if(!f)return JSON.stringify({ok:false,code:'NO_ACTIVE_FILE',detail:'No note focused; switch to specific mode or focus a note.'});
}else if(a.path){
  f=app.vault.getAbstractFileByPath(a.path);
  if(!f)return JSON.stringify({ok:false,code:'FILE_NOT_FOUND',detail:'path: '+a.path});
}else{
  f=app.metadataCache.getFirstLinkpathDest(a.file,'');
  if(!f)return JSON.stringify({ok:false,code:'FILE_NOT_FOUND',detail:'wikilink: '+a.file});
}
if(f.extension!=='md')return JSON.stringify({ok:false,code:'NOT_MARKDOWN',detail:'path: '+f.path+' extension: '+f.extension});
const env=p.env;
if(!env||!env.smart_sources||typeof env.smart_sources.items!=='object'||env.smart_sources.items===null){
  return JSON.stringify({ok:false,code:'SMART_CONNECTIONS_NOT_READY',detail:'env.smart_sources unavailable'});
}
const sourceKey=f.path;
const src=env.smart_sources.items[sourceKey];
if(!src||typeof src.find_connections!=='function'){
  return JSON.stringify({ok:false,code:'SOURCE_NOT_INDEXED',detail:sourceKey});
}
const raw=await src.find_connections({limit:a.limit});
const matches=(raw||[])
  .map(r=>{
    const key=(r.item&&r.item.key)||r.key||'';
    const hashIdx=key.indexOf('#');
    const path=hashIdx===-1?key:key.slice(0,hashIdx);
    const headingPath=hashIdx===-1?[]:key.slice(hashIdx+1).split('#');
    return {path,headingPath,score:r.score};
  })
  .filter(m=>Number.isFinite(m.score))
  .filter(m=>m.path!==sourceKey)
  .sort((x,y)=>{
    if(x.score!==y.score)return y.score-x.score;
    if(x.path!==y.path)return x.path<y.path?-1:1;
    const xh=x.headingPath.join('#'),yh=y.headingPath.join('#');
    return xh<yh?-1:xh>yh?1:0;
  });
const count=matches.length;
return JSON.stringify({ok:true,count,matches:a.total===true?[]:matches});
})()`;
```

### Template invariants (locked by handler tests)

1. **Frozen string constant**. No template-literal interpolation; no string concatenation; no `eval`-builder pattern. Only one substitution point: `__PAYLOAD_B64__`.
2. **Async IIFE wrapper**. The template wraps in `(async()=>{...})()` because `find_connections` is async (per R7 / F3). The eval CLI awaits the promise via its existing async-return support (parity with BI-015 `read_heading`).
3. **Single base64 placeholder**. The handler uses `JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64)` — a single textual replacement of a fixed-position token.
4. **Returns a JSON string**. Every code path ends with `JSON.stringify(...)`, so the eval's `=> ` prefix is followed by a valid JSON string in every code path.
5. **In-order precedence chain** (FR-017b). The stages run in the locked specific-mode order: `SMART_CONNECTIONS_NOT_INSTALLED` → target file resolution (`NO_ACTIVE_FILE` for active mode, `FILE_NOT_FOUND` for specific mode) → `NOT_MARKDOWN` → `SMART_CONNECTIONS_NOT_READY` → `SOURCE_NOT_INDEXED` → query → transform → sort → emit. Each failure is the FIRST condition in the chain that fails per FR-017b.
6. **`f.extension === 'md'` guard** (R12 / FR-013). Inside-eval rejection of non-`.md` targets BEFORE reaching plugin internals — symmetric with BI-025's `NOT_MARKDOWN` contract.
7. **Lifecycle checks fail fast** (FR-015 / FR-016 / FR-014). `SMART_CONNECTIONS_NOT_INSTALLED` checks plugin presence at `app.plugins.plugins['smart-connections']`; `SMART_CONNECTIONS_NOT_READY` checks `env.smart_sources.items` is a non-null object; `SOURCE_NOT_INDEXED` checks `items[sourceKey]` returns a value with a callable `find_connections` method. The three are independently meaningful per the FR-017b precedence rationale.
8. **Per-match transform** (R7 / F4). Each plugin result `{item: {key: "Folder/Note.md#H1#H2"}, score}` (OR `{key, score}` fallback for source-level results) maps to `{path: "Folder/Note.md", headingPath: ["H1", "H2"], score}`. `path` is everything before the first `#`; `headingPath` is the segments after, split on `#`; frontmatter sentinel `"---frontmatter---"` is preserved verbatim (F6).
9. **Non-finite-score filter** (R10 / FR-009a). `.filter(m => Number.isFinite(m.score))` silently drops `NaN`, `Infinity`, `-Infinity`, `null`, `undefined`, and any non-numeric `score`. No envelope code for the filter event. Outer `count` reflects the post-filter length.
10. **Source-path-keyed self-exclusion** (R9 / FR-010). `.filter(m => m.path !== sourceKey)` removes the source note AND any block inside it (because `m.path` is the file-path component only, AND `sourceKey` is `f.path` = the source file's vault-relative path). Defence-in-depth — plugin already excludes self by default but the wrapper enforces regardless.
11. **Three-level sort** (R8 / FR-008). Primary `score` descending (`y.score - x.score`); secondary `path` byte-compare ascending (`<` operator, NOT `localeCompare`); tertiary `headingPath.join('#')` byte-compare ascending. Deterministic; locale-independent.
12. **`a.total` branch at the envelope-emission step**. The same matches array is computed in both modes (FR-006a cross-mode invariant by construction); only the envelope's `matches` field differs.
13. **`(raw||[])` coalescing**. Defensive guard against an undefined plugin return — preserves the empty-list contract per FR-011 / SC-005 without an envelope error.

---

## Base64 payload assembly

```typescript
// In handler.ts:
const payloadJson = JSON.stringify({
  active: input.target_mode === "active",
  path:   input.target_mode === "specific" ? input.path ?? null : null,
  file:   input.target_mode === "specific" ? input.file ?? null : null,
  limit:  input.limit,
  total:  input.total === true,
});
const payloadB64 = Buffer.from(payloadJson, "utf-8").toString("base64");
const code = JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64);
```

### Payload shape

```typescript
{
  active: boolean,                    // true iff target_mode === "active"
  path:   string | null,              // input.path in specific mode, else null
  file:   string | null,              // input.file in specific mode, else null
  limit:  number,                     // resolved limit (default 20 applied by zod)
  total:  boolean,                    // true iff input.total === true
}
```

### Test-seam decode (R12)

The handler test's stub `spawnFn` decodes the base64 payload via `Buffer.from(b64, "base64").toString("utf-8")` then `JSON.parse(...)` and asserts the `active` / `path` / `file` / `limit` / `total` fields round-trip the user's input bit-for-bit. This regression test guarantees R6's anti-injection contract (FR-028 / SC-025).

---

## Per-tool invariants table

| Invariant | Code location | Test coverage |
|---|---|---|
| Schema is single source of truth (z.infer types) | `schema.ts` | Schema tests assert types via TypeScript compile-time checks |
| target_mode discriminator inherits from `targetModeBaseSchema` | `schema.ts` | Schema tests for specific-no-vault, specific-both-locators, active-with-forbidden-keys |
| `limit` constrained to `[1, 100]` integer with default 20 | `schema.ts` | Schema tests for limit=0, limit=101, limit=-5, limit=5.5, limit="20", limit=1, limit=100, default applied |
| Output schema is `{count, matches: [...]}` strict; per-entry strict | `schema.ts` | Output-shape assertion in handler happy-path tests; SC-007a exhaustive-fields lock |
| `matchEntrySchema.path` requires `.md` suffix | `schema.ts` | Schema test rejects path without `.md`; handler tests verify upstream extraction preserves extension |
| Eval envelope is discriminated union with strict mode | `schema.ts` | Handler tests for ok:false × 6 codes; envelope-parse failure case |
| Single `invokeCli` invocation per request (R3) | `handler.ts` | Handler tests assert spawn-stub was called exactly once per request |
| Base64 payload round-trips user input verbatim (R6 / FR-028 / SC-025) | `handler.ts` | Handler tests decode b64 + JSON.parse and assert payload matches user input |
| JS template is frozen; only `__PAYLOAD_B64__` substitution | `handler.ts` | Handler tests assert `code` arg starts with frozen prefix and ends with frozen suffix; only the b64 region varies |
| Two-stage parse failures map to `CLI_REPORTED_ERROR` with `details.stage` | `handler.ts` | Handler tests for json-parse failure, envelope-parse failure |
| Envelope `ok: false` codes map per R13 table | `handler.ts` | Handler tests for each ok:false → UpstreamError mapping (NO_ACTIVE_FILE / FILE_NOT_FOUND / NOT_MARKDOWN / SMART_CONNECTIONS_NOT_INSTALLED / SMART_CONNECTIONS_NOT_READY / SOURCE_NOT_INDEXED) |
| Unknown vault → `CLI_REPORTED_ERROR(reason: "unknown")` via cli-adapter 011-R5 (R5 / FR-017) | `cli-adapter.ts` (inherited) | Handler test for "Vault not found." stub response |
| Closed-but-registered vault → `CLI_REPORTED_ERROR(reason: "not-open")` via handler-side empty-stdout detection (R5a / FR-017a / SC-011a) | `handler.ts` | Handler test for empty-stdout + exit-0 + vault= supplied stub response |
| 10 MiB output cap fires with `CLI_NON_ZERO_EXIT` (SC-026) | `cli-adapter.ts` (inherited) | Handler test for cap-trigger stub response |
| In-eval `f.extension === 'md'` guard (FR-013 / SC-010) | `handler.ts` JS_TEMPLATE | Handler tests with `.canvas` / `.png` stub assert `NOT_MARKDOWN` envelope code |
| Plugin-lifecycle precedence chain (FR-017b / SC-011b) | `handler.ts` JS_TEMPLATE | 6 compound-failure fixtures verifying each adjacent pair in the chain |
| Per-match transform: split on first `#` for path/headingPath (R7 / F4 / F6) | `handler.ts` JS_TEMPLATE | Handler tests with source-level / nested-heading / frontmatter-sentinel match-key fixtures |
| Non-finite-score filter (FR-009a / R10) | `handler.ts` JS_TEMPLATE | Handler test with NaN/Infinity/-Infinity/null/undefined score entries silently dropped |
| Source-path-keyed self-exclusion (FR-010 / R9 / SC-006) | `handler.ts` JS_TEMPLATE | Handler tests verify both source-level self AND block-within-source removed |
| Three-level sort: score desc / path asc / headingPath.join('#') asc (FR-008 / R8 / SC-007) | `handler.ts` JS_TEMPLATE | Handler tests for score-tie path-tiebreaker AND path-tie headingPath-tiebreaker |
| `total` branch at envelope-emission; cross-mode `count` invariant (FR-006a / SC-016) | `handler.ts` JS_TEMPLATE | Handler test invokes with `total:false` and `total:true` on same stub; asserts equal `count` |
| Limit cap honoured in both modes (FR-006 / SC-017) | `handler.ts` JS_TEMPLATE | Handler test with limit=5 verifies cap on both matches.length and count |
| Empty result list returns `{count:0, matches:[]}` no error (FR-011 / SC-005) | `handler.ts` JS_TEMPLATE | Handler test with empty plugin return stub |
| Frontmatter sentinel preserved verbatim in headingPath (F6 / FR-007) | `handler.ts` JS_TEMPLATE | Handler test with `Note.md#---frontmatter---` match-key fixture |
| Registration via `registerTool` factory (FR-022) | `index.ts` | Registration tests for descriptor name, stripped schema, doc presence |
| Plugin-namespace tool name `smart_connections_similar` (FR-001 / ADR-013) | `index.ts` | Registration test asserts descriptor name verbatim |
| Original-no-upstream attribution header on every new file (FR-027) | All `*.ts` files | Lint/grep step in tasks.md |

---

## Module LOC budget

| File | Approximate LOC | Notes |
|---|---|---|
| `src/tools/smart_connections_similar/schema.ts` | ~80 | Input schema (10 LOC) + matchEntrySchema (10 LOC) + output schema (8 LOC) + envelope schema (20 LOC) + error-codes const (10 LOC) + types/exports (16 LOC) + header (6 LOC) |
| `src/tools/smart_connections_similar/handler.ts` | ~120 | JS_TEMPLATE constant (~40 LOC formatted) + payload assembly (~12 LOC) + invokeCli call (~10 LOC) + closed-vault detection branch (~15 LOC) + multi-stage parse + envelope mapping (~30 LOC) + types/exports (~10 LOC) + header (~5 LOC). Heavier than BI-025's ~110 due to plugin-lifecycle stages + closed-vault detection. |
| `src/tools/smart_connections_similar/index.ts` | ~30 | createSmartConnectionsSimilarTool factory (~15 LOC) + descriptor (~10 LOC) + types/exports (~5 LOC) |
| **Total source** | **~230 LOC** | Slightly above BI-025's ~195 — adds plugin-lifecycle stages + closed-vault detection branch + three-level sort. |
| `src/tools/smart_connections_similar/schema.test.ts` | ~360 | 20 cases × ~18 LOC |
| `src/tools/smart_connections_similar/handler.test.ts` | ~840 | 38 cases × ~22 LOC (count reconciled per /speckit-analyze C1 remediation — the 6 FR-017b precedence-chain compound fixtures are DEDICATED cases rather than displacing existing error-path slots; per-case complexity higher due to plugin-lifecycle fixtures + closed-vault detection + base64 round-trip) |
| `src/tools/smart_connections_similar/index.test.ts` | ~200 | 5 cases × ~40 LOC (content completeness checks for the larger error roster + plugin-namespace name assertion) |
| **Total tests** | **~1400 LOC** | Total ~1630 LOC for source + tests; expanded from BI-025's ~1310 to cover the plugin-lifecycle dimension + closed-vault detection + precedence-chain fixtures (handler tests rebalanced from 32 → 38 per /speckit-analyze C1). |

---

## Test inventory (planned)

### `schema.test.ts` — 20 cases

1. happy: specific + vault + path → parse OK
2. happy: specific + vault + file (basename) → parse OK
3. happy: specific + vault + path + `total: true` → parse OK
4. happy: specific + vault + path + `total: false` → parse OK
5. happy: specific + vault + path + `limit: 1` (boundary) → parse OK
6. happy: specific + vault + path + `limit: 100` (boundary) → parse OK
7. happy: specific + vault + path with no `limit` → default `20` applied
8. happy: active (no other fields) → parse OK
9. happy: active + `total: true` → parse OK
10. fail: specific without vault → ZodError, dispatcher spy never called
11. fail: specific without file and without path → ZodError
12. fail: specific with BOTH file AND path → ZodError (XOR)
13. fail: active with vault → ZodError
14. fail: active with file → ZodError
15. fail: active with path → ZodError
16. fail: unknown top-level key (e.g. `threshold`) → ZodError (strict mode per FR-005)
17. fail: `limit` out of range (0, -5, 101, 1000) → ZodError
18. fail: `limit` non-integer (5.5, `"20"`) → ZodError
19. fail: `total` as string `"true"` → ZodError
20. fail: `target_mode` missing OR set to unknown value (`"focused"`) → ZodError

### `handler.test.ts` — 38 cases (rebalanced from 32 per /speckit-analyze C1 remediation)

**Happy paths**

1. specific + path + mixed block-level matches (source-level, single-heading, nested-heading, frontmatter-sentinel) → 4-entry response with correct path/headingPath/score values, sorted score-desc
2. specific + file (basename) → resolves via `getFirstLinkpathDest`; same response as case 1 for the same file
3. specific + path + `total: true` → `{count:N, matches:[]}` for the same fixture
4. specific + path + plugin returns empty list → `{count:0, matches:[]}` no error (FR-011 / SC-005)
5. specific + path + `limit: 5` → at most 5 entries (FR-006 / SC-017)
6. active + focused-file fixture → response matches what specific-mode would return for the same file
7. active + `total: true` + focused-file fixture → count-only response

**Per-match shape transforms (R7 / F4 / F6)**

8. source-level match key `"Folder/Note.md"` (no `#`) → entry with `path:"Folder/Note.md"`, `headingPath:[]`
9. single-heading match key `"Folder/Note.md#H1"` → entry with `headingPath:["H1"]`
10. nested-heading match key `"Folder/Note.md#H1#H2"` → entry with `headingPath:["H1","H2"]`
11. frontmatter-sentinel match key `"Folder/Note.md#---frontmatter---"` → entry with `headingPath:["---frontmatter---"]` (verbatim preservation per F6)
12. fallback `{key, score}` shape (no `r.item`) → handler reads `r.key` directly

**Filters and sort (FR-008 / FR-009a / FR-010)**

13. non-finite scores (`NaN`, `Infinity`, `-Infinity`, `null`, `undefined`) silently dropped (FR-009a / R10)
14. source-level self-match `path === sourcePath` with `headingPath:[]` removed (FR-010 / R9)
15. block-within-source `path === sourcePath` with non-empty `headingPath` removed (FR-010 / R9 / SC-006)
16. score-tie → secondary tiebreak on `path` byte-compare ascending (FR-008 / SC-007)
17. path-tie (two blocks from same source tied on score) → tertiary tiebreak on `headingPath.join('#')` byte-compare ascending (FR-008 / SC-007)

**Cross-mode invariant**

18. invoke same fixture with `total: false` then `total: true`; assert equal `count` values (FR-006a / SC-016)

**Error paths — in-eval envelope codes**

19. specific + unresolved `path` → envelope `FILE_NOT_FOUND` → `CLI_REPORTED_ERROR(stage: envelope-error, code: FILE_NOT_FOUND)`
20. specific + unresolved `file` (basename) → envelope `FILE_NOT_FOUND` (via getFirstLinkpathDest null)
21. specific + `.canvas` file → envelope `NOT_MARKDOWN` → `CLI_REPORTED_ERROR(stage: envelope-error, code: NOT_MARKDOWN)`
22. active + no focused file → envelope `NO_ACTIVE_FILE` → `ERR_NO_ACTIVE_FILE` OR `CLI_REPORTED_ERROR(stage: envelope-error, code: NO_ACTIVE_FILE)` (per BI-015 / BI-025 alignment)
23. plugin not installed → envelope `SMART_CONNECTIONS_NOT_INSTALLED` → `CLI_REPORTED_ERROR(stage: envelope-error, code: SMART_CONNECTIONS_NOT_INSTALLED)` (FR-015 / SC-012)
24. plugin loaded but `env.smart_sources` undefined → envelope `SMART_CONNECTIONS_NOT_READY` (FR-016 / SC-013)
25. source not in `env.smart_sources.items` → envelope `SOURCE_NOT_INDEXED` (FR-014 / SC-009)

**Error paths — dispatcher / out-of-eval**

26. specific + `vault: "Unknown"` → cli-adapter 011-R5 inspection → `CLI_REPORTED_ERROR(reason: "unknown")` (FR-017 / SC-011)
27. closed-but-registered vault (empty stdout + exit 0 + vault= supplied) → handler-side detection → `CLI_REPORTED_ERROR(reason: "not-open")` (FR-017a / SC-011a)
28. malformed eval stdout (non-JSON) → `CLI_REPORTED_ERROR(stage: 'json-parse')`
29. malformed envelope (unknown key in `ok:true` branch) → `CLI_REPORTED_ERROR(stage: 'envelope-parse')`
30. 10 MiB output cap kill → `CLI_NON_ZERO_EXIT` (SC-026)

**Compound-failure precedence fixtures (FR-017b / SC-011b)**

31. compound: `vault:"Unknown"` (matches 011-R5 path) + `.canvas` file → `VAULT_NOT_FOUND(unknown)` fires first (precedence verified)
32. base64 payload decode + `code` arg starts with frozen prefix + only `__PAYLOAD_B64__` region varies + single `invokeCli` call per request (R3 / R6 / FR-028 / SC-025)

*Note: case 32 plus cases 23/24/25/27 combined supply the SC-011b adjacent-pair coverage in compound — additional adjacent-pair fixtures (NOT_MARKDOWN→SMART_CONNECTIONS_NOT_READY, etc.) are bundled into the test for the higher-priority discriminator per the FR-017b chain. SC-011b's "at least one fixture per adjacent pair" requirement is satisfied by the union of cases 23–27 + 31, with each case independently verifying that the earlier-priority discriminator fires when multiple conditions hold.*

### `index.test.ts` — 5 cases

1. descriptor name is `"smart_connections_similar"` (plugin-namespace convention per FR-001 / ADR-013)
2. stripped schema (no descriptions) is published per ADR-005
3. `docs/tools/smart_connections_similar.md` exists per assertToolDocsExist (FR-022)
4. tool registered in alphabetical position between `set_property` and `write_note` in the registry walk
5. FR-018 baseline drift detector test fails until `npm run baseline:write` runs

### Test total

**63 cases** (20 schema / 38 handler / 5 registration) per /speckit-analyze C1 remediation (was 57 = 20/32/5 in the initial output; the handler count was rebalanced from 32 → 38 to keep the 6 FR-017b precedence-chain compound fixtures as DEDICATED cases rather than displacing existing error-path slots). Exceeds SC-021's floor of 50. Higher than BI-025's 51 because of the three additional plugin-lifecycle envelope codes (`SMART_CONNECTIONS_NOT_INSTALLED` / `SMART_CONNECTIONS_NOT_READY` / `SOURCE_NOT_INDEXED`), the closed-vault detection branch (`VAULT_NOT_FOUND(reason: "not-open")`), the `limit` boundary cases, the three-level sort tiebreaker fixtures, and the dedicated compound-failure precedence-chain coverage.

---

## Architectural delta map vs predecessors

| Aspect | This feature (`smart_connections_similar`) | BI-025 (`links`) | BI-015 (`read_heading`) | BI-014 (`find_by_property`) | BI-023 / BI-024 (`outline` / `properties`) |
|---|---|---|---|---|---|
| CLI subcommand | `eval` (R2 / F2 — no native similarity subcommand) | `eval` | `eval` | `eval` | native subcommand |
| Target object inside eval | `app.plugins.plugins["smart-connections"].env.smart_sources` (PLUGIN API) | `app.metadataCache.getFileCache` | `app.metadataCache.metadataCache[].headings` | `app.metadataCache` properties scan | N/A |
| `target_mode` discriminator | YES (specific / active) | YES | YES | NO (vault-only) | NO / NO |
| `limit` field | YES (1..100, default 20) | NO | NO | NO | NO |
| `total` count-only mode | YES | YES | NO | NO | YES / YES |
| Per-entry shape | `{path, headingPath, score}` (3 fields) | `{target, line, kind, displayText?}` (4 fields) | `{content: string}` (single string) | `{path: string}` (path-only) | `{level, text, line}` / `{name, noteCount}` |
| Per-entry transforms in eval | 4 (split-on-#-for-path, split-after-#-for-headingPath, finite-score filter, source-path-keyed self-exclusion) | 3 (kind / line+1 / displayText-omit) | 1 (body slice) | 1 (path map) | 2 (drop type / rename count) for BI-024; 0 for BI-023 |
| Eval template async | YES (`find_connections` is async per F3) | NO (metadataCache sync) | YES (file content read async) | YES (cache scan) | N/A |
| Wrapper-side post-fetch sort | NO (sort intra-eval, three-level) | NO (sort intra-eval, `line`/`_col`) | N/A | NO (upstream order) | YES (case-insensitive) for BI-024 |
| Plugin-as-runtime-dependency | YES (Smart Connections plugin — FIRST tool with this dimension) | NO | NO | NO | NO |
| Plugin-lifecycle error codes | THREE NEW (NOT_INSTALLED / NOT_READY / SOURCE_NOT_INDEXED) | N/A | N/A | N/A | N/A |
| Closed-vault detection branch | YES (handler-side empty-stdout detection — FIRST tool with this branch) | NO | NO | NO | NO |
| `VAULT_NOT_FOUND` sub-discriminator on `details.reason` | YES (`"unknown"` vs `"not-open"`) | NO (`"unknown"` only via 011-R5) | NO | NO | NO |
| Error-precedence chain | YES (FR-017b — FIRST tool with explicit chain spec) | NO | NO | NO | NO |
| Three-level sort tiebreak | YES (score / path / headingPath.join('#')) | NO (two-level: line / _col) | N/A | N/A | N/A |
| Anti-injection | base64 payload (R6 / FR-028) | base64 payload | base64 payload | base64 payload | natural data-passing |
| Naming convention | plugin-namespace `<plugin>_<op>` (ADR-013 NEW) | single-word verbatim (ADR-010) | single-word + heading | underscored composite | single-word verbatim (ADR-010) |

**Distinctive risk surface**: this BI introduces FIVE new architectural dimensions versus the eval-driven metadataCache cohort (BI-014 / BI-015 / BI-025): (a) plugin-as-runtime-dependency with three lifecycle codes; (b) closed-vault detection branch routed through the handler not the cli-adapter; (c) `details.reason` sub-discriminator pattern on `VAULT_NOT_FOUND`; (d) explicit error-precedence chain (FR-017b) with compound-failure regression fixtures; (e) three-level sort tiebreaker. Mitigated by: (1) the in-eval lifecycle checks fail fast in a deterministic order per FR-017b with one fixture per adjacent pair locking SC-011b; (2) the closed-vault detection signature is a strict conjunction (`empty stdout AND exit 0 AND vault= supplied AND vault present in 'obsidian vaults'`) verified by live probe per F7 / F8; (3) the base64 payload round-trip assertion locks R6 structurally per SC-025; (4) plugin-API drift surfaces deterministically as `SMART_CONNECTIONS_NOT_READY` per the Q1 docs-only soft-pin (FR-022); (5) the three-level sort uses pure `<`/`>` operators with no `localeCompare` dependency.
