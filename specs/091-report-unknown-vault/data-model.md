# Data Model: Report unknown vault

**Spec**: [spec.md](spec.md) · **Research**: [research.md](research.md)

There is no stored data. The "entities" are the values one `obsidian_exec` call carries and the classification its result goes through.

## E1 — The raw call (input, unchanged)

The `obsidian_exec` input as the schema parses it (`src/tools/obsidian_exec/schema.ts`, unchanged):

| Field | Role in this feature |
|---|---|
| `command` | Reported as `details.command`. Never inspected by the new check. The blocked-command gate runs first and is unchanged. |
| `vault` | **The only field that "names a vault"** (research F2). When it is absent, the check does not apply. |
| `parameters` | Not inspected. A `vault` key here does not name a vault: the CLI ignores a `vault=` token after the command (research P7). |
| `flags`, `copy`, `timeoutMs` | Not inspected. |

## E2 — The dispatch result (unchanged)

`DispatchOutput` from `dispatchCli`: `{ stdout, stderr, exitCode: 0, argv }`. Only a call that dispatch resolved as success reaches the new check. A call that dispatch rejected (non-zero exit, `Error:` answer, no-active-file answer, timeout, oversize output, missing binary, cancellation) never reaches it.

## E3 — The unknown-vault answer (recognised, new)

A dispatch result is the unknown-vault answer when both of these hold:

1. the call named a vault (`E1.vault !== undefined`); and
2. `E2.stdout.trim() === "Vault not found."` (`UNKNOWN_VAULT_ANSWER`, exported by `_dispatch.ts` and shared with the typed facade's start-of-output rule; PR #124 review).

Live form: `"Vault not found.\n"`, stderr `""`, exit 0, for every command (research F1).

"Surrounding whitespace" means whatever `String.prototype.trim()` removes (every ECMAScript whitespace and line-terminator character, BOM included). The match itself stays exact: after trimming, the text must be the sentence `Vault not found.` and nothing else. The CLI's answer is the ASCII `Vault not found.\n`, so the broader trim only admits more padded forms of the same sentence (analyze A1, consistent with Clarification Q1).

| stdout (JSON-escaped) | `vault` set? | Recognised? |
|---|---|---|
| `"Vault not found.\n"` | yes | **yes** |
| `"\r\n  Vault not found.\r\n\n"` | yes | **yes** |
| `"Vault not found."` (no line break) | yes | **yes** |
| `"Vault not found.\n"` | no | no — focused vault |
| `"Vault not found.\nmore text\n"` | yes | no |
| `"Result: Vault not found. here\n"` | yes | no |
| `"first line\nVault not found.\n"` | yes | no |
| `"vault not found.\n"` / `"Vault not found\n"` | yes | no — different spelling |
| `"Vault not found.\n=> 2\n"` (eval) | yes | no — the answer line means the code ran (research F6) |

## E4 — The vault-not-found error (new construction site, existing code)

The error `invokeBoundedCli` throws for a recognised answer:

```text
UpstreamError {
  code:    "CLI_REPORTED_ERROR"
  message: "Vault not found."
  cause:   null
  details: {
    argv:     E2.argv          // dispatch's argv, binary included
    command:  E1.command
    stdout:   E2.stdout        // verbatim, untrimmed
    stderr:   E2.stderr        // verbatim
    exitCode: 0
    message:  "Vault not found."
  }
}
```

**Parity with the dedicated tools** (FR-002, SC-002): `code`, `message` and `details.message` are identical to the error `runTyped` throws for the same stdout. The raw error also carries `details.argv`, which the raw tool includes on every reported failure (FR-003). `details` key order follows dispatch's priority-(c) error (research F7).

On the wire, `registerTool` returns the error as an `isError: true` result whose text is the usual `{ code, message, details }` envelope (unchanged code path).

## Invariants

- **V1 — named vault only.** A call without `vault` is never failed by the check (FR-001, SC-003).
- **V2 — exact answer only.** Any stdout other than the bare sentence after trimming resolves unchanged, with `stdout`, `stderr`, `exitCode` and `argv` byte-identical to today (FR-004, SC-003).
- **V3 — after dispatch.** The check runs only on a dispatch success, so every other classification, and its precedence, is unchanged (FR-006). It sits outside the cold-start retry and the auto-launch recovery, so it adds no spawn and no launch (FR-007). The call spawns exactly once.
- **V4 — no new code.** The error uses the existing `CLI_REPORTED_ERROR` code. `src/errors.ts` is unchanged (spec Assumption, Principle IV).
- **V5 — typed facade untouched.** `runTyped`'s rule and every dedicated tool's behaviour are unchanged (FR-008). Its literal now comes from `_dispatch.ts`'s `UNKNOWN_VAULT_ANSWER` instead of the private `UNKNOWN_VAULT_PREFIX` (PR #124 review).

## Per-call flow

```text
obsidian_exec tools/call
  → registerTool: schema parse (unchanged)
  → executeObsidianExec: blocked-command gate (unchanged; may throw COMMAND_BLOCKED, no spawn)
  → invokeBoundedCli
      → queue.run
          → dispatchCli (unchanged: spawn, cold-start retry, auto-launch, priorities a–d)
              rejects → propagated unchanged
              resolves → out
          → NEW: if input.vault !== undefined && out.stdout.trim() === "Vault not found."
                   throw E4
          → return out (unchanged)
  → registerTool: UpstreamError → isError result (unchanged)
```
