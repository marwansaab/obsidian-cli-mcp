# Data Model: Unify Size Reporting

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

## Values

| Name | Type | Meaning |
|------|------|---------|
| `before` | integer ≥ 0 | The note's size in bytes as the tool observed it immediately before writing; 0 when the note did not exist. |
| `after` | integer ≥ 0 | The size in bytes of the content the tool wrote (or, for prepend, the size `stat` reports after the CLI call). |
| `bytes_written` | integer | `after − before`. Published in the result of all five writers. |

## Where `before` and `after` come from

| Tool | `before` | `after` | Bound on `bytes_written` |
|------|----------|---------|-----------------------------|
| `append_note` | `byteLength(existingContent)` (unchanged) | `byteLength(newContent)` (unchanged) | ≥ 1 (unchanged) |
| `prepend` | `stat` before the CLI call; 0 on ENOENT (unchanged) | `stat` after the CLI call (unchanged) | ≥ 1; ≤ 0 raises `FS_WRITE_FAILED` `post-stat-byte-delta-zero` (unchanged) |
| `patch_heading` | `byteLength(originalContent)`, the content the edit was derived from | `byteLength(editedContent)` | none (was ≥ 0) |
| `patch_block` | `byteLength(originalContent)` | `byteLength(editedContent)` | none (was ≥ 0) |
| `write_note`, `overwrite: false` | 0 (the `wx` write proves the note did not exist) | `byteLength(input.content)` | none |
| `write_note`, `overwrite: true` | `stat(absPath).size`; 0 on ENOENT | `byteLength(input.content)` | none |

All `byteLength` calls use UTF-8 (`Buffer.byteLength(s, "utf8")`).

## Invariants

- **R1, one meaning**: for every successful call of every writer, `bytes_written === after − before`. No writer reports a total.
- **R2, sign follows the edit**: positive when the note grew, 0 when its size did not change, negative when it shrank. The value is never clamped.
- **R3, adders unchanged**: append_note's and prepend's values and failure guards are byte-for-byte what they are today.
- **R4, no figure without a measurement**: if write_note cannot `stat` an existing note (any errno except ENOENT), the call fails with `FS_WRITE_FAILED { errno, syscall, path }` before `writeFile` or `rename` runs. There is no result, no guessed value and no new code.
- **R5, the figure describes this write**: changes made by other programs between the measurement of `before` and the write are outside the figure. This includes patch_heading's tolerated race, where the heading identity is unchanged but other bytes changed and last-write-wins applies.
- **R6, one description**: the published description of `bytes_written` is the single `BYTES_WRITTEN_DESCRIPTION` string on all five tools.

## write_note sequence (overwrite: true)

```text
resolve vault / focused file → assertSupportedFileType → assertCanonicalPath → mkdir(parent)
  → stat(absPath)
      ENOENT        → created = true,  before = 0
      other errno   → throw FS_WRITE_FAILED { errno, syscall: "stat", path }   (nothing written)
      ok            → created = false, before = size
  → writeAtomic(content)            (failure → FS_WRITE_FAILED, unchanged)
  → invalidateMetadataCache → (open)
  → { created, path, bytes_written: byteLength(content) − before }
```

With `overwrite: false` the sequence is unchanged up to the `wx` write, and the result adds `bytes_written: byteLength(content)`.
