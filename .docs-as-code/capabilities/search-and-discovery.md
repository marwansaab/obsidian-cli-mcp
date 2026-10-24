# Search and discovery

Tools that find notes — by text, by regex, by property value, by tag, or by
link — plus `tags`, which lists the tags themselves, and the two tools that
deal with what Obsidian has focused. The per-tool contracts are the
`docs/tools/` pages linked below.

| Tool | Pipeline | Contract |
| --- | --- | --- |
| `search` | native CLI `search` / `search:context` | [docs/tools/search.md](../../docs/tools/search.md) |
| `context_search` | native CLI `search:context`, plus a `folder` probe | [docs/tools/context_search.md](../../docs/tools/context_search.md) |
| `pattern_search` | `eval` template | [docs/tools/pattern_search.md](../../docs/tools/pattern_search.md) |
| `find_by_property` | `eval` template | [docs/tools/find_by_property.md](../../docs/tools/find_by_property.md) |
| `tag` | `eval` template | [docs/tools/tag.md](../../docs/tools/tag.md) |
| `tags` | native CLI `tags format=json counts` | [docs/tools/tags.md](../../docs/tools/tags.md) |
| `links` | `eval` template | [docs/tools/links.md](../../docs/tools/links.md) |
| `backlinks` | `eval` template | [docs/tools/backlinks.md](../../docs/tools/backlinks.md) |
| `open_file` | `eval`, vault-targeted | [docs/tools/open_file.md](../../docs/tools/open_file.md) |
| `get_active_file` | `eval`, vault-targeted | [docs/tools/get_active_file.md](../../docs/tools/get_active_file.md) |

## How it is built

**Two kinds of targeting.** The text and index searches (`search`,
`context_search`, `pattern_search`, `find_by_property`, `tag`) are vault-scoped:
they take an optional `vault`, and omitting it means the focused vault. There
is no `target_mode`. The link tools (`links`, `backlinks`) act on one note and
take `target_mode`, like the read group.

`tags` (BI-0014, PR #84) is vault-wide with an optional note scope, and so
takes a third shape: optional `vault`, plus at most one of `file`, `path` or
`activeOnly: true` as sibling fields, with no `target_mode` (ADR-032, Find
And Replace File Scope via Sibling Locators, and ADR-035,
[Shared Sibling-Locator Rules for Vault-Wide Tools](../decisions/ADR-035-shared-sibling-locators.md)).
It validates those fields through the same
[src/tools/_note-locator.ts](../../src/tools/_note-locator.ts) refinements
as `find_and_replace`, so the two report scope conflicts identically
([architecture](../architecture.md#sibling-locators-for-vault-wide-tools)).

**Native where the CLI already does the job, `eval` where it does not.** The
literal-text searches wrap the CLI's own search. Regex search, the tag index,
property-value lookup and the link graph need Obsidian's `metadataCache`, so
they run frozen templates through `eval`
([architecture](../architecture.md#reaching-obsidian-internals-the-eval-template-pattern)).
`backlinks` (PR #38) is an example of choosing `eval` over a native
subcommand that exists. The native `backlinks` has no active mode, returns a
bare integer for counts and has no cap or truncation signal, so one `eval`
path gave a uniform contract. During that work a live probe also showed that
`getBacklinksForFile`'s `.data` property is empty, so the template uses the
dictionary's `.keys()`/`.get()` methods (T0 finding F3).

`tags` and `tag` go the opposite ways for the same index. `tag` needs child
subsumption and case-insensitive matching the native `tag` subcommand lacks,
so it uses `eval`. The native `tags` subcommand already returns the inventory
as JSON, so `tags` wraps it with one `invokeCli` call and owns only the
transforms: the plain-text `No tags found.` sentinel is read as `[]`, the
digit-string `count` the CLI sends is validated and parsed to an integer, one
leading `#` is stripped, and the list is sorted by the wrapper rather than in
CLI order. The JSON decode is the shared `parseCliJson` and the sort is the
shared `compareNames`, the same ones `outline` and `properties` use
([list and inventory](list-and-inventory.md)). The wire shape, the sentinel
and the index behaviours below were found by live probes, not assumed
(spec Clarifications T0-1 to T0-7,
[contracts/t0-probe-plan.md](../../specs/068-list-tags/contracts/t0-probe-plan.md)).

**Caps and truncation.** `search`, `context_search`, `pattern_search` and
`backlinks` stop at an implicit 1000 results, take a `limit` to change that,
and report `truncated: true` when the cap applied. Truncated results are the
**first N of a deterministic sort of the full match set**, not whatever the CLI
happened to emit first. That was corrected across PRs #48, #55 and #57 after
the earlier docs claimed a "visible subset" the code did not deliver.
`find_by_property`, `tag`, `tags` and `links` have no cap of their own; for
`tags`, the 10 MiB output cap in `invokeCli` is reached at roughly 10⁵
distinct tags (T0-7). `tag`, `links` and
`backlinks` take `total: true` to return only the count, and for `backlinks`
that also bypasses the cap.

**Focus.** `open_file` (PR #60) makes a file the active one, and
`get_active_file` (PR #70) reports which file is active. Both send an `eval`
targeted at the named vault, so they work on a background or closed vault
without switching focus first (ADR-031, Cross-Vault Open via Vault-Targeted
Focus; PRs #66 and #67). `open_file` does switch focus, because that is its
job. `get_active_file` is a pure read: "nothing focused" is the success value
`{ active: null }`, not `ERR_NO_ACTIVE_FILE`.

## Failure

Shared across the group: an unknown vault (`CLI_REPORTED_ERROR`,
`details.code: "VAULT_NOT_FOUND"`); for `tag` and `pattern_search`, a
registered-but-closed vault reported as `details.reason: "not-open"` rather
than an empty result; an invalid regex in
`pattern_search` (`VALIDATION_ERROR`); a missing `folder` (`CLI_REPORTED_ERROR`,
`details.code: "FOLDER_NOT_FOUND"`) for the tools that probe for it.

`tags` adds no new code and no new sub-state (PR #84). A scope conflict is
`VALIDATION_ERROR` with `details.code: "SCOPE_CONFLICT"` and one of ADR-032's
reasons, and an unsafe `file` or `path` is `INVALID_NOTE` / `path-traversal`,
both before any CLI call. A note that does not exist is the CLI's own
`CLI_REPORTED_ERROR`, never an empty list. Stdout that is neither the sentinel
nor valid JSON, or JSON of the wrong shape, is `CLI_REPORTED_ERROR` with
`details.stage` `json-parse` or `upstream-shape`. The handler's only `catch`
re-throws `ERR_NO_ACTIVE_FILE` with the same code and details and a message
that points at `file` / `path`, because the dispatch-layer message suggests a
`target_mode` that `tags` does not have.

## Known limits and inconsistencies

- `search` with `context_lines: true` is deprecated in favour of
  `context_search`, and kept for compatibility.
- Case sensitivity defaults **differ**: `pattern_search` is case-sensitive by
  default, while `context_search` is not. This is documented, deliberate
  (BI-037 FR-007), and a trap when porting a query between them.
- `find_by_property` takes the property name as `property:`; its siblings
  `read_property` and `set_property` use `name:`. Documented, not yet
  reconciled.
- `tag` folds case with ASCII lower-casing only, so non-ASCII tags match
  case-sensitively.
- `tags` passes the CLI's index through unchanged, and the index is not
  uniform across scopes (T0-3, T0-4). Vault-wide, case variants are merged and
  every nested tag adds an entry for each parent, whose count includes its
  children; for one note, case variants stay separate and only the literal
  tags appear. `count` is occurrences, not notes (T0-5), so it is not
  comparable with `tag`'s `count`, which counts notes. Because vault-wide
  listings merge case variants, the wrapper's case-sensitive sort tiebreak
  can only be observed in single-note listings.
