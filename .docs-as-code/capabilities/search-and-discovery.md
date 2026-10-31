# Search and discovery

Tools that find notes — by text, by regex, by property value, by tag, or by
link — plus the two tools that deal with what Obsidian has focused. The
per-tool contracts are the `docs/tools/` pages linked below.

| Tool | Pipeline | Contract |
| --- | --- | --- |
| `search` | native CLI `search` / `search:context` | [docs/tools/search.md](../../docs/tools/search.md) |
| `context_search` | native CLI `search:context`, plus a `folder` probe | [docs/tools/context_search.md](../../docs/tools/context_search.md) |
| `pattern_search` | `eval` template | [docs/tools/pattern_search.md](../../docs/tools/pattern_search.md) |
| `find_by_property` | `eval` template | [docs/tools/find_by_property.md](../../docs/tools/find_by_property.md) |
| `tag` | `eval` template | [docs/tools/tag.md](../../docs/tools/tag.md) |
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

**Caps and truncation.** `search`, `context_search`, `pattern_search` and
`backlinks` stop at an implicit 1000 results, take a `limit` to change that,
and report `truncated: true` when the cap applied. Truncated results are the
**first N of a deterministic sort of the full match set**, not whatever the CLI
happened to emit first. That was corrected across PRs #48, #55 and #57 after
the earlier docs claimed a "visible subset" the code did not deliver.
`find_by_property`, `tag` and `links` have no cap. `tag`, `links` and
`backlinks` take `total: true` to return only the count, and for `backlinks`
that also bypasses the cap.

**Focus.** `open_file` (PR #60) makes a file the active one, and
`get_active_file` (PR #70) reports which file is active. Both send an `eval`
targeted at the named vault, so they work on a background or closed vault
without switching focus first (ADR-031, Cross-Vault Open via Vault-Targeted
Focus; PRs #66 and #67). `open_file` does switch focus, because that is its
job. `get_active_file` is a pure read: "nothing focused" is the success value
`{ active: null }`, not `ERR_NO_ACTIVE_FILE`.

**Published surface** (PR #90;
[architecture](../architecture.md#registration--the-one-path-from-a-schema-to-a-published-tool)).
Every tool here carries the read-only hint row except `open_file`, which is a
repeat-safe write (not read-only, not destructive, idempotent) because it
changes Obsidian's focus. The five vault-scoped searches publish one shared
optional `vault` field, `focusedVaultField` in `src/tools/_vault-field.ts`
("Omit to use the vault focused in Obsidian"), which the PR #90 review
introduced to replace identical per-tool copies; tools whose `vault` follows a
different rule keep their own declaration. `get_active_file` builds on
`folderScopedTargetModeBaseSchema`
([targeting](../architecture.md#targeting-target_mode)).

**Typed results** (PR #91;
[architecture](../architecture.md#typed-results-outputschema-and-structuredcontent)).
Every tool here except `tag` publishes an `outputSchema` and returns its
result as `structuredContent` beside the identical text. `search` has two
result shapes chosen by mode, so PR #91 added `searchOutputSchema`, the union
of the default (paths) and line (matches) schemas, as its published shape; it
publishes with an object root wrapping both variants, and its results did not
change. `tag` publishes none, because `total: true` returns a bare integer
rather than an object; its text is unchanged. PR #91 put that exclusion to
the owner for review.

**File types** (PR #97;
[architecture](../architecture.md#file-types-check-the-file-that-will-be-acted-on)).
`links` and `backlinks` now say "Supported file types: notes." and
`open_file` says it works on any file type; each sentence is built from a
declaration in the tool's handler. None of the three changed behaviour:
`links` and `backlinks` keep their existing `NOT_MARKDOWN` rejection
(spec 070 FR-007a).

## Failure

Shared across the group: an unknown vault (`CLI_REPORTED_ERROR`,
`details.code: "VAULT_NOT_FOUND"`); for `tag` and `pattern_search`, a
registered-but-closed vault reported as `details.reason: "not-open"` rather
than an empty result; an invalid regex in
`pattern_search` (`VALIDATION_ERROR`); a missing `folder` (`CLI_REPORTED_ERROR`,
`details.code: "FOLDER_NOT_FOUND"`) for the tools that probe for it.

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
- `backlinks`'s description still keeps a "Targeting:" paragraph that
  restates the locator rule now carried by the field descriptions. PR #90's
  T051 list did not include it, and the PR body leaves its removal to the
  owner (the same applies to five write tools, [mutate](mutate.md#known-limits)).
