# Quickstart: append_note

**Branch**: `044-append-note` | **Date**: 2026-05-25
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Data Model**: [data-model.md](./data-model.md) | **Contracts**: [contracts/](./contracts/)

Agent-facing usage examples for the `append_note` typed MCP tool. Every example assumes the tool is registered on the MCP server and accessible via the `tools/call` MCP method (or whichever invocation primitive the consuming agent runtime exposes).

## Setup: example notes

The examples below reference these vault files at `Sandbox/journal-2026-05-25.md`:

```markdown
---
date: 2026-05-25
tags: [journal]
---

# 2026-05-25

Started the day with coffee and code review.
```

and `Sandbox/tasks.md`:

```markdown
# Tasks

- Buy groceries
- Submit timesheet
- Reviewed PR #128
```

and `Sandbox/partial-line.md` (no trailing newline, ends with `Partial`):

```text
Working on something — Partial
```

Vault display name: `Knowledge`. Examples target `target_mode: "specific"`, but every example has an active-mode counterpart (open the note in Obsidian, drop `vault`/`file`/`path`, set `target_mode: "active"`).

## Example 1 — Default-separator append against a journal entry

**Intent**: Add a new bullet under the journal's existing prose, on its own new line.

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Sandbox/journal-2026-05-25.md",
  "content": "- Started writing the append_note plan."
}
```

**Response** (success):

```json
{
  "path": "Sandbox/journal-2026-05-25.md",
  "vault": "Knowledge",
  "bytes_written": 41,
  "inline": false
}
```

**Post-call file content**:

```markdown
---
date: 2026-05-25
tags: [journal]
---

# 2026-05-25

Started the day with coffee and code review.
- Started writing the append_note plan.
```

Note: the file already ended with `\n` (after "code review."), so per FR-006a the existing trailing newline IS the separator — no double newline is inserted between the existing prose and the new bullet. `bytes_written` is `41` = `content.length` (no separator bytes added).

## Example 2 — Append a table row by wikilink-form name

**Intent**: Add a new row to a tasks list, identifying the target note by its wikilink-form name rather than a vault-relative path.

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "file": "tasks",
  "content": "- Wrote the patch_block error contract"
}
```

**Response** (success):

```json
{
  "path": "tasks.md",
  "vault": "Knowledge",
  "bytes_written": 39,
  "inline": false
}
```

The response's `path` is the resolved vault-relative path (`tasks.md`), not the wikilink-form input the caller supplied. FR-003 canonicalisation.

## Example 3 — Inline opt-in to finish a partial trailing line

**Intent**: Fuse new content directly onto a partial trailing line (the file ends with the partial token `Partial`, no newline).

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Sandbox/partial-line.md",
  "content": "Tail and now finished.",
  "inline": true
}
```

**Response** (success):

```json
{
  "path": "Sandbox/partial-line.md",
  "vault": "Knowledge",
  "bytes_written": 22,
  "inline": true
}
```

**Post-call file content**:

```text
Working on something — PartialTail and now finished.
```

No newline is inserted between `Partial` and `Tail` per FR-007. `bytes_written` equals `content.length` exactly (no separator).

## Example 4 — Active-mode append to the focused note (NO opt-in flag required)

**Intent**: Append to whatever note the user currently has open in their editor.

**Request**:

```json
{
  "target_mode": "active",
  "content": "- Quick note added from agent flow"
}
```

**Response** (success — focused note happened to be `Sandbox/journal-2026-05-25.md`):

```json
{
  "path": "Sandbox/journal-2026-05-25.md",
  "vault": "Knowledge",
  "bytes_written": 35,
  "inline": false
}
```

Note the absence of any `overwrite: true` / `confirmActive: true` / similar opt-in flag — per FR-004a, active-mode append is a deliberate cohort exception to `write_note`'s mandatory active-mode opt-in, justified by the additive-not-destructive safety profile.

## Example 5 — Active mode with no focused note

**Intent**: Same as Example 4 but the user has no note focused.

**Request**:

```json
{
  "target_mode": "active",
  "content": "anything"
}
```

**Response** (failure):

```json
{
  "code": "ERR_NO_ACTIVE_FILE",
  "message": "No active file in Obsidian. Open a note in the editor, or call append_note with target_mode=specific + vault + file/path.",
  "details": {}
}
```

No filesystem access occurred. Cohort parity with `write_note` / `patch_heading` / `patch_block` active-mode no-focused-file failures.

## Example 6 — Missing target

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Sandbox/does-not-exist.md",
  "content": "anything"
}
```

**Response** (failure):

```json
{
  "code": "CLI_REPORTED_ERROR",
  "message": "...",
  "details": {
    "code": "NOTE_NOT_FOUND",
    "path": "Sandbox/does-not-exist.md",
    "vault": "Knowledge"
  }
}
```

No file was created. The caller can switch on `details.code === "NOTE_NOT_FOUND"` to decide whether to fall through to `write_note` (which DOES auto-create) or to surface the error to the user.

## Example 7 — Empty content rejection

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Sandbox/journal-2026-05-25.md",
  "content": ""
}
```

**Response** (failure):

```json
{
  "code": "VALIDATION_ERROR",
  "message": "append_note input failed schema validation",
  "details": {
    "code": "CONTENT_EMPTY",
    "issues": [
      { "path": ["content"], "message": "String must contain at least 1 character(s)", "code": "too_small" }
    ]
  }
}
```

No filesystem access occurred per FR-013.

## Example 8 — Wikilink-form bracket rejection

**Request** (caller mistakenly included the literal wikilink brackets):

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "file": "[[tasks]]",
  "content": "- something"
}
```

**Response** (failure):

```json
{
  "code": "VALIDATION_ERROR",
  "message": "append_note input failed schema validation",
  "details": {
    "issues": [
      {
        "path": ["file"],
        "message": "wikilink-form locator MUST NOT contain `[[` or `]]` brackets — supply the bare note name (e.g. `My Note` not `[[My Note]]`)",
        "code": "custom"
      }
    ]
  }
}
```

Per FR-001a, brackets are rejected at the schema layer before any filesystem access or subprocess invocation. The caller should drop the brackets: `"file": "tasks"`.

## Example 9 — Mutually-exclusive locators rejected

**Request** (caller mistakenly supplied both `file` AND `path`):

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "file": "tasks",
  "path": "Sandbox/tasks.md",
  "content": "- something"
}
```

**Response** (failure):

```json
{
  "code": "VALIDATION_ERROR",
  "message": "append_note input failed schema validation",
  "details": {
    "issues": [
      { "path": ["file"], "message": "exactly one of `file` or `path` must be provided in specific mode (got both)", "code": "custom" },
      { "path": ["path"], "message": "exactly one of `file` or `path` must be provided in specific mode (got both)", "code": "custom" }
    ]
  }
}
```

Per FR-014. Drop one of the two locators.

## Example 10 — External-editor conflict (Windows)

**Request** (the target file is open in another Windows process with non-shared-delete access):

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Sandbox/journal-2026-05-25.md",
  "content": "- new entry"
}
```

**Response** (failure on Windows when the editor holds the file):

```json
{
  "code": "CLI_REPORTED_ERROR",
  "message": "...",
  "details": {
    "code": "EXTERNAL_EDITOR_CONFLICT",
    "reason": "file-locked",
    "path": "Sandbox/journal-2026-05-25.md",
    "errno": "EBUSY"
  }
}
```

On Linux / macOS, the typical case is that `fs.rename` succeeds even when an editor holds the file (POSIX rename ignores open handles), so this failure shape only fires on Windows OR on Linux / macOS when the editor takes an exclusive flock. Detection-capability caveat per FR-022. File on disk is unchanged.

## Example 11 — Repeat appends grow the file cleanly (FR-006a in action)

**Intent**: Repeatedly add log lines without producing blank-line separation.

**Pre-call state** (`Sandbox/log.md`):

```text
2026-05-25 09:00 — server started
```

(File ends with `\n`.)

**Call 1**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Sandbox/log.md",
  "content": "2026-05-25 09:15 — first request handled"
}
```

**Post-call-1 state**:

```text
2026-05-25 09:00 — server started
2026-05-25 09:15 — first request handled
```

Per FR-006a, the existing `\n` after "server started" IS the separator — no double newline is inserted. The new line lands directly under the prior line.

**Call 2** (caller adds `\n` to their content to keep the file ending in `\n`):

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Sandbox/log.md",
  "content": "2026-05-25 09:30 — second request handled\n"
}
```

**Post-call-2 state**:

```text
2026-05-25 09:00 — server started
2026-05-25 09:15 — first request handled
2026-05-25 09:30 — second request handled
```

Per FR-010a, the caller's trailing `\n` is preserved verbatim, leaving the file ending in `\n` for the next call. Per FR-006a, the next default-separator append against this file will again use the existing `\n` as the separator. The line-builder pattern (caller omits trailing `\n`) and the paragraph-builder pattern (caller includes trailing `\n`) both produce clean byte-stable concatenation under repeated default-mode appends — the caller's pattern choice determines whether the file ends in `\n`, and the wrapper's FR-006a rule means the next append "just works" either way.
