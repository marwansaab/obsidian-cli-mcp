# Quickstart: Add Bases Surface (054)

## Discover → Query → Write workflow

### 1. Discover all bases in the vault

```json
// Request
{ "tool": "bases", "arguments": {} }

// Response
{
  "bases": [
    "000-Meta/Bases/Type ID Index.base",
    "220-Planning/Backlog (Base).base",
    "Vault Health Check.base"
  ],
  "count": 3
}
```

Paths are sorted lexicographically. Empty vault returns `{ "bases": [], "count": 0 }`.

### 2. Enumerate views within a base (active-mode-only)

The user must have a `.base` file focused in Obsidian for this to work.

```json
// Request (no path — operates on focused file)
{ "tool": "views_base", "arguments": {} }

// Response (when focused on a .base file)
{
  "views": ["All", "Active", "Completed"],
  "count": 3
}
```

If the focused file is NOT a `.base` file, the tool returns a structured error.

### 3. Query a specific view

```json
// Request
{
  "tool": "query_base",
  "arguments": {
    "base_path": "220-Planning/Backlog (Base).base",
    "view_name": "Active"
  }
}

// Response
{
  "columns": ["path", "title", "status", "priority"],
  "rows": [
    { "path": "220-Planning/Backlog (Base)/BI-0049.md", "title": "Add bases tool", "status": "In Progress", "priority": "P1" }
  ],
  "truncated": false
}
```

### 4. Create a new item in a base

```json
// Request
{
  "tool": "create_base",
  "arguments": {
    "path": "220-Planning/Backlog (Base).base",
    "name": "New feature request",
    "content": "## Description\nAgent-discovered feature gap."
  }
}

// Response
{
  "path": "220-Planning/Backlog (Base)/New feature request.md",
  "name": "New feature request.md"
}
```

If an item named "New feature request" already exists, the CLI auto-increments: `"name": "New feature request 1.md"`.

## Error handling

All three tools surface structured errors through the existing error contract:

```json
// Missing base file
{
  "code": "CLI_REPORTED_ERROR",
  "details": { "code": "BASE_NOT_FOUND" },
  "message": "Error: Base file not found: nonexistent.base"
}

// Invalid path (wrong extension)
{
  "code": "VALIDATION_ERROR",
  "details": {
    "code": "INVALID_BASE_PATH",
    "reason": "wrong-extension",
    "field": "path"
  }
}

// Content too large (create_base only)
{
  "code": "VALIDATION_ERROR",
  "details": {
    "code": "CONTENT_TOO_LARGE",
    "value_length": 50000,
    "limit": 32000
  }
}
```

## Known limitations

- **Vault routing**: `vault=` parameter is silently ignored by the CLI for `bases`, `views_base`, and `create_base` (works for `query_base`). Tools accept the parameter for forward compatibility but routing is not honoured.
- **`views_base` active-mode-only**: Cannot specify which base to query views for — requires a `.base` file to be focused in Obsidian.
- **`create_base` view validation**: The `view` parameter is not validated by the CLI — nonexistent view names are silently accepted.
- **`create_base` content**: The `content=` parameter is undocumented in CLI help but accepted. Content writing behaviour is to be verified during implementation.
