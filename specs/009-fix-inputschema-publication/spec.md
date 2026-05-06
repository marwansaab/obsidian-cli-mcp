# Feature Specification: Fix Empty Published `inputSchema` for `targetModeSchema` Consumers

**Feature Branch**: `009-fix-inputschema-publication`
**Created**: 2026-05-07
**Status**: Draft
**Input**: User description: a regression in `0.2.0` where `read_note`'s published `inputSchema` is the hollow shape `{ "$schema": "...", "type": "object", "properties": {} }`, causing spec-conformant MCP clients to strip every argument before sending. The defect is not specific to `read_note`: it is a publication-pipeline bug that fires whenever the registered zod schema is `ZodEffects<ZodDiscriminatedUnion<...>>` — i.e. `targetModeSchema` and the canonical re-use pattern that every future typed tool consuming the target-mode primitive (`write_note`, `append_note`, …) is meant to follow. The fix must restore `read_note` end-to-end through a strict client, prevent recurrence at the primitive layer, and add a drift detector that fires on any future regression. Runtime zod surface, `obsidian_exec`'s published shape, and the rest of the 008-refactor wire surface are explicitly frozen. Released as `0.2.1` (patch).

## Background *(non-normative — context only)*

`0.2.0` shipped two architectural deepenings (feature 008): the `registerTool` factory and the `dispatchCli` primitive. Part of 008's research (R10) retired feature 007's `targetModeJsonSchema` companion export on the assumption that `registerTool` consuming the zod schema directly through `toMcpInputSchema` would produce an equivalent published shape. That assumption was never verified at the wire because no test in either feature 007 or feature 008 asserts on a tool's actual published `inputSchema` payload. Feature 007 had documented the canonical transformation for `z.discriminatedUnion(...).superRefine(...)` inputs (`specs/007-fix-list-tools-schema/data-model.md:80`), and 008's per-tool worked example for `read_note` (`specs/008-refactor/contracts/register-tool.contract.md:144`) reaffirmed it — but neither feature shipped a test that observes whether the registered pipeline meets that contract.

It does not. Inspecting `src/tools/_shared.ts:100-138`: `toMcpInputSchema` branches on `raw.type === "object"`. When the input is `targetModeSchema` (`src/target-mode/target-mode.ts:89` — a `ZodEffects` wrapping a `ZodDiscriminatedUnion`), `zod-to-json-schema@3.23.5` emits an output whose top-level `type` is already `"object"` but whose body is empty (no `properties`, no `oneOf`, no `anyOf`). The `if (raw.type === "object")` branch fires, the helper returns the empty shape verbatim, and the wrap-with-`oneOf` branch (lines 108-138) is never reached. The published descriptor for `read_note` becomes `{ "$schema": "...", "type": "object", "properties": {} }`, and a spec-conformant MCP client (one that validates outgoing arguments against the published `inputSchema` and strips unknown properties) sends `{}` to the server. The server-side zod validator — which is correct — receives the empty object and returns `VALIDATION_ERROR` with `Invalid discriminator value. Expected 'specific' | 'active'`.

The blast radius extends beyond `read_note`. Every future typed tool whose schema is `targetModeSchema` (re-export, today: `read_note`), `targetModeSchema.and(z.object({...}))` (Pattern (a), e.g. planned `write_note`/`append_note`), or a discriminated union built over the base schemas with a union-level `superRefine` (Pattern (b)) currently inherits the same hollow descriptor. Until the pipeline is fixed, the typed-tool roadmap is blocked at the wire. The control case is intact: `obsidian_exec` (a flat `z.object({...})`) publishes a complete and well-formed `inputSchema` and works end-to-end through the same clients.

The other two coincident gaps that allowed this to ship: feature 007's promised `targetModeJsonSchema` companion export was never written; feature 007's promised drift detector was never written. This feature is the missing finisher.

## Clarifications

### Session 2026-05-07

*No clarifications required to reach planning — the user's input enumerates required acceptance, out-of-scope items, and constraints precisely. Five plan-author concerns are deferred to `/speckit-clarify` (see Assumptions and the "Open Questions for `/speckit-clarify`" section below); none of them block specification.*

## User Scenarios & Testing *(mandatory)*

### User Story 1 — `read_note` works end-to-end through a spec-conformant MCP client (Priority: P1)

A user has installed `@marwansaab/obsidian-cli-mcp@0.2.1` (or later) and configured it as an MCP server in a strict client (Cowork, Claude Desktop, MCP Inspector — anything that validates outgoing arguments against the tool's published `inputSchema` and strips unknown properties). The client successfully completes `tools/list`, sees `read_note` in the catalog, and the user invokes it in either supported mode. The arguments survive client-side validation, reach the server with their original shape, are accepted by the runtime zod validator, and the underlying CLI returns the note's content. No client configuration change ("disable argument stripping", "trust this server's schemas") is required — the published descriptor is well-formed.

**Why this priority**: This is the immediate release blocker. `read_note` is the headline typed tool of `0.2.0` (BI-003) and is currently uncallable from any spec-conformant MCP client; the workaround `obsidian_exec({ command: "read", ... })` works but defeats the purpose of having a typed surface. Until this lands, every published version since `0.2.0` is functionally a regression for users who adopted typed tools.

**Independent Test**: With the fixed package installed and a real Obsidian vault available, drive a strict MCP client (one that validates outgoing arguments against `inputSchema`, e.g. Cowork) through the standard sequence: `tools/list` → inspect `read_note`'s `inputSchema` → invoke `read_note({ target_mode: "specific", vault: "<v>", path: "<p>" })` → invoke `read_note({ target_mode: "active" })`. Both invocations return `{ content: <stdout> }` with the expected note bodies. Neither returns `VALIDATION_ERROR`. Disabling argument stripping is NOT considered a passing condition.

**Acceptance Scenarios**:

1. **Given** the fixed package is installed and a strict MCP client validates outgoing arguments against `inputSchema`, **When** the client calls `read_note({ target_mode: "specific", vault: "<v>", path: "<p>" })`, **Then** the call succeeds and returns the note's content (no `VALIDATION_ERROR`, no argument stripping).
2. **Given** the fixed package is installed and a strict MCP client is connected, **When** the client calls `read_note({ target_mode: "active" })`, **Then** the call succeeds and returns the active note's content.
3. **Given** the fixed package is installed, **When** the client inspects `read_note`'s entry in `tools/list`, **Then** the published `inputSchema` exposes the property names the runtime accepts (`target_mode`, `vault`, `file`, `path`) somewhere in its structure (top-level, or nested inside a `oneOf`/`anyOf` of branch shapes), and `inputSchema.type === "object"` at the root.
4. **Given** the fixed package is installed, **When** the client calls `read_note` with a malformed input (e.g. both `file` and `path` in specific mode, or a forbidden `vault` in active mode), **Then** the runtime zod validator returns `VALIDATION_ERROR` with the exact same XOR / forbidden-key messages produced by feature 006 and feature 007 — the runtime-validation contract is unchanged.

---

### User Story 2 — Future typed tools that consume `targetModeSchema` inherit the fix automatically (Priority: P1)

A developer (or AI coding assistant) is asked to add a new typed tool that needs the target-mode contract — e.g., the planned `write_note` or `append_note`. They register it via `registerTool` with one of the three canonical schema shapes: a re-export of `targetModeSchema`, an extension of it via `targetModeSchema.and(z.object({ <tool-specific fields> }))` (Pattern (a) from feature 004), or a discriminated union built over the per-mode base schemas with a union-level `superRefine` dispatcher (Pattern (b) from feature 004). In every case, the tool's published `inputSchema` is well-formed for spec-conformant MCP clients without any per-tool plumbing — no companion JSON Schema export, no second helper call, no opt-in flag. The tool author writes only zod.

**Why this priority**: Equal priority with Story 1. The publication pipeline is the root cause; fixing it once at the primitive is the only sustainable path. If only `read_note` is fixed (e.g. by adding a hand-written companion JSON Schema), the next two typed tools on the roadmap — `write_note` and `append_note`, both planned to consume `targetModeSchema` per the Pattern (a) framework — will inherit the same defect, and the roadmap stays blocked. This is also the closure of feature 007's deferred-and-dropped `targetModeJsonSchema` companion (007 task T004 was never implemented; 008 R10 assumed the registry path covered the same ground without verification). Both gaps must close together so that the architecture's promised "zod is the single source of truth" property is mechanically enforced rather than aspirationally documented.

**Independent Test**: Add a synthetic typed tool whose registered schema is `targetModeSchema.and(z.object({ note_text: z.string() }))` (Pattern (a)) and a second whose schema is a discriminated union over the per-mode base schemas with a union-level `superRefine` (Pattern (b)). For each, assert via the project's `tools/list` (or registry) test surface that the published `inputSchema.type === "object"` at the root, that the property names the runtime accepts (including `note_text` for Pattern (a)) appear somewhere in the published structure, and that a strict-client argument-stripping pass against the published schema preserves all required fields. Then remove the synthetic tools — they exist only as test fixtures.

**Acceptance Scenarios**:

1. **Given** a synthetic tool whose schema is `targetModeSchema` (re-export), **When** it passes through `registerTool` and `stripSchemaDescriptions`, **Then** the published `inputSchema` exposes the four property names `target_mode`, `vault`, `file`, `path` (in some valid form — top-level, or nested inside `oneOf`/`anyOf` branches), and `inputSchema.type === "object"`.
2. **Given** a synthetic tool whose schema is `targetModeSchema.and(z.object({ note_text: z.string() }))` (Pattern (a)), **When** it passes through `registerTool` and `stripSchemaDescriptions`, **Then** the published `inputSchema` additionally exposes `note_text` as a property somewhere in its structure, and `inputSchema.type === "object"`.
3. **Given** a synthetic tool whose schema is a discriminated union built over the per-mode base schemas with a union-level `superRefine` (Pattern (b)), **When** it passes through `registerTool` and `stripSchemaDescriptions`, **Then** the published `inputSchema` exposes both branch shapes (typically via `oneOf` / `anyOf` nested inside the top-level object), and `inputSchema.type === "object"`.
4. **Given** any of the above synthetic tools is registered, **When** the test suite runs the tool through a simulated strict-client argument-stripping pass against its published schema, **Then** every property the runtime requires survives the strip.

---

### User Story 3 — A drift detector fires on any future regression of the publication pipeline (Priority: P2)

The test suite contains an automated check that observes the actual published `inputSchema` for every registered tool — not the zod schema, not the `toMcpInputSchema` output in isolation, but the descriptor that `tools/list` would return after `registerTool` and `stripSchemaDescriptions` have run. For `read_note` (and any future tool consuming `targetModeSchema`), the check asserts the published descriptor exposes every property name the runtime validator accepts. For `obsidian_exec` (the flat-`z.object` control case), the check asserts the published shape matches today's well-formed descriptor exactly: 6 properties, `required: ["command"]`, `additionalProperties: false`. Any future change to `_shared.ts`, `target-mode.ts`, `_register.ts`, or `obsidian_exec/schema.ts` that regresses either invariant fails the test before it can be released.

**Why this priority**: Below P1 because the immediate user-visible bug is what blocks `0.2.0` users today; the drift detector is the durable forcing function that prevents recurrence. Three coincident gaps allowed `0.2.0` to ship broken: feature 007's `targetModeJsonSchema` companion was never implemented, feature 007's drift detector was never written, and feature 008's `registerTool` factory's tests never observed the actual published `inputSchema` (they assert on handler behaviour, registry counts, and zod runtime parses). Closing the test-coverage gap is what makes the fix durable rather than hopeful.

**Independent Test**: Land the drift detector as a vitest case (or parameterised case set) that exercises the registered tools through `createServer` (or a direct registry walk) and observes the published descriptors. Verify the test fails when run against today's `0.2.0` source (it would observe `read_note`'s empty `properties: {}` and report the regression). Verify it passes after the fix lands. Verify a deliberate revert of either `_shared.ts` (re-introducing the predicate gap) or `target-mode.ts` (e.g. replacing `targetModeSchema` with `z.object({})`) fails the detector.

**Acceptance Scenarios**:

1. **Given** the drift detector is in place, **When** it runs against the fixed source, **Then** it asserts `read_note`'s published `inputSchema` exposes all four target-mode property names (`target_mode`, `vault`, `file`, `path`) somewhere in its structure, and the assertion passes.
2. **Given** the drift detector is in place, **When** it runs against the fixed source, **Then** it asserts `obsidian_exec`'s published `inputSchema` is unchanged from today: 6 properties (`command`, `vault`, `parameters`, `flags`, `copy`, `timeoutMs`), `required: ["command"]`, `additionalProperties: false`, and the assertion passes.
3. **Given** the drift detector is in place, **When** a developer reverts the helper fix (or otherwise reintroduces a publication-pipeline bug that empties `read_note`'s descriptor), **Then** the test fails with a message that names the missing property and points the developer at the publication pipeline.
4. **Given** the drift detector is in place, **When** a developer accidentally widens `obsidian_exec`'s `additionalProperties` to `true`, **Then** the test fails with a message naming the regression.

---

### Edge Cases

- **`ZodEffects` wrapping any union shape.** The known-bad input is `ZodEffects<ZodDiscriminatedUnion<...>>` (`targetModeSchema`'s shape), but `ZodEffects` over a plain `z.union(...)`, over an `intersection`, or over an `extend`-then-`superRefine` chain may all hit the same predicate gap. The fix MUST be robust against the broader class, not narrowly tuned to the exact `targetModeSchema` shape.
- **`targetModeSchema.and(z.object({...}))` (Pattern (a)).** This is a `ZodIntersection<ZodEffects<ZodDiscriminatedUnion>, ZodObject>`. `zod-to-json-schema`'s output for it may be different from the bare `ZodEffects<ZodDiscriminatedUnion>` case, including potentially using `allOf`. The fix MUST produce a well-formed published descriptor for this shape too.
- **Pattern (b) — discriminated union built directly with union-level `superRefine`.** This produces the same `ZodEffects<ZodDiscriminatedUnion>` shape as `targetModeSchema`; the test must cover the case where the consumer constructs it from scratch over their own base schemas, not by re-exporting the primitive.
- **`zod-to-json-schema` library upgrade.** A future minor or patch upgrade of `zod-to-json-schema` may change what the library emits for `ZodEffects<ZodDiscriminatedUnion>`. The fix and the drift detector together MUST detect such a change before it reaches a release tag — i.e. the detector must observe the actual published shape, not be tautologically defined against the helper's output.
- **`additionalProperties` policy on the wrap branch.** Today `_shared.ts:126` sets `additionalProperties: true` on the wrap-branch envelope. Strict MCP clients may treat this as "too permissive" or strip nothing (because anything is allowed). The fix MUST result in a descriptor strict clients accept; whether that requires changing the policy is deferred to `/speckit-clarify` (C2).
- **Help-tool docs roster unchanged.** `read_note`'s `docs/tools/read_note.md` already exists and lists the five reachable error codes. The fix is in the publication pipeline; it does not change the help docs roster, the error codes, or the doc-aggregation behaviour.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `read_note` tool's published `inputSchema` (after `registerTool` and `stripSchemaDescriptions`) MUST expose the property names the runtime validator accepts — `target_mode`, `vault`, `file`, `path` — somewhere in its structure (top-level, or nested inside a `oneOf`/`anyOf` of branch shapes), and MUST declare `"type": "object"` at the root.
- **FR-002**: A spec-conformant MCP client (one that validates outgoing arguments against the published `inputSchema` and strips unknown properties) MUST be able to invoke `read_note({ target_mode: "specific", vault: "<v>", path: "<p>" })` and `read_note({ target_mode: "active" })` end-to-end and receive `{ content: <stdout> }` (no `VALIDATION_ERROR`, no argument stripping). Disabling client-side argument stripping is NOT a permitted workaround.
- **FR-003**: Any future typed tool whose registered zod schema is `targetModeSchema` (re-export), `targetModeSchema.and(z.object({...}))` (Pattern (a)), or a discriminated union built over the per-mode base schemas with a union-level `superRefine` (Pattern (b)) MUST publish a well-formed `inputSchema` automatically — no per-tool plumbing, no companion JSON Schema export, no opt-in flag. The fix lands once at the publication pipeline (or the target-mode primitive, mechanically derived).
- **FR-004**: `targetModeSchema`'s runtime zod surface MUST remain unchanged: the zod type, `parse` behaviour, inferred TypeScript type, and existing exports from `src/target-mode/target-mode.ts` are all frozen. The 31 cases in `src/target-mode/target-mode.test.ts` MUST pass without modification.
- **FR-005**: `obsidian_exec`'s published `inputSchema` MUST remain unchanged from `0.2.0`: 6 properties (`command`, `vault`, `parameters`, `flags`, `copy`, `timeoutMs`), `required: ["command"]`, `additionalProperties: false`, `type: "object"`. The fix MUST NOT widen `additionalProperties` to `true` for this flat-`z.object` case.
- **FR-006**: A new automated drift-detector test MUST observe the actual published `inputSchema` for `read_note` and assert that the four target-mode property names appear somewhere in its structure. The test MUST fire on a regression in either `_shared.ts` (publication pipeline) or `target-mode.ts` (primitive shape).
- **FR-007**: A second automated drift-detector test MUST observe the actual published `inputSchema` for `obsidian_exec` and assert it matches the `0.2.0` shape exactly (the six-property, `required: ["command"]`, `additionalProperties: false` envelope). The test MUST fire on a regression that widens `additionalProperties` or alters the property roster.
- **FR-008**: The drift detectors MUST exercise the publication pipeline at the same surface a real MCP client would observe — i.e. through `registerTool` + `stripSchemaDescriptions` (and, where the detector runs against `createServer`, through the SDK's `tools/list` response). A unit-only test that calls `toMcpInputSchema` in isolation is NOT sufficient on its own (it would have passed under `0.2.0`'s broken pipeline because the bug is between the helper and the registry).
- **FR-009**: The published JSON Schema MUST remain mechanically derived from the zod schema. No parallel hand-written JSON Schema may sit alongside `targetModeSchema`; if a companion export is reintroduced as part of the fix, it MUST be `toMcpInputSchema(targetModeSchema)` (or equivalent — never literal JSON).
- **FR-010**: The fix MUST NOT introduce any new error codes. The reachable error roster for `read_note` (5 codes per `docs/tools/read_note.md`) and for the server overall is unchanged. `obsidian_exec`'s error roster (per feature 008's FR-021 expansion) is also unchanged.
- **FR-011**: The fix MUST be released as version `0.2.1` (patch — bugfix only). If during planning the implementer determines that the fix changes a public signature in a way that warrants a minor bump, that determination MUST be surfaced as a clarification to the user rather than decided silently.
- **FR-012**: A `CHANGELOG.md` entry under `0.2.1` MUST describe the symptom in user-facing terms (`read_note` argument stripping under spec-conformant MCP clients), credit feature 007's deferred fix as the proximate cause, and note that the fix protects future `write_note` / `append_note` schemas (and any other Pattern (a) / Pattern (b) consumer of the target-mode primitive) by the same mechanism.
- **FR-013**: `zodToJsonSchema` MUST continue to be called exactly once per `registerTool` invocation. The current "render once at registration, capture in closure" property of `_register.ts` is preserved — no per-call rendering, no memoization, no second call from a different layer.
- **FR-014**: Co-located tests MUST ship in the same change as the source files they exercise (Principle II): any change to `_shared.ts` ships its tests in `_shared.test.ts`; any change to `target-mode.ts` ships its tests in `target-mode.test.ts`. The drift detectors live with whichever module's invariant they assert.
- **FR-015**: The fix MUST NOT introduce new upward imports (Principle I): any helper added to `_shared.ts` stays at the `tools/` layer; `target-mode/` does not gain a dependency on `tools/` regardless of whether a companion export is reintroduced.
- **FR-016**: The 008-refactor surface MUST remain unchanged outside the publication pipeline: `dispatchCli`, `invokeCli`, `invokeBoundedCli`, the in-flight registry, the four-priority error classification, the always-on bounds, and the `obsidian_exec` argv-assembly contract are all frozen.

### Key Entities

- **Published `inputSchema`**: The JSON Schema rendered for an MCP client's consumption — what appears in the `tools/list` response after `registerTool` and `stripSchemaDescriptions` have run. Distinct from the in-process zod validator. The locus of this regression: today, for `read_note`, this object is `{ "$schema": "...", "type": "object", "properties": {} }`.
- **Runtime zod schema**: The zod schema passed to `registerTool` as `spec.schema` and used at call time to parse and validate the arguments object. For `read_note` this is `targetModeSchema`. Frozen by FR-004.
- **`targetModeSchema`**: The shared discriminated-union primitive defined at `src/target-mode/target-mode.ts:89` — `targetModeBaseUnion.superRefine(...)`, i.e. `ZodEffects<ZodDiscriminatedUnion<...>>`. The shape that breaks the publication pipeline and the canonical re-use pattern future typed tools are meant to follow.
- **`toMcpInputSchema`**: The publication-pipeline helper at `src/tools/_shared.ts:100-138` that renders any zod schema to a JSON Schema whose top-level `type` is `"object"`. The locus of the predicate-gap defect: its `raw.type === "object"` early-return fires for the `ZodEffects<ZodDiscriminatedUnion>` input.
- **`registerTool`**: The factory at `src/tools/_register.ts:23` that owns the typed-tool publication pipeline. Calls `toMcpInputSchema` once per registration. Frozen by FR-013 ("called exactly once per registration").
- **Drift detector**: A new automated test (or pair of tests) that observes the actual published `inputSchema` for the registered tools and asserts on its shape. The forcing function that prevents recurrence (FR-006, FR-007, FR-008).
- **Pattern (a) consumer**: A typed tool whose schema is `targetModeSchema.and(z.object({ <tool-specific fields> }))` — e.g. planned `write_note` (adds `note_text`), planned `append_note` (adds `note_text` + an `at_top` flag). Defined in feature 004's spec.
- **Pattern (b) consumer**: A typed tool whose schema is a discriminated union built over the per-mode base schemas with a union-level `superRefine` dispatcher. Defined in feature 004's spec.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A spec-conformant MCP client (Cowork or equivalent — one that validates outgoing arguments against `inputSchema` and strips unknown properties) successfully invokes `read_note({ target_mode: "specific", vault: "<v>", path: "<p>" })` against a real Obsidian vault and receives the note's content. Verified manually before release; manual verification recorded in the release notes for `0.2.1`.
- **SC-002**: A spec-conformant MCP client successfully invokes `read_note({ target_mode: "active" })` against a real Obsidian vault with an active note and receives the active note's content.
- **SC-003**: The drift-detector test for `read_note`'s published `inputSchema` exists in the test suite, asserts that all four target-mode property names appear somewhere in its structure, and would fail when run against today's `0.2.0` source. Verified by checkout-and-run of the detector against the `0.2.0` tag (or by deliberate revert) before merge.
- **SC-004**: The drift-detector test for `obsidian_exec`'s published `inputSchema` exists in the test suite, asserts the descriptor matches `0.2.0`'s six-property, `required: ["command"]`, `additionalProperties: false` shape, and passes after the fix.
- **SC-005**: The 31 existing cases in `src/target-mode/target-mode.test.ts` pass without modification after the fix. The 7 existing cases in `src/tools/_shared.test.ts` pass after the fix (plus any new cases added per FR-014). The full project test suite passes via `vitest run --coverage` with no coverage regressions.
- **SC-006**: The `0.2.1` `CHANGELOG.md` entry exists, names the user-visible symptom (`read_note` argument stripping under spec-conformant clients), and explicitly mentions that future `write_note` / `append_note` (and any other Pattern (a) / Pattern (b) consumer) inherit the protection.
- **SC-007**: The fix introduces zero new error codes (verified by the existing identifier-identity test on `src/errors.ts` continuing to assert the same code set; FR-010).
- **SC-008**: The fix introduces zero new ADRs. The change is consistent with ADR-003, ADR-005, ADR-006, and Principles I / II / III; it does not require — and MUST NOT silently introduce — a superseding decision.
- **SC-009**: A synthetic Pattern (a) consumer (`targetModeSchema.and(z.object({ note_text: z.string() }))`) registered through `registerTool` publishes a well-formed `inputSchema` that exposes `target_mode`, `vault`, `file`, `path`, and `note_text` somewhere in its structure. Demonstrated as part of the drift-detector or its sibling fixtures.
- **SC-010**: After the fix lands, a deliberate revert of either `_shared.ts` (re-introducing the predicate gap) or `target-mode.ts` (e.g. replacing `targetModeSchema` with an empty `z.object({})`) causes the drift detector to fail with a message that points the developer at the publication pipeline — verified once, not asserted in CI.

## Assumptions

- **Reasonable defaults the user explicitly enumerated** (out of scope, constraints, predecessor reading list, done definition) are taken as fixed inputs to the spec; the spec inherits them rather than re-deriving.
- **Drift-detector scope** (single tool vs. parameterised over the registry): assumed to be **parameterised over the registry** (per the user's preference in suggested clarification C3, and because the registry is already iterable in tests via `createServer`). The plan stage may revisit if parameterisation introduces tighter coupling than expected.
- **Fix surface** (helper-only refinement of `toMcpInputSchema` vs. re-introducing `targetModeJsonSchema` companion vs. split): assumed to **default to helper-only** if `zod-to-json-schema`'s output for `ZodEffects<ZodDiscriminatedUnion>` is tractable, and to **fall back to the companion approach** only if the library's output cannot be coerced into a usable shape downstream. The first task of `/speckit-plan` is to capture the actual library output as P0 research and pick the surface based on evidence.
- **`zod-to-json-schema` version**: assumed to remain at the currently pinned `3.23.5`. Pinning to a different known-good minor (suggested clarification C5) is an option the plan stage may take if the library's emit for the bad shape is the proximate cause; a downgrade or pin-bump is acceptable as long as it does not regress any other tool's published descriptor.
- **Live-wire verification**: assumed to be **manual** (drive a real strict client through the standard sequence; record in release notes). An automated integration test that boots `createServer` and asserts on the SDK's `tools/list` response is acceptable as an additional defense-in-depth layer if cheap to land (suggested clarification C4); the unit-level drift detector at the `registerTool`-output layer is sufficient on its own to gate merge.
- **`stripSchemaDescriptions`**: assumed to be **correct as-is** (per the user's inspection); not modified by this feature, but exercised by the drift detectors so the full publication pipeline is observed.
- **Help-tool registry-consistency block** (`src/server.test.ts` from feature 005): assumed to remain in place as defense-in-depth. The new drift detectors are additive, not a replacement.
- **Test framework**: Vitest with `@vitest/coverage-v8` per the constitution's amendment (1.1.0). New tests are vitest cases, co-located with the source they exercise.
- **`docs/tools/read_note.md`**: assumed to be **unchanged** by this feature — the help docs roster, the error code list (5 codes), and the parameter table are all frozen. The fix is in the publication pipeline; user-facing tool documentation does not need a corresponding edit.
- **Per-MCP tool notes in the user's external "The Setup" vault** are out-of-band and tracked in a separate project session; not part of this feature's done definition.

## Open Questions for `/speckit-clarify`

The user's input flagged five plan-author concerns. They are deferred — not blocking the spec — and resolved before the plan is drafted:

- **C1 — Fix surface.** Helper-only (`toMcpInputSchema` predicate refinement) vs. primitive-side (`targetModeJsonSchema` companion + `registerTool` accepts either zod or pre-built JSON Schema) vs. split. Default per Assumptions: helper-only if tractable; companion as fallback. The first plan task is to capture the actual `zod-to-json-schema` output as P0 research and choose on evidence.
- **C2 — `additionalProperties` policy on the wrap branch.** Today `_shared.ts:126` sets `true`. Strict MCP clients may reject as "too permissive". Plan stage to inspect Cowork and Claude Desktop behaviour and lock in the right value (likely `false` everywhere, but verify before committing).
- **C3 — Drift detector scope.** Single tool vs. parameterised over the registry. Default per Assumptions: parameterised. Plan stage may revisit if the parameterisation introduces tighter coupling than expected.
- **C4 — Live wire integration test.** Should the test suite also boot `createServer` and assert on the SDK's `tools/list` response? Default per Assumptions: optional — unit-level drift detector at the `registerTool`-output layer is sufficient to gate merge; integration test is defense-in-depth if cheap.
- **C5 — `zod-to-json-schema` pinning.** Pin to a specific known-good minor vs. fix downstream. Default per Assumptions: keep current pin and fix downstream; revisit only if the library's output proves intractable.

## Dependencies and Predecessors

- **Predecessor: feature 007 (`fix-list-tools-schema`)** — introduced `toMcpInputSchema`. Feature 007's task T004 (`Add targetModeJsonSchema companion export`) was never implemented; its drift detector was never written. This feature is the missing finisher.
- **Predecessor: feature 008 (`refactor`)** — introduced `registerTool` and removed `targetModeJsonSchema` per research R10 on the assumption that the registry path produced equivalent output. The wire-output assertion that would have caught this regression was not part of 008's contract; this feature adds it.
- **Predecessor: feature 006 (`read-note`)** — wired `read_note` through the registration pipeline. Its acceptance criteria assert handler behaviour and zod runtime; they do not assert published-`inputSchema` validity. This feature closes that gap.
- **Predecessor: feature 004 (`target-mode-schema`)** — defined `targetModeSchema` and the Pattern (a) / Pattern (b) reuse framework. Inspectable for context; not modified by this feature.
- **Constitution alignment.** The fix reaffirms Principle III (single source of truth, mechanically derived published JSON Schema), Principle II (co-located tests), and Principle I (downward flow). No supersession of any existing ADR; no new ADR.
- **ADRs touched (no supersession).** ADR-003 (`Enforce Target Mode in Typed Tools`), ADR-005 (`Token-Optimized Tool Definitions`), ADR-006 (`Centralized Tool Registration`). The fix is consistent with all three.

## Done Definition *(captured from user input — non-template; tracked here for `/speckit-plan` traceability)*

- `read_note` succeeds end-to-end from a spec-conformant MCP client in both modes (SC-001, SC-002).
- All existing tests pass (`vitest run --coverage`); coverage thresholds preserved (SC-005).
- New drift-detector test exists and would fail under today's `0.2.0` (SC-003).
- `obsidian_exec`'s published shape unchanged (SC-004).
- `CHANGELOG.md` entry under `0.2.1` (SC-006).
- No new ADR (SC-008); no new error codes (SC-007).
- Per-MCP tool notes in the external vault updated out-of-band (out of scope here).
