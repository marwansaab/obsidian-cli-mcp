---

description: "Task list for 079-clarify-heading-paths"
---

# Tasks: Clarify heading-path rules

**Input**: Design documents from `specs/079-clarify-heading-paths/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/heading-path-wording-contract.md](contracts/heading-path-wording-contract.md), [quickstart.md](quickstart.md)

**Tests**: requested. Spec FR-013 requires a check that fails if the rule, the unreachable-section statement or the heading-not-found guidance is removed from either tool, and Constitution Principle II requires co-located tests for every modified tool. In each story the test tasks come first and must fail before the matching text task.

**Organization**: tasks are grouped by user story. Each story adds its own sentence group to the descriptions (contract §2: S-rule in US1, S-unreach in US2, S-cause in US3) and its own help-page sections. The stories edit the same few constants and pages, so they run in sequence (P1 → P2 → P3). Within a story, a `read_heading` task and its `patch_heading` twin touch different files and can run in parallel.

**Scope rule (spec Clarifications, contract §4)**: change only `.describe()` strings, the two `*_DESCRIPTION` constants, the two help pages, tests, the baseline and the CHANGELOG. Never edit `validateHeadingPath`, `headingPathField`'s messages, either `handler.ts`, `_template.ts`, `heading-walk.ts` or `body-edit.ts`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story the task serves (US1–US5)

---

## Phase 1: Setup

**Purpose**: confirm a green starting point so later failures are attributable.

- [ ] T001 Run `npm run typecheck`, `npm run lint` and `npm test` at HEAD on branch `079-clarify-heading-paths` and record that all pass (repo root)

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: pin the behaviour the new documentation describes, so the docs cannot drift from the code (research D5, data-model I4). These tests pin existing behaviour and should pass on the first run. If any fails, stop: the documentation premise is wrong and the spec must be revisited.

- [ ] T002 Add five characterisation cases to `src/tools/patch_heading/heading-walk.test.ts`, inside the existing `walkHeadings` describe block and in the file's style:
  - (a) `walkHeadings("# Top\n## Section\n### Subsection\n", ["Section", "Subsection"])` returns `null` (level-1 segment left out).
  - (b) `walkHeadings("# Top\n### Sub\n", ["Top", "Sub"])` returns `null` (skipped level).
  - (c) `walkHeadings("## Section\n### Sub\n", ["Section", "Sub"])` returns `null` (no level-1 heading).
  - (d) `walkHeadings("# Top\n## Sub\n#### Deep\n", ["Top", "Sub"])` resolves with `rank: 2` (a skip below the target does not block it).
  - (e) `walkHeadings("# A\n## X\n# B\n## Sub\n", ["B", "Sub"])` resolves with `rank: 2` (a path may start at a second level-1 heading).

  Run `npx vitest run src/tools/patch_heading/heading-walk.test.ts`; all must pass.

**Checkpoint**: the rule in data-model R1–R3 is pinned for `patch_heading`. `read_heading`'s rule is pinned live in T038.

---

## Phase 3: User Story 1 - Rule stated plainly (Priority: P1) 🎯 MVP

**Goal**: both tools' description, heading parameter description and help page state that the path starts at the level-1 heading and goes one level per segment (FR-001–FR-006; contract §1 L1/L2, §2 S-rule, §3 H1–H2).

**Independent Test**: each tool's description, parameter description and help page contains contract phrases L1 (`level-1 heading`) and L2 (`one level below the previous`). Neither description nor parameter description contains `top-level headings are out of scope`. On the help pages that phrase appears only inside the verbatim frozen validation message (contract §4), which is followed at once by a note that it means addressing the level-1 heading on its own and that every path starts at the level-1 heading (contract §1 exception, §3 H2).

### Tests for User Story 1

- [ ] T003 [P] [US1] In `src/tools/read_heading/index.test.ts`, add a `describe("heading-path rule wording (079)")` block. Assert:
  - `READ_HEADING_DESCRIPTION` contains `level-1 heading` and `one level below the previous`;
  - the published `inputSchema.properties.heading.description` (from `createReadHeadingTool(...).descriptor.inputSchema`) contains both phrases;
  - `docs/tools/read_heading.md`, read via the existing `import.meta.url` pattern at line ~100, contains a `Heading-path rule` heading and both phrases.

  Confirm the new assertions fail before T005/T006/T009.
- [ ] T004 [P] [US1] In `src/tools/patch_heading/index.test.ts`, add the same `describe("heading-path rule wording (079)")` block for `PATCH_HEADING_DESCRIPTION`, `inputSchema.properties.heading_path.description` and `docs/tools/patch_heading.md`. Also assert:
  - neither `PATCH_HEADING_DESCRIPTION` nor the `heading_path` parameter description contains `top-level headings are out of scope` or `Minimum two segments`;
  - in `docs/tools/patch_heading.md`, the number of occurrences of `top-level headings are out of scope` equals the number of occurrences of the full frozen message `heading_path must contain at least two segments separated by '#'; top-level headings are out of scope` (each occurrence is a verbatim quote);
  - the 400 characters after each full-message occurrence contain `level-1 heading`.

  Confirm the new assertions fail before T007/T008/T010.

### Implementation for User Story 1

- [ ] T005 [P] [US1] In `src/tools/read_heading/index.ts`, in `READ_HEADING_DESCRIPTION`, replace `The heading field is a \`::\`-separated path with at least two non-empty segments (e.g. "H1::H2" or "H1::H2::H3"); ` with the contract §2 S-rule text for `read_heading` (from "The heading field is a `::`-separated path that starts at the note's level-1 heading" through "…even though both headings exist."). Then turn the remaining clause into its own interim sentence, `Single-segment H1-only reads, headings whose text contains \`::\` literally, and Setext-style headings are out-of-reach (documented fallback: full-file read_note plus client-side parse).`, which T014 replaces. Leave the rest of the string unchanged. Keep `Setext` and the `::`-literal case so the existing assertions at `index.test.ts:43` and `:118` still pass.
- [ ] T006 [P] [US1] In `src/tools/read_heading/schema.ts`, replace only the `heading` field's `.describe(...)` text with the contract §2 `read_heading` parameter description. Do not touch `validateHeadingPath` or its messages.
- [ ] T007 [P] [US1] In `src/tools/patch_heading/index.ts`, in `PATCH_HEADING_DESCRIPTION`, replace `**Minimum two segments** — top-level headings are out of scope (the wrapper exposes no top-level patch surface; use \`write_note\` for that).` with the contract §2 S-rule text for `patch_heading` (from "The path starts at the note's level-1 heading" through "…even though both headings exist."). Keep the opening "`heading_path` uses `#` as the segment separator.", "First match wins on duplicate sibling headings." and, for now, "Headings whose literal text contains `#` are permanently unreachable through this tool." (T015 replaces it). Escape backticks as the template literal requires.
- [ ] T008 [P] [US1] In `src/tools/patch_heading/schema.ts`, replace only the `heading_path` `.describe(...)` text with the contract §2 `patch_heading` parameter description, keeping the `${HEADING_PATH_MAX}` interpolation. Do not touch `headingPathField` or its messages.
- [ ] T009 [P] [US1] In `docs/tools/read_heading.md`, add a `### Heading-path rule` subsection under *Input schema*, before *Heading-path validator* (contract §3 H1–H2). It states L1 and L2 and gives a mapping block: `"Project::Tasks::Today" → # Project / ## Tasks / ### Today` plus a two-segment line. Rewrite the validator paragraph and the `heading` field row so "at least two segments" reads as "the target is level 2 or deeper, and the path names the level-1 heading first". Quote the unchanged `validateHeadingPath` one-segment message verbatim in a code span, and follow it immediately with a sentence saying that it refers to addressing the level-1 heading on its own and that every path starts at the level-1 heading.
- [ ] T010 [P] [US1] In `docs/tools/patch_heading.md`, add a `### Heading-path rule` subsection at the top of *The heading_path locator* (contract §3 H1–H2), with the same rule and mapping (using `#`). Rewrite the `heading_path` field row (`≥2 segments`) and the constraint bullet "**Minimum two segments** — top-level headings (a path that addresses a `# H1` directly) are out of scope…" so they explain the minimum as "the target is level 2 or deeper, and the path names the level-1 heading first". In that bullet, quote the frozen `single-segment` message verbatim in a code span: `heading_path must contain at least two segments separated by '#'; top-level headings are out of scope`. Follow it immediately with: "This message refers to addressing a level-1 heading on its own (a one-segment path); it does not mean the level-1 heading is left out — every path still starts at the level-1 heading." This quote is the only place on the page where `top-level headings are out of scope` may appear (contract §1 exception).
- [ ] T011 [US1] Run `npx vitest run src/tools/read_heading src/tools/patch_heading`. T003/T004 now pass, and every pre-existing test still passes (depends on T003–T010).

**Checkpoint**: an agent reading either tool's description or parameter description gets its first path right.

---

## Phase 4: User Story 2 - Unreachable sections named (Priority: P2)

**Goal**: both descriptions and help pages name the unreachable sections and the whole-note alternative (FR-007, FR-008; contract §2 S-unreach, §3 H3–H4).

**Independent Test**: each description and help page contains L3 (`no level-1 heading`) and L4 (`skipped level`) and names `read` (read_heading) or `write_note` (patch_heading) as the alternative.

### Tests for User Story 2

- [ ] T012 [P] [US2] In `src/tools/read_heading/index.test.ts`, extend the 079 block. `READ_HEADING_DESCRIPTION` and `docs/tools/read_heading.md` each contain `no level-1 heading`, `skipped level` and `` `read` ``, and the description no longer contains `read_note`. Confirm these fail before T014/T016.
- [ ] T013 [P] [US2] In `src/tools/patch_heading/index.test.ts`, extend the 079 block. `PATCH_HEADING_DESCRIPTION` and `docs/tools/patch_heading.md` each contain `no level-1 heading`, `skipped level` and `write_note`, and `docs/tools/patch_heading.md` does not contain `wrap the top-level heading in a parent`. Confirm these fail before T015/T017.

### Implementation for User Story 2

- [ ] T014 [P] [US2] In `src/tools/read_heading/index.ts`, replace the interim sentence from T005 ("Single-segment H1-only reads, … plus client-side parse).") with the contract §2 S-unreach sentence for `read_heading`, which starts "Unreachable:" and ends "…use `read` for the whole note instead." This also replaces the stale `read_note` with `read`.
- [ ] T015 [P] [US2] In `src/tools/patch_heading/index.ts`, remove "Headings whose literal text contains `#` are permanently unreachable through this tool." and insert the contract §2 S-unreach sentence for `patch_heading`, which starts "Unreachable:" and ends "…use `write_note` to rewrite the whole note instead.", directly before "First match wins on duplicate sibling headings." The paragraph order then matches contract §2.
- [ ] T016 [P] [US2] In `docs/tools/read_heading.md`, rewrite the "out-of-reach" list under *Heading-path validator* as an *Unreachable sections* list (contract §3 H3–H4, data-model U1–U5). It covers:
  - a level-1 section by itself;
  - a note with no level-1 heading;
  - a section below a skipped level (example: `### Orphan` directly under `# Other`);
  - the literal-`::` case;
  - Setext headings.

  Give each the fallback [`read`](./read.md). After the list, add: "A skipped level only blocks the sections at and below the skip on that branch: a skip below the target (for example a `####` directly under the `##` you want), or a skip in another branch of the note, does not block the target. When a note has several level-1 headings, a path may start at any of them."
- [ ] T017 [P] [US2] In `docs/tools/patch_heading.md`, add an *Unreachable sections* list to *The heading_path locator*. It covers:
  - a level-1 section by itself;
  - a note with no level-1 heading;
  - a section below a skipped level (example: `### Orphan` directly under `# Other`);
  - headings whose literal text contains `#` (move the existing bullet here).

  Give each the fallback [`write_note`](./write_note.md). After the list, add the same sentence as T016: "A skipped level only blocks the sections at and below the skip on that branch: a skip below the target (for example a `####` directly under the `##` you want), or a skip in another branch of the note, does not block the target. When a note has several level-1 headings, a path may start at any of them." Replace the routing-table row at line 18 with the contract §3 text: "Patch a level-1 section (one-segment path) or any unreachable section | Not addressable by `patch_heading`; use `write_note` to rewrite the whole note."
- [ ] T018 [US2] Run `npx vitest run src/tools/read_heading src/tools/patch_heading`; T012/T013 pass (depends on T012–T017).

**Checkpoint**: an agent working on a note with no level-1 heading, or with a skipped level, is told to stop and use the whole-note tool.

---

## Phase 5: User Story 3 - Error guidance names the cause (Priority: P2)

**Goal**: in both descriptions and help pages, the heading-not-found guidance names "leaves out the level-1 heading or skips a level" before `outline` (FR-009; contract §1 L5, §2 S-cause, §3 H5).

**Independent Test**: in each description and help page, L5 appears inside the heading-not-found guidance at a lower index than the first `outline` mention in that guidance.

### Tests for User Story 3

- [ ] T019 [P] [US3] In `src/tools/read_heading/index.test.ts`, extend the 079 block. In `READ_HEADING_DESCRIPTION`, assert that `leaves out the level-1 heading or skips a level` occurs and that its index is lower than the index of the following `outline`. In `docs/tools/read_heading.md`, find the error-table line containing `HEADING_NOT_FOUND` and assert the same ordering within that line. Confirm these fail before T021/T023.
- [ ] T020 [P] [US3] In `src/tools/patch_heading/index.test.ts`, extend the 079 block with the same ordering assertions for the `HEADING_NOT_FOUND` entry in `PATCH_HEADING_DESCRIPTION` (the substring starting at `` `HEADING_NOT_FOUND` (``) and for the `HEADING_NOT_FOUND` row of the error-states table in `docs/tools/patch_heading.md`. Confirm these fail before T022/T024.

### Implementation for User Story 3

- [ ] T021 [P] [US3] In `src/tools/read_heading/index.ts`, insert the contract §2 S-cause sentence for `read_heading` ("On HEADING_NOT_FOUND the path most often leaves out the level-1 heading or skips a level; check that first, then list the note's headings with `outline`.") directly after the S-unreach sentence from T014.
- [ ] T022 [P] [US3] In `src/tools/patch_heading/index.ts`, in the typed-errors paragraph of `PATCH_HEADING_DESCRIPTION`, replace the `HEADING_NOT_FOUND` entry with the contract §2 S-cause entry.
- [ ] T023 [P] [US3] In `docs/tools/read_heading.md`, rewrite the Recovery cell of the `HEADING_NOT_FOUND` error-table row to: "Most often the path leaves out the level-1 heading or skips a level; check that first. Then use [`outline`](./outline.md) to list the file's headings and retry." Update Example 5's closing sentence the same way. Runtime messages stay unchanged.
- [ ] T024 [P] [US3] In `docs/tools/patch_heading.md`, rewrite the Trigger cell of the `HEADING_NOT_FOUND` row in *Error states* the same way, and add a line with the same guidance under the *Heading-not-found error envelope* worked example.
- [ ] T025 [US3] Run `npx vitest run src/tools/read_heading src/tools/patch_heading`; T019/T020 pass (depends on T019–T024).

**Checkpoint**: an agent that hits heading-not-found corrects the path from the guidance alone.

---

## Phase 6: User Story 4 - Worked examples (Priority: P3)

**Goal**: each help page shows a three-segment path from level 1 to level 3, and the failing shorter path with its heading-not-found result (FR-010; contract §3 H6).

**Independent Test**: each help page contains a three-segment example and an example whose path omits the level-1 segment and shows `HEADING_NOT_FOUND`.

### Tests for User Story 4

- [ ] T026 [P] [US4] In `src/tools/read_heading/index.test.ts`, extend the 079 block. `docs/tools/read_heading.md` contains `"Best Practices::Naming::Casing"` and `"Naming::Casing"`, and has an example heading matching `/### Example \d+ — .*level-1/i`. Confirm these fail before T028.
- [ ] T027 [P] [US4] In `src/tools/patch_heading/index.test.ts`, extend the 079 block. `docs/tools/patch_heading.md` contains `"Daily#Tasks#TODO"` and `"Tasks#TODO"`, and has a worked-example heading containing `level-1`. Confirm these fail before T029.

### Implementation for User Story 4

- [ ] T028 [P] [US4] In `docs/tools/read_heading.md`, add `### Example 6 — Level-1 segment left out (heading-not-found)`. Show `heading: "Naming::Casing"` on the Example 2 note, state that it returns `CLI_REPORTED_ERROR` with `details.code: "HEADING_NOT_FOUND"` although both headings exist, and give the corrected path `"Best Practices::Naming::Casing"`. Example 2 already shows the three-segment shape; add a one-line note there that it runs from level 1 to level 3.
- [ ] T029 [P] [US4] In `docs/tools/patch_heading.md`, under *Worked examples*, add `### Level-1 segment left out (heading-not-found)`. Show `heading_path: "Tasks#TODO"` against the `Daily Notes/2026-05-21.md` note, the resulting `HEADING_NOT_FOUND` envelope (message `Heading "Tasks#TODO" not found in "Daily Notes/2026-05-21.md"`, exactly as the unchanged handler emits it), and the corrected `Daily#Tasks#TODO`. Add a one-line note to *Append a new TODO bullet* that `Daily#Tasks#TODO` runs from level 1 to level 3.
- [ ] T030 [US4] Run `npx vitest run src/tools/read_heading src/tools/patch_heading`; T026/T027 pass (depends on T026–T029).

**Checkpoint**: the examples show both the right shape and the common wrong one.

---

## Phase 7: User Story 5 - No other capability left misleading (Priority: P3)

**Goal**: no occurrence of the misleading wording remains anywhere in published documentation (FR-011; contract §1 forbidden list and exception).

**Independent Test**: a repository search for the forbidden phrases finds only the frozen runtime messages (contract §4), the verbatim quote on the patch_heading help page (contract §1 exception) and spec artifacts.

- [ ] T031 [US5] Search `src/**/*.ts` (excluding tests), `docs/**`, `README.md`, `CONTRIBUTING.md` and the server instructions in `src/server.ts` for: `top-level headings are out of scope`, `Minimum two segments`, `at least two`, `≥2 segments`, `two segments`, `top-level heading` and `read_note`. Each remaining hit must be one of:
  - the frozen `single-segment` message in `src/tools/patch_heading/schema.ts`;
  - the frozen `validateHeadingPath` message in `src/tools/read_heading/schema.ts`;
  - the verbatim quotes of those messages on the help pages, each followed by the level-1 note (contract §3 H2);
  - the unchanged `// Original — no upstream.` header lines (accurate: they describe the validator);
  - the retired-name list in `src/tools/help/handler.test.ts`;
  - text that explains the minimum per contract §3 H2.

  Fix any other hit in the same change, and record the result for the PR description.

---

## Phase 8: Polish & cross-cutting

- [ ] T032 Run `npm run baseline:write`, then `git diff src/tools/_register-baseline.json`. Only the `descriptionFingerprint` and `schemaFingerprint` of `read_heading` and `patch_heading` may change (contract §5). Commit the regenerated `src/tools/_register-baseline.json`.
- [ ] T033 [P] In `CHANGELOG.md` under `## [Unreleased]`, add `Spec 079-clarify-heading-paths.` after the 078 line. Under `### Changed`, add this bullet: "**`read_heading` and `patch_heading` document the heading-path rule.** Their descriptions, parameter descriptions and reference pages now state that a path starts at the note's level-1 heading and names one heading per level. They list the sections no path can reach (no level-1 heading, a skipped level, a level-1 section by itself) with the whole-note alternative, and name the most common cause of `HEADING_NOT_FOUND`. Behaviour, error codes and messages are unchanged."
- [ ] T034 Reviewer check of the published text against spec SC-001, SC-003 and SC-004, which are reviewer-judged, not agent trials. Read the final `READ_HEADING_DESCRIPTION`, `PATCH_HEADING_DESCRIPTION`, both heading parameter descriptions and both help pages, and confirm:
  - (SC-001) a level-2 and a level-3 path under a level-1 heading can be written correctly from the description and parameter description alone;
  - (SC-003) each help page states that sections in a note with no level-1 heading, or below a skipped level, cannot be addressed, and names the whole-note alternative;
  - (SC-004) the heading-not-found guidance names the missing level-1 segment or skipped level before any other step.

  Record a pass or fail line per criterion under *SC review* in this file's Notes section and carry it into the PR description.
- [ ] T035 Run the full gate: `npm run typecheck`, `npm run lint`, `npm test` (quickstart §1). All pass, and existing tests were changed only by additions.
- [ ] T036 Verify that runtime text is untouched (contract §4, data-model I5). `git diff --stat` shows no change to `src/tools/read_heading/handler.ts`, `src/tools/read_heading/_template.ts`, `src/tools/patch_heading/handler.ts`, `src/tools/patch_heading/heading-walk.ts` or `src/tools/patch_heading/body-edit.ts`, and `git diff src/tools/*/schema.ts` touches only the `.describe(...)` lines.
- [ ] T037 Post-implement structural verification (plan *CodeGraph structural check*). Run `codegraph sync`, then `codegraph_explore "READ_HEADING_DESCRIPTION PATCH_HEADING_DESCRIPTION readHeadingInputSchema patchHeadingInputSchema"`. Confirm there is no new symbol or import, no change to `src/errors.ts`, `src/server.ts` or any kernel node (`createServer`, `createLogger`, `createQueue`, `UpstreamError`), and nothing orphaned.
- [ ] T038 Live check per `specs/079-clarify-heading-paths/quickstart.md` §3. First read `.memory/test-execution-instructions.md`, and use only `TestVault-Obsidian-CLI-MCP` with fixtures under `Sandbox/`. Run `npm run build`, then cases 1–8. Report cases attempted, passing and failing, quote failures verbatim, and delete both fixtures afterwards. Cases 1–4 are the only pin for `read_heading`'s rule (research F1).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)**: none.
- **Foundational (T002)**: after T001. It blocks every story, because a failure here invalidates the documentation premise.
- **US1 (T003–T011)**: after T002. It adds S-rule and leaves interim sentences that US2 replaces (T005 → T014, T007 → T015).
- **US2 (T012–T018)**: after US1 (same constants, test files and help pages).
- **US3 (T019–T025)**: after US2. T021 inserts S-cause after the S-unreach sentence that T014 writes.
- **US4 (T026–T030)**: after US3 (same test files and help pages).
- **US5 (T031)**: after US4 (it sweeps the final text).
- **Polish (T032–T038)**: after US5. T032 must follow every `src/**` text change, T034 needs the final text, and T038 needs the build.

### Cross-module note (CodeGraph)

The task list crosses two source modules, `src/tools/read_heading/` and `src/tools/patch_heading/`. A `codegraph_explore` query on `createReadHeadingTool` and `createPatchHeadingTool` shows no import or call path between them. Both are reached only from `src/server.ts` and `src/tools/_typed-result-fixtures.ts`, and neither of those reads description text. The `[P]` twins across the two modules therefore have no hidden dependency. The only shared artefact is `src/tools/_register-baseline.json`, regenerated once in T032 after all text changes.

### Parallel opportunities

- Within each story, every `read_heading` task can run alongside its `patch_heading` twin: T003/T004, T005–T010, T012/T013, T014–T017, T019/T020, T021–T024, T026/T027, T028/T029.
- T033 (CHANGELOG) can run in parallel with T032.

---

## Parallel Example: User Story 1

```text
Task: "T003 read_heading 079 wording tests in src/tools/read_heading/index.test.ts"
Task: "T004 patch_heading 079 wording tests in src/tools/patch_heading/index.test.ts"

Task: "T005 S-rule in READ_HEADING_DESCRIPTION, src/tools/read_heading/index.ts"
Task: "T006 heading .describe in src/tools/read_heading/schema.ts"
Task: "T007 S-rule in PATCH_HEADING_DESCRIPTION, src/tools/patch_heading/index.ts"
Task: "T008 heading_path .describe in src/tools/patch_heading/schema.ts"
Task: "T009 Heading-path rule section in docs/tools/read_heading.md"
Task: "T010 Heading-path rule section in docs/tools/patch_heading.md"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. T001–T002: green start, behaviour pinned.
2. T003–T011: the rule is stated in the descriptions, parameter descriptions and help pages. This alone removes the main cause of failed first calls.
3. Stop and validate. If shipping the MVP alone, run T032 (baseline) and T035 (gate).

### Incremental delivery

US1 (rule) → US2 (unreachable sections) → US3 (error guidance) → US4 (examples) → US5 (sweep) → Polish. Each story adds its own description sentence group or help-page sections, plus assertions that fail if that text is removed (FR-013).

---

## Notes

- Write normal prose in all source strings and docs (CLAUDE.md artifact rule); the descriptions are durable artifacts.
- Keep edits surgical: don't reformat adjacent docs sections, and don't change the `// Original — no upstream.` headers (they stay accurate; plan Constitution Check V).
- Commit after each story, or at the end via `/speckit-git-commit`.
- `.docs-as-code/capabilities/read.md` is updated later by `/speckit-docs-as-code <n>`, not in this task list.

### SC review

(filled in by T034)
