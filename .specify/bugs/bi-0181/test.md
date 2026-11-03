# Bug Verification: tag values read and matched in two forms depending on metadata-cache state

- **Slug**: bi-0181
- **Tested**: 2026-11-03
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The bug reproduces against a real mixed metadata cache in the authorised test vault, and the fix removes it. The pre-fix comparison splits two notes tagged `bi0076closed` by cache form (one note per query), while this branch's `find_by_property` returns both notes for `bi0076closed` and `#bi0076closed`, twice in a row. `read_property` returns `["bi0076closed"]` for both notes, although the CLI reports `#bi0076closed` for one of them. No regressions: the targeted suites, the full suite, typecheck and lint all pass. One step of the assessment's live plan could not be reproduced this session: `property:set` did not push a note into the `#` form (see Residual Risks). The check used a note already cached in that form instead.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction, planned trigger | `live.mjs` (scratch, outside the repo): seed `Sandbox/BI-0181-live/note-a.md` and `note-b.md` tagged `bi0181-live`, `property:set status=y` on A, poll 5 s, then `computeFileMetadataAsync` | not-run (trigger did not fire) | The cache stayed `["bi0181-live"]` for both notes, so the mixed state was not reached (`mixed cache state reached: false`). On that uniform cache, the fixed handlers returned both notes for `bi0181-live`, `#bi0181-live`, `#BI0181-LIVE` with `case_sensitive: false`, and `["#bi0181-live"]` with `array_match: false`; `read_property` returned `["bi0181-live"]` for both. That is a no-regression result only, not a reproduction. Sandbox restored. |
| Trigger probe | `probe.mjs`: one seeded note, watched for 6 s after each of `property:set`, `computeFileMetadataAsync` and `app.fileManager.processFrontMatter` | not-run (trigger did not fire) | `tags` stayed `["bi0181-probe"]` after all three writes. Obsidian 1.15.0 (installer 1.14.4), the same version the assessment probed. Sandbox restored. |
| Reproduction (pre-fix control) | `mixed.mjs`: the fixture `Fixtures/BI-0076/closed-note.md` (cached `["#bi0076closed"]`, file text `- bi0076closed`, read only) plus a new `Sandbox/BI-0181-mixed/raw-note.md` (cached `["bi0076closed"]`). Pre-fix template = this branch's built `JS_TEMPLATE` with the `nt` change reversed, run through `composeEvalCode` + `invokeEval` across the whole vault | pass (symptom reproduced) | `bi0076closed` → 1 match (raw note only); `#bi0076closed` → 1 match (fixture only). This is the report's harm (a): each query silently misses the notes in the other cache form. |
| Reproduction (post-fix) | `mixed.mjs`: built `executeFindByProperty` / `executeReadProperty` from `dist/`, `vault=TestVault-Obsidian-CLI-MCP`, same mixed cache | pass | `find_by_property` `bi0076closed` → 2 matches, again 2 (criterion 1); `#bi0076closed` → the same 2 (criterion 2). `read_property` `tags` → `{"value":["bi0076closed"],"type":"list"}` for the fixture and for the raw note (criterion 3: one form for both cache states). The cache was still mixed at the end of the run. |
| Raw CLI control for `read_property` | `Obsidian.com vault=TestVault-Obsidian-CLI-MCP properties path=Fixtures/BI-0076/closed-note.md format=json` | pass (symptom present upstream) | Prints `"tags": ["#bi0076closed"]`, the Call A input that pre-fix `read_property` returned unchanged (harm (b)). |
| New / updated tests | `npx vitest run src/tools/_tag-hash.test.ts src/tools/find_by_property src/tools/read_property src/tools/tag` | pass | 11 files, 217 tests. Includes the 8 `find_by_property/_template.test.ts` cases (5 failed on the pre-fix template during `/speckit-bug-fix`), the 5 BI-0181 `read_property` handler cases and `_tag-hash.test.ts`. |
| Regression suite | `npx vitest run` | pass | 195 files passed, 1 skipped; 4788 tests passed, 6 skipped. Includes the registration-baseline equality check. |
| Lint / type-check | `npm run typecheck`, `npm run lint` | pass | Both clean. |
| Build | `npm run build` | pass | `dist/` rebuilt from this branch for the live checks. |
| Vault cleanup | `readdir(Sandbox)` before and after each script; fixture text re-read | pass | All three scripts printed `Sandbox restored to pre-run listing: true` (or `Sandbox restored: true`). The fixture still reads `tags:\n  - bi0076closed`; it was never written. |

## Output Excerpts

`mixed.mjs` (mixed cache, real Obsidian):

```text
cache tags [FIXTURE, RAW]: [["#bi0076closed"],["bi0076closed"]]
mixed cache state: true
PRE-FIX find tags=bi0076closed: {"count":1,"paths":["Sandbox/BI-0181-mixed/raw-note.md"]}
PRE-FIX find tags=#bi0076closed: {"count":1,"paths":["Fixtures/BI-0076/closed-note.md"]}
FIXED find tags=bi0076closed (1st): {"count":2,"paths":["Fixtures/BI-0076/closed-note.md","Sandbox/BI-0181-mixed/raw-note.md"]}
FIXED find tags=bi0076closed (2nd): {"count":2,"paths":["Fixtures/BI-0076/closed-note.md","Sandbox/BI-0181-mixed/raw-note.md"]}
FIXED find tags=#bi0076closed: {"count":2,"paths":["Fixtures/BI-0076/closed-note.md","Sandbox/BI-0181-mixed/raw-note.md"]}
FIXED read_property tags FIXTURE: {"value":["bi0076closed"],"type":"list"}
FIXED read_property tags RAW: {"value":["bi0076closed"],"type":"list"}
Sandbox restored to pre-run listing: true
```

`probe.mjs` (trigger not reproduced):

```text
after property:set status=y: [{"t":0,"v":"[\"bi0181-probe\"]"}]
after computeFileMetadataAsync: [{"t":0,"v":"[\"bi0181-probe\"]"}]
after fileManager.processFrontMatter status=z: [{"t":0,"v":"[\"bi0181-probe\"]"}]
```

Full suite: `Test Files  195 passed | 1 skipped (196)` / `Tests  4788 passed | 6 skipped (4794)`.

## Residual Risks

- **The `#` cache form could not be produced on demand this session.** The assessment's reproduction step 3 (`property:set` flips the cache to `#`) did not fire with `property:set`, `computeFileMetadataAsync` or `processFrontMatter`, on the same Obsidian version. The assessment had already noted the timing varies ("in one run, the cache still held the raw form about 3 s after `property:set`"). The fix does not depend on the trigger: it normalises whatever form the cache holds. The verification therefore used the fixture the assessment's vault scan had found already cached in `#` form, which gives a real mixed cache, not a simulated one. What remains unconfirmed this session is only Obsidian's trigger behaviour, which is outside the fix.
- **The pre-fix control is reconstructed.** The pre-fix template was rebuilt by reversing this fix's two-line change in the built `JS_TEMPLATE`. The script throws if that replacement fails to change the string, and it ran. It is equivalent to `HEAD~`'s template line for line, but it was not loaded from the pre-fix build.
- **Live check went through the built handlers, not an MCP client.** The scripts called `executeFindByProperty` / `executeReadProperty` from `dist/` with real `createLogger()` / `createQueue()` and the real CLI. Input parsing and the MCP wire are covered by the unit suites and the registration-baseline check, not by this live run.
- **Scope as assessed.** Only the property named exactly `tags` is normalised. If a later Obsidian adds `#` to other keys, this fix will not cover them (assessment Risks).
- **Vault state.** The only `#`-form note found in the test vault is `Fixtures/BI-0076/closed-note.md`. It was left as it was. A later Obsidian re-parse may flip it back to raw, so future runs may need another way to get a `#`-form note.

## Recommendation

Close the bug once the PR merges. The fix is verified end-to-end against a real mixed metadata cache. Before the fix, each form of the query missed the other form's notes. After it, both forms return every note, repeatably, and `read_property` returns the written form for both cache states. Unit, regression, typecheck and lint gates are green. The one gap is Obsidian's own trigger for the `#` form, which could not be reproduced this session. It does not affect the fix, which is independent of how a note reached that form.
