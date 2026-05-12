# Feature Specification: List Files — Typed Folder-Scoped File Enumeration

**Feature Branch**: `019-list-files`
**Created**: 2026-05-12
**Status**: Draft
**Input**: User description: "Add List Files — A typed MCP tool that lists the files in a vault folder, returning the vault-relative paths as a structured array. Optionally filters by extension; optionally returns just the count."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Specific-mode listing returns a structured array of vault-relative paths (Priority: P1)

An agent needs to enumerate the files inside a known folder of a known vault — for example "what notes exist under `Inbox/`?", "how many PNGs are attached under `Assets/`?", "is `Drafts/` empty?" The agent calls `list_files` with `target_mode: "specific"`, the vault display name, optionally a `folder` (omit for vault root), and optionally an `ext` filter. The tool returns a structured object `{ count, paths }` where `paths` is an array of vault-relative file paths and `count` matches `paths.length`. Today the only path is `obsidian_exec` returning plain text that the agent must line-parse; the typed surface returns the structured shape directly so downstream traversals, conditional creates, and inventory reports drop the brittle parse step.

**Why this priority**: This is the dominant use case. Folder enumeration is a precondition check for many agent workflows — folder traversals, batch operations, conditional creates ("only if this folder is empty"), inventory reports. Without specific-mode support the typed surface offers no advantage over `obsidian_exec` plus client-side line parsing; this story alone justifies the feature.

**Independent Test**: Author fixture folders in a real vault (one empty, one with a handful of named files, one with mixed extensions, one nested under a vault-relative path). Call `list_files` once per folder with `target_mode: "specific"` and the vault display name. Assert the response shape matches `{ count: <n>, paths: [<vault-relative path>, ...] }`. Assert `count === paths.length`. Assert two consecutive calls with identical input return the same `paths` array in the same order. The story is fully testable in isolation; nothing in P2/P3 is required for it to deliver value.

**Acceptance Scenarios**:

1. **Given** vault `Demo` has folder `Inbox/` containing three files (`a.md`, `b.md`, `c.md`), **When** the agent calls `list_files({ target_mode: "specific", vault: "Demo", folder: "Inbox" })`, **Then** the response is `{ count: 3, paths: ["Inbox/a.md", "Inbox/b.md", "Inbox/c.md"] }` (or whatever vault-relative path form the underlying enumeration produces, with `count === paths.length`).
2. **Given** vault `Demo` has root-level files `README.md` and `Index.md` plus a child folder `Inbox/`, **When** the agent calls `list_files({ target_mode: "specific", vault: "Demo" })` (no `folder`), **Then** the response carries the root-level files in `paths` and `count === paths.length`. Child-folder contents MUST NOT appear in `paths` — this tool is non-recursive by design.
3. **Given** vault `Demo` has folder `Mixed/` containing `note.md`, `image.png`, and `data.csv`, **When** the agent calls `list_files({ target_mode: "specific", vault: "Demo", folder: "Mixed", ext: "md" })`, **Then** the response carries only `note.md` in `paths` and `count === 1`.
4. **Given** vault `Demo` has no folder at vault-relative path `Missing/`, **When** the agent calls `list_files({ target_mode: "specific", vault: "Demo", folder: "Missing" })`, **Then** the response is `{ count: 0, paths: [] }` — the call succeeds with the empty-folder shape, NOT a structured error.
5. **Given** vault `Demo` has an empty folder `Empty/`, **When** the agent calls `list_files({ target_mode: "specific", vault: "Demo", folder: "Empty" })`, **Then** the response is `{ count: 0, paths: [] }` — indistinguishable from the non-existent-folder case (scenario 4). This mirrors the underlying CLI's behaviour and is a deliberate, locked-in contract.
6. **Given** vault `Demo` has folder `Inbox/` with three files, **When** the agent calls `list_files` twice in succession with identical inputs (within the same MCP server session), **Then** both responses carry the same `paths` array in the same order. The underlying ordering convention (alphabetical, insertion-order, etc.) is documented in the published tool documentation.
7. **Given** a folder input with a trailing slash (`folder: "Inbox/"`) versus without (`folder: "Inbox"`), **When** the agent calls `list_files` once with each form against the same vault, **Then** both calls return the same `{ count, paths }` response. The wrapper normalises trailing-slash input before passing through if the underlying CLI does not already treat them as equivalent.
8. **Given** a vault display name that does not match any registered Obsidian vault, **When** the agent calls `list_files`, **Then** the call fails with a structured error (the same reclassified-CLI-response shape that the existing typed tools already use for unknown vaults — never a silent empty-listing).

---

### User Story 2 — Active-mode listing against the focused vault (Priority: P1)

An agent operating in a session where Obsidian's editor has a specific vault focused needs to enumerate files in the focused vault without naming a vault display name. The agent calls `list_files` with `target_mode: "active"` and optionally a `folder` / `ext` / `total`. The tool resolves the focused vault at execution time and returns the same `{ count, paths }` shape as specific mode.

**Why this priority**: Active mode is the standard target-mode discriminator across every typed tool in the project (`read_note`, `write_note`, `delete_note`, `read_property`, `find_by_property`, `read_heading`, `write_property`). Omitting it would create an inconsistency in the typed surface. Pairs equally with US1 — together they cover the full target-mode discriminator contract.

**Independent Test**: Run Obsidian with a known vault focused. Call `list_files({ target_mode: "active", folder: "Inbox" })`. Assert the response carries the focused vault's `Inbox/` listing. Independently testable from US1 because no specific-mode `vault` is exercised.

**Acceptance Scenarios**:

1. **Given** Obsidian has vault `Demo` focused with folder `Inbox/` containing three files, **When** the agent calls `list_files({ target_mode: "active", folder: "Inbox" })`, **Then** the response is `{ count: 3, paths: [...] }` matching the focused vault's `Inbox/` contents.
2. **Given** active mode and no Obsidian instance is reachable (no focused vault), **When** the agent calls `list_files`, **Then** the call fails with a structured error.

---

### User Story 3 — Count-only mode returns just the number (Priority: P1)

An agent needs to know how many files exist in a folder without paying the cost of transferring the full path list — for example to gate a follow-up batch operation, populate a counter, or short-circuit a "process all" loop. The agent calls `list_files` with `total: true`. The tool returns `{ count, paths: [] }` — the count is the same number that would have been produced without the flag, and `paths` is an empty array preserved for shape consistency.

**Why this priority**: Count-only mode is the explicit token-economy advantage over `obsidian_exec` plus line-counting. A folder with 10 000 files would otherwise force a transfer of every path just to derive a number; `total: true` reduces the payload to a single integer. Independently testable because the count-only path can be exercised with the same fixtures as US1 plus a single boolean flag.

**Independent Test**: Reuse the US1 fixture folders. Call `list_files` once with `total: false` (or omitted) and once with `total: true` against each fixture. Assert that for every fixture the `count` matches across both calls AND the `total: true` response carries `paths: []`. Combine with the US1 ext filter to assert the count is filtered.

**Acceptance Scenarios**:

1. **Given** vault `Demo` has folder `Inbox/` containing five files, **When** the agent calls `list_files({ target_mode: "specific", vault: "Demo", folder: "Inbox", total: true })`, **Then** the response is `{ count: 5, paths: [] }`.
2. **Given** the same fixture, **When** the agent calls `list_files` once with `total: false` (or omitted) and once with `total: true`, **Then** the `count` value matches across both responses.
3. **Given** vault `Demo` has folder `Mixed/` containing one `.md` file and two `.png` files, **When** the agent calls `list_files({ ..., folder: "Mixed", ext: "md", total: true })`, **Then** the response is `{ count: 1, paths: [] }` — the extension filter applies to the count.
4. **Given** vault `Demo` has no folder at `Missing/`, **When** the agent calls `list_files({ ..., folder: "Missing", total: true })`, **Then** the response is `{ count: 0, paths: [] }` — parity with US1 scenario 4.

---

### User Story 4 — Validation rejects malformed inputs before the CLI is invoked (Priority: P1)

An agent (or misbehaving caller) submits an input shape that violates the tool's contract. The tool MUST reject the call at the validation boundary, before any underlying CLI invocation occurs, and MUST surface a structured validation error that names the offending field. No CLI call may be dispatched by an invalid input.

**Why this priority**: Validation is the safety contract for every typed tool in this project, and it is a constitutional requirement (zod-as-source-of-truth). Although `list_files` is a read-only surface, the principle holds: a malformed input that reaches the CLI risks spurious work, misleading errors, or undocumented behaviour. Independently testable because every validation case can be exercised with a mock/spy on the CLI dispatcher to assert the dispatcher was never called.

**Independent Test**: For each invalid input shape, call `list_files` with a CLI dispatcher spy. Assert the call rejects with a structured validation error AND the dispatcher was never invoked. No real CLI or vault required.

**Acceptance Scenarios**:

1. **Given** `target_mode: "specific"` with no `vault`, **When** the agent calls `list_files`, **Then** the call fails validation; no CLI call is made.
2. **Given** `target_mode: "active"` with `vault` set, **When** the agent calls `list_files`, **Then** the call fails validation; no CLI call is made.
3. **Given** any mode with a `file` key (the locator field that does not apply to this folder-scoped tool), **When** the agent calls `list_files`, **Then** the call fails validation; no CLI call is made.
4. **Given** any mode with a `path` key (the other file-scoped locator), **When** the agent calls `list_files`, **Then** the call fails validation; no CLI call is made.
5. **Given** any input with an unknown top-level key (for example `{ target_mode: "active", folder: "Inbox", foo: "bar" }`), **When** the call is forwarded by an MCP client that does NOT strip unknown keys, **Then** the server-side validation fails; no CLI call is made.
6. **Given** `target_mode` is a value outside `"specific" | "active"`, **When** the agent calls `list_files`, **Then** the call fails validation; no CLI call is made.
7. **Given** `total` is a non-boolean shape (e.g. `"true"`, `1`, `null`), **When** the agent calls `list_files`, **Then** the call fails validation; no CLI call is made.
8. **Given** `folder` or `ext` is a non-string shape (e.g. an array, an object, `null`), **When** the agent calls `list_files`, **Then** the call fails validation; no CLI call is made.

---

### User Story 5 — Documentation surface for the typed tool (Priority: P2)

An operator or agent inspects the project's progressive-disclosure help facility to understand how `list_files` works. The current placeholder stub for `list_files` (or the absence of any entry) MUST be replaced with full documentation that covers the per-field input contract, the output shape (both branches of the `total` flag), the failure-mode roster, and at least four worked examples.

**Why this priority**: The help facility is the primary discovery surface for tool consumers (mirrored from `read_note` / `write_note` / `delete_note` / `read_property` / `find_by_property` / `read_heading` / `write_property`). The tool is callable without docs but un-discoverable without them. Should-pass for ship; not required for the listing code path itself to function. Independently testable by loading the help facility output and asserting structural completeness.

**Independent Test**: Invoke the help facility for `list_files`. Assert the doc carries: input contract per field (target_mode, vault, folder, ext, total), output shape for both branches of the `total` flag, the non-recursive contract, the documented ordering convention, the failure-mode roster, and at least four worked examples (covering at minimum: specific-mode root listing, specific-mode folder listing with ext filter, active-mode listing, count-only mode). The registry-consistency test from `005-help-tool` already auto-asserts the file's existence once the tool is registered; this story expands that assertion to content completeness.

**Acceptance Scenarios**:

1. **Given** the help facility, **When** an operator queries `list_files`, **Then** the response carries the full per-field input contract, both output-shape branches (`total: false` returns paths populated; `total: true` returns paths empty), the documented ordering convention, the non-recursive contract, the failure-mode roster, and at least four worked examples covering at least four distinct scenarios.

---

### User Story 6 — Pathological-size folders surface a structured error rather than truncating (Priority: P3)

An agent calls `list_files` against a folder containing tens of thousands of files. The response payload approaches or exceeds the typed-tool output cap. The tool MUST surface a structured "output too large" error rather than silently truncating the `paths` array. Callers facing this case can fall back to the count-only mode (`total: true`, payload is a single integer) plus separately scoped sub-queries.

**Why this priority**: This is an explicit P3 in the user input. The shape is uncommon (most real vaults do not have 10 000-file folders) but operationally meaningful: silent truncation would corrupt downstream traversal logic in a way that is invisible until it produces wrong results. Independently testable by generating a synthetic large folder and asserting the response is a structured error, not a truncated array.

**Independent Test**: Generate (or fixture-prepare) a folder containing enough files that the serialised `paths` array exceeds the underlying output cap. Call `list_files` without `total`. Assert the call fails with a structured error. Call `list_files` again with `total: true`. Assert the call succeeds and the `count` reflects the full file count.

**Acceptance Scenarios**:

1. **Given** vault `Demo` has folder `Huge/` containing enough files that the serialised `paths` array would exceed the typed-tool output cap, **When** the agent calls `list_files({ ..., folder: "Huge" })` (no `total`), **Then** the call fails with a structured "output too large" error AND no truncated `paths` array is returned.
2. **Given** the same fixture, **When** the agent calls `list_files({ ..., folder: "Huge", total: true })`, **Then** the call succeeds with `{ count: <full count>, paths: [] }`.

---

### Edge Cases

The implementation MUST handle, document, or explicitly defer each of the following observable shapes.

**CONCURRENCY**

- Files MAY be added or removed from the target folder between the validation step and the listing. The response reflects whatever was on disk at execution time. The wrapper does NOT introduce file-locking or coordination; the contract is a point-in-time snapshot, not a transaction.
- Active-mode TOCTOU: the focused vault MAY change between submission and execution. The response reflects whichever vault was focused at execution time; callers needing strict vault routing must use specific mode.

**CONTENT — file names**

- A folder containing files with emoji, non-ASCII characters, leading/trailing whitespace, or other unusual code points in their names. The wrapper returns whatever the underlying enumeration produces — no wrapper-side filtering or normalisation. Observed behaviour MUST be characterised during the live-CLI characterisation pass and documented as the contracted shape.
- Dotfiles and dot-directories (e.g. `.obsidian/`, `.gitignore`, `.trash/`). Whether these appear in the response is a property of the underlying CLI's enumeration semantics, not a wrapper-side decision. Observed behaviour MUST be characterised and documented in the published tool documentation; callers MUST NOT assume dotfiles are excluded.

**CONTENT — folder path normalisation**

- A `folder` input with a trailing slash (`Inbox/`) versus without (`Inbox`) MUST yield the same response. If the underlying CLI does not natively treat them as equivalent, the handler normalises before passing through. Locked into US1 scenario 7.
- Case sensitivity on the `folder` input is platform-dependent — Windows and macOS-default filesystems resolve case-insensitively; Linux filesystems resolve case-sensitively. The wrapper does NOT normalise case; it passes `folder` through to the underlying CLI verbatim. The platform-dependent behaviour MUST be documented in the published tool documentation.
- A `folder` value naming a path inside the vault that resolves to a FILE rather than a folder (e.g. `folder: "notes/x.md"`) — observable behaviour MUST be characterised during the live-CLI characterisation pass. Whether the underlying CLI returns an empty listing, a structured error, or a single-element listing of the file itself, the wrapper passes the response through; the response shape is locked by the characterisation findings.

**CONTENT — extension filter**

- An `ext` filter containing a leading dot (e.g. `ext: ".md"`) versus without (`ext: "md"`). Whether the underlying CLI accepts both forms or just one MUST be characterised; if only one form is accepted, the handler normalises before passing through. The wrapper does NOT silently accept an unsupported form and return an empty listing.
- An `ext` filter with an unrecognised or impossible value (e.g. `ext: "qqq"`) returns `{ count: 0, paths: [] }` — the empty-listing path, indistinguishable from "the folder has no files with that extension".

**LIMITS**

- Output-cap behaviour: a folder containing more files than the typed-tool output cap can carry. The operation MUST fail with a structured "output too large" error rather than silently truncating. Callers MUST be able to fall back to `total: true` (which transfers only an integer) plus separately scoped sub-queries. Locked into US6.
- Recursion: this tool is NON-RECURSIVE by design. The response carries files in the named folder only, never the recursive subtree. Sub-folders MAY or MAY NOT appear in the response — observable behaviour MUST be characterised. Callers needing a recursive listing fall back to `obsidian_exec` or a future feature.

**UNDERLYING CLI — unknown vault**

- An unknown vault display name MAY produce a CLI response that the existing bridge classifier does not natively treat as an error (the same shape covered for `delete_note` / `write_note` / `read_property` / `find_by_property` / `read_heading` / `write_property` via 011-R5 inheritance). The implementation MUST handle this case explicitly: the response MUST be reclassified to a structured `CLI_REPORTED_ERROR`, not silently returned as a successful empty listing.

**UNDERLYING CLI — empty vs missing folder**

- A folder that exists but is empty MUST return `{ count: 0, paths: [] }` indistinguishably from a folder that does not exist. This matches the underlying CLI's behaviour and is the contracted shape — callers needing to distinguish "missing" from "empty" must perform that check via a separate surface (e.g. `obsidian_exec` against a folder-introspection subcommand) or accept the conflation. Locked into US1 scenarios 4 and 5.

**CLIENT-CLASS — unknown-key validation**

- The server-side validation behaviour for "unknown top-level keys" (US4 scenario 5) is directly observable only from MCP clients that forward unknown keys to the server. Strict-naive clients strip unknown keys client-side per the published JSON Schema's `additionalProperties: false`, in which case the server never sees the offending key and validation does not trigger. Both pathways MUST be documented; the test case MUST exercise the server-side path explicitly so the validation contract holds for the client class that does forward unknown keys.

**SECURITY — path traversal on `folder`**

- The `folder` field is caller-supplied. Path-traversal attempts (e.g. `folder: "../../etc"`, `folder: "../OtherVault"`) MUST either be rejected at the validation boundary or verified to be rejected by the underlying CLI's vault-confinement check. The wrapper MUST NOT return a listing of files outside the named vault's root — silent vault-escape is a security defect. Observed behaviour MUST be characterised during the live-CLI characterisation pass; if the underlying CLI is the rejection layer, the bridge classifier's mapping of that rejection to a structured error MUST be verified.

**SECURITY — argv passing**

- The `folder` and `ext` fields are caller-supplied. They MUST be passed through to the underlying CLI as discrete argv parameters, not interpolated into a shell command, an `eval` call, or any other text-based execution surface. Argv-array passing prevents shell-metacharacter and command-injection attacks structurally; no per-field sanitisation of `folder` or `ext` is required for that threat model. There is no eval-injection vector because this surface composes via a typed CLI subcommand, not an `eval` invocation (in contrast to the eval-composing surfaces such as `find_by_property` and `read_heading`).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose a typed MCP tool named `list_files` that lists the files in a vault folder, returning the vault-relative paths as a structured array.
- **FR-002**: The tool MUST accept a `target_mode` discriminator with the values `"specific"` and `"active"`, mirroring the discriminator contract used by every other typed tool in the project.
- **FR-003**: In `target_mode: "specific"`, the tool MUST require a `vault` display name. In `target_mode: "active"`, the tool MUST forbid the `vault` key. Presence of `vault` in active mode MUST produce a validation failure.
- **FR-004**: The tool MUST NOT accept the file-scoped locator fields `file` or `path` in any mode. Presence of either field MUST produce a validation failure. (Rationale: this tool is folder-scoped, not file-scoped; the standard target-mode locator fields do not apply.)
- **FR-005**: The tool MUST accept an optional `folder` field (a string) naming the vault-relative folder to enumerate. When `folder` is omitted, the tool MUST list files in the vault root.
- **FR-006**: The tool MUST accept an optional `ext` field (a string) that filters the response to files with the given extension. When `ext` is omitted, the tool MUST return all files regardless of extension.
- **FR-007**: The tool MUST accept an optional `total` field (a boolean, default `false`). When `total: true`, the response carries the file count AND an empty `paths` array. When `total: false` (or omitted), the response carries both the count and the populated `paths` array.
- **FR-008**: The tool's input schema MUST forbid unknown top-level keys (`additionalProperties: false`).
- **FR-009**: The tool MUST return an output object with two fields: `count` (a non-negative integer) and `paths` (an array of vault-relative path strings). On the `total: true` branch, `paths` MUST be the literal empty array `[]`. On the `total: false` branch, `count` MUST equal `paths.length`.
- **FR-010**: Listing a folder that does not exist MUST return `{ count: 0, paths: [] }` — the empty-folder shape — NOT a structured error. A folder that exists but is empty MUST return the same shape. The two cases are indistinguishable by design; this matches the underlying CLI's behaviour and is the contracted surface.
- **FR-011**: The response ordering of `paths` MUST be stable across consecutive calls with identical inputs within the same MCP server session. The underlying ordering convention (alphabetical, insertion-order, etc.) MUST be characterised during the live-CLI characterisation pass and documented in the published tool documentation.
- **FR-012**: The tool MUST be non-recursive. The response carries files in the named folder only, never the recursive subtree. The non-recursive contract MUST be documented in the published tool documentation.
- **FR-013**: A `folder` input with a trailing slash and the same input without a trailing slash MUST yield the same response. If the underlying CLI does not natively treat them as equivalent, the handler MUST normalise the input before passing through.
- **FR-014**: All validation failures MUST occur strictly before any underlying CLI invocation. Tests MUST be able to assert a CLI dispatcher spy was never called for invalid inputs.
- **FR-015**: The `folder` and `ext` fields MUST be passed to the underlying CLI as discrete argv parameters, not interpolated into any shell-evaluated string. The argv-passing contract is the structural anti-injection guarantee.
- **FR-016**: Path-traversal attempts on the `folder` field MUST either be rejected at the validation boundary or verified to be rejected by the underlying CLI's vault-confinement check. The wrapper MUST NOT return a listing of files outside the named vault's root.
- **FR-017**: The tool MUST surface a structured error when the named vault does not match any registered Obsidian vault. If the underlying CLI returns a non-error-shaped response for unknown vaults, the implementation MUST reclassify that response to `CLI_REPORTED_ERROR` before returning to the caller (parity with 011-R5 inheritance across the prior typed tools).
- **FR-018**: The tool MUST surface a structured error in `target_mode: "active"` when no Obsidian instance is reachable (no focused vault).
- **FR-019**: When the serialised response payload would exceed the typed-tool output cap, the tool MUST surface a structured "output too large" error rather than silently truncating the `paths` array. The cap value is inherited from the existing CLI-adapter cap (no new cap is introduced by this feature).
- **FR-020**: Errors MUST flow through the project's existing structured error codes — no new error codes MUST be introduced by this feature. Validation failures MUST surface as `VALIDATION_ERROR`; CLI failures MUST surface through the existing CLI-failure codes; output-cap failures MUST surface through the existing cap-exceeded code.
- **FR-021**: The tool MUST be registered through the project's existing typed-tool registration factory. The progressive-disclosure help facility's documentation file for `list_files` MUST be authored with the per-field input contract, both output-shape branches, the documented ordering convention, the non-recursive contract, the failure-mode roster, and at least four worked examples.
- **FR-022**: Each acceptance criterion across US1–US6 MUST be locked by at least one regression test that survives subsequent re-runs unchanged. The test count MUST be sufficient to cover schema validation, handler behaviour, and registration consistency.
- **FR-023**: The feature MUST run a live-CLI characterisation pass before ship that documents observable CLI behaviour for each of the following cases. Findings MUST be persisted in the feature's research artefact.
  - Listing a folder with a small handful of files (one case per: all `.md`, mixed extensions, single file, empty folder).
  - Listing the vault root (no `folder`).
  - Listing with `ext` filter (one case per: filter matches some files, filter matches no files, filter is `"md"` vs `".md"`).
  - Listing a non-existent folder.
  - Listing with `total: true` (one case per: populated folder, empty folder, missing folder, with ext filter).
  - Listing twice in succession to confirm ordering stability; observable ordering convention recorded (alphabetical, insertion-order, etc.).
  - Listing a folder with files whose names contain emoji, non-ASCII characters, leading / trailing whitespace.
  - Listing a folder that contains dotfiles / dot-directories — observable inclusion / exclusion behaviour recorded.
  - Listing a `folder` value that resolves to a FILE rather than a folder — observable response shape recorded.
  - Listing with a trailing slash on `folder` versus without — confirms whether the underlying CLI treats them as equivalent.
  - Listing with an unknown vault display name — confirms the unknown-vault reclassification path.
  - Listing with active mode and no focused vault — confirms the structured-error path.
  - Path-traversal on `folder` (e.g. `folder: "../../etc"`, `folder: "../OtherVault"`) — confirms whether the rejection layer is the wrapper or the underlying CLI.
  - Listing a synthetically large folder whose `paths` array exceeds the output cap — confirms the structured "output too large" error path AND that `total: true` succeeds on the same fixture.
  - Listing a folder that contains sub-folders — confirms whether sub-folder entries appear in the response (non-recursive contract).
- **FR-024**: The feature MUST NOT change the public surface of any existing typed tool (`read_note`, `write_note`, `delete_note`, `read_property`, `find_by_property`, `read_heading`, `write_property`, `obsidian_exec`, the help tool). The only permitted edit to existing source is the addition of `list_files` to the registration list.
- **FR-025**: All new source files introduced by this feature MUST carry the project's "Original — no upstream." attribution header per the project Constitution's originality principle.

### Key Entities

- **Folder listing request**: A folder-scoped enumeration request. Carries a `target_mode` discriminator (`"specific"` or `"active"`), an optional `folder` (vault-relative folder path; omitted means vault root), an optional `ext` (extension filter), and an optional `total` boolean (default `false`). In specific mode the request carries a `vault` display name; in active mode the request operates on the focused vault. The request MUST NOT carry the file-scoped locator fields `file` or `path`.
- **Folder listing response**: An object with two fields: `count` (a non-negative integer) and `paths` (an array of vault-relative path strings). On the `total: false` branch, `count === paths.length`. On the `total: true` branch, `paths === []` and `count` carries the full file count for the folder (and ext filter, if applied). The response is the only success-path return value; any failure surfaces as a structured error, never as a `{ count: -1, ... }` shape or a partial `paths` array.
- **Extension filter**: A string drawn from no enumerated set — the underlying CLI's filter rules apply. The wrapper does NOT validate the string against a known-extension allowlist; an `ext` value naming an extension that no file in the folder carries returns the empty-folder shape `{ count: 0, paths: [] }`. Whether a leading-dot form (`.md`) and a bare form (`md`) are both accepted is characterised during the live-CLI characterisation pass; if only one form is accepted, the handler normalises before passing through.
- **Ordering convention**: A property of the underlying CLI's enumeration semantics — alphabetical, insertion-order, or otherwise. The wrapper does NOT impose a sort; the convention discovered during the live-CLI characterisation pass is the contracted ordering. The convention MUST be documented in the published tool documentation so callers can depend on it without re-running the characterisation pass themselves.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Listing a folder that contains files returns a response where `count === paths.length` and every element of `paths` is a vault-relative path string in 100% of test runs.
- **SC-002**: Listing the vault root (no `folder`) returns the root-level files in `paths` in 100% of test runs. Child-folder contents do NOT appear in the response — the non-recursive contract is observable.
- **SC-003**: Listing with an `ext` filter returns only files whose extension matches the filter; files with other extensions do NOT appear in the response in 100% of test runs.
- **SC-004**: Listing a folder that does not exist returns `{ count: 0, paths: [] }` — NOT a structured error — in 100% of test runs. The same shape is returned for a folder that exists but is empty.
- **SC-005**: Listing with `total: true` returns a response where `paths === []` AND `count` equals what would have been returned without the flag, in 100% of test runs. The flag composes with `ext` filtering — `total: true, ext: "md"` returns the filtered count.
- **SC-006**: Two consecutive calls with identical inputs (within the same MCP server session) return the same `paths` array in the same order in 100% of test runs. The underlying ordering convention is documented in the published tool documentation.
- **SC-007**: Every invalid input shape rejected at the validation boundary (US4 scenarios 1–8) produces a structured error AND zero underlying CLI invocations across 100% of test runs.
- **SC-008**: A `folder` input with a trailing slash and the same input without a trailing slash yield the same response in 100% of test runs.
- **SC-009**: Listing with an unknown vault display name produces a structured error AND no silent empty-listing in 100% of test runs.
- **SC-010**: Listing in active mode with no focused vault produces a structured error in 100% of test runs.
- **SC-011**: A path-traversal attempt on the `folder` field (e.g. `folder: "../../etc"`, `folder: "../OtherVault"`) does NOT return a listing of files outside the named vault's root in 100% of test runs. Whichever layer performs the rejection (the wrapper or the underlying CLI), the response surface is a structured error.
- **SC-012**: A folder whose serialised `paths` array would exceed the typed-tool output cap produces a structured "output too large" error AND no truncated `paths` array in 100% of test runs. The same fixture queried with `total: true` succeeds with the full count.
- **SC-013**: Every byte of the public output of the existing typed tools (`read_note`, `write_note`, `delete_note`, `read_property`, `find_by_property`, `read_heading`, `write_property`, `obsidian_exec`, the help tool) is unchanged by this feature, except for the help facility growing one new `list_files` entry.
- **SC-014**: The published documentation for `list_files` covers the full per-field input contract, both output-shape branches (`total: false` vs `total: true`), the documented ordering convention, the non-recursive contract, the failure-mode roster, and at least four worked examples covering at least four distinct scenarios (specific-mode root listing, specific-mode folder listing with ext filter, active-mode listing, count-only mode).
- **SC-015**: Every acceptance criterion across US1–US6 is locked by at least one regression test, totalling no fewer than 30 tests across schema, handler, and registration suites.
- **SC-016**: Zero new error codes are introduced by this feature; every failure flows through existing structured error codes.
- **SC-017**: The live-CLI characterisation pass (FR-023) documents observable behaviour for every enumerated case, persisted in the feature's research artefact and surfaceable from the published documentation.
- **SC-018**: An agent enumerating a folder can do so in a single typed tool call returning a structured array, replacing what previously required an `obsidian_exec` invocation plus client-side line parsing. The token saving on a 100-file folder is observable from any tracing layer that records request/response payload sizes — and the `total: true` flag further reduces a count-only query to a single integer.
- **SC-019**: The `folder` and `ext` inputs cannot reach a shell-evaluated context. The argv-passing contract is structurally enforced by the underlying CLI invocation surface, and is verifiable by inspection of the dispatcher call shape (no shell, no eval, no string interpolation).

## Assumptions

- The user input is exhaustive for ship-gating decisions: no clarifications session is required (`/speckit-clarify` is not needed). The 14 acceptance criteria across [P1] / [P2] / [P3], the six adversarial categories (CONCURRENCY, CONTENT, LIMITS, UNDERLYING CLI, CLIENT-CLASS, SECURITY), and the explicit out-of-scope list define a complete spec surface for the planning phase to consume.
- The underlying Obsidian CLI exposes a subcommand whose argv shape supplies enough structure for a typed wrapper to enumerate the files in a named folder, with optional extension filtering, without re-emitting a directory listing in the wrapper. The exact subcommand name and argv shape are an implementation concern resolved during the planning phase against `obsidian help`.
- The bridge classifier's existing inheritance for unknown-vault response inspection (introduced in feature 011 and inherited unchanged by features 012 / 013 / 014 / 015 / 018) is applicable to this feature's CLI subcommand. If the underlying response shape differs, the feature's planning phase will surface that as a delta and the unknown-vault classification will be addressed there.
- The existing CLI-adapter output cap (introduced in feature 003, re-affirmed by every subsequent typed tool) is the cap this feature inherits. No new cap is introduced.
- The post-010 flat-extension idiom for `target_mode` schemas (single `z.object().strict().superRefine(...)` plus `applyTargetModeRefinement`) and the post-011 module-layout convention (`index.ts` factory + co-located tests) are the conventions this feature consumes. The folder-scoped surface MAY require a minor adaptation of `applyTargetModeRefinement` to forbid the file-scoped locator fields `file` and `path` in both modes (rather than enforcing the `file`-XOR-`path` rule); whether that adaptation lands as a new helper, a parameterisation of the existing helper, or inline schema refinement is a planning-phase decision. No precedent feature's spec or plan is amended.
- The project's standard target-mode discriminator semantics defined in `.decisions/ADR-003 - Enforce Target Mode in Typed Tools.md` apply with a folder-scoped adaptation: `list_files` operates on a vault folder (specific-mode) or the focused vault's folder (active-mode), where the prior tools' surfaces operated on a named file or the focused file. The ADR is NOT amended; the folder-scoped adaptation is the implementation realisation of the same target-mode contract.
- The release impact is purely additive: no existing tool's public surface changes; no error codes are added; no ADRs are amended. The version bump policy (patch — typed-surface addition) is a planning-phase decision but the additive shape is a constraint set by this spec.
- Out of scope for this feature, recorded here so the planning phase does not silently absorb them: recursive listings (subtree traversal — separate future feature); folder-only listings (returning child folders rather than files — separate future feature); per-file metadata (size, modified time, file type — use `obsidian_exec` for now); file/path locator semantics (this tool is folder-scoped — the standard target-mode locator fields do not apply; the input shape uses `folder` instead); folder normalisation across platforms (the wrapper passes `folder` through verbatim; platform-dependent case-sensitivity is the underlying CLI's responsibility).
