# Contract: `context_search` Output

**Branch**: `035-context-search`
**Date**: 2026-05-17
**Source of truth**: `src/tools/context_search/schema.ts` (`contextSearchOutputSchema`); this file is a human-readable mirror.

## Success shape (JSON Schema-style)

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["count", "matches"],
  "properties": {
    "count": {
      "type": "integer",
      "minimum": 0,
      "description": "Number of entries in 'matches'. Always equals matches.length (post-cap, post-strip, post-sort). FR-002."
    },
    "matches": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["path", "line", "text"],
        "properties": {
          "path": {
            "type": "string",
            "minLength": 1,
            "description": "Vault-relative path with forward-slash separators. Always ends in '.md' (FR-017 corpus restriction)."
          },
          "line": {
            "type": "integer",
            "minimum": 1,
            "description": "1-based line number of the matching line in the file. FR-002."
          },
          "text": {
            "type": "string",
            "description": "The matching line's content. Single trailing '\\r' stripped (CRLF normalisation, FR-012). Other whitespace preserved verbatim. Capped at 500 characters + a trailing '…' (U+2026, single char) marker — final length 501 on capped lines."
          }
        }
      }
    },
    "truncated": {
      "type": "boolean",
      "const": true,
      "description": "Present (and === true) only when the underlying pre-cap match set exceeded the applied cap (FR-011). Absent === false. Callers MUST treat absence as 'no truncation occurred'."
    }
  }
}
```

## Refinement (zod-encoded)

`contextSearchOutputSchema.refine((o) => o.count === o.matches.length, "count must equal matches.length")` — the count must always equal the post-cap, post-sort `matches.length`. This refinement fires at the output boundary AFTER the handler's pipeline has finished cap+strip+sort; a mismatch indicates a wrapper bug.

## Examples

**Single-match happy path**:

```json
{
  "count": 1,
  "matches": [
    { "path": "Notes/TODO.md", "line": 3, "text": "- [ ] TODO: confirm with marketing" }
  ]
}
```

**Multi-file, sorted by (path, line) ascending**:

```json
{
  "count": 3,
  "matches": [
    { "path": "Projects/api/auth.md", "line": 12, "text": "function getUser(id) {" },
    { "path": "Projects/api/auth.md", "line": 27, "text": "  return getUser(req.params.id);" },
    { "path": "Projects/api/users.md", "line": 5, "text": "getUser is the canonical resolver." }
  ]
}
```

**Capped + truncated**:

```json
{
  "count": 50,
  "matches": [
    { "path": "...", "line": 1, "text": "..." }
  ],
  "truncated": true
}
```

**Empty (no error)**:

```json
{ "count": 0, "matches": [] }
```

The `truncated` field is omitted when zero matches were found — there's nothing to truncate. Callers handle this case alongside any non-empty result; an empty `matches` array is a normal response, never an error.

**Capped line text** (length-501 example):

```json
{
  "count": 1,
  "matches": [
    {
      "path": "Notes/long-line.md",
      "line": 1,
      "text": "<500 characters of content>…"
    }
  ]
}
```

The trailing `…` (U+2026, single character) signals truncation occurred on this line specifically; the `truncated` array-level flag is independent (it fires when the *array* was clipped, not when an individual line's text was clipped).

## Locator-input echo rule

The output MUST NOT echo locator inputs:

- No `vault` field.
- No `query` field.
- No `folder` field.
- No `limit` field.
- No `case_sensitive` field.

This is the read-tool convention (memory: read tools don't echo locator). Callers reconstruct their inputs from their own request; the response is data-only.
