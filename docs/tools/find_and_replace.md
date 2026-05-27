# `find_and_replace`

Preview-then-commit find-and-replace across every eligible `.md` note in a vault (or under a named subfolder), with fenced code blocks and HTML comments skipped by default.

> **CRITICAL — vault-wide scope, no single-file mode.** This tool replaces matches across EVERY eligible `.md` file in the vault (or the named `subfolder`). There is NO single-file scoping option — `subfolder: "Drafts"` still matches every file under `Drafts/` recursively. Agents have corrupted unintended files by committing wide-pattern replacements without previewing first. For single-file edits, prefer this pattern instead:
>
> 1. [`read`](./read.md) the target file's content.
> 2. Construct the rewritten content client-side.
> 3. [`write_note`](./write_note.md) with `overwrite: true` and the rewritten content.
>
> When using `find_and_replace`, ALWAYS issue a preview first (default — omit `commit` or set `commit: false`). Inspect `affected_notes` for unexpected paths. Only set `commit: true` once the preview matches your intent.

## When to use this tool

| You want to | Reach for |
|---|---|
| Bulk vault refactor (ADR rename, wikilink retarget, symbol rename) | `find_and_replace` (with preview first) |
| Edit one specific file's contents | [`read`](./read.md) + [`write_note`](./write_note.md) with `overwrite: true` |
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
| `subfolder` | string | N | — | Vault-relative; structurally validated + canonicalised. Path-traversal rejected. Missing folder rejected. |
| `include_code_blocks` | boolean | N | `false` | Opt back in to fenced code block occurrences. |
| `include_html_comments` | boolean | N | `false` | Opt back in to HTML comment occurrences. |
| `commit` | boolean | N | `false` | Preview when false/absent; rewrite on disk when true. |
| `vault` | string | N | — | Focused vault when absent. |

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

## Behavioural notes

- **Line-scoped only** — `\n` in `pattern` does NOT match cross-line; line endings are preserved byte-for-byte.
- **Zero-width regex matches** (`a*`, `^`, `$`, `\b`, lookarounds) are skipped — they never produce occurrences.
- **Frontmatter is treated as PROSE** — `---`-delimited YAML at the top of a note is NOT a separately-skipped region. Inline code spans (`` `...` ``) and indented code blocks are also treated as prose.
- **Eligible files**: `.md` extension (case-insensitive) AND every path segment NOT starting with `.` (skips `.obsidian/`, `.trash/`, etc.).
- **Per-note atomic writes** via temp + rename. If a write fails mid-batch, the in-flight file is rolled back but previously-written files are NOT — the response carries `partial: true` and lists the changed notes.

## Operator note — bound env var

The default upper bound on total occurrences is `500`. Operators tune it via `OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES` set in the MCP server's environment. Invalid values (non-integer, ≤ 0, empty) fall back to `500` with a WARN log. The env var is read lazily on first invocation and cached for the process lifetime — restart the server to change the bound.
