---

description: "Task list for 086 Fix section replacement"
---

# Tasks: Fix section replacement

**Input**: Design documents from `specs/086-fix-section-replacement/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/placement-contract.md](contracts/placement-contract.md), [quickstart.md](quickstart.md)

**Tests**: Requested. Spec FR-013 and FR-018 and Constitution Principle II require them. Write each story's tests first. Rows that prove the fix (H1–H5, B1–B2, U1, U2) must fail on the unfixed code. Regression anchors (H9, B5) must pass on the unfixed code, and still pass after.

**Organization**: one phase per user story, in priority order. The P1 stories come first (US1, US2, US5), then the P2 stories (US3, US4). Row IDs (N1–N9, H1–H12, B1–B6, U1–U3, S1–S5) refer to the contract. Task IDs are written `T0nn`.

**Scope**: `patch_heading` (`replace`, `append`, `prepend`) and `patch_block`. Out of scope:

- `walkHeadings`, `scanBlocks` and `findBlock` (finders);
- the bodies of the splice helpers;
- `append_note`, `prepend`, `set_property`;
- adding a race check to `patch_block`.

**Before any code edit**:

- load the `karpathy-guidelines` skill;
- read `.memory/refactor-decisions.md`. These items apply here:
  - §2: byte-exact bar for unchanged behaviour;
  - §5: test edits need explicit scope. The only ones allowed are the two `detectLineEnding` block deletions in T013 and T029;
  - §9: vitest-free fixtures;
  - §27(a): the baseline proves surface changes;
  - §30: test-support modules must match a build exclude;
  - §36: `bytes_written` bounds.

**Before any live call**: read `.memory/test-execution-instructions.md`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 from spec.md

---

## Phase 1: Setup

**Purpose**: a known-green starting point.

- [X] T001 Before any edit, run `npm run typecheck; if ($?) { npm run lint }; if ($?) { npm test }` in PowerShell on branch `086-fix-section-replacement`. Record the result in `specs/086-fix-section-replacement/post-implement.md`; create the file, headed `# Post-implement: 086 Fix section replacement`. A failure here is pre-existing: report it, and do not fix it in this feature.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: the shared line model (research D1, data-model E2–E6) and the shared test fixtures.

- [X] T002 [P] Create `src/tools/_line-ending-fixtures.ts`.

  **Header**: `// Original — no upstream. Vitest-free line-ending fixtures for the patch_heading / patch_block mixed-line-ending tests (spec 086): LF templates plus converters, so a mixed note and its uniform twin share their text by construction.`

  **Exports**:
  - `toCrlf(s)`: every `"\n"` becomes `"\r\n"`. It assumes the input is pure LF.
  - `toLf(s)`: every `"\r\n"` becomes `"\n"`.
  - `mixFmLfBodyCrlf(s)`: the lines from the opening `---` through the closing `---` (inclusive) keep LF; every later line break becomes `"\r\n"`.
  - `mixFmCrlfBodyLf(s)`: the reverse.
  - `HEADING_TEMPLATE`, the contract `HT`:

    ```text
    ---
    status: draft
    ---
    # Top
    ## First
    first-1
    first-2
    ## Middle
    middle-1
    ### Child
    child-1
    ## Last
    last-1
    last-2
    ```

    Every line ends in `\n`, including the last.
  - `BLOCK_TEMPLATE`, the contract `BT`:

    ```text
    ---
    status: draft
    ---
    Para text ^para

    - item ^li

    | a | b |
    | - | - |
    ^tbl
    ```

    Every line ends in `\n`.

  The file name matches the `src/**/_*fixtures.ts` excludes in `tsconfig.build.json` and `vitest.config.ts`; do not edit either config. No `vitest` import.

- [X] T003 [P] Create `src/tools/_note-lines.test.ts` with header `// Original — no upstream. Unit tests for the shared note-line model (spec 086, contracts/placement-contract.md N1–N9).` It holds rows N1–N9 exactly as specified in the contract. For N3, import `walkHeadings`'s scan view indirectly: assert, for every index `i` of `mixFmLfBodyCrlf(HEADING_TEMPLATE)`, that `lineText(splitNoteLines(raw)[i])` equals `raw.split("\n").map(l => l.endsWith("\r") ? l.slice(0, -1) : l)[i]`. This is the scanners' `splitLinesForScan` rule, restated, because that function is not exported. Also assert through the real walker: import `walkHeadings` from `./patch_heading/heading-walk.js`. In both mixes, for every heading path of `HEADING_TEMPLATE` (`Top#First`, `Top#Middle`, `Top#Middle#Child`, `Top#Last`), resolve `r = walkHeadings(raw, path.split("#"))`, and assert `lineText(splitNoteLines(raw)[r.markerLineIndex]) === r.markerLineText`. This catches a future change to the scanner's split that the restated rule would miss (contract N3). The test-only import is from a tool module into a cohort-leaf test; no production edge. The file must fail (the module does not exist yet).

- [X] T004 Create `src/tools/_note-lines.ts`. It imports nothing.

  **Header**: `// Original — no upstream. Shared note-line model for the direct-fs editors patch_heading and patch_block (spec 086): splits a note at every line feed — the same points both finders split at — keeping each line's own terminator, so the finders' line indices address the same lines in the edit array on uniform and mixed-ending notes alike; picks the ending for added lines from the target's marker line; reassembles without touching kept lines' terminators; and checks that an edit kept the original bytes around it.`

  **Exports** (data-model E2, E4, E5, E6):
  - `export type LineEnding = "\n" | "\r\n";`
  - `splitNoteLines(raw: string): string[]`: split after each `"\n"`. No phantom empty last element when `raw` ends with `"\n"`; `""` gives `[""]`. Invariants V2 and V3.
  - `lineText(line: string): string`: drop one trailing `"\n"`, then one trailing `"\r"` (research F10).
  - `insertEnding(lines: readonly string[], anchor: number): LineEnding`: the anchor line's terminator if it ends in `"\n"` (`"\r\n"` when the preceding character is `"\r"`); else the nearest earlier such line's; else `"\n"`.
  - `joinNoteLines(edited: readonly string[], ending: LineEnding, trailingNewline: boolean): string`: write each element, followed by `ending` when the element does not end in `"\n"` and is not the last. Then the fix-up:
    - if `trailingNewline` and the result does not end in `"\n"`, append `ending`;
    - if `!trailingNewline` and the result ends in `"\n"`, strip that terminator (`"\r\n"` or `"\n"`).
  - `lineStart(lines: readonly string[], index: number): number`: the sum of the lengths of `lines[0..index)`. An index at or past `lines.length` gives the total length.
  - `keepsOriginalAround(original: string, edited: string, prefixEnd: number, suffixStart: number): boolean`: true iff all of these hold:
    - `edited.startsWith(original.slice(0, prefixEnd))`;
    - `edited.endsWith(original.slice(suffixStart))`;
    - `edited.length >= prefixEnd + (original.length - suffixStart)`.

  Each export gets a one-paragraph doc comment stating its rule. Then run `npx vitest run src/tools/_note-lines.test.ts`: N1–N9 pass.

**Checkpoint**: the shared model exists and is pinned. No handler uses it yet.

---

## Phase 3: User Story 1 — Only the named section changes (Priority: P1) 🎯 MVP

**Goal**: on mixed notes, `patch_heading` places `replace`, `append` and `prepend` at the named heading, and leaves every byte before the heading line and after the section unchanged. Covers FR-001, FR-002, FR-003 and FR-005.

**Independent Test**: `npx vitest run src/tools/patch_heading/handler.line-endings.test.ts -t "US1"` passes H1–H5 and H10.

### Tests for User Story 1 (write first; H1–H5 must fail before T008)

- [X] T005 [US1] Create `src/tools/patch_heading/handler.line-endings.test.ts`.

  **Header**: `// Original — no upstream. patch_heading handler tests for notes with mixed line endings (spec 086, contracts/placement-contract.md H1–H12): placement in all three modes, mixed-versus-uniform equivalence, kept terminators, final line break, agent-typed endings, lone CR, and unchanged bytes on uniform notes.`

  **Setup**: use the existing builders in `src/tools/patch_heading/_handler-fixtures.ts`: `fakeFs` (its `writes` / `renames` tracking), `fakeRegistry`, `deps` and `VAULT_ROOT`. Use the converters and `HEADING_TEMPLATE` from `../_line-ending-fixtures.js`. Add a local helper `written(fs)` returning the content of the single write. If a needed builder is missing from `_handler-fixtures.ts`, add it there, vitest-free, and do not change existing builders.

  **`describe("US1 …")` rows**:
  - **H1**: on `mixFmLfBodyCrlf(HEADING_TEMPLATE)`, `replace` `heading_path: "Top#Last"`, `content: "new1\nnew2"`. The written text equals the original up to and including the `## Last\r\n` line, then `new1\r\nnew2\r\n`, and nothing else.
  - **H2**: `replace` on `Top#First`. The bytes from `## Middle` to EOF are unchanged, and `first-1` / `first-2` are gone.
  - **H3**: `replace` on `Top#Middle`. `### Child` to EOF is unchanged.
  - **H4**: H1–H3 on `mixFmCrlfBodyLf(HEADING_TEMPLATE)`. The added lines end in `"\n"`.
  - **H5**: `append` and `prepend` on `Top#Middle` in both mixes. `append` content lands immediately before `## Last`; `prepend` content lands immediately after the `## Middle` line. Every original byte is present, in order, around it.
  - **H10**: after H1, `walkHeadings(written, ["Top", "Last"])` resolves, and its direct body joined equals `new1` / `new2`.

  Run the file and record that H1–H5 and H10 fail on the unfixed handler.

### Implementation for User Story 1

- [X] T006 [US1] In `src/tools/patch_heading/handler.ts` (research D2):
  - import `splitNoteLines`, `insertEnding` and `joinNoteLines` from `../_note-lines.js`;
  - replace the `detectLineEnding` call, the `trimmedForSplit` block and the `split` with `const lines = splitNoteLines(originalContent);`;
  - keep `const trailingNewline = detectTrailingNewline(originalContent);`;
  - after the mode switch, set `const editedContent = joinNoteLines(editedLines, insertEnding(lines, resolved.markerLineIndex), trailingNewline);`;
  - delete the local `reassemble` function and remove `detectLineEnding` from the import;
  - in the file header comment, after "mode-dispatched body edit", add: "on per-line-terminator lines (spec 086: the edit array splits where the heading walk splits; kept lines keep their own line endings, added lines take the heading line's)".
- [X] T007 [US1] **Approval gate first** (owner ruling 2026-11-02, recorded in `.memory/refactor-decisions.md` §5): after T006, run a Grep for `detectLineEnding` over `src/`, excluding `*.test.ts` and `append_note/` (whose `detectLineEnding` is a different symbol). Record the result in `post-implement.md`.
  - **If no caller of `patch_heading/body-edit.ts`'s `detectLineEnding` remains in `src/`**, do the edits below and T008.
  - **If any caller remains**, take the fallback: keep `detectLineEnding` exported and its tests unchanged. Make only the doc-comment corrections below, and skip T008's deletion.

  In `src/tools/patch_heading/body-edit.ts`:
  - delete `detectLineEnding` and its doc comment (only if the gate allows);
  - in the file header, replace "line-ending detection (FR-015) and" with "and";
  - in `splitContentLines`' doc comment, replace "The handler glues the segments with the file's detected line ending on reassembly." with "The handler glues the segments with the heading line's line ending on reassembly (spec 086).".

  No function body changes.
- [X] T008 [US1] Only if T007's gate allowed the deletion: in `src/tools/patch_heading/body-edit.test.ts`, delete the `describe("detectLineEnding", …)` block and remove `detectLineEnding` from the import list. Change nothing else (`.memory/refactor-decisions.md` §5; plan Test-edit scope). Under the fallback, leave the file untouched. Then run `npx vitest run src/tools/patch_heading`. H1–H5 and H10 pass, and every pre-existing file passes unedited apart from this deletion.

**Checkpoint**: US1 is deliverable on its own. It is the MVP: `patch_heading` no longer corrupts mixed notes.

---

## Phase 4: User Story 2 — Mixed and uniform notes behave the same (Priority: P1)

**Goal**: the same edit gives the same text on mixed and uniform notes, and uniform notes are byte-identical to today. Covers FR-007 and FR-008.

**Independent Test**: `npx vitest run src/tools/patch_heading/handler.line-endings.test.ts -t "US2"` passes H6 and H9.

- [X] T009 [US2] In `src/tools/patch_heading/handler.line-endings.test.ts`, add `describe("US2 …")`:
  - **H6**: for each mode and the targets `Top#First`, `Top#Middle` and `Top#Last`, run the same call on `HEADING_TEMPLATE`, `toCrlf(HEADING_TEMPLATE)`, `mixFmLfBodyCrlf(HEADING_TEMPLATE)` and `mixFmCrlfBodyLf(HEADING_TEMPLATE)`. Assert that `toLf(written)` is identical across all four.
  - **H9**: for `HEADING_TEMPLATE` and `toCrlf(HEADING_TEMPLATE)`, `replace` `Top#Middle` with `"x"`, plus one `append` and one `prepend`. Assert the written text equals a **literal** expected string, written out by hand from today's behaviour (not computed through `_note-lines`).

  To prove H9 is a regression anchor, either write and run H9 before T006, or revert only the handler, as follows. Never use `git stash` while other uncommitted work is in the tree.

  ```powershell
  git diff -- src/tools/patch_heading/handler.ts > tmp.patch
  git checkout -- src/tools/patch_heading/handler.ts
  npx vitest run src/tools/patch_heading/handler.line-endings.test.ts -t "H9"
  git apply tmp.patch
  Remove-Item tmp.patch
  ```

  H9 must pass on the reverted handler. Record the result in `post-implement.md`.

**Checkpoint**: US1 and US2 hold together.

---

## Phase 5: User Story 5 — Block-reference edits get the same guarantees (Priority: P1)

**Goal**: `patch_block` lands on the found block on mixed notes, keeps every other byte and line ending, matches uniform notes, and refuses an unsafe placement without writing. Covers FR-014 to FR-018.

**Independent Test**: `npx vitest run src/tools/patch_block` passes B1–B6, U2 and S5 (`patch_block`), with every pre-existing file unedited apart from T013 (if its gate allows the deletion).

### Tests for User Story 5 (write first; B1, B2 and U2 must fail before T012–T014)

- [X] T010 [P] [US5] Create `src/tools/patch_block/handler.line-endings.test.ts`.

  **Header**: `// Original — no upstream. patch_block handler tests for notes with mixed line endings (spec 086, contracts/placement-contract.md B1–B6).`

  **Setup**: use `src/tools/patch_block/_handler-fixtures.ts` builders, and `BLOCK_TEMPLATE` plus the converters.

  **Rows**:
  - **B1, B2**: for `para`, `li` and `tbl`, in both mixes. Only the block's lines change:
    - `para` with `content: "New"`: the line becomes `New ^para`;
    - `li` with `content: "New"`: the line becomes `- New ^li` (the handler keeps the list prefix and re-attaches the marker);
    - `tbl` with `content: "| c | d |"`: the two table rows are replaced and the `^tbl` line is kept verbatim.

    Bytes before and after the block are unchanged, and the added lines take the marker line's ending.
  - **B3**: equivalence across the four variants, via `toLf`.
  - **B4**: kept terminators, compared line by line, and the final line break kept.
  - **B5**: literal expected bytes for `BLOCK_TEMPLATE` and `toCrlf(BLOCK_TEMPLATE)`. It must pass on the unfixed code.
  - **B6** (contract B6): build two notes inline with `mixFmLfBodyCrlf`:
    - `"---\nstatus: draft\n---\n## Heading ^hd\nbody\n"`: replacing `hd` rejects with `CLI_REPORTED_ERROR`, `details.code: "BLOCK_ON_HEADING"`, `details.heading_shape: "atx"`;
    - `"---\nkey: ^fm\n---\nbody\n"`: replacing `fm` rejects with `CLI_REPORTED_ERROR`, `details.code: "BLOCK_NOT_FOUND"`.

    For both, the fake fs records 0 writes and 0 renames. This pins that a mixed frontmatter does not change which block is found or refused (spec Edge Cases; FR-016).
- [X] T011 [P] [US5] Create `src/tools/patch_block/handler.unsafe-placement.test.ts`.

  **Header**: `// Original — no upstream. Forces a wrong block index through the real patch_block handler to pin the UNSAFE_PLACEMENT refusal (spec 086 FR-016, contracts/placement-contract.md U2).`

  Use `vi.mock("./block-scan.js", async (importOriginal) => { const m = await importOriginal<typeof import("./block-scan.js")>(); return { ...m, findBlock: (c: string, id: string) => { const r = m.findBlock(c, id); return r && { ...r, markerLineIndex: r.markerLineIndex + 1, blockStartLineIndex: r.blockStartLineIndex + 1, blockEndLineIndex: r.blockEndLineIndex + 1 }; } }; });`. Then call `executePatchBlock` on `BLOCK_TEMPLATE` for `para`, and assert:
  - rejects with an `UpstreamError` with `code === "CLI_REPORTED_ERROR"`;
  - `details` toEqual `{ code: "UNSAFE_PLACEMENT", block_id: "para", path: <relPath> }`;
  - the fake fs recorded 0 writes and 0 renames.

  This is the repository's first `vi.mock` (research D4); keep it confined to this file.

### Implementation for User Story 5

- [X] T012 [US5] In `src/tools/patch_block/handler.ts`, apply the T006 pattern:
  - `splitNoteLines(originalContent)`;
  - unchanged `applyVerbatimMarkerPreserve` / `applyDetachReattach`;
  - `joinNoteLines(editedLines, insertEnding(lines, match.markerLineIndex), trailingNewline)`;
  - delete the local `reassemble`, including its `v8 ignore` defensive branch, which now lives in `joinNoteLines`, and drop the `detectLineEnding` import.

  Then add the placement check before `writeAtomic` (research D3, data-model E6):

  ```ts
  if (
    lineText(lines[match.markerLineIndex] ?? "") !== match.markerLineText ||
    !keepsOriginalAround(originalContent, editedContent,
      lineStart(lines, match.blockStartLineIndex), lineStart(lines, match.blockEndLineIndex + 1))
  ) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: { code: "UNSAFE_PLACEMENT", block_id: input.block_id, path: relPath },
      message: `Edit for block-reference "^${input.block_id}" could not be placed safely in "${relPath}"; the note was not changed. Re-read the note and retry once; if it fails again, report it.`,
    });
  }
  ```

  Update the header comment: "per-shape surgery on per-line-terminator lines (spec 086) → placement check (UNSAFE_PLACEMENT, no write) → atomic tmp+rename".
- [X] T013 [US5] **Approval gate first** (owner ruling 2026-11-02, `.memory/refactor-decisions.md` §5): after T012, run a Grep for `detectLineEnding` over `src/`, excluding `*.test.ts` and `append_note/`. Record the result in `post-implement.md`.
  - **If no caller of `patch_block/block-edit.ts`'s `detectLineEnding` remains**: in `src/tools/patch_block/block-edit.ts`, delete `detectLineEnding` and its doc comment. In `src/tools/patch_block/block-edit.test.ts`, delete the `describe("detectLineEnding (FR-013)", …)` block and remove `detectLineEnding` from the import.
  - **If any caller remains (fallback)**: keep the export and its tests unchanged.

  In both cases, correct any doc comment in `block-edit.ts` that says the handler uses the file's detected line ending. Nothing else changes (§5).
- [X] T014 [US5] In `src/tools/patch_block/index.ts`, in `PATCH_BLOCK_DESCRIPTION`'s "Typed errors via `UpstreamError.details.code`:" list, insert `` `UNSAFE_PLACEMENT` (note unchanged; re-read and retry once) `` after `` `BLOCK_ON_HEADING` (use `patch_heading`) ``. In `src/tools/patch_block/index.test.ts`, add one case (S5): the description contains `` `UNSAFE_PLACEMENT` `` after `Typed errors via`.
- [X] T015 [US5] In `docs/tools/patch_block.md`:
  - add the contract's `UNSAFE_PLACEMENT` row to the Error states table, after `BLOCK_ON_HEADING`, worded for blocks;
  - under "Single placement mode (replace)", add one paragraph: "Line endings: the note may mix LF and CRLF. Every line outside the block keeps its own line ending; lines the edit adds take the line ending of the block's marker line (or, if that line is the note's last and has none, of the nearest earlier line; LF if the note has no line breaks). Whether the note ends with a line break is unchanged."

  Then run `npx vitest run src/tools/patch_block`. B1–B6, U2 and S5 pass, and the pre-existing files pass unedited (apart from T013). The FR-018 gate in `_register.test.ts` is now expected to fail until T021.

**Checkpoint**: `patch_block` is fixed and guarded, independently of the `patch_heading` work.

---

## Phase 6: User Story 3 — Line endings outside the edit are preserved (Priority: P2)

**Goal**: no kept line changes its terminator, and the final line break state is kept. Covers FR-004 and FR-006.

**Independent Test**: `npx vitest run src/tools/patch_heading/handler.line-endings.test.ts -t "US3"` passes H7, H8, H11 and H12.

- [X] T016 [US3] In `src/tools/patch_heading/handler.line-endings.test.ts`, add `describe("US3 …")`:
  - **H7**: for both mixes, every mode, and every target, map `splitNoteLines(original)` and `splitNoteLines(written)` to `[lineText, terminator]` pairs. Assert that every original line outside the edit point appears in the output with an identical terminator. Use the contract's E3 edit point:
    - `replace`: the lines `[reachStart, directBodyEnd)` are removed;
    - `append` / `prepend`: no line is removed.
  - **H8**: on `mixFmLfBodyCrlf(HEADING_TEMPLATE)` with its final `"\r\n"` removed, `replace` and `append` on `Top#Last` give a result that does not end in a line break. Also run `replace` with `content: ""`: the result ends in `## Last`, with no terminator.
  - **H11** (contract H11): on `mixFmCrlfBodyLf(HEADING_TEMPLATE)`, `replace` `Top#Last` with `content: "a\r\nb"`. The written text ends `## Last\na\nb\n`: the added lines take the heading line's LF, not the CRLF the agent typed.
  - **H12** (contract H12): build `raw = mixFmLfBodyCrlf(HEADING_TEMPLATE).replace(/last-1\r\nlast-2\r\n$/, "").replace(/## Last\r\n$/, "## Last\r")`. This leaves the note's last line as `## Last\r`: a lone CR, no line feed. `append` `Top#Last` with `"x"` succeeds (no `UNSAFE_PLACEMENT`). The written text equals `raw + "\r\n" + "x"`: the insert ending is the nearest earlier line's CRLF, and there is no final line break.

  These rows pass once Phase 3 is done. No production change is expected. If one fails, fix `_note-lines.ts`, not the test.

**Checkpoint**: FR-004 and FR-006 are pinned.

---

## Phase 7: User Story 4 — No silent corruption (Priority: P2)

**Goal**: `patch_heading` refuses any edit that would not keep the original bytes around the section, and writes nothing. Covers FR-009, FR-010 and FR-012.

**Independent Test**: `npx vitest run src/tools/patch_heading` passes U1 and S5 (`patch_heading`), with every pre-existing file unedited apart from T008.

### Tests for User Story 4 (write first; U1 must fail before T018)

- [X] T017 [P] [US4] Create `src/tools/patch_heading/handler.unsafe-placement.test.ts`.

  **Header**: `// Original — no upstream. Forces a wrong heading index through the real patch_heading handler to pin the UNSAFE_PLACEMENT refusal (spec 086 FR-009/FR-010, contracts/placement-contract.md U1).`

  Use `vi.mock("./heading-walk.js", async (importOriginal) => { … walkHeadings: (c, s) => { const r = m.walkHeadings(c, s); return r && { ...r, markerLineIndex: r.markerLineIndex + 1, reachStartLineIndex: r.reachStartLineIndex + 1 }; } … })`, keeping `parseHeadingPath` and `resolveHeadingIdentity` real. Then call `executePatchHeading` with `replace` on `Top#Last` of `HEADING_TEMPLATE`, and assert:
  - rejects with an `UpstreamError` with `code === "CLI_REPORTED_ERROR"`;
  - `details` toEqual `{ code: "UNSAFE_PLACEMENT", heading_path: "Top#Last", path: <relPath> }`;
  - the fake fs recorded exactly 1 read (the race re-read did not run), 0 writes and 0 renames.

### Implementation for User Story 4

- [X] T018 [US4] In `src/tools/patch_heading/handler.ts`, add the placement check immediately after `editedContent` is computed and before the race re-read (research D3):

  ```ts
  const markerLine = lines[resolved.markerLineIndex] ?? "";
  const markerText = lineText(markerLine);
  if (
    markerText !== resolved.markerLineText ||
    !keepsOriginalAround(originalContent, editedContent,
      lineStart(lines, resolved.markerLineIndex) + markerText.length,
      lineStart(lines, Math.min(resolved.reachEndLineIndex, lines.length)))
  ) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: { code: "UNSAFE_PLACEMENT", heading_path: input.heading_path, path: relPath },
      message: `Edit for heading "${input.heading_path}" could not be placed safely in "${relPath}"; the note was not changed. Re-read the note and retry once; if it fails again, report it.`,
    });
  }
  ```

  `REACH_END_EOF` is `Number.MAX_SAFE_INTEGER`, so `Math.min` clamps it. Import `lineText`, `lineStart` and `keepsOriginalAround`. In the header comment, add "→ placement check (UNSAFE_PLACEMENT, no write)" before "→ race-check", and add `UNSAFE_PLACEMENT` to its list of error states.
- [X] T019 [US4] In `src/tools/patch_heading/index.ts`, in `PATCH_HEADING_DESCRIPTION`'s "Typed errors via `UpstreamError.details.code`:" list, insert `` `UNSAFE_PLACEMENT` (note unchanged; re-read and retry once) `` after `` `HEADING_RACE` ``. In `src/tools/patch_heading/index.test.ts`, add one case (S5): the description contains `` `UNSAFE_PLACEMENT` `` after `Typed errors via`.
- [X] T020 [US4] In `docs/tools/patch_heading.md`:
  - add the contract's `UNSAFE_PLACEMENT` row to the Error states table, after `HEADING_RACE`;
  - in "Body-shape gotchas", replace the "Multi-line content" bullet's clause "the file's detected line ending is used on reassembly" with "the added lines take the heading line's line ending";
  - replace the "Line-ending preservation" bullet with: "**Line endings**: the note may mix LF and CRLF (a property edit can leave an LF frontmatter on a CRLF note). Every line outside the edit keeps its own line ending; lines the edit adds take the heading line's line ending (or, if the heading is the note's last line and has none, the nearest earlier line's; LF if the note has no line breaks). No normalisation."

  Then run `npx vitest run src/tools/patch_heading`. U1 and S5 pass, and the pre-existing files pass (apart from T008).

**Checkpoint**: all five stories are done. The FR-018 baseline gate is still red until T021.

---

## Phase 8: Polish & Cross-Cutting

- [X] T021 Run `npm run baseline:write`, then `git diff src/tools/_register-baseline.json` (contract S1). Exactly two lines may change: the `descriptionFingerprint` of `patch_heading` and of `patch_block`. If any other line moved, stop and find the cause; do not commit it. Then `npx vitest run src/tools/_register.test.ts src/tools/_surface.test.ts` must pass.
- [X] T022 [P] In `CHANGELOG.md`, under `## [Unreleased]`:
  - add the line `Spec 086-fix-section-replacement (BI-0168).` after the 085 line, following the existing pattern;
  - add a `### Fixed` entry in the style of the existing entries: "`patch_heading` and `patch_block` now place edits at the named heading or found block on notes that mix LF and CRLF line endings (for example after a property edit on a Windows note). Previously the edit could land further down the note and overwrite unrelated text while reporting success. Kept lines keep their line endings, and an edit that cannot be placed safely is refused with `CLI_REPORTED_ERROR` / `UNSAFE_PLACEMENT` without writing."
- [X] T023 Run the full gate: `npm run typecheck; if ($?) { npm run lint }; if ($?) { npm run format:check }; if ($?) { npm test }`. All must pass, including the coverage floor. Confirm `git diff --stat` shows these unchanged:
  - `src/errors.ts`;
  - `heading-walk.ts` and `block-scan.ts`;
  - both `schema.ts`;
  - `src/server.ts`;
  - both `handler.test.ts` and both `handler.bytes-written.test.ts` (contract S4, U3).
- [X] T024 Run the quickstart §1 red check:
  1. Temporarily restore the old split in `patch_heading/handler.ts`. H1–H5 must fail as `UNSAFE_PLACEMENT`.
  2. Also bypass the check. H1–H5 must fail on wrong bytes.
  3. Undo both.
  4. Repeat for `patch_block` (B1, B2).

  Record the outcomes in `post-implement.md`.
- [X] T025 Post-implement structural verification (CLAUDE.md; plan "CodeGraph structural check"). Run `codegraph sync`, then `codegraph_explore` on `_note-lines.ts`'s exports, `executePatchHeading` and `executePatchBlock`. Verify points 1–4 of the plan's list:
  - no new error code or class;
  - no DI-factory import;
  - `_note-lines.ts` imports nothing, and only the two handlers (plus tests) import it;
  - every export has a production caller;
  - no `detectLineEnding` remains in either tool.

  Record the result in `post-implement.md`.
- [X] T026 Optional: run the live check in quickstart §3, under `.memory/test-execution-instructions.md` (Sandbox only, focus check, clean up). Record run / not run and the outcome in `post-implement.md`. If it is not run, say so explicitly.

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2**: T002 and T003 run in parallel; T004 depends on T003.
- **Phase 2 blocks everything**: every handler task imports `_note-lines.ts` (T004), and every handler test imports `_line-ending-fixtures.ts` (T002).
- **US1 (Phase 3)**: T005 → T006 → T007 → T008.
- **US2 (Phase 4)**: depends on US1 (T006). It extends the same test file, so it is not parallel with T005 or T016.
- **US5 (Phase 5)**: depends only on Phase 2. It can run in parallel with Phases 3, 4, 6 and 7. T010 and T011 are [P]; then T012 → T013; T014 and T015 follow T012.
- **US3 (Phase 6)**: depends on US1. It shares the test file with T005 and T009, so it is sequential with them.
- **US4 (Phase 7)**: depends on US1 (T006 introduced `lines` / `editedContent` in their new form). T017 is [P] with the US3 work, but T018 edits the same handler as T006, so it runs after T006.
- **Polish**: T021 depends on T014 and T019, the two description edits. T022 is [P]. T023–T026 come last, in order.

### Parallel examples

```text
# After T004:
T005 (patch_heading line-endings tests)  ‖  T010 (patch_block line-endings tests)  ‖  T011 (patch_block unsafe test)
# After T008:
T009 (US2 rows) → T016 (US3 rows)        ‖  T012–T015 (patch_block fix)            ‖  T017 (patch_heading unsafe test)
```

## Implementation Strategy

1. **MVP**: Phases 1–3 (US1). `patch_heading` stops corrupting mixed notes. It is shippable alone, except for the FR-012 docs and the guard.
2. **Then**: US2 (the equivalence and uniform-byte anchors), and US5 (`patch_block`, the same corruption class).
3. **Then**: US3 (the terminator pins) and US4 (`patch_heading`'s refusal guard, its description and docs).
4. **Finish**: Polish. The baseline is regenerated once, after both description edits.

## Notes

- **CodeGraph task-pair check** (CLAUDE.md `/speckit-tasks` rule; this list crosses `patch_heading/`, `patch_block/` and the new `_note-lines.ts`). `codegraph_explore "executePatchHeading executePatchBlock walkHeadings applyReplace findBlock applyDetachReattach sizeChange writeAtomic"` at HEAD `926bac7` shows:
  - no call path between the two tools;
  - their only shared production dependencies are `_note-io.ts` (`writeAtomic`, `sizeChange`, `invalidateMetadataCache`), `_fs-errors.ts`, `_active-file.ts` and `UpstreamError`, none of which this feature edits.

  The new shared dependency, `_note-lines.ts`, is captured by the Phase 2 → all-stories edge. No further task-dependency note is needed.
- **Test edits** are limited to deletions: T008 and T013 remove the `detectLineEnding` blocks (owner approval is noted at plan review). Additions go to new files, plus one case in each `index.test.ts` (T014, T019).
- **`bytes_written`** is unchanged in meaning (`sizeChange(original, edited)`). The 075 uniform checks in `handler.bytes-written.test.ts` must pass unedited (§36).
- Commit after each checkpoint with `/speckit-git-commit`, if desired.
