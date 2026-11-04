# Implementation Plan: Audit Tool Descriptions

**Branch**: `092-audit-tool-descriptions` | **Date**: 2026-11-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/092-audit-tool-descriptions/spec.md`

> **This change cuts every tool's published description to at most 400 characters (12,000 in all, down from about 62,000) and adds a repeatable audit that records a verdict for every registered tool.**
>
> - Each description says what the tool does, when to choose it over its named siblings, and any data-loss caveat. Its file-type sentence stays.
> - Everything else moves to the tool's help page. An input-combination rule moves into the description of the parameter it constrains.
> - Internal tracking numbers and version history leave every published text and the help index.
> - The server instructions' `help` line now says how to open a tool's full contract.
> - Each help-index entry becomes its tool's first sentence.
> - `npm run audit:descriptions` prints a Markdown report built from the live tool list, merging a hand-kept reviewer record.
>
> Behaviour, inputs, outputs and error codes are unchanged (FR-022). The fingerprint baseline is regenerated on purpose.
>
> **Owner rulings (2026-11-04)**, both Option A (end of this plan):
>
> - The existing-test edit list in contract §X is approved, with its stop rule.
> - The closed-vault note moves from the 9 descriptions to their help pages, `closedVaultNote` is deleted, and ADR-045 is amended.

## Summary

Research ([research.md](research.md)) measured the live surface at HEAD `ca36d07`, in-process, with no CLI probes.

Findings:

- **F1:** 35 tools publish 62,067 characters of description, and only 4 are under 400. The instructions are at 1,996 of the 2,000-character limit.
- **F2:** internal identifiers appear in 2 descriptions, 4 input root descriptions and the index. `UTF-8`, `UTF-16` and `V8` are public tokens.
- **F3:** 399 test assertions read description text: 119 will fail (110 detail, 9 length lower bounds), plus 2 identifier and instruction pins.
- **F4:** `describeSupport` sits in 16 descriptions (ADR-044); `closedVaultNote` (about 380 characters) sits in 9 (ADR-045).
- **F5:** some input rules exist only in tool descriptions, and the constitution's "Visible input rules" requires them published.
- **F6:** the instructions have 3 characters of headroom.
- **F7–F8:** how the scripts run, and how test-support modules stay out of `dist/`.

Decisions:

- **D1:** the description shape (contract §S).
- **D2:** the closed-vault note moves to the help pages (ruled A).
- **D3:** the identifier patterns P1–P7.
- **D4:** the pointer wording (contract §I).
- **D5:** the index is the first sentences, checked by a test.
- **D6:** one audit module, `src/tools/_description-audit.ts`, excluded from `dist/`.
- **D7:** the audit command, with a shared vitest-dump runner.
- **D8:** the reviewer record keyed by description and schema fingerprints.
- **D9:** which columns are computed and which are judged.
- **D10:** test edits only from the approved §X list (ruled A).

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. Unchanged.

**Primary Dependencies**: `@modelcontextprotocol/server` (SDK v2) and `@modelcontextprotocol/client` (in tests and scripts), and `zod` 4 for the reviewer-record schema. No new dependency.

**Storage**: one new hand-kept JSON file, `src/tools/_description-audit-record.json`. The report is printed, never stored (spec Assumptions).

**Testing**:

- `vitest run` with co-located `*.test.ts`, run through PowerShell.
- New: `src/tools/_description-audit.test.ts` (unit rows T-ID1 to T-REP7 and T-COL) and `src/tools/_description-quality.test.ts` (standing rows Q1 to Q7), on the live surface through `connectInMemoryClient`.
- No live CLI check is needed, because behaviour does not change. The test-execution gate does not apply.

**Target Platform**: Windows, macOS and Linux; CI runs on Linux and Windows. The script spawns `npx vitest` with `shell: true`, as the baseline writer does today.

**Project Type**: single project, an MCP server.

**Performance Goals**: none at runtime. Agents save about 50,000 characters of always-loaded context per session (SC-002).

**Constraints**:

- FR-022: no behaviour, input-shape or error change.
- Instructions under 2,000 characters (ADR-040 decision 4; I1 gives 1,997).
- ADR-040: no "call help first" sentence, and parameter descriptions are kept.
- ADR-044: the file-type sentence is kept.
- Constitution "Visible input rules" (contract S7).
- Refactor-decisions:
  - item 5: test edits only from the approved §X list, under the stop rule;
  - item 27(d): only tool names in backticks in the instructions;
  - item 30: test-support modules are excluded from the build by name.

**Scale/Scope**:

- **Changed source**:
  - 35 `src/tools/*/index.ts` description constants;
  - the input root descriptions in `src/tools/{properties,query_base,read_property,search}/schema.ts` (identifiers and history only);
  - parameter `.describe()` strings that receive a moved input rule (contract S7);
  - `src/instructions/instructions.ts` (one `RULES` line);
  - `src/tools/help/index.ts` (`HELP_DESCRIPTION`);
  - `src/tools/_shared.ts` (`closedVaultNote` removed; D2 was ruled A);
  - `tsconfig.build.json` (one exclude entry);
  - `package.json` (`audit:descriptions` script);
  - `scripts/write-register-baseline.ts` (uses the extracted runner).
- **New source**:
  - `src/tools/_description-audit.ts`;
  - `src/tools/_description-audit-record.json`;
  - `scripts/_vitest-dump.ts`;
  - `scripts/audit-descriptions.ts`.
- **New tests**: `src/tools/_description-audit.test.ts` and `src/tools/_description-quality.test.ts`.
- **Edited tests**: exactly the contract §X rows, after approval.
- **Regenerated**: `src/tools/_register-baseline.json`.
- **Docs**:
  - `docs/tools/index.md` (every entry);
  - `docs/tools/<name>.md` for facts moved in (§H);
  - `CHANGELOG.md` (§C).

**Resolved unknowns**: none open. Both policy rulings were given on 2026-11-04 (Owner rulings, below).

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | `_description-audit.ts` follows `_register-baseline.ts`. It is a test-support module under `src/tools/` that imports `../server.js` and `_mcp-client-fixtures.js`, is used only by tests and a script, and is excluded from the build. No production module imports it. The description constants stay in each tool's `index.ts`. The scripts import nothing from `src/`; the vitest dumper does. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | Every tool's description is modified. Their coverage, in the same change: the per-tool `index.test.ts` suites (unedited rows, plus the approved §X retargets), the standing checks Q1 to Q7 over the whole published list, and the existing `_surface.test.ts` and `_file-type-support.test.ts` checks. The new module has its own unit rows (§T). |
| **III. Boundary Input Validation with Zod** | **Y** | Tool schemas keep their shapes; only `.describe()` text changes. The reviewer record, a file the audit reads, is parsed by a strict zod schema (data-model E9). |
| **IV. Explicit Upstream Error Propagation** | **N/A** | No handler, error path or code changes. The audit command is developer tooling outside the MCP boundary: an invalid record fails the command with zod's issue list and a non-zero exit, and never produces a silent partial report. |
| **V. Attribution & Layered Composition** | **Y** | Every new `.ts` file carries `// Original — no upstream. …`. The JSON record has no header slot, as with `_register-baseline.json`. |
| **ADR-010 / ADR-013 / ADR-014** | **N/A** | No tool is added or renamed. |
| **ADR-015** (sub-discriminators) | **N/A** | No `details.reason` or `details.code` changes. |
| **MCP Tool Surface Standards** | **Y** | Titles, annotations and parameter-description coverage are unchanged (`_surface.test.ts`). Visible input rules stay published, because rules move into parameter descriptions (S7). Instructions stay under 2,000 characters, with an opening of at most 512 unchanged. The baseline is regenerated deliberately in the same PR. |
| **Security Defaults** | **Y** | `obsidian_exec` keeps the blocked-command and `OBSIDIAN_MCP_ALLOW_EVAL` caveat (S3). No gate, elicitation or containment code changes. |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**ADR conflicts**:

- **ADR-045 decision 2** ("The six descriptions say so through one shared sentence, `closedVaultNote(command)`") conflicted with the 400-character budget and with FR-003. It is resolved by the owner's Amendment 2026-11-04 on ADR-045 (plan question 2, Option A): the reference pages carry the note, and the descriptions do not.
- **ADR-040** is honoured: no help-first sentence, parameter descriptions kept, rules in the instructions. ADR-005 is already superseded.
- **ADR-044**: the file-type sentence is kept.
- **ADR-046**: each `case_sensitive` default stays stated in its parameter description.

### CodeGraph structural check

Queries: `closedVaultNote describeSupport HELP_DESCRIPTION createServer buildMcpServer`, `buildInstructions instructions.ts routing lines`, `fingerprintLiveRegistry _register-baseline.ts regenerate baseline script`, and the `SET_PROPERTY_DESCRIPTION` / `executeHelp` reads in clarify.

- **Affected modules**:
  - every `src/tools/<name>/index.ts`: description constants, which are leaf strings passed to `registerTool` and read by that tool's `index.test.ts` and the surface tests;
  - four `schema.ts` root descriptions, plus the parameter `.describe()` strings receiving moved rules;
  - `src/instructions/instructions.ts` (`RULES`), whose output reaches `createServer()` through `buildInstructions`;
  - `src/tools/help/index.ts`;
  - `src/tools/_shared.ts` (`closedVaultNote`, whose callers are the 9 description constants and their tests);
  - the scripts.
- **Blast radius**:
  - **Descriptions:** published-surface bytes. They are read by the registry fingerprint gate (`_register.test.ts` against `_register-baseline.json`), `_surface.test.ts`, `_file-type-support.test.ts` and the per-tool index tests (research F3). No runtime code reads them.
  - **`buildInstructions`:** called from `server.ts` and tested by `instructions.test.ts` and `server.protocol.test.ts`.
  - **`describeSupport`:** keeps its callers.
  - **`closedVaultNote`:** loses all of them, so it is deleted (D2, ruled A).
- **Kernel nodes**:
  - **`createServer()`** (the boot-spine entry point) is not edited. It calls `buildInstructions`, whose text changes in one line, and `assertToolDocsExist`, which is unchanged. `_description-audit.ts` calls it the way `fingerprintLiveRegistry` already does.
  - **`createLogger()` / `createQueue()`** (the boot-time DI factories) are not touched, and no new production file constructs them. Only the test-support module reaches them, indirectly through `createServer()`.
  - **`UpstreamError`** (the error-spine value type) is not touched, and gains no construction site.

  The kernel-node touch surface is therefore none. The only boot-path change is instruction text, so the post-implement check verifies the "no kernel node touched" claim.

## Project Structure

### Documentation (this feature)

```text
specs/092-audit-tool-descriptions/
├── plan.md                                   # This file
├── research.md                               # F1–F8, D1–D10, follow-ups
├── data-model.md                             # E1–E10: surface, description, roster, patterns, record, report
├── quickstart.md                             # approval gate, baseline regression, standing checks + red checks, full gate, audit report, structural check
├── contracts/
│   └── description-audit-contract.md         # §P surface, §S rules, §I pointer text, §A command, §T new rows, §X test edits, §H page moves, §C changelog
├── checklists/requirements.md
└── tasks.md                                  # Phase 2: /speckit-tasks
```

### Source Code (repository root)

```text
src/tools/_description-audit.ts                 # NEW: budgets, FAMILIES, SHARED_FIELDS, INTERNAL_ID_PATTERNS, findInternalIds,
                                                #      firstSentence, parseIndexEntries, siblingsOf/missingSiblings,
                                                #      descriptionAuditRecordSchema, collectPublishedSurface, renderAuditReport
src/tools/_description-audit.test.ts            # NEW: T-ID1 … T-REP7, T-COL
src/tools/_description-quality.test.ts          # NEW: Q1 … Q7 (standing checks on the live surface)
src/tools/_description-audit-record.json        # NEW: reviewer judgement record, filled for all 35 tools + 15 routing lines
src/tools/*/index.ts                            # 35 description constants (contract §S)
src/tools/{properties,query_base,read_property,search}/schema.ts   # root descriptions: identifiers + history removed
src/tools/*/schema.ts                           # parameter .describe() strings that receive a moved input rule (S7)
src/tools/help/index.ts                         # HELP_DESCRIPTION (§I2)
src/tools/_shared.ts                            # closedVaultNote removed (D2, ruled A)
src/tools/_shared.test.ts                       # closedVaultNote test removed (§X X-CV)
src/instructions/instructions.ts                # RULES help line (§I1)
src/tools/_register-baseline.json               # regenerated
scripts/_vitest-dump.ts                         # NEW: runVitestDump, extracted from write-register-baseline.ts
scripts/write-register-baseline.ts              # uses runVitestDump (output byte-identical)
scripts/audit-descriptions.ts                   # NEW: npm run audit:descriptions
package.json                                    # "audit:descriptions" script
tsconfig.build.json                             # exclude src/tools/_description-audit.ts
docs/tools/index.md                             # every entry = first sentence
docs/tools/<name>.md                            # facts moved in (§H)
CHANGELOG.md                                    # §C
# Edited tests: exactly contract §X, after approval.
# UNCHANGED: src/errors.ts, src/server.ts, every handler.ts, every input-schema shape and output schema.
```

**Structure Decision**: single project.

- **Descriptions** stay with their tools.
- **The audit logic** lives in one test-support module beside `_register-baseline.ts`, its closest precedent. Both read the published surface the way a client does.
- **The standing checks** get their own test file instead of growing `_surface.test.ts`, so the budget and identifier rules have one obvious home.
- **The script** is thin. It gathers the metadata, runs the dumper and prints, so all logic is unit-tested in the module.

**Docs-as-code**: after review, `/speckit-docs-as-code <n>` updates the `.docs-as-code/` pages on the published tool surface:

- the description rules and budgets;
- the help pointer;
- the index format;
- the audit command and reviewer record;
- the closed-vault note's new home.

## Phase 0: Research → research.md

- **Method:** in-process measurement of the published surface (F1, F2), a read-only sweep of every test reading description text (F3), and code reads of the shared sentences, the instructions builder and the script runner (F4 to F8). No vault or CLI was touched.
- **Plan-time spec alignment:**
  - FR-015's roster gains `metadata-search` (`find_by_property`, `tag`), from the routing line pairing them, and the link-graph family is named `note-structure` (data-model E6).
  - FR-008 now reads "names no tool other than `help`" (reworded after analyze A1, matching ADR-040). The instructions must name `help` to say how to open the contract.
  - FR-021a's "description text it was judged on" also covers the input schema, so a parameter-description change marks verdicts stale (D8).
- **Follow-ups:** help pages keep internal identifiers; the input root descriptions stay long (research Follow-ups).

**Output**: research.md. No `NEEDS CLARIFICATION` remains; the two policy rulings are below.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md):**
  - E1 to E5: the surface, the description, parameter descriptions, the first sentence and the index entry;
  - E6 and E7: the family and shared-field rosters;
  - E8: the identifier patterns;
  - E9: the reviewer record and its needs-review states;
  - E10: the report layout and its invariants.
- **[contracts/description-audit-contract.md](contracts/description-audit-contract.md):**
  - §P: the published-surface changes;
  - §S: the description rules S1 to S8;
  - §I: the exact instruction line and `help` description;
  - §A: the command;
  - §T: the new test rows;
  - §X: the existing-test edits awaiting approval;
  - §H: the help-page move procedure;
  - §C: the CHANGELOG text.
- **[quickstart.md](quickstart.md):**
  - the approval gate;
  - the baseline-script regression;
  - the standing checks with three red checks;
  - the full gate;
  - the audit report expectations (35 rows, 0 needs-review);
  - the index spot check;
  - the structural check.
- **Agent context**: the mandatory `after_plan` agent-context hook ran, but its script needs Python with PyYAML, which this machine lacks, so it skipped. The one change it makes, the plan pointer in `CLAUDE.md`'s managed block, was made by hand: it now names this plan.

## Phase 1 re-check (post-design Constitution Check)

- **I:** one test-support module plus scripts. No production import of the audit module, no cycle, excluded from `dist/`.
- **II:** every modified tool is covered by its index suite and the registry-wide standing checks, and the new module has unit rows.
- **III:** the record is parsed by strict zod, and the tool schemas are unchanged in shape.
- **IV:** N/A, since no failure path changes.
- **V:** headers on the new files.
- **Tool Surface Standards:** a deliberate surface change with the baseline regenerated; visible rules kept (S7); instructions at 1,997 characters with the opening untouched.
- **Security Defaults:** the `obsidian_exec` caveat is kept.

**No gate regressed; Complexity Tracking is empty.**

### Spec alignment note

| FR | Covered by |
|---|---|
| FR-001, FR-002, FR-003 | §S1–S5; Q1; reviewer `purpose` and `safety` |
| FR-004, FR-004a | §H, §S7, §S8; reviewer `detail` |
| FR-005, FR-007 | D3 / E8; Q3; T-ID1–T-ID3 |
| FR-006 | reviewer `selfContained`; the index rewrite (§I3) |
| FR-008, FR-009, FR-010 | §I1, §I2; Q4; existing `FORBIDDEN_IN_DESCRIPTIONS` |
| FR-011, FR-011a, FR-015 | E6; computed sibling check (D9); reviewer `family`; routing map |
| FR-012, FR-016 | E7; appendix; reviewer `sharedFields` |
| FR-013 | D5 / §I3; Q5 |
| FR-014 | Q2; report header |
| FR-017 | Q1–Q7 standing (Q7: one report row per registered tool); judgement verdicts never gate (Q6 checks schema validity only, Q7 row shape only) |
| FR-018–FR-021b | §A; E9 / E10; T-REP1–T-REP7, T-COL, Q7; record filled at implement end |
| FR-022 | §P "Unchanged"; the baseline diff limited to description and schema fingerprints; §X stop rule |

## Owner rulings

Both were ruled on 2026-11-04 and recorded on BI-0027. They are also recorded in `.memory/refactor-decisions.md` item 5.

1. **Existing-test edits (refactor-decisions item 5): Option A.** The contract §X edit list is approved as written, with its stop rule. X-CV applies, because Question 2 was ruled A.
   - Any existing assertion that fails and is not on the list stops the work and goes back to the owner.
   - The 38 LIKELY-KEEP assertions are kept by wording the descriptions to satisfy them, never by editing the tests.
2. **Closed-vault note (ADR-045 decision 2): Option A.** This is recorded as Amendment 2026-11-04 on ADR-045 in the vault.
   - The closed-vault sentence is dropped from the 9 descriptions (`bases`, `create_base`, `paths`, `pattern_search`, `query_base`, `smart_connections_query`, `smart_connections_similar`, `tag`, `views_base`).
   - Each of those help pages states two things: the vault-unavailable answer (`Error: Command "<cmd>" not found.`, an uncoded `CLI_REPORTED_ERROR`), and that a closed registered vault is opened automatically. `tag.md` gains the second.
   - `closedVaultNote` and its unit test are deleted, and contract §X row X-CV applies.
   - The rest of ADR-045 stands: the error is unchanged, has no `details.code` or `details.reason`, and is recognised by `COLD_START_PATTERN`.

**ADR conflicts after the ruling**: none open. The ADR-045 conflict is resolved by the owner's amendment.

## Complexity Tracking

None.
