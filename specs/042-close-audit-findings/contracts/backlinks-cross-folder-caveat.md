# Contract: `backlinks` cross-folder reach caveat

**Story**: User Story 7 (FR-021)
**Surface**: `docs/tools/backlinks.md` + (if a feature spec page exists for backlinks) `specs/036-get-backlinks/spec.md`
**Runtime change**: none

## Doc-edit deliverable

A new subsection titled "Cross-folder reach" (or "Bare-basename wikilink resolution scope") is added to `docs/tools/backlinks.md` in the output-contract neighbourhood — near the `truncated` and `source`/`backlinks` field descriptions. Canonical text:

> ### Cross-folder reach
>
> When a target note's filename basename is unique vault-wide, `backlinks` returns every cross-folder source that references the target via the bare-basename wikilink syntax `[[<basename>]]`, NOT only sources in the same folder as the target.
>
> This is because the wrapper defers to Obsidian's underlying wikilink resolution mechanism, which is vault-scoped, not folder-scoped, when the basename is unique. The wrapper does NOT folder-scope the source set.
>
> Agents writing folder-scoped recovery logic against the returned source list must filter the result themselves — for example, by keeping only sources whose `source` field shares a path prefix with the target. A folder-scoped backlink count cannot be derived without that filter.

The text is placed AFTER the existing field-table for the response shape and BEFORE the error-roster section.

## Probe evidence

Against a fixture vault with:
- A target note `notes/target.md` whose basename `target` is unique vault-wide.
- A source note `notes/local/source-a.md` containing `[[target]]` (same folder).
- A source note `other/source-b.md` containing `[[target]]` (different folder).

The expected wrapper response:
```jsonc
{
  "target": "notes/target.md",
  "backlinks": [
    { "source": "notes/local/source-a.md", "line": <n>, "text": "..." },
    { "source": "other/source-b.md", "line": <n>, "text": "..." }
  ],
  "count": 2
}
```

Probe record persisted to `backlinks-cross-folder-evidence.md` during `/speckit-implement`.

## Out-of-scope reminder (explicit)

The fragment-bearing-wikilink `displayText` surfacing concern referenced in the spec's Out of Scope ships separately under its own predecessor. The Cross-folder reach caveat does NOT mention `displayText` semantics.
