# Data Model: Query Base (Phase 1)

**Branch**: `039-query-base` | **Date**: 2026-05-20
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

This document specifies the input, response envelope, and error-envelope shapes that the `query_base` typed tool exposes at its MCP boundary. The Zod schemas in [src/tools/query_base/schema.ts](../../src/tools/query_base/schema.ts) are the single source of truth at runtime; this document is the human-readable cross-reference.

## Input

A single Zod object with three fields: required `base_path`, required `view_name`, optional `vault`. Strict mode (unknown top-level keys are rejected at validation, producing `VALIDATION_ERROR` with `details.code: "unrecognized_keys"`).

| Field      | Type   | Required | Constraints                                                                                                       | Validation error if violated                                                                                                                                            |
|------------|--------|----------|-------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `base_path`| string | yes      | non-empty; ≤ 1000 UTF-16 code units; ends with `.base` (case-insensitive on the extension); no path-traversal shapes; canonical resolution under the vault root | `INVALID_BASE_PATH` with `details.reason ∈ {"empty", "too-long", "path-traversal", "wrong-extension"}`; `PATH_ESCAPES_VAULT` for Layer-2 canonical-path violations    |
| `view_name`| string | yes      | non-empty; ≤ 1000 UTF-16 code units                                                                               | `INVALID_VIEW_NAME` with `details.reason ∈ {"empty", "too-long"}`                                                                                                       |
| `vault`    | string | no       | when present: non-empty; resolved via the lazy vault registry; unknown vault → `VAULT_NOT_FOUND` (cohort reuse)    | `VAULT_NOT_FOUND` with `details.reason ∈ {"unknown", "not-open"}`                                                                                                       |

Type alias: `type QueryBaseInput = z.infer<typeof queryBaseInputSchema>`.

### Validation order

1. **Schema-level** — Zod parses the input. Type errors, missing required fields, and unknown top-level keys surface as `VALIDATION_ERROR` with the standard issue array from Zod.
2. **`base_path` Zod refinements** — runs as part of schema parse: empty check, length cap, extension check, path-traversal shape check. All four surface under `details.code: "INVALID_BASE_PATH"` with `details.reason` distinguishing them.
3. **`view_name` Zod refinements** — runs as part of schema parse: empty check, length cap. Both surface under `details.code: "INVALID_VIEW_NAME"`.
4. **Path-safety Layer 2** — after Zod validation, the handler resolves `base_path` to an absolute filesystem path via `fs.realpath` and verifies `startsWith(realVaultRoot + sep)`. Violations surface as `PATH_ESCAPES_VAULT` (existing top-level code from ADR-009).

No vault access or subprocess invocation occurs before steps 1–4 complete.

## Success response envelope

The response is a JSON object with four top-level fields:

```typescript
interface QueryBaseOutput {
  columns: string[];                  // Column names in view-declared order, with reserved "path" at index 0
  rows: Array<Record<string, unknown>>; // Up to 1000 row objects keyed by columns
  truncated: boolean;                 // Always present
  total_rows?: number;                // Present iff truncated === true
}
```

### Field semantics

- **`columns`** — Authoritative column-order vector. Lists the names of the view's exposed columns in the order the view declares. The reserved key `path` always appears at index 0; a view-defined column named `path` is renamed to `path_view` (per FR-002b) and appears in `columns` at the index the view declared for the original `path` column. Empty-rows responses (FR-002c / FR-006) still carry `columns` populated so the agent learns the view's schema.
- **`rows`** — JSON array of row objects. Each row's keys match `columns` exactly (modulo the reserved-key rules). Row objects' key insertion order matches `columns` as a secondary guarantee; the `columns` vector is the authoritative ordering signal. Each row carries the reserved `path: string` (vault-relative source-note path) plus every view-declared column's value. Non-`path` keys are passthrough from upstream (FR-002d) — no synthesis, no suppression, no type coercion. Native JSON types preserved (FR-014): `number`, `boolean`, `null`, nested object, ISO-date string.
- **`truncated`** — Boolean truncation signal (FR-013). `false` when the view's full row set fit within the 1000-row cap; `true` when the wrapper sliced the row set down to the first 1000 in FR-003 deterministic order.
- **`total_rows`** — Number, optional. Present only when `truncated: true`; reports the upstream's full row count for the view at query time. Omitted when `truncated: false` (the row count is `rows.length`, no separate field needed).

### Row ordering (FR-003)

Three-tier deterministic sort applied by the wrapper after reading upstream's full row array and before slicing to the 1000-row cap:

1. **Primary** — the view's declared sort (if any). Wrapper trusts upstream's emission order at this layer when the view's sort is non-empty.
2. **Secondary tiebreaker** — `row.path` ascending (UTF-16 code-unit order). Applied whenever two rows share an equal primary sort key, OR for every row when the view declares no explicit sort.
3. **Tertiary tiebreaker** — upstream emission order (for the rare case where two rows share both primary key AND `path`, e.g., synthetic rows bound to the same source note).

The post-sort is stable (rows that compare equal preserve upstream's relative order). SC-003 (determinism across repeat invocations) holds regardless of Bases' internal walk-order stability.

### Truncation example

- View matches 4527 notes, no explicit sort: `rows.length === 1000`, `truncated: true`, `total_rows: 4527`, rows ordered by `path` ascending.
- View matches 250 notes, sort by `created` descending: `rows.length === 250`, `truncated: false`, `total_rows` omitted, rows ordered by `created` descending then by `path` ascending for ties.
- View matches exactly 1000 notes: `rows.length === 1000`, `truncated: false`, `total_rows` omitted (NOT a false-positive truncation signal — FR-013).
- View matches 0 notes: `rows.length === 0`, `truncated: false`, `total_rows` omitted, `columns` still populated.

## Error envelope

All failures route through `UpstreamError` (`src/errors.ts`) per Constitution Principle IV. The thrown error carries `{ code, cause, details, message }` where `code` is one of the existing top-level codes (no new top-level codes introduced — sixteen-tool zero-new-codes streak preserved post-BI-039).

### Top-level codes used

| Top-level `code`        | Origin                       | New states under this code (sub-discriminated via `details.code`) |
|-------------------------|------------------------------|-------------------------------------------------------------------|
| `VALIDATION_ERROR`      | Zod / schema validation      | `INVALID_BASE_PATH` (existing — extended with `too-long` sub-reason); `INVALID_VIEW_NAME` (new — two sub-reasons: `empty`, `too-long`) |
| `CLI_REPORTED_ERROR`    | cli-adapter / upstream       | `BASE_NOT_FOUND` (new); `BASE_MALFORMED` (new — five sub-reasons); `VIEW_NOT_FOUND` (new); `VAULT_NOT_FOUND` (existing — reused unchanged) |
| `PATH_ESCAPES_VAULT`    | ADR-009                      | reused unchanged — no sub-states                                  |
| `OUTPUT_CAP_EXCEEDED`   | cli-adapter (ADR-007)        | reused unchanged — fires only if upstream's stdout exceeds 10 MiB |
| `UPSTREAM_TIMEOUT`      | cli-adapter (ADR-007)        | reused unchanged — fires only if upstream exceeds 10 s timeout    |
| `INTERNAL_ERROR`        | wrapper invariant violation  | reused unchanged — fires only on wrapper bugs (e.g., R2's row-locator-synthesis invariant violation) |

### New `details.code` sub-discriminator map

| `details.code`        | Under `code`         | `details.reason` sub-states                                                                            | Driving FR |
|-----------------------|----------------------|--------------------------------------------------------------------------------------------------------|------------|
| `INVALID_BASE_PATH`   | `VALIDATION_ERROR`   | `empty`, `too-long`, `path-traversal`, `wrong-extension`                                               | FR-010, FR-011, FR-011a, FR-012 |
| `INVALID_VIEW_NAME`   | `VALIDATION_ERROR`   | `empty`, `too-long`                                                                                    | FR-011, FR-011a |
| `BASE_NOT_FOUND`      | `CLI_REPORTED_ERROR` | — (single state)                                                                                       | FR-004 |
| `BASE_MALFORMED`      | `CLI_REPORTED_ERROR` | `empty`, `invalid-yaml`, `missing-required-key`, `unsupported-schema-version`, `unknown`                | FR-005b |
| `VIEW_NOT_FOUND`      | `CLI_REPORTED_ERROR` | — (single state)                                                                                       | FR-005 |
| `VAULT_NOT_FOUND`     | `CLI_REPORTED_ERROR` | `unknown`, `not-open` (existing — reused unchanged from cohort)                                        | FR-009 |

### Error-envelope payload conventions

Every thrown `UpstreamError` carries a `details` record with at minimum the `details.code` discriminator. Additionally:
- `BASE_NOT_FOUND` carries `details.base_path` echoing the offending caller-supplied path.
- `BASE_MALFORMED` carries `details.base_path`, `details.reason` (per the sub-state table), and `details.message` (upstream's verbatim error message when classification is `"unknown"`, for chain-of-custody preservation per Principle IV).
- `VIEW_NOT_FOUND` carries `details.view_name`, `details.base_path` (resolved).
- `INVALID_BASE_PATH` / `INVALID_VIEW_NAME` carry `details.field` echoing which input field failed and `details.value_length` (an integer hint useful for `"too-long"` triage).
- `VAULT_NOT_FOUND` carries `details.vault` (cohort reuse).

The `cause` field carries the original thrown value (e.g., a `fs.stat` error, a JSON parse error, or `null` when the failure is purely classification-driven) per Principle IV.

## Entities

- **Base file** — vault-relative `.base` file. Identified by `base_path`. Lifecycle states relevant to this wrapper: absent (BASE_NOT_FOUND), present-but-unusable (BASE_MALFORMED, five sub-reasons), present-and-valid.
- **View** — named selector inside a base file. Identified by the pair `(base_path, view_name)`. Lifecycle states: absent (VIEW_NOT_FOUND), present-empty (success with `rows: []`), present-non-empty (success with `rows.length >= 1`).
- **Row** — single record matched by a view. Always carries the reserved `path: string` (source note's vault-relative path) plus every view-declared column. Identified positionally within a successful response; cross-query stability is NOT guaranteed by the wrapper — only `row.path` is durable across queries against an unchanged vault.
- **Column** — named field in a view's output schema. Listed by name in the envelope's `columns` vector (the authoritative ordering); also appears as a key in each row object. The reserved `path` column always occupies index 0; a view-defined `path` collision surfaces as `path_view`.
- **Vault** — Obsidian vault hosting the base file. Identified by display name (optional `vault` input field) or by the focused-vault default. Resolved via the project's lazy vault registry; unknown vault surfaces `VAULT_NOT_FOUND`.
