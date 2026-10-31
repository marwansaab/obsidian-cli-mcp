# obsidian-cli-mcp

[![npm version](https://img.shields.io/npm/v/@marwansaab/obsidian-cli-mcp.svg)](https://www.npmjs.com/package/@marwansaab/obsidian-cli-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An MCP server that gives Claude and other MCP clients typed, schema-validated tools for working with Obsidian vaults, through the [Obsidian Integrated CLI](https://help.obsidian.md/cli).

> [!NOTE]
> **Status: work in progress.** The tool surface, error contracts and module layout still change from release to release. Pin a version if stability matters, and expect breaking changes before `v1.0`.

> [!IMPORTANT]
> **Personal project.** Built and maintained for my own use. External support is not guaranteed, so use it at your own discretion. Issues and pull requests are welcome but may sit unattended.

## What it offers

Thirty-five tools for the things a model does in a vault: read a note, a heading or a single property; search by text, pattern, tag, property or link; list folders, files, headings, properties and vaults; write, append, prepend and patch notes; rename, move and delete files, keeping each file's type; preview and commit a find-and-replace; query Obsidian Bases; and run semantic searches through the Smart Connections plugin. One passthrough tool, `obsidian_exec`, reaches the rest of the CLI.

Every tool has:

- **A validated input schema**, published to the client with a description on every parameter.
- **A stable result**, defined once and checked by tests. Most tools also publish the result's schema (see [Typed results](#typed-results)).
- **Structured failures**: a small, stable set of error codes, with the specific condition in `details.code` or `details.reason`, so a client can act on a failure without parsing free text (see [Errors](#errors)).

It works across every vault registered in Obsidian, by name, without switching Obsidian to that vault first (see [Working with vaults](#working-with-vaults)). Writes are checked to stay inside the target vault, and a property the server writes is visible to the next search.

## Built for how clients use MCP servers now

MCP clients increasingly decide for themselves which calls need the user's approval, which can run side by side, and how to check and use a result, and they expect a server to tell them. Release 0.9.0 moves this server onto the current MCP standard so clients can do that.

### Current and older clients, one server

The server is built on MCP SDK v2. A single stdio server answers both the current protocol (`2026-07-28`, which starts with `server/discover`) and the previous one (`2025-11-25`, which starts with `initialize`), so current and older clients connect with no setting to change.

### Tools that say what they do

Every tool has a readable title and declares all four behaviour hints: whether it only reads, whether it can overwrite or delete, whether repeating it is safe, and whether it reaches outside the vault. Clients use these to decide what needs your approval. The 22 read-only tools can run in parallel without a prompt in clients that honour the hints, such as Claude Code. The [tool inventory](#tool-inventory) shows each tool's kind.

### The model is oriented from the start

At session start the server sends instructions: what it is for, which tool fits which task, and the rules that apply to every tool. These include using `target_mode: "specific"` for automation, previewing `find_and_replace` before committing, and treating note content as data rather than as instructions. The instructions mention only the tools the server actually offers. Every parameter's description is published in the tool's schema, so a model can call any tool correctly straight away. `help` is still there for a tool's full reference, with worked examples and its error roster.

### Typed results

Thirty-one tools publish an output schema. A successful call returns its result as `structuredContent` and also as the same JSON in the text block, so a client can validate and use the result directly, while clients that only read text are unaffected. Failures are text only. A result that does not match its own schema is reported as `INTERNAL_ERROR` rather than sent. Four tools have no output schema: `read` and `help` return text, `obsidian_exec` returns the CLI's own output, and `tag`'s count-only form is a bare number.

### Asking before irreversible changes

Two actions cannot be undone, so the server asks you to confirm them through your client first: `delete` with `permanent: true`, and a `find_and_replace` commit that is not limited to one note. The question goes to you through the client's own form (MCP elicitation), not through the model, so a model that has been misled by something it read cannot answer it for you. It therefore works only where the client shows that form to a person. For example, an interactive Claude Code session does, but Claude Code's non-interactive mode does not. See [Confirmation before irreversible changes](#confirmation-before-irreversible-changes).

### Cancellation and progress

If you cancel a call in your client, the server stops it:

- A call still waiting in the queue never starts.
- A running Obsidian CLI process is stopped.
- A `find_and_replace` commit stops before its next note. The note being written is finished.

The server runs one CLI call at a time, so cancelling a slow call lets the next one go ahead.

When the client asks for progress, the server reports it while it waits for Obsidian to start (up to 30 seconds) and after each note of a `find_and_replace` commit.

### You decide what the server can do

- **Code execution is off by default.** `obsidian_exec` refuses the commands that run arbitrary code or drive developer tooling.
- **Fewer tools.** You can offer only the read-only tools, or an allow list or deny list of tools.

Both are read once at start-up. See [Settings](#settings).

## Install

```sh
npm install -g @marwansaab/obsidian-cli-mcp
```

Requirements:

- **Node.js** 22.11 or later.
- **Obsidian** 1.12 or later, with the Integrated CLI binary on `PATH` or its path set in `OBSIDIAN_BIN`.
- Windows, macOS or Linux. Every change is tested on Linux and Windows, with Node 22 and 24.

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
      "env": {
        "OBSIDIAN_BIN": "C:/path/to/obsidian.exe"
      }
    }
  }
}
```

Omit `OBSIDIAN_BIN` if the Obsidian CLI is already on `PATH`. On Linux, the Obsidian AppImage usually needs its CLI entry point exposed on `~/.local/bin`.

## Settings

All settings are environment variables, read when the server starts. A change takes effect the next time it starts.

| Variable | Default | Effect |
|---|---|---|
| `OBSIDIAN_BIN` | found automatically | Path to the Obsidian CLI binary. |
| `OBSIDIAN_AUTO_LAUNCH` | on | `0`, `false`, `no` or `off` stops the server from starting Obsidian when it is closed. |
| `OBSIDIAN_MCP_ALLOW_EVAL` | off | `1`, `true`, `yes` or `on` lets `obsidian_exec` run code. Read the warning below first. |
| `OBSIDIAN_MCP_READ_ONLY` | off | `1`, `true`, `yes` or `on` offers only the 22 read-only tools. |
| `OBSIDIAN_MCP_TOOLS` | all tools | Comma-separated list of the only tools to offer. |
| `OBSIDIAN_MCP_DISABLE` | none | Comma-separated list of tools never to offer. |
| `OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES` | 500 | The most replacements one `find_and_replace` call may make. |

Flag values are case-insensitive.

### Auto-launch when Obsidian is closed

If the Obsidian application is not running when a tool is called, the server:

1. starts Obsidian through the system's `obsidian://` handler, on the requested vault when one is named;
2. waits up to 30 seconds for it to be ready;
3. runs the original command again, so a single call still returns the normal result.

Running the command again is safe even for writes, because the CLI fails before it does anything when Obsidian is not running. When Obsidian is already open, this adds nothing.

With `OBSIDIAN_AUTO_LAUNCH` off, for example on a headless or locked-down machine, a call made while Obsidian is closed fails straight away. It returns `CLI_NON_ZERO_EXIT` with `details.reason: "obsidian-not-running"`. The same error is returned if Obsidian is started but is not ready within 30 seconds.

### Code execution through `obsidian_exec` (off by default)

By default, `obsidian_exec` refuses these commands:

- `eval`;
- `devtools` and every `dev:*` command;
- `restart`;
- `plugin:install`, `plugin:enable` and `plugin:disable`.

A refused call returns `VALIDATION_ERROR` with `details.code: "COMMAND_BLOCKED"`, and nothing runs. A `command` that contains `=` is also refused, so the check cannot be bypassed by passing a vault in `command`. This protects you if a model is steered by text it read in a note. The typed tools are unaffected. [docs/tools/obsidian_exec.md](docs/tools/obsidian_exec.md#blocked-commands) has the exact rules.

> **Warning:** with `OBSIDIAN_MCP_ALLOW_EVAL` set, any connected model can run arbitrary JavaScript inside Obsidian with your user account's rights. It can read, change or delete any file you can, and reach the network. Set it only on a machine and vault where you accept that. Even with the block on, `obsidian_exec` can still run command-palette commands (`command`) and reload plugins (`plugin:reload`), which can run plugin code indirectly. That is an accepted residual risk.

### Limit which tools are offered

`OBSIDIAN_MCP_READ_ONLY`, `OBSIDIAN_MCP_TOOLS` and `OBSIDIAN_MCP_DISABLE` apply in this order:

1. the `OBSIDIAN_MCP_TOOLS` list;
2. then `OBSIDIAN_MCP_DISABLE`, so a name in both lists is not offered;
3. then `OBSIDIAN_MCP_READ_ONLY`, which drops a write tool even when `OBSIDIAN_MCP_TOOLS` names it.

Spaces around names and empty entries are ignored. If nothing is left, the server still starts, with no tools. The server's instructions to the model mention only the tools it offers.

If either list names a tool that does not exist, the server does not start. It writes one error to stderr that names every unknown entry and lists the valid names.

```json
{
  "mcpServers": {
    "obsidian-cli": {
      "command": "npx",
      "args": ["-y", "@marwansaab/obsidian-cli-mcp"],
      "env": {
        "OBSIDIAN_MCP_READ_ONLY": "1",
        "OBSIDIAN_MCP_DISABLE": "smart_connections_query,smart_connections_similar"
      }
    }
  }
}
```

### Confirmation before irreversible changes

Two calls ask you to confirm first:

- `delete` with `permanent: true`;
- a `find_and_replace` commit with none of `file`, `path` or `active_note`. A commit limited to a `folder` still asks.

Your client shows a form with the question and one box to tick. The question names the vault and the note, or the folder, the number of replacements and the number of notes. The answer comes from you through the client, never from the model.

| What happens | Result |
|---|---|
| You tick the box and accept | The action runs. |
| You decline, or dismiss the form | Nothing changes. The call returns `VALIDATION_ERROR` with `details.code: "CONFIRMATION_DECLINED"`, and `details.action` is `"decline"` or `"cancel"`. |
| The client says it cannot show forms | Nothing runs. The call returns `VALIDATION_ERROR` with `details.code: "CONFIRMATION_UNAVAILABLE"`. |
| The client says it can show forms but answers without asking you | Nothing changes. The call returns `CONFIRMATION_DECLINED`, the same as if you had declined. |

A trash delete (no `permanent`) and a commit limited to one note never ask.

> [!WARNING]
> **Some clients answer the form without showing it.** Claude Code shows the form in an interactive terminal session. In non-interactive mode it declines every form without showing it. That mode covers `claude -p`, scripts and automation built on the Agent SDK, and the Code tab in the Claude desktop app. There, a permanent `delete` or a multi-note commit always returns `CONFIRMATION_DECLINED`, even though nobody declined, and nothing changes. The server cannot tell this apart from a real "no". Claude Code's MCP log shows `Elicitation request received in print mode` when it happens.
>
> In those clients, do one of these instead:
> - run the action from an interactive Claude Code session in a terminal;
> - delete to the trash (omit `permanent`);
> - commit one note at a time (pass `file`, `path` or `active_note`).
>
> Confirmation is deliberately not done through the model, for example by having it ask you in chat and then retry. A model that has been misled could claim you said yes, which is exactly what confirmation is there to prevent.

## Working with vaults

Every tool that takes a `vault` acts on that vault by its display name. It doesn't matter whether that vault is focused, open in another window, or registered but closed, so you never need to switch Obsidian to it first.

### Two ways to target a vault

- **Specific mode.** Pass the vault's display name, exactly as it appears in Obsidian's vault switcher. The call runs against that vault whichever one is focused.
  - Vault-wide tools, such as `tag`, `find_by_property`, `paths`, `properties` and `pattern_search`, take an optional `vault`.
  - Note tools take `target_mode: "specific"` with a `vault` and exactly one of `file` or `path`.
- **Active mode.** Omit `vault`, or pass `target_mode: "active"`. The call runs against the note and vault Obsidian has focused. This is handy for "act on what I'm looking at", but it depends on what is focused at that moment, so use specific mode for unattended or multi-vault work.

### What to expect

| Situation | Behaviour |
|---|---|
| The vault is focused | Runs against it. |
| The vault is open but not focused | Runs against it. Reads, searches and writes don't move the focus, so your view is undisturbed. |
| The vault is registered but closed | Obsidian opens it and the server retries once, then returns the normal result. The first call to a closed vault takes a little longer. |
| Obsidian is not running | The server starts Obsidian on that vault and runs the command again (see [Auto-launch](#auto-launch-when-obsidian-is-closed)). |
| The vault name is unknown | A structured error, never an answer from the wrong vault. Tools that go through the CLI return `CLI_REPORTED_ERROR` with `details.code: "VAULT_NOT_FOUND"`. Tools that write files directly return `VALIDATION_ERROR` listing the known vault names. |
| Active mode with no note focused | `ERR_NO_ACTIVE_FILE`. Open a note, or use specific mode. |

### Finding vault names, including new vaults

`vaults` lists every vault Obsidian knows, with its display name and folder. Each call reads Obsidian's current list. A tool given a vault name the server hasn't seen reads the list again before failing. So a vault added after the server started can be used by name straight away, with no restart.

> [!NOTE]
> **Duplicate display names.** If two vaults share a display name, `vault` cannot tell them apart. `vaults` lists both, but a call by that name goes to only one of them. Give each vault a distinct name.

### Opening a file

`open_file` is the one tool meant to change focus. It opens the file in the vault you name, switches Obsidian to that vault, and reports how the file was placed: `new_tab_created`, `existing_tab_reused` or `active_tab_used`. This works whether the vault is focused, open in another window, or registered but closed (in which case it is opened first). `get_active_file` is its read counterpart.

## Errors

Every failure is returned as an MCP error result with a `{ code, message, details }` envelope. The top-level codes are few and stable:

- `VALIDATION_ERROR`
- `CLI_REPORTED_ERROR`
- `CLI_NON_ZERO_EXIT`
- `ERR_NO_ACTIVE_FILE`
- `CLI_TIMEOUT`
- `CLI_OUTPUT_TOO_LARGE`
- `CLI_BINARY_NOT_FOUND`
- `FS_WRITE_FAILED`
- `FILE_EXISTS`
- `PATH_ESCAPES_VAULT`
- `INTERNAL_ERROR`
- `HELP_TOOL_NOT_FOUND`
- `HELP_DOCS_MISSING`

The specific condition goes in `details.code`, for example `FILE_NOT_FOUND`, `VAULT_NOT_FOUND`, `COMMAND_BLOCKED` or `CONFIRMATION_DECLINED`. The state of a condition goes in `details.reason`, for example `obsidian-not-running`. Each tool's `docs/tools/<name>.md` lists the codes it can return.

## Tool inventory

The server registers 35 tools. **Kind** is the tool's declared behaviour:

- **read-only** never changes anything;
- **additive** adds content without overwriting;
- **repeatable** changes something, but repeating it gives the same result;
- **destructive** can overwrite, move or delete;
- **open-world** can reach beyond the vault.

Every tool except `read`, `help`, `obsidian_exec` and `tag` returns typed results.

### Read

| Tool | Kind | Purpose |
|---|---|---|
| `read` | read-only | The full text of a note, canvas or base. |
| `read_heading` | read-only | The content under one heading, addressed by its heading path. |
| `read_property` | read-only | One frontmatter property, as `{ value, type }`. |

### Search and discovery

| Tool | Kind | Purpose |
|---|---|---|
| `search` | read-only | Literal-text search across the vault. Returns matching paths, or matching lines with `context_lines: true`. |
| `context_search` | read-only | Literal-phrase search returning `{ path, line, text }` for every match, in one call. |
| `pattern_search` | read-only | Regular-expression (ECMAScript) search returning `{ path, line, offset, match, text }` for every match. |
| `find_by_property` | read-only | Notes whose frontmatter property matches a value (scalar or list), compared by type. |
| `tag` | read-only | Notes carrying a tag, as `{ count, paths }`, or just the count. |
| `backlinks` | read-only | Every note that links to a note. |
| `links` | read-only | Every link going out of a note. |
| `get_active_file` | read-only | The file Obsidian has focused, in the focused vault or a named one. No focused file is `{ active: null }`. |
| `open_file` | repeatable | Open a file (note, canvas, PDF, image or attachment) in the named vault and focus it. |

### Change notes and properties

| Tool | Kind | Purpose |
|---|---|---|
| `write_note` | destructive | Create a note, or overwrite one. No size limit. |
| `append_note` | additive | Add content at the end of a note, byte for byte. |
| `prepend` | additive | Add content at the top of a note, after any frontmatter. Up to 3,072 characters; use `write_note` for more. |
| `patch_heading` | additive | Append, prepend or replace the content under a heading. |
| `patch_block` | additive | Replace the content tied to a `^block-id`. |
| `set_property` | repeatable | Set one frontmatter property. |
| `find_and_replace` | destructive | Preview, then commit, a find-and-replace across a vault, a folder or one note. Code blocks and HTML comments are skipped by default. A commit beyond one note asks for confirmation. |
| `rename` | destructive | Rename a file in place, keeping its type: a canvas stays a canvas. |
| `move` | destructive | Move a file, optionally renaming it and keeping its type, following the vault's setting for updating links. |
| `delete` | destructive | Delete a file to the trash, or permanently after confirmation. |

### List and inventory

| Tool | Kind | Purpose |
|---|---|---|
| `files` | read-only | Files directly inside a folder (not recursive). |
| `paths` | read-only | Every file and folder under a vault or folder, as `{ count, paths }`. |
| `outline` | read-only | The headings in a note. |
| `properties` | read-only | Every frontmatter property name in the vault, with the number of notes using it. |
| `vaults` | read-only | Every vault Obsidian knows, as `{ count, vaults: [{ name, path, open }] }`. `open` is `null`, because the CLI doesn't report it. |

### Obsidian Bases

| Tool | Kind | Purpose |
|---|---|---|
| `bases` | read-only | Every `.base` file in the vault, sorted by path. |
| `views_base` | read-only | The views in a `.base` file, or in the one open in Obsidian. |
| `query_base` | read-only | Run a view of a `.base` file, returning `{ columns, rows, truncated }`. |
| `create_base` | additive | Create a new item (a note) in a `.base` file, returning its actual path. |

### Smart Connections

| Tool | Kind | Purpose |
|---|---|---|
| `smart_connections_similar` | read-only | Notes similar to a given note. |
| `smart_connections_query` | read-only | Semantic search from free text, returning the nearest blocks with their scores. |

These two tools use the [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) plugin. They work only when the plugin is installed and enabled in the target vault and has finished building its index. Otherwise they return `SMART_CONNECTIONS_NOT_INSTALLED` or `SMART_CONNECTIONS_NOT_READY`. No other tool depends on the plugin.

### Passthrough and reference

| Tool | Kind | Purpose |
|---|---|---|
| `obsidian_exec` | open-world, destructive | Run an Obsidian CLI command directly. Code-running and developer commands are [blocked by default](#code-execution-through-obsidian_exec-off-by-default). |
| `help` | read-only | The full reference for any tool: parameters, result, errors and worked examples. |

## How it is built

[.docs-as-code/](.docs-as-code/README.md) describes the server as built: its architecture, tech stack, decisions and how each group of tools works. It is updated in the same pull request as the code it describes. The published tool surface is pinned by a fingerprint baseline, so a change to any tool's description or schema has to be deliberate.

## License

MIT. See [LICENSE](LICENSE).

## Acknowledgements

- The [Obsidian](https://obsidian.md) team, for the Integrated CLI this server wraps.
- [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) by Brian Petro, for the embeddings behind the `smart_connections_*` tools.
