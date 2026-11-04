---

description: "Task list for 093-verify-non-ascii-handling"
---

# Tasks: Verify Non-ASCII Handling

**Input**: Design documents from `specs/093-verify-non-ascii-handling/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/non-ascii-check-contract.md](contracts/non-ascii-check-contract.md), [quickstart.md](quickstart.md)

**Tests**: Requested. The spec's deliverable is the checks themselves (FR-009 to FR-012). The plan's Principle II row commits the module to its contract §T unit rows in the same change. Every story writes its §T rows first and confirms they fail before the classifier exists.

**Organization**: one phase per user story. US1 to US5 each add one or two scenarios (contract §S) to the shared scenario table. US6 (repeatable checks) owns the cross-cutting guarantees: independent outcomes, retry, the live run and its evidence.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story the task belongs to (US1 to US6)

## Path Conventions

- `src/tools/_non-ascii-checks.ts`: the pure module (research D2). It imports `zod` only and has **no relative imports**, so the script can import it with a `.ts` specifier.
- `src/tools/_non-ascii-checks.test.ts`: its co-located vitest suite (contract §T).
- `scripts/check-non-ascii.ts`: the thin script (contract §C, §W). It holds the I/O only.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: wire the command and keep the module out of `dist/`.

- [X] T001 [P] Add `"check:non-ascii": "node scripts/check-non-ascii.ts"` to the `scripts` block of `package.json`, next to `probe:stdio` (contract §C).
- [X] T002 [P] Add `"src/tools/_non-ascii-checks.ts"` to the `exclude` list of `tsconfig.build.json`, after `"src/tools/_description-audit.ts"` (refactor-decisions item 30).
- [X] T003 Create `src/tools/_non-ascii-checks.ts` with the header `// Original — no upstream. Non-ASCII release checks (spec 093): fixture set, scenario table, tool-result parsing, PASS / FAIL / BLOCKED classifiers, retry helper, report renderer and exit-status rule for scripts/check-non-ascii.ts; pure, zod only, no relative imports.` The module uses erasable TypeScript syntax only (no `enum`, `namespace`, parameter properties, or `import = require`), because Node loads it by type stripping when the script imports it. Export the types from data-model:
  - `RunArgs` (E1: `testVault`, `semanticVault`, `stagedNote?`);
  - `CheckContext` (E6: `fixturesVisible`, `outsideSeenByP1`, `semanticVaultListed`, `stagedNoteOnDisk`, `missingNoteAbsent`);
  - `Outcome` (E7: `{status: "PASS" | "FAIL" | "BLOCKED", id, capability, tool, input, expected?, actual?, precondition?}`);
  - `Scenario` (E4: `id`, `capability`, `tool`, `vaultRole: "test" | "semantic"`, `input(fixtures)`, `expected`, `classify(result, context)`, `retry`);
  - an empty exported `SCENARIOS: Scenario[]`, which the stories fill in contract §S order.
- [X] T004 Create `src/tools/_non-ascii-checks.test.ts` with the header `// Original — no upstream. Unit rows for the non-ASCII release checks (spec 093 contract §T).` and a `describe` per contract §T group. It imports from `./_non-ascii-checks.js`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the module core and the script skeleton every scenario runs through.

**⚠️ CRITICAL**: no story's scenario can run until this phase is complete.

### Tests (write first, confirm they fail)

- [X] T005 [P] Write rows T-FX1 and T-FX2 in `src/tools/_non-ascii-checks.test.ts`.
  - **T-FX1**: every E2 fixture string satisfies `s === s.normalize("NFC")`. Every name segment of `folder`, `source`, `target`, `missingFolder` and the E3 `missingNote` contains a character above U+007F. The heading list includes U+2014 and a non-BMP character (🚀 U+1F680 or 🎉 U+1F389). The outside note's path (the readiness probe) contains no character above U+007F.
  - **T-FX2**: the source text, split on `\n`, puts `Order café42 arrived.` on line 3 and `See [[Résumé 東京]].` on line 7.
- [X] T006 [P] Write row T-SHAPE in `src/tools/_non-ascii-checks.test.ts` for `parseToolResult` (data-model E5):
  - a success with `structuredContent` → its payload;
  - a success with only text content → `JSON.parse(content[0].text)`;
  - `isError: true` with `{code, message, details}` text → an error payload;
  - anything else (no content, non-JSON text, a non-object payload) → `unexpected`.
- [X] T007 [P] Write rows T-R and T-EXIT in `src/tools/_non-ascii-checks.test.ts` for `renderReport` and `exitStatus` (contract §R, §C, data-model E8).
  - **T-R**: one block per outcome, in input order. Status words are padded to 7 characters. A FAIL block carries `input:`, `expected:` and `actual:`; a BLOCKED block carries `precondition:`. Non-ASCII characters print unescaped (`JSON.stringify` output). The `cleanup: removed …` and `cleanup: RESIDUE <path>` lines render correctly. The summary line is `summary: <n> pass · <n> fail · <n> blocked`, with counts summing to the number of outcomes.
  - **T-EXIT**: 0 for only PASS and BLOCKED with clean cleanup; 1 for any FAIL; 1 for residue.
- [X] T008 [P] Write row T-ARGS in `src/tools/_non-ascii-checks.test.ts` for `validateArgs`:
  - a missing `--test-vault` or `--semantic-vault` → a usage error;
  - equal vault names → the usage error `vault names must differ`;
  - an absent `--staged-note` → valid, with `stagedNote` undefined.

### Implementation

- [X] T009 Implement `parseToolResult(raw: unknown)` in `src/tools/_non-ascii-checks.ts` with zod schemas, per data-model E5:
  - success → `{kind: "ok", payload}`, where the payload is `structuredContent` when present, else `JSON.parse(content[0].text)`;
  - `isError: true` → `{kind: "error", payload: {code, message, details}}`;
  - otherwise → `{kind: "unexpected", raw}`.

  A JSON parse failure is `unexpected`, never thrown. Makes T006 pass.
- [X] T010 Implement `buildFixtures(runFolder: string)` and `missingNotePath(hex8: string)` in `src/tools/_non-ascii-checks.ts`. Use the exact data-model E2 and E3 strings as NFC literals, `\n`-joined with a trailing `\n`:
  - `folder` = `<run>/日本語フォルダ`;
  - `source` = `<run>/日本語フォルダ/Café 日記.md`;
  - `target` = `<run>/Résumé 東京.md` (`Target note.`);
  - `outside` = `<run>/outside.md` (`Price café77 noted.`);
  - `missingFolder` = `<run>/存在しないフォルダ`;
  - `missingNote` = `_non-ascii-check/存在しない ノート café — <8 hex>.md`.

  Also export the expectation constants `EXPECTED_HEADINGS`, `LINK_TARGET = "Résumé 東京"`, `PATTERN = "café\\d+"`, `SOURCE_MATCH` and `OUTSIDE_MATCH`. Makes T005 pass.
- [X] T011 Implement `renderReport(header, outcomes, cleanup)` and `exitStatus(outcomes, cleanup)` in `src/tools/_non-ascii-checks.ts`, per contract §R and §C. Makes T007 pass.
- [X] T012 Implement `validateArgs(values)` in `src/tools/_non-ascii-checks.ts`, per data-model E1. It returns `RunArgs` or `{usageError: string}`, plus the `USAGE` text. Makes T008 pass.
- [X] T013 Create `scripts/check-non-ascii.ts` with the header `// Original — no upstream. npm run check:non-ascii (spec 093): drives the built server over stdio against a test vault and a read-only semantic vault and prints one PASS / FAIL / BLOCKED block per non-ASCII scenario. Run npm run build first.`, plus usage examples, as in `scripts/probe-stdio.ts`. It imports from `../src/tools/_non-ascii-checks.ts`.
  - `parseArgs` the three flags, then `validateArgs`. On a usage error, print `USAGE` to stderr and exit 2.
  - Connect a `Client` with the 2025-era handshake and `capabilities: {}`, over `StdioClientTransport` to `dist/index.js` with `stderr: "inherit"`. A connect failure exits 2.
  - Call `vaults` and resolve T's and V's folder from `path`.
  - Print the header with the date, the `package.json` version, `git rev-parse --short HEAD`, `client.getServerVersion()` and the three arguments.
- [X] T014 Implement fixture seeding and cleanup in `scripts/check-non-ascii.ts`, per contract §W 1–3 and 5:
  1. `realpath(<T root>/Sandbox)` must exist; otherwise exit 2 and never create it.
  2. The run folder is `Sandbox/non-ascii-check-<YYYYMMDD-HHMMSS>-<4 hex>`.
  3. Before each `mkdir` and `writeFile`, the realpath of the target's nearest existing ancestor must be inside the Sandbox realpath; otherwise abort with exit 2 before writing.
  4. Write the E2 files with `writeFile(…, "utf8")`.
  5. In a `finally`, run `rm(runFolder, {recursive: true})`, then `stat` it. Absent → `cleanup: removed <rel>`; present → `RESIDUE <rel>`.

  Set `context.testVaultListed` from the `vaults` result. A failing `vaults` call sets both `testVaultListed` and `semanticVaultListed` to false. If `testVaultListed` is false, seed nothing and skip the readiness wait, and every test-vault scenario is `BLOCKED` with `test vault <T> not listed by vaults` or `vaults call failed: <message>`.
- [X] T015 Implement the readiness wait in `scripts/check-non-ascii.ts` (research D4). Poll `read {target_mode:"specific", vault:T, path:outside}` every `RETRY_INTERVAL_MS` until its `content` equals the seeded outside text (`"Price café77 noted.\n"`), or `DEADLINE_MS` passes. The probe path must stay all-ASCII (research D4, analyze C1). Set `context.fixturesVisible` accordingly. Export the constants `RETRY_INTERVAL_MS = 500` and `DEADLINE_MS = 30000` from the module.
- [X] T016 [P] Write row T-RETRY in `src/tools/_non-ascii-checks.test.ts` (contract §T). Inject `sleep` and `now` (a simulated clock):
  - a classifier that passes on the 3rd attempt → PASS after 2 sleeps of `RETRY_INTERVAL_MS`;
  - one that never passes → the last attempt's FAIL once `DEADLINE_MS` has elapsed;
  - an attempt that throws → `outcomeFromError` gives FAIL whose `actual` is the error message, and a following scenario still produces its own outcome.
- [X] T017 Implement `retryUntilPass(attempt, {intervalMs, deadlineMs, sleep, now})` and `outcomeFromError(scenario, input, err)` in `src/tools/_non-ascii-checks.ts`. Makes T016 pass. T018 uses both. These carry US6's bounded-retry and independent-outcome guarantees (FR-010) and sit here because the scenario loop needs them (analyze O1).
- [X] T018 Implement the scenario loop in `scripts/check-non-ascii.ts`, using `retryUntilPass` and `outcomeFromError` from the module (T017). For each `SCENARIOS` entry in order:
  - if its precondition in the context is unmet, record `BLOCKED` without a call;
  - otherwise call `client.callTool({name: tool, arguments: input(fixtures)})`, parse the result with `parseToolResult`, and classify it with retries for `retry: true`;
  - catch any thrown error into that scenario's `FAIL`.

  After P1 is classified, set `context.outsideSeenByP1` with `outsideSeen(P1 result)`. Finally render with `renderReport`, write the report to stdout, close the client, and `process.exit(exitStatus(…))`.

**Checkpoint**: `npm test` is green for T005 to T008 and T016. `npm run check:non-ascii` prints the header, an empty scenario list, the cleanup line and `summary: 0 pass · 0 fail · 0 blocked`.

---

## Phase 3: User Story 1 — List the headings of a non-ASCII note (Priority: P1) 🎯 MVP

**Goal**: scenario H1 (contract §S, FR-001).

**Independent Test**: T-H is green, and a live run shows `PASS H1` (or a `FAIL` block naming input, expected and actual).

- [X] T019 [P] [US1] Write row T-H in `src/tools/_non-ascii-checks.test.ts`:
  - the exact `EXPECTED_HEADINGS` as `outline` output (`{count, headings:[{level, text, line}]}`) → PASS;
  - one heading's text in NFD (`text.normalize("NFD")`) → FAIL;
  - an extra heading → FAIL; a missing heading → FAIL; a level mismatch → FAIL;
  - any error payload → FAIL;
  - `fixturesVisible: false` → BLOCKED with `fixtures not visible to Obsidian`; `testVaultListed: false` → BLOCKED with `test vault <T> not listed by vaults`, checked before `fixturesVisible`. Rows T-L, T-F1/T-F2 and T-P get the same check through the same helper: one precondition function shared by the test-vault scenarios, written in T020.
- [X] T020 [US1] Add scenario H1 to `SCENARIOS` in `src/tools/_non-ascii-checks.ts`:
  - `tool: "outline"`, input `{target_mode:"specific", vault:T, path:fixtures.source}`;
  - PASS when `headings.map(h => [h.level, h.text])` equals `EXPECTED_HEADINGS` element-wise with `===`, with the same length and order (research D9);
  - FAIL otherwise; BLOCKED when `!fixturesVisible`; `retry: true`.

  Makes T019 pass.

**Checkpoint**: the MVP. One end-to-end non-ASCII guarantee is runnable.

---

## Phase 4: User Story 2 — List the links of a non-ASCII note (Priority: P1)

**Goal**: scenario L1 (FR-002).

**Independent Test**: T-L is green, and a live run shows the L1 block.

- [X] T021 [P] [US2] Write row T-L in `src/tools/_non-ascii-checks.test.ts`:
  - `links` output with an entry `target: "Résumé 東京"` → PASS;
  - the target missing → FAIL;
  - the error payload `{code:"CLI_REPORTED_ERROR", details:{code:"FILE_NOT_FOUND", …}}` → FAIL;
  - `fixturesVisible: false` → BLOCKED.
- [X] T022 [US2] Add scenario L1 to `SCENARIOS` in `src/tools/_non-ascii-checks.ts`:
  - `tool: "links"`, input `{target_mode:"specific", vault:T, path:fixtures.source}`;
  - PASS when some `links[i].target === LINK_TARGET`; FAIL otherwise; BLOCKED when `!fixturesVisible`; `retry: true`.

  Makes T021 pass.

---

## Phase 5: User Story 3 — List a non-ASCII folder (Priority: P1)

**Goal**: scenarios F1 and F2 (FR-003, FR-004).

**Independent Test**: T-F1 and T-F2 are green, and a live run shows both blocks.

- [X] T023 [P] [US3] Write rows T-F1 and T-F2 in `src/tools/_non-ascii-checks.test.ts`.
  - **T-F1**: `paths` output exactly `[source]` → PASS; `[]` → FAIL; `[source, other]` → FAIL.
  - **T-F2**: the error `{code:"CLI_REPORTED_ERROR", details:{stage:"envelope-error", code:"FOLDER_NOT_FOUND", folder: missingFolder}}` → PASS. An empty success `{count:0, paths:[]}` → FAIL. `FOLDER_NOT_FOUND` with `folder` in a different form (an NFD or mojibake string) → FAIL. `NOT_A_FOLDER` → FAIL.
  - Both: `fixturesVisible: false` → BLOCKED.
- [X] T024 [US3] Add scenarios F1 and F2 to `SCENARIOS` in `src/tools/_non-ascii-checks.ts`, both `tool: "paths"` with `retry: true`.
  - **F1**: input `{target_mode:"specific", vault:T, folder:fixtures.folder}`. PASS when `paths` equals `[fixtures.source]` exactly.
  - **F2**: input `{target_mode:"specific", vault:T, folder:fixtures.missingFolder}`. PASS when the result is an error with `code === "CLI_REPORTED_ERROR"`, `details.code === "FOLDER_NOT_FOUND"` and `details.folder === fixtures.missingFolder`.

  Makes T023 pass.

---

## Phase 6: User Story 4 — Search with a non-ASCII pattern (Priority: P1)

**Goal**: scenarios P1 and P2 (FR-005, FR-006), with the `outsideSeenByP1` gate (research D4).

**Independent Test**: T-P is green, and a live run shows both blocks, with P2 never passing when the outside note was not yet visible.

- [X] T025 [P] [US4] Write row T-P in `src/tools/_non-ascii-checks.test.ts`.
  - **P1**: `matches` containing `SOURCE_MATCH` exactly (`path`, `line: 3`, `match: "café42"`, `text: "Order café42 arrived."`) → PASS. Zero matches → FAIL. A `text` mismatch → FAIL.
  - **P2**: only inside-folder matches including `SOURCE_MATCH` → PASS. `OUTSIDE_MATCH` present → FAIL. A path outside `folder + "/"` → FAIL. The source match missing → FAIL. `outsideSeenByP1: false` → BLOCKED with `outside note not seen by the vault-wide search (P1)`.
  - `outsideSeen(result)` returns true only when `OUTSIDE_MATCH` is among the matches.
- [X] T026 [US4] Add scenarios P1 and P2 and the helper `outsideSeen` to `src/tools/_non-ascii-checks.ts`. Both scenarios are `tool: "pattern_search"` with `retry: true`.
  - **P1**: input `{vault:T, pattern:PATTERN, limit:10000}`. PASS when a match deep-equals `SOURCE_MATCH` on `path`, `line`, `match` and `text`. BLOCKED when `!fixturesVisible`.
  - **P2**: input `{vault:T, pattern:PATTERN, folder:fixtures.folder, limit:10000}`. PASS when `SOURCE_MATCH` is present and every `path` starts with `fixtures.folder + "/"`. BLOCKED when `!fixturesVisible` or `!outsideSeenByP1`.

  Makes T025 pass. The script's P1-then-P2 context hand-off is already in T018.

---

## Phase 7: User Story 5 — Find notes similar to a non-ASCII note (Priority: P2)

**Goal**: scenarios S1 and S2 (FR-007, FR-008, FR-016 to FR-019), read-only in the semantic vault (research D5, D6; contract §W 4).

**Independent Test**: T-S1 and T-S2 are green. A live run without `--staged-note` shows `BLOCKED S1` with `no staged note path given`, and S2 is PASS or FAIL when Smart Connections is loaded (SC-007).

- [X] T027 [P] [US5] Write row T-S1 in `src/tools/_non-ascii-checks.test.ts`.
  - Each BLOCKED precondition, in contract §S order, with its exact text:
    1. `no staged note path given`;
    2. `staged note path has no non-ASCII character`;
    3. `semantic vault <V> not listed by vaults`;
    4. `staged note not found on disk at <V root>/<path>`;
    5. `Smart Connections not installed (SMART_CONNECTIONS_NOT_INSTALLED)`;
    6. `Smart Connections not ready (SMART_CONNECTIONS_NOT_READY)`;
    7. `staged note not indexed by Smart Connections (SOURCE_NOT_INDEXED)`.
  - `FILE_NOT_FOUND` with `stagedNoteOnDisk: true` → FAIL.
  - The staged path among `matches[].path` → FAIL. `count: 0` → FAIL.
  - A clean success with `count ≥ 1` → PASS.
- [X] T028 [P] [US5] Write row T-S2 in `src/tools/_non-ascii-checks.test.ts`:
  - an error with `details.code === "FILE_NOT_FOUND"` and `details.detail === "path: " + missingNote` → PASS;
  - the same with a different `detail` → FAIL;
  - `SMART_CONNECTIONS_NOT_INSTALLED` → BLOCKED; `SMART_CONNECTIONS_NOT_READY` → BLOCKED;
  - `missingNoteAbsent: false` → BLOCKED;
  - a success → FAIL.
- [X] T029 [US5] Add scenarios S1 and S2 and the helper `hasNonAscii(s)` (some code point above U+007F) to `src/tools/_non-ascii-checks.ts`. Both are `tool: "smart_connections_similar"`, `vaultRole: "semantic"`, `retry: false`.
  - **S1**: input `{target_mode:"specific", vault:V, path:stagedNote, limit:20}`, with preconditions and classification exactly per T027.
  - **S2**: input `{target_mode:"specific", vault:V, path:missingNote, limit:1}`, classified per T028.

  Makes T027 and T028 pass.
- [X] T030 [US5] Add the semantic-vault facts to `scripts/check-non-ascii.ts`. Set `context.semanticVaultListed` from the `vaults` result. When the staged note was given, set `context.stagedNoteOnDisk` from `fs.stat(<V root>/<stagedNote>)`. Set `context.missingNoteAbsent` from `fs.stat(<V root>/<missingNote>)`, with `missingNote` built from 8 random hex characters.
  - These two `stat` calls and the S1/S2 `callTool`s are the **only** operations touching V. Nothing opens a V path for writing, and no write, rename, move or delete tool is ever called with `vault: V` (contract §W 4, FR-017).
  - Add a code comment stating this invariant above the V block.

---

## Phase 8: User Story 6 — Repeatable checks (Priority: P1)

**Goal**: independent outcomes, bounded retry, failure reports that stand alone, clean vaults, and one recorded live run (FR-009 to FR-013, FR-020, FR-021, SC-002 to SC-005, SC-007, SC-008).

**Independent Test**: T-RETRY (written in Phase 2, T016–T017) is green, quickstart §1 and §2 pass, and the quickstart §4 run is recorded.

- [X] T031 [US6] Run the quickstart §1 in-process gate (`npm run lint`, `typecheck`, `test`, `build`) through PowerShell. Confirm:
  - every §T row is green and the statements floor holds;
  - `git diff --exit-code src/tools/_register-baseline.json` is clean (SC-006);
  - `dist/tools/_non-ascii-checks.js` is absent (`ls dist/tools`).
- [X] T032 [US6] Run the quickstart §2 usage-error cases. Both exit 2 with a usage line on stderr, nothing on stdout, and no write. This is also the load check for U1: a syntax error from type stripping would surface here as a `SyntaxError`, not a usage line.
- [X] T033 [US6] Live run, following `.memory/test-execution-instructions.md` first (quickstart §3 and §4).
  - Confirm Obsidian answers `Obsidian.com eval "code=app.vault.getName()"`.
  - Record the `Sandbox/` pre-state of `TestVault-Obsidian-CLI-MCP`. Record the semantic-vault pre-state: the name, size and last-write time of every `*.md` file in the staged note's folder of `My-Setup-Vault` (read-only listing; `.smart-env/` and `.obsidian/` excluded, quickstart §4).
  - Run `npm run check:non-ascii -- --test-vault TestVault-Obsidian-CLI-MCP --semantic-vault My-Setup-Vault [--staged-note "<owner's path>"]` and save stdout to `specs/093-verify-non-ascii-handling/run-<YYYY-MM-DD>.txt`.
  - If the owner has not given a staged path, run without it: S1 must be `BLOCKED` (quickstart §5).
  - Verify that `Sandbox/` equals its pre-state, the cleanup line says `removed`, the semantic-vault listing is identical and `_non-ascii-check/` does not exist there (SC-004), and S2 is not `BLOCKED` when Smart Connections is loaded (SC-007).
  - Quote any FAIL block verbatim in the report to the owner, as the basis for one follow-up item each (FR-015). Fix nothing here.
- [X] T034 [US6] Post-implement structural verification (CLAUDE.md, quickstart §7). Run `codegraph sync`, then `codegraph_explore "_non-ascii-checks parseToolResult renderReport retryUntilPass SCENARIOS check-non-ascii"`, and confirm:
  1. no new error code or class, and no `UpstreamError` construction;
  2. no file imports `createLogger` or `createQueue`;
  3. the module has no relative import and no importer under `src/` except its test;
  4. the script is the module's production caller.

  Record the results, and the plan's "no kernel node touched" claim, in `specs/093-verify-non-ascii-handling/post-implement.md`.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T035 Re-read `scripts/check-non-ascii.ts` and `src/tools/_non-ascii-checks.ts` against `.memory/refactor-decisions.md`'s standing rules:
  - item 30: the build exclude;
  - item 64: do not re-roll `runVitestDump`, `listPublished` or `fingerprintTool`. None of them is needed here.

  Then run `npm run format:check` and fix only the new files.

`CONTRIBUTING.md` and `.docs-as-code/` are updated by `/speckit-docs-as-code <n>` after review, per plan §X and CLAUDE.md. They are not tasks here.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001–T004)**: none. T001 and T002 run in parallel; T004 follows T003.
- **Foundational (T005–T018)**: after Setup. The tests (T005–T008) are parallel. T009–T012 each follow their test. T016 → T017 (the retry helper) can run beside them. The script tasks run T013 → T014 → T015 → T018, and T018 also needs T017.
- **US1 to US5 (T019–T030)**: after Foundational. Each story's test precedes its scenario task. Stories are independent of each other except for these hand-offs:
  - P2's gate reads P1's result (T026 relies on T018's context hand-off);
  - US5's script facts (T030) follow T029.
- **US6**:
  - T031 needs every scenario (T020–T029).
  - T032 needs T013.
  - T033 needs T031 and T030.
  - T034 follows T033.
- **Polish (T035)**: last.

### Structural dependencies (CodeGraph)

`codegraph_explore` on the precedent (`scripts/probe-stdio.ts`, `scripts/_vitest-dump.ts`) and the plan-time queries show no existing call path between the files these tasks touch. The new module has no relative imports, and the script reaches the server only as a `dist/index.js` child process. The only cross-file edges are new ones: test → module, and script → module. They are already reflected above, in T018's dependency on T017 and the scenario tasks. No extra task-dependency note is needed.

### Parallel opportunities

- T001 ∥ T002.
- T005 ∥ T006 ∥ T007 ∥ T008 ∥ T016, all in one test file, as separate `describe` blocks written in one pass.
- Story test rows T019, T021, T023, T025, T027 and T028 can be written together.
- Scenario tasks T020, T022, T024, T026 and T029 touch the same `SCENARIOS` array, so run them in sequence.

## Parallel Example: Foundational tests

```text
Task: "Write rows T-FX1 and T-FX2 in src/tools/_non-ascii-checks.test.ts"
Task: "Write row T-SHAPE in src/tools/_non-ascii-checks.test.ts"
Task: "Write rows T-R and T-EXIT in src/tools/_non-ascii-checks.test.ts"
Task: "Write row T-ARGS in src/tools/_non-ascii-checks.test.ts"
```

## Implementation Strategy

### MVP first (US1)

1. Setup, then Foundational (including the retry helper T016–T017 that T018 needs).
2. US1 (H1). Validate with T-H, plus one live run against the test vault: `--semantic-vault My-Setup-Vault`, without a staged note.
3. Stop and check the H1 block's shape before adding more scenarios.

### Incremental delivery

US2 → US3 → US4 → US5: each adds scenarios to the table, and each is green in unit rows before the next. US6 closes with the gates, the live run and the structural check.

## Notes

- Every comparison is exact `===` (research D9). No normalising helper may be added "for robustness".
- The script never writes outside `Sandbox/` in the test vault and never writes to the semantic vault (contract §W). Any change that weakens either invariant is out of scope.
- The live run follows `.memory/test-execution-instructions.md`. It touches only the two named vaults, and its output file is the SC-005 evidence.
- Failures found by the live run are not fixed in this item (FR-015).
