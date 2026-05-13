# Data Model — `links` Typed MCP Tool

**Feature**: [025-list-links](./spec.md)
**Date**: 2026-05-13

This document is the Phase 1 design artefact for `links`. It records the input schema shape, the output schema shape, the eval-envelope wire-format schema, the JS template body, the base64 payload assembly, the per-tool invariants table, the module LOC budget, and the test inventory. The schemas defined here are the SINGLE SOURCE OF TRUTH for the runtime parse, the published JSON Schema (via `zod-to-json-schema`), AND the inferred TypeScript types (via `z.infer`) per Constitution Principle III.

---

## Input schema

```typescript
// src/tools/links/schema.ts

import { z } from "zod";
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const linksInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    total: z.boolean().optional(),
  }),
);

export const linkKindEnum = z.enum(["wikilink", "embed", "markdown"] as const);
export type LinkKind = z.infer<typeof linkKindEnum>;

export const linkEntrySchema = z
  .object({
    target: z.string(),
    line: z.number().int().positive(),
    kind: linkKindEnum,
    displayText: z.string().optional(),
  })
  .strict();

export const linksOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    links: z.array(linkEntrySchema),
  })
  .strict();

/**
 * Wire-format envelope from the eval JS template (R13).
 * Discriminated union on `ok`. Strict mode rejects unknown keys to lock the
 * wire contract.
 */
export const LINKS_EVAL_ERROR_CODES = [
  "NO_ACTIVE_FILE",
  "FILE_NOT_FOUND",
  "NOT_MARKDOWN",
] as const;
export type LinksEvalErrorCode = (typeof LINKS_EVAL_ERROR_CODES)[number];

export const linksEvalResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    count: z.number().int().nonnegative(),
    links: z.array(linkEntrySchema),
  }).strict(),
  z.object({
    ok: z.literal(false),
    code: z.enum(LINKS_EVAL_ERROR_CODES),
    detail: z.string(),
  }).strict(),
]);

export type LinksInput = z.infer<typeof linksInputSchema>;
export type LinksOutput = z.infer<typeof linksOutputSchema>;
export type LinkEntry = z.infer<typeof linkEntrySchema>;
export type LinksEvalResponse = z.infer<typeof linksEvalResponseSchema>;
```

### Field policy table

| Field | Type | Required | When forbidden | Validator | Notes |
|---|---|---|---|---|---|
| `target_mode` | `"specific" \| "active"` | Always | Never | Enum | Standard discriminator (ADR-003) |
| `vault` | `string` (min 1) | In specific mode | In active mode | `applyTargetModeRefinement` | F7: unknown vault → cli-adapter 011-R5 inspection → `CLI_REPORTED_ERROR` |
| `file` | `string` | Specific mode (XOR with `path`) | In active mode; or with `path` in specific mode | `applyTargetModeRefinement` | Wikilink form (no extension, no folder). Resolved in-eval via `app.metadataCache.getFirstLinkpathDest`. |
| `path` | `string` | Specific mode (XOR with `file`) | In active mode; or with `file` in specific mode | `applyTargetModeRefinement` | Vault-relative path, includes `.md`. Used as `app.vault.getFiles().find(x => x.path === a.path)` lookup. |
| `total` | `boolean` | Never | Never | Type | Default `false`. When `true`, per-entry list is empty; `count` populated identically (FR-005a). |

### Strict-mode top-level
The schema is `targetModeBaseSchema` (which is `.strict()`) extended with `total` and refined. `additionalProperties: false` is the published contract. The clarifications-session-locked unknown-key validation contract (US3 scenario 4) is satisfied by this strict mode.

---

## Output schema

The handler returns `{ count: number, links: LinkEntry[] }` where `LinkEntry = { target, line, kind, displayText? }`. Per the Q1–Q5 commitments:

- **`target`** carries the link target byte-faithful to source, including any `#Heading` or `#^block-id` fragment EMBEDDED in the string (Q2 — no separate field).
- **`line`** is 1-based source line number. For body links and embeds, `position.start.line + 1` from the metadataCache. For frontmatter-declared links, synthetic `line: 1` (per F5 — frontmatterLinks lacks `position`).
- **`kind`** is from the CLOSED THREE-VALUE enum `{wikilink, embed, markdown}` (Q3 — bare URLs are NOT surfaced).
- **`displayText`** is present ONLY when source carries a separate alias — wrapper compares cache's `displayText` to `link` and omits when equal (Q1 + F6).

The exhaustive-fields list is locked: NO `column`, NO `source: "frontmatter" | "body"` discriminator, NO `fragment` field, NO `resolved` flag, NO `original`, NO `endLine` / `endColumn`. Plan-stage implementation MUST NOT silently widen the per-entry shape.

---

## JS template body

```javascript
// FROZEN — the only insertion point is __PAYLOAD_B64__.
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

### Template invariants (locked by handler tests)

1. **Frozen string constant**. No template-literal interpolation; no string concatenation; no `eval`-builder pattern. Only one substitution point: `__PAYLOAD_B64__`.
2. **Synchronous IIFE wrapper**. The template ends with `})()` and the eval CLI returns the resulting value. No `await` needed — metadataCache is synchronous (unlike BI-015 which used async because it read file content via `app.vault.adapter.read`).
3. **Single base64 placeholder**. The handler uses `JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64)` — a single textual replacement of a fixed-position token.
4. **Returns a JSON string**. The template ends with `return JSON.stringify(...)` so `eval`'s `=> ` prefix is followed by a valid JSON string in every code path.
5. **Defensive `|| []` coalescing** (R9 / F10). Each of `c.frontmatterLinks`, `c.links`, `c.embeds` is coalesced to `[]` when undefined. An empty `.md` note (cache `{}`) produces three empty arrays, merged to empty, sorted to empty, emitted as `{ok:true, count:0, links:[]}`.
6. **`f.extension === 'md'` guard** (R7 / F9). Inside-eval rejection of non-`.md` targets. Satisfies FR-014 via the `NOT_MARKDOWN` envelope code.
7. **`_col` strip before emission** (R7 / Q5). The internal `_col` field used for the intra-line tiebreak sort is stripped via `{_col, ...rest}` destructure before emission. The public per-entry shape does NOT carry `column`.
8. **`a.total` branch at the envelope-emission step**. The same entries array is computed in both modes (FR-005a cross-mode invariant by construction); only the envelope's `links` field differs.
9. **displayText omit-when-equal** (R7 / F6 / Q1). The `wrap` helper omits `displayText` from each entry when `displayText === link`. The natural Obsidian shape (always-present, sometimes equal to `link`) is transformed to the contract shape (absent when equal).
10. **Kind synthesis per-array** (R7 / F4). `frontmatterLinks` → always `'wikilink'`; `links[]` → `'wikilink'` or `'markdown'` by `original.startsWith('[[')`; `embeds[]` → always `'embed'`.

---

## Base64 payload assembly

```typescript
// In handler.ts:
const payloadJson = JSON.stringify({
  active: input.target_mode === "active",
  path:   input.target_mode === "specific" ? input.path ?? null : null,
  file:   input.target_mode === "specific" ? input.file ?? null : null,
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
  total:  boolean,                    // true iff input.total === true
}
```

### Test-seam decode (R12)

The handler test's stub `spawnFn` decodes the base64 payload via `Buffer.from(b64, "base64").toString("utf-8")` then `JSON.parse(...)` and asserts the `active` / `path` / `file` / `total` fields round-trip the user's input bit-for-bit. This is the regression test that guarantees R6's anti-injection contract.

---

## Per-tool invariants table

| Invariant | Code location | Test coverage |
|---|---|---|
| Schema is single source of truth (z.infer types) | `schema.ts` | Schema tests assert types via TypeScript compile-time checks |
| target_mode discriminator inherits from `targetModeBaseSchema` | `schema.ts` | Schema tests for specific-no-vault, specific-both-locators, active-with-forbidden-keys |
| Output schema is `{count, links: [...]}` strict; per-entry strict | `schema.ts` | Output-shape assertion in handler happy-path tests |
| Eval envelope is discriminated union with strict mode | `schema.ts` | Handler tests for ok:false × 3 codes; envelope-parse failure case |
| JS template is frozen; only `__PAYLOAD_B64__` substitution | `handler.ts` | Handler tests assert `code` arg starts with frozen prefix and ends with frozen suffix; only the b64 region varies |
| Single `invokeCli` invocation per request (R3) | `handler.ts` | Handler tests assert spawn-stub was called exactly once per request |
| Base64 payload round-trips user input verbatim (R6) | `handler.ts` | Handler tests decode b64 + JSON.parse and assert payload matches user input |
| Two-stage parse failures map to `CLI_REPORTED_ERROR` with `details.stage` | `handler.ts` | Handler tests for json-parse failure, envelope-parse failure |
| Envelope `ok: false` codes map per R13 table | `handler.ts` | Handler tests for each ok:false → UpstreamError mapping (NO_ACTIVE_FILE / FILE_NOT_FOUND / NOT_MARKDOWN) |
| Unknown vault → `CLI_REPORTED_ERROR` via cli-adapter 011-R5 (R5 / F7) | `cli-adapter.ts` (inherited) | Handler test for "Vault not found." stub response |
| Active-mode locator strip (defence-in-depth) | `cli-adapter.ts` (inherited) | Already covered by cli-adapter tests; not duplicated here |
| 10 MiB output cap fires with `CLI_NON_ZERO_EXIT` | `cli-adapter.ts` (inherited) | Handler test for cap-trigger stub response |
| Kind classification: wikilink/embed/markdown via `original` prefix or origin-array (F4) | `handler.ts` JS_TEMPLATE | Handler tests with mixed-link fixtures verify per-entry kind values |
| Line numbering: `position.start.line + 1` for body; `line: 1` for frontmatter (F3 / F5) | `handler.ts` JS_TEMPLATE | Handler tests verify line values via stub-cache fixtures |
| displayText omit-when-equal-to-target (F6 / Q1) | `handler.ts` JS_TEMPLATE | Handler tests assert displayText present iff alias differs |
| Per-occurrence semantic — no dedup-by-target (FR-007) | `handler.ts` JS_TEMPLATE | Handler test with same-target on multiple lines verifies separate entries |
| Source-order sort with intra-line column-ascending tiebreak (FR-008 / R8) | `handler.ts` JS_TEMPLATE | Handler test with same-line-twice fixture verifies left-to-right order |
| `_col` internal-only, stripped before emission (Q5) | `handler.ts` JS_TEMPLATE | Handler test asserts no `column` key in any emitted entry |
| Frontmatter-link inclusion with synthetic line=1 (Q4 / F5) | `handler.ts` JS_TEMPLATE | Handler test with frontmatter fixture verifies inclusion + line=1 |
| Empty `.md` file returns `{count:0, links:[]}` (FR-009 / R9 / F10) | `handler.ts` JS_TEMPLATE | Handler test with empty-cache stub |
| Non-`.md` target rejection via `NOT_MARKDOWN` envelope code (FR-014 / F9) | `handler.ts` JS_TEMPLATE | Handler test with `.canvas` / `.png` stub |
| Cross-mode invariant (FR-005a / R11) | `handler.ts` | Handler test invokes with `total:false` and `total:true` on same stub-cache; asserts equal `count` |
| Registration via `registerTool` factory (FR-018) | `index.ts` | Registration tests for descriptor name, stripped schema, doc presence |
| Original-no-upstream attribution header on every new file (FR-022) | `schema.ts`, `handler.ts`, `index.ts`, three `*.test.ts` | Lint/grep step in tasks.md |

---

## Module LOC budget

| File | Approximate LOC | Notes |
|---|---|---|
| `src/tools/links/schema.ts` | ~55 | Input schema (8 LOC) + linkEntry schema (10 LOC) + output schema (5 LOC) + envelope schema (15 LOC) + linkKindEnum (3 LOC) + types/exports (10 LOC) + header (4 LOC) |
| `src/tools/links/handler.ts` | ~110 | JS_TEMPLATE constant (~30 LOC formatted) + payload assembly (~10 LOC) + invokeCli call (~10 LOC) + two-stage parse + envelope mapping (~40 LOC) + types/exports (~15 LOC) + header (4 LOC) |
| `src/tools/links/index.ts` | ~30 | createLinksTool factory (~15 LOC) + descriptor (~10 LOC) + types/exports (~5 LOC) |
| **Total source** | **~195 LOC** | Slightly under BI-015's ~205 — no async file read, no Setext filter, smaller envelope. |
| `src/tools/links/schema.test.ts` | ~360 | 18 cases × ~20 LOC |
| `src/tools/links/handler.test.ts` | ~620 | 28 cases × ~22 LOC (more elaborate per case due to base64 round-trip assertions and mixed-fixture stubs) |
| `src/tools/links/index.test.ts` | ~140 | 5 cases × ~28 LOC |
| **Total tests** | **~1120 LOC** | Total ~1310 LOC for source + tests; comparable to BI-015's ~1165. |

---

## Test inventory (planned)

### `schema.test.ts` — 18 cases

1. happy: specific + vault + path → parse OK
2. happy: specific + vault + file (basename) → parse OK
3. happy: specific + vault + path + `total: true` → parse OK
4. happy: specific + vault + path + `total: false` → parse OK
5. happy: active (no other fields) → parse OK
6. happy: active + `total: true` → parse OK
7. fail: specific without vault → ZodError, dispatcher spy never called
8. fail: specific without file and without path → ZodError
9. fail: specific with BOTH file AND path → ZodError (XOR)
10. fail: active with vault → ZodError
11. fail: active with file → ZodError
12. fail: active with path → ZodError
13. fail: unknown top-level key (e.g. `filter`) → ZodError (strict mode)
14. fail: `total` as string `"true"` → ZodError
15. fail: `target_mode` missing → ZodError
16. fail: `target_mode: "focused"` (unknown enum value) → ZodError
17. fail: `vault` set to empty string `""` → ZodError
18. fail: schema output round-trips through `toMcpInputSchema` without losing `target_mode` constraint

### `handler.test.ts` — 28 cases

**Happy paths**

1. specific + path + mixed links (wikilink / embed / markdown / frontmatter) → 4-entry response, kinds match, lines in source order, frontmatter entry first at line=1
2. specific + file (basename) → resolves via `getFirstLinkpathDest`; same response as case 1 for the same file
3. specific + path + `total: true` → `{count:N, links:[]}` for the same fixture
4. specific + path + empty `.md` file → `{count:0, links:[]}` (R9)
5. active + focused-file fixture → response matches what specific-mode would return for the same file
6. active + `total: true` + focused-file fixture → count-only response

**Per-entry shape transforms**

7. bare wikilink `[[Roadmap]]` → entry with `kind:'wikilink'`, NO `displayText` (omit-when-equal per Q1 / F6)
8. aliased wikilink `[[Glossary|Terms]]` → entry with `kind:'wikilink'`, `displayText:'Terms'`
9. wiki-style embed `![[diagrams/system.png]]` → entry with `kind:'embed'`, NO `displayText`
10. markdown embed `![alt](image.png)` → entry with `kind:'embed'`, `displayText:'alt'`
11. markdown link `[Note](Other-Note.md)` → entry with `kind:'markdown'`, `displayText:'Note'`
12. wikilink with heading fragment `[[Target#Heading]]` → entry with `target:'Target#Heading'` (embedded — Q2)
13. wikilink with block fragment `[[Target#^block-id]]` → entry with `target:'Target#^block-id'`
14. frontmatter wikilink `related: "[[Other-Note]]"` → entry with `kind:'wikilink'`, `line:1`, NO `displayText`

**Per-occurrence + sort**

15. same target on two different lines → two entries, same `target`, different `line` values, source order
16. same target twice on one line → two entries, same `target` + same `line`, ordered left-to-right (verified via `_col` internal sort)
17. mixed body + frontmatter fixture: frontmatter entries appear first (line=1), body entries follow in line-ascending order
18. emitted entries do NOT carry a `column` / `_col` field (Q5 verification)

**Cross-mode invariant**

19. invoke same fixture with `total: false` then `total: true`; assert equal `count` values (FR-005a / R11)

**Error paths**

20. specific + `vault: "Unknown"` → cli-adapter 011-R5 inspection → `CLI_REPORTED_ERROR` (R5 / F7)
21. specific + unresolved `path` → envelope `FILE_NOT_FOUND` → `CLI_REPORTED_ERROR(stage: envelope-error, code: FILE_NOT_FOUND)`
22. specific + unresolved `file` (basename) → envelope `FILE_NOT_FOUND` (via getFirstLinkpathDest null)
23. specific + `.canvas` file → envelope `NOT_MARKDOWN` → `CLI_REPORTED_ERROR(stage: envelope-error, code: NOT_MARKDOWN)` (F9)
24. active + no focused file → envelope `NO_ACTIVE_FILE` → `ERR_NO_ACTIVE_FILE` OR `CLI_REPORTED_ERROR(stage: envelope-error, code: NO_ACTIVE_FILE)` (R13)
25. malformed eval stdout (non-JSON) → `CLI_REPORTED_ERROR(stage: 'json-parse')`
26. malformed envelope (unknown key in `ok:true` branch) → `CLI_REPORTED_ERROR(stage: 'envelope-parse')`
27. 10 MiB output cap kill → `CLI_NON_ZERO_EXIT` (R10)

**Argv / payload invariants**

28. base64 payload decode + `code` arg starts with frozen prefix + only `__PAYLOAD_B64__` region varies + single `invokeCli` call per request (R3 / R6 / R12)

### `index.test.ts` — 5 cases

1. descriptor name is `"links"` (post-022 single-word convention per FR-001)
2. stripped schema (no descriptions) is published per ADR-005
3. `docs/tools/links.md` exists per assertToolDocsExist (FR-018)
4. tool registered in alphabetical position between `files` and `obsidian_exec` in the registry walk
5. FR-018 baseline drift detector test fails until `npm run baseline:write` runs

### Test total

**51 cases** (18 schema / 28 handler / 5 registration), exceeding SC-020's floor of 20. Higher than BI-024's 45 because of the eval-driven complexity (envelope error codes × 3, payload round-trip assertions, three transform invariants × multiple link kinds).

---

## Architectural delta map vs predecessors

| Aspect | This feature (`links`) | BI-015 (`read_heading`) | BI-014 (`find_by_property`) | BI-024 (`properties`) |
|---|---|---|---|---|
| CLI subcommand | `eval` (R2 / F1) | `eval` | `eval` | native `properties` |
| `target_mode` | YES (specific / active) | YES | NO (vault-only operator-shape) | NO (vault-only) |
| `total` count-only mode | YES | NO | NO | YES |
| Empty-list contract | natural via `\|\| []` | N/A | natural (empty array) | natural (empty array) |
| Unknown-vault outcome | structured error (R5 / F7) | structured error | structured error | inherited limitation |
| Per-entry transforms | 3 (kind / line+1 / displayText-omit) | 1 (body slice) | 1 (path map) | 2 (drop type / rename count) |
| Wrapper-side post-fetch sort | NO (sort intra-eval) | N/A | NO (upstream order) | YES (case-insensitive) |
| Frontmatter inclusion | YES (Q4 / F5) | N/A | N/A | N/A |
| Eval template async | NO (sync IIFE — metadataCache is sync) | YES (async — reads file content) | YES (async) | N/A |
| Anti-injection | base64 payload | base64 payload | base64 payload | natural data-passing |

**Distinctive risk surface**: the three per-entry transforms (kind / line+1 / displayText-omit) plus the frontmatter inclusion plus the cross-mode invariant give this BI more wrapper-side logic per entry than any predecessor. Mitigated by the eval JS being a frozen ~30 LOC string constant with handler tests that lock every transform via stub-cache fixtures. The base64 payload round-trip assertion locks R6 structurally.
