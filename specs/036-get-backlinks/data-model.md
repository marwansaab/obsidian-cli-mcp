# Data Model: Backlinks

**Branch**: `036-get-backlinks`
**Date**: 2026-05-17
**Phase**: 1 (Design)

This document defines the runtime shapes carried across the `backlinks` tool's surfaces: the typed input schema, the typed output envelope, the eval-wire envelope, the frozen JS template's payload shape, and the inherited per-call infrastructure. Each shape is anchored to a zod schema; zod is the single source of truth per Constitution Principle III.

## Module layout

```text
src/tools/backlinks/
├── _template.ts          # JS_TEMPLATE (frozen string) + base64 payload boundary
├── schema.ts             # backlinksInputSchema, backlinksOutputSchema, backlinksEvalResponseSchema
├── schema.test.ts        # ~22 schema cases
├── handler.ts            # executeBacklinks (single invokeCli + parse + envelope mapping)
├── handler.test.ts       # ~30 handler cases
├── index.ts              # createBacklinksTool factory + BACKLINKS_TOOL_NAME + BACKLINKS_DESCRIPTION
└── index.test.ts         # ~5 registration cases
```

LOC budget: ~220 production / ~1200 tests.

## Input shape (`backlinksInputSchema`)

```ts
import { z } from "zod";
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const backlinksInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    with_counts: z.boolean().optional(),
    total: z.boolean().optional(),
    limit: z.number().int().min(1).max(10000).optional(),
  }),
);

export type BacklinksInput = z.infer<typeof backlinksInputSchema>;
```

The `target_mode` discriminator is the ADR-003 contract (`specific` requires `vault` + exactly one of `file` / `path`; `active` forbids `vault` / `file` / `path`). The three additional optional fields layer the BI's three opt-in semantics:

| Field | Type | Default | Effect |
|-------|------|---------|--------|
| `with_counts` | `boolean` | `false` | When `true`, each per-source entry carries an integer `count` aggregating all references from that source. Default omits the field for minimal payload. |
| `total` | `boolean` | `false` | When `true`, response carries the count only — `backlinks: []`. Per Q1 (2026-05-17), bypasses the FR-010 cap and reports the FULL pre-cap source-note count. |
| `limit` | `integer` (1..10000) | `1000` (implicit) | Caps `backlinks.length` to this value. Only applies when `total: false`. |

The schema's `.strict()` enforcement (inherited from `targetModeBaseSchema.extend(...)`) rejects unknown top-level keys (FR-006).

### Runtime invariants checked by the schema

- `target_mode === "specific"` → `vault` is present AND exactly one of `file` / `path` is present.
- `target_mode === "active"` → none of `vault`, `file`, `path` are present.
- `limit` is an integer in `[1, 10000]` — non-integer, zero, negative, or > 10000 rejected.
- `with_counts` and `total` are booleans — string `"true"`, integer `1`, etc. rejected.
- Unknown top-level keys rejected (Q3 strict).

### Inferred TypeScript type (consumed downstream)

```ts
type BacklinksInput =
  | { target_mode: "specific"; vault: string; file: string; with_counts?: boolean; total?: boolean; limit?: number }
  | { target_mode: "specific"; vault: string; path: string; with_counts?: boolean; total?: boolean; limit?: number }
  | { target_mode: "active"; with_counts?: boolean; total?: boolean; limit?: number };
```

## Output shape (`backlinksOutputSchema`)

```ts
export const backlinkEntrySchema = z
  .object({
    source: z.string(),
    count: z.number().int().positive().optional(),
  })
  .strict();

export const backlinksOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    backlinks: z.array(backlinkEntrySchema),
    truncated: z.boolean().optional(),
  })
  .strict();

export type BacklinkEntry = z.infer<typeof backlinkEntrySchema>;
export type BacklinksOutput = z.infer<typeof backlinksOutputSchema>;
```

Three observable variants (all conform to the same schema):

### Variant A — Default (no per-source counts)

```json
{
  "count": 3,
  "backlinks": [
    { "source": "Notes/Alpha.md" },
    { "source": "Notes/Beta.md" },
    { "source": "Projects/Gamma.md" }
  ]
}
```

### Variant B — `with_counts: true`

```json
{
  "count": 3,
  "backlinks": [
    { "source": "Notes/Alpha.md", "count": 1 },
    { "source": "Notes/Beta.md", "count": 5 },
    { "source": "Projects/Gamma.md", "count": 2 }
  ]
}
```

### Variant C — `total: true`

```json
{
  "count": 3,
  "backlinks": []
}
```

### Variant D — Truncated (default or `with_counts: true`, NOT `total: true`)

```json
{
  "count": 1000,
  "backlinks": [ /* 1000 entries */ ],
  "truncated": true
}
```

`truncated` is ABSENT in Variants A / B / C when the underlying source set fits the applied cap; ABSENT in Variant C always (per Q1 — count-only mode never clips).

## Eval-wire envelope (`backlinksEvalResponseSchema`)

```ts
export const BACKLINKS_EVAL_ERROR_CODES = [
  "NO_ACTIVE_FILE",
  "FILE_NOT_FOUND",
  "NOT_MARKDOWN",
] as const;
export type BacklinksEvalErrorCode = (typeof BACKLINKS_EVAL_ERROR_CODES)[number];

export const backlinksEvalResponseSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      count: z.number().int().nonnegative(),
      backlinks: z.array(backlinkEntrySchema),
      truncated: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      code: z.enum(BACKLINKS_EVAL_ERROR_CODES),
      detail: z.string(),
    })
    .strict(),
]);

export type BacklinksEvalResponse = z.infer<typeof backlinksEvalResponseSchema>;
```

The eval JS emits exactly one of the two variants. The handler's `safeParse` step is the contract assertion against any future drift in the eval template (`json-parse` and `envelope-parse` failure paths surface as `CLI_REPORTED_ERROR` with `details.stage` discriminators).

## Frozen JS template (`_template.ts`)

```ts
import { B64_PAYLOAD_DECODE_EXPR } from "../_shared.js";

export const JS_TEMPLATE = `(()=>{
const a=JSON.parse(${B64_PAYLOAD_DECODE_EXPR});
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
const dict=app.metadataCache.getBacklinksForFile(f);
const data=(dict&&dict.data)||{};
const sources=Object.keys(data).filter(p=>/\\.md$/i.test(p)).sort();
const preCapCount=sources.length;
const cap=a.total?preCapCount:(a.limit||1000);
const slice=sources.slice(0,cap);
const entries=slice.map(p=>{const e={source:p};if(a.with_counts)e.count=(data[p]||[]).length;return e;});
const env={ok:true,count:a.total?preCapCount:entries.length,backlinks:a.total?[]:entries};
if(!a.total&&preCapCount>cap)env.truncated=true;
return JSON.stringify(env);
})()`;
```

### Payload shape (the base64-encoded JSON passed to the eval)

```ts
interface EvalPayload {
  active: boolean;       // true if target_mode === "active"
  path: string | null;   // input.path if target_mode === "specific" && input.path else null
  file: string | null;   // input.file if target_mode === "specific" && input.file else null
  with_counts: boolean;  // input.with_counts === true
  total: boolean;        // input.total === true
  limit: number | null;  // input.limit if supplied else null (cap defaults to 1000 inside eval)
}
```

The handler renders the payload via the existing `composeEvalCode` helper (from `src/tools/_shared.ts`), which substitutes the base64-encoded JSON into the template's `__PAYLOAD_B64__` placeholder (the only substitution point — frozen template per R12).

### Per-step JS template walkthrough

1. **Decode payload**: `JSON.parse(${B64_PAYLOAD_DECODE_EXPR})` → `a` is the typed `EvalPayload`.
2. **Resolve target file `f`**: three-branch resolver (active / path / file) with per-branch `FILE_NOT_FOUND` envelope on miss. Active mode emits `NO_ACTIVE_FILE` envelope on no focused file.
3. **Reject non-`.md` target**: `f.extension !== 'md'` → `NOT_MARKDOWN` envelope (FR-020).
4. **Fetch backlinks dict**: `app.metadataCache.getBacklinksForFile(f)` returns a `CustomArrayDict<LinkCache>`; `.data` is the keyed source-path → `LinkCache[]` map.
5. **Filter sources to `.md`-only** (FR-020a per Q2): regex `/\.md$/i` keeps `.md` / `.MD` / `.Md` paths; drops `.canvas`, `.base`, plugin configs, attachments.
6. **Sort source paths**: JavaScript default sort = UTF-16 code-unit ascending (FR-008).
7. **Compute pre-cap count**: `sources.length` is the full source-note count regardless of mode.
8. **Compute applied cap**: `a.total ? preCapCount : (a.limit || 1000)`. Under `total: true`, the cap is set to `preCapCount` so the slice is a no-op (per Q1).
9. **Slice and build entries**: `sources.slice(0, cap)` yields the in-range source paths; `.map` builds entry objects shaped `{ source }` or `{ source, count }` per `a.with_counts`.
10. **Build envelope**: outer `count` is `preCapCount` under `total: true` or `entries.length` otherwise (per Q1 and FR-005a).
11. **Conditionally attach `truncated`**: ONLY when `!a.total && preCapCount > cap`. Absent in count-only mode.
12. **Return JSON**: `JSON.stringify(env)`.

## Handler shape (`handler.ts`)

```ts
import { JS_TEMPLATE } from "./_template.js";
import {
  backlinksEvalResponseSchema,
  type BacklinksEvalErrorCode,
  type BacklinksInput,
  type BacklinksOutput,
} from "./schema.js";
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { composeEvalCode } from "../_shared.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export async function executeBacklinks(
  input: BacklinksInput,
  deps: ExecuteDeps,
): Promise<BacklinksOutput> {
  const code = composeEvalCode(JS_TEMPLATE, {
    active: input.target_mode === "active",
    path: input.target_mode === "specific" ? input.path ?? null : null,
    file: input.target_mode === "specific" ? input.file ?? null : null,
    with_counts: input.with_counts === true,
    total: input.total === true,
    limit: input.limit ?? null,
  });

  const result = await invokeCli(
    {
      command: "eval",
      vault: input.target_mode === "specific" ? input.vault : undefined,
      parameters: { code },
      flags: [],
      target_mode: input.target_mode,
    },
    { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
  );

  let stdout = result.stdout.trimStart();
  if (stdout.startsWith("=> ")) stdout = stdout.slice(3);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stdout);
  } catch (err) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: err,
      details: { stage: "json-parse", stdout: result.stdout.slice(0, 500) },
      message: `backlinks: eval response is not JSON: ${result.stdout.slice(0, 200)}`,
    });
  }

  const validated = backlinksEvalResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: validated.error,
      details: { stage: "envelope-parse", stdout: result.stdout.slice(0, 500) },
      message: "backlinks: eval response shape unexpected",
    });
  }

  if (validated.data.ok === true) {
    const out: BacklinksOutput = {
      count: validated.data.count,
      backlinks: validated.data.backlinks,
    };
    if (validated.data.truncated === true) out.truncated = true;
    return out;
  }

  throw mapEnvelopeError(validated.data.code, validated.data.detail);
}

function mapEnvelopeError(code: BacklinksEvalErrorCode, detail: string): UpstreamError {
  switch (code) {
    case "NO_ACTIVE_FILE":
      return new UpstreamError({
        code: "ERR_NO_ACTIVE_FILE",
        cause: null,
        details: { stage: "envelope-error", detail },
        message: "backlinks: no note focused; switch to specific mode or focus a note.",
      });
    case "FILE_NOT_FOUND":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-error", code, detail },
        message: `backlinks: file not found (${detail})`,
      });
    case "NOT_MARKDOWN":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-error", code, detail },
        message: `backlinks: target is not a Markdown note (${detail})`,
      });
  }
}
```

The handler shape is a near-mirror of `links/handler.ts` with three deltas:
- The output type carries the optional `truncated` field (links does not).
- The eval payload carries three extra fields (`with_counts`, `total`, `limit`) where links only carried `total`.
- The envelope-error mapping reuses BI-025's three codes verbatim (no new envelope codes).

## Registration shape (`index.ts`)

```ts
import { registerTool } from "../_register.js";
import { executeBacklinks, type ExecuteDeps } from "./handler.js";
import { backlinksInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const BACKLINKS_TOOL_NAME = "backlinks";

export const BACKLINKS_DESCRIPTION =
  "Return the flat ordered list of every source note that references a target Markdown note (returns { count, backlinks: [{ source, count? }], truncated? }) — link-graph primitive that replaces \"vault-wide body-text search\" for the inbound-reference case at one to two orders of magnitude less token cost. Discriminated by target_mode. Specific mode: target_mode + vault + exactly one of file/path. Active mode: target_mode only (operates on the focused note in the focused vault). Setting with_counts:true decorates each per-source entry with an integer count aggregating all references from that source. Setting total:true populates count and returns backlinks:[] for a token-economical pre-flight read; per the 2026-05-17 clarification, total:true BYPASSES the implicit 1000-source cap and reports the full pre-cap source-note count. The optional limit field (range 1..10000) overrides the implicit cap; when the underlying source set exceeds the applied cap (in entry-list modes only), the response includes truncated:true. Source corpus is restricted to .md files only (per the 2026-05-17 clarification); .canvas/.base/plugin-config/attachment sources are excluded even if upstream classifies them as link-carrying. Self-references are INCLUDED in the listing (matching Obsidian's Backlinks pane semantic). Aliased wikilinks are attributed to the resolved target, not the alias text. Frontmatter-declared references contribute uniformly with body references. Code-block-only references are excluded (defers to the host's link parser). Non-Markdown TARGET locators (.canvas, .pdf, attachments) are rejected as CLI_REPORTED_ERROR. Unknown vault display names emit a structured CLI_REPORTED_ERROR via the inherited cli-adapter classifier (multi-vault callers must supply a registered name; no silent routing to focused vault). Call help({ tool_name: \"backlinks\" }) for full parameter docs, the with_counts / total / capped / truncated examples, the self-reference note, the frontmatter-inclusion note, the multi-vault structured-error note, the cross-pointer to the outgoing-links sibling (links), and the error-code roster.";

export type RegisterDeps = ExecuteDeps;

export function createBacklinksTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: BACKLINKS_TOOL_NAME,
    description: BACKLINKS_DESCRIPTION,
    schema: backlinksInputSchema,
    deps,
    handler: async (input, d) => executeBacklinks(input, d),
  });
}
```

## Inherited per-call infrastructure

The handler reuses these existing project primitives without modification:

| Primitive | Source | Role |
|-----------|--------|------|
| `invokeCli` | `src/cli-adapter/cli-adapter.js` | Single CLI bridge (ADR-004). Handles spawn, timeout, output cap, error classification, queue gating. |
| `UpstreamError` | `src/errors.js` | Pure value type for structured boundary errors (Principle IV). Zero new top-level codes. |
| `registerTool` | `src/tools/_register.js` | Schema-parse + JSON-serialise wrapper (ADR-006). Auto-wraps `ZodError → VALIDATION_ERROR`. |
| `composeEvalCode` | `src/tools/_shared.js` | Renders the base64 payload into the frozen JS template (R12 anti-injection). |
| `B64_PAYLOAD_DECODE_EXPR` | `src/tools/_shared.js` | UTF-8-safe base64 decoder expression (BI-034). |
| `applyTargetModeRefinement` + `targetModeBaseSchema` | `src/target-mode/target-mode.js` | ADR-003 target_mode discriminator schema. |

## Test inventory

Target: ~57 tests across three `*.test.ts` files; exceeds SC-024 floor of 20.

### `schema.test.ts` (~22 cases)

| # | Case | FR / SC |
|---|------|---------|
| 1 | specific + vault + path → OK | FR-002 / SC-001 |
| 2 | specific + vault + file → OK | FR-002 / SC-002 |
| 3 | specific + vault + path + with_counts:true → OK | FR-003 / SC-016 |
| 4 | specific + vault + path + total:true → OK | FR-004 / SC-016 |
| 5 | specific + vault + path + limit:50 → OK | FR-005 / SC-019 |
| 6 | active (no other fields) → OK | FR-002 / SC-003 |
| 7 | specific WITHOUT vault → validation fail | FR-002 / SC-014 |
| 8 | specific WITHOUT file AND path → validation fail (Q user spec's "neither name nor focus") | FR-002 / US3-1 / SC-014 |
| 9 | specific WITH both file AND path → validation fail | FR-002 / US3-4 / SC-014 |
| 10 | active WITH file → validation fail (Q user spec's "both name and focus") | FR-002 / US3-2 / SC-014 |
| 11 | active WITH path → validation fail | FR-002 / US2-3 / SC-014 |
| 12 | active WITH vault → validation fail | FR-002 / SC-014 |
| 13 | unknown top-level key → validation fail | FR-006 / SC-014 |
| 14 | with_counts:"true" (string) → validation fail | FR-003 / US3-6 / SC-014 |
| 15 | total:"true" (string) → validation fail | FR-004 / US3-6 / SC-014 |
| 16 | limit:0 → validation fail | FR-012 / US3-7 / SC-020 |
| 17 | limit:-1 → validation fail | FR-012 / SC-020 |
| 18 | limit:10001 → validation fail | FR-012 / SC-020 |
| 19 | limit:1.5 (non-integer) → validation fail | FR-012 / SC-020 |
| 20 | target_mode:"focused" (unknown enum) → validation fail | FR-002 / US3-9 / SC-014 |
| 21 | target_mode missing → validation fail | FR-002 / US3-9 / SC-014 |
| 22 | JSON Schema round-trip via toMcpInputSchema → emits expected shape with `additionalProperties: false` | FR-006 / Principle III |

### `handler.test.ts` (~30 cases)

| # | Case | FR / SC |
|---|------|---------|
| 1 | happy path: default mode, 3 source notes → returns `{count:3, backlinks:[3 entries]}` | FR-005 / SC-001 |
| 2 | happy path with_counts:true → returns `{count:3, backlinks:[3 entries each with count]}` | FR-003 / SC-016 |
| 3 | happy path total:true → returns `{count:3, backlinks:[]}` | FR-004 / SC-016 |
| 4 | happy path active mode → returns focused note's backlinks | FR-019 / SC-003 |
| 5 | happy path basename locator → equivalent to path locator | FR-002 / SC-002 |
| 6 | zero backlinks → returns `{count:0, backlinks:[]}` | FR-009 / SC-005 |
| 7 | zero backlinks with_counts:true → returns `{count:0, backlinks:[]}` (no error) | FR-009 / SC-005 |
| 8 | zero backlinks total:true → returns `{count:0, backlinks:[]}` (no error) | FR-009 / SC-005 |
| 9 | same source N references across N lines → ONE entry with count:N (under with_counts:true) | FR-007 / SC-006 |
| 10 | same source 2 references on same line → ONE entry with count:2 | FR-007 / US4-3 / SC-006 |
| 11 | aliased wikilink reference → attributed to resolved target | FR-015 / SC-007 |
| 12 | frontmatter-only reference → source appears in listing | FR-016 / SC-008 |
| 13 | mixed body + frontmatter from one source → ONE entry with count summing both | FR-007 / FR-016 / SC-006 |
| 14 | code-block-only reference from one source → source EXCLUDED | FR-014 / SC-009 |
| 15 | self-reference: target links to itself → source list includes target's own path | FR-013 / SC-010 |
| 16 | `.canvas` source referencing target → source EXCLUDED (per Q2 / FR-020a) | FR-020a / SC-013a |
| 17 | mixed `.md` + `.canvas` sources → only `.md` sources in response | FR-020a / SC-013a |
| 18 | target locator pointing at `.pdf` → `CLI_REPORTED_ERROR(NOT_MARKDOWN)` | FR-020 / SC-013 |
| 19 | target locator pointing at `.canvas` → `CLI_REPORTED_ERROR(NOT_MARKDOWN)` | FR-020 / SC-013 |
| 20 | unresolved path → `CLI_REPORTED_ERROR(FILE_NOT_FOUND)` | FR-017 / SC-011 |
| 21 | unresolved file (basename) → `CLI_REPORTED_ERROR(FILE_NOT_FOUND)` | FR-017 / SC-011 |
| 22 | active mode + no focused file → `ERR_NO_ACTIVE_FILE` | FR-019 / SC-004 |
| 23 | unknown vault → `CLI_REPORTED_ERROR(VAULT_NOT_FOUND)` via inherited 011-R5 clause | FR-018 / SC-012 |
| 24 | json-parse failure (eval returns non-JSON) → `CLI_REPORTED_ERROR(stage:'json-parse')` | FR-023 / Principle IV |
| 25 | envelope-parse failure (eval returns wrong shape) → `CLI_REPORTED_ERROR(stage:'envelope-parse')` | FR-023 / Principle IV |
| 26 | cap-and-truncate: 1500 sources, default cap → `count:1000, truncated:true` | FR-010 / SC-019 |
| 27 | cap-and-truncate: 1500 sources, limit:50 → `count:50, truncated:true` | FR-010 / SC-019 |
| 28 | cap-bypass under total:true: 1500 sources → `count:1500, backlinks:[], NO truncated` (per Q1) | FR-004 / FR-005a / SC-017 / SC-019 |
| 29 | output-cap kill: invokeCli throws `CLI_NON_ZERO_EXIT` → propagates verbatim | FR-024 / SC-028 |
| 30 | deterministic order: same input twice → byte-identical response | FR-008 / SC-018 |

### `index.test.ts` (~5 cases)

| # | Case | FR / SC |
|---|------|---------|
| 1 | factory returns RegisteredTool with name "backlinks" | FR-001 / FR-026 |
| 2 | descriptor.inputSchema is the published JSON Schema (with `additionalProperties:false`) | FR-006 / FR-026 |
| 3 | descriptor.description is non-empty and >200 chars (worked-example budget) | FR-026 |
| 4 | deps are wired through to handler invocations | FR-026 |
| 5 | description includes the cross-pointer phrase "links" (BI-025) | FR-026 |

## FR-018 baseline roll-forward

After implementation, `npm run baseline:write` MUST be run to add the `backlinks` entry to [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json):

```json
{
  "name": "backlinks",
  "descriptionFingerprint": "<sha256 of BACKLINKS_DESCRIPTION>",
  "schemaFingerprint": "<sha256 of emitted JSON Schema for backlinksInputSchema>"
}
```

The baseline detector ([src/tools/_register-baseline.test.ts](../../src/tools/_register-baseline.test.ts)) fails until this entry is added. The fingerprints catch future silent drift in either the description or the input schema.

## Module dependency graph (one-way per Principle I)

```text
server.ts
   └─ createBacklinksTool (from backlinks/index.ts)
         └─ registerTool (from _register.ts)
         └─ executeBacklinks (from backlinks/handler.ts)
               └─ JS_TEMPLATE (from backlinks/_template.ts)
                     └─ B64_PAYLOAD_DECODE_EXPR (from tools/_shared.ts)
               └─ backlinksEvalResponseSchema (from backlinks/schema.ts)
                     └─ backlinkEntrySchema (same file)
               └─ composeEvalCode (from tools/_shared.ts)
               └─ invokeCli (from cli-adapter/cli-adapter.ts)
               └─ UpstreamError (from errors.ts)
         └─ backlinksInputSchema (from backlinks/schema.ts)
               └─ applyTargetModeRefinement (from target-mode/target-mode.ts)
               └─ targetModeBaseSchema (from target-mode/target-mode.ts)
```

No upward imports. No cyclic imports. `backlinks/index.ts` is the sole entry; `server.ts` is the sole consumer.
