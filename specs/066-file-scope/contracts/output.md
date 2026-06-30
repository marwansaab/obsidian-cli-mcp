# Contract: `find_and_replace` Output (File-Scope Invariants)

**Feature**: `066-file-scope` · The output schema is **unchanged** from BI-038 — the same `z.discriminatedUnion("mode", [preview, commit])`. The single-note scope adds no field; it only constrains the data. This document records those constraints.

## Output shape (unchanged)

```jsonc
// preview branch
{ "mode": "preview",
  "affected_notes": [ { "path": "string", "occurrence_count": 1, "occurrences": [ /* … */ ] } ],
  "total_occurrences": 0 }

// commit branch
{ "mode": "commit",
  "changed_notes": [ "string" ],
  "total_occurrences_replaced": 0,
  "partial": false /*, "failing_note_locator"? when partial */ }
```

## Single-note invariants

- **Cardinality ≤ 1** (FR-009, SC-002): under any single-note scope (`file` / `path` / `active_note`), `affected_notes` (preview) and `changed_notes` (commit) carry **at most one** entry — zero when the pattern matched nothing in the target note, one (the target) when ≥ 1 match was found. The set never references any other note.
- **Zero-match is success** (FR-010): a single-note scope whose pattern matches nothing returns `{ mode: "preview", affected_notes: [], total_occurrences: 0 }` (or the commit equivalent) — a successful empty result, never an error.
- **Open-note locator** (FR-004 of this spec / US2-AC1): when `active_note` resolves, the single entry's `path` (preview) / `changed_notes[0]` (commit) is the resolved open note's vault-relative path — i.e., the response reports that note's location.
- **Preview is early confirmation** (FR-010): under a single-note scope a preview affects ≤ 1 note, giving the caller confirmation the scope is correct before commit.
- **Ordering / per-occurrence shape**: unchanged from BI-038 (path-ascending across notes — trivially ≤ 1 here; line-then-offset ascending within the note; `full_line` clipped to 500 + `…`, `matched_substring`/`replacement_substring` uncapped).
- **Byte-for-byte preservation** (FR-011): the commit rewrite of the one note preserves every unmatched byte (line endings, trailing-newline, BOM) exactly as BI-038.

## Non-target notes

Under a single-note scope, **no other note** appears in the output and **no other note** is read or written (SC-001): every note except the target is byte-for-byte and mtime unchanged after preview or commit.
