# Data Model — `read_heading` Typed MCP Tool

**Feature**: [015-read-heading](./spec.md)
**Date**: 2026-05-09

This document is the Phase 1 design artefact for `read_heading`. It records the input schema shape, the output schema shape, the eval-envelope wire-format schema, the JS template body, the base64 payload assembly, the per-tool invariants table, the module LOC budget, and the test inventory. The schemas defined here are the SINGLE SOURCE OF TRUTH for the runtime parse, the published JSON Schema (via `zod-to-json-schema`), AND the inferred TypeScript types (via `z.infer`) per Constitution Principle III.

---

## Input schema

```typescript
// src/tools/read_heading/schema.ts

import { z } from "zod";
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const HEADING_PATH_SEPARATOR = "::";

/**
 * Structural-only heading-path validator (FR-006 / FR-007).
 * Splits on "::", requires >=2 segments, requires every segment to be non-empty.
 * Does NOT verify heading existence — semantic resolution happens at execution time.
 */
export function validateHeadingPath(value: string): true | string {
  const segments = value.split(HEADING_PATH_SEPARATOR);
  if (segments.length < 2) {
    return "heading must contain at least two `::`-separated segments (e.g. \"H1::H2\")";
  }
  if (segments.some((s) => s.length === 0)) {
    return "heading segments must be non-empty (no leading/trailing `::`, no consecutive `::`)";
  }
  return true;
}

export const readHeadingInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    heading: z.string().min(1).refine(
      (v) => validateHeadingPath(v) === true,
      (v) => ({ message: validateHeadingPath(v) as string }),
    ),
  }),
);

export const readHeadingOutputSchema = z
  .object({
    content: z.string(),
  })
  .strict();

/**
 * Wire-format envelope from the eval JS template (R13).
 * Discriminated union on `ok`. Strict mode rejects unknown keys to lock the
 * wire contract.
 */
export const READ_HEADING_EVAL_ERROR_CODES = [
  "FILE_NOT_FOUND",
  "HEADING_NOT_FOUND",
  "NO_ACTIVE_FILE",
] as const;
export type ReadHeadingEvalErrorCode = (typeof READ_HEADING_EVAL_ERROR_CODES)[number];

export const readHeadingEvalResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true),  content: z.string() }).strict(),
  z.object({
    ok: z.literal(false),
    code: z.enum(READ_HEADING_EVAL_ERROR_CODES),
    detail: z.string(),
  }).strict(),
]);

export type ReadHeadingInput = z.infer<typeof readHeadingInputSchema>;
export type ReadHeadingOutput = z.infer<typeof readHeadingOutputSchema>;
export type ReadHeadingEvalResponse = z.infer<typeof readHeadingEvalResponseSchema>;
```

### Field policy table

| Field | Type | Required | When forbidden | Validator | Notes |
|---|---|---|---|---|---|
| `target_mode` | `"specific" \| "active"` | Always | Never | Enum | Standard discriminator (ADR-003) |
| `vault` | `string` (min 1) | In specific mode | In active mode | `applyTargetModeRefinement` | Inherited limitation: `eval` ignores `vault=`; runs against focused vault. Documented. |
| `file` | `string` | Specific mode (XOR with `path`) | In active mode; or with `path` in specific mode | `applyTargetModeRefinement` | Wikilink form (no extension, no folder). Resolved in-eval via `app.metadataCache.getFirstLinkpathDest`. |
| `path` | `string` | Specific mode (XOR with `file`) | In active mode; or with `file` in specific mode | `applyTargetModeRefinement` | Vault-relative path, includes `.md`. Used directly as `app.metadataCache.fileCache[path]` key. |
| `heading` | `string` (min 1) | Always | Never | `.refine(validateHeadingPath)` | ≥2 non-empty `::`-separated segments. Structural only — heading existence is checked at execution. |

### Strict-mode top-level
The schema is `targetModeBaseSchema` (which is `.strict()`) extended with `heading` and refined. `additionalProperties: false` is the published contract. The 2026-05-09 Q&A on "unknown top-level keys" (US3 scenario 10) is satisfied by this strict mode.

---

## Output schema

The handler returns `{ content: string }`. The string is the body bytes of the matched heading, sliced from the on-disk file content per FR-010 / FR-019 / FR-020. CRLF or LF line endings round-trip verbatim.

---

## JS template body

```javascript
// FROZEN — the only insertion point is __PAYLOAD_B64__.
const JS_TEMPLATE = `(async()=>{
const a=JSON.parse(atob('__PAYLOAD_B64__'));
let resolvedPath;
if(a.active){
  const f=app.workspace.getActiveFile();
  if(!f)return JSON.stringify({ok:false,code:'NO_ACTIVE_FILE',detail:'No note focused; switch to specific mode or focus a note.'});
  resolvedPath=f.path;
}else if(a.path){
  resolvedPath=a.path;
}else{
  const dest=app.metadataCache.getFirstLinkpathDest(a.file,'');
  if(!dest)return JSON.stringify({ok:false,code:'FILE_NOT_FOUND',detail:'wikilink: '+a.file});
  resolvedPath=dest.path;
}
const fc=app.metadataCache.fileCache[resolvedPath];
if(!fc)return JSON.stringify({ok:false,code:'FILE_NOT_FOUND',detail:'path: '+resolvedPath});
const mc=app.metadataCache.metadataCache[fc.hash];
const allHeadings=(mc&&mc.headings)||[];
const text=await app.vault.adapter.read(resolvedPath);
// R14 — Setext exclusion (defence-in-depth ATX-only filter).
const headings=allHeadings.filter(h=>text.charAt(h.position.start.offset)==='#');
const stack=[];
let matchIdx=-1;
for(let i=0;i<headings.length;i++){
  const h=headings[i];
  stack.length=h.level-1;
  stack[h.level-1]=h.heading;
  if(stack.length===a.segments.length){
    let allMatch=true;
    for(let j=0;j<a.segments.length;j++){
      if(stack[j]!==a.segments[j]){allMatch=false;break;}
    }
    if(allMatch){matchIdx=i;break;}
  }
}
if(matchIdx===-1)return JSON.stringify({ok:false,code:'HEADING_NOT_FOUND',detail:'segments: '+a.segments.join('::')+' not found in '+resolvedPath});
const startOffset=headings[matchIdx].position.end.offset;
const endOffset=matchIdx+1<headings.length?headings[matchIdx+1].position.start.offset:text.length;
let body=text.slice(startOffset,endOffset);
// Strip leading line terminator (the \\r\\n or \\n right after the heading line).
if(body.startsWith('\\r\\n'))body=body.slice(2);
else if(body.startsWith('\\n'))body=body.slice(1);
return JSON.stringify({ok:true,content:body});
})()`;
```

### Template invariants (locked by handler tests)

1. **Frozen string constant**. No template-literal interpolation; no string concatenation; no `eval`-builder pattern. Only one substitution point: `__PAYLOAD_B64__`.
2. **Async IIFE wrapper**. The template ends with `})()` and the eval CLI awaits the resulting Promise.
3. **Single base64 placeholder**. The handler uses `JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64)` — a single textual replacement of a fixed-position token.
4. **Returns a JSON string**. The template ends with `return JSON.stringify(...)` so `eval`'s `=> ` prefix is followed by a valid JSON string in every code path.
5. **Setext defence-in-depth filter** (R14). The `text.charAt(h.position.start.offset) === '#'` check defends against Obsidian's metadataCache including Setext entries on some versions. If Obsidian's behaviour is ATX-only, the filter is a no-op; if Obsidian includes Setext, the filter functionally enforces FR-012.
6. **Leading-line-terminator strip**. The `\r\n` or `\n` immediately after the heading line (between `position.end.offset` and the body's first prose char) is stripped so the returned body starts with the prose content. This is part of the FR-010 contract — "from the line AFTER the matched heading marker."
7. **First-match wins**. The `for` loop `break`s on the first segment-path match. FR-017 first-document-order convention.

---

## Base64 payload assembly

```typescript
// In handler.ts:
const payloadJson = JSON.stringify({
  active: input.target_mode === "active",
  path:   input.target_mode === "specific" ? input.path ?? null : null,
  file:   input.target_mode === "specific" ? input.file ?? null : null,
  segments: input.heading.split(HEADING_PATH_SEPARATOR),
});
const payloadB64 = Buffer.from(payloadJson, "utf-8").toString("base64");
const code = JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64);
```

### Payload shape

```typescript
{
  active: boolean,                    // true iff target_mode === "active"
  path: string | null,                // input.path in specific mode, else null
  file: string | null,                // input.file in specific mode, else null
  segments: string[],                 // input.heading.split("::")
}
```

### Test-seam decode (R12)
The handler test's stub `spawnFn` decodes the base64 payload via `Buffer.from(b64, "base64").toString("utf-8")` then `JSON.parse(...)` and asserts the `segments` / `path` / `file` / `active` fields round-trip the user's input bit-for-bit. This is the regression test that guarantees R6's anti-injection contract.

---

## Per-tool invariants table

| Invariant | Code location | Test coverage |
|---|---|---|
| Schema is single source of truth (z.infer types) | `schema.ts` | Schema tests assert types via TypeScript compile-time checks |
| Heading-path validator is structural only (no semantic resolution) | `schema.ts` `validateHeadingPath` | Schema tests for 1-segment/empty-segment cases assert no CLI call (dispatcher spy) |
| target_mode discriminator inherits from `targetModeBaseSchema` | `schema.ts` | Schema tests for specific-no-vault, specific-both-locators, active-with-forbidden-keys |
| Output schema is `{content: string}` strict | `schema.ts` | Output-shape assertion in handler happy-path tests |
| Eval envelope is discriminated union with strict mode | `schema.ts` | Handler tests for ok:false × 3 codes; envelope-parse failure case |
| JS template is frozen; only `__PAYLOAD_B64__` substitution | `handler.ts` | Handler tests assert `code` arg starts with frozen prefix and ends with frozen suffix; only the b64 region varies |
| Single `invokeCli` invocation per request (R3) | `handler.ts` | Handler tests assert spawn-stub was called exactly once per request |
| Base64 payload round-trips user input verbatim (R6) | `handler.ts` | Handler tests decode b64 + JSON.parse and assert payload matches user input |
| Two-stage parse failures map to `CLI_REPORTED_ERROR` with `details.stage` | `handler.ts` | Handler tests for json-parse failure, envelope-parse failure |
| Envelope `ok: false` codes map per R13 table | `handler.ts` | Handler tests for each ok:false → UpstreamError mapping |
| Unknown vault → `CLI_REPORTED_ERROR` via cli-adapter 011-R5 | `cli-adapter.ts` (inherited) | Handler test for "Vault not found." stub response |
| Active-mode locator strip (defence-in-depth) | `cli-adapter.ts` (inherited) | Already covered by cli-adapter tests; not duplicated here |
| 10 MiB output cap fires with `CLI_NON_ZERO_EXIT` | `cli-adapter.ts` (inherited) | Handler test for cap-trigger stub response |
| Registration via `registerTool` factory (FR-023) | `index.ts` | Registration tests for descriptor name, stripped schema, doc presence |
| Original-no-upstream attribution header on every new file (FR-027) | `schema.ts`, `handler.ts`, `index.ts`, three `*.test.ts` | Lint/grep step in tasks.md |

---

## Module LOC budget

| File | Approximate LOC | Notes |
|---|---|---|
| `src/tools/read_heading/schema.ts` | ~50 | Input schema (15 LOC) + output schema (5 LOC) + envelope schema (15 LOC) + validateHeadingPath helper (10 LOC) + types/exports (5 LOC) |
| `src/tools/read_heading/handler.ts` | ~125 | JS_TEMPLATE constant (~50 LOC formatted) + payload assembly (~10 LOC) + invokeCli call (~10 LOC) + two-stage parse + envelope mapping (~40 LOC) + types/exports (~15 LOC) |
| `src/tools/read_heading/index.ts` | ~30 | createReadHeadingTool factory (~15 LOC) + descriptor (~10 LOC) + types/exports (~5 LOC) |
| **Total source** | **~205 LOC** | (Plan estimated 210; close.) |
| `src/tools/read_heading/schema.test.ts` | ~280 | 20 cases × ~14 LOC |
| `src/tools/read_heading/handler.test.ts` | ~580 | 30 cases × ~19 LOC (handler tests are larger because each case sets up a stub spawn + asserts parse path + checks envelope/error mapping) |
| `src/tools/read_heading/index.test.ts` | ~100 | 5 cases × ~20 LOC |
| **Total tests** | **~960 LOC** | Higher than 014's ~500 because the handler test surface is larger (target_mode discriminator × error envelope × segment-matching characterisation). |

**Aggregate-coverage gate**: the new tests provide near-100% coverage of the new module (~205 source LOC / ~960 test LOC). The vitest aggregate statements floor (89.6% per [vitest.config.ts:20](../../vitest.config.ts#L20)) is preserved or ratcheted up.

---

## Test inventory

### Schema tests (20 cases)

**target_mode discriminator** (8 cases — inherits from `target-mode.test.ts` baseline; this layer adds tool-specific coverage):
1. `target_mode: "specific"` with no `vault` → VALIDATION_ERROR
2. `target_mode: "specific"` with no `file` AND no `path` → VALIDATION_ERROR
3. `target_mode: "specific"` with both `file` AND `path` → VALIDATION_ERROR
4. `target_mode: "active"` with `vault` set → VALIDATION_ERROR
5. `target_mode: "active"` with `file` set → VALIDATION_ERROR
6. `target_mode: "active"` with `path` set → VALIDATION_ERROR
7. `target_mode: "specific"` with `vault` + `path` + `heading` → PASS (returns parsed input)
8. `target_mode: "active"` with `heading` only → PASS

**heading structural validator** (8 cases):
9. `heading: ""` (empty string) → VALIDATION_ERROR (z.string().min(1))
10. `heading` field omitted → VALIDATION_ERROR (z.string() required)
11. `heading: "Foo"` (single segment, no `::`) → VALIDATION_ERROR (validateHeadingPath: <2 segments)
12. `heading: "::Foo"` (leading empty segment) → VALIDATION_ERROR (validateHeadingPath: empty segment)
13. `heading: "Bar::"` (trailing empty segment) → VALIDATION_ERROR
14. `heading: "A::::B"` (interior empty segment from consecutive `::`) → VALIDATION_ERROR
15. `heading: "A::B"` (valid 2-segment) → PASS
16. `heading: "A::B::C::D::E::F"` (valid 6-segment, max nesting matches H6) → PASS

**Other** (4 cases):
17. Unknown top-level key (e.g. `{ ..., foo: "bar" }`) → VALIDATION_ERROR (additionalProperties: false)
18. Output schema rejects extra keys (e.g. `{ content: "x", extra: "y" }`) → safeParse fails
19. Output schema rejects non-string content (e.g. `{ content: 123 }`) → safeParse fails
20. Eval envelope schema discriminator: `{ok: true}` without `content` → safeParse fails; `{ok: false}` without `code` → fails; `{ok: false, code: "OTHER"}` → fails (enum constraint)

### Handler tests (30 cases)

**Happy path × file resolution × target_mode** (4 cases):
21. specific + path + 2-segment heading → returns `{content}` body bytes verbatim
22. specific + path + 3-segment nested heading → returns nested body bytes
23. specific + file (wikilink) + heading → resolves via stub `getFirstLinkpathDest`, returns body
24. active + heading → resolves via stub `getActiveFile`, returns body

**Body terminators** (4 cases):
25. Body terminated by sibling-level heading → body slice excludes sibling heading
26. Body terminated by higher-level heading → body slice excludes parent
27. Body terminated by child-level heading → body slice excludes child subtree (US1 scenario 2)
28. Body terminated by EOF (no further headings) → body slice extends to text.length

**Edge content cases** (4 cases):
29. Empty body (heading followed directly by next heading) → `{content: ""}` with no error
30. Fenced code block opacity (Obsidian's pre-parsing excludes inside-fence headings from the headings array; verified via stub heading metadata that excludes the inside-fence position)
31. Setext exclusion (R14 defence-in-depth): stub heading metadata that includes a Setext entry; assert the JS template's `text.charAt(start.offset) === '#'` filter excludes it
32. Duplicate heading paths → first-document-order match (stub headings array has two entries with same path; assert handler returns the first)

**Segment matching characterisation (FR-028)** (5 cases):
33. Closing-ATX form: stub heading `"Heading"` (Obsidian post-strip); user segment `"Heading"` matches
34. Surrounding whitespace: stub heading `"Heading"` (Obsidian post-trim); user segment `"Heading"` matches
35. Inline markdown survives: stub heading `"My **Bold** Heading"`; user segment `"My **Bold** Heading"` matches; user segment `"My Bold Heading"` returns HEADING_NOT_FOUND
36. Anchor survives: stub heading `"Section ^anchor-id"`; user segment `"Section ^anchor-id"` matches; user segment `"Section"` returns HEADING_NOT_FOUND
37. Mis-cased segment: stub heading `"Heading"`; user segment `"heading"` returns HEADING_NOT_FOUND

**CRLF / LF line endings** (2 cases):
38. CRLF fixture: file content contains `\r\n`; assert returned `content` contains `\r\n` byte-faithfully
39. LF fixture: file content contains `\n`; assert returned `content` contains `\n` byte-faithfully

**Envelope ok:false cases** (3 cases):
40. Stub eval response: `=> {"ok":false,"code":"FILE_NOT_FOUND","detail":"path: x.md"}` → handler throws `UpstreamError({code: "CLI_REPORTED_ERROR", details: {stage: "envelope-error", code: "FILE_NOT_FOUND", detail}})`
41. Stub: `{"ok":false,"code":"HEADING_NOT_FOUND","detail":"..."}` → similar
42. Stub: `{"ok":false,"code":"NO_ACTIVE_FILE","detail":"..."}` → handler throws `UpstreamError({code: "ERR_NO_ACTIVE_FILE", details: {stage: "envelope-error", detail}})`

**Parse failures** (2 cases):
43. Stub eval response: `=> not-valid-json{` → handler throws `UpstreamError({code: "CLI_REPORTED_ERROR", details: {stage: "json-parse"}})`
44. Stub eval response: `=> {"ok":true}` (missing `content`) → envelope-schema-parse fails → `UpstreamError({code: "CLI_REPORTED_ERROR", details: {stage: "envelope-parse"}})`

**UpstreamError pass-through (cli-adapter inheritance)** (3 cases):
45. Stub spawn returns "Vault not found." stdout exit 0 → cli-adapter's 011-R5 reclassifies → `UpstreamError({code: "CLI_REPORTED_ERROR"})` propagates unchanged through handler
46. Stub spawn returns "Error: no active file" stdout exit 0 → dispatch-layer reclassifies → `UpstreamError({code: "ERR_NO_ACTIVE_FILE"})` propagates unchanged
47. Stub spawn returns 10 MiB+ stdout (cap trigger) → `UpstreamError({code: "CLI_NON_ZERO_EXIT"})` propagates unchanged

**Wire shape lock (R6 / R12)** (3 cases):
48. Argv shape in specific mode: `["vault=<v>", "eval", "code=<...>"]`
49. Argv shape in active mode: `["eval", "code=<...>"]`; assert no `vault=` prefix
50. Base64 payload decode + JSON.parse round-trips user input bit-for-bit (segments, path, file, active)

### Registration tests (5 cases)

51. `createReadHeadingTool({logger, queue}).descriptor.name === "read_heading"`
52. The descriptor's `inputSchema` has had `description` fields stripped per `stripSchemaDescriptions`
53. The help facility's tool list includes `read_heading` (verified via the `005-help-tool` registry walk)
54. `docs/tools/read_heading.md` exists AND contains the required sections (input contract, output, error roster, ≥4 worked examples) — verified via the `005-help-tool` content-completeness check + the `assertToolDocsExist` aggregator
55. The drift-detector parameterised test at `src/tools/_register.test.ts` walks the registered tools and confirms `read_heading` follows the registration contract (factory shape, descriptor structure, schema parse path)

**Total: 20 + 30 + 5 = 55 cases.**

---

## Cross-cutting

- **Zero new error codes** (FR-022 / Constitution Principle IV). All failures route through `VALIDATION_ERROR`, `CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`. The envelope's `code` field is a `details.code` discriminator inside `CLI_REPORTED_ERROR`, NOT a new error code at the wrapper layer.
- **Zero new ADRs**. ADR-003 (Enforce Target Mode in Typed Tools) is satisfied. ADR-005 (Token-Optimized Tool Definitions) auto-applied via `stripSchemaDescriptions`. ADR-006 (Centralized Tool Registration) followed via `registerTool` factory.
- **008-refactor surface frozen**. No edits to `dispatchCli`, `invokeCli`, `invokeBoundedCli`, `assertToolDocsExist`, `obsidian_exec` argv contract, or the 011-R5 unknown-vault response-inspection clause.
- **`read_note` / `write_note` / `delete_note` / `read_property` / `find_by_property` / `obsidian_exec` / `help` byte-stable** (SC-016). Only `src/server.ts` registration list grows by two lines (one import, one tools-array entry, alphabetical position between `obsidian_exec` and `read_note`).
- **Post-010 consolidated drift detector** at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) auto-covers `read_heading` via its `it.each` registry walk — no test-file modifications required.
