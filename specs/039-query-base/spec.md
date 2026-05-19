# Feature Specification: Query Base

**Feature Branch**: `039-query-base`
**Created**: 2026-05-20
**Status**: Draft
**Input**: User description: "Add Query Base — a typed capability that lets an agent retrieve the rows of a named view inside an Obsidian Bases (`.base`) file, returning the matched rows as structured JSON. Predictable JSON shape (array of objects keyed by column name). Structured, distinguishable errors for missing file vs. missing view. Empty view returns success with zero rows. Out of scope: non-JSON output formats, view enumeration, base-file enumeration, write-side (create/mutate base files or rows), active-file targeting without an explicit path, querying without a view name."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Retrieve rows of a named view as structured JSON (Priority: P1)

An agent issues a request naming a vault-relative `.base` file and a view inside it. The response carries the rows that view selects, ordered the way the view defines, with each row a JSON object keyed by the view's column names. When the named view exists but matches zero notes, the response is a successful empty array — not an error. The agent can iterate over rows by column name without writing a parser.

**Why this priority**: The whole feature exists to give agents a structured retrieval surface over Obsidian Bases. Without P1 there is no MVP. The predictable JSON shape and the empty-success behaviour are intrinsic to the contract — a caller cannot trust an array-of-rows response if the shape varies or if "no matches" is ambiguous with "something went wrong". This is the slice every other behaviour builds on; with only P1 the agent can already reason over vault-tabular data and replace per-caller parser code.

**Independent Test**: Stand up a vault with a `.base` file declaring at least two views. Each view exposes a known column set and matches a known set of notes. Issue the operation naming the first view and verify the response is a JSON array whose entries are objects keyed by that view's columns, in the view's declared row order, containing only that view's rows (not the sibling view's). Issue the operation against a view known to match zero notes and verify the response is a successful empty array.

**Acceptance Scenarios**:

1. **Given** a `.base` file at the supplied vault-relative path containing a view with the supplied name that matches at least one note, **When** the agent invokes the operation, **Then** the response carries the rows that view selects, in the order the view defines, with each row a JSON object keyed by the view's column names.
2. **Given** a `.base` file containing multiple views, **When** the agent names one view, **Then** only that view's rows appear in the response; sibling views' rows are not included.
3. **Given** a view that exposes its default column set (no explicit column selection), **When** the agent reads any returned row, **Then** the row carries every column the view exposes by default.
4. **Given** a view that exists but matches zero notes, **When** the agent invokes the operation, **Then** the response is a successful empty array, not an error.

---

### User Story 2 - Distinguish missing file from missing view through typed errors (Priority: P2)

An agent that targets a `.base` file or a view that does not exist receives a typed, structured error identifying which of the two is missing. The two states are programmatically distinguishable in the response envelope — the agent can branch on "wrong path" vs. "wrong view name" without parsing prose. Neither state is silently surfaced as an empty success.

**Why this priority**: P1 gives the happy path. Without P2, an agent that calls the operation and gets back an empty array has three indistinguishable interpretations: the file is missing, the view is missing, or the view matched zero notes. That ambiguity forces the agent into pre-flight checks (does the file exist? does the view exist?) and defeats the purpose of a typed retrieval surface. P2 is the diagnostic contract that makes the response self-describing: success-with-rows, success-with-empty, error-missing-file, and error-missing-view are four distinct states the caller can switch on directly.

**Independent Test**: With P1 in place, issue the operation naming a `.base` file that does not exist and verify a typed error names the missing file. Issue the operation naming a `.base` file that exists but a view name that does not exist inside it, and verify a typed error names the missing view. Verify the two errors are programmatically distinguishable in the response envelope (different `details.code` discriminator values, not just different prose strings). Issue the operation against an existing view that matches zero notes and verify the response is a successful empty array — not either error.

**Acceptance Scenarios**:

1. **Given** the requested `.base` file does not exist at the supplied vault-relative path, **When** the agent invokes the operation, **Then** the response is a typed error identifying the missing file — not a raw crash, not a silent empty array.
2. **Given** the `.base` file exists but contains no view of the supplied name, **When** the agent invokes the operation, **Then** the response is a typed error identifying the missing view, distinct in the envelope from the missing-file error.
3. **Given** the view exists and matches zero notes, **When** the agent invokes the operation, **Then** the response is a successful empty array — neither of the two error envelopes above.

---

### Edge Cases

- The `.base` file contains a view whose row order is determined by a configured sort or grouping: rows arrive in the order the view defines (the view's own sort), not the order of underlying notes on disk.
- The `.base` file contains a view with a default column set (no explicit selection): each row carries every column the view exposes by default.
- A column value in a returned row is empty / null at the source: the row still appears; the cell surfaces as `null` (or the upstream's chosen sentinel) verbatim per FR-014. Absent cells are not coerced to the empty string.
- The view matches notes whose paths contain Unicode (NFC vs. NFD), spaces, or punctuation: rows surface verbatim — no normalisation, parity with the existing read-side surface.
- Two views in the same `.base` file share a column name but expose different cell content: the agent names one view; the response carries only that view's column shape, regardless of the sibling.
- The caller passes a `base_path` containing `../`, a leading `/` or `\`, a drive-letter prefix (e.g., `C:\`), or a control character: the operation rejects at the input-validation boundary with `code: "VALIDATION_ERROR"`, `details.code: "INVALID_BASE_PATH"`, `details.reason: "path-traversal"` before any filesystem access. No data is read.
- The caller passes a vault-relative `base_path` whose canonical resolution (e.g., through a symlink) lies outside the vault root: the operation rejects with `code: "PATH_ESCAPES_VAULT"` (REUSE of the existing ADR-009 code). No data is read.
- The caller passes an empty `base_path: ""` or an empty `view_name: ""`: the operation rejects at the input-validation boundary with `code: "VALIDATION_ERROR"` naming the offending field. No vault access occurs.
- The caller passes a `base_path` that does not end in `.base` (e.g., names a `.md` note or an arbitrary file): the operation rejects at the input-validation boundary with `code: "VALIDATION_ERROR"`, `details.code: "INVALID_BASE_PATH"`, `details.reason: "wrong-extension"`. No vault access occurs.
- The caller does not supply a `vault` field: the operation runs against the focused vault (cohort default for read-side tools).
- The caller supplies a `vault` display name the registry does not know: the operation surfaces `code: "CLI_REPORTED_ERROR"`, `details.code: "VAULT_NOT_FOUND"`, `details.reason: "unknown"`. A registered-but-closed vault surfaces the same `details.code` with `details.reason: "not-open"`.
- The view's row set changes between two repeated invocations because notes were edited in the interim: each invocation reflects the current vault state at read time. No fingerprinting or drift detection (read surface — same TOCTOU posture as `read_note`, `read_property`, `pattern_search`).
- The view matches more than 1000 rows: the response carries the first 1000 rows in view-defined order along with a truncation signal (FR-013). The caller can detect truncation via the signal and narrow the view (or query a sibling view with tighter filters) rather than receive a context-blowing payload.
- A column value in a returned row is `null`, a number, a boolean, or a nested object: the value is surfaced verbatim as its native JSON type (FR-014). Cells are not coerced to strings.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose a typed read-side capability that accepts a vault-relative `.base` file path and a view name, and returns the rows that view selects.
- **FR-002**: The successful response MUST be a JSON array. Each element MUST be an object keyed by the view's column names, in the column order the view defines.
- **FR-003**: Returned rows MUST appear in the order the named view defines (the view's own ordering — sort, group, or natural), not in caller-supplied or filesystem-traversal order.
- **FR-004**: When the supplied `base_path` resolves to no `.base` file in the vault, the operation MUST return a typed error identifying the missing file. This error MUST be programmatically distinguishable in the response envelope from the missing-view error (FR-005) and from a successful empty-rows response (FR-006).
- **FR-005**: When the `.base` file exists but contains no view of the supplied `view_name`, the operation MUST return a typed error identifying the missing view. This error MUST be programmatically distinguishable in the response envelope from the missing-file error (FR-004) and from a successful empty-rows response (FR-006).
- **FR-006**: When the named view exists and matches zero notes, the operation MUST return a successful response with an empty array — not an error.
- **FR-007**: When the `.base` file contains multiple views, the response MUST carry only the named view's rows. Rows belonging to sibling views in the same `.base` file MUST NOT appear in the response.
- **FR-008**: A view exposing its default column set (no explicit column selection) MUST surface every column the view exposes by default in each returned row.
- **FR-009**: Vault selection — the operation MUST accept an optional `vault` field. When absent, the operation runs against the focused vault. When present, the supplied display name MUST be resolved via the project's lazy vault registry (parity with the existing read-side cohort: `read_note`, `read_property`, `pattern_search`). An unknown or closed vault MUST surface `code: "CLI_REPORTED_ERROR"` with `details.code: "VAULT_NOT_FOUND"` and a sub-discriminating `details.reason` ("unknown" vs. "not-open").
- **FR-010**: Path-traversal safety — `base_path` inputs containing `../`, a leading `/` or `\`, a drive-letter prefix, or a control character MUST be rejected at the input-validation boundary BEFORE any filesystem access (Layer 1, ADR-009). After resolution, the canonical path of the target MUST be verified to lie under the canonical vault root (Layer 2); on escape, the operation MUST surface `code: "PATH_ESCAPES_VAULT"`.
- **FR-011**: Input validation — an empty `base_path` or an empty `view_name` MUST be rejected at the input-validation boundary with `code: "VALIDATION_ERROR"`, naming the offending field, BEFORE any vault access.
- **FR-012**: Extension filter — a `base_path` that does not end with the `.base` extension (case-insensitive on the extension) MUST be rejected at the input-validation boundary with `code: "VALIDATION_ERROR"`, `details.code: "INVALID_BASE_PATH"`, `details.reason: "wrong-extension"`. No filesystem access occurs.
- **FR-013**: Row-count cap — the response MUST cap the rows-array at 1000 entries (parity with BI-033 `search_vault_content` and BI-035 `context_search`). When the view's row set exceeds the cap, the response MUST carry the first 1000 rows in view-defined order AND a top-level truncation signal indicating the response was truncated. The truncation signal's exact field name and shape (e.g., `truncated: boolean`, optional `total_rows` count) is a planning concern; the spec contract is the semantic guarantee that a truncated response is programmatically distinguishable from a complete-and-exactly-1000-rows response. Unbounded payloads are rejected as they risk blowing the agent's context window; capping with a typed signal preserves the predictable-shape contract.
- **FR-014**: Column-value typing — each cell in a returned row MUST preserve the upstream's native JSON type (number, boolean, null, nested object, ISO-date string). String-coercion of all cells is rejected as it would defeat the typed-retrieval value proposition the feature exists to deliver. Callers that need a string projection can stringify per-cell at the call site; callers that want typed values cannot recover them from a coerced response. Parity with the read-side cohort (`read_property` surfaces upstream's typed value as-is).
- **FR-015**: Side-effect freedom — the operation MUST be a pure read. Invoking it MUST NOT mutate any note, the `.base` file, or any vault metadata. No write-queue acquisition occurs (parity with the read-side cohort).
- **FR-016**: Error envelope discipline — all failures MUST surface through the project's typed `UpstreamError` envelope (Constitution Principle IV). No new top-level error codes are introduced (the fifteen-tool zero-new-codes streak holds). New failure states are expressed via `details.code` sub-discrimination per ADR-015; missing-file and missing-view are distinguished via distinct `details.code` values, not via distinct top-level codes.

### Key Entities

- **Base file**: A vault-relative file with the `.base` extension. The native Obsidian 1.9+ tabular artifact. May contain one or more named views.
- **View**: A named selector inside a base file. Defines a column set, a row-selection rule over vault notes, and a row order. The agent names exactly one view per invocation.
- **Row**: A single record returned by a view. Surfaces as a JSON object keyed by the view's column names.
- **Column**: A named field in a view's output schema. The view's declared column order determines the JSON object's key order in the response.
- **Vault**: The Obsidian vault the base file lives in. Resolved via the project's lazy vault registry; absent vault field defaults to the focused vault.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent retrieves the rows of a named view inside a `.base` file in a single call, without writing custom code to parse subprocess text output. Replaces the current escape-hatch (raw subprocess output) for the bases-query use case.
- **SC-002**: An agent receiving a response can programmatically distinguish four states without parsing prose strings: success-with-rows, success-with-empty-rows, error-missing-file, and error-missing-view. The four states are surfaced by distinct, type-narrowable envelope discriminators.
- **SC-003**: Repeated invocations of the operation against an unchanged vault and an unchanged `.base` file return the same rows in the same order — the row-order contract is deterministic and matches the view's declared order.
- **SC-004**: Naming a view in a multi-view `.base` file returns only that view's rows. An agent inspecting the response cannot mistakenly read a sibling view's rows.
- **SC-005**: An accidental call with a malformed `base_path` (path traversal, wrong extension, empty string) is rejected at the input-validation boundary before any filesystem access; no data is read and no log noise is generated beyond the validation refusal.

## Assumptions

- The upstream CLI exposes the underlying bases-query operation as a subcommand that returns structured output the wrapper can convert to the FR-002 JSON shape. The exact subcommand surface is a planning concern; the spec contract is the semantic guarantee.
- The `.base` file format is the Obsidian 1.9+ native bases schema. Earlier or incompatible base-like artifacts are out of scope.
- Focused-vault default mirrors the existing read-side cohort (`read_note`, `read_property`, `pattern_search`). No new vault-resolution machinery is introduced.
- No active-file fallback in v1 — the caller must supply an explicit `base_path` (the user input listed active-file targeting as out of scope, behaviour unconfirmed against the live surface).
- No "list all views in a base file" or "list all base files in the vault" capability in v1 — both are deferred to separate features, per the user input's out-of-scope clauses.
- No write-side capability in v1 — creating `.base` files, adding views, or mutating rows is deferred. The operation is read-only and acquires no write queue.
- No new top-level error codes (Constitution Principle IV — the fifteen-tool zero-new-codes streak is preserved). New states surface via `details.code` sub-discrimination, parity with the existing read-side error contract.
- The `details.code` values for the new states (`BASE_NOT_FOUND`, `VIEW_NOT_FOUND`, `INVALID_BASE_PATH`) are introduced as new sub-discriminators; their final spelling and top-level code mapping is a planning concern and is closed in `/speckit-clarify` if non-obvious.
- TOCTOU posture matches the read-side cohort — the response reflects vault state at read time; no fingerprinting, no drift detection between repeated invocations.
- Row-count cap default (FR-013) is 1000 rows with a truncation signal, parity with the established BI-033 / BI-035 cohort posture. Operator-tunable caps were considered and rejected for v1 — a fixed cap keeps the response-shape contract deterministic across deployments. Revisitable in `/speckit-clarify`.
- Column-value typing default (FR-014) is native-type preservation, parity with `read_property` and the read-side cohort. String-coercion was considered and rejected — it would defeat the typed-retrieval value proposition. Revisitable in `/speckit-clarify`.
