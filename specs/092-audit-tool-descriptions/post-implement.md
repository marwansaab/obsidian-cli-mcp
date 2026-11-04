# Post-implement: 092 Audit tool descriptions

## T001 baseline

Before any edit, on branch `092-audit-tool-descriptions` at `ec79fa3`: `npm run typecheck`, `npm run lint` and `npm test` all passed. 199 test files passed and 1 was skipped; 4,957 tests passed and 6 were skipped. No pre-existing failure.

## T002 runner extraction

`scripts/_vitest-dump.ts` exports `runVitestDump`, the spawn and clean-up code moved out of `fingerprintViaVitest`. `scripts/write-register-baseline.ts` now calls it with the same dumper source. `npm run baseline:write` on the unchanged tree wrote 35 entries, and `git diff src/tools/_register-baseline.json` showed only `generatedFromBranch` (`fix/bi-0174` → `092-audit-tool-descriptions`); `generatedAt` was already today's date. The file was restored with `git checkout`. `npx eslint scripts` is clean.

## T003–T005 audit module, unit rows and record

- `src/tools/_description-audit.ts` holds the budgets, rosters, patterns, pure helpers, the strict record schema, `collectPublishedSurface` and `renderAuditReport`.
- `src/tools/_description-audit.test.ts`: all 20 rows pass (T-ID1–T-ID3, T-FS, T-IX, T-FAM, T-REC1 ×6, T-REP1–T-REP7, T-COL).
- `src/tools/_description-audit-record.json` starts empty. `tsconfig.build.json` excludes `src/tools/_description-audit.ts`; after `npm run build`, `dist/tools/_description-audit.js` does not exist. (`dist/tools/_register-baseline.js` is present but dated 2026-10-30, a stale file from an earlier build, not produced by this one.)

## T006 red state

`src/tools/_description-quality.test.ts` on today's surface: Q1, Q2, Q3, Q4 and Q5 fail; Q6 and Q7 pass, as expected.

- Q1: 31 tools over 400 (every tool but `delete`, `help`, `obsidian_exec` and `read`).
- Q2: 62,067 > 12,000.
- Q3: 39 hits, matching research F2: `get_active_file` (`ADR-003`), `tag` (`B1`, `BI-0134`, `ADR-031`), the `properties`, `query_base`, `read_property` and `search` input root descriptions, and `index.md` (`Q1`, `Q2`, "per spec", `FR-007`, `FR-006a`, `BI-047`, "spec 078", `FR-005b`, `ADR-009`).
- Q4: the instructions carry the old help line.
- Q5: every entry differs from its first sentence.

## US1 (T007–T015)

Each family was rewritten under contract §S. Before each rewrite, every fact in the old description was checked against the tool's help page, and missing facts were added (§H). Old → new lengths are the exact published lengths. No assertion outside §X failed in any per-tool suite, `_file-type-support.test.ts` or `_surface.test.ts`.

### US1 text-search (T007)

- `search` 2,315 → 283; `context_search` 2,371 → 314; `pattern_search` 3,484 → 324.
- Pages: `search.md` gained a sentence that `context_search`'s `count` can be lower than `search`'s for the same query; `pattern_search.md` gained "no partial matches are returned alongside the error" in the `pattern` policy.
- Rules moved to parameters: none (already in the parameter descriptions). The `search` input root description is left to T018.
- §X: `pattern_search/index.test.ts` 53–61 (X-L) deleted; 96–97 needed no edit (sentence 2 keeps `case_sensitive` and its default); 102 (X-CV) now reads the help page. The X-CV test's title was changed from "description …" to "help page …", because its subject changed; no matcher changed.

### US1 frontmatter-property and metadata-search (T008)

- `read_property` 407 → 300; `set_property` 1,394 → 257; `find_by_property` 1,030 → 273; `properties` 1,875 → 243; `tag` 2,341 → 178.
- Pages: `find_by_property.md` gained the `Inputs:` sentence and the deprecated-names sentence verbatim (X-P+). `tag.md` gained the counting rule (body and frontmatter tags count alike, a note counts once), a related-tools bullet to `search` / `context_search`, and two error rows renamed to the codes the code raises (`CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`). `tag.md` already said a closed registered vault is opened automatically (line-wrapped), so research F4 was wrong on that point.
- Rules moved to parameters: none. `set_property`'s `type` parameter already says it is required for `date` and `datetime`.
- **S8:** `set_property`'s client caveat (pass an explicit `type` for list, number and checkbox writes) was cut and carried nowhere. The help page never stated it, so it now survives nowhere; the reviewer record's `detail` note says so.
- §X: `find_by_property/index.test.ts` 34 (X-P), 141 and 143–145 (X-P+); `tag/index.test.ts` 42 (X-CV, title reworded as for `pattern_search`).

### US1 reading and file-operations (T009, T011)

- `read` 392 → 306; `read_heading` 1,495 → 225; `move` 917 → 364; `rename` 429 → 345; `delete` 216 → 276 (it now names its siblings).
- Pages: no change needed; every cut fact was already on its page, including `move`'s `FOLDER_NOT_FOUND` / `NOT_A_FOLDER`.
- Rules moved to parameters: none. The heading-path rule stays in `read_heading`'s `heading` parameter and on the page (refactor-decisions §40).
- §X: `read_heading/index.test.ts` 134 and 142 (X-LOOP), 152–158 (X-LOOP, description half). `_file-type-support.test.ts` 80–81 and `move` / `rename` `index.test.ts` 54–55 pass unedited.

### US1 note-writers (T010)

- `write_note` 1,089 → 339; `append_note` 1,830 → 297; `prepend` 1,707 → 343; `patch_heading` 2,849 → 354; `patch_block` 2,160 → 325; `find_and_replace` 4,046 → 378.
- Pages: `find_and_replace.md` gained the `case_sensitive` default line, the deprecated-names sentence, the `` `VAULT_NOT_FOUND`/`unknown` `` line (all X-P+), "Literal mode inserts `replacement` verbatim." and the `pathEscapeAttempt` log note. `patch_heading.md`: the unknown-vault row names `details.requestedVault` / `details.knownVaults`, and the `HEADING_RACE` row says `patch_block` has no race code.
- Rules moved to parameters: none (the scope exclusivity was already in `file`, `path` and `active_note`; `write_note`'s active-mode rules already in `overwrite` and `open`).
- §X: `find_and_replace` 31 (X-L), 35–37 (X-P), 44, 356, 358–360 (X-P+); `prepend` 48 (X-A, `content`), 91–92 (X-P); `patch_block` 122–123 (X-P, anchor dropped); `patch_heading` 145–146 (X-P), 194–196 and 220–223 (X-LOOP), 237–238 (X-LOOP, description half).
- Possibly stale (pages, not moved by this feature): `patch_block.md`'s "malformed block-id" example predates the BI-0174 sub-code lift.

### US1 folder-listing and note-structure (T012)

- `files` 748 → 229; `paths` 752 → 212; `links` 1,827 → 264; `backlinks` 2,646 → 248; `outline` 816 → 233.
- Pages: `paths.md` gained the trailing-slash sentence (X-P+); `links.md` gained the `displayText` alias sentence (X-P+) and the Markdown link text sentence, checked against `links/_template.ts`.
- Rules moved to parameters: none.
- §X: `files` 30, 32 (X-P); `paths` 76 (X-P+), 81 (X-CV); `links` 43 (X-P), 108–110 (X-P+); `backlinks` 32 (X-L), 46–49 (X-P).

### US1 Smart Connections and active-file (T013)

- `smart_connections_query` 2,906 → 252; `smart_connections_similar` 2,489 → 267; `get_active_file` 3,104 → 216; `open_file` 3,348 → 286.
- Pages: `smart_connections_query.md` gained a "Runtime dependency" paragraph and the `limit` / `total` wording; `smart_connections_similar.md` the active-mode `NO_ACTIVE_FILE` precedence; `get_active_file.md` the phrase `{ active: null }`.
- Rules moved to parameters: none.
- §X: `smart_connections_query` 44–50, 61 (X-P), 56 (X-CV); `smart_connections_similar` 44–49, 60 (X-P), 55 (X-CV); `get_active_file` 41 (X-L), 60–66, 71, 77–78 (X-P); `open_file` 43 (X-L), 59–62, 65 (X-P). Two X-CV test titles were reworded from "description" to "help page".

### US1 Bases (T014)

- `bases` 1,272 → 244; `views_base` 2,687 → 333; `query_base` 2,894 → 303; `create_base` 2,841 → 271.
- Pages: `bases.md` gained the vault sentence (X-P+), the read-only line and "a failure, never an empty result"; `views_base.md` the vault sentences (X-P+) and a "Vault unavailable" error row; `query_base.md` the read-only line; `create_base.md` the `base_path` / `view_name` / vault input sentences, the output `path` sentence, the deprecated-names sentence and the `PATH_ESCAPES_VAULT` sentence (all X-P+).
- Rules moved to parameters: none.
- §X: `bases` 46 (X-L), 85 (X-CV), 86 (X-P), 87–89 (X-P+); `create_base` 46 (X-L), 95–98, 298 (X-P), 297 (X-CV), 299–302, 313–315, 317–319 (X-P+); `query_base` 80 (X-L), 105–108 (X-P), 113 (X-CV); `views_base` 52 (X-L), 63 (no edit; the description names `base_path`), 64, 70–73, 92 (X-P), 91 (X-CV), 93–94 (X-P+); `_surface.test.ts` not-open row → `[]` with the new title.

### US1 vaults and obsidian_exec (T015)

- `vaults` 884 → 209; `obsidian_exec` 261 → 312 (it gained the when-to-use sentence and the blocked-commands caveat).
- Pages: no change needed. The old `vaults` claim that an unreachable Obsidian gives `CLI_REPORTED_ERROR` or `CLI_TIMEOUT` was stale (the code returns `CLI_NON_ZERO_EXIT` with `details.reason: "obsidian-not-running"`, as the page says) and was dropped.
- §X: none.

## T016 closedVaultNote retired

`closedVaultNote` and its doc comment are deleted from `src/tools/_shared.ts`, with the header note; its `_shared.test.ts` test, import and header note are deleted. No `closedVaultNote` reference remains under `src/`. All 9 pages (`bases`, `create_base`, `paths`, `pattern_search`, `query_base`, `smart_connections_query`, `smart_connections_similar`, `tag`, `views_base`) state both the `Error: Command "<cmd>" not found.` answer and that a closed registered vault is opened automatically.

## US1 lengths (T017)

Q1 passes: every description is at most 400 characters. Q2 already passes too.

append_note 297, backlinks 248, bases 244, context_search 314, create_base 271, delete 276, files 229, find_and_replace 378, find_by_property 273, get_active_file 216, help 249 (not yet rewritten), links 264, move 364, obsidian_exec 312, open_file 286, outline 233, patch_block 325, patch_heading 354, paths 212, pattern_search 324, prepend 343, properties 243, query_base 303, read 306, read_heading 225, read_property 300, rename 345, search 283, set_property 257, smart_connections_query 252, smart_connections_similar 267, tag 178, vaults 209, views_base 333, write_note 339. Total 9,852.

## US2 (T018–T020)

- **T018:** the four input root descriptions lost their identifiers and history, and nothing else.
  - `properties`: "(BI-041 FR-011)" and the "previously-documented … retired as of BI-041" clause are gone; "Dedup contract" stays.
  - `query_base`: "(FR-006)", "(FR-007)", "(FR-008)" and both "(out-of-scope per BI-041)" are gone; the pinned phrases stay.
  - `read_property`: "(BI-041 FR-010)" is gone.
  - `search`: both "per BI-0086" are gone ("strict-rich pathway only" stays twice), and so is the "pinned at exactly two entries per spec FR-009 / SC-004 / Assumption A10; any future addition is a new BI." sentence.
  - §X `search/schema.test.ts` 24–25 applied: the regex is `/strict-rich pathway only/g`, the count stays 2, and the title drops `per BI-0086`.
  - The four tools' `schema.test.ts` and `index.test.ts` pass (15 files, 576 tests).
  - Code comments and runtime error messages that cite identifiers (for example `search`'s `"query exceeds 1000 chars (FR-010)"`) are not published descriptions and were left unchanged, because error messages are behaviour (FR-022).
- **T019:** `docs/tools/index.md` keeps its two header lines; each of the 35 entries is now `- **<name>** — <first sentence>`, alphabetical, written by a one-off generator that read the live descriptions (deleted afterwards). Q5, `help/docs-sync.test.ts`, `help/handler.test.ts`, `files/index.test.ts` and `set_property/index.test.ts` pass.
- **T020:** Q3 green. The final scan found no identifier in any description, parameter or output description, the instructions or `index.md`.

## US3 (T021–T023)

- **T021:** the last `RULES` line is now `` - `help` with a tool's name returns its full contract; with none, it lists every tool. ``; §X `instructions.test.ts:93` applied. `src/instructions` and `src/server.protocol.test.ts` pass, so the instructions are under 2,000 characters.
- **T022:** `HELP_DESCRIPTION` is the §I2 text (244 characters). `help/index.test.ts` passes unedited.
- **T023:** Q4 green.

## US4 (T024–T026)

- **T024:** the report's computed Family check finds no missing sibling on any of the 32 family members. Reading each family's sentence 2 side by side found no contradiction, so no description changed.
- **T025:** the report's shared-field appendix lists each field's distinct parameter descriptions. Every difference is already stated in the tool's own parameter description: `vault` (focused vault, active-mode rule, or the Bases routing), `target_mode` (note vs folder scope), `file` / `path` (locator, single-note scope, not accepted, or deprecated alias), `folder` (recursive or not, default), `case_sensitive` (ADR-046 defaults), `total` (`tag` returns a bare integer) and `limit` (range and default). No parameter description changed.
- **T026 routing walk-through** (FR-011a): for each of the 15 routing lines, the descriptions alone send the task to the named tools, and no sibling claims it. All 15 are PASS:
  1. Read a note, canvas or base / one heading's section / one frontmatter property → `read`, `read_heading`, `read_property`: PASS.
  2. A note's headings and links → `outline`, `links`, `backlinks`: PASS.
  3. Find text → `search` (paths), `context_search` (lines), `pattern_search` (regex): PASS.
  4. Find notes by metadata / list property names → `find_by_property`, `tag`, `properties`: PASS.
  5. List a folder → `files` (direct children), `paths` (recursive): PASS.
  6. Semantic search → `smart_connections_query`, `smart_connections_similar`: PASS.
  7. Bases → `bases`, `views_base`, `query_base`: PASS.
  8. Add an item to a base → `create_base`: PASS.
  9. Which note Obsidian has focused → `get_active_file`: PASS.
  10. Create or replace a note / add to its end or top → `write_note`, `append_note`, `prepend`: PASS.
  11. Edit in place → `patch_heading`, `patch_block`, `set_property`: PASS.
  12. Replace text across notes → `find_and_replace`: PASS.
  13. Move, rename or delete a file → `move`, `rename`, `delete`: PASS.
  14. Show a file in Obsidian → `open_file`: PASS.
  15. Any other Obsidian CLI command → `obsidian_exec`: PASS.

## US5 (T027)

Q2 passes: the 35 descriptions total 9,847 characters, under 12,000. No further shortening was needed.

## US6 (T028–T030)

- **T028:** `scripts/audit-descriptions.ts` and the `audit:descriptions` script. `runVitestDump` now sends vitest's console output to stderr, so the report alone reaches stdout; this changes only the baseline writer's console output, not the file it writes. `npm run` itself still prints its two-line `> …` banner on stdout before the report; `npm run --silent audit:descriptions` omits it.
- **T029:** `src/tools/_description-audit-record.json` holds all 35 tools (fingerprints from `toolFingerprints`, six verdicts each) and the 15 routing lines (all PASS). Every cell is PASS or N/A, with no FAIL or PARTIAL. Safety is PASS for the six tools whose caveat is kept (`write_note`, `delete`, `move`, `rename`, `find_and_replace`, `obsidian_exec`), PASS with a note for the three whose purpose is to replace content (`patch_heading`, `patch_block`, `set_property`), and N/A for the rest. Notes record the stale or possibly stale claims (`set_property`, `vaults`, `patch_heading`), the `find_by_property` `array_match` wording, and the root-description follow-up on `properties`, `query_base`, `read_property` and `search`. Q6 passes.
- **T030:** with one word appended to `DELETE_DESCRIPTION`, the report showed all six of `delete`'s judgement cells as `NEEDS REVIEW (was PASS)` and "Cells needing review: 6". In `npm test`, only the `_register.test.ts` baseline gate failed, as it does on any published-text change; Q1–Q5 stayed green (283 characters, first sentence unchanged), and nothing gated on the verdicts. The edit was reverted and the full suite passed again (201 files, 4,978 tests).

## T031 baseline

`npm run baseline:write` wrote 35 entries. `git diff src/tools/_register-baseline.json` changes 35 `descriptionFingerprint` values, 4 `schemaFingerprint` values (`properties`, `query_base`, `read_property` and `search`, whose root descriptions changed in T018) and `generatedFromBranch`. No title, annotations or output-schema fingerprint moved, and the tool count stays 35. No parameter description changed anywhere else, which matches the agents' reports that no rule needed moving into a parameter (S7).

## T032 CHANGELOG

The contract §C entry is the first bullet of `## [Unreleased]` → `### Changed`. The existing closed-vault bullet said the six tools' "descriptions and reference pages" document the vault-unavailable failure; it now says "reference pages", since the descriptions no longer carry it.

## T033 full gate

- Red checks (quickstart §2), each reverted: 400 characters appended to `DELETE_DESCRIPTION` failed Q1 with `delete (677)`; `BI-0001` in `delete`'s `permanent` description failed Q3 with `delete#input.properties.permanent: BI-0001`; one word changed in the `read` index entry failed Q5 with `read`.
- `npm run typecheck`, `npm run lint` and `npm test` pass (201 test files passed and 1 skipped; 4,978 tests passed and 6 skipped; coverage thresholds met).
- `npm run format:check` fails on 1,487 files, including files this feature never touched (for example `src/vault-registry/registry.ts`). It is a pre-existing failure of the Windows working copy and is not part of CI (`.github/workflows/ci.yml` does not run it). The five new `.ts` files are not Prettier-formatted either, matching the surrounding code.
- `git diff --stat -- '*.test.ts'` lists 24 edited test files, all in contract §X: `instructions.test.ts`, `_shared.test.ts`, `_surface.test.ts`, `search/schema.test.ts`, and the `index.test.ts` of `backlinks`, `bases`, `create_base`, `files`, `find_and_replace`, `find_by_property`, `get_active_file`, `links`, `open_file`, `patch_block`, `patch_heading`, `paths`, `pattern_search`, `prepend`, `query_base`, `read_heading`, `smart_connections_query`, `smart_connections_similar`, `tag` and `views_base`. The two new test files are `_description-audit.test.ts` and `_description-quality.test.ts`.
- Outside the letter of §X: four X-CV tests (`pattern_search`, `tag`, `smart_connections_query`, `smart_connections_similar`) had their titles and comments reworded from "description" to "help page", because their subject changed. No matcher or expected value changed. Other edited tests keep titles that still say "description".

## T034 audit report

`npm run audit:descriptions > $env:TEMP\092-audit.md` exits 0. Summary block:

```text
# Tool description audit: 0.9.0 (ec79fa3, 092-audit-tool-descriptions), 2026-11-04

- Registered tools: 35, measured with empty access settings; help pages: 35. PASS
- Per-tool description budget: 400 characters.
- Total description budget: 12,000 characters; measured 9,847. PASS
- Help pointer in the instructions: PASS
- Help pointer in the `help` description: PASS
- Internal identifiers in the instructions and the index header: PASS
- Cells needing review: 0
```

The matrix has 35 rows of 9 cells, every cell PASS or N/A. Family is N/A for `help`, `vaults` and `obsidian_exec`; Shared fields is N/A for `help` and `vaults`. `## Gaps` is empty. `## Notes` has 11 entries, including `set_property: Detail (PASS)`. The routing walk-through lists all 15 lines as PASS.

## CodeGraph structural verification

`codegraph sync`, then `codegraph_explore "collectPublishedSurface renderAuditReport findInternalIds firstSentence descriptionAuditRecordSchema runVitestDump buildInstructions HELP_DESCRIPTION"`.

1. **No new error class or code:** `src/errors.ts` is unchanged, and the new module constructs no `UpstreamError`.
2. **DI discipline:** among production files, only `src/server.ts` imports `createLogger` / `createQueue`; the other importers are pre-existing test fixtures. No `handler.ts` changed.
3. **Module placement:** `_description-audit.ts` is imported only by `_description-audit.test.ts`, `_description-quality.test.ts` and the dumper that `scripts/audit-descriptions.ts` generates, and it is in `tsconfig.build.json`'s exclude list. It reaches `createServer()` only through the call path `collectPublishedSurface → createServer → buildInstructions`, the same edge `_register-baseline.ts` has. Neither script imports from `src/`.
4. **No production orphan:** `closedVaultNote` is gone from `src/`, with no import left behind. The new exports are test-support exports used by the two test files and the dumper.

**Kernel nodes:** the plan's claim held. `createServer()`, `createLogger()`, `createQueue()` and `UpstreamError` are unedited (`src/server.ts`, `src/logger.ts`, `src/queue.ts` and `src/errors.ts` have no diff). The only boot-path change is one instruction line, which `createServer()` reads through `buildInstructions`.
