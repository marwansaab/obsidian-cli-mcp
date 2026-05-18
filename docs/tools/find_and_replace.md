# find_and_replace

Preview-then-commit find-and-replace across every eligible `.md` note in a vault (or under a named subfolder), with fenced code blocks and HTML comments skipped by default. The project's first preview-then-commit surface.

## When to reach for this tool

Use `find_and_replace` for bulk vault refactors that would otherwise require hand-rewriting each note or out-of-band scripting:

- ADR rename / number change across cross-references.
- Wikilink retarget after a note moved or a heading changed.
- Symbol rename in prose and (opt-in) in fenced code samples.
- Frontmatter-key migration when the key appears identically across many notes (frontmatter is treated as prose — see FR-018).

The preview default + explicit `commit: true` opt-in protect against accidental mutation; the `OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES` bound caps the blast radius of an over-broad pattern; the two-scan drift check refuses a commit when vault content changed between preview and commit.

Sibling tool: `pattern_search` (BI-037) is the read-only regex-scan companion. Prefer `pattern_search` when you only need to find. Prefer `find_and_replace` when you need to find AND rewrite.

## Input shape

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `pattern` | string (1..1000 UTF-16 code units) | Y | — | Empty / over-cap / invalid-regex rejected at the input boundary. |
| `replacement` | string (0..1000 UTF-16 code units) | Y | — | Empty is valid (deletion). |
| `mode` | `"literal" \| "regex"` | N | `"literal"` | Regex: ECMAScript dialect. |
| `case_insensitive` | boolean | N | `false` | Parity with `pattern_search` BI-037 default. |
| `subfolder` | string | N | — | Vault-relative; structurally validated + canonicalised. |
| `include_code_blocks` | boolean | N | `false` | Opt back in to fenced code block occurrences. |
| `include_html_comments` | boolean | N | `false` | Opt back in to HTML comment occurrences. |
| `commit` | boolean | N | `false` | Preview when false/absent; rewrite on disk when true. |
| `vault` | string | N | — | Focused vault when absent. |

Full field-by-field detail: [`specs/038-find-replace/contracts/input.md`](../../specs/038-find-replace/contracts/input.md).

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

Full field-by-field detail: [`specs/038-find-replace/contracts/output.md`](../../specs/038-find-replace/contracts/output.md).

## Error cohort

Thirteen distinct `(top-level code, details.code, details.reason)` failure triples. All reuse existing top-level codes (`VALIDATION_ERROR`, `PATH_ESCAPES_VAULT`, `CLI_REPORTED_ERROR`, `FS_WRITE_FAILED`); no new top-level codes. Sub-discriminators per ADR-015:

| top-level | details.code | details.reason | trigger |
|---|---|---|---|
| `VALIDATION_ERROR` | `INVALID_PATTERN` | `empty` | empty `pattern` |
| `VALIDATION_ERROR` | `INVALID_PATTERN` | `too-long` | over 1000 UTF-16 code units |
| `VALIDATION_ERROR` | `INVALID_PATTERN` | `regex-syntax` | invalid ECMAScript regex (regex mode) |
| `VALIDATION_ERROR` | `INVALID_REPLACEMENT` | — | over 1000 UTF-16 code units |
| `VALIDATION_ERROR` | `INVALID_SUBFOLDER` | `path-traversal` | `../`, leading `/` or `\`, drive letter, control char |
| `VALIDATION_ERROR` | `INVALID_SUBFOLDER` | — | subfolder does not exist |
| `VALIDATION_ERROR` | `OCCURRENCE_COUNT_EXCEEDED` | — | total > `OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES` |
| `VALIDATION_ERROR` | `OCCURRENCE_COUNT_DRIFT` | — | first-scan count ≠ second-scan count |
| `PATH_ESCAPES_VAULT` | — | — | canonical path resolves outside vault root |
| `CLI_REPORTED_ERROR` | `VAULT_NOT_FOUND` | `unknown` | vault name not in registry |
| `CLI_REPORTED_ERROR` | `VAULT_NOT_FOUND` | `not-open` | vault registered but not currently open |
| `FS_WRITE_FAILED` | — | `read` | `fs.readFile` failed during scan |
| `FS_WRITE_FAILED` | — | `write` | `fs.writeFile` / `fs.rename` failed during commit (carries `details.partial: true` + `details.failing_note_locator` + `details.changed_notes` + `details.total_occurrences_replaced`) |

Full envelope examples: [`specs/038-find-replace/contracts/errors.md`](../../specs/038-find-replace/contracts/errors.md).

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

Whole-`Decisions/`-subtree, literal, fence + comment skipped by default, focused vault, preview only.

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

## Operator note — bound env var

The default upper bound on total occurrences is `500`. Operators tune it via `OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES` set in the MCP server's environment. Invalid values (non-integer, ≤ 0, empty) fall back to `500` with a WARN log naming the offending value. The env var is read lazily on first invocation and cached for the process lifetime — restart the server to change the bound.

## Quickstart scenarios

Six canonical scenarios characterising the user-facing surface against a real vault: [`specs/038-find-replace/quickstart.md`](../../specs/038-find-replace/quickstart.md).
