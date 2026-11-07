# ADR-080 — query_base mirrors Obsidian's grouping for a grouped view, and fails what it cannot mirror

- **Status:** Accepted
- **Date:** 2026-11-07
- **Source:** PR #158 (BI-0207, `.specify/bugs/bi-0207/assessment.md` Open
  Questions, `fix.md` Deviations and Code review fixes, `test.md`), commits
  `2d48e01`, `168f4da`, `9914a86`
- **Related:** ADR-015 (Sub-Discriminators via details.reason for
  Multi-State Error Codes), whose `details.code` / `details.reason` form the
  new failures use.
  [ADR-053](ADR-053-create-base-contains-a-named-vault-item-and-reports-an-escape-it-cannot-prevent.md),
  whose block-YAML scan technique the `groupBy` scan copies.
  [ADR-058](ADR-058-context-search-reads-matched-lines-back-and-fails-when-one-cannot-be.md),
  whose batched read-back the group-value reads now share a planner with.
  [ADR-072](ADR-072-views-base-lists-only-once-the-named-base-is-the-active-file.md),
  which accepted a focus change for `views_base` that this decision does not
  take for `query_base`.

## Context

For a view whose `.base` definition groups by a property, `query_base`
returned flat rows in file-path order carrying only the view's `order:`
columns. Nothing said which group a row belonged to, and when the group
property was not a column the grouping could not be recovered (TC-00909,
reproduced on the published 0.9.0). The defect is upstream: Obsidian's own
`base:query` never reads `groupBy`, and none of its output formats carries a
group. The grouping exists only inside an open Bases view, as
`BasesQueryResult.groupedData`.

So the wrapper either reads Obsidian's grouping from somewhere it exists, or
computes it. The constraints that shaped the choice: `query_base` is
read-only and has never moved Obsidian's focus; the eval context has no YAML
parser (T040, PR #114); the `Obsidian.com` shim stops answering an `eval`
whose code passes about 4,000 characters (spec 088 F10); and an ungrouped
view had to return exactly what it returned before, with no extra call
(acceptance criterion 4).

## Decision

1. **Mirror, do not read back** (owner ruling, assessment Q1). For a
   grouped view, `query_base` reads each row's group value from Obsidian and
   applies Obsidian 1.15's own grouping and group order in TypeScript
   (`src/tools/query_base/group-order.ts`). The rules were read from
   Obsidian's `app.js` (`Value.looseEquals`, `Value.toString`,
   `BasesQueryResult.groupedData`) and checked live against the open view's
   `groupedData`: 26 of 26 grouped views (13 properties × ASC/DESC) matched
   row for row (`fix.md`, Local Verification).
2. **Find the grouping in Node** (owner ruling 2026-11-07, option A). The
   handler reads the `.base` text through a new required `ExecuteFs.readFile`
   and `findViewGrouping` (`group-by.ts`) scans the named view's block-style
   `groupBy` and `groupOrder`. A view counts as grouped exactly when
   Obsidian's view parser says so: a non-empty string `property` and a
   `direction` of exactly `ASC` or `DESC`. Any other `groupBy` is ungrouped,
   as in Obsidian; a shape the scan cannot read is `unreadable`, never
   ungrouped. An ungrouped view runs no `eval`.
3. **Read values in batches through one shared planner.** Two frozen
   read-only templates (`NOTE_GROUP_TEMPLATE`, `FILE_GROUP_TEMPLATE`) return
   each row's value in a typed form plus Obsidian's collator locale. Paths go
   folder-grouped in batches whose composed code stays at or under
   `EVAL_BATCH_CODE_MAX = 2900`, planned by `planEvalBatches` in
   `src/tools/_eval-batches.ts`, which `context_search`'s read-back now uses
   too. The answer is validated at the boundary (`queryBaseGroupValuesSchema`,
   then `mirrored` and the ICU locale check in `group-values.ts`).
4. **One output shape, grouped views only** (assessment Q2 = A, Q4). Rows
   stay one flat list, now in group order; each carries a reserved `group`
   after `path` (the printed key, or `null` for the null group), and the
   result carries `group_by: { property, direction }`. A view column named
   `group` moves to `group_view`, as `path` moves to `path_view`. The
   1000-row cap applies after the reorder.
5. **Fail, never fall back.** A custom group order, an unreadable `groupBy`,
   formula or other `file.*` grouping, a value the mirror cannot match, and a
   collator locale this server's ICU lacks all fail with
   `CLI_REPORTED_ERROR` / `details.code: "GROUPING_UNSUPPORTED"` and a
   `details.reason`. A note gone mid-query fails with
   `details.stage: "group-values"`, `reason: "note-not-found"`; a failed or
   malformed batch is a typed `json-parse` / `envelope-parse` error. No new
   top-level code (Principle IV).

## Alternatives rejected

- **Open the view and read `groupedData`** (assessment, first alternative).
  Exact for every value type, but it changes the user's workspace (the
  probe's opened Base became the active file even with `active: false`),
  reaches through the internal `controller`, polls an asynchronous scan
  inside the 10 s budget, and lists non-Markdown files `base:query` omits.
  Rejected by the owner (Q1: do not open the view).
- **Parse the `.base` with a YAML library in Node.** Robust against flow
  style, but it would be the first runtime dependency beyond the MCP SDK and
  `zod`. Not taken; the hand scan's limit is the `unreadable-group-by`
  failure.
- **Let the eval find `groupBy`, in one eval for all rows** (the assessment's
  preferred shape). It contradicted the no-eval promise for ungrouped views,
  and one eval carrying every row path does not fit under the shim's limit.
  The owner ruled for the Node read and batched evals (option A), and also
  ruled out calling Obsidian's internal CLI handlers (`app.cli.handlers`).
- **`groups: [{ value, count }]` beside the rows, or `groups: [{ value,
  rows }]` in place of them** (Q2 options B and C). The first makes the
  caller slice rows by counts and leaves the last count partial under
  truncation; the second gives callers a second result shape to branch on.
- **Report a `groupBy` with an unknown direction as an error**, as the
  assessment planned. Obsidian silently shows such a view ungrouped, so
  `query_base` does the same rather than refuse a view Obsidian renders.
- **Fold `""` groups into `null`**, as `base:query` does for empty columns.
  Obsidian keeps an empty-string group apart from the null group and orders
  it differently; merging them would mislabel rows (`fix.md`, Deviation 7).
- **A second copy of the batch planner.** The fix first copied
  `context_search`'s `planReadBack`; the PR #158 code-quality review (F1)
  moved both onto `planEvalBatches`.
- **One `.base` read in place of the `stat` pre-flight** (PR #158 review,
  owner ruling Q4 = B). It would drop `ExecuteFs.stat`, but it changes the
  order errors surface in and edits tests outside the approved set. Left as
  a follow-up in `fix.md`.

## Consequences

- An agent gets Obsidian's grouping for note properties and for
  `file.folder`, `ext`, `tags`, `ctime` and `mtime`. Formula grouping and a
  custom group order are refused, not approximated.
- The mirror can drift. A later Obsidian release that changes `groupedData`,
  or that makes `base:query` emit groups, makes it stale; the 26-view
  comparison has to be re-run on each release that touches Bases
  (`test.md`, Residual Risks). Text keys are ordered by this server's ICU
  collator in Obsidian's locale, which could differ from Electron's on rare
  characters.
- `group-order.ts` uses loose `==` and a linear group search on purpose,
  because Obsidian does; neither should be tidied without re-running the
  live comparison (`fix.md`, Follow-ups).
- A grouped view costs about one extra `eval` per 12 rows with long paths,
  or per 70 with short ones; a 1,000-row grouped view with long paths is
  roughly 80 calls. Wall-clock time for a large view was not measured.
- The `.base` is now touched twice: `stat` before the CLI, `readFile`
  after it. A `.base` deleted between the two reports `BASE_NOT_FOUND` after
  a successful query.
- `query_base`'s input description and `outputSchema` changed, so its
  input and output fingerprints moved in `src/tools/_register-baseline.json`
  (the deliberate-change gate). Ungrouped results are unchanged.
