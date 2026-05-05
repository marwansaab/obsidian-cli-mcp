# Errors Contract Patch (002)

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Date**: 2026-05-05

This is **not** a standalone errors contract — the canonical contract lives at [specs/001-add-cli-bridge/contracts/errors.contract.md](../../001-add-cli-bridge/contracts/errors.contract.md) per the Q5 clarification. This document records the exact diff feature 002 applies to that file during `/speckit-implement`.

## Edits to apply

### 1. Patch the section header at line 28

Currently:

```markdown
## Codes registered by `obsidian_exec` (v0.1)
```

Update to:

```markdown
## Codes registered by `obsidian_exec`
```

The version pin is dropped because the registered set now spans v0.1 + v0.1.1 contributions.

### 2. Patch the existing `### CLI_NON_ZERO_EXIT` table (FR-014)

The current table at lines 30-40:

```markdown
| Field | Value |
|-------|-------|
| `code` | `"CLI_NON_ZERO_EXIT"` |
| `cause` | `{ exitCode: number, signal: string \| null }` |
| `details.argv` | `string[]` — the fully reproducible argv vector `[binary, ...spawnArgs]` (binary INCLUDED as argv[0]). Matches the published `argv` shape in `ObsidianExecOutput`. |
| `details.stdout` | `string` — full captured stdout (UTF-8) |
| `details.stderr` | `string` — full captured stderr (UTF-8) |
```

Append two rows:

```markdown
| `details.exitCode` | `number` — mirrors `cause.exitCode`. The non-zero exit code the child reported, OR the sentinel `-1` when the child terminated via signal without producing an exit code (the bridge's `code ?? -1` normalization at [handler.ts:221](../../../src/tools/obsidian_exec/handler.ts#L221)). Mirrored into `details` because MCP serialization drops `cause` per the prose at line 106 — without this row, MCP clients cannot observe the exit code. |
| `details.signal` | `NodeJS.Signals \| null` (a string subtype — concretely `"SIGTERM"`, `"SIGKILL"`, etc.) — mirrors `cause.signal`. The terminating signal name when the child was signal-killed, or `null` when the child exited with a non-zero code rather than being signal-terminated. |
```

> **Implementation gate**: This contract patch is only truthful if the handler is also updated to emit `exitCode` and `signal` inside `details` (currently they live only in `cause`). The handler tweak is a one-line edit at [handler.ts:227](../../../src/tools/obsidian_exec/handler.ts#L227) — add `exitCode` and `signal` to the `details` object literal. Both source-of-truth (handler) and documentation (this contract) MUST land in the same change set.

### 3. Add a new section `### CLI_REPORTED_ERROR` (FR-008)

Insert after the existing `### CLI_OUTPUT_TOO_LARGE` section, before the `## Serialization to MCP` heading:

```markdown
### `CLI_REPORTED_ERROR`

The spawned `obsidian` child exited cleanly with code `0`, but its `stdout` — after trimming leading whitespace — begins with the literal six-character ASCII prefix `Error:` (case-sensitive). The CLI uses this in-band format for application-level failures it does not reflect via the exit code (e.g., unknown subcommand, missing file, eval that throws). Spec source: 002-detect-cli-errors FR-001 through FR-007.

| Field | Value |
|-------|-------|
| `code` | `"CLI_REPORTED_ERROR"` |
| `cause` | `null` — no thrown value exists; the bridge is re-routing an exit-zero response, not catching a throw |
| `details.argv` | `string[]` — the fully reproducible argv vector `[binary, ...spawnArgs]` (binary INCLUDED as `argv[0]`). Matches the `argv` shape in `ObsidianExecOutput`. |
| `details.stdout` | `string` — full captured stdout (UTF-8). Byte-identical to what would have been returned in the success shape. |
| `details.stderr` | `string` — full captured stderr (UTF-8). Byte-identical to what would have been returned in the success shape. |
| `details.exitCode` | `0` (literal `number`) — the truthful exit code the child exited with. Discoverable from the error alone (no need to re-parse other fields) for callers distinguishing this code from `CLI_NON_ZERO_EXIT`. |
| `details.message` | `string` — convenience one-line summary, computed as `stdout.split('\n', 1)[0].trim()` (LF-only split, full whitespace trim — absorbs trailing `\r` from Windows CRLF). Always starts with `Error:`. |
```

### 4. Add a new section `### VALIDATION_ERROR` (FR-015 part 1)

Insert after the new `### CLI_REPORTED_ERROR` section:

```markdown
### `VALIDATION_ERROR`

The MCP tool dispatch received a `CallToolRequest` whose `params.arguments` failed the `obsidian_exec` zod schema. Emitted by [src/tools/obsidian_exec/tool.ts:61](../../../src/tools/obsidian_exec/tool.ts#L61) before any handler-layer code runs. Spec source: Constitution Principle III (boundary input validation).

| Field | Value |
|-------|-------|
| `code` | `"VALIDATION_ERROR"` |
| `cause` | `ZodError` — the thrown `zod.ZodError` instance. |
| `details.issues` | `Array<{ path: (string \| number)[], message: string, code: string }>` — the `ZodError.issues[]` projected to a JSON-serializable subset (path retains zod's mixed string/number indexing for object keys vs. array indices). |
```

### 5. Add a new section `### TOOL_NOT_FOUND` (FR-015 part 2)

Insert after the new `### VALIDATION_ERROR` section:

```markdown
### `TOOL_NOT_FOUND`

The MCP tool dispatch received a `CallToolRequest` whose `params.name` is not the registered `obsidian_exec` tool name. Emitted by [src/tools/obsidian_exec/tool.ts:50](../../../src/tools/obsidian_exec/tool.ts#L50) before any handler-layer code runs.

| Field | Value |
|-------|-------|
| `code` | `"TOOL_NOT_FOUND"` |
| `cause` | `null` — no upstream throw; the dispatch table simply lacked the requested name. |
| `details.requestedName` | `string` — the `req.params.name` value the MCP client supplied. |
| `details.knownTools` | `string[]` — the list of tool names the bridge currently registers. In v0.1/v0.1.1 this is `["obsidian_exec"]`. |
```

### 6. Patch the prose at line 106

Currently reads (excerpt):

> `cause` is omitted from the serialized payload because Node `Error` objects don't serialize cleanly to JSON; the relevant context from `cause` is duplicated into `details` for the four codes above (e.g., `details.exitCode` mirrors `cause.exitCode` for `CLI_NON_ZERO_EXIT`).

Update to:

> `cause` is omitted from the serialized payload because Node `Error` objects don't serialize cleanly to JSON; the relevant context from `cause` is duplicated into `details` for the codes above where applicable (e.g., `details.exitCode` and `details.signal` mirror `cause.exitCode`/`cause.signal` for `CLI_NON_ZERO_EXIT`). For `CLI_REPORTED_ERROR`, `VALIDATION_ERROR`, and `TOOL_NOT_FOUND`, no cause-mirroring is needed: `CLI_REPORTED_ERROR` and `TOOL_NOT_FOUND` have `cause: null`, and `VALIDATION_ERROR`'s `details.issues` already projects the relevant `ZodError` content.

### 7. Patch the test-coverage requirements at lines 110-111

Currently:

```markdown
- [src/errors.test.ts](../../../src/errors.test.ts) — class construction, `code/cause/details` preservation, `instanceof UpstreamError`, `message` synthesis when omitted.
- [src/tools/obsidian_exec/handler.test.ts](../../../src/tools/obsidian_exec/handler.test.ts) — each of the four `code` paths is asserted (the four codes are not optional test cases; they each correspond to an FR).
```

Update to:

```markdown
- [src/errors.test.ts](../../../src/errors.test.ts) — class construction, `code/cause/details` preservation, `instanceof UpstreamError`, `message` synthesis when omitted.
- [src/tools/obsidian_exec/handler.test.ts](../../../src/tools/obsidian_exec/handler.test.ts) — each of the five handler-layer `code` paths is asserted (`CLI_NON_ZERO_EXIT`, `CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`, `CLI_REPORTED_ERROR`); each path corresponds to an FR.
- [src/tools/obsidian_exec/tool.test.ts](../../../src/tools/obsidian_exec/tool.test.ts) — the two dispatch-layer codes (`VALIDATION_ERROR`, `TOOL_NOT_FOUND`) are each asserted.
```

## Validation (acceptance criteria for the patched contract)

After the seven edits land in `specs/001-add-cli-bridge/contracts/errors.contract.md`, the file MUST satisfy:

- The `## Codes registered by obsidian_exec` section lists exactly seven codes: `CLI_NON_ZERO_EXIT`, `CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`, `CLI_REPORTED_ERROR`, `VALIDATION_ERROR`, `TOOL_NOT_FOUND`.
- The `### CLI_NON_ZERO_EXIT` table lists seven rows (was five): adds `details.exitCode` and `details.signal`.
- The `### CLI_REPORTED_ERROR` table lists seven rows: `code`, `cause`, `details.argv`, `details.stdout`, `details.stderr`, `details.exitCode`, `details.message`.
- The `### VALIDATION_ERROR` table lists three rows: `code`, `cause`, `details.issues`.
- The `### TOOL_NOT_FOUND` table lists four rows: `code`, `cause`, `details.requestedName`, `details.knownTools`.
- No remaining contradictions exist between table content and surrounding prose.
- The test-coverage list cites both `handler.test.ts` (five codes) and `tool.test.ts` (two codes).

The implementation handler patch (item 2 implementation gate) MUST also land in the same change set so the `CLI_NON_ZERO_EXIT.details.exitCode/signal` rows are not aspirational.
