# List and inventory

Tools that enumerate what is in a vault or a note, or which vaults there are,
without reading content. Per-tool contracts are the `docs/tools/` pages linked
below.

| Tool | Pipeline | Contract |
| --- | --- | --- |
| `files` | native CLI `files`, filtered by the server; an `eval` folder check when a named folder lists nothing | [docs/tools/files.md](../../docs/tools/files.md) |
| `paths` | `eval` template | [docs/tools/paths.md](../../docs/tools/paths.md) |
| `outline` | native CLI `outline` | [docs/tools/outline.md](../../docs/tools/outline.md) |
| `properties` | native CLI `properties` | [docs/tools/properties.md](../../docs/tools/properties.md) |
| `vaults` | native CLI `vaults verbose`, through the vault registry | [docs/tools/vaults.md](../../docs/tools/vaults.md) |

## How it is built

All five return a `{ count, <items> }` envelope. The four vault-content tools
accept `total: true`, which returns the count with an empty list — a cheap
check before a large read. The envelope keeps the same shape either way.
`vaults` takes no input at all.

`files` (PR #21, as `list_files`) and `paths` (PR #31 as `tree`; renamed in
PR #34) split one job deliberately: `files` is one level, `paths` is
recursive. The CLI's `files` subcommand actually returns the **recursive**
subtree, so `files` filters on the server to stay one-level. It also drops
sub-folder and dotfile entries, and sorts by UTF-8 byte order with
`Buffer.compare` rather than JavaScript's default UTF-16 order. Its `total`
count is computed after filtering instead of using the CLI's recursive total.
`paths` walks the vault through `eval` and marks folders with a trailing `/`.

Since PR #154 (BI-0205) `files` is no longer always a single CLI call. The
CLI's `files` subcommand prints nothing and exits 0 for a missing folder, as
for an empty one, so when `folder` is set and the CLI lists no entries the
handler's `assertFolderExists` runs one `invokeEval` in the same vault. Its
frozen `FOLDER_CHECK_TEMPLATE` (`src/tools/files/_template.ts`) answers the
stat fact `{ kind: "missing" | "file" | "folder" }`, which `decodeEvalEnvelope`
checks against `filesFolderEnvelopeSchema`, and the handler decides: only
`"missing"` fails. The fact comes from `FOLDER_STAT_KIND_JS` in the new leaf
module `src/tools/_folder-stat.ts`, the first shared in-eval form of the
"missing, file or folder?" `adapter.stat` rule (a `null` or throwing `stat`
is missing). Only `files` uses it so far. The check runs on the CLI's raw
entries, before the wrapper's filters, so `folder: ".obsidian"`, whose
entries the dotfile filter removes, needs no check. The vault root and every
non-empty listing stay single-spawn. A `folder` with a `..` segment that
lists nothing fails without the eval, because `stat` resolves `..` outside
the vault
([ADR-076](../decisions/ADR-076-files-checks-a-named-folder-only-when-the-cli-lists-nothing.md)).

`outline` (PR #25) and `properties` (PR #26) wrap the CLI directly. `outline`
takes `target_mode`, because it reads one note. `properties` is vault-scoped:
an optional `vault`, with the focused vault as the default.

Since PR #97 `outline` is no longer a single CLI call for every locator. A
`file` name is resolved through `obsidian file` and active mode through the
focused-file `eval`, so the type can be checked before the `outline` call;
`path` calls stay single-spawn. A `file` call then forwards the original
`file=`, an active call the resolved `path=` with no `vault=`.

### `vaults`

`vaults` (PR #91, 068 US11, FR-036) wraps `obsidian vaults verbose` 1:1 and is
named for it under ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand) rule 1; the brief's
`list_vaults` was dropped by owner ruling. It is the only tool that reaches
the CLI without calling `invokeCli` itself: its handler calls `list()` on the
injected vault registry, which runs the probe through `invokeCli` from
`server.ts`. So the tool takes only `{ vaultRegistry }`, adds no CLI path, and
has no `target_mode`, containment or vault argument. Each call re-probes, and
the same probe refreshes the name cache every other tool resolves vault names
from, so listing a vault added after start-up also makes it targetable
([architecture](../architecture.md#two-ways-to-touch-a-note-through-the-cli-or-directly)).

Each row is `{ name, path, open }` in CLI order. `open` is always `null`: the
T0 probe (`specs/068-modernise-mcp-surface/evidence-b4.md`, T061) found that
`help vaults` offers only `total` and `verbose`, and `vaults verbose` prints
`name<TAB>path` with no open marker. Reading Obsidian's private
`obsidian.json` to fill it was rejected in research R9 as outside the CLI
contract. The field is `boolean | null` so a future CLI marker can fill it
without a shape change. The output schema refines `count === vaults.length`.

Published surface (PR #90, PR #91; [architecture](../architecture.md#registration--the-one-path-from-a-schema-to-a-published-tool)):
all five carry the read-only hint row. `files` and `paths` (with
`get_active_file`) build on `folderScopedTargetModeBaseSchema`, whose
published descriptions say that `file` and `path` are not accepted and that
`vault` is required with `"specific"`
([targeting](../architecture.md#targeting-target_mode)). `files` publishes the
two fields and rejects them in the refinement with
"`<key>` is not allowed for folder-scoped tools"; `paths` omits them, so a
locator fails as `unrecognized_keys`. This page earlier read as if both
published the fields. PR #112 pins both texts in tests (cases U1–U3) when it
gave `get_active_file` its own locator message; neither tool's behaviour
changed. `properties` takes the
shared `focusedVaultField` (`src/tools/_vault-field.ts`). Since PR #91 all
five publish their result shape as an `outputSchema` and return it as
`structuredContent` alongside the identical text
([typed results](../architecture.md#typed-results-outputschema-and-structuredcontent)),
and the server instructions' rule "`vaults` lists the vault names to use." is
shown now that the tool exists. Since PR #143 (spec 092,
[ADR-074](../decisions/ADR-074-tool-descriptions-route-within-a-budget-and-the-help-page-holds-the-contract.md))
the five descriptions are routing texts: `files` and `paths` name each
other (direct children against the recursive tree), `outline` names `links`
and `backlinks`, and `properties` names the other frontmatter-property
tools. `properties`' input root description lost its internal identifiers
and version history. `vaults`' description had listed unreachable-Obsidian
codes the code does not return; PR #143 dropped them, and its help page
gives the `CLI_NON_ZERO_EXIT` / `obsidian-not-running` failure it does
return.

## Failure

`paths` reports a missing folder or a folder path that names a file as
`CLI_REPORTED_ERROR` with `details.code` `FOLDER_NOT_FOUND` or `NOT_A_FOLDER`.
Since PR #154 (BI-0205) `files` reports a missing folder with the same
error: `cause: null`,
`details: { stage: "envelope-error", code: "FOLDER_NOT_FOUND", folder }`, and
the message `files: FOLDER_NOT_FOUND for folder "<folder>"`, `paths`' shape
with the tool name swapped, built once in `folderNotFound`.
`details.folder` drops one trailing `/`, except on the `..` guard, which
reports the value as given. A malformed check answer is `CLI_REPORTED_ERROR`
through `decodeEvalEnvelope`. A path that names a file still answers
`{ count: 0, paths: [] }`; `NOT_A_FOLDER` for it was out of BI-0205's scope.
Since PR #153 (BI-0204) `pattern_search` makes the same check in its own
template; the two copies differ when `adapter.stat` throws, and sharing them
is deferred
([search and discovery](search-and-discovery.md#known-limits-and-inconsistencies)).
A closed registered vault is opened by the dispatch layer's cold-start retry
and `paths` returns its normal result; a vault that cannot be brought up is
the retry's `CLI_REPORTED_ERROR` ("vault unavailable", `details.stdout`
starting `Error: Command "eval" not found.`, or carrying that line after
other plugins' output since PR #110), never an empty list. PR #100
removed a per-tool check that waited for an empty answer the server's CLI
never sends, and the `VAULT_NOT_FOUND` / `not-open` failure it was documented
to raise
([ADR-045](../decisions/ADR-045-closed-vaults-recovered-only-by-the-dispatch-retry.md)).
`outline` used to pass on the CLI's rejection of a non-Markdown file as an
undiscriminated `CLI_REPORTED_ERROR`. Since PR #97 it resolves the file first
and rejects anything but a note as `VALIDATION_ERROR` with
`details.code: "UNSUPPORTED_FILE_TYPE"` before the `outline` call
([file types](../architecture.md#file-types-check-the-file-that-will-be-acted-on)).
Since PR #142 (BI-0174) that message no longer ends "Nothing was changed.",
as `read`'s does not: both are read-only and pass `readOnly: true`. The same
PR corrected `outline`'s help page, whose Example 4 had shown Obsidian's
`Error: …` line as the top-level message; the call returns the generic
`CLI bridge upstream error: CLI_REPORTED_ERROR` with that line in
`details.message`, as the built server confirmed.

`vaults` never returns an empty list for a failed probe: whatever dispatch
raised (`CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT`, `CLI_NON_ZERO_EXIT` with
`details.reason: "obsidian-not-running"` once auto-launch is exhausted, and
since PR #137 `CLI_REPORTED_ERROR` with `details.reason: "cli-disabled"`) is
surfaced as is. Any input key is `VALIDATION_ERROR`.

Before PR #137 (BI-0132) a disabled Obsidian command line was the exception.
The probe got the CLI's exit-0 notice as stdout, `parseVaultsVerboseOutput`
skipped it as a line with no tab, and `vaults` returned `{ count: 0, vaults:
[] }`, while every named-vault lookup failed as an unregistered vault. Now
dispatch fails the probe, so `vaults` and the registry lookup that resolves a
named vault's folder reject with the `cli-disabled` error unchanged. The
registry caches nothing on a failed probe, so the next call after the user
turns the setting on succeeds without a restart; `vaults/handler.test.ts`
pins that recovery with a stubbed probe
([ADR-069](../decisions/ADR-069-a-disabled-command-line-fails-in-dispatch-on-the-exact-notice.md)).

## Known limits

- `files` cannot tell an empty folder from a folder path that names a file:
  both return `{ count: 0, paths: [] }`. `paths` can, through `eval`. Until
  PR #154 this bullet also put a missing folder in that set, as spec 019
  FR-010 had chosen; that is no longer true
  ([ADR-076](../decisions/ADR-076-files-checks-a-named-folder-only-when-the-cli-lists-nothing.md)).
- On a case-insensitive file system (Windows, default macOS) a `files`
  folder written in the wrong case lists nothing, because the CLI matches
  `folder` case-sensitively, but the check finds it, so the call answers
  empty rather than `FOLDER_NOT_FOUND`. Only Windows was exercised live in
  PR #154 (`.specify/bugs/bi-0205/test.md`, Residual Risks).
- In active mode `files`' listing and its folder check are two calls in the
  focused vault; a focus change between them could check another vault.
- `paths` sends a `..` segment to `adapter.stat` and `adapter.list`
  unguarded, so `folder: ".."` may reach the vault's parent directory
  (BI-0208, found during BI-0205).
- `outline` shows both ATX and Setext headings because it defers to the CLI,
  while `read_heading` addresses ATX headings only. A Setext heading can
  therefore appear in an outline and still not be readable by section.
- `vaults` cannot say which vaults are open (`open` is always `null`; see
  above).
- `vaults` lists two vaults that share a display name separately, but any
  tool given that name still reaches only the last one listed. Distinct
  display names are the only fix (README, *Vault names and discovery*).
- The registry refreshes on a cache **miss** and on every `vaults` call, not
  on a hit. A vault removed or moved in Obsidian keeps resolving to its old
  folder until one of those refreshes runs.
- The end-to-end "add a vault in Obsidian while the server runs, then target
  it by name" check needs a GUI action. In PR #91 it was left open for the
  owner (T071); the unit evidence is `registry.test.ts` "cache miss re-probes
  once and resolves a vault added after start-up".
