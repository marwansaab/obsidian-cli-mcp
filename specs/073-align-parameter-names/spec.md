# Feature Specification: Align Parameter Names

**Feature Branch**: `073-align-parameter-names`
**Created**: 2026-10-31
**Status**: Draft
**Input**: User description: "Align parameter names — tools in the same family use the same parameter name for the same concept, so a call pattern learned on one family member works on its siblings. Old names keep working for a transition period with a clear deprecation notice, then fail with a validation error that names the new parameter. A written list records every renamed parameter and every deliberately different one. Out of scope: renaming tools, changing any tool's behaviour beyond its parameter names, adding tools or families."

## Background

An audit of the published input parameters of every tool found four concepts that carry different names across sibling tools, plus one naming-style outlier:

| Family | Concept | Current names | Mismatch |
|---|---|---|---|
| Property tools (`read_property`, `set_property`, `find_by_property`) | The frontmatter property being read, written or matched | `name` on `read_property` and `set_property`; `property` on `find_by_property` | A call carried from the read or write tool to the search tool fails validation. The search tool's own description warns about this. |
| Search and replace tools (`search`, `context_search`, `pattern_search`, `find_and_replace`) and `find_by_property` | Case handling | `case_sensitive` on the three search tools; `case_insensitive` on `find_and_replace` (opposite polarity); `caseSensitive` on `find_by_property` (camel case) | Three spellings, two polarities. |
| Search and replace tools | Folder scope (a vault-relative folder, searched recursively) | `folder` on the three search tools and `find_by_property`; `subfolder` on `find_and_replace` | Same concept, two names. |
| Bases tools (`bases`, `views_base`, `query_base`, `create_base`) | Location of the `.base` file | `base_path` on `views_base` and `query_base`; `path` on `create_base` | Same concept, two names. `path` also means "a note" on every note-targeting tool. |
| Bases tools | The view inside a Base | `view_name` on `query_base`; `view` on `create_base` | Same concept, two names. |
| `find_by_property` | List-matching switch | `arrayMatch` (camel case) | Every other multi-word parameter in the server is snake case. |

The note-targeting tools (`target_mode`, `vault`, `file`, `path`), the count and cap parameters (`total`, `limit`) and the query text (`query`) are already consistent.

## Clarifications

### Session 2026-10-31

- Q: Which name wins for the property being read, written or matched? → A: `name`, the name two of the three property tools already use and the name `set_property` echoes back in its result. Only `find_by_property` changes. (Informed default; no question asked.)
- Q: Does `find_and_replace`'s default case handling change when its parameter becomes `case_sensitive`? → A: No. Behaviour change is out of scope. Each tool keeps its current default; only the name and polarity of the switch align. `find_and_replace` stays case-sensitive by default, so its `case_sensitive` defaults to true. The differing defaults across the family are recorded in the convention record. (Informed default; no question asked.)
- Q: How does the transition period end — a server setting the operator controls, a fixed later release, or a calendar date? → A: A release-based trigger. This release accepts the old names with the same result and a deprecation notice in the response. Removal (an old name fails with a validation error that names the new parameter) ships in the next major release as a separate follow-up feature. There is no operator setting and no calendar date. FR-014 stays in this spec as the end-state contract, but the removal follow-up delivers and tests it, not this feature. This follows BI-0109's Impact note: "accept both names for one minor version, deprecate the old name with a runtime warning, remove in the next major".
- Q: Where does the deprecation notice go in a successful response? → A: In the result object itself. The three affected tools (`find_by_property`, `find_and_replace`, `create_base`) each gain one optional field with the same name on all three, present in both the text JSON and the structured result. It lists each old name used, its replacement and any polarity note, and is absent when only new names are used. The three tools' published result descriptions change deliberately to declare it.
- Q: Where does the naming convention record live? → A: In a new ADR (the next free number, a sibling of ADR-010, Typed Tool Names Mirror Upstream CLI Subcommand). It records the families, shared concepts, chosen names, the rename table and the exceptions, and is mirrored as a tracked page in `.docs-as-code/decisions/`. No constitution change and no new Constitution Compliance row.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Same concept, same name across a family (Priority: P1)

An agent learns a call on one tool and reuses the same parameter names on a sibling. It reads a property with `read_property` using `name`, then finds every note carrying that property with `find_by_property` using `name` too. It searches a folder with `context_search` using `folder` and `case_sensitive`, then previews a replacement in the same folder with `find_and_replace` using the same two parameters. It lists a Base's views with `views_base` using `base_path`, then adds an item to that Base with `create_base` using `base_path` and `view_name`. Every call validates on the first try.

**Why this priority**: This is the feature's purpose. Every mismatched name costs the agent a failed call and a retry.

**Independent Test**: For each family in the audit, send each sibling the same shared-concept parameter under its chosen name and confirm every call passes validation and behaves as the tool's existing behaviour for that concept.

**Acceptance Scenarios**:

1. **Given** the property read, write and search tools, **When** an agent names the property with `name`, **Then** all three accept it and act on that property.
2. **Given** the search and replace tools, **When** an agent sets case handling with `case_sensitive`, **Then** every tool in the family accepts it, and `true` means "match case exactly" and `false` means "ignore case" on every tool.
3. **Given** the search and replace tools, **When** an agent sets a folder scope with `folder`, **Then** every tool in the family accepts it and confines the operation to that folder, recursively.
4. **Given** the Bases tools that take a `.base` file, **When** an agent names the file with `base_path`, **Then** `views_base`, `query_base` and `create_base` all accept it.
5. **Given** the Bases tools that take a view, **When** an agent names the view with `view_name`, **Then** `query_base` and `create_base` both accept it.
6. **Given** `find_by_property`, **When** an agent sets list matching with `array_match`, **Then** the tool accepts it with the meaning `arrayMatch` has today.
7. **Given** two parameters that look alike but mean different things, **When** the audit decides, **Then** they keep distinct names and the difference is written in the convention record.

---

### User Story 2 - Old names keep working for a transition period (Priority: P2)

An agent has automation built on today's names, such as `find_by_property` with `property`, or `find_and_replace` with `subfolder` and `case_insensitive`. After the upgrade those calls still succeed and do exactly what they did before. Each response tells the agent which old name it used and which name replaces it. When the transition period ends, the same call fails with a validation error that names the new parameter, so the agent can fix the call in one step.

**Why this priority**: Renaming without a transition breaks every existing integration on upgrade day. The transition turns a breaking change into a warning, then into a clear, self-explaining error.

**Independent Test**: During the transition period, send each renamed parameter under its old name and confirm the result matches the result of the same call under the new name, plus a deprecation notice. The removal follow-up feature tests the post-transition scenarios (4 and 5) in the next major release: the same calls must each fail with a validation error naming the new parameter.

**Acceptance Scenarios**:

1. **Given** a call that uses a parameter's old name, **When** it is sent during the transition period, **Then** it succeeds with the same result as the new-name call, and the response says the old name is deprecated and names its replacement.
2. **Given** a `find_and_replace` call with `case_insensitive: true` during the transition period, **When** it runs, **Then** it behaves exactly as `case_sensitive: false`, and the notice explains the opposite polarity.
3. **Given** a call that gives both a parameter's old name and its new name, **When** it is sent at any time, **Then** it fails with a validation error naming both, and nothing is read or written.
4. **Given** the transition period has ended, **When** a call uses an old name, **Then** it fails with a validation error that names the new parameter, and nothing is read or written.
5. **Given** the transition period has ended, **When** a call uses an old name for an optional scope such as `subfolder`, **Then** the call is rejected and never runs with that scope silently dropped.

Scenarios 4 and 5 are the end-state contract (FR-014). The removal follow-up feature in the next major release delivers and tests them, not this feature.

---

### User Story 3 - A written naming convention (Priority: P3)

A maintainer adding a new tool to a family opens the convention record and finds each family, the concepts its tools share, the name each concept uses, every parameter this feature renamed (old name → new name), and every deliberate exception with the reason it stays different.

**Why this priority**: Without a written record, the next tool reintroduces the drift. The record does not change runtime behaviour, so it ranks after the two stories that do.

**Independent Test**: Read the convention record and check that every family and shared concept in the published tool surface appears, that every renamed parameter is listed with old and new names, and that every exception has a stated reason.

**Acceptance Scenarios**:

1. **Given** the audit is complete, **When** a maintainer reads the convention record, **Then** every family, its shared concepts, the chosen names and any justified exceptions are listed.
2. **Given** the convention record, **When** a maintainer compares it with the published tool surface, **Then** every renamed parameter appears with its old name, new name and transition status.

---

### Edge Cases

- **Opposite polarity**: `case_insensitive: true` maps to `case_sensitive: false`, and `case_insensitive: false` to `case_sensitive: true`. An omitted switch keeps each tool's current default.
- **Old and new name together**: rejected as a validation error naming both, even when the two values agree, so no call depends on which one wins.
- **Clients that drop undeclared parameters**: some MCP clients remove any parameter the published input description does not declare before the call reaches the server. Old names therefore stay declared, and marked deprecated, for as long as they are recognised. Otherwise an old optional scope (`subfolder`, `folder`) would be dropped in silence and a scoped `find_and_replace` would widen to the whole vault.
- **Required renamed parameter omitted**: a `find_by_property` call with neither `name` nor `property` fails as a missing `name`.
- **Old name with an invalid value**: validated by the same rules as the new name, and the error names the new parameter.
- **`find_and_replace` scope conflicts**: the existing rule that `folder` (today `subfolder`) cannot be combined with `file`, `path` or `active_note` keeps its behaviour under both names.
- **Error sub-codes that mention an old name**: existing machine-readable error sub-codes stay unchanged (for example, the folder-scope failures on `find_and_replace`). Renaming a stable error code is a behaviour change and out of scope. Human-readable error messages name the new parameter.
- **Results that echo a parameter**: result fields are not parameters and keep their names (for example, `set_property`'s result keeps its `name` field).

## Requirements *(mandatory)*

### Functional Requirements

**Consistent names**

- **FR-001**: `find_by_property` MUST accept `name` for the frontmatter property to match, with the meaning `property` has today, so `read_property`, `set_property` and `find_by_property` share one name for the property.
- **FR-002**: `find_and_replace` MUST accept `case_sensitive` for case handling, where `true` means "match case exactly". Its default MUST stay case-sensitive.
- **FR-003**: `find_by_property` MUST accept `case_sensitive` for case handling, with the meaning and default `caseSensitive` has today.
- **FR-004**: `find_and_replace` MUST accept `folder` for its folder scope, with the meaning, validation and conflict rules `subfolder` has today.
- **FR-005**: `create_base` MUST accept `base_path` for the `.base` file location, with the meaning and validation `path` has today.
- **FR-006**: `create_base` MUST accept `view_name` for the view inside the Base, with the meaning `view` has today.
- **FR-007**: `find_by_property` MUST accept `array_match` for list matching, with the meaning and default `arrayMatch` has today.
- **FR-008**: Each renamed parameter's published description MUST read the same as its siblings' description of the shared concept, except where a tool's default differs, which the description MUST state.
- **FR-009**: No tool's behaviour other than the names it accepts and the deprecation notice MAY change. Defaults, validation limits, error codes, side effects and every existing result field stay as they are. The only result change is the optional notice field of FR-011.

**Transition period**

- **FR-010**: During the transition period, every old name listed in FR-001 to FR-007 (`property`, `caseSensitive`, `arrayMatch`, `case_insensitive`, `subfolder`, `path` on `create_base`, `view` on `create_base`) MUST be accepted and MUST produce the same result as the equivalent call under the new name.
- **FR-011**: A successful call that used an old name MUST carry a deprecation notice in its result object, in one optional field that has the same name on `find_by_property`, `find_and_replace` and `create_base`. The notice MUST appear identically in the text result and the structured result, and MUST list each old parameter used, its replacement and, for `case_insensitive`, the opposite polarity. Calls that use only new names MUST omit the field. Each of the three tools' published result descriptions MUST declare the field, as a deliberate change to its result contract.
- **FR-012**: A call that supplies both a parameter's old name and its new name MUST fail with a validation error naming both, before any vault is read or written.
- **FR-013**: Old names MUST stay declared in each tool's published input description, marked deprecated with the replacement named, for as long as the server recognises them, so that clients that drop undeclared parameters still pass them through.
- **FR-014**: After the transition period, a call that uses an old name MUST fail with a validation error that names the new parameter, before any vault is read or written. An old name MUST never be silently ignored. *End-state contract: the removal follow-up feature delivers and tests this requirement, not this feature.*
- **FR-015**: Transition ends at the next major release; removal is a follow-up feature. This feature MUST NOT add an operator setting or a date that ends the transition early.

**Documented convention**

- **FR-016**: The project MUST hold the convention record as a new ADR, a sibling of ADR-010. The ADR's canonical authoring location is the vault (`200-Decisions/`), and the repository's `.docs-as-code/decisions/` holds a verbatim tracked mirror, kept byte-equal after each sync (ADR-010 Implementation: vault source plus repo mirror kept in lockstep). This feature writes the repository mirror under the placeholder number `ADR-NNN`, because the number is not yet allocated and the vault and repository numbering have drifted. The mirror carries a note that the vault copy is pending sync. The ADR carries no Constitution Compliance row, and this feature MUST NOT amend the constitution. The record lists every tool family, the concepts its tools share, the parameter name each concept uses, every renamed parameter (old name → new name, transition status) and every deliberate exception with its reason.
- **FR-017**: The convention record MUST list at least these deliberate exceptions with their reasons:
  - `heading` on `read_heading` (segments separated by `::`) and `heading_path` on `patch_heading` (segments separated by `#`) stay distinct, because their values use different syntax and changing the syntax is a behaviour change.
  - `mode` on `find_and_replace` (literal or regex) and `mode` on `patch_heading` (append, prepend or replace) share a name across families but mean different things.
  - `name` means a property on the property tools, a new file name on `rename` and a new item name on `create_base`.
  - `pattern` is always a regular expression on `pattern_search` but literal by default on `find_and_replace`.
  - The default for `case_sensitive` differs by tool: false on `search` and `context_search`, true on `pattern_search`, `find_and_replace` and `find_by_property`.
  - `find_and_replace` scopes a single note with `file`, `path` or `active_note` rather than `target_mode`, because aligning that is a change of shape, not of name.
- **FR-018**: Each affected tool's reference documentation and published description MUST use the new names, and MUST state the old names and the transition while they are recognised.

### Key Entities

- **Tool family**: a group of tools that serve one area (property tools, search and replace tools, Bases tools, note-targeting tools, heading tools) and that an agent is likely to use together.
- **Shared concept**: one idea that two or more tools in a family take as input (the property, case handling, folder scope, `.base` file location, view).
- **Parameter rename**: a pair of old name and new name on one tool, with its transition status (accepted with notice, or rejected).
- **Deprecation notice**: an optional result field, with the same name on all three affected tools, listing each old name used in the call, its replacement and any polarity note. It is absent when the call used only new names.
- **Deliberate exception**: two parameters that look alike but stay different, with the reason they stay different.
- **Convention record**: the ADR (canonical copy in the vault, verbatim tracked mirror in the repository) that lists families, shared concepts, chosen names, renames and exceptions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every shared concept in the convention record, a call that uses the chosen name passes validation on 100% of the family's tools that take that concept.
- **SC-002**: During the transition period, 100% of calls that use only old names return the same result as the equivalent new-name calls, and each carries a deprecation notice.
- **SC-003**: After the transition period, 100% of calls that use an old name fail before reading or writing anything, with an error that names the new parameter. (Measured by the removal follow-up feature in the next major release.)
- **SC-004**: Zero shared concepts in the published tool surface carry two different names within one family, apart from exceptions listed in the convention record with a reason.
- **SC-005**: The convention record has one table row for each of the 7 renamed parameters (tool, old name, new name, transition status) and one table row for each exception in FR-017 (parameters, reason), so a maintainer can check any parameter against it by lookup alone.

## Assumptions

- Families are as listed in the Background table; the note-targeting tools, the count and cap parameters and the query text are already consistent and need no rename.
- Parameters that share a name across different families but mean different things (FR-017) are not a defect, because a call pattern rarely crosses those families; they are recorded, not renamed.
- Each tool keeps its own default for case handling. Making the defaults agree would change behaviour and is out of scope.
- The deprecation notice is part of the tool's normal result object (FR-011), so an agent sees it without a separate call.
- Existing machine-readable error codes and sub-codes stay unchanged, even where their wording mentions an old name.
- The convention record is a new ADR authored in the vault (`200-Decisions/`) with a verbatim tracked mirror in `.docs-as-code/decisions/` (FR-016). This feature writes only the mirror, under `ADR-NNN`. Allocating the number, writing the vault copy and renaming the mirror happen at the next vault–repository sync (owner's Q2 ruling recorded on BI-0109).
- FR-009's "defaults stay as they are" means the runtime defaults. During the transition, the published input schema drops the JSON Schema `default` value for `find_by_property.array_match`, `find_by_property.case_sensitive` and `find_and_replace.case_sensitive`, so that the server can tell whether a call sent the new name alongside its old one (FR-012). The defaults themselves are unchanged, applied at parse time, and still stated in each parameter's description (plan research D3).
- The transition lasts from this release until the next major release. Removing the old names is a separate follow-up feature and depends on this one. The convention record marks each rename "accepted with notice" until that follow-up ships.
