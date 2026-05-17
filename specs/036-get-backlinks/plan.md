# Implementation Plan: Backlinks — Inbound-Reference Inventory for a Single Note

**Branch**: `036-get-backlinks` | **Date**: 2026-05-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [/specs/036-get-backlinks/spec.md](./spec.md)

## Summary

Add `backlinks`, the **thirteenth** typed-tool-via-`eval` wrapper and the **direct inverse** of the BI-025 outgoing-links surface (`links`). Where `links` returns the per-occurrence list of links that one note POINTS AT, `backlinks` returns the per-source-file list of notes that POINT AT one target. Together the two surfaces give complete 1-hop link-graph reads from any note. The user-facing tool surface: `backlinks({ target_mode, vault?, file?, path?, with_counts?, total?, limit? })` returning `{ count: number, backlinks: Array<{ source, count? }>, truncated?: true }`. The `with_counts: true` switch decorates each per-source entry with an integer `count` aggregating all references from that source. The `total: true` switch returns the count alone with `backlinks: []`. The `limit` switch overrides the implicit 1000-source cap in the inclusive range `1..10000`.

**Technical approach** (load-bearing decisions discovered at plan stage):

- **CLI subcommand: `eval`** (R1, parity with BI-025 R2). The native `backlinks` subcommand (verified to exist alongside `links` per the BI-025 spec's out-of-scope clause) is presumed plain-text-only with no per-source-count JSON shape, mirroring the `links` subcommand's gap. The wrapper CANNOT satisfy the locked envelope shape (FR-005 with optional per-source `count` under `with_counts`) via the upstream `backlinks` subcommand. `eval`-driven access to `app.metadataCache.getBacklinksForFile(file)` is load-bearing. Parity with BI-014 (`find_by_property`) / BI-015 (`read_heading`) / BI-025 (`links`) which chose `eval` for the same reason — the metadataCache exposes the structured shape upstream cannot serialise. F1 (live-CLI probe per FR-028) will confirm the upstream-subcommand-shape gap before ship.
- **Single-call architecture branched at the envelope-emission step** (R2, parity with BI-025 R3). ONE `invokeCli` per request with `subcommand: 'eval'` and `parameters.code: <rendered-js>`. The same eval JS resolves the target, builds the per-source aggregation, applies all three flags (`with_counts`, `total`, `limit`), and decides the envelope shape. Cross-mode invariant (FR-005a per the 2026-05-17 Q1 clarification) holds by construction: the eval reports the FULL pre-cap source-note count under `a.total`, and applies the cap only under `!a.total`.
- **Source-corpus `.md`-only filter inside eval** (R3, FR-020a per the 2026-05-17 Q2 clarification). The eval JS post-filters the `getBacklinksForFile()` result keys by case-insensitive `.md` extension before any further processing — `.canvas`, `.base`, plugin configs, attachments are dropped before aggregation, sort, cap, or envelope-emission. This is the wrapper-side post-filter required by Q2; it is uniform across all execution paths (the same filter would apply if a future version routed via the native `backlinks` subcommand).
- **FR-018 unknown-vault outcome: structured error (eval-cohort)** (R5, parity with BI-014 / BI-015 / BI-025). Because the architecture chooses `eval`, the cli-adapter's 011-R5 unknown-vault response-inspection clause FIRES — `obsidian vault=NonExistent eval code="…"` returns `Vault not found.` (plain text, exit 0); the clause reclassifies to `CLI_REPORTED_ERROR(code: 'VAULT_NOT_FOUND')`. The spec-stage FR-018 commitment is satisfied without any new top-level code. F2 (live-CLI probe per FR-028) will confirm the same `Vault not found.` envelope for `backlinks`'s eval payload.
- **Target resolution and non-`.md` rejection inside eval** (R4, parity with BI-025 FR-014 / F9). Same three-branch resolver as `links`: `a.active` → `app.workspace.getActiveFile()`; `a.path` → `app.vault.getFiles().find(x=>x.path===a.path)`; otherwise → `app.metadataCache.getFirstLinkpathDest(a.file, '')`. Same `f.extension === 'md'` guard rejects Canvas / PDF / attachment TARGET locators (FR-020) — `{ok:false, code:'NOT_MARKDOWN', detail: ...}` envelope mapped to `CLI_REPORTED_ERROR(stage:'envelope-error', code:'NOT_MARKDOWN')` by the handler.
- **Per-source aggregation under `with_counts: true`** (R6, FR-003 + FR-007 + FR-015 + FR-016). `getBacklinksForFile(f)` returns a `CustomArrayDict<LinkCache>` whose `.data` is a keyed map: `source-path → LinkCache[]`. The eval iterates `.data` keys (each one a source note's vault-relative path), filters to `.md`-only (R3), and computes per-source aggregates: when `with_counts: true`, `entry.count = links.length` (the number of LinkCache entries from that source pointing at the target, which sums body links + body embeds + frontmatter links uniformly because Obsidian's combined cache is the load-bearing source — see F3 verification case). The `count: 0` case is impossible by construction (sources only appear in the dict if they have at least one reference). Aliased wikilinks attribute to the resolved target (FR-015) automatically — Obsidian's link resolver classifies `[[Target|Display]]` under the `Target` key in the source's cache; the wrapper inherits this resolution. Frontmatter-declared references (FR-016) contribute uniformly because `getBacklinksForFile()` already combines body and frontmatter sources — F3 will confirm.
- **Self-reference inclusion** (R7, FR-013). The eval does NOT filter the source-keys list against the target's own path. A target that links to itself appears in its own backlinks list, matching Obsidian's "Backlinks" pane semantic. Test fixture (T0.3) will exercise this explicitly.
- **Code-block-only references excluded** (R8, FR-014). `getBacklinksForFile()` returns only references the host's link parser classifies as real links — references inside fenced/indented code blocks are NOT in the cache. The wrapper inherits this exclusion at zero additional logic cost. F4 will confirm.
- **Implicit-cap + `truncated` flag inside eval** (R9, FR-010 + FR-011 + FR-024). The eval applies `a.limit ?? 1000` as the cap on `backlinks.length` ONLY when `!a.total` — under `a.total`, the cap is bypassed and the outer `count` reports the full pre-cap source count (FR-005a per the 2026-05-17 Q1 clarification). When the underlying source-key array exceeds the cap, the eval slices to cap length AND sets `truncated: true` on the envelope. The `truncated` field is absent under `a.total` (no clipping occurs in count-only mode) and absent when the pre-cap count fits the cap.
- **Source-path ordering inside eval** (R10, FR-008). The eval sorts the `.md`-filtered source-key array via `.sort()` (UTF-16 code-unit ascending — JavaScript's default lexicographic sort on strings). Deterministic across repeated calls on an unchanged vault state.
- **Output-too-large kill via inherited cli-adapter** (R11, FR-024). The post-cap response may still exceed the cli-adapter's 10 MiB output cap on extraordinarily long source-path strings. The inherited output-cap-kill surfaces as `CLI_NON_ZERO_EXIT` from `invokeCli`; the wrapper does NOT customise the message. Parity with BI-025 / BI-035 defer-to-cli-adapter pattern. No new code introduced.
- **Schema**: STANDARD `target_mode` discriminator per ADR-003. `applyTargetModeRefinement(targetModeBaseSchema.extend({ with_counts, total, limit }))` consumed from [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts). Parity with the BI-025 `links` schema, plus two additional optional fields (`with_counts: z.boolean().optional()`, `limit: z.number().int().min(1).max(10000).optional()`).
- **Output schema**: `z.object({ count, backlinks, truncated }).strict()` with `truncated` optional and `backlinks` as `z.array(backlinkEntrySchema)` where `backlinkEntrySchema = z.object({ source, count? }).strict()` — `count` is OPTIONAL at the schema level (omitted under `with_counts: false` per FR-003). Uniform envelope across all mode combinations.
- **Anti-injection (R12, parity with BI-014 / BI-015 / BI-025)**: base64-encoded JSON payload — user `vault` / `file` / `path` / `target_mode` / `with_counts` / `total` / `limit` flow through `JSON.stringify → Buffer.from.toString('base64') → atob/JSON.parse at JS runtime`. Frozen JS template with single `__PAYLOAD_B64__` substitution point. The handler imports the shared `B64_PAYLOAD_DECODE_EXPR` from `src/tools/_shared.ts` (the BI-034 UTF-8-safe decode helper — already in production).
- **Registration**: via existing `registerTool` factory — auto-applies `stripSchemaDescriptions`, wraps `ZodError → VALIDATION_ERROR`, propagates `UpstreamError → asToolError`, JSON-serialises typed output objects into the MCP `content[0].text` envelope. Alphabetical insertion at [src/server.ts](../../src/server.ts) tools array — between the leading `_register` helpers and `createContextSearchTool` (ASCII alphabetical: `b` < `c`).
- **FR-026 baseline roll-forward (per BI-022 durable machinery)**: the new `backlinks` tool's fingerprint MUST be added to [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) by running `npm run baseline:write` post-implementation. The drift detector test fails until the baseline is rolled forward.

## Technical Context

**Language/Version**: TypeScript (strict mode, `tsc --noEmit` clean) — pinned in [tsconfig.json](../../tsconfig.json), runtime Node.js >= 22.11 per `engines.node` in [package.json](../../package.json).
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP transport), `zod` (validation, single source of truth per Constitution III), `zod-to-json-schema` (consumed via the existing `toMcpInputSchema` helper at [src/tools/_shared.ts](../../src/tools/_shared.ts)). Inherited project infrastructure: `invokeCli` from `src/cli-adapter/`, `UpstreamError` from `src/errors.ts`, `registerTool` from `src/tools/_register.ts`, `Logger` + `Queue` injected via `ExecuteDeps`, `composeEvalCode` + `B64_PAYLOAD_DECODE_EXPR` from `src/tools/_shared.ts`, `applyTargetModeRefinement` from `src/target-mode/target-mode.ts`.
**Storage**: N/A — the tool is stateless. The CLI's `eval` subcommand reaches Obsidian's metadataCache for the resolved file; the wrapper shells out and parses stdout. No caching across requests.
**Testing**: `vitest` with `@vitest/coverage-v8`. Co-located `*.test.ts` per Principle II. The aggregate statements coverage threshold floor is **91.3%** ([vitest.config.ts:20](../../vitest.config.ts#L20)). Tests inject the cli-adapter's stub `spawnFn` via `deps.spawnFn` per the existing test-seam convention; no real `obsidian` binary executions in CI. Each handler test responds to ONE spawn invocation per request (single-call architecture per R2).
**Target Platform**: cross-platform Node.js MCP server (Windows / macOS / Linux). The host shells out to the Obsidian CLI binary via `child_process.spawn`. The `eval` subcommand is OS-independent.
**Project Type**: MCP server with one new typed tool. Per Constitution v1.5.0, the project exposes "an MCP server surface" only; `backlinks` adds one entry to the registered-tool list at [src/server.ts](../../src/server.ts) (alphabetical: between the `_register` helpers and `context_search` — `b` < `c`).
**Performance Goals**: per-call latency ~80–200 ms (single eval CLI invocation; the eval JS executes a metadataCache lookup + key iteration + sort + envelope emission inside Obsidian's already-warm process — no file I/O, no re-parse of source notes). Token saving is the primary win — for a target with 50 backlinks the response is on the order of 3–5 KB; the alternative (vault-wide body-text `search` for the target's name) returns per-line match payloads across every `.md` file in the vault and runs orders of magnitude larger. Per SC-021.
**Constraints**:
- 10 s per-call timeout, 10 MiB output cap (typed-tool defaults applied automatically by `invokeCli`).
- Single-in-flight CLI queue gates all CLI invocations.
- 008-refactor surface frozen — `dispatchCli`, `invokeCli`, `invokeBoundedCli`, the in-flight registry, the four-priority error classification, the `obsidian_exec` argv-assembly contract, the `assertToolDocsExist` aggregator, the 011-R5 unknown-vault response-inspection clause are all frozen. `backlinks` inherits without modification (and the 011-R5 clause FIRES for `backlinks` per R5 — same cohort as BI-014 / BI-015 / BI-025).
- The upstream CLI's `eval` subcommand reaches Obsidian's metadataCache; future Obsidian updates may surface as test failures rather than silent drift. The wrapper's contract is locked against the eval envelope shape (`{ok:true, count, backlinks, truncated?}` vs `{ok:false, code, detail}`), asserted by handler tests via the eval-envelope discriminated-union schema.
- ADR-003 governs the `target_mode` discriminator contract; this BI consumes the discriminator unchanged.
- ADR-010 governs the tool name (`backlinks` — single-word verbatim from the upstream `obsidian backlinks` subcommand; parallels `links` BI-025, `outline` BI-023, `files` BI-019, `properties` BI-024).

**Scale/Scope**: ~220 LOC of new source code split across `schema.ts` / `handler.ts` / `index.ts` / `_template.ts` (slightly larger than BI-025's ~195 LOC because of the three extra schema flags and the per-source aggregation step). ~1200 LOC of co-located tests across three `*.test.ts` files (target: ~22 schema / ~30 handler / ~5 registration = ~57 tests, exceeding SC-024's floor of 20). One new doc at `docs/tools/backlinks.md` (~200 lines including ≥4 worked examples + per-error-code roster + with_counts mode example + total-only mode example + multi-vault note + self-reference note + frontmatter-inclusion note + non-`.md` rejection note + cap-and-truncate note + output-cap ceiling). One line of update each in [src/server.ts](../../src/server.ts) (registration + import), [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) (FR-026 baseline roll-forward), [docs/tools/index.md](../../docs/tools/index.md) (summary), [package.json](../../package.json) (description + version bump — PATCH per BI-023 / BI-024 / BI-025 precedent for additive surface), [CHANGELOG.md](../../CHANGELOG.md) (release entry).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.5.0 (ratified 2026-05-03, last amended 2026-05-15) — five Principles + four ADR-gates. Pre-research evaluation:

| Gate | Status | Evidence |
|------|--------|----------|
| Principle I (Modular Code Organization) | **Y** | New `src/tools/backlinks/` with `{schema, handler, index, _template}.ts` + co-located tests, mirroring the BI-025 `links/` module shape. Imports flow one-directionally: `backlinks/handler.ts → cli-adapter` (peer), `backlinks/handler.ts → tools/_shared.ts` (sibling helper for `composeEvalCode`), `backlinks/schema.ts → target-mode/target-mode.ts` (peer), `backlinks/index.ts → tools/_register.ts` (sibling factory). No upward / cyclic dependencies. No reach into `server.ts` or any boot-time factory at runtime — `Logger` and `Queue` are injected via `ExecuteDeps`. |
| Principle II (Public Surface Test Coverage) | **Y** | New typed-tool surface ships with happy-path + failure-or-boundary tests co-located as `schema.test.ts` / `handler.test.ts` / `index.test.ts`. Test inventory (~57 cases — see [data-model.md](data-model.md) Test Inventory section) covers all six User Stories and 30 Success Criteria; explicit cases for the two clarifications (Q1 total-mode cap bypass, Q2 source-corpus `.md`-only restriction). The post-010 consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) automatically covers `backlinks` via its `it.each` registry walk. The BI-022 FR-026 baseline detector ([src/tools/_register-baseline.test.ts](../../src/tools/_register-baseline.test.ts)) requires a one-shot `npm run baseline:write` to roll the baseline forward. |
| Principle III (Boundary Input Validation with Zod) | **Y** | Strict zod input schema `backlinksInputSchema = applyTargetModeRefinement(targetModeBaseSchema.extend({ with_counts: z.boolean().optional(), total: z.boolean().optional(), limit: z.number().int().min(1).max(10000).optional() }))`. Single source of truth — `z.infer` for downstream types. Schema is the published MCP `inputSchema`. `.strict()` rejects unknown keys (FR-006). Output schema `backlinksOutputSchema = z.object({ count: nonneg int, backlinks: array(backlinkEntrySchema), truncated: bool optional }).strict()` with `backlinkEntrySchema = z.object({ source: string, count: positive int optional }).strict()`. Eval-envelope wire schema `backlinksEvalResponseSchema = z.discriminatedUnion('ok', [{ok:true, count, backlinks, truncated?}, {ok:false, code, detail}])` is the contract assertion against the eval JS's emitted shape. `registerTool` parses input via `schema.parse` before the handler runs (auto-wrap `ZodError → VALIDATION_ERROR` with `details.issues`). Handler trusts validated input. |
| Principle IV (Explicit Upstream Error Propagation) | **Y** | Zero new top-level error codes (FR-023). Failures flow through `VALIDATION_ERROR` (zod) and the inherited `UpstreamError` codes from the cli-adapter (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`). The 011-R5 unknown-vault response-inspection clause FIRES for `backlinks` per R5 (eval-cohort). The handler's two parse-failure paths (`json-parse`, `envelope-parse`) and three envelope-error paths (`NO_ACTIVE_FILE`, `FILE_NOT_FOUND`, `NOT_MARKDOWN`) surface as `CLI_REPORTED_ERROR` with `details.stage` discriminators — same shape as BI-025. `registerTool`'s catch blocks propagate `UpstreamError` via `asToolError` and re-throw any other exception. No `catch + return null/empty/default` patterns. The zero-new-codes streak extends to the **thirteenth eval-cohort tool** and the **nineteenth typed tool overall**. |
| Principle V (Attribution & Layered Composition) | **Y** | Every new source file (`src/tools/backlinks/{schema, handler, index, _template}.ts` + three `*.test.ts`) carries `// Original — no upstream. <one-line description>.` header per FR-030. The Markdown doc at `docs/tools/backlinks.md` is exempt per the [005-help-tool](../005-help-tool/spec.md) FR-019 convention. README's Attributions section is unchanged (no new lifted code; the wrapper is original logic over the upstream `eval` subcommand and Obsidian's metadataCache API). |
| ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand) | **Y** | Tool name `backlinks` is the **single-word verbatim from upstream** — `obsidian backlinks` is the native subcommand (verified by reference in the BI-025 spec's out-of-scope clause; F1 live probe confirms presence at ship). Parallels `links` (BI-025), `outline` (BI-023), `files` (BI-019), `properties` (BI-024). No reversal step needed (the upstream subcommand is single-word, not composite like `property:read`). See R1 for the full ADR-010 application trace. |
| ADR-013 (Plugin-Namespace Tool Naming Convention) | **N/A** | Native-CLI wrapper; no plugin involvement. |
| ADR-014 (Plugin-Backed Typed Tools Runtime-Dependency Pattern) | **N/A** | Native-CLI wrapper; no plugin runtime-dependency lifecycle states. |
| ADR-015 (Sub-Discriminators via details.reason for Multi-State Error Codes) | **N/A** | No new `(top-level-code, details.code)` pair introduced. The unknown-vault path reuses `CLI_REPORTED_ERROR(code: 'VAULT_NOT_FOUND')` from the cli-adapter's 011-R5 inherited classifier — no new sub-states. The three envelope-error paths (`NO_ACTIVE_FILE`, `FILE_NOT_FOUND`, `NOT_MARKDOWN`) reuse exactly the BI-025 codes — no new pairs introduced. No multi-state-sub-discrimination is needed. |

All nine gates pass. **No Complexity Tracking entries required.** Post-design re-evaluation in [Phase 1 Outputs](#phase-1-outputs) confirms the gates remain satisfied — the design does not introduce any deviation from the pre-research baseline.

### Graph-grounding (per CLAUDE.md guidance)

The plan touches THREE of the four kernel god-nodes per the CLAUDE.md "Knowledge Graph" section's validated architectural facts:

- **`createServer()`** (god-node, ~30+ raw degree). Touched: one new line in the `tools` array of `createServer` to invoke `createBacklinksTool({ logger, queue })`, plus one new import at the top of `server.ts`. The change is additive and minimal — does not alter the boot-spine shape; this is the canonical seam every prior typed tool has used. No new construction of `createLogger()` / `createQueue()` (they are constructed once in `createServer` and injected — unchanged).
- **`UpstreamError`** (god-node, ~47 raw degree, ~33 importers, 0 callers — pure value type per CLAUDE.md). Touched: `backlinks/handler.ts` becomes the 34th importer. The handler constructs `UpstreamError` instances at the same five sites BI-025 uses: `json-parse`, `envelope-parse`, `NO_ACTIVE_FILE`, `FILE_NOT_FOUND`, `NOT_MARKDOWN`. Zero new top-level codes (Principle IV streak preserved). Structurally this extends the existing `UpstreamError`-centred star — does not break the star shape.
- **`createLogger()` / `createQueue()`** (god-nodes, ~80 / ~57 raw degree). NOT touched at the construction site — the new handler receives them via injected `ExecuteDeps`, matching the project's DI discipline. The `createBacklinksTool` factory passes them straight to `invokeCli` calls (same shape as `createLinksTool`).

The plan also touches THREE of the BI-spanning communities per the graph's known cluster structure:

- **`src/tools/` community** — gains a new `backlinks/` sub-cluster of four production files + three test files. New sub-cluster is structurally homologous to the existing `links/` sub-cluster (mirror — outgoing vs inbound). No structural surprise; community placement is predictable.
- **`src/target-mode/` community** — `backlinks/schema.ts` adds a new importer of `applyTargetModeRefinement` (already imported by ~10 other tool schemas). No widening of the target-mode community's exports.
- **`src/cli-adapter/` community** — `backlinks/handler.ts` adds a new caller of `invokeCli` (already called by ~15 other handlers). No widening of the cli-adapter's exports; the four-priority error-classification surface is consumed unchanged.

`/speckit-analyze` MUST verify post-implementation that the new `backlinks/` sub-cluster lands inside the `src/tools/` community (not its own orphan community) and that no production handler reaches back into `server.ts`'s composition root (CLAUDE.md Phase Validation rule 2).

## Project Structure

### Documentation (this feature)

```text
specs/036-get-backlinks/
├── plan.md                                       # This file (/speckit-plan command output)
├── research.md                                   # Phase 0 — design decisions R1..R12 + live-CLI probes F1..F4 + Constitution Compliance pre-evaluation + graph-grounding analysis
├── data-model.md                                 # Phase 1 — input/output/eval-envelope schema shapes, JS template, base64 payload, per-tool invariants, module LOC budget, test inventory
├── quickstart.md                                 # Phase 1 — caller-facing walkthroughs (named target; active mode; with_counts; total-only; cap-and-truncate; self-reference; unresolved-target error)
├── contracts/                                    # Phase 1 — published-shape contracts for the MCP wire
│   ├── input.md                                  # backlinks input schema
│   ├── output.md                                 # backlinks output schema (default / with_counts / total / truncated variants)
│   └── errors.md                                 # error envelope roster (all inherited)
├── checklists/
│   └── requirements.md                           # Quality checklist from /speckit-specify (16/16 pass)
└── tasks.md                                      # Phase 2 output (created by /speckit-tasks, NOT by this command)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── _register.ts                              # NO CHANGE (registerTool factory unchanged)
│   ├── _register.test.ts                         # NO CHANGE (registry walk auto-covers backlinks)
│   ├── _register-baseline.json                   # MODIFY: add "backlinks" entry (FR-026 baseline roll-forward via `npm run baseline:write`)
│   ├── _register-baseline.test.ts                # NO CHANGE (baseline detector unchanged)
│   ├── _shared.ts                                # NO CHANGE (composeEvalCode + B64_PAYLOAD_DECODE_EXPR consumed unchanged)
│   ├── backlinks/                                # NEW MODULE
│   │   ├── schema.ts                             # NEW: backlinksInputSchema + backlinksOutputSchema + backlinksEvalResponseSchema (zod)
│   │   ├── schema.test.ts                        # NEW: ~22 schema test cases (target_mode XOR rules, optional fields, limit range, strict additionalProperties, JSON Schema round-trip)
│   │   ├── handler.ts                            # NEW: executeBacklinks — single invokeCli + JSON.parse + safeParse + envelope-error → UpstreamError mapping (parity with BI-025)
│   │   ├── handler.test.ts                       # NEW: ~30 handler test cases (single-call shape, happy-path + counts + total + cap + truncated; self-reference; alias attribution; frontmatter inclusion; code-block exclusion; .canvas source exclusion; .canvas target rejection; unresolved-locator; no-active-file; unknown-vault via 011-R5)
│   │   ├── index.ts                              # NEW: createBacklinksTool factory + BACKLINKS_TOOL_NAME constant + BACKLINKS_DESCRIPTION constant
│   │   ├── index.test.ts                         # NEW: ~5 registration cases (factory shape, descriptor schema, description present, deps wired)
│   │   └── _template.ts                          # NEW: frozen JS template + JS_TEMPLATE export; consumes shared B64_PAYLOAD_DECODE_EXPR
│   ├── links/                                    # NO CHANGE (the outgoing-links sibling; backlinks is its mirror)
│   ├── context_search/                           # NO CHANGE
│   ├── search/                                   # NO CHANGE
│   └── help/                                     # MODIFY: add backlinks help content (per FR-026 — at least 4 worked examples + error roster + with_counts/total examples + practical-ceiling note + cross-pointer to links)
├── cli-adapter/                                  # NO CHANGE (inherited)
├── errors.ts                                     # NO CHANGE (zero new codes)
├── target-mode/                                  # NO CHANGE (applyTargetModeRefinement consumed unchanged)
└── server.ts                                     # MODIFY: import createBacklinksTool + insert into tools array (alphabetical: between `_register` block and createContextSearchTool — `b` < `c`)

specs/
└── 036-get-backlinks/                            # this BI's docs (above)

docs/
├── tools/
│   ├── backlinks.md                              # NEW: progressive-disclosure help content (per FR-026)
│   └── index.md                                  # MODIFY: one-line summary for backlinks

.specify/
└── feature.json                                  # ALREADY rotated to 036-get-backlinks (post-scaffold commit b347f41)

CLAUDE.md                                         # MODIFY at end of Phase 1: rotate plan reference between <!-- SPECKIT START --> / <!-- SPECKIT END --> markers from specs/035-context-search/plan.md to specs/036-get-backlinks/plan.md

CHANGELOG.md                                      # MODIFY at /speckit-implement: add release entry for backlinks tool

package.json                                      # MODIFY at /speckit-implement: description + version bump (PATCH per additive-surface precedent)
```

**Structure Decision**: single project (TypeScript MCP server). Selected because the constitution + every prior BI uses this structure; no app split, no monorepo. New tool slots into the existing `src/tools/` per-surface directory layout (Principle I `{schema, tool, handler}.ts` pattern, instantiated in this project as `{schema, handler, index, _template}.ts` — `index.ts` is the per-tool factory entry, `_template.ts` is the frozen eval JS template per the BI-014 / BI-015 / BI-025 eval-cohort convention).

## Implementation order (advisory; binding ordering lives in `tasks.md` produced by `/speckit-tasks`)

The plan recommends the following implementation order. The full dependency-ordered task list is produced by `/speckit-tasks`; the order below is a sketch for the reviewer.

1. **Schemas first** (`backlinks/schema.ts` + `schema.test.ts`) — the input contract is the most-cited reference for handler tests. Test parity with `links/schema.test.ts` plus two new families: `with_counts` boolean (default false, invalid non-boolean rejection) and `limit` integer (range `1..10000`, invalid out-of-range rejection).
2. **JS template** (`backlinks/_template.ts`) — the frozen eval JS with the target-resolver, `.md` filter, per-source aggregation, sort, cap, and envelope-emission steps. Consumes `B64_PAYLOAD_DECODE_EXPR` from `_shared.ts`. No tests of its own — exercised end-to-end by the handler tests.
3. **Handler shell** (`backlinks/handler.ts`) — single-call happy path first (zero new infrastructure); mock-based tests for the BI-025-parity points (target resolution, three envelope-error paths, two parse-failure paths, unknown-vault via 011-R5). Re-uses the BI-025 handler's exact shape: `composeEvalCode` → `invokeCli` → stdout `=> ` strip → `JSON.parse` → `safeParse` → envelope-error mapping.
4. **Handler extensions** — `with_counts`-on path (verify per-source `count` integer), `total`-on path (verify FR-005a cross-mode invariant under Q1 — full pre-cap count + empty array + no `truncated`), cap-and-truncate path (verify `truncated: true` and post-cap length under `!a.total`), `.md`-source-only filter (verify `.canvas` source excluded per Q2), self-reference inclusion (verify FR-013).
5. **Registration** (`backlinks/index.ts` + `server.ts` modification + baseline JSON update). The `_register-baseline.json` change is the FR-026 lock that catches future drift in this name.
6. **Help-tool content** (`docs/tools/backlinks.md` + `docs/tools/index.md`). Per FR-026: full input contract, output shape for all three modes, failure-mode roster, practical ceiling (FR-010 + FR-024), at least four worked examples, cross-pointer to `links` (BI-025).
7. **Release plumbing** — `CHANGELOG.md` entry, `package.json` description + version bump.
8. **Live-CLI characterisation (T0 pass per FR-028)** — exercise the 20 enumerated cases against `TestVault-Obsidian-CLI-MCP` (per the `.memory/test-execution-instructions.md` protocol — read before any live-CLI invocation). Persist findings as `research-t0.md` if any case deviates from the eval-cohort precedent.
9. **Quality gates** — `npm run lint`, `npm run typecheck`, `npm run build`, `vitest run`, coverage thresholds.

## Phase 0 outputs

[research.md](research.md) — 12 decisions (R1..R12) + 4 live-CLI probes (F1..F4) + Constitution Compliance pre-evaluation + kernel-node graph-grounding analysis. Spec corrections (if any surface at probe time) folded back into [spec.md](spec.md) at plan-finalisation.

## Phase 1 outputs

[data-model.md](data-model.md) — entity shapes, wire shapes, input/output zod-derived contracts, JS template walkthrough, test inventory.

[contracts/input.md](contracts/input.md), [contracts/output.md](contracts/output.md), [contracts/errors.md](contracts/errors.md) — published-shape contracts for the MCP wire.

[quickstart.md](quickstart.md) — caller-facing walkthroughs (named-target happy path; active-mode happy path; `with_counts: true` per-source multiplicity; `total: true` count-only; cap-and-truncate signal; self-reference inclusion; unresolved-target error; unknown-vault error).

**Agent-context update** — [CLAUDE.md](../../CLAUDE.md) plan reference rotated from `specs/035-context-search/plan.md` to `specs/036-get-backlinks/plan.md` (between the `<!-- SPECKIT START -->` / `<!-- SPECKIT END -->` markers).

**Post-design Constitution Check** — re-evaluated after the Phase 1 artifacts above. All nine gates still pass; no design step introduced any deviation. Specifically: (i) the data-model uses zod as the single source of truth (Principle III); (ii) contracts/ duplicates no shape that isn't already in zod (no drift hazard); (iii) the error envelope roster is verbatim the inherited cli-adapter envelopes (Principle IV zero-new-codes preserved); (iv) the new module's import direction stays one-way to existing modules (Principle I no cycles).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. All nine Constitution gates pass on both the pre-research and post-design evaluations. No `N` entries on the Compliance checklist; no Complexity Tracking rows.
