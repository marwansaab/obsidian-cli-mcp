# T0 Scenario 6 — Drift detection refuses stale commit

**Status**: PASS
**Vault**: TestVault-Obsidian-CLI-MCP
**Scratch root**: `Sandbox/038-find-replace-t0/`

## Request

```json
{
  "pattern": "pat",
  "replacement": "X",
  "mode": "literal",
  "vault": "TestVault-Obsidian-CLI-MCP",
  "subfolder": "Sandbox/038-find-replace-t0",
  "case_insensitive": false,
  "include_code_blocks": false,
  "include_html_comments": false,
  "commit": true
}
```

## Error envelope

```json
{
  "code": "VALIDATION_ERROR",
  "message": "find_and_replace: vault content changed between preview-time and commit-time scans (count 3 → 4)",
  "details": {
    "code": "OCCURRENCE_COUNT_DRIFT",
    "preview_count": 3,
    "commit_count": 4
  }
}
```

## Invariants

- [x] error thrown
- [x] details.code === OCCURRENCE_COUNT_DRIFT
- [x] preview_count === 3
- [x] commit_count === 4
