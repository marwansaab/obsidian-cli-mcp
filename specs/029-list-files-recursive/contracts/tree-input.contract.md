# Contract — `tree` input

**Surface**: typed MCP tool `tree`
**Branch**: `029-list-files-recursive`
**Status**: locked at /speckit-plan; consumed by `/speckit-tasks` and `/speckit-implement`.

This document is the source-of-truth for the `tree` tool's public input shape. It is the contract that downstream callers depend on; any change here is a published-surface change and triggers the registry-baseline JSON roll-forward (FR-018 from BI-022).

## Zod schema (canonical)

```typescript
const treeInputSchema = targetModeBaseSchema.extend({
  folder: z.string().optional(),
  depth: z.number().int().positive().optional(),
  ext: z.string().optional(),
  total: z.boolean().optional().default(false),
}).strict().superRefine((data, ctx) => {
  applyTargetModeRefinement(data, ctx, {
    forbidFileLocator: true,
    folderScoped: true,
  });
});
```

The schema is the single source of truth for the published `inputSchema` (via `zod-to-json-schema` at registration time) AND the runtime parse (Constitution Principle III).

## Emitted JSON Schema (rendered)

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "target_mode": { "type": "string", "enum": ["specific", "active"] },
    "vault": { "type": "string" },
    "folder": { "type": "string" },
    "depth": { "type": "integer", "minimum": 1 },
    "ext": { "type": "string" },
    "total": { "type": "boolean", "default": false }
  },
  "required": ["target_mode"]
}
```

`additionalProperties: false` rejects unknown top-level keys at the schema level (FR-009). The `vault` / `file` / `path` field-presence rules are enforced via `superRefine` and surface as `VALIDATION_ERROR` with a field-path-naming message — NOT as JSON-Schema rejections (zod's `superRefine` does not emit into the JSON Schema by design).

## Field policy

| Field | Policy |
|---|---|
| `target_mode` | Required. `"specific"` or `"active"`. Standard ADR-003 discriminator. |
| `vault` | Required in specific mode; FORBIDDEN in active mode. String. No max length (vault display names are operator-controlled). |
| `folder` | Optional in both modes. String. Trailing slash silently normalised (FR-014). When omitted, the tool traverses from the vault root. |
| `depth` | Optional in both modes. Positive integer (`>= 1`). Zero, negative, non-integer, non-numeric values are rejected at the schema layer with `VALIDATION_ERROR`. When omitted, traversal is unbounded. |
| `ext` | Optional in both modes. String. Leading-dot form (`.md`) and bare form (`md`) are equivalent (FR-007). When omitted, both files and folders appear in `paths`; when set, only matching files appear (folders excluded). |
| `total` | Optional in both modes. Boolean, default `false`. When `true`, response carries `count` only and `paths === []`. |
| `file` | NEVER permitted. Presence in any mode → `VALIDATION_ERROR` (FR-004). |
| `path` | NEVER permitted. Presence in any mode → `VALIDATION_ERROR` (FR-004). |

## Worked examples

### Example A — Whole-vault recursive listing (specific mode)

```json
{ "target_mode": "specific", "vault": "Demo" }
```

Returns the full subtree of vault `Demo` (every file and folder, folders carry `/`). Sorted byte-asc.

### Example B — Sub-folder subtree listing (specific mode)

```json
{ "target_mode": "specific", "vault": "Demo", "folder": "Inbox" }
```

Returns every file and folder beneath `Inbox/` (the starting folder itself is not returned). Folders carry `/`.

### Example C — Depth-limited overview from vault root (specific mode)

```json
{ "target_mode": "specific", "vault": "Demo", "depth": 1 }
```

Returns only the immediate children of the vault root. Folders carry `/`.

### Example D — Sub-folder + depth (specific mode)

```json
{ "target_mode": "specific", "vault": "Demo", "folder": "Projects", "depth": 2 }
```

Returns paths at depths 1 and 2 from `Projects/`.

### Example E — Extension filter on whole-vault (specific mode)

```json
{ "target_mode": "specific", "vault": "Demo", "ext": "md" }
```

Returns only `.md` files; folder entries are excluded from `paths`.

### Example F — Active-mode whole-vault listing

```json
{ "target_mode": "active" }
```

Returns the full subtree of the currently focused vault.

### Example G — Count-only mode (specific)

```json
{ "target_mode": "specific", "vault": "Demo", "total": true }
```

Returns `{ count: <N>, paths: [] }` where `<N>` is the count after all filtering.

### Example H — Composed: active + sub-folder + ext + depth + total

```json
{ "target_mode": "active", "folder": "Archive", "ext": "md", "depth": 3, "total": true }
```

Returns the count of `.md` files at depths 1..3 beneath `Archive/` in the focused vault; `paths === []`.

## Error response roster

| Source | Top-level code | `details.code` | `details.reason` | Trigger |
|---|---|---|---|---|
| Schema validation | `VALIDATION_ERROR` | — | — | Any input shape violating the field policy (US7 scenarios 1–9). |
| Dispatch | `CLI_REPORTED_ERROR` | `VAULT_NOT_FOUND` | `unknown` | Vault display name does not match any registered vault. Inherited from 011-R5 inspection clause. |
| Dispatch | `CLI_REPORTED_ERROR` | `VAULT_NOT_FOUND` | `not-open` | Vault is registered but closed; eval returned empty stdout + transparent-open. Synthesised by `_eval-vault-closed-detection/` shared module (4th consumer). |
| Handler | `CLI_REPORTED_ERROR` | (stage: `json-parse`) | — | The eval-template stdout was not valid JSON (developer-side bug). |
| Handler | `CLI_REPORTED_ERROR` | (stage: `envelope-parse`) | — | The parsed JSON did not match the envelope schema (developer-side bug). |
| Handler | `CLI_REPORTED_ERROR` | `FOLDER_NOT_FOUND` (stage: `envelope-error`) | — | The starting folder does not exist (in-eval `stat()` returned null). |
| Handler | `CLI_REPORTED_ERROR` | `NOT_A_FOLDER` (stage: `envelope-error`) | — | The starting folder path resolves to a file (in-eval `stat().type === "file"`). |
| Handler | `ERR_NO_ACTIVE_FILE` | — | — | Active mode and no Obsidian instance reachable. Inherited from the cli-adapter's dispatch-layer classifier. |
| Adapter | output-cap-exceeded (`CLI_NON_ZERO_EXIT`) | — | — | Serialised `paths` array exceeded the typed-tool output cap. Inherited from BI-003 cap mechanism. |

**Zero new top-level error codes.** `FOLDER_NOT_FOUND` and `NOT_A_FOLDER` are NEW `details.code` values under the existing `CLI_REPORTED_ERROR` top-level code (per ADR-015 sub-discriminator pattern). The twelve-tool-and-counting zero-new-top-level-codes streak is preserved.

## Out-of-scope upstream surfaces

| Upstream parameter / shape | Status | Rationale |
|---|---|---|
| Native `files` subcommand | Not used | Returns recursive flat FILE list only; no folder entries. F1. |
| Native `folders` subcommand | Not used | Returns recursive flat FOLDER list only; no file entries. F2. |
| `files format=json` | N/A | Help text does not list `format=json` for `files`; previous BI-019 claim contradicted by direct probe — not relevant to BI-029 in any case (eval-route used). |
| `folders folder=X` for sub-folder | Not used | F2; combining with `files folder=X` requires two spawns. |
| `app.vault.getAbstractFileByPath` | Not used | Returns minified class instances in production; the `app.vault.adapter.stat()` trichotomy (F6) is cleaner. |
| `app.vault.adapter.exists` | Not used (in primary path) | `stat()` provides existence AND type in one call; `exists` only returns boolean. |
| Symlinks | Pass-through | Whatever `app.vault.adapter.list()` does, the wrapper accepts. Out-of-scope per spec Assumptions. |
| Permission-denied entries | Pass-through | Whatever `app.vault.adapter.list()` does, the wrapper accepts. Out-of-scope per spec Assumptions. |

## Multi-vault inherited limitation

The `vault=` parameter is honoured by `eval` per F4 / F8 / F9 (the cli-adapter routes the eval into the named vault's `app` instance). Multi-vault users open the target vault before invoking via `target_mode: "active"`; OR they pass the vault display name via `target_mode: "specific", vault: "Demo"`. There is NO basename-ambiguity surface (different from BI-019, where folder paths could collide across vaults — eval scopes to a single vault by design). This is documented in the published tool documentation.

## Documentation surface

The published tool documentation lives at `docs/tools/tree.md` (post-022 single-word naming convention). It carries:
- Per-field input contract.
- Both output-shape branches (`total: false` vs `total: true`).
- Trailing-slash discrimination rule (FR-028).
- Folder-vs-file inclusion rule (FR-007).
- Depth-bounding semantics (FR-006 / FR-012).
- Failure-mode roster (this contract's Error response roster).
- Worked examples (this contract's Examples A–H, minimum 4 covered).
- Multi-vault routing note (inherited limitation; uses `vault=` per request).
