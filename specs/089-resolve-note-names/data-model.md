# Data Model: Resolve Note Names

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

No stored data and no schema change. This feature changes which note a `file` locator addresses, so the entities below describe one call's locator flow.

## E1: Locator input

These fields are the `target_mode` locator fields of `patch_heading` and `patch_block` (`FileTargetInput` in `src/tools/_file-target.ts`). The editors' schemas do not change (FR-009).

| Field | Rule (unchanged) | Meaning after this feature |
|---|---|---|
| `target_mode` | `"specific"` or `"active"` | unchanged |
| `vault` | required in specific mode, forbidden in active mode | unchanged |
| `file` | XOR with `path`, specific mode only, `safePathField` | **A note name, resolved the way Obsidian resolves a wikilink**, through `obsidian file file=<name>`. A bare name, a name with a folder, or a name with `.md` are all sent as given (research F10, P6–P8). |
| `path` | XOR with `file`, specific mode only, `safePathField` | unchanged: the vault-relative path, used as given with no CLI call |

## E2: Resolved target

This is the `ActiveLocatorWithVault` value `resolveFsTarget` returns.

| Field | Source |
|---|---|
| `vaultRoot` | specific mode: `vaultRegistry.resolveVaultPath(vault)`, resolved **before** any spawn. Active mode: the focused-file eval's `base`. |
| `relPath` | `path` as given; or the `path\t` line of the `obsidian file` TSV, trimmed (a `file` name); or the focused file's path (active mode) |
| `vaultDisplayName` | specific mode: `vault`. Active mode: the registry's reverse lookup (unchanged). |

## E3: Outcome

The result is the editor's existing output envelope. The only change is that `path` is `E2.relPath`, so a name-based call reports the resolved note's path, not the name (FR-005). For `path` and active mode the value is the same as today.

## Invariants

- **V1** (FR-001, FR-004): a `file` name resolves through the same `obsidian file` call `append_note` and `prepend` use. The note it picks is the note `read` picks for the same name (research F11, F12).
- **V2** (FR-002): resolution finishes before any `fs` call. The canonical-path check, the read, the heading or block lookup, the write and the metadata refresh all use `E2.relPath` and nothing else.
- **V3** (FR-003): an unmatched name rejects with the resolver's `CLI_REPORTED_ERROR` unchanged. `details.message` is `Error: File "<name>" not found.`, and there is no `details.code`. No `fs` call is made and nothing is written.
- **V4** (FR-006): no new top-level code, no new sub-code and no new mapping. A TSV answer with no `path\t` line rejects with `details.stage: "file-tsv-parse"`, the existing failure.
- **V5** (FR-007): `path` and active mode make the same spawns, `fs` calls, results and errors as today.
- **V6** (FR-008): the containment check (`PATH_ESCAPES_VAULT`) and the heading or block lookup run on `E2.relPath`. No file-type check exists or is added (research D2).
- **V7** (FR-011): neither editor keeps a private locator resolver; both call `resolveFsTarget`.

## Per-call flow (specific mode, `file`)

```text
input ─▶ resolveFsTarget
          ├─ vaultRegistry.resolveVaultPath(vault)      ── unknown vault ─▶ registry error (0 spawns)
          └─ resolveFileByTsv: obsidian file file=<name> ── "Error: File … not found." ─▶ CLI_REPORTED_ERROR (1 spawn, 0 fs)
                                                          ── no path line ─▶ CLI_REPORTED_ERROR stage file-tsv-parse
             ▼ relPath (resolved)
       assertCanonicalPath(vaultRoot, relPath) ─▶ PATH_ESCAPES_VAULT
       fs.readFile ─▶ (unchanged per-tool ENOENT / fs error mapping)
       heading walk / block scan ─▶ HEADING_NOT_FOUND / BLOCK_NOT_FOUND … (message names relPath)
       placeEdit ─▶ writeAtomic ─▶ invalidateMetadataCache(vault, relPath)
       ▼
       { path: relPath, vault, … }
```
