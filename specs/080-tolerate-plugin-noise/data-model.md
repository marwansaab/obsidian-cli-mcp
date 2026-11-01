# Data Model: Tolerate plugin noise

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

This feature adds no persisted data, schema field or published shape. The model below describes the transient values one eval call produces and the rules that classify them (research D1, D2, D5).

## Entities

### E0: Answer tag (per call)

`obsidian-cli-mcp:<nonce>:`, where `<nonce>` is `crypto.randomUUID()` for each `invokeCli` call. Tests inject it through `deps.evalNonce`.

- Created by `invokeCli` for `command === "eval"` only.
- Sent to Obsidian inside the wrapped `code=` value (`wrapEvalCode`).
- Passed to dispatch as `DispatchInput.evalAnswerTag`.
- Never returned to the agent and never logged.

`invokeBoundedCli` (`obsidian_exec`) creates no tag.

### E1: Eval command output

The `stdout` of one attempt, split on `\n`, with one trailing `\r` per line ignored.

| Line kind | Recognised by |
|-----------|---------------|
| **Tagged answer line** | `trimStart()` starts with `=> `, and the rest starts with the call's tag (raw form), or with `"` + tag where `JSON.parse` of the rest is a string that starts with the tag (quoted form) |
| **Untagged marker line** | `trimStart()` starts with `=> `, but it is not a tagged answer line for this call. This covers look-alikes, lines with another tag, and `obsidian_exec` answers. |
| **Reported-error line** | `trimStart()` starts with `Error:` |
| **Plugin line** | anything else, including blank lines |

### E2: Answer (`evalAnswer`)

| Situation | `evalAnswer` |
|-----------|--------------|
| exactly one tagged answer line, or several that all yield the same text | the text after the tag (decoded first in the quoted form) |
| several tagged answer lines yielding different text | `null` |
| no tagged answer line | `null` |
| non-eval call | `undefined` |

Untagged marker lines **never** contribute to `evalAnswer`, wherever they appear (FR-003, FR-004).

### E3: Recognised error (eval only, no answer)

Considered only when the answer test of research D2 step 1 fails:

- with a tag: `findTaggedEvalAnswer(...) === null`;
- without a tag: no line starts with `=> `.

The **last** reported-error line decides:

| Line, lower-cased | Result | `details.message` |
|-------------------|--------|-------------------|
| starts with `error: no active file` | `ERR_NO_ACTIVE_FILE` | the line |
| matches `COLD_START_LINE_PATTERN` | `CLI_REPORTED_ERROR`, then exactly one ADR-029 retry | the line |
| any other `Error:` line | `CLI_REPORTED_ERROR` | the line |

The other `details` keys are as today: `argv`, `command`, `stdout` (the full output), `stderr`, `exitCode: 0`, `message`.

### E4: Raw output on a parse failure

| Key | Present when | Value |
|-----|--------------|-------|
| `stdout` | always, as today | `stdout.slice(0, 500)` at bounded sites; the full output for `find_by_property` and `resolveActiveFocusedFile` |
| `stdoutTail` | bounded site **and** `stdout.length > 500` | `stdout.slice(-500)` |

Codes, `details.stage` values and messages are unchanged at every site.

## Classification order (one eval attempt, exit 0)

1. Is there an answer (E2 not `null`, or with no tag the untagged answer test of research D2 step 1)? If yes, success, and the handler parses `evalAnswer`.
2. If not, is there a reported-error line? If yes, apply E3.
3. If neither, success. `evalAnswer` is `null`, so the handler's parse fails with E4.

Exit-code, timeout, output-cap and cancellation classification run first and are unchanged. Non-eval commands skip steps 1–3 and use today's start-anchored priorities (b), (c) and (d).

## Invariants

- **I1**: Output with no plugin lines yields the same result and error as today. The only addition is the `stdoutTail` key past 500 characters (FR-008).
  - Contract §2 row E5, an `Error:` line followed by the tagged answer, is a success where the start-anchored rule would have reported an error. It can only arise when a line other than Obsidian's answer is present, that is, plugin output, so it never changes a call without plugin output.
  - The argv `code=` value of typed eval calls changes (it is wrapped); that is not a result.
- **I2**: An untagged marker line never becomes the answer, in any position (FR-003).
- **I3**: No part of a result is built from any line other than the tagged answer line (FR-004).
- **I4**: At most one cold-start retry per `dispatchWithColdStartRetry` call (FR-011, SC-007).
- **I5**: No new `UpstreamError.code`, `details.reason` or `details.stage` value (FR-013).
- **I6**: The rules name no plugin and read no per-plugin setting (FR-006).
- **I7**: Non-eval commands are classified byte-identically to today (FR-012). `obsidian_exec` code and success output are unchanged (research D3).
