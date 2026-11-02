# Implementation Plan: Reconcile Help Documentation

**Branch**: `084-reconcile-help-docs` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/084-reconcile-help-docs/spec.md`

> **This change makes the server's published guidance match the server.** Most of it is help-page text. The code changes are small: `create_base` gains a validation-error mapper (Q1 = B), `rename`'s recovery hint names `move`, and a new test guards the help index and pages against the offered tools (Q3 = A). No tool is added or removed, no error code is added, and no tool description or schema byte moves.

## Summary

Research ([research.md](research.md)) found, at HEAD `52fd0eb`:

- **F1**: two phantom help pages and index entries (`list_notes`, `search_vault`);
- **F2**: one stale tool name (`move_note` in `rename`'s hint and page);
- **F3**: one invalid working example (`write_note.md` migrates to an `obsidian_exec` call using a non-existent `argv` key);
- **F4**: quoted messages that drifted (`(FR-0xx)` suffixes, zod 3 wording);
- **F5**: `views_base` Example 7 claims `params.*` fields;
- **F6**: `create_base` drops the `details.code` / `details.reason` it documents;
- **F7**: `context_search` Example 4 shows the folder text as the top-level message.

The decisions:

- **D1**: delete the two placeholder pages and index lines; the help handler is unchanged.
- **D2**: new test `src/tools/help/docs-sync.test.ts` with a pure `helpDocsDrift` helper and its self-tests.
- **D3**: local `mapValidationError` in `create_base/index.ts`, adding `details.code` / `reason` / `field` next to the unchanged `details.issues`.
- **D4**: `rename` message `move_note` → `move`.
- **D5**: valid `obsidian_exec` migration example.
- **D6**: message and detail corrections in failing examples.
- **D7**: `context_search` Example 4 shows the error as returned.
- **D8**: vault names from the TC-00586 / TC-00587 records.
- **D9**: CHANGELOG; docs-as-code after review.

The row-by-row behaviour is in [contracts/help-reconciliation-contract.md](contracts/help-reconciliation-contract.md).

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. Unchanged.

**Primary Dependencies**: `@modelcontextprotocol/server` (SDK v2), `zod` 4. No new dependency.

**Storage**: none. `docs/tools/*.md` ships in the package (`package.json` `files`) and is read at runtime by `help`.

**Testing**: `vitest run` with co-located `*.test.ts`, run through PowerShell. The live checks in quickstart §3 use `TestVault-Obsidian-CLI-MCP` only.

**Target Platform**: Windows, macOS, Linux; CI on Linux and Windows. The docs-sync test reads files with `node:path` `join` and compares names, not paths, so separators do not matter.

**Project Type**: single project, an MCP server.

**Performance Goals**: none. One extra in-memory pass over the validation issues on a failed `create_base` parse only.

**Constraints**:
- FR-013: only the error and message changes named here.
- No new error code or `reason` (Principle IV, ADR-015).
- `src/cli-adapter/**` frozen (Q2).
- No boot-behaviour change (D2).
- The FR-018 baseline passes without regeneration (contract §6).

**Scale/Scope**:
- **Code**:
  - `src/tools/create_base/index.ts` (mapper);
  - `src/tools/rename/schema.ts` (one message).
- **New test**: `src/tools/help/docs-sync.test.ts`.
- **Added assertions**: `src/tools/context_search/{handler,index}.test.ts` (missing-folder error fields).
- **Edited tests**: see Test-edit scope below.
- **Docs**:
  - delete `docs/tools/list_notes.md`, `docs/tools/search_vault.md`;
  - edit `docs/tools/{index,help,rename,write_note,create_base,context_search,search,properties,views_base}.md` (+ D8 items);
  - `CHANGELOG.md`;
  - the `CLAUDE.md` plan pointer (through the `after_plan` hook).

**Resolved unknowns**: none open. D8's item list comes from the audit records at implementation. Its rule is fixed here.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | No new production module. The mapper is a local function in `create_base/index.ts`, beside its registration, as in `prepend` and `find_and_replace`. The docs-sync test imports `_mcp-client-fixtures.ts` (test support) and `node:fs`, nothing upward. No tool → tool edge. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | `create_base` (behaviour change): C1–C8 failure rows, C9 generic boundary row, C10 happy path, all in `create_base/index.test.ts`. `rename` (message change): `schema.test.ts` + `index.test.ts`. `help` (served content changes): `handler.test.ts` H6. `context_search` (help page rewritten, no code change): its missing-folder error fields are pinned in `handler.test.ts` / `index.test.ts` (S1). Drift guard: H1–H2 real check, H5 happy-path self-test, H3–H4 failure self-tests. |
| **III. Boundary Input Validation with Zod** | **Y** | No schema shape change. The mapper reads the issues Zod already produced, including the `params` set by `appendBasePathIssues` and the `create_base` superRefine. No hand-rolled input check. |
| **IV. Explicit Upstream Error Propagation** | **Y** | Only `VALIDATION_ERROR`, with existing `details.code` / `reason` values. No silent fallback: the generic envelope is kept for all other issues. `context_search`'s error propagation is unchanged and now documented as returned. |
| **V. Attribution & Layered Composition** | **Y** | The new test file carries `// Original — no upstream.`. Edited files keep their headers. `create_base/index.ts`'s header line is extended to mention the mapper. |
| **ADR-010 / ADR-013 / ADR-014** | **N/A** | No tool added or renamed; no plugin-backed tool touched. |
| **ADR-015** (sub-discriminators) | **Y** | `create_base` now surfaces its existing `reason` values at `details.reason`, the convention the ADR defines. No new value. |
| **ADR-040** (published descriptions) | **Y** | No description changes. The help pages (long reference) change. |
| **ADR-046** (shared parameter names) | **Y** | No parameter renamed. `details.field` reports `base_path` for the deprecated `path` alias, as validation already does. |
| **MCP Tool Surface Standards** | **Y** | Titles, hints, descriptions, input and output schemas unchanged; the fingerprint gate must pass without regeneration. The `help` index still lists every offered tool, now and only those. |
| **Security Defaults** | **Y** | Untouched: no new command, mode or write path. `obsidian_exec`'s corrected example uses `create`, which is not in the blocked set, and passes no `=` in `command`. |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**Kernel-node attention (per CLAUDE.md)**: none of the kernel nodes is touched. `createServer()` is not edited. The new test calls it through `quietServer()`, as `_surface.test.ts` does. `createLogger()` and `createQueue()` gain no production caller. `UpstreamError` is not constructed by any new code: the mapper returns a `ToolErrorPayload`, and `src/errors.ts` is unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/084-reconcile-help-docs/
├── plan.md                                   # This file
├── research.md                               # F1–F8 findings, D1–D9 decisions, follow-ups
├── data-model.md                             # E1–E6, rules V1–V7
├── quickstart.md                             # automated gate, surface gate, live L1–L5
├── contracts/
│   └── help-reconciliation-contract.md       # §1 H1–H7, §2 N1–N3, §3 X1–X6, §4 C1–C10, §5 S1–S2, §6 surface
├── checklists/requirements.md
└── tasks.md                                  # Phase 2: /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
src/tools/create_base/index.ts               # mapZodIssuesToToolError + mapValidationError (D3)
src/tools/create_base/index.test.ts          # C1–C10
src/tools/rename/schema.ts                   # hint names `move` (D4)
src/tools/rename/{schema,index}.test.ts      # assertions move_note → move
src/tools/help/docs-sync.test.ts             # NEW: helpDocsDrift + self-tests + real check (D2)
src/tools/help/handler.test.ts               # orphan-page case → H6 not-found case
src/tools/context_search/{handler,index}.test.ts  # pin the missing-folder error fields (S1; test-only, C2)
docs/tools/list_notes.md                     # DELETED
docs/tools/search_vault.md                   # DELETED
docs/tools/index.md                          # two lines removed
docs/tools/help.md                           # HELP_TOOL_NOT_FOUND example: 35 names
docs/tools/rename.md                         # :128, :283 name `move`
docs/tools/write_note.md                     # :111, :240 valid obsidian_exec call
docs/tools/create_base.md                    # error roster + Example 5: details.code/reason/field/issues
docs/tools/context_search.md                 # Example 4 envelope (E6); Example 6 message
docs/tools/search.md                         # Example 7 message
docs/tools/properties.md                     # Example 5 + unknown-key wording (zod 4)
docs/tools/views_base.md                     # :5, :57, Example 7 (no params.* claim)
docs/tools/*.md                              # D8 vault-name items, if any
CHANGELOG.md                                 # [Unreleased] spec line + Changed/Removed/Fixed
CLAUDE.md                                    # plan pointer → this plan (after_plan hook)

# UNCHANGED: src/server.ts, src/errors.ts, src/cli-adapter/**, src/tools/_register.ts,
#   src/tools/help/{handler,index,schema}.ts, src/tools/context_search/{handler,index,schema}.ts, src/tools/views_base/**,
#   src/tools/query_base/**, src/tools/_base-path.ts, src/tools/_register-baseline.json
```

**Structure Decision**: single project. The two production edits sit in their tools' own files. The guard is a co-located test in the `help` tool's directory, because it pins what `help` serves.

**Test-edit scope** (per `.memory/refactor-decisions.md` check 5; the spec's requirements force these):
- `src/tools/help/handler.test.ts:145-151`: the "returns content for orphaned doc files" case pins the placeholder behaviour FR-002 removes. It is replaced by H6 (`list_notes` and `search_vault` → `HELP_TOOL_NOT_FOUND`).
- `src/tools/rename/schema.test.ts:147-176` (two cases) and `src/tools/rename/index.test.ts:140-141`: `move_note` → a word-bounded `move` match, plus a `not.toMatch(/move_note/)`.
- `src/tools/create_base/index.test.ts`: additions only. The existing empty-`base_path` assertion (`:130-143`) is not edited and must still pass.
- `src/tools/context_search/handler.test.ts` (H7, about `:519-530`): additive assertions only (`details.command === "folder"`, `details.message`); the existing assertions are not edited. Analysis C2, clarification 2026-11-02.
- `src/tools/context_search/index.test.ts`: one new case driving the registered tool down the missing-folder path and asserting the top-level `message`, `code` and the two `details` fields; existing cases are not edited.

No other existing assertion changes.

**Docs-as-code**: `.docs-as-code/capabilities/escape-hatch-and-meta.md:152` (the stub pages) and any page describing `create_base`'s validation errors are updated by `/speckit-docs-as-code <n>` after review.

## Phase 0: Research → research.md

- **F1–F8**: code findings (CodeGraph and direct reads) plus one in-process probe. The probe ran all 157 example calls through their tools' Zod schemas.
- **D1–D9**: decisions, summarised above.
- **Follow-ups**: two items outside the listed scope (`query_base` `details.reason`; `UPSTREAM_TIMEOUT`).
- **Audit records**: TC-00586 / TC-00587 could not be read at plan time (the vault tools were not permitted in this session). The repository rebuild in F1–F5 is the plan's inventory. Implementation cross-checks it against the records before closing US2, US3 and US5.

**Output**: research.md, with no `NEEDS CLARIFICATION` remaining.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)**:
  - E1 offered tools, E2 pages, E3 index entries, E4 worked examples;
  - E5 the `create_base` error (changed);
  - E6 the `context_search` missing-folder error (documented);
  - rules V1–V7.
- **[contracts/help-reconciliation-contract.md](contracts/help-reconciliation-contract.md)**: rows, each marked as a test or a one-time verification (Q3 = A).
- **[quickstart.md](quickstart.md)**: the automated gate, a local negative check of the guard, the fingerprint gate without regeneration, and live L1–L5 in the test vault.
- **Agent context**: the `CLAUDE.md` plan pointer, updated through the mandatory `after_plan` hook.

## Phase 1 re-check (post-design Constitution Check)

- **I**: no new production module; no new cross-module edge.
- **II**: every behaviour change has co-located happy-path and failure tests in the same change; the guard has both.
- **III**: issues are read from Zod; no hand-rolled validation.
- **IV**: existing codes only; the generic envelope is kept for everything else.
- **V**: headers present.
- **Tool Surface Standards**: no fingerprint movement.
- **Security Defaults**: untouched.

**No gate regressed; Complexity Tracking is empty.**

### Spec alignment note

- **FR-008 / D3 (description)**: per the second-session clarification (analysis I1 = A), only the help page must name `details.code` / `details.reason` / `details.field`. `CREATE_BASE_DESCRIPTION` must not contradict them; it already names the codes and sub-reasons correctly, so it and its fingerprint stay unchanged (ADR-040).
- **FR-009 / D7 (tests)**: per analysis C2 = A, the missing-folder error's `details.command`, `details.message` and top-level message are pinned in `context_search`'s tests. The fix stays docs-only for production code; `src/cli-adapter/**` and `context_search/{handler,index,schema}.ts` are unchanged.
- **FR-008 / D3**: the clarification's Option B is implemented additively. `details.issues` stays, following `find_and_replace`'s precedent, so no field an agent can read today disappears and no existing assertion changes. The help page names `details.code` / `details.reason` / `details.field` as the fields to branch on.
- **FR-007 / D6 (`views_base`)**: Example 7 is a labelled failing example, so its `params.*` claim is in scope as a docs fix. The same claim on that page (`:5`, `:57`) is corrected with it, so the page does not contradict itself. `views_base`'s error shape is not changed. That would be the same fix as D3, and it is recorded as a follow-up with `query_base`.
- **FR-011 / D8**: the plan fixes the rule; the item list comes from the audit records.
- **SC-003 / SC-004**: verified once (contract X1–X2, N3) by re-running the research probe and scan, per Q3 = A. The scan also covers the server instructions (analysis U3), and the probe covers bare-argument example blocks (analysis C1).
- **FR-008 / D3 (message)**: the spec now states that the three rejections' top-level message becomes the issue's own message, matching contract C1–C8 and data-model E5 (analysis I3).
- **Audit records**: spec Assumptions now say the drift lists came from the repository at plan time and are confirmed against TC-00586 / TC-00587 at implementation (T003), matching Phase 0 (analysis I2).

### CodeGraph structural check

Run with `codegraph_explore` at plan time (HEAD `52fd0eb`).

**Affected symbols and blast radius**:
- `createCreateBaseTool` (`src/tools/create_base/index.ts:31`): called by `server.ts` and `_typed-result-fixtures.ts`; tested by `create_base/index.test.ts` and `_surface.test.ts`. The new mapper is reachable only through `registerTool`'s input-parse catch (`_register.ts:179-193`), the same seam `prepend` and `find_and_replace` use.
- `CREATE_BASE_DESCRIPTION`: not edited, so the fingerprint is stable.
- `renameInputSchema` (`src/tools/rename/schema.ts`): the `.regex` message only; the published `pattern` is unchanged, and JSON Schema does not carry the message. Tested by `rename/schema.test.ts` and `rename/index.test.ts`.
- `executeHelp` / `notFound` (`src/tools/help/handler.ts:35`, `:81`): not edited. Their output changes only through the `docs/tools/` directory contents.
- `assertToolDocsExist` (`src/tools/_register.ts:277`): not edited. The new test is its reverse, outside production.
- Consumed by the new test, not edited: `quietServer`, `connectModernClient` (`_mcp-client-fixtures.ts`).

**Kernel-node touch surface**: none. `createServer()`, `createLogger()`, `createQueue()` and `UpstreamError` are not edited, and no production file gains a call to them. That is the explicit no-touch claim for post-implement verification.

**Post-implement structural verification** (after `codegraph sync`):
1. No new error class or code; `src/errors.ts` unchanged. The mapper emits only `VALIDATION_ERROR` with existing `details.code` values.
2. No handler imports `createLogger` / `createQueue` / `createVaultRegistry`; `server.ts` unchanged.
3. `create_base/index.ts` imports nothing new beyond `ToolErrorPayload` (from `_shared.ts`) and `z` types. No tool → tool edge.
4. The mapper is reachable from `createCreateBaseTool` → `registerTool`. `helpDocsDrift` is test-local by design (not a production symbol).

## Follow-ups (out of scope)

- **`query_base` / `views_base` validation errors**: they document `details.reason` / `params.*` for `INVALID_BASE_PATH`, but the generic envelope drops them (research F5, F8). Candidate fix: lift D3's mapper into `_base-path.ts` and adopt it in all three Bases tools.
- **`UPSTREAM_TIMEOUT`**: it appears in four Bases error rosters but is never raised; the real code is `CLI_TIMEOUT` (research F8).

Both are for the next run of the BI-0122 audit pattern.

## Complexity Tracking

> No Constitution Check violations; the table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
