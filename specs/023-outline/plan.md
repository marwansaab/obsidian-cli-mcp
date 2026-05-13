# Implementation Plan: Outline — Structured Heading Outline of a Vault Note

**Branch**: `023-outline` | **Date**: 2026-05-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [/specs/023-outline/spec.md](./spec.md)

## Summary

Add `outline`, the **tenth** typed-tool wrap and the **first structural-discovery primitive**. Where `read` returns whole files (5–50k tokens for long documents) and `read_heading` returns a single section's body, `outline` returns the flat ordered list of every heading in a note (typically a few hundred bytes). The user-facing tool surface: `outline({ target_mode, vault?, file?, path?, total? })` returning `{ count: number, headings: Array<{ level, text, line }> }`. The `total: true` switch returns the count alone with `headings: []` for a token-economical pre-flight read. `obsidian_exec` remains as the freeform escape hatch for plain-text or tree renderings.

**Technical approach** (load-bearing decisions discovered at plan stage):

- **CLI subcommand: native `outline`** (R2 / F1). Probed live 2026-05-13 against `obsidian help outline`: the subcommand exists with `file=<name>`, `path=<path>`, `format=tree|md|json` (default tree), and `total` flag. The `format=json` output is a top-level array of `{level, heading, line}` per heading in source order — directly the wire shape the wrapper needs. NO `eval` composition required (stark contrast to BI-014 / BI-015 / BI-018 patterns). Architecturally simplest typed-tool wrap since BI-006.
- **Single-call architecture, branched on `input.total`** (R3 / F14). ONE `invokeCli` per request. Default mode invokes with `format=json` parameter only; count-only mode invokes with `total` flag only (the two flags are mutually exclusive at upstream — `total` wins per F14, so wrapper omits the redundant `format=json` for count-only). Single-call architecture preserves typical ~50–200 ms latency.
- **Empty-outline sentinel handling** (R9 / F7). LOAD-BEARING wrapper transform: zero-heading files return the literal plain-text `No headings found.` from upstream — NOT `[]` JSON, NOT integer `0`. The handler's parse step detects this sentinel BEFORE attempting JSON.parse / integer parse and maps it to `{ count: 0, headings: [] }` for both modes. The only handler-side branch logic that escapes the "thin handler" pattern.
- **Field rename `heading` → `text`** (F1 / FR-008). Upstream's per-entry text field is named `heading` (singular); wrapper's typed output uses `text` per the spec. The handler's parse step performs the 1:1 rename during the upstream-to-wrapper transform. No other field translation.
- **Schema**: STANDARD target_mode discriminator idiom (parity with read / delete / read_heading / read_property / write_note / rename). Reuses [`targetModeBaseSchema`](../../src/target-mode/target-mode.ts) extended with optional `total: z.boolean()`. The `applyTargetModeRefinement` helper supplies specific/active enforcement (vault required-in-specific, file/path XOR in specific, vault/file/path forbidden in active) per the post-010 flat extension idiom.
- **Output schema**: `z.object({ count: z.number().int().nonnegative(), headings: z.array(outlineHeadingSchema) }).strict()`. Uniform envelope across both modes — count-only sets `headings: []`. No discriminated union.
- **Adapter `target_mode` mapping (R4)**: STANDARD — handler passes `input.target_mode` through to `invokeCli` unchanged. The cli-adapter's defence-in-depth strip removes vault/file/path in active mode.
- **Unknown-vault response inspection (R5)**: NOT APPLICABLE. Per F8, `outline` silently honours-as-noop the `vault=` parameter (the focused vault is always used). The 011-R5 cli-adapter inspection clause does NOT fire — there is no "Vault not found." string. Inherited limitation; documented. Multi-vault users open the target vault before invoking. Parity with `files` (BI-019).
- **Anti-injection (R6)**: natural via process-argument data-passing. `vault`, `file`, `path` flow as named CLI parameters via `invokeCli`'s `parameters` record; `total` becomes a bare flag. The cli-adapter's argv-assembly emits each as a separate process argument. No shell, no eval, no string interpolation. FR-026 satisfied structurally.
- **File-not-found (R7), non-`.md` filetype rejection (R8 / FR-027), path-traversal (FR-019), output-cap kill (R10), no-active-file (R13)**: ALL satisfied by upstream + the dispatch layer's existing four-priority error classifier. **Zero wrapper-side handling required for these cases** — the `Error: File "X" not found.` / `Error: File is not a markdown file.` / `Error: no active file` upstream responses surface via the existing `Error:`-prefix classifier as `CLI_REPORTED_ERROR` / `CLI_REPORTED_ERROR` / `ERR_NO_ACTIVE_FILE`. The non-`.md` rejection in particular is a major architectural simplification — FR-027 expected wrapper-side filetype guard logic; live probe (F9) revealed the upstream already surfaces this with the right message format. Wrapper has nothing to do.
- **Setext defer-to-upstream (R11 / FR-013 amended at plan stage)**: F10 — live probe revealed the upstream `outline format=json` INCLUDES Setext-underline-style headings, contradicting the spec-stage assumption that drove FR-013. The plan applies the same defer-to-upstream architectural pattern locked for indented-code-blocks in the 2026-05-13 clarifications session Q2/A2. The wrapper does NOT filter Setext entries. Spec FR-013 amended at plan stage; the alternative (wrapper-side Setext filter) would require a second invocation to read file content for `#`-prefix verification on each heading line, defeating R3.
- **Indented-code-block opacity (FR-012a / Q2/A2)**: confirmed live (F12) — upstream excludes indented-code-block heading-like text from the outline. Deferred-to-upstream contract holds. No wrapper code.
- **Fenced-block opacity (FR-012)**: confirmed live (F2) — upstream excludes fenced-block heading-like text. No wrapper-side fence detector.
- **YAML frontmatter opacity**: confirmed live (F11) — upstream excludes frontmatter content. No wrapper-side frontmatter detector.
- **Closing-ATX form / inline markdown / `::` substring / level-skipping (F3 / F4 / F5 / F13)**: ALL satisfied by upstream behaviour. Wrapper is a pure pass-through (modulo the `heading` → `text` field rename and the empty-sentinel detection).
- **Registration**: via the existing `registerTool` factory — auto-applies `stripSchemaDescriptions`, wraps `ZodError → VALIDATION_ERROR`, propagates `UpstreamError → asToolError`, JSON-serialises typed output objects into the MCP `content[0].text` envelope. Alphabetical insertion at [src/server.ts](../../src/server.ts) tools array — between `createObsidianExecTool` and `createReadTool`.
- **FR-018 baseline roll-forward (per BI-022 durable machinery)**: the new `outline` tool's fingerprint MUST be added to [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) by running `npm run baseline:write` post-implementation. The drift detector test will fail until the baseline is rolled forward; this is the BI-022-introduced gate that forces every registry-mutating BI to acknowledge the change explicitly.

## Technical Context

**Language/Version**: TypeScript (strict mode, `tsc --noEmit` clean) — pinned in [tsconfig.json](../../tsconfig.json), runtime Node.js >= 22.11 per `engines.node` in [package.json](../../package.json).
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP transport), `zod` (validation, single source of truth per Constitution III), `zod-to-json-schema` (consumed via the existing `toMcpInputSchema` helper at [src/tools/_shared.ts](../../src/tools/_shared.ts)).
**Storage**: N/A — the tool is stateless. The CLI's `outline` subcommand reads file content via Obsidian's vault adapter; the wrapper just shells out and parses stdout. No caching across requests.
**Testing**: vitest with `@vitest/coverage-v8`. Co-located `*.test.ts` per module. The aggregate statements coverage threshold floor is **91.3%** ([vitest.config.ts:20](../../vitest.config.ts#L20)). Tests inject the cli-adapter's stub `spawnFn` via `deps.spawnFn` per the existing test-seam convention; no real `obsidian` binary executions in CI. Each handler test responds to ONE spawn invocation per request (single-call architecture per R3).
**Target Platform**: cross-platform Node.js MCP server (Windows / macOS / Linux). The host shells out to the Obsidian CLI binary via `child_process.spawn`. CLI subcommand `outline` is OS-independent.
**Project Type**: MCP server with one new typed tool. Per Constitution v1.2.0, the project exposes "an MCP server surface" only; `outline` adds one entry to the registered-tool list at [src/server.ts](../../src/server.ts) (alphabetical: between `createObsidianExecTool` and `createReadTool`).
**Performance Goals**: per-call latency ~50–200 ms (single native CLI invocation; no eval composition; no JS template execution; no two-stage envelope parse). Token saving is the primary win — outline payload is typically a few hundred bytes (one entry per heading × ~50 bytes per entry); a full-file `read` of the same note is 5–50 kB. Per SC-012.
**Constraints**:
- 10 s per-call timeout, 10 MiB output cap (typed-tool defaults applied automatically by `invokeCli`).
- Single-in-flight CLI queue gates all CLI invocations.
- 008-refactor surface frozen — `dispatchCli`, `invokeCli`, `invokeBoundedCli`, the in-flight registry, the four-priority error classification, the `obsidian_exec` argv-assembly contract, the `assertToolDocsExist` aggregator, the 011-R5 unknown-vault response-inspection clause are all frozen. `outline` inherits without modification (and the 011-R5 clause specifically does NOT fire for `outline` per R5).
- The upstream CLI's `outline` subcommand reaches Obsidian's metadata cache; future Obsidian updates may surface as test failures rather than silent drift. The wrapper's contract is locked against the upstream's `format=json` output shape (`[{level, heading, line}]`), asserted by handler tests via `outlineUpstreamArraySchema.parse`.
**Scale/Scope**: ~145 LOC of new source code split across `schema.ts` / `handler.ts` / `index.ts`. ~950 LOC of co-located tests across three `*.test.ts` files (18 schema / 29 handler / 5 registration = 52 tests, exceeding SC-015's floor of 25; 51 → 52 post-/speckit-analyze U1 remediation 2026-05-13 — added handler case 29 for SC-012 token-cost regression). One new doc at `docs/tools/outline.md` (~180 lines including ≥4 worked examples + per-error-code roster + count-only mode example + multi-vault inherited limitation + Setext-included note + output-cap ceiling + non-`.md`-rejection note). One line of update each in [src/server.ts](../../src/server.ts) (registration + import), [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) (FR-018 baseline roll-forward), [docs/tools/index.md](../../docs/tools/index.md) (summary), [package.json](../../package.json) (description + version bump 0.5.0 → 0.5.1 — locked at PATCH per /speckit-analyze B1 remediation 2026-05-13 since this BI is non-breaking additive), [CHANGELOG.md](../../CHANGELOG.md) (release entry).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Evidence |
|---|---|---|
| **I. Modular Code Organization** | ✅ PASS | New tool lives at `src/tools/outline/` per the established `{schema, handler, index}.ts` per-surface layout (verified against existing siblings `read`, `delete`, `files`, `read_heading`, `read_property`, `write_note`, `set_property`, `rename`, `find_by_property`, `obsidian_exec`, `help`). Downward-flow chain preserved: `index.ts` → `handler.ts` → `cli-adapter` → `child_process.spawn`. No upward or cyclic imports. The schema module imports from `zod` and `target-mode/target-mode.ts` (peer); the handler imports from `cli-adapter/` (peer); `index.ts` imports from `_register.ts` (sibling helper). |
| **II. Public Surface Test Coverage** | ✅ PASS | `outline` is a public MCP tool surface. Co-located tests at `src/tools/outline/{schema,handler,index}.test.ts` — **18 schema cases / 29 handler cases / 5 registration cases = 52 tests total** (post-/speckit-analyze U1 remediation 2026-05-13: 51 → 52, added handler case 29 for SC-012 token-cost regression), exceeding SC-015's floor of 25. Happy-path AND failure-path coverage in every layer. The post-010 consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) automatically covers `outline` via its `it.each` registry walk; no test-file modifications required. The BI-022 FR-018 baseline detector ([src/tools/_register-baseline.test.ts](../../src/tools/_register-baseline.test.ts)) requires a one-shot `npm run baseline:write` to roll the baseline forward; that command-line gesture is the Q2-locked acknowledgement that the registry intentionally changed. |
| **III. Boundary Input Validation with Zod** | ✅ PASS | Input schema reuses `targetModeBaseSchema` extended with optional `total: z.boolean()`. `applyTargetModeRefinement` supplies the standard specific/active enforcement (parity with `read` / `read_heading` / `read_property`). Inferred TypeScript type via `z.infer<typeof outlineInputSchema>`. **Output type ALSO via zod schema** `outlineOutputSchema = z.object({ count, headings }).strict()` (FR-007) — no hand-rolled types. The upstream wire schema `outlineUpstreamArraySchema = z.array(outlineUpstreamHeadingSchema)` is the contract assertion against upstream's `format=json` output (`passthrough` per defence-in-depth). `registerTool` parses input via `schema.parse` before the handler runs (auto-wrap `ZodError → VALIDATION_ERROR` with `details.issues`). Handler trusts validated input; no defensive checks. |
| **IV. Explicit Upstream Error Propagation** | ✅ PASS | Zero new error codes (per FR-020, Constitution Principle IV). Failures flow through `VALIDATION_ERROR` (zod) and `UpstreamError` codes from the cli-adapter (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`). The 011-R5 unknown-vault response-inspection clause does NOT fire for `outline` per R5 — but this is documented as an inherited limitation, NOT a silent failure (multi-vault users see the focused vault's outline). The handler's two parse-failure paths (`json-parse`, `total-parse`) surface as `CLI_REPORTED_ERROR` with `details.stage` discriminators. `registerTool`'s catch blocks propagate `UpstreamError` via `asToolError` and re-throw any other exception. No `catch + return null/empty/default` patterns. |
| **V. Attribution & Layered Composition Transparency** | ✅ PASS | Every new source file (`src/tools/outline/{schema,handler,index}.ts` + three `*.test.ts`) carries the `// Original — no upstream. <one-line description>.` header per the established convention (FR-025). The Markdown doc at `docs/tools/outline.md` is exempt per [005-help-tool](../005-help-tool/spec.md) FR-019. README's Attributions section is unchanged (no new lifted code; the wrapper is pure pass-through over the upstream CLI). |

**Coverage gate**: aggregate statements floor is 91.3% ([vitest.config.ts:20](../../vitest.config.ts#L20)); the new tests must not drop the aggregate below this. The new module is small (~145 LOC); the 51 co-located test cases provide near-100% coverage of the new module, so the aggregate either stays flat or ratchets up.

**Constitution Compliance checklist** (for the eventual PR): all five principles expected to evaluate as Y. No deviations needed; no Complexity Tracking entries required.

**ADR scope check**: [ADR-003 — Enforce Target Mode in Typed Tools](../../.decisions/) is **enforced by this feature** — `outline` operates on a single named file (specific mode) or active file (active mode), exactly the surface ADR-003 governs. The schema reuses `targetModeBaseSchema` + `applyTargetModeRefinement` from `src/target-mode/target-mode.ts` per ADR-003. No deviation; no ADR amendment needed. [ADR-005 — Token-Optimized Tool Definitions](../../.decisions/) reaffirmed; `stripSchemaDescriptions` applied at registration via `registerTool` (auto). [ADR-006 — Centralized Tool Registration](../../.decisions/) reaffirmed; `registerTool` factory wraps schema parse + UpstreamError propagation + JSON serialisation.

## Project Structure

### Documentation (this feature)

```text
specs/023-outline/
├── plan.md                              # This file
├── research.md                          # Phase 0 — design decisions R1–R14 + plan-stage live-CLI findings F1–F16
├── data-model.md                        # Phase 1 — input/output/upstream-wire schema shapes, handler shape, per-tool invariants, module LOC budget, test inventory (51 cases)
├── quickstart.md                        # Phase 1 — verification scenarios Q-1..Q-23 mapped to SC-001..SC-021
├── contracts/
│   ├── outline-input.contract.md        # Public input contract — zod schema + emitted JSON Schema + worked examples (A–G)
│   └── outline-handler.contract.md      # Handler invariants — single invokeCli call shape (× 2 modes), parse step, failure propagation chain
├── checklists/
│   └── requirements.md                  # Quality checklist from /speckit-specify (16/16 pass)
└── tasks.md                             # Phase 2 output (created by /speckit-tasks, NOT by this command)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── outline/                         # NEW per-surface module (FR-001)
│   │   ├── schema.ts                    # outlineInputSchema + outlineOutputSchema + outlineUpstreamArraySchema + EMPTY_OUTLINE_SENTINEL constant + types via z.infer (FR-002..FR-008)
│   │   ├── schema.test.ts               # 18 cases (target_mode discriminator + total + additionalProperties + types)
│   │   ├── handler.ts                   # executeOutline(input, deps) — single invokeCli with format=json or total flag + sentinel-detection + JSON.parse OR integer parse + heading→text rename + UpstreamError mapping for two parse-failure paths (FR-009..FR-014, FR-020)
│   │   ├── handler.test.ts              # 28 cases (default/count-only happy paths × 4 + empty-outline both modes + field rename + level/line/text byte-faithful + inline markdown / `::` / closing-ATX survival via fixture + Setext deferred-to-upstream + indented-code-block deferred-to-upstream + fenced-block deferred-to-upstream + frontmatter excluded + level-skipping preserved + JSON parse failure + integer parse failure + file-not-found + non-`.md` rejection + path-traversal + output-cap kill + active-mode happy + active-mode no-focus + argv shape × 2 modes + single-spawn-per-request invariant)
│   │   ├── index.ts                     # createOutlineTool factory via registerTool (FR-021)
│   │   └── index.test.ts                # 5 registration cases (descriptor name, stripped schema, help mention, doc presence + content completeness, drift-detector + FR-018 baseline lock)
│   ├── _register.ts                     # FROZEN
│   ├── _register.test.ts                # FROZEN — drift detector's it.each registry walk auto-covers outline
│   ├── _register-baseline.json          # ROLLED FORWARD by `npm run baseline:write` post-implementation (FR-018 acknowledgement gate)
│   ├── _register-baseline.test.ts       # FROZEN
│   ├── _register-baseline.ts            # FROZEN
│   ├── _shared.ts                       # FROZEN
│   ├── _shared.test.ts                  # FROZEN
│   ├── help/                            # FROZEN
│   ├── obsidian_exec/                   # FROZEN
│   ├── read/                            # FROZEN (SC-013 — zero substantive diff)
│   ├── read_heading/                    # FROZEN (SC-013 — zero substantive diff)
│   ├── read_property/                   # FROZEN (SC-013 — zero substantive diff)
│   ├── delete/                          # FROZEN (SC-013 — zero substantive diff)
│   ├── files/                           # FROZEN (SC-013 — zero substantive diff)
│   ├── find_by_property/                # FROZEN (SC-013 — zero substantive diff)
│   ├── set_property/                    # FROZEN (SC-013 — zero substantive diff)
│   ├── rename/                          # FROZEN (SC-013 — zero substantive diff)
│   └── write_note/                      # FROZEN (SC-013 — zero substantive diff)
├── server.ts                            # +2 lines: import + createOutlineTool({ logger, queue }) added to the tools array (alphabetical, between createObsidianExecTool and createReadTool)
├── server.test.ts                       # registry-consistency test auto-covers outline's docs/ presence (no edits)
├── cli-adapter/                         # FROZEN (008-refactor surface)
├── target-mode/                         # CONSUMED (outline uses applyTargetModeRefinement + targetModeBaseSchema unchanged)
├── help/                                # FROZEN
├── errors.ts                            # FROZEN (no new codes per FR-020)
├── logger.ts                            # FROZEN (per R1 — no callStart/callEnd events introduced)
└── queue.ts                             # FROZEN

docs/tools/
├── outline.md                           # NEW non-stub doc per FR-021 (input schema, output × 2 modes, error roster, ≥4 worked examples covering specific-mode happy / focused-note happy / count-only / file-not-found; multi-vault inherited limitation; eval-API stability concern N/A — native subcommand; output-cap ceiling; non-`.md` rejection note; Setext-included note; deferred-to-upstream architectural note linking to FR-012a / amended FR-013)
├── index.md                             # +1 line entry per the existing convention
├── obsidian_exec.md                     # FROZEN
├── read.md                              # FROZEN
├── read_heading.md                      # FROZEN
├── read_property.md                     # FROZEN
├── delete.md                            # FROZEN
├── files.md                             # FROZEN
├── find_by_property.md                  # FROZEN
├── set_property.md                      # FROZEN
├── rename.md                            # FROZEN
├── write_note.md                        # FROZEN (existing tool; no rename in this BI)
└── help.md                              # FROZEN

CHANGELOG.md                             # +1 entry under "Unreleased" or 0.5.1 (release versioning is a /speckit-tasks decision)
package.json                             # version 0.5.0 → 0.5.1 + description string updated to mention outline alongside the existing typed tools
README.md                                # tools-list section updated (if present)
CLAUDE.md                                # plan-pointer updated by Phase 1 step 3 (done in this command run)
```

**Structure Decision**: Single-project layout per the existing project shape. `src/tools/outline/` is the entire functional surface for this feature; everything else is one-line wiring (server registration, baseline roll-forward, docs index, package description) or out-of-tree documentation (CHANGELOG, README). No new directories at any other layer. Per Constitution Principle I, the new module is single-purpose (typed structural-discovery primitive); per Principle II, tests are co-located with sources.

## Phase 0: Research Decisions Summary

Full detail in [research.md](./research.md). Brief index of decisions ratified there:

- **R1 — Logger surface**: thin handler. Mirrors all prior typed tools.
- **R2 — CLI subcommand: native `outline`** (NOT eval). Per F1 — native subcommand exists with `format=json` structured output.
- **R3 — Single-call architecture, branched on `input.total`**: ONE `invokeCli` per request. Default mode → `format=json`. Count-only mode → `total` flag.
- **R4 — Adapter `target_mode` mapping**: STANDARD — `target_mode` flows through to `invokeCli` unchanged. Cli-adapter strips vault/file/path in active mode (defence-in-depth).
- **R5 — Unknown-vault response inspection**: NOT APPLICABLE — `outline` silently honours-as-noop the `vault=` parameter (per F8). Inherited limitation; documented. Parity with `files`.
- **R6 — Anti-injection**: natural via process-argument data-passing. No shell, no eval, no string interpolation.
- **R7 — File-not-found handling**: dispatch-layer auto-classification of `Error: File "X" not found.` exit 0 → `CLI_REPORTED_ERROR`.
- **R8 — Non-`.md` filetype rejection (FR-027)**: dispatch-layer auto-classification of `Error: File is not a markdown file.` exit 0 → `CLI_REPORTED_ERROR`. NO wrapper-side filetype guard.
- **R9 — Empty-outline detection**: load-bearing wrapper transform. Detect literal `No headings found.` stdout (after trim); map to `{ count: 0, headings: [] }` for both modes.
- **R10 — Output cap**: inherited 10 MiB cap. Surfaces as `CLI_NON_ZERO_EXIT`.
- **R11 — Setext defer-to-upstream (PLAN-STAGE SPEC AMENDMENT)**: per F10, upstream INCLUDES Setext entries. Wrapper does NOT filter. Spec FR-013 amended at plan stage to defer-to-upstream (logical consistency with Q2/A2).
- **R12 — Test seams**: `deps.spawnFn` injection. ONE spawn per request.
- **R13 — Active-mode no-focus error**: deferred to T0 of `/speckit-implement`. Best-evidence assumption: dispatch-layer auto-classifier maps `Error: no active file` → `ERR_NO_ACTIVE_FILE`.
- **R14 — Multi-vault default ambiguity**: inherited limitation. Documented.

**Plan-stage status**: 14 design decisions ratified. 16 live-CLI findings (F1–F16) verified at plan time against TestVault-Obsidian-CLI-MCP. Critical findings:

- F1 (native subcommand with `format=json` structured output) → R2 / R3 → architectural simplification vs eval composition.
- F7 (empty-outline sentinel) → R9 → load-bearing wrapper transform.
- F8 (vault= silently honoured-as-noop) → R5 → inherited limitation, no wrapper code.
- F9 (non-`.md` upstream rejection with ideal message format) → R8 → FR-027 satisfied entirely by upstream + dispatch layer; wrapper has nothing to do.
- F10 (Setext IS included by upstream) → R11 → spec amendment to FR-013 at plan stage.
- F12 (indented-code-block opacity confirmed in upstream) → FR-012a satisfied; deferred-to-upstream contract confirmed.

Cases deferred to T0 of `/speckit-implement` (require fixtures in TestVault and/or no-focus state): active-mode no-focus error string (R13); very-large-outline cap-boundary behaviour (Q-20); CRLF / LF round-trip (Q-19); end-to-end smoke against MCP Inspector / Claude Desktop (post-implement).

## Phase 1: Design Artifacts

Generated in this command run:

- **[research.md](./research.md)** — design decisions R1–R14 + plan-stage live-CLI findings F1–F16.
- **[data-model.md](./data-model.md)** — input/output/upstream-wire schema shapes, handler shape, per-tool invariants table, module LOC budget, test inventory (18 / 28 / 5 = 51 cases).
- **[contracts/outline-input.contract.md](./contracts/outline-input.contract.md)** — public input contract: zod schema, emitted JSON Schema shape, the field policy, seven worked examples (A–G), error response roster, multi-vault notes.
- **[contracts/outline-handler.contract.md](./contracts/outline-handler.contract.md)** — handler invariants: deps shape, the single `invokeCli` call shape × 2 modes, the two-stage parse step (default mode) and single-stage parse step (count-only mode), failure propagation chain, test seam pattern.
- **[quickstart.md](./quickstart.md)** — 23 verification scenarios (Q-1..Q-23) mapped to SC-001..SC-021. Q-1..Q-19 in CI; Q-20..Q-23 manual against TestVault during T0 of `/speckit-implement`.
- **[CLAUDE.md](../../CLAUDE.md) plan-pointer update** — the plan reference is updated to point at this plan file (done in this command run).
- **[spec.md](./spec.md) plan-stage amendment** — FR-013 / Setext edge case / FR-023 characterisation case / Setext assumption / out-of-scope all amended to reflect the F10 finding (Setext defers to upstream). New `### Plan-stage findings 2026-05-13` block in the `## Clarifications` section names the F10 driver.

## Constitution Re-Check (Post-Design)

| Principle | Compliance | Notes |
|---|---|---|
| I. Modular Code Organization | ✅ PASS | Phase 1 confirmed the per-surface layout; no cross-module imports added beyond the verified set. The single-call architecture (R3) keeps the import topology simple — handler imports cli-adapter only. Schema reuses `target-mode/` per ADR-003 (no duplication). |
| II. Public Surface Test Coverage | ✅ PASS | Test-set inventory frozen at 52 cases (18 schema / 29 handler / 5 registration; post-/speckit-analyze U1 remediation 2026-05-13). Drift detector + FR-018 baseline both auto-cover. Each handler test responds to ONE spawn invocation per call per R3. |
| III. Boundary Input Validation with Zod | ✅ PASS | Output schema also zod-derived per FR-007 with the uniform `{count, headings}` envelope. The upstream wire schema is `passthrough` for forward-compatibility against future upstream field additions. The structural validator is just `applyTargetModeRefinement` + the `total: z.boolean().optional()` extension; no per-field custom refinement. |
| IV. Explicit Upstream Error Propagation | ✅ PASS | Zero new codes confirmed. The handler's two parse-failure paths (`json-parse`, `total-parse`) wrap as `CLI_REPORTED_ERROR` with `details.stage` discriminators — never silent. ALL other failure surfaces (file-not-found, non-`.md`, path-traversal, no-focus, output-cap, binary-not-found) flow through the dispatch layer's existing classifier without wrapper involvement. |
| V. Attribution & Layered Composition | ✅ PASS | All new files marked Original. No upstream code lifted. The wrapper is pure pass-through over the upstream CLI; the only original logic is the empty-outline-sentinel detection (R9) and the field rename (`heading` → `text`) — both clearly attributed in the handler header. |

**No Complexity Tracking entries.** No deviations.

## Complexity Tracking

> **No deviations from constitution.** All five principles evaluate as `Y` for this feature. No `N` entries; no Complexity Tracking entries needed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | (n/a)      | (n/a)                               |

**Note on ADR-003 scope**: this feature **enforces** `target_mode` (per FR-002). The schema reuses `targetModeBaseSchema` + `applyTargetModeRefinement` from `src/target-mode/target-mode.ts` per the ADR. No deviation; no ADR amendment.

## Reporting

- **Branch**: `023-outline`
- **Plan path**: `specs/023-outline/plan.md`
- **Generated artifacts**:
  - `specs/023-outline/research.md` — design decisions R1–R14 + plan-stage live-CLI findings F1–F16
  - `specs/023-outline/data-model.md` — schema shapes, handler shape, test inventory (51 cases)
  - `specs/023-outline/contracts/outline-input.contract.md` — public input contract + 7 worked examples + error roster
  - `specs/023-outline/contracts/outline-handler.contract.md` — handler invariants (single-call shape × 2 modes, parse step, failure chain)
  - `specs/023-outline/quickstart.md` — 23 verification scenarios mapped to SC-001..SC-021
  - `CLAUDE.md` — plan reference updated
  - `specs/023-outline/spec.md` — plan-stage amendment for FR-013 (Setext defers to upstream) + related bullets per F10 finding
- **Plan-stage spec amendments**: ONE at plan stage (Setext defer-to-upstream per F10) + THREE post-/speckit-analyze remediations 2026-05-13:
  - **F10 (Setext defer-to-upstream)**: FR-013 + CONTENT - Setext edge case + FR-023 characterisation case + Setext assumption + out-of-scope assumption all amended. Consistency with Q2/A2 defer-to-upstream pattern.
  - **/speckit-analyze I1 (FR-016 + SC-005)**: amended to defer-to-upstream pattern matching R5 / F8. The spec-stage assumption that drove "MUST reclassify to CLI_REPORTED_ERROR" was contradicted by F8 (upstream silently honours-as-noop the `vault=` parameter; no error to reclassify). Logical consistency with Q2/A2 / R11 defer-to-upstream pattern across the BI.
  - **/speckit-analyze C1 (FR-017 + SC-007)**: amended to relocate "switch to specific mode" guidance from the structured error message to the published documentation (T010). The dispatch layer's classifier is the single source of error-message authority for ERR_NO_ACTIVE_FILE across all typed tools; the wrapper inherits the upstream string and adds caller-facing guidance via docs, not via wrapper-side rethrow.
  - **/speckit-analyze U1 (SC-012 token-cost regression)**: handler test inventory grown from 28 → 29 cases. New case 29 implements SC-012's "outline payload << full-file payload" assertion via fixture-based `Buffer.byteLength` comparison (5× threshold for fixture flexibility).
  - **/speckit-analyze B1 (version bump consistency)**: spec assumption locked from "MINOR bump" to "PATCH (0.5.0 → 0.5.1)" — matches plan + tasks. Pre-v1.0 semver permits MINOR-level breaking, but this BI is non-breaking additive, so PATCH is canonical.
  - **/speckit-analyze I2 (tool name confirmation)**: spec FR-001 assumption locked — tool name is `outline`, confirmed at plan stage 2026-05-13 via `obsidian help outline`.
  - All five remediations applied as text edits to spec.md / data-model.md / tasks.md / plan.md without re-running /speckit-clarify (the changes resolve plan-finding-vs-spec contradictions, not new ambiguities).
- **Architectural simplification vs predecessors**: this BI is the simplest typed-tool wrap since BI-006 (`read_note`). No eval composition (vs BI-014 / BI-015 / BI-018). No vault-registry pre-check (vs `write_note`'s vault verification). No output-shape transformation (vs `files`'s filter pipeline). The wrapper is pure pass-through modulo the empty-outline-sentinel detection (R9) and the `heading` → `text` field rename (F1). Most of the spec's contracts are satisfied directly by upstream behaviour + the dispatch layer's existing classifier.
- **Next command**: `/speckit-tasks` — produces `tasks.md` with dependency-ordered, atomic tasks (T001..TNNN) per the established convention.
