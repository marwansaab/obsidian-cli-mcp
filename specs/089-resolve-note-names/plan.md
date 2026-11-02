# Implementation Plan: Resolve note names

**Branch**: `089-resolve-note-names` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/089-resolve-note-names/spec.md` (BI-0171)

> **This change makes `patch_heading` and `patch_block` resolve a `file` name the way the reading tools do.** Today each editor's private `resolveLocator` treats `file` as a literal path from the vault root. After this change:
>
> - both handlers call the shared `resolveFsTarget` (`src/tools/_file-target.ts`), the locator `append_note` and `prepend` already use, and their `resolveLocator` copies are deleted;
> - a `file` name costs one `obsidian file file=<name>` call before any filesystem access, and the edit, its checks, the metadata refresh and the response's `path` all use the resolved path;
> - a name that matches no note fails with the resolver's unchanged `CLI_REPORTED_ERROR` (`Error: File "<name>" not found.`), the same failure `read` gives.
>
> `path` and active-mode targeting do not change. Neither do the published descriptions, the schemas, the fingerprint baseline or `src/errors.ts`.

## Summary

Research ([research.md](research.md)) read the code at HEAD `5bc2621` and probed the live CLI in the test vault Sandbox.

Code findings:

- **F1**: both editors use `file` as a literal path, against the shared "resolved like a wikilink" description.
- **F2**: `resolveFsTarget` already does the missing step and returns the exact shape the editors need.
- **F3**: `path` and active mode behave the same through it.
- **F4**: the editors' deps already fit it.
- **F5**: no existing test passes `file` to either handler.
- **F6**: neither editor has a file-type check.
- **F7**: an unmatched name already surfaces as a pass-through `CLI_REPORTED_ERROR`.
- **F8**: both help pages call `file` a "Vault-relative file path".
- **F9**: patch_heading's description lists `NOTE_NOT_FOUND`, but the handler never throws it (out of scope).

Live-probe findings:

- **F10**: a bare name, a name with `.md`, and a name with a partial folder all resolve, including notes in sub-folders.
- **F11**: `file` and `read` print the same `Error: File "<name>" not found.` line.
- **F12**: a name two notes share resolves to the same note for both `file` and `read`, and does not fail.

Decisions:

- **D1**: swap both `resolveLocator`s for `resolveFsTarget`.
- **D2**: no file-type check is added.
- **D3**: no new error code or mapping.
- **D4**: two new suites, rows N1–N9 each, with no existing test edited.
- **D5**: no published-surface change; help pages and the CHANGELOG are corrected.
- **D6**: a required live check.

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. Unchanged.

**Primary Dependencies**: `@modelcontextprotocol/server` (SDK v2), `zod` 4. No new dependency.

**Storage**: none. The editors keep writing notes directly through `fs` (ADR-009). The only new step is a read-only `obsidian file` lookup.

**Testing**:

- `vitest run` with co-located `*.test.ts`, run through PowerShell.
- Handler suites stub the spawn boundary with `makeQueuedSpawn` and the shared `fileTsvResponse` (`_handler-test-fixtures.ts`), and use each tool's vitest-free `_handler-fixtures.ts` for `fs` and the registry.
- The required live check (quickstart §3) runs the built server against `TestVault-Obsidian-CLI-MCP` and follows `.memory/test-execution-instructions.md`.

**Target Platform**: Windows, macOS and Linux; CI runs on Linux and Windows. The resolver returns forward-slash vault-relative paths, which `assertCanonicalPath` already handles on every platform (it does so today for `append_note` and `prepend`).

**Project Type**: single project, an MCP server.

**Performance Goals**: a `file` call adds one CLI round trip, the TSV lookup, through the single-flight queue. `append_note` and `prepend` already pay this cost. `path` and active-mode calls cost exactly what they do today. The spec sets no latency target.

**Constraints**:

- FR-007 / SC-004: `path` and active mode make the same spawns, `fs` calls, results and errors.
- FR-009: no fingerprint move.
- FR-006: no new top-level code and no new sub-code.
- Refactor-decisions item 5: no existing test edits. If any existing assertion fails, stop and raise it.
- Item 32: keep the registry-before-TSV order, and add no new per-handler locator.

**Scale/Scope**:

- **Changed code**:
  - `src/tools/patch_heading/handler.ts`: `resolveLocator` deleted and the call site switched to `resolveFsTarget(input, deps, "patch_heading")`. Imports are adjusted (`resolveActiveLocatorWithVault` is dropped, `resolveFsTarget` added) and the header is updated.
  - `src/tools/patch_block/handler.ts`: the same change, with `"patch_block"`.
  - `src/tools/_file-target.ts`: the header comment only, which now names patch_heading and patch_block as `resolveFsTarget` consumers. No code change.
- **New tests**: `patch_heading/handler.note-name.test.ts` and `patch_block/handler.note-name.test.ts`, rows N1–N9 each (contract §T).
- **Edited tests**: none.
- **Docs**: `docs/tools/patch_heading.md`, `docs/tools/patch_block.md` (contract §H), `CHANGELOG.md` (contract §C), and the `CLAUDE.md` plan pointer (after_plan hook).

**Resolved unknowns**: none open. The probes settled not-found wording, duplicate-name behaviour and locator forms (F10–F12).

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | Each editor's handler gains one import edge, a downward edge to the shared leaf `../_file-target.js`, which `append_note` and `prepend` already import. It drops its direct `resolveActiveLocatorWithVault` import, though `_active-file.ts` stays imported for `assertCanonicalPath`. No tool-to-tool edge, no cycle (`_file-target.ts` imports only `_active-file.ts` and a registry type). The `{schema, tool, handler}` layout is unchanged. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | Each editor gets happy-path rows (N1–N3), failure rows (N4, N5, N6, N7), a regression row (N8) and a vault-root boundary row (N9) in the same change (FR-012). The existing suites stay green unedited. |
| **III. Boundary Input Validation with Zod** | **Y** | The schemas are unchanged. The TSV answer is parsed by the existing `resolveFileByTsv`, a line-prefix parse already used by four tools, and is not re-implemented. |
| **IV. Explicit Upstream Error Propagation** | **Y** | Every new failure path is an existing `UpstreamError`, propagated unchanged: the dispatch layer's `CLI_REPORTED_ERROR`, the `file-tsv-parse` stage, the registry error. There is no fallback to the literal path and no silent success. Cancellation: `resolveFsTarget` passes the call's deps whole to `invokeCli`, so a cancelled call drops a queued lookup or kills a running one (refactor-decisions item 29). |
| **V. Attribution & Layered Composition** | **Y** | The two new test files carry `// Original — no upstream.` with their purpose. The headers of both handlers and `_file-target.ts` are updated to describe the lookup and its new consumers. |
| **ADR-009** (direct-fs writes) | **Y** | The write path (canonical check, atomic write, best-effort refresh) is unchanged and runs on the resolved path. The lookup is read-only. |
| **ADR-010 / ADR-013** | **N/A** | No tool added or renamed. |
| **ADR-014** | **N/A** | Not plugin-backed. |
| **ADR-015** (sub-discriminators) | **Y** | No new sub-code. The unmatched-name failure keeps the shape `read`, `append_note` and `prepend` already publish (Clarification Q2). |
| **ADR-040** (published descriptions) | **Y** | The descriptions are unchanged. The shared `file` description becomes true. |
| **MCP Tool Surface Standards** | **Y** | Title, hints, description, input and output schemas are unchanged. The baseline gate must pass without regeneration (P1, P2). |
| **Security Defaults** | **Y** | No new escape hatch. The resolved path goes through the same `realpath` containment check (`assertCanonicalPath`) as a given path, so a name cannot reach outside the vault (N7 / contract §E). Read-only mode and allow/deny lists are unaffected (the tools' annotations are unchanged). |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**Kernel-node attention (per CLAUDE.md)**:

- `createServer()`, `createLogger()` and `createQueue()` are not edited, and no production file gains a call to them. Both editors keep receiving logger and queue through `ExecuteDeps` and pass them whole to `resolveFsTarget`.
- `UpstreamError` is not edited, and this change adds no construction site. The failures it surfaces are built by existing code (`resolveFileByTsv`, `_dispatch.ts`, the registry).

## Project Structure

### Documentation (this feature)

```text
specs/089-resolve-note-names/
├── plan.md                              # This file
├── research.md                          # T0 method, F1–F12, D1–D6, plan-time alignment, follow-ups
├── data-model.md                        # E1–E3, invariants V1–V7, per-call flow
├── quickstart.md                        # automated gate + red check, surface gate, required live check
├── contracts/
│   └── note-name-contract.md            # P1–P3, error contract, rows N1–N9, help-page text, CHANGELOG, live column
├── checklists/requirements.md
└── tasks.md                             # Phase 2: /speckit-tasks
```

### Source Code (repository root)

```text
src/tools/patch_heading/handler.ts                   # resolveLocator → resolveFsTarget (D1); header
src/tools/patch_heading/handler.note-name.test.ts    # NEW: N1–N9
src/tools/patch_block/handler.ts                     # resolveLocator → resolveFsTarget (D1); header
src/tools/patch_block/handler.note-name.test.ts      # NEW: N1–N9
src/tools/_file-target.ts                            # header comment only (new consumers)
docs/tools/patch_heading.md                          # file row, output path row, error-roster row (contract §H)
docs/tools/patch_block.md                            # file row, error-roster row (contract §H)
CHANGELOG.md                                         # [Unreleased] spec line + Fixed entry (contract §C)

# UNCHANGED: both index.ts (descriptions), both schema.ts, src/target-mode/target-mode.ts,
#   src/tools/_register-baseline.json, src/errors.ts, src/server.ts, src/cli-adapter/**,
#   src/tools/_active-file.ts, every existing *.test.ts and fixture module
```

**Structure Decision**: single project. The production edits are two call-site swaps that delete code. The resolver stays where it is. Each new suite sits next to its handler, matching the existing `handler.<topic>.test.ts` split (`handler.bytes-written`, `handler.line-endings`, `handler.unsafe-placement`).

**Docs-as-code**: after review, `/speckit-docs-as-code <n>` updates the `.docs-as-code/` pages that describe the editors' locator. That means noting that the write cohort now shares one locator, and dropping any statement that `patch_heading` and `patch_block` keep their own.

## Phase 0: Research → research.md

- **T0 method**: live probes in the `TestVault-Obsidian-CLI-MCP` Sandbox. Fixtures under `Sandbox/089-probe/` were removed afterwards, and `Sandbox/` is back to its 13 pre-run entries.
- **F1–F12**: code and live findings, summarised above.
- **D1–D6**: decisions, summarised above.
- **Plan-time spec alignment**: one edge case is corrected. A name that resolves to a non-note file behaves as path-based targeting does, because the editors have no file-type check (F6, D2). It previously said "by the existing file-type rule".
- **Analyze-time alignment** (owner approved I1, C1 and I2, 2026-11-02):
  - **I1**: US1 AS3 no longer claims a root-level bare-name edit works "as today". Today it fails unless `.md` is given.
  - **C1**: a vault-root boundary row, N9, is added to both suites, the red check and the US1 gate.
  - **I2**: research D5 no longer promises a separate "Targeting" help paragraph, so contract §H is the single source of help text.
- **Analyze-time alignment, LOW findings** (settled by the existing artifacts, so no owner decision needed):
  - **U1**: N3 gains a second case, the folder-without-`.md` form named in US1 AS4.
  - **A1**: the spec's Assumptions name `read` as the reference reading tool, the only one probed live (F11, F12).
  - **U2**: N2 also checks that the `file` lookup runs before the first fs read on a successful call (FR-002).
  - **L1**: the quickstart's vitest filter names `src/tools/_active-file`, which exists, in place of the non-existent `_file-target` test.
- **Follow-ups**: the `NOTE_NOT_FOUND` vs `FS_WRITE_FAILED` drift in patch_heading's description (F9), the `[[`/`]]` schema rule that `append_note` and `prepend` have and the editors lack, and the missing file-type check in the editors.

**Output**: research.md, with no `NEEDS CLARIFICATION` remaining.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)**:
  - E1 locator input;
  - E2 resolved target;
  - E3 outcome;
  - invariants V1–V7;
  - the per-call flow.
- **[contracts/note-name-contract.md](contracts/note-name-contract.md)**: surface checks P1–P3, the error contract (§E), rows N1–N9 for each editor (§T), the exact help-page text (§H), the CHANGELOG text (§C) and the live column (§L), each mapped to FR, US, AS and SC IDs.
- **[quickstart.md](quickstart.md)**: the automated gate with a red check, the surface gate, and the required live check.
- **Agent context**: the `CLAUDE.md` plan pointer is moved to this plan by the `after_plan` agent-context hook.

## Phase 1 re-check (post-design Constitution Check)

- **I**: one downward import per handler to an existing shared leaf; acyclic.
- **II**: happy, failure and regression rows for both editors in the same change.
- **III**: schemas untouched; the existing TSV parse is reused.
- **IV**: pass-through errors, no fallback, cancellation preserved.
- **V**: headers present and updated.
- **Tool Surface Standards**: zero fingerprint moves (P1, P2).
- **Security Defaults**: the containment check runs on the resolved path.

**No gate regressed; Complexity Tracking is empty.**

### Spec alignment note

- **FR-001**: D1, V1; N1, N3, N9; L2, L3.
- **FR-002**: V2; N1, N2, N4.
- **FR-003**: D3, V3; N4; L4.
- **FR-004**: F12, V1; L5.
- **FR-005**: E3; N1, N3.
- **FR-006**: D3, V4; N4, N5; P3.
- **FR-007**: F3, V5; N8 and every existing suite unedited.
- **FR-008**: V6, D2; N7.
- **FR-009**: P1, P2.
- **FR-010**: D5; contract §H.
- **FR-011**: D1, V7.
- **FR-012**: D4; N1–N9 in both suites.
- **SC-001**: N1, N9, L2, L3.
- **SC-002**: N4, L4.
- **SC-003**: L5.
- **SC-004**: N8 and the existing suites.
- **SC-005**: contract §H review and L1–L5.

### CodeGraph structural check

Run with `codegraph_explore` at plan time (HEAD `5bc2621`).

**Affected symbols and blast radius**:

- `resolveLocator` (`src/tools/patch_heading/handler.ts:58`, `src/tools/patch_block/handler.ts:57`): private. Each has one caller, its own `execute*` handler. Both are deleted.
- `executePatchHeading` (`patch_heading/handler.ts:70`) and `executePatchBlock` (`patch_block/handler.ts:69`): their signatures do not change. Production callers are `createPatchHeadingTool` / `createPatchBlockTool` (`index.ts`), which `server.ts` and `_typed-result-fixtures.ts` call. Tests:
  - each tool's `handler.test.ts`, `handler.bytes-written.test.ts`, `handler.line-endings.test.ts`, `handler.unsafe-placement.test.ts` and `index.test.ts`;
  - the fixture consumers `_surface.test.ts` and `_plugin-noise.test.ts`.

  All of these use `path` or active mode (F5), so they keep their spawn counts.
- `resolveFsTarget` (`src/tools/_file-target.ts:66`): today called by `append_note/handler.ts` and `prepend/handler.ts`. It is not edited and gains two callers.
- `resolveFileByTsv` (`src/tools/_active-file.ts:242`): called by `_file-target.ts` and `find_and_replace/handler.ts`. Not edited.
- `resolveActiveLocatorWithVault` (`_active-file.ts:222`): today called directly by both editors and by `resolveFsTarget`. After the change both editors reach it through `resolveFsTarget` only. Not edited.
- `TARGET_MODE_FILE_DESCRIPTION` (`src/target-mode/target-mode.ts:9`) and both tools' `*_DESCRIPTION`, input and output schemas: not edited, so no fingerprint move.

**Kernel-node touch surface**:

- `createServer()`, `createLogger()` and `createQueue()` are not edited, and no production file gains a call to them.
- `UpstreamError` is not edited and gains no construction site.

That is the explicit no-touch claim for post-implement verification.

**Post-implement structural verification** (after `codegraph sync`):

1. No new error class or top-level code: `src/errors.ts` is unchanged, and neither handler adds a `new UpstreamError`.
2. No handler imports `createLogger` or `createQueue`; `server.ts` is unchanged.
3. Each editor's `handler.ts` imports `resolveFsTarget` from `../_file-target.js` and no longer imports `resolveActiveLocatorWithVault`. No `resolveLocator` symbol remains in either directory. `_file-target.ts` gains no import.
4. No orphan: `resolveFsTarget` has four production callers (`append_note`, `prepend`, `patch_heading`, `patch_block`). The change adds no new production export.

## Follow-ups (out of scope)

- patch_heading's published description and help page say `NOTE_NOT_FOUND` for a missing note, but a missing `path` gives `FS_WRITE_FAILED` (research F9). Fixing it changes a published error, so it needs its own BI.
- The editors' `file` field accepts `[[` / `]]`, which `append_note` and `prepend` reject. Aligning them changes the published schema.
- The editors have no file-type check (spec 070 FR-013 left them out; research D2).

## Complexity Tracking

> No Constitution Check violations; the table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
