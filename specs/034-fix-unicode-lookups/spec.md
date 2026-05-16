# Feature Specification: Fix Unicode Lookups

**Feature Branch**: `034-fix-unicode-lookups`
**Created**: 2026-05-17
**Status**: Draft
**Input**: User description: "Fix Unicode Lookups — the three lookup operations that accept a user-supplied string identifier (`read_heading`, `read_property`, `find_by_property`) match identifiers correctly when the identifier contains characters outside the basic ASCII range, instead of silently returning not-found / empty-result responses for inputs that are present in the underlying vault content."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Heading lookup resolves non-ASCII titles (Priority: P1)

An agent calls `read_heading` with a heading path whose deepest segment contains a non-ASCII character — for example, an em-dash separating an ID prefix from a descriptive title, an accented letter in a proper noun, a CJK character in a section header, or an emoji used as a tag. Today the lookup fails silently and returns a "heading not found" response even though the heading is physically present in the note. After this change, the lookup matches the heading and returns the section's body content.

**Why this priority**: This is the most-exercised non-ASCII lookup case in real-world vault content, and it is the case the project itself surfaces immediately — every heading title in this project's own working notes uses an em-dash separator between an ID prefix and the descriptive title, which means the defect blocks every heading lookup an agent attempts against this project's own notes. Fixing `read_heading` is the largest unlocked surface for the smallest scope change, so it ships first.

**Independent Test**: Place a note in the test vault whose heading title contains an em-dash (and a second note whose heading nests an ASCII-only segment under one containing a CJK character or accented letter). Call `read_heading` against each through the public MCP interface. The first call returns the body content of the em-dash section; the second returns the body content of the deepest segment. A separate call with a pure-ASCII heading path still succeeds, confirming no regression.

**Acceptance Scenarios**:

1. **Given** a vault note whose heading title contains an em-dash, **When** an agent calls `read_heading` with that exact heading text in the heading path, **Then** the response contains the section's body content rather than a "heading not found" error.
2. **Given** a vault note whose heading title contains an accented letter, a CJK character, or an emoji, **When** an agent calls `read_heading` with that exact heading text in the heading path, **Then** the response contains the section's body content rather than a "heading not found" error.
3. **Given** a vault note whose nested heading path mixes ASCII-only segments with at least one segment containing a non-ASCII character, **When** an agent calls `read_heading` with the full path, **Then** the lookup matches and returns the body content of the deepest segment.
4. **Given** a heading-path input whose characters all fall within the basic ASCII range, **When** an agent calls `read_heading`, **Then** the lookup behaviour is unchanged from current behaviour and existing successful cases continue to succeed.

---

### User Story 2 — Property-by-name lookup resolves non-ASCII keys (Priority: P2)

An agent calls `read_property` against a note whose frontmatter contains a property whose name includes non-ASCII characters — a language-native key (e.g., a Japanese, Arabic, or Cyrillic identifier), or an English key styled with an accented letter or em-dash. Today the lookup returns the "property absent" sentinel even though the property exists in the frontmatter. After this change, the lookup returns the property's value and resolved type.

**Why this priority**: Property-name lookups are less frequent than heading lookups in this project's own corpus, but they remain a blocker for any vault that uses language-native frontmatter keys. The fix shares the same root cause as Story 1 but is verified through a different handler, so it earns its own independent slice.

**Independent Test**: Place a note in the test vault whose frontmatter declares a property with a non-ASCII name and a non-empty value. Call `read_property` against it through the public MCP interface with the exact key. The response carries the value and resolved type. A separate call against an ASCII-named property continues to succeed.

**Acceptance Scenarios**:

1. **Given** a vault note whose frontmatter contains a property whose name includes non-ASCII characters, **When** an agent calls `read_property` with that exact key as the name input, **Then** the response carries the property's value and resolved type rather than the "property absent" sentinel.
2. **Given** a property-name input whose characters all fall within the basic ASCII range, **When** an agent calls `read_property`, **Then** behaviour is unchanged from current behaviour and existing successful cases continue to succeed.

---

### User Story 3 — Find-by-value lookup matches non-ASCII values (Priority: P3)

An agent calls `find_by_property` searching for a value whose text contains non-ASCII characters — an accented proper noun, a CJK title, an em-dash-separated tag, an emoji descriptor. Today the matcher returns an empty result set even though one or more notes carry that exact value in their frontmatter. After this change, the matcher returns the path of every matching note and excludes notes that carry a different value under the same property name.

**Why this priority**: Find-by-value is the rarest invocation of the three affected handlers in the current usage pattern, but its failure mode is the most insidious — an empty match list is indistinguishable from "no such note exists," which leads agents to give up on present data without any error signal. Fixing it last keeps the change scope small per slice but closes the last reachable surface of the same defect class.

**Independent Test**: Place two notes in the test vault: one whose frontmatter property carries a non-ASCII value, and one whose frontmatter carries the same property name but an ASCII value. Call `find_by_property` with the non-ASCII value through the public MCP interface. The response includes the first note's path and excludes the second. A separate call against an ASCII value continues to succeed and excludes the non-ASCII note.

**Acceptance Scenarios**:

1. **Given** a vault note whose frontmatter property carries a value containing non-ASCII characters, **When** an agent calls `find_by_property` with the same exact value text, **Then** the response includes that note's path in the matches.
2. **Given** a vault containing the same property name across two notes — one note carrying a non-ASCII value and one carrying an ASCII value — **When** an agent calls `find_by_property` with the non-ASCII value, **Then** the response includes only the note carrying the non-ASCII value.
3. **Given** a property-value input whose characters all fall within the basic ASCII range, **When** an agent calls `find_by_property`, **Then** behaviour is unchanged from current behaviour and existing successful cases continue to succeed.

---

### Edge Cases

- A heading path whose **every** segment contains non-ASCII characters (no ASCII anchor) still resolves to the deepest segment's body content.
- A property name whose only non-ASCII content is a single combining-mark character (e.g., a base letter plus a separate combining accent) matches a stored key that carries the same characters in the same order — match fidelity is "exact characters as received," not normalisation-equivalence. Notes whose stored keys differ in normalisation form from the input are not expected to match by this change alone.
- A `find_by_property` value containing a surrogate pair (e.g., a non-BMP emoji such as a flag sequence or a CJK supplementary-plane character) matches a stored value carrying the same code points.
- An input that contains both ASCII and non-ASCII characters interleaved (e.g., an em-dash between two ASCII words) matches a stored identifier with the same interleaving.
- An input identifier that, after correct decoding, equals an ASCII-only string already matched by current behaviour continues to match — no regression on existing ASCII-only successes.
- An input that does not name any heading, property, or value in the vault still returns the existing "not found" / empty response shape — the change does not invent matches; it only stops corrupting inputs that should have matched.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `read_heading` lookup MUST match a heading whose title segment, as authored in the note's source, contains one or more characters outside the basic ASCII range, when the caller supplies that exact heading text in the heading-path input.
- **FR-002**: The `read_heading` lookup MUST match a nested heading path in which any subset of segments — including a single intermediate segment — contains non-ASCII characters, when the caller supplies the full nested path.
- **FR-003**: The `read_property` lookup MUST match a frontmatter property whose key, as authored in the note's frontmatter, contains one or more characters outside the basic ASCII range, when the caller supplies that exact key as the name input.
- **FR-004**: The `find_by_property` lookup MUST include a note in its result set when the caller-supplied value contains non-ASCII characters and the note's frontmatter property carries that same exact value text.
- **FR-005**: The `find_by_property` lookup MUST exclude notes whose value under the requested property name differs from the caller-supplied non-ASCII value, including notes whose value is an ASCII-only string while the input is non-ASCII.
- **FR-006**: The three lookup operations MUST preserve their existing behaviour for inputs whose characters all fall within the basic ASCII range — every input that succeeds today continues to succeed after this change, and every input that legitimately resolves to "not found" / empty today continues to do so.
- **FR-007**: The three lookup operations MUST continue to emit their existing response shapes, error envelopes, and error codes for both success and failure cases — this change does not introduce, remove, or rename any response field, sentinel value, or error code.
- **FR-008**: The fix MUST be confined to the three affected operations (`read_heading`, `read_property`, `find_by_property`) — operations that are not affected today (`read`, `write_note`, `delete`, `obsidian_exec`, `help`, `files`) continue to behave as they do today.
- **FR-009**: Match fidelity is "exact characters as received" — the lookup MUST compare the caller-supplied identifier against stored identifiers without applying case-folding, accent-stripping, whitespace-collapsing, or Unicode-normalisation-form folding beyond what current ASCII-input behaviour already applies. This bug fix does not introduce fuzzy matching.

### Key Entities

This feature is a defect repair on existing operations. No new persistent entity, schema, or stored shape is introduced. The affected entities are:

- **Heading-path identifier**: A caller-supplied sequence of one or more heading-title segments used to locate a section within a note. Today the lookup compares it against the note's authored heading titles. After this change, that comparison continues to use the same comparator — but the identifier is no longer corrupted before the comparison runs.
- **Property name identifier**: A caller-supplied key string used to locate a single property within a note's frontmatter. Same comparator, same corruption removed.
- **Property value identifier**: A caller-supplied value string used to select notes whose frontmatter carries a matching value under a named property. Same comparator, same corruption removed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of `read_heading` calls whose heading-path input matches an authored heading title — character-for-character, including any non-ASCII characters — return the section's body content. Today's baseline for any such call containing one or more non-ASCII characters is 0%.
- **SC-002**: 100% of `read_property` calls whose name input equals an authored frontmatter key — character-for-character, including any non-ASCII characters — return the property's value and resolved type. Today's baseline for any such call containing one or more non-ASCII characters is 0%.
- **SC-003**: 100% of `find_by_property` calls whose value input equals an authored frontmatter value — character-for-character, including any non-ASCII characters — return a non-empty match set that includes every note carrying that exact value. Today's baseline for any such call containing one or more non-ASCII characters is 0%.
- **SC-004**: 0% regression on ASCII-only inputs to the three affected operations — every call that succeeds today continues to succeed after this change, and every call that legitimately returns "not found" / empty today returns the same response after this change.
- **SC-005**: 0 new fields, sentinels, or error codes appear in any of the three affected operations' published response shapes. The defect is invisible to callers who already exercise ASCII-only inputs; the fix is invisible to callers who exercise the response shape rather than the response content.
- **SC-006**: The operations that are not affected today (`read`, `write_note`, `delete`, `obsidian_exec`, `help`, `files`) show 0% behavioural change — their response shapes, success cases, and failure cases continue to match their existing test coverage.

## Assumptions

- The defect is in the input-decode step shared by the three affected handlers, not in their per-handler comparison logic. The user's framing ("the identifier is corrupted in transit before the underlying comparison runs") locates the fault at the boundary, not in the matchers themselves, and explicitly scopes the fix to "the input-decode step." The three handlers receive their string inputs through a different intake path than the unaffected operations — a difference the user identifies as the reason `read`, `write_note`, etc. round-trip non-ASCII characters correctly today.
- "Exact character match" is the only required behaviour. The user did not request normalisation-form folding, case-folding, accent-stripping, or any other fuzzy-matching enhancement, and this work assumes none. If a vault stores a heading title in one normalisation form and the caller supplies the same characters in a different normalisation form, those are out-of-scope for this fix; only the corruption-free path is in scope.
- Outbound character encoding of returned content already works correctly. The user's "Out of scope" section confirms that bytes flowing out of the affected operations preserve the full character set today; this work makes no changes to the response-encoding path.
- Malformed input — byte sequences that do not form a valid character at all — is explicitly out of scope. This work concerns only correctly-formed input being matched as-is; the operations' existing handling of malformed input (whatever it is today) is unchanged.
- Existing unit-test scope applies. Per the project's auto-memory directive, this repo covers vitest unit tests only; the per-handler `*.test.ts` files co-located with each affected surface receive the new failure-or-boundary cases for the non-ASCII paths. Manual / integration TC-XXX cases live elsewhere in the user's tracker and are not authored by this change.
- The three handlers continue to use their existing comparators. The fix is at the input boundary; per-handler matching semantics — and therefore each handler's existing success and failure tests — remain valid as the regression net for ASCII-only inputs.
