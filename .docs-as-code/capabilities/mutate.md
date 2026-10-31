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
  `src/tools/_active-file.ts`; since PR #97 `append_note` and `prepend` reach
  them through `resolveFsTarget` in `src/tools/_file-target.ts`, which
  replaced the identical private `resolveLocator` each had.
- **Type check** (PR #97). `write_note` and `append_note` reject a resolved
  path that is not a Markdown note with `UNSUPPORTED_FILE_TYPE` before the
  guard, so nothing is read or written
  ([file types](#file-types)). `patch_heading` and `patch_block` were out of
  spec 070's scope (FR-013) and do not run it; `find_and_replace` keeps its
  own `INVALID_NOTE` rejection.
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
  the shared mapper in `src/tools/_fs-errors.ts` (PR #58). Since PR #102 that
  module also exports `getSyscall` beside `getErrno`; the mapper,
  `find_and_replace`'s own `mapFsError` and `read`'s disk-read failure all
  use it instead of three hand-rolled casts.
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

### What `bytes_written` reports

Since PR #103 (BI-0116, spec 075 FR-001;
[ADR-048](../decisions/ADR-048-bytes-written-is-the-size-change.md))
`bytes_written` has one meaning on the five single-note text writers —
`write_note`, `append_note`, `prepend`, `patch_heading` and `patch_block`: the
note's size in bytes after the write minus its size before, counting a note
that did not exist as 0. Before PR #103 it meant three things (spec 075
research F1). `append_note` and `prepend` already reported that change;
`patch_heading` and `patch_block` reported the note's **total** size after the
edit; `write_note` reported nothing. Their `docs/tools/` pages said so, and
the patch pages called a near-zero value "a red flag" — advice that was only
sound under the total-size meaning and that PR #103 removed.

Each tool computes the figure from data it already holds, so only
`write_note` gained any I/O:

| Tool | Before | After | Bound in the output schema |
| --- | --- | --- | --- |
| `append_note`, `patch_heading`, `patch_block` | the text read | the edited text | `append_note` `min(1)`; the patch tools none, so 0 and negative values are valid |
| `prepend` | `fs.stat` size before the CLI call | `fs.stat` size after | `min(1)`; a zero change is the `post-stat-byte-delta-zero` failure [below](#the-cli-wrapped-tools) |
| `write_note` | `fs.stat` size (`overwrite: true`), or 0 (`wx` create) | the content's UTF-8 length | none |

- **One helper for the text case.** `sizeChange(before, after)` in
  `src/tools/_note-io.ts` is the UTF-8 byte difference that `append_note` and
  both patch tools return. Research D1 had rejected a helper as "an
  abstraction for one line"; the PR #103 code-quality review (commit
  `4a203e0`) found the subtraction spelled three ways and added it, knowingly
  lifting the plan's "do not edit `_note-io.ts` / `append_note/handler.ts`"
  constraint. `append_note`'s figure did not change.
- **`write_note`'s probe.** The `overwrite: true` existence check was
  `fs.realpath`; it is now `fs.stat`, which gives existence and the old size in
  one call. `ENOENT` means a create with old size 0; any other errno fails as
  `FS_WRITE_FAILED { errno, syscall: "stat", path }` **before** anything is
  written, so the tool never returns a guessed figure (clarification Q3,
  FR-006a, data-model R4). The `details` shape is unchanged; only `syscall`
  reads `"stat"` where it read `"realpath"`. `ExecuteFs` gained a required `stat`. The
  handler holds one `sizeBefore: number | null`, where `null` means the note
  did not exist: `created` is `sizeBefore === null`, so an existing 0-byte
  note still reports `created: false`.
- **The tolerated race.** When `patch_heading`'s re-walk finds the heading
  unchanged but other bytes moved, the write proceeds (last-write-wins) and
  the figure is still this write's change against the text it edited
  (data-model R5), not against whatever was on disk at the end.
- **One published sentence.** The five output schemas describe the field with
  `BYTES_WRITTEN_DESCRIPTION` from `src/tools/_shared.ts`, and a
  `_surface.test.ts` case checks it on each tool's published `outputSchema`
  through the real `tools/list`
  ([architecture](../architecture.md#typed-results-outputschema-and-structuredcontent)).

A caller that compared `bytes_written` from a patch tool with the note's total
size has to compare it with the intended size change instead, or `read` the
note; the CHANGELOG's `[Unreleased]` entry carries that migration note. PR
#103's live check (T031) drove the built server over stdio against the test
vault and saw the reported figure equal the measured file-size change in all
12 steps, including 0, −15, −18 and −51.

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
comments. Its scope is the vault, a folder, or — since BI-066 (PR #73;
ADR-032, Find And Replace File Scope via Sibling Locators) — a single note.

Since PR #101 (spec 073) the folder scope is `folder` and case handling is
`case_sensitive`, the names the search tools use. Until then they were
`subfolder` and `case_insensitive`, the only case switch in the server with
the opposite polarity. The default is still case-sensitive (`case_sensitive`
defaults to `true`, as `case_insensitive` defaulted to `false`). Both old
names are accepted until the next major release, with a
`deprecated_parameters` notice on either result branch; `case_insensitive` is
negated onto `case_sensitive`, and its notice carries a polarity `note`
([architecture](../architecture.md#renamed-parameters-deprecated-aliases-folded-before-validation),
[ADR-NNN](../decisions/ADR-NNN-shared-parameter-names-within-a-tool-family.md)).
A `subfolder` scope is honoured exactly like `folder` and never widens to the
whole vault. The `INVALID_SUBFOLDER` code, its reasons and its
`details.subfolder` key are unchanged; the path-safety issue moved to
`["folder"]` ("folder is not structurally safe"), and the `SCOPE_CONFLICT` and
not-found messages say `folder`. The internal scope predicate followed:
`effectiveSubfolder` is now `effectiveFolder`. One edge moved in review
(commit `4a00a58`): a call that sends `subfolder` and `folder` together is
rejected with the generic alias-conflict issue before the scope matrix runs,
so `subfolder` + `folder` + `path` no longer reports `SCOPE_CONFLICT`.

Since PR #92 (068 FR-052, FR-054, research R11) the commit loop checks the
call's `signal` before each note. A cancel stops it between notes: notes
already written stay written, and because the SDK sends no response for a
cancelled request, the handler logs `find_and_replace.commit_cancelled`
`{vault, committed, skipped}` to stderr and rethrows the abort reason
([architecture](../architecture.md#logging-and-shutdown)). After each written
note it calls `reportProgress?.(written, total, relPath)`, which sends a
progress notification only when the request carried a token. The two scope
predicates, `isSingleNoteScope` and `effectiveFolder`, are shared by the
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
| `find_and_replace` | `commit: true` with no `file`, `path` or `active_note` (a `folder` commit still asks) | at handler entry, **before vault resolution**, which spawns Obsidian | after the commit re-scan, before the first write; names the pattern, occurrence and note counts, the vault and the folder |

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
given explicitly. `delete` is a thin wrapper. It sends a file to the OS trash
unless `permanent: true`, which since PR #92
asks the human first ([above](#confirmation-before-irreversible-changes)). On
the PR #92 test vault, which has no `.trash` folder, trash deletes landed in
the OS Recycle Bin. `rename` and `move` take
the vault's "Automatically update internal links" setting as it is: whether
links are rewritten depends on vault configuration, not on this server.

`rename` and `move` stopped being thin wrappers in PR #97. Each first resolves
the source file, then applies the destination rule below, then forwards the
original `file=`, the `path`, or (active mode) the resolved `path=` with no
`vault=`. `move` still expands a folder-form `to` (trailing `/`) itself only
for a `path` locator; for `file` and active calls it forwards the folder form
as given and the CLI keeps the basename, which keeps Markdown `file`-mode
arguments byte-stable (spec 070 `contracts/tool-support.md` invariant 4,
upheld by review ruling Q2).

## File types

Since PR #97 (BI-0060, spec 070) every tool here that takes a file locator
states in its description which file types it handles, built from the
`X_SUPPORTED` declaration in its handler
([architecture](../architecture.md#file-types-check-the-file-that-will-be-acted-on);
ADR-044, File-Path Tools Check the Resolved File and Keep Its Type).

| Tool | Handles | How a wrong type fails |
| --- | --- | --- |
| `write_note`, `append_note`, `prepend` | notes only | `UNSUPPORTED_FILE_TYPE` (`unsupported-type`) before any write |
| `find_and_replace` | notes only | its existing `INVALID_NOTE` / not-eligible handling, unchanged |
| `rename`, `move` | any file; the type is kept | `UNSUPPORTED_FILE_TYPE` (`type-change`) for a destination of another type |
| `delete` | any file | — |

The destination rule for `rename` and `move` replaced two older ones. `rename`
appended `.md` to any name without it (`appendMdIfMissing`, spec 021 Q1), so
renaming a canvas made it a Markdown note. `move` appended `.md` only to a
`.md` source given as a `path` (spec 030 Q1+Q2), forwarding everything else as
given. Now a destination with no extension gets the source's — the T0 probe
P1 showed this is required for `move` and not just tidy, because the CLI reads
an extensionless `to` as a folder — and one with a different recognised
extension is refused with `alternative: "obsidian_exec"`. Markdown outcomes
did not change, including `Renamed.MD` → `Renamed.MD.md` (FR-012).

`write_note` has no resolver to ask, so it checks the path it computes. Its
short form used to add `.md` to any slash-free name not ending in `.md`, which
made `file: "Plan.canvas"` into `Plan.canvas.md`. Since PR #97 a name ending
in a canvas, base or attachment extension is not a short form; it passes
through as given and the type check rejects it. A deliberate side effect,
found at implement time and listed in spec 070's `tasks.md` Notes:
`file: "Folder/Note"`, which used to write an extensionless file, is now
rejected. In active mode the check runs on the focused file, so
`write_note` with `overwrite: true` no longer replaces a focused canvas.

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

- Until PR #97 this page said "`rename` only handles `.md` notes. Other file
  types go through `obsidian_exec`." That was the spec 021 intent, but the
  code never enforced it: `rename` accepted a canvas and turned it into a
  Markdown note. Since PR #97 `rename` and `move` handle every file and keep
  its type; only a deliberate **type change** goes through `obsidian_exec`.
- `file` and active calls of `rename` and `move` cost one extra CLI
  round-trip to resolve the source; `path` calls do not. An active call can
  still act in another vault if the focused **vault** switches between that
  lookup and the action (ADR-044); the owner accepted the same residual for
  the metadata refresh below.
- `patch_heading` and `patch_block` were outside spec 070 (FR-013): they do
  not run the type check and their descriptions carry no supported-types
  sentence.
- `set_property`, `find_and_replace` and `create_base` report no size at
  all. Spec 075 (clarification Q1) kept the `bytes_written` convention to
  the five single-note text writers; adding a figure to any of the three is
  its own item (PR #103).
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
