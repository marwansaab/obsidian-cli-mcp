<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
[specs/007-fix-list-tools-schema/plan.md](specs/007-fix-list-tools-schema/plan.md)

Active feature: **007-fix-list-tools-schema** (Bug fix — the published
0.1.6 package fails MCP `tools/list` validation because
`read_note`'s `inputSchema` lacks `"type": "object"` at the top
level. Root cause: [src/tools/read_note/schema.ts:8-10](src/tools/read_note/schema.ts#L8-L10)
feeds a `z.discriminatedUnion` straight into `zodToJsonSchema`,
which renders top-level `{ "anyOf": [...] }` — valid JSON Schema but
not a valid MCP `Tool.inputSchema`. Per Clarifications 2026-05-06 Q1
(FR-002a), the published descriptor must expose the two-branch shape
via a nested `oneOf`/`anyOf` *inside* a top-level object envelope —
but does NOT need to encode the runtime XOR / forbidden-keys rules
(runtime validator stays the single source of truth). Fix: add a
generic envelope helper `toMcpInputSchema(zodSchema)` at
[src/tools/_shared.ts](src/tools/_shared.ts) that wraps non-object
top-level outputs into `{ type: "object", additionalProperties: true,
oneOf: [...] }`. Apply it at the target-mode primitive
([src/target-mode/target-mode.ts](src/target-mode/target-mode.ts)) as
`targetModeJsonSchema` so every consumer inherits automatically.
Re-point [src/tools/read_note/schema.ts](src/tools/read_note/schema.ts)
to import that companion. Add Invariant (c) to the
`registry consistency` block in
[src/server.test.ts:166](src/server.test.ts#L166) — every registered
tool's `inputSchema.type === "object"`. Bump 0.1.6 → 0.1.7. Zero new
error codes; zero changes to `targetModeSchema`'s zod runtime API
(FR-004); zero wire-level changes (FR-005).). See also:
- [spec.md](specs/007-fix-list-tools-schema/spec.md) — bug spec + 1 clarification (Q1: descriptor exposes branches but not cross-field rules)
- [research.md](specs/007-fix-list-tools-schema/research.md) — Phase 0 decisions (P1 fix-location, P2 oneOf-vs-anyOf, P3 additionalProperties, P4 helper signature, P5 registry-test placement, P6 doc impact, P7 version bump, P8 retroactive `_shared.ts` test coverage)
- [data-model.md](specs/007-fix-list-tools-schema/data-model.md) — four schema shapes (`targetModeJsonSchema`, helper output, `read_note` published, registry assertion) + test-coverage map
- [contracts/envelope-helper.contract.md](specs/007-fix-list-tools-schema/contracts/envelope-helper.contract.md) — the `toMcpInputSchema(zodSchema)` interface contract with input/output guarantees and worked examples
- [quickstart.md](specs/007-fix-list-tools-schema/quickstart.md) — 9 verification scenarios (helper unit tests, primitive companion, registry invariant, runtime regression, full suite, manual e2e, smoke calls, deliberate-malformation drill, version bump)

Predecessor features:
- **006-read-note**: [spec.md](specs/006-read-note/spec.md), [plan.md](specs/006-read-note/plan.md) — the BI-003 typed tool whose published descriptor surfaced the bug. THIS fix preserves every part of its runtime contract (FR-003 / FR-004 / FR-005); only the published JSON Schema changes.
- **005-help-tool**: [spec.md](specs/005-help-tool/spec.md), [plan.md](specs/005-help-tool/plan.md) — registry-consistency block in `src/server.test.ts` that THIS fix extends with a third invariant. The schema-stripping utility at `src/help/strip-schema.ts` runs AFTER the envelope helper in the registration pipeline; their concerns are orthogonal (envelope = `type: "object"` shape; strip = description-free at every depth).
- **004-target-mode-schema**: [spec.md](specs/004-target-mode-schema/spec.md), [plan.md](specs/004-target-mode-schema/plan.md) — the `targetModeSchema` primitive whose `zodToJsonSchema` rendering exposed the regression. THIS fix adds a `targetModeJsonSchema` companion export next to it without changing the zod runtime surface.
- **003-cli-adapter**, **002-detect-cli-errors**, **001-add-cli-bridge**: untouched by this fix — the bug is purely at the published-descriptor boundary.

References:
- [.specify/memory/constitution.md](.specify/memory/constitution.md) — Principles I–V bind every decision. Principle III (single source of truth for schema → type) is the constitutional anchor for the helper-based approach (rules out hand-writing a parallel JSON Schema).
- [.decisions/ADR-003 - Discriminated-union target_mode schema.md](.decisions/) — the discriminated-union design THIS fix patches around at the publication boundary, without altering the runtime decision.
- [.architecture/Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md) — the empirical validation that loadable typed tools are required for the architecture to function.
<!-- SPECKIT END -->

## Architecture & Decision References

Two reference folders document the project's design rationale. Consult them **before** proposing or making design decisions, and cite the relevant ADR/architecture section when justifying choices:

- [.architecture/](.architecture/) — high-level architecture notes describing the system's structure, module boundaries, and design principles. Start with [Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md).
- [.decisions/](.decisions/) — Architecture Decision Records (ADRs). [Decision Log.md](.decisions/Decision%20Log.md) is the index; each ADR-NNN file contains the full decision text.

When a design choice conflicts with an existing ADR, surface the conflict to the user rather than silently overriding it — superseding an ADR is a deliberate act that should produce a new ADR, not an undocumented drift.
