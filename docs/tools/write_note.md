# `write_note`

## (a) Purpose

`write_note` creates a new note in an Obsidian vault, or replaces an
existing one when `overwrite: true`. It is the typed write counterpart of
[`read`](./read.md): a single-note write surface with a
discriminated `target_mode` (specific or active) and a structured
`{ created, path }` envelope.

Unlike its predecessor (which routed content through the Obsidian CLI's
`create` subcommand), `write_note` writes content **directly to the vault
filesystem** via Node `fs`. The CLI is still consulted for small control-
plane operations (vault-name → path resolution, post-write
`metadataCache` invalidation, optional editor open, focused-file
resolution in active mode), but user content **never crosses the CLI argv
pipe at any size**. This is the load-bearing change ratified by ADR-009 —
see *(e) Upstream rationale* below.

## (b) When to use / when not to

**Use `write_note` when** you need to write a single note's body to a
known path (specific mode), or rewrite the user's currently-focused note
(active mode). Both fresh creates and overwrites of existing files are
supported.

**Use `obsidian_exec` instead when** you need to invoke a CLI subcommand
whose semantics aren't captured by `write_note`'s contract — most
notably:

- **Template-based creation.** The `template` parameter is **no longer
  accepted** by `write_note` (see *(d) Migration* below). For
  `obsidian create … template=…`, call `obsidian_exec` with the
  `create` subcommand and the `template=…` argv. Template names are
  small enough to dodge the upstream defect.
- The `--newtab` flag, or any other unwrapped `create` flag.

**Don't use `write_note` for** vault-wide search, frontmatter-only
edits, or batch operations — those are separate tools
(`find_by_property`, `read_property`, etc.) or `obsidian_exec`.

## (c) Input contract

The schema is strict: `additionalProperties: false`. Unknown top-level
keys (notably `template` — see migration below) are rejected with
`VALIDATION_ERROR` and `details.issues[0].code = "unrecognized_keys"`.
The discriminator is `target_mode`. Per-mode rules are enforced via
`superRefine` and surface as `VALIDATION_ERROR`.

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
| `file` | string ≥ 1 char (structurally-safe) | XOR with `path` | — | Vault-root note name. Canonical short-form (no folder separator AND not ending in `.md`) resolves to `<file>.md` at the vault root; any other shape passes through verbatim. See *Canonical short-form `file` resolution* below. |
| `path` | string ≥ 1 char (structurally-safe) | XOR with `file` | — | Vault-relative path (e.g. `"Inbox/Idea.md"`). Auto-mkdir of nested parents. Never rewritten by the short-form rule. |
| `content` | string | YES | — | Any size; UTF-8; preserved byte-for-byte. **Never crosses the CLI argv pipe.** |
| `overwrite` | boolean | no | `false` | When `false`, collision returns `FILE_EXISTS` (atomic via the `wx` flag — no TOCTOU window). When `true`, atomic temp+rename replaces the file. |
| `open` | boolean | no | `false` | When `true`, post-write `app.workspace.openLinkText(absPath, "")` opens the file in Obsidian. Best-effort: failure does not fail the call. |

**Canonical short-form `file` resolution**: when `input.file` is supplied
without `input.path`, the handler applies a literal short-form rule. The
input is canonical if it contains no folder separator (`/` or `\`) AND
does not end in `.md`. Canonical inputs resolve to `<file>.md` at the
vault root and the response's `path` reports the resolved value (e.g.
`file: "Daily Note"` → on-disk `<vault-root>/Daily Note.md`, response
`path: "Daily Note.md"`). Non-canonical inputs pass through verbatim:
`file: "Notes.md"` writes `<vault-root>/Notes.md` and responds with
`path: "Notes.md"` (NO double-extension); `file: "Folder/Note"` writes
`<vault-root>/Folder/Note` and responds with `path: "Folder/Note"` (no
`.md` appended; folder NOT stripped to basename). Internal periods are
preserved by `endsWith(".md")` precision — `file: "version_1.2.3"`
resolves to `version_1.2.3.md`. Callers wanting deterministic on-disk
naming for extension-less inputs supply the canonical shape; callers
wanting verbatim layout use `path` instead.

**Path safety**: `file` and `path` are gated by a structural validator
(rejects empty strings, leading `/` or `\`, drive-letter prefix `[A-Za-z]:`,
any `..` segment, control characters `[\x00-\x1f\x7f]`). At runtime, a
canonical-path check via `fs.realpath` catches symlink-escape attempts
that pass the structural check; rejection raises `PATH_ESCAPES_VAULT`
and emits a typed `pathEscapeAttempt` logger event for operator audit.

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
| `overwrite` | boolean — must be `true` | YES | Active mode is destructive by definition; explicit-opt-in posture binds uniformly. |
| `vault` / `file` / `path` / `open` | (n/a) | FORBIDDEN | Rejected at schema layer. |

In active mode, `write_note` resolves the focused file's path via a
small bug-safe pre-write `eval` (~120 bytes argv, well under the
upstream defect threshold), then writes through the same fs path. No
focused note → `ERR_NO_ACTIVE_FILE`.

### (d) Migration from the predecessor

Two deliberate breaking changes vs. the legacy `write_note`:

1. **`template` is no longer accepted.** Strict-mode rejects with
   `unrecognized_keys`. Migrate template-based creates to
   `obsidian_exec`:
   ```json
   {
     "name": "obsidian_exec",
     "arguments": {
       "argv": ["create", "path=Daily/2026-05-10.md", "template=Daily"]
     }
   }
   ```
   Template names are short enough that `obsidian_exec` dodges the
   upstream argv-IPC defect.
2. **Collision behaviour is now `FILE_EXISTS`.** The legacy tool
   silently auto-renamed colliding files (`Existing.md` → `Existing 1.md`)
   and returned `created: true` with the renamed path. The new tool
   returns a structured `FILE_EXISTS` error. Callers who want
   create-or-replace semantics MUST pass `overwrite: true`.

The `open` parameter is preserved but is now implemented via a post-
write `openLinkText` eval rather than the CLI's `--open` flag.
Observable behaviour for callers is the same.

## (d) Output and error contract

### Success envelope

```json
{ "created": true, "path": "Inbox/Idea.md" }
```

| Field | Type | Description |
|---|---|---|
| `created` | boolean | `true` if the write created a fresh file; `false` if it replaced an existing file. |
| `path` | string | The vault-relative path written (echoes the input `file` or `path` verbatim — no auto-rename rewriting). |

The schema is strict: `{ created, path }` exactly, no additional keys.

### Error roster

Every failure surfaces as an `UpstreamError` instance via the
`registerTool` factory's existing pipeline.

| Code | When | Recovery |
|---|---|---|
| `VALIDATION_ERROR` | Schema rejection: missing `target_mode`, missing `vault` in specific mode, both/neither `file`/`path`, forbidden key in active mode, active without `overwrite: true`, `template` supplied, structurally-unsafe path, vault not in the registry. | Agent retries with corrected input. `details.issues` carries per-issue `path` + `message` + zod code. |
| `ERR_NO_ACTIVE_FILE` | Active mode with no focused file in Obsidian. | Open a note in editor, or call again with `target_mode: "specific"` + explicit vault + `file`/`path`. |
| `FILE_EXISTS` | Specific mode, `overwrite: false`, target path already occupied. | Retry with `overwrite: true` if appropriate, or pick a different path. `details: { errno: "EEXIST", path, vault }` — `errno` is the standard POSIX errno name (field-name parity with `FS_WRITE_FAILED`'s `details.errno`; additive — the existing `path` and `vault` fields are preserved). `details.path` carries the offending vault-relative path; `details.vault` carries the vault name (or `null`). |
| `PATH_ESCAPES_VAULT` | Runtime canonical check: input is structurally safe but resolves outside vault root via a symlink. | Agent should NOT retry (security gate). `details.vault` and `details.attemptedPath` for diagnostic. Logger emits a typed `pathEscapeAttempt` event for operator audit. |
| `FS_WRITE_FAILED` | Generic fs failure: ENOSPC (disk full), EACCES / EPERM (permissions), EROFS (read-only filesystem), EIO, etc. | `details.errno` carries the OS errno; `details.syscall` and `details.path` for diagnostic. Agent may retry on transient errors; user action needed for permission/disk. |
| `CLI_BINARY_NOT_FOUND` | First write triggers the lazy vault-registry probe; the `obsidian` binary is not on `PATH`. | Operator install / `PATH` fix, or set `OBSIDIAN_BIN`. |
| `CLI_REPORTED_ERROR` | First write triggers the lazy vault-registry probe; CLI ran but Obsidian not running (probe couldn't connect to IPC). | Open Obsidian and retry. The cache stays unset; the next call retries the probe. |
| `CLI_TIMEOUT` | Vault-registry probe exceeded the 10s typed-tool bound. Rare in practice (probe is ~150ms). | Operator-side: investigate Obsidian responsiveness. The post-write `metadataCache` invalidation eval-timeout case does NOT surface this code — it's caught silently per FR-011 (the write succeeded). |

### Best-effort paths (silent on failure)

Two control-plane evals are best-effort; their failure does NOT fail
the call:

- **`metadataCache` invalidation** (post-write, both modes). If the
  invalidation eval times out or errors, the response still reports
  the write outcome correctly. Cache freshness defers to Obsidian's
  file watcher (~200–500 ms eventual consistency).
- **Editor open** (post-write, specific mode + `open: true`). If the
  open eval fails, the response still reports the write success. Open
  is a UX nicety, not the contract.

Neither path emits a logger event — only the security-relevant
`PATH_ESCAPES_VAULT` rejection emits `pathEscapeAttempt`.

## (e) Upstream rationale

The legacy `write_note` crashed Obsidian's main process for any content
above ~4 KB on Windows. The trigger was an upstream argv→IPC chunk-
boundary defect in the Obsidian CLI: when any single argv element
exceeded the chunk size, the parent process's JSON parse over the IPC
stream failed and crashed the entire main process, taking the whole
Obsidian instance down. The defect is filed at:

<https://forum.obsidian.md/t/cli-windows-json-parse-failure-crashes-obsidians-main-process-when-any-single-argv-element-exceeds-4-kb/114119>

An eval-bypass workaround was prototyped during the spec phase and
empirically refuted on 2026-05-10: both `obsidian create` and
`obsidian eval` crash equally above the same per-argv-element
threshold. The workaround was abandoned in favour of the design
ratified by [ADR-009](../../.decisions/ADR-009%20-%20Direct%20Filesystem%20Write%20Path%20Alongside%20CLI%20Bridge.md):
direct filesystem writes via Node `fs`, with the Obsidian CLI
consulted only for small control-plane operations whose argv stays
under 250 bytes — orders of magnitude below the upstream IPC ceiling.

## (f) Worked examples

### Specific mode — fresh creation

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

Returns `{ "created": true, "path": "Inbox/Idea.md" }`. If
`Inbox/Idea.md` already exists → `FILE_EXISTS`.

### Specific mode — overwrite

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

Atomically replaces (or creates if absent) via temp + rename. Returns
`{ "created": false, "path": "Inbox/Idea.md" }` if the file existed
before; `{ "created": true, "path": "Inbox/Idea.md" }` if it did not.

### Active mode — rewrite the focused note

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

Returns `{ "created": false, "path": "<focused-file-vault-relative-path>" }`.
If no note is focused → `ERR_NO_ACTIVE_FILE`.

### Migration: template-based creation (now via `obsidian_exec`)

The legacy form below is **rejected** by the new schema with
`VALIDATION_ERROR` (`unrecognized_keys: ["template"]`):

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

## References

- [ADR-009 — Direct Filesystem Write Path Alongside CLI Bridge](../../.decisions/ADR-009%20-%20Direct%20Filesystem%20Write%20Path%20Alongside%20CLI%20Bridge.md) — the architectural decision the new `write_note` implements.
- [Upstream forum bug](https://forum.obsidian.md/t/cli-windows-json-parse-failure-crashes-obsidians-main-process-when-any-single-argv-element-exceeds-4-kb/114119) — the BI-038 defect motivating the pivot.
- [016-reliable-writer spec](../../specs/016-reliable-writer/spec.md) — feature spec, FR-001..FR-029, success criteria.
- [target-mode primitive spec](../../specs/004-target-mode-schema/spec.md) — the discriminator the input schema reuses.
- [obsidian_exec](./obsidian_exec.md) — freeform CLI escape hatch retained for `template=` and any other unwrapped subcommand.
- [read](./read.md) — symmetric typed read tool.
- [help tool](./help.md) — surfaces this document via `help({ tool_name: "write_note" })`.
