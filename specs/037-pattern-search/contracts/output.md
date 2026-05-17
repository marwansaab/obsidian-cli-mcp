# Output Contract: pattern_search

**Feature**: 037-pattern-search
**Date**: 2026-05-17
**Source of truth**: `src/tools/pattern_search/schema.ts` — `patternSearchOutputSchema`.

---

## Response envelope (happy path)

```json
{
  "count": <integer ≥ 0>,
  "matches": [
    {
      "path": "<vault-relative .md path>",
      "line": <integer ≥ 1>,
      "offset": <integer ≥ 0>,
      "match": "<matched substring, never capped>",
      "text": "<full line, capped at 500 UTF-16 + `…`>"
    }
  ],
  "truncated": true        // present only when truncation fired
}
```

## Field semantics

### `count`

Equals `matches.length`. A zod `.refine()` enforces this invariant at the response boundary — divergence is a wrapper bug. Agents that only need the result size read `count` without iterating `matches`.

### `matches`

Ordered array of `PatternSearchMatch` entries. Sort key: **`(path asc UTF-16, line asc, offset asc)`** — see [research.md](../research.md) R2. Deterministic across repeated calls with the same input and stable vault state (SC-003).

#### Per-match fields

- **`path`** — vault-relative path to the `.md` note containing the match. Sibling parity with `context_search.matches[].path`.
- **`line`** — 1-based line number within the note. Sibling parity with `context_search.matches[].line`.
- **`offset`** — 0-based start offset of the match within the original (pre-clip) line. New field vs `context_search`; required by FR-003 to disambiguate multiple matches on the same line.
- **`match`** — the substring that matched the pattern. Emitted verbatim from the regex engine. **Never capped.** Zero-length matches are skipped at the eval-template layer (FR-016), so `match` always has `.length >= 1`.
- **`text`** — the full line containing the match. Capped at 500 UTF-16 code units with a trailing `…` (U+2026) when the original line is longer (Q2 / BI-033 FR-024 parity). Any single trailing `\r` is stripped before the cap is measured (cross-platform CRLF defence, sibling parity with BI-033 FR-012 / BI-035).

#### Edge case: match begins after the 500-char cap

When `offset >= 500`, the `text` field's clipped prefix does not include the matched region. The `match` field still carries the matched substring intact — agents act on `match` directly, and use `path`/`line` to read the full note when surrounding context is required.

### `truncated`

Discriminant for SC-003.

- **Present and `true`**: the underlying match-set could have produced more entries than the applied cap (`input.limit ?? 1000`). The `matches` array is the deterministic prefix per the R2 sort order; further matches exist that the response did not include.
- **Absent (or `false`, though the field is `z.literal(true).optional()` so it is normally omitted)**: the response is complete — every match the pattern produced against the scope is in `matches`.

Agents must treat the absence of `truncated` as equivalent to `false` (sibling parity with `context_search.truncated` and `search.truncated`).

## Invariants

| Invariant | Enforcement |
|---|---|
| `count === matches.length` | zod `.refine()` at output boundary |
| `matches.length <= applied-cap` | eval template stops collecting at cap |
| `matches` sorted by `(path, line, offset)` asc | wrapper-side `.sort()` after wire-parse |
| `truncated` present ⇔ collection stopped at cap | eval template sets the flag |
| `match.length >= 1` | FR-016 zero-length skip in eval template |
| `text.length <= 501` | 500-char prefix + 1-char `…` |
| Every `path` ends in `.md` (case-insensitive on extension) | template `getMarkdownFiles()` + defensive wrapper filter (R6) |

## Examples

### Happy path with multiple matches

```json
{
  "count": 3,
  "matches": [
    {
      "path": "Projects/Notes.md",
      "line": 17,
      "offset": 4,
      "match": "BI-0042",
      "text": "See BI-0042 for the rationale."
    },
    {
      "path": "Projects/Notes.md",
      "line": 23,
      "offset": 0,
      "match": "BI-0043",
      "text": "BI-0043 supersedes the earlier decision."
    },
    {
      "path": "References.md",
      "line": 8,
      "offset": 12,
      "match": "BI-0042",
      "text": "Cross-ref: BI-0042 (Projects/Notes.md)."
    }
  ]
}
```

### Truncated result

```json
{
  "count": 50,
  "matches": [ /* 50 entries */ ],
  "truncated": true
}
```

Agent reading this knows more matches exist beyond the 50 returned. The 50 are the deterministic prefix in `(path, line, offset)` order.

### Zero-match success (not an error)

```json
{ "count": 0, "matches": [] }
```

Per FR-009 — `truncated` is absent, the result is complete and empty.

### Two matches on the same line, disambiguated by `offset`

Input: `{ "pattern": "foo" }` against a note with line 1 = `"foo and foo again"`.

```json
{
  "count": 2,
  "matches": [
    { "path": "Note.md", "line": 1, "offset": 0, "match": "foo", "text": "foo and foo again" },
    { "path": "Note.md", "line": 1, "offset": 8, "match": "foo", "text": "foo and foo again" }
  ]
}
```

Both entries carry the same `text` (full line, identical for both occurrences) but differ in `offset` and are sorted by `offset` ascending.

### Match begins after the 500-char cap

Input: `{ "pattern": "needle" }` against a note with line 1 = `"<540 chars of fluff>needle<remainder>"` (the `needle` substring starts at offset 540).

```json
{
  "count": 1,
  "matches": [
    {
      "path": "Long.md",
      "line": 1,
      "offset": 540,
      "match": "needle",
      "text": "<first 500 chars of fluff>…"
    }
  ]
}
```

`text` is clipped; `match` is intact. The agent uses `path` + `line` to read the note for surrounding context if needed.

## Sibling-tool divergences

| Field | `pattern_search` | `context_search` (BI-035) | `search` line-mode (BI-033) |
|---|---|---|---|
| Per-match fields | `path, line, offset, match, text` | `path, line, text` | `path, line, text` |
| Match keying | per occurrence on a line (FR-003) | per line (collapsed) | per line (collapsed) |
| `truncated` semantics | template-owned cap-fired flag | conservative cli-file-cap + flat-exceeds-cap | conservative cli-file-cap probe |
| Sort order | `(path, line, offset)` asc | `(path, line)` asc | `(path, line)` asc |
| `text` cap | 500 + `…` | 500 + `…` | 500 + `…` |

The two new degrees of freedom relative to sibling tools — `offset` and per-occurrence keying — are the direct consequence of supporting regex (where one line can yield multiple non-overlapping matches that differ only in offset and substring).
