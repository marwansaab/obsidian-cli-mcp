<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
[specs/002-detect-cli-errors/plan.md](specs/002-detect-cli-errors/plan.md)

Active feature: **002-detect-cli-errors** (patch the `obsidian_exec`
bridge to detect the Obsidian CLI's `Error:` stdout-prefix failure
signal and surface affected exit-zero responses as a structured
`UpstreamError` with the new code `CLI_REPORTED_ERROR` — closes the
spec-vs-reality gap on 001-add-cli-bridge AC#6). See also:
- [spec.md](specs/002-detect-cli-errors/spec.md) — feature spec + 6 clarifications across 2 sessions
- [research.md](specs/002-detect-cli-errors/research.md) — Phase 0 empirical observations + decision provenance
- [data-model.md](specs/002-detect-cli-errors/data-model.md) — new code shape, modified CLI_NON_ZERO_EXIT, newly-registered VALIDATION_ERROR + TOOL_NOT_FOUND, Logger.ErrorCode union
- [contracts/](specs/002-detect-cli-errors/contracts/) — errors-contract patch (FR-008/FR-014/FR-015) and tool-description patch (FR-009)
- [quickstart.md](specs/002-detect-cli-errors/quickstart.md) — six end-to-end verification scenarios + smoke-test checklist

Predecessor feature: **001-add-cli-bridge** (the bridge itself). See:
- [spec.md](specs/001-add-cli-bridge/spec.md) — original feature spec + 5 clarifications
- [plan.md](specs/001-add-cli-bridge/plan.md) — original implementation plan
- [contracts/](specs/001-add-cli-bridge/contracts/) — canonical MCP tool, errors, logging, server contracts (002 edits `errors.contract.md` in place per Q5 clarification)
- [.specify/memory/constitution.md](.specify/memory/constitution.md) — Principles I–V (modular layout, co-located tests, zod validation, structured errors, attribution headers) bind every implementation decision
<!-- SPECKIT END -->
