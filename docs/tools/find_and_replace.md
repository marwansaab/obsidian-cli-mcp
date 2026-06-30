# `find_and_replace`

Preview-then-commit find-and-replace across a vault, a named subfolder, or a single note, with fenced code blocks and HTML comments skipped by default.

> **CRITICAL — default scope is vault-wide; narrow it deliberately.** With no scope field this tool replaces matches across EVERY eligible `.md` file in the vault. `subfolder: "Drafts"` narrows to every file under `Drafts/` recursively. To confine a change to ONE note, use a **single-note scope** — `path` (exact vault-relative path), `file` (bare note name), or `active_note: true` (the open note) — so the SCOPE, not a globally-unique pattern, bounds the blast radius. Agents have corrupted unintended files by committing wide-pattern replacements without previewing first.
>
> ALWAYS issue a preview first (default — omit `commit` or set `commit: false`). Inspect `affected_notes` for unexpected paths. Only set `commit: true` once the preview matches your intent. Under a single-note scope a preview affects ≤ 1 note, giving you early confirmation the scope is right.

## When to use this tool

| You want to | Reach for |
|---|---|
| Bulk vault refactor (ADR rename, wikilink retarget, symbol rename) | `find_and_replace` (with preview first) |
| Pattern-replace within ONE note (named or open) | `find_and_replace` with `path`/`file`/`active_note` |
| Overwrite one file's whole contents | [`read`](./read.md) + [`write_note`](./write_note.md) with `overwrite: true` |
| Find matches without rewriting | [`pattern_search`](./pattern_search.md) (regex) or [`context_search`](./context_search.md) (literal) |
| Replace the body under a named heading | [`patch_heading`](./patch_heading.md) |
| Replace the body tied to a `^block-id` marker | [`patch_block`](./patch_block.md) |

## Input shape

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `pattern` | string (1..1000 UTF-16 code units) | Y | — | Empty / over-cap / invalid-regex rejected at the input boundary. |
| `replacement` | string (0..1000 UTF-16 code units) | Y | — | Empty is valid (deletion). |
| `mode` | `"literal" \| "regex"` | N | `"literal"` | Regex: ECMAScript dialect (V8). `$1`/`$&`/`$$` interpolation supported in `replacement`. |
| `case_insensitive` | boolean | N | `false` | |
| `subfolder` | string | N | — | Vault-relative; structurally validated + canonicalised. Path-traversal rejected. Missing folder rejected. Scope. |
| `path` | string | N | — | Vault-relative path to ONE note (e.g. `Projects/Alpha.md`). Structurally validated + canonicalised. Single-note scope. |
| `file` | string | N | — | Bare note name (e.g. `Alpha`), resolved by Obsidian shortest-unique-name (like a wikilink). The `[[…]]` bracket form is rejected. Single-note scope. |
| `active_note` | boolean | N | `false` | When `true`, confine to the note currently open in the editor (no path). Single-note scope. |
| `include_code_blocks` | boolean | N | `false` | Opt back in to fenced code block occurrences. |
| `include_html_comments` | boolean | N | `false` | Opt back in to HTML comment occurrences. |
| `commit` | boolean | N | `false` | Preview when false/absent; rewrite on disk when true. |
| `vault` | string | N | — | Focused vault when absent. Permitted with a named `file`/`path`; forbidden with `active_note`. |

### Scope rules

The scope fields (`subfolder`, `path`, `file`, `active_note`) are **mutually exclusive** — choose at most one. Omitting all of them is the vault-wide default. Conflicting combinations are rejected with `VALIDATION_ERROR` + `details.code: "SCOPE_CONFLICT"` **before any note is read**:

| Combination | `details.reason` |
|---|---|
| `file` + `path` | `file+path` |
| (`file`\|`path`) + `subfolder` | `note+folder` |
| `active_note` + (`file`\|`path`) | `active+note` |
| `active_note` + `subfolder` | `active+folder` |
| `active_note` + `vault` | `active+vault` |

`vault` is permitted alongside a named `file`/`path` (it selects which vault the note lives in). Under a single-note scope `affected_notes` / `changed_notes` carry **at most one** entry (FR-009); a zero-match named scope returns an empty success — not an error.

## Output shape

Discriminated union keyed on `mode: "preview" | "commit"`.

**Preview branch**:

```json
{
  "mode": "preview",
  "affected_notes": [
    {
      "path": "Decisions/ADR-0042 - Old Decision.md",
      "occurrence_count": 2,
      "occurrences": [
        { "line_number": 4, "full_line": "See ADR-0042 …", "matched_substring": "ADR-0042", "replacement_substring": "ADR-0089" }
      ]
    }
  ],
  "total_occurrences": 2
}
```

Notes path-ascending; occurrences `(line_number, offset)`-ascending.

**Commit branch** (full success):

```json
{
  "mode": "commit",
  "changed_notes": ["Decisions/ADR-0042 - Old Decision.md"],
  "total_occurrences_replaced": 2,
  "partial": false
}
```

**Commit branch** (halted mid-batch by `FS_WRITE_FAILED`): carries `partial: true` and `failing_note_locator`.

## Error roster

| top-level | details.code | details.reason | Trigger | Recovery |
|---|---|---|---|---|
| `VALIDATION_ERROR` | `INVALID_PATTERN` | `empty` | empty `pattern` | Supply non-empty pattern. |
| `VALIDATION_ERROR` | `INVALID_PATTERN` | `too-long` | over 1000 UTF-16 code units | Shorten pattern, or split the work into multiple calls. |
| `VALIDATION_ERROR` | `INVALID_PATTERN` | `regex-syntax` | invalid ECMAScript regex (regex mode) | Fix the regex per `details.issues[0].message`. |
| `VALIDATION_ERROR` | `INVALID_REPLACEMENT` | — | replacement over 1000 UTF-16 code units | Shorten replacement. |
| `VALIDATION_ERROR` | `INVALID_SUBFOLDER` | `path-traversal` | `../`, leading `/` or `\`, drive letter, control char in subfolder | Supply a vault-relative subfolder path. |
| `VALIDATION_ERROR` | `INVALID_SUBFOLDER` | `not-found` | subfolder does not exist | Recheck the subfolder path; use [`paths`](./paths.md) or [`files`](./files.md) to enumerate the vault structure. |
| `VALIDATION_ERROR` | `SCOPE_CONFLICT` | `file+path` \| `note+folder` \| `active+note` \| `active+folder` \| `active+vault` | two mutually-exclusive scope fields supplied | Supply exactly one scope (or none). `details.reason` names the conflicting pair. |
| `VALIDATION_ERROR` | `INVALID_NOTE` | `not-found` | named `file`/`path` does not resolve to an existing note | Recheck the note name/path; `details.note` echoes the offending locator. |
| `VALIDATION_ERROR` | `INVALID_NOTE` | `not-eligible` | target resolves to a non-`.md` file or a dotfolder note (`.obsidian/…`) | Name an eligible `.md` note. |
| `VALIDATION_ERROR` | `INVALID_NOTE` | `path-traversal` | structurally-unsafe `file`/`path` (`../`, leading `/` or `\`, drive letter, control char) | Supply a vault-relative single-note locator. |
| `VALIDATION_ERROR` | — | — | `file` supplied in `[[…]]` bracket form | Supply the bare note name (`Alpha`, not `[[Alpha]]`). |
| `ERR_NO_ACTIVE_FILE` | — | — | `active_note: true` but no note is open in the editor | Open a note in the editor, or name one explicitly with `path`/`file`. |
| `VALIDATION_ERROR` | `OCCURRENCE_COUNT_EXCEEDED` | — | total > `OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES` (default 500) | Narrow with `subfolder` or a more specific pattern. The operator can raise the bound via the env var. |
| `VALIDATION_ERROR` | `OCCURRENCE_COUNT_DRIFT` | — | second-scan count differs from the preview count (vault changed between preview and commit) | Re-run the call to pick up the new vault state — the wrapper refuses to commit a stale preview. |
| `PATH_ESCAPES_VAULT` | — | — | canonical path resolves outside vault root (symlink traversal) | Caller's bug — fix the subfolder. |
| `CLI_REPORTED_ERROR` | `VAULT_NOT_FOUND` | `unknown` | vault name not in registry | Verify the vault name (case-sensitive); list registered vaults with `obsidian vaults`. |
| `CLI_REPORTED_ERROR` | `VAULT_NOT_FOUND` | `not-open` | vault registered but not currently open | Retry after a brief delay — the CLI opens the vault as a side effect. |
| `FS_WRITE_FAILED` | — | `read` | `fs.readFile` failed during scan | No partial flag; nothing written. Inspect `details.errno`. |
| `FS_WRITE_FAILED` | — | `write` | `fs.writeFile` / `fs.rename` failed during commit | Carries `details.partial: true` + `details.failing_note_locator` + `details.changed_notes` + `details.total_occurrences_replaced`. Some files were modified before the failure — inspect `changed_notes` to see what landed. |

## Worked examples

### Example 1 — Preview an ADR rename across Decisions/

```json
{
  "pattern": "ADR-0042",
  "replacement": "ADR-0089",
  "mode": "literal",
  "subfolder": "Decisions"
}
```

Whole-`Decisions/`-subtree, literal, fences + comments skipped, focused vault, preview only.

### Example 2 — Regex retarget with capture group, commit, named vault

```json
{
  "pattern": "\\[\\[#([^\\]]+)\\]\\]",
  "replacement": "[[NewHeading#$1]]",
  "mode": "regex",
  "commit": true,
  "vault": "Research"
}
```

Retargets every bare-heading wikilink (`[[#Foo]]`) to a specific-note link (`[[NewHeading#Foo]]`).

### Example 3 — Symbol rename across the vault, including fenced code samples

```json
{
  "pattern": "OldClassName",
  "replacement": "NewClassName",
  "mode": "literal",
  "include_code_blocks": true,
  "commit": true
}
```

Literal rename across the whole vault, INCLUDING fenced code blocks (HTML comments still skipped).

### Example 4 — Over-broad pattern that would breach the upper bound

```json
{ "pattern": "the", "replacement": "an" }
```

Returns `VALIDATION_ERROR` + `details.code: "OCCURRENCE_COUNT_EXCEEDED"` with `details.bound` (active bound), `details.count` (offending total), and `details.env_var: "OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES"`. No note modified.

### Example 5 — Confine to one named note (by path), preview

```json
{
  "pattern": "OldName",
  "replacement": "NewName",
  "path": "Projects/Alpha.md"
}
```

Preview touches only `Projects/Alpha.md`; `affected_notes` carries ≤ 1 entry and references no other note. Every other note is byte/mtime-unchanged. Add `"commit": true` to rewrite just that note.

### Example 6 — Confine to one note by bare name, commit, explicit vault

```json
{
  "pattern": "v1",
  "replacement": "v2",
  "file": "Release Notes",
  "vault": "Work",
  "commit": true
}
```

`file` resolves by Obsidian shortest-unique-name within the `Work` vault — the same addressing as `write_note`/`append_note`. `changed_notes` carries at most the one resolved note.

### Example 7 — Confine to the currently-open note

```json
{
  "pattern": "TODO",
  "replacement": "DONE",
  "active_note": true
}
```

Confines to whichever note is open in the editor; the response reports that note's vault-relative path. No note open → `ERR_NO_ACTIVE_FILE`.

### Example 8 — Scope conflict (rejected before any read)

```json
{ "pattern": "x", "replacement": "y", "path": "A.md", "subfolder": "Drafts" }
```

Returns `VALIDATION_ERROR` + `details.code: "SCOPE_CONFLICT"` + `details.reason: "note+folder"`. Nothing read or changed.

## Behavioural notes

- **Line-scoped only** — `\n` in `pattern` does NOT match cross-line; line endings are preserved byte-for-byte.
- **Zero-width regex matches** (`a*`, `^`, `$`, `\b`, lookarounds) are skipped — they never produce occurrences.
- **Frontmatter is treated as PROSE** — `---`-delimited YAML at the top of a note is NOT a separately-skipped region. Inline code spans (`` `...` ``) and indented code blocks are also treated as prose.
- **Eligible files**: `.md` extension (case-insensitive) AND every path segment NOT starting with `.` (skips `.obsidian/`, `.trash/`, etc.).
- **Per-note atomic writes** via temp + rename. If a write fails mid-batch, the in-flight file is rolled back but previously-written files are NOT — the response carries `partial: true` and lists the changed notes.

## Operator note — bound env var

The default upper bound on total occurrences is `500`. Operators tune it via `OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES` set in the MCP server's environment. Invalid values (non-integer, ≤ 0, empty) fall back to `500` with a WARN log. The env var is read lazily on first invocation and cached for the process lifetime — restart the server to change the bound.
