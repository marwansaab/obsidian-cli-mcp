# Public Input Contract — list_files

The public input shape that MCP clients send to the `list_files` tool. The zod schema is the single source of truth (Constitution III); the JSON Schema emitted via `zod-to-json-schema` and published in the tool's `inputSchema` is the JSON-Schema realisation of this contract.

## Zod schema

```ts
import { z } from "zod";
import { applyTargetModeRefinementForFolderScoped, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const listFilesInputSchema = applyTargetModeRefinementForFolderScoped(
  targetModeBaseSchema.extend({
    folder: z.string().min(1).optional(),
    ext: z.string().min(1).optional(),
    total: z.boolean().optional(),
  }).strict()
);

export type ListFilesInput = z.infer<typeof listFilesInputSchema>;
```

Notes:
- `targetModeBaseSchema` provides `target_mode` (enum `"specific" | "active"`), `vault?: string`, plus the file-scoped locator fields `file?: string` and `path?: string`. The folder-scoped refinement (introduced by this feature) forbids `file` and `path` in BOTH modes via `superRefine`.
- The folder-scoped refinement also enforces: in `"specific"` requires `vault`; in `"active"` forbids `vault`.
- `.strict()` enforces `additionalProperties: false` in the emitted JSON Schema.
- `folder` and `ext` are optional but if present must be non-empty strings (R15).

## Emitted JSON Schema shape (post-`stripSchemaDescriptions` per ADR-005)

```json
{
  "type": "object",
  "properties": {
    "target_mode": { "type": "string", "enum": ["specific", "active"] },
    "vault":   { "type": "string", "minLength": 1 },
    "folder":  { "type": "string", "minLength": 1 },
    "ext":     { "type": "string", "minLength": 1 },
    "total":   { "type": "boolean" }
  },
  "required": ["target_mode"],
  "additionalProperties": false
}
```

The published JSON Schema is what clients (MCP Inspector, Claude Desktop, etc.) read to discover the tool's shape. Note `vault` is NOT in `required` at the JSON-Schema level — the in-mode requirement is enforced by `superRefine`, which JSON Schema cannot represent.

## Field policy

### `target_mode` (required)

The standard discriminator used across every typed tool. One of:

- `"specific"` — names a vault explicitly via the `vault` field.
- `"active"` — operates on the focused vault; no `vault` argument permitted.

Any other value (including `null`, the empty string, numeric values) rejects at validation.

### `vault` (required-in-specific; forbidden-in-active)

A vault display name string (the same shape every typed tool consumes). Non-empty per `min(1)`.

- In `target_mode: "specific"`: REQUIRED. Absence rejects (US4 scenario 1).
- In `target_mode: "active"`: FORBIDDEN. Presence rejects (US4 scenario 2).

### `folder` (optional, both modes)

A vault-relative folder path string. Non-empty per `min(1)` (R15).

- Omitted → CLI receives no `folder=` argument → enumerates the vault root.
- Present → CLI receives `folder=<value>` → enumerates the named folder (recursively at the CLI; wrapper applies non-recursive filter per R6).
- Empty string (`folder: ""`) → rejected at validation.
- Trailing slash (`folder: "Inbox/"`) and no trailing slash (`folder: "Inbox"`) produce byte-identical responses (FR-013; CLI-normalised per F4).
- Path-traversal patterns (`folder: "../../etc"`, `folder: "Fixtures/../Fixtures/BI-009"`, `folder: "/absolute"`) are passed through verbatim and confined at the CLI (FR-016; CLI-confined per F15 / F16 / F17). The wrapper does NOT pre-validate or normalise.
- Case-sensitivity on `folder` is platform-dependent (Windows / macOS-default case-insensitive; Linux case-sensitive); the wrapper does NOT impose case normalisation.

### `ext` (optional, both modes)

A file-extension filter string. Non-empty per `min(1)` (R15).

- Omitted → CLI receives no `ext=` argument → returns all files regardless of extension.
- Present → CLI receives `ext=<value>` → returns only files matching the extension.
- Both `ext: "md"` and `ext: ".md"` are accepted by the CLI; the wrapper passes through verbatim (F7).
- The CLI matches extension case-SENSITIVELY (`ext: "MD"` does NOT match `.md` files; F8). The wrapper does NOT pre-normalise case.
- Empty string (`ext: ""`) → rejected at validation.
- An unrecognised extension (`ext: "qqq"`) returns the empty-folder shape `{ count: 0, paths: [] }` — NOT an error (F9 + FR-010 conflation extends).

### `total` (optional boolean; default `false`)

Controls whether the response payload includes the `paths` array.

- `total: false` (or omitted) → response is `{ count: N, paths: [<N sorted paths>] }`.
- `total: true` → response is `{ count: N, paths: [] }`. The count value is identical to what `total: false` would return (FR-007 / SC-005).
- Non-boolean values (`"true"`, `1`, `null`, `[]`) reject at validation.

**Note**: `total: true` does NOT escape the typed-tool output cap. The wrapper applies the same CLI fetch + filter pipeline in both modes (R7). The token saving from `total: true` is at the wrapper→MCP-client response payload, not at the CLI→wrapper response payload. See Plan-amendment-1 in research.md.

## Six worked examples

### Example A — Specific mode, named folder, no ext filter

```json
{ "target_mode": "specific", "vault": "Demo", "folder": "Inbox" }
```

CLI invocation: `obsidian vault=Demo files folder=Inbox`. Wrapper applies non-recursive filter, sort, returns `{ count, paths }` with vault-relative paths directly inside `Inbox/`.

### Example B — Specific mode, vault root, ext filter

```json
{ "target_mode": "specific", "vault": "Demo", "ext": "md" }
```

CLI invocation: `obsidian vault=Demo files ext=md`. Wrapper applies non-recursive filter (root-level paths only, threshold = 1 component), sort, returns `{ count, paths }` with root-level `.md` files only.

### Example C — Active mode, named folder

```json
{ "target_mode": "active", "folder": "Daily" }
```

CLI invocation: `obsidian files folder=Daily` (no `vault=` argument; cli-adapter's `target_mode: "active"` plumbing strips any leaked locator). Returns the focused vault's `Daily/` listing.

### Example D — Count-only (`total: true`)

```json
{ "target_mode": "specific", "vault": "Demo", "folder": "Drafts", "total": true }
```

CLI invocation: `obsidian vault=Demo files folder=Drafts` (NOT `files folder=Drafts total` — wrapper does NOT delegate to CLI's total flag per R7). Wrapper fetches, filters, counts, discards paths. Response: `{ count: N, paths: [] }`.

### Example E — Combined ext + total

```json
{ "target_mode": "specific", "vault": "Demo", "folder": "Assets", "ext": "png", "total": true }
```

CLI invocation: `obsidian vault=Demo files folder=Assets ext=png`. Returns `{ count: <png count>, paths: [] }`.

### Example F — Active mode, vault root, all files

```json
{ "target_mode": "active" }
```

CLI invocation: `obsidian files`. Returns the focused vault's root-level files. Active-mode TOCTOU caveat applies — the focused vault MAY change between submission and execution; the response carries NO `vault` echo (spec clarification Q3).

## Validation failure roster

Every validation failure surfaces as `VALIDATION_ERROR` with `details.issues` populated by zod (FR-014 / FR-020). The CLI is NEVER invoked when validation fails.

| Cause | Example input | Zod error path |
|---|---|---|
| Missing `vault` in specific mode | `{ target_mode: "specific" }` | `["vault"]` |
| `vault` in active mode | `{ target_mode: "active", vault: "X" }` | `["vault"]` |
| `file` in any mode | `{ target_mode: "specific", vault: "X", file: "y" }` | `["file"]` |
| `path` in any mode | `{ target_mode: "active", path: "y.md" }` | `["path"]` |
| Unknown top-level key | `{ target_mode: "active", foo: "bar" }` | `["foo"]` |
| `target_mode` outside enum | `{ target_mode: "nope" }` | `["target_mode"]` |
| `total` non-boolean | `{ target_mode: "active", total: "true" }` | `["total"]` |
| `folder` non-string | `{ target_mode: "active", folder: [] }` | `["folder"]` |
| `folder` empty string | `{ target_mode: "active", folder: "" }` | `["folder"]` |
| `ext` non-string | `{ target_mode: "active", ext: 5 }` | `["ext"]` |
| `ext` empty string | `{ target_mode: "active", ext: "" }` | `["ext"]` |

## Downstream failure roster

The following failures occur AFTER validation passes; they flow through `UpstreamError` codes inherited from the cli-adapter (FR-020 — zero new codes).

| Cause | Code | Source |
|---|---|---|
| Vault display name does not match any registered vault | `CLI_REPORTED_ERROR` | cli-adapter 011-R5 inspection clause (F13) |
| `obsidian` binary not on PATH / not executable | `CLI_BINARY_NOT_FOUND` | binary-resolver (017) |
| CLI exits with non-zero status code | `CLI_NON_ZERO_EXIT` | cli-adapter dispatch layer |
| CLI prints `Error: …` to stdout (exit 0) | `CLI_REPORTED_ERROR` | cli-adapter four-priority classifier |
| Active mode and no Obsidian instance reachable | `CLI_REPORTED_ERROR` or `ERR_NO_ACTIVE_FILE` | depends on CLI behaviour at probe time (T0 verifies) |
| CLI stdout exceeds 10 MiB output cap | `CLI_NON_ZERO_EXIT` (cap-exceeded kill) | cli-adapter `dispatchCap` event |
| CLI exceeds 10 s timeout | `CLI_NON_ZERO_EXIT` (timeout kill) | cli-adapter `dispatchTimeout` event |
