# Data Model: Tolerate plugin noise

**Feature**: [spec.md](spec.md) | **Contract**: [contracts/eval-answer-contract.md](contracts/eval-answer-contract.md)

No stored data or published schema changes. The entities below are in-process values.

## Entities

| Entity | Shape | Owner | Notes |
|---|---|---|---|
| **Answer tag** | `"ocm-" + randomUUID()` | `invokeCli` (one per call, `command === "eval"` only) | Embedded in the sent code (contract A1). The cold-start retry reuses it. It is never logged: the dispatch log events carry `command` and call IDs, not argv. It is visible to the caller in eval error `details.argv` (the wrapped `code=`) and in raw `details.stdout` (contract §5, spec FR-010 (b)). It carries no secret and no user input. |
| **Raw output** | `stdout: string` | dispatch → `invokeCli` → tool | Always kept raw. It is the source for error excerpts. |
| **Answer line** | first line matching `=> <<TAG>>` (typed) / `=> ` (untagged) | `src/cli-adapter/_eval-answer.ts` | Contract A2. Lines split on `\n`, one trailing `\r` dropped, leading whitespace ignored. |
| **Answer body** | `answer?: string` on `InvokeCliSuccess` | `invokeCli` | The rest of the answer line after the marker. Absent when no answer line belongs to the call. |
| **`DispatchInput.answerTag`** | `answerTag?: string` | set by `invokeCli`, read by `dispatchOnce` | Absent for `invokeBoundedCli` (`obsidian_exec`). |
| **Parse-error excerpt** | `{ stdout: string; stdoutLength: number }` | `stdoutDetails()` in `src/tools/_eval-parse.ts` | Spread into the `details` of every eval parse-failure `UpstreamError` (contract §4). |

## Rules and invariants

- **R1**: an answer body is returned only from a line carrying this call's tag. Look-alikes never reach a parser (FR-003).
- **R2**: for `eval`, the presence of an answer line makes the call a success at the dispatch layer, whatever error-like lines surround it (FR-006).
- **R3**: for `eval` with no answer line, error lines are recognised at the start of any line. No-active-file takes precedence over other `Error:` lines; a cold-start line triggers exactly one retry (FR-007).
- **R4**: commands other than `eval` follow today's head-anchored rules byte-for-byte (FR-008).
- **R5**: a missing answer, or an answer body that fails to parse, produces the tool's existing parse error (`stage: "json-parse"`), never a success, an empty result or a default (FR-005).
- **R6**: every eval parse error carries the excerpt: whole when the output is 1,000 characters or fewer, otherwise head 500 + `"\n[… cut …]\n"` + tail 500, plus `stdoutLength` (FR-013).
- **R7**: no new error code, `stage`, `details.code`, `details.reason` or log event (FR-011, FR-014). The only new `details` key is `stdoutLength`.
- **R8**: typed eval code is a single JavaScript expression whose value prints on one line. Every current template and `_note-io` builder satisfies this (research F2).

## State flow (one typed eval call)

```text
tool handler ──invokeCli({command:"eval", code})──▶ mint TAG, wrap code (A1)
   ▼
dispatchCli ─▶ dispatchWithColdStartRetry ─▶ dispatchOnce(answerTag=TAG)
   │  exit≠0 / timeout / cap / cancel ─▶ unchanged errors
   │  answer line present ─▶ success (C1)
   │  no answer: no-active-file line ─▶ ERR_NO_ACTIVE_FILE (C2)
   │             Error: line ─▶ CLI_REPORTED_ERROR (C3) ─▶ cold-start line? retry once (C4)
   │             neither ─▶ success with no answer
   ▼
invokeCli ─▶ {stdout(raw), stderr, answer?}   (Vault-not-found check skipped if answer, C5)
   ▼
tool parser ─▶ parseEvalAnswer(answer) ─▶ envelope/schema checks
   │  failure ─▶ UpstreamError(existing code, stage, ...stdoutDetails(stdout))
   ▼
typed result (identical to the no-noise result)
```
