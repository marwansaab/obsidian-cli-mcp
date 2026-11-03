# Bug Assessment: search and context_search match only whole words since the literal-phrase change

- **Slug**: bi-0175
- **Created**: 2026-11-03
- **Source**: pasted text (backlog item BI-0175, filed 2026-11-02)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

Condensed from the pasted BI-0175 text:

> `search` and `context_search` are documented as literal substring searches (spec 087 FR-001, FR-010), and BI-0169 was meant to make multi-word queries match as an exact phrase without losing that contract. On 0.9.0-local the query is now matched only on whole-word boundaries: any query that starts or ends inside a word finds nothing. Whole-word and multi-word queries still match, so the regression is silent — the caller gets a valid zero-match envelope, not an error.

Evidence quoted by the report (observed on `@marwansaab/obsidian-cli-mcp@0.9.0-local`, built from `main`):

- TC-00719 (fail), `TestVault-Obsidian-CLI-MCP`: `context_search` for `cap170` returned only the line whose word is exactly `cap170` and missed the line holding `cap170long`. The probes `ead170`, `lead17`, `cap170l`, `ph169alph` and `170 top` all returned `count: 0` from `context_search`; `ead170` returned `count: 0` from `search`. `pattern_search` finds the same text.
- `My-Setup-Vault`: `search` for `id: TC-0078` in the Test Cases folder returned `count: 0`, although `TC-00783` and `TC-00784` exist there; the whole-id query `id: TC-00783` finds its note.
- Related: a `context_search` query containing `|`, sent in quoted form, returned 0 matches where the unquoted form returned 114.

Expected behaviour, from the report's acceptance criteria: a query matches wherever its characters occur contiguously, including part-way through a word (`ead170` finds `lead170`, `TC-0078` finds `TC-00783`, `cap170` finds both `cap170long` and `cap170`); multi-word queries still match only the exact phrase (`alpha beta` does not match `beta … alpha`); a query that begins or ends inside a word and spans words also matches; queries containing `|` match the literal text. Out of scope: regular-expression search, semantic search, case-folding rules, result ordering, limits and truncation.

The report cites BI-0169 (spec `087-match-literal-phrases`) as the change that introduced the regression. BI-0169 stays in review.

## Symptom

`search` (both modes) and `context_search` return no match for a query that starts or ends part-way through a word, and return only whole-word occurrences for a query that is itself a word (`cap170` misses `cap170long`). Expected: every note and line containing the query's characters contiguously, as the published "literal substring" contract and `pattern_search` both say.

## Reproduction

Reproduced live on 2026-11-03 against the Obsidian CLI (`Obsidian.com`), following `.memory/test-execution-instructions.md`: fixtures created through `app.vault.create` in `TestVault-Obsidian-CLI-MCP/Sandbox/bi0175-probe/`, the CLI spawned from Node with `shell: false` and the query as the single argv element `query=<value>` (as `dispatchOnce` does), every call with `vault=`, `path=Sandbox/bi0175-probe` and `format=json`. The fixtures were deleted afterwards and `Sandbox/` was left as found; `Welcome.md` was untouched.

1. Create `n1.md` with the lines `lead170 cap170long here`, `cap170`, `| col a | col b |`, `alpha beta gamma`, `id: TC-00783 line`, `Café ALPHA upper`; and `n2.md` with `beta x alpha`, `foo.bar(baz)`.
2. Send each query the way the handlers send it today, through `literalPhraseQuery` (wrapped in `"…"`):

   | Query | `search` | `search:context` |
   |---|---|---|
   | `"ead170"` | `No matches found.` | `No matches found.` |
   | `"cap170"` | `n1.md` | line 2 (`cap170`) only; line 1 (`cap170long`) missing |
   | `"TC-0078"` | `No matches found.` | `No matches found.` |
   | `"pha bet"` | `No matches found.` | `No matches found.` |
   | `"a b"` | `No matches found.` | `No matches found.` |
   | `"o.bar(b"` | `No matches found.` | `No matches found.` |
   | `"alpha beta"` | `n1.md` only | line 4 only (correct) |

3. Send the same queries raw (no quotes): `ead170`, `cap170`, `TC-0078` and `o.bar(b` all match as substrings, but `alpha beta` and `pha bet` also match `beta x alpha` in `n2.md` (the pre-087 word-split defect BI-0169 fixed).

The `|` observation (0 versus 114) was not reproduced in isolation: on these fixtures `"| col a"`, `"| col"`, `"col b |"` and `"b |"` all found the table row. The 114-line query in the report is not quoted in it, so its exact text is unknown. It is most likely the same whole-word boundary applied to a query whose ends fall inside a token. The proposed remediation matched `|` queries correctly in every probe below, so this does not block the fix.

Resolved (Relay): the exact query is not recorded. The 0-versus-114 observation appears only in BI-0175's Status text, and no Tool Note or other vault note gives the query string. The owner chose option A (2026-11-03): proceed without it, treat it as the same whole-word-boundary root cause, and cover the acceptance criterion "punctuation in queries", which is written generically, with synthetic rows. Each row starts or ends part-way through a word next to `|` (see Tests to add or update).

## Suspected Code Paths

- `src/tools/search/literal-phrase.ts:5` `literalPhraseQuery()` — wraps the query in `"…"` (escaping `\` and `"`). Obsidian treats a quoted query as a phrase of whole words, so its first and last characters must sit on word boundaries. This is the regression.
- `src/tools/search/handler.ts:65` `executeSearch()` — sets `parameters.query = literalPhraseQuery(input.query)` for both `search` and `search:context` (`context_lines: true`).
- `src/tools/context_search/handler.ts:57` `executeContextSearch()` — sets the same parameter for `search:context`.
- `specs/087-match-literal-phrases/research.md` F6 (last paragraph) and D1 — the evidence BI-0169 relied on. It probed single-word queries only as whole words (`alpha`, `draft`, `urgent`, `status`, `fnalpha`) and concluded that "single-word queries give the same notes and lines whether quoted or not". No probe began or ended a query inside a word, so the boundary rule went unseen. The required live check (D6, quickstart §3) reused the same whole-word fixtures.

Not implicated: `selectLines` / `lineOutput` (`src/tools/search/line-matches.ts`), `oneMatchPerLine`, and context_search's `readBackLines`. They operate on whatever rows the CLI returns; the rows are missing before they get there.

## Root Cause Hypothesis

Spec 087 (BI-0169) changed both handlers to send the query as one Obsidian quoted phrase. Obsidian's quoted-phrase search matches whole-word sequences, not raw substrings: `"ead170"` does not match `lead170`, `"cap170"` matches the word `cap170` but not `cap170long`, and `"TC-0078"` does not match `TC-00783`. An unquoted single term would match as a substring, so 087 swapped one defect (word-splitting and operator parsing) for another (whole-word boundaries) in every mode of both tools. Confidence: **high**. Reproduced live, and the quoted versus raw versus regex results isolate the quoting as the only variable.

## Proposed Remediation

**Preferred**: send the query as an escaped Obsidian regular expression instead of a quoted phrase. `literalPhraseQuery(query)` returns `/` + the query with every ECMAScript regex syntax character (`\ ^ $ . * + ? ( ) [ ] { } |`) and the delimiter `/` prefixed with `\` + `/`. An escaped regex matches exactly the literal character sequence, anywhere, including inside words. The handlers already route through the one helper, so neither handler changes beyond its header comment.

Live probes of this form on 2026-11-03 (same method as above):

| Query (literal) | Sent as | `search` | `search:context` |
|---|---|---|---|
| `ead170` | `/ead170/` | `n1.md` | line 1 |
| `cap170` | `/cap170/` | `n1.md` | lines 1 and 2 |
| `TC-0078` | `/TC-0078/` | `n1.md` | line 5 |
| `pha bet` | `/pha bet/` | `n1.md` only | line 4 only |
| `a b` | `/a b/` | `n1.md` only | line 4 only |
| `alpha beta` | `/alpha beta/` | `n1.md` only, not `beta x alpha` | line 4 only |
| `\| col a` | `/\| col a/` | `n1.md` | line 3 only |
| `col b \|` | `/col b \|/` | — | line 3 |
| `o.bar(b` | `/o\.bar\(b/` | `n2.md` | line 2 |
| `/usr/bin/` | `/\/usr\/bin\//` | found | line 1 |
| `a\b` | `/a\\b/` | found | line 2 |
| `say "hi` | `/say "hi/` | found | line 3 |
| `-draft` | `/-draft/` | the note with the text `-draft` | line 6 |
| `tag:x` | `/tag:x/` | `No matches found.` (no note holds the text; not read as an operator) | same |
| ` cap170` (leading space) | `/ cap170/` | — | line 1 only |
| `ALPHA` (default case) | `/ALPHA/` | both notes | `alpha …`, `beta x alpha`, `Café ALPHA upper` |
| `ALPHA` with `case=true` | `/ALPHA/` | — | `Café ALPHA upper` only |
| `CAFÉ` (default case) | `/CAFÉ/` | — | `Café ALPHA upper` (same fold as the quoted form) |
| `n2` (file name only) | `/n2/` | `n2.md` (file-name match kept) | — |
| `alpha` newline `beta` | `/alpha<LF>beta/` | the note (phrase across the break, as with the quoted form) | line 1 of the span; `selectLines` drops it (LINE_BREAK rule, unchanged) |

This keeps everything spec 087 secured (operators and syntax characters are literal, multi-word queries match only the exact phrase, whitespace is exact, case rule and `case=true` unchanged, file-name matches kept, folder scoping unchanged, line-break rule unchanged) and restores substring matching (FR-001, FR-010). The published descriptions already say "literal substring", so no description, schema or fingerprint changes; `_register-baseline.json` must not move.

Without escaping, `/o.bar(b/` made the CLI print `Error: Failed to parse regular expression. Invalid regular expression: /o.bar(b/: Unterminated group`. With full escaping every query compiles. If one ever did not, the existing dispatch classifier would surface that stdout as `CLI_REPORTED_ERROR` (an error, not a silent empty result), so Principle IV holds.

**Alternatives**:

- *Send single-token queries raw and keep quotes only for multi-word queries.* Rejected: a raw token is still read as Obsidian syntax (`-draft`, `tag:x`, `[p]`), which 087 fixed, and a multi-word query that starts or ends inside a word (`pha bet`, an acceptance criterion) would still miss.
- *Run the search in an `eval` template, as `pattern_search` does, with the escaped query as its pattern.* Rejected for the same reason as 087 D1: it re-implements file-name matching, the case fold and folder scoping, and moves context_search off `search:context`. The regex form gets the same literal matching from the CLI's own engine.
- *Revert to the raw query.* Rejected: brings back the BI-0169 defect (word-splitting and operators).

**Files likely to change**:

- `src/tools/search/literal-phrase.ts` — the helper's body, its doc comment and the file header. Keep the exported name `literalPhraseQuery` to limit churn; it still returns the one literal-phrase form of the query.
- `src/tools/search/handler.ts`, `src/tools/context_search/handler.ts` — header comments only ("escaped, double-quoted phrase" becomes "escaped regular expression").
- `src/tools/search/literal-phrase.test.ts` — rows L1 to L6 expect the regex form; add rows for every escaped character and for `/`.
- `src/tools/search/handler.test.ts:40`, `src/tools/context_search/handler.test.ts:55` — `'query="foo"'` becomes `'query=/foo/'`.
- `src/tools/search/handler.literal-phrase.test.ts` (lines 26, 27, 39, 52, 76, 157), `src/tools/context_search/handler.literal-phrase.test.ts` (lines 29, 34, 35, 52, 64, 130) — argv expectations change to the regex form. Test titles that say "double-quoted" or "inside the quotes" change wording.
- `docs/tools/search.md` (line 266 and the `query` field notes), `docs/tools/context_search.md` (the `query` field notes), `CHANGELOG.md` (`Fixed`) — text that says the query is sent as a quoted phrase. Handled by the PR's docs pass, but listed here for scope.

**Tests to add or update**:

- Pure (`literal-phrase.test.ts`): each of `\ ^ $ . * + ? ( ) [ ] { } | /` is escaped; `"`, `-`, `:`, `#`, letters, digits and whitespace (leading, trailing, internal, tab) pass through unchanged; `new RegExp(body)` built from the output (between the delimiters) matches the original query literally and only that, for a property-style set of inputs. This proves the escape is complete without the CLI.
- Pure (`literal-phrase.test.ts`), synthetic `|` rows (Q2 resolution): `ol a | co` (starts and ends inside a table cell's words) and `| col` next to a partial word (`|co`, `l b |`) escape to `/ol a \| co/`, `/\|co/`, `/l b \|/`.
- Handler suites: one row per tool sending a partial-word query (`ead170`) and a word-crossing multi-word query (`pha bet`) shows the `/…/` argv element. The rows' stubbed CLI answers return the substring match and the handler passes it through.
- Live check (required, as in 087 D6): rerun the probe matrix above through the built server's `search` (both modes) and `context_search`, including the acceptance-criteria cases `ead170`, `TC-0078`, `cap170` (both lines), `alpha beta` (exact phrase only), `pha bet`, and the synthetic `|` queries `ol a | co` and `l b |` against a Markdown table row. Fixtures must include queries that begin and end inside words; that is the gap that let 087 ship this.

## Risks & Considerations

- **Existing test edits need owner approval** (`.memory/refactor-decisions.md` item 5). The fix changes every existing argv expectation of the quoted form (the files and lines listed above). The spec 087 approval covered only the change to the quoted form, so it does not cover this one. Approved for exactly the listed lines; see Open Questions, Q1.
- **Search speed on large vaults.** Obsidian may evaluate a regex query by scanning file contents rather than through its word index. Probes ran on a small fixture set; the live check should time a `search` against `My-Setup-Vault` before and after to rule out a noticeable slowdown. `pattern_search` already scans this way with acceptable latency.
- **The regex engine's flags are Obsidian's.** Probes show the default fold (including `É`/`é`) and `case=true` behave exactly as with the quoted form, so the case rule is unchanged. Escaping uses only ECMAScript syntax characters and `/`, which are valid identity escapes with or without the `u` flag.
- **Line-break queries** behave as with the quoted form (path mode matches a phrase that spans lines; line modes drop the rows through `selectLines`). The 087 contract rows for line breaks stay valid.
- **Kernel nodes and error surface.** No kernel node is touched, no new error code is added, and no published surface changes (see the CodeGraph structural check below).
- **Constitution Compliance.** No principle is expected to score `N`, so no Complexity Tracking entry is needed. Principle II: both tools keep happy-path and failure tests, and the changed behaviour gets new rows in the same change. Principle V: the edited files keep their `Original — no upstream` headers.

## CodeGraph structural check

Queried on 2026-11-03 at `main` `688b67f` (branch `fix/bi-0175`).

- **Symbols the fix changes**: `literalPhraseQuery` (`src/tools/search/literal-phrase.ts:5`). Its production callers are `executeSearch` (`src/tools/search/handler.ts`) and `executeContextSearch` (`src/tools/context_search/handler.ts`), the latter over the existing context_search → search edge (087 D3). Its direct tests are in `src/tools/search/literal-phrase.test.ts`; both tools' handler suites assert its output in argv.
- **Affected modules**: `src/tools/search/` and `src/tools/context_search/`. `pattern_search` imports only `stripBoundarySlashes` from `search/handler.ts`, which does not change.
- **Blast radius**: the two text-search tools, all three of their modes. Line-level post-processing (`selectLines`, `lineOutput`, `oneMatchPerLine`, `readBackLines`) is downstream and unchanged.
- **Kernel nodes**: the fix touches **none** of them. `createLogger()` and `createQueue()` stay constructed in `server.ts` and injected through `ExecuteDeps`; `UpstreamError` gains no new code (a CLI regex-parse error, should one ever occur, already classifies as `CLI_REPORTED_ERROR` through the dispatch layer); `createServer()` is not touched. Post-fix structural verification checks this claim.
- **Module direction**: no new import is added; the existing one-directional context_search → search edge is reused.

## Open Questions

- **Owner approval for existing test edits (`.memory/refactor-decisions.md` item 5).** CodeGraph places `literalPhraseQuery`'s output on the argv of both handlers (`executeSearch` and `executeContextSearch`) and in its own pure suite, so changing the CLI form fails every existing assertion of the quoted form. The fix needs approval to change exactly these, and nothing else:
  1. `src/tools/search/literal-phrase.test.ts`: L1 to L6 expected values (lines 9, 17, 21, 26, 31, 45) change to the escaped `/…/` form, with titles that say "double quotes" or "inside the quotes" reworded. L7 (`oneMatchPerLine`) is unchanged.
  2. `src/tools/search/handler.test.ts:40` and `src/tools/context_search/handler.test.ts:55`: `'query="foo"'` becomes `'query=/foo/'`.
  3. `src/tools/search/handler.literal-phrase.test.ts` lines 26, 27, 39, 52, 76, 157, and `src/tools/context_search/handler.literal-phrase.test.ts` lines 29, 34, 35, 52, 64, 130: argv expectations change to the `/…/` form, with titles reworded to match.

  No expected `count`, `paths`, `matches`, `text` or `truncated` value may change. If any other existing assertion fails, stop and raise it.
  Options: **A** approve exactly this list (recommended: the list is mechanical, every change is the argv form the fix exists to change, and result-shape expectations stay pinned); **B** keep the existing quoted-form tests and add new suites only, which is impossible because the quoted-form assertions would fail; **C** a different scope the owner names.

  Resolved (Relay): **A** (owner ruling 2026-11-03 on refactor-decisions item 5, recorded on the BI-0175 note). Only the listed lines may be edited: in `src/tools/search/literal-phrase.test.ts`, the L1–L6 expected values (lines 9, 17, 21, 26, 31, 45) change to the `/…/` form and the titles that mention quotes are reworded, with L7 untouched; `src/tools/search/handler.test.ts:40` and `src/tools/context_search/handler.test.ts:55` change from `query="foo"` to `query=/foo/`; and the 12 listed lines in the two `handler.literal-phrase.test.ts` files change their argv to the `/…/` form, with titles reworded. No expected `count`, `paths`, `matches`, `text` or `truncated` value may change. If any other existing assertion fails, stop and raise it for owner review. New tests may be added freely.

- **Q2: the exact `|` query from the report.** The report says a `context_search` query containing `|`, sent quoted, returned 0 matches where the unquoted form returned 114, but it does not give the query. The probes could not reproduce the case in isolation (see Reproduction). Options: **A** proceed without it and add synthetic `|` rows that start or end inside a word (recommended); **B** add the original query verbatim as an extra row; **C** hold the fix until the original query is reproduced.

  Resolved (Relay): **A**. The vault does not record the query; the 114 observation appears only in BI-0175's Status text. The acceptance criterion "punctuation in queries" is written generically, so synthetic rows that start or end mid-word next to `|` meet it. They are added to Tests to add or update; C is not needed.
