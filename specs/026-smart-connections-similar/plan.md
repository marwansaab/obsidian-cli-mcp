# Implementation Plan: Smart Connections Similar — Semantic Similarity for a Single Note

**Branch**: `026-smart-connections-similar` | **Date**: 2026-05-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [/specs/026-smart-connections-similar/spec.md](./spec.md)

## Summary

Add `smart_connections_similar`, the **twelfth** typed-tool wrap and the project's **first plugin-backed typed surface** — semantic-similarity nearest-neighbour listing for a single named note, sourced from the Smart Connections plugin's similarity index. Where every prior typed tool wraps a native Obsidian CLI subcommand directly (or via `eval` over `app.metadataCache` per BI-014 / BI-015 / BI-025), this BI reaches into `app.plugins.plugins["smart-connections"].env.smart_sources` from inside an `eval` invocation. The user-facing tool surface: `smart_connections_similar({ target_mode, vault?, file?, path?, limit?, total? })` returning `{ count: number, matches: Array<{ path, headingPath, score }> }`. The `total: true` switch returns the count alone with `matches: []` for a token-economical pre-flight read.

**Technical approach** (load-bearing decisions discovered AND live-probe-verified at plan stage during the clarify sessions on 2026-05-15):

- **CLI subcommand: `eval`** (R2 / F2). No native Obsidian CLI subcommand exists for similarity queries; the Smart Connections plugin's similarity API is reached via `app.plugins.plugins["smart-connections"].env.smart_sources.items[<key>].find_connections({limit: N})` from inside the eval JS template. Parity with BI-014 / BI-015 / BI-025 (eval-driven cohort).
- **Single-call architecture branched at envelope-emission on `a.total`** (R3). ONE `invokeCli` per request with `subcommand: 'eval'` and `parameters.code: <rendered-js>`. The same eval JS computes the full match array regardless of mode; the `a.total` branch at envelope-emission decides whether `matches` carries the entries or is `[]`. Cross-mode invariant (FR-006a) holds by construction.
- **STANDARD `target_mode` discriminator** per ADR-003 (R4). Schema consumes `targetModeBaseSchema` + `applyTargetModeRefinement` from [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts), extended with optional `limit` (`z.number().int().min(1).max(100).default(20)`) and optional `total` (`z.boolean().optional()`). Parity with `read` / `outline` / `read_heading` / `read_property` / `set_property` / `links`.
- **`vault=<name>` routes correctly on `eval`** (R5 / F1). The premise carried forward in BI-014 / BI-015 / BI-025 spec drafts that "vault= is silently honoured-as-noop by eval" was incorrect for this BI's probed CLI version. Live probe on 2026-05-15 confirmed `app.vault.getName()` inside the eval returns the requested vault's name, NOT the focused-window vault's name. Implication: the existing 011-R5 "Vault not found." inspection clause continues to fire for UNREGISTERED vault (`details.reason` absent or `"unknown"`); a NEW detection path handles registered-but-closed vaults (per F7 below).
- **Closed-but-registered vault detection** (R5a / F7 / F8 / F9). Live probe on 2026-05-15 after the user closed two registered vaults confirmed the CLI emits **empty stdout + exit 0** for the first eval call against a closed registered vault AND **transparently opens the vault** as a side effect. The cli-adapter's existing 011-R5 clause does NOT fire (no `Vault not found.` string in empty output). Wrapper detects via the signature `{empty stdout, exit 0, vault= supplied, vault present in 'obsidian vaults' output}` and surfaces `CLI_REPORTED_ERROR(details.code = "VAULT_NOT_FOUND", details.reason = "not-open")`. Detection locus locked at plan stage to **the typed-tool handler** (NOT the cli-adapter dispatch layer) — see R5a Decision below.
- **Anti-injection via base64 JSON payload + frozen JS template** (R6). User-supplied `vault` / `file` / `path` flow through `JSON.stringify → Buffer.from.toString('base64') → atob/JSON.parse at JS runtime`. Frozen JS template with single `__PAYLOAD_B64__` substitution point. Parity with BI-014 / BI-015 / BI-025.
- **Block-level match granularity** (R7 / F4 / F5 / F6). Live probe confirmed `find_connections()` returns BLOCK-level matches by default. Each result is `{item: {key: "Folder/Note.md#H1#H2"}, score: number}`. Wrapper performs in-eval transform per match: (a) extract `path` = everything before first `#`; (b) extract `headingPath` = array of segments after first `#` split on `#` (empty array `[]` for source-level matches; literal `["---frontmatter---"]` for frontmatter-block matches with the plugin's sentinel preserved verbatim); (c) pass-through `score`.
- **Three-level sort intra-eval** (R8 / FR-008). Primary `score` descending; secondary `path` byte-compare ascending; tertiary `headingPath.join("#")` byte-compare ascending. Deterministic across repeat calls; no `localeCompare`.
- **Source-path-keyed self-exclusion + non-finite-score filter** (R9 / R10 / FR-009a / FR-010). Two in-eval post-fetch filters run in sequence: `Number.isFinite(score)` drops bad-score entries (silent — per Q2 clarification); `m.path !== sourcePath` drops the source note AND any block inside it (per Q3 live-probe amendment — block-level matches inside the source would otherwise dominate short notes).
- **In-eval `f.extension === 'md'` guard** (R12 / FR-013). Smart Connections only embeds `.md` by default; non-Markdown source locators surface as `CLI_REPORTED_ERROR(NOT_MARKDOWN)` before reaching the plugin. Parity with BI-025.
- **SOURCE_NOT_INDEXED via `env.smart_sources.items[key]` absence** (R11 / FR-014). When the source `.md` file exists in the vault but `env.smart_sources.items[<key>]` returns `undefined`, the wrapper emits `SOURCE_NOT_INDEXED` (distinct from FILE_NOT_FOUND which fires when the file doesn't exist at all).
- **Error-precedence chain** (R13 / FR-017b). Outer-to-inner / cheapest-first; each discriminator is the FIRST condition in the chain that fails. Specific mode: `VAULT_NOT_FOUND(unknown)` → `VAULT_NOT_FOUND(not-open)` → `SMART_CONNECTIONS_NOT_INSTALLED` → `FILE_NOT_FOUND` → `NOT_MARKDOWN` → `SMART_CONNECTIONS_NOT_READY` → `SOURCE_NOT_INDEXED` → success. Active mode skips the vault steps.
- **Zero new top-level error codes** (FR-021). All eight failure modes surface through `CLI_REPORTED_ERROR` with `details.code` discriminator (`VALIDATION_ERROR` is the schema-layer error; `VAULT_NOT_FOUND` has a `details.reason` sub-discriminator). The eleven-tool zero-new-top-level-codes streak since BI-011 is preserved.
- **Plugin-namespace tool name** (R14). The new naming convention `<plugin_name>_<operation>` is codified in ADR-013 (created during this plan phase per FR-029). The convention is distinct from ADR-010's single-word-verbatim-from-upstream rule, which applies only to wrappers of native Obsidian CLI subcommands.
- **Schema**: `smartConnectionsSimilarInputSchema = applyTargetModeRefinement(targetModeBaseSchema.extend({ limit: z.number().int().min(1).max(100).default(20), total: z.boolean().optional() }))`.
- **Output schema**: `z.object({ count, matches }).strict()` with per-entry `z.object({ path, headingPath, score }).strict()` (FR-007). Uniform envelope across both modes — count-only sets `matches: []`. No discriminated union.
- **Eval-envelope wire schema**: `z.discriminatedUnion("ok", [...])` strict. `{ ok: true, count: number, matches: Array<{path, headingPath, score}> }` on success; `{ ok: false, code: "FILE_NOT_FOUND" | "NOT_MARKDOWN" | "NO_ACTIVE_FILE" | "SMART_CONNECTIONS_NOT_INSTALLED" | "SMART_CONNECTIONS_NOT_READY" | "SOURCE_NOT_INDEXED" | "VAULT_NOT_FOCUSED-stub-removed", detail: string }` on failure. (The closed-vault `not-open` discriminator does NOT travel via the envelope — it is detected by the handler from the dispatch-layer's empty-stdout response.)
- **Registration**: via existing `registerTool` factory — auto-applies `stripSchemaDescriptions`, wraps `ZodError → VALIDATION_ERROR`, propagates `UpstreamError → asToolError`, JSON-serialises typed output into the MCP `content[0].text` envelope. Alphabetical insertion at [src/server.ts](../../src/server.ts) tools array — between `createSetPropertyTool` and `createWriteNoteTool` (post-022 ASCII-alphabetical: `set_property/` < `smart_connections_similar/` < `write_note/`).
- **FR-018-from-022 baseline roll-forward**: the new tool's fingerprint added to [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) via `npm run baseline:write` post-implementation.
- **Plan-phase ADR + architecture deliverables per FR-029 / FR-030 / FR-030a** (per user input on `/speckit-specify`): ADR-013 created; the architecture snapshot file populated as a BI-026-frozen historical artefact; the canonical base architecture file rolled forward. Both architecture files share BI-026-time content; the base file is the forward-going source-of-truth for future BIs.

## Technical Context

**Language/Version**: TypeScript (strict mode, `tsc --noEmit` clean) — pinned in [tsconfig.json](../../tsconfig.json), runtime Node.js >= 22.11 per `engines.node` in [package.json](../../package.json).
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP transport), `zod` (validation, single source of truth per Constitution III), `zod-to-json-schema` (consumed via the existing `toMcpInputSchema` helper at [src/tools/_shared.ts](../../src/tools/_shared.ts)). **Runtime dependency** added beyond the existing Obsidian CLI binary + Obsidian: the Smart Connections plugin (free version, ≥ minimum-probed-version locked at plan stage and surfaced in `docs/tools/smart_connections_similar.md` per the 2026-05-15 clarifications session Q1).
**Storage**: N/A — the tool is stateless. The CLI's `eval` subcommand reaches Obsidian's `app.plugins.plugins["smart-connections"].env.smart_sources` for the resolved source; the wrapper just shells out and parses stdout. No caching across requests.
**Testing**: vitest with `@vitest/coverage-v8`. Co-located `*.test.ts` per module. The aggregate statements coverage threshold floor is **91.3%** ([vitest.config.ts:20](../../vitest.config.ts#L20)). Tests inject the cli-adapter's stub `spawnFn` via `deps.spawnFn` per the existing test-seam convention; no real `obsidian` binary executions in CI. Each handler test responds to ONE spawn invocation per request (single-call architecture per R3). Base64 round-trip assertion locks R6.
**Target Platform**: cross-platform Node.js MCP server (Windows / macOS / Linux). The host shells out to the Obsidian CLI binary via `child_process.spawn`. CLI subcommand `eval` is OS-independent. Smart Connections plugin is OS-independent (the indexing model is configurable; transformers.js default is OS-independent JavaScript; OpenAI-API config requires outbound HTTPS).
**Project Type**: MCP server with one new typed tool. Per Constitution v1.3.0, the project exposes "an MCP server surface" only; `smart_connections_similar` adds one entry to the registered-tool list at [src/server.ts](../../src/server.ts) (alphabetical: between `createSetPropertyTool` and `createWriteNoteTool`).
**Performance Goals**: per-call latency ~100–800 ms (single eval CLI invocation; the eval JS executes a plugin-API call inside Obsidian's already-warm process — no file I/O, no embedding generation per call; the plugin's `find_connections()` is in-memory vector similarity over the pre-built index). Token saving is the primary win — for a similarity query against a vault with thousands of notes, the response at `limit: 20` is on the order of 1–3 KB; the alternative (client-side embedding + vector search) requires the agent to host its own embedding model AND duplicates the plugin's already-indexed work. Per SC-018.
**Constraints**:
- 10 s per-call timeout, 10 MiB output cap (typed-tool defaults applied automatically by `invokeCli`).
- Single-in-flight CLI queue gates all CLI invocations.
- 008-refactor surface frozen — `dispatchCli`, `invokeCli`, `invokeBoundedCli`, the in-flight registry, the four-priority error classification, the `obsidian_exec` argv-assembly contract, the `assertToolDocsExist` aggregator, the 011-R5 unknown-vault response-inspection clause are all frozen. `smart_connections_similar` inherits without modification; the closed-vault detection (FR-017a, `details.reason: "not-open"`) lives in the typed-tool handler per R5a Decision, NOT in the cli-adapter.
- The upstream CLI's `eval` subcommand reaches the Smart Connections plugin's API path; future plugin updates may surface as test failures (handler tests asserting against the eval JS's emitted shape will catch API-path drift). Plugin-version drift falls through to `SMART_CONNECTIONS_NOT_READY` per Q1 — docs-only soft-pin, no runtime version check.
- ADR-003 governs the `target_mode` discriminator contract; this BI consumes the discriminator unchanged.
- **NEW** — ADR-013 governs the plugin-namespace tool-naming convention (`<plugin_name>_<operation>`); this BI establishes the precedent (`smart_connections_similar` is the first such tool).

**Scale/Scope**: ~230 LOC of new source code split across `schema.ts` / `handler.ts` / `index.ts` (handler is heavier than BI-025's because of the closed-vault detection branch + non-finite-score filter + source-path-keyed self-exclusion + plugin-lifecycle checks). ~1280 LOC of co-located tests across three `*.test.ts` files (20 schema / 32 handler / 5 registration = 57 tests, exceeding SC-021's floor of 50). One new doc at `docs/tools/smart_connections_similar.md` (~220 lines including ≥4 worked examples + per-error-code roster including the three plugin-lifecycle codes + count-only mode example + multi-vault basename ambiguity note + non-`.md` rejection note + headingPath shape note + minimum-plugin-version soft-pin note + output-cap ceiling). One line of update each in [src/server.ts](../../src/server.ts) (registration + import), [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) (baseline roll-forward), [docs/tools/index.md](../../docs/tools/index.md) (summary), [package.json](../../package.json) (description + version bump 0.5.3 → 0.5.4 — PATCH per BI-023 / BI-024 / BI-025 precedent for additive surface), [CHANGELOG.md](../../CHANGELOG.md) (release entry).

**Plan-phase deliverables outside the standard pattern** (per user input on `/speckit-specify`):
- `.decisions/ADR-013 - Plugin-Namespace Tool Naming Convention.md` (FR-029 — codifies the convention; status `Decided` 2026-05-15).
- `.decisions/Decision Log.md` (one new row for ADR-013).
- `.architecture/Obsidian CLI MCP - Architecture with Smart Connections.md` (FR-030 — BI-026-time-frozen snapshot).
- `.architecture/Obsidian CLI MCP - Architecture.md` (FR-030a — rolled forward to include BI-026 changes; canonical forward-going document for future plugin BIs).
- `.specify/memory/constitution.md` (one new row in the Constitution Compliance checklist for ADR-013, parity with ADR-010's row — version bump 1.3.0 → 1.4.0).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Evidence |
|---|---|---|
| **I. Modular Code Organization** | ✅ PASS | New tool lives at `src/tools/smart_connections_similar/` per the established `{schema, handler, index}.ts` per-surface layout (verified against existing siblings `read`, `delete`, `files`, `read_heading`, `read_property`, `write_note`, `set_property`, `rename`, `find_by_property`, `obsidian_exec`, `outline`, `properties`, `links`, `help`). Downward-flow chain preserved: `index.ts` → `handler.ts` → `cli-adapter` → `child_process.spawn`. No upward or cyclic imports. The schema module imports from `zod` and `target-mode/`; the handler imports from `cli-adapter/` (peer); `index.ts` imports from `_register.ts` (sibling helper). |
| **II. Public Surface Test Coverage** | ✅ PASS | `smart_connections_similar` is a public MCP tool surface. Co-located tests at `src/tools/smart_connections_similar/{schema,handler,index}.test.ts` — **20 schema cases / 32 handler cases / 5 registration cases = 57 tests total**, exceeding SC-021's floor of 50. Happy-path AND failure-path coverage in every layer. The post-010 consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) automatically covers `smart_connections_similar` via its `it.each` registry walk; no test-file modifications required. The BI-022 FR-018 baseline detector ([src/tools/_register-baseline.test.ts](../../src/tools/_register-baseline.test.ts)) requires a one-shot `npm run baseline:write` to roll the baseline forward; that command-line gesture is the acknowledgement that the registry intentionally changed. |
| **III. Boundary Input Validation with Zod** | ✅ PASS | Input schema consumes the existing `targetModeBaseSchema` + `applyTargetModeRefinement` from `src/target-mode/`. Adds two optional fields (`limit: z.number().int().min(1).max(100).default(20)`, `total: z.boolean().optional()`). No `target_mode` re-implementation. Inferred TypeScript type via `z.infer<typeof smartConnectionsSimilarInputSchema>`. **Output type ALSO via zod schema** `smartConnectionsSimilarOutputSchema = z.object({count, matches}).strict()` with the per-entry shape `z.object({path, headingPath, score}).strict()` (FR-007) — no hand-rolled types. The eval-envelope wire schema `smartConnectionsSimilarEvalResponseSchema = z.discriminatedUnion("ok", [...])` is the contract assertion against the eval JS's emitted shape. `registerTool` parses input via `schema.parse` before the handler runs (auto-wrap `ZodError → VALIDATION_ERROR` with `details.issues`). Handler trusts validated input; no defensive checks. |
| **IV. Explicit Upstream Error Propagation** | ✅ PASS | Zero new top-level error codes (per FR-021, Constitution Principle IV). Failures flow through `VALIDATION_ERROR` (zod) and `UpstreamError` codes from the cli-adapter (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`). The 011-R5 unknown-vault response-inspection clause FIRES for unregistered vault via the standard `Vault not found.` path. The handler's NEW closed-vault detection (empty-stdout signature) emits `CLI_REPORTED_ERROR(details.code = "VAULT_NOT_FOUND", details.reason = "not-open")` — same top-level code as the 011-R5 path, distinguished only by `details.reason`. The handler's two parse-failure paths (`json-parse`, `envelope-parse`) and six envelope-error paths (`NO_ACTIVE_FILE`, `FILE_NOT_FOUND`, `NOT_MARKDOWN`, `SMART_CONNECTIONS_NOT_INSTALLED`, `SMART_CONNECTIONS_NOT_READY`, `SOURCE_NOT_INDEXED`) surface as `CLI_REPORTED_ERROR` with `details.code` and `details.stage` discriminators. `registerTool`'s catch blocks propagate `UpstreamError` via `asToolError` and re-throw any other exception. No `catch + return null/empty/default` patterns. |
| **V. Attribution & Layered Composition Transparency** | ✅ PASS | Every new source file (`src/tools/smart_connections_similar/{schema,handler,index}.ts` + three `*.test.ts`) carries the `// Original — no upstream. <one-line description>.` header per the established convention (FR-027). The Markdown doc at `docs/tools/smart_connections_similar.md` is exempt per [005-help-tool](../005-help-tool/spec.md) FR-019. README's Attributions section is unchanged (no new lifted code; the wrapper is original logic over the upstream `eval` subcommand reaching the Smart Connections plugin's API). |
| **ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand)** | ✅ N/A | This tool wraps a plugin-exposed API via `eval`, NOT a single upstream CLI subcommand. ADR-010 explicitly excludes "Tools without a 1:1 CLI anchor — composite or eval-composition tools whose operation has no single upstream subcommand to align to" (point 3 of the ADR's Decision section). The NEW plugin-namespace tool-naming convention codified in ADR-013 (created during this plan phase per FR-029) governs the name `smart_connections_similar`. |

**Coverage gate**: aggregate statements floor is 91.3% ([vitest.config.ts:20](../../vitest.config.ts#L20)); the new tests must not drop the aggregate below this. The new module is ~230 LOC; the 57 co-located test cases provide near-100% coverage of the new module, so the aggregate either stays flat or ratchets up.

**Constitution Compliance checklist** (for the eventual PR): all five principles expected to evaluate as Y; ADR-010 evaluates as N/A (justified above — plugin-backed tool, not native-CLI wrapper); **ADR-013** is NEW and evaluates as Y. No deviations needed; no Complexity Tracking entries required.

**ADR scope check**:
- [ADR-003 — Enforce Target Mode in Typed Tools](../../.decisions/ADR-003%20-%20Enforce%20Target%20Mode%20in%20Typed%20Tools.md) IS APPLICABLE — `smart_connections_similar` operates on a single named file (specific) or focused file (active). The schema consumes `targetModeBaseSchema` + `applyTargetModeRefinement` from `src/target-mode/target-mode.ts`. No deviation; no ADR amendment.
- [ADR-005 — Token-Optimized Tool Definitions](../../.decisions/) reaffirmed; `stripSchemaDescriptions` applied at registration via `registerTool` (auto).
- [ADR-006 — Centralized Tool Registration](../../.decisions/) reaffirmed; `registerTool` factory wraps schema parse + UpstreamError propagation + JSON serialisation.
- [ADR-010 — Typed Tool Names Mirror Upstream CLI Subcommand](../../.decisions/) IS NOT APPLICABLE — this tool's name comes from the new ADR-013 convention (plugin-backed tools, no 1:1 CLI subcommand anchor).
- **ADR-013 — Plugin-Namespace Tool Naming Convention** is NEW, created during this plan phase per FR-029. Governs the name `smart_connections_similar`.

## Project Structure

### Documentation (this feature)

```text
specs/026-smart-connections-similar/
├── plan.md                                          # This file
├── research.md                                      # Phase 0 — design decisions R1–R14 + plan-stage live-CLI/plugin findings F1–F14
├── data-model.md                                    # Phase 1 — input/output/eval-envelope schema shapes, JS template, base64 payload, per-tool invariants, module LOC budget, test inventory (57 cases), architectural delta map
├── quickstart.md                                    # Phase 1 — verification scenarios mapped to SC-001..SC-028
├── contracts/
│   ├── smart-connections-similar-input.contract.md   # Public input contract — zod schema + emitted JSON Schema + worked examples + error roster + out-of-scope upstream surfaces
│   └── smart-connections-similar-handler.contract.md # Handler invariants — single invokeCli call shape, JS template render, multi-stage parse step, closed-vault detection branch, envelope-error mapping, failure propagation chain
├── checklists/
│   └── requirements.md                               # Quality checklist from /speckit-specify (16/16 pass) + clarifications-session 2026-05-15 notes (Q1–Q5 + two live-probe amendments)
└── tasks.md                                          # Phase 2 output (created by /speckit-tasks, NOT by this command)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── smart_connections_similar/                   # NEW per-surface module (FR-001)
│   │   ├── schema.ts                                # smartConnectionsSimilarInputSchema + smartConnectionsSimilarOutputSchema + smartConnectionsSimilarEvalResponseSchema + matchEntrySchema + types via z.infer (FR-002..FR-009a, exhaustive-fields lock)
│   │   ├── schema.test.ts                           # 20 cases (target_mode discriminator × specific/active × file/path XOR + limit boundary 1/20/100 + limit out-of-range rejection + non-integer limit rejection + total optional + types + strict + unknown-key + headingPath shape)
│   │   ├── handler.ts                               # executeSmartConnectionsSimilar(input, deps) — frozen JS_TEMPLATE + base64 payload assembly + single invokeCli + CLOSED-VAULT detection branch (empty-stdout signature) + JSON.parse + envelope safeParse + ok:false → UpstreamError mapping (FR-005..FR-018, FR-021)
│   │   ├── handler.test.ts                          # 32 cases (block-level happy + basename happy + active happy + active no-focused + empty result + score-tie path-tiebreak + score-tie headingPath-tiebreak + self-exclusion source-level + self-exclusion block-inside-source + non-finite-score drop + limit cap honored + frontmatter sentinel preserved + unresolved path/file + unknown vault + closed-but-registered vault (empty-stdout detection) + non-md target + cross-mode invariant + base64 round-trip + json-parse / envelope-parse failures + plugin-not-installed + plugin-not-ready + source-not-indexed + output-cap kill + single-spawn-per-request invariant + 6 compound-failure precedence-chain fixtures per FR-017b)
│   │   ├── index.ts                                 # createSmartConnectionsSimilarTool factory via registerTool (FR-022)
│   │   └── index.test.ts                            # 5 registration cases (descriptor name, stripped schema, help mention, doc presence + content completeness, drift-detector + FR-018 baseline lock)
│   ├── _register.ts                                 # FROZEN
│   ├── _register.test.ts                            # FROZEN — drift detector's it.each registry walk auto-covers smart_connections_similar
│   ├── _register-baseline.json                      # ROLLED FORWARD by `npm run baseline:write` post-implementation (FR-018 acknowledgement gate)
│   ├── _register-baseline.test.ts                   # FROZEN
│   ├── _register-baseline.ts                        # FROZEN
│   ├── _shared.ts                                   # FROZEN
│   ├── _shared.test.ts                              # FROZEN
│   ├── help/                                        # FROZEN
│   ├── obsidian_exec/                               # FROZEN
│   ├── outline/                                     # FROZEN (SC-019 — zero substantive diff)
│   ├── properties/                                  # FROZEN (SC-019)
│   ├── links/                                       # FROZEN (SC-019)
│   ├── read/                                        # FROZEN (SC-019)
│   ├── read_heading/                                # FROZEN (SC-019)
│   ├── read_property/                               # FROZEN (SC-019)
│   ├── delete/                                      # FROZEN (SC-019)
│   ├── files/                                       # FROZEN (SC-019)
│   ├── find_by_property/                            # FROZEN (SC-019)
│   ├── set_property/                                # FROZEN (SC-019)
│   ├── rename/                                      # FROZEN (SC-019)
│   └── write_note/                                  # FROZEN (SC-019)
├── server.ts                                        # +2 lines: import + createSmartConnectionsSimilarTool({ logger, queue }) added to the tools array (alphabetical, between createSetPropertyTool and createWriteNoteTool)
├── server.test.ts                                   # registry-consistency test auto-covers smart_connections_similar's docs/ presence (no edits)
├── cli-adapter/                                     # FROZEN (008-refactor surface) — closed-vault detection lives in the typed-tool handler, NOT here, per R5a Decision
├── target-mode/                                     # CONSUMED — schema imports targetModeBaseSchema + applyTargetModeRefinement from target-mode/target-mode.ts
├── help/                                            # FROZEN
├── errors.ts                                        # FROZEN (no new top-level codes per FR-021)
├── logger.ts                                        # FROZEN (per R1 — no callStart/callEnd events introduced)
└── queue.ts                                         # FROZEN

docs/tools/
├── smart_connections_similar.md                     # NEW non-stub doc per FR-022 (input schema with limit/total + headingPath shape, output × 2 modes, full 8-entry error roster including three plugin-lifecycle codes AND the details.reason: "not-open" sub-discriminator, error-precedence chain per FR-017b, 5 documented inherited limitations, minimum probed plugin version soft-pin per Q1, ≥4 worked examples covering specific-mode-by-path / specific-mode-by-file / active-mode / count-only / plugin-not-installed-error / plugin-not-ready-error / source-not-indexed-error / vault-not-open-error / no-active-file-error / validation-rejection)
├── index.md                                         # +1 line entry per the existing convention
├── outline.md                                       # FROZEN
├── properties.md                                    # FROZEN
├── links.md                                         # FROZEN
├── obsidian_exec.md                                 # FROZEN
├── read.md                                          # FROZEN
├── read_heading.md                                  # FROZEN
├── read_property.md                                 # FROZEN
├── delete.md                                        # FROZEN
├── files.md                                         # FROZEN
├── find_by_property.md                              # FROZEN
├── set_property.md                                  # FROZEN
├── rename.md                                        # FROZEN
├── write_note.md                                    # FROZEN
└── help.md                                          # FROZEN

.decisions/
├── ADR-013 - Plugin-Namespace Tool Naming Convention.md   # NEW (per FR-029)
├── Decision Log.md                                        # +1 row for ADR-013
└── (other ADRs)                                           # FROZEN

.architecture/
├── Obsidian CLI MCP - Architecture.md                          # ROLLED FORWARD (per FR-030a — canonical forward-going)
└── Obsidian CLI MCP - Architecture with Smart Connections.md   # POPULATED as BI-026-frozen snapshot (per FR-030)

.specify/memory/
└── constitution.md                                  # +1 checklist row for ADR-013; version bump 1.3.0 → 1.4.0; Sync Impact Report regenerated

CHANGELOG.md                                          # +1 entry under "Unreleased" or 0.5.4 (release versioning is a /speckit-tasks decision)
package.json                                          # version 0.5.3 → 0.5.4 + description string updated to mention smart_connections_similar alongside the existing typed tools
README.md                                             # tools-list section updated (if present); Attributions section unchanged (no new lifted code)
CLAUDE.md                                             # active-narrative block rewritten by Phase 1 step 3 (done in this command run)
```

**Structure Decision**: Single-project layout per the existing project shape. `src/tools/smart_connections_similar/` is the entire functional surface for the typed tool; everything else is one-line wiring (server registration, baseline roll-forward, docs index, package description) or out-of-tree documentation (CHANGELOG, README). The plan-phase ADR + architecture deliverables are out-of-tree but in-repo. No new src/ directories at any other layer. Per Constitution Principle I, the new module is single-purpose (typed semantic-similarity primitive for a single source note); per Principle II, tests are co-located with sources.

## Phase 0: Research Decisions Summary

Full detail in [research.md](./research.md). Brief index of decisions ratified there:

- **R1 — Logger surface**: thin handler. Mirrors all prior typed tools.
- **R2 — CLI subcommand: `eval`** (NOT a native subcommand). No native subcommand exists for similarity queries; Smart Connections plugin's similarity API is reached via `app.plugins.plugins["smart-connections"].env.smart_sources.items[<key>].find_connections({limit: N})` inside eval JS.
- **R3 — Single-call architecture, branched at envelope-emission on `a.total`**: ONE `invokeCli` per request. Same eval JS in both modes; count-only branch lives inside the eval at envelope emission.
- **R4 — Adapter `target_mode` mapping**: STANDARD per ADR-003. Schema consumes `targetModeBaseSchema` + `applyTargetModeRefinement`.
- **R5 — Unknown-vault response inspection**: ACTIVE — cli-adapter's existing 011-R5 clause fires for unregistered vault (`Vault not found.` string emission per F1-ancestor verified at BI-014/015/025 vintage; reconfirmed for this BI's CLI version on 2026-05-15).
- **R5a — Closed-but-registered vault detection**: NEW handler-side detection branch via empty-stdout signature (`empty stdout + exit 0 + vault= supplied + vault present in 'obsidian vaults' output`). The wrapper emits `CLI_REPORTED_ERROR(details.code = "VAULT_NOT_FOUND", details.reason = "not-open")`. Detection lives in the typed-tool handler, NOT in the cli-adapter (the cli-adapter remains frozen per 008-refactor; widening it to detect plugin-tool-specific signatures would couple it to the typed-tool surface in a way the constitution discourages).
- **R6 — Anti-injection**: base64-encoded JSON payload + frozen JS template. Parity with BI-014 / BI-015 / BI-025.
- **R7 — Per-match transform**: in-eval extraction of `{path, headingPath, score}` from the plugin's `{item.key, score}` shape — `path = key.split('#')[0]`; `headingPath = key.split('#').slice(1)`.
- **R8 — Three-level sort intra-eval**: `score` desc / `path` byte-asc / `headingPath.join('#')` byte-asc. NO wrapper-side post-fetch re-sort.
- **R9 — Source-path-keyed self-exclusion**: `.filter(m => m.path !== sourcePath)`. Excludes source AND blocks inside the source note.
- **R10 — Non-finite-score filter**: `.filter(m => Number.isFinite(m.score))`. Silently drops bad-score entries (per Q2 clarification).
- **R11 — SOURCE_NOT_INDEXED detection**: via `env.smart_sources.items[<sourceKey>]` returning `undefined`.
- **R12 — NOT_MARKDOWN guard**: in-eval `f.extension === 'md'` check before reaching plugin.
- **R13 — Error-precedence chain**: outer-to-inner / cheapest-first per FR-017b.
- **R14 — Plugin-namespace tool name**: codified in ADR-013 (created during this plan phase).

**Plan-stage status**: 14 design decisions ratified. **14 live-CLI / live-plugin findings F1–F14** verified during the 2026-05-15 clarify sessions against three open vaults (TestVault-Obsidian-CLI-MCP, The Setup, Ways of Working). Critical findings:

- **F1** (`vault=<name>` on eval routes correctly to the named vault's `app` instance — `app.vault.getName()` returns the requested name, not the focused-window name) → contradicts the spec drafts from BI-014 / BI-015 / BI-025 carried-forward assumption; locks the wrapper's behaviour when the requested vault is OPEN.
- **F2** (no native similarity subcommand; Smart Connections plugin is `app.plugins.plugins["smart-connections"]`) → R2 → eval-driven architecture.
- **F3** (plugin API path: `app.plugins.plugins["smart-connections"].env.smart_sources.items["Folder/Note.md"].find_connections({limit: N})`; async; returns array) → R11 + handler shape.
- **F4** (return shape: `[{item: {key: "Folder/Note.md#H1#H2"}, score: number}]`) → R7 transform.
- **F5** (`find_connections` returns BLOCK-level matches by default; `exclude_blocks: true` filter probed and didn't change results; zero source-level matches observed) → **AMENDMENT to grilling Q3** — v1 ships block-level per-match shape, not source-only. Per Q3-live-probe amendment 2026-05-15.
- **F6** (frontmatter blocks emit key `"Folder/Note.md#---frontmatter---"` — literal plugin sentinel preserved) → wrapper-side R7 transform preserves verbatim.
- **F7** (closed-but-registered vault: eval returns **empty stdout + exit 0** AND transparently OPENS the vault as side effect; second eval call against the now-open vault works normally) → R5a + FR-017a closed-vault detection signature.
- **F8** (cli-adapter's existing 011-R5 inspection clause does NOT fire for closed-vault case — no `Vault not found.` string in empty output) → R5a justifies the new handler-side detection branch.
- **F9** (subsequent eval against the transparently-opened vault works normally) → documents the side-effect transparency in `docs/tools/smart_connections_similar.md`; agents retrying after `not-open` will likely succeed.
- **F10** (Smart Connections installed and indexed in all three probed vaults: TestVault=68 sources, The Setup=450, Ways of Working=22) → confirms cross-vault behaviour.
- **F11** (plugin internals: `Object.keys(.env.smart_sources)` shows the collection has methods incl. `_item_type` and is item-based; per-source `Object.getOwnPropertyNames(...)` reveals `find_connections` method on the source items) → R11 lookup path.
- **F12** (limit-vs-threshold cap: probing `limit: 50` against Home.md returned only 5 results; the plugin's internal threshold caps below the requested limit) → documented as "upper-bound, not guarantee" in `docs/tools/smart_connections_similar.md`; the spec's FR-006 "capped at limit" semantic holds (count reflects what was actually returned).
- **F13** (score values: floats ~0.85-0.86 for closest matches; cosine-similarity-like range with transformers.js model) → embedding-model-dependent score bands inherited limitation #1.
- **F14** (`app.vault.getName()` returns the requested-vault name inside eval when `vault=` arg supplied) → reconfirms F1.

**Cases deferred to T0 of `/speckit-implement`** (require fresh fixtures + targeted state changes that are intrusive at plan stage):

- Active-mode no-focused-file path: requires closing all panes in Obsidian to verify `app.workspace.getActiveFile()` returning null.
- Plugin-uninstalled path: requires temporarily disabling Smart Connections in a vault and probing the response — done in T0 against TestVault.
- Plugin-loaded-but-not-ready path: requires either a fresh vault before indexing completes, OR mocking `env.smart_sources` to be `undefined` — done in handler tests against the stub spawnFn.
- Path-traversal `path` value end-to-end (verify rejection happens, no filesystem mutation).
- Very-large-match-list cap-boundary behaviour (essentially unreachable at `limit: 100` per F12's observation of plugin's internal threshold cap).
- Frontmatter-sentinel preservation end-to-end against a note with a `---frontmatter---` block match (probe-confirmed shape but needs fixture).

## Phase 1: Design Artifacts

Generated in this command run:

- **[research.md](./research.md)** — design decisions R1–R14 + plan-stage live-CLI/plugin findings F1–F14.
- **[data-model.md](./data-model.md)** — input/output/eval-envelope schema shapes, JS template, base64 payload assembly, per-tool invariants table, module LOC budget, test inventory (20 / 32 / 5 = 57 cases), architectural delta map vs predecessors.
- **[contracts/smart-connections-similar-input.contract.md](./contracts/smart-connections-similar-input.contract.md)** — public input contract: zod schema, emitted JSON Schema shape, field policy, worked examples (A–H), error response roster (10 envelope codes including the three plugin-lifecycle codes + `not-open` sub-discriminator), out-of-scope upstream surfaces table.
- **[contracts/smart-connections-similar-handler.contract.md](./contracts/smart-connections-similar-handler.contract.md)** — handler invariants: deps shape, single invokeCli call shape, frozen JS template, multi-stage parse step (closed-vault empty-stdout detection → JSON.parse → envelope safeParse → discriminate on ok), envelope-error → UpstreamError mapping table, failure propagation chain (with diagram), test seam pattern with base64 round-trip, single-spawn invariant.
- **[quickstart.md](./quickstart.md)** — verification scenarios mapped to SC-001..SC-028. The bulk in CI; live-CLI manual cases against TestVault during T0 of /speckit-implement.
- **[.decisions/ADR-013 - Plugin-Namespace Tool Naming Convention.md](../../.decisions/)** — NEW ADR codifying the `<plugin_name>_<operation>` convention per FR-029.
- **[.decisions/Decision Log.md](../../.decisions/Decision%20Log.md)** — +1 row for ADR-013.
- **[.architecture/Obsidian CLI MCP - Architecture with Smart Connections.md](../../.architecture/Obsidian%20CLI%20MCP%20-%20Architecture%20with%20Smart%20Connections.md)** — POPULATED as BI-026-frozen snapshot per FR-030.
- **[.architecture/Obsidian CLI MCP - Architecture.md](../../.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md)** — ROLLED FORWARD to include BI-026 changes per FR-030a.
- **[.specify/memory/constitution.md](../../.specify/memory/constitution.md)** — +1 Constitution Compliance checklist row for ADR-013; version bump 1.3.0 → 1.4.0; Sync Impact Report regenerated.
- **[CLAUDE.md](../../CLAUDE.md) active-narrative block rewrite** — the predecessor narrative for 025-list-links is retained; the new active-narrative for 026-smart-connections-similar is added at the top.
- **No spec amendments at plan stage.** All five clarifications-session decisions (Q1–Q5) AND the two live-probe-driven amendments (post-Q3 vault-routing, post-grilling-Q3 granularity) hold under further live-CLI verification.

## Constitution Re-Check (Post-Design)

| Principle | Compliance | Notes |
|---|---|---|
| I. Modular Code Organization | ✅ PASS | Phase 1 confirmed the per-surface layout; no cross-module imports added beyond the verified set. The single-call architecture (R3) keeps the import topology simple — handler imports cli-adapter only. Schema imports from `target-mode/` for the discriminator (standard pattern). The closed-vault detection branch (R5a) lives entirely in the typed-tool handler — does NOT widen the cli-adapter. |
| II. Public Surface Test Coverage | ✅ PASS | Test-set inventory frozen at 57 cases (20 schema / 32 handler / 5 registration). Drift detector + FR-018 baseline both auto-cover. Each handler test responds to ONE spawn invocation per call per R3. Base64 round-trip assertion in every payload-affecting handler test locks R6. Six dedicated compound-failure precedence-chain fixtures lock FR-017b per SC-011b. |
| III. Boundary Input Validation with Zod | ✅ PASS | Output schema also zod-derived per FR-007 with the uniform `{count, matches}` envelope. The eval-envelope wire schema is a strict discriminated union — locks the eval JS's emitted shape from drifting. The per-entry shape's exhaustive-fields list (FR-007 post-Q3-amendment) forbids plan-stage widening; the `matchEntrySchema` is `.strict()` to enforce this at parse time. The `headingPath` field is `z.array(z.string())` — empty array for source-level matches, single-element `["---frontmatter---"]` for frontmatter blocks, multi-segment for nested-heading blocks. |
| IV. Explicit Upstream Error Propagation | ✅ PASS | Zero new top-level codes confirmed. The handler's two parse-failure paths (`json-parse`, `envelope-parse`) and seven envelope-error paths (`NO_ACTIVE_FILE`, `FILE_NOT_FOUND`, `NOT_MARKDOWN`, `SMART_CONNECTIONS_NOT_INSTALLED`, `SMART_CONNECTIONS_NOT_READY`, `SOURCE_NOT_INDEXED`, and the closed-vault `VAULT_NOT_FOUND(not-open)` detected from empty-stdout) wrap as `UpstreamError` with `details.code` / `details.stage` / `details.reason` discriminators — never silent. ALL other failure surfaces (output-cap, binary-not-found, vault-not-found-unknown) flow through the dispatch layer's existing classifier without wrapper involvement. The `ERR_NO_ACTIVE_FILE` vs `CLI_REPORTED_ERROR(NO_ACTIVE_FILE)` choice is locked at T0 per BI-015 / BI-025 precedent alignment. |
| V. Attribution & Layered Composition | ✅ PASS | All new files marked Original. No upstream code lifted. The wrapper is original logic over the Smart Connections plugin's similarity API; the load-bearing original logic is: (a) the closed-vault empty-stdout detection branch; (b) the four-stage in-eval pipeline (lifecycle checks → file/extension checks → source-key lookup → match transform); (c) the three-level sort; (d) the source-path-keyed self-exclusion; (e) the non-finite-score filter. All clearly attributed in the handler header. |
| ADR-010 (Typed Tool Names) | ✅ N/A | Plugin-backed tool, not a 1:1 CLI wrapper. ADR-010 explicitly excludes this case per its point-3 scope clause. |
| **ADR-013 (Plugin-Namespace Tool Naming Convention) — NEW** | ✅ PASS | `smart_connections_similar` follows the `<plugin_name>_<operation>` convention: plugin name `smart-connections` → underscore-joined `smart_connections`; operation `similar`. Codified in ADR-013 which is created in this plan run per FR-029. |

**No Complexity Tracking entries.** No deviations.

## Complexity Tracking

> **No deviations from constitution.** All five principles evaluate as `Y` for this feature; ADR-010 evaluates as `N/A` (out-of-scope per the ADR's own point-3 clause); ADR-013 (the new convention codified in this plan run) evaluates as `Y`. No `N` entries; no Complexity Tracking entries needed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | (n/a)      | (n/a)                               |

**Note on cli-adapter scope**: the closed-vault detection branch (R5a) lives in the typed-tool handler, NOT in the cli-adapter. The cli-adapter's 008-refactor surface and the 011-R5 unknown-vault inspection clause are FROZEN; widening them to detect plugin-tool-specific empty-stdout signatures would couple the dispatch layer to the typed-tool surface. A future BI may revisit this if a second plugin-backed tool needs the same detection (DRY threshold of two), at which point the detection logic can be lifted into a shared helper or a cli-adapter extension covered by its own ADR.

## Reporting

- **Branch**: `026-smart-connections-similar`
- **Plan path**: `specs/026-smart-connections-similar/plan.md`
- **Generated artifacts**:
  - `specs/026-smart-connections-similar/research.md` — design decisions R1–R14 + plan-stage live-CLI/plugin findings F1–F14
  - `specs/026-smart-connections-similar/data-model.md` — schema shapes, JS template, base64 payload, test inventory (57 cases), architectural delta map
  - `specs/026-smart-connections-similar/contracts/smart-connections-similar-input.contract.md` — public input contract + worked examples + error roster + out-of-scope upstream surfaces
  - `specs/026-smart-connections-similar/contracts/smart-connections-similar-handler.contract.md` — handler invariants (single-call shape, JS template, closed-vault detection branch, parse step, envelope mapping, failure chain)
  - `specs/026-smart-connections-similar/quickstart.md` — verification scenarios mapped to SC-001..SC-028
  - `.decisions/ADR-013 - Plugin-Namespace Tool Naming Convention.md` — NEW ADR (per FR-029)
  - `.decisions/Decision Log.md` — +1 row for ADR-013
  - `.architecture/Obsidian CLI MCP - Architecture with Smart Connections.md` — POPULATED as BI-026-frozen snapshot (per FR-030)
  - `.architecture/Obsidian CLI MCP - Architecture.md` — rolled forward (per FR-030a; canonical forward-going for future plugin BIs)
  - `.specify/memory/constitution.md` — +1 Constitution Compliance checklist row for ADR-013; v1.3.0 → v1.4.0
  - `CLAUDE.md` — active-narrative block rewritten to 026-smart-connections-similar; 025-list-links narrative retained as predecessor
- **Plan-stage spec amendments**: NONE at the initial plan synthesis. All five clarifications-session Q&As (Q1–Q5) AND the two live-probe-driven amendments (post-Q3 vault-routing, post-grilling-Q3 granularity) hold under further live-CLI verification.
- **Architectural cohort**: this BI is in the **eval-driven plugin-backed cohort** (a NEW cohort first member). Distinct from the native-subcommand cohort (BI-019 `files`, BI-023 `outline`, BI-024 `properties`) AND distinct from the eval-driven metadataCache cohort (BI-014 `find_by_property`, BI-015 `read_heading`, BI-025 `links`). The fork is forced by F2 — no native subcommand exists for similarity, AND the data lives on a plugin's runtime object, not in Obsidian's core metadata APIs.
- **Distinctive risk surface**: the plugin-as-runtime-dependency pattern adds a new failure dimension (three plugin-lifecycle codes: `SMART_CONNECTIONS_NOT_INSTALLED` / `SMART_CONNECTIONS_NOT_READY` / `SOURCE_NOT_INDEXED`) and a new detection branch (closed-vault empty-stdout signature per R5a). Mitigated by: (a) the in-eval lifecycle checks fail fast in a deterministic order per FR-017b; (b) the six compound-failure regression-test fixtures lock the precedence chain; (c) plugin-API drift surfaces via `SMART_CONNECTIONS_NOT_READY` per the Q1 soft-pin pattern, not via silent breakage; (d) the base64 payload round-trip assertion locks R6 structurally.
- **Q1–Q5 + two live-probe amendments survive further verification**: all seven clarifications-session decisions hold; the locked detection mechanism for R5a (empty-stdout signature) is now grounded in direct observation, not deferred to plan stage as the earlier draft hedged.
- **Next command**: `/speckit-tasks` — produces `tasks.md` with dependency-ordered, atomic tasks (T001..TNNN) per the established convention. Tasks will include T0 live-CLI verification cases per the deferred list in Phase 0.
