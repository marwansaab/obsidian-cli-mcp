# obsidian-cli-mcp

[![npm version](https://img.shields.io/npm/v/@marwansaab/obsidian-cli-mcp.svg)](https://www.npmjs.com/package/@marwansaab/obsidian-cli-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An MCP server that gives Claude and other MCP clients typed, schema-validated tools for Obsidian vaults, through the [Obsidian Integrated CLI](https://help.obsidian.md/cli).

> [!NOTE]
> **Work in progress.** Tools, error contracts and module layout still change between releases. Pin a version if stability matters, and expect breaking changes before `v1.0`.

> [!IMPORTANT]
> **Personal project.** Built for my own use, with no support guaranteed. Issues and pull requests are welcome but may sit unattended.

## What it offers

Thirty-five tools to read, search, list, write, patch, move and delete notes, run find-and-replace, query Obsidian Bases and search semantically through Smart Connections. `obsidian_exec` reaches the rest of the CLI.

- **Validated input.** Every parameter is described in the published schema.
- **Typed results.** Thirty-one tools publish an output schema and return `structuredContent` with the same JSON in the text block. `read`, `help`, `obsidian_exec` and `tag`'s count-only form return text.
- **Structured failures.** A client can act on an error without parsing its message (see [Errors](#errors)).
- **Any registered vault, by name.** Obsidian does not have to be switched to it first. Writes stay inside the target vault.

## Built for how clients use MCP servers now

- **One server, both protocol eras.** Built on MCP SDK v2, the stdio server answers both the current protocol (`2026-07-28`) and the previous one (`2025-11-25`), with nothing to configure.
- **Tools say what they do.** Every tool has a title and all four behaviour hints, so clients can decide what needs approval. The 22 read-only tools can run in parallel without a prompt in clients that honour the hints, such as Claude Code.
- **The model starts out knowing the tools.** At session start the server sends instructions on which tool fits which task, naming only the tools it offers. Tool descriptions stay short; `help` with a tool's name returns its full contract.
- **Confirmation before irreversible changes.** A permanent `delete` and a `find_and_replace` commit across more than one note ask you through your client's own form (MCP elicitation), never through the model (see [below](#confirmation-before-irreversible-changes)).
- **Cancellation and progress.** Cancelling a call stops it: a queued call never starts, a running CLI process is stopped, and a `find_and_replace` commit stops before its next note. Progress is reported while Obsidian starts and after each note of a commit.
- **You set the limits.** Code execution is off by default, and the server can offer only the read-only tools or a chosen list (see [Settings](#settings)).

## Install

```sh
npm install -g @marwansaab/obsidian-cli-mcp
```

Requires Node.js 22.11+ and Obsidian 1.12+, with the Integrated CLI on `PATH` or its path set in `OBSIDIAN_BIN`. Runs on Windows, macOS and Linux. CI tests every change on Linux and Windows with Node 22 and 24.

## Configure your MCP client

Claude Code:

```sh
claude mcp add obsidian-cli -s user -- npx -y @marwansaab/obsidian-cli-mcp
```

Claude Desktop, and other clients that take a `command` and `args`:

```json
{
  "mcpServers": {
    "obsidian-cli": {
      "command": "npx",
      "args": ["-y", "@marwansaab/obsidian-cli-mcp"],
      "env": { "OBSIDIAN_BIN": "C:/path/to/obsidian.exe" }
    }
  }
}
```

Omit `OBSIDIAN_BIN` if the CLI is on `PATH`. On Linux, the Obsidian AppImage usually needs its CLI entry point exposed on `~/.local/bin`.

## Settings

Environment variables, read once at start-up. Flag values (`1`, `true`, `yes`, `on`, or `0`, `false`, `no`, `off`) are case-insensitive.

| Variable | Default | Effect |
|---|---|---|
| `OBSIDIAN_BIN` | found automatically | Path to the Obsidian CLI binary. |
| `OBSIDIAN_AUTO_LAUNCH` | on | Off stops the server from starting Obsidian when it is closed. |
| `OBSIDIAN_MCP_ALLOW_EVAL` | off | On lets `obsidian_exec` run code. Read the warning below first. |
| `OBSIDIAN_MCP_READ_ONLY` | off | On offers only the 22 read-only tools. |
| `OBSIDIAN_MCP_TOOLS` | all tools | Comma-separated list of the only tools to offer. |
| `OBSIDIAN_MCP_DISABLE` | none | Comma-separated list of tools never to offer. |
| `OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES` | 500 | Most replacements one `find_and_replace` call may make. |

### Auto-launch

If Obsidian is not running, the server opens it through the `obsidian://` handler (on the named vault), waits up to 30 seconds and runs the command again. Running it again is safe even for writes, because the CLI fails before doing anything while Obsidian is closed. With auto-launch off, or if Obsidian is not ready in time, the call returns `CLI_NON_ZERO_EXIT` with `details.reason: "obsidian-not-running"`.

### Code execution through `obsidian_exec`

By default `obsidian_exec` refuses `eval`, `devtools`, every `dev:*` command, `restart`, `plugin:install`, `plugin:enable` and `plugin:disable`, plus any `command` containing `=`. A refused call returns `VALIDATION_ERROR` with `details.code: "COMMAND_BLOCKED"`. The typed tools are unaffected. See [obsidian_exec.md](docs/tools/obsidian_exec.md#blocked-commands) for the exact rules.

> [!WARNING]
> With `OBSIDIAN_MCP_ALLOW_EVAL` on, any connected model can run arbitrary JavaScript inside Obsidian with your account's rights: read, change or delete any file you can, and reach the network. Even with the block on, command-palette commands (`command`) and `plugin:reload` can run plugin code indirectly. That residual risk is accepted.

### Limit which tools are offered

`OBSIDIAN_MCP_TOOLS` applies first, then `OBSIDIAN_MCP_DISABLE` (a name in both is not offered), then `OBSIDIAN_MCP_READ_ONLY` (which drops write tools even if listed). An unknown tool name in either list stops the server at start-up with an error that lists the valid names. If no tools are left, the server still starts, with no tools.

```json
"env": {
  "OBSIDIAN_MCP_READ_ONLY": "1",
  "OBSIDIAN_MCP_DISABLE": "smart_connections_query,smart_connections_similar"
}
```

### Confirmation before irreversible changes

`delete` with `permanent: true`, and a `find_and_replace` commit with none of `file`, `path` or `active_note`, ask you to confirm through a client form that names the vault, the target and the counts. A folder-limited commit still asks. Declining or dismissing the form returns `VALIDATION_ERROR` with `details.code: "CONFIRMATION_DECLINED"`. A client that cannot show forms gets `CONFIRMATION_UNAVAILABLE`. Either way, nothing changes.

> [!WARNING]
> **Some clients decline without asking.** Claude Code's non-interactive mode (`claude -p`, the Agent SDK, the Code tab in the desktop app) declines every form unseen, so these actions always return `CONFIRMATION_DECLINED` there. Use an interactive terminal session, delete to the trash instead, or commit one note at a time. Confirmation never goes through the model: a model that has been misled could claim you said yes.

## Working with vaults

- **Specific mode.** Pass the vault's display name as it appears in Obsidian's vault switcher. Note tools take `target_mode: "specific"` with a `vault` and exactly one of `file` or `path`. The call runs against that vault whether it is focused, open in the background, or registered but closed (Obsidian opens it, and the server retries once). Use this mode for automation.
- **Active mode.** Omit `vault` or pass `target_mode: "active"` to act on the note Obsidian has focused. With no note focused, the call returns `ERR_NO_ACTIVE_FILE`.

Reads, searches and writes never move Obsidian's focus. Only `open_file` does, and `get_active_file` reports it. An unknown vault name returns a structured error, never an answer from another vault; each tool's page names its exact shape. `vaults` lists the valid names and rereads Obsidian's list on every call, so a vault added after start-up works without a restart. Give every vault a distinct display name: when two share one, calls go to only one of them.

## Errors

Every tool's page in [docs/tools/](docs/tools/index.md) lists the errors it can return.

Every failure, whether bad input, a CLI exit, an Obsidian `Error:` answer, a timeout or a filesystem fault, is carried as one `UpstreamError` value with a stable `code`, the original `cause` and a `details` object. It returns to the client as an `isError: true` result with a `{ code, message, details }` envelope. The top-level codes are few and fixed. The specific condition goes in `details.code` (for example `FILE_NOT_FOUND`, `COMMAND_BLOCKED`) and its state in `details.reason` (for example `obsidian-not-running`, `cli-disabled`). A client can therefore branch on the error without reading prose.

Upstream failures are classified, never swallowed. The CLI layer reads each finished Obsidian call in a fixed order: non-zero exit, the "command line disabled" notice, `Error: No active file`, then any other `Error:` answer. Each handler then maps what it recognises, such as a missing note or a locked file, to a specific `details.code`. The server never falls back silently or returns an empty result in place of a failure. See the [error spine](.docs-as-code/architecture.md#error-spine) for the design.

## Tool inventory

Thirty-five tools in seven groups. Each name links to its full reference, which `help` also returns.

| Capability | What it covers | Tools |
|---|---|---|
| [Read](.docs-as-code/capabilities/read.md) | A whole note, one heading, or one property | [`read`](docs/tools/read.md) · [`read_heading`](docs/tools/read_heading.md) · [`read_property`](docs/tools/read_property.md) |
| [Search and discovery](.docs-as-code/capabilities/search-and-discovery.md) | Text, regex, property and tag search; links in and out; the focused file | [`search`](docs/tools/search.md) · [`context_search`](docs/tools/context_search.md) · [`pattern_search`](docs/tools/pattern_search.md) · [`find_by_property`](docs/tools/find_by_property.md) · [`tag`](docs/tools/tag.md) · [`links`](docs/tools/links.md) · [`backlinks`](docs/tools/backlinks.md) · [`open_file`](docs/tools/open_file.md) · [`get_active_file`](docs/tools/get_active_file.md) |
| [Mutate](.docs-as-code/capabilities/mutate.md) | Write, append, prepend and patch notes; set properties; find-and-replace; rename, move and delete, keeping each file's type | [`write_note`](docs/tools/write_note.md) · [`append_note`](docs/tools/append_note.md) · [`prepend`](docs/tools/prepend.md) · [`patch_heading`](docs/tools/patch_heading.md) · [`patch_block`](docs/tools/patch_block.md) · [`set_property`](docs/tools/set_property.md) · [`find_and_replace`](docs/tools/find_and_replace.md) · [`rename`](docs/tools/rename.md) · [`move`](docs/tools/move.md) · [`delete`](docs/tools/delete.md) |
| [List and inventory](.docs-as-code/capabilities/list-and-inventory.md) | Folders, recursive paths, headings, property names, vaults | [`files`](docs/tools/files.md) · [`paths`](docs/tools/paths.md) · [`outline`](docs/tools/outline.md) · [`properties`](docs/tools/properties.md) · [`vaults`](docs/tools/vaults.md) |
| [Obsidian Bases](.docs-as-code/capabilities/bases.md) | List bases and views, run a view, add an item | [`bases`](docs/tools/bases.md) · [`views_base`](docs/tools/views_base.md) · [`query_base`](docs/tools/query_base.md) · [`create_base`](docs/tools/create_base.md) |
| [Smart Connections](.docs-as-code/capabilities/plugin-backed.md) | Semantic search; needs the [plugin](https://github.com/brianpetro/obsidian-smart-connections) installed and indexed | [`smart_connections_query`](docs/tools/smart_connections_query.md) · [`smart_connections_similar`](docs/tools/smart_connections_similar.md) |
| [Escape hatch and meta](.docs-as-code/capabilities/escape-hatch-and-meta.md) | Raw CLI passthrough (code blocked by default); per-tool reference | [`obsidian_exec`](docs/tools/obsidian_exec.md) · [`help`](docs/tools/help.md) |

## How it is built

[.docs-as-code/](.docs-as-code/README.md) describes the server as built, covering architecture, tech stack, decisions and each capability. It is updated in the same pull request as the code. A fingerprint baseline pins the published tool surface, so any change to a description or schema has to be deliberate.

## License

MIT. See [LICENSE](LICENSE).

## Acknowledgements

- The [Obsidian](https://obsidian.md) team, for the Integrated CLI this server wraps.
- [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) by Brian Petro, for the embeddings behind the `smart_connections_*` tools.
