# Implementation Plan: Report Missing Notes on Add-to-Top

**Branch**: `077-fix-prepend-not-found` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/077-fix-prepend-not-found/spec.md`

> **This change modifies one existing typed tool, `prepend`.** It adds no tool, input parameter, output field, top-level error code, `details.code`, `details.reason` or dependency. It makes the existing `CLI_REPORTED_ERROR` / `NOTE_NOT_FOUND` failure fire for a missing note, and documents its fields.

## Summary

`prepend` on a missing note returns a generic `CLI_REPORTED_ERROR` with `details.stage: "prepend-cli"` instead of the documented `NOTE_NOT_FOUND`. Two reasons (research F1, F2): the pre-call `stat` sees `ENOENT` but deliberately swallows it, and the upstream classifier's not-found patterns are unconfirmed placeholders that miss Obsidian's real line, `Error: File "<path>" not found.`. `append_note` reports the same case as documented (F3).

**Technical approach** ([research.md](research.md)), following clarification Q1 (Option A, both layers):

- **D1**: the pre-call `stat` `ENOENT` throws the missing-note failure before Obsidian is called, as `append_note`'s pre-write read and `query_base`'s pre-flight `BASE_NOT_FOUND` do. The stat runs in default and inline mode, so it covers both.
- **D2**: `classifyUpstreamFailure` also recognises the T0-confirmed line through one new, anchored pattern (`/^\s*Error: File ".*" not found\.\s*$/m`), for the cases only Obsidian can see: case mismatch on a case-insensitive file system, or a note removed after the stat. The placeholder patterns stay, so nothing they match today changes (FR-007).
- **D3**: one module-private builder, `noteNotFound(relPath, vaultDisplayName, cause)`, produces the failure for both layers, so they cannot drift.
- **D4**: `details.vault` stays `vaultDisplayName`, which equals `input.vault` in specific mode (exact parity with `append_note`).
- **D5**: documentation (`docs/tools/prepend.md` error row, `CHANGELOG.md`, the handler's header and comments).
- **D6**: live verification against the test vault, which must be the vault open in Obsidian.

The published behaviour is in [contracts/prepend-not-found-contract.md](contracts/prepend-not-found-contract.md).

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. Unchanged.
**Primary Dependencies**: `@modelcontextprotocol/server` (SDK v2), `zod` 4, `node:fs/promises`. **No new dependency.**
**Storage**: the vault's files on disk.
**Testing**: `vitest run`, with co-located `*.test.ts` files. A new `prepend/handler.not-found.test.ts` uses prepend's `_handler-fixtures.ts` (`fakeFs` with a `stat` override, `makeQueuedSpawn`) and, for the parity case, `executeAppendNote` with an inline fake fs. One existing test is rewritten (research F5).
**Target Platform**: Windows, macOS and Linux; CI runs on Linux and Windows.
**Project Type**: single project, an MCP server (`src/**`).
**Performance Goals**: a missing note now costs one `stat` and no Obsidian call (previously a full CLI round-trip). No other path changes.

**Constraints**:

- no new top-level error code or sub-discriminator (Principle IV, ADR-015);
- no input, output, description or annotation change, so no baseline movement;
- every failure other than a missing note is reported as today (FR-007);
- no edit to `src/tools/append_note/**`, `src/cli-adapter/**`, `src/errors.ts`, `src/tools/_file-target.ts`, `src/tools/_active-file.ts`, `src/server.ts`, `src/tools/_register.ts` or any other tool module.

**Scale/Scope**:

- **Code**: `src/tools/prepend/handler.ts`.
- **Tests**: `src/tools/prepend/handler.not-found.test.ts` (new); `src/tools/prepend/handler.test.ts` (one test rewritten).
- **Docs**: `docs/tools/prepend.md`, `CHANGELOG.md`.

**Resolved unknowns**: all. The T0 probe (research F2) confirmed Obsidian's wording, its channel and exit code, that no note is created, and the case-sensitivity behaviour.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | All code stays in `prepend/handler.ts`. No new import, no tool→tool edge, no upward import, no cycle. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | Each contract §3 row that changes (E1–E5, E11) has a failure case; parity (E6) and the FR-007 guards (E7) have cases; unchanged rows (E8–E10) stay covered by existing tests. Tests are co-located and land in the same change. |
| **III. Boundary Input Validation with Zod** | **Y** | Schemas untouched; `PrependInput` / `PrependOutput` stay `z.infer`. |
| **IV. Explicit Upstream Error Propagation** | **Y** | A previously swallowed `ENOENT` now surfaces as a typed `UpstreamError` with `code`, `cause` (the fs error) and `details`, replacing a silent fallback. Obsidian's report is classified with `cause` set to the dispatch error. No new code; the other errors are untouched. |
| **V. Attribution & Layered Composition** | **Y** | The new test file carries an `Original — no upstream.` header. The intent header of `handler.ts` is updated to say the pre-call stat reports `NOTE_NOT_FOUND` and the pattern is T0-confirmed. |
| **ADR-009** (direct filesystem path) | **Y** | The check uses the existing `stat` on the canonicalised `absPath`. Obsidian still owns the write. |
| **ADR-010 / ADR-013 / ADR-014** | **N/A** | No tool renamed or added; no plugin-backed tool touched. |
| **ADR-015** (sub-discriminators) | **Y** | Reuses the existing `details.code: NOTE_NOT_FOUND`; nothing new. |
| **ADR-040** (published parameter descriptions) | **Y** | No input change. |
| **MCP Tool Surface Standards** | **Y** | Title, annotations (`ADDITIVE_WRITE_HINTS`), schemas and description unchanged, so no fingerprint moves. Failures still return as `isError: true` through `registerTool`. |
| **Security Defaults** | **Y** | The `stat` runs only after `assertCanonicalPath` has contained the path. A missing note now stops before Obsidian is called, so the CLI's open-vault routing (research F2) cannot turn a missing-note call into a write in another vault. No escape hatch, read-only mode or list changed. |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**Kernel-node attention (per CLAUDE.md)**:

- `UpstreamError` gets **one new construction site** in `prepend/handler.ts` (`noteNotFound`), which also replaces the existing inline construction in `classifyUpstreamFailure`. `src/errors.ts` is unchanged and no code is added. Reviewers should check the builder's `code`, `cause` and `details` against `append_note`'s.
- `createServer`, `createLogger` and `createQueue` are not touched.

## Project Structure

### Documentation (this feature)

```text
specs/077-fix-prepend-not-found/
├── plan.md                                  # This file
├── research.md                              # F1–F6 findings (F2 = T0 probe), D1–D6 decisions
├── data-model.md                            # failure shape, detection points, invariants R1–R4
├── quickstart.md                            # automated gate, baseline no-diff, live check
├── contracts/
│   └── prepend-not-found-contract.md        # §1–§2 unchanged, §3 examples E1–E11, §4 errors, §5 surface
├── checklists/requirements.md
└── tasks.md                                 # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
src/tools/prepend/handler.ts                    # stat ENOENT → noteNotFound; new confirmed pattern; noteNotFound builder; header/comments
src/tools/prepend/handler.not-found.test.ts     # NEW: E1–E7, E11 cases
src/tools/prepend/handler.test.ts               # rewrite "pre-stat ENOENT → … succeeds" to expect NOTE_NOT_FOUND, no spawn
docs/tools/prepend.md                           # NOTE_NOT_FOUND row: details fields, message, detection points
CHANGELOG.md                                    # [Unreleased] Fixed

# UNCHANGED: src/tools/prepend/{schema,index,empty-body,_handler-fixtures}.ts,
#   src/tools/_register-baseline.json, src/tools/append_note/**, src/errors.ts,
#   src/cli-adapter/**, src/tools/_file-target.ts, src/tools/_active-file.ts,
#   src/server.ts, src/tools/_register.ts, every other tool module
```

**Structure Decision**: single project. The change sits entirely in the `prepend` tool module.

**Docs-as-code**: the `.docs-as-code/` pages that describe `prepend` are updated by `/speckit-docs-as-code <n>` after review, per the PR lifecycle in CLAUDE.md.

## Phase 0: Research → research.md

- **F1**: prepend's current missing-note path (swallowed `ENOENT`, placeholder patterns).
- **F2**: T0 live probe (wording, channel, exit code, no creation, case sensitivity) and the probe-environment note.
- **F3**: `append_note`'s missing-note shape, the parity target.
- **F4**: `query_base`'s two-layer precedent.
- **F5**: tests and fixtures, including the one test that encodes the old behaviour.
- **F6**: published surface.
- **D1 to D6**: as summarised above.

**Output**: research.md, with no `NEEDS CLARIFICATION` remaining.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)**: the failure's fields, the two detection points and invariants R1 to R4.
- **[contracts/prepend-not-found-contract.md](contracts/prepend-not-found-contract.md)**: examples E1 to E11 with today's and the new results, the error row, and the unchanged surface.
- **[quickstart.md](quickstart.md)**: the automated gate, the baseline no-diff check, and the live check under `.memory/test-execution-instructions.md`.
- **Agent context**: the `CLAUDE.md` plan pointer now points at this plan.

## Phase 1 re-check (post-design Constitution Check)

- **I**: one tool module, no new import.
- **II**: every changed contract row and every guard maps to a co-located test.
- **III**: schemas untouched.
- **IV**: a swallowed error becomes a typed failure with `cause`; no new code.
- **V**: header on the new test file; handler intent line updated.
- **MCP Tool Surface Standards**: no fingerprint moves.
- **Security Defaults**: the check runs after containment and stops a missing-note call before Obsidian.

**No gate regressed; Complexity Tracking is empty.**

### Spec alignment note

- **Active-mode echo** (research D4): in the race where the focused note disappears before the call, `prepend` echoes the resolved vault display name, while `append_note` echoes `null`. Specific mode, which FR-004 and SC-002 test, is identical. The spec's Assumptions record this; aligning `append_note` is a follow-up.
- **SC-004** ("existing failure tests unchanged"): the one rewritten test (research F5) asserted success for a missing note, which is the case this BI fixes, not another failure. Every test of a non-missing-note failure stays unchanged.

### CodeGraph structural check

Run with `codegraph_explore` at plan time (HEAD `f60d1f0`).

**Affected symbols and blast radius**:

- `executePrepend` (`src/tools/prepend/handler.ts:138`): registered by `createPrependTool` (`prepend/index.ts:69`), which `server.ts` and `_typed-result-fixtures.ts` call. Tests: `handler.test.ts`, `handler.bi047.test.ts`, `handler.file-type.test.ts`, `handler.empty-body.test.ts`. The `_typed-result-fixtures.ts` entry uses a succeeding `stat`, so it is unaffected.
- `classifyUpstreamFailure` and `NOTE_NOT_FOUND_PATTERNS` (`handler.ts:84`, `:53`): module-private, one caller each (`executePrepend`, `classifyUpstreamFailure`). Exercised through the handler tests above.
- `ExecuteFs` (`handler.ts:19`): not edited.
- `resolveFsTarget` (`src/tools/_file-target.ts:66`): read, not edited. Shared with `append_note`; returns `vaultDisplayName: input.vault!` in specific mode, which underpins D4's parity claim.
- `executeAppendNote` (`src/tools/append_note/handler.ts:55`): read, not edited; the new parity test calls it.

**Kernel-node touch surface**: `UpstreamError` only, through the `noteNotFound` builder in `prepend/handler.ts`. `createServer`, `createLogger` and `createQueue` are not touched.

**High-blast-radius surface**: none edited.

**Post-implement structural verification** (after `codegraph sync`):

1. No new error class or code: `src/errors.ts` unchanged; the builder uses `CLI_REPORTED_ERROR` / `NOTE_NOT_FOUND`.
2. No handler imports `createLogger` / `createQueue`; `server.ts` unchanged.
3. `noteNotFound` is module-private to `prepend/handler.ts`; no new import in that file; no tool→tool import.
4. `noteNotFound` is reachable from `createPrependTool` → `createServer` through `executePrepend` (both call sites).

## Follow-ups (out of scope)

- **append_note's active-mode echo**: `details.vault` is `input.vault ?? null`, so active-mode missing-note failures carry `null`; aligning it with prepend's display name is a separate item (spec Out of Scope: other capabilities).
- **Placeholder patterns**: `prepend`'s unconfirmed not-found and editor-conflict patterns could be replaced with T0-confirmed ones in a separate item; this BI keeps them to honour FR-007.
- **CLI open-vault routing**: during the T0 probe, the Obsidian CLI ran `vault=TestVault-Obsidian-CLI-MCP` commands against the vault open in Obsidian (research F2). Worth checking whether spec 072's closed-vault handling covers the CLI-wrapped writers (`prepend`'s Obsidian call) and the test-execution instructions (open the test vault first).

## Complexity Tracking

> No Constitution Check violations; the table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
