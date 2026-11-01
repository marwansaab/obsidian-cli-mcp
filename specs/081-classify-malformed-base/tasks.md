---

description: "Task list for 081-classify-malformed-base"
---

# Tasks: Classify Malformed Base

**Input**: Design documents from `specs/081-classify-malformed-base/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/views_base-malformed-contract.md](contracts/views_base-malformed-contract.md), [quickstart.md](quickstart.md)

**Tests**: required. Constitution Principle II says every changed tool surface ships happy-path and failure/boundary tests in the same change, as co-located `*.test.ts` only. Within each story, write the tests first and confirm they fail before implementing.

**Organization**: tasks are grouped by user story (spec.md US1–US4). Every task that writes code starts by loading the `karpathy-guidelines` skill (user CLAUDE.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 from spec.md
- Contract IDs (R1–R5, M1–M16) refer to [contracts/views_base-malformed-contract.md](contracts/views_base-malformed-contract.md). Invariants (V1–V8) refer to [data-model.md](data-model.md).

---

## Phase 1: Setup (T0 live probes)

**Purpose**: capture what `base:views` actually prints for a malformed `.base` before any code is written (research D7, F7). Read `.memory/test-execution-instructions.md` first:

- use vault `TestVault-Obsidian-CLI-MCP` only, with fixtures under `Sandbox/` only;
- drive `Obsidian.com` (bare `obsidian`), never `Obsidian.exe`;
- capture stdout and stderr separately (`Start-Process … -RedirectStandardOutput/-RedirectStandardError`);
- never touch `Welcome.md`;
- clean up every fixture afterwards.

- [X] T001 Run T0 probes P1–P4 from quickstart.md §3, using the unique-per-run fixtures `Sandbox/t0-081-<ts>-broken.base` (an unclosed flow sequence, e.g. `views:\n  - type: table\n    name: [a, b\n`) and `Sandbox/t0-081-<ts>-ok.base` (one valid table view). Record the exit code and the verbatim stdout and stderr of each probe in a new `specs/081-classify-malformed-base/contracts/t0-probe-findings.md`:
  - **P1**: the named-mode focus eval on the broken fixture;
  - **P2**: `base:views` with the broken fixture focused;
  - **P3**: open-mode `base:views`, with the broken fixture focused in Obsidian and no prior focus eval;
  - **P4**: `base:views` on the control fixture.

  For P2 and P3, test the complaint against the current `invalid-yaml` regex in `src/tools/query_base/handler.ts:126`, and record match or no match. Delete both fixtures afterwards and confirm `Sandbox/` is empty.
- [X] T002 Apply the T0 gate (research D7) and record the outcome at the end of `contracts/t0-probe-findings.md`:
  - **No complaint at all** in P2 or P3, for example a materialised default view for the broken file, or open mode reporting only `Active file is not a base file`: **STOP and escalate to the owner**. Do not start Phase 2, because the spec premise or FR-002 cannot be met from the output (plan.md Spec alignment note).
  - **A complaint the regex does not match**: record the verbatim phrase, then **STOP and escalate to the owner**. Do not add it to the pattern. The pattern is shared with `query_base`, and widening it would change `query_base`, which BI-0137 §Out of scope excludes (research D7; spec Assumptions).
  - **The complaint arrives on a channel the contract does not cover** (other than stdout/stderr on a reported failure, non-zero exit or clean exit): record it, then **STOP and escalate**. Contract §1 R2/R3 is not changed without the owner.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the shared YAML-complaint pattern, which both tools import. `query_base` behaviour stays byte-identical.

**⚠️ CRITICAL**: no user-story work starts until T003 is complete. Both `views_base/handler.ts` (Phase 3+) and `query_base/handler.ts` (T005) import the new constant. This is a structural dependency confirmed by `codegraph_explore`: the two handlers share no other edge besides `stdoutDetails` (`src/tools/_eval-parse.ts`).

- [X] T003 Create `src/tools/_base-malformed.ts` with the header `// Original — no upstream. Shared Bases-family recognition of a YAML parser complaint about a .base file (spec 081 FR-011): the invalid-yaml pattern query_base and views_base both classify as BASE_MALFORMED / invalid-yaml.` Export `INVALID_YAML_PATTERN`, a `RegExp` with exactly the source and flags of the current literal at `src/tools/query_base/handler.ts:126`:

  ```
  /\b(yaml(?:exception)?|yaml\s+parse|invalid\s+yaml|unexpected\s+token\s+at\s+line|sufficiently\s+indented|flow\s+(?:sequence|mapping)|block\s+(?:mapping|collection|sequence)|(?:bad|deficient)\s+indentation|duplicated\s+mapping\s+key|could\s+not\s+find\s+expected|mapping\s+values\s+are\s+not\s+allowed|tab\s+characters\s+must\s+not\s+be\s+used)\b/i
  ```

  Add no phrase: the constant is a byte-identical move, so `query_base` behaviour cannot change. Move the BI-057 provenance comment (`query_base/handler.ts:118-123`) onto the constant. Do **not** add the `missing-required-key` or `unsupported-schema-version` patterns (FR-015, research D1 (c)). Do not use the `g` flag: the constant is shared and `.test` must stay stateless.
- [X] T004 [P] Create `src/tools/_base-malformed.test.ts` with an `// Original — no upstream.` header. Cover:
  - **Matches**: the BI-057 phrase `Flow sequence in block collection must be sufficiently indented and end with a ]`; `YAMLException: bad indentation of a mapping entry`; `duplicated mapping key`. Also assert `INVALID_YAML_PATTERN.source` and `.flags` equal the original literal's, so the move is pinned as byte-identical.
  - **No match**: `No views defined`, `missing required key: views`, `Active file is not a base file`, `All\ttable` and `Error: something unrelated`. A view name containing `yaml` does match, because `yaml` is a match token. That is why `views_base` leaves view lines out of the scan (T007, M9), not why it gets a negative case here.
  - **No state**: two consecutive `.test` calls on the same matching input both return `true`.
- [X] T005 [P] In `src/tools/query_base/handler.ts`, replace the inline regex literal of the `invalid-yaml` `CLASSIFIER_PATTERNS` entry with `INVALID_YAML_PATTERN`, imported from `../_base-malformed.js`. Keep the entry's position and its `classify`, and replace the moved provenance comment with a one-line pointer to the shared constant. Add to the file's intent header that the invalid-yaml pattern is shared with `views_base` (spec 081). Change nothing else. Then run `npx vitest run src/tools/query_base` and confirm every existing test passes unchanged.

**Checkpoint**: `_base-malformed.test.ts` and the whole `query_base` suite are green.

---

## Phase 3: User Story 1 - Malformed named Base is classified (Priority: P1) 🎯 MVP

**Goal**: a named `.base` whose YAML Obsidian cannot parse fails with `CLI_REPORTED_ERROR` / `details.code: "BASE_MALFORMED"` / `details.reason: "invalid-yaml"`, carrying `base_path`, on either channel, whether the report arrives as a failure or on a clean exit (FR-001, FR-003, FR-004, FR-010).

**Independent Test**: contract cases M1, M2, M3, M15 and M12 in `src/tools/views_base/handler.test.ts`.

### Tests for User Story 1 ⚠️

Write these first, using the file's existing `makeDeps` / `evalOk` / `expectErr` helpers, and confirm they FAIL before T007.

- [X] T006 [US1] Add to `src/tools/views_base/handler.test.ts`:
  - **M1**: named `Broken.base`; focus `evalOk("Broken.base")`; `base:views` → `{ stdout: "Error: Flow sequence in block collection must be sufficiently indented and end with a ] at line 3, column 5:\n    - [a, b\n    ^", exitCode: 0 }`. Expect `code === "CLI_REPORTED_ERROR"`, `details.code === "BASE_MALFORMED"`, `details.reason === "invalid-yaml"` and `details.base_path === "Broken.base"`. Expect `message` to be exactly `views_base: base file at "Broken.base" is malformed: its YAML cannot be parsed`.
  - **M2**: as M1, but `base:views` exits non-zero with the complaint on stderr and empty stdout (the stub's non-zero exit path produces `CLI_NON_ZERO_EXIT`). Expect M1's `details.code`, `reason` and `base_path`.
  - **M3**: as M1, but `base:views` exits 0 with empty stdout and the complaint on **stderr**. Expect M1's shape, and `cause === null`.
  - **M15**: named; focus `evalOk("Broken.base")`; `base:views` → `{ stdout: "YAMLException: bad indentation of a mapping entry (3:5)\n", stderr: "", exitCode: 0 }`. There is no `Error:` prefix, so dispatch resolves it as a success and only the clean-exit stdout scan (R3) can catch it. Expect M1's `details.code`, `reason`, `base_path` and headline, and `cause === null` (FR-010).
  - **M12**: named; `base:views` → `{ stdout: "Error: something unrelated", exitCode: 0 }`. Expect the rejection to be the dispatch layer's `CLI_REPORTED_ERROR` with **no** `details.code` (rethrown unchanged, V7, FR-009).

### Implementation for User Story 1

- [X] T007 [US1] In `src/tools/views_base/handler.ts`, import `INVALID_YAML_PATTERN` from `../_base-malformed.js` and `stdoutDetails` from `../_eval-parse.js`. Then:
  - **Add `isViewLine(line)`**: true when `stripTypeLabel(line) !== line`, i.e. the trailing tab-delimited token is in `KNOWN_VIEW_TYPES`.
  - **Add `upstreamReport(stderr, stdout)`**: the trimmed stderr and trimmed stdout joined by `"\n"` when both are non-empty, otherwise whichever is non-empty, stderr first (the `query_base` `classifyAndThrow` composition).
  - **Add `reportDetails(report)`**: returns `{ message, messageLength }` from `stdoutDetails(report)`, renaming `stdout` → `message` and `stdoutLength` → `messageLength`. The text is ≤ 1,000 chars whole, otherwise head 500 + `"\n[… cut …]\n"` + tail 500 (FR-006).
  - **Change `listFocusedViews`'s signature** to take a handlers object `{ onInvalidYaml: (cause: unknown, report: string) => never; onNotABase: (cause: unknown, report: string) => never }`.
  - **Failure path (contract R2, R4)**: when `err instanceof UpstreamError` and `err.code` is `"CLI_REPORTED_ERROR"` or `"CLI_NON_ZERO_EXIT"`, compute `report = upstreamReport(stringDetail(err.details, "stderr"), stringDetail(err.details, "stdout"))`. If `INVALID_YAML_PATTERN.test(report)`, call `onInvalidYaml(err, report)`. Otherwise, only for `"CLI_REPORTED_ERROR"`, keep the existing `NOT_A_BASE_FILE_PATTERN` test on the combined stdout+stderr and call `onNotABase(err, report)` on a match. Otherwise rethrow `err` unchanged.
  - **Clean-exit path (contract R3, R4)**: compute `report = upstreamReport(cliResult.stderr, <stdout lines (CR-stripped, as parseViews does) that are non-empty and !isViewLine, joined by "\n">)`. If `INVALID_YAML_PATTERN.test(report)`, call `onInvalidYaml(null, report)`. Otherwise keep the existing `NOT_A_BASE_FILE_PATTERN` check on the combined output, now calling `onNotABase(null, report)`. Otherwise parse views as today.
  - **Named-mode `onInvalidYaml`**: throw `new UpstreamError({ code: "CLI_REPORTED_ERROR", cause, details: { code: "BASE_MALFORMED", reason: "invalid-yaml", base_path: input.base_path, ...reportDetails(report) }, message: \`views_base: base file at "${input.base_path}" is malformed: its YAML cannot be parsed\` })`.
  - **Named-mode and open-mode `onNotABase`**: keep today's throws for now (US2 and US3 finish them), adapted to the new two-argument signature.
- [X] T008 [US1] Run `npx vitest run src/tools/views_base`. M1, M2, M3, M15 and M12 pass, and every pre-existing `views_base` test still passes.

**Checkpoint**: named-mode malformed Bases are classified (the MVP).

---

## Phase 4: User Story 2 - Malformed open Base is classified the same way (Priority: P2)

**Goal**: in open-Base mode, a YAML complaint yields the same `BASE_MALFORMED` / `invalid-yaml`, with no `base_path`, and it wins over a simultaneous not-a-base report (FR-002, V2).

**Independent Test**: contract cases M4 and M5.

### Tests for User Story 2 ⚠️

- [X] T009 [US2] Add to `src/tools/views_base/handler.test.ts`, and confirm they fail before T010:
  - **M4**: open mode (`{}`), with `base:views` returning M1's output. Expect `details.code === "BASE_MALFORMED"`, `details.reason === "invalid-yaml"` and `"base_path" in details === false`. Expect `message` to be exactly `views_base: the open base file is malformed: its YAML cannot be parsed`.
  - **M5**: open mode, with `base:views` → `{ stdout: "Error: Active file is not a base file\nYAMLException: bad indentation of a mapping entry (3:5)", exitCode: 0 }`. Expect `BASE_MALFORMED` / `invalid-yaml`, not `BASE_NOT_FOUND` / `not-open`.

### Implementation for User Story 2

- [X] T010 [US2] In `src/tools/views_base/handler.ts`, add the open-mode `onInvalidYaml`: throw `new UpstreamError({ code: "CLI_REPORTED_ERROR", cause, details: { code: "BASE_MALFORMED", reason: "invalid-yaml", ...reportDetails(report) }, message: "views_base: the open base file is malformed: its YAML cannot be parsed" })`. The open-mode `onNotABase` stays `BASE_NOT_FOUND` / `not-open` with today's details and message, and it ignores `report` (FR-007; contract §2). Run `npx vitest run src/tools/views_base`: M4 and M5 pass, and the existing not-open tests stay green.

**Checkpoint**: both modes classify a malformed Base identically.

---

## Phase 5: User Story 3 - Failures stay distinguishable without a new category (Priority: P2)

**Goal**: the closed reason set `invalid-yaml` | `unknown`, never absent (FR-014); no false malformed on view names, "no views defined" or the default view (FR-012, FR-015); the roster stays pairwise-distinct (FR-007, FR-008).

**Independent Test**: contract cases M6, M9, M10, M11, M13, M14 and M16.

### Tests for User Story 3 ⚠️

- [X] T011 [US3] In `src/tools/views_base/handler.test.ts`:
  - **M6**: extend the existing test `US3 malformed: post-focus 'not a base file' on a named Base → BASE_MALFORMED` (around line 276). Also expect `details.reason === "unknown"`, `details.message === "Error: Active file is not a base file: Broken.base"`, `details.messageLength === "Error: Active file is not a base file: Broken.base".length` (50), and `message` unchanged (`views_base: base file at "Broken.base" is structurally unusable`).
  - **M9**: open mode, with `base:views` → `{ stdout: "YAML notes\ttable\nBlock mapping\tcards\n", exitCode: 0 }`. Expect success `{ views: ["YAML notes", "Block mapping"], count: 2 }`.
  - **M10**: open mode, with `base:views` → `{ stdout: "Error: No views defined", exitCode: 0 }`. Expect a rejection whose `details.code` is **not** `"BASE_MALFORMED"` (the dispatch error is rethrown unchanged; FR-015).
  - **M11**: open mode, with `base:views` → `{ stdout: "Table\ttable\n", exitCode: 0 }`. Expect `{ views: ["Table"], count: 1 }`.
  - **M13**: collect four rejections: malformed (M1 setup), named-missing (the existing setup), not-open (the existing setup) and unknown vault (the existing `NoSuchVault` setup). Map each to the string `` `${code}|${details.code}|${details.reason}` `` and expect four distinct values.
  - **M14**: across every `BASE_MALFORMED` rejection in M1–M8 and M15, assert `["invalid-yaml", "unknown"]` contains `details.reason`.
  - **M16** (in `src/tools/views_base/index.test.ts`, next to the existing `deps wired through` test): call `makeTool().handler({ base_path: "Notes/x.md" })`. Expect `"isError" in result`. Parse `result.content[0].text`, then expect `code === "VALIDATION_ERROR"` and `details.issues[0].message` to start with `INVALID_BASE_PATH/wrong-extension`. Together with M13, all five SC-002 causes are pairwise-distinct (FR-007). This should already pass (guard).

  M6 fails before T012. M9–M11 should already pass (guards).

### Implementation for User Story 3

- [X] T012 [US3] In `src/tools/views_base/handler.ts`, change the named-mode `onNotABase` to throw `new UpstreamError({ code: "CLI_REPORTED_ERROR", cause, details: { code: "BASE_MALFORMED", reason: "unknown", base_path: input.base_path, ...reportDetails(report) }, message: \`views_base: base file at "${input.base_path}" is structurally unusable\` })`. The headline is unchanged, and `reason`, `message` and `messageLength` are additive (ADR-015). Run `npx vitest run src/tools/views_base`: M6 and M9–M14 pass.

**Checkpoint**: the error roster matches contract §2 exactly.

---

## Phase 6: User Story 4 - No raw parser internals as the primary signal (Priority: P3)

**Goal**: the headline never carries report text; `details.message` is bounded (FR-005, FR-006, SC-004, SC-007).

**Independent Test**: contract cases M7 and M8, plus headline assertions over M1 and M4.

### Tests for User Story 4 ⚠️

- [X] T013 [US4] Add to `src/tools/views_base/handler.test.ts`:
  - **M7**: named, with a 5,000-character complaint. Build it as `const prefix = "Error: YAMLException: bad indentation "; const complaint = prefix + "x".repeat(5000 - prefix.length);`, giving exactly 5,000 characters with no leading or trailing whitespace. Then `base:views` → `{ stdout: complaint, stderr: "", exitCode: 0 }` (the dispatch `Error:` failure path), so the report equals `complaint`. Expect `details.messageLength === 5000`, `details.message.length === 500 + "\n[… cut …]\n".length + 500`, `details.message.startsWith(<the report's first 500 chars>)`, `details.message.endsWith(<its last 500 chars>)`, and `details.message.includes("[… cut …]")`.
  - **M8**: named, with M1's output. Expect `details.message` to equal M1's stdout trimmed, and `details.messageLength` to equal its length.
  - **Headline**: for M1 and M4, expect `message` not to contain `line 3`, `column`, `[a, b` or `Flow sequence` (SC-004, V4).

  These should pass after T007 and T010. A failure means the bound or headline is wrong; fix it in `handler.ts`.

**Checkpoint**: all of contract §3 is green.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T014 [P] Update the intent header of `src/tools/views_base/handler.ts` (lines 1-11). Add that spec 081 recognises a YAML parser complaint (the shared `INVALID_YAML_PATTERN`) on the failure and clean-exit paths, ahead of the not-a-base check, as `BASE_MALFORMED` / `invalid-yaml` in both modes. Add that the named-mode not-a-base report is `BASE_MALFORMED` / `unknown`, and that the report is kept bounded in `details.message` / `messageLength` (spec 080 rule). Keep the rest of the header.
- [X] T015 [P] In `src/tools/views_base/index.ts`, replace the clause `` \`BASE_MALFORMED\` (the named \`.base\` is unusable) `` in `VIEWS_BASE_DESCRIPTION` with `` \`BASE_MALFORMED\` (the \`.base\` — named or open — is malformed: \`details.reason: "invalid-yaml"\` when Obsidian cannot parse its YAML, \`"unknown"\` when a named \`.base\` is otherwise unusable; \`details.message\` carries the bounded upstream report) ``. Change nothing else. Run `npx vitest run src/tools/views_base src/tools/_file-type-support.test.ts src/tools/_surface.test.ts`; the `_surface` check that only `views_base` mentions not-open must stay green.
- [X] T016 Run `npm run baseline:write`, then `git diff src/tools/_register-baseline.json`. Confirm that only the `views_base` `descriptionFingerprint` changed (quickstart §2). If any other fingerprint moved, stop and investigate before continuing. Depends on T015.
- [X] T017 [P] In `docs/tools/views_base.md` (Error roster table, around line 59), replace the `BASE_MALFORMED` row with two rows:
  - `` | `CLI_REPORTED_ERROR` | `BASE_MALFORMED` | `invalid-yaml` | Named or open mode: Obsidian cannot parse the `.base` file's YAML | Repair the YAML in the `.base` file (the bounded parser report is in `details.message`). | ``
  - `` | `CLI_REPORTED_ERROR` | `BASE_MALFORMED` | `unknown` | Named mode: the `.base` exists but Obsidian reports it is not usable as a Base, with no parser complaint | Open the file in Obsidian and investigate. | ``

  After the table, add one sentence stating that `BASE_MALFORMED`'s `details.reason` set is closed (`invalid-yaml` | `unknown`, a subset of `query_base`'s), and that `details.message` / `details.messageLength` carry the upstream report bounded to its first and last 500 characters when longer than 1,000. Also add a worked failure example: a named call with its `isError` result showing `code`, `details.code`, `details.reason`, `details.base_path`, a short `details.message`, `details.messageLength`, and the headline.
- [X] T018 [P] In `CHANGELOG.md` `[Unreleased]`, add the line `Spec 081-classify-malformed-base (BI-0137).` after the spec 080 line. Under `### Fixed`, add a bullet: **`views_base` reports a malformed Base as `BASE_MALFORMED`** (spec 081). A `.base` whose YAML Obsidian cannot parse now fails, named or open, with `CLI_REPORTED_ERROR`, `details.code: "BASE_MALFORMED"` and `details.reason: "invalid-yaml"`, instead of a generic upstream error carrying the raw parser output. The headline names the Base; the parser report is kept in `details.message`, bounded to its first and last 500 characters when longer than 1,000, with `details.messageLength`. The named-mode "not a base file" failure now carries `details.reason: "unknown"`. `query_base` is unchanged.
- [X] T019 Run the automated gate (quickstart §1): `npm run typecheck`, `npm run lint`, `npx vitest run`. Every test is green; fix any regression before continuing.
- [X] T020 Run the live end-to-end check (quickstart §4) under `.memory/test-execution-instructions.md`, with fresh `Sandbox/` fixtures: named broken, open broken, control, and `query_base` on the broken fixture (SC-005). Append the verbatim results to `contracts/t0-probe-findings.md`. Delete the fixtures, and confirm `Sandbox/` is empty and `Welcome.md` is untouched.
- [X] T021 Post-implement structural verification (CLAUDE.md, plan.md CodeGraph structural check). Run `codegraph sync`, then run `codegraph_explore` on `INVALID_YAML_PATTERN`, `listFocusedViews`, `executeViewsBase` and `classifyUpstreamError`. Verify:
  1. `src/errors.ts` is unchanged, and no new top-level code or error class exists.
  2. No handler imports `createLogger` / `createQueue`, and `server.ts` is unchanged.
  3. `_base-malformed.ts` is imported only by `views_base/handler.ts`, `query_base/handler.ts` and its test, and there is no tool→tool edge.
  4. `INVALID_YAML_PATTERN` is reachable from both production handlers, and no inline copy of the regex remains in `query_base/handler.ts`. This is SC-005's structural proof that both tools classify the same YAML complaint identically. T020 step 5 is its live proof. Together they are the plan's verification for SC-005, in place of a cross-tool unit test, which would need a `views_base` test to import `query_base`, or new `query_base` tests (research D6 leaves those unchanged).

  Record the results in `specs/081-classify-malformed-base/post-implement.md`.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (T001–T002)**: no dependencies. T002 is a hard gate: escalate instead of continuing if no complaint surfaces, or if the complaint does not match the shared pattern.
- **Phase 2 (T003–T005)**: needs T002. T003 blocks T004, T005 and all later phases.
- **Phase 3 (US1)**: needs T003. T006 → T007 → T008.
- **Phase 4 (US2)**: needs T007, which introduces the handlers-object signature. T009 → T010.
- **Phase 5 (US3)**: needs T007. T011 → T012. Can follow US2 or precede it, but not run in parallel with it (same two files).
- **Phase 6 (US4)**: needs T007 and T010 (M1 and M4 headlines).
- **Phase 7**: T014, T015, T017 and T018 are [P] once US1–US4 are done. T016 needs T015. T019 needs everything before it. T020 needs T019. T021 needs T019.

### Structural dependency notes (codegraph)

- `views_base/handler.ts` and `query_base/handler.ts` share no call path today, except that both call `stdoutDetails` (`src/tools/_eval-parse.ts`), which is used and not changed. The new shared edge is `INVALID_YAML_PATTERN`, so T005 and T007 both depend on T003, and nothing else orders them.
- `createViewsBaseTool` is exercised by `src/tools/_typed-result-fixtures.ts` (clean-exit `All\ttable\nActive\ttable\n`) through `_surface.test.ts` and `_plugin-noise.test.ts`. T019 covers them, and the view-line exclusion in T007 is what keeps that fixture a success.
- `VIEWS_BASE_DESCRIPTION` is read by `index.test.ts` (equality with the descriptor) and `_file-type-support.test.ts`, and is fingerprinted. T015 → T016.

### Parallel opportunities

- T004 and T005, after T003 (different files).
- T014, T015, T017 and T018 in the polish phase (different files).
- Stories US1–US4 all edit `views_base/handler.ts` and `handler.test.ts`, so they run in sequence.

## Parallel Example: Phase 2

```text
After T003:
  Task: "T004 Create src/tools/_base-malformed.test.ts"
  Task: "T005 Point query_base's invalid-yaml entry at INVALID_YAML_PATTERN"
```

## Parallel Example: Polish

```text
  Task: "T014 views_base handler intent header"
  Task: "T015 VIEWS_BASE_DESCRIPTION BASE_MALFORMED clause"
  Task: "T017 docs/tools/views_base.md error roster"
  Task: "T018 CHANGELOG [Unreleased] Fixed entry"
```

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1: T0 probes and the gate.
2. Phase 2: the shared pattern, with `query_base` green.
3. Phase 3: named-mode classification.
4. **Stop and validate**: M1–M3, M15 and M12 green. The reported defect is fixed for the automation path.

### Incremental delivery

US1 (named) → US2 (open) → US3 (reason set and roster guards) → US4 (bound and headline guards) → polish (description, baseline, docs, CHANGELOG, gates, live check, structural verification). Each story leaves the suite green.

## Notes

- `/speckit-tasks` codegraph rule: the task list crosses three source modules (`views_base`, `query_base`, the new `_base-malformed`). The pair query (`listFocusedViews stdoutDetails CLASSIFIER_PATTERNS executeQueryBase executeViewsBase`) found no call path between the two handlers beyond the shared `stdoutDetails`. The only new cross-module edge is the T003 constant, already reflected in the dependency graph.
- `INVALID_YAML_PATTERN` is never widened by this work. A T0 complaint it does not match is escalated at T002, so `query_base` stays unchanged, as BI-0137 §Out of scope requires (plan.md Spec alignment note).
- `.docs-as-code/capabilities/bases.md` is updated by `/speckit-docs-as-code <n>` after review, not by these tasks.
- Commit after each phase, using `/speckit-git-commit`.
