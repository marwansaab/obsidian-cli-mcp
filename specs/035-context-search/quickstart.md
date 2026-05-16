# Quickstart: `context_search`

**Branch**: `035-context-search`
**Date**: 2026-05-17

Caller-facing walkthroughs showing the four common use cases. Pair this with the help-tool entry (`help({ tool_name: "context_search" })`) which contains the full input/output contract and the failure roster.

## When to prefer `context_search` over `search`

| Use case | Prefer |
|----------|--------|
| "I need to know which files contain the keyword." | `search` (smaller payload; faster; lighter cap budget). |
| "I need the line number AND surrounding text for each match in ONE call." | `context_search` (this tool). |
| "I want to rank or filter matches at the agent layer before opening any file." | `context_search`. |
| "I want to migrate from the deprecated `search.context_lines=true` path." | `context_search` (drop the `context_lines` field; everything else carries over). |

## Walkthrough 1 — Minimal happy path

**Input**:

```json
{ "query": "TODO" }
```

**What happens**:
1. Input validates (non-empty `query`, ≤ 1000 chars).
2. Handler invokes `obsidian search:context query=TODO format=json limit=1000` against the currently-focused vault.
3. CLI returns the file-grouped JSON wire shape.
4. Handler filters to `.md`, flattens, strips trailing `\r` from each `text`, caps at 500 chars per line (`…` marker if exceeded), sorts by `(path, line)` ascending.

**Output**:

```json
{
  "count": 4,
  "matches": [
    { "path": "Daily/2026-05-17.md", "line": 8,  "text": "- [ ] TODO: ship BI-035 plan" },
    { "path": "Notes/release.md",    "line": 22, "text": "TODO: confirm release manager" },
    { "path": "Notes/release.md",    "line": 31, "text": "  - TODO: bump version in package.json" },
    { "path": "Projects/auth.md",    "line": 5,  "text": "Status: TODO" }
  ]
}
```

No `truncated` field — the underlying match set fit within the implicit cap of 1000.

## Walkthrough 2 — Folder-scoped + case-sensitive

**Input**:

```json
{ "query": "getUser", "folder": "Projects/api", "case_sensitive": true }
```

**What happens**:
1. Input validates.
2. Handler normalises `folder=Projects/api` (no leading/trailing `/` to strip).
3. Handler invokes `obsidian search:context query=getUser path=Projects/api case format=json limit=1000`.
4. Only `.md` files under the recursive `Projects/api/` subtree are searched; only lines matching `getUser` exactly (code-point-exact, both ASCII and non-ASCII) are returned.

**Output**:

```json
{
  "count": 2,
  "matches": [
    { "path": "Projects/api/auth/login.md",   "line": 12, "text": "function getUser(id) {" },
    { "path": "Projects/api/users/lookup.md", "line": 5,  "text": "getUser is the canonical resolver." }
  ]
}
```

Note: a file at `projects/api/...` (lowercase `p`) would NOT be returned — folder matching is case-sensitive (FR-003 + R5 inherited from BI-033). The CLI's `path=` flag enforces segment-boundary protection, so `folder=Projects/ap` would NOT match `Projects/api/...`.

## Walkthrough 3 — Capped + truncated

**Input**:

```json
{ "query": "the", "limit": 50 }
```

**What happens**:
1. Input validates (`limit=50` within `1..10000`).
2. Handler invokes `obsidian search:context query=the format=json limit=50`. (Line mode passes the cap directly; default mode would pass cap+1 — but `context_search` is line-mode-only, parity with BI-033's line-mode pipeline.)
3. Upstream returns at most 50 files. Handler flattens, applies the conservative `truncated` heuristic (`cliFileCapFired OR flatExceedsCap`).

**Output** (truncated):

```json
{
  "count": 50,
  "matches": [
    { "path": "Daily/2024-01-01.md", "line": 3, "text": "the morning routine continues..." },
    "...",
    { "path": "Worknotes/team.md", "line": 17, "text": "the team agreed to ..." }
  ],
  "truncated": true
}
```

**Caller's recourse**: raise `limit` (up to 10000), narrow `folder`, or accept the truncation and re-query for specific subsets.

**Output** (under cap):

```json
{
  "count": 12,
  "matches": [ "..." ]
}
```

The `truncated` field is absent when the underlying match set fit within the applied cap.

## Walkthrough 4 — Folder-not-found error path (FR-013)

**Input**:

```json
{ "query": "anything", "folder": "DoesNotExist" }
```

**What happens**:
1. Input validates (`folder=DoesNotExist` is a syntactically valid non-empty string).
2. Handler normalises (no slashes to strip).
3. Handler invokes `obsidian search:context query=anything path=DoesNotExist format=json limit=1000`.
4. Upstream returns stdout `"No matches found.\n"` (the zero-match sentinel).
5. Handler detects sentinel AND notices `input.folder` was supplied → invokes the existence probe: `obsidian folder path=DoesNotExist`.
6. Upstream `folder` returns stdout `Error: Folder "DoesNotExist" not found.` with exit 0.
7. The dispatch-layer classifier in `_dispatch.ts:308-318` priority (c) catches the `Error:` prefix and throws `UpstreamError(code: "CLI_REPORTED_ERROR", details: { ..., message: 'Error: Folder "DoesNotExist" not found.' })`.
8. Handler propagates the error verbatim — no wrapping, no re-classification.

**Error envelope** (returned to the MCP caller as the SDK's error-response shape):

```json
{
  "code": "CLI_REPORTED_ERROR",
  "message": "Error: Folder \"DoesNotExist\" not found.",
  "details": {
    "argv": ["obsidian", "vault=...", "folder", "path=DoesNotExist"],
    "command": "folder",
    "stdout": "Error: Folder \"DoesNotExist\" not found.\n",
    "stderr": "",
    "exitCode": 0,
    "message": "Error: Folder \"DoesNotExist\" not found."
  }
}
```

**Distinguishing folder-not-found from no-matches**:

| Outcome | Response | Detect via |
|---------|----------|-----------|
| Folder exists, matches found | `{count: N, matches: [...]}` | `count > 0` |
| Folder exists, no matches | `{count: 0, matches: []}` | `count === 0` + no error thrown |
| Folder missing | `UpstreamError` | `code === "CLI_REPORTED_ERROR"` + `details.message.startsWith('Error: Folder ')` |
| Vault missing | `UpstreamError` | `code === "CLI_REPORTED_ERROR"` + `details.message === "Vault not found."` |

## Walkthrough 5 — Mixed CRLF / LF source

**Input**:

```json
{ "query": "Hello", "vault": "WorkNotes" }
```

**Vault contents** (synthesised for the example):

- `Notes/win.md` (CRLF endings): line 1 `Hello world\r\n`.
- `Notes/mac.md` (LF endings): line 1 `Hello there\n`.

**Output**:

```json
{
  "count": 2,
  "matches": [
    { "path": "Notes/mac.md", "line": 1, "text": "Hello there" },
    { "path": "Notes/win.md", "line": 1, "text": "Hello world" }
  ]
}
```

Both `text` fields are `\r`-free. The Windows-CRLF source's trailing `\r` was stripped wrapper-side (FR-012 / R5). Indented Markdown lists, code-block content, and intentional trailing spaces (Markdown hard-break) are preserved verbatim — only the trailing `\r` is stripped.

## Migration from `search` with `context_lines=true`

If you currently call:

```json
{ "query": "TODO", "context_lines": true, "limit": 50, "folder": "Notes" }
```

against the `search` tool, migrate by:

1. Change the tool name from `search` to `context_search`.
2. Drop the `context_lines` field.

Same response shape; same `truncated` semantics; identical sort order. Two behavioural differences:

- **CRLF strip** (FR-012): the new tool strips trailing `\r` from `text`; `search`'s line-mode does not. Snapshot tests asserting verbatim `\r` will need to be updated.
- **Folder-not-found** (FR-013): the new tool surfaces a structured `CLI_REPORTED_ERROR` for a missing folder; `search`'s line-mode returns `count=0`. Tests / agents asserting `count=0` on a missing-folder input will see an error envelope instead.

Both differences are deliberate per the spec's 2026-05-17 clarifications (Q1=B keeps `search` unchanged; Q3=B adds the strip on the new tool; the spec-introduced FR-013 mandates the structured error on the new tool).

## Failure roster (summary)

See [contracts/errors.md](contracts/errors.md) for the full envelope shapes.

| Trigger | Code | Sub-signal |
|---------|------|-----------|
| Empty / whitespace-only `query`, `query` > 1000 chars, `limit` out of range, unknown key | `VALIDATION_ERROR` | `issues[]` |
| Missing folder | `CLI_REPORTED_ERROR` | `details.message.startsWith('Error: Folder ')` |
| Missing vault | `CLI_REPORTED_ERROR` | `details.message === "Vault not found."` |
| Malformed CLI JSON | `CLI_REPORTED_ERROR` | `details.stage === "json-parse"` |
| Wire-shape mismatch | `CLI_REPORTED_ERROR` | `details.stage === "wire-parse"` |
| CLI binary missing / timeout / output-too-large / non-zero exit | (inherited) | (inherited) |

No new top-level codes; no new `details.code` values. Eighteen typed-tools across the project share this envelope set.
