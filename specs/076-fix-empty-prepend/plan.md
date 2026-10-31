# Implementation Plan: Fix Empty-Note Insertion

**Branch**: `076-fix-empty-prepend` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/076-fix-empty-prepend/spec.md`

> **This change modifies one existing typed tool, `prepend`.** It adds no tool, input parameter, output field, top-level error code or dependency. It adds one pure helper, one `FS_WRITE_FAILED` `details.reason` value (clarification Q1), and documentation.

## Summary

When `prepend` writes to an empty note, or to a note that has a properties block and no body, Obsidian's own `prepend` adds one LF after the content. The note then ends with an extra line break, and `bytes_written` counts it. The T0 probe in research F2 confirms both cases and shows that `inline: true` is already correct.

**Technical approach** ([research.md](research.md)):

- **D1**: keep Obsidian's write, then remove the one byte it adds, only when the note had no body. The handler reads the note before the call. After the call, if the note grew by exactly `byteLength(content) + 1`, it reads the note again and checks whether Obsidian appended `content + "\n"` at the very end. If so, it rewrites the note as `before + content` through the cohort's `writeAtomic`. The wrapper never detects a properties block, so spec 045 FR-005b still holds.
- **D2**: the predicate `landedAtEmptyBody` refuses the one input shape that bytes alone cannot distinguish from an insertion higher up: a note ending with the primitive root of `content + "\n"`. The refusal protects notes that have content (FR-006). Its cost is a documented limitation for pathological content on properties-only notes, such as `"---"`.
- **D3**: if the rewrite fails, or the read-back fails on a note that was empty, the call fails with `FS_WRITE_FAILED` and `details.reason: "extra-trailing-newline"`. If the read-back fails on a non-empty note, which might be properties-only, the call fails with `FS_WRITE_FAILED` `{ errno, syscall: "open", path }`, no `reason`, and says the content landed and must not be re-sent (analyze I1). A non-ENOENT failure of the pre-call read fails the same way before Obsidian is called (analyze C1). If someone else edited the note in between, the wrapper writes nothing and reports the measured size change (last-write-wins).
- **D4**: when the correction runs, `bytes_written` drops by exactly 1, so it equals `byteLength(content)`.
- **D5**: the corrective write refreshes the metadata cache, as every direct-write cohort member does.
- **D6**: placement of the new code; see Project Structure below.
- **D7**: documentation.
- **D8**: live verification.

The published surface is in [contracts/prepend-empty-body-contract.md](contracts/prepend-empty-body-contract.md).

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. Unchanged.
**Primary Dependencies**: `@modelcontextprotocol/server` (SDK v2), `zod` 4, `node:fs/promises` and `node:crypto` (`randomUUID`, as in `append_note`). **No new dependency.**
**Storage**: the vault's files on disk.
**Testing**: `vitest run`, with co-located `*.test.ts` files. The pure helper is tested directly. Handler tests use prepend's `_handler-fixtures.ts` `fakeFs`, which gains `readFile`, `writeFile`, `rename` and `unlink`. Their defaults leave existing tests unchanged.
**Target Platform**: Windows, macOS and Linux; CI runs on Linux and Windows.
**Project Type**: single project, an MCP server (`src/**`).
**Performance Goals**: one extra `readFile` before the call. Inline calls skip the read-back; every default-mode call reads the note once more (Obsidian always adds one LF, so the `content + 1` size pre-filter matches every successful default-mode call). Only when the note had no body: one atomic write and one metadata-refresh `eval`. The predicate is linear in the length of the note plus the content.

**Constraints**:

- no new top-level error code (Principle IV);
- no input, output, description or annotation change, so no baseline movement;
- spec 045 FR-005b: no wrapper-side frontmatter parser;
- behaviour for notes with a body is unchanged (FR-006);
- no edit to `src/cli-adapter/**`, `src/errors.ts`, `src/vault-registry/**`, `src/server.ts`, `src/tools/_register.ts`, `src/tools/_note-io.ts`, `src/tools/_fs-errors.ts` or any other tool module.

**Scale/Scope**:

- **Code**: `src/tools/prepend/{handler.ts, empty-body.ts (new)}`.
- **Tests**: `src/tools/prepend/{empty-body.test.ts (new), handler.empty-body.test.ts (new), _handler-fixtures.ts}`.
- **Docs**: `docs/tools/prepend.md` and `CHANGELOG.md`.

**Resolved unknowns**: all. Research F1 to F6 and F9 are findings, D1 to D8 are decisions, and the T0 probe is F2.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | The new helper lives in the tool's own module (`prepend/empty-body.ts`), like `append_note/append-edit.ts`. `handler.ts` gains downward imports of `../_note-io.js` (`writeAtomic`, `invalidateMetadataCache`), already used by the write cohort. No tool→tool edge, no upward import, no cycle. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | Every contract §3 row has a happy-path or unchanged-path case, and all three §4 failures have failure cases. The predicate's boundaries (ambiguity, race, multi-byte, CRLF) are covered. All tests are co-located and land in the same change. |
| **III. Boundary Input Validation with Zod** | **Y** | Schemas are untouched. `PrependInput` and `PrependOutput` stay `z.infer`. |
| **IV. Explicit Upstream Error Propagation** | **Y** | The read-back and rewrite failure points throw `UpstreamError` `FS_WRITE_FAILED` with `cause`, `details.reason`, `path`, `vault` and `errno`, and are never only logged (clarification Q1). The new pre-call read wraps any non-ENOENT failure as `FS_WRITE_FAILED` `{ errno, syscall: "open", path }` before Obsidian is called (analyze C1; spec FR-009 (b)); the pre-existing raw rethrow from the pre-call `stat` is outside this BI. The metadata refresh stays best-effort and logged, per spec 068 A1, as for the whole cohort. The race case is a recorded decision (clarification Q1, last-write-wins), and its payload reports the measured size. |
| **V. Attribution & Layered Composition** | **Y** | The new `empty-body.ts` and its test carry `Original — no upstream.` headers. The intent lines of `handler.ts` (it no longer does "no fs read/write") and `_handler-fixtures.ts` are updated. |
| **ADR-009** (direct filesystem path) | **Y** | The corrective write reuses the ADR-009 substrate (`writeAtomic` on the canonicalised `absPath`) and the §5 metadata refresh. Obsidian still owns the main write; the wrapper only takes back the one byte it added. |
| **ADR-010 / ADR-013 / ADR-014** | **N/A** | No tool renamed or added, and no plugin-backed tool touched. |
| **ADR-015** (sub-discriminators) | **Y** | One new `details.reason`, `extra-trailing-newline`, under the existing `FS_WRITE_FAILED`. |
| **ADR-040** (published parameter descriptions) | **Y** | No input change. |
| **MCP Tool Surface Standards** | **Y** | Title, annotations (`ADDITIVE_WRITE_HINTS`), schemas and description are unchanged, so no fingerprint moves. The typed result keeps `structuredContent` with identical text. |
| **Security Defaults** | **Y** | The write goes only to `absPath`, which `assertCanonicalPath` has already contained in the vault. The pre-read happens after containment. No escape hatch, read-only mode or list is changed. Prepend's annotations remain additive (non-destructive): the rewrite removes only the byte the same call added. |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**Kernel-node attention (per CLAUDE.md)**:

- `UpstreamError` gets **new construction sites** in `prepend/handler.ts` only (the pre-read `FS_WRITE_FAILED`, the `extra-trailing-newline` throw and the unverified read-back `FS_WRITE_FAILED`). `src/errors.ts` is unchanged and no code is added. This is the only kernel-node touch; reviewers should check each throw's `code`, `cause` and `details`.
- `createServer`, `createLogger` and `createQueue` are not touched. The new eval reuses the `logger` and `queue` already injected into prepend's `ExecuteDeps`.

## Project Structure

### Documentation (this feature)

```text
specs/076-fix-empty-prepend/
├── plan.md                                  # This file
├── research.md                              # F1–F6, F9 findings (F2 = T0 probe), D1–D8 decisions
├── data-model.md                            # values, predicate, sequence, invariants R1–R7
├── quickstart.md                            # automated gate, baseline no-diff, live check
├── contracts/
│   └── prepend-empty-body-contract.md       # §1 inputs, §2 output, §3 examples E1–E12, §4 errors, §5 surface
├── checklists/requirements.md
└── tasks.md                                 # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
src/tools/prepend/empty-body.ts                 # NEW: landedAtEmptyBody(before, content, after) pure predicate
src/tools/prepend/empty-body.test.ts            # NEW: predicate cases
src/tools/prepend/handler.ts                    # ExecuteFs + readFile/writeFile/rename/unlink; pre-read; correction step
src/tools/prepend/_handler-fixtures.ts          # fakeFs: contents sequence for readFile, recorded writes
src/tools/prepend/handler.empty-body.test.ts    # NEW: handler cohort for contract §3 and §4, mirror check
docs/tools/prepend.md                           # bytes_written sentence, properties-only example, error row, limitation
CHANGELOG.md                                    # [Unreleased] Fixed

# UNCHANGED: src/tools/prepend/{schema,index}.ts, src/tools/_register-baseline.json,
#   src/server.ts, src/errors.ts, src/cli-adapter/**, src/vault-registry/**,
#   src/tools/_register.ts, src/tools/_note-io.ts, src/tools/_fs-errors.ts,
#   every other tool module (append_note, patch_heading, patch_block: spec Out of Scope)
```

**Structure Decision**: single project. The change sits entirely in the `prepend` tool module, reusing the shared `_note-io` substrate.

**Docs-as-code**: the `.docs-as-code/` pages that describe `prepend` are updated by `/speckit-docs-as-code <n>` after review, per the PR lifecycle in CLAUDE.md.

## Phase 0: Research → research.md

- **F1**: prepend's current pipeline and the spec 045 FR-005b constraint.
- **F2**: T0 live probe of Obsidian's `prepend` on 17 cases.
- **F3**: documentation drift for notes with content (out of scope; see Follow-ups).
- **F4**: the reusable substrate.
- **F5**: tests and fixtures.
- **F6**: published surface.
- **F9**: the probe-harness note.
- **D1 to D8**: as summarised above.

**Output**: research.md, with no `NEEDS CLARIFICATION` remaining.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)**: the four values, the predicate, the changed sequence and invariants R1 to R7.
- **[contracts/prepend-empty-body-contract.md](contracts/prepend-empty-body-contract.md)**: examples E1 to E12 with today's and the new results, the new error row, and the unchanged surface.
- **[quickstart.md](quickstart.md)**: the automated gate, the baseline no-diff check, and the live check under `.memory/test-execution-instructions.md`.
- **Agent context**: the `CLAUDE.md` plan pointer now points at this plan.

## Phase 1 re-check (post-design Constitution Check)

Re-evaluated against the data model and the contract:

- **I**: one tool module plus downward imports of the shared substrate.
- **II**: each contract §3 row and all three §4 failures map to a co-located test.
- **III**: the schemas are untouched.
- **IV**: R6 forbids a logged-only failure; no new code.
- **V**: headers on the new files, and the intent lines updated.
- **MCP Tool Surface Standards**: no fingerprint moves.
- **Security Defaults**: the write is contained and removes only the byte the same call added.

**No gate regressed; Complexity Tracking is empty.**

### Spec alignment note

Research D2 leaves one narrow input class uncorrected. On a properties-only note, if `content + "\n"` is a repetition of a tail of the note (for example `content` of `"-"`, `"--"`, `"---"` or only line breaks), the bytes are identical to an insertion into a note that has a body. Correcting would risk changing a note with content (FR-006), so the wrapper keeps Obsidian's result. `bytes_written` still reports the true size change. The spec's Edge Cases list records this exception, and `docs/tools/prepend.md` documents it.

### CodeGraph structural check

Run with `codegraph_explore` at plan time (HEAD `1f7ac44`).

**Affected symbols and blast radius**:

- `executePrepend` (`src/tools/prepend/handler.ts:127`): registered by `createPrependTool` (`prepend/index.ts:69`) as the handler. Tests: `prepend/handler.test.ts`, `handler.bi047.test.ts` and `handler.file-type.test.ts`. Also driven through `_typed-result-fixtures.ts` (prepend entry) by the surface tests, which parse the result against `prependOutputSchema`.
- prepend's `ExecuteFs` (`handler.ts:16`): implemented by `DEFAULT_FS`, by `_handler-fixtures.ts` `fakeFs`, and by per-test `over` overrides that merge onto `fakeFs`'s base. New required members get defaults in the base, and the typecheck enforces completeness. `fakeFs` is also imported by `_typed-result-fixtures.ts` (`sizes: [100, 158]`, delta ≠ content + 1, so the predicate is never consulted there).
- `writeAtomic`, `invalidateMetadataCache` (`src/tools/_note-io.ts:31`, `:100`): reused, not edited. Already called by `append_note`, `write_note`, `patch_heading`, `patch_block` and `find_and_replace`. prepend becomes one more caller.
- `EvalDeps` (`src/tools/_active-file.ts:39`): prepend's `ExecuteDeps` already satisfies it, so no edit.
- `getErrno` (`src/tools/_fs-errors.ts`): already imported by prepend; reused.
- `prependInputSchema`, `prependOutputSchema` and `PREPEND_DESCRIPTION`: not edited.

**Kernel-node touch surface**: `UpstreamError` only, with new construction sites in `prepend/handler.ts`. `createServer`, `createLogger` and `createQueue` are not touched.

**High-blast-radius surface**: none edited. The shared `_note-io` substrate gains a caller, not a change.

**Post-implement structural verification** (after `codegraph sync`):

1. No new error class or code. `src/errors.ts` is unchanged, and the new throw uses `FS_WRITE_FAILED`.
2. No handler imports `createLogger` / `createQueue`, and `server.ts` is unchanged.
3. `empty-body.ts` is imported only by `prepend/handler.ts` and its test. `handler.ts`'s new import is `../_note-io.js` (downward). No tool→tool import.
4. `landedAtEmptyBody` is reachable from `createPrependTool` → `createServer` through `executePrepend`.

## Follow-ups (out of scope)

- **Separator drift for notes with content** (research F3): `docs/tools/prepend.md` says a content's trailing `\n` is the separator and that the separator matches the note's line endings. Obsidian inserts an extra LF in both cases (`"abc"` + `"def\n"` → `"def\n\nabc"`; `"abc\r\n"` + `"def"` → `"def\nabc\r\n"`). Either the docs or the behaviour need a separate item, since the spec puts separator behaviour for notes with content out of scope.
- **Gitignored architecture note**: if `.architecture/` lists the prepend empty-note trailing newline as an upstream limitation, update it in the next vault sync.

## Complexity Tracking

> No Constitution Check violations; the table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
