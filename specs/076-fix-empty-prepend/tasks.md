---

description: "Task list for 076-fix-empty-prepend"
---

# Tasks: Fix Empty-Note Insertion

**Input**: Design documents from `specs/076-fix-empty-prepend/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/prepend-empty-body-contract.md](contracts/prepend-empty-body-contract.md), [quickstart.md](quickstart.md)

**Tests**: required. Constitution Principle II (NON-NEGOTIABLE) requires happy-path and failure-or-boundary tests, co-located as `*.test.ts`, in the same change that modifies a tool.

**Organization**: tasks are grouped by user story. The code change sits entirely in `src/tools/prepend/`. US1 carries the code and US3 reuses it, so US2, US3 and US4 depend on US1's implementation but are tested independently.

Load the `karpathy-guidelines` skill before writing any code or test (user's global CLAUDE.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story the task belongs to (US1 to US4)

---

## Phase 1: Setup

**Purpose**: confirm a green starting point.

- [X] T001 Run `npm run typecheck`, `npm run lint` and `npm test` on branch `076-fix-empty-prepend` before any edit, and record any pre-existing failure so it is not later blamed on this change.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: widen prepend's fs seam and its test fixture without changing behaviour. Every story's tests need both.

**⚠️ CRITICAL**: no user story work can begin until this phase is complete.

- [X] T002 In `src/tools/prepend/handler.ts`, add `readFile: (p: string, encoding: "utf8") => Promise<string>`, `writeFile`, `rename` and `unlink` to `ExecuteFs`, with the same signatures as `append_note/handler.ts`'s `ExecuteFs`, so it satisfies `AtomicWriteFs` from `../_note-io.js`. Add matching `node:fs/promises` implementations to `DEFAULT_FS`. Do not use them yet.
- [X] T003 In `src/tools/prepend/_handler-fixtures.ts`, extend `fakeFs`:
  - Add an optional `contents?: string[]` sequence that `readFile` replays like `sizes` (default `[""]`; the last value repeats).
  - Add `writeFile` and `rename`, recorded in a new `writes: Array<{ path: string; content: string }>` and `renames: Array<{ from: string; to: string }>` on `FakeFsHandle`, and add `unlink`.
  - Keep `opts.over` merging onto the base, so existing per-test overrides still work.
  - Update the header's intent line.
  - Depends on T002.
- [X] T004 Run `npm run typecheck` and `npm test`. Every existing prepend test (`handler.test.ts`, `handler.bi047.test.ts`, `handler.file-type.test.ts`, `index.test.ts`, `schema.test.ts`) and `_surface.test.ts` (prepend entry of `src/tools/_typed-result-fixtures.ts`) must pass unchanged. Depends on T003.

**Checkpoint**: seam widened, behaviour unchanged.

---

## Phase 3: User Story 1 — Empty note holds exactly the supplied text (Priority: P1) 🎯 MVP

**Goal**: `prepend` to a 0-byte note leaves exactly `content`, in default and inline mode, and `bytes_written === byteLength(content)` (spec FR-001, FR-003, FR-004; contract E1 to E4).

**Independent Test**: with mocked `invokeCli` and `fakeFs` (`contents: ["", "first\n"]`, `sizes: [0, 6]`), `executePrepend` writes `"first"` atomically and returns `bytes_written: 5`.

### Tests for User Story 1 ⚠️ write first, confirm they fail

- [X] T005 [P] [US1] Create `src/tools/prepend/empty-body.test.ts` (header `// Original — no upstream.`) for `landedAtEmptyBody(before, content, after)` per research D2 and data-model §Predicate. Cases:
  - true: `("", "first", "first\n")`; `("", "first\n", "first\n\n")`; `("", "first\r\n", "first\r\n\n")`; `("", "café", "café\n")`.
  - false: inline-shaped `("", "first", "first")`; another writer changed the note, e.g. `("", "first", "first\nX")`; Obsidian did not write `("", "first", "")`.
  - false for notes with a body: `("abc", "def", "def\nabc")`; `("\n", "first", "first\n\n")`.
  - ambiguity guard false: `("x\n", "x", "x\nx\n")`, and the same shape with `content` `"x\nx"` (primitive root shorter than `content + "\n"`).
- [X] T006 [P] [US1] Create `src/tools/prepend/handler.empty-body.test.ts` (header `// Original — no upstream.`), reusing `_handler-fixtures.ts` (`fakeFs`, `fakeRegistry`, `deps`, `PREPEND_OK`) and `makeQueuedSpawn` from `../_handler-test-fixtures.js`. Queue a stub for the metadata-refresh `eval` (stdout `=> ok`) after `PREPEND_OK` whenever the correction runs (`invalidateMetadataCache → evalInVault → invokeCli`). Cases:
  - **E1**: `fakeFs` with `contents: ["", "first\n"]` and `sizes: [0, 6]`. Expect `fs.writes` to hold exactly one write whose content is `"first"`, a rename onto the absolute target, `bytes_written: 5`, and that the queued `eval` was consumed.
  - **E2**: inline (`sizes: [0, 5]`). Expect no write, `bytes_written: 5`, and no `readFile` after the call.
  - **E3**: `"first\n"`. Expect a write of `"first\n"` and `bytes_written: 6`.
  - **E4**: `"café"`. Expect `bytes_written: 5`.
  - **Race**: `contents: ["", "first\nX"]`. Expect no write and `bytes_written` equal to post − pre.
  - **Read-back fails, empty `before`** (EBUSY from the second `readFile`, `contents: [""]`, `sizes: [0, 6]`). Expect `UpstreamError` `FS_WRITE_FAILED`, `details.reason: "extra-trailing-newline"`, `details.errno: "EBUSY"`, `details.path`, `details.vault`, and `cause` set; no write.
  - **Read-back fails, non-empty `before`** (EBUSY from the second `readFile`; once with `before` `"abc"`, content `"def"`, `sizes: [3, 7]`, and once with a properties-only `before`). Expect `UpstreamError` `FS_WRITE_FAILED` with `details: { errno: "EBUSY", syscall: "open", path }`, no `details.reason`, `cause` set, a message containing "Do not send the content again", and no write (contract §4 unverified row; spec FR-009 (c)).
  - **`writeAtomic` rename fails** (EPERM). Same code and reason, and the tmp file is unlinked.
  - **Metadata refresh `eval` fails**. The call still succeeds with `bytes_written: 5`, and `logger.metadataRefreshFailed` was called.
  - **Pre-read ENOENT**: `readFile` throws ENOENT before the call and upstream reports not found. Expect the existing `NOTE_NOT_FOUND` classification and no correction.
  - **Pre-read non-ENOENT** (EACCES from the first `readFile`). Expect `UpstreamError` `FS_WRITE_FAILED` with `details: { errno: "EACCES", syscall: "open", path }`, no `details.reason`, `cause` set, and that the spawn queue was never consumed (Obsidian not called, nothing written).

### Implementation for User Story 1

- [X] T007 [P] [US1] Create `src/tools/prepend/empty-body.ts` (header `// Original — no upstream.`, plus an intent line citing spec 076 research D2) exporting `landedAtEmptyBody(before: string, content: string, after: string): boolean`. Logic: `w = content + "\n"`; return `after === before + w && !before.endsWith(w.slice(0, (w + w).indexOf(w, 1)))`. Pure: no fs access and no `UpstreamError`. Makes T005 pass.
- [X] T008 [US1] In `src/tools/prepend/handler.ts` `executePrepend`, implement the data-model §Sequence. Depends on T002 and T007.
  - (a) After the pre-call `stat`, read `before` with `fs.readFile(absPath, "utf8")`: ENOENT → `null`; any other errno → throw `UpstreamError` `{ code: "FS_WRITE_FAILED", cause: e, details: { errno, syscall: "open", path: relPath } }` (errno through `getErrno`, no `reason`), before the `invokeCli` call. Leave the pre-call `stat`'s existing raw rethrow unchanged (outside this BI).
  - (b) After the existing `bytesWritten <= 0` guard, if `before !== null && bytesWritten === Buffer.byteLength(input.content, "utf8") + 1`, read `after`.
  - (c) If `landedAtEmptyBody(before, input.content, after)`, call `writeAtomic(fs, absPath, before + input.content, randomUUID)` (`node:crypto`), then `invalidateMetadataCache(deps, { vault: input.vault, relPath })`, then `bytesWritten -= 1` (make `bytesWritten` `let`).
  - (d) A failure of `writeAtomic`, or of the `after` read when `before === ""`, throws `UpstreamError` `{ code: "FS_WRITE_FAILED", cause: e, details: { reason: "extra-trailing-newline", path: relPath, vault: vaultDisplayName, ...(errno ? { errno } : {}) } }` with the contract §4 `extra-trailing-newline` message. A failure of the `after` read when `before` is non-empty throws `UpstreamError` `{ code: "FS_WRITE_FAILED", cause: e, details: { errno, syscall: "open", path: relPath } }` (no `reason`) with the contract §4 unverified message. Get the errno through `getErrno`.
  - (e) Update the file header's intent line: it now reads the note before and after the call and rewrites it once when Obsidian added a trailing LF to a note with no body (spec 076). Remove "No fs read/write/rename".
  - Makes T006 pass.
- [X] T009 [US1] Run `npm test -- src/tools/prepend`. T005 and T006 pass, and all pre-existing prepend tests still pass unchanged (spec SC-004, FR-006). Depends on T007 and T008.

**Checkpoint**: MVP. Empty-note prepend is exact.

---

## Phase 4: User Story 2 — Mirror behaviour with add-to-end (Priority: P2)

**Goal**: for an empty note, `prepend` and `append_note` with the same text give byte-identical notes and the same `bytes_written` (spec FR-005, SC-003).

**Independent Test**: one test drives both handlers on an empty fake note and compares the written content and `bytes_written`.

- [X] T010 [US2] Add a `describe("mirror with append_note (spec 076 FR-005)")` block to `src/tools/prepend/handler.empty-body.test.ts`. For each of `"first"`, `"first\n"` and `"café"`:
  - run `executePrepend` as in T006 E1;
  - run `executeAppendNote` from `../append_note/handler.js`. append_note has no shared `_handler-fixtures.ts`, so build an inline append_note `ExecuteFs` literal: `realpath` resolves the vault root and throws ENOENT otherwise (as prepend's `fakeFs` does), `readFile` returns `""`, `writeFile` records content, and `rename` and `unlink` are no-ops. Use the same `fakeRegistry`, a `makeQueuedSpawn` with one `=> ok` eval stub for its metadata refresh, and the same `path` input;
  - assert the final written contents are equal and both `bytes_written` values are equal.
  - The imports from append_note are test-only; the production modules gain no tool→tool edge (Principle I).
  - Depends on T008.

**Checkpoint**: mirror verified.

---

## Phase 5: User Story 3 — Notes with only a properties block (Priority: P2)

**Goal**: `prepend` to a properties-only note leaves `before + content` with no extra trailing LF, and `bytes_written === byteLength(content)`, apart from the documented ambiguity (spec FR-002, FR-004; contract E5 to E8, E12).

**Independent Test**: with `contents: ["---\nkey: v\n---\n", "---\nkey: v\n---\nLead\n"]` and `sizes: [15, 20]`, `executePrepend` writes `"---\nkey: v\n---\nLead"` and returns `bytes_written: 4`.

- [X] T011 [P] [US3] Extend `src/tools/prepend/empty-body.test.ts` with properties-only cases:
  - true: LF `("---\nkey: v\n---\n", "Lead", "---\nkey: v\n---\nLead\n")`; CRLF `("---\r\nkey: v\r\n---\r\n", "Lead", "---\r\nkey: v\r\n---\r\nLead\n")`; no line break after the closing `---` `("---\nkey: v\n---", "Lead", "---\nkey: v\n---Lead\n")`.
  - false: a note with a body `("---\nkey: v\n---\nbody", "Lead", "---\nkey: v\n---\nLead\nbody")`; a blank body `("---\nkey: v\n---\n\n", "Lead", "---\nkey: v\n---\nLead\n\n")`; the ambiguity case E12 `("---\nkey: v\n---\n", "---", "---\nkey: v\n---\n---\n")`.
  - Depends on T007 only for running; can be written alongside T005.
- [X] T012 [US3] Add contract E5, E6 (inline: no write), E7, E8 and E12 (no write, `bytes_written: 4`) to `src/tools/prepend/handler.empty-body.test.ts`, with the same fixture pattern as T006. Depends on T008.

**Checkpoint**: properties-only prepend exact; the ambiguity guard is pinned.

---

## Phase 6: User Story 4 — Documentation matches behaviour (Priority: P3)

**Goal**: the reference documentation's empty-note rule, worked examples, `bytes_written` text and error table agree with the behaviour (spec FR-008, SC-005).

**Independent Test**: each docs statement about empty and properties-only notes matches a contract §3 row and a passing test.

- [X] T013 [P] [US4] Edit `docs/tools/prepend.md`:
  - (0) Where the page first refers to the properties block in the new text, write "properties block (frontmatter)" once, then keep the page's existing "frontmatter" wording.
  - (a) *Separator behaviour* worked examples: keep `existing = ""` → `"def"`, and add `existing = "---\nkey: v\n---\n"`, `content = "Lead"` → `"---\nkey: v\n---\nLead"` (no trailing separator).
  - (b) Add one sentence under the table on the limitation: on a properties-only note whose end repeats `content + "\n"` (for example `content: "---"`), the result keeps one trailing line break (research D2).
  - (c) *Output envelope* `bytes_written` bullet: add "On an empty note or a note with only a properties block it exactly equals the content's size in bytes."
  - (d) *Error states*: add the three new `FS_WRITE_FAILED` rows from contract §4: `details.reason: "extra-trailing-newline"` (what to do: retry once the file is free, or remove the final line break); the unverified read-back row with `details.syscall: "open"` and no reason (what to do: do not re-send; read the note and check its end); and the pre-read row (nothing changed; retry once the file can be read).
  - Leave the separator rows for notes with content unchanged (spec Out of Scope; plan Follow-ups).
- [X] T014 [P] [US4] Add to `CHANGELOG.md` `[Unreleased]` a `Spec 076-fix-empty-prepend.` line and a **Fixed** entry: `prepend` on an empty note or a properties-only note no longer adds a trailing line break, and `bytes_written` equals the content's size; a new `FS_WRITE_FAILED` reason `extra-trailing-newline` reports a failed correction. Follow the existing `[Unreleased]` layout.
- [X] T015 [US4] Confirm `src/tools/prepend/index.ts` `PREPEND_DESCRIPTION` makes no empty-note claim that now contradicts behaviour, and leave it unchanged, so no fingerprint moves. Run `npm run baseline:write` and `git diff --exit-code src/tools/_register-baseline.json`: expect no diff (contract §5).

**Checkpoint**: docs agree with behaviour.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T016 Run `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm test`; all green. Depends on T009 to T015.
- [X] T017 Post-implement structural verification (CLAUDE.md): run `codegraph sync`, then `codegraph_explore "landedAtEmptyBody executePrepend writeAtomic invalidateMetadataCache UpstreamError"`. Confirm:
  1. no new error code or class, and `src/errors.ts` is unchanged;
  2. no handler imports `createLogger` / `createQueue`;
  3. `empty-body.ts` is imported only by `prepend/handler.ts` and tests, and `handler.ts`'s new import `../_note-io.js` is downward, with no production tool→tool import;
  4. `landedAtEmptyBody` is reachable from `createPrependTool`.
  Record the result in the PR description's Constitution Compliance section.
- [X] T018 Run the [quickstart.md](quickstart.md) §3 live check after reading `.memory/test-execution-instructions.md`: `npm run build`, fixtures under `Sandbox/076-<run>/` seeded through `obsidian eval`, steps 1 to 9, then clean up and confirm the folder is gone. Report each step's result verbatim. Depends on T016.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)**: none.
- **Foundational (T002 → T003 → T004)**: after Setup; blocks every story.
- **US1 (T005 to T009)**: after Foundational. T005, T006 and T007 can start together; T008 needs T002 and T007; T009 needs T007 and T008.
- **US2 (T010)**: needs T008 (production code) and T006 (the test file exists).
- **US3 (T011, T012)**: T011 can be written with T005; T012 needs T008 and T006.
- **US4 (T013 to T015)**: T013 and T014 can be written at any point after the plan; T015 after T008.
- **Polish (T016 to T018)**: after all stories.

### Structural dependency notes (CodeGraph)

- `executePrepend` → `invalidateMetadataCache` → `evalInVault` → `invokeCli` → queue/spawn. The correction path issues one extra CLI call, so every handler test that reaches it (T006, T010, T012) must queue an `eval` stub after `PREPEND_OK` in `makeQueuedSpawn`. Otherwise the spawn queue runs dry.
- `fakeFs` in `prepend/_handler-fixtures.ts` is also imported by `src/tools/_typed-result-fixtures.ts`. T003's defaults must keep that entry's behaviour: `sizes: [100, 158]`, a delta that is not content + 1, so no read-back happens.
- `writeAtomic` requires `AtomicWriteFs` (`writeFile`, `rename`, `unlink`). T002 must add all three or T008 does not typecheck.

### Within Each User Story

- Tests are written first and fail before the implementation (T005 and T006 before T007 and T008).
- The pure helper (T007) comes before handler wiring (T008).

### Parallel Opportunities

- T005, T006 and T007 (different new files).
- T011 with T005 (same file, different `describe` blocks; sequence them if one person edits).
- T013 and T014 (different docs files) at any time.

---

## Parallel Example: User Story 1

```text
Task: "T005 Create src/tools/prepend/empty-body.test.ts (predicate cases)"
Task: "T006 Create src/tools/prepend/handler.empty-body.test.ts (handler cases E1–E4, failures, race)"
Task: "T007 Create src/tools/prepend/empty-body.ts (landedAtEmptyBody)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001 to T004: green baseline, widened seam.
2. T005 to T009: empty-note fix with tests.
3. **Stop and validate**: `npm test -- src/tools/prepend`.

### Incremental Delivery

1. MVP (US1).
2. US2 mirror test (T010), with no code change.
3. US3 properties-only tests (T011, T012). The code is already covered by T008.
4. US4 docs (T013 to T015).
5. Polish (T016 to T018).

---

## Notes

- CodeGraph task-pair rule: the code tasks touch the `prepend` module (`handler.ts`, the new `empty-body.ts`, fixtures) and reuse the shared `_note-io` substrate without editing it. `codegraph_explore "executePrepend writeAtomic invalidateMetadataCache fakeFs"` found no existing path between `executePrepend` and the `_note-io` writers, and surfaced the `invalidateMetadataCache → evalInVault → invokeCli` hop and the `_typed-result-fixtures.ts` consumer of `fakeFs`. Both are recorded under *Structural dependency notes* above.
- FR-008's "shipped system documentation" part (`.docs-as-code/`) is delivered by `/speckit-docs-as-code <n>` after code review, per the PR lifecycle in CLAUDE.md, not by a task in this list.
- Do not edit `src/tools/_note-io.ts`, `src/errors.ts`, `src/tools/prepend/{schema,index}.ts` or any other tool module (plan Constraints).
- Commit after each phase, or as one feature commit via `/speckit-git-commit`.
