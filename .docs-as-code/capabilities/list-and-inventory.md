# List and inventory

Tools that enumerate what is in a vault or a note, or which vaults there are,
without reading content. Per-tool contracts are the `docs/tools/` pages linked
below.

| Tool | Pipeline | Contract |
| --- | --- | --- |
| `files` | native CLI `files`, filtered by the server | [docs/tools/files.md](../../docs/tools/files.md) |
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
([targeting](../architecture.md#targeting-target_mode)). `properties` takes the
shared `focusedVaultField` (`src/tools/_vault-field.ts`). Since PR #91 all
five publish their result shape as an `outputSchema` and return it as
`structuredContent` alongside the identical text
([typed results](../architecture.md#typed-results-outputschema-and-structuredcontent)),
and the server instructions' rule "`vaults` lists the vault names to use." is
shown now that the tool exists.

## Failure

`paths` reports a missing folder or a folder path that names a file as
`CLI_REPORTED_ERROR` with `details.code` `FOLDER_NOT_FOUND` or `NOT_A_FOLDER`.
`outline` used to pass on the CLI's rejection of a non-Markdown file as an
undiscriminated `CLI_REPORTED_ERROR`. Since PR #97 it resolves the file first
and rejects anything but a note as `VALIDATION_ERROR` with
`details.code: "UNSUPPORTED_FILE_TYPE"` before the `outline` call
([file types](../architecture.md#file-types-check-the-file-that-will-be-acted-on)).

`vaults` never returns an empty list for a failed probe: whatever dispatch
raised (`CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT`, `CLI_NON_ZERO_EXIT` with
`details.reason: "obsidian-not-running"` once auto-launch is exhausted) is
surfaced as is. Any input key is `VALIDATION_ERROR`.

## Known limits

- `files` cannot tell a missing folder, an empty folder, and a folder path
  that names a file apart. All three return `{ count: 0, paths: [] }`, because
  the CLI does not distinguish them. `paths` can, through `eval`.
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
