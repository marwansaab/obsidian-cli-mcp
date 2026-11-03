# Bug Verification: search and context_search match only whole words since the literal-phrase change

- **Slug**: bi-0175
- **Tested**: 2026-11-03
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The bug no longer reproduces. Through the built server, `search` (both modes) and `context_search` now match queries that start or end part-way through a word. Multi-word queries still match only the exact phrase. Syntax characters, `|`, case rules and file-name matches behave as the assessment's probe table predicts. The same raw-CLI calls in the quoted (pre-fix) form still return `No matches found.`, which confirms the quoting was the cause. On `My-Setup-Vault`, the report's own `id: TC-0078` query now finds `TC-00783` and `TC-00784`, and the regex form is no slower than the quoted form. Unit, regression, type and lint gates all pass. No regressions were found.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction, pre-fix form (raw CLI) | `Obsidian.com vault=TestVault-Obsidian-CLI-MCP search:context query="<q>" path=<fixture dir> format=json` for `ead170`, `cap170`, `TC-0078`, `pha bet` | pass (symptom confirmed) | Quoted form: `No matches found.` for `ead170`, `TC-0078`, `pha bet`; `cap170` gives line 2 only. |
| Reproduction, post-fix form (raw CLI) | Same calls with `query=/<q>/` | pass | Every query finds the substring; `cap170` gives lines 1 and 2. |
| Live probe matrix through the built server | `npm run build`, then an MCP stdio client against `node dist/index.js` calling `search`, `search` with `context_lines: true`, and `context_search` (all with `vault` and `folder` set to the fixture dir), for the 21 queries in the assessment's table | pass | Fixtures were created through `app.vault.create` in `Sandbox/bi0175-live-1793689502724/` (`n1.md`, `n2.md`, `n3.md`) and confirmed with `files folder=`. Results are in Output Excerpts. |
| Report query on `My-Setup-Vault` (read-only) | Built server: `search` and `context_search` with `query: "id: TC-0078"` and `"id: TC-00783"`, vault-wide | pass | `id: TC-0078` returns 11 notes/lines, including `TC-00783 …` and `TC-00784 …` (line 11). `id: TC-00783` returns 2 (the test case plus the BI-0175 note that quotes it). |
| Speed on a large vault (assessment, Risks) | Raw CLI `search`, quoted versus regex form, 3 alternating runs each for `status`, `decision`, `Relay` on `My-Setup-Vault` | pass | Both forms take 78–105 ms per call; no slowdown. The regex form returns more for `decision` (321 vs 283), as expected for substring matching. |
| New / updated tests | `npx vitest run src/tools/search src/tools/context_search` | pass | 13 files, 493 tests. Covers L1–L12, S1–S10 and C1–C10. |
| Regression suite | `npm test` (vitest with coverage) | pass | 193 files passed, 1 skipped; 4759 tests passed, 6 skipped. The FR-018 fingerprint gate passes, and `_register-baseline.json` is unchanged. |
| Type-check | `npm run typecheck` | pass | `tsc --noEmit` clean. |
| Lint | `npm run lint` | pass | `eslint .` clean. |
| Vault cleanup | `app.vault.delete(<fixture folder>, true)`, then listing `Sandbox/` and checking `.trash/` and `Welcome.md` | pass | Eval answered `=> deleted`. `Sandbox/` matches the pre-run listing, there is no `.trash/` folder, and `Welcome.md` is present. |

## Output Excerpts

Raw CLI, quoted versus regex (fixture dir `Sandbox/bi0175-live-1793689502724`):

```
"ead170"  => No matches found.
/ead170/  => [{"file":".../n1.md","matches":[{"line":1,"text":"lead170 cap170long here"}]}]
"cap170"  => [{"file":".../n1.md","matches":[{"line":2,"text":"cap170"}]}]
/cap170/  => [{"file":".../n1.md","matches":[{"line":1,"text":"lead170 cap170long here"},{"line":2,"text":"cap170"}]}]
"TC-0078" => No matches found.
/TC-0078/ => [{"file":".../n1.md","matches":[{"line":5,"text":"id: TC-00783 line"}]}]
"pha bet" => No matches found.
/pha bet/ => [{"file":".../n1.md","matches":[{"line":4,"text":"alpha beta gamma"}]}]
```

Built server (`search` paths | `search` line mode | `context_search`):

```
"ead170"      | 1 [n1.md] | 1 [n1.md:1] | 1 [n1.md:1]
"cap170"      | 1 [n1.md] | 2 [n1.md:1, n1.md:2] | 2 [n1.md:1, n1.md:2]
"TC-0078"     | 1 [n1.md] | 1 [n1.md:5] | 1 [n1.md:5]
"pha bet"     | 1 [n1.md] | 1 [n1.md:4] | 1 [n1.md:4]
"a b"         | 1 [n1.md] | 1 [n1.md:4] | 1 [n1.md:4]
"alpha beta"  | 1 [n1.md] | 1 [n1.md:4] | 1 [n1.md:4]     (not n2.md "beta x alpha")
"ol a | co"   | 1 [n1.md] | 1 [n1.md:3] | 1 [n1.md:3]
"l b |"       | 1 [n1.md] | 1 [n1.md:3] | 1 [n1.md:3]
"| col a"     | 1 [n1.md] | 1 [n1.md:3] | 1 [n1.md:3]
"o.bar(b"     | 1 [n2.md] | 1 [n2.md:2] | 1 [n2.md:2]
"/usr/bin/"   | 1 [n3.md] | 1 [n3.md:1] | 1 [n3.md:1]
"a\\b"        | 1 [n3.md] | 1 [n3.md:2] | 1 [n3.md:2]
"say \"hi"    | 1 [n3.md] | 1 [n3.md:3] | 1 [n3.md:3]
"-draft"      | 1 [n3.md] | 1 [n3.md:6] | 1 [n3.md:6]
"tag:x"       | 0 []      | 0 []        | 0 []            (read as text, not an operator)
" cap170"     | 1 [n1.md] | 1 [n1.md:1] | 1 [n1.md:1]
"ALPHA"       | 2 [n1.md, n2.md] | 3 [n1.md:4, n1.md:6, n2.md:1] | 3 (same)
"ALPHA" case  | 1 [n1.md] | 1 [n1.md:6] | 1 [n1.md:6]
"CAFÉ"        | 1 [n1.md] | 1 [n1.md:6] | 1 [n1.md:6]
"n2"          | 1 [n2.md] | 0 []        | 0 []            (file-name match kept in path mode)
"alpha\nbeta" | 0 []      | 0 []        | 0 []            (no fixture spans this break; see Residual Risks)
```

No call returned `isError`. None returned a CLI regex-parse error.

Gates:

```
Test Files  193 passed | 1 skipped (194)
     Tests  4759 passed | 6 skipped (4765)
```

## Residual Risks

- **Line-break query in path mode not exercised live.** None of the fixtures contained `alpha` at the end of one line and `beta` at the start of the next, so the `alpha\nbeta` row shows only that nothing false matched. It does not show that a phrase spanning a line break still matches in path mode. The line-mode rule is unchanged code (`selectLines`) and stays covered by unit tests (S7, C7, L8). The path-mode behaviour comes from the CLI and was shown in the assessment's own probe.
- **The `|` query from the report (0 versus 114) was never reproduced.** As ruled in Q2 = A, synthetic rows (`ol a | co`, `l b |`, `| col a`) stand in for it, and all of them match.
- **Timing is a small sample:** three queries, three runs each, on one vault and one host, with Obsidian warm. It shows no slowdown at the 80–100 ms scale. It does not prove there is none for every query shape (very short or very common substrings).
- **Broader matches are now possible.** A query now also matches inside longer words (`decision` finds `decisions`). This is the documented "literal substring" contract (FR-001, FR-010), but callers used to the whole-word results since 0.9.0-local will see more hits.
- **Testing note:** raw-CLI probes run from Git Bash rewrite an argument that starts with `/` (MSYS path conversion: `query=/TC-00783/` became a Windows path and failed with `Error: Operator "c" not recognized`). This only affects shell-driven probes; the server spawns with `shell: false`. For manual probes, use Node or set `MSYS_NO_PATHCONV=1`.

## Recommendation

Close the bug: the fix is verified end-to-end. The original symptom no longer reproduces through the built server or against the vault named in the report. The quoted form still reproduces it, which isolates the cause. All gates pass. Before merge, the PR's docs pass still has to update `docs/tools/search.md`, `docs/tools/context_search.md` and `CHANGELOG.md`, which describe the query as a quoted phrase (fix.md, Follow-ups).
