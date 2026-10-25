# Data Model: Add List Tags (`tags`)

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md) | **Date**: 2026-10-25

All shapes are zod schemas in `src/tools/tags/schema.ts`. Downstream types come from `z.infer` (Constitution Principle III). There is no persistent storage: the tool is stateless and reads Obsidian's metadata cache through one CLI call.

## 1. `TagsInput` (`tagsInputSchema`)

Built as `targetModeBaseSchema.extend({...})` plus a tool-local `superRefine` (research R4, ADR-038). The object is strict, so unknown top-level keys are rejected.

| Field | Type | Required | Default (resolved in handler) | Constraint |
|---|---|---|---|---|
| `target_mode` | `"specific" \| "active"` | YES | — | enum (inherited from base) |
| `vault` | string | specific: YES / active: FORBIDDEN | — | `min(1)` (inherited) |
| `file` | string | no | — | `min(1)`; link-style note name resolved by Obsidian |
| `path` | string | no | — | `min(1)`; `isStructurallySafePath`: no leading `/` or `\`, no drive letter, no `..` segment, no control characters or DEL |
| `activeOnly` | boolean | no | `false` | — |
| `sortByCount` | boolean | no | `false` | — |
| `includeCounts` | boolean | no | `true` | — |

**Refinement (ADR-038 scope matrix).** In this table, "set" means: `file !== undefined`, `path !== undefined`, `activeOnly === true`.

| Rule | Issue path(s) | Message |
|---|---|---|
| specific mode requires `vault` | `["vault"]` | `vault is required in specific mode` |
| active mode forbids `vault` | `["vault"]` | `vault is not allowed in active mode` |
| at most one of `file` / `path` / `activeOnly` is set | every offending key | ``at most one of `file`, `path`, `activeOnly` may be set`` |

**Effective scope** (derived in the handler):

| Set field | Scope | Upstream argv (after `vault=` if specific) |
|---|---|---|
| none | vault-wide | `tags format=json counts` |
| `file` | note by name | `tags format=json file=<file> counts` |
| `path` | note by path | `tags format=json path=<path> counts` |
| `activeOnly` | focused note | `tags format=json counts active` |

Argv order follows the dispatch contract `[binary, vault=…, command, key=value…, flags…]`.

## 2. Upstream wire (`tagsUpstreamArraySchema`)

```text
z.array(z.object({ tag: z.string(), count: z.string().optional() }).loose())
```

- `tag` always carries exactly one leading `#` (research F4).
- `count` is a decimal string (F2). The tool always sends the `counts` flag, so a missing `count` is a handler error (`details.stage: "count-parse"`).
- `.loose()` tolerates fields that a future upstream version may add.
- The literal empty sentinel `No tags found.` (F3) is not JSON. It is detected before parsing.

## 3. `TagEntry` (`tagEntrySchema`)

```text
z.strictObject({ name: z.string().min(1), count: z.number().int().nonnegative().optional() })
```

| Field | Source | Rule |
|---|---|---|
| `name` | upstream `tag` | exactly one leading `#` stripped; no other rewriting (FR-007) |
| `count` | upstream `count` | strict `/^\d+$/`, `Number.isSafeInteger`; **key absent** (not `undefined`) when `includeCounts` is false (AC 6) |

## 4. `TagsOutput` (`tagsOutputSchema`)

```text
z.strictObject({ total: z.number().int().nonnegative(), tags: z.array(tagEntrySchema) })
```

Invariants:

- `total === tags.length` (FR-006).
- `tags` is sorted with `compareTagNames` (default) or with count descending, then `compareTagNames` (`sortByCount`) (FR-004, research R7).
- Either every entry has `count` or none does.
- An empty result is exactly `{ total: 0, tags: [] }` (FR-010).
- Names are unique within a result. In the vault-wide scope this is because upstream merges case variants (F8); in per-note scopes it is because upstream lists each distinct casing once.

## 5. Handler pipeline (`executeTags`)

```text
input (validated)
  → resolve defaults (activeOnly=false, sortByCount=false, includeCounts=true)
  → invokeCli({ command:"tags", target_mode:"specific", vault: input.vault,
                parameters:{ format:"json", file?, path? }, flags:["counts", "active"?] })   ← exactly one call
      ├─ UpstreamError ERR_NO_ACTIVE_FILE → rethrow re-messaged (R9); every other error propagates unchanged
  → trim stdout
  → "No tags found." → { total:0, tags:[] }
  → JSON.parse          (fail → CLI_REPORTED_ERROR stage:"json-parse")
  → upstream schema     (fail → CLI_REPORTED_ERROR stage:"shape-parse")
  → map: strip "#", parse count   (fail → CLI_REPORTED_ERROR stage:"count-parse")
  → sort (compareTagNames | count desc then compareTagNames)
  → includeCounts=false → drop the count key
  → { total, tags }
```

`target_mode: "specific"` is passed in BOTH modes. This avoids `invokeCli`'s active-mode locator strip (research R3). In active mode `vault` is `undefined`, so the argv targets the focused vault.

## 6. Comparator `compareTagNames(a, b)`

1. `fa = asciiLowerFold(a)` and `fb = asciiLowerFold(b)`, where only `A`–`Z` change (to `a`–`z`).
2. If `fa !== fb`, return `compareUtf8Bytes(fa, fb)`.
3. Otherwise return `compareUtf8Bytes(a, b)`.

`compareUtf8Bytes` is `Buffer.compare(Buffer.from(x, "utf8"), Buffer.from(y, "utf8"))`. It lives in the shared leaf `src/tools/_utf8-compare.ts`, which `files` also uses (moved there in the PR #85 review; see research R7). The resulting order is total: it returns 0 only when `a === b`.

Worked example (per-note scope): `Banana`, `aardvark`, `Aardvark` → `Aardvark`, `aardvark`, `Banana`.

## 7. Module layout and size budget

| File | Purpose | ~LOC |
|---|---|---|
| `src/tools/tags/schema.ts` | input, entry, output and upstream schemas plus the ADR-038 `superRefine`; `z.infer` types | 70 |
| `src/tools/tags/handler.ts` | `executeTags`, `compareTagNames`, the sentinel constant | 110 |
| `src/tools/tags/index.ts` | `createTagsTool` through `registerTool`; name and description constants | 45 |
| `src/tools/tags/schema.test.ts` | validation matrix (AC 9–12, path safety, types, defaults) | 200 |
| `src/tools/tags/handler.test.ts` | argv shape for each scope and mode, transforms, ordering, errors (AC 1–8, 13, 16) | 450 |
| `src/tools/tags/index.test.ts` | registration, stripped schema, doc presence and completeness (AC 14), unknown-key server path (AC 11) | 90 |
| `docs/tools/tags.md` | full help document | 220 |

Every source and test file starts with `// Original — no upstream. <intent>.` (Principle V).
