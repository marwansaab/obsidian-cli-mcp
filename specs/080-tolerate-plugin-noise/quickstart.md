# Quickstart: validate "Tolerate plugin noise"

**Feature**: [spec.md](spec.md) | **Contract**: [contracts/eval-output-contract.md](contracts/eval-output-contract.md)

## 0. Before you run anything live

Read [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) first. It names the authorised test vault, the scratch folder and the cleanup rules. Run live steps only against that vault.

## 1. T0 gate (before any code; research D10)

Use `obsidian_exec` (or the CLI directly) to send `eval` with three codes, each built by hand as `(async()=>{return "obsidian-cli-mcp:t0-probe:"+(await (<template>))})()`:

- `FOCUSED_FILE_TEMPLATE`;
- `FOCUSED_VAULT_TEMPLATE`;
- one `composeEvalCode` template, for example `links` in active mode with its normal payload.

Record the exact stdout of each. For each one, check:

1. the line starts `=> obsidian-cli-mcp:t0-probe:` (raw form) **or** `=> "obsidian-cli-mcp:t0-probe:` (quoted form);
2. the rest is the template's normal JSON, not `[object Promise]`;
3. no plugin text appears on that same line.

**Stop rule**: if no form preserves the tag at the start of the answer line, stop implementation and raise it to the owner as a question (research D10). Record the forms you observed in the PR description.

## 2. Automated gate

```powershell
npm run typecheck
npm run lint
npm run format:check
npx vitest run
```

Everything must be green on Windows, and in CI on Linux and Windows. The tests pin the contract as follows:

| Test file | What it pins |
|-----------|--------------|
| `src/cli-adapter/eval-output.test.ts` | contract §1 A1–A15, including the look-alike rows A5–A8 and A13; the wrapper keeping the template text verbatim; selection of the last `Error:` line |
| `src/cli-adapter/cli-adapter.test.ts` | eval calls are wrapped and tagged and return `evalAnswer`; non-eval calls are untouched |
| `src/cli-adapter/_dispatch.test.ts` | contract §2 E1–E8 (including E5b), exactly one retry, no new codes |
| `src/cli-adapter/invoke-bounded-cli.test.ts` | §2 E9; `obsidian_exec` code is not wrapped |
| `src/tools/_active-file.test.ts`, `src/tools/_note-io.test.ts` | the shared readers and `stdoutTail` (§3) |
| each affected tool's `handler.test.ts` | plugin lines before and after; a look-alike before and after; no answer |
| `src/cli-adapter/architecture.test.ts` | still green |

## 3. Unchanged published surface

```powershell
git diff --stat main -- src/tools/_register-baseline.json
```

Expected: no change (contract §5).

## 4. Live check (after implementation)

1. With Smart Connections enabled in the test vault, call `smart_connections_query`. Confirm the raw output has plugin lines and the call returns its normal result.
2. Call `get_active_file`, `links` (active mode) and `read_heading` on a scratch note. Confirm the normal results.
3. Record the findings in the PR description, then clean up as the instructions require.

A cold start with plugin start-up lines cannot be reproduced on demand. The dispatch tests cover it (§2 E1, E2, E5b).
