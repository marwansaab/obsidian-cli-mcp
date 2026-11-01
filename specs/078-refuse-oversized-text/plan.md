# Implementation Plan: Refuse Oversized Text on Add-to-Top

**Branch**: `078-refuse-oversized-text` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/078-refuse-oversized-text/spec.md`

> **This change modifies one existing typed tool, `prepend`.** It adds an input rule (a 3,072-byte UTF-8 limit on `content`) and one `details.reason` value (`"bytes"`) under the existing `(VALIDATION_ERROR, CONTENT_TOO_LARGE)` pair. It adds no tool, parameter, output field, top-level error code, `details.code` or dependency. The published `content` description and tool description change, so prepend's baseline fingerprints move.

## Summary

`prepend` limits `content` to 3,072 characters, but the Obsidian CLI fault the limit protects against depends on the content's UTF-8 size (research F2). Non-Latin text within the character limit can reach the fault, crash Obsidian and interrupt the user. This BI adds a second limit of 3,072 UTF-8 bytes (spec Clarifications), checked during input validation next to the character limit.

**Technical approach** ([research.md](research.md)):

- **D1**: `schema.ts` exports `MAX_CONTENT_BYTES = 3072`. `content` gains a `.refine()` that measures `Buffer.byteLength(content, "utf8")` and raises a `custom` issue with `params: { subReason: "bytes" }`. The check runs in `registerTool`'s input-validation step, so the handler, the filesystem and Obsidian are never reached.
- **D2**: `mapZodIssuesToToolError` keeps the character-limit error first and byte-identical. It then maps the byte issue to `VALIDATION_ERROR` with `details: { code: "CONTENT_TOO_LARGE", reason: "bytes", contentBytes, maxBytes }` (ADR-015, owner's plan-time choice).
- **D3**: the `content` description and `PREPEND_DESCRIPTION` state both limits by interpolating the constants (FR-008, FR-009). The baseline is regenerated.
- **D4**: tests. A new `index.byte-cap.test.ts` covers contract B1–B16. `schema.test.ts` has one test rewritten plus boundary cases, and `index.test.ts` gets description assertions.
- **D5**: docs. `docs/tools/prepend.md` gets the closed `reason` set and the *Size ceiling* rewrite; `docs/tools/index.md`, `CHANGELOG.md` and the header intent lines are updated too.
- **D6**: live check in the test vault (quickstart §3).

The published behaviour is in [contracts/prepend-size-limit-contract.md](contracts/prepend-size-limit-contract.md).

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. Unchanged.
**Primary Dependencies**: `@modelcontextprotocol/server` (SDK v2), `zod` 4 (4.4.3; `.refine` behaviour probed, research F3), `node:buffer` (global `Buffer`). **No new dependency.**
**Storage**: none touched; a refused call never reaches the vault.
**Testing**: `vitest run`, co-located `*.test.ts`. The new `index.byte-cap.test.ts` drives `createPrependTool(...).handler`, extending the registry-stub pattern of `handler.test.ts:507` with a spawn spy and `fakeFs` call records.
**Target Platform**: Windows, macOS and Linux; CI on Linux and Windows. The fault is Windows-observed, but the limit applies on every platform (one published contract).
**Project Type**: single project, an MCP server (`src/**`).
**Performance Goals**: one `Buffer.byteLength` over ≤ 3,072 code units per call (microseconds). A refusal costs no CLI round-trip (spec SC-003: under 1 s).

**Constraints**:

- the character-limit error stays byte-identical (FR-005);
- no new top-level error code or `details.code` (Principle IV); one new `details.reason` value (ADR-015);
- `inputSchema.properties.content.maxLength` stays 3072;
- no edit to `src/tools/prepend/handler.ts`, `src/tools/_register.ts`, `src/tools/_shared.ts`, `src/errors.ts`, `src/cli-adapter/**`, `src/server.ts` or any other tool module.

**Scale/Scope**:

- **Code**: `src/tools/prepend/schema.ts`, `src/tools/prepend/index.ts`.
- **Tests**: `src/tools/prepend/index.byte-cap.test.ts` (new); `src/tools/prepend/schema.test.ts` (one test rewritten, cases added); `src/tools/prepend/index.test.ts` (cases added).
- **Baseline**: `src/tools/_register-baseline.json` (prepend entry only).
- **Docs**: `docs/tools/prepend.md`, `docs/tools/index.md`, `CHANGELOG.md`.

**Resolved unknowns**: all. The safe size and the error shape were decided by the owner (spec Clarifications). Zod's issue behaviour was probed (research F3).

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | Changes stay in `prepend/schema.ts` and `prepend/index.ts`, following the `{schema, tool, handler}` layout. No new import other than the existing `schema.js` constant, no tool→tool edge, no cycle. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | Happy path: B7–B10, B14, B15 accepted. Failure/boundary: B1–B6, B11–B13, B16. Precedence covered by B5–B6. Tests are co-located (`index.byte-cap.test.ts` for the mapper in `index.ts`; `schema.test.ts` for the refine) and land in the same change. |
| **III. Boundary Input Validation with Zod** | **Y** | The rule is in the zod schema, the single source for the runtime parse. It runs before any business logic. `PrependInput` stays `z.infer`. JSON Schema cannot express a byte limit, so it is published in the parameter description (MCP Tool Surface Standards, visible input rules). |
| **IV. Explicit Upstream Error Propagation** | **Y** | The refusal is a structured `VALIDATION_ERROR` with `code` and `details`, returned as `isError: true` through `registerTool`. No new top-level code or `details.code`. The error replaces a downstream crash with an up-front, typed failure. |
| **V. Attribution & Layered Composition** | **Y** | The new test file carries `// Original — no upstream.`. The intent headers of `schema.ts` (also correcting its stale "24576") and `index.ts` are updated to name the byte limit and `reason: "bytes"`. |
| **ADR-009** (direct filesystem path) | **N/A** | No filesystem path touched; prepend's write path is unchanged. |
| **ADR-010 / ADR-013 / ADR-014** | **N/A** | No tool added or renamed; no plugin-backed tool touched. |
| **ADR-015** (sub-discriminators) | **Y** | `(VALIDATION_ERROR, CONTENT_TOO_LARGE)` becomes a two-sub-state pair. The origin sub-state (character limit) has no `reason`; the new sub-state is `reason: "bytes"` (kebab-case literal). The closed set is listed in `docs/tools/prepend.md` (owner's plan-time decision, spec Clarifications). |
| **ADR-040** (published parameter descriptions) | **Y** | `content` stays described; its description now states both limits. |
| **MCP Tool Surface Standards** | **Y** | Title, annotations (`ADDITIVE_WRITE_HINTS`) and output schema are unchanged. The new input rule is visible in the `content` description. The schema dialect is SDK-emitted (refine adds no keyword, research F3). The fingerprint baseline is regenerated in this PR as the deliberate-change gate. Errors stay text-only. |
| **Security Defaults** | **Y** | No escape hatch, read-only/allow/deny list or confirmation flow changes. The write path is untouched, and the limit narrows what can reach Obsidian's CLI. |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**Kernel-node attention (per CLAUDE.md)**: none touched. The new error is a `ToolErrorPayload` returned by the validation hook, as the existing character-limit error is. No `UpstreamError` is constructed. `createServer`, `createLogger` and `createQueue` are unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/078-refuse-oversized-text/
├── plan.md                                  # This file
├── research.md                              # F1–F6 findings, D1–D6 decisions
├── data-model.md                            # the two limits, invariants R1–R5
├── quickstart.md                            # automated gate, baseline diff, live check
├── contracts/
│   └── prepend-size-limit-contract.md       # §1 limits, §2 errors + closed reason set, §3 B1–B16, §4 unchanged, §5 surface
├── checklists/requirements.md
└── tasks.md                                 # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
src/tools/prepend/schema.ts                  # MAX_CONTENT_BYTES; .refine on content; content description; header
src/tools/prepend/index.ts                   # mapper: bytes branch after too_big; PREPEND_DESCRIPTION; header
src/tools/prepend/index.byte-cap.test.ts     # NEW: contract B1–B16 through the registered handler
src/tools/prepend/schema.test.ts             # rewrite emoji-at-cap test; byte-boundary cases
src/tools/prepend/index.test.ts              # description / content description name the byte limit
src/tools/_register-baseline.json            # prepend descriptionFingerprint + schemaFingerprint
docs/tools/prepend.md                        # field row, routing row, error rows + closed reason set, Size ceiling, Out of scope
docs/tools/index.md                          # prepend summary line
CHANGELOG.md                                 # [Unreleased] Changed

# UNCHANGED: src/tools/prepend/{handler,empty-body,_handler-fixtures}.ts,
#   src/tools/_register.ts, src/tools/_shared.ts, src/errors.ts, src/cli-adapter/**,
#   src/server.ts, every other tool module (create_base's own MAX_CONTENT_LENGTH included)
```

**Structure Decision**: single project. The change sits entirely in the `prepend` tool module, plus its baseline entry and docs.

**Docs-as-code**: the `.docs-as-code/` pages that describe `prepend` (`capabilities/mutate.md`, `architecture.md`) are updated by `/speckit-docs-as-code <n>` after review, per the PR lifecycle in CLAUDE.md.

## Phase 0: Research → research.md

- **F1**: the character limit, its error and where it is published.
- **F2**: why bytes, not characters (the fault, UTF-8 argv encoding, per-script sizes).
- **F3**: Zod 4 `.refine` behaviour probed at plan time (both issues on over-both; `params` carried; no JSON Schema change).
- **F4**: the one test that encodes the old behaviour.
- **F5**: published surface and baseline movement.
- **F6**: ADR-015 and the owner's error-shape decision.
- **D1 to D6**: as summarised above.

**Output**: research.md, with no `NEEDS CLARIFICATION` remaining.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)**: the two limits, their checks and errors, invariants R1 to R5.
- **[contracts/prepend-size-limit-contract.md](contracts/prepend-size-limit-contract.md)**: both error shapes, the closed `reason` set, examples B1 to B16, what stays unchanged, and the published-surface delta.
- **[quickstart.md](quickstart.md)**: the automated gate, the baseline diff (prepend only), and the live check under `.memory/test-execution-instructions.md`.
- **Agent context**: the `CLAUDE.md` plan pointer now points at this plan.

## Phase 1 re-check (post-design Constitution Check)

- **I**: one tool module; no new cross-module import.
- **II**: every contract example maps to a co-located test; the one rewritten test is the behaviour this BI changes.
- **III**: the rule lives in the schema; the published description states it.
- **IV**: structured error, no new code or `details.code`.
- **V**: header on the new test file; intent lines updated.
- **ADR-015**: closed set (absent, `"bytes"`) documented.
- **MCP Tool Surface Standards**: baseline regenerated deliberately; only prepend's entry moves.

**No gate regressed; Complexity Tracking is empty.**

### Spec alignment note

- **FR-003 wording**: amended at plan time from "a new `details.code`" to `details.reason: "bytes"` under `CONTENT_TOO_LARGE` (spec Clarifications; ADR-015). Story 3 scenario 3, the Key Entities and SC-005 are aligned.
- **SC-004** ("zero regressions in existing tests"): the one rewritten test (research F4) asserted that 6,144-byte emoji content is accepted, which is exactly the case this BI refuses. Every other existing test passes unchanged.
- **Behaviour change for callers**: non-Latin text between 3,073 bytes and the fault that sometimes succeeds today is now refused (spec Assumptions). The CHANGELOG states this under Changed.

### CodeGraph structural check

Run with `codegraph_explore` at plan time (HEAD `9b8c31c`).

**Affected symbols and blast radius**:

- `prependInputSchema` (`src/tools/prepend/schema.ts:63`): consumed by `createPrependTool` (`prepend/index.ts:69`) and `PrependInput` (`z.infer`). Tests: `schema.test.ts`. Adding a refine to `content` does not change `PrependInput`'s type.
- `MAX_CONTENT_LENGTH` (`schema.ts:35`): read, not changed. Callers are `index.ts` and the prepend tests. `create_base` has its own separate `MAX_CONTENT_LENGTH` (`src/tools/create_base/schema.ts:9`), which is not touched.
- `mapZodIssuesToToolError` (`prepend/index.ts:30`): module-private, one caller (`registerTool`'s `mapValidationError` hook via `createPrependTool`). Exercised by `handler.test.ts`, `handler.bi047.test.ts` and the new test. `find_and_replace` has its own same-named private mapper (`find_and_replace/index.ts:50`), which is not touched; its `params.subReason` convention is reused.
- `PREPEND_DESCRIPTION` (`prepend/index.ts:15`): read by `createPrependTool`, `index.test.ts` and `_file-type-support.test.ts`. The latter checks the support sentence, which is unchanged.
- `createPrependTool` (`prepend/index.ts:69`): called by `src/server.ts` and `src/tools/_typed-result-fixtures.ts`. The fixtures use short ASCII content and are unaffected.
- `registerTool` (`src/tools/_register.ts:153`): read, not edited. Its `toValidationError` (`:179`) routes all input `ZodError`s through the hook before the handler runs, which underpins invariant R3.

**Kernel-node touch surface**: none. `createServer`, `createLogger`, `createQueue` and `UpstreamError` are not touched (the new error is a `ToolErrorPayload` from the validation hook).

**High-blast-radius surface**: none edited (`registerTool` and `_shared.ts` are read only).

**Post-implement structural verification** (after `codegraph sync`):

1. No new error class or top-level code: `src/errors.ts` is unchanged, and the mapper emits `VALIDATION_ERROR` / `CONTENT_TOO_LARGE`.
2. No handler imports `createLogger` / `createQueue`; `server.ts` is unchanged.
3. `MAX_CONTENT_BYTES` is exported from `prepend/schema.ts` and imported only by `prepend/index.ts` and prepend tests. There is no tool→tool import.
4. The byte branch of `mapZodIssuesToToolError` is reachable from `createPrependTool` → `createServer`.

## Follow-ups (out of scope)

- **Other CLI-passing writers**: `create_base` (`content`, 3,072 UTF-16 code units), `set_property` values and any other capability that passes text on Obsidian's command line has the same character-vs-byte gap (spec Out of Scope; separate items).
- **Argv overhead**: `path` and `vault` are not counted against the limit. A long non-Latin path uses part of the ~1 KB headroom (spec Assumptions).

## Complexity Tracking

> No Constitution Check violations; the table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
