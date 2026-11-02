# Data Model: Classify Missing Destination

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

`move` has no stored data. The entities below are the values one call passes through and the shapes of the failures it returns.

## E1 — Move request (unchanged)

`MoveInput` (`src/tools/move/schema.ts`, `z.infer` of `moveInputSchema`): `target_mode`, `vault?`, `file?` / `path?`, `to`. No field is added and the schema is unchanged.

## E2 — Resolved move (per call, in memory)

| Field | Source | Notes |
|-------|--------|-------|
| `target.relPath` | `resolveFileTarget` | Vault-relative source. |
| `target.vault` | `resolveFileTarget` | The display name in specific mode; `undefined` in active mode. |
| `target.vaultRoot` | `resolveFileTarget` | Active mode only: the vault's absolute folder from the focused-file eval. |
| `resolvedTo` | `resolveTo(input.to, target.relPath)` | The full vault-relative destination for every locator (research F6). |
| `forwardedTo` | unchanged rule | What is sent as `to=` (item 32(d)). |

## E3 — Destination folder (derived)

`destinationFolder(resolvedTo)` is `resolvedTo` with `\` turned into `/`, then the part before the last `/`, or `""` when there is no `/` (the vault root). Case is preserved (research D3).

| `input.to` | Source | `resolvedTo` | Destination folder |
|------------|--------|--------------|--------------------|
| `Archive/2026/` | `Inbox/Note.md` | `Archive/2026/Note.md` | `Archive/2026` |
| `Archive/2026/Old.md` | `Inbox/Note.md` | `Archive/2026/Old.md` | `Archive/2026` |
| `A/B/C/` | `Inbox/Note.md` | `A/B/C/Note.md` | `A/B/C` |
| `Archive\2026\Old.md` | `Inbox/Note.md` | `Archive\2026\Old.md` (forwarded as given) | `Archive/2026` |
| `Archive/Roadmap` | `Boards/Plan.canvas` | `Archive/Roadmap.canvas` | `Archive` |
| `Renamed.md` | `Inbox/Note.md` | `Renamed.md` | `""` (the root, never reported missing) |

## E4 — Move failure (the agent-visible result)

The wire shape is unchanged: `{ code, message, details }` in an `isError: true` text block (`asToolError`, `_shared.ts`). `cause` never reaches the wire.

### E4a — Destination folder not found (new)

```json
{
  "code": "CLI_REPORTED_ERROR",
  "message": "move: the destination folder \"Archive/2026\" does not exist in the vault. Nothing was moved. Create the folder (writing a note into it with write_note creates it), then retry the move.",
  "details": { "code": "FOLDER_NOT_FOUND", "folder": "Archive/2026" }
}
```

- `details` has exactly these two keys, with no `reason` (ADR-015: one sub-state) and no raw CLI text.
- `cause` is `null`.

### E4b — Every other move-step failure (code and wording unchanged; vault root rewritten)

The failure's own `code`, `message` and `details` are kept, with every vault-root occurrence rewritten (E5). Today's failures that carry no root come back as the same object:

| Failure | `code` | Distinguishing signal | Changed by this feature? |
|---------|--------|-----------------------|--------------------------|
| Source not found | `CLI_REPORTED_ERROR` | no `details.code`; `details.message` `Error: File "<path>" not found.` | No |
| Destination file exists | `CLI_REPORTED_ERROR` | no `details.code`; `details.message` `Error: Destination file already exists!` | No |
| Unknown vault | `CLI_REPORTED_ERROR` | no `details.code`; `details.message` `Vault not found.` | No |
| Unparseable success | `CLI_REPORTED_ERROR` | `details.stage: "parse"` | Only a vault root inside `details.stdout` |
| Other fs failure (EPERM, EBUSY, EXDEV, …) | `CLI_REPORTED_ERROR` | no `details.code` | Vault root rewritten |
| Non-zero exit / timeout / output cap | `CLI_NON_ZERO_EXIT` / `CLI_TIMEOUT` / `CLI_OUTPUT_TOO_LARGE` | their existing details | Vault root rewritten |
| Binary missing | `CLI_BINARY_NOT_FOUND` | install diagnostics | No (Clarification Q1) |
| Type change | `VALIDATION_ERROR` + `UNSUPPORTED_FILE_TYPE` | raised before the CLI call | No |

### E4c — Withheld move failure (new; specific mode, when the vault root cannot be looked up)

This applies when an E4b failure needs the registry lookup (R-a) and the lookup throws anything other than the registry's not-registered `VALIDATION_ERROR`, for example a cold-cache `vaults` probe that times out:

```json
{
  "code": "<the move failure's own code>",
  "message": "move: moving \"Inbox/Note.md\" to \"Archive/Note.md\" failed with <move code>, and the vault's folder could not be looked up (<lookup code>), so the command-line output is withheld to keep absolute paths out of this error. Retry the move.",
  "details": { "source": "Inbox/Note.md", "destination": "Archive/Note.md" }
}
```

- `source` is `target.relPath` and `destination` is `resolvedTo`, both vault-relative.
- The raw `stdout`, `stderr`, `message` and every other original detail are dropped.
- `cause` is the lookup failure. `<lookup code>` is its `code` when it is an `UpstreamError`, otherwise `unknown`.
- There is no `details.code` and no `details.reason`.

## E5 — Vault-root rewrite (rules)

- **R-a**: the root is `target.vaultRoot` (active mode) or `vaultRegistry.resolveVaultPath(target.vault)` (specific mode), looked up only after a move-step failure that is not E4a, `CLI_BINARY_NOT_FOUND` or a cancellation.
- **R-b**: trailing separators are trimmed from the root. Each separator in the root matches `\` or `/`, and matching ignores case.
- **R-c**: `<root>` followed by a separator becomes `""`. A `<root>` not followed by a separator becomes `.`. Matching stops at a path-segment boundary, so a sibling folder that shares the root's prefix (`<root>shop\…`) is not rewritten.
- **R-d**: the rewrite applies to `message` and, recursively, to every string in `details` (inside arrays and plain records). Numbers, booleans and `null` are untouched.
- **R-e**: when no occurrence was found, the original error object is rethrown. Otherwise a new `UpstreamError` is built with the same `code` and `cause` and the rewritten `message` and `details`.
- **R-f**: when the specific-mode lookup throws the registry's not-registered `VALIDATION_ERROR`, the original error is rethrown untouched. When it throws anything else, the withheld failure E4c is thrown, with the lookup failure as `cause` (research D5, amended at analyze U1).

## Invariants

- **V1**: an ENOENT-rename failure with a non-root destination folder always yields E4a, in every mode and for every file type (FR-001, FR-002, FR-009).
- **V2**: no E4 payload contains the vault's absolute folder, in any separator or case form, for any failure in E4a–E4c except `CLI_BINARY_NOT_FOUND` (FR-005, Clarification Q1). That includes when the vault root cannot be looked up (E4c). There is no recorded residual.
- **V3**: E4a carries `details.code`; the missing-source failure carries none (FR-006).
- **V4**: a successful move makes exactly the spawns it makes today and never consults the registry (FR-012).
- **V5**: E4a and the source-not-found, destination-exists and unknown-vault failures need no vault lookup.
- **V6**: no new top-level code and no new `details.code` value (FR-008).

## Per-call flow

```text
executeMove(input, deps)
  target      = resolveFileTarget(input, deps, "move")        # unchanged; failures propagate unchanged
  resolvedTo  = resolveTo(input.to, target.relPath)            # unchanged; UNSUPPORTED_FILE_TYPE propagates
  try
    stdout    = invokeCli(move …, deps)                        # unchanged argv
    return parseMoveResponse(stdout, …)                        # unchanged
  catch e
    if e is not UpstreamError, or e.code is CLI_BINARY_NOT_FOUND → rethrow e
    folder = destinationFolder(resolvedTo)
    if e.code is CLI_REPORTED_ERROR and details.message is an ENOENT rename and folder ≠ ""
      → throw E4a(folder)                                      # no lookup
    root = target.vaultRoot ?? await registry lookup
           on lookup throw: not-registered VALIDATION_ERROR → rethrow e
                            anything else → throw withheld(e.code, relPath, resolvedTo, cause: lookup error)  # E4c
    throw rewriteVaultRoot(e, root)                            # same object when unchanged
```
