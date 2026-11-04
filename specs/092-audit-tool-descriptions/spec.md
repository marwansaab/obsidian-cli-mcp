# Feature Specification: Audit Tool Descriptions

**Feature Branch**: `092-audit-tool-descriptions`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "Audit tool descriptions. Before the first stable release, every tool's always-loaded description meets one quality bar — short, self-contained, free of internal project references and consistent with its sibling tools — with the full detail kept in the on-demand help, and a release audit records a verdict for every registered tool against that bar."

## Background

Agents load every tool description up front, before they call anything. Today the 35 registered tools publish about 62,000 characters of tool description between them, from about 220 characters for the shortest to about 4,050 for the longest, and most read as reference manuals: result shapes, caps, defaults, error codes and version history. Several quote internal ticket, requirement and decision numbers, and the help index repeats the same text with more of them. The help pages already hold the long reference, so the up-front text can be cut to what an agent needs to choose a tool without losing anything.

The server's published instructions already tell the agent which tool fits which task and say that `help` holds each tool's long reference. A standing project decision (ADR-040, Published Parameter Descriptions and Server Instructions) keeps cross-cutting rules in those instructions, keeps a one-line description on every parameter, and forbids repeating a "call help first" sentence in every tool description. This feature works inside that decision.

## Clarifications

### Session 2026-11-04

- Q: What per-tool and total character budgets should the up-front descriptions meet? → A: Option A. Owner ruling 2026-11-04, recorded on BI-0027: each tool description is at most 400 characters, and all tool descriptions together are at most 12,000 characters. Only the top-level `description` field counts toward these budgets. Parameter descriptions are checked for internal IDs and consistency but are not budgeted. These budgets replace BI-0027's A.1 "~40–80 tokens" figure. That figure came from ADR-005 (Token-Optimized Tool Definitions via Progressive Disclosure), which ADR-040 superseded, and ADR-040 set no number of its own.
- Q: Should each tool's entry in the help index be the exact same text as that tool's published description, or may it be written separately as long as it agrees? → A: Option B. Each index entry is the first sentence of the tool's published description, and a standing check enforces it. BI-0030 set the index format to one line per tool, each with a one-line summary, and BI-0027 Dimension B keeps that one-row-per-tool format. Copying the full description, up to 400 characters, would break that format. Using the first sentence keeps one source of text that can be checked mechanically. `help` keeps returning the index page byte for byte, so the rule is enforced by a test, not by rewriting the index at runtime.
- Q: When a detail cut from a tool's description is a rule about one of its inputs, may it also go into that input's own parameter description, or only onto the help page? → A: Option A. The help page always gets the detail. A rule about one input may also go into that input's parameter description, as at most one sentence, where that description does not already say it. Everything else goes to the help page only. ADR-040 gives each rule one home: a parameter rule lives in its parameter's one-line description, and `help` keeps the long examples and error rosters so the one-liners stay short. The target-mode combination rules already live once in the shared target-mode schema descriptions (ADR-040 decision 3), so no tool repeats them. `set_property`'s client caveat ("pass an explicit `type`" for non-string values) is not carried into any parameter description: the tool's notes record it as stale on 0.9.0 (that client honoured native value types when observed on 2026-11-03), and BI-0027 flags it as possibly stale.
- Q: How should the release audit report be produced: generated from the live tool list by a repeatable command, written by hand with a test checking its rows, or replaced by the test results alone? → A: Option A, with two additions. A repeatable command builds the report from the live tool list. It computes the mechanical verdicts and merges in the reviewer's judgement verdicts from a small hand-kept file. A judgement verdict recorded against an older description is shown as needing review, and the standing tests also enforce the mechanical checks. The additions: (1) each check gets exactly one verdict per tool, PASS, PARTIAL, FAIL or N/A, and every FAIL or PARTIAL gets a gap paragraph; (2) the command writes Markdown so the maintainer can file it as the release audit report. Filing the report is outside this feature. BI-0027's coverage matrix is generated at audit time from the live tool list, one row per registered tool, and is filed as a vault note. The formal audit run happens at the v1.0 ship gate, not in this feature.
- Q: When a later change edits a tool's description, should the standing tests fail until that tool's reviewer judgement verdicts are re-recorded, or should the stale verdict only show as "needs review" in the audit report? → A: Option A. The standing tests enforce only the mechanical checks, alongside the existing fingerprint baseline gate. A stale or missing judgement verdict shows as "needs review" in the audit report and is dealt with at the release audit. Per BI-0027's Status section, the item exists so that individual feature items need no description-quality sub-tasks: feedback gathers here as each feature ships, and one audit pass closes the loop just before v1.0. A per-PR gate on judgement verdicts would put that sub-task back on every feature, and BI-0027 also rules out mid-cycle audits.
- Q: How should the project check that an agent, reading only the short descriptions and the server instructions, picks the right tool for each task on its first try? → A: Option A. A reviewer walks through each routing line in the server instructions. For each one, the reviewer checks that the descriptions alone send the task to the routed tool, and that no sibling's description claims the same task. The result is recorded in the family-consistency judgement verdicts, with a FAIL or PARTIAL and a gap paragraph for any gap. In Best Practices (Connectors and Integrations), the check that a description alone is enough to guide use is a reviewer step, not a model evaluation. BI-0027 asks for no new evaluation tooling: its audit is scored by a reviewer per dimension, and Dimension E.1 covers cross-tool consistency.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Short up-front descriptions (Priority: P1)

An agent connecting to the server reads each tool's up-front description and learns, in a sentence or two, what the tool does and when to choose it over its siblings. The long reference (result shapes, caps, defaults, edge-case behaviour, error codes, examples) lives on the tool's help page, not in the description.

**Why this priority**: This is where nearly all the context cost sits, and it is the change outside users will notice. On its own it delivers most of the value.

**Independent Test**: List the published tools, measure each description, and read it: each one states purpose and when to use it within the per-tool budget. For every fact cut from a description, open that tool's help page and find the fact there.

**Acceptance Scenarios**:

1. **Given** any registered tool, **When** an agent reads its up-front description, **Then** the description states what the tool does and when to choose it, and its length is within the per-tool budget.
2. **Given** a detail removed from an up-front description, **When** the agent opens that tool's help page, **Then** the detail is there, with the same meaning.
3. **Given** a tool whose misuse loses data (it overwrites, deletes, moves, renames or bulk-replaces), **When** an agent reads its short description, **Then** the description still says that it does so.

---

### User Story 2 - No internal references (Priority: P1)

An agent reads the published tool list, every parameter description and the help index, and every sentence is about the tool. None quotes an internal ticket, requirement, decision, clarification, test-case or spec number, and none narrates how an earlier version behaved.

**Why this priority**: Internal identifiers are noise to every outside user and cannot be removed after the stable release without another surface change. The check is cheap and mechanical.

**Independent Test**: Scan the full published tool list (descriptions and every parameter description at every depth), the server instructions and the help index for the internal identifier patterns; the scan finds none.

**Acceptance Scenarios**:

1. **Given** the full published tool list, its parameter descriptions and the help index, **When** they are scanned for internal ticket, requirement, decision, clarification, test or spec identifiers, **Then** none are found.
2. **Given** a description or index entry that explains a past behaviour ("an earlier version of this entry said …", "lowered from … in …"), **When** the audit reads it, **Then** it fails the self-contained check; the current behaviour stays and the history goes.
3. **Given** a public name an agent can act on (an error code, an environment variable, a parameter name, a tool name), **When** the scan runs, **Then** it is not reported as an internal identifier.

---

### User Story 3 - Pointer to the full contract (Priority: P2)

From the up-front material the server publishes, an agent learns that each tool's help page holds that tool's full contract and how to open it, so it fetches detail only when it needs it.

**Why this priority**: Without the pointer, shortening the descriptions would leave agents guessing where the detail went. It is one statement, so it is cheap.

**Independent Test**: Read the server instructions: they say that `help` called with a tool's name returns that tool's full contract, and that calling it with no name lists every tool. The statement names no tool other than `help`, so it covers every registered tool.

**Acceptance Scenarios**:

1. **Given** any registered tool, **When** an agent reads the up-front material the server publishes, **Then** it is told that the help page holds that tool's full contract and how to open it.
2. **Given** a client that does not surface server instructions, **When** an agent reads the tool list, **Then** the `help` tool's own description still says it returns any tool's full contract by name.

---

### User Story 4 - Consistent related tools (Priority: P2)

An agent reading the members of a tool family (for example the search tools, or the property tools) finds that each names the others and says when to choose it instead, and none contradicts another. An input field shared across tools means the same thing, with the same default, on each, or the difference is stated.

**Why this priority**: Contradictory guidance sends agents to the wrong tool. It matters most after the descriptions are shortened, since each word carries more weight.

**Independent Test**: For each family in the family roster, read every member's when-to-use sentence and check that it names the other members and agrees with theirs. For each shared field in the shared-field roster, compare its description on every tool that has it.

**Acceptance Scenarios**:

1. **Given** a family of related tools, **When** an agent reads each member's guidance on when to use it, **Then** each names the others and none contradicts another.
2. **Given** an input field that appears on several tools, **When** an agent reads its description on each, **Then** its meaning and default agree, or the difference is stated in the field's description on the tool that differs.
3. **Given** a tool with no sibling (for example `help`), **When** it is audited, **Then** the family check is recorded as N/A rather than FAIL.

---

### User Story 5 - Total budget (Priority: P2)

A user whose agent loads this server sees the total size of the up-front descriptions stay within a stated budget, so the server does not crowd out the agent's working context.

**Why this priority**: The per-tool budget keeps each description short; the total budget keeps the server small as tools are added.

**Independent Test**: Sum the lengths of every published tool description and compare the total with the stated budget.

**Acceptance Scenarios**:

1. **Given** the full published tool list, **When** its up-front descriptions are measured, **Then** the total is within the stated budget.
2. **Given** a later change that adds a tool or lengthens a description past either budget, **When** the project's checks run, **Then** they fail and name the tool or the total.

---

### User Story 6 - Audit report (Priority: P3)

A maintainer preparing the stable release runs one repeatable command and gets a Markdown audit report that lists every registered tool with a verdict per quality check, and sees what blocks the release. The maintainer files that Markdown as the release audit report; filing it is outside this feature, and the formal run happens at the stable-release gate.

**Why this priority**: The report is the release gate's record. It depends on the checks above being defined, so it comes last.

**Independent Test**: Run the audit command on this feature's branch. The Markdown it prints has one row per registered tool, the row count equals the registered tool count, every row has exactly one PASS, PARTIAL, FAIL or N/A verdict for every check, and every FAIL or PARTIAL has a gap paragraph.

**Acceptance Scenarios**:

1. **Given** a release candidate, **When** the audit runs, **Then** every registered tool appears in the report with a verdict per check, the number of rows equals the number of registered tools, and each FAIL or PARTIAL verdict has a gap paragraph explaining the gap.
2. **Given** a tool whose failing check another open item will fix, **When** the audit runs, **Then** its row still fails that check, and its gap paragraph names the item that will fix it.
3. **Given** a tool added or removed since the last audit, **When** the audit runs again, **Then** the row count follows the registered tools without a manual edit to the tool roster.
4. **Given** a reviewer judgement verdict recorded against an earlier version of a tool's description, **When** the audit runs after that description changed, **Then** the report shows that verdict as needing review rather than as a current verdict, and the project's standing checks still pass.
5. **Given** the reviewer has recorded no judgement verdict for a tool, **When** the audit runs, **Then** the report shows that tool's judgement checks as needing review, and the mechanical verdicts are still computed.

---

### Edge Cases

- A tool whose essential safety caveat (irreversible deletion, vault-wide default scope, overwrite) cannot fit the per-tool budget: the caveat stays and other text goes; if it still does not fit, the audit records the failure rather than dropping the caveat.
- A detail that appears only in a description today and not on the help page: it moves to the help page in the same change, so nothing is lost.
- A detail recorded as stale or possibly stale (for example `set_property`'s client caveat about passing an explicit `type`): it is cut from the description and not added to any parameter description. The help page keeps what it already says, since help page wording is otherwise out of scope, and the audit row notes that the claim is possibly stale.
- A help page that contradicts the description it is replacing: the description's current, correct behaviour wins and the help page is corrected, but only for facts moved by this feature (wider help-page wording is out of scope).
- A tool registered only under some configurations (for example a tool offered only when an environment setting allows it): it is audited whenever it is registered, and the budgets hold for the largest tool list the server can publish.
- The server instructions are close to their own size limit (about 2,000 characters today, against a limit of 2,000): adding the help pointer must not push them over, so wording elsewhere in the instructions may need to be tightened.
- A family whose wording an earlier fix has just corrected (the Bases family): this feature shortens the corrected text and does not reopen the facts that fix settled.
- Text inside a parameter description that looks like an identifier but is public (an error code such as `UNSUPPORTED_FILE_TYPE`, an ISO date in an example, a heading such as `Q1 Goals` in an example): it is not reported.

## Requirements *(mandatory)*

### Functional Requirements

**The quality bar**

- **FR-001**: Every registered tool's up-front description MUST state what the tool does and when to choose it over its siblings, in one or two sentences, within the per-tool budget of 400 characters.
- **FR-002**: An up-front description MUST keep any statement an agent needs to avoid data loss: that the tool overwrites, deletes, moves, renames or bulk-replaces, and any default that widens its reach (such as a vault-wide default scope).
- **FR-003**: An up-front description MUST NOT carry the long reference: full result shapes, caps and limits, edge-case behaviour, error-code rosters or examples. Those belong on the help page.
- **FR-004**: Every detail removed from an up-front description MUST be present, with the same meaning, on that tool's help page after the change. A detail found only in the description MUST be moved to the help page in the same change.
- **FR-004a**: A removed detail that is a rule about one input MAY also be added to that input's parameter description, as at most one sentence, where that description does not already state it. Result shapes, caps, edge-case behaviour, error rosters and examples MUST go to the help page only. The target-mode combination rules MUST NOT be repeated per tool, because they already live once in the shared target-mode parameter descriptions.
- **FR-005**: The published tool descriptions, every parameter description at every depth, the server instructions and the help index MUST contain no internal identifiers: ticket numbers, requirement and success-criterion codes, decision numbers, clarification references, test-case numbers, spec numbers and user-story labels.
- **FR-006**: The published tool descriptions and the help index MUST describe each tool as it is now, without narrating earlier versions or internal project vocabulary that means nothing to an agent (for example ordinal "Nth typed-tool wrap" labels or "cohort divergence").
- **FR-007**: Public names an agent can act on (error codes, environment variable names, tool names, parameter names, file extensions) MUST NOT be treated as internal identifiers.
- **FR-008**: The server's published instructions MUST tell the agent that `help` called with a tool's name returns that tool's full contract and that `help` called with no name lists every tool, in wording that names no tool other than `help` (which, per ADR-040, holds the long reference), while staying within the instructions' existing size limits.
- **FR-009**: The `help` tool's own description MUST say that it returns any registered tool's full contract by name, so the pointer survives in clients that do not surface server instructions.
- **FR-010**: Per-tool descriptions MUST NOT repeat a "call help first" instruction (the existing rule from ADR-040 stands).
- **FR-011**: Every member of a family in the family roster MUST name the other members in its when-to-use guidance, and no two members' guidance may contradict each other.
- **FR-011a**: The family-consistency judgement MUST include a reviewer walk-through of every routing line in the published server instructions. For each line, the up-front descriptions alone MUST send the task to the routed tool, and no sibling's description may claim the same task. Any gap MUST be recorded as FAIL or PARTIAL, with a gap paragraph, on the affected tools' family-consistency verdicts.
- **FR-012**: Every input field in the shared-field roster MUST carry the same meaning and default in its description on every tool that has it, or state the difference in its description on the tool that differs.
- **FR-013**: The help index MUST keep one line per tool, and each tool's entry text MUST be, word for word, the first sentence of that tool's published description. The first sentence MUST therefore state what the tool does on its own. The help page is stored and returned unchanged; the rule is enforced by a standing check, not by building the index at runtime.
- **FR-014**: The sum of the lengths of every published tool description MUST stay within the total budget of 12,000 characters, measured on the largest tool list the server can publish.

**Rosters**

- **FR-015**: The feature MUST define a family roster naming each family of related tools and its members. At minimum: the text-search tools (`search`, `context_search`, `pattern_search`); the frontmatter-property tools (`read_property`, `set_property`, `find_by_property`, `properties`); the reading tools (`read`, `read_heading`, `read_property`); the note writers (`write_note`, `append_note`, `prepend`, `patch_heading`, `patch_block`, `find_and_replace`); the file operations (`move`, `rename`, `delete`); the folder-listing tools (`files`, `paths`); the link-graph tools (`links`, `backlinks`, `outline`; named `note-structure` in the plan's roster); the Smart Connections tools (`smart_connections_query`, `smart_connections_similar`); the active-file tools (`get_active_file`, `open_file`); and the Bases tools (`bases`, `views_base`, `query_base`, `create_base`).
- **FR-016**: The feature MUST define a shared-field roster naming each input field that appears on more than one tool and is checked for consistency. At minimum: `vault`, `target_mode`, `file`, `path`, `folder`, `case_sensitive`, `total` and `limit`.

**Enforcement and the audit**

- **FR-017**: The mechanical checks (per-tool budget, total budget, internal identifiers in every published text, the help pointer in the instructions and in the `help` description, each index entry matching the first sentence of its tool's description, and one report row per registered tool) MUST run with the project's standing checks, so a later change that breaks one fails and names the tool and the check. The judgement verdicts MUST NOT fail the standing checks. A stale or missing judgement verdict only shows as "needs review" in the audit report, so a feature that edits a description does not have to re-record judgement verdicts.
- **FR-018**: A repeatable audit command MUST print a Markdown report with one row per registered tool and exactly one verdict per check per tool. The checks are: purpose and when-to-use, per-tool budget, safety caveat kept, detail preserved on the help page, no internal identifiers, self-contained, family consistency, shared-field consistency, and help index agreement. Each verdict is one of PASS, PARTIAL, FAIL or N/A. A check that does not apply to a tool MUST be recorded as N/A, not as PASS.
- **FR-019**: The number of report rows MUST equal the number of registered tools, taken from the server's own published tool list each time the command runs, not from a hand-kept roster.
- **FR-020**: Every FAIL or PARTIAL verdict MUST have a gap paragraph that says what is missing or wrong. If another open item will fix the gap, the paragraph MUST name that item.
- **FR-021**: The report MUST record the per-tool budget, the total budget, the measured total, the date, and the release candidate it was run against.
- **FR-021a**: The command MUST compute the mechanical verdicts (per-tool budget, no internal identifiers, help index agreement) on every run. It MUST take the judgement verdicts (purpose and when-to-use, safety caveat kept, detail preserved, self-contained, family consistency, shared-field consistency) and their gap paragraphs from a small reviewer-kept record. Each judgement verdict MUST be recorded against the description text it was judged on. The command MUST show a judgement verdict as needing review when the tool's description has changed since it was recorded, or when no verdict has been recorded.
- **FR-021b**: The feature MUST deliver the command, the reviewer record filled in for every tool as of this feature's final descriptions, and the standing checks. Filing the report as the release audit note, and the formal audit run at the stable-release gate, are outside this feature.
- **FR-022**: The feature MUST NOT change any tool's behaviour, inputs, input rules, outputs or error codes. Only description text, parameter description text, the server instructions, the help index and the help pages it moves detail into may change.

### Key Entities

- **Up-front description**: the text a tool publishes in the tool list, read by every agent before any call. Measured in characters.
- **Help page**: a tool's on-demand long reference, returned by `help` with the tool's name. Holds the full contract.
- **Help index**: the page `help` returns, unchanged, when called with no name. It has one line per registered tool, and each entry is the first sentence of that tool's published description.
- **Server instructions**: the text the server publishes once at connection, holding the task-to-tool routing and cross-cutting rules.
- **Family roster**: the named groups of related tools whose when-to-use guidance must name each other and agree.
- **Shared-field roster**: the input fields that appear on several tools and must mean the same thing on each.
- **Audit report**: Markdown printed by the audit command. It has one row per registered tool and one PASS, PARTIAL, FAIL or N/A verdict per check, with a gap paragraph for every FAIL or PARTIAL, plus the budgets, the measured total, the date and the release candidate.
- **Reviewer judgement record**: a small hand-kept record of the judgement verdicts and gap paragraphs for each tool, each tied to the description text it was judged on, so that a later change to that text marks the verdict as needing review.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every registered tool's up-front description is at most 400 characters (today 4 of 35 tools meet that; the longest is about 4,050 characters).
- **SC-002**: The total of all up-front descriptions is at most 12,000 characters (today about 62,000 characters across 35 tools).
- **SC-003**: A scan of the published tool list, every parameter description, the server instructions and the help index finds 0 internal identifiers (today the published tool list alone carries several, and the help index more).
- **SC-004**: For 100% of details removed from descriptions, a reviewer finds the detail on that tool's help page.
- **SC-005**: Every family in the family roster has every member naming the others, with 0 contradictions between members; every field in the shared-field roster agrees across its tools or states its difference.
- **SC-006**: The audit report's row count equals the registered tool count, every row has exactly one verdict for every check, and 100% of FAIL and PARTIAL verdicts have a gap paragraph.
- **SC-007**: When the audit command runs at the end of this feature, every row is PASS or N/A on every check, apart from any FAIL or PARTIAL that another open item will fix, whose gap paragraph names that item. No judgement verdict shows as needing review.
- **SC-008**: In a reviewer walk-through of every routing line in the published server instructions, the up-front descriptions alone send each task to the routed tool, and no sibling's description claims the same task. The result is recorded in the family-consistency verdicts, and 100% of routing lines are PASS. No model evaluation is run.
- **SC-009**: 0 tool behaviours, inputs, outputs or error codes change: every existing behavioural test passes unchanged.

## Assumptions

- **Budget measure** (owner ruling, see Clarifications): the budgets count the characters of each tool's top-level description field only. Parameter descriptions are checked for internal identifiers and consistency but are not budgeted, because the constitution requires a one-line description on every parameter and ADR-040 already keeps them short.
- **Pointer placement**: the pointer to the full contract is stated once in the server instructions (plus in the `help` tool's own description), not repeated in each tool's description, which ADR-040 forbids. "The up-front material the server publishes" is read to include the server instructions.
- **Internal identifier patterns**: ticket numbers (`BI-NNNN`), requirement and criterion codes (`FR-NNN`, `NFR-NNN`, `SC-NNN`), decision numbers (`ADR-NNN`), clarification references (`Q1`, "the 2026-05-17 Q1 clarification"), test-case numbers (`TC-NNNNN`, `T0NN`), spec numbers ("spec 078") and user-story labels (`US6`). The exact patterns are fixed during planning and must not catch public error codes or example text.
- **Audit report destination**: the command prints Markdown, and the repository does not keep the report itself. The maintainer files it as a vault note at the stable-release gate, which is outside this feature. The mechanical checks also run with the project's standing test suite.
- **Judgement checks**: the reviewer records the judgement verdicts in the reviewer judgement record, and the command computes the mechanical ones (see FR-021a). Shared-field consistency counts as a judgement check because "the difference is stated" needs a reader. A mechanical pre-check may still flag shared fields whose descriptions differ.
- **Published-surface gate**: changing descriptions changes the published surface, so the project's deliberate-change gate for the published surface is reviewed and regenerated in the same change.
- **Existing hard cap**: the existing 4,096-character cap per description stays as a backstop; the per-tool budget is tighter.
- **Release**: "the first stable release" is the 1.0.0 release; this audit runs on its release candidate.

## Dependencies

- The already-filed mismatches from the latest test run (see Out of Scope) were fixed by BI-0174 (help pages and tool descriptions disagree with live behaviour), merged before this feature began. That fix brought `find_and_replace` under the 4,096-character cut (to about 4,050) and corrected the Bases family wording. This feature builds on that corrected text. It does not reopen those mismatches, but it still holds `find_and_replace` and the Bases tools to the same 400-character budget and the same checks as every other tool.
- ADR-040 (Published Parameter Descriptions and Server Instructions) stands: cross-cutting rules stay in the server instructions, every parameter keeps a description, and per-tool descriptions carry no "call help first" sentence.

## Out of Scope

- The specific help and description mismatches already filed from the latest test run: help page section names, example errors, quoted messages, recovery hints, the over-long `find_and_replace` description, unknown-vault wording and the Bases family wording.
- Changing any tool's behaviour, inputs or outputs.
- Translating descriptions into other languages.
- Help page wording and style beyond the checks above (help pages change only to receive detail moved out of descriptions, or to correct a fact moved by this feature).
