# Research: Match literal phrases

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **HEAD**: `a96c2aa` | **Date**: 2026-11-02

This file records what the code does today (F1 to F4), what live probes against the Obsidian CLI showed (F5 to F9), and the decisions that follow (D1 to D7).

## Live probe method (T0)

The probes followed `.memory/test-execution-instructions.md`:

- Vault: `TestVault-Obsidian-CLI-MCP`, addressed with an explicit `vault=` on every call.
- Fixtures: 35 notes in `Sandbox/087-probe-20261102/`, all removed afterwards. `Welcome.md` was untouched.
- Binary: `obsidian` spawned from Node with `shell: false`, exactly as `dispatchOnce` spawns it (`src/cli-adapter/_dispatch.ts:389`). The query reached the CLI as the single argv element `query=<value>`, the same element `assembleArgv` builds (`_dispatch.ts:246`).
- Commands: `search` and `search:context`, each with `path=Sandbox/087-probe-20261102 format=json`, and again with the `case` flag where noted.

Indexing gotcha: notes written straight to disk a second time, while the test vault was open in a background window, were not picked up by Obsidian's index. Recreating them through `app.vault.create` in an `eval` fixed that. A live check (quickstart §3) should create its fixtures through Obsidian, or wait for the index and confirm the files are listed before it trusts a "no match".

## Findings

### F1. Both handlers pass the query to the CLI unchanged

`executeSearch` (`src/tools/search/handler.ts:62-65`) and `executeContextSearch` (`src/tools/context_search/handler.ts:57-60`) both build `parameters.query = input.query`. Nothing quotes or escapes it. The CLI therefore reads the agent's text as Obsidian search syntax.

### F2. Line-level rows are flattened one-to-one from the wire

Both line-level paths (`search/handler.ts:111-119` for `context_lines: true`, `context_search/handler.ts:126-134`) map every wire `matches[]` entry to one output row. Nothing removes entries that share a path and line number. Truncation is computed on the flattened count (`flat.length >= appliedCap`), so repeated entries also inflate `truncated` and push genuine lines past the cap.

### F3. One module edge already exists for shared search code

`context_search/handler.ts:25-26` imports `stripBoundarySlashes` from `../search/handler.js` and `searchContextWireSchema` from `../search/schema.js`. `pattern_search` imports `stripBoundarySlashes` the same way. The direction is one-way (context_search → search), with no cycle. That is the sanctioned place for code both tools share (research R6/R8 of the original context_search spec, quoted in that file's header).

### F4. Two existing assertions pin the unquoted query

These are the only assertions anywhere in `src/` on the search tools' `query=` element:

- `src/tools/search/handler.test.ts:41`: `expect(argv).toContain("query=foo");`
- `src/tools/context_search/handler.test.ts:44`: `expect(argv).toContain("query=foo");`

The `query=` hits in `obsidian_exec/handler.test.ts` and `cli-adapter.test.ts` are other tools' raw pass-through and are not affected. No existing handler fixture repeats a `(file, line)` pair inside one file's `matches`, so no other existing expectation depends on today's repeated rows. The implement phase confirms this by running both suites unchanged except for those two lines.

### F5. Today the CLI splits the query into words and repeats lines per word (the reported defect)

| Query sent as | `search` result | `search:context` result |
|---|---|---|
| `alpha beta` (raw, today) | 8 notes, including `alpha` and `beta` on separate lines, `beta alpha`, `alpha x beta` and `alpha  beta` | Every line holding either word, once per occurrence: `alpha beta and alpha beta` four times, `alpha x beta` twice, `end alpha` and `beta start` from different lines |
| `-draft` (raw) | every note in the folder that lacks `draft` | every note, with empty `matches` |
| `tag:urgent` (raw) | the note tagged `#urgent`, not the note whose text is `tag:urgent` | same |
| `[status]` (raw) | the note with a `status` property, not the note whose text is `[status]` | same, with empty `matches` |
| `cats OR dogs` (raw) | `cats only` and `cats OR dogs` | same |

### F6. A double-quoted query, with `\` and `"` escaped, is matched as one literal phrase

Wrapping the query in `"…"`, after replacing each `\` with `\\` and each `"` with `\"`, gave literal matching in every case probed:

| Text | Query sent as | Result |
|---|---|---|
| `alpha beta` | `"alpha beta"` | only notes containing `alpha beta`, plus the note named `fn alpha beta.md` (a file-name match, kept per Clarification Q1) |
| `alpha  beta` | `"alpha  beta"` | only the two-space note; `"alpha beta"` does not match it |
| `alpha<TAB>beta` | `"alpha<TAB>beta"` | only the tab note; `"alpha beta"` does not match it |
| `say "hello" twice` | `"say \"hello\" twice"` | only that note |
| a lone `"` | `"\""` | exactly the three notes containing a double quote |
| `a\b` | `"a\\b"` | that note. Unescaped, `"a\b"` matched nothing, so inside quotes `\` is an escape character and must be doubled |
| `a\"b` | `"a\\\"b"` | that note |
| `-draft`, `cats OR dogs`, `(see note)`, `tag:urgent`, `path:Projects`, `/usr/bin/`, `[status]`, `a*b` | each wrapped the same way | each note containing that exact text, and no note selected by the operator. For `"-draft"`, `search` also returned `p11-draft.md`, whose file name contains `-draft` |
| ` alpha` (leading space) | `" alpha"` | `x alpha` and `end alpha`, not `alpha at start` |
| `alpha ` (trailing space) | `"alpha "` | `alpha only`, not a line that is just `alpha` |
| `café` / `CAFÉ` | `"café"` / `"CAFÉ"` | `café crème` for both (see F7) |
| `ALPHA BETA` with `case` | `"ALPHA BETA"` | only `ALPHA BETA upper`; without `case`, also the lower-case notes. The probe passed a bare `case` token, while the handlers send `case=true` (`search/handler.ts:70`, pinned by `search/handler.test.ts:595`). `case=true` is today's working production form, unchanged by this feature; the required live check (quickstart §3, D6) runs through the built server and so exercises it |
| a line in a CRLF note | `"alpha beta crlf"` | found |
| `end alpha` newline `beta start` | the query with a real newline inside the quotes | `search` matched the note, because the phrase runs across the line break. `search:context` returned only line 1, `end alpha`, which does not contain the query |

Single-word queries give the same notes and lines whether quoted or not. That held for `alpha`, `draft`, `urgent`, `status` (which matches both the `status:` property line and the `[status]` text) and `fnalpha` (a file-name-only match), in both commands.

### F7. The default case rule folds more than ASCII, today as well (pre-existing drift)

Raw `CAFÉ` and raw `café` both matched `café crème`. With `case`, neither `CAFÉ` form matched. So the default fold covers at least Latin-1 letters, and the claim "ASCII-fold only, `É` does NOT match `é`" is wrong today. Quoting does not change this. The claim appears in:

- both tools' published descriptions (`search/index.ts:32`, `context_search/index.ts:27`);
- `docs/tools/search.md` (lines 44, 53, 248);
- `docs/tools/context_search.md` (lines 39, 47, 301-303).

The spec puts case rules out of scope, and fixing the descriptions would move two published fingerprints. This feature therefore keeps the rule and its wording untouched and records the drift as follow-up 1. The spec's FR-007 and its Case edge case were reworded at plan time so that they no longer assert ASCII-only folding.

### F8. Line-level results repeat a line once per occurrence of the phrase, even when quoted

`"alpha beta"` returned `alpha beta and alpha beta` twice, and `"\""` returned `say "hello" twice` twice. The same happens today for a single word: `alpha` returned that line twice. Quoting the query alone does not satisfy FR-005, so a de-duplication step is needed in both line-level paths.

### F9. The CLI trims each returned line's text

`  indented alpha` came back as `indented alpha`, `trailing text here   ` as `trailing text here`, and `alpha ` (the line itself ends in a space) as `alpha`. A wrapper-side re-check of each row's `text` against the query would therefore wrongly drop rows for phrases that touch a line's leading or trailing whitespace. Example: `"here "` matches `trailing text here   ` in the CLI, but not the returned text. This trimming already happens today and is not changed by this feature. It does rule out D2's text re-check alternative.

## Decisions

### D1. Send the query to the CLI as one escaped, double-quoted phrase

`literalPhraseQuery(query)` returns `"` + `query` with every `\` replaced by `\\` and every `"` by `\"` + `"`. Both handlers set `parameters.query` to that value, in all three text-search modes.

- **Rationale**: F6 shows it makes every probed character group literal, keeps whitespace exact (leading, trailing, internal, tabs), and keeps the CLI's own matching of file names, metadata, case folding and folders (Clarification Q1, FR-007, FR-008). F6 also shows single-word results unchanged (FR-010). It needs no new validation (FR-009) and no published-surface change (FR-011).
- **Alternatives considered**:
  - *Leave the query raw and filter wrapper-side.* This cannot remove false matches in path mode, which returns only paths, and it cannot add true matches the tokenised query missed. Rejected.
  - *Replace the CLI search with an `eval` template doing literal search, as `pattern_search` does.* That would reimplement file-name and metadata matching, the case fold and folder scoping, which Clarification Q1 and FR-008 require to stay as they are. Rejected as far beyond the scope.
  - *Escape only the characters probed as special.* Obsidian's syntax is wider than any list probed, and inside quotes only `\` and `"` are special (F6). Escaping exactly those two inside quotes is complete and minimal.

### D2. In line-level modes, keep one entry per (path, line), and none for a query containing a line break

`oneMatchPerLine(wire)` takes the parsed `search:context` wire array and returns it with each file's `matches` reduced to the first entry for each line number, in wire order.

`lineMatches(query, wire, appliedCap, normaliseText)` (`src/tools/search/line-matches.ts`) is the one line-level pipeline both handlers call. It keeps no files when the query contains `\n` or `\r`; otherwise it applies the `.md` filter and then `oneMatchPerLine`. Flattening, truncation, sorting and slicing then run on the reduced set (FR-006).

**Amendment (owner ruling 2026-11-02, option A, PR #120 review).** This decision first gave both rules to `oneMatchPerLine(query, wire)`, which emptied every file's `matches` for a line-break query. The review found that one unit then held two responsibilities. Constitution Principle I requires such a unit to be split, so the line-break rule moved into `lineMatches`, and contract row L8 now tests it there. Callers see no change: FR-004, S7 and C7 are untouched.

- **Rationale**:
  - F8 shows that quoting leaves per-occurrence repeats. Two entries with the same path and line always carry the same text, so keeping the first loses nothing (spec Assumptions).
  - For a line-break query, F6 shows the CLI returns line 1 of a phrase that spans lines. No line can contain a line break (FR-004 and the spec edge case), so the rows are dropped.
  - `\r` is treated the same way. In a CRLF note it is part of the line's terminator, and `context_search` strips it from the returned text, so a query containing it cannot be shown as a match within a line.
  - The rule runs after the CLI call, so `context_search`'s zero-match folder-existence probe and every error path stay as they are.
- **Alternatives considered**:
  - *Re-check each row's text with a literal, case-folded `includes`.* Rejected by F9, because the CLI trims the text. It would also need a second copy of the CLI's case fold, which F7 shows is not the documented ASCII fold.
  - *Skip the CLI call for a line-break query.* That would bypass `context_search`'s folder probe, so a missing folder would come back as an empty result instead of `CLI_REPORTED_ERROR`, against FR-008 and Principle IV. Rejected.

### D3. Both helpers live in a new module in the `search` tool directory

The new module is `src/tools/search/literal-phrase.ts`, exporting `literalPhraseQuery` and `oneMatchPerLine`.

- `search/handler.ts` imports it from inside its own directory.
- `context_search/handler.ts` imports it over the existing context_search → search edge (F3), beside `stripBoundarySlashes` and `searchContextWireSchema`.
- The module imports only the `SearchContextWireFile` type from `./schema.js`.

**Rationale**: the rule must be written once (refactor-decisions item 46: spec 086's defect was two copies of one rule disagreeing). It sits with the wire schema it operates on, and adds no new tool-to-tool edge.

**Alternative considered**: a cohort leaf `src/tools/_literal-phrase.ts`. That is equally acyclic, but would separate the helper from the `searchContextWireSchema` type it consumes and from the existing shared-search exports. Not chosen; the difference is cosmetic.

### D4. Tests: a pure suite for the module, and one new handler suite per tool

- `src/tools/search/literal-phrase.test.ts` holds the pure rows L1 to L8 (contracts).
- `src/tools/search/handler.literal-phrase.test.ts` and `src/tools/context_search/handler.literal-phrase.test.ts` hold rows S1 to S8 and C1 to C8, through the real handlers with `makeQueuedSpawn`.

These follow the spec 075 `handler.<topic>.test.ts` split. `search/handler.test.ts` is already 746 lines, and the 1000-line gate applies.

The two F4 assertions change from `"query=foo"` to `'query="foo"'`. That is the only edit to existing tests. Under `.memory/refactor-decisions.md` item 5 it needed owner approval. The owner granted it on 2026-11-02 (option B, BI-0169), on condition that those two are the only existing assertions that fail during implement; any other failure stops the work for owner review.

### D5. The published surface is unchanged, and the help pages gain the literal-phrase rule

- Descriptions, input and output schemas, titles and annotations are not edited. Both descriptions already say "literal substring", and the parameter descriptions say "Literal substring". `_register-baseline.json` therefore must NOT move; the FR-018 gate passes without `baseline:write` (SC-005).
- `docs/tools/search.md` and `docs/tools/context_search.md` gain the FR-012 text (contracts, section "Help-page text") in their `query` per-field policy. The `search` page gains it in its line-mode notes too.
- `CHANGELOG.md` gains the `[Unreleased]` spec line and a `Fixed` entry.

### D6. Live validation is required and repeats the T0 matrix

Quickstart §3 re-seeds a reduced fixture set through Obsidian in the `TestVault-Obsidian-CLI-MCP` Sandbox, calls the built server's `search` and `context_search`, and expects the results in the contract's live column. It must pass, with results recorded in `post-implement.md`, before the work is marked complete (tasks T029).

The two gates prove different things:

- the automated suites (quickstart §1) prove that each mode sends the escaped, double-quoted query and keeps one entry per line;
- the live check proves that only exact-phrase notes and lines match (SC-001, SC-003, SC-006), which canned CLI answers cannot show.

FR-013 stays as written.

**Amendment (owner ruling 2026-11-02, option A, BI-0169).** This decision originally made the live check optional, with the automated suites as the only gate. The ruling reverses that: the live check is a required gate. Rationale: Best Practices treats empirical validation against the live MCP as the bar for shipped.

### D7. The ASCII-fold wording drift is a follow-up, not part of this change

Correcting it means editing two published descriptions, which moves two fingerprints, and describing a case rule the spec puts out of scope. See follow-up 1.

## Follow-ups (out of scope)

1. **Case-fold wording (F7).** Both descriptions and both help pages say the default fold is ASCII-only, but `CAFÉ` matches `café`. A new backlog item should either correct the wording (two fingerprint moves) or define the intended rule.
2. **Returned line text is trimmed (F9).** The help pages say `text` is "the matching line's text", and `context_search` documents only a trailing `\r` strip, but the CLI trims leading and trailing whitespace. A documentation fix, if wanted, belongs with follow-up 1.
