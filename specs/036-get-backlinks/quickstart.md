# Quickstart: `backlinks`

**Branch**: `036-get-backlinks`
**Date**: 2026-05-17
**Phase**: 1 (Design — Quickstart)

Caller-facing walkthroughs for the `backlinks` typed tool. Each scenario maps to one or more acceptance criteria from [spec.md](../spec.md) and verifies the corresponding Success Criteria. Scenarios run against the authorised `TestVault-Obsidian-CLI-MCP` per `.memory/test-execution-instructions.md`.

## Setup

The walkthroughs assume:
- The MCP server is running and the `backlinks` tool is registered.
- A vault `Demo` exists with the fixture notes described per-scenario.
- The Obsidian CLI binary is on PATH.

## Q-1 — Backlinks for a named target (default mode)

**Maps to**: US1 scenario 1, SC-001.

**Setup**: vault `Demo` contains
- `Notes/Target.md` — the target note.
- `Notes/A.md` — body: `Reference to [[Target]] here.`
- `Notes/B.md` — body: `See [[Target|aliased name]] for context.`
- `Notes/C.md` — body: `No reference to the target.`

**Invocation**:
```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Notes/Target.md"
}
```

**Expected response**:
```json
{
  "count": 2,
  "backlinks": [
    { "source": "Notes/A.md" },
    { "source": "Notes/B.md" }
  ]
}
```

`Notes/C.md` is absent (no reference). Per-source entries carry `source` only (no `count` — default `with_counts: false`). Order is `source` ascending UTF-16 code-unit (FR-008).

**Token-saving note (SC-021)**: this 2-source response is ~120 bytes (`{"count":2,"backlinks":[{"source":"Notes/A.md"},{"source":"Notes/B.md"}]}`). The equivalent vault-wide body-text grep for the literal string `Target` via `search` or `context_search` returns per-line match payloads spanning every occurrence across every `.md` file in the vault — typically orders of magnitude larger on vaults with many notes. `backlinks` aggregates the file-level inbound-reference graph at the metadata-cache layer, never reading note bodies, and never returning per-line match text. Callers can observe the relative payload size from any MCP tracing layer that records request/response sizes.

## Q-2 — Backlinks for the focused note (active mode)

**Maps to**: US2 scenario 1, SC-003.

**Setup**: same vault as Q-1; `Notes/Target.md` is open in Obsidian (focused).

**Invocation**:
```json
{
  "target_mode": "active"
}
```

**Expected response**: structurally equivalent to Q-1 (same count, same source list, same order).

## Q-3 — Backlinks for the focused note when nothing is focused

**Maps to**: US2 scenario 2, SC-004.

**Setup**: no note is focused (empty pane, non-note view, or help panel).

**Invocation**:
```json
{
  "target_mode": "active"
}
```

**Expected response**: structured `ERR_NO_ACTIVE_FILE` error:
```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "{\"code\":\"ERR_NO_ACTIVE_FILE\",\"message\":\"backlinks: no note focused; switch to specific mode or focus a note.\",\"details\":{\"stage\":\"envelope-error\",\"detail\":\"No note focused; switch to specific mode or focus a note.\"}}"
  }]
}
```

NOT an empty success.

## Q-4 — Per-source multiplicity via `with_counts: true`

**Maps to**: US4 scenario 1, SC-006.

**Setup**: vault `Demo` contains
- `Notes/Target.md` — the target note.
- `Notes/Many.md` — body: contains `[[Target]]` three times across three different lines.
- `Notes/Once.md` — body: contains `[[Target]]` once on line 1.

**Invocation**:
```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Notes/Target.md",
  "with_counts": true
}
```

**Expected response**:
```json
{
  "count": 2,
  "backlinks": [
    { "source": "Notes/Many.md", "count": 3 },
    { "source": "Notes/Once.md", "count": 1 }
  ]
}
```

The per-source entry is per-FILE (one per source note); the multiplicity is collapsed INTO the per-source `count` integer (FR-007).

## Q-5 — Per-source multiplicity with alias attribution

**Maps to**: US4 scenario 4, SC-007.

**Setup**: vault `Demo` contains
- `Notes/Target.md` — the target note.
- `Notes/A.md` — body: `Bare [[Target]] and aliased [[Target|See]] on same line.`

**Invocation**:
```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Notes/Target.md",
  "with_counts": true
}
```

**Expected response**:
```json
{
  "count": 1,
  "backlinks": [
    { "source": "Notes/A.md", "count": 2 }
  ]
}
```

Both the aliased and the bare reference attribute to the resolved target `Target` (FR-015); the alias text `"See"` is never surfaced.

## Q-6 — Frontmatter reference inclusion

**Maps to**: SC-008, FR-016.

**Setup**: vault `Demo` contains
- `Notes/Target.md` — the target note.
- `Notes/FmOnly.md` — body has NO references; frontmatter has `related: "[[Target]]"`.

**Invocation**:
```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Notes/Target.md",
  "with_counts": true
}
```

**Expected response**:
```json
{
  "count": 1,
  "backlinks": [
    { "source": "Notes/FmOnly.md", "count": 1 }
  ]
}
```

Frontmatter-declared references contribute uniformly with body references (FR-016).

## Q-7 — Code-block-only reference exclusion

**Maps to**: SC-009, FR-014.

**Setup**: vault `Demo` contains
- `Notes/Target.md` — the target note.
- `Notes/CodeOnly.md` — body contains `[[Target]]` ONLY inside a fenced code block (triple-backtick); no body references outside the block; no frontmatter references.

**Invocation**:
```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Notes/Target.md"
}
```

**Expected response**:
```json
{
  "count": 0,
  "backlinks": []
}
```

`Notes/CodeOnly.md` is excluded because its only reference lives inside a fenced code block (FR-014 — defers to host's link parser).

## Q-8 — Self-reference inclusion

**Maps to**: SC-010, FR-013.

**Setup**: vault `Demo` contains
- `Notes/Self.md` — body: `Reference to [[Self]] within itself.`
- `Notes/Other.md` — body: `Reference to [[Self]] from outside.`

**Invocation**:
```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Notes/Self.md"
}
```

**Expected response**:
```json
{
  "count": 2,
  "backlinks": [
    { "source": "Notes/Other.md" },
    { "source": "Notes/Self.md" }
  ]
}
```

`Notes/Self.md` appears in its own backlinks list (FR-013 self-reference inclusion). Callers wanting external-only backlinks do a one-line client-side filter `entry.source !== "Notes/Self.md"`.

## Q-9 — Source-corpus `.md`-only restriction (Q2 / FR-020a)

**Maps to**: SC-013a, FR-020a.

**Setup**: vault `Demo` contains
- `Notes/Target.md` — the target note.
- `Notes/A.md` — body: `[[Target]] reference.`
- `Canvases/Board.canvas` — embeds a wikilink to `Notes/Target.md` (Canvas-format).

**Invocation**:
```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Notes/Target.md"
}
```

**Expected response**:
```json
{
  "count": 1,
  "backlinks": [
    { "source": "Notes/A.md" }
  ]
}
```

`Canvases/Board.canvas` is excluded by the wrapper-side `.md`-only post-filter (FR-020a per the 2026-05-17 Q2 clarification).

## Q-10 — Count-only mode bypasses the cap (Q1 / FR-005a)

**Maps to**: SC-017, SC-019 (total-mode branch), FR-004, FR-010 per Q1.

**Setup**: vault `Demo` contains `Notes/Hub.md` as the target and 1500 source notes each referencing the hub.

### Q-10a — Default mode against the same vault

**Invocation**:
```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Notes/Hub.md"
}
```

**Expected response**: 1000 source-note entries AND `truncated: true`:
```json
{
  "count": 1000,
  "backlinks": [ /* 1000 entries */ ],
  "truncated": true
}
```

### Q-10b — `total: true` against the same vault

**Invocation**:
```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Notes/Hub.md",
  "total": true
}
```

**Expected response**: FULL pre-cap count AND empty list AND NO `truncated`:
```json
{
  "count": 1500,
  "backlinks": []
}
```

Per the 2026-05-17 Q1 clarification — `total: true` bypasses the FR-010 cap and reports the full pre-cap source-note count.

## Q-11 — Explicit `limit` override

**Maps to**: SC-019, FR-010.

**Setup**: same vault as Q-10 (1500 source notes referencing the hub).

**Invocation**:
```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Notes/Hub.md",
  "limit": 50
}
```

**Expected response**:
```json
{
  "count": 50,
  "backlinks": [ /* 50 entries */ ],
  "truncated": true
}
```

The first 50 entries (in `source` ascending order) are returned; `truncated: true` signals clipping.

## Q-12 — Unresolved target locator

**Maps to**: US1 scenario 4, SC-011, FR-017.

**Setup**: vault `Demo` exists but has NO note at `Notes/Missing.md`.

**Invocation**:
```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Notes/Missing.md"
}
```

**Expected response**: structured `CLI_REPORTED_ERROR(FILE_NOT_FOUND)` error:
```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "{\"code\":\"CLI_REPORTED_ERROR\",\"message\":\"backlinks: file not found (path: Notes/Missing.md)\",\"details\":{\"stage\":\"envelope-error\",\"code\":\"FILE_NOT_FOUND\",\"detail\":\"path: Notes/Missing.md\"}}"
  }]
}
```

NOT `{ count: 0, backlinks: [] }`. Count-only mode (`total: true`) does NOT suppress this error.

## Q-13 — Unknown vault

**Maps to**: SC-012, FR-018.

**Setup**: no vault `Unknown` registered.

**Invocation**:
```json
{
  "target_mode": "specific",
  "vault": "Unknown",
  "path": "Notes/Target.md"
}
```

**Expected response**: structured `CLI_REPORTED_ERROR(VAULT_NOT_FOUND)` error via the inherited cli-adapter 011-R5 clause:
```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "{\"code\":\"CLI_REPORTED_ERROR\",\"message\":\"...\",\"details\":{\"code\":\"VAULT_NOT_FOUND\",\"argv\":[\"vault=Unknown\",\"eval\",\"code=...\"],\"stdout\":\"Vault not found.\\n\"}}"
    }]
}
```

NOT a silent route to the focused vault. The cohort placement (eval-cohort with structured error) matches BI-014 / BI-015 / BI-025.

## Q-14 — Binary attachment as target

**Maps to**: SC-013, FR-020.

**Setup**: vault `Demo` contains `Attachments/photo.png` (a binary attachment).

**Invocation**:
```json
{
  "target_mode": "specific",
  "vault": "Demo",
  "path": "Attachments/photo.png"
}
```

**Expected response**: structured `CLI_REPORTED_ERROR(NOT_MARKDOWN)` error:
```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "{\"code\":\"CLI_REPORTED_ERROR\",\"message\":\"backlinks: target is not a Markdown note (path: Attachments/photo.png extension: png)\",\"details\":{\"stage\":\"envelope-error\",\"code\":\"NOT_MARKDOWN\",\"detail\":\"path: Attachments/photo.png extension: png\"}}"
  }]
}
```

NOT a silent empty result. Attachments are not part of the note-link graph.

## Q-15 — Validation rejection (no underlying CLI invocation)

**Maps to**: US3 scenario 1, SC-014, FR-021.

**Setup**: N/A (no CLI invocation expected).

**Invocation** (specific mode without `file` AND without `path`):
```json
{
  "target_mode": "specific",
  "vault": "Demo"
}
```

**Expected response**: structured `VALIDATION_ERROR` BEFORE any CLI invocation:
```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "{\"code\":\"VALIDATION_ERROR\",\"message\":\"backlinks input failed schema validation\",\"details\":{\"issues\":[{\"path\":[],\"message\":\"exactly one of `file` or `path` must be provided in specific mode (got neither)\",\"code\":\"custom\"}]}}"
  }]
}
```

CLI dispatcher spy assertion: never called. Same shape for the other validation-failure scenarios (US3 scenarios 2-9).

## Coverage map

| Quickstart scenario | User Story | Functional Requirement(s) | Success Criterion |
|---------------------|-----------|---------------------------|-------------------|
| Q-1  | US1-1 | FR-002, FR-005, FR-008 | SC-001 |
| Q-2  | US2-1 | FR-002, FR-019 | SC-003 |
| Q-3  | US2-2 | FR-019 | SC-004 |
| Q-4  | US4-1 | FR-003, FR-007 | SC-006, SC-016 |
| Q-5  | US4-4 | FR-015 | SC-007 |
| Q-6  | (Edge case CONTENT — frontmatter) | FR-016 | SC-008 |
| Q-7  | (Edge case CONTENT — body-content opacity) | FR-014 | SC-009 |
| Q-8  | (Edge case CONTENT — self-reference) | FR-013 | SC-010 |
| Q-9  | (Edge case CORPUS — `.md`-only) | FR-020a (Q2) | SC-013a |
| Q-10a | US5-1 | FR-010, FR-011 | SC-019 (entry-list branch) |
| Q-10b | US5-4 | FR-004, FR-005a (Q1) | SC-017, SC-019 (count-only branch) |
| Q-11 | US5-2 | FR-010 | SC-019 |
| Q-12 | US1-4 | FR-017 | SC-011 |
| Q-13 | US1-5 | FR-018 | SC-012 |
| Q-14 | (Edge case LOCATOR — target is binary attachment) | FR-020 | SC-013 |
| Q-15 | US3-1 | FR-002, FR-021 | SC-014 |

The above 15 scenarios cover all six User Stories and the load-bearing edge cases. Additional verification (deterministic order, output-cap kill, the full validation-failure roster of US3 scenarios 2-9) is handled by the co-located handler / schema test cases per [data-model.md](data-model.md) Test Inventory.
