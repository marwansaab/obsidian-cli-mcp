# Obsidian Bases

Tools for Obsidian Bases (`.base` files): list them, list the views inside one,
run a view, and create an item in one. Per-tool contracts are the
`docs/tools/` pages linked below.

| Tool | Pipeline | Contract |
| --- | --- | --- |
| `bases` | native CLI `bases` | [docs/tools/bases.md](../../docs/tools/bases.md) |
| `views_base` | native CLI `base:views`, with an `eval` to focus a named Base | [docs/tools/views_base.md](../../docs/tools/views_base.md) |
| `query_base` | native CLI `base:query`, with `fs.stat` pre-flight and closed-vault detection | [docs/tools/query_base.md](../../docs/tools/query_base.md) |
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
idempotent). `create_base`'s `path` and `query_base`'s `base_path` publish
the same description, `BASE_PATH_DESCRIPTION` in `src/tools/_base-path.ts`,
built from `BASE_PATH_MAX`; `views_base` interpolates `BASE_PATH_MAX` into its
own, so the stated limit cannot drift from the enforced one. `query_base`'s optional
`vault` is the shared `focusedVaultField` (`src/tools/_vault-field.ts`).
Since PR #91 all four publish an `outputSchema` and return their result as
`structuredContent` beside the identical text
([typed results](../architecture.md#typed-results-outputschema-and-structuredcontent)).

## Failure

Errors are `CLI_REPORTED_ERROR` with `details.code` — `BASE_NOT_FOUND`,
`BASE_MALFORMED`, `VIEW_NOT_FOUND` — or `VALIDATION_ERROR` for bad paths and
view names. `create_base` content over 3072 UTF-16 code units fails fast with
`CONTENT_TOO_LARGE`, before the CLI is called, for the same argv reason as
`prepend` ([mutate](mutate.md#the-cli-wrapped-tools)).

## Known limits

These are inherited from the CLI and documented in each tool's description:

- `bases` and `create_base` accept `vault` but the CLI ignores it; they always
  act on the active vault. `views_base` without `base_path` ignores `vault`
  the same way.
- `create_base` does not validate `view`: the CLI accepts a view name that
  does not exist. On a name collision the CLI auto-increments the new note's
  name, and the response reports the actual name.
- `views_base` with `base_path` changes Obsidian's focus as a side effect.
- Since PR #90 the `vault` field descriptions of `bases` and `create_base` say
  it is accepted but ignored by the CLI. `create_base`'s `content` ("Default:
  none") and `view` ("omit for the default") descriptions are hedged, because
  the CLI's behaviour when they are omitted was not confirmed; the PR body
  leaves them for the owner to check.
