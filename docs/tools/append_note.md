# `append_note`

## Overview

Add content to the END of an existing markdown note in a single MCP call. Eliminates the read-then-rewrite cycle that would otherwise force callers to ship the whole note through the full-replace surface every time they want to add a journal line, a list item, or a log entry.

**Supported file types: notes only.** Note text appended to a canvas, base or attachment would corrupt it, so a target of any other type is rejected with `VALIDATION_ERROR` + `details.code: "UNSUPPORTED_FILE_TYPE"` before anything is read or written (spec 070).

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
| `vault` | string ≥ 1 char | iff specific | Resolved against the wrapper's vault registry. Unknown vault → `VALIDATION_ERROR` with `details.requestedVault` / `details.knownVaults`. |
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

**File-type check.** Once the target is known — the `path` as given, the path the `file` resolver returned, or the focused file's path — the wrapper checks that it is a `.md` note (matched case-insensitively). A canvas, base, attachment, extensionless path or any other file is rejected with `UNSUPPORTED_FILE_TYPE` before the note is read or written. Resolution failures (`VAULT_NOT_FOUND`, a `file` name that does not resolve, `ERR_NO_ACTIVE_FILE`) surface first. For a `path` the check runs before any existence check, so a missing `Boards/Plan.canvas` reports `UNSUPPORTED_FILE_TYPE`, not `NOTE_NOT_FOUND`. Example message: `append_note: Boards/Plan.canvas is a canvas (.canvas); append_note supports notes. Nothing was changed.`

## Output envelope

```typescript
interface AppendNoteOutput {
  path: string;            // Canonical vault-relative path of the written note
  vault: string;           // Vault display name (specific mode echo, or resolved reverse-lookup in active mode)
  bytes_written: number;   // Size change: size after the write minus size before
  inline: boolean;         // Echo of the inline mode applied
}
```

- `path` is ALWAYS canonical: a caller who supplied `file: "tasks"` receives `path: "tasks.md"` (whatever the resolver yields).
- `bytes_written` is the change in the note's size in bytes caused by this write: its size after the write minus its size before, counting a note that did not exist as 0. Zero when the size did not change; negative when the note shrank. For `append_note` it is always at least 1. It exactly equals `content.length` when the file's existing trailing newline IS the separator, or when `inline: true` suppresses the separator. Equals `content.length + separator_bytes` (1 byte for LF, 2 for CRLF) when a separator is inserted. To verify a write, compare `bytes_written` with the size change you intended; 0 and negative values are normal for same-size and shrinking edits by the other writers (`patch_heading`, `patch_block`, `write_note`).
- `inline` is `false` for default calls (input `inline: false` or omitted), `true` for input `inline: true`.

## Errors — Error states

| Top-level `code` | `details.code` / `details.reason` | Trigger | Recovery |
|---|---|---|---|
| `VALIDATION_ERROR` | `details.code: CONTENT_EMPTY` | Empty content. The top-level `message` is the schema's own text, `Too small: expected string to have >=1 characters`, and the generic `details.issues` list is kept beside `details.code`. | Supply non-empty content. |
| `VALIDATION_ERROR` | (Zod issue path on the offending field) | Bracket-rejection on `file`, locator-mutex (`file` AND `path`), unknown extra field, structural path safety, type mismatch on `inline`. | Read `details.issues[].message` for the field-level fix. |
| `VALIDATION_ERROR` | `details.code: UNSUPPORTED_FILE_TYPE`, `details.reason: "unsupported-type"` | The resolved target is not a `.md` note (a canvas, base, attachment, extensionless path or other file). Raised before the note is read or written. `details` also carries `path` (the resolved vault-relative path), `extension` (original case, `""` if none) and `supported: ["note"]`. | Nothing was changed. Target a `.md` note. |
| `CLI_REPORTED_ERROR` | `details.code: NOTE_NOT_FOUND` | The target file does not exist. | Recheck the path. Use [`write_note`](./write_note.md) if you meant to create a new note (`append_note` does NOT auto-create). |
| `CLI_REPORTED_ERROR` | `details.code: EXTERNAL_EDITOR_CONFLICT`, `details.reason: "file-locked"` | Windows sharing-violation (`EBUSY` / `EPERM` / `EACCES`) — the file is held open by an external editor. | Ask the user to save and close the file in the editor, then retry. |
| `PATH_ESCAPES_VAULT` | — | The resolved path escapes the vault root (symlink traversal, `..` segments). The message is the generic `CLI bridge upstream error: PATH_ESCAPES_VAULT`; `details: { vault, attemptedPath, resolvedPath }`. | Fix the path. The path must resolve inside the vault. |
| `FS_WRITE_FAILED` | — | Filesystem errno other than the editor-conflict / ENOENT cohort (`ENOSPC`, `EROFS`, `EISDIR`, etc.). | Inspect `details.errno`; surface a user-facing message naming the underlying cause. |
| `VALIDATION_ERROR` | `details.requestedVault`, `details.knownVaults` | The supplied `vault` display name is not registered with Obsidian. Message `Vault "<name>" is not registered with Obsidian.`; `details: { requestedVault, knownVaults }`. Nothing is read or written. | Recheck the vault name (case-sensitive) against `details.knownVaults`, or list the registered vaults with the [`vaults`](./vaults.md) tool. |
| `CLI_REPORTED_ERROR` | `details.code: VAULT_NOT_FOUND`, `details.reason: "folder-missing"` | The vault is registered, but its folder is missing on disk (`details.vault`; no disk path in the message). Nothing is read or written. | Ask the user to restore the folder, or re-open the vault in Obsidian, then call again. |
| `CLI_REPORTED_ERROR` | `details.code: VAULT_NOT_FOUND`, `details.reason: "focused-unregistered"` | Active mode, and the focused vault's folder matches no vault Obsidian lists (no disk path in the message or `details`). Nothing is read or written. | Call again in specific mode with `vault`, or ask the user to re-open the vault in Obsidian. |
| `CLI_REPORTED_ERROR` | `details.stage: "vault-root-check"` | The vault's folder could not be checked for another reason (`details.errno`, `details.vault`). Nothing is read or written. | Inspect `details.errno` (for example a permission problem); fix it, then call again. |
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

## Examples

### Example 1 — append a line

```json
{ "target_mode": "specific", "vault": "Work", "path": "Inbox/log.md", "content": "- 14:05 call with Sam" }
```

`Inbox/log.md` already ends with a newline, so no separator is added and `bytes_written` equals the content's 21 bytes:

```json
{ "path": "Inbox/log.md", "vault": "Work", "bytes_written": 21, "inline": false }
```

### Example 2 — empty content is rejected

```json
{ "target_mode": "specific", "vault": "Work", "path": "Inbox/log.md", "content": "" }
```

Nothing is written. The call fails before the note is read:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Too small: expected string to have >=1 characters",
  "details": {
    "code": "CONTENT_EMPTY",
    "issues": [
      { "path": ["content"], "message": "Too small: expected string to have >=1 characters", "code": "too_small" }
    ]
  }
}
```

## Out of scope

- Auto-creating a new note → use [`write_note`](./write_note.md) (`append_note` does NOT auto-create).
- Adding content at the START of a note → use [`prepend`](./prepend.md).
- Writing under a named heading → use [`patch_heading`](./patch_heading.md).
- Writing tied to a `^block-id` marker → use [`patch_block`](./patch_block.md).
