# Contract: Eval output reading and classification

**Feature**: [../spec.md](../spec.md) | **Model**: [../data-model.md](../data-model.md) | **Authority for §2**: ADR-029 amendment of 2026-11-01 | **Authority for the tag rule**: owner's analyze-time ruling of 2026-11-01 (research D1)

This contract is internal: it fixes the behaviour the tests must pin. It changes no published tool surface (§5).

## Notation

- `⏎` is a newline.
- `T` is the call's answer tag, `obsidian-cli-mcp:<nonce>:`.
- `T'` is a different tag, for example a tag from another call.
- `{A}` is the capability's real answer JSON.
- `{L}` is a look-alike JSON that also passes the capability's schema.

## §1: Answer location (`findTaggedEvalAnswer`, every affected capability)

| # | Output | `evalAnswer` | Result |
|---|--------|--------------|--------|
| A1 | `=> T{A}` | `{A}` | normal |
| A2 | `Found and returned 3 smart_blocks.⏎[warn] x⏎=> T{A}` | `{A}` | normal |
| A3 | `=> T{A}⏎plugin: done` | `{A}` | normal |
| A4 | `p1⏎=> T{A}⏎p2` | `{A}` | normal |
| A5 | `=> {L}⏎=> T{A}` (look-alike **before**) | `{A}` | **real answer's result** |
| A6 | `=> T{A}⏎=> {L}` (look-alike **after**) | `{A}` | **real answer's result** |
| A7 | `=> {L}⏎=> T{A}⏎=> {L}` (both) | `{A}` | real answer's result |
| A8 | `=> T'{L}⏎=> T{A}` (another call's tag) | `{A}` | real answer's result |
| A9 | `=> "T{A-escaped}"` (quoted form) | `{A}` | normal |
| A10 | `=> T{A}\r⏎` | `{A}` | normal |
| A11 | `=> T{A}⏎=> T{A}` (identical repeat) | `{A}` | normal |
| A12 | `=> T{A}⏎=> T{B}` (conflicting tagged lines) | `null` | parse failure, stage `json-parse`, raw output (§3) |
| A13 | `p1⏎=> {L}` (look-alike only, no tagged line) | `null` | parse failure, stage `json-parse`, raw output; **never** the look-alike's result |
| A14 | `p1⏎p2` (no marker at all) | `null` | parse failure, stage `json-parse`, raw output |
| A15 | `=> T not json` | `" not json"` | parse failure, stage `json-parse`, raw output |

The same table holds for every capability in spec Context, through `invokeCli` → `evalAnswer` → `parseEvalAnswer`. It also holds for the post-write metadata refresh, which checks `evalAnswer === "ok"`.

## §2: Eval-only error recognition in dispatch (exit 0)

| # | Facade / command | Output | Classification |
|---|------------------|--------|----------------|
| E1 | `invokeCli` `eval` | `p1⏎Error: Command "eval" not found. It may require a plugin to be enabled.` | `CLI_REPORTED_ERROR`, then **one** retry; the retry's outcome is final |
| E2 | `invokeCli` `eval` | the E1 output on both attempts | `CLI_REPORTED_ERROR` from attempt 2; no third attempt |
| E3 | `invokeCli` `eval` | `p1⏎Error: No active file.` | `ERR_NO_ACTIVE_FILE`, with `details.message: "Error: No active file."` |
| E4 | `invokeCli` `eval` | `p1⏎Error: boom` | `CLI_REPORTED_ERROR`, with `details.message: "Error: boom"` and `details.stdout` the full output |
| E5 | `invokeCli` `eval` | `Error: plugin says hi⏎=> T{A}` | success (the tagged answer wins) |
| E5b | `invokeCli` `eval` | `=> {L}⏎Error: Command "eval" not found. …` | `CLI_REPORTED_ERROR`, then **one** retry (the look-alike is not an answer) |
| E6 | `invokeCli` `eval` | `Error: Command "eval" not found. …` (no plugin lines) | as today: `CLI_REPORTED_ERROR`, then one retry |
| E7 | any non-eval command | `p1⏎Error: boom` | success, verbatim stdout (unchanged) |
| E8 | any non-eval command | `Error: boom` | `CLI_REPORTED_ERROR` (unchanged) |
| E9 | `invokeBoundedCli` `eval` (no tag) | `p1⏎Error: boom` / `p1⏎Error: Command "eval" not found. …` / `Error: x⏎=> {…}` | `CLI_REPORTED_ERROR` / one retry / success with verbatim stdout |

## §3: Raw output on a parse failure

- `details.stdout` and the error message are unchanged at every site.
- At bounded sites (500 characters), when the output is longer than 500 characters, `details.stdoutTail = stdout.slice(-500)` is added. At 500 characters or fewer it is absent.
- Sites that already attach the full output (`find_by_property`, `resolveActiveFocusedFile`) never add `stdoutTail`.

## §4: Frozen

- Every `UpstreamError.code`, `details.stage`, `details.reason` and message string.
- `COLD_START_PATTERN`'s value and its use for non-eval commands.
- `APP_NOT_RUNNING_PATTERN`.
- `invokeCli`'s `Vault not found.` check.
- `invokeBoundedCli` (no wrap, no tag).
- **Every eval template's text** (`_template.ts`, `FOCUSED_FILE_TEMPLATE`, `FOCUSED_VAULT_TEMPLATE`, the `_note-io.ts` templates). `wrapEvalCode` embeds each one verbatim.
- All published tool text and schemas.

## §5: Surface delta

- **Published**: none. No tool, parameter, description, schema, output field or error code is added or changed, and `_register-baseline.json` does not move.
- **Internal**:
  - the `code=` argv value of typed eval calls becomes `wrapEvalCode(template, T)`;
  - `InvokeCliSuccess` gains `evalAnswer?: string | null`;
  - `DispatchInput` gains `evalAnswerTag?: string`;
  - `InvokeCliDeps` gains the test seam `evalNonce?: () => string`;
  - error `details` gain the optional `stdoutTail`.
