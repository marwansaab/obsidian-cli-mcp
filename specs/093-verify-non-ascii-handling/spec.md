# Feature Specification: Verify Non-ASCII Handling

**Feature Branch**: `093-verify-non-ascii-handling`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "Verify non-ASCII handling — every tool that looks up notes, folders, headings, links or text patterns inside Obsidian handles names and text containing non-ASCII characters (accented letters, CJK characters, em-dashes, emoji) exactly as written, and each such tool has a repeatable check proving it. An earlier defect garbled non-ASCII input on its way into Obsidian; the fix was confirmed for some tools but never for every tool that passes caller text the same way."

## Background

Spec 034 (Fix Unicode Lookups) repaired a defect that garbled non-ASCII caller text on its way into Obsidian, so lookups for accented or CJK names silently failed or came back empty. That work confirmed the repair against a live vault for reading a heading, reading a property, finding notes by a property value, semantic search by free text and writing a property. Other tools that hand caller text to Obsidian the same way were covered only by in-process checks, which stand in for Obsidian and therefore cannot show whether text survives the real trip in. Some of those tools were added after spec 034. This item closes that gap for five capabilities: it proves, against a real vault, that each one handles non-ASCII names and text exactly as written, and it leaves behind a check that can be re-run on every release.

This item verifies; it does not repair. A failing check is a finding that becomes its own item.

## User Scenarios & Testing *(mandatory)*

All scenarios share one fixture set, described once here so the stories can refer to it:

- **Non-ASCII folder**: a folder whose name contains CJK characters.
- **Source note**: a note inside the non-ASCII folder whose own name contains accented letters and CJK characters. Its headings, at more than one level, contain an em-dash, accented letters and an emoji. Its body contains the token `café42` on a known line, and a link to the target note.
- **Target note**: a second note whose name contains accented letters and CJK characters, the destination of the source note's link.
- **Outside note**: a note outside the non-ASCII folder that also contains a token matching `café` followed by digits, so a folder-limited search has something to exclude.
- **Missing names**: a non-ASCII folder name and a non-ASCII note path, neither of which exists.

### User Story 1 — List the headings of a non-ASCII note (Priority: P1)

An agent asks for the headings of the source note, naming it by its non-ASCII path. Every heading comes back exactly as written, each with its level, so the agent can navigate notes whatever their names and heading text.

**Why this priority**: Headings are the agent's map of a note, and the source note exercises every character class in scope (CJK folder, accented and CJK note name, em-dash, accented letters and emoji in heading text) in one call. It is the broadest single proof.

**Independent Test**: Seed the source note, list its headings, and compare the result with the authored headings, character for character and level for level.

**Acceptance Scenarios**:

1. **Given** the source note, **When** the agent lists its headings, **Then** every authored heading is returned exactly as written, with its level, and no heading is missing or added.

---

### User Story 2 — List the links of a non-ASCII note (Priority: P1)

An agent asks for the outgoing links of the source note. The link to the target note comes back with the target name exactly as written, so the agent can follow it.

**Why this priority**: Following links is how an agent moves through a vault; a garbled target is a dead end the agent cannot detect.

**Independent Test**: Seed the source and target notes, list the source note's links, and compare the returned target with the authored link target.

**Acceptance Scenarios**:

1. **Given** the source note links to the target note, **When** the agent lists the source note's links, **Then** the link target is returned exactly as written.

---

### User Story 3 — List a non-ASCII folder (Priority: P1)

An agent lists the contents of the non-ASCII folder and sees its notes with their names exactly as written. Naming a non-ASCII folder that does not exist produces a folder-not-found error naming that folder as written, never an empty list.

**Why this priority**: A garbled folder name looks exactly like an empty or missing folder. The not-found case is the one that distinguishes "the folder is empty" from "the name was garbled on the way in".

**Independent Test**: Seed the non-ASCII folder, list it, and compare the returned names with the seeded notes; then list a non-ASCII folder name that does not exist and check the error.

**Acceptance Scenarios**:

1. **Given** the non-ASCII folder holding the source note, **When** the agent lists it, **Then** its notes are listed with their names exactly as written.
2. **Given** a non-ASCII folder name that does not exist, **When** the agent lists it, **Then** the agent gets a folder-not-found error that shows the folder name exactly as written, not an empty list.

---

### User Story 4 — Search with a non-ASCII pattern (Priority: P1)

An agent searches with a pattern containing a non-ASCII character, across the vault or limited to the non-ASCII folder, and gets the matching text and its line exactly as written.

**Why this priority**: Pattern search is the agent's only way to find text in a language other than English by shape rather than by exact phrase; a garbled pattern silently matches nothing.

**Independent Test**: Seed the source and outside notes, search for a pattern matching `café` followed by digits, then repeat the search limited to the non-ASCII folder.

**Acceptance Scenarios**:

1. **Given** the source note contains the token `café42`, **When** the agent searches for a pattern matching `café` followed by one or more digits, **Then** the match `café42` and the line containing it are returned exactly as written.
2. **Given** the same search limited to the non-ASCII folder, **When** it runs, **Then** only matches inside that folder are returned and the outside note's match is not among them.

---

### User Story 5 — Find notes similar to a non-ASCII note (Priority: P2)

An agent asks for notes similar to the source note, naming it by its non-ASCII path. Results come back and the source note itself is not among them. Naming a non-ASCII path that does not exist produces a not-found error showing the path as written.

**Why this priority**: Semantic discovery should work for every note, but the capability depends on an optional semantic-search plugin being installed and its index being built, so it rests on more preconditions than the other four and ranks below them.

**Independent Test**: Run read-only against the semantic-search vault named at run time (for this project, `My-Setup-Vault`), which already has the semantic-search plugin installed and indexed. First ask for a non-ASCII path that does not exist there. Then, if the owner has staged an indexed non-ASCII-path note, ask for notes similar to it; if not, the check reports `blocked`. The check writes nothing to that vault (see Clarifications C-001).

**Acceptance Scenarios**:

1. **Given** the owner has staged, in the semantic-search vault, a note whose path contains non-ASCII characters, and the semantic-search plugin has already indexed it alongside at least one other note, **When** the agent asks for notes similar to it, **Then** at least one result is returned and the source note itself is not among the results.
2. **Given** a non-ASCII note path that does not exist in the semantic-search vault, **When** the agent asks for notes similar to it, **Then** the agent gets a not-found error that shows the path exactly as written.
3. **Given** the staged non-ASCII-path note is missing from the semantic-search vault, or is present but not yet indexed, **When** the success check (scenario 1) runs, **Then** it reports `blocked`, names the missing precondition (note missing, or note not indexed), and reports neither pass nor fail.

---

### User Story 6 — Repeatable checks (Priority: P1)

A maintainer runs the checks for all five capabilities against a new release. Each check reports pass or fail on its own, and a failure names the capability and the input that failed, so a later change cannot quietly bring the garbling back.

**Why this priority**: The checks are the durable deliverable. A one-off manual confirmation proves today's build and nothing after it.

**Independent Test**: Run the full set of checks once; confirm each capability reports its own outcome. Then feed one check an input known not to match (for example, compare against a deliberately altered expected heading) and confirm the failure report names the capability and the input.

**Acceptance Scenarios**:

1. **Given** the checks for all five capabilities, **When** they are run against a release, **Then** each capability reports its own pass or fail, and one capability's failure does not stop or mask the others.
2. **Given** a check fails, **When** the maintainer reads its report, **Then** the report names the capability, the input that was sent, the result that was expected and the result that came back.
3. **Given** a run has finished, pass or fail, **When** the maintainer inspects the vaults, **Then** every fixture the run created in the test vault has been removed, nothing outside its scratch area was touched, and no note in the semantic-search vault was changed.
4. **Given** a check's precondition is not met, **When** the run reports, **Then** that check shows `blocked` with the missing precondition, and the other checks still report their own pass or fail.

---

### Edge Cases

- **Characters outside the Basic Multilingual Plane**: the emoji in the source note's headings is one that needs more than one code unit to store, so a check would catch text cut or split in the middle of such a character.
- **Mixed text**: heading text interleaves ASCII and non-ASCII characters (for example an ID, an em-dash, then accented words), so a check would catch corruption confined to part of a string.
- **Exact characters, no normalisation**: "exactly as written" means the same characters in the same order. Text that looks identical but is stored in a different Unicode normalisation form (a precomposed accented letter versus a base letter plus combining accent) is not expected to match, and the checks do not test equivalence across normalisation forms.
- **Empty versus not found**: for folder listing and similar notes, a missing non-ASCII name must produce a not-found error, never an empty success. An empty success is a check failure, because it is exactly how the original defect presented.
- **Not-found error text**: the name shown in a not-found error is compared character for character with the name sent. A not-found error showing a garbled name fails the check even though the error itself is the expected kind.
- **Pattern character classes**: the search pattern names `é` literally. Whether shorthand classes such as "any word character" match accented letters depends on pattern options, not on whether the text arrived intact, and is not tested here.
- **Folder-limited search with no matches outside**: the outside note guarantees the folder limit has something to exclude; without it, the folder-limited scenario could pass without proving the limit works.
- **A check that cannot run**: when a check's preconditions are not met (Obsidian not running, the vault not available, a required plugin missing, the owner-staged similar-notes note missing or not indexed), it reports `blocked` and names the unmet precondition, which counts as neither a pass, a fail nor a silent skip.
- **Staged note not yet indexed**: the semantic-search plugin indexes notes some time after they appear. A staged note that exists but has no index entry yet is `blocked` (precondition not met), not a fail; only a staged, indexed note whose similar-notes call misbehaves is a fail.
- **Semantic-search vault not available**: if the vault named at run time is not open in Obsidian, or does not have the semantic-search plugin loaded, both similar-notes scenarios report `blocked` with that reason; the not-found scenario cannot be proven until the plugin is loaded, because the plugin check comes before the path lookup.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Listing the headings of a note named by a path containing non-ASCII characters MUST return every authored heading exactly as written, each with its level.
- **FR-002**: Listing the outgoing links of a note named by a path containing non-ASCII characters MUST return each link target exactly as written, including targets whose names contain non-ASCII characters.
- **FR-003**: Listing a folder whose name contains non-ASCII characters MUST return its notes with their names exactly as written.
- **FR-004**: Listing a non-ASCII folder name that does not exist MUST produce a folder-not-found error that shows the folder name exactly as written, and MUST NOT produce an empty list.
- **FR-005**: Searching with a pattern containing non-ASCII characters MUST return each match and the line containing it exactly as written.
- **FR-006**: Searching with a non-ASCII pattern limited to a folder whose name contains non-ASCII characters MUST return only matches inside that folder.
- **FR-007**: Asking for notes similar to an indexed note named by a path containing non-ASCII characters MUST return results that do not include the source note itself.
- **FR-008**: Asking for notes similar to a non-ASCII note path that does not exist MUST produce a not-found error that shows the path exactly as written.
- **FR-009**: Each of FR-001 to FR-008 MUST be backed by a repeatable check that exercises the capability end to end against a real Obsidian vault, because the defect being guarded against occurs on the way into Obsidian and cannot be observed by a check that stands in for Obsidian. The checks MUST be delivered as one committed script with its own project command, which launches the built server and calls the five published tools as an agent would, so that a maintainer re-runs them with one command and no hand-followed steps (Clarifications C-002).
- **FR-010**: Each check MUST report pass or fail for its own capability independently; one check's failure MUST NOT prevent the others from running or reporting.
- **FR-011**: A failing check MUST report the capability, the input sent, the expected result and the actual result.
- **FR-012**: A check whose preconditions are not met MUST report `blocked` and name the unmet precondition, distinct from both pass and fail.
- **FR-013**: The checks for headings, links, folder listing and pattern search MUST run against the authorised test vault, MUST create their fixtures only inside its scratch area, and MUST remove every fixture they created when the run ends, whether it passed or failed.
- **FR-014**: "Exactly as written" MUST mean the same characters in the same order as authored or sent, with no case-folding, accent-stripping, whitespace changes or Unicode normalisation applied by the comparison.
- **FR-015**: This item MUST NOT change the behaviour, inputs, outputs or error codes of any tool. A failure the checks find MUST be recorded as a separate item rather than fixed here.
- **FR-016**: The similar-notes checks MUST run against a semantic-search vault named at run time, not fixed in the checks; the value this project passes is `My-Setup-Vault`.
- **FR-017**: The similar-notes checks MUST be read-only against the semantic-search vault: they MUST NOT create, change, move, rename or delete any note there, and MUST NOT seed or remove fixtures there. The only thing the script reads from that vault for the success check is the owner-staged note at the path it is given. The script writes and removes fixtures only in `TestVault-Obsidian-CLI-MCP`.
- **FR-018**: The similar-notes success check MUST take its source note from the owner, as a non-ASCII path staged in the semantic-search vault ahead of the run and passed to the script at run time. Before asking for similar notes it MUST confirm that the note exists and has been indexed; if either is not so, it MUST report `blocked` naming which precondition is missing, and MUST NOT report pass or fail.
- **FR-019**: The similar-notes not-found check MUST use a non-ASCII path that does not exist in the semantic-search vault, and MUST be provable against that vault as it stands, with no staged note.
- **FR-020**: The script MUST take, as run-time arguments, the test vault, the semantic-search vault and the path of the owner-staged similar-notes note; none of the three is fixed in the script.
- **FR-021**: The script MUST print one outcome line per scenario (pass, fail or `blocked`, with the details FR-011 and FR-012 require), in a form that can be kept as the evidence for the project's test-case records, and MUST end with a non-zero exit status when any scenario fails.

### Key Entities

- **Fixture set**: the non-ASCII folder, source note, target note, outside note and missing names described at the top of User Scenarios. Created in the test vault's scratch area for a run and removed after it. Used by Stories 1–4.
- **Staged similar-notes note**: a note with a non-ASCII path that the owner places in the semantic-search vault and lets the plugin index before a run. Owned and maintained by the owner; the checks only read it. Used by Story 5 scenario 1.
- **Semantic-search vault** (called the "semantic vault" in the plan, data model and contract): the vault the similar-notes checks run against, named at run time; the value this project passes is `My-Setup-Vault`. Read-only to the checks.
- **Check**: one repeatable verification of one capability against one scenario, with an expected result and a reported outcome.
- **Check script**: the one committed, runnable script that holds every check, takes the vaults and the staged note path at run time, and prints the per-scenario outcomes that serve as test-case evidence.
- **Check outcome**: pass, fail or `blocked`, plus (for fail) the capability, the input, the expected result and the actual result, and (for `blocked`) the unmet precondition.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All five capabilities in scope (headings, links, folder listing, pattern search, similar notes) have at least one repeatable check, and all nine acceptance scenarios in Stories 1–5 are covered by a check.
- **SC-002**: A single run of the full check set that reaches the server produces one outcome per scenario, with no scenario missing from the report. A run that cannot start (invalid arguments, or the built server cannot be launched) produces no report at all and says why, with a non-zero exit status distinct from a failing check.
- **SC-003**: When any one check is made to fail, the report identifies the failing capability and input without the maintainer needing to read the check itself or re-run anything.
- **SC-004**: After any run, pass or fail, the test vault holds no fixtures from that run and nothing outside its scratch area has changed, and the semantic-search vault is unchanged in every note.
- **SC-005**: The check set has been run once against the current release and its outcome is recorded; every failing scenario has a follow-up item opened for it, and every `blocked` scenario records which precondition was missing.
- **SC-006**: No tool's published inputs, outputs or error codes change as a result of this item.
- **SC-007**: The similar-notes not-found scenario reports pass or fail (never `blocked`) when run against `My-Setup-Vault` with Smart Connections loaded, with no note staged.
- **SC-008**: A maintainer re-runs every check against a new build with one command, following no manual steps beyond building the server, having Obsidian running with both vaults open and (for the similar-notes success scenario) staging the indexed note.

## Clarifications

### Session 2026-11-04

- **C-001** — Q: Which vault does the similar-notes check run in, given that the authorised test vault has no plugins and the similar-notes capability checks for its plugin before it looks up the path? → A: Run the similar-notes checks read-only against `My-Setup-Vault`, with the vault set at run time, not hard-coded. The checks never seed or remove fixtures there. The not-found scenario is proven there as the vault stands. The success scenario has a precondition: a non-ASCII-path note, staged by the owner and already indexed by Smart Connections; if that note is missing or not indexed, the check reports `blocked` and names the missing precondition, and reports neither pass nor fail. All other checks stay in `TestVault-Obsidian-CLI-MCP`. (Owner's ruling of 2026-11-04, recorded in BI-0087 Operational steps (a); consistent with GL-003 Test Execution Instructions, under which Smart Connections test cases that need an index run read-only against `My-Setup-Vault` and never make a destructive call there.) Applied to: User Story 5, Edge Cases, FR-012, FR-013, FR-016 to FR-019, Key Entities, SC-001, SC-004, SC-005, SC-007, Assumptions.
- **C-002** — Q: What form should the repeatable non-ASCII checks take, so that a maintainer can re-run them against each new release? → A: A committed script under `scripts/` with its own project command, in the style of `probe:stdio`. It launches the built server over stdio, takes the test vault, the semantic-search vault and the staged note path as run-time arguments, seeds and cleans up fixtures in the test vault itself, and prints one pass / fail / `blocked` line per scenario; it exits non-zero if any scenario fails, and is run by hand before a release. Two constraints apply: the script never writes to the semantic-search vault (there it only reads the owner-staged note path it is given, and reports `blocked` when that note is missing or not indexed), and it writes and removes fixtures only in `TestVault-Obsidian-CLI-MCP`. The script's output is the evidence for the vault test-case pages in BI-0087 step 4. (Owner ruling, consistent with GL-003.) Applied to: FR-009, FR-017, FR-018, FR-020, FR-021, Key Entities, SC-008, Assumptions.
- **C-003** — Q: Should this item also check the other tools that pass caller text into Obsidian the same way as the five, but are not among them (`backlinks`, `open_file`, `views_base`, `create_base`), or stay at five and leave those to a follow-up item? → A: Stay at five. BI-0087's Coverage matrix and Impact are written around exactly five tools, and its Out of scope section says not to widen the item. The four tools are recorded in BI-0087's Out of scope section as a known gap on the same payload route, left to a follow-up item, and the spec names them the same way. Applied to: Assumptions (known gap).

## Assumptions

- **Scope mapping to tools**: the five capabilities correspond to the existing tools `outline` (headings), `links` (outgoing links), `paths` (recursive folder listing), `pattern_search` (pattern search) and `smart_connections_similar` (similar notes). "Listing one folder level" in the out-of-scope list is the `files` tool, and "literal text search" is the `search` and `context_search` tools.
- **Headings are in scope although their route may differ**: the out-of-scope list excludes capabilities that pass text to Obsidian by a different route than the one the original defect affected. Listing headings may use the other route; it is kept in scope because the user named it explicitly as a story and acceptance criterion, and a check that passes costs little and still guards the capability.
- **Known gap on the same payload route, left to a follow-up item**: four more tools hand caller-supplied note or file names to Obsidian by the same payload route as the in-scope tools, and none of them is checked by this item: `backlinks` (a note's incoming links), `open_file` (show a note), `views_base` and `create_base` (a named base file). They are out of scope here because BI-0087 is written around exactly five tools and is not to be widened; they are recorded as a known gap in BI-0087's Out of scope section and are left to a follow-up item (Clarifications C-003). `tag`, which uses the same route, was confirmed live by spec 034 and is not part of the gap. `move` and `context_search` also use the route, but they fall under the user's out-of-scope list (moving notes, literal text search).
- **Test vault**: the headings, links, folder-listing and pattern-search checks run against the authorised test vault, `TestVault-Obsidian-CLI-MCP`, and confine fixtures to its scratch area, following the project's test-execution rules. That vault holds no plugins, which is why the similar-notes checks run elsewhere (Clarifications C-001).
- **Staging is the owner's job**: staging and maintaining the non-ASCII-path note in the semantic-search vault, and waiting for it to be indexed, is a manual owner step outside the checks. Until it is done, the similar-notes success scenario reports `blocked`; that does not stop this item from being done (see the next assumption).
- **A check is complete when it runs, not when it passes**: this item is done when every check exists, has been run against the current release and its outcomes are recorded, even if some fail; fixes are separate items.
- **Release under test**: "a new release" means the build of the server about to be published, run against the version of Obsidian installed on the maintainer's machine. The check script is run by the maintainer before a release, not automatically in continuous integration, because it needs a running Obsidian (Clarifications C-002).
- **Existing in-process checks stay**: the in-process checks added by spec 034 remain as they are; the new checks add the end-to-end layer and do not replace them.
