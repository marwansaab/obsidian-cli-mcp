# Feature Specification: Target Mode Schema Primitives

**Feature Branch**: `004-target-mode-schema`
**Created**: 2026-05-06
**Status**: Draft
**Input**: User description: "Add Target Mode — Reusable Zod discriminated-union schema primitives for target_mode, consumed by all typed MCP tool handlers. This is NOT a tool — it is a shared schema module that every public tool imports to enforce the intent-declaration contract from ADR-003. Pure validation; no CLI calls, no tool registration."

## Background *(non-mandatory context)*

[ADR-003 — Enforce Target Mode in Typed Tools](../../.decisions/ADR-003%20-%20Enforce%20Target%20Mode%20in%20Typed%20Tools.md) commits the project to a discriminated-union `target_mode` parameter on every typed MCP tool that touches a vault or note. The two branches encode fundamentally different intents:

- `target_mode: "specific"` — the caller knows which vault and which note. `vault` is required to scope the command; the note is identified by exactly one of `file` (note name) or `path` (vault-relative path).
- `target_mode: "active"` — the caller wants to operate on whatever note is currently open in Obsidian. Forwarding `vault`, `file`, or `path` in this mode is incoherent and historically a source of silent CLI behavior — the active-mode contract therefore forbids them at the schema boundary.

That contract is not optional. Because it must apply identically to every typed tool (`read_note`, `write_note`, `append_note`, `search_vault`, `list_notes`, …), each tool re-defining it inline would be a guaranteed source of drift. This feature ships the contract as a single shared schema primitive that every typed tool module imports and composes with its own additional fields. Per Constitution Principle III, the zod schema is the single source of truth for both the runtime validation and the TypeScript types — no parallel hand-written interfaces. Per Principle I, the primitive lives in its own module and exposes a narrow, typed surface.

The primitive is **internal**: it is not registered as an MCP tool, has no `inputSchema` of its own at the MCP boundary, and never runs a CLI invocation. It is a pure validation building block consumed by typed-tool handlers, which then route validated inputs into the [CLI adapter (feature 003)](../003-cli-adapter/spec.md) — the adapter relies on `target_mode` being present and well-typed to decide which keys to forward versus strip. This feature provides what the adapter consumes; it does not modify the adapter itself.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Specific-mode inputs validate against the documented "vault required, exactly one note locator" contract (Priority: P1)

A typed tool handler (e.g., the future `read_note`) accepts caller input claiming `target_mode: "specific"` with a vault and either a `file` or a `path`. Before any logic runs, the handler routes the input through the shared schema's `.parse()` (or `.safeParse()`) call. Well-formed inputs return a typed value with `target_mode` narrowed to the literal `"specific"` and the locator fields available; malformed inputs fail with a structured zod error pointing at the offending field path and a message that names the violated rule.

**Why this priority**: This is the primary value proposition. Without correct specific-mode validation, every typed tool accepts inputs that the CLI will then either reject opaquely (missing vault) or process ambiguously (both `file` and `path` provided — which one wins?). The schema is the only place that can enforce "exactly one of file/path" before the CLI sees the call.

**Independent Test**: With no other module loaded, parsing `{ target_mode: "specific", vault: "MyVault", file: "Note" }` against the exported schema returns success and the parsed value has TypeScript type narrowing on the `"specific"` branch. Parsing `{ target_mode: "specific", vault: "V" }` (no locator) returns a zod failure whose `error.issues` includes an entry whose message mentions "exactly one of" (or substantively equivalent). All assertions run from the schema module's test file with zero CLI calls.

**Acceptance Scenarios**:

1. **Given** the exported `target_mode` schema, **When** the caller parses `{ target_mode: "specific", vault: "MyVault", file: "Note" }`, **Then** parsing succeeds and the returned value is typed-narrowed to the `"specific"` branch with `vault: "MyVault"`, `file: "Note"`.
2. **Given** the exported schema, **When** the caller parses `{ target_mode: "specific", vault: "MyVault", path: "Notes/Note.md" }`, **Then** parsing succeeds and the returned value carries `path: "Notes/Note.md"` on the `"specific"` branch.
3. **Given** the exported schema, **When** the caller parses `{ target_mode: "specific", vault: "MyVault" }` (neither `file` nor `path`), **Then** parsing fails and the resulting zod error contains at least one issue whose `message` mentions "exactly one of" (or substantively equivalent) and identifies the locator-pair as the offending region.
4. **Given** the exported schema, **When** the caller parses `{ target_mode: "specific", vault: "MyVault", file: "Note", path: "Notes/Note.md" }` (both locators), **Then** parsing fails with the same "exactly one of" issue.
5. **Given** the exported schema, **When** the caller parses `{ target_mode: "specific", file: "Note" }` (vault missing), **Then** parsing fails with a zod issue whose `path` includes `"vault"` indicating the field is required.
6. **Given** the exported schema, **When** the caller parses `{ target_mode: "specific", vault: "", file: "Note" }` (empty vault string), **Then** parsing fails with a zod issue whose `path` includes `"vault"` and whose `message` indicates a non-empty value is required.

---

### User Story 2 — Active-mode inputs validate against the "no target-locator keys" contract (Priority: P1)

A typed tool handler whose caller declares `target_mode: "active"` is signalling that the operation should hit the currently-focused note. Forwarding `vault`, `file`, or `path` in this mode is a contract violation that the schema MUST catch before the CLI adapter is invoked. A bare `{ target_mode: "active" }` is the only well-formed shape for this branch at the primitive level (downstream tools may extend with non-target-locator fields per Story 3).

**Why this priority**: P1 alongside Story 1, not P2. The single most common LLM-error mode that ADR-003 was written to prevent is exactly the case where an agent intends to act on the active note but pastes in a stale `vault=…` from an earlier turn. The schema is the gate that makes that mistake impossible — without it, the call reaches the CLI carrying contradictory intent and produces unspecified behavior.

**Independent Test**: With no other module loaded, parsing `{ target_mode: "active" }` succeeds and yields a typed value narrowed to the `"active"` branch. Parsing each of `{ target_mode: "active", vault: "V" }`, `{ target_mode: "active", file: "Note" }`, `{ target_mode: "active", path: "Notes/Note.md" }` fails with a zod error whose message clearly attributes the failure to the forbidden locator key. All assertions run from the schema module's test file.

**Acceptance Scenarios**:

1. **Given** the exported schema, **When** the caller parses `{ target_mode: "active" }`, **Then** parsing succeeds and the returned value is typed-narrowed to the `"active"` branch with no `vault`, `file`, or `path` properties.
2. **Given** the exported schema, **When** the caller parses `{ target_mode: "active", vault: "V" }`, **Then** parsing fails with a zod issue whose `path` includes `"vault"` and whose `message` indicates the key is forbidden in active mode.
3. **Given** the exported schema, **When** the caller parses `{ target_mode: "active", file: "Note" }`, **Then** parsing fails with a zod issue whose `path` includes `"file"` and whose `message` indicates the key is forbidden in active mode.
4. **Given** the exported schema, **When** the caller parses `{ target_mode: "active", path: "Notes/Note.md" }`, **Then** parsing fails with a zod issue whose `path` includes `"path"` and whose `message` indicates the key is forbidden in active mode.
5. **Given** the exported schema, **When** the caller parses `{ target_mode: "unknown" }` (a value not in the discriminator set), **Then** parsing fails with a zod issue indicating the discriminator value is invalid (the message names `target_mode` as the discriminator field and lists the valid values).

---

### User Story 3 — Downstream tool schemas extend the primitive with their own fields without losing the target-mode contract (Priority: P1)

The reason this primitive exists is so that every typed tool module (`read_note`, `write_note`, `append_note`, `search_vault`, …) can compose its tool-specific shape on top of the shared `target_mode` contract. A `write_note` tool, for example, needs to add a `content: string` field to both branches of the discriminated union without re-stating the vault/file rules. The composition operation must (a) preserve every `target_mode` validation rule end-to-end, (b) admit the additional field as required (or optional, at the tool's discretion), and (c) produce a merged schema that round-trips cleanly through `zod-to-json-schema` so the result can be registered as an MCP tool's `inputSchema`.

**Why this priority**: P1, not P2. If composition fails, this module has no consumers — every typed tool would have to redefine the contract inline, which is the exact failure mode the primitive exists to prevent. Composability is structural, not ergonomic.

**Independent Test**: A test-only schema constructed by extending the exported primitive with an additional `content: z.string()` field:
- parses `{ target_mode: "specific", vault: "V", file: "F", content: "Hello" }` successfully;
- rejects `{ target_mode: "active", vault: "V", content: "Hello" }` (the active-mode forbidden-key rule survives extension);
- rejects `{ target_mode: "specific", vault: "V", file: "F" }` (the extension's `content: string` requirement is enforced);
- when fed to `zod-to-json-schema`, returns a JSON Schema document without throwing.

**Acceptance Scenarios**:

1. **Given** a test-only extended schema that adds `content: string` to both branches of the primitive via its documented composition operator, **When** the caller parses `{ target_mode: "specific", vault: "V", file: "F", content: "Hello" }`, **Then** parsing succeeds and the returned value contains `content: "Hello"` alongside the validated target-mode fields.
2. **Given** the same extended schema, **When** the caller parses `{ target_mode: "active", vault: "V", content: "Hello" }`, **Then** parsing fails — the active-mode forbidden-key rule for `vault` survives composition unchanged.
3. **Given** the same extended schema, **When** the caller parses `{ target_mode: "specific", vault: "V", file: "F" }` (missing the extension's `content`), **Then** parsing fails with a zod issue whose `path` includes `"content"`.
4. **Given** the same extended schema, **When** it is passed to `zod-to-json-schema`, **Then** the call returns a valid JSON Schema document and does not throw. The resulting schema is in a shape suitable for direct use as an MCP tool's `inputSchema`.

---

### User Story 4 — TypeScript types are inferred from the schema; no parallel hand-written interface exists (Priority: P2)

The Constitution's Principle III requires that the zod schema be the single source of truth for the surface's typed shape: `z.infer<typeof schema>` is the canonical TypeScript type, and any hand-written `interface` or `type` that redefines the same shape is a constitution violation. This feature must export the inferred types alongside the schema so consumers have a typed handle to the discriminated union without reaching into zod internals; consumers MUST NOT be tempted to redeclare the shape themselves.

**Why this priority**: P2 because the schema's runtime correctness (Stories 1–3) is the load-bearing property. Type inference is a developer-ergonomics property that, while constitutionally mandated, is verified at compile time by `tsc --noEmit` (per the Constitution's typecheck gate) rather than at runtime. Treating it as P3 would understate its constitutional weight; treating it as P1 would conflate it with the validation contract.

**Independent Test**: A TypeScript test file imports both the schema and its inferred type, declares a value typed as the inferred type, and asserts via the type system that the value's `target_mode` field narrows correctly between the two branches. Compilation under `tsc --strict` succeeds; a deliberately-invalid assignment (e.g., assigning an active-mode object that includes `vault` to a variable typed as the inferred type) fails compilation. No runtime assertion is needed — the typecheck gate is the test.

**Acceptance Scenarios**:

1. **Given** the exported schema and its exported `z.infer`-derived type, **When** a consumer declares a value as `{ target_mode: "specific", vault: "V", file: "F" }` typed against the inferred type, **Then** TypeScript accepts the assignment under `tsc --strict` and narrows the value's branch when the consumer discriminates on `target_mode`.
2. **Given** the same exported type, **When** a consumer declares `{ target_mode: "active" }` typed against it, **Then** TypeScript accepts the assignment and the inferred shape carries no `vault`, `file`, or `path` properties on the active branch.
3. **Given** the codebase, **When** a reviewer searches the module for hand-written `interface TargetMode…` or `type TargetMode…` definitions that redeclare the schema's shape (rather than `z.infer<typeof …>`), **Then** none are found — the only typed surface is `z.infer`-derived.

---

### Edge Cases

- **Extra unknown keys on the `"specific"` branch at the primitive level (no extension)**: e.g., `{ target_mode: "specific", vault: "V", file: "F", unrelated: "x" }`. MUST succeed. The primitive cannot reject unknown keys at the base level because it would forbid downstream extension. Downstream tool schemas that want to be strict against unknown keys MUST opt into that themselves.
- **Extra unknown keys on the `"active"` branch at the primitive level (no extension), provided they are NOT `vault`/`file`/`path`**: e.g., `{ target_mode: "active", lines: 5 }`. MUST succeed. Only the three target-locator keys are forbidden; other keys are permitted at the base level so downstream tools can extend.
- **`target_mode` field absent entirely** (`{ vault: "V", file: "F" }`): MUST fail. The discriminator is required; the zod error MUST identify `target_mode` as the missing required field.
- **`target_mode` field present with a non-string value** (e.g., `{ target_mode: 123 }`): MUST fail with a zod discriminator-value error identifying `target_mode` as the offending field.
- **`vault` whose value is `undefined`** (`{ target_mode: "specific", vault: undefined, file: "F" }`): semantically equivalent to absent — MUST fail with the same "vault required" error as the missing case (AC#5 of Story 1). Implementation note: zod's default behavior for required string fields rejects `undefined`.
- **`vault` whose value is whitespace-only** (`{ target_mode: "specific", vault: "   ", file: "F" }`): out of scope at the primitive level — the user input only specifies "non-empty" (string length > 0). If trimmed-empty rejection is desired downstream, the consuming tool schema adds the refinement. Reasonable default: the primitive accepts whitespace-only as long as it is non-empty.
- **`file` or `path` whose value is an empty string** (`{ target_mode: "specific", vault: "V", file: "" }`): out of scope at the primitive level — the user input does not specify a non-empty constraint on these locators. Reasonable default: the primitive accepts empty-string locators; downstream tools refine if needed. (See Assumptions.)
- **`active` mode with an explicit-`undefined` forbidden key** (`{ target_mode: "active", vault: undefined }`): MUST fail. The presence of the property — regardless of value — counts as "passing" the forbidden key per the user input's "Any attempt to pass vault, file, or path in 'active' mode MUST fail." This is a behavioral invariant the schema enforces, not a default-driven outcome.
- **Discriminator with a typo** (`{ target_mode: "Specific" }` — capital S): MUST fail with the discriminator-invalid error from AC#5 of Story 2. The discriminator values are case-sensitive literals.
- **Caller passes `null` for `target_mode`** (`{ target_mode: null }`): MUST fail with the discriminator-invalid error.
- **Empty input object** (`{}`): MUST fail with a zod issue identifying `target_mode` as the missing required discriminator.
- **Non-object input** (`"specific"`, `null`, `undefined`, `42`): MUST fail with a zod type error indicating an object was expected.
- **Composed schema that adds a field with the same name as a forbidden key** (e.g., a downstream tool schema that adds `vault: z.string()` to the active branch): outside the responsibility of the primitive. Such a composition would be self-contradictory and is the consuming tool's bug to avoid; the primitive does not police downstream extensions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A new module MUST be created with co-located tests per Constitution Principle II. The module name and exact path are a plan-stage decision; reasonable default per the per-surface module convention is `src/target-mode/target-mode.ts` with tests at `src/target-mode/target-mode.test.ts`. The module MUST export a single zod discriminated-union schema (the `target_mode` primitive) and the TypeScript types inferred from it via `z.infer<typeof …>`. Export names are a plan-stage decision; reviewers MUST be able to import both the schema and its types from a single module path.
- **FR-002**: The exported schema MUST be a zod discriminated union keyed on the field `target_mode` with exactly two branches: the literal value `"specific"` and the literal value `"active"`. The TypeScript type for `target_mode` MUST be a string literal union (`"specific" | "active"`), not a generic `string`, and MUST be inferred from the schema rather than hand-written.
- **FR-003**: The `"specific"` branch MUST require:
    - `vault: string` — required, non-empty (string length > 0). Missing, `undefined`, or empty-string values MUST produce a zod issue whose `path` includes `"vault"`.
    - Exactly one of `file: string` or `path: string` MUST be provided. Neither-provided AND both-provided MUST fail. The failure MUST be raised as a zod issue (via `.refine()`, `.superRefine()`, or equivalent) whose `message` mentions "exactly one of" (or substantively equivalent — the literal phrase is recommended for searchability).
- **FR-004**: The `"active"` branch MUST forbid the keys `vault`, `file`, and `path`. Any input that carries any of those three keys (regardless of value, including `undefined`) MUST fail with a zod issue whose `path` includes the offending key and whose `message` indicates the key is forbidden in active mode. The exact zod API used to enforce this (e.g., `.refine()`, `.superRefine()`, an explicit `vault: z.never().optional()` declaration, or equivalent) is a plan-stage decision; the behavioral contract above is what binds.
- **FR-005**: The primitive MUST permit downstream tool schemas to extend it with additional fields via zod's composition operators (`.and()`, `.merge()`, `.extend()`, or equivalent). Extra unknown keys at the base level MUST NOT cause parse failure — the schema is permissive at the base level so that composition works natively. (Strict-against-unknown-keys behavior, if desired, is the consuming tool's responsibility per Story 3 / Edge Cases.)
- **FR-006**: A composed schema produced by extending the primitive (per FR-005) MUST be passable to `zod-to-json-schema` (or the equivalent JSON Schema generator the project uses for MCP `inputSchema`) without throwing. The resulting JSON Schema document MUST be in a shape suitable for direct use as an MCP tool's `inputSchema`. The composed schema MUST also preserve every target-mode validation rule end-to-end (Story 3 AC#2).
- **FR-007**: The schema module MUST NOT add `.describe()` annotations to any field. Documentation of `target_mode`, `vault`, `file`, and `path` is the responsibility of the individual tool schemas that compose this primitive and the corresponding `docs/tools/*.md` files (per BI-030's progressive-disclosure design); the shared primitive stays annotation-free so the documentation responsibility is single-sourced and consistent across tools.
- **FR-008**: The module MUST NOT register itself as an MCP tool. It is consumed by typed tool modules that each have their own tool registration. The MCP server's `Server` registration list (in `src/server.ts`) MUST NOT change as a result of this feature.
- **FR-009**: The module MUST NOT invoke any CLI binary, perform any filesystem access, or call any network service. It is pure validation — `parse` / `safeParse` and the schema definition only. No imports of `child_process`, `node:fs`, `node:net`, or any project module that wraps those APIs are permitted.
- **FR-010**: TypeScript types exported by this module MUST be derived via `z.infer<typeof …>` from the schema. Hand-written `interface` or `type` declarations that redefine the shape of the schema (in this module or elsewhere in the codebase) are a constitution violation under Principle III. The exported type set MUST cover at least: the union type for the entire discriminated schema, and (recommended but plan-stage) the per-branch types for callers that want a narrowed handle. Exact export names are a plan-stage decision.
- **FR-011**: The schema module MUST carry an original-contribution header per Constitution Principle V, of the form `// Original — no upstream. <one-line description of the primitive's intent>.` The test module MUST also carry an original-contribution header.
- **FR-012**: Tests for the primitive MUST be co-located per Principle II. The test set MUST include — at minimum — one test per acceptance scenario from User Stories 1, 2, and 3 (15 scenarios total: 6 from Story 1, 5 from Story 2, 4 from Story 3). Story 4's typecheck assertions MAY be expressed as compile-time `expectTypeOf` assertions or by relying on `tsc --noEmit` — the choice is a plan-stage decision. Reviewers MAY consolidate adjacent assertions into single test functions as long as every scenario is exercised and assertion failures are individually attributable.
- **FR-013**: The vitest aggregate statements coverage threshold (the merge gate per Constitution v1.1.0 §Development Workflow #5) MUST remain at or above the floor in effect when this feature merges. The new tests MUST NOT cause coverage to drop below that floor.
- **FR-014**: The PR landing this feature MUST update the Constitution Compliance checklist with one Y/N/N/A per principle (per Constitution v1.1.0 §Development Workflow #8). All five principles are expected to evaluate as: Principle I (`Y` — single-purpose schema module), Principle II (`Y` — co-located tests covering happy + failure + boundary paths), Principle III (`Y` — zod is the single source of truth, types via `z.infer`), Principle IV (`N/A` — pure validation, no upstream system to error from), Principle V (`Y` — original-contribution header).

### Out of Scope

The following are explicitly excluded from this feature and remain the responsibility of separate BIs or downstream consumers:

- **MCP tool registration**: this primitive is internal and never appears on `src/server.ts`'s tool list. Each typed tool that consumes the primitive (`read_note`, `write_note`, etc.) is responsible for its own registration in its own BI.
- **CLI invocation, argv assembly, target-locator stripping, error classification**: those are the [CLI adapter's](../003-cli-adapter/spec.md) job. This module produces the validated `target_mode` value the adapter consumes; it does not consume the adapter.
- **`.describe()` annotations on fields**: documentation lives in the per-tool schemas and the `docs/tools/*.md` markdown files (BI-030). The shared primitive stays annotation-free per FR-007.
- **Vault-less "specific" mode** (e.g., "operate on the focused vault but a specific file"): not in the current design. If a future need surfaces, it lands as a separate BI with its own ADR amendment to ADR-003.
- **Strict-against-unknown-keys enforcement at the primitive level**: composition requires the base to be permissive. Tools that want to reject unknown keys do so in their own composed schema.
- **`vault`/`file`/`path` content validation beyond non-empty `vault`**: the primitive does NOT validate filesystem path syntax, vault-name character sets, file extensions, or path traversal patterns. Those constraints are either CLI-side (the CLI rejects malformed paths) or tool-specific (a tool that needs a markdown file refines `file` to end in `.md`).
- **Localised discriminator values**: `target_mode: "specific" | "active"` are English literals. Localisation, if ever desired, lands as a separate spec.
- **Refactoring `obsidian_exec` (the freeform escape-hatch tool from feature 001) to use this primitive**: `obsidian_exec` does not have a `target_mode` concept and is out of scope; it retains its current zod schema unchanged.
- **Modifying ADR-003**: this feature implements ADR-003; it does not change it. If the schema design surfaces a contradiction with the ADR, the resolution is a new ADR per the project's amendment procedure, not a silent override.

### Key Entities *(include if data involved)*

- **`target_mode` schema (the new primitive)**: a single zod discriminated union exported from a new module. Inputs are unknown JavaScript values (typically MCP tool call parameter records); outputs are typed-narrowed values on either the `"specific"` or `"active"` branch. Failures are structured zod errors with field-path-keyed issues. No CLI invocation, no filesystem access, no MCP registration.
- **`"specific"` branch**: the typed shape `{ target_mode: "specific", vault: string, file?: string, path?: string }` with the runtime invariant "exactly one of `file` or `path` is provided" enforced by refinement. `vault` is a non-empty string.
- **`"active"` branch**: the typed shape `{ target_mode: "active" }` with the runtime invariant "no `vault`, no `file`, no `path` keys are present" enforced by refinement.
- **Inferred TypeScript types**: `z.infer<typeof schema>` produces the discriminated union of the two branch shapes. This is the canonical type — no parallel hand-written interface exists.
- **Composed schemas (downstream)**: every typed tool BI (`read_note`, `write_note`, `append_note`, `search_vault`, `list_notes`, …) extends this primitive with its own additional fields. Composition is structural — the primitive does not know or care which tools extend it. The composed schema is what each tool registers as its MCP `inputSchema` after JSON-Schema conversion.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the 15 acceptance scenarios across User Stories 1–3 (six in Story 1, five in Story 2, four in Story 3) pass on first run after the schema is implemented — verifiable by `npm run test` (vitest). Each scenario asserts the documented success/failure outcome for the named input.
- **SC-002**: The `target_mode` discriminated-union contract is single-sourced — the codebase has exactly **one** module that defines the shape `{ target_mode: "specific", vault, file?, path? } | { target_mode: "active" }` and the associated invariants. Verifiable by code search: any other typed tool module that needs target-mode validation imports this primitive rather than defining its own. (As of this feature, no typed tools yet exist; the assertion becomes meaningfully testable as the typed-tool BIs land.)
- **SC-003**: The exported TypeScript types are derived from `z.infer<typeof …>` — verifiable by inspection of the module's exports. There exists exactly **zero** lines in this module that match `^interface (Specific|Active|TargetMode)` or `^type (Specific|Active|TargetMode)\s*=\s*\{` (i.e., no hand-written interface or type literal that redeclares the schema shape).
- **SC-004**: A test-only composed schema constructed in the test file by extending the primitive with a `content: z.string()` field (a) parses a well-formed `{ target_mode: "specific", vault, file, content }` input successfully, (b) rejects an active-mode input that includes `vault`, (c) rejects a specific-mode input that omits `content`, and (d) survives `zod-to-json-schema` conversion without throwing. Each property is asserted by a distinct test case (Story 3 AC#1–4).
- **SC-005**: The aggregate vitest statements coverage threshold remains at or above the merge-gate floor in effect when this feature lands — verifiable by the `npm run test:coverage` (or equivalent) gate that the Development Workflow §5 mandates.
- **SC-006**: A typed-tool BI authored after this feature lands can declare its tool-specific schema in materially fewer lines than it would have been without the primitive — empirically validated by the first typed-tool BI (e.g., `read_note`) that lands on top of this one. The expected ceiling for the schema module of such a tool is ≲20 lines of zod composition + one or two `.describe()` annotations on the tool-specific fields.
- **SC-007**: The schema module's source file contains zero `.describe()` calls — verifiable by grep on the source. The annotation-free policy is mechanical to verify.
- **SC-008**: The schema module's source file imports nothing from `child_process`, `node:fs`, `node:net`, `node:http`, `node:https`, the project's `src/cli-adapter/`, the project's `src/tools/`, or the project's `src/logger.ts` — verifiable by grep on the import statements. The module's purity (FR-009) is mechanical to verify.

## Assumptions

- **The target-mode contract is exactly the one described in [ADR-003](../../.decisions/ADR-003%20-%20Enforce%20Target%20Mode%20in%20Typed%20Tools.md)**: two branches `"specific"` and `"active"`; specific requires vault and exactly one of file/path; active forbids all three locator keys. Any divergence between this spec and ADR-003 is a bug in this spec to be reconciled by amending the spec, not by silently shipping different behavior.
- **The schema is the single source of truth per Constitution Principle III**: the inferred TypeScript types are derived from the schema via `z.infer<typeof …>`, and any hand-written `interface` or `type` redefining the same shape (in this module or any consumer module) is a constitution violation. This binds every typed-tool BI that consumes the primitive.
- **`vault` non-emptiness is the only string-content constraint at the primitive level**: the user input specifies "string, non-empty" for vault and is silent on file/path content beyond their type being string. Reasonable default: `file` and `path` are typed as `z.string()` with no length floor at the primitive level. Downstream tool schemas that need a non-empty file/path apply their own refinement.
- **Whitespace-only strings count as "non-empty"** for the vault-required rule: the user input says "non-empty" without specifying trimming. Reasonable default: zod's default `z.string().min(1)` (string length > 0) is the operational interpretation. If trimmed-empty rejection is desired, downstream tools add the refinement.
- **The "exactly one of file or path" rule is enforced by zod refinement**: the user input says "enforced via a zod refinement." Reasonable default: `.refine()` (or `.superRefine()` for finer issue-path control) on the `"specific"` branch object schema. Plan-stage chooses the exact API.
- **The "vault/file/path forbidden in active mode" rule is enforced by zod refinement OR by an explicit `.never().optional()` declaration on each forbidden key**: the user input says the schema "MUST fail zod validation with a clear message" for these cases. Reasonable default: whichever approach produces the clearest error message and survives composition cleanly is chosen at plan stage. The behavioral contract (FR-004) binds; the implementation tactic does not.
- **The schema is permissive against unknown extra keys at the base level (FR-005)**: this is required for composition to work. Tools that want strict-against-unknown-keys behavior compose their own `.strict()` (or equivalent) on top.
- **An explicit-`undefined` forbidden key in active mode counts as "passing" the key**: e.g., `{ target_mode: "active", vault: undefined }` MUST fail (per Edge Cases). The user input's "Any attempt to pass vault, file, or path in 'active' mode MUST fail" is interpreted strictly: presence of the property in the object, regardless of value, is a violation. Implementation note: zod's default object-schema behavior treats explicit `undefined` distinctly from missing in some configurations; the chosen API (`.never()`, `.refine()` checking `Object.hasOwn`, etc.) MUST handle this case.
- **`zod-to-json-schema` is the JSON Schema generator the project uses** for MCP `inputSchema` registration, per the Constitution's MCP and Validation rules. If a different generator is adopted in the future, FR-006's compatibility requirement re-targets to that generator.
- **The module path `src/target-mode/target-mode.ts` is a reasonable default** per the per-surface module-layout convention (Constitution Principle I, plus the `{schema, command, handler}.ts` precedent); plan-stage may relocate to e.g. `src/schemas/target-mode.ts` if the project decides to consolidate shared schema primitives under a `schemas/` directory. Either choice is constitutional; the plan picks one and documents it.
- **Constitution Principle II binds the test set's co-location** at the chosen module's `*.test.ts` sibling. The test cases in FR-012 are the minimum set; reviewers may add more.
- **Constitution Principle V binds the module-header convention**: `// Original — no upstream. <one-line description>.` is required on both the schema source file and its test file.
- **Constitution Principle III binds the no-hand-written-types rule**: `z.infer<typeof …>` is the only legitimate way to declare types over this schema in this module or any consumer module.
- **The first typed-tool BI that lands on top of this primitive (e.g., `read_note`)** is the empirical validator of the composability story. If that BI surfaces a real-world need not anticipated here, it gets added to a future revision of this spec rather than retrofitted silently.
