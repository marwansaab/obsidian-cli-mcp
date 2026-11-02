# Implementation Plan: Classify Missing Destination

**Branch**: `090-classify-missing-destination` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/090-classify-missing-destination/spec.md`

> **This change makes `move` report a missing destination folder as `FOLDER_NOT_FOUND`, and keeps the vault's absolute folder out of every `move` failure.** Today the CLI's raw `Error: ENOENT: no such file or directory, rename '<abs>' -> '<abs>'` line passes straight through as an untyped `CLI_REPORTED_ERROR`. After this change:
>
> - `executeMove` catches a failure of the move step (the CLI call or the response parse), after the CLI has reported it.
> - An ENOENT rename whose destination folder is not the vault root becomes `CLI_REPORTED_ERROR` with `details: { code: "FOLDER_NOT_FOUND", folder }`. The folder is the folder part of the already-computed `resolvedTo`, and no extra call is made.
> - Every other failure keeps its code and wording, with every occurrence of the vault's absolute folder rewritten to the vault-relative form. In active mode the root comes from the focused-file eval. In specific mode it comes from the vault registry, consulted only after a failure.
> - `move` now receives `vaultRegistry`. `server.ts` passes it, a one-argument change like spec 074's for `read`.
>
> The schemas, `src/errors.ts` and every successful move are unchanged. The `move` description gains one sentence, so the fingerprint baseline is regenerated on purpose.

## Summary

Research ([research.md](research.md)) read the code at HEAD `76f5926` and probed the live CLI in the test vault Sandbox (P1–P7).

Live findings:

- **F1**: the missing-folder failure is the CLI's ENOENT rename line on stdout, exit 0, naming both absolute paths.
- **F2**: nothing moves, and no folder is created.
- **F3**: the source is checked first.
- **F4**: a file used as a folder gives "Destination file already exists!".
- **F5**: the line is Node's platform-invariant fs error format.

Code findings:

- **F6, F7**: `resolvedTo` already holds the full vault-relative destination, so the folder needs no lookup.
- **F8**: the other CLI-text-carrying codes can echo the root.
- **F9, F10**: `move` has no vault root in specific mode. The registry, built from the same `obsidian vaults` list as the CLI, supplies it, as it does for `read`.
- **F11**: `FOLDER_NOT_FOUND` + `details.folder` is the existing shape.
- **F12**: no tool creates an empty folder. `write_note` creates parent folders.
- **F13**: existing tests build `move`'s deps without a registry.

Decisions:

- **D1**: classify after the CLI fails, with no pre-check.
- **D2**: an ENOENT rename line means a missing folder (an accepted race residual).
- **D3**: the folder is `resolvedTo` up to its last `/`.
- **D4**: rewrite the vault root out of every other failure, except `CLI_BINARY_NOT_FOUND`, and return the original object when nothing changed.
- **D5** (amended at analyze, U1): the root comes from the active-mode eval or from the registry after the failure.
  - If the registry reports the vault as not registered, the original error is returned untouched.
  - If the lookup fails in any other way, the CLI text is withheld: the code is kept, the vault-relative source and destination are named, and the lookup failure becomes `cause` (data-model E4c).
- **D6**: `vaultRegistry` becomes a required `move` dependency.
- **D7**: the `FOLDER_NOT_FOUND` payload.
- **D8**: description, help page and CHANGELOG.
- **D9**: a new suite, M1–M20, plus R1.

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. Unchanged.

**Primary Dependencies**: `@modelcontextprotocol/server` (SDK v2), `zod` 4. No new dependency.

**Storage**: none. `move` stays a CLI pass-through. The only new read is the in-memory vault registry, which spawns `obsidian vaults verbose` only on its first use, and only on a failure path.

**Testing**:

- `vitest run`, with co-located `*.test.ts`, run through PowerShell.
- The new suite uses `makeQueuedSpawn` / `makeStubSpawn`, `fileTsvResponse`, `focusedFileResponse` and a recording stub over `stubVaultRegistry` (`_handler-test-fixtures.ts`).
- The required live check (quickstart §3) runs the built server against `TestVault-Obsidian-CLI-MCP`, following `.memory/test-execution-instructions.md`.

**Target Platform**: Windows, macOS and Linux; CI runs on Linux and Windows. The ENOENT line has the same shape on every platform (F5). The rewrite matches either separator and ignores case, so a Windows root is found in any spelling. M7 covers the POSIX form.

**Project Type**: single project, an MCP server.

**Performance Goals**: a successful move costs exactly what it costs today (FR-012). A missing-folder failure costs nothing extra. Other failures cost one in-memory registry lookup in specific mode. That lookup is a `vaults` probe only when the registry cache is cold or misses.

**Constraints**:

- FR-007 / FR-012: failures without a path, and every success, are byte-identical.
- FR-008: no new top-level code and no new sub-code.
- Refactor-decisions item 5: the existing-test edits X1–X6 are approved (owner ruling option A, 2026-11-02) as field additions only. Any other failing existing test stops implement.
- Item 29: deps stay passed whole to `invokeCli`.
- Item 32(b), (d): active mode still sends no `vault=`, and the `forwardedTo` argv bytes are kept.
- The `index.test.ts` drift lock: the handler makes no `deps.logger` use.

**Scale/Scope**:

- **Changed code**:
  - `src/tools/move/handler.ts`:
    - `ExecuteDeps` gains `vaultRegistry`;
    - the move step goes in a `try`;
    - three small private helpers: the missing-folder check, the `FOLDER_NOT_FOUND` builder and the vault-root rewrite;
    - the header is updated.
  - `src/tools/move/index.ts`: one sentence added to `MOVE_DESCRIPTION`, and the header.
  - `src/server.ts`: `createMoveTool({ logger, queue, vaultRegistry })`.
- **New tests**: `src/tools/move/handler.missing-destination.test.ts` (M1–M20), and R1 in `move/index.test.ts`.
- **Edited tests**: X1–X6, which add a field only (approved, option A).
- **Regenerated**: `src/tools/_register-baseline.json` (the `move` description only).
- **Docs**:
  - `docs/tools/move.md` (§H2–H5);
  - `CHANGELOG.md` (§C);
  - the `CLAUDE.md` plan pointer (after_plan hook).

**Resolved unknowns**: none open. The probes settled the failure text, the check order, the file-as-folder case and the no-side-effect fact (F1–F5).

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | The logic stays in `move/handler.ts`, as private helpers next to their one caller. The handler adds one downward type import (`VaultRegistry` from `../../vault-registry/registry.js`, which `read` already imports) and uses `UpstreamError`, which it already imports. No tool-to-tool edge and no cycle. The `{schema, tool, handler}` layout is unchanged. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | `move` is modified, so it ships happy-path rows (M17, R1 for the wire), failure rows (M1–M12, M18–M20) and boundary and regression rows (M9, M13–M16) in the same change. The tests are co-located. |
| **III. Boundary Input Validation with Zod** | **Y** | The schemas are unchanged. The new code inspects `UpstreamError.details`, an internal value, not boundary input. |
| **IV. Explicit Upstream Error Propagation** | **Y** | Every failure still surfaces as an `UpstreamError` with a stable code, and the missing-folder failure is now a documented recovery path (create the folder, then retry). No failure is swallowed.

When the registry lookup throws, the lookup error is never thrown in the move failure's place:

- **The vault is not registered**: the ORIGINAL failure is surfaced, which is the true report.
- **Any other lookup failure**: the move failure keeps its code and names the source and destination; its raw text is withheld; and the lookup failure is attached as `cause` and named in the message. Both failures are reported (research D5, analyze U1).

`cause` is kept, except on `FOLDER_NOT_FOUND`, where it would carry the absolute paths ("where safe"). Cancellation is untouched: the abort reason is not an `UpstreamError` and is rethrown without a lookup. |
| **V. Attribution & Layered Composition** | **Y** | The new test file carries `// Original — no upstream.`, and the headers of `move/handler.ts` and `move/index.ts` are updated. |
| **ADR-010 / ADR-013 / ADR-014** | **N/A** | No tool is added or renamed, and the tool is not plugin-backed. |
| **ADR-015** (sub-discriminators) | **Y** | This reuses the existing `(CLI_REPORTED_ERROR, FOLDER_NOT_FOUND)` pair with one sub-state, so there is no `details.reason` (Clarification Q2). No new sub-states are added to existing pairs. |
| **MCP Tool Surface Standards** | **Y** | Title, hints, schemas and outputSchema are unchanged. The description change is deliberate, and the baseline is regenerated in the same PR (P1, P2). Error results stay text-only (R1). |
| **Security Defaults** | **Y** | No new escape hatch and no new write path; `move` stays `DESTRUCTIVE_HINTS`. The change removes an information leak of the operator's disk layout (FR-005). |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**Kernel-node attention (per CLAUDE.md)**:

- **`createServer()`** (the boot-spine entry point) **is touched**. The single edit adds one argument: `createMoveTool({ logger, queue })` becomes `createMoveTool({ logger, queue, vaultRegistry })`. `vaultRegistry` is already built there and injected into other tools, so there is no new construction and no new edge to `createLogger` / `createQueue`. The reviewer should confirm that this line is the only `server.ts` change.
- **`UpstreamError`** is not edited. `move/handler.ts` gains construction sites (the `FOLDER_NOT_FOUND` failure and the rewritten copy), each using an existing code.
- **`createLogger()` / `createQueue()`** are not edited, and no production file gains a call to them.

## Project Structure

### Documentation (this feature)

```text
specs/090-classify-missing-destination/
├── plan.md                                   # This file
├── research.md                               # T0 probes P1–P7, findings F1–F13, decisions D1–D9, follow-ups
├── data-model.md                             # E1–E5, invariants V1–V6, per-call flow
├── quickstart.md                             # approval gate, automated gate + red check, surface gate, live check
├── contracts/
│   └── missing-destination-contract.md       # §P surface, §E errors, §T rows M1–M20 + R1, §X test edits, §H, §C, §L
├── checklists/requirements.md
└── tasks.md                                  # Phase 2: /speckit-tasks
```

### Source Code (repository root)

```text
src/tools/move/handler.ts                             # vaultRegistry dep; try around the move step; FOLDER_NOT_FOUND; vault-root rewrite; header
src/tools/move/handler.missing-destination.test.ts    # NEW: M1–M20
src/tools/move/index.ts                               # MOVE_DESCRIPTION + one sentence (§H1); header
src/tools/move/index.test.ts                          # NEW it R1; X4 (vaultRegistry in four literals)
src/tools/move/handler.test.ts                        # X1–X3 (vaultRegistry field only)
src/tools/_typed-result-fixtures.ts                   # X5
src/tools/_plugin-noise.test.ts                       # X6
src/server.ts                                         # createMoveTool({ logger, queue, vaultRegistry })
src/tools/_register-baseline.json                     # regenerated: move description only
docs/tools/move.md                                    # §H2–H5
CHANGELOG.md                                          # §C

# UNCHANGED: src/tools/move/schema.ts, src/errors.ts, src/cli-adapter/**, src/vault-registry/**,
#   src/tools/_file-target.ts, src/tools/_active-file.ts, src/file-type/**, every other tool
```

**Structure Decision**: single project. The behaviour belongs to `move` alone, so it lives in `move/handler.ts`. It does not go in a shared module: only one caller exists, and `rename` is out of scope (research follow-ups). The new suite sits next to the handler, following the `handler.<topic>.test.ts` split other tools use (`handler.note-name`, `handler.line-endings`).

**Docs-as-code**: after review, `/speckit-docs-as-code <n>` updates the `.docs-as-code/` pages that describe `move`'s failures and its deps. That means noting that `move` now takes the vault registry, and that its failures are vault-relative.

## Phase 0: Research → research.md

- **T0 method**: live probes P1–P7 against `Obsidian.com` in the `TestVault-Obsidian-CLI-MCP` Sandbox. The fixtures under `Sandbox/090-probe/` were removed afterwards, and `Sandbox/` is back to its 13 entries.
- **F1–F13 and D1–D9**: summarised above.
- **Plan-time spec alignment**: SC-003's two-call recovery holds. The folder is created by writing a note into it with `write_note` (F12), and the failure's message names that route. A dedicated folder-creation capability is a follow-up.
- **Analyze-time alignment** (owner approved F1, U1 and C1, 2026-11-02):
  - **F1**: M13 now expects `message: "Vault not found."`, today's message.
  - **U1**: a lookup failure other than an unregistered vault now gives the withheld failure (E4c), with no recorded residual. Row M18 covers it.
  - **C1**: row M19 covers the full-path backslash destination.
  - **LOW** (settled without owner input):
    - **I1**: spec Assumption, live on Windows only.
    - **I2**: tasks structural note.
    - **C2**: row M20, the parse-stage rewrite.
    - **C3**: M15 names the file-as-folder edge case.
    - **A1**: SC-001 mapping (see the Spec alignment note).
- **Follow-ups**:
  - a folder-creation tool;
  - scrubbing resolution-stage failures in the shared `_active-file.ts` resolvers (cross-tool);
  - `rename`'s identical pass-through of Node fs error text (rename failures are out of scope).

**Output**: research.md, with no `NEEDS CLARIFICATION` remaining.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)**:
  - E1, the request;
  - E2, the resolved move;
  - E3, the destination folder table;
  - E4, the failure shapes (E4a new, E4b kept);
  - E5, the rewrite rules R-a to R-f;
  - invariants V1–V6;
  - the per-call flow.
- **[contracts/missing-destination-contract.md](contracts/missing-destination-contract.md)**:
  - P1–P4;
  - the error contract E-1 to E-3;
  - test rows M1–M20 and R1;
  - the approval list X1–X6;
  - the exact description and help text (§H1–H5);
  - the CHANGELOG text (§C);
  - the live column L1–L7.
- **[quickstart.md](quickstart.md)**: the approval gate, the automated gate with a red check, the surface gate and the required live check.
- **Agent context**: the `CLAUDE.md` plan pointer is moved to this plan by the `after_plan` agent-context hook.

## Phase 1 re-check (post-design Constitution Check)

- **I**: private helpers in the tool's own handler, plus one downward type import; acyclic.
- **II**: happy, failure, boundary and regression rows and a wire row, in the same change.
- **III**: schemas untouched.
- **IV**: typed failures; the original error is surfaced when the root is unknowable; `cause` is kept where safe; cancellation is untouched.
- **V**: headers present and updated.
- **Tool Surface Standards**: one deliberate description change, with the baseline regenerated (P1, P2).
- **Security Defaults**: one information leak closed; nothing else touched.

**No gate regressed; Complexity Tracking is empty.**

### Spec alignment note

- **FR-001**: D2, E-1; M1–M7; L1, L2.
- **FR-002**: D3, E3; M1–M5, M19; L1–L3.
- **FR-003**: F2; L1, L2 (on-disk check).
- **FR-004**: D7; M1 (`toEqual` on the message); H2.
- **FR-005**: D4, D5, E5, E4c; M8–M12, M18, M20; L7.
- **FR-006**: V3; M14; L5.
- **FR-007**: E-3; M13–M16 and the existing suites; L5, L6.
- **FR-008**: V6; P3.
- **FR-009**: M4–M6; L3.
- **FR-010**: F5; M1 (Windows), M7 (POSIX).
- **FR-011**: D8; H1–H4; P1, P2.
- **FR-012**: D1, V4; M17 and the existing suites.
- **SC-001**: M1–M7 and M19. CI runs them on Linux and Windows: M1 covers the Windows ENOENT form and M7 the POSIX form. macOS shares M7's POSIX form (research F5) and is not run separately, because CI has no macOS lane (L1–L3 are live on Windows only).
- **SC-002**: M8–M12, L7.
- **SC-003**: L4.
- **SC-004**: M14.
- **SC-005**: L1, L2.
- **SC-006**: M17 and the existing suites.

### CodeGraph structural check

Run with `codegraph_explore` at plan time (HEAD `76f5926`).

**Affected symbols and blast radius**:

- **`executeMove`** (`src/tools/move/handler.ts:59`): its signature is unchanged. It is called by `createMoveTool`'s handler closure (`move/index.ts`), and tested by `move/handler.test.ts` and, through the tool, by `move/index.test.ts`, `_plugin-noise.test.ts` and `_typed-result-fixtures.ts`. Its `ExecuteDeps` gains a required field, which drives edits X1–X6.
- **`ExecuteDeps` / `RegisterDeps`** (`move/handler.ts:14`, `move/index.ts:12`): `RegisterDeps = BootDeps<ExecuteDeps>`, so the new field reaches `createMoveTool`'s callers: `server.ts:123`, `_typed-result-fixtures.ts:210`, `_plugin-noise.test.ts:230` and `move/index.test.ts`.
- **`resolveTo`, `parseMoveResponse`**: private and unchanged.
- **`resolveFileTarget`** (`src/tools/_file-target.ts:44`): unchanged. `move` already reads `vaultRoot` from its active-mode result type.
- **`VaultRegistry.resolveVaultPath`** (`src/vault-registry/registry.ts:28`): among the most-depended-on interfaces. It is not edited, and `move` becomes one more consumer.
- **`MOVE_DESCRIPTION`** (`move/index.ts:10`): changed, so the `move` entry in `_register-baseline.json` moves. `index.test.ts` asserts it by identity (`toBe(MOVE_DESCRIPTION)`) and by `/link/i`, and both still hold.
- **`invokeCli`, `_dispatch.ts` classification**: unchanged. The new code reads the `details.message` / `details.stdout` they already produce.

**Kernel-node touch surface**:

- **`createServer()`**: touched, one argument (see Kernel-node attention).
- **`UpstreamError`**: not edited. It gains construction sites in `move/handler.ts` only.
- **`createLogger()` / `createQueue()`**: not edited, and no new caller.

That is the explicit touch and no-touch claim for post-implement verification.

**Post-implement structural verification** (after `codegraph sync`):

1. **Codes**: no new error class or top-level code, and `src/errors.ts` is unchanged. Every new `new UpstreamError` in `move/handler.ts` uses `CLI_REPORTED_ERROR` or the caught error's own code.
2. **DI**: no handler imports `createLogger` / `createQueue`. `server.ts` differs from `main` by the one `createMoveTool` argument only.
3. **Imports**: `move/handler.ts` imports only downward (`cli-adapter`, `errors`, `file-type`, `_file-target`, and the `VaultRegistry` type). No other tool imports from `move/`.
4. **No orphans**: the new private helpers have one caller, `executeMove`, and the change adds no new production export.

## Follow-ups (out of scope)

- A capability to create an empty folder (research F12).
- Scrubbing vault paths from resolution-stage failures in `_active-file.ts`, which is shared by every file-path tool.
- `rename` passes Node fs error text through the same way.

## Complexity Tracking

> No Constitution Check violations; the table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
