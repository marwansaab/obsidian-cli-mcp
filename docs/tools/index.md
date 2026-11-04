# Available Tools

Call `help({ tool_name: "<name>" })` to read the full Markdown documentation for any tool below. Calling `help()` with no arguments returns this index.

- **append_note** — Add content to the end of an existing note.
- **backlinks** — List the notes that link to a note, one entry per source note, with optional per-source reference counts.
- **bases** — List every Obsidian Bases (`.base`) file in a vault as sorted vault-relative paths.
- **context_search** — Find every line in a vault's Markdown notes that contains a literal phrase, returning each match's path, line number and line text.
- **create_base** — Add an item note to an existing Obsidian Bases (`.base`) file.
- **delete** — Delete a file from an Obsidian vault.
- **files** — List the files directly inside one vault folder, or the vault root, without descending into sub-folders.
- **find_and_replace** — Find and replace text or a regex in a vault, a folder or one note.
- **find_by_property** — Find the notes whose frontmatter property matches a given value and return their paths.
- **get_active_file** — Report which file Obsidian has focused, in the focused vault or a named one, without changing focus.
- **help** — Return any registered tool's full contract (inputs, output, errors and examples) as Markdown when given its name in tool_name, or the index of every tool when called with no arguments.
- **links** — List every outgoing link in a note (wikilink, embed or markdown link) in source order, with its target, line and kind.
- **move** — Move a file to another folder in an Obsidian vault, optionally renaming it.
- **obsidian_exec** — Run an Obsidian CLI subcommand and return its stdout, stderr, exit code and the exact argv it ran.
- **open_file** — Show an existing vault file, by path or name, as the active file in Obsidian, switching to the vault you name.
- **outline** — List every heading in a note, in source order, with its level, text and line number.
- **patch_block** — Replace the content tied to one `^block-id` marker in a note, keeping the marker.
- **patch_heading** — Append, prepend or replace the content under one heading of a note, addressed by its heading path.
- **paths** — List every file and folder beneath a vault folder, or the whole vault, recursively.
- **pattern_search** — Search a vault's Markdown notes for an ECMAScript regular expression, returning each match's path, line, offset and line text.
- **prepend** — Add content to the top of an existing note, after any frontmatter.
- **properties** — List every frontmatter property name in a vault with how many notes use each.
- **query_base** — Run a named view of an Obsidian Bases (`.base`) file and return its matched rows as structured JSON.
- **read** — Read the exact text of a note, canvas or base in an Obsidian vault, with nothing added or removed.
- **read_heading** — Read the body of one heading in a note, up to the next heading of any depth, found by its `::`-separated heading path.
- **read_property** — Read one frontmatter property of a note and return its value and type.
- **rename** — Rename a file in place in an Obsidian vault, keeping its folder.
- **search** — Find the Markdown notes in a vault whose text or file name contains a literal phrase, and return their paths.
- **set_property** — Write one frontmatter property on a note, adding it or replacing its value.
- **smart_connections_query** — Semantic search: return the vault blocks nearest in meaning to a free-text question, ranked by the Smart Connections plugin.
- **smart_connections_similar** — Return the vault blocks nearest in meaning to one source note, ranked by the Smart Connections plugin.
- **tag** — Find every Markdown note in a vault that carries a given tag, including its child tags.
- **vaults** — List every vault Obsidian knows, with the name other tools take as `vault` and the vault's folder.
- **views_base** — List the views defined in an Obsidian Bases (`.base`) file, either the one named by `base_path` or the Base focused in Obsidian.
- **write_note** — Create a note, or replace an existing one.
