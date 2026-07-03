# Phase 0 Research: Tech Stack Upgrade

**Feature**: `067-upgrade-tech-stack` | **Date**: 2026-07-04
**Sources**: two adversarially verified research passes run 2026-07-04 — a 21-agent
morning analysis (6 research tracks, 15 verifiers, 3 claims refuted and corrected) and
a 4-agent plan-time probe workflow (empirical scratchpad probes against zod@4.4.3,
typescript@6.0.3, eslint@10.6.0 + a live registry dump of all 34 tools). All registry
claims re-verified at plan time; zero drift between the two passes.

## R1 — Version pin table (registry state re-verified at HEAD)

**Decision**: adopt the following pins.

| Package | Current | Pin to write | Note |
|---|---|---|---|
| zod | ^3.23.8 (3.25.76) | `^4.4.3` | floor raise is real: SDK peer needs ≥3.25 |
| zod-to-json-schema | ^3.23.5 | **remove** | deprecated upstream Nov 2025; superseded by `z.toJSONSchema` |
| @modelcontextprotocol/sdk | ^1.0.4 (1.29.0) | `^1.29.0` | 1.29.0 is npm latest; zod peer `^3.25 \|\| ^4.0`; no 2.x tag exists |
| typescript | ^5.6.3 (5.9.3) | `~6.0.3` | **tilde, not caret** — typescript-eslint caps `<6.1.0` |
| typescript-eslint | ^8.59.1 | `^8.62.1` | peers: eslint `^8.57 \|\| ^9 \|\| ^10`, ts `>=4.8.4 <6.1.0` |
| @typescript-eslint/eslint-plugin | ^8.18.0 | **remove** | redundant: unused by eslint.config.js (meta-package wires plugin+parser) |
| @typescript-eslint/parser | ^8.18.0 | **remove** | same |
| eslint | ^9.17.0 (9.39.4) | `^10.6.0` | 9.x now `maintenance` dist-tag |
| eslint-plugin-import | ^2.32.0 | **remove** | peer caps at `^9`; dormant >12 months; sole ESLint-10 blocker |
| eslint-plugin-import-x | — | `^4.17.1` | successor; peers eslint `^8.57 \|\| ^9 \|\| ^10`, @typescript-eslint/utils `^8.56` |
| eslint-plugin-n | ^17.24.0 | `^18.2.1` | peer eslint `>=8.57.1`; engines node `^20.19 \|\| ^22.13 \|\| >=24` |
| eslint-plugin-jsonc | ^3.1.2 | `^3.2.0` | peer eslint `>=9.38.0` |
| eslint-plugin-promise | ^7.3.0 | keep | peer already includes `^10` |
| eslint-config-prettier | ^10.1.8 | keep | peer `>=7.0.0` |
| jsonc-eslint-parser | ^3.1.0 | keep | no eslint peer |
| vitest | ^4.1.5 | `^4.1.9` | move in lockstep with coverage-v8 |
| @vitest/coverage-v8 | ^4.1.5 | `^4.1.9` | peer-pins vitest **exactly** — identical ranges mandatory |
| prettier | ^3.4.2 (3.8.3) | `3.8.5` **exact** | 3.9-line hold; see R8 |
| @types/node | ^22.10.0 | `^22.20.0` | stay on major 22 = engines floor |
| actions/checkout | v4 | `v7` | node24 runtime; plain push/PR triggers → major-tag pin appropriate |
| actions/setup-node | v4 | `v6` | node24 runtime; `cache: npm` config unchanged |

**Rationale**: every version and peer range read from the npm registry / GitHub API on
2026-07-04 (probe D); nothing moved since the morning analysis. The two non-obvious
pins: typescript tilde (typescript-eslint's `<6.1.0` cap would break a caret on the day
6.1 ships) and prettier exact (open upstream regression, R8).
**Alternatives considered**: caret typescript (rejected — guaranteed future breakage);
SHA-pinned actions (rejected — no `pull_request_target`/fork surface in ci.yml, so
major tags get security patches without maintenance cost); waiting for
eslint-plugin-import to support ESLint 10 (rejected — no release in >12 months, no
signal).

## R2 — Descriptor pipeline: `z.toJSONSchema` + 4-rule normalization (Q1 mechanism corrected)

**Decision**: `toMcpInputSchema` becomes
`z.toJSONSchema(schema, { io: "input", target: "draft-7" })` followed by one recursive
normalization pass with exactly four rules:

1. Delete `propertyNames` when it deep-equals `{"type":"string"}` (v4 stamps it on
   records; v3 never emitted it) — **else** set `additionalProperties: true` when it is
   `{}` (looseObject emission; the else-if ordering disambiguates record-of-unknown,
   which legitimately keeps `{}` in both versions, via the propertyNames marker).
2. Collapse `anyOf` → `type: [...]` when every branch is a bare single-key primitive
   `{type: <primitive>}` and the node has no own `type` (reproduces the v3 converter's
   all-or-nothing primitive-union collapse; mixed unions correctly stay `anyOf`).
3. On `type: "integer"` nodes delete `maximum === 9007199254740991` and
   `minimum === -9007199254740991` (v4 stamps `Number.MAX_SAFE_INTEGER` bounds on
   unbounded ints; v3 emitted none).
4. Rename `oneOf` → `anyOf` (v4 emits `oneOf` for discriminated unions; v3 emitted
   `anyOf`).

**CRITICAL premise correction to clarify Q1**: today's published descriptors already
carry `$schema: "http://json-schema.org/draft-07/schema#"` **inside the hashed bytes**
(live dump of all 34 tools, fingerprints recomputed and matched against the committed
baseline). The clarify-session premise "the old converter emitted no such key" was
wrong, so the literal "strip the key" decision would fail every fingerprint. The
`target: "draft-7"` option emits the byte-identical draft-07 URI natively. Q1's
*intent* — descriptors byte-identical, baseline passes unregenerated, zero
client-visible drift — is preserved exactly; only the mechanism changes. Spec amended
accordingly (see Clarifications correction note).

**Proof**: 22 fixtures mirroring every shape family in the repo (census across all 34
published inputSchemas: `{type, minLength, additionalProperties, properties, $schema,
required, enum, default, maxLength, maximum, minimum, description, items, anyOf,
pattern, exclusiveMinimum}` — a closed, small surface) are canonical-identical after
the transform; live-registry fingerprint sanity run: ALL 34 MATCH the committed
baseline. Rules 1–3 are load-bearing today (`obsidian_exec.parameters` propertyNames +
union collapse, `find_by_property.value.anyOf[4].items` union collapse, `paths.depth`
safe-int); rule 4 is future-proofing (discriminated unions exist only in unpublished
wire schemas today).
**Alternatives considered**: strip `$schema` (refuted by live dump — breaks all 34
fingerprints); regenerate the baseline (rejected — violates the clarified FR-009:
the baseline is the gate, it must not be updated to match the migration); keep
zod-to-json-schema on the zod/v3 subpath (rejected — deprecated upstream, defeats the
migration's purpose).
**Caveats carried into plan**: rule 3 cannot distinguish a hand-authored
`.max(9007199254740991)` (none exists; note added to the normalizer contract); rule 1's
marker only matches plain `z.record(z.string(), …)` key schemas (the only kind in the
repo); shape families the repo doesn't use (tuples, intersections, `.nullable()`,
`z.lazy`, pipes) are unprobed — any future BI introducing one must extend the parity
fixtures; emission details churned across zod 4.x minors — re-run the probe suite if
the zod pin moves.

## R3 — zod v4 API mapping (validation behavior; Q2 scope corrected)

**Decision**: adopt this mapping table.

| v3 form (sites) | v4 form | Status |
|---|---|---|
| `required_error`/`invalid_type_error` params (4 fields: create_base, query_base) | `{ error: (issue) => issue.input === undefined ? R : T }` | **mandatory** — v4 silently ignores old params; exact message parity proven |
| `.passthrough()` (2: outline, properties) | `.loose()` | **mandatory** — @deprecated |
| single-arg `z.record(z.unknown())` (1: read_property) | `z.record(z.string(), z.unknown())` | **mandatory** — hard compile error TS2554 in v4 |
| `ZodTypeAny` (5 occ., _shared.ts + _register.ts) | `z.ZodType` (bare) | **mandatory** — @deprecated; `z.infer` still flows |
| `ZodIssue` (_register.ts, find_and_replace, prepend) | `z.core.$ZodIssue` | **mandatory** — @deprecated |
| `z.ZodIssueCode.custom` (~45 sites, 18 files) | string literal `"custom"` | **mandatory** — ZodIssueCode @deprecated; type-safe (issue code is literal type) |
| `.strict()` (115 occ., 43 files) | `z.strictObject()` | **style conversion, included** — NOT deprecated (prose-only note in v4); user chose full modernization; descriptor parity proven |
| `.superRefine()` (20 occ., 16 files) | **KEEP** | NOT deprecated in 4.4.3 (returns `this`); IS the v4-canonical form; `.check()` is strictly worse (raw issues need extra `input` field) |
| `.default(literal)` (15 sites) | **KEEP** | never `.prefault()` — all repo defaults are valid plain literals |
| `.refine(fn, "msg")`, `z.enum`, `ZodError`, `err.issues`, `z.infer`, `z.RefinementCtx` | **KEEP** | non-deprecated, behavior unchanged |

**Premise correction to clarify Q2**: the clarify-session option text presented
`.strict()` and `.superRefine()` as deprecated. Probes against zod 4.4.3 `.d.ts` show
neither carries an `@deprecated` tag (`.strict()` softened to a prose note;
`.superRefine()` untagged and returning `this`). FR-016's normative core — zero
*deprecated* API usage at completion — is therefore satisfied by the mandatory rows
alone. The `.strict()` → `z.strictObject()` conversion is retained as the user-chosen
modernization posture (zod's own prose recommends it; descriptor parity proven by R2);
`.superRefine()` stays because converting it would move *away* from the v4-canonical
API. Spec amended with this correction note.

**Behavioral proofs** (probe B, all under tsc 6.0.3 strict NodeNext, compiled clean and
executed): error-callback form reproduces v3 custom messages byte-identically with
`code: "invalid_type"` unchanged, so the `_register.ts` envelope `{path, message,
code}` is untouched; `ctx.addIssue({code:"custom", path, message, params})` survives
verbatim — the repo's `customIssueParams` test helper ran unmodified against a v4
`ZodError` (ADR-015 machine-code sub-discrimination unaffected); refinement gating
parity confirmed (superRefine skipped when base parse aborts — v3 short-circuit
semantics exact); a mirror of `registerTool`'s generic signature with
`TSchema extends z.ZodType` + `z.core.$ZodIssue[]` compiled and produced correct
VALIDATION_ERROR envelopes.
**Accepted drift** (already in spec assumptions): default locale messages on fields
*without* custom errors reword (`"Required"` → `"Invalid input: expected string,
received undefined"`; unrecognized-key message rewords, code `unrecognized_keys`
unchanged). Grep-verified: no repo test asserts those default strings.
**Hazard encoded as test obligation**: old `{required_error, invalid_type_error}`
params construct fine under v4 and silently no-op — the four migrated fields MUST have
message-asserting tests in the same change.

## R4 — SC-009 deprecation gate

**Decision**: permanent hybrid gate in `eslint.config.js` (three pieces):

1. `"@typescript-eslint/no-deprecated": "error"` in the existing type-aware
   `src/**/*.ts` block (`projectService: true` already configured). Covers every
   `@deprecated`-tagged form — `.passthrough()`, `ZodTypeAny`, `ZodIssue`,
   `z.ZodIssueCode`, string-format methods — and future zod deprecations for free. Not
   in the repo's `recommended` preset (verified across all six presets in 8.62.1; only
   `strictTypeChecked` has it) → explicit enable mandatory. Loud-fail: exits 2 if type
   info is missing, cannot silently pass.
2. `"no-restricted-syntax"` selectors banning reintroduction of the v3-era idioms the
   sweep eliminates: `.strict()` zero-arg (`CallExpression[callee.property.name=
   'strict'][arguments.length=0]`), `.passthrough()`, `.strip()` — each with a message
   naming the v4-canonical replacement. **No selector for `.superRefine()`** — it is
   the canonical form and stays (R3).
3. `"no-restricted-imports"` banning `zod-to-json-schema` and `zod/v3` — the post-swap
   regression guard.

**Rationale**: `no-deprecated` alone misses `.strict()` (no tag, prose only), so the
syntax layer is what makes the gate version-drift-proof. Removed-in-v4 forms
(`.nonstrict()`, `deepPartial`) need no rule — tsc hard-fails TS2551. The
`{ message }`-param blind spot (tag lost through mapped types) has zero repo exposure
(multiline grep: no param-position uses); recorded as a one-off migration grep in
tasks, not a permanent gate.
**Alternatives considered**: one-off gate at migration time (rejected — new tools are
authored by copying old schema patterns; 115+20 current occurrences prove the idiom is
endemic, so permanent enforcement is what keeps SC-009 true after this BI);
`strictTypeChecked` preset wholesale (rejected — pulls dozens of unrelated rules into a
lint config the repo has deliberately curated).
**Cost caveat**: first type-aware rule in the repo — lint time grows by roughly one
type-check; `no-deprecated` is codebase-wide, so non-zod deprecated APIs may surface at
implement time (budget a triage pass; fix or per-line disable with justification).

## R5 — ESLint 10 migration mechanics

**Decision**: in `eslint.config.js`: swap `import importPlugin from
"eslint-plugin-import"` → `import importX from "eslint-plugin-import-x"`; plugin key
`import` → `import-x`; rules `import/order` → `import-x/order` (same options object)
and `import/no-unresolved` → `import-x/no-unresolved` (stays `"off"`, same rationale
comment). Bump eslint to 10.6.0, eslint-plugin-n to 18.2.1, eslint-plugin-jsonc to
3.2.0, typescript-eslint to 8.62.1. Remove the redundant legacy
`@typescript-eslint/eslint-plugin` + `parser` devDependencies (config imports only the
meta-package).
**Rationale**: repo is already pure flat config, so ESLint 10's headline break (legacy
eslintrc removal) costs nothing; config-lookup-from-file change is a no-op (single root
config); the repo does not extend `eslint:recommended` core rules so the three newly
recommended core rules do not auto-enable; the `n/` rules most prone to v18 behavior
drift are already disabled (`n/no-missing-import`, `n/no-unsupported-features/*`).
Verification obligation: an intentionally mis-ordered import must still produce an
`import-x/order` diagnostic (US3 acceptance scenario 2).
**Node floor caveat**: eslint 10 and eslint-plugin-n 18 both declare engines
`^20.19.0 || ^22.13.0 || >=24`. The published runtime floor (engines `>=22.11`) is
unchanged (FR-013); document Node ≥22.13 as the dev-toolchain minimum in
CONTRIBUTING/README. CI's `setup-node` with `node-version: 22` resolves latest 22.x —
unaffected.

## R6 — TypeScript 6.0 migration mechanics

**Decision**: bump to `~6.0.3`; add `"types": ["node"]` to `tsconfig.json`
compilerOptions (tsconfig.build.json extends it — one edit covers typecheck + build).
No other config or source edits.
**Rationale**: empirically proven (morning verify pass): `tsc 6.0.3 --noEmit` fails
with mass TS2591/TS2503 without `types: ["node"]` and exits 0 with it. Every other
TS 6.0 default flip is pre-empted by explicit config (strict, module NodeNext, target
ES2024, rootDir src, esModuleInterop) or unused patterns (no side-effect imports, no
baseUrl/outFile/node10). Zero deprecation warnings expected — which is also the
prescribed on-ramp to TS 7 (7.0.1-rc live on the `rc` dist-tag since 2026-06-18;
typescript-eslint does not support 7.x yet, so 6.0 is the supported ceiling today).

## R7 — CI workflow modernization

**Decision**: `actions/checkout@v7`, `actions/setup-node@v6`; convert single
`node-version: "22"` to a matrix `node-version: [22, 24]` (floor line + Active LTS).
Keep `cache: npm`.
**Rationale**: v4 actions run the node20 runtime — GitHub runners default to node24
since 2026-06-16 and remove node20 "later in the fall of 2026" (verify pass corrected
the morning claim of a hard 2026-09-16 break: forced migration is the precedent, so
this is hygiene, not a deadline). checkout v7's ESM/fork-PR restrictions don't apply
(plain push/PR triggers). Matrix rationale: the Active-LTS lane catches
runtime-compatibility regressions before release (US5 edge case: a 24-lane failure is a
release blocker, not a reason to drop the lane). Node 26 lane deliberately not added —
Current, not LTS; revisit when 26 enters Active LTS (2026-10-28).

## R8 — Prettier hold (unchanged from spec)

**Decision**: pin `3.8.5` exact (highest 3.8.x patch; currently installed 3.8.3 →
in-range refresh). Do not adopt 3.9.x.
**Rationale**: prettier/prettier#19510 (3.9.0 regression: blank lines injected around
HTML comments in Markdown lists) re-verified OPEN at plan time, reporter confirms 3.9.4
still affected; the repo formats 20+ tracked `.md` files containing HTML comments via
`prettier --check .`. Exact pin (no range) because any caret would resolve into the
3.9 line. Re-check the issue at the next dependency-refresh BI.

## R9 — Increment → artifact map (execution order, from spec US1–US5)

| Increment | package.json | Config/source | Gate |
|---|---|---|---|
| US1 baseline | vitest/coverage 4.1.9, tseslint 8.62.1, jsonc 3.2.0, @types/node 22.20.0, prettier 3.8.5 exact + `npm update`/`npm audit fix` | none | audit = 0; suite green; no direct-dep change from audit fix |
| US2 compiler | typescript `~6.0.3` | tsconfig.json `types: ["node"]` | typecheck/build clean, zero deprecation warnings |
| US3 linter | eslint ^10.6.0, import→import-x, n ^18.2.1, remove legacy tseslint pair | eslint.config.js plugin/rule rename | lint zero new violations; mis-ordered-import probe fires |
| US4 zod | zod ^4.4.3, remove zod-to-json-schema, SDK floor ^1.29.0 | toMcpInputSchema pipeline (R2), API mapping sweep (R3), SC-009 gate rules (R4), strip-schema.test.ts fixture swap | fingerprint baseline passes UNREGENERATED; customIssueParams tests green; message-assert tests on 4 fields |
| US5 CI | — | ci.yml actions v7/v6 + matrix [22, 24] | both lanes green, no runtime deprecation warnings |

All NEEDS CLARIFICATION: **none remain** — every Technical Context entry below is
pinned by probe evidence.
