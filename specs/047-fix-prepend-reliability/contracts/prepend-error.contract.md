# Contract: prepend tool error (structured error envelope)

**BI**: 047-fix-prepend-reliability
**Date**: 2026-05-27
**Source of truth**: `src/errors.ts` (`UpstreamError`) + `src/tools/prepend/handler.ts` (handler-level classifier) + `src/cli-adapter/_dispatch.ts` (substrate-level classifier) + `src/cli-adapter/cli-adapter.ts` (boundary-level classifier) + `src/tools/prepend/schema.ts` (input-validation classifier).
**Status**: Published contract. Verifies FR-005's failure-mode discriminator code-mapping against the actual code surface; documents the one new sub-discriminator this BI introduces under an existing top-level code (per ADR-015).

## Shape

The error envelope is a structured `UpstreamError` carrying:

```text
{
  code: string,                     // stable top-level discriminator
  cause: unknown,                   // original thrown value when available
  details: Record<string, unknown>, // structured per-failure-mode payload
  message: string                   // human-readable summary
}
```

The MCP SDK serialises these errors via its error-response shape (per Principle IV); the agent receives the `code`, the relevant `details` fields, and the `message` string.

## Failure-mode discriminator code-mapping (FR-005 verification)

The full mapping verified against the existing code surface (per R5 in [research.md](../research.md)):

| # | Failure mode | `code` | `details.code` | `details.reason` | Construction site |
|---|--------------|--------|----------------|------------------|-------------------|
| 1 | Substrate timeout | `CLI_TIMEOUT` | — | — | `src/cli-adapter/_dispatch.ts:238` |
| 2 | Vault not found (registry-known rejection) | `VALIDATION_ERROR` | — | — | `src/vault-registry/registry.ts:70` |
| 3 | Vault not found (registry-unknown, upstream reports) | `CLI_REPORTED_ERROR` | — | — | `src/cli-adapter/cli-adapter.ts:92` |
| 4 | Missing target file | `CLI_REPORTED_ERROR` | `NOTE_NOT_FOUND` | — | `src/tools/prepend/handler.ts:129-138` |
| 5 | Path traversal | `PATH_ESCAPES_VAULT` | — | — | `src/tools/prepend/handler.ts:264-273` |
| 6 | Oversized content | `VALIDATION_ERROR` | `CONTENT_TOO_LARGE` | — | `src/tools/prepend/schema.ts:52` (Zod `too_big`) |
| 7 | Empty content | `VALIDATION_ERROR` | `CONTENT_EMPTY` | — | `src/tools/prepend/schema.ts:52` (Zod `too_small`) |
| 8 | Locator structural-path-safety violation | `VALIDATION_ERROR` | (Zod `custom`) | — | `src/tools/prepend/schema.ts:25-42` |
| 9 | Wikilink-bracket rejection | `VALIDATION_ERROR` | (Zod `custom`) | — | `src/tools/prepend/schema.ts:30-37` |
| 10 | Locator target-mode refinement | `VALIDATION_ERROR` | (refinement-specific) | — | `src/target-mode/target-mode.ts` (via `applyTargetModeRefinement`) |
| 11 | Host-process spawn failure (binary not found) | `CLI_BINARY_NOT_FOUND` | — | — | `src/cli-adapter/_dispatch.ts:119, 202` |
| 12 | Host-process abnormal exit (non-zero exit) | `CLI_NON_ZERO_EXIT` | — | — | `src/cli-adapter/_dispatch.ts:283` |
| 13 | Host-process zero-exit with stdout-reported error | `CLI_REPORTED_ERROR` | — | — | `src/cli-adapter/cli-adapter.ts:92` |
| 14 | Editor conflict (target file held open) | `CLI_REPORTED_ERROR` | `EXTERNAL_EDITOR_CONFLICT` | `file-locked` (+ optional `errno`) | `src/tools/prepend/handler.ts:142-153` |
| 15 | **Active-mode no-active-file** | `ERR_NO_ACTIVE_FILE` | — | — | `src/tools/prepend/handler.ts:201-207` |
| 16 | Active-mode focused-file eval response unparseable | `CLI_REPORTED_ERROR` | — | (stage: `json-parse`) | `src/tools/prepend/handler.ts:185-190` |
| 17 | Active-mode focused-file eval response unexpected shape | `CLI_REPORTED_ERROR` | — | (stage: `envelope-parse`) | `src/tools/prepend/handler.ts:193-198` |
| 18 | Active-mode file-TSV parse failure | `CLI_REPORTED_ERROR` | — | (stage: `file-tsv-parse`) | `src/tools/prepend/handler.ts:67-72` |
| 19 | Dispatch-layer ERR_NO_ACTIVE_FILE re-classification | `ERR_NO_ACTIVE_FILE` | — | — | `src/cli-adapter/_dispatch.ts:303` |
| 20 | Dispatch-layer output-too-large | `CLI_OUTPUT_TOO_LARGE` | — | — | `src/cli-adapter/_dispatch.ts:264` |
| 21 | **Post-stat byte-delta zero (NEW)** | `FS_WRITE_FAILED` | — | `post-stat-byte-delta-zero` | `src/tools/prepend/handler.ts` (NEW guard site at post-stat) |

**Zero new top-level codes are introduced by this BI** (Principle IV preserved; the project's zero-new-top-level-codes streak is unbroken).

## ADR-015 sub-discriminator reach

This BI introduces ONE new sub-discriminator: row 21 above, under the existing top-level code `FS_WRITE_FAILED` (already in the code surface per the Grep output during `/speckit-plan` execution, e.g., `src/tools/append_note/handler.ts:99`).

The new sub-discriminator follows the canonical ADR-015 pattern:

```text
new UpstreamError({
  code: "FS_WRITE_FAILED",                                  // existing top-level code
  cause: null,
  details: {
    reason: "post-stat-byte-delta-zero",                    // NEW details.reason
    path: relPath,
    vault: vaultDisplayName,
    preCallSize,
    postCallSize,
  },
  message: "...",
})
```

The `details.code` field is intentionally unset for this discriminator — the failure does not fit a sub-class within `FS_WRITE_FAILED` (the failure class is `FS_WRITE_FAILED` itself; the `reason` field disambiguates the cause within that class). The handler MAY add a `details.code` sub-class later if additional `FS_WRITE_FAILED` sub-classes emerge; this BI is single-state under that top-level code.

**ADR-015 Constitution Check row**: flipped from N/A (plan-time, pending) to Y (post-design, compliant). The new sub-discriminator is the canonical pattern application.

## Discriminator semantics for callers

Callers branch their remediation on the composite `(code, details.code, details.reason)` tuple. Recommended branching shape:

```text
switch (err.code) {
  case "VALIDATION_ERROR":
    switch (err.details?.code) {
      case "CONTENT_EMPTY":      // empty content — caller's bug
      case "CONTENT_TOO_LARGE":  // over-cap — split the payload
      default:                   // structural/refinement violation
    }

  case "CLI_TIMEOUT":            // upstream hang — retry after timeout
  case "CLI_BINARY_NOT_FOUND":   // upstream not installed — surface to user
  case "CLI_NON_ZERO_EXIT":      // upstream exited abnormally — surface stderr

  case "CLI_REPORTED_ERROR":
    switch (err.details?.code) {
      case "NOTE_NOT_FOUND":     // target missing — recheck path
      case "EXTERNAL_EDITOR_CONFLICT":
        switch (err.details?.reason) {
          case "file-locked":    // editor open — prompt user to close
        }
      default:                   // upstream stdout-reported — surface message
    }

  case "ERR_NO_ACTIVE_FILE":     // active-mode failure — fall back to specific-mode
  case "PATH_ESCAPES_VAULT":     // caller's bug — surface immediately
  case "CLI_OUTPUT_TOO_LARGE":   // wrapper output cap exceeded — unlikely for prepend

  case "FS_WRITE_FAILED":
    switch (err.details?.reason) {
      case "post-stat-byte-delta-zero":  // NEW — silent-no-op surfaced; the write did not land. Retry after confirming the target file is not held open.
    }
}
```

## Compatibility

This BI introduces NO new top-level code. The new sub-discriminator (`FS_WRITE_FAILED.details.reason: "post-stat-byte-delta-zero"`) is additive: callers that don't branch on it see a generic `FS_WRITE_FAILED` envelope with a descriptive `message` and the existing `details` fields. Callers that DO branch on it gain a precise failure signal where v0.7.4 returned a misleading success envelope.

The behavioural compatibility surface: a v0.7.4 caller that received a `bytes_written: 0` success envelope (the FR-003 anti-pattern) and treated it as success will NOW receive a `FS_WRITE_FAILED` error envelope. **This is a deliberate change in surface shape — the v0.7.4 success-envelope shape was the bug, and exposing the failure as an error is the fix.** Callers that rely on the v0.7.4 anti-pattern shape MUST update to branch on `FS_WRITE_FAILED.details.reason: "post-stat-byte-delta-zero"`.
