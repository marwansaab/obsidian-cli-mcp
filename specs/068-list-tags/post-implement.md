# Post-Implement Record: List Tags

**Date**: 2026-10-24 · **Branch**: `068-list-tags` · **Tasks**: T043 (live quickstart), T044 (structural verification), T045 (headers and plan pointer)

## Test vault and protocol

- **Vault**: `TestVault-Obsidian-CLI-MCP` at `C:\Marwan-Saab-ADO\My-Setup\My-Setup\TestVault-Obsidian-CLI-MCP`. The owner ruled this the authorised vault (GL-003; the vault moved on 2026-10-20). Its registration was confirmed with `obsidian vaults verbose` before testing.
- **Owner action outstanding**: `.memory/test-execution-instructions.md` still names the stale Metcash path. It was deliberately left unedited.
- **Live calls**: the built server (`dist/index.js`) was driven over stdio JSON-RPC by a throwaway client outside the repository, and it spawned `Obsidian.com` (bare `obsidian`). The T0 probes (see [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md)) called `Obsidian.com` directly. `Obsidian.exe` was never invoked.
- **Fixtures**: the seven T0 fixture notes were recreated under `Sandbox/t068/` for the quickstart run, then deleted.
- **Post-state**: `.obsidian/`, `Welcome.md` (untouched) and an empty `Sandbox/`. A vault-wide `tags` call after cleanup returned `{"total":0,"tags":[]}`. No residue remained.

## T042 — gates

| Gate | Result |
|---|---|
| `npm run lint` | clean, zero warnings |
| `npm run typecheck` | clean |
| `npm run build` | clean |
| `npm test` | 147 files passed (1 skipped); 2968 tests passed (6 skipped); all-files statements 96.88% (threshold held) |
| `npx vitest run src/tools/tags` ×3 | 114 / 114 passed on every run (SC-004 / FR-024) |
| `src/tools/tags/**` coverage | 100% statements, branches, functions and lines |

Two existing registry tests were updated for the new tool, in addition to `src/server.test.ts` (roster and count 34 → 35):

- `src/tools/_register.test.ts`: added a `tags` invariant entry (six properties, none required, `additionalProperties: false`).
- `src/tools/_register-baseline.test.ts`: live-registry count 34 → 35.

## T043 — live quickstart scenarios

| # | Call | Outcome |
|---|---|---|
| 1 | `tags({ vault: V })` | PASS — 9 entries, alphabetical (`t068-café`, `T068-Case`, `t068-fm`, …, `t068-日本語`), `total` 9, `t068-fenced` absent |
| 2 | `tags({ vault: V, path: "Sandbox/t068/mixed.md" })` | PASS — exactly `t068-fm` 1, `t068-inline` 1 (frontmatter + inline, FR-015) |
| 3 | `tags({ vault: V, file: "mixed" })` | PASS — same as #2 |
| 4 | focus `count.md`; `tags({ activeOnly: true })` | PASS — `{"total":1,"tags":[{"name":"t068-multi","count":3}]}` |
| 5 | `tags({ vault: V, sortByCount: true })` | PASS — `t068-multi` 3, `T068-Case` 2, then the count-1 tags in name order |
| 6 | `tags({ vault: V, includeCounts: false })` | PASS — 9 entries, none with `count` |
| 7 | `tags({ vault: V, path: "Sandbox/t068/empty.md" })` | PASS — `{"total":0,"tags":[]}` |
| 8 | no active note (the focused note was deleted); `tags({ activeOnly: true })` | PASS — `ERR_NO_ACTIVE_FILE` with the `tags` message naming `file` / `path`; `details.message` is `Error: No active file. Use file=<name> or path=<path> to specify a file.` |
| 9 | `tags({ vault: V, file: "a", path: "b.md" })` | PASS — `VALIDATION_ERROR` / `SCOPE_CONFLICT` / `file+path`, `details.issues` present |
| 10 | `tags({ activeOnly: true, vault: V })` | PASS — `VALIDATION_ERROR` / `SCOPE_CONFLICT` / `active+vault` |
| 11 | `tags({ vault: V, path: "../outside.md" })` | PASS — `VALIDATION_ERROR` / `INVALID_NOTE` / `path-traversal`, `details.issues[0].path` = `["path"]` |
| 12 | `tags({ vault: "__no_such_vault__" })` | PASS — `CLI_REPORTED_ERROR`, message `Vault not found.` |
| 13 | `help({ tool_name: "tags" })` | PASS — the full page: inputs, output, error roster, inherited limitations, 6 worked examples |
| 14 | SC-005: an independent agent given only the scenario-13 help text wrote the four requests | PASS — `{vault}`, `{file: "mixed"}`, `{vault, sortByCount: true}`, `{activeOnly: true}`; all four succeeded on the first attempt, and the agent reported no unclear wording |

Extra live checks:

- `path: "Sandbox/t068/case.md"` returned `T068-Case` and `t068-case` as separate entries, in byte-tiebreak order. This confirms the tiebreak is observable in single-note scope.
- `file: "does-not-exist"` returned `CLI_REPORTED_ERROR`, with `details.message` `Error: File "does-not-exist" not found.`

One documentation refinement came out of the run. The missing-note error carries the upstream text in `details.message`; the top-level message is the dispatch layer's generic one. `docs/tools/tags.md` now says so (Example 3 and the error-roster row).

## T044 — structural verification

`graphify-out/` and `.codegraph/` are absent from this checkout, so each check was run by direct source lookup. A `/graphify --update` should be run once a graph exists.

| # | Check | Result |
|---|---|---|
| 1 | No new top-level error code | PASS — `tags` production files construct only `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE` and `VALIDATION_ERROR`. `SCOPE_CONFLICT` and `INVALID_NOTE` are existing `details.code` values. `src/errors.ts` is unchanged. |
| 2 | `tags/handler.ts` imports no DI factory or sibling tool | PASS — it imports only `./schema.js`, `cli-adapter/cli-adapter.js`, `errors.js`, and the `Logger` / `Queue` types. |
| 3 | `tags/schema.ts` does not import `target-mode.ts` | PASS — it imports only `zod` and `path-safety/schema.js`. The only mention of `target-mode` is the header comment recording the non-edge. |
| 4 | New production files are connected | PASS — `server.ts → tags/index.ts → registerTool` (boot spine); `index.ts → handler.ts → invokeCli` (runtime spine); `handler.ts → UpstreamError` (error spine); `index.ts` / `handler.ts → schema.ts → isStructurallySafePath`. |
| 5 | Only the `tags` baseline entry changed | PASS — `_register-baseline.json` gained one `tags` entry, and its `generatedFromBranch` / `generatedAt` header was refreshed. No other fingerprint moved. |
| 6 | `createServer()` gained only the registration line | PASS — the `server.ts` diff is one import line and one `createTagsTool({ logger, queue }),` list line. Kernel nodes `createLogger()`, `createQueue()` and `UpstreamError` are untouched. |

## T045 — headers and plan pointer

- All six files in `src/tools/tags/` start with `// Original — no upstream.` (Principle V).
- `CLAUDE.md` points at `specs/068-list-tags/plan.md`.
