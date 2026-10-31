# Implementation Plan: Align Parameter Names

**Branch**: `073-align-parameter-names` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/073-align-parameter-names/spec.md`

> **Modify three existing typed tools and add one shared leaf module.** No new tool, error code, sub-code or dependency. Seven parameters get new names; the old names stay accepted, with a deprecation notice in the result, until the next major release.

## Summary

Within a tool family, one concept should carry one parameter name. The audit (spec Background) found seven mismatches, all in three tools:

- **`find_by_property`**: `property` → `name`, `arrayMatch` → `array_match`, `caseSensitive` → `case_sensitive`.
- **`find_and_replace`**: `case_insensitive` → `case_sensitive` (inverted polarity), `subfolder` → `folder`.
- **`create_base`**: `path` → `base_path`, `view` → `view_name`.

**Primary requirements** (spec after clarify):

- the new names are accepted, with today's meaning and defaults (FR-001 to FR-009);
- the old names are accepted until the next major release, with the same result plus a `deprecated_parameters` notice in the result object (FR-010, FR-011; clarify Q1);
- old plus new in one call is rejected (FR-012);
- old names stay published and marked deprecated (FR-013);
- the post-removal rejection (FR-014) is the end-state contract of a follow-up feature (FR-015);
- the convention is recorded as a new ADR. Its canonical copy lives in the vault (`200-Decisions/`); this feature writes the verbatim repository mirror in `.docs-as-code/decisions/` under the placeholder `ADR-NNN`, noting that the vault copy is pending sync (FR-016, FR-017; clarify Q2);
- the docs use the new names (FR-018).

**Technical approach** ([research.md](research.md)):

- **D1**: Each affected zod input schema declares both keys. Its `superRefine` rejects conflicts and validates the resolved value under the new name. A final `.transform()` hands the handler new names only, plus a `deprecated_parameters` list. The published JSON Schema shows both keys; handlers see one (Principle III). `registerTool` is not changed.
- **D2**: A new leaf module, `src/tools/_deprecated-params.ts`, holds the alias field builder, the conflict issue, the result-field schema and `withDeprecatedParameters`.
- **D3**: The new keys drop the zod `.default()` (presence must be detectable); the defaults move into the transform, unchanged.
- **D4**: The optional result field `deprecated_parameters: [{ parameter, replacement, note? }]` is declared on the three output schemas and attached in each `index.ts` handler wrapper.
- **D5**: `name` and `base_path` are enforced as required at parse time, and are left out of the published `required` during the transition.
- **D6 and D7**: Errors name the new parameter. Machine-readable codes and `details` keys stay. The one deliberate move is `params.field` `path` → `base_path` on `create_base`.
- **D8**: the ADR-NNN repository mirror (number allocated at the vault–repository sync).
- **D9**: Descriptions (each new key opens with its siblings' wording, verbatim, per FR-008 and contract §1), reference pages, README and changelog.
- **D10**: Tests.

The exact published surface is in [contracts/parameter-names-contract.md](contracts/parameter-names-contract.md).

**T0 gate**: none. Every `invokeCli` call and filesystem operation stays byte-identical (research F9). Handler tests assert that the CLI arguments are unchanged. The live check in [quickstart.md](quickstart.md) §4 is optional.

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. Unchanged.
**Primary Dependencies**: `zod` 4 (`superRefine`, object `.transform()`, `.meta({ deprecated: true })`, all verified at plan time, research F2 and F4), and `@modelcontextprotocol/server` (SDK v2). **No new dependency.**
**Storage**: N/A.
**Testing**: `vitest run`, co-located `*.test.ts`. The handler tests use the existing `spawnFn` and in-memory filesystem seams. Published-schema assertions are in `_register.test.ts`, the output contract is checked by the `_surface.test.ts` typed-result round trip over `_typed-result-fixtures.ts`, and the fingerprint baseline by `_register-baseline.test.ts`.
**Target Platform**: Windows, macOS and Linux; CI runs on Linux and Windows.
**Project Type**: Single project, an MCP server (`src/**`).
**Performance Goals**: N/A. Parsing adds one transform per call.
**Constraints**:

- zero new error codes or sub-codes (Principle IV);
- every existing result field and machine-readable error field unchanged (FR-009, contract §4);
- no edit to `src/tools/_register.ts`, `src/cli-adapter/**`, `src/errors.ts` or `src/server.ts`;
- CLI arguments byte-identical;
- runtime defaults unchanged. The published `default` value is dropped for `find_by_property.array_match`, `find_by_property.case_sensitive` and `find_and_replace.case_sensitive` during the transition (research D3; spec Assumptions on FR-009).

**Scale/Scope**:

- **Three tool modules**: `schema.ts`, `index.ts` and `handler.ts`, with their tests.
- **One new module and its test.**
- **Two shared-helper comments** (`_base-path.ts`, `_required-string.ts`).
- **Pinned test data**: `_register.test.ts` and `_typed-result-fixtures.ts`.
- **Baseline**: regenerated.
- **Docs**: four `docs/tools/*.md` pages, `README.md` and `CHANGELOG.md`.
- **ADR-NNN**: the repository mirror only. The vault copy is pending sync.

**Resolved unknowns**: all (research F1 to F10, D1 to D11; clarifications on the transition, Q1 and Q2).

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | Edits stay in each tool's own `{schema, index, handler}.ts`. The new `_deprecated-params.ts` is a leaf util in `src/tools/` beside `_base-path.ts` and `_required-string.ts`. It imports only `zod`, and the three tools import it downward. No tool→tool edge and no cycle. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | Each modified tool ships happy-path tests (new names; old names with the notice) and failure or boundary tests (conflict, missing required concept, invalid value under an old name, published-schema shape) in co-located `schema.test.ts`, `index.test.ts` and `handler.test.ts`. The new module has `_deprecated-params.test.ts`. All in the same change. |
| **III. Boundary Input Validation with Zod** | **Y** | The zod schema stays the single source of truth for the published shape (both keys), the runtime parse (conflicts, validation, defaults) and the handler types (`z.infer` of the transform output, new names only). No hand-rolled key checks outside zod. |
| **IV. Explicit Upstream Error Propagation** | **Y** | No new error code, sub-code or class. Conflicts and missing names are zod issues that flow through each tool's existing `VALIDATION_ERROR` channel before any spawn or read. No silent fallback: old plus new is rejected, never resolved quietly. One existing `UpstreamError` message (find_and_replace folder not-found) is reworded; its code and `details` are unchanged. |
| **V. Attribution & Layered Composition** | **Y** | The new file carries an `Original — no upstream.` header. The modified files keep their headers, with intent lines updated where they name the old keys (`find_by_property/schema.ts`, `find_and_replace/schema.ts`, `_base-path.ts`, `_required-string.ts`). |
| **ADR-010** (tool names) | **N/A** | No tool renamed or added (spec Out of scope). |
| **ADR-013 / ADR-014** | **N/A** | No plugin-backed tool touched. |
| **ADR-015** (sub-discriminators) | **Y** | No sub-reason added or removed. `INVALID_SUBFOLDER`, `SCOPE_CONFLICT` reasons, `INVALID_BASE_PATH`, `BASE_NOT_FOUND` and `INVALID_NAME` are unchanged. |
| **ADR-040** (published parameter descriptions) | **Y** | Every key, new and deprecated, is described. The deprecated descriptions name the replacement and the transition, and the old keys also publish `deprecated: true`. |
| **MCP Tool Surface Standards** | **Y** | Titles and annotations unchanged. Every parameter described. `outputSchema` and `structuredContent` keep identical text, and the notice is a declared optional field (clarify Q1). The three tools' description, schema and output fingerprints move deliberately; the reviewer checks that nothing else moves (contract §5). |
| **Security Defaults** | **Y** | `find_and_replace` keeps its preview default, multi-note commit confirmation and `realpath` containment. A `subfolder` scope is honoured exactly like `folder`, so it never widens to the whole vault. Old keys stay published so that clients that drop undeclared keys cannot strip a scope (spec Edge Cases, FR-013). |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**Kernel-node attention (per CLAUDE.md)**: `createServer`, `createLogger` and `createQueue` are not touched, and no edge is added or removed. `UpstreamError` gains and loses no construction site; one message string in `find_and_replace/handler.ts` (`resolveScope`, not-found folder) changes wording only. The class and `src/errors.ts` are unchanged.

**ADR note**: **ADR-NNN** (new, a sibling of ADR-010) records the parameter-name convention. It supersedes nothing and carries no Constitution Compliance row.
- **Canonical copy**: the vault (`200-Decisions/`).
- **This feature**: writes only the verbatim repository mirror in `.docs-as-code/decisions/`, under a placeholder number, with a note that the vault copy is pending sync.
- **At sync**: the number is allocated and the mirror renamed, so that the two copies are byte-equal (ADR-010 Implementation; owner's Q2 ruling on BI-0109).

## Project Structure

### Documentation (this feature)

```text
specs/073-align-parameter-names/
├── plan.md                                  # This file
├── research.md                              # Findings F1–F10, decisions D1–D11
├── data-model.md                            # Renames, normalised input, notice, ADR-NNN outline
├── quickstart.md                            # Automated gate, baseline check, per-story checks, optional live check
├── contracts/
│   └── parameter-names-contract.md          # Published keys, outcomes O1–O7, result field, stable surface, baseline
├── checklists/requirements.md
└── tasks.md                                 # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
src/tools/_deprecated-params.ts              # NEW: deprecatedAlias, appendAliasConflictIssue,
                                             #      deprecatedParametersField, withDeprecatedParameters
src/tools/_deprecated-params.test.ts         # NEW
src/tools/find_by_property/
├── schema.ts        # name/array_match/case_sensitive + deprecated aliases; superRefine; transform; output field
├── schema.test.ts   # O1–O6, published-schema shape
├── handler.ts       # reads input.name / array_match / case_sensitive; eval payload keys unchanged
├── handler.test.ts  # new names; payload byte-identical
├── index.ts         # description rewritten (NOTE paragraph replaced); wrapper attaches the notice
└── index.test.ts    # notice in text + structuredContent; description assertions
src/tools/find_and_replace/
├── schema.ts        # case_sensitive/folder + deprecated aliases; superRefine on resolved values; transform; field on both branches
├── schema.test.ts
├── handler.ts       # compileFindRegex(…, !input.case_sensitive); effectiveSubfolder reads input.folder; not-found message says folder
├── handler.test.ts, scope.test.ts, confirm.test.ts, __t0-driver.test.ts   # inputs move to new names
├── index.ts         # description rewritten; mapper keys on "folder"; wrapper attaches the notice
└── index.test.ts
src/tools/create_base/
├── schema.ts        # base_path/view_name + deprecated aliases; appendBasePathIssues(…, "base_path"); transform; output field
├── schema.test.ts
├── handler.ts       # reads input.base_path / view_name; CLI params path/view unchanged
├── handler.test.ts
├── index.ts         # description rewritten; wrapper attaches the notice
└── index.test.ts
src/tools/_base-path.ts, _base-path.test.ts            # comment: create_base field is now base_path
src/tools/_required-string.ts                          # comment: create_base base_path
src/tools/_register.test.ts                            # property sets / required lists for the three tools
src/tools/_typed-result-fixtures.ts                    # new names + one old-name fixture each (find_by_property, find_and_replace, create_base)
src/tools/_register-baseline.json                      # regenerated (contract §5)
docs/tools/{find_by_property,find_and_replace,create_base,index}.md
README.md                                              # line 180: subfolder → folder
CHANGELOG.md                                           # [Unreleased] Changed + Deprecated
.docs-as-code/decisions/ADR-NNN-shared-parameter-names-within-a-tool-family.md   # verbatim repo mirror (FR-016);
                                                       #   placeholder number; vault copy (200-Decisions/) pending sync
# NOT WRITTEN HERE: the vault copy and .decisions/ (allocated and synced by the owner)

# UNCHANGED: src/tools/_register.ts, src/cli-adapter/**, src/errors.ts, src/server.ts,
#   src/instructions/**, find_by_property/_template.ts, find_and_replace/replace.ts,
#   every other tool module
```

**Structure Decision**: Single project. The changes stay inside the three tool modules, plus one leaf util in `src/tools/` that they share.

**Docs-as-code**: the other `.docs-as-code/` pages that name the old keys (`architecture.md`, `capabilities/mutate.md`, `capabilities/bases.md` if it names `create_base`'s `path`) are updated by `/speckit-docs-as-code <n>` after review, per the PR lifecycle in CLAUDE.md. The ADR-NNN mirror is part of this feature because FR-016 requires it.

## Phase 0: Research → research.md

- **F1**: The seven old keys live in three modules, and only those modules read them.
- **F2**: The input schema is parsed inside `registerTool`, and the handler gets the parse output. An object-level transform publishes both keys and hands over one (probed).
- **F3**: zod defaults hide presence.
- **F4**: `deprecated: true` is publishable (probed).
- **F5**: The output schemas are strict and reused in handlers.
- **F6**: The validation-error mapping per tool.
- **F7**: The documentation surface.
- **F8**: The fingerprint baseline.
- **F9**: The CLI arguments are unchanged, so no T0.
- **F10**: ADR numbering has drifted between the vault and the repository. The vault is canonical, so this feature writes the repository mirror under the placeholder `ADR-NNN`.
- **D1 to D11**: as summarised above.

**Output**: research.md, with no `NEEDS CLARIFICATION` remaining.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)**: the rename table with mapping, defaults and required-ness; rules R1 to R4; the lifecycle; the normalised handler input; the notice field; the ADR-NNN outline.
- **[contracts/parameter-names-contract.md](contracts/parameter-names-contract.md)**: published keys and descriptions per tool, outcomes O1 to O7, examples of the result field, the stable machine-readable surface and the baseline expectation.
- **[quickstart.md](quickstart.md)**: the automated gate, the baseline diff check, per-story checks and an optional live check (under `.memory/test-execution-instructions.md`).
- **Agent context**: the `CLAUDE.md` SPECKIT block now points at this plan.

## Phase 1 re-check (post-design Constitution Check)

Re-evaluated against the data model and the contract:

- **III**: the transform keeps one zod source for the shape, the parse and the types.
- **IV**: no new code; conflicts are rejected, never resolved quietly; contract §4 lists what stays byte-stable.
- **I**: the new module is a downward leaf with no tool→tool edge.
- **II**: every outcome O1 to O7 has a co-located test per tool.
- **V**: headers kept and updated.
- **MCP Tool Surface Standards**: only the three tools' fingerprints move, deliberately.
- **Security Defaults**: unchanged, and strengthened against scope stripping by FR-013.

**No gate regressed; Complexity Tracking is empty.**

### CodeGraph structural check

Run with `codegraph_explore` at plan time (HEAD `37ec913`).

**Affected symbols and blast radius**:

- `executeFindByProperty` (`src/tools/find_by_property/handler.ts:18`): callers are only in `find_by_property/index.ts`. Tests: `handler.test.ts`.
- `executeFindAndReplace` (`src/tools/find_and_replace/handler.ts:583`): callers in `find_and_replace/index.ts`. Tests: `handler.test.ts`, `scope.test.ts`, `confirm.test.ts`, `__t0-driver.test.ts`. Internal path: `executeFindAndReplace` → `resolveScope` / `multiNoteCommitQuestion` → `effectiveSubfolder` (`:514`), and `scanNotes` → `compileFindRegex` (`replace.ts:20`, callers only in `handler.ts`; its signature stays `caseInsensitive: boolean`, and the call site passes `!input.case_sensitive`).
- `executeCreateBase` (`src/tools/create_base/handler.ts:29`): callers only in `create_base/index.ts`. Tests: `handler.test.ts`.
- `createFindByPropertyTool`, `createFindAndReplaceTool`, `createCreateBaseTool`: called from `src/server.ts` (boot spine, unchanged) and `_typed-result-fixtures.ts`.
- `appendBasePathIssues` (`src/tools/_base-path.ts:29`): its callers are the `views_base`, `query_base` and `create_base` schemas. Only `create_base`'s call changes, and only its `field` argument. `query_base` and `views_base` are unaffected.
- `requiredString` (`src/tools/_required-string.ts:14`): `create_base` keeps using it for `name`, and for `base_path`'s wrong-type message. `query_base` is unaffected.
- `registerTool` (`src/tools/_register.ts:153`): among the most-depended-on symbols; **not edited**. The three tools still register through it unchanged.

**Kernel-node touch surface**:

- `createServer`, `createLogger`, `createQueue`: not touched; no edge added or removed.
- `UpstreamError`: no construction site added or removed. One message string reworded in `resolveScope`; the class and the code list are unchanged.

High-blast-radius surface: none edited.

**Post-implement structural verification** (after `codegraph sync`):

1. No new error class or code. `src/errors.ts` is unchanged, and every new failure is a zod issue through the existing `VALIDATION_ERROR` channel.
2. No handler imports `createLogger` / `createQueue`, and `server.ts` is unchanged.
3. `_deprecated-params.ts` imports only `zod`. Its importers are exactly the three tools' `schema.ts` / `index.ts`, so no upward or cyclic import.
4. Every exported symbol of `_deprecated-params.ts` has a production caller in at least one of the three tools, so none is orphaned.
5. Only the three tools' description, schema and output fingerprints moved in the baseline.

## Follow-ups (out of scope)

- **Removal (next major release)**: delete the old keys' acceptance and keep them declared only to reject them with an error naming the new parameter (FR-014, User Story 2 scenarios 4 and 5, SC-003). Restore `required` for `find_by_property.name` and `create_base.base_path`. Retire `deprecated_parameters`, or keep it unused. Recorded in ADR-NNN as the planned end state.

## Complexity Tracking

> No Constitution Check violations; the table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
