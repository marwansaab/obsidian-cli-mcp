# Public Input Contract: `tag`

**Branch**: `028-list-tagged-files`
**Date**: 2026-05-15

The user-facing input contract for the `tag` typed tool. Single source of truth for the JSON Schema published via MCP's `inputSchema` and for the runtime parse.

## Zod schema (verbatim from `src/tools/tag/schema.ts`)

```ts
export const tagInputSchema = z
  .object({
    tag: z
      .string()
      .min(1, "tag is required")
      .max(220, "tag too long (max 200 chars post-trim/post-#-strip)")
      .transform((s) => s.trim())
      .transform((s) => (s.startsWith("#") ? s.slice(1) : s))
      .refine((s) => s.length > 0, "tag is empty post-trim/post-#-strip")
      .refine((s) => s.length <= 200, "tag exceeds 200 chars post-strip")
      .refine((s) => !s.split("/").some((seg) => seg.length === 0),
        "tag contains empty hierarchical segment"),
    vault: z.string().min(1).optional(),
    total: z.boolean().optional(),
  })
  .strict();
```

## Emitted JSON Schema (shape)

After running through `zod-to-json-schema` + `stripSchemaDescriptions` (ADR-005), the published `inputSchema` has the shape:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["tag"],
  "properties": {
    "tag": { "type": "string", "minLength": 1, "maxLength": 220 },
    "vault": { "type": "string", "minLength": 1 },
    "total": { "type": "boolean" }
  }
}
```

(Note: `.transform` / `.refine` are not surfaced to JSON Schema. The structural rules — `min/max`, `trim`, leading-`#` strip, empty-segment rejection — are enforced at runtime but not in the published schema. This matches BI-024 / BI-025 / BI-026 / BI-027 published-schema posture.)

## Field policy

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `tag` | YES | string | Trimmed; single leading `#` stripped; non-empty post-strip; ≤200 chars post-strip; no empty hierarchical segments (`/foo`, `foo/`, `foo//bar`). NO charset regex (Q2). |
| `vault` | NO | string | Vault name; routes via existing vault-routing convention. Inherited multi-vault basename limitation. |
| `total` | NO | boolean | When `true`, count-only mode. Default `false`. Project-wide convention parity with BI-019/023/024/025/026/027. |

## Worked examples (A–H)

### A — Simple happy path (default mode)
**Input**: `{ "tag": "alpha" }`  
**Behaviour**: Wrapper normalises to `"alpha"`, dispatches eval against the active vault, returns `{ count: N, paths: [...] }`.

### B — Leading `#` and whitespace (default mode)
**Input**: `{ "tag": "  #alpha  " }`  
**Behaviour**: Wrapper trims, strips `#`, normalises to `"alpha"`. Result identical to example A.

### C — Hierarchical parent query
**Input**: `{ "tag": "project" }` against a vault carrying `project`, `project/alpha`, `project/beta`  
**Behaviour**: Returns paths for all THREE — `project`, `project/alpha`, and `project/beta` — by segment-bounded child-subsumption (FR-004 / FR-016).

### D — Leaf-tag precision
**Input**: `{ "tag": "project/alpha" }` against the same vault  
**Behaviour**: Returns paths only for files tagged `project/alpha` or any descendant (`project/alpha/v1`, etc.). The plain-`project`-tagged file is EXCLUDED.

### E — Explicit vault
**Input**: `{ "tag": "alpha", "vault": "TestVault-Obsidian-CLI-MCP" }`  
**Behaviour**: Routes via `vault=` parameter; happy path otherwise.

### F — Count-only mode
**Input**: `{ "tag": "alpha", "total": true }`  
**Behaviour**: Returns the bare integer count `N`; no `paths` array surfaced.

### G — Zero-match
**Input**: `{ "tag": "never-used-tag" }`  
**Behaviour**: Returns `{ count: 0, paths: [] }` — NO error. JS template's natural empty-result path.

### H — Case-variant query
**Input**: `{ "tag": "ALPHA" }` against a vault carrying `#alpha`  
**Behaviour**: Wrapper applies ASCII lower-fold inside the eval JS template; result identical to example A. (Plan-stage amendment 1 driven by live-probe F2.)

## Error response roster

Eleven error rows. ZERO new top-level error codes; all consumed via existing `UpstreamError` patterns.

| # | Top-level code | `details` | Cause |
|---|---------------|-----------|-------|
| 1 | `VALIDATION_ERROR` | zod field paths | input fails schema parse (empty / whitespace-only / empty-segment / >200 chars / unknown key / wrong type) |
| 2 | `CLI_REPORTED_ERROR` | `{code: "VAULT_NOT_FOUND", reason: "unknown"}` | unknown vault — cli-adapter 011-R5 fires on `Vault not found.` |
| 3 | `CLI_REPORTED_ERROR` | `{code: "VAULT_NOT_FOUND", reason: "not-open"}` | closed-but-registered vault — shared detector stage 0 fires |
| 4 | `CLI_REPORTED_ERROR` | `{stage: "json-parse"}` | eval stdout is non-JSON after `=> ` strip |
| 5 | `CLI_REPORTED_ERROR` | `{stage: "envelope-parse"}` | eval JSON parses but doesn't match the envelope discriminated union |
| 6 | `CLI_REPORTED_ERROR` | `{stage: "envelope-error", code: <string>}` | envelope.ok === false (reserved for future cache-not-ready states) |
| 7 | `CLI_BINARY_NOT_FOUND` | `{platform, attempts, PATH}` | inherited from binary resolver |
| 8 | `CLI_NON_ZERO_EXIT` | `{exitCode, stdout, stderr}` | inherited cli-adapter (output cap kill, unexpected CLI failure) |
| 9 | `CLI_DISPATCH_TIMEOUT` | `{timeoutMs}` | inherited cli-adapter |
| 10 | `CLI_DISPATCH_CAP_KILL` | `{capBytes}` | inherited cli-adapter — 10 MiB output cap |
| 11 | `CLI_DISPATCH_KILL` | `{signal}` | inherited cli-adapter |

## Out-of-scope upstream surfaces

| Surface | Why rejected |
|---------|--------------|
| `obsidian tag name=<>` native subcommand | Plain-text-only, case-sensitive, zero-match-error, no child-subsumption — three contract mismatches per F3 |
| `obsidian tag verbose` flag | Same — wrapped via eval instead |
| `obsidian tags` (plural) subcommand | Different operation (vault-wide inventory) — out-of-scope future BI |
| `obsidian search query="#tag"` | Substring/regex search, not tag-index lookup; would catch tags inside fenced code blocks |
| `obsidian property:read name=tags file=X` | Per-file frontmatter read, not vault-wide tag→files index |
| `obsidian backlinks` | Link graph, not tag graph |
| Pagination / limit / offset params | Out-of-scope at v1 (spec) |
| Folder-prefix filter | Out-of-scope at v1 (spec) |
| Multi-tag boolean query | Out-of-scope at v1 (spec) |
| Combined tag+property filter | Out-of-scope at v1 (spec) |
| Cross-vault query | Out-of-scope (single vault per call) |
| `target_mode` discriminator | N/A (vault-only surface, parity with BI-024) |
