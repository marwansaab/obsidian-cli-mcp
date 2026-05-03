# obsidian-cli-mcp

A minimal Windows-host MCP server that bridges any MCP client (running locally or in a sandboxed container like Claude Cowork's Linux environment) to the Obsidian Integrated CLI binary on the operator's Windows desktop. Exposes a single generic tool, `obsidian_exec`, that lets the caller invoke any Obsidian CLI subcommand with structured parameters, bare-word flags, optional vault scoping, and a per-call timeout. All failure modes (non-zero exit, missing binary, timeout, output too large) surface as structured `UpstreamError` responses with full diagnostic detail.

## Installation

> **Important**: The bridge installs on the **Windows host**, NOT inside a sandboxed Linux container (e.g., Claude Cowork). The bridge needs direct access to the `obsidian` binary, which only exists on the host where the Obsidian desktop app is installed. ADR-002 captures the architectural rationale.

### Prerequisites

- **Windows 10 / 11** host. macOS and Linux are out of scope for v0.1.
- **Node.js >= 22.11** (LTS). Verify: `node --version`.
- **Obsidian 1.12+** desktop app installed and running. The bridge can boot without Obsidian running, but every `obsidian_exec` call will fail with `CLI_NON_ZERO_EXIT` until Obsidian is up.
- **Obsidian Integrated CLI** binary discoverable on `PATH`. Verify from a fresh PowerShell prompt: `obsidian version`. If `obsidian` isn't on `PATH`, set `OBSIDIAN_BIN` in your MCP-client configuration to the absolute path.

### Install

```pwsh
npm install -g obsidian-cli-mcp
# or, for one-shot use without global install:
npx -y obsidian-cli-mcp
```

Verify the bridge boots:

```pwsh
npx obsidian-cli-mcp
# Expected: no stdout (stdout is reserved for MCP wire traffic).
# Press Ctrl+C — a single bridge.shutdown JSON line appears on stderr,
# then the process exits with code 0.
```

## MCP-client configuration

### Claude Desktop (Windows)

Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```jsonc
{
  "mcpServers": {
    "obsidian-cli-mcp": {
      "command": "npx",
      "args": ["-y", "obsidian-cli-mcp"],
      "env": {
        // Optional override if 'obsidian' isn't on PATH:
        // "OBSIDIAN_BIN": "C:\\Users\\you\\AppData\\Local\\Obsidian\\obsidian.exe"
      }
    }
  }
}
```

Restart Claude Desktop. The `obsidian_exec` tool will appear in the tools list.

### Claude Cowork (sandboxed Linux container) → Windows host

Cowork's container can't exec the Windows `obsidian` binary directly — that's exactly the problem this bridge solves. Run the bridge on the **Windows host** and configure Cowork to tunnel its MCP stdio to that host process. The exact `command` depends on your host-to-container tunneling tool; the point is that the configured command's stdio MUST end up wired to a `npx obsidian-cli-mcp` process running on the Windows host.

```jsonc
{
  "mcpServers": {
    "obsidian-cli-mcp": {
      "command": "<your host-stdio bridge command>",
      "args": ["<args that exec 'npx obsidian-cli-mcp' on the Windows host>"]
    }
  }
}
```

## Tool reference

`obsidian_exec` — the single tool registered by this bridge in v0.1.

### Input

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `command` | `string` (non-empty) | yes | The CLI subcommand (e.g., `"version"`, `"search"`, `"eval"`). |
| `parameters` | `Record<string, string \| number \| boolean>` | no | Assembled into argv as `key=value` tokens; numbers and booleans stringified. |
| `flags` | `string[]` | no | Bare-word flags (no `--` prefix). |
| `vault` | `string` (non-empty) | no | When set, prepends `vault=<value>` as the first positional after the binary. |
| `copy` | `boolean` | no | When `true`, appends `--copy` as the final argv token. |
| `timeoutMs` | `integer` (1..120000) | no | Per-call timeout (default `30000`). Counts from spawn, not from enqueue. |

Full JSON Schema: [specs/001-add-cli-bridge/contracts/obsidian_exec.tool.json](specs/001-add-cli-bridge/contracts/obsidian_exec.tool.json).

### Output (success)

```jsonc
{
  "stdout": "<captured stdout, UTF-8>",
  "stderr": "<captured stderr, UTF-8>",
  "exitCode": 0,
  "argv": ["obsidian", "<command>", "<...kvParams>", "<...flags>"]
}
```

`argv` is the fully reproducible argv vector as the spawned process sees it, including the binary as `argv[0]`.

### Output (failure — `isError: true`)

Errors are returned via the MCP SDK's `isError: true` shape with a JSON-encoded payload of `{ code, message, details }`. Stable error codes:

| `code` | When | Key `details` fields |
|--------|------|----------------------|
| `CLI_NON_ZERO_EXIT` | Spawned `obsidian` exited non-zero | `argv`, `stdout`, `stderr` |
| `CLI_BINARY_NOT_FOUND` | `obsidian` not on PATH and `OBSIDIAN_BIN` unset/wrong | `binaryAttempted`, `PATH` |
| `CLI_TIMEOUT` | Call exceeded `timeoutMs` (default 30 s) | `argv`, `timeoutMs`, `partialStdout`, `partialStderr` |
| `CLI_OUTPUT_TOO_LARGE` | Either stream crossed the 10 MiB cap | `argv`, `stream`, `limitBytes`, `capturedBytes`, `partial` |
| `VALIDATION_ERROR` | Input failed zod validation | `issues[]` (path, message, code) |
| `TOOL_NOT_FOUND` | Caller named a tool other than `obsidian_exec` | `requestedName`, `knownTools` |

Full error contract: [specs/001-add-cli-bridge/contracts/errors.contract.md](specs/001-add-cli-bridge/contracts/errors.contract.md).

## Operating notes

- **Calls serialize.** A FIFO queue runs at most one `obsidian` child at a time. If you fire several `obsidian_exec` calls in parallel, they complete in arrival order. The `queueDepth` field in each `call.start` log line tells you how many calls were waiting when each one started.
- **Stdout is sacred.** Logs and diagnostics go to stderr only; stdout is reserved for the MCP wire protocol. Pipe stderr if you want to keep logs: `npx obsidian-cli-mcp 2> bridge.log`.
- **Output cap is 10 MiB per stream** (stdout and stderr counted independently). Calls returning megabytes of payload (e.g., `eval` over a huge vault) get a `CLI_OUTPUT_TOO_LARGE` with the captured 10 MiB prefix in `details.partial`.
- **Clean shutdown.** Ctrl+C, `Stop-Process`, `taskkill` (without `/F`), or MCP-client disconnect all run the same cleanup: kill any in-flight `obsidian` child (SIGTERM, then SIGKILL after a 2-second grace), drop queued calls, emit a final `bridge.shutdown` log line, exit with code 0. **Hard kills (`taskkill /F`) bypass cleanup** — that's a host-OS limitation, not a bridge defect.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Tool doesn't appear in MCP client | Bridge process not booting | Run `npx obsidian-cli-mcp` directly in a terminal; check stderr for the error |
| `CLI_BINARY_NOT_FOUND` | `obsidian` not on PATH | Set `OBSIDIAN_BIN` in MCP-client `env` to the absolute binary path; restart the client |
| `CLI_NON_ZERO_EXIT` on every call | Obsidian desktop not running | Open Obsidian; retry |
| `CLI_TIMEOUT` on slow commands | Default 30 s too short for the workload | Pass `timeoutMs: 90000` (max 120000) on the call |
| `CLI_OUTPUT_TOO_LARGE` | Payload exceeded 10 MiB cap | Narrow the query (smaller `limit:`, narrower `eval` scope) |
| MCP wire seems corrupted / client disconnects | Something wrote to stdout that wasn't the SDK | A constitution violation slipped through; check recent changes for stray `console.log` or `process.stdout.write` |

## Attributions

**v0.1 — no upstream lifts.** All code under `src/` is original. Future composed code will be enumerated here per constitution Principle V (Attribution & Layered Composition Transparency).

The implementation depends on these third-party packages (declared in `package.json`):

- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) — MIT — MCP server transport and tool registration (constitution-mandated).
- [`zod`](https://github.com/colinhacks/zod) — MIT — boundary input validation (constitution-mandated).
- [`zod-to-json-schema`](https://github.com/StefanTerdell/zod-to-json-schema) — ISC — converts the canonical zod schema to a JSON Schema for the MCP tool's published `inputSchema` (single source of truth, Principle III).

## License

See [LICENSE](LICENSE).

## Spec Kit artifacts

This feature was developed via the Spec Kit workflow. Full design documents live under [specs/001-add-cli-bridge/](specs/001-add-cli-bridge/):

- [spec.md](specs/001-add-cli-bridge/spec.md) — feature specification with 5 clarifications
- [plan.md](specs/001-add-cli-bridge/plan.md) — implementation plan with constitution-check
- [research.md](specs/001-add-cli-bridge/research.md) — phase 0 implementation-pattern decisions
- [data-model.md](specs/001-add-cli-bridge/data-model.md) — entity shapes and lifecycles
- [contracts/](specs/001-add-cli-bridge/contracts/) — MCP tool, errors, logging, server contracts
- [tasks.md](specs/001-add-cli-bridge/tasks.md) — dependency-ordered task list
- [.specify/memory/constitution.md](.specify/memory/constitution.md) — project constitution (Principles I–V)
