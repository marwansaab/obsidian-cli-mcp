# Bug Verification: set_property writes wikilink lists as one scalar and splits list items on commas

- **Slug**: bi-0203
- **Tested**: 2026-11-07
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The bug no longer reproduces. Run against the real Obsidian CLI in the authorised test vault, the fixed handler writes wikilink lists, one-link lists and items that contain commas as YAML lists holding exactly the items sent, and `read_property` returns the same items in the same order. A control probe that sent the pre-fix comma-joined wire form still produced the quoted scalar, which shows the harness detects the bug. Automated suites, type-check and lint all pass, and no regressions were found.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix), live CLI | `node probe.mjs`: the built `executeWriteProperty` and `executeReadProperty` (`dist/`, real spawn of `Obsidian.com`) against `TestVault-Obsidian-CLI-MCP`, fixtures in `Sandbox/BI-0203-test/` | pass (10/10) | Each case checks the `read_property` read-back and the frontmatter read from disk. Details below. |
| Control (pre-fix wire form) | `invokeCli` `property:set value=[[A]],[[B]] type=list` on a fresh fixture | reproduces the bug, as expected | `related: "[[A]],[[B]]"` (one scalar), the reported symptom byte for byte |
| New / updated tests | `npx vitest run src/tools/set_property` | pass | 3 files, 73 tests (includes cases 5, 6 and the new 6a–6h) |
| Regression suite | `npm test` (vitest with coverage) | pass | 203 files passed, 1 skipped; 5079 tests passed, 6 skipped; no coverage threshold errors; the schema fingerprint baseline gate passed |
| Type-check | `npm run typecheck` | pass | exit 0 |
| Lint | `npm run lint` | pass | exit 0 |
| Build | `npm run build` | pass | exit 0 (needed for the live probe) |

### Live probe matrix

All writes used `name: "related"`, specific mode with `vault` + `path`, except c09, which used `file`.

| Case | Input `value` (`type`) | Frontmatter on disk | `read_property` value | Result |
|---|---|---|---|---|
| c01 (TC-00904, criterion 1) | `["[[A]]","[[B]]"]` (`list`) | `- "[[A]]"` / `- "[[B]]"` | `["[[A]]","[[B]]"]`, type `list` | pass |
| c02 (criterion 2) | `["[[A]]","[[B]]"]` (omitted) | `- "[[A]]"` / `- "[[B]]"` | `["[[A]]","[[B]]"]` | pass |
| c03 (criterion 3) | `["[[A]]"]` (`list`) | `- "[[A]]"` | `["[[A]]"]` | pass |
| c04 (TC-00905, criterion 4) | `["one","two, three"]` (`list`) | `- one` / `- two, three` | `["one","two, three"]` | pass |
| c05 (criterion 6) | `["x","y"]` (`list`) | `- x` / `- y` (unquoted, as before) | `["x","y"]` | pass |
| c06 (edge items) | `["Smith, John","a \"q\" b","#tag","- dash","[[N\|Alias]]"]` (`list`) | five items, YAML-quoted where needed | the same five strings | pass |
| c07 (option B) | `["a","b"]` (`text`) | `related: a,b` | `"a,b"`, type `text` | pass (unchanged behaviour) |
| c08 (empty list, FR-018) | `[]` (omitted) | `related: []` | `[]` | pass |
| c09 (specific+file mode) | `["[[A]]","[[B]]"]` (omitted) | `- "[[A]]"` / `- "[[B]]"` | `["[[A]]","[[B]]"]` | pass |
| c10 (repair of a damaged note) | seeded `related: "[[A]],[[B]]"`, then wrote `["[[A]]","[[B]]"]` | `- "[[A]]"` / `- "[[B]]"` | `["[[A]]","[[B]]"]` | pass |

Criterion 5 (reading the list back returns the same items in the same order) holds in every list case above.

## Output Excerpts

```text
c01-wikilinks-list  frontmatter: "related:\n  - \"[[A]]\"\n  - \"[[B]]\"\n"   read: {"value":["[[A]]","[[B]]"],"type":"list"}
c04-comma-item      frontmatter: "related:\n  - one\n  - two, three\n"         read: {"value":["one","two, three"],"type":"list"}
c07-text-explicit   frontmatter: "related: a,b\n"                             read: {"value":"a,b","type":"text"}
c11-control-old-wire frontmatter: "related: \"[[A]],[[B]]\"\n"
```

```text
Test Files  203 passed | 1 skipped (204)
     Tests  5079 passed | 6 skipped (5085)
```

## Cleanup

- `Sandbox/BI-0203-test/` (11 fixture notes created by this run) was removed. No `.trash/` entry was created, and `Welcome.md` is still in place.
- No other vault content was touched. The probe script lives outside the repository, in `%LOCALAPPDATA%\Temp\bi0203-probe\`.

## Residual Risks

- **Active mode was not probed live.** Its `property:set` call uses the same `serialiseValue` output as the other two modes. It is covered at unit level by handler test (6h) only.
- **Windows host only.** The live probe ran on Windows through `Obsidian.com`. CI covers Linux and Windows at unit level with the spawn stubbed. The argv carries `"` characters, and the assessment's probes and this run show that they survive Node's `shell: false` quoting on Windows. Linux and macOS argv passing does not re-quote, so it is not expected to differ, but it was not exercised live.
- **The comma limitation still applies to arrays with an explicit non-list `type`** (c07). This is intended under option B and documented on the help page.
- **Notes damaged by earlier writes stay damaged** until their property is rewritten (out of scope). c10 shows that a rewrite repairs the property.

## Recommendation

Close the bug: it is verified end-to-end. All six acceptance criteria hold against the live CLI, both reported test cases (TC-00904, TC-00905) pass, and the regression suite is green. Continue with the PR, code review and `/speckit-docs-as-code`. The docs pass should also update the vault Tool Notes bullet on single-element wikilink lists (fix.md follow-ups).
