# Feature Specification: Omit Derived Labels

**Feature Branch**: `071-omit-derived-labels`  
**Created**: 2026-10-31  
**Status**: Draft  
**Input**: User description: "Omit derived labels — when an agent lists a note's outgoing links, a link that points at a heading or block inside another note reports a display label only when the note's author actually wrote one, the same as every other link."

## Background

The outgoing-links listing promises that an entry carries a display label only when the source note carries an alias the author wrote. Today that promise breaks for links and embeds that point at a heading or a block: when the author wrote no alias, the entry still comes back with a label in the form "Note > Heading", copied from the editor's own link pane. The note contains no such text. Agents that detect real aliases by checking whether a label is present get false positives, and the tool's help page compensates by teaching a pattern-matching workaround. The same help page also states that embeds never carry a label, which is untrue for embeds of a heading or a block. Planning probes showed the same derived label on fragment-bearing links declared in a note's properties, and an empty-string label on links whose alias is empty or blank.

## Clarifications

### Session 2026-10-31

- Q: Should the "no label unless the author wrote one" rule cover only heading and block fragments, or every fragment? → A: Every fragment. Any fragment-bearing wiki-style link or embed (heading, block, PDF page or any other fragment) carries no label unless the author wrote an alias. This restores the original contract (label absent when the source has no alias) uniformly across all wiki-style link and embed shapes; a heading-and-block-only rule would leave the exception this feature exists to remove.
- Q: Does image-size text after the alias separator on an embed (for example a width of 300) count as an author-written alias? → A: Yes, unchanged from today. Size text is written in the source, so it is reported as the label exactly as written. The rule is phrased as "the text the author wrote after the alias separator"; telling sizes apart from labels is new scope this feature does not carry.
- Q: Should links declared in a note's properties follow the same rule? (Planning probe evidence: a property value holding an unaliased heading link is reported today with the derived label "Tgt > Head", so the earlier "already follows the rule" statement was wrong.) → A: Yes, include them. Property links are reported as ordinary wiki-style link entries, so the uniform rule covers them; the out-of-scope bullet is removed and FR-004 corrected.
- Q: How should an empty or blank alias (the separator written with nothing, or only spaces, after it) be reported? (Planning probe evidence: such entries come back today with an empty-string label, plain links included.) → A: As no alias, on every wiki-style link and embed, plain or fragment-bearing. An empty label breaks the single presence check on any shape; the "plain links unchanged" story covers only plain links with no alias, so dropping the empty label leaves it intact.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Unaliased heading and block links carry no label (Priority: P1)

An agent lists a note's outgoing links. Some links point at a heading or a block in another note and have no alias. Those entries come back with no display label, so the agent can tell real aliases from plain links with a single presence check.

**Why this priority**: This is the defect itself. Every agent that relies on label presence to find author-written aliases gets wrong answers today.

**Independent Test**: List the outgoing links of a note that contains an unaliased heading link and an unaliased block link to another note; confirm neither entry has a display label.

**Acceptance Scenarios**:

1. **Given** a note containing a link to a heading in another note with no alias, **When** the agent lists its outgoing links, **Then** that entry has no display label.
2. **Given** a note containing a link to a block in another note with no alias, **When** the agent lists its outgoing links, **Then** that entry has no display label.
3. **Given** a note whose property contains a link to a heading in another note with no alias, **When** the agent lists its outgoing links, **Then** that entry has no display label.

---

### User Story 2 - Unaliased heading and block embeds carry no label (Priority: P1)

An agent lists a note's outgoing links. Some entries are embeds of a heading or a block with no alias. Those entries follow the same rule as links and carry no display label.

**Why this priority**: Embeds share the same defect and the same agent-side check; fixing links without embeds would leave the rule with an exception.

**Independent Test**: List the outgoing links of a note that contains an unaliased heading embed and an unaliased block embed; confirm neither entry has a display label.

**Acceptance Scenarios**:

1. **Given** a note containing an embed of a heading in another note with no alias, **When** the agent lists its outgoing links, **Then** that entry has no display label.
2. **Given** a note containing an embed of a block in another note with no alias, **When** the agent lists its outgoing links, **Then** that entry has no display label.
3. **Given** a note containing an embed of a specific page of a PDF with no alias, **When** the agent lists its outgoing links, **Then** that entry has no display label.

---

### User Story 3 - Author-written aliases are kept (Priority: P1)

An agent lists a note's outgoing links. Where the author wrote an alias on a link or embed, including one that points at a heading or a block, the entry's display label is that alias exactly as written.

**Why this priority**: Removing derived labels must not remove real information. This story guards against over-correction.

**Independent Test**: List the outgoing links of a note containing aliased heading, block and plain links; confirm each label matches the written alias character for character.

**Acceptance Scenarios**:

1. **Given** a link to a heading with the alias "Custom Display", **When** the agent lists outgoing links, **Then** the entry's display label is "Custom Display".
2. **Given** a link to a block with the alias "Other Label", **When** the agent lists outgoing links, **Then** the entry's display label is "Other Label".
3. **Given** a plain link with the alias "Alias", **When** the agent lists outgoing links, **Then** the entry's display label is "Alias".
4. **Given** an embed of a heading with an alias written by the author, **When** the agent lists outgoing links, **Then** the entry's display label is that alias exactly as written.

---

### User Story 4 - Existing plain-link behaviour unchanged (Priority: P2)

An agent lists a note's outgoing links. Plain links and plain embeds with no alias and no fragment keep coming back with no display label, exactly as today.

**Why this priority**: A regression guard. The behaviour already matches the rule; the change must not disturb it.

**Independent Test**: List the outgoing links of a note containing a plain unaliased link and a plain unaliased embed; confirm neither entry has a display label and the rest of each entry is unchanged.

**Acceptance Scenarios**:

1. **Given** a plain link with no alias and no fragment, **When** the agent lists outgoing links, **Then** the entry has no display label, as today.
2. **Given** a plain embed with no alias and no fragment, **When** the agent lists outgoing links, **Then** the entry has no display label, as today.

---

### User Story 5 - Help matches behaviour (Priority: P2)

An agent reads the tool's help to learn what the display label means. The help states one rule — the label is present only when the author wrote an alias — with no caveat, exception or workaround for heading and block links, and no claim that embeds never carry a label.

**Why this priority**: Agents act on the documentation. Once the behaviour is fixed, the workaround text becomes wrong advice.

**Independent Test**: Read the tool's description and its long help page; confirm the display-label text states the single rule and contains no pattern-matching workaround or embed exception.

**Acceptance Scenarios**:

1. **Given** the tool's help page, **When** an agent reads the description of the display label, **Then** it states the single rule (present only when the author wrote an alias) with no caveat or workaround for heading and block links.
2. **Given** the tool's help page, **When** an agent reads what it says about embeds, **Then** it does not claim embeds never carry a label; it applies the same single rule to embeds.

---

### Edge Cases

- **Alias that looks derived**: the author writes an alias that happens to read like "Note > Heading". The entry carries that alias as its label, because the author wrote it. The decision rests on what the source contains, never on the shape of the label.
- **Links to a heading or block in the same note** (no note name before the heading or block part) with no alias carry no label, under the same rule.
- **Other fragments**: a link or embed with a fragment that is neither a heading nor a block (for example a PDF page, such as an embed of page 3 of a PDF) and no alias carries no label, under the same rule.
- **Nested heading paths** (a link to a sub-heading through its parent headings) with no alias carry no label.
- **Alias identical to the link target**: no label, as today; the existing rule that a label equal to the target is omitted is unchanged.
- **Image-size text on an embed** (the alias separator followed by a width or width-by-height): reported as the label exactly as written, as today. It is text the author wrote after the separator; the tool does not distinguish sizes from labels.
- **Empty or blank alias** on any wiki-style link or embed, plain or fragment-bearing (the alias separator is written but nothing, or only spaces, follows it): no alias was written, so the entry carries no label. Today such entries carry an empty-string label; that label is dropped.
- **Property links**: a link declared in a note's property follows the same rule as a body link; an unaliased fragment-bearing property link carries no label.
- **Links inside a table** that use the table-safe form of the alias separator: the alias is recognised as written and kept as the label; an unaliased heading or block link in a table carries no label.
- **Several links on one line** mixing aliased and unaliased heading links: each entry is judged on its own; order and line numbers are unchanged.
- **Standard Markdown links and images** to a heading or block: their written link text or alt text is still reported as the label as written, empty included, as today. The non-empty-alias condition applies to wiki-style links and embeds only (analysis I1, owner ruling 2026-10-31).
- **Count-only listing**: the count of entries is unchanged by this feature; only the label on individual entries changes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When listing outgoing links, the system MUST omit the display label on any wiki-style link or embed that carries a fragment — a heading, a block, a PDF page or any other fragment — in another file or the same note, when the author wrote no alias for it.
- **FR-002**: The system MUST report an author-written alias on any wiki-style link or embed, including fragment-bearing ones, as the display label exactly as written, character for character.
- **FR-003**: The system MUST decide whether an alias exists from what the note's source contains, not from the form or content of any label the editor derives.
- **FR-004**: The system MUST NOT change the display label behaviour for plain wiki-style links and embeds with no fragment and either no alias or a non-empty alias, nor for standard Markdown links and images. Links declared in a note's properties follow FR-001 to FR-003 exactly as body links do.
- **FR-004a**: The system MUST treat an empty or blank alias on any wiki-style link or embed, plain or fragment-bearing, as no alias, and omit the display label.
- **FR-005**: The system MUST NOT change any other part of an entry — the reported target (including its heading or block part), line, kind — nor the number or order of entries, nor the count reported in count-only mode.
- **FR-006**: The tool's short description and its long help page MUST state a single display-label rule — present only when the author wrote an alias, and then carrying the text the author wrote after the alias separator exactly as written — that applies alike to links and embeds, with no caveat, exception or pattern-matching workaround for fragment-bearing links (heading, block or otherwise).
- **FR-007**: The help page MUST NOT state that embeds never carry a display label.
- **FR-008**: The change MUST ship with automated tests covering unaliased heading, block, other-fragment (such as a PDF page), embed and property entries (no label), empty and blank aliases on plain and fragment-bearing links (no label), aliased heading, block, embed and plain entries (label kept as written), an author alias shaped like a derived label (kept), and unchanged plain-link behaviour.

### Key Entities

- **Outgoing-link entry**: one occurrence of a link or embed in a note. Carries a target (which may include a fragment such as a heading, block or PDF page), a line, a kind (wiki-style link, embed, or Markdown link) and an optional display label.
- **Display label**: the text the author wrote to be shown in place of the target. Present on an entry only when the author wrote such text in the note.
- **Derived label**: text the editor generates for its own link pane (for example "Note > Heading") when no alias was written. Not part of the note and never reported as a display label.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across a test note containing unaliased heading links, block links, heading embeds, block embeds, other-fragment embeds (such as a PDF page), unaliased fragment-bearing property links and empty or blank aliases, 0 entries carry a display label.
- **SC-002**: Across a test note containing author-written aliases on heading, block, embed and plain links, 100% of entries carry a label identical to the written alias.
- **SC-003**: An agent can identify every author-written alias in a note with a single presence check on the display label, with 0 false positives and 0 false negatives on the test notes above.
- **SC-004**: For notes with no fragment-bearing wiki-style links or embeds and no empty or blank aliases, listings before and after the change are identical.
- **SC-005**: The tool's description and help page contain 0 caveats, exceptions or workarounds about display labels, and 0 statements that embeds never carry a label.

## Assumptions

- "Wiki-style link" covers both double-bracket links and their embed form; standard Markdown links and images keep reporting their written link or alt text.
- The existing rule that a label equal to the link target is omitted stays as it is; this feature does not widen what counts as an alias.
- An empty or blank alias on any wiki-style link or embed is treated as no alias, consistent with "present only when the author wrote one".
- Text after the alias separator counts as an alias whatever it says, including image-size text on embeds; the tool does not interpret it.
- The editor's own link pane, and the labels it shows, are not changed; this feature changes only what the outgoing-links listing reports.
- Incoming links (backlinks) are out of scope.
- Agents that implemented the help page's current pattern-matching workaround keep working: after the change their check simply never fires, because no derived labels are reported.

## Out of Scope

- Display labels on standard Markdown links, which already report the written link text.
- How the link target itself is reported, including the heading or block part.
- Changing the editor's own link pane or how it labels links.
- Incoming links (backlinks).
