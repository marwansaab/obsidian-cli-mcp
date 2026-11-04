# Plugin-backed (Smart Connections)

The two tools that depend on a third-party Obsidian plugin rather than on
Obsidian itself. Per-tool contracts are the `docs/tools/` pages linked below.

| Tool | Pipeline | Contract |
| --- | --- | --- |
| `smart_connections_similar` | `eval` template calling the plugin's similarity API | [docs/tools/smart_connections_similar.md](../../docs/tools/smart_connections_similar.md) |
| `smart_connections_query` | `eval` template calling the plugin's lookup API | [docs/tools/smart_connections_query.md](../../docs/tools/smart_connections_query.md) |

## How it is built

Two ADRs shape this group. ADR-013 (Plugin-Namespace Tool Naming Convention)
gives plugin-backed tools a plugin-name prefix, so a client can see the
dependency in the tool name. That is why these are `smart_connections_*` and
not `similar`/`semantic_search`. ADR-014 (Plugin-Backed Typed Tools
Runtime-Dependency Pattern) says what such a tool must do when its plugin is
missing or not ready: report a distinct, structured state. It must never
return an empty list that looks like "nothing similar".

`smart_connections_similar` (BI-026, PR #28) takes `target_mode` and a source
note. `smart_connections_query` (BI-027, PR #29) takes a free-text `query` and
an optional `vault`. Both return
`{ count, matches: [{ path, headingPath, score }] }` with a `limit` of 1–100
(default 20), and both accept `total: true`.

They use the standard `eval` template pattern
([architecture](../architecture.md#reaching-obsidian-internals-the-eval-template-pattern)),
with two differences:

- **The plugin writes to the console first.** Its API logs before the `=> `
  marker the CLI puts in front of an `eval` result. Until PR #110
  `smart_connections_query` took the **last** `=> ` line in stdout rather
  than the first (its spec's research R14), the only eval tool that coped
  with output ahead of its answer. That rule returned the wrong line when a
  plugin printed an answer-like line after the real one. Since PR #110 both
  tools read the line carrying the call's own answer tag, like every other
  eval tool, and decode it through the shared `decodeEvalEnvelope`
  ([architecture](../architecture.md#reaching-obsidian-internals-the-eval-template-pattern)).
  The Smart Connections templates themselves did not change; the tag is
  added around them.
- **Closed-vault detection started here, and ended here.** A per-tool
  closed-vault stage was written for `smart_connections_similar`, extracted
  into `src/tools/_eval-vault-closed-detection/` for
  `smart_connections_query`, and reused by `tag`, `paths`, `pattern_search`
  and `query_base`. PR #100 deleted the stage from all six and the module
  with it: the empty-stdout answer it waited for never comes through the
  shim the server drives, and the dispatch layer's cold-start retry already
  opens a closed vault
  ([ADR-045](../decisions/ADR-045-closed-vaults-recovered-only-by-the-dispatch-retry.md)).
  The plugin lifecycle checks (ADR-013, ADR-014) run as before; only the
  stage ahead of them is gone.

### Ordering and `limit`

Both templates sort what the plugin returns by `score` descending, then
`path` byte-ascending, then `headingPath.join('#')` byte-ascending, and cut
to `limit` with a final `.slice(0, a.limit)`. Until PR #116 they also passed
the agent's `limit` to the plugin — `lookup({ filter: { limit } })` and
`find_connections({ limit })` — so the plugin's own cut chose which
equal-score blocks reached the sort, and the documented tie-break only
reordered the survivors (spec 085 research F1, F5). A smaller `limit` could
then return an entry a larger one did not.

Since PR #116 each template asks the plugin for a fixed `MAX_LIMIT` (100)
candidates on every call, whatever `limit` is, and the trailing slice is the
only cut to `limit`. Every allowed `limit` is therefore a leading slice of one
fully sorted list: the same entries, in the same order
([ADR-055](../decisions/ADR-055-smart-connections-tools-fetch-a-fixed-candidate-list-before-sorting.md)).
`smart_connections_similar` removes the source note's own blocks after that
fetch and before the slice. As merged, each tool's `schema.ts` exports its
own `MAX_LIMIT`, used by the schema's `.max()` and interpolated into the
template, so neither tool imports the other (constitution Principle I). Each
tool has a `_template.test.ts` that runs the real `JS_TEMPLATE` under
`node:vm` against a stub plugin that truncates to the limit it is asked for,
and checks every pair of limits N < M from 1 to 100. Both descriptions
carried one sentence stating the guarantee, which moved their description
fingerprints only. Since PR #143 (spec 092) the guarantee is on the two help
pages instead, and each description says only what the tool returns and
when to choose it over the other: `smart_connections_query` from a
free-text question, `smart_connections_similar` from a source note
([ADR-074](../decisions/ADR-074-tool-descriptions-route-within-a-budget-and-the-help-page-holds-the-contract.md)).
Their runtime-dependency detail (plugin not installed, not yet indexed) and
the closed-vault rows moved to the help pages in the same PR.

### From a plugin key to a match

The plugin names each candidate block by a key: `<path>` for a whole note,
`<path>#<heading>#<heading>…` for a section, `<path>#---frontmatter---` for
the frontmatter block, and `<path>#` for the text before a note's first
heading. Since PR #141 (BI-0184) both templates turn a key and its score into
the published `{ path, headingPath, score }` through one in-eval fragment,
`TO_MATCH_JS` in `src/tools/_smart-connections.ts`, bound once per template as
`toMatch` and applied to each tool's own key extraction (`m.key` for `query`,
`r.item.key` or `r.key` for `similar`). It splits the key on its first `#`,
then on every `#` after it, and drops empty segments. The `---frontmatter---`
sentinel and sub-block ids such as `{1}` stay ordinary segments.

Before PR #141 each template carried its own inline copy of the split,
`key.slice(hashIdx+1).split('#')`, which kept empty segments. A pre-heading
block, keyed `<path>#`, therefore came back as `headingPath: [""]`, although
both descriptions and help pages promised `[]` for a source-level match;
TC-00503 caught it on two heading-less fixture notes on both tools
(`.specify/bugs/bi-0184/assessment.md`). The fix moved the rule into the
cohort leaf beside `MAX_LIMIT` and `SORT_SLICE_AND_EMIT`, so the two tools
cannot drift apart again. It first shipped as a key-split fragment; the PR's
code-quality review widened it to build the whole match, so neither template
writes the match literal itself. The descriptions, schemas and fingerprint
baseline did not move: the tools now do what they already said.

What follows from the rule:

- A pre-heading block and a whole-note match on the same note both report
  `headingPath: []`, and a caller cannot tell them apart. The BI's acceptance
  criteria ask for exactly that.
- The tertiary sort key `headingPath.join('#')` is unchanged for every key the
  plugin was seen to produce, since `[]` and `[""]` both join to `""`. A key
  with an empty interior segment (`<path>##H2`, `<path>#H1#`), never seen from
  the plugin, now sorts by its cleaned path (`fix.md` Deviations).
- `_smart-connections.test.ts` runs the fragment under `node:vm` against a key
  table. The acceptance-criteria rows and the mixed-key set with its expected
  order live once in `_smart-connections-fixtures.ts`, and each tool's
  `_template.test.ts` runs them through its own template.

Published surface (PR #90; [architecture](../architecture.md#registration--the-one-path-from-a-schema-to-a-published-tool)):
both carry the read-only hint row, including "beyond vault" (`openWorldHint`)
false, as spec 068 FR-024 classifies them. `smart_connections_query`'s
optional `vault` is the shared `focusedVaultField`
(`src/tools/_vault-field.ts`). The routing guide in the server instructions
lists both under "Semantic search (Smart Connections)", and that line is shown
only when both tools are offered
([server instructions](../architecture.md#server-instructions)). Since PR #91
both publish an `outputSchema` and return their result as `structuredContent`
beside the identical text
([typed results](../architecture.md#typed-results-outputschema-and-structuredcontent)).
Since PR #97 `smart_connections_similar`'s description carries "Supported
file types: notes."
([file types](../architecture.md#file-types-check-the-file-that-will-be-acted-on));
a non-note source is still refused with its existing `NOT_MARKDOWN` (spec 070
FR-007a), and its plugin lifecycle (ADR-013, ADR-014) is untouched.

## Failure

All conditions are `CLI_REPORTED_ERROR` with `details.code`, split further by
`details.reason` where one condition has several states (ADR-015):

| `details.code` | `details.reason` | Meaning |
| --- | --- | --- |
| `SMART_CONNECTIONS_NOT_INSTALLED` | — | plugin absent or disabled in that vault |
| `SMART_CONNECTIONS_NOT_READY` | `api-missing` | (`similar`) plugin loaded but `env.smart_sources.items` is not available yet |
| `SMART_CONNECTIONS_NOT_READY` | `api-missing` | (`query`) plugin loaded, lookup API not yet available |
| `SMART_CONNECTIONS_NOT_READY` | `embed-failed` | (`query`) the query text could not be embedded |
| `SOURCE_NOT_INDEXED` | — | (`similar`) the source note has no embedding yet; `details.detail` is the resolved path |

Until PR #145 this table gave `smart_connections_similar`'s not-ready row no
`details.reason`. That was wrong: its handler has set
`reason: "api-missing"` when it maps the envelope since spec 026's commit
`00ca7c3` (ADR-015), and PR #145's lifecycle checks assert it. The help page did not show the reason either, and
since PR #145's docs pass it does, along with the not-indexed detail form
(spec 094 research D5).

### The lifecycle order, proven in-process (PR #145)

ADR-014's in-eval stages for `smart_connections_similar` run in this order:
not installed, target missing (`FILE_NOT_FOUND`, or `ERR_NO_ACTIVE_FILE` in
active mode), not a note, not ready, not indexed. Until PR #145 (spec 094)
nothing ran that order: handler tests asserted ready-made envelopes, and the
not-ready state had never been seen live. Since PR #145
`src/tools/smart_connections_similar/handler.lifecycle.test.ts` builds the
registered tool and replaces only the spawned `obsidian` process, with
`makeEvalRunnerSpawn`
([architecture](../architecture.md#reaching-obsidian-internals-the-eval-template-pattern)),
so the real template runs against a simulated vault and plugin. Its checks
cover each state alone, including all four branches of the readiness guard;
the pairs of states that can occur together, where the earlier stage must win;
and three active-mode cases. Each compares the whole `{code, message, details}`
the agent receives against literals written in the test, never imported from
the handler or template (spec 094 research D5). The PR changed no production
file, schema, description or fingerprint.

The checks were themselves tested once, by hand: nine edits to `_template.ts`
that swap two adjacent stages or drop one, each reverted
(`specs/094-verify-lifecycle-errors/exercise.md`). Every edit failed at least
one check. Swapping the not-found and not-a-note stages cannot show while the
plugin is absent, because not-installed returns first in both chains; the
contract's "every check fails" for that edit was corrected by owner ruling,
not the checks. `smart_connections_query` has no such suite.

A closed registered vault is opened by the cold-start retry and the call
returns its normal result
([architecture](../architecture.md#runtime-spine)). If it cannot be brought
up, the retry's `CLI_REPORTED_ERROR`, whose `details.stdout` starts
`Error: Command "eval" not found.`, reaches the caller unchanged ("vault
unavailable"), with no `details.code`. Since PR #110 that line can follow
other plugins' start-up lines rather than start `details.stdout`; dispatch
recognises it on any line of `eval` output and the tools' error rosters say
so. A missing or unparseable answer is still the tools' existing
`json-parse` / `envelope-parse` error, now with the bounded `details.stdout`
excerpt and `details.stdoutLength`. Both descriptions' precedence chains
now go from `VAULT_NOT_FOUND(unknown)` straight to
`SMART_CONNECTIONS_NOT_INSTALLED`.

Until PR #100 this page said a closed vault reported
`details.reason: "not-open"` and that the detecting `eval` opened the vault as
a side effect. That state was never produced through the `Obsidian.com` shim
the server drives: a closed vault answers there with the cold-start text, not
the empty stdout the check waited for. In the T0 check for PR #100 both tools,
called with the test vault closed, came back with their normal result for that
vault (`SMART_CONNECTIONS_NOT_INSTALLED`, since the plugin is not installed
there), which comes from a stage that runs only after the vault has answered.

## Known limits

- `smart_connections_query` caps `query` at 2000 characters. That is not a
  product choice. Above roughly 4 KB of base64 `eval` payload, an upstream CLI
  defect on Windows hangs the host: calls time out at 10 s, and calls after
  them keep timing out for 30–60 s. Longer text should be summarised on the
  client first.
- Results are only as current as the plugin's index. The server does not
  trigger re-embedding.
- `smart_connections_similar`'s description still says `VAULT_NOT_FOUND`
  "carries a details.reason sub-discriminator", which now has one value,
  `"unknown"`. PR #100's review left the sentence as it is, because spec 072
  keeps the unknown-vault wording unchanged, and recorded it with that
  follow-up on BI-0076.
- Ties at the 100-candidate edge stay with the plugin (PR #116). When several
  matches share the score of the plugin's 100th candidate, the plugin decides
  which of them are in the list; the tie-break orders only those. This does
  not depend on `limit`. For `smart_connections_similar`, self-exclusion runs
  after the fetch, so a call can return fewer than `limit` matches when the
  source's own blocks were among the 100; that too is the same at every
  `limit`. Both help pages document the edge.
- The 100-candidate fetch was not measured against a live indexed vault in
  PR #116 (spec 085 SC-005, T025): no Smart Connections vault was available
  to the implementation session. `limit: 100` was already an allowed input,
  so it is a request size both tools already made.
- A heading whose own text contains `#` is still split there, so its
  `headingPath` has one segment more than the note has headings. PR #141 left
  this long-standing behaviour alone. It also left out a `min(1)` guard on
  `headingPath` segments in the output schema: the in-eval rule already drops
  empty segments, and a guard would only turn a plugin answer the tools can
  report into a failure, and move the fingerprint baseline.
- PR #141's live check ran each template through `Obsidian.com eval` against
  the test vault, not through the MCP stdio round trip, and its "before"
  control was a reconstruction of the old split rather than the old template
  bytes (`.specify/bugs/bi-0184/test.md`, Residual Risks).
