# `write_note`

## Overview

Create a new note in an Obsidian vault, or replace an existing one when `overwrite: true`. Returns `{ created, path }`. Two target modes: **specific** (caller names the vault + a locator) and **active** (rewrites the currently-focused note).

Writes go directly to the vault filesystem via Node `fs`. The Obsidian CLI is consulted only for small control-plane operations (vault-name → path resolution, post-write `metadataCache` invalidation, optional editor open, focused-file resolution in active mode); user content never crosses the CLI argv pipe. **No wrapper-imposed content size cap.**

## When to use this tool

| You want to | Reach for |
|---|---|
| Create a new note | `write_note` |
| Replace an existing note's full body | `write_note` with `overwrite: true` |
| Append at the end of an existing note | [`append_note`](./append_note.md) |
| Prepend at the start of an existing note (frontmatter-aware) | [`prepend`](./prepend.md) |
| Replace the body under a named heading | [`patch_heading`](./patch_heading.md) |
| Replace the body tied to a `^block-id` | [`patch_block`](./patch_block.md) |
| Create with `template=…` or use `--newtab` | [`obsidian_exec`](./obsidian_exec.md) — template-based creation routes here |
| Edit a single value in YAML frontmatter | [`set_property`](./set_property.md) |
| Rename or move a note | [`rename`](./rename.md) / [`move`](./move.md) |
| Delete a note | [`delete`](./delete.md) |

## Input contract

The schema is strict: `additionalProperties: false`. Unknown top-level keys (notably `template` — see migration below) are rejected with `VALIDATION_ERROR` and `details.issues[0].code = "unrecognized_keys"`. The discriminator is `target_mode`. Per-mode rules surface as `VALIDATION_ERROR`.

### Specific mode

```json
{
  "target_mode": "specific",
  "vault": "<vault name>",
  "path": "<vault-relative path>",
  "content": "<note body>",
  "overwrite": false,
  "open": false
}
```

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `target_mode` | `"specific"` | YES | — | Discriminator. |
| `vault` | string ≥ 1 char | YES | — | Resolved via the lazy vault registry; `vault=Foo` writes under Foo's filesystem path regardless of which vault Obsidian currently has focused. Unknown vault → `VALIDATION_ERROR`. |
| `file` | string ≥ 1 char (structurally safe) | XOR with `path` | — | Vault-root note name. Canonical short-form (no folder separator AND not ending in `.md`) resolves to `<file>.md` at the vault root; any other shape passes through verbatim. See *Canonical short-form `file` resolution* below. |
| `path` | string ≥ 1 char (structurally safe) | XOR with `file` | — | Vault-relative path (e.g. `"Inbox/Idea.md"`). Auto-mkdir of nested parents. Never rewritten by the short-form rule. |
| `content` | string | YES | — | Any size; UTF-8; preserved byte-for-byte. **Never crosses the CLI argv pipe.** |
| `overwrite` | boolean | no | `false` | When `false`, collision returns `FILE_EXISTS` (atomic via the `wx` flag — no TOCTOU window). When `true`, atomic temp+rename replaces the file. |
| `open` | boolean | no | `false` | When `true`, post-write `app.workspace.openLinkText(absPath, "")` opens the file in Obsidian. Best-effort: failure does not fail the call. |

**Canonical short-form `file` resolution.** When `input.file` is supplied without `input.path`, the wrapper applies a literal short-form rule. The input is canonical if it contains no folder separator (`/` or `\`) AND does not end in `.md`. Canonical inputs resolve to `<file>.md` at the vault root and the response's `path` reports the resolved value (e.g. `file: "Daily Note"` → on-disk `<vault-root>/Daily Note.md`, response `path: "Daily Note.md"`). Non-canonical inputs pass through verbatim: `file: "Notes.md"` writes `<vault-root>/Notes.md` and responds with `path: "Notes.md"` (NO double-extension); `file: "Folder/Note"` writes `<vault-root>/Folder/Note` and responds with `path: "Folder/Note"` (no `.md` appended; folder NOT stripped to basename). Internal periods are preserved by `endsWith(".md")` precision — `file: "version_1.2.3"` resolves to `version_1.2.3.md`. Callers wanting deterministic on-disk naming for extension-less inputs supply the canonical shape; callers wanting verbatim layout use `path` instead.

**Path safety.** `file` and `path` are gated by a structural validator (rejects empty strings, leading `/` or `\`, drive-letter prefix `[A-Za-z]:`, any `..` segment, control characters `[\x00-\x1f\x7f]`). At runtime, a canonical-path check via `fs.realpath` catches symlink-escape attempts that pass the structural check; rejection raises `PATH_ESCAPES_VAULT` and emits a typed `pathEscapeAttempt` logger event for operator audit.

### Active mode

```json
{
  "target_mode": "active",
  "content": "<note body>",
  "overwrite": true
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `target_mode` | `"active"` | YES | Discriminator. |
| `content` | string | YES | Any size; UTF-8. |
| `overwrite` | boolean — must be `true` | YES | Active mode is destructive by definition; explicit opt-in required. |
| `vault` / `file` / `path` / `open` | (n/a) | FORBIDDEN | Rejected at schema layer. |

In active mode, the wrapper resolves the focused file's path via a small pre-write `eval` (~120 bytes argv, well under the upstream defect threshold), then writes through the same fs path. No focused note → `ERR_NO_ACTIVE_FILE`.

### Migration from the legacy `write_note`

Two deliberate breaking changes vs. the legacy tool:

1. **`template` is no longer accepted.** Strict-mode rejects with `unrecognized_keys`. Migrate template-based creates to `obsidian_exec`:
   ```json
   {
     "name": "obsidian_exec",
     "arguments": {
       "argv": ["create", "vault=MyVault", "path=Daily/2026-05-10.md", "template=Daily"]
     }
   }
   ```
   Template names are short enough that `obsidian_exec` dodges the upstream argv-IPC defect.
2. **Collision behaviour is now `FILE_EXISTS`.** The legacy tool silently auto-renamed colliding files (`Existing.md` → `Existing 1.md`) and returned `created: true` with the renamed path. The new tool returns a structured `FILE_EXISTS` error. Callers who want create-or-replace semantics MUST pass `overwrite: true`.

The `open` parameter is preserved but is now implemented via a post-write `openLinkText` eval rather than the CLI's `--open` flag. Observable behaviour for callers is the same.

## Output and error contract

### Success envelope

```json
{ "created": true, "path": "Inbox/Idea.md" }
```

| Field | Type | Description |
|---|---|---|
| `created` | boolean | `true` if the write created a fresh file; `false` if it replaced an existing file. |
| `path` | string | The vault-relative path written (echoes the input `file` or `path` verbatim — no auto-rename rewriting). |

The schema is strict: `{ created, path }` exactly, no additional keys.

### Errors

Every failure surfaces as an `UpstreamError` instance.

| Code | When | Recovery |
|---|---|---|
| `VALIDATION_ERROR` | Schema rejection: missing `target_mode`, missing `vault` in specific mode, both/neither `file`/`path`, forbidden key in active mode, active without `overwrite: true`, `template` supplied, structurally-unsafe path, vault not in the registry. | Retry with corrected input. `details.issues` carries per-issue `path` + `message` + zod code. |
| `ERR_NO_ACTIVE_FILE` | Active mode with no focused file in Obsidian. | Ask the user to open a note in the editor, OR call again with `target_mode: "specific"` + explicit vault + `file`/`path`. |
| `FILE_EXISTS` | Specific mode, `overwrite: false`, target path already occupied. | Retry with `overwrite: true` if you want create-or-replace, or pick a different path. `details: { errno: "EEXIST", path, vault }`. |
| `PATH_ESCAPES_VAULT` | Runtime canonical check: input is structurally safe but resolves outside vault root via a symlink. | Do NOT retry (security gate). `details.vault` and `details.attemptedPath` for diagnostic. Fix the path or the symlink target. |
| `FS_WRITE_FAILED` | Generic fs failure: ENOSPC (disk full), EACCES / EPERM (permissions), EROFS (read-only filesystem), EIO, etc. | `details.errno` carries the OS errno; `details.syscall` and `details.path` for diagnostic. Agent may retry on transient errors; user action needed for permission/disk. |
| `CLI_BINARY_NOT_FOUND` | First write triggers the lazy vault-registry probe; the `obsidian` binary is not on `PATH`. | Operator install / `PATH` fix, or set `OBSIDIAN_BIN`. |
| `CLI_REPORTED_ERROR` | First write triggers the lazy vault-registry probe; CLI ran but Obsidian not running (probe couldn't connect to IPC). | Ask the user to open Obsidian and retry. The cache stays unset; the next call retries the probe. |
| `CLI_TIMEOUT` | Vault-registry probe exceeded the 10s typed-tool bound. Rare in practice (probe is ~150 ms). | Operator-side: investigate Obsidian responsiveness. The post-write `metadataCache` invalidation eval-timeout case does NOT surface this code — it is caught silently (the write itself succeeded). |

### Best-effort paths (silent on failure)

Two control-plane evals are best-effort; their failure does NOT fail the call:

- **`metadataCache` invalidation** (post-write, both modes). If the invalidation eval times out or errors, the response still reports the write outcome correctly. Cache freshness defers to Obsidian's file watcher (~200–500 ms eventual consistency).
- **Editor open** (post-write, specific mode + `open: true`). If the open eval fails, the response still reports the write success. Open is a UX nicety, not the contract.

Neither path emits a logger event — only the security-relevant `PATH_ESCAPES_VAULT` rejection emits `pathEscapeAttempt`.

## Upstream rationale

Writes bypass the upstream Obsidian CLI argv-IPC defect that crashes Obsidian for content above ~4 KB on Windows. See <https://forum.obsidian.md/t/cli-windows-json-parse-failure-crashes-obsidians-main-process-when-any-single-argv-element-exceeds-4-kb/114119> for the upstream report.

## Examples

### (i) Specific mode — fresh creation

```json
{
  "name": "write_note",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/Idea.md",
    "content": "# Idea\n\nBody\n"
  }
}
```

Returns `{ "created": true, "path": "Inbox/Idea.md" }`. If `Inbox/Idea.md` already exists → `FILE_EXISTS`.

### (ii) Specific mode — overwrite

```json
{
  "name": "write_note",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/Idea.md",
    "content": "# Idea (revised)\n",
    "overwrite": true
  }
}
```

Atomically replaces (or creates if absent) via temp + rename. Returns `{ "created": false, "path": "Inbox/Idea.md" }` if the file existed before; `{ "created": true, "path": "Inbox/Idea.md" }` if it did not.

### (iii) Active mode — rewrite the focused note

```json
{
  "name": "write_note",
  "arguments": {
    "target_mode": "active",
    "content": "# Replaced body\n",
    "overwrite": true
  }
}
```

Returns `{ "created": false, "path": "<focused-file-vault-relative-path>" }`. If no note is focused → `ERR_NO_ACTIVE_FILE`.

### (iv) Migration: template-based creation (now via `obsidian_exec`)

The legacy form below is **rejected** by the new schema with `VALIDATION_ERROR` (`unrecognized_keys: ["template"]`):

```json
{
  "name": "write_note",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Daily/2026-05-10.md",
    "template": "Daily",
    "content": ""
  }
}
```

Rewrite as:

```json
{
  "name": "obsidian_exec",
  "arguments": {
    "argv": ["create", "vault=MyVault", "path=Daily/2026-05-10.md", "template=Daily"]
  }
}
```
