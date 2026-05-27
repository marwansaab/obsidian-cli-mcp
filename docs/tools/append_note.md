# `append_note`

## Overview

Add content to the END of an existing markdown note in a single MCP call. Eliminates the read-then-rewrite cycle that would otherwise force callers to ship the whole note through the full-replace surface every time they want to add a journal line, a list item, or a log entry.

## When to use this tool

| You want to | Reach for |
|---|---|
| Add one or more lines at the **end** of an existing note | `append_note` |
| Add one or more lines at the **start** of an existing note | [`prepend`](./prepend.md) |
| Create a new note (or wholesale-replace one) | [`write_note`](./write_note.md) |
| Replace the body under a named heading | [`patch_heading`](./patch_heading.md) |
| Replace the body tied to a `^block-id` marker | [`patch_block`](./patch_block.md) |
| Find/replace text patterns across many regions | [`find_and_replace`](./find_and_replace.md) |
| Edit a value in YAML frontmatter | [`set_property`](./set_property.md) |

## Input schema

The schema is strict: `additionalProperties: false`. Unknown fields trigger `VALIDATION_ERROR`.

### Specific mode

```json
{
  "target_mode": "specific",
  "vault": "<vault display name>",
  "path": "<vault-relative path>",
  "content": "<bytes to append>",
  "inline": false
}
```

Or by wikilink-form bare name:

```json
{
  "target_mode": "specific",
  "vault": "<vault display name>",
  "file": "<bare note name, no [[…]] brackets>",
  "content": "<bytes to append>"
}
```

### Active mode

```json
{
  "target_mode": "active",
  "content": "<bytes to append>"
}
```

The wrapper resolves the focused note via a small `obsidian eval` call. **NO opt-in flag is required** for active mode — append is additive and cannot destroy content (a wrong target produces recoverable additive noise, not destruction).

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `target_mode` | `"specific" \| "active"` | YES | Discriminator. |
| `vault` | string ≥ 1 char | iff specific | Resolved against the wrapper's vault registry. Unknown vault → `VAULT_NOT_FOUND`. |
| `file` | string ≥ 1 char (structurally safe; no `[[` / `]]`) | XOR with `path`, iff specific | Wikilink-form bare name. A pre-flight `obsidian file` TSV resolver call canonicalises the name to a vault-relative path before the write lands. |
| `path` | string ≥ 1 char (structurally safe) | XOR with `file`, iff specific | Vault-relative path. Brackets are NOT a special case here (legal in note names). |
| `content` | string, ≥ 1 char | YES | Non-empty required. Preserved byte-for-byte (no trim, no normalisation, no auto-appended trailing newline — the caller controls whether the file ends with a newline after the call). No wrapper-imposed size cap. |
| `inline` | boolean | NO (default `false`) | When `true`, suppresses the inserted separator between the existing trailing byte and your appended content. |

## Separator behaviour

The wrapper inspects the file's last byte to decide whether to insert a separator before `content`:

| File ends with | Default `inline: false` behaviour | `inline: true` behaviour |
|---|---|---|
| Non-newline (e.g. `…Partial`) | A separator matching the file's existing line-ending convention (LF or CRLF) is inserted before `content`. | NO separator inserted — content fuses directly onto the trailing line. |
| `\n` (LF-trailing) | The existing `\n` IS the separator — no additional separator inserted. | Same — `content` lands immediately after the existing `\n`. |
| `\r\n` (CRLF-trailing) | The existing `\r\n` IS the separator. | Same. |
| 0 bytes (empty file) | No leading separator. | Same. |

The "existing trailing line break IS the separator" rule is load-bearing for repeated appends: both the line-builder pattern (`content` without trailing newline) and the paragraph-builder pattern (`content` with trailing newline) produce clean byte-stable concatenation under repeated default-mode appends.

**Worked examples.**

- `existing = "abc"`, `content = "def"`, default → `"abc\ndef"` (separator inserted).
- `existing = "abc\n"`, `content = "def"`, default → `"abc\ndef"` (existing `\n` IS the separator; no double newline).
- `existing = "abc\r\n"`, `content = "def"`, default → `"abc\r\ndef"` (CRLF preserved).
- `existing = ""`, `content = "def"`, default → `"def"`.

## Inline opt-in

`inline: true` fuses `content` directly onto the file's existing trailing byte with NO inserted separator. Use case: finishing a partial trailing line, or building up a composite line across multiple calls.

**Example.** `existing = "Working on something — Partial"`, `content = "Tail and now finished."`, `inline: true` → `"Working on something — PartialTail and now finished."`.

## Locator shapes

Two locator shapes in specific mode:

- **`path`** — vault-relative file path (e.g. `"Sandbox/journal-2026-05-25.md"`). Fed verbatim into the canonical-path safety check.
- **`file`** — bare wikilink-form note name (e.g. `"tasks"`, NOT `"[[tasks]]"`). The wrapper performs a pre-flight `obsidian file file=<name>` TSV resolver call to canonicalise the name to a vault-relative path; the response's `path` field carries that canonical path.

Wikilink-form brackets are rejected at the schema layer: `[[…]]` pairs trigger `VALIDATION_ERROR` with the message *"wikilink-form locator MUST NOT contain `[[` or `]]` brackets — supply the bare note name (e.g. `My Note` not `[[My Note]]`)"*. Single brackets (e.g. `[draft]`) are legal in note names and not rejected.

Active mode (`target_mode: "active"`) supplies neither `file` nor `path`; the wrapper resolves the currently-focused note via eval.

## Output envelope

```typescript
interface AppendNoteOutput {
  path: string;            // Canonical vault-relative path of the written note
  vault: string;           // Vault display name (specific mode echo, or resolved reverse-lookup in active mode)
  bytes_written: number;   // Delta: post-edit file size minus pre-edit file size
  inline: boolean;         // Echo of the inline mode applied
}
```

- `path` is ALWAYS canonical: a caller who supplied `file: "tasks"` receives `path: "tasks.md"` (whatever the resolver yields).
- `bytes_written` is the wrapper-observed byte-count delta. Exactly equals `content.length` when the file's existing trailing newline IS the separator, or when `inline: true` suppresses the separator. Equals `content.length + separator_bytes` (1 byte for LF, 2 for CRLF) when a separator is inserted.
- `inline` is `false` for default calls (input `inline: false` or omitted), `true` for input `inline: true`.

## Error states

| Top-level `code` | `details.code` / `details.reason` | Trigger | Recovery |
|---|---|---|---|
| `VALIDATION_ERROR` | `details.code: CONTENT_EMPTY` | Empty content. | Supply non-empty content. |
| `VALIDATION_ERROR` | (Zod issue path on the offending field) | Bracket-rejection on `file`, locator-mutex (`file` AND `path`), unknown extra field, structural path safety, type mismatch on `inline`. | Read `details.issues[].message` for the field-level fix. |
| `CLI_REPORTED_ERROR` | `details.code: NOTE_NOT_FOUND` | The target file does not exist. | Recheck the path. Use [`write_note`](./write_note.md) if you meant to create a new note (`append_note` does NOT auto-create). |
| `CLI_REPORTED_ERROR` | `details.code: EXTERNAL_EDITOR_CONFLICT`, `details.reason: "file-locked"` | Windows sharing-violation (`EBUSY` / `EPERM` / `EACCES`) — the file is held open by an external editor. | Ask the user to save and close the file in the editor, then retry. |
| `PATH_ESCAPES_VAULT` | — | The resolved path escapes the vault root (symlink traversal, `..` segments). | Fix the path. The path must resolve inside the vault. |
| `FS_WRITE_FAILED` | — | Filesystem errno other than the editor-conflict / ENOENT cohort (`ENOSPC`, `EROFS`, `EISDIR`, etc.). | Inspect `details.errno`; surface a user-facing message naming the underlying cause. |
| `VAULT_NOT_FOUND` | — | The supplied `vault` display name is not registered with the Obsidian CLI. | Recheck the vault name (case-sensitive). The user can list registered vaults with `obsidian vaults`. |
| `ERR_NO_ACTIVE_FILE` | — | Active mode but no note is focused in Obsidian. | Switch to specific mode with explicit `vault` + `file`/`path`, OR ask the user to open a note first. |

## Size ceiling

**No wrapper-imposed cap.** Content size is bounded by available memory and the filesystem's max-file-size limit; for realistic notes (≤ 100 MB), no caller-visible ceiling applies. May change in a future release if a use case for tighter bounds emerges.

## Platform-specific behaviour: EXTERNAL_EDITOR_CONFLICT

Detection of external-editor conflicts is platform-divergent:

- **Windows**: the substrate signals editor-conflict via `EBUSY` / `EPERM` / `EACCES` when an editor holds the file with non-shared-delete access.
- **Linux / macOS**: no analogous signal for in-memory-only dirty state. The append lands on disk and the external editor sees a refreshed file on next focus.

Callers automating against multi-platform deployments must plan around the divergence.

## Atomicity and concurrent calls

A single `append_note` invocation does not leave the note on disk in a half-written state — the write is atomic (temp-then-rename). Two concurrent `append_note` calls against the same note resolve **last-write-wins**. Callers needing stronger guarantees coordinate externally.

## Out of scope

- Auto-creating a new note → use [`write_note`](./write_note.md) (`append_note` does NOT auto-create).
- Adding content at the START of a note → use [`prepend`](./prepend.md).
- Writing under a named heading → use [`patch_heading`](./patch_heading.md).
- Writing tied to a `^block-id` marker → use [`patch_block`](./patch_block.md).
