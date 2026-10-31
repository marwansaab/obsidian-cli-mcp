# Implementation Plan: Unify Size Reporting

**Branch**: `075-unify-size-reporting` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/075-unify-size-reporting/spec.md`

> **This change modifies five existing typed tools and adds one shared description string.** It adds no new tool, error code, sub-code, dependency or input parameter. The change has three parts: `bytes_written` takes one meaning, the size after the write minus the size before; `write_note` gains the field; and the docs and changelog say so.

## Summary

The five single-note text writers (append_note, prepend, patch_heading, patch_block, write_note) report three different things today (research F1):

- `append_note` and `prepend` report the size change;
- `patch_heading` and `patch_block` report the note's total size after the edit;
- `write_note` reports nothing.

**Technical approach** ([research.md](research.md)):

- **D1**: compute `after − before` where each tool already has the data. The two adders are unchanged. The patch tools subtract `byteLength(originalContent)`, a string they already hold. write_note subtracts the old size from `byteLength(content)`.
- **D2**: write_note's overwrite-branch existence probe changes from `realpath` to `stat`, which yields both existence and the old size. A non-ENOENT failure fails before the write through the existing `FS_WRITE_FAILED { errno, syscall, path }` (clarification Q3).
- **D3**: the patch schemas lose `min(0)`, and write_note's strict output gains `bytes_written`.
- **D4**: one shared `BYTES_WRITTEN_DESCRIPTION` in `src/tools/_shared.ts` describes the field on all five output schemas.
- **D5**: the five reference pages use one sentence for the field, drop the "near-zero is a red flag" advice, and the changelog gets Changed (with a migration note) and Added entries.
- **D6**: tests are co-located, including the uniform after-minus-before check.
- **D7**: no T0 probe is needed.
- **D8**: an ADR for the convention is recorded in the docs-as-code pass.

The published surface is in [contracts/bytes-written-contract.md](contracts/bytes-written-contract.md).

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. Unchanged.
**Primary Dependencies**: `@modelcontextprotocol/server` (SDK v2), `zod` 4 and `node:fs/promises`. **No new dependency.**
**Storage**: the vault's files on disk.
**Testing**: `vitest run`, with co-located `*.test.ts`. The tests use the existing in-memory fake-fs fixtures; write_note's `fakeFs` gains a `stat` stub whose default throws ENOENT. The fingerprint baseline is checked by `_register-baseline.test.ts`.
**Target Platform**: Windows, macOS and Linux; CI runs on Linux and Windows.
**Project Type**: Single project, an MCP server (`src/**`).
**Performance Goals**: no new I/O except write_note's `stat`, which replaces its `realpath` one for one. The patch tools add one subtraction.

**Constraints**:

- zero new error codes, sub-codes or details keys (Principle IV, FR-011);
- inputs unchanged;
- append_note's and prepend's values and guards unchanged (FR-005);
- no edit to `src/cli-adapter/**`, `src/errors.ts`, `src/vault-registry/**`, `src/server.ts`, `src/tools/_register.ts`, `src/tools/_note-io.ts` or `src/tools/_fs-errors.ts`.

**Scale/Scope**:

- **Tool modules**: `{append_note, prepend, patch_heading, patch_block, write_note}/{schema,handler?}.ts`; append_note's and prepend's handlers are not edited.
- **Tests**: the same tools' `handler`, `schema` and `index` tests, plus write_note's `_handler-fixtures.ts`.
- **Shared**: `_shared.ts`, one exported string.
- **Baseline**: regenerated.
- **Docs**: the five `docs/tools/*.md` pages, `docs/tools/index.md` and `CHANGELOG.md`.

**Resolved unknowns**: all (research F1 to F7, D1 to D8).

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | Each change stays in its tool's `schema.ts` / `handler.ts`. The only new edge is `schema.ts → ../_shared.js`, which is downward; `_shared.ts` already serves the tool modules and imports only types. No tool→tool edge and no cycle. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | Every modified tool gets happy-path cases (grow) and boundary cases (0, negative, empty create, multi-byte). write_note also gets a failure case: a `stat` errno gives `FS_WRITE_FAILED` with nothing written. All in the same change, in co-located files. |
| **III. Boundary Input Validation with Zod** | **Y** | The zod output schemas remain the single source of the published shape. `WriteNoteOutput` and the patch outputs are still `z.infer`. No hand-rolled types. Inputs are unchanged. |
| **IV. Explicit Upstream Error Propagation** | **Y** | No new code or class. write_note's new failure point reuses `mapFsError` → `FS_WRITE_FAILED`, keeping `cause`, before any write. There is no fallback, guess or omitted figure. prepend's guard is unchanged. |
| **V. Attribution & Layered Composition** | **Y** | Modified files keep their `Original — no upstream.` headers. The intent lines of `write_note/handler.ts` (its result is now `{ created, path, bytes_written }`) and `_shared.ts` (it now holds `BYTES_WRITTEN_DESCRIPTION`) are updated. |
| **ADR-009** (direct filesystem path) | **Y** | The stat probe sits on the same `fs` seam and the already-canonicalised `absPath`. The atomic write is unchanged. Generic fs failures still map to `FS_WRITE_FAILED` with `details.errno` (Decision §7). |
| **ADR-010 / ADR-013 / ADR-014** | **N/A** | No tool renamed or added, and no plugin-backed tool touched. |
| **ADR-015** (sub-discriminators) | **Y** | No sub-reason added. prepend's `post-stat-byte-delta-zero` is kept. |
| **ADR-040** (published parameter descriptions) | **Y** | No input change. |
| **MCP Tool Surface Standards** | **Y** | Titles, annotations, input schemas and descriptions are unchanged. The typed results keep `structuredContent` and identical text. Five `outputSchemaFingerprint`s move deliberately and the baseline is regenerated in the PR (contract §6). |
| **Security Defaults** | **Y** | Write containment (`assertCanonicalPath`) runs before the new `stat`, exactly as before the old `realpath`. No escape hatch, read-only mode or list is changed. |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**Kernel-node attention (per CLAUDE.md)**: **none of the kernel nodes is touched.**

- `createServer`: unchanged. write_note's `stat` comes from its own `DEFAULT_FS`, so there is no new injection.
- `createLogger` and `createQueue`: unchanged; no edge is added or removed.
- `UpstreamError`: no new construction site. write_note reuses `mapFsError`, and the patch tools' sites are untouched. `src/errors.ts` is unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/075-unify-size-reporting/
├── plan.md                              # This file
├── research.md                          # F1–F7, D1–D8
├── data-model.md                        # before/after sources per tool, invariants R1–R6, write_note sequence
├── quickstart.md                        # automated gate, baseline diff, optional live check
├── contracts/
│   └── bytes-written-contract.md        # inputs (unchanged), output schemas, examples, description, errors, baseline
├── checklists/requirements.md
└── tasks.md                             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
src/tools/_shared.ts                       # + BYTES_WRITTEN_DESCRIPTION
src/tools/append_note/schema.ts            # bytes_written .describe(...) (bound unchanged)
src/tools/prepend/schema.ts                # bytes_written .describe(...) (bound unchanged)
src/tools/patch_heading/schema.ts          # bytes_written: int, no min(0), described
src/tools/patch_heading/handler.ts         # bytes_written = byteLength(edited) − byteLength(original)
src/tools/patch_block/schema.ts            # bytes_written: int, no min(0), described
src/tools/patch_block/handler.ts           # bytes_written = byteLength(edited) − byteLength(original)
src/tools/write_note/schema.ts             # output + bytes_written (strict), described
src/tools/write_note/handler.ts            # ExecuteFs.stat; realpath probe → stat; result + bytes_written
src/tools/write_note/_handler-fixtures.ts  # fakeFs.stat (default ENOENT)
src/tools/{patch_heading,patch_block,write_note}/{handler,schema,index}.test.ts   # new and updated cases
src/tools/{append_note,prepend}/{schema,index}.test.ts                            # description assertion, uniform check
src/tools/_register-baseline.json          # regenerated (five outputSchema fingerprints)
docs/tools/{append_note,prepend,patch_heading,patch_block,write_note}.md
docs/tools/index.md
CHANGELOG.md                               # [Unreleased] Changed + Added

# UNCHANGED: src/server.ts, src/errors.ts, src/cli-adapter/**, src/vault-registry/**,
#   src/tools/_register.ts, src/tools/_note-io.ts, src/tools/_fs-errors.ts,
#   append_note/handler.ts, prepend/handler.ts, every *index.ts description,
#   set_property / find_and_replace / create_base (spec Out of Scope)
```

**Structure Decision**: Single project. The change sits in the five tool modules plus one shared string in `_shared.ts`.

**Docs-as-code**: the `.docs-as-code/` pages that describe these tools are updated by `/speckit-docs-as-code <n>` after review, per the PR lifecycle in CLAUDE.md.

## Phase 0: Research → research.md

- **F1**: per-tool computation today.
- **F2**: output schemas and the `min(0)` floor.
- **F3**: write_note's realpath probe and the `wx` branch.
- **F4**: descriptions and docs.
- **F5**: tests that pin the figure or shape.
- **F6**: fingerprint baseline.
- **F7**: unit of measure, including byte-order-mark handling.
- **D1 to D8**: as summarised above.

**Output**: research.md, with no `NEEDS CLARIFICATION` remaining.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)**: values, the per-tool sources, invariants R1 to R6 and the write_note sequence.
- **[contracts/bytes-written-contract.md](contracts/bytes-written-contract.md)**: §1 inputs; §2 schemas; §3 the examples table; §4 the description text; §5 errors; §6 the baseline.
- **[quickstart.md](quickstart.md)**: the automated gate, the baseline diff and the optional live check under `.memory/test-execution-instructions.md`.
- **Agent context**: the `CLAUDE.md` plan pointer now points at this plan.

## Phase 1 re-check (post-design Constitution Check)

Re-evaluated against the data model and the contract:

- **I**: five tool modules plus one shared string; every import runs downward.
- **II**: every contract §3 row and the §5 failure have a co-located test, and so does the uniform check.
- **III**: the zod output schemas stay the source of the published shape.
- **IV**: no new code; R4 forbids a figure without a measurement.
- **V**: headers kept, and the intent lines updated.
- **MCP Tool Surface Standards**: only five `outputSchemaFingerprint`s move.
- **Security Defaults**: containment runs before the probe, as before.

**No gate regressed; Complexity Tracking is empty.**

### CodeGraph structural check

Run with `codegraph_explore` at plan time (HEAD `a45d8b8`).

**Affected symbols and blast radius**:

- `executeWriteNote` (`src/tools/write_note/handler.ts:99`): called only by `createWriteNoteTool`'s handler wrapper in `write_note/index.ts`. Tests: `write_note/handler.test.ts` and `handler.file-type.test.ts`. It is driven by `_typed-result-fixtures.ts` (write_note entry) through `_surface.test.ts`, which parses the result against the published output schema.
- `writeNoteOutputSchema` / `WriteNoteOutput` (`write_note/schema.ts:58`, `:65`): used by `write_note/handler.ts` and `index.ts`. Also tested via `_file-type-support.test.ts`.
- write_note's `ExecuteFs` (`handler.ts:23`): implemented by `DEFAULT_FS`, by `write_note/_handler-fixtures.ts` `fakeFs`, and by the per-test overrides in `handler.test.ts`. Adding `stat` is a required member, so every literal implementation must supply it, and the typecheck enforces that.
- `executePatchHeading` (`patch_heading/handler.ts:94`) and `executePatchBlock` (`patch_block/handler.ts:89`): called only from their own `index.ts`. Tests: their own `handler.test.ts` and `index.test.ts`, plus the typed-result fixtures.
- `patchHeadingOutputSchema` (`schema.ts:122`) and `patchBlockOutputSchema` (`schema.ts:96`): used by their own handler and index only.
- `appendNoteOutputSchema` and `prependOutputSchema`: description added only; their handlers are not edited.
- `_shared.ts`: imported by many tool modules (for `composeEvalCode`, `closedVaultNote` and the shared types). The new export is purely additive.
- `mapFsError` (`write_note/handler.ts:76`): reused, not edited.
- `getErrno` (`_fs-errors.ts:5`): reused, not edited.

**Kernel-node touch surface**: none.

- `createServer`, `createLogger` and `createQueue`: not touched; no edge added or removed.
- `UpstreamError`: no new construction site; `src/errors.ts` unchanged.

**High-blast-radius surface**: none. The widest touch is the additive export on `_shared.ts`.

**Post-implement structural verification** (after `codegraph sync`):

1. No new error class or code. `src/errors.ts` is unchanged, and write_note's new failure point goes through `mapFsError` → `FS_WRITE_FAILED`.
2. No handler imports `createLogger` / `createQueue`, and `server.ts` is unchanged.
3. The five `schema.ts` files import `BYTES_WRITTEN_DESCRIPTION` from `../_shared.js`. There is no tool→tool import and no upward import.
4. `BYTES_WRITTEN_DESCRIPTION` is reachable, used by all five published output schemas. write_note's `stat` path is reachable from `createWriteNoteTool` → `createServer`.

## Follow-ups (out of scope)

- **Gitignored architecture note**: `.architecture/Obsidian CLI - Upstream Issues and Limitations.md:144` tells readers to trust `bytes_written` from append_note, patch_heading and patch_block "for byte-exact size". Under the new meaning that advice no longer gives the note's total size. Update it in the vault sync that records the D8 ADR.
- **Other cohorts**: `set_property`, `find_and_replace` and `create_base` report no size (clarification Q1). Each would be a separate item.

## Complexity Tracking

> No Constitution Check violations; the table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
