# `obsidian_exec` Tool Description Patch (002)

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Date**: 2026-05-05

## Surface

The published MCP tool description string in [src/tools/obsidian_exec/tool.ts:15-16](../../../src/tools/obsidian_exec/tool.ts#L15-L16) is the `OBSIDIAN_EXEC_DESCRIPTION` constant — the canonical user-facing summary that MCP clients see when they list tools. Per FR-009, this string MUST mention the new `CLI_REPORTED_ERROR` so MCP clients discovering the contract see all reachable error codes.

## Current text

```text
Invoke any Obsidian Integrated CLI subcommand on the host where the bridge is running. Bridges MCP clients (including sandboxed ones that cannot exec the obsidian binary directly) to the running Obsidian desktop instance. The 'command' field names the CLI subcommand; 'parameters' becomes 'key=value' argv tokens; 'flags' are appended as bare-word tokens; 'vault' (if set) scopes the invocation to a named vault by prepending 'vault=<value>' as the first positional; 'copy' appends '--copy' to copy stdout to the OS clipboard. Returns stdout, stderr, exitCode, and the exact argv invoked. Failures (non-zero exit, missing binary, timeout, captured-output exceeds 10 MiB) surface as structured errors with stable code identifiers — see contracts/errors.contract.md.
```

## Required change

Replace the failures sentence:

> Failures (non-zero exit, missing binary, timeout, captured-output exceeds 10 MiB) surface as structured errors with stable code identifiers — see contracts/errors.contract.md.

With:

> Failures (non-zero exit, CLI exits 0 with `Error:` stdout prefix, missing binary, timeout, captured-output exceeds 10 MiB) surface as structured errors with stable code identifiers — see contracts/errors.contract.md.

## Acceptance criteria

- The exported `OBSIDIAN_EXEC_DESCRIPTION` constant in [tool.ts](../../../src/tools/obsidian_exec/tool.ts) contains the substring `Error:` (case-sensitive) AND the substring `CLI exits 0` so MCP clients can grep for the new code's trigger condition without consulting the contract document.
- The list-tools response served by `registerObsidianExecTool` ([tool.ts:36-45](../../../src/tools/obsidian_exec/tool.ts#L36-L45)) returns the updated description verbatim.
- No other field of the tool registration changes: `name` stays `"obsidian_exec"`, `inputSchema` stays generated from the unchanged `obsidianExecSchema`.
- The existing description-equality assertion in [tool.test.ts:54](../../../src/tools/obsidian_exec/tool.test.ts#L54) (which compares against the exported constant) continues to pass without edit, because the comparison is constant-against-constant.

## Out of scope

- Adding `VALIDATION_ERROR` or `TOOL_NOT_FOUND` to the description string. Those codes are MCP-dispatch-layer codes that fire BEFORE the bridge invokes the CLI; they are tool-discovery layer rather than tool-execution layer. The description's failure list scopes to "what can go wrong when you actually run a CLI command." The contract document still enumerates them per FR-015 — that's the right place for the per-tool-call dispatch failure modes.
- Restructuring or otherwise rewording the prose. Minimum-diff edit.
