<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
[specs/009-fix-inputschema-publication/plan.md](specs/009-fix-inputschema-publication/plan.md)

Active feature: **009-fix-inputschema-publication** — a `0.2.0 → 0.2.1`
patch fix to a release-blocking bug. `read_note` is uncallable from
**strict-naive MCP clients** (e.g. Cowork) whose hand-rolled `Tool`
schema validator strips unknown top-level keys (`oneOf`,
`additionalProperties`) and surfaces the published `inputSchema` as
`{ "$schema": "...", "type": "object", "properties": {} }`. The client
then strips every outgoing argument against that hollow `properties: {}`,
the runtime zod receives `{}`, and `read_note` returns
`VALIDATION_ERROR`. The control case (`obsidian_exec`, flat `z.object`)
works end-to-end through the same clients.

**Important — corrects the spec's working hypothesis.** The spec's
Background section attributed the bug to a `_shared.ts:102` predicate
gap (`raw.type === "object"` early-returning on a hollow output).
[research.md](specs/009-fix-inputschema-publication/research.md) R1
captures the empirical evidence that this hypothesis is **false** at
every dependency version reachable from `package.json`'s `^3.23.5`
semver: `zodToJsonSchema` emits `{ anyOf: [...] }` for
`ZodEffects<ZodDiscriminatedUnion>` at both 3.23.5 and 3.25.2,
`toMcpInputSchema`'s wrap branch fires correctly, and the SDK
preserves the envelope through wire serialization. The strip happens
**inside the strict-naive client's own `Tool` validator**. The fix is
therefore a shape WIDENING in the wrap branch, not a predicate
refinement.

**Fix surface** — modify
[src/tools/_shared.ts](src/tools/_shared.ts)'s `toMcpInputSchema` wrap
branch to additionally emit a top-level `properties` map (union of
every branch's top-level property names, leaf-`{}` widened, with the
`target_mode` discriminator widened to `{ type: "string" }`) and a
top-level `required` array (intersection of branch `required` arrays).
The existing `oneOf` and `additionalProperties: true` are preserved.
Pattern (a) inputs (`targetModeSchema.and(z.object({...}))`) extend
the algorithm to walk both `allOf` arms (the inner `anyOf` arm AND
the extras arm). Helper-only fix; no `target-mode.ts` edits, no new
modules, no new public signatures, no companion JSON Schema export.

**Drift detector** — new co-located test file at
[src/tools/_register.test.ts](src/tools/_register.test.ts) runs a
parameterised registry walk over the live tools from
`createServer({ registerSignalHandlers: false })`. Per-tool invariant
case-table asserts: `read_note` exposes `target_mode`, `vault`,
`file`, `path` in top-level `properties` with `required: ["target_mode"]`
and `additionalProperties: true`; `obsidian_exec` is byte-stable from
`0.2.0` (6 properties, `required: ["command"]`,
`additionalProperties: false` — strict regression guard); `help`
exposes `tool_name`. A second test group runs the same assertions
through a full `InMemoryTransport` SDK round-trip. A third group
covers synthetic Pattern (a) and Pattern (b) fixtures (FR-003).

**Cross-cutting** — zero changes to `targetModeSchema`'s zod runtime
(FR-004); the 31 existing cases pass without modification. Zero new
error codes (FR-010). Zero new ADRs (SC-008). Zero changes to the
008-refactor surface beyond `_shared.ts` (FR-016): `dispatchCli`,
`invokeCli`, `invokeBoundedCli`, the in-flight registry, the
four-priority error classification, the always-on bounds, and the
`obsidian_exec` argv-assembly contract are all frozen. The fix is
structurally additive to `_shared.ts` — existing wrap-branch keys
(`type`, `oneOf`, `additionalProperties`, `$schema`) survive
unchanged; new keys (`properties`, `required`) are added.

**Compatibility / release** — MCP wire surface unchanged for
strict-rich clients (the SDK-shape consumers — Claude Desktop,
Claude Code via SDK — already work under `0.2.0`'s pure `oneOf`
envelope and continue to work under the widened envelope).
Strict-naive clients (Cowork) gain the property names they need
to preserve through their internal stripping pass. Version bumps
`0.2.0 → 0.2.1` (patch — bugfix only, no public-signature changes,
research R10).

See also:
- [spec.md](specs/009-fix-inputschema-publication/spec.md) — feature spec + checklist (16/16 quality criteria pass; no clarifications needed)
- [research.md](specs/009-fix-inputschema-publication/research.md) — Phase 0 decisions R1–R13 (R1 corrects the spec's working hypothesis with empirical evidence; R2/R4/R5 the widening algorithm; R3 keep `additionalProperties: true`; R6 helper-only fix surface; R7 parameterised drift detector; R8 SDK round-trip integration layer; R9 Cowork + Claude Desktop manual verification; R10 patch bump; R11 keep `zod-to-json-schema` pin; R12 four new `_shared.test.ts` cases; R13 Phase 1 outputs)
- [data-model.md](specs/009-fix-inputschema-publication/data-model.md) — widened envelope shape, no-op shape, top-level `properties` widening algorithm, Pattern (a) `allOf` handling, per-tool invariant case-table, test-coverage map
- [contracts/envelope-helper.contract.md](specs/009-fix-inputschema-publication/contracts/envelope-helper.contract.md) — widened `toMcpInputSchema` interface contract — five input kinds (A–E) with worked examples; SUPERSEDES feature 007's same-named contract
- [contracts/drift-detector.contract.md](specs/009-fix-inputschema-publication/contracts/drift-detector.contract.md) — parameterised drift-detector contract — three test groups (unit / integration / synthetic Pattern (a)/(b))
- [quickstart.md](specs/009-fix-inputschema-publication/quickstart.md) — thirteen verification scenarios mapped to SC-001..SC-010 (S-1..S-10 in CI; S-11/S-12 manual against Cowork + Claude Desktop; S-13 once-per-release implementer revert check)

Predecessor features:
- **008-refactor**: [spec.md](specs/008-refactor/spec.md), [plan.md](specs/008-refactor/plan.md) — introduced `registerTool` and `dispatchCli`; removed feature 007's `targetModeJsonSchema` companion per research R10 on the assumption that the registry path produced equivalent output. The wire-output assertion that would have caught this regression was not part of 008's contract; THIS feature adds it. The 008-refactor surface is otherwise frozen by FR-016.
- **007-fix-list-tools-schema**: [spec.md](specs/007-fix-list-tools-schema/spec.md), [plan.md](specs/007-fix-list-tools-schema/plan.md) — introduced `toMcpInputSchema` (the helper THIS feature widens); promised but never shipped the `targetModeJsonSchema` companion (T004) and the drift detector (tasks.md:78-81). THIS feature is the missing finisher.
- **006-read-note**: [spec.md](specs/006-read-note/spec.md), [plan.md](specs/006-read-note/plan.md) — the BI-003 typed tool whose published descriptor is the proximate symptom. Its acceptance criteria assert handler behaviour and zod runtime; they do not assert published-`inputSchema` validity. THIS feature closes that gap.
- **005-help-tool**: [spec.md](specs/005-help-tool/spec.md), [plan.md](specs/005-help-tool/plan.md) — registry-consistency block in `src/server.test.ts`. Preserved as defense-in-depth; the new drift detector at `src/tools/_register.test.ts` is additive.
- **004-target-mode-schema**: [spec.md](specs/004-target-mode-schema/spec.md), [plan.md](specs/004-target-mode-schema/plan.md) — the `targetModeSchema` primitive whose `ZodEffects<ZodDiscriminatedUnion>` shape is the canonical input the publication pipeline must handle. UNTOUCHED by this feature (FR-004 / Principle I).
- **003-cli-adapter**, **002-detect-cli-errors**, **001-add-cli-bridge**: foundational; not touched.

References:
- [.specify/memory/constitution.md](.specify/memory/constitution.md) — Principle III (single source of truth — published JSON Schema mechanically derived from zod) is the load-bearing reason `toMcpInputSchema` exists; this feature reaffirms it. Principle II (co-located tests) shipped at `_shared.test.ts` and `_register.test.ts`. Principle I (downward flow) preserved — `target-mode/` does not gain a dependency on `tools/`.
- [.decisions/ADR-006 - Centralized Tool Registration.md](.decisions/) — the registration deepening 008 landed; this feature reaffirms it without supersession.
- [.decisions/ADR-005 - Token-Optimized Tool Definitions.md](.decisions/) — `stripSchemaDescriptions` runs unchanged; the widening happens BEFORE description-stripping in `registerTool`.
- [.decisions/ADR-003 - Enforce Target Mode in Typed Tools.md](.decisions/) — the target-mode primitive's role in typed tools; reaffirmed without supersession.
- [.architecture/Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md) — the architecture this fix preserves.
<!-- SPECKIT END -->

## Architecture & Decision References

Two reference folders document the project's design rationale. Consult them **before** proposing or making design decisions, and cite the relevant ADR/architecture section when justifying choices:

- [.architecture/](.architecture/) — high-level architecture notes describing the system's structure, module boundaries, and design principles. Start with [Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md).
- [.decisions/](.decisions/) — Architecture Decision Records (ADRs). [Decision Log.md](.decisions/Decision%20Log.md) is the index; each ADR-NNN file contains the full decision text.

When a design choice conflicts with an existing ADR, surface the conflict to the user rather than silently overriding it — superseding an ADR is a deliberate act that should produce a new ADR, not an undocumented drift.
