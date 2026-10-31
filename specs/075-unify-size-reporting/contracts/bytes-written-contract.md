# Contract: `bytes_written` across the five single-note text writers

**Feature**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

## §1 Inputs

Unchanged for all five tools: `append_note`, `prepend`, `patch_heading`, `patch_block` and `write_note`. No parameter is added, removed, renamed or re-described.

## §2 Published output schema

Every `bytes_written` field carries the description `BYTES_WRITTEN_DESCRIPTION` (§4).

| Tool | Before | After |
|------|--------|-------|
| `append_note` | `bytes_written: integer ≥ 1` | `bytes_written: integer ≥ 1`, described |
| `prepend` | `bytes_written: integer ≥ 1` | `bytes_written: integer ≥ 1`, described |
| `patch_heading` | `bytes_written: integer ≥ 0` (total size) | `bytes_written: integer` (delta), described |
| `patch_block` | `bytes_written: integer ≥ 0` (total size) | `bytes_written: integer` (delta), described |
| `write_note` | `{ created, path }` | `{ created, path, bytes_written: integer }` (delta), described; still strict |

Every other result field is unchanged. `structuredContent` and the text block carry the identical JSON, as today.

## §3 Examples

Sizes are in bytes. Every row is an acceptance case for the handler tests. The patch_heading and patch_block sizes are illustrative: tests compute the expected value from the fixture's actual content before and after the edit (data-model R1), because the editors can add separator lines.

| Tool | Note before | Call | Note after | `bytes_written` |
|------|-------------|------|------------|-----------------|
| `append_note` | `"a\n"` (2) | `content: "b\n"` | `"a\nb\n"` (4) | 2 (unchanged) |
| `append_note` | `"a"` (1) | `content: "b"` | `"a\nb"` (3) | 2, including the separator (unchanged) |
| `prepend` | 100 | add 58 bytes | 158 | 58 (unchanged) |
| `patch_heading` | 200 | `append` 10 bytes into a section | 210 | 10 (was 210) |
| `patch_heading` | 200 | `replace` a 12-byte body with 12 bytes | 200 | 0 (was 200) |
| `patch_heading` | 200 | `replace` a 30-byte body with `""` | 170 | −30 (was 170) |
| `patch_heading` | 200 | `replace` a body `x` (1 character, 1 byte) with `é` (1 character, 2 bytes) | 201 | 1: bytes, not characters; the character change is 0 (was 201) |
| `patch_block` | 120 | replace a 5-byte body with 9 bytes | 124 | 4 (was 124) |
| `patch_block` | 120 | replace a 9-byte body with 9 bytes | 120 | 0 (was 120) |
| `patch_block` | 120 | replace a 9-byte body with 2 bytes | 113 | −7 (was 113) |
| `patch_block` | 120 | replace a body `abc` (3 characters, 3 bytes) with `日本` (2 characters, 6 bytes) | 123 | 3: bytes, not characters; the character change is −1 (was 123) |
| `write_note` | absent | create `"hello"` | 5 | 5 (new) |
| `write_note` | absent | create `""` | 0 | 0 (new) |
| `write_note` | absent | create `"é"` | 2 | 2: bytes, not characters (new) |
| `write_note` | 40 | overwrite with 55 bytes | 55 | 15 (new) |
| `write_note` | 40 | overwrite with 40 bytes | 40 | 0 (new) |
| `write_note` | 40 | overwrite with 10 bytes | 10 | −30 (new) |

## §4 Description text

```text
Change in the note's size in bytes caused by this write: its size after the write minus its size before, counting a note that did not exist as 0. Zero when the size did not change; negative when the note shrank.
```

It is exported once as `BYTES_WRITTEN_DESCRIPTION` from `src/tools/_shared.ts` and used verbatim by all five output schemas. The reference pages use the same sentence.

## §5 Errors

- **No new code, sub-code or details key.**
- **write_note, overwrite branch**: the pre-write probe is now `stat` instead of `realpath`. A non-ENOENT failure raises the existing `FS_WRITE_FAILED` with `details: { errno, syscall, path }` (`syscall: "stat"`) before anything is written. This is the case FR-006a describes.
- **prepend's `post-stat-byte-delta-zero` guard**: unchanged.
- **Every other failure** of the five tools: unchanged in code, shape and the point at which it is raised.

## §6 Fingerprint baseline

`outputSchemaFingerprint` changes for exactly these five tools: `append_note`, `prepend`, `patch_heading`, `patch_block` and `write_note`. `descriptionFingerprint`, `schemaFingerprint` (input), `titleFingerprint` and `annotationsFingerprint` are unchanged for every tool. Regenerate the baseline in the same PR and review the diff.
