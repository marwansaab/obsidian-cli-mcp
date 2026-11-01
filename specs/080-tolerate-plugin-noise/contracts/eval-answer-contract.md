# Contract: Eval answer recognition and parse-error excerpts

**Feature**: [../spec.md](../spec.md) | **Research**: [../research.md](../research.md) (D1–D5)

The contract binds every typed tool that runs `obsidian eval`. It also covers the dispatch-layer rules shared with `obsidian_exec` when that tool runs `eval`. "Line" means a segment of stdout split on `\n`, with one trailing `\r` removed. Matching a line ignores its leading whitespace.

## §1 Answer recognition

| Rule | Typed tool (`invokeCli`, tagged) | `obsidian_exec` (`invokeBoundedCli`, untagged) |
|---|---|---|
| A1 The code that is sent | `(async()=>'<<TAG>>'+(await (CODE)))()`, where `TAG = "ocm-" + randomUUID()`, minted per `invokeCli` call | `CODE` exactly as the caller gave it |
| A2 Answer line | the first line that starts with `=> <<TAG>>` | any line that starts with `=> ` |
| A3 Answer body | the rest of that line after `=> <<TAG>>`, returned as `answer` | not extracted; stdout is returned raw |
| A4 No answer line | `answer` is absent; the tool raises its parse error (§4) | stdout is returned raw |
| A5 Look-alikes | `=> ` lines without this call's tag are ignored wherever they appear | n/a |

The cold-start retry re-sends the same input, so both attempts carry the same tag (A1).

## §2 Dispatch classification (exit code 0)

| Rule | `command === "eval"` | Any other command |
|---|---|---|
| C1 An answer line exists (A2) | success; no error line is considered | n/a |
| C2 No answer, and some line starts `error: no active file` (case-insensitive) | `ERR_NO_ACTIVE_FILE`, `details.message` = that line | only when it is the head (unchanged) |
| C3 No answer, and some line starts `Error:` | `CLI_REPORTED_ERROR`, `details.message` = the first such line | only when it is the head (unchanged) |
| C4 Cold start | `isColdStart` matches `Error: Command "…" not found.` at the start of **any** line, then retries exactly once | the head only (unchanged) |
| C5 `Vault not found.` (`invokeCli`) | skipped when an answer was found; otherwise the head only (unchanged) | the head only (unchanged) |

- C2 is checked before C3, as priority (b) is checked before (c) today.
- The `details` keys, codes and messages of C2 and C3 are the same as today, and `details.stdout` is the full stdout.
- Non-zero exit, timeout, cap and cancel take precedence exactly as today.

## §3 Noise matrix (each eval-composed tool, through its registered handler)

`ANS` is the fixture's real answer line `=> <<TAG>>{…}`. `LA` is a look-alike `=> {…}` whose body is valid for the same tool but different from the real one.

| # | stdout | Expected |
|---|---|---|
| N1 | `ANS` | the baseline result |
| N2 | `noise\nANS` | the baseline result |
| N3 | `n1\n\n[warn] n2\nError: plugin says no\nANS` | the baseline result (C1 overrides C3) |
| N4 | `ANS\nnoise` | the baseline result |
| N5 | `LA\nANS` | the baseline result, never the look-alike's data |
| N6 | `ANS\nLA` | the baseline result |
| N7 | `noise\r\nANS\r\n` | the baseline result |
| N8 | `noise\nLA` (no tagged line) | the tool's parse error, `stage: "json-parse"`, with the §4 excerpt |
| N9 | `noise only` | the tool's parse error, with the §4 excerpt |
| N10 | `noise=> <<TAG>>{…}` (same line) | the tool's parse error (A2 does not match) |
| N11 | `noise\n=> <<TAG>>not json` | the tool's parse error, with the §4 excerpt |
| N12 | `noise\n` + `ANS` carrying the tool's `ok:false` envelope | the tool's normal typed error, not a parse error |
| N13 | `noise\n` + `ANS` carrying the tool's zero/empty success envelope (`count: 0`, empty list, or `null` where `null` is a valid success) + `\nnoise` | the zero result, exactly as without noise; never confused with "no answer" (spec Edge Cases) |

Dispatch-level cases, in the `_dispatch.test.ts` unit tests:

| # | Case | Expected |
|---|---|---|
| D1 | eval: `noise\nError: Command "eval" not found. It may require a plugin to be enabled.` on attempt 1, then `ANS` on attempt 2 | success after exactly one retry; one `dispatch.retry` log |
| D2 | eval: `noise\nError: No active file.` | `ERR_NO_ACTIVE_FILE` |
| D3 | eval: `noise\nError: something` | `CLI_REPORTED_ERROR`, message `Error: something` |
| D4 | `read` (not eval): `noise\nError: Command "read" not found.` | success with raw stdout; no retry (unchanged) |
| D5 | untagged eval (exec): `Error: plugin\n=> 42` | success, raw stdout |
| D6 | tagged eval: `Error: plugin\n=> 42` (untagged answer only) | `CLI_REPORTED_ERROR` (no answer belongs to the call) |

## §4 Parse-error excerpt (FR-013)

Every eval parse-failure `UpstreamError` sets these two `details` keys. Its code, `stage` and other `details` are unchanged:

- `details.stdout`: the raw stdout if it is ≤ 1,000 characters; otherwise its first 500 characters, then `"\n[… cut …]\n"`, then its last 500 characters.
- `details.stdoutLength`: the raw stdout's length in characters (UTF-16 code units).

| # | Raw stdout length | `details.stdout` |
|---|---|---|
| E1 | 0 | `""`, `stdoutLength: 0` |
| E2 | 1,000 | whole, no marker |
| E3 | 1,001 | head 500 + marker + tail 500 |
| E4 | 2,000,000 (noise) | head 500 + marker + tail 500; the tail shows the expected answer region |
| E5 | under 1,000, at a site that today carries only `parsed` | the whole stdout plus `stdoutLength`; `parsed` is kept |

The sites are listed in research F5: every json-parse, envelope-parse, schema-parse, count-paths-mismatch and focused-vault-resolve site in the cohort.

## §5 Unchanged

- Tool names, input schemas, output schemas, descriptions, annotations, and the `_register-baseline.json` fingerprints.
- Results, and every error code, `stage` and message, when no plugin output is present. There are two exceptions (spec FR-010):
  - §4's two keys on parse errors;
  - for a typed eval, the A1 wrapper (with its tag) appears in the `code=` element of `details.argv` on every dispatch error that carries `argv` (`CLI_TIMEOUT`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`), and `=> <<TAG>>` appears in any raw `details.stdout`/`partialStdout`.

  No `details` key is added or removed by the wrapper. `unwrapEvalCode` recovers the original code.
- `obsidian_exec`'s output shape and raw stdout, and its `eval` gate.
- Log events: none added (FR-014). `metadataRefreshFailed.detail` stays the raw stdout's first 200 characters.
- Non-eval commands' classification.
- `UpstreamError`, `src/errors.ts`, `createLogger`, `createQueue`, `createServer`.
