# Implementation Plan: Clarify heading-path rules

**Branch**: `079-clarify-heading-paths` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/079-clarify-heading-paths/spec.md`

> **This change rewords the published documentation of two existing typed tools, `read_heading` and `patch_heading`.** It changes their tool descriptions, their heading parameter descriptions and their help pages. It adds no tool, parameter, output field, error code, `details.code`, sub-reason or dependency, and it leaves every runtime message and all matching logic byte-identical (spec Clarifications). Both tools' description and schema fingerprints move.

## Summary

Both tools resolve a heading path from the note's level-1 heading, one level per segment (research F1). Their published text says only "at least two segments", and `patch_heading` adds "top-level headings are out of scope", which agents read as "leave the level-1 heading out". This BI states the rule, the unreachable sections and the most common cause of heading-not-found in the same terms in both tools, and adds the worked examples the spec asks for.

**Technical approach** ([research.md](research.md)):

- **D1**: the same five load-bearing phrases (contract §1) are written once per tool, in `READ_HEADING_DESCRIPTION`, `PATCH_HEADING_DESCRIPTION` and both heading parameter `.describe()` strings. There is no shared helper.
- **D2**: heading-not-found guidance names "leaves out the level-1 heading or skips a level" before `outline`.
- **D3**: runtime text is untouched: both validation messages, both heading-not-found messages, all codes and all `details` (contract §4).
- **D4**: the stale `read_note` in the rewritten `read_heading` sentence becomes `read`, and the impossible "wrap the top-level heading in a parent" advice is removed.
- **D5**: tests. Description, parameter-description and help-page assertions go in both `index.test.ts` files; three characterisation cases in `heading-walk.test.ts` pin the documented rule for `patch_heading`; a live check pins it for `read_heading`.
- **D6**: a CHANGELOG entry and a baseline regeneration.

The exact target text is in [contracts/heading-path-wording-contract.md](contracts/heading-path-wording-contract.md).

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. Unchanged.
**Primary Dependencies**: `@modelcontextprotocol/server` (SDK v2), `zod` 4. **No new dependency.**
**Storage**: none touched.
**Testing**: `vitest run`, co-located `*.test.ts`. Docs assertions read `docs/tools/*.md` via `import.meta.url`, following the existing `read_heading/index.test.ts:96` pattern.
**Target Platform**: Windows, macOS and Linux; CI on Linux and Windows.
**Project Type**: single project, an MCP server (`src/**`).
**Performance Goals**: N/A (text only). The descriptions grow by roughly 600 characters each, which is acceptable for a tool description.

**Constraints**:

- runtime messages, error codes, `details` and matching logic are byte-identical (FR-006, FR-012; contract §4);
- the existing assertions `read_heading/index.test.ts:43` (`/heading.*path|::|two.*segment/i`) and `:118` (`/single-?segment|setext|::.*literally/i`) keep passing;
- no edit to `handler.ts`, `_template.ts`, `heading-walk.ts`, `body-edit.ts`, `src/tools/_register.ts`, `src/tools/_shared.ts`, `src/errors.ts`, `src/server.ts` or any other tool module.

**Scale/Scope**:

- **Code (text only)**: `src/tools/read_heading/index.ts`, `src/tools/read_heading/schema.ts` (the `heading` `.describe` only), `src/tools/patch_heading/index.ts`, `src/tools/patch_heading/schema.ts` (the `heading_path` `.describe` only).
- **Tests**: `src/tools/read_heading/index.test.ts`, `src/tools/patch_heading/index.test.ts`, `src/tools/patch_heading/heading-walk.test.ts` (cases added).
- **Baseline**: `src/tools/_register-baseline.json` (two entries).
- **Docs**: `docs/tools/read_heading.md`, `docs/tools/patch_heading.md`, `CHANGELOG.md`.

**Resolved unknowns**: all. The behaviour was read from code (research F1) and the scope was fixed by the owner (spec Clarifications).

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | Edits stay inside each tool's own `index.ts` / `schema.ts`. No new import, no shared helper, no tool→tool edge (research D1). |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | Both modified tools get co-located assertions in the same change. Happy path: the rule and the three-segment example are present, and `walkHeadings` resolves a full path. Failure/boundary: the forbidden wording is absent, heading-not-found guidance comes in the right order, and `walkHeadings` returns `null` for the missing-level-1, skipped-level and no-level-1 cases. |
| **III. Boundary Input Validation with Zod** | **Y** | The schemas stay the source of the published shape. Only `.describe()` text changes; validation logic and `z.infer` types are unchanged. |
| **IV. Explicit Upstream Error Propagation** | **Y** | No error path changes. `UpstreamError` construction, codes and `details` are byte-identical (contract §4). |
| **V. Attribution & Layered Composition** | **Y** | No new source file. The existing `// Original — no upstream.` headers stay accurate: `schema.ts` headers describe the "2-segment minimum" validator, which is unchanged. |
| **ADR-009** (direct filesystem path) | **N/A** | patch_heading's write path is untouched. |
| **ADR-010 / ADR-013 / ADR-014** | **N/A** | No tool added or renamed; no plugin-backed tool touched. |
| **ADR-015** (sub-discriminators) | **N/A** | No sub-reason added or changed; `INVALID_HEADING_PATH`'s closed set is unchanged. |
| **ADR-040** (published parameter descriptions) | **Y** | `heading` and `heading_path` stay described; their descriptions now state the rule. |
| **MCP Tool Surface Standards** | **Y** | Title, annotations and output schema are unchanged. The input rule ("level-1 heading first, one level per segment") is visible in the parameter descriptions. The schema dialect is SDK-emitted. The fingerprint baseline is regenerated in this PR as the deliberate-change gate. |
| **Security Defaults** | **N/A** | No escape hatch, filter, confirmation flow or write-path containment changes. |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**Kernel-node attention (per CLAUDE.md)**: none touched (see *CodeGraph structural check*).

## Project Structure

### Documentation (this feature)

```text
specs/079-clarify-heading-paths/
├── plan.md                                     # This file
├── research.md                                 # F1–F4 findings, D1–D6 decisions
├── data-model.md                               # path rule R1–R4, unreachable cases U1–U5, invariants I1–I5
├── quickstart.md                               # automated gate, baseline diff, live check
├── contracts/
│   └── heading-path-wording-contract.md        # §1 phrases, §2 descriptions, §3 help pages, §4 frozen runtime text, §5 surface
├── checklists/requirements.md
└── tasks.md                                    # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
src/tools/read_heading/index.ts                 # READ_HEADING_DESCRIPTION: rule, unreachable list, cause; read_note → read
src/tools/read_heading/schema.ts                # heading .describe() only
src/tools/read_heading/index.test.ts            # description, parameter description and help-page assertions
src/tools/patch_heading/index.ts                # PATCH_HEADING_DESCRIPTION: locator paragraph + HEADING_NOT_FOUND entry
src/tools/patch_heading/schema.ts               # heading_path .describe() only
src/tools/patch_heading/index.test.ts           # description, parameter description and help-page assertions
src/tools/patch_heading/heading-walk.test.ts    # characterisation: missing level-1, skipped level, no level-1, skip below, second H1
src/tools/_register-baseline.json               # read_heading + patch_heading description/schema fingerprints
docs/tools/read_heading.md                      # Heading-path rule, unreachable list, error row, new failing-path example
docs/tools/patch_heading.md                     # routing row, field row, locator section, error row, new failing-path example
CHANGELOG.md                                    # [Unreleased] Changed

# UNCHANGED: read_heading/{handler,_template}.ts, patch_heading/{handler,heading-walk,body-edit,_handler-fixtures}.ts,
#   both validation messages in schema.ts, src/tools/_register.ts, src/tools/_shared.ts,
#   src/errors.ts, src/server.ts, outline and every other tool module
```

**Structure Decision**: single project. The change sits in the two tool modules' published text, their tests, their baseline entries and their help pages.

**Docs-as-code**: `.docs-as-code/capabilities/read.md` (which says `read_heading` "needs at least two path segments") and any page describing `patch_heading` are updated by `/speckit-docs-as-code <n>` after review, per the PR lifecycle in CLAUDE.md.

## Phase 0: Research → research.md

- **F1**: both tools' resolution rule, read from `walkHeadings` and the `read_heading` eval template.
- **F2**: every location of the misleading wording, classified as published or runtime.
- **F3**: existing tests that pin the current wording and how the rewording affects them.
- **F4**: the fingerprint gate.
- **D1 to D6**: as summarised above.

**Output**: research.md, with no `NEEDS CLARIFICATION` remaining.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)**: the path rule (R1–R4), the unreachable cases (U1–U5), the recovery-guidance order, and invariants I1–I5.
- **[contracts/heading-path-wording-contract.md](contracts/heading-path-wording-contract.md)**: load-bearing and forbidden phrases, target description text, help-page requirements, frozen runtime text, published-surface delta.
- **[quickstart.md](quickstart.md)**: the automated gate, the baseline diff (two tools only), and the live check under `.memory/test-execution-instructions.md`.
- **Agent context**: the `CLAUDE.md` plan pointer now points at this plan.

## Phase 1 re-check (post-design Constitution Check)

- **I**: two tool modules, each edited in place; no new import.
- **II**: every contract requirement (§1–§3) and invariant I1–I4 maps to a co-located assertion; I5 is held by the existing schema and handler tests.
- **III / IV**: schemas and error paths unchanged apart from `.describe()` text.
- **MCP Tool Surface Standards**: the baseline is regenerated deliberately, and only the two tools' description and schema fingerprints move.

**No gate regressed; Complexity Tracking is empty.**

### Spec alignment note

- **SC-001, SC-003, SC-004** were reworded at analyze time as reviewer-judged checks of the published text (no agent trials). The tests assert their mechanical parts (phrases present and correctly ordered); a reviewer check task in tasks.md covers the judgement and records it in the PR description.
- **Help-page quote of the frozen message**: the patch_heading page may carry "top-level headings are out of scope" only inside the verbatim §4 validation message, followed at once by a note that it means addressing the level-1 heading on its own and that every path starts at the level-1 heading (contract §1 exception, §3 H2; analyze finding I1).
- **FR-011**: the search in research F2 found no occurrence outside the two tools and `.docs-as-code/` (handled in the docs pass).
- **FR-013**: met by the `index.test.ts` assertions (D5).

### CodeGraph structural check

Run with `codegraph_explore` at plan time (HEAD `93c6b9a`).

**Affected symbols and blast radius**:

- `READ_HEADING_DESCRIPTION` (`src/tools/read_heading/index.ts:9`): read by `createReadHeadingTool` and `read_heading/index.test.ts`. Text-only change.
- `readHeadingInputSchema` (`src/tools/read_heading/schema.ts:19`): consumed by `createReadHeadingTool`; tested by `schema.test.ts`. Only the `heading` `.describe()` changes; `validateHeadingPath` (`:8`) is untouched.
- `PATCH_HEADING_DESCRIPTION` (`src/tools/patch_heading/index.ts:9`): read by `createPatchHeadingTool` and `patch_heading/index.test.ts`. Text-only change.
- `patchHeadingInputSchema` (`src/tools/patch_heading/schema.ts:92`): consumed by `createPatchHeadingTool` and `PatchHeadingInput`; tested by `schema.test.ts`. Only the `heading_path` `.describe()` changes; `headingPathField` (`:23`) and its messages are untouched.
- `walkHeadings` (`src/tools/patch_heading/heading-walk.ts:92`): read, not edited. New characterisation cases in `heading-walk.test.ts` pin its rank-by-depth rule (`:127`).
- The `read_heading` eval template `JS_TEMPLATE` (`src/tools/read_heading/_template.ts:4`): read, not edited. Its level-indexed `stack` match (`:24–37`) is the rule being documented.
- `createReadHeadingTool` / `createPatchHeadingTool`: called by `src/server.ts` and `src/tools/_typed-result-fixtures.ts`. Neither depends on description text.

**Kernel-node touch surface**: none. `createServer`, `createLogger`, `createQueue` and `UpstreamError` are not touched. The `UpstreamError` constructions in both handlers stay byte-identical.

**High-blast-radius surface**: none edited (`registerTool` and `_shared.ts` are read only).

**Post-implement structural verification** (after `codegraph sync`):

1. No new error class or code: `src/errors.ts` and both handlers are unchanged.
2. No handler imports `createLogger` / `createQueue`; `server.ts` is unchanged.
3. No new symbol or import: the diff in `src/**` (non-test) is limited to string literals in the two `index.ts` and two `schema.ts` files.
4. Nothing orphaned: no symbol is added or removed.

## Follow-ups (out of scope)

- **Same separator for both tools**: tracked separately (spec Out of Scope).
- **Runtime hint in the heading-not-found message**: declined for this BI (spec Clarifications). If it is wanted later, it is a runtime change with its own BI.
- **Reaching unreachable sections** (no level-1 heading, skipped levels): a behaviour change, out of scope.

## Complexity Tracking

> No Constitution Check violations; the table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
