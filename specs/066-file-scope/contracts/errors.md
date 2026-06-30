# Contract: `find_and_replace` Error Roster (File-Scope)

**Feature**: `066-file-scope` · Every error surfaces through `UpstreamError`. **Zero new top-level codes** — every state below reuses a pre-existing top-level code (Constitution Principle IV; FR-016; SC-007). New `details.code` / `details.reason` sub-states follow ADR-015 and ADR-032.

## New states (introduced by this feature)

| # | Scenario | `code` | `details.code` | `details.reason` | Extra `details` | Gate | FR |
|---|---|---|---|---|---|---|---|
| 1 | `file` + `path` both supplied | `VALIDATION_ERROR` | `SCOPE_CONFLICT` | `file+path` | `issues[]` | schema `superRefine` | FR-006 |
| 2 | single-note + `subfolder` | `VALIDATION_ERROR` | `SCOPE_CONFLICT` | `note+folder` | `issues[]` | schema `superRefine` | FR-006 |
| 3 | `active_note` + (`file`\|`path`) | `VALIDATION_ERROR` | `SCOPE_CONFLICT` | `active+note` | `issues[]` | schema `superRefine` | FR-007 |
| 4 | `active_note` + `subfolder` | `VALIDATION_ERROR` | `SCOPE_CONFLICT` | `active+folder` | `issues[]` | schema `superRefine` | FR-007 |
| 5 | `active_note` + `vault` | `VALIDATION_ERROR` | `SCOPE_CONFLICT` | `active+vault` | `issues[]` | schema `superRefine` | FR-007 |
| 6 | named note does not exist | `VALIDATION_ERROR` | `INVALID_NOTE` | `not-found` | `note` (the input) | handler existence check | FR-008 |
| 7 | target resolves to non-`.md` / dot-dir | `VALIDATION_ERROR` | `INVALID_NOTE` | `not-eligible` | `note` | handler eligibility check | FR-012 |
| 8 | structurally-unsafe `file`/`path` | `VALIDATION_ERROR` | `INVALID_NOTE` | `path-traversal` | `issues[]` | schema field refine | FR-013 |

## Reused-for-this-feature states (existing codes, applied to the new scope)

| # | Scenario | `code` | `details` | Gate | FR |
|---|---|---|---|---|---|
| 9 | `active_note` but no note open | `ERR_NO_ACTIVE_FILE` | message: "Open a note in the editor, or call find_and_replace with target_mode…" (cohort-uniform) | `resolveActiveFocusedFile` | FR-005 |
| 10 | `[[…]]` in `file` | `VALIDATION_ERROR` | `issues[]` (message = `WIKILINK_BRACKET_REJECTION_MESSAGE`) | schema field refine (standard channel, no sub-code) | FR-003 |
| 11 | named `path` canonical escape | `PATH_ESCAPES_VAULT` | `{ vault, attemptedPath, resolvedPath }` + `pathEscapeAttempt` security event | `assertCanonicalPath` | FR-013 |

## Inherited-unchanged states (BI-038 roster, apply within the single-note scope)

| Scenario | `code` | `details.code` / `details.reason` |
|---|---|---|
| Unknown vault | `CLI_REPORTED_ERROR` | `VAULT_NOT_FOUND` / `unknown` |
| Registered-but-closed vault | `CLI_REPORTED_ERROR` | `VAULT_NOT_FOUND` / `not-open` |
| Empty / over-cap / invalid-regex pattern | `VALIDATION_ERROR` | `INVALID_PATTERN` / `empty` \| `too-long` \| `regex-syntax` |
| Over-cap replacement | `VALIDATION_ERROR` | `INVALID_REPLACEMENT` |
| Occurrence count over the safe bound | `VALIDATION_ERROR` | `OCCURRENCE_COUNT_EXCEEDED` |
| Commit-time drift | `VALIDATION_ERROR` | `OCCURRENCE_COUNT_DRIFT` |
| FS read failure during scan | `FS_WRITE_FAILED` | `details.reason: "read"` (no `partial`) |
| FS write failure during commit | `FS_WRITE_FAILED` | `details.reason: "write"`, `partial: true`, `failing_note_locator` |

## Example envelopes

```jsonc
// #2 — single-note + folder conflict
{ "code": "VALIDATION_ERROR",
  "message": "find_and_replace: a single-note scope and a subfolder scope are mutually exclusive",
  "details": { "code": "SCOPE_CONFLICT", "reason": "note+folder", "issues": [ /* … */ ] } }

// #6 — missing named note
{ "code": "VALIDATION_ERROR",
  "message": "find_and_replace: note \"Projects/Ghost.md\" does not exist in vault",
  "details": { "code": "INVALID_NOTE", "reason": "not-found", "note": "Projects/Ghost.md" } }

// #7 — ineligible target (a .canvas was named)
{ "code": "VALIDATION_ERROR",
  "message": "find_and_replace: target \"Board.canvas\" is not an eligible markdown note",
  "details": { "code": "INVALID_NOTE", "reason": "not-eligible", "note": "Board.canvas" } }

// #9 — active_note with nothing open
{ "code": "ERR_NO_ACTIVE_FILE",
  "message": "No active file in Obsidian. Open a note in the editor, or name one explicitly." }
```

## Precedence when multiple violations apply

When a single input triggers more than one rejection, **field-shape rejections take precedence over scope conflicts**. Concretely, an input that is both structurally-unsafe AND a scope conflict (e.g. `{ file: "../x", path: "B.md" }` — `file` is path-traversal-shaped and `file`+`path` conflict) surfaces `VALIDATION_ERROR` / `INVALID_NOTE` / `path-traversal`, not `SCOPE_CONFLICT`/`file+path`. This follows the schema's issue-emission order (the field-shape `superRefine` issue is pushed before the scope-conflict issue) and `mapZodIssuesToToolError` returning on the first matching issue. Both outcomes are accurate `VALIDATION_ERROR` states on pre-existing top-level codes (Principle IV holds either way); the field-shape failure is the stronger, more actionable signal, so it wins by design. Single-violation inputs always produce the exact triple in the tables above.

## Discriminator count

Eight new `(code, details.code, details.reason)` triples (rows 1–8) + three reused (rows 9–11) + the inherited BI-038 roster, **all on pre-existing top-level codes**. The zero-new-top-level-codes streak (Principle IV) carries through this feature.
