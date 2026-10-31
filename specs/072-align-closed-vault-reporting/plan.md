# Implementation Plan: Align Closed-Vault Reporting

**Branch**: `072-align-closed-vault-reporting` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/072-align-closed-vault-reporting/spec.md`

> **Modify six existing typed tools and delete one shared module.** No new tool, schema field, error code, sub-reason, classifier or dependency. The change removes code and documentation. The only new text is the documented name of an existing failure.

## Summary

Six read tools (`paths`, `tag`, `pattern_search`, `query_base`, `smart_connections_query`, `smart_connections_similar`) each carry a stage that, on empty stdout for a named vault, spawns `obsidian vaults verbose`. If the vault is listed, the stage throws `CLI_REPORTED_ERROR` / `VAULT_NOT_FOUND` / `not-open` with retry advice. That empty-stdout signal comes from the GUI executable, not from the shim the server drives. Through the shim, a closed vault answers `Error: Command "…" not found.`, which the ADR-029 cold-start retry already handles. So the stage never fires, and the documented `not-open` failure is never produced ([research.md](research.md) F1–F2).

**Primary requirements** (spec after clarify Q1):
- a closed vault recovers through the shared retry (FR-001);
- an unrecoverable vault surfaces as the existing post-retry `CLI_REPORTED_ERROR`, now documented as "vault unavailable" (FR-002), with no new code, sub-reason or classifier and no change to dispatch, the retry or `obsidian_exec` (FR-003);
- the unknown-vault failure is unchanged (FR-004);
- the per-tool detection and the shared module are removed (FR-005, FR-006);
- an empty answer is still a structured failure (FR-007);
- descriptions and pages are corrected (FR-008, FR-009), with `views_base` left alone (FR-010);
- tests (FR-011) and a changelog entry (FR-012).

**Technical approach**:

- **D1/D2**: Delete the closed-vault block and the `detectIfClosed` import from the six handlers, and delete `src/tools/_eval-vault-closed-detection/` with its two test files. Nothing replaces them. An empty answer falls through to each handler's existing `json-parse` failure (F3).
- **D3**: Vault unavailable is `CLI_REPORTED_ERROR` whose `details.stdout` begins `Error: Command "<cmd>" not found.`. It reaches the caller unchanged in all six tools, including `query_base`, whose `classifyAndThrow` matches none of that text (F4).
- **D4/D5**: Each tool's description loses its `not-open` text and gains one vault-unavailable sentence. Six reference pages get a "Closed vault" note and a vault-unavailable row. `find_and_replace.md` and `patch_block.md` lose their unreachable `not-open` entry. The baseline is regenerated (six description fingerprints move). Exact text: [contracts/closed-vault-contract.md](contracts/closed-vault-contract.md).
- **D6**: Retire the tests that pin `not-open`. Add three cases per handler, all through the real retry with a mock spawn: recovers, unavailable, and empty answer.
- **D7**: A changelog `[Unreleased]` entry, and updated intent lines in the six handler headers.

**T0 gate** ([contracts/t0-probe-plan.md](contracts/t0-probe-plan.md)): G1, at implement time, must pass before any deletion. G2 is optional live evidence.

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11. Unchanged.
**Primary Dependencies**: `zod` 4, `@modelcontextprotocol/server` (SDK v2). Unchanged. Reused in tests: `COLD_START_PATTERN` from `src/cli-adapter/_dispatch.ts` (already exported for tests). **No new dependency.**
**Storage**: N/A (read-only tools).
**Testing**: `vitest run`, co-located `*.test.ts`. Handler tests drive the real `invokeCli` → `dispatchCli` → cold-start retry through the existing `spawnFn` seam. `index.test.ts` asserts the description text. Live evidence comes from T0 G1.
**Target Platform**: Windows (reference, probed), macOS and Linux. CI runs on Linux and Windows.
**Project Type**: Single project, an MCP server (`src/**`).
**Performance Goals**: An empty answer no longer triggers a second `vaults verbose` spawn, so there is one fewer spawn on that path. No other change.
**Constraints**:
- zero new error codes or sub-reasons (Principle IV, Q1);
- input and output schemas unchanged (Principle III);
- unknown-vault failures byte-stable (SC-003);
- no edit to `src/cli-adapter/**`.

**Scale/Scope**:
- **Six tool modules**: `handler.ts`, `handler.test.ts`, `index.ts` and `index.test.ts` in each.
- **One module deleted.**
- **Eight `docs/tools/*.md` pages.**
- **`CHANGELOG.md`.**
- **`src/tools/_register-baseline.json`**, regenerated.

**Resolved unknowns**: all (research F1–F5, D1–D7; Clarifications Q1). Remaining: implement-time T0 G1, which has a stop-and-escalate fallback.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | Edits stay inside each tool's own module. The only cross-module edge, six handlers → `_eval-vault-closed-detection`, is removed together with the module. No new import edge or module. The handlers keep their imports of `cli-adapter`, `errors` and `_shared`. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | Each of the six tools ships, in the same change, happy-path tests (closed vault recovers) and failure tests (vault unavailable, empty answer, unknown vault kept) in co-located `handler.test.ts`, plus description assertions in `index.test.ts`. Tests that pinned the retired path are removed along with it. |
| **III. Boundary Input Validation with Zod** | **Y** | No schema touched. Envelope parsing (`*EvalEnvelopeSchema` / `queryBaseWireSchema`) is unchanged. |
| **IV. Explicit Upstream Error Propagation** | **Y** | No error code, sub-reason or class added. The vault-unavailable outcome is the existing `UpstreamError` propagated unchanged, so nothing is swallowed. An empty answer still fails loudly (`json-parse`) and never returns an empty success. One `UpstreamError` construction site is removed per handler. |
| **V. Attribution & Layered Composition** | **Y** | The six handlers keep their `Original — no upstream.` headers, with the intent line updated to drop the stage-0 / shared-module wording. The deleted files take their headers with them. |
| **ADR-010** | **N/A** | No new or renamed tool. |
| **ADR-013 / ADR-014** | **Y** | The plugin-backed tools (`smart_connections_*`) keep their plugin-lifecycle stage order. Only the stage before it, which never ran, is removed. The `NOT_INSTALLED` / `NOT_READY` precedence is unchanged. |
| **ADR-015** (sub-discriminators) | **Y** | No sub-reason defined. The never-emitted `VAULT_NOT_FOUND` / `not-open` pair is withdrawn from six tools' documentation, as `open_file` did before (its handler header records "reason:"not-open" retires from emission, ADR-015 additive-only"). The multi-state sub-reason rule stays (FR-010). |
| **ADR-029** (cold-start retry) | **Y** | Relied on, not changed. |
| **MCP Tool Surface Standards** | **Y** | Six descriptions reworded so that they state reachable failures only. Titles, annotations, parameter descriptions, output schemas and server instructions are unchanged. The baseline is regenerated deliberately, and the reviewer checks that only the six `descriptionFingerprint` values moved. |
| **Security Defaults** | **N/A** | Read-only tools. No write path, escape hatch (`obsidian_exec` is untouched) or elicitation involved. |

**No `N` verdicts, so no Complexity Tracking entry is required.**

**Kernel-node attention (per CLAUDE.md)**: `createServer`, `createLogger` and `createQueue` are not touched. `UpstreamError` loses six construction sites (one per handler's retired stage) and gains none. The class itself, `src/errors.ts` and its code list do not change. This is a reduction of edges into the error-spine value type, not a change to it.

**ADR note**: no new ADR. This applies ADR-029 (the retry already covers a closed vault) and ADR-015 (the additive-only definition stays; a never-emitted value is withdrawn, following the `open_file` precedent). It is not a deliberate supersession.

## Project Structure

### Documentation (this feature)

```text
specs/072-align-closed-vault-reporting/
├── plan.md                          # This file
├── research.md                      # Findings F1–F5, decisions D1–D7
├── data-model.md                    # Vault states → outcomes; retired shape
├── quickstart.md                    # Automated gate + per-story checks
├── contracts/
│   ├── closed-vault-contract.md     # Outcomes table, description sentence, page row, baseline expectation
│   └── t0-probe-plan.md             # G1 (blocking), G2 (optional)
├── checklists/requirements.md
└── tasks.md                         # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
src/tools/{paths,tag,pattern_search,query_base,smart_connections_query,smart_connections_similar}/
├── handler.ts          # remove closed-vault stage + detectIfClosed import; header intent line
├── handler.test.ts     # remove not-open / precedence / ripple cases; add recovers, unavailable, empty-answer cases
├── index.ts            # remove not-open text; add vault-unavailable sentence
└── index.test.ts       # assert new sentence, absence of not-open; smart_connections_* docs-body assertions updated
src/tools/_eval-vault-closed-detection/   # DELETED (detector.ts, registry-parser.ts, index.ts, two test files)
src/tools/_register-baseline.json         # regenerated; six descriptionFingerprint values move
docs/tools/{paths,tag,pattern_search,query_base,smart_connections_query,smart_connections_similar}.md
docs/tools/find_and_replace.md            # not-open row removed
docs/tools/patch_block.md                 # not-open sub-reason removed
CHANGELOG.md                              # [Unreleased] Changed + Removed

# UNCHANGED: src/cli-adapter/** (dispatch, COLD_START_PATTERN, retry, auto-launch),
#   src/errors.ts, src/server.ts, src/tools/_register.ts, src/vault-registry/**,
#   src/tools/_active-file.ts (remapVaultNotFound), src/tools/obsidian_exec/**,
#   src/tools/views_base/**, src/tools/open_file/**, README.md, server instructions
```

**Structure Decision**: Single project. Code changes stay inside the six existing tool modules, plus the deletion of the module only they used.

**Docs-as-code**: `.docs-as-code/` pages that describe `not-open` (`architecture.md` around the "registered-but-closed vault answers `eval` with empty stdout" note, `capabilities/search-and-discovery.md`, `capabilities/plugin-backed.md`) are updated by `/speckit-docs-as-code <n>` after review, per the PR lifecycle in CLAUDE.md. They are not part of `/speckit-implement`.

## Phase 0: Research → research.md

- **F1**: Six copies of the closed-vault stage. Message wording varies.
- **F2**: The stage is unreachable through the shim. ADR-029 handles the real closed-vault signature.
- **F3**: Without the stage, an empty answer fails at `json-parse` in all six tools.
- **F4**: The post-retry `CLI_REPORTED_ERROR` reaches the caller unchanged, including through `query_base`'s classifier. The unknown-vault paths are untouched.
- **F5**: The detection module has no other consumer.
- **D1–D7**: as summarised above.

**Output**: research.md, with no `NEEDS CLARIFICATION` remaining.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)**: vault states, transitions and the failure shapes under their documented names.
- **[contracts/closed-vault-contract.md](contracts/closed-vault-contract.md)**: the outcomes table, the per-tool description sentence and removals, the reference-page row, the FR-009 edits and the baseline expectation.
- **[contracts/t0-probe-plan.md](contracts/t0-probe-plan.md)**: G1 (blocking, stop and escalate on fail) and G2 (optional).
- **[quickstart.md](quickstart.md)**: the automated gate and a per-story validation.
- **Agent context**: the `CLAUDE.md` SPECKIT block now points at this plan.

## Phase 1 re-check (post-design Constitution Check)

Re-evaluated against the data model and the contracts:

- No schema, code or sub-reason added (III, IV).
- Only removals inside tool modules, plus deletion of a single-consumer module, with no new edges (I).
- Every reachable outcome (recovers, unavailable, empty answer, unknown) has a co-located test per tool (II).
- Headers kept and updated (V).
- Descriptions and baseline move deliberately and are reviewed (MCP Tool Surface Standards).

**No gate regressed; Complexity Tracking is empty.**

### CodeGraph structural check

Run with `codegraph_explore` at plan time (HEAD `e0e49d6`).

**Affected symbols and blast radius**:

- `detectIfClosed` (`src/tools/_eval-vault-closed-detection/detector.ts`). Its callers are exactly the six handlers (`executePaths`, `executeTag`, `executePatternSearch`, `executeQueryBase`, `executeSmartConnectionsQuery`, `executeSmartConnectionsSimilar`) and the module's barrel `index.ts`. Tests: `detector.test.ts`.
- `parseVaultRegistry` (`registry-parser.ts`) is called only by `detector.ts` and the barrel. Tests: `registry-parser.test.ts`.
- The vault registry's own `parseVaultsVerboseOutput` (`src/vault-registry/registry.ts`) is a separate copy, not a consumer, and is unaffected.
- The flow `invokeCli` (`src/cli-adapter/cli-adapter.ts`) → `dispatchCli` → `dispatchWithColdStartRetry` → `isColdStart` (`src/cli-adapter/_dispatch.ts`) is the path that brings the closed vault up and propagates the vault-unavailable failure. It is relied on and not edited.
- `remapVaultNotFound` (`src/tools/_active-file.ts`) gives `query_base` its unknown-vault shape. It is not edited.

**Kernel-node touch surface**:
- `createServer`, `createLogger`, `createQueue`: not touched; no edge added or removed.
- `UpstreamError`: six construction sites are removed (the retired stages), none are added, and the class and code list are unchanged.

High-blast-radius surface: none edited. `invokeCli` and `dispatchCli` are among the most-depended-on symbols and are explicitly left unchanged.

**Post-implement structural verification** (after `codegraph sync`):

1. No new error class or code. `src/errors.ts` is unchanged, and every remaining failure in the six handlers is an existing `UpstreamError` shape.
2. No handler imports `createLogger` / `createQueue`, and `server.ts` is unchanged.
3. The six handlers' imports run only to `cli-adapter`, `errors`, `_shared` (plus `search/handler` for `pattern_search` and `_active-file` for `query_base`, as today). No symbol from `_eval-vault-closed-detection` remains in the index.
4. No production symbol is added, so there is no orphan risk. The deletion leaves no production symbol without a caller: `detectIfClosed` and `parseVaultRegistry` go together with all of their callers' uses.
5. Only the six `descriptionFingerprint` values moved in the baseline.

## Follow-ups (out of scope)

- **Unknown-vault wording mismatch** (analyze finding I1, option (b)):
  - The reference pages and descriptions of the five eval tools describe the unknown vault as `CLI_REPORTED_ERROR` / `VAULT_NOT_FOUND` / `unknown`, but those handlers return `details.message: "Vault not found."`.
  - The `paths` description has no unknown-vault wording at all.
  - The `smart_connections_similar` description keeps "Vault states: VAULT_NOT_FOUND carries a details.reason sub-discriminator — "unknown" (vault not registered)." Without `not-open` this sub-discriminator has one value. The PR #100 review flagged it, and the owner chose to leave it here, because contract §2 keeps the unknown-vault part unchanged.

  This feature leaves that text unchanged, apart from removing `not-open`. The vault-unavailable entries do not cross-reference it. Recorded on BI-0076 as a candidate follow-up BI. The unknown-vault surface is locked by TC-00228, TC-00105 and TC-00209.

## Complexity Tracking

> No Constitution Check violations; the table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
