# Feature Specification: Match literal phrases

**Feature Branch**: `087-match-literal-phrases`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Match literal phrases — when an agent searches the vault for text that contains spaces, both text-search capabilities treat the whole query as one literal phrase, exactly as their documentation says. Both text-search capabilities are documented as literal substring searches, but a query with several words is currently split into separate words: files containing all the words in any order match, and the line-level search returns every line containing any one of the words, duplicating lines that contain several. Agents looking for an exact sentence get false matches and inflated counts. Out of scope: adding a non-literal or multi-term search mode; regular-expression search (a separate capability); changes to case-sensitivity rules, folder scoping, truncation or ordering."

## Context

The server has two text-search tools:

- `search` returns the paths of the notes that contain the query. Its deprecated line mode (`context_lines: true`) returns one entry per matching line instead.
- `context_search` always returns one entry per matching line, with the note path, the 1-based line number and the line's text.

Both tools publish `query` as a "literal substring", and their help references say a query is "phrase-matched as a single literal substring", with internal whitespace kept verbatim (`"foo bar"` matches `foo bar`, not `foobar` or `foo  bar`).

In practice, both tools pass the query to the editor's own search, which reads it as search syntax rather than as text. A query with spaces is split into separate words, so:

- the path search returns every note that contains all the words, anywhere and in any order;
- the line-level searches return every line that contains any one of the words, and a line that contains several of the words is returned once per word, so the same line appears more than once and `count` is inflated.

Characters that mean something in the editor's search syntax (double quotes, a leading minus, `OR`, parentheses, `name:` operators such as `tag:` or `path:`, slashes around text) are read as syntax too, so a query that contains them does not find the text the agent typed.

`pattern_search` (regular-expression search) is a separate tool and is not changed by this feature.

## Clarifications

### Session 2026-11-02

- Q: When an agent searches for a phrase with `search` in its default path mode, should a note still match if the phrase appears only in its file name (or other metadata) and not in any line of its text? → A: Option A. Yes, keep it. BI-0169 limits the fix to how the query is matched, and file-name matching is existing, documented behaviour (Tool Notes `context_search`: line-level counts "can be lower than sibling `search` (which matches filenames)"; the `context_search` feature page's "Filename-match drop (inherited)" caveat). The path search still matches notes whose file name or metadata contains the whole phrase literally. The line-level modes look at text lines only.
- Q: If a query begins or ends with spaces, for example `" alpha beta "`, should those spaces count as part of the phrase that must be found? → A: Option A. Yes, keep them. BI-0169's third user story asks for the query to be "matched literally", both tools are documented as literal substring searches with whitespace "preserved verbatim", and the vault documents no trimming at either end; the whitespace-only check is validation only (`context_search` feature page, schema step 1). `" alpha"` does not match `alpha` at the start of a line.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A multi-word query matches only the exact phrase (Priority: P1)

An agent searches for a sentence or a multi-word phrase. Only notes and lines that contain that exact text, with its words in that order and its spacing as typed, are returned. Notes that contain the words separately, or in a different order, are not.

**Why this priority**: This is the defect. Today a multi-word search returns false matches, so an agent that relies on it to find, count or edit a phrase acts on the wrong notes. Every other story in this feature builds on phrase matching working.

**Independent Test**: In a test vault, create a note containing `alpha beta` on one line, a note containing only `alpha`, a note containing only `beta`, a note containing `beta alpha` but not `alpha beta`, and a note containing `alpha` and `beta` on different lines. Search for `alpha beta` with `search`, with `search` in line mode, and with `context_search`. Confirm that only the first note is returned by each.

**Acceptance Scenarios**:

1. **Given** a note containing `alpha beta` on one line and other notes containing only `alpha` or only `beta`, **When** an agent searches for `alpha beta` with `search`, **Then** only the note with the exact phrase is returned.
2. **Given** a note containing `beta alpha` but not `alpha beta`, **When** an agent searches for `alpha beta` with any of the text-search modes, **Then** the note is not returned.
3. **Given** a note containing `alpha` on one line and `beta` on the next, and nowhere `alpha beta`, **When** an agent searches for `alpha beta`, **Then** the note is not returned.
4. **Given** a note containing `alpha  beta` (two spaces) but not `alpha beta`, **When** an agent searches for `alpha beta` (one space), **Then** the note is not returned; and **When** the agent searches for `alpha  beta` (two spaces), **Then** the note is returned.
5. **Given** the same vault, **When** an agent searches for `alpha beta` with `context_search`, **Then** only the line containing `alpha beta` is returned, and lines containing only `alpha` or only `beta` are not.
6. **Given** a note named `alpha.md` whose text contains `beta` but not `alpha beta`, and a note named `alpha beta.md` whose text contains neither word, **When** an agent searches for `alpha beta` with `search` in path mode, **Then** `alpha beta.md` is returned and `alpha.md` is not (Clarifications, Session 2026-11-02).

---

### User Story 2 - Each matching line is returned once (Priority: P1)

An agent uses line-level search to find and count the lines that contain a phrase. Each line that contains the phrase appears exactly once in the results, so `count` is the number of matching lines.

**Why this priority**: Duplicated lines inflate counts and can mislead an agent into thinking there are more occurrences than there are, or make it process the same line twice. It is the second half of the reported defect.

**Independent Test**: Create a note with one line that contains the phrase once, one line that contains it twice, and one line that contains each of the phrase's words but not the phrase. Run `context_search` and `search` in line mode for the phrase. Confirm that the first two lines each appear once, the third does not appear, and `count` is 2.

**Acceptance Scenarios**:

1. **Given** a line containing the phrase, **When** line-level results are returned, **Then** that line appears exactly once.
2. **Given** a line containing the phrase more than once, **When** line-level results are returned, **Then** that line appears exactly once.
3. **Given** any line-level result set, **When** it is returned, **Then** no two entries share the same note path and line number, and `count` equals the number of distinct matching lines (before the existing `limit` cap is applied).

---

### User Story 3 - Search-syntax characters are matched as text (Priority: P2)

An agent searches for text that happens to contain characters with a meaning in the editor's own search syntax, such as double quotes, a leading minus, `OR`, parentheses, `tag:`-style prefixes or slashes. The query is matched as the literal text the agent typed. The agent never has to escape or quote anything.

**Why this priority**: Less common than plain multi-word queries, but when it happens the results are wrong in ways an agent cannot predict or work around, because the tools offer no escaping rules.

**Independent Test**: Create notes containing each of these exact texts on a line: `say "hello" twice`, `-draft`, `cats OR dogs`, `(see note)`, `tag:urgent`, `path:Projects`, `/usr/bin`, `[status]`, `a\b`. Search for each text with each text-search mode. Confirm that each search returns exactly the note and line that contain that text, and nothing that matches it only under search-syntax rules.

**Acceptance Scenarios**:

1. **Given** a note containing `say "hello" twice`, **When** an agent searches for `say "hello" twice`, **Then** that note (and, in line-level modes, that line) is returned.
2. **Given** a note containing `hello` but not a double quote, **When** an agent searches for `"hello"` (with the quote characters), **Then** the note is not returned.
3. **Given** a query that begins with a minus sign, such as `-draft`, **When** an agent searches, **Then** only notes containing the text `-draft` are returned, not every note that lacks `draft`.
4. **Given** a query containing `OR` between two words, such as `cats OR dogs`, **When** an agent searches, **Then** only notes containing the text `cats OR dogs` are returned (subject to the existing case rule), not notes containing either word.
5. **Given** a query that looks like a search operator, such as `tag:urgent`, `path:Projects` or `file:Plan`, **When** an agent searches, **Then** only notes containing that text are returned, not notes selected by tag, path or file name.
6. **Given** a query wrapped in slashes, such as `/usr/bin/`, or containing parentheses, square brackets or a backslash, **When** an agent searches, **Then** the query is matched as that literal text, never as a regular expression or a grouping.

---

### Edge Cases

- **Single-word query with no search-syntax characters**: the same notes and lines as today in every mode. A line that today appears once per occurrence of the word now appears once (FR-005, FR-010).
- **Query matches a note's file name**: the path search keeps its documented behaviour of also matching file names and metadata, not only body text; the whole query must still appear as one literal phrase there. Line-level modes still return body lines only, so their counts can still be lower than the path search's, as documented today.
- **Phrase split across two lines**: a line break is not a space, so `alpha beta` does not match `alpha` at the end of one line and `beta` at the start of the next.
- **Query containing a line break**: matched literally like any other character. The path search matches a note whose text contains the query across the break, as it matches any other literal text. No single line can contain a line break, so the line-level modes return no entries for such a query. No new validation error is added (research F6).
- **Leading or trailing spaces in the query**: kept as part of the phrase, like internal spaces (Clarifications, Session 2026-11-02). `" alpha"` matches ` alpha` inside a line but not `alpha` at the start of a line. The existing rule that rejects an empty or whitespace-only query is unchanged.
- **Tabs and other whitespace inside the query**: matched exactly as typed; a tab does not match a space.
- **Case**: the existing case rule applies to the whole phrase: by default case is ignored as it is today, and `case_sensitive: true` matches case exactly. (The help pages say the default folds ASCII letters only; a live check found that `CAFÉ` also matches `café` today, with or without this feature. That pre-existing documentation drift is recorded as a follow-up in research F7 and is not changed here.)
- **Lines with Windows line endings**: `context_search` still strips one trailing carriage return from each returned line's text, as today. A carriage return at the end of a line is not part of what the phrase is matched against for that line.
- **Long lines**: returned text is still capped at 500 characters plus the ellipsis marker, as today.
- **Phrase occurs on many lines**: the existing `limit` cap, the conservative line-mode truncation flag and the `(path, line)` ordering apply to the de-duplicated set of matching lines.
- **No matches**: the empty result, and `context_search`'s check that a named folder exists, are unchanged.
- **Unknown vault, missing folder, CLI failures**: unchanged errors.

## Requirements *(mandatory)*

### Functional Requirements

"Text-search mode" below means any of: `search` in its default path mode, `search` in its deprecated line mode (`context_lines: true`), and `context_search`. "Line-level mode" means the last two.

- **FR-001**: In every text-search mode, the query MUST be matched as one literal substring: a note or line matches only if it contains the query's characters contiguously, in order, exactly as given, subject only to the existing case rule (FR-007).
- **FR-002**: Spaces and other whitespace in the query, including leading and trailing whitespace, MUST be part of the phrase. Whitespace MUST NOT split the query into separate terms, and a run of whitespace MUST match only the same run.
- **FR-003**: Characters and words in the query MUST NOT be treated as search syntax. This includes at least: double quotes, a leading minus, `OR` and `AND`, parentheses, square brackets, operator prefixes of the form `name:` (such as `tag:`, `path:`, `file:`, `line:`, `section:`, `block:`, `task:`, `content:`, `match-case:` and `ignore-case:`), text wrapped in slashes, backslashes and asterisks. Each MUST match itself as text.
- **FR-004**: In line-level modes, a line MUST be returned only if that line contains the whole query (FR-001). A line containing some but not all of the query's words, or all of them in another order or with other spacing, MUST NOT be returned.
- **FR-005**: In line-level modes, each matching line MUST appear exactly once in the results, however many times the phrase occurs in it. Two entries MUST NOT share the same note path and line number.
- **FR-006**: In line-level modes, `count` MUST equal the number of entries returned, and the `limit` cap and truncation flag MUST be applied to the de-duplicated set of matching lines, using today's rules.
- **FR-007**: The case rule MUST be unchanged from today: by default the match ignores case exactly as it does today; with `case_sensitive: true` it matches case exactly.
- **FR-008**: Folder scoping, the `.md`-only filter, result ordering, the `limit` default and range, the truncation rules, the 500-character text cap, the carriage-return strip in `context_search`, the zero-match result, the path search's matching of file names and metadata, and `context_search`'s folder-existence check MUST be unchanged.
- **FR-009**: Every query that passes today's input validation MUST be searchable under FR-001 to FR-003. The feature MUST NOT add new input validation rules or new rejections, and agents MUST NOT need to escape or quote anything.
- **FR-010**: For a single-word query that contains no characters listed in FR-003, every text-search mode MUST return the same notes and the same lines as today. The only difference allowed is FR-005's: in line-level modes, a line that today appears once per occurrence of the word appears once.
- **FR-011**: The input schemas, output schemas, success response shapes and tool annotations of `search` and `context_search` MUST be unchanged. The feature MUST NOT introduce a new top-level error code, and the error codes, details and precedence of every existing failure MUST be unchanged.
- **FR-012**: The help references of `search` and `context_search` MUST state that the whole query is matched as one literal phrase, that search-syntax characters (with examples from FR-003) are matched as text and need no escaping, and that each matching line is returned once in line-level modes. Any statement in either reference that the change makes wrong MUST be corrected.
- **FR-013**: Automated tests MUST cover at least, for each text-search mode:
  - (a) the multi-word phrase cases of User Story 1 (separate words, reversed order, words on different lines, different spacing);
  - (b) one entry per matching line, including a line with the phrase more than once, with `count` matching (User Story 2; line-level modes only);
  - (c) queries containing each group of characters listed in FR-003 (User Story 3);
  - (d) a single-word query, showing no change from today (FR-010);
  - (e) the case rule applied to a multi-word phrase, with and without `case_sensitive` (FR-007);
  - (f) a query with leading and with trailing whitespace, which matches only text that has that whitespace (FR-002).

### Key Entities

- **Query**: the text the agent supplies, 1 to 1000 characters, not empty or whitespace-only. It is a literal phrase: every character, including whitespace and punctuation, is part of what must be found.
- **Note**: a Markdown file in the vault, made of lines.
- **Matching line**: a line of a note that contains the whole query. Identified by the note path and its 1-based line number; reported once.
- **Matching note**: for the path search, a note in which the query appears as one literal phrase (in its text, or in its file name or metadata, as documented today).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For the User Story 1 fixture vault, 100% of multi-word searches in each text-search mode return only the notes or lines that contain the exact phrase, with 0 false matches.
- **SC-002**: Across every line-level result set in the test suite, 0 duplicate entries (same note path and line number), and `count` equals the number of distinct matching lines in 100% of cases.
- **SC-003**: For each group of search-syntax characters listed in FR-003, 100% of searches return exactly the notes and lines that contain the query as literal text, with no escaping by the caller.
- **SC-004**: 0 differences from today's results for single-word queries without search-syntax characters, across the existing search test suites, apart from repeated entries for one line collapsing to one (FR-010).
- **SC-005**: 0 changes to the published input schemas, output schemas or annotations of `search` and `context_search`, and 0 new top-level error codes or new input-validation rejections.
- **SC-006**: An agent can find every line containing a given sentence, and know how many there are, with one call and no escaping, in 100% of the acceptance scenarios.

## Assumptions

- "Both text-search capabilities" means `search` and `context_search`. `search`'s deprecated line mode is included, because it returns the same line-level results as `context_search` and has the same defect.
- The documentation is the contract and the current behaviour is the defect: the help references already promise literal phrase matching, so this feature brings behaviour into line with them rather than changing the contract.
- Leading and trailing whitespace is part of the phrase (FR-002; Clarifications, Session 2026-11-02), because the published contract is "literal substring" and nothing in it says the ends are trimmed. The existing validation still rejects an empty or whitespace-only query, and trims only for that check.
- The path search's matching of file names and metadata is documented existing behaviour and stays (Clarifications, Session 2026-11-02); only the way the query is matched there changes, from separate words to one literal phrase. A note whose file name contains `alpha` and whose text contains only `beta` therefore no longer matches `alpha beta`, while a note named `alpha beta.md` still does.
- A line-level entry is identified by its note path and line number; the line text never differs between two entries with the same path and line, so de-duplicating by path and line loses no information.
- Live checks against a real vault follow the project's test-execution instructions for the authorised test vault.

## Out of Scope

- Adding a non-literal, multi-term or boolean search mode, or exposing the editor's search syntax as an option.
- Regular-expression search (`pattern_search`), which is a separate tool and is not changed.
- Changes to case-sensitivity rules, folder scoping, truncation, ordering, the `limit` default or range, or the returned text cap.
- Changes to which parts of a note the path search looks at (body text, file names, metadata).
- `find_and_replace` and any other tool that finds text but is not one of the two text-search tools.
- Returning surrounding-context lines, or match positions within a line.
