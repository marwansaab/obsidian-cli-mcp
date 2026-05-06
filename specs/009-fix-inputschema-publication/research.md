# Phase 0: Research — Fix Empty Published `inputSchema` for `targetModeSchema` Consumers

**Feature**: 009-fix-inputschema-publication
**Date**: 2026-05-07
**Status**: Complete — zero `NEEDS CLARIFICATION` markers carried forward

This document records the design decisions made before Phase 1. Each decision answers an unknown that would otherwise leak into Phase 1 or implementation. **Decision R1 substantially rewrites the bug's root cause vs. the spec's working hypothesis** — the empirical evidence captured under R1 is load-bearing for every subsequent decision.

---

## R1 — What does `zod-to-json-schema` actually emit, and where is the property-name loss really happening?

**Decision**: The user's hypothesis (`toMcpInputSchema`'s `raw.type === "object"` early-return fires for `ZodEffects<ZodDiscriminatedUnion>`) is **empirically false** at every dependency version reachable from `package.json`'s `^3.23.5` semver range. The actual loss happens **inside the strict-but-naive MCP client's own `Tool` schema validator** stripping `oneOf` / `additionalProperties` — keys it doesn't recognise — leaving `{ type: "object", properties: {} }`. The fix is therefore to widen the wrap branch's output so the property names live in a top-level `properties` map that EVERY strict client preserves, not only inside the `oneOf` branches that hand-rolled validators throw away.

**Empirical evidence** (probes captured during plan-stage research; details below):

- `zodToJsonSchema(targetModeSchema, { $refStrategy: "none" })` at **3.23.5** (the manifest lower bound) emits:

  ```json
  {
    "anyOf": [<specific-branch>, <active-branch>],
    "$schema": "http://json-schema.org/draft-07/schema#"
  }
  ```

  Top-level `type` is **absent**. The same shape is emitted at **3.25.2** (the lockfile-resolved version, peerDep `zod ^3.25.28 || ^4` notwithstanding — the runtime accepts our `zod ^3.23.8`).

- `toMcpInputSchema(targetModeSchema)` against the live source at HEAD passes through the **wrap branch** (`raw.type === "object"` is `false` because `raw` has only `anyOf`), and returns:

  ```json
  {
    "type": "object",
    "additionalProperties": true,
    "oneOf": [<specific-branch-without-inner-type>, <active-branch-without-inner-type>],
    "$schema": "http://json-schema.org/draft-07/schema#"
  }
  ```

- The full pipeline `registerTool({ schema: targetModeSchema, ... }) → toMcpInputSchema → stripSchemaDescriptions` produces the same envelope (description-stripping is a no-op for this schema because none of its fields carry `description`).

- `client.listTools()` over `InMemoryTransport` against the built `dist/server.js` returns the SAME envelope verbatim: `oneOf` and `additionalProperties` survive the SDK's `Server` → JSON-RPC → `Client` round-trip.

- `ListToolsResultSchema.parse(...)` (the SDK's canonical wire-validation entry point) ALSO preserves `oneOf` and `additionalProperties` — the SDK's Tool schema is `z.object({ type: z.literal("object"), properties: ..., required: ... }).catchall(z.unknown())`, and `.catchall(z.unknown())` is a passthrough.

- The user's reported wire-side `inputSchema` was `{ "$schema": "...", "type": "object", "properties": {} }` — a shape NO step in the server-side pipeline produces and NO step in the SDK's wire layer produces. By elimination, the strip happened **inside the Cowork client's own MCP `Tool` validator**, which evidently has a stricter shape (no `.catchall`, no `oneOf` field, drops unknown keys, defaults missing `properties` to `{}`).

**Implications**:

1. The "predicate gap" in `_shared.ts:102` does NOT exist. The wrap branch fires correctly. The helper is doing the right thing under the contract feature 007 wrote for it.
2. The user's reproduction is real (`read_note` is uncallable from Cowork) but the root cause is **client-side schema interpretation**, not server-side rendering. We cannot patch Cowork; we must publish a schema whose property names survive the most pessimistic interpreter we expect to encounter.
3. **The fix is therefore a shape WIDENING in the wrap branch**: emit a top-level `properties` map alongside the existing `oneOf`, so `properties` exposes every property name that any branch accepts. Strict-naive validators (Cowork-shape) read the top-level `properties` and let the property names through; strict-rich validators (MCP SDK-shape) additionally read the `oneOf` and apply the per-branch constraints. The runtime zod (`targetModeSchema.parse`) remains the single source of truth for cross-field rules (XOR, forbidden-keys-in-active).
4. This widening is consistent with the spec's FR-001 ("expose the property names ... somewhere in its structure — top-level, or nested inside a `oneOf`/`anyOf` of branch shapes") — the fix lands at the MORE permissive end (top-level AND nested), and Edge Case "`additionalProperties` policy" is resolved by R3 below.
5. The spec's working hypothesis that the bug is a `_shared.ts` predicate defect was wrong — but the spec's normative requirements (FR-001..FR-016, SC-001..SC-010) hold without modification because they were written in terms of observable wire behaviour, not in terms of which line of `_shared.ts` was at fault.

**Rationale**:

- The empirical evidence is unambiguous: every version of `zod-to-json-schema` reachable from the manifest emits `{ anyOf: [...] }` for `targetModeSchema`, and every version of `_shared.ts` from feature 007 onward correctly wraps that into `{ type: "object", oneOf: [...], additionalProperties: true }`.
- "Predicate refinement" was a tempting hypothesis because the user's reported wire shape (`{ type: "object", properties: {} }`) looked like a no-op return of a `zodToJsonSchema` output. But no `zodToJsonSchema` version reachable produces that shape; the strip MUST be happening at a later stage, and the only later stage that survived the elimination was the client.
- Widening the wrap branch's output is the only fix vector that survives Cowork-shape clients without compromising MCP SDK-shape clients. It is also the cheapest fix: a small additive change inside the wrap branch in `_shared.ts`, no API change, no companion export, no `targetModeJsonSchema` re-introduction.

**Alternatives considered and rejected**:

- **(a) Revert to feature 007's `targetModeJsonSchema` companion export** at `target-mode.ts`, plumbing it through `registerTool`. Rejected — the empirical evidence shows `target-mode.ts`'s shape is fine; the fix is about the WRAP branch's output, not its location. Adding a companion would only re-export `toMcpInputSchema(targetModeSchema)`, which is what `registerTool` already does. Pure indirection without remediation.
- **(b) Pin `zod-to-json-schema` to a specific minor**. Rejected — empirical evidence shows 3.23.5 and 3.25.2 emit the same shape; pinning doesn't change the bug. Disposed of suggested clarification C5.
- **(c) Replace the helper-only fix with a `targetModeJsonSchema` companion + tighter wire constraints in `target-mode.ts`**. Rejected — Pattern (a) consumers (`targetModeSchema.and(z.object({...}))`) and Pattern (b) consumers (fresh discriminated unions) wouldn't inherit a `target-mode.ts`-located fix. The helper is the only common chokepoint that all three reuse patterns flow through.
- **(d) Dispatch on a per-tool override flag** (`registerTool({ ..., publishedSchema: <hand-built> })`). Rejected — violates Principle III (single source of truth from the zod schema), revives the drift vector feature 007 spent four BIs eliminating, and surrenders the inheritance property the spec demands at FR-003.

**Disposes of**: spec's working hypothesis (Background section), suggested clarifications C1 (fix surface defaults to helper-only widening — companion fallback is unneeded) and C5 (no library pin needed).

---

## R2 — What top-level `properties` shape does the wrap branch emit?

**Decision**: When the wrap branch fires, it walks the `oneOf` / `anyOf` / `allOf` it received, **unions** every property name found at every branch's top level, and emits them under a top-level `properties` map. Each property's published schema is widened to "permissive" (`{}` — no constraint, since cross-branch a property may be required-and-typed in one branch and absent in another; the per-branch `oneOf` carries the strict shape). The `target_mode` discriminator is the only entry that publishes a useful constraint at top level — `{ type: "string" }` (NOT `const`, since the const value differs per branch). `required` at top level lists ONLY properties that are required in EVERY branch (for `targetModeSchema`: `["target_mode"]`).

**Rationale**:

- A strict-naive client uses top-level `properties` to decide which keys to keep when stripping. If `target_mode`, `vault`, `file`, `path` all appear in `properties`, all four survive. Cowork-shape clients then send the user's full argument shape to the server; the runtime zod validator (which IS strict and enforces XOR / forbidden-keys) returns the right validation error if and only if the input is invalid.
- Top-level `properties` MUST NOT be tighter than the loosest valid input across branches — otherwise the published schema would reject inputs the runtime accepts, contradicting FR-002. Setting the published per-property shape to `{}` (no constraint) is the safe widening: every branch's typed shape stays inside its own `oneOf` arm.
- The discriminator is the one exception: every branch requires `target_mode` to be a string with a specific literal. Top-level `{ type: "string" }` is correct (loosest common type) and helps clients render a friendly hint without falsely narrowing the value to one branch's literal.
- `required: ["target_mode"]` at top level reflects the cross-branch invariant. Other properties are required in some branches but not others; they MUST NOT be top-level required.

**Branch property-set algorithm** (used during wrap):

```
function unionTopLevelProperties(branches):
  union = {}
  for each branch in branches:
    if branch has properties: for each key in branch.properties: union[key] = {}
  return union

function intersectionTopLevelRequired(branches):
  if branches is empty: return []
  required_sets = [Set(branch.required ?? []) for branch in branches]
  result = required_sets[0]
  for s in required_sets[1:]: result = result ∩ s
  return Array.from(result)
```

The discriminator gets a special widening: if every branch's top-level `properties.target_mode` exists with `type === "string"` (regardless of `const`), the unioned entry's value becomes `{ type: "string" }`. This is the only special case; all other unioned entries are `{}`.

**Rejected alternative**:

- **Project per-branch property types into a `oneOf`-like structure inside the `properties[key]` itself** (e.g. `properties.target_mode = { oneOf: [{ const: "specific" }, { const: "active" }] }`). Rejected — this is exactly the structural complexity the strict-naive client is rejecting in the first place. If we put `oneOf` inside `properties`, naive clients strip it and we're back to `{}`. The whole point is `properties[key]` MUST be a leaf shape.

**Disposes of**: Edge Case "Pattern (a) ZodIntersection<ZodEffects, ZodObject>" at the property-emission level — the wrap branch processes `allOf` by extracting properties from EACH `allOf` arm (recursing into `anyOf` if the arm is itself a wrapped union) and unioning everything.

---

## R3 — `additionalProperties` policy on the wrap branch (Clarifications C2)

**Decision**: Keep `additionalProperties: true` on the top-level wrap envelope, MATCHING today's behaviour. Do NOT change to `false`. The runtime zod (`targetModeSpecificBaseSchema`, `targetModeActiveBaseSchema`) uses `.passthrough()`, so the runtime ACCEPTS unknown keys for `target_mode === "specific"` and `target_mode === "active"` branches. Publishing `false` would falsely advertise the runtime as stricter than it is, breaking spec FR-002 ("the call SHOULD succeed" where the runtime accepts the input).

**Empirical observation**: Cowork-shape clients evidently honour `additionalProperties: true` (or default to permissive when absent — JSON Schema Draft 7 default). The user's bug was NOT that valid keys were rejected by `additionalProperties: false`; it was that the strict-naive validator stripped unknown TOP-LEVEL KEYS like `oneOf` from the schema during ITS OWN parse of the published `inputSchema`. Those are different concerns.

**Rationale**:

- The runtime is permissive (passthrough); the published schema must be at-least-as-permissive on `additionalProperties`.
- Strict-rich clients (MCP SDK-shape) honour `additionalProperties: true` correctly — they don't strip top-level keys the user passed.
- Strict-naive clients receive `properties: { target_mode: ..., vault: ..., file: ..., path: ... }` after R2 widening; their argument-stripping pass keeps the four documented keys and drops anything else. `additionalProperties: true` doesn't help them keep additional keys (they don't know to look for it), but it doesn't HURT either, and it preserves the contract of the wrap branch unchanged for strict-rich clients.
- For `obsidian_exec` (the flat-`z.object` case, FR-005), `additionalProperties: false` is preserved — that schema goes through the no-op branch and isn't touched by the widening. Drift detector FR-007 enforces this.

**Disposes of**: Suggested clarification C2.

---

## R4 — Pattern (a) (`ZodIntersection`) emit shape

**Decision**: For Pattern (a) inputs (`targetModeSchema.and(z.object({...}))`), `zod-to-json-schema` emits `{ allOf: [<inner-anyOf>, <inner-extras>] }`. The wrap branch detects `allOf` (the existing branch handles it), but today preserves it verbatim — no top-level `properties`. The R2 widening must therefore extract properties from BOTH `allOf` arms and union them at top level. The `oneOf` from the inner `anyOf` arm is preserved separately at the same top level (rewritten from `anyOf` per the existing P2 decision in feature 007).

**Empirical evidence**: probe output for `targetModeSchema.and(z.object({ note_text: z.string() }))`:

```json
{
  "allOf": [
    { "anyOf": [
        { "type": "object", "properties": { "target_mode": ..., "vault": ..., "file": ..., "path": ... }, ... },
        { "type": "object", "properties": { "target_mode": ... }, ... }
      ] },
    { "type": "object", "properties": { "note_text": ... }, "required": ["note_text"] }
  ],
  "$schema": "..."
}
```

After widening, the published envelope becomes:

```json
{
  "type": "object",
  "additionalProperties": true,
  "properties": {
    "target_mode": { "type": "string" },
    "vault": {}, "file": {}, "path": {}, "note_text": {}
  },
  "required": ["target_mode", "note_text"],
  "oneOf": [<branch1-stripped>, <branch2-stripped>],
  "allOf": [<inner-extras-arm>],
  "$schema": "..."
}
```

(The inner `allOf` arm survives as the `note_text`-required arm. Its structural keep is what carries the per-tool-extension constraints into the published schema for strict-rich clients.)

**Rationale**:

- Pattern (a) is the canonical extension idiom (write_note adds `note_text`, append_note adds `note_text` + `at_top`, etc.). Without R4 widening, every Pattern (a) consumer would inherit the same hollow descriptor for strict-naive clients and the spec's FR-003 (inheritance) would fail. R4 closes that hole.
- The wrap branch's algorithm becomes:

  ```
  branches := raw.anyOf || raw.oneOf
  if branches:
    unionedProps := unionTopLevelProperties(branches)
    requiredKeys := intersectionTopLevelRequired(branches)
    envelope.oneOf = branches.map(stripInnerObjectType)
  if raw.allOf:
    for arm in raw.allOf:
      if arm.anyOf || arm.oneOf:
        unionedProps merges in unionTopLevelProperties(arm.{anyOf,oneOf})
        envelope.oneOf = arm.{anyOf,oneOf}.map(stripInnerObjectType)
        requiredKeys = intersect with intersectionTopLevelRequired(arm.{anyOf,oneOf})
      else if arm.properties:
        unionedProps merges in arm.properties.keys → {}
        requiredKeys = union with arm.required ?? []
    envelope.allOf = arm-arms-without-the-anyOf-one  // preserve per-tool constraints
  envelope.properties = unionedProps
  envelope.required = requiredKeys
  ```

- The implementation in `_shared.ts` keeps the helper at ≤ 80 LOC. The added complexity (one more loop over `allOf` arms, one inner `anyOf` extraction) is bounded.

**Alternatives considered**:

- **Detect `allOf` and recurse**. Considered — but would call `zodToJsonSchema` on the original schema multiple times (FR-013 forbids), or would require a second `toMcpInputSchema` call on each arm (same problem). Rejected.
- **Emit `properties` as full per-branch shapes (with `type`, `const`, etc.)** when the union is consistent across branches. Rejected — false-positive risk (the discriminator constants differ per branch; we'd accidentally narrow `target_mode` to one branch's literal and break the other branch's clients). The leaf-`{}` widening is the safe choice.

**Disposes of**: Edge Case "Pattern (a) ZodIntersection<ZodEffects, ZodObject>" at the implementation level.

---

## R5 — Pattern (b) (fresh discriminated union with union-level `superRefine`) emit shape

**Decision**: Pattern (b) inputs emit the same `{ anyOf: [...] }` shape as `targetModeSchema` itself (the `superRefine` doesn't change the JSON Schema output — confirmed empirically). The R2 widening therefore handles Pattern (b) identically to Pattern (basic re-export). No additional algorithm steps needed. The drift detector covers Pattern (b) by registering a synthetic Pattern (b) tool fixture and asserting on its published shape.

**Empirical evidence**: probe output for a Pattern (b) build (write-note-shape):

```json
{
  "anyOf": [
    { "type": "object", "properties": { "target_mode": ..., "vault": ..., "file": ..., "path": ..., "note_text": ... }, ... },
    { "type": "object", "properties": { "target_mode": ..., "note_text": ... }, ... }
  ],
  "$schema": "..."
}
```

The R2 union covers `note_text` correctly because BOTH branches have it.

**Rationale**: Pattern (b) is the more flexible authoring pattern (per-branch field divergence is allowed); Pattern (a) is the more terse (one tool-specific arm bolted onto the union). Both get the SAME widened published shape, which is the inheritance property FR-003 demands.

---

## R6 — Where does the fix live? (Suggested clarification C1)

**Decision**: **Helper-only**. Modify `toMcpInputSchema` at `src/tools/_shared.ts` to add the R2/R4 widening to the wrap branch. No companion export at `target-mode.ts`. No predicate change (the predicate already works — see R1). No `registerTool` signature change.

**Rationale**:

- R1's empirical evidence eliminates the "predicate gap" hypothesis; the helper's structure is correct, only its WRAP-BRANCH OUTPUT needs widening.
- A helper-only fix lands the inheritance property at the only common chokepoint — every typed tool's schema flows through `registerTool → toMcpInputSchema`, regardless of whether it re-exports `targetModeSchema`, extends it (Pattern (a)), or builds its own Pattern (b) discriminated union.
- A `target-mode.ts`-located fix would require `target-mode.ts` to KNOW about `toMcpInputSchema` (an upward import, Principle I violation) OR replicate the helper's logic (Principle III violation — duplicate publication-pipeline code).
- The spec's Constraints already locked Principle III (FR-009) and Principle I (FR-015); helper-only is the only path that satisfies both.

**Module location**: `src/tools/_shared.ts` is correct. The helper currently lives there alongside `RegisteredTool`, `asToolError`, and `ToolDescriptor`. The new internal subroutines (`unionTopLevelProperties`, `intersectionTopLevelRequired`, the discriminator-detection special case) live in the same file as private functions.

**Disposes of**: Suggested clarification C1.

---

## R7 — Drift-detector scope (Suggested clarification C3)

**Decision**: **Parameterised over the registry**. The drift detector is a `describe.each([...])` (or equivalent) vitest block that walks every tool returned by the in-process registry from `createServer({ registerSignalHandlers: false }).server` (or by directly inspecting the `tools` array passed to `setRequestHandler(ListToolsRequestSchema, ...)`) and asserts a contract per-tool. For `read_note`: properties contains `target_mode`, `vault`, `file`, `path`. For `obsidian_exec`: properties is `{ command, vault, parameters, flags, copy, timeoutMs }`, `required: ["command"]`, `additionalProperties: false`. For `help`: structural validity (`type === "object"`, properties non-empty if the runtime schema has any keys). Future tools auto-inherit the structural-validity assertion; per-tool invariants live in a per-tool case-table when the tool author chooses to add one.

**Rationale**:

- The user's preference (suggested clarification C3) is parameterised; the registry is iterable in tests via `createServer`. The cost of parameterisation is one extra fixture file, paid once.
- A single-tool detector would not catch a regression introduced by adding a new typed tool (e.g. `write_note`) whose schema goes through `registerTool` but whose tests don't include a per-tool published-shape assertion. Parameterised detection is the only durable shape.
- The detector lives at the same layer as feature 005's "registry consistency" block (`src/server.test.ts`) — by extension, not replacement. Feature 007's deferred T004 detector becomes this feature's R7 deliverable. A new dedicated test file at `src/server.published-schema.test.ts` (or co-located `src/tools/_register.test.ts` if registerTool is the surface under test) carries the detector. **Decision: co-locate at `src/tools/_register.test.ts`** — the `registerTool` factory IS the surface that produces the descriptor, and Principle II ("co-located tests with the source module they cover") points there.

**Per-tool invariant case-table** (lives in the same test file):

```
const invariants = {
  read_note: {
    properties_must_include: ["target_mode", "vault", "file", "path"],
    required_must_include: ["target_mode"],
    type: "object",
  },
  obsidian_exec: {
    properties_must_equal_set: ["command", "vault", "parameters", "flags", "copy", "timeoutMs"],
    required_equals: ["command"],
    additionalProperties: false,
    type: "object",
  },
  help: {
    type: "object",
    // the runtime schema has properties — published has them too; no per-key invariant
  },
};
```

**Disposes of**: Suggested clarification C3.

---

## R8 — Live-wire integration test (Suggested clarification C4)

**Decision**: **Include both** layers. The unit-level drift detector at the registerTool-output layer (R7) is the primary merge gate. An additional in-process integration test (`createServer → InMemoryTransport → Client.listTools()`) is added as defense-in-depth in the same file, mirrors the SC-001/SC-002 manual-verification scenarios, and asserts the same per-tool invariants on the SDK's wire output.

**Rationale**:

- The integration test is cheap: ~25 LOC (linked transport pair, server connect, client connect, listTools, assertions). The MCP SDK test patterns are mature enough that this is one block.
- It catches a class of regressions the unit-level detector cannot: anything the SDK's `Server` → `ListToolsRequestSchema` handler / wire layer might transform. Today the SDK preserves the envelope verbatim (R1 empirical), but a future SDK upgrade could change behaviour.
- The user's default (suggested clarification C4) was "optional, defense-in-depth"; promoting it to "included, defense-in-depth" is a small cost-of-confidence bet that catches future SDK-version regressions.

**Disposes of**: Suggested clarification C4.

---

## R9 — Strict-naive client coverage: which clients are we explicitly compatibility-testing against?

**Decision**: Manual verification (SC-001 / SC-002) is performed against **Cowork** (the client that produced the bug report, confirmed strict-naive shape) and **Claude Desktop** (strict-rich, MCP SDK-shape — control case). MCP Inspector is recommended but not blocking. The drift detector at R7 is the primary regression guard for both shapes; the manual verification is the wire-level acceptance test that gates `0.2.1` release.

**Rationale**:

- Cowork is the empirically-affected client; it's also the strictest known consumer of the published `inputSchema`. If Cowork accepts, weaker validators accept too.
- Claude Desktop uses the official SDK so it preserves `oneOf`; it serves as the negative-regression check (the fix MUST NOT break it).
- MCP Inspector is the documented protocol explorer; it's a useful third probe but not load-bearing.

---

## R10 — Version bump strategy

**Decision**: Patch increment 0.2.0 → 0.2.1 in `package.json` and a corresponding entry in `CHANGELOG.md`. No public-signature changes; the helper's TypeScript signature remains `(zodSchema: ZodTypeAny) => JsonSchemaObject`. The wrap branch's output gains additional keys (`properties`, `required`) but never alters or removes existing keys (`type`, `oneOf`, `additionalProperties`, `$schema`) — the change is structurally additive.

**Rationale**:

- FR-011 mandates patch-only unless a public signature changes; R6 (helper-only fix) doesn't change any public signature.
- The `0.2.1` `CHANGELOG.md` entry is the user-facing record of the fix and includes the symptom (`read_note` argument stripping under spec-conformant clients), the root cause (strict-naive client interpretation of the wrapped envelope dropping `oneOf`), the fix surface (top-level `properties` widening in `toMcpInputSchema`), and the inheritance note (Pattern (a)/(b) consumers protected by the same fix).

---

## R11 — `zod-to-json-schema` pinning (Suggested clarification C5)

**Decision**: **Keep current pin** (`^3.23.5` in manifest, lockfile-resolved 3.25.2). No version change. R1's empirical evidence shows the library output is stable across the 3.23.x → 3.25.x range for the inputs we care about; pinning would not change outcomes and would forfeit future security/bug fixes.

**Rationale**: Mechanical — R1 already disposed of the "library version is the cause" hypothesis. C5's preferred fallback (downstream fix) is exactly R6's helper-only widening.

**Disposes of**: Suggested clarification C5.

---

## R12 — Tests `_shared.test.ts` coverage additions

**Decision**: The existing `_shared.test.ts` (7 cases per spec note) gains FOUR new cases tied to the wrap-branch widening:

1. **Wrap-branch widening: simple union**. Input: `z.discriminatedUnion("target_mode", [<spec>, <active>])`. Asserts top-level `properties` contains the union of branch properties; `required` contains `["target_mode"]`; `oneOf` is preserved with branch shapes.
2. **Wrap-branch widening: ZodEffects union**. Input: `targetModeSchema` (the real primitive). Asserts the same.
3. **Wrap-branch widening: Pattern (a) intersection**. Input: `targetModeSchema.and(z.object({ note_text: z.string() }))`. Asserts top-level properties includes `note_text` AND the four target-mode keys; `required` contains `["target_mode", "note_text"]`.
4. **No-op branch unchanged**. Input: a flat `z.object({ command: z.string() }).strict()`. Asserts the output is byte-identical to today's (no widening applied; `additionalProperties: false` preserved).

These cases live in the same test file as the existing 7 (Principle II co-location). Per the constitution, modifying `_shared.ts` triggers the obligation to ship its tests in the same change — these four cover the diff exactly.

**Rationale**: covers the four input shapes the wrap branch needs to handle correctly, and the no-op branch as a regression guard. SC-005 (existing 7 + 31 cases continue to pass) is satisfied because the existing cases test paths that DON'T enter the new widening.

---

## R13 — `data-model.md` and `contracts/` outputs

**Decision**: Phase 1 produces:

- `data-model.md` — type-level shapes for the new internal subroutines (`unionTopLevelProperties`, `intersectionTopLevelRequired`), the existing `JsonSchemaObject` interface (now documented as load-bearing for the widened envelope), and the per-tool invariant case-table for the drift detector. No new public types.
- `contracts/envelope-helper.contract.md` — the updated `toMcpInputSchema` interface contract (input zod kinds → output shape) including the wrap branch's widening. SUPERSEDES feature 007's `contracts/envelope-helper.contract.md` (which described the pre-widening behaviour).
- `contracts/drift-detector.contract.md` — the parameterised drift-detector contract (registry walk, per-tool invariant table, the integration-layer assertion).
- `quickstart.md` — twelve verification scenarios mapped 1:1 to SC-001..SC-010 plus the drift-detector "fail when reverted" check.

No `data-model.md` table for "new entities" because there are no new entities; the document captures schema shapes, not domain models.

---

## Open questions resolved into Phase 1

All `NEEDS CLARIFICATION` markers are resolved by R1–R12. Phase 1 (data-model, contracts, quickstart) has no carried-forward unknowns.

The five suggested clarifications C1–C5 are disposed:

- C1 (fix surface): R6 — helper-only widening.
- C2 (`additionalProperties` policy): R3 — keep `true` on the wrap branch.
- C3 (drift-detector scope): R7 — parameterised over registry, co-located at `_register.test.ts`.
- C4 (live-wire integration test): R8 — included as defense-in-depth.
- C5 (`zod-to-json-schema` pinning): R11 — keep current pin.

The user's hypothesis from the spec's Background is corrected by R1: the bug is a publication-pipeline COVERAGE GAP (the wrap branch produces a schema strict-naive clients underread), not a PREDICATE GAP. The spec's normative requirements hold unchanged; the technical approach is now grounded in the empirical evidence captured here.
