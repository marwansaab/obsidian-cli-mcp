# Contract: `write_note` input

**Feature**: `016-reliable-writer`
**Surface**: MCP tool input schema (`writeNoteInputSchema`) at `src/tools/write_note/schema.ts`
**Plan reference**: [plan.md](../plan.md) | **Data model**: [data-model.md](../data-model.md)

## Public input shape

```ts
type WriteNoteInput = z.infer<typeof writeNoteInputSchema>;

// In specific mode (target_mode === "specific"):
interface SpecificMode {
  target_mode: "specific";
  vault: string;                // required
  // exactly one of file/path:
  file?: string;
  path?: string;
  content: string;              // required; ANY size; never crosses argv
  overwrite?: boolean;          // default false
  open?: boolean;               // optional
  // template? — REJECTED at schema layer (FR-016)
}

// In active mode (target_mode === "active"):
interface ActiveMode {
  target_mode: "active";
  content: string;              // required
  overwrite: true;              // MUST be true (active mode is destructive by definition)
  // vault? / file? / path? / open? / template? — ALL forbidden at schema layer
}
```

## Emitted JSON Schema (after `stripSchemaDescriptions`)

The published `inputSchema` (consumed by MCP clients) is generated from `writeNoteInputSchema` via `zod-to-json-schema` then descriptions-stripped per ADR-005. Shape:

```json
{
  "type": "object",
  "required": ["target_mode"],
  "additionalProperties": false,
  "properties": {
    "target_mode": { "type": "string", "enum": ["specific", "active"] },
    "vault": { "type": "string", "minLength": 1 },
    "file": { "type": "string", "minLength": 1 },
    "path": { "type": "string", "minLength": 1 },
    "content": { "type": "string" },
    "overwrite": { "type": "boolean", "default": false },
    "open": { "type": "boolean" }
  }
}
```

`required` deliberately under-promises (only `target_mode`) per the existing project pattern — the per-mode constraints (vault required in specific; XOR of file/path; vault/file/path/open forbidden in active; overwrite=true required in active) are enforced at runtime via the schema's `superRefine` and surface as `VALIDATION_ERROR`. Strict-naive clients validating only against the static JSON Schema will not catch missing-vault or template-supplied inputs at client side; the bridge will still reject them at the boundary. Strict-rich clients (Claude Desktop, MCP Inspector) forward unknown keys verbatim to the bridge, where `additionalProperties: false` rejects them.

## Field policy

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `target_mode` | `"specific" \| "active"` | YES (top-level) | — | Discriminator per ADR-003 |
| `vault` | `string` (min 1) | YES in specific; FORBIDDEN in active | — | Resolved via vault registry per FR-012 |
| `file` | `string` (min 1, structurally-safe) | XOR with `path` in specific; FORBIDDEN in active | — | Path-safety FR-013 applies |
| `path` | `string` (min 1, structurally-safe) | XOR with `file` in specific; FORBIDDEN in active | — | Path-safety FR-013 applies |
| `content` | `string` | YES (both modes) | — | ANY size; UTF-8; preserved byte-for-byte (FR-004); NEVER crosses argv (FR-005) |
| `overwrite` | `boolean` | NO in specific (defaults false); MUST be `true` in active | `false` (specific) | Race-free via `wx` flag for false case (FR-009) |
| `open` | `boolean` | NO; FORBIDDEN in active | undefined (= false) | Honoured via post-write eval (FR-017) |
| `template` | (n/a) | EXPLICITLY FORBIDDEN | — | Rejected as `unrecognized_keys` (FR-016) |

## Structural-path validator (FR-013)

Applied to `file` and `path` fields via `z.string().refine(isStructurallySafePath, ...)`:

```ts
function isStructurallySafePath(input: string): boolean {
  // Reject: empty
  if (input.length === 0) return false;
  // Reject: leading absolute markers
  if (input.startsWith("/") || input.startsWith("\\")) return false;
  // Reject: drive-letter prefix
  if (/^[A-Za-z]:/.test(input)) return false;
  // Reject: ../ or ..\ segments
  if (/(^|[\/\\])\.\.([\/\\]|$)/.test(input)) return false;
  // Reject: control characters
  if (/[\x00-\x1f]/.test(input)) return false;
  return true;
}
```

This is a STRUCTURAL check; runtime canonical-path check (FR-014, see `path-safety.contract.md`) is the second layer that catches symlink-escape attacks the structural check can't see.

## Worked examples

### A. Specific mode, fresh path, default overwrite=false

```json
{
  "target_mode": "specific",
  "vault": "TestVault-Obsidian-CLI-MCP",
  "path": "Sandbox/2026-05-10-meeting.md",
  "content": "# Meeting notes\n\n- attendees: ...\n- decisions: ...\n"
}
```

→ writes a fresh file at `<vaultRoot>/Sandbox/2026-05-10-meeting.md`. Returns `{ created: true, path: "Sandbox/2026-05-10-meeting.md" }`. If the path is occupied → `FILE_EXISTS`.

### B. Specific mode, overwrite=true (replace)

```json
{
  "target_mode": "specific",
  "vault": "TestVault-Obsidian-CLI-MCP",
  "path": "Sandbox/scratch.md",
  "content": "(overwritten)",
  "overwrite": true
}
```

→ atomically replaces (or creates if absent) via temp + rename. Returns `{ created: <true if was absent, false if was present>, path: "Sandbox/scratch.md" }`.

### C. Specific mode with file (basename) + overwrite + open

```json
{
  "target_mode": "specific",
  "vault": "TestVault-Obsidian-CLI-MCP",
  "file": "scratch.md",
  "content": "(overwritten in vault root)",
  "overwrite": true,
  "open": true
}
```

→ writes `<vaultRoot>/scratch.md`; post-write opens in editor. Note: writing to vault root is permitted by the bridge but discouraged by Obsidian's tool execution instructions for this project; agents typically use `path` with a directory prefix.

### D. Active mode, overwrite focused note

```json
{
  "target_mode": "active",
  "content": "(focused note's content fully replaced)",
  "overwrite": true
}
```

→ resolves the focused file's path via small bug-safe pre-write eval; rewrites that file via the same fs path. Returns `{ created: false, path: "<focused-file-path>" }`. If no focused file → `ERR_NO_ACTIVE_FILE`.

### E. Specific mode with template (REJECTED — migration example)

```json
{
  "target_mode": "specific",
  "vault": "TestVault-Obsidian-CLI-MCP",
  "path": "Daily/2026-05-10.md",
  "template": "Daily",
  "content": ""
}
```

→ `VALIDATION_ERROR` with `details.issues[0].code = "unrecognized_keys"` and `details.issues[0].keys = ["template"]`. The progressive-disclosure help (FR-022) explains the migration: use `obsidian_exec` instead:

```json
{
  "argv": ["create", "path=Daily/2026-05-10.md", "template=Daily"]
}
```

`template=Daily` argv is small enough to dodge the upstream defect.

### F. Specific mode, content with BI-038 trigger fragments (no longer crashes)

```json
{
  "target_mode": "specific",
  "vault": "TestVault-Obsidian-CLI-MCP",
  "path": "Sandbox/trigger-chars.md",
  "content": "Body with \"quotes\", trailing-comma-bracket ,] , JSON-like {\"tty\":\"false\"}, and emoji 🚀."
}
```

→ writes byte-for-byte; the special characters that crashed the predecessor are inert under the new design because content never crosses argv (FR-005, SC-007).

## Error responses

| Code | When | Recovery hint |
|---|---|---|
| `VALIDATION_ERROR` | Schema rejection: missing `target_mode`, missing `vault` in specific, both/neither file&path, forbidden key in active, active without `overwrite: true`, `template` supplied, unstructured-safe path, vault not in registry | Agent retries with corrected input. `details.issues` carries per-issue `path` + `message` + zod code |
| `ERR_NO_ACTIVE_FILE` | Active mode, no focused file in Obsidian | Open a note in editor, or call again with `target_mode: "specific"` + explicit vault + file/path |
| `FILE_EXISTS` | Specific mode, `overwrite: false` (or default), target path already occupied | Retry with `overwrite: true` if appropriate, or pick a different path. `details.path` carries the offending vault-relative path |
| `PATH_ESCAPES_VAULT` | Runtime canonical check: input is structurally safe but resolves outside vault root via a symlink | Agent does not retry (security gate). `details.vault` and `details.attemptedPath` for diagnostic. Logger event `pathEscapeAttempt` fires for operator audit |
| `FS_WRITE_FAILED` | Generic fs failure: ENOSPC (disk full), EACCES / EPERM (permissions), EROFS (read-only filesystem), EIO, etc. | `details.errno` carries the underlying OS errno. Agent may retry on transient errors; user action needed for permission/disk |
| `CLI_BINARY_NOT_FOUND` | First write triggers vault-registry probe; `obsidian` binary not on PATH | Operator install / `PATH` fix |
| `CLI_REPORTED_ERROR` | First write triggers vault-registry probe; CLI ran but Obsidian app not running (probe couldn't connect to IPC) | Open Obsidian, retry the call. Cache stays unset; next call retries the probe |
| `CLI_TIMEOUT` | Vault-registry probe or post-write `metadataCache` invalidation eval exceeded ADR-007's 10s typed-tool bound | Rare in practice (probe is ~150ms, eval is ~150ms). For invalidation eval timeout: per FR-011 / R5, the write succeeded; the call still returns success. Only the probe-timeout case surfaces this code |

## Multi-vault notes

The new tool **resolves** the inherited R11 multi-vault routing limitation. `vault=Foo` writes to Foo's absolute filesystem path regardless of which vault Obsidian currently has focused. This is a deliberate departure from the predecessor's behaviour (where vault= was effectively ignored by the IPC channel). Documented in `docs/tools/write_note.md` per FR-022.
