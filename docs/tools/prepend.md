# `prepend`

## Overview

`prepend` writes the caller's `content` payload at the LOGICAL top of an existing markdown note in a single MCP call. It is the symmetric sibling of [`append_note`](./append_note.md): where `append_note` lands bytes at the END of the file, `prepend` lands them at the START — with frontmatter-aware placement.

When the target note has a YAML frontmatter block (opening `---`, body, closing `---`), the prepended content lands IMMEDIATELY AFTER the closing `---` and the frontmatter is preserved byte-for-byte. When no frontmatter is present, the content lands at byte zero. This eliminates the read-then-rewrite cycle for adding a TL;DR line, a status block, or a header pre-amble, and eliminates the metadata-corruption risk of a naive byte-zero prepend that would tear the YAML frontmatter apart.

## When to use this tool

| You want to | Reach for |
|---|---|
| Add one or more lines at the **start** of an existing note (after any frontmatter) | `prepend` |
| Add one or more lines at the **end** of an existing note | [`append_note`](./append_note.md) |
| Create a new note (or wholesale-replace one) | [`write_note`](./write_note.md) |
| Replace the body under a named heading | [`patch_heading`](./patch_heading.md) |
| Replace the body tied to a `^block-id` marker | [`patch_block`](./patch_block.md) |
| Find/replace text patterns across many regions | [`find_and_replace`](./find_and_replace.md) |
| Edit a value in YAML frontmatter | [`set_property`](./set_property.md) |
| Insert content BEFORE the frontmatter (rare) | Out of scope — `prepend` lands AFTER the frontmatter. Use `write_note` with a manually-constructed full-document body. |
| Prepend more than 3072 characters | [`write_note`](./write_note.md) — no size cap. See *Size ceiling* below for why. |

## Input schema

The schema is strict: `additionalProperties: false`. Unknown fields trigger `VALIDATION_ERROR`.

### Specific mode

```json
{
  "target_mode": "specific",
  "vault": "<vault display name>",
  "path": "<vault-relative path>",
  "content": "<bytes to prepend>",
  "inline": false
}
```

Or by wikilink-form bare name:

```json
{
  "target_mode": "specific",
  "vault": "<vault display name>",
  "file": "<bare note name, no [[…]] brackets>",
  "content": "<bytes to prepend>"
}
```

### Active mode

```json
{
  "target_mode": "active",
  "content": "<bytes to prepend>"
}
```

The wrapper resolves the focused note via a small `obsidian eval` call. **NO opt-in flag is required** for active mode. Active mode is safe because prepend is additive — a wrong target produces recoverable noise at the top of an unintended note, not destruction.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `target_mode` | `"specific" \| "active"` | YES | Discriminator. |
| `vault` | string ≥ 1 char | iff specific | Resolved against the wrapper's vault registry. Unknown vault → `VAULT_NOT_FOUND`. |
| `file` | string ≥ 1 char (structurally safe; no `[[` / `]]`) | XOR with `path`, iff specific | Wikilink-form bare name. A pre-flight `obsidian file` TSV resolver call canonicalises the name to a vault-relative path before the prepend lands. |
| `path` | string ≥ 1 char (structurally safe) | XOR with `file`, iff specific | Vault-relative path. Brackets are NOT a special case here (legal in note names). |
| `content` | string, ≥ 1 char and ≤ 3072 UTF-16 code units | YES | Non-empty required. Preserved byte-for-byte (no trim, no whitespace normalisation, no encoding conversion). See *Size ceiling* for why the cap is 3072 and not larger. |
| `inline` | boolean | NO (default `false`) | When `true`, suppresses the inserted separator between prepended content and the existing body. |

## Frontmatter-aware insertion-point rule

When the target note has a YAML frontmatter block (opening `---` at byte zero, body, closing `---`), prepended content lands **immediately after the closing `---`** and the frontmatter block is preserved byte-for-byte. When the target has no frontmatter block, prepended content lands at byte zero.

Frontmatter detection is delegated to the upstream Obsidian CLI; the wrapper does not parse YAML. Malformed-frontmatter behaviour (missing closing `---`, leading `---` used as a horizontal rule rather than a frontmatter delimiter) is inherited from upstream — the wrapper publishes no separate error code for malformed-frontmatter cases.

**Worked example.** A journal entry with:

```markdown
---
date: 2026-05-26
tags: [journal]
---

# 2026-05-26
Body
```

+ `content: "## TL;DR\n\nMade significant progress."` produces:

```markdown
---
date: 2026-05-26
tags: [journal]
---
## TL;DR

Made significant progress.

# 2026-05-26
Body
```

The frontmatter is byte-stable; a separator is inserted between the prepended content's last byte (`.`) and the existing leading body line (`# 2026-05-26`).

## Separator behaviour

| Content ends with | Default `inline: false` behaviour | `inline: true` behaviour |
|---|---|---|
| Non-newline (e.g. `…Lead`) | A separator matching the note's existing line-ending convention (LF or CRLF) is inserted between the prepended content and the existing leading body line. | NO separator inserted — content fuses directly onto the existing leading body line. |
| `\n` (LF-trailing) | The content's trailing `\n` IS the separator — no additional separator inserted. | Same — content lands without an additional separator. |
| `\r\n` (CRLF-trailing) | The content's trailing `\r\n` IS the separator. | Same. |
| Empty file or frontmatter-only-no-body | No trailing separator. | Same. |

The "supplied content's trailing line break IS the separator" rule is load-bearing for two common patterns: line-builder (`content` without trailing newline) and paragraph-builder (`content` with trailing newline). Both produce clean byte-stable concatenation under repeated default-mode prepends.

**Worked examples.**

- `existing = "abc"`, `content = "def"`, default → `"def\nabc"` (separator inserted).
- `existing = "abc"`, `content = "def\n"`, default → `"def\nabc"` (content's `\n` IS the separator; no double newline).
- `existing = ""`, `content = "def"`, default → `"def"` (empty file: no separator).
- `existing = "---\nkey: v\n---\nbody"`, `content = "Lead"`, default → `"---\nkey: v\n---\nLead\nbody"` (frontmatter preserved; separator between `Lead` and `body`).

## Inline opt-in

`inline: true` fuses `content` directly onto the existing leading body line with NO inserted separator. The frontmatter-aware insertion-point rule is UNCHANGED by inline — the prepended content still lands after the closing `---` when frontmatter is present; only the separator between the prepended content and the existing leading body line is suppressed.

Use case: extending an existing leading sentence, prefixing a leading list-item marker, completing a partial prefix.

**Example.** `existing = "Existing-prefix continues here"`, `content = "NEW-"`, `inline: true` → `"NEW-Existing-prefix continues here"`. `bytes_written` exactly equals `content.length` (4 bytes) — no separator overhead.

## Locator shapes

Two locator shapes in specific mode:

- **`path`** — vault-relative file path (e.g. `"Sandbox/journal-2026-05-26.md"`). Fed verbatim into the canonical-path safety check.
- **`file`** — bare wikilink-form note name (e.g. `"tasks"`, NOT `"[[tasks]]"`). The wrapper performs a pre-flight `obsidian file file=<name>` TSV resolver call to canonicalise the name to a vault-relative path; the response's `path` field carries that canonical path.

Wikilink-form brackets are rejected at the schema layer: `[[…]]` pairs trigger `VALIDATION_ERROR` with the message *"wikilink-form locator MUST NOT contain `[[` or `]]` brackets — supply the bare note name (e.g. `My Note` not `[[My Note]]`)"*. Single brackets (e.g. `[draft]`) are legal in note names and not rejected.

Active mode (`target_mode: "active"`) supplies neither `file` nor `path`; the wrapper resolves the currently-focused note via eval.

## Output envelope

```typescript
interface PrependOutput {
  path: string;            // Canonical vault-relative path of the prepended note
  vault: string;           // Vault display name (specific mode echo, or resolved reverse-lookup in active mode)
  bytes_written: number;   // Delta: post-edit file size minus pre-edit file size (always ≥ 1 on success)
  inline: boolean;         // Echo of the inline mode applied
}
```

- `path` is ALWAYS canonical. A caller who supplied `file: "tasks"` receives `path: "tasks.md"` (whatever the resolver yields).
- `bytes_written` is the wrapper-observed byte-count delta. Exactly equals `content.length` when the content's trailing newline IS the separator, or when `inline: true` suppresses the separator. Equals `content.length + separator_bytes` (1 byte for LF, 2 for CRLF) when a separator is inserted.
- `inline` is `false` for default calls (input `inline: false` or omitted), `true` for input `inline: true`.

## Error states

| Top-level `code` | `details.code` / `details.reason` | What triggered it | What to do |
|---|---|---|---|
| `VALIDATION_ERROR` | `details.code: CONTENT_EMPTY` | Empty content. | Supply non-empty content. |
| `VALIDATION_ERROR` | `details.code: CONTENT_TOO_LARGE` | Content > 3072 UTF-16 code units. | Use [`write_note`](./write_note.md) for larger payloads. See *Size ceiling*. |
| `VALIDATION_ERROR` | (Zod issue path on the offending field) | Bracket-rejection on `file`, locator-mutex (`file` AND `path`), unknown extra field, structural path safety, type mismatch on `inline`. | Read `details.issues[].message` for the field-level fix. |
| `CLI_REPORTED_ERROR` | `details.code: NOTE_NOT_FOUND` | The target file does not exist. | Recheck the path. Use [`write_note`](./write_note.md) if you meant to create a new note (`prepend` does NOT auto-create). |
| `CLI_REPORTED_ERROR` | `details.code: EXTERNAL_EDITOR_CONFLICT`, `details.reason: "file-locked"` | The target file is held open by an external editor. | Ask the user to save and close the file in the editor, then retry. |
| `CLI_REPORTED_ERROR` | `details.stage: "prepend-cli"` (generic) | Unrecognised upstream failure. | Inspect `details.stdout` / `details.stderr` for diagnosis. |
| `FS_WRITE_FAILED` | `details.reason: "post-stat-byte-delta-zero"` | Upstream returned exit 0 but the on-disk byte count did not change (silent-no-op failure). | Usually transient lock contention or upstream IPC degradation. Retry once. If the failure repeats at the same payload size, you have likely hit the cap-boundary IPC defect — use [`write_note`](./write_note.md) instead. |
| `PATH_ESCAPES_VAULT` | — | The resolved path escapes the vault root (symlink traversal, `..` segments). | Fix the path. The path must resolve inside the vault. |
| `VAULT_NOT_FOUND` | — | The supplied `vault` display name is not registered with the Obsidian CLI. | Recheck the vault name (case-sensitive). The user can list registered vaults with `obsidian vaults`. |
| `ERR_NO_ACTIVE_FILE` | — | Active mode but no note is focused in Obsidian. | Switch to `target_mode: "specific"` with explicit `vault` + `file`/`path`, or ask the user to open a note first. |

## Size ceiling

**Explicit cap of 3072 UTF-16 code units.** The cap is NOT driven by the Windows `CreateProcess` command-line maximum (which sits around ~32 767 chars — six orders larger than this cap). The cap is bounded by an **upstream Obsidian.com argv-IPC defect** that hangs the host process around 4 KB of content on Windows.

Empirical bisect data: 10/10 trials succeed at 3584 chars; 0/10 succeed at 4096 chars (calls SIGTERM after 12 s, then Obsidian's CLI-receiving state degrades until the GUI is restarted). The 3072 cap leaves ~1 KB of safety margin for the `vault=` / `path=` argv-overhead a real prepend call adds on top of the content payload.

The defect is upstream-side and matches [forum thread 113867](https://forum.obsidian.md/t/cli-content-parameter-corrupts-multi-byte-utf-8-at-8-kb-chunk-boundary-silent/113867) (no Obsidian-team response as of writing). **Chunking the content does not help** — the defect re-fires on each call regardless of cumulative size, and partial-prepend semantics would be order-fragile anyway. Callers needing payloads above the cap MUST use the full-replace [`write_note`](./write_note.md) surface, which is fs-direct and cap-free.

The cap is enforced at the schema layer via `z.string().max(3072)`; oversized payloads surface as `(VALIDATION_ERROR, CONTENT_TOO_LARGE)` BEFORE any spawn occurs. The cap may be ratcheted back up in a future release if upstream Obsidian repairs the argv-IPC defect.

## Platform-specific behaviour: EXTERNAL_EDITOR_CONFLICT

`EXTERNAL_EDITOR_CONFLICT` detection is platform-divergent:

- **Windows**: the upstream signals editor-conflict when an external editor holds the target file with non-shared-delete access (typically surfaced as `EBUSY` / `EPERM` / `EACCES` through upstream's process layer).
- **Linux / macOS**: the upstream has no analogous signal for in-memory-only dirty state, so the prepend lands on disk and the external editor sees a refreshed file on next focus.

Callers automating against multi-platform deployments must plan around this divergence.

## Atomicity and concurrent calls

A single `prepend` invocation does not leave the note on disk in a half-written or otherwise inconsistent state at any observable instant within the wrapper's control. Atomicity is inherited from the upstream `obsidian prepend` subcommand's internal write pipeline — the wrapper does not introduce additional atomicity machinery. Interrupted invocations (power loss, `kill -9`) leave on-disk state to the operating system.

Two concurrent `prepend` calls against the same note resolve **last-write-wins**. Callers needing stronger guarantees coordinate externally.

## Out of scope

- Auto-creating a new note → use [`write_note`](./write_note.md) (`prepend` does NOT auto-create).
- Inserting content BEFORE the frontmatter (rare) → out of scope. Use `write_note` with a manually-constructed full-document body.
- Symmetric additive write at the end of the file → use [`append_note`](./append_note.md).
- Writing under a named heading → use [`patch_heading`](./patch_heading.md).
- Writing tied to a `^block-id` marker → use [`patch_block`](./patch_block.md).
- Content larger than 3072 UTF-16 code units → use [`write_note`](./write_note.md) (no size cap).
