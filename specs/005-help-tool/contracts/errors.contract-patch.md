# Errors Contract Patch — feature 005-help-tool

**Target**: [specs/001-add-cli-bridge/contracts/errors.contract.md](../../001-add-cli-bridge/contracts/errors.contract.md)
**Source**: [../spec.md](../spec.md) §FR-011, §Clarification Q4
**Plan**: [../plan.md](../plan.md) §Phase 1 §"Source Code (repository root) — affected files"
**Date**: 2026-05-06

This document captures the diff to apply to the canonical errors contract for the two new `UpstreamError.code` rows introduced by this feature. The pattern mirrors the in-place edit precedent established by [feature 002](../../002-detect-cli-errors/) (added `CLI_REPORTED_ERROR`) and [feature 003](../../003-cli-adapter/) (added `ERR_NO_ACTIVE_FILE`). The diff is applied as part of this BI's implementation; this document is the planning-time record of WHAT changes and WHY, not a separate runtime artifact.

## Summary of changes

Two new sections are added to `errors.contract.md`, immediately after the `ERR_NO_ACTIVE_FILE` section (line 132 in the v0.1.3 baseline) and before the `## Serialization to MCP` heading. The test-coverage list at the bottom of the file gains four new bullets covering the new test files this BI introduces.

## New section 1 — `HELP_TOOL_NOT_FOUND`

Insert this section after `ERR_NO_ACTIVE_FILE`'s priority-discrimination blockquote (line 132 in the v0.1.3 baseline):

```markdown
### `HELP_TOOL_NOT_FOUND`

The `help` MCP tool received a `tool_name` that does not resolve to a `<tool_name>.md` file inside the bundled `docs/tools/` directory — either because the file genuinely does not exist OR because the resolved path escapes `docs/tools/` (a path-traversal probe). Per FR-010 and the path-traversal defense (P4 in [005's research.md](../../005-help-tool/research.md#plan-stage-decisions-resolved-during-this-phase-0)), both cases surface as the same code so a probe cannot distinguish "wrong name" from "tried to escape." Spec source: 005 FR-008 (third bullet), 005 Clarification Q4. Triggered exclusively by [src/tools/help/handler.ts](../../../src/tools/help/handler.ts).

| Field | Value |
|-------|-------|
| `code` | `"HELP_TOOL_NOT_FOUND"` |
| `cause` | `NodeJS.ErrnoException` (the underlying `ENOENT` from `readFile`) — OR `null` when the failure is path-traversal-defense (no I/O attempted) or NUL-byte rejection. |
| `Error.message` | `"No documentation file for the requested tool. Available tools: <comma-separated list>."` — does NOT echo `requestedName` (FR-010 anti-injection). The available-tools list is constructed by `readdir(docsDir)` filtered to `.md` files, excluding `index.md`, sorted alphabetically. |
| `details.requestedName` | `string` — the original `tool_name` value the agent supplied. Preserved for operator-side debugging (operators read structured logs; the agent-facing message is sanitized). |
| `details.availableTools` | `string[]` — the `.md` filenames in `docs/tools/`, with the `.md` extension stripped, excluding `index.md`, sorted alphabetically. The same list that appears (comma-joined) in `Error.message`. |
```

## New section 2 — `HELP_DOCS_MISSING`

Insert this section immediately after `HELP_TOOL_NOT_FOUND`:

```markdown
### `HELP_DOCS_MISSING`

The `help` MCP tool resolved its docs directory path but the directory itself is missing, unreadable, or is not a directory. Detected by an `access()` (or equivalent stat) call at the start of the handler, BEFORE per-tool resolution — so this branch fires regardless of whether `tool_name` was provided in the input. Indicates a packaging or install integrity failure: the `docs/tools/` directory should ship with the npm release (per 005 FR-014 — `package.json` `files` array includes `"docs/tools/**/*.md"`). Recovery is operator-side (publish/install fix), NOT agent-side. Spec source: 005 FR-008 (fourth bullet), 005 Clarification Q4. Triggered exclusively by [src/tools/help/handler.ts](../../../src/tools/help/handler.ts).

| Field | Value |
|-------|-------|
| `code` | `"HELP_DOCS_MISSING"` |
| `cause` | `NodeJS.ErrnoException` — the underlying I/O error from `access()` / `stat()`. |
| `Error.message` | `"docs/tools/ directory missing or unreadable at <resolvedDocsDir>"` — the resolved absolute path is included in the message so operators can see immediately what location the help tool was looking at. |
| `details.resolvedDocsDir` | `string` — the absolute path the help tool resolved (from `import.meta.url`). |
| `details.ioCode` | `string \| undefined` — the underlying I/O error code where available (`"ENOENT"`, `"ENOTDIR"`, `"EACCES"`, …). Undefined if the cause does not carry a `code` property. |
```

## Updated test-coverage requirements

Append four bullets to the existing `## Test coverage requirements (Principle II)` list at the bottom of the file:

```markdown
- [src/help/strip-schema.test.ts](../../../src/help/strip-schema.test.ts) — six cases per [005's strip-schema.contract.md](../../005-help-tool/contracts/strip-schema.contract.md). Does NOT exercise an `UpstreamError` code (the strip utility raises no errors), but is included for completeness — the strip utility is consumed by every tool registration site, including the ones that emit the codes above.
- [src/tools/help/schema.test.ts](../../../src/tools/help/schema.test.ts) — the `VALIDATION_ERROR` path for the help tool (empty-string `tool_name`, non-string `tool_name`, unknown keys via `.strict()`).
- [src/tools/help/handler.test.ts](../../../src/tools/help/handler.test.ts) — both new help-tool codes are exercised: `HELP_TOOL_NOT_FOUND` (unknown tool, path-traversal probe, NUL-byte probe) and `HELP_DOCS_MISSING` (missing directory). Plus the two success branches (named tool, omitted name).
- [src/tools/help/tool.test.ts](../../../src/tools/help/tool.test.ts) — `HELP_TOOL_NOT_FOUND` round-trip through the SDK error-response shape.
- [src/server.test.ts](../../../src/server.test.ts) — the new `describe("registry consistency", ...)` block per [005's plan §P6](../../005-help-tool/plan.md#plan-stage-decisions-resolved-during-this-phase-0) asserts (a) every registered tool has a corresponding `docs/tools/<tool_name>.md` file, AND (b) every registered tool's `inputSchema.properties` tree is description-free at every depth (the bypass-detection assertion). The block does not exercise a `code` directly, but it is the ratchet that prevents a future regression where `HELP_TOOL_NOT_FOUND` would fire at runtime for a registered-but-undoc'd tool.
```

## Application

When this BI's implementation tasks land, the diff above is applied to the canonical errors contract in a single edit. The tracker is the [tasks.md](../tasks.md) entry that maps to FR-011 + this patch document. Reviewers verify:

- The two new `###` sections appear in the canonical contract in the documented order (after `ERR_NO_ACTIVE_FILE`, before `## Serialization to MCP`).
- The `## Serialization to MCP` section's prose at line 160 (the v0.1.3 baseline) is updated to mention that `HELP_TOOL_NOT_FOUND` and `HELP_DOCS_MISSING` follow the same `cause`-omission rule as the other codes — `HELP_TOOL_NOT_FOUND.details.{requestedName, availableTools}` and `HELP_DOCS_MISSING.details.{resolvedDocsDir, ioCode}` are sufficient for MCP clients to reconstruct the failure context without `cause`.
- The README error-codes table gains rows for both new codes (FR-011).
