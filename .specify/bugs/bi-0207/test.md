# Bug Verification: `query_base` drops a grouped view's groups

- **Slug**: bi-0207
- **Tested**: 2026-11-07
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The assessment's reproduction was re-run live on `TestVault-Obsidian-CLI-MCP` (Obsidian 1.15.0) through the built MCP server over stdio. A grouped view now returns its rows in Obsidian's group order, each row names its group, and the result carries `group_by`. The ungrouped `Flat` view returns exactly the flat result it returned before. Obsidian's own `base:query` still emits flat rows, as expected: the defect is upstream and the wrapper compensates. The new tests, the full regression suite, lint and typecheck all pass. No regressions were found.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Upstream still flat (control) | `Obsidian.com vault=TestVault-Obsidian-CLI-MCP base:query path=Sandbox/bi0207/grouped.base view=Grouped format=json` | pass | Same flat output as the assessment's step 2 (a, b, c with only `file name`, no group). This confirms the reproduction still triggers upstream. |
| Reproduction (post-fix), view `Grouped` (ASC) | `npm run build`; the assessment's step 1 fixtures re-seeded in `Sandbox/bi0207/`; `tools/call query_base {base_path: "Sandbox/bi0207/grouped.base", view_name: "Grouped", vault: "TestVault-Obsidian-CLI-MCP"}` through `scripts/_stdio-client.ts` (built `dist/index.js`, legacy handshake) | pass | Rows: b-note `one`, then a-note `two`, c-note `two`. `group_by: {property: "note.status", direction: "ASC"}`. This is criteria 1, 2 (the `status` property is not a column) and 3. The order is the one the assessment's step 3 recorded from Obsidian's open view (`one` → b; `two` → a, c). |
| Reproduction (post-fix), view `GroupedDesc` | same, `view_name: "GroupedDesc"` | pass | a-note `two`, c-note `two`, then b-note `one`; the `status` column is kept beside `group`. Matches the assessment's step 3 DESC order. |
| Reproduction (post-fix), view `Flat` (criterion 4) | same, `view_name: "Flat"` | pass | `{columns: ["path","file name"], rows: [a, b, c], truncated: false}`: no `group_by`, no `group`, upstream order. |
| Published contract | `tools/list` and each call's `content[0].text` | pass | `query_base`'s `outputSchema` lists `group_by`. For all three calls, `content[0].text` is identical to `structuredContent`. No error-level server log lines. |
| Exact match with Obsidian's grouping (fix-time, recorded in fix.md) | 26 grouped views (13 properties × ASC/DESC) compared with Obsidian's `groupedData` | pass (not re-run here) | Recorded in `fix.md` § Local Verification as 26/26 identical. Not repeated in this step because the source is unchanged since then. |
| New / updated tests | `npx vitest run src/tools/query_base` | pass | 8 files, 187 tests. These include `handler.grouped.test.ts` (C1–C4 and the typed failures), `groups.test.ts`, `_template.test.ts`, `group-by.test.ts` and `schema.group-by.test.ts`. |
| Regression suite | `npm test` (vitest run with coverage) | pass | 212 files passed (1 skipped), 5279 tests passed (6 skipped). This includes `_register.test.ts` (fingerprint baseline), `_plugin-noise.test.ts` and `_surface.test.ts`. |
| Lint / type-check | `npm run lint`; `npm run typecheck` | pass | Both clean. |
| Fixture clean-up | removed `Sandbox/bi0207/` | pass | No `bi0207` residue in `Sandbox/`; `Welcome.md` present. |

## Output Excerpts

`structuredContent` for `Grouped`:

```json
{"columns":["path","group","file name"],"rows":[{"path":"Sandbox/bi0207/b-note.md","group":"one","file name":"b-note"},{"path":"Sandbox/bi0207/a-note.md","group":"two","file name":"a-note"},{"path":"Sandbox/bi0207/c-note.md","group":"two","file name":"c-note"}],"truncated":false,"group_by":{"property":"note.status","direction":"ASC"}}
```

Regression run:

```
 Test Files  212 passed | 1 skipped (213)
      Tests  5279 passed | 6 skipped (5285)
Lines        : 97.98% ( 3453/3524 )
```

## Residual Risks

- **Mirror, not read-back.** The grouping copies Obsidian 1.15's grouping code. A later Obsidian release that changes how it groups, or that makes `base:query` emit groups, would make the mirror drift. Re-run the 26-view comparison from `fix.md` on each Obsidian release that touches Bases.
- **Collation across runtimes.** Group order for text keys uses this server's ICU collator in the locale Obsidian reports. The live checks matched, but Electron's and Node's ICU versions could differ on rare characters.
- **Latency for large grouped views.** About 12 rows per eval for ~100-character paths, about 70 for short ones, so a 1,000-row grouped view with long paths costs roughly 80 eval calls. This step did not measure wall-clock time for a large grouped view.
- **Unsupported shapes fail by design.** These shapes return `GROUPING_UNSUPPORTED` instead of a result:
  - formula grouping;
  - custom group order;
  - flow-style `groupBy`;
  - `file.*` properties other than folder, ext, tags, ctime and mtime;
  - object or non-finite values.
- **Duplicate labels.** `file.ctime` / `file.mtime` groups are told apart by milliseconds but labelled to the second, so two adjacent groups can carry the same `group` string, exactly as Obsidian shows them.

## Recommendation

Close the bug once the PR is reviewed: the fix is verified end-to-end. The original reproduction no longer shows the defect through the published tool, all four acceptance criteria hold live, and the regression suite, lint and type-check are clean. Carry the `fix.md` follow-ups (the `docs/tools/query_base.md` update during `/speckit-docs-as-code`, and the per-release mirror check) into the PR.
