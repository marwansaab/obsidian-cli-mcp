# List and inventory

Tools that enumerate what is in a vault or a note, without reading content.
Per-tool contracts are the `docs/tools/` pages linked below.

| Tool | Pipeline | Contract |
| --- | --- | --- |
| `files` | native CLI `files`, filtered by the server | [docs/tools/files.md](../../docs/tools/files.md) |
| `paths` | `eval` template | [docs/tools/paths.md](../../docs/tools/paths.md) |
| `outline` | native CLI `outline` | [docs/tools/outline.md](../../docs/tools/outline.md) |
| `properties` | native CLI `properties` | [docs/tools/properties.md](../../docs/tools/properties.md) |

## How it is built

All four return a `{ count, <items> }` envelope, and all four accept
`total: true`, which returns the count with an empty list — a cheap check
before a large read. The envelope keeps the same shape either way.

`files` (PR #21, as `list_files`) and `paths` (PR #31 as `tree`; renamed in
PR #34) split one job deliberately: `files` is one level, `paths` is
recursive. The CLI's `files` subcommand actually returns the **recursive**
subtree, so `files` filters on the server to stay one-level. It also drops
sub-folder and dotfile entries, and sorts by UTF-8 byte order with
`Buffer.compare` rather than JavaScript's default UTF-16 order. Its `total`
count is computed after filtering instead of using the CLI's recursive total.
`paths` walks the vault through `eval` and marks folders with a trailing `/`.

`outline` (PR #25) and `properties` (PR #26) wrap the CLI directly. `outline`
takes `target_mode`, because it reads one note. `properties` is vault-scoped:
an optional `vault`, with the focused vault as the default.

## Failure

`paths` reports a missing folder or a folder path that names a file as
`CLI_REPORTED_ERROR` with `details.code` `FOLDER_NOT_FOUND` or `NOT_A_FOLDER`.
`outline` passes on the CLI's rejection of non-Markdown files as
`CLI_REPORTED_ERROR`.

## Known limits

- `files` cannot tell a missing folder, an empty folder, and a folder path
  that names a file apart. All three return `{ count: 0, paths: [] }`, because
  the CLI does not distinguish them. `paths` can, through `eval`.
- `outline` shows both ATX and Setext headings because it defers to the CLI,
  while `read_heading` addresses ATX headings only. A Setext heading can
  therefore appear in an outline and still not be readable by section.
