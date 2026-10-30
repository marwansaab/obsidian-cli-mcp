# Post-implement record: 068 Modernise MCP Surface (0.9.0)

**Tasks**: T092 (structural verification), T093 (success criteria and release acceptance),
T094 (owner follow-ups) · **Date**: 2026-10-30 · **HEAD**: `e1f7804` on
`068-modernise-mcp-surface` (`origin/main` `f8602d2`, the PR-6 merge, plus one docs commit)

All six slices are merged: #87 (PR-1), #88 (PR-2), #89 (PR-3), #90 (PR-4), #91 (PR-5) and
#92 (PR-6). CI on the PR-6 merge commit `f8602d2` passed all four jobs (ubuntu-latest and
windows-latest × Node 22 and 24):
[run 41016245226](https://github.com/marwansaab/obsidian-cli-mcp/actions/runs/41016245226).

## T092: graph refresh and structural checks

### Refresh

`/graphify --update` (incremental, owner-approved full semantic pass) at `e1f7804`:

- **Detected**: 893 new or changed files, 0 deleted. 207 code files went through AST
  extraction (no LLM). 686 documents had no valid semantic cache entry, so all of them were
  re-extracted by 33 subagent chunks. Every file was read to its last line (686 of 686
  reported, 0 partial).
- **Result**: 14,306 nodes, 25,313 edges, 737 communities. Against the previous graph
  (built at `54e52b5`): 2,076 nodes and 4,751 edges added, 115 nodes and 603 edges removed.
  Communities are named after their highest-degree node, as in earlier runs.
- **Cost**: about 8.06 M subagent tokens. The tool reports one total per subagent, so
  `graphify-out/cost.json` records it as input tokens.
- **Shrink guard overridden on purpose**: the export refused at first because 67 semantic
  nodes from the previous graph were missing. All 67 came from files re-extracted in this
  run: `.docs-as-code/architecture.md` (20), `tech-stack.md` (13),
  `capabilities/list-and-inventory.md` (12), `capabilities/search-and-discovery.md` (11),
  `README.md` (5), `docs/tools/index.md` (3) and `.docs-as-code/README.md` (3). The fresh
  extraction replaced them with new node ids. Several describe things 0.9.0 removed, such as
  `normalizeToDraft7Parity` and progressive disclosure through `help`. No
  node from an unchanged file was lost, so the export ran with `force=True`.
- **Health warning**: 40 self-loop edges in the extraction. These are semantic edges whose
  two ends folded into one node. They do not affect the checks below.
- **Kernel nodes**: `UpstreamError`, `invokeCli()`, `registerTool()`, `createQueue()`,
  `dispatchCli()` and `createServer()` are the top six god nodes. `createLogger()` reaches
  the graph through `Logger`, which is also among the top ten. The kernel set in CLAUDE.md
  still holds.

### The four CLAUDE.md checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | No new error-class nodes outside `src/errors.ts` | **Pass, with one recorded exception** | `UpstreamError` is the only error class in `src/errors.ts`, and that file has not changed since `1e0282d` (064). One class extending `Error` exists outside it: `ConfirmationRequested` in `src/tools/_confirm.ts`, added by PR-6. It is not an error code and never reaches a client as an error. It is an internal signal that `registerTool` turns into the SDK's `input_required` result while a confirmation is pending (ADR-043). Every client-visible refusal is still an `UpstreamError` (`CONFIRMATION_DECLINED`, `CONFIRMATION_UNAVAILABLE`). It sits in its own community with `_confirm.test.ts`, `_shared.ts`, `_register.ts` and ADR-043, not in the error spine. |
| 2 | No production handler imports `createLogger` / `createQueue` | **Pass** | Graph edges into both factories come only from `createServer()` / `server.ts` among production files. `rg` agrees. The other importers are test-support modules (`src/tools/_handler-test-fixtures.ts`, `_typed-result-fixtures.ts`, and `find_and_replace/`, `prepend/`, `write_note/` `_handler-fixtures.ts`), which only tests import. They do compile into `dist/`; see T094 follow-up 6. |
| 3 | New modules land in the expected communities (plan → Graphify structural check) | **Pass, with one deviation explained** | `src/instructions/instructions.ts` and `src/server-config.ts` are in the `createServer()` community, the boot spine, as planned. `src/tools/vaults/schema.ts` and `handler.ts` share a community with `createVaultRegistry()` and `src/vault-registry/registry.ts`, as planned. `vaults/index.ts` sits with `server.ts` like the other tool index files. **Deviation**: the plan expected `_confirm.ts` to land with `delete` / `find_and_replace`. It lands in the registration layer instead (`_register.ts`, `_shared.ts`, ADR-043), with one import edge from each of the two handlers. That follows the PR-6 design: `registerTool` builds the per-call `Confirmation` and passes it to handlers as their third argument (ADR-043), so the module's structural home is registration, not the two handlers. This is intended, not a smell. |
| 4 | No orphaned production file | **Pass** | All 159 production files in `src/` (tests and fixtures excluded) and `scripts/` have at least one edge to another file. `scripts/probe-stdio.ts` is connected too. |

**Kernel-node touch claims (plan) hold at HEAD**: `createServer()` is restructured and is
still the sole production caller of both factories. `createQueue()` gained only the
additive `run(task, { signal })`. `createLogger()` gained only additive events. `UpstreamError`
was not edited.

## T093: success criteria

### Spec SC-001 … SC-014

| SC | Result | Evidence |
|---|---|---|
| SC-001 (written property visible to the next search, 4 of 4) | **Pass**, with a note | [evidence-a1.md](evidence-a1.md) and [PR #87](https://github.com/marwansaab/obsidian-cli-mcp/pull/87) (A1). After the fix, `write_note`, `append_note`, `patch_heading` and a path-scoped `find_and_replace` commit were each found by the very next search, 4 of 4, and the multi-vault check refreshed the written vault. Note: before the fix the stale search did not reproduce (Obsidian's file watcher won the race), so the "before" half is the code defect proven by the probe, not a stale search. |
| SC-002 (containment cases refused, nothing created outside, in-vault writes succeed) | **Pass** | [PR #87](https://github.com/marwansaab/obsidian-cli-mcp/pull/87) (A5): real temp-directory tests with a junction on Windows and a dir symlink elsewhere (existing child, missing child, two missing levels), `..`, prefix-named sibling and a Windows mixed-case root, which failed before the rewrite. `src/path-safety/canonical.test.ts`, `src/tools/write_note/handler.test.ts` (`PATH_ESCAPES_VAULT`, no `mkdir`). Green on both OSes in CI. |
| SC-003 (blocked passthrough categories refused, 0 spawns, typed tools unchanged) | **Pass** | [PR #88](https://github.com/marwansaab/obsidian-cli-mcp/pull/88), [evidence-c2.md](evidence-c2.md): each denylisted command returns `VALIDATION_ERROR` / `COMMAND_BLOCKED` before `invokeBoundedCli`; the leading `vault=` bypass found in the probe is closed; no typed tool's eval test changed. |
| SC-004 (each protocol generation lists all 35 tools and completes a read and a write) | **Pass** | [PR #89](https://github.com/marwansaab/obsidian-cli-mcp/pull/89) T042 (both eras over real stdio, `write_note` and `read`, plus the owner's Claude Code check); [PR #91](https://github.com/marwansaab/obsidian-cli-mcp/pull/91) and [PR #92](https://github.com/marwansaab/obsidian-cli-mcp/pull/92): `probe:stdio` lists 35 tools for `2025-11-25` and `2026-07-28`. |
| SC-005 (every tool titled with four hints; every parameter described) | **Pass** | [PR #90](https://github.com/marwansaab/obsidian-cli-mcp/pull/90): `src/tools/_surface.test.ts` enforces titles, four boolean hints and a description on every input property through `client.listTools()`. |
| SC-006 (read tools `readOnlyHint: true`, `destructiveHint: false`; manual Claude Code check) | **Pass** | [PR #90](https://github.com/marwansaab/obsidian-cli-mcp/pull/90): the pinned FR-024 classification test (now 22 read-only tools with `vaults`, PR #91). Owner check (T058, 2026-10-30): `read` and `files` in one turn ran in parallel in Claude Code with no "may modify data" prompt. |
| SC-007 (orientation text < 2,000 chars, 512-char opening ends on a sentence, read-only text names no write tool) | **Pass** | `src/instructions/instructions.test.ts` (under 2,000; opening within 512 and a complete sentence; read-only set names no tool that changes data). `probe:stdio`: 1,888 characters unfiltered, 1,341 read-only ([PR #92](https://github.com/marwansaab/obsidian-cli-mcp/pull/92)). |
| SC-008 (unreviewed change to a published definition fails the build) | **Pass** | [PR #89](https://github.com/marwansaab/obsidian-cli-mcp/pull/89) T040 gate proof: one added word in the `backlinks` description failed "live registry fingerprints match the checked-in baseline"; reverting passed. The gate now also fingerprints titles, annotations (PR #90) and output schemas (PR #91). |
| SC-009 (checks pass on Windows and Linux, every supported runtime) | **Pass** | CI matrix `os: [ubuntu-latest, windows-latest]` × `node-version: [22, 24]` ([PR #87](https://github.com/marwansaab/obsidian-cli-mcp/pull/87), A4); all four jobs green on the merge of every slice, latest [run 41016245226](https://github.com/marwansaab/obsidian-cli-mcp/actions/runs/41016245226). |
| SC-010 (read-only mode offers 0 tools that change data) | **Pass** | [PR #92](https://github.com/marwansaab/obsidian-cli-mcp/pull/92): `src/server-config.test.ts`; `probe:stdio` with `OBSIDIAN_MCP_READ_ONLY=1` lists 22 tools in both eras, the FR-024 read-only row. |
| SC-011 (declined, cancelled and non-interactive confirmations change 0 files; non-interactive spawns 0) | **Pass** | [PR #92](https://github.com/marwansaab/obsidian-cli-mcp/pull/92): `src/tools/_confirm.test.ts`, `src/tools/delete/handler.test.ts`, `src/tools/find_and_replace/confirm.test.ts`; live `--no-elicitation` returned `CONFIRMATION_UNAVAILABLE` for both tools in both eras with the fixture byte-identical; decline returned `CONFIRMATION_DECLINED` with nothing changed, over real stdio and in the owner's interactive Claude Code check. |
| SC-012 (cancelled queued call spawns 0; cancelled running call frees the queue) | **Pass** | [PR #92](https://github.com/marwansaab/obsidian-cli-mcp/pull/92): `src/queue.test.ts` (a queued task aborted before it starts is never run and the next task runs), `src/cli-adapter/invoke-bounded-cli.test.ts` (a queued call cancelled before it starts never spawns), `src/cli-adapter/_dispatch.test.ts` and `cli-adapter.test.ts` (abort kills the child; the next queued call runs). |
| SC-013 (a vault opened after start is usable by name with 0 restarts) | **Pass** | [PR #91](https://github.com/marwansaab/obsidian-cli-mcp/pull/91) T071 owner check: a vault created in Obsidian while the server ran was used by name through `files` with no restart, and `vaults` then listed it. Unit: `registry.test.ts` "cache miss re-probes once and resolves a vault added after start-up". |
| SC-014 (zero new top-level error codes) | **Pass** | `src/errors.ts` is unchanged across the release: its last commit is `1e0282d` (064). New cases are sub-codes only: `PATH_ESCAPES_VAULT` details, `COMMAND_BLOCKED`, `CONFIRMATION_DECLINED`, `CONFIRMATION_UNAVAILABLE` (ADR-015). Graph check 1 above agrees. |

### Release-level acceptance (BI-0165 brief, Part 2 §7)

| Brief §7 item | Result | Evidence |
|---|---|---|
| All 13 items meet their Accept checks | **Pass** | A1, A4, A5 in [#87](https://github.com/marwansaab/obsidian-cli-mcp/pull/87); C2 in [#88](https://github.com/marwansaab/obsidian-cli-mcp/pull/88); A2, C3 in [#89](https://github.com/marwansaab/obsidian-cli-mcp/pull/89); B1, B2, C1 in [#90](https://github.com/marwansaab/obsidian-cli-mcp/pull/90); B4, B5 in [#91](https://github.com/marwansaab/obsidian-cli-mcp/pull/91); B3, A3 in [#92](https://github.com/marwansaab/obsidian-cli-mcp/pull/92). Each PR body records its gate evidence. B4 ships as `vaults`, not `list_vaults` (owner ruling 2026-10-28, ADR-010 rule 1). |
| CI green on Ubuntu and Windows, Node 22 and 24; lint zero warnings; coverage at or above the floor | **Pass** | [run 41016245226](https://github.com/marwansaab/obsidian-cli-mcp/actions/runs/41016245226); T090: lint zero warnings, 3,127 tests pass (6 skipped), statements 97% against the 96% floor. |
| A 2025-era client (`initialize`) and a 2026-07-28 client (`server/discover`) both list and call tools over stdio | **Pass** | `probe:stdio --era legacy` / `--era modern` in #89, #91 and #92; both-era protocol tests in `src/server.protocol.test.ts`. |
| In Claude Code, read-only tools run without "modify data" warnings and two reads in one turn run in parallel | **Pass** | Owner check T058 in [#90](https://github.com/marwansaab/obsidian-cli-mcp/pull/90). |
| `OBSIDIAN_MCP_READ_ONLY=1` exposes only read tools; `obsidian_exec` refuses `eval` unless `OBSIDIAN_MCP_ALLOW_EVAL=1` | **Pass** | 22 read-only tools in [#92](https://github.com/marwansaab/obsidian-cli-mcp/pull/92); the gate and the flag in [#88](https://github.com/marwansaab/obsidian-cli-mcp/pull/88). |
| A write followed at once by `find_by_property` sees the new property (A1 live probe) | **Pass** | [evidence-a1.md](evidence-a1.md), 4 of 4 after the fix (see the SC-001 note). |
| `.docs-as-code/`, `README.md`, `docs/tools/*.md` describe the system as built | **Pass** | `/speckit-docs-as-code` ran on every slice; the PR-6 pass is listed in [#92](https://github.com/marwansaab/obsidian-cli-mcp/pull/92) (architecture, ADR-043, capabilities, `delete.md`, `find_and_replace.md`, README rewrite). The brief's env-var list is covered; its `list_vaults` is `docs/tools/vaults.md`. |
| The constitution amendment and the new ADRs are recorded | **Pass in the repository; vault side open** | Constitution v1.6.0 ratified in [#86](https://github.com/marwansaab/obsidian-cli-mcp/pull/86). ADR-039 (dual era on SDK v2 `McpServer`, superseding ADR-036 and the low-level `Server` decision) and ADR-040 (published parameter descriptions and server instructions, superseding ADR-005) are in `.decisions/` and `.docs-as-code/decisions/`; ADR-041, ADR-042 and ADR-043 are in `.docs-as-code/decisions/`. The vault-side amendment stanzas for ADR-036 and ADR-005 are the owner's (T094). |

## T094: owner follow-ups

These are for the owner. None of them was edited in this run.

1. **Constitution Sync Impact Report.** The v1.6.0 report at the top of
   `.specify/memory/constitution.md` still names `list_vaults` (line 133, B4 now ships as
   `vaults`) and calls the release "0.8.20" (lines 21, 29, 70, 114, 176, 188–189; also the
   Governance paragraph at 822–830). With 0.9.0 merged, the "Adoption of v1.6.0" paragraph
   is spent and should go in the post-release PATCH amendment; fold the `list_vaults` →
   `vaults` and "0.8.20" → "0.9.0" corrections into that same amendment.
2. **Vault ADR amendment stanzas.** ADR-036 (single-era serving) is superseded by ADR-039,
   and ADR-005 by ADR-040. The vault copies of ADR-036 and ADR-005 need their amendment
   stanzas.
3. **Vault Architecture page.** It still mentions `list_vaults`; the tool is `vaults`. A
   read-only search of the initiative folder found the same name in other vault notes too:
   test cases TC-00010, TC-00012, TC-00013 and TC-00015 (the `help` stub-doc cases), the
   `set_property` and Progressive Disclosure feature pages, and BI-0040. Some may be
   historical records that should keep the old name; the owner decides which to change.
4. **BI-0156 … BI-0159.** Re-check trace context (BI-0156), result type (BI-0157), caching
   hints (BI-0158) and server info in `_meta` (BI-0159) against SDK v2 now that it has
   landed; v2 may provide some of them already.
5. **Claude Code print mode** (from PR #92, for awareness): Claude Code in print mode (the
   desktop app's Code tab, `claude -p`, unattended runs) declares form elicitation and then
   declines every request, so a permanent `delete` or a multi-note commit there always
   returns `CONFIRMATION_DECLINED`. The README documents it; whether to raise it upstream is
   the owner's call.
6. **Test fixtures ship in the package** (found by graph check 2): `tsconfig.build.json`
   excludes only `src/**/*.test.ts`, so the test-support modules
   (`src/tools/_handler-test-fixtures.ts`, `_typed-result-fixtures.ts` and the three
   `*/_handler-fixtures.ts`) compile into `dist/`, which `package.json` `files` publishes.
   Nothing in production imports them, so they are dead weight, not a defect. Excluding
   `src/**/*fixtures*.ts` from the build would drop them; it is a small change for a later
   PR.
