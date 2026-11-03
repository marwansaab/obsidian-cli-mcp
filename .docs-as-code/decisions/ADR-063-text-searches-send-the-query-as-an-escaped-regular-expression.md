# ADR-063 — Text searches send the query as an escaped regular expression

- **Status:** Accepted
- **Date:** 2026-11-03
- **Supersedes:** decision 1 of
  [ADR-057](ADR-057-text-searches-send-the-query-as-one-escaped-literal-phrase.md)
  (Text searches send the query as one escaped literal phrase). ADR-057's
  other decisions (one entry per line, the line-break rule, no
  published-surface change) still stand.
- **Source:** PR #130 (BI-0175, `.specify/bugs/bi-0175/`: assessment,
  fix and test reports, owner rulings Q1 = A and Q2 = A), commits `646138a`
  (the fix) and `7f37211` (the PR #130 code-quality review's test addition)
- **Related:** ADR-040 (published parameter descriptions and server
  instructions), whose "literal substring" descriptions did not move.

## Context

ADR-057 (PR #120, spec 087) made `search` and `context_search` send the
query as one double-quoted Obsidian phrase, so that search syntax (`OR`,
`-x`, `tag:`, `[prop]`) is matched as text. Its probes used whole-word
queries only. Obsidian matches a quoted phrase on whole-word boundaries, so
from 0.9.0-local a query that started or ended part-way through a word found
nothing: `ead170` missed `lead170`, `TC-0078` missed `TC-00783`, `pha bet`
missed `alpha beta`, and `cap170` found the word `cap170` but not
`cap170long`. The tools returned a valid zero-match result rather than an
error, against the published "literal substring" contract (spec 087 FR-001,
FR-010). Live probes in the assessment isolated the quoting as the only
variable: the same calls in the quoted form still return
`No matches found.`, and in the regex form they match.

## Decision

1. **Send the query as `/…/` with every regex syntax character escaped.**
   `literalPhraseQuery` (`src/tools/search/literal-phrase.ts:5`) returns
   the query between `/` delimiters, with each of
   `\ ^ $ . * + ? ( ) [ ] { } |` and `/` itself prefixed with `\`. Obsidian compiles that as a regular
   expression whose only match is the literal character sequence, wherever
   it occurs, including inside a word. Both handlers already called the
   helper in all three modes, so only their header comments changed.
2. **Keep everything ADR-057 secured.** Live probes (assessment, test report)
   show search-syntax characters are still text, a multi-word query still
   matches only the exact phrase (`alpha beta` does not find `beta x alpha`),
   whitespace is exact, the default case fold (including `É` / `é`) and
   `case: true` are unchanged, path mode still returns file-name matches,
   and folder scoping and the line-break rule are unchanged.
3. **Keep the name.** The exported name `literalPhraseQuery` stays, to limit
   churn, though it now builds a regex (fix report, Follow-ups).
4. **Completeness is proved without the CLI.** Test L11 compiles the body
   between the delimiters for 204 inputs, 200 of them deterministic
   pseudo-random, with and without the `u` flag, and checks that it matches
   its input literally and nothing else. Review (PR #130) added the nine
   search-syntax inputs of L6 to that list.

## Alternatives rejected

- **Raw single-word queries, quotes only for multi-word ones.** A raw token
  is still read as Obsidian syntax (`-draft`, `tag:x`), which ADR-057 fixed,
  and a multi-word query that starts or ends inside a word (`pha bet`) would
  still miss.
- **Run the search in an `eval` template with the escaped pattern, as
  `pattern_search` does.** Rejected for ADR-057's reason: it reimplements
  file-name matching, the case fold and folder scoping, and would move
  `context_search` off `search:context`. The regex form gets literal matching
  from the CLI's own engine.
- **Revert to the raw query.** Brings back BI-0169's word-splitting and
  operator parsing.
- **Escape only some characters.** Without escaping, `/o.bar(b/` makes the
  CLI print `Error: Failed to parse regular expression. ... Unterminated
  group`. With the full set every query compiles; the escapes used are valid
  identity escapes with or without the `u` flag.
- **Share one escape module now** (PR #130 review, finding 1; owner ruling
  Q1 = C). The character set is `find_and_replace`'s `escapeRegex` set plus
  `/`, and `src/tools/_vault-relative-error.ts` writes the same set inline. A
  shared `src/tools/_regex-escape.ts` was deferred, not rejected: it edits
  tools BI-0175 does not cover and a test file whose edit needs its own
  approval.

## Consequences

- A query now also matches inside longer words (`decision` finds
  `decisions`). That is the contract the descriptions always stated, but a
  caller used to 0.9.0-local's whole-word results sees more hits.
- Every argv row in both handlers' tests shows `query=/…/`; the existing
  rows that pinned the quoted form were edited under the owner's ruling
  Q1 = A.
- A regex the CLI could not compile would surface as `CLI_REPORTED_ERROR`
  through the dispatch classifier, not as an empty result (constitution
  Principle IV). Full escaping means none is expected.
- The live check sampled timing on one vault (78–105 ms per call, quoted or
  regex) and found no slowdown; it does not prove none for very short or
  very common substrings.
- Not exercised live: a path-mode phrase spanning a line break, and macOS
  and Linux. The report's original `|` query (0 versus 114 matches) was never
  recorded, so synthetic `|` rows stand in for it (owner ruling Q2 = A).
- Manual probes from Git Bash rewrite an argument starting with `/` as a
  Windows path (MSYS path conversion). The server spawns with
  `shell: false` and is unaffected; probe through Node or with
  `MSYS_NO_PATHCONV=1`.
