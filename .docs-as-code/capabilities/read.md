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

The body is the note text from the end of the matched heading line to the
start of the next heading of any depth, or the end of the note. The template
then removes the heading line's own line ending, CRLF or LF, before returning
(`src/tools/read_heading/_template.ts:42-43`); nothing else is trimmed or
normalised. So a body starts with a line break only when the note has a blank
line directly under the heading. Until PR #96 the help page said the opposite —
that every body "always begins with a leading `\n`" and should be trimmed —
which was never true of the template. An agent that followed it deleted the
first character of real content, or left a stray `\r` in a CRLF note. PR #96
corrected `docs/tools/read_heading.md` only, with no code change, after 11 live
reads against fixture notes (`specs/069-fix-section-body-docs/contracts/t0-probe-findings.md`);
the per-layout table is in that page's "Start of body" section.

`read_property` (PR #15) returns `{ value, type }` with the YAML type
preserved, so a client can tell the number `7` from the string `"7"`.

Published surface (PR #90; [architecture](../architecture.md#registration--the-one-path-from-a-schema-to-a-published-tool)):
all three carry the read-only hint row, so a client that honours annotations
can run them in parallel without a "may modify data" prompt (068 SC-006). Their
descriptions no longer restate the locator rule or end with a call-help
sentence; the rule is in the shared `target_mode`, `vault`, `file` and `path`
descriptions ([targeting](../architecture.md#targeting-target_mode)).

Typed results (PR #91; [architecture](../architecture.md#typed-results-outputschema-and-structuredcontent)):
`read_heading` and `read_property` publish an `outputSchema` and return their
result as `structuredContent` as well as the identical text. `read` does not:
its `{ content }` text block is kept byte-identical (068 FR-041).

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
- No in-process test pins the line-ending strip at
  `src/tools/read_heading/_template.ts:42-43`. The start-of-body behaviour the
  help page documents rests on PR #96's one-off live probe. Review of PR #96
  (finding F1) asked for a `_template.test.ts`; 069's clarification ruled out
  new tests in a docs-only BI, so the test was returned to the owner rather
  than added.
