# T0 Scenario 3 — include_code_blocks opt-in

**Status**: PASS
**Vault**: TestVault-Obsidian-CLI-MCP
**Scratch root**: `Sandbox/038-find-replace-t0/`

## Request

```json
{
  "pattern": "OldName",
  "replacement": "NewName",
  "mode": "literal",
  "vault": "TestVault-Obsidian-CLI-MCP",
  "subfolder": "Sandbox/038-find-replace-t0",
  "case_insensitive": false,
  "include_code_blocks": true,
  "include_html_comments": false,
  "commit": false
}
```

## Response

```json
{
  "mode": "preview",
  "affected_notes": [
    {
      "path": "Sandbox/038-find-replace-t0/mixed.md",
      "occurrence_count": 2,
      "occurrences": [
        {
          "line_number": 1,
          "full_line": "Line 1: OldName in prose",
          "matched_substring": "OldName",
          "replacement_substring": "NewName"
        },
        {
          "line_number": 3,
          "full_line": "Line 3: OldName inside fence",
          "matched_substring": "OldName",
          "replacement_substring": "NewName"
        }
      ]
    }
  ],
  "total_occurrences": 2
}
```

## Invariants

- [x] preview mode
- [x] total_occurrences === 2 (prose + fence; comment still skipped)
