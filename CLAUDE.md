<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
[specs/006-read-note/plan.md](specs/006-read-note/plan.md)

Active feature: **006-read-note** (BI-003 — Add Read Note. The first
typed-tool MCP surface, composed on top of the three foundation
features that landed before it (BI-029 target-mode primitive, BI-028
cli-adapter, BI-030 help tool + schema-strip). Ships a new per-surface
module at `src/tools/read_note/` with `schema.ts` + `handler.ts` +
`tool.ts` and co-located tests. Schema is a re-export of
`targetModeSchema` (P1 — zero tool-specific fields, so the primitive
IS the schema; deviates from spec FR-002's literal Pattern (b) wording
because z.discriminatedUnion rejects ZodEffects branches). Handler
routes exclusively through `invokeCli({command: "read", parameters,
flags: [], target_mode}, deps)` from the cli-adapter — zero direct
`child_process.spawn` use (SC-003). Per Clarifications 2026-05-06 Q1
(FR-016), the handler wraps every CLI call in `deps.queue.run(...)`
sharing the SAME Queue instance with `obsidian_exec` so reads
serialize behind execs (single-channel safety for the stateful
Obsidian IPC). Per Q2 (FR-017), the handler accepts a `Logger` and
emits `callStart`/`callEndSuccess`/`callEndFailure` events around the
adapter call, parity with obsidian_exec's logging. Per Q3, the
schema does NOT add `.min(1)` to `file`/`path` at the read_note
layer — empty-string locators forward to the CLI verbatim. Output is
`{ content: <stdout> }` mapped to the existing text-envelope JSON
shape. Zero new error codes — the entire failure surface
(`VALIDATION_ERROR`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`,
`ERR_NO_ACTIVE_FILE`, `CLI_BINARY_NOT_FOUND`) is already covered by
existing codes. Replaces the existing `docs/tools/read_note.md` stub
(BI-030 FR-012) with a populated body covering input schema, output
shape, error codes, and one example per branch.). See also:
- [spec.md](specs/006-read-note/spec.md) — feature spec + 3 clarifications in 1 session (queue, logger, empty-string)
- [research.md](specs/006-read-note/research.md) — Phase 0 decisions (P1–P8: schema composition tactic / FR-002 deviation, top-level description wording, server registration order, log-event payload extras, doc body structure, test-injection pattern, TODO-marker test placement, BI-029 amendment deferral)
- [data-model.md](specs/006-read-note/data-model.md) — input schema + handler I/O + RegisterDeps + log-event payload shapes + test coverage map (22 new bodies + 2 picked up by existing tests)
- [contracts/read-note.contract.md](specs/006-read-note/contracts/read-note.contract.md) — the read_note tool's interface contract (no errors-contract patch — zero new codes)
- [quickstart.md](specs/006-read-note/quickstart.md) — 12 verification scenarios (schema, handler, registration, server, end-to-end via help tool)

Predecessor features:
- **005-help-tool**: [spec.md](specs/005-help-tool/spec.md), [plan.md](specs/005-help-tool/plan.md), [contracts/](specs/005-help-tool/contracts/) — the schema-stripping utility at `src/help/strip-schema.ts` and the `help` MCP tool serving `docs/tools/*.md`. THIS feature consumes both: read_note's registration applies `stripSchemaDescriptions` to its `inputSchema`, and `docs/tools/read_note.md` is replaced from stub to full body. The registry-consistency block in `src/server.test.ts` automatically picks up read_note.
- **004-target-mode-schema**: [spec.md](specs/004-target-mode-schema/spec.md), [plan.md](specs/004-target-mode-schema/plan.md), [contracts/](specs/004-target-mode-schema/contracts/) — the shared zod target-mode primitive at `src/target-mode/target-mode.ts`. Read_note re-exports `targetModeSchema` as `readNoteInputSchema` (P1). Future typed-tool BIs (BI-004 read_heading, etc.) that add tool-specific fields will need a BI-029 amendment exposing the refinement bodies (P8 — deferred to first consumer).
- **003-cli-adapter**: [spec.md](specs/003-cli-adapter/spec.md), [plan.md](specs/003-cli-adapter/plan.md), [contracts/](specs/003-cli-adapter/contracts/) — the centralised CLI adapter at `src/cli-adapter/cli-adapter.ts` (`invokeCli`). Read_note's handler routes exclusively through it; tests inject the stub via `deps.spawnFn` per the adapter's canonical test seam (P6).
- **002-detect-cli-errors**: [spec.md](specs/002-detect-cli-errors/spec.md), [plan.md](specs/002-detect-cli-errors/plan.md) — `CLI_REPORTED_ERROR`. Propagated by read_note when the CLI exits 0 with `Error:` prefix on stdout.
- **001-add-cli-bridge**: [spec.md](specs/001-add-cli-bridge/spec.md), [plan.md](specs/001-add-cli-bridge/plan.md), [contracts/](specs/001-add-cli-bridge/contracts/) — the original `obsidian_exec` bridge tool. Its registration shape (`{logger, queue}` deps, `RegisteredTool` aggregator pattern) is the structural template read_note mirrors. Its errors contract is the canonical roster — UNCHANGED by THIS BI (zero new codes).

References:
- [.specify/memory/constitution.md](.specify/memory/constitution.md) — Principles I–V (modular layout, co-located tests, zod validation, structured errors, attribution headers) bind every implementation decision. Principle III (single source of truth for schema → type) is the constitutional anchor for the P1 re-export decision.
- [.decisions/ADR-003 - Discriminated-union target_mode schema.md](.decisions/) (and ADR-004, ADR-005) — this feature implements all three ADRs simultaneously: ADR-003 via the target-mode re-export, ADR-004 via exclusive cli-adapter routing, ADR-005 via the schema strip + caveman description + populated doc.
- [.architecture/Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md) — names BI-003 as this feature's implementation; the empirical validator for the BI-028/029/030 foundations.
<!-- SPECKIT END -->

## Architecture & Decision References

Two reference folders document the project's design rationale. Consult them **before** proposing or making design decisions, and cite the relevant ADR/architecture section when justifying choices:

- [.architecture/](.architecture/) — high-level architecture notes describing the system's structure, module boundaries, and design principles. Start with [Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md).
- [.decisions/](.decisions/) — Architecture Decision Records (ADRs). [Decision Log.md](.decisions/Decision%20Log.md) is the index; each ADR-NNN file contains the full decision text.

When a design choice conflicts with an existing ADR, surface the conflict to the user rather than silently overriding it — superseding an ADR is a deliberate act that should produce a new ADR, not an undocumented drift.
