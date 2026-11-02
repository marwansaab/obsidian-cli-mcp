# Feature Specification: Preserve Match Whitespace

**Feature Branch**: `088-preserve-match-whitespace`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Preserve match whitespace. Line-level search results return each matching line's text exactly as it appears in the note, apart from the line-ending characters, as the documentation promises. The documentation says only a trailing carriage return is removed from each matched line and that indentation and trailing spaces are kept. In practice leading and trailing spaces and tabs are removed too, so indentation and Markdown hard line breaks are lost and the documentation misleads callers. Out of scope: changing the length cap on returned line text; phrase matching of multi-word queries (a separate fix); the deprecated line mode of the path-only search capability."

## Background

`context_search` is the capability that finds a literal phrase in a vault's notes and returns each matching line as a path, a line number and the line's text. Its help page says the only thing removed from a line's text is a single trailing carriage return, and that indented list items, code-block content and intentional trailing spaces (Markdown hard line breaks) come back verbatim, and it shows this in a worked example.

That is not what happens. The text comes back with all leading and trailing spaces and tabs removed. The cause was found while building spec 087 (research finding F9): Obsidian's own search trims each line's text before handing it over, and the capability passes that trimmed text on. The project's living documentation already lists this as a known limit that the help page does not mention.

This feature makes the returned text match the promise, rather than rewriting the promise to match the trimming.

## Clarifications

### Session 2026-11-02

- Q: When context_search cannot get a matched line's full, untrimmed text from the note (for example the note was edited or deleted between Obsidian finding the match and the line being read, or the note cannot be read), what should the search return? → A: Option A. Fail the whole call with an `UpstreamError` whose `details` name the note's `path` and `line`, and return no partial results. Add no new top-level error code: reuse an existing one and mark the case with `details.code` (plus `details.reason` if there are sub-states), following ADR-015 and the Architecture page's error-mapping section. A line that no longer matches the CLI's hit counts as the same failure. Options B and C are fallbacks that hide a failure, which Constitution Principle IV forbids. Option D changes the output shape, which is outside BI-0170's scope.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Indentation is kept (Priority: P1)

An agent searches a vault for a phrase that appears in a nested list item or inside an indented code block. Each returned line starts with the same tabs or spaces it has in the note, so the agent can tell how deeply the item is nested, or reproduce the code line exactly when it edits the note next.

**Why this priority**: Indentation carries meaning in Markdown (list nesting, code blocks, block quotes inside lists). Losing it is the most common way the trimmed text misleads an agent, and an agent that copies a trimmed line into an edit can break the note's structure.

**Independent Test**: Put a note in the test vault with a top-level list item, a tab-indented child item and a four-space-indented code line, each containing the same phrase. Search for the phrase and compare each returned text with the note's line.

**Acceptance Scenarios**:

1. **Given** a note line that starts with a tab and contains the searched phrase, **When** the line is returned, **Then** its text starts with that same tab.
2. **Given** a note line that starts with four spaces and contains the searched phrase, **When** the line is returned, **Then** its text starts with those four spaces.
3. **Given** a note line with no leading whitespace, **When** the line is returned, **Then** its text is unchanged from today.

---

### User Story 2 - Trailing spaces are kept and line endings are not (Priority: P2)

An agent searches for a phrase on a line that ends with two spaces, the Markdown hard line break. The returned text ends with those two spaces, so the agent can see the break. The note may use Windows-style line endings; the carriage return of that ending is still not part of the returned text.

**Why this priority**: Trailing spaces are invisible in most views but change how a note renders. They matter less often than indentation, so this story ranks second. The carriage-return rule already works today and must keep working once trailing whitespace is no longer removed.

**Independent Test**: Put two notes in the test vault, one with Unix-style and one with Windows-style line endings, each holding a line that ends in two spaces before its line ending. Search for a phrase on that line and compare each returned text with the line minus its ending.

**Acceptance Scenarios**:

1. **Given** a matching line that ends in two spaces before its line ending, **When** it is returned, **Then** its text ends with those two spaces.
2. **Given** a matching line in a note with Windows-style line endings, **When** it is returned, **Then** the trailing carriage return is not part of the text.
3. **Given** a matching line in a note with Windows-style line endings that ends in spaces before the carriage return, **When** it is returned, **Then** its text ends with those spaces and not with the carriage return.
4. **Given** a matching line ending in a tab, **When** it is returned, **Then** its text ends with that tab.

---

### User Story 3 - Documentation and returned text agree (Priority: P3)

An agent reads the capability's help page and its published description to learn what the returned text contains. What they say is removed from a line is exactly what is removed, so the agent can rely on either the documentation or the observed results without cross-checking.

**Why this priority**: Once Stories 1 and 2 hold, the existing help page is already correct about whitespace, so this story is mostly verification. It still needs its own check, because any remaining mismatch (for example in the worked examples or the known-limits record) would mislead callers in the same way.

**Independent Test**: List every statement on the capability's help page and in its published description about what is removed from or changed in a line's text, then run the matching searches against the test vault and confirm each statement holds.

**Acceptance Scenarios**:

1. **Given** the capability's help page, **When** an agent compares its description of what is removed from each line with the returned text, **Then** the two match.
2. **Given** the capability's published description, **When** an agent compares it with the returned text, **Then** nothing it says about the text is contradicted.

---

### Edge Cases

- **Lines longer than the length cap**: the cap on returned text stays as it is today, but leading whitespace now counts towards it. A deeply indented long line is therefore cut at the same total length as before and may show less of its visible content.
- **A carriage return in the middle of a line**: it stays part of the text, as today. Only a carriage return that forms part of the line ending is removed.
- **A phrase that touches the line's leading or trailing whitespace**: for example the phrase `here ` (with a trailing space) on the line `trailing text here   `. The line is found today, but its returned text does not contain the phrase. After this feature the returned text contains the phrase as written.
- **Whitespace other than spaces and tabs at the start or end of a line** (for example a non-breaking space): kept, like any other character on the line.
- **The last line of a note with no line ending**: returned in full, with nothing removed.
- **A line holding only whitespace and the phrase**: for example a tab, the phrase, then two spaces. All of it is kept.
- **The same line found more than once**: it is still listed once (spec 087), and its text is the full untrimmed line.
- **The deprecated line mode of the path-only `search` capability**: unchanged. It keeps returning text as it does today (see Out of Scope).
- **The untrimmed line cannot be obtained**: for example the note was deleted, cannot be read, or no longer has the reported line between Obsidian finding the match and the line being read. The whole call fails with a structured error naming the note's path and line, and no partial results come back (FR-011).
- **The line no longer matches Obsidian's hit**: for example the note was edited so that the reported line now holds different text. This is the same failure as above (FR-011). The search never returns text from a line other than the one Obsidian found.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: For each match `context_search` returns, the text MUST be the matching line exactly as it appears in the note, without its line-ending characters (a line feed, or a carriage return followed by a line feed) and subject only to the existing length cap.
- **FR-002**: Leading spaces, tabs and any other leading whitespace on a matching line MUST be kept in the returned text.
- **FR-003**: Trailing spaces, tabs and any other trailing whitespace before the line ending MUST be kept in the returned text.
- **FR-004**: A carriage return that is part of a line's Windows-style line ending MUST NOT appear in the returned text. A carriage return anywhere else in the line MUST be kept.
- **FR-005**: The length cap on returned text, and the marker added when text is cut, MUST stay as they are today. The cap is measured on the untrimmed text described by FR-001.
- **FR-006**: Which lines are returned, their paths and line numbers, their order, the match count, the truncation flag, and every input and existing error behaviour of `context_search` MUST stay as they are today. Only the text of a returned line changes, and only by keeping the whitespace that is now removed. Two kinds of new failure are allowed. The first is the one in FR-011. The second is a failure of the extra step that reads the matched lines back from the notes (the step does not complete, or its answer cannot be read), which MUST surface as a structured error through an existing top-level code and MUST NOT return a partial or trimmed result. A search that returns no lines does not perform that step and gains no new failure.
- **FR-007**: The returned text and the line number of each match MUST describe the same line of the note, and that line MUST be the one Obsidian reported as the hit. The text MUST NOT come from a different line or from a different version of the line.
- **FR-008**: The deprecated line mode of the `search` capability MUST keep returning text exactly as it does today.
- **FR-009**: The `context_search` help page and published description MUST state what is removed from a matching line's text (the line ending, and anything beyond the length cap), and nothing more. Any statement there, in the worked examples, or in the project's record of known limits that contradicts the returned text MUST be corrected or removed.
- **FR-010**: If `context_search`'s published description or input and output shapes do not need to change to satisfy FR-009, they MUST NOT change, so the capability's published fingerprint stays as it is.
- **FR-011**: If the untrimmed text of any reported line cannot be obtained, or the line read from the note no longer matches Obsidian's hit, the whole `context_search` call MUST fail with no partial results. The failure MUST be a structured error whose details name the note's `path` and the `line`. It MUST reuse an existing top-level error code and identify the case with a sub-discriminator (`details.code`, plus `details.reason` where there are sub-states). It MUST NOT add a new top-level error code. It MUST NOT fall back to the trimmed text or leave the match out.

### Key Entities

- **Line match**: one result of `context_search`: the note's path, the line's number (counting from 1), and the line's text. This feature changes only how the text is produced.
- **Line ending**: the characters that end a line in a note: a line feed, or a carriage return followed by a line feed. Not part of a line's text. The last line of a note may have none.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a test vault holding indented, tab-indented, trailing-space, trailing-tab and Windows-ending lines that contain a searched phrase, 100% of returned texts equal the note's line with its line ending removed, for every line within the length cap.
- **SC-002**: For every line longer than the length cap in that vault, the returned text equals the first cap-length characters of the untrimmed line followed by the cut marker.
- **SC-003**: For the same vault and query, the set of returned paths and line numbers, their order, the count and the truncation flag are identical before and after the change.
- **SC-004**: Zero statements on the capability's help page or in its published description about what is removed from line text are contradicted by results from the test vault.
- **SC-005**: Results from the deprecated line mode of `search` are byte-identical before and after the change for the same vault and query.
- **SC-006**: In 100% of test runs where a reported line's note is removed, made unreadable or has the line changed before its text is read, the call fails with the FR-011 structured error naming that path and line, and returns no matches.

## Assumptions

- "The capability" in the feature description is `context_search`: the only line-level search the description does not explicitly exclude, and the one whose help page makes the promise. `pattern_search` builds its line text a different way and is not covered here.
- Notes are rarely edited while a search runs, so the failure in FR-011 is expected to be rare. An agent that receives it can simply run the search again.
- A byte-order mark at the very start of a note is not part of the first line's text, so line 1 is returned without it.
- The cap length and cut marker are the ones in place today (500 characters followed by `…`), per the out-of-scope note.
- The existing help-page wording about indentation, trailing spaces and the carriage return is the intended behaviour. If FR-009's review finds it already accurate once the text is untrimmed, no help-page wording needs to change beyond removing anything that is contradicted.

## Out of Scope

- Changing the length cap on returned line text, or its cut marker.
- Phrase matching of multi-word queries (a separate fix).
- The deprecated line mode of the path-only `search` capability: its returned text stays trimmed.
- The wording of the case-folding rule in the help pages (a separate follow-up recorded by spec 087).

## Dependencies

- Spec 087 (literal-phrase matching) and its shared line-level result pipeline, which this feature builds on. Its research finding F9 is the root-cause record for the trimming.
