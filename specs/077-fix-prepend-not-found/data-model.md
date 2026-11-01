# Data Model: Report Missing Notes on Add-to-Top

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

No schema changes. This BI adds no input field, output field, error code or `details.reason`. It fixes when an existing failure shape is produced.

## Missing-note failure (existing shape, now produced reliably)

| Field | Value | Source |
|-------|-------|--------|
| `code` | `"CLI_REPORTED_ERROR"` | existing top-level code |
| `details.code` | `"NOTE_NOT_FOUND"` | existing ADR-015 sub-discriminator |
| `details.path` | the vault-relative path the call targeted (`relPath`): the `path` as supplied, the path a `file` name resolved to, or the focused note's path | `resolveFsTarget` |
| `details.vault` | the vault display name (`vaultDisplayName`): the supplied `vault` in specific mode, the reverse-looked-up name in active mode | `resolveFsTarget` (research D4) |
| `message` | `Note "<details.path>" not found in vault.` | same text as `append_note` |
| `cause` | the fs `ENOENT` error (pre-call check) or the dispatch `UpstreamError` (Obsidian's report) | FR-006 |

`details` carries exactly these three keys, the same as `append_note`'s missing-note failure (FR-002).

## Detection points

```text
resolveFsTarget → file-type check → assertCanonicalPath
  → fs.stat(absPath)
      ENOENT           → throw missing-note failure (cause: fs error)        [FR-001a, new]
      other error      → rethrown unchanged                                   [unchanged]
  → fs.readFile(absPath)   (default mode only)
      ENOENT           → before = null, continue to Obsidian                  [unchanged: race]
      other error      → FS_WRITE_FAILED before the call                      [unchanged]
  → invokeCli prepend
      UpstreamError → classifyUpstreamFailure
        haystack matches `Error: File "<…>" not found.`  → missing-note failure (cause: upstream)  [FR-001b, new pattern]
        haystack matches a placeholder not-found pattern   → missing-note failure                  [unchanged]
        haystack matches an editor-conflict pattern        → EXTERNAL_EDITOR_CONFLICT              [unchanged]
        otherwise                                          → same code + details.stage "prepend-cli" [unchanged]
```

## Invariants

- **R1**: a missing-note failure from either detection point has the same `code`, `details` keys and `message` (built by one function, research D3).
- **R2**: when the pre-call check reports the note missing, Obsidian is not called and nothing is written.
- **R3**: an upstream output that reports something other than a missing file (`Folder "…" not found`, `Vault not found`, `Command "…" not found`) is never classified as `NOTE_NOT_FOUND`.
- **R4**: every failure other than a missing note keeps its code, `details` and message (FR-007).
