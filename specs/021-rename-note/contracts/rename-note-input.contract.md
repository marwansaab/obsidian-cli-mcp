# Contract: `rename_note` Input

**Branch**: `021-rename-note` | **Date**: 2026-05-12 | **Spec**: [spec.md](../spec.md)

This is the public input contract for the `rename_note` MCP tool. The zod schema is the single source of truth (Constitution Principle III); this document captures the wire shape, the per-mode rules, the validation error roster, and worked examples.

## Zod schema

```typescript
// src/tools/rename_note/schema.ts
// Original — no upstream. rename_note input/output schemas — flat target-mode primitive extension; name with min(1) + folder-separator-rejection regex per /speckit-clarify Q2; renamed z.literal(true) success-only output shape.
import { z } from "zod";
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const renameNoteInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    name: z.string().min(1).regex(
      /^[^/\\]+$/,
      "name must not contain folder separators; use move_note to relocate the file to a different folder",
    ),
  }),
);

export const renameNoteOutputSchema = z.object({
  renamed: z.literal(true),
  fromPath: z.string(),
  toPath: z.string(),
}).strict();

export type RenameNoteInput = z.infer<typeof renameNoteInputSchema>;
export type RenameNoteOutput = z.infer<typeof renameNoteOutputSchema>;
```

## Emitted JSON Schema (post-`stripSchemaDescriptions`)

```json
{
  "type": "object",
  "properties": {
    "target_mode": { "type": "string", "enum": ["specific", "active"] },
    "vault": { "type": "string", "minLength": 1 },
    "file": { "type": "string" },
    "path": { "type": "string" },
    "name": { "type": "string", "minLength": 1, "pattern": "^[^/\\\\]+$" }
  },
  "required": ["target_mode", "name"],
  "additionalProperties": false
}
```

Five top-level properties; flat shape; `additionalProperties: false`; no `oneOf` envelope. `vault` is required ONLY in specific mode — that conditional is enforced by the runtime `superRefine` (from `applyTargetModeRefinement`), NOT by the JSON Schema's `required` array (post-010 flat-emit shape).

## Field policy

| Field | Type | Required | Allowed values |
|-------|------|----------|----------------|
| `target_mode` | string enum | YES | `"specific"` or `"active"` |
| `vault` | string (non-empty) | YES in specific mode; FORBIDDEN in active mode | Any non-empty UTF-8 string |
| `file` | string | XOR with `path` in specific mode; FORBIDDEN in active mode | Wikilink-form (no extension, no folder separator typically — but the CLI handles resolution) |
| `path` | string | XOR with `file` in specific mode; FORBIDDEN in active mode | Vault-relative path; the CLI accepts vault-relative paths with folder separators (`Inbox/Note.md`, etc.) |
| `name` | string | YES | Non-empty UTF-8 string; MUST NOT contain `/` or `\` |

**Cross-field rules**:
- In `specific` mode: exactly one of `file` or `path` MUST be provided; `vault` MUST be provided.
- In `active` mode: `vault` / `file` / `path` MUST all be absent.
- `name` is required in BOTH modes.
- Top-level unknown keys → `unrecognized_keys` rejection (strict mode inherited from `targetModeBaseSchema.strict()`).

## Worked examples

### Example A — Specific + path: basic `.md` rename with extension append

```json
{ "target_mode": "specific", "vault": "MyVault", "path": "Inbox/Typo.md", "name": "Fixed" }
```

Parses successfully. Handler computes argv `name=` value via `appendMdIfMissing("Fixed")` → `"Fixed.md"`. CLI receives `vault=MyVault rename path=Inbox/Typo.md name=Fixed.md`. On success, response: `{ renamed: true, fromPath: "Inbox/Typo.md", toPath: "Inbox/Fixed.md" }`.

### Example B — Specific + path: `name` already ends in `.md` (verbatim forwarding)

```json
{ "target_mode": "specific", "vault": "MyVault", "path": "Inbox/Typo.md", "name": "Fixed.md" }
```

Parses successfully. `appendMdIfMissing("Fixed.md")` → `"Fixed.md"` (verbatim). No double-`.md`. CLI receives `name=Fixed.md`. Response: `{ renamed: true, fromPath: "Inbox/Typo.md", toPath: "Inbox/Fixed.md" }`.

### Example C — Specific + file: wikilink locator + extension preservation

```json
{ "target_mode": "specific", "vault": "MyVault", "file": "QuickNote", "name": "Quick Note" }
```

Parses successfully. `appendMdIfMissing("Quick Note")` → `"Quick Note.md"`. CLI receives `vault=MyVault rename file=QuickNote name=Quick Note.md`. The CLI resolves the wikilink `QuickNote` to its on-disk path (likely `Inbox/QuickNote.md` or wherever Obsidian indexed it). Response: `{ renamed: true, fromPath: "Inbox/QuickNote.md", toPath: "Inbox/Quick Note.md" }` (paths reflect CLI's canonical resolution).

### Example D — Specific + path: internal periods in `name` (preserved per /speckit-clarify Q1)

```json
{ "target_mode": "specific", "vault": "MyVault", "path": "Drafts/Sketch.md", "name": "Doc.v1.draft" }
```

Parses successfully. `appendMdIfMissing("Doc.v1.draft")` → `"Doc.v1.draft.md"` (`.draft` ≠ `.md` per case-sensitive byte equality). CLI receives `name=Doc.v1.draft.md`. Response: `{ renamed: true, fromPath: "Drafts/Sketch.md", toPath: "Drafts/Doc.v1.draft.md" }`. Internal periods preserved verbatim.

### Example E — Active mode: rename focused note

```json
{ "target_mode": "active", "name": "Today" }
```

Parses successfully. `appendMdIfMissing("Today")` → `"Today.md"`. CLI receives `rename name=Today.md` (no `vault=`, no `file=`, no `path=`). The CLI's "most commands default to the active file when file/path is omitted" rule applies. Response: `{ renamed: true, fromPath: "<focused note's path>", toPath: "<focused note's folder>/Today.md" }`.

### Example F — Cross-extension rename: out of scope per /speckit-clarify Q1

```json
{ "target_mode": "specific", "vault": "MyVault", "path": "Drafts/Sketch.md", "name": "Sketch.canvas" }
```

Parses successfully. `appendMdIfMissing("Sketch.canvas")` → `"Sketch.canvas.md"` (`.canvas` ≠ `.md`). CLI receives `name=Sketch.canvas.md`. Response: `{ renamed: true, fromPath: "Drafts/Sketch.md", toPath: "Drafts/Sketch.canvas.md" }`. **Note**: callers that genuinely want a `.md → .canvas` type conversion route through `obsidian_exec rename path=Drafts/Sketch.md name=Sketch.canvas` directly. The `rename_note` typed surface is scoped to `.md` notes per /speckit-clarify Q1 scope narrowing.

## Validation failure roster

Each row maps to a Story 6 acceptance scenario and an FR-016 schema test case. All produce `code: "VALIDATION_ERROR"`; the table identifies the `details.issues[].path` and the rough message keyword.

| Input shape | `details.issues[].path` | Message keyword | Story 6 AC | FR-016 case |
|-------------|--------------------------|-----------------|------------|-------------|
| `{ target_mode: "specific", vault: "V", name: "X" }` (no locator) | `[]` (the parent path) | `"exactly one of"` | AC#1 | (e) |
| `{ target_mode: "specific", vault: "V", file: "F", path: "P.md", name: "X" }` (both locators) | `["file"]` and `["path"]` | `"exactly one of"` | AC#2 | (f) |
| `{ target_mode: "specific", path: "P.md", name: "X" }` (no vault) | `["vault"]` | `"vault is required in specific mode"` | AC#3 | (g) |
| `{ target_mode: "active", vault: "V", name: "X" }` (forbidden vault in active) | `["vault"]` | `"vault is not allowed in active mode"` | AC#4 | (h) |
| `{ target_mode: "active", file: "F", name: "X" }` (forbidden file in active) | `["file"]` | `"file is not allowed in active mode"` | AC#4 | (h) |
| `{ target_mode: "active", path: "P.md", name: "X" }` (forbidden path in active) | `["path"]` | `"path is not allowed in active mode"` | AC#4 | (h) |
| `{ target_mode: "specific", vault: "V", path: "P.md", name: "X", pancakes: "yes" }` (unknown key) | `["pancakes"]` | `code: "unrecognized_keys"`; message names `pancakes` | AC#5 | (i) |
| `{ target_mode: "specific", vault: "V", path: "P.md", name: "" }` (empty name) | `["name"]` | `code: "too_small"`; message names `.min(1)` | AC#6 | (j) |
| `{ target_mode: "specific", vault: "V", path: "P.md" }` (name absent) | `["name"]` | `code: "invalid_type"`; message names "Required" or zod equivalent | AC#7 | (k) |
| `{ target_mode: "specific", vault: "V", path: "P.md", name: 42 }` (name non-string) | `["name"]` | `code: "invalid_type"`; "Expected string, received number" | AC#7 | (k) |
| `{ target_mode: "specific", vault: "V", path: "P.md", name: "Sub/X" }` (name with `/`) | `["name"]` | `"name must not contain folder separators; use move_note to relocate"` | AC#8 | (m) |
| `{ target_mode: "specific", vault: "V", path: "P.md", name: "Sub\\X" }` (name with `\`) | `["name"]` | Same as above | AC#8 | (m) |
| `{ target_mode: "unknown", vault: "V", path: "P.md", name: "X" }` (invalid discriminator) | `["target_mode"]` | `code: "invalid_enum_value"` | (not in Story 6 main list — covered by Story 5 AC#2 indirectly) | (l) |
| `{ target_mode: "specific", vault: "", path: "P.md", name: "X" }` (empty vault) | `["vault"]` | `code: "too_small"`; message names `.min(1)` | Edge Cases | (additional schema test) |

## Downstream failure roster (post-validation, in the handler / adapter layer)

Failures that pass the schema layer but surface from the handler / adapter:

| Failure mode | UpstreamError code | `details` shape | Story 7 AC |
|--------------|---------------------|------------------|------------|
| Obsidian binary missing | `CLI_BINARY_NOT_FOUND` | Per 017-cross-platform-support resolver structured shape (`platform`, `attempts[]`, `PATH`) | AC#1 |
| CLI process non-zero exit (permission denied, OS-level error) | `CLI_NON_ZERO_EXIT` | `{ exitCode, stderr, stdout }` per cli-adapter contract | AC#2 |
| CLI in-band Error (source not found) | `CLI_REPORTED_ERROR` | `{ message }` containing the verbatim CLI line | AC#3 + Story 4 AC#1 |
| CLI in-band Error (destination collision) | `CLI_REPORTED_ERROR` | `{ message }` containing the verbatim CLI line | Story 4 AC#2 |
| Active mode but no focused file | `ERR_NO_ACTIVE_FILE` | Per cli-adapter contract | Story 5 AC#3 |
| Unknown vault display name | `CLI_REPORTED_ERROR` (via 011-R5 response-inspection in adapter) | `{ message }` containing the verbatim CLI line (e.g., `Vault not found.`) | Edge Cases |
| Path-traversal `path` value (e.g., `"../../etc/passwd.md"`) | `CLI_REPORTED_ERROR` if CLI rejects (verified at T0 per FR-019 case (ix) / SC-012) | `{ message }` | Edge Cases |
| Adapter throws non-`UpstreamError` exception | Re-thrown verbatim WITHOUT `asToolError` wrapping | n/a | AC#4 |
| Response-parser fails to extract fromPath/toPath from CLI stdout | `CLI_REPORTED_ERROR` | `{ stdout }` with the unparsable response | Handler test 18 |

## Multi-vault notes

The CLI's `vault=` parameter targets a named vault. For the `rename` subcommand specifically, T0 of /speckit-implement verifies:
- Whether `vault=` is honoured (likely yes — `rename` is a write operation and the CLI generally honours `vault=` for writes).
- The unknown-vault response signature (verify matches 011-R5's `Vault not found.` signature).

Multi-vault default-ambiguity caveat (inherited from prior tools): when no vault is focused in Obsidian's UI and the call uses `target_mode: "active"`, the CLI surfaces `Error: no active file` which the adapter classifies as `ERR_NO_ACTIVE_FILE`. Users who want a deterministic target use `target_mode: "specific"` with an explicit `vault=` parameter.

## Strict-rich vs strict-naive client-class observability

Per the Edge Cases discussion in the spec: strict-rich clients (Claude Desktop, MCP Inspector) read the published `inputSchema` and either forward unknown keys (bridge-side rejection observable) or strip them client-side (bridge-side rejection non-observable but schema-side invariant holds). Strict-naive clients (Cowork) always forward; bridge-side rejection always observable. Tests assume the strict-rich-forwarding path.
