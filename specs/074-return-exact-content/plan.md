# Implementation Plan: Return Exact Content

**Branch**: `074-return-exact-content` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/074-return-exact-content/spec.md`

> **Modify one existing typed tool (`read`) plus one additive field on a shared resolver.** No new tool, error code, sub-code or dependency. The CLI call and every existing failure are unchanged; the handler corrects the CLI's output using two facts read from the note on disk.

## Summary

`read` returns `obsidian read`'s stdout as-is. A live probe at plan time (research F2) shows that the CLI changes the text in **two** ways:

- it adds a line feed when the text does not end with one (the defect the spec names);
- it removes one leading byte-order mark. `docs/tools/read.md` wrongly says it does not.

Both changes break FR-001 ("nothing added and nothing removed"), the spec's byte-order-mark edge case and the User Story 4 round trip.

**Technical approach** ([research.md](research.md)):

- **D1**: keep the CLI `read` exactly as today. After it succeeds, read the note's bytes from disk and take two facts from them: whether they start with a byte-order mark (`bom`) and whether the last byte is a line feed (`finalLf`). Then drop the CLI's added `\n` when `!finalLf`, and put `﻿` back when `bom`. The result is always built from stdout, never from the disk bytes.
- **D2**: the vault root comes from the focused-file eval's `base` in active mode (a new optional `FileTarget.vaultRoot`). In specific mode it comes from `vaultRegistry.resolveVaultPath`, called after the CLI read, so an unknown vault still fails at the CLI.
- **D3**: an `fs.readFile` seam (default `node:fs/promises`).
- **D4**: a failed disk read raises `FS_WRITE_FAILED` with `details.reason: "read"`, the existing read-side shape from `find_and_replace`. It never falls back.
- **D5**: the small race between the two reads is accepted (last-write-wins, ADR-009).
- **D6**: the description, `docs/tools/read.md`, `docs/tools/index.md` and the changelog are updated.
- **D7**: tests are co-located.

The exact published surface is in [contracts/read-exact-content-contract.md](contracts/read-exact-content-contract.md).

**T0 gate**: satisfied at plan time. The live probe (research F2) pinned the CLI behaviour on 14 fixtures against the authorised test vault, and the fixtures were cleaned up. [quickstart.md](quickstart.md) §3 repeats it end to end as the acceptance check.

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. Unchanged.
**Primary Dependencies**: `@modelcontextprotocol/server` (SDK v2), `zod` 4 and `node:fs/promises` / `node:path`. **No new dependency.**
**Storage**: the vault's files on disk (read only).
**Testing**: `vitest run`, co-located `*.test.ts`. The handler tests use the existing `spawnFn` stubs (`makeQueuedSpawn`, `fileTsvResponse`, `focusedFileResponse`), `stubVaultRegistry` and an in-memory `readFile` stub. The fingerprint baseline is checked by `_register-baseline.test.ts`.
**Target Platform**: Windows, macOS and Linux; CI runs on Linux and Windows. `join` accepts either path separator.
**Project Type**: Single project, an MCP server (`src/**`).
**Performance Goals**: one extra local file read per successful `read`. That is negligible next to the CLI spawn; no new CLI call.

**Constraints**:

- zero new error codes or sub-codes (Principle IV);
- the `obsidian read` argv is byte-identical, and so is every existing failure and the point at which it is raised (FR-008, SC-005);
- the input schema and result shape are unchanged;
- no edit to `src/cli-adapter/**`, `src/errors.ts`, `src/vault-registry/**` or `src/tools/_register.ts`.

**Scale/Scope**:

- **Tool module**: `read/{handler,index}.ts` and their tests.
- **Shared resolver**: `_file-target.ts`, one optional field.
- **Composition root**: `src/server.ts`, one injection argument.
- **Baseline**: regenerated.
- **Docs**: `docs/tools/read.md`, `docs/tools/index.md` and `CHANGELOG.md`.

**Resolved unknowns**: all (research F1 to F6, D1 to D8).

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | The logic stays in `read/handler.ts`. `_file-target.ts` gains one optional field, and its imports are unchanged. `read/handler.ts` adds downward imports of `node:fs/promises`, `node:path`, `../_fs-errors.js` (`getErrno`) and the `VaultRegistry` type. No tool→tool edge and no cycle. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | `read/handler.test.ts` gains the happy-path table (every contract §2 row) and the failure and boundary cases: CLI failures make no disk read, an unknown vault fails at the CLI first, a disk-read failure gives `FS_WRITE_FAILED`, and the active root comes from the eval. `read/index.test.ts` asserts the new description. All in the same change. |
| **III. Boundary Input Validation with Zod** | **N/A** | No input change; `readInputSchema` is unchanged and still the single source of truth. |
| **IV. Explicit Upstream Error Propagation** | **Y** | No new code or class. A disk-read failure surfaces as the existing `FS_WRITE_FAILED` with the existing `reason: "read"` shape, keeping `cause`. A registry failure propagates unchanged. There is no fallback to the uncorrected stdout. Cancellation and progress still flow through `invokeCli`; the disk read is local and bounded. |
| **V. Attribution & Layered Composition** | **Y** | Modified files keep their `Original — no upstream.` headers, and their intent lines are updated (`read/handler.ts`, `_file-target.ts`). |
| **ADR-009** (direct filesystem path) | **Y** | Reuses the vault registry and an `fs` seam as ADR-009 laid out. The read is read-only, and the returned text never comes from a path the wrapper joined itself (research D1), so ADR-009's write-path containment does not apply. |
| **ADR-010 / ADR-013 / ADR-014** | **N/A** | No tool renamed or added, and no plugin-backed tool touched. |
| **ADR-015** (sub-discriminators) | **Y** | Reuses `FS_WRITE_FAILED`'s existing `reason: "read"`. No sub-reason added. |
| **ADR-040** (published parameter descriptions) | **Y** | No parameter change. The tool description is updated to state the exact contract. |
| **MCP Tool Surface Standards** | **Y** | Title, annotations (`READ_ONLY_HINTS`) and input schema unchanged. `read` publishes no `outputSchema`, as before. Only the description fingerprint moves, deliberately (contract §5). |
| **Security Defaults** | **Y** | The tool stays read-only. Containment is not needed, because only two bits are taken from the disk bytes and no disk content reaches the result (research D1). No escape hatch, read-only mode or allow/deny list is changed. |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**Kernel-node attention (per CLAUDE.md)**:

- **`createServer`** (the boot-spine entry point) **is touched**: one argument, `createReadTool({ logger, queue })` → `createReadTool({ logger, queue, vaultRegistry })`. `vaultRegistry` is already built there and injected into other tools, so no new construction and no new edge to `createLogger` / `createQueue`. The reviewer should confirm that the line is the only `server.ts` change.
- **`createLogger`, `createQueue`**: not touched.
- **`UpstreamError`**: one new construction site in `read/handler.ts`, for the disk-read failure. It uses the existing `FS_WRITE_FAILED` code; `src/errors.ts` is unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/074-return-exact-content/
├── plan.md                                   # This file
├── research.md                               # F1–F6 (incl. live CLI probe), D1–D8
├── data-model.md                             # Values, correction rule R1–R5, sequence
├── quickstart.md                             # Automated gate, baseline check, live end-to-end check
├── contracts/
│   └── read-exact-content-contract.md        # Input (unchanged), result table, errors, description, baseline
├── checklists/requirements.md
└── tasks.md                                  # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
src/tools/read/
├── handler.ts        # ExecuteDeps + vaultRegistry, fs?; ReadFs seam; exact-content correction after invokeCli;
│                     #   disk-read failure → FS_WRITE_FAILED { reason: "read" }
├── handler.test.ts   # contract §2 table; locator modes; ordering; failure cases; existing tests get registry/fs stubs
├── index.ts          # READ_DESCRIPTION states the exact contract
└── index.test.ts     # deps gain vaultRegistry; description assertion
src/tools/_file-target.ts       # FileTarget.vaultRoot? (active mode only, from the focused-file eval)
src/server.ts                   # createReadTool({ logger, queue, vaultRegistry })
src/tools/_register-baseline.json   # regenerated (read description only)
docs/tools/read.md              # caveat replaced by exact contract; Output row; FS_WRITE_FAILED error row
docs/tools/index.md             # read line: "raw text" → "exact text"
CHANGELOG.md                    # [Unreleased] Fixed

# UNCHANGED: src/cli-adapter/**, src/errors.ts, src/vault-registry/**, src/tools/_register.ts,
#   src/tools/_active-file.ts, src/tools/_fs-errors.ts, read/schema.ts, rename/move/outline handlers,
#   read_heading / read_property / search tools (spec Out of scope), obsidian_exec (raw CLI escape hatch)
```

**Structure Decision**: Single project. The change sits in the `read` tool module, plus one additive field in the shared resolver it already uses and one injection argument in the composition root.

**Docs-as-code**: the `.docs-as-code/` pages that describe `read` are updated by `/speckit-docs-as-code <n>` after review, per the PR lifecycle in CLAUDE.md.

## Phase 0: Research → research.md

- **F1**: the read path. The wrapper adds nothing; `resolveFileTarget` knows `relPath` in every mode, and in active mode the eval's `base`.
- **F2**: live probe. The CLI adds a final `\n` when the text does not end with one, and removes one leading byte-order mark. Nothing else changes.
- **F3**: the disk is the ground truth, reachable through the vault registry (ADR-009).
- **F4**: the existing read-side `FS_WRITE_FAILED` shape.
- **F5**: test seams.
- **F6**: published surface and baseline.
- **D1 to D8**: as summarised above.

**Output**: research.md, with no `NEEDS CLARIFICATION` remaining.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)**: values, the correction rule, invariants R1 to R5 and the sequence.
- **[contracts/read-exact-content-contract.md](contracts/read-exact-content-contract.md)**: §1 input unchanged; §2 the before/after table; §3 errors; §4 description; §5 baseline.
- **[quickstart.md](quickstart.md)**: the automated gate, the baseline diff and the live end-to-end check (under `.memory/test-execution-instructions.md`).
- **Agent context**: the `CLAUDE.md` SPECKIT block now points at this plan.

## Phase 1 re-check (post-design Constitution Check)

Re-evaluated against the data model and the contract:

- **I**: one module plus one additive field; imports run downward.
- **II**: every contract §2 row and §3 case has a co-located test.
- **III**: input unchanged.
- **IV**: no new code; no fallback; existing failures come first and are unchanged (R5).
- **V**: headers kept and updated.
- **MCP Tool Surface Standards**: only `read`'s description fingerprint moves.
- **Security Defaults**: no disk content reaches the result (R1).

**No gate regressed; Complexity Tracking is empty.**

### CodeGraph structural check

Run with `codegraph_explore` at plan time (HEAD `2f6011a`).

**Affected symbols and blast radius**:

- `executeReadNote` (`src/tools/read/handler.ts:26`): its only caller is `createReadTool`'s handler wrapper in `read/index.ts`. Tests: `read/handler.test.ts`.
- `createReadTool` (`src/tools/read/index.ts:14`): its only production caller is `createServer` (`src/server.ts:134`). Tests: `read/index.test.ts`. No typed-result fixture.
- `READ_DESCRIPTION` (`src/tools/read/index.ts:10`): also read by `_file-type-support.test.ts`, which checks the supported-types sentence. That sentence stays, so the test is unaffected.
- `resolveFileTarget` / `FileTarget` (`src/tools/_file-target.ts:44`, `:20`): callers are the `read`, `rename`, `move` and `outline` handlers. The new field is optional and set only in active mode; the other three ignore it.
- `resolveActiveFocusedFile` (`src/tools/_active-file.ts:184`): already returns `{ vaultRoot, relPath }`. **Not edited.**
- `VaultRegistry.resolveVaultPath` (`src/vault-registry/registry.ts:28`): among the most-depended-on interfaces. **Not edited**; `read` becomes one more consumer.
- `getErrno` (`src/tools/_fs-errors.ts:5`): reused, not edited.

**Kernel-node touch surface**:

- `createServer`: touched, with one injection argument (see Kernel-node attention above).
- `createLogger`, `createQueue`: not touched; no edge added or removed.
- `UpstreamError`: one new construction site with an existing code (`FS_WRITE_FAILED`). The class and `src/errors.ts` are unchanged.

High-blast-radius surface: `createServer` (one argument) only.

**Post-implement structural verification** (after `codegraph sync`):

1. No new error class or code. `src/errors.ts` is unchanged, and the new failure is `FS_WRITE_FAILED` (`reason: "read"`).
2. No handler imports `createLogger` / `createQueue`. `read/handler.ts` receives `vaultRegistry` through `ExecuteDeps`, and `server.ts` differs by the one argument.
3. `read/handler.ts` imports only `node:*`, `../../cli-adapter/*`, `../../file-type/*`, `../_file-target.js`, `../_fs-errors.js`, `../../errors.js` and types, so no upward or tool→tool import.
4. The new code is reachable: the correction runs on every successful `read` through `createReadTool` → `createServer`, and `FileTarget.vaultRoot` is read by `read/handler.ts`.

## Follow-ups (out of scope)

- `read_heading`, `read_property` and the search tools may show the same CLI changes (spec Out of scope). Each is a separate item if confirmed.
- `obsidian_exec` running `read` keeps the raw CLI output by design (escape hatch).

## Complexity Tracking

> No Constitution Check violations; the table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
