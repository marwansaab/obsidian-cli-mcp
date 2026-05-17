# Error Contract: `backlinks`

**Branch**: `036-get-backlinks`
**Date**: 2026-05-17
**Phase**: 1 (Design — Contracts)

The `backlinks` tool introduces ZERO new top-level error codes (Constitution Principle IV — preserves the project's zero-new-top-level-codes streak across the typed-tool cohort; this is the thirteenth eval-cohort tool to do so). All failures flow through the project's existing structured error codes via the `UpstreamError` value type (`src/errors.ts`).

## Error roster (all inherited)

| Top-level code | Surface | Origin |
|----------------|---------|--------|
| `VALIDATION_ERROR` | `registerTool`-level zod validation failures | Inherited from `registerTool` factory (`src/tools/_register.ts`) |
| `CLI_BINARY_NOT_FOUND` | `obsidian` binary missing or not on PATH | Inherited from cli-adapter (`src/cli-adapter/cli-adapter.ts`) |
| `CLI_NON_ZERO_EXIT` | CLI process exited with non-zero status, output-cap kill, or timeout | Inherited from cli-adapter |
| `CLI_REPORTED_ERROR` | CLI stdout/stderr matched the four-priority error classifier (eval-cohort: `Vault not found.`, `Error: <X>`, etc.) OR eval envelope reported `ok: false` with `FILE_NOT_FOUND` / `NOT_MARKDOWN` | Inherited from cli-adapter classifier + wrapper-side envelope mapping |
| `ERR_NO_ACTIVE_FILE` | Eval envelope reported `ok: false, code: 'NO_ACTIVE_FILE'` (active mode + no focused note) | Wrapper-side envelope mapping to inherited code |

## Per-failure-mode mapping

### Input validation (FR-021, fires before CLI invocation)

| Failure | Surface |
|---------|---------|
| Missing `target_mode` | `VALIDATION_ERROR` |
| Unknown `target_mode` enum value | `VALIDATION_ERROR` |
| Specific mode without required fields (vault / locator) | `VALIDATION_ERROR` |
| Active mode with forbidden fields (vault / file / path) | `VALIDATION_ERROR` |
| `with_counts` / `total` non-boolean | `VALIDATION_ERROR` |
| `limit` non-integer / out-of-range (`< 1` or `> 10000`) | `VALIDATION_ERROR` |
| Unknown top-level key | `VALIDATION_ERROR` |

All validation failures fire BEFORE any underlying CLI invocation. Test seam: handler test injects a CLI dispatcher spy; assertion checks the spy was never called.

### Locator resolution (FR-017 / FR-018 / FR-019 / FR-020)

| Failure | Surface | Mapping |
|---------|---------|---------|
| Active mode + no focused note | `ERR_NO_ACTIVE_FILE` | Eval envelope `{ok:false, code:'NO_ACTIVE_FILE'}` → wrapper maps to `ERR_NO_ACTIVE_FILE` (parity with BI-015 / BI-025) |
| Unresolved `path` value | `CLI_REPORTED_ERROR` | Eval envelope `{ok:false, code:'FILE_NOT_FOUND', detail:'path: <X>'}` → wrapper maps to `CLI_REPORTED_ERROR(details: { stage: 'envelope-error', code: 'FILE_NOT_FOUND', detail })` |
| Unresolved `file` basename | `CLI_REPORTED_ERROR` | Eval envelope `{ok:false, code:'FILE_NOT_FOUND', detail:'wikilink: <X>'}` → wrapper maps to same `CLI_REPORTED_ERROR` envelope |
| Target locator pointing at non-`.md` file (`.canvas`, `.pdf`, attachment) | `CLI_REPORTED_ERROR` | Eval envelope `{ok:false, code:'NOT_MARKDOWN', detail:'path: <X> extension: <Y>'}` → wrapper maps to `CLI_REPORTED_ERROR(details: { stage: 'envelope-error', code: 'NOT_MARKDOWN', detail })` |
| Unknown `vault` display name | `CLI_REPORTED_ERROR` | cli-adapter's 011-R5 inspection clause fires on `Vault not found.` stdout (eval-cohort); reclassifies to `CLI_REPORTED_ERROR(details: { code: 'VAULT_NOT_FOUND', ... })` |

### CLI infrastructure failures

| Failure | Surface |
|---------|---------|
| `obsidian` binary not on PATH | `CLI_BINARY_NOT_FOUND` |
| CLI invocation exceeds 10-second timeout | `CLI_NON_ZERO_EXIT` (with kill signal) |
| CLI stdout exceeds 10 MiB output cap | `CLI_NON_ZERO_EXIT` (output-cap kill) — fires only if the post-cap response (per FR-010) is STILL too large; routine clipping surfaces as `truncated: true` |
| CLI exits with non-zero status | `CLI_NON_ZERO_EXIT` |

### Wrapper-internal parse failures

| Failure | Surface |
|---------|---------|
| Eval response is not valid JSON | `CLI_REPORTED_ERROR(details: { stage: 'json-parse', stdout: <truncated> })` |
| Eval response is valid JSON but does not match the discriminated-union envelope shape | `CLI_REPORTED_ERROR(details: { stage: 'envelope-parse', stdout: <truncated> })` |

Both parse failures indicate a contract violation between the wrapper and the eval JS template (either the eval template emitted unexpected output, or Obsidian's metadataCache returned an unexpected shape). The wrapper does NOT swallow them — they surface as structured errors with a `details.stage` discriminator for debugging.

## ADR-015 sub-discriminator note

This BI does NOT introduce any new `(top-level-code, details.code)` pair. All `CLI_REPORTED_ERROR` envelopes carry one of three existing `details.code` values:

- `'VAULT_NOT_FOUND'` (inherited from cli-adapter's 011-R5 clause)
- `'FILE_NOT_FOUND'` (parity with BI-025 envelope mapping)
- `'NOT_MARKDOWN'` (parity with BI-025 envelope mapping)

No new `details.reason` sub-discriminators are introduced. ADR-015 gate is `N/A` for this BI.

## Constitution Principle IV invariant

The wrapper MUST NOT:
- Catch an `UpstreamError` and return `null` / `undefined` / empty result.
- Catch any error and log+continue.
- Throw `new Error("…")` (non-UpstreamError) from the handler at any boundary surface.

The wrapper MAY:
- Propagate `UpstreamError` instances verbatim (the `registerTool` factory catches them and serialises via `asToolError`).
- Re-throw non-`UpstreamError` exceptions (caught by `registerTool` as well; surface as the `registerTool` factory's fallback path).
- Construct new `UpstreamError` instances for the two parse-failure paths and the three envelope-error paths (all with stable `code` + `cause` + `details`).

Test coverage (handler.test.ts cases 22-25, 29) locks each failure-mode mapping. Coverage threshold: 91.3% aggregate statements (constitution gate 5).
