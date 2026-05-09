# Feature Specification: Find By Property — Typed Frontmatter-Index Lookup

**Feature Branch**: `014-find-by-property`
**Created**: 2026-05-09
**Status**: Draft
**Input**: User description: "Add Find By Property — A typed MCP tool that returns the vault-relative paths of notes whose frontmatter property matches a given value. Inherently vault-wide; the query has no 'active file' concept and does NOT use the project's standard target-mode contract."

## Clarifications

### Session 2026-05-09

- Q: When `arrayMatch: false` and both the property's list and the supplied `value` array carry the same elements in different orders (e.g. property `tags: [alpha, beta]` vs query `value: ["beta", "alpha"]`), should the lists match? → A: Order-sensitive — exact equality requires elements in the same position. Order-insensitive ("multiset") matching is NOT supported by `arrayMatch: false`; set-membership intent is already covered by `arrayMatch: true` (contains semantics). The two modes are kept structurally distinct: `true` = "value appears anywhere", `false` = "lists are positionally equal". US3 scenario 4 is amended from a deferred-characterisation case to a P1 acceptance scenario; FR-016 and FR-027 are amended to lock order-sensitive equality.
- Q: How should the `folder` field close the loop on path-traversal escapes (`..` segments, leading `/`)? → A: Reject at the schema boundary. A `folder` value containing any `..` segment OR starting with `/` produces a `VALIDATION_ERROR` before any CLI invocation. Defence-in-depth: the security contract is observable from the published JSON Schema rather than inferred from CLI behaviour, so it survives an Obsidian CLI version change. FR-021 is amended from a documented either/or to a single locked mechanism; the SECURITY — folder path traversal Edge Cases bullet is amended to reflect the schema-level rejection; US5 picks up an additional acceptance scenario covering the rejection; SC-010 is tightened to assert the rejection path explicitly.
- Q: When `vault` is omitted and multiple Obsidian vaults are registered, how should the tool behave? → A: Document the multi-vault limitation; trust the underlying CLI's focused-vault resolution. The `vault` field stays optional; the user input's "When omitted, the focused vault is searched" contract is preserved. When multiple vaults are registered the focused-vault default may be ambiguous (no Obsidian instance running, no vault foregrounded, or two vaults equally foregrounded); whatever the underlying CLI returns is the tool's response. Multi-vault users are expected to supply `vault` explicitly when they need vault-scoped certainty. Parity with `read_property`'s R4 active-mode multi-vault limitation. FR-003 is amended to call out the limitation explicitly; a new UNDERLYING — multi-vault default Edge Cases bullet is added; the published documentation MUST surface the limitation alongside the other multi-vault notes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Scalar identifier lookup returns matching paths (Priority: P1)

An agent has a frontmatter identifier (`id: BI-030`, `vault_id: my-setup`, `status: queued`) and needs the path or paths of the notes carrying that value. The agent calls `find_by_property` with the property `name`, the scalar `value`, and (optionally) a `vault`. The tool returns the vault-relative paths of matching notes plus a count.

**Why this priority**: This is the dominant use case and the entire point of the feature. Today the agent must guess the path-from-convention (often 1–5 calls per identifier resolution) or sift content-keyword-search noise; both are wasteful. A single typed call replaces the whole sequence and is the highest-leverage retrieval primitive missing from the typed-tool surface. Without this story, no matching is possible and the feature delivers nothing.

**Independent Test**: Construct a vault with a note whose frontmatter carries a unique identifier (`id: BI-030`) and several notes sharing a multi-valued field (`status: queued`). Call `find_by_property` with each variant. Assert the unique-identifier query returns exactly one path, the shared-value query returns the expected multi-path set, and a non-existent value returns `{ count: 0, paths: [] }`. Fully testable in isolation.

**Acceptance Scenarios**:

1. **Given** a single note in vault `Demo` whose frontmatter carries `id: BI-030`, **When** the agent calls `find_by_property({ vault: "Demo", property: "id", value: "BI-030" })`, **Then** the response is `{ count: 1, paths: ["<the note's vault-relative path>"] }`.
2. **Given** several notes sharing `status: queued`, **When** the agent calls `find_by_property({ vault: "Demo", property: "status", value: "queued" })`, **Then** the response carries every matching note's vault-relative path AND `count` equals `paths.length`.
3. **Given** a property value that no note in the vault carries, **When** the agent calls `find_by_property`, **Then** the response is `{ count: 0, paths: [] }` — no error.
4. **Given** a note with frontmatter `count: 7`, **When** the agent calls `find_by_property({ vault: "Demo", property: "count", value: 7 })`, **Then** the response includes that note. **Given** the same note, **When** the agent calls with `value: "7"` (the string), **Then** the response does NOT include that note — the type-faithful contract distinguishes numeric `7` from the string `"7"`.
5. **Given** a note with frontmatter `archived: true`, **When** the agent calls `find_by_property({ vault: "Demo", property: "archived", value: true })`, **Then** the response includes that note. **When** the agent calls with `value: "true"` (the string), **Then** the response does NOT include it.
6. **Given** the `vault` field is omitted, **When** the agent calls `find_by_property`, **Then** the underlying CLI's focused-vault default is used and the response reflects matches in that vault.

---

### User Story 2 — Folder-scoped narrowing (Priority: P1)

An agent knows the matching note lives somewhere under a specific folder prefix (a backlog directory, a sentinel directory, a year subdirectory). The agent calls `find_by_property` with the optional `folder` field. The tool restricts the search to files under that vault-relative folder prefix, returning only matches inside the prefix.

**Why this priority**: Vaults grow large and conventions place identifier classes under known subtrees. Without folder narrowing the agent receives every match across the whole vault and must filter client-side — wasteful and noisy. Folder scoping is independently testable from US1: it requires only a vault with the matching value present in one folder and absent from another.

**Independent Test**: Build a fixture with the same `id: X` value present in folder `A/` and a different note with `id: X` absent from folder `B/`. Call `find_by_property` once with `folder: "A"` (returns the match) and once with `folder: "B"` (returns no match). Independently testable from US1; only adds one input axis.

**Acceptance Scenarios**:

1. **Given** a note with `id: BI-030` at `backlog/BI-030.md`, **When** the agent calls `find_by_property({ vault: "Demo", property: "id", value: "BI-030", folder: "backlog" })`, **Then** the response is `{ count: 1, paths: ["backlog/BI-030.md"] }`.
2. **Given** the same vault, **When** the agent calls with `folder: "archive"` (a folder that does NOT contain the matching note), **Then** the response is `{ count: 0, paths: [] }` — no error.
3. **Given** the `folder` field is the empty string `""`, **When** the agent calls `find_by_property`, **Then** the response is identical to the call with `folder` omitted (whole-vault search).

---

### User Story 3 — Array-field semantics (Priority: P1)

A frontmatter property may hold a list (tags, aliases, categories). The agent needs two distinct semantics: "the value appears anywhere in the list" (the common tag-style intent) and "the list is exactly this set" (the exact-equality intent). The agent controls the choice via `arrayMatch: true` (default — contains semantics) or `arrayMatch: false` (exact equality).

**Why this priority**: Tag-style fields are the second most common identifier class after scalars. Without contains semantics by default, every agent reading tag-style fields would need a workaround. Without an opt-out for exact-equality, set-membership semantics could not be expressed at all. Independently testable from US1 because it requires only list-valued fixtures.

**Independent Test**: Author a fixture with `tags: [alpha, beta]` and another with `tags: [alpha]`. Call once with `arrayMatch: true` (default) and `value: "alpha"` — both match. Call once with `arrayMatch: false` and `value: ["alpha"]` — only the second matches. Call once with `arrayMatch: false` and `value: "alpha"` (scalar) — neither matches because the list `[alpha, beta]` and `[alpha]` cannot equal a scalar. Testable independently of US1/US2.

**Acceptance Scenarios**:

1. **Given** a note with `tags: [alpha, beta, gamma]`, **When** the agent calls `find_by_property({ vault: "Demo", property: "tags", value: "alpha" })` (arrayMatch defaults to `true`), **Then** the response includes that note.
2. **Given** the same note, **When** the agent calls with `arrayMatch: false` and `value: "alpha"`, **Then** the response does NOT include that note (the list `[alpha, beta, gamma]` does not exactly equal the scalar `"alpha"`).
3. **Given** a note with `tags: [alpha]`, **When** the agent calls with `arrayMatch: false` and `value: ["alpha"]`, **Then** the response includes that note (the list `[alpha]` exactly equals the array `["alpha"]`).
4. **Given** a note with `tags: [alpha, beta]`, **When** the agent calls with `arrayMatch: false` and `value: ["beta", "alpha"]` (same elements, different order), **Then** the response does NOT include that note. The exact-equality contract is order-sensitive: `[alpha, beta]` does NOT equal `[beta, alpha]`. Set-membership / multiset semantics are intentionally NOT supported by `arrayMatch: false`; callers needing "the list contains exactly this set regardless of order" must compose two `arrayMatch: true` calls and intersect, or wait for a future surface.
5. **Given** a note whose property is scalar (e.g., `status: queued`), **When** the agent calls with `arrayMatch: false` and `value: "queued"`, **Then** the response includes that note — `arrayMatch` is ignored when the property's value is scalar.

---

### User Story 4 — Case-insensitive opt-in (Priority: P1)

An agent's identifier may be supplied in mixed case while the vault stores it in another case (or vice versa). The agent opts into case-insensitive matching via `caseSensitive: false`. The tool folds case for string comparisons only; numeric, boolean, and null comparisons remain exact.

**Why this priority**: Case-mismatch is a daily source of false negatives in identifier lookup. Without an opt-in the agent must normalise client-side or write defensive variants. Independently testable: requires only a single fixture pair differing in case.

**Independent Test**: Author a note with `tag: Alpha`. Call `find_by_property` with `value: "alpha"` and `caseSensitive: true` (default) — no match. Call with `caseSensitive: false` — match. Testable independently of every other story.

**Acceptance Scenarios**:

1. **Given** a note with `tag: Alpha`, **When** the agent calls `find_by_property({ vault: "Demo", property: "tag", value: "alpha" })` with `caseSensitive` defaulted to `true`, **Then** the response does NOT include that note.
2. **Given** the same note, **When** the agent calls with `caseSensitive: false`, **Then** the response includes that note.
3. **Given** a note with `count: 7`, **When** the agent calls with `value: 7` and `caseSensitive: false`, **Then** the response includes that note — `caseSensitive` is ignored for non-string values.

---

### User Story 5 — Validation rejects malformed inputs before the CLI is invoked (Priority: P1)

An agent (or a misbehaving caller) submits an input shape that violates the tool's contract. The tool MUST reject the call at the validation boundary, before any underlying CLI invocation occurs, and MUST surface a structured validation error that names the offending field.

**Why this priority**: Validation is the safety contract for every typed tool in this project, and it is a constitutional requirement (zod-as-source-of-truth). Without it, malformed callers reach the CLI and produce undefined or harmful behaviour. Independently testable because every validation case can be exercised with a mock/spy on the CLI dispatcher to assert the dispatcher was never called.

**Independent Test**: For each invalid input shape, call `find_by_property` with a CLI dispatcher spy. Assert the call rejects with a structured validation error AND that the dispatcher was never invoked. No real CLI or vault required.

**Acceptance Scenarios**:

1. **Given** `property` is the empty string `""`, **When** the agent calls `find_by_property`, **Then** the call fails validation; no CLI call is made.
2. **Given** `property` is omitted entirely, **When** the agent calls `find_by_property`, **Then** the call fails validation; no CLI call is made.
3. **Given** `value` is omitted entirely, **When** the agent calls `find_by_property`, **Then** the call fails validation; no CLI call is made.
4. **Given** `value` is a type outside `{ string, number, boolean, null }` — for example an object, an array (when `arrayMatch: true`), or `undefined` — **When** the agent calls `find_by_property`, **Then** the call fails validation. **NOTE**: an array `value` IS permitted when paired with `arrayMatch: false` (US3 scenario 3); this scenario locks the rejection of array `value` in the contains-semantics branch and the rejection of object / undefined in either branch.
5. **Given** any input with an unknown top-level key (for example `{ property: "id", value: "X", foo: "bar" }`), **When** the call is forwarded by an MCP client that does NOT strip unknown keys, **Then** the server-side validation fails; no CLI call is made.
6. **Given** a `folder` value containing any `..` path segment (e.g. `..`, `../escape`, `foo/..`, `foo/../bar`) OR starting with `/`, **When** the agent calls `find_by_property`, **Then** the call fails validation with `VALIDATION_ERROR`; no CLI call is made.

---

### User Story 6 — Unknown-vault structured failure (Priority: P1)

An agent supplies a `vault` display name that does not match any registered Obsidian vault. The tool MUST surface a structured error. It MUST NOT silently return `{ count: 0, paths: [] }` — that response shape is reserved for "the search ran and found nothing", and conflating the two cases would let an agent's typo silently mask the absence of an answer.

**Why this priority**: This is the highest-stakes correctness contract in the feature. A silent zero-match for an unknown vault would let an agent confidently conclude "the identifier doesn't exist" when in fact the search never ran. Independently testable: requires only a typo'd vault name and a CLI dispatcher whose output the wrapper must reclassify.

**Independent Test**: Call `find_by_property` with a vault display name that the underlying CLI does not recognise. Assert the response is a structured error (the same `CLI_REPORTED_ERROR` shape that `read_note` / `write_note` / `delete_note` / `read_property` already produce for unknown vaults), NOT a successful zero-match.

**Acceptance Scenarios**:

1. **Given** a vault display name that does not match any registered Obsidian vault, **When** the agent calls `find_by_property`, **Then** the call fails with a structured error.
2. **Given** the underlying CLI returns a non-error-shaped response for the unknown-vault case (the same response shape the existing typed tools already reclassify), **When** the wrapper processes it, **Then** the wrapper MUST reclassify the response to the structured-error code; it MUST NOT pass the response through as a successful zero-match.

---

### User Story 7 — Documentation surface for the typed tool (Priority: P2)

An operator or agent inspects the project's progressive-disclosure help facility to understand how `find_by_property` works. The current placeholder stub for `find_by_property` (or the absence of any entry) MUST be replaced with full documentation that covers the per-field input contract, the output shape, the failure-mode roster, and at least four worked examples — one each for the scalar happy-path, the folder-scoped narrow, the array-contains semantics, and the case-insensitive opt-in.

**Why this priority**: The help facility is the primary discovery surface for tool consumers (parity with `read_note` / `write_note` / `delete_note` / `read_property`). The tool is callable without docs but un-discoverable without them. Should-pass for ship; not required for the matching code path itself to function. Independently testable by loading the help facility output and asserting structural completeness.

**Independent Test**: Invoke the help facility for `find_by_property`. Assert the doc carries the input contract per field, the output shape, the failure-mode roster, and at least four worked examples covering the four enumerated axes (scalar, folder-scoped, array-contains, case-insensitive). The registry-consistency test from `005-help-tool` already auto-asserts the file's existence once the tool is registered; this story expands that assertion to content completeness.

**Acceptance Scenarios**:

1. **Given** the help facility, **When** an operator queries `find_by_property`, **Then** the response carries the full per-field input contract, the output shape, the failure-mode roster, and at least four worked examples covering scalar happy-path, folder-scoped, array-contains, and case-insensitive.

---

### User Story 8 — Stable in-session output ordering (Priority: P3)

An agent issuing the same query repeatedly within a single MCP server session expects the `paths` array to come back in the same order every time, so downstream stable-sort or merge logic does not have to re-sort defensively. The tool MUST commit to a stable in-session order; it MUST NOT promise stability across sessions or process restarts.

**Why this priority**: Nice-to-have. The output is a set semantically, so order is not load-bearing for correctness. Documenting and testing the in-session stability still has value for downstream agents that compose multiple queries. P3 — does not gate ship.

**Independent Test**: Call `find_by_property` with a query that returns multiple paths twice in a row, with no intervening vault state change. Assert both responses carry the same `paths` array in the same order. The convention is documented in the published doc.

**Acceptance Scenarios**:

1. **Given** the same query issued twice within one server session with no vault state change between calls, **When** the agent compares the two responses, **Then** the `paths` arrays are equal element-for-element in the same order.

---

### Edge Cases

The implementation MUST handle, document, or explicitly defer each of the following observable shapes.

**CONCURRENCY**

- Files may be added, removed, or have their frontmatter modified during the search. The result reflects the in-memory index's snapshot at the moment of the query. The index may lag the on-disk state slightly when a file was just modified by an external editor; the staleness window is whatever the underlying CLI's index-refresh cycle produces. Documented as a known limitation; no transactional guarantee.

**CONTENT — type-faithful comparison**

- A property value stored as a YAML quoted string that looks like a number (e.g., `version: "1.0"`) MUST NOT match `value: 1.0` (numeric). The wrapper preserves the YAML-native type distinction at the comparison boundary; this is the type-faithful contract codified by US1 scenario 4.

**CONTENT — date / datetime comparison**

- A property value stored as a YAML date or datetime — for example `due: 2026-12-31`, `updated: 2026-05-08T14:30:00` — has YAML-defined comparison semantics. The wrapper MUST follow YAML's date semantics rather than naïve string equality. The exact observable behaviour (does YYYY-MM-DD compare equal to YYYY/MM/DD? does a date compare equal to a datetime at midnight?) MUST be characterised in the live-CLI characterisation pass and documented in the feature's research artefact.

**CONTENT — null disambiguation**

- A property whose value is YAML null (`key:` with no value) is distinguishable from an absent property. A query for `value: null` MUST match notes where the property exists with a null value AND MUST NOT match notes where the property is absent from the frontmatter altogether. The observable behaviour MUST be characterised in the live-CLI characterisation pass.

**CONTENT — list elements that are objects**

- A list-valued property whose elements are themselves YAML mappings (rare but valid YAML, e.g., `entries: [{ author: x }, { author: y }]`) is OUT OF SCOPE for this tool. Such queries MUST surface as `count: 0` (no match) rather than failing — the wrapper treats unsupported shapes as non-matches, never as errors.

**CONTENT — Unicode normalisation**

- Two strings that compare equal in NFC but differ in raw bytes (NFC vs NFD) are not guaranteed to match each other in this tool. The wrapper does NOT perform Unicode normalisation; whatever the underlying CLI / index produces is what the wrapper compares. Observable behaviour MUST be characterised and documented.

**CONTENT — hierarchical-tag rollup**

- A query for `value: "work"` against a `tags` field MUST NOT match `tags: [work/tasks]`. Frontmatter tags are matched as opaque values; hierarchical-tag rollup belongs in a future tag-index feature, not in this tool.

**LIMITS — vault size**

- A vault with hundreds of thousands of files exercises the in-memory index walk, which is linear in file count. The practical ceiling and any observed timeout behaviour MUST be characterised in the live-CLI characterisation pass and documented as known limits. The wrapper does NOT impose a separate timeout beyond the underlying CLI dispatch's existing bounded-invocation cap.

**LIMITS — large match set**

- A query that matches a very large number of files (thousands) may exceed the existing structured-output cap inherited from the bridge. The behaviour at the cap boundary MUST be a structured error (the same "output too large" error code the existing typed tools surface), NOT a silent truncation of the `paths` array. Observable cap MUST be documented.

**UNDERLYING CLI — unknown vault**

- An unknown vault display name may produce a CLI response that the existing bridge classifier does not natively treat as an error (the same response shape covered for `delete_note` / `write_note` / `read_property` via the 011-R5 inheritance). The implementation MUST handle this case explicitly: the response MUST be reclassified to the existing structured-error shape, not silently returned as a successful zero-match search. Codified by US6.

**UNDERLYING CLI — index staleness at startup**

- The in-memory index is built when Obsidian starts; if the index is stale because Obsidian has not reindexed after a recent on-disk change, the result reflects the stale index. Documented as a known limitation; no wrapper-side mitigation.

**UNDERLYING CLI — multi-vault default ambiguity**

- When `vault` is omitted and multiple Obsidian vaults are registered, the underlying CLI's "focused vault" default may resolve ambiguously: no Obsidian instance is running, no vault is foregrounded, or two vaults are equally foregrounded. The wrapper passes through whatever the underlying CLI returns; it does NOT detect or surface a structured error for the ambiguous case. Multi-vault users are expected to supply `vault` explicitly when they need vault-scoped certainty. Parity with `read_property`'s active-mode multi-vault limitation. Documented as a known limitation; no wrapper-side mitigation.

**CLIENT-CLASS — unknown-key validation**

- The server-side validation behaviour for "unknown top-level keys" (US5 scenario 5) is directly observable only from MCP clients that forward unknown keys to the server. Strict-naive clients strip unknown keys client-side per the published JSON Schema's `additionalProperties: false`, in which case the server never sees the offending key and validation does not trigger. Both pathways MUST be documented; the test case MUST exercise the server-side path explicitly so the validation contract holds for the client class that does forward unknown keys.

**SECURITY — argv passing**

- The `property`, `value`, `folder`, and `vault` inputs are caller-supplied. They are passed through to the underlying CLI as discrete argv parameters (or as data members of a structured argument), NEVER concatenated into a shell-evaluated string, NEVER interpolated into an `eval` call. Argv-array data-passing prevents shell-metacharacter and command-injection attacks structurally; no per-field escape sanitisation is required for that threat model.

**SECURITY — folder path traversal**

- The `folder` field is a vault-relative path prefix. A caller-supplied `folder` containing any `..` path segment (`..`, `../foo`, `foo/..`, `foo/../bar`) OR starting with `/` (absolute-path form) MUST be rejected at the schema validation boundary, surfacing a `VALIDATION_ERROR` before any CLI dispatch. This is the primary security control; the rejection is observable from the published JSON Schema and is independent of the underlying CLI's folder-scoping behaviour. A `folder: ".."` query that returns content from outside the vault root is a security defect and MUST NOT ship.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose a typed MCP tool named `find_by_property` that returns the vault-relative paths of notes whose frontmatter property matches a given value.
- **FR-002**: The tool MUST NOT use the project's standard `target_mode` discriminator. The tool is inherently vault-wide; no notion of an "active file" applies.
- **FR-003**: The tool MUST accept an optional `vault` field (a string, the vault display name). When omitted, the underlying CLI's focused-vault default is used. The default-resolution behaviour is single-vault-correct; in multi-vault setups (multiple Obsidian vaults registered, with no Obsidian instance running, no vault foregrounded, or multiple vaults equally foregrounded) the default may be ambiguous and the tool surfaces whatever the underlying CLI returns. Multi-vault users requiring vault-scoped certainty MUST supply `vault` explicitly. The limitation MUST be documented in the published tool documentation per FR-025 (parity with `read_property`'s R4 active-mode multi-vault limitation).
- **FR-004**: The tool MUST require a `property` field (a non-empty string). The empty string and the absence of `property` MUST both produce validation failures.
- **FR-005**: The tool MUST require a `value` field. The accepted runtime types are `string`, `number`, `boolean`, `null`, AND (when paired with `arrayMatch: false`) an array of those scalar types. Any other type — `undefined`, an object, or `arrayMatch: true` paired with an array `value` — MUST produce a validation failure. Absence of `value` MUST also fail validation.
- **FR-006**: The tool MUST accept an optional `folder` field (a string, vault-relative path prefix). When omitted or set to the empty string, the search covers the whole vault.
- **FR-007**: The tool MUST accept an optional `arrayMatch` boolean field defaulting to `true`. When `true`, list-valued frontmatter properties match if the supplied scalar `value` appears anywhere in the list (contains semantics). When `false`, list-valued frontmatter properties match only if the property's list exactly equals the supplied `value` array (or, when `value` is itself a scalar, matches only the trivial single-element-equal case the field's exact-equality semantics produce). The field is ignored for scalar property values.
- **FR-008**: The tool MUST accept an optional `caseSensitive` boolean field defaulting to `true`. The field applies to string comparisons only; numeric, boolean, and null comparisons are always exact and the field is ignored for those types.
- **FR-009**: The tool's input schema MUST forbid unknown top-level keys (`additionalProperties: false`).
- **FR-010**: The tool MUST return an output object with two fields: `count` (a non-negative number) and `paths` (an array of strings, each a vault-relative path).
- **FR-011**: `count` MUST equal `paths.length` in every successful response.
- **FR-012**: When the search returns zero matches, the response MUST be `{ count: 0, paths: [] }` — no error.
- **FR-013**: The tool MUST be type-faithful: a numeric `value` matches the numeric frontmatter value AND MUST NOT match its string representation; a boolean `value` matches the boolean frontmatter value AND MUST NOT match the string `"true"` / `"false"`. The wrapper preserves the YAML-native type distinction at the comparison boundary.
- **FR-014**: A query for `value: null` MUST match notes whose property exists with a YAML-null value AND MUST NOT match notes whose property is absent from the frontmatter altogether. The two cases are observably distinct.
- **FR-015**: When `caseSensitive: false`, string comparisons MUST fold case using a Unicode-aware case-fold; non-string comparisons MUST remain exact.
- **FR-016**: When `arrayMatch: true` (default) and the property's value is a list, the comparison MUST succeed if the supplied scalar `value` appears anywhere in the list (contains semantics). When `arrayMatch: false` and `value` is an array, the comparison MUST succeed only if the list is positionally equal to the supplied array — same length AND same element at every index. Element order is significant: `[alpha, beta]` does NOT equal `[beta, alpha]`. When `arrayMatch: false` and `value` is a scalar, list-valued properties MUST NOT match. Order-insensitive ("multiset") matching is NOT supported by `arrayMatch: false`; callers needing it compose two `arrayMatch: true` calls and intersect.
- **FR-017**: The tool MUST surface a structured error when the named vault does not match any registered Obsidian vault. If the underlying CLI returns a non-error-shaped response for unknown vaults, the implementation MUST reclassify that response to the existing structured-error code before returning to the caller. The response MUST NOT be `{ count: 0, paths: [] }` (which would be indistinguishable from a successful no-match search).
- **FR-018**: All validation failures MUST occur strictly before any underlying CLI invocation. Tests MUST be able to assert a CLI dispatcher spy was never called for invalid inputs.
- **FR-019**: Errors MUST flow through the project's existing structured error codes — no new error codes MUST be introduced by this feature. Validation failures MUST surface as `VALIDATION_ERROR`; CLI failures MUST surface through the existing four CLI-failure codes (including the existing "output too large" code for the large-match-set cap).
- **FR-020**: The `property`, `value`, `folder`, and `vault` inputs MUST be passed through to the underlying CLI as discrete argv parameters (or as data members of a structured argument), NEVER concatenated into a shell-evaluated string and NEVER interpolated into an `eval` call. The data-passing contract is the structural anti-injection guarantee.
- **FR-021**: The `folder` field MUST be rejected at the schema validation boundary when it contains a path-traversal escape. A `folder` value MUST produce a `VALIDATION_ERROR` (no CLI invocation) when it: (a) contains any `..` path segment (including `..` alone, `../foo`, `foo/..`, `foo/../bar`), OR (b) starts with `/` (absolute-path form). The rejection MUST occur before any CLI dispatch. At least one regression test MUST lock the rejection path for both conditions. The schema-level rejection is the primary security control; the underlying CLI's behaviour for any escape that hypothetically slipped through is not load-bearing for this contract.
- **FR-022**: The output `paths` array MUST be ordered by whatever stable convention the underlying CLI's enumeration produces, and MUST be byte-stable for the same query within a single MCP server session with no intervening vault state change. The order is NOT guaranteed across sessions or across vault state changes; this scope distinction MUST be documented.
- **FR-023**: Hierarchical-tag rollup (e.g., a `tags: work` query matching `tags: [work/tasks]`) MUST NOT be performed by this tool. Frontmatter tags are matched as opaque values.
- **FR-024**: List-valued properties whose elements are themselves YAML mappings MUST surface as `count: 0` (no match) rather than failing; the wrapper treats unsupported element shapes as non-matches.
- **FR-025**: The tool MUST be registered through the project's existing typed-tool registration factory. The progressive-disclosure help facility's documentation file for `find_by_property` MUST be authored with the per-field input contract, the output shape, the failure-mode roster, the multi-vault default-ambiguity limitation per FR-003, and at least four worked examples covering scalar happy-path, folder-scoped, array-contains, and case-insensitive.
- **FR-026**: Each acceptance criterion across US1–US8 MUST be locked by at least one regression test that survives subsequent re-runs unchanged. The test count MUST be sufficient to cover schema validation, handler behaviour, and registration consistency.
- **FR-027**: The feature MUST run a live-CLI characterisation pass before ship that documents observable CLI behaviour for: scalar happy-path (string, number, boolean); type-faithful distinction (string-that-looks-like-number vs number); YAML-null property vs absent property; date and datetime comparison semantics; Unicode NFC vs NFD comparison; case-insensitive comparison; array-contains semantics; array-exact-equality semantics — locking that the underlying CLI (or the wrapper's comparison layer) honours the order-sensitive contract committed in FR-016; folder-scoped narrow; folder-scoped exclude; folder path-traversal (`..` and absolute `/` prefixes); unknown vault response shape; large match set at the output cap boundary; index staleness window after an external on-disk edit; list-of-mappings non-match. Findings MUST be persisted in the feature's research artefact.
- **FR-028**: The feature MUST NOT change the public surface of any existing typed tool (`read_note`, `write_note`, `delete_note`, `read_property`, `obsidian_exec`, the help tool). The only permitted edit to existing source is the addition of `find_by_property` to the registration list.
- **FR-029**: All new source files introduced by this feature MUST carry the project's "Original — no upstream." attribution header per the project Constitution's originality principle.

### Key Entities *(include if feature involves data)*

- **Frontmatter property**: A single named key in a note's YAML frontmatter block. Has a `name` (string) and a `value` whose YAML native type is one of: text (string), list (array), number (numeric), checkbox (boolean), date or datetime (string-shaped), or YAML null. May be absent entirely (the "no such key" case) or present with a YAML-null value (the "key with no value" case); the two cases MUST be distinguishable per FR-014.
- **Match**: The relation between a caller-supplied `value` and a frontmatter property's value, evaluated in a type-faithful way. Equality only for v1; no ordering or pattern operators. For list-valued properties the relation is parameterised by `arrayMatch`. For string values it is parameterised by `caseSensitive`.
- **Search scope**: The set of files considered by a single query. Defaults to the whole of the vault named by `vault` (or the focused vault when `vault` is omitted), narrowed when `folder` is set to the files under that vault-relative folder prefix.
- **Match result**: A pair (`count`, `paths`) where `count` is the number of matching files and `paths` is the array of vault-relative paths. The set semantics — order, stability — are governed by FR-022.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A query for a unique-value frontmatter field returns exactly one path in 100% of test runs across the live-CLI characterisation fixture.
- **SC-002**: A query for a value that no note carries returns `{ count: 0, paths: [] }` with no error in 100% of test runs.
- **SC-003**: A query for a multi-match value returns every matching note's path AND `count` equals `paths.length` in 100% of test runs.
- **SC-004**: A folder-narrowed query returns matches under the prefix and excludes matches outside it in 100% of test runs.
- **SC-005**: An array-contains query (`arrayMatch: true`) matches list-valued properties containing the supplied scalar in 100% of test runs; an array-exact-equality query (`arrayMatch: false`) matches only list-valued properties whose list equals the supplied array in 100% of test runs.
- **SC-006**: A type-faithful query (numeric `value` against a numeric property; boolean `value` against a boolean property) matches the typed frontmatter value AND does NOT match its string representation in 100% of test runs.
- **SC-007**: A `caseSensitive: false` query folds case for string comparisons in 100% of test runs; the same query with `caseSensitive: true` (or defaulted) does NOT match a case-mismatched value.
- **SC-008**: Every invalid input shape rejected at the validation boundary (US5 scenarios 1–5) produces a structured error AND zero underlying CLI invocations in 100% of test runs.
- **SC-009**: An unknown-vault query produces a structured error and never `{ count: 0, paths: [] }` in 100% of test runs.
- **SC-010**: A `folder` value that contains any `..` path segment OR starts with `/` produces a `VALIDATION_ERROR` and zero CLI invocations in 100% of test runs. No path outside the vault root can appear in any response because no CLI dispatch occurs for such inputs.
- **SC-011**: Every byte of the public output of the existing typed tools (`read_note`, `write_note`, `delete_note`, `read_property`, `obsidian_exec`, the help tool) is unchanged by this feature, except for the help facility growing one new `find_by_property` entry.
- **SC-012**: The published documentation for `find_by_property` covers the full per-field input contract, output shape, failure-mode roster, and at least four worked examples covering scalar happy-path, folder-scoped, array-contains, and case-insensitive.
- **SC-013**: Every acceptance criterion across US1–US8 is locked by at least one regression test, totalling no fewer than 30 tests across schema, handler, and registration suites.
- **SC-014**: Zero new error codes are introduced by this feature; every failure flows through existing structured error codes.
- **SC-015**: The live-CLI characterisation pass documents observable behaviour for all 15 cases enumerated in FR-027, persisted in the feature's research artefact and surfaceable from the published documentation.
- **SC-016**: An agent resolving a frontmatter identifier to a path does so in a single tool call replacing what previously required a 1–5-call guess-the-path-from-convention sequence (or a content-keyword search returning megabytes of noise). Token saving and call-count reduction relative to the prior workflow are observable from any tracing layer that records request payloads and turn counts.
- **SC-017**: The `property`, `value`, `folder`, and `vault` inputs cannot reach a shell-evaluated context. The argv / data-passing contract is structurally enforced by the underlying CLI invocation surface, and is verifiable by inspection of the dispatcher call shape (no shell, no eval, no string interpolation).
- **SC-018**: Within a single MCP server session, identical queries with no intervening vault state change return byte-identical `paths` arrays in 100% of test runs.

## Assumptions

- ~~The user input is exhaustive for ship-gating decisions: no clarifications session is required.~~ **Superseded 2026-05-09**: a clarifications session DID run on 2026-05-09 and produced three amendments. (Q1) Array-exact-equality element order — locked to order-sensitive; FR-016 + FR-027 + US3 scenario 4 amended. (Q2) Folder path-traversal closure — locked to schema-level rejection (`VALIDATION_ERROR` for `..` segments or leading `/`); FR-021 + SECURITY edge case + US5 scenario 6 + SC-010 amended. (Q3) Vault-omitted multi-vault behaviour — documented as a known limitation; FR-003 + new UNDERLYING multi-vault edge case + FR-025 amended. The 16 acceptance criteria across [P1] / [P2] / [P3], the six adversarial categories (CONCURRENCY, CONTENT, LIMITS, UNDERLYING, CLIENT-CLASS, SECURITY), and the explicit out-of-scope list defined a near-complete spec surface; the three clarifications closed the deferred-characterisation gap, the security-control choice, and the multi-vault default semantics before plan stage.
- The underlying Obsidian CLI exposes a subcommand whose output supplies enough structure for a typed wrapper to recover a list of matching paths against a frontmatter property + value criterion, without re-walking the vault filesystem in the wrapper. The exact subcommand name, argv shape, value-encoding mechanism (especially for boolean / null / array `value` inputs), and folder-scoping syntax are implementation concerns resolved during the planning phase against `obsidian help`.
- The bridge classifier's existing inheritance for unknown-vault response inspection (introduced in feature 011 and inherited unchanged by features 012 and 013) is applicable to this feature's CLI subcommand. If the underlying response shape differs, the feature's planning phase will surface that as a delta and the unknown-vault classification will be addressed there.
- The post-010 module-layout convention (`src/tools/<name>/{schema,handler,index}.ts` plus co-located tests) is the convention this feature consumes. The `find_by_property` schema departs from the post-010 flat-extension idiom only because this tool does NOT use `target_mode`; the schema is a fresh `z.object().strict()` rather than `applyTargetModeRefinement(targetModeBaseSchema.extend(...))`. No precedent feature's spec or plan is amended.
- The release impact is purely additive: no existing tool's public surface changes; no error codes are added; no ADRs are amended. The version-bump policy (patch — `0.2.6 → 0.2.7`) is a planning-phase decision but the additive shape is a constraint set by this spec.
- Out of scope for this feature, recorded here so the planning phase does not silently absorb them: multi-criterion matching (property A = X AND property B = Y); regex / glob pattern matching on values; returning the matched frontmatter alongside the paths (paths-only contract); hierarchical-tag rollup; comparison operators (`>`, `<`, `!=`); multi-vault aggregation (caller iterates per-vault); the standard `target_mode` discriminator (this tool is inherently vault-wide).
