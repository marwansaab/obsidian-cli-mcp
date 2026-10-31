# Obsidian Bases

Tools for Obsidian Bases (`.base` files): list them, list the views inside one,
run a view, and create an item in one. Per-tool contracts are the
`docs/tools/` pages linked below.

| Tool | Pipeline | Contract |
| --- | --- | --- |
| `bases` | native CLI `bases` | [docs/tools/bases.md](../../docs/tools/bases.md) |
| `views_base` | native CLI `base:views`, with an `eval` to focus a named Base | [docs/tools/views_base.md](../../docs/tools/views_base.md) |
| `query_base` | native CLI `base:query`, with `fs.stat` pre-flight | [docs/tools/query_base.md](../../docs/tools/query_base.md) |
| `create_base` | native CLI `base:create` | [docs/tools/create_base.md](../../docs/tools/create_base.md) |

## How it is built

`query_base` came first (BI-039, PR #41). `bases`, `views_base` and
`create_base` followed together (PR #56). All four take only an optional
`vault`; none takes `target_mode`. A `.base` file is addressed by a
vault-relative path. The three tools that take one validate it with the same
shared refinement in `src/tools/_base-path.ts`, so an empty, over-long,
traversing or wrong-extension path fails identically everywhere
(`VALIDATION_ERROR` with `INVALID_BASE_PATH` sub-issues, following ADR-015).

`query_base` runs a staged pipeline before trusting the CLI:

1. Resolve the vault root and run the canonical path check.
2. `fs.stat` the `.base` file. A missing file is `BASE_NOT_FOUND`; an empty
   one is `BASE_MALFORMED`. Both are caught before the CLI is asked.
3. Call `base:query`. Classify a failure from stdout or stderr: an unknown
   view is `VIEW_NOT_FOUND`, invalid YAML is `BASE_MALFORMED`. The YAML
   classifier was broadened in PR #59 to match js-yaml's structural error
   wording.
4. Parse and validate the JSON, then post-process the rows. A reserved `path`
   column (the source note's vault-relative path) always sits at
   `columns[0]`. A view column also called `path` is renamed `path_view`.
5. Cap at 1000 rows. When the cap applies, the result carries
   `truncated: true` and `total_rows`.

`views_base` has two modes (reworked in BI-064, PR #71). Given a `base_path`,
it focuses that Base through `eval`, then reads its views with the CLI's
active-Base subcommand. That works cross-vault, and the named Base wins over
whatever was open. Without `base_path`, it reads the Base already focused in
Obsidian.

`bases` keeps only clean-exit stdout lines ending in `.base`. BI-065 (PR #72)
added that filter after an empty vault returned the CLI's "no bases" message
as a fake Base entry. An empty vault now returns `count: 0`.

Published surface (PR #90; [architecture](../architecture.md#registration--the-one-path-from-a-schema-to-a-published-tool)):
`bases`, `views_base` and `query_base` carry the read-only hint row;
`create_base` is an additive write (not read-only, not destructive, not
idempotent). `query_base`'s `base_path` publishes
`BASE_PATH_DESCRIPTION` from `src/tools/_base-path.ts`, built from
`BASE_PATH_MAX`, and `create_base`'s `base_path` opens with it and adds
"Required (or the deprecated path)."; `views_base` interpolates `BASE_PATH_MAX` into its
own, so the stated limit cannot drift from the enforced one. `query_base`'s optional
`vault` is the shared `focusedVaultField` (`src/tools/_vault-field.ts`).
Since PR #91 all four publish an `outputSchema` and return their result as
`structuredContent` beside the identical text
([typed results](../architecture.md#typed-results-outputschema-and-structuredcontent)).
Since PR #97 the descriptions of `views_base`, `query_base` and `create_base`
carry "Supported file types: bases.", built from each handler's
declaration
([file types](../architecture.md#file-types-check-the-file-that-will-be-acted-on)).
Their behaviour did not change: another file type is still refused with the
existing `INVALID_BASE_PATH`, which spec 070 FR-007a kept rather than rename a
discriminator clients rely on.

**One name for the `.base` file and the view** (PR #101, spec 073). Until
PR #101 `create_base` named the `.base` file `path`, the word every
note-targeting tool uses for a note, and the view `view`, while `views_base`
and `query_base` say `base_path` and `view_name`. It now takes `base_path` and
`view_name`, with the description its siblings use for each. `path` and `view`
are accepted until the next major release, with a `deprecated_parameters`
notice in the result
([architecture](../architecture.md#renamed-parameters-deprecated-aliases-folded-before-validation),
[ADR-NNN](../decisions/ADR-NNN-shared-parameter-names-within-a-tool-family.md)).
All three path-taking tools now validate the field `base_path`, so
`create_base`'s `INVALID_BASE_PATH` issues report `field: "base_path"` where
they used to say `"path"`; that is the PR's one machine-readable change. The
`BASE_NOT_FOUND` details keep their `path` key, and the CLI still receives
`path=` and `view=`. During the transition `base_path` is enforced at parse
time and absent from the published `required` list. A call missing both
`name` and `base_path` now reports only `name is required`, where it used to
report both.

## Failure

Errors are `CLI_REPORTED_ERROR` with `details.code` — `BASE_NOT_FOUND`,
`BASE_MALFORMED`, `VIEW_NOT_FOUND` — or `VALIDATION_ERROR` for bad paths and
view names. `create_base` content over 3072 UTF-16 code units fails fast with
`CONTENT_TOO_LARGE`, before the CLI is called, for the same argv reason as
`prepend` ([mutate](mutate.md#the-cli-wrapped-tools)).

`query_base` on a closed registered vault returns its normal result. In the
T0 check for PR #100, `base:query` answered a closed vault on its first
attempt; where it answers `Error: Command "base:query" not found.` instead,
the dispatch layer's cold-start retry brings the vault up
([architecture](../architecture.md#runtime-spine)). If that fails too, the
retry's `CLI_REPORTED_ERROR` is the tool's documented "vault unavailable"
failure. `query_base` catches `CLI_REPORTED_ERROR` to run its own classifier
in step 3, and none of its patterns matches that text, so the error passes
through unchanged; a handler test pins this, with and without the CLI's
`Did you mean: base:views, base:create?` suffix. Until PR #100 the pipeline
had a further stage between steps 3 and 4 that turned an empty answer into
`VAULT_NOT_FOUND` / `not-open`; it could not fire and was deleted
([ADR-045](../decisions/ADR-045-closed-vaults-recovered-only-by-the-dispatch-retry.md)).

## Known limits

These are inherited from the CLI and documented in each tool's description:

- `bases` and `create_base` accept `vault` but the CLI ignores it; they always
  act on the active vault. `views_base` without `base_path` ignores `vault`
  the same way.
- `create_base` does not validate `view_name`: the CLI accepts a view name that
  does not exist. On a name collision the CLI auto-increments the new note's
  name, and the response reports the actual name.
- `views_base` with `base_path` changes Obsidian's focus as a side effect.
- Since PR #90 the `vault` field descriptions of `bases` and `create_base` say
  it is accepted but ignored by the CLI. `create_base`'s `content` ("Default:
  none") and `view` ("omit for the default") descriptions are hedged, because
  the CLI's behaviour when they are omitted was not confirmed; the PR body
  leaves them for the owner to check. PR #101 renamed `view` to `view_name`
  and kept the hedge ("omit for the default").
