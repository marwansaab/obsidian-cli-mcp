# Research: Preserve match whitespace

**Feature**: [spec.md](spec.md) (BI-0170) | **Plan**: [plan.md](plan.md) | **HEAD at research time**: `03594f1`

This file records what the code does today (F1 to F4), what live probes against the Obsidian CLI showed (F5 to F9), and the decisions that follow (D1 to D8).

## T0 method

- Vault: `TestVault-Obsidian-CLI-MCP`, addressed with an explicit `vault=` on every call, following `.memory/test-execution-instructions.md`.
- Fixtures: three notes in `Sandbox/088-probe-20261102/`, created with `app.vault.create` in an `eval` (the indexing gotcha in spec 087 research) and removed afterwards with `app.vault.delete(folder, true)`. Before and after the run `Sandbox/` held the same 13 entries, and `Welcome.md` was untouched.
  - `lf.md` (LF endings, frontmatter, unterminated last line): lines starting with a tab or four spaces, lines ending in two spaces or a tab, a line with a no-break space (U+00A0) at both edges, a 2000-character line, a line with a mid-line `\r`, a line starting with U+3000, and an unterminated last line.
  - `crlf.md` (CRLF endings): a line ending in two spaces before `\r\n`, and a tab-indented line.
  - `twice.md`: `  zqx and zqx again  `.
- Binary: `obsidian` spawned from Node with `shell: false`, as `dispatchOnce` spawns it.
- Commands:
  - `search:context query="zqx" path=<dir> format=json`;
  - an `eval` reading each note with `app.vault.cachedRead`, splitting it on `"\n"` and stripping one trailing `"\r"`;
  - `obsidian help search:context`.

## Findings

### F1. The handler passes on the CLI's text, so the trimming is the CLI's

`executeContextSearch` (`src/tools/context_search/handler.ts:49`) makes one `invokeCli("search:context")` call. It hands the parsed wire to `lineMatches` (`src/tools/search/line-matches.ts:16`) with the normaliser `stripCr`, which removes one trailing `"\r"`. Nothing in the wrapper trims. The only extra call is the folder probe, which runs after a zero-match answer.

### F2. `lineMatches` caps before it sorts and slices

The pipeline is: `.md` filter → `oneMatchPerLine` → flatten with `capLine(normaliseText(text))` → `truncated = flat.length >= appliedCap` → sort by `(path, line)` → slice to `appliedCap`. `capLine` and `normaliseText` are pure per-row functions, so applying them after the slice gives the same rows. Search's deprecated line mode is the other caller and passes its own normaliser (refactor-decisions item 47(d)).

### F3. Every existing test that returns a line stubs exactly one spawn

`context_search/handler.test.ts`, `handler.literal-phrase.test.ts`, `index.test.ts:64` and the context_search entry in `_typed-result-fixtures.ts:136` stub only the `search:context` call. `makeQueuedSpawn` throws once its queue is exhausted. So any second call when lines are found makes those tests fail. Zero-match, error and validation rows are not affected. The owner approved the scoped edits (refactor-decisions item 5, spec 088 entry; see D7).

### F4. The repo already has every building block for a read-back eval

- `invokeEval` (`cli-adapter.ts:116`) is the typed-eval entry point. It runs in the named vault, or in the focused vault when `vault` is undefined, which is the same rule `search:context` follows (refactor-decisions item 32, T0 P6).
- `composeEvalCode` (`_shared.ts:26`) carries a base64 JSON payload, so data never becomes code.
- `parseEvalAnswer` and `stdoutDetails` (`_eval-parse.ts`) are the shared answer parse and error excerpt.
- `runEvalTemplate` (`_eval-template-fixtures.ts`) runs a frozen template in-process under `node:vm`.
- `lineText` (`_note-lines.ts:40`) is the shared "drop one `\n`, then one `\r`" rule.
- `CLI_REPORTED_ERROR` with a `details.code` sub-discriminator is the existing shape for conditions Obsidian reports inside an eval answer, for example pattern_search's `FOLDER_NOT_FOUND` (ADR-015).

### F5. The CLI numbers lines from 1 over the whole note and splits only on line feeds

Frontmatter counts: the first body line after a three-line frontmatter was line 4. A mid-line `\r` stayed inside its line (`"mid\rzqx carriage"`, line 11), and CRLF lines were numbered like LF lines. That is exactly `content.split("\n")` with 1-based indices.

### F6. The CLI trims exactly like `String.prototype.trim`

Leading and trailing spaces, tabs, U+00A0 and U+3000 were all removed, and so was the `\r` of a CRLF ending. Internal whitespace was kept. In the same eval context, `trim()` removes U+00A0 and U+3000 too.

### F7. The CLI does not shorten long lines

The 2000-character line came back whole, so the 500-character cap is the wrapper's alone.

### F8. A read through `cachedRead` lines up with the CLI line for line

For every reported `(path, line)`, `cachedRead(file).split("\n")[line - 1]`, with one trailing `\r` removed, gave the untrimmed line, and its `trim()` equalled the CLI's `text`. This included the CRLF lines, the NBSP and U+3000 lines, the mid-`\r` line and the unterminated last line.

### F9. The CLI has no option to return untrimmed text

`obsidian help search:context` lists only `query`, `path`, `limit`, `case` and `format`. Restoring the whitespace therefore needs a second read of the note.

### F10. A long eval argument fails silently or stalls the CLI shim (tasks-time probes, 2026-11-02)

**Bounded re-probe** (owner ruling 2026-11-02, after Obsidian was restarted): read-only evals against `TestVault-Obsidian-CLI-MCP`, `code="<'A'×n>".length`, each with a 15 s timeout, stepping n = 2000, 3000, 4000, 5000 and stopping at the first failure.

| `code=` value length | Result |
|----------------------|--------|
| 2,009 | exit 0, `=> 2000` |
| 3,009 | exit 0, `=> 3000` |
| 4,009 | exit 0, `=> 4000` (last success) |
| 5,009 | **exit 0, empty stdout, empty stderr** (silent failure; probe stopped) |

The CLI answered normally right afterwards (`eval code=1+1` → `=> 2`, `vaults` listed every vault). So the shim's limit for the eval code lies between about 4,000 and 5,000 characters. Above it the CLI either says nothing with exit 0, or (at 20,000, below) stalls and breaks the connection until Obsidian restarts. Through `invokeEval`, the silent case surfaces as a missing answer (`json-parse`), never as an empty result. Still, no read-back eval may approach the limit (D3).

**First probe** (before the restart):

During `/speckit-tasks`, a probe sent `obsidian vault=TestVault-Obsidian-CLI-MCP eval code="<'A'×20000>".length` from Node's `spawn` with `shell: false`. It wrote nothing to the vault. `Obsidian.com` (command line 20,065 characters) never answered, and the probe killed it after several minutes.

From then on, every CLI call failed with exit code 1 and stderr `The CLI is unable to find Obsidian. Please make sure Obsidian is running and try again.` That included `obsidian version`, `obsidian vaults` and a 1,000-character eval, even though the Obsidian processes were still running and responding. An eval of about 2,400 characters had worked earlier in the same session (T0 seed).

An oversized eval can therefore leave the CLI unusable until Obsidian is restarted. D3's original budget of 24000 base64 characters was withdrawn. D3 now sets the budget from the bounded re-probe, and the owner's second ruling covers the test consequence (D7).

## Decisions

### D1. Read the selected lines back with one eval (batched), after selection and before the cap

The order becomes:

1. Select the rows exactly as today (`.md` filter, one entry per line, truncation, sort, slice).
2. If any rows remain, read back only those lines with `invokeEval` and a frozen template. The template looks up each path with `app.vault.getAbstractFileByPath`, reads it with `app.vault.cachedRead`, splits it on `"\n"` and returns each requested line raw, or `null` when the line is past the end.
3. Each returned line goes through `lineText`, which removes one trailing `\r` (FR-004).
4. Then apply the 500-character cap (FR-005).

- **Rationale**: F5 and F8 show the template addresses the same line the CLI reported. `cachedRead` reads the same text Obsidian's search uses, so a note saved to disk but not yet re-read by Obsidian cannot cause a false failure. Reading only the selected lines (at most `limit`) keeps the payload and the answer small. The eval runs in the same vault as the search (F4). Zero-match and line-break queries make no extra call.
- **Alternatives considered**:
  - *Read the notes from disk in the handler (`fs.readFile`).* That needs the vault root: from the registry for a named vault, or from a focused-vault eval otherwise. It also needs realpath containment for a path the wrapper joins (Security Defaults), which would refuse symlinked notes the search finds (the trap refactor-decisions item 35 records for `read`). It adds new fs failure modes too. Rejected.
  - *Replace `search:context` with one eval that both searches and returns lines.* ADR-057 rejected moving search into an eval: it would reimplement matching, case folding and folder scoping. Rejected.
  - *Return the whole note text and split in the handler.* The answer would grow with note size instead of with the result count, against the 10 MiB output cap. Rejected.
  - *Do the `\r` strip inside the template.* Keeping it in TypeScript through `lineText` puts FR-004 in one tested place, shared with the editors' line rule (refactor-decisions item 46). Rejected.

### D2. Split selection from text in `line-matches.ts`, and keep `lineMatches` for search

- `line-matches.ts` exports `selectLines(query, wire, appliedCap) → { rows, truncated }`, with each row's text the raw CLI text, uncapped.
- It also exports `capLine`.
- `lineMatches` becomes `selectLines` plus `capLine(normaliseText(text))` per row. F2 shows that is the same output, and the existing `line-matches.test.ts` rows and search's suites prove it.
- context_search calls `selectLines`, then the read-back, then `capLine`.

- **Rationale**: the step order spec 087 made load-bearing (truncation counts deduplicated lines) stays in one function, as refactor-decisions item 47 requires. Search's deprecated line mode keeps its exact behaviour (FR-008, SC-005) with no change to its handler.
- **Alternatives considered**:
  - *Give `lineMatches` an async text hook.* Search would then await a no-op, and the hook would carry an I/O concern into a pure module. Rejected.
  - *Re-inline the pipeline in context_search.* Item 47 forbids it. Rejected.
- **Amended (PR #121 code-quality review, 2026-11-02)**: once context_search stopped calling `lineMatches`, search's identity function was the only value `normaliseText` ever took, so the parameter no longer did anything. `lineMatches` and `normaliseText` are gone. `line-matches.ts` now exports `selectLines` and `lineOutput({ rows, truncated })`, which caps each text (`capLine`, private again) and builds `{ count, matches, truncated? }`. Search calls `lineOutput(selectLines(...))`. context_search calls `lineOutput({ rows: await readBackLines(rows, ...), truncated })`, and `readBackLines` returns the rows with their text replaced. Selection order and output are unchanged (FR-006, FR-008, SC-005).

### D3. Batch the read-back so no eval command line passes a fixed budget

*(Revised at tasks time from F10; the first version's 24000-character budget was withdrawn.)*

**Payload.** The payload is compact tuples, `[[path, [n, …]], …]`, grouped by path in output order.

**Batching.** Rows are split into consecutive batches. Each batch's composed eval code, `composeEvalCode(JS_TEMPLATE, batch)` before `invokeEval`'s answer-tag wrapper, is at most `READ_BACK_CODE_MAX = 2900` characters.

- The wrapper (`wrapEvalCode`) adds a fixed 66 characters, so every `code=` value stays under 3,000 characters. That is about 25% below the last length the shim answered (4,009, F10).
- A batch is cut between rows. One note's lines may therefore span batches, and a batch always holds at least one row.
- The template is kept at or under 900 characters, pinned by a test, so each batch carries about 2,000 characters of base64.

**Execution.** Batches run one after another through the shared queue, each with the call's deps, so cancellation reaches every batch. The reconciliation looks each row up by `(path, line)` across all the answers.

**Cost.** Typical results (tens of lines over a few notes) need one batch. A 1000-line result over 1000 distinct notes with paths around 40 characters needs about 40 evals, which adds roughly that many CLI round trips to that call. A search that returns no lines needs none.

- **Rationale**:
  - F10 shows the shim's limit is a few thousand characters of eval code, far below any OS command-line limit. Above it the shim fails silently or breaks the connection, so the budget is a safety limit, not just a performance one.
  - base64 is plain ASCII, so the composed code's length is exact whatever the path characters.
  - Cutting between rows rather than notes lets a note with hundreds of matched lines still fit.
- **Alternatives considered**:
  - *One unbounded eval.* F10: past about 4,000 characters it returns nothing, and at 20,000 it broke the CLI until Obsidian restarted. Rejected.
  - *Budget at the last success (4,009).* No margin for the vault argument, quoting or a future template change. Rejected.
  - *One eval per note.* It is never fewer evals than batching, and up to 1000 for the default limit. Rejected.
  - *Read from disk to avoid the argument limit.* Rejected in D1, and the owner's ruling kept the eval route with a budget.

### D4. Fail the whole call on any line that cannot be read back faithfully (Clarification Q1)

The handler walks the selected rows in output order. For the first row that fails, it throws `UpstreamError`:

- `code: "CLI_REPORTED_ERROR"`;
- `details: { code: "MATCH_LINE_UNAVAILABLE", reason, path, line }`;
- `reason` is one of:
  - `"note-not-found"`: no file at the path;
  - `"read-failed"`: `cachedRead` threw; `details.detail` carries the error text;
  - `"line-changed"`: the line is past the note's end, or `lineText(raw).trim() !== row.text.trim()`.

The call returns no partial results.

Failures to parse the read-back answer use the existing stage shape: `CLI_REPORTED_ERROR` with `details.stage` `"json-parse"` or `"envelope-parse"`, plus `stdoutDetails`. CLI failures of the eval itself (exit codes, timeout, output cap, a vault that went away) propagate unchanged from `invokeEval`.

- **Rationale**: Principle IV and the clarification rule out a trimmed fallback, a dropped row and a new top-level code. `CLI_REPORTED_ERROR` is the code the cohort already uses for a condition Obsidian reports in an eval answer (F4), and ADR-015 puts the states in `details.reason` from day one. Comparing `trim()` on both sides is exact by F6, and it stays correct if a later CLI trims less or not at all. Line `n` past the end and different text are both "the line Obsidian found is not there any more", so they share `line-changed`, as the clarification asks.
- **Alternatives considered**:
  - *`FS_WRITE_FAILED { reason: "read" }` as `read` uses it.* That code names a filesystem failure in the wrapper's own I/O. Here Obsidian does the read and reports it through the eval. Rejected.
  - *Separate reasons for "line past end" and "text differs".* The clarification counts them as one failure, and an agent's recovery is the same (search again). Rejected.

### D5. Tests

- **New**:
  - `context_search/_template.test.ts`: the template under `runEvalTemplate` with a stub `app`.
  - `context_search/read-back.test.ts`: the read-back and its errors, plus batching.
  - `context_search/handler.whitespace.test.ts`: the acceptance scenarios end to end through `executeContextSearch` with `makeQueuedSpawn`.
  - New `selectLines` rows in `search/line-matches.test.ts`.
- **Edited**: only the approved scope in D7.
- **Unchanged**: search's suites, which are the SC-005 regression anchor.

### D6. The published surface does not move, and the help page is corrected

- `CONTEXT_SEARCH_DESCRIPTION` says "trailing `\r` stripped", which stays true. Input and output schemas are untouched, so `_register-baseline.json` must not move (FR-010).
- `docs/tools/context_search.md` changes in four places:
  - its "Single-call architecture" note now describes the read-back call;
  - its error roster gains the `MATCH_LINE_UNAVAILABLE` sub-discriminator;
  - its CRLF note states the rule as "the line without its line ending";
  - Example 5's whitespace sentence becomes true as written.
- The `.docs-as-code` known-limit about F9 is removed by the docs pass.

### D7. Approved existing-test edits (owner ruling 2026-11-02, option A, BI-0170)

Recorded in `.memory/refactor-decisions.md` item 5. The approved edits, and nothing else:

1. `context_search/handler.test.ts`: each test whose stub returns at least one `.md` line gets one extra queued eval response giving the note's line, equal to the stubbed CLI text; in H13 the line also ends with `\r`. H1 (line 40) and H2 (line 310) change `toHaveLength(1)` to 2 and drop "single CLI call" from their titles.
2. `handler.literal-phrase.test.ts`: C1, C4, C5 and C6 get the same extra response. C3, C7, C9 and the zero-match rows stay untouched. Owner ruling 2026-11-02 shrank this from C1, C3, C4, C5, C6 and C9, because C3 and C9 stub only the zero-match sentinel.
2a. Owner ruling 2026-11-02 (after F10): the two H14 tests with 1000 and 999 notes in `context_search/handler.test.ts` may queue as many read-back responses as their batches need, with no change to any expected value.
3. `context_search/index.test.ts:64`: the extra response.
4. `_typed-result-fixtures.ts:136`: the context_search stub also answers the eval call.

No expected `text`, `count`, `truncated` or argv value changes. If any other existing assertion fails, implementation stops and raises it.

### D8. A live check is required

Quickstart §3 seeds a reduced version of the T0 fixture set through Obsidian in `Sandbox/`. It calls the built server's `context_search` and expects the contract's live column, which proves SC-001 and SC-002. SC-006 needs the note to change between the search and the read-back, which cannot be timed reliably live, so the automated rows prove it. Results are recorded in `post-implement.md`.

## Follow-ups (out of scope)

1. The case-fold wording drift recorded by spec 087 (F7 there) is still open.
2. The deprecated line mode of `search` still returns trimmed text (FR-008). Its help page already marks the mode deprecated; whether to document the trimming there is a docs-pass call.
