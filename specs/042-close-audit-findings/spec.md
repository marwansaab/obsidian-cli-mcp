# Feature Specification: Close Audit Findings

**Feature Branch**: `042-close-audit-findings`
**Created**: 2026-05-21
**Status**: Draft
**Input**: User description: "Close Audit Findings"

## User Scenarios & Testing *(mandatory)*

This feature is a single coordinated reconciliation pass across the typed-tool cohort. Its goal is the published-documentation-is-the-contract invariant: every wrapper claim that describes empirical CLI behaviour matches what the live `obsidian` binary actually produces, and every sub-discriminator the wrapper documents actually fires under the documented conditions. The pass closes two partially-shipped predecessor cleanup constraints (`read_property` malformed-frontmatter alignment; `properties` dedup contract retirement) and the still-open findings on the cohort audit umbrella surfaced by the post-merge audit re-run.

Scope at a glance — surface-document reconciliations across `read_property`, `properties`, `outline`, `find_by_property`, `read_heading`, `files`, `search`, `context_search`, `pattern_search`, `find_and_replace`, `backlinks`, `query_base`, `tag`; plus one runtime change on `find_and_replace` to add symmetric sub-discriminator labelling on a single error envelope.

### User Story 1 - `read_property` malformed-frontmatter spec and help-doc agree (Priority: P1)

The `read_property` feature spec and the rendered help-doc currently give an agent contradictory pictures of how the wrapper handles a note with malformed YAML frontmatter. One source still implies a structured error; the live wrapper does not distinguish the malformed case from the absent-property case. An agent writing fallback code against either source gets the wrong shape.

**Why this priority**: This is a partial-ship loose end from a predecessor cleanup-pass BI that landed the help-doc surface but not the feature-spec retraction. It is the audit's longest-standing open finding for the read tool surface and blocks the "docs IS the contract" invariant at the most-consulted entry point.

**Independent Test**: An agent re-reads the `read_property` feature spec (acceptance scenarios and functional requirements), then re-reads the rendered help-doc, and observes that both describe the same observable surface for a malformed-frontmatter note (empty value, `unknown` type label, no error) — with no surviving "structured error" claim anywhere in the spec.

**Acceptance Scenarios**:

1. **Given** a fresh re-read of the `read_property` feature spec, **when** an agent compares the acceptance scenarios and the functional requirements against the rendered help-doc, **then** both describe the same observable surface for a note with malformed YAML frontmatter (empty value, `unknown` type label, no error), with no contradictory "structured error" claim surviving anywhere in the spec.
2. **Given** the wrapper handles a note with malformed YAML frontmatter (broken delimiters, stray colons, missing closing fence), **when** the agent calls `read_property` against it, **then** the response is the same observable shape described by both the spec and the help-doc — the wrapper does not distinguish the malformed case from the absent-property case.

---

### User Story 2 - `properties` dedup contract retires the case-sensitive claim and the byte-tiebreak claim (Priority: P1)

The `properties` feature spec still carries a case-sensitive dedup promise and a byte-order tiebreak rule, but the upstream binary collapses property names case-insensitively. The byte-tiebreak rule was designed to disambiguate inputs upstream collapses before the wrapper ever sees them, so the rule is structurally unobservable.

**Why this priority**: This is the second partial-ship loose end. The help-doc surface was retracted by the predecessor cycle but the feature spec and the test-case body were not updated, leaving an agent reading the spec with a directly contradictory contract from the help-doc.

**Independent Test**: An agent re-reads the `properties` feature spec; no functional requirement promises case-sensitive dedup; the case-insensitive collapse upstream applies is named as the authoritative contract; the byte-order tiebreak is either removed or explicitly labelled as structurally unobservable. A probe against two notes whose frontmatter property names differ only in case returns a single merged entry whose `noteCount` sums both contributors.

**Acceptance Scenarios**:

1. **Given** a fresh re-read of the `properties` feature spec, **when** an agent reads the dedup-related functional requirements, **then** no functional requirement promises case-sensitive dedup of property names; the case-insensitive collapse upstream applies is named as the authoritative contract; the byte-order tiebreak is either removed or explicitly labelled as structurally unobservable (because upstream collapses the very inputs the tiebreak was designed to disambiguate).
2. **Given** two notes carrying frontmatter property names that differ only in case, **when** the agent invokes `properties`, **then** the response collapses them under upstream's case-insensitive rule with a single merged entry whose `noteCount` sums both contributors, and the rendered help-doc describes this behaviour without retraction.

---

### User Story 3 - `vault=` cohort empirical reconciliation (Priority: P1)

The multi-vault-aware tool cohort carries an inherited "the upstream silently honours `vault=` as a no-op" claim. The recent audit re-run flagged this framing as a plan-stage assertion that has not been empirically reconfirmed against the current binary; four additional tools were added to the cohort by audit finding F1. Cross-vault routing decisions made against this framing risk being wrong wherever the binary actually honours the parameter.

**Why this priority**: This is the largest sub-area by tool count and the only one that depends on empirical probe evidence — without it, the rest of the documentation can be aligned to the wrong reality. Routing correctness for cross-vault calls hinges on this story shipping first.

**Independent Test**: A probe runs against each cohort tool with `vault=<unfocused vault>` against a fixture present only in the unfocused vault. The probe evidence is captured per tool. Each tool's published surface is then reconciled to match the probe evidence — either by retracting the "silently honoured-as-noop" framing where the binary actually honours the parameter, or by preserving and empirically anchoring the framing where the binary does silently no-op.

**Acceptance Scenarios**:

1. **Given** the cohort of typed tools that carry an inherited "the upstream silently honours `vault=` as a no-op" claim in their published surface (the established cohort plus the four tools added by the recent audit's F1 finding), **when** an empirical probe runs against each tool by invoking it with `vault=<unfocused vault>` against a fixture present only in the unfocused vault, **then** the resulting evidence determines for each tool whether the claim is empirically right or empirically wrong.
2. **Given** the probe evidence shows the parameter is empirically honoured (the focused-vault response differs from the unfocused-vault response), **when** the agent reads the tool's help-doc and feature spec, **then** no "silently honoured-as-noop" wording survives; the documentation names the empirical surface (the parameter is honoured by upstream; unknown vault names surface as a structured error) at every place the prior framing appeared.
3. **Given** the probe evidence shows the parameter is empirically silently honoured as a no-op (the responses are identical), **when** the agent reads the tool's docs, **then** the framing is preserved but annotated with an empirical-anchor note naming the probe date and the binary version so the next audit cycle has a re-verification target.

---

### User Story 4 - `find_and_replace` missing-subfolder error envelope carries a symmetric sub-discriminator (Priority: P2)

When `find_and_replace` rejects a call targeting a subfolder that does not exist in the vault, the error envelope currently omits the sub-discriminator field that the sibling path-traversal-shape rejection branch sets. An agent writing recovery code that pattern-matches on the sub-discriminator needs conditional handling for whether the field is present.

**Why this priority**: This is the only runtime change in the pass. It is small in surface but breaks the cohort's "every documented sub-discriminator actually fires under the documented conditions" pass criterion. Without it, the cohort audit cannot clear cleanly. P2 because the failure mode is recoverable by callers today (with extra conditional code); the symmetric labelling is a uniformity improvement, not a correctness fix.

**Independent Test**: An invocation of `find_and_replace` against a missing subfolder returns an error envelope whose sub-discriminator field carries a labelled value (not absent). A second invocation that triggers the path-traversal-shape rejection branch returns an envelope with the same sub-discriminator field shape. Recovery code that pattern-matches on the sub-discriminator runs uniformly across both branches without conditional present/absent handling.

**Acceptance Scenarios**:

1. **Given** an invocation of `find_and_replace` that targets a subfolder which does not exist in the vault, **when** the agent reads the response envelope, **then** the envelope's sub-discriminator field carries a labelled value (not absent) so the agent can pattern-match uniformly against the sibling envelope from the path-traversal-shape rejection branch.
2. **Given** the same envelope sub-discriminator surface across both the missing-folder branch and the path-traversal-shape branch, **when** the agent writes recovery code that branches on the sub-discriminator, **then** both branches expose the same field shape — no conditional handling for whether the field is present.

---

### User Story 5 - Error-roster documentation acknowledges both validation envelope shapes per tool (Priority: P2)

Typed tools whose schema can reject a numeric or length constraint at the field level can surface that rejection through one of two paths: the wrapper-internal validation envelope (the same shape the cohort's other validation paths produce) or the MCP transport error envelope the client transport produces when the input never reaches the handler. Today's error rosters name only one of the two. An agent writing recovery code against either envelope shape risks being surprised by the other.

**Why this priority**: The shape divergence is a deliberate trade-off worth preserving — the wrapped envelope would lose the rich issue-body that the MCP transport envelope carries. Acknowledging both shapes explicitly per tool, with which validation rule produces which envelope, lets agents write correct recovery code without forcing the cohort to collapse the divergence. P2 because the missing acknowledgement is an information gap, not a correctness failure.

**Independent Test**: An agent reads the error roster on each cohort tool that includes a field-level numeric or length constraint (`search`, `context_search`, `pattern_search`, `find_and_replace`, `find_by_property`, `backlinks`, `query_base`, `tag`, plus any sibling discovered during the cohort walk) and finds both validation envelopes named side by side, with the validation rule that produces each envelope identified. Probes against each envelope-producing rule return exactly the shape the docs name.

**Acceptance Scenarios**:

1. **Given** a typed tool whose schema includes a field-level numeric or length constraint that can reject at the boundary (the cohort that includes `search`, `context_search`, `pattern_search`, `find_and_replace`, `find_by_property`, `backlinks`, `query_base`, `tag`, and any sibling discovered during the cohort walk), **when** the agent reads the tool's error roster, **then** the roster names both validation envelopes alongside each other — the wrapped envelope the cohort's other validation paths produce, and the MCP transport error envelope this client-class produces — naming which validation rule produces which envelope.
2. **Given** an agent writes recovery code against either envelope shape, **when** the same rejection condition fires from either client class, **then** the documented envelope shape the agent depends on actually appears in the response — no documented-but-never-produced shape; no produced-but-never-documented shape.

---

### User Story 6 - Truncation slice direction is documented explicitly per tool (Priority: P2)

Tools that emit a truncated-flag signal on their result set when capping fires currently leave the slice direction unspoken in their documentation. The sibling cohort carries divergent slice directions between members — one sibling slices the leading subset, another slices the trailing subset. An agent paginating against any one tool can wrongly assume cross-tool consistency.

**Why this priority**: Documentation-only. The runtime change that would standardise the slice direction across the sibling cohort ships separately on its own spec branch (see Out of Scope). This story closes the documentation gap so agents have an accurate picture in the interim. P2 because the gap is recoverable by reading the runtime behaviour, but the divergence is exactly the kind of cross-tool surprise the audit umbrella is designed to flag.

**Independent Test**: An agent reads the output-contract documentation on each cohort tool that emits a truncated-flag signal (`search`, `context_search`, `backlinks`) and finds the slice direction named explicitly, plus a call-out naming any sibling tool with the opposite direction.

**Acceptance Scenarios**:

1. **Given** a typed tool that emits a truncated-flag signal on its result set when capping fires (the cohort that includes `search`, `context_search`, `backlinks`), **when** the agent reads the tool's output-contract documentation, **then** the documentation names the slice direction explicitly — which subset of the sorted set is returned when truncation fires.
2. **Given** the cohort of sibling tools carries divergent slice directions between members (one sibling slices the leading subset; another slices the trailing subset), **when** the agent reads any one tool's documentation, **then** the divergence is called out explicitly — the documentation names the sibling tools' opposite direction so the agent does not assume cross-tool consistency that does not hold.

---

### User Story 7 - `backlinks` documents the cross-folder reach caveat (Priority: P3)

When `backlinks` is called against a target whose filename basename is unique vault-wide, the wrapper accumulates cross-folder sources via the bare-basename wikilink syntax. The wrapper does not folder-scope the source set; it defers to the host's underlying wikilink resolution. An agent writing folder-scoped recovery logic against the returned list silently misses sources from other folders.

**Why this priority**: This is the lowest-impact finding by occurrence frequency — most callers do not write folder-scoped recovery logic against `backlinks` output. But the silent-miss failure mode is the worst kind: no error surfaces; the caller's downstream logic just runs against incomplete data. P3 because the caller-side fix is trivial (filter the returned list) once the caveat is documented.

**Independent Test**: A target note whose filename basename is unique vault-wide is created with cross-folder sources referencing it via the bare-basename wikilink syntax. `backlinks` returns every cross-folder source. The help-doc and feature page carry an explicit caveat naming this basename-scoped vault-wide reach and instructing folder-scoped callers to filter the returned source list themselves.

**Acceptance Scenarios**:

1. **Given** a target note whose filename basename is unique vault-wide, **when** the agent invokes `backlinks` against it, **then** the returned source list includes every cross-folder source that references the target via the bare-basename wikilink syntax, NOT only sources in the same folder as the target.
2. **Given** the same call, **when** the agent reads the `backlinks` help-doc and feature page, **then** an explicit caveat names this basename-scoped vault-wide reach — describing that the wrapper defers to the host's underlying wikilink resolution mechanism, that the wrapper does not folder-scope the source set, and that callers writing folder-scoped recovery logic must filter the returned source list themselves.

---

### User Story 8 - Cohort audit pass clears cohort-wide after the reconciliation ships (Priority: P3)

The cohort audit umbrella runs a fixed set of pass criteria across the affected tools. Today the umbrella's open-findings ledger names the items addressed by stories 1–7. After the reconciliation ships, a fresh audit pass should clear every applicable pass criterion for each tool in scope.

**Why this priority**: This is the verification story — it does not produce new artefacts beyond the audit re-run record. It depends on every other story landing; running it earlier returns the same incomplete ledger.

**Independent Test**: A fresh cohort audit pass runs against the affected tools. The pass criteria — no rogue codes, no documented-but-never-produced codes, no produced-but-never-documented codes, no doc-vs-empirical-behaviour drift, no asymmetric sub-discriminator labelling on any envelope that carries one — clear for every tool in scope. The umbrella's open-findings ledger is empty for the cohort scope this feature covers.

**Acceptance Scenarios**:

1. **Given** the reconciliation ships, **when** a fresh audit pass runs the cohort's pass criteria across the affected tools, **then** every pass criterion in scope clears for each tool — no rogue codes, no documented-but-never-produced codes, no produced-but-never-documented codes, no doc-vs-empirical-behaviour drift, and no asymmetric sub-discriminator labelling on any envelope that carries one.

---

### Edge Cases

- **Vault probe identical response for the wrong reason**: a probe against a tool in the `vault=` cohort returns the same response for both vaults because the upstream binary errored identically on both — not because the parameter is silently honoured as a no-op. The probe must distinguish "identical valid responses" from "identical error responses" before classifying the tool into the noop branch of Story 3.
- **Cohort drift discovered mid-pass**: while walking the cohort for Story 5, a sibling typed tool surfaces a field-level numeric or length constraint not enumerated in the requirements list. Per Out of Scope, per-tool follow-up items handle drift on tools outside the named cohort; this pass does not silently widen scope.
- **MCP transport envelope shape variance across clients**: the MCP transport error envelope shape is set by the client transport, not the wrapper. If different MCP clients in the cohort produce different shapes for the same rejection, Story 5's documentation must name the wrapper-controlled fields the agent can rely on without making a portable claim about every client's envelope.
- **Case-distinct property names with additional differences**: a `properties` probe against two notes whose property names differ in both case and trailing whitespace must still collapse under upstream's case-insensitive rule; the trailing-whitespace difference is not a separate dedup axis.
- **`find_and_replace` rejection that hits both branches at once**: an input that is both a missing subfolder and a path-traversal shape must produce one rejection branch's envelope, not both. The branches remain mutually exclusive after Story 4 — the symmetric sub-discriminator does not introduce a multi-branch envelope.
- **Audit re-run finds a residual finding outside the named scope**: per Out of Scope, the audit's open-findings ledger is satisfied for the cohort scope this feature covers, not in absolute terms. A new finding outside the named cohort is a follow-up item, not a blocker for Story 8.

## Requirements *(mandatory)*

### Functional Requirements

**Story 1 — `read_property` malformed-frontmatter reconciliation:**

- **FR-001**: The `read_property` feature spec MUST describe the wrapper's response to a note with malformed YAML frontmatter using the same observable surface as the rendered help-doc: an empty value with an `unknown` type label, no error envelope.
- **FR-002**: No surviving statement in the `read_property` feature spec, acceptance scenarios, functional requirements, or test-case narrative MAY claim the wrapper distinguishes the malformed-frontmatter case from the absent-property case via a structured error envelope.

**Story 2 — `properties` dedup contract retirement:**

- **FR-003**: The `properties` feature spec MUST name the upstream's case-insensitive collapse rule as the authoritative dedup contract on frontmatter property names.
- **FR-004**: No surviving statement in the `properties` feature spec MAY promise case-sensitive dedup of property names.
- **FR-005**: The byte-order tiebreak rule on dedup MUST be either removed from the feature spec or explicitly labelled as structurally unobservable, with rationale naming that upstream collapses the very inputs the tiebreak was designed to disambiguate.
- **FR-006**: The `properties` help-doc MUST describe the case-insensitive collapse behaviour without retraction or hedging, matching the contract in the feature spec.

**Story 3 — `vault=` cohort empirical reconciliation:**

- **FR-007**: The cohort of tools carrying the "silently honoured-as-noop `vault=` parameter" claim MUST be enumerated in writing as part of this feature's research artefacts. The enumeration is settled in [research.md](research.md) Task 3 by walking `docs/tools/*.md` for the canonical "silently honoured-as-noop" / "functionally ignored" phrasings, comprising the established cohort (`outline`, `properties`, `files`, `read_heading`, `set_property`) plus the four eval-composed tools added by audit finding F1 (`find_by_property`, `backlinks`, `read_property`, `tag`). `backlinks` is a control case — its docs already correctly state the eval path emits `VAULT_NOT_FOUND`; its FR-010 deliverable is an empirical anchor on the existing correct text.
- **FR-008**: An empirical probe MUST run against each enumerated cohort tool with `vault=<unfocused vault>` against a fixture present only in the unfocused vault, and the per-tool result MUST be recorded with the probe date and the binary version.
- **FR-009**: For each tool whose probe evidence shows the focused-vault response differs from the unfocused-vault response, every "silently honoured-as-noop" framing in the tool's help-doc and feature spec MUST be replaced with the empirical surface: the parameter is honoured by upstream; unknown vault names surface as a structured error.
- **FR-010**: For each tool whose probe evidence shows the focused-vault and unfocused-vault responses are identical valid responses (not identical errors), the existing "silently honoured-as-noop" framing MUST be annotated with an empirical-anchor note naming the probe date and the binary version.
- **FR-011**: The probe protocol MUST distinguish "identical valid responses" from "identical error responses" before classifying a tool into the noop-confirmed branch.

**Story 4 — `find_and_replace` symmetric sub-discriminator (runtime change):**

- **FR-012**: When `find_and_replace` rejects a call targeting a subfolder that does not exist in the vault, the response envelope MUST carry the same sub-discriminator field shape (labelled value, not absent) as the path-traversal-shape rejection branch.
- **FR-013**: A test co-located with the `find_and_replace` handler MUST exercise the missing-subfolder rejection path and assert the sub-discriminator field is present and carries a labelled value, satisfying Constitution Principle II (co-located happy-path + failure-or-boundary tests).
- **FR-014**: The `find_and_replace` help-doc and feature spec MUST name the sub-discriminator value for the missing-subfolder branch alongside the value for the path-traversal-shape branch.

**Story 5 — Dual validation envelope acknowledgement per tool:**

- **FR-015**: The error roster on each cohort tool that includes a field-level numeric or length constraint MUST name both validation envelopes side by side — the wrapped envelope and the MCP transport error envelope — identifying which validation rule produces which envelope.
- **FR-016**: The cohort scope for FR-015 includes `search`, `context_search`, `pattern_search`, `find_and_replace`, `find_by_property`, `backlinks`, `query_base`, `tag`, and any sibling tool discovered during the cohort walk that carries a field-level numeric or length constraint.
- **FR-017**: No tool's error roster MAY name a validation envelope shape that the tool does not produce, and no tool MAY produce a validation envelope shape that its error roster does not name.

**Story 6 — Truncation slice direction documented:**

- **FR-018**: The output-contract documentation for each tool that emits a truncated-flag signal MUST name the slice direction explicitly — which subset of the sorted set is returned when truncation fires.
- **FR-019**: The cohort scope for FR-018 includes `search`, `context_search`, `backlinks`.
- **FR-020**: For each tool in the FR-019 cohort, the documentation MUST call out any sibling tool with the opposite slice direction by name, so agents do not assume cross-tool consistency that does not hold.

**Story 7 — `backlinks` cross-folder reach caveat:**

- **FR-021**: The `backlinks` help-doc and feature page MUST carry an explicit caveat naming the basename-scoped vault-wide reach behaviour: the wrapper defers to the host's underlying wikilink resolution mechanism; the wrapper does not folder-scope the source set; callers writing folder-scoped recovery logic must filter the returned source list themselves.

**Story 8 — Cohort audit re-run clear:**

- **FR-022**: A fresh cohort audit pass MUST run against the affected tools after the reconciliation ships and MUST record clear results for every applicable pass criterion in scope — no rogue codes, no documented-but-never-produced codes, no produced-but-never-documented codes, no doc-vs-empirical-behaviour drift, no asymmetric sub-discriminator labelling on any envelope that carries one.

### Key Entities

- **Cohort tool**: a typed MCP tool within the scope of this feature's reconciliation pass. The named cohort comprises `read_property`, `properties`, `outline`, `find_by_property`, `read_heading`, `files`, `search`, `context_search`, `pattern_search`, `find_and_replace`, `backlinks`, `query_base`, `tag`. Not every tool participates in every story — each story carries its own sub-cohort scope.
- **Audit umbrella open-findings ledger**: the running list of findings the cohort audit has flagged across multiple passes. This feature closes the subset of ledger entries that correspond to stories 1–7. Ledger entries outside the named cohort scope remain open for follow-up.
- **`vault=` probe record**: per-tool empirical evidence captured during Story 3 — the probe date, the binary version, the focused-vault response, the unfocused-vault response, and the classification (parameter-honoured vs. silent-noop-confirmed). Persisted in the feature's research artefacts.
- **Sub-discriminator field**: the structured error envelope's discriminant field used to distinguish error sub-types within a parent code. The field is set on the path-traversal-shape rejection branch of `find_and_replace` today and must be set symmetrically on the missing-subfolder rejection branch after Story 4.
- **Wrapped validation envelope**: the wrapper-internal structured error envelope produced by validation paths that reach the handler before rejecting. Surfaces through the wrapper's `UpstreamError` propagation discipline.
- **MCP transport error envelope**: the JSON-RPC-shaped error response the MCP client transport returns when input schema validation rejects at the transport layer before the handler runs. Carries a rich issue-body that the wrapped envelope does not.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After the reconciliation ships, an agent re-reading any single tool in the named cohort's published surface (feature spec + help-doc) and then exercising the live wrapper finds zero contradictions between the two sources across the dimensions in scope (malformed-frontmatter shape, dedup contract, `vault=` framing, sub-discriminator labelling, error-roster envelope acknowledgement, truncation slice direction, cross-folder reach caveat).
- **SC-002**: The cohort audit umbrella's open-findings ledger reaches zero entries within the scope of stories 1–7 after Story 8's re-run.
- **SC-003**: Every tool in the `vault=` Story 3 cohort carries a recorded probe date and binary version that an agent can reference when deciding whether to trust the documented framing on the next audit cycle.
- **SC-004**: For every cohort tool with a field-level numeric or length constraint, an agent writing recovery code against either validation envelope shape can choose the correct shape by reading the tool's error roster alone, with no need to probe both client classes empirically.
- **SC-005**: No new typed tools are added by this pass; no schema-level changes are made to any existing typed tool's input shape; the only runtime change is the symmetric sub-discriminator labelling on `find_and_replace`'s missing-subfolder rejection branch.
- **SC-006**: The `find_and_replace` symmetric sub-discriminator change ships with a co-located failure-path test that fails before the runtime change and passes after, satisfying Constitution Principle II.

## Assumptions

- Predecessor partial-ship loose ends in scope for this pass are exactly the two named in the feature description: the `read_property` malformed-frontmatter alignment, and the `properties` dedup contract retirement. Any other predecessor's loose ends are out of scope and tracked separately.
- The "MCP transport error envelope" in Story 5 refers to the JSON-RPC error response shape MCP clients receive when input schema validation rejects at the transport layer, before the handler runs. The "wrapped validation envelope" refers to the wrapper-internal structured envelope produced by validation paths that reach the handler before rejecting.
- The Story 3 probe runs against the authorised test vault per [.memory/test-execution-instructions.md](.memory/test-execution-instructions.md), using the scratch subdirectory and cleanup expectations documented there. The cohort enumeration for Story 3 (FR-007) is settled by walking the published surface and the audit's F1 finding rather than being asked of the user.
- The `find_and_replace` runtime change in Story 4 is a labelling addition only — the envelope's sub-discriminator field gains a value where it previously had none. No other field on the envelope changes; no parent error code changes; the change does not introduce a new error code (Constitution Principle IV's zero-new-codes streak is preserved).
- The truncation slice direction's runtime standardisation across the sibling cohort is explicitly out of scope per the user's framing — it ships separately on its own spec branch. Story 6's work is documentation-only.
- The `backlinks` `displayText` surfacing for fragment-bearing wikilinks is explicitly out of scope per the user's framing — it ships separately under its own predecessor. Story 7's work is the cross-folder reach caveat only.
- The cohort audit pass criteria themselves are not redefined by this feature; the pass criteria remain as documented in the audit umbrella.
- Constitution Principle II applies to the runtime change in Story 4. The other six stories are documentation-only and ship with no new co-located tests; existing tests on the affected tools continue to pass.

## Out of Scope

- New typed tools.
- Schema-level changes to any existing typed tool's input shape.
- The runtime backlog item that standardises the truncation slice direction across the sibling cohort — that ships separately on its own spec branch; this feature's truncation work is documentation only.
- The predecessor that addresses how the bare-basename wikilink resolution surfaces `displayText` for fragment-bearing wikilinks — tracked separately.
- Description-text cleanup for tools outside the named cohort. Follow-up items handle any such drift.
- Standardising the validation envelope shape divergence into a single wrapped envelope across both validation paths. The wrapped envelope would lose the rich issue-body that the MCP transport envelope carries; the divergence is preserved with explicit documentation rather than collapsed.
- Audit-framework changes to the audit umbrella itself. The audit's pass criteria and dimension framing remain as they are; this feature satisfies a subset of the audit's open findings, it does not redefine the audit.
- Copy-edit improvements unrelated to the named cleanup items.
