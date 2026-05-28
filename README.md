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

The server currently registers thirty-two public tools. Call `help({ tool_name: "<name>" })` at runtime for the full per-tool documentation (parameters, output shape, error roster, and worked examples) — the listing below is just the index.

### Read (full + surgical)

| Tool | Purpose |
|---|---|
| `read` | Read a note's full body. |
| `read_heading` | Read the body under a single named heading. |
| `read_property` | Read one frontmatter property as a typed `{ value, type }` envelope. |

### Search + discovery

| Tool | Purpose |
|---|---|
| `search` | Vault-wide literal-string search; returns matching paths, or per-line matches when `context_lines: true`. Wraps the upstream CLI's `search` / `search:context` subcommands natively. |
| `context_search` | Per-line literal-phrase search returning `{ path, line, text }` per match — collapses the "find file → read file → locate line" three-call pattern to one call. |
| `pattern_search` | ECMAScript-regex search across notes; returns one entry per non-empty match with `{ path, line, offset, match, text }`. Regex companion to `context_search`. |
| `find_by_property` | Find notes whose frontmatter field matches a value (scalar or list); type-faithful comparison. |
| `tag` | Vault-relative paths of every Markdown note carrying a given tag, as `{ count, paths }`, or a bare integer in count-only mode. |
| `backlinks` | Incoming-link inventory — every source note referencing a target note via wikilink. Inverse of [`links`](#); cohort-uniform LEADING truncation when the source cap fires. |
| `links` | Outbound-link inventory for a single note (the outgoing-direction sibling of `backlinks`). |

### Mutate (single note + property)

| Tool | Purpose |
|---|---|
| `append_note` | Append content at the end of an existing note in a single call; default-separator (file's existing trailing line break IS the separator) or `inline:true` fuse; active mode requires no opt-in flag (additive-not-destructive cohort exception); content preserved byte-for-byte verbatim. |
| `find_and_replace` | Preview-then-commit find-and-replace across a vault (or subfolder); code blocks + HTML comments skipped by default; bounded by `OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES`. |
| `patch_block` | Surgically replace the body tied to a named `^block-id` block-reference marker inside a note. Single placement mode (replace); three success shapes (paragraph, list-item, separately-placed); first-match-wins on duplicate ids. |
| `patch_heading` | Surgically rewrite the body under a named heading inside a note. Three placement modes (append, prepend, replace); heading addressed by its full hierarchical `#`-separated path. |
| `prepend` | Prepend content at the LOGICAL top of an existing note in a single call — frontmatter-aware (lands AFTER any YAML frontmatter, preserving the frontmatter byte-for-byte); default-separator with FR-006a symmetric (content's trailing newline IS the separator); `inline:true` fuses onto the existing leading body line. 24 KiB content cap (Windows argv ceiling). CLI-wraps upstream `obsidian prepend`. |
| `write_note` | Create or overwrite a note. |
| `set_property` | Write a single frontmatter property. |
| `delete` | Delete a note. |
| `rename` | Rename a note in place. |
| `move` | Move a note (optionally renaming); honours the vault's auto-update-links setting. |

### List + inventory

| Tool | Purpose |
|---|---|
| `files` | List files directly inside a folder (single-level, no recursion). |
| `paths` | Recursive enumeration of every file and folder under a vault or sub-folder; `{ count, paths }` envelope. |
| `outline` | List headings in a note. |
| `properties` | Vault-wide inventory of frontmatter property names with per-property note counts. |

### Obsidian Bases

| Tool | Purpose |
|---|---|
| `bases` | Enumerate all `.base` files in the vault; returns `{ bases, count }` with paths sorted lexicographically. |
| `views_base` | List views inside the currently focused `.base` file (active-mode-only); returns `{ views, count }`. |
| `query_base` | Run a named view from an Obsidian Bases (`.base`) file; returns `{ columns, rows, truncated, total_rows? }` with reserved row-locator `path` at `columns[0]`. |
| `create_base` | Create a new item (Markdown note) within a `.base` file; returns `{ path, name }` with the actual filename (auto-increments on collision). |

### Plugin-backed (require Smart Connections)

| Tool | Purpose |
|---|---|
| `smart_connections_similar` | Find notes similar to a given source note via Smart Connections' embedding index. |
| `smart_connections_query` | Free-text natural-language semantic search; returns the nearest block-level matches as `{ count, matches: [{ path, headingPath, score }] }`. |

### Escape hatch + meta

| Tool | Purpose |
|---|---|
| `obsidian_exec` | Escape hatch — invoke any Obsidian CLI subcommand directly. |
| `help` | Progressive-disclosure documentation for the tools above. |

## License

MIT. See [LICENSE](LICENSE).

## Acknowledgements

- The [Obsidian](https://obsidian.md) team for the Integrated CLI that this server wraps.
- [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) by Brian Petro for the embeddings powering the `smart_connections_*` tools.
