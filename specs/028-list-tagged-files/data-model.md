# Data Model: List Tagged Files

**Branch**: `028-list-tagged-files`
**Date**: 2026-05-15
**Phase**: 1 (Design & Contracts)

Schemas, frozen JS template, base64 payload assembly, per-tool invariants, module LOC budget, test inventory, architectural delta map.

## Input schema

```ts
// src/tools/tag/schema.ts
import { z } from "zod";

export const tagInputSchema = z
  .object({
    tag: z
      .string()
      .min(1, "tag is required")
      .max(220, "tag too long (max 200 chars post-trim/post-#-strip)")
      .transform((s) => s.trim())
      .transform((s) => (s.startsWith("#") ? s.slice(1) : s))
      .refine((s) => s.length > 0, "tag is empty post-trim/post-#-strip")
      .refine((s) => s.length <= 200, "tag exceeds 200 chars post-strip")
      .refine((s) => !s.split("/").some((seg) => seg.length === 0),
        "tag contains empty hierarchical segment (e.g. /foo, foo/, foo//bar)"),
    vault: z.string().min(1).optional(),
    total: z.boolean().optional(),
  })
  .strict();

export type TagInput = z.infer<typeof tagInputSchema>;
```

Notes:
- `tag.max(220)` is the OUTER cap on the raw input string (allows up to 20 chars of `#`+whitespace before normalisation); the post-strip `≤200` refinement is the spec-locked structural cap (FR-011).
- `.transform` chain runs trim → strip-leading-# → emptiness-refine → length-refine → segment-refine.
- `vault` is optional (parity with BI-024 / BI-025 / BI-026 / BI-027 vault-routing convention).
- `total` is optional boolean — when `true`, count-only mode (FR-018).
- `.strict()` rejects unknown keys per Principle III.

## Output schemas

```ts
// src/tools/tag/schema.ts (continued)
export const tagDefaultOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    paths: z.array(z.string().min(1)),
  })
  .strict()
  .refine((o) => o.count === o.paths.length, "count must equal paths.length");

export const tagCountOnlyOutputSchema = z.number().int().nonnegative();

export type TagDefaultOutput = z.infer<typeof tagDefaultOutputSchema>;
export type TagCountOnlyOutput = z.infer<typeof tagCountOnlyOutputSchema>;
```

The handler picks which schema to validate against at the parse seam based on `input.total`.

## Eval-envelope wire schema

The JS template returns one of two envelope shapes depending on `total`. Both share the success-discriminator structure of BI-026 / BI-027.

```ts
// src/tools/tag/schema.ts (continued)
const tagEnvelopeOkDefault = z.object({
  ok: z.literal(true),
  mode: z.literal("default"),
  count: z.number().int().nonnegative(),
  paths: z.array(z.string().min(1)),
}).strict();

const tagEnvelopeOkCountOnly = z.object({
  ok: z.literal(true),
  mode: z.literal("count-only"),
  total: z.number().int().nonnegative(),
}).strict();

const tagEnvelopeError = z.object({
  ok: z.literal(false),
  code: z.string().min(1),
  detail: z.string().optional(),
}).strict();

export const tagEvalEnvelopeSchema = z.discriminatedUnion("ok", [
  tagEnvelopeOkDefault,
  tagEnvelopeOkCountOnly,
  tagEnvelopeError,
]);
```

At v1, the `tagEnvelopeError` branch is reserved for future envelope-level failures that the JS template might surface (e.g. cache-not-ready). The MVP code path returns only the two `ok: true` shapes — zero-match is `{ok: true, mode: "default", count: 0, paths: []}` (default) or `{ok: true, mode: "count-only", total: 0}` (count-only), NEVER error.

## Frozen JS template

`src/tools/tag/handler.ts` builds the eval `code` parameter by substituting a single `__PAYLOAD_B64__` placeholder into the following frozen template. The template is byte-stable across calls.

```js
// FROZEN — do not edit at runtime. Anti-injection: all user data flows
// in via base64 JSON payload (FR-020). Sixth member of the eval-driven
// typed-tool cohort. Original — no upstream.
(() => {
  const payload = JSON.parse(atob("__PAYLOAD_B64__"));
  const q = String(payload.query).toLowerCase();
  const wantTotal = !!payload.total;

  const fc = app.metadataCache.fileCache;
  const mc = app.metadataCache.metadataCache;

  const normTag = (t) => {
    let s = String(t);
    if (s.charCodeAt(0) === 35) s = s.slice(1); // strip leading '#'
    return s.toLowerCase();
  };

  const isMatch = (tagLower) => {
    return tagLower === q || tagLower.startsWith(q + "/");
  };

  const out = [];
  for (const path of Object.keys(fc)) {
    if (!path.endsWith(".md")) continue;
    const m = mc[fc[path].hash];
    if (!m) continue;
    const seen = new Set();
    if (Array.isArray(m.tags)) {
      for (const t of m.tags) {
        if (t && typeof t.tag === "string") seen.add(normTag(t.tag));
      }
    }
    if (m.frontmatter && Array.isArray(m.frontmatter.tags)) {
      for (const t of m.frontmatter.tags) {
        if (typeof t === "string") seen.add(normTag(t));
      }
    }
    let matched = false;
    for (const n of seen) {
      if (isMatch(n)) { matched = true; break; }
    }
    if (matched) out.push(path);
  }

  out.sort();

  if (wantTotal) {
    return JSON.stringify({ ok: true, mode: "count-only", total: out.length });
  }
  return JSON.stringify({ ok: true, mode: "default", count: out.length, paths: out });
})();
```

Template invariants:
- No console.log / no `[warn]` lines emitted (handler's stage-1 `=> ` extraction is the simple BI-026 trimStart+startsWith pattern; no LAST-`=> ` rescan needed).
- No try/catch — failure modes are envelope-level (count=0) or handler-level (decoded base64 parse failure, etc.). The cli-adapter's `Error:` classifier captures any unexpected JS runtime exception.
- ASCII lower-fold only (FR-008). No Unicode case-folding.
- Segment-boundary precision enforced by `isMatch` — `q === tag || tag.startsWith(q + "/")` (FR-016 / R14).
- Both body inline tags AND frontmatter tags ingested equally (FR-006 / Q3 lock).
- Per-path Set de-duplicates same-tag-multiple-occurrences (FR-007).
- `.md`-only filter (R7, defer-to-upstream — Obsidian's tag cache only indexes `.md`).
- Wrapper-side byte-asc sort (R8 / FR-013 / Q5 lock).
- Single eval invocation per request (R3 / FR-019).

## Base64 payload assembly

Handler-side payload encoding:
```ts
const payloadObj = { query: input.tag, total: !!input.total };
const payloadJson = JSON.stringify(payloadObj);
const payloadB64 = Buffer.from(payloadJson, "utf8").toString("base64");
const code = FROZEN_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64);
```

Anti-injection invariant (FR-020): the substituted base64 alphabet is `[A-Za-z0-9+/=]` — no chars can break out of the JS string literal. Test seam (R12) decodes and asserts the payload shape.

## Handler shape

`src/tools/tag/handler.ts` exports `tagHandler` with this signature (parity with predecessors):

```ts
export const tagHandler = (deps: HandlerDeps) =>
  async (rawInput: unknown): Promise<TagDefaultOutput | TagCountOnlyOutput> => {
    const input = tagInputSchema.parse(rawInput);

    const payloadObj = { query: input.tag, total: !!input.total };
    const payloadJson = JSON.stringify(payloadObj);
    const payloadB64 = Buffer.from(payloadJson, "utf8").toString("base64");
    const code = FROZEN_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64);

    const result = await deps.invokeCli({
      subcommand: "eval",
      parameters: { code },
      ...(input.vault !== undefined ? { vault: input.vault } : {}),
    });

    // Stage 0: closed-but-registered vault detection (shared module, FR-021)
    if (detectClosedVault(result)) {
      throw new UpstreamError("CLI_REPORTED_ERROR", {
        details: { code: "VAULT_NOT_FOUND", reason: "not-open" },
      });
    }

    // Stage 1: extract JSON via "=> " prefix
    const trimmed = result.stdout.trimStart();
    const jsonText = trimmed.startsWith("=> ") ? trimmed.slice(3) : trimmed;

    // Stage 2: JSON.parse
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (cause) {
      throw new UpstreamError("CLI_REPORTED_ERROR", {
        cause,
        details: { stage: "json-parse" },
      });
    }

    // Stage 3: envelope safeParse
    const envelopeResult = tagEvalEnvelopeSchema.safeParse(parsed);
    if (!envelopeResult.success) {
      throw new UpstreamError("CLI_REPORTED_ERROR", {
        cause: envelopeResult.error,
        details: { stage: "envelope-parse" },
      });
    }
    const envelope = envelopeResult.data;

    // Stage 4: discriminate on ok
    if (!envelope.ok) {
      throw new UpstreamError("CLI_REPORTED_ERROR", {
        details: { stage: "envelope-error", code: envelope.code },
      });
    }

    // Stage 5: shape-correct return based on input mode
    if (envelope.mode === "count-only") {
      return tagCountOnlyOutputSchema.parse(envelope.total);
    }
    return tagDefaultOutputSchema.parse({
      count: envelope.count,
      paths: envelope.paths,
    });
  };
```

## Per-tool invariants

| Invariant | Where enforced | Test characterisation |
|-----------|---------------|----------------------|
| Exactly one `invokeCli` per request | handler / R3 | mock invokeCli spy.calls === 1 |
| `subcommand === "eval"` | handler / R2 / FR-019 | mock invokeCli args assertion |
| `parameters.code` ends with `})()` and contains `__PAYLOAD_B64__`-substituted form | handler / FR-020 | string-pattern + base64 round-trip |
| `vault` flows through unchanged | handler / R11 | mock invokeCli args assertion |
| Default mode returns `{count, paths}` with `count === paths.length` | output schema refinement | schema.test.ts |
| Count-only mode returns bare integer | handler stage 5 | handler.test.ts |
| Zero-match → `{count: 0, paths: []}` or `0`, never error | JS template / FR-012 | handler.test.ts via mocked stdout |
| Paths sorted byte-asc | JS template / R8 | handler.test.ts via mocked stdout |
| Closed vault → `VAULT_NOT_FOUND(reason: "not-open")` | handler stage 0 / FR-021 | handler.test.ts |
| Unknown vault → `CLI_REPORTED_ERROR` via 011-R5 | cli-adapter / R5 | integration |
| Validation error before invokeCli | handler / FR-011 | schema.test.ts + handler.test.ts (no spawns) |
| Tool name `tag` registered | registry / R15 / ADR-010 | _register.test.ts + baseline |
| Original-no-upstream header | source files | grep + lint convention |

## Module LOC budget

Target sizes (approximate, per Principle I module discipline):

| Module | Source LOC | Test LOC |
|--------|-----------|---------|
| `src/tools/tag/schema.ts` | ~55 | ~340 |
| `src/tools/tag/handler.ts` | ~140 (incl. frozen template) | ~720 |
| `src/tools/tag/index.ts` | ~25 | ~80 |
| Subtotal (new module) | ~220 | ~1140 |

Plus baseline + register changes (~3 LOC source) and `docs/tools/tag.md` (~80 LOC docs).

## Test inventory

53 co-located test cases across schema / handler / registration suites:

### Schema (16 cases) — `src/tools/tag/schema.test.ts`
1. Valid minimal input `{tag: "foo"}` parses; vault/total default to undefined/false.
2. Valid full input `{tag: "foo/bar", vault: "X", total: true}` parses.
3. Empty `tag` → validation error.
4. Whitespace-only `tag` → validation error.
5. `tag` with empty segments `/foo` → validation error.
6. `tag` with empty segments `foo/` → validation error.
7. `tag` with empty segments `foo//bar` → validation error.
8. `tag` exceeding 200 chars post-strip → validation error.
9. `tag` exceeding 220 chars (outer cap) → validation error.
10. Leading `#` stripped: `{tag: "#foo"}` produces parsed `tag === "foo"`.
11. Whitespace trimmed: `{tag: "  foo  "}` produces `tag === "foo"`.
12. Both: `{tag: "  #foo  "}` → `tag === "foo"`.
13. Charset-permissive: `{tag: "foo bar"}` PARSES (no charset regex enforcement per Q2).
14. Unicode tag `{tag: "日本語"}` parses.
15. Unknown key `{tag: "foo", x: 1}` → strict mode rejects.
16. `total: "true"` (string not boolean) → validation error.

### Handler (32 cases) — `src/tools/tag/handler.test.ts`

#### Single-spawn invariants (3)
17. Default mode: exactly one `invokeCli` call.
18. Count-only mode: exactly one `invokeCli` call.
19. Validation error before any `invokeCli`.

#### Argv contract (5)
20. `subcommand === "eval"`.
21. `parameters.code` contains the frozen template prefix.
22. Base64 payload decodes to `{query, total}`.
23. `vault` flows through when provided.
24. `vault` absent when not provided.

#### Default-mode envelope happy path (5)
25. Stdout `"=> {ok:true,mode:default,count:2,paths:[\"a.md\",\"b.md\"]}"` → returns `{count: 2, paths: ["a.md", "b.md"]}`.
26. Stdout `"=> {ok:true,mode:default,count:0,paths:[]}"` → returns `{count: 0, paths: []}`.
27. Single match → returns `{count: 1, paths: ["x.md"]}`.
28. Many matches → returns full array.
29. Mode mismatch (envelope says count-only when input.total=false) → envelope-parse error.

#### Count-only happy path (3)
30. Stdout `"=> {ok:true,mode:count-only,total:3}"` → returns `3`.
31. Stdout `"=> {ok:true,mode:count-only,total:0}"` → returns `0`.
32. Mode mismatch (envelope says default when input.total=true) → envelope-parse error.

#### Stage-0 closed-vault detection (2)
33. Empty stdout + exit 0 → throws `CLI_REPORTED_ERROR(VAULT_NOT_FOUND, reason: "not-open")` via shared detector.
34. Non-empty stdout (any content) → shared detector returns false; proceeds to stage 1.

#### Stage-1/2/3 parse failures (3)
35. Non-JSON stdout `"=> not-json"` → `CLI_REPORTED_ERROR(stage: json-parse)`.
36. Wrong shape `"=> {ok:true,bogus:1}"` → `CLI_REPORTED_ERROR(stage: envelope-parse)`.
37. Missing `=> ` prefix `"{ok:true,...}"` → still passes (handler trimStart+startsWith handles both forms).

#### Envelope-error branch (2)
38. Stdout `"=> {ok:false,code:CACHE_NOT_READY}"` → `CLI_REPORTED_ERROR(stage: envelope-error, code: CACHE_NOT_READY)`.
39. Envelope-error without detail field → passes safeParse (detail is optional).

#### Inherited unknown-vault (1)
40. CLI emits `Vault not found.` (no need for tool-level test; cli-adapter handles → integration covers it).

#### Payload-injection structural lock (3)
41. Adversarial input `{tag: "\"); evil(); ("}` round-trips through base64 — JS template byte-stable.
42. Adversarial input with newlines `{tag: "a\nb"}` round-trips through base64.
43. Adversarial input with backticks `{tag: "`code`"}` round-trips through base64.

#### Sort + dedup invariants (5)
44. Already-sorted paths from JS template — handler does not re-sort.
45. Unsorted paths from JS template — handler does NOT re-sort (responsibility lives in JS).
46. Empty paths array — natural return shape.
47. Single path — natural return shape.
48. 1000+ paths — no truncation.

### Registration (5 cases) — `src/tools/tag/index.test.ts` + `_register.test.ts`
49. Factory `createTagTool(deps)` returns object with `name === "tag"`, `description`, `inputSchema`, `handler`.
50. Tool name `tag` registered alphabetically between `read_property` and `read_heading` (or similar — confirm at impl time).
51. Schema-shape fingerprint matches `_register-baseline.json` after baseline regen.
52. Description fingerprint matches baseline.
53. `docs/tools/tag.md` exists (auto-asserted by server registry test).

## Architectural delta map

| Dimension | This BI (BI-028) | Predecessor cohort |
|-----------|-----------------|--------------------|
| Subcommand | `eval` (R2, FR-019) | BI-014 `eval` / BI-015 `eval` / BI-025 `eval` / BI-026 `eval` / BI-027 `eval` (sixth eval-cohort member) |
| User-facing schema | flat `{tag, vault?, total?}` | parity with BI-024 `{vault?, total?}` (vault-only fileless) |
| `target_mode` discriminator | NO (vault-only) | parity with BI-024 (NO); diverges from BI-014/015/025/026 (YES) |
| Anti-injection | base64 JSON payload | parity with BI-014/015/025/026/027 |
| Output cap | inherited 10 MiB | parity with all predecessors |
| Closed-vault detection | shared `_eval-vault-closed-detection` module | third consumer (BI-026 origin, BI-027 lift, BI-028 consumer) |
| Sort | wrapper-side byte-asc inside JS template | parity with BI-026 / BI-027 |
| Anti-injection payload shape | `{query: string, total: boolean}` | new — but structurally same as BI-014 `{prop, target}` / BI-025 `{path}` / BI-026 `{path}` |
| Failure mode roster | 6 entries (VALIDATION_ERROR; VAULT_NOT_FOUND × 2 reasons via inherited classifier; CLI_REPORTED_ERROR(stage: json-parse / envelope-parse / envelope-error); cli-adapter inherited codes) | parity with the simpler members of the eval cohort (BI-024-style, not the plugin-cohort BI-026/027 which have richer rosters) |
| Tool name | `tag` (single-word verbatim, ADR-010) | parity with BI-022 sweep (read/delete/files/etc.) |
| Plugin dependency | NONE — core Obsidian metadataCache only | diverges from BI-026/027 (Smart Connections plugin); aligns with BI-014/015/025 (core cache) |
| ADR consumption | ADR-003 N/A (no target_mode), ADR-010 enforced (name), ADR-013 N/A (not plugin-backed), ADR-014 N/A (not plugin-backed), ADR-015 N/A (no new sub-discriminator) | mixed |
| New ADRs | NONE | this BI introduces no new ADRs |
| Constitution amendment | NONE (v1.5.0 stays) | this BI introduces no Principle / ADR changes |
| New top-level error codes | ZERO | preserves the thirteen-tool zero-new-codes streak through BI-027 → BI-028 |
| New `details.code` values | ZERO | only existing inherited values consumed |
| Architecture snapshot | NONE (canonical only) | parity with BI-027 (no snapshot, since not plugin-backed) |

## Test fixture seeding plan (T0 of /speckit-implement)

TestVault current state (per F7 probe):
- `Fixtures/BI-031/lists/contains.md` → tags `[alpha, beta, gamma]`
- `Fixtures/BI-031/lists/exact-ordered.md` → tags `[alpha, beta]`
- `Fixtures/BI-031/lists/reversed.md` → tags `[beta, alpha]`
- `Fixtures/BI-005/all-types.md` → tags `[bi-005, fixture]`

T0 must seed under `Sandbox/BI-028/`:
1. `body-inline.md` — body `#projecta #projectb` (no frontmatter tags).
2. `hierarchical.md` — frontmatter `tags: [project/alpha, project/alpha/v1, project/beta]`.
3. `case-variant.md` — frontmatter `tags: [CaseTest]` (probe wrapper lower-fold against capital stored).
4. `code-block-only.md` — fenced code block contains `#projectcode`, no real tags (negative case for FR-005).
5. `dup-sources.md` — body `#dup #dup` AND frontmatter `tags: [dup]` (probe dedup FR-007).

After T0 verification, clean up all `Sandbox/BI-028/*` fixtures.
