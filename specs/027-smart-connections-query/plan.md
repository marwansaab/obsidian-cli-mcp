# Implementation Plan: Smart Connections Query — Semantic Search Over Vault Blocks by Text Query

**Branch**: `027-smart-connections-query` | **Date**: 2026-05-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [/specs/027-smart-connections-query/spec.md](./spec.md)

## Summary

Add `smart_connections_query`, the **thirteenth** typed-tool wrap and the project's **second plugin-backed typed surface** — semantic search over vault BLOCKS from a natural-language text query, via the Smart Connections plugin's `env.smart_sources.lookup({hypotheticals, filter, collection: 'smart_blocks'})` API. Where BI-026 (`smart_connections_similar`) answers "what content is near this source note?", BI-027 answers "what content is near this question?". Together the two cover the plugin's two principal call shapes; BI-027 establishes the FILELESS sub-cohort within the plugin-backed cohort (no `target_mode`, optional `vault?`).

User-facing surface: `smart_connections_query({ query, vault?, limit?, total? })` returning `{ count: number, matches: Array<{ path, headingPath, score }> }`. The `total: true` switch returns the count alone with `matches: []` for a token-economical pre-flight read.

**Technical approach** (load-bearing decisions discovered AND live-probe-verified at plan stage on 2026-05-15 — see [research.md](./research.md) for full F-finding transcript):

- **CLI subcommand: `eval`** (R2 / F1). Same as BI-026. The Smart Connections plugin's lookup API is reached via `app.plugins.plugins["smart-connections"].env.smart_sources.lookup(...)` from inside the eval JS template (LIVE-VERIFIED — F1).
- **Single-call architecture branched at envelope-emission on `a.total`** (R3). ONE `invokeCli` per request with `subcommand: 'eval'`. Plus one optional second `invokeCli` to the `vaults` subcommand from inside the shared `_eval-vault-closed-detection` detector, fired only on the empty-stdout signature. Parity with BI-026 R3.
- **NO `target_mode` discriminator** (R4). Flat schema with optional `vault?: string`. Parity with BI-014 / BI-019 / BI-024 fileless precedent — ADR-003 governs per-file typed tools and explicitly does NOT apply here.
- **NEW cross-cutting shared module `src/tools/_eval-vault-closed-detection/`** (R5a / FR-020 — Q8(c) hybrid extraction). The closed-but-registered vault detection branch (empty-stdout + transparent-open signature, locked by BI-026's plan-stage probe on 2026-05-15) lives in a NEW shared module consumed by BOTH BI-026 (refactored in this same BI; behaviour-preserving) AND BI-027. The module is plugin-AGNOSTIC — any future eval-driven typed tool with a `vault?` parameter may consume it. The cli-adapter stays FROZEN per the 008-refactor surface invariant.
- **Plugin lookup API signature** (R11 / R12 / F3 — CRITICAL plan-stage live-probe-driven amendment 1): `hypotheticals` lives at the TOP LEVEL of `lookup({...})` params, NOT inside `filter`. Verified via `smart_blocks.lookup.toString()` source inspection: `async lookup(params = {}) { const { hypotheticals = [] } = params; ... }`. The corrected call shape: `lookup({ hypotheticals: [query], filter: { limit }, collection: "smart_blocks" })`. Spec FR-011 amended in /speckit-clarify Q-amendment 1 entry.
- **Plugin error-surface mechanism** (R11 / F10 / F11 — CRITICAL plan-stage live-probe-driven amendment 2): lookup errors return as `{ error: <string> }` SENTINELS, NOT as thrown exceptions or rejected promises. Verified: empty hypotheticals → `{error: "hypotheticals is required"}`; missing embed model → `{error: "Embedding search is not enabled."}`. Wrapper's in-eval pipeline does `if (r && r.error) return JSON.stringify({ok:false, code:"SMART_CONNECTIONS_NOT_READY_EMBED_FAILED", detail:r.error})` — NO try/catch. Spec FR-013a amended.
- **Stdout extraction strategy: LAST `=> ` occurrence** (R14 / F8 — CRITICAL plan-stage live-probe-driven amendment 2): the CLI captures plugin-side `console.log` ("Found and returned N smart_blocks.") AND `[warn]` lines on stdout BEFORE the `=> ` eval-return marker. BI-026's handler's `stdout.trimStart()` + `startsWith('=> ') ? slice(3) : passthrough` works only because `find_connections` does NOT emit plugin-side console output. BI-027's handler stage-1 uses `stdout.lastIndexOf('\n=> ')` to find the JSON. BI-026's handler is UNCHANGED.
- **Anti-injection via base64 JSON payload + frozen JS template** (R6). Parity with BI-014 / BI-015 / BI-025 / BI-026.
- **Block-level match granularity, same `{path, headingPath, score}` shape** (R7 / F5 / F6 / F7). Live-probe-verified: lookup returns `Array<{key, score, item, hypothetical_i}>` — wrapper extracts top-level `key` and `score` ONLY (the `item` field carries the smart_block back-reference object which is CIRCULAR and not serialisable — F7 critical finding). Path/heading split per BI-026 R7 inheritance.
- **Three-level sort intra-eval** (R8). Parity with BI-026.
- **NO self-exclusion** (R9). BI-026 R9's self-exclusion filter exists because `find_connections` is keyed off a source note; for `query` there is no source.
- **Non-finite-score filter** (R10). Parity with BI-026 — `.filter(m => Number.isFinite(m.score))`.
- **Two-sub-discriminator `details.reason` on `SMART_CONNECTIONS_NOT_READY`** (FR-013 / R11 / R12, ADR-015 pattern): `"api-missing"` for `typeof env.smart_sources.lookup !== 'function'` (detected at in-eval Stage 2); `"embed-failed"` for the lookup return-value `{error:<string>}` sentinel (detected at in-eval Stage 4). NEW emission for BI-027. As a cohort-consistency ripple per FR-013a, BI-026's existing `SMART_CONNECTIONS_NOT_READY` emission is patched to carry `details.reason: "api-missing"` always (additive — does not break callers; existing pattern-matchers on `details.code` still match).
- **Error-precedence chain** (R13 / FR-017): `VAULT_NOT_FOUND(unknown)` → `VAULT_NOT_FOUND(not-open)` → `SMART_CONNECTIONS_NOT_INSTALLED` → `SMART_CONNECTIONS_NOT_READY(api-missing)` → `SMART_CONNECTIONS_NOT_READY(embed-failed)` → success.
- **Zero new top-level error codes** (FR-013). All five entries in the FR-013 roster surface through `CLI_REPORTED_ERROR` with `details.code` + `details.reason` discriminators (`VALIDATION_ERROR` is the schema-layer error). Thirteen-tool streak preserved.
- **Zero new ADRs** (FR-027). ADRs 013 / 014 / 015 (introduced in BI-026's plan run) cover this BI as their second consumer.
- **Plugin-namespace tool name** (R15). `smart_connections_query` per ADR-013 `<plugin>_<operation>` convention; second consumer of the convention.
- **Schema**: `smartConnectionsQueryInputSchema = z.object({ query: z.string().trim().min(1).max(4000), vault: z.string().min(1).optional(), limit: z.number().int().min(1).max(100).default(20), total: z.boolean().optional() }).strict()`.
- **Output schema**: `z.object({ count, matches }).strict()` with per-entry `z.object({ path, headingPath, score }).strict()` (FR-007). Parity with BI-026.
- **Eval-envelope wire schema**: `z.discriminatedUnion("ok", [...])` strict union; 3 envelope error codes (vs BI-026's 6) — `SMART_CONNECTIONS_NOT_INSTALLED`, `SMART_CONNECTIONS_NOT_READY_API_MISSING`, `SMART_CONNECTIONS_NOT_READY_EMBED_FAILED`. The two NOT_READY codes flatten the (code, reason) pair onto the wire for parse-time discrimination; the handler unflattens to `(details.code, details.reason)` for ADR-015 compliance.
- **Registration**: via existing `registerTool` factory. Alphabetical insertion at [src/server.ts](../../src/server.ts) tools array — between `createSmartConnectionsSimilarTool` and `createWriteNoteTool` (ASCII: `smart_connections_query/` < `smart_connections_similar/` is FALSE because `q` (113) > `s` (115)... wait `q` is 113 and `s` is 115; `q` < `s` so `query/` < `similar/`; thus `query` goes BEFORE `similar`). Final order: `set_property/` < `smart_connections_query/` < `smart_connections_similar/` < `write_note/`.
- **BI-022 registry-stability baseline roll-forward**: new tool's fingerprint added to [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) via `npm run baseline:write` post-implementation. BI-026's fingerprint MUST remain byte-stable across the ripple refactor (verified at implement-time post-refactor).
- **Architecture-doc rollforward** (per FR-025): canonical `.architecture/Obsidian CLI MCP - Architecture.md` rolled forward in this plan run to: (a) list `smart_connections_query` as second member of the plugin-backed cohort; (b) reference the new `_eval-vault-closed-detection/` cross-cutting shared module category; (c) document the FR-013a ripple (ADR-015 sub-discriminator added to `SMART_CONNECTIONS_NOT_READY`). NO new snapshot file (BI-026's snapshot is the first-of-kind frozen artefact).

## Technical Context

**Language/Version**: TypeScript (strict mode, `tsc --noEmit` clean) — pinned in [tsconfig.json](../../tsconfig.json), runtime Node.js >= 22.11 per `engines.node` in [package.json](../../package.json).
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP transport), `zod` (validation, single source of truth per Constitution III), `zod-to-json-schema` (consumed via the existing `toMcpInputSchema` helper at [src/tools/_shared.ts](../../src/tools/_shared.ts)). **Runtime dependency** carried from BI-026: the Smart Connections plugin (free version, ≥ minimum-probed-version locked at plan stage and surfaced in `docs/tools/smart_connections_query.md` per inherited Q1 docs-only soft-pin pattern).
**Storage**: N/A — the tool is stateless. The CLI's `eval` subcommand reaches Obsidian's `app.plugins.plugins["smart-connections"].env.smart_sources.lookup` for each query; the wrapper just shells out and parses stdout. No caching across requests.
**Testing**: vitest with `@vitest/coverage-v8`. Co-located `*.test.ts` per module. The aggregate statements coverage threshold floor is **91.3%** ([vitest.config.ts](../../vitest.config.ts)). Tests inject the cli-adapter's stub `spawnFn` via `deps.spawnFn` per the existing test-seam convention; no real `obsidian` binary executions in CI. Each handler test responds to ONE spawn invocation per request (single-call architecture per R3), or TWO for closed-vault path (main eval + vaults lookup from the shared detector). Base64 round-trip assertion locks R6.
**Target Platform**: cross-platform Node.js MCP server (Windows / macOS / Linux). The host shells out to the Obsidian CLI binary via `child_process.spawn`. CLI subcommand `eval` is OS-independent. Smart Connections plugin is OS-independent.
**Project Type**: MCP server with one new typed tool. Per Constitution v1.5.0, the project exposes "an MCP server surface" only; `smart_connections_query` adds one entry to the registered-tool list at [src/server.ts](../../src/server.ts) (alphabetical: between `createSetPropertyTool` and `createSmartConnectionsSimilarTool`).
**Performance Goals**: per-call latency dominated by the embed pipeline. Local model (transformers.js): ~100-500 ms typical. Cloud model (OpenAI text-embedding-3-small): ~150-600 ms typical, occasional 5-10s+ spikes under rate-limiting (inherited limitation #7 — embed-call latency cap). The lookup-and-rank step is in-memory and contributes ~5-20 ms. Token saving is the primary win — for a semantic-search query over a vault, the response at `limit: 20` is on the order of 1-3 KB.
**Constraints**:
- 10 s per-call timeout, 10 MiB output cap (typed-tool defaults applied automatically by `invokeCli`). Embed calls exceeding 10s surface as `CLI_TIMEOUT` (inherited limitation #7).
- Single-in-flight CLI queue gates all CLI invocations.
- 008-refactor surface frozen — `dispatchCli`, `invokeCli`, `invokeBoundedCli`, the in-flight registry, the four-priority error classification, the `obsidian_exec` argv-assembly contract, the `assertToolDocsExist` aggregator, the 011-R5 unknown-vault response-inspection clause are all FROZEN. The new cross-cutting `_eval-vault-closed-detection/` shared module sits ONE LAYER UP from the cli-adapter.
- ADR-013 (plugin-namespace naming), ADR-014 (plugin-backed runtime-dependency pattern), ADR-015 (sub-discriminator pattern) — this BI is the second consumer of all three. No new ADRs.
- ADR-003 NOT APPLICABLE — fileless surface; flat schema with optional `vault?`.

**Scale/Scope**: ~195 LOC of new source code split across `schema.ts` / `_template.ts` / `handler.ts` / `index.ts` (smaller than BI-026 because of fewer envelope codes, no source-key lookup, no extension check, no self-exclusion). PLUS ~110 LOC of new shared-module code at `src/tools/_eval-vault-closed-detection/{detector,registry-parser,index}.ts`. PLUS ~10 LOC of BI-026 ripple deltas. ~1410 LOC of co-located tests across the new tool + shared module + BI-026 ripple (16 schema / 26 handler / 5 registration / 12 detector / 8 parser / +3 BI-026 ripple = 70 tests). One new doc at `docs/tools/smart_connections_query.md` (~180 lines including ≥4 worked examples + 5-entry error roster + 8 inherited limitations + precedence chain). One line of update each in [src/server.ts](../../src/server.ts), [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json), [docs/tools/index.md](../../docs/tools/index.md), [package.json](../../package.json) (version bump 0.5.3 → 0.5.4 — PATCH, additive), [CHANGELOG.md](../../CHANGELOG.md).

**Plan-phase deliverables outside the standard pattern**:
- `.architecture/Obsidian CLI MCP - Architecture.md` (FR-025) — rolled forward in THIS plan run to mention BI-027 cohort membership + the new shared module + the FR-013a ripple.
- NO new ADRs (FR-027).
- NO Constitution amendment (no new compliance row needed; ADRs 013/014/015 already covered by v1.5.0).
- NO new architecture snapshot (FR-025).
- `CLAUDE.md` active-narrative block rewrite — done in this command's Phase 1 step 3 (BI-026 narrative retained as predecessor).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Evidence |
|---|---|---|
| **I. Modular Code Organization** | ✅ PASS | New tool at `src/tools/smart_connections_query/` per `{schema, _template, handler, index}.ts` per-surface layout (verified against existing siblings). NEW shared module at `src/tools/_eval-vault-closed-detection/` sits one layer up from cli-adapter, consumed by typed-tool handlers (BI-026 + BI-027). Downward-flow chain preserved: `index.ts` → `handler.ts` → `_eval-vault-closed-detection/` + `cli-adapter` → `child_process.spawn`. No upward or cyclic imports. |
| **II. Public Surface Test Coverage** | ✅ PASS | `smart_connections_query` is a public MCP tool surface. Co-located tests at `src/tools/smart_connections_query/{schema,handler,index}.test.ts` — **16 schema cases / 26 handler cases / 5 registration cases = 47 tests** for the new tool. PLUS **12 detector cases / 8 parser cases = 20 tests** for the new shared module. PLUS **3 behaviour-preservation regression cases** for BI-026 ripple. **70 tests total**. Happy-path AND failure-path coverage in every layer. Drift detector + FR-018 baseline auto-cover the new tool. BI-026's baseline fingerprint stays byte-stable across the ripple refactor (asserted). |
| **III. Boundary Input Validation with Zod** | ✅ PASS | Input schema is a flat `z.object({...}).strict()` (no target_mode reuse). `query: z.string().trim().min(1).max(4000)` with trim-then-cap; `vault?: z.string().min(1).optional()`; `limit: z.number().int().min(1).max(100).default(20)`; `total?: z.boolean().optional()`. Output type ALSO via zod schema `smartConnectionsQueryOutputSchema = z.object({count, matches}).strict()` with strict per-entry shape (FR-007). Eval-envelope wire schema is a strict discriminated union with 3 error codes flattening the (code, reason) pair for parse-time discrimination. No hand-rolled types. `registerTool` parses input via `schema.parse` before handler runs (auto-wraps ZodError → VALIDATION_ERROR). |
| **IV. Explicit Upstream Error Propagation** | ✅ PASS | Zero new top-level error codes (FR-013). Failures flow through `VALIDATION_ERROR` (zod) and `UpstreamError` codes from the cli-adapter (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`). The 011-R5 unknown-vault clause FIRES for unregistered vault. The shared `_eval-vault-closed-detection` module emits `CLI_REPORTED_ERROR(VAULT_NOT_FOUND, reason: not-open)` on empty-stdout signature. The handler's three envelope-error paths map to `CLI_REPORTED_ERROR(SMART_CONNECTIONS_NOT_INSTALLED)`, `(SMART_CONNECTIONS_NOT_READY, reason: api-missing)`, `(SMART_CONNECTIONS_NOT_READY, reason: embed-failed)`. NEW emission for BI-027: the embed-failed sub-reason. No `catch + return null/empty/default` patterns. |
| **V. Attribution & Layered Composition Transparency** | ✅ PASS | Every new source file (`src/tools/smart_connections_query/{schema,handler,_template,index}.ts` + tests; `src/tools/_eval-vault-closed-detection/{detector,registry-parser,index}.ts` + tests) carries the `// Original — no upstream. <one-line description>.` header per the established convention. The Markdown doc at `docs/tools/smart_connections_query.md` is exempt per BI-005 FR-019. The shared module's `registry-parser.ts` notes provenance: "Structurally replicated from src/vault-registry/registry.ts" (the BI-026 inline `isVaultRegistered` helper which itself referenced that file). README's Attributions section is unchanged (no new lifted code). |
| **ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand)** | ✅ N/A | This tool wraps a plugin-exposed API via `eval`, NOT a single upstream CLI subcommand. ADR-010 explicitly excludes plugin-backed tools (point 3 of the ADR's Decision section). The plugin-namespace tool-naming convention from ADR-013 governs the name `smart_connections_query`. |
| **ADR-013 (Plugin-Namespace Tool Naming Convention)** | ✅ PASS | `smart_connections_query` follows `<plugin>_<operation>` — plugin name `smart-connections` → underscore-joined `smart_connections`; operation `query`. Second consumer of the convention after BI-026. ADR is NOT amended. |
| **ADR-014 (Plugin-Backed Typed Tools Runtime-Dependency Pattern)** | ✅ PASS | This BI applies the three plugin-lifecycle states as `CLI_REPORTED_ERROR.details.code` discriminators: `SMART_CONNECTIONS_NOT_INSTALLED`, `SMART_CONNECTIONS_NOT_READY`, (and `SOURCE_NOT_INDEXED` — N/A for fileless surfaces; this BI has no source key). Fixed stage-order in-eval lifecycle checks per FR-017 precedence chain. Second consumer of the ADR after BI-026. ADR is NOT amended. |
| **ADR-015 (Sub-Discriminators via details.reason for Multi-State Error Codes)** | ✅ PASS | This BI applies the `details.reason` sub-discriminator to `SMART_CONNECTIONS_NOT_READY` (`"api-missing"` vs `"embed-failed"`) AND continues to use it on `VAULT_NOT_FOUND` (`"unknown"` vs `"not-open"`). The ripple to BI-026 (FR-013a) adds `details.reason: "api-missing"` to BI-026's existing NOT_READY emission for cohort exhaustiveness. Second consumer of the ADR after BI-026; first cross-cohort consistency application (the ripple). ADR is NOT amended. |

**Coverage gate**: aggregate statements floor is 91.3% ([vitest.config.ts](../../vitest.config.ts)); the new tests must not drop the aggregate below this. The new modules (~305 LOC) ship with ~70 co-located tests producing near-100% coverage of the new code, so the aggregate either stays flat or ratchets up.

**Constitution Compliance checklist** (for the eventual PR): all five principles expected to evaluate as Y; ADR-010 evaluates as N/A (justified above — plugin-backed tool, not native-CLI wrapper); ADR-013 / ADR-014 / ADR-015 all evaluate as Y. No deviations needed; no Complexity Tracking entries required.

**ADR scope check**:
- [ADR-003](../../.decisions/) — N/A (fileless surface; no target_mode; FR-001 explicit).
- [ADR-005](../../.decisions/) — reaffirmed; `stripSchemaDescriptions` applied at registration via `registerTool` (auto).
- [ADR-006](../../.decisions/) — reaffirmed; `registerTool` factory wraps schema parse + UpstreamError propagation + JSON serialisation.
- [ADR-010](../../.decisions/) — N/A (plugin-backed tool).
- [ADR-013](../../.decisions/) — APPLICABLE; tool name complies.
- [ADR-014](../../.decisions/) — APPLICABLE; failure roster complies.
- [ADR-015](../../.decisions/) — APPLICABLE; sub-discriminator usage complies; ripple to BI-026 ensures cohort exhaustiveness.

## Project Structure

### Documentation (this feature)

```text
specs/027-smart-connections-query/
├── plan.md                                           # This file
├── research.md                                       # Phase 0 — R1..R15 + plan-stage live-CLI/plugin findings F1..F15
├── data-model.md                                     # Phase 1 — input/output/eval-envelope schemas, frozen JS template, base64 payload, invariants, LOC budget, test inventory (70 cases), architectural delta map
├── quickstart.md                                     # Phase 1 — 31 verification scenarios mapped to SC-001..SC-024
├── contracts/
│   ├── smart-connections-query-input.contract.md     # Public input contract — zod schema, JSON Schema, field policy, 8 worked examples (A–H), 11-row error roster, out-of-scope upstream surfaces
│   └── smart-connections-query-handler.contract.md   # Handler invariants — single invokeCli call shape, base64 payload assembly, LAST-`=> ` extraction, multi-stage parse, envelope mapping, failure chain, single-spawn invariant, anti-injection structural lock
├── checklists/
│   └── requirements.md                               # Quality checklist from /speckit-specify (validated 16/16 pass) + 2 /speckit-clarify Q&As + 2 live-probe-driven amendments
└── tasks.md                                          # Phase 2 output (created by /speckit-tasks, NOT by this command)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── smart_connections_query/                     # NEW per-surface module (FR-001)
│   │   ├── schema.ts                                # smartConnectionsQueryInputSchema + smartConnectionsQueryOutputSchema + smartConnectionsQueryEvalResponseSchema + matchEntrySchema + types via z.infer
│   │   ├── schema.test.ts                           # 16 cases (input strict / query trim/min/max / vault optional+min1 / limit range/default/int / total boolean / unknown-key / matchEntrySchema strict / eval-envelope discriminated union / output strict)
│   │   ├── _template.ts                             # JS_TEMPLATE constant — frozen JS template with single __PAYLOAD_B64__ slot
│   │   ├── handler.ts                               # executeSmartConnectionsQuery(input, deps) — base64 payload assembly + single invokeCli + closed-vault stage-0 detection (via shared module) + LAST-`=> ` extraction + JSON.parse + envelope safeParse + mapEnvelopeError
│   │   ├── handler.test.ts                          # 26 cases (happy default / happy count-only / cross-mode invariant / empty result / 3 sort cases / non-finite filter / limit cap / 2 anti-injection / frontmatter sentinel / source-level match / 3 lifecycle codes / 2 vault errors / 2 parse failures / output-cap / 4 precedence chain / single-spawn invariant)
│   │   ├── index.ts                                 # createSmartConnectionsQueryTool factory via registerTool
│   │   └── index.test.ts                            # 5 registration cases (descriptor name / stripped schema / help mention / doc presence / FR-018 baseline lock)
│   ├── _eval-vault-closed-detection/                # NEW cross-cutting shared module (FR-020)
│   │   ├── detector.ts                              # detectIfClosed({ vaultName, deps }) — fires second invokeCli to `vaults verbose`, parses, returns boolean
│   │   ├── detector.test.ts                         # 12 cases
│   │   ├── registry-parser.ts                       # parseVaultRegistry(stdout, name) → boolean — BOM-aware parser, tab-separated lines, CRLF/LF tolerant
│   │   ├── registry-parser.test.ts                  # 8 cases
│   │   └── index.ts                                 # Re-export module
│   ├── smart_connections_similar/                   # MODIFIED (BI-026 ripple per FR-020a + FR-013a)
│   │   ├── handler.ts                               # +refactor: stage-0 closed-vault detection swapped for shared-module call (behaviour-preserving); +emission: details.reason = "api-missing" on existing SMART_CONNECTIONS_NOT_READY path
│   │   └── handler.test.ts                          # +3 new cases (api-missing emission × 2 paths + behaviour-preservation regression for refactored stage-0)
│   ├── _register.ts                                 # FROZEN
│   ├── _register.test.ts                            # FROZEN — drift detector auto-covers smart_connections_query
│   ├── _register-baseline.json                      # ROLLED FORWARD by `npm run baseline:write` post-implementation (new tool fingerprint added; BI-026's fingerprint UNCHANGED across ripple)
│   ├── _register-baseline.test.ts                   # FROZEN
│   ├── _register-baseline.ts                        # FROZEN
│   ├── _shared.ts                                   # FROZEN
│   ├── _shared.test.ts                              # FROZEN
│   ├── help/                                        # FROZEN
│   ├── obsidian_exec/                               # FROZEN
│   ├── outline/                                     # FROZEN
│   ├── properties/                                  # FROZEN
│   ├── links/                                       # FROZEN
│   ├── read/                                        # FROZEN
│   ├── read_heading/                                # FROZEN
│   ├── read_property/                               # FROZEN
│   ├── delete/                                      # FROZEN
│   ├── files/                                       # FROZEN
│   ├── find_by_property/                            # FROZEN
│   ├── set_property/                                # FROZEN
│   ├── rename/                                      # FROZEN
│   └── write_note/                                  # FROZEN
├── server.ts                                        # +2 lines: import + createSmartConnectionsQueryTool({ logger, queue }) added to the tools array (alphabetical, between createSetPropertyTool and createSmartConnectionsSimilarTool)
├── server.test.ts                                   # registry-consistency test auto-covers smart_connections_query
├── cli-adapter/                                     # FROZEN (008-refactor surface) — shared closed-vault detection lives one layer UP from here per FR-020
├── target-mode/                                     # FROZEN (no target_mode discriminator on this BI)
├── vault-registry/                                  # FROZEN
├── path-safety/                                     # FROZEN
├── binary-resolver/                                 # FROZEN
├── help/                                            # FROZEN
├── errors.ts                                        # FROZEN (no new top-level codes per FR-013)
├── logger.ts                                        # FROZEN
└── queue.ts                                         # FROZEN

docs/tools/
├── smart_connections_query.md                       # NEW non-stub doc per FR-021 (input table / output table × 2 modes / 5-entry error roster + 2 sub-reasons + adapter errors / error-precedence chain / 8 inherited limitations / 4 worked examples)
├── index.md                                         # +1 line entry
├── smart_connections_similar.md                     # MAY need a small touch-up if the BI-026 ripple changes any user-observable error message — TBD at implement time
└── (other tool docs)                                # FROZEN

.architecture/
├── Obsidian CLI MCP - Architecture.md                            # ROLLED FORWARD in this plan run (per FR-025 — canonical forward-going)
└── Obsidian CLI MCP - Architecture with Smart Connections.md     # FROZEN (BI-026 first-of-kind snapshot; this BI does NOT update)

.decisions/                                                       # FROZEN — no new ADRs per FR-027

.specify/memory/
└── constitution.md                                  # FROZEN — no constitution amendment per FR-028

CHANGELOG.md                                          # +1 entry under "Unreleased" or 0.5.4 (release versioning is a /speckit-tasks decision)
package.json                                          # version 0.5.3 → 0.5.4 + description string updated to mention smart_connections_query alongside the existing typed tools
README.md                                             # tools-list section updated (if present); Attributions section unchanged
CLAUDE.md                                             # active-narrative block rewritten by Phase 1 step 3 (done in this command run)
```

**Structure Decision**: Single-project layout per the existing project shape. `src/tools/smart_connections_query/` is the entire functional surface for the new typed tool. `src/tools/_eval-vault-closed-detection/` is the entire cross-cutting shared-module surface. `src/tools/smart_connections_similar/` is touched only for the FR-020a refactor + FR-013a `details.reason` ripple — minimal delta, behaviour-preserving with respect to the public surface.

## Phase 0: Research Decisions Summary

Full detail in [research.md](./research.md). Brief index:

- **R1** — Logger surface: thin handler. Parity with all prior typed tools.
- **R2** — CLI subcommand: `eval` (NOT a native subcommand). Parity with BI-014 / BI-015 / BI-025 / BI-026.
- **R3** — Single-call architecture, branched at envelope-emission on `a.total`. Parity with BI-026.
- **R4** — NO `target_mode` discriminator (flat schema). Parity with BI-014 / BI-019 / BI-024 fileless precedent.
- **R5** — Unknown-vault response inspection: ACTIVE (cli-adapter's 011-R5 clause fires).
- **R5a** — Closed-but-registered vault detection: NEW cross-cutting shared module `_eval-vault-closed-detection/`. Consumed by both BI-026 (refactored in this BI) and BI-027.
- **R6** — Anti-injection: base64 JSON payload + frozen JS template. Parity with BI-014 / BI-015 / BI-025 / BI-026.
- **R7** — Per-match transform: `{path, headingPath, score}` from top-level `m.key` + `m.score`. Same R7 split rule as BI-026.
- **R8** — Three-level sort intra-eval. Parity with BI-026.
- **R9** — NO self-exclusion (no source path).
- **R10** — Non-finite-score filter. Parity with BI-026.
- **R11** — Lookup return-value error-sentinel detection: in-eval `if (r && r.error)` check → maps to `SMART_CONNECTIONS_NOT_READY(embed-failed)`. NEW for BI-027 — drove plan-stage live-probe-driven amendment 2.
- **R12** — API-shape check: in-eval `typeof env.smart_sources?.lookup !== 'function'` check → maps to `SMART_CONNECTIONS_NOT_READY(api-missing)`.
- **R13** — Error-precedence chain: outer-to-inner / cheapest-first per FR-017.
- **R14** — Stdout extraction strategy: LAST `=> ` occurrence (NOT trimStart + slice-from-beginning). NEW for BI-027 — drove plan-stage live-probe-driven amendment 2.
- **R15** — Plugin-namespace tool name `smart_connections_query` per ADR-013. Second consumer.

**Plan-stage status**: 15 design decisions ratified. **12 live-CLI / live-plugin findings F1–F12** verified during the plan run on 2026-05-15 against the user's "The Setup" vault (which has Smart Connections installed and indexed). **3 findings F13–F15 deferred to T0** of `/speckit-implement` (require fixture setup mid-/speckit-implement: closing a registered vault; configuring a fresh vault before settings open; submitting a 4000-char query against a small-context local model).

**Critical plan-stage live-probe-driven amendments to spec** (per FR-024 protocol):
- **Amendment 1**: `hypotheticals` lives at the TOP LEVEL of `lookup({...})` params, NOT inside `filter` (drove FR-011 rewrite). Verified via plugin source inspection.
- **Amendment 2**: lookup errors return as `{error: <string>}` SENTINELS (not thrown); plugin-side console output captures to stdout BEFORE the `=> ` eval-return marker (drove FR-011 + FR-013a wording + new handler stage-1 LAST-`=> ` extraction strategy per R14).

Both amendments are integrated into spec.md `## Clarifications` block as the third and fourth bullets (after the two `/speckit-clarify` Q&As).

## Phase 1: Design Artifacts

Generated in this command run:

- **[research.md](./research.md)** — R1..R15 + F1..F15.
- **[data-model.md](./data-model.md)** — schema shapes, frozen JS template, base64 payload assembly, per-tool invariants table, module LOC budget (~305 source / ~1410 test), test inventory (70 cases total: 47 new tool + 20 shared module + 3 BI-026 ripple), architectural delta map.
- **[contracts/smart-connections-query-input.contract.md](./contracts/smart-connections-query-input.contract.md)** — public input contract: zod schema, emitted JSON Schema, field policy table, 8 worked examples (A–H), 11-row error response roster, out-of-scope upstream surfaces table.
- **[contracts/smart-connections-query-handler.contract.md](./contracts/smart-connections-query-handler.contract.md)** — handler invariants I-1..I-9: deps shape, single invokeCli call shape, base64 payload assembly, LAST-`=> ` extraction, multi-stage parse, envelope-error → UpstreamError mapping table, failure propagation chain, test seam pattern, anti-injection structural lock.
- **[quickstart.md](./quickstart.md)** — 31 verification scenarios Q-1..Q-31 mapped to SC-001..SC-024; 22 CI cases + 5 T0 manual + 4 inspection/structural.
- **[.architecture/Obsidian CLI MCP - Architecture.md](../../.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md)** — rolled forward in this plan run (per FR-025): (a) `smart_connections_query` listed as second member of plugin-backed cohort; (b) new "Cross-cutting eval-handler shared modules" category introduced for `_eval-vault-closed-detection/`; (c) `details.reason: "api-missing" | "embed-failed"` documented on `SMART_CONNECTIONS_NOT_READY`.
- **[CLAUDE.md](../../CLAUDE.md) active-narrative block rewrite** — the predecessor narrative for 026-smart-connections-similar is retained; the new active-narrative for 027-smart-connections-query is added at the top (done in this command run per Phase 1 step 3).

**Plan-stage spec amendments**: TWO live-probe-driven amendments per FR-024, both integrated into `spec.md` `## Clarifications` section in this plan run.

## Constitution Re-Check (Post-Design)

| Principle | Compliance | Notes |
|---|---|---|
| I. Modular Code Organization | ✅ PASS | Phase 1 confirmed the per-surface layout + the cross-cutting shared-module layout. Downward-flow chain preserved with one new layer (typed-tool handler → shared eval-vault-closed-detection → cli-adapter). |
| II. Public Surface Test Coverage | ✅ PASS | 70 tests across new tool + shared module + BI-026 ripple. Drift detector + FR-018 baseline both auto-cover the new tool. BI-026 baseline fingerprint stays byte-stable across the ripple refactor (asserted at implement time). |
| III. Boundary Input Validation with Zod | ✅ PASS | Input + output + eval-envelope all zod-derived. Strict mode throughout. The eval-envelope wire schema flattens the (code, reason) pair onto wire codes for parse-time discrimination; the handler unflattens before throwing. |
| IV. Explicit Upstream Error Propagation | ✅ PASS | Zero new top-level codes (FR-013). The handler's three envelope-error paths + closed-vault detection + 011-R5 unknown-vault all wrap as UpstreamError with structured `details`. ALL other failure surfaces flow through the dispatch layer's existing classifier. |
| V. Attribution & Layered Composition | ✅ PASS | All new files marked Original. The shared-module registry-parser cites provenance (BI-026 inline helper → src/vault-registry/registry.ts). |
| ADR-010 (Typed Tool Names) | ✅ N/A | Plugin-backed tool. |
| ADR-013 (Plugin-Namespace Tool Naming) | ✅ PASS | `smart_connections_query` complies. Second consumer. |
| ADR-014 (Plugin-Backed Runtime-Dependency Pattern) | ✅ PASS | Three plugin-lifecycle codes used (NOT_INSTALLED + NOT_READY × 2 reasons; SOURCE_NOT_INDEXED N/A for fileless). Second consumer. |
| ADR-015 (Sub-Discriminators via details.reason) | ✅ PASS | NEW `embed-failed` reason on NOT_READY (this BI); existing `not-open` reason on VAULT_NOT_FOUND (inherited from BI-026). Cohort-consistency ripple to BI-026 in this BI ensures `api-missing` is always emitted. Second consumer + first cross-cohort consistency application. |

**No Complexity Tracking entries.** No deviations.

## Complexity Tracking

> **No deviations from constitution.** All five principles evaluate as `Y` for this feature; ADR-010 evaluates as `N/A` (out-of-scope per the ADR's own point-3 clause); ADR-013 / ADR-014 / ADR-015 all evaluate as `Y`. No `N` entries; no Complexity Tracking entries needed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | (n/a)      | (n/a)                               |

**Note on shared-module factoring**: the new `_eval-vault-closed-detection/` module's existence is justified by the Q8(c) hybrid extraction reasoning — the closed-vault detection is plugin-AGNOSTIC and has two known consumers at landing time (BI-026 refactored + BI-027 new). Other plugin-cohort-specific machinery (envelope schemas, JS template fragments, lifecycle stage shapes) is NOT extracted — it remains duplicated between BI-026 and BI-027 pending rule-of-three at the next plugin BI. This is deliberate: extracting too early on tool #2 risks shaping an abstraction around two data points that won't survive tool #3.

## Reporting

- **Branch**: `027-smart-connections-query`
- **Plan path**: `specs/027-smart-connections-query/plan.md`
- **Generated artifacts**:
  - `specs/027-smart-connections-query/research.md` — R1..R15 + F1..F12 (3 deferred to T0)
  - `specs/027-smart-connections-query/data-model.md` — schemas, JS template, base64 payload, test inventory (70 cases), architectural delta
  - `specs/027-smart-connections-query/contracts/smart-connections-query-input.contract.md` — input contract + 8 worked examples + 11-row error roster + out-of-scope upstream surfaces
  - `specs/027-smart-connections-query/contracts/smart-connections-query-handler.contract.md` — handler invariants I-1..I-9
  - `specs/027-smart-connections-query/quickstart.md` — 31 verification scenarios mapped to SC-001..SC-024
  - `.architecture/Obsidian CLI MCP - Architecture.md` — rolled forward (per FR-025; canonical forward-going)
  - `CLAUDE.md` — active-narrative block rewritten to 027-smart-connections-query; 026 narrative retained as predecessor
- **Plan-stage spec amendments**: TWO live-probe-driven amendments per FR-024 (hypotheticals top-level placement; lookup error-sentinel mechanism + stdout LAST-`=> ` extraction). Both integrated into `spec.md` `## Clarifications` section.
- **Architectural cohort**: this BI is the **second member of the eval-driven plugin-backed cohort** (after BI-026) and the **first member of the fileless sub-cohort within plugin-backed tools** (no `target_mode`, optional `vault?`).
- **NEW cross-cutting module**: `src/tools/_eval-vault-closed-detection/` extracted in this BI. Consumed by BI-026 (refactored) AND BI-027 (new). Plugin-agnostic; any future eval-driven typed tool with a `vault?` parameter MAY consume it.
- **BI-026 ripples bundled**: (a) refactor BI-026's handler to consume the shared closed-vault detector (behaviour-preserving — `_register-baseline.json` fingerprint unchanged); (b) emit `details.reason: "api-missing"` on BI-026's existing `SMART_CONNECTIONS_NOT_READY` for cohort consistency per ADR-015.
- **Distinctive risk surface**: lookup-error-sentinel detection mechanism (R11) and stdout LAST-`=> ` extraction strategy (R14) — both new to BI-027 and not exercised by BI-026's handler. Mitigated by: (a) in-eval Stage 4 sentinel check fail-fast before any further work; (b) handler stage-1 extraction handles both BI-027's plugin-side-console-output case AND BI-026's no-extra-output case via the same `lastIndexOf('\n=> ')` rule; (c) the 4 compound-failure regression-test fixtures lock the precedence chain; (d) base64 payload round-trip assertion locks R6 structurally; (e) the 3 BI-026 ripple regression tests lock the cross-cohort consistency.
- **Plan-stage Q&A summary**:
  - `/speckit-clarify` Q1 (embed-call timeout boundary): defer to cli-adapter 10s cap; new inherited limitation #7.
  - `/speckit-clarify` Q2 (stale-index reverse direction — match references deleted file): pass through unchanged; new inherited limitation #8.
  - Plan-stage live-probe amendment 1: `hypotheticals` at TOP LEVEL of params.
  - Plan-stage live-probe amendment 2: lookup errors return `{error}` sentinels; plugin-side console output captures before `=> ` marker.
- **Next command**: `/speckit-tasks` — produces `tasks.md` with dependency-ordered, atomic tasks (T001..TNNN). Tasks will include T0 live-CLI verification cases per the deferred F-finding list (F13–F15) in Phase 0.
