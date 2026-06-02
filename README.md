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
- Structured failures via a small set of error codes (`VALIDATION_ERROR`, `CLI_REPORTED_ERROR`, `FILE_NOT_FOUND`, `ERR_NO_ACTIVE_FILE`, `CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT`, etc.), so clients can pattern-match instead of parsing free-text stderr.

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

### Auto-launch when Obsidian is closed

If the Obsidian **application** is not running when a tool is called, the server recovers automatically: it detects the app-not-running condition, launches Obsidian via the OS-registered `obsidian://` URI (Windows `start` / macOS `open` / Linux `xdg-open`) — targeting the requested vault when one is named, so recovery lands on the right vault — waits a bounded period (up to 30 seconds) for the app to become ready, and re-runs the original command so the caller gets the normal result from a single call. The already-running path is untouched — recovery is strictly reactive and adds no overhead when Obsidian is open. Re-running is side-effect-safe even for mutating commands, because an app-not-running failure means the CLI errored before the command ever executed.

Auto-launch is **on by default**. To disable it (for headless, CI, or locked-down hosts where starting a GUI app is undesirable), set the `OBSIDIAN_AUTO_LAUNCH` environment variable to one of `0`, `false`, `no`, or `off` (case-insensitive). With auto-launch disabled, a call made while Obsidian is closed fails fast with a distinct, actionable error (`CLI_NON_ZERO_EXIT` carrying `details.reason: "obsidian-not-running"`) instead of launching the app. The same distinct error surfaces when a launch is attempted but the app does not become ready within the bound.

```json
{
  "mcpServers": {
    "obsidian-cli": {
      "command": "npx",
      "args": ["-y", "@marwansaab/obsidian-cli-mcp"],
      "env": {
        "OBSIDIAN_AUTO_LAUNCH": "off"
      }
    }
  }
}
```

## Multi-vault support

The Obsidian Integrated CLI can address any vault registered in Obsidian, and this server exposes that directly. You do **not** need to manually switch Obsidian to the vault you want to act on — every tool that accepts a `vault` argument routes to that vault by display name, whether it is the focused vault, an open-but-unfocused vault in another window, or a registered vault that is currently closed.

### Two ways to target a vault

- **Specific mode** — pass `vault: "<display name>"` (the name as it appears in Obsidian's vault switcher). The call runs against that vault regardless of which vault is focused. Vault-wide tools (`tag`, `find_by_property`, `paths`, `properties`, `pattern_search`, …) take an optional `vault`; file-targeted tools take `target_mode: "specific"` + `vault` + a `file`/`path` locator.
- **Active mode** — omit `vault` (or pass `target_mode: "active"`). The call runs against whichever note/vault Obsidian currently has **focused**. Convenient for "act on what I'm looking at", but it depends on Obsidian's live focus state — prefer specific mode for unattended or multi-vault automation.

### What to expect

| Scenario | Behaviour |
|---|---|
| `vault=` names the **focused** vault | Runs against it. |
| `vault=` names an **open but unfocused** vault | Runs against it. For reads/queries/writes the focus does **not** move, so your current view is undisturbed — no need to switch vaults first. |
| `vault=` names a **registered but closed** vault | The server transparently opens it and retries once, then returns the normal result from the single call. The first call on a cold vault pays a short startup delay. |
| Obsidian **application is not running** | Auto-launch recovery opens Obsidian on the requested vault and re-runs the command (see [Auto-launch when Obsidian is closed](#auto-launch-when-obsidian-is-closed)). |
| `vault=` names an **unregistered / unknown** vault | Fails fast with a structured `CLI_REPORTED_ERROR` (`details.code: "VAULT_NOT_FOUND"`, `details.reason: "unknown"`) — never a silent wrong-vault answer. |
| **Active mode**, no note focused | `ERR_NO_ACTIVE_FILE` — open a note, or use specific mode. |

### Opening files across vaults

`open_file` is the one tool that intentionally changes focus: it opens the requested file **in the vault you name** and switches Obsidian's focus to that vault, reporting how the file was placed (`new_tab_created`, `existing_tab_reused`, or `active_tab_used`). It works against the focused vault, an open-but-unfocused vault, or a closed-but-registered vault (which it opens first) — so an automation can surface any file in any registered vault without a human pre-switching vaults.

### Vault names and discovery

Use the **exact** Obsidian display name. The server has no in-band vault-enumeration tool yet, so supply the names your workflow needs out-of-band (e.g. in your client config or session context).

> [!NOTE]
> **Duplicate display names.** If two registered vaults share the *same* display name, `vault=` cannot tell them apart, and focusing one does not help. Give colliding vaults distinct display names to disambiguate.

## Tool inventory

The server currently registers thirty-three public tools. Call `help({ tool_name: "<name>" })` at runtime for the full per-tool documentation (parameters, output shape, error roster, and worked examples) — the listing below is just the index.

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
| `open_file` | Surface an existing vault file (any recognised type — note, canvas, PDF, image, attachment) as the focused, active file in the running Obsidian workspace. Opens in the vault you name — focused, open-but-unfocused, or closed-but-registered (opened on demand) — and switches focus to it, reporting tab placement (`new_tab_created` / `existing_tab_reused` / `active_tab_used`); `new_tab` opt-in. |

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
