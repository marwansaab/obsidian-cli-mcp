# Quickstart: pattern_search

**Feature**: 037-pattern-search
**Date**: 2026-05-17

Manual quickstart scenarios for verifying `pattern_search` behaviour against a real vault during `/speckit-implement` and post-merge smoke testing. Per CLAUDE.md `## Test Execution`, these scenarios run against the **authorised test vault** named in [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) using the scratch subdirectory protocol there — do **not** run them against a production vault.

In-process unit tests with mocked `invokeCli` are the primary regression net; these quickstart scenarios are the live-CLI characterisation gate that confirms the wrapper-side contract matches the Obsidian-side reality.

---

## Prereqs

- Authorised test vault open in Obsidian (per `.memory/test-execution-instructions.md`).
- `obsidian-cli-mcp` server bound to the test vault (focused vault, or pass `vault: "<test-vault-name>"`).
- The seed notes documented below placed under the scratch subdirectory of the test vault.

### Seed notes (one-time setup)

Create the following notes under the test vault's scratch subdirectory before running the scenarios:

| Path | Content |
|---|---|
| `_scratch/037/bi-tokens.md` | Three lines containing `BI-0042`, `BI-0043`, and `Reference to BI-0099 in this line.` |
| `_scratch/037/long-line.md` | One line of 540 characters with the substring `needle` starting at offset 540 |
| `_scratch/037/multi-match.md` | One line `foo and foo again and foo` |
| `_scratch/037/case-mix.md` | Two lines: `TODO: write docs` and `todo: lowercase variant` |

---

## Scenario 1 — Happy path: BI-token cross-reference

**Goal**: Verify per-line, per-occurrence emission with `(path, line, offset)` ordering.

```json
{ "pattern": "BI-\\d{4}" }
```

**Expected response shape**:

```json
{
  "count": <≥ 3>,
  "matches": [
    { "path": "_scratch/037/bi-tokens.md", "line": 1, "offset": 0,  "match": "BI-0042", "text": "BI-0042" },
    { "path": "_scratch/037/bi-tokens.md", "line": 2, "offset": 0,  "match": "BI-0043", "text": "BI-0043" },
    { "path": "_scratch/037/bi-tokens.md", "line": 3, "offset": 13, "match": "BI-0099", "text": "Reference to BI-0099 in this line." }
    // … plus any pre-existing BI-NNNN references the test vault carries
  ]
}
```

**Pass criteria**:

- Every BI-NNNN occurrence under the scratch subdirectory appears.
- Order is `(path, line, offset)` ascending.
- `match` carries the full token; `text` carries the full line.
- `truncated` is absent.

---

## Scenario 2 — Zero-length match skip

**Goal**: Verify FR-016 (zero-length matches are skipped, the call still terminates).

```json
{ "pattern": "^", "folder": "_scratch/037" }
```

**Expected response**:

```json
{ "count": 0, "matches": [] }
```

**Pass criteria**:

- Empty result — the line-start anchor matches at every line position with zero-width, all of which are dropped.
- No `truncated` flag, no error.
- The call returns within the cli-adapter's 10-second bound (FR-016 termination guarantee).

---

## Scenario 3 — Folder scope + case-insensitive flag

**Goal**: Verify FR-006, FR-007, FR-011.

```json
{
  "pattern": "TODO",
  "folder": "_scratch/037",
  "case_sensitive": false
}
```

**Expected response** (against `case-mix.md`):

```json
{
  "count": 2,
  "matches": [
    { "path": "_scratch/037/case-mix.md", "line": 1, "offset": 0, "match": "TODO", "text": "TODO: write docs" },
    { "path": "_scratch/037/case-mix.md", "line": 2, "offset": 0, "match": "todo", "text": "todo: lowercase variant" }
  ]
}
```

**Pass criteria**:

- Both `TODO` and `todo` appear (FR-007 case-insensitive).
- No matches from outside `_scratch/037` (FR-006 scope).
- `match` carries the as-encountered case (`TODO` for line 1, `todo` for line 2) — the regex engine reports the matched substring as it appeared in the source.

---

## Scenario 4 — Folder not found

**Goal**: Verify FR-011 typed error.

```json
{ "pattern": "anything", "folder": "_scratch/no-such-folder" }
```

**Expected error envelope**:

```json
{
  "isError": true,
  "code": "CLI_REPORTED_ERROR",
  "message": "pattern_search: folder not found in vault",
  "details": {
    "code": "FOLDER_NOT_FOUND",
    "folder": "_scratch/no-such-folder",
    "stage": "handler-stage-3"
  }
}
```

**Pass criteria**:

- `code === "CLI_REPORTED_ERROR"`.
- `details.code === "FOLDER_NOT_FOUND"`.
- `details.folder` echoes the unknown folder verbatim.
- Result is **not** an empty success — the agent can distinguish "wrong folder" from "no matches".

---

## Scenario 5 — Invalid pattern

**Goal**: Verify FR-010 (invalid pattern → typed error, no partial matches).

```json
{ "pattern": "BI-(\\d{4}" }
```

(Unbalanced parenthesis.)

**Expected error envelope**:

```json
{
  "isError": true,
  "code": "VALIDATION_ERROR",
  "message": "pattern_search input failed schema validation",
  "details": {
    "issues": [
      {
        "path": ["pattern"],
        "message": "Invalid regular expression: /BI-(\\d{4}/: Unterminated group",
        "code": "custom"
      }
    ]
  }
}
```

**Pass criteria**:

- `code === "VALIDATION_ERROR"` (NOT `CLI_REPORTED_ERROR`).
- `details.issues[0].path === ["pattern"]`.
- `details.issues[0].message` carries the Node `SyntaxError.message` verbatim.
- No partial matches anywhere in the envelope.

---

## Scenario 6 — Long-line cap

**Goal**: Verify Q2 / R10 line-cap with `…` marker; match field never capped.

```json
{ "pattern": "needle", "folder": "_scratch/037" }
```

**Expected response**:

```json
{
  "count": 1,
  "matches": [
    {
      "path": "_scratch/037/long-line.md",
      "line": 1,
      "offset": 540,
      "match": "needle",
      "text": "<first 500 chars of fluff>…"
    }
  ]
}
```

**Pass criteria**:

- `text.length === 501` (500 chars + the `…` U+2026 marker).
- `match === "needle"` — intact even though the match's offset is past the 500-char cap.
- The agent can read `path` + `line` to retrieve the full note if surrounding context is required.

---

## Scenario 7 — Multi-match per line with offset ordering

**Goal**: Verify FR-003 per-occurrence keying + R2 offset tie-break ordering.

```json
{ "pattern": "foo", "folder": "_scratch/037" }
```

**Expected response** (against `multi-match.md`):

```json
{
  "count": 3,
  "matches": [
    { "path": "_scratch/037/multi-match.md", "line": 1, "offset": 0,  "match": "foo", "text": "foo and foo again and foo" },
    { "path": "_scratch/037/multi-match.md", "line": 1, "offset": 8,  "match": "foo", "text": "foo and foo again and foo" },
    { "path": "_scratch/037/multi-match.md", "line": 1, "offset": 22, "match": "foo", "text": "foo and foo again and foo" }
  ]
}
```

**Pass criteria**:

- Three entries for one line (FR-003 per-occurrence emission).
- Entries sorted by `offset` ascending (R2 tie-break).
- All three entries share the same `text` value.

---

## Scenario 8 — Truncation flag

**Goal**: Verify FR-008 / SC-003 truncation discriminant.

Pre-populate `_scratch/037/many-hits.md` with 1500 lines, each containing the literal `truncate-me`. Then:

```json
{ "pattern": "truncate-me", "folder": "_scratch/037" }
```

**Expected response**:

```json
{
  "count": 1000,
  "matches": [ /* 1000 entries */ ],
  "truncated": true
}
```

Then with explicit `limit: 5`:

```json
{ "pattern": "truncate-me", "folder": "_scratch/037", "limit": 5 }
```

```json
{
  "count": 5,
  "matches": [ /* 5 entries */ ],
  "truncated": true
}
```

Then with explicit `limit: 5000`:

```json
{ "pattern": "truncate-me", "folder": "_scratch/037", "limit": 5000 }
```

```json
{ "count": 1500, "matches": [ /* 1500 entries */ ] }
```

(No `truncated` flag because the underlying set fits within the cap.)

**Pass criteria**:

- `count === matches.length` in every response.
- `truncated: true` present iff `count === applied-cap` AND more matches exist.
- Explicit `limit` overrides the implicit 1000 cap in both directions.

---

## Cleanup

Delete the `_scratch/037/` subdirectory after the run per the cleanup protocol in `.memory/test-execution-instructions.md`. The scratch directory is the only mutation the quickstart introduces; the rest of the test vault is untouched.
