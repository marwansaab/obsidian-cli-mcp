# Contract: Error shapes added or changed in 0.9.0

**Serves**: FR-009, FR-011, FR-016, FR-037, FR-048, FR-049, FR-056 · Principle IV · ADR-015

**Invariant**: zero new top-level codes. The top-level set in use at HEAD:
CLI_BINARY_NOT_FOUND, CLI_NON_ZERO_EXIT, CLI_OUTPUT_TOO_LARGE, CLI_REPORTED_ERROR,
CLI_TIMEOUT, ERR_NO_ACTIVE_FILE, FILE_EXISTS, FS_WRITE_FAILED, HELP_DOCS_MISSING,
HELP_TOOL_NOT_FOUND, INTERNAL_ERROR, PATH_ESCAPES_VAULT, TOOL_NOT_FOUND,
VALIDATION_ERROR. New cases are new `details.code` values only (ADR-015).

Wire form (unchanged): a tool failure is a `tools/call` result with `isError: true` and
one text block holding `JSON.stringify({code, message, details})`. It has no
`structuredContent`.

## New `(top-level, details.code)` pairs

| Pair | Raised by | When | `details` | Message (shape) |
|---|---|---|---|---|
| `VALIDATION_ERROR` / `COMMAND_BLOCKED` | `obsidian_exec` handler | `command` is on the denylist and `OBSIDIAN_MCP_ALLOW_EVAL` is off; raised before any spawn | `{code, command}` (`command` as the caller sent it) | "obsidian_exec: command `<c>` is blocked by default because it can run arbitrary code or drive developer tooling. The vault owner can allow it by setting OBSIDIAN_MCP_ALLOW_EVAL=1." |
| `VALIDATION_ERROR` / `CONFIRMATION_DECLINED` | `delete`, `find_and_replace` | the human declined or cancelled, or accepted with `confirm: false` | `{code, action: "accept" \| "decline" \| "cancel"}` | "<tool>: confirmation was declined; nothing was changed." |
| `VALIDATION_ERROR` / `CONFIRMATION_UNAVAILABLE` | `delete`, `find_and_replace` | the client cannot elicit; raised before any spawn or write | `{code}` | delete: "…cannot ask you to confirm a permanent delete. Nothing was changed. Delete to the trash instead (omit `permanent`)." · find_and_replace: "…cannot ask you to confirm a multi-note replace. Nothing was changed. Commit one note at a time with `file` or `path`." |

## Changed behaviour on existing codes

| Code | Change |
|---|---|
| `PATH_ESCAPES_VAULT` | Now also raised for writes under a symlinked or junctioned folder whose nearest existing ancestor resolves outside the vault (A5). Same `details` `{vault, attemptedPath, resolvedPath}`; same `pathEscapeAttempt` log event. |
| `VALIDATION_ERROR` (registry unknown vault) → remapped `CLI_REPORTED_ERROR` / `VAULT_NOT_FOUND` | Raised only after one re-probe. The message no longer says to restart the MCP server (B4). |
| `TOOL_NOT_FOUND` | An unknown tool name may now surface as the SDK's protocol error (JSON-RPC -32602) instead of an `isError` result (A2, FR-016). Research R2 fixes which. |

## Partial outcome authorised by spec clarification (no response payload)

A cancelled multi-note `find_and_replace` commit returns no result: MCP sends no response
to a cancelled request. The partial state goes to stderr as the logger event
`commitCancelled` `{vault, committed: string[], skipped: string[]}`. Spec Clarifications
Q1 is the Principle IV authorisation.

## New diagnostic (stderr) events

| Event | Fields | Source |
|---|---|---|
| `metadataRefreshFailed` | `{vault, relPath, reason, detail}` — `reason` ∈ `cli-error` \| `note-not-found` \| `unexpected-output`; `detail` is the error code and message, or the first 200 characters of the eval output | A1, `invalidateMetadataCache` |
| `commitCancelled` | `{vault, committed, skipped}` | A3, `find_and_replace` commit |

Both are added to the `Logger` interface in `src/logger.ts`, beside the existing typed
events, and emitted as JSON lines.
