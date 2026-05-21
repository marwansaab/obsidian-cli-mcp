# `query_base` Error Contract

**Branch**: `039-query-base` | **Date**: 2026-05-20
**Companions**: [input.schema.json](./input.schema.json), [output.schema.json](./output.schema.json)

This document enumerates every error envelope `query_base` can surface to a caller. Each entry pins the top-level `code`, the `details.code` sub-discriminator, the `details.reason` sub-state (where applicable), the driving FR, and an example payload shape. Authoritative source is the `UpstreamError` instantiation in [src/tools/query_base/handler.ts](../../../src/tools/query_base/handler.ts); this table is the human-readable cross-reference.

## Constitution Principle IV streak

No new top-level error codes are introduced by this BI. The fifteen-tool zero-new-top-level-codes streak (BI-011 / ADR-009 origin) extends to sixteen tools after BI-039 ships. All new failure states surface via `details.code` sub-discrimination per ADR-015.

## Validation-layer errors (Zod / schema)

These fire BEFORE any filesystem access, subprocess invocation, or vault registry lookup. Top-level `code: "VALIDATION_ERROR"`.

| `details.code`         | `details.reason`                    | Driving FR | Example payload |
|------------------------|-------------------------------------|------------|-----------------|
| `INVALID_BASE_PATH`    | `empty`                             | FR-011     | `{ code: "VALIDATION_ERROR", details: { code: "INVALID_BASE_PATH", reason: "empty", field: "base_path", value_length: 0 } }` |
| `INVALID_BASE_PATH`    | `too-long`                          | FR-011a    | `{ code: "VALIDATION_ERROR", details: { code: "INVALID_BASE_PATH", reason: "too-long", field: "base_path", value_length: 1247 } }` |
| `INVALID_BASE_PATH`    | `wrong-extension`                   | FR-012     | `{ code: "VALIDATION_ERROR", details: { code: "INVALID_BASE_PATH", reason: "wrong-extension", field: "base_path", value: "Indexes/Active.md" } }` |
| `INVALID_BASE_PATH`    | `path-traversal`                    | FR-010 (Layer 1) | `{ code: "VALIDATION_ERROR", details: { code: "INVALID_BASE_PATH", reason: "path-traversal", field: "base_path", value: "../etc/secrets.base" } }` |
| `INVALID_VIEW_NAME`    | `empty`                             | FR-011     | `{ code: "VALIDATION_ERROR", details: { code: "INVALID_VIEW_NAME", reason: "empty", field: "view_name", value_length: 0 } }` |
| `INVALID_VIEW_NAME`    | `too-long`                          | FR-011a    | `{ code: "VALIDATION_ERROR", details: { code: "INVALID_VIEW_NAME", reason: "too-long", field: "view_name", value_length: 5028 } }` |
| Standard Zod issues    | (Zod issue path + code)             | Boundary   | `{ code: "VALIDATION_ERROR", details: { issues: [{ path: ["base_path"], code: "invalid_type", expected: "string", received: "number" }] } }` |

## Post-validation, pre-CLI errors

These fire after Zod validation passes but before the cli-adapter spawns the subprocess. Layer-2 path safety check.

| Top-level `code`        | `details.code`        | Driving FR | Example payload |
|-------------------------|-----------------------|------------|-----------------|
| `PATH_ESCAPES_VAULT`    | — (single state)      | FR-010 (Layer 2) | `{ code: "PATH_ESCAPES_VAULT", details: { base_path: "Symlinks/external.base", resolved: "/etc/secrets.base", vault_root: "/Users/x/Vault" } }` |

## Pre-flight CLI-adapter errors

Pre-flight `fs.stat` on the resolved `base_path` runs before subprocess spawn (per research.md R4).

| `details.code`    | `details.reason` | Driving FR | Example payload |
|-------------------|------------------|------------|-----------------|
| `BASE_NOT_FOUND`  | — (single state) | FR-004     | `{ code: "CLI_REPORTED_ERROR", details: { code: "BASE_NOT_FOUND", base_path: "Indexes/missing.base" } }` |
| `BASE_MALFORMED`  | `empty`          | FR-005b    | `{ code: "CLI_REPORTED_ERROR", details: { code: "BASE_MALFORMED", reason: "empty", base_path: "Indexes/Active.base" } }` |

## Post-subprocess errors

After `invokeCli` returns, the handler classifies upstream's exit code, stderr, and stdout shape. The classification table (R4 in research.md) is populated empirically during /speckit-implement T0 probes; the contracts below pin the envelope shape regardless of the exact pattern-match boundaries.

| `details.code`    | `details.reason`                      | Driving FR | Example payload |
|-------------------|---------------------------------------|------------|-----------------|
| `BASE_MALFORMED`  | `invalid-yaml`                        | FR-005b    | `{ code: "CLI_REPORTED_ERROR", details: { code: "BASE_MALFORMED", reason: "invalid-yaml", base_path: "Indexes/Active.base", message: "<upstream verbatim>" } }` |
| `BASE_MALFORMED`  | `missing-required-key`                | FR-005b    | `{ code: "CLI_REPORTED_ERROR", details: { code: "BASE_MALFORMED", reason: "missing-required-key", base_path: "Indexes/Active.base", message: "<upstream verbatim>" } }` |
| `BASE_MALFORMED`  | `unsupported-schema-version`          | FR-005b    | `{ code: "CLI_REPORTED_ERROR", details: { code: "BASE_MALFORMED", reason: "unsupported-schema-version", base_path: "Indexes/Active.base", message: "<upstream verbatim>" } }` |
| `BASE_MALFORMED`  | `unknown`                             | FR-005b    | `{ code: "CLI_REPORTED_ERROR", details: { code: "BASE_MALFORMED", reason: "unknown", base_path: "Indexes/Active.base", message: "<upstream verbatim>" } }` |
| `VIEW_NOT_FOUND`  | — (single state)                      | FR-005     | `{ code: "CLI_REPORTED_ERROR", details: { code: "VIEW_NOT_FOUND", view_name: "All BIs", base_path: "Indexes/Active.base" } }` |
| `VAULT_NOT_FOUND` | `unknown` (existing cohort sub-state) | FR-009     | `{ code: "CLI_REPORTED_ERROR", details: { code: "VAULT_NOT_FOUND", reason: "unknown", vault: "TypoVaultName" } }` |
| `VAULT_NOT_FOUND` | `not-open` (existing)                 | FR-009     | `{ code: "CLI_REPORTED_ERROR", details: { code: "VAULT_NOT_FOUND", reason: "not-open", vault: "ClosedVault" } }` |

## Inherited cli-adapter errors (re-used unchanged)

These surface when the subprocess itself misbehaves and are classified at the cli-adapter / dispatch layer (ADR-007 / ADR-009). The `query_base` handler does not introduce them; they flow through unmodified.

| Top-level `code`        | Origin                                  | Triggered when                                                                          |
|-------------------------|-----------------------------------------|------------------------------------------------------------------------------------------|
| `UPSTREAM_TIMEOUT`      | cli-adapter — TYPED_TOOL_TIMEOUT_MS = 10s | Subprocess exceeds 10s wall-clock. Affects views that are unusually expensive to evaluate. |
| `OUTPUT_CAP_EXCEEDED`   | cli-adapter — TYPED_TOOL_OUTPUT_CAP_BYTES = 10MiB | Upstream stdout exceeds 10 MiB. Affects very large row sets even before the 1000-row wrapper cap fires. |
| `INTERNAL_ERROR`        | wrapper invariant violations            | Wrapper-side bug — e.g., row-locator synthesis fails (R2 invariant). |

## Caller-side pattern-match template

The full surface area lets a caller handle every failure with one switch site:

```typescript
try {
  const result = await mcp.call("query_base", { base_path, view_name, vault });
  // result is QueryBaseOutput — { columns, rows, truncated, total_rows? }
} catch (e) {
  if (e.code === "VALIDATION_ERROR") {
    switch (e.details?.code) {
      case "INVALID_BASE_PATH":
        // e.details.reason: "empty" | "too-long" | "wrong-extension" | "path-traversal"
        break;
      case "INVALID_VIEW_NAME":
        // e.details.reason: "empty" | "too-long"
        break;
      default:
        // standard Zod issues — e.details.issues is the array
        break;
    }
  } else if (e.code === "CLI_REPORTED_ERROR") {
    switch (e.details?.code) {
      case "BASE_NOT_FOUND":  // fix the filename
      case "BASE_MALFORMED":  // fix the file content; e.details.reason narrows
      case "VIEW_NOT_FOUND":  // use a valid view name
      case "VAULT_NOT_FOUND": // fix the vault name; e.details.reason narrows
        break;
    }
  } else if (e.code === "PATH_ESCAPES_VAULT") {
    // symlink-escape; security event already logged
  } else if (e.code === "UPSTREAM_TIMEOUT" || e.code === "OUTPUT_CAP_EXCEEDED") {
    // narrow the view or accept a sampling approach
  } else if (e.code === "INTERNAL_ERROR") {
    // file a bug — wrapper invariant violation
  }
}
```
