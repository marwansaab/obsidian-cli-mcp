# T0 Scenario 1 — Preview → commit round-trip (ADR rename)

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
  "preview": {
    "mode": "preview",
    "affected_notes": [
      {
        "path": "Sandbox/038-find-replace-t0/Archive/2024/r.md",
        "occurrence_count": 1,
        "occurrences": [
          {
            "line_number": 1,
            "full_line": "Some ADR-0042 occurrence.",
            "matched_substring": "ADR-0042",
            "replacement_substring": "ADR-0089"
          }
        ]
      },
      {
        "path": "Sandbox/038-find-replace-t0/Decisions/ADR-0042 - Old Decision.md",
        "occurrence_count": 3,
        "occurrences": [
          {
            "line_number": 1,
            "full_line": "Lead: ADR-0042 prior context.",
            "matched_substring": "ADR-0042",
            "replacement_substring": "ADR-0089"
          },
          {
            "line_number": 2,
            "full_line": "Second ref ADR-0042.",
            "matched_substring": "ADR-0042",
            "replacement_substring": "ADR-0089"
          },
          {
            "line_number": 3,
            "full_line": "Third ADR-0042 here.",
            "matched_substring": "ADR-0042",
            "replacement_substring": "ADR-0089"
          }
        ]
      },
      {
        "path": "Sandbox/038-find-replace-t0/Inbox/notes/wiki.md",
        "occurrence_count": 1,
        "occurrences": [
          {
            "line_number": 1,
            "full_line": "[[ADR-0042]] rename target",
            "matched_substring": "ADR-0042",
            "replacement_substring": "ADR-0089"
          }
        ]
      }
    ],
    "total_occurrences": 5
  },
  "commit": {
    "mode": "commit",
    "changed_notes": [
      "Sandbox/038-find-replace-t0/Archive/2024/r.md",
      "Sandbox/038-find-replace-t0/Decisions/ADR-0042 - Old Decision.md",
      "Sandbox/038-find-replace-t0/Inbox/notes/wiki.md"
    ],
    "total_occurrences_replaced": 5,
    "partial": false
  }
}
```

## Invariants

- [x] preview mode response
- [x] total_occurrences === 5
- [x] affected_notes.length === 3
- [x] mtime of A unchanged
- [x] mtime of B unchanged
- [x] mtime of C unchanged
- [x] commit mode response
- [x] partial === false
- [x] total_occurrences_replaced === 5
- [x] A.md rewritten without ADR-0042
- [x] B.md rewritten
- [x] C.md rewritten
