# Bug Verification: find_and_replace drops regex replacements whose pattern uses lookbehind or lookahead

- **Slug**: bi-0202
- **Tested**: 2026-11-07
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The bug no longer reproduces. Against the built server, over real stdio, in the authorised test vault, a regex-mode lookbehind or lookahead `find_and_replace` now previews `WORD` as the replacement, and on commit writes `Paren WORD here` with an accurate count. The no-prefix case reports zero and leaves the note alone, and the capture-and-reinsert workaround still works. Unit, full-suite, type-check and lint checks all pass; no regressions found.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix), live TC-00903 | `npm run build`, then a temporary stdio probe (`node .specify/bugs/bi-0202/_live-probe.ts`, deleted after the run) that spawns `node dist/index.js` through `scripts/_stdio-client.ts` and calls `find_and_replace` with `vault: "TestVault-Obsidian-CLI-MCP"`, single-note `path` scope under `Sandbox/BI-0202-1793979208649/`, `mode: "regex"` | pass (5/5) | Focused vault confirmed first (`obsidian eval "code=app.vault.getName()"` → `=> TestVault-Obsidian-CLI-MCP`). The probe read each note back from disk after the call. |
| Acceptance 1: lookbehind commit | `(?<=Paren )word` → `WORD`, `commit: true` on `Paren word here` | pass | File reads `Paren WORD here`; `total_occurrences_replaced: 1`; note in `changed_notes`. |
| Acceptance 2: prefix absent | same pattern on `Other word here`, `commit: true` | pass | File unchanged; `total_occurrences_replaced: 0`; `changed_notes: []`. |
| Acceptance 3: lookbehind preview | same pattern, `commit` omitted | pass | `matched_substring: "word"`, `replacement_substring: "WORD"`; file unchanged. |
| Acceptance 4: count equals changes | the commit cases above | pass | Every non-identity regex commit reported exactly the changes that landed on disk (identity rewrites are out of scope per the assessment's Relay ruling). |
| Acceptance 5: lookahead commit | `word(?= here)` → `WORD`, `commit: true` | pass | File reads `Paren WORD here`; count 1; note in `changed_notes`. |
| Workaround still works | `(Paren )word` → `$1WORD`, `commit: true` | pass | File reads `Paren WORD here`; count 1. |
| New / updated tests | `npx vitest run src/tools/find_and_replace` | pass | 8 files passed (1 skipped), 203 tests passed, 6 skipped. Includes the BI-0202 cases in `replace.test.ts` and `handler.test.ts`; `fix.md` records that 3 of the 4 new handler tests failed on the unfixed code. |
| Regression suite | `npm test` (`vitest run --coverage`) | pass | 203 files passed (1 skipped), 5072 tests passed, 6 skipped. Includes the FR-018 schema-fingerprint gate (no published-surface change). |
| Type-check | `npx tsc --noEmit -p tsconfig.json` | pass | exit 0. |
| Lint | `npx eslint src/tools/find_and_replace` | pass | exit 0, no output. |
| Vault hygiene | Sandbox listing after the run; `Welcome.md` present | pass | The run's `Sandbox/BI-0202-1793979208649/` folder was removed; no BI-0202 residue in `Sandbox/`; `Welcome.md` untouched. Other pre-existing `Sandbox/` content was not touched. |

## Output Excerpts

Live probe (one JSON line per case, abridged to the response):

```text
{"case":"lookbehind-preview","pass":true,...,"response":{"mode":"preview","affected_notes":[{"path":"Sandbox/BI-0202-1793979208649/lb-preview.md","occurrence_count":1,"occurrences":[{"line_number":1,"full_line":"Paren word here","matched_substring":"word","replacement_substring":"WORD"}]}],"total_occurrences":1}}
{"case":"lookbehind-commit","pass":true,...,"fileAfter":"Paren WORD here","response":{"mode":"commit","changed_notes":["Sandbox/BI-0202-1793979208649/lb.md"],"total_occurrences_replaced":1,"partial":false}}
{"case":"lookahead-commit","pass":true,...,"fileAfter":"Paren WORD here","response":{"mode":"commit","changed_notes":["Sandbox/BI-0202-1793979208649/la.md"],"total_occurrences_replaced":1,"partial":false}}
{"case":"no-prefix-commit","pass":true,...,"fileAfter":"Other word here","response":{"mode":"commit","changed_notes":[],"total_occurrences_replaced":0,"partial":false}}
{"case":"workaround-commit","pass":true,...,"fileAfter":"Paren WORD here","response":{"mode":"commit","changed_notes":["Sandbox/BI-0202-1793979208649/wa.md"],"total_occurrences_replaced":1,"partial":false}}
cleanup: removed Sandbox/BI-0202-1793979208649
exit=0
```

Full suite:

```text
 Test Files  203 passed | 1 skipped (204)
      Tests  5072 passed | 6 skipped (5078)
```

## Residual Risks

- The live check ran against the local build (`dist/` from this branch), not the published npm package; the published `0.9.0` still has the bug until a release ships the fix.
- Live cases used single-note `path` scope only. Folder and vault-wide scope share the same `scanNotes` path and are covered by the unit tests, but were not exercised live (a multi-note commit asks for confirmation).
- `` $` `` and `$'` now expand to the line text before and after the match (ECMAScript meaning) instead of always being empty. This is covered by reasoning in `fix.md`, not by a dedicated test.
- Identity replacements (for example `(a)` → `$1`) still count as occurrences and list the note as changed, by the assessment's Relay ruling; acceptance criterion 4 was verified for non-identity replacements only.

## Recommendation

Close the bug — verified end-to-end: the TC-00903 reproduction no longer reproduces against the built server in the authorised test vault, all five acceptance criteria hold for non-identity replacements, and the full suite, type-check and lint are green. Proceed to the PR, `/code-review`, and `/speckit-docs-as-code`, where the Tool Notes' capture-and-reinsert workaround for lookbehind can be retired.
