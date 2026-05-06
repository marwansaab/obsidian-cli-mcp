# Feature Specification: Fix `tools/list` Schema Validation

**Feature Branch**: `007-fix-list-tools-schema`
**Created**: 2026-05-06
**Status**: Draft
**Input**: User description: "the last version is not loading properly - when I call List Tools, I get the following error: `[{ code: 'invalid_value', values: ['object'], path: ['tools', 2, 'inputSchema', 'type'], message: 'Invalid input' }]`"

## Clarifications

### Session 2026-05-06

- Q: How faithfully must the published `inputSchema` mirror the runtime validator's rules? → A: Option A — descriptor is a top-level object schema that exposes the two-branch shape (e.g. via `oneOf`/`anyOf` nested inside the top-level object) so clients see both invocation shapes, but does NOT need to encode the XOR-between-`file`-and-`path` rule or the forbidden-keys-in-active rule. The runtime validator remains the single source of truth for cross-field constraints.

## Background *(non-normative — context only)*

The published `obsidian-cli-mcp@0.1.6` package, which introduced the `read_note` typed tool (BI-003 / feature 006), does not load in MCP clients. When the client invokes the standard MCP `tools/list` request, the response fails validation against the protocol's `Tool` definition with the error quoted above.

The error path `tools[2].inputSchema.type` identifies the third registered tool — `read_note` — and reports that the field expected the literal `"object"` but received something else (or nothing). All other tools (`help` at index 0, `obsidian_exec` at index 1) load successfully. Because MCP clients refuse the entire `tools/list` response when any single tool fails validation, the regression makes the whole server unusable, not just the offending tool.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Server is loadable by any compliant MCP client (Priority: P1)

A user installs `obsidian-cli-mcp` (any version released after this fix) and configures it as an MCP server in their client of choice (Claude Desktop, Claude Code, MCP Inspector, or any other compliant client). The client establishes the connection, calls `tools/list`, and receives a well-formed response that lists every registered tool with a valid input schema. The user can then discover, inspect, and call any of those tools.

**Why this priority**: This is the core regression to fix. Until it lands, the published package is functionally inert — every downstream feature (existing or planned) is gated on the server being loadable at all. There is no graceful degradation: the failure is total.

**Independent Test**: With the server running, point any compliant MCP client at it and invoke `tools/list`. The response must validate against the MCP `Tool` schema with zero errors, and every advertised tool must be subsequently callable.

**Acceptance Scenarios**:

1. **Given** a fresh install of the fixed package, **When** the client connects and issues `tools/list`, **Then** the response validates without errors and contains all currently registered tools (today: `help`, `obsidian_exec`, `read_note`).
2. **Given** the client has loaded the tool list, **When** it inspects the entry for `read_note` (or any other tool), **Then** the entry's `inputSchema` declares `"type": "object"` at the top level and is itself a valid JSON Schema object schema.
3. **Given** the client has loaded the tool list, **When** the user invokes any listed tool with valid arguments, **Then** the tool executes and returns its expected output (no regression in runtime behaviour vs. version 0.1.6 for `help` and `obsidian_exec`, and no regression vs. the intended 0.1.6 behaviour for `read_note`).

---

### User Story 2 — `read_note` accepts both invocation shapes after the fix (Priority: P1)

The runtime contract of `read_note` — exactly the contract specified in feature 006 — must remain intact: the tool accepts the **specific** target mode (vault + exactly one of `file` or `path`) and the **active** target mode (no locator), and rejects malformed inputs with the same validation errors as before. Whatever change is required to make the published schema acceptable to MCP clients must not silently weaken or strengthen that contract.

**Why this priority**: Equal priority with Story 1. A "fix" that loaded the server but accepted invalid `read_note` calls (or rejected previously-valid ones) would be a different regression. Story 1 ensures the server loads; Story 2 ensures the loaded tool still behaves correctly.

**Independent Test**: After the fix is applied, run the existing `read_note` test suite plus a small smoke check against a real Obsidian vault: one call in each branch (specific-with-file, specific-with-path, active), one call with both `file` and `path`, one call with neither, one call in active mode that includes a forbidden `vault` key. The first three must succeed; the last three must return `VALIDATION_ERROR` with messages equivalent to those produced by the pre-fix runtime validator.

**Acceptance Scenarios**:

1. **Given** the fixed package, **When** the client calls `read_note` with `{ target_mode: "specific", vault: "MyVault", file: "Note" }`, **Then** the call succeeds and returns the note's content.
2. **Given** the fixed package, **When** the client calls `read_note` with `{ target_mode: "active" }`, **Then** the call succeeds and returns the active note's content.
3. **Given** the fixed package, **When** the client calls `read_note` with both `file` and `path` in specific mode, **Then** the call returns `VALIDATION_ERROR` with the same XOR-violation message produced by the pre-fix validator.
4. **Given** the fixed package, **When** the client calls `read_note` in active mode with a forbidden `vault` field, **Then** the call returns `VALIDATION_ERROR` indicating `vault` is not allowed in active mode.

---

### User Story 3 — Future typed tools cannot reintroduce this regression (Priority: P2)

A guardrail prevents a future BI from re-publishing a tool whose `inputSchema` does not satisfy the MCP `Tool` definition. The next typed tool (e.g., BI-004 `read_heading`) and any tool added after it will be caught at build/test time before reaching a release tag — not at the moment a user installs the package.

**Why this priority**: Lower than P1 because the immediate regression is what blocks users today, but the regression slipped past the existing test suite once and will slip past again unless the contract becomes part of CI. A test that today only asserts "the three current tools are well-formed" should generalise so it picks up every future registered tool automatically (the same generalisation pattern feature 005's registry-consistency block already uses for docs).

**Independent Test**: Add a test that, for every tool returned by `tools/list` (or by the in-process tool registry that backs that response), asserts the descriptor is a structurally valid MCP `Tool` — minimally that `inputSchema` is an object with `"type": "object"` at the top level. Then artificially register a malformed tool and confirm the test fails before the fix is applied. Remove the artificial tool. Confirm the test passes after the fix.

**Acceptance Scenarios**:

1. **Given** the test suite is run on the fixed package, **When** the new descriptor-validation test executes, **Then** it iterates over every registered tool and asserts each tool's published descriptor passes MCP `Tool` validation.
2. **Given** a developer registers a hypothetical new tool whose published `inputSchema` lacks `"type": "object"` at the top level, **When** they run the test suite, **Then** the descriptor-validation test fails before the change can be merged or released.

---

### Edge Cases

- **Tools that legitimately want polymorphic input** (the underlying motivation for using `z.discriminatedUnion` in feature 004): the published descriptor must still expose a top-level `"type": "object"` envelope. The polymorphism is a runtime-validation concern; the published schema may describe the union of accepted shapes, but it must do so within an object schema.
- **Backwards compatibility for clients that loaded 0.1.6 anyway** (e.g., a permissive client that ignored the validation error): such clients must continue to be able to call `read_note` with the same argument shapes after the fix. The fix may not change the wire-level argument names, types, or the discriminator literal values.
- **Other tools that re-export or extend the target-mode primitive in the future**: any consumer reaching for `targetModeSchema` as its tool's top-level input schema must inherit the fix automatically, not have to re-apply it per tool.
- **Test suite that already passes on 0.1.6**: the existing `src/server.test.ts` registry-consistency block does not exercise the *protocol-level* shape of `inputSchema`, only that registered tools have docs. The new guardrail test (Story 3) is what catches the gap and must run as part of the same CI gate that produced the broken release.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The MCP server's `tools/list` response MUST validate without errors against the MCP `Tool` definition for every currently registered tool, including `read_note`.
- **FR-002**: Every registered tool's published `inputSchema` MUST declare `"type": "object"` at the top level. (This is the specific protocol constraint the broken `read_note` descriptor violates.)
- **FR-002a** *(per Clarifications 2026-05-06 Q1)*: For tools with discriminated-union input (today: `read_note`), the published `inputSchema` MUST expose the two-branch shape so clients can see both invocation forms — typically by nesting a `oneOf` / `anyOf` of branch schemas *inside* the top-level object schema. The published descriptor MUST NOT be required to encode cross-field constraints the runtime enforces (XOR between `file`/`path`, forbidden-keys-in-active). Those constraints remain enforced exclusively by the runtime validator (`VALIDATION_ERROR`), which is the single source of truth.
- **FR-003**: The `read_note` tool's runtime input validation MUST accept exactly the same argument shapes that feature 006 specified — `{ target_mode: "specific", vault, file XOR path }` and `{ target_mode: "active" }` — and reject the same malformed shapes with the same error semantics (`VALIDATION_ERROR` with XOR / forbidden-key messages).
- **FR-004**: The fix MUST preserve `targetModeSchema`'s public runtime API surface (its zod type, its `parse` behaviour, its inferred TypeScript type, and its current export points). Other consumers that already import it must not need to change to compile or pass tests.
- **FR-005**: The fix MUST NOT change the wire-level argument names, types, or discriminator literal values that `read_note` accepts. Clients that successfully called `read_note` against a permissive setup against 0.1.6 must continue to work without change.
- **FR-006**: A new automated test (the Story 3 guardrail) MUST iterate over every tool the server registers and assert that each tool's published descriptor is structurally valid per the MCP `Tool` definition — minimally that `inputSchema` is an object whose top-level `type` is `"object"`. The test MUST iterate dynamically over the registry rather than hard-coding tool names, so newly added tools are covered automatically.
- **FR-007**: The fix MUST be released as a new published version of the package (a patch increment over 0.1.6, since the regression is purely a bug fix), so users can resolve the breakage by upgrading.
- **FR-008**: The release MUST be reachable by users of every supported install path the project currently advertises (npm, the documented MCP server config snippet, etc.) — i.e., the fix is not gated on switching install methods.
- **FR-009**: The fix MUST NOT introduce any new error codes. The complete error roster for `read_note` (and for the server overall) is unchanged.

### Key Entities

- **Tool descriptor**: The object returned in the `tools` array of an MCP `tools/list` response. Has at minimum `name`, `description`, and `inputSchema` (a JSON Schema object). The `inputSchema.type` field is the locus of this regression.
- **Input schema (published)**: The JSON Schema rendered for an MCP client's consumption — what appears in the `tools/list` response. Distinct from the in-process zod validator used to parse incoming arguments at call time.
- **Input schema (runtime)**: The zod schema used at call time to parse and validate the arguments object. For `read_note` this is `targetModeSchema`. Its behaviour is what feature 006 specified and what FR-003 freezes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After the fix, the `tools/list` response from a freshly started server validates with **zero** errors against the MCP `Tool` definition. (Measured by: running the protocol-level descriptor-validation test added under FR-006 and observing zero failing assertions.)
- **SC-002**: After the fix, **100%** of currently registered tools are discoverable and callable by every MCP client that previously accepted only the pre-`read_note` server (i.e., before 0.1.6). (Measured by: a smoke test against at least two compliant MCP clients — e.g., the official MCP Inspector plus one other — confirming that all listed tools are loadable and that one representative call to each succeeds.)
- **SC-003**: The full pre-existing test suite continues to pass with **no regressions** introduced. (Measured by: comparing the test suite's pass/fail summary on the branch tip against the pre-existing baseline on `main` — every test that passed before passes after.)
- **SC-004**: The new descriptor-validation test catches a deliberately-malformed tool registration **on the first run** when the malformed registration is staged before the fix lands. (Measured by: a developer-facing check, performed once during the fix's implementation, where a temporary malformed registration is added and the test is observed to fail; the malformed registration is then removed before merge.)
- **SC-005**: The fix is released as a patch version (e.g., 0.1.7) within a release cadence consistent with the prior cadence of the project (single-day or next-business-day fix turnaround for breakage of this severity, since the package is currently unusable for new installs).

## Assumptions

- The error message in the user's report originates from an MCP client that strictly validates the `tools/list` response against the protocol's `Tool` schema (the error shape — `code: invalid_value`, `values: ["object"]`, path-array — matches the validator behaviour of zod-style schema runners commonly embedded in MCP clients). The fix must satisfy the protocol regardless of which specific client surfaced the error first.
- Tool index 2 in the error path corresponds to the third registered tool in `src/server.ts`, which today is `read_note` — confirmed by inspection of the registration order. If a future change reorders or inserts tools, the same fix still applies because FR-002 / FR-006 are tool-agnostic.
- The MCP `Tool` definition's requirement that `inputSchema.type === "object"` is normative and stable; this spec assumes it will not be relaxed by a future protocol revision within the timeframe of this fix.
- The project's release pipeline (npm publish, version bump in `package.json`, CHANGELOG/release notes) is unchanged from the cadence used for 0.1.5 → 0.1.6. No release-pipeline changes are in scope for this feature.
- Implementation tactics — for example, whether the fix wraps `targetModeSchema` only at the published-descriptor boundary, post-processes `zodToJsonSchema`'s output, hand-writes the descriptor's JSON Schema, or some combination — are deferred to `/speckit-plan`. This spec deliberately states the *what* (every tool's published schema is a valid object schema) without locking in the *how*.
- The `target-mode` primitive's `passthrough()` behaviour and its discriminated-union shape are deliberate prior decisions (ADR-003, feature 004) and are NOT being relitigated. The fix concerns only how the schema is *published* to MCP clients, not its runtime validation rules.
