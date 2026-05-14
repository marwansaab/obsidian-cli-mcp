# Data Model — Smart Connections Query (BI-027)

Phase 1 artifact. Documents the input / output / eval-envelope schema shapes, the frozen JS template body, the base64 payload assembly, the per-tool invariants table, the module LOC budget, the test inventory, and the architectural delta vs predecessors.

---

## Input Schema

**Location**: `src/tools/smart_connections_query/schema.ts`

```typescript
// Original — no upstream. smart_connections_query input/output/eval-envelope schemas — flat schema (NO target_mode per FR-001); strict per-entry matchEntrySchema locks the exhaustive three-field public contract {path, headingPath, score} (block-level per the BI-026 R7 inheritance); discriminated-union eval-envelope wire format.
import { z } from "zod";

export const smartConnectionsQueryInputSchema = z
  .object({
    query: z.string().trim().min(1).max(4000),
    vault: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(100).default(20),
    total: z.boolean().optional(),
  })
  .strict();

export const matchEntrySchema = z
  .object({
    path: z.string().endsWith(".md"),
    headingPath: z.array(z.string()),
    score: z.number().finite(),
  })
  .strict();

export const smartConnectionsQueryOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    matches: z.array(matchEntrySchema),
  })
  .strict();

export const SMART_CONNECTIONS_QUERY_EVAL_ERROR_CODES = [
  "SMART_CONNECTIONS_NOT_INSTALLED",
  "SMART_CONNECTIONS_NOT_READY_API_MISSING",
  "SMART_CONNECTIONS_NOT_READY_EMBED_FAILED",
] as const;
export type SmartConnectionsQueryEvalErrorCode =
  (typeof SMART_CONNECTIONS_QUERY_EVAL_ERROR_CODES)[number];

export const smartConnectionsQueryEvalResponseSchema = z.discriminatedUnion("ok", [
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
      code: z.enum(SMART_CONNECTIONS_QUERY_EVAL_ERROR_CODES),
      detail: z.string(),
    })
    .strict(),
]);

export type SmartConnectionsQueryInput = z.infer<typeof smartConnectionsQueryInputSchema>;
export type SmartConnectionsQueryOutput = z.infer<typeof smartConnectionsQueryOutputSchema>;
export type MatchEntry = z.infer<typeof matchEntrySchema>;
export type SmartConnectionsQueryEvalResponse = z.infer<
  typeof smartConnectionsQueryEvalResponseSchema
>;
```

**Notable departures from BI-026's schema**:
- NO `target_mode` discriminator. Flat schema with optional `vault?: string`.
- `query: z.string().trim().min(1).max(4000)` — wrapper-side trim + length cap (FR-002).
- NO `file?` / `path?` fields — fileless surface.
- Eval-envelope ERROR codes flattened to 3 (vs BI-026's 6). The `details.reason` sub-discriminator is encoded INTO the envelope code (`SMART_CONNECTIONS_NOT_READY_API_MISSING` vs `SMART_CONNECTIONS_NOT_READY_EMBED_FAILED`) for parse-time discrimination; the handler maps each to `CLI_REPORTED_ERROR(code: "SMART_CONNECTIONS_NOT_READY", reason: "<X>")` — keeping the discriminator on the wire avoids a second sentinel field on the envelope.

**Cross-mode invariant** (FR-006a): for the same `(query, vault?, limit)` tuple, `count` is identical under `total: true` and `total: false`. Enforced by structure — the in-eval pipeline computes the full `matches` array and `count` BEFORE branching on `a.total`.

**Strict-mode invariant**: unknown top-level keys → `VALIDATION_ERROR`. Parity with every prior typed tool.

---

## Frozen JS Template

**Location**: `src/tools/smart_connections_query/_template.ts`

```typescript
// Original — no upstream. Frozen JS template for the eval subcommand — base64 payload anti-injection (R6); reaches the Smart Connections plugin's lookup API via app.plugins.plugins["smart-connections"].env.smart_sources.lookup({hypotheticals, filter:{limit}, collection:"smart_blocks"}) (R2/F3); async IIFE because lookup is async; seven load-bearing in-eval stages — (Stage 1) plugin-installation check emitting SMART_CONNECTIONS_NOT_INSTALLED, (Stage 2) env.smart_sources + lookup API-shape check emitting SMART_CONNECTIONS_NOT_READY_API_MISSING (R12), (Stage 3) lookup invocation, (Stage 4) return-value sentinel check `r && r.error` emitting SMART_CONNECTIONS_NOT_READY_EMBED_FAILED (R11), (Stage 5) per-match transform splitting on first # into {path, headingPath} (R7 — frontmatter sentinel "---frontmatter---" preserved verbatim) + Number.isFinite score filter (R10) + three-level sort score-desc/path-byte-asc/headingPath.join('#')-byte-asc (R8) — NO self-exclusion (R9), (Stage 6) limit slice, (Stage 7) a.total branch at envelope-emission preserving the cross-mode count invariant (R3/FR-006a).
export const JS_TEMPLATE = `(async()=>{
const a=JSON.parse(atob('__PAYLOAD_B64__'));
const p=app.plugins.plugins['smart-connections'];
if(!p)return JSON.stringify({ok:false,code:'SMART_CONNECTIONS_NOT_INSTALLED',detail:'plugin not loaded in vault: '+app.vault.getName()});
const env=p.env;
if(!env||!env.smart_sources||typeof env.smart_sources.lookup!=='function'){
return JSON.stringify({ok:false,code:'SMART_CONNECTIONS_NOT_READY_API_MISSING',detail:'env.smart_sources.lookup unavailable'});
}
const r=await env.smart_sources.lookup({hypotheticals:[a.query],filter:{limit:a.limit},collection:'smart_blocks'});
if(r&&typeof r.error==='string'){
return JSON.stringify({ok:false,code:'SMART_CONNECTIONS_NOT_READY_EMBED_FAILED',detail:r.error});
}
const matches=(Array.isArray(r)?r:[])
.map(m=>{
const key=m.key||'';
const hashIdx=key.indexOf('#');
const path=hashIdx===-1?key:key.slice(0,hashIdx);
const headingPath=hashIdx===-1?[]:key.slice(hashIdx+1).split('#');
return {path,headingPath,score:m.score};
})
.filter(m=>Number.isFinite(m.score))
.sort((x,y)=>{
if(x.score!==y.score)return y.score-x.score;
if(x.path!==y.path)return x.path<y.path?-1:1;
const xh=x.headingPath.join('#'),yh=y.headingPath.join('#');
return xh<yh?-1:xh>yh?1:0;
})
.slice(0,a.limit);
const count=matches.length;
return JSON.stringify({ok:true,count,matches:a.total===true?[]:matches});
})()`;
```

**Template invariants**:
1. EXACTLY ONE substitution slot: `__PAYLOAD_B64__`. Any second slot is a structural violation.
2. NO direct interpolation of user input. The base64 payload is the only avenue.
3. Async IIFE wrapping is required — `lookup` is async.
4. Seven load-bearing stages (1: plugin presence; 2: API shape; 3: lookup call; 4: error-sentinel check; 5: per-match transform + filter + sort; 6: limit slice; 7: total-branched envelope emission).
5. Stage-5 transform MUST extract `{path, headingPath, score}` from top-level `m.key` and `m.score` ONLY — never serialize `m.item` (circular per F7).
6. Stage-5 does NOT perform self-exclusion (R9 — no source path to exclude).
7. Stage-7 `a.total === true` strictly equals check (NOT truthy) so the wrapper does not silently treat e.g. `"true"` as total mode (defence in depth alongside the schema validator).

---

## Base64 Payload Assembly

**Location**: `src/tools/smart_connections_query/handler.ts`

```typescript
const payloadJson = JSON.stringify({
  query: input.query,
  limit: input.limit,
  total: input.total === true,
});
const payloadB64 = Buffer.from(payloadJson, "utf-8").toString("base64");
const code = JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64);
```

**Payload fields**:
- `query`: validated string (trimmed, 1-4000 chars).
- `limit`: validated integer (1-100, default 20).
- `total`: explicit boolean (the wrapper normalises optional `total?` to `total: false` if omitted; the in-eval check uses strict-equals on `true`).

**Round-trip assertion** (handler tests): the test seam decodes the `__PAYLOAD_B64__` value from the spawned argv, parses it as JSON, and asserts byte-equality with the test's input. Locks R6 structurally.

**Vault field handling**: the `vault?` input does NOT appear in the payload — it's passed to the `invokeCli` call as the top-level `vault` parameter, mapping to the CLI's `vault=<name>` argv. The eval JS never sees the vault name (it doesn't need to — the plugin instance is resolved through `app.plugins.plugins[...]` against whichever vault the CLI dispatched to).

---

## Per-Tool Invariants Table

| Invariant | Source | Verified by |
|---|---|---|
| Input strict schema | FR-001..FR-005a | `schema.test.ts` — 16+ cases including unknown-key rejection |
| `query.length` ∈ `[1, 4000]` after `.trim()` | FR-002 | `schema.test.ts` — boundary cases at 0, 1, 4000, 4001; whitespace-only rejection |
| `vault` either omitted or non-empty | FR-003 | `schema.test.ts` — empty-string rejection |
| `limit` ∈ `[1, 100]` integer default 20 | FR-004 | `schema.test.ts` — boundary 0/1/20/100/101; non-integer 5.5 rejection |
| Cross-mode `count` invariant | FR-006a | `handler.test.ts` — pair of tests (default + count-only) on same fixture |
| Per-match strict three-field shape | FR-007 | `schema.test.ts` (matchEntrySchema) + `handler.test.ts` |
| Three-level sort | FR-008 | `handler.test.ts` — score-tie path-tiebreak + score-tie path-tie headingPath-tiebreak |
| `Number.isFinite` filter | FR-009 / R10 | `handler.test.ts` — fixture with NaN / Infinity / null score entries |
| Single `__PAYLOAD_B64__` substitution slot | R6 | `handler.test.ts` — base64 round-trip assertion on every payload-affecting test |
| Single `invokeCli` per request (+ stage-0 second `vaults` call on empty-stdout) | R3 / R5a | `handler.test.ts` — spawnFn queue assertion |
| Closed-vault detection branch | R5a / FR-013 entry 3 | `handler.test.ts` — empty-stdout fixture; shared detector tests in `_eval-vault-closed-detection/*.test.ts` |
| Plugin-lifecycle codes | FR-013 / R11 / R12 | `handler.test.ts` — three fixtures per code |
| Precedence chain | FR-017 | `handler.test.ts` — 4 compound-failure regression fixtures |
| Anti-injection round-trip | FR-019 / R6 | `handler.test.ts` — query containing shell metacharacters, embedded base64, JSON-escapable characters |

---

## Module LOC Budget

| Module | Source LOC (estimate) | Test LOC (estimate) | Notes |
|---|---|---|---|
| `src/tools/smart_connections_query/schema.ts` | 50 | 280 | Smaller than BI-026 (no target_mode discriminator) |
| `src/tools/smart_connections_query/_template.ts` | 35 | — | Just the frozen JS template + header |
| `src/tools/smart_connections_query/handler.ts` | 85 | 550 | Smaller than BI-026 (fewer envelope error codes; reuses shared detector) |
| `src/tools/smart_connections_query/index.ts` | 25 | 120 | Standard factory pattern |
| `src/tools/_eval-vault-closed-detection/index.ts` | 10 | — | Re-export module |
| `src/tools/_eval-vault-closed-detection/detector.ts` | 65 | 280 | Stage-0 detection + spawning second `vaults verbose` call |
| `src/tools/_eval-vault-closed-detection/registry-parser.ts` | 35 | 180 | BOM-aware `vaults verbose` stdout parser |
| `src/tools/smart_connections_similar/handler.ts` | (delta only) | (delta only) | Refactor to consume shared detector + emit `details.reason: "api-missing"` |
| **Total NEW** | ~305 | ~1410 | |
| **Total INCLUDING BI-026 ripples** | ~315 (10 LOC delta) | ~1440 (30 LOC delta — 3 new test cases) | |

---

## Test Inventory

| File | Cases | Coverage |
|---|---|---|
| `src/tools/smart_connections_query/schema.test.ts` | 16 | Input strict; query trim/min/max; vault optional+min1; limit range/default/int; total boolean optional; unknown-key rejection; matchEntrySchema strict + score-finite; eval-envelope discriminated union; output strict |
| `src/tools/smart_connections_query/handler.test.ts` | 26 | Happy default mode (multi-block result); happy count-only mode; cross-mode count invariant (paired); empty result (zero matches); base64 round-trip; query-with-shell-metacharacters anti-injection; query-with-Unicode anti-injection; sort score-desc; sort score-tie path-tiebreak; sort score-tie path-tie headingPath-tiebreak; non-finite-score filter (NaN/Infinity/null/undefined/missing); limit cap honored; frontmatter-block sentinel preserved; source-level match (empty headingPath); api-missing path (env.smart_sources undefined); api-missing path (lookup not a function); embed-failed path (`{error: "Embedding search is not enabled."}`); embed-failed path (`{error: <other>}`); plugin-not-installed path; closed-vault detection (stage-0 empty-stdout); unknown-vault path (011-R5 inspection); json-parse failure; envelope-parse failure; output-cap kill; precedence chain × 4 compound fixtures (api-missing < embed-failed; not-installed < api-missing; vault-not-open < not-installed; vault-unknown < vault-not-open) |
| `src/tools/smart_connections_query/index.test.ts` | 5 | Descriptor name; stripped schema; help mention; doc presence + content completeness; FR-018 baseline lock |
| **smart_connections_query subtotal** | **47** | **Exceeds SC-022 floor of 40** |
| `src/tools/_eval-vault-closed-detection/detector.test.ts` | 12 | Fires on empty-stdout + vault= + registered; does NOT fire on empty-stdout + no-vault; does NOT fire on populated-stdout + vault=; does NOT fire on empty-stdout + unregistered; vaults-verbose call shape; BOM handling; multi-vault registry; deps shape; passthrough on non-empty stdout |
| `src/tools/_eval-vault-closed-detection/registry-parser.test.ts` | 8 | BOM-prefixed input; CRLF lines; LF lines; empty lines skip; tab-separated tokens; vault-name exact match; not-found returns false; multiple-tabs-per-line picks first |
| **shared module subtotal** | **20** | **Exceeds SC-023 floor of 15** |
| `src/tools/smart_connections_similar/handler.test.ts` | +3 | (ripple) `details.reason: "api-missing"` emission on existing NOT_READY path × 2; behaviour-preservation regression on the refactored stage-0 |
| **BI-026 ripples subtotal** | **3** | **Meets SC-024 floor of 3** |
| **Grand total** | **70** | New module ~47 + shared module ~20 + BI-026 ripples ~3 |

---

## Architectural Delta Map

**vs predecessors**:

| Predecessor | Shared with BI-027 | Differs in |
|---|---|---|
| BI-026 `smart_connections_similar` | eval-driven; plugin-namespace tool name (ADR-013); plugin-backed runtime-dependency pattern (ADR-014); details.reason sub-discriminator (ADR-015); base64 anti-injection (R6); three-level sort (R8); Number.isFinite filter (R10); single-call architecture (R3); closed-vault detection (R5a — now extracted to shared module per Q8/c hybrid); per-match `{path, headingPath, score}` shape (R7); 10-second typed-tool timeout (inherited limitation #7) | NO `target_mode` discriminator (BI-026 has STANDARD ADR-003); NO source-path-keyed self-exclusion (BI-026 R9); NO source-key-based SOURCE_NOT_INDEXED check (BI-027 has no source key); lookup-return-value-sentinel `{error}` detection vs BI-026's no-equivalent (NEW R11); stdout last-`=> ` extraction vs BI-026's trimStart-and-slice (NEW R14); 5-entry failure roster (BI-026 had 8); 47 new tests (BI-026 had 57); cross-cutting shared module extracted at THIS BI (cohort tool #2) |
| BI-014 `find_by_property` | eval-driven; flat schema (no target_mode); fileless surface; optional vault | metadataCache-based vs plugin-API-based; no plugin-lifecycle codes; no shared `_eval-vault-closed-detection` consumer (predates the module) |
| BI-024 `properties` | flat schema (no target_mode); fileless surface; optional vault | native subcommand vs eval; no plugin codes; no shared `_eval-vault-closed-detection` consumer |

**NEW cross-cutting module**: `src/tools/_eval-vault-closed-detection/` is the first cross-cutting helper extracted from the typed-tool layer (NOT from cli-adapter). It sits between the typed-tool handler and the cli-adapter — a thin orchestration helper, not a dispatch-layer widening. Future eval-driven typed tools with a `vault?` parameter MAY consume it; the cli-adapter stays frozen per the 008-refactor surface invariant.

**Cohort membership**: BI-027 is the SECOND member of the eval-driven plugin-backed sub-cohort. The full cohort tree:
- Eval-driven typed tools:
  - metadataCache cohort: BI-014, BI-015, BI-025
  - **plugin-backed cohort: BI-026, BI-027** (this BI)
- Native-subcommand typed tools: BI-006, BI-011, BI-012, BI-013, BI-019, BI-021, BI-022, BI-023, BI-024 (+ rename ripples)
- Adapter helpers: 003 (cli-adapter), 004 (target-mode), 005 (help), 008 (refactor), 017 (binary-resolver), 010 (target-mode-flatten), 016 (reliable-writer), 020 (write-gaps)

---

## Architectural Outputs (this plan run)

- `specs/027-smart-connections-query/research.md` — created in this plan run
- `specs/027-smart-connections-query/data-model.md` — this file
- `specs/027-smart-connections-query/contracts/smart-connections-query-input.contract.md` — created in this plan run
- `specs/027-smart-connections-query/contracts/smart-connections-query-handler.contract.md` — created in this plan run
- `specs/027-smart-connections-query/quickstart.md` — created in this plan run
- `.architecture/Obsidian CLI MCP - Architecture.md` — rolled forward in this plan run to reference BI-027 cohort membership AND the new `_eval-vault-closed-detection` cross-cutting module (per FR-025)
- `CLAUDE.md` — active-narrative block rewritten to BI-027; BI-026 narrative retained as predecessor

**Outputs deferred to `/speckit-tasks`**: `tasks.md` with dependency-ordered T001..TNNN.

**Outputs deferred to `/speckit-implement`**: the new source files, the BI-026 ripples, the new test files, the docs file at `docs/tools/smart_connections_query.md`, the registry baseline roll-forward via `npm run baseline:write`, the CHANGELOG entry, the package.json version bump 0.5.3 → 0.5.4.
