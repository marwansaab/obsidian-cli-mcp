# Research: Target Mode Schema Primitives

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-06

## Status

No `NEEDS CLARIFICATION` items remain after [spec.md](./spec.md)'s two clarifications (one `/speckit-clarify` session on 2026-05-06: Q1 composition export shape; Q2 active-mode forbidden-key error message specificity). This document records the empirical decisions, project-internal precedents, and plan-stage resolutions that Phase 1 design depends on.

## Decisions inherited from spec.md clarifications

| ID | Decision | Source |
|----|----------|--------|
| Q1 | Three exports — `targetModeSpecificSchema` (z.object for `"specific"` branch with the "exactly one of file/path" refinement), `targetModeActiveSchema` (z.object for `"active"` branch with the forbidden-key refinement), and `targetModeSchema = z.discriminatedUnion("target_mode", [specific, active])`. Downstream typed-tool schemas may extend via Pattern (a) — `.and()` on the union for uniform fields — OR Pattern (b) — `.extend()` on each per-branch z.object then re-build the discriminated union for divergent fields. | spec.md Clarifications, FR-001, FR-005, FR-010, Story 3 (Independent Test + AC#5), Key Entities |
| Q2 | Custom prose error messages naming the offending key AND `"active mode"` (or `target_mode` paired with `active`), with NO recovery instruction. Recovery semantics differ per tool — they belong in `docs/tools/*.md` (BI-030) and per-tool MCP tool descriptions, not in the shared schema primitive. | spec.md Clarifications, FR-004, Story 2 ACs #2–4, Out of Scope, Assumptions |

## Plan-stage decisions resolved during this Phase 0

The spec deliberately deferred four decisions to plan stage (FR-001 module path, FR-003 + FR-004 exact zod APIs, FR-001 + FR-010 export names, FR-012 type-system test mechanism). All four are resolved here:

| ID | Decision | Rationale |
|----|----------|-----------|
| P1 (FR-001, module path) | `src/target-mode/target-mode.ts` (source) and `src/target-mode/target-mode.test.ts` (co-located vitest). | Matches the per-surface module-layout convention used by `src/cli-adapter/` (the project's other shared primitive). The alternative `src/schemas/target-mode.ts` would only pay off if the project had multiple shared schema primitives to consolidate; it has exactly one (this feature) — YAGNI. The directory name `target-mode` (kebab-case) matches the file name verbatim, parallel to `cli-adapter/cli-adapter.ts`. |
| P2 (FR-004, active-mode forbidden-key zod API) | `.superRefine()` on the active-branch z.object schema. The refinement iterates over the three forbidden keys (`vault`, `file`, `path`) using `Object.hasOwn(input, key)` to detect property presence (regardless of value, including `undefined`) and emits one zod issue per offender via `ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: \`${key} is not allowed in active mode\` })`. | `.superRefine()` is the only zod API that supports per-key path AND per-key custom message AND multiple issues per parse call. `.refine()` produces a single issue; can't emit one per offender if multiple forbidden keys are present in the same input. `.never().optional()` produces zod-default messages like `"Expected never, received string"` that don't satisfy Q2's two-semantic-element requirement (key name + active mode) without a verbose custom `errorMap` per key. `Object.hasOwn` (not `key in input` or `input[key] !== undefined`) is what catches the explicit-`undefined` edge case (`{ target_mode: "active", vault: undefined }`) — undefined-valued keys still set the property, but `hasOwn` distinguishes "property exists" from "property absent." |
| P3 (FR-003, "exactly one of" zod API) | `.superRefine()` on the specific-branch z.object schema — same API as P2 for module-internal consistency. The refinement checks `(input.file === undefined) === (input.path === undefined)` (both undefined OR both defined → fail) and emits `ctx.addIssue({ code: z.ZodIssueCode.custom, path: [], message: "exactly one of \`file\` or \`path\` must be provided in specific mode (got neither)" })` when both are absent, OR two issues with `path: ["file"]` and `path: ["path"]` when both are present. Per FR-003 (upgraded by this plan from "recommended" to required for searchability), the message MUST contain the literal phrase `"exactly one of"` so that consumers can grep / pattern-match it. | Same API as P2 keeps the module's two refinements visually parallel and reduces the cognitive load on reviewers. The dual-issue emission for the both-provided case attributes the failure to both fields (more useful for tools that highlight invalid inputs); the single object-level issue for the neither-provided case attributes the failure to the missing pair (a per-field path would be misleading because no specific field is "wrong"). The literal-phrase requirement is upgraded because tests assert against `.message.includes("exactly one of")` and that contract is more useful as a binding rule than a recommendation. |
| P4 (FR-001 + FR-010, export names) | **Schemas** (camelCase + `Schema` suffix): `targetModeSpecificSchema`, `targetModeActiveSchema`, `targetModeSchema`. **Types** (PascalCase, derived via `z.infer`): `TargetModeSpecific`, `TargetModeActive`, `TargetMode`. The discriminator literal-union type is NOT exported separately — `TargetMode["target_mode"]` recovers it without a parallel hand-written type (Principle III). | The `<thing><Schema>` pattern matches the project's existing convention at [src/tools/obsidian_exec/schema.ts](../../src/tools/obsidian_exec/schema.ts) (`obsidianExecSchema`). The `targetMode` prefix on every export disambiguates this primitive's exports from any future schema primitive that might share names like `specificSchema` or `activeSchema`. The PascalCase types match the project's existing TypeScript-naming convention. Exporting the literal-union discriminator separately would either duplicate the source of truth (Principle III violation) or require `as const` gymnastics that buy nothing — `TargetMode["target_mode"]` is the canonical idiom. |
| P5 (FR-012, type-system test mechanism) | `expectTypeOf` from vitest, used inline in the same `*.test.ts` file as the runtime assertions. | Vitest 4.x (the project's pinned major per [package.json](../../package.json)) supports `expectTypeOf` natively — `import { expectTypeOf } from "vitest"`. It compiles to no-op at runtime; type assertions surface at compile time AND at vitest test-collection time, integrated into the same dashboard as the runtime assertions. No separate `*.type.test.ts` file (would add a new naming convention to the project), no `// @ts-expect-error` dance for negative cases (brittle to refactor), no third-party type-test library (zero new deps per project convention). |

## v0.1.x baselines reaffirmed

These constraints carry through unchanged from 001/002/003 and are *not* re-litigated by this feature:

- **`zod` ^3.23.8 is the boundary validator** (Constitution Technical Standards). `z.discriminatedUnion`, `.superRefine`, `.extend`, `.and`, and `z.infer` are all stable in 3.x. No upgrade to zod 4.x is required by this feature; if such an upgrade lands later, `.superRefine` and the discriminated-union API are part of zod 4's documented migration surface.
- **`zod-to-json-schema` ^3.23.5 is the JSON Schema generator** for downstream MCP `inputSchema` registration (per FR-006). The plan's contract validates that a Pattern (a) composed schema round-trips through it without throwing; downstream typed-tool BIs use the same generator to produce their MCP `inputSchema`.
- **Vitest + `@vitest/coverage-v8`** is the test framework (per constitution v1.1.0). The `*.test.ts` file at `src/target-mode/target-mode.test.ts` runs alongside the existing test set with no config changes.
- **Coverage floor 84.3% statements** at [vitest.config.ts](../../vitest.config.ts) (pinned by feature 002 and reaffirmed by feature 003). The new module + 16 acceptance tests + 13 edge-case tests + 3 type assertions are net-additive; pre-implementation projection is the actual statements coverage moves up by ≥ 0.4 pp once the new code path is exercised. The merge-gate floor stays at 84.3% and ratchets via a separate visible edit per the constitution's single-source-of-truth rule (v1.1.0 §Development Workflow #5).
- **No `Logger.ErrorCode` extension**: the primitive emits no log lines (FR-009 forbids the import). The first typed-tool BI that surfaces a zod-validation failure through `Logger.callEndFailure` is the right place to wire the existing `VALIDATION_ERROR` code; this primitive does not own that decision.
- **No new `UpstreamError.code` member**: the primitive raises `ZodError` (zod's own error type) on parse failure. The eight `UpstreamError.code` values from features 001/002/003 are unchanged. The README's error-codes table is unchanged.

## Module structure

The new module lives at `src/target-mode/` — a new directory under `src/` parallel to `src/cli-adapter/` and `src/tools/`. The directory contains exactly two files:

```text
src/target-mode/
├── target-mode.ts         # three exports + three inferred types + two `.superRefine` chains
└── target-mode.test.ts    # 16 acceptance + 13 edge-case + 3 expectTypeOf cases
```

The directory deliberately does NOT include a `command.ts` / `tool.ts` / `handler.ts` (no MCP/CLI registration — FR-008) or a separate `schema.ts` (the module IS the schema). This is intentional and parallel to `src/cli-adapter/`'s structure: shared primitives are not per-surface modules and do not follow the `{schema, command, handler}` triplet convention.

## Refinement-site analysis

The two `.superRefine()` calls land on the per-branch z.object schemas BEFORE they are passed to `z.discriminatedUnion`. Pseudocode:

```ts
import { z } from "zod";

const FORBIDDEN_KEYS_IN_ACTIVE = ["vault", "file", "path"] as const;

const specificBase = z.object({
  target_mode: z.literal("specific"),
  vault: z.string().min(1),
  file: z.string().optional(),
  path: z.string().optional(),
}).passthrough(); // base permissive — composition requires it (FR-005)

export const targetModeSpecificSchema = specificBase.superRefine((input, ctx) => {
  const hasFile = input.file !== undefined;
  const hasPath = input.path !== undefined;
  if (!hasFile && !hasPath) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message: "exactly one of `file` or `path` must be provided in specific mode (got neither)",
    });
  } else if (hasFile && hasPath) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["file"],
      message: "exactly one of `file` or `path` must be provided in specific mode (got both)",
    });
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["path"],
      message: "exactly one of `file` or `path` must be provided in specific mode (got both)",
    });
  }
});

const activeBase = z.object({
  target_mode: z.literal("active"),
}).passthrough(); // base permissive — composition requires it (FR-005)

export const targetModeActiveSchema = activeBase.superRefine((input, ctx) => {
  for (const key of FORBIDDEN_KEYS_IN_ACTIVE) {
    if (Object.hasOwn(input, key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is not allowed in active mode`,
      });
    }
  }
});

export const targetModeSchema = z.discriminatedUnion("target_mode", [
  targetModeSpecificSchema,
  targetModeActiveSchema,
]);

export type TargetModeSpecific = z.infer<typeof targetModeSpecificSchema>;
export type TargetModeActive = z.infer<typeof targetModeActiveSchema>;
export type TargetMode = z.infer<typeof targetModeSchema>;
```

The `.passthrough()` on each base z.object is what makes Pattern (a) and Pattern (b) composition work natively (FR-005): without it, zod's default `.strip()` would silently delete extra keys at parse time, which would then cause downstream `.and()` / `.extend()` extensions to lose data. With `.passthrough()`, extra keys survive the base parse so the composed schema's own field declarations can validate them.

The `Object.hasOwn` check (rather than `key in input` or `input[key] !== undefined`) is what catches the explicit-`undefined` edge case from the spec's Edge Cases section: `{ target_mode: "active", vault: undefined }` MUST fail. `Object.hasOwn` is `true` for `{vault: undefined}` and `false` for `{}` — exactly the discrimination needed.

The `as const` on `FORBIDDEN_KEYS_IN_ACTIVE` is required so TypeScript narrows `key` to the literal-union `"vault" | "file" | "path"` inside the loop (rather than widening to `string`), which lets the path-array element type-check against zod's `path` field.

## Composition-pattern analysis

Both Pattern (a) and Pattern (b) compositions survive zod's discriminated-union and refinement machinery. Empirical pseudocode for each:

### Pattern (a) — uniform extension via `.and()`

```ts
// Downstream tool wants `content: z.string()` on BOTH branches:
const writeNoteSchema = targetModeSchema.and(
  z.object({ content: z.string() })
);

// Type: TargetMode & { content: string }
// Parse `{ target_mode: "specific", vault: "V", file: "F", content: "Hello" }` → success
// Parse `{ target_mode: "active", vault: "V", content: "Hello" }` → fail (vault forbidden in active mode survives)
// Parse `{ target_mode: "specific", vault: "V", file: "F" }` → fail (content required)
```

The intersection preserves both per-branch refinements because `z.intersection` (which `.and()` returns) parses each operand independently and then reconciles. The active-mode forbidden-key issue is emitted by the `targetModeSchema` operand even though the `content` field is supplied by the right operand.

### Pattern (b) — per-branch divergent extension via `.extend()` + re-build

```ts
// Downstream tool wants different fields per branch:
const myToolSchema = z.discriminatedUnion("target_mode", [
  targetModeSpecificSchema.extend({ contentForSpecific: z.string() }),
  targetModeActiveSchema.extend({ contentForActive: z.string() }),
]);

// Type: discriminated union with per-branch extensions
// Parse `{ target_mode: "specific", vault: "V", file: "F", contentForSpecific: "S" }` → success
// Parse `{ target_mode: "active", contentForActive: "A" }` → success
// Parse `{ target_mode: "active", contentForSpecific: "S" }` → fail (active branch requires contentForActive)
```

zod's `.extend()` on a `ZodObject` returns a new `ZodObject` that retains the original's `.superRefine` chain — this is documented zod 3 behavior and is exercised by the spec's Story 3 AC#5 in the test suite. Critically, `.extend()` is a `ZodObject` method, not a `ZodEffects` method (which is what `.superRefine` returns) — so the order matters: in the `targetModeSpecificSchema` definition, `.superRefine` is the LAST operation, meaning the exported schema is a `ZodEffects` wrapping a `ZodObject`. To make `.extend` callable on it, the implementation MUST instead structure the file as: declare the base `ZodObject` (e.g., `specificBase`), then `.extend` is callable on `specificBase`. Downstream tools that want Pattern (b) compose against the base + their own refinement, which means they'd lose the base refinement.

**This is a real implementation issue surfaced at plan stage.** Resolution: export the base `ZodObject` schemas WITH the `.superRefine` chain attached. To make `.extend` callable on the wrapped result, do NOT chain `.superRefine` directly — instead, declare a helper that takes a `ZodObject`, applies `.superRefine`, and returns the wrapped result; AND export the unwrapped base as well so downstream `.extend` use cases have an extension target. Concretely:

```ts
const specificBase = z.object({ /* ... */ }).passthrough();
const specificWithRefinement = specificBase.superRefine((input, ctx) => { /* exactly-one rule */ });

const activeBase = z.object({ /* ... */ }).passthrough();
const activeWithRefinement = activeBase.superRefine((input, ctx) => { /* forbidden-keys rule */ });

export const targetModeSpecificSchema = specificWithRefinement;
export const targetModeActiveSchema = activeWithRefinement;
export const targetModeSchema = z.discriminatedUnion("target_mode", [
  // discriminatedUnion's branch type accepts ZodObject only; ZodEffects on top of ZodObject is also accepted in zod 3.20+
  specificWithRefinement,
  activeWithRefinement,
]);
```

But Pattern (b) downstream tools call `.extend` on `targetModeSpecificSchema` — which is a `ZodEffects`, not a `ZodObject`, so `.extend` is NOT directly callable on it. To make Pattern (b) actually work, downstream tools must be guided to extend against the BASE z.object, then re-apply the refinement themselves OR use a different composition idiom.

**Final resolution (plan-stage)**: Export FOUR schemas — the two refined branches (used as `targetModeSchema`'s branches and for Pattern-(a) consumers), AND the two unrefined base z.objects (named with a `Base` suffix: `targetModeSpecificBaseSchema`, `targetModeActiveBaseSchema`) so Pattern-(b) downstream tools can `.extend` on the base AND get a documented helper to re-apply the refinement.

This adds two more exports than Q1's three but is the only way Pattern (b) works without forcing downstream tools to know about zod's `ZodEffects` vs `ZodObject` distinction. **Updating P4 to FIVE exports**:

- `targetModeSpecificBaseSchema` — `z.object({...}).passthrough()` (no refinement). Pattern-(b) extension target.
- `targetModeActiveBaseSchema` — `z.object({...}).passthrough()` (no refinement). Pattern-(b) extension target.
- `targetModeSpecificSchema` — `targetModeSpecificBaseSchema.superRefine(...)` (with the exactly-one rule). Direct-use schema; Pattern-(a) consumes via the union.
- `targetModeActiveSchema` — `targetModeActiveBaseSchema.superRefine(...)` (with the forbidden-keys rule). Direct-use schema; Pattern-(a) consumes via the union.
- `targetModeSchema` — `z.discriminatedUnion("target_mode", [targetModeSpecificSchema, targetModeActiveSchema])`. The primary export.

Pattern (b) downstream tools then write:

```ts
const myToolSchema = z.discriminatedUnion("target_mode", [
  targetModeSpecificBaseSchema
    .extend({ contentForSpecific: z.string() })
    .superRefine(applyTargetModeSpecificRefinement),  // helper exported alongside
  targetModeActiveBaseSchema
    .extend({ contentForActive: z.string() })
    .superRefine(applyTargetModeActiveRefinement),
]);
```

Where `applyTargetModeSpecificRefinement` and `applyTargetModeActiveRefinement` are the two refinement functions, exported as standalone callables so downstream tools can re-apply them after `.extend`. **Updating P4 to FIVE exports + TWO helper functions** (seven exports total). This is more API surface than Q1 anticipated, but it is what the zod-3 type system requires for Pattern (b) to actually work.

A cleaner alternative considered: a `withTargetModeSpecificRefinement(extended)` / `withTargetModeActiveRefinement(extended)` pair of helper functions that wrap the `.superRefine` call — same effect but a bit nicer to read at the call site. Adopting that form: **final P4 = three schemas (`targetModeSpecificSchema`, `targetModeActiveSchema`, `targetModeSchema`) + three inferred types (`TargetModeSpecific`, `TargetModeActive`, `TargetMode`) + two base schemas (`targetModeSpecificBaseSchema`, `targetModeActiveBaseSchema`) + two helper functions (`withTargetModeSpecificRefinement`, `withTargetModeActiveRefinement`)** — ten exports total. Documented in the contract document and in the helper functions' JSDoc.

(This expansion of the export surface from Q1's three to plan's ten is captured in the plan's [Constitution Check](./plan.md#constitution-check) post-Phase-1 re-check entry; it does not violate Principle I because all ten exports remain a single-purpose set centred on the `target_mode` contract.)

## Logger.ErrorCode union — NOT extended this feature

Feature 002 extended [src/logger.ts](../../src/logger.ts)'s `ErrorCode` union to include `"CLI_REPORTED_ERROR"`. Feature 003 deliberately did NOT extend it for `ERR_NO_ACTIVE_FILE` because the adapter has no internal logger. **Feature 004 does NOT extend the union either**: the primitive emits `ZodError` (zod's own error type), not an `UpstreamError`. The existing `VALIDATION_ERROR` code (already in the union, used by [src/tools/obsidian_exec/tool.ts:61](../../src/tools/obsidian_exec/tool.ts#L61)) is the right code for typed-tool consumers to log when a `targetModeSchema.parse()` call fails — but wiring that is each typed-tool BI's job, not this feature's.

## Alternatives considered (and rejected)

| Alternative | Why rejected |
|-------------|--------------|
| Single export — `targetModeSchema` only (the discriminated union) | Q1-rejected. Without the per-branch object schemas, Pattern (b) per-branch divergent extension is impossible because `z.discriminatedUnion`'s branches cannot be retroactively decomposed and re-extended. |
| Helper function `composeWithTargetMode(uniformExtension)` only (Q1 option C) | Q1-rejected. Handles uniform extension cleanly but per-branch divergent extension still requires per-branch schemas. The actual answer (per-branch + union) subsumes the helper-function value: Pattern (a) is one line either way. |
| All Q1 options (per-branch + union + helper, option D) | Rejected. The helper for uniform extension is `targetModeSchema.and(...)` — one line, no helper needed. Adding a helper is premature abstraction. |
| `.refine()` instead of `.superRefine()` for the active-mode forbidden-key rule | Rejected per P2. `.refine()` produces a single zod issue per refinement; cannot emit one issue per offending forbidden key when multiple are present. |
| `.never().optional()` on each forbidden-key field declaration | Rejected per P2. Produces zod-default error messages like `"Expected never, received string"` that don't satisfy Q2's two-semantic-element requirement (key + active mode). Customising via `errorMap` works but is verbose for three forbidden keys; `.superRefine` is more compact and the message attribution is per-key cleaner. |
| Split the source file into `target-mode/specific.ts`, `target-mode/active.ts`, `target-mode/index.ts` | Rejected. The three branches share refinement helpers and a discriminator; splitting them into three files would require all three to import the shared `FORBIDDEN_KEYS_IN_ACTIVE` constant and the helper functions. ~50 LOC fits fine in one file; splitting buys nothing. |
| Recovery instructions in the active-mode error messages | Q2-rejected. Recovery semantics differ per tool (a `read_note` recovery looks different from a `search_vault` recovery), and per-tool docs (BI-030) own that responsibility. |
| Strict-against-unknown-keys at the primitive level (`.strict()` on each branch) | Rejected per FR-005. Composition requires base permissiveness. Tools that want strict-against-unknown-keys behavior compose `.strict()` themselves. |
| Eager parse cache (memoise repeated parses by input identity) | Rejected. The primitive is called once per typed-tool MCP call, on inputs that vary by call. A cache buys nothing and adds complexity. |
| Generate types from JSON Schema rather than from zod via `z.infer` | Rejected. Constitution Principle III mandates the zod schema as the single source of truth. JSON Schema is a derived artifact (via `zod-to-json-schema`) for downstream MCP `inputSchema` registration; the type direction must flow zod → TypeScript. |
| Hand-written `interface TargetModeSpecific` etc. parallel to the inferred types | Rejected per Constitution Principle III (single source of truth) and FR-010 (no parallel hand-written types). SC-003 enforces this via grep. |
| Localise the discriminator values (`"specific" | "active"`) | Rejected per spec Out of Scope. Localisation, if ever desired, lands as a separate spec. |
| Use a third-party type-test library (e.g., `tsd`, `expect-type`) instead of vitest's `expectTypeOf` | Rejected per P5. Zero-new-deps is the project posture and vitest 4.x ships `expectTypeOf` natively. |

## ADR alignment

[ADR-003](../../.decisions/ADR-003%20-%20Enforce%20Target%20Mode%20in%20Typed%20Tools.md) commits the project to the two-branch discriminated union with the `"specific"` and `"active"` semantics this feature implements. The plan is in lockstep with the ADR — no amendment, no superseding ADR. The [Architecture document](../../.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md) lists `[[BI-029 - Implement Target Mode Framework]]` as the implementation; this feature IS BI-029.

## Open questions

None. The Phase 1 design proceeds against a fully-clarified spec and five resolved plan-stage decisions.
