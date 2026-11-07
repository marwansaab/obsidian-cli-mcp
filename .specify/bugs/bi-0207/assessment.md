# Bug Assessment: `query_base` drops a grouped view's groups

- **Slug**: bi-0207
- **Created**: 2026-11-07
- **Source**: pasted text (BI-0207 backlog item; reproduction on the published `@marwansaab/obsidian-cli-mcp@0.9.0` recorded in vault test case TC-00909 "Query Base Grouped View Returns Its Groups"). No URL was supplied, so the URL Trust Policy did not apply.
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> **Impact.** Grouped views ("tasks by status", "BIs by tier") are a common way to summarise a backlog. Today an agent gets the rows but must re-group them itself, and only if the group property happens to be in `order:`; if it is not, the grouping is unrecoverable from the result.
>
> **Status and evidence.** Queued 2026-11-07, awaiting owner triage. Filed from the imported-tool-notes sweep, reproduced on the published `@marwansaab/obsidian-cli-mcp@0.9.0` (TC-00909). Reported by the Slipwright notes.
>
> **Defect.** `query_base` on a view with `groupBy` returns flat rows in file-name order, with only the `order:` columns, no group field, and not ordered by the group property. The caller cannot rebuild the grouping Obsidian shows.

The report carries an expected-behaviour draft (feature "Return view groups"), whose acceptance criteria this assessment adopts as the fix's success criteria:

1. Given a view grouped by `status` over three notes with statuses `two`, `one` and `two`, each returned row identifies its group value.
2. Given the grouping property is not one of the view's columns, the group value is still reported.
3. Given the same view with ascending group order, the rows of group `one` come before the rows of group `two`.
4. Given a view without grouping, the result is the same as today.

Out of scope, per the report: grouping by formulas or by several properties; summaries or counts per group; changing the view itself.

## Symptom

For a view whose `.base` definition carries `groupBy`, `query_base` returns one flat list of rows in file-path order, holding only the view's `order:` columns. Nothing in the result says which group a row belongs to, the rows are not in group order, and when the group property is not a column the grouping cannot be recovered at all. Expected: the rows come back in the order of the groups Obsidian shows, and each row names its group.

## Reproduction

Reproduced live on 2026-11-07 against `TestVault-Obsidian-CLI-MCP` (Obsidian 1.15.0, installer 1.14.4), driving `Obsidian.com` directly so the raw CLI output is visible. The fixtures were removed afterwards.

1. In `Sandbox/bi0207/`, create `a-note.md` (`status: two`), `b-note.md` (`status: one`) and `c-note.md` (`status: two`), and `grouped.base`:
   ```yaml
   filters:
     and:
       - file.inFolder("Sandbox/bi0207")
   views:
     - type: table
       name: Grouped
       groupBy:
         property: note.status
         direction: ASC
       order:
         - file.name
     - type: table
       name: GroupedDesc
       groupBy:
         property: note.status
         direction: DESC
       order:
         - file.name
         - note.status
     - type: table
       name: Flat
       order:
         - file.name
   ```
2. Run `obsidian vault=TestVault-Obsidian-CLI-MCP base:query path=Sandbox/bi0207/grouped.base view=Grouped format=json`. Observed (identical to the `Flat` view):
   ```json
   [
     { "path": "Sandbox/bi0207/a-note.md", "file name": "a-note" },
     { "path": "Sandbox/bi0207/b-note.md", "file name": "b-note" },
     { "path": "Sandbox/bi0207/c-note.md", "file name": "c-note" }
   ]
   ```
   No status, no group, file-path order. `view=GroupedDesc` returns the same order with a `status` column (`two`, `one`, `two`), so even when the property is a column the rows are not in group order. `format=md` gives the same flat table.
3. Open the same base in Obsidian. Read through the open view's query result (`leaf.view.controller.view.data.groupedData`), Obsidian shows for `Grouped` (ASC): `one` → `b-note`; `two` → `a-note`, `c-note`; then a null group. For `GroupedDesc`: `two` → `a-note`, `c-note`; `one` → `b-note`; then the null group. The null group sits last in both directions. (It held the `.base` file itself, which the open view lists and `base:query` never does, since `base:query` scans only Markdown files.)

`query_base` passes step 2's rows through unchanged, so its result has the same defect.

## Suspected Code Paths

- Upstream, Obsidian's own `base:query` CLI handler (read from `app.cli.handlers.get("base:query")` in the live app). It parses the `.base`, filters the vault's Markdown files, sorts them by path, applies the view's sort, and emits `f.data` (the flat result) mapped over `c.getOrder()` (the `order:` columns). It never reads the view's `groupBy`, and none of its formats (`json|csv|tsv|md|paths`) carry a group. The defect originates here; the wrapper inherits it.
- `src/tools/query_base/handler.ts:executeQueryBase()` — Stage 3 calls `base:query` with `format: "json"`; Stage 6 keeps upstream's emission order verbatim (the comment at Stage 6 records that the wrapper "does NOT re-sort because it has no signal" for the view's sort key). No stage reads the view's `groupBy` or any frontmatter beyond what upstream emits.
- `src/tools/query_base/handler.ts:postProcessRows()` — builds each output row from the upstream row (reserved `path`, `path_view` on collision, then the upstream columns). Any per-row group value would be added here.
- `src/tools/query_base/schema.ts:queryBaseOutputSchema` — the strict `{ columns, rows, truncated, total_rows? }` envelope; it has no place for a group. Its input schema's `.describe()` text documents the response shape and the "does NOT parse the `.base` YAML client-side" stance, which a fix that reads `groupBy` changes.

## Root Cause Hypothesis

Obsidian's `base:query` CLI command ignores the view's `groupBy`: it returns the view's filtered and sorted rows with only the `order:` columns, and the grouping exists only in the in-app Bases view (`BasesQueryResult.groupedData`). `query_base` is a pass-through of that command, so it has no group information to return. Confidence: high (the upstream handler's source and the live output were both inspected).

## Proposed Remediation

The owner ruled on 2026-11-07 that BI-0207 stays on the bug path and settled the four open questions (see Open Questions). The remediation below reflects those answers.

**Preferred — compute the groups in the wrapper from one read-only eval (Resolved (Relay): owner Q1).** When `base:query` succeeds with at least one row, run one frozen eval template (`composeEvalCode` payload: the base path, the view name and the returned row paths) through `invokeEval`. The template:

1. reads the `.base` with `app.vault.cachedRead` and finds the named view's `groupBy` block by scanning the block-style YAML Obsidian writes, the same technique and limits as `create_base`'s `ITEM_FOLDER_TEMPLATE` (the eval context has no YAML parser: T040). It answers "not grouped" only when the named view has no `groupBy` key at all. A `groupBy` it finds but cannot read (flow style, several properties, a formula, an unknown direction) is answered as unsupported, never as "not grouped".
2. reads each row's group value from Obsidian's public metadata, for the property kinds the owner ruled in scope (Q3):
   - `note.<name>` (or a bare `<name>`): the note's frontmatter value from `app.metadataCache.getFileCache(file)?.frontmatter`, the API `find_by_property`'s template already uses;
   - `file.folder`, `file.ext` (extension), `file.tags`, and the file dates `file.ctime` / `file.mtime`: from the `TFile` (`file.parent.path`, `file.extension`, `file.stat.ctime` / `file.stat.mtime`) and, for tags, the file's metadata cache (frontmatter `tags` plus inline tags; `getAllTags` lives in the `obsidian` module, which the eval context cannot `require`, so the template combines the two sources itself).
   Any other `groupBy` property (another `file.*` property, `formula.*`, which stays out of scope) is answered as unsupported.

The handler then, only for a grouped view, adds the group value to each row and reorders the rows by group, keeping upstream's order within a group. Order mirrors Obsidian (Q1): direction from `groupBy.direction` (`ASC` when absent), the null group last in both directions (observed in step 3). How Obsidian orders numbers, dates, booleans, lists (a note with two tags) and case is characterised by a T0 probe at fix time; the fix mirrors each characterised rule exactly, and a value type it cannot match is a typed error, not a best guess. The 1000-row cap and `truncated`/`total_rows` apply after the reorder.

**Output (Resolved (Relay): owner Q2 and Q4).** Grouped views only: a top-level `group_by: { property, direction }` (the property as the view declares it, the direction as `ASC` or `DESC`), and each row carries a reserved `group` key whose value is a string like every value upstream emits, or `null` for the null group. When the view itself has a column whose emitted name is `group`, the reserved key wins and the view's column moves to `group_view`, exactly as `postProcessRows()` already does for `path` / `path_view`. An ungrouped view never runs the eval, has no `group_by` and no `group`, and returns exactly what it returns today.

**Unsupported grouping.** A `groupBy` shape, property or value type the fix cannot match fails the call with an `UpstreamError` under an existing top-level code (Principle IV: no new code in `src/errors.ts`; the eval-backed tools' `CLI_REPORTED_ERROR` with a `stage` / ADR-015 `details.code` + `details.reason` sub-discriminator is the expected form; the fix names the exact values). It never falls back to the flat, ungrouped result. An eval failure or malformed eval answer is a typed `CLI_REPORTED_ERROR` too.

This adds no dependency, writes nothing, and opens nothing in Obsidian (Q1: do not open the view), so `READ_ONLY_HINTS` stay true.

**Alternatives** (considered, not taken):
- *Read Obsidian's own grouping from an opened view.* Open the base in a leaf through eval, select the view, wait for its query to finish, read `view.data.groupedData` (public `BasesQueryResult` API, reached through the internal `controller`), and detach the leaf. Exact fidelity to Obsidian's group keys and order for every value type, and file properties for free. But it changes the user's workspace (the probe showed the opened base became the active file even with `active: false`), it relies on the internal `controller` and `setViewState` view selection, it has to poll an asynchronous scan inside the 10 s typed-tool budget (about 0.8 s in the probe), and the open view lists non-Markdown files that `base:query` does not, so the two would need reconciling. ADR-072 accepted a focus change for `views_base`, but `query_base` has never needed one. Rejected by the owner (Q1: do not open the view).
- *Parse the `.base` in Node with a YAML library.* Robust against flow-style YAML and quoting, but adds the project's first runtime dependency besides the MCP SDK and `zod` (supply-chain and Constitution Technical Standards review), and still needs the frontmatter read from Obsidian. Not taken (Q1: one read-only eval).

**Files likely to change**:
- `src/tools/query_base/handler.ts` (group stage after Stage 5, row reorder, reserved `group` / `group_view` in `postProcessRows`, top-level `group_by`)
- `src/tools/query_base/_template.ts` (new: the frozen group-lookup template covering `note.*` and the in-scope `file.*` properties, cohort layout as in `find_by_property/_template.ts`)
- `src/tools/query_base/schema.ts` (optional `group_by` on the output schema; the eval envelope schema; the `.describe()` text, which today says the wrapper does not parse the `.base` YAML)
- `src/tools/query_base/handler.test.ts`, `src/tools/query_base/schema.test.ts`, a new `src/tools/query_base/_template.test.ts`
- `src/tools/_register-baseline.json` (the output schema fingerprint moves: the deliberate-change gate)
- `docs/tools/query_base.md` (during `/speckit-docs-as-code`)

**Tests to add or update**:
- Handler: grouped ASC view over `two`/`one`/`two` returns the `one` row first, then both `two` rows, each with `group` set to its value as a string and a top-level `group_by: { property: "note.status", direction: "ASC" }` (criteria 1 and 3); a grouped view whose property is not a column still reports the group value (criterion 2); DESC order; a row with no value has `group: null` and lands in the null group, last; within-group order equals upstream's.
- Handler: a view column named `group` moves to `group_view` and the reserved `group` holds the group value (as with `path` / `path_view`).
- Handler: `file.folder`, `file.ext`, `file.tags`, `file.ctime` and `file.mtime` groupings return the group values and order the T0 probe characterised.
- Handler: an ungrouped view's result is byte-identical to today's, with no `group_by` and no `group`, and makes no eval call (criterion 4); a zero-row grouped view makes no eval call.
- Handler: an unsupported `groupBy` (flow style, several properties, `formula.*`, another `file.*` property, a value type the fix cannot order) is a typed error, never the flat result; an eval failure or a malformed eval answer surfaces as a typed `CLI_REPORTED_ERROR` (Principle IV); the cap and `truncated`/`total_rows` hold after the reorder.
- Template: block-style `groupBy` found for the named view only (not another view's); a view with no `groupBy` answers "not grouped"; flow style or an unknown shape answers "unsupported", not "not grouped"; quoted and unquoted view names; each in-scope property kind read from the right source.
- Schema: the optional `group_by`, and the description text guards in `schema.test.ts`.
- Live T0 probe on the test vault before the order rules are written: string, number, boolean, list and date frontmatter values; mixed case; missing property; and each in-scope `file.*` property (folder, extension, tags, ctime, mtime), recording Obsidian's group keys and order for each.

## Risks & Considerations

- **Fidelity.** The fix mirrors Obsidian's group order rather than reading it (owner Q1). Strings in ASC/DESC and the trailing null group are confirmed; numbers, dates, booleans, lists (does a note with two tags sit in two groups or one?) and case are not yet characterised, nor are the `file.*` group keys (for example the folder of a root-level note, or the string form of a date). The fix must match Obsidian on each characterised rule and reject what it cannot match with a typed error, never return a plausible wrong grouping.
- **Date strings.** Group values are strings like upstream's (owner Q4). For `file.ctime` / `file.mtime` the string must be the one Obsidian's own value `toString()` gives (the form `base:query` emits for a date column), which the T0 probe records; a hand-rolled date format would not match what upstream emits elsewhere in the same result.
- **YAML scan limits.** A hand scan recognises the block style Obsidian writes, not all YAML. A hand-edited flow-style `groupBy` must not silently read as ungrouped; it is an unsupported-grouping error. `create_base` has the same constraint.
- **Output contract change.** `queryBaseOutputSchema` is strict; the optional `group_by` moves the published `outputSchema` and its fingerprint baseline (MCP Tool Surface Standards: a deliberate change). The change is additive and absent on ungrouped views, so existing callers see no difference. The per-row `group` key needs no schema change (rows are `z.record(z.string(), z.unknown())`).
- **Reserved row key collision.** The reserved `group` key can collide with a view column whose emitted name is `group`; the view's column then moves to `group_view` (owner Q2), as `path` already moves to `path_view`. A view with columns named both `group` and `group_view` is the same corner the `path` rule already has; the fix handles it the way `postProcessRows()` handles `path_view` today.
- **Cost.** A grouped view costs one extra eval call through the queue; ungrouped views cost nothing extra.
- **Vault scope.** The eval runs in the named vault (`vault=`), or the focused vault when none is named, matching `base:query`'s vault; the row paths it receives come from upstream, never from the caller.
- **Upstream may fix it.** If Obsidian's `base:query` later emits groups, the wrapper's computation becomes redundant. A T0 check per release would show it.
- **Out of scope but observed.** The open Bases view lists non-Markdown files that `base:query` omits (step 3: the `.base` file in the null group). This is a separate upstream difference; it is not filed here.

## Complexity Tracking

None at assessment time. The fix adds no top-level error code (failures classify through the existing `CLI_REPORTED_ERROR` with a `stage` / ADR-015 sub-discriminator, as the other eval-backed tools do), no dependency and no boot-time wiring. The output-schema change is additive and goes through the fingerprint baseline's deliberate-change gate, which is not a constitutional deviation.

## CodeGraph structural check

- **Affected module**: `src/tools/query_base/` only. `executeQueryBase` is called only by `src/tools/query_base/index.ts` (`createQueryBaseTool`), which `server.ts` and `src/tools/_typed-result-fixtures.ts` call; tests in `handler.test.ts`, `index.test.ts`, `_plugin-noise.test.ts` and `_file-type-support.test.ts` exercise it. `queryBaseOutputSchema` is used only by the handler and `index.ts` (published as the tool's `outputSchema`, hence the fingerprint baseline).
- **Shared helpers the fix reuses, unchanged**: `invokeEval` (`src/cli-adapter/cli-adapter.ts`), `composeEvalCode` (`src/tools/_shared.ts`), `parseEvalAnswer` / `stdoutDetails` (`src/tools/_eval-parse.ts`). All are already imported downward by sibling eval-backed tools (for example `find_by_property/handler.ts`), so the new imports run one way (Principle I). The fix must not import `create_base/_template.ts`; it copies the technique, not the module.
- **Kernel nodes**: the fix touches none. It does not change `createLogger()`, `createQueue()` or `createServer()`, and constructs neither factory; `ExecuteDeps` already carries the injected `logger` and `queue` that `invokeEval` needs. It imports `UpstreamError` (as the handler already does) and adds no code to `src/errors.ts`.

## Open Questions

Owner ruling, 2026-11-07: BI-0207 takes the bug path and does not move to the full spec-kit workflow, although the fix adds behaviour and output surface (the assessment escalated that point before settling). The four questions below are answered.

- **Output shape.** Resolved (Relay): option A, grouped views only. A top-level `group_by: { property, direction }`, and each row carries a reserved `group` key; a colliding view column moves to `group_view`, as with `path` / `path_view`. The question as asked: `postProcessRows()` already reserves `path` on every row and moves a colliding view column to `path_view`, so a reserved per-row key has a precedent. Options:

  | Option | Shape | Trade-off |
  |---|---|---|
  | A (recommended) | Grouped views only: top-level `group_by: { property, direction }`, and each row carries a reserved `group` key (a colliding view column moves to `group_view`, as with `path`) | Meets "each row identifies its group" directly; rows stay one flat, ordered list; follows the existing `path` rule |
  | B | Grouped views only: top-level `groups: [{ value, count }]` over a flat `rows` list in group order | No per-row key, no collision rule; the caller slices rows by the counts, and truncation makes the last count partial |
  | C | Grouped views only: `groups: [{ value, rows }]` in place of `rows` | Closest to what Obsidian shows; a second result shape callers must branch on, and the cap has to count across groups |

- **Mechanism.** Resolved (Relay): the preferred eval-and-mirror fix. One read-only eval that mirrors Obsidian's group order, with a typed error for any `groupBy` shape or value type it cannot match; the view is not opened. The question as asked: the eval-and-mirror fix keeps `query_base` side-effect free but approximates Obsidian's order for value types not yet characterised; opening the view (first alternative) is exact but changes the user's workspace, as ADR-072 accepted for `views_base`; a Node YAML library (second alternative) adds a runtime dependency. Recommended was the eval-and-mirror fix.
- **Group property kinds.** Resolved (Relay): both `note.*` frontmatter properties and `file.*` properties (folder, extension, tags, dates); formula grouping stays out of scope. The assessment reads "dates" as `file.ctime` and `file.mtime`, and treats any other `file.*` property as unsupported (a typed error, per the mechanism answer). The question as asked: `note.*` frontmatter only, or `file.*` properties too.
- **Group value type.** Resolved (Relay): a string, like every value upstream emits, and `null` for the null group. The question as asked: follow upstream's stringification, or keep the frontmatter's native type.
