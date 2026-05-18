# T0 Scenario 5 — Bound exceeded refusal

**Status**: PASS
**Vault**: TestVault-Obsidian-CLI-MCP
**Scratch root**: `Sandbox/038-find-replace-t0/`

## Request

```json
{
  "pattern": "pat",
  "replacement": "rep",
  "mode": "literal",
  "vault": "TestVault-Obsidian-CLI-MCP",
  "subfolder": "Sandbox/038-find-replace-t0",
  "case_insensitive": false,
  "include_code_blocks": false,
  "include_html_comments": false,
  "commit": false
}
```

## Error envelope

```json
{
  "code": "VALIDATION_ERROR",
  "message": "find_and_replace: occurrence count 15 exceeds configured upper bound of 10",
  "details": {
    "code": "OCCURRENCE_COUNT_EXCEEDED",
    "bound": 10,
    "count": 15,
    "env_var": "OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES"
  }
}
```

## Invariants

- [x] error thrown
- [x] code === VALIDATION_ERROR
- [x] details.code === OCCURRENCE_COUNT_EXCEEDED
