# Implementation Plan: Report unknown vault

**Branch**: `091-report-unknown-vault` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/091-report-unknown-vault/spec.md`

> **This change makes `obsidian_exec` fail on the Obsidian CLI's unknown-vault answer, with the same code and message the typed tools return.** Today a call with an unknown `vault` succeeds, and its `stdout` is `Vault not found.\n`. After this change:
>
> - `invokeBoundedCli` (the facade `obsidian_exec` uses) checks each successful dispatch result, as `runTyped` does for the typed tools.
> - When the call names a `vault` and its stdout, trimmed, is exactly `Vault not found.`, the call fails with `CLI_REPORTED_ERROR`. `message` and `details.message` are both `Vault not found.`, and the other `details` keys are the raw tool's usual `{ argv, command, stdout, stderr, exitCode }`.
> - Any other output, and any call without `vault`, is returned unchanged.
>
> `src/errors.ts`, the schemas, the typed facade and every typed tool are unchanged. The `obsidian_exec` description gains two words (`unknown vault`), so the fingerprint baseline is regenerated on purpose.

## Summary

Research ([research.md](research.md)) read the code at HEAD `c632243` and probed the live CLI (P1–P11, read-only).

Live findings:

- **F1**: every command answers exactly `Vault not found.\n` against an unknown vault, with empty stderr and exit 0. That includes `version`, `help`, `vaults`, `eval` and a command that does not exist.
- **F2**: only the leading `vault=` token names a vault. A `vault=` token after the command (the `parameters: { vault }` shape) is ignored, and the call runs against the focused vault.

Code findings:

- **F3**: the typed tools' check is `runTyped`'s start-of-output prefix rule.
- **F4**: `invokeBoundedCli` has no such check.
- **F5**: a check placed after `dispatchCli` is outside the cold-start retry and the auto-launch recovery.
- **F6**: an eval with a `=> ` line is resolved by dispatch first.
- **F7**: dispatch's reported-error `details` shape.
- **F8**: no existing test expects today's success.
- **F9**: the description, baseline and help page.

Decisions:

- **D1**: the check goes in `invokeBoundedCli`, after `dispatchCli`, inside `queue.run`.
- **D2**: the rule is `input.vault !== undefined && out.stdout.trim() === "Vault not found."` (Clarification Q1, option C).
- **D3**: the error shape (data-model E4).
- **D4**: a private local constant, not shared with `cli-adapter.ts`.
- **D5**: the description, help page and CHANGELOG.
- **D6**: the test rows U1–U14, B1, B2 and R1, with no existing-test edits.

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. Unchanged.

**Primary Dependencies**: `@modelcontextprotocol/server` (SDK v2), `zod` 4. No new dependency.

**Storage**: none. `obsidian_exec` stays a CLI pass-through, and the check reads only the dispatch result already in memory.

**Testing**:

- `vitest run`, with co-located `*.test.ts`, run through PowerShell.
- The new rows use `makeQueuedSpawn` / `makeStubSpawn` and `silentLogger` from `_handler-test-fixtures.ts`, and `createQueue`, as the existing `obsidian_exec` and `invoke-bounded-cli` suites do.
- The required live check (quickstart §3) runs the built server against `TestVault-Obsidian-CLI-MCP` and an unknown vault name, following `.memory/test-execution-instructions.md`.

**Target Platform**: Windows, macOS and Linux; CI runs on Linux and Windows. The answer is plain CLI text, and `trim()` removes `\r`, so CRLF output is covered (U2).

**Project Type**: single project, an MCP server.

**Performance Goals**: no added spawn, read or wait. The check is one `trim()` and one string comparison per successful `obsidian_exec` call that names a vault.

**Constraints**:

- FR-004 / FR-006: every other success and failure is byte-identical.
- Principle IV: no new code (P3).
- Refactor-decisions item 5: no existing-test edit is planned (§X). Any failing existing test stops implement.
- Item 25: the `command` refine and the blocked-command gate are untouched; the gate still runs before any spawn (U14c).
- Item 29: `executeObsidianExec` still passes its deps whole to `invokeBoundedCli`.
- Item 41: `invokeBoundedCli` still never carries `evalAnswer`, and the check needs none (F6).

**Scale/Scope**:

- **Changed code**:
  - `src/cli-adapter/invoke-bounded-cli.ts`: the private `UNKNOWN_VAULT_ANSWER` constant, the check inside `queue.run`, an import of `UpstreamError`, and the header updated.
  - `src/tools/obsidian_exec/index.ts`: `OBSIDIAN_EXEC_DESCRIPTION` (contract §H1).
  - `src/cli-adapter/cli-adapter.ts`: a one-line comment by `UNKNOWN_VAULT_PREFIX` pointing at the raw facade's stricter rule (D4). No code change.
- **New tests**:
  - `src/tools/obsidian_exec/handler.unknown-vault.test.ts` (U1–U14);
  - B1 and B2 in `src/cli-adapter/invoke-bounded-cli.test.ts`;
  - R1 in `src/tools/obsidian_exec/index.test.ts`.
- **Edited tests**: none.
- **Regenerated**: `src/tools/_register-baseline.json` (the `obsidian_exec` description only).
- **Docs**:
  - `docs/tools/obsidian_exec.md` (§H2–H4);
  - `CHANGELOG.md` (§C);
  - the `CLAUDE.md` plan pointer (after_plan hook).

**Resolved unknowns**: none open. The probes settled the answer's exact bytes for every command (F1) and what "names a vault" means (F2).

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | The check lives in the adapter layer, in `invoke-bounded-cli.ts`, next to the dispatch call whose answer it classifies, as `runTyped` does in `cli-adapter.ts`. The facade gains one downward import (`UpstreamError` from `../errors.js`, which `cli-adapter.ts` already imports). No sibling-facade import (D4), no tool-to-adapter change in direction, no cycle. `architecture.test.ts` (ii), "dispatchCli imported only by the two facades", is unaffected. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | `obsidian_exec` is modified, so it ships failure rows (U1–U5, U13, R1), happy and boundary rows (U6–U12) and regression rows (U14a–c) in the same change. The facade gets B1 and B2. Every test is co-located with the module it covers. |
| **III. Boundary Input Validation with Zod** | **Y** | The schema is unchanged. The check reads `input.vault`, already parsed, and the dispatch result, an internal value. |
| **IV. Explicit Upstream Error Propagation** | **Y** | A failure that was masked as success is now surfaced as an `UpstreamError` with a stable code, the CLI's own message, and the full upstream context (`argv`, `stdout`, `stderr`, `exitCode`). `cause` is `null`, because no thrown value exists, as in `runTyped`. No new top-level code and no sub-discriminator. Cancellation is untouched: an aborted call rejects inside `dispatchCli` and never reaches the check. The tool result is `isError: true` through `registerTool` (R1). |
| **V. Attribution & Layered Composition** | **Y** | The new test file carries `// Original — no upstream.`, and the `invoke-bounded-cli.ts` header is extended to name the unknown-vault check. |
| **ADR-010 / ADR-013 / ADR-014** | **N/A** | No tool is added or renamed, and the tool is not plugin-backed. |
| **ADR-015** (sub-discriminators) | **N/A** | No `details.reason` or `details.code` is introduced. The error is a plain `CLI_REPORTED_ERROR`, as the typed tools return it. |
| **MCP Tool Surface Standards** | **Y** | Title, annotations, schema and parameter descriptions are unchanged. The description change is deliberate, and the baseline is regenerated in the same PR (P1, P2). Error results stay text-only (R1). |
| **Security Defaults** | **Y** | The blocked-command gate is unchanged and still runs first (U14c). No new escape hatch and no new write path. |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**ADR conflicts**: none found. ADR-029 (the cold-start retry and its 2026-11-01 plugin-noise amendment) is respected by placement (F5, F6). The Decision Log has no ADR on `obsidian_exec`'s raw-output semantics; the docs page already promised structured errors for in-band failures.

**Kernel-node attention (per CLAUDE.md)**:

- **`createServer()`** (the boot-spine entry point) is **not touched**. `obsidian_exec`'s deps are unchanged, so `server.ts` is unchanged.
- **`UpstreamError`** (the error-spine value type) is **not edited**. It gains one construction site, in `invoke-bounded-cli.ts`, using the existing `CLI_REPORTED_ERROR` code.
- **`createLogger()` / `createQueue()`** (the boot-time DI factories) are **not edited**, and no production file gains a call to them. The check runs inside the injected `deps.queue.run` callback that already exists.

## Project Structure

### Documentation (this feature)

```text
specs/091-report-unknown-vault/
├── plan.md                                # This file
├── research.md                            # T0 probes P1–P11, findings F1–F9, decisions D1–D6
├── data-model.md                          # E1–E4, invariants V1–V5, per-call flow
├── quickstart.md                          # approval gate, automated gate + red check, surface gate, live check
├── contracts/
│   └── unknown-vault-contract.md          # §P surface, §E errors, §T rows U1–U14 + B1–B2 + R1, §X, §H, §C, §L
├── checklists/requirements.md
└── tasks.md                               # Phase 2: /speckit-tasks
```

### Source Code (repository root)

```text
src/cli-adapter/invoke-bounded-cli.ts                   # UNKNOWN_VAULT_ANSWER; check after dispatchCli; UpstreamError import; header
src/cli-adapter/invoke-bounded-cli.test.ts              # NEW describe: B1, B2
src/cli-adapter/cli-adapter.ts                          # comment only, by UNKNOWN_VAULT_PREFIX (D4)
src/tools/obsidian_exec/index.ts                        # OBSIDIAN_EXEC_DESCRIPTION (§H1)
src/tools/obsidian_exec/index.test.ts                   # NEW it: R1
src/tools/obsidian_exec/handler.unknown-vault.test.ts   # NEW: U1–U14
src/tools/_register-baseline.json                       # regenerated: obsidian_exec description only
docs/tools/obsidian_exec.md                             # §H2–H4
CHANGELOG.md                                            # §C

# UNCHANGED: src/tools/obsidian_exec/{handler,schema}.ts, src/cli-adapter/_dispatch.ts, src/errors.ts,
#   src/server.ts, src/vault-registry/**, every typed tool
```

**Structure Decision**: single project. The behaviour is a classification of the CLI's answer, which this codebase keeps in `src/cli-adapter/`, so it sits in the raw facade beside the dispatch call (D1). The tool-level suite follows the `handler.<topic>.test.ts` split other tools use, and drives the tool's own handler so the rule is pinned at the surface agents call (Principle II). The facade rows pin it where the code lives.

**Docs-as-code**: after review, `/speckit-docs-as-code <n>` updates the `.docs-as-code/` pages that describe the CLI adapter's answer classification and `obsidian_exec`'s failures. That means noting that the raw facade now fails a named vault's exact `Vault not found.` answer, under a stricter rule than the typed facade's.

## Phase 0: Research → research.md

- **T0 method**: read-only live probes P1–P11 against `Obsidian.com`, with an unknown vault name and one control call on `TestVault-Obsidian-CLI-MCP`. Nothing was written to any vault.
- **F1–F9 and D1–D6**: summarised above.
- **Plan-time spec alignment**:
  - The spec's first Assumption ("the same answer for every command") is confirmed by F1.
  - The question left at clarify (does `parameters.vault` name a vault?) is settled by F2: it does not. Row U11 pins it.
- **Follow-ups**: reclassifying other unprefixed CLI messages, and whether the typed tools should adopt the stricter rule. Both are out of scope (spec).

**Output**: research.md, with no `NEEDS CLARIFICATION` remaining.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)**:
  - E1, the raw call;
  - E2, the dispatch result;
  - E3, the unknown-vault answer, with a recognition table;
  - E4, the error;
  - invariants V1–V5;
  - the per-call flow.
- **[contracts/unknown-vault-contract.md](contracts/unknown-vault-contract.md)**:
  - P1–P4;
  - the error contract E-1 to E-4;
  - test rows U1–U14, B1, B2 and R1;
  - §X (no edits);
  - the exact description and help text (§H1–H4);
  - the CHANGELOG text (§C);
  - the live column L1–L6.
- **[quickstart.md](quickstart.md)**: the approval gate, the automated gate with a red check, the surface gate, the required live check and the structural check.
- **Agent context**: the `CLAUDE.md` plan pointer is moved to this plan by the `after_plan` agent-context hook.

## Phase 1 re-check (post-design Constitution Check)

- **I**: the check sits in the adapter facade with one downward import; acyclic, with no sibling-facade edge.
- **II**: failure, happy, boundary, regression and wire rows, in the same change.
- **III**: schema untouched.
- **IV**: a masked failure is now typed, with full context and no new code; cancellation is untouched.
- **V**: headers present and updated.
- **Tool Surface Standards**: one deliberate description change, with the baseline regenerated (P1, P2).
- **Security Defaults**: the gate is untouched and still runs first.

**No gate regressed; Complexity Tracking is empty.**

### Spec alignment note

- **FR-001**: D2, E3, E-1; U1–U5, U13; L1, L3.
- **FR-002**: D3, E4; U1 (`toEqual`), B2; L1, L2.
- **FR-003**: D3, E4; U1, U2, U13 (`details` `toEqual`).
- **FR-004**: E-2, V2; U6–U11; L4, L5.
- **FR-005**: F6; U12.
- **FR-006**: E-3, V3; U14a–c, plus the existing facade suites for timeout, output cap, cancellation and missing binary. The check runs only after `dispatchCli` resolves (V3), so those failures never reach it.
- **FR-007**: F5, V3; U1 (spawn count 1), B1 (spawned once, no launch).
- **FR-008**: V5; B2 and the existing typed-tool suites, unchanged.
- **FR-009**: D5, §H1; P1, P2.
- **SC-001**: U1–U5; L1, L3.
- **SC-002**: B2; L2.
- **SC-003**: U6–U11; L4, L5, L6.
- **SC-004**: R1 (the `isError` flag alone); L1.
- **SC-005**: §X (no edits) and the full suite.

### CodeGraph structural check

Run with `codegraph_explore` at plan time (HEAD `c632243`).

**Affected symbols and blast radius**:

- **`invokeBoundedCli`** (`src/cli-adapter/invoke-bounded-cli.ts:51`): its signature is unchanged. Its only production caller is `executeObsidianExec` (`src/tools/obsidian_exec/handler.ts:55`), which is called by `createObsidianExecTool`'s handler closure (`obsidian_exec/index.ts:22`). It is tested by `invoke-bounded-cli.test.ts`, and through the tool by `obsidian_exec/handler.test.ts` and `index.test.ts`. The schema imports only its timeout constants, which are unchanged.
- **`executeObsidianExec`** and **`isBlockedCommand`**: unchanged. The gate still runs before the facade.
- **`OBSIDIAN_EXEC_DESCRIPTION`** (`obsidian_exec/index.ts:9`): changed, so the `obsidian_exec` entry in `_register-baseline.json` moves. `index.test.ts:46` asserts it by identity, which still holds.
- **`dispatchCli`, `isColdStart`, `inspectedLines`, `assembleArgv`** (`src/cli-adapter/_dispatch.ts`): unchanged. The new check reads `DispatchOutput` as dispatch already produces it.
- **`runTyped` / `UNKNOWN_VAULT_PREFIX`** (`src/cli-adapter/cli-adapter.ts:133`, `:85`): behaviour unchanged, with a comment only. Every typed tool inherits `runTyped`'s check through `invokeCli` / `invokeEval`, among the most-depended-on functions, and that check is left as it is (FR-008).

**Kernel-node touch surface**:

- **`createServer()`**: not touched.
- **`UpstreamError`**: not edited. It gains one construction site, in `invoke-bounded-cli.ts`.
- **`createLogger()` / `createQueue()`**: not edited, and no new caller.

That is the explicit touch and no-touch claim for post-implement verification.

**Post-implement structural verification** (after `codegraph sync`):

1. **Codes**: no new error class or top-level code, and `src/errors.ts` is unchanged. The one new `new UpstreamError` in `invoke-bounded-cli.ts` uses `CLI_REPORTED_ERROR`.
2. **DI**: no handler imports `createLogger` / `createQueue`, and `server.ts` is unchanged from `main`.
3. **Imports**: `invoke-bounded-cli.ts` imports only `_dispatch.js`, `../errors.js` and the logger and queue types. It does not import `cli-adapter.ts`, and no file under `src/cli-adapter/` imports from `src/tools/`.
4. **No orphans**: `UNKNOWN_VAULT_ANSWER` is private and used once, by `invokeBoundedCli`, and the change adds no new production export.

## Follow-ups (out of scope)

- Reclassifying other unprefixed messages from the CLI.
- Whether the typed tools should adopt the stricter exact-answer rule.

## Complexity Tracking

> No Constitution Check violations; the table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
