# Implementation Plan: Read Property — Typed Surgical Frontmatter Read

**Branch**: `013-read-property` | **Date**: 2026-05-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [/specs/013-read-property/spec.md](./spec.md)

## Summary

Add `read_property`, the fourth typed-tool wrap on top of the foundation completed by features 003–010 and the second since [012-delete-note](../012-delete-note/spec.md). Where `read_note` retired `obsidian_exec` for full-file reads, `write_note` for create/overwrite, and `delete_note` for destructive single-file removal, `read_property` retires it for surgical frontmatter-property reads — agents that want a single named property no longer pay the token cost of a full-file fetch plus client-side YAML parsing. The user-facing surface: `read_property({ target_mode, vault?, file? | path?, name })` returning `{ value: <native-typed>, type: <"text" | "list" | "number" | "checkbox" | "date" | "datetime" | "unknown"> }`.

**Technical approach** (load-bearing departures from the 011 / 012 single-call typed-tool pattern):
- **CLI subcommand**: `properties` (plural) with `format=json`, NOT `property:read`. Live-CLI characterisation (R2) showed `property:read` is structurally lossy (renders mappings as `[object Object]`, conflates literal-`"null"` with YAML-null at the wire, returns plain text without type info). The `properties format=json` channel preserves native types via JSON encoding.
- **Two-call architecture (R3)**: each MCP call fires TWO `invokeCli` invocations under the hood. Call A (file-scoped, `properties path=<p> format=json`) returns the file's frontmatter as a JSON object — sources `value` and detects absent vs explicit-null. Call B (vault-scoped, `properties format=json`) returns Obsidian's resolved type-metadata array — sources the `type` label that distinguishes date/datetime/text strings (which JSON encoding alone cannot). Short-circuit cases (no-frontmatter, absent property) skip Call B because the type is structurally fixed at `"unknown"`.
- **Schema**: post-010 Pattern (a) flat-extension idiom, NO active-mode `superRefine` clauses (parity with `delete_note`'s R6 — `name` has well-defined semantics in both modes): `applyTargetModeRefinement(targetModeBaseSchema.extend({ name: z.string().min(1) }))`. The schema reduces to the target-mode primitive's existing rules plus a single required `name` field.
- **Output schema**: `z.object({ value: z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown()), z.record(z.unknown()), z.null()]), type: z.enum(PROPERTY_TYPE_LABELS) }).strict()`. The union admits the polymorphic `value` shape (FR-008 / FR-027 / Q2's mapping branch); the enum is the seven labels.
- **Type-label translation (R6)**: Obsidian's vault-metadata labels (`text` / `multitext` / `aliases` / `tags` / `number` / `checkbox` / `date` / `datetime` / `unknown`) translate to the spec's seven-label enum via a fixed lookup table. `multitext` → `list`; `aliases` / `tags` → `list`; unrecognised labels → `unknown`. The translation is wrapper-side and forward-compatible.
- **`No frontmatter found.` short-circuit (R7)**: live characterisation showed Obsidian conflates "no frontmatter block" with "malformed frontmatter (missing closing fence)" — both surface as `No frontmatter found.` on stdout. The handler short-circuits to `{value: null, type: "unknown"}` per FR-011 semantics. **FR-012's "structured error for malformed frontmatter" is weakened to match Obsidian's actual conflation** (documented in research.md, NOT amended in spec.md per R12).
- **Active-mode multi-vault limitation (R4)**: in active mode, Call B uses no `vault=` parameter — querying Obsidian's default vault for type metadata, not the focused-note's vault. Single-vault users get correct behaviour; multi-vault users may get wrong type labels in active mode. Documented as a known limitation in `docs/tools/read_property.md`.
- **Q1 / Q2 contingencies**: both resolved by live characterisation. Q1 (absent vs explicit-null) does NOT fire (Obsidian's metadata channel distinguishes — absent surfaces `type: "unknown"`, explicit-null surfaces `type: "text"` or whatever Obsidian inferred). Q2 (mappings) confirmed (Obsidian itself labels mappings as `"unknown"`, matching the spec's pre-committed Q2 → A answer).
- **Registration**: via the existing `registerTool` factory — the factory auto-applies `stripSchemaDescriptions`, wraps `ZodError → VALIDATION_ERROR`, propagates `UpstreamError → asToolError`, and JSON-serialises typed output objects into the MCP `content[0].text` envelope (matching prior tools' pattern exactly).
- **Plan-stage characterisation status (FR-024)**: 9 of 15 cases verified live during plan against the authorised test vault `TestVault-Obsidian-CLI-MCP` (per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md), gated by CLAUDE.md's `## Test Execution` section). Cases verified: subcommand argv shape, file-scoped value preservation for all six native types, vault-scoped type metadata (Obsidian's resolved labels), unknown vault, missing file, no-frontmatter, malformed-frontmatter conflation, active-mode no-focused-note. Cases deferred to T0 of `/speckit-implement`: active-mode happy path, YAML comments / anchors / aliases, CRLF-vs-LF, heterogeneous-list (T0 lock for the type-label assignment Obsidian uses).

## Technical Context

**Language/Version**: TypeScript (strict mode, `tsc --noEmit` clean) — pinned in [tsconfig.json](../../tsconfig.json), runtime Node.js >= 22.11 per `engines.node` in [package.json](../../package.json).
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP transport), `zod` (validation, single source of truth per Constitution III), `zod-to-json-schema` (consumed via the existing `toMcpInputSchema` helper at [src/tools/_shared.ts](../../src/tools/_shared.ts)).
**Storage**: N/A — the tool is stateless. The CLI reads the vault on disk; `read_property` is the wrapper. NO caching of vault-scoped type metadata across requests (R3) — the project's existing tools are stateless and we preserve that posture.
**Testing**: vitest with `@vitest/coverage-v8`. Co-located `*.test.ts` per module. The aggregate statements coverage threshold floor is **89.6%** ([vitest.config.ts:20](../../vitest.config.ts#L20)). Tests inject the cli-adapter's stub `spawnFn` via `deps.spawnFn` per the existing test-seam convention; no real `obsidian` binary executions in CI. **Each handler test must respond to TWO spawn invocations** (Call A + Call B) per the R3 two-call architecture; short-circuit-path tests respond to one.
**Target Platform**: cross-platform Node.js MCP server (Windows / macOS / Linux). The host shells out to the Obsidian CLI binary via `child_process.spawn`. CLI subcommand `properties` with `format=json` is OS-independent (Obsidian's CLI surface is the same across platforms); CRLF-vs-LF round-tripping (FR-020) requires platform-specific fixture-saving for T0 verification.
**Project Type**: MCP server with one new typed tool. Per Constitution v1.2.0, the project exposes "an MCP server surface" only; `read_property` adds one entry to the registered-tool list at [src/server.ts:65](../../src/server.ts#L65) (alphabetical: between `read_note` and `write_note`).
**Performance Goals**: per-call latency ≈ 2× the existing single-call typed tools (R3 — Call A and Call B serialise through the project's single-in-flight queue). Vault-scoped Call B response size scales with the number of distinct property names in the vault (typically 10s; pathological vaults with thousands produce ~50KB+ JSON responses). Both calls fit within the typed-tool 10 s timeout / 10 MiB output cap inherited from the cli-adapter. **Token saving on the response side** is the primary win (per SC-014 — ≤200 characters of structured response replaces what previously required a full-file read).
**Constraints**:
- 10 s per-call timeout, 10 MiB output cap (typed-tool defaults applied automatically by `invokeCli` per [src/cli-adapter/cli-adapter.ts:10-11](../../src/cli-adapter/cli-adapter.ts#L10-L11)).
- Single-in-flight CLI queue gates all CLI invocations — Call A and Call B serialise through one channel.
- 008-refactor surface frozen — `dispatchCli`, `invokeCli`, `invokeBoundedCli`, the in-flight registry, the four-priority error classification, the `obsidian_exec` argv-assembly contract, the `assertToolDocsExist` aggregator, the 011-R5 unknown-vault response-inspection clause are all frozen. `read_property` inherits without modification.
- The `properties` subcommand response shapes (file-scoped JSON object + vault-scoped metadata array + `No frontmatter found.` text) are the locked CLI-coupling surface; future Obsidian version drift surfaces as test failures rather than silent regressions.
**Scale/Scope**: ~155 LOC of new code split across `schema.ts` / `handler.ts` / `index.ts` (higher than 012's ~120 because the two-call architecture and polymorphic value union add complexity), plus three co-located test files of similar size. One new doc at `docs/tools/read_property.md` (~200 lines including 4+ worked examples + per-error-code roster + the active-mode multi-vault limitation + the R7 FR-011/FR-012 conflation note). One line of update each in `src/server.ts` (registration), `docs/tools/index.md` (summary), `package.json` (description), `CHANGELOG.md` (release entry).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Evidence |
|---|---|---|
| **I. Modular Code Organization** | ✅ PASS | New tool lives at `src/tools/read_property/` per the established `{schema, handler, index}.ts` per-surface layout (verified against existing siblings `obsidian_exec`, `help`, `read_note`, `write_note`, `delete_note`). Downward-flow chain preserved: `index.ts` → `handler.ts` → `cli-adapter` → `child_process.spawn`. No upward or cyclic imports. The schema module imports from `target-mode/` (peer primitive); the handler imports from `cli-adapter/` (peer); `index.ts` imports from `_register.ts` (sibling helper). |
| **II. Public Surface Test Coverage** | ✅ PASS | `read_property` is a public MCP tool surface. Co-located tests at `src/tools/read_property/{schema,handler,index}.test.ts` (14 schema cases / 17 handler cases / 5 registration cases per FR-023 = **36 tests total**, exceeding SC-011's floor of 25). Happy-path AND failure-path coverage in every layer. The post-010 consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) automatically covers `read_property` via its `it.each` registry walk; no test-file modifications required. |
| **III. Boundary Input Validation with Zod** | ✅ PASS | Input schema is `applyTargetModeRefinement(targetModeBaseSchema.extend({ name }))` — composed from the project's single-source-of-truth `target_mode` primitive plus one `read_property`-specific field. **No `.superRefine(...)` chain** (parity with `delete_note`'s R6). Inferred TypeScript type via `z.infer<typeof readPropertyInputSchema>`. **Output type ALSO via zod schema** `readPropertyOutputSchema = z.object({ value: <union>, type: <enum> }).strict()` (FR-007) — no hand-rolled types. The polymorphic `value` is `z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown()), z.record(z.unknown()), z.null()])` covering all six runtime shapes from JSON-parsed frontmatter values (FR-008 + FR-027 mappings). `registerTool` parses input via `schema.parse` before the handler runs (auto-wrap `ZodError → VALIDATION_ERROR` with `details.issues`). Handler trusts validated input; no defensive checks. |
| **IV. Explicit Upstream Error Propagation** | ✅ PASS | Zero new error codes (per FR-021, Constitution Principle IV). Failures flow through `VALIDATION_ERROR` (zod) and `UpstreamError` codes from the cli-adapter (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`). The 011-R5 unknown-vault response-inspection clause in the cli-adapter is inherited verbatim — no `read_property`-specific handling needed (R5). The `No frontmatter found.` short-circuit (R7) is a SUCCESS-path branching at the handler layer (returns `{value: null, type: "unknown"}` per FR-011), not an error code. `registerTool`'s catch blocks propagate `UpstreamError` via `asToolError` and re-throw any other exception. No `catch + return null/empty/default` patterns. |
| **V. Attribution & Layered Composition Transparency** | ✅ PASS | Every new source file (`src/tools/read_property/{schema,handler,index}.ts` + three `*.test.ts`) carries the `// Original — no upstream. <one-line description>.` header per the established convention (FR-026). The Markdown doc at `docs/tools/read_property.md` is exempt per [005-help-tool](../005-help-tool/spec.md) FR-019. README's Attributions section is unchanged (no new lifted code). |

**Coverage gate**: aggregate statements floor is 89.6% ([vitest.config.ts:20](../../vitest.config.ts#L20)); the new tests must not drop the aggregate below this. The new module is small (~155 LOC); the 36 co-located test cases provide near-100% coverage of the new module, so the aggregate either stays flat or ratchets up.

**Constitution Compliance checklist** (for the eventual PR): all five principles expected to evaluate as Y. No deviations needed; no Complexity Tracking entries required.

**Plan-stage spec amendments documented in research.md (per R12 — not amended in spec.md)**:
- **R3 — Two-call architecture**: the spec did not pre-commit to a CLI-call count. Plan-stage research locked the two-call pattern as the only design that preserves the spec's full `{value, type}` contract. Latency cost ≈ 2× single-call.
- **R7 — FR-011 / FR-012 conflation**: live characterisation revealed Obsidian conflates "no frontmatter block" with "malformed frontmatter" (both produce `No frontmatter found.`). Spec FR-012's "structured error for malformed frontmatter" is **weakened to match Obsidian** — both cases follow FR-011's `{value: null, type: "unknown"}` semantic. The Q1 contingency mechanism (clarifications session 2026-05-09) provides the precedent for this kind of "amend at planning time when live CLI conflates" amendment.
- **R4 — Active-mode multi-vault limitation**: Call B in active mode queries Obsidian's default vault for type metadata, not the focused-note's vault. Single-vault correct; multi-vault has a known limitation. Documented in `docs/tools/read_property.md`.

These amendments are NOT applied to spec.md (R12 precedent — predecessor specs are not edited retroactively); they are documented in research.md and will be cited in the merge-stage Constitution Compliance checklist's evidence section.

## Project Structure

### Documentation (this feature)

```text
specs/013-read-property/
├── plan.md              # This file
├── research.md          # Phase 0 output — design decisions R1–R12 + plan-stage live-CLI findings
├── data-model.md        # Phase 1 output — input/output schema shapes, two-call architecture, type-translation table
├── quickstart.md        # Phase 1 output — verification scenarios (S-1..S-15 mapped to SC-001..SC-015)
├── contracts/
│   ├── read-property-input.contract.md     # Public input contract (zod schema + emitted JSON Schema shape)
│   └── read-property-handler.contract.md   # Handler invariants (two-call invokeCli shape, response parsing, type translation)
└── tasks.md             # Phase 2 output (created by /speckit-tasks, NOT by this command)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── read_property/                  # NEW per-surface module (FR-001)
│   │   ├── schema.ts                   # readPropertyInputSchema, readPropertyOutputSchema, types via z.infer (FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008)
│   │   ├── schema.test.ts              # 14 cases per FR-023 (target-mode primitive's existing rules + name field rules + unknown-key rejection)
│   │   ├── handler.ts                  # executeReadProperty(input, deps) — two-call invokeCli wrapper + parsePropertiesResponse + translateObsidianType (FR-007, FR-008, FR-010..FR-027); ≤80 LOC
│   │   ├── handler.test.ts             # 17 cases per FR-023 (covers happy + each native type + each UpstreamError code + Q1/Q2 contingencies + active mode + type translation + name passthrough + R7 short-circuit)
│   │   ├── index.ts                    # createReadPropertyTool factory via registerTool (FR-022)
│   │   └── index.test.ts               # 5 registration cases per FR-023 (descriptor name, stripped schema, help mention, doc presence + content completeness, drift-detector parameterised lock)
│   ├── _register.ts                    # FROZEN (verified — no edits needed; registerTool covers read_property out-of-the-box)
│   ├── _register.test.ts               # FROZEN — drift detector's it.each registry walk auto-covers read_property
│   ├── _shared.ts                      # FROZEN
│   ├── help/                           # FROZEN
│   ├── obsidian_exec/                  # FROZEN (SC-009 — zero substantive diff)
│   ├── read_note/                      # FROZEN (SC-009 — zero substantive diff)
│   ├── write_note/                     # FROZEN (SC-009 — zero substantive diff)
│   └── delete_note/                    # FROZEN (SC-009 — zero substantive diff)
├── server.ts                           # +2 lines: import + createReadPropertyTool({ logger, queue }) added to the tools array (alphabetical between read_note and write_note)
├── server.test.ts                      # registry-consistency test auto-covers read_property's docs/ presence (no edits)
├── cli-adapter/                        # FROZEN (008-refactor surface + 011-R5 unknown-vault inspection clause)
├── target-mode/                        # FROZEN (post-010 surface)
├── help/                               # FROZEN
├── errors.ts                           # FROZEN (no new codes per FR-021)
├── logger.ts                           # FROZEN (per R1 — no callStart/callEnd events introduced)
└── queue.ts                            # FROZEN

docs/tools/
├── read_property.md                    # NEW non-stub doc per FR-022 (input schema, output, error roster, ≥4 worked examples covering ≥4 distinct YAML types, two-call note, active-mode multi-vault limitation, R7 conflation note)
├── index.md                            # +1 line entry per the existing convention
├── obsidian_exec.md                    # FROZEN (no per-tool note for read_property — the typed surface description in `docs/tools/read_property.md` is the disclosure)
├── read_note.md                        # FROZEN
├── write_note.md                       # FROZEN
├── delete_note.md                      # FROZEN
└── help.md                             # FROZEN

CHANGELOG.md                            # +1 entry under "Unreleased" or 0.2.6 (release versioning is a /speckit-tasks decision)
package.json                            # description string updated to mention read_property alongside the existing typed tools
README.md                               # tools-list section updated (if present)
CLAUDE.md                               # plan-pointer updated by Phase 1 step 3 to reference this plan
```

**Structure Decision**: Single-project layout per the existing project shape. `src/tools/read_property/` is the entire functional surface for this feature; everything else is one-line wiring (server registration, docs index, package description) or out-of-tree documentation (CHANGELOG, README). No new directories at any other layer. Per Constitution Principle I, the new module is single-purpose (typed read tool); per Principle II, tests are co-located with sources.

## Phase 0: Research Decisions Summary

Full detail in [research.md](./research.md). Brief index of decisions ratified there:

- **R1 — Logger surface (FR-009 reconciliation)**: thin handler, no per-call `logger.callStart`/`callEndSuccess`/`callEndFailure` events at the tool layer. Mirrors actual `read_note` / `write_note` / `delete_note` implementations. Spec FR-009's wording is left in place per R12.
- **R2 — CLI subcommand selection**: `properties` (plural) with `format=json`, NOT `property:read`. The latter is structurally lossy.
- **R3 — Two-call architecture**: file-scoped value (Call A) + vault-scoped type metadata (Call B). The only design that preserves the spec's `{value, type}` contract; single-call alternatives all violate.
- **R4 — Active mode (`active` flag)**: Call A uses the `active` flag in active mode. Call B is vault-scoped (no `active` flag) and uses Obsidian's default vault for type metadata in active mode — multi-vault correctness is a documented limitation.
- **R5 — Unknown-vault response inspection**: inherited from the cli-adapter's existing 011-R5 clause; no further changes. `Vault not found.` byte-identical across `properties`, `create`, `delete`.
- **R6 — Type label translation table**: Obsidian → spec enum mapping. `multitext` → `list`; `aliases` / `tags` → `list`; unrecognised → `unknown`.
- **R7 — `No frontmatter found.` short-circuit + FR-011 / FR-012 conflation**: Obsidian conflates no-frontmatter with malformed-frontmatter. Spec FR-012 weakened — both cases return `{value: null, type: "unknown"}`.
- **R8 — Q1 / Q2 contingencies resolved**: Q1 (absent vs explicit-null distinguishability) does NOT fire (Obsidian's metadata channel distinguishes); Q2 (mappings) confirmed (Obsidian itself labels mappings as `"unknown"`).
- **R9 — Test seams**: `deps.spawnFn` injection per the existing pattern. Tests respond to TWO spawn invocations per request (Call A + Call B); short-circuit cases assert ONE invocation.
- **R10 — `import.meta.url` path resolution + coverage threshold preservation**: mirrors 011 / 012 R8 + R9.
- **R11 — Locator argv keys match schema fields directly**: `file=` / `path=` for the `properties` subcommand. No rename.
- **R12 — Don't amend predecessor specs**: research.md is the source of record; spec.md NOT edited retroactively.

**Plan-stage status**: all 12 design decisions ratified. 9 FR-024 cases verified live during plan; 6 deferred to T0 of `/speckit-implement` (cosmetic edge cases — YAML comments / anchors / aliases, CRLF-vs-LF, active-mode happy path, heterogeneous-list type label).

## Phase 1: Design Artifacts

Generated in this command run:

- **[research.md](./research.md)** — design decisions R1–R12 + plan-stage live-CLI findings.
- **[data-model.md](./data-model.md)** — input/output schema diagrams, two-call CLI invocation shape, argv-mapping table, type-translation table (R6), response-parsing decision tree (R7), per-tool invariants, module layout LOC budget.
- **[contracts/read-property-input.contract.md](./contracts/read-property-input.contract.md)** — public input contract: zod schema, emitted JSON Schema shape, the five top-level fields, the post-010 strict-mode constraints, the `name` field semantics, version-stability guarantee.
- **[contracts/read-property-handler.contract.md](./contracts/read-property-handler.contract.md)** — handler invariants: deps shape, the TWO `invokeCli` call shapes (Call A + Call B), the argv-mapping rules (no rename, `name` never forwarded), the response-parsing logic for both calls (R7 short-circuit + JSON.parse + type lookup + R6 translation), the failure propagation chain, the test-seam pattern (TWO spawns per request).
- **[quickstart.md](./quickstart.md)** — 15 verification scenarios (S-1..S-15) mapped 1:1 to SC-001..SC-015, with explicit run instructions for each. S-12 / S-13 are manual end-to-end steps against MCP Inspector / Claude Desktop; S-14 is the deliberate-revert sanity check; S-15 is the documentation cross-reference check.
- **CLAUDE.md plan-pointer update** — the plan reference is updated to point at this plan file.

## Constitution Re-Check (Post-Design)

| Principle | Compliance | Notes |
|---|---|---|
| I. Modular Code Organization | ✅ PASS | Phase 1 confirmed the per-surface layout; no cross-module imports added beyond the verified set. The two-call architecture (R3) is internal to `handler.ts`; doesn't change the import topology. |
| II. Public Surface Test Coverage | ✅ PASS | Test-set inventory frozen at 36 cases (14 schema / 17 handler / 5 registration). Drift detector auto-covers. Each handler test responds to the right number of spawn invocations (TWO for happy path, ONE for short-circuit cases). |
| III. Boundary Input Validation with Zod | ✅ PASS | Output schema also zod-derived per FR-007 with the polymorphic union for `value`. No `superRefine` chain (parity with delete_note's R6). The seven-label `type` enum is the public contract; the R6 translation table is an internal implementation detail. |
| IV. Explicit Upstream Error Propagation | ✅ PASS | Zero new codes confirmed. R5 inherits the 011-R5 cli-adapter response-inspection clause without modification. R7's `No frontmatter found.` short-circuit is a SUCCESS-path branching, not an error — fits FR-011's "no error" semantic verbatim. |
| V. Attribution & Layered Composition | ✅ PASS | All new files marked Original. No upstream code lifted. The two-call architecture (R3) is original wrapper logic; not derived from any external project. |

**No Complexity Tracking entries.** No deviations.

## Complexity Tracking

> **No deviations from constitution.** All five principles evaluate as `Y` for this feature. No `N` entries; no Complexity Tracking entries needed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | (n/a)      | (n/a)                               |

## Reporting

- **Branch**: `013-read-property`
- **Plan path**: `specs/013-read-property/plan.md`
- **Generated artifacts**:
  - `specs/013-read-property/research.md` — design decisions R1–R12 + plan-stage live-CLI findings
  - `specs/013-read-property/data-model.md` — schema shapes, two-call architecture, type-translation table
  - `specs/013-read-property/contracts/read-property-input.contract.md` — public input contract
  - `specs/013-read-property/contracts/read-property-handler.contract.md` — handler invariants (two-call shape)
  - `specs/013-read-property/quickstart.md` — 15 verification scenarios
  - `CLAUDE.md` — plan reference updated
- **Plan-stage spec amendments** (documented in research.md per R12; NOT applied to spec.md):
  - R3 — Two-call architecture (latency ≈ 2× single-call)
  - R7 — FR-011 / FR-012 conflation (Obsidian conflates malformed with no-frontmatter)
  - R4 — Active-mode multi-vault limitation
- **Next command**: `/speckit-tasks` — produces `tasks.md` with dependency-ordered, atomic tasks (T001..TNNN) per the established convention.
