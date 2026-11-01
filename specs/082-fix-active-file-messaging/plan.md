# Implementation Plan: Fix active-file messaging

**Branch**: `082-fix-active-file-messaging` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/082-fix-active-file-messaging/spec.md`

> **This change corrects two pieces of text on `get_active_file`.** One is the issue message raised for a supplied `file` / `path` locator; the other is the stated `name` / `basename` / `extension` relationship in the tool description and the help reference. Validation rules, schemas, returned values and every other tool's messages are unchanged. Only `get_active_file`'s `descriptionFingerprint` moves in `_register-baseline.json`.

## Summary

`get_active_file` shares the folder-scoped target-mode refinement with `files` and `paths`, so a supplied locator is rejected with "file/path is not allowed for folder-scoped tools" (research F1). Its description and help reference state `name === basename + extension`, which leaves out the dot (F4). The plan:

- **D1 (scoped message)**: `applyTargetModeRefinementForFolderScoped` gains an optional `locatorMessage: (key: "file" | "path") => string`, defaulting to today's text. `get_active_file/schema.ts` passes its own function; `files` and `paths` pass nothing, so their bytes are unchanged by construction.
- **D2 (wording)**: `<key> is not allowed: the active file is the implicit target, so no note may be named`. It keeps the cohort's `<key> is not allowed` opening and reuses the help reference's own phrase.
- **D3 (formula)**: both surfaces say `name` is `basename + "." + extension`, or just `basename` when `extension` is `""`.
- **D4 (comments)**: the two internal comments that repeat the dot-less formula are corrected. The frozen template string is untouched.
- **D5 (tests)**: contract rows A1–A9, U1–U5 and F1–F3 are pinned in the existing co-located test files.
- **D6 (no T0)**: validation runs before any CLI call, so no live probe is needed.

The published behaviour is in [contracts/get_active_file-messaging-contract.md](contracts/get_active_file-messaging-contract.md).

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. Unchanged.

**Primary Dependencies**: `@modelcontextprotocol/server` (SDK v2), `zod` 4. **No new dependency.**

**Storage**: none.

**Testing**: `vitest run`, co-located `*.test.ts`. Run it through PowerShell.

**Target Platform**: Windows, macOS and Linux; CI on Linux and Windows. No platform-specific behaviour is involved.

**Project Type**: single project, an MCP server (`src/**`).

**Performance Goals**: none. One extra function call per rejected locator.

**Constraints**:

- Rejection behaviour is identical: the same inputs are rejected and accepted, with the same issue paths, codes and order (FR-004).
- `files` and `paths` messages are byte-identical (FR-005).
- No schema fingerprint moves (superRefine is invisible to JSON Schema).
- No new error code (Principle IV).

**Scale/Scope**:

- **Changed code**:
  - `src/target-mode/target-mode.ts`: the optional parameter, and a private default;
  - `src/tools/get_active_file/schema.ts`: the message function, the call site and comments;
  - `src/tools/get_active_file/index.ts`: one description line;
  - `src/tools/get_active_file/_template.ts`: one comment line.
- **Tests**:
  - `src/target-mode/target-mode.test.ts` (U4, U5);
  - `src/tools/get_active_file/schema.test.ts` (A1–A9);
  - `src/tools/get_active_file/index.test.ts` (A2 on the wire, F1, F2, F3);
  - `src/tools/files/schema.test.ts` (U1, U2).
- **Docs**: `docs/tools/get_active_file.md` (the `name` row), `CHANGELOG.md`, `src/tools/_register-baseline.json` (regenerated), and the plan pointer in `CLAUDE.md`.

**Resolved unknowns**: none open. Research F1–F6 and D1–D6 settle everything.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | No new module. `get_active_file/schema.ts` already imports `target-mode`; the edge stays tool → shared primitive. No upward, cyclic or tool→tool edge, and the `{schema, tool, handler}.ts` layout is unchanged. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | `get_active_file`'s validation message and description change. The happy path (existing valid-payload and `{ active }` tests) and the failure/boundary cases A1–A9 and F1–F3 land in its `schema.test.ts` and `index.test.ts` in the same change. The shared primitive's new parameter is covered in `target-mode.test.ts` (U4, U5). `files` gains exact-text pins (U1, U2). |
| **III. Boundary Input Validation with Zod** | **Y** | The rule stays in the Zod `superRefine`; only its message text is parameterised. No hand-rolled check, and no schema shape change. |
| **IV. Explicit Upstream Error Propagation** | **N/A** | No `UpstreamError` path changes. Rejection is still a `VALIDATION_ERROR` `isError` result from `registerTool`. No new code. |
| **V. Attribution & Layered Composition** | **Y** | No new file. The edited files keep their `// Original — no upstream.` headers. `get_active_file/schema.ts`'s intent header is updated to name the tool-specific locator message. |
| **ADR-003** (target mode) | **Y** | Rules unchanged (research F6). |
| **ADR-038** (tool-local target-mode matrix) | **Y** | No new refinement flavour and no rule change; only the message is a parameter. Research D1 explains why a tool-local copy was rejected. |
| **ADR-010 / ADR-013 / ADR-014 / ADR-015** | **N/A** | No tool added or renamed, no template string edited, no error sub-discriminator touched. |
| **ADR-040** (published descriptions) | **Y** | Only the tool description's `name` line changes. Parameter descriptions and server instructions are unchanged. |
| **MCP Tool Surface Standards** | **Y** | Title, annotations, input and output schemas and dialect are unchanged. The description fingerprint moves deliberately through `npm run baseline:write` (quickstart §2). |
| **Security Defaults** | **N/A** | No escape hatch, mode, write path or containment change. |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**Kernel-node attention (per CLAUDE.md)**: none touched.

- `createLogger`, `createQueue`, `UpstreamError` and `createServer` are not edited or newly called.
- `src/errors.ts`, `src/server.ts` and `_register.ts` are unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/082-fix-active-file-messaging/
├── plan.md                                        # This file
├── research.md                                    # F1–F6 findings, D1–D6 decisions
├── data-model.md                                  # E1 locator issue, E2 file identity; V1–V7
├── quickstart.md                                  # automated gate, baseline gate, optional live check
├── contracts/
│   └── get_active_file-messaging-contract.md      # §1 A1–A9 / U1–U5, §2 F1–F3, §3 surface
├── checklists/requirements.md
└── tasks.md                                       # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
src/target-mode/target-mode.ts                 # applyTargetModeRefinementForFolderScoped(schema, locatorMessage = default)
src/target-mode/target-mode.test.ts            # U4 default text exact; U5 custom message, vault issues unchanged
src/tools/get_active_file/schema.ts            # passes the active-file locator message; header + formula comment
src/tools/get_active_file/schema.test.ts       # A1–A9 (exact message, no "folder-scoped", both-locators, vault pins)
src/tools/get_active_file/index.ts             # GET_ACTIVE_FILE_DESCRIPTION `name` line
src/tools/get_active_file/index.test.ts        # A2 on the wire; F1 description; F2 docs; F3 worked examples
src/tools/get_active_file/_template.ts         # header comment formula only (template string untouched)
src/tools/files/schema.test.ts                 # U1, U2 exact folder-scoped text
src/tools/_register-baseline.json              # regenerated (get_active_file descriptionFingerprint only)
docs/tools/get_active_file.md                  # `name` row
CHANGELOG.md                                   # [Unreleased] spec line + Fixed entry
CLAUDE.md                                      # plan pointer → this plan

# UNCHANGED: src/tools/files/schema.ts, src/tools/paths/**, src/tools/get_active_file/handler.ts,
#   every other schema, src/errors.ts, src/server.ts, src/tools/_register.ts
```

**Structure Decision**: single project. The tool-specific message lives in the tool's own schema file. The shared primitive only learns to accept it, so the rule logic stays in one place.

**Docs-as-code**: any `.docs-as-code/` page that quotes the locator message or the formula is updated by `/speckit-docs-as-code <n>` after review, per the PR lifecycle in CLAUDE.md.

## Phase 0: Research → research.md

- **F1**: the message's source in the shared refinement.
- **F2**: the wire path, `registerTool` → `details.issues[].message`.
- **F3**: the refinement's callers. `files` reaches the message, `paths` never does, and nothing pins the text today.
- **F4**: the four places the dot-less formula is stated. Returned values are already right.
- **F5**: only the description fingerprint moves.
- **F6**: ADR-003, ADR-038 and ADR-040 fit.
- **D1 to D6**: as summarised above.

**Output**: research.md, with no `NEEDS CLARIFICATION` remaining.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)**: E1, the locator-rejection issue (per tool); E2, the file identity and its two-case relationship with the worked examples; invariants V1–V7.
- **[contracts/get_active_file-messaging-contract.md](contracts/get_active_file-messaging-contract.md)**: rejection rows A1–A9, unchanged-neighbour rows U1–U5, formula rows F1–F3 and the published-surface table.
- **[quickstart.md](quickstart.md)**: the automated gate, the baseline gate (exactly one line moves), and the optional live check, which needs no vault access.
- **Agent context**: the `CLAUDE.md` plan pointer now points at this plan.

## Phase 1 re-check (post-design Constitution Check)

- **I**: no new edge.
- **II**: every contract row maps to a co-located test in the same change.
- **III**: the rule stays in Zod.
- **IV**: N/A.
- **V**: headers kept, intent line updated.
- **ADR-038**: no new flavour.
- **MCP Tool Surface Standards**: the description fingerprint moves, nothing else.

**No gate regressed; Complexity Tracking is empty.**

### Spec alignment note

- **FR-005 / SC-003 for `paths`**: `paths` never emits the locator message. Its `.omit({file, path})` base turns a locator into `unrecognized_keys` before the refinement runs (research F3). "Unchanged" for `paths` is therefore proven by its existing, unedited `unrecognized_keys` tests, and the exact-text pin (U1, U2) lives in `files`.
- **SC-001 "6 cases"**: these are contract rows A1–A6. A7 and A8 add the mixed-rule edge cases from the spec's Edge Cases, and A9 the explicitly-undefined case.

### CodeGraph structural check

Run with `codegraph_explore` at plan time (HEAD `01e8db4`).

**Affected symbols and blast radius**:

- `applyTargetModeRefinementForFolderScoped` (`src/target-mode/target-mode.ts:102`): its production callers are `files/schema.ts`, `paths/schema.ts` and `get_active_file/schema.ts`, and it is tested by `target-mode.test.ts`. The new parameter is optional with a byte-identical default, so the two callers that pass nothing see no change.
- `folderScopedTargetModeBaseSchema` (`target-mode.ts:37`): not edited.
- `getActiveFileInputSchema` (`src/tools/get_active_file/schema.ts:19`): used by `get_active_file/index.ts` and tested by `get_active_file/schema.test.ts`.
- `GET_ACTIVE_FILE_DESCRIPTION` (`src/tools/get_active_file/index.ts:14`): read by `createGetActiveFileTool`, which is called by `src/server.ts` and `src/tools/_typed-result-fixtures.ts`, and tested by `get_active_file/index.test.ts` and `_plugin-noise.test.ts`. It is fingerprinted in `_register-baseline.json`.
- `ACTIVE_FILE_TEMPLATE` (`src/tools/get_active_file/_template.ts:20`): not edited (comment only), and pinned byte for byte by `_template.test.ts`.

**Kernel-node touch surface**: none. `createLogger`, `createQueue`, `UpstreamError` and `createServer` are untouched, and `get_active_file` still receives its deps through `ExecuteDeps`.

**High-blast-radius surface**: `target-mode.ts` sits under every target-mode tool. Only `applyTargetModeRefinementForFolderScoped`, the folder-scoped variant with three callers, is edited. `targetModeBaseSchema` and `applyTargetModeRefinement`, the locator-XOR variant behind the widest cohort, are not touched.

**Post-implement structural verification** (after `codegraph sync`):

1. There is no new error class or code, and `src/errors.ts` is unchanged.
2. No handler imports `createLogger` / `createQueue`, and `server.ts` is unchanged.
3. The `locatorMessage` argument is supplied only by `get_active_file/schema.ts`; `files/schema.ts` and `paths/schema.ts` still call the refinement with one argument.
4. The new message function is reachable from `getActiveFileInputSchema`, so it is not orphaned.

## Follow-ups (out of scope)

- **`_template.test.ts` titles** (`:3`, `:24`) still say "name = basename + extension". They are labels, left alone (research D4).
- **The folder-scoped `files` / `paths` test battery** is still not consolidated (memory, deferred list). This change adds two assertions to `files`' existing cases rather than starting that consolidation.

## Complexity Tracking

> No Constitution Check violations; the table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
