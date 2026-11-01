# Research: Tolerate plugin noise

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **HEAD at plan time**: `cb605f7`

The findings (F) come from the code index (`codegraph_explore`) and a read-only inventory of every `obsidian eval` consumer. The decisions (D) carry out the owner's 2026-11-01 amendment to ADR-029 (BI-0135) and the two spec clarifications.

## Findings

### F1 — Where eval output is parsed today

Every typed eval call goes through `invokeCli` (`src/cli-adapter/cli-adapter.ts:70`), which returns `{ stdout, stderr }` unchanged. Each consumer then removes the `=> ` echo prefix itself:

| Consumer | Parser | Removes `=> ` how |
|---|---|---|
| `decodeEvalEnvelope` (backlinks, links, get_active_file, open_file, views_base) | `parseEvalStdout` `_active-file.ts:72` | `trimStart()`, then a leading `=> ` only |
| `resolveActiveFocusedFile` (write_note, append_note, prepend, patch_block, patch_heading, find_and_replace active note; read/outline/move/rename in active mode through `_file-target.ts`) | `parseEvalStdout` | same |
| `parseFocusedVault` (find_and_replace and query_base `defaultInvokeEval`) | `parseEvalStdout`, then a second `JSON.parse` if the result is a string | same |
| find_by_property, read_heading, paths, tag, pattern_search, smart_connections_similar | inline at `handler.ts:42–62` | `trimStart()` / `startsWith("=> ")` at the head only |
| set_property (active mode) | its own `parseEvalResponse` `set_property/handler.ts:63` | same |
| smart_connections_query | inline `handler.ts:50–59` | **`lastIndexOf("\n=> ")`**, then a leading `=> `, then the whole stdout (research R14 of its spec) |
| `_note-io.invalidateMetadataCache` | `_note-io.ts:105` | `.trim()` then `=== "=> ok"` / `=== "=> missing"`; logs on anything else |
| `_note-io.openNote` | stdout ignored | — |

A single plugin line ahead of the answer breaks every row except smart_connections_query. Every parser also falls back to parsing the whole stdout when no `=> ` prefix is present (pinned by `_active-file.test.ts:69–71`). The one existing test with noise ahead of an answer is `_note-io.test.ts:204` (`[error] {}\n=> ok…`), and it expects the failure.

### F2 — Every eval answer is one line

Every template returns `JSON.stringify(...)` (single line: `JSON.stringify` escapes `\n` and `\r`) or a bare word (`"ok"`, `"missing"`). `openNote`'s `openLinkText` result is ignored. Multi-line note text (read_heading's `content`) travels escaped inside the JSON. No typed template returns a value whose printed form spans lines. `JSON.stringify` leaves U+2028/U+2029 raw, so any line split must use `\n` only, not a regex `m` flag (in JavaScript, `^`/`$` with the `m` flag also match at U+2028/U+2029).

### F3 — The dispatch layer looks only at the head of stdout

In `dispatchOnce` (`src/cli-adapter/_dispatch.ts:326`), `onTerminal` computes `trimmedHead = stdout.trimStart()` (l.558):

- priority (b) maps `error: no active file` at the head to `ERR_NO_ACTIVE_FILE` (l.566);
- priority (c) maps `Error:` at the head to `CLI_REPORTED_ERROR` (l.581).

`COLD_START_PATTERN` (l.115) is anchored at the head: `/^\s*Error: Command "[^"]*" not found\./`. `isColdStart` (l.136) tests it against `details.stdout`. `details.command` is already on both errors (l.572, 587), so `isColdStart` can tell an eval failure apart without a new field.

`invokeCli`'s unknown-vault check (`cli-adapter.ts:104`) is head-anchored too.

### F4 — The two facades

- `invokeCli` is the typed-tool facade and every eval consumer's entry point.
- `invokeBoundedCli` (`invoke-bounded-cli.ts:51`) has exactly one production caller, `obsidian_exec`, which returns the raw `DispatchOutput`. Its `eval` is blocked unless `OBSIDIAN_MCP_ALLOW_EVAL` is set.
- Both facades reach `dispatchCli`, so the dispatch layer can apply a command-keyed rule to both, as the ADR-029 amendment requires.

### F5 — Error excerpts are inconsistent

| Site | `details.stdout` today |
|---|---|
| `decodeEvalEnvelope` | `slice(0, 500)` (json-parse, envelope-parse) |
| read_heading, paths, tag, pattern_search, smart_connections_query/similar | `slice(0, 500)` |
| find_and_replace `defaultInvokeEval`, query_base `defaultInvokeEval` | `slice(0, 500)` |
| set_property json-parse | `slice(0, 500)` |
| `resolveActiveFocusedFile` json-parse | **full** stdout |
| find_by_property json-parse, schema-parse, count-paths-mismatch | **full** stdout |
| `resolveActiveFocusedFile` envelope-parse, set_property envelope-parse | none (`parsed` only) |

No test pins the 500-character slice. `find_and_replace/handler.test.ts:878` asserts a short `details.stdout` verbatim, which is unaffected by any rule that keeps short output whole.

### F6 — Test stubs

The shared stubs `makeQueuedSpawn` and `makeStubSpawn` (`src/tools/_handler-test-fixtures.ts:88, 125`) answer from fixed responses but record argv. About 40 test files feed them inline `` `=> ${JSON.stringify(...)}\n` `` strings, about 357 marker occurrences in all. `_typed-result-fixtures.ts` (`evalOut`, l.74) and the per-tool `_handler-fixtures.ts` (`EVAL_OK`, `ACTIVE_EVAL`) use the same stubs.

Ad-hoc stubs:

- `_note-io.test.ts` (`recordingSpawn`)
- `_registration-stub.ts` (`makeRegistrationStubSpawn`, used by `_active-file.test.ts`, `find_by_property/index.test.ts`, `pattern_search/index.test.ts`)
- `_dispatch.test.ts`
- `cli-adapter.test.ts`

find_and_replace and query_base tests inject `deps.invokeEval` and skip stdout.

Tests that assert the exact `code=` argument:

- `get_active_file/handler.test.ts:76,193`
- `backlinks/handler.test.ts:685`, `links/handler.test.ts:616`, `smart_connections_query/handler.test.ts:572`, `smart_connections_similar/handler.test.ts:883`
- `_note-io.test.ts:226`, `write_note/handler.test.ts:447`
- prefix and suffix checks in paths, tag, read_heading, backlinks, links and both smart_connections tests

`write_note/handler.test.ts:550` caps the focused-file `code=` element at 250 characters. The bare template is about 135; the wrapper of D1 adds about 66.

### F7 — How the live test vault constrains testing

`TestVault-Obsidian-CLI-MCP` has no plugins (`.memory/test-execution-instructions.md`), so real plugin noise cannot be reproduced there. A `console.log` inside our own eval code reaches stdout the same way a plugin's does (smart_connections R14 observed plugin `console.log` lines on stdout). That is the live way to reproduce noise (quickstart §2).

## Decisions

### D1 — Per-call answer tag, added in `invokeCli`

> **Amended 2026-11-01 (PR #110 code-quality review; behaviour unchanged).** The tag now lives in a dedicated entry point in the same module, `invokeEval({ code, vault? }, deps)` in `src/cli-adapter/cli-adapter.ts`, rather than in an `eval` branch of `invokeCli`. Where D1–D3 below say `invokeCli` for a typed eval, read `invokeEval`. The differences from the text below:
>
> - `invokeEval` mints the tag, wraps the code and returns `{ stdout, stderr, answer: string | null }` (`null` when no line carried the tag). `vault` undefined means active mode, which is how every call site already paired the two, so every argv is byte-identical. `invokeCli` no longer wraps anything and returns `{ stdout, stderr }`. A test in `architecture.test.ts`, invariant (iii), fails on any `command: "eval"` literal outside `cli-adapter.ts`, so a tool still cannot forget the tag (FR-002).
> - The dispatch layer finds the answer once and returns it as `DispatchOutput.evalAnswer`. That field is set only when the input carried `answerTag`, so `invokeBoundedCli` (`obsidian_exec`) never has it and its output is unchanged (FR-012). `invokeEval` reads that field rather than scanning stdout again.
> - In dispatch, one helper (`inspectedLines`) decides which lines the (b), (c) and cold-start checks look at: every line for `eval`, otherwise the head as before. `findNoActiveFileLine` and `findErrorLine` are gone; their cases moved to `_dispatch.test.ts`.
> - `evalInVault` and `EvalResult` are deleted. `decodeEvalEnvelope` and `parseFocusedVault` take `Pick<InvokeEvalSuccess, "stdout" | "answer">`, and `parseEvalAnswer` takes `string | null`.
> - paths, read_heading, tag, smart_connections_query and smart_connections_similar decode through `decodeEvalEnvelope`. Their hand-written blocks had the same codes, messages and `details` as that decoder. find_by_property, pattern_search and set_property keep their own parse, because their stages, messages or key order differ.
> - Test stubs: the wrapper's fixed parts are taken from `wrapEvalCode` itself, and `_registration-stub.ts` reuses `renderStubStdout`. The noise hook is the scoped `withTaggedStdoutTransform(transform, run)`, which is cleared when `run` settles and cannot nest.

For `command === "eval"`, `invokeCli` mints `tag = "ocm-" + randomUUID()` and replaces `parameters.code` with

```text
(async()=>'<<TAG>>'+(await (CODE)))()
```

Obsidian then prints the call's own answer as `=> <<TAG>>` followed by the template's value. Plugins cannot know the tag, so a plugin line that looks like an answer never matches (FR-003).

- **Why `invokeCli`**: it is the one entry point every typed eval already uses (F1, F4). A tool cannot forget the tag (FR-002), the templates stay byte-identical, and `obsidian_exec` (through `invokeBoundedCli`) is left untagged, as the ruling says.
- **Why a prefix only**: every answer is one line (F2), so the answer body is the rest of the tagged line, and trailing lines from plugins are simply not part of it (FR-004). Text on the same line as the answer makes the body fail to parse, which gives the safe parse error the spec asks for (Edge Cases).
- **Wrapper safety**: the wrapper uses only single quotes, a UUID and the caller's code. No user input is interpolated, so the base64 anti-injection rule (R6) holds. `await` on a non-promise is a no-op, and string concatenation keeps the template's string value as printed today. The code must be a single expression, which every template and `_note-io` builder already is (F2).
- **Alternatives rejected**:
  - (a) Tag each template. That means 16+ edits, a tool can be missed, and every frozen template changes.
  - (b) A fixed, non-random sentinel. It does not meet the ruling's per-call tag.
  - (c) Last-`=> ` heuristic for all tools (smart_connections' R14). It returns a trailing look-alike, which breaks FR-003.
  - (d) A closing tag as well. Not needed while every answer is one line (F2); a multi-line answer would fail safely as a parse error.

### D2 — `invokeCli` returns the answer; dispatch classifies with the tag

- `DispatchInput` gains an optional `answerTag`. `invokeCli` sets it for eval; `invokeBoundedCli` never does.
- `InvokeCliSuccess` gains `answer?: string`: the body after `=> <<TAG>>` on the first tagged line. It is present only for eval when that line exists. `stdout` stays raw, because the error excerpts need it (FR-013).
- `DispatchOutput` is unchanged, so `obsidian_exec`'s published output cannot gain a field (FR-012).
- In `dispatchOnce`, for `command === "eval"` only:
  - If an answer line exists, the call succeeds and priorities (b) and (c) are skipped (FR-006). With a tag, an answer line is the tagged one. Without a tag (`obsidian_exec`), it is any line whose trimmed start is `=> `.
  - If there is no answer line, every line is scanned (split on `\n`, trailing `\r` dropped, leading whitespace trimmed). A line starting `error: no active file` (case-insensitive) gives `ERR_NO_ACTIVE_FILE`. Otherwise the first line starting `Error:` gives `CLI_REPORTED_ERROR`, with `details.message` set to that line (FR-007).
  - Errors keep today's codes, messages, and `details` keys, with the full stdout.
  - Every other command keeps the head-anchored code path, untouched (FR-008).
- `isColdStart` tests `COLD_START_PATTERN` against every line when `details.command === "eval"`, and against the head otherwise. The retry stays single, in `dispatchWithColdStartRetry`; the second attempt reuses the same input, so it carries the same tag.
- `invokeCli`'s `Vault not found.` check is skipped when an eval answer was found (an answer means the vault answered; FR-006). Otherwise it is unchanged.
- The line-scanning helpers live in a new module, `src/cli-adapter/_eval-answer.ts`, used by `_dispatch.ts` and `cli-adapter.ts`. Imports run cli-adapter-internal only.

### D3 — One shared parse and excerpt module for the tools: `src/tools/_eval-parse.ts`

- `parseEvalAnswer(answer: string | undefined): unknown` throws a `SyntaxError` when `answer` is `undefined` (no answer belonging to the call) and otherwise returns `JSON.parse(answer)`. Callers wrap the failure exactly as they wrap a JSON failure today: same code, `stage: "json-parse"`, same message. No new stage or sub-discriminator (FR-011).
- `parseEvalAnswer` replaces `parseEvalStdout` and the six inline strips, `set_property`'s `parseEvalResponse`, and smart_connections_query's last-marker extraction (FR-002).
- The whole-stdout fallback is dropped. Real eval output always carries the marker, so this changes nothing when there is no plugin output (FR-010). `_active-file.test.ts:69–71` is rewritten.
- `stdoutDetails(stdout): { stdout: string; stdoutLength: number }` applies the FR-013 rule:
  - output of 1,000 characters or fewer goes in whole;
  - longer output becomes the first 500 + `"\n[… cut …]\n"` + the last 500;
  - `stdoutLength` is `stdout.length`.
  - Characters are UTF-16 code units, matching today's `slice`.
- Every eval parse-failure site spreads `stdoutDetails(raw)` into `details` in place of its current `stdout` value. That covers json-parse, envelope-parse, schema-parse, count-paths-mismatch and focused-vault-resolve. The two sites that carry only `parsed` (`resolveActiveFocusedFile` and set_property envelope-parse) gain the excerpt and keep `parsed`.
- Error messages are unchanged.
- `_note-io.invalidateMetadataCache` compares `answer` to `"ok"` / `"missing"`. Its log `detail` stays the raw stdout's first 200 characters (a log, not an error; no new log event, FR-014).
- `evalInVault` returns `{ stdout, answer }`.
- `decodeEvalEnvelope` and `parseFocusedVault` take the `invokeCli` result, or `(answer, stdout)`, instead of a stdout string.

### D4 — Test stubs answer with the tag

- `makeQueuedSpawn` and `makeStubSpawn` read the tag from the recorded `code=` argument. When a response's `stdout` is a string, each line that starts with `=> ` becomes `=> <<TAG>>…`. That simulates Obsidian printing the call's answer, so the ~357 existing fixtures pass unchanged (spec SC-006).
- A response's `stdout` may also be a function `(ctx: { answerTag?: string }) => string`, so noise and look-alike tests write the exact bytes, including untagged `=> ` lines.
- The four ad-hoc stubs (F6) get the same treatment, and a shared `answerLine(tag, body)` helper is exported for tests.
- Exact-`code=` assertions (F6) compare against the unwrapped code through a test helper `unwrapEvalCode`.
- `write_note/handler.test.ts:550` still holds: about 135 + 66 ≤ 250. It is re-measured in T0.

### D5 — The plugin-noise matrix test

A new `src/tools/_plugin-noise.test.ts` runs every eval-composed tool's typed-result fixture (`TYPED_RESULT_FIXTURES`) through its registered handler, once for each noise variant in contract §3 (N1–N13). It asserts:

- the result is identical to the no-noise result (FR-001, FR-002, SC-001, SC-002);
- the tool's own answer wins over look-alikes (FR-003, SC-004);
- genuine failures give the parse error with the FR-013 excerpt (FR-005, SC-005).

Co-located unit tests cover the two new modules, the dispatch rules and `invokeCli`.

### D6 — T0 live probes (implementation phase, test vault only)

1. **P1**: a wrapped template prints `=> <<TAG>>{json}` on one line, so the string value prints raw. This also settles the `parseFocusedVault` "double-encoded" note (`_active-file.ts:130`); the double decode is kept, since it accepts both forms.
2. **P2**: `console.log('noise')` inside eval code appears on stdout ahead of the answer line, which is the live noise reproduction.
3. **P3**: a cold start of a wrapped eval on a closed test vault recovers through the single retry.
4. **P4**: the wrapped focused-file `code=` element stays at or under 250 characters.

If P1 shows the string value printed quoted, stop and escalate before writing code. D1's line shape would change.

### D7 — Docs

The `docs/tools/*.md` pages that document `json-parse` / `envelope-parse` details are:

- backlinks, find_by_property, get_active_file, links, open_file, paths, pattern_search, read_heading, smart_connections_query, smart_connections_similar, tag, write_note;
- plus outline, context_search, search and properties, where only the stage names are mentioned.

These pages gain the excerpt rule and `stdoutLength`, plus one sentence: output from other plugins around the answer is ignored.

`CHANGELOG.md [Unreleased]` gets an entry under **Fixed** for the plugin-noise tolerance and one under **Changed** for the excerpt rule. `.docs-as-code/` is updated by `/speckit-docs-as-code` after review.
