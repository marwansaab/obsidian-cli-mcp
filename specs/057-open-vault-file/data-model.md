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

## Internal entity — eval envelope (validated by `openEvalResponseSchema`)

The eval is the frozen `JS_TEMPLATE` in `src/tools/open_file/_template.ts`, composed via the shared `composeEvalCode(JS_TEMPLATE, { expectedBase, path, file, new_tab })` (base64 payload, `_shared.ts`, R12 anti-injection — cohort parity with `backlinks/_template.ts`). It returns the cohort-standard `{ok}` discriminated envelope (parity with `backlinks`' `{ok:false, code, detail}`), validated by a zod `openEvalResponseSchema` in `schema.ts`:

| Envelope | Extra fields | Handler maps to |
|----------|--------------|-----------------|
| `{ ok: true }` | `opened: string`, `new_tab: boolean` | `OpenFileOutput` success |
| `{ ok: false, code: "VAULT_NOT_FOCUSED" }` | — | `CLI_REPORTED_ERROR` / `details.code: "VAULT_NOT_FOUND"` / `details.reason: "not-open"` + `details.vault` |
| `{ ok: false, code: "FILE_NOT_FOUND" }` | `detail: string` (the attempted locator) | `CLI_REPORTED_ERROR` / `details.code: "FILE_NOT_FOUND"` + `details.path` + `details.vault` |
| `{ ok: false, code: "UNSUPPORTED_FILE_TYPE" }` | `detail: string` (the extension) | `CLI_REPORTED_ERROR` / `details.code: "UNSUPPORTED_FILE_TYPE"` + `details.extension` + `details.path` + `details.vault` |

The eval body (R2) — a block-body async IIFE — in order: read the base64 payload (`const a = JSON.parse(<b64-decode>)`) → normalise + compare `app.vault.adapter.basePath` to `a.expectedBase` (mismatch → `VAULT_NOT_FOCUSED`) → resolve the file: `path` locator via `app.vault.getFiles().find(x => x.path === a.path)`, `file` locator via `app.metadataCache.getFirstLinkpathDest(a.file, "")` (null / folder → `FILE_NOT_FOUND`) → `app.viewRegistry` extension-registered check (unregistered → `UNSUPPORTED_FILE_TYPE`) → `await app.workspace.openLinkText(f.path, "", a.new_tab)` → `{ ok: true, opened: f.path, new_tab: a.new_tab }`. The handler decodes single-stage (strip the `"=> "` echo → `JSON.parse` → `openEvalResponseSchema.safeParse`, parity with `backlinks`); a malformed/un-parseable result is an `INTERNAL_ERROR` (cohort invariant-violation path), never a silent success.

## Classifier stage order (FR-012a / ADR-014)

```
1. resolveVaultPath(vault) throws (registry miss)      → VAULT_NOT_FOUND / unknown   [TS, before any eval]
2. eval {ok:false, code:"VAULT_NOT_FOCUSED"}           → VAULT_NOT_FOUND / not-open  [guard, before file resolution]
3. eval {ok:false, code:"FILE_NOT_FOUND"}              → FILE_NOT_FOUND
4. eval {ok:false, code:"UNSUPPORTED_FILE_TYPE"}       → UNSUPPORTED_FILE_TYPE
5. eval {ok:true}                                      → success
```

The guard (steps 1–2) precedes file resolution (steps 3–4) so a wrong/unfocused vault never probes the file in the wrong vault and never reports a wrong-vault `FILE_NOT_FOUND` (FR-012a). `FILE_NOT_FOUND` precedes `UNSUPPORTED_FILE_TYPE` because a nonexistent file has no type to evaluate. The ordering is enforced inside the single eval (the `return`s are sequential), so it holds atomically.

## State / side effects

- **Success**: exactly one file becomes the focused, active file; `new_tab=true` adds a leaf and preserves the prior focused file's leaf; `new_tab=false` focuses an existing leaf (no duplicate) or the active leaf. The opened file is the active file for subsequent focus-based (active-mode) tool calls (FR-007, SC-002).
- **Any failure** (steps 1–4): no file opened, workspace focus unchanged (FR-017). The typed error is the only observable effect.
- **No filesystem mutation** ever (read-only surface; Obsidian owns the open).
