# Contract — `outline` input

## Tool registration

- **Name**: `outline`
- **Source dir**: `src/tools/outline/`
- **Factory**: `createOutlineTool({ logger, queue })`

## Input zod schema

```typescript
import { z } from "zod";
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const outlineInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    total: z.boolean().optional(),
  }),
);
```

## Emitted JSON Schema (visible to MCP clients via `tools/list`)

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "target_mode": { "type": "string", "enum": ["specific", "active"] },
    "vault": { "type": "string", "minLength": 1 },
    "file": { "type": "string" },
    "path": { "type": "string" },
    "total": { "type": "boolean" }
  },
  "required": ["target_mode"]
}
```

(Descriptions are stripped at registration via `stripSchemaDescriptions` per ADR-005.)

## Field policy

| Field | Type | Required (specific) | Required (active) | Forbidden (active) | Notes |
|---|---|---|---|---|---|
| `target_mode` | enum | yes | yes | — | Discriminator |
| `vault` | non-empty string | yes | — | yes | Vault display name; silently honoured-as-noop by upstream per F8 |
| `file` | string | XOR with `path` | — | yes | Wikilink form (no extension, no folder) |
| `path` | string | XOR with `file` | — | yes | Vault-relative path including `.md` |
| `total` | boolean | no (default false) | no (default false) | — | Count-only switch — wrapper sends `total` flag to upstream and discards heading entries |

## Worked examples

### A — Specific-mode default outline by path

Input:
```json
{
  "target_mode": "specific",
  "vault": "TestVault-Obsidian-CLI-MCP",
  "path": "Sandbox/architecture.md"
}
```

Output (success):
```json
{
  "count": 4,
  "headings": [
    { "level": 1, "text": "Architecture", "line": 1 },
    { "level": 2, "text": "Modules", "line": 5 },
    { "level": 3, "text": "Auth", "line": 9 },
    { "level": 2, "text": "Data Flow", "line": 14 }
  ]
}
```

### B — Specific-mode count-only outline by file (wikilink)

Input:
```json
{
  "target_mode": "specific",
  "vault": "TestVault-Obsidian-CLI-MCP",
  "file": "architecture",
  "total": true
}
```

Output:
```json
{
  "count": 4,
  "headings": []
}
```

### C — Active-mode default outline (focused note)

Input:
```json
{
  "target_mode": "active"
}
```

Output (success — focused note has 2 headings):
```json
{
  "count": 2,
  "headings": [
    { "level": 1, "text": "Top", "line": 1 },
    { "level": 2, "text": "Section", "line": 3 }
  ]
}
```

### D — Zero-heading file (default mode)

Input:
```json
{
  "target_mode": "specific",
  "vault": "TestVault-Obsidian-CLI-MCP",
  "path": "Welcome.md"
}
```

Output:
```json
{
  "count": 0,
  "headings": []
}
```

### E — Validation rejection (specific without locator)

Input:
```json
{
  "target_mode": "specific",
  "vault": "TestVault-Obsidian-CLI-MCP"
}
```

Output (error):
```
VALIDATION_ERROR — exactly one of `file` or `path` must be provided in specific mode (got neither)
```

### F — File-not-found

Input:
```json
{
  "target_mode": "specific",
  "vault": "TestVault-Obsidian-CLI-MCP",
  "path": "Sandbox/does-not-exist.md"
}
```

Output (error):
```
CLI_REPORTED_ERROR — Error: File "Sandbox/does-not-exist.md" not found.
```

(The dispatch layer's `Error:`-prefix classifier maps the upstream `Error: …` exit-0 response to `CLI_REPORTED_ERROR` automatically per R7.)

### G — Non-`.md` filetype rejection

Input:
```json
{
  "target_mode": "specific",
  "vault": "TestVault-Obsidian-CLI-MCP",
  "path": "Sandbox/diagram.canvas"
}
```

Output (error):
```
CLI_REPORTED_ERROR — Error: File is not a markdown file.
```

(FR-027 satisfied entirely by upstream + dispatch-layer classifier per R8.)

## Error response roster

| Code | When | Source |
|---|---|---|
| `VALIDATION_ERROR` | Schema violation (any case from US3 scenarios 1–7) | `registerTool` wraps `ZodError` per FR-018 |
| `CLI_REPORTED_ERROR` | File-not-found, non-`.md` filetype, path-traversal, JSON-parse failure, total-parse failure | Dispatch layer auto-classifier (R7 / R8 / FR-019 / F16) + handler's two parse-failure paths (R9-adjacent) |
| `ERR_NO_ACTIVE_FILE` | Active mode with no focused note | Dispatch layer auto-classifier (R13) |
| `CLI_NON_ZERO_EXIT` | Output-cap kill on very large outlines | Dispatch layer (R10) |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` binary cannot be located | Cli-adapter binary-resolver |

## Multi-vault inherited limitation

Per F8, the `vault=` parameter is silently honoured-as-noop by the upstream `outline` subcommand — the focused vault is what's actually used. Multi-vault users MUST open the target vault before invoking. Same limitation as `eval`-based tools (BI-014 / BI-015) and `files` (BI-019). Documented in `docs/tools/outline.md`.
