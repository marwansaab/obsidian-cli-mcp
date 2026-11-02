# Post-implement: 088 Preserve match whitespace

## T001 baseline

Run on branch `088-preserve-match-whitespace` at `f2a81eb`, before any edit:
`npm run typecheck; if ($?) { npm run lint }; if ($?) { npm test }` in PowerShell.

- `tsc --noEmit`: clean.
- `eslint .`: clean.
- `npm test` (vitest with coverage): exit code 0. Coverage summary: statements 96.89%, branches 94.6%, functions 91.73%, lines 97.7%.

No pre-existing failure.

## T003 search unchanged

After the `selectLines` / `capLine` split, `npx vitest run src/tools/search src/tools/context_search` passed (10 files, 207 tests) with no existing test edited; L9 and L10 pass.

## T008 red

`npx vitest run src/tools/context_search` before T009–T013:

- `_template.test.ts` and `read-back.test.ts` fail to load: `Cannot find module './_template.js'`.
- `handler.whitespace.test.ts`: 13 of 16 fail (H20, H21, H23, H25–H29, H31–H35), each on the trimmed text or the missing read-back. H22, H24 and H30 pass, because the pre-change output already equals the expected value for those rows (no edge whitespace, a CRLF strip, and no read-back on a zero-match search).

Two test-row corrections made while writing the rows, both arithmetic slips with the row's intent kept:

- **H28**: the contract says 498 spaces + `"zqx"`, which is 501 characters, while the row's expectation is "500 chars, no `…`". The test uses 497 spaces, the 500-character boundary the row names. A comment in the test records this.
- **R2**: the 40-character paths are built as `Notes/NNN-` + 27 × `p` + `.md`.

## T014 approved test edits — STOPPED for owner review

`npx vitest run src/tools` after T009–T013, with the approved §E edits applied:

```text
Test Files  2 failed | 164 passed | 1 skipped (167)
     Tests  2 failed | 3881 passed | 6 skipped (3889)
```

Approved edits applied (no expected `text`, `count`, `truncated` or argv value changed):

- `context_search/handler.test.ts`: `readBackResponse(wire)` appended to every queue whose stub returns at least one `.md` line (one per queue; two in the byte-identical test, one per folder-normalisation iteration); H1 and H2 `toHaveLength(1)` → `toHaveLength(2)` and "single CLI call" dropped from both titles; the H14 1000- and 999-note tests queue one response per `planReadBack(selectLines("x", wire, 1000).rows)` batch through a local `readBackResponses(wire, cap)` helper.
- `context_search/handler.literal-phrase.test.ts`: C1, C4, C5, C6 only.
- `context_search/index.test.ts:64`: `readBackResponse(wire)` appended.
- `_typed-result-fixtures.ts`: the context_search entry is `cli(out(JSON.stringify(wire)), readBackResponse(wire))`.

Two failing assertions lie OUTSIDE the approved scope. Neither test was edited.

**1. `src/tools/context_search/handler.test.ts` — "response key-set — exactly ['count','matches','truncated'] when truncated" (line ~258)**

This test stubs 1000 notes (`f0000.md` … `f0999.md`), the same wire as the H14 1000-note test, so its read-back needs several batches under `READ_BACK_CODE_MAX`. The approved scope gives it one extra response; the second ruling's "as many read-back responses as their batches need" names only the two H14 tests.

```text
FAIL  src/tools/context_search/handler.test.ts > response key-set — exactly ['count','matches','truncated'] when truncated
Error: unexpected spawn invocation #3; only 2 response(s) configured
 ❯ spawnFn src/tools/_handler-test-fixtures.ts:172:13
```

**2. `src/tools/_plugin-noise.test.ts` — "noise matrix inventory > covers every eval-composed tool named in spec 080 Key Entities" (line 263)**

The noise matrix finds its cohort by running every typed-result fixture and keeping those that spawn a wrapped eval. context_search now does, so it joins the cohort, and the hard-coded 24-name set no longer matches. The plan expected `_plugin-noise.test.ts` to pass unedited. Every N1–N11 noise row for context_search passes, so only the inventory literal differs.

```text
FAIL  src/tools/_plugin-noise.test.ts > noise matrix inventory > covers every eval-composed tool named in spec 080 Key Entities
AssertionError: expected Set{ 'append_note', 'backlinks', …(23) } to deeply equal Set{ 'backlinks', 'links', …(22) }
- Expected
+ Received
@@ -1,8 +1,9 @@
  Set {
    "append_note",
    "backlinks",
+   "context_search",
    "find_and_replace",
```

Typecheck and lint of the changed files are clean. Implementation stopped here until the owner ruled.

### Owner ruling (2026-11-02, option A) and the extended edit list

The owner approved both edits, with no expected `text`, `count`, `truncated` or argv value changing. The ruling is recorded on the BI-0170 note and in refactor-decisions item 5 (third ruling):

- `context_search/handler.test.ts` "response key-set … when truncated": the single `readBackResponse(wire)` became `...readBackResponses(wire, 1000)`, one response per batch, as in the H14 tests.
- `_plugin-noise.test.ts` "noise matrix inventory": `"context_search"` added to the expected set.

Re-run of `npx vitest run src/tools`: 166 files passed (1 skipped), 3,883 tests passed (6 skipped), 0 failed.

## T015 US2 bite check

H23–H26, T2, T3 and R8 were green on the US1 implementation. Two temporary mutations of `src/tools/context_search/read-back.ts`, each run with `npx vitest run src/tools/context_search`, then restored:

- `lineText(raw)` → `raw`: 7 failures. The required ones fail: **H24, H25, R8**. The others are R1 (its `\r` case), C6, and H13 (a) and (b).
- `lineText(raw)` → `raw.trimEnd()`: 8 failures. The required ones fail: **H23, H25, H26**. The others are H29, H35, R1, R8 and H13 (b).

After the restore, 129 of 129 context_search tests pass.

## T016 / T017 help page and surface diff

- `docs/tools/context_search.md` now carries the contract's help-page text:
  - `### CRLF normalisation` gives the "What is removed" paragraph;
  - `### Single-call architecture (no probe path)` is renamed `### Calls per request` and gives the "Calls" sentence, adding that a search with no lines makes one call and that the folder probe is unchanged;
  - the `CLI_REPORTED_ERROR` roster row gains (e), `MATCH_LINE_UNAVAILABLE` with its three reasons and its recovery;
  - the migration section lists **three** differences, the new one being **Whitespace**;
  - `### Latency` gains the read-back sentence.
- Example 5's closing sentence still reads correctly, and is now true.
- The page has no remaining "trimmed" or "single call" claim. The `matches[].text` row ("Single trailing `\r` stripped") is still true and was left as it is (T016: change nothing else).
- `git diff --exit-code main -- src/tools/context_search/index.ts`: no output, exit 0. `git diff main -- src/tools/context_search/schema.ts` shows only the header sentence, `contextSearchReadBackSchema` and the `ContextSearchReadBack` type.

## T019 quickstart §1 gate and red check

- `npx vitest run src/tools/context_search src/tools/search src/tools/_surface.test.ts src/tools/_register.test.ts src/tools/_plugin-noise.test.ts`: 16 files, 834 tests, all passed.
- `npm test`: 186 files passed (1 skipped), 4,416 tests passed (6 skipped), exit 0. The coverage floor and the FR-018 baseline gate pass. Coverage: statements 96.95%, branches 94.64%, functions 91.87%, lines 97.74%.
- `npm run typecheck`: clean. `npm run lint`: clean.
- Red check 1, with `readBackLines` temporarily returning `rows.map((r) => r.text)`: 38 failures. The required **H20, H21, H23, H25, H26 and H27** all fail. The other failures are expected, because no eval runs: the R rows, spawn counts and failure rows.
- Red check 2, with the trim-equality test temporarily dropped (`raw === null` only): 3 failures, the required **H32 and R7**, plus R9, whose first failing row relies on the trim mismatch.
- Both changes restored; 129 of 129 context_search tests pass again.
- File lengths, all under 1000 lines:
  - `_template.test.ts` 90;
  - `read-back.test.ts` 234;
  - `handler.whitespace.test.ts` 159;
  - `handler.test.ts` 618;
  - `handler.literal-phrase.test.ts` 132;
  - `index.test.ts` 118;
  - `search/line-matches.test.ts` 32;
  - `_plugin-noise.test.ts` 541;
  - `_typed-result-fixtures.ts` 361;
  - `_handler-fixtures.ts` 25.

## T020 quickstart §2 surface gate

`git diff --stat main -- src/tools/_register-baseline.json src/tools/context_search/index.ts src/tools/search/index.ts src/tools/search/handler.ts src/tools/search/schema.ts src/errors.ts src/cli-adapter` printed nothing (exit 0). `npm run baseline:write` was not run. P1–P3 hold. Under `src/tools/search/`, only `line-matches.ts` (the planned split) and `line-matches.test.ts` (L9–L10 added, existing rows unedited) changed.

## T021 structural verification

After `codegraph sync`, `codegraph_explore "readBackLines planReadBack JS_TEMPLATE selectLines capLine lineMatches executeContextSearch lineText"` shows the flow `executeContextSearch → readBackLines → planReadBack`. It runs only when the search is not the sentinel, the wire parses, and at least one row is selected.

1. **Error codes**: `src/errors.ts` is unchanged and no error class was added. All three new `UpstreamError` construction sites in `read-back.ts` (json-parse, envelope-parse, MATCH_LINE_UNAVAILABLE) use `CLI_REPORTED_ERROR`.
2. **DI factories**: no `createLogger` / `createQueue` import in `context_search/` production files, and `server.ts` is unchanged. The handler passes its deps whole to `readBackLines`, which passes them whole to `invokeEval`.
3. **Imports**: `read-back.ts` imports only `./_template.js`, `./schema.js`, `cli-adapter.js` (`invokeEval`, type `InvokeCliDeps`), `errors.js`, `_eval-parse.js`, `_note-lines.js`, `_shared.js` and type `SearchLineOutput` from `search/schema.js`. `_template.ts` imports only `_shared.js`. Neither imports `./handler.js`. Outside `context_search/`, the only importer of `context_search/*` is `_typed-result-fixtures.ts` (`_handler-fixtures.js` and `index.js`), as planned.
4. **Production callers**:
   - `readBackLines` ← `handler.ts`;
   - `planReadBack` and `JS_TEMPLATE` ← `read-back.ts`;
   - `selectLines` ← `context_search/handler.ts` and `lineMatches`;
   - `capLine` ← `context_search/handler.ts` and `lineMatches`;
   - `contextSearchReadBackSchema` / `ContextSearchReadBack` ← `read-back.ts`;
   - `READ_BACK_CODE_MAX` ← `planReadBack`;
   - `lineMatches` keeps search's handler as its only production caller (by design, research D2).

No kernel node was edited. Implementation choice recorded: `readBackLines` keeps the stdout of each row's batch (`stdoutOfRow`), so an answer that omits a requested line reports that batch's output in its `envelope-parse` details. The tasks text leaves that choice of stdout open.

## T018 CHANGELOG

`[Unreleased]` gains the `Spec 088-preserve-match-whitespace (BI-0170).` paragraph after the spec 087 line, and the `### Fixed` bullet for `context_search` exactly as worded in T018.

## T022 required live check (quickstart §3)

This followed `.memory/test-execution-instructions.md`. `npm run build` was clean. Before the run, `Obsidian.com eval "code=app.vault.getName()" vault=TestVault-Obsidian-CLI-MCP` answered `=> TestVault-Obsidian-CLI-MCP`.

The pre-run `Sandbox/` listing had 13 entries: `BI-0008, BI-0016, BI-0165, BI-0168, BV, TC-00005, TC-00030, TC-00033, TC-00034, TN, pr3-check-2026-10-30.md, Serial-focus.md, TC-00038-focus.md`.

**Harness.** It was a throwaway Node script outside the repository (`%TEMP%\088-live\live.mjs`):

1. Seed the fixtures with one `app.vault.create` eval. The code was 610 characters and the answer was `=> seeded`.
2. Poll `search:context` until it listed all 306 files.
3. Start `node dist/index.js` over stdio, with a `--import` preload that logs each CLI spawn's subcommand and `code=` length to stderr.
4. Send `initialize` and `tools/call` as raw JSON-RPC.
5. Remove the folder with `app.vault.delete(folder, true)`, which answered `=> removed`.

**Fixtures** were in `Sandbox/088-live-20261102082525/`:

- `fx/f1.md`: `intro` / `\tzqx tab indented` / `end`, LF;
- `fx/f2.md`: `    zqx four spaces`;
- `fx/f3.md`: `zqx trailing two  `;
- `fx/f4.md`: `intro` / `zqx crlf two  ` / `end`, CRLF;
- `fx/f5.md`: ` zqx nbsp edges `;
- `fx/f6.md`: six spaces + `zqx ` + 600 × `a`;
- `bulk/n001.md` … `bulk/n300.md`: each `  zqx <n>`.

**Cases.** 12 attempted, 12 passed, 0 failed.

| Case | Result |
|------|--------|
| fixtures (`folder: …/fx`): count 6, no `truncated` | pass |
| f1 line 2 → `"\tzqx tab indented"` | pass |
| f2 line 1 → `"    zqx four spaces"` | pass |
| f3 line 1 → `"zqx trailing two  "` | pass |
| f4 line 2 (CRLF) → `"zqx crlf two  "` | pass |
| f5 line 1 → `" zqx nbsp edges "` | pass |
| f6 line 1 → first 500 characters (starting with the six spaces) + `…` | pass |
| bulk (`folder: …/bulk`, `limit: 300`): 300 rows | pass |
| bulk: `truncated: true` (300 ≥ limit 300, the conservative rule) | pass |
| bulk: every `text` matches `/^  zqx \d+$/` (two leading spaces kept) | pass |
| bulk: several read-back evals, each `code=` under 3,000 | pass (10 evals, longest `code=` 2,946) |
| `limit: 1000` over the whole fixture folder: 306 rows | pass |

**Measurements.** These are wall times from request to response, observations and not guarantees. The help page's `### Latency` note now cites them.

| Call | Rows | Read-back evals | CLI spawns | Wall time |
|------|------|-----------------|------------|-----------|
| fixtures | 6 | 1 | 2 | 188 ms |
| bulk, `limit: 300` | 300 | 10 | 11 | 894 ms |
| whole folder, `limit: 1000` | 306 | 10 | 11 | 934 ms |

**Cleanup.** After the run, `Sandbox/` lists the same 13 entries, `Welcome.md` is present, and the vault has no `.trash` folder. No residue.

The work is complete: every task passed, the live check included.
