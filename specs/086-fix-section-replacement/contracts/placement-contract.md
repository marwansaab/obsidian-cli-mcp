# Contract: Placement and line endings for `patch_heading` and `patch_block`

**Feature**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

This contract lists the rows the tests must pin. Each row names the spec requirement it proves. The published surface stays unchanged (FR-011, FR-017) apart from one deliberate change: `UNSAFE_PLACEMENT` joins each tool's typed-error enumeration in its description. S1 and S5 check this.

## Fixtures

All fixtures derive from LF templates through one converter, so each mixed note and its uniform twin share their text by construction.

- `toCrlf(s)`: every `"\n"` becomes `"\r\n"`.
- `mixFmLfBodyCrlf(s)`: frontmatter lines keep LF, body lines get CRLF. This is the shape a property edit leaves on a CRLF note.
- `mixFmCrlfBodyLf(s)`: the reverse.

**Heading template `HT`**:

- a three-line frontmatter;
- `# Top`;
- `## First` with a two-line body;
- `## Middle` with a one-line body and a child `### Child` with its own body;
- `## Last` with a two-line body;
- a final line break.

**Block template `BT`**:

- a three-line frontmatter;
- a paragraph ending ` ^para`;
- a list item `- item ^li`;
- a two-row table followed by a marker-only line `^tbl`;
- a final line break.

## N: `_note-lines.ts` (pure)

| Row | Input | Expected | Proves |
|-----|-------|----------|--------|
| N1 | `"a\r\nb\nc"` | `splitNoteLines` → `["a\r\n","b\n","c"]` | V2 lossless, V3 |
| N2 | `"a\n"`, `""` | `["a\n"]`, `[""]` | V3 no phantom |
| N3 | mixed `HT` (both mixes), every index; and every heading `walkHeadings` resolves | `lineText(split[i])` equals the scanners' split rule at line `i`, and, through the real walker, `lineText(split[r.markerLineIndex]) === r.markerLineText` for every resolved heading `r` | V1, FR-001 |
| N4 | `"x\r\r\n"`, last line `"## H\r"` | `lineText` → `"x\r"`, `"## H"` | F10 |
| N5 | `["a\r\n","b\n","c"]`, anchors 0, 1 and 2 | `insertEnding` → `"\r\n"`, `"\n"`, `"\n"` (2 has none; nearest earlier is `"\n"`) | FR-005 |
| N6 | `["c"]` | `insertEnding` → `"\n"` | FR-005 default |
| N7 | edited `["a\r\n","new","b\n"]`, ending `"\r\n"`, final break true | `"a\r\nnew\r\nb\n"` | V5 |
| N8 | edited ending in a kept `"x\r\n"`, final break false | trailing `"\r\n"` stripped | V5a, FR-006 |
| N9 | prefix and suffix kept / prefix broken / suffix broken / overlap | `keepsOriginalAround` → true / false / false / false | FR-009 |

## H: `patch_heading` handler (`handler.line-endings.test.ts`)

| Row | Note | Call | Expected | Proves |
|-----|------|------|----------|--------|
| H1 | `mixFmLfBodyCrlf(HT)` | `replace` `Top#Last` with `"new1\nnew2"` | written = original up to the end of the `## Last` line, then `"\r\nnew1\r\nnew2\r\n"`, then nothing; everything before is byte-identical | US1 AS1, FR-002, FR-005, SC-001 |
| H2 | same | `replace` `Top#First` | old First body gone; `## Middle` onward byte-identical | US1 AS2, FR-002 |
| H3 | same | `replace` `Top#Middle` | Middle's direct body replaced; `### Child` subtree and `## Last` byte-identical | FR-002 (children kept) |
| H4 | `mixFmCrlfBodyLf(HT)` | H1–H3 again | same placements; new lines use `"\n"` (heading line is LF) | US1 AS3, FR-005 |
| H5 | both mixes | `append` and `prepend` on `Top#Middle` | content at the end of the reach / directly after the marker; every original byte kept in order around it | US2 AS2–3, FR-003 |
| H6 | `HT` (LF), `toCrlf(HT)`, both mixes | the same call in each mode | outputs equal after mapping `"\r\n"` → `"\n"` | US2 AS1, FR-007, SC-002 |
| H7 | both mixes, all three modes | any target | line-by-line, every line outside the edit point keeps its terminator | US3 AS1–2, FR-004, SC-003 |
| H8 | mixed note without a final line break, target `Top#Last` | `replace`, `append` | still no final line break | US3 AS3, FR-006 |
| H9 | `HT` and `toCrlf(HT)` | each mode | output equals the pre-change expected bytes (literal expectations, not recomputed) | US2 AS4, FR-008, SC-004 |
| H10 | mixed note | `read_heading`-equivalent re-walk of the written note | returns exactly the new body | US1 AS4 |
| H11 | `mixFmCrlfBodyLf(HT)` | `replace` `Top#Last` with content `"a\r\nb"` | the added lines are written `"a\nb\n"`: the heading line's ending, not the ending the agent typed | Edge case "content supplied with its own line endings", FR-005 |
| H12 | mixed note whose last line is `## Last\r` (a lone CR, no line feed) | `append` `Top#Last` with `"x"` | succeeds (no false `UNSAFE_PLACEMENT`); the written text is the original bytes, then the insert ending, then `x`; no final line break | Edge case "lone carriage returns", FR-009 (no false refusal), FR-006 |

## B: `patch_block` handler (`handler.line-endings.test.ts`)

| Row | Note | Call | Expected | Proves |
|-----|------|------|----------|--------|
| B1 | `mixFmLfBodyCrlf(BT)` | replace `para`, `li`, `tbl` in turn | only that block changes, with marker handling as today; bytes before and after are identical | US5 AS1, FR-014, SC-007 |
| B2 | `mixFmCrlfBodyLf(BT)` | same | same | US5 AS2, FR-014 |
| B3 | `BT`, `toCrlf(BT)`, both mixes | the same replacement | outputs equal after mapping `"\r\n"` → `"\n"` | US5 AS3, FR-015 |
| B4 | both mixes | each shape | kept lines keep their terminators; final line break kept | US5 AS4, FR-015 |
| B5 | `BT` and `toCrlf(BT)` | each shape | output equals the pre-change expected bytes | US5 AS6, FR-015 (FR-008 rule) |
| B6 | `mixFmLfBodyCrlf` of a note with `## Heading ^hd` in the body, and of a note whose only `^fm` token is inside the frontmatter | replace `hd`; replace `fm` | `CLI_REPORTED_ERROR` with `details.code: "BLOCK_ON_HEADING"` (`heading_shape: "atx"`); `CLI_REPORTED_ERROR` with `details.code: "BLOCK_NOT_FOUND"`; both with 0 writes and 0 renames | Edge cases (block on heading; marker in frontmatter), FR-016 |

## U: Unsafe placement (`handler.unsafe-placement.test.ts`, one per tool)

| Row | Setup | Expected | Proves |
|-----|-------|----------|--------|
| U1 | `vi.mock("./heading-walk.js")` with `importOriginal`; `walkHeadings` result shifted one line down | rejects `CLI_REPORTED_ERROR`, `details: { code: "UNSAFE_PLACEMENT", heading_path, path }`; fake fs records 0 writes, 0 renames, 1 read (no race re-read) | US4 AS1–2, FR-009, FR-010, SC-005 |
| U2 | `vi.mock("./block-scan.js")`; `findBlock` result shifted one line down | rejects `CLI_REPORTED_ERROR`, `details: { code: "UNSAFE_PLACEMENT", block_id, path }`; 0 writes, 0 renames | US5 AS5, FR-016, SC-005 |
| U3 | the existing suites (`handler.test.ts`, `handler.bytes-written.test.ts`, `index.test.ts`, `schema.test.ts` of both tools) | pass unedited: no other error code, detail or precedence moved | FR-010, FR-016 |

## S: Surface and docs

| Row | Check | Expected | Proves |
|-----|-------|----------|--------|
| S1 | `npm run baseline:write`, then `git diff src/tools/_register-baseline.json` | exactly two lines change: the `descriptionFingerprint` of `patch_heading` and of `patch_block`; every title, annotation, input-schema and output-schema fingerprint is unchanged; the FR-018 gate (`_register.test.ts`) then passes | FR-011, FR-017, SC-006 |
| S5 | each tool's `index.test.ts` (new case) | `PATCH_HEADING_DESCRIPTION` / `PATCH_BLOCK_DESCRIPTION` contains `UNSAFE_PLACEMENT` inside its typed-error enumeration | FR-010, FR-016 (published enumeration complete) |
| S2 | `docs/tools/patch_heading.md` | line-endings text matches E4/E5; error table has an `UNSAFE_PLACEMENT` row with recovery | FR-012 |
| S3 | `docs/tools/patch_block.md` | same, for blocks | FR-017 |
| S4 | `src/errors.ts` | unchanged; no new top-level code | FR-010, SC-006 |

## Error row text (help pages)

| Top-level `code` | `details.code` | `details.reason` | Trigger |
|---|---|---|---|
| `CLI_REPORTED_ERROR` | `UNSAFE_PLACEMENT` | — | The edit could not be placed safely under the named heading (`patch_heading`) or on the found block (`patch_block`), so the tool refused it. The note was not changed. Re-read the note and retry once; if it fails again, report it. This should not happen on any note. Carries `details.heading_path` or `details.block_id`, and `details.path`. |
