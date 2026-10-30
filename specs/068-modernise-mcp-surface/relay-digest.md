# Relay digest: speckit

| | |
|---|---|
| Run | `obsidian-cli-mcp-bi-0165-pr3-2026-10-30` |
| Project | obsidian-cli-mcp (pack speckit) |
| Status | running |
| Started | 2026-10-30T00:14:29.704Z |
| Finished | not yet |
| Elapsed | 15 min 10 s |
| Questions | 0 (0 needed the owner) |
| Requests to the advisor | 1 (0 needed the owner) |
| Escalations | 0 |
| Edits by the advisor | 0 |

## Inputs

- `job_id`: BI-0165
- `dry_run`: no
- `continue_feature`: specs/068-modernise-mcp-surface
- `continue_branch`: 068-modernise-mcp-surface
- `tasks_scope`: Phase 5: PR-3 (SDK v2, dual-era stdio, tool-surface gate) only
- `repo`: C:\Github\obsidian-cli-mcp
- `cowork_path`: C:\Marwan-Saab-ADO\My-Setup\My-Setup\My-Setup
- `initiative`: Obsidian CLI MCP
- `base_branch`: main
- `pr_check`: gh-pr-open
- `identity_note`: 000-Meta/Vault Identity.md

## Sessions and steps

### checks (`2d526556-ba4e-4c3d-bb43-6c528315e200`)

- Condition `file-exists` (start_when): met. C:\Github\obsidian-cli-mcp\.specify exists.

- **preflight**: done.

> Preflight for BI-0165 passed: all six checks are green and the session is ready for questions.
>
> - **Vault identity:** `My-Setup-Vault` returns `vault_id` = `my-setup`, which matches `expected_vault_id`. PASS. The session-start reads were done earlier in this conversation.
> - **Note:** `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`, titled "BI-0165 — Ship 0.9.0 SDK V2 And Safety Release". PASS.
> - **Initiative:** `[[Obsidian CLI MCP]]`. PASS.
> - **Status:** `in-review`. PR 1 (#87) and PR 2 (#88) are waiting for the owner to merge; the latest `spec_branch` is `068-pr2-exec-gate`. The work isn't finished, so the run carries on. PASS.
> - **Specify prompt:** the "/speckit-specify prompt" section is there, and its command line (line 52) is `/speckit-specify Modernise MCP surface`, in the dash form. PASS. The note was not changed.
> - **Clarify skill:** `anthropic-skills:speckit-clarify-skill` was already loaded earlier in this conversation for "BI-0165 - Ship 0.9.0 SDK V2 And Safety Release". Its answering rules stay in force.
>
> Awaiting clarification questions.


### pre-implementation

Skipped.

- Condition `shell-exit-0` (run_when): not met. "node -e "process.exit('specs/068-modernise-mcp-surface' === '' ? 0 : 1)"" exited 1.

- **specify**: skipped.
- **clarify**: skipped.
- **plan**: skipped.
- **tasks**: skipped.
- **analyze**: skipped.
- **resolve-analysis**: skipped.

### continue (`aeae3646-b137-40f8-b7fc-56d0130e6d79`)

- Condition `shell-exit-0` (run_when): met. "node -e "process.exit('specs/068-modernise-mcp-surface' === '' ? 1 : 0)"" exited 0.
- Condition `file-exists` (done_when): met. C:\Github\obsidian-cli-mcp\specs\068-modernise-mcp-surface\tasks.md exists.

- **prepare**: done, 14 turns.

> Archived the PR-2 relay records (relay-digest.md and relay-qa-log.md, including their uncommitted changes) to specs/068-modernise-mcp-surface/relay-runs/obsidian-cli-mcp-bi-0165-pr2-2026-10-30/, then reset the live copies. No other uncommitted changes existed. Fetched origin, checked out 068-modernise-mcp-surface and fast-forwarded it to origin/main (d568f72, which merged PR #88) with no conflicts. .specify/feature.json already pointed to specs/068-modernise-mcp-surface, so it was not changed. In tasks.md I ticked T027 (the PR-2 wrap). I checked it against PR #88: it is merged, its body has the planned checklist and the gate results with the baseline unchanged, review fixes landed in 04cd558 and 9cc85e0, and the docs-as-code commit 81ac1c1 updated the escape-hatch-and-meta page. No task outside Phase 5 was left open unconfirmed: Phases 6 to 9 have not started. Committed as b06883e following CONTRIBUTING.md. Not pushed.


### implementation (`a9cf81e3-10c9-4dfe-a37e-0c97126050b8`)

- Condition `file-exists` (start_when): met. C:\Github\obsidian-cli-mcp\specs\068-modernise-mcp-surface\tasks.md exists.

- **implement**: done, 139 turns.

> PR-3 code is on branch 068-pr3-sdk-v2 (cut from the updated 068-modernise-mcp-surface, which includes the PR-2 archive commit). Nothing is committed. T028–T042 are ticked in tasks.md. T043 (commit, PR, /code-review, docs-as-code) is left for the later steps, and the optional after_implement commit hook was skipped.
>
> Gates: lint has zero warnings and no SDK no-deprecated disable is left in src. Typecheck and build are clean. 2927 tests pass (6 skipped) and statement coverage is 96.81%.
>
> What changed:
> - **Dependencies:** @modelcontextprotocol/sdk is replaced by @modelcontextprotocol/server ^2.4.0. @modelcontextprotocol/client ^2.4.0 is a devDependency.
> - **T030 spike:** passed. Through a real client, the published inputSchema deep-equals zod's own draft-2020-12 output after stripping, additionalProperties:false holds, and invalid input reaches the callback with the VALIDATION_ERROR envelope.
> - **Registration:** registerTool passes the SDK a pass-through adapter, toSdkInputSchema (description stripping stays until PR 4). The callback returns asToolError results instead of throwing. RegisteredTool keeps descriptor and handler and gains register(server), so the 34 tool test files did not need changes.
> - **C3:** toMcpInputSchema and the draft-07 normaliser are deleted, along with their tests. The 9 schema tests now use z.toJSONSchema(..., draft-2020-12).
> - **server.ts (kernel node):** createServer is now the composition root. It returns { buildMcpServer, shutdown, logger, queue }: triggerShutdown is renamed shutdown, and the server field is gone. It builds McpServer with tools.listChanged:false. The low-level Server, both hand-written handlers and TOOL_NOT_FOUND are deleted. ctx gains a createQueue test seam. The PR checklist should name both touches.
> - **index.ts:** uses serveStdio(() => app.buildMcpServer()) plus the stdin end/close → shutdown hooks.
> - **New tests:** src/server.protocol.test.ts covers both eras: a 2025-era client over InMemoryTransport, and a 2026-era client through createMcpHandler negotiating 2026-07-28. It also proves one shared queue across two built servers.
> - **Probe script:** scripts/probe-stdio.ts is added, with npm run probe:stdio.
> - **Fingerprint gate:** it now reads tools/list through a v2 Client (schemaVersion 2), and the writer script reuses the same helper.
> - **Baseline:** regenerated. All 34 schemaFingerprints changed, 0 descriptionFingerprints changed, and the names are the same. The gate fails on a one-word description edit and passes after the revert.
> - **ADR-039:** written in the gitignored .decisions/, with a Decision Log row. 039 was confirmed free (the vault stops at ADR-037). Vault sync and the ADR-036 superseded stanza are the owner's.
>
> Real stdio: the legacy handshake negotiates 2025-11-25 and the modern one 2026-07-28, both listing 34 tools. These results are recorded in research R2 and R10.
>
> Live T042 check on TestVault-Obsidian-CLI-MCP: Claude Code cannot be attached in this unattended run, so a v2 client drove dist/index.js over real stdio in both eras instead. write_note and read succeeded. A failing read returned CLI_REPORTED_ERROR, byte-identical to the same call against a build of main (SDK v1). Sandbox/ was cleaned and the temp worktree removed. An owner check in a Claude Code session is still open.
>
> Behaviour changes for owner review:
> - An unknown tool now gets JSON-RPC -32602.
> - A thrown error that is neither UpstreamError nor ZodError now comes back as the SDK's isError text, no longer a JSON-RPC internal error.
> - A call with no arguments now reaches the tool as {}.
>
> Left for docs-as-code: docs/tools/obsidian_exec.md:85 still lists TOOL_NOT_FOUND.

- **open-pr**: in progress.

### review

- **code-review**: not run.
- **fix**: not run.

### docs

- **document**: not run.

### record

- **record-in-vault**: not run.

## Escalations

None.


## Edits made by the advisor

None.

## Files

- Q&A log: `relay-qa-log.md`
- Run state: `C:\Marwan-Saab-ADO\My-Setup\Relay\.relay\runs\obsidian-cli-mcp\obsidian-cli-mcp-bi-0165-pr3-2026-10-30`
