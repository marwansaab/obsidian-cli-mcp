# Quickstart: Detect CLI Errors

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-05

This walkthrough verifies the new `CLI_REPORTED_ERROR` behaviour end-to-end against a running bridge and a real Obsidian 1.12+ desktop instance. It assumes the bridge is installed per [001's quickstart.md](../001-add-cli-bridge/quickstart.md) and the `obsidian` CLI is on PATH (or `OBSIDIAN_BIN` is set).

## Prerequisites

- Windows host with Obsidian 1.12+ desktop running.
- This branch (`002-detect-cli-errors`) checked out and built (`npm run build`).
- An MCP client capable of issuing tool calls and reading `isError: true` responses (e.g., a Claude Code session configured with the bridge as an MCP server, or a script invoking the SDK directly).

## Verification scenarios

### Scenario 1 — False-positive guard (Story 2 acceptance #2)

Verify that legitimate output without a leading `Error:` is still returned as success.

```jsonc
// Tool call
{ "name": "obsidian_exec", "arguments": { "command": "version" } }

// Expected response shape (success, isError absent or false)
{
  "content": [{
    "type": "text",
    "text": "{\"stdout\":\"<version string>\",\"stderr\":\"\",\"exitCode\":0,\"argv\":[\"obsidian\",\"version\"]}"
  }]
}
```

The version output does not start with `Error:`, so no detection fires.

### Scenario 2 — CLI-reported failure: unknown subcommand (Story 1 acceptance #1)

Verify that an unknown subcommand surfaces as `CLI_REPORTED_ERROR`.

```jsonc
// Tool call
{ "name": "obsidian_exec", "arguments": { "command": "nonexistent_command_xyz" } }

// Expected response shape (failure, isError: true)
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "{\"code\":\"CLI_REPORTED_ERROR\",\"message\":\"CLI bridge upstream error: CLI_REPORTED_ERROR\",\"details\":{\"argv\":[\"obsidian\",\"nonexistent_command_xyz\"],\"stdout\":\"Error: Command \\\"nonexistent_command_xyz\\\" not found.\\n\",\"stderr\":\"\",\"exitCode\":0,\"message\":\"Error: Command \\\"nonexistent_command_xyz\\\" not found.\"}}"
  }]
}
```

Confirm:
- `code === "CLI_REPORTED_ERROR"`
- `details.exitCode === 0`
- `details.message === "Error: Command \"nonexistent_command_xyz\" not found."` (no trailing `\n` or `\r`)
- `details.stdout` and `details.stderr` are byte-preserved verbatim from what the CLI emitted

### Scenario 3 — CLI-reported failure: missing file (Story 1 acceptance #2)

```jsonc
// Tool call
{ "name": "obsidian_exec", "arguments": { "command": "read", "parameters": { "path": "this/does/not/exist.md" } } }

// Expected: isError: true, code === "CLI_REPORTED_ERROR", details.message starts with "Error: File "
```

### Scenario 4 — CLI-reported failure: eval throws (Story 1 acceptance #3)

```jsonc
// Tool call
{ "name": "obsidian_exec", "arguments": { "command": "eval", "parameters": { "code": "throw new Error('test')" } } }

// Expected: isError: true, code === "CLI_REPORTED_ERROR", details.message starts with "Error: " (rendered exception)
```

### Scenario 5 — Search results containing `Error:` (Story 2 acceptance #1)

Verify that search results whose matched files contain the literal text `Error:` are still returned as success — the JSON `[`/`{` opener guards the prefix check.

```jsonc
// Tool call (against a vault that contains notes mentioning "Error:")
{ "name": "obsidian_exec", "arguments": { "command": "search", "parameters": { "query": "Error:" } } }

// Expected: success shape with stdout containing the JSON matches array. No isError. exitCode: 0.
```

### Scenario 6 — Existing genuine-crash path unchanged (Story 3)

Verify that a non-zero exit still classifies as `CLI_NON_ZERO_EXIT` (not the new code), even if stdout happens to start with `Error:`. After this feature lands, the `CLI_NON_ZERO_EXIT` `details` payload also carries `exitCode` and `signal` (FR-014 reconciliation), discoverable from the error alone.

This scenario requires a synthetic CLI substitute via `OBSIDIAN_BIN` pointing at a script that exits 1; see [src/tools/obsidian_exec/handler.test.ts](../../src/tools/obsidian_exec/handler.test.ts) for the equivalent unit-test harness. End-user verification against the real Obsidian binary is satisfied by the unit-test suite (FR-010 + the existing 001-era CLI_NON_ZERO_EXIT case).

## Acceptance check

After running scenarios 1–5 above against a real bridge:

- Scenarios 1 and 5 return success-shaped responses (no `isError`).
- Scenarios 2, 3, 4 return `isError: true` with `code === "CLI_REPORTED_ERROR"`.
- The bridge's stderr log stream shows one `call.end` JSON-lines event per call, with `errorCode: "CLI_REPORTED_ERROR"` for the failure cases (matching the existing failure-path log format from 001 — call.end with errorCode mirrors the format used for `CLI_NON_ZERO_EXIT`, `CLI_TIMEOUT`, etc.).

If any of these checks fail, refer to [data-model.md](./data-model.md) for the expected `details` shape and to [contracts/errors.contract-patch.md](./contracts/errors.contract-patch.md) for the canonical contract rows.

## Smoke test (no real Obsidian needed)

A tighter pre-merge sanity check that doesn't require the desktop app:

```pwsh
npm run lint
npm run typecheck
npm run build
npm test
```

All four MUST pass. The vitest run MUST report ≥ 84.3% statements coverage (per FR-012) and the five new test cases under [src/tools/obsidian_exec/handler.test.ts](../../src/tools/obsidian_exec/handler.test.ts) MUST appear in the green list.

## Rollback

Should the change need to be reverted, `git revert <SHA>` of the implementation commit suffices — the change is additive (one new sub-branch in `runOnce`, one extension to the `Logger.ErrorCode` union, one one-line tweak to the existing `CLI_NON_ZERO_EXIT` details payload, four documentation edits). No data migration; no caller-state to unwind. Pre-revert callers that consumed `CLI_NON_ZERO_EXIT.details.exitCode` will lose that field; if any caller depends on it, prefer to amend rather than revert.
