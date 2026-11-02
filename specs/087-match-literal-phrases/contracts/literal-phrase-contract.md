# Contract: literal phrase matching for `search` and `context_search`

**Spec**: [../spec.md](../spec.md) | **Research**: [../research.md](../research.md) | **Data model**: [../data-model.md](../data-model.md)

Every row below is a test the implementation must add, a check it must pass, or text it must ship. Each row names the spec requirement it proves.

## Module `src/tools/search/literal-phrase.ts`

### `literalPhraseQuery(query: string): string`

Wraps the query in double quotes after escaping `\` as `\\` and `"` as `\"`, in one left-to-right pass (research D1).

| Row | Input | Output | Proves |
|---|---|---|---|
| L1 | `alpha beta` | `"alpha beta"` | FR-001, FR-002 |
| L2 | `say "hello" twice` | `"say \"hello\" twice"` | FR-003 |
| L3 | `a\b` | `"a\\b"` | FR-003 |
| L4 | `a\"b` | `"a\\\"b"` (backslash doubled first, then the quote escaped) | FR-003 |
| L5 | ` alpha ` (leading and trailing space), `alpha<TAB>beta`, `alpha  beta` | each wrapped with its whitespace byte-identical | FR-002 |
| L6 | `-draft`, `cats OR dogs`, `cats AND dogs`, `tag:urgent`, `file:Plan`, `/usr/bin/`, `[status]`, `(see note)`, `a*b` | each wrapped unchanged inside the quotes; only `\` and `"` are rewritten | FR-003 |

### `oneMatchPerLine(wire: SearchContextWireFile[]): SearchContextWireFile[]`

Returns a new array. File order and the order of the remaining matches are preserved (research D2).

| Row | Input | Output | Proves |
|---|---|---|---|
| L7 | one file whose matches are lines `[1, 1, 2, 1, 3]` (texts equal per line) | matches for lines `[1, 2, 3]`, each the first entry for its line | FR-005 |

The input array and its objects are not mutated (checked by L7).

### `lineMatches(query, wire, appliedCap, normaliseText)` in `src/tools/search/line-matches.ts`

The shared line-level pipeline both handlers call (research D2). Rows are in `line-matches.test.ts`.

| Row | Input | Output | Proves |
|---|---|---|---|
| L8 | a two-file wire with a query containing `\n`, then with one containing `\r` (baseline: the same wire with a single-line query keeps its lines) | `{ count: 0, matches: [] }` | FR-004, edge case "Query containing a line break" |

*Amended 2026-11-02 (owner ruling, option A, PR #120 review): L8 originally pinned `oneMatchPerLine(query, wire)` returning every file with `matches: []`. The line-break rule moved into `lineMatches` so that `oneMatchPerLine` has one responsibility (Constitution Principle I). Tool behaviour is unchanged: S7 and C7 pass as written.*

## `search` handler: `src/tools/search/handler.literal-phrase.test.ts`

All rows go through `executeSearch` with `makeQueuedSpawn`. The "argv" column is the element recorded in `recorded[0].argv`.

| Row | Call | Stubbed CLI output | Expected | Proves |
|---|---|---|---|---|
| S1 | `{ query: "alpha beta" }` | `["n1.md"]` | argv contains `query="alpha beta"` and no bare `query=alpha beta`; result `{ count: 1, paths: ["n1.md"] }` | FR-001, US1 AS1 |
| S2 | `{ query: 'say "hi" a\\b' }` (text `say "hi" a\b`), default and `context_lines: true` | sentinel | argv `query="say \"hi\" a\\b"` in both subcommands; empty envelope | FR-003, FR-009, US3 |
| S3 | `{ query: " alpha " }`, once in default mode and once with `context_lines: true` | sentinel | argv `query=" alpha "` (whitespace kept) in both subcommands | FR-002, FR-013(f), Clarification Q2 |
| S4 | `{ query: "alpha beta", context_lines: true }` | one file, matches `[{line:1,…},{line:1,…},{line:2,…}]` | `count: 2`, lines `[1, 2]` | FR-005, FR-006, US2 AS2 |
| S5 | `{ query: "alpha beta", context_lines: true, limit: 2 }` | one file, lines `[1, 1, 1, 2]` | `count: 2`, lines `[1, 2]`, `truncated: true` (conservative rule, deduplicated count 2 ≥ cap 2) | FR-006 |
| S6 | `{ query: "alpha beta", context_lines: true, limit: 3 }` | one file, lines `[1, 1, 1, 2]` | `count: 2`, no `truncated` (deduplicated count 2 < cap 3; today's raw count would have fired it) | FR-006 |
| S7 | `{ query: "end alpha\nbeta start", context_lines: true }` | one file, matches `[{line:1, text:"end alpha"}]` | `{ count: 0, matches: [] }`; and with the default mode, the stubbed path is returned | FR-004, edge case "Query containing a line break" |
| S8 | `{ query: "alpha", case_sensitive: true, folder: "/P/" }` | `["P/a.md"]` | argv contains `query="alpha"`, `case=true` and `path=P` (the existing `case` token form, `search/handler.test.ts:595`); result unchanged | FR-007, FR-008, FR-010 |
| S9 | `{ query: "ALPHA BETA" }` with `case_sensitive: true`, then without it, each in default mode and with `context_lines: true` | sentinel | argv `query="ALPHA BETA"` every time; `case=true` present only with the flag, and no `case=` token without it | FR-007, FR-013(e) |

## `context_search` handler: `src/tools/context_search/handler.literal-phrase.test.ts`

All rows go through `executeContextSearch` with `makeQueuedSpawn`.

| Row | Call | Stubbed CLI output | Expected | Proves |
|---|---|---|---|---|
| C1 | `{ query: "alpha beta" }` | one file, line 3 | argv contains `query="alpha beta"`; one match | FR-001, US1 AS5 |
| C2 | `{ query: '"hello" -x tag:y /z/ [p] (q) a*b c\\d' }` | sentinel | argv has the escaped, quoted form; empty envelope | FR-003, FR-009, US3 |
| C3 | `{ query: "alpha " }`, then `{ query: " alpha" }` | sentinel | argv `query="alpha "`, then `query=" alpha"` | FR-002, FR-013(f), Clarification Q2 |
| C4 | `{ query: "alpha beta" }` | file `a.md` lines `[2, 2, 5]`, file `b.md` lines `[1, 1]` | `count: 3`: `a.md` 2, `a.md` 5, `b.md` 1; no duplicates | FR-005, US2 AS1–AS3 |
| C5 | `{ query: "alpha beta", limit: 2 }` | `a.md` lines `[1, 1, 1]`, `b.md` line `[1]` | `count: 2`, `truncated: true` (deduplicated 2 ≥ 2) | FR-006 |
| C6 | `{ query: "alpha beta" }` | one file, line 1 twice with text `"x\r"` | one match, text `x` (the CR strip still applies after de-duplication) | FR-008 |
| C7 | `{ query: "a\nb", folder: "Projects" }` | one file, line 1 | `{ count: 0, matches: [] }`; exactly one spawn (no folder probe, because the CLI did report matches) | FR-004, FR-008 |
| C8 | `{ query: "alpha beta", folder: "Missing" }` | sentinel, then the folder probe's `Error: Folder "Missing" not found.` | `CLI_REPORTED_ERROR` as today; the first argv carries `query="alpha beta"` | FR-008, FR-011 |
| C9 | `{ query: "ALPHA BETA" }` with `case_sensitive: true`, then without it | sentinel | argv `query="ALPHA BETA"` both times; `case=true` present only with the flag | FR-007, FR-013(e) |

## Edited existing assertions (owner approval 2026-11-02, option B, BI-0169; refactor-decisions item 5)

The approval is conditional: these two edits are allowed only if they are the only existing assertions that fail during implement. Any other failing existing test stops the work for owner review and is not edited.

| File:line | Before | After |
|---|---|---|
| `src/tools/search/handler.test.ts:41` | `expect(argv).toContain("query=foo");` | `expect(argv).toContain('query="foo"');` |
| `src/tools/context_search/handler.test.ts:44` | `expect(argv).toContain("query=foo");` | `expect(argv).toContain('query="foo"');` |

No other existing test line changes. Both suites must pass with only these edits (FR-010, SC-004).

## Surface checks

| Row | Check | Proves |
|---|---|---|
| P1 | `npm test` passes the FR-018 baseline gate WITHOUT running `npm run baseline:write`; `git diff src/tools/_register-baseline.json` is empty | FR-011, SC-005 |
| P2 | `git diff -- src/tools/search/schema.ts src/tools/context_search/schema.ts src/tools/search/index.ts src/tools/context_search/index.ts src/errors.ts` is empty | FR-011, SC-005 |
| P3 | `docs/tools/search.md` and `docs/tools/context_search.md` carry the help-page text below | FR-012 |

## Help-page text (FR-012)

Each page's `query` per-field bullet gains this paragraph after its existing sentence:

> The whole query is one literal phrase: its words must appear together, in order, with the same spacing. Characters that mean something in Obsidian's own search box (double quotes, a leading `-`, `OR`, parentheses, square brackets, `tag:` / `path:` / `file:`-style prefixes, `/…/`, `*`, `\`) are matched as ordinary text; nothing needs escaping.

`context_search.md` (output section) and `search.md` (line-mode output table, `matches` row) also state:

> Each matching line appears once, however many times the phrase occurs in it.

`search.md`'s *Filename-match inflation* note gains:

> The file name or metadata must contain the whole phrase.

No other sentence on either page changes. In particular the ASCII-fold wording stays (research D7, follow-up 1).

## Live column (required, quickstart §3; research D6 as amended 2026-11-02)

These are the T0 observations (research F6 and F8). After implementation, the built server must reproduce them in the `TestVault-Obsidian-CLI-MCP` Sandbox (tasks T029) before the work is marked complete. This column is the proof of SC-001, SC-003 and SC-006 and of the matching half of FR-013(a); the S and C rows prove the escaped, quoted query that is sent.

| Fixture text | Query | `search` | `context_search` |
|---|---|---|---|
| `alpha beta here`; `alpha only`; `beta only`; `beta alpha reversed`; `end alpha` / `beta start` | `alpha beta` | only `alpha beta here`'s note | only that line |
| `alpha beta and alpha beta` | `alpha beta` | the note | line 1 once |
| `say "hello" twice` | `say "hello" twice` | the note | the line once |
| `-draft item` (note `p10.md`); `draft only` (note `p11.md`) | `-draft` | `p10.md` only | `-draft item` |
| `tag:urgent`; `body #urgent` | `tag:urgent` | the `tag:urgent` note only | that line |
| `a\b` | `a\b` | the note | the line |
