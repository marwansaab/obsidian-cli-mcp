# ADR-052 — Typed evals are answered only by the line carrying a per-call tag

- **Status:** Accepted
- **Date:** 2026-11-01
- **Source:** PR #109 (`specs/080-tolerate-plugin-noise/`, research F8, F9,
  D1 to D5, spec Clarifications Q1 to Q3, contract §1 A1 to A15 and §2 E1 to
  E9), commits `23624c3` and `e953c08`
- **Related:** ADR-029 (Retry Once on Cold-Start Vault-Launch Failure), whose
  amendment of 2026-11-01 (recorded in the maintainer's decision log) widens
  the cold-start signature for `eval` and is the authority for the dispatch
  half of this change; ADR-004 (Centralized Obsidian CLI Adapter), the reason
  the tag is added in one facade rather than in each tool;
  [ADR-045](ADR-045-closed-vaults-recovered-only-by-the-dispatch-retry.md)
  (Closed Vaults Are Recovered Only by the Dispatch Retry), whose retry this
  change keeps reachable behind plugin output

Neither the spec nor the plan asked for this record. It is written because
PR #109 settled how the server tells its own `eval` answer apart from
anything else a plugin prints, and that rule now binds every typed tool that
runs JavaScript in Obsidian. The owner's analyze-time ruling (research D1)
closed off every position-based reading. It is numbered as 1 + the highest
ADR number used anywhere; the vault's Decision Log needs the matching entry.

## Context

`obsidian eval` prints its result as a `=> <value>` line on the same stdout
that every enabled plugin's `console.log` reaches. The answer readers took
the first `=> ` at the start of the output (`parseEvalStdout`), and
`smart_connections_query` took the last `\n=> `. One plugin line before the
answer turned a success into a `json-parse` failure, and one after it broke
`smart_connections_query`. Dispatch also read `Error:` and the cold-start
signature only at the start of the output, so a plugin start-up line ahead of
`Error: Command "eval" not found.` hid the cold start from the ADR-029 retry.

Research F8 showed that position cannot fix this. A plugin can print a line
`=> {"ok":true,…}` before or after the real answer, asynchronously, and that
line can match the real answer in prefix, shape, JSON validity and schema.
Only content the plugin cannot know separates the two.

## Decision

1. **A per-call tag.** Every typed eval's code is wrapped as
   `(async()=>{return "obsidian-cli-mcp:<uuid>:"+(await (<code>))})()`, with
   a fresh `randomUUID` per call (`wrapEvalCode` and `evalAnswerTag` in
   `src/cli-adapter/eval-output.ts`). The template is embedded verbatim, so
   no `_template.ts` changes and the frozen-template rule holds. The tag is
   server-generated and quoted with `JSON.stringify`; no user input enters
   the wrapper.
2. **Only the tagged line is the answer.** `findTaggedEvalAnswer` accepts a
   `=> ` line whose body starts with the tag, raw (`=> <tag>value`) or
   JSON-quoted (`=> "<tag>value"`), CRLF-tolerant. Every other line is
   ignored wherever it sits: plugin text, look-alike `=> {…}` lines, lines
   carrying another call's tag. Tagged lines that disagree yield `null`, so
   the ambiguous case is a parse failure and never a wrong result. The T0
   probe (T002) saw the raw form for all three templates it tried; the quoted
   form is still read (contract A9).
3. **One facade adds it.** `invokeEval({ code, vault? }, deps)` in
   `src/cli-adapter/cli-adapter.ts` builds the tag, wraps the code, routes
   through the same queue, bounds and dispatch as `invokeCli`, and returns
   `{ stdout, stderr, answer }`. `invokeCli` has no eval behaviour.
   `src/cli-adapter/architecture.test.ts` rule (iii) fails the build if any
   file other than the two facades spells `command: "eval"`.
4. **Dispatch locates the answer once.** The tag rides on
   `DispatchInput.evalAnswerTag`; `dispatchOnce` finds the tagged answer while
   classifying and returns it as `DispatchOutput.evalAnswer`. For `eval` only,
   output with no answer is classified by its **last** `Error:` line anywhere
   (`ERR_NO_ACTIVE_FILE` or `CLI_REPORTED_ERROR`), and `isColdStart` matches
   the cold-start signature at the start of any line
   (`COLD_START_LINE_PATTERN`). The retry stays single. Non-eval commands are
   classified exactly as before.
5. **No fallback for an untagged answer.** `parseEvalAnswer` throws when the
   call carries no answer. Bare JSON with no `=> ` line, which the old strip
   accepted, is now a `json-parse` failure (contract A14), because keeping the
   fallback would let a look-alike through whenever the real answer is
   missing.
6. **No new code or reason.** Failures keep their existing code and
   `details.stage`. Bounded parse sites add one key, `details.stdoutTail` (the
   last 500 characters), beside the existing first-500 `details.stdout`, only
   when the output is longer than 500 characters
   (`evalParseFailureStdout`, spec Clarification Q3).

## Alternatives rejected

Research D1 records the owner's analyze-time ruling that a look-alike must
never win, which rejected every reading that relies on where a line sits or
what it looks like:

- **The last `=> ` line.** This was the first plan, and the
  `smart_connections_query` precedent. A look-alike printed after the answer
  defeats it.
- **The first `=> ` line.** The pre-PR behaviour. A look-alike printed before
  the answer defeats it.
- **The `=> ` line that passes the capability's schema.** A look-alike that
  also passes the schema cannot be told apart (F8).
- **A sentinel line printed just before the return**, with the answer taken
  as the next `=> ` line. Plugin output can still land between the two.
- **A tag inside the base64 payload, echoed by each template.** It edits every
  template, which the frozen-template rule forbids.
- **Wrapping in `dispatchOnce`.** Dispatch is shared with `obsidian_exec`,
  whose code is sent as the caller wrote it.
- **The tag as a branch inside `invokeCli`** (commit `23624c3`, as first
  implemented). `invokeCli` wrapped any call whose command was `eval` and
  returned an extra `evalAnswer` field, every tool still hand-built its eval
  call, and dispatch and the facade scanned the output twice. PR #109's
  code-quality review (commit `e953c08`, finding F2) argued the PR into the
  dedicated `invokeEval` facade and the build-time rule (iii). The spawned
  argv of every call stayed byte-identical.

## Consequences

- The `code=` argument of every typed eval call changed. Every eval test
  fixture moved to tagged answers (`evalAnswerLine`, `wrappedEvalCode` and the
  `EVAL_NONCE_SEAM` injection in `src/tools/_handler-test-fixtures.ts`), and
  the shared `noisyAnswerCases` / `noAnswerCases` battery carries the plugin
  cases for every eval suite.
- No published surface moved: no tool, parameter, description, schema,
  output field, error code, `details.stage` or `details.reason` changed, and
  `_register-baseline.json` is unchanged.
- `obsidian_exec` still sends `eval` code unwrapped and returns success
  output verbatim. It inherits the dispatch half with an untagged answer test
  (any `=> ` line counts as an answer): output with plugin lines, then an
  `Error:` line and no `=> ` line, is now `CLI_REPORTED_ERROR` (or one
  cold-start retry) instead of a verbatim success (research D3).
- Accepted false positive, the class ADR-029 already accepts: eval output
  with no answer in which a plugin printed `Error: Command "x" not found.`
  costs one extra attempt, which is safe because the query produced no answer.
- Discarded plugin text is not logged (research D6); it may carry note text.
- The plugin cases are covered by in-process tests only. The authorised test
  vault has no plugins, so quickstart §4 step 1 was not reproduced live.
