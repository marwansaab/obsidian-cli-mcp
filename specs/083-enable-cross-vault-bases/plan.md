# Implementation Plan: Enable cross-vault Bases

**Branch**: `083-enable-cross-vault-bases` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/083-enable-cross-vault-bases/spec.md`

> **This change makes `bases`, open-mode `views_base` and `create_base` honour the `vault` they already accept.** Plan-time live probes (research P1–P9) show that all three CLI subcommands route on `vault=`, so the wrapper only has to pass the name through, pre-check it against the vault registry, and (for `create_base`) run the owner's containment checks. No input field, output field or error code is added. With `vault` omitted, all three behave byte-for-byte as today.

## Summary

The three handlers discard `vault`: `bases` and `views_base` spawn in `active` mode, and `create_base` spawns in `specific` mode with no `vault` (research F1–F3). The plan:

- **D1 (route)**: with `vault`, spawn the native subcommand with `target_mode:"specific"` and `vault`. Without it, the argv is unchanged.
- **D2 (typed unknown vault)**: `resolveVaultRootOrRemap` runs before any spawn, giving `VAULT_NOT_FOUND`/`unknown` with zero spawns. `bases` and `create_base` gain a required `vaultRegistry`, and `server.ts` passes the one it already builds.
- **D3 (`views_base`)**: `listFocusedViews` takes the vault in both modes. Open mode gains the pre-check. Named mode's focus step is unchanged.
- **D4 (attribution)**: `not-open` and `create_base`'s `BASE_NOT_FOUND` gain `details.vault`, only when a vault is named.
- **D5 (`create_base` containment, Clarifications Q1 and Q4)**:
  - before creating: realpath-check `base_path`, run a frozen `ITEM_FOLDER_TEMPLATE` eval in the named vault (folder filter, else new-note parent), then realpath-check the derived folder joined with `dirname(name)`;
  - after creating: realpath-check the `Created:` path as a backstop, which reports with `createdPath` and never deletes.
- **D6 (`fs` seam)**, **D7 (focus classification and a T0 re-probe of `base:create`)**, **D8 (published surface and baseline)**, **D9 (tests, and the `makeQueuedSpawn` migration)**.

The behaviour, row by row, is in [contracts/bases-cross-vault-contract.md](contracts/bases-cross-vault-contract.md).

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. Unchanged.

**Primary Dependencies**: `@modelcontextprotocol/server` (SDK v2), `zod` 4. **No new dependency.** The YAML of the `.base` file is parsed inside Obsidian by the eval template (research F7).

**Storage**: none. The wrapper writes nothing itself; the CLI creates the item.

**Testing**: `vitest run`, with co-located `*.test.ts` files, run through PowerShell. A live T0 against `TestVault-Obsidian-CLI-MCP` is covered in quickstart §3.

**Target Platform**: Windows, macOS and Linux; CI runs on Linux and Windows. The realpath checks use `node:path`, so separators are handled per platform, and tests use `resolve()`-based roots, as `canonical.test.ts` does.

**Project Type**: single project, an MCP server (`src/**`).

**Performance Goals**: none.
- A named-vault call adds one in-memory registry lookup, which re-probes only on a miss.
- `create_base` with a vault adds one eval spawn and up to three `realpath` walks.

**Constraints**:
- FR-011: the default path is byte-identical.
- No new top-level code and no new `details.reason` (Principle IV, ADR-015).
- The backstop never deletes (Q4).
- No per-tool closed-vault stage (`.memory/refactor-decisions.md` check 1).
- The shared helpers in `_active-file.ts` are reused and never re-rolled.

**Scale/Scope**:
- **Changed code**:
  - `src/tools/bases/{handler,index,schema}.ts`;
  - `src/tools/views_base/{handler,index,schema}.ts`;
  - `src/tools/create_base/{handler,index,schema}.ts`;
  - new `src/tools/create_base/_template.ts`;
  - `src/server.ts` (two factory calls);
  - `src/tools/_typed-result-fixtures.ts` (two builders).
- **Tests**:
  - `bases/{handler,index,schema}.test.ts`;
  - `views_base/{handler,index}.test.ts`;
  - `create_base/{handler,index,schema}.test.ts`;
  - new `create_base/_template.test.ts`.
- **Docs**:
  - `docs/tools/{bases,views_base,create_base}.md`;
  - `CHANGELOG.md`;
  - `src/tools/_register-baseline.json` (regenerated);
  - the `CLAUDE.md` plan pointer.

**Resolved unknowns**: none open. Research P1–P9, F1–F7 and D1–D9 settle everything. D7 carries one implement-phase T0 re-probe (focus on `base:create`), with both outcomes pre-decided.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | No new module beyond `create_base/_template.ts`, the same per-tool `_template.ts` layout `views_base` uses. Every new import runs tool → shared (`_active-file.ts`, `_shared.ts`, `cli-adapter`, `vault-registry` types). There is no tool → tool edge: the new template copies no sibling and uses only the shared `B64_PAYLOAD_DECODE_EXPR`. `server.ts` passes an existing dep; nothing calls upward. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | The three tools change behaviour and descriptions. Each contract row (B1–B4, V1–V9, C1–C12, T-bytes, §5) lands in the tool's co-located `*.test.ts` in the same change: the happy path (B2, V2, C2), the failure and boundary cases (B3, V3, V5, V9, C3–C10, C12) and the default-path no-regression rows (B1, V1, V7, V8, C1). |
| **III. Boundary Input Validation with Zod** | **Y** | No input schema change beyond `.describe()` text. The internal eval envelope is a Zod `discriminatedUnion` (`itemFolderEvalResponseSchema`), decoded by the shared `decodeEvalEnvelope`. No hand-rolled shape check. |
| **IV. Explicit Upstream Error Propagation** | **Y** | Only existing codes are used (`CLI_REPORTED_ERROR` with `VAULT_NOT_FOUND` / `BASE_NOT_FOUND`, and `PATH_ESCAPES_VAULT`), and `details` grows by additive keys only. The backstop reports the written item instead of hiding it (Q4). There is no silent fallback: an unregistered vault never reaches the front vault. Cancellation and progress flow through the unchanged `invokeCli` / `invokeEval` deps. |
| **V. Attribution & Layered Composition** | **Y** | The new `_template.ts` and `_template.test.ts` carry `// Original — no upstream.` headers. Edited files keep their headers, and intent lines are updated where the "ignored" claim was stated (`views_base/handler.ts` header "T0 P2"). |
| **ADR-009** (vault registry, containment §2) | **Y** | The registry resolves the root, and `assertCanonicalPath` does the realpath containment, as in `query_base` and `prepend`. |
| **ADR-010 / ADR-013 / ADR-014** | **N/A** | No tool is added or renamed, and no plugin-backed tool is involved. |
| **ADR-015** (sub-discriminators) | **Y** | No new `reason`. The added `vault` / `createdPath` keys are attribution, not discriminators. |
| **ADR-029 / ADR-030 / ADR-031** (closed vault) | **Y** | Recovery is inherited through `dispatchCli`. No per-tool closed-vault stage (Clarifications Q3). |
| **ADR-040** (published descriptions) | **Y** | The `vault` parameter descriptions are rewritten to match the behaviour, and the descriptions carry `closedVaultNote`. |
| **ADR-046** (shared parameter names) | **Y** | No parameter renamed. |
| **MCP Tool Surface Standards** | **Y** | Titles and annotations are unchanged: `create_base` keeps its write hints, the other two stay read-only. Output schemas are unchanged. The description and input fingerprints of exactly three tools move through `npm run baseline:write` (quickstart §2). |
| **Security Defaults** | **Y** | Vault containment of writes: when a vault is named, `create_base` realpath-checks `base_path` and the derived item folder before creating, and the created path after (Q1, Q4). The no-vault gap predates this change, and by the owner's ruling it is a recorded follow-up. Under the constitution's "Adoption of v1.6.0" paragraph, a PR is not in violation for non-conformance it did not introduce. This PR adds none, and its compliance checklist records the entry as `Y (named vault); default-path containment pre-existing, follow-up`. The fixed eval template with a base64 payload is exempt from the escape-hatch rule. There are no new modes. |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**Kernel-node attention (per CLAUDE.md)**: `createServer()` (`src/server.ts`) is touched. Two factory calls in its tool list gain the `vaultRegistry` that `createServer` already constructs and already passes to `createViewsBaseTool` / `createQueryBaseTool`. No new construction happens. `createLogger()` and `createQueue()` are not edited and gain no new caller. `UpstreamError` is constructed in handlers as today; `src/errors.ts` is unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/083-enable-cross-vault-bases/
├── plan.md                                  # This file
├── research.md                              # P1–P9 live probes, F1–F7 code findings, D1–D9 decisions
├── data-model.md                            # E1 vault target, E2 item-folder envelope, E3 details; V1–V6
├── quickstart.md                            # automated gate, baseline gate, live T0 (L1–L8)
├── contracts/
│   └── bases-cross-vault-contract.md        # §1 B1–B4, §2 V1–V9, §3 C1–C12, §4 T1–T5, §5 surface
├── checklists/requirements.md
└── tasks.md                                 # Phase 2: /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
src/server.ts                                # createBasesTool / createCreateBaseTool get { vaultRegistry }
src/tools/_typed-result-fixtures.ts          # the two builders get vaultRegistry: registryAt(...)
src/tools/bases/handler.ts                   # ExecuteDeps.vaultRegistry; pre-check + vault routing (D1, D2)
src/tools/bases/index.ts                     # BASES_DESCRIPTION: routed vault, VAULT_NOT_FOUND, closedVaultNote("bases")
src/tools/bases/schema.ts                    # vault .describe()
src/tools/bases/{handler,index,schema}.test.ts
src/tools/views_base/handler.ts              # open-mode pre-check; listFocusedViews(deps, basePath, vault); not-open details.vault; header
src/tools/views_base/index.ts                # VIEWS_BASE_DESCRIPTION vault paragraph + closedVaultNote("base:views")
src/tools/views_base/schema.ts               # vault .describe()
src/tools/views_base/{handler,index}.test.ts
src/tools/create_base/_template.ts           # NEW: frozen ITEM_FOLDER_TEMPLATE (D5)
src/tools/create_base/_template.test.ts      # NEW: byte pin + placeholder present
src/tools/create_base/handler.ts             # ExecuteDeps.vaultRegistry + fs?; named-vault pipeline stages 1–6
src/tools/create_base/index.ts               # CREATE_BASE_DESCRIPTION + closedVaultNote("base:create")
src/tools/create_base/schema.ts              # vault .describe(); itemFolderEvalResponseSchema (internal)
src/tools/create_base/{handler,index,schema}.test.ts   # handler.test.ts migrates to makeQueuedSpawn (D9)
src/tools/_register-baseline.json            # regenerated (three tools)
docs/tools/{bases,views_base,create_base}.md # routing sections, error rows, examples
CHANGELOG.md                                 # [Unreleased] spec line + Fixed/Changed entries
CLAUDE.md                                    # plan pointer → this plan

# UNCHANGED: src/tools/query_base/**, src/tools/_active-file.ts, src/path-safety/**,
#   src/cli-adapter/**, src/vault-registry/**, src/errors.ts, src/tools/_register.ts, src/tools/_shared.ts
```

**Structure Decision**: single project. Every change stays inside the three tools' own directories, plus the composition root's dep wiring. The shared helpers are consumed, not edited.

**Test-edit scope** (per `.memory/refactor-decisions.md` check 5; the required `vaultRegistry` forces these):
- `bases/index.test.ts` and `bases/handler.test.ts`: `makeDeps` / factory calls add a `vaultRegistry` stub.
- `create_base/index.test.ts` and `create_base/handler.test.ts`: the same, plus the `makeQueuedSpawn` migration.
- `_typed-result-fixtures.ts`: `registryAt(...)` on the two builders.

No assertion on existing default-path behaviour changes.

**Docs-as-code**: `.docs-as-code/` pages that describe the Bases family's vault handling are updated by `/speckit-docs-as-code <n>` after review, per the PR lifecycle in CLAUDE.md.

## Phase 0: Research → research.md

- **P1–P9**: plan-time live probes.
  - All three subcommands honour `vault=` and are focus-free when the vault is open; a closed vault comes to the front on cold-open.
  - The unknown-vault answer is untyped at the adapter.
  - Obsidian picks the item folder (folder filter, or new-note location), and `Created:` reports the vault-relative path.
  - `name` folder segments are joined into the item path, and no API reports the folder in advance.
- **F1–F7**: code findings (CodeGraph).
- **D1–D9**: decisions, as summarised above.
- **Follow-ups**: four items.

**Output**: research.md, with no `NEEDS CLARIFICATION` remaining.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)**: E1 vault target, E2 the internal item-folder envelope, E3 the `details` deltas; invariants V1–V6.
- **[contracts/bases-cross-vault-contract.md](contracts/bases-cross-vault-contract.md)**: per-tool rows with spawn counts and argv shapes, the template rows, and the published-surface table.
- **[quickstart.md](quickstart.md)**: the automated gate, the baseline gate (three entries move), and the live T0 L1–L8 (L8: closed vault), including the root-write caution from P6.
- **Agent context**: the `CLAUDE.md` plan pointer is updated to this plan, through the mandatory `after_plan` hook.

## Phase 1 re-check (post-design Constitution Check)

- **I**: one new per-tool file; no new cross-module edge.
- **II**: every contract row maps to a co-located test in the same change.
- **III**: the envelope is decoded through Zod.
- **IV**: existing codes only, with additive `details` keys.
- **V**: headers present.
- **Security Defaults**: named-vault writes are contained before creation, with a reporting backstop after.
- **MCP Tool Surface Standards**: three entries move deliberately.

**No gate regressed; Complexity Tracking is empty.**

### Spec alignment note

- **FR-006 / D4**: a named vault with no file open at all returns the same generic `CLI_REPORTED_ERROR` (`Error: No active file.`) the default path returns for that state today. `not-open` covers the "a file is active but it is not a Base" state. FR-006, US3 scenario 2 and the Edge Cases now say this explicitly (analysis A1).
- **FR-013 / D3**: named-mode `views_base`'s results, errors and focus step are unchanged. Its second spawn now carries `vault=`. That is an argv-level difference with no behavioural one, and FR-013 now permits it explicitly (analysis I1).
- **FR-004b / SC-006**: the closed-vault path is inherited, not new code. It is checked live by T040's closed-vault step, with research P2 as the plan-time evidence (analysis G1).
- **FR-004a / D7**: the "front vault unchanged" assertion is a live check (quickstart L1, L2, L4); in-process tests cannot observe focus.
- **SC-004a backstop**: C9 is exercised in-process through the `fs.realpath` seam. A live escape would need a symlink out of the test vault plus a folder filter pointing through it, which the path-traversal protocol stages only on request.

### CodeGraph structural check

Run with `codegraph_explore` at plan time (HEAD `684adf5`).

**Affected symbols and blast radius**:

- `executeBases` (`src/tools/bases/handler.ts:17`): called by `createBasesTool` (`bases/index.ts`), which `src/server.ts` and `_typed-result-fixtures.ts` call. Tested by `bases/handler.test.ts`; the factory is covered by `bases/index.test.ts` and `_surface.test.ts`.
- `executeViewsBase` and `listFocusedViews` (`src/tools/views_base/handler.ts:182`, `:154`): called by `createViewsBaseTool`, which `server.ts`, `_typed-result-fixtures.ts` and `_plugin-noise.test.ts` call. Tested by `views_base/handler.test.ts`.
- `executeCreateBase` (`src/tools/create_base/handler.ts:29`): called by `createCreateBaseTool`, which `server.ts` and `_typed-result-fixtures.ts` call. Tested by `create_base/handler.test.ts` and `index.test.ts`.
- `BASES_DESCRIPTION`, `VIEWS_BASE_DESCRIPTION`, `CREATE_BASE_DESCRIPTION`: fingerprinted in `_register-baseline.json`, and asserted by each tool's `index.test.ts`. `VIEWS_BASE_DESCRIPTION` is also read by `_file-type-support.test.ts`, which checks only the file-type sentence and is unaffected.
- Consumed, not edited: `resolveVaultRootOrRemap` (`_active-file.ts:292`), `assertCanonicalPath` (`:325`, among the most-depended-on helpers in the write cohort), `decodeEvalEnvelope` (`:66`), `composeEvalCode` / `closedVaultNote` (`_shared.ts`), `invokeCli` / `invokeEval` (`cli-adapter.ts`).

**Kernel-node touch surface**: `createServer()` is touched, and only to wire an existing dep into two existing factory calls. That is high blast radius by position, minimal by content, and reviewers should confirm no other line of `server.ts` moves. `createLogger()`, `createQueue()` and `UpstreamError` are not edited.

**Post-implement structural verification** (after `codegraph sync`):

1. There is no new error class or code, and `src/errors.ts` is unchanged. Every new failure is an `UpstreamError` with an existing code.
2. No handler imports `createLogger` / `createQueue` / `createVaultRegistry`. `vaultRegistry` arrives through `ExecuteDeps` from `server.ts`.
3. `ITEM_FOLDER_TEMPLATE` is imported only by `create_base/handler.ts` and its test. `create_base` imports no sibling tool module.
4. The new symbols (`ITEM_FOLDER_TEMPLATE`, `itemFolderEvalResponseSchema`, the derived-folder helper) are reachable from `executeCreateBase`, so none is orphaned.

## Follow-ups (out of scope)

- **`create_base` response path**: built as `<baseDir>/<baseName>/<created>` (`handler.ts:91-95`), which is wrong for both observed shapes (research P6).
- **`create_base` containment with no vault named** (Clarifications Q1).
- **Raw `ENOENT`** when a Base's filter folder is missing (P8).
- **`name` folder segments** are not rejected at validation (P7). They are contained on the named path only.

## Complexity Tracking

> No Constitution Check violations; the table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
