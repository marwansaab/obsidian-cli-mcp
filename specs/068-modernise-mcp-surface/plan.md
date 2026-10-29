# Implementation Plan: Modernise MCP Surface

**Branch**: `068-modernise-mcp-surface` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/068-modernise-mcp-surface/spec.md`

## Summary

Release 0.9.0 brings the server into line with constitution v1.6.0. It ships as six PRs
in the order the owner set (spec Assumptions → Delivery slicing):

1. **Fixes on the current SDK**: A1 metadata refresh, A4 Windows CI, A5 vault
   containment.
2. **C2**: a passthrough denylist, off by default.
3. **A2 + C3**: SDK v2 `McpServer` + `registerTool`, served dual-era by `serveStdio`.
   The draft-07 parity normaliser goes, and the fingerprint gate is rebuilt on a real
   client view.
4. **B1 + B2 + C1**: titles and annotations, built-at-boot server instructions, and
   descriptions published (no stripping). The target-mode rules are written into those
   descriptions.
5. **B4 + B5**: `vaults` with a self-refreshing registry, and `outputSchema` +
   `structuredContent`.
6. **B3 + A3**: read-only mode, allow and deny lists, elicitation for the two
   irreversible actions, cancellation and progress. Version bump to 0.9.0.

Research forced three design choices:
- **R2**: an input-schema pass-through adapter. SDK v2 validates input itself and would
  replace the project's `{code, message, details}` envelope with free text.
- **R10**: the composition root is split from a cheap per-connection `McpServer` builder.
  `serveStdio` calls the factory more than once, and FR-053 needs one queue.
- **R12**: the project checks the client's elicitation capability itself. The SDK's own
  refusal (`-32021`) is not the B3-ruled envelope.

## Technical Context

**Language/Version**: TypeScript ~6.0.3 (ESM, NodeNext, strict, `types: ["node"]`
already set); Node.js ≥ 22.11 (unchanged; SDK v2 needs ≥ 20).

**Primary Dependencies**:
- `@modelcontextprotocol/sdk ^1.29.0` → `@modelcontextprotocol/server ^2.4.0` (PR 3, R1).
- New devDependency `@modelcontextprotocol/client ^2.4.0`, for tests and the stdio probe
  only.
- `zod ^4.4.3` (unchanged; v2 needs ≥ 4.2).

**Storage**: none. The fingerprint baseline `src/tools/_register-baseline.json` is
regenerated deliberately in PRs 3, 4 and 5 (R3).

**Testing**: `vitest run --coverage`, statements floor 96 (unchanged). Protocol tests run
in-process for both eras (R10). Real-stdio and live-vault probes run per the quickstart
under the `.memory/test-execution-instructions.md` gate.

**Target Platform**: Windows, macOS, Linux (stdio MCP server). CI: Ubuntu + Windows ×
Node 22, 24 (R14).

**Project Type**: single-package npm CLI / MCP stdio server.

**Performance Goals**: no new targets. Progress ticks follow the existing 750 ms launch
poll. A vault-name miss costs at most one extra `vaults verbose` call.

**Constraints**:
- Zero new top-level error codes (FR-056).
- Calls stay one at a time (FR-053).
- The error envelope is unchanged for both eras (FR-016).
- stdout carries MCP messages only.
- Typed tools' templated `eval` stays ungated (FR-013).
- No `oneOf` target-mode union (C1 ruling).
- No `requiresUserInteraction` marker (B3 ruling).
- The palette `command` and `plugin:reload` stay allowed (Q3 ruling).

**Scale/Scope**:
- 34 tools → 35.
- About 40 `src/tools/*/index.ts` description and registration edits (PR 4).
- 19 target-mode schemas share one description site.
- 5 SDK-touching files (PR 3).
- 4 metadata-refresh callers + 1 new.
- 1 containment function.
- 1 queue, 1 dispatch kill path, 1 launch loop, 1 commit loop (PR 6).

## Constitution Check

*GATE: evaluated pre-Phase-0 and re-evaluated after Phase 1 design. PASS, with no
violations and no Complexity Tracking entries. Per the Governance → Adoption of v1.6.0
paragraph, each PR closes the pending items it owns and MUST NOT add new
non-conformance. The per-PR column says what each PR's checklist records.*

| Gate | Status | Evidence |
|---|---|---|
| Principle I (Modular Code Organization) | **Y** | New modules follow one-directional imports: `src/instructions/` (R7) is imported by `server.ts` only; `src/tools/_confirm.ts` (R12) is imported by `delete` and `find_and_replace`; `src/tools/vaults/{schema,tool,handler}` plus `index.ts`, per the existing per-tool layout; the env-flag parser lives beside `autoLaunchEnabled` in `src/cli-adapter/_dispatch.ts` (R4). `server.ts` stays the composition root. No upward or cyclic imports. |
| Principle II (Public Surface Test Coverage) | **Y** | Every changed tool surface ships co-located happy-path and failure/boundary tests in the same PR. Registry-wide enforcement tests (titles, annotations, descriptions, outputSchema round-trip) and the fingerprint gate cover all 35 tools. The protocol is tested for both eras in-process (R10). |
| Principle III (Boundary Input Validation with Zod) | **Y** | zod stays the only runtime validator and the source of every published `inputSchema`/`outputSchema`. The R2 pass-through adapter delegates its JSON Schema to the zod schema and does no validation of its own. `z.infer` types are unchanged. `vaults` gets a zod input and output schema. |
| Principle IV (Explicit Upstream Error Propagation) | **Y** | No new top-level codes. New sub-codes: `COMMAND_BLOCKED`, `CONFIRMATION_DECLINED`, `CONFIRMATION_UNAVAILABLE` ([errors contract](contracts/errors.contract.md)). The metadata-refresh `catch {}` becomes a logged `metadataRefreshFailed` (no silent fallback). The cancelled-commit partial outcome is authorised by spec Clarifications Q1 and logged as `commitCancelled`. Cancellation and progress are honoured (PR 6). Tool failures stay `isError` results; unknown-tool `-32602` is FR-016's stated allowance. |
| Principle V (Attribution & Layered Composition) | **Y** | Every new file carries `// Original — no upstream.` with a one-line purpose. Headers are updated where a file's role changes (`_register.ts`, `server.ts`, `canonical.ts`, `_note-io.ts`). No borrowed code. |
| ADR-010 (Typed Tool Names Mirror CLI Subcommand) | **Y** (PR 5) / N/A elsewhere | The new tool wraps the single-word CLI subcommand `obsidian vaults` 1:1, so by rule 1 it is named `vaults` (owner ruling 2026-10-28; the brief's `list_vaults` is dropped everywhere). PR 5 renames the stub `docs/tools/list_vaults.md` → `docs/tools/vaults.md` and corrects `docs/tools/index.md:18` and the `docs/tools/help.md:65` example. No other tool is added or renamed. |
| ADR-013 (Plugin-Namespace Tool Naming) | **N/A** | No plugin-backed tool added. |
| ADR-014 (Plugin-Backed Runtime-Dependency Pattern) | **N/A** | No plugin-backed tool added. |
| ADR-015 (Sub-Discriminators) | **Y** (PR 2, 6) / N/A elsewhere | New pairs `VALIDATION_ERROR` / `COMMAND_BLOCKED` \| `CONFIRMATION_DECLINED` \| `CONFIRMATION_UNAVAILABLE`, carried in `details.code`. `CONFIRMATION_DECLINED` adds the `details.action` sub-state. |
| MCP standard (Technical Standards) | **Y** (closes in PR 3) | v2 packages only. `McpServer.registerTool`. No hand-written `tools/list`/`tools/call`. `serveStdio`, both eras. No Roots, Sampling or Logging capability; `listChanged: false` declared truthfully. |
| MCP Tool Surface Standards | **Y** (closes across PR 3, 4, 5) | Titles + four hints (PR 4). Descriptions not stripped, every parameter described, input rules visible in descriptions (PR 4, C1 ruling). Instructions (PR 4). `outputSchema` + identical text (PR 5). Spec FR-039 makes this a MUST with no era exceptions: union results are published as an object-root schema wrapping the variants (R6). Only results that are not structured objects (`read`, `help`, `obsidian_exec`, `tag`) carry none. SDK-native dialect with the gate kept (PR 3). Enforcement tests (PR 4, 5). PRs 1–2: N/A (pending B1/B2/B5/C1/C3); they change no descriptor. |
| Security Defaults | **Y** (closes across PR 1, 2, 6) | Nearest-existing-ancestor containment (PR 1). Escape hatches off by default with a README warning (PR 2). Read-only mode and allow/deny lists, plus elicitation, with refusal when the client cannot elicit (PR 6). |
| Cancellation & progress (Principle IV, v1.6.0) | **Y** (closes in PR 6) | R11. |
| CI on Linux and Windows | **Y** (closes in PR 1) | R14. |

**Technical Standards conformance**: TS strict and `tsc --noEmit` clean; eslint zero
warnings, with no `eslint-disable @typescript-eslint/no-deprecated` left for the SDK
(PR 3 acceptance); vitest + coverage-v8, floor 96 unchanged; Prettier unchanged; the
Node floor unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/068-modernise-mcp-surface/
├── spec.md
├── plan.md                    # this file
├── research.md                # R1–R15
├── data-model.md              # in-process values and wire shapes
├── quickstart.md              # per-PR validation, live probes, stdio probes
├── contracts/
│   ├── protocol-serving.contract.md   # both eras, tools/call outcomes, cancel, progress
│   ├── tool-surface.contract.md       # descriptor, titles/annotations, descriptions, results, gate
│   ├── configuration.contract.md      # the four env vars
│   └── errors.contract.md             # new sub-codes and stderr events
├── checklists/requirements.md
├── post-implement.md          # created at the end (structural verification)
└── tasks.md                   # /speckit-tasks
```

### Source Code (repository root)

```text
.github/workflows/ci.yml            PR1  matrix os × node, timeout 20 (R14)
src/path-safety/canonical.ts        PR1  nearest-existing-ancestor realpath (R5)
src/tools/_note-io.ts               PR1  invalidateMetadataCache(vault, relPath), logged failure (R13)
src/tools/{write_note,append_note,patch_heading,patch_block}/handler.ts
                                    PR1  pass vault + relPath; write_note open:true fix
src/tools/find_and_replace/handler.ts
                                    PR1  refresh per changed note · PR6 confirm, cancel, progress
src/logger.ts                       PR1  metadataRefreshFailed · PR6 commitCancelled
src/env-flags.ts                    PR2  envFlagEnabled() (moved out of _dispatch.ts in the PR #88 review)
src/cli-adapter/_dispatch.ts        PR6  abort→killChild, launch progress
src/tools/obsidian_exec/{handler,index}.ts
                                    PR2  denylist gate before invokeBoundedCli (R4)
src/cli-adapter/invoke-bounded-cli.ts
                                    PR6  dead clamp removed
package.json / package-lock.json    PR3  sdk → server ^2.4.0, client ^2.4.0 (dev) · PR6 version 0.9.0
src/server.ts                       PR3  composition root + buildMcpServer(era) (R10) · PR4 instructions · PR6 filtering
src/index.ts                        PR3  serveStdio(ctx => app.buildMcpServer(ctx.era))
src/tools/_register.ts              PR3  McpServer.registerTool + pass-through adapter (R2) · PR4 title/annotations, no strip · PR5 outputSchema/structuredContent · PR6 per-call signal/progress
src/tools/_shared.ts                PR3  toMcpInputSchema + normalizeToDraft7Parity deleted
src/tools/_register-baseline.ts     PR3  fingerprint via Client + InMemoryTransport (R3)
scripts/write-register-baseline.ts  PR3  reuse the helper
scripts/probe-stdio.ts              PR3  new: real-stdio probe, both handshakes (quickstart §3)
src/tools/_register-baseline.json   PR3/4/5  regenerated deliberately
src/help/strip-schema{,.test}.ts    PR4  deleted (R8)
src/target-mode/target-mode.ts      PR4  rule-bearing .describe() text
src/tools/*/schema.ts, */index.ts   PR4  descriptions on every property; titles; annotations; description rewrites
src/instructions/{instructions,instructions.test}.ts
                                    PR4  new (R7)
src/vault-registry/registry.ts      PR5  re-probe once on miss; message fix (R9)
src/tools/vaults/              PR5  new tool (schema, handler, index, tests)
docs/tools/list_vaults.md → docs/tools/vaults.md (rename + real doc), docs/tools/index.md, docs/tools/help.md
                                    PR5  real doc replaces the stub
src/queue.ts                        PR6  run(task, {signal})
src/tools/_confirm.ts               PR6  new: capability check + elicitation helper (R12)
src/tools/delete/handler.ts         PR6  confirm when permanent
README.md                           PR2 ALLOW_EVAL · PR5 vaults line · PR6 READ_ONLY/TOOLS/DISABLE
.decisions/ADR-039 …, ADR-040 …, Decision Log.md
                                    PR3 / PR4 (R15)
```

**Structure Decision**: the existing single-package layout is kept. No file moves. The
new modules are `src/instructions/`, `src/tools/_confirm.ts`, `src/tools/vaults/` and
`scripts/probe-stdio.ts`. The one structural change is inside `server.ts`: the
composition root (once per process) is separated from `buildMcpServer(era)` (once per
`serveStdio` factory call).

### Graphify structural check

Queries run at plan time (2026-10-28, AST graph at HEAD) with `graphify explain` and
`graphify path`.

- **Kernel nodes. This plan touches three of the four; reviewer attention is warranted
  in PRs 1, 3 and 6:**
  - `createServer()` (src/server.ts) is **restructured** in PR 3 (R10). It stays the
    boot-spine entry and the sole caller of `createLogger()`/`createQueue()`, but becomes
    a composition root that returns a per-connection builder. The graph shows it calling
    all 34 `createXTool()` factories, `assertToolDocsExist()`, `invokeCli()` (registry
    probe) and `asToolError()`. Every one of those edges survives; the `asToolError`
    edge moves into `_register.ts`. PRs 4 and 6 add instructions and filtering here.
    Its `ctx` also gains two fields:
    - `ctx.env` (PR 2, T024): the environment the access flags are read from;
      `process.env` when absent.
    - `ctx.createQueue` (PR 3, T036): a test seam, defaulting to `createQueue`. It lets a
      test prove that repeated `buildMcpServer` calls share one queue. `server.ts`
      remains the only production caller of the real factory.

    Both are kernel-node touches and are named in those PRs' checklists for reviewer
    attention.
  - `createQueue()` (src/queue.ts) gets an **API extension** in PR 6:
    `run(task, {signal})`. It is among the top god-nodes. The graph links it to
    `createServer()` and to the handler test cohort that builds real queues
    (`_dispatch.test.ts`, `cli-adapter.test.ts`, `prepend`, `append_note`, `patch_*`,
    `write_note`, `find_and_replace`, `query_base` and others). The extension is
    additive (an optional second argument), so existing callers and tests compile
    unchanged.
  - `createLogger()` (src/logger.ts) gets **two new typed events** (PR 1
    `metadataRefreshFailed`, PR 6 `commitCancelled`). This is additive to the `Logger`
    interface. Test doubles that implement `Logger` in full must add the two methods.
  - `UpstreamError` (src/errors.ts) is **not modified**. Only new `details.code` values
    are used (Principle IV streak kept).
- **Kernel-adjacent, high blast radius:**
  - `registerTool()` (src/tools/_register.ts, its own community, among the highest-degree
    production nodes) is **rewritten** across PRs 3–6. Every tool's `index.ts` reaches it.
  - `toMcpInputSchema()` (registerTool community) and `normalizeToDraft7Parity()` (in the
    "Tech stack" community, from 067) are **deleted** in PR 3.
  - `stripSchemaDescriptions()` (src/help/strip-schema.ts, its own community) has exactly
    one production caller, `registerTool()` at `_register.ts:37`. Its other graph edges
    are prose references from earlier specs. It is deleted in PR 4.
- **Communities affected**:
  - boot spine (`server.ts`, `_register.ts`, `_shared.ts`, `index.ts`);
  - runtime spine (`_dispatch.ts`, `cli-adapter.ts`, `queue.ts`, `invoke-bounded-cli.ts`);
  - path safety (`canonical.ts`, which the graph reaches from `write_note/handler.ts`
    only through shared `node:path` imports, so the containment change does not ripple
    through handler code);
  - note I/O (`invalidateMetadataCache()` sits in the `patch_block/handler.ts`
    community, with 4 production callers);
  - `registry.ts` (imported by `server.ts`, `find_and_replace/handler.ts` and
    `_active-file.ts`);
  - the per-tool communities (every `index.ts`, the 19 target-mode schemas);
  - `createObsidianExecTool`, which is its own community; the gate stays inside it,
    away from the shared dispatch.
- **Structural paths that tasks must respect**:
  - `invokeCli()` → `cli-adapter.ts` → `queue.ts` → `createQueue()`, so cancellation
    must be threaded through `invokeCli`'s deps to `queue.run`.
  - The `find_and_replace` commit loop calls `queue.run(writeAtomic)` directly
    (`handler.ts:650`), outside `invokeCli`, so it gets the signal separately.
- **Post-implement verification hooks**:
  - no new error-class nodes outside `src/errors.ts`;
  - no production handler imports `createLogger`/`createQueue`;
  - `src/instructions/` lands in or next to the boot-spine community;
  - `_confirm.ts` lands with `delete`/`find_and_replace`;
  - `vaults` lands with `registry.ts`;
  - no orphaned production file (`scripts/probe-stdio.ts` is a script and is allowed to
    be weakly connected).

## Delivery sequence and per-PR gates

| PR | Items | Spec stories | Ships when (in addition to `tsc --noEmit`, `eslint .` zero warnings, `vitest run --coverage` ≥ 96, Ubuntu + Windows CI green) |
|---|---|---|---|
| 1 | A1, A4, A5 | US1, US2, US10 | T0 live probe shows the stale-metadata defect before the fix and its absence after, for write_note / append_note / patch_heading / find_and_replace commit; the containment tests (symlink with existing and new child, junction, mixed-case root, `..`, prefix sibling) pass on both OSes |
| 2 | C2 | US3 | each denylisted command → `COMMAND_BLOCKED` with 0 spawns; the flag re-enables; all typed-tool eval tests unchanged; README warning |
| 3 | A2, C3 | US4, US5, US9 | no `@modelcontextprotocol/sdk` import and no SDK `no-deprecated` disable; both-era in-process tests; `probe-stdio` lists 34 tools for both handshakes; Claude Code calls `read` and `write_note` on the test vault; the baseline regenerated and the gate proven to fail on a deliberate edit; ADR-039; dependency justification in the PR body |
| 4 | B1, B2, C1 | US6, US7, US8 | enforcement tests; instructions tests; the baseline regenerated; ADR-040 |
| 5 | B4, B5 | US11, US12 | `vaults` tests; registry refresh tests; outputSchema round-trip test; R6 T0; the baseline regenerated (35 tools) |
| 6 | B3, A3 | US13–US16 | config, filter and confirmation tests (confirm / decline / cancel / unavailable × 2 actions); cancel-queued / cancel-running / cancel-mid-commit; progress with and without a token; version 0.9.0 |

Each PR follows `/speckit-implement → /speckit-git-commit → open PR → /code-review +
fixes → /speckit-docs-as-code <n> → merge`. After PR 6 merges: `/graphify --update` and
the post-implement structural check (CLAUDE.md), recorded in `post-implement.md`.

## Complexity Tracking

No constitutional violations; the table is intentionally empty. (The provisional
ADR-010 deviation was resolved by the owner's 2026-10-28 ruling to name the tool
`vaults`.)

## Follow-ups outside this feature's code

- **Constitution v1.6.0 Sync Impact Report** still says `list_vaults` (B4 line, around
  `.specify/memory/constitution.md:133`). The A2 amendment PR (#86) has already merged,
  so this goes to the owner. The suggested fix is to fold it into the post-release PATCH
  amendment that removes "Adoption of v1.6.0" (research R15).
- **Vault Architecture page**: its `list_vaults` mention is flagged on the BI-0165 note for
  when B4 ships (owner side).
