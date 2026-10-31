# Data Model: Fix Empty-Note Insertion

**Spec**: [spec.md](spec.md) | **Research**: [research.md](research.md)

No persisted entity changes. The feature works on four values the `prepend` handler holds during one call.

## Values

| Name | Type | Source | Meaning |
|---|---|---|---|
| `preCallSize` | integer bytes | `fs.stat` before the call (existing; ENOENT → 0) | The note's size before the call. |
| `before` | string or `null` | `fs.readFile(absPath, "utf8")` before the call, default mode only (new; inline or ENOENT → `null`) | The note's text before the call. |
| `postCallSize` | integer bytes | `fs.stat` after the call (existing) | The note's size after Obsidian's write. |
| `after` | string | `fs.readFile(absPath, "utf8")` after the call (new; only when the pre-filter matches) | The note's text after Obsidian's write. |

`w = content + "\n"` is the text Obsidian inserts in default mode (research F2).

## Predicate

`landedAtEmptyBody(before, content, after)`, pure, in `src/tools/prepend/empty-body.ts`:

1. `after === before + w`, and
2. `before` does not end with `root(w)`, where `root(w) = w.slice(0, (w + w).indexOf(w, 1))` is the primitive root of `w`.

True means Obsidian inserted at the very end of the note, so the note had no body, and the final byte of `after` is the LF that Obsidian added (research D2).

## Sequence (changed part of `executePrepend`)

```text
resolve target → file-type check → assertCanonicalPath           (unchanged)
stat → preCallSize                                                 (unchanged)
readFile → before        default mode only (inline → null);         (new)
                         ENOENT → null; other errno →
                         FS_WRITE_FAILED { errno, syscall: "open", path } (no reason; nothing written)
invokeCli prepend                                                  (unchanged)
stat → postCallSize; bytesWritten = post − pre                     (unchanged)
bytesWritten <= 0 → FS_WRITE_FAILED post-stat-byte-delta-zero      (unchanged)
if before !== null and bytesWritten === byteLength(content) + 1:   (new)
    readFile → after            failure: before === "" → FS_WRITE_FAILED extra-trailing-newline
                                         otherwise     → FS_WRITE_FAILED { errno, syscall: "open", path } (no reason)
    if landedAtEmptyBody(before, content, after):
        writeAtomic(before + content)   failure → FS_WRITE_FAILED extra-trailing-newline
        invalidateMetadataCache         never fails the call
        bytesWritten −= 1
return { path, vault, bytes_written: bytesWritten, inline }        (unchanged shape)
```

## Invariants

- **R1**: for a 0-byte note, the note afterwards equals `content` exactly, default or inline mode (FR-001, FR-003).
- **R2**: for a properties-only note, the note afterwards equals `before + content`, unless `before` ends with `root(w)` (research D2 limitation) (FR-002).
- **R3**: when R1 or R2 applies, `bytes_written === byteLength(content)` (FR-004).
- **R4**: when the predicate is false, nothing is written by the wrapper, and the note and `bytes_written` are exactly what they are today (FR-006).
- **R5**: the wrapper writes only `before + content`, and only when `after === before + w`; it never writes over text it has not just read (FR-007, last-write-wins).
- **R6**: a failed write, or a failed read of `after` when `before === ""`, raises `FS_WRITE_FAILED` with `details.reason: "extra-trailing-newline"`; it is never only logged (FR-007, Principle IV).
- **R9**: a failed read of `after` when `before` is non-empty raises `FS_WRITE_FAILED` `{ errno, syscall: "open", path }` with `cause` and no `reason`. Its message says the content landed, must not be re-sent, and could not be checked for an extra trailing line break (FR-009 (c), analyze I1 option B).
- **R7**: the output shape and every other error are unchanged, apart from R6 and R8 (FR-009).
- **R8**: a non-ENOENT failure of the pre-call read raises `FS_WRITE_FAILED` `{ errno, syscall: "open", path }` with `cause`, before the Obsidian call; nothing is written (FR-009 (b), Principle IV). Inline calls skip the pre-call read, because Obsidian's inline write is already exact (research F2), so their failure behaviour is unchanged (FR-009).
