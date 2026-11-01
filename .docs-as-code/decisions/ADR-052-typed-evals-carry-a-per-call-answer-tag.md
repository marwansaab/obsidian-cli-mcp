# ADR-052 — Typed evals go through `invokeEval` and carry a per-call answer tag

- **Status:** Accepted
- **Date:** 2026-11-01
- **Source:** PR #110 (BI-0135, `specs/080-tolerate-plugin-noise/`, research
  F1 to F5 and D1 to D3 with its "Amended 2026-11-01" note, contract
  `contracts/eval-answer-contract.md`, T0 probes P1 to P4), commits `c5ac6ff`
  and `431ef50`
- **Related:** ADR-029 (Retry Once on Cold-Start Vault-Launch Failure), whose
  2026-11-01 amendment, the owner's ruling, requires a per-call tag for typed
  tools and any-line recognition for `eval` output; this record carries out
  that amendment and does not supersede it. ADR-004 (Centralized Obsidian CLI
  Adapter), whose adapter now owns the tag. ADR-015 (Sub-Discriminators via
  details.reason for Multi-State Error Codes): no code, `stage` or `reason`
  was added. ADR-014 (Plugin-Backed Typed Tools Runtime-Dependency Pattern):
  the Smart Connections templates are untouched.

## Context

`obsidian eval` prints the expression's value as one line starting `=> `.
Other Obsidian plugins print to the same stdout, before and after it. Every
eval-composed tool except `smart_connections_query` stripped `=> ` from the
head of stdout, so a single plugin line ahead of the answer turned a success
into a `json-parse` failure. `smart_connections_query` took the last `=> `
line instead (its research R14), which a plugin line printed after the answer
in `=> ` form would defeat. Every parser also fell back to parsing the whole
stdout when it found no `=> `. The dispatch layer's `Error:`, no-active-file
and cold-start checks read only the head of stdout, so plugin start-up lines
hid a cold start and the ADR-029 retry did not fire (research F1, F3).

Every typed template returns one line: `JSON.stringify` output or a bare
word (research F2). The T0 probes confirmed that a wrapped string value
prints unquoted (`=> <<ocm-probe>>{"a":1}`) and that `console.log` output
lands on stdout on its own line before the answer (P1, P2).

## Decision

1. **A tag minted for each call.** `invokeEval({ code, vault? }, deps)` in
   `src/cli-adapter/cli-adapter.ts` mints `"ocm-" + randomUUID()` and sends
   `(async()=>'<<TAG>>'+(await (CODE)))()` as the `code=` argument. The
   answer is the rest of the first stdout line that starts `=> <<TAG>>`.
   A plugin cannot know the tag, so no other line can be mistaken for the
   answer, whatever it prints and wherever it prints it. The tag is
   server-minted, so no user input enters the wrapper and the base64
   anti-injection rule (R6) holds.
2. **A separate entry point, not a branch in `invokeCli`.** As first built
   (`c5ac6ff`) the wrapping was an `eval` branch inside `invokeCli`, which
   gained an optional `answer`. The PR #110 code-quality review (finding F1,
   applied in `431ef50`) moved it into `invokeEval`, deleted `evalInVault`
   and `EvalResult`, and moved every hand-built
   `invokeCli({ command: "eval" })` site onto it with byte-identical argv.
   `invokeCli` no longer knows about eval answers. A third invariant in
   `src/cli-adapter/architecture.test.ts` fails the build on any
   `command: "eval"` literal outside `cli-adapter.ts`, so a tool cannot skip
   the tag (FR-002).
3. **Dispatch finds the answer once.** `dispatchOnce` scans `eval` output
   line by line. An answer line means success, ahead of the `Error:` and
   no-active-file checks; without one, those checks and `isColdStart` read
   every line. Other commands keep the head-anchored rules. The answer found
   is returned as `DispatchOutput.evalAnswer` only when the input carried a
   tag (review finding F2), so `invokeEval` does not scan stdout again and
   `obsidian_exec`'s output never gains the field.
4. **`obsidian_exec` stays untagged.** Its code is sent as given; for an
   untagged eval any `=> ` line is the answer (ADR-029 amendment, FR-012).
5. **One parse and one excerpt for the cohort.** `parseEvalAnswer` in
   `src/tools/_eval-parse.ts` JSON-parses the answer and treats a missing
   one as invalid JSON, so existing codes, stages and messages carry the
   failure. `stdoutDetails` gives every eval parse error the same
   `details.stdout` (whole up to 1,000 characters, otherwise first and last
   500 around a `[… cut …]` line) and `details.stdoutLength` (FR-013).
   The whole-stdout fallback is dropped.

## Alternatives rejected

- **Tag each template.** More than sixteen frozen templates would change, and
  a tool could be missed. Wrapping in the adapter leaves the templates
  byte-identical (research D1 (a)).
- **A fixed sentinel.** A constant marker is knowable by a plugin and does
  not meet the amendment's per-call tag (D1 (b)).
- **The last `=> ` line for every tool**, extending `smart_connections_query`'s
  rule. It returns a look-alike printed after the answer, which breaks FR-003
  (D1 (c)).
- **A closing tag.** Not needed while every answer is one line; text after
  the answer on the same line already fails safely as a parse error (D1 (d)).
- **The tag inside `invokeCli`**, the first implementation. It put an
  eval-only branch and an optional result field on the generic typed-tool
  facade, and the facade searched for the tagged line a second time after
  dispatch had already found it. Review argued the PR out of it; behaviour
  and every published byte stayed the same, and the fingerprint baseline did
  not move.

## Consequences

- Output from other plugins around an eval answer no longer changes a typed
  tool's result, and a cold start behind plugin start-up lines is retried
  once, as on a vault without plugins.
- Stdout that is bare JSON with no answer line is now a `json-parse` error.
  The CLI always prints the answer line, so only test fixtures relied on the
  fallback; five such tests now expect the error (FR-010, SC-006).
- The tag is visible where an error already echoes argv or raw stdout: a
  typed eval's `details.argv` shows the wrapped `code=`, and raw
  `details.stdout` shows `=> <<TAG>>` (FR-010 (b)). The tag carries no secret
  and is never logged.
- The wrapper adds about 66 characters to each `code=` argument. The
  focused-file template measured 204 characters wrapped, under the 250 that
  `write_note`'s test allows (P4).
- A future template must stay a single expression that returns one line.
  `_plugin-noise.test.ts` parses every template inside the wrapper, and a
  multi-line answer would fail as a parse error rather than be misread.
- Test spawn stubs must tag their `=> ` lines the way Obsidian would; the
  shared stubs in `_handler-test-fixtures.ts` and `_registration-stub.ts` do
  it, and a new ad-hoc stub has to do the same.
- The P3 probe (a live cold start behind plugin lines) was not run: closing
  the test vault needs the GUI. It is covered by `_dispatch.test.ts` and an
  `open_file` handler test only.
