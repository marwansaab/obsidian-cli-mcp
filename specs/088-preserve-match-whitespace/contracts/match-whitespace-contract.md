# Contract: context_search returns untrimmed line text

**Feature**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md) | **Research**: [../research.md](../research.md)

Row IDs are referenced by tasks.md and post-implement.md. Every row names the requirement it proves.

## Published surface (unchanged)

- **P1** (FR-010, SC-004): `_register-baseline.json` does not move. The FR-018 fingerprint gate passes without `npm run baseline:write`.
- **P2** (FR-010): `CONTEXT_SEARCH_DESCRIPTION`, `contextSearchInputSchema` and `contextSearchOutputSchema` are byte-identical to HEAD `03594f1`.
- **P3** (FR-008, SC-005): `src/tools/search/handler.ts` is unchanged, and every existing test in `src/tools/search/**` passes unedited.

## Error contract (FR-011, Clarification Q1)

| Condition | `code` | `details` |
|-----------|--------|-----------|
| A selected row's note no longer exists in Obsidian | `CLI_REPORTED_ERROR` | `{ code: "MATCH_LINE_UNAVAILABLE", reason: "note-not-found", path, line }` |
| `cachedRead` threw for a selected row's note | `CLI_REPORTED_ERROR` | `{ code: "MATCH_LINE_UNAVAILABLE", reason: "read-failed", path, line, detail }` |
| The line is past the note's end, or its trimmed text differs from the CLI's trimmed text | `CLI_REPORTED_ERROR` | `{ code: "MATCH_LINE_UNAVAILABLE", reason: "line-changed", path, line }` |
| The read-back answer is missing or not JSON | `CLI_REPORTED_ERROR` | `{ stage: "json-parse", stdout, stdoutLength }` |
| The answer fails the envelope schema, or omits a requested path or line | `CLI_REPORTED_ERROR` | `{ stage: "envelope-parse", stdout, stdoutLength }` |
| The eval call itself fails (exit code, timeout, output cap, unknown vault) | as raised by `invokeEval` | unchanged |

- `path` and `line` name the first failing row in output order (path, then line).
- The message reads: `` context_search: line <line> of "<path>" could not be read back (<reason>); the note may have changed during the search. Run the search again. ``
- No partial result is returned in any of these cases.
- No new top-level code is added, and `src/errors.ts` is unchanged.

## T: read-back template (`context_search/_template.ts`, run under `runEvalTemplate`)

| ID | Stub `app` and payload | Expected answer | Proves |
|----|------------------------|-----------------|--------|
| T1 | one note `"a\n\tb  \nc"`, lines [2] | `read`, `[{line: 2, raw: "\tb  "}]` | E4, FR-002, FR-003 |
| T2 | CRLF note `"x\r\n  y \r\n"`, lines [2] | `raw: "  y \r"` (the `\r` is stripped later, in TS) | E4, FR-004 |
| T3 | `"m\rn"`, lines [1] | `raw: "m\rn"` | F5, mid-line `\r` kept |
| T4 | note with 2 lines, lines [5] | `raw: null` | V10 input |
| T5 | path not found (`getAbstractFileByPath` → null), and a folder at the path | `state: "note-not-found"` for both | FR-011 |
| T6 | `cachedRead` rejects with `Error("boom")` | `state: "read-failed", detail: "boom"` | FR-011 |
| T7 | two notes, lines in the order given | answer keeps the request's note and line order | V5 |
| T8 | non-ASCII path and line (`"Ünï/ç.md"`, `" é "`) | round-trips exactly | composeEvalCode UTF-8 decode |
| T9 | — | `JS_TEMPLATE.length <= 900` | V6, D3 |

## R: read-back module (`context_search/read-back.ts`, `makeQueuedSpawn`)

| ID | Setup | Expected | Proves |
|----|-------|----------|--------|
| R1 | rows across two notes; one eval answer | one eval spawned; texts are `lineText(raw)`; order preserved | D1, V5 |
| R2 | 200 rows over 200 notes with 40-char paths, plus one note with 600 matched lines | ≥ 2 evals; every recorded `code=` argv value is < 3,000 chars and each composed code ≤ `READ_BACK_CODE_MAX` (2900); the 600-line note spans batches; every row is restored and result order equals input order | D3, V6, F10 |
| R14 | a single row whose path is 1,000 characters | one eval, within the budget | V6 (a batch always holds ≥ 1 row) |
| R3 | `vault: "X"` | every eval argv carries `vault=X`; with `vault` undefined, no `vault=` | F4 |
| R4 | answer `note-not-found` for a row's note | throws per the error contract, `reason: "note-not-found"`, that row's `path` and `line` | FR-011 |
| R5 | answer `read-failed` | `reason: "read-failed"`, `detail` carried | FR-011 |
| R6 | `raw: null` | `reason: "line-changed"` | FR-007, FR-011 |
| R7 | `raw` whose trim differs from the CLI text's trim | `reason: "line-changed"` | FR-007, FR-011 |
| R8 | `raw` `" x\t"` against CLI text `"x"`; and `"  x  \r"` against `"x"` | accepted (trim equality); texts `" x\t"` and `"  x  "` | F6, V8 |
| R9 | two failing rows in different notes | the error names the first in output order | V10 |
| R10 | answer not JSON / no tagged answer | `stage: "json-parse"` | V7 |
| R11 | answer missing a requested line, or wrong shape | `stage: "envelope-parse"` | V7 |
| R12 | eval exits non-zero | `invokeEval`'s error propagates unchanged | Principle IV |
| R13 | a second batch fails after the first succeeded | the whole call throws; no rows returned | FR-011 |
| R15 | line 1 `raw` `"﻿  zqx bom"` against CLI text `"zqx bom"`; and line 2 `raw` `"﻿zqx"` against `"zqx"` | line 1 text is `"  zqx bom"` (the leading U+FEFF of line 1 dropped); line 2 text keeps its U+FEFF (only a note's very first character is a byte-order mark) | spec Assumption (BOM), V8 |
| R16 | one note answered `note-not-found` in one batch, with rows from that note spanning two batches | both batches' rows resolve to that note's state; the error names the first of its rows | V10, per-path state |

## L: selection (`search/line-matches.ts`)

| ID | Expected | Proves |
|----|----------|--------|
| L9 | `selectLines` returns raw CLI text, uncapped (a 600-char text stays 600) | D2 |
| L10 | `selectLines` membership, order and `truncated` equal `lineMatches`'s for the same input | D2, FR-006 |
| — | every existing `line-matches.test.ts` row passes unedited | F2, FR-008 |

## H: handler (`context_search/handler.whitespace.test.ts`, through `executeContextSearch`)

| ID | Note line (eval `raw`) / CLI text | Expected `text` | Proves |
|----|-----------------------------------|-----------------|--------|
| H20 | `"\tzqx tab"` / `"zqx tab"` | `"\tzqx tab"` | US1 AS1, FR-002 |
| H21 | `"    zqx four"` / `"zqx four"` | `"    zqx four"` | US1 AS2 |
| H22 | `"zqx plain"` / `"zqx plain"` | `"zqx plain"` | US1 AS3 |
| H23 | `"zqx two  "` / `"zqx two"` | `"zqx two  "` | US2 AS1, FR-003 |
| H24 | `"zqx crlf\r"` / `"zqx crlf"` | `"zqx crlf"` | US2 AS2, FR-004 |
| H25 | `"zqx crlf  \r"` / `"zqx crlf"` | `"zqx crlf  "` | US2 AS3 |
| H26 | `"zqx tab\t"` / `"zqx tab"` | `"zqx tab\t"` | US2 AS4 |
| H27 | `"      " + "a".repeat(600)` / trimmed | first 500 chars of the untrimmed line + `…` | FR-005, SC-002 |
| H28 | 498 spaces + `"zqx"` / `"zqx"` | 500 chars, no `…` | FR-005 boundary |
| H29 | three files, limit 2 | `count`, `truncated`, paths, lines, order equal the pre-change values for the same wire | FR-006, SC-003 |
| H30 | zero-match sentinel (with and without folder) | no eval spawned; envelope unchanged | FR-006 |
| H31 | note-not-found answer | whole call rejects with the error contract; no matches | FR-011, SC-006 |
| H32 | `raw` with different text | rejects `line-changed` | FR-011, SC-006 |
| H33 | `vault: "V"` | the search and the eval both carry `vault=V` | F4 |
| H34 | line 1 `raw` `"﻿\tzqx bom"` / `"zqx bom"` | `"\tzqx bom"` | spec Assumption (BOM) |
| H35 | wire lists line 3 twice (`"zqx dup"` both times); note line `"  zqx dup  "` | one row, text `"  zqx dup  "`, count 1 | spec edge case "same line found more than once" |

## E: edited existing tests (approved scope only; refactor-decisions item 5, spec 088)

- `context_search/handler.test.ts`: each test whose stub returns at least one `.md` line gets one extra queued eval response giving the note's line, equal to the stubbed CLI text; in H13 the line also ends with `\r`. H1 (line 40) and H2 (line 310) change `toHaveLength(1)` to 2 and drop "single CLI call" from their titles.
- The two H14 tests with 1000 and 999 notes (`context_search/handler.test.ts`) may queue as many read-back responses as their batches need (owner ruling 2026-11-02, after F10).
- `context_search/handler.literal-phrase.test.ts`: C1, C4, C5 and C6 get the extra response. C3 and C9 stub only the zero-match sentinel and stay untouched (owner ruling 2026-11-02).
- `context_search/index.test.ts:64`: the extra response.
- `_typed-result-fixtures.ts:136`: the context_search stub also answers the eval.

No expected `text`, `count`, `truncated` or argv value changes. Any other failing existing assertion stops implementation.

## Help-page text (`docs/tools/context_search.md`, FR-009)

The page must say the following, and must not contradict it anywhere:

- **What is removed**: "Each match's `text` is the matching line exactly as it is in the note, without its line ending (`\n` or `\r\n`). Leading and trailing spaces, tabs and other whitespace are kept, and so is a `\r` in the middle of a line. Text longer than 500 characters is cut to 500 and followed by `…`; leading whitespace counts towards the 500."
- **Calls**: "When the search finds lines, context_search reads those lines back from the notes with one more Obsidian call (more for very large results), because Obsidian's search reports each line with its surrounding whitespace removed."
- **Error roster**: a `CLI_REPORTED_ERROR` row for `details.code: "MATCH_LINE_UNAVAILABLE"`, listing the three reasons and the recovery: "run the search again; the note changed while the search ran".
- Example 5's closing sentence stays true as written.
- **Migration from `search`**: "Two behavioural differences" becomes "Three". Add the bullet: "**Whitespace**: the new tool returns each line with its leading and trailing whitespace; `search`'s line mode returns the line trimmed, as Obsidian's search reports it."
- **Latency**: one sentence saying that a search that finds lines makes one more Obsidian call to read them back, plus one per further batch for results spread over many notes. It may cite the T022 measurements.

## Live column (quickstart §3, research D8)

Through the built server, in `Sandbox/088-live-<stamp>/`, with fixtures created through Obsidian:

| Fixture line | Expected `text` |
|--------------|-----------------|
| `\tzqx tab indented` (LF) | `\tzqx tab indented` |
| `    zqx four spaces` (LF) | `    zqx four spaces` |
| `zqx trailing two  ` (LF) | `zqx trailing two  ` |
| `zqx crlf two  ` (CRLF) | `zqx crlf two  ` |
| ` zqx nbsp edges ` | same |
| `"      " + "a"×600` containing `zqx` | 500 chars + `…`, starting with the six spaces |
| 300 notes, each with one `  zqx n` line (two leading spaces), folder-scoped, `limit: 300` | 300 rows, every text starting with the two spaces. This needs several batches, which exercises batching against the real shim within the F10 budget. |
