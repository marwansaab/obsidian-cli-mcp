# Input Contract — `read_heading`

**Feature**: [015-read-heading](../spec.md)
**Date**: 2026-05-09
**Companion**: [read-heading-handler.contract.md](./read-heading-handler.contract.md) for handler invariants.

This document records the public-facing input contract for `read_heading`: the zod schema, the emitted JSON Schema shape, the field policy, the structural-only heading-path validator, six worked examples, the error response roster, and notes on the inherited multi-vault default-ambiguity limitation.

---

## Zod schema (verbatim)

See [data-model.md § Input schema](../data-model.md#input-schema) for the canonical TypeScript. Re-stated here for ease of reference:

```typescript
import { z } from "zod";
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const HEADING_PATH_SEPARATOR = "::";

export function validateHeadingPath(value: string): true | string {
  const segments = value.split(HEADING_PATH_SEPARATOR);
  if (segments.length < 2) {
    return "heading must contain at least two `::`-separated segments (e.g. \"H1::H2\")";
  }
  if (segments.some((s) => s.length === 0)) {
    return "heading segments must be non-empty (no leading/trailing `::`, no consecutive `::`)";
  }
  return true;
}

export const readHeadingInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    heading: z.string().min(1).refine(
      (v) => validateHeadingPath(v) === true,
      (v) => ({ message: validateHeadingPath(v) as string }),
    ),
  }),
);
```

---

## Emitted JSON Schema shape

`zod-to-json-schema` (consumed via the `toMcpInputSchema` helper at [src/tools/_shared.ts](../../src/tools/_shared.ts)) produces approximately:

```json
{
  "type": "object",
  "properties": {
    "target_mode": { "type": "string", "enum": ["specific", "active"] },
    "vault":       { "type": "string", "minLength": 1 },
    "file":        { "type": "string" },
    "path":        { "type": "string" },
    "heading":     { "type": "string", "minLength": 1 }
  },
  "required": ["target_mode", "heading"],
  "additionalProperties": false
}
```

**Caveats**:
- The cross-field invariants (specific/active discriminator, file/path XOR, vault required-in-specific) are NOT representable in vanilla JSON Schema; they are enforced at runtime by `applyTargetModeRefinement`'s `superRefine`. MCP clients that do client-side schema validation will pass *malformed* shapes through to the server, which then rejects them with `VALIDATION_ERROR` carrying the offending field path.
- The structural-only heading-path validator (`validateHeadingPath`) is a `.refine()`; it is also runtime-only.
- `description` fields are stripped per `stripSchemaDescriptions` (ADR-005) in the published descriptor.

---

## Field policy

| Field | Type | Required | Forbidden in… | Notes |
|---|---|---|---|---|
| `target_mode` | `"specific" \| "active"` | Always | — | Standard discriminator (ADR-003) |
| `vault` | `string` (≥1 char) | Specific mode | Active mode | Multi-vault default-ambiguity inherited limitation — see "Multi-vault notes" below |
| `file` | `string` | Specific mode (XOR with `path`) | Active mode; Specific+`path` | Wikilink form — no extension, no folder. Resolved in-eval via `app.metadataCache.getFirstLinkpathDest`. |
| `path` | `string` | Specific mode (XOR with `file`) | Active mode; Specific+`file` | Vault-relative path including `.md`. Used directly as `app.metadataCache.fileCache[path]` key. |
| `heading` | `string` (≥1 char) | Always | — | Validated by `validateHeadingPath`: ≥2 non-empty `::`-separated segments. Structural only — heading existence is checked at execution time. |

---

## Structural heading-path validator (FR-006 / FR-007)

The validator splits `heading` on the literal separator `::` and applies two rules:

1. **At least two segments.** A single segment (no `::` separator at all) fails: `"Best Practices"` → reject. Documented fallback: full-file `read_note` plus client parse.
2. **Every segment non-empty.** Leading `::Foo`, trailing `Bar::`, and interior `A::::B` (consecutive `::` markers producing an empty segment between them) all fail.

The validator is **structural only** — it does NOT verify that the heading path resolves to an actual heading in the file. Existence resolution is a runtime concern that surfaces as `CLI_REPORTED_ERROR` with `details.code = "HEADING_NOT_FOUND"` (FR-013 / SC-011).

**Out-of-reach paths** (rejected by the contract; documented fallbacks):
- Single-segment H1-only reads: use the full-file `read_note` tool.
- Headings whose text contains `::` literally: there is no escape syntax. Use `read_note` plus a client-side parse on the heading text.
- Setext-style headings (`Heading\n====` / `Heading\n----`): not addressable as path segments AND not recognised as body terminators. Use `read_note` plus a client-side parse.

---

## Worked examples

### Example A — specific mode, 2-segment path, by `path` locator

**Input**:
```json
{
  "target_mode": "specific",
  "vault":       "WorkVault",
  "path":        "areas/best-practices.md",
  "heading":     "Best Practices::Naming"
}
```

**Successful response**:
```json
{ "content": "Use kebab-case.\n" }
```

**Failure modes**:
- File `areas/best-practices.md` not in vault: `CLI_REPORTED_ERROR` with `details.code = "FILE_NOT_FOUND"`.
- Heading path `Best Practices::Naming` not in file: `CLI_REPORTED_ERROR` with `details.code = "HEADING_NOT_FOUND"`.
- Vault `WorkVault` not registered: `CLI_REPORTED_ERROR` per 011-R5 reclassification.

---

### Example B — specific mode, 3-segment nested path, by `file` locator (wikilink)

**Input**:
```json
{
  "target_mode": "specific",
  "vault":       "WorkVault",
  "file":        "best-practices",
  "heading":     "Best Practices::Naming::Casing"
}
```

**Successful response**:
```json
{ "content": "Use lowercase letters and dashes.\n" }
```

**Notes**:
- The `file` form is the wikilink — Obsidian resolves `best-practices` to `areas/best-practices.md` (or wherever the file lives) via `app.metadataCache.getFirstLinkpathDest`.
- The 3-segment path `Best Practices::Naming::Casing` traverses the heading hierarchy; the body returned is the prose under `### Casing`, terminated by the next heading marker of any depth or by EOF.

---

### Example C — active mode

**Input**:
```json
{
  "target_mode": "active",
  "heading":     "Top::Section A"
}
```

**Successful response**:
```json
{ "content": "Hello.\n" }
```

**Notes**:
- The handler does NOT pass a `vault=` parameter to the CLI in active mode; the eval runs against whatever vault Obsidian's editor currently has focused, against whichever note in that vault is the focused file.
- If no note is focused (or no Obsidian instance is reachable): `ERR_NO_ACTIVE_FILE` per the structured envelope's `code: "NO_ACTIVE_FILE"` mapping.

---

### Example D — validation failure: single-segment heading

**Input**:
```json
{
  "target_mode": "specific",
  "vault":       "WorkVault",
  "path":        "areas/best-practices.md",
  "heading":     "Best Practices"
}
```

**Failure response**:
```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "{ \"code\": \"VALIDATION_ERROR\", \"message\": \"Input failed validation\", \"details\": { \"issues\": [{ \"path\": [\"heading\"], \"message\": \"heading must contain at least two `::`-separated segments (e.g. \\\"H1::H2\\\")\" }] } }"
  }]
}
```

**Notes**:
- The CLI dispatcher is NEVER invoked for this case — validation happens before the handler runs (FR-018 / SC-010).
- Documented fallback: use `read_note` (returns the full file) and parse the H1 section client-side.

---

### Example E — validation failure: empty interior segment

**Input**:
```json
{
  "target_mode": "active",
  "heading":     "A::::B"
}
```

**Failure response**:
```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "{ \"code\": \"VALIDATION_ERROR\", \"message\": \"Input failed validation\", \"details\": { \"issues\": [{ \"path\": [\"heading\"], \"message\": \"heading segments must be non-empty (no leading/trailing `::`, no consecutive `::`)\" }] } }"
  }]
}
```

---

### Example F — runtime failure: heading not found

**Input**:
```json
{
  "target_mode": "specific",
  "vault":       "WorkVault",
  "path":        "areas/best-practices.md",
  "heading":     "Best Practices::NonExistent"
}
```

**Failure response**:
```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "{ \"code\": \"CLI_REPORTED_ERROR\", \"message\": \"read_heading: heading path not found in file\", \"details\": { \"stage\": \"envelope-error\", \"code\": \"HEADING_NOT_FOUND\", \"detail\": \"segments: Best Practices::NonExistent not found in areas/best-practices.md\" } }"
  }]
}
```

**Notes**:
- The handler DID invoke the CLI (validation passed); the runtime failure surfaces from the JS template's `{ok: false, code: "HEADING_NOT_FOUND"}` envelope per R13.
- The `details.code` and `details.detail` carry the eval-side context for debugging.

---

## Error response roster

| Failure | Code | Origin | `details.stage` |
|---|---|---|---|
| Schema validation fails (any field rule, structural heading validator, additionalProperties, target_mode discriminator) | `VALIDATION_ERROR` | `registerTool` parse step | (zod issues array) |
| Locator file not found in vault | `CLI_REPORTED_ERROR` | Eval envelope `code: "FILE_NOT_FOUND"` (R13) | `envelope-error` |
| Heading path not found in file | `CLI_REPORTED_ERROR` | Eval envelope `code: "HEADING_NOT_FOUND"` (R13) | `envelope-error` |
| Active mode with no focused note | `ERR_NO_ACTIVE_FILE` | Eval envelope `code: "NO_ACTIVE_FILE"` (R13) | `envelope-error` |
| Vault not found (unknown display name) | `CLI_REPORTED_ERROR` | cli-adapter 011-R5 inspection clause | (no stage; classified at adapter layer) |
| Eval response not valid JSON | `CLI_REPORTED_ERROR` | Handler stage 1 parse | `json-parse` |
| Eval response shape unexpected | `CLI_REPORTED_ERROR` | Handler stage 2 envelope-schema parse | `envelope-parse` |
| Output cap fired (>10 MiB) | `CLI_NON_ZERO_EXIT` | cli-adapter (existing 003-cli-adapter contract) | (no stage; killReason carries cap details) |
| CLI binary missing or not executable | `CLI_BINARY_NOT_FOUND` | cli-adapter dispatch layer | (no stage) |
| CLI exited non-zero (any other reason) | `CLI_NON_ZERO_EXIT` | cli-adapter dispatch layer | (no stage) |

**Zero new error codes** — every failure flows through one of the above existing codes per FR-022.

---

## Multi-vault notes

The `vault: string` field is structurally enforced at the schema layer (required in specific mode, forbidden in active mode). However, the underlying `obsidian eval` subcommand has an inherited limitation: the `vault=` CLI parameter is functionally ignored. Eval always runs against whichever vault Obsidian's running instance currently has focused.

Implications:
- **Single-vault setups**: works as expected. The focused vault IS the only vault.
- **Multi-vault setups, target vault open and focused**: works. The eval runs against the focused vault.
- **Multi-vault setups, target vault open but NOT focused**: silently runs against the focused vault. The wrapper does not detect this case. Multi-vault users open the target vault before invoking.
- **Unknown vault display name**: catches via 011-R5 inspection clause. `Vault not found.` exit 0 → reclassified as `CLI_REPORTED_ERROR`.

This is the same limitation that 014 / 013 / 012 / 011 carry. Documented in `docs/tools/read_heading.md` for callers.

---

## Notes on the structural-only heading validator

The validator's output is deterministic: a heading path either passes (≥2 non-empty segments) or fails with one of two specific messages. There is no fuzzy match, no normalisation, no escape syntax. The contract is intentionally narrow:

- **By design**: the validator does NOT lowercase, trim, or normalise the heading path.
- **By design**: the validator does NOT support escaping (`A\::B` is not a way to match a heading text containing `::`).
- **By design**: the validator does NOT verify the heading's existence — that's a runtime concern.

The narrowness keeps the rejection messages precise and the contract auditable.
