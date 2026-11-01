# Contract: heading-path wording for `read_heading` and `patch_heading`

**Feature**: [../spec.md](../spec.md) | **Research**: [../research.md](../research.md)

This contract fixes the published text that this BI changes and the runtime text it must leave alone. Wording may be polished during implementation, but each **load-bearing phrase** (§1) must appear verbatim, because the tests assert it.

## §1 Load-bearing phrases

Both capabilities' description, heading parameter description (L1, L2 only) and help page contain:

| Id | Phrase (verbatim) | Requirement |
|---|---|---|
| L1 | `level-1 heading` (with "starts at" / "first" in the same sentence) | FR-001, FR-002, FR-003 |
| L2 | `one level below the previous` | FR-001, FR-002, FR-003 |
| L3 | `no level-1 heading` | FR-007 |
| L4 | `skipped level` (or `skips a level`) | FR-007, FR-009 |
| L5 | `leaves out the level-1 heading or skips a level` | FR-009 (heading-not-found cause; must appear before the first mention of `outline` in that guidance) |

Forbidden in either capability's description, parameter description or help page (FR-004):

- `top-level headings are out of scope`, with one exception: a help page may carry the phrase **only** inside a verbatim quote of the frozen §4 `single-segment` validation message, and only under the conditions in §3 H2. Descriptions and parameter descriptions may not carry it at all.
- `Minimum two segments` / `≥2 segments` as a standalone rule with no explanation (see §3)
- `wrap the top-level heading in a parent`

**Why the exception exists**: the runtime message stays unchanged (spec Clarifications, Q1 = A; FR-006). It fires only for a one-segment path, where it is accurate, and the spec accepts remaining occurrences that are "accurate or corrected" (FR-011). Agents see that message, so the help page explains it. The quote must never read as "omit the level-1 heading".

## §2 Published descriptions (target text)

The description text below is the end state. It is delivered in three sentence groups, one per user story (tasks.md):

- **S-rule** (US1): the rule, the three-segment example and the failing shorter path, ending "…even though both headings exist."
- **S-unreach** (US2): the sentence that starts "Unreachable:".
- **S-cause** (US3): read_heading's closing "On HEADING_NOT_FOUND…" sentence, and patch_heading's `HEADING_NOT_FOUND` typed-error entry.

### `read_heading` — `READ_HEADING_DESCRIPTION`

Replace the sentence that starts "The heading field is a `::`-separated path with at least two non-empty segments" and ends "…plus client-side parse)." with:

> The heading field is a `::`-separated path that starts at the note's level-1 heading and names one heading per level down to the target: each later segment is the heading exactly one level below the previous one, so a level-3 target needs three segments (e.g. "Project::Tasks::Today"). Leaving out the level-1 heading ("Tasks::Today") fails with HEADING_NOT_FOUND even though both headings exist. Unreachable: a level-1 section by itself (one-segment paths are rejected), any section in a note with no level-1 heading, any section below a skipped level (e.g. a `###` directly under a `#`), headings whose text contains `::` literally, and Setext-style headings; use `read` for the whole note instead. On HEADING_NOT_FOUND the path most often leaves out the level-1 heading or skips a level; check that first, then list the note's headings with `outline`.

The rest of the description (body boundaries, token savings, ATX-only, matching rules) is unchanged.

### `read_heading` — `heading` parameter description

> Heading path: the note's level-1 heading first, then one heading per level down to the target, each one level below the previous, `::`-separated (e.g. "Project::Tasks::Today" for a level-3 heading). At least two segments, so the target is level 2 or deeper.

### `patch_heading` — `PATCH_HEADING_DESCRIPTION`

Replace the paragraph that starts "`heading_path` uses `#` as the segment separator. **Minimum two segments**" with:

> `heading_path` uses `#` as the segment separator. The path starts at the note's level-1 heading and names one heading per level down to the target: each later segment is the heading exactly one level below the previous one, so a level-3 target needs three segments (e.g. `Project#Tasks#Today`). Leaving out the level-1 heading (`Tasks#Today`) fails with `HEADING_NOT_FOUND` even though both headings exist. Unreachable: a level-1 section by itself (one-segment paths are rejected), any section in a note with no level-1 heading, any section below a skipped level (e.g. a `###` directly under a `#`), and headings whose literal text contains `#`; use `write_note` to rewrite the whole note instead. First match wins on duplicate sibling headings.

In the typed-errors paragraph, replace the `HEADING_NOT_FOUND` entry with:

> `HEADING_NOT_FOUND` (the path most often leaves out the level-1 heading or skips a level; check that first, then use [`outline`](./outline.md) to list the note's headings and retry)

### `patch_heading` — `heading_path` parameter description

> Heading path: the note's level-1 heading first, then one heading per level down to the target, each one level below the previous, joined by "#" (e.g. "Project#Tasks#Today" for a level-3 heading). At least two segments, so the target is level 2 or deeper; up to ${HEADING_PATH_MAX} characters.

## §3 Help pages (`docs/tools/read_heading.md`, `docs/tools/patch_heading.md`)

Each page MUST contain:

- **H1 Rule section**: a subsection titled *Heading-path rule* stating L1 and L2, with a three-line mapping such as `"Project::Tasks::Today" → # Project / ## Tasks / ### Today` (with `#` for patch_heading).
- **H2 "At least two segments" explained**: the validator's minimum is presented as "the target must be level 2 or deeper, and the path names the level-1 heading first". The one-segment validation message (§4) is quoted verbatim, in a code span or code block. The sentence **immediately after** the quote states that (a) the message refers to addressing the level-1 heading on its own, a one-segment path, and (b) every path still starts at the level-1 heading. On the patch_heading page this is the only place `top-level headings are out of scope` may appear (§1 exception); every occurrence of the phrase must be part of the full verbatim message.
- **H3 Unreachable sections**: a list naming (a) a level-1 section by itself, (b) any section in a note with no level-1 heading (L3), (c) any section below a skipped level (L4), with an example of each, plus the existing literal-separator and Setext cases. It states that a skip below the target, or in another branch, does not block the target, and that a path may start at any level-1 heading when there are several.
- **H4 Whole-note alternative**: `read` (read_heading page) / `write_note` (patch_heading page) is named for every unreachable case.
- **H5 Heading-not-found recovery**: the error-table row and the error example both state L5 before `outline`.
- **H6 Examples**: at least one three-segment example from a level-1 to a level-3 heading (read_heading Example 2 already qualifies; patch_heading's `Daily#Tasks#TODO` examples qualify), and at least one new example that shows the shorter path with the level-1 segment left out (`Naming::Casing` / `Tasks#TODO`) and its heading-not-found result.

`docs/tools/patch_heading.md` line 18 (routing table) is reworded to: "Patch a level-1 section (one-segment path) or any unreachable section | Not addressable by `patch_heading`; use `write_note` to rewrite the whole note."

## §4 Runtime text that MUST NOT change (FR-006, FR-012)

| Source | Text |
|---|---|
| `read_heading/schema.ts` `validateHeadingPath` | `heading must contain at least two \`::\`-separated segments (e.g. "H1::H2")` |
| `read_heading/schema.ts` `validateHeadingPath` | `heading segments must be non-empty (no leading/trailing \`::\`, no consecutive \`::\`)` |
| `patch_heading/schema.ts` `headingPathField` | `heading_path must contain at least two segments separated by '#'; top-level headings are out of scope` (+ `params: { code: "INVALID_HEADING_PATH", reason: "single-segment" }`) |
| `read_heading/handler.ts` | `read_heading: heading path not found in file (${detail})` |
| `read_heading/_template.ts` | `{ok:false,code:'HEADING_NOT_FOUND',detail:'segments: '+…+' not found in '+…}` |
| `patch_heading/handler.ts` | `Heading "${heading_path}" not found in "${relPath}"` with `details: { code: "HEADING_NOT_FOUND", heading_path, path }` |

All error codes, `details` keys, sub-reasons, the output schemas and the matching logic are unchanged.

## §5 Published-surface delta

| Tool | descriptionFingerprint | schemaFingerprint | titleFingerprint | annotationsFingerprint | outputSchemaFingerprint |
|---|---|---|---|---|---|
| `read_heading` | moves | moves (parameter description) | unchanged | unchanged | unchanged |
| `patch_heading` | moves | moves (parameter description) | unchanged | unchanged | unchanged |
| every other tool | unchanged | unchanged | unchanged | unchanged | unchanged |
