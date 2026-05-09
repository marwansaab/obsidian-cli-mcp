# Available Tools

Call `help({ tool_name: "<name>" })` to read the full Markdown documentation for any tool below. Calling `help()` with no arguments returns this index.

- **append_note** — _(documentation pending — owned by a future BI)_.
- **delete_note** — Delete a note from an Obsidian vault. Default sends the file to the OS trash (recoverable); `permanent: true` is irreversible.
- **help** — Look up full Markdown documentation for any registered MCP tool.
- **list_notes** — _(documentation pending — owned by a future BI)_.
- **list_vaults** — _(documentation pending — owned by a future BI)_.
- **obsidian_exec** — Invoke any Obsidian Integrated CLI subcommand.
- **read_note** — Read a note's raw text from an Obsidian vault by file (wikilink), path, or active focus.
- **read_property** — Read a single named frontmatter property from a vault note (returns `{ value, type }` with native YAML types preserved).
- **search_vault** — _(documentation pending — owned by a future BI)_.
- **write_note** — Create a note in an Obsidian vault, or overwrite an existing one with `overwrite: true`. Wraps the CLI's `create` subcommand.
