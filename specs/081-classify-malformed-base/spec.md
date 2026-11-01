# Feature Specification: Classify Malformed Base

**Feature Branch**: `081-classify-malformed-base`
**Created**: 2026-11-01
**Status**: Draft
**Input**: User description: "Classify Malformed Base — when an agent lists the views of a Base whose file is malformed (cannot be parsed as a valid Base), the listing fails with a clear, distinct "this Base is malformed" error rather than a generic upstream error that carries the raw parser message."

## Context

`views_base` lists the views of a Base, either one the agent names by its vault-relative `.base` path or the Base currently open in Obsidian. Its published description and its tool reference both advertise a dedicated malformed-Base failure (`BASE_MALFORMED`), and the agreed design from spec 064 (Fix Views Base, FR-008 and SC-004) treats "named Base is malformed" as a cause distinct from "named Base not found", "no Base open", an invalid locator and an unknown vault.

In practice that distinct outcome is not produced for a Base whose file content cannot be parsed. When Obsidian's own parser rejects the file, its complaint reaches the agent as a generic upstream failure whose only detail is the parser's raw text (line and column positions and snippets of the file's content). The malformed-Base failure is today raised only when Obsidian reports, after focusing a named Base, that the focused file is not a Base file.

The sibling Bases capability that runs a view, `query_base`, already recognises parser complaints about a malformed Base and reports them under the same malformed-Base signal. This specification brings `views_base` into line with that advertised and agreed behaviour; it does not change the error roster agreed in spec 064.

## Clarifications

### Session 2026-11-01

- Q: When `views_base` reports a Base as malformed, what should the failure keep of the parser's original complaint (which can quote the user's file, with line and column positions)? → A: Option A. Keep the parser complaint as secondary detail, bounded by the same rule spec 080 set for raw upstream output in errors: short output is kept whole, and long output keeps its first 500 and last 500 characters with a visible cut marker between them, plus the total length. The headline message stays plain. Rationale: BI-0137's acceptance criterion makes parser detail *secondary*, so it is kept, not dropped (this rules out dropping it). Constitution Principle IV keeps the cause "where safe", and the BI's impact harm (3) is file content leaking across the boundary, so the complaint is capped (this rules out keeping it verbatim and unbounded). Spec 080 (BI-0135) applies the same bound rule, but this work does not wait for that work to merge.
- Q: Should `views_base`'s malformed-Base failure also carry the finer reason that `query_base` gives (for example, invalid YAML versus a required key missing), or only the malformed-Base signal itself? → A: Option B, with one change. A parser (YAML) complaint carries `details.reason: "invalid-yaml"`. A malformed Base recognised from any other report (such as the post-focus "not a Base file" report on a named Base) carries `details.reason: "unknown"`; the field is never left off. The closed reason set for `views_base`'s malformed-Base failure is `invalid-yaml` | `unknown`, a subset of `query_base`'s set, and it is documented in the `views_base` tool reference. Absent-views or "no views defined" wording is never mapped to the malformed-Base failure; that case keeps the default-view normalisation (BI-0137 Out of scope). Rationale: ADR-015 lets the default sub-state be absent or `"unknown"`, and `query_base` already emits `"unknown"` for unmatched complaints, so the two tools share one shape. The two reasons also call for different fixes (repair the YAML versus investigate), which meets ADR-015's gate for a sub-discriminator.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Malformed named Base is classified (Priority: P1)

An agent lists the views of a Base it names by path, and that Base's file cannot be parsed as a valid Base. The agent receives a failure that identifies the cause as a malformed Base through a stable, machine-readable signal, and can branch on it (for example, by telling the user to repair the file) without reading the message prose.

**Why this priority**: This is the reported defect. Named-Base listing is the automation path, and today it is the path where the advertised malformed-Base failure is missing.

**Independent Test**: Present a named `.base` whose content the upstream parser rejects; confirm the failure carries the malformed-Base signal and the named path, and is not the generic upstream failure.

**Acceptance Scenarios**:

1. **Given** a `.base` file that cannot be parsed as a valid Base, **When** an agent lists its views by naming that Base, **Then** the failure is reported as the malformed-Base error, separate from the missing-Base and unfocused-Base failures.
2. **Given** that malformed-Base failure, **When** an agent inspects it, **Then** the malformed-Base cause is carried by a stable machine-readable signal, and is not discoverable only by string-matching the message.
3. **Given** that malformed-Base failure, **When** an agent inspects it, **Then** it identifies which Base was malformed by the path the agent named.

---

### User Story 2 - Malformed open Base is classified the same way (Priority: P2)

An agent lists the views of the Base currently open in Obsidian, and that Base's file cannot be parsed. The agent receives the same malformed-Base failure it would have received had it named the Base, not a generic upstream failure and not the "no Base open" failure.

**Why this priority**: The open-Base path is the interactive path and less used by automation, but the same file should produce the same classification whichever way the Base was chosen.

**Independent Test**: With a malformed `.base` focused in Obsidian, list the open Base's views; confirm the failure carries the same malformed-Base signal as story 1.

**Acceptance Scenarios**:

1. **Given** a malformed Base is the one currently open, **When** an agent lists the open Base's views, **Then** the same malformed-Base error is reported.
2. **Given** a malformed Base is the one currently open, **When** an agent lists the open Base's views, **Then** the failure is not reported as "no Base open".

---

### User Story 3 - Failures stay distinguishable without a new category (Priority: P2)

An agent handling every failure the listing can produce can tell each cause apart by a stable signal: malformed Base, named Base missing, no Base open, invalid locator and unknown vault.

**Why this priority**: Adding the malformed-Base classification must not blur the causes that are already distinguishable, and must stay inside the existing error categories.

**Independent Test**: Exercise each failure path in turn and confirm that no two share the same signal, and that each top-level category is one the server already uses.

**Acceptance Scenarios**:

1. **Given** the malformed, missing, unfocused and unknown-vault failure paths, **When** each surfaces, **Then** each is distinguishable from the others by a stable signal.
2. **Given** any of those failures, **When** it surfaces, **Then** its top-level error category is one that already exists; no new top-level error category is introduced.
3. **Given** an upstream failure that is not recognised as a malformed Base (or as any other classified cause), **When** it surfaces, **Then** it is still reported as the generic upstream failure with its original detail, and is not relabelled as malformed.

---

### User Story 4 - No raw parser internals as the primary signal (Priority: P3)

An operator reading a malformed-Base failure sees a plain statement that the Base is malformed. Any parser detail (line, column, source snippets of the file) is available only as secondary detail, not as the main content of the failure.

**Why this priority**: The classification itself (stories 1–3) is what agents branch on; the message shape limits what of the user's file content the tool boundary exposes as its headline.

**Independent Test**: Trigger a malformed-Base failure whose parser complaint quotes the file; confirm the message is a plain malformed-Base explanation naming the Base, and that the quoted content does not appear in the message.

**Acceptance Scenarios**:

1. **Given** a malformed-Base failure, **When** an agent reads its message, **Then** the message states in plain terms that the Base is malformed and names it where the agent named it.
2. **Given** a malformed-Base failure whose parser complaint includes line, column or quoted file content, **When** an agent reads its message, **Then** that parser detail is not part of the message; it is held as bounded secondary detail instead.
3. **Given** a malformed-Base failure whose parser complaint is longer than 1,000 characters, **When** an agent inspects its secondary detail, **Then** that detail holds only the complaint's first 500 and last 500 characters with a visible cut marker between them, plus the complaint's total length.

---

### Edge Cases

- **Parser complaint without a familiar wording**: A malformed Base whose parser complaint matches none of the recognised malformed-Base wordings is reported as the generic upstream failure with its detail intact, rather than guessed at (no silent relabelling).
- **Malformed open Base also reported as "not a Base file"**: If the upstream response for a malformed open Base carries both a parser complaint and a "not a Base file" report, the malformed-Base classification wins, because the Base is open but unusable rather than absent.
- **Named Base reported as "not a Base file" after focus**: Still reported as the malformed-Base failure, as today, and now also carries `reason: "unknown"` because the report is not a parser complaint.
- **Structurally valid Base with an empty or absent views set**: Out of scope. It keeps being normalised to a default view, as documented, and is never reported as malformed, whatever wording (such as "no views defined") accompanies it.
- **Malformed Base in an unregistered vault**: The unknown-vault failure is still reported first, before anything is asked of Obsidian.
- **Named Base that does not exist**: Still reported as "named Base not found", never as malformed.
- **Parser complaint on either output channel, or on a clean exit**: A malformed-Base complaint is recognised whether Obsidian reports it as a failure or prints it on an otherwise clean exit, and on either output channel.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a named Base's file cannot be parsed as a valid Base, listing its views MUST fail with the malformed-Base error, not with the generic upstream failure.
- **FR-002**: When the open Base's file cannot be parsed as a valid Base, listing the open Base's views MUST fail with the same malformed-Base error as FR-001, not with the generic upstream failure and not with "no Base open".
- **FR-003**: The malformed-Base cause MUST be carried by the same stable machine-readable signal the listing already advertises for a malformed Base, and that the sibling view-running capability uses for the same cause, so an agent can branch on it without parsing prose.
- **FR-004**: In named-Base mode, the malformed-Base failure MUST identify the Base by the path the agent supplied.
- **FR-005**: The malformed-Base failure's message MUST state in plain terms that the Base is malformed. It MUST NOT contain the parser's line or column positions or quoted content of the file.
- **FR-006**: The malformed-Base failure MUST keep the parser complaint as secondary detail, never as its message, bounded by the spec 080 rule for raw upstream output in errors: a complaint of up to 1,000 characters is kept whole; a longer one is kept as its first 500 and last 500 characters with a visible cut marker between them, and the failure also records the complaint's total length. This honours Principle IV's rule that a failure keeps its upstream cause only where safe.
- **FR-007**: The malformed, named-missing, not-open, invalid-locator and unknown-vault failures MUST remain mutually distinguishable by stable signals, exactly as agreed in spec 064.
- **FR-008**: No new top-level error category MUST be introduced; the malformed-Base classification MUST reuse the existing category and sub-signal.
- **FR-009**: An upstream failure that is not recognised as a malformed Base, or as another classified cause, MUST continue to surface as the generic upstream failure with its original detail; it MUST NOT be relabelled as malformed or hidden behind an empty result.
- **FR-010**: A malformed-Base complaint MUST be recognised whether it arrives as a reported failure or on a clean exit, and on either output channel.
- **FR-011**: The recognition of a malformed Base MUST be consistent with how the sibling view-running capability recognises the same parser complaints, so the same broken file yields the same classification from both capabilities.
- **FR-012**: The listing's success behaviour MUST be unchanged: view names, the count, the empty-or-absent-views normalisation, and how a Base is chosen by name or by being open.
- **FR-013**: The listing's published description and tool reference MUST describe the malformed-Base failure as it now behaves, covering both named and open modes, and the tool reference MUST list the closed reason set of FR-014 with the recovery each calls for.
- **FR-014**: Every malformed-Base failure MUST carry a reason drawn from the closed set `invalid-yaml` | `unknown`: `invalid-yaml` when the cause is recognised from a parser (YAML) complaint, and `unknown` when a malformed Base is recognised from any other report (including the post-focus "not a Base file" report on a named Base). The reason MUST never be left off. The set is a subset of the sibling view-running capability's reason set, and no other value is produced.
- **FR-015**: Absent-views or "no views defined" wording MUST NOT be recognised as a malformed Base; that case keeps the documented default-view normalisation.

### Key Entities

- **Malformed-Base failure**: The failure an agent receives when a Base's file cannot be parsed. Carries the existing upstream-reported category, the malformed-Base sub-signal, a reason (`invalid-yaml` or `unknown`), the named path in named mode, a plain message, and the parser complaint as bounded secondary detail (whole if short, head and tail with a cut marker and the total length if long).
- **Parser complaint**: The text Obsidian's Base parser produces when it rejects a file. Used to recognise the cause; never the failure's message. The plan calls a recognised parser complaint the "YAML complaint", and the text it is read from the "upstream report".

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every malformed-Base fixture in the test suite whose parser complaint uses a recognised wording, 100% of listing attempts, named and open, report the malformed-Base signal; none report the generic upstream failure.
- **SC-002**: Across the five failure causes (malformed, named-missing, not-open, invalid-locator, unknown-vault), no two share the same signal, and an agent can tell each apart without reading the message.
- **SC-003**: Zero new top-level error categories are introduced by this change.
- **SC-004**: In 100% of malformed-Base failures, the message contains no line or column position and no quoted content of the file.
- **SC-005**: The same `.base` file with broken YAML yields the malformed-Base signal with reason `invalid-yaml` from both the listing capability and the sibling view-running capability.
- **SC-006**: Every existing success-path behaviour of the listing (view names, count, default-view normalisation, Base selection) passes its existing tests unchanged.
- **SC-007**: In 100% of malformed-Base failures, the secondary parser detail holds at most the first 500 and last 500 characters of the complaint (plus a cut marker and the total length when cut), whatever the complaint's size.
- **SC-008**: 100% of malformed-Base failures from the listing carry a reason, and every reason is either `invalid-yaml` or `unknown`; no absent-views fixture is ever reported as malformed.

## Assumptions

- **Recognition reuses the sibling's known parser wordings**: The YAML parser complaints `query_base` already recognises as `invalid-yaml`, including those captured by its live probe, are the starting set (its schema-level wordings are not reused, per FR-014 and FR-015) for `views_base`. A live probe of a broken `.base` against the authorised test vault confirms what `views_base` actually receives in named and open modes before recognition is finalised. The recognised wording set is shared with `query_base`, so extending it would also change `query_base`, which is out of scope. If the probe shows complaint wording outside the set, the case is escalated to the owner before any recognition change; it is not decided during implementation.
- **Open mode carries no named path**: In open-Base mode the agent named no Base, so the failure is not required to carry a path; naming the open Base where it is already known is permitted.
- **The bound rule does not wait on spec 080**: The bound on the secondary parser detail is the same rule spec 080 (BI-0135) set. This work applies that rule whether or not spec 080's change has merged when this work is planned or built. Where spec 080's shared mechanism is available it may be reused; where it is not, the same bound is applied here.
- **Scope**: Only `views_base` changes. The other Bases-family capabilities (`bases`, `query_base`, `create_base`) are unchanged, as are the empty-or-absent-views normalisation, view-name reporting and Base selection shipped under spec 064.
- **Dependency**: Builds on spec 064 (Fix Views Base) for the error roster and named/open selection, and on spec 080 (Tolerate Plugin Noise) for the bound rule applied to the secondary parser detail and for how the named-Base focus step reads its answer. The listing step itself is not an `eval` call and is not affected by spec 080.
