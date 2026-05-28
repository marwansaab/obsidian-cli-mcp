# Feature Specification: Add Bases Surface

**Feature Branch**: `054-add-bases-surface`
**Created**: 2026-05-28
**Status**: Draft
**Input**: User description: "Add three independent typed tools to the obsidian-cli-mcp MCP server — `bases` (vault-wide enumeration of `.base` files, BI-0049), `views_base` (view enumeration within a `.base` file, BI-0082), and `create_base` (item creation within a Bases view, BI-0083) — completing the Obsidian Bases surface alongside the already-shipped `query_base`."

## Clarifications

### Session 2026-05-28

- Q: Should `bases` guarantee deterministic ordering of the returned paths array? → A: **Wrapper guarantees path-ascending (lexicographic) sort on the `bases` array, regardless of CLI emission order.** Mirrors `query_base`'s determinism discipline (FR-002a/FR-002b path-ascending sort) per ADR-015 sibling cohort-discipline rule for deterministic envelopes across the Bases family. Enables exact-order test assertions and zero-ambiguity agent consumption. Cost is near-zero (small array, single `.sort()`).
- Q: Should `views_base` return just view names or richer per-view metadata (type, filter config, row count)? → A: **Names only — `{ views: string[], count: number }`.** Matches the stated discover→pick→`query_base` purpose. Richer per-view objects defer to a follow-on BI if agent need surfaces empirically. Avoids coupling the envelope to upstream metadata shape that may shift across Obsidian versions. Parity with `find_by_property` / `properties` pattern of minimal vault-wide discovery surfaces.
- Q: Should `bases` apply a result-count cap (like `query_base`'s 1000-row cap) with truncation fields? → A: **No cap — return all paths unconditionally, no truncation fields in the envelope.** Vault `.base` file count is bounded by total file count; practical vaults sit in single-digit to low-double-digit range. Cohort-consistency argument doesn't carry — `query_base`'s cap exists because view rows scale independently of file count; that scaling property doesn't apply to base-file enumeration. The no-cap stance is documented in the tool's help doc so the cohort asymmetry vs `query_base` is explicit.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Discover available bases in the vault (Priority: P1)

An agent wants to discover every `.base` file in a vault before querying any of them. The agent calls `bases({})` and receives a structured list of vault-relative paths alongside a count. The agent can then feed any returned path into `query_base` or `views_base` without guessing filenames.

**Tool**: `bases` (BI-0049)

**Why this priority**: Discovery is the entry point of the discover → query → write chain. Without it, agents must fall back to generic file-listing workarounds that cannot distinguish `.base` files from ordinary Markdown files.

**Independent Test**: Can be fully tested by calling `bases({})` against a vault with known `.base` files and verifying the returned paths and count. Delivers standalone value as a discovery endpoint.

**Acceptance Scenarios**:

1. **Given** a vault containing one or more `.base` files, **When** an agent calls `bases({})`, **Then** the response is a structured object containing `bases: string[]` (vault-relative paths) and `count: number` matching the array length.
2. **Given** a vault containing no `.base` files, **When** an agent calls `bases({})`, **Then** the response is `{ bases: [], count: 0 }` — an empty list, not an error.
3. **Given** the underlying CLI supports a count-only mode, **When** an agent calls `bases({ total: true })`, **Then** the response carries the count without the paths array. If the CLI does not support count-only mode, the `total` flag is not exposed in the schema.

---

### User Story 2 — Enumerate views within a base (Priority: P1)

An agent has identified a `.base` file (from `bases()` or from prior knowledge) and needs to know which views it defines before issuing a `query_base` call. The agent calls `views_base({ path: "Projects.base" })` and receives the list of view names plus a count.

**Tool**: `views_base` (BI-0082)

**Why this priority**: Agents cannot safely call `query_base({ view: ... })` without knowing valid view names. Guessing causes `VIEW_NOT_FOUND` errors; `views_base` eliminates that gap.

**Independent Test**: Can be fully tested by calling `views_base({ path: <known-base> })` against a vault with a known `.base` file and verifying the returned view names. Delivers standalone value as a view-discovery endpoint.

**Acceptance Scenarios**:

1. **Given** a `.base` file exists at the supplied vault-relative path, **When** an agent calls `views_base({ path: "Projects.base" })`, **Then** the response is a structured object containing `views: string[]` (view names in declaration order) and `count: number` matching the array length.
2. **Given** a `.base` file exists at the focused path in Obsidian AND the underlying CLI supports active mode for this subcommand, **When** an agent calls `views_base({})` (no path), **Then** the response describes the focused base's views. If the CLI is specific-mode-only for this subcommand, active mode is unavailable and the limitation is documented.
3. **Given** the supplied path does not exist, **When** an agent calls `views_base({ path: "nonexistent.base" })`, **Then** the response is a structured `UpstreamError` with `code: "CLI_REPORTED_ERROR"` and `details.code: "BASE_NOT_FOUND"`.
4. **Given** the supplied path exists but is not a `.base` file, **When** an agent calls `views_base({ path: "README.md" })`, **Then** input validation rejects it with `code: "VALIDATION_ERROR"` and `details.code: "INVALID_BASE_PATH"`, `details.reason: "wrong-extension"`.

---

### User Story 3 — Create an item within a base (Priority: P2)

An agent wants to add a new item (a Markdown note) to a Bases view — for example, adding a new task row to a task-tracking base or a new meeting note to a meetings base. The agent calls `create_base({ path, name, content })` and receives confirmation of the created item's vault path.

**Tool**: `create_base` (BI-0083)

**Why this priority**: Write-side capability completes the discover → query → write surface. Lower priority than the two read-side tools because agents can query and discover without the ability to create, but not vice versa.

**Independent Test**: Can be fully tested by calling `create_base` with valid inputs and verifying the response contains the created item's vault path. Delivers standalone value as a write endpoint.

**Acceptance Scenarios**:

1. **Given** a `.base` file exists at the supplied path, **When** an agent calls `create_base({ path: "Tasks.base", name: "Fix login bug", content: "## Description\nThe login page throws a 500 error." })`, **Then** a new item is created and the response confirms the created item's vault-relative path.
2. **Given** the agent also supplies an optional `view` parameter, **When** the call returns, **Then** the item is associated with the named view. If the `view` is omitted, the outcome (default view or structured error) matches whatever the underlying CLI specifies.
3. **Given** an item with the requested name already exists within the base, **When** an agent calls `create_base`, **Then** the tool surfaces the collision as a structured error or follows whatever well-defined behaviour the underlying CLI exposes — never a silent overwrite.
4. **Given** the supplied `content` exceeds the documented size limit (derived from the platform's argv-size ceiling), **When** an agent calls `create_base`, **Then** the tool returns a structured error explaining the limit before invoking the CLI.
5. **Given** the supplied path does not exist or is not a `.base` file, **When** an agent calls `create_base({ path: "nonexistent.base", name: "x" })`, **Then** the response is a structured error identifying the failure cause.

---

### User Story 4 — Structured errors across all three tools (Priority: P1)

An agent calls any of the three tools with malformed inputs, a non-existent target, or a path that is not a `.base` file. The tool surfaces a typed, structured error through the existing error contract — never a raw crash, never a new top-level error code.

**Tool**: All three (`bases`, `views_base`, `create_base`)

**Why this priority**: Error discipline is cross-cutting and must be in place from the first release of each tool. Without it, agents cannot programmatically recover from failures.

**Independent Test**: Each tool's error surface is tested independently within its own co-located test set.

**Acceptance Scenarios**:

1. **Given** any tool is called with malformed inputs (missing required field, wrong type), **When** validation runs, **Then** the response is `code: "VALIDATION_ERROR"` with sub-discriminated `details`.
2. **Given** any tool encounters an upstream CLI failure, **When** the failure surfaces, **Then** it is classified under an existing top-level code (`CLI_REPORTED_ERROR`, `VALIDATION_ERROR`, etc.) with appropriate `details.code` sub-discrimination.
3. **Given** a tool's path argument contains path-traversal sequences (`../`, leading `/`, drive letters), **When** validation runs, **Then** the response is `code: "VALIDATION_ERROR"` with `details.code: "INVALID_BASE_PATH"`, `details.reason: "path-traversal"`.

---

### Edge Cases

- What happens when the vault contains `.base` files in nested subdirectories? The `bases` tool returns vault-relative paths including directory prefixes, matching the underlying CLI's enumeration.
- How does `create_base` behave when the content is an empty string? An empty-string body is valid — it creates a note with no body content, per CLI semantics.
- What happens when `views_base` is called on a `.base` file that defines zero views? The response is `{ views: [], count: 0 }` — an empty list, not an error.
- What happens when `create_base` content contains special characters (backslashes, quotes, null bytes)? The tool passes content via the CLI adapter's existing argument-encoding discipline; characters that would exceed argv bounds are caught by the size-limit pre-check.
- How does each tool behave when the vault parameter names a closed-but-registered vault? Each tool inherits the `VAULT_NOT_FOUND/not-open` detection discipline from the existing CLI adapter layer, parity with `query_base`.

## Requirements *(mandatory)*

### Functional Requirements

**Tool: `bases` (BI-0049)**

- **FR-001**: `bases` MUST enumerate all `.base` files in the vault, returning vault-relative paths.
- **FR-002**: `bases` MUST return a `count` field reflecting the number of bases found.
- **FR-003**: `bases` MUST return `{ bases: [], count: 0 }` when no `.base` files exist — not an error.
- **FR-004**: `bases` MAY expose a `total: true` flag for count-only mode if and only if the underlying CLI supports it. If the CLI does not support count-only, the flag is omitted from the schema.
- **FR-005**: `bases` MUST return the `bases` array sorted in path-ascending (lexicographic) order, regardless of upstream CLI emission order. Parity with `query_base`'s determinism discipline.
- **FR-006**: `bases` MUST NOT apply a result-count cap or truncation fields. All paths are returned unconditionally. The tool's help doc MUST note the cohort asymmetry vs `query_base`'s 1000-row cap (base-file count is bounded by vault file count; view-row count is not).
- **FR-007**: `bases` MUST accept an optional `vault` parameter for multi-vault routing, parity with `query_base`.

**Tool: `views_base` (BI-0082)**

- **FR-008**: `views_base` MUST return a structured list of view names (strings only, no per-view metadata) defined within the specified `.base` file, in declaration order.
- **FR-009**: `views_base` MUST return a `count` field reflecting the number of views found.
- **FR-010**: `views_base` MUST return `{ views: [], count: 0 }` when the base defines zero views — not an error.
- **FR-011**: `views_base` MUST accept a `path` parameter (vault-relative path to the `.base` file) subject to the same validation rules as `query_base`'s `base_path`: max 1000 UTF-16 code units, path-traversal rejection, `.base` extension enforcement.
- **FR-012**: `views_base` MAY support active mode (no `path` parameter, operates on the currently focused `.base` file) if and only if the underlying CLI supports it for this subcommand. Mode availability is documented.
- **FR-013**: `views_base` MUST accept an optional `vault` parameter for multi-vault routing.

**Tool: `create_base` (BI-0083)**

- **FR-014**: `create_base` MUST create a new item (Markdown note) within the specified `.base` file.
- **FR-015**: `create_base` MUST accept a `path` parameter (vault-relative path to the `.base` file) subject to the same validation rules as `query_base`'s `base_path`.
- **FR-016**: `create_base` MUST accept a `name` parameter (the item's title/name) as a non-empty string, max 1000 UTF-16 code units.
- **FR-017**: `create_base` MUST accept an optional `content` parameter (the item's body text).
- **FR-018**: `create_base` MAY accept an optional `view` parameter to target a specific view within the base. If omitted, behaviour follows whatever the underlying CLI specifies.
- **FR-019**: `create_base` MUST return the created item's vault-relative path in the response.
- **FR-020**: `create_base` MUST enforce a content size limit derived from the platform's argv-size ceiling and reject over-limit content with a structured error BEFORE invoking the CLI.
- **FR-021**: `create_base` MUST NOT silently overwrite an existing item with the same name. Name collisions surface as a structured error or follow whatever well-defined behaviour the underlying CLI exposes.
- **FR-022**: `create_base` MUST accept an optional `vault` parameter for multi-vault routing.
- **FR-023**: `create_base` MUST NOT expose the `open` or `newtab` UI side-effect parameters — UI behaviour is out of scope for the typed agent surface.

**Cross-cutting**

- **FR-024**: Each tool MUST validate inputs at the schema boundary using Zod with `.strict()` mode. Unknown keys are rejected.
- **FR-025**: Each tool MUST classify failures through the existing error roster (`VALIDATION_ERROR`, `CLI_REPORTED_ERROR`, `PATH_ESCAPES_VAULT`, etc.) without introducing new top-level error codes.
- **FR-026**: Each tool MUST use sub-discriminated `details.code` and `details.reason` fields per ADR-015 for fine-grained error identification.
- **FR-027**: Each tool MUST ship with its own co-located test set (`schema.test.ts`, `handler.test.ts`, `index.test.ts`). No shared tests across tools.
- **FR-028**: Each tool's canonical name follows ADR-010's mechanical mapping from the upstream CLI subcommand: `bases` (single-word), `views_base` (from `base:views`), `create_base` (from `base:create`).
- **FR-029**: Each tool's source layout follows Principle I: `src/tools/<tool_name>/{index,schema,handler}.ts` plus co-located `*.test.ts` files.
- **FR-030**: Each tool's registration description MUST be 400+ characters, include worked examples, name all typed error states, and cross-reference the Bases-family cohort (`bases`, `query_base`, `views_base`, `create_base`).

### Key Entities

- **Base**: A `.base` file in the vault — an Obsidian Bases database definition containing view declarations and schema metadata.
- **View**: A named view defined within a `.base` file — determines which notes are included, which columns are displayed, and how rows are sorted/filtered.
- **Item**: A Markdown note created within a Bases view — the row-level entity that `create_base` produces.
- **Bases-family cohort**: The four typed tools that compose the Bases surface — `bases`, `query_base`, `views_base`, `create_base` — each wrapping one CLI subcommand under ADR-010 naming.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Agents can discover all `.base` files in a vault in a single call, receiving paths and count without fallback to generic file-listing tools.
- **SC-002**: Agents can enumerate view names within any `.base` file in a single call, enabling exact-match `view_name` input to `query_base` without trial-and-error.
- **SC-003**: Agents can create new items within a base in a single call and receive the created item's vault path for use in subsequent tool calls.
- **SC-004**: Each tool independently passes its co-located test suite covering happy paths and error classification — a failure in one tool's tests does not block the other two from shipping.
- **SC-005**: Zero new top-level error codes introduced across all three tools — the existing error roster handles every failure mode via sub-discrimination.
- **SC-006**: Each tool's error responses are structured, typed, and programmatically actionable — agents can branch on `code` and `details.code` without string-parsing error messages.

## Assumptions

- The Obsidian CLI exposes `base:list` (or equivalent) for enumerating `.base` files, `base:views` for listing views within a base, and `base:create` for creating items. Exact subcommand names and flag sets will be confirmed during the research/clarify phase via CLI probes.
- The three tools inherit the vault-selection discipline already established by `query_base` (ADR-008): optional `vault` parameter, focused-vault default when omitted.
- Content size limits for `create_base` derive from the platform's argv-size ceiling (typically ~32 KiB on Windows, ~2 MiB on Linux/macOS), consistent with existing bounds established in the CLI adapter.
- The `total` flag for count-only mode in `bases` is conditional — it will be exposed only if the underlying CLI supports a dedicated count mode rather than full enumeration. This will be confirmed during CLI characterization.
- Active mode for `views_base` (operating on the currently focused file) is conditional on CLI support for the `base:views` subcommand in active mode. This will be confirmed during CLI characterization.
- Each tool follows the same DI pattern as `query_base`: receives `invokeCli`, `Logger`, and `Queue` via dependency injection, never importing boot-time factories directly.
