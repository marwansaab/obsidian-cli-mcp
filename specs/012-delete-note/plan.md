# Implementation Plan: Delete Note Typed MCP Tool

**Branch**: `012-delete-note` | **Date**: 2026-05-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [/specs/012-delete-note/spec.md](./spec.md)

## Summary

Add `delete_note`, the third typed-tool wrap on top of the foundation completed by features 003–010 and the second since [011-write-note](../011-write-note/spec.md) closed the create/overwrite leg of the typed-write surface. Wraps the Obsidian CLI's `delete` subcommand (verified live: `obsidian help delete` shows argv `file=<name>`, `path=<path>`, plus the `permanent` flag). Replaces `obsidian_exec` for destructive single-file removal; `obsidian_exec` remains the freeform escape hatch for subcommands not yet wrapped (the CLI's `newtab` flag in the create subcommand, future subcommands).

**Technical approach**:
- **Schema**: `applyTargetModeRefinement(targetModeBaseSchema.extend({ permanent: z.boolean().optional().default(false) }))`. NO tool-specific active-mode `superRefine` clauses (departure from `write_note` per [research.md R6](./research.md) — `permanent` has well-defined semantics in both modes; user input [P1] AC #9 explicitly permits active+permanent).
- **Handler**: thin `invokeCli` wrapper at `src/tools/delete_note/handler.ts`. Maps user-facing fields `file` / `path` DIRECTLY to CLI argv keys `file=<value>` / `path=<value>` (no rename, departure from `write_note`'s PSR-5 because `delete` and `read` use the same locator key convention; only `create` uses the divergent `name=`). Emits `permanent` as `flags: ["permanent"]` when `parsed.permanent === true` (live CLI uses flag form per R2). Returns `{ deleted: true, path: string, toTrash: boolean }` where `toTrash` is derived structurally as `!parsed.permanent` (NOT parsed from CLI response — the typed surface owns the safety-default contract per R4).
- **Registration**: via the existing `registerTool` factory at [src/tools/_register.ts](../../src/tools/_register.ts). The factory auto-applies `stripSchemaDescriptions`, wraps `ZodError → VALIDATION_ERROR`, propagates `UpstreamError → asToolError`, and JSON-serialises typed output objects into the MCP `content[0].text` envelope (matching `read_note` / `write_note`'s pattern exactly).
- **Output schema**: `z.object({ deleted: z.literal(true), path: z.string(), toTrash: z.boolean() }).strict()` — zod is the source of truth for output shape too (FR-005). The `deleted` literal-true mirrors `read_note`'s no-discriminator response (failures throw `UpstreamError`, never produce a `deleted: false` shape).
- **Plan-stage characterisation (FR-019)**: argv shape, subcommand name, and unknown-vault response wording verified live via `obsidian help` and a non-destructive unknown-vault probe ([research.md Live CLI Findings](./research.md#live-cli-findings)). Two of the nine FR-019 cases are verified during plan: case (v) unknown vault (response: `Vault not found.`, byte-identical to create); case (ix) subcommand discovery + argv shape. The remaining seven cases (i)–(iv), (vi), (vii), (viii) require destructive probes against a user-authorised scratch vault subdirectory and are deferred to T0 of `/speckit-implement` — same pattern as 011-write-note. Two cases gate ship: (vii) path-traversal (SC-012) and (viii) trash-volume-full silent fall-back (SC-013).

## Technical Context

**Language/Version**: TypeScript (strict mode, `tsc --noEmit` clean) — pinned in [tsconfig.json](../../tsconfig.json), runtime Node.js >= 22.11 per `engines.node` in [package.json](../../package.json).
**Primary Dependencies**: `@modelcontextprotocol/sdk` ^1.0.4 (MCP transport), `zod` (validation, single source of truth per Constitution III), `zod-to-json-schema` (consumed via the existing `toMcpInputSchema` helper at [src/tools/_shared.ts](../../src/tools/_shared.ts)).
**Storage**: N/A — the tool is stateless. The CLI mutates the vault on disk (or moves a file to OS trash); `delete_note` is the wrapper.
**Testing**: vitest with @vitest/coverage-v8. Co-located `*.test.ts` per module. The aggregate statements coverage threshold floor is **89.6%** ([vitest.config.ts:20](../../vitest.config.ts#L20)). Tests inject the cli-adapter's stub `spawnFn` via `deps.spawnFn` per the existing test-seam convention; no real `obsidian` binary executions in CI. The destructive nature of delete makes safe T0 fixturing more important than for write — the user authorises a scratch vault subdirectory at the start of `/speckit-implement`.
**Target Platform**: cross-platform Node.js MCP server (Windows / macOS / Linux). The host shells out to the Obsidian CLI binary via `child_process.spawn`. **Platform-specific delete semantics matter**: Windows recycle bin has a per-volume size cap (relevant to SC-013 trash-volume-full gate); Windows reserved names like `CON` / `PRN` / `AUX` may produce platform-specific delete behaviour (captured during T0). Both behaviours are documented in `docs/tools/delete_note.md` per FR-014.
**Project Type**: MCP server with one new typed tool. Per Constitution v1.2.0, the project exposes "an MCP server surface" only; `delete_note` adds one entry to the registered-tool list at [src/server.ts:64](../../src/server.ts#L64).
**Performance Goals**: per-call latency dominated by the underlying CLI invocation (Obsidian's IPC + filesystem move/delete syscall); the MCP-layer wrapper adds ~milliseconds. The shared in-flight queue (per FR-008, inherited from [006-read-note](../006-read-note/spec.md) FR-016) serializes `obsidian_exec` / `read_note` / `write_note` / `delete_note` invocations through one channel — by design, throughput is bounded for safety. No throughput SLOs.
**Constraints**:
- 10 s per-call timeout, 10 MiB output cap (typed-tool defaults applied automatically by `invokeCli` per [src/cli-adapter/cli-adapter.ts:10-11](../../src/cli-adapter/cli-adapter.ts#L10-L11)).
- Single-in-flight CLI queue gates all CLI invocations (no parallel delete_note → delete_note races on the same path; the second caller sees the post-first-call state and surfaces a structured error).
- 008-refactor surface frozen — `dispatchCli`, `invokeCli`, `invokeBoundedCli`, the in-flight registry, the four-priority error classification, the `obsidian_exec` argv-assembly contract, the `assertToolDocsExist` aggregator are all frozen (per CLAUDE.md). The 011-R5 unknown-vault response-inspection clause added to the cli-adapter is also frozen (additive); `delete_note` inherits without modification.
**Scale/Scope**: ~120 LOC of new code split across `schema.ts` / `handler.ts` / `index.ts` (lower than 011's ~150–200 because no content/template/open/superRefine logic), plus three co-located test files of similar size. One new doc at `docs/tools/delete_note.md` (~150 lines including 4 worked examples + irreversibility warning + audit-trail guidance). One line of update each in `src/server.ts` (registration), `docs/tools/index.md` (summary), `package.json` (description), `CHANGELOG.md` (release entry).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Evidence |
|---|---|---|
| **I. Modular Code Organization** | ✅ PASS | New tool lives at `src/tools/delete_note/` per the established `{schema, handler, index}.ts` per-surface layout (verified against existing siblings `obsidian_exec`, `help`, `read_note`, `write_note`). Downward-flow chain preserved: `index.ts` → `handler.ts` → `cli-adapter` → `child_process.spawn`. No upward or cyclic imports. The schema module imports from `target-mode/` (peer primitive); the handler imports from `cli-adapter/` (peer); `index.ts` imports from `_register.ts` (sibling helper). |
| **II. Public Surface Test Coverage** | ✅ PASS | `delete_note` is a public MCP tool surface. Co-located tests at `src/tools/delete_note/{schema,handler,index}.test.ts` (13 schema cases / 12 handler cases / 5 registration cases per FR-016 = 30 tests total). Happy-path AND failure-path coverage in every layer. The post-010 consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) automatically covers `delete_note` via its `it.each` registry walk (per FR-016 / SC-010); no test-file modifications required. |
| **III. Boundary Input Validation with Zod** | ✅ PASS | Input schema is `applyTargetModeRefinement(targetModeBaseSchema.extend({ permanent }))` — composed from the project's single-source-of-truth `target_mode` primitive plus one `delete_note`-specific field. **No `.superRefine(...)` chain** (R6 — departure from `write_note`'s three active-mode clauses). Inferred TypeScript type via `z.infer<typeof deleteNoteInputSchema>`. Output type ALSO via zod schema `deleteNoteOutputSchema = z.object({ deleted: z.literal(true), path, toTrash }).strict()` (FR-005) — no hand-rolled types. `registerTool` parses input via `schema.parse` before the handler runs (auto-wrap `ZodError → VALIDATION_ERROR` with `details.issues`). Handler trusts validated input; no defensive checks. |
| **IV. Explicit Upstream Error Propagation** | ✅ PASS | Zero new error codes (per FR-018, user input, Constitution Principle IV). Failures flow through `VALIDATION_ERROR` (zod, including post-010 `unrecognized_keys` strict-mode) and `UpstreamError` codes from the cli-adapter (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`). The 011-R5 unknown-vault response-inspection clause in the cli-adapter is inherited verbatim — no `delete_note`-specific handling needed. `registerTool`'s catch blocks propagate `UpstreamError` via `asToolError` and re-throw any other exception (matches `read_note` / `write_note` precedent). No `catch + return null/empty/default` patterns. |
| **V. Attribution & Layered Composition Transparency** | ✅ PASS | Every new source file (`src/tools/delete_note/{schema,handler,index}.ts` + three `*.test.ts`) carries the `// Original — no upstream. <one-line description>.` header per the established convention. The Markdown doc at `docs/tools/delete_note.md` is exempt per [005-help-tool](../005-help-tool/spec.md) FR-019. README's Attributions section is unchanged (no new lifted code). |

**Coverage gate**: aggregate statements floor is 89.6% ([vitest.config.ts:20](../../vitest.config.ts#L20)); the new tests must not drop the aggregate below this. The new module is small (~120 LOC); the 30 co-located test cases (13+12+5) provide near-100% coverage of the new module, so the aggregate either stays flat or ratchets up.

**Constitution Compliance checklist** (for the eventual PR): all five principles expected to evaluate as Y. No deviations needed; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/012-delete-note/
├── plan.md              # This file
├── research.md          # Phase 0 output — design decisions R1–R10 + plan-stage live-CLI findings
├── data-model.md        # Phase 1 output — input/output schema shapes, argv-mapping table, audit invariant
├── quickstart.md        # Phase 1 output — verification scenarios (S-1..S-15 mapped to SC-001..SC-015)
├── contracts/
│   ├── delete-note-input.contract.md    # Public input contract (zod schema + emitted JSON Schema shape)
│   └── delete-note-handler.contract.md  # Handler invariants (argv mapping, response parsing, structural toTrash)
└── tasks.md             # Phase 2 output (created by /speckit-tasks, NOT by this command)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── delete_note/                 # NEW per-surface module (FR-001)
│   │   ├── schema.ts                # deleteNoteInputSchema, deleteNoteOutputSchema, types via z.infer (FR-002, FR-003, FR-005)
│   │   ├── schema.test.ts           # 13 cases per FR-016 (no superRefine clauses → fewer cases than write_note's 15)
│   │   ├── handler.ts               # executeDeleteNote(input, deps) — thin invokeCli wrapper (FR-007); ≤50 LOC per SC-007
│   │   ├── handler.test.ts          # 12 cases per FR-016 (covers happy + each UpstreamError code + audit invariant + boundaries)
│   │   ├── index.ts                 # createDeleteNoteTool factory via registerTool (FR-011, FR-012)
│   │   └── index.test.ts            # 5 registration cases per FR-016 (descriptor name, stripped schema, help mention, doc presence + irreversibility warning)
│   ├── _register.ts                 # FROZEN (verified — no edits needed; registerTool covers delete_note out-of-the-box)
│   ├── _register.test.ts            # FROZEN — drift detector's it.each registry walk auto-covers delete_note (SC-010)
│   ├── _shared.ts                   # FROZEN
│   ├── help/                        # FROZEN
│   ├── obsidian_exec/               # FROZEN (SC-009 — zero substantive diff)
│   ├── read_note/                   # FROZEN (SC-009 — zero substantive diff)
│   └── write_note/                  # FROZEN (SC-009 — zero substantive diff)
├── server.ts                        # +1 line: createDeleteNoteTool({ logger, queue }) added to the tools array
├── server.test.ts                   # registry-consistency test auto-covers delete_note's docs/ presence (no edits)
├── cli-adapter/                     # FROZEN (008-refactor surface + 011-R5 unknown-vault inspection clause)
├── target-mode/                     # FROZEN (post-010 surface)
├── help/                            # FROZEN
├── errors.ts                        # FROZEN (no new codes per FR-018)
├── logger.ts                        # FROZEN (per R1 — no callStart/callEnd events introduced)
└── queue.ts                         # FROZEN

docs/tools/
├── delete_note.md                   # NEW non-stub doc per FR-014 (input schema, output, error roster + irreversibility warning, ≥4 examples, edge-case behaviours, audit-trail guidance)
├── index.md                         # +1 line entry per FR-015
├── obsidian_exec.md                 # +1 paragraph noting delete_note as the typed surface for delete operations (per SC-015)
├── read_note.md                     # FROZEN
├── write_note.md                    # FROZEN
└── help.md                          # FROZEN

CHANGELOG.md                          # +1 entry under "Unreleased" or 0.2.5 (release versioning is a /speckit-tasks decision)
package.json                          # description string updated to mention delete_note alongside write_note / read_note
README.md                             # tools-list section updated (if present)
CLAUDE.md                             # plan-pointer updated by Phase 1 step 3 to reference this plan
```

**Structure Decision**: Single-project layout per the existing project shape. `src/tools/delete_note/` is the entire functional surface for this feature; everything else is one-line wiring (server registration, docs index, package description) or out-of-tree documentation (CHANGELOG, README). No new directories at any other layer. Per Constitution Principle I, the new module is single-purpose (typed delete tool); per Principle II, tests are co-located with sources.

## Complexity Tracking

> **No deviations from constitution.** All five principles evaluate as `Y` for this feature. No `N` entries; no Complexity Tracking entries needed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | (n/a)      | (n/a)                               |

## Phase 0: Research Decisions Summary

Full detail in [research.md](./research.md). Brief index of decisions ratified there:

- **R1 — Logger surface (FR-009 reconciliation)**: thin handler, no per-call `logger.callStart`/`callEndSuccess`/`callEndFailure` events at the tool layer. Mirrors actual `read_note` / `write_note` implementations (per [011-write-note PSR-1](../011-write-note/research.md)). Spec FR-009's wording is left in place per R10; this PSR is the operative contract.
- **R2 — Argv flag form (`permanent`)**: live `obsidian help delete` confirms `permanent` is bare-word flag form (no `=true` value). Matches the 011-R2 finding for `overwrite`/`open`/`newtab` on the create subcommand.
- **R3 — Locator argv keys MATCH user-facing schema fields (`file=`, `path=`)**: live `obsidian help delete` confirms the `delete` subcommand uses `file=<name>` and `path=<path>` — same as the schema field names. **No rename needed**, departure from 011-write-note's PSR-5 (which was create-specific because the create subcommand uses `name=` for the wikilink locator). The handler's argv assembly is structurally simpler than write_note's.
- **R4 — Output `{ deleted: true, path, toTrash }` derivation**: `deleted` is `z.literal(true)` (failures throw, never produce `deleted: false`); `path` is parsed verbatim from CLI stdout (regex hypothesis `/^(Trashed|Deleted): (.+?)\s*$/m`, locked at T0); `toTrash` is derived **structurally** from `!parsed.permanent`, NOT parsed from CLI response. The typed surface owns the safety-default contract.
- **R5 — Unknown-vault response inspection inherited from 011-write-note**: live verification confirms the `delete` subcommand returns `Vault not found.` on stdout (exit 0) for unknown vault display names — byte-identical to `create`. The cli-adapter's existing `UNKNOWN_VAULT_PREFIX` re-classifier handles this verbatim; no `delete_note`-specific handler logic needed. FR-019 case (v) verified during plan stage.
- **R6 — No tool-specific active-mode `superRefine` clauses**: departure from 011-write-note's three clauses. `permanent` has well-defined semantics in both modes (irreversibility applies regardless of locator resolution); user input [P1] AC #9 explicitly permits active+permanent. The schema reduces to `applyTargetModeRefinement(targetModeBaseSchema.extend({ permanent: z.boolean().optional().default(false) }))` with no `.superRefine(...)` chain.
- **R7 — Test seams**: `deps.spawnFn` injection per the existing pattern. Mirrors 011-R7.
- **R8 — `import.meta.url` path resolution in tests**: for the docs-existence assertion. Mirrors 011-R8.
- **R9 — Coverage threshold preservation**: small well-tested module preserves the 89.6% aggregate floor. Mirrors 011-R9.
- **R10 — Don't amend predecessor specs**: research.md is the source of record for plan-stage discoveries; spec.md is NOT amended retroactively. Mirrors the 010 / 011 precedent.

**Plan-stage status**: all 10 design decisions ratified. Two FR-019 cases verified live during plan ((v) unknown vault, (ix) subcommand discovery + argv shape); seven deferred to T0 (with two of those gating ship per SC-012 / SC-013).

## Phase 1: Design Artifacts

Generated in this command run:

- **[data-model.md](./data-model.md)** — input/output schema diagrams, the absence of active-mode `superRefine` clauses (R6 departure), the user-field → CLI-argv mapping table (with the no-rename note), the response-parsing decision tree, the audit-trail invariant `toTrash === !parsed.permanent`, the per-tool invariants, the module layout LOC budget.
- **[contracts/delete-note-input.contract.md](./contracts/delete-note-input.contract.md)** — public input contract: zod schema, emitted JSON Schema shape, the five top-level fields, the post-010 strict-mode constraints, the version-stability guarantee (none — pre-1.0 internal API).
- **[contracts/delete-note-handler.contract.md](./contracts/delete-note-handler.contract.md)** — handler invariants: deps shape, the `invokeCli` call shape, the argv-mapping rules (no-rename), the structural `toTrash` derivation, the success-response parsing, the audit-trail invariant test scaffold, the failure propagation chain.
- **[quickstart.md](./quickstart.md)** — 15 verification scenarios (S-1..S-15) mapped 1:1 to SC-001..SC-015, with explicit run instructions for each. S-11 / S-12 are the manual end-to-end steps against Claude Desktop / MCP Inspector / Cowork; S-13 is the deliberate-revert sanity check (parity with the [010-flatten-target-mode](../010-flatten-target-mode/spec.md) S-13 pattern); S-14 is the audit-trail invariant verification; S-15 is the documentation cross-reference check.
- **CLAUDE.md plan-pointer update** — the plan reference is updated to point at this plan file.

## Constitution Re-Check (Post-Design)

| Principle | Compliance | Notes |
|---|---|---|
| I. Modular Code Organization | ✅ PASS | Phase 1 confirmed the per-surface layout; no cross-module imports added beyond the verified set. |
| II. Public Surface Test Coverage | ✅ PASS | Test-set inventory frozen at 30 cases (13 schema / 12 handler / 5 registration). Drift detector auto-covers. |
| III. Boundary Input Validation with Zod | ✅ PASS | Output schema also zod-derived per FR-005 (`z.literal(true)` for `deleted`, structural `toTrash`). No `superRefine` chain (R6 departure). |
| IV. Explicit Upstream Error Propagation | ✅ PASS | Zero new codes confirmed. R5 inherits the 011-R5 cli-adapter response-inspection clause without modification. |
| V. Attribution & Layered Composition | ✅ PASS | All new files marked Original. No upstream code lifted. |

**No Complexity Tracking entries.** No deviations.

## Reporting

- **Branch**: `012-delete-note`
- **Plan path**: `specs/012-delete-note/plan.md`
- **Generated artifacts**:
  - `specs/012-delete-note/research.md` — design decisions R1–R10 + plan-stage live-CLI findings (cases (v), (ix) verified live; seven cases deferred to T0)
  - `specs/012-delete-note/data-model.md` — schema shapes (no `superRefine`), argv-mapping table (no rename), audit invariant
  - `specs/012-delete-note/contracts/delete-note-input.contract.md` — public input contract
  - `specs/012-delete-note/contracts/delete-note-handler.contract.md` — handler invariants
  - `specs/012-delete-note/quickstart.md` — 15 verification scenarios
  - `CLAUDE.md` — plan reference updated
- **Next command**: `/speckit-tasks` — produces `tasks.md` with dependency-ordered, atomic tasks (T001..TNNN) per the established convention.
