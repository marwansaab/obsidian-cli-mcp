# Public Input Contract — `links` Typed MCP Tool

**Feature**: [025-list-links](../spec.md)
**Date**: 2026-05-13
**Source of truth**: [src/tools/links/schema.ts](../../../src/tools/links/schema.ts) (created at /speckit-implement T-phase)

This document captures the public input contract for `links`: the zod schema, the emitted JSON Schema (via `zod-to-json-schema`), the per-field policy, worked examples (A–G), and the error response roster. The contract here is the surface MCP clients see — any MCP client calling `links` MUST conform to this shape.

---

## Zod schema

```typescript
import { z } from "zod";
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const linksInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    total: z.boolean().optional(),
  }),
);
```

`targetModeBaseSchema` is the project-wide ADR-003 discriminator (also consumed by `read`, `delete`, `outline`, `read_heading`, `read_property`, `find_by_property`, `set_property`, `rename`, `write_note`). The `applyTargetModeRefinement` helper:

- In `target_mode: "specific"` — requires `vault` to be a non-empty string, requires EXACTLY ONE of `file` (basename) or `path` (vault-relative) to be supplied (XOR), accepts optional `total`.
- In `target_mode: "active"` — forbids `vault`, `file`, `path`; accepts optional `total` only.

Strict mode rejects unknown top-level keys (FR-004 / US3 scenario 4).

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
| `total` | never | boolean | default `false` when omitted |

`vault` SHOULD be a non-empty registered Obsidian vault display name. Per F7 the upstream `eval` subcommand emits "Vault not found." for unregistered names; the cli-adapter's 011-R5 inspection clause reclassifies to `CLI_REPORTED_ERROR(code: VAULT_NOT_FOUND)`. The wrapper does NOT impose a wrapper-side vault-registry pre-check (rejected precedent across the project — adds per-call probe cost without changing behaviour).

`file` and `path` are MUTUALLY EXCLUSIVE in specific mode. Supplying both is a `ZodError` at the validation boundary. Supplying neither is also a `ZodError`.

`total` defaults to `false`. Callers who want the per-entry list omit it or set `false`. Callers who want only the count set `true`. Cross-mode invariant: the outer `count` is identical between modes for the same note state at the same instant (FR-005a).

`additionalProperties: false` rejects unknown top-level keys. Some MCP clients strip unknown keys client-side per the published schema; strict-naive clients that forward unknown keys to the server will see `ZodError` at the validation boundary. Both behaviours documented.

---

## Worked examples

### Example A — Specific mode by path

```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Projects/brief.md"
}
```

Returns the full outgoing-link inventory for `Demo:Projects/brief.md` per FR-005 / FR-006.

### Example B — Specific mode by basename

```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "file": "brief"
}
```

The basename `brief` resolves via `app.metadataCache.getFirstLinkpathDest("brief", "")` inside the eval JS. When unambiguous, structurally equivalent to Example A. When the basename matches multiple files, host wikilink-resolution semantics decide which file (the wrapper does NOT impose disambiguation per Edge Cases LOCATOR — basename collision).

### Example C — Active mode

```json
{
  "target_mode": "active"
}
```

Returns the outgoing-link inventory for `app.workspace.getActiveFile()`. Per FR-013, when no note is focused, emits envelope `NO_ACTIVE_FILE` → `ERR_NO_ACTIVE_FILE` (or `CLI_REPORTED_ERROR` with `details.code: 'NO_ACTIVE_FILE'`).

### Example D — Count-only mode

```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Projects/brief.md",
  "total": true
}
```

Response: `{ "count": 4, "links": [] }` (empty per-entry list, `count` populated identically to default mode for the same note state per FR-005a / R11).

### Example E — Active mode + count-only

```json
{
  "target_mode": "active",
  "total": true
}
```

Returns the count of outgoing links on the focused note; per-entry list omitted. Error paths (NO_ACTIVE_FILE) are NOT masked by count-only — the same envelope error fires per US4 scenario 3.

### Example F — Validation rejection: missing vault

```json
{
  "target_mode": "specific",
  "path": "Projects/brief.md"
}
```

`ZodError` at the validation boundary; dispatcher spy never called (US3 scenario 1 / FR-015).

### Example G — Validation rejection: unknown key

```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Projects/brief.md",
  "filter": "wikilink"
}
```

`ZodError` (strict mode) at the validation boundary; dispatcher spy never called (US3 scenario 4 / FR-004 / FR-015).

---

## Error response roster

| Failure | Error code | When |
|---|---|---|
| Validation failure | `VALIDATION_ERROR` | Any schema parse failure (missing required, type mismatch, unknown key, XOR violation, active-forbid violation). Wrapped by `registerTool` from `ZodError`. Includes `details.issues` (zod's per-field paths). |
| Unknown vault | `CLI_REPORTED_ERROR` with `details.code: 'VAULT_NOT_FOUND'` | Specific mode + `vault` not registered. Triggered by cli-adapter 011-R5 inspection of upstream's `Vault not found.` text response. Per R5 / F7. |
| Unresolved `path` | `CLI_REPORTED_ERROR` with `details.stage: 'envelope-error'`, `details.code: 'FILE_NOT_FOUND'`, `details.detail: 'path: <path>'` | Specific mode + `path` does not match any file in the vault. Envelope from eval JS via `app.vault.getFiles().find()` returning null. |
| Unresolved `file` (basename) | `CLI_REPORTED_ERROR` with `details.stage: 'envelope-error'`, `details.code: 'FILE_NOT_FOUND'`, `details.detail: 'wikilink: <file>'` | Specific mode + `file` does not resolve via `getFirstLinkpathDest`. |
| Non-`.md` target | `CLI_REPORTED_ERROR` with `details.stage: 'envelope-error'`, `details.code: 'NOT_MARKDOWN'`, `details.detail: 'path: <path> extension: <ext>'` | Locator resolves to a `.canvas` / `.png` / `.pdf` / `.<other>` file. Per F9. |
| No active file | `ERR_NO_ACTIVE_FILE` OR `CLI_REPORTED_ERROR(details.code: 'NO_ACTIVE_FILE')` | Active mode + no focused file. Final code locked at T0 per R13 / BI-015 precedent alignment. |
| Eval response malformed | `CLI_REPORTED_ERROR` with `details.stage: 'json-parse'` | `JSON.parse(stdout)` failed at the handler layer. Catch-all for upstream eval misbehaviour. |
| Eval envelope shape unknown | `CLI_REPORTED_ERROR` with `details.stage: 'envelope-parse'` | `linksEvalResponseSchema.safeParse` failed at the handler layer. Catch-all for unexpected envelope keys. |
| CLI binary missing | `CLI_BINARY_NOT_FOUND` | `obsidian` not on PATH / OBSIDIAN_BIN not set. Inherited from binary-resolver. |
| CLI exited non-zero | `CLI_NON_ZERO_EXIT` | Generic non-zero exit. Includes 10 MiB output cap kill (very-large-link-list case). |

Per FR-017, NO new error codes are introduced by this feature. All failures flow through existing codes.

---

## Multi-vault inherited limitation

Per F7 / R5, the `eval` subcommand DOES emit "Vault not found." for unregistered vault display names — UNLIKE `properties` (BI-024), `files` (BI-019), `outline` (BI-023) where upstream silently honoured-as-noop. The wrapper inherits the cli-adapter's 011-R5 inspection clause, so the FR-012 structured-error contract HOLDS for this feature.

Multi-vault callers MUST supply a registered display name; the wrapper does NOT silently route to the focused vault when an unrecognised name is supplied. This is distinct from the inherited-limitation pattern in the predecessors named above — operators in multi-vault setups can rely on the named-vault contract.

The wrapper does NOT impose a wrapper-side vault-registry pre-check. The upstream's existing emission is sufficient.

---

## Out-of-scope upstream surfaces

Per FR-021 / SC-018 and the spec's Assumptions OOS block, the following upstream surfaces are NOT exposed by the wrapper. Each maps to a wrapper-side rejection or a documented absence.

| Upstream surface | Exposure | Mechanism |
|---|---|---|
| `format=json` flag on `links` | NOT EXPOSED | Wrapper uses `eval`, not `links`. Per F1 the flag is silently ignored by upstream anyway. |
| `total` flag on `links` | NOT EXPOSED | Wrapper computes `total` inside the eval envelope (R3). |
| Bare URLs in body prose | NOT EXPOSED | Per Q3 — bare URLs are body content per host classification; wrapper does NOT add URL-detection regex. |
| Heading/block fragment as separate field | NOT EXPOSED | Per Q2 — fragment embedded in `target` string. |
| `column` per-entry field | NOT EXPOSED | Per Q5 — column data is internal-only for the intra-line tiebreak sort. |
| `source: "frontmatter" \| "body"` discriminator | NOT EXPOSED | Per Q4 — frontmatter entries are intermingled without a discriminator. |
| `resolved: boolean` flag | NOT EXPOSED | Per FR-006 exhaustive list — broken-link detection is OOS. |
| `original` raw-source-span | NOT EXPOSED | Per FR-006 exhaustive list. |
| `endLine` / `endColumn` range fields | NOT EXPOSED | Per FR-006 exhaustive list. |
| Inbound links / backlinks | NOT EXPOSED | Covered by the `backlinks` upstream subcommand on a future sibling tool surface. |
| Multi-hop traversal | NOT EXPOSED | Single-hop only. Callers compose. |
| Vault-wide link inventory | NOT EXPOSED | One note at a time. Callers compose with `files`. |
| Canonical-path resolution | NOT EXPOSED | `target` is byte-faithful to source. Callers resolve. |
| Request-side filter / sort | NOT EXPOSED | Callers filter / re-sort client-side. |
