<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
[specs/004-target-mode-schema/plan.md](specs/004-target-mode-schema/plan.md)

Active feature: **004-target-mode-schema** (BI-029 — Implement Target
Mode Framework. Introduce a shared zod schema-primitives module at
`src/target-mode/target-mode.ts` that every typed MCP tool handler
imports to enforce ADR-003's intent-declaration contract. Pure
validation; no CLI calls, no MCP tool registration. Per the
2026-05-06 clarifications + plan-stage amendment, the module exports
ten items: five schemas — `targetModeSpecificBaseSchema`,
`targetModeActiveBaseSchema`, `targetModeSpecificSchema`,
`targetModeActiveSchema`, `targetModeSchema` (the discriminated
union); two refinement helper functions —
`applyTargetModeSpecificRefinement`, `applyTargetModeActiveRefinement`;
three inferred types — `TargetModeSpecific`, `TargetModeActive`,
`TargetMode`. Active-mode forbidden-key error messages name the
offending key + `"active mode"` with NO recovery directives — recovery
guidance lives in per-tool docs/tools/*.md (BI-030).). See also:
- [spec.md](specs/004-target-mode-schema/spec.md) — feature spec + 2 clarifications in 1 session + 1 plan-stage amendment
- [research.md](specs/004-target-mode-schema/research.md) — Phase 0 decisions (P1–P5: module path, .superRefine for both rules, export naming, expandedten-export surface for Pattern (b) compatibility, expectTypeOf for type tests)
- [data-model.md](specs/004-target-mode-schema/data-model.md) — ten module exports, refinement signatures, inferred type shapes, test coverage map (32 cases)
- [contracts/target-mode.contract.md](specs/004-target-mode-schema/contracts/target-mode.contract.md) — canonical interface contract (export inventory, behavioural rules, composition patterns)
- [quickstart.md](specs/004-target-mode-schema/quickstart.md) — eight unit-test verification scenarios + deferred consumer-side smoke

Predecessor features:
- **003-cli-adapter**: [spec.md](specs/003-cli-adapter/spec.md), [plan.md](specs/003-cli-adapter/plan.md), [contracts/](specs/003-cli-adapter/contracts/) — the centralised CLI adapter at `src/cli-adapter/cli-adapter.ts`. Consumes the `target_mode` field that this feature's primitive validates; the adapter strips locator keys when `target_mode === "active"`.
- **002-detect-cli-errors**: [spec.md](specs/002-detect-cli-errors/spec.md), [plan.md](specs/002-detect-cli-errors/plan.md) — added `CLI_REPORTED_ERROR` (the in-band `Error:` stdout-prefix detection that 003's adapter reuses).
- **001-add-cli-bridge**: [spec.md](specs/001-add-cli-bridge/spec.md), [plan.md](specs/001-add-cli-bridge/plan.md), [contracts/](specs/001-add-cli-bridge/contracts/) — the original `obsidian_exec` bridge tool. Its `errors.contract.md` is the canonical errors contract.

References:
- [.specify/memory/constitution.md](.specify/memory/constitution.md) — Principles I–V (modular layout, co-located tests, zod validation, structured errors, attribution headers) bind every implementation decision. Principle III (zod is the single source of truth, types via `z.infer`) is the constitutional anchor for this feature.
- [.decisions/ADR-003 - Enforce Target Mode in Typed Tools.md](.decisions/ADR-003%20-%20Enforce%20Target%20Mode%20in%20Typed%20Tools.md) — the design decision this feature implements. Two-branch discriminated union: `"specific"` (vault required + exactly one of file/path) and `"active"` (vault/file/path forbidden).
- [.architecture/Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md) — names BI-029 as this primitive's implementation.
<!-- SPECKIT END -->

## Architecture & Decision References

Two reference folders document the project's design rationale. Consult them **before** proposing or making design decisions, and cite the relevant ADR/architecture section when justifying choices:

- [.architecture/](.architecture/) — high-level architecture notes describing the system's structure, module boundaries, and design principles. Start with [Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md).
- [.decisions/](.decisions/) — Architecture Decision Records (ADRs). [Decision Log.md](.decisions/Decision%20Log.md) is the index; each ADR-NNN file contains the full decision text.

When a design choice conflicts with an existing ADR, surface the conflict to the user rather than silently overriding it — superseding an ADR is a deliberate act that should produce a new ADR, not an undocumented drift.
