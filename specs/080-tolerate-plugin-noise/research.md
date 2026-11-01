# Research: Tolerate plugin noise

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **HEAD at research time**: `cb605f7`

All findings were read from the code at HEAD with `codegraph_explore`, plus `Grep` for string literals. No `NEEDS CLARIFICATION` remains. The three spec clarifications (2026-11-01) and the owner's analyze-time ruling on look-alike answers (2026-11-01, below) fixed every open decision.

**Analyze-time revision (2026-11-01).** The first plan identified the answer by position: the last line starting with `=> `. The owner ruled that this is not enough. Plugin text that looks like an answer must lose to the capability's own answer in **every** position, before or after it, and that criterion is a requirement, not an accepted risk. D1, D2 and D4 below are revised to identify the answer by a per-call tag. D9 (test fixtures) and D10 (T0 gate) are new.

## Findings

### F1: where eval answers are read today (parse-site inventory)

Every in-Obsidian query runs `obsidian eval code=<template>` through `invokeCli`. The CLI prints the expression value as text prefixed with `=> `. Every parse site found:

| # | Parse site | Consumers (capabilities) | Answer rule today | Raw output on parse failure |
|---|------------|--------------------------|-------------------|-----------------------------|
| P1 | `parseEvalStdout` (`src/tools/_active-file.ts:72`) | via `decodeEvalEnvelope` (`:89`): `links`, `backlinks`, `open_file`, `get_active_file`, `views_base` (focus-base eval).<br>Via `parseFocusedVault` (`:137`): `find_and_replace`, `query_base`.<br>Via `resolveActiveFocusedFile` (`:184`): the file cohort's active mode through `_file-target.ts` | `trimStart()`, strip a leading `=> `, `JSON.parse` the rest | `decodeEvalEnvelope`: `details.stdout = stdout.slice(0, 500)`, and the message carries `slice(0, 200)`.<br>`resolveActiveFocusedFile`: full `details.stdout`.<br>`find_and_replace/handler.ts:207` and `query_base/handler.ts:76`: `slice(0, 500)` |
| P2 | `read_heading/handler.ts:45-46` | `read_heading` | same as P1 | `slice(0, 500)` |
| P3 | `pattern_search/handler.ts:61-62` | `pattern_search` | same as P1 | `slice(0, 500)` |
| P4 | `find_by_property/handler.ts:42-43` | `find_by_property` | same as P1 | full `details.stdout` |
| P5 | `smart_connections_similar/handler.ts:51-52` | `smart_connections_similar` | same as P1 | `slice(0, 500)` |
| P6 | `paths/handler.ts:43-44` | `paths` | same as P1 | `slice(0, 500)` |
| P7 | `tag/handler.ts:46-47` (comment says "no LAST-`=> ` rescan") | `tag` | same as P1 | `slice(0, 500)` |
| P8 | `set_property/handler.ts:63` `parseEvalResponse` (a local copy of P1) | `set_property` active mode | same as P1 | `slice(0, 500)` |
| P9 | `smart_connections_query/handler.ts:50-59` | `smart_connections_query` | the **last** `\n=> ` occurrence, then everything to the end of the output | `slice(0, 500)` |
| P10 | `invalidateMetadataCache` (`src/tools/_note-io.ts:105-107`), via `evalInVault` | the post-write metadata refresh run by the write capabilities | `output.trim() === "=> ok"`, or `"=> missing"` | none; a mismatch logs `metadataRefreshFailed` with reason `unexpected-output` (best effort, no user-visible failure) |

`openNote` (`_note-io.ts:122`) also runs an eval but ignores its output, so it is unaffected.

With one plugin line before the answer, P1–P8 hand `"<plugin line>\n=> {…}"` to `JSON.parse` and fail at stage `json-parse`. P9 survives lines before the answer but fails on any text after it. P10 logs a false `unexpected-output`.

**Out of scope, confirmed by reading**: the non-eval commands (`query_base`'s `base:query`, `views_base`'s `base:views`, `read`, `outline`, `properties`, `search`, `context_search`, `files`, `bases`, `move`, `rename`, `delete`, `create_base`, `read_property`) and `obsidian_exec`, whose answer handling is verbatim.

### F2: how dispatch classifies exit-0 output (`src/cli-adapter/_dispatch.ts`)

`dispatchOnce` classifies an exit-0 result on `trimmedHead = stdout.trimStart()` (`:558`):

- priority (b), `:566`: a head of `error: no active file` gives `ERR_NO_ACTIVE_FILE`;
- priority (c), `:581`: a head of `Error:` gives `CLI_REPORTED_ERROR`, with `details.message = stdout.split("\n", 1)[0].trim()`;
- priority (d), `:594`: success.

`isColdStart` (`:136`) triggers the single ADR-029 retry when the anchored `COLD_START_PATTERN` (`:115`) matches `details.stdout`.

With a plugin line first, none of these match. The output reaches the handler as a "success", so the cold-start retry is skipped and the handler fails as `json-parse`. `APP_NOT_RUNNING_PATTERN` (`:17`) is unanchored and tested on stderr, so it is unaffected.

### F3: the Smart Connections precedent (R14)

The plugin's own `console.log` lines ("Found and returned N smart_blocks.") and `[warn]` lines arrive on stdout **before** the `=> ` line (`smart_connections_query/handler.ts:44-49`). That is the observed noise shape.

### F4: the answer is one line

Every eval template returns `JSON.stringify(...)` with no indentation argument. A search of `src/tools/**/_template.ts` finds none, and `FOCUSED_FILE_TEMPLATE` / `FOCUSED_VAULT_TEMPLATE` (`_active-file.ts:20-30`) and the `_note-io.ts` templates (which return `"ok"` / `"missing"`) follow the same pattern. `JSON.stringify` escapes newlines, so the answer is a single line.

### F5: both facades share the classifier

`dispatchCli` is shared by `invokeCli` (typed tools) and `invokeBoundedCli` (`obsidian_exec`), as ADR-029 requires.

### F6: `Vault not found.` is separate

`invokeCli`'s start-anchored `Vault not found.` re-classification (`cli-adapter.ts:104-113`) is not an `Error:` line. The owner's ruling does not cover it, so it is unchanged (plan Follow-ups).

### F7: published surface

No tool description, parameter, input schema or output schema changes, so `_register-baseline.json` does not move. The internal changes are the argv `code=` value sent for eval (D1) and one optional error `details` key (D5).

### F8: position cannot separate an answer from a look-alike

A plugin can print a line starting with `=> ` at any moment, including after Obsidian prints the answer: asynchronous `console.log` calls from timers and event handlers arrive late. A plugin line `=> {"ok":true,…}` that also passes the capability's schema matches the real answer in every property visible on stdout: prefix, line shape, JSON validity, schema. The schema cannot separate them, and neither can position. Only content the plugin cannot know can.

### F9: how the CLI prints the returned string (evidence conflicts)

- `_note-io.ts:106` compares `output === "=> ok"` for a template that returns the string `"ok"`, so strings are printed **raw**.
- The `parseFocusedVault` JSDoc (`_active-file.ts:130`) records `FOCUSED_VAULT_TEMPLATE` landing as `=> "{\"path\":…}"`, a JSON-**quoted** string. That is why the function double-decodes.

Both forms must therefore be read (D1), and T0 (D10) confirms which one appears.

## Decisions

### D1: identify the answer by a per-call tag (revised)

**Decision**: every typed eval call carries an unguessable, per-call **answer tag**, and only an answer line carrying that exact tag counts as the capability's answer.

- **Tag**: `obsidian-cli-mcp:<nonce>:`, where `<nonce>` is `crypto.randomUUID()` per `invokeCli` call (D9 adds a test seam). The tag never reaches the agent; only the extracted answer is used.
- **Wrap**: `invokeCli`, when `input.command === "eval"`, replaces `parameters.code` with `wrapEvalCode(code, tag)`:

  ```
  (async()=>{return <JSON.stringify(tag)>+(await (<code>))})()
  ```

  Every eval template returns a string (F4), so the printed value is the tag followed by the template's own string. The templates themselves stay byte-identical.
- **Locate**: `findTaggedEvalAnswer(stdout, tag): string | null` examines every line `L` (one trailing `\r` removed) whose `trimStart()` starts with `=> `. Let `R` be the text after the prefix.
  - **Raw form**: `R` starts with `tag`. The answer is `R.slice(tag.length)`.
  - **Quoted form** (F9): `R` starts with `"` + `tag`, and `JSON.parse(R)` is a string starting with `tag`. The answer is that string without the tag.
  - **Several qualifying lines**: if every one yields the same answer, that answer is used. If they differ, the result is `null`, which leads to a parse failure, so no wrong result is possible.
  - **No qualifying line**: `null`.

  Lines without the tag are ignored wherever they appear (before, after, or between). That covers plugin text, look-alike `=> {…}` lines, and lines carrying a different tag.
- **Module**: `src/cli-adapter/eval-output.ts` exports:
  - `evalAnswerTag(nonce)`, `wrapEvalCode(code, tag)` and `findTaggedEvalAnswer(stdout, tag)`;
  - `hasEvalAnswerLine(stdout)`, the untagged "any line starting with `=> `" test, used only for `eval` without a tag (`obsidian_exec`, D3);
  - `findReportedErrorLine(stdout)`, which returns the last line whose `trimStart()` starts with `Error:`.

  `_dispatch.ts` and `cli-adapter.ts` import it; tools never import it directly.
- **Delivery**: `invokeCli` returns `{ stdout, stderr, evalAnswer }`, where `evalAnswer: string | null` is set for eval calls and is `undefined` otherwise. `stdout` stays the full raw output, so diagnostics keep everything.

**Rationale**:

- F8 shows only content unknown to plugins can separate the answer from a look-alike.
- A per-call random UUID is unknowable to a plugin. Plugins see neither the CLI argv nor the eval source, and the value differs on every call.
- Wrapping in the one place every typed eval passes through (`invokeCli`) keeps FR-002's one rule, without editing any template.
- The "different answers mean `null`" rule makes the ambiguous case a parse failure, never a wrong result.
- Echoed source cannot forge an answer line. The wrapper text contains `=>{return "obsidian-cli-mcp:…`, so no line of echoed code can begin `=> ` followed by the tag.

**Alternatives considered (and why each is rejected)**:

| Alternative | Why rejected |
|-------------|--------------|
| Last `=> ` line (the first plan) | Defeated by a look-alike printed after the answer (F8). |
| First `=> ` line | Defeated by a look-alike printed before the answer. |
| The `=> ` line that passes the schema | A look-alike that also passes the schema cannot be separated (F8). |
| A separate sentinel line (`console.log(tag)` just before the return), with the answer taken as the next `=> ` line | Plugin output can still interleave between the sentinel and the answer. |
| A tag inside the base64 payload, echoed by each template | Edits every template, which the frozen-template rule (contract §4) forbids. |
| Wrapping in `dispatchOnce` | Dispatch is shared with `obsidian_exec`, whose code must not change (spec Context). |

### D2: eval-only widened error recognition in `dispatchOnce` (ADR-029 amendment 2026-11-01; revised for the tag)

**Decision**: `DispatchInput` gains optional `evalAnswerTag?: string`, which `invokeCli` sets on eval calls. For `input.command === "eval"` only:

1. **Is there an answer?** If a tag is set, the answer counts as present only when `findTaggedEvalAnswer(stdout, tag) !== null`. Without a tag (`obsidian_exec`), it counts as present when `hasEvalAnswerLine(stdout)`. If present, go to priority (d), success.
2. **No answer**: let `line = findReportedErrorLine(stdout)`.
   - A line starting (case-insensitively) with `error: no active file` gives `ERR_NO_ACTIVE_FILE`.
   - Any other line gives `CLI_REPORTED_ERROR`.
   - In both cases `details.message = line`, and every other `details` key is as today (`stdout` stays the full output).
   - No line at all gives priority (d).

For every other command the code path stays byte-identical. `isColdStart` tests `COLD_START_LINE_PATTERN = /^\s*Error: Command "[^"]*" not found\./m` (the same pattern, multiline) when `details.command === "eval"`, and the unchanged `COLD_START_PATTERN` otherwise. The retry stays `dispatchWithColdStartRetry`'s single attempt, and the second attempt reuses the same input and tag.

**Rationale**:

- This is the owner's ruling (spec Clarification Q2; authority: the ADR-029 amendment of 2026-11-01).
- With the tag, a look-alike `=> {…}` printed before Obsidian's cold-start line no longer passes for an answer, so the cold start is still recognised and retried (contract §2 E5b).
- The last `Error:` line is chosen because Obsidian's own message follows the plugin lines.

**Bounded false positive (accepted, the same class ADR-029 already accepts)**: eval output with no answer in which a plugin printed `Error: Command "x" not found.` causes one extra attempt. That attempt is safe, because the query never produced an answer.

### D3: `obsidian_exec` running `eval`

**Decision**:

- `obsidian_exec`'s answer handling is unchanged. `invokeBoundedCli` is untouched, so no code is wrapped and no tag is set, and successful output stays verbatim.
- Its `eval` calls inherit D2's error recognition with the untagged answer test: an answer line present gives success, as today.

**Rationale**: the ADR-029 retry covers both facades, and the 2026-11-01 ruling scopes the change by command (`eval`), not by tool (owner, analyze-time ruling F1).

**Behaviour change, recorded in the PR and CHANGELOG**: `obsidian_exec` `eval` output with plugin lines, then an `Error:` line, and no answer, now returns `CLI_REPORTED_ERROR` (or one cold-start retry) instead of a verbatim success.

### D4: tools read the tagged answer (revised)

**Decision**: `parseEvalStdout(stdout)` becomes `parseEvalAnswer(result: { stdout: string; evalAnswer?: string | null }): unknown`.

- When `evalAnswer` is a string, it returns `JSON.parse(evalAnswer)`.
- Otherwise it throws `SyntaxError("eval output carries no answer for this call")`.

The bare-JSON / untagged fallback is removed, because keeping it would let a look-alike through whenever the real answer is missing.

All callers move to the new function: `decodeEvalEnvelope`, `parseFocusedVault`, `resolveActiveFocusedFile`, P2–P9 and `set_property`'s `parseEvalResponse` (removed). Each call stays inside its existing `try`, so codes, `details.stage`, messages and `details` keys do not change.

- `decodeEvalEnvelope(stdout, …)` and `parseFocusedVault(stdout)` change their first parameter to the `invokeCli` result.
- `evalInVault` returns the result instead of the bare stdout.
- `_note-io.ts` P10 compares `evalAnswer === "ok"` / `"missing"`. Its `detail` keeps the raw output for the log.

**Rationale**: FR-002 calls for one rule. The tag check lives in `invokeCli`, and tools only read `evalAnswer`.

### D5: `details.stdoutTail` on long parse failures (spec Clarification Q3)

**Decision**: add `evalParseFailureStdout(stdout)` to `_active-file.ts`.

- It returns `{ stdout: stdout.slice(0, 500) }`, plus `stdoutTail: stdout.slice(-500)` when `stdout.length > 500`.
- Every eval parse-failure site that today attaches `stdout.slice(0, 500)` spreads it at its `json-parse` and `envelope-parse` stages. The sites are `decodeEvalEnvelope`, P2, P3, P5–P9, the focused-vault failure in `find_and_replace` and the `focused-vault-resolve` failure in `query_base`.
- Sites that attach the full output (P4, `resolveActiveFocusedFile`) are unchanged.
- Messages are unchanged.

**Rationale**: the key is additive, appears only past the limit, has one shared name, and is neither a code nor a `details.reason` (FR-013, ADR-015).

### D6: no logging of discarded plugin text

**Decision**: nothing new is logged.

**Rationale**:

- Nothing asks for it. FR-005 and D5 already cover diagnosis.
- Plugin output could carry note-derived text into the logs.

### D7: tests (Principle II, FR-015)

**`src/cli-adapter/eval-output.test.ts`** (new):

- `findTaggedEvalAnswer`, for contract §1 rows A1–A14: look-alikes before, after, and both, a wrong tag, the quoted form, CRLF, several identical tagged lines, several different tagged lines, no tag;
- `wrapEvalCode` keeps the template's text verbatim inside the wrapper;
- `evalAnswerTag`'s format;
- `hasEvalAnswerLine`;
- `findReportedErrorLine`, where the last line wins.

**`src/cli-adapter/cli-adapter.test.ts`**:

- an eval call wraps `code=`, using the injected nonce;
- it sets `evalAnswerTag` on dispatch;
- it returns `evalAnswer`;
- a non-eval call is not wrapped and has no `evalAnswer`.

**`src/cli-adapter/_dispatch.test.ts`**: contract §2 rows E1–E9, exactly one retry, and the existing guard that no new code is added.

**`src/tools/_active-file.test.ts`**: `parseEvalAnswer`, `decodeEvalEnvelope` with `stdoutTail`, and both focused lookups, each with noise before and after and with a look-alike before and after.

**Each affected tool's `handler.test.ts`**:

1. plugin lines before the answer give the normal result;
2. plugin lines after the answer give the normal result;
3. a look-alike `=> {…}` before **and** after the real answer gives the real answer's result;
4. no answer gives the existing parse-failure code and stage, with the raw output.

Bounded sites also get the `stdoutTail` case. `_note-io.test.ts` gets the P10 cases.

### D8: live check (T0, during implementation)

See D10 for the gate. After implementation, one live run against the authorised test vault (under `.memory/test-execution-instructions.md`) confirms real plugin lines and a normal result through the Smart Connections search and two other tools.

### D9: test fixtures for the tag (new)

**Decision**:

- `InvokeCliDeps` gains a test seam `evalNonce?: () => string`. Production uses `crypto.randomUUID`, and `EvalDeps` and handler deps pass it through unchanged.
- `src/tools/_handler-test-fixtures.ts` gains:
  - `TEST_EVAL_NONCE`, `TEST_EVAL_TAG`;
  - `evalAnswerLine(value: string)` → `=> ${TEST_EVAL_TAG}${value}`;
  - `wrappedEvalCode(code)` for argv assertions.
- Existing eval tests change their stub stdout from `=> {…}` to `evalAnswerLine("{…}")`, and their deps gain `evalNonce: () => TEST_EVAL_NONCE`.
- Argv assertions on `code=` use `wrappedEvalCode(template)`, or `toContain(template)` where the test already asserts containment.

**Rationale**: explicit injection is visible in every test and needs no magic substitution in the stub spawn. The churn is mechanical and confined to test files and fixtures.

**Alternative rejected**: a stub spawn that auto-tags the last `=> ` line. It would hide exactly the behaviour the look-alike tests must exercise.

### D10: T0 gate before any code (new)

**Decision**: before T002, run one live probe under `.memory/test-execution-instructions.md` against the authorised test vault. Send `wrapEvalCode` around `FOCUSED_FILE_TEMPLATE`, `FOCUSED_VAULT_TEMPLATE` and one `composeEvalCode` template, and record the exact stdout. Confirm three things:

1. the printed value starts with the tag in raw or quoted form;
2. the awaited async value is printed, not `[object Promise]`;
3. plugin lines do not appear on the answer line itself.

**Stop rule**: if no form preserves the tag at the start of the answer line, stop and raise it to the owner as a question. That would mean no reliable way exists to tell the answer from a look-alike, and the criterion must not be weakened (owner ruling).
