# Data Model: Open Vault File

**Branch**: `057-open-vault-file` | **Date**: 2026-05-29
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

The zod input schema is the single source of truth (Principle III); the shapes below are the conceptual model the schema and the eval-result classifier realise.

## Input entity — `OpenFileInput` (`z.infer<typeof openFileInputSchema>`)

| Field | Type | Required | Constraints | Maps to |
|-------|------|----------|-------------|---------|
| `vault` | `string` | Yes | non-empty; ≤ 1000 UTF-16 code units | FR-001; resolved via `resolveVaultPath` |
| `path` | `string` | exactly one of `path`/`file` | non-empty; ≤ 1000; structural-path-safety (no leading `/`,`\`, drive letter, `..`, control chars) | FR-001, FR-013 |
| `file` | `string` | exactly one of `path`/`file` | non-empty; ≤ 1000; no `[[`/`]]` brackets; structural-path-safety | FR-001, FR-004 |
| `new_tab` | `boolean` | No | default `false` | FR-008 |

**Schema rules** (enforced via `.strict()` + `superRefine`):
- `vault` required (no active mode — R4). Missing → `VALIDATION_ERROR`, issue path `["vault"]`.
- Exactly one of `path` / `file`. Both → issues at `["path"]` and `["file"]`. Neither → issue at `[]`. (FR-005)
- `file` containing `[[` or `]]` → issue at `["file"]` naming the brackets and the bare-name shape. (FR-004)
- `path`/`file` failing structural-path-safety → issue at `["path"]`/`["file"]`. (FR-013)
- Unknown extra key → `unrecognized_keys`. (FR-015)
- `new_tab` non-boolean → issue at `["new_tab"]`.

There is **no `target_mode` field** (R4). The schema shape diverges deliberately from the `target_mode`-discriminated cohort.

## Output entity — `OpenFileOutput`

| Field | Type | Meaning |
|-------|------|---------|
| `opened` | `string` | Resolved vault-relative path of the opened file (canonicalised from the supplied locator, FR-003) |
| `vault` | `string` | Echoed requested vault display name |
| `new_tab` | `boolean` | Effective new-tab flag applied |

Identical shape across all recognised file types (FR-009). Echoed for write-verification (FR-016, R6). No file-type field (so callers do not branch on type).

## Internal entity — `OpenEvalResult` (the discriminated eval return)

The composed eval (`composeOpenEval(expectedBase, relPath, newTab)`) returns one of:

| `stage` | Extra fields | Handler maps to |
|---------|--------------|-----------------|
| `"ok"` | `opened: string`, `newTab: boolean` | `OpenFileOutput` success |
| `"vault-not-focused"` | — | `CLI_REPORTED_ERROR` / `details.code: "VAULT_NOT_FOUND"` / `details.reason: "not-open"` |
| `"file-not-found"` | — | `CLI_REPORTED_ERROR` / `details.code: "FILE_NOT_FOUND"` |
| `"unsupported-type"` | `extension: string` | `CLI_REPORTED_ERROR` / `details.code: "UNSUPPORTED_FILE_TYPE"` |

The eval body (R2) in order: normalise+compare `app.vault.adapter.basePath` to `expectedBase` → `app.vault.getAbstractFileByPath(relPath)` (null or non-`TFile`/folder → `file-not-found`) → `app.viewRegistry` extension-registered check (unregistered → `unsupported-type`) → `app.workspace.openLinkText(relPath, "", newTab)` → `ok`. The `=> <json>` echo is stripped by the cohort's `parseEvalStdout`; a malformed/un-parseable result is an `INTERNAL_ERROR` (cohort invariant-violation path), never a silent success.

## Classifier stage order (FR-012a / ADR-014)

```
1. resolveVaultPath(vault) throws (registry miss)  → VAULT_NOT_FOUND / unknown      [TS, before any eval]
2. eval stage "vault-not-focused"                  → VAULT_NOT_FOUND / not-open     [guard, before file resolution]
3. eval stage "file-not-found"                     → FILE_NOT_FOUND
4. eval stage "unsupported-type"                   → UNSUPPORTED_FILE_TYPE
5. eval stage "ok"                                 → success
```

The guard (steps 1–2) precedes file resolution (steps 3–4) so a wrong/unfocused vault never probes the file in the wrong vault and never reports a wrong-vault `FILE_NOT_FOUND` (FR-012a). `file-not-found` precedes `unsupported-type` because a nonexistent file has no type to evaluate.

## State / side effects

- **Success**: exactly one file becomes the focused, active file; `new_tab=true` adds a leaf and preserves the prior focused file's leaf; `new_tab=false` focuses an existing leaf (no duplicate) or the active leaf. The opened file is the active file for subsequent focus-based (active-mode) tool calls (FR-007, SC-002).
- **Any failure** (steps 1–4): no file opened, workspace focus unchanged (FR-017). The typed error is the only observable effect.
- **No filesystem mutation** ever (read-only surface; Obsidian owns the open).
