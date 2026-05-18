# Output Contract — find_and_replace

**Branch**: `038-find-replace`
**Schema source of truth**: `src/tools/find_and_replace/schema.ts` — `findAndReplaceOutputSchema` (per Constitution Principle III).

The response envelope is a single Zod discriminated union keyed on a top-level `mode: "preview" | "commit"` literal (FR-025). Both branches share a single schema — agents type-narrow on the literal.

## Discriminator

```json
{ "mode": "preview" }   // or
{ "mode": "commit" }
```

## Preview branch (`mode: "preview"`)

Returned when `commit: false` (or absent).

```json
{
  "mode": "preview",
  "affected_notes": [ /* AffectedNote[] */ ],
  "total_occurrences": 7
}
```

### Fields

| Field | Type | FR | Notes |
|---|---|---|---|
| `mode` | `"preview"` (literal) | FR-025 | Discriminator. |
| `affected_notes` | `AffectedNote[]` | FR-004 | Ascending lexicographic order of vault-relative path. Empty array when nothing matches. |
| `total_occurrences` | `number` (int ≥ 0) | FR-004, FR-011 | Sum of per-note occurrence counts. Guaranteed ≤ the safe upper bound (else the operation would have refused with the bound-exceeded error). |

### `AffectedNote`

```json
{
  "path": "Decisions/ADR-0042 - Some Decision.md",
  "occurrence_count": 3,
  "occurrences": [ /* Occurrence[] */ ]
}
```

| Field | Type | FR | Notes |
|---|---|---|---|
| `path` | `string` | FR-004 | Vault-relative locator with forward-slash separators. |
| `occurrence_count` | `number` (int ≥ 1) | FR-004 | Non-zero by construction. |
| `occurrences` | `Occurrence[]` | FR-004 | Ascending `line_number`; within a line, ascending byte offset. |

### `Occurrence`

```json
{
  "line_number": 12,
  "full_line": "See [[ADR-0042]] for the decision rationale.",
  "matched_substring": "ADR-0042",
  "replacement_substring": "ADR-0089"
}
```

| Field | Type | FR | Notes |
|---|---|---|---|
| `line_number` | `number` (int ≥ 1) | FR-004 | 1-based line number. |
| `full_line` | `string` | FR-004 | Trailing `\r` stripped (BI-035 FR-012 parity). Clipped at 500 UTF-16 code units with `…` (U+2026) marker when source > 500 (BI-033 FR-024 / BI-037 FR-005 parity). |
| `matched_substring` | `string` | FR-004 | Never clipped — the exact bytes the pattern matched, even when surrounding `full_line` is clipped. |
| `replacement_substring` | `string` | FR-002, FR-004 | What would be written if the caller commits. Never clipped. |

## Commit branch (`mode: "commit"`)

Returned when `commit: true`.

### Full-batch success (`partial: false`)

```json
{
  "mode": "commit",
  "changed_notes": [
    "Decisions/ADR-0042 - Some Decision.md",
    "Inbox/Notes/wiki-refs.md"
  ],
  "total_occurrences_replaced": 7,
  "partial": false
}
```

### Halted mid-batch (`partial: true`)

```json
{
  "mode": "commit",
  "changed_notes": [ "Decisions/ADR-0042 - Some Decision.md" ],
  "total_occurrences_replaced": 3,
  "partial": true,
  "failing_note_locator": "Inbox/Notes/wiki-refs.md"
}
```

Accompanied by the `FS_WRITE_FAILED` error envelope (see [errors.md](errors.md)).

### Fields

| Field | Type | FR | Notes |
|---|---|---|---|
| `mode` | `"commit"` (literal) | FR-025 | Discriminator. |
| `changed_notes` | `string[]` | FR-005 | Locators of notes that were successfully written. Ascending lexicographic order. |
| `total_occurrences_replaced` | `number` (int ≥ 0) | FR-005 | Sum across all `changed_notes`. |
| `partial` | `boolean` | FR-025, FR-021 | `false` for full-batch success; `true` when an FS_WRITE_FAILED halted mid-batch. |
| `failing_note_locator` | `string` (optional) | FR-021, FR-025 | Present IFF `partial === true`. Carries the locator of the note whose write failed. |

**Schema invariant**: `failing_note_locator` is present IFF `partial === true`. Enforced via `.refine` predicate on the commit branch.

## Ordering invariants

Both branches preserve the ascending-lexicographic-vault-relative-path ordering (FR-004 / FR-005):

- `affected_notes[i].path < affected_notes[i+1].path` (string compare on UTF-16 code units).
- `changed_notes[i] < changed_notes[i+1]`.

Within each `AffectedNote`:

- `occurrences[i].line_number ≤ occurrences[i+1].line_number`.
- Within a single line, occurrences appear in ascending byte-offset order — the per-line iteration order from the regex engine, which is left-to-right.

Determinism: the ordering is stable across runs against the same vault content. The same input + same vault state produces the same response byte-for-byte.

## Empty success

When the pattern matches nothing in the chosen scope:

- Preview: `{ "mode": "preview", "affected_notes": [], "total_occurrences": 0 }`.
- Commit: `{ "mode": "commit", "changed_notes": [], "total_occurrences_replaced": 0, "partial": false }`.

Neither is an error per FR-009 / FR-005. SC-007 enforces this: zero-match returns a successful empty result 100% of the time.

## Worked examples

### Preview, three notes affected

```json
{
  "mode": "preview",
  "affected_notes": [
    {
      "path": "Decisions/ADR-0042 - Old Decision.md",
      "occurrence_count": 2,
      "occurrences": [
        { "line_number": 4,  "full_line": "See ADR-0042 for prior context.",   "matched_substring": "ADR-0042", "replacement_substring": "ADR-0089" },
        { "line_number": 17, "full_line": "Superseded by ADR-0042 → ADR-...",   "matched_substring": "ADR-0042", "replacement_substring": "ADR-0089" }
      ]
    },
    {
      "path": "Inbox/notes/wiki-refs.md",
      "occurrence_count": 1,
      "occurrences": [
        { "line_number": 3, "full_line": "[[ADR-0042]] — rename target",       "matched_substring": "ADR-0042", "replacement_substring": "ADR-0089" }
      ]
    }
  ],
  "total_occurrences": 3
}
```

### Commit, full success

```json
{
  "mode": "commit",
  "changed_notes": [
    "Decisions/ADR-0042 - Old Decision.md",
    "Inbox/notes/wiki-refs.md"
  ],
  "total_occurrences_replaced": 3,
  "partial": false
}
```

### Commit, halted by ENOSPC

```json
{
  "mode": "commit",
  "changed_notes": [ "Decisions/ADR-0042 - Old Decision.md" ],
  "total_occurrences_replaced": 2,
  "partial": true,
  "failing_note_locator": "Inbox/notes/wiki-refs.md"
}
```

Returned alongside an `UpstreamError` with `code: "FS_WRITE_FAILED"`, `details.errno: "ENOSPC"`.

### Empty preview

```json
{
  "mode": "preview",
  "affected_notes": [],
  "total_occurrences": 0
}
```
