# Data Model: Clarify heading-path rules

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

No data structure, schema shape or stored state changes. This page records the domain rules the new documentation states, so tests and reviewers check the documentation against one definition.

## Entities

### Heading path

An ordered list of heading texts `[s1, s2, …, sN]`, N ≥ 2.

| Capability | Separator | Field |
|---|---|---|
| `read_heading` | `::` | `heading` |
| `patch_heading` | `#` | `heading_path` |

**Resolution rule** (both capabilities, research F1):

- R1: `s1` matches a level-1 heading of the note.
- R2: for k > 1, `sk` matches a level-k heading inside the section of the heading matched by `s(k-1)`.
- R3: the target is the heading matched by `sN`, so its level is N.
- R4: matching is case-sensitive and ATX-only; fenced code is opaque (patch_heading); the first document-order match wins on duplicate paths.

### Unreachable section

A section that no heading path can address:

| Case | Why | Whole-note alternative |
|---|---|---|
| U1: a level-1 section by itself | N ≥ 2 is required (one-segment paths fail validation) | `read` / `write_note` |
| U2: any section in a note with no level-1 heading | R1 cannot match | `read` / `write_note` |
| U3: any section below a skipped level on its branch (e.g. `###` directly under `#`) | R2 needs a level-k heading at every step | `read` / `write_note` |
| U4: a heading whose text contains the separator | the split cannot tell text from separator | `read` / `write_note` |
| U5: Setext headings | not ATX | `read` / `write_note` |

These cases are **not** unreachable:

- a skip below the target, or on a different branch;
- a section under the second or a later level-1 heading.

### Recovery guidance (heading-not-found)

An ordered pair: (1) the most common cause, which is a path that leaves out the level-1 heading or skips a level; (2) the fallback, which is listing the note's headings with `outline` and retrying. The order is fixed (FR-009).

## Invariants checked by tests

- I1: both descriptions and both parameter descriptions state R1 and R2 (contract L1, L2).
- I2: both help pages list U1 to U3 and name the whole-note alternative.
- I3: both heading-not-found guidances state (1) before (2).
- I4: `walkHeadings` returns `null` for U2, U3 and a path without the level-1 segment, and resolves a target with a skip below it and a target under a second level-1 heading (pins R1 to R3 for patch_heading).
- I5: the runtime texts in contract §4 are byte-identical before and after.
