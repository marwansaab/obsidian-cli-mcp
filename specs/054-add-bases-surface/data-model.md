# Data Model: Add Bases Surface (054)

## Entities

### BasesOutput (tool: `bases`)

Represents the response envelope for vault-wide `.base` file enumeration.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bases` | `string[]` | Yes | Vault-relative paths to `.base` files, sorted path-ascending (lexicographic) |
| `count` | `number` | Yes | Length of `bases` array |

**Invariants**:
- `count === bases.length` always
- `bases` is sorted lexicographically (path-ascending)
- Empty vault: `{ bases: [], count: 0 }`
- No truncation fields — all paths returned unconditionally

### ViewsBaseOutput (tool: `views_base`)

Represents the response envelope for view enumeration within the currently focused `.base` file.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `views` | `string[]` | Yes | View names defined in the focused base file |
| `count` | `number` | Yes | Length of `views` array |

**Invariants**:
- `count === views.length` always
- View names are strings only (no per-view metadata)
- Zero-view base: `{ views: [], count: 0 }`

### CreateBaseOutput (tool: `create_base`)

Represents the response envelope for item creation within a base.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | `string` | Yes | Vault-relative path of the created item (Markdown note) |
| `name` | `string` | Yes | Actual filename of the created item (may differ from requested name due to auto-increment) |

**Invariants**:
- `path` is wrapper-constructed from base directory + CLI-returned filename
- `name` reflects the ACTUAL created filename (may include ` 1`, ` 2` suffix on collision)

## Input Schemas

### BasesInput

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `vault` | `string` | No | Min 1 char if provided. Note: silently ignored by CLI (R-001) |

**Notes**: No `path` or other locator — `bases` enumerates the whole vault. No `total` flag (R-002 resolved: CLI has no count-only mode).

### ViewsBaseInput

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `vault` | `string` | No | Min 1 char if provided. Note: silently ignored by CLI (R-003) |

**Notes**: No `path` parameter (R-003 resolved: `base:views` is active-mode-only). The tool operates on the currently focused `.base` file.

### CreateBaseInput

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `path` | `string` | Yes | 1–1000 UTF-16 code units. Must end in `.base` (case-insensitive). Path-traversal rejected. |
| `name` | `string` | Yes | 1–1000 UTF-16 code units. Non-empty. |
| `content` | `string` | No | Max 3072 UTF-16 code units (`MAX_CONTENT_LENGTH`, parity with `prepend`). Over-limit rejected pre-CLI as `CONTENT_TOO_LARGE`. |
| `view` | `string` | No | View name within the base. Not validated by CLI (R-006). |
| `vault` | `string` | No | Min 1 char if provided. Note: silently ignored by CLI (R-004). |

## Error States

All errors surface through existing top-level codes — no new codes introduced.

### Per-tool error surfaces

| Tool | Error Scenario | `code` | `details.code` | `details.reason` |
|------|---------------|--------|----------------|-------------------|
| `bases` | Upstream CLI failure | `CLI_REPORTED_ERROR` | contextual | — |
| `views_base` | Focused file is not a `.base` | `CLI_REPORTED_ERROR` | `BASE_NOT_FOUND` | — |
| `views_base` | No file focused / Obsidian closed | `CLI_REPORTED_ERROR` | `BASE_NOT_FOUND` | — |
| `create_base` | Base file not found | `CLI_REPORTED_ERROR` | `BASE_NOT_FOUND` | — |
| `create_base` | Content exceeds size limit | `VALIDATION_ERROR` | `CONTENT_TOO_LARGE` | — |
| Any | Path empty | `VALIDATION_ERROR` | `INVALID_BASE_PATH` | `empty` |
| Any | Path too long | `VALIDATION_ERROR` | `INVALID_BASE_PATH` | `too-long` |
| Any | Path traversal | `VALIDATION_ERROR` | `INVALID_BASE_PATH` | `path-traversal` |
| Any | Wrong extension | `VALIDATION_ERROR` | `INVALID_BASE_PATH` | `wrong-extension` |
| Any | Name empty | `VALIDATION_ERROR` | `INVALID_NAME` | `empty` |
| Any | Name too long | `VALIDATION_ERROR` | `INVALID_NAME` | `too-long` |
| Any | Unknown keys | `VALIDATION_ERROR` | (Zod strict mode) | — |

## CLI Command Mapping (ADR-010)

| CLI Subcommand | Tool Name | Target Mode | Parameters |
|----------------|-----------|-------------|------------|
| `bases` | `bases` | N/A | (none) |
| `base:views` | `views_base` | active | (none) |
| `base:create` | `create_base` | specific | `path`, `name`, `content`, `view` |
| `base:query` | `query_base` | specific | `path`, `view`, `format=json` |
