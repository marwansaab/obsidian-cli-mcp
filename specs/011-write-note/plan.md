# Implementation Plan: Write Note Typed MCP Tool

**Branch**: `011-write-note` | **Date**: 2026-05-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [/specs/011-write-note/spec.md](./spec.md)

## Summary

Add `write_note`, the second typed-tool wrap on top of the foundation completed by features 003–010. Symmetric counterpart of [`read_note`](../006-read-note/spec.md): typed `target_mode` discriminator, schema-validated input, structured `UpstreamError` propagation, progressive-disclosure documentation. Wraps the Obsidian CLI's `create` subcommand (verified live: `obsidian help create` shows argv `name=<name>`, `path=<path>`, `content=<text>`, `template=<name>`, plus flags `overwrite` / `open` / `newtab`). Replaces `obsidian_exec` for create/overwrite operations; `obsidian_exec` remains the freeform escape hatch for the `newtab` flag and unwrapped subcommands.

**Technical approach**: 
- **Schema**: `applyTargetModeRefinement(targetModeBaseSchema.extend({ content, template, overwrite, open })).superRefine(<active-mode rules>)`. Three additional `superRefine` clauses per Clarifications 2026-05-08 — active mode requires `overwrite: true`; active mode forbids `template`; active mode forbids `open`.
- **Handler**: thin `invokeCli` wrapper at `src/tools/write_note/handler.ts`. Maps user-facing field `file` → CLI argv token `name=<value>` (the create subcommand's wikilink-locator key differs from `read`'s `file=<value>`). Emits `overwrite` / `open` as `flags: ["overwrite"|"open"]` (live CLI uses flag form, NOT key=value as the spec hedged on per FR-007). Returns `{ created: boolean, path: string }` derived from CLI stdout.
- **Registration**: via the existing `registerTool` factory at [src/tools/_register.ts](../../src/tools/_register.ts). The factory auto-applies `stripSchemaDescriptions`, wraps `ZodError → VALIDATION_ERROR`, propagates `UpstreamError → asToolError`, and JSON-serialises typed output objects into the MCP `content[0].text` envelope (matching `read_note`'s pattern exactly).
- **Output schema**: `z.object({ created: z.boolean(), path: z.string() }).strict()` — zod is the source of truth for output shape too (FR-005).
- **Plan-stage characterisation (FR-019)**: argv shape and flag-vs-key=value form verified live via `obsidian help create`. Response wording for `created: true` (success), unknown-vault, overwrite-refused, and the other six FR-019 cases is captured at implementation T0 against a SCRATCH vault subdirectory the user explicitly authorises — NOT during this plan run, which already triggered one accidental side-effect (a no-args probe created `Untitled.md` in the user's "The Setup" vault; cleaned up immediately).

## Technical Context

**Language/Version**: TypeScript (strict mode, `tsc --noEmit` clean) — pinned in [tsconfig.json](../../tsconfig.json), runtime Node.js >= 22.11 per `engines.node` in [package.json](../../package.json).
**Primary Dependencies**: `@modelcontextprotocol/sdk` ^1.0.4 (MCP transport), `zod` (validation, single source of truth per Constitution III), `zod-to-json-schema` (consumed via the existing `toMcpInputSchema` helper at [src/tools/_shared.ts](../../src/tools/_shared.ts)).
**Storage**: N/A — the tool is stateless. The CLI mutates the vault on disk; `write_note` is the wrapper.
**Testing**: vitest with @vitest/coverage-v8. Co-located `*.test.ts` per module. The aggregate statements coverage threshold floor is **89.6%** ([vitest.config.ts:20](../../vitest.config.ts#L20)). Tests inject the cli-adapter's stub `spawnFn` via `deps.spawnFn` per the existing test-seam convention; no real `obsidian` binary executions in CI.
**Target Platform**: cross-platform Node.js MCP server (Windows / macOS / Linux). The host shells out to the Obsidian CLI binary via `child_process.spawn`. The OS argv-length ceiling matters (≈32 KiB Windows, ≈2 MiB Linux) and is documented in `docs/tools/write_note.md` per FR-014; no schema-level cap (Clarifications 2026-05-08 Q2).
**Project Type**: MCP server with one new typed tool. Per Constitution v1.2.0, the project exposes "an MCP server surface" only; `write_note` adds one entry to the registered-tool list at [src/server.ts:65](../../src/server.ts#L65).
**Performance Goals**: per-call latency dominated by the underlying CLI invocation (Obsidian's IPC); the MCP-layer wrapper adds ~milliseconds. The shared in-flight queue (per FR-008, inherited from [006-read-note](../006-read-note/spec.md) FR-016) serializes `obsidian_exec` / `read_note` / `write_note` invocations through one channel — by design, throughput is bounded for safety. No throughput SLOs.
**Constraints**: 
- 10 s per-call timeout, 10 MiB output cap (typed-tool defaults applied automatically by `invokeCli` per [src/cli-adapter/cli-adapter.ts:10-11](../../src/cli-adapter/cli-adapter.ts#L10-L11)).
- Single-in-flight CLI queue gates all CLI invocations (no parallel write_note → write_note races on the same path).
- 008-refactor surface frozen — `dispatchCli`, `invokeCli`, `invokeBoundedCli`, the in-flight registry, the four-priority error classification, the `obsidian_exec` argv-assembly contract, the `assertToolDocsExist` aggregator are all frozen (per CLAUDE.md). `write_note` adds a new tool module; it does NOT touch these primitives.
**Scale/Scope**: ~150–200 LOC of new code split across `schema.ts` / `handler.ts` / `index.ts`, plus three co-located test files of similar size. One new doc at `docs/tools/write_note.md` (~150 lines including 4 worked examples). One line of update each in `src/server.ts` (registration), `docs/tools/index.md` (summary), `package.json` (description), `CHANGELOG.md` (release entry).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Evidence |
|---|---|---|
| **I. Modular Code Organization** | ✅ PASS | New tool lives at `src/tools/write_note/` per the established `{schema, handler, index}.ts` per-surface layout (verified against existing siblings `obsidian_exec`, `help`, `read_note`). Downward-flow chain preserved: `index.ts` → `handler.ts` → `cli-adapter` → `child_process.spawn`. No upward or cyclic imports. The schema module imports from `target-mode/` (peer primitive); the handler imports from `cli-adapter/` (peer); `index.ts` imports from `_register.ts` (sibling helper). |
| **II. Public Surface Test Coverage** | ✅ PASS | `write_note` is a public MCP tool surface. Co-located tests at `src/tools/write_note/{schema,handler,index}.test.ts` (15 schema cases / 12 handler cases / 5 registration cases per FR-016). Happy-path AND failure-path coverage in every layer. The post-010 consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) automatically covers `write_note` via its `it.each` registry walk (per FR-016 / SC-010); no test-file modifications required. |
| **III. Boundary Input Validation with Zod** | ✅ PASS | Input schema is `applyTargetModeRefinement(targetModeBaseSchema.extend(...)).superRefine(...)` — composed from the project's single-source-of-truth `target_mode` primitive plus three `write_note`-specific active-mode clauses (Clarifications 2026-05-08 Q1, Q3). Inferred TypeScript type via `z.infer<typeof writeNoteInputSchema>`. Output type ALSO via zod schema `writeNoteOutputSchema = z.object({ created, path }).strict()` (FR-005) — no hand-rolled types. `registerTool` parses input via `schema.parse` before the handler runs (auto-wrap `ZodError → VALIDATION_ERROR` with `details.issues`). Handler trusts validated input; no defensive checks. |
| **IV. Explicit Upstream Error Propagation** | ✅ PASS | Zero new error codes (per FR-018, user input, Constitution Principle IV). Failures flow through `VALIDATION_ERROR` (zod, including post-010 `unrecognized_keys` strict-mode + the new active-mode clauses) and `UpstreamError` codes from the cli-adapter (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`). `registerTool`'s catch blocks propagate `UpstreamError` via `asToolError` and re-throw any other exception (matches `read_note` precedent). No `catch + return null/empty/default` patterns. |
| **V. Attribution & Layered Composition Transparency** | ✅ PASS | Every new source file (`src/tools/write_note/{schema,handler,index}.ts` + three `*.test.ts`) carries the `// Original — no upstream. <one-line description>.` header per the established convention. The Markdown doc at `docs/tools/write_note.md` is exempt per [005-help-tool](../005-help-tool/spec.md) FR-019. README's Attributions section is unchanged (no new lifted code). |

**Coverage gate**: aggregate statements floor is 89.6% ([vitest.config.ts:20](../../vitest.config.ts#L20)); the new tests must not drop the aggregate below this. The new module is small (~150–200 LOC); the 32 co-located test cases (15+12+5) provide near-100% coverage of the new module, so the aggregate either stays flat or ratchets up.

**Constitution Compliance checklist** (for the eventual PR): all five principles expected to evaluate as Y. No deviations needed; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/011-write-note/
├── plan.md              # This file
├── research.md          # Phase 0 output — design decisions R1–R10 + FR-019 case-capture deferral
├── data-model.md        # Phase 1 output — input/output schema shapes, superRefine clauses, argv-mapping table
├── quickstart.md        # Phase 1 output — verification scenarios (S-1..S-13 mapped to SC-001..SC-013)
├── contracts/
│   ├── write-note-input.contract.md   # Public input contract (zod schema + emitted JSON Schema shape)
│   └── write-note-handler.contract.md # Handler invariants (argv mapping, flag emission, response parsing)
└── tasks.md             # Phase 2 output (created by /speckit-tasks, NOT by this command)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── write_note/                  # NEW per-surface module (FR-001)
│   │   ├── schema.ts                # writeNoteInputSchema, writeNoteOutputSchema, types via z.infer (FR-002, FR-003, FR-005)
│   │   ├── schema.test.ts           # 15 cases per FR-016 (k/l/m new for active-mode clauses)
│   │   ├── handler.ts               # executeWriteNote(input, deps) — thin invokeCli wrapper (FR-007)
│   │   ├── handler.test.ts          # 12 cases per FR-016 (covers happy + each UpstreamError code + boundaries)
│   │   ├── index.ts                 # createWriteNoteTool factory via registerTool (FR-011, FR-012)
│   │   └── index.test.ts            # 5 registration cases per FR-016 (descriptor name, stripped schema, help mention, doc presence)
│   ├── _register.ts                 # FROZEN (verified — no edits needed; registerTool covers write_note out-of-the-box)
│   ├── _register.test.ts            # FROZEN — drift detector's it.each registry walk auto-covers write_note (SC-010)
│   ├── _shared.ts                   # FROZEN
│   ├── help/                        # FROZEN
│   ├── obsidian_exec/               # FROZEN (SC-009 — zero substantive diff)
│   └── read_note/                   # FROZEN (SC-009 — zero substantive diff)
├── server.ts                        # +1 line: createWriteNoteTool({ logger, queue }) added to the tools array
├── server.test.ts                   # registry-consistency test auto-covers write_note's docs/ presence (no edits)
├── cli-adapter/                     # FROZEN (008-refactor surface)
├── target-mode/                     # FROZEN (post-010 surface)
├── help/                            # FROZEN
├── errors.ts                        # FROZEN (no new codes per FR-018)
├── logger.ts                        # FROZEN (per R1 below — no callStart/callEnd events introduced)
└── queue.ts                         # FROZEN

docs/tools/
├── write_note.md                    # NEW non-stub doc per FR-014 (input schema, output, error roster, ≥4 examples, edge-case behaviours)
├── index.md                         # +1 line entry per FR-015
├── obsidian_exec.md                 # +1 paragraph noting write_note as the typed surface for create/overwrite (per SC-013)
├── read_note.md                     # FROZEN
└── help.md                          # FROZEN

CHANGELOG.md                          # +1 entry under "Unreleased" or 0.2.4 (release versioning is a /speckit-tasks decision)
package.json                          # description string updated to mention write_note alongside read_note
README.md                             # tools-list section updated (if present)
CLAUDE.md                             # plan-pointer updated by Phase 1 step 3 to reference this plan
```

**Structure Decision**: Single-project layout per the existing project shape. `src/tools/write_note/` is the entire functional surface for this feature; everything else is one-line wiring (server registration, docs index, package description) or out-of-tree documentation (CHANGELOG, README). No new directories at any other layer. Per Constitution Principle I, the new module is single-purpose (typed write tool); per Principle II, tests are co-located with sources.

## Complexity Tracking

> **No deviations from constitution.** All five principles evaluate as `Y` for this feature. No `N` entries; no Complexity Tracking entries needed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | (n/a)      | (n/a)                               |

## Phase 0: Research Decisions Summary

Full detail in [research.md](./research.md). Brief index of decisions ratified there:

- **R1 — Logger surface (FR-009 reconciliation)**: the spec's FR-009 mandated handler-emitted `logger.callStart` / `logger.callEndSuccess` / `logger.callEndFailure` events "in parity with `read_note`". Live verification: `read_note`'s actual handler at [src/tools/read_note/handler.ts](../../src/tools/read_note/handler.ts) does NOT emit those events; the `Logger` interface at [src/logger.ts:43-48](../../src/logger.ts#L43-L48) does NOT define those methods. Per "spec follows the code that exists, not the code that was sketched" (CLAUDE.md / 006-read-note background), `write_note` mirrors the actual `read_note` shape: thin `invokeCli` wrapper, no per-call logger events fire from the tool layer. The cli-adapter's `_dispatch.ts` already emits `dispatchTimeout` / `dispatchCap` / `dispatchKill` events using the shared logger; that observability is preserved. Spec FR-009 is amended via this research note.
- **R2 — Argv flag form vs key=value (FR-007 / FR-019 case (i)–(iii))**: live `obsidian help create` confirms `overwrite`, `open`, `newtab` are FLAG form (no `=true` value), while `name=<name>` / `path=<path>` / `content=<text>` / `template=<name>` are key=value. Handler emits explicit `true` booleans as flags in `flags: []`, never as `parameters`.
- **R3 — Field rename: user-facing `file` → CLI argv `name=`**: live `obsidian help create` confirms the `create` subcommand uses `name=<name>` for the wikilink-form locator, while `read` uses `file=<name>`. The user-facing schema field stays `file` for parity with `read_note`; the handler maps `parsed.file → name=<value>` at argv assembly.
- **R4 — Output `{ created, path }` derivation from CLI response**: based on the live `obsidian create` no-args probe (which returned `\n\nCreated: Untitled.md`), the CLI's success path reports a `Created: <path>` line on stdout. Plan assumes this signal for `created: true`; the parsing logic locks against an ASCII-prefix substring match. Plan-stage research (T0 implementation step against a scratch vault subdir) verifies the overwrite-success wording (likely `Updated: <path>` or similar) for `created: false`. If the CLI's overwrite signal is indistinguishable from create-fresh, R4 amends pre-merge per SC-011.
- **R5 — Unknown-vault re-classification (Edge Cases)**: live probe confirms `obsidian vault=NoSuchVault create path=test.md content=x` returns `\n\nVault not found.` on stdout (exit code presumed 0 — needs T0 verification). Wording is structured enough for adapter-layer response-inspection. Per the Edge Cases stance, response-inspection logic is added to the cli-adapter (not to `write_note`) so all typed tools benefit. Implementation includes adapter-layer test for the response-classification.
- **R6 — Schema active-mode `superRefine` packaging**: three clauses (overwrite-required, template-forbidden, open-forbidden) bundled into a single chained `.superRefine(...)` callback at the `write_note` schema level. Each violation surfaces as its own `details.issues[]` entry per FR-002.
- **R7 — Test seams (FR-016)**: handler tests inject `deps.spawnFn` per the cli-adapter's existing test-seam convention. Schema tests use `safeParse` directly (no adapter involvement). Registration tests assert the descriptor shape and propagate-via-handler behaviours.
- **R8 — Co-located test path resolution for the docs-existence assertion (FR-016 case e)**: import.meta.url-based resolution per the help-tool path-resolution precedent. Avoids `process.cwd()` brittleness across vitest invocations.
- **R9 — Coverage threshold preservation (FR-017 / SC-008)**: the new module is small (~200 LOC) with 32 co-located test cases. The aggregate statements floor (89.6%) is preserved or improved.
- **R10 — Don't amend predecessor specs**: the spec's FR-019 amendment paragraph is recorded in research.md only; spec.md / contracts/ are not amended. R1's resolution (logger surface deviation) is captured in research.md and applied to the implementation; spec.md's FR-009 wording is left as-is for historical traceability (matching the [010-flatten-target-mode](../010-flatten-target-mode/spec.md) R10 precedent).

## Phase 1: Design Artifacts

Generated in this command run:

- **[data-model.md](./data-model.md)** — input/output schema diagrams, the three new active-mode `superRefine` clauses with their issue shapes, the user-field → CLI-argv mapping table, the response-parsing decision tree.
- **[contracts/write-note-input.contract.md](./contracts/write-note-input.contract.md)** — public input contract: zod schema, emitted JSON Schema shape, the seven top-level fields, the post-010 strict-mode + active-mode constraints, the version-stability guarantee (none — pre-1.0 internal API).
- **[contracts/write-note-handler.contract.md](./contracts/write-note-handler.contract.md)** — handler invariants: deps shape, the `invokeCli` call shape, the argv-mapping rules, the flag-emission rules, the success-response parsing, the failure propagation chain.
- **[quickstart.md](./quickstart.md)** — 13 verification scenarios (S-1..S-13) mapped 1:1 to SC-001..SC-013, with explicit run instructions for each. S-11 / S-12 are the manual end-to-end steps against Claude Desktop / MCP Inspector / Cowork; S-13 is the deliberate-revert sanity check (parity with the [010-flatten-target-mode](../010-flatten-target-mode/spec.md) S-13 pattern).
- **CLAUDE.md plan-pointer update** — the `<!-- SPECKIT START --> ... <!-- SPECKIT END -->` block (or its equivalent) is updated to point at this plan file.

## Constitution Re-Check (Post-Design)

| Principle | Compliance | Notes |
|---|---|---|
| I. Modular Code Organization | ✅ PASS | Phase 1 confirmed the per-surface layout; no cross-module imports added beyond the verified set. |
| II. Public Surface Test Coverage | ✅ PASS | Test-set inventory frozen at 32 cases (15 schema / 12 handler / 5 registration). Drift detector auto-covers. |
| III. Boundary Input Validation with Zod | ✅ PASS | Output schema also zod-derived per FR-005. The `superRefine` clauses are packaged as a single chained callback per R6. |
| IV. Explicit Upstream Error Propagation | ✅ PASS | Zero new codes confirmed. R5 adds adapter-layer response-inspection; that's a primitive enhancement that benefits all typed tools, not a write_note-specific layer. |
| V. Attribution & Layered Composition | ✅ PASS | All new files marked Original. No upstream code lifted. |

**No Complexity Tracking entries.** No deviations.

## Reporting

- **Branch**: `011-write-note`
- **Plan path**: `specs/011-write-note/plan.md`
- **Generated artifacts**:
  - `specs/011-write-note/research.md` — design decisions R1–R10 + FR-019 case-capture deferral list
  - `specs/011-write-note/data-model.md` — schema shapes, superRefine clauses, argv-mapping table
  - `specs/011-write-note/contracts/write-note-input.contract.md` — public input contract
  - `specs/011-write-note/contracts/write-note-handler.contract.md` — handler invariants
  - `specs/011-write-note/quickstart.md` — 13 verification scenarios
  - `CLAUDE.md` — plan reference updated
- **Next command**: `/speckit-tasks` — produces `tasks.md` with dependency-ordered, atomic tasks (T001..TNNN) per the established convention.
