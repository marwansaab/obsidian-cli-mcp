# Phase 0 Research — Flatten `targetModeSchema`

**Feature**: `010-flatten-target-mode`
**Date**: 2026-05-07
**Decisions resolved**: R1 — R10. Each resolution drives a corresponding plan-stage commitment in [plan.md](plan.md).

---

## R1 — `zod-to-json-schema` emit for `z.object({...}).strict().superRefine(...)`

**Decision**: At pinned versions (`zod@^3.23.8` / `zod-to-json-schema@^3.23.5`, lockfile-resolved 3.25.2), `zodToJsonSchema(zodSchema, { $refStrategy: "none" })` over a `ZodEffects<ZodObject>` whose `_def.schema` is a `.strict()` `ZodObject` emits the natural single-flat-object descriptor:

```json
{
  "type": "object",
  "properties": { "<key>": { ... }, ... },
  "required": ["<keys-of-non-optional-fields>"],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

No `oneOf`, no `allOf`, no `anyOf`. The wrap branch in [src/tools/_shared.ts](../../src/tools/_shared.ts#L132-L218) is unreachable for this input shape — its `raw.type === "object"` early-return fires and returns the no-op shape verbatim.

**Rationale**: Empirically verified during plan-stage research (probe captured below). The flat-strict-superRefine input is `zod-to-json-schema`'s primary supported shape and has been stable across the pinned semver range. `obsidian_exec` (a flat `.strict()` schema, no `superRefine`) has been emitting this exact shape since feature 001 with no library-side changes; the addition of `superRefine` does not alter the emit because `zodToJsonSchema` walks the inner `_def.schema` of `ZodEffects` to compute the descriptor (it ignores the refinement body, which is correct: refinements are runtime-only and not expressible in JSON Schema).

**Empirical probe** (run during research):
```
const flat = z.object({
  target_mode: z.enum(['specific', 'active']),
  vault: z.string().min(1).optional(),
  file: z.string().optional(),
  path: z.string().optional(),
}).strict().superRefine((input, ctx) => { ... });

zodToJsonSchema(flat, { $refStrategy: 'none' })
```
emits exactly the descriptor at FR-006 — `type: "object"`, `properties` with all four keys typed, `required: ["target_mode"]`, `additionalProperties: false`, `$schema` preserved.

**Alternatives considered**:
- `.passthrough()` instead of `.strict()`: would emit `additionalProperties: true`. Rejected by clarification C3 (the user picked `.strict()` for the tighter wire descriptor and the parse-time rejection of unknown keys).
- `.strip()` (zod default): would emit `additionalProperties: false` BUT would silently strip unknown keys at parse time instead of rejecting them. Rejected by C3 for the same reason — strict gives observable error feedback for client-side typos.

**Drives**: FR-006, plan-stage step 2 (`_shared.ts` shrink).

---

## R2 — `.merge()` vs `.extend()` for Pattern (a) flat extension (CRITICAL — amends C7)

**Decision**: The canonical Pattern (a) extension idiom MUST use `.extend()`, not `.merge()`. `applyTargetModeRefinement(targetModeBaseSchema.extend({ note_text: z.string() }))` is the correct form. The clarification C7 answer literally specified `.merge()` as the example; this research-stage refinement amends the example call from `.merge()` to `.extend()` because `.merge()` does not preserve `.strict()`.

**Rationale**: Empirically verified during plan-stage research:

| Method on `.strict()` ZodObject | `_def.unknownKeys` after | parse rejects unknown? | JSON Schema emit |
|---|---|---|---|
| `.merge(z.object({...}))` | `"strip"` (RESET) | NO (silently strips) | `additionalProperties: false` |
| `.extend({ ... })` | `"strict"` (PRESERVED) | YES (`unrecognized_keys`) | `additionalProperties: false` |

The wire descriptor is identical for both; the runtime parse behaviour differs. `.merge()` resets the parent's `unknownKeys` mode to zod's default (`"strip"`) — a documented but easy-to-miss zod 3.x behaviour. `.extend()` preserves the parent's mode. For Pattern (a) consumers to honour the FR-002 strict-mode carve-out (unknown top-level keys produce `VALIDATION_ERROR` at parse time), they MUST use `.extend()`.

**Empirical probe** (run during research):
```
const base = z.object({ target_mode: z.enum(['specific','active']), vault: z.string().optional() }).strict();

const merged = base.merge(z.object({ note_text: z.string() }));
merged._def.unknownKeys === 'strip'         // <-- RESET
merged.safeParse({ ..., extra: 1 }).success  // <-- TRUE (silently strips)

const extended = base.extend({ note_text: z.string() });
extended._def.unknownKeys === 'strict'       // <-- PRESERVED
extended.safeParse({ ..., extra: 1 }).success // <-- FALSE (rejected)
```

The wire descriptor mismatch is a real risk — strict-rich clients would reject the unknown key against `additionalProperties: false`, but if a non-validating client got an unknown key through, the runtime would silently strip it rather than producing the `VALIDATION_ERROR` FR-002 promises. `.extend()` makes the wire and runtime contracts agree.

**Spec amendment**: Spec User Story 1, Acceptance Scenario 1, Edge Cases / Pattern (a), FR-008, and Key Entities all reference `.merge(...)`. Plan-stage updates these to `.extend({...})` in lock-step with this research decision. The clarification C7 answer text is preserved verbatim in the Clarifications section (it captures the answer as given), but a research-stage refinement note follows it pointing to this R2 entry.

**Alternatives considered**:
- `.merge()` + `.strict()` re-applied after merge: produces correct runtime behaviour but adds a step. Rejected — `.extend()` is one call and idiomatic.
- A custom helper `mergeStrict(...)`: rejected — existing `.extend()` is the zod-native idiom.

**Drives**: FR-008, FR-001 (helper signature), spec amendments, plan-stage step 1 (target-mode.ts rewrite), data-model.md (canonical idiom), contracts/flat-target-mode.contract.md (worked examples).

---

## R3 — `applyTargetModeRefinement` signature

**Decision**: The helper signature is `applyTargetModeRefinement<T extends z.ZodObject<z.ZodRawShape, z.UnknownKeysParam>>(schema: T): z.ZodEffects<T>`. The generic constraint preserves the input's inferred type (including any extension keys) and the `unknownKeys` parameter (so `.strict()` flows through). The helper applies a single `superRefine` body that branches on `input.target_mode` and dispatches to the per-mode rule logic (XOR file/path, vault required when specific, locator-keys forbidden when active).

**Rationale**: Empirically verified — `applyTargetModeRefinement(base)` returns `ZodEffects<ZodObject>` where `_def.schema === base`. Generic propagation works for both no-extension consumers (`read_note`) and extended consumers (Pattern (a) — verified with `note_text: z.string()` extension). The `z.infer<typeof extendedRefined>` correctly includes the extension keys. The dispatcher pattern matches the existing internal idiom of [src/target-mode/target-mode.ts:89-95](../../src/target-mode/target-mode.ts#L89-L95).

The single-helper-with-dispatcher choice (vs. two per-mode helpers, as in feature 004) is consistent with clarification C2's deletion of `applyTargetModeSpecificRefinement` / `applyTargetModeActiveRefinement` — those existed to support Pattern (b)'s per-branch divergent extension, which is gone (clarification C4). The post-010 helper roster is: ONE singular dispatcher (`applyTargetModeRefinement`), zero per-mode helpers.

**Alternatives considered**:
- Curried form `applyTargetModeRefinement(targetModeBaseSchema)(extras)`: rejected — `targetModeBaseSchema.extend(extras)` already gives consumers the composable handle; the helper only needs to attach the refinement.
- Two helpers `applyForSpecific` / `applyForActive`: rejected — Pattern (b) is gone; per-mode helpers have no consumer.

**Drives**: FR-001, plan-stage step 1, data-model.md (export inventory), contracts/flat-target-mode.contract.md (helper contract).

---

## R4 — `unrecognized_keys` issue shape under `.strict()`

**Decision**: When `targetModeSchema.parse({...unknown_key: x})` is called, zod produces a `VALIDATION_ERROR` whose `details.issues` array contains exactly one issue with shape:
```
{ code: "unrecognized_keys", path: [], keys: ["unknown_key"], message: "Unrecognized key(s) in object: 'unknown_key'" }
```

The issue path is `[]` (root-level), NOT `["unknown_key"]`. The offending key is named in `keys` (an array, since multiple unknowns produce a single issue with all of them listed). The FR-002 strict-mode carve-out language ("per-issue `code: 'unrecognized_keys'` (or zod's equivalent) naming the offending key") is correct as written; the post-010 `_register.test.ts` boundary case asserts on `issue.code === "unrecognized_keys"` and `issue.keys.includes("<offending>")` rather than on `issue.path`.

**Rationale**: Empirically verified via `safeParse({ target_mode: "active", random: "x" })` — produces exactly one issue with the shape above. zod's `unrecognized_keys` is its native error code for `.strict()` violations and is stable across the pinned semver range.

**Drives**: FR-002 (the carve-out language is correct as written), plan-stage `target-mode.test.ts` strict-mode boundary case, data-model.md (per-issue shape table).

---

## R5 — Post-010 drift detector consolidation strategy

**Decision**: The three-group structure in [src/tools/_register.test.ts](../../src/tools/_register.test.ts) consolidates to a single group with two layers:

1. **Layer 1 — registry walk + per-tool invariants** (`it.each` over the live registry from `createServer({ registerSignalHandlers: false })`). Asserts each tool's published `inputSchema` against the per-tool invariant table.
2. **Layer 2 — SDK round-trip via `InMemoryTransport`** (`beforeAll` connects the SDK client; `it.each` re-asserts each invariant against the wire-side `client.listTools()` response).

The Pattern (a)/(b) synthetic fixtures (Group 3 in feature 009) DELETE. Pattern (b) is gone outright (clarification C4). Pattern (a) is folded into Layer 1 as a fourth row in the invariant table — `synthetic_pattern_a` registered through `registerTool` with schema `applyTargetModeRefinement(targetModeBaseSchema.extend({ note_text: z.string() }))`, asserting the same flat-object invariant shape as `read_note` plus `note_text` in `properties_includes`.

**Rationale**: With the wrap branch deleted (R1), the publication pipeline is `zodToJsonSchema(strict-flat-object)` — a one-step transformation whose output is structurally invariant. A unit-only test that calls `toMcpInputSchema` in isolation is sufficient; the SDK round-trip is defense-in-depth against future SDK behaviour changes (cheap to keep). The three-group structure was justified in feature 009 because the wrap branch had multiple code paths (anyOf/oneOf branches, allOf walking, leaf widening) that each warranted independent verification; with all of those gone, one group covers the surface adequately.

**Per-tool invariants post-010**:
| Tool | type | properties_equals_set | required_equals | additionalProperties |
|---|---|---|---|---|
| `read_note` | `"object"` | `["target_mode", "vault", "file", "path"]` | `["target_mode"]` | `false` |
| `obsidian_exec` | `"object"` | `["command", "vault", "parameters", "flags", "copy", "timeoutMs"]` | `["command"]` | `false` |
| `help` | `"object"` | `["tool_name"]` (or whatever help's current shape requires) | `[]` (help permits zero-arg invocation) | `false` |
| `synthetic_pattern_a` | `"object"` | `["target_mode", "vault", "file", "path", "note_text"]` | `["target_mode", "note_text"]` | `false` |

Note: `read_note`'s `additionalProperties` flips from `true` (post-009 Cowork accommodation) to `false` (post-010 strict-mode tightening per C3). `obsidian_exec`'s and `help`'s shapes are unchanged.

**Alternatives considered**:
- Keep three groups: rejected — Layer-1-only would already cover the surface; Layer 2 is the only justified addition (defense in depth); Group 3's synthetic fixtures lose their justification when the wrap branch is gone.
- Drop Layer 2: rejected — `InMemoryTransport` round-trip costs ~10 LOC and catches future MCP SDK changes that might transform the descriptor in transit (a real concern for a published library).

**Drives**: FR-008, FR-009, plan-stage step 4, data-model.md (invariant table), contracts/drift-detector.contract.md.

---

## R6 — Test migration for the six cases consuming deleted exports

**Decision**: The six test cases in [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) that today call `targetModeSpecificSchema` / `targetModeActiveSchema` directly (Story 1 AC #1–#3 + AC #4–#6 + Story 2 AC #1–#3) migrate by string substitution: replace `targetModeSpecificSchema.safeParse({...})` with `targetModeSchema.safeParse({ target_mode: "specific", ...rest })` and `targetModeActiveSchema.safeParse({...})` with `targetModeSchema.safeParse({ target_mode: "active", ...rest })`. The per-mode literal is added to the input object; rule-semantics assertions (per-issue `path`, `code`, `message` content) are preserved verbatim.

**Rationale**: The deleted per-mode schemas were equivalent to "the discriminated union restricted to one branch." Calling the unified `targetModeSchema` with the matching `target_mode` literal exercises the same per-mode rule body and produces the same per-issue output. FR-003 mandates rule-semantics assertions pass without semantic changes — the path-and-code triples are identical because the refinement bodies are unchanged.

**Cases needing migration** (sampled — full list in data-model.md §6):
- `targetModeSpecificSchema.safeParse({ vault: "V", file: "F" })` → `targetModeSchema.safeParse({ target_mode: "specific", vault: "V", file: "F" })`
- `targetModeActiveSchema.safeParse({ vault: "V" })` → `targetModeSchema.safeParse({ target_mode: "active", vault: "V" })` (still rejects with the forbidden-key issue)
- ... etc.

The 25 cases that already call `targetModeSchema` directly are unchanged. The total test count moves from 31 → 32 (one new case for the strict-mode boundary per R4) or 31 → 33 (plus one new case for the `applyTargetModeRefinement` helper happy-path verifying that an extended schema passes both the per-mode rules and rejects unknowns).

**Drives**: FR-003, FR-017, plan-stage step 6, data-model.md §6.

---

## R7 — ADR-003 amendment text

**Decision**: ADR-003's [.decisions/ADR-003 - Enforce Target Mode in Typed Tools.md](../../.decisions/ADR-003%20-%20Enforce%20Target%20Mode%20in%20Typed%20Tools.md) line 20 is amended in place from:

> Every typed MCP tool will use a discriminated union in its Zod schema via a `target_mode` parameter, forcing the LLM to explicitly declare its intent on every invocation:

To:

> Every typed MCP tool will use a flat `z.object` with a `superRefine` that enforces the per-mode rules via a `target_mode` parameter, forcing the LLM to explicitly declare its intent on every invocation:

The `updated:` frontmatter date bumps from `2026-05-05` to `2026-05-07`. An "Amendment 2026-05-07" stanza is appended at the bottom of the ADR (after the existing Related Notes section) reading:

> ## Amendment 2026-05-07 — Encoding switch (feature 010)
>
> The original "discriminated union" encoding survived feature 004 (which introduced `targetModeSchema`) and feature 006 (which introduced `read_note` as the first consumer). It produced a valid `ZodEffects<ZodDiscriminatedUnion>` value at the zod layer but did not survive the zod → JSON Schema → MCP `inputSchema` pipeline cleanly: `zod-to-json-schema` emitted `{ anyOf: [...] }` rather than a top-level `{ type: "object", properties, required, additionalProperties }`, and three downstream features (007, 008, 009) accumulated ~140 LOC of envelope synthesis to bridge the gap. Feature 010 replaces the encoding with a flat `z.object({...}).strict().superRefine(...)` that emits the natural single-flat-object descriptor directly, and deletes the bridge. The per-mode rules (XOR `file`/`path` in specific, vault required when specific, locator-keys forbidden when active) are preserved exactly — only the encoding changes. The Status, Decision rationale, and Consequences sections above are unchanged; the per-mode rules they describe are reaffirmed by this amendment, not superseded.

**Rationale**: Per clarification C5, the rationale, status, and consequences are unchanged — only the encoding paragraph language moves. In-place amendment with a dated stanza is the lightest paper trail consistent with "no new ADR" and produces a single canonical record (vs. a supersession chain that would require maintaining two files in lock-step).

**Drives**: FR-013, plan-stage step 7, SC-011.

---

## R8 — `CHANGELOG.md` `0.2.2` entry text

**Decision**: The CHANGELOG entry under `## [0.2.2] — 2026-MM-DD` (date set at release time) reads:

```
### Changed
- **`read_note`'s published `inputSchema` simplified.** Where 0.2.1 published a wrapped envelope (`{ type: "object", oneOf: [...], properties: {<unioned>}, required: ["target_mode"], additionalProperties: true }`), 0.2.2 publishes a single flat object: `{ type: "object", properties: { target_mode, vault, file, path }, required: ["target_mode"], additionalProperties: false }`. Strict-rich MCP clients (Claude Desktop, MCP Inspector) and strict-naive clients (Cowork) both accept the new shape; behaviour is unchanged for valid inputs. Future typed tools that need target-mode behaviour now use the flat extension idiom `applyTargetModeRefinement(targetModeBaseSchema.extend({ <fields> }))`. Predecessor: 0.2.1 (feature 009) shipped a working compatibility shim that 0.2.2 replaces with a structurally simpler primitive.

### Behaviour change
- **`read_note` and any future target-mode-aware tool now reject unknown top-level keys.** The pre-0.2.2 schema used `.passthrough()` and silently passed unknown keys through to the runtime. The post-0.2.2 schema uses `.strict()` and produces `VALIDATION_ERROR` with `code: "unrecognized_keys"` and `keys: ["<offending>"]` at the parse boundary. Clients that depended on extra keys being silently tolerated must remove them or pin to 0.2.1; spec-conformant clients that already validate against the published `additionalProperties` value see no observable change.
```

**Rationale**: FR-012 / SC-010 mandate user-facing language naming the simplification, the predecessor (009), the new flat-extension pattern, and the strict-mode carve-out. Two sub-headings (`Changed` / `Behaviour change`) keep the simplification (transparent to users) separate from the behaviour change (potentially observable).

**Drives**: FR-012, SC-010, plan-stage step 8.

---

## R9 — `vitest.config.ts` coverage threshold ratchet

**Decision**: The aggregate statements coverage threshold in [vitest.config.ts](../../vitest.config.ts) (currently `84.3` — the floor pinned by feature 002 and reaffirmed through 003–009) MAY ratchet upward in a one-line visible edit if the post-010 actual statements coverage measurably exceeds 84.3. Plan-stage projection: the deletion of ~340 LOC of test code and ~140 LOC of source code in approximately equal proportion preserves the coverage ratio; the actual move is a small-positive (+0.5 to +1.5 pp) because the surviving code is exhaustively tested and the deleted code's coverage was at parity with the aggregate. Final ratchet decision deferred to implementation time when `vitest run --coverage` reports the post-feature actual; if the actual is < 85.0 the threshold stays at 84.3, otherwise it ratchets to the actual rounded down to the nearest tenth.

**Rationale**: Constitution Development Workflow gate #5 says the threshold "ratchets upward (or downward, if intentional) via a one-line visible edit." Ratcheting upward is mechanically safe — the next change's coverage gate is preserved against the new floor — but the ratchet must be backed by an actual measurement, not a projection.

**Drives**: SC-009, plan-stage step 8 (conditional), Constitution Development Workflow gate #5.

---

## R10 — Pattern (b) deletion impact on feature 004 documentation (do NOT amend historical specs)

**Decision**: Feature 004's [spec.md](../004-target-mode-schema/spec.md), [plan.md](../004-target-mode-schema/plan.md), [research.md](../004-target-mode-schema/research.md), [data-model.md](../004-target-mode-schema/data-model.md), and [contracts/target-mode.contract.md](../004-target-mode-schema/contracts/target-mode.contract.md) are NOT amended by this feature. Those documents are historical records of what feature 004 decided and shipped; rewriting them retroactively breaks the spec audit trail.

The Pattern (b) deletion (clarification C4) is recorded in three places: (a) [spec.md](spec.md)'s FR-013 / Clarifications / Edge Cases, (b) this research.md (R3 + R5), and (c) ADR-003's Amendment 2026-05-07 stanza (R7). Future readers learning the project's reuse pattern consult the LATEST canonical guidance — feature 010's spec — not feature 004's. The spec wording at FR-013 ("Feature 004's Pattern (b) reuse documentation is amended in lock-step to remove Pattern (b) from the canonical pattern roster") is interpreted to mean the LIVE canonical roster (in this feature's documentation), not the historical 004 spec text.

**Rationale**: The spec-kit workflow's audit-trail value depends on each feature's spec being a frozen-in-time record. Cross-feature amendments (ADR-003, in-tree code, CHANGELOG) are appropriate; cross-feature spec amendments are not. The forward pointer from 004 to 010 is implicit in the chronology — a developer searching for "Pattern (b)" finds 004's documentation but also finds 010's deletion in the same `specs/` tree.

**Drives**: FR-013 interpretation, plan-stage step 7 (ADR-003 only — NOT feature-004 docs).

---

## Summary

| ID | Decision | Drives |
|---|---|---|
| R1 | `zodToJsonSchema` emits flat `{type, properties, required, additionalProperties: false}` for the post-010 schema shape; wrap branch unreachable | FR-006, plan step 2 |
| R2 | **Pattern (a) idiom uses `.extend()` not `.merge()`** (research-stage refinement of clarification C7 — `.merge()` does not preserve `.strict()`) | FR-008, FR-001, spec amendments |
| R3 | `applyTargetModeRefinement<T extends ZodObject>(s: T): ZodEffects<T>` — single dispatcher, zero per-mode helpers | FR-001, plan step 1 |
| R4 | `unrecognized_keys` issue shape: `code`, `path: []`, `keys: [...]`, `message`. FR-002 carve-out language correct as-is | FR-002, plan step 6 |
| R5 | Post-010 drift detector: single group, two layers (registry walk + SDK round-trip); Pattern (a) folded in; Pattern (b) deleted | FR-008, FR-009, plan step 4 |
| R6 | Six per-mode-export-consuming cases migrate via string substitution; rule-semantics assertions preserved verbatim | FR-003, plan step 6 |
| R7 | ADR-003 amend in place: line-20 wording + dated Amendment stanza + frontmatter bump; rationale/status/consequences preserved | FR-013, plan step 7, SC-011 |
| R8 | `CHANGELOG.md` `0.2.2` entry: two sub-headings (Changed + Behaviour change) naming the simplification, predecessor, idiom, carve-out | FR-012, SC-010 |
| R9 | `vitest.config.ts` coverage threshold ratchets upward iff post-010 actual measurably exceeds 84.3 | SC-009 |
| R10 | Feature 004 historical docs NOT amended; canonical guidance is feature 010's documentation + ADR-003 amendment | FR-013 interpretation |

All NEEDS CLARIFICATION items are resolved. Phase 1 may proceed.
