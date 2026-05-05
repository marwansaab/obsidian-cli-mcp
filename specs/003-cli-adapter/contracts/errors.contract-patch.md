# Errors Contract Patch (003)

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Date**: 2026-05-05

This is **not** a standalone errors contract — the canonical contract lives at [specs/001-add-cli-bridge/contracts/errors.contract.md](../../001-add-cli-bridge/contracts/errors.contract.md) per the 002 Q5 precedent. This document records the exact diff feature 003 applies to that file during `/speckit-implement` (FR-012).

## Edits to apply

### 1. Add a new section `### ERR_NO_ACTIVE_FILE` (FR-012)

Insert after the existing `### TOOL_NOT_FOUND` section (the current last error-code section, before the `## Serialization to MCP` heading):

```markdown
### `ERR_NO_ACTIVE_FILE`

The spawned `obsidian` child exited cleanly with code `0`, but its `stdout` — after trimming leading whitespace — begins with the literal twenty-one-character ASCII prefix `Error: no active file` (case-sensitive). The CLI uses this in-band format for the focused-note-missing failure mode that arises when a tool call requests an "active" target but no note is open in the editor. Spec source: 003-cli-adapter FR-008(b). Triggered exclusively by the centralised CLI adapter at [src/cli-adapter/cli-adapter.ts](../../../src/cli-adapter/cli-adapter.ts); the legacy `obsidian_exec` handler continues to surface this case as `CLI_REPORTED_ERROR` because it does not implement the priority-(b)/priority-(c) split (Out-of-Scope per 003 spec).

| Field | Value |
|-------|-------|
| `code` | `"ERR_NO_ACTIVE_FILE"` |
| `cause` | `null` — no thrown value exists; the adapter is re-routing an exit-zero response, not catching a throw |
| `Error.message` | `"No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: \"specific\" and an explicit vault/file."` — the recovery-instruction string. Explicitly overrides the `UpstreamError` constructor's synthesized default. |
| `details.command` | `string` — the input `command` string verbatim (the adapter's first argument). Distinct from `obsidian_exec`'s `details.argv` shape: the adapter records only the command string because the calling typed-tool handler reconstructs argv from its own zod-validated input if needed. |
| `details.stdout` | `string` — full captured stdout (UTF-8). Byte-identical to what the resolve path would have returned. Always starts (after `.trimStart()`) with `Error: no active file`. |
| `details.stderr` | `string` — full captured stderr (UTF-8). Typically empty for the focused-note-missing case. |
| `details.exitCode` | `0` (literal `number`) — the truthful exit code the child exited with. Discoverable from the error alone for callers distinguishing this code from `CLI_NON_ZERO_EXIT`. |
| `details.message` | `string` — convenience one-line summary, computed as `stdout.split('\n', 1)[0].trim()` (LF-only split, full whitespace trim — same algorithm as `CLI_REPORTED_ERROR.details.message` per 003 FR-009). Always starts with `Error: no active file`. |

> **Priority discrimination**: `ERR_NO_ACTIVE_FILE` and `CLI_REPORTED_ERROR` share the `Error:` family of in-band detection prefixes. The adapter's classification machine evaluates `ERR_NO_ACTIVE_FILE` (priority b) before `CLI_REPORTED_ERROR` (priority c) so that stdout starting with the longer literal `Error: no active file. Open one.` always classifies as `ERR_NO_ACTIVE_FILE` — never as `CLI_REPORTED_ERROR`. The legacy `obsidian_exec` handler does not split these and surfaces both as `CLI_REPORTED_ERROR`.
```

### 2. Patch the prose at the existing serialization section (line 143)

Currently reads:

> `cause` is omitted from the serialized payload because Node `Error` objects don't serialize cleanly to JSON; the relevant context from `cause` is duplicated into `details` for the codes above where applicable (e.g., `details.exitCode` and `details.signal` mirror `cause.exitCode`/`cause.signal` for `CLI_NON_ZERO_EXIT`). For `CLI_REPORTED_ERROR`, `VALIDATION_ERROR`, and `TOOL_NOT_FOUND`, no cause-mirroring is needed: `CLI_REPORTED_ERROR` and `TOOL_NOT_FOUND` have `cause: null`, and `VALIDATION_ERROR`'s `details.issues` already projects the relevant `ZodError` content.

Update to:

> `cause` is omitted from the serialized payload because Node `Error` objects don't serialize cleanly to JSON; the relevant context from `cause` is duplicated into `details` for the codes above where applicable (e.g., `details.exitCode` and `details.signal` mirror `cause.exitCode`/`cause.signal` for `CLI_NON_ZERO_EXIT`). For `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`, `VALIDATION_ERROR`, and `TOOL_NOT_FOUND`, no cause-mirroring is needed: `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`, and `TOOL_NOT_FOUND` have `cause: null`, and `VALIDATION_ERROR`'s `details.issues` already projects the relevant `ZodError` content.

### 3. Patch the test-coverage requirements section at the bottom

Currently reads (lines 145-149):

```markdown
## Test coverage requirements (Principle II)

- [src/errors.test.ts](../../../src/errors.test.ts) — class construction, `code/cause/details` preservation, `instanceof UpstreamError`, `message` synthesis when omitted.
- [src/tools/obsidian_exec/handler.test.ts](../../../src/tools/obsidian_exec/handler.test.ts) — each of the five handler-layer `code` paths is asserted (`CLI_NON_ZERO_EXIT`, `CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`, `CLI_REPORTED_ERROR`); each path corresponds to an FR.
- [src/tools/obsidian_exec/tool.test.ts](../../../src/tools/obsidian_exec/tool.test.ts) — the two dispatch-layer codes (`VALIDATION_ERROR`, `TOOL_NOT_FOUND`) are each asserted.
```

Update to:

```markdown
## Test coverage requirements (Principle II)

- [src/errors.test.ts](../../../src/errors.test.ts) — class construction, `code/cause/details` preservation, `instanceof UpstreamError`, `message` synthesis when omitted.
- [src/tools/obsidian_exec/handler.test.ts](../../../src/tools/obsidian_exec/handler.test.ts) — each of the five legacy-handler `code` paths is asserted (`CLI_NON_ZERO_EXIT`, `CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`, `CLI_REPORTED_ERROR`); each path corresponds to an FR.
- [src/tools/obsidian_exec/tool.test.ts](../../../src/tools/obsidian_exec/tool.test.ts) — the two dispatch-layer codes (`VALIDATION_ERROR`, `TOOL_NOT_FOUND`) are each asserted.
- [src/cli-adapter/cli-adapter.test.ts](../../../src/cli-adapter/cli-adapter.test.ts) — each of the four adapter-layer `code` paths is asserted (`CLI_NON_ZERO_EXIT`, `ERR_NO_ACTIVE_FILE`, `CLI_REPORTED_ERROR`, `CLI_BINARY_NOT_FOUND`) along with priority-discrimination boundaries (FR-016 a–j).
```

## Validation (acceptance criteria for the patched contract)

After the three edits land in `specs/001-add-cli-bridge/contracts/errors.contract.md`, the file MUST satisfy:

- The contract lists exactly **eight** codes: `CLI_NON_ZERO_EXIT`, `CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`, `CLI_REPORTED_ERROR`, `VALIDATION_ERROR`, `TOOL_NOT_FOUND`, `ERR_NO_ACTIVE_FILE`.
- The `### ERR_NO_ACTIVE_FILE` table lists eight rows: `code`, `cause`, `Error.message`, `details.command`, `details.stdout`, `details.stderr`, `details.exitCode`, `details.message`.
- The serialization-prose update names `ERR_NO_ACTIVE_FILE` alongside the other `cause: null` codes.
- The test-coverage list cites `cli-adapter.test.ts` with its four code paths.
- No remaining contradictions exist between table content and surrounding prose.

## Cross-document consistency

[README.md](../../../README.md) MUST be updated atomically (in the same change set as the canonical-contract edits) so the new code never appears in only some surfaces:

1. [README.md](../../../README.md) — error-codes table at lines ~107-115 gains an `ERR_NO_ACTIVE_FILE` row (FR-013). Suggested row format mirroring the existing precedent:

   ```markdown
   | `ERR_NO_ACTIVE_FILE` | CLI exits 0 with stdout that, after leading-whitespace trim, starts with `Error: no active file` | `command`, `stdout`, `stderr`, `exitCode`, `message` |
   ```

   Insert after the `CLI_REPORTED_ERROR` row to keep the family-of-codes adjacent (the README groups by detection-mechanism, not by prefix family — `ERR_NO_ACTIVE_FILE` and `CLI_REPORTED_ERROR` share the `Error:`-prefix detection mechanism even though their semantic prefixes differ).

[ADR-004 - Centralized Obsidian CLI Adapter](../../../.decisions/ADR-004%20-%20Centralized%20Obsidian%20CLI%20Adapter.md) and [the Architecture document](../../../.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md) already name this code `ERR_NO_ACTIVE_FILE` — no amendments required.
