# Mutate (single note and property)

Tools that change the vault. This group is where the server's two write paths
meet: most of the group writes directly to disk under ADR-009, and the rest
wraps a CLI subcommand. Per-tool contracts are the `docs/tools/` pages linked
below.

| Tool | Pipeline | Contract |
| --- | --- | --- |
| `write_note` | direct filesystem (ADR-009) | [docs/tools/write_note.md](../../docs/tools/write_note.md) |
| `append_note` | direct filesystem | [docs/tools/append_note.md](../../docs/tools/append_note.md) |
| `patch_heading` | direct filesystem | [docs/tools/patch_heading.md](../../docs/tools/patch_heading.md) |
| `patch_block` | direct filesystem | [docs/tools/patch_block.md](../../docs/tools/patch_block.md) |
| `find_and_replace` | direct filesystem scan and write | [docs/tools/find_and_replace.md](../../docs/tools/find_and_replace.md) |
| `prepend` | native CLI `prepend` | [docs/tools/prepend.md](../../docs/tools/prepend.md) |
| `set_property` | native CLI `property:set` | [docs/tools/set_property.md](../../docs/tools/set_property.md) |
| `delete` | native CLI `delete` | [docs/tools/delete.md](../../docs/tools/delete.md) |
| `rename` | native CLI `rename` | [docs/tools/rename.md](../../docs/tools/rename.md) |
| `move` | native CLI `move` | [docs/tools/move.md](../../docs/tools/move.md) |

## The direct-filesystem cohort

`write_note` moved off the CLI in BI-016 (PR #18) because writing content
through argv crashed the Obsidian host on Windows above roughly 4 KB. The
tools added after it that edit a note's body — `append_note` (PR #46),
`patch_heading` (PR #42), `patch_block` (PR #45), and `find_and_replace`
(PR #40) — followed the same path.

Every one of them runs the same stages:

```mermaid
flowchart LR
  loc[resolve locator] --> root[vault root from registry]
  root --> guard[canonical path check]
  guard --> read[fs.readFile]
  read --> edit[pure edit function]
  edit --> write[atomic tmp + rename]
  write --> inv[metadataCache invalidation eval]
```

- **Locator.** In specific mode the vault root comes from the vault registry.
  A wikilink-form `file` is resolved through `obsidian file` first. In active
  mode a focused-file `eval` supplies the path. The helpers are shared in
  `src/tools/_active-file.ts`.
- **Guard.** Both path-safety layers run before anything touches the disk; a
  miss is `PATH_ESCAPES_VAULT`.
- **Edit.** The change itself is a pure function over the file text — for
  example `appendEdit`, or the heading walk and block scan under
  `patch_heading/` and `patch_block/` — tested separately from the I/O.
- **Write.** `writeAtomic` in `src/tools/_note-io.ts`. `EBUSY` and `EPERM`
  are classified as `EXTERNAL_EDITOR_CONFLICT` — and so is `EACCES`, for
  `append_note` and `patch_heading` but not `patch_block` —
  because on Windows they mean another program holds the file. Anything else
  is `FS_WRITE_FAILED`. The per-tool differences are explicit parameters of
  the shared mapper in `src/tools/_fs-errors.ts` (PR #58).
- **Invalidation.** A best-effort `eval` tells Obsidian to drop its cached
  metadata for the file, so the next CLI read sees the new text. A failure
  here does not fail the write.

**Concurrency is last-write-wins**, except in `patch_heading`. It walks the
heading tree again just before writing and fails with `HEADING_RACE` if the
section moved. Nothing else detects an editor changing the file between the
read and the write.

**`find_and_replace` is preview-then-commit.** The default call returns every
occurrence it would change. `commit: true` scans again, compares the count
against the preview (`OCCURRENCE_COUNT_DRIFT`), checks the
`OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES` bound (default 500), and then writes
each note in turn, serialised through the shared queue. A write failure
partway through reports which notes were already written, in
`FS_WRITE_FAILED` `details`. By default the scan skips fenced code and HTML
comments. Its scope is the vault, a subfolder, or — since BI-066 (PR #73;
ADR-032, Find And Replace File Scope via Sibling Locators) — a single note.
The checks on those scope fields — path safety on `file` and `path`, the
`[[…]]` reject on `file`, and the `SCOPE_CONFLICT` matrix — moved into
[src/tools/_note-locator.ts](../../src/tools/_note-locator.ts) in PR #84,
which `tags` also uses
([ADR-035](../decisions/ADR-035-shared-sibling-locators.md)). `append_note`
and `prepend` take the wikilink-bracket message from the same module, so its
wording can no longer drift between tools. (`open_file` keeps its own,
differently worded message.)

## The CLI-wrapped tools

`prepend` (PR #47) wraps the CLI, unlike its sibling `append_note`. The CLI's
own frontmatter detection is the behaviour the tool promises: content lands
after a leading YAML block. The cost is the argv limit, so content is capped
at **3072** UTF-16 code units. BI-047 (PR #49) lowered the cap from 24576
after larger writes were seen to leave the Obsidian GUI degraded until
restarted. The same PR added a silent-no-op guard. The file is `stat`ed before
and after the call, and if the CLI reports success but the file did not grow,
the call fails as `FS_WRITE_FAILED` with
`details.reason: "post-stat-byte-delta-zero"`. It is not returned as a success
with `bytes_written: 0`.

`set_property` wraps `property:set`. It infers the property type from the JS
value when `type` is omitted, except for `date` and `datetime`, which must be
given explicitly. `delete`, `rename` and `move` are thin wrappers. `delete`
sends a note to the OS trash unless `permanent: true`. `rename` and `move` take
the vault's "Automatically update internal links" setting as it is: whether
links are rewritten depends on vault configuration, not on this server.

## Targeting rules specific to writes

`write_note` in active mode requires `overwrite: true`, because replacing the
focused note destroys content. `append_note` and `prepend` need no opt-in in
active mode, because adding cannot destroy anything. `write_note` defaults to
`overwrite: false`, so a collision returns `FILE_EXISTS`. It also does not
create a note for `append_note`/`prepend`: those return `NOTE_NOT_FOUND` for a
missing target.

## Known limits

- `rename` only handles `.md` notes. Other file types go through
  `obsidian_exec`.
- `write_note` dropped its `template` parameter in the ADR-009 rewrite;
  template-based creation goes through `obsidian_exec`.
- Writes made by the direct path are visible to Obsidian through the cache
  invalidation and its own file watcher. Nothing confirms that the GUI has
  re-rendered.
