# Implementation Plan: Properties — Vault-Wide Frontmatter Property Inventory

**Branch**: `024-list-properties` | **Date**: 2026-05-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [/specs/024-list-properties/spec.md](./spec.md)

## Summary

Add `properties`, the **eleventh** typed-tool wrap and the **second structural-discovery primitive** (after BI-023 `outline`). Where the prior `read_property` surface returns a single property's value in a single note, `find_by_property` returns the set of notes carrying a specific value, and `outline` returns the heading structure of a single note, the new `properties` surface returns the vault-wide catalogue of frontmatter property NAMES with per-property note counts. The user-facing tool surface: `properties({ vault?, total? })` returning `{ count: number, properties: Array<{ name, noteCount }> }`. The `total: true` switch returns the distinct-names count alone with `properties: []` for a token-economical pre-flight read. `obsidian_exec` remains as the freeform escape hatch for callers needing per-file frontmatter dumps or frequency-ordered views.

**Technical approach** (load-bearing decisions discovered at plan stage):

- **CLI subcommand: native `properties`** (R2 / F1). Probed live 2026-05-13: the subcommand exists with `file=<name>`, `path=<path>`, `name=<name>`, `active`, `total` flag, `sort=count` flag, `counts` flag, and `format=yaml|json|tsv` parameters. Probing `obsidian properties format=json` returns a top-level JSON array of `{ name, type, count }` per property in alphabetical order by `name`. NO eval composition required (parity with BI-019 / BI-023).
- **Single-call architecture, branched on `input.total`** (R3). ONE `invokeCli` per request. Default mode invokes with `format=json` parameter only; count-only mode invokes with `total` flag only. The `counts` flag is omitted in both modes (per F2 it is a no-op for JSON output — `count` is always included). The `sort` parameter is omitted (upstream's default is `sort=name`; the wrapper applies its own post-fetch sort regardless of upstream order per F14).
- **Q2 (`total: true` semantic) RESOLVED BY UPSTREAM** (F3 / R11). Probed live 2026-05-13: `obsidian properties total` returns plain integer matching the `format=json` array length (73 entries → integer `73`). Upstream's `total` flag returns the count of DISTINCT property names, NOT the sum of occurrences (which would be 4159 for the same vault). The Q2 clarification's Option A commitment (outer `count` = distinct property names) is satisfied by upstream behaviour directly — no local computation, no second invocation. The FR-006a cross-mode invariant holds by upstream construction.
- **FR-015 unknown-vault locus RESOLVED to documented inherited limitation** (F4 / R5). Probed live 2026-05-13: `obsidian properties vault=NonExistentVault format=json` returns byte-identical output to `obsidian properties format=json` — the upstream silently honours-as-noop the `vault=` parameter and uses the focused vault. Parity with `files` (BI-019), `outline` (BI-023), `read_heading` (BI-015), `find_by_property` (BI-014). The 011-R5 cli-adapter unknown-vault inspection clause does NOT fire — no "Vault not found." string exists. Multi-vault users open the target vault before invoking. Locks plan-stage spec amendment to FR-015 (rewritten from "MUST surface a structured error" to "MUST be documented as an inherited limitation").
- **Two upstream-to-wrapper transforms per entry** (R7 / F5 / F6). Upstream emits `{ name, type, count }`; wrapper emits `{ name, noteCount }`. Two transforms: DROP `type` (per FR-004 — type metadata out of scope), RENAME `count` → `noteCount` (per FR-007 — avoids collision with outer envelope's `count`). Implemented in the handler's parse step as `array.map(({ name, count }) => ({ name, noteCount: count }))` — TypeScript destructure drops `type` implicitly.
- **Wrapper-side post-fetch sort** (R8 / FR-013 from the 2026-05-13 clarifications session Q1). Case-insensitive primary key with byte-order tiebreak. Implemented as a single `array.sort()` call after the upstream-to-wrapper map. Drift-detection-friendly ordering: case-distinct duplicates (`Tags` / `tags`) appear adjacent. Wrapper-locked regardless of upstream version's sort behaviour.
- **Schema**: NO `target_mode` discriminator (per FR-004 — vault-only surface). NO `applyTargetModeRefinement` / `targetModeBaseSchema` consumption (different from `read` / `delete` / `read_heading` / `read_property` / `write_note` / `set_property` / `rename` / `outline`). Plain `z.object({ vault, total }).strict()` with both fields optional. Parity-of-shape with no precedent — the closest match is `files` (BI-019) which also has an optional `folder` parameter for vault scope but adds a `target_mode` discriminator that this tool does not.
- **Output schema**: `z.object({ count: z.number().int().nonnegative(), properties: z.array(propertyEntrySchema) }).strict()`. Uniform envelope across both modes — count-only sets `properties: []`. No discriminated union.
- **Anti-injection (R6)**: natural via process-argument data-passing. `vault` flows as a named CLI parameter via `invokeCli`'s `parameters` record; `total` becomes a bare flag. The cli-adapter's argv-assembly emits each as a separate process argument. No shell, no eval, no string interpolation. FR-024 satisfied structurally.
- **Empty-vault detection** (R9). Best-evidence assumption: upstream returns `[]` JSON array for `format=json` mode when no frontmatter exists, AND returns `0` for `total` mode. The handler's parse step handles both natively — no special-case sentinel branch required at plan stage. Deferred to T0 of `/speckit-implement` for live confirmation (parallel to BI-023 F7 contingency).
- **Body-content opacity (FR-010), nested YAML / top-level-key counting (FR-012), null-valued key inclusion (FR-011), reserved Obsidian property handling** — ALL satisfied by upstream behaviour (defer-to-upstream per the established BI-023 pattern). Wrapper is a pure pass-through modulo the field rename, type drop, and post-fetch sort. T0 live probes verify the deferred-to-upstream contract.
- **Output-cap kill (R10), path-traversal handling (FR-017), binary-not-found (CLI_BINARY_NOT_FOUND)** — ALL satisfied by upstream + the dispatch layer's existing classifiers. Zero wrapper-side handling required for these cases.
- **Registration**: via the existing `registerTool` factory — auto-applies `stripSchemaDescriptions`, wraps `ZodError → VALIDATION_ERROR`, propagates `UpstreamError → asToolError`, JSON-serialises typed output objects into the MCP `content[0].text` envelope. Alphabetical insertion at [src/server.ts](../../src/server.ts) tools array — between `createOutlineTool` and `createReadTool` (post-022 ASCII-alphabetical order `outline/` < `properties/` < `read/`).
- **FR-018 baseline roll-forward (per BI-022 durable machinery)**: the new `properties` tool's fingerprint MUST be added to [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) by running `npm run baseline:write` post-implementation. The drift detector test will fail until the baseline is rolled forward; this is the BI-022-introduced gate that forces every registry-mutating BI to acknowledge the change explicitly.

## Technical Context

**Language/Version**: TypeScript (strict mode, `tsc --noEmit` clean) — pinned in [tsconfig.json](../../tsconfig.json), runtime Node.js >= 22.11 per `engines.node` in [package.json](../../package.json).
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP transport), `zod` (validation, single source of truth per Constitution III), `zod-to-json-schema` (consumed via the existing `toMcpInputSchema` helper at [src/tools/_shared.ts](../../src/tools/_shared.ts)).
**Storage**: N/A — the tool is stateless. The CLI's `properties` subcommand reads frontmatter via Obsidian's metadata cache; the wrapper just shells out and parses stdout. No caching across requests.
**Testing**: vitest with `@vitest/coverage-v8`. Co-located `*.test.ts` per module. The aggregate statements coverage threshold floor is **91.3%** ([vitest.config.ts:20](../../vitest.config.ts#L20)). Tests inject the cli-adapter's stub `spawnFn` via `deps.spawnFn` per the existing test-seam convention; no real `obsidian` binary executions in CI. Each handler test responds to ONE spawn invocation per request (single-call architecture per R3).
**Target Platform**: cross-platform Node.js MCP server (Windows / macOS / Linux). The host shells out to the Obsidian CLI binary via `child_process.spawn`. CLI subcommand `properties` is OS-independent.
**Project Type**: MCP server with one new typed tool. Per Constitution v1.2.0, the project exposes "an MCP server surface" only; `properties` adds one entry to the registered-tool list at [src/server.ts](../../src/server.ts) (alphabetical: between `createOutlineTool` and `createReadTool`).
**Performance Goals**: per-call latency ~50–150 ms (single native CLI invocation; no eval composition; no two-stage envelope parse; one in-handler `sort()` over O(n) entries where n is realistic ≤ low hundreds). Token saving is the primary win — the inventory payload is typically a few hundred bytes (one entry per distinct property name × ~30 bytes per entry); a full-vault grep across notes is on the order of tens of kilobytes for a small vault, hundreds of kilobytes for a large one. Per SC-014.
**Constraints**:
- 10 s per-call timeout, 10 MiB output cap (typed-tool defaults applied automatically by `invokeCli`).
- Single-in-flight CLI queue gates all CLI invocations.
- 008-refactor surface frozen — `dispatchCli`, `invokeCli`, `invokeBoundedCli`, the in-flight registry, the four-priority error classification, the `obsidian_exec` argv-assembly contract, the `assertToolDocsExist` aggregator, the 011-R5 unknown-vault response-inspection clause are all frozen. `properties` inherits without modification (and the 011-R5 clause specifically does NOT fire for `properties` per R5 / F4).
- The upstream CLI's `properties` subcommand reaches Obsidian's metadata cache; future Obsidian updates may surface as test failures rather than silent drift. The wrapper's contract is locked against the upstream's `format=json` output shape (`[{ name, type, count }]`), asserted by handler tests via `propertiesUpstreamArraySchema.parse`.
**Scale/Scope**: ~140 LOC of new source code split across `schema.ts` / `handler.ts` / `index.ts`. ~920 LOC of co-located tests across three `*.test.ts` files (16 schema / 24 handler / 5 registration = 45 tests, exceeding SC-017's floor of 20). One new doc at `docs/tools/properties.md` (~175 lines including ≥4 worked examples + per-error-code roster + count-only mode example + multi-vault inherited limitation + sort-order note + type-metadata-out-of-scope note + output-cap ceiling). One line of update each in [src/server.ts](../../src/server.ts) (registration + import), [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) (FR-018 baseline roll-forward), [docs/tools/index.md](../../docs/tools/index.md) (summary), [package.json](../../package.json) (description + version bump 0.5.1 → 0.5.2 — PATCH per BI-023 precedent for additive surface), [CHANGELOG.md](../../CHANGELOG.md) (release entry).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Evidence |
|---|---|---|
| **I. Modular Code Organization** | ✅ PASS | New tool lives at `src/tools/properties/` per the established `{schema, handler, index}.ts` per-surface layout (verified against existing siblings `read`, `delete`, `files`, `read_heading`, `read_property`, `write_note`, `set_property`, `rename`, `find_by_property`, `obsidian_exec`, `outline`, `help`). Downward-flow chain preserved: `index.ts` → `handler.ts` → `cli-adapter` → `child_process.spawn`. No upward or cyclic imports. The schema module imports from `zod` only (no `target-mode/` import because there's no target_mode discriminator — different from outline/read/etc.); the handler imports from `cli-adapter/` (peer); `index.ts` imports from `_register.ts` (sibling helper). |
| **II. Public Surface Test Coverage** | ✅ PASS | `properties` is a public MCP tool surface. Co-located tests at `src/tools/properties/{schema,handler,index}.test.ts` — **16 schema cases / 24 handler cases / 5 registration cases = 45 tests total**, exceeding SC-017's floor of 20. Happy-path AND failure-path coverage in every layer. The post-010 consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) automatically covers `properties` via its `it.each` registry walk; no test-file modifications required. The BI-022 FR-018 baseline detector ([src/tools/_register-baseline.test.ts](../../src/tools/_register-baseline.test.ts)) requires a one-shot `npm run baseline:write` to roll the baseline forward; that command-line gesture is the acknowledgement that the registry intentionally changed. |
| **III. Boundary Input Validation with Zod** | ✅ PASS | Input schema is plain `z.object({ vault, total }).strict()` — both fields optional. No `target_mode` discriminator (per FR-004). Inferred TypeScript type via `z.infer<typeof propertiesInputSchema>`. **Output type ALSO via zod schema** `propertiesOutputSchema = z.object({ count, properties }).strict()` with the per-entry shape `z.object({ name, noteCount }).strict()` (FR-006 / FR-007) — no hand-rolled types. The upstream wire schema `propertiesUpstreamArraySchema = z.array(propertiesUpstreamEntrySchema)` is the contract assertion against upstream's `format=json` output (`passthrough` per defence-in-depth — tolerates future upstream additions like a `firstSeen` field). `registerTool` parses input via `schema.parse` before the handler runs (auto-wrap `ZodError → VALIDATION_ERROR` with `details.issues`). Handler trusts validated input; no defensive checks. |
| **IV. Explicit Upstream Error Propagation** | ✅ PASS | Zero new error codes (per FR-018, Constitution Principle IV). Failures flow through `VALIDATION_ERROR` (zod) and `UpstreamError` codes from the cli-adapter (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`). The 011-R5 unknown-vault response-inspection clause does NOT fire for `properties` per R5 — documented as an inherited limitation, NOT a silent failure (multi-vault users see the focused vault's inventory). NO `ERR_NO_ACTIVE_FILE` propagation (no active mode). The handler's two parse-failure paths (`json-parse`, `total-parse`) surface as `CLI_REPORTED_ERROR` with `details.stage` discriminators. `registerTool`'s catch blocks propagate `UpstreamError` via `asToolError` and re-throw any other exception. No `catch + return null/empty/default` patterns. |
| **V. Attribution & Layered Composition Transparency** | ✅ PASS | Every new source file (`src/tools/properties/{schema,handler,index}.ts` + three `*.test.ts`) carries the `// Original — no upstream. <one-line description>.` header per the established convention (FR-023). The Markdown doc at `docs/tools/properties.md` is exempt per [005-help-tool](../005-help-tool/spec.md) FR-019. README's Attributions section is unchanged (no new lifted code; the wrapper is pure pass-through over the upstream CLI). |

**Coverage gate**: aggregate statements floor is 91.3% ([vitest.config.ts:20](../../vitest.config.ts#L20)); the new tests must not drop the aggregate below this. The new module is small (~140 LOC); the 45 co-located test cases provide near-100% coverage of the new module, so the aggregate either stays flat or ratchets up.

**Constitution Compliance checklist** (for the eventual PR): all five principles expected to evaluate as Y. No deviations needed; no Complexity Tracking entries required.

**ADR scope check**: [ADR-003 — Enforce Target Mode in Typed Tools](../../.decisions/) is **NOT APPLICABLE** to this feature — `properties` operates on the entire vault, not on a single named file or focused file. ADR-003 governs file-scoped typed tools; `properties` is the second vault-scoped typed tool (after BI-019 `files`). No deviation; no ADR amendment needed. The schema does NOT consume `targetModeBaseSchema` / `applyTargetModeRefinement`. [ADR-005 — Token-Optimized Tool Definitions](../../.decisions/) reaffirmed; `stripSchemaDescriptions` applied at registration via `registerTool` (auto). [ADR-006 — Centralized Tool Registration](../../.decisions/) reaffirmed; `registerTool` factory wraps schema parse + UpstreamError propagation + JSON serialisation.

## Project Structure

### Documentation (this feature)

```text
specs/024-list-properties/
├── plan.md                                    # This file
├── research.md                                # Phase 0 — design decisions R1–R14 + plan-stage live-CLI findings F1–F14
├── data-model.md                              # Phase 1 — input/output/upstream-wire schema shapes, handler shape, per-tool invariants, module LOC budget, test inventory (45 cases)
├── quickstart.md                              # Phase 1 — verification scenarios Q-1..Q-21 mapped to SC-001..SC-021
├── contracts/
│   ├── properties-input.contract.md           # Public input contract — zod schema + emitted JSON Schema + worked examples (A–G) + error roster + out-of-scope upstream surfaces
│   └── properties-handler.contract.md         # Handler invariants — single invokeCli call shape (× 2 modes), parse step, sort step, failure propagation chain
├── checklists/
│   └── requirements.md                        # Quality checklist from /speckit-specify (16/16 pass)
└── tasks.md                                   # Phase 2 output (created by /speckit-tasks, NOT by this command)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── properties/                            # NEW per-surface module (FR-001)
│   │   ├── schema.ts                          # propertiesInputSchema + propertiesOutputSchema + propertiesUpstreamArraySchema + types via z.infer (FR-002..FR-009, FR-013)
│   │   ├── schema.test.ts                     # 16 cases (vault optional + total optional + types + strict + min-1 + unknown-key)
│   │   ├── handler.ts                         # executeProperties(input, deps) — single invokeCli with format=json or total flag + JSON.parse OR integer parse + type drop + count→noteCount rename + post-fetch sort + UpstreamError mapping for two parse-failure paths (FR-010..FR-014, FR-018)
│   │   ├── handler.test.ts                    # 24 cases (default mode happy + count-only mode happy + empty vault both modes + field rename + type drop + sort order including case-distinct + cross-mode invariant + JSON parse failure + integer parse failure + argv shape × 2 modes + vault omitted vs supplied argv shape + single-spawn-per-request invariant + output-cap kill + token-cost regression for SC-014)
│   │   ├── index.ts                           # createPropertiesTool factory via registerTool (FR-019)
│   │   └── index.test.ts                      # 5 registration cases (descriptor name, stripped schema, help mention, doc presence + content completeness, drift-detector + FR-018 baseline lock)
│   ├── _register.ts                           # FROZEN
│   ├── _register.test.ts                      # FROZEN — drift detector's it.each registry walk auto-covers properties
│   ├── _register-baseline.json                # ROLLED FORWARD by `npm run baseline:write` post-implementation (FR-018 acknowledgement gate)
│   ├── _register-baseline.test.ts             # FROZEN
│   ├── _register-baseline.ts                  # FROZEN
│   ├── _shared.ts                             # FROZEN
│   ├── _shared.test.ts                        # FROZEN
│   ├── help/                                  # FROZEN
│   ├── obsidian_exec/                         # FROZEN
│   ├── outline/                               # FROZEN (SC-015 — zero substantive diff)
│   ├── read/                                  # FROZEN (SC-015)
│   ├── read_heading/                          # FROZEN (SC-015)
│   ├── read_property/                         # FROZEN (SC-015)
│   ├── delete/                                # FROZEN (SC-015)
│   ├── files/                                 # FROZEN (SC-015)
│   ├── find_by_property/                      # FROZEN (SC-015)
│   ├── set_property/                          # FROZEN (SC-015)
│   ├── rename/                                # FROZEN (SC-015)
│   └── write_note/                            # FROZEN (SC-015)
├── server.ts                                  # +2 lines: import + createPropertiesTool({ logger, queue }) added to the tools array (alphabetical, between createOutlineTool and createReadTool)
├── server.test.ts                             # registry-consistency test auto-covers properties's docs/ presence (no edits)
├── cli-adapter/                               # FROZEN (008-refactor surface)
├── target-mode/                               # NOT CONSUMED by this feature (properties has no target_mode discriminator)
├── help/                                      # FROZEN
├── errors.ts                                  # FROZEN (no new codes per FR-018)
├── logger.ts                                  # FROZEN (per R1 — no callStart/callEnd events introduced)
└── queue.ts                                   # FROZEN

docs/tools/
├── properties.md                              # NEW non-stub doc per FR-019 (input schema, output × 2 modes, error roster, ≥4 worked examples covering default-scope happy / named-vault happy / count-only / unknown-vault inherited-limitation note / validation-rejection; multi-vault inherited limitation; output-cap ceiling; sort-order Q1-clarification note; type-metadata-out-of-scope note)
├── index.md                                   # +1 line entry per the existing convention
├── outline.md                                 # FROZEN
├── obsidian_exec.md                           # FROZEN
├── read.md                                    # FROZEN
├── read_heading.md                            # FROZEN
├── read_property.md                           # FROZEN
├── delete.md                                  # FROZEN
├── files.md                                   # FROZEN
├── find_by_property.md                        # FROZEN
├── set_property.md                            # FROZEN
├── rename.md                                  # FROZEN
├── write_note.md                              # FROZEN
└── help.md                                    # FROZEN

CHANGELOG.md                                   # +1 entry under "Unreleased" or 0.5.2 (release versioning is a /speckit-tasks decision)
package.json                                   # version 0.5.1 → 0.5.2 + description string updated to mention properties alongside the existing typed tools
README.md                                      # tools-list section updated (if present)
CLAUDE.md                                      # active-narrative block rewritten by Phase 1 step 3 (done in this command run)
```

**Structure Decision**: Single-project layout per the existing project shape. `src/tools/properties/` is the entire functional surface for this feature; everything else is one-line wiring (server registration, baseline roll-forward, docs index, package description) or out-of-tree documentation (CHANGELOG, README). No new directories at any other layer. Per Constitution Principle I, the new module is single-purpose (typed structural-discovery primitive for vault-wide frontmatter inventory); per Principle II, tests are co-located with sources.

## Phase 0: Research Decisions Summary

Full detail in [research.md](./research.md). Brief index of decisions ratified there:

- **R1 — Logger surface**: thin handler. Mirrors all prior typed tools.
- **R2 — CLI subcommand: native `properties`** (NOT eval). Per F1 — native subcommand exists with `format=json` structured output.
- **R3 — Single-call architecture, branched on `input.total`**: ONE `invokeCli` per request. Default mode → `format=json`. Count-only mode → `total` flag.
- **R4 — Adapter `target_mode` mapping**: NOT APPLICABLE — this tool has no target_mode discriminator. Different from outline / read / read_heading / etc.
- **R5 — Unknown-vault response inspection**: NOT APPLICABLE — `properties` silently honours-as-noop the `vault=` parameter (per F4). Inherited limitation; documented. Parity with `files` / `outline` / `read_heading` / `find_by_property`.
- **R6 — Anti-injection**: natural via process-argument data-passing. No shell, no eval, no string interpolation.
- **R7 — Field rename and field drop**: upstream `count` → wrapper `noteCount`; upstream `type` field DROPPED (per FR-004 out-of-scope type metadata).
- **R8 — Wrapper-side post-fetch sort**: case-insensitive primary with byte-order tiebreak per FR-013. Single `array.sort()` call after the upstream-to-wrapper map.
- **R9 — Empty-vault detection (deferred-to-T0)**: best-evidence assumption — upstream returns `[]` JSON array (default mode) and `0` integer (count-only mode); both handled natively by the parse chain. Sentinel-detection branch is a planning contingency parallel to BI-023 R9.
- **R10 — Output cap**: inherited 10 MiB cap. Surfaces as `CLI_NON_ZERO_EXIT`.
- **R11 — Cross-mode invariant (FR-006a)**: holds by upstream construction per F3 — upstream's `total` flag returns the same integer as the `format=json` array length.
- **R12 — Test seams**: `deps.spawnFn` injection. ONE spawn per request.
- **R13 — Type metadata drop**: upstream emits `type` per entry; wrapper drops per FR-004 out-of-scope.
- **R14 — Multi-vault default ambiguity**: inherited limitation. Documented.

**Plan-stage status**: 14 design decisions ratified. 14 live-CLI findings (F1–F14) verified at plan time against the host's `obsidian` CLI focused on the user's productive vault. Critical findings:

- **F1** (native subcommand with `format=json` structured array output) → R2 / R3 → architectural simplification vs eval composition. Parity with BI-019 / BI-023.
- **F3** (upstream `total` flag returns distinct-names count) → R3 / R11 → Q2 clarification's Option A is satisfied by upstream behaviour directly; cross-mode invariant FR-006a holds by upstream construction.
- **F4** (`vault=` silently honoured-as-noop) → R5 → FR-015 locus resolved to documented inherited limitation. Plan-stage spec amendment to FR-015.
- **F5 + F6** (wire-format transforms: drop `type`, rename `count` → `noteCount`) → R7 → handler parse step is a single `array.map` invocation.

Cases deferred to T0 of `/speckit-implement` (require fixtures + focused-vault state changes):

- F11 — Empty-vault behaviour: probe an empty TestVault under both modes; verify `[]` JSON / integer 0; OR amend R9 with a sentinel-detection branch if upstream emits a sentinel.
- F12 — Body-content opacity end-to-end: probe a TestVault note whose body contains YAML-like tokens.
- F13 — Case-distinct sort verification end-to-end: probe a TestVault with case-distinct property names.
- Path-traversal `vault=` value end-to-end: probe `vault=../escape` and assert no filesystem mutation.
- Very-large-inventory cap-boundary behaviour.

## Phase 1: Design Artifacts

Generated in this command run:

- **[research.md](./research.md)** — design decisions R1–R14 + plan-stage live-CLI findings F1–F14.
- **[data-model.md](./data-model.md)** — input/output/upstream-wire schema shapes, handler shape, per-tool invariants table, module LOC budget, test inventory (16 / 24 / 5 = 45 cases), architectural delta map vs predecessors.
- **[contracts/properties-input.contract.md](./contracts/properties-input.contract.md)** — public input contract: zod schema, emitted JSON Schema shape, field policy, seven worked examples (A–G), error response roster, multi-vault inherited limitation, out-of-scope upstream surfaces table.
- **[contracts/properties-handler.contract.md](./contracts/properties-handler.contract.md)** — handler invariants: deps shape, the single `invokeCli` call shape × 2 modes, the multi-stage parse step (default mode) and single-stage parse step (count-only mode), wrapper-side post-fetch sort implementation, failure propagation chain, test seam pattern, single-spawn invariant.
- **[quickstart.md](./quickstart.md)** — 21 verification scenarios (Q-1..Q-21) mapped to SC-001..SC-021. Q-1..Q-17 in CI; Q-18..Q-21 manual against TestVault during T0 of `/speckit-implement`.
- **[CLAUDE.md](../../CLAUDE.md) active-narrative block rewrite** — the predecessor narrative for 023-outline is retained; the new active-narrative for 024-list-properties is added at the top (done in this command run).
- **[spec.md](./spec.md) plan-stage amendment** — FR-015 amended from "MUST surface a structured error" to "MUST be documented as an inherited limitation" per F4. Edge Cases UNDERLYING CLI — unknown vault section updated to reflect the live-probe outcome (the alternative path is removed; only the inherited-limitation path remains).

## Constitution Re-Check (Post-Design)

| Principle | Compliance | Notes |
|---|---|---|
| I. Modular Code Organization | ✅ PASS | Phase 1 confirmed the per-surface layout; no cross-module imports added beyond the verified set. The single-call architecture (R3) keeps the import topology simple — handler imports cli-adapter only. Schema does NOT import from `target-mode/` (no target_mode discriminator). |
| II. Public Surface Test Coverage | ✅ PASS | Test-set inventory frozen at 45 cases (16 schema / 24 handler / 5 registration). Drift detector + FR-018 baseline both auto-cover. Each handler test responds to ONE spawn invocation per call per R3. |
| III. Boundary Input Validation with Zod | ✅ PASS | Output schema also zod-derived per FR-006 with the uniform `{count, properties}` envelope. The upstream wire schema is `passthrough` for forward-compatibility against future upstream field additions (`firstSeen`, etc.). |
| IV. Explicit Upstream Error Propagation | ✅ PASS | Zero new codes confirmed. The handler's two parse-failure paths (`json-parse`, `total-parse`) wrap as `CLI_REPORTED_ERROR` with `details.stage` discriminators — never silent. ALL other failure surfaces (output-cap, binary-not-found) flow through the dispatch layer's existing classifier without wrapper involvement. NO `ERR_NO_ACTIVE_FILE` propagation (no active mode). |
| V. Attribution & Layered Composition | ✅ PASS | All new files marked Original. No upstream code lifted. The wrapper is pure pass-through over the upstream CLI; the only original logic is the field rename (`count` → `noteCount`), the field drop (`type`), and the post-fetch sort. All three are clearly attributed in the handler header. |

**No Complexity Tracking entries.** No deviations.

## Complexity Tracking

> **No deviations from constitution.** All five principles evaluate as `Y` for this feature. No `N` entries; no Complexity Tracking entries needed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | (n/a)      | (n/a)                               |

**Note on ADR-003 scope**: this feature does NOT enforce `target_mode` (per FR-004 — vault-only surface). ADR-003 governs file-scoped typed tools; `properties` is the second vault-scoped typed tool (after `files` from BI-019). The schema does NOT consume `targetModeBaseSchema` / `applyTargetModeRefinement`. No deviation; no ADR amendment needed.

## Reporting

- **Branch**: `024-list-properties`
- **Plan path**: `specs/024-list-properties/plan.md`
- **Generated artifacts**:
  - `specs/024-list-properties/research.md` — design decisions R1–R14 + plan-stage live-CLI findings F1–F14
  - `specs/024-list-properties/data-model.md` — schema shapes, handler shape, test inventory (45 cases), architectural delta map
  - `specs/024-list-properties/contracts/properties-input.contract.md` — public input contract + 7 worked examples + error roster + out-of-scope upstream surfaces
  - `specs/024-list-properties/contracts/properties-handler.contract.md` — handler invariants (single-call shape × 2 modes, parse step, sort step, failure chain)
  - `specs/024-list-properties/quickstart.md` — 21 verification scenarios mapped to SC-001..SC-021
  - `CLAUDE.md` — active-narrative block rewritten to 024-list-properties; 023-outline narrative retained as predecessor
  - `specs/024-list-properties/spec.md` — plan-stage amendment for FR-015 (unknown-vault → documented inherited limitation per F4)
- **Plan-stage spec amendments**: ONE at plan stage (FR-015 resolution per F4). Logical consistency with the established BI-019 / BI-023 defer-to-upstream pattern.
- **Architectural simplification vs predecessors**: this BI is the **simplest** typed-tool wrap to date — no eval composition (vs BI-014 / BI-015 / BI-018), no target_mode discriminator (vs BI-006 / BI-011 / BI-012 / BI-013 / BI-015 / BI-019 / BI-021 / BI-023), no empty-vault sentinel (deferred to T0 — likely natural empty-array handling). The wrapper is pure pass-through modulo three transforms: field rename (`count` → `noteCount`), field drop (`type`), and post-fetch sort. Most of the spec's contracts are satisfied directly by upstream behaviour + the dispatch layer's existing classifier.
- **Q1 / Q2 clarifications survive the live probe**: the 2026-05-13 clarifications session's Q1 (case-insensitive primary sort) is wrapper-locked regardless of upstream; the Q2 (`total: true` = distinct names count) is satisfied by upstream behaviour directly per F3 — both commitments hold without amendment.
- **Next command**: `/speckit-tasks` — produces `tasks.md` with dependency-ordered, atomic tasks (T001..TNNN) per the established convention.
