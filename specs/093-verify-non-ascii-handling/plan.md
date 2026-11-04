# Implementation Plan: Verify Non-ASCII Handling

**Branch**: `093-verify-non-ascii-handling` | **Date**: 2026-11-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/093-verify-non-ascii-handling/spec.md`

> **This change adds one hand-run release check, `npm run check:non-ascii`. It proves against real vaults that five tools handle non-ASCII names and text exactly as written, and it changes no tool.**
>
> - **Scenarios**: 8 checks cover the spec's 9 acceptance scenarios for `outline`, `links`, `paths`, `pattern_search` and `smart_connections_similar`. Each check reports `PASS`, `FAIL` or `BLOCKED` on its own.
> - **Vaults**: headings, links, folder listing and pattern search run in `TestVault-Obsidian-CLI-MCP`, with fixtures seeded and removed under `Sandbox/`. Similar notes runs read-only in the semantic vault named at run time (`My-Setup-Vault`).
> - **Code**: all outcome logic lives in one pure, unit-tested module. The script is thin I/O around it.
> - **Unchanged**: behaviour, inputs, outputs, error codes and the fingerprint baseline (FR-015).

## Summary

Research ([research.md](research.md)) read the five tools' routes, the spec 034 records and the `probe-stdio.ts` precedent.

Findings:

- **F1**: four of the five tools take the eval payload route; `outline` takes the argv route. Each tool's failure shape is known.
- **F2**: spec 034's live probes never covered the full acceptance set: an ASCII source path for `links`, no not-found case for `paths`, and Smart Connections skipped.
- **F3**: `probe-stdio.ts` is the precedent: a script driving `dist/index.js` over stdio.
- **F4**: `scripts/` code gets no typecheck, lint or tests, while a `src/` module with no relative imports can be imported by a script directly.
- **F5**: the vault rules.
- **F6**: Obsidian's indexing lag after a direct file write.

Decisions:

- **D1**: one script, `npm run check:non-ascii`, over real stdio.
- **D2**: the pure module `src/tools/_non-ascii-checks.ts` plus a thin script.
- **D3**: fixtures written directly with `node:fs` in a per-run `Sandbox/` folder, with realpath containment and cleanup in a `finally`.
- **D4**: retry until pass with a 30-second deadline, plus a gate on the negative-scope check.
- **D5**: `BLOCKED` only after the precondition has been proved without using the route under test. A note that is on disk but "not found" by the tool is a `FAIL`.
- **D6**: the not-found check needs no staging.
- **D7**: the report and exit-status format.
- **D8**: no vault default inside the script.
- **D9**: exact `===` comparison.
- **D10**: not part of CI.

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. The script is run by Node's type stripping, as the existing scripts are. Unchanged.

**Primary Dependencies**: `@modelcontextprotocol/client` (devDependency, already used by `probe-stdio.ts`) and `zod` 4. No new dependency.

**Storage**: none. Fixtures are temporary files in the test vault's `Sandbox/`. The report goes to stdout, and the operator saves it as evidence (quickstart §4).

**Testing**:

- `vitest run`: the new co-located `src/tools/_non-ascii-checks.test.ts` (contract §T) runs in CI on Linux and Windows.
- The live run is manual (quickstart §4) and follows `.memory/test-execution-instructions.md`.

**Target Platform**: wherever the server runs. The live run needs a desktop with Obsidian running; it was first run on Windows, where the original defect lived.

**Project Type**: single project, an MCP server, plus developer scripts.

**Performance Goals**: none at runtime. A full run takes about 10 s when everything passes. The worst case is the 30-second readiness wait plus 30 s for each failing test-vault scenario (D4).

**Constraints**:

- FR-015 / SC-006: no tool, schema, instruction or baseline change.
- FR-017: the semantic vault is read-only.
- FR-013 and the test-execution rules: writes go only under `Sandbox/`, and cleanup always runs.
- FR-014: exact comparison.
- Erasable TypeScript syntax only in `_non-ascii-checks.ts` and the script (no `enum`, `namespace`, parameter properties or `import = require`): Node loads both by type stripping, and `tsc` does not enforce the limit because `tsconfig.json` has no `erasableSyntaxOnly` (research D2; analyze U1).
- Refactor-decisions:
  - item 30: test-support modules are excluded from the build by name;
  - item 64: `runVitestDump` is the generated-vitest runner. It is not needed here, because the module has no relative imports (D2).

**Scale/Scope**:

- **New source**:
  - `src/tools/_non-ascii-checks.ts`;
  - `src/tools/_non-ascii-checks.test.ts`;
  - `scripts/check-non-ascii.ts`.
- **Changed**:
  - `package.json` (one script);
  - `tsconfig.build.json` (one exclude);
  - `CONTRIBUTING.md` (release-check entry, through the docs pass).
- **Evidence at implement time**: `specs/093-verify-non-ascii-handling/run-<date>.txt`.

**Resolved unknowns**: none open. Spec C-001 to C-003 settled the vault, the form of the checks and the scope.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|---|---|---|
| **I. Modular Code Organization** | **Y** | One single-purpose test-support module, `_non-ascii-checks.ts`, with no relative imports, so it can import nothing upward and form no cycle. No production module imports it. The script imports it from outside `src/`, and reaches the server only as a child process (`dist/index.js`). |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | No MCP tool is added, renamed or modified, so no tool test is owed. The new module is not a published surface but still ships with its unit rows (contract §T) in the same change. That includes the failure and boundary rows: NFD mismatch, empty success, garbled not-found text, unexpected shape. |
| **III. Boundary Input Validation with Zod** | **Y** | Tool schemas are untouched. The script's inputs are parsed at its own boundary: `parseArgs` for the flags, and a zod schema for every `callTool` result (data-model E5). An unexpected shape is a `FAIL`, never trusted. |
| **IV. Explicit Upstream Error Propagation** | **N/A** | No handler or error path changes, and no `UpstreamError` is constructed. The script never masks a failure: every error becomes a `FAIL` or `BLOCKED` block with the payload verbatim, and a crash in one scenario does not hide the others (data-model E7). |
| **V. Attribution & Layered Composition** | **Y** | The three new `.ts` files carry `// Original — no upstream. …`. |
| **ADR-010 / ADR-013** (tool names) | **N/A** | No tool is added or renamed. |
| **ADR-014** (plugin-backed runtime dependency) | **N/A** | No plugin-backed tool is added. The S1 and S2 classifiers read ADR-014's lifecycle codes as published (`SMART_CONNECTIONS_NOT_INSTALLED`, `_NOT_READY`, `SOURCE_NOT_INDEXED` → `BLOCKED`), which is consistent with that ADR. |
| **ADR-015** (sub-discriminators) | **N/A** | No `(code, details.code)` pair or `details.reason` is added. |
| **MCP Tool Surface Standards** | **N/A** | No published tool, schema or instruction changes. The baseline stays byte-identical (quickstart §1). |
| **Security Defaults** | **N/A** | No product write path, escape hatch or destructive tool changes. The script calls no escape hatch, and no destructive tool on any vault. Its own fixture writes keep to the same containment rule: the realpath of the nearest existing ancestor must be inside `Sandbox/` (contract §W). |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**ADR conflicts**: none.

- ADR-014's lifecycle precedence (plugin check before path lookup) is the reason S2 can be `BLOCKED` when the plugin is absent (research F1). The checks rely on that ordering and do not change it.
- ADR-029 (cold-start retry) may bring a closed vault up during a call. That is the published behaviour, and the checks accept it.

### CodeGraph structural check

Queries: `createServer createLogger createQueue UpstreamError executeOutline executeLinks executePaths executePatternSearch executeSmartConnectionsSimilar executeVaults`, plus reads of the five `schema.ts` files, the `links`, `paths` and `smart_connections_similar` templates, `asToolError` and `scripts/probe-stdio.ts`.

- **Affected modules**: none in production. The new `src/tools/_non-ascii-checks.ts` is a leaf, imported only by its test and by `scripts/check-non-ascii.ts`. `package.json` and `tsconfig.build.json` are config.
- **Read, not changed**: the five handlers (`executeOutline`, `executeLinks`, `executePaths`, `executePatternSearch`, `executeSmartConnectionsSimilar`) plus `executeVaults` and `read`. The checks call them only through the published tools over stdio. Each sits in the runtime spine under its own `index.ts`, alongside the other handlers.
- **Blast radius**: the module's own test. The script is outside every spine. No existing test, fixture or baseline reads anything this change writes.
- **Kernel nodes**:
  - **`createServer()`** (the boot-spine entry point) is not edited and gains no in-process caller. The script reaches it only by spawning `dist/index.js`.
  - **`createLogger()` / `createQueue()`** (the boot-time DI factories) are not touched, and no new file constructs them.
  - **`UpstreamError`** (the error-spine value type) is not touched and gains no construction site. The script reads its serialized `code` and `details` from tool results.

  **The kernel-node touch surface is therefore none.** The post-implement check verifies this claim (quickstart §7).

## Project Structure

### Documentation (this feature)

```text
specs/093-verify-non-ascii-handling/
├── plan.md                              # This file
├── research.md                          # F1–F6, D1–D10
├── data-model.md                        # E1 arguments … E8 report
├── quickstart.md                        # §1 in-process gate … §7 structural check
├── contracts/
│   └── non-ascii-check-contract.md      # §C command, §S scenarios, §W write safety, §R report, §T unit rows, §X files
├── checklists/requirements.md
├── run-<date>.txt                       # implement-time live-run evidence (SC-005)
└── tasks.md                             # Phase 2: /speckit-tasks
```

### Source Code (repository root)

```text
src/tools/_non-ascii-checks.ts        # NEW: fixture set (E2), scenario table (E4), result schema (E5), classifiers,
                                      #      retry constants, report renderer (E8), exit-status rule; zod only, no relative imports
src/tools/_non-ascii-checks.test.ts   # NEW: contract §T rows T-FX1 … T-ARGS
scripts/check-non-ascii.ts            # NEW: npm run check:non-ascii — args, stdio client, vaults lookup, fs seeding/cleanup,
                                      #      readiness wait, callTool per scenario, print, exit
package.json                          # "check:non-ascii" script
tsconfig.build.json                   # exclude src/tools/_non-ascii-checks.ts
CONTRIBUTING.md                       # release-check entry (docs pass)
# UNCHANGED: every src/tools/<tool>/**, src/server.ts, src/errors.ts, src/tools/_register-baseline.json
```

**Structure Decision**: single project.

- The logic sits beside the other underscore-prefixed test-support modules in `src/tools/`, where it is typechecked, linted and unit-tested, and it is excluded from `dist/`.
- The script stays under `scripts/` beside `probe-stdio.ts`, its closest precedent.

**Docs-as-code**: after review, `/speckit-docs-as-code <n>` records the release check:

- the command;
- the two-vault rule;
- the `PASS` / `FAIL` / `BLOCKED` contract;
- the known gap on the same payload route (`backlinks`, `open_file`, `views_base`, `create_base`).

These go in `.docs-as-code/` and `CONTRIBUTING.md`.

## Phase 0: Research → research.md

- **Method**: code reads at HEAD `b42e96a` and a reread of the 034 records. No vault or CLI was touched at plan time.
- **Plan-time spec alignment**: none needed. The spec's `outline` assumption is confirmed (F1): it takes the argv route and stays in scope as named.

**Output**: [research.md](research.md). No `NEEDS CLARIFICATION` remains.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)**:
  - E1: the run arguments;
  - E2: the fixture set with exact strings and expectations;
  - E3: the semantic-vault inputs;
  - E4: the scenario;
  - E5: the tool result;
  - E6: the check context (independently proved facts);
  - E7: the outcome and its states;
  - E8: the report.
- **[contracts/non-ascii-check-contract.md](contracts/non-ascii-check-contract.md)**:
  - §C: the command and exit status;
  - §S: the eight scenarios with exact arguments and their `PASS` / `FAIL` / `BLOCKED` rules;
  - §W: write safety;
  - §R: the report layout;
  - §T: the unit rows;
  - §X: the files touched.
- **[quickstart.md](quickstart.md)**:
  - the in-process gate;
  - the usage errors;
  - the live preconditions;
  - the live run and evidence;
  - the deliberate `BLOCKED` run;
  - the red checks (in-process);
  - the structural check.
- **Agent context**: the mandatory `after_plan` agent-context hook ran, but its script needs Python with PyYAML, which this machine lacks, so it exited before changing anything. Its one change, the plan pointer in `CLAUDE.md`'s managed block, was made by hand: it now names this plan.

## Phase 1 re-check (post-design Constitution Check)

- **I**: one leaf module with no relative imports, plus a script outside `src/`. No cycle, and no production importer.
- **II**: no surface changes, and the module ships with failure and boundary rows.
- **III**: the flags and every tool result are parsed at the script's boundary.
- **IV**: N/A. Failures are reported verbatim.
- **V**: headers on the three new files.
- **ADR-014**: the lifecycle codes are read as published.
- **Tool Surface Standards**: the baseline is unchanged.
- **Security Defaults**: fixture writes are contained in `Sandbox/`, and the semantic vault is read-only.

**No gate regressed; Complexity Tracking is empty.**

### Spec alignment

| Spec item | Covered by |
|---|---|
| FR-001 / US1 | §S H1; T-H |
| FR-002 / US2 | §S L1; T-L |
| FR-003, FR-004 / US3 | §S F1, F2; T-F1, T-F2 |
| FR-005, FR-006 / US4 | §S P1, P2 (with the `outsideSeenByP1` gate); T-P |
| FR-007, FR-008, FR-016–FR-019 / US5 | §S S1, S2; D5, D6, D8; §W 4–5; T-S1, T-S2 |
| FR-009, FR-020, FR-021 / C-002 | §C; D1, D2, D7, D8; T-ARGS, T-EXIT |
| FR-010, FR-011, FR-012 / US6 | data-model E7; §R; T-R, T-SHAPE |
| FR-013 / SC-004 | §W 1–3; quickstart §4 pre- and post-state |
| FR-014 | D9; T-H's NFD row |
| FR-015 / SC-006 | §X; quickstart §1 baseline diff |
| SC-001, SC-002 | §S (8 checks, 9 scenarios); E8 invariants |
| SC-005, SC-007, SC-008 | quickstart §4, §5 |

## Complexity Tracking

None.
