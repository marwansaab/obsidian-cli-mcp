# Contract: Per-Tool File-Type Support

**Feature**: `070-prevent-filetype-changes` · The declared support set of every in-scope tool, the behaviour each declaration implies, and the sentence its description gains (FR-002, FR-003, FR-003a, FR-010). Decisions: [research.md](../research.md) D2, D3, D6, D7.

The description sentence is generated from the declaration by `describeSupport` in `src/file-type/file-type.ts`: `Supported file types: <list>.` (for example `Supported file types: notes, canvases and bases.`), or, for the any-file tools, `Works on any file type (notes, canvases, bases, attachments and others).`; rename and move add a sentence that the file keeps its type and that a type change goes through `obsidian_exec`. The column below gives the content it must carry. The same types are stated on the tool's `docs/tools/<tool>.md` page. Declarations live in the handler where the handler enforces them (`READ_SUPPORTED`, `OUTLINE_SUPPORTED`, `WRITE_NOTE_SUPPORTED`, `APPEND_NOTE_SUPPORTED`, `PREPEND_SUPPORTED`) and in `index.ts` otherwise (`RENAME_SUPPORTED`, `MOVE_SUPPORTED`, `DELETE_SUPPORTED`, `OPEN_FILE_SUPPORTED` are `"any"`; the description-only notes and bases tools declare their category). `read`, `rename`, `move` and `outline` resolve `file` / `active` targets through one shared helper, `src/tools/_file-target.ts` (`resolveFileTarget`, `forwardedLocator`), which composes the existing `_active-file.ts` resolvers; `_active-file.ts` itself is unchanged.

| Tool | Declared support | Unsupported input → | Description must name | Code change |
|------|------------------|---------------------|-----------------------|-------------|
| `rename` | any file; keeps its extension | destination naming a different recognised type → `UNSUPPORTED_FILE_TYPE` / `type-change` | notes, canvases, bases, attachments and other files; extension kept; type change → `obsidian_exec` | yes: D5 rule replaces `appendMdIfMissing`; `file`/`active` resolve and check; `file` forwards the original `file=`, `active` forwards `path=`; deps gain `vaultRegistry` |
| `move` | any file; keeps its extension | as `rename` | as `rename` | yes: D5 rule replaces source-`.md` guard; `file`/`active` resolve and check; `file` forwards the original `file=`, `active` forwards `path=`; deps gain `vaultRegistry` |
| `delete` | any file | — | notes, canvases, bases, attachments and other files | description + docs only |
| `open_file` | any file Obsidian can display | existing CLI-reported `UNSUPPORTED_FILE_TYPE` (unchanged) | already names them; reworded to the shared sentence | description + docs only |
| `read` | note, canvas, base | attachment or non-core → `UNSUPPORTED_FILE_TYPE` / `unsupported-type`, alternative `open_file` | notes, canvases, bases; not attachments | yes: type check; `file`/`active` resolve and check; `file` forwards the original `file=`, `active` forwards `path=`; deps gain `vaultRegistry` |
| `write_note` | note | non-note `path`, `file` with a recognised non-note extension, or a non-note active file → `unsupported-type` | notes only | yes: type check on the canonical write path / active `relPath` |
| `append_note` | note | non-note resolved target → `unsupported-type` | notes only | yes: type check on resolved `relPath` |
| `prepend` | note | as `append_note` | notes only | yes: as `append_note` |
| `outline` | note | non-note → `unsupported-type` (replaces the undiscriminated upstream error) | notes only | yes: type check; `file`/`active` resolve and check; `file` forwards the original `file=`, `active` forwards `path=`; deps gain `vaultRegistry` |
| `find_and_replace` (single-file scope) | note | existing `VALIDATION_ERROR` / `INVALID_NOTE` / `not-eligible` (unchanged) | notes only | description + docs only |
| `links` | note | existing `CLI_REPORTED_ERROR` / `NOT_MARKDOWN` (unchanged) | notes only | description + docs only |
| `backlinks` | note (target) | as `links` | notes only | description + docs only |
| `smart_connections_similar` | note (source) | as `links` | notes only | description + docs only |
| `views_base` | base (`base_path`) | existing `INVALID_BASE_PATH` (unchanged) | bases only | description + docs only |
| `query_base` | base (`base_path`) | as `views_base` | bases only | description + docs only |
| `create_base` | base (`path`); creates a note item | as `views_base` | bases (and that the created item is a note) | description + docs only |

**Unchanged, out of scope** (FR-013): `read_heading`, `read_property`, `set_property`, `patch_heading`, `patch_block`.

**Not file-path tools** (no change): `files`, `paths`, `search`, `context_search`, `pattern_search`, `tag`, `find_by_property`, `properties`, `bases`, `vaults`, `get_active_file`, `help`, `smart_connections_query`, `obsidian_exec`.

## Server instructions

`src/instructions/instructions.ts`:

- "Read a note: `read`" → names notes, canvases and bases.
- "Move, rename or delete a note: `move`, `rename`, `delete`." → "Move, rename or delete a file: `move`, `rename`, `delete`."
- New rule line, as shipped: "- Unsupported file types fail with UNSUPPORTED_FILE_TYPE; renames and moves keep the type." It names no tool, so it is kept in every configuration.

Opening paragraph unchanged. `instructions.test.ts` holds the full unfiltered text under 2,000 characters (the project's own budget, tighter than the 4,096-character standard); the shipped wording above is what fits it.

## Invariants (tested)

1. For every row with "Code change: yes", the handler rejects an unsupported type before any CLI call that acts on the file and before any filesystem write (FR-007; asserted by "spawn/write not invoked" in handler tests).
2. For every in-scope tool, the description names exactly the declared categories (SC-002; one table-driven test over the declarations).
3. Every successful `rename` / `move` result path has the source's extension (FR-011; handler tests over the data-model worked rows).
4. Markdown behaviour is byte-stable: every pre-existing rename/move/write/append/prepend/read/outline Markdown test passes with its action-call arguments unchanged for `path` and `file` modes; the only permitted test edits are those listed in tasks.md Notes (retargeting to the action spawn after the new resolution spawn, and the active-mode `vault=` + `path=` argument shape) (FR-012, SC-005).
