# Post-Implement Structural Verification: Omit Derived Labels

**Feature**: `071-omit-derived-labels` · Task T020 · Run 2026-10-31 on the working tree after `/speckit-implement`, per plan.md "Graphify structural check" and the CLAUDE.md post-implement rule.

## Graph refresh

- `graphify update .` (AST-only) ran first: 14,806 nodes, 26,389 edges, 796 communities.
- `/graphify --update` then refreshed the semantic nodes. It found 127 changed files since the last semantic run (39 code, 88 docs), including the backlog left by spec 070, whose post-implement step skipped this refresh. 55 docs were served from the extraction cache; the other 33 were re-extracted by 2 subagent chunks, and every file was read to its last line (0 partial).
- **Result**: 14,969 nodes, 26,573 edges, 806 communities. Against the previous graph: 377 nodes and 884 edges added, 214 nodes and 700 edges removed. Communities are named after their highest-degree node, as in earlier runs.
- **Cost**: about 373 K subagent tokens, recorded in `graphify-out/cost.json` as input tokens (the tool reports one total per subagent).
- **Shrink guard overridden on purpose**: the export refused at first because 214 nodes from the previous graph were missing. All 214 came from files re-extracted in this run (the largest groups: a spec 068 relay Q&A log, `.docs-as-code/capabilities/mutate.md`, `.docs-as-code/architecture.md`, `docs/tools/index.md`, `README.md` and `CLAUDE.md`); the fresh extraction replaced them under new node ids. No node from an unchanged file was lost, so the export ran with `force=True`, following the spec 068 precedent.
- **Health warning**: 34 self-loop edges in the extraction (semantic edges whose two ends folded into one node). No dangling, missing or collapsed edges. The self-loops do not affect the checks below.
- **Kernel nodes**: `UpstreamError`, `invokeCli()`, `registerTool()`, `createQueue()`, `dispatchCli()` and `createServer()` remain the top god nodes, unchanged by this feature.

## Checks

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | No new error class outside `src/errors.ts` (Principle IV) | **Pass** | The diff adds no class and no error code. `src/tools/links/` contains no `class` declaration; every error path in `handler.ts` is unchanged. |
| 2 | No handler imports the DI factories; `server.ts` unchanged | **Pass** | `handler.ts`, `server.ts` and `_register.ts` are not in the diff. In `src/tools/links/` only the tests (`index.test.ts`, `handler.test.ts`) import `createQueue`, as before. |
| 3 | `_template.test.ts` attaches to `links/_template.ts::JS_TEMPLATE` | **Pass** | Graph edge `src_tools_links_template_test` → `src_tools_links_template_js_template` (`imports`). `JS_TEMPLATE` now has three importers: `links/handler.ts`, `links/handler.test.ts` and the new test. The test file forms its own small community, which is expected for a test of one-use fixtures. |
| 4 | No production node added | **Pass** | The production nodes in `src/tools/links/` (`JS_TEMPLATE`, `LINKS_DESCRIPTION`, `executeLinks()`, the schemas) are the same set as before; the change edits the bodies of `JS_TEMPLATE` and `LINKS_DESCRIPTION` only. |
| 5 | Only `links.descriptionFingerprint` moved in the baseline | **Pass** | `npm run baseline:write` → `git diff src/tools/_register-baseline.json` shows the `links` `descriptionFingerprint` line and the `generatedFromBranch` header stamp, which the writer sets on every run. No schema, title or annotations fingerprint moved; tool count 35. |

## Live evidence (T0 gates)

All probes ran against `TestVault-Obsidian-CLI-MCP` through `Obsidian.com` with `vault=` passed explicitly, on fixtures under `Sandbox/p071i/`. The fixtures were removed afterwards, and `Welcome.md` is untouched (239 bytes, last written 2026-10-30 20:52).

- **G1 — alias trimming**: Obsidian trims surrounding whitespace off a non-blank alias. `[[Tgt#Head|  Padded  ]]` and `[[Tgt|  Padded  ]]` both give `displayText: "Padded"`. Recorded as research F5; per T002 the spec wording now reads "as written, with surrounding whitespace trimmed, as the editor parses it" (FR-002, FR-006, US3 Independent Test, plus a Clarifications bullet). The help page states the trimming.
- **G3 — aliased frontmatter list item**: `"[[Tgt#Head|Fm Alias]]"` keeps `|` in `original` and gives `displayText: "Fm Alias"`. Recorded as research F6. The fallback was not needed.
- **G2 — end to end through the built tool**: `links` was called through `dist/index.js` on one fixture holding data-model rows 1–27 plus the frontmatter rows, before the change ([contracts/g2-before.json](contracts/g2-before.json)) and after it ([contracts/g2-after.json](contracts/g2-after.json)). Both runs return 29 entries, and `total: true` returns `count: 29` with `links: []`. `target`, `line`, `kind` and order are identical. Every row's `displayText` matches data-model.md: the 12 derived labels and the 3 empty labels are gone, and every author alias (`Fm Alias`, `Custom Display`, `Other Label`, `Alias`, `Emb Alias`, `Tgt > Head`, `Tbl Alias`, `300`, `300x200`) and every Markdown label (`Text`, `""`, `alt`) is unchanged.
- A re-dump of the full cache matched every G0 shape in [contracts/t0-cache-shapes.json](contracts/t0-cache-shapes.json).

## Deviations

None from the plan. The template-execution test was written as one file covering every story's rows (T005, T006, T009–T013), and the derived-label rows were confirmed to fail on the unchanged template before T007.
