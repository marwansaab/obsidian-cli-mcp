# Contract: `docs/tools/read_heading.md` Correction

**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)

This contract fixes the edits to `docs/tools/read_heading.md`. Each block below gives the current text and the replacement. Wording may be polished during implementation, but each replacement must keep the facts listed under it, and the page as a whole must pass the checks at the end. If the probe (`t0-probe-findings.md`) observes a body different from the one predicted here, the probe wins: stop and report before editing.

## E1. Overview caveat (line 7)

Current:

> **Leading-newline caveat:** the body always begins with a leading `\n` byte (the line terminator after the matched heading line itself). Trim client-side if you need the body to start with prose.

Replacement:

> **Where the body starts:** the body begins right after the heading line. The heading line's own line ending is removed; everything after it, including blank lines, is returned exactly as written in the note. A body starts with a line break only when the note has a blank line directly under the heading (`\n` in a note with LF line endings, `\r\n` in a note with CRLF line endings). A body whose text sits directly under the heading starts with that text. Use the body as returned; removing a leading character can delete real content or leave a stray `\r`.

Facts kept: FR-001, FR-002, FR-003, FR-004, FR-006.

## E2. Output JSON block (line 54)

Current: `{ "content": "\nUse kebab-case.\n" }`

Replacement: `{ "content": "Use kebab-case.\n" }`

## E3. Output table, `content` row (line 59)

Current description:

> The body bytes of the matched heading. The body always begins with a leading `\n` byte (the line terminator after the heading line itself); trim client-side if you need the body to start with prose. Line endings (CRLF or LF), fenced code blocks, table pipes, list indentation, and inline markdown are preserved byte-for-byte.

Replacement description:

> The body of the matched heading: everything after the heading line's own line ending, up to the next heading of any depth or the end of the note. It starts with a line break only when the note has a blank line directly under the heading. Line endings (CRLF or LF), blank lines, fenced code blocks, table pipes, list indentation, and inline markdown are preserved byte-for-byte.

Facts kept: FR-001, FR-002, FR-003, FR-006.

## E4. Empty-body paragraph (line 61)

Current:

> A heading whose body is empty (next heading marker appears on the very next line, with no intervening prose) returns `{ "content": "" }` — NOT an error. This is the structural empty-body case.

Replacement:

> A heading whose body is empty (the next heading marker is on the very next line, or the heading is the note's last line) returns `{ "content": "" }` — NOT an error. This is the structural empty-body case. A heading followed only by a blank line before the next heading is not empty: its body is that blank line's line ending (`"\n"`, or `"\r\n"` in a CRLF note).

Facts kept: FR-005. Backed by P4 (next heading directly under), P5 (only a blank line, LF and CRLF) and P8 (heading on the last line). The "or the heading is the note's last line" clause stays only if both P8 reads return `""`. Otherwise reword it to state the observed bodies exactly (per the P8 rule in `t0-probe-plan.md`).

## E5. New behavioural note, "Start of body" (insert before "### CRLF / LF line endings")

> ### Start of body
>
> The heading line's own line ending is never part of the body. What follows depends on the note:
>
> | Lines under `## Section` | Returned `content` |
> |---|---|
> | `Body text.` directly under the heading | `"Body text.\n"` |
> | a blank line, then `Body text.` (LF note) | `"\nBody text.\n"` |
> | a blank line, then `Body text.` (CRLF note) | `"\r\nBody text.\r\n"` |
> | only a blank line, then the next heading | `"\n"` |
> | the next heading directly under | `""` |

Facts kept: FR-003, FR-004, FR-005. Every row is a probed layout (P1–P5).

## E6. CRLF / LF note (line 83)

Current:

> Returned `content` carries the file's on-disk line endings byte-faithfully. A CRLF-encoded file yields `\r\n` byte pairs; an LF-encoded file yields `\n`. The wrapper does NOT normalise.

Replacement:

> Returned `content` carries the file's on-disk line endings byte-faithfully, including a leading blank line: a CRLF-encoded file yields `\r\n` byte pairs (so a body under a blank line starts with `\r\n`); an LF-encoded file yields `\n`. The wrapper does NOT normalise. Only the heading line's own line ending, in either style, is removed.

Facts kept: FR-004.

## E7. Worked examples (lines 126, 142, 156)

| Example | Current shown body | Replacement text |
|---|---|---|
| 1 | `Returns { "content": "\nUse kebab-case.\n" } for the body of the ## Naming section under # Best Practices.` | `For a note where Use kebab-case. sits directly under ## Naming (under # Best Practices), returns { "content": "Use kebab-case.\n" }.` |
| 2 | `… Returns { "content": "\nUse lowercase letters and dashes.\n" }.` | `… With Use lowercase letters and dashes. directly under ### Casing, returns { "content": "Use lowercase letters and dashes.\n" }.` |
| 3 | `… Returns { "content": "\nHello.\n" }. If no note is focused, raises ERR_NO_ACTIVE_FILE.` | `… With Hello. directly under ## Section A, returns { "content": "Hello.\n" }. If no note is focused, raises ERR_NO_ACTIVE_FILE.` |

Markdown code spans are kept as on the current page. Facts kept: FR-007; bodies are checked by P6 and P7.

## Amendment: one canonical statement (PR #96 review)

The edits above stated the start-of-body rule in five places on one page (E1, E3, E4, E5, E6). The old defect was one false claim kept in two places, and `help` serves the page whole, so the review asked for one full statement with pointers. The page as merged differs from the replacement text above as follows; every FR stays met, only where the facts sit has moved.

| Edit | As merged | Facts now carried by |
|---|---|---|
| E1 | One short paragraph: body starts right after the heading line with that line's ending removed; everything after it returned as written; use it as returned (removing a leading character can delete content or leave a stray `\r`); pointer to Start of body. | FR-001, FR-002, FR-006 here; FR-003, FR-004 in E5 |
| E3 | Body runs to the next heading of any depth or the end of the note; pointer to Start of body; preservation sentence unchanged. | FR-003 in E5 |
| E4 | Empty body returns `""`, NOT an error; a heading followed only by a blank line is not empty; pointer to Start of body. | FR-005 here and in E5 |
| E5 | Intro states FR-003 in full (line break only under a blank line; text directly under starts the body) and that the heading line's ending is removed in either style. The table gains the CRLF "only a blank line" row (`"\r\n"`, P5 on F2) and the "heading is the note's last line" row (`""`, P8). | FR-001, FR-003, FR-004, FR-005 |
| E6 | Reverted to the original paragraph; the leading-blank-line CRLF case lives in E5's table. | FR-004 in E5 |

Page checks 1, 3 and 4 below are unchanged. Page check 2 now reads: no shown `content` value begins with `\n` or `\r\n` except the four Start of body rows that describe a blank line under the heading.

## Untouched

Everything else on the page, every other file under `docs/tools/`, `src/**`, and all `*.test.ts` files (FR-008, FR-011).

## Page checks (after edit)

1. `docs/tools/read_heading.md` has no match for `always begins`, `Leading-newline`, `leading \`\n\` byte`, or `[Tt]rim client-side` (FR-006, SC-001).
2. No shown `content` value on the page begins with `\n` except the rows that describe a blank line under the heading (E4, E5) (SC-001).
3. Each shown body in E2, E4, E5 and E7 equals the observed body of its probe in `t0-probe-findings.md` (FR-007, FR-010, SC-002, SC-005). No body claim on the page lacks a backing probe read.
4. `git diff --stat main...HEAD` plus `git status --short` list only `docs/tools/read_heading.md`, files under `specs/069-fix-section-body-docs/`, `CLAUDE.md` (active-plan pointer) and `.specify/feature.json`. Nothing under `src/**` and no `*.test.ts` (FR-011).
