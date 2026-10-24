# Read (full and surgical)

Tools that return the content of one note, either in full or one piece of it.
The contract for each tool — inputs, output shape, error roster, examples — is
in its `docs/tools/` page, which is also what `help` serves. This page covers
how the group is built.

| Tool | Pipeline | Contract |
| --- | --- | --- |
| `read` | native CLI `read` | [docs/tools/read.md](../../docs/tools/read.md) |
| `read_heading` | `eval` template over `metadataCache` headings | [docs/tools/read_heading.md](../../docs/tools/read_heading.md) |
| `read_property` | native CLI `properties` | [docs/tools/read_property.md](../../docs/tools/read_property.md) |

## How it is built

All three take `target_mode` ([architecture](../architecture.md#targeting-target_mode)):
`specific` with `vault` and exactly one of `file` or `path`, or `active` for
the focused note.

`read` is the thinnest tool in the server. It routes through `invokeCli`
and returns the CLI's stdout verbatim as `{ content }`. Because it shares the
typed-tool bounds, a note whose text exceeds 10 MiB fails as
`CLI_OUTPUT_TOO_LARGE` rather than returning a partial body. It was the first
typed tool (BI-006, PR #7, as `read_note`) and took its current name in the
BI-022 rename (PR #24).

`read_heading` (PR #17) exists so a client does not pull a whole long note to
read one section. It does not parse Markdown itself. Its frozen template reads
the heading array Obsidian has already parsed into `metadataCache`, and finds
the section by a `::`-separated path such as `"H1::H2"`.

`read_property` (PR #15) returns `{ value, type }` with the YAML type
preserved, so a client can tell the number `7` from the string `"7"`.

## Failure

The usual dispatch codes apply. Beyond them: `ERR_NO_ACTIVE_FILE` when active
mode has nothing focused; `CLI_REPORTED_ERROR` (with `details.code` where the
tool can name the condition) for a missing note, an unknown vault, or a
section path that matches no heading.

An absent property, or a note with no frontmatter, is **not** a failure for
`read_property`: it returns `{ value: null, type: "unknown" }`. That is a
documented success, not an empty result standing in for an error.

## Known limits

- `read_heading` handles ATX headings only. It needs at least two path
  segments, so an H1-only section cannot be addressed, and it cannot match a
  heading whose text contains `::`. Setext headings are out of reach. The
  documented fallback is `read` plus parsing on the client.
- `read_heading` returns the direct body only, stopping at the next heading of
  any depth. Child sections are not included.
