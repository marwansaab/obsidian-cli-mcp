# ADR-NNN — Shared parameter names within a tool family

- **Status:** Accepted — number not yet allocated; the canonical vault copy
  (200-Decisions/) is pending sync, after which this mirror is kept byte-equal
  to it
- **Date:** 2026-10-31
- **Source:** BI-0109, `specs/073-align-parameter-names/` (clarify Q1 and Q2,
  research D1 to D9)
- **Related:** ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand), the
  sibling convention for tool names; this record is its counterpart for
  parameter names

## Context

An audit of every tool's published input parameters found the same concept
under different names inside one family of tools:

- The property tools name the frontmatter property `name` on `read_property`
  and `set_property`, but `property` on `find_by_property`. A call carried from
  the read or write tool to the search tool failed validation, and
  `find_by_property`'s own description warned about it.
- Case handling was `case_sensitive` on the three search tools,
  `case_insensitive` (opposite polarity) on `find_and_replace` and
  `caseSensitive` (camel case) on `find_by_property`.
- Folder scope was `folder` on the search tools and `find_by_property`, but
  `subfolder` on `find_and_replace`.
- The `.base` file location was `base_path` on `views_base` and `query_base`,
  but `path` on `create_base`, where `path` also means "a note" on every
  note-targeting tool.
- The view inside a Base was `view_name` on `query_base` but `view` on
  `create_base`.
- `find_by_property`'s list-matching switch was `arrayMatch`, the only camel
  case parameter beside `caseSensitive`.

A call pattern an agent learns on one family member should work on its
siblings. Tool names already follow a written rule (ADR-010); parameter names
had none.

## Decision

1. **Within a tool family, one concept carries one parameter name.** The
   families, their shared concepts and the chosen names are:

   | Family | Tools | Shared concept | Chosen name |
   |---|---|---|---|
   | Property tools | `read_property`, `set_property`, `find_by_property` | The frontmatter property read, written or matched | `name` |
   | Search and replace tools | `search`, `context_search`, `pattern_search`, `find_and_replace`, with `find_by_property` | Case handling (`true` = match case exactly) | `case_sensitive` |
   | Search and replace tools | `search`, `context_search`, `pattern_search`, `find_and_replace`, with `find_by_property` | Folder scope (vault-relative, recursive) | `folder` |
   | Property tools | `find_by_property` | List matching | `array_match` |
   | Bases tools | `bases`, `views_base`, `query_base`, `create_base` | Location of the `.base` file | `base_path` |
   | Bases tools | `query_base`, `create_base` | The view inside a Base | `view_name` |
   | Note-targeting tools | every tool that addresses one note | Note targeting | `target_mode`, `vault`, `file`, `path` |
   | Listing and search tools | the tools that count or cap results | Count and cap | `total`, `limit` |
   | Search tools | `search`, `context_search`, `smart_connections_query` | Query text | `query` |
   | Heading tools | `read_heading`, `patch_heading` | The heading addressed | see the first exception below |

   Multi-word parameters use snake case.

2. **Renames.** Seven parameters move to the family name:

   | Tool | Old name | New name | Status |
   |---|---|---|---|
   | `find_by_property` | `property` | `name` | Accepted with notice until the next major release |
   | `find_by_property` | `arrayMatch` | `array_match` | Accepted with notice until the next major release |
   | `find_by_property` | `caseSensitive` | `case_sensitive` | Accepted with notice until the next major release |
   | `find_and_replace` | `case_insensitive` | `case_sensitive` (opposite value) | Accepted with notice until the next major release |
   | `find_and_replace` | `subfolder` | `folder` | Accepted with notice until the next major release |
   | `create_base` | `path` | `base_path` | Accepted with notice until the next major release |
   | `create_base` | `view` | `view_name` | Accepted with notice until the next major release |

3. **Deliberate exceptions.** These look alike, or differ, on purpose:

   | Parameters | Reason |
   |---|---|
   | `heading` on `read_heading` and `heading_path` on `patch_heading` | Their values use different syntax (segments separated by `::` and by `#`). Aligning the name would hide a syntax difference, and changing the syntax is a behaviour change. |
   | `mode` on `find_and_replace` and `mode` on `patch_heading` | Different families, different meanings (literal or regex; append, prepend or replace). A call pattern rarely crosses the two. |
   | `name` on the property tools, on `rename` and on `create_base` | It means a property, a new file name and a new item name respectively. Each use is the natural word in its own family. |
   | `pattern` on `pattern_search` and on `find_and_replace` | Always a regular expression on `pattern_search`; literal by default on `find_and_replace`, which has a `mode` switch. |
   | The default of `case_sensitive` | False on `search` and `context_search`; true on `pattern_search`, `find_and_replace` and `find_by_property`. Each tool keeps its current default, because aligning the defaults is a behaviour change. Each description states its default. |
   | `find_and_replace` single-note scope (`file`, `path`, `active_note`) instead of `target_mode` | Aligning it is a change of shape, not of name. |

4. **Shared wording.** A renamed parameter's published description opens with
   its siblings' wording of the concept, verbatim, and then adds only what
   differs for that tool: its default, or an input rule the MCP Tool Surface
   Standards require to be visible.

5. **Transition.** An old name stays accepted, with the same result as the new
   name, until the next major release:
   - the call's result carries `deprecated_parameters`, one entry per old name
     used (`parameter`, `replacement` and, for `case_insensitive`, a polarity
     `note`), in both the text result and `structuredContent`. The field is
     absent when only new names are used;
   - a call that sends an old name and its new name together is rejected with
     `VALIDATION_ERROR`, before anything is read, written or spawned, even
     when the two values agree;
   - the old keys stay published, marked `deprecated: true`, with a
     description naming the replacement, so clients that drop undeclared keys
     still pass them through;
   - validation of the resolved value reports the new name, and machine-readable
     error codes and `details` keys do not change.

   **End state.** The next major release removes acceptance in a follow-up
   feature. An old name then fails with a validation error naming the new
   parameter, before any vault is read or written; it is never silently
   ignored. `name` on `find_by_property` and `base_path` on `create_base`
   return to the published `required` list.

6. **New tools.** A new tool reuses its family's name for a shared concept and
   uses snake case. A future rename ships the same way: a deprecated alias,
   the `deprecated_parameters` notice, and removal at the next major release.

## Alternatives rejected

- **A server-wide alias table in the registration layer.** The published
  schema would still have to declare the old keys, so the shape would live in
  two places, and every tool's registration path would change for three tools.
  Each tool's own zod schema declares both names instead.
- **Accepting old and new together, letting the new name win.** It hides a
  conflicting call from the caller.
- **Ending the transition by an operator setting or a calendar date.**
  Ruled out in clarify: the trigger is the next major release.
- **Aligning the case-handling defaults.** A behaviour change, outside a
  naming decision.

## Consequences

- An agent can carry `name`, `case_sensitive`, `folder`, `base_path` and
  `view_name` between siblings.
- During the transition, `find_by_property.array_match`,
  `find_by_property.case_sensitive` and `find_and_replace.case_sensitive`
  publish no JSON Schema `default`, so the server can tell whether a call sent
  both names. The defaults are applied at parse time and stated in each
  description.
- `create_base`'s INVALID_BASE_PATH issues report `field: "base_path"`. Its
  `BASE_NOT_FOUND` details keep their `path` key, and `find_and_replace`'s
  INVALID_SUBFOLDER details keep their `subfolder` key.
- The removal follow-up is a breaking change and belongs in a major release.
