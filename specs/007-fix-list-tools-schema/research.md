# Phase 0: Research — Fix `tools/list` Schema Validation

**Feature**: 007-fix-list-tools-schema
**Date**: 2026-05-06
**Status**: Complete — zero `NEEDS CLARIFICATION` markers carried forward

This document records the design decisions made before Phase 1 (data-model, contracts, quickstart). Each decision answers an unknown that would otherwise leak into Phase 1 or implementation.

---

## P1 — Where does the fix live?

**Decision**: A generic envelope helper at [src/tools/_shared.ts](../../src/tools/_shared.ts), named `toMcpInputSchema(zodSchema)`. The helper is the inheritance vehicle. The `target-mode` primitive at [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) gets a new companion export, `targetModeJsonSchema`, computed via the helper. `read_note` (and any future BI consuming the primitive) re-uses that companion export rather than calling `zodToJsonSchema` directly.

**Rationale**:
- The spec's edge case "any consumer reaching for `targetModeSchema` … must inherit the fix automatically, not have to re-apply it per tool" rules out fixing only at `read_note`'s boundary. The `target-mode` companion export satisfies this for direct re-export.
- For tools that *extend* the primitive (BI-004 read_heading and beyond, which add tool-specific fields and build their own discriminated unions per the BI-029 idiom), they need the same envelope treatment. The shared helper at `_shared.ts` is what those tools call. So both layers — primitive and helper — are needed.
- Single source of truth (Principle III) is preserved because the helper consumes the zod schema directly via `zodToJsonSchema`. There is no parallel hand-written JSON Schema.

**Alternatives considered**:
- **(a) Fix only at read_note's tool boundary** (`src/tools/read_note/schema.ts`). Rejected — violates the spec's auto-inherit edge case; future BIs would need to remember to repeat the fix.
- **(b) Hand-write a parallel JSON Schema** for the target-mode primitive. Rejected — violates Principle III's anti-drift clause ("redefining the same shape … is a violation").
- **(c) Helper at `src/help/strip-schema.ts`**. Rejected — `strip-schema` is purpose-built for description-stripping (a different concern). Mixing envelope-wrapping into it would muddy that module's single responsibility (Principle I).
- **(d) New module at `src/target-mode/json-schema.ts`**. Rejected — would couple the helper to target-mode semantics, but the helper is generic (works on any zod schema). Lives better in `_shared.ts` next to `RegisteredTool` / `asToolError`.

---

## P2 — Should the wrapper top-level use `oneOf` or `anyOf`?

**Decision**: `oneOf`. When `zodToJsonSchema` produces a top-level `anyOf` (the discriminated-union case), the helper rewrites it to `oneOf` inside the envelope.

**Rationale**:
- **Semantic accuracy**: the discriminator literal makes the branches mutually exclusive; `oneOf` is the JSON Schema keyword for "matches exactly one", while `anyOf` is "matches at least one". `oneOf` is the more truthful description.
- **LLM tool-use parsers**: many MCP clients route tool descriptors through LLM tool-use generators (Claude's tool-use parser, OpenAI function-calling, etc.). Empirically, those parsers handle `oneOf` better than `anyOf` for discriminated alternatives — they treat `oneOf` as "pick one of these branches" and `anyOf` as "any combination", which can degrade generation quality on the latter.
- The Q1 clarification explicitly listed both as acceptable (`oneOf`/`anyOf`); choosing the more accurate keyword is a free win.

**Alternatives considered**:
- **Leave as `anyOf`** (whatever `zodToJsonSchema` emits). Rejected — semantically weaker AND riskier for downstream LLM tool-use.
- **Use `allOf` with branch sub-schemas under `if`/`then` conditionals**. Rejected — JSON Schema Draft 7's `if`/`then`/`else` is supported but is overkill for two literal-discriminated branches and produces verbose, harder-to-read descriptors.

---

## P3 — How should the helper handle `additionalProperties` at the top level?

**Decision**: Top-level `additionalProperties: true` when wrapping. This matches the runtime `passthrough()` behaviour at [src/target-mode/target-mode.ts:50](../../src/target-mode/target-mode.ts#L50) and [src/target-mode/target-mode.ts:65](../../src/target-mode/target-mode.ts#L65).

**Rationale**:
- The runtime zod uses `.passthrough()` on both branches — the validator deliberately ignores unknown keys. Setting `additionalProperties: true` at the wrap boundary mirrors that: the published descriptor doesn't lie about the runtime's permissiveness.
- Setting it `false` (or omitting it, which defaults to `true` in JSON Schema Draft 7 anyway) would either reject or silently allow unknown keys at the client side. Since the runtime accepts them, the published descriptor MUST not claim otherwise.
- The branch sub-schemas (inside the `oneOf`) already have their own `additionalProperties: true` from `zodToJsonSchema`'s passthrough handling; the outer one is redundant but explicit, which improves diff readability.

**Alternatives considered**:
- **`additionalProperties: false`**. Rejected — would make the published descriptor stricter than the runtime, which contradicts FR-005 ("wire-level shapes unchanged").
- **Omit `additionalProperties` entirely**. Rejected — Draft 7 defaults to `true` so the behaviour is identical, but explicit is better than implicit when the answer is non-obvious to readers.

---

## P4 — Helper signature: input type, output type, error semantics

**Decision**:
```ts
export function toMcpInputSchema(zodSchema: ZodTypeAny): JsonSchemaObject;
```
where `JsonSchemaObject` is a structural type asserting `type: "object"` is present at the top level. The helper:
- Calls `zodToJsonSchema(zodSchema, { $refStrategy: "none" })` (matches the existing convention at [src/tools/read_note/schema.ts:9](../../src/tools/read_note/schema.ts#L9)).
- If the raw output already has `"type": "object"` at the top level, returns it verbatim.
- Otherwise (top-level `anyOf`/`oneOf`/`allOf`), constructs the envelope: `{ type: "object", additionalProperties: true, oneOf: <branches> }` (rewriting `anyOf` → `oneOf` per P2; preserving `oneOf`/`allOf` as-is).
- Preserves `$schema` if present.
- Strips inner `type: "object"` from each branch when wrapping (since the outer one suffices, and duplication adds noise without semantic effect).
- **No throws** — every malformed input produces a well-formed (but possibly unhelpful) envelope. This is a developer-time helper, not a runtime validator.

**Rationale**:
- The signature accepts `ZodTypeAny` because the helper is generic over the zod schema kind — single objects, discriminated unions, `superRefine`'d unions all work.
- Returning a structural type (rather than `Record<string, unknown>`) gives downstream consumers a TypeScript-level guarantee that `inputSchema.type === "object"`. The existing `ToolDescriptor.inputSchema` field is `Record<string, unknown>` — a wider type — and is the consumer of this helper, so the assignment compiles.
- No-throws semantics avoid forcing every consumer site into a try/catch for an error path that should never trigger in real code.

**Alternatives considered**:
- **Throw on missing `type` field after wrap attempt**. Rejected — adds developer ceremony for a path that's already statically reachable only via misuse.
- **Generic over `T extends ZodTypeAny` and infer return**. Rejected — premature; no consumer needs the inferred shape today, and the structural `JsonSchemaObject` type is enough.

---

## P5 — How to assert the new invariant in the registry-consistency block

**Decision**: Add a third `it(...)` block to the existing `describe("registry consistency", ...)` group at [src/server.test.ts:166](../../src/server.test.ts#L166), titled "every registered tool's inputSchema declares type === 'object' at the top level (Story 1 AC#2, FR-002, FR-006, SC-001)". For each tool returned by the live `tools/list` handler, assert `tool.inputSchema?.type === "object"`.

**Rationale**:
- The existing block already iterates over the live registry — extending it in place keeps the iteration cost amortised and the test surface coherent. Future tool BIs naturally inherit the assertion.
- The error message includes the tool's name (`expect(..., \`Tool '${tool.name}' inputSchema.type is not 'object'\`).toBe("object")`) so a future regression points directly at the offending tool, matching the user's original error path `tools[N].inputSchema.type`.
- This is the minimum viable guardrail. A more ambitious test would validate the descriptor against a full MCP `Tool` JSON Schema; that is out of scope for this fix because (a) the protocol's validator is internal to the SDK, not exposed for re-use, and (b) the `type === "object"` check is what the user's bug report names directly.

**Alternatives considered**:
- **New test file at `src/tools/_descriptor-shape.test.ts`**. Rejected — duplicates the registry-iteration scaffolding already present in `server.test.ts`.
- **Validate against `@modelcontextprotocol/sdk`'s `ToolSchema` zod schema**. Considered — could be a follow-up enhancement, but the SDK doesn't export that schema directly for re-use, and the targeted assertion above is what the spec literally requires (FR-002).

---

## P6 — Is `docs/tools/read_note.md` affected?

**Decision**: No documentation update required. The doc body describes input semantics in prose and gives JSON examples per branch; it does not embed the JSON Schema shape. The fix changes only how the schema is *rendered* to MCP clients, not the input shape itself.

**Rationale**: Verified by inspection — `docs/tools/read_note.md` contains no `"type": "object"` literals or schema-shape references. The doc stays correct after the fix without any edit.

---

## P7 — Version bump strategy

**Decision**: Patch increment 0.1.6 → 0.1.7 in [package.json](../../package.json). No CHANGELOG file exists in the repo (verified by file listing); release notes go on the GitHub release if/when one is cut.

**Rationale**: FR-007 requires a patch increment. The repo's prior cadence (0.1.5 → 0.1.6) used the same one-line `package.json` edit pattern; nothing else is wired into the release pipeline that this fix needs to update.

---

## P8 — Test coverage for `_shared.ts` itself

**Decision**: Create a new co-located test file at `src/tools/_shared.test.ts` that covers BOTH the new `toMcpInputSchema` helper AND the existing `asToolError` helper (which currently lacks a co-located test). This honours Principle II's "co-located test for every public surface" rule retroactively for `_shared.ts`, since the file is being modified by this change anyway.

**Rationale**:
- Constitution Principle II: a module being modified gains the obligation to ship its co-located tests in the same change. Adding `toMcpInputSchema` triggers the rule.
- `asToolError` is a small surface (one function, one return shape) — adding a single happy-path test for it is ~5 lines and brings `_shared.ts` to compliance.
- This is not feature creep — it's the minimum required by Principle II given that `_shared.ts` is in the edit set.

**Alternatives considered**:
- **Test only `toMcpInputSchema`**, leaving `asToolError` untested in `_shared.ts`. Rejected — Principle II says "every externally callable surface … MUST ship with at least one happy-path test AND at least one failure-or-boundary test in the same change that adds, renames, or modifies it." Modifying the file triggers the obligation for every public export.
- **Move `asToolError` to a different file to dodge the obligation**. Rejected — violates Principle I (would split a single-purpose module to game a coverage rule).

---

## Open questions resolved into Phase 1

All `NEEDS CLARIFICATION` markers from `spec.md` are resolved by the spec's Clarifications block (Q1) plus the eight decisions above. Phase 1 (data-model, contracts, quickstart) has no carried-forward unknowns.
