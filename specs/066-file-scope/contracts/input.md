# Contract: `find_and_replace` Input (File-Scope Delta)

**Feature**: `066-file-scope` · The zod schema in `src/tools/find_and_replace/schema.ts` is the single source of truth (Principle III); this document mirrors it.

## New optional fields

```jsonc
{
  // ... all existing fields unchanged (pattern, replacement, mode, case_insensitive,
  //     subfolder, include_code_blocks, include_html_comments, commit, vault) ...

  "file":        "string?",   // bare note name; [[…]] rejected; structurally-safe path
  "path":        "string?",   // vault-relative path; structurally-safe path
  "active_note": "boolean?"   // default false; confine to the currently-open note
}
```

- **`file`** — a plain note name resolved the way the note-level cohort resolves a name (Obsidian shortest-unique-name, via `obsidian file file=<name>`). Rejects any value containing `[[` or `]]` with the cohort's `WIKILINK_BRACKET_REJECTION_MESSAGE` ("supply the bare note name, e.g. `My Note` not `[[My Note]]`"). Subject to `isStructurallySafePath`.
- **`path`** — a vault-relative path to one note; handled direct-filesystem with the existing canonical-path guard. Subject to `isStructurallySafePath`.
- **`active_note`** — when `true`, confine the operation to whichever note is currently open in the editor; the caller supplies no path.

All three are optional; omitting all three preserves the existing vault-wide / `subfolder` behaviour byte-for-byte (FR-014).

## Scope mutual-exclusivity matrix (`superRefine`)

Let `single-note = file | path | active_note`.

| Supplied combination | Result | Error (`code` / `details.code` / `details.reason`) |
|---|---|---|
| `file` **and** `path` | reject | `VALIDATION_ERROR` / `SCOPE_CONFLICT` / `file+path` |
| (`file`\|`path`) **and** `subfolder` | reject | `VALIDATION_ERROR` / `SCOPE_CONFLICT` / `note+folder` |
| `active_note` **and** (`file`\|`path`) | reject | `VALIDATION_ERROR` / `SCOPE_CONFLICT` / `active+note` |
| `active_note` **and** `subfolder` | reject | `VALIDATION_ERROR` / `SCOPE_CONFLICT` / `active+folder` |
| `active_note` **and** `vault` | reject | `VALIDATION_ERROR` / `SCOPE_CONFLICT` / `active+vault` |
| `[[…]]` in `file` | reject | `VALIDATION_ERROR` / — / — (standard channel; message names the bracket form) |
| structurally-unsafe `file` or `path` | reject | `VALIDATION_ERROR` / `INVALID_NOTE` / `path-traversal` |
| `file`\|`path` **and** `vault` | **accept** | — (`vault` selects the named note's vault) |
| `file`\|`path` **and** `commit`/`mode`/`case_insensitive`/`include_*` | **accept** | — (operation options are orthogonal to scope) |
| none of `file`/`path`/`active_note`/`subfolder` | **accept** | — (vault-wide default) |

All scope-conflict and field-shape rejections fire at the input-validation boundary **before any note is read** (FR-006, FR-007, FR-013).

## Examples

```jsonc
// Named single note by path, preview
{ "pattern": "OldName", "replacement": "NewName", "path": "Projects/Alpha.md" }

// Named single note by bare name, commit, explicit vault
{ "pattern": "v1", "replacement": "v2", "file": "Release Notes", "vault": "Work", "commit": true }

// The currently-open note, preview
{ "pattern": "TODO", "replacement": "DONE", "active_note": true }

// CONFLICT — single-note + folder
{ "pattern": "x", "replacement": "y", "path": "A.md", "subfolder": "Drafts" }
//   → VALIDATION_ERROR / SCOPE_CONFLICT / note+folder

// CONFLICT — open-note + explicit vault
{ "pattern": "x", "replacement": "y", "active_note": true, "vault": "Work" }
//   → VALIDATION_ERROR / SCOPE_CONFLICT / active+vault

// REJECT — bracketed link form
{ "pattern": "x", "replacement": "y", "file": "[[My Note]]" }
//   → VALIDATION_ERROR (wikilink-bracket message)
```
