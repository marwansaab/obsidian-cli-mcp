# List and inventory

Tools that enumerate what is in a vault or a note, without reading content.
Per-tool contracts are the `docs/tools/` pages linked below.

| Tool | Pipeline | Contract |
| --- | --- | --- |
| `files` | native CLI `files`, filtered by the server | [docs/tools/files.md](../../docs/tools/files.md) |
| `paths` | `eval` template | [docs/tools/paths.md](../../docs/tools/paths.md) |
| `outline` | native CLI `outline` | [docs/tools/outline.md](../../docs/tools/outline.md) |
| `properties` | native CLI `properties` | [docs/tools/properties.md](../../docs/tools/properties.md) |
| `tags` | native CLI `tags` | [docs/tools/tags.md](../../docs/tools/tags.md) |

## How it is built

`files`, `paths`, `outline` and `properties` return a `{ count, <items> }`
envelope, and all four accept `total: true`, which returns the count with an
empty list — a cheap check before a large read. The envelope keeps the same
shape either way. `tags` (PR #85) is the exception, described below: it
returns `{ total, tags }` and has no count-only mode.

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

Since PR #85, `outline`, `properties` and `tags` decode the CLI's
`format=json` reply through one shared leaf,
[src/tools/_cli-json.ts](../../src/tools/_cli-json.ts) (`parseCliJson`). Each
tool had carried an identical inline copy until code review on that PR asked
for the lift. The error each produces — `"<Label> JSON parse failed: …"` with
`details.stage: "json-parse"` — did not change. `outline` and `properties`
still validate the decoded array with a throwing zod `.parse()`, while `tags`
uses `safeParse` and its own `shape-parse` stage. Review left that difference
in place on purpose: moving the older two onto `tags`' pattern would have
changed their error contract.

### `tags` — the tag inventory

`tags` (PR #85, spec 068) answers "which tags exist, and how often?" It is the
counterpart of `tag` in the
[search and discovery](search-and-discovery.md) group, which answers "which
notes carry this tag?" It lists the whole vault by default, or one note's tags
through `file`, `path` or `activeOnly: true`.

- **Scope rules are tool-local.** `tags` takes `target_mode`, but neither of
  the shared refinements fits: the note-scoped one requires exactly one
  locator, and the folder-scoped one forbids locators. So `tags` extends
  `targetModeBaseSchema` with its own `superRefine`
  ([src/tools/tags/schema.ts](../../src/tools/tags/schema.ts)). It keeps the
  cohort's vault rules (specific mode requires `vault`, active mode forbids
  it) and adds that at most one of `file` / `path` / `activeOnly: true` may be
  set, in **either** mode. That choice is ADR-038 (Tags Tool-Local Target-Mode
  Scope Matrix); ADR-003 is unchanged. `path` goes through the same Layer-1
  structural check as the write cohort.
- **It always calls `invokeCli` in specific mode.** In active mode `invokeCli`
  strips `file` and `path` from the parameters, which would quietly turn a
  one-note request into a whole-vault listing. The handler therefore sends
  `target_mode: "specific"` in both modes; in active mode the schema has
  already guaranteed there is no `vault`, so no `vault=` reaches argv and the
  CLI targets the focused vault (research R3). Every call is exactly one
  `obsidian tags format=json counts` spawn, plus `file=`, `path=` or `active`
  for a note scope. The CLI's own `sort` and `total` options are never sent.
- **The reply is reshaped on the server.** `No tags found.` (exit 0, not
  JSON) becomes `{ total: 0, tags: [] }`. One leading `#` is stripped from
  each name, so a name can be passed straight to `tag`. Upstream sends counts
  as decimal strings; they are parsed strictly into integers.
- **Ordering is the server's, not Obsidian's.** Names sort by an ASCII-only
  lower-case fold, then by UTF-8 byte order of the original name, so
  non-ASCII letters are never folded and the order is total. `sortByCount`
  sorts by count descending first. The byte comparator is the shared leaf
  [src/tools/_utf8-compare.ts](../../src/tools/_utf8-compare.ts)
  (`compareUtf8Bytes`), which PR #85's review moved out of `files` so that
  neither tool imports the other (constitution Principle I). `files` sorts
  its paths with the same function.

## Failure

`paths` reports a missing folder or a folder path that names a file as
`CLI_REPORTED_ERROR` with `details.code` `FOLDER_NOT_FOUND` or `NOT_A_FOLDER`.
`outline` passes on the CLI's rejection of non-Markdown files as
`CLI_REPORTED_ERROR`.

`tags` adds no error codes (PR #85). An unknown vault and a missing note stay
`CLI_REPORTED_ERROR` from dispatch and are never turned into an empty list. A
reply the handler cannot read is `CLI_REPORTED_ERROR` with `details.stage`
`json-parse`, `shape-parse` or `count-parse`, naming the step that failed.
`ERR_NO_ACTIVE_FILE` from `activeOnly: true` keeps its code, `cause` and
`details` but gets a new message that points at `file` / `path`, and
`details.tool: "tags"`.

## Known limits

- `files` cannot tell a missing folder, an empty folder, and a folder path
  that names a file apart. All three return `{ count: 0, paths: [] }`, because
  the CLI does not distinguish them. `paths` can, through `eval`.
- `outline` shows both ATX and Setext headings because it defers to the CLI,
  while `read_heading` addresses ATX headings only. A Setext heading can
  therefore appear in an outline and still not be readable by section.
- `tags` counts **occurrences** — inline plus frontmatter, with no per-note
  de-duplication — while `tag` counts **notes**. The two numbers for the same
  tag differ.
- `tags` inherits two scope differences from Obsidian. Vault-wide listings
  merge case variants under the first casing Obsidian met and include implied
  parent tags (`a` for `a/b`) with rolled-up counts; per-note listings do
  neither. The server does not synthesise parent tags (spec 068
  Clarifications Q4, amended by research F9).
- `tags` has no pagination. Its reply is bounded only by the CLI's 10 MiB
  output cap; T024 measured about 56 bytes per tag on a 2,015-tag vault, so
  the cap allows roughly 187,000 tags. `includeCounts: false` drops `count`
  from the reply but does not raise that ceiling, because the CLI is always
  asked for counts.
- The "vault is required in specific mode" / "vault is not allowed in active
  mode" wording now exists in three places: the two refinements in
  `target-mode.ts` and `tags`' own `superRefine`. PR #85's review deferred a
  shared helper, because it would edit `target-mode.ts`, which ADR-038 says
  stays untouched. Folding them together needs an owner decision and an
  amendment to ADR-038.
