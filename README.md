# obsidian-cli-mcp

[![npm version](https://img.shields.io/npm/v/@marwansaab/obsidian-cli-mcp.svg)](https://www.npmjs.com/package/@marwansaab/obsidian-cli-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A small MCP server that bridges Claude (and other MCP clients) to the [Obsidian Integrated CLI](https://help.obsidian.md/cli), exposing an Obsidian vault as a set of typed, schema-validated tools.

> [!NOTE]
> **Status — actively work in progress.** The tool surface, error contracts, and module layout still evolve from release to release. Pin a version if stability matters; expect breaking changes before `v1.0`.

> [!IMPORTANT]
> **Personal project.** Built and maintained for my own use. External support is not guaranteed — use at your own discretion. Issues and pull requests are welcome but may sit unattended.

## Purpose

Most MCP-driven Obsidian workflows reach for a single "do anything" escape hatch and rebuild the same primitives in every prompt. This server takes the opposite approach: a handful of **typed tools** for the operations a language model actually performs against a vault (read a note, read one frontmatter field, list files in a folder, find notes by property value, write a note, rename a note, list headings, list outbound links, and so on), plus one explicit escape hatch (`obsidian_exec`) for everything else.

Each typed tool has:

- A `zod`-validated input schema, surfaced as JSON Schema to the MCP client.
- A stable output shape — strings, structured arrays, or `{ count, items }` envelopes — defined once and verified by co-located tests.
- Structured failures via a small set of error codes (`VALIDATION_ERROR`, `CLI_REPORTED_ERROR`, `FILE_NOT_FOUND`, `NO_ACTIVE_FILE`, `CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT`, etc.), so clients can pattern-match instead of parsing free-text stderr.

## Vision

A thin, well-typed bridge — not a feature-for-feature mirror of the upstream CLI. The aim is to cover the small set of vault primitives that real LLM workflows need with stable contracts and predictable failure modes, and to let the escape hatch absorb the long tail of less-used CLI subcommands. The bar for adding a new typed tool is that it materially replaces a brittle pattern (e.g., "full-file read + client-side Markdown parse") with a single call whose contract a model can rely on.

## Smart Connections tools — plugin dependency

The `smart_connections_*` cohort wraps the [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) Obsidian plugin's runtime API via the CLI's `eval` subcommand. **These tools only work when:**

- The Smart Connections plugin is installed and **enabled** in the target vault.
- The plugin has finished embedding the vault (its index reports ready).

If those conditions aren't met, the affected tools return a structured error (`SMART_CONNECTIONS_NOT_INSTALLED` or `SMART_CONNECTIONS_NOT_READY`) — they do not silently degrade. All other tools in this server have no such dependency; if you don't use Smart Connections, you can ignore the cohort entirely.

## Install

```sh
npm install -g @marwansaab/obsidian-cli-mcp
```

Requirements:

- **Node.js** 22.11 or later.
- **Obsidian** 1.12 or later with the Integrated CLI binary on `PATH`, or the path set via the `OBSIDIAN_BIN` environment variable.
- Supported on Windows, macOS, and Linux.

## Configure your MCP client

Example configuration for Claude Desktop (the same shape works for other MCP clients that accept `command` + `args`):

```json
{
  "mcpServers": {
    "obsidian-cli": {
      "command": "npx",
      "args": ["-y", "@marwansaab/obsidian-cli-mcp"],
      "env": {
        "OBSIDIAN_BIN": "C:/path/to/obsidian.exe"
      }
    }
  }
}
```

Omit `OBSIDIAN_BIN` if the Obsidian CLI is already on `PATH`. On Linux, the Obsidian AppImage typically needs its CLI entry point exposed on `~/.local/bin`.

## Tool inventory

The server currently registers fifteen public tools. Call `help({ tool_name: "<name>" })` at runtime for the full per-tool documentation (parameters, output shape, error roster, and worked examples) — the listing below is just the index.

| Tool | Purpose |
|---|---|
| `read` | Read a note's full body. |
| `read_heading` | Read the body under a single named heading. |
| `read_property` | Read one frontmatter property. |
| `find_by_property` | Find notes whose frontmatter field matches a value. |
| `write_note` | Create or overwrite a note. |
| `set_property` | Write a single frontmatter property. |
| `delete` | Delete a note. |
| `rename` | Rename a note in place. |
| `move` | Move a note (optionally renaming); honours the vault's auto-update-links setting. |
| `files` | List files directly inside a folder. |
| `outline` | List headings in a note. |
| `properties` | Vault-wide inventory of frontmatter property names. |
| `links` | List outbound links in a note. |
| `smart_connections_similar` | Find notes similar to a given source note (requires the Smart Connections plugin). |
| `obsidian_exec` | Escape hatch — invoke any Obsidian CLI subcommand directly. |
| `help` | Progressive-disclosure documentation for the tools above. |

## License

MIT. See [LICENSE](LICENSE).

## Acknowledgements

- The [Obsidian](https://obsidian.md) team for the Integrated CLI that this server wraps.
- [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) by Brian Petro for the embeddings powering the `smart_connections_*` tools.
