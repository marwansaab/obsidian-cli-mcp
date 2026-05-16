# Contract: `context_search` Error Envelopes

**Branch**: `035-context-search`
**Date**: 2026-05-17

All errors are instances of `UpstreamError` (`src/errors.ts`) and propagate through the MCP SDK's standard error-response shape. **Zero new top-level error codes are introduced by this BI** (Constitution Principle IV; preserves the project's zero-new-codes streak through the eighteenth tool).

## Envelope roster (inherited)

The new tool inherits the project-wide envelope set. The columns are: code (top-level), trigger condition, `details` shape, and which infrastructure layer emits it.

| Code | Trigger | `details` shape (key fields) | Emitted by |
|------|---------|------------------------------|------------|
| `VALIDATION_ERROR` | Invalid input rejected by zod at the boundary (empty / whitespace-only `query`, `query` > 1000 chars, `limit` outside `1..10000`, unknown key). | `issues: ZodIssue[]` (zod's native shape). | MCP SDK wrapper around `contextSearchInputSchema.parse`. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` binary cannot be resolved at invocation time. | `platform`, `attempts`, `PATH`. | `_dispatch.ts:118` and `:201`. |
| `CLI_TIMEOUT` | The CLI did not finish within 10 seconds (TYPED_TOOL_TIMEOUT_MS). | `argv`, `timeoutMs`, `partialStdout`. | `_dispatch.ts:237`. |
| `CLI_OUTPUT_TOO_LARGE` | The CLI's stdout or stderr exceeded 10 MiB (TYPED_TOOL_OUTPUT_CAP_BYTES). | `argv`, `stream`, `limitBytes`. | `_dispatch.ts:263`. |
| `CLI_NON_ZERO_EXIT` | The CLI exited with a non-zero status code. | `argv`, `command`, `stdout`, `stderr`, `exitCode`, `signal`. | `_dispatch.ts:282`. |
| `ERR_NO_ACTIVE_FILE` | The CLI returned exit 0 with stdout starting with `Error: no active file ...`. N/A in practice — `context_search` does not depend on the active file. | `argv`, `command`, `stdout`, `stderr`, `exitCode: 0`, `message`. | `_dispatch.ts:294`. |
| `CLI_REPORTED_ERROR` | (i) The CLI returned exit 0 with stdout starting with `Error:` (any suffix other than the no-active-file case). (ii) `cli-adapter.ts` re-classifier catches stdout starting with `Vault not found.` (the project's vault-routing convention). (iii) The handler emits this code with `details.stage: "json-parse"` or `details.stage: "wire-parse"` on staged-parse failures. | (i) `argv`, `command`, `stdout`, `stderr`, `exitCode: 0`, `message`. (ii) `command`, `stdout`, `stderr`, `exitCode: 0`, `message: "Vault not found."`. (iii) `stage`, `stdout` (clipped). | (i) `_dispatch.ts:308` priority (c). (ii) `cli-adapter.ts:87-97`. (iii) `context_search/handler.ts`. |

## FR-013 folder-not-found path

When `obsidian search:context` returns the zero-match sentinel `"No matches found."` AND `input.folder` was supplied AND the normalised folder is non-empty, the handler invokes `obsidian folder path=<normalised> vault=<vault>`. The outcomes:

- **Folder exists**: `obsidian folder` succeeds (returns folder info on stdout, no `Error:` prefix). The handler proceeds to return the empty envelope `{count: 0, matches: []}`.
- **Folder missing**: `obsidian folder` returns stdout `Error: Folder "<folder>" not found.` with exit 0. The dispatch-layer classifier in `_dispatch.ts:308-318` priority (c) catches the `Error:` prefix and emits `UpstreamError(code: "CLI_REPORTED_ERROR", details: { argv, command: "folder", stdout, stderr, exitCode: 0, message: 'Error: Folder "<folder>" not found.' })`. The handler propagates this verbatim — no wrapping, no re-classification.

**No new top-level code**. **No new `details.code` field** on `CLI_REPORTED_ERROR` for this path — the existing dispatch classifier does not populate `details.code`; the structured signal lives in `details.message` (which starts with `Error: Folder`). Callers programmatically detect folder-not-found via:

```ts
err.code === "CLI_REPORTED_ERROR" &&
  typeof err.details.message === "string" &&
  err.details.message.startsWith('Error: Folder ')
```

This is consistent with how the project handles `Vault not found.` (the cli-adapter's classifier sets `details.message` to the verbatim CLI string; callers pattern-match on it). ADR-015 is N/A — no new `(top-level-code, details.code)` pair is introduced.

## FR-014 vault-not-found path

Inherited unchanged from `cli-adapter.ts:87-97`. When the CLI returns stdout starting with `Vault not found.` (exit 0), the cli-adapter's success-path stdout inspector emits:

```ts
new UpstreamError({
  code: "CLI_REPORTED_ERROR",
  cause: null,
  details: { command: "search:context", stdout, stderr, exitCode: 0, message: "Vault not found." },
  message: "Vault not found.",
})
```

The handler does not need any tool-specific code to handle this case — the cli-adapter classifier fires before the handler sees the response.

## Wire-shape and JSON-parse failures

Handler-emitted `CLI_REPORTED_ERROR` with `details.stage`:

- `details.stage: "json-parse"` — `JSON.parse(result.stdout)` threw. Cause is the JSON.parse Error; details include `stdout` clipped to 500 characters.
- `details.stage: "wire-parse"` — `searchContextWireSchema.safeParse(parsed)` returned `{ success: false }`. Cause is the zod issue array; details include `stdout` clipped to 500 characters.

These are existing patterns from `search`'s handler (`src/tools/search/handler.ts:94-114` / :138-143). The new handler reuses the patterns verbatim.

## Caller pattern-matching helper

Recommended caller pseudocode to distinguish error subtypes:

```ts
function classifyContextSearchError(err: unknown): string {
  if (!(err instanceof UpstreamError)) return "unexpected";
  if (err.code === "VALIDATION_ERROR") return "input-invalid";
  if (err.code === "CLI_BINARY_NOT_FOUND") return "binary-missing";
  if (err.code === "CLI_TIMEOUT") return "timeout";
  if (err.code === "CLI_OUTPUT_TOO_LARGE") return "output-too-large";
  if (err.code === "CLI_NON_ZERO_EXIT") return "non-zero-exit";
  if (err.code === "CLI_REPORTED_ERROR") {
    const msg = String(err.details.message ?? "");
    if (msg === "Vault not found.") return "vault-not-found";
    if (msg.startsWith('Error: Folder ')) return "folder-not-found";
    if (err.details.stage === "json-parse") return "json-parse-failed";
    if (err.details.stage === "wire-parse") return "wire-parse-failed";
    return "cli-reported-other";
  }
  return "unexpected";
}
```

This helper is illustrative; callers may use their own classification approach. The point is that `code` + `details.message` + `details.stage` are the three structural signals.

## Summary

| Error case | Top-level code | Sub-signal |
|------------|----------------|------------|
| Invalid input | `VALIDATION_ERROR` | `issues[]` |
| Folder not found (FR-013) | `CLI_REPORTED_ERROR` | `details.message.startsWith('Error: Folder ')` |
| Vault not found (FR-014) | `CLI_REPORTED_ERROR` | `details.message === "Vault not found."` |
| Malformed CLI JSON | `CLI_REPORTED_ERROR` | `details.stage === "json-parse"` |
| Wire-shape mismatch | `CLI_REPORTED_ERROR` | `details.stage === "wire-parse"` |
| Other CLI error stdout | `CLI_REPORTED_ERROR` | (whatever upstream said in `details.message`) |
| CLI binary missing | `CLI_BINARY_NOT_FOUND` | `details.platform` / `attempts` |
| CLI timeout | `CLI_TIMEOUT` | `details.timeoutMs` |
| CLI output too large | `CLI_OUTPUT_TOO_LARGE` | `details.stream` / `limitBytes` |
| CLI non-zero exit | `CLI_NON_ZERO_EXIT` | `details.exitCode` / `signal` |
