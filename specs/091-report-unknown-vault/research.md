# Research: Report unknown vault

**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **HEAD at research time**: `c632243`

The research covered two things: the code that classifies the editor's answers today, and live probes of the editor's answer to an unknown vault. No `NEEDS CLARIFICATION` remained in the Technical Context. The one point the spec left for the plan (whether a vault passed inside `parameters` counts as naming a vault) is settled by probe P7 below.

## T0 live probes

**Method**: `Obsidian.com` driven directly (per `.memory/test-execution-instructions.md`, never `Obsidian.exe`), with stdout and stderr captured separately through `Start-Process -RedirectStandardOutput/-RedirectStandardError`. Every probe was read-only. The unknown vault name was `NoSuchVault-091`, and the control used the authorised test vault `TestVault-Obsidian-CLI-MCP`. No file was written to any vault, so no clean-up was needed. Date: 2026-11-02.

| Probe | argv after the binary | Exit | stdout (JSON-escaped) | stderr |
|---|---|---|---|---|
| P1 | `vault=NoSuchVault-091 files` | 0 | `"Vault not found.\n"` | `""` |
| P2 | `vault=NoSuchVault-091 read path=Welcome.md` | 0 | `"Vault not found.\n"` | `""` |
| P3 | `vault=NoSuchVault-091 search query=x` | 0 | `"Vault not found.\n"` | `""` |
| P4 | `vault=NoSuchVault-091 version` | 0 | `"Vault not found.\n"` | `""` |
| P5 | `vault=NoSuchVault-091 help` | 0 | `"Vault not found.\n"` | `""` |
| P6 | `vault=NoSuchVault-091 vaults` | 0 | `"Vault not found.\n"` | `""` |
| P7 | `files vault=NoSuchVault-091` | 0 | the focused vault's file list (33,086 chars) | `""` |
| P8 | `vault=NoSuchVault-091 eval code=1+1` | 0 | `"Vault not found.\n"` | `""` |
| P9 | `vault=NoSuchVault-091 notacommand` | 0 | `"Vault not found.\n"` | `""` |
| P10 | `vault=NoSuchVault-091 tags` | 0 | `"Vault not found.\n"` | `""` |
| P11 (control) | `vault=TestVault-Obsidian-CLI-MCP files folder=Sandbox` | 0 | the Sandbox file list | `""` |

## Findings

- **F1 — one answer for every command.** Against an unknown vault, every command answers with exactly `Vault not found.\n` on stdout, empty stderr and exit 0 (P1–P6, P8–P10). That includes commands that never touch a vault (`version`, `help`, `vaults`), `eval`, and a command that does not exist (P9): the editor checks the vault before it looks at the command. This matches every recorded answer in BI-0173 and in Tool Notes ("Exit-code semantics"), and it confirms the spec's first Assumption against a live editor.
- **F2 — only the leading `vault=` token names a vault.** A `vault=` token placed after the command (P7, the shape `parameters: { vault: … }` produces) is not read as a vault. The command runs against the focused vault and returns real output. So, for FR-001, "the call names a vault" means the top-level `vault` field, the only input that `assembleArgv` (`src/cli-adapter/_dispatch.ts:246`) puts before the command. This is the same CLI rule refactor-decisions item 25 records for the `command` field.
- **F3 — the dedicated tools' check.** `runTyped` (`src/cli-adapter/cli-adapter.ts:133`), shared by `invokeCli` and `invokeEval`, runs inside `queue.run` after `dispatchCli` returns. It fails a call whose `stdout.trimStart()` starts with `Vault not found.` (`UNKNOWN_VAULT_PREFIX`, line 85), unless an eval's tagged answer was found. The resulting failure is `CLI_REPORTED_ERROR`, `cause: null`, `message` = the first line trimmed, and `details: { command, stdout, stderr, exitCode: 0, message }`.
- **F4 — the raw tool's path has no check.** `executeObsidianExec` (`src/tools/obsidian_exec/handler.ts:55`) calls `invokeBoundedCli` (`src/cli-adapter/invoke-bounded-cli.ts:51`), which returns `dispatchCli`'s output unchanged. Dispatch's own exit-0 checks (`_dispatch.ts`, priorities (b) and (c)) look only for `Error: no active file` and `Error:`, so `Vault not found.\n` resolves as success.
- **F5 — no retry and no launch for this answer.** `isColdStart` matches only `CLI_REPORTED_ERROR` errors whose stdout carries the `Error: Command "…" not found.` signature, and `isAppNotRunning` matches only `CLI_NON_ZERO_EXIT` with `reason: "obsidian-not-running"`. A check placed after `dispatchCli` returns is outside both layers, so FR-007 holds by placement. `_dispatch.test.ts:746` already pins `isColdStart(reported("\nVault not found.\n")) === false`.
- **F6 — eval answers are settled before the check.** For `eval`, dispatch resolves as soon as it finds any `=> ` line (the untagged rule for `obsidian_exec`, spec 080 C1). Output holding an answer line is never exactly `Vault not found.`, so FR-005 holds without an eval branch in the new check.
- **F7 — dispatch's reported-error shape.** Dispatch's priority (c) failure, the shape the raw tool already returns for an `Error:` answer, carries `details: { argv, command, stdout, stderr, exitCode: 0, message }` and does not set `message` (the default `CLI bridge upstream error: CLI_REPORTED_ERROR` applies). The new failure keeps that `details` key order for the raw tool (FR-003) and sets `message` explicitly to `Vault not found.` to match the dedicated tools (FR-002).
- **F8 — no existing test expects today's success.** No test under `src/tools/obsidian_exec/`, `src/cli-adapter/invoke-bounded-cli.test.ts` or the cross-tool suites stubs `Vault not found.` for `obsidian_exec` (grep at HEAD). `obsidian_exec` is untyped, so it is absent from `_typed-result-fixtures.ts` and the plugin-noise matrix. The change therefore needs no existing-test edit (refactor-decisions item 5).
- **F9 — published surface.** `OBSIDIAN_EXEC_DESCRIPTION` (`src/tools/obsidian_exec/index.ts:9`) lists the failures reported as structured errors. Adding the unknown vault to that list (FR-009) changes the `obsidian_exec` entry of `_register-baseline.json`, so the baseline is regenerated on purpose. `index.test.ts:46` asserts the description by identity and still passes. `docs/tools/obsidian_exec.md`'s error table has no unknown-vault row, and its `CLI_REPORTED_ERROR` row quotes an outdated example (`"Error: vault not found"`).

## Decisions

- **D1 — the check lives in `invokeBoundedCli`, after `dispatchCli`, inside `queue.run`.** This mirrors `runTyped`'s placement for the typed facade. The cli-adapter layer keeps ownership of classifying the editor's answers, `invokeBoundedCli` has a single production caller (`executeObsidianExec`), and the placement gives FR-007 by construction (F5).
  - *Alternative: in `executeObsidianExec`.* Rejected. The check would sit in the tool's handler, while every other exit-0 answer classification lives in `src/cli-adapter/`.
  - *Alternative: a new dispatch priority in `_dispatch.ts`.* Rejected. Dispatch is shared by both facades, so the typed tools would gain a second, stricter check next to `runTyped`'s (FR-008), and the cold-start predicate would see a new error kind.
- **D2 — the rule.** Fail when `input.vault !== undefined` and `out.stdout.trim() === "Vault not found."`. JavaScript's `trim()` removes spaces, tabs, `\r`, `\n` and a BOM, which covers the spec's "surrounding whitespace and blank lines". stderr is not inspected: the probes always show it empty, and the spec's rule is about standard output. The rule follows Clarification Q1 (option C).
  - *Alternative: reuse `runTyped`'s start-of-output prefix rule.* Rejected by the owner at clarify (Q1). It would fail a known vault's note whose first line is the sentence.
  - *Alternative: also treat `parameters.vault` as naming a vault.* Rejected by F2. The CLI ignores that token, so such a call runs against the focused vault and its output is real.
- **D3 — the failure shape.** The failure is `new UpstreamError({ code: "CLI_REPORTED_ERROR", cause: null, details: { argv, command, stdout, stderr, exitCode: 0, message: "Vault not found." }, message: "Vault not found." })`. `argv`, `stdout` and `stderr` are dispatch's own values, unmodified. This is dispatch's priority-(c) `details` shape (F7), with `message` set as `runTyped` sets it (F3). No new code and no `details.code` / `details.reason` (spec Assumption; ADR-015 not engaged).
- **D4 — the literal stays local.** `invoke-bounded-cli.ts` declares its own private `UNKNOWN_VAULT_ANSWER = "Vault not found."`. It does not import `UNKNOWN_VAULT_PREFIX` from `cli-adapter.ts`, because the two facades are siblings, neither imports the other today, and the two constants serve two different rules (an exact-match answer against a start-of-output prefix). A comment in each file points to the other rule.
- **D5 — published surface.** One parenthesised item, `unknown vault`, is added to `OBSIDIAN_EXEC_DESCRIPTION`'s failure list, and the baseline is regenerated (F9). `docs/tools/obsidian_exec.md` gains an error-table row and a correction to the `CLI_REPORTED_ERROR` row's example. The CHANGELOG `[Unreleased]` section gains the spec line and one bullet. The exact text is in [contracts/unknown-vault-contract.md](contracts/unknown-vault-contract.md) §H and §C.
- **D6 — tests.**
  - A new suite, `src/tools/obsidian_exec/handler.unknown-vault.test.ts` (U1–U14), drives `executeObsidianExec`, which runs the facade.
  - Two facade rows, B1 and B2 (B2 compares the error with `invokeCli`'s for the same answer), go in `src/cli-adapter/invoke-bounded-cli.test.ts`.
  - One wire row, R1, goes in `src/tools/obsidian_exec/index.test.ts`.
  - No existing assertion changes (F8). If any existing test fails during implement, stop and raise it.

## Follow-ups (out of scope)

- Reclassifying other unprefixed messages from the editor (spec Out of scope).
- Whether the dedicated tools should adopt the stricter rule (spec Out of scope, FR-008).
