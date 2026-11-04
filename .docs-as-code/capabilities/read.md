# Read (full and surgical)

Tools that return the content of one note, either in full or one piece of it.
The contract for each tool — inputs, output shape, error roster, examples — is
in its `docs/tools/` page, which is also what `help` serves. This page covers
how the group is built.

| Tool | Pipeline | Contract |
| --- | --- | --- |
| `read` | native CLI `read`, after a type check on the resolved file, corrected by a disk read (PR #102) | [docs/tools/read.md](../../docs/tools/read.md) |
| `read_heading` | `eval` template over `metadataCache` headings | [docs/tools/read_heading.md](../../docs/tools/read_heading.md) |
| `read_property` | native CLI `properties` | [docs/tools/read_property.md](../../docs/tools/read_property.md) |

## How it is built

All three take `target_mode` ([architecture](../architecture.md#targeting-target_mode)):
`specific` with `vault` and exactly one of `file` or `path`, or `active` for
the focused note.

`read` routes through `invokeCli` and returns the file's exact text as
`{ content }`. Because it shares the typed-tool bounds, a note whose text
exceeds 10 MiB fails as `CLI_OUTPUT_TOO_LARGE` rather than returning a
partial body. It was the first typed tool (BI-006, PR #7, as `read_note`) and
took its current name in the BI-022 rename (PR #24).

Until PR #97 it was also the thinnest tool in the server: one CLI call,
whatever the file. It returned decoded binary for an image or a PDF. Since
PR #97 (spec 070 Clarifications Q3) it reads notes, canvases and bases — the
text formats — and rejects attachments and unknown types with
`UNSUPPORTED_FILE_TYPE`, naming `open_file` as the alternative for an
attachment. To know the type it first resolves the file
([file types](../architecture.md#file-types-check-the-file-that-will-be-acted-on)):
a `path` is classified as given, a `file` name costs one `obsidian file`
resolver call, and active mode one focused-file `eval`. A `file` call then
forwards the original `file=`; an active call forwards the resolved `path=`
with no `vault=`, so a focus change between the two calls cannot make it read
a different file. `read_heading` and `read_property` are unchanged by PR #97.

### Exact content: the CLI's text, corrected from the disk bytes

Until PR #102 `read` returned the CLI's stdout verbatim, on the understanding
that stdout *was* the file. It is not quite. A plan-time live probe of
`obsidian read` against 14 byte fixtures (spec 074 research F2) showed the CLI
changes the text in two ways: it appends `\n` when the file does not end with
one, and it removes one leading UTF-8 byte-order mark. `docs/tools/read.md`
documented the first as a "trailing-newline caveat" and claimed "no BOM
strip", which was wrong. Both changes break a round trip with the write
tools: an agent that read a note with no final line break and wrote the text
back added one.

Since PR #102 (BI-0115, spec 074 FR-001, research D1) the CLI call and its
argv are unchanged. Only after it succeeds does the handler read the file's
bytes from disk and take two one-bit facts from them, which the pure
`exactContent(stdout, disk)` in `src/tools/read/handler.ts` applies:

- the last byte is not `0x0A` and stdout ends with `\n` → drop that one `\n`;
- the bytes start with `EF BB BF` → put U+FEFF back in front.

The returned text is still built from stdout only; no disk content reaches the
result. So every failure the CLI raises — missing note, unknown vault, the
output cap, timeout, cancellation, closed-vault auto-open — is raised exactly
as before and before any disk read, and no `realpath` containment is needed
for the joined path, because the read cannot disclose anything the CLI did not
already return. Why this beat returning the disk text or replacing the CLI
read is in
[ADR-047](../decisions/ADR-047-read-corrects-the-cli-text-from-two-disk-facts.md).

```mermaid
sequenceDiagram
  participant H as read handler
  participant R as resolveFileTarget
  participant C as invokeCli
  participant V as vaultRegistry
  participant F as fs.readFile
  H->>R: locator
  R-->>H: relPath, vault, locator (+ vaultRoot in active mode)
  H->>H: assertSupportedFileType(relPath)
  H->>C: obsidian read (argv unchanged)
  C-->>H: stdout, or the CLI's failure, unchanged
  alt specific mode
    H->>V: resolveVaultPath(vault)
    V-->>H: vault root
  end
  H->>F: vaultRoot + relPath
  F-->>H: bytes, or FS_WRITE_FAILED reason "read"
  H->>H: exactContent(stdout, bytes)
```

The vault root comes from two places (research D2). In active mode it is the
focused-file `eval`'s `base`, which `resolveFileTarget` already fetched;
`FileTarget` carries it as `vaultRoot` only when `vault` is `undefined`, a
union the type checker narrows (review finding F1, commit `57b17af`). In
specific mode it is `vaultRegistry.resolveVaultPath`, called **after** the CLI
read, so an unknown vault still fails at the CLI rather than as the registry's
`VALIDATION_ERROR`. That is why `read` does not use `resolveFsTarget`, which
resolves the registry first. `createServer` now passes `vaultRegistry` to
`createReadTool`; that one argument is PR #102's only change to the boot spine.
Since PR #123 the per-mode choice is `fileTargetVaultRoot` in
`src/tools/_file-target.ts`, shared with `move`, which looks the root up
after a failed move to rewrite it out of the error
([mutate](mutate.md#missing-destination-folder-and-vault-relative-failures)).
`read`'s calls and results did not change.
The disk read goes through an `fs?.readFile` seam on `ExecuteDeps`
(default `node:fs/promises`), and reads the whole file rather than its first
three bytes and last byte, a saving no measurement asked for (research D3).

`read_heading` (PR #17) exists so a client does not pull a whole long note to
read one section. It does not parse Markdown itself. Its frozen template reads
the heading array Obsidian has already parsed into `metadataCache`, and finds
the section by a `::`-separated path such as `"H1::H2"`.

The path starts at the note's level-1 heading, and each later segment is the
heading exactly one level below the previous one, so a level-3 target needs
three segments (`"Project::Tasks::Today"`). That has always been how the
template resolves a path (spec 079 research F1); until PR #107 the published
text said only "at least two segments", and agents read it as "leave the
level-1 heading out". They wrote `"Tasks::Today"` and got `HEADING_NOT_FOUND`
although both headings exist. PR #107 states the rule in the description, the
`heading` parameter description and the help page, lists the sections no path
can reach, and names a left-out level-1 heading or a skipped level as the
usual cause of heading-not-found, before the advice to call `outline`.
Behaviour, codes and every runtime message are unchanged (spec 079
Clarifications Q1), including the one-segment validation message
`at least two ::-separated segments (e.g. "H1::H2")`; the help page now
explains that it refers to a one-segment path. `patch_heading` resolves its
`#`-separated paths by the same rule and its text changed in the same PR
([mutate](mutate.md#heading-paths)). Only the two tools' description and
schema fingerprints moved in the register baseline.

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

Since PR #131 (BI-0181;
[ADR-064](../decisions/ADR-064-tags-are-compared-and-returned-without-one-leading-hash.md))
the value is verbatim from Obsidian's metadata cache except for the property
named exactly `tags`. The cache holds `tags` with a leading `#` after
Obsidian's own frontmatter writer has updated the note and without it after
a file-watcher parse, so the same note read back two ways. The handler now
passes a `tags` value through `withoutTagHash` (`src/tools/_tag-hash.ts`),
which removes one leading `#` from a scalar string or each string in a list
and returns the form written in the file. A tag written as `'#y'` in the YAML
reads back as `y`, and `##x` as `#x`; `type` and the heterogeneous-list
downgrade are unchanged. `find_by_property` compares `tags` by the same rule
([search and discovery](search-and-discovery.md)).

Published surface (PR #90; [architecture](../architecture.md#registration--the-one-path-from-a-schema-to-a-published-tool)):
all three carry the read-only hint row, so a client that honours annotations
can run them in parallel without a "may modify data" prompt (068 SC-006). Their
descriptions no longer restate the locator rule or end with a call-help
sentence; the rule is in the shared `target_mode`, `vault`, `file` and `path`
descriptions ([targeting](../architecture.md#targeting-target_mode)).

Typed results (PR #91; [architecture](../architecture.md#typed-results-outputschema-and-structuredcontent)):
`read_heading` and `read_property` publish an `outputSchema` and return their
result as `structuredContent` as well as the identical text. `read` does not:
its `{ content }` text block is kept byte-identical (068 FR-041). That held
the envelope's shape, not the value: since PR #102 `content` itself differs
for a file with no final line break or with a leading byte-order mark.
PR #102's description said "Returns the file's exact text as
{ content }: nothing added or removed", which moved only `read`'s description
fingerprint in the register baseline (spec 074 FR-009). Since PR #143
(spec 092) it opens "Read the exact text of a note, canvas or base in an
Obsidian vault, with nothing added or removed.", names `read_heading`,
`read_property` and `open_file` as the alternatives, and leaves the
`{ content }` shape to the help page
([ADR-074](../decisions/ADR-074-tool-descriptions-route-within-a-budget-and-the-help-page-holds-the-contract.md)).
`read_property`'s input root description lost its internal identifiers in
the same PR.

## Failure

The usual dispatch codes apply. Beyond them: `ERR_NO_ACTIVE_FILE` when active
mode has nothing focused; `CLI_REPORTED_ERROR` (with `details.code` where the
tool can name the condition) for a missing note, an unknown vault, or a
section path that matches no heading. `read` adds `VALIDATION_ERROR` with
`details.code: "UNSUPPORTED_FILE_TYPE"`, `reason: "unsupported-type"` for a
file that is not a note, canvas or base (PR #97); resolution failures for a
`file` name or the focused file surface first, unchanged. Until PR #142 that
message, like the write tools', ended "Nothing was changed.", which said
nothing true about a tool that never writes. Since PR #142 (BI-0174, item 13)
`read` and `outline` pass `readOnly: true` to `assertSupportedFileType` and
the sentence is left out; the write tools keep it
([architecture](../architecture.md#file-types-check-the-file-that-will-be-acted-on)).

Before PR #137 (BI-0132) `read` returned Obsidian's disabled-command-line
notice as the note's content, because the CLI answers every command with it
on exit 0. Dispatch now fails that answer as `CLI_REPORTED_ERROR` with
`details.reason: "cli-disabled"` before `read` sees any stdout, so no content
is returned and the disk is not read; the read cohort's eval-backed tools get
the same failure instead of a `json-parse` one
([architecture](../architecture.md#error-spine)).

Since PR #102 `read` has one failure that runs after a successful CLI read:
the confirmation read of the file's bytes. If the file was deleted or locked
in between, or the server cannot read the vault folder, the call fails as
`FS_WRITE_FAILED` with `details: { reason: "read", errno, syscall?, path }`
and keeps the `cause` (spec 074 FR-008, research D4). That is the read-side
shape `find_and_replace` already used, so no code or sub-reason was added; the
price is a code whose name says "write" on a read-only tool. It never falls
back to the uncorrected stdout. A failed registry lookup in specific mode
propagates unchanged. `getSyscall`, which builds `details.syscall`, moved into
`src/tools/_fs-errors.ts` beside `getErrno` in the same PR (review finding
F2) and is shared with the write cohort's mapper and `find_and_replace`.

An absent property, or a note with no frontmatter, is **not** a failure for
`read_property`: it returns `{ value: null, type: "unknown" }`. That is a
documented success, not an empty result standing in for an error.

## Known limits

- `read_heading` handles ATX headings only. Until PR #107 this entry said only
  that it "needs at least two path segments, so an H1-only section cannot be
  addressed". That was true but incomplete, the same gap the tool's own text
  had: because a path starts at the level-1 heading and descends one level per
  segment, no path reaches a level-1 section by itself, any section in a note
  with no level-1 heading, or any section below a skipped level (a `###`
  directly under a `#`). A skip below the target or in another branch does
  not block it, and a path may start at any level-1 heading. It also cannot
  match a heading whose text contains `::`, and Setext headings are out of
  reach. The documented fallback for all of these is `read` plus parsing on
  the client; reaching them is left out of spec 079 (plan Follow-ups).
- `read_heading`'s path rule has no in-process test. It resolves inside an
  Obsidian `eval`, so PR #107's live check (spec 079 T038: full path found;
  left-out level 1, skipped level and no level-1 heading all
  `HEADING_NOT_FOUND`) is its only pin. `patch_heading`'s `walkHeadings` has
  characterisation tests for the same cases.
- `read_heading` returns the direct body only, stopping at the next heading of
  any depth. Child sections are not included.
- PR #102 corrected `read` only. `read_heading`, `read_property` and the
  search tools may show the same two CLI changes (an added final line feed, a
  dropped byte-order mark); spec 074 leaves each to its own item once
  confirmed. `obsidian_exec` running `read` keeps the raw CLI output by
  design.
- A write that lands between the CLI read and the disk read can change the
  two facts, so the correction may follow the newer version of the file. The
  window is a few milliseconds of local I/O and the outcome is the
  last-write-wins the write cohort already accepts; no locking was added
  (spec 074 research D5).
- A `read` right after `write_note` *creates* a note can fail before the
  correction runs: PR #102's live round trip (T023) got
  `Error: File "Sandbox/t074/rt.md" not found.` from the CLI, and a following
  `append_note` got `EXTERNAL_EDITOR_CONFLICT` (`EPERM`), until a 2 s settle
  let Obsidian pick up the new file. This is the CLI's view lagging the disk,
  not the correction, and PR #102 did not change it.
- Specific-mode `read` now depends on the vault registry for the correction,
  so the first such call in a process pays the registry's lazy
  `obsidian vaults verbose` probe; later calls hit its cache
  ([architecture](../architecture.md#two-ways-to-touch-a-note-through-the-cli-or-directly)).
- No in-process test pins the line-ending strip at
  `src/tools/read_heading/_template.ts:42-43`. The start-of-body behaviour the
  help page documents rests on PR #96's one-off live probe. Review of PR #96
  (finding F1) asked for a `_template.test.ts`; 069's clarification ruled out
  new tests in a docs-only BI, so the test was returned to the owner rather
  than added.
