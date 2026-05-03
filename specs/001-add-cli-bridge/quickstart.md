# Quickstart: Add CLI Bridge

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-03

This document seeds the README's Installation + MCP-client configuration content (FR-022) and gives implementers / early adopters a single page to walk from "fresh Windows host" to "first successful `obsidian_exec({ command: "version" })` call." Polish for the README during implementation.

## Prerequisites

- **Windows 10 / 11** host. (macOS/Linux are out of scope for v0.1.)
- **Node.js >= 22.11** on PATH. Verify: `node --version`.
- **Obsidian 1.12+** desktop installed and **running** when you make calls. The bridge can boot without Obsidian running, but every `obsidian_exec` call will fail with `CLI_NON_ZERO_EXIT` (the CLI itself errors out) until the desktop app is up.
- **Obsidian Integrated CLI** binary discoverable on PATH. Verify: `obsidian version` from a fresh PowerShell prompt should print Obsidian's version.
  - If `obsidian` isn't on PATH: set `OBSIDIAN_BIN` to the absolute path to the binary in your MCP-client configuration's environment (see below).

## Install

```pwsh
npm install -g obsidian-cli-mcp
# or, for one-shot use without global install:
npx obsidian-cli-mcp
```

Verify the bridge boots:

```pwsh
npx obsidian-cli-mcp
# Expect: the process to print no stdout (stdout is reserved for MCP traffic)
# and to write a single bridge.shutdown JSON line to stderr when you Ctrl+C.
# (No "ready" log on startup in v0.1 — call.start is the first log event.)
```

## Configure your MCP client

The bridge runs on the **Windows host**, not inside any sandbox. The MCP client (which may be running anywhere — locally or in a sandboxed Linux container like Claude Cowork) connects to the bridge via stdio. Configuration is per-client.

### Claude Desktop (Windows)

Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```jsonc
{
  "mcpServers": {
    "obsidian-cli-mcp": {
      "command": "npx",
      "args": ["-y", "obsidian-cli-mcp"],
      "env": {
        // Optional: override the binary path if 'obsidian' isn't on PATH
        // "OBSIDIAN_BIN": "C:\\Users\\you\\AppData\\Local\\Obsidian\\obsidian.exe"
      }
    }
  }
}
```

Restart Claude Desktop. The `obsidian_exec` tool will appear in the tools list.

### Claude Cowork (sandboxed Linux container) connecting to the bridge running on the Windows host

Cowork's container can't exec the Windows `obsidian` binary directly, which is exactly the problem the bridge solves. The bridge runs **on the Windows host**, and Cowork's MCP config points at it via the host's stdio — typically by tunneling stdio over a host-to-container channel set up by your operator. The Cowork-side configuration looks something like:

```jsonc
{
  "mcpServers": {
    "obsidian-cli-mcp": {
      // The exact 'command' depends on your host-to-container tunneling tool.
      // The point: the command's stdio MUST end up wired to a `npx obsidian-cli-mcp`
      // process running on the Windows host.
      "command": "<your host-stdio bridge command>",
      "args": ["<args that exec 'npx obsidian-cli-mcp' on the Windows host>"]
    }
  }
}
```

The architectural rationale (why the bridge lives on the Windows host) is captured separately in ADR-002.

## First call

Once the bridge is registered with your MCP client, ask the agent:

> Run the obsidian_exec tool with `command: "version"`.

Expected response payload (rendered by the MCP client):

```jsonc
{
  "stdout": "<your running Obsidian version, e.g. 1.7.2>",
  "stderr": "",
  "exitCode": 0,
  "argv": ["version"]
}
```

If you instead see a `CLI_BINARY_NOT_FOUND` error, the `obsidian` binary isn't on the bridge process's PATH. Fix by setting `OBSIDIAN_BIN` in the `env` block of your MCP client config to the binary's absolute path, then restart the MCP client.

If you see `CLI_NON_ZERO_EXIT`, the binary ran but failed — most commonly because Obsidian's desktop app isn't open. Open it and retry.

## Common subcommands

Once `version` works, every Obsidian Integrated CLI subcommand is reachable through the same tool. Examples:

```jsonc
// Top-level help
{ "command": "help" }

// Count files in the focused vault via eval
{ "command": "eval", "parameters": { "code": "app.vault.getFiles().length" } }

// Search the focused vault
{ "command": "search", "parameters": { "query": "meeting", "limit": 10 } }

// Search a specific named vault
{ "vault": "work-notes", "command": "search", "parameters": { "query": "Q2 planning" } }

// Read a note and copy stdout to the clipboard
{ "command": "read", "parameters": { "path": "Inbox/today.md" }, "copy": true }
```

The bridge does not interpret any of these — it just assembles argv per FR-010 and runs the CLI. Whatever the CLI accepts, the bridge accepts.

## Operating tips

- **Logs are on stderr** as JSON lines. Pipe them somewhere if you want to keep them: `npx obsidian-cli-mcp 2> bridge.log`.
- **Calls serialize**. If you fire several `obsidian_exec` calls in parallel from your agent, they'll run one at a time in arrival order. The `queueDepth` field in each `call.start` log line tells you how deep the backlog was when each call started.
- **Default timeout is 30 s**. Override per-call with `timeoutMs` (max 120000).
- **Output cap is 10 MiB** per stream. If you're calling `eval` with a payload that returns megabytes of data, expect a `CLI_OUTPUT_TOO_LARGE` error and a captured prefix in `details.partial`.
- **Stop the bridge cleanly** with Ctrl+C in the foreground shell, `Stop-Process`, or `taskkill` (without `/F`). Hard kills (`taskkill /F`) leave any in-flight `obsidian` child orphaned — that's an OS limitation, not a bridge defect.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Tool doesn't appear in MCP client | Bridge process not booting | Run `npx obsidian-cli-mcp` directly in a terminal; check stderr for the error |
| `CLI_BINARY_NOT_FOUND` | `obsidian` not on PATH | Set `OBSIDIAN_BIN` in MCP-client `env` to the absolute path; restart the client |
| `CLI_NON_ZERO_EXIT` on every call | Obsidian desktop not running | Open Obsidian; retry |
| `CLI_TIMEOUT` on slow commands | Default 30 s too short for the workload | Pass `timeoutMs: 90000` (or up to 120000) on the call |
| `CLI_OUTPUT_TOO_LARGE` | Payload exceeded 10 MiB cap | Narrow the query (e.g., `limit:` parameter, smaller `eval` scope) |
| MCP wire seems corrupted / client disconnects | Something wrote to stdout that wasn't the SDK | A constitution violation slipped through; check recent changes for stray `console.log` or `process.stdout.write` |
