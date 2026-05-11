# Feature Specification: Write Property — Typed Surgical Frontmatter Write

**Feature Branch**: `018-write-property`
**Created**: 2026-05-10
**Status**: Draft
**Input**: User description: "Add Write Property — A typed MCP tool that sets a single frontmatter property on a vault note, with the value's intended YAML type preserved. Single-key per call; multi-key atomic writes are explicitly out of scope."

## Clarifications

### Session 2026-05-10

- Q: When `write_property` overwrites an existing property whose on-disk type differs from the resolved type (explicit `type` argument, or inferred from `value` shape per FR-008), what's the contract? → A: **Resolved type wins (overwrite)** — the resolved type replaces the existing on-disk type representation. `count: 7` (number) + `write_property({name: "count", value: "abc"})` produces `count: "abc"` (text). The result depends only on the current call's `(name, value, type?)` triple, never on the file's prior state. The wrapper does NOT peek at file state before writing; every write is treated identically. Codified by FR-033, locked into US1 acceptance scenario 12 and US2 acceptance scenario 4, expanded into the FR-030 characterisation roster, and gated by SC-021.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Specific-mode surgical write preserves the value's intended YAML type (Priority: P1)

An agent needs to set a single named frontmatter property (for example `status`, `vault_id`, `updated`, `tags`) on a known note in a known vault, with the value's intended YAML type preserved on disk. The agent calls `write_property` with `target_mode: "specific"`, the vault display name, exactly one locator (`file` or `path`), the property `name`, the property `value`, and (for date / datetime values, optionally for the others) an explicit `type`. The tool writes the property with the YAML representation expected for that type — strings as text, arrays as YAML list lines, numbers as bare numerics, booleans as YAML `true` / `false`, dates and datetimes as the values Obsidian's property-type system recognises — and returns `{ written: true, path, name }` so the caller can verify the write landed on the file it expected.

**Why this priority**: This is the dominant use case. Surgical single-field frontmatter mutations — bumping an `updated:` date, flipping `status:` from `queued` to `shipped`, adding a tag, rotating a `vault_id` during a bootstrap — are the most common write operation an agent performs. Today the only path is a full-file read-modify-write through `read_note` + `write_note`, which is wasteful in tokens (the agent round-trips every line of the file just to flip one field) and risky (mid-file diffs amplify any wrapper-side bug into a whole-file regression). A typed surgical write replaces that round-trip with a single typed call and offloads YAML-serialisation rules from the caller. Without specific-mode support, the typed surface offers no advantage over the existing read-modify-write path; this story alone justifies the feature.

**Independent Test**: Construct fixture notes in a real vault. Call `write_property` once per YAML type the surface supports (text, list, number, checkbox, date with explicit `type`, datetime with explicit `type`). After each call, read the file off disk and assert the YAML representation matches what Obsidian's property-type system expects for that type. Assert the response shape matches `{ written: true, path: <vault-relative path>, name: <echoed name> }`. The story is fully testable in isolation; nothing in P2/P3 is required for it to deliver value.

**Acceptance Scenarios**:

1. **Given** a note in vault `Demo` at `notes/x.md` with no `status` property, **When** the agent calls `write_property({ target_mode: "specific", vault: "Demo", path: "notes/x.md", name: "status", value: "shipped" })`, **Then** the file's frontmatter contains `status: shipped` (or the equivalent quoted form per the YAML serialiser's rules) AND the response is `{ written: true, path: "notes/x.md", name: "status" }`.
2. **Given** a note with no `tags` property, **When** the agent calls `write_property({ ..., name: "tags", value: ["alpha", "beta"] })`, **Then** the file's frontmatter contains a YAML list with `alpha` and `beta` as separate list lines (or the equivalent flow form per Obsidian's preferences) — never a joined-string fallback.
3. **Given** a note with no `count` property, **When** the agent calls `write_property({ ..., name: "count", value: 7 })`, **Then** the file's frontmatter contains `count: 7` as a bare numeric (not the quoted-string form `count: "7"`).
4. **Given** a note with no `archived` property, **When** the agent calls `write_property({ ..., name: "archived", value: true })`, **Then** the file's frontmatter contains `archived: true` as a YAML boolean (not the quoted-string form `archived: "true"`).
5. **Given** a note with no `due` property, **When** the agent calls `write_property({ ..., name: "due", value: "2026-12-31", type: "date" })`, **Then** the file's frontmatter contains the value with the date type recognised by Obsidian's property system AND a subsequent `read_property` call against the same property returns `{ value: "2026-12-31", type: "date" }`.
6. **Given** a note with no `updated` property, **When** the agent calls `write_property({ ..., name: "updated", value: "2026-05-10T14:30:00", type: "datetime" })`, **Then** the file's frontmatter contains the value with the datetime type recognised by Obsidian's property system AND a subsequent `read_property` call returns `{ value: "2026-05-10T14:30:00", type: "datetime" }`.
7. **Given** a note that already defines `status: queued`, **When** the agent calls `write_property({ ..., name: "status", value: "shipped" })`, **Then** the file's frontmatter contains `status: shipped` (the old value is replaced; the call is a single-key set, never an append-to-list or merge).
8. **Given** a note with NO frontmatter block at all (the file's first line is markdown body), **When** the agent calls `write_property({ ..., name: "status", value: "shipped" })`, **Then** the file gains a frontmatter block at the top whose only field is `status: shipped` AND the markdown body below is preserved byte-stable except for the inserted block.
9. **Given** a locator (`file` or `path`) that resolves to no file in the named vault, **When** the agent calls `write_property`, **Then** the call fails with a structured error (the tool MUST NOT auto-create the file — that's the `write_note` surface).
10. **Given** a vault display name that does not match any registered Obsidian vault, **When** the agent calls `write_property`, **Then** the call fails with a structured error (the same reclassified-CLI-response shape that the existing typed tools already use for unknown vaults).
11. **Given** an explicit `type` that contradicts the `value`'s shape (for example `value: "abc"` with `type: "number"`), **When** the agent calls `write_property`, **Then** the call fails with a structured error AND the file is not modified. The wrapper MUST NOT silently coerce the value to fit the declared type.
12. **Given** a note that already defines `count: 7` (a number-typed property), **When** the agent calls `write_property({ ..., name: "count", value: "abc" })` (no explicit `type`; inference resolves to `text`), **Then** the file's frontmatter contains `count: "abc"` with the YAML representation Obsidian's property-type system recognises as `text` AND a subsequent `read_property` call against the same property returns `{ value: "abc", type: "text" }` (not `type: "number"`). The resolved type replaces the existing on-disk type; the result depends only on the current call's `(name, value, type?)` triple, never on the file's prior state.

---

### User Story 2 — Active-mode write against the focused note (Priority: P1)

An agent operating in a session where Obsidian's editor has a specific note focused needs to set a frontmatter property on whichever note is currently focused, without naming a vault or locator. The agent calls `write_property` with `target_mode: "active"`, the property `name`, the property `value`, and (for date / datetime) an explicit `type`. The tool writes the property to the focused note and returns the same `{ written, path, name }` shape as specific-mode, with `path` resolved to the focused note's vault-relative path so the caller can verify which file received the write.

**Why this priority**: Active mode is the standard target-mode discriminator across every typed tool in the project (`read_note`, `write_note`, `delete_note`, `read_property`). Omitting it would create an inconsistency in the typed surface and force agents to fall back to a different tool when the user is mid-editor. Pairs equally with US1 — together they cover the full target-mode discriminator contract.

**Independent Test**: Run Obsidian with a known note focused. Call `write_property({ target_mode: "active", name: "status", value: "shipped" })`. Assert the focused note's frontmatter now carries the property AND the response's `path` field matches the focused note's vault-relative path. Independently testable from US1 because no specific-mode locator is exercised.

**Acceptance Scenarios**:

1. **Given** Obsidian has note `notes/x.md` focused in vault `Demo`, **When** the agent calls `write_property({ target_mode: "active", name: "status", value: "shipped" })`, **Then** the focused note's frontmatter contains `status: shipped` AND the response is `{ written: true, path: "notes/x.md", name: "status" }`.
2. **Given** active mode and no note is focused (or no Obsidian instance is reachable), **When** the agent calls `write_property`, **Then** the call fails with a structured error AND no file is modified.
3. **Given** active mode and a focused note that already defines the property being written, **When** the agent calls `write_property` with a new value, **Then** the focused note's frontmatter overwrites the old value (parity with US1 scenario 7) AND the response carries the focused note's path.
4. **Given** active mode and a focused note that already defines `count: 7` (a number-typed property), **When** the agent calls `write_property({ target_mode: "active", name: "count", value: "abc" })` (no explicit `type`; inference resolves to `text`), **Then** the focused note's frontmatter contains `count: "abc"` as text AND a subsequent `read_property` call returns `{ value: "abc", type: "text" }` (parity with US1 scenario 12 — the resolved type replaces the existing on-disk type in active mode too).

---

### User Story 3 — Validation rejects malformed inputs before the CLI is invoked (Priority: P1)

An agent (or a misbehaving caller) submits an input shape that violates the tool's contract. The tool MUST reject the call at the validation boundary, before any underlying CLI invocation occurs, and MUST surface a structured validation error that names the offending field. No file may be modified by an invalid call.

**Why this priority**: Validation is the safety contract for every typed tool in this project, and it is a constitutional requirement (zod-as-source-of-truth). For a write surface the safety stakes are higher than for a read — a malformed input that reaches the CLI risks corrupting the on-disk frontmatter. Independently testable because every validation case can be exercised with a mock/spy on the CLI dispatcher to assert the dispatcher was never called and no file write occurred.

**Independent Test**: For each invalid input shape, call `write_property` with a CLI dispatcher spy. Assert the call rejects with a structured validation error AND the dispatcher was never invoked. No real CLI or vault required.

**Acceptance Scenarios**:

1. **Given** `target_mode: "specific"` with NO `file` and NO `path`, **When** the agent calls `write_property`, **Then** the call fails validation; no CLI call is made.
2. **Given** `target_mode: "specific"` with BOTH `file` and `path` set, **When** the agent calls `write_property`, **Then** the call fails validation; no CLI call is made.
3. **Given** `target_mode: "specific"` with no `vault`, **When** the agent calls `write_property`, **Then** the call fails validation; no CLI call is made.
4. **Given** `name` is the empty string `""`, **When** the agent calls `write_property`, **Then** the call fails validation; no CLI call is made.
5. **Given** `name` is omitted entirely, **When** the agent calls `write_property`, **Then** the call fails validation; no CLI call is made.
6. **Given** `value` is omitted entirely, **When** the agent calls `write_property`, **Then** the call fails validation; no CLI call is made.
7. **Given** `value` is a shape outside the supported union (e.g. an object, `null`, an array containing non-strings), **When** the agent calls `write_property`, **Then** the call fails validation; no CLI call is made.
8. **Given** `type` is a string outside the enumerated set, **When** the agent calls `write_property`, **Then** the call fails validation; no CLI call is made.
9. **Given** `target_mode: "active"` with `vault` set, **When** the agent calls `write_property`, **Then** the call fails validation; no CLI call is made.
10. **Given** `target_mode: "active"` with `file` set, **When** the agent calls `write_property`, **Then** the call fails validation; no CLI call is made.
11. **Given** `target_mode: "active"` with `path` set, **When** the agent calls `write_property`, **Then** the call fails validation; no CLI call is made.
12. **Given** any input with an unknown top-level key (for example `{ target_mode: "active", name: "x", value: "y", foo: "bar" }`), **When** the call is forwarded by an MCP client that does NOT strip unknown keys, **Then** the server-side validation fails; no CLI call is made.

---

### User Story 4 — Documentation surface for the typed tool (Priority: P2)

An operator or agent inspects the project's progressive-disclosure help facility to understand how `write_property` works. The current placeholder stub for `write_property` (or the absence of any entry) MUST be replaced with full documentation that covers the per-field input contract, the output shape, the failure-mode roster, and at least four worked examples — one per non-trivial YAML type the tool handles.

**Why this priority**: The help facility is the primary discovery surface for tool consumers (mirrored from `read_note` / `write_note` / `delete_note` / `read_property` / `find_by_property` / `read_heading`). The tool is callable without docs but un-discoverable without them. Should-pass for ship; not required for the write code path itself to function. Independently testable by loading the help facility output and asserting structural completeness.

**Independent Test**: Invoke the help facility for `write_property`. Assert the doc carries: input contract per field (including the type-inference rules and the date/datetime explicit-type requirement), output shape, failure-mode roster, and at least four worked examples covering distinct YAML types. The registry-consistency test from `005-help-tool` already auto-asserts the file's existence once the tool is registered; this story expands that assertion to content completeness.

**Acceptance Scenarios**:

1. **Given** the help facility, **When** an operator queries `write_property`, **Then** the response carries the full per-field input contract (target_mode, vault, file, path, name, value, type), the type-inference rules, the date/datetime explicit-type requirement, the output shape, the failure-mode roster, and at least four worked examples covering at least four distinct YAML types from {text, list, number, checkbox, date, datetime}.

---

### User Story 5 — Empty-list write produces a valid empty YAML list (Priority: P3)

An agent needs to set a list-typed property to an empty value — for example clearing a `tags:` field that previously had entries. The tool MUST write a valid empty YAML list (e.g. `tags: []`), not interpret the empty array as "remove the property" and not silently substitute `null` or an absent field.

**Why this priority**: This is an explicit P3 in the user input. The shape is uncommon but operationally meaningful (clearing a list is distinct from removing a list). Independently testable because it requires only one fixture file and one input.

**Independent Test**: Author a fixture note. Call `write_property({ target_mode: "specific", vault: "Demo", path: "notes/x.md", name: "tags", value: [] })`. Assert the file's frontmatter contains a valid empty YAML list for `tags` AND a subsequent `read_property` call returns `{ value: [], type: "list" }`.

**Acceptance Scenarios**:

1. **Given** a note with no `tags` property, **When** the agent calls `write_property` with `value: []`, **Then** the file's frontmatter contains a valid empty YAML list under `tags` (the property is added, not omitted; `null` is NOT substituted).
2. **Given** a note that already defines `tags: [alpha, beta]`, **When** the agent calls `write_property` with `value: []`, **Then** the file's frontmatter contains an empty list under `tags` (the previous values are replaced; the property is NOT removed).

---

### Edge Cases

The implementation MUST handle, document, or explicitly defer each of the following observable shapes.

**CONCURRENCY**

- Two concurrent `write_property` calls to the same file (same `name` OR different `name`) MUST NOT race in a way that produces a malformed frontmatter block. The wrapper composes one atomic-from-the-caller's-perspective write per call; the underlying serialiser's atomicity guarantees and any observed interleaving behaviour MUST be characterised during the live-CLI characterisation pass and documented in the feature's research artefact.
- `write_property` against a file that an external editor (Obsidian itself, or another editor process) currently has open MAY produce observable behaviour the wrapper does not control — Obsidian may reload, the OS may reject the write, or the editor's in-memory copy may overwrite the on-disk write on save. The observed behaviour MUST be characterised and documented; the wrapper does NOT introduce file-locking or coordination beyond what the underlying serialiser provides.
- Active-mode TOCTOU: the focused note may change between the validation step and the write. The contract is a point-in-time write — the response's `path` field reports which file actually received the write at execution time, so the caller can detect the case where the focus shifted between submission and execution.

**CONTENT — type / value contradictions**

- A `value` shape that contradicts the explicit `type` (for example `value: "abc"` with `type: "number"`, or `value: 7` with `type: "list"`) MUST surface a structured error. The wrapper MUST NOT silently coerce the value to fit the declared type, and MUST NOT write a malformed YAML representation. Whether the rejection happens at the validation boundary or at the underlying serialiser layer is an implementation choice; either way the response surface is a structured error AND the file is not modified.

**CONTENT — type-inference ambiguity**

- A string `value` whose shape happens to parse as an ISO date or datetime, passed without an explicit `type`, is inferred as `text` per the inference rules (boolean → checkbox, number → number, string[] → list, string → text). Callers who intend a date or datetime MUST pass `type: "date"` or `type: "datetime"` explicitly. This is a documented, deliberate rule, not a bug — it preserves the principle that inference depends only on the JavaScript shape of `value`, never on string parsing heuristics.

**CONTENT — heterogeneous lists**

- A `value` that is a heterogeneous array (for example `["a", 1, true]`) is rejected at the validation boundary because the input schema admits only `string[]` for the array branch of the value union. Callers needing heterogeneous lists are deferred to the universal escape hatch (`obsidian_exec`) or to a future feature; documented as an explicit out-of-scope shape for the typed `write_property` surface.

**CONTENT — exotic property names**

- A property name containing dots (`.`), dashes (`-`), colons (`:`), or other punctuation MUST be passed through to the underlying CLI verbatim. The wrapper does NOT sanitise, escape, or rewrite the name. Whatever the underlying serialiser produces (a successful write, a structural error from the CLI, or a YAML that quotes the key) is the contracted behaviour. Observed behaviour for each special-character class MUST be characterised during the live-CLI characterisation pass.

**CONTENT — YAML control characters in values**

- A string `value` that contains YAML control characters (`#`, `:`, leading `!`, leading `&`, leading `*`, leading `?`, leading `|`, leading `>`) MUST be quoted or escaped on disk such that the on-disk YAML round-trips through any compliant YAML parser. The wrapper relies on the underlying serialiser to choose the quoting style; whichever style it picks (single-quoted, double-quoted, plain with escapes) is acceptable as long as the round-trip property holds.

**CONTENT — preserving neighbouring frontmatter**

- A frontmatter block that already has YAML anchors (`&name`), aliases (`*name`), or comments MUST have its untouched neighbouring fields preserved. The wrapper writes only the named property; everything else in the frontmatter block stays byte-stable to whatever degree the underlying serialiser supports. Any observed flattening, reordering, or comment-stripping by the underlying serialiser MUST be characterised and documented as a known limitation.

**CONTENT — line endings**

- CRLF and LF line endings on the on-disk file MUST be preserved through the write. A note saved with Windows-style CRLF endings MUST remain CRLF after the write; a note saved with Unix-style LF endings MUST remain LF. The wrapper MUST NOT silently convert one to the other.

**CONTENT — file with no frontmatter block**

- A file whose first line is markdown body (no leading `---` fence) MUST gain a frontmatter block at the top whose only field is the property being written, AND the markdown body below MUST be preserved byte-stable except for the inserted block.

**CONTENT — empty list (P3)**

- A `value: []` MUST write a valid empty YAML list (e.g. `tags: []`), not interpret the empty array as "remove the property" and not substitute `null` or omit the field. See US5.

**CONTENT — type-conversion-on-overwrite (cross-type retype)**

- Overwriting a property whose existing on-disk type differs from the resolved type (explicit `type` argument, or inferred from `value` shape per FR-008) MUST replace the existing on-disk type with the resolved type. The wrapper does NOT peek at the file's prior state; every write is treated identically, and the result depends only on the current call's `(name, value, type?)` triple. Example: a file containing `count: 7` (number) targeted by `write_property({ name: "count", value: "abc" })` (no explicit `type`; inference → `text`) ends up with `count: "abc"` (text); a subsequent `read_property` returns `{ value: "abc", type: "text" }`. Codified by FR-033 and locked into US1 acceptance scenario 12 plus US2 acceptance scenario 4.

**UNDERLYING CLI — unknown vault**

- An unknown vault display name may produce a CLI response that the existing bridge classifier does not natively treat as an error (the same shape covered for `delete_note` / `write_note` / `read_property` / `find_by_property` / `read_heading` via 011-R5 inheritance). The implementation MUST handle this case explicitly: the response MUST be reclassified to a structured `CLI_REPORTED_ERROR`, not silently returned as a successful write.

**UNDERLYING CLI — non-existent file**

- A locator that resolves to no file in the named vault MUST surface a structured error. The tool MUST NOT auto-create the missing file — auto-creation is the `write_note` surface, not `write_property`. Whether the structural error originates from the validation layer (a pre-flight existence check) or the underlying CLI (a CLI-reported error reclassified by the bridge) is an implementation choice; either way the response is a structured error and no file is created or modified.

**CLIENT-CLASS — unknown-key validation**

- The server-side validation behaviour for "unknown top-level keys" (US3 scenario 12) is directly observable only from MCP clients that forward unknown keys to the server. Strict-naive clients strip unknown keys client-side per the published JSON Schema's `additionalProperties: false`, in which case the server never sees the offending key and validation does not trigger. Both pathways MUST be documented; the test case MUST exercise the server-side path explicitly so the validation contract holds for the client class that does forward unknown keys.

**SECURITY — argv passing**

- The `name` and `value` fields are caller-supplied. They MUST be passed through to the underlying CLI as discrete argv parameters, not interpolated into a shell command, an `eval` call, or any other text-based execution surface. Argv-array passing prevents shell-metacharacter and command-injection attacks structurally; no per-field sanitisation of `name` or `value` is required for that threat model. There is no eval-injection vector because this surface composes via a typed CLI subcommand, not an `eval` invocation (in contrast to the eval-composing surfaces such as `find_by_property` and `read_heading`).

**SECURITY — path traversal**

- The `path` input is caller-supplied. Path-traversal attempts (e.g. `path: "../../etc/passwd"`, `path: "../OtherVault/secret.md"`) MUST either be rejected at the validation boundary or verified to be rejected by the underlying CLI's vault-confinement check. The wrapper MUST NOT pass an out-of-vault path through to a write that lands on disk outside the named vault. Observed behaviour MUST be characterised during the live-CLI characterisation pass; if the underlying CLI is the rejection layer, the bridge classifier's mapping of that rejection to a structured error MUST be verified.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose a typed MCP tool named `write_property` that sets a single named frontmatter property on a vault note.
- **FR-002**: The tool MUST accept a `target_mode` discriminator with the values `"specific"` and `"active"`, mirroring the discriminator contract used by every other typed tool in the project.
- **FR-003**: In `target_mode: "specific"`, the tool MUST require a `vault` display name AND exactly one locator field — either `file` (wikilink form, no extension, no folder) or `path` (vault-relative path including the `.md` extension), never both, never neither.
- **FR-004**: In `target_mode: "active"`, the tool MUST forbid the keys `vault`, `file`, and `path`. Presence of any of those keys in active mode MUST produce a validation failure.
- **FR-005**: The tool MUST require a `name` field (a non-empty string) in both modes. The empty string and the absence of `name` MUST both produce validation failures.
- **FR-006**: The tool MUST require a `value` field whose shape is one of: `string`, `number`, `boolean`, `string[]`. Any other shape (object, `null`, heterogeneous array, array of non-strings, omitted) MUST produce a validation failure.
- **FR-007**: The tool MUST accept an optional `type` field whose value, when present, is one of `"text" | "list" | "number" | "checkbox" | "date" | "datetime"`. A `type` value outside that enumeration MUST produce a validation failure.
- **FR-008**: When `type` is omitted, the tool MUST infer the type from the `value`'s shape using the rule set: `boolean` → `checkbox`; `number` → `number`; `string[]` → `list`; `string` → `text`. Inference depends only on the JavaScript shape of `value`, never on string-parsing heuristics.
- **FR-009**: A string `value` intended to be written as a date or datetime MUST be accompanied by an explicit `type: "date"` or `type: "datetime"`, because the JavaScript shape of `value` (a string) is indistinguishable from a text value. Without an explicit `type`, such a value is written as text per FR-008. This is a documented, deliberate rule.
- **FR-010**: The tool's input schema MUST forbid unknown top-level keys (`additionalProperties: false`).
- **FR-011**: The tool MUST return an output object with three fields: `written` (the literal `true`), `path` (the vault-relative path of the file that received the write), and `name` (the property name written, echoed for caller verification).
- **FR-012**: A `value` shape that contradicts the explicit `type` (for example `value: "abc"` with `type: "number"`) MUST surface a structured error. The wrapper MUST NOT silently coerce the value to fit the declared type. Whether the rejection happens at the validation boundary or at the underlying serialiser layer is an implementation choice; either way the response surface is a structured error AND the file is not modified.
- **FR-013**: Setting a property that does not yet exist on the file MUST add it to the frontmatter block.
- **FR-014**: Setting a property that already exists MUST overwrite the old value. The contract is a single-key set — never an append-to-list, never a merge. "Overwrite" extends to the on-disk type representation per FR-033: the resolved type (explicit, or inferred from `value` shape) replaces the existing on-disk type, not only the value.
- **FR-015**: Setting a property on a file that has no frontmatter block MUST add a frontmatter block at the top of the file whose only field is the property being written. The markdown body below MUST be preserved byte-stable except for the inserted block.
- **FR-016**: Setting a property on a non-existent file MUST surface a structured error. The tool MUST NOT auto-create the missing file — auto-creation is the `write_note` surface.
- **FR-017**: All validation failures MUST occur strictly before any underlying CLI invocation. Tests MUST be able to assert a CLI dispatcher spy was never called for invalid inputs.
- **FR-018**: A `value: []` (empty array) MUST write a valid empty YAML list. The wrapper MUST NOT interpret the empty array as "remove the property", MUST NOT substitute `null`, and MUST NOT omit the field.
- **FR-019**: The `name` field MUST be passed through to the underlying CLI verbatim, with no wrapper-side sanitisation, escaping, or rewriting. Property names containing dots, dashes, or colons are the underlying CLI / YAML parser's responsibility.
- **FR-020**: The `name` and `value` fields MUST be passed to the underlying CLI as discrete argv parameters, not interpolated into any shell-evaluated string. The argv-passing contract is the structural anti-injection guarantee.
- **FR-021**: A string `value` containing YAML control characters (`#`, `:`, leading `!`, leading `&`, leading `*`, leading `?`, leading `|`, leading `>`) MUST be quoted or escaped on disk such that the on-disk YAML round-trips through any compliant YAML parser. The wrapper relies on the underlying serialiser to choose the quoting style; the round-trip property is the contracted behaviour, not the specific quoting style.
- **FR-022**: A frontmatter block that already contains YAML anchors, aliases, or comments MUST have its untouched neighbouring fields preserved. The wrapper writes only the named property; everything else in the frontmatter block stays byte-stable to whatever degree the underlying serialiser supports. Any observed flattening, reordering, or comment-stripping by the underlying serialiser MUST be characterised during the live-CLI characterisation pass and documented as a known limitation.
- **FR-023**: CRLF and LF line endings on the on-disk file MUST be preserved through the write. A note saved with Windows-style CRLF endings MUST remain CRLF after the write; a note saved with Unix-style LF endings MUST remain LF.
- **FR-024**: The tool MUST surface a structured error in `target_mode: "active"` when no note is focused (or no Obsidian instance is reachable).
- **FR-025**: The tool MUST surface a structured error when the named vault does not match any registered Obsidian vault. If the underlying CLI returns a non-error-shaped response for unknown vaults, the implementation MUST reclassify that response to `CLI_REPORTED_ERROR` before returning to the caller.
- **FR-026**: Path-traversal attempts on the `path` field MUST either be rejected at the validation boundary or verified to be rejected by the underlying CLI's vault-confinement check. The wrapper MUST NOT pass an out-of-vault path through to a write that lands on disk outside the named vault.
- **FR-027**: Errors MUST flow through the project's existing structured error codes — no new error codes MUST be introduced by this feature. Validation failures MUST surface as `VALIDATION_ERROR`; CLI failures MUST surface through the existing four CLI-failure codes.
- **FR-028**: The tool MUST be registered through the project's existing typed-tool registration factory. The progressive-disclosure help facility's documentation file for `write_property` MUST be authored with the per-field input contract (including the type-inference rules and the date/datetime explicit-type requirement), the output shape, the failure-mode roster, and at least four worked examples covering at least four distinct YAML types.
- **FR-029**: Each acceptance criterion across US1–US5 MUST be locked by at least one regression test that survives subsequent re-runs unchanged. The test count MUST be sufficient to cover schema validation, handler behaviour, and registration consistency.
- **FR-030**: The feature MUST run a live-CLI characterisation pass before ship that documents observable CLI behaviour for each of the following cases. Findings MUST be persisted in the feature's research artefact.
  - Setting a text, list, number, checkbox property (one happy-path case per type).
  - Setting a date property with `type: "date"` and a datetime property with `type: "datetime"` — confirms the date / datetime type label is recognised by Obsidian's property system on round-trip via `read_property`.
  - Setting a property that does not yet exist on the file (US1 scenario 1).
  - Setting a property that already exists (US1 scenario 7).
  - Cross-type overwrite — overwriting a property whose existing on-disk type differs from the resolved type (US1 scenario 12 / US2 scenario 4; e.g. `count: 7` (number) overwritten by `write_property({ name: "count", value: "abc" })` → confirms the resolved type replaces the existing on-disk type per FR-033 and that a subsequent `read_property` returns the new type).
  - Setting a property on a file with no frontmatter block (US1 scenario 8).
  - Setting an empty list (US5 scenarios 1 and 2).
  - Setting a property with a YAML-control-character value (one case per: contains `#`, contains `:`, leading `!`, leading `&`, leading `*`, leading `?`, leading `|`, leading `>`) — confirms round-trip through a compliant YAML parser.
  - Setting a property whose name contains a dot, a dash, and a colon (one case per character class) — confirms whether the underlying CLI accepts or rejects.
  - Type-vs-value contradiction (e.g. `value: "abc"` with `type: "number"`) — confirms whether the rejection layer is the wrapper or the underlying serialiser.
  - Setting a property on a file that has YAML anchors / aliases / comments in its frontmatter — confirms whether the underlying serialiser flattens, reorders, or strips comments.
  - CRLF and LF round-trip (one case per line-ending convention).
  - Setting a property on a non-existent file — confirms the structured-error path and that no file is auto-created.
  - Setting a property with an unknown vault display name — confirms the unknown-vault reclassification path.
  - Path-traversal on `path` (e.g. `path: "../OtherVault/secret.md"`) — confirms whether the rejection layer is the wrapper or the underlying CLI.
  - Two concurrent writes to the same file (same `name` and different `name`) — confirms the underlying serialiser's atomicity guarantees and any observed interleaving behaviour.
  - `write_property` against a file that an external editor currently has open — confirms reload / rejection / overwrite behaviour.
- **FR-031**: The feature MUST NOT change the public surface of any existing typed tool (`read_note`, `write_note`, `delete_note`, `read_property`, `find_by_property`, `read_heading`, `obsidian_exec`, the help tool). The only permitted edit to existing source is the addition of `write_property` to the registration list.
- **FR-032**: All new source files introduced by this feature MUST carry the project's "Original — no upstream." attribution header per the project Constitution's originality principle.
- **FR-033**: When `write_property` overwrites an existing property whose on-disk type differs from the resolved type (explicit `type` argument, or inferred from `value` shape per FR-008), the resolved type MUST replace the existing on-disk type representation. The result depends only on the current call's `(name, value, type?)` triple, never on the file's prior state. The wrapper MUST NOT peek at file state before writing to "preserve" the existing type; every write is treated identically. Verified at the live-CLI characterisation pass (FR-030) and gated by SC-021.

### Key Entities *(include if feature involves data)*

- **Frontmatter property write request**: A single named property to set on a single vault note. Carries the property's `name` (non-empty string), the property's `value` (string, number, boolean, or string-array), and (optionally for non-date/datetime; required for date/datetime) the YAML-type label `type` — one of `"text" | "list" | "number" | "checkbox" | "date" | "datetime"`. The request targets either a specific note (specific mode — `vault` plus exactly one of `file` / `path`) or the focused note (active mode — no `vault`, `file`, or `path`).
- **Property type label**: A string drawn from the set `{ "text", "list", "number", "checkbox", "date", "datetime" }` that names the YAML type Obsidian's property-type system should recognise on the written value. When omitted, inferred from the JavaScript shape of `value` per FR-008. There is no `"unknown"` label on the write side — `"unknown"` is a read-side fallback for shapes the property-type system cannot resolve, never an input on the write side.
- **Locator (specific mode)**: An ordered triple of (vault display name, choice of `file`-vs-`path`, locator value). The `file` form names a note by its wikilink (no extension, no folder); the `path` form names a note by its vault-relative path including the `.md` extension. Exactly one of `file` or `path` MUST be provided. The locator MUST resolve to an existing file — `write_property` does not auto-create.
- **Focused-note reference (active mode)**: An implicit reference to whichever note Obsidian's editor currently has focused. Resolved by the underlying CLI at execution time; not addressable by the caller through any input field. The response's `path` field reports which file actually received the write so the caller can detect the active-mode TOCTOU case.
- **Write response**: An object with three fields: `written` (the literal `true` — the success-shape marker), `path` (the vault-relative path of the file that received the write), and `name` (the property name written, echoed for caller verification). The response is the only success-path return value; any failure surfaces as a structured error, never as a `{ written: false, ... }` shape.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Setting a text frontmatter property writes the string value with the YAML representation Obsidian's property-type system recognises as `text`, and a subsequent `read_property` call against the same property returns `{ value: <input>, type: "text" }` in 100% of test runs.
- **SC-002**: Setting a list frontmatter property writes each element on a YAML list line (or the equivalent flow form per Obsidian's preferences) AND a subsequent `read_property` call returns `{ value: [...], type: "list" }` in 100% of test runs.
- **SC-003**: Setting a number frontmatter property writes the numeric value (not the quoted-string form) AND a subsequent `read_property` call returns `{ value: <number>, type: "number" }` in 100% of test runs.
- **SC-004**: Setting a boolean frontmatter property writes `true` or `false` as a YAML boolean (not the quoted-string form) AND a subsequent `read_property` call returns `{ value: <boolean>, type: "checkbox" }` in 100% of test runs.
- **SC-005**: Setting a date property with `type: "date"` and a datetime property with `type: "datetime"` writes the value with the corresponding type recognised by Obsidian's property system AND a subsequent `read_property` call returns the matching `type` label in 100% of test runs.
- **SC-006**: Setting a property that does not yet exist on the file adds it to the frontmatter block; setting a property that already exists overwrites the old value; setting a property on a file with no frontmatter block adds a frontmatter block whose only field is the property being written. Each of these three outcomes is locked by at least one passing regression test.
- **SC-007**: Setting a property on a non-existent file fails with a structured error AND no file is created at the locator's path in 100% of test runs.
- **SC-008**: Every invalid input shape rejected at the validation boundary (US3 scenarios 1–12) produces a structured error AND zero underlying CLI invocations AND zero on-disk file modifications across 100% of test runs.
- **SC-009**: A `value` that contradicts the explicit `type` (e.g. `value: "abc"` with `type: "number"`) produces a structured error AND no on-disk file modification in 100% of test runs.
- **SC-010**: A `value: []` writes a valid empty YAML list AND a subsequent `read_property` call returns `{ value: [], type: "list" }` in 100% of test runs.
- **SC-011**: A string `value` containing YAML control characters round-trips through a compliant YAML parser without loss in 100% of test runs.
- **SC-012**: CRLF and LF line endings on the on-disk file are preserved through the write — a CRLF-encoded note remains CRLF after the write; an LF-encoded note remains LF — in 100% of test runs.
- **SC-013**: Every byte of the public output of the existing typed tools (`read_note`, `write_note`, `delete_note`, `read_property`, `find_by_property`, `read_heading`, `obsidian_exec`, the help tool) is unchanged by this feature, except for the help facility growing one new `write_property` entry.
- **SC-014**: The published documentation for `write_property` covers the full per-field input contract (including type-inference rules and the date/datetime explicit-type requirement), output shape, failure-mode roster, and at least four worked examples covering at least four distinct YAML types.
- **SC-015**: Every acceptance criterion across US1–US5 is locked by at least one regression test, totalling no fewer than 30 tests across schema, handler, and registration suites.
- **SC-016**: Zero new error codes are introduced by this feature; every failure flows through existing structured error codes.
- **SC-017**: The live-CLI characterisation pass (FR-030) documents observable behaviour for every enumerated case, persisted in the feature's research artefact and surfaceable from the published documentation.
- **SC-018**: An agent setting a single named frontmatter property can do so in a single tool call returning ≤ ~150 characters of structured response on the success path, replacing what previously required a full-file `read_note` plus a full-file `write_note` round-trip. Token saving relative to the round-trip is observable from any tracing layer that records request/response payload sizes.
- **SC-019**: The `name` and `value` inputs cannot reach a shell-evaluated context. The argv-passing contract is structurally enforced by the underlying CLI invocation surface, and is verifiable by inspection of the dispatcher call shape (no shell, no eval, no string interpolation).
- **SC-020**: Path-traversal attempts on the `path` field do not produce on-disk writes outside the named vault in 100% of test runs.
- **SC-021**: Overwriting an existing property with a write whose resolved type differs from the on-disk type produces a file where a subsequent `read_property` returns the new resolved type (not the prior on-disk type) in 100% of test runs. Verified across at least three cross-type retype pairs: number → text, text → number, list → text.

## Assumptions

- The user input is exhaustive for ship-gating decisions: no clarifications session is required (`/speckit-clarify` is not needed). The 19 acceptance criteria across [P1] / [P2] / [P3], the six adversarial categories (CONCURRENCY, CONTENT/TYPE, UNDERLYING CLI, CLIENT-CLASS, SECURITY), and the explicit out-of-scope list define a complete spec surface for the planning phase to consume.
- The underlying Obsidian CLI exposes a subcommand whose argv shape supplies enough structure for a typed wrapper to write a single named property with an explicit type label without re-emitting YAML in the wrapper. The exact subcommand name and argv shape are an implementation concern resolved during the planning phase against `obsidian help`.
- The bridge classifier's existing inheritance for unknown-vault response inspection (introduced in feature 011 and inherited unchanged by features 012 / 013 / 014 / 015) is applicable to this feature's CLI subcommand. If the underlying response shape differs, the feature's planning phase will surface that as a delta and the unknown-vault classification will be addressed there.
- The post-010 flat-extension idiom for `target_mode` schemas (single `z.object().strict().superRefine(...)` plus `applyTargetModeRefinement`) and the post-011 module-layout convention (`index.ts` factory + co-located tests) are the conventions this feature consumes. No precedent feature's spec or plan is amended.
- The project's standard target-mode discriminator semantics defined in `.decisions/ADR-003 - Enforce Target Mode in Typed Tools.md` apply unchanged: `write_property` operates on a single named file or the focused file, exactly the surface ADR-003 governs. The ADR is NOT amended.
- The release impact is purely additive: no existing tool's public surface changes; no error codes are added; no ADRs are amended. The version bump policy (patch — typed-surface addition) is a planning-phase decision but the additive shape is a constraint set by this spec.
- Out of scope for this feature, recorded here so the planning phase does not silently absorb them: multi-key atomic writes (callers iterate today; a future feature would compose differently); property removal (separate future feature, or use the `obsidian_exec` escape hatch); setting a property on multiple files at once (callers iterate; or a future batch feature); list-element append / remove / reorder (single-key set is the only operation; mutating list contents in place requires a future feature); auto-create the target file (that's the `write_note` surface; this tool assumes the target exists or has frontmatter to mutate); heterogeneous-typed list values (rejected at the validation boundary because the input schema admits only `string[]`; callers needing heterogeneous lists are deferred to `obsidian_exec` or a future feature).
