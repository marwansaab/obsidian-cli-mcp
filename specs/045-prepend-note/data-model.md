# Data Model: Prepend Note (Phase 1)

**Branch**: `045-prepend-note` | **Date**: 2026-05-26
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

This document captures the wire-level shape of the `prepend` tool's input, output, and typed error envelopes. The shapes here are authoritative for the JSON Schema contracts in `contracts/*.schema.json`; the in-tree zod schemas in `src/tools/prepend/schema.ts` are the source of truth for both the runtime validation and the published `inputSchema` (via `zod-to-json-schema`).

## Input schema

The input is a discriminated union on the `target_mode` field. The cohort's existing `applyTargetModeRefinement(targetModeBaseSchema.extend(...))` primitive handles the discriminator + the mutual-exclusivity refinement between `vault`/`file`/`path` (specific mode) and the focused-file locator (active mode). Cohort parity with `write_note`, `append_note`, `patch_heading`, `patch_block`, `set_property`.

### Common fields (both modes)

| Field | Type | Constraints | FR | Notes |
|-------|------|-------------|----|-------|
| `target_mode` | `"specific" \| "active"` | required | FR-001 | Discriminator. |
| `content` | `string` | length ≥ 1, length ≤ 24576 (UTF-16 code units) | FR-013, FR-018 | The bytes to prepend. Preserved verbatim by upstream per FR-010a. |
| `inline` | `boolean` | default `false`, optional | FR-007 | When `true`, suppresses upstream's default separator between the prepended content and the existing leading body line. |

### Specific mode fields (`target_mode: "specific"`)

| Field | Type | Constraints | FR | Notes |
|-------|------|-------------|----|-------|
| `vault` | `string` | length ≥ 1, length ≤ 1000 (UTF-16 code units), structurally safe per `isStructurallySafePath` | FR-001 | Vault display name. Resolved via the cohort's vault registry. |
| `file` | `string` (optional) | length ≥ 1, length ≤ 1000, structurally safe, MUST NOT contain `[[` or `]]` | FR-001, FR-001a, FR-002 | Wikilink-form bare note name. Mutually exclusive with `path`. |
| `path` | `string` (optional) | length ≥ 1, length ≤ 1000, structurally safe | FR-001, FR-014 | Vault-relative path. Mutually exclusive with `file`. |

Exactly one of `file` / `path` MUST be supplied (FR-001 + FR-014). The `applyTargetModeRefinement` primitive enforces this.

### Active mode fields (`target_mode: "active"`)

No additional fields. Active mode call shape is `{ target_mode: "active", content, inline? }`. Per FR-014, an active-mode call MUST NOT carry `vault`, `file`, or `path`; the refinement primitive rejects active-mode calls that include any of them.

Per FR-004a, no `confirmActive` flag is required (deliberate cohort exception to `write_note`'s mandatory `overwrite: true`; rationale in research.md R4).

### Strict schema (no extra fields)

The input schema is `.strict()` at every level. Unknown extra input fields are rejected at the input-validation boundary per FR-015 with a typed validation error naming the offending field. Cohort parity with `write_note`, `append_note`, `patch_heading`, `patch_block`.

### Validation error shape

Validation errors surface through `UpstreamError({ code: "VALIDATION_ERROR", details: { issues: [...] } })` where `issues` is the cohort-standard zod-issues array. Programmatic callers branch on `details.issues[].code` + `details.issues[].path` for specific failure modes:

| Failure | Issue `code` | Issue `path` | Issue `message` |
|---------|-------------|--------------|------------------|
| Empty content (FR-013) | `"too_small"` | `["content"]` | Cohort-standard "String must contain at least 1 character" |
| Oversized content (FR-018) | `"too_big"` | `["content"]` | Cohort-standard "String must contain at most 24576 character(s)" + `(VALIDATION_ERROR, CONTENT_TOO_LARGE)` ADR-015 details |
| Both `file` AND `path` (FR-014) | (custom from `applyTargetModeRefinement`) | `[]` or `["file"]` / `["path"]` | Cohort-standard mutex message |
| Neither `file` NOR `path` in specific mode (FR-014) | (custom from `applyTargetModeRefinement`) | `[]` | Cohort-standard missing-locator message |
| Locator supplied in active mode (FR-014) | (custom from `applyTargetModeRefinement`) | `["file"]` or `["path"]` | Cohort-standard locator-not-allowed-in-active-mode message |
| Wikilink-form bracket rejection (FR-001a) | `"custom"` | `["file"]` | "wikilink-form locator MUST NOT contain `[[` or `]]` brackets — supply the bare note name (e.g. `My Note` not `[[My Note]]`)" (byte-stable with BI-044's `WIKILINK_BRACKET_REJECTION_MESSAGE`) |
| Unknown extra field (FR-015) | `"unrecognized_keys"` | `[]` | Cohort-standard zod-strict unknown-keys message |
| Vault name structurally unsafe | `"custom"` | `["vault"]` | Cohort-standard `STRUCTURALLY_UNSAFE_PATH_MESSAGE` |
| Path structurally unsafe | `"custom"` | `["path"]` | Cohort-standard `STRUCTURALLY_UNSAFE_PATH_MESSAGE` |
| File structurally unsafe | `"custom"` | `["file"]` | Cohort-standard `STRUCTURALLY_UNSAFE_PATH_MESSAGE` |

The `(VALIDATION_ERROR, CONTENT_TOO_LARGE)` pair (FR-018) is the only new sub-discriminator state this BI introduces. Per ADR-015, it is single-state and carries no `details.reason` enumeration. Callers detect it programmatically by:

```
err.code === "VALIDATION_ERROR"
  && err.details?.issues?.some(i => i.code === "too_big" && i.path[0] === "content")
```

Cohort parity with BI-044's `(VALIDATION_ERROR, CONTENT_EMPTY)` detection pattern (which uses `"too_small"` for the inner code).

## Output schema (success envelope)

| Field | Type | Notes |
|-------|------|-------|
| `path` | `string` | The vault-relative path of the note that was prepended. Resolved per FR-003 — for `file=` callers, this is the canonical path resolved by the pre-flight `obsidian file` TSV resolver; for `path=` callers, this is the input `path` verbatim; for active-mode callers, this is the focused-file's `path` from the focused-file eval response. |
| `vault` | `string` | Vault display name. Resolved per FR-003 — for specific-mode callers, this is the input `vault` verbatim; for active-mode callers, this is the reverse-lookup of the focused-file's vault basePath through the registry (falls back to the basePath itself if the registry doesn't carry a display name). |
| `bytes_written` | `number` (integer ≥ 1) | The total number of bytes the prepend operation added to the file. Computed from upstream's response (or, if upstream doesn't report it, from a stat-after-prepend computation — pinned at T0). Cohort parity with `append_note`'s output shape. |
| `inline` | `boolean` | Echoes the input's `inline` flag for write-verification. Per the project's write-vs-read echo convention, write tools echo their locator-or-mode for caller confirmation. |

The output schema is `.strict()` — no extra fields permitted in the response envelope.

## Typed error envelope (failure surface)

All non-validation failures surface through `UpstreamError` instances with the following shape:

```
class UpstreamError extends Error {
  code: string;           // top-level discriminator
  cause: unknown;         // original thrown value (or null)
  details: object;        // structured context, including details.code / details.reason where applicable
  message: string;        // human-readable
}
```

### Top-level codes

| Top-level code | Used by | Notes |
|----------------|---------|-------|
| `VALIDATION_ERROR` | Schema-layer rejections (FR-013, FR-014, FR-015, FR-018, FR-001a) | Carries `details.issues[]` per cohort standard. |
| `CLI_REPORTED_ERROR` | Upstream subcommand failures (FR-016, FR-022) | Carries `details.code` sub-discriminator per ADR-015. |
| `ERR_NO_ACTIVE_FILE` | Active mode with no focused file (FR-004) | Top-level cohort code; no `details.code` sub-discriminator. |
| `PATH_ESCAPES_VAULT` | Layer 2 canonical-path check failure | Cohort parity. |

Zero new top-level codes. Constitution Principle IV streak preserved (twenty-tool streak after BI-045 ships per research.md R10).

### `details.code` sub-discriminators under `CLI_REPORTED_ERROR`

| `details.code` | Trigger | `details.reason` enum | New? | FR |
|----------------|---------|------------------------|------|----|
| `NOTE_NOT_FOUND` | Target not found (any locator shape; pre-flight resolver miss OR prepend not-found) | None (single-state) | No (reused from read-side cohort) | FR-016 |
| `EXTERNAL_EDITOR_CONFLICT` | External editor holds target with unsaved changes / file lock | `"unsaved-changes"` \| `"file-locked"` | No (reused from BI-040, BI-044 unchanged) | FR-022 |

### `details.code` sub-discriminators under `VALIDATION_ERROR`

| `details.code` | Trigger | `details.reason` enum | New? | FR |
|----------------|---------|------------------------|------|----|
| `CONTENT_EMPTY` | `content` length is 0 | None (single-state) | No (reused from BI-044 unchanged) | FR-013 |
| `CONTENT_TOO_LARGE` | `content` length > 24576 UTF-16 code units | None (single-state) | **YES (new in BI-045)** | FR-018 |

The `CONTENT_TOO_LARGE` pair is surfaced both via the zod `too_big` issue (visible to callers via `details.issues[].code === "too_big"` + `path === ["content"]`) AND via the ADR-015 envelope as `details.code === "CONTENT_TOO_LARGE"`. Cohort parity with BI-044's dual-surface for `CONTENT_EMPTY`.

## State machine: per-call flow

The handler's execution flow per call:

```
1. Input arrives → zod parse → FAIL? → VALIDATION_ERROR (FR-013 / FR-014 / FR-015 / FR-018 / FR-001a)
2. target_mode === "active"?
   - YES → invokeCli({ command: "eval", code: FOCUSED_FILE_TEMPLATE }) → parse JSON → focused file path? null → ERR_NO_ACTIVE_FILE (FR-004); else proceed with { vault: <reverse-lookup-display-name>, path: <focused-path> }
   - NO → input.path !== undefined ? proceed with { vault, path } : invokeCli({ command: "file", file: input.file }) → parse TSV → { vault, path: <resolved-canonical> }
3. Layer 2 canonical path check (cohort) → FAIL? → PATH_ESCAPES_VAULT
4. invokeCli({ command: "prepend", vault, path, content, [inline] })
5. Exit code 0 + non-error stdout? → compute bytes_written → return { path, vault, bytes_written, inline }
6. Exit code != 0 + stderr matches NOTE_NOT_FOUND pattern? → CLI_REPORTED_ERROR with details.code: NOTE_NOT_FOUND (FR-016)
7. Exit code != 0 + stderr matches EXTERNAL_EDITOR_CONFLICT pattern? → CLI_REPORTED_ERROR with details.code: EXTERNAL_EDITOR_CONFLICT + details.reason: file-locked|unsaved-changes (FR-022)
8. Else (unknown failure) → CLI_REPORTED_ERROR with details: { stage: "prepend-cli", stdout, stderr }
```

The pre-flight resolver call (step 2 specific+file branch) and the focused-file eval (step 2 active branch) MAY themselves fail; their failures surface as `NOTE_NOT_FOUND` (cohort parity with BI-044 — the pre-flight resolver miss IS a not-found case for the user's contract) or as generic `CLI_REPORTED_ERROR` for unknown failures.

## Cross-references

- The zod schema's `MAX_CONTENT_LENGTH` constant (defined once in `src/tools/prepend/schema.ts`) is the single source of truth for both the runtime validation cap AND the description-string-published cap. SC-008 contract-and-implementation match depends on this single source of truth being preserved across edits.
- The cohort's `applyTargetModeRefinement` and `targetModeBaseSchema` primitives are imported from `src/target-mode/target-mode.ts`. The `isStructurallySafePath` refinement and `STRUCTURALLY_UNSAFE_PATH_MESSAGE` constant are imported from `src/path-safety/schema.ts`.
- The `safeFileField` pattern (FR-001a wikilink-form bracket rejection) duplicates BI-044's inline pattern in `src/tools/append_note/schema.ts`. A future cohort cleanup may lift this to a shared helper when a third consumer appears (cohort threshold per R5).
