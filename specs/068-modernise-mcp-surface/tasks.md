---
description: "Task list for 068 Modernise MCP Surface (release 0.9.0)"
---

# Tasks: Modernise MCP Surface

**Input**: Design documents from `/specs/068-modernise-mcp-surface/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: REQUIRED. Constitution Principle II, plus explicit test FRs: FR-005, FR-023,
FR-030, FR-042, FR-049a, FR-052a and FR-026a. Test tasks come before or alongside the
code they cover, in the same PR.

**Organization**: Phases follow the six-PR delivery order (plan â†’ Delivery sequence),
not strict priority. Inside each PR phase, tasks are grouped by user story. PR 3 (US4,
US5, US9) is the platform that PRs 4â€“6 build on.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the spec user story (US1â€“US16)

## Branch & PR scheme

- **No separate docs PR** (owner ruling 2026-10-28, option A: BI-0165 Â§1 gives each PR its
  own cycle and Â§6 sets PR 1 = A1, A4, A5; a docs-only PR-0 is not in the BI). The spec
  artifacts and the CLAUDE.md plan pointer, committed on `068-modernise-mcp-surface`,
  ride along in PR-1: `068-pr1-fixes` is cut from `068-modernise-mcp-surface`, not from
  `main`.
- **PR-1â€¦PR-6**: one branch per PR, and one Relay run per PR. PR-2â€¦PR-6 are cut from
  **updated main** after the previous PR merges:
  - `068-pr1-fixes`
  - `068-pr2-exec-gate`
  - `068-pr3-sdk-v2`
  - `068-pr4-tool-surface`
  - `068-pr5-vaults-typed`
  - `068-pr6-safety-cancel`
- Every PR follows `/speckit-implement â†’ /speckit-git-commit â†’ open PR â†’ /code-review +
  fixes â†’ /speckit-docs-as-code <n> â†’ merge` (CLAUDE.md). Never merge without the
  owner, and never force-push.
- **PR body**: summary; gate evidence (lint zero warnings, typecheck, `vitest run
  --coverage` â‰¥ 96, build, CI Ubuntu + Windows); the Constitution Compliance checklist
  (Principles Iâ€“V, ADR-010/013/014/015, MCP standard, MCP Tool Surface Standards,
  Security Defaults) with the values in that PR's wrap task; and the footer
  `ðŸ¤– Generated with [Claude Code](https://claude.com/claude-code)`.
- **Commits**: follow CONTRIBUTING.md conventions and end with the current
  Co-Authored-By trailer.
- **Live probes** (any task tagged **T0-live**): read
  `.memory/test-execution-instructions.md` first. Use only the authorised test vault,
  write only under `Sandbox/`, drive `Obsidian.com`, pass `vault=`, and clean up.

---

## Phase 1: Setup (folded into PR-1)

- [X] T001 The spec artifacts are committed on `068-modernise-mcp-surface` (00dfcd5). The CLAUDE.md plan pointer and `.specify/feature.json` are committed with the PR-1 work on `068-pr1-fixes`, so the docs merge with PR-1.
- [X] T002 No separate PR-0 (owner ruling 2026-10-28, option A). Create `068-pr1-fixes` from `068-modernise-mcp-surface` so PR-1 carries the spec docs; the PR-1 body notes that it includes them.

---

## Phase 2: Foundational

**None as a separate phase.** The protocol platform (SDK v2, the composition-root split
and the rebuilt fingerprint gate) is user-story work (US4, US5, US9) in PR-3. It blocks
PR-4, PR-5 and PR-6; see Dependencies.

---

## Phase 3: PR-1: metadata freshness, containment, Windows CI (US1 P1, US2 P1, US10 P2) ðŸŽ¯ MVP

**Branch**: `068-pr1-fixes` from `068-modernise-mcp-surface` (carries the spec docs). The current SDK (v1) is unchanged.

- [X] T003 Create branch `068-pr1-fixes` from `068-modernise-mcp-surface`.

### User Story 1: a written property is visible to the next search (P1)

**Goal**: metadata refresh hits the written note in the written vault, and failures are
logged. **Independent test**: quickstart Â§2.

- [X] T004 [US1] **T0-live, before the fix**: in the test vault, seed `Sandbox/a1-<runid>.md`, run `write_note` (specific, `vault=`) adding frontmatter `a1probe: <runid>`, then immediately run `find_by_property a1probe=<runid>`. Record the verbatim output, which should show no match, in specs/068-modernise-mcp-surface/evidence-a1.md. Clean up `Sandbox/`. If the defect does NOT reproduce, STOP and report to the owner before changing code (research R13).
  **Outcome (2026-10-28)**: in 4 of 4 rounds, `find_by_property` found the new value on the next call, so the user-visible defect did NOT reproduce. The code-level defect is confirmed: `getFileByPath(<absolute path>)` returns `null`, so today's refresh does nothing, and Obsidian's file watcher is what keeps the search fresh. See evidence-a1.md. Stopped A1 (T005–T010) for an owner decision; A5 and A4 went ahead because they are independent of it.
- [X] T005 [P] [US1] Add a typed `metadataRefreshFailed(event: {vault, relPath, reason})` method to the `Logger` interface and `createLogger()` in src/logger.ts. It emits the JSON line `{event:"bridge.metadata_refresh_failed", ts, vault, relPath, reason}`, matching the existing events' style. Add a test in src/logger.test.ts. Update every full `Logger` test double: grep `pathEscapeAttempt` across `src/**/*.test.ts` and `_handler-fixtures.ts`.
- [X] T006 [US1] Rewrite `invalidateMetadataCache` in src/tools/_note-io.ts:
  - new signature `(deps, { vault, relPath })`;
  - the template calls `app.vault.getFileByPath(<relPath with \\ â†’ />)`;
  - `invokeCli` runs with `target_mode: "specific"` and `vault`;
  - the empty `catch {}` becomes `deps.logger.metadataRefreshFailed(...)`, and it still resolves;
  - update the file header.

  Tests in src/tools/_note-io.test.ts: a relative forward-slash path in the code argument; a Windows-style relPath is normalised; the argv carries `vault=<vault>`; a rejecting `invokeCli` emits the event and resolves.
- [X] T007 [P] [US1] Pass `{ vault, relPath }` from the four callers: src/tools/write_note/handler.ts:151, src/tools/append_note/handler.ts:125, src/tools/patch_heading/handler.ts:234, src/tools/patch_block/handler.ts:187. Use the vault and vault-relative path each handler already resolved. Update each co-located handler.test.ts assertion on the refresh argv.
- [X] T008 [US1] Fix `write_note` `open: true`: `buildOpenTemplate` (src/tools/write_note/handler.ts:42-44) takes the vault-relative forward-slash path, and the call (:155-169) runs with `target_mode: "specific"` + `vault`. Add a test in src/tools/write_note/handler.test.ts asserting both.
- [X] T009 [US1] In the `find_and_replace` commit loop (src/tools/find_and_replace/handler.ts:638-669), call `invalidateMetadataCache(deps, {vault, relPath})` after each successful write. Make the call **after the queued write's promise resolves, outside the `deps.queue.run(() => writeAtomic(...))` callback** (:650). The refresh goes through `invokeCli` and therefore the same single-flight queue, so calling it inside the task would deadlock. Update the `_note-io.ts:2` header claim. Tests in src/tools/find_and_replace/handler.test.ts, using a real `createQueue()`:
  - a 2-note commit completes;
  - one refresh per changed note, with the right vault and relPath;
  - a refresh failure does not change the commit result.
- [X] T010 [US1] **T0-live, after the fix**: repeat T004 for `write_note`, `append_note`, `patch_heading` and a `find_and_replace` commit scoped by `path`. Also run the multi-vault check (another vault focused) and `write_note open:true` (quickstart Â§2 steps 3â€“6). Append the verbatim results to specs/068-modernise-mcp-surface/evidence-a1.md and clean up `Sandbox/`.

### User Story 2: writes cannot escape the vault (P1)

**Goal**: nearest-existing-ancestor containment. **Independent test**: quickstart Â§3.

- [X] T011 [P] [US2] Write failing tests first in src/path-safety/canonical.test.ts, using real temp directories (`fs.mkdtemp`) and a link created with `fs.symlink(target, p, process.platform === "win32" ? "junction" : "dir")`. Cases:
  - link to an outside dir with an existing child â†’ escape;
  - link with a missing child `Linked/New/Note.md` â†’ escape;
  - link with two missing levels â†’ escape;
  - `..` that leaves the vault â†’ escape;
  - sibling `vault2` next to `vault` â†’ escape;
  - mixed-case vault root argument (`it.runIf(win32)`) â†’ in-vault write still allowed and the junction escape still caught;
  - ordinary new nested folder inside the vault â†’ allowed.
- [X] T012 [US2] Rewrite `checkCanonicalPath` in src/path-safety/canonical.ts (:33-61) per research R5:
  - walk up from the lexical path to the nearest ancestor where `realpath` succeeds;
  - ENOENT continues the walk; any other error is rethrown;
  - re-append the missing segments;
  - compare with the existing `=== root || startsWith(root + sep)`.

  Add case-folding only if the T011 win32 case fails without it. Update the header. Make T011 pass.
- [X] T013 [US2] Add an integration test in src/tools/write_note/handler.test.ts: a write to a missing folder under a link returns `PATH_ESCAPES_VAULT` with details `{vault, attemptedPath, resolvedPath}`, emits one `pathEscapeAttempt`, calls no `fs.mkdir`, and creates nothing outside the vault. `assertCanonicalPath` (src/tools/_active-file.ts:333-349) calls `checkCanonicalPath` directly (graph path), so no caller changes are needed.

### User Story 10: Windows checked on every change (P2)

- [X] T014 [P] [US10] In .github/workflows/ci.yml: matrix `os: [ubuntu-latest, windows-latest]` Ã— `node-version: [22, 24]`, `runs-on: ${{ matrix.os }}`, the job name includes `${{ matrix.os }}`, `fail-fast: false` kept, `timeout-minutes: 20` (R14).
- [X] T015 [US10] After the PR's first CI run, confirm all 4 jobs ran. If Windows coverage fails with ENOENT on `coverage/.tmp`, add a Windows-only pre-step that creates it (R14) and record why in the PR body. Make no other speculative changes.

### PR-1 wrap

- [X] T016 Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` locally, then `graphify update .`. Confirm `src/tools/_register-baseline.json` is unchanged (PR-1 changes no descriptor).
- [X] T017 Run `/speckit-git-commit`, push, and open **PR-1**. Checklist:
  - Iâ€“V **Y**;
  - ADR-010/013/014 **N/A**;
  - ADR-015 **N/A** (no new pair);
  - MCP standard **N/A (pending A2)**;
  - Tool Surface **N/A (pending B1/B2/B5/C1/C3)**;
  - Security Defaults **Y** (closes vault containment);
  - CI Linux + Windows **Y** (closes A4).

  Body: cite evidence-a1.md.
- [X] T018 Run `/code-review` and fix the findings, then `/speckit-docs-as-code <PR-1 number>` (`.docs-as-code/` mutate and path-safety pages, docs/tools pages describing open:true and the refresh). **STOP**: owner merges.

---

## Phase 4: PR-2: passthrough command gate (US3 P1)

**Branch**: `068-pr2-exec-gate` from updated `main`. **Independent test**: quickstart Â§4.

- [X] T019 Create branch `068-pr2-exec-gate`.
- [X] T020 [US3] **T0-live**: run `Obsidian.com help` (stdout and stderr captured separately) and list the exact plugin install / enable / disable command names. Record the verbatim output in specs/068-modernise-mcp-surface/evidence-c2.md. Note `plugin:reload` and `command` as deliberately allowed (Q3).
  **Outcome (2026-10-30)**: the names are `plugin:install`, `plugin:enable`, `plugin:disable`. A follow-up probe showed the CLI runs the token after a leading `vault=` token as the command, so `{command: "vault=X", flags: ["eval", …]}` would run `eval`. The T023 gate therefore checks the effective command token (research R4, T0 result; evidence-c2.md). *(PR #88 review, owner ruling: replaced by a schema refusal of any `command` containing `=`; the gate now matches `input.command` alone.)*
- [X] T021 [P] [US3] Add an exported `envFlagEnabled(value: string | undefined): boolean` beside `autoLaunchEnabled` in src/cli-adapter/_dispatch.ts. True only for `1/true/yes/on` after trim + lower-case. Add a truthy/falsy/unset table test in src/cli-adapter/_dispatch.test.ts. *(PR #88 review: moved with its table test to src/env-flags.ts / src/env-flags.test.ts; research R4.)*
- [X] T022 [US3] In src/tools/obsidian_exec/handler.ts, add an `OBSIDIAN_EXEC_BLOCKED_EXACT` constant (`eval`, `devtools`, `restart` plus the T020 plugin names), the `dev:` prefix rule, and `isBlockedCommand(command)` (trim + lower-case, `command` field only). Unit tests in src/tools/obsidian_exec/handler.test.ts cover:
  - every name blocked;
  - ` EVAL ` blocked;
  - `dev:cdp` blocked;
  - `plugin:reload` and `command` allowed;
  - `search` with a `query: "eval"` parameter allowed.
- [X] T023 [US3] Gate in `executeObsidianExec` (src/tools/obsidian_exec/handler.ts:22) before `invokeBoundedCli`: when `!deps.allowEval && isBlockedCommand(input.command)`, throw `UpstreamError({code:"VALIDATION_ERROR", message, details:{code:"COMMAND_BLOCKED", command: input.command}})`. The message text is in [contracts/errors.contract.md](contracts/errors.contract.md). Tests: the injected spawn is never called when blocked; `allowEval: true` spawns as before; the result envelope matches the contract.
- [X] T024 [US3] Wire `allowEval` in two sub-steps:
  - **(a) kernel-node touch**: add an optional `env?: NodeJS.ProcessEnv` field to `createServer`'s ctx (src/server.ts), defaulting to `process.env`. Today the ctx has no env field; only `deps.env` exists, in `_dispatch.ts` and `find_and_replace`. Name this `createServer` touch in the PR-2 checklist for reviewer attention.
  - **(b)** read `envFlagEnabled(env.OBSIDIAN_MCP_ALLOW_EVAL)` once in `createServer()` and pass it in `createObsidianExecTool` deps (src/tools/obsidian_exec/index.ts).

  Tests: in src/tools/obsidian_exec/index.test.ts, the deps reach the handler; in src/server.test.ts, `createServer({env: {OBSIDIAN_MCP_ALLOW_EVAL: "1"}})` enables it and an absent value leaves it off.
- [X] T025 [P] [US3] Docs: add `OBSIDIAN_MCP_ALLOW_EVAL` to the README env-var section with a plain warning (it allows arbitrary code with the user's rights; palette commands remain an accepted residual path). In docs/tools/obsidian_exec.md add the blocked list, the `COMMAND_BLOCKED` error-roster row and the opt-in.
- [X] T026 [US3] Run the full suite and confirm every typed tool's eval-based tests pass unchanged (`backlinks`, `links`, `open_file`, `read_heading`, `find_by_property`, `outline`, `_eval-vault-closed-detection`, â€¦). That proves the gate sits only in the passthrough (FR-013).
- [X] T027 PR-2 wrap:
  - gates as in T016, with the baseline unchanged;
  - `/speckit-git-commit`;
  - open **PR-2**. Checklist: Iâ€“V **Y**; ADR-015 **Y** (new pair `VALIDATION_ERROR/COMMAND_BLOCKED`); ADR-010/013/014 **N/A**; MCP standard **N/A (pending A2)**; Tool Surface **N/A (pending)**; Security Defaults **Y** (closes escape hatches); kernel-node touch named: `createServer` ctx gains `env` (T024);
  - `/code-review` and fixes;
  - `/speckit-docs-as-code <n>` (escape-hatch-and-meta page);
  - **STOP**: owner merges.

---

## Phase 5: PR-3: SDK v2, dual-era stdio, tool-surface gate (US4 P1, US5 P1, US9 P2)

**Branch**: `068-pr3-sdk-v2` from updated `main`. Behaviour is unchanged apart from the
protocol. **Independent tests**: quickstart Â§1 (gate) and Â§5.

- [X] T028 Create branch `068-pr3-sdk-v2`.
- [X] T029 [US4] Dependencies (R1): `npm uninstall @modelcontextprotocol/sdk`, `npm install @modelcontextprotocol/server@^2.4.0`, `npm install -D @modelcontextprotocol/client@^2.4.0` (package.json, package-lock.json). Do not touch zod, TypeScript or engines.
- [X] T030 [US4] **T0 spike** (R2) in src/tools/_register.test.ts: build an `McpServer`, register one tool through the new pass-through adapter, connect a `Client` over `InMemoryTransport.createLinkedPair()`, and assert:
  1. the published `inputSchema` deep-equals `z.toJSONSchema(schema, {io:"input", target:"draft-2020-12"})` after today's description stripping;
  2. `additionalProperties: false` is present;
  3. an invalid input reaches the callback and returns the `{code:"VALIDATION_ERROR", message, details}` envelope.

  If any assertion is impossible, STOP and report before continuing.
- [X] T031 [US4] Implement the adapter `toSdkInputSchema(schema)` in src/tools/_register.ts. It is a Standard Schema whose `~standard.jsonSchema.input/output` return `stripSchemaDescriptions(<zod schema's own ~standard.jsonSchema[io]({target:"draft-2020-12"})>)`. Stripping stays until PR-4 (C1), as existing non-conformance pending C1. Its `~standard.validate` passes the value through.
- [X] T032 [US4] Delete `toMcpInputSchema`, `normalizeToDraft7Parity` and `normalizeNode` from src/tools/_shared.ts, and their tests from src/tools/_shared.test.ts (C3). Move every `src/tools/*/schema.test.ts` that imports `toMcpInputSchema` (find them with `grep -l toMcpInputSchema src`) to `z.toJSONSchema(schema, {io:"input", target:"draft-2020-12"})`. Update `ToolDescriptor` in `_shared.ts` or remove it if unused.
- [X] T033 [US4] Rewrite `registerTool` / `ToolSpec` in src/tools/_register.ts: a spec now exposes `register(server: McpServer)`, which calls `server.registerTool(name, { description, inputSchema: toSdkInputSchema(schema) }, cb)`. Rules for `cb`:
  - it runs today's `safeParse`, `mapValidationError` and `responseFormat` handling unchanged;
  - it **returns** `asToolError(...)` for `UpstreamError` (and `INTERNAL_ERROR` for a handler `ZodError`) instead of throwing;
  - it rethrows other errors, as today.

  Update src/tools/_register.test.ts throughout.
- [X] T034 [US4] [US5] Split src/server.ts per R10:
  - `createServer(ctx)` stays the only constructor of `createLogger()`/`createQueue()` and the registry, and builds the 34 tool specs and runs `assertToolDocsExist` once;
  - it returns `{ buildMcpServer(era), shutdown() }`;
  - `buildMcpServer` creates `new McpServer({name:"obsidian-cli-mcp", version}, { capabilities: { tools: { listChanged: false } } })` and registers each spec;
  - delete the low-level `Server`, both hand-written handlers, the `TOOL_NOT_FOUND` path and both `eslint-disable @typescript-eslint/no-deprecated` lines;
  - keep SIGINT/SIGTERM â†’ `shutdown()`;
  - update the header and the BI-067 comment (point to ADR-039).
- [X] T035 [US4] [US5] Rewrite src/index.ts: `const app = await createServer(...)`; `serveStdio(() => app.buildMcpServer())` from `@modelcontextprotocol/server/stdio` (pass `ctx.era` through only if used); stdin `end`/`close` â†’ `app.shutdown("transport_closed")`; keep the `bridge.fatal` handler.
- [X] T036 [P] [US5] Add a 2025-era protocol test in a new src/server.protocol.test.ts (header `// Original â€” no upstream. In-process protocol tests for both MCP eras.`) using `Client` + `InMemoryTransport.createLinkedPair()`.

  **No queue seam** (PR #89 review, owner ruling; replaces the analyze pass's U1 `ctx.createQueue` seam): `createServer`'s ctx gains no test-only field. The shared queue is proven through the `queue` that `createServer` already returns.

  The test covers:
  - `initialize` serverInfo and capabilities (`tools.listChanged === false`, no `logging`);
  - `listTools` returns 34;
  - `callTool("help")` succeeds;
  - an invalid-input call returns the project `VALIDATION_ERROR` envelope;
  - an unknown tool gives JSON-RPC `-32602`;
  - calling `buildMcpServer` twice yields servers that share one queue: with a spy on `app.queue.run`, two clients (one per server) each make one call, and the spy sees both calls.
- [X] T037 [P] [US4] Add a 2026-era protocol test in src/server.protocol.test.ts using `createMcpHandler(factory)` + `StreamableHTTPClientTransport(url, { fetch: (u, i) => handler.fetch(new Request(u, i)) })` + `Client(..., { versionNegotiation: { mode: "auto" } })`. Same assertions as T036, and it asserts the negotiated version is `2026-07-28`.
- [X] T038 [P] [US4] Create scripts/probe-stdio.ts (`// Original â€” no upstream.`). It spawns `node dist/index.js` with `StdioClientTransport` and takes `--era legacy|modern` (and `--no-elicitation`, which declares no elicitation capability, for PR-6). It prints the negotiated protocol version, serverInfo, whether `instructions` is present (plus its length) and the tool count. Exit code is non-zero on failure. Add an `npm run probe:stdio` script in package.json.
- [X] T039 [US9] Rebuild `fingerprintLiveRegistry` in src/tools/_register-baseline.ts (R3): build via `createServer({registerSignalHandlers:false})`, connect a `Client` over `InMemoryTransport`, `listTools(undefined, {cacheMode:"bypass"})`, and fingerprint `description` + `inputSchema` per tool. Set `schemaVersion: 2`. Make scripts/write-register-baseline.ts reuse this helper (delete its inline `canonicalJSON`/`sha256` copy) and update src/tools/_register-baseline.test.ts.
- [X] T040 [US9] Run `npm run baseline:write` and review the diff of src/tools/_register-baseline.json: every `schemaFingerprint` changes (dialect), while `descriptionFingerprint` values and the 34 names do not. Then prove the gate: edit one description, `npm test` fails on the baseline test, revert. Note the proof in the PR body.
  **Outcome (2026-10-30)**: 34 of 34 `schemaFingerprint` values changed (draft-07 → draft-2020-12), 0 `descriptionFingerprint` values changed, and the 34 names are identical; `schemaVersion` is 2. Gate proof: adding one word to the `backlinks` description made "live registry fingerprints match the checked-in baseline" fail with the backlinks `descriptionFingerprint` diff; reverting made it pass again.
- [X] T041 Write `.decisions/ADR-039 - Dual-Era Stdio Serving on MCP SDK v2 McpServer.md`. It supersedes ADR-036 (modern-only era) and the BI-067 low-level-`Server` decision, and records R2, R10 and the `-32602` unknown-tool change. Add the row to `.decisions/Decision Log.md`. Before writing, confirm 039 is free in the vault Decision Log (one project-wide series); if not, use the next free number and update the plan/research references.
- [X] T042 Run the gates: `npm run lint` (zero warnings, and `grep -rn "no-deprecated" src` shows no SDK disable), typecheck, test, build. Run `npm run probe:stdio -- --era legacy` and `-- --era modern`, both listing 34. **T0-live**: Claude Code connects to the built server and calls `read` and `write_note` (specific, `Sandbox/`) on the test vault, plus one failing `read`, whose envelope matches the pre-upgrade text. Record the results in the PR body.
  **Outcome (2026-10-30)**: lint zero warnings, no SDK `no-deprecated` disable left in `src`, typecheck and build clean, 2927 tests pass (6 skipped), statements 96.81%. `probe:stdio` lists 34 tools for both eras (legacy negotiates `2025-11-25`, modern `2026-07-28`). Live check on `TestVault-Obsidian-CLI-MCP` (`Sandbox/`, cleaned up): this unattended run cannot attach Claude Code, so a v2 MCP client drove the built `dist/index.js` over real stdio in both eras instead. `write_note` and `read` succeeded in each era, and a failing `read` of a missing note returned `CLI_REPORTED_ERROR` with text byte-identical to the same call against a build of `main` (SDK v1). A Claude Code session check is still open for the owner before merge.
- [X] T043 PR-3 wrap:
  - `/speckit-git-commit`;
  - open **PR-3** with a **dependency justification** citing constitution v1.6.0 â†’ Dependencies (pre-justified swap; the client is a test-only devDependency, R1);
  - checklist:
    - Iâ€“V **Y**;
    - MCP standard **Y** (closes A2);
    - Tool Surface: Schema dialect **Y** (closes C3);
    - Tool Surface: parameter descriptions: description stripping stays in PR 3 (re-hosted unchanged in `toSdkInputSchema`). PR 4 removes it under the C1 ruling (descriptions now, union later), and the ADR superseding ADR-005 is due in PR 4;
    - Tool Surface: titles/annotations, instructions and typed results **N/A (pending B1/B2/B5)**;
    - Security Defaults **N/A**;
    - ADR-010/013/014/015 **N/A**;
    - kernel-node touches named: `createServer` (composition-root split);
  - `/code-review` and fixes;
  - `/speckit-docs-as-code <n>` (tech-stack and architecture pages; any docs promising a `TOOL_NOT_FOUND` result);
  - **STOP**: owner merges.

---

## Phase 6: PR-4: what the model sees (US6 P2, US7 P2, US8 P2)

**Branch**: `068-pr4-tool-surface` from updated `main` (PR-3 merged).
**Independent test**: quickstart Â§6.

- [X] T044 Create branch `068-pr4-tool-surface`.

### User Story 6: tools declare their nature (P2)

- [X] T045 [US6] Extend `ToolSpec` in src/tools/_register.ts with required `title: string` and `annotations: { readOnlyHint; destructiveHint; idempotentHint; openWorldHint }`, all required booleans so TypeScript enforces completeness. Pass both to `server.registerTool` config.
- [X] T046 [P] [US6] Add `title` + `annotations` to each of the 34 `src/tools/<tool>/index.ts` exactly per spec FR-024 / [contracts/tool-surface.contract.md](contracts/tool-surface.contract.md). Batches can run in parallel by file: the read row (21 tools now; `vaults` comes in PR-5), then write/edit/destructive/open/exec.
- [X] T047 [US6] Add enforcement tests in a new src/tools/_surface.test.ts (header `// Original â€” no upstream. Registry-wide published tool-surface enforcement tests.`) that walks `client.listTools()` over InMemoryTransport:
  - every tool has a non-empty `title` and all four hints as booleans (FR-023);
  - a pinned table asserts each tool's four values (FR-024);
  - every read-only-row tool has `readOnlyHint: true` and `destructiveHint: false`, which is the server-side evidence for SC-006.

### User Story 8: every parameter is described (P2)

- [X] T048 [US8] Remove `stripSchemaDescriptions` from `toSdkInputSchema` (src/tools/_register.ts). Delete src/help/strip-schema.ts and src/help/strip-schema.test.ts; the only production caller is `_register.ts` (graph-verified).
- [X] T049 [US8] Add rule-bearing `.describe()` text to `targetModeBaseSchema` and the folder-scoped variant in src/target-mode/target-mode.ts, per the tool-surface contract (target_mode, vault, file, path). Keep `superRefine` unchanged (ADR-003, C1 ruling). Test in src/target-mode/target-mode.test.ts that the emitted JSON Schema descriptions state each rule.
- [X] T050 [P] [US8] Add a one-line `.describe()` (what, format, default) to every property of every input schema in `src/tools/*/schema.ts` (all 34 tools). Batches can run in parallel by tool group: read/search, write/edit, bases/plugin/meta.
- [X] T051 [US8] In every `src/tools/*/index.ts` `*_DESCRIPTION` constant (34), remove the `Call help({ tool_name: "â€¦" }) for full parameter docsâ€¦` sentence (FR-032). Remove the cross-cutting rule repeats now owned by the instructions: "Specific mode" in files, get_active_file, links, outline, paths, read, read_heading, read_property, smart_connections_similar, write_note; "display name" in backlinks, links, tag; "preview first" in find_and_replace (FR-028).
- [X] T052 [US8] Extend src/tools/_surface.test.ts with:
  - a recursive walk of every published `inputSchema` (properties, nested objects, array items) that fails on any property without `description` (FR-030);
  - no description contains `Call help(`;
  - no description repeats the instruction-owned rule sentences.

### User Story 7: the model is oriented at session start (P2)

- [X] T053 [US7] Create src/instructions/instructions.ts (`// Original â€” no upstream.`) exporting `buildInstructions(offeredToolNames: readonly string[]): string` per R7 / data-model Â§5:
  - a fixed opening of â‰¤ 512 characters ending on a sentence, naming no hideable tool;
  - routing lines and rules as `{text, tools}`, each kept only if all its tools are offered;
  - tool names always in backticks.

  The rules come from spec FR-027. The `vaults` rule is tagged `["vaults"]` and drops out until PR-5.
- [X] T054 [P] [US7] Add tests in a new src/instructions/instructions.test.ts (header `// Original â€” no upstream. Tests for the server instructions builder.`):
  - the unfiltered text (all names, including `vaults`) is < 2,000 characters;
  - the first 512 characters end on a complete sentence;
  - the opening is identical for full, read-only and single-tool sets;
  - lines naming an absent tool are omitted;
  - the read-only set's text contains no backticked non-read-only tool name (FR-026a).
- [X] T055 [US7] In `createServer()` (src/server.ts), build the instructions once from the registered spec names and pass `instructions` in the `McpServer` options in `buildMcpServer`. Extend src/server.protocol.test.ts so both eras receive byte-identical `instructions`.

### PR-4 wrap

- [X] T056 Add `titleFingerprint` and `annotationsFingerprint` to `fingerprintLiveRegistry` (src/tools/_register-baseline.ts), run `npm run baseline:write`, and review the diff: every tool's description, schema, title and annotations change.
  **Outcome (2026-10-30)**: 34 of 34 `descriptionFingerprint` and 34 of 34 `schemaFingerprint` values changed, the 34 names are identical, and `schemaVersion` stays 2. The new fields hold 34 distinct `titleFingerprint` values and 5 distinct `annotationsFingerprint` values (one per FR-024 row: read-only, additive write, repeat-safe write, destructive, passthrough).
- [X] T057 Write `.decisions/ADR-040 - Published Parameter Descriptions and Server Instructions.md`, superseding ADR-005 (client tool deferral, tool search matching descriptions, descriptions grown back to about 77 KB). Add the row to `.decisions/Decision Log.md`. Confirm the number as in T041.
- [X] T058 Run the gates. `npm run probe:stdio` for both eras prints the instructions length (< 2,000). **T0-live, release evidence for SC-006**: in Claude Code, two read-only calls in one turn run in parallel with no "may modify data" prompt. Record the result in the PR body. SC-006 itself passes on the T047 assertions.
  **Outcome (2026-10-30)**: lint zero warnings, typecheck and build clean, 2979 tests pass (6 skipped), statements 96.8%. `probe:stdio` lists 34 tools with `instructions` present at 1,847 characters for both eras (legacy negotiates `2025-11-25`, modern `2026-07-28`); the unfiltered text including the PR-5 `vaults` lines is 1,888 characters. SC-006 server-side evidence: `src/tools/_surface.test.ts` pins all 21 read-only-row tools at `readOnlyHint: true`, `destructiveHint: false`. The Claude Code parallel-read check (no "may modify data" prompt) cannot run in this unattended session, so it is still open for the owner before merge.
- [X] T059 PR-4 wrap:
  - `/speckit-git-commit`;
  - open **PR-4**. Checklist: Iâ€“V **Y**; Tool Surface **Y** for title, annotations, parameter descriptions, visible input rules (in descriptions) and instructions (closes B1/B2/C1), typed results **N/A (pending B5)**; ADR-010/013/014/015 **N/A**; Security Defaults **N/A**;
  - `/code-review` and fixes;
  - `/speckit-docs-as-code <n>` (docs/tools pages that say "call help first"; `.docs-as-code` pages on progressive disclosure);
  - **STOP**: owner merges.

---

## Phase 7: PR-5: vaults and typed results (US11 P3, US12 P3)

**Branch**: `068-pr5-vaults-typed` from updated `main`. **Independent test**: quickstart Â§7.

- [X] T060 Create branch `068-pr5-vaults-typed`.

### User Story 11: list vaults and pick up new ones (P3)

- [X] T061 [US11] **T0-live**: capture the verbatim output of `Obsidian.com vaults verbose` and `Obsidian.com help vaults` in specs/068-modernise-mcp-surface/evidence-b4.md. Decide `open`: a CLI per-vault open marker exists â†’ map it; none â†’ `open: null` always (R9).
  **Outcome (2026-10-30)**: there is no marker. `help vaults` lists only `total` and `verbose`, and `vaults verbose` prints `<name>\t<path>` per vault and nothing else, so `open` is always `null`. In evidence-b4.md only the test vault's row is verbatim; the owner's six other vault names and paths are replaced with placeholders so they do not enter the repository.
- [X] T062 [US11] In src/vault-registry/registry.ts:
  - add `list(): Promise<VaultEntry[]>`, which always re-probes and refreshes the cache (single-flight via `inFlightProbe`);
  - make `resolve(name)` re-probe once on a miss before failing;
  - drop "restart the MCP server" from the message at :73;
  - update the header.

  Tests in src/vault-registry/registry.test.ts: a hit uses the cache; a miss then a hit after one refresh; a miss twice gives the existing error with no restart text; concurrent first calls produce one probe.
  **Outcome**: `list()` lives on a separate `VaultLister` interface (`createVaultRegistry` returns `VaultRegistry & VaultLister`), so the 32 test stubs that implement `VaultRegistry` for name resolution are unchanged. Duplicate display names are kept in `list()`; lookup by such a name still resolves to its last row, as before. The first lookup of an unknown vault probes once, not twice.
- [X] T063 [US11] Create the `vaults` tool in src/tools/vaults/:
  - `schema.ts`: empty strict input; output `{count, vaults:[{name, path, open: boolean|null}]}`;
  - `handler.ts`: calls `registry.list()`;
  - `index.ts`: description, `title: "Vaults"`, read-only annotations.

  Add schema.test.ts, handler.test.ts (listing, empty list, duplicate display names kept, CLI failure â†’ structured error) and index.test.ts. Every one of these six new files carries `// Original â€” no upstream. <one-line intent>.`, as in the Notes rule. Register the tool in `createServer()` (src/server.ts) with `vaultRegistry` deps.
- [X] T064 [US11] Docs: `git mv docs/tools/list_vaults.md docs/tools/vaults.md` and replace the stub with a full reference doc (boot needs it, `assertToolDocsExist`). Update docs/tools/index.md:18 and the docs/tools/help.md:65 example to `vaults`, and README.md:115 (the vault-enumeration sentence) to describe `vaults`.
  **Outcome**: also corrected the README tool count (thirty-five) and its List + inventory table, and the docs/tools/views_base.md error row that still advised restarting the bridge.
- [X] T065 [US11] Update the instructions and surface tests for the new tool:
  - the `vaults` rule now appears (src/instructions/instructions.test.ts);
  - the `vaults` row is in the pinned classification table (src/tools/_surface.test.ts);
  - the protocol tests expect 35 tools (src/server.protocol.test.ts);
  - `entries.length` is 35 in src/tools/_register-baseline.test.ts.

### User Story 12: typed results (P3)

- [X] T066 [US12] Add the output pass-through adapter `toSdkOutputSchema(schema)` to src/tools/_register.ts (R6):
  - its `~standard.jsonSchema.output` is the zod schema's own `{target:"draft-2020-12"}` emission;
  - when the root is a union whose variants are all `type: "object"`, the root gains `type: "object"`, and nothing else changes;
  - its `~standard.validate` delegates to zod. *Amended 2026-10-30 (PR #91 review B2, owner option A): `validate` accepts every value; `registerTool` checks the result against the output schema and reports drift as `INTERNAL_ERROR` (research R6).*

  **T0** in src/tools/_surface.test.ts: publish `search` and `find_and_replace` through it and read them back with a 2025-era client (InMemoryTransport) and a 2026-era client (`createMcpHandler`). Assert:
  - both eras' `outputSchema` values are deep-equal and have root `type: "object"`;
  - a sample of every variant validates;
  - the 2025 codec did not wrap them.

  Record the outcome in research.md R6 (append "T0 result"). If any tool cannot carry an identical schema in both eras, **STOP and raise it to the owner**. Never exempt it silently (FR-039, BI-0165 B5).
  **Outcome (2026-10-30)**: passed (research R6, "T0 result"). All 31 published output schemas are deep-equal across the 2025 and 2026 eras and have root `type: "object"`; no tool needed raising. `search` gained a published `searchOutputSchema` union of its two mode schemas.
- [X] T067 [US12] Add optional `outputSchema?: z.ZodType` to `ToolSpec` (src/tools/_register.ts). When it is set, pass it to `server.registerTool` and return `{ content:[{type:"text", text: JSON.stringify(result)}], structuredContent: result }`. Error results stay text-only via `asToolError`. `responseFormat: "raw"` tools are unchanged.
- [X] T068 [P] [US12] Set `outputSchema` in the eligible `src/tools/*/index.ts`: the 31 schema-bearing tools minus `tag`, plus `vaults` (data-model Â§4). `search` and `find_and_replace` go through `toSdkOutputSchema`. Leave `read`, `help`, `tag` and `obsidian_exec` without one, because their results are not structured objects. State the `tag` exclusion and its reason (a bare-integer count-only form) in the PR-5 body for owner review.
- [X] T069 [US12] Add a round-trip test in src/tools/_surface.test.ts (FR-042): for every tool with an `outputSchema`, call it through the client with a stubbed `invokeCli`/fs fixture that yields a success. Assert that `structuredContent` validates against the published schema and that `JSON.parse(content[0].text)` deep-equals it. Also assert one failing call per kind has no `structuredContent`. Reuse the existing `_handler-fixtures.ts` stubs where they exist.
  **Outcome**: the 33 success fixtures (31 tools, plus a second variant each for `search` and `find_and_replace`) live in the new vitest-free src/tools/_typed-result-fixtures.ts, cribbed from each tool's own stubs. Every one round-trips through a real client: `structuredContent` validates against the published schema with the client SDK's `AjvJsonSchemaValidator`, and the text parses to the same object. No tool's real result failed its own schema. A test also pins that every typed tool has a fixture.
- [X] T070 Add `outputSchemaFingerprint` to `fingerprintLiveRegistry`, run `npm run baseline:write` (35 tools), and review the diff.
  **Outcome (2026-10-30)**: 35 entries, `schemaVersion` 2. For the 34 existing tools, no `descriptionFingerprint`, `schemaFingerprint`, `titleFingerprint` or `annotationsFingerprint` changed; `vaults` is the one new entry. Every entry gains `outputSchemaFingerprint`: 28 distinct values, with `help`, `obsidian_exec`, `read` and `tag` sharing the `null` fingerprint, and tools with identical result shapes sharing one (`append_note`/`prepend`; `files`/`find_by_property`/`paths`; the two `smart_connections_*` tools).

### PR-5 wrap

- [X] T071 Run the gates; `npm run probe:stdio` shows 35 tools for both eras. **T0-live**: open a second vault in Obsidian after the server starts and `read` from it by name with no restart; an unknown name gives the error without restart text (quickstart Â§7).
  **Outcome (2026-10-30)**: lint zero warnings, typecheck and build clean, 3044 tests pass (6 skipped), statements 96.85%. `probe:stdio` lists 35 tools for both eras (legacy negotiates `2025-11-25`, modern `2026-07-28`), with `instructions` at 1,888 characters, the `vaults` rule included. Live check on `TestVault-Obsidian-CLI-MCP` (`Sandbox/`, cleaned up): a v2 MCP client drove the built `dist/index.js` over real stdio in both eras. `vaults` returned 7 vaults with `structuredContent`, every `open` null and the text equal to the structured data; `read` by vault name returned the seeded note as text only; `files` on `Sandbox` returned `structuredContent` matching its text; `help` was text only; and an unknown vault name gave `CLI_REPORTED_ERROR` / `VAULT_NOT_FOUND` with no restart advice. Registering a new vault in Obsidian after start-up needs a GUI action, which this unattended run cannot do, so that step is still open for the owner before merge (unit evidence: registry.test.ts "cache miss re-probes once and resolves a vault added after start-up"). `Sandbox/` already held `pr3-check-2026-10-30.md` from an earlier run; it was not created or removed here.
- [X] T072 PR-5 wrap:
  - `/speckit-git-commit`;
  - open **PR-5**. Checklist: Iâ€“V **Y**; ADR-010 **Y** (`vaults` mirrors `obsidian vaults`); ADR-013/014/015 **N/A**; Tool Surface typed results **Y** (closes B5; list any R6 exclusions); Security Defaults **N/A**;
  - `/code-review` and fixes;
  - `/speckit-docs-as-code <n>` (list-and-inventory page, README);
  - **STOP**: owner merges.

---

## Phase 8: PR-6: owner controls, confirmation, cancel, progress (US13â€“US16 P3) + release

**Branch**: `068-pr6-safety-cancel` from updated `main`. **Independent test**: quickstart Â§8.

- [X] T073 Create branch `068-pr6-safety-cancel`.

### User Story 13: read-only and restricted modes (P3)

- [X] T074 [US13] In src/server.ts, add `parseAccessConfig(env)` â†’ `{ readOnly, allow?, deny }` per [contracts/configuration.contract.md](contracts/configuration.contract.md) (it reuses `envFlagEnabled`; `allowEval` moves in here). Also add `selectOfferedTools(specs, config)` (allow â†’ deny â†’ read-only by `annotations.readOnlyHint`). Unknown names from both lists produce one aggregated error, thrown before serving, in the style of `assertToolDocsExist`. Instructions are built from the offered set.
  **Outcome**: `parseAccessConfig` and `selectOfferedTools` are exported from src/server-config.ts (moved out of src/server.ts in the PR #92 review, beside the existing src/server-config.test.ts); `createServer` registers only the offered tools and builds the instructions from them, while `assertToolDocsExist` still checks every tool. The unknown-name error is a plain `Error` thrown before serving, which src/index.ts reports as one `bridge.fatal` stderr line and exit 1.
- [X] T075 [P] [US13] Add tests in src/server.test.ts (or a co-located src/server-config.test.ts):
  - the truthy table for `OBSIDIAN_MCP_READ_ONLY`;
  - read-only offers exactly the readOnlyHint set (22 tools);
  - allow only; deny only; allow + deny overlap (deny wins);
  - read-only + an allow list naming `write_note` (dropped);
  - unknown names in both lists â†’ one error naming all of them;
  - an empty offered set starts and lists 0;
  - read-only instructions name no write tool.
  **Outcome**: in the new src/server-config.test.ts (header per the Notes rule).
- [X] T076 [P] [US13] Document `OBSIDIAN_MCP_READ_ONLY`, `OBSIDIAN_MCP_TOOLS` and `OBSIDIAN_MCP_DISABLE` in README.md (composition order, start-up failure).
  **Outcome**: README.md gains "Limit which tools are offered" and "Confirmation before irreversible changes" sections. docs/tools pages (delete, find_and_replace error rosters) are left for `/speckit-docs-as-code`.

### User Story 14: confirmation before irreversible actions (P3)

- [X] T077 [US14] Extend the registration callback in src/tools/_register.ts so a handler receives a per-call `call` context. It carries:
  - `signal` and `reportProgress?` (US15/16);
  - `canConfirm(): boolean` (step 1 of R12, the capability check; no I/O);
  - `confirm(message)`, which returns `{ proceed: true } | { result: CallToolResult | InputRequiredResult }` (step 2, the prompt and the response).

  Handlers may return that result directly. This is the plumbing for T078â€“T080 and T085.
  **Outcome**: `ToolCall` (in src/tools/_shared.ts, beside `RegisteredTool`, so `_register.ts` and `_confirm.ts` share it without a cycle) is the handler's third argument. Deviation for owner review: `confirm(message)` returns `void` and throws instead of returning `{ proceed } | { result }`, so typed handlers keep their output types. A pending prompt is thrown as `ConfirmationRequested` carrying the `input_required` result, which the `register` callback returns to the SDK; a refusal is an `UpstreamError`. A direct `RegisteredTool.handler(args)` call gets `NON_INTERACTIVE_CALL` (no signal, no progress, cannot confirm), so a gated action refuses by default. Amended in the PR #92 review: the handler's third argument is now `Confirmation` (`requireConfirmable(message)`, which throws `CONFIRMATION_UNAVAILABLE`, and `confirm(message)`). The signal and progress reporter reach the handler only on its deps, typed `TDeps & CallScope`, and each tool's boot-time `RegisterDeps` is `BootDeps<ExecuteDeps>`, which leaves those two fields out. Handlers pass their deps whole to `invokeCli` rather than copying fields.
- [X] T078 [US14] Create src/tools/_confirm.ts (`// Original â€” no upstream.`) per R12:
  - the capability check (modern: `ctx.mcpReq.envelope?.[CLIENT_CAPABILITIES_META_KEY]?.elicitation`; legacy: `server.server.getClientCapabilities()?.elicitation`) â†’ `CONFIRMATION_UNAVAILABLE` envelope;
  - no response yet â†’ `inputRequired({ inputRequests: { confirm: inputRequired.elicit({ message, requestedSchema: z.object({ confirm: z.boolean() }) }) } })`;
  - a response â†’ `inputResponse(...)`: accept + `confirm === true` proceeds; anything else â†’ `CONFIRMATION_DECLINED` with `details.action`.

  Tests in src/tools/_confirm.test.ts cover each branch for both eras.
  **Outcome**: `clientCanConfirm`, `confirmFromResponse`, `ConfirmationRequested`, `NON_INTERACTIVE_CALL` and (PR #92 review) `requestConfirmation`, which builds a request's `Confirmation`; `confirmationUnavailable` is now private to the module. src/tools/_confirm.test.ts covers each branch for both eras and a real SDK round trip on each era: the 2026 client fulfils `input_required` itself, the 2025 legacy shim sends `elicitation/create`, and a client without elicitation gets the project envelope rather than the SDK's error. For owner review: the 2025-era capability read uses `server.server.getClientCapabilities()` as R12 says, which SDK 2.4.0 marks deprecated, so it carries one `eslint-disable-next-line @typescript-eslint/no-deprecated` with a reason. The plan's PR-3 acceptance line says no SDK `no-deprecated` disable is left; the SDK offers no per-request alternative on the 2025 era.
- [X] T079 [US14] In src/tools/delete/handler.ts, when `permanent === true`:
  - at handler entry, before any vault resolution or spawn: if `!call.canConfirm()`, return the `CONFIRMATION_UNAVAILABLE` envelope (since the PR #92 review: `confirmation.requireConfirmable(message)`);
  - otherwise call `call.confirm(...)` before `invokeCli`. The message names the vault and note. Tests in src/tools/delete/handler.test.ts:
  - confirm â†’ argv includes `permanent`;
  - decline, cancel or `confirm:false` â†’ `CONFIRMATION_DECLINED` and spawn not called;
  - unavailable â†’ `CONFIRMATION_UNAVAILABLE` and spawn not called;
  - `permanent` absent â†’ no confirmation (FR-050).
- [X] T080 [US14] In src/tools/find_and_replace/handler.ts, for `commit: true` with none of `file`/`path`/`active_note` (a `subfolder` scope still confirms), use the two-step split (R12):
  - **Step 1**: at handler entry, right after input validation and **before vault resolution**, which spawns Obsidian through the `FOCUSED_VAULT_TEMPLATE` eval (:187) or the registry probe (:216). If `!call.canConfirm()`, return `CONFIRMATION_UNAVAILABLE` at once (since the PR #92 review: `confirmation.requireConfirmable(message)`).
  - **Step 2**: `call.confirm(...)` only after the commit re-scan and before the first `writeAtomic`. The message carries the scope and note count.

  Tests (FR-049a):
  - **unavailable**: the injected spawn function is **never called**, with `vault` both given and omitted (so neither the registry probe nor the focused-vault eval runs), and no file is written;
  - confirm writes;
  - decline or cancel â†’ nothing written;
  - a single-note scope asks nothing;
  - a subfolder scope asks.
  **Outcome**: a commit with nothing to write asks nothing (it changes nothing).
- [X] T081 [US14] Extend scripts/probe-stdio.ts `--no-elicitation` to call `delete permanent:true` and a vault-wide `find_and_replace commit:true` on `Sandbox/` fixtures, and print the envelopes (quickstart Â§8).
  **Outcome**: `--no-elicitation --vault <name> --note <path>` adds `confirmationProbes` to the report. The find_and_replace probe is scoped to `--subfolder` (default `Sandbox`) with a random pattern, so a broken gate could change nothing outside it.

### User Story 15: cancel a slow call (P3)

- [X] T082 [P] [US15] In src/queue.ts, `run(task, opts?: { signal?: AbortSignal })`:
  - aborted before start â†’ removed from the FIFO, rejected with the abort reason, task never invoked;
  - an already-aborted signal â†’ rejected immediately;
  - running â†’ unaffected by the queue (the task observes the signal).

  `depth()` and `shutdown()` stay correct. Tests in src/queue.test.ts: cancel-queued never runs and the next task runs; cancel after settle is ignored.
- [X] T083 [P] [US15] In `dispatchOnce` (src/cli-adapter/_dispatch.ts:308), attach a `signal` abort listener that calls the existing `killChild` (SIGTERM, then SIGKILL after `SIGKILL_GRACE_MS`) and removes itself on settle. Tests in src/cli-adapter/_dispatch.test.ts with a fake spawn: abort while running â†’ SIGTERM then SIGKILL after the grace period, and the promise settles.
  **Outcome**: a cancelled call settles with the abort reason and logs nothing, and an already-aborted signal starts no process, which also ends the cold-start retry and the auto-launch poll.
- [X] T084 [US15] Thread the signal from `invokeCli` (src/cli-adapter/cli-adapter.ts) and `invokeBoundedCli` (src/cli-adapter/invoke-bounded-cli.ts) via `deps.signal` into `queue.run(â€¦, {signal})` and `dispatchCli`â†’`dispatchOnce`. The graph shows `invokeCli â†’ dispatchCli` directly, with no code path between `createQueue` and `dispatchOnce`, so both need it. Remove the dead clamp at invoke-bounded-cli.ts:53. Confirm src/tools/obsidian_exec/schema.test.ts rejects `timeoutMs: 120001`, adding the test if missing. Test in cli-adapter.test.ts: cancel-running kills the child and the next queued call runs.
  **Outcome**: the clamp test in invoke-bounded-cli.test.ts is replaced by a cancel test; obsidian_exec/schema.test.ts already rejects `timeoutMs: 120001`.
- [X] T085 [US15] In the src/tools/_register.ts callback, build per-call deps `{ ...deps, signal: ctx.mcpReq.signal, reportProgress }`. Audit every handler that builds a narrowed deps object for `invokeCli` (`grep -rn "logger: deps.logger" src/tools`) and make `signal`/`reportProgress` flow through.
  **Outcome**: `registerTool` passes `{ ...deps, signal, reportProgress }` per call. 31 files that narrow deps for `invokeCli` now pass both fields, and their deps types extend `CallScope`. The vault-registry probe built in `createServer` keeps its boot deps, because it is shared and cached across callers.
- [X] T086 [US15] In the `find_and_replace` commit loop, check `signal.aborted` before each note and stop between notes; the in-flight write completes. Add a typed `commitCancelled({vault, committed, skipped})` event to src/logger.ts (update the test doubles as in T005) and emit it on cancel. Test (FR-052a): cancel after the first of three writes â†’ note 1 changed, notes 2 and 3 unchanged, the event lists both groups.
  **Outcome**: the event line is `find_and_replace.commit_cancelled`. No `Logger` test double needed updating; the tests use `createLogger`.

### User Story 16: progress during long waits (P3)

- [X] T087 [P] [US16] In the auto-launch loop (`dispatchCli`, src/cli-adapter/_dispatch.ts:278-295), call `deps.reportProgress?.(pollIndex, 40, "waiting for Obsidian to start")` per poll. Tests: notifications carry increasing `progress`; none when `reportProgress` is undefined.
- [X] T088 [US16] In the `find_and_replace` commit, call `reportProgress?.(n, total, relPath)` after each note. In src/tools/_register.ts, `reportProgress` sends `notifications/progress` with the request's `progressToken` and is defined only when the token is present. Tests in src/server.protocol.test.ts: a call with `_meta.progressToken` receives progress with that token; a call without one receives none (FR-054).
  **Outcome**: the protocol test registers a small tool that reports two steps, served in both eras.

### Release

- [X] T089 Set `version` in package.json (and package-lock.json) from 0.8.11 to `0.9.0`.
- [X] T090 Run the gates. Run `npm run probe:stdio` with each env configuration in quickstart Â§8's table, plus `--no-elicitation`. **T0-live**: Claude Code confirm/decline for `delete permanent:true` and a vault-wide commit on `Sandbox/` fixtures, following the destructive-probe protocol; also a trash delete with no prompt. Record the results in the PR body.
  **Outcome (2026-10-30)**: lint zero warnings, typecheck and build clean, 3127 tests pass (6 skipped), statements 97%. `probe:stdio`, both eras (legacy `2025-11-25`, modern `2026-07-28`): default 35 tools (instructions 1,888 chars); `OBSIDIAN_MCP_READ_ONLY=1` 22 (1,341); `OBSIDIAN_MCP_TOOLS=read,search` 2; plus `OBSIDIAN_MCP_DISABLE=search` 1. `read,nope` + `zap`: exit 1 with one `bridge.fatal` line naming `nope (OBSIDIAN_MCP_TOOLS)` and `zap (OBSIDIAN_MCP_DISABLE)`. Live on `TestVault-Obsidian-CLI-MCP` (`Sandbox/`, cleaned up): `--no-elicitation` returned `CONFIRMATION_UNAVAILABLE` for both calls in both eras, and the fixture was unchanged. This unattended run cannot attach Claude Code, so a v2 client that declares form elicitation drove the built `dist/index.js` over real stdio in both eras instead. Decline gave `CONFIRMATION_DECLINED` for both tools, and the files were still there for the accept that followed. Accept deleted the note permanently (not in the trash) and rewrote both subfolder notes; the prompts named the vault and note, or the subfolder and "2 note(s)". A trash delete asked nothing (`toTrash: true`). It went to the OS Recycle Bin, because the vault has no `.trash`; the run removed its two Recycle Bin entries. The Claude Code confirm/decline check is still open for the owner before merge.
- [ ] T091 PR-6 wrap:
  - `/speckit-git-commit`;
  - open **PR-6**. Checklist: Iâ€“V **Y** (IV: cancellation + progress close A3); ADR-015 **Y** (new pairs `CONFIRMATION_DECLINED` with `details.action`, `CONFIRMATION_UNAVAILABLE`); ADR-010/013/014 **N/A**; Tool Surface **Y**; Security Defaults **Y** (closes read-only/filtering and confirmation); MCP standard **Y**;
  - `/code-review` and fixes;
  - `/speckit-docs-as-code <n>`;
  - **STOP**: owner merges.

---

## Phase 9: Polish & post-implement (after PR-6 merges)

- [ ] T092 Run `/graphify --update`, then the four CLAUDE.md post-implement checks. Record them in specs/068-modernise-mcp-surface/post-implement.md:
  1. no new error-class nodes outside src/errors.ts;
  2. no production handler imports `createLogger`/`createQueue`;
  3. src/instructions/, src/tools/_confirm.ts and src/tools/vaults/ land in the expected communities (plan â†’ Graphify structural check);
  4. no orphaned production file.
- [ ] T093 Walk spec SC-001â€¦SC-014 and the release-level acceptance (brief Â§7). Mark each pass/fail with its evidence link in post-implement.md.
- [ ] T094 Raise the owner follow-ups (do not edit them yourself): the constitution v1.6.0 Sync Impact Report still says `list_vaults` and "0.8.20" (fold into the post-release PATCH amendment that removes "Adoption of v1.6.0"); the vault-side ADR amendment stanzas for ADR-036 and ADR-005; the vault Architecture page `list_vaults` mention; and re-checking BI-0156â€¦BI-0159 against SDK v2.

---

## Dependencies

```text
T001 â†’ T002 (no PR-0; docs ride in PR-1)
 â†’ PR-1: T003 â†’ T004 â†’ {T005 âˆ¥ T011 âˆ¥ T014} â†’ T006 â†’ T007 â†’ T008 â†’ T009 â†’ T010
          T011 â†’ T012 â†’ T013 ; T014 â†’ T015 ; all â†’ T016 â†’ T017 â†’ T018 (merge)
 â†’ PR-2: T019 â†’ T020 â†’ {T021 âˆ¥ T025} â†’ T022 â†’ T023 â†’ T024 â†’ T026 â†’ T027 (merge)
 â†’ PR-3: T028 â†’ T029 â†’ T030 â†’ T031 â†’ T032 â†’ T033 â†’ T034 â†’ T035
          â†’ {T036 âˆ¥ T037 âˆ¥ T038} â†’ T039 â†’ T040 â†’ T041 â†’ T042 â†’ T043 (merge)
 â†’ PR-4: T044 â†’ T045 â†’ T046 â†’ T047 ; T048 â†’ T049 â†’ T050 â†’ T051 â†’ T052
          ; T053 â†’ T054 â†’ T055 (T055 after T051) â†’ T056 â†’ T057 â†’ T058 â†’ T059 (merge)
 â†’ PR-5: T060 â†’ T061 â†’ T062 â†’ T063 â†’ T064 â†’ T065 ; T066 â†’ T067 â†’ T068 â†’ T069 â†’ T070
          â†’ T071 â†’ T072 (merge)
 â†’ PR-6: T073 â†’ T074 â†’ {T075 âˆ¥ T076} ; T077 â†’ T078 â†’ {T079 âˆ¥ T080} â†’ T081
          ; {T082 âˆ¥ T083} â†’ T084 â†’ T085 â†’ T086 ; T085 â†’ {T087 âˆ¥ T088}
          â†’ T089 â†’ T090 â†’ T091 (merge)
 â†’ T092 â†’ T093 â†’ T094
```

- PRs are strictly sequential, each cut from main after the previous merge. PR-1 and
  PR-2 do not depend on SDK v2 and could be reordered with the owner's agreement. PR-4,
  PR-5 and PR-6 require PR-3.
- Inside PR-6: T077 (the call context) blocks US14, US15 and US16. T085 is the per-call
  deps that US16 uses.

**Graph-derived dependency notes** (CLAUDE.md tasks rule; `graphify path` at 2026-10-28):

- `assertCanonicalPath() â†’ checkCanonicalPath()` is a direct call, so T012 changes every
  write handler's containment with no caller edits (T013 only tests).
- `invokeCli() â†’ dispatchCli()` is a direct call, but there is no code path between
  `createQueue()` and `dispatchOnce()`. The queue wraps dispatch inside `cli-adapter.ts`,
  so T084 must thread the signal into both the queue (T082) and dispatch (T083). That is
  why those two can run in parallel.
- `executeObsidianExec() â†’ invokeBoundedCli()` is a direct call, so the T023 gate is
  upstream of every spawn on the passthrough path and of nothing else.
- `invalidateMetadataCache()` reaches `createLogger()` only through tests. Production gets
  the logger through injected deps, so T005 must land before T006.
- `registerTool()` and `fingerprintLiveRegistry()` meet in `_register.test.ts`, which is
  the joint gate for T033 and T039, so T039 runs after T033.

## Parallel examples

```text
PR-1 after T004:   T005 src/logger.ts  âˆ¥  T011 src/path-safety/canonical.test.ts  âˆ¥  T014 .github/workflows/ci.yml
PR-3 after T035:   T036 + T037 src/server.protocol.test.ts (one file: write sequentially) âˆ¥ T038 scripts/probe-stdio.ts
PR-4:              T046 batches across src/tools/*/index.ts âˆ¥ T050 batches across src/tools/*/schema.ts
PR-6 after T077:   T082 src/queue.ts âˆ¥ T083 src/cli-adapter/_dispatch.ts âˆ¥ T078 src/tools/_confirm.ts
```

## Implementation strategy

- **MVP = PR-1** (US1 + US2 + US10). It fixes a live data-correctness bug and a security
  hole, and adds the Windows safety net the SDK migration needs.
- **PR-2** closes the second security gap. Both ship value before the larger migration.
- **PR-3** is the platform. Do not start PR-4 until it is merged and green on both OSes.
- Each merged PR leaves main releasable. Only PR-6 bumps the version.

## Notes

- `src/tools/_register-baseline.json` changes only in the dedicated tasks: T040 (PR-3),
  T056 (PR-4) and T070 (PR-5). Each diff is reviewed. If it diffs anywhere else, the
  code is wrong.
- Kernel nodes touched (plan â†’ Graphify structural check): `createServer()` (T024, T034,
  T055, T063, T074); `createQueue()` (T082, additive); `createLogger()` (T005, T086,
  additive). `UpstreamError` is never edited.
- Live probes (T004, T010, T020, T042, T058, T061, T071, T090) are gated by
  `.memory/test-execution-instructions.md`. Unit tests that mock `invokeCli` are not.
- [P] means different files with no dependency on an incomplete task. Two tasks on the
  same file are never both [P] in the same window.
- **Attribution headers (Constitution Principle V)**: every new file this feature
  creates, **tests included**, starts with `// Original â€” no upstream. <one-line
  intent>.`. This covers:
  - scripts/probe-stdio.ts;
  - src/server.protocol.test.ts, src/tools/_surface.test.ts;
  - src/instructions/instructions{,.test}.ts;
  - src/tools/_confirm{,.test}.ts;
  - src/tools/vaults/{schema,handler,index}{,.test}.ts;
  - any new evidence-free source file.

  Existing files whose role changes get their header updated in the task that changes
  them.
- **Kernel-node touches added by analyze remediation**: `createServer` ctx gains `env`
  (T024, PR-2), named in the PR-2 checklist. The `createQueue` test seam the analyze pass
  proposed for T036 (U1) was dropped at the PR #89 review: T036 spies on the returned
  `app.queue.run` instead.
