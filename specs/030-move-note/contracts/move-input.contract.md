# Contract: `move` Tool Input Schema

**Branch**: `030-move-note` | **Date**: 2026-05-15 | **Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)

This contract defines the public input shape that an MCP client sends to invoke `move`, and the structured failures the tool returns at the validation boundary. Downstream failures (CLI binary missing, non-zero exit, in-band `Error:` reply, no active file) are captured separately in [move-handler.contract.md](./move-handler.contract.md).

## Zod schema

```typescript
import { z } from "zod";
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const moveInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    to: z.string().min(1),
  })
);

export type MoveInput = z.infer<typeof moveInputSchema>;
```

Composed via the post-010 Pattern (a) flat-extension idiom per [010-flatten-target-mode](../../010-flatten-target-mode/spec.md). `.extend()` (NOT `.merge()`) is binding — `.merge()` resets `unknownKeys` to `"strip"` and silently drops strict-mode against unknown top-level keys.

Inherits from the target-mode primitive:
- `target_mode: "specific" | "active"` (required)
- `vault: z.string().min(1)` (required in specific, forbidden in active)
- `file: z.string().min(1)` (specific-only, mutually exclusive with `path`)
- `path: z.string().min(1)` (specific-only, mutually exclusive with `file`)
- `additionalProperties: false` strict-mode

Adds:
- `to: z.string().min(1)` (required in both modes)

**No `.describe()` annotations** anywhere (per FR-004 / SC-005 — parameter documentation lives in `docs/tools/move.md`).

## Emitted JSON Schema (post-`stripSchemaDescriptions`)

```json
{
  "type": "object",
  "properties": {
    "target_mode": { "type": "string", "enum": ["specific", "active"] },
    "vault": { "type": "string", "minLength": 1 },
    "file": { "type": "string", "minLength": 1 },
    "path": { "type": "string", "minLength": 1 },
    "to": { "type": "string", "minLength": 1 }
  },
  "required": ["target_mode", "to"],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

Flat shape per the post-010 emission contract (no `oneOf` envelope). The `vault`/`file`/`path` conditionality on `target_mode` is enforced by the runtime `superRefine` rather than the JSON Schema's `required` list; the static schema declares the minimum required set (`["target_mode", "to"]`) and the runtime catches mode-specific violations with structured paths.

## Field policy

| Field | Type | Required when | Forbidden when | Constraint | Notes |
|--------|------|---------------|------------------|--------------|-------|
| `target_mode` | `"specific" \| "active"` | Always | — | enum | Discriminator |
| `vault` | string | `target_mode === "specific"` | `target_mode === "active"` | min length 1 | Vault display name (must be opened in Obsidian) |
| `file` | string | One of `file`/`path` in specific mode | `target_mode === "active"` AND mutually exclusive with `path` | min length 1 | Wikilink-form source (CLI resolves) |
| `path` | string | One of `file`/`path` in specific mode | `target_mode === "active"` AND mutually exclusive with `file` | min length 1 | Exact vault-relative source path |
| `to` | string | Always | — | min length 1 | Destination; trailing-`/` discriminates folder-target from full-path-target per [/speckit-clarify Q2, 2026-05-15] |

**Note**: the trailing-`/` discriminator and the source-`.md`-guarded `.md` append rule for full-path-target `to` live at the handler layer in `resolveTo` per FR-003. The schema does NOT enforce shape constraints on `to` beyond non-emptiness. Both shapes (`Archive/` and `Archive/Note.md`) pass schema validation; the helper branches at handler time.

## Worked examples

### Example A — Specific + path: folder-target move

```json
{
  "target_mode": "specific",
  "vault": "MyVault",
  "path": "Inbox/Tax-2026.md",
  "to": "Archive/2026/"
}
```

Validates. Handler computes `resolveTo("Archive/2026/", "Inbox/Tax-2026.md")` → `"Archive/2026/Tax-2026.md"`. Argv: `vault=MyVault, move, path=Inbox/Tax-2026.md, to=Archive/2026/Tax-2026.md`.

### Example B — Specific + path: full-path-target move with rename (`.md` source, explicit `.md`)

```json
{
  "target_mode": "specific",
  "vault": "MyVault",
  "path": "Inbox/Tax-2026.md",
  "to": "Archive/2026-Tax-Return.md"
}
```

Validates. Handler computes `resolveTo("Archive/2026-Tax-Return.md", "Inbox/Tax-2026.md")` → `"Archive/2026-Tax-Return.md"` (verbatim; filename already `.md`). Argv: `vault=MyVault, move, path=Inbox/Tax-2026.md, to=Archive/2026-Tax-Return.md`.

### Example C — Specific + path: full-path-target with `.md` append (`.md` source, non-`.md` filename)

```json
{
  "target_mode": "specific",
  "vault": "MyVault",
  "path": "Inbox/Tax-2026.md",
  "to": "Archive/2026-Tax-Return"
}
```

Validates. Handler computes `resolveTo("Archive/2026-Tax-Return", "Inbox/Tax-2026.md")` → `"Archive/2026-Tax-Return.md"` (append fires; source-`.md` AND filename non-`.md`). Argv: `vault=MyVault, move, path=Inbox/Tax-2026.md, to=Archive/2026-Tax-Return.md`.

### Example D — Specific + path: full-path-target on non-`.md` source (source-`.md`-guard suppression)

```json
{
  "target_mode": "specific",
  "vault": "MyVault",
  "path": "Boards/Plan.canvas",
  "to": "Archive/Plan-Archived"
}
```

Validates. Handler computes `resolveTo("Archive/Plan-Archived", "Boards/Plan.canvas")` → `"Archive/Plan-Archived"` (source-`.md` guard suppresses append; `fromPath.endsWith(".md") === false`). Argv: `vault=MyVault, move, path=Boards/Plan.canvas, to=Archive/Plan-Archived`. CLI handles the extensionless destination per T0 case xi. **No silent `.canvas → .md` cross-type conversion**.

### Example E — Specific + file: wikilink locator

```json
{
  "target_mode": "specific",
  "vault": "MyVault",
  "file": "Tax-2026",
  "to": "Archive/2026/"
}
```

Validates. Handler forwards `to="Archive/2026/"` verbatim (the wrapper cannot apply the source-`.md` guard because `fromPath` is CLI-resolved per R3 single-spawn invariant). Argv: `vault=MyVault, move, file=Tax-2026, to=Archive/2026/`. CLI resolves `Tax-2026` to a concrete on-disk source AND interprets the trailing-`/` `to=` as a folder-target preserving the resolved source basename. Response `fromPath` and `toPath` are canonical from CLI output.

### Example F — Active mode: move focused note

```json
{
  "target_mode": "active",
  "to": "Archive/"
}
```

Validates. Handler forwards `to="Archive/"` verbatim. Argv: `move, to=Archive/` (no `vault=`, no `file=`, no `path=`). CLI moves the focused note in the focused vault.

### Example G — Surprise case: `to` without trailing `/` (full-path-target by strict discriminator per /speckit-clarify Q2)

```json
{
  "target_mode": "specific",
  "vault": "MyVault",
  "path": "Welcome.md",
  "to": "Archive"
}
```

Validates. Handler computes `resolveTo("Archive", "Welcome.md")` → `"Archive.md"` (full-path-target by strict trailing-`/` discriminator; append fires because source is `.md` and filename `"Archive"` is non-`.md`). Argv: `vault=MyVault, move, path=Welcome.md, to=Archive.md`. **Effective result: file moved to vault-root `Archive.md`, NOT into the `Archive/` folder**. Callers wanting folder-target shape MUST include the trailing `/` (`to: "Archive/"`). Documented prominently in `docs/tools/move.md` per FR-014 enhanced post-Q2.

### Example H — UTF-8 multi-byte path and `to`

```json
{
  "target_mode": "specific",
  "vault": "MyVault",
  "path": "Inbox/日記.md",
  "to": "アーカイブ/"
}
```

Validates. Handler computes `resolveTo("アーカイブ/", "Inbox/日記.md")` → `"アーカイブ/日記.md"` (folder-target; UTF-8 bytes forwarded verbatim). Argv: `vault=MyVault, move, path=Inbox/日記.md, to=アーカイブ/日記.md`.

## Validation failure roster

All failures surface as `code: "VALIDATION_ERROR"` with `details.issues` carrying the zod-shaped issue list. The adapter is NEVER invoked for any of these.

| Failure | Trigger | `details.issues[].path` | Spec reference |
|----------|---------|--------------------------|-----------------|
| Neither `file` nor `path` in specific mode | `{target_mode: "specific", vault: "V", to: "..."}` (no locator) | `[]` (form-level superRefine) | Story 4 AC#1 |
| Both `file` AND `path` in specific mode (XOR violation) | `{target_mode: "specific", vault: "V", file: "F", path: "P.md", to: "..."}` | `[]` (form-level superRefine) | Story 4 AC#2 |
| `vault` missing in specific mode | `{target_mode: "specific", path: "P.md", to: "..."}` | `["vault"]` | Story 4 AC#3 |
| Empty `vault` in specific mode | `{target_mode: "specific", vault: "", path: "P.md", to: "..."}` | `["vault"]` | Edge case |
| Forbidden `vault` in active mode | `{target_mode: "active", vault: "V", to: "..."}` | `["vault"]` | Story 4 AC#4 |
| Forbidden `file` in active mode | `{target_mode: "active", file: "F", to: "..."}` | `["file"]` | Story 4 AC#4 |
| Forbidden `path` in active mode | `{target_mode: "active", path: "P.md", to: "..."}` | `["path"]` | Story 4 AC#4 |
| Unknown top-level key | `{target_mode: "specific", vault: "V", path: "P.md", to: "...", pancakes: "yes"}` | `[]` (zod `unrecognized_keys`; key names in `keys: ["pancakes"]`) | Story 4 AC#5 |
| Empty `to` | `{target_mode: "specific", vault: "V", path: "P.md", to: ""}` | `["to"]` | Story 4 AC#6 |
| Missing `to` | `{target_mode: "specific", vault: "V", path: "P.md"}` | `["to"]` | Story 4 AC#7 |
| Non-string `to` | `{target_mode: "specific", vault: "V", path: "P.md", to: 42}` | `["to"]` | Story 4 AC#7 |
| Invalid `target_mode` value | `{target_mode: "all", vault: "V", path: "P.md", to: "..."}` | `["target_mode"]` | Edge case |
| Missing `target_mode` | `{vault: "V", path: "P.md", to: "..."}` | `["target_mode"]` | Edge case |
| Non-string `target_mode` | `{target_mode: 42, vault: "V", path: "P.md", to: "..."}` | `["target_mode"]` | Edge case |

## Downstream failure roster (post-validation, in the handler / adapter layer)

See [move-handler.contract.md](./move-handler.contract.md) for the full propagation chain. Summary:

| Code | Trigger | Notes |
|-------|---------|--------|
| `CLI_BINARY_NOT_FOUND` | Adapter's binary-resolver fails (`ENOENT` or no binary on PATH) | Per [017-cross-platform-support](../../017-cross-platform-support/spec.md) |
| `CLI_NON_ZERO_EXIT` | CLI exits non-zero with stderr | `details.exitCode` + `details.stderr` |
| `CLI_REPORTED_ERROR` | CLI emits in-band `Error:` on stdout + exit 0 | Captures source-not-found (F3), destination-collision (T0 vi), unknown-vault (F2 → 011-R5 inspection clause re-classifies), AND active-mode no-focused-note (F4 anticipated → T0 ix; capital-N `Error: No active file.` per inherited classifier mismatch — NOT `ERR_NO_ACTIVE_FILE`) |

**Note `ERR_NO_ACTIVE_FILE` is NOT in `move`'s error roster** per R9 / the inherited classifier mismatch (the native CLI emits capital-N which the dispatch-layer classifier doesn't recognise; the call falls through to `CLI_REPORTED_ERROR`). Documented per FR-014.

## Multi-vault notes

The CLI's `vault=` parameter routes the move into the named vault's instance. For `target_mode: "specific"` with an explicit `vault`, the call targets that vault unambiguously. Multi-vault setups where the basename is ambiguous (e.g., the agent passes `file: "Notes"` and both `VaultA` and `VaultB` have a `Notes.md` at root) are resolved by the CLI per its source-resolution rules (typically: the vault's focused notes hierarchy first, then a name-match fallback); the wrapper does NOT mediate this. Documented in `docs/tools/move.md` per FR-014.

## Strict-rich vs strict-naive client-class observability

Strict-rich clients (Claude Desktop, MCP Inspector) read the `additionalProperties: false` from the published `inputSchema` and either forward unknown keys (in which case the bridge-side `unrecognized_keys` rejection is observable to the test) or strip them client-side (in which case the bridge-side rejection is non-observable but the schema-side invariant — no untyped passthrough at runtime — still holds). Strict-naive clients (Cowork) do not consult `additionalProperties`; they forward unknown keys to the bridge, which always observes the rejection. Tests assume the strict-rich-forwarding path (the worst case) and assert the bridge-side rejection occurs.
