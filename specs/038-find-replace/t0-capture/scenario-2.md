# T0 Scenario 2 — Code-block + HTML-comment skip defaults

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
  "include_code_blocks": false,
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
      "occurrence_count": 1,
      "occurrences": [
        {
          "line_number": 1,
          "full_line": "Line 1: OldName in prose",
          "matched_substring": "OldName",
          "replacement_substring": "NewName"
        }
      ]
    }
  ],
  "total_occurrences": 1
}
```

## Invariants

- [x] preview mode
- [x] total_occurrences === 1 (skips fence + comment)
- [x] single occurrence on line 1 (prose)
