# Contract: `paths` Published Input Schema Shape

**Feature**: 032-fix-tree-surface | **Anchors**: FR-001..FR-004, SC-005..SC-006, SC-011 | **Date**: 2026-05-15

This contract pins the published `inputSchema` shape that the `paths` tool (the renamed replacement of `tree`) exposes through `tools/list` to MCP clients. It is the wire-level companion to the source-side `pathsInputSchema` zod definition at `src/tools/paths/schema.ts`. The contract is read by reviewers verifying FR-001..FR-004 and by deferred test authors writing the next BI's invariant tests.

## Wire shape (JSON Schema, after `zod-to-json-schema` emission)

```json
{
  "type": "object",
  "properties": {
    "target_mode": {
      "type": "string",
      "enum": ["specific", "active"]
    },
    "vault": {
      "type": "string",
      "minLength": 1
    },
    "folder": {
      "type": "string",
      "minLength": 1
    },
    "depth": {
      "type": "integer",
      "exclusiveMinimum": 0
    },
    "ext": {
      "type": "string",
      "minLength": 1
    },
    "total": {
      "type": "boolean"
    }
  },
  "required": ["target_mode"],
  "additionalProperties": false
}
```

Exactly six keys under `properties`. Exactly one entry in `required` (`target_mode`). `additionalProperties: false` per the source `.strict()`. The descriptions on individual properties are stripped by `stripSchemaDescriptions` per ADR-005; the published shape carries no `description` fields.

## What is gone vs v0.5.7

| Key | Pre-edit (v0.5.7) | Post-edit | Reason |
|---|---|---|---|
| `file` | present as `{type: "string"}` | **ABSENT** | FR-001; the `.omit({ file: true, path: true })` chain strips it from the base schema |
| `path` | present as `{type: "string"}` | **ABSENT** | FR-001; same |

The v0.5.7 published schema also carried `additionalProperties: false`, but the strict-mode rejection that BLOCKS unknown keys at parse runs AFTER zod's own key-walk; with `file`/`path` declared as keys in the base, they appeared in `properties` even though their values were rejected later by the refinement. Post-edit, with the keys removed from the base, they neither appear in `properties` nor pass strict parse — the wire shape and the runtime behaviour agree.

## Worked examples (8 input shapes covering valid + rejected)

### Example A — Specific mode + folder

Input: `{ "target_mode": "specific", "vault": "MyVault", "folder": "notes" }`

Outcome: **PASS** (zod strict parse succeeds; superRefine's specific-requires-vault clause passes because `vault` is provided).

### Example B — Active mode + folder + ext

Input: `{ "target_mode": "active", "folder": "books", "ext": "md" }`

Outcome: **PASS** (active mode forbids vault; vault is absent; folder and ext are optional).

### Example C — Specific mode + count-only

Input: `{ "target_mode": "specific", "vault": "V", "total": true }`

Outcome: **PASS** (six-parameter surface; `total: true` is the count-only flag).

### Example D — Specific mode + depth bound

Input: `{ "target_mode": "specific", "vault": "V", "depth": 2 }`

Outcome: **PASS** (positive-integer depth).

### Example E — Specific mode with leaked `file` (REJECTED)

Input: `{ "target_mode": "specific", "vault": "V", "file": "note.md" }`

Outcome: **REJECT** with `ZodError` containing `{ code: "unrecognized_keys", keys: ["file"], path: [] }`. The strict-mode rejection fires BEFORE superRefine; the error message says `Unrecognized key: "file"` (or similar). SC-006 verification anchor. This DEPARTS from v0.5.7 behaviour where the same input was rejected with `{ message: "file is not allowed for folder-scoped tools", path: ["file"] }` from the superRefine block.

### Example F — Active mode with leaked `path` (REJECTED)

Input: `{ "target_mode": "active", "path": "books/" }`

Outcome: **REJECT** with `ZodError` containing `{ code: "unrecognized_keys", keys: ["path"], path: [] }`. Same departure as Example E.

### Example G — Specific mode without vault (REJECTED at refinement)

Input: `{ "target_mode": "specific" }`

Outcome: **REJECT** with `ZodError` from superRefine: `{ message: "vault is required in specific mode", path: ["vault"] }`. **UNCHANGED** from v0.5.7 — the target_mode-rule enforcement is byte-stable per FR-003.

### Example H — Active mode with vault leak (REJECTED at refinement)

Input: `{ "target_mode": "active", "vault": "V" }`

Outcome: **REJECT** with `ZodError` from superRefine: `{ message: "vault is not allowed in active mode", path: ["vault"] }`. **UNCHANGED** from v0.5.7 per FR-003.

## Failure-mode roster (validation layer)

| Code | Cause | Message anchor |
|---|---|---|
| `VALIDATION_ERROR` (top-level via `UpstreamError`) | Any zod parse failure on the published schema | Wraps the `ZodError`; consumers see the `details` field with the offending path |
| → `code: "unrecognized_keys"` (zod issue code, inside `details`) | An input contains `file`, `path`, or any other top-level key not in the six-key set | Spec FR-002 / SC-006 anchor; NEW post-edit |
| → `code: "custom"` with `message: "vault is required in specific mode"` (zod refinement) | `target_mode: "specific"` without `vault` | FR-003 anchor; byte-stable from v0.5.7 |
| → `code: "custom"` with `message: "vault is not allowed in active mode"` (zod refinement) | `target_mode: "active"` with `vault` set | FR-003 anchor; byte-stable from v0.5.7 |
| → `code: "invalid_enum_value"` | `target_mode` not `"specific"` or `"active"` | byte-stable |
| → `code: "too_small"` | `vault` / `folder` / `ext` is an empty string; `depth` ≤ 0 | byte-stable |
| → `code: "invalid_type"` | Type mismatch on any field (e.g., `depth: "2"` instead of `depth: 2`) | byte-stable |

## Cross-tool no-regress invariant (SC-011)

The sibling `files` tool's published `inputSchema` MUST be byte-identical (or its `schemaFingerprint` in `_register-baseline.json` MUST be byte-identical) before vs after this BI's changes. Mechanism: the refinement helper `applyTargetModeRefinementForFolderScoped` is untouched; the `files/schema.ts` file is untouched; the `files` tool continues to consume the unomitted `targetModeBaseSchema`. The `files` published schema therefore continues to expose `file` / `path` (a defect that this BI explicitly leaves untouched per the user's scope statement). A future BI may extend the same `.omit(…)` fix to `files`.

## Verification anchors

- Source-level: `src/tools/paths/schema.ts` line 10 carries the `.omit({ file: true, path: true })` chain.
- Test-level (this BI): `src/tools/paths/index.test.ts` case (2) carries the assertion `expect(Object.hasOwn(props, "file")).toBe(false)` and the same for `path` (the only NEW assertion added by this BI; rest are in-place updates).
- Test-level (deferred): a future BI may add a JSON-Schema-shape comparison test that asserts the emitted JSON Schema's `properties` keys equal the six-key set exactly.
- Baseline: `src/tools/_register-baseline.json` post-roll-forward carries a `{name: "paths", schemaFingerprint: <new-hash>}` entry; the `files` entry's `schemaFingerprint` is byte-stable across the BI.
