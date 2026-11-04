---

description: "Task list for 092 Audit tool descriptions"
---

# Tasks: Audit Tool Descriptions

**Input**: Design documents from `specs/092-audit-tool-descriptions/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/description-audit-contract.md](contracts/description-audit-contract.md), [quickstart.md](quickstart.md)

**Tests**: requested. Constitution Principle II requires that every tool whose description is modified is covered in the same change. The new audit module also gets unit rows. The rows are written in Phase 2, before any description changes, so their red state shows that they catch problems: the standing checks Q1, Q2 and Q5 fail on today's descriptions.

**Organization**:

- **Phase 1:** a green baseline and the extracted vitest-dump runner.
- **Phase 2:** the audit module, its unit rows, the standing checks and an empty record (blocking).
- **Phases 3–8:** one per user story, in spec priority order:
  - US1 (P1): short descriptions. Most of the work.
  - US2 (P1): no internal identifiers, plus the index rewrite.
  - US3 (P2): the help pointer.
  - US4 (P2): consistent related tools.
  - US5 (P2): the total budget.
  - US6 (P3): the audit command and the filled reviewer record.
- **Phase 9:** the baseline, the CHANGELOG, the full gate and the structural check.

Row ids refer to the contract:

- §S: the description rules S1–S8;
- §I: the instruction and help text;
- §A: the command;
- §T: the new rows (T-ID1 … T-REP7, T-COL, Q1 … Q7);
- §X: the approved test edits;
- §H: help-page moves;
- §C: the CHANGELOG.

**Scope**: published text and the audit tooling only (plan "Scale/Scope"). These stay unedited:

- `src/errors.ts` and `src/server.ts`;
- every `handler.ts`;
- every input-schema shape (keys, types, `required`, refinements) and every output schema;
- every existing test assertion not listed in contract §X.

**Before any code edit**:

- Load the `karpathy-guidelines` skill.
- Read `.memory/refactor-decisions.md`. These items apply:
  - **§2:** byte-exact behaviour. Only description strings change.
  - **§5:** edit only the approved §X rows (spec 092 entry). Any other existing assertion that fails stops the work: raise it to the owner, and do not edit that test. Keep the 38 LIKELY-KEEP assertions by how the descriptions are worded.
  - **§10:** no per-tool "every property described" loops.
  - **§27(a):** the baseline moves only for description and schema fingerprints.
  - **§27(d):** in the instructions, only tool names go in backticks.
  - **§30:** test-support modules are excluded from the build by name.
  - **§40:** the heading-path rule prose stays per tool; it is not merged into a shared helper.
  - **§44:** do not touch the `mapValidationError` lifts.

**No live CLI calls**: behaviour does not change, so `.memory/test-execution-instructions.md` does not apply.

**Run vitest through PowerShell**, not the Bash tool. The Bash tool turns `\\` into `\` inside heredocs (refactor-decisions §41), so write files with the Write/Edit tools.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task).
- **[Story]**: US1–US6 from spec.md.

---

## Phase 1: Setup

**Purpose**: a known-green starting point, and the shared script runner, extracted with proof that its output is unchanged.

- [X] T001 Before any edit, on branch `092-audit-tool-descriptions`, run `npm run typecheck; if ($?) { npm run lint }; if ($?) { npm test }` in PowerShell.
  - Create `specs/092-audit-tool-descriptions/post-implement.md`, headed `# Post-implement: 092 Audit tool descriptions`, and record the result under `## T001 baseline`.
  - A pre-existing failure is reported, not fixed.
- [X] T002 Extract the vitest-dump runner (contract §A2) into `scripts/_vitest-dump.ts`.
  - **Header**: `// Original — no upstream. Runs a generated vitest file that dumps JSON to a scratch path, then cleans up; shared by the baseline writer and the description audit because Node cannot resolve the project's .js-on-.ts imports directly.`
  - **Export**: `runVitestDump(testFileName: string, makeSource: (dumpPath: string) => string): Promise<string>`. It creates a scratch dir under `os.tmpdir()`, writes `src/tools/<testFileName>` from `makeSource(dumpPath)`, and spawns `npx vitest run --no-coverage <file>` with `stdio: "inherit"` and `shell: true`. It returns the dump file's text and always removes both the temporary test and the scratch dir in `finally`. The spawn and cleanup logic is the code currently in `fingerprintViaVitest`, moved and not rewritten.
  - **Edit** `scripts/write-register-baseline.ts` so `fingerprintViaVitest()` calls `runVitestDump("__baseline-dumper.test.ts", …)` with the same dumper source, and `JSON.parse`s the result. Update its header to say it uses `_vitest-dump.ts`.
  - **Verify** (quickstart §1): run `npm run baseline:write` and `git diff src/tools/_register-baseline.json`. Only `generatedAt` / `generatedFromBranch` may differ. Record the result in `post-implement.md` under `## T002 runner extraction`, then `git checkout src/tools/_register-baseline.json`.

---

## Phase 2: Foundational: audit module, unit rows and standing checks (blocks every story)

**Purpose**: the single source of the budgets, rosters, patterns and report (research D6), tested before any description moves.

- [X] T003 Create `src/tools/_description-audit.ts` (research D3, D5, D6, D8, D9; data-model E1–E10).
  - **Header**: `// Original — no upstream. Tool-description audit (spec 092): budgets, family and shared-field rosters, internal-identifier patterns, first-sentence and index parsing, the reviewer-record schema, the live-surface collector and the Markdown report. Test-support module: used by _description-quality.test.ts and scripts/audit-descriptions.ts, excluded from dist/.`
  - **Constants**:
    - `DESCRIPTION_BUDGET = 400`;
    - `TOTAL_DESCRIPTION_BUDGET = 12_000`;
    - `FAMILIES`: exactly the 11 families of data-model E6, as `Record<string, readonly string[]>`;
    - `SHARED_FIELDS = ["vault", "target_mode", "file", "path", "folder", "case_sensitive", "total", "limit"] as const`;
    - `INTERNAL_ID_PATTERNS`: P1–P7 of data-model E8. P7 is applied only after blanking `` `…` `` spans and `"…"` strings, with their length preserved so indices stay true;
    - `JUDGEMENT_CHECKS = ["purpose", "safety", "detail", "selfContained", "family", "sharedFields"] as const`;
    - `CHECK_COLUMNS`: the 9 report columns in E10 order;
    - `HELP_POINTER_LINE`: the exact §I1 line.
  - **Pure functions**:
    - `findInternalIds(text)` returns `{ pattern, match, index }[]`;
    - `firstSentence(description)` (E4);
    - `parseIndexEntries(indexText)` returns a `Map<name, text>` from `/^- \*\*([^*]+)\*\* — (.*)$/gm`;
    - `siblingsOf(name)` is the union of the other members of every family containing `name`, sorted;
    - `missingSiblings(name, description)` returns the siblings not present as `` `name` `` in the description;
    - `describedTexts(tool)` returns `[path, text][]` for the description and every `description` key at any depth of `inputSchema` / `outputSchema`, with paths such as `` `query_base#input.properties.base_path` ``;
    - `toolFingerprints(tool)` returns `{ descriptionFingerprint: sha256(description), schemaFingerprint: sha256(canonicalJSON(inputSchema)) }`, importing `sha256` and `canonicalJSON` from `./_register-baseline.js`.
  - **Record schema**: `descriptionAuditRecordSchema` is strict zod, per data-model E9, quoted:
    - `verdict` one of `"PASS" | "PARTIAL" | "FAIL" | "N/A"`;
    - `gap` required and non-empty when `verdict` is `FAIL` or `PARTIAL`, and allowed but optional on `PASS` and `N/A` as a note;
    - fingerprints 64 lowercase hex characters;
    - unknown keys rejected;
    - `schemaVersion: 1`.

    Use `z.infer` for its type (Principle III).
  - **`collectPublishedSurface(deps?: { buildMcpServer?: () => McpServer; docsDir?: string })`**: list the tools the way `fingerprintLiveRegistry` does, but the default builder is `createServer({ registerSignalHandlers: false, env: {} })` (data-model E1). The empty `env` means the owner's `OBSIDIAN_MCP_*` access settings never shrink the audited surface (analyze U1). Then `connectInMemoryClient`, `cacheMode: "bypass"`, close in `finally`.
    - Read `client.getInstructions()` and `readFile(join(docsDir ?? DOCS_DIR, "index.md"))`, with `DOCS_DIR` from `./help/handler.js`.
    - Read `helpPageCount = (await listToolPages(docsDir ?? DOCS_DIR)).length`, with `listToolPages` from `./help/handler.js`.
    - Return E1 `{ tools, instructions, indexText, helpPageCount }`.
  - **`renderAuditReport(surface, record, meta: { version; sha; branch; date })`**: returns the Markdown of E10.
    - Cell rules follow research D9 and E9: computed Budget, IDs and Index cells; computed Family N/A / FAIL; computed Shared-fields N/A; otherwise the recorded verdict, or `NEEDS REVIEW (not recorded)` / `NEEDS REVIEW (was <verdict>)` when a fingerprint differs.
    - The header carries the tool-count guard: `tools.length` against `helpPageCount`, PASS when equal, FAIL naming both counts otherwise.
    - The `## Notes` section has one entry per PASS or N/A cell whose record carries `gap` text (analyze I2).
    - The routing lines are the instruction lines between `Which tool:` and the blank line, matched against `record.routing`.
    - Invariants: rows = `tools.length`; 9 cells per row; one Gaps entry per FAIL or PARTIAL; one Notes entry per other cell with `gap` text.
- [X] T004 [P] Create `src/tools/_description-audit.test.ts` with rows T-ID1, T-ID2, T-ID3, T-FS, T-IX, T-FAM, T-REC1, T-REP1–T-REP7 and T-COL, exactly as contract §T specifies.
  - **Header**: `// Original — no upstream. Unit rows for the tool-description audit helpers (spec 092 contract §T).`
  - T-REP rows build a fixture surface of 3 synthetic tools (one in a family, one in none, one with a parameter carrying `BI-0001`) plus fixture instructions, index text and `helpPageCount`. They never use the live server.
  - T-COL is the one row that calls `collectPublishedSurface()` on the live server. It sets `process.env.OBSIDIAN_MCP_READ_ONLY = "1"` and `process.env.OBSIDIAN_MCP_DISABLE = "delete"`, restores both in `finally`, and expects `tools.length === helpPageCount`.
  - Run it: every row passes.
- [X] T005 Create `src/tools/_description-audit-record.json` as `{ "schemaVersion": 1, "tools": {}, "routing": {} }`, and add `"src/tools/_description-audit.ts"` to the `exclude` list in `tsconfig.build.json`, after `src/tools/_register-baseline.ts`.
  - Run `npm run build` and confirm `dist/tools/_description-audit.js` is absent (refactor-decisions §30: check `dist/tools`, not the config). Record this in `post-implement.md`.
- [X] T006 Create `src/tools/_description-quality.test.ts` with rows Q1–Q7 (contract §T) on `collectPublishedSurface()`. It runs after T005, because Q6 and Q7 read the record (analyze I4).
  - **Header**: `// Original — no upstream. Standing checks on the published tool surface (spec 092 FR-017): per-tool and total description budgets, no internal identifiers in any published text or the help index, the help pointer, index entries equal to first sentences, a parseable reviewer record, and one report row per registered tool. Judgement verdicts never gate here (Clarification Q4).`
  - Q3 reports `where: match` for every hit. Q5 lists the mismatched tool names.
  - Q7 renders the live report with the parsed record and a fixed `meta`. It asserts only the matrix row count (`tools.length`) and 9 verdict cells per row, never the verdicts.
  - Run it now and record the red state in `post-implement.md` under `## T006 red state`. Expected:
    - fail: Q1 (31 tools over 400), Q2 (62,067 > 12,000), Q3 (research F2 hits), Q4 (old help line) and Q5 (every entry);
    - pass: Q6 and Q7.

**Checkpoint**: T004 green, and T006 red in exactly the expected rows. User stories can start.

---

## Phase 3: User Story 1 — Short up-front descriptions (Priority: P1) 🎯 MVP

**Goal**: every description follows contract §S. Each one cut is preserved on its help page (§H) or, for an input rule, in its parameter description (S7). The approved §X edits are applied for that tool.

**Independent Test**: Q1 passes. Every tool's `index.test.ts` passes, with only §X rows edited. `_file-type-support.test.ts` and `_surface.test.ts` pass.

**Procedure for every task in this phase**, for each tool named:

1. **Before rewriting**, list every fact in the current `<NAME>_DESCRIPTION` in `src/tools/<tool>/index.ts`, and run the §H procedure: find each fact on `docs/tools/<tool>.md` and add the missing ones to the right H2 section, including every `X-P+` phrase verbatim.
2. **Rewrite the constant** to S1 (purpose, no `e.g.` / `i.e.`), then S2 (siblings named in backticks), then S3 (caveat if any), then S4 (keep `${describeSupport(…)}`, last), at most 400 characters.
   - Keep every LIKELY-KEEP phrase (S6) its `index.test.ts` pins.
   - Never write "call help(", "specific mode", "display name" or "preview first".
3. **Move each input-combination rule found only in the description** into the constrained parameter's `.describe()` in `schema.ts`, as one sentence (S7).
   - Never add text to the S7 frozen list.
   - Never repeat target-mode rules.
4. **Apply the tool's §X rows** exactly as listed, and nothing else.
5. **Run** `npx vitest run src/tools/<tool>` plus `src/tools/_file-type-support.test.ts` and `src/tools/_surface.test.ts`. A failure outside §X stops the work.
6. **Note in `post-implement.md`** under `## US1 <family>`: old length → new length, facts moved to the page, rules moved to parameters, and §X rows applied.

- [X] T007 [P] [US1] Text-search family: `search`, `context_search`, `pattern_search`.
  - Siblings: each names the other two.
  - S6: `pattern_search` keeps `context_search`, and states its case-sensitive default against `context_search` if that fits (then §X 96–97 need no edit).
  - `pattern_search` drops `closedVaultNote("eval")`: §X 102 X-CV.
  - §X: `pattern_search` 54-61 X-L, 96–97 if needed, 102.
  - Files: `src/tools/{search,context_search,pattern_search}/index.ts`, and `schema.ts` only for S7 parameter `.describe()` strings. Leave the `search` input root description (`searchInputSchema.describe(…)`) to T018 (analyze I1). Pages: `docs/tools/{search,context_search,pattern_search}.md`.
- [X] T008 [P] [US1] Frontmatter-property and metadata families: `read_property`, `set_property`, `find_by_property`, `properties`, `tag`.
  - Siblings:
    - `read_property`: `read`, `read_heading`, `set_property`, `find_by_property`, `properties`;
    - `set_property`: `read_property`, `find_by_property`, `properties`;
    - `find_by_property`: `read_property`, `set_property`, `properties`, `tag`;
    - `properties`: `read_property`, `set_property`, `find_by_property`;
    - `tag`: `find_by_property`.
  - S7: `set_property`'s "`date` / `datetime` require an explicit `type`" goes to the `type` parameter if not already there. Its client caveat is cut and not carried (S8); note it as possibly stale for the record.
  - `tag` drops `closedVaultNote("eval")`, its `ADR-031`, `BI-0134`, "B1 falsified" and "Residual limitation" text. `docs/tools/tag.md` gains the "a closed registered vault is opened automatically" sentence (§H, ADR-045 amendment).
  - §X: `find_by_property` 34, 141, 143-145; `tag` 42.
  - Files: the five `index.ts` files (`schema.ts` only for S7 parameter `.describe()` strings) and the five pages. Leave the `properties` and `read_property` input root descriptions to T018 (analyze I1).
- [X] T009 [P] [US1] Reading family: `read`, `read_heading`.
  - `read`'s siblings: `read_heading`, `read_property`. `read_heading`'s siblings: `read`, `read_property`.
  - S6: `read` keeps "exact text". `read_heading` keeps "heading", plus the `/heading.*path|::|two.*segment/i` match.
  - `read` keeps naming `open_file` for attachments if it fits.
  - The heading-path rule sentences leave the description but stay in the `heading` parameter and on the page (§40: no shared helper).
  - §X: `read_heading` 134-136 and 142-145 X-LOOP, 152-158 X-LOOP.
  - Files: `src/tools/{read,read_heading}/index.ts` and their pages.
- [X] T010 [P] [US1] Note-writer family: `write_note`, `append_note`, `prepend`, `patch_heading`, `patch_block`, `find_and_replace`.
  - Siblings: each names the other five.
  - S3 caveats:
    - `write_note`: replaces the whole note with `overwrite: true`.
    - `find_and_replace`: vault-wide by default, and nothing changes until `commit: true`.
  - S6: `patch_heading` keeps `write_note` (the whole-note alternative).
  - S7: `find_and_replace` single-note scope exclusivity (`file` / `path` / `active_note`) goes to `active_note` / `file` / `path` as needed; its frozen `case_sensitive` and `folder` stay untouched.
  - §X:
    - `find_and_replace` 31 X-L, 35-37, 44, 356, 358-360;
    - `prepend` 48 X-A (`content`), 91-92;
    - `patch_block` 122-123;
    - `patch_heading` 145-146, 194-196 and 220-223 X-LOOP, 237-238 X-LOOP.
  - Files: the six `index.ts` files (`schema.ts` for S7) and the six pages.
- [X] T011 [P] [US1] File-operation family: `move`, `rename`, `delete`.
  - Siblings: each names the other two.
  - S3:
    - `move` / `rename`: links are rewritten per the vault's "Automatically update internal links" setting, and the file keeps its type (change a type with `obsidian_exec`). This satisfies `_file-type-support.test.ts:80-81` and `move` / `rename` `index.test.ts` 54-55 without edits.
    - `delete`: trash by default; `permanent: true` is irreversible.
  - `move`'s `FOLDER_NOT_FOUND` / `NOT_A_FOLDER` detail goes to its page.
  - §X: none.
  - Files: `src/tools/{move,rename,delete}/index.ts` and their pages.
- [X] T012 [P] [US1] Folder-listing and note-structure families: `files`, `paths`, `links`, `backlinks`, `outline`.
  - Siblings: `files` ↔ `paths`; `links`, `backlinks` and `outline` each name the other two.
  - S6: `links` keeps "wikilink", "embed" and "markdown" if they fit; `backlinks` keeps `links`.
  - `files` drops "wrapper-side". `paths` drops `closedVaultNote("eval")`.
  - §X:
    - `files` 30, 32;
    - `paths` 76 X-P+, 81 X-CV;
    - `links` 43, 108-110 X-P+;
    - `backlinks` 32 X-L, 46-49.
  - Files: the five `index.ts` files and the five pages.
- [X] T013 [P] [US1] Smart Connections and active-file families: `smart_connections_query`, `smart_connections_similar`, `get_active_file`, `open_file`.
  - Siblings: the two Smart Connections tools name each other; `get_active_file` ↔ `open_file`.
  - Both Smart Connections tools drop `closedVaultNote("eval")`. `get_active_file` drops `ADR-003` and "eval cohort".
  - §X:
    - `smart_connections_query` 44-50, 56 X-CV, 61;
    - `smart_connections_similar` 44-49, 55 X-CV, 60;
    - `get_active_file` 41 X-L, 60-66, 71, 77-78;
    - `open_file` 43 X-L, 59-62, 65.
  - Files: the four `index.ts` files and the four pages.
- [X] T014 [P] [US1] Bases family: `bases`, `views_base`, `query_base`, `create_base`.
  - Siblings: each names the other three. The Bases wording BI-0174 settled (`create_base` adds an item note to an existing Base) is kept.
  - S6: `create_base` keeps "The created item is a note."; `views_base` names `base_path` if it fits (then §X 63 needs no edit).
  - All four drop their `closedVaultNote(...)`.
  - §X:
    - `bases` 46 X-L, 85 X-CV, 86, 87-89 X-P+;
    - `create_base` 46 X-L, 95-98, 297 X-CV, 298, 299-302 X-P+, 313-315 X-P+, 317-319 X-P+;
    - `query_base` 80 X-L, 105-108, 113 X-CV;
    - `views_base` 52 X-L, 63 (if needed), 64, 70-73, 91 X-CV, 92, 93-94 X-P+;
    - `_surface.test.ts` 158-163: the expectation becomes `[]`, and the title is "no tool description mentions a not-open state".
  - Files: the four `index.ts` files (`schema.ts` only for S7 parameter `.describe()` strings) and the four pages. Leave the `query_base` input root description to T018 (analyze I1).
- [X] T015 [P] [US1] The tools in no family: `vaults`, `obsidian_exec`.
  - S2 says when to use each:
    - `vaults` lists the names other tools take as `vault`.
    - `obsidian_exec` runs any other Obsidian CLI command. Its S3 caveat: commands that run code or drive developer tooling are blocked unless `OBSIDIAN_MCP_ALLOW_EVAL` is set.
  - `help` is handled in US3 (T022).
  - §X: none.
  - Files: `src/tools/{vaults,obsidian_exec}/index.ts` and their pages.
- [X] T016 [US1] Retire `closedVaultNote` (after T007, T008, T012, T013 and T014).
  - Delete the function and its doc comment from `src/tools/_shared.ts`, and remove "072: closedVaultNote, the closed-vault paragraph six read-tool descriptions share." from that file's header.
  - Delete its `_shared.test.ts` test (line 84 to the end of that `test`), its import, and "072: closedVaultNote wording." in the header (§X X-CV).
  - Then `grep -rn closedVaultNote src` must be empty.
  - Confirm each of the 9 pages (`bases`, `create_base`, `paths`, `pattern_search`, `query_base`, `smart_connections_query`, `smart_connections_similar`, `tag`, `views_base`) states both the `Error: Command "<cmd>" not found.` uncoded `CLI_REPORTED_ERROR` answer and that a closed registered vault is opened automatically (§H).
- [X] T017 [US1] Run Q1 (`npx vitest run src/tools/_description-quality.test.ts -t "Q1"`). Every description must be ≤ 400 characters. Record the per-tool lengths in `post-implement.md` under `## US1 lengths`.

**Checkpoint**: Q1 green, and every per-tool suite green with only §X edits. Q5 is still red, because the index is rewritten in US2.

---

## Phase 4: User Story 2 — No internal references (Priority: P1)

**Goal**: no internal identifier and no version history in any published text or the help index (FR-005, FR-006).

**Independent Test**: Q3 and Q5 pass.

- [X] T018 [US2] After T007, T008 and T014, remove the identifiers and history from the input root descriptions, and nothing else (research F2). This task is the only one that edits these four root descriptions:
  - `src/tools/properties/schema.ts`: `BI-041 FR-011`, and "the previously-documented … claim was incorrect and is retired as of BI-041" restated as the current rule only. Keep "Dedup contract", which `properties/index.test.ts:53` pins.
  - `src/tools/query_base/schema.ts`: `BI-041`, `FR-006`, `FR-007` and `FR-008`. Keep "zero rows", `` `["path"]` ``, "stringified by upstream" and the two `file.*` mappings, which `query_base/schema.test.ts` pins.
  - `src/tools/read_property/schema.ts`: `BI-041 FR-010`. Keep "Malformed YAML frontmatter" and `{ value: null, type: "unknown" }`.
  - `src/tools/search/schema.ts`: `per BI-0086` (keeping "strict-rich pathway only" twice) and the "pinned at exactly two entries per spec FR-009 / SC-004 / Assumption A10; any future addition is a new BI." sentence. Keep "Error roster", `VALIDATION_ERROR(unrecognized_keys)` and "Out-of-range `limit`".
  - Apply §X `search/schema.test.ts` 24-25: the regex becomes `/strict-rich pathway only/g`, the count stays 2, and the title drops `per BI-0086`.
  - Run each tool's `schema.test.ts` and `index.test.ts`.
- [X] T019 [US2] Rewrite `docs/tools/index.md` (§I3; after T017 and T022).
  - Keep the two header lines.
  - Write one `- **<name>** — <firstSentence(description)>` line per tool, alphabetical, 35 entries.
  - Run Q5 and `src/tools/help/docs-sync.test.ts`, `src/tools/help/handler.test.ts`, `src/tools/files/index.test.ts` and `src/tools/set_property/index.test.ts` (their index reads are NEUTRAL).
- [X] T020 [US2] Run Q3 and fix any remaining hit by editing the published text, never the pattern. If a hit is a public token the patterns wrongly catch, stop and raise it, since it would mean changing data-model E8. Record "Q3 green" with the final scan in `post-implement.md` under `## US2`.

**Checkpoint**: Q1, Q3 and Q5 green.

---

## Phase 5: User Story 3 — Pointer to the full contract (Priority: P2)

**Goal**: the instructions and `help`'s own description say how to open any tool's full contract (FR-008, FR-009).

**Independent Test**: Q4 passes. `instructions.test.ts` (with the one §X edit) and `server.protocol.test.ts` pass, and the instructions are under 2,000 characters.

- [X] T021 [P] [US3] In `src/instructions/instructions.ts`, replace the last `RULES` line with the §I1 line, exactly:
  - `` - `help` with a tool's name returns its full contract; with none, it lists every tool. ``
  - Apply §X `src/instructions/instructions.test.ts:93`: the pinned phrase becomes `` "`help` with a tool's name returns its full contract" ``.
  - Run `npx vitest run src/instructions src/server.protocol.test.ts`. The length must be < 2,000 (expected 1,997).
- [X] T022 [P] [US3] In `src/tools/help/index.ts`, set `HELP_DESCRIPTION` to the §I2 text, exactly. Run `npx vitest run src/tools/help`. `help/index.test.ts:11` (`tool_name: "help"`) must pass unedited.
- [X] T023 [US3] Run Q4 and record it in `post-implement.md` under `## US3`.

---

## Phase 6: User Story 4 — Consistent related tools (Priority: P2)

**Goal**: every family member names its siblings without contradiction, and each shared field means the same thing on every tool, or states its difference (FR-011, FR-011a, FR-012).

**Independent Test**: the report from T029 shows Family and Shared fields as PASS or N/A on every row, and the routing walk-through is all PASS.

- [X] T024 [US4] For each family in data-model E6, check `missingSiblings(name, description)` is empty for every member. Then read the members' S2 sentences side by side and fix any contradiction in the `index.ts` constants, staying within 400 characters. Re-run each touched tool's suite.
- [X] T025 [US4] For each field in `SHARED_FIELDS`, list its distinct parameter descriptions across tools (the report appendix, or `describedTexts`).
  - Where meaning or default differ without saying so, add the difference to that tool's parameter description, in one sentence.
  - The S7 frozen list stays untouched. ADR-046's `case_sensitive` defaults are already stated.
  - A fix that would need an edit to an exact-pinned parameter description stops the work and goes to the owner.
- [X] T026 [US4] Walk through the 15 routing lines of the published instructions (FR-011a). For each, confirm the descriptions alone route the task to the named tool, and that no sibling claims it. Fix the descriptions in `src/tools/<tool>/index.ts` where they do not, and note each line's verdict for T029 in `post-implement.md` under `## US4 routing`.

---

## Phase 7: User Story 5 — Total budget (Priority: P2)

**Goal**: all descriptions together come to ≤ 12,000 characters (FR-014).

**Independent Test**: Q2 passes.

- [X] T027 [US5] Run Q2. If the total is over 12,000, shorten the longest descriptions first, keeping S1–S4 and the S6 phrases, and re-run the touched suites. Record the measured total in `post-implement.md` under `## US5`.

---

## Phase 8: User Story 6 — Audit report (Priority: P3)

**Goal**: one repeatable command prints the Markdown report, and the reviewer record is filled for all 35 tools and the 15 routing lines (FR-018 to FR-021b).

**Independent Test**: quickstart §4. 35 rows, 9 cells each, a gap entry for every FAIL or PARTIAL, and a needs-review count of 0.

- [X] T028 [US6] Create `scripts/audit-descriptions.ts` (contract §A1, §A3).
  - **Header**: `// Original — no upstream. npm run audit:descriptions: prints the tool-description audit report (spec 092) as Markdown on stdout, built from the live tool list and the reviewer record by a generated vitest dumper.`
  - **Behaviour**:
    1. Read `version` from `package.json`, and `sha` / `branch` from `git rev-parse --short HEAD` / `--abbrev-ref HEAD`. Take `date` as local `YYYY-MM-DD`.
    2. Call `runVitestDump("__description-audit-dumper.test.ts", …)`. The generated source imports `collectPublishedSurface`, `renderAuditReport` and `descriptionAuditRecordSchema` from `./_description-audit.js`, parses `./_description-audit-record.json` with `readFileSync` + `JSON.parse` + the schema, and writes the Markdown to the dump path.
    3. Write the returned text to stdout.
  - **Exit codes**: 0 when the report is produced; non-zero, with the cause on stderr, when the record fails validation, vitest fails, or git or `package.json` cannot be read.
  - Add `"audit:descriptions": "node scripts/audit-descriptions.ts"` to `package.json` `scripts`, after `baseline:write`.
- [X] T029 [US6] Fill `src/tools/_description-audit-record.json`, after US1–US5.
  - Run `npm run audit:descriptions > $env:TEMP\092-audit.md`. Every judgement cell starts as `NEEDS REVIEW (not recorded)`.
  - For each of the 35 tools, record `descriptionFingerprint` and `schemaFingerprint` (from `toolFingerprints`) and the six judgement verdicts:
    - `purpose`: S1 and S2 met.
    - `safety`: the S3 caveat is kept, or `N/A` for a tool that cannot lose data.
    - `detail`: every cut fact is on the page or in its parameter (the T007–T015 notes). A possibly stale claim gets a `gap` note naming it. The verdict is `PASS` when the claim survives only on the help page, as `set_property`'s client caveat does: the report shows that under `## Notes` (analyze I2). It is `PARTIAL` if the claim is still in published tool text.
    - `selfContained`: no history or internal vocabulary.
    - `family`: siblings named, no contradiction, and the routing outcome from T026.
    - `sharedFields`: per T025.
  - Record the 15 routing lines under `routing`, keyed by their exact published text, with T026's verdicts.
  - Every FAIL or PARTIAL carries a `gap`. One another open item will fix must name that item (FR-020).
  - Re-run the command until the needs-review count is 0 and every cell is PASS or N/A, apart from documented FAIL or PARTIAL cells with open-item gaps (SC-007, SC-008). Run Q6.
- [X] T030 [US6] Check the needs-review behaviour (quickstart §4, end):
  1. Append one word to one description.
  2. Run the command and check that the row's six judgement cells read `NEEDS REVIEW (was …)`.
  3. Run `npm test`. Only Q1–Q5 may react to the edit; nothing gates on the judgement verdicts.
  4. Revert, and record the result in `post-implement.md` under `## US6`.

---

## Phase 9: Polish & cross-cutting

- [X] T031 Run `npm run baseline:write`.
  - `git diff src/tools/_register-baseline.json` must change only `descriptionFingerprint` and `schemaFingerprint` values, plus `generatedAt` / `generatedFromBranch`. No title, annotations or output-schema fingerprint may move, and the tool count stays 35.
  - Any other move means a behaviour or shape change: stop and investigate.
- [X] T032 [P] Add the contract §C text to `CHANGELOG.md` under `## [Unreleased]`, in `### Changed`; create that subsection if it is absent.
- [X] T033 Run quickstart §2 red checks 1–3, each followed by a revert, then the full gate: `npm run typecheck; if ($?) { npm run lint }; if ($?) { npm run format:check }; if ($?) { npm test }`.
  - Confirm with `git diff --stat -- '*.test.ts'` that only the §X files, plus the two new test files, changed.
  - Record the result in `post-implement.md` under `## T033 full gate`.
- [X] T034 Run quickstart §4 for the final report, and paste its summary block and row count into `post-implement.md` under `## T034 audit report`. Do not commit the report itself; filing it is outside this feature.
- [X] T035 Post-implement structural verification (CLAUDE.md, quickstart §6).
  - Run `codegraph sync`, then `codegraph_explore "collectPublishedSurface renderAuditReport findInternalIds firstSentence descriptionAuditRecordSchema runVitestDump buildInstructions HELP_DESCRIPTION"`.
  - Verify the four checks:
    1. No new error class or code: `src/errors.ts` is unchanged.
    2. No production file imports `createLogger` / `createQueue`.
    3. `_description-audit.ts` is imported only by its two tests and the generated dumper, and is excluded from the build. The scripts import nothing from `src/`.
    4. No production orphan: `closedVaultNote` is gone, and every remaining export has a non-test caller or is a test-support export.
  - Also confirm the plan's claim held: no kernel node (`createServer()`, `createLogger()`, `createQueue()`, `UpstreamError`) was edited.
  - Record this under `## CodeGraph structural verification` in `post-implement.md`.

---

## Dependencies & Execution Order

### Phase dependencies

1. **Phase 1:** T001, then T002.
2. **Phase 2:** T003, then T004 ∥ T005, then T006. T006's Q6 and Q7 read T005's record.
3. **US1:** T007–T015 run in parallel, since each touches only its own tools' files, except:
   - **`_surface.test.ts`:** only T014 edits it, and the others only run it.
   - **`_file-type-support.test.ts`:** no task edits it.

   T016 runs after T007, T008, T012, T013 and T014. T017 runs after all of T007–T016.
4. **US2:**
   - T018 runs after T007, T008 and T014 (analyze I1, one owner per file edit). It alone edits the input root descriptions of `search`, `properties`, `read_property` and `query_base`. T007, T008 and T014 leave those untouched, but share their `schema.ts` files.
   - T019 needs T017 and T022, since the index takes the final first sentences, `help`'s included.
   - T020 runs after T018 and T019.
5. **US3:** T021 ∥ T022 can start after Phase 2. T023 follows both.
6. **US4:** T024–T026 run after US1–US3. Any description edit they make re-triggers T019's index check (Q5): re-run T019 if a first sentence changes.
7. **US5:** T027 runs after US4.
8. **US6:**
   - T028 can start after Phase 2.
   - T029 needs every description final (US1–US5), because the fingerprints pin the final text.
   - T030 runs after T029.
9. **Polish:** T031 runs after the last description edit. T032 is anytime. T033 → T034 → T035 run last.

### Structural notes (CodeGraph, tasks rule)

- **`collectPublishedSurface` → `createServer()` → every `createXTool()` → the description constants.** Q1–Q5 therefore read whatever the US1–US3 tasks have saved. Their red-to-green transitions are the progress signal, and they need no wiring task.
- **`_description-audit.ts` → `_register-baseline.ts` (`sha256`, `canonicalJSON`) → `../server.js`.** That is the same upward test-support edge `_register-baseline.ts` already has, so the module is excluded from the build like it (T006).
- **`_description-audit.ts` → `help/handler.ts` (`DOCS_DIR`).** The index read is the same file `help()` returns, so Q5 and `docs-sync.test.ts` agree by construction.
- **`_register.test.ts`'s baseline gate fails from the first description edit until T031.** That is expected: run each tool's own suites during US1, not the whole tree.
- **`buildInstructions` (T021) is consumed only by `createServer()` and its two test files.** The routing lines T026 walks are `ROUTING`, which T021 does not change.

### Parallel example: User Story 1

```text
T007 text-search ∥ T008 property/metadata ∥ T009 reading ∥ T010 writers ∥ T011 file ops
∥ T012 listing/structure ∥ T013 smart-connections/active-file ∥ T014 bases ∥ T015 vaults/obsidian_exec
→ T016 retire closedVaultNote → T017 Q1
```

---

## Implementation Strategy

- **MVP (US1):** Phases 1–3 shrink every description and keep every fact, which is most of the user value. Ship only with US2 and US3, because the stable-release gate needs the identifier sweep and the pointer.
- **Increment 2 (US2, US3):** index, identifiers, pointer. Q1–Q5 are green.
- **Increment 3 (US4, US5):** consistency and the total budget.
- **Increment 4 (US6):** the command and the filled record, then polish.

## Notes

- **The tasks rule applies:** the work crosses `src/tools/*`, `src/instructions`, `src/tools/help` and `scripts/`. The pair queries run at task time are `sha256 canonicalJSON connectInMemoryClient DOCS_DIR fingerprintLiveRegistry quietServer`, plus the plan-time queries; their call paths are reflected in the structural notes above.
- **Byte-exact behaviour:** a task that finds it must change a schema shape, a handler or an error to make a description true stops and raises it (FR-022).
- **No `[P]` on the same file:** `docs/tools/index.md` is written only by T019, and `_surface.test.ts` is edited only by T014.
