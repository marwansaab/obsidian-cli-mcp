# Implementation Plan: Tolerate plugin noise

**Branch**: `080-tolerate-plugin-noise` | **Date**: 2026-11-01 (revised after analyze, 2026-11-01) | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/080-tolerate-plugin-noise/spec.md`

> **This change alters how in-Obsidian query output is produced and read. It changes no published tool surface.**
>
> - **No additions to the published surface**: no tool, parameter, description text, output field, error code, `details.stage` or `details.reason`. `_register-baseline.json` does not move.
> - **Internal additions**:
>   - a per-call **answer tag** wrapped around every typed eval's code, so the capability's own answer is told apart from look-alike plugin lines in every position (owner ruling at analyze time, 2026-11-01);
>   - one optional error-`details` key, `stdoutTail`;
>   - one internal module, `src/cli-adapter/eval-output.ts`.
> - **Authority**: the eval-only dispatch change rests on **the ADR-029 amendment of 2026-11-01** (spec Clarification Q2).

## Summary

Plugins print into the stdout that `obsidian eval` returns its answer on. The ten answer readers (research F1, P1–P10) expect the `=> ` answer at the start of the output, so one plugin line before it turns a success into a parse failure. Dispatch also misses Obsidian's own `Error:` and cold-start messages once a plugin line precedes them. Position cannot tell the real answer from a plugin's look-alike `=> {…}` line (research F8).

**Technical approach** ([research.md](research.md)):

- **D1, the answer tag.** `invokeCli` wraps each typed eval's code so the printed answer starts with a per-call random tag, `obsidian-cli-mcp:<uuid>:`. Only a `=> ` line carrying that exact tag, in raw or JSON-quoted form, is the answer. Every other line is ignored wherever it sits: plugin text, look-alikes, other tags. Tagged lines that disagree give a parse failure, never a wrong result. `invokeCli` returns `evalAnswer` alongside the raw `stdout`.
- **D2, eval-only dispatch recognition.** With no tagged answer, the last `Error:` line is classified the way today's priorities (b) and (c) would classify it. `isColdStart` matches the cold-start line anywhere in eval output, and the retry stays single. Non-eval commands are byte-identical.
- **D3, `obsidian_exec`.** Untouched: no wrap, no tag, verbatim success output. Its `eval` calls inherit D2's error recognition through the untagged answer test, because ADR-029 covers both facades and the ruling scopes the change by command.
- **D4, tool readers.** Readers parse `evalAnswer` through `parseEvalAnswer`. The seven inline copies, `set_property`'s copy and the `_note-io` `=> ok` check all route through it. Codes, stages and messages are unchanged.
- **D5, `details.stdoutTail`.** Added on long, bounded parse failures.
- **D6, no new logging.**
- **D7, tests.** Look-alike `=> {…}` lines before and after the real answer are tested in every affected tool.
- **D9, test seam.** A nonce seam (`evalNonce`) plus shared fixtures.
- **D10, T0 gate.** Before any code, a live probe confirms how the CLI prints the tagged value. If no form preserves the tag, implementation stops and the question goes to the owner.

Exact behaviour is in [contracts/eval-output-contract.md](contracts/eval-output-contract.md).

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. Unchanged.

**Primary Dependencies**: `@modelcontextprotocol/server` (SDK v2), `zod` 4. `node:crypto` `randomUUID` is a built-in, so there is **no new dependency**.

**Storage**: none touched.

**Testing**: `vitest run`, co-located `*.test.ts`. Eval tests inject `evalNonce` and build stub stdout with `evalAnswerLine` (research D9).

**Target Platform**: Windows, macOS and Linux; CI on Linux and Windows. CRLF is tolerated (contract §1 A10).

**Project Type**: single project, an MCP server (`src/**`).

**Performance Goals**: no measurable cost. Each eval generates one UUID and adds one `await` in the wrapped code. The locator runs one line scan over the already-captured output, which is at most 10 MiB.

**Constraints**:

- with no plugin lines, results and errors stay unchanged apart from `stdoutTail` past 500 characters (FR-008);
- non-eval classification is byte-identical (FR-012);
- `obsidian_exec` code and success output are unchanged (research D3);
- at most one cold-start retry (FR-011);
- no new code, stage or reason (FR-013);
- no plugin-specific logic (FR-006);
- templates stay byte-identical (contract §4).

**Scale/Scope**:

- **New**: `src/cli-adapter/eval-output.ts`, `src/cli-adapter/eval-output.test.ts`.
- **Code**:
  - `src/cli-adapter/cli-adapter.ts`: wrap the code, tag the call, return `evalAnswer`, add the `evalNonce` seam;
  - `src/cli-adapter/_dispatch.ts`: `DispatchInput.evalAnswerTag`, the eval branch of priorities (b) and (c), `COLD_START_LINE_PATTERN`, `isColdStart`;
  - `src/tools/_active-file.ts`: `parseEvalAnswer`, `evalParseFailureStdout`, `decodeEvalEnvelope`, `parseFocusedVault`, `resolveActiveFocusedFile`, `evalInVault`;
  - `src/tools/_note-io.ts`;
  - the handlers of `read_heading`, `pattern_search`, `find_by_property`, `smart_connections_similar`, `smart_connections_query`, `paths`, `tag`, `set_property`, `find_and_replace`, `query_base`, `links`, `backlinks`, `open_file`, `get_active_file` and `views_base` (call-site argument changes for `decodeEvalEnvelope` / `parseFocusedVault`).
- **Tests**:
  - `src/tools/_handler-test-fixtures.ts`;
  - `cli-adapter.test.ts`, `_dispatch.test.ts`, `invoke-bounded-cli.test.ts`, `_active-file.test.ts`, `_note-io.test.ts`;
  - the co-located `handler.test.ts` (and `_handler-fixtures.ts`) of each eval tool and of the file cohort tools whose active-mode tests stub the focused-file eval;
  - `src/tools/_typed-result-fixtures.ts` (`evalOut`).
- **Docs**: `CHANGELOG.md`. The ADR-029 amendment paragraph is in `.decisions/` (gitignored, already recorded).

**Resolved unknowns**: all except one, which is resolved empirically by the T0 gate before any code: the CLI's printed form of the tagged string (research F9, D10). Both the raw and the quoted form are already handled; the gate exists to stop the work if neither appears.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | The new module lives in `src/cli-adapter/` and is imported only by `_dispatch.ts` and `cli-adapter.ts`. Tools consume `evalAnswer` from `invokeCli`'s result and import nothing new from cli-adapter, so imports keep running tools → cli-adapter. There is no tool → tool edge: handlers keep importing `../_active-file.js`. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | Every modified tool gets co-located cases in this change. **Happy path**: plugin lines before and after the answer, and look-alikes before and after. **Failure or boundary**: no answer gives a parse failure with the raw output; long output gives `stdoutTail`; a look-alike alone never gives its own result. The cli-adapter facade, dispatch and the locator get their own tests (research D7). |
| **III. Boundary Input Validation with Zod** | **Y** | Input schemas are untouched. Envelope `safeParse` steps are untouched; only the text handed to them changes. |
| **IV. Explicit Upstream Error Propagation** | **Y** | Every failure still surfaces as `UpstreamError` with its existing code and stage. Genuine errors (no answer; an Obsidian `Error:` line) reach the agent intact, and the retry stays single. Ambiguous tagged output fails loudly (contract §1 A12) instead of guessing. The one additive `details` key is not a code. |
| **V. Attribution & Layered Composition** | **Y** | The new file carries `// Original — no upstream.`. Headers that describe the old strip are corrected: `tag`'s "no LAST-`=> ` rescan", `smart_connections_query`'s R14, `_active-file.ts`'s `"=> "` strip, and `cli-adapter.ts`'s header (adds the eval tag). |
| **ADR-007** (centralised CLI bounds) | **Y** | Timeout and output-cap classification is untouched and still runs first. |
| **ADR-015** (sub-discriminators) | **Y** | No `details.reason` or `details.code` is added. |
| **ADR-029** (cold-start retry) | **Y** | Amended 2026-11-01. The retry stays in dispatch and stays single; only the signature match widens, and only for `eval` (research D2). |
| **ADR-030** (app-launch spawn site) | **N/A** | Untouched. The new module imports no spawn, and `architecture.test.ts` keeps guarding that. |
| **ADR-010 / ADR-013 / ADR-014** | **N/A** | No tool is added or renamed. Plugin-backed tools change only how their answer is read; their lifecycle stages and templates are byte-identical. |
| **MCP Tool Surface Standards** | **Y** | Titles, annotations, descriptions and schemas are unchanged, and the fingerprint baseline does not move (contract §5). |
| **Security Defaults** | **N/A** | No escape hatch is enabled and `obsidian_exec` is untouched (research D3). The wrapper adds no user input to the code: the tag is server-generated, and `JSON.stringify` quotes it. Research D6 keeps plugin output out of logs. |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**Kernel-node attention (per CLAUDE.md)**:

- `UpstreamError` construction sites gain the optional `stdoutTail` key; the class is unchanged.
- `createServer`, `createLogger` and `createQueue` are not touched.
- High-blast-radius, non-kernel surface:
  - `invokeCli`, among the most-depended-on symbols, changes for eval calls;
  - `dispatchOnce` changes for eval calls.

  See *CodeGraph structural check*.

## Project Structure

### Documentation (this feature)

```text
specs/080-tolerate-plugin-noise/
├── plan.md                              # This file
├── research.md                          # F1–F9 findings, D1–D10 decisions
├── data-model.md                        # tag E0, line kinds E1, answer E2, error E3, raw output E4, invariants I1–I7
├── quickstart.md                        # T0 gate, automated gate, unchanged-surface check, live check
├── contracts/
│   └── eval-output-contract.md          # §1 answer table A1–A15, §2 dispatch table E1–E9, §3 raw output, §4 frozen, §5 surface
├── checklists/requirements.md
└── tasks.md                             # Phase 2 — /speckit-tasks
```

### Source Code (repository root)

```text
src/cli-adapter/eval-output.ts           # NEW: evalAnswerTag, wrapEvalCode, findTaggedEvalAnswer, hasEvalAnswerLine, findReportedErrorLine
src/cli-adapter/eval-output.test.ts      # NEW: contract §1 A1–A15, wrapper text, last-Error-line selection
src/cli-adapter/cli-adapter.ts           # eval: tag + wrap + evalAnswerTag on dispatch + evalAnswer on result; evalNonce seam
src/cli-adapter/cli-adapter.test.ts      # wrap/tag/evalAnswer; non-eval untouched
src/cli-adapter/_dispatch.ts             # DispatchInput.evalAnswerTag; eval branch of (b)/(c); COLD_START_LINE_PATTERN; isColdStart
src/cli-adapter/_dispatch.test.ts        # contract §2 E1–E8, single retry, no new code
src/cli-adapter/invoke-bounded-cli.test.ts  # contract §2 E9; obsidian_exec code not wrapped
src/tools/_active-file.ts                # parseEvalAnswer; evalParseFailureStdout; decodeEvalEnvelope / parseFocusedVault take the result; evalInVault returns the result
src/tools/_active-file.test.ts
src/tools/_note-io.ts                    # evalAnswer === "ok" / "missing"
src/tools/_note-io.test.ts
src/tools/_handler-test-fixtures.ts      # TEST_EVAL_NONCE, TEST_EVAL_TAG, evalAnswerLine, wrappedEvalCode
src/tools/_typed-result-fixtures.ts      # evalOut emits a tagged line
src/tools/{read_heading,pattern_search,find_by_property,smart_connections_similar,smart_connections_query,paths,tag,set_property}/handler.ts
                                         # inline strip → parseEvalAnswer(result); stdoutTail (not find_by_property)
src/tools/{links,backlinks,open_file,get_active_file,views_base}/handler.ts
                                         # decodeEvalEnvelope(result, …)
src/tools/{find_and_replace,query_base}/handler.ts
                                         # parseFocusedVault(result); stdoutTail
src/tools/<each eval tool and file-cohort tool>/handler.test.ts (+ _handler-fixtures.ts)
                                         # tagged fixtures; before / after / look-alike / no-answer cases
CHANGELOG.md                             # [Unreleased] Fixed + Changed

# UNCHANGED: every _template.ts, FOCUSED_FILE_TEMPLATE / FOCUSED_VAULT_TEMPLATE, the _note-io templates,
#   COLD_START_PATTERN's value, APP_NOT_RUNNING_PATTERN, invokeCli's Vault-not-found check,
#   invoke-bounded-cli.ts, src/errors.ts, src/server.ts, src/tools/_register.ts, _register-baseline.json,
#   every index.ts / schema.ts, docs/tools/**
```

**Structure Decision**: single project.

- The tag is created, sent and checked in the cli-adapter layer, the one path every typed eval takes.
- Dispatch uses the tag to decide whether an answer is present.
- Tools read `evalAnswer`.

**Docs-as-code**: `/speckit-docs-as-code <n>` updates the `.docs-as-code/` pages after review, per the PR lifecycle in CLAUDE.md. The pages concerned describe dispatch classification, the cold-start retry, the eval cohort's answer reading and the `invokeCli` contract, plus any `docs/tools/**` error table that lists `details` keys.

## Phase 0: Research → research.md

- **F1–F9**:
  - the parse-site inventory (P1–P10), with the `_note-io` refresh added at analyze time;
  - the dispatch classifier;
  - the Smart Connections precedent;
  - single-line answers;
  - the shared facades;
  - `Vault not found.`;
  - the published surface;
  - **F8**: position cannot separate an answer from a look-alike;
  - **F9**: the CLI's printed form of strings, where the evidence conflicts.
- **D1–D10**: as summarised above.

**Output**: research.md. No `NEEDS CLARIFICATION` remains; F9 is closed by the T0 gate (D10).

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)**: the tag, the line kinds, the answer, the recognised error, the raw output, the classification order, and invariants I1–I7.
- **[contracts/eval-output-contract.md](contracts/eval-output-contract.md)**: answer table A1–A15, with look-alike rows A5–A8 and A13; dispatch table E1–E9, with E5b; the raw-output rule; frozen items; the surface delta.
- **[quickstart.md](quickstart.md)**: the T0 gate, the automated gate, the unchanged-baseline check, and the live check.
- **Agent context**: the `CLAUDE.md` plan pointer points at this plan.

## Phase 1 re-check (post-design Constitution Check)

- **I**: one new module at the lowest layer both consumers reach. `architecture.test.ts` still holds: no spawn import, and `dispatchCli` is still called only by the two facades.
- **II**: every contract row maps to a test (quickstart §2). Each modified tool has before, after, look-alike before and after, and no-answer cases.
- **III / IV**: schemas untouched; errors keep their codes and stages; ambiguity fails loudly; the retry is single.
- **V**: header corrections are listed in the gate table.
- **Surface standards**: the baseline does not move.

**No gate regressed; Complexity Tracking is empty.**

### Spec alignment note

| Requirement | How the plan meets it |
|-------------|-----------------------|
| **FR-001 / FR-002** | One tag rule, applied in `invokeCli` for every typed eval (D1, D4). |
| **FR-003** | The tag tells the capability's own answer from look-alikes in every position: before, after, and between (contract §1 A5–A8, A13). A look-alike alone never yields a result. |
| **FR-004** | Only the tagged line contributes. Every other line, marker or not, is ignored. |
| **FR-005 / FR-009** | Parse sites keep their `try`, code and stage. Envelope `ok:false` mappings are untouched. |
| **FR-007 / FR-011** | D2. Contract §2 E5b keeps a look-alike from masking a cold start. |
| **FR-012** | Non-eval paths are byte-identical (contract §2 E7, E8). |
| **FR-013** | No new code or reason. FR-010 is merged into FR-013 (analyze finding D1). |
| **FR-014** | D5. |
| **FR-015** | D7. |
| **`obsidian_exec`** (spec Context) | Answer handling is unchanged, and `eval` error recognition is inherited (D3). |

### CodeGraph structural check

Run with `codegraph_explore` at plan time and again at the analyze-time revision (HEAD `cb605f7` both times).

**Affected symbols and blast radius**:

- **`invokeCli`** (`src/cli-adapter/cli-adapter.ts:70`): among the most-depended-on symbols; every typed tool calls it. The change is gated on `input.command === "eval"`. Non-eval inputs build the same `DispatchInput`, and their result gains no `evalAnswer`, which `cli-adapter.test.ts` pins. The `InvokeCliSuccess` change is additive (`evalAnswer?`), so callers that read only `stdout` and `stderr` are unaffected.
- **`dispatchOnce`** (`_dispatch.ts:326`), priorities (b) and (c) at `:558-591`: reached through `dispatchWithColdStartRetry` → `dispatchCli` from the two facades. The change is gated on `input.command === "eval"`, and contract §2 E7–E8 pin the non-eval path.
- **`isColdStart`** (`:136`) and **`COLD_START_PATTERN`** (`:115`): `COLD_START_PATTERN` is imported by `_dispatch.test.ts` and several tool handler tests, among them `paths`, `pattern_search` and `query_base`. Its value is unchanged. `COLD_START_LINE_PATTERN` is new.
- **`parseEvalStdout`** (`src/tools/_active-file.ts:72`), renamed to `parseEvalAnswer`: called by `decodeEvalEnvelope`, `parseFocusedVault` and `resolveActiveFocusedFile`, and after D4 by the handlers P2–P9.
- **`decodeEvalEnvelope`** (`:89`) and **`parseFocusedVault`** (`:137`): the first parameter changes to the `invokeCli` result.
  - `decodeEvalEnvelope` callers: `links`, `backlinks`, `open_file`, `get_active_file`, `views_base`.
  - `parseFocusedVault` callers: `find_and_replace`, `query_base`. Both expose `invokeEval` seams, so their tests drive `defaultInvokeEval` through `spawnFn`.
- **`evalInVault`** (`:51`): it returns the result. Its callers are `_note-io.ts` (`invalidateMetadataCache`, `openNote`) and any other caller found at implement time.
- **`resolveActiveFocusedFile`** (`:184`): composed by `_file-target.ts` (`resolveFileTarget`, `resolveFsTarget`) and `resolveActiveLocatorWithVault`. The file cohort's active-mode tests stub its eval, so their fixtures move to tagged lines.
- **`invokeCli`'s `Vault not found.` check** (`cli-adapter.ts:104`): read, not edited.

**Kernel-node touch surface**:

- **`UpstreamError`** (`src/errors.ts:10`), the error-spine value type: the class is **not touched**. Constructions at the bounded eval parse sites gain the optional `stdoutTail` key, and no code is added.
- **`createServer`** (`src/server.ts:92`), **`createLogger`** (`src/logger.ts:107`) and **`createQueue`** (`src/queue.ts:24`): **not touched**. The new module needs no injected dependency; the nonce seam is an optional `InvokeCliDeps` field that defaults to `crypto.randomUUID`.

**Post-implement structural verification** (after `codegraph sync`):

1. No new error class or code: `src/errors.ts` is unchanged.
2. No handler imports `createLogger` / `createQueue`; `server.ts` is unchanged.
3. `eval-output.ts` is imported only by `_dispatch.ts` and `cli-adapter.ts` among production files. The one other importer is the test fixture file `src/tools/_handler-test-fixtures.ts` (tasks T008). There is no upward import.
4. Nothing is orphaned. Each of these has a production caller: `evalAnswerTag`, `wrapEvalCode`, `findTaggedEvalAnswer`, `hasEvalAnswerLine`, `findReportedErrorLine`, `COLD_START_LINE_PATTERN`, `parseEvalAnswer` and `evalParseFailureStdout`. `parseEvalStdout`, `set_property`'s `parseEvalResponse` and the inline strips are removed.

## Follow-ups (out of scope)

- **`Vault not found.` after plugin lines** (research F6): outside the owner's ruling. A separate BI if it is ever observed.
- **Non-eval commands with plugin lines**: plain-text outputs, out of scope per the spec.
- **Vault mirror of the ADR-029 amendment**: the local `.decisions/` note carries it; the vault mirror follows the usual convention, outside this PR.

## Complexity Tracking

> No Constitution Check violations; the table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
