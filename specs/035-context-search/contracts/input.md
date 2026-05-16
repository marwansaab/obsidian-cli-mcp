# Contract: `context_search` Input

**Branch**: `035-context-search`
**Date**: 2026-05-17
**Source of truth**: `src/tools/context_search/schema.ts` (`contextSearchInputSchema`); this file is human-readable mirror, not a separate declaration.

## Shape (JSON Schema-style)

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["query"],
  "properties": {
    "query": {
      "type": "string",
      "minLength": 1,
      "maxLength": 1000,
      "description": "Phrase-match keyword. Single literal substring; internal whitespace preserved verbatim. Rejected if whitespace-only post-trim. FR-001 / FR-008."
    },
    "folder": {
      "type": "string",
      "minLength": 1,
      "description": "Vault-relative folder prefix. Leading/trailing '/' stripped wrapper-side. Recursive subtree-prefix match at folder-segment boundaries. Missing folder surfaces a structured CLI_REPORTED_ERROR (not count=0). FR-003 / FR-004 / FR-013."
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 10000,
      "description": "Caps the response 'matches' array (line-count, post-flatten). Implicit cap 1000 when omitted. FR-005 / FR-006 / FR-010."
    },
    "case_sensitive": {
      "type": "boolean",
      "default": false,
      "description": "When false (default), ASCII lower-fold case-insensitive (folds A-Z ↔ a-z only). When true, code-point-exact match. FR-007."
    },
    "vault": {
      "type": "string",
      "minLength": 1,
      "description": "Vault name. When omitted, the currently focused vault is targeted (implicit-active per project convention). Unknown vault surfaces CLI_REPORTED_ERROR. FR-015."
    }
  }
}
```

## Validation rules (zod-encoded, applied at the boundary)

1. `query` is required, 1..1000 characters, non-empty after trim (`superRefine`).
2. `folder` is optional; when present, ≥ 1 character.
3. `limit` is optional; when present, integer in inclusive range `[1, 10000]`.
4. `case_sensitive` is optional; when present, boolean.
5. `vault` is optional; when present, ≥ 1 character.
6. `.strict()` — any unknown top-level key triggers `unrecognized_keys` issue (FR-009).
7. All validation fires BEFORE any vault scan or CLI invocation (FR-008 / FR-006 / FR-009 ordering guarantee).

## Examples

**Minimal happy path**:

```json
{ "query": "TODO" }
```

**Folder-scoped + case-sensitive**:

```json
{ "query": "getUser", "folder": "Projects/api", "case_sensitive": true }
```

**Explicitly capped + cross-vault**:

```json
{ "query": "deprecated", "limit": 50, "vault": "Worknotes" }
```

**Rejected — empty query**:

```json
{ "query": "" }
```

Returns a structured `VALIDATION_ERROR` envelope (per the project's MCP SDK error-response shape) listing `path: ["query"]`.

**Rejected — unknown key**:

```json
{ "query": "foo", "context_lines": true }
```

Returns a `VALIDATION_ERROR` with an `unrecognized_keys` issue for `context_lines` (FR-009 strict input). Note: `context_lines` is a valid parameter on the existing `search` tool, NOT on `context_search`; the tool surface is intentionally narrower.

## Notes

- The input is the single source of truth for the published MCP `inputSchema` — derived at registration time via `zod-to-json-schema` (or equivalent inherited project utility). No hand-rolled `interface` or `type` declaration is published.
- Internal whitespace in `query` is preserved verbatim (phrase-match semantic per FR-001). `query: "foo bar"` matches the contiguous substring `foo bar` and does NOT tokenise.
- The published shape mirrors `search`'s input shape minus the `context_lines` field — callers can mechanically migrate from `search` with `context_lines=true` to `context_search` by removing that field.
