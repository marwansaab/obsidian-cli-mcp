# Available Tools

Call `help({ tool_name: "<name>" })` to read the full Markdown documentation for any tool below. Calling `help()` with no arguments returns this index.

- **append_note** — _(documentation pending — owned by a future BI)_.
- **delete** — Delete a note from an Obsidian vault. Default sends the file to the OS trash (recoverable); `permanent: true` is irreversible.
- **files** — List files directly inside a vault folder (returns `{ count, paths }` — non-recursive folder-scoped enumeration, sub-folder + dotfile entries dropped, paths sorted by UTF-8 byte order; supports `total: true` for count-only mode).
- **find_by_property** — Find notes whose frontmatter property matches a given value (returns `{ count, paths }` — the value→file inverse of `read_property`).
- **help** — Look up full Markdown documentation for any registered MCP tool.
- **links** — Return the flat ordered list of every outgoing link in a Markdown note (returns `{ count, links: [{ target, line, kind, displayText? }] }` — link-graph primitive; frontmatter-declared wikilinks intermingled in source order; closed `{wikilink, embed, markdown}` kind enum; `total: true` switches to count-only mode).
- **list_notes** — _(documentation pending — owned by a future BI)_.
- **list_vaults** — _(documentation pending — owned by a future BI)_.
- **obsidian_exec** — Invoke any Obsidian Integrated CLI subcommand.
- **outline** — Return the flat ordered list of every heading in a Markdown note (returns `{ count, headings: [{ level, text, line }] }` — structural-discovery primitive; `total: true` switches to count-only mode).
- **properties** — List every distinct frontmatter property name in a vault with per-property note counts (returns `{ count, properties: [{ name, noteCount }] }` — vault-wide structural-discovery primitive; case-insensitive-primary + byte-tiebreak sort places case-distinct duplicates adjacent; `total: true` switches to count-only mode).
- **read** — Read a note's raw text from an Obsidian vault by file (wikilink), path, or active focus.
- **read_heading** — Read the body of a single named heading from a vault note (returns `{ content: string }` — replaces full-file `read` plus client-side Markdown parse for the section-extraction case).
- **read_property** — Read a single named frontmatter property from a vault note (returns `{ value, type }` with native YAML types preserved).
- **rename** — Rename a `.md` note in place; honours the vault's auto-update-links setting.
- **search_vault** — _(documentation pending — owned by a future BI)_.
- **set_property** — Write a single named frontmatter property to a vault note (returns `{ written: true, path, name }` — surgical single-property write, the symmetric write companion to `read_property`).
- **smart_connections_similar** — Return the typed list of semantically-similar block-level matches for a single source note via the Smart Connections plugin (returns `{ count, matches: [{ path, headingPath, score }] }` — plugin-backed similarity primitive; requires the Smart Connections plugin to be installed and indexed; `total: true` switches to count-only mode; `limit` 1..100 default 20).
- **write_note** — Create a note in an Obsidian vault, or overwrite an existing one with `overwrite: true`. Wraps the CLI's `create` subcommand.
