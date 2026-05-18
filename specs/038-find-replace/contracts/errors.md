# Errors Contract — find_and_replace

**Branch**: `038-find-replace`
**Schema source of truth**: `src/errors.ts` — `UpstreamError`.

The find_and_replace surface produces THIRTEEN distinct `(top-level code, details.code, details.reason)` failure triples. All thirteen REUSE existing top-level error codes — no new top-level codes are introduced. The eleven-tool zero-new-top-level-codes streak (Constitution Principle IV) is preserved across the twelfth typed tool.

Per ADR-015, multi-sub-state `(top-level, details.code)` pairs use the `details.reason` sub-discriminator with kebab-case literals. Each `(code, reason)` pair is enumerated below per ADR-015 §Format.

## Error cohort table

| # | Top-level code | `details.code` | `details.reason` | FR | Detection gate | Example envelope |
|---|---|---|---|---|---|---|
| 1 | `VALIDATION_ERROR` | `INVALID_PATTERN` | `empty` | FR-022 | Zod schema (`pattern.min(1)`) | Caller passed `pattern: ""`. |
| 2 | `VALIDATION_ERROR` | `INVALID_PATTERN` | `too-long` | FR-022 | Zod schema (`pattern.max(1000)`) | Caller passed `pattern` > 1000 UTF-16 code units. |
| 3 | `VALIDATION_ERROR` | `INVALID_PATTERN` | `regex-syntax` | FR-010 | Zod `superRefine` (regex mode only) | `pattern: "[unclosed"` in `regex` mode. |
| 4 | `VALIDATION_ERROR` | `INVALID_REPLACEMENT` | — (absent or `"unknown"`) | FR-022 | Zod schema (`replacement.max(1000)`) | Caller passed `replacement` > 1000 UTF-16 code units. |
| 5 | `VALIDATION_ERROR` | `INVALID_SUBFOLDER` | `path-traversal` | FR-009 Layer 1 | Zod `superRefine` (`isStructurallySafePath`) | `subfolder: "../escape"`. |
| 6 | `VALIDATION_ERROR` | `INVALID_SUBFOLDER` | — (absent) | FR-009 (existing-check) | Handler scan step — directory does not exist | `subfolder: "NonExistent"`. |
| 7 | `VALIDATION_ERROR` | `OCCURRENCE_COUNT_EXCEEDED` | — (absent) | FR-011 | Handler bound-check step | Total occurrences > `OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES` (default 500). |
| 8 | `VALIDATION_ERROR` | `OCCURRENCE_COUNT_DRIFT` | — (absent) | FR-012(b) | Handler commit step — count compare | Two scans within commit invocation yield different totals. |
| 9 | `PATH_ESCAPES_VAULT` | — (n/a) | — (n/a) | FR-009 Layer 2 | Handler — `checkCanonicalPath` (on subfolder OR per-note) | In-vault symlink resolves outside the vault root. |
| 10 | `CLI_REPORTED_ERROR` | `VAULT_NOT_FOUND` | `unknown` | FR-013 | Handler — `resolveVaultPath` | `vault: "Typo"` not in registry. |
| 11 | `CLI_REPORTED_ERROR` | `VAULT_NOT_FOUND` | `not-open` | FR-013 | Handler — `resolveVaultPath` | `vault: "Closed"` registered but not currently open. |
| 12 | `FS_WRITE_FAILED` | — (n/a) | `write` | FR-021 | Handler commit step — `fs.writeFile` / `fs.rename` throw | ENOSPC, EACCES, EROFS, EIO during write. Carries `details.errno` + `partial: true` flag on commit response. |
| 13 | `FS_WRITE_FAILED` | — (n/a) | `read` | FR-021 | Handler scan step — per-note `fs.readFile` throws (preview OR commit code path) | EACCES, EIO, ENOENT-mid-walk during read. Carries `details.errno`; commit aborts BEFORE any write so the response carries the error envelope with NO `partial` flag. |

All thirteen discriminators REUSE existing top-level codes (`VALIDATION_ERROR`, `PATH_ESCAPES_VAULT`, `CLI_REPORTED_ERROR`, `FS_WRITE_FAILED`).

## Envelope shapes

### `VALIDATION_ERROR` + `INVALID_PATTERN` + `empty`

```json
{
  "code": "VALIDATION_ERROR",
  "message": "pattern must not be empty",
  "details": {
    "code": "INVALID_PATTERN",
    "reason": "empty",
    "issues": [{ "path": ["pattern"], "code": "too_small", "message": "String must contain at least 1 character(s)" }]
  }
}
```

### `VALIDATION_ERROR` + `INVALID_PATTERN` + `too-long`

```json
{
  "code": "VALIDATION_ERROR",
  "message": "pattern exceeds maximum length of 1000 UTF-16 code units",
  "details": {
    "code": "INVALID_PATTERN",
    "reason": "too-long",
    "issues": [{ "path": ["pattern"], "code": "too_big", "message": "String must contain at most 1000 character(s)" }]
  }
}
```

### `VALIDATION_ERROR` + `INVALID_PATTERN` + `regex-syntax`

```json
{
  "code": "VALIDATION_ERROR",
  "message": "pattern is not a valid ECMAScript regular expression",
  "details": {
    "code": "INVALID_PATTERN",
    "reason": "regex-syntax",
    "issues": [{ "path": ["pattern"], "code": "custom", "message": "Invalid regular expression: /[unclosed/: Unterminated character class" }]
  }
}
```

### `VALIDATION_ERROR` + `INVALID_REPLACEMENT`

```json
{
  "code": "VALIDATION_ERROR",
  "message": "replacement exceeds maximum length of 1000 UTF-16 code units",
  "details": {
    "code": "INVALID_REPLACEMENT",
    "issues": [{ "path": ["replacement"], "code": "too_big", "message": "String must contain at most 1000 character(s)" }]
  }
}
```

`details.reason` is absent for the over-cap case (single-state `details.code` per ADR-015 default-sub-state allowance).

### `VALIDATION_ERROR` + `INVALID_SUBFOLDER` + `path-traversal`

```json
{
  "code": "VALIDATION_ERROR",
  "message": "subfolder is not structurally safe",
  "details": {
    "code": "INVALID_SUBFOLDER",
    "reason": "path-traversal",
    "issues": [{ "path": ["subfolder"], "code": "custom", "message": "path is not structurally safe (must not start with '/', '\\\\', or a drive letter; must not contain '..' segments or control characters)" }]
  }
}
```

### `VALIDATION_ERROR` + `INVALID_SUBFOLDER` (unknown subfolder)

```json
{
  "code": "VALIDATION_ERROR",
  "message": "subfolder 'NonExistent' does not exist in vault",
  "details": {
    "code": "INVALID_SUBFOLDER",
    "subfolder": "NonExistent",
    "vault": "Research"
  }
}
```

`details.reason` is absent for the unknown-existence case.

### `VALIDATION_ERROR` + `OCCURRENCE_COUNT_EXCEEDED`

```json
{
  "code": "VALIDATION_ERROR",
  "message": "occurrence count 712 exceeds configured upper bound of 500",
  "details": {
    "code": "OCCURRENCE_COUNT_EXCEEDED",
    "bound": 500,
    "count": 712,
    "env_var": "OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES"
  }
}
```

The `bound` field carries the active bound (env-var value, or 500 fallback). The `count` field carries the offending total. The `env_var` field names the operator-facing knob — caller-visible hint for operator escalation.

### `VALIDATION_ERROR` + `OCCURRENCE_COUNT_DRIFT`

```json
{
  "code": "VALIDATION_ERROR",
  "message": "vault content changed between preview-time and commit-time scans (count 5 → 7)",
  "details": {
    "code": "OCCURRENCE_COUNT_DRIFT",
    "preview_count": 5,
    "commit_count": 7
  }
}
```

The two counts disambiguate "vault gained occurrences" vs "vault lost occurrences" — both refuse the commit.

### `PATH_ESCAPES_VAULT`

```json
{
  "code": "PATH_ESCAPES_VAULT",
  "message": "resolved path escapes vault root",
  "details": {
    "attemptedPath": "subfolder-with-symlink",
    "resolvedPath": "/outside/the/vault/somewhere"
  }
}
```

Accompanied by a `pathEscapeAttempt` security event via the project logger per ADR-009 §2.

### `CLI_REPORTED_ERROR` + `VAULT_NOT_FOUND` + `unknown`

```json
{
  "code": "CLI_REPORTED_ERROR",
  "message": "vault 'Typo' is not registered",
  "details": {
    "code": "VAULT_NOT_FOUND",
    "reason": "unknown",
    "vault": "Typo"
  }
}
```

Parity with BI-037 `pattern_search` handler.ts:74 / handler.test.ts:293 — the same `(code, reason)` pair as the read-side sibling.

### `CLI_REPORTED_ERROR` + `VAULT_NOT_FOUND` + `not-open`

```json
{
  "code": "CLI_REPORTED_ERROR",
  "message": "vault 'Closed' is registered but not currently open in Obsidian",
  "details": {
    "code": "VAULT_NOT_FOUND",
    "reason": "not-open",
    "vault": "Closed"
  }
}
```

### `FS_WRITE_FAILED` + `details.reason: "write"`

```json
{
  "code": "FS_WRITE_FAILED",
  "message": "filesystem write failed: ENOSPC",
  "details": {
    "reason": "write",
    "errno": "ENOSPC",
    "path": "Inbox/notes/wiki-refs.md",
    "vault": "Research"
  }
}
```

Accompanied by the commit response carrying `partial: true` and `failing_note_locator: "Inbox/notes/wiki-refs.md"` per FR-021 / FR-025.

### `FS_WRITE_FAILED` + `details.reason: "read"`

```json
{
  "code": "FS_WRITE_FAILED",
  "message": "filesystem read failed: EACCES",
  "details": {
    "reason": "read",
    "errno": "EACCES",
    "path": "Inbox/notes/locked-file.md",
    "vault": "Research"
  }
}
```

NOT accompanied by a `partial: true` commit response — read failures abort the operation BEFORE any write, so no successful writes precede the failure. The caller sees only the error envelope.

## ADR-015 enumeration

Per ADR-015 §Format, the value space of `details.reason` is closed per `(top-level, details.code)` pair. Enumerated:

- `(VALIDATION_ERROR, INVALID_PATTERN)`: `details.reason ∈ { "empty", "too-long", "regex-syntax" }` — three sub-states.
- `(VALIDATION_ERROR, INVALID_SUBFOLDER)`: `details.reason ∈ { "path-traversal" }` — one sub-state, plus the default-sub-state allowance (absent or `"unknown"`) for the unknown-subfolder existence-check case.
- `(VALIDATION_ERROR, INVALID_REPLACEMENT)`: single-state, no sub-discriminator. `details.reason` MAY be absent or `"unknown"`.
- `(VALIDATION_ERROR, OCCURRENCE_COUNT_EXCEEDED)`: single-state, no sub-discriminator.
- `(VALIDATION_ERROR, OCCURRENCE_COUNT_DRIFT)`: single-state, no sub-discriminator.
- `(CLI_REPORTED_ERROR, VAULT_NOT_FOUND)`: `details.reason ∈ { "unknown", "not-open" }` — two sub-states (BI-026 v0.5.4 / BI-037 parity).
- `PATH_ESCAPES_VAULT` is top-level-only — no `details.code` / `details.reason` discriminator.
- `(FS_WRITE_FAILED, —)`: `details.reason ∈ { "read", "write" }` — two sub-states. The pair has no `details.code` discriminator; the `details.reason` carries directly under the top-level code per ADR-015's allowance for `details.reason` to apply at the top-level layer when no `details.code` namespace exists.

## Detection-gate summary

| Detection gate | Errors detected |
|---|---|
| Zod schema (`findAndReplaceInputSchema`) | #1 (empty pattern), #2 (over-cap pattern), #3 (regex syntax), #4 (over-cap replacement), #5 (path-traversal) |
| `resolveVaultPath` (`src/vault-registry/registry.ts`) | #10 (unknown vault), #11 (closed vault) |
| `checkCanonicalPath` (`src/path-safety/canonical.ts`) | #9 (canonical path escape) — on `scanRoot` AND per-affected-note locator |
| Handler scan step | #6 (unknown subfolder — directory does not exist) |
| Handler bound-check step | #7 (occurrence count exceeded) — on FIRST scan AND on SECOND scan during commit |
| Handler drift-check step (commit-only) | #8 (occurrence count drift) — when first-scan count ≠ second-scan count |
| Handler scan step (preview AND commit) | #13 (FS read failed) — propagated from per-note `fs.readFile` throw |
| Handler write step (commit-only) | #12 (FS write failed) — propagated from `fs.writeFile` / `fs.rename` |
