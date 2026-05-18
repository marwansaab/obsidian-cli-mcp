# T0 Scenario 4 — Subfolder scope narrows blast radius

**Status**: PASS
**Vault**: TestVault-Obsidian-CLI-MCP
**Scratch root**: `Sandbox/038-find-replace-t0/`

## Request

```json
{
  "pattern": "ADR-0042",
  "replacement": "ADR-0089",
  "mode": "literal",
  "vault": "TestVault-Obsidian-CLI-MCP",
  "subfolder": "Sandbox/038-find-replace-t0/Decisions",
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
      "path": "Sandbox/038-find-replace-t0/Decisions/A.md",
      "occurrence_count": 1,
      "occurrences": [
        {
          "line_number": 1,
          "full_line": "Some ADR-0042 here",
          "matched_substring": "ADR-0042",
          "replacement_substring": "ADR-0089"
        }
      ]
    }
  ],
  "total_occurrences": 1
}
```

## Invariants

- [x] preview mode
- [x] single affected note under Decisions/
- [x] Inbox/B.md not in response
