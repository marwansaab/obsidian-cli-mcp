# Implementation Plan: Tolerate plugin noise

**Branch**: `080-tolerate-plugin-noise` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/080-tolerate-plugin-noise/spec.md`

> **This change modifies runtime behaviour only.** It touches the typed-tool CLI facade (`invokeCli`), the dispatch layer's exit-0 stdout classification for `eval`, and every eval-composed tool's answer parsing and parse-error excerpt.
>
> It adds no tool, parameter, output field, published description, top-level error code, `stage`, `details.code`, `details.reason` or log event. The only new `details` key is `stdoutLength` on eval parse errors. The `_register-baseline.json` fingerprints do not move.

## Summary

Obsidian plugins print onto the stdout that carries an `obsidian eval` answer. Today every eval-composed tool except `smart_connections_query` expects the answer at the head of stdout, so one plugin line ahead of it turns a success into a parse failure. The dispatch layer's cold-start and error recognition is head-anchored too, so a plugin line also hides the cold-start signature.

This plan carries out the owner's 2026-11-01 amendment to ADR-029 (BI-0135) and the two spec clarifications (research D1–D7):

- **D1 (per-call answer tag)**: for `eval`, `invokeCli` mints `TAG = "ocm-" + randomUUID()` and sends `(async()=>'<<TAG>>'+(await (CODE)))()`. The call's own answer is then the line `=> <<TAG>>…`; plugin look-alikes never match. The templates stay byte-identical.
- **D2 (dispatch rule for `eval` only)**: an answer line means success. With no answer line, error lines are recognised at the start of any line: no-active-file → `ERR_NO_ACTIVE_FILE`, otherwise `Error:` → `CLI_REPORTED_ERROR`, and a cold-start line → the existing single retry. Other commands keep the head-anchored rules. `obsidian_exec` (untagged) treats any `=> ` line as the answer. `invokeCli` returns `answer` next to the raw `stdout`.
- **D3 (one parse and excerpt module for the tools)**: `src/tools/_eval-parse.ts`. `parseEvalAnswer(answer)` replaces `parseEvalStdout`, the six inline `=> ` strips, set_property's own parser and smart_connections_query's last-marker extraction. `stdoutDetails(stdout)` gives the FR-013 excerpt to every eval parse error: whole when 1,000 characters or fewer, otherwise head 500 + `"\n[… cut …]\n"` + tail 500, plus `stdoutLength`.
- **D4 (test stubs)**: the shared spawn stubs tag `=> ` lines with the tag read from the recorded `code=` argument, so the existing fixtures pass unchanged. A function-form `stdout` lets noise tests write exact bytes.
- **Amended 2026-11-01 (PR #110 code-quality review; behaviour unchanged)**: the tag lives in a dedicated `invokeEval({ code, vault? })` next to `invokeCli` in `cli-adapter.ts`, rather than in an `eval` branch of `invokeCli`. Dispatch returns the tagged answer once as `DispatchOutput.evalAnswer`, and five more handlers decode through `decodeEvalEnvelope`. Where this plan says `invokeCli` for a typed eval, read `invokeEval`. See research.md D1, "Amended".
- **D5 (noise matrix)**: one table-driven test runs every eval-composed tool through contract N1–N13.
- **D6 (T0 live probes)**: probes P1–P4 in the test vault before code is written.
- **D7 (docs)**: the tool pages and CHANGELOG are updated.

The published behaviour is in [contracts/eval-answer-contract.md](contracts/eval-answer-contract.md).

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. Unchanged.

**Primary Dependencies**: `@modelcontextprotocol/server` (SDK v2), `zod` 4, `node:crypto` (`randomUUID`, already used by `_dispatch.ts`). **No new dependency.**

**Storage**: none touched.

**Testing**: `vitest run`, co-located `*.test.ts`. Shared stubs in `src/tools/_handler-test-fixtures.ts` become tag-aware (research D4). The new matrix test reuses `TYPED_RESULT_FIXTURES` (`src/tools/_typed-result-fixtures.ts`).

**Target Platform**: Windows, macOS and Linux; CI on Linux and Windows. Line splitting treats `\r\n` and `\n` alike.

**Project Type**: single project, an MCP server (`src/**`).

**Performance Goals**: one line scan of stdout per eval call (stdout is capped at 10 MiB), plus about 66 extra characters on the `code=` argument. No extra CLI round-trip.

**Constraints**:

- Results, codes, stages and messages stay unchanged when there is no plugin output (FR-010). The exceptions are the §4 excerpt keys, and the wrapped `code=` and tag that appear in eval error `details.argv` / raw stdout (FR-010 (b)).
- No new top-level code, `stage`, `details.code`, `details.reason` or log event (FR-011, FR-014).
- `obsidian_exec`'s output shape stays unchanged (FR-012).
- The cold-start retry stays single and in the dispatch layer (ADR-029).
- The eval templates' bytes stay unchanged.
- The `code=` element of the focused-file eval stays ≤ 250 characters (the existing `write_note/handler.test.ts:550` check).

**Scale/Scope**:

- **New code**: `src/cli-adapter/_eval-answer.ts` and `src/tools/_eval-parse.ts`.
- **Changed code**:
  - `src/cli-adapter/_dispatch.ts` (`DispatchInput.answerTag`, the eval branch of `onTerminal`, `isColdStart`);
  - `src/cli-adapter/cli-adapter.ts` (wrap, `answer`, C5);
  - `src/tools/_active-file.ts` (`evalInVault`, `decodeEvalEnvelope`, `parseFocusedVault`, `resolveActiveFocusedFile`; `parseEvalStdout` removed);
  - `src/tools/_note-io.ts`;
  - the handlers of find_by_property, read_heading, paths, tag, pattern_search, smart_connections_query, smart_connections_similar, set_property, find_and_replace and query_base;
  - the call-site signature updates in backlinks, links, get_active_file, open_file and views_base.
- **Tests**:
  - new: `_eval-answer.test.ts`, `_eval-parse.test.ts`, `_plugin-noise.test.ts`;
  - extended: `_dispatch.test.ts`, `cli-adapter.test.ts`, `_handler-test-fixtures.test.ts`;
  - rewritten or adjusted (research F6): `_active-file.test.ts`, `_note-io.test.ts`, `_registration-stub.ts`, and the exact-`code=` assertions.
- **Docs**: the `docs/tools/*.md` pages listed in research D7, plus `CHANGELOG.md`.

**Resolved unknowns**: all. The recognition rules are the owner's ruling; the excerpt and logging come from spec Clarifications Q1 and Q2. The one runtime assumption, that a string value prints raw after `=> `, is evidenced by the shipped cohort parsing `=> {…}` live and is confirmed by T0 probe P1. If P1 contradicts it, implementation stops and escalates.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | Two new single-purpose modules. `cli-adapter/_eval-answer.ts` handles tagging and line scanning and is imported only by `_dispatch.ts` and `cli-adapter.ts`. `tools/_eval-parse.ts` handles answer parsing and the excerpt and is imported by tool handlers and shared tool helpers. Imports run tool → shared tool helper → cli-adapter; no upward or cyclic edge, no tool→tool edge. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | Every eval-composed tool's behaviour changes, and each gets happy-path (N1–N7, N12) and failure/boundary (N8–N11) cases in `_plugin-noise.test.ts`, alongside its unchanged existing tests. The new modules get co-located unit tests. Dispatch D1–D6 go in `_dispatch.test.ts`. All tests land in the same change. |
| **III. Boundary Input Validation with Zod** | **N/A** | No input schema changes. Output envelopes are still checked by the existing zod schemas after `parseEvalAnswer`. |
| **IV. Explicit Upstream Error Propagation** | **Y** | A missing or unparseable answer still raises the tool's existing `UpstreamError` (same code and `stage`), now with the bounded raw-output excerpt and `stdoutLength`. Nothing is masked as success or empty. No new code, `stage` or `reason`. The cause is kept "where safe" (spec Clarifications Q1). The cold-start retry is the existing documented recovery path (ADR-029). |
| **V. Attribution & Layered Composition** | **Y** | Both new modules and the three new test files carry `// Original — no upstream. …`. The intent headers of `_dispatch.ts`, `cli-adapter.ts`, `_active-file.ts`, `_note-io.ts`, `smart_connections_query/handler.ts` (whose R14 line changes) and the touched handlers are updated. |
| **ADR-015** (sub-discriminators) | **Y** | No `details.reason`, `details.code` or `stage` value is added. `stdoutLength` is context, not a discriminator. |
| **ADR-029** (cold-start retry) | **Y** | Implements the 2026-11-01 amendment exactly: eval-only widening, answer over error lines, per-call tag for typed tools, untagged answer for `obsidian_exec`, the retry still single and in the dispatch layer. |
| **ADR-010 / ADR-013 / ADR-014** | **N/A** | No tool added or renamed. The Smart Connections templates are not edited (the wrapper is applied outside them), so ADR-014's byte-identical lifecycle branches hold. |
| **ADR-040** (published descriptions) | **N/A** | No description changes. |
| **MCP Tool Surface Standards** | **Y** | Titles, annotations, input and output schemas, server instructions and the schema dialect are unchanged. The baseline does not move (quickstart §1). Errors stay text-only. |
| **Security Defaults** | **Y** | `obsidian_exec`'s eval gate is unchanged. The wrapper interpolates only a server-minted UUID, never user input, so the base64 anti-injection rule (R6) holds. The tag carries no secret and is never logged. It is visible to the caller only where errors already echo the sent `argv` or the raw stdout (spec FR-010 (b), contract §5). |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**Kernel-node attention (per CLAUDE.md)**:

- `UpstreamError` is used, not changed. Existing construction sites change only their `details.stdout` value and gain `stdoutLength`.
- `createLogger`, `createQueue` and `createServer` are not touched.
- High-blast-radius, non-kernel surfaces are edited: `invokeCli`, which is on every typed tool's runtime spine, and `dispatchOnce` / `isColdStart`, which `obsidian_exec` shares. Reviewers should check that the non-eval path is byte-for-byte unchanged (contract §2, D4).

## Project Structure

### Documentation (this feature)

```text
specs/080-tolerate-plugin-noise/
├── plan.md                                # This file
├── research.md                            # F1–F7 findings, D1–D7 decisions
├── data-model.md                          # tag, answer, excerpt; invariants R1–R8; state flow
├── quickstart.md                          # automated gate, T0 probes P1–P4, live end-to-end
├── contracts/
│   └── eval-answer-contract.md            # §1 recognition, §2 dispatch, §3 N1–N13 + D1–D6, §4 E1–E5, §5 unchanged
├── checklists/requirements.md
└── tasks.md                               # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
src/cli-adapter/_eval-answer.ts            # NEW: wrapEvalCode, findAnswer(stdout, tag?), findErrorLine scan (A1–A5, C2–C3)
src/cli-adapter/_eval-answer.test.ts       # NEW
src/cli-adapter/_dispatch.ts               # DispatchInput.answerTag; eval branch in onTerminal (C1–C3); isColdStart per-line for eval (C4)
src/cli-adapter/_dispatch.test.ts          # D1–D6
src/cli-adapter/cli-adapter.ts             # mint tag + wrap for eval; InvokeCliSuccess.answer; C5
src/cli-adapter/cli-adapter.test.ts        # wrap / answer / C5 / distinct tags
src/tools/_eval-parse.ts                   # NEW: parseEvalAnswer, stdoutDetails (FR-013)
src/tools/_eval-parse.test.ts              # NEW: E1–E5
src/tools/_active-file.ts                  # evalInVault → {stdout, answer}; decodeEvalEnvelope / parseFocusedVault / resolveActiveFocusedFile on answer + excerpt; parseEvalStdout removed
src/tools/_note-io.ts                      # invalidate compares answer to "ok" / "missing"
src/tools/{find_by_property,read_heading,paths,tag,pattern_search,smart_connections_query,smart_connections_similar,set_property}/handler.ts
                                           # parseEvalAnswer + stdoutDetails in place of inline strips
src/tools/{find_and_replace,query_base}/handler.ts   # defaultInvokeEval on answer + excerpt
src/tools/{backlinks,links,get_active_file,open_file,views_base}/handler.ts   # decodeEvalEnvelope call-site signature
src/tools/_handler-test-fixtures.ts        # tag-aware makeQueuedSpawn / makeStubSpawn; function-form stdout; answerLine, unwrapEvalCode
src/tools/_registration-stub.ts            # tag-aware
src/tools/_plugin-noise.test.ts            # NEW: N1–N13 × every eval-composed tool
docs/tools/*.md                            # pages per research D7
CHANGELOG.md                               # [Unreleased] Fixed + Changed

# UNCHANGED: src/errors.ts, src/logger.ts, src/queue.ts, src/server.ts, src/tools/_register.ts,
#   src/cli-adapter/invoke-bounded-cli.ts, src/tools/obsidian_exec/**, every _template.ts,
#   src/tools/_register-baseline.json, every schema.ts
```

**Structure Decision**: single project. Tagging and line classification go in the cli-adapter layer, so every typed eval and the dispatch rule share one implementation. Answer parsing and the excerpt go in one shared tool helper, so every eval-composed tool handles noise the same way (FR-002).

**Docs-as-code**: the `.docs-as-code/` pages that describe the CLI adapter and the eval cohort are updated by `/speckit-docs-as-code <n>` after review, per the PR lifecycle in CLAUDE.md.

## Phase 0: Research → research.md

- **F1**: the inventory of every eval parser and how it strips `=> `.
- **F2**: every answer is one line; U+2028 caveat.
- **F3**: head-anchored dispatch, cold-start and unknown-vault checks.
- **F4**: the two facades; `obsidian_exec` is the only `invokeBoundedCli` caller.
- **F5**: today's inconsistent excerpts.
- **F6**: test stubs, exact-`code=` assertions, the 250-character check.
- **F7**: the plugin-free test vault; `console.log` as live noise.
- **D1 to D7**: as summarised above.

**Output**: research.md, with no `NEEDS CLARIFICATION` remaining.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)**: answer tag, raw output, answer line and body, `answerTag`, excerpt; invariants R1–R8; the state flow of one typed eval call.
- **[contracts/eval-answer-contract.md](contracts/eval-answer-contract.md)**: recognition A1–A5, dispatch C1–C5, noise matrix N1–N13, dispatch cases D1–D6, excerpt E1–E5, what stays unchanged.
- **[quickstart.md](quickstart.md)**: the automated gate, an unchanged baseline, T0 probes P1–P4, and the live end-to-end check under `.memory/test-execution-instructions.md`.
- **Agent context**: the `CLAUDE.md` plan pointer now points at this plan.

## Phase 1 re-check (post-design Constitution Check)

- **I**: two new modules, each with one responsibility and one-directional imports.
- **II**: every contract row maps to a co-located test, and every eval-composed tool is in the matrix.
- **III**: N/A, no schema change.
- **IV**: failures keep their codes and stages and carry the excerpt; nothing is masked.
- **V**: headers on the new files; intent lines updated.
- **ADR-015 / ADR-029**: no new discriminator; the amendment is implemented as written.
- **MCP Tool Surface Standards**: the baseline is unchanged.

**No gate regressed; Complexity Tracking is empty.**

### Spec alignment note

- **FR-002 and smart_connections_query**: its last-`=> ` extraction (R14) is replaced by the tagged rule. It stays tolerant of leading noise (N2, N3) and also rejects trailing look-alikes (N6), which the last-marker rule would have returned.
- **FR-010 / SC-006**: two existing behaviours change. Both rest only on outputs real eval never produces, or on the excerpt rule:
  - the whole-stdout fallback when there is no `=> ` marker (`_active-file.test.ts:69–71`);
  - head-only stdout slices on long parse-error output.
- **"No active file" (FR-007)**: the dispatch-level `ERR_NO_ACTIVE_FILE` (priority b) gains line-anywhere recognition for eval. Templates that report no active file inside their own envelope (`ok:false, code:"NO_ACTIVE_FILE"`) are covered by N12.
- **Edge case "answer marker inside a line"**: A2 requires the marker at the start of the line, after leading whitespace (N10).
- **Closed-vault description wording (analyze F3, owner ruling Option A)**: the shared `closedVaultNote` paragraph (`src/tools/_shared.ts:41`) says a vault-unavailable `CLI_REPORTED_ERROR` has a `details.stdout` that "starts `Error: Command "<command>" not found.`". It is unchanged.
  - The wording is exact when no plugin output is present.
  - When plugin output is present, the signature appears on a later line of `details.stdout`.
  - The caveat goes only on the `docs/tools` pages of the five eval tools that use the paragraph (`paths`, `tag`, `pattern_search`, `smart_connections_query`, `smart_connections_similar`; T036). Under ADR-005 progressive disclosure, those pages carry the full contract, served via `help`.
  - `query_base` (`base:query`, out of scope) and the baseline fingerprints are untouched.

### CodeGraph structural check

Run with `codegraph_explore` at plan time (HEAD `cb605f7`).

**Affected symbols and blast radius**:

- `invokeCli` (`src/cli-adapter/cli-adapter.ts:70`): the typed-tool facade on the runtime spine of every typed tool, among the most-depended-on symbols. Only its eval branch changes (wrap, `answer`, C5). Non-eval calls must pass through byte-identical, which the existing `cli-adapter.test.ts` suite confirms.
- `dispatchCli` → `dispatchWithColdStartRetry` → `dispatchOnce` (`src/cli-adapter/_dispatch.ts:266, 234, 326`): reached from both facades (`cli-adapter.ts`, `invoke-bounded-cli.ts`). The change is the exit-0 classification in `onTerminal` (l.558–594) for `command === "eval"`. The retry orchestration is unchanged.
- `isColdStart` / `COLD_START_PATTERN` (`_dispatch.ts:136, 115`): exported and shared with `_dispatch.test.ts`. Behaviour is widened for eval only.
- `parseEvalStdout` (`src/tools/_active-file.ts:72`): callers are `decodeEvalEnvelope`, `parseFocusedVault` and `resolveActiveFocusedFile`, all in `_active-file.ts`. It is replaced by `parseEvalAnswer`.
- `decodeEvalEnvelope` (`_active-file.ts:89`): called by the backlinks, links, open_file, get_active_file and views_base handlers. Its signature changes to take the `invokeCli` result.
- `resolveActiveFocusedFile` (`_active-file.ts:184`): called by write_note, find_and_replace and `_file-target.ts`, which serves append_note, prepend, patch_block, patch_heading, read, outline, move and rename in active mode. Its internals change; its signature does not.
- `parseFocusedVault` (`_active-file.ts:137`): called by find_and_replace and query_base.
- `evalInVault` (`_active-file.ts:51`): called by `_note-io.ts`. Its return type changes.
- `TYPED_RESULT_FIXTURES` (`src/tools/_typed-result-fixtures.ts:117`): read by `_surface.test.ts` and by the new matrix test.

**Kernel-node touch surface**:

- `UpstreamError` is used, not edited; `src/errors.ts` is unchanged.
- `createLogger`: no new event and no new call site (FR-014). `dispatchRetry` is still emitted from the same place.
- `createQueue`: unchanged; `invokeCli` still wraps dispatch in `queue.run`.
- `createServer`: unchanged.

**High-blast-radius surface**: `invokeCli` and `dispatchOnce`, as above. Both changes are guarded by `command === "eval"`, and the non-eval path must stay byte-identical.

**Post-implement structural verification** (after `codegraph sync`):

1. There is no new error class or top-level code. `src/errors.ts` is unchanged, and every new failure path raises an existing code through `UpstreamError`.
2. No handler imports `createLogger` / `createQueue`, and `server.ts` is unchanged.
3. `src/cli-adapter/_eval-answer.ts` is imported only by `_dispatch.ts`, `cli-adapter.ts` and its test. `src/tools/_eval-parse.ts` is imported only from `src/tools/**`. Nothing in `src/cli-adapter/**` imports from `src/tools/**`.
4. `parseEvalAnswer` and `stdoutDetails` are reachable from every eval-composed handler. `parseEvalStdout` has no remaining references.

## Follow-ups (out of scope)

- **Non-eval commands**: plugin noise ahead of a non-eval command's output (for example `read` or `files`) is out of scope (spec FR-008). It stays head-anchored until the owner extends the ADR-029 ruling.
- **`obsidian_exec` stdout**: it is still returned raw, noise included (FR-012).
- **Error message excerpts**: messages such as `eval response is not JSON: <first 200 characters>` are unchanged. With leading noise they show noise, and `details.stdout` carries the full head-plus-tail context.

## Complexity Tracking

> No Constitution Check violations; the table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
