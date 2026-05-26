# Quickstart: prepend

**Branch**: `045-prepend-note` | **Date**: 2026-05-26
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Data Model**: [data-model.md](./data-model.md) | **Contracts**: [contracts/](./contracts/)

Agent-facing usage examples for the `prepend` typed MCP tool. Every example assumes the tool is registered on the MCP server and accessible via the `tools/call` MCP method (or whichever invocation primitive the consuming agent runtime exposes).

## Setup: example notes

The examples below reference these vault files.

### `Sandbox/journal-2026-05-26.md` (frontmatter + body)

```markdown
---
date: 2026-05-26
tags: [journal]
---

# 2026-05-26

Started the day with coffee and code review.
```

### `Sandbox/tasks.md` (no frontmatter)

```markdown
# Tasks

- Buy groceries
- Submit timesheet
- Reviewed PR #128
```

### `Sandbox/frontmatter-only.md` (frontmatter, empty body)

```markdown
---
title: Stub Note
created: 2026-05-26
---
```

### `Sandbox/leading-partial.md` (no frontmatter, leading body line begins with a token to fuse against)

```text
Existing-prefix continues here
```

Vault display name: `Knowledge`. Examples target `target_mode: "specific"`, but every example has an active-mode counterpart (open the note in Obsidian, drop `vault`/`file`/`path`, set `target_mode: "active"`).

## Example 1 — Frontmatter-aware default-separator prepend against a journal entry

**Intent**: Add a TL;DR-style header line ABOVE the journal body, leaving the YAML frontmatter intact.

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Sandbox/journal-2026-05-26.md",
  "content": "## TL;DR\n\nMade significant progress on the prepend tool plan."
}
```

**Response** (success):

```json
{
  "path": "Sandbox/journal-2026-05-26.md",
  "vault": "Knowledge",
  "bytes_written": 58,
  "inline": false
}
```

**Resulting file**:

```markdown
---
date: 2026-05-26
tags: [journal]
---

## TL;DR

Made significant progress on the prepend tool plan.

# 2026-05-26

Started the day with coffee and code review.
```

**What happened**: The wrapper validated the input, resolved the vault, ran the `obsidian prepend vault=Knowledge path=Sandbox/journal-2026-05-26.md content=…` call. Upstream detected the frontmatter, placed the prepended content immediately after the closing `---` (preserving the frontmatter byte-for-byte per FR-005a / FR-011), and inserted a separator (matching the file's existing LF line-ending convention per FR-008) between the prepended content and the existing leading body line (`# 2026-05-26`). The supplied content already ended with `.` (no trailing newline), so FR-006 fires: upstream inserts a separator. `bytes_written` counts the prepended content (~57 chars) plus the 1-byte LF separator.

## Example 2 — Default-separator prepend against a note with no frontmatter

**Intent**: Add a status line ABOVE the existing task list.

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Sandbox/tasks.md",
  "content": "Status: in-progress (updated 2026-05-26)"
}
```

**Response** (success):

```json
{
  "path": "Sandbox/tasks.md",
  "vault": "Knowledge",
  "bytes_written": 41,
  "inline": false
}
```

**Resulting file**:

```markdown
Status: in-progress (updated 2026-05-26)
# Tasks

- Buy groceries
- Submit timesheet
- Reviewed PR #128
```

**What happened**: No frontmatter detected, so the prepended content lands at byte zero per FR-005a. A line-ending-convention-matching separator is inserted between the prepended content and the existing leading line (`# Tasks`) per FR-006. `bytes_written` = 40 chars of content + 1-byte LF separator = 41.

## Example 3 — Prepend with content ending in `\n` (FR-006a fires)

**Intent**: Prepend a header block whose author has explicitly terminated it with a newline; demonstrate that the content's trailing newline IS the default separator and no additional one is inserted.

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Sandbox/tasks.md",
  "content": "Status: in-progress (updated 2026-05-26)\n"
}
```

**Response** (success):

```json
{
  "path": "Sandbox/tasks.md",
  "vault": "Knowledge",
  "bytes_written": 41,
  "inline": false
}
```

**Resulting file**:

```markdown
Status: in-progress (updated 2026-05-26)
# Tasks

- Buy groceries
- Submit timesheet
- Reviewed PR #128
```

**What happened**: Observable bytes are identical to Example 2. The difference: in Example 2, the wrapper-inserted separator carried the LF byte; in Example 3, the caller's content carried the LF byte directly. Per FR-006a (the prepend-direction symmetric of BI-044's "existing trailing newline IS the separator"), no additional separator is inserted. The result is byte-stable across repeated default-mode prepends — the caller picks their convention (newline-terminated content or not) and the wrapper preserves it verbatim.

## Example 4 — 0-byte file (FR-009 fires)

**Intent**: Prepend the very first byte of a freshly-created empty file.

**Request** (after `Sandbox/empty.md` exists as a 0-byte file):

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Sandbox/empty.md",
  "content": "First line of the note."
}
```

**Response** (success):

```json
{
  "path": "Sandbox/empty.md",
  "vault": "Knowledge",
  "bytes_written": 23,
  "inline": false
}
```

**Resulting file**:

```text
First line of the note.
```

**What happened**: No existing body to separate against, so per FR-009 no trailing separator is inserted. The file contains exactly the prepended content. Cohort parity with BI-044's 0-byte-file rule.

## Example 5 — Frontmatter-only note (FR-009 symmetric fires)

**Intent**: Add the first line of body content to a stub note whose only existing content is the YAML frontmatter.

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Sandbox/frontmatter-only.md",
  "content": "First body content."
}
```

**Response** (success):

```json
{
  "path": "Sandbox/frontmatter-only.md",
  "vault": "Knowledge",
  "bytes_written": 19,
  "inline": false
}
```

**Resulting file**:

```markdown
---
title: Stub Note
created: 2026-05-26
---
First body content.
```

**What happened**: Frontmatter detected, so the prepended content lands after the closing `---` per FR-005a. There's no existing body line to separate against (FR-009 symmetric), so no separator is inserted. The frontmatter is preserved byte-for-byte per FR-011.

## Example 6 — Inline (no-separator) opt-in for fusing onto an existing leading line

**Intent**: Prefix the existing leading body line with a token, fusing the new text directly onto it (no intervening line break).

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Sandbox/leading-partial.md",
  "content": "NEW-",
  "inline": true
}
```

**Response** (success):

```json
{
  "path": "Sandbox/leading-partial.md",
  "vault": "Knowledge",
  "bytes_written": 4,
  "inline": true
}
```

**Resulting file**:

```text
NEW-Existing-prefix continues here
```

**What happened**: The inline opt-in suppresses the wrapper's default-inserted separator per FR-007. The supplied content fuses directly onto the existing leading body line. `bytes_written` exactly equals `content.length` (4 chars) — no separator overhead. The frontmatter-aware insertion-point rule (FR-005a) is unchanged by the inline opt-in; in this example there's no frontmatter to consider, but Example 7 demonstrates the interaction.

## Example 7 — Inline opt-in against a note WITH frontmatter

**Intent**: Fuse the prepended content directly onto the existing leading body line while preserving the YAML frontmatter intact.

**Request** (against `Sandbox/journal-2026-05-26.md` from Setup):

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Sandbox/journal-2026-05-26.md",
  "content": "UPDATED ",
  "inline": true
}
```

**Response** (success):

```json
{
  "path": "Sandbox/journal-2026-05-26.md",
  "vault": "Knowledge",
  "bytes_written": 8,
  "inline": true
}
```

**Resulting file**:

```markdown
---
date: 2026-05-26
tags: [journal]
---

UPDATED # 2026-05-26

Started the day with coffee and code review.
```

**What happened**: Frontmatter preserved byte-for-byte (FR-011). Prepended content lands after the closing `---` per FR-005a (NOT before — the inline opt-in does not change the insertion-point rule). The inline opt-in suppresses the separator between the prepended content and the existing leading body line per FR-007 — the result has `UPDATED ` fused directly onto `# 2026-05-26`. Note that the existing blank line between the closing `---` and `# 2026-05-26` in the original file is part of the EXISTING BODY (per upstream's frontmatter detection) and is preserved; the prepended content lands at the start of the existing body, which begins with that blank line.

## Example 8 — Active-mode prepend (focused-note)

**Intent**: Add a status block to whichever note the user has currently focused in Obsidian.

**Request**:

```json
{
  "target_mode": "active",
  "content": "Status: reviewed 2026-05-26"
}
```

**Response** (success, when a note is focused):

```json
{
  "path": "Daily Notes/2026-05-26.md",
  "vault": "Knowledge",
  "bytes_written": 28,
  "inline": false
}
```

**What happened**: The wrapper ran the cohort-standard focused-file eval to resolve the focused note's vault-relative path (`Daily Notes/2026-05-26.md`) and vault basePath, then ran `obsidian prepend vault=Knowledge path=Daily Notes/2026-05-26.md content=…`. The response carries the resolved path per FR-003. No `confirmActive` opt-in is required per FR-004a (inherited from BI-044's deliberate cohort exception).

## Example 9 — Active-mode with no focused note (FR-004 error)

**Request**:

```json
{
  "target_mode": "active",
  "content": "Status: noop"
}
```

**Response** (failure, when no note is focused):

```json
{
  "code": "ERR_NO_ACTIVE_FILE",
  "details": {
    "message": "No active file in Obsidian. Open a note in the editor, or call prepend with target_mode=specific + vault + file/path."
  }
}
```

**What happened**: The focused-file eval returned `path: null`. The wrapper raised `ERR_NO_ACTIVE_FILE` before any prepend call was issued; no filesystem access occurred.

## Example 10 — Wikilink-form `file` locator (with pre-flight resolution)

**Intent**: Address a note by its wikilink-form name (the bare name Obsidian resolves inside `[[…]]` links).

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "file": "Daily Notes/2026-05-26",
  "content": "Status: reviewed 2026-05-26\n"
}
```

**Response** (success):

```json
{
  "path": "Daily Notes/2026-05-26.md",
  "vault": "Knowledge",
  "bytes_written": 28,
  "inline": false
}
```

**What happened**: The wrapper ran a pre-flight `obsidian file file=Daily Notes/2026-05-26` resolver call to canonicalise the name to `Daily Notes/2026-05-26.md`, then ran `obsidian prepend vault=Knowledge path=Daily Notes/2026-05-26.md content=…`. The response identifies the file by its resolved path per FR-003. Two-spawn cost; cohort parity with `set_property` and `append_note`'s file-mode handling.

## Example 11 — Empty content (FR-013 validation error)

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Sandbox/tasks.md",
  "content": ""
}
```

**Response** (failure):

```json
{
  "code": "VALIDATION_ERROR",
  "details": {
    "code": "CONTENT_EMPTY",
    "issues": [
      {
        "code": "too_small",
        "path": ["content"],
        "minimum": 1,
        "message": "String must contain at least 1 character"
      }
    ]
  }
}
```

**What happened**: The schema layer rejected the empty content at the input-validation boundary. No filesystem access; no spawn. Cohort parity with BI-044's `CONTENT_EMPTY`.

## Example 12 — Oversized content (FR-018 validation error — NEW in BI-045)

**Request** (content payload exceeding 24576 UTF-16 code units):

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Sandbox/tasks.md",
  "content": "<a 30 KiB content payload>"
}
```

**Response** (failure):

```json
{
  "code": "VALIDATION_ERROR",
  "details": {
    "code": "CONTENT_TOO_LARGE",
    "issues": [
      {
        "code": "too_big",
        "path": ["content"],
        "maximum": 24576,
        "message": "String must contain at most 24576 character(s)"
      }
    ]
  }
}
```

**What happened**: The schema layer rejected the oversized content at the input-validation boundary per FR-018. No spawn was issued; the upstream argv-pipe ceiling was never approached. Callers needing payloads above 24 KiB use the full-replace `write_note` surface, which is fs-direct and content-cap-free.

## Example 13 — Wikilink brackets in `file` (FR-001a validation error)

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "file": "[[My Note]]",
  "content": "Lead"
}
```

**Response** (failure):

```json
{
  "code": "VALIDATION_ERROR",
  "details": {
    "issues": [
      {
        "code": "custom",
        "path": ["file"],
        "message": "wikilink-form locator MUST NOT contain `[[` or `]]` brackets — supply the bare note name (e.g. `My Note` not `[[My Note]]`)"
      }
    ]
  }
}
```

**What happened**: The schema-layer `safeFileField` refinement rejected the bracket-bearing locator at the input-validation boundary per FR-001a. Cohort parity with every existing `file`-parameter tool — none strip brackets. Inherited verbatim from BI-044's `safeFileField` pattern.

## Example 14 — Both `file` AND `path` supplied (FR-014 validation error)

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "file": "Daily Notes/2026-05-26",
  "path": "Daily Notes/2026-05-26.md",
  "content": "Lead"
}
```

**Response** (failure):

```json
{
  "code": "VALIDATION_ERROR",
  "details": {
    "issues": [
      {
        "code": "custom",
        "message": "exactly one of `file` or `path` must be provided in specific mode (got both)"
      }
    ]
  }
}
```

**What happened**: The cohort's `applyTargetModeRefinement` primitive rejected the mutually-exclusive-locator violation. Cohort parity with the rest of the locator-accepting tool family.

## Example 15 — Note not found (FR-016 typed error)

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Sandbox/does-not-exist.md",
  "content": "Lead"
}
```

**Response** (failure):

```json
{
  "code": "CLI_REPORTED_ERROR",
  "details": {
    "code": "NOTE_NOT_FOUND",
    "path": "Sandbox/does-not-exist.md",
    "vault": "Knowledge"
  }
}
```

**What happened**: Upstream's `obsidian prepend` returned a non-zero exit code with stderr matching the cohort-known not-found pattern. The wrapper classified it to `(CLI_REPORTED_ERROR, NOTE_NOT_FOUND)` per FR-016. No file was created — `prepend` does NOT auto-create per FR-012. Callers needing creation use `write_note`.

## Example 16 — External-editor conflict (FR-022 typed error, Windows-only practical)

**Request** (when the target file is held open by an external editor with non-shared-delete access on Windows):

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Sandbox/journal-2026-05-26.md",
  "content": "Status update"
}
```

**Response** (failure):

```json
{
  "code": "CLI_REPORTED_ERROR",
  "details": {
    "code": "EXTERNAL_EDITOR_CONFLICT",
    "reason": "file-locked",
    "path": "Sandbox/journal-2026-05-26.md"
  }
}
```

**What happened**: Upstream's `obsidian prepend` failed because the OS refused the write while another process held the file. The wrapper classified it to `(CLI_REPORTED_ERROR, EXTERNAL_EDITOR_CONFLICT)` with `details.reason: "file-locked"` per FR-022. Detection-capability-bound — on platforms where the upstream doesn't detect the condition, the prepend lands and the editor sees the refreshed file on next focus.

## Mode summary

| `target_mode` | Required input fields | Forbidden input fields | Spawn count | Notes |
|---------------|----------------------|------------------------|-------------|-------|
| `specific` + `path` | `vault`, `path`, `content` | `file` | 1 (`obsidian prepend`) | The simplest happy path. |
| `specific` + `file` | `vault`, `file`, `content` | `path` | 2 (`obsidian file` resolver → `obsidian prepend`) | Cohort parity with `append_note`, `set_property`. |
| `active` | `content` | `vault`, `file`, `path` | 2 (focused-file eval → `obsidian prepend`) | No `confirmActive` flag required (FR-004a). Cohort parity. |

## Recovery patterns

| Failure mode | Recovery path |
|--------------|---------------|
| `(VALIDATION_ERROR, CONTENT_EMPTY)` | Supply a non-empty `content`. |
| `(VALIDATION_ERROR, CONTENT_TOO_LARGE)` | Reduce content below 24 KiB OR call `write_note` for full-document replacement. |
| `(VALIDATION_ERROR, …)` other issues | Inspect `details.issues[]` for the offending field; fix and retry. |
| `(CLI_REPORTED_ERROR, NOTE_NOT_FOUND)` | Verify the path or wikilink-form name; create the note via `write_note` if creation was intended. |
| `(CLI_REPORTED_ERROR, EXTERNAL_EDITOR_CONFLICT)` | Save and close the file in the editor, then retry. |
| `ERR_NO_ACTIVE_FILE` | Open a note in Obsidian, OR switch to `target_mode: "specific"`. |
| `PATH_ESCAPES_VAULT` | Use a vault-internal path. Symlinks must be followed manually. |
| `VAULT_NOT_FOUND` | Use `vaults` to list registered vaults; open the target vault in Obsidian if it's not currently open. |
| Unrecognised CLI failure | Inspect `details.stdout` / `details.stderr`; report to maintainers if behaviour is unexpected. |
