# Implementation Plan: Links — Outgoing Link Inventory for a Single Note

**Branch**: `025-list-links` | **Date**: 2026-05-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [/specs/025-list-links/spec.md](./spec.md)

## Summary

Add `links`, the **twelfth** typed-tool wrap and the project's **first link-graph primitive**. Where the existing `outline` (BI-023) and `properties` (BI-024) tools surface structural-discovery primitives (heading list, vault-wide property inventory), and where the future inbound-links (`backlinks`) primitive will surface the dual side, `links` surfaces the outgoing-link list for a single named note — body wikilinks, body wiki/markdown embeds, body markdown links (to vault-internal targets only), AND frontmatter-declared wikilinks merged into a single source-order listing. The user-facing tool surface: `links({ target_mode, vault?, file?, path?, total? })` returning `{ count: number, links: Array<{ target, line, kind, displayText? }> }`. The `total: true` switch returns the count alone with `links: []` for a token-economical pre-flight read.

**Technical approach** (load-bearing decisions discovered at plan stage):

- **CLI subcommand: `eval`** (R2 / F1). The native `links` subcommand is plain-text-only with no `format=json` support — probed 2026-05-13 against `TestVault-Obsidian-CLI-MCP`. The wrapper CANNOT satisfy the locked per-entry shape (FR-006: `target`/`line`/`kind`/optional `displayText`) via upstream `links`. Eval-driven access to `app.metadataCache.getFileCache(file).links/.embeds/.frontmatterLinks` is load-bearing. Parity with BI-014 (`find_by_property`) and BI-015 (`read_heading`) which also chose eval over native subcommands for the same reason.
- **Single-call architecture branched at the envelope-emission step** (R3). ONE `invokeCli` per request with `subcommand: 'eval'` and `parameters.code: <rendered-js>`. The same eval JS computes the full entries array regardless of mode; the `a.total` branch at envelope-emission decides whether `links` carries the entries or is `[]`. Cross-mode invariant (FR-005a) holds by construction.
- **FR-012 unknown-vault outcome RESOLVED to structured error** (R5 / F7). Probed live 2026-05-13: `obsidian vault=NonExistent eval code="…"` returned `Vault not found.` (plain text, exit 0). The cli-adapter's 011-R5 unknown-vault response-inspection clause FIRES for `eval` and reclassifies to `CLI_REPORTED_ERROR(code: 'VAULT_NOT_FOUND')`. The spec-stage FR-012 commitment HOLDS without amendment — different from BI-019 / BI-023 / BI-024 / BI-015 / BI-014 inheritance pattern in this single respect (some of those used `eval` and got the structured-error path; some used native subcommands and got the inherited-limitation path; this BI is in the structured-error cohort).
- **Three upstream-to-wrapper transforms per entry** (R7 / F3 / F4 / F6). The wrapper transforms each `LinkCache` / `FrontmatterLinkCache` entry by: (a) synthesising `kind` from `original` prefix or origin-array — `[[…]]` → wikilink, `[…]…` → markdown, embeds array → embed, frontmatterLinks → wikilink; (b) converting `position.start.line + 1` for body links/embeds, synthetic `line: 1` for frontmatterLinks (F5); (c) omitting `displayText` from the response entry when it equals `link` (matches Q1 contract — Obsidian's natural cache shape has displayText always present, sometimes equal to link).
- **Frontmatter-link inclusion** (Q4 / F5). The eval JS merges `c.frontmatterLinks` with `c.links` and `c.embeds` before sorting. Frontmatter entries lack per-entry `position` data, so they all carry synthetic `line: 1` and tiebreak via upstream-cache array order. The closed three-value `kind` enum (Q3) holds — frontmatter wikilinks are `kind: 'wikilink'` identical to body wikilinks; NO `source: 'frontmatter' | 'body'` discriminator added.
- **Non-`.md` rejection inside eval** (FR-014 / F9). Probed live: `getFileCache(canvasFile)` returns `{}` empty cache; absent the guard, the wrapper would silently return `{count:0, links:[]}` for canvas/png/pdf locators. The eval JS checks `f.extension === 'md'` AFTER resolving the file and surfaces `{ok:false, code:'NOT_MARKDOWN', detail:…}` for any other extension. Wrapper maps to `CLI_REPORTED_ERROR(stage:'envelope-error', code:'NOT_MARKDOWN')`.
- **Empty-list contract** (R9 / F10). The defensive `|| []` coalescing in `(c.frontmatterLinks || []).concat((c.links || []).concat(c.embeds || []))` natively handles the empty-cache case (`getFileCache` returns `{}` for empty `.md` files). NO sentinel-detection branch required — different from BI-023's `No headings found.` sentinel.
- **Schema**: STANDARD target_mode discriminator per ADR-003. `applyTargetModeRefinement(targetModeBaseSchema.extend({total}))` consumed from [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts). Parity with `read` / `outline` / `read_heading` / `read_property` / `find_by_property` (sort of — find_by_property uses a different operator shape) / `write_note` / `delete` / `set_property` / `rename`.
- **Output schema**: `z.object({count, links}).strict()` with per-entry `z.object({target, line, kind, displayText}).strict()`. Uniform envelope across both modes — count-only sets `links: []`. No discriminated union.
- **Anti-injection (R6)**: base64-encoded JSON payload — user `vault` / `file` / `path` / `target_mode` / `total` flow through `JSON.stringify → Buffer.from.toString('base64') → atob/JSON.parse at JS runtime`. Frozen JS template with single `__PAYLOAD_B64__` substitution point. Parity with BI-014 / BI-015.
- **Source-order sort intra-eval** (R8 / FR-008). The eval JS sorts entries by `(line ascending, _col ascending)` after merging the three cache arrays. NO wrapper-side post-fetch re-sort — the eval JS is wrapper-locked too (we control the eval source), so version-drift risk is absent. Column data is INTERNAL (`_col` field stripped before emission per Q5).
- **Registration**: via existing `registerTool` factory — auto-applies `stripSchemaDescriptions`, wraps `ZodError → VALIDATION_ERROR`, propagates `UpstreamError → asToolError`, JSON-serialises typed output objects into the MCP `content[0].text` envelope. Alphabetical insertion at [src/server.ts](../../src/server.ts) tools array — between `createFilesTool` and `createObsidianExecTool` (post-022 ASCII-alphabetical: `files/` < `links/` < `obsidian_exec/`).
- **FR-018 baseline roll-forward (per BI-022 durable machinery)**: the new `links` tool's fingerprint MUST be added to [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) by running `npm run baseline:write` post-implementation. The drift detector test fails until the baseline is rolled forward.

## Technical Context

**Language/Version**: TypeScript (strict mode, `tsc --noEmit` clean) — pinned in [tsconfig.json](../../tsconfig.json), runtime Node.js >= 22.11 per `engines.node` in [package.json](../../package.json).
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP transport), `zod` (validation, single source of truth per Constitution III), `zod-to-json-schema` (consumed via the existing `toMcpInputSchema` helper at [src/tools/_shared.ts](../../src/tools/_shared.ts)).
**Storage**: N/A — the tool is stateless. The CLI's `eval` subcommand reaches Obsidian's metadataCache for the resolved file; the wrapper just shells out and parses stdout. No caching across requests.
**Testing**: vitest with `@vitest/coverage-v8`. Co-located `*.test.ts` per module. The aggregate statements coverage threshold floor is **91.3%** ([vitest.config.ts:20](../../vitest.config.ts#L20)). Tests inject the cli-adapter's stub `spawnFn` via `deps.spawnFn` per the existing test-seam convention; no real `obsidian` binary executions in CI. Each handler test responds to ONE spawn invocation per request (single-call architecture per R3).
**Target Platform**: cross-platform Node.js MCP server (Windows / macOS / Linux). The host shells out to the Obsidian CLI binary via `child_process.spawn`. CLI subcommand `eval` is OS-independent.
**Project Type**: MCP server with one new typed tool. Per Constitution v1.2.0, the project exposes "an MCP server surface" only; `links` adds one entry to the registered-tool list at [src/server.ts](../../src/server.ts) (alphabetical: between `createFilesTool` and `createObsidianExecTool`).
**Performance Goals**: per-call latency ~80–200 ms (single eval CLI invocation; the eval JS executes a metadataCache lookup + array merge + sort + envelope emission inside Obsidian's already-warm process — no file I/O, no re-parse of the source). Token saving is the primary win — for a note with 20 outgoing links the response is on the order of 1–2 KB; the alternative (`read` → full body → client-side Markdown parser) returns the entire note body (often 10–50 KB) and runs a parser that duplicates the host's work. Per SC-017.
**Constraints**:
- 10 s per-call timeout, 10 MiB output cap (typed-tool defaults applied automatically by `invokeCli`).
- Single-in-flight CLI queue gates all CLI invocations.
- 008-refactor surface frozen — `dispatchCli`, `invokeCli`, `invokeBoundedCli`, the in-flight registry, the four-priority error classification, the `obsidian_exec` argv-assembly contract, the `assertToolDocsExist` aggregator, the 011-R5 unknown-vault response-inspection clause are all frozen. `links` inherits without modification (and the 011-R5 clause FIRES for `links` per R5 / F7 — different from BI-024).
- The upstream CLI's `eval` subcommand reaches Obsidian's metadataCache; future Obsidian updates may surface as test failures rather than silent drift. The wrapper's contract is locked against the eval envelope shape (`{ok:true, count, links}` vs `{ok:false, code, detail}`), asserted by handler tests via `linksEvalResponseSchema.safeParse`.
- ADR-003 governs the `target_mode` discriminator contract; this BI consumes the discriminator unchanged.

**Scale/Scope**: ~195 LOC of new source code split across `schema.ts` / `handler.ts` / `index.ts`. ~1120 LOC of co-located tests across three `*.test.ts` files (18 schema / 28 handler / 5 registration = 51 tests, exceeding SC-020's floor of 20). One new doc at `docs/tools/links.md` (~190 lines including ≥4 worked examples + per-error-code roster + count-only mode example + multi-vault note + frontmatter-inclusion note + non-`.md` rejection note + heading/block fragment note + output-cap ceiling). One line of update each in [src/server.ts](../../src/server.ts) (registration + import), [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) (FR-018 baseline roll-forward), [docs/tools/index.md](../../docs/tools/index.md) (summary), [package.json](../../package.json) (description + version bump 0.5.2 → 0.5.3 — PATCH per BI-023 / BI-024 precedent for additive surface), [CHANGELOG.md](../../CHANGELOG.md) (release entry).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Evidence |
|---|---|---|
| **I. Modular Code Organization** | ✅ PASS | New tool lives at `src/tools/links/` per the established `{schema, handler, index}.ts` per-surface layout (verified against existing siblings `read`, `delete`, `files`, `read_heading`, `read_property`, `write_note`, `set_property`, `rename`, `find_by_property`, `obsidian_exec`, `outline`, `properties`, `help`). Downward-flow chain preserved: `index.ts` → `handler.ts` → `cli-adapter` → `child_process.spawn`. No upward or cyclic imports. The schema module imports from `zod` and `target-mode/`; the handler imports from `cli-adapter/` (peer); `index.ts` imports from `_register.ts` (sibling helper). |
| **II. Public Surface Test Coverage** | ✅ PASS | `links` is a public MCP tool surface. Co-located tests at `src/tools/links/{schema,handler,index}.test.ts` — **18 schema cases / 28 handler cases / 5 registration cases = 51 tests total**, exceeding SC-020's floor of 20. Happy-path AND failure-path coverage in every layer. The post-010 consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) automatically covers `links` via its `it.each` registry walk; no test-file modifications required. The BI-022 FR-018 baseline detector ([src/tools/_register-baseline.test.ts](../../src/tools/_register-baseline.test.ts)) requires a one-shot `npm run baseline:write` to roll the baseline forward; that command-line gesture is the acknowledgement that the registry intentionally changed. |
| **III. Boundary Input Validation with Zod** | ✅ PASS | Input schema consumes the existing `targetModeBaseSchema` + `applyTargetModeRefinement` from `src/target-mode/`. Adds one optional field (`total: z.boolean().optional()`). No `target_mode` re-implementation. Inferred TypeScript type via `z.infer<typeof linksInputSchema>`. **Output type ALSO via zod schema** `linksOutputSchema = z.object({count, links}).strict()` with the per-entry shape `z.object({target, line, kind, displayText}).strict()` (FR-006) — no hand-rolled types. The eval-envelope wire schema `linksEvalResponseSchema = z.discriminatedUnion("ok", [...])` is the contract assertion against the eval JS's emitted shape. `registerTool` parses input via `schema.parse` before the handler runs (auto-wrap `ZodError → VALIDATION_ERROR` with `details.issues`). Handler trusts validated input; no defensive checks. |
| **IV. Explicit Upstream Error Propagation** | ✅ PASS | Zero new error codes (per FR-017, Constitution Principle IV). Failures flow through `VALIDATION_ERROR` (zod) and `UpstreamError` codes from the cli-adapter (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`). The 011-R5 unknown-vault response-inspection clause FIRES for `links` per F7 — `CLI_REPORTED_ERROR(VAULT_NOT_FOUND)` for unknown vault. The handler's two parse-failure paths (`json-parse`, `envelope-parse`) and three envelope-error paths (`NO_ACTIVE_FILE`, `FILE_NOT_FOUND`, `NOT_MARKDOWN`) surface as `CLI_REPORTED_ERROR` with `details.stage` discriminators. `registerTool`'s catch blocks propagate `UpstreamError` via `asToolError` and re-throw any other exception. No `catch + return null/empty/default` patterns. |
| **V. Attribution & Layered Composition Transparency** | ✅ PASS | Every new source file (`src/tools/links/{schema,handler,index}.ts` + three `*.test.ts`) carries the `// Original — no upstream. <one-line description>.` header per the established convention (FR-022). The Markdown doc at `docs/tools/links.md` is exempt per [005-help-tool](../005-help-tool/spec.md) FR-019. README's Attributions section is unchanged (no new lifted code; the wrapper is original logic over the upstream `eval` subcommand). |

**Coverage gate**: aggregate statements floor is 91.3% ([vitest.config.ts:20](../../vitest.config.ts#L20)); the new tests must not drop the aggregate below this. The new module is ~195 LOC; the 51 co-located test cases provide near-100% coverage of the new module, so the aggregate either stays flat or ratchets up.

**Constitution Compliance checklist** (for the eventual PR): all five principles expected to evaluate as Y. No deviations needed; no Complexity Tracking entries required.

**ADR scope check**: [ADR-003 — Enforce Target Mode in Typed Tools](../../.decisions/) IS APPLICABLE — `links` operates on a single named file (specific) or focused file (active). The schema consumes `targetModeBaseSchema` + `applyTargetModeRefinement` from `src/target-mode/target-mode.ts`. No deviation; no ADR amendment. [ADR-005 — Token-Optimized Tool Definitions](../../.decisions/) reaffirmed; `stripSchemaDescriptions` applied at registration via `registerTool` (auto). [ADR-006 — Centralized Tool Registration](../../.decisions/) reaffirmed; `registerTool` factory wraps schema parse + UpstreamError propagation + JSON serialisation.

## Project Structure

### Documentation (this feature)

```text
specs/025-list-links/
├── plan.md                                       # This file
├── research.md                                   # Phase 0 — design decisions R1–R14 + plan-stage live-CLI findings F1–F14
├── data-model.md                                 # Phase 1 — input/output/eval-envelope schema shapes, JS template, base64 payload, per-tool invariants, module LOC budget, test inventory (51 cases), architectural delta map
├── quickstart.md                                 # Phase 1 — 24 verification scenarios Q-1..Q-24 mapped to SC-001..SC-024
├── contracts/
│   ├── links-input.contract.md                   # Public input contract — zod schema + emitted JSON Schema + worked examples (A–G) + error roster + out-of-scope upstream surfaces
│   └── links-handler.contract.md                 # Handler invariants — single invokeCli call shape, JS template render, multi-stage parse step, envelope-error mapping, failure propagation chain
├── checklists/
│   └── requirements.md                           # Quality checklist from /speckit-specify (16/16 pass) + clarifications-session 2026-05-13 notes
└── tasks.md                                      # Phase 2 output (created by /speckit-tasks, NOT by this command)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── links/                                    # NEW per-surface module (FR-001)
│   │   ├── schema.ts                             # linksInputSchema + linksOutputSchema + linksEvalResponseSchema + linkKindEnum + linkEntrySchema + types via z.infer (FR-002..FR-009, exhaustive-fields lock)
│   │   ├── schema.test.ts                        # 18 cases (target_mode discriminator × specific/active × file/path XOR + total optional + types + strict + unknown-key)
│   │   ├── handler.ts                            # executeLinks(input, deps) — frozen JS_TEMPLATE + base64 payload assembly + single invokeCli + JSON.parse + envelope safeParse + ok:false → UpstreamError mapping (FR-005..FR-014, FR-017)
│   │   ├── handler.test.ts                       # 28 cases (mixed-link happy + basename happy + empty cache + active happy + active no-focused + per-occurrence × multi-line × same-line + fragment-embedded + body opacity + frontmatter inclusion line=1 + unresolved path/file + unknown vault + non-md target + cross-mode invariant + base64 round-trip + json-parse / envelope-parse failures + output-cap kill + single-spawn-per-request invariant)
│   │   ├── index.ts                              # createLinksTool factory via registerTool (FR-018)
│   │   └── index.test.ts                         # 5 registration cases (descriptor name, stripped schema, help mention, doc presence + content completeness, drift-detector + FR-018 baseline lock)
│   ├── _register.ts                              # FROZEN
│   ├── _register.test.ts                         # FROZEN — drift detector's it.each registry walk auto-covers links
│   ├── _register-baseline.json                   # ROLLED FORWARD by `npm run baseline:write` post-implementation (FR-018 acknowledgement gate)
│   ├── _register-baseline.test.ts                # FROZEN
│   ├── _register-baseline.ts                     # FROZEN
│   ├── _shared.ts                                # FROZEN
│   ├── _shared.test.ts                           # FROZEN
│   ├── help/                                     # FROZEN
│   ├── obsidian_exec/                            # FROZEN
│   ├── outline/                                  # FROZEN (SC-018 — zero substantive diff)
│   ├── properties/                               # FROZEN (SC-018)
│   ├── read/                                     # FROZEN (SC-018)
│   ├── read_heading/                             # FROZEN (SC-018)
│   ├── read_property/                            # FROZEN (SC-018)
│   ├── delete/                                   # FROZEN (SC-018)
│   ├── files/                                    # FROZEN (SC-018)
│   ├── find_by_property/                         # FROZEN (SC-018)
│   ├── set_property/                             # FROZEN (SC-018)
│   ├── rename/                                   # FROZEN (SC-018)
│   └── write_note/                               # FROZEN (SC-018)
├── server.ts                                     # +2 lines: import + createLinksTool({ logger, queue }) added to the tools array (alphabetical, between createFilesTool and createObsidianExecTool)
├── server.test.ts                                # registry-consistency test auto-covers links's docs/ presence (no edits)
├── cli-adapter/                                  # FROZEN (008-refactor surface)
├── target-mode/                                  # CONSUMED — links's schema imports targetModeBaseSchema + applyTargetModeRefinement from target-mode/target-mode.ts
├── help/                                         # FROZEN
├── errors.ts                                     # FROZEN (no new codes per FR-017)
├── logger.ts                                     # FROZEN (per R1 — no callStart/callEnd events introduced)
└── queue.ts                                      # FROZEN

docs/tools/
├── links.md                                      # NEW non-stub doc per FR-018 (input schema, output × 2 modes, error roster, ≥4 worked examples covering specific-mode-by-path / specific-mode-by-file / active-mode / count-only / unresolved-locator-error; multi-vault note; frontmatter-inclusion note; non-.md rejection note; heading/block fragment note; output-cap ceiling)
├── index.md                                      # +1 line entry per the existing convention
├── outline.md                                    # FROZEN
├── properties.md                                 # FROZEN
├── obsidian_exec.md                              # FROZEN
├── read.md                                       # FROZEN
├── read_heading.md                               # FROZEN
├── read_property.md                              # FROZEN
├── delete.md                                     # FROZEN
├── files.md                                      # FROZEN
├── find_by_property.md                           # FROZEN
├── set_property.md                               # FROZEN
├── rename.md                                     # FROZEN
├── write_note.md                                 # FROZEN
└── help.md                                       # FROZEN

CHANGELOG.md                                      # +1 entry under "Unreleased" or 0.5.3 (release versioning is a /speckit-tasks decision)
package.json                                      # version 0.5.2 → 0.5.3 + description string updated to mention links alongside the existing typed tools
README.md                                         # tools-list section updated (if present)
CLAUDE.md                                         # active-narrative block rewritten by Phase 1 step 3 (done in this command run)
```

**Structure Decision**: Single-project layout per the existing project shape. `src/tools/links/` is the entire functional surface for this feature; everything else is one-line wiring (server registration, baseline roll-forward, docs index, package description) or out-of-tree documentation (CHANGELOG, README). No new directories at any other layer. Per Constitution Principle I, the new module is single-purpose (typed link-graph primitive for outgoing-link inventory of a single note); per Principle II, tests are co-located with sources.

## Phase 0: Research Decisions Summary

Full detail in [research.md](./research.md). Brief index of decisions ratified there:

- **R1 — Logger surface**: thin handler. Mirrors all prior typed tools.
- **R2 — CLI subcommand: `eval`** (NOT native `links`). Per F1 — native subcommand is plain-text-only with no `format=json` support.
- **R3 — Single-call architecture, branched at envelope-emission on `a.total`**: ONE `invokeCli` per request. Same eval JS in both modes; the count-only branch lives inside the eval at envelope emission.
- **R4 — Adapter `target_mode` mapping**: STANDARD per ADR-003. Schema consumes `targetModeBaseSchema` + `applyTargetModeRefinement`.
- **R5 — Unknown-vault response inspection**: ACTIVE — `eval` emits "Vault not found." per F7. The cli-adapter's 011-R5 clause FIRES. Structured error contract (FR-012) HOLDS. Different from BI-019 / BI-023 / BI-024 inheritance.
- **R6 — Anti-injection**: base64-encoded JSON payload + frozen JS template. Parity with BI-014 / BI-015.
- **R7 — Three upstream-to-wrapper transforms**: kind synthesis, line+1 conversion, displayText omit-when-equal.
- **R8 — Source-order sort intra-eval**: NO wrapper-side post-fetch re-sort. Eval JS is wrapper-locked.
- **R9 — Empty-list detection**: natural via `|| []` coalescing. NO sentinel-detection branch.
- **R10 — Output cap**: inherited 10 MiB cap. Surfaces as `CLI_NON_ZERO_EXIT`.
- **R11 — Cross-mode invariant (FR-005a)**: holds by construction (same eval, same source, same count in both modes).
- **R12 — Test seams**: `deps.spawnFn` injection. ONE spawn per request. Base64 round-trip assertion locks R6.
- **R13 — Structured eval-response error envelope**: three failure codes (`NO_ACTIVE_FILE`, `FILE_NOT_FOUND`, `NOT_MARKDOWN`) map to `ERR_NO_ACTIVE_FILE` / `CLI_REPORTED_ERROR` per the R13 table.
- **R14 — Multi-vault default ambiguity**: documented; mandatory `vault` in specific mode + `eval` subcommand's structured "Vault not found." emission means callers cannot silently route to focused vault with an unrecognised name.

**Plan-stage status**: 14 design decisions ratified. 14 live-CLI findings (F1–F14) verified at plan time against the host's `obsidian` CLI focused on `TestVault-Obsidian-CLI-MCP`. Critical findings:

- **F1** (native `links` subcommand is plain-text-only — `format=json` silently ignored) → R2 → architectural fork to eval-driven implementation. Parity with BI-014 / BI-015; NOT parity with BI-023 / BI-024.
- **F4** (`kind` distinction requires inspecting `original` prefix or origin-array) → R7 transform (a). Closed three-value enum (Q3) locked operationally.
- **F5** (frontmatterLinks lacks `position`) → R7 transform (b) with synthetic `line: 1` for frontmatter cohort.
- **F6** (Obsidian's `displayText` is always-present, sometimes equal to `link`) → R7 transform (c) — wrapper omits when equal. Q1 contract holds; the spec rationale's wording is inaccurate but the contract is correct.
- **F7** (`vault=NonExistent` emits "Vault not found." for eval — DIFFERENT from BI-019/023/024) → R5 → FR-012 structured-error commitment holds.
- **F9** (non-`.md` files yield `{}` empty cache; wrapper guards in-eval via `f.extension === 'md'` check) → FR-014 satisfied via `NOT_MARKDOWN` envelope code.
- **F10** (empty `.md` cache → empty arrays → `{count:0, links:[]}` natural) → R9 → no sentinel-detection branch.

Cases deferred to T0 of `/speckit-implement` (require fresh fixtures + focused-vault state changes):

- F11a — Same-line same-target intra-line tiebreak with synthesised `_col` data: end-to-end fixture-based verification.
- F13a — Active-mode no-focused-file path: requires closing all panes in Obsidian to verify `app.workspace.getActiveFile()` returning null.
- F14a — Cross-mode invariant end-to-end against populated and empty notes.
- Very-large-link-list cap-boundary behaviour.
- Frontmatter-link line=1 invariant against a multi-link frontmatter fixture.
- Path-traversal `path` value end-to-end (verify rejection happens, no filesystem mutation).

## Phase 1: Design Artifacts

Generated in this command run:

- **[research.md](./research.md)** — design decisions R1–R14 + plan-stage live-CLI findings F1–F14.
- **[data-model.md](./data-model.md)** — input/output/eval-envelope schema shapes, JS template, base64 payload assembly, per-tool invariants table, module LOC budget, test inventory (18 / 28 / 5 = 51 cases), architectural delta map vs predecessors.
- **[contracts/links-input.contract.md](./contracts/links-input.contract.md)** — public input contract: zod schema, emitted JSON Schema shape, field policy, seven worked examples (A–G), error response roster, multi-vault note, out-of-scope upstream surfaces table.
- **[contracts/links-handler.contract.md](./contracts/links-handler.contract.md)** — handler invariants: deps shape, single invokeCli call shape, frozen JS template, multi-stage parse step (JSON.parse → envelope safeParse → discriminate on ok), envelope-error → UpstreamError mapping table, failure propagation chain, test seam pattern with base64 round-trip, single-spawn invariant.
- **[quickstart.md](./quickstart.md)** — 24 verification scenarios Q-1..Q-24 mapped to SC-001..SC-024. Q-1..Q-18 in CI; Q-19..Q-24 manual against TestVault during T0 of /speckit-implement.
- **[CLAUDE.md](../../CLAUDE.md) active-narrative block rewrite** — the predecessor narrative for 024-list-properties is retained; the new active-narrative for 025-list-links is added at the top (done in this command run).
- **No spec amendments at plan stage.** All five clarifications-session commitments (Q1–Q5) hold under live-CLI verification; the FR-012 structured-error commitment holds (NOT amended to inherited-limitation — different from BI-019 / BI-023 / BI-024).

## Constitution Re-Check (Post-Design)

| Principle | Compliance | Notes |
|---|---|---|
| I. Modular Code Organization | ✅ PASS | Phase 1 confirmed the per-surface layout; no cross-module imports added beyond the verified set. The single-call architecture (R3) keeps the import topology simple — handler imports cli-adapter only. Schema imports from `target-mode/` for the discriminator (standard pattern). |
| II. Public Surface Test Coverage | ✅ PASS | Test-set inventory frozen at 51 cases (18 schema / 28 handler / 5 registration). Drift detector + FR-018 baseline both auto-cover. Each handler test responds to ONE spawn invocation per call per R3. Base64 round-trip assertion in every payload-affecting handler test locks R6. |
| III. Boundary Input Validation with Zod | ✅ PASS | Output schema also zod-derived per FR-006 with the uniform `{count, links}` envelope. The eval-envelope wire schema is a strict discriminated union — locks the eval JS's emitted shape from drifting. The per-entry shape's exhaustive-fields list (FR-006 post-clarify) forbids plan-stage widening; the linkEntrySchema is `.strict()` to enforce this at parse time. |
| IV. Explicit Upstream Error Propagation | ✅ PASS | Zero new codes confirmed. The handler's two parse-failure paths (`json-parse`, `envelope-parse`) and three envelope-error paths (`NO_ACTIVE_FILE`, `FILE_NOT_FOUND`, `NOT_MARKDOWN`) wrap as `UpstreamError` with `details.stage` discriminators — never silent. ALL other failure surfaces (output-cap, binary-not-found, vault-not-found) flow through the dispatch layer's existing classifier without wrapper involvement. The `ERR_NO_ACTIVE_FILE` vs `CLI_REPORTED_ERROR(NO_ACTIVE_FILE)` choice is locked at T0 per BI-015 precedent alignment. |
| V. Attribution & Layered Composition | ✅ PASS | All new files marked Original. No upstream code lifted. The wrapper is original logic over Obsidian's metadataCache; the load-bearing original logic is the three per-entry transforms (kind synthesis, line+1, displayText-omit-when-equal) and the source-order sort intra-eval. All clearly attributed in the handler header. |

**No Complexity Tracking entries.** No deviations.

## Complexity Tracking

> **No deviations from constitution.** All five principles evaluate as `Y` for this feature. No `N` entries; no Complexity Tracking entries needed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | (n/a)      | (n/a)                               |

**Note on ADR-003 scope**: this feature consumes `target_mode` from `src/target-mode/target-mode.ts` (specific / active). Standard ADR-003 enforcement applies. No deviation; no ADR amendment needed.

## Reporting

- **Branch**: `025-list-links`
- **Plan path**: `specs/025-list-links/plan.md`
- **Generated artifacts**:
  - `specs/025-list-links/research.md` — design decisions R1–R14 + plan-stage live-CLI findings F1–F14
  - `specs/025-list-links/data-model.md` — schema shapes, JS template, base64 payload, test inventory (51 cases), architectural delta map
  - `specs/025-list-links/contracts/links-input.contract.md` — public input contract + 7 worked examples + error roster + out-of-scope upstream surfaces
  - `specs/025-list-links/contracts/links-handler.contract.md` — handler invariants (single-call shape, JS template, parse step, envelope mapping, failure chain)
  - `specs/025-list-links/quickstart.md` — 24 verification scenarios mapped to SC-001..SC-024
  - `CLAUDE.md` — active-narrative block rewritten to 025-list-links; 024-list-properties narrative retained as predecessor
- **Plan-stage spec amendments**: NONE at the initial plan synthesis. All five clarifications-session Q&As hold under live-CLI verification; FR-012's structured-error commitment holds (the spec's "UNLESS plan-stage live-CLI characterisation reveals … silently honours-as-noop" hedge does NOT fire — F7 confirms "Vault not found." emission for `eval`).
- **/speckit-analyze remediation pass (2026-05-13)**: SIX findings remediated (C1 / I1 MEDIUM; L1 / L2 / L3 / L4 LOW) — see `docs(025-list-links): remediate /speckit-analyze findings` commit for the unified diff. Tasks.md tightened: T0.7 OPTIONAL cap-boundary case added per C1; T001 sub-cases tagged `[pre-impl …]` / `[post-impl …]` per I1. Spec tightened: Q1 clarification rationale corrected to acknowledge the wrapper-side omit-when-equal transform per L1; FR-020 expanded with a 19th case (multi-link frontmatter) and SC-022 bumped 18 → 19 per L3; FR-012 + Edge Cases LOCATOR — unknown vault + Assumptions block + SC-011 + US1 acceptance scenario #5 all tightened to remove the now-resolved "UNLESS plan-stage live-CLI characterisation reveals…" hedge per L4. Research.md R5 cleaned of leftover thinking-out-loud per L2.
- **Architectural cohort**: this BI is in the **eval-driven cohort** (with BI-014 `find_by_property` and BI-015 `read_heading`), NOT the native-subcommand cohort (with BI-019 `files`, BI-023 `outline`, BI-024 `properties`). The fork is forced by F1 — the native `links` subcommand's plain-text output is structurally insufficient for the locked per-entry shape.
- **Distinctive risk surface**: the three per-entry transforms (kind / line+1 / displayText-omit-when-equal) plus the frontmatter inclusion plus the cross-mode invariant give this BI more wrapper-side logic per entry than any predecessor. Mitigated by the eval JS being a frozen ~30 LOC string constant with handler tests that lock every transform via stub-cache fixtures. The base64 payload round-trip assertion locks R6 structurally.
- **Q1–Q5 clarifications survive the live probe**: all five 2026-05-13 clarifications-session decisions hold under F1–F14 verification. Q1 (displayText absent when no alias) implementable via wrapper-side omit-when-equal transform; Q2 (fragment embedded in target) is natural for Obsidian's `link` field; Q3 (closed three-kind enum) aligns with the cache's two link arrays plus the frontmatterLinks → wikilink rule; Q4 (frontmatter inclusion with synthetic line=1) implementable via merge of `frontmatterLinks` cache array; Q5 (no column field) implementable via `_col` strip before emission.
- **Next command**: `/speckit-tasks` — produces `tasks.md` with dependency-ordered, atomic tasks (T001..TNNN) per the established convention.
