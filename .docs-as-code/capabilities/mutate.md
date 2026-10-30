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
  write --> inv[metadataCache refresh eval]
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
- **Refresh.** A best-effort `eval` asks Obsidian to recompute its cached
  metadata for the written note, so the next search or property read sees the
  new text (spec 068 FR-001–FR-005, PR #87). `invalidateMetadataCache` in
  `src/tools/_note-io.ts` addresses the note by its vault-relative,
  forward-slash path, and sends the vault exactly as the caller named it:
  `vault=<name>` in specific mode, no `vault=` in active mode, where the write
  went to the open vault. A resolved folder path is never sent as `vault=`.
  A failure does not fail the write, but it is no longer silent: it is logged
  as `bridge.metadata_refresh_failed` with a `reason` of `cli-error`,
  `note-not-found` or `unexpected-output` (see
  [architecture.md](../architecture.md#logging-and-shutdown)).

  Before PR #87 this step did nothing at all. It passed the note's absolute
  path to `getFileByPath`, which takes a vault-relative one, so the lookup
  returned `null` and the refresh was skipped, and the empty `catch` hid it.
  It also ran in active mode, so with another vault focused it would have
  addressed the wrong vault. Searches still mostly came back fresh only
  because Obsidian's own file watcher usually wins the race
  (`specs/068-modernise-mcp-surface/evidence-a1.md`).

  The template calls `computeFileMetadataAsync(file)`, the method Obsidian's
  file watcher uses. It must not call `computeMetadataAsync(file)`, the call
  ADR-009 (Direct Filesystem Write Path Alongside CLI Bridge) §5 names: that
  method takes the file's bytes, not a `TFile`, and the first live run with a
  correct path wedged the vault's metadata worker until Obsidian reloaded
  (T010). A unit test in `_note-io.test.ts` forbids the old call. ADR-009 §5
  still names it.

**Concurrency is last-write-wins**, except in `patch_heading`. It walks the
heading tree again just before writing and fails with `HEADING_RACE` if the
section moved. Nothing else detects an editor changing the file between the
read and the write.

**`find_and_replace` is preview-then-commit.** The default call returns every
occurrence it would change. `commit: true` scans again, compares the count
against the preview (`OCCURRENCE_COUNT_DRIFT`), checks the
`OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES` bound (default 500), and then writes
each note in turn, serialised through the shared queue. Each changed note is
refreshed after its queued write resolves, never inside the `queue.run`
callback: the refresh goes through `invokeCli` and so through the same
single-flight queue, and nesting it would deadlock (T009, PR #87). A write failure
partway through reports which notes were already written, in
`FS_WRITE_FAILED` `details`. By default the scan skips fenced code and HTML
comments. Its scope is the vault, a subfolder, or — since BI-066 (PR #73;
ADR-032, Find And Replace File Scope via Sibling Locators) — a single note.

Since PR #92 (068 FR-052, FR-054, research R11) the commit loop checks the
call's `signal` before each note. A cancel stops it between notes: notes
already written stay written, and because the SDK sends no response for a
cancelled request, the handler logs `find_and_replace.commit_cancelled`
`{vault, committed, skipped}` to stderr and rethrows the abort reason
([architecture](../architecture.md#logging-and-shutdown)). After each written
note it calls `reportProgress?.(written, total, relPath)`, which sends a
progress notification only when the request carried a token. The two scope
predicates, `isSingleNoteScope` and `effectiveSubfolder`, are shared by the
confirmation gate and `resolveScope` since the PR #92 review (commit
`ca25c67`), which had found the checks written twice.

## Confirmation before irreversible changes

Since PR #92 (068 US14, FR-047 to FR-050, research R12) two actions in this
group ask the human first, through the per-call `Confirmation` that
`registerTool` hands the handler
([architecture](../architecture.md#per-call-scope-cancellation-progress-and-confirmation),
ADR-043):

| Tool | Trigger | Step 1: can the client ask? | Step 2: the question |
| --- | --- | --- | --- |
| `delete` | `permanent: true` | at handler entry | straight after step 1, before the spawn; names the vault and the note, or "the active note" |
| `find_and_replace` | `commit: true` with no `file`, `path` or `active_note` (a `subfolder` commit still asks) | at handler entry, **before vault resolution**, which spawns Obsidian | after the commit re-scan, before the first write; names the pattern, occurrence and note counts, the vault and the subfolder |

A client that declares no form elicitation gets `VALIDATION_ERROR` with
`details.code: "CONFIRMATION_UNAVAILABLE"` and a message naming the safe
route (delete to the trash; commit one note at a time); nothing is spawned or
written. A human who does not confirm gives `CONFIRMATION_DECLINED` with
`details.action`, and nothing is changed. A trash delete, a single-note commit,
every preview, and a multi-note commit that finds nothing to write ask
nothing.

`find_and_replace` asks after the re-scan so the question can carry the note
count. The SDK re-enters the handler with the answer, so a confirmed commit
resolves the vault and scans twice; both runs are read-only before the
question, and the drift check (`OCCURRENCE_COUNT_DRIFT`) still guards the
writes against a vault that changed while the human was deciding.

PR #92's T090 live run (test vault, both protocol eras, a v2 client over real
stdio) saw decline change nothing, accept delete permanently and rewrite both
subfolder notes, and a trash delete ask nothing. The same check from Claude
Code was still open for the owner when the PR went to review. Its outcome,
recorded in PR #93's post-implement follow-ups: Claude Code in print mode (the
desktop app's Code tab, `claude -p`, unattended runs) declares form
elicitation and then declines every request, so a permanent `delete` or a
multi-note commit there always returns `CONFIRMATION_DECLINED`, never
`CONFIRMATION_UNAVAILABLE`. The server cannot tell that client apart from a
human who said no; the README documents the limitation, and whether to raise
it upstream is the owner's call.

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
sends a note to the OS trash unless `permanent: true`, which since PR #92
asks the human first ([above](#confirmation-before-irreversible-changes)). On
the PR #92 test vault, which has no `.trash` folder, trash deletes landed in
the OS Recycle Bin. `rename` and `move` take
the vault's "Automatically update internal links" setting as it is: whether
links are rewritten depends on vault configuration, not on this server.

## Targeting rules specific to writes

`write_note` in active mode requires `overwrite: true`, because replacing the
focused note destroys content. `append_note` and `prepend` need no opt-in in
active mode, because adding cannot destroy anything. `write_note` defaults to
`overwrite: false`, so a collision returns `FILE_EXISTS`. It also does not
create a note for `append_note`/`prepend`: those return `NOTE_NOT_FOUND` for a
missing target.

## Published surface

Since PR #90 every tool here publishes a title and all four behaviour hints,
from the rows in `src/tools/_shared.ts`
([architecture](../architecture.md#registration--the-one-path-from-a-schema-to-a-published-tool)):

| Row | Tools here | Why |
| --- | --- | --- |
| destructive | `write_note`, `delete`, `move`, `rename`, `find_and_replace` | they overwrite, remove or relocate content, so a client should confirm (the server itself asks only for the two irreversible cases [above](#confirmation-before-irreversible-changes)) |
| additive write | `append_note`, `prepend`, `patch_heading`, `patch_block` | they change a note without destroying it, but a repeat adds again |
| repeat-safe write | `set_property` | setting the same value twice leaves the same note |

None of these tools has `readOnlyHint: true`, so since PR #92 none of them is
offered when the owner sets `OBSIDIAN_MCP_READ_ONLY`, even if
`OBSIDIAN_MCP_TOOLS` names it
([owner access settings](../architecture.md#owner-access-settings)).

`find_and_replace` is marked destructive even though its default call is a
preview, because the tool as a whole can rewrite notes in bulk. The rule
"preview first, then `commit: true`" moved out of its description into the
server instructions' Rules
([server instructions](../architecture.md#server-instructions)).

Since PR #91 every tool here publishes an `outputSchema` and returns its
result as `structuredContent` beside the identical text
([typed results](../architecture.md#typed-results-outputschema-and-structuredcontent)).
`find_and_replace`'s result is a `preview | commit` union (zod `oneOf`); it
publishes with an object root wrapping both variants, and the result data is
not wrapped. Several handlers here (`append_note`, `delete`, `move`,
`write_note` among them) had no trailing output `.parse()` of their own, so
until review finding B2 was fixed (commit `4e35987`) a result that drifted
from their schema would have reached the client as SDK free text rather than
`INTERNAL_ERROR`.

## Known limits

- `rename` only handles `.md` notes. Other file types go through
  `obsidian_exec`.
- `write_note` dropped its `template` parameter in the ADR-009 rewrite;
  template-based creation goes through `obsidian_exec`.
- Writes made by the direct path are visible to Obsidian through the
  metadata refresh and its own file watcher. Nothing confirms that the GUI has
  re-rendered.
- An active-mode write refreshes whichever vault is open when the refresh
  runs. If focus moves to another vault between the write and the refresh,
  the refresh runs there: it is logged as `note-not-found` when that vault
  has no note at the same path, and refreshes the other vault's note, unlogged,
  when it does. The write itself is unaffected. Spec 068 (Assumptions) records
  this as a risk the owner accepted in PR #87's review.
- `write_note open: true` opens the note by its vault-relative path in the
  written vault (`vault=` in specific mode, PR #87). Before that it passed an
  absolute path in active mode. The open is still silent on failure.
- `append_note`, `prepend`, `patch_heading`, `patch_block` and `set_property`
  still keep a "Targeting:" paragraph in their descriptions that restates the
  locator rule the `target_mode` field descriptions now carry (as does
  `backlinks`). PR #90's T051 list did not include them and they use none of
  the banned phrases, so the surface test passes; the PR body leaves their
  removal to the owner.
