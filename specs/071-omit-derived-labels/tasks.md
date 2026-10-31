---
description: "Task list for 071-omit-derived-labels"
---

# Tasks: Omit Derived Labels

**Input**: Design documents from `specs/071-omit-derived-labels/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Required. FR-008 and Constitution Principle II both require co-located tests in the same change. Write the row tests first and confirm the derived-label rows fail before the rule changes.

**Organization**: One code change (the `wrap` rule in `src/tools/links/_template.ts`, research D1/D2) serves US1–US4. Each story phase adds its own data-model rows to the template-execution test, so each story can be checked on its own. US5 is the surface-text story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story from spec.md (US1–US5)

---

## Phase 1: Setup (live evidence before coding)

**Purpose**: Close the implement-time T0 gates that can change wording or a fallback, and capture the pre-change output for the end-to-end comparison. Before any probe, read `.memory/test-execution-instructions.md`: vault `TestVault-Obsidian-CLI-MCP`, fixtures under `Sandbox/<run-id>/`, `Obsidian.com` only, `vault=` passed explicitly, fixtures cleaned up afterwards, `Welcome.md` left untouched.

- [ ] T001 Run T0 gate G1 (alias trimming) per `specs/071-omit-derived-labels/contracts/t0-probe-plan.md`: dump `original`/`displayText` for `[[Tgt#Head|  Padded  ]]` and `[[Tgt|  Padded  ]]` through `Obsidian.com eval`. Record the result (trimmed or not) as finding F5 in `specs/071-omit-derived-labels/research.md`, and remove the fixture.
- [ ] T002 Act on the G1 result from T001 (analysis I2, owner ruling 2026-10-31). If Obsidian trims surrounding whitespace from a non-blank alias, amend `specs/071-omit-derived-labels/spec.md` in three places: change FR-002's "exactly as written, character for character" and FR-006's "exactly as written" to "as written, with surrounding whitespace trimmed, as the editor parses it", and reword the US3 Independent Test to the same effect. Then add a Clarifications bullet recording the G1 evidence and the ruling. If there is no trimming, leave the spec wording unchanged and note "G1: no trimming, spec wording kept" under F5 in `specs/071-omit-derived-labels/research.md`.
- [ ] T003 Run T0 gate G3 (aliased frontmatter list item) per `specs/071-omit-derived-labels/contracts/t0-probe-plan.md`: dump `frontmatterLinks` for a list property holding `"[[Tgt#Head|Fm Alias]]"` and `"[[Tgt#^blk]]"`. Confirm `original` keeps `|` and `displayText` is `"Fm Alias"`, and record the result as finding F6 in `specs/071-omit-derived-labels/research.md`. If `original` lacks `|`, apply the G3 fallback and stop to raise it with the owner before T007.
- [ ] T004 Capture the pre-change G2 baseline. Seed `Sandbox/<run-id>/Src.md` and `Tgt.md` with data-model rows 1–27, and add the frontmatter rows from T003. Build the current `main` code (`npm run build`), call `links` through `dist/index.js` in default and `total: true` modes, and save both outputs to `specs/071-omit-derived-labels/contracts/g2-before.json`. Keep the fixture for T019.

---

## Phase 2: Foundational (template-execution harness)

**Purpose**: Build the test harness that every story phase adds rows to (research D4). Until now the template's `displayText` transform was never executed in tests.

**⚠️ CRITICAL**: Story phases add cases to this file; it must exist first.

- [ ] T005 Create `src/tools/links/_template.test.ts` with an `// Original — no upstream.` header. It renders `JS_TEMPLATE` via `composeEvalCode(JS_TEMPLATE, { active: false, path: "Sandbox/Src.md", file: null, total })` and runs it with `runInNewContext` from `node:vm`. The context holds `TextDecoder`, `Uint8Array`, `atob`, and a stub `app` whose `vault.getFiles()` returns `[{ path: "Sandbox/Src.md", extension: "md" }]` and whose `metadataCache.getFileCache()` returns a test-supplied `{ frontmatterLinks, links, embeds }`. A helper `cacheEntry(original, link, displayText, line, col)` builds body entries with `position.start.{line,col}`; `fmEntry(original, link, displayText)` builds frontmatter entries (no `position`). Each entry's `link`/`original`/`displayText` values are copied verbatim from `specs/071-omit-derived-labels/contracts/t0-cache-shapes.json`, inlined in the test, not imported from `specs/`. Add one smoke case: an empty cache gives `{ ok: true, count: 0, links: [] }`.

**Checkpoint**: The harness runs green on the unchanged template.

---

## Phase 3: User Story 1 — Unaliased heading and block links carry no label (P1) 🎯 MVP

**Goal**: No `displayText` on unaliased fragment-bearing wiki links, same-note fragments, frontmatter fragment links, or empty/blank aliases.

**Independent Test**: Data-model rows 1–6 and 18–20 emit no `displayText` (`Object.hasOwn(entry, "displayText") === false`).

### Tests for User Story 1

- [ ] T006 [US1] In `src/tools/links/_template.test.ts`, add one case per data-model row: 1 `[[Tgt#Head]]`, 2 `[[Tgt#^blk]]`, 3 `[[Tgt#H1#H2]]`, 4 `[[#Local]]`, 5 `[[#^lb]]`, 6 frontmatter `[[Tgt#Head]]`, 18 `[[Tgt#Head|]]`, 19 `[[Tgt#Head| ]]` (cache `""`), 20 `[[Tgt|]]`. Each asserts that the emitted entry has no `displayText` key and that its `target`/`line`/`kind` match the cache entry. Run `npx vitest run src/tools/links/_template.test.ts` and confirm these cases FAIL on the unchanged template.

### Implementation for User Story 1

- [ ] T007 [US1] In `src/tools/links/_template.ts`, change `wrap`. Replace `if(e.displayText!==e.link)o.displayText=e.displayText;` with the data-model DisplayLabelRule: compute `const r=e.original||'';const w=r.startsWith('[[')||r.startsWith('![[');` and emit `o.displayText=e.displayText` only when `e.displayText!==e.link&&(!w||(r.includes('|')&&e.displayText!==''))`. Keep everything else in the template byte-identical: the sort, `_col` stripping, error envelopes, and the `a.total` branch. Re-run T006's cases; all pass.
- [ ] T008 [US1] Update the header intent line of `src/tools/links/_template.ts`. Replace "displayText omit-when-equal (F6/Q1)" with a description of the spec 071 rule: wiki-form entries emit displayText only when the source carries a non-empty `|` alias distinct from the link; Markdown entries keep omit-when-equal. Keep the rest of the header.

**Checkpoint**: US1 passes on its own; derived labels and empty labels are gone from wiki-form links.

---

## Phase 4: User Story 2 — Unaliased heading and block embeds carry no label (P1)

**Goal**: Embeds follow the same rule, including non-heading fragments such as PDF pages.

**Independent Test**: Data-model rows 7–9 emit no `displayText`, with `kind: "embed"`.

- [ ] T009 [US2] In `src/tools/links/_template.test.ts`, add cases for data-model rows 7 `![[Tgt#Head]]`, 8 `![[Tgt#^blk]]` and 9 `![[paper.pdf#page=3]]` (cache `embeds`). Assert there is no `displayText` key and that `kind === "embed"`. Expected to pass after T007; if any fails, fix `wrap` in `src/tools/links/_template.ts` (no separate embed branch is allowed, per research D2).

**Checkpoint**: US1 and US2 pass.

---

## Phase 5: User Story 3 — Author-written aliases are kept (P1)

**Goal**: Every author-written alias comes back as the cache's `displayText` value, including size text, table-escaped aliases and aliases shaped like `X > Y`; Markdown labels are unchanged.

**Independent Test**: Data-model rows 10–17 and 25–27 emit `displayText` equal to the expected value.

- [ ] T010 [US3] In `src/tools/links/_template.test.ts`, add cases for data-model rows 10 `Custom Display`, 11 `Other Label`, 12 `Alias`, 13 `Emb Alias` (embed), 14 `Tgt > Head` (alias that looks derived, FR-003), 15 table `[[Tgt#Head\|Tbl Alias]]` → `Tbl Alias`, 16 `300`, 17 `300x200`, 25 `[Text](Tgt.md#Head)` → `Text`, 26 `[](Tgt.md#Head)` → `""` (unchanged, out of scope), and 27 `![alt](img.png)` → `alt`. Each asserts `displayText` strictly equals the expected string.
- [ ] T011 [US3] If T003 confirmed G3, add a case in `src/tools/links/_template.test.ts` for a frontmatter entry `"[[Tgt#Head|Fm Alias]]"` → `displayText: "Fm Alias"`, using the exact cache values recorded in research F6.

**Checkpoint**: US1–US3 pass; no real alias is lost.

---

## Phase 6: User Story 4 — Existing plain-link behaviour unchanged (P2)

**Goal**: Plain unaliased links and embeds, and aliases equal to the target, still carry no label. No other entry field, the order, or `count` changes.

**Independent Test**: Data-model rows 21–24 emit no `displayText`. A mixed fixture holding all 27 rows plus frontmatter gives identical `target`/`line`/`kind`/order and `count` before and after the rule, and `total: true` gives the same `count`.

- [ ] T012 [US4] In `src/tools/links/_template.test.ts`, add cases for data-model rows 21 `[[Tgt#Head|Tgt#Head]]`, 22 `[[Tgt|Tgt]]`, 23 `[[Tgt]]` and 24 `![[img.png]]`, each asserting there is no `displayText` key.
- [ ] T013 [US4] In `src/tools/links/_template.test.ts`, add an FR-005 invariant case. Run the template on one mixed cache holding all 27 rows: frontmatter entries plus body entries on several lines, including two on the same line with different `col`. Assert that the entries, with `displayText` removed, equal the expected `{target,line,kind}` list in source order (frontmatter first at `line: 1`, same-line ties ordered by column), that `count` equals the entry count, and that rendering with `total: true` returns the same `count` with `links: []`.

**Checkpoint**: All behaviour stories pass.

---

## Phase 7: User Story 5 — Help matches behaviour (P2)

**Goal**: The description and the help page state one rule, with no caveat, no regex workaround and no "embeds never" claim.

**Independent Test**: `index.test.ts` asserts the new sentence and no caveat; the docs page is checked against `specs/071-omit-derived-labels/contracts/display-label.md`; only `links.descriptionFingerprint` moves in the baseline.

- [ ] T014 [P] [US5] In `src/tools/links/index.test.ts`, add assertions: `LINKS_DESCRIPTION` contains the new rule sentence from `specs/071-omit-derived-labels/contracts/display-label.md` verbatim, and does not contain `"alias distinct from the link target. "` (the old sentence), `"CAVEAT"` or `" > "`. Also assert that `docs/tools/links.md` (read the way the existing docs-presence test reads it) does not contain the exact strings `CAVEAT`, `/^.+ > .+$/.test(entry.displayText)` (the regex workaround) or ``and wiki embeds (`![[diagrams/x.png]]`) omit the field`` (the old embed-omit claim, analysis A1). Confirm these FAIL before T015/T016.
- [ ] T015 [US5] In `src/tools/links/index.ts`, replace the sentence `displayText is present only when the source carries an alias distinct from the link target. ` in `LINKS_DESCRIPTION` with the contract sentence plus a trailing space, keeping the `describeSupport(LINKS_SUPPORTED)` concatenation and every other sentence unchanged (`src/tools/_file-type-support.test.ts` asserts the support sentence). If T001 found aliases are trimmed, the sentence stays as contracted ("carries that alias"); do not add trimming detail to the description.
- [ ] T016 [P] [US5] In `docs/tools/links.md`, rewrite the `links[].displayText` table row with the contract text from `specs/071-omit-derived-labels/contracts/display-label.md`, removing the CAVEAT, the regex workaround and the "wiki embeds omit the field" wording. Add a "Display label rule" subsection under the output contract with the worked-rows table (data-model rows 1, 4, 6, 9, 10, 14, 16, 20, 23, 26), and the Markdown half of the contract row (link text or alt text reported as written, empty included; analysis I1). Add one sentence on trimming from research F5 (T001). Check each existing example on the page against the rule and change it only if its output would now differ.
- [ ] T017 [US5] Run `npm run baseline:write` to regenerate `src/tools/_register-baseline.json`, then `git diff src/tools/_register-baseline.json`. Confirm that only `links.descriptionFingerprint` changed; any other moved line is a defect to fix before continuing.

**Checkpoint**: Surface text matches behaviour; every story is done.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T018 Run `npm run typecheck`, `npm run lint` and `npm test` (scripts in `package.json`; full suite with the coverage gate in `vitest.config.ts`). Fix failures only in the files this feature touched (`src/tools/links/**`, `docs/tools/links.md`, `src/tools/_register-baseline.json`).
- [ ] T019 Run T0 gate G2 end-to-end per `specs/071-omit-derived-labels/contracts/t0-probe-plan.md`. Run `npm run build` on this branch and call `links` on the T004 fixture in both modes, saving to `specs/071-omit-derived-labels/contracts/g2-after.json`. Check every row's `displayText` against `specs/071-omit-derived-labels/data-model.md`, and check that `target`/`line`/`kind`/order/`count` match `g2-before.json` exactly. Run the US5 manual check in `specs/071-omit-derived-labels/quickstart.md`, then remove `Sandbox/<run-id>/` and confirm `Welcome.md` is untouched.
- [ ] T020 Run `graphify update .` and `/graphify --update`, then the four post-implement structural checks from the plan's Graphify structural check. Confirm: no new error-class node; no DI-factory import in any handler and `server.ts` unchanged; `_template.test.ts` attached to `links/_template.ts::JS_TEMPLATE`; no production node added. Write the results, with the G1/G2/G3 evidence summary, to `specs/071-omit-derived-labels/post-implement.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: none. T001 and T003 can run in either order; T002 depends on T001; T004 depends on T003 (it reuses its frontmatter rows) and must run before T007 changes the code.
- **Phase 2 (Foundational)**: T005 depends on nothing in code; it blocks every story phase.
- **Phase 3 (US1)**: T006 → T007 → T008. T007 is the only behaviour change and unblocks US2–US4 assertions.
- **Phases 4–6 (US2, US3, US4)**: depend on T007. They all edit `_template.test.ts`, so they run one after another (T009 → T010 → T011 → T012 → T013). T011 also depends on T003.
- **Phase 7 (US5)**: T014 can start once Phase 2 is done (different file). T015 depends on T014; T016 depends on T001 (trimming sentence); T017 depends on T015.
- **Phase 8 (Polish)**: T018 after all story phases; T019 after T018 and T004; T020 last.

### User Story Dependencies

- US1 holds the single rule change; US2, US3 and US4 are separate test slices over that change, each checkable on its own.
- US5 does not depend on the code change (surface text only), but should merge in the same PR so help and behaviour agree.

### Parallel Opportunities

- T014 (`index.test.ts`) and T016 (`docs/tools/links.md`) can run alongside the US1–US4 test work, which touches `_template.test.ts`/`_template.ts`.
- T001 and T003 are independent probes.

## Parallel Example

```text
# After T005, alongside US1:
Task: "T014 [US5] description/docs assertions in src/tools/links/index.test.ts"
Task: "T016 [US5] rewrite displayText row in docs/tools/links.md"
```

## Implementation Strategy

### MVP (User Story 1)

T001–T008: gates, harness, row tests, the one-condition rule change. This alone removes every derived label from wiki links and frontmatter links and closes the defect for the main case.

### Incremental Delivery

1. MVP (US1).
2. US2 and US3 assertions (embeds; nothing lost).
3. US4 regression and FR-005 invariants.
4. US5 surface text and baseline.
5. Polish: full suite, G2 end-to-end, graph checks.

## Notes

- **Graphify path rule (tasks phase)**: N/A. Every source change sits in one module (`src/tools/links/`). The only cross-module reader, `src/tools/_file-type-support.test.ts` → `LINKS_DESCRIPTION`, is unchanged and is guarded in T015. The plan's graph facts confirm `links/_template.ts::JS_TEMPLATE` has no importer outside the `links` module.
- The template is a frozen string executed inside Obsidian. Keep the edit to the `wrap` body (T007) and the header line (T008).
- The commit after implement uses `/speckit-git-commit`; the PR is followed by `/code-review` and `/speckit-docs-as-code <n>` per CLAUDE.md.
