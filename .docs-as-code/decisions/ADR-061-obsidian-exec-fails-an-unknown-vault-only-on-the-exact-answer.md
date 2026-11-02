# ADR-061 — `obsidian_exec` fails an unknown vault only on the CLI's exact answer to a named vault

- **Status:** Accepted
- **Date:** 2026-11-02
- **Source:** PR #124 (`specs/091-report-unknown-vault/`, BI-0173,
  FR-001 to FR-009, Clarification Q1, research F1 to F6 and D1 to D6),
  commits `d34cfb6` (the check) and `eb0b509` (the PR #124 code-quality
  review's sharing of the literal and the details builder)
- **Related:** ADR-029 (the cold-start retry), which the check sits
  outside; ADR-015 (Sub-Discriminators via details.reason for Multi-State
  Error Codes), under which no sub-discriminator was needed;
  [ADR-052](ADR-052-typed-evals-carry-a-per-call-answer-tag.md), whose
  untagged `obsidian_exec` `eval` keeps its `=> ` answer rule.

## Context

The Obsidian CLI answers every command for a vault it does not know with
`Vault not found.` on stdout, exit 0 and empty stderr (research F1, from T0
probes of `files`, `version`, `help`, `vaults`, `eval` and an unknown
command). The typed-tool facade's `runTyped` has turned that answer into
`CLI_REPORTED_ERROR` since BI 011, using a start-of-output match. The raw
facade `invokeBoundedCli`, which only `obsidian_exec` calls, had no such
check (F3, F4), so a mistyped vault name returned a success whose `stdout`
was the error.

Unlike the typed tools, `obsidian_exec` returns raw note and search output.
A known vault's note whose first line is `Vault not found.` is legitimate
output, and the spec's third story forbids failing it.

## Decision

1. **Fail only when the call names a vault and the whole stdout, trimmed, is
   exactly `Vault not found.`** (D2, Clarification Q1 option C). `trim()`
   removes the `\r` of CRLF output. stderr is not read.
2. **Check in the raw facade, inside `queue.run`, after `dispatchCli`
   resolves** (D1), as `runTyped` places its check. That keeps it outside the
   ADR-029 cold-start retry and the auto-launch recovery: an unknown vault
   spawns once and never launches Obsidian (FR-007, F5).
3. **Report it as the typed tools do** (D3). `CLI_REPORTED_ERROR`, `cause:
   null`, `message` and `details.message` both `Vault not found.`, so an agent
   can handle both surfaces with one check (FR-002). `details` keeps the raw
   tool's usual exit-0 shape, `{ argv, command, stdout, stderr, exitCode,
   message }`, with `stdout` untrimmed. No new code; `src/errors.ts` is
   unchanged.
4. **One literal, two rules** (D4 as amended by review). `UNKNOWN_VAULT_ANSWER`
   lives in `src/cli-adapter/_dispatch.ts`, which both facades already import,
   beside a new `exitZeroDetails` builder that dispatch's priorities (b) and
   (c) and the raw facade share. Dispatch itself does not classify the
   answer; each facade applies its own rule after dispatch returns.

## Alternatives rejected

- **The typed tools' rule on every call** (Clarification Q1, option A).
  Fails a known vault's note or search output that starts with the
  sentence, and a focused-vault call, which can never get the real answer.
- **The typed tools' rule, only when a vault is named** (option B, the
  question's recommendation). Still fails a note whose first line is the
  sentence. The owner chose C: every recorded unknown-vault answer is exactly
  `Vault not found.\n`, so the stricter rule loses nothing.
- **Tightening the typed tools to the same rule.** Out of scope (FR-008);
  `runTyped` keeps its start-of-output match, now reading the shared literal.
- **A private `UNKNOWN_VAULT_ANSWER` in `invoke-bounded-cli.ts`.** That was
  the plan's D4 and the first implementation, with a comment in each facade
  pointing at the other's constant. The PR #124 code-quality review moved the
  literal to `_dispatch.ts` and replaced the hand-copied details object with
  `exitZeroDetails`, so the shape holds by construction. Behaviour, codes,
  messages and `details` key order are byte-identical. The PR body's D4 line
  still describes the private constant; the code is as above.
- **Classifying in dispatch.** It would bring the answer inside the cold-start
  retry and the launch recovery, and force one rule on both facades.

## Consequences

- `OBSIDIAN_EXEC_DESCRIPTION` lists `unknown vault` among its structured
  failures, so `obsidian_exec`'s `descriptionFingerprint` in
  `_register-baseline.json` moved on purpose (FR-009).
- A call without `vault`, or with `vault=` passed inside `parameters` (which
  the CLI ignores after the command, F2), is never failed this way.
- An `obsidian_exec` `eval` whose output has a `=> ` answer is unaffected,
  because its stdout is not exactly the sentence (FR-005).
- The two facades now share three things from `_dispatch.ts` (dispatch, the
  literal, the details builder) and still import nothing from each other.
- Other unprefixed CLI messages are still returned as raw successes by
  `obsidian_exec`; reclassifying them is out of scope.
