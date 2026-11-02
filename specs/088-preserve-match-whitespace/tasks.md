---

description: "Task list for 088 Preserve match whitespace"
---

# Tasks: Preserve match whitespace

**Input**: Design documents from `specs/088-preserve-match-whitespace/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/match-whitespace-contract.md](contracts/match-whitespace-contract.md), [quickstart.md](quickstart.md)

**Tests**: requested. Constitution Principle II requires them, and the spec's acceptance scenarios name them. Write each story's tests first; rows that prove the fix must fail on the unfixed code. US2's rows run through the read-back US1 builds, so they pass when written; the quickstart §1 red check proves that they bite.

**Organization**: one phase per user story in priority order: US1 (P1), US2 (P2), US3 (P3). Row IDs refer to the contract:

- P1–P3: surface checks;
- T1–T9: template rows;
- R1–R16: read-back rows;
- L9–L10: selection rows;
- H20–H35: handler rows;
- §E: the approved edits to existing tests.

**Scope**: `context_search` only. The following stay out of scope and unedited:

- `src/tools/search/handler.ts` and every existing test under `src/tools/search/` (P3, FR-008);
- both `index.ts` files (descriptions);
- the input and output schemas;
- `_register-baseline.json`;
- `src/errors.ts`;
- `src/cli-adapter/**`;
- the case-fold wording (spec 087 follow-up).

**Before any code edit**:

- load the `karpathy-guidelines` skill;
- read `.memory/refactor-decisions.md`. These items apply here:
  - §2: the byte-exact bar for unchanged behaviour;
  - §5, spec 088 entry: the only existing-test edits allowed are contract §E (T014);
  - §27(a): the baseline proves surface changes and must not move;
  - §29: pass deps whole;
  - §41: typed evals go through `invokeEval`;
  - §46: one rule in one module, so reuse `lineText`;
  - §47: `lineMatches` stays THE pipeline, so split it and do not re-inline it.

**Before any live call**: read `.memory/test-execution-instructions.md`. Never send an eval whose `code=` value is above 3,000 characters to the real CLI (research F10).

**Run vitest through PowerShell**, not the Bash tool.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US3 from spec.md

---

## Phase 1: Setup

**Purpose**: a known-green starting point.

- [ ] T001 Before any edit, run `npm run typecheck; if ($?) { npm run lint }; if ($?) { npm test }` in PowerShell on branch `088-preserve-match-whitespace`. Create `specs/088-preserve-match-whitespace/post-implement.md`, headed `# Post-implement: 088 Preserve match whitespace`, and record the result under `## T001 baseline`. A failure here is pre-existing: report it, and do not fix it in this feature.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: split selection from text in the shared line pipeline (research D2), with no behaviour change.

- [ ] T002 Add rows L9 and L10 to `src/tools/search/line-matches.test.ts`. Do not edit the existing rows or the `fileWithLines` / `WIRE` helpers.
  - Import `selectLines` next to `lineMatches`, and extend the header comment to name `selectLines` (L9–L10, spec 088).
  - **L9**: `selectLines("q", [{ file: "a.md", matches: [{ line: 1, text: "x".repeat(600) }] }], 10).rows[0].text` has length 600, so it is uncapped.
  - **L10**: for `WIRE` at caps 10 and 2, `selectLines(...)` gives `rows.map(({ path, line }) => ({ path, line }))` and `truncated`, and these equal `lineMatches(..., (t) => t)`'s `matches` (paths and lines) and `truncated === true`-ness.
  - Both rows must fail to compile until T003.
- [ ] T003 Refactor `src/tools/search/line-matches.ts`:
  - **Export `capLine`**, unchanged.
  - **Add `export function selectLines(query, wire, appliedCap): { rows: SearchLineOutput["matches"]; truncated: boolean }`**:
    - the same line-break guard, `.md` filter and `oneMatchPerLine`;
    - flatten to `{ path: f.file, line: m.line, text: m.text }` with the raw text;
    - `truncated = flat.length >= appliedCap`;
    - the same `(path, line)` sort, then slice to `appliedCap`.
  - **Rewrite `lineMatches`** as `selectLines`, then `text: capLine(normaliseText(row.text))` per row, returning `{ count, matches, ...(truncated ? { truncated: true as const } : {}) }`. That is byte-identical output (research F2).
  - **Update the header comment**: `selectLines` owns membership, order and truncation; `lineMatches` adds the caller's normaliser and the cap for search's deprecated line mode; context_search uses `selectLines` + `capLine` around its read-back (spec 088).
  - **Verify** in PowerShell: `npx vitest run src/tools/search` is all green with no existing test edited, and L9–L10 pass.

**Checkpoint**: search behaviour unchanged; `selectLines` and `capLine` available.

---

## Phase 3: User Story 1 — Indentation is kept (Priority: P1) 🎯 MVP

**Goal**: context_search returns each matched line as the note holds it, minus its line ending (research D1, D3, D4; data-model E3–E5).

**Independent Test**: H20–H22 through `executeContextSearch`, and the live column's indented rows (quickstart §3).

### Tests for User Story 1 (write first; they must fail before T010–T013)

- [ ] T004 [P] [US1] Create the vitest-free test fixture `src/tools/context_search/_handler-fixtures.ts`.
  - **Header**: `// Original — no upstream. Read-back stub responses for context_search tests (spec 088): the eval answer that gives each wire line's text as the note's line. Vitest-free (\`_*fixtures.ts\` convention).`
  - **Export `readBackResponse(wire: SearchContextWireFile[], raw?: (path: string, line: number, text: string) => string | null): StubResponse`**. It returns `{ stdout: "=> " + JSON.stringify({ notes }) + "\n", exitCode: 0 }`, where `notes` has one `{ path: f.file, state: "read", lines: f.matches.map((m) => ({ line: m.line, raw: raw ? raw(f.file, m.line, m.text) : m.text })) }` per wire file. With no `raw`, each note line equals the stubbed CLI text.
  - **Export `readBackAnswer(notes: unknown[]): StubResponse`**, which wraps arbitrary `notes` the same way for failure rows.
  - Import `StubResponse` from `../_handler-test-fixtures.js` and `SearchContextWireFile` from `../search/schema.js`.
- [ ] T005 [P] [US1] Create `src/tools/context_search/_template.test.ts`.
  - **Header**: `// Original — no upstream. In-process tests for the context_search read-back eval template (spec 088): T1–T9 under runEvalTemplate with a stub app.`
  - Import `runEvalTemplate` from `../_eval-template-fixtures.js` and `JS_TEMPLATE` from `./_template.js`.
  - **Stub `app`**: `vault.getAbstractFileByPath(p)` returns `{ path: p }` for a known note, `{ path: p, children: [] }` for a folder, or `null`; `vault.cachedRead(f)` resolves the note text or rejects.
  - **Rows**: T1–T9 exactly as in the contract. The payload is tuples `[[path, [line, …]], …]`. The answer is `{ notes: [{ path, state, lines? | detail? }] }`, with `lines: [{ line, raw }]` where `raw = content.split("\n")[line - 1]`, or `null` past the end.
  - **T9** asserts `JS_TEMPLATE.length <= 900`.
- [ ] T006 [P] [US1] Create `src/tools/context_search/read-back.test.ts`.
  - **Header**: `// Original — no upstream. Tests for context_search's read-back (spec 088): batching under READ_BACK_CODE_MAX, reconciliation against the CLI text, and the MATCH_LINE_UNAVAILABLE error contract (R1–R16).`
  - **Preamble**: copy the `deps(spawnFn)` helper and the `__resetInFlightRegistryForTests` hooks from `src/tools/context_search/handler.test.ts:25-30`.
  - **Imports**: `readBackLines`, `planReadBack` and `READ_BACK_CODE_MAX` from `./read-back.js`; `makeQueuedSpawn`, `captureRejection` and `findKv` from `../_handler-test-fixtures.js`; the T004 helpers.
  - **Rows**: R1–R16 exactly as in the contract. R15 covers the line-1 byte-order mark, and R16 covers one note's state shared across batches.
  - **R2 and R14**: measure each recorded eval's `code=` value with `findKv(argv, "code")!.length < 3000`. Also assert `planReadBack(rows)` gives batches whose `composeEvalCode(JS_TEMPLATE, batch).length <= READ_BACK_CODE_MAX`.
  - **Error rows** assert `code === "CLI_REPORTED_ERROR"` and `details` with `toEqual` / `toMatchObject` against the contract table, including `path` and `line`. **R10** also covers an answer-less stdout (`{ stdout: "", exitCode: 0 }`), the F10 silent case.
- [ ] T007 [P] [US1] Create `src/tools/context_search/handler.whitespace.test.ts`.
  - **Header**: `// Original — no upstream. context_search handler tests for untrimmed line text (spec 088): H20–H35 through executeContextSearch with the search stub plus the read-back stub.`
  - **Preamble**: as in T006, plus `readBackResponse` / `readBackAnswer`.
  - **Rows**: H20–H35 exactly as in the contract. H34 covers the line-1 BOM end to end. For H35, the wire lists the same line twice, and the read-back stub's raw line has whitespace.
    - Each match-returning row queues `[{ stdout: JSON.stringify(wire), exitCode: 0 }, readBackResponse(wire, raw)]`, with the CLI `text` the trimmed form and `raw` the untrimmed line.
    - **H29**: assert `count`, `truncated`, paths, lines and order equal what the same wire gave before. Write the expected values out literally, derived from the selection rules, not from a call to `lineMatches`.
    - **H30**: queue only the sentinel, plus the folder probe response for the folder variant. Assert `getCount()` is 1 without a folder and 2 with one, so no read-back runs.
    - **H33**: assert `vault=V` on both recorded argvs.
- [ ] T008 [US1] Run `npx vitest run src/tools/context_search` in PowerShell. T005–T007 must fail, because the modules don't exist or the text is still trimmed. Record that in `post-implement.md` under `## T008 red`.

### Implementation for User Story 1

- [ ] T009 [P] [US1] Create `src/tools/context_search/_template.ts`.
  - **Header**: `// Original — no upstream. Frozen read-back eval template for context_search (spec 088, research D1): for each [path, lines] tuple it reads the note through app.vault.cachedRead (the text Obsidian's search reads), splits it on "\n" (the CLI's line numbering, F5) and returns each requested line raw, or null past the end; a missing path or a folder is note-not-found, a rejected read is read-failed. Kept at or under 900 characters so every batch stays inside READ_BACK_CODE_MAX (F10).`
  - **Export `JS_TEMPLATE`**: a compact `(async()=>{…})()` that:
    - decodes the payload with `${B64_PAYLOAD_DECODE_EXPR}` from `../_shared.js`;
    - for each `[p, ls]`: `const f = app.vault.getAbstractFileByPath(p)`; if `!f || f.children`, push `{ path: p, state: "note-not-found" }`; else `try { c = await app.vault.cachedRead(f) } catch (e) { push { path: p, state: "read-failed", detail: String(e && e.message || e) } }`; else `a = c.split("\n")` and push `{ path: p, state: "read", lines: ls.map((n) => ({ line: n, raw: n >= 1 && n <= a.length ? a[n - 1] : null })) }`;
    - returns `JSON.stringify({ notes: o })`.
  - Escape `\n` as `\\n` inside the TS template literal, as `read_heading/_template.ts` does.
- [ ] T010 [P] [US1] Add the read-back answer schema to `src/tools/context_search/schema.ts`. Do not touch `contextSearchInputSchema`, `contextSearchMatchSchema` or `contextSearchOutputSchema`.
  - `contextSearchReadBackSchema = z.strictObject({ notes: z.array(z.discriminatedUnion("state", [z.strictObject({ path: z.string(), state: z.literal("read"), lines: z.array(z.strictObject({ line: z.number().int(), raw: z.string().nullable() })) }), z.strictObject({ path: z.string(), state: z.literal("note-not-found") }), z.strictObject({ path: z.string(), state: z.literal("read-failed"), detail: z.string() })])) })`.
  - Export `type ContextSearchReadBack = z.infer<typeof contextSearchReadBackSchema>`.
  - Append "read-back answer schema (spec 088)" to the header comment.
- [ ] T011 [US1] Create `src/tools/context_search/read-back.ts` (depends on T009, T010).
  - **Header**: `// Original — no upstream. context_search read-back (spec 088, research D1/D3/D4): Obsidian's search trims each line, so the selected lines are read back from the notes through invokeEval in batches whose composed code stays at or under READ_BACK_CODE_MAX (the Obsidian.com shim answers nothing above about 4,000 characters, F10), reconciled against the CLI's text by trim equality (F6), and returned as the note's line minus one trailing \r (lineText). Any row that cannot be read back faithfully fails the whole call with CLI_REPORTED_ERROR / details.code MATCH_LINE_UNAVAILABLE (Clarification Q1); there is no fallback.`
  - **Export `READ_BACK_CODE_MAX = 2900`.**
  - **Export `planReadBack(rows): Array<Array<[string, number[]]>>`**:
    - walk the rows in order, appending the row to the current batch's last tuple when the path matches, otherwise as a new tuple;
    - if `composeEvalCode(JS_TEMPLATE, batch).length > READ_BACK_CODE_MAX` and the batch already held a row, move this row into a new batch;
    - every batch holds at least one row.
  - **Export `async function readBackLines(rows, vault: string | undefined, deps: InvokeCliDeps): Promise<string[]>`**, which returns texts aligned with `rows`:
    - for each batch in order, `await invokeEval({ code: composeEvalCode(JS_TEMPLATE, batch), vault }, deps)`, passing deps whole (refactor-decisions §29);
    - parse each answer with `parseEvalAnswer`. On a throw: `UpstreamError({ code: "CLI_REPORTED_ERROR", cause, details: { stage: "json-parse", ...stdoutDetails(stdout) }, message: "context_search: line read-back eval returned unparseable response" })`;
    - then `contextSearchReadBackSchema.safeParse`. On failure: the same with `stage: "envelope-parse"`, `cause: error` and message `"context_search: line read-back eval returned unexpected shape"`;
    - index the answers in two maps, filled across all batches:
      - a per-path map from `path` to its state (`note-not-found` with no lines, or `read-failed` with `detail`), because those entries carry no lines;
      - a per-line map keyed by `` `${path}\u0000${line}` `` holding each `raw` from `read` entries;
    - then walk the rows in order and throw at the first problem:
      - the row's path is in the per-path map → `MATCH_LINE_UNAVAILABLE` with that reason (`detail` added for `read-failed`);
      - else no per-line entry → the `envelope-parse` error;
      - `raw === null` or `lineText(raw).trim() !== row.text.trim()` → `line-changed`;
      - otherwise → `lineText(raw)`, with one leading `"﻿"` removed when `row.line === 1` (the spec's byte-order-mark assumption, V8; R15, H34).
  - **The `MATCH_LINE_UNAVAILABLE` error** is `new UpstreamError({ code: "CLI_REPORTED_ERROR", cause: null, details: { code: "MATCH_LINE_UNAVAILABLE", reason, path, line, ...(detail ? { detail } : {}) }, message: \`context_search: line ${line} of "${path}" could not be read back (${reason}); the note may have changed during the search. Run the search again.\` })`.
  - **Imports**: `invokeEval` and `type InvokeCliDeps` from `../../cli-adapter/cli-adapter.js`; `UpstreamError` from `../../errors.js`; `composeEvalCode` from `../_shared.js`; `parseEvalAnswer` and `stdoutDetails` from `../_eval-parse.js`; `lineText` from `../_note-lines.js`; `JS_TEMPLATE` from `./_template.js`; the schema from `./schema.js`; `type SearchLineOutput` from `../search/schema.js`. Do not import from `./handler.js`, so `handler.ts` → `read-back.ts` stays one-directional (Principle I). The handler's `ExecuteDeps` is assignable to `InvokeCliDeps`, so the handler passes its deps whole.
- [ ] T012 [US1] Wire `src/tools/context_search/handler.ts` (depends on T003, T011).
  - **Replace** `lineMatches(input.query, wireParsed.data, appliedCap, stripCr)` with:
    - `const { rows, truncated } = selectLines(input.query, wireParsed.data, appliedCap)`;
    - `const texts = rows.length === 0 ? [] : await readBackLines(rows, input.vault, deps)`;
    - `contextSearchOutputSchema.parse({ count: rows.length, matches: rows.map((r, i) => ({ path: r.path, line: r.line, text: capLine(texts[i]!) })), ...(truncated ? { truncated: true as const } : {}) })`.
  - **Remove** `stripCr` and the `lineMatches` import, and import `selectLines` and `capLine`.
  - **Update the header**: rows come from `selectLines`; matched lines are read back through `readBackLines` (spec 088) so `text` is the note's line minus its line ending, capped after the read-back; a search with no lines makes no read-back; read-back failures are `MATCH_LINE_UNAVAILABLE`.
  - **Do not change** the search call, the sentinel or folder-probe branch, or the JSON / wire parse errors.
- [ ] T013 [P] [US1] Header comment only, in `src/tools/_note-lines.ts`: append that `lineText` is also used by context_search's read-back (spec 088) to drop the `\r` of a line split on `"\n"`. No code change.
- [ ] T014 [US1] Run `npx vitest run src/tools` in PowerShell. Compare the failing tests with the approved scope (contract §E, refactor-decisions §5 spec 088 entry). If **any failing assertion lies outside it, stop**: record it verbatim in `post-implement.md` and raise it for owner review, and do not edit that test. Otherwise apply exactly these edits, importing `readBackResponse` from `./_handler-fixtures.js` (or `./context_search/_handler-fixtures.js` in the shared fixture):
  - **`src/tools/context_search/handler.test.ts`**:
    - Every test whose stub returns at least one `.md` line gets `readBackResponse(wire)` appended to its `makeQueuedSpawn` queue, once per spawn sequence. H3 and the byte-identical test have two queues, so each queue gets one; the folder-normalisation loop gets one per iteration. In H13 the stubbed texts already end with `\r` where the test exercises the strip, so the note's line is the stub text verbatim.
    - H1 (line 40) and H2 (line 310): `toHaveLength(1)` becomes `toHaveLength(2)`, and "single CLI call" is dropped from both titles.
    - The two H14 tests with 1000 and 999 notes queue `planReadBack(selectLines("x", wire, <cap>).rows).length` copies of `readBackResponse(wire)`, with `<cap>` the test's applied cap (1000). This is allowed by the second owner ruling.
  - **`src/tools/context_search/handler.literal-phrase.test.ts`**: C1, C4, C5 and C6 only. C3, C7, C9 and the zero-match rows are untouched.
  - **`src/tools/context_search/index.test.ts:64`**: append `readBackResponse(wire)`.
  - **`src/tools/_typed-result-fixtures.ts:136`**: `cli(out(<same wire JSON>), readBackResponse(<same wire>))`.
  - **Change no expected `text`, `count`, `truncated` or argv value.** Re-run until green, and record the exact edit list in `post-implement.md` under `## T014 approved test edits`.

**Checkpoint**: H20–H22 green; context_search returns indentation.

---

## Phase 4: User Story 2 — Trailing spaces are kept and line endings are not (Priority: P2)

**Goal**: trailing whitespace survives, and a CRLF ending's `\r` does not (FR-003, FR-004).

**Independent Test**: H23–H26, T2, T3 and R8, plus the live CRLF row.

- [ ] T015 [US2] Confirm H23–H26 (in `handler.whitespace.test.ts`), T2, T3 and R8 are green on the US1 implementation. They were written in T005–T007; the mechanism is shared. Then prove they bite. Temporarily replace `lineText(raw)` with `raw` in `src/tools/context_search/read-back.ts`: H24, H25 and R8's CRLF case must fail. Temporarily replace it with `raw.trimEnd()`: H23, H25 and H26 must fail. Restore and re-run to green. Record the result in `post-implement.md` under `## T015 US2 bite check`.

**Checkpoint**: US1 and US2 both green.

---

## Phase 5: User Story 3 — Documentation and returned text agree (Priority: P3)

**Goal**: the help page states exactly what is removed, and nothing on it contradicts the results (FR-009, SC-004).

**Independent Test**: every statement on `docs/tools/context_search.md` about removed text or calls matches the contract's help-page text, and the description is unchanged (P2).

- [ ] T016 [US3] Edit `docs/tools/context_search.md` to carry the contract's help-page text. Change nothing else.
  - `### CRLF normalisation` (line 293): replace the body with the contract's "What is removed" paragraph. Keep the heading.
  - `### Single-call architecture (no probe path)` (line 273): retitle it `### Calls per request` and replace the body with the contract's "Calls" sentence. Add that a search with no lines makes exactly one call, and that the folder probe below is unchanged.
  - `## Error roster` (line 260): extend the `CLI_REPORTED_ERROR` row's "When" with `(e) a matched line could not be read back (\`details.code: "MATCH_LINE_UNAVAILABLE"\`, \`details.reason\` \`note-not-found\` / \`read-failed\` / \`line-changed\`, with \`details.path\` and \`details.line\`)`, and its "Recovery" with `(e) run the search again; the note changed while the search ran`.
  - Example 5 (line 237): leave as it is; it is now true. Confirm it still reads correctly.
  - `## Migration from \`search\` with \`context_lines=true\`` (line 305): change "Two behavioural differences" to "Three behavioural differences", and add the contract's **Whitespace** bullet (analyze finding C1, FR-009).
  - `### Latency` (line 339): append the contract's Latency sentence. T022 adds the measured numbers afterwards.
- [ ] T017 [P] [US3] Confirm P2 by diff: `git diff --exit-code main -- src/tools/context_search/index.ts` prints nothing. In `git diff main -- src/tools/context_search/schema.ts`, only the T010 additions appear.

**Checkpoint**: docs agree with behaviour.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T018 [P] Update `CHANGELOG.md` `[Unreleased]`:
  - add `Spec 088-preserve-match-whitespace (BI-0170).` on its own paragraph after the `Spec 087-match-literal-phrases (BI-0169).` line (line 40);
  - append this bullet to the first `### Fixed` (line 73): `- **\`context_search\` returns each matching line as it is in the note** (spec 088). Leading indentation, trailing spaces (Markdown hard line breaks), tabs and other whitespace are kept; only the line ending is removed, as the help page always said. Obsidian's search trims each line, so the matched lines are now read back from the notes in one extra call (more for very large results); if a note changes between the search and the read-back, the call fails with \`CLI_REPORTED_ERROR\` / \`details.code: "MATCH_LINE_UNAVAILABLE"\` instead of returning stale text. \`search\`'s deprecated \`context_lines\` mode is unchanged.`
- [ ] T019 Run quickstart §1 in full: `npx vitest run src/tools/context_search src/tools/search src/tools/_surface.test.ts src/tools/_register.test.ts src/tools/_plugin-noise.test.ts`, then `npm test` (coverage floor and FR-018 baseline gate), `npm run typecheck` and `npm run lint`.
  - Then run the red check:
    1. Temporarily make `readBackLines` return `rows.map((r) => r.text)`. H20, H21, H23, H25, H26 and H27 must fail.
    2. Restore it, then temporarily drop the trim-equality test. H32 and R7 must fail.
  - Restore both changes and re-run to green.
  - Check every new or edited test file is under 1000 lines with `[System.IO.File]::ReadAllLines(p).Length`.
  - Record everything in `post-implement.md`.
- [ ] T020 Run quickstart §2: `git diff --stat main -- src/tools/_register-baseline.json src/tools/context_search/index.ts src/tools/search/index.ts src/tools/search/handler.ts src/tools/search/schema.ts src/errors.ts src/cli-adapter` must print nothing (P1–P3). Do NOT run `npm run baseline:write`. Record the result in `post-implement.md`.
- [ ] T021 Post-implement structural verification (CLAUDE.md, plan "CodeGraph structural check"). Run `codegraph sync`, then `codegraph_explore "readBackLines planReadBack JS_TEMPLATE selectLines capLine lineMatches executeContextSearch lineText"`, and confirm the plan's four checks:
  1. no new error class or top-level code, and every new `UpstreamError` is `CLI_REPORTED_ERROR`;
  2. no `createLogger` / `createQueue` import;
  3. `read-back.ts` / `_template.ts` imports run only to the modules the plan lists, and nothing outside `context_search/`, its tests, `index.ts` and `_typed-result-fixtures.ts` imports them;
  4. every new export has a production caller.

  Record the findings, and any deviation with its rationale, in `post-implement.md`.
- [ ] T022 **Required** (research D8): the work is not complete until this passes. Run quickstart §3, the live check against the built server (`npm run build`, then `node dist/index.js` through an MCP client) in `TestVault-Obsidian-CLI-MCP` `Sandbox/088-live-<timestamp>/`, following `.memory/test-execution-instructions.md`.
  - Create the fixtures through `app.vault.create` in an eval. Each seeding eval's `code=` value must be under 3,000 characters (F10). Seed the 300 notes in several evals, or write them with a loop inside one short eval that builds the content.
  - Compare with the contract's live column, then remove the folder and confirm `Sandbox/` matches its pre-run listing and `Welcome.md` is present.
  - Measure, as quickstart §3 step 4 describes (analyze finding U1): the wall time and the number of read-back evals for the 300-note call and for a `limit: 1000` call. Record them in `post-implement.md`, and append them to the `### Latency` note in `docs/tools/context_search.md` as observed figures, not as guarantees.
  - Report the cases attempted, passed and failed, with verbatim output for any failure, in `post-implement.md`.
  - If any case fails, the work stays incomplete: record the failure verbatim and fix it, or raise it for owner review.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)**: first.
- **Foundational (T002–T003)**: after T001. Blocks US1, because the handler needs `selectLines` and `capLine`.
- **US1 (T004–T014)**:
  - T004–T007 are parallel, after T003.
  - T008 follows them.
  - T009, T010 and T013 are parallel.
  - T011 follows T009 and T010.
  - T012 follows T011.
  - T014 follows T012.
- **US2 (T015)**: after T014.
- **US3 (T016–T017)**: after T012. Independent of US2.
- **Polish**:
  - T018 any time after T012;
  - T019, T020 and T021 after every story;
  - T022 last.

### Structural dependencies (CodeGraph, tasks phase)

`codegraph_explore "executeContextSearch lineMatches capLine lineText invokeEval"` shows the path `executeContextSearch → lineMatches → capLine`. `lineMatches`'s other caller is `search/handler.ts`. `lineText` is used today only inside `_note-lines.ts` (`placeEdit`) and its tests. `invokeEval` is not yet reached from context_search. Consequences:

- T003 must keep `lineMatches`'s output byte-identical, or search's deprecated mode moves (FR-008). Search's unedited suites are the proof, so run them in T003 before T012 touches context_search.
- T012 removes context_search's only `lineMatches` call. After it, `lineMatches` has one production caller, search, by design (research D2).
- `read-back.ts` → `_note-lines.ts` is a new downward edge to a cohort leaf. T013 keeps that file's header honest. No `_note-lines.ts` code changes, so the patch_heading / patch_block suites are unaffected.
- `handler.ts` → `read-back.ts` is one-directional. `read-back.ts` types its deps as `InvokeCliDeps` from the cli-adapter rather than importing the handler's `ExecuteDeps`, so no cycle forms, not even a type-only one.

### Parallel Opportunities

- T004, T005, T006 and T007: four new files.
- T009, T010 and T013: different files.
- T016/T017 can run alongside T015.
- T018 can run alongside the US2 and US3 phases.

---

## Parallel Example: User Story 1

```text
# After T003, write the fixture and the three new test files together:
Task: "T004 context_search/_handler-fixtures.ts readBackResponse / readBackAnswer"
Task: "T005 context_search/_template.test.ts T1–T9"
Task: "T006 context_search/read-back.test.ts R1–R16"
Task: "T007 context_search/handler.whitespace.test.ts H20–H35"

# After T008, build the leaves together:
Task: "T009 context_search/_template.ts JS_TEMPLATE"
Task: "T010 context_search/schema.ts contextSearchReadBackSchema"
Task: "T013 _note-lines.ts header comment"
```

---

## Implementation Strategy

### MVP first (User Story 1)

T001 → T002–T003 → T004–T014. context_search then returns untrimmed lines, and every existing suite is green under the approved edits. Stop and validate with H20–H22 and T014.

### Incremental delivery

1. Foundational: the selection split, with search unchanged.
2. US1, the MVP: the read-back, so indentation is kept.
3. US2: bite-check the trailing-whitespace and CRLF rules.
4. US3: help page.
5. Polish: CHANGELOG, the full gate with the red check, the surface gate, structural verification, and the required live check (T022).

---

## Notes

- The only existing-test edits are contract §E, applied in T014 under the owner's conditional approvals (2026-11-02: option A, and the second ruling after F10). Any other existing-test failure stops the work for owner review.
- Do not regenerate `_register-baseline.json`. If the FR-018 gate fails, the published surface changed, which is a defect against FR-010.
- Never send an eval above the F10 budget to the real CLI. A `code=` value at or over about 5,000 characters fails silently, and a much larger one broke the CLI until Obsidian was restarted.
- Commit after each phase. The PR lifecycle continues with `/speckit-git-commit`, a PR, `/code-review` and `/speckit-docs-as-code <n>`.
