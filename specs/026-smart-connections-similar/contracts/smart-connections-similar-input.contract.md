# Public Input Contract — `smart_connections_similar` Typed MCP Tool

**Feature**: [026-smart-connections-similar](../spec.md)
**Date**: 2026-05-15
**Source of truth**: [src/tools/smart_connections_similar/schema.ts](../../../src/tools/smart_connections_similar/schema.ts) (created at /speckit-implement T-phase)

This document captures the public input contract for `smart_connections_similar`: the zod schema, the emitted JSON Schema (via `zod-to-json-schema`), the per-field policy, worked examples (A–H), the error response roster, and the out-of-scope upstream surfaces table. The contract here is the surface MCP clients see — any MCP client calling `smart_connections_similar` MUST conform to this shape.

---

## Zod schema

```typescript
import { z } from "zod";
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const smartConnectionsSimilarInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    limit: z.number().int().min(1).max(100).default(20),
    total: z.boolean().optional(),
  }),
);
```

`targetModeBaseSchema` is the project-wide ADR-003 discriminator (also consumed by `read`, `delete`, `outline`, `read_heading`, `read_property`, `find_by_property`, `set_property`, `rename`, `write_note`, `links`). The `applyTargetModeRefinement` helper:

- In `target_mode: "specific"` — requires `vault` to be a non-empty string, requires EXACTLY ONE of `file` (basename) or `path` (vault-relative) to be supplied (XOR), accepts optional `limit` and `total`.
- In `target_mode: "active"` — forbids `vault`, `file`, `path`; accepts optional `limit` and `total` only.

Strict mode rejects unknown top-level keys (FR-005 / US3 scenario 4).

---

## Emitted JSON Schema (illustrative shape)

The `toMcpInputSchema` helper (`src/tools/_shared.ts`) runs `zod-to-json-schema` then `stripSchemaDescriptions` (per ADR-005) and publishes the result via the MCP `inputSchema` field. Approximate shape:

```json
{
  "type": "object",
  "properties": {
    "target_mode": { "type": "string", "enum": ["specific", "active"] },
    "vault":       { "type": "string", "minLength": 1 },
    "file":        { "type": "string" },
    "path":        { "type": "string" },
    "limit":       { "type": "integer", "minimum": 1, "maximum": 100, "default": 20 },
    "total":       { "type": "boolean" }
  },
  "required": ["target_mode"],
  "additionalProperties": false,
  "allOf": [
    /* refinements emitted by zod-to-json-schema for the XOR + active-forbid rules */
  ]
}
```

The refinements are emitted via `oneOf` / `allOf` constraint chains by `zod-to-json-schema`; the exact shape is verified by the BI-022 baseline test (`_register-baseline.test.ts`) once the tool is registered.

---

## Field policy

| Field | Required | Type | Constraint |
|---|---|---|---|
| `target_mode` | always | string enum | `"specific"` or `"active"` |
| `vault` | in specific mode | string | `min(1)` non-empty |
| `file` | in specific mode (XOR with `path`) | string | basename without `.md` extension by convention |
| `path` | in specific mode (XOR with `file`) | string | vault-relative path including `.md` |
| `limit` | never | integer | `1..100` inclusive, default `20` |
| `total` | never | boolean | default `false` when omitted |

`vault` SHOULD be a non-empty registered Obsidian vault display name. Per F1 the upstream `eval` subcommand ROUTES CORRECTLY when the named vault is currently open. Per F7 / F8 the upstream emits empty stdout + exit 0 for a registered-but-closed vault; the handler's empty-stdout detection branch (R5a) classifies that case as `CLI_REPORTED_ERROR(VAULT_NOT_FOUND, details.reason: "not-open")`. The cli-adapter's 011-R5 inspection clause continues to fire for UNREGISTERED vault (`Vault not found.` text response → `details.reason` absent or `"unknown"`). The wrapper does NOT impose a wrapper-side vault-registry pre-check (rejected precedent across the project — adds per-call probe cost without changing behaviour).

`file` and `path` are MUTUALLY EXCLUSIVE in specific mode. Supplying both is a `ZodError` at the validation boundary. Supplying neither is also a `ZodError`.

`limit` defaults to `20`. Values outside `1..100` (e.g. `0`, `-5`, `101`, `1000`) OR non-integer values (e.g. `5.5`, `"20"`) are rejected at the validation boundary per FR-003 / US3 scenario 6. The `limit` caps both the `matches` array length AND the value of `count` in count-only mode (per SC-017).

`total` defaults to `false`. Callers who want the per-entry list omit it or set `false`. Callers who want only the count set `true`. Cross-mode invariant: the outer `count` is identical between modes for the same note state at the same instant (FR-006a).

`additionalProperties: false` rejects unknown top-level keys. Some MCP clients strip unknown keys client-side per the published schema; strict-naive clients that forward unknown keys to the server will see `ZodError` at the validation boundary. Both behaviours documented.

---

## Worked examples

### Example A — Specific mode by path, default limit, no total

```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Topics/ML.md"
}
```

Returns the top-20 nearest-neighbour matches for `Demo:Topics/ML.md` per FR-006 / FR-007. `limit` defaults to `20`; `total` defaults to `false`.

### Example B — Specific mode by basename

```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "file": "ML"
}
```

The basename `ML` resolves via `app.metadataCache.getFirstLinkpathDest("ML", "")` inside the eval JS. When unambiguous, structurally equivalent to Example A. When the basename matches multiple files inside the same vault, host wikilink-resolution semantics decide which file (the wrapper does NOT impose disambiguation per Edge Cases LOCATOR — basename collision). Cross-vault basename ambiguity is a documented inherited limitation (see below).

### Example C — Active mode

```json
{
  "target_mode": "active"
}
```

Returns the semantic neighbours for `app.workspace.getActiveFile()`. Per FR-018, when no note is focused, emits envelope `NO_ACTIVE_FILE` → `CLI_REPORTED_ERROR(details.code: 'NO_ACTIVE_FILE')` (or `ERR_NO_ACTIVE_FILE` per T0 lock).

### Example D — Count-only mode

```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Topics/ML.md",
  "total": true
}
```

Response: `{ "count": 7, "matches": [] }` (empty per-entry list, `count` populated identically to default mode for the same note state per FR-006a). The same `count` value `total: false` would yield for the identical source + `limit` is returned with an empty `matches` list.

### Example E — limit=5 explicit cap

```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Topics/ML.md",
  "limit": 5
}
```

Returns at most five matches in `matches` (top five by `score`). The outer `count` equals `matches.length` and is `<= 5`. Per US1 scenario 2.

### Example F — limit=100 max boundary

```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Topics/ML.md",
  "limit": 100
}
```

Returns at most 100 matches in `matches`. The plugin's internal similarity threshold may cap the actual returned count BELOW the requested limit (per F12 — `limit: 50` against a probed note returned only 5 results; the wrapper preserves the plugin's "upper-bound, not guarantee" semantic). The outer `count` reflects what the plugin actually returned post-filter.

### Example G — Cross-vault call

```json
{
  "target_mode": "specific",
  "vault": "Other",
  "path": "Notes/Reference.md"
}
```

Routes the eval to vault `"Other"`'s `app` instance (per F1 / F14 — `app.vault.getName()` inside the eval returns the requested vault name). When `"Other"` is REGISTERED and currently OPEN, succeeds normally. When `"Other"` is REGISTERED but NOT OPEN, the handler's empty-stdout detection branch (R5a) fires `CLI_REPORTED_ERROR(VAULT_NOT_FOUND, details.reason: "not-open")` AND the CLI transparently begins opening the vault as a side effect — a retry of the same call after a brief delay will likely succeed. When `"Other"` is UNREGISTERED, the cli-adapter's 011-R5 inspection clause fires `CLI_REPORTED_ERROR(VAULT_NOT_FOUND, details.reason: "unknown"` or absent).

### Example H — Validation rejection: limit out of range

```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Topics/ML.md",
  "limit": 0
}
```

`ZodError` at the validation boundary; dispatcher spy never called (US3 scenario 6 / FR-003 / FR-019). Identical failure mode for `limit: -5`, `limit: 101`, `limit: 1000`, `limit: 5.5`, `limit: "20"`.

---

## Error response roster

| Failure | Error code | When |
|---|---|---|
| Validation failure | `VALIDATION_ERROR` | Any schema parse failure (missing required, type mismatch, unknown key, XOR violation, active-forbid violation, `limit` out of range, `limit` non-integer, `total` non-boolean, `target_mode` unknown enum). Wrapped by `registerTool` from `ZodError`. Includes `details.issues` (zod's per-field paths). |
| Unknown vault | `CLI_REPORTED_ERROR` with `details.code: 'VAULT_NOT_FOUND'` and `details.reason` absent or `"unknown"` | Specific mode + `vault` not registered. Triggered by cli-adapter 011-R5 inspection of upstream's `Vault not found.` text response. Per R5 / FR-017. |
| Registered-but-closed vault | `CLI_REPORTED_ERROR` with `details.code: 'VAULT_NOT_FOUND'` and `details.reason: "not-open"` | Specific mode + `vault` registered but the vault window is NOT currently open in Obsidian. Triggered by handler-side empty-stdout detection branch (R5a) — signature: empty stdout + exit 0 + `vault=` supplied + vault name present in `obsidian vaults` output. The CLI transparently opens the vault as a side effect; retry MAY succeed. Per FR-017a / SC-011a. |
| Unresolved `path` | `CLI_REPORTED_ERROR` with `details.stage: 'envelope-error'`, `details.code: 'FILE_NOT_FOUND'`, `details.detail: 'path: <path>'` | Specific mode + `path` does not match any file in the vault. Envelope from eval JS via `app.vault.getFiles().find()` returning null. Per FR-012 / SC-008. |
| Unresolved `file` (basename) | `CLI_REPORTED_ERROR` with `details.stage: 'envelope-error'`, `details.code: 'FILE_NOT_FOUND'`, `details.detail: 'wikilink: <file>'` | Specific mode + `file` does not resolve via `getFirstLinkpathDest`. Per FR-012 / SC-008. |
| No active file | `CLI_REPORTED_ERROR` with `details.stage: 'envelope-error'`, `details.code: 'NO_ACTIVE_FILE'` (or `ERR_NO_ACTIVE_FILE` per T0 lock) | Active mode + no focused file. Final code locked at T0 per R13 / BI-015 / BI-025 precedent alignment. Per FR-018 / SC-004. |
| Non-`.md` target | `CLI_REPORTED_ERROR` with `details.stage: 'envelope-error'`, `details.code: 'NOT_MARKDOWN'`, `details.detail: 'path: <path> extension: <ext>'` | Locator resolves to a `.canvas` / `.png` / `.pdf` / `.<other>` file. Per FR-013 / R12 / SC-010. |
| Smart Connections not installed | `CLI_REPORTED_ERROR` with `details.stage: 'envelope-error'`, `details.code: 'SMART_CONNECTIONS_NOT_INSTALLED'` | `app.plugins.plugins["smart-connections"]` is `undefined` in the target vault. Per FR-015 / SC-012. |
| Smart Connections not ready | `CLI_REPORTED_ERROR` with `details.stage: 'envelope-error'`, `details.code: 'SMART_CONNECTIONS_NOT_READY'` | Plugin installed but the similarity-query API path (locked at plan stage) is missing or non-callable. Covers indexing-in-progress AND plugin-version-drift (per Q1 docs-only soft-pin). Per FR-016 / SC-013. |
| Source not indexed | `CLI_REPORTED_ERROR` with `details.stage: 'envelope-error'`, `details.code: 'SOURCE_NOT_INDEXED'` | Source `.md` file exists in vault, plugin is ready, but `env.smart_sources.items[<key>]` returns `undefined`. Per FR-014 / R11 / SC-009. |
| Eval response malformed | `CLI_REPORTED_ERROR` with `details.stage: 'json-parse'` | `JSON.parse(stdout)` failed at the handler layer. Catch-all for upstream eval misbehaviour. Distinct from the empty-stdout `not-open` case which is detected BEFORE stage 1 (R5a). |
| Eval envelope shape unknown | `CLI_REPORTED_ERROR` with `details.stage: 'envelope-parse'` | `smartConnectionsSimilarEvalResponseSchema.safeParse` failed at the handler layer. Catch-all for unexpected envelope keys. |
| CLI binary missing | `CLI_BINARY_NOT_FOUND` | `obsidian` not on PATH / OBSIDIAN_BIN not set. Inherited from binary-resolver. |
| CLI timeout | `CLI_TIMEOUT` | 10 s per-call timeout exceeded. Inherited from cli-adapter dispatch layer. |
| CLI output too large | `CLI_OUTPUT_TOO_LARGE` | 10 MiB output cap kill (practically unreachable at `limit: 1..100` — SC-026 contractually preserved). Inherited from cli-adapter dispatch layer. |
| CLI exited non-zero | `CLI_NON_ZERO_EXIT` | Generic non-zero exit. |

Per FR-021 / SC-022, NO new top-level error codes are introduced by this feature. All failures flow through existing codes; the seven plugin-specific failure modes (`VAULT_NOT_FOUND` × 2 reasons, `FILE_NOT_FOUND`, `NO_ACTIVE_FILE`, `NOT_MARKDOWN`, `SMART_CONNECTIONS_NOT_INSTALLED`, `SMART_CONNECTIONS_NOT_READY`, `SOURCE_NOT_INDEXED`) are all surfaced as `CLI_REPORTED_ERROR` with a `details.code` discriminator AND, for `VAULT_NOT_FOUND` only, a `details.reason` sub-discriminator.

---

## Multi-vault basename ambiguity (documented inherited limitation)

Per F1 / R5, the `eval` subcommand DOES route `vault=<name>` correctly to the named vault's `app` instance when that vault is currently open. This is a behaviour change from the spec drafts of BI-014 / BI-015 / BI-025 (which carried forward an outdated "vault= is silently honoured-as-noop by eval" premise). Multi-vault callers who supply a registered vault name receive the correct vault's matches.

However, the `file=<basename>` locator resolves via `app.metadataCache.getFirstLinkpathDest` INSIDE the requested vault's `app` instance — scoped to that vault only. When the SAME basename exists in multiple open vaults, the wrapper does NOT disambiguate across vaults; the lookup happens inside whichever vault `vault=` selects (or the focused vault when `vault=` is absent in active mode). Callers needing cross-vault disambiguation MUST supply both `vault=<name>` AND a vault-relative `path=` to remove ambiguity. This is the fifth documented inherited limitation surfaced in `docs/tools/smart_connections_similar.md` per FR-022.

---

## Out-of-scope upstream surfaces

Per FR-021 / SC-018 and the spec's Assumptions OOS block, the following surfaces are NOT exposed by the wrapper. Each maps to a wrapper-side rejection or a documented absence.

| Upstream / plugin surface | Exposure | Mechanism |
|---|---|---|
| Block-level granularity flag (source-vs-block discriminator) | NOT EXPOSED — v1 ships block-level matches as the natural plugin shape | Per the 2026-05-15 live-probe-driven amendment to grilling Q3; the `headingPath` field encodes the block locator (empty array for source-level matches). |
| `threshold` parameter (similarity-score floor) | NOT EXPOSED | Plugin's internal threshold is embedding-model-dependent; deferred. Callers filter client-side by `score`. |
| `exclude_folders` request-side filter | NOT EXPOSED | Plugin reads from its own settings; the wrapper does not surface per-call folder filters. Callers filter client-side on returned `path`. |
| Semantic free-text query (search-by-text not by-note) | NOT EXPOSED | Deferred to a future `smart_connections_query` typed tool (out of scope for this BI). |
| Raw embedding retrieval | NOT EXPOSED | Out of scope — the wrapper returns similarity matches, not embedding vectors. |
| Re-indexing trigger | NOT EXPOSED | Read-only contract per FR-014; the wrapper does NOT mutate the plugin's index. Remediation: trigger from the plugin's UI. |
| Chat / RAG composition | NOT EXPOSED | Out of wrapper scope — distinct plugin feature, distinct future BI (e.g. `smart_connections_chat`). |
| Cross-vault similarity (matches drawn from multiple vaults) | NOT EXPOSED | Single-vault per call — the plugin's index is per-vault; cross-vault similarity is not a plugin capability. |
| Ranking-metadata discriminator (source-vs-block in the per-match shape) | NOT EXPOSED — collapsed into `headingPath` | A match is block-level iff `headingPath.length > 0`; source-level iff `headingPath.length === 0`. No separate `kind` / `type` discriminator. |
| `displayName` / human-readable label per match | NOT EXPOSED | Per FR-007 exhaustive-fields lock. Callers derive client-side from `path` + `headingPath`. |
| `excerpt` / `content` per match | NOT EXPOSED | Per FR-007 exhaustive-fields lock. Callers compose with `read_heading` for follow-on reads. |
| `lineStart` / `lineEnd` per match | NOT EXPOSED | Per FR-007 exhaustive-fields lock. Block locations are encoded structurally by `headingPath`, not by line ranges. |
| `model` / `embeddingVersion` per match | NOT EXPOSED | Per FR-007 exhaustive-fields lock. Embedding-model identity is a documented inherited limitation, not a per-match field. |
| `original` raw plugin match key | NOT EXPOSED | Per FR-007 exhaustive-fields lock. The plugin's `item.key` is split into `path` + `headingPath` at the wrapper boundary. |
| Request-side `sort` parameter | NOT EXPOSED | Per FR-008 — fixed three-level sort (score desc / path asc / headingPath.join('#') asc). Callers re-sort client-side. |
