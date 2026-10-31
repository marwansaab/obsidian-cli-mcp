# Data Model: Fix Section-Body Documentation

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

No runtime data shape changes. The `read_heading` output stays `{ content: string }` (`readHeadingOutputSchema` in `src/tools/read_heading/schema.ts`, unchanged). This file defines the entities the documentation describes and the evidence the probe produces.

## Section body

The `content` string `read_heading` returns.

| Attribute | Rule |
|---|---|
| Start | Immediately after the matched heading line. The heading line's own line ending (`\r\n` or `\n`) is removed. |
| Content | Every character from there up to the next ATX heading of any depth, or the end of the note, exactly as stored: blank lines, indentation, and line endings included. |
| First characters | A line ending (`\n` in LF notes, `\r\n` in CRLF notes) only when the note has a blank line directly under the heading. Otherwise the first character of the text under the heading. |
| Empty | `""` when nothing follows the heading line before the next heading or the end of the note. A heading followed only by a blank line is not empty: its body is that blank line's line ending. |
| End | Ends with whatever line ending precedes the next heading, if any. Not trimmed. |

Relationship: one section body per (note, heading path) read. The duplicate-path rule (first in document order) is unchanged.

## Section-read help page

`docs/tools/read_heading.md`, returned by the `help` tool (`DOCS_DIR` resolves to `docs/tools/` at runtime and ships in the package through `package.json` `files`).

| Part | State after this change |
|---|---|
| Overview | The false "Leading-newline caveat" is replaced by an accurate start-of-body statement (FR-001 to FR-003, FR-006). |
| Output block and `content` row | The example body has no false leading `\n`, and the row states the start-of-body rule and line-ending faithfulness (FR-001, FR-002, FR-004, FR-006). |
| Empty-body paragraph | Still says an empty section returns `""` with no error, and adds that a heading followed only by a blank line returns one line ending (FR-005). |
| Behavioural notes | Gain a "Start of body" note with the layout table, and the CRLF / LF note covers the leading-blank-line case (FR-003, FR-004). |
| Examples 1–3 | Bodies match the stated note layouts (FR-007). |

Exact wording: [contracts/doc-correction-contract.md](contracts/doc-correction-contract.md).

## Probe evidence record

One row per probe read in `contracts/t0-probe-findings.md`.

| Field | Meaning |
|---|---|
| Probe ID | `P1`–`P8`, as in [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md). P5, P6 and P8 have two reads each. |
| Fixture | Sandbox note path and line-ending style. |
| Heading | The `heading` argument. |
| Expected body | JSON-escaped string predicted from the corrected help. |
| Observed body | JSON-escaped `content` as returned by the tool. |
| Verdict | `match` or `mismatch`. A `mismatch` on P1–P7 stops the doc edit and is reported. A P8 `mismatch` rewords E4's last-line clause to the observed bodies instead. |

The findings also record the capture date, the server build (branch and commit), the Obsidian CLI version, and the cleanup result.
