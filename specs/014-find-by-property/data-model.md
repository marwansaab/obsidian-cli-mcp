# Data Model — `find_by_property`

**Feature**: [014-find-by-property](./spec.md)
**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-09

This document captures the in-tree data shapes for `find_by_property`: the input schema, the output schema, the JS template's payload shape, the eval response shape, the per-tool invariants, and the module LOC budget. Decisions cited as `Rn` reference [research.md](./research.md).

---

## 1. Input schema (zod, single source of truth per Constitution III)

```ts
// src/tools/find_by_property/schema.ts
const FOLDER_TRAVERSAL_REGEX = /(?:^[/\\])|(?:^|[/\\])\.\.(?:[/\\]|$)/;

export const findByPropertyInputSchema = z
  .object({
    vault: z.string().min(1).optional(),
    property: z.string().min(1),
    value: z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
    ]),
    folder: z.string()
      .refine(
        (v) => !FOLDER_TRAVERSAL_REGEX.test(v),
        "folder must not contain '..' segments or start with '/' or '\\\\' (path-traversal escape)",
      )
      .optional(),
    arrayMatch: z.boolean().optional().default(true),
    caseSensitive: z.boolean().optional().default(true),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (Array.isArray(input.value) && input.arrayMatch === true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "value cannot be an array when arrayMatch is true (default); pass a scalar for contains semantics, or set arrayMatch: false for exact-equality.",
      });
    }
  });

export type FindByPropertyInput = z.infer<typeof findByPropertyInputSchema>;
```

Key points:

- **No `target_mode`**: this is the first typed tool with a flat input shape (no discriminated union, no `applyTargetModeRefinement`). The post-010 flat-extension idiom is bypassed because `find_by_property` is inherently vault-wide (FR-002).
- **Polymorphic `value`**: matches FR-005's "string | number | boolean | null | array<scalar>". The array branch is allowed only when `arrayMatch: false` (enforced via `superRefine`).
- **`folder` regex**: implements FR-021 / Q2 path-traversal closure. The pattern matches both Unix `/` and Windows `\` separators (per [research.md R8](./research.md#r8--folder-path-traversal-closure-q2--schema-level-rejection)).
- **`arrayMatch` / `caseSensitive` defaults**: both default to `true` per the user input and FR-007 / FR-008. The `.default(true)` form means `z.infer<...>` produces `boolean` (not `boolean | undefined`) on the parsed object; downstream code reads them unconditionally.
- **`additionalProperties: false`**: enforced via `.strict()` per FR-009.

### Inferred TypeScript type

```ts
type FindByPropertyInput = {
  vault?: string;
  property: string;
  value: string | number | boolean | null | (string | number | boolean | null)[];
  folder?: string;
  arrayMatch: boolean;        // post-default(true) — always a boolean
  caseSensitive: boolean;     // post-default(true)
};
```

---

## 2. Output schema (zod)

```ts
export const findByPropertyOutputSchema = z
  .object({
    count: z.number().int().nonneg(),
    paths: z.array(z.string()),
  })
  .strict();

export type FindByPropertyOutput = z.infer<typeof findByPropertyOutputSchema>;
```

Per FR-010 / FR-011: `count === paths.length` is an invariant the handler enforces post-eval (defensive sanity check; the JS template constructs the envelope correctly by construction, but the handler verifies before returning).

---

## 3. JS template (frozen string constant in handler.ts)

The handler holds a frozen JS template string. The template:

1. Parses the base64 payload at runtime via `atob`+`JSON.parse`.
2. Walks `app.metadataCache.fileCache` keys.
3. Filters by folder prefix (skip if not under `prefix`).
4. Looks up frontmatter via `app.metadataCache.metadataCache[fileCache[path].hash].frontmatter`.
5. Skips files without frontmatter or without the named property.
6. Compares against `value` per the matching contract (R7).
7. Pushes matching paths to a result array.
8. Returns `JSON.stringify({count, paths})`.

```ts
// src/tools/find_by_property/handler.ts (template literal, frozen)
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

The `__PAYLOAD_B64__` placeholder is replaced with the base64-encoded payload at request time:

```ts
const payloadB64 = Buffer.from(JSON.stringify({
  property: input.property,
  value: input.value,
  folder: input.folder ?? "",
  arrayMatch: input.arrayMatch,
  caseSensitive: input.caseSensitive,
})).toString("base64");
const code = JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64);
```

**Anti-injection guarantee** (R6): the JS template is a frozen string constant. The only variable inserted into it is the base64 payload, which is structurally constrained to `[A-Za-z0-9+/=]` and cannot escape a single-quoted JS string literal. User-supplied `property` / `value` / `folder` flow through `JSON.stringify` → base64 → the JS template's `atob` + `JSON.parse` chain. No user input ever reaches the JS source as text.

---

## 4. CLI invocation argv shape

```ts
await invokeCli(
  {
    command: "eval",
    vault: input.vault,                                    // omitted if user omits
    parameters: { code: <rendered JS template> },
    flags: [],
    target_mode: input.vault === undefined ? "active" : "specific",
  },
  { spawnFn, env, logger, queue },
);
```

Resulting argv (specific mode example):
```
[obsidian-binary] vault=Demo eval code=<rendered JS>
```

Resulting argv (active mode — no vault):
```
[obsidian-binary] eval code=<rendered JS>
```

The cli-adapter's existing argv assembly produces this shape; no adapter changes needed (R4).

---

## 5. Eval response parsing

The CLI prefixes successful eval responses with `=> ` (literal three characters: `=`, `>`, space). The handler's parse step:

```ts
const stdout = result.stdout.trimStart();
const prefix = "=> ";
const jsonText = stdout.startsWith(prefix) ? stdout.slice(prefix.length) : stdout;
const parsed = findByPropertyOutputSchema.parse(JSON.parse(jsonText));
return parsed;
```

If `JSON.parse` fails OR `findByPropertyOutputSchema.parse` rejects, the handler throws `UpstreamError({code: "CLI_REPORTED_ERROR", details: {stdout, stage: "parse"}})`. This is the structural backstop against an Obsidian internal-API change that breaks the JS template's response shape (R2 stability concern).

---

## 6. Per-tool invariants

| Invariant | Source | Enforcement |
|---|---|---|
| Schema rejects empty `property` | FR-004 | `z.string().min(1)` |
| Schema rejects missing `value` | FR-005 | `value` is required (no `.optional()`) |
| Schema rejects unknown top-level keys | FR-009 | `.strict()` |
| Schema rejects `folder` with `..` or leading `/` `\` | FR-021 / Q2 | `.refine(FOLDER_TRAVERSAL_REGEX)` |
| Schema rejects `value: array` when `arrayMatch: true` | FR-007 / US3 implicit | `.superRefine` cross-field check |
| Type-faithful comparison | FR-013 | JS strict equality (`===`) inside JS template |
| YAML-null vs absent distinguishability | FR-014 | `!(args.property in fm)` skip vs `fm[args.property] === null` match |
| `caseSensitive: false` folds case for strings only | FR-015 | `eq(x, y)` template branch |
| `arrayMatch: false` is order-sensitive (Q1) | FR-016 | `arrEq` uses positional `every((e, i) => eq(e, y[i]))` |
| `count === paths.length` | FR-011 | `findByPropertyOutputSchema` shape + handler post-check |
| Zero-match returns `{count:0, paths:[]}`, not error | FR-012 | JS template returns `{count:0, paths:[]}` envelope; wrapper does not coerce |
| Unknown vault produces `CLI_REPORTED_ERROR` | FR-017 / SC-009 | cli-adapter's existing 011-R5 inspection clause (R5) |
| Output `paths` order stable in-session | FR-022 / SC-018 | `for (const p in fileCache)` — V8 insertion order (R9) |
| No new error codes | FR-019 / SC-014 | All failures flow through `VALIDATION_ERROR` + cli-adapter's four codes |
| Argv data-passing anti-injection | FR-020 / SC-017 | Frozen JS template + base64 payload (R6) |
| List-of-mappings non-match | FR-024 | JS template's `eq` returns `false` for object-element comparisons (`{} === {}` is `false`) |
| Hierarchical-tag rollup NOT performed | FR-023 | JS template treats tags as opaque values; no rollup logic |
| Original-no-upstream attribution header | FR-029 / Constitution V | Header on `schema.ts` / `handler.ts` / `index.ts` |
| Existing typed tools' public surface unchanged | FR-028 / SC-011 | Module added; no edits to existing `read_*` / `write_*` / `delete_*` / `obsidian_exec` |

---

## 7. Module LOC budget

| File | Estimated LOC | Notes |
|---|---|---|
| `schema.ts` | ~50 | input schema (5 fields + cross-field refine + folder regex), output schema, type aliases via `z.infer`, `// Original` header |
| `handler.ts` | ~110 | `executeFindByProperty(input, deps)` + JS template constant + base64 payload renderer + eval response parser + adapter glue. Higher than 013's ~80 because the JS template body adds bulk and the parse step has to strip the `=> ` prefix. |
| `index.ts` | ~30 | `createFindByPropertyTool({logger, queue})` factory via `registerTool`, doc-presence assertion |
| `schema.test.ts` | ~150 | ~18 cases — see test inventory below |
| `handler.test.ts` | ~310 | ~24 cases — see test inventory below (post-/speckit-analyze C2 remediation: 22 → 24, adding cases 23 + 24 for FR-023 / FR-024 wrapper-non-transformation locks) |
| `index.test.ts` | ~70 | ~5 cases — descriptor name, stripped schema, help mention, doc presence + content completeness, drift-detector parameterised lock |

**Total new code**: ~190 LOC implementation + ~500 LOC tests = ~690 LOC. Within the project's existing module-size norms.

---

## 8. Test inventory (per FR-026 / SC-013 — ≥ 30 cases total)

Total: **47 cases** (18 schema / 24 handler / 5 registration; bumped 45 → 47 by /speckit-analyze C2 remediation closing FR-023 / FR-024 coverage gaps). Higher than 013's 41 because the matching-logic surface area is larger (six axes: scalar/array, contains/exact, case-sensitive/insensitive, folder/no-folder, type-faithful, null-vs-absent) and the C2 remediation added two wrapper-non-transformation locks.

### `schema.test.ts` — 18 cases

| # | Case | Asserts |
|---|---|---|
| 1 | `property: ""` rejected | `min(1)` fires |
| 2 | `property` omitted rejected | required field |
| 3 | `value` omitted rejected | required field |
| 4 | `value: undefined` rejected | union does not admit `undefined` |
| 5 | `value: { foo: "bar" }` rejected | object not in union |
| 6 | `value: ["x"]` rejected when `arrayMatch: true` (default) | superRefine fires |
| 7 | `value: ["x"]` accepted when `arrayMatch: false` | passes |
| 8 | Each scalar `value` type accepted (string, number, boolean, null) | union members |
| 9 | Unknown top-level key rejected | `.strict()` |
| 10 | `folder: ".."` rejected | path-traversal regex |
| 11 | `folder: "../foo"` rejected | leading `..` segment |
| 12 | `folder: "foo/.."` rejected | trailing `..` segment |
| 13 | `folder: "foo/../bar"` rejected | middle `..` segment |
| 14 | `folder: "/abs"` rejected | leading slash |
| 15 | `folder: "\\abs"` rejected | leading Windows slash |
| 16 | `folder: "..foo"` accepted (not a path segment) | regex word-boundary |
| 17 | `folder: ""` accepted (empty = whole-vault) | empty-string OK |
| 18 | `arrayMatch` / `caseSensitive` defaults applied when omitted | post-parse values are `true`, `true` |

### `handler.test.ts` — 24 cases

Each case asserts: parsed result, ONE spawn invocation, argv shape (binary + optional `vault=`+`eval`+`code=...`), and that the `code=` payload's base64 portion decodes to the expected JSON.

| # | Case | Mocked CLI response |
|---|---|---|
| 1 | Scalar string happy-path | `=> {"count":1,"paths":["a/b.md"]}` |
| 2 | Scalar number happy-path (type-faithful) | `=> {"count":1,"paths":["a/b.md"]}` |
| 3 | Scalar boolean happy-path | `=> {"count":1,"paths":["a/b.md"]}` |
| 4 | Scalar null happy-path (explicit-null match) | `=> {"count":1,"paths":["a/b.md"]}` |
| 5 | No-match returns `{count:0, paths:[]}`, no error | `=> {"count":0,"paths":[]}` |
| 6 | Multi-match returns multiple paths | `=> {"count":3,"paths":["a","b","c"]}` |
| 7 | Folder-narrow happy-path | `=> {"count":1,"paths":["folder/x.md"]}` |
| 8 | Folder-exclude returns `{count:0, paths:[]}` | `=> {"count":0,"paths":[]}` |
| 9 | `arrayMatch: true` (default) — payload check | argv-payload assertion |
| 10 | `arrayMatch: false` with array `value` — payload check | argv-payload assertion |
| 11 | `caseSensitive: false` — payload check | argv-payload assertion |
| 12 | `vault` omitted → no `vault=` in argv (active-mode mapping) | argv-shape assertion |
| 13 | `vault` supplied → `vault=` in argv | argv-shape assertion |
| 14 | Unknown vault → `CLI_REPORTED_ERROR` (R5 inheritance) | `Vault not found.\n` exit 0 |
| 15 | `CLI_NON_ZERO_EXIT` propagation (eval syntax error case) | exit 1 with stderr |
| 16 | `CLI_BINARY_NOT_FOUND` propagation | spawn ENOENT |
| 17 | Output-cap kill propagation (large match set) | `dispatchKill` raised |
| 18 | Eval response not prefixed with `=> ` parses anyway | bare JSON envelope |
| 19 | Eval response is malformed JSON → `CLI_REPORTED_ERROR` parse stage | non-JSON stdout |
| 20 | Eval response shape violates output schema → `CLI_REPORTED_ERROR` | `{wrong:"shape"}` |
| 21 | Anti-injection: `value: "'; alert(1); //"` survives base64 round-trip | argv-payload decode assertion |
| 22 | Anti-injection: `property: "name'; drop"` survives base64 round-trip | argv-payload decode assertion |
| 23 | FR-023 — hierarchical-tag-rollup not performed (added by /speckit-analyze C2): `value: "work"` against `tags`; assert no wrapper-side rollup translation | argv-payload decode + `{count:0,paths:[]}` |
| 24 | FR-024 — list-of-mappings query yields no-match envelope (added by /speckit-analyze C2): scalar query against list-of-mappings property; assert wrapper does NOT inject defensive type-of-property check | argv-payload decode + `{count:0,paths:[]}` |

### `index.test.ts` — 5 cases

| # | Case |
|---|---|
| 1 | Tool descriptor name is `find_by_property` |
| 2 | Stripped JSON Schema (descriptions removed) is published |
| 3 | Help facility mentions `find_by_property` |
| 4 | `docs/tools/find_by_property.md` exists AND covers per-field input contract + output shape + failure-mode roster + ≥4 worked examples |
| 5 | Drift-detector at `_register.test.ts` registry walk auto-covers `find_by_property` (parameterised lock) |

---

## 9. Failure / error code mapping

| Failure | Surface | Code |
|---|---|---|
| Missing / empty `property` | schema | `VALIDATION_ERROR` |
| Missing `value` | schema | `VALIDATION_ERROR` |
| `value` typed outside the union (or array+arrayMatch:true) | schema | `VALIDATION_ERROR` |
| `folder` traversal escape | schema | `VALIDATION_ERROR` |
| Unknown top-level key | schema | `VALIDATION_ERROR` |
| Unknown vault display name | adapter (011-R5 clause) | `CLI_REPORTED_ERROR` |
| Obsidian not running / not reachable | adapter (existing dispatch error classification) | `CLI_NON_ZERO_EXIT` or `CLI_REPORTED_ERROR` (whichever the dispatch produces) |
| Output exceeds 10 MiB cap | adapter (existing kill-on-cap path) | `CLI_NON_ZERO_EXIT` |
| Eval syntax error (defensive — should not occur with frozen template) | adapter | `CLI_NON_ZERO_EXIT` |
| Eval response shape violates output schema | handler post-eval | `CLI_REPORTED_ERROR` (parse stage) |
| Spawn fails (binary missing) | adapter | `CLI_BINARY_NOT_FOUND` |

Zero new error codes per FR-019 / SC-014. Every failure flows through the existing four cli-adapter codes (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE` — last is N/A for this tool because there is no active-file concept) plus `VALIDATION_ERROR` from zod.

---

## 10. Cross-references

- [spec.md](./spec.md) — feature spec (29 FRs, 18 SCs, 8 user stories)
- [research.md](./research.md) — Phase 0 design decisions R1–R14 + live CLI findings F1–F8
- [contracts/find-by-property-input.contract.md](./contracts/find-by-property-input.contract.md) — public input contract
- [contracts/find-by-property-handler.contract.md](./contracts/find-by-property-handler.contract.md) — handler invariants
- [quickstart.md](./quickstart.md) — verification scenarios mapped to SC-001..SC-018
