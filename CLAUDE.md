<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
[specs/005-help-tool/plan.md](specs/005-help-tool/plan.md)

Active feature: **005-help-tool** (BI-030 — Implement Progressive
Disclosure Help Tool. Implements ADR-005 by shipping two co-located
components plus a bundled docs directory: (1) a pure schema-stripping
utility at `src/help/strip-schema.ts` exporting `stripSchemaDescriptions`
that every MCP tool registration site uses to remove parameter-level
`description` fields from `inputSchema` at registration time (~70% token
reduction at session start); (2) a new public MCP `help` tool at
`src/tools/help/` (per-surface `schema.ts`/`handler.ts`/`tool.ts` layout)
with input `tool_name: z.string().min(1).optional()` that serves
Markdown documentation from a bundled `docs/tools/` directory at the
package root. Path resolution is anchored to `import.meta.url`, NOT
`process.cwd()`. Two new `UpstreamError` codes: `HELP_TOOL_NOT_FOUND`
(named tool's `.md` file missing OR path-traversal probe) and
`HELP_DOCS_MISSING` (docs directory itself missing/unreadable —
distinct recovery path per Clarification Q4). Stub roster ships 6
files (read_note, write_note, append_note, search_vault, list_notes,
list_vaults — FR-012 ∪ architecture-committed names per Q3); future
typed-tool BIs add their own. `obsidian_exec.md` ships as a full doc,
NOT a stub (Q2). A registry-consistency test in `src/server.test.ts`
asserts every registered tool has a doc file AND every stripped
schema is description-free at every depth (Q5 + bypass-detection).
`obsidian_exec`'s top-level description is condensed to a verb-led
summary that mentions `help("obsidian_exec")` per FR-015.). See also:
- [spec.md](specs/005-help-tool/spec.md) — feature spec + 5 clarifications in 1 session
- [research.md](specs/005-help-tool/research.md) — Phase 0 decisions (P1–P7: strip utility module path + name, recursive walker tactic, help input-schema annotation choice, path-traversal defense layers, top-level description wording, registry-consistency test location, SC-006 measurement mechanism)
- [data-model.md](specs/005-help-tool/data-model.md) — strip utility I/O shape, help-tool input schema + I/O envelope, docs/tools/ directory inventory (9 files), two new UpstreamError code rows, test coverage map (22 cases)
- [contracts/strip-schema.contract.md](specs/005-help-tool/contracts/strip-schema.contract.md), [contracts/help.contract.md](specs/005-help-tool/contracts/help.contract.md), [contracts/errors.contract-patch.md](specs/005-help-tool/contracts/errors.contract-patch.md) — interface contracts + canonical-errors-contract diff
- [quickstart.md](specs/005-help-tool/quickstart.md) — 8 verification scenarios (component + server + integration)

Predecessor features:
- **004-target-mode-schema**: [spec.md](specs/004-target-mode-schema/spec.md), [plan.md](specs/004-target-mode-schema/plan.md), [contracts/](specs/004-target-mode-schema/contracts/) — the shared zod target-mode primitive at `src/target-mode/target-mode.ts`. Future typed-tool BIs (BI-003-25) compose this primitive with their tool-specific fields and serve the resulting docs through the help tool that this BI ships.
- **003-cli-adapter**: [spec.md](specs/003-cli-adapter/spec.md), [plan.md](specs/003-cli-adapter/plan.md), [contracts/](specs/003-cli-adapter/contracts/) — the centralised CLI adapter at `src/cli-adapter/cli-adapter.ts`. Future typed-tool BIs route through the adapter; their docs live in `docs/tools/<tool>.md` and are served by THIS BI's help tool.
- **002-detect-cli-errors**: [spec.md](specs/002-detect-cli-errors/spec.md), [plan.md](specs/002-detect-cli-errors/plan.md) — added `CLI_REPORTED_ERROR`. The error-code patch precedent in 002 + 003 governs how this BI's two new codes (`HELP_TOOL_NOT_FOUND`, `HELP_DOCS_MISSING`) are added to the canonical errors contract.
- **001-add-cli-bridge**: [spec.md](specs/001-add-cli-bridge/spec.md), [plan.md](specs/001-add-cli-bridge/plan.md), [contracts/](specs/001-add-cli-bridge/contracts/) — the original `obsidian_exec` bridge tool. Its `errors.contract.md` is the canonical errors contract this BI patches; its `obsidian_exec.tool.json` and `errors.contract.md` are the source the new `docs/tools/obsidian_exec.md` is transcribed from per Clarification Q2.

References:
- [.specify/memory/constitution.md](.specify/memory/constitution.md) — Principles I–V (modular layout, co-located tests, zod validation, structured errors, attribution headers) bind every implementation decision. Principle IV (`UpstreamError` for every boundary failure) is the constitutional anchor for this feature's two new error codes.
- [.decisions/ADR-005 - Token-Optimized Tool Definitions via Progressive Disclosure.md](.decisions/ADR-005%20-%20Token-Optimized%20Tool%20Definitions%20via%20Progressive%20Disclosure.md) — the design decision this feature implements. Four decisions: automated schema stripping, help tool, embedded docs/tools/ markdown, caveman descriptions.
- [.architecture/Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md) — names BI-030 as this feature's implementation.
<!-- SPECKIT END -->

## Architecture & Decision References

Two reference folders document the project's design rationale. Consult them **before** proposing or making design decisions, and cite the relevant ADR/architecture section when justifying choices:

- [.architecture/](.architecture/) — high-level architecture notes describing the system's structure, module boundaries, and design principles. Start with [Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md).
- [.decisions/](.decisions/) — Architecture Decision Records (ADRs). [Decision Log.md](.decisions/Decision%20Log.md) is the index; each ADR-NNN file contains the full decision text.

When a design choice conflicts with an existing ADR, surface the conflict to the user rather than silently overriding it — superseding an ADR is a deliberate act that should produce a new ADR, not an undocumented drift.
