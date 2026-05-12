---

description: "Task list for 020-fix-write-gaps — short-form resolution + FILE_EXISTS diagnostic enrichment"
---

# Tasks: Fix Write Gaps — Short-Form Resolution + FILE_EXISTS Diagnostic Enrichment

**Input**: Design documents from [/specs/020-fix-write-gaps/](./)
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED per Constitution Principle II — every public-surface modification ships with happy-path AND failure-or-boundary tests in the same change. Tests are co-located with sources (`*.test.ts` next to `*.ts`); the test inventory is locked at 8 NEW handler cases per [data-model.md test inventory](./data-model.md). The audit-confirmation T005 (a `grep -n "file:" handler.test.ts` check) verified zero existing cases use the `file` parameter, so no existing cases require updating.

**Organization**: Tasks are grouped by user story. Both stories are P1; MVP scope is US1 (short-form resolution — more visibly broken in the 016-shipped state). US1 and US2 edit the same `handler.ts` and `handler.test.ts` files but at different line ranges; each delivers its contract fix independently and can be implemented in either order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files OR independent logical-test additions in different `describe` blocks of the same file with no implementation dependencies).
- **[Story]**: `[US1]` (short-form resolution) or `[US2]` (FILE_EXISTS diagnostic enrichment) — maps to user stories in [spec.md](./spec.md).
- Each task description includes the exact file path.

## Path Conventions

Single-project layout. All paths in this file are written as **markdown link targets relative to this file's location** (`specs/020-fix-write-gaps/tasks.md`), e.g. `../../src/tools/write_note/handler.ts` resolves to `c:\Github\obsidian-cli-mcp\src\tools\write_note\handler.ts`. This is intentionally different from `plan.md`'s convention (which uses repo-root-relative paths like `src/tools/write_note/handler.ts`); both documents correctly point at the same files from their own document's viewport. This is the project's established precedent — see 019-list-files's `tasks.md` vs `plan.md` for the same asymmetry. When reading paths in this file, mentally resolve them from the `specs/020-fix-write-gaps/` directory.

---

## Phase 1: Setup (Shared Baseline)

**Purpose**: Confirm the current 016-shipped test suite state before introducing the fix, so any regression introduced during this BI is detectable against a green baseline.

- [ ] T001 Run `npm run test` and `npm run typecheck` against the 020-fix-write-gaps branch HEAD and record the pre-fix passing-case count for [src/tools/write_note/handler.test.ts](../../src/tools/write_note/handler.test.ts) (the file that gains the eight NEW cases in Phase 3 + Phase 4 — T005 audit-confirmation verified zero existing cases need updating). Confirm both commands exit zero. This establishes the green baseline against which the fix's regression guards (T005, T010, T011) operate.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: None for this BI. The two stories edit two different line ranges within the same `handler.ts` file with no shared blocking prereqs. The schema is frozen per FR-012; no new modules; no error-code or logger amendments; the write mechanism, path-safety, vault-registry, post-write metadataCache invalidation, and editor-open paths are all preserved per FR-017.

**⚠️ CRITICAL**: No foundational tasks. Phase 3 and Phase 4 may begin immediately after Phase 1 completes.

---

## Phase 3: User Story 1 — Short-form-name writes produce a properly-named markdown file (Priority: P1) 🎯 MVP

**Goal**: when `input.file` matches the canonical short-form shape (no `/` or `\` folder separator AND does not end in `.md`), the handler resolves the target to `<input.file>.md` at the vault root and the response's `path` field reports the resolved value. Any other `input.file` shape passes through verbatim per FR-001a. The `input.path` form is unchanged (regression-guarded). This restores the predecessor 011's behaviour that the 016 direct-fs rewrite inadvertently dropped.

**Independent Test**: against the updated handler with `nodeFs.writeFile` injected, call `executeWriteNote({ target_mode: "specific", vault: "V", file: "Acceptance Probe", content: "..." })`. Assert (a) `nodeFs.writeFile` receives a path ending in `Acceptance Probe.md`; (b) the returned response is `{ created: true, path: "Acceptance Probe.md" }`. Then repeat with `file: "Notes.md"` and `file: "Folder/Note"` to assert the FR-001a passthrough behaviour.

### Implementation for User Story 1

- [ ] T002 [US1] Add the `isCanonicalShortForm(file: string): boolean` file-local helper to [src/tools/write_note/handler.ts](../../src/tools/write_note/handler.ts) per [data-model.md predicate truth table](./data-model.md) and R2. The helper returns `true` iff `!file.includes("/") && !file.includes("\\") && !file.endsWith(".md")`. Three literal-character checks; no regex; no `path.extname` (internal periods are preserved by `endsWith(".md")`). Place above the existing handler entry point so it is visible to `resolveSpecificModePath`.
- [ ] T003 [US1] Add the `resolveSpecificModePath(input: WriteNoteInput): string` file-local helper to [src/tools/write_note/handler.ts](../../src/tools/write_note/handler.ts) per [contracts/write-note-handler-delta.contract.md helper contract](./contracts/write-note-handler-delta.contract.md). Branches: `input.path` supplied → return verbatim; else if `isCanonicalShortForm(input.file!)` → return `${input.file!}.md`; else → return `input.file!` verbatim. Pure function; no side effects; never throws. Depends on T002.
- [ ] T004 [US1] Replace the `relPath = (input.path ?? input.file)!` line at [src/tools/write_note/handler.ts:149](../../src/tools/write_note/handler.ts#L149) with `relPath = resolveSpecificModePath(input)`. Preserves the surrounding `else` branch (specific mode) and the upstream `vaultRoot` assignment. Depends on T003.
- [ ] T005 [US1] **Audit-confirmation gate**: confirm that the [src/tools/write_note/handler.test.ts](../../src/tools/write_note/handler.test.ts) suite contains ZERO existing test cases that pass the `file` parameter (the /speckit-analyze pre-audit verified this against the current branch HEAD — every existing case uses `path: "..."` exclusively, so the short-form rule introduces no broken-expectation cases). Verification command: `grep -n "file:" src/tools/write_note/handler.test.ts` — expected output is empty (no matches). If a `file:` reference is found (e.g. because a new case was added between plan time and implementation), update that case to assert the new FR-001 / FR-001a resolution behaviour. If the grep is empty (the expected state), T005 is satisfied with no edits. Depends on T004 only structurally — the audit can run before T004 lands.

### Tests for User Story 1

- [ ] T006 [P] [US1] Add **four** new handler test cases to [src/tools/write_note/handler.test.ts](../../src/tools/write_note/handler.test.ts) per [data-model.md test inventory cases #1–#4](./data-model.md):
  - **Case #1** — Canonical short-form happy path: `file: "Acceptance Probe"` → `nodeFs.writeFile` called with path ending in `"Acceptance Probe.md"`; response `{ created: true, path: "Acceptance Probe.md" }`. Covers FR-001 / FR-002 / FR-003 / Story 1 AC#1.
  - **Case #2** — Internal-period preservation: `file: "version_1.2.3"` → response `path: "version_1.2.3.md"`. Covers FR-001 invariant H6 (internal periods are part of the name) / Story 1 AC#5.
  - **Case #3** — FR-001a passthrough (ext-only edge): `file: "Notes.md"` → response `path: "Notes.md"` verbatim; on-disk path is `<vault-root>/Notes.md`. NO double-extension. Covers FR-001a / Story 1 AC#6.
  - **Case #4** — FR-001a passthrough (folder edge): `file: "Folder/Note"` → response `path: "Folder/Note"` verbatim; on-disk path is `<vault-root>/Folder/Note`. NO `.md` appended; folder NOT stripped to basename. Covers FR-001a / Story 1 AC#7.
- [ ] T007 [P] [US1] Add **one** path-form regression-guard handler test case to [src/tools/write_note/handler.test.ts](../../src/tools/write_note/handler.test.ts) per [data-model.md test inventory case #5](./data-model.md): `path: "Subfolder/Note.md"` → response `path: "Subfolder/Note.md"` verbatim (no double-extension, no `.md` re-append, no behavioural change from current 016 behaviour). Covers FR-004 / Story 1 AC#4 / SC-003.

**Checkpoint**: US1 is fully functional and testable independently. The MVP slice ships at this point: canonical short-form `file` writes produce properly-named markdown files; non-canonical `file` and all `path` writes pass through verbatim; existing 016 invariants (atomic write, path-safety, vault-registry, cache-freshness) are preserved.

---

## Phase 4: User Story 2 — Existing-file collision rejections carry the precise diagnostic indicator (Priority: P1)

**Goal**: when the `wx`-flag write rejects with EEXIST on the hot path, the rejection's `details` object gains `errno: "EEXIST"` alongside the existing `path` and `vault` fields. Additive enrichment per FR-007: existing fields preserved; `errno` added. Field-name parity with `FS_WRITE_FAILED`'s `details.errno` per FR-008. The `mapFsError` EEXIST path (rare mkdir/rename race) keeps its `{ errno }`-only shape per R4 (preserved asymmetry).

**Independent Test**: against the updated handler with `nodeFs.writeFile` injected to reject with `Object.assign(new Error("EEXIST"), { code: "EEXIST" })` when the `wx` flag is set, call `executeWriteNote({ target_mode: "specific", vault: "V", path: "Existing.md", content: "...", overwrite: false })`. Assert (a) the thrown `UpstreamError` has `code: "FILE_EXISTS"`; (b) `details` is exactly `{ errno: "EEXIST", path: "Existing.md", vault: "V" }`; (c) no temp-file unlink and no rename are issued.

### Implementation for User Story 2

- [ ] T008 [US2] Add `errno: "EEXIST"` to the `details` object on the hot-path FILE_EXISTS throw at [src/tools/write_note/handler.ts:208-213](../../src/tools/write_note/handler.ts#L208-L213). Specifically: change `details: { path: relPath, vault: input.vault ?? null }` to `details: { errno: "EEXIST", path: relPath, vault: input.vault ?? null }`. Preserve the `code`, `cause`, and `message` fields unchanged. Do NOT touch the `mapFsError` function at handler.ts:79-87 (R4 — preserved asymmetry). Do NOT touch the `wx`-flag write at handler.ts:205 (FR-009 atomicity preserved).

### Tests for User Story 2

- [ ] T009 [US2] Add **one** new handler test case to [src/tools/write_note/handler.test.ts](../../src/tools/write_note/handler.test.ts) per [data-model.md test inventory case #6](./data-model.md): FILE_EXISTS hot-path additive details assertion. Setup: `nodeFs.writeFile` rejects with `Object.assign(new Error("EEXIST: file already exists"), { code: "EEXIST" })` when the `wx` flag is set. Call handler with `{ target_mode: "specific", vault: "V", path: "Existing.md", content: "..." }` (overwrite defaults to `false`). Assert: thrown `UpstreamError` with `code: "FILE_EXISTS"`, `details: { errno: "EEXIST", path: "Existing.md", vault: "V" }`, and the existing message shape. Covers FR-007 / FR-008 / FR-009 / Story 2 AC#1.
- [ ] T010 [P] [US2] Add **one** `mapFsError` asymmetry-guard handler test case to [src/tools/write_note/handler.test.ts](../../src/tools/write_note/handler.test.ts) per [data-model.md test inventory case #7](./data-model.md): the separate `mapFsError` path that maps unexpected EEXIST from `mkdir` (or `rename`) to FILE_EXISTS keeps its single-field `{ errno: "EEXIST" }` details shape. Setup: `nodeFs.mkdir` rejects with EEXIST. Assert: thrown `UpstreamError` with `code: "FILE_EXISTS"`, `details: { errno: "EEXIST" }` (no `path` or `vault` fields — preserved asymmetry per [research.md decision R4](./research.md)). **Anchoring**: this task has no direct FR anchor; it lives at the intersection of research decision R4 (preserved asymmetry) and **Constitution Principle II** (Public Surface Test Coverage — NON-NEGOTIABLE: every public surface modification ships with happy-path AND failure-or-boundary tests in the same change). T010 is the boundary-test side of the symmetric-coverage requirement for US2's surface modification at handler.ts:208-213 — it guards against incidental scope creep that would widen `mapFsError` during the T008 edit.
- [ ] T011 [P] [US2] Add **one** overwrite-true success-envelope regression-guard handler test case to [src/tools/write_note/handler.test.ts](../../src/tools/write_note/handler.test.ts) per [data-model.md test inventory case #8](./data-model.md): `overwrite: true` against an existing target → success envelope with no `details.errno` in the response. Setup: `nodeFs.realpath(absPath)` succeeds (target exists), `nodeFs.writeFile` (to tmp) succeeds, `nodeFs.rename` succeeds. Call handler with `{ target_mode: "specific", vault: "V", path: "Existing.md", content: "new", overwrite: true }`. Assert: returns `{ created: false, path: "Existing.md" }`; no `UpstreamError` thrown; the response carries no `details.errno` field. Covers FR-010 / Story 2 AC#4 / SC-006.

**Checkpoint**: US2 is fully functional and testable independently. Together with US1, both contract gaps are closed; the full eight-case handler test inventory is in place; the existing 016 success and failure paths continue to work as before for unaffected inputs.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Help update per FR-018, version bump per R15, CHANGELOG, quality gates, manual verification per SC-002.

- [ ] T012 [P] Update [docs/tools/write_note.md](../../docs/tools/write_note.md) per FR-018 / R14 with **two** short callouts under existing sections:
  - **Callout (a)** under the input contract section: canonical short-form `file` shape definition (no folder separator, not ending in `.md`); worked example `file: "Daily Note"` → on-disk `<vault-root>/Daily Note.md`, response `path: "Daily Note.md"`; non-canonical-passthrough note (`file: "Notes.md"` or `file: "Folder/Note"` pass through verbatim — caller responsible for canonical shape if `.md` resolution is wanted).
  - **Callout (b)** under the error roster section on the FILE_EXISTS row: rejection shape `details: { errno: "EEXIST", path: <vault-relative path>, vault: <vault name|null> }` with explicit note that the `details` enrichment is additive (existing `path` and `vault` fields preserved alongside `errno`) and that the `errno` field name matches `FS_WRITE_FAILED`'s `details.errno` convention.
- [ ] T013 Run all quality gates against the post-implementation branch HEAD: `npm run lint` (zero warnings per Constitution Workflow gate 1), `npm run typecheck` (per gate 2), `npm run build` (per gate 3), `npm run test` (per gate 4 — all handler test cases pass including the eight new / updated cases from Phase 3 + Phase 4), and inspect the aggregate statements coverage figure in the vitest output (per gate 5 — must not drop below the [vitest.config.ts](../../vitest.config.ts) floor). Record the post-fix coverage figure and confirm it is equal to or higher than the T001 baseline figure.
- [ ] T014 Update [CHANGELOG.md](../../CHANGELOG.md) under the "Unreleased" section (or the patch-bump section if T015 lands first) with one entry naming both fixes: short-form `file` resolution restored to vault-root `<file>.md` behaviour; FILE_EXISTS rejections gain `details.errno: "EEXIST"` per field-name parity with `FS_WRITE_FAILED`. Reference 016-reliable-writer as the predecessor whose overhaul introduced the gaps.
- [ ] T015 Bump version in [package.json](../../package.json) by patch (e.g. `0.4.2` → `0.4.3`) per R15 — additive on `details.errno`; contract-restorative on short-form resolution; no breaking changes. Optional task; CHANGELOG entry from T014 can refer to the bumped version once this lands.
- [ ] T016 Run the **inspection** quickstart scenarios S-7 through S-11 from [quickstart.md](./quickstart.md) at PR-review time: S-7 (field-name parity in source by grep), S-8 (error code roster diff-free via `git diff main..HEAD -- src/logger.ts src/errors.ts`), S-9 (input contract diff-free via `git diff main..HEAD -- src/tools/write_note/schema.ts src/tools/write_note/schema.test.ts src/target-mode/`), S-10 (other tools diff-free via per-peer `git diff main..HEAD -- src/tools/<peer>/ docs/tools/<peer>.md`), S-11 (help update coverage by reading the post-T012 `docs/tools/write_note.md`). Record results in the PR description.
- [ ] T017 **⚠️ MERGE GATE — operator-gated manual verification REQUIRED before approving the PR**. SC-002 is the only success criterion in this BI that cannot be unit-tested (Obsidian-side recognition is opaque to vitest mocks); T017 is its sole verification path. Run the **manual live-Obsidian** quickstart scenario S-2 from [quickstart.md](./quickstart.md) against the authorised test vault per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md), inside the authorised scratch subdirectory only. Steps: (1) open the test vault in Obsidian; (2) from an MCP client, call `write_note` with a canonical short-form `file` and the path scoped to the scratch subdirectory; (3) verify the file appears in the file explorer with the `.md` extension; (4) verify `app.vault.getMarkdownFiles().some(...)` returns `true` from the Obsidian developer console; (5) create a linking note with `[[<canonical short-form value>]]` and verify the wikilink resolves to the new file (not broken-link styling); (6) delete the probe file and the linking note per the cleanup protocol. Record the verification outcome in the PR description with a `S-2: PASS` (or `FAIL` with diagnostics). The merging reviewer MUST confirm this is present and PASS before approving.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 establishes the green baseline. No code dependencies; must complete first.
- **Foundational (Phase 2)**: empty for this BI. Phase 3 and Phase 4 can begin immediately after Phase 1.
- **User Stories (Phase 3 & Phase 4)**: both depend on Phase 1's green baseline; neither blocks the other. Either may be implemented first. MVP scope is US1; US2 may be added incrementally or land in the same change.
- **Polish (Phase 5)**: T012 / T014 / T015 depend on US1 + US2 implementation completion. T013 runs after all implementation is in. T016 / T017 run at PR-review / pre-merge time.

### Within Phase 3 (US1)

- T002 → T003 → T004 (helper definitions then call-site rewire — sequential).
- T005 depends on T004 (audit existing tests AFTER the call-site rewire lands so failing cases surface).
- T006 / T007 are independent test additions ([P] — different `describe` blocks within the same `handler.test.ts` file); may run in parallel after T004 lands.

### Within Phase 4 (US2)

- T008 is a single-line edit; no internal dependencies within US2.
- T009 / T010 / T011 are independent test additions ([P] — different `describe` blocks within the same `handler.test.ts` file); may run in parallel after T008 lands.

### Within Phase 5 (Polish)

- T012 ([P] — different file from source edits) is independent of T013 / T014 / T015.
- T013 must run after all implementation tasks (T002–T011) complete.
- T014 is independent; can land any time after US1 / US2 work begins.
- T015 is optional; if landed, T014's CHANGELOG entry should reference the bumped version.
- T016 / T017 run at PR-review / pre-merge time.

### Parallel Opportunities

- Within Phase 3 after T004: T006 ‖ T007 (4 + 1 = 5 test cases authored independently).
- Within Phase 4 after T008: T009 ‖ T010 ‖ T011 (3 test cases authored independently).
- US1's polish task T012 (docs) can run in parallel with US2's implementation T008 (different files).
- US1 ‖ US2 implementations theoretically possible (different line ranges in `handler.ts`), but US1 lands the new `relPath` flow that US2's tests then need to use; pragmatically US1 lands first for the MVP slice.

---

## Parallel Example: User Story 1 tests

```bash
# After T004 lands, authoring the five new US1 test cases can fan out:
Task: "T006 — Add four canonical/internal-period/passthrough test cases in handler.test.ts"
Task: "T007 — Add path-form regression-guard test case in handler.test.ts"
```

## Parallel Example: User Story 2 tests

```bash
# After T008 lands, authoring the three new US2 test cases can fan out:
Task: "T009 — Add FILE_EXISTS additive details test case in handler.test.ts"
Task: "T010 — Add mapFsError asymmetry-guard test case in handler.test.ts"
Task: "T011 — Add overwrite-true success-envelope test case in handler.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: T001 — green baseline confirmed.
2. Complete Phase 3 (US1): T002 → T003 → T004 → T005, then T006 ‖ T007.
3. Run `npm run test` — confirm all US1 cases pass plus the regression-guard case for `path` form.
4. **STOP and VALIDATE**: short-form-name writes produce properly-named markdown files; existing path-based writes are unaffected; existing handler tests for unrelated paths still pass.

The MVP at this point delivers the more visibly-broken fix (file explorer hides extension-less files; wikilinks can't resolve). US2 can be added in the same change or as a follow-up.

### Incremental Delivery

1. Phase 1 + Phase 3 → US1 ships → restored short-form-name resolution. Demo: file explorer shows the new file with extension; wikilink resolves.
2. Phase 4 → US2 ships → restored FILE_EXISTS diagnostic. Demo: caller branching on `response.details.errno === "EEXIST"` works.
3. Phase 5 → docs, version bump, manual verification.

Both stories share `handler.ts` and `handler.test.ts`, so each story's "ship" is a commit, not a separate release. The release-ready change includes US1 + US2 + polish; the MVP semantics describe the value-delivery order within the BI, not the release boundary.

### Parallel Team Strategy

With multiple developers:

1. Developer A: Phase 1 baseline + Phase 3 (US1) implementation T002–T005.
2. Developer B: Phase 4 (US2) implementation T008 (after Developer A's T004 lands so the merge has a clean base).
3. Developer C: T006 ‖ T007 ‖ T009 ‖ T010 ‖ T011 — test cases authored in parallel after their respective implementation tasks land.
4. Developer D: T012 (docs) ‖ T014 (CHANGELOG) ‖ T015 (version bump) any time after US1 / US2 implementation begins.

Pragmatically, this BI is small enough for one developer to complete in one pass.

---

## Notes

- [P] tasks = independent logical-test additions that can be authored in parallel (the same file may receive parallel additions in different `describe` blocks; git merges them cleanly if separated by non-trivial line distance).
- [Story] label maps task to specific user story for traceability.
- Each user story is independently completable and testable. US1 alone restores short-form resolution; US2 alone restores precise FILE_EXISTS diagnostic; either is a valid partial ship.
- Verify tests fail before implementing (TDD): add the new test cases (T006 / T007 / T009–T011) BEFORE the implementation tasks (T002 / T003 / T004 / T008) land in the file, or write them in a paired commit so the failure → success transition is reviewable.
- Commit after each phase or logical group; the project's CONTRIBUTING.md style prefers cohesive commits with FR / SC / T-ID references in the body.
- Stop at any checkpoint to validate the story independently.
- Avoid: vague tasks, scope creep into the frozen surfaces (schema, error roster, write mechanism, other tools), cross-story dependencies that break independence.
