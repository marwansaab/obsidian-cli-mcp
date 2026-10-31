# Research: Fix Section-Body Documentation

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-10-31

The Technical Context has no `NEEDS CLARIFICATION` items. This file records the decisions behind the plan and the facts each one rests on.

## R1. What `read_heading` returns at the start of a body

**Decision**: The help describes the current behaviour: the body is the text from the end of the matched heading line up to the next heading of any depth, or the end of the note, with exactly one leading line ending removed (`\r\n` if the text starts with it, otherwise `\n` if it starts with that). Nothing else is trimmed.

**Rationale**: `src/tools/read_heading/_template.ts` slices `text.slice(headings[matchIdx].position.end.offset, nextHeadingStart)`. The heading's `position.end.offset` falls at the end of the heading text, before its line ending. The template then runs `if(body.startsWith('\r\n'))body=body.slice(2); else if(body.startsWith('\n'))body=body.slice(1);`. That removed line ending is the heading line's own, so:

| Note layout after `## Section` | Raw slice | Returned body |
|---|---|---|
| blank line, then `Body text.` (LF) | `\n\nBody text.\n` | `\nBody text.\n` |
| blank line, then `Body text.` (CRLF) | `\r\n\r\nBody text.\r\n` | `\r\nBody text.\r\n` |
| `Body text.` directly under the heading (LF) | `\nBody text.\n` | `Body text.\n` |
| next heading directly under | `\n` | `` (empty) |
| only a blank line, then the next heading | `\n\n` | `\n` |
| heading is the last line, trailing line ending | `\n` | `` (empty) |
| heading is the last line, no line ending | `` | `` (empty) |

Spec 015 FR-010 also defines the body as starting on "the line **after** the matched heading marker", which agrees. The help page's "always begins with a leading `\n`" claim predates or ignores the strip and is the only statement that disagrees.

**Alternatives considered**: Changing the tool so it matches the old help (keep the heading's line ending). Rejected: the spec's Out of scope and FR-008 / FR-011 keep behaviour unchanged, and BI-0039 calls the change documentation-only.

## R2. Where the false claim lives

**Decision**: Edit only `docs/tools/read_heading.md`. The false claim appears in four places there: the overview caveat (line 7), the Output JSON block (line 54), the `content` row of the Output table (line 59), and the bodies shown in Examples 1–3 (lines 126, 142, 156).

**Rationale**: A repo-wide search for the caveat wording found it nowhere else. The other published descriptions stay consistent (FR-009). `READ_HEADING_DESCRIPTION` in `src/tools/read_heading/index.ts` says "the body bytes between the matched heading and the next heading marker", and the output schema's `content` is a bare `z.string()` with no description, so neither says anything about the first characters. `README.md:273` says "The content under one heading". `.docs-as-code/capabilities/read.md` makes no claim about the body's start. `CHANGELOG.md` gets its entries at release time, not per work item (the 0.9.0 entry landed in its own commit).

**Alternatives considered**: Changing `READ_HEADING_DESCRIPTION` to state the start-of-body rule as well. Rejected: it does not contradict the rule, editing it changes a published tool description (which would bring the MCP Tool Surface Standards and the schema fingerprint baseline into play), and FR-009 only asks for no contradiction.

## R3. How the worked examples are corrected

**Decision**: Change each example's shown body to drop the false leading `\n`, and state the example note's layout so an agent can check the body against it. Add a short "Start of body" behavioural note with a layout table (five rows, each backed by probes P1–P5) so every case in the spec's acceptance scenarios and edge cases is answered on the page.

**Rationale**: The examples name notes whose text is not shown, so a body like `"\nUse kebab-case.\n"` cannot be checked. Showing the layout (text directly under the heading) makes the shown body checkable (FR-007) and is the common case. A layout table answers SC-003 in one place and backs FR-003 to FR-005.

**Alternatives considered**: (a) Keep the leading `\n` in the bodies and change the notes to have a blank line under each heading. Rejected: that keeps the misleading picture that a leading line break is normal. (b) Fix the statements only and leave the examples alone. Rejected: FR-007 and User Story 3 require the examples to match.

## R4. How the claims are verified

**Decision**: One live probe on the authorised test vault `TestVault-Obsidian-CLI-MCP`, under `Sandbox/`, following `.memory/test-execution-instructions.md`. Fixtures are written straight to disk so the CRLF bytes are exactly as intended. Each fixture is read through the `read_heading` tool of a server built from this branch, so the observed body is what an agent receives. The results go in `contracts/t0-probe-findings.md`. No automated tests are added.

**Rationale**: The 2026-10-31 clarification (Option A) chose this. Writing fixtures straight to disk avoids any line-ending normalisation by a write tool, which would weaken the CRLF case. Reading through the tool, rather than a hand-built raw `eval`, observes the exact path the help describes, including the server's JSON envelope handling. Using a server built from this branch and probing before the doc edit also covers SC-004 (no behaviour change), because the doc edit cannot affect the runtime.

**Alternatives considered**: (a) A raw `Obsidian.com eval` with a hand-written slice expression. Rejected: it would test a copy of the logic, not the tool. (b) An in-process test of `JS_TEMPLATE`. Rejected by the clarification (docs-only, no new tests).

## R5. Fixture set

**Decision**: Eight probes (P1–P8), eleven reads over six fixture notes:

1. The six FR-010 layouts: blank line after the heading (LF, P1), blank line after the heading (CRLF, P2), text directly under the heading (P3), empty section (P4), a heading followed only by a blank line (P5, read in both an LF and a CRLF note because E4 states both bodies), and a heading on the note's last line (P8, with and without a trailing line ending, because E4 claims both return `""`).
2. Example-check reads matching the corrected Examples 1–3 layouts (P6, two reads; P7). Example 3's active-mode case is checked in specific mode on the same layout: target resolution does not affect slicing, and specific mode avoids depending on which note Obsidian has focused.

**Rationale**: The six layouts are exactly FR-010's list, and each body claim on the corrected page maps to a read. That is the analysis-remediation rule: every help claim is backed by a live probe. The example reads back SC-002 (100% of examples match). P8 does not gate the work. Its result decides E4's last-line wording, which stays only if both reads return `""`.

**Alternatives considered**: Probing active mode for Example 3. Rejected: it needs a focused note in the GUI, which an unattended run cannot set up reliably, and the body slice is the same code path.
