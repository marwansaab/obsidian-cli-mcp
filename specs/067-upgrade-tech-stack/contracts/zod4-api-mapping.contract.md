# Contract: zod v3 → v4 API Mapping (US4 sweep)

**Feature**: `067-upgrade-tech-stack` (US4) | **Date**: 2026-07-04
**Scope**: all `src/**` files importing `zod` (49 files: ~30 production schemas, shared
modules, tests). Every mapping empirically proven under zod@4.4.3 + tsc 6.0.3 strict
NodeNext (probe B evidence in [research.md](../research.md) R3).

## Mandatory migrations (deprecated or removed in v4)

| # | Old form | New form | Sites | Proof of parity |
|---|---|---|---|---|
| M1 | `z.string({ required_error: R, invalid_type_error: T })` | `z.string({ error: (issue) => issue.input === undefined ? R : T })` | create_base/schema.ts + query_base/schema.ts (4 fields) | byte-identical messages; `code` stays `invalid_type` |
| M2 | `.passthrough()` | `.loose()` | outline/schema.ts:33, properties/schema.ts:44 | unknown keys retained; descriptor via N1b |
| M3 | `z.record(z.unknown())` (single-arg) | `z.record(z.string(), z.unknown())` | read_property/schema.ts:38 | compile-forced (TS2554 in v4); descriptor via N1 |
| M4 | `ZodTypeAny` (type) | `z.ZodType` (bare, no generics) | _shared.ts, _register.ts (5 occ.) | `z.infer<TSchema>` still flows concrete handler types; mirror compiled clean |
| M5 | `ZodIssue` (type) | `z.core.$ZodIssue` | _register.ts, find_and_replace/index.ts, prepend/index.ts | envelope map `{path, message, code}` compiles + runs |
| M6 | `z.ZodIssueCode.custom` | string literal `"custom"` | ~45 sites / 18 files | type-safe (`$ZodIssueCustom.code` is literal `"custom"`); runtime value identical |

## Style conversion (user-chosen full-modernization posture; not deprecated)

| # | Old form | New form | Sites | Note |
|---|---|---|---|---|
| S1 | `z.object({...}).strict()` | `z.strictObject({...})` | 115 occ. / 43 files | zod's own prose recommends it; descriptor byte-parity proven (identical `additionalProperties: false`, same `required` order); `.extend()`/`.omit()` chains carry over |

## Explicit KEEPs (do NOT migrate — premise correction to clarify Q2)

| Form | Why it stays |
|---|---|
| `.superRefine()` (20 occ. / 16 files) | NOT deprecated in 4.4.3 (returns `this`, no tag); IS the v4-canonical multi-issue refinement API; `.check()` requires raw issues with an extra `input` field for zero benefit. `ctx.addIssue({code:"custom", path, message, params})` survives verbatim — ADR-015 machine codes + `customIssueParams` helpers unaffected. |
| `.default(literal)` (15 sites / 9 files) | v4 `.default()` short-circuits without validating the default; all repo defaults are valid plain literals → behavior identical. NEVER convert to `.prefault()`. |
| `.strict()`-adjacent `.refine(fn, "msg")`, `z.enum([...])`, `z.literal` | Non-deprecated, emission + behavior identical. |
| `ZodError`, `err.issues`, `z.infer`, `z.RefinementCtx` | Unchanged in v4 (RefinementCtx aliases `core.$RefinementCtx`, still exported non-deprecated — _base-path.ts:26 signature needs no edit). |

## Behavioral invariants the sweep must hold (test-gated)

1. **Refinement gating**: superRefine skipped when base parse aborts (wrong type /
   missing field / unrecognized key ⇒ only the field-level issue) — v3 short-circuit
   parity proven; existing issue-list-shape assertions are the gate.
2. **Machine codes**: every `params: { code: … }` sub-discriminator (35 occ. / 10
   files) reaches `err.issues[i].params` verbatim; `customIssueParams` test helpers run
   unmodified.
3. **Envelope**: `{path, message, code}` mapping in `_register.ts:~82` unchanged;
   `err instanceof ZodError` still true.
4. **Message parity on migrated fields**: the 4 M1 fields MUST gain message-asserting
   tests in the same change — v4 SILENTLY ignores the old params (constructs fine,
   custom message lost), so a missed site fails no build and no existing test.
5. **Accepted drift** (documented, not gated): default-locale message text on fields
   without custom errors (e.g. `"Required"` → `"Invalid input: expected string,
   received undefined"`; unrecognized-key message rewording — `code` unchanged).

## Regression guards installed with the sweep (SC-009, permanent)

In `eslint.config.js` (src/**/*.ts type-aware block, projectService already on):

```
"@typescript-eslint/no-deprecated": "error",        // tagged forms + future zod deprecations
"no-restricted-syntax": ["error",
  { selector: "CallExpression[callee.property.name='strict'][arguments.length=0]",
    message: "Use z.strictObject({...}) (BI-067 modernization posture)" },
  { selector: "CallExpression[callee.property.name='passthrough']",
    message: "Use .loose() (zod 4)" },
  { selector: "CallExpression[callee.property.name='strip']",
    message: "Drop the call — strip is v3-era (zod 4)" }],
"no-restricted-imports": ["error",
  { paths: ["zod-to-json-schema", "zod/v3"] }]
```

No selector for `.superRefine()` — canonical, stays. `no-deprecated` is NOT in the
`recommended` preset (verified) — explicit enable required; it is the repo's first
type-aware rule (lint gains ~one type-check; loud-fails exit 2 if type info breaks).
Removed-in-v4 forms (`.nonstrict()`, `deepPartial`) need no rule — tsc hard-fails.
One-off migration grep (no permanent gate; zero current exposure): `{ message: … }` in
param position of `.min/.max/.refine` — the `@deprecated` tag is invisible to the rule
through zod's mapped types.

## Non-zod fallout budget

`no-deprecated` is codebase-wide: enabling it may flag deprecated Node/stdlib APIs
outside zod scope. Triage at implement time — fix trivially or per-line
`eslint-disable` with justification. Could not be pre-measured (repo still on zod 3;
tags differ).
