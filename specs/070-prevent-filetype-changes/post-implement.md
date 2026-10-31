# Post-Implement Structural Verification: Prevent File Type Changes

**Feature**: `070-prevent-filetype-changes` · Task T035 · Run 2026-10-31 on the working tree after `/speckit-implement`, per plan.md "Graphify structural check" and the CLAUDE.md post-implement rule.

## Graph refresh

- `graphify update .` (AST-only) ran: 14,660 nodes, 26,174 edges, 760 communities.
- `/graphify --update` (the LLM semantic refresh of prose nodes) was **not run** in this unattended step. It has real token cost, and none of the five checks below depends on semantic nodes; they read the AST graph and the code. Run it once at the next phase boundary (after review fixes) so the spec 070 prose nodes are current.

## Checks

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | No new error class outside `src/errors.ts` (Principle IV) | **Pass** | The only error class in production code is `UpstreamError` in `src/errors.ts`. The new rejection is `VALIDATION_ERROR` + `details.code: "UNSUPPORTED_FILE_TYPE"`, built as an `UpstreamError` value in `src/file-type/file-type.ts`; zero new top-level codes. |
| 2 | No handler imports `createLogger` / `createQueue` / `createServer`; no tool module imports another tool module; `server.ts` gained no import | **Pass** | No handler has an edge to the three kernel factories. The only tool-to-tool production edges are `context_search` and `pattern_search` → `search`, which predate this feature (neither file is touched here). The `src/server.ts` diff is four argument-only lines (`createReadTool`, `createRenameTool`, `createMoveTool`, `createOutlineTool` gain the already-constructed `vaultRegistry`) and no import line. |
| 3 | `src/file-type/` forms its own community connected to the seven handlers; `appendMdIfMissing` is gone | **Partly** — see deviation | `appendMdIfMissing` has no node (removed from `rename/handler.ts`). `src/file-type/file-type.ts` did not form a community of its own: its types and constants (`FileCategory`, `ALL_CATEGORIES`, `describeSupport`, …) were placed in the large boot-spine community labelled `server.ts`, and its functions (`assertSupportedFileType`, `extensionOf`, `categoryOf`, `resolveDestinationName`, `typeChangeError`) in a community labelled `executeReadNote`. |
| 4 | `src/file-type/file-type.ts` and other new production code are structurally connected, not orphaned | **Pass** | `file-type.ts` has inbound edges from all seven code-changed handlers (read, rename, move, outline, write_note, append_note, prepend), from the 16 in-scope `index.ts` files (the description sentence), and from its tests. The new shared resolver `src/tools/_file-target.ts` has inbound edges from the read, rename, move and outline handlers and sits in the runtime-spine community (labelled `Logger`) alongside `_active-file.ts`. |
| 5 | Only in-scope tools' fingerprints moved | **Pass** | `npm run baseline:write` → `descriptionFingerprint` moved for exactly the 16 in-scope tools (append_note, backlinks, create_base, delete, find_and_replace, links, move, open_file, outline, prepend, query_base, read, rename, smart_connections_similar, views_base, write_note); `schemaFingerprint` moved for `rename` and `move` only (reworded `name` / `to` descriptions); tool count 35. |

## Deviations

**Community placement of `src/file-type/` (check 3).** The plan expected a fresh community. The clustering instead split the module by how it is used: the description helpers and types joined the boot-spine community, because 16 `index.ts` registration modules import them, and the check functions joined the community of `executeReadNote`, their densest caller. The import direction is what Principle I requires (tools → helper, helper → `src/errors.ts` only; the module imports nothing else), and the module is well connected (check 4), so this is a clustering outcome, not an architectural drift. Worth a glance at review; no code change proposed.

**Plan structure additions.** `src/tools/_file-target.ts` (one `resolveFileTarget` / `forwardedLocator` pair for read, rename, move and outline, instead of four copies) and three test fixtures in `src/tools/_handler-test-fixtures.ts` were not named in the plan's source tree. `_active-file.ts` stayed unchanged, as planned. Recorded in tasks.md Notes and contracts/tool-support.md.

## Kernel-node touch (as planned)

`createServer` body only: four registration lines gain the `vaultRegistry` argument. `createLogger`, `createQueue`: untouched. `UpstreamError`: one new importer (`src/file-type/file-type.ts`), used as a value; no new class, no new code.
