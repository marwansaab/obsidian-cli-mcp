# Post-implement: 089 Resolve note names

## T001 baseline

Branch `089-resolve-note-names`, before any edit. `npm run typecheck`, `npm run lint` and `npm test` all passed (exit 0).

- Test files: 186 passed, 1 skipped (187).
- Tests: 4417 passed, 6 skipped (4423).
- Coverage: statements 96.94%, branches 94.67%, functions 91.82%, lines 97.74%.

No pre-existing failure.

## T004 red check

`npx vitest run src/tools/patch_heading/handler.note-name.test.ts src/tools/patch_block/handler.note-name.test.ts` against the unchanged handlers: 16 failed, 4 passed (20). `npm run typecheck` passed with the new files.

| Row | patch_heading | patch_block | Failure against the unchanged handler |
|---|---|---|---|
| N1 | fail | fail | read `<root>\Meeting Notes`, not `<root>\Projects\Deep\Meeting Notes.md` |
| N2 | fail | fail | 0 spawns before the first read (no lookup) |
| N3 (`.md`) | fail | fail | first spawn is the refresh eval; no `file=` argv |
| N3 (no `.md`) | fail | fail | same |
| N4 | fail | fail | resolved instead of rejecting: the handler wrote to the literal path `Missing` |
| N5 | fail | fail | resolved instead of rejecting |
| N6 | pass | pass | the registry check already runs first |
| N7 | fail | fail | `details.path` was `x`, not `Projects/x.md` |
| N8 | pass | pass | `path` targeting already makes no lookup |
| N9 | fail | fail | read `<root>\Daily`, not `<root>\Daily.md` |

Every fix-proving row (N1–N5, N9) bites. N7 also bites, which the task allows.

## T007 US1 gate

After the switch (T005, T006): `npm run typecheck` passed, and `npx vitest run src/tools/patch_heading src/tools/patch_block src/tools/_surface.test.ts src/tools/_register.test.ts src/tools/_plugin-noise.test.ts` passed 21 files, 964 tests. No existing test was edited and no existing assertion failed.

## T008 failure rows

N4, N5, N6 and N7 pass in both suites with no production change beyond T005 and T006. The resolver's errors pass through unchanged: the not-found line surfaces as `CLI_REPORTED_ERROR` with `details.message === 'Error: File "Missing" not found.'` and no `details.code`; the TSV parse failure as `stage: "file-tsv-parse"`; the unknown vault as the registry's `VALIDATION_ERROR` with no spawn; the missing heading or block as `HEADING_NOT_FOUND` / `BLOCK_NOT_FOUND` naming the resolved path. No mapping to `NOTE_NOT_FOUND` was added. FR-004 (a shared name) is covered live by L5 in T014.

## T011 surface gate

- `npx vitest run src/tools/_register.test.ts src/tools/help`: 5 files, 110 tests passed. The fingerprint test passed without `npm run baseline:write`, and the docs-sync guard saw both edited help pages.
- `git diff --exit-code main -- src/tools/_register-baseline.json src/tools/patch_heading/index.ts src/tools/patch_block/index.ts src/tools/patch_heading/schema.ts src/tools/patch_block/schema.ts src/errors.ts src/target-mode/target-mode.ts`: empty, exit 0 (contract P1–P3).

## T014 live check

Read `.memory/test-execution-instructions.md` first. `npm run build` passed. `Obsidian.com eval "code=app.vault.getName()"` answered `=> TestVault-Obsidian-CLI-MCP`. Pre-state: `Sandbox/` had 13 entries; `Welcome.md` SHA-256 `94194952B8B9612DB13032A2A7D214C3A3DD5F31760062D7B9244583FCA6C8D5`.

Seeded under `Sandbox/089-live/`:

- `x/y/Live089.md`: `# Live089`, a paragraph `A live paragraph. ^live089`, `## Tasks`, `- one`.
- `z/Live089Dup.md` and `x/Live089Dup.md`: `# Live089Dup`, a paragraph `Dup paragraph <z|x>. ^dup089`, `## Tasks`, `- <z|x> one`.

The calls went through the built server (`node dist/index.js` over stdio, raw JSON-RPC, protocol `2025-06-18`), each with `target_mode: "specific"`, `vault: "TestVault-Obsidian-CLI-MCP"`. Verbatim results:

```text
=== L1 (read) isError=false
{"content":"# Live089\n\nA live paragraph. ^live089\n\n## Tasks\n\n- one\n"}
=== L2 (patch_heading) isError=false
{"path":"Sandbox/089-live/x/y/Live089.md","vault":"TestVault-Obsidian-CLI-MCP","heading_path":"Live089#Tasks","mode":"append","bytes_written":6}
=== L3 (patch_block) isError=false
{"path":"Sandbox/089-live/x/y/Live089.md","vault":"TestVault-Obsidian-CLI-MCP","block_id":"live089","block_shape":"paragraph","bytes_written":-9}
=== L4a (patch_heading) isError=true
{"code":"CLI_REPORTED_ERROR","message":"CLI bridge upstream error: CLI_REPORTED_ERROR","details":{"argv":["obsidian","vault=TestVault-Obsidian-CLI-MCP","file","file=Live089Missing"],"command":"file","stdout":"Error: File \"Live089Missing\" not found.\n","stderr":"","exitCode":0,"message":"Error: File \"Live089Missing\" not found."}}
=== L4b (patch_block) isError=true
{"code":"CLI_REPORTED_ERROR","message":"CLI bridge upstream error: CLI_REPORTED_ERROR","details":{"argv":["obsidian","vault=TestVault-Obsidian-CLI-MCP","file","file=Live089Missing"],"command":"file","stdout":"Error: File \"Live089Missing\" not found.\n","stderr":"","exitCode":0,"message":"Error: File \"Live089Missing\" not found."}}
=== L5-read (read) isError=false
{"content":"# Live089Dup\n\nDup paragraph x. ^dup089\n\n## Tasks\n\n- x one\n"}
=== L5a (patch_heading) isError=false
{"path":"Sandbox/089-live/x/Live089Dup.md","vault":"TestVault-Obsidian-CLI-MCP","heading_path":"Live089Dup#Tasks","mode":"append","bytes_written":6}
=== L5b (patch_block) isError=false
{"path":"Sandbox/089-live/x/Live089Dup.md","vault":"TestVault-Obsidian-CLI-MCP","block_id":"dup089","block_shape":"paragraph","bytes_written":-4}
=== L1-after (read) isError=false
{"content":"# Live089\n\nreplaced ^live089\n\n## Tasks\n\n- one\n- two\n"}
```

On disk afterwards: `x/y/Live089.md` held `replaced ^live089` and `- two` under `## Tasks`; `x/Live089Dup.md` (the note `read` returned) held `dup replaced ^dup089` and `- two`; `z/Live089Dup.md` was unchanged. A recursive file listing of the vault (outside `.obsidian/`) before and after the calls showed no new file.

| Check | Result |
|---|---|
| L1 | pass |
| L2 | pass |
| L3 | pass |
| L4 (both editors) | pass |
| L5 (both editors edit the note `read` returns) | pass |

5 checks attempted, 5 passed, 0 failed. Cleanup: `Sandbox/089-live/` removed; `Sandbox/` back to 13 entries; `Welcome.md` hash unchanged. No residue.

## T015 structural verification

`codegraph sync`, then `codegraph_explore "executePatchHeading executePatchBlock resolveFsTarget"`.

1. **No new error code.** `git diff main -- src/errors.ts` is empty. The handler diffs add no `new UpstreamError`; they only delete `resolveLocator`. Every new failure is one existing code built by existing code (`_dispatch.ts`, `resolveFileByTsv`, the registry).
2. **No DI factory import.** Neither handler imports `createLogger` or `createQueue`; `git diff main -- src/server.ts` is empty. Both handlers pass their deps whole to `resolveFsTarget`.
3. **Imports one-directional.** `patch_heading/handler.ts` and `patch_block/handler.ts` import `resolveFsTarget` from `../_file-target.js` and import only `assertCanonicalPath` from `../_active-file.js`; `resolveActiveLocatorWithVault` is no longer imported by either. No `resolveLocator` symbol remains in either directory. `_file-target.ts` has the same two imports as on `main` (only its header comment changed).
4. **Reachable, no orphan.** `resolveFsTarget` has production callers in `append_note/handler.ts`, `prepend/handler.ts`, `patch_heading/handler.ts` and `patch_block/handler.ts`. The change adds no production export.

No structural deviation. The kernel nodes (`createServer()`, `createLogger()`, `createQueue()`, `UpstreamError`) are untouched, as the plan claimed.

## T016 full gate

- `npm run typecheck`: pass.
- `npm run lint`: pass (after fixing one `import-x/order` error in the new `patch_heading/handler.note-name.test.ts`).
- `npm test`: pass. Test files 188 passed, 1 skipped (189); tests 4437 passed, 6 skipped (4443), which is T001's 4417 plus the 20 new rows. Coverage: statements 96.93%, branches 94.65%, functions 91.79%, lines 97.73%.
- `npm run format:check`: **fails, pre-existing and environmental.** It names 1343 files. `.prettierrc.json` sets `endOfLine: "lf"` while this Windows checkout has `core.autocrlf=true`, so every file fails here. Even with `--end-of-line auto`, the untouched `patch_heading/handler.test.ts` and `main`'s versions of `docs/tools/patch_heading.md`, `docs/tools/patch_block.md` and `CHANGELOG.md` fail, so the repository is not prettier-clean on `main`. CI does not run `format:check`.
  - As the task allows, `npx prettier --write` was run on the five TypeScript files this feature touched. It reformatted the two new suites and wrapped the new `resolveFsTarget(...)` call in each handler. It also rewrapped the untouched `specificRelPath` signature in `_file-target.ts`; that hunk was reverted so T012 stays a header-only edit.
  - The Markdown files were not reformatted: prettier would rewrite whole tables the feature did not touch.
