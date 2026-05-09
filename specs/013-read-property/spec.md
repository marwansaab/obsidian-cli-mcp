# Feature Specification: Read Property — Typed Surgical Frontmatter Read

**Feature Branch**: `013-read-property`
**Created**: 2026-05-08
**Status**: Draft
**Input**: User description: "Add Read Property — A typed MCP tool that reads a single frontmatter property from a vault note, with the value's native YAML type preserved."

## Clarifications

### Session 2026-05-09

- Q: How should the wrapper distinguish a frontmatter property that is *absent* from one that is *present with an explicit YAML null value*, given both shapes carry `value: null`? → A: Trust Obsidian's resolution — the `type` label is the discriminator (absent surfaces `type: "unknown"`; explicit-null surfaces whichever typed label Obsidian's property-type system has on file for the key). Expand the live-CLI characterisation pass (FR-024) with a 14th case that locks observed labels for both shapes. If the characterisation pass reveals Obsidian conflates the two at a single `{value: null, type: "unknown"}` shape, this contract is amended at planning time before ship.
- Q: What does `read_property` return when the property's value is a YAML mapping (a nested object) — a shape Obsidian's property-type system does not natively resolve to any of the six type labels? → A: Extend US4's unresolvable-shape principle uniformly. Mappings (and any other shape outside the six native types) return `{value: <raw structural value>, type: "unknown"}`; the wrapper passes the value through without flattening or coercing, never throws. The zod output schema's `value` admits an object branch in addition to string / number / boolean / array / null. Add a new FR-027 codifying the rule, a new Edge Cases bullet (CONTENT — mapping values), and a 15th case to the FR-024 characterisation roster.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Specific-mode surgical read returns native-typed value (Priority: P1)

An agent needs the value of a single named frontmatter property (for example `status`, `vault_id`, `updated`, `tags`) from a known note in a known vault. The agent calls `read_property` with `target_mode: "specific"`, the vault display name, exactly one locator (`file` or `path`), and the property `name`. The tool returns the property's value with its native YAML type preserved — text as a string, list as an array of element values, number as a number, boolean as a boolean, date and datetime as their respective string forms — together with the property's resolved `type` label.

**Why this priority**: This is the dominant use case. Reading a single frontmatter field is one of the most common state-checking operations agents perform as a precondition to deciding what to do next. Today the only path is a full-file read plus client-side YAML parsing, which is wasteful in tokens (the agent only wanted one field) and brittle (frontmatter parsing edge cases). Without specific-mode support, the typed surface offers no advantage over the existing read path; this story alone justifies the feature.

**Independent Test**: Construct a note in a real vault with a frontmatter block containing one property of each YAML type (text, list, number, boolean, date, datetime). Call `read_property` once per property. Assert each call returns the value with the expected native type and the expected `type` label. The story is fully testable in isolation; nothing in P2/P3 is required for it to deliver value.

**Acceptance Scenarios**:

1. **Given** a note in vault `Demo` at `notes/x.md` with frontmatter `status: in-progress`, **When** the agent calls `read_property({ target_mode: "specific", vault: "Demo", path: "notes/x.md", name: "status" })`, **Then** the response is `{ value: "in-progress", type: "text" }`.
2. **Given** a note with frontmatter `tags: [alpha, beta]`, **When** the agent reads `name: "tags"`, **Then** the response is `{ value: ["alpha", "beta"], type: "list" }` — an array, not a joined string.
3. **Given** a note with frontmatter `count: 7`, **When** the agent reads `name: "count"`, **Then** the response is `{ value: 7, type: "number" }` — a number, not the string `"7"`.
4. **Given** a note with frontmatter `archived: true`, **When** the agent reads `name: "archived"`, **Then** the response is `{ value: true, type: "checkbox" }`.
5. **Given** a note with frontmatter `due: 2026-12-31`, **When** the agent reads `name: "due"`, **Then** the response is `{ value: "2026-12-31", type: "date" }`.
6. **Given** a note with frontmatter `updated: 2026-05-08T14:30:00`, **When** the agent reads `name: "updated"`, **Then** the response is `{ value: "2026-05-08T14:30:00", type: "datetime" }`.
7. **Given** a note that does NOT define the property `missing_field`, **When** the agent reads `name: "missing_field"`, **Then** the response is `{ value: null, type: "unknown" }` — no error.
8. **Given** a note with NO frontmatter block at all, **When** the agent reads any property, **Then** the response is `{ value: null, type: "unknown" }` — no error (behaves identically to a missing property).
9. **Given** a note whose frontmatter block is malformed (for example missing the closing `---` fence), **When** the agent reads any property, **Then** the call fails with a structured error.
10. **Given** a locator (`file` or `path`) that resolves to no file in the named vault, **When** the agent calls `read_property`, **Then** the call fails with a structured error.
11. **Given** a vault display name that does not match any registered Obsidian vault, **When** the agent calls `read_property`, **Then** the call fails with a structured error (the same reclassified-CLI-response shape that the existing typed tools already use for unknown vaults).

---

### User Story 2 — Active-mode read against the focused note (Priority: P1)

An agent operating in a session where Obsidian's editor has a specific note focused needs to read a frontmatter property from whichever note is currently focused, without naming a vault or locator. The agent calls `read_property` with `target_mode: "active"` and just the property `name`. The tool reads the focused note and returns the property's typed value, identical in shape to the specific-mode response.

**Why this priority**: Active mode is the standard target-mode discriminator across every typed tool in the project (`read_note`, `write_note`, `delete_note`). Omitting it would create an inconsistency in the typed surface and force agents to fall back to a different tool when the user is mid-editor. Pairs equally with US1 — together they cover the full target-mode discriminator contract.

**Independent Test**: Run Obsidian with a known note focused. Call `read_property({ target_mode: "active", name: <known property> })`. Assert the response carries the value of that property from the focused note. Independently testable from US1 because no specific-mode locator is exercised.

**Acceptance Scenarios**:

1. **Given** Obsidian has note `notes/x.md` focused in vault `Demo` with frontmatter `status: review`, **When** the agent calls `read_property({ target_mode: "active", name: "status" })`, **Then** the response is `{ value: "review", type: "text" }`.
2. **Given** active mode and a focused note that does NOT define the requested property, **When** the agent calls `read_property`, **Then** the response is `{ value: null, type: "unknown" }` — no error (parity with US1 scenario 7).
3. **Given** active mode and no note is focused (or no Obsidian instance is running), **When** the agent calls `read_property`, **Then** the call fails with a structured error.

---

### User Story 3 — Validation rejects malformed inputs before the CLI is invoked (Priority: P1)

An agent (or a misbehaving caller) submits an input shape that violates the tool's contract. The tool MUST reject the call at the validation boundary, before any underlying CLI invocation occurs, and MUST surface a structured validation error that names the offending field.

**Why this priority**: Validation is the safety contract for every typed tool in this project, and it is a constitutional requirement (zod-as-source-of-truth). Without it, malformed callers reach the CLI and produce undefined or harmful behaviour. Independently testable because every validation case can be exercised with a mock/spy on the CLI dispatcher to assert the dispatcher was never called.

**Independent Test**: For each invalid input shape, call `read_property` with a CLI dispatcher spy. Assert the call rejects with a structured validation error AND that the dispatcher was never invoked. No real CLI or vault required.

**Acceptance Scenarios**:

1. **Given** `target_mode: "specific"` with NO `file` and NO `path`, **When** the agent calls `read_property`, **Then** the call fails validation; no CLI call is made.
2. **Given** `target_mode: "specific"` with BOTH `file` and `path` set, **When** the agent calls `read_property`, **Then** the call fails validation; no CLI call is made.
3. **Given** `target_mode: "specific"` with no `vault`, **When** the agent calls `read_property`, **Then** the call fails validation; no CLI call is made.
4. **Given** `name` is the empty string `""`, **When** the agent calls `read_property`, **Then** the call fails validation; no CLI call is made.
5. **Given** `name` is omitted entirely, **When** the agent calls `read_property`, **Then** the call fails validation; no CLI call is made.
6. **Given** `target_mode: "active"` with `vault` set, **When** the agent calls `read_property`, **Then** the call fails validation; no CLI call is made.
7. **Given** `target_mode: "active"` with `file` set, **When** the agent calls `read_property`, **Then** the call fails validation; no CLI call is made.
8. **Given** `target_mode: "active"` with `path` set, **When** the agent calls `read_property`, **Then** the call fails validation; no CLI call is made.
9. **Given** any input with an unknown top-level key (for example `{ target_mode: "active", name: "x", foo: "bar" }`), **When** the call is forwarded by an MCP client that does NOT strip unknown keys, **Then** the server-side validation fails; no CLI call is made.

---

### User Story 4 — Heterogeneous-list fallback (Priority: P3)

An agent reads a list property whose elements have mixed YAML types (some numbers, some strings) — a shape Obsidian's property-type system cannot resolve. The tool MUST return the list's raw value rather than failing, and MUST label the response `type: "unknown"` so the agent knows the type system did not commit to an interpretation.

**Why this priority**: This is an explicit P3 in the user input. The shape is uncommon in well-curated vaults and not worth gating ship on, but it must not crash the typed surface. Independently testable because it requires only one fixture file with one mixed-type list property.

**Independent Test**: Author a fixture note with `mixed: [1, "two", 3]`. Call `read_property({ target_mode: "specific", vault: "Demo", path: "notes/x.md", name: "mixed" })`. Assert the response is `{ value: [1, "two", 3], type: "unknown" }` and the call did NOT throw.

**Acceptance Scenarios**:

1. **Given** a frontmatter list with elements of mixed YAML types, **When** the agent reads it, **Then** the response carries the heterogeneous array as `value` and `type: "unknown"` — no failure.

---

### User Story 5 — Documentation surface for the typed tool (Priority: P2)

An operator or agent inspects the project's progressive-disclosure help facility to understand how `read_property` works. The current placeholder stub for `read_property` (or the absence of any entry) MUST be replaced with full documentation that covers the per-field input contract, the output shape, the failure-mode roster, and at least four worked examples — one per non-trivial YAML type the tool handles.

**Why this priority**: The help facility is the primary discovery surface for tool consumers (P2-001 of the typed-tool surface contract, mirrored from `read_note`/`write_note`/`delete_note`). The tool is callable without docs but un-discoverable without them. Should-pass for ship; not required for the read code path itself to function. Independently testable by loading the help facility output and asserting structural completeness.

**Independent Test**: Invoke the help facility for `read_property`. Assert the doc carries: input contract per field, output shape, failure-mode roster, and at least four worked examples covering distinct YAML types. The registry-consistency test from `005-help-tool` already auto-asserts the file's existence once the tool is registered; this story expands that assertion to content completeness.

**Acceptance Scenarios**:

1. **Given** the help facility, **When** an operator queries `read_property`, **Then** the response carries the full per-field input contract, the output shape, the failure-mode roster, and at least four worked examples covering at least four distinct YAML types from {text, list, number, checkbox, date, datetime}.

---

### Edge Cases

The implementation MUST handle, document, or explicitly defer each of the following observable shapes.

**CONCURRENCY**

- The frontmatter may be edited (or the file may be deleted) between the validation step and the read. The read returns whatever is on disk at execution time. The contract is a point-in-time read with no transactional guarantee. Documented as a known limitation.

**CONTENT — null disambiguation**

- A property whose value is the literal YAML string `"null"` MUST return `{ value: "null", type: "text" }` — i.e., the string `"null"` is preserved as a four-character string.
- A property that is present but explicitly empty (YAML null — `key:` with no value) MUST return `{ value: null, type: <whatever Obsidian's property-type system resolves> }`. The caller distinguishes this case from the absent case via the `type` label: an absent property surfaces `type: "unknown"`, an explicit-null property surfaces whichever typed label Obsidian's property-type system has on file for that key. The contract is contingent on the live-CLI characterisation pass (FR-024) confirming the two labels actually differ on the target Obsidian version; if the pass reveals conflation at a single `{value: null, type: "unknown"}` shape, this contract is amended at planning time before ship.
- A property that is absent from the file MUST return `{ value: null, type: "unknown" }`.

**CONTENT — exotic property names**

- A property name that collides with a YAML reserved word, or contains characters such as dots (`.`), dashes (`-`), or other punctuation, MUST be passed through to the underlying CLI verbatim. The wrapper does NOT sanitise, escape, or rewrite the name; whatever the CLI / YAML parser produces is what the wrapper returns.

**CONTENT — heterogeneous lists**

- A list property whose elements are of mixed YAML types MUST return the heterogeneous array as `value` with `type: "unknown"` (US4). The wrapper does NOT silently coerce or filter elements.

**CONTENT — mapping values**

- A property whose value is a YAML mapping (a nested object, for example `metadata: {author: x, source: y}`) MUST return the structural value as `value` with `type: "unknown"`. The wrapper does NOT throw, flatten, or coerce. This extends US4's unresolvable-shape principle uniformly: any value Obsidian's property-type system cannot resolve to one of the six native types surfaces as `{value: <raw structural value>, type: "unknown"}`. The zod output schema's `value` admits an object branch alongside string, number, boolean, array, and null. Codified by FR-027.

**CONTENT — YAML syntactic features (comments, anchors, aliases)**

- Frontmatter blocks may contain YAML comments, anchors (`&name`), or aliases (`*name`). These are syntactic features YAML supports but Obsidian's property system may flatten or reject. The wrapper reflects whatever Obsidian resolves; observed behaviour for each of the three syntactic features MUST be characterised during the live-CLI characterisation pass and documented in the feature's research artefact.

**CONTENT — no frontmatter block**

- A file with no frontmatter block at all MUST behave identically to a missing property: `{ value: null, type: "unknown" }`. No error.

**CONTENT — line endings**

- CRLF vs LF line endings in the on-disk file MUST NOT affect the parsed value. A note saved with Windows-style CRLF endings and a note saved with Unix-style LF endings, both with the same logical frontmatter content, MUST return identical `read_property` responses.

**UNDERLYING CLI — unknown vault**

- An unknown vault display name may produce a CLI response that the existing bridge classifier does not natively treat as an error (the same shape covered for `delete_note` / `write_note`'s 011-R5 inheritance). The implementation MUST handle this case explicitly: the response MUST be reclassified to a structured `CLI_REPORTED_ERROR`, not silently returned as a successful read.

**CLIENT-CLASS — unknown-key validation**

- The server-side validation behaviour for "unknown top-level keys" (US3 scenario 9) is directly observable only from MCP clients that forward unknown keys to the server. Strict-naive clients strip unknown keys client-side per the published JSON Schema's `additionalProperties: false`, in which case the server never sees the offending key and validation does not trigger. Both pathways MUST be documented; the test case MUST exercise the server-side path explicitly so the validation contract holds for the client class that does forward unknown keys.

**SECURITY — argv passing**

- The `name` field is caller-supplied and is passed through to the underlying CLI as a discrete argv parameter, not interpolated into a shell command, an `eval` call, or any other text-based execution surface. Argv-array passing prevents shell-metacharacter and command-injection attacks structurally; no per-field sanitisation of `name` is required for that threat model.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose a typed MCP tool named `read_property` that returns a single named frontmatter property from a vault note.
- **FR-002**: The tool MUST accept a `target_mode` discriminator with the values `"specific"` and `"active"`, mirroring the discriminator contract used by every other typed tool in the project.
- **FR-003**: In `target_mode: "specific"`, the tool MUST require a `vault` display name AND exactly one locator field — either `file` (wikilink form, no extension, no folder) or `path` (vault-relative path including the `.md` extension), never both, never neither.
- **FR-004**: In `target_mode: "active"`, the tool MUST forbid the keys `vault`, `file`, and `path`. Presence of any of those keys in active mode MUST produce a validation failure.
- **FR-005**: The tool MUST require a `name` field (a non-empty string) in both modes. The empty string and the absence of `name` MUST both produce validation failures.
- **FR-006**: The tool's input schema MUST forbid unknown top-level keys (`additionalProperties: false`).
- **FR-007**: The tool MUST return an output object with two fields: `value` (the property's value, native-typed) and `type` (one of `"text" | "list" | "number" | "checkbox" | "date" | "datetime" | "unknown"`).
- **FR-008**: The tool MUST preserve YAML native types in `value`: text as a string, list as a JSON array of element values, number as a number, boolean as a boolean, date and datetime as their respective string forms. Values whose YAML shape falls outside this enumeration (most notably YAML mappings) follow the unresolvable-shape fallback per FR-017 and FR-027: structural pass-through with `type: "unknown"`.
- **FR-009**: The tool MUST distinguish the literal YAML string `"null"` from an actual YAML null. The string `"null"` MUST round-trip as `{ value: "null", type: "text" }`. An explicitly null-valued property MUST return `value: null` with whatever `type` Obsidian's property-type system resolves. The discriminator between the absent-property case (FR-010) and the explicit-null case is the `type` label: absent surfaces `type: "unknown"`; explicit-null surfaces whichever typed label Obsidian's property-type system has on file for the key. The contract is contingent on the live-CLI characterisation pass (FR-024) confirming the labels differ; if the pass shows conflation, this requirement is amended at planning time before ship.
- **FR-010**: The tool MUST return `{ value: null, type: "unknown" }` (no error) when the requested property is absent from the file's frontmatter.
- **FR-011**: The tool MUST return `{ value: null, type: "unknown" }` (no error) when the file has no frontmatter block at all.
- **FR-012**: The tool MUST surface a structured error when the file's frontmatter block is malformed (e.g., missing closing fence). The wrapper MUST NOT silently coerce a malformed frontmatter to a successful read.
- **FR-013**: The tool MUST surface a structured error when the locator resolves to no file in the named vault.
- **FR-014**: The tool MUST surface a structured error when the named vault does not match any registered Obsidian vault. If the underlying CLI returns a non-error-shaped response for unknown vaults, the implementation MUST reclassify that response to `CLI_REPORTED_ERROR` before returning to the caller.
- **FR-015**: The tool MUST surface a structured error in `target_mode: "active"` when no note is focused (or no Obsidian instance is reachable).
- **FR-016**: All validation failures MUST occur strictly before any underlying CLI invocation. Tests MUST be able to assert a CLI dispatcher spy was never called for invalid inputs.
- **FR-017**: A list property whose elements have mixed YAML types MUST return the heterogeneous array as `value` with `type: "unknown"`. The wrapper MUST NOT throw, filter elements, or coerce them.
- **FR-018**: The `name` field MUST be passed through to the underlying CLI verbatim, with no wrapper-side sanitisation, escaping, or rewriting. Names containing dots, dashes, or YAML reserved words are the CLI / YAML parser's responsibility.
- **FR-019**: The `name` field MUST be passed to the underlying CLI as a discrete argv parameter, not interpolated into any shell-evaluated string. The argv-passing contract is the structural anti-injection guarantee.
- **FR-020**: CRLF and LF line endings in the on-disk file MUST NOT change the parsed value. A note's response MUST be byte-identical regardless of which line-ending convention the file was saved with.
- **FR-021**: Errors MUST flow through the project's existing structured error codes — no new error codes MUST be introduced by this feature. Validation failures MUST surface as `VALIDATION_ERROR`; CLI failures MUST surface through the existing four CLI-failure codes.
- **FR-022**: The tool MUST be registered through the project's existing typed-tool registration factory. The progressive-disclosure help facility's documentation file for `read_property` MUST be authored with the per-field input contract, the output shape, the failure-mode roster, and at least four worked examples covering at least four distinct YAML types.
- **FR-023**: Each acceptance criterion across US1–US5 (and the heterogeneous-list scenario in US4) MUST be locked by at least one regression test that survives subsequent re-runs unchanged. The test count MUST be sufficient to cover schema validation, handler behaviour, and registration consistency.
- **FR-024**: The feature MUST run a live-CLI characterisation pass before ship that documents observable CLI behaviour for: each of the six native YAML types; missing property; missing frontmatter block; malformed frontmatter; unresolved locator; unknown vault; YAML comments inside frontmatter; YAML anchors inside frontmatter; YAML aliases inside frontmatter; CRLF-vs-LF round-tripping; an explicit YAML null property (`key:` with no value) — the resolved `type` label for the explicit-null case is the absent-vs-explicit-null discriminator per the CONTENT — null disambiguation contract and FR-009; and a YAML mapping value (e.g. `metadata: {a: 1, b: 2}`) — the resolved shape locks whether mappings flatten, reject, or pass through unchanged per the CONTENT — mapping values contract and FR-027. Findings MUST be persisted in the feature's research artefact.
- **FR-025**: The feature MUST NOT change the public surface of any existing typed tool (`read_note`, `write_note`, `delete_note`, `obsidian_exec`, the help tool). The only permitted edit to existing source is the addition of `read_property` to the registration list.
- **FR-026**: All new source files introduced by this feature MUST carry the project's "Original — no upstream." attribution header per the project Constitution's originality principle.
- **FR-027**: A property whose value is a YAML mapping (a nested object) MUST return the structural value as `value` with `type: "unknown"`. The wrapper MUST NOT throw, flatten, or coerce. This extends FR-017's unresolvable-shape principle uniformly: any value Obsidian's property-type system cannot resolve to one of the six native types surfaces as `{value: <raw structural value>, type: "unknown"}`. The output `value` schema accordingly admits an object branch in addition to string, number, boolean, array, and null.

### Key Entities *(include if feature involves data)*

- **Frontmatter property**: A single named key in a note's YAML frontmatter block. Has a `name` (string) and a `value` whose YAML native type is one of: text (string), list (array), number (numeric), checkbox (boolean), date (date-shaped string), or datetime (datetime-shaped string). May be absent entirely (the "no such key" case) or present with a YAML-null value (the "key with no value" case); the two cases MUST be distinguishable.
- **Property type label**: A string drawn from the set `{ "text", "list", "number", "checkbox", "date", "datetime", "unknown" }` that names how Obsidian's property-type system resolved the property's value. `"unknown"` is the fallback for a missing property, a property with no resolvable type, a list with heterogeneous element types, or any other shape Obsidian's property-type system cannot resolve to one of the six native types — most notably YAML mappings (FR-027).
- **Locator (specific mode)**: An ordered triple of (vault display name, choice of `file`-vs-`path`, locator value). The `file` form names a note by its wikilink (no extension, no folder); the `path` form names a note by its vault-relative path including the `.md` extension. Exactly one of `file` or `path` MUST be provided.
- **Focused-note reference (active mode)**: An implicit reference to whichever note Obsidian's editor currently has focused. Resolved by the underlying CLI at execution time; not addressable by the caller through any input field.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Reading a text frontmatter property returns the string value with `type: "text"` in 100% of test runs across the live-CLI characterisation fixture.
- **SC-002**: Reading a list frontmatter property returns an array of element values (not a joined string) with `type: "list"` in 100% of test runs.
- **SC-003**: Reading a number frontmatter property returns a numeric value (not the string form) with `type: "number"` in 100% of test runs.
- **SC-004**: Reading a boolean frontmatter property returns the boolean value with `type: "checkbox"` in 100% of test runs.
- **SC-005**: Reading a date or datetime frontmatter property returns the date-shaped or datetime-shaped string with the corresponding `type` label (`"date"` or `"datetime"`) in 100% of test runs.
- **SC-006**: Reading an absent property — or any property on a file with no frontmatter block — returns `{ value: null, type: "unknown" }` with no error in 100% of test runs.
- **SC-007**: A YAML-null property is observable as `value: null` AND distinguishable from the literal YAML string `"null"` (which returns `value: "null", type: "text"`) in 100% of test runs.
- **SC-008**: Every invalid input shape rejected at the validation boundary (US3 scenarios 1–9) produces a structured error AND zero underlying CLI invocations across 100% of test runs.
- **SC-009**: Every byte of the public output of the existing typed tools (`read_note`, `write_note`, `delete_note`, `obsidian_exec`, the help tool) is unchanged by this feature, except for the help facility growing one new `read_property` entry.
- **SC-010**: The published documentation for `read_property` covers the full per-field input contract, output shape, failure-mode roster, and at least four worked examples covering at least four distinct YAML types.
- **SC-011**: Every acceptance criterion across US1–US5 is locked by at least one regression test, totalling no fewer than 25 tests across schema, handler, and registration suites.
- **SC-012**: Zero new error codes are introduced by this feature; every failure flows through existing structured error codes.
- **SC-013**: The live-CLI characterisation pass documents observable behaviour for all 15 cases enumerated in FR-024 (including the explicit YAML null and YAML mapping cases added by the 2026-05-09 clarification), persisted in the feature's research artefact and surfaceable from the published documentation.
- **SC-014**: An agent reading a single named frontmatter property can do so in a single tool call returning ≤ ~200 characters of structured response on the success path, replacing what previously required a full-file read plus client-side YAML parsing. Token saving relative to a full-file read is observable from any tracing layer that records request/response payload sizes.
- **SC-015**: The `name` input cannot reach a shell-evaluated context. The argv-passing contract is structurally enforced by the underlying CLI invocation surface, and is verifiable by inspection of the dispatcher call shape (no shell, no eval, no string interpolation).

## Assumptions

- The user input is exhaustive for ship-gating decisions: no clarifications session is required (`/speckit-clarify` is not needed). The 18 acceptance criteria across [P1] / [P2] / [P3], the six adversarial categories (CONCURRENCY, CONTENT, UNDERLYING CLI, CLIENT-CLASS, SECURITY), and the explicit out-of-scope list together define a complete spec surface.
- The underlying Obsidian CLI exposes a subcommand whose output supplies enough structure for a typed wrapper to recover the property's value and Obsidian's resolved property-type label without re-parsing YAML in the wrapper. The exact subcommand name and argv shape are an implementation concern resolved during the planning phase against `obsidian help`.
- The bridge classifier's existing inheritance for unknown-vault response inspection (introduced in feature 011 and inherited unchanged by feature 012) is applicable to this feature's CLI subcommand. If the underlying response shape differs, the feature's planning phase will surface that as a delta and the unknown-vault classification will be addressed there.
- The post-010 flat-extension idiom for `target_mode` schemas (single `z.object().strict().superRefine(...)` plus `applyTargetModeRefinement`) and the post-011 module-layout convention (`index.ts` factory + co-located tests) are the conventions this feature consumes. No precedent feature's spec or plan is amended.
- The release impact is purely additive: no existing tool's public surface changes; no error codes are added; no ADRs are amended. The version bump policy (patch — `0.2.5 → 0.2.6`) is a planning-phase decision but the additive shape is a constraint set by this spec.
- Out of scope for this feature, recorded here so the planning phase does not silently absorb them: reading multiple properties in one call (callers iterate today); returning the full frontmatter object (`obsidian_exec` is the escape hatch); writing properties (separate future feature `write_property`); defining or amending Obsidian's property-type-inference rules (Obsidian's responsibility, not the wrapper's).
