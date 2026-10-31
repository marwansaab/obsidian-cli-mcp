# Data Model: Return Exact Content

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

There is no persistent data. This page records the values the read handler works with and the rule that links them.

## Values

| Value | Where it comes from | Meaning |
|---|---|---|
| `relPath` | `resolveFileTarget`: `path` as given, `file` via the TSV resolver, active via the focused-file eval | The vault-relative path of the file being read. Unchanged by this feature. |
| `stdout` | `obsidian read` through `invokeCli` | The CLI's text for the file. As probed (research F2): the note decoded as UTF-8, with one leading byte-order mark removed, and a line feed added when the remaining text is not empty and does not end with one. |
| `vaultRoot` | active: the focused-file eval's `base` (new optional `FileTarget.vaultRoot`); specific: `vaultRegistry.resolveVaultPath(vault)` after the CLI read | The vault's absolute folder. |
| `bytes` | `fs.readFile(join(vaultRoot, relPath))` after the CLI read | The note's bytes on disk. Only two facts are taken from them. |
| `bom` | `bytes` starts with `EF BB BF` | The note starts with a byte-order mark. |
| `finalLf` | the last byte of `bytes` is `0A` | The note really ends with a line feed. |
| `content` | the rule below | The result: the note's exact text. |

## Rule (research D1)

```text
content = stdout
if content ends with "\n" and not finalLf  → drop that one final "\n"
if bom                                     → prepend "﻿"
```

Invariants:

- **R1**: `content` is built only from `stdout` plus at most one restored `﻿`. Disk bytes are never copied into the result.
- **R2**: when the note ends with one or more line breaks, `content` ends with exactly those line breaks (`finalLf` is true, so nothing is dropped).
- **R3**: an empty note gives `""`. The CLI prints nothing, and `bom` is false.
- **R4**: a note that is only a byte-order mark gives `"﻿"`.
- **R5**: the disk read happens only after a successful CLI read. Every failure the CLI raises comes first and is unchanged.

## Sequence

```text
resolveFileTarget ─▶ assertSupportedFileType ─▶ invokeCli("read")   (all unchanged)
        │                                              │
        └── vaultRoot (active) ──┐                     ▼
     vaultRegistry (specific) ───┴─▶ fs.readFile ─▶ rule ─▶ { content }
                                        │
                                        └─ failure ─▶ FS_WRITE_FAILED { reason: "read", errno, syscall?, path }
```

## Result shape

Unchanged: `{ content: string }`. Only the text changes, and only for notes that do not end with a line feed or that start with a byte-order mark.
