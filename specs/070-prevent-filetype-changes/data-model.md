# Data Model: Prevent File Type Changes

**Feature**: `070-prevent-filetype-changes` · No persisted data. The entities below are in-process values; none crosses the MCP boundary except the rejection envelope (see [contracts/errors.md](contracts/errors.md)).

---

## FileCategory

The four core file categories (spec Key Entities: Core file type).

| Value | Extensions (matched case-insensitively) |
|-------|------------------------------------------|
| `note` | `md` |
| `canvas` | `canvas` |
| `base` | `base` |
| `attachment` | images `avif bmp gif jpeg jpg png svg webp`; audio `flac m4a mp3 ogg wav webm 3gp`; video `mkv mov mp4 ogv`; `pdf` |

Any other extension, or none, classifies as `null` (not a core type). The table lives once, in `src/file-type/file-type.ts` (research D1, D8). T0 gate P3 cross-checks it against the running Obsidian version.

**Derivations** (pure functions):

- `extensionOf(path)` → the substring after the last `.` in the final `/`-separated segment, original case; `""` if the segment has no `.` (a leading-dot-only name such as `.hidden` has extension `hidden`; Obsidian does not index dotfiles, so no tool resolves one through `file` or `active`, and this case is reachable only through an explicit `path`).
- `categoryOf(ext)` → `FileCategory | null`, lower-casing `ext` before lookup.

## SupportDeclaration

Per tool (spec Key Entities: Supported-type declaration): a `readonly FileCategory[]` exported from the tool's own module, plus a flag for "any file, including non-core extensions" used by `rename`, `move`, `delete`, `open_file`. The handler check and the description sentence both read it (research D2, D6). Values: [contracts/tool-support.md](contracts/tool-support.md).

## ResolvedTarget

What the check runs on (research D3): `{ relPath: string, vault?: string }` — the vault-relative path of the file the tool will act on, and (for the CLI-pass-through tools in `active` mode) the resolved vault display name used to forward `path=`. In `file` mode those tools forward the original `file=` locator after the check; only `active` mode forwards the resolved `path=`.

| Locator | How `relPath` is obtained | Extra CLI calls |
|---------|---------------------------|-----------------|
| `path` | the input string | 0 |
| `file` (append_note, prepend) | `resolveFileByTsv` — already performed today | 0 |
| `file` (write_note) | the canonicalised write path (short form appends `.md`); a recognised non-note trailing extension on the `file` string is rejected first | 0 |
| `file` (read, rename, move, outline) | `resolveFileByTsv` (new call) | 1 |
| `active` (write tools) | `resolveActiveFocusedFile` / `resolveActiveLocatorWithVault` — already performed today | 0 |
| `active` (read, rename, move, outline) | `resolveActiveFocusedFile` (new call) + `resolveVaultDisplayName` | 1 |

Resolution failures (not found, no active file) surface their existing errors before any type check (research D9).

## DestinationNameRule (rename, move)

Inputs: resolved source `relPath`; destination file name (rename `name`; move final segment of `to` when `to` does not end in `/`). Output: the forwarded destination, or a `type-change` rejection (research D5).

```
srcExt = extensionOf(source); dstExt = extensionOf(destination)
if categoryOf(dstExt) != null and lower(dstExt) != lower(srcExt)  → reject type-change
elif source is a note  and destination endsWith ".md" (byte-exact)  → forward verbatim
elif source not a note and lower(dstExt) == lower(srcExt) and srcExt != "" → forward verbatim
elif srcExt == ""                                                     → forward verbatim
else                                                                  → forward destination + "." + srcExt
```

Move with `to` ending in `/` → `to + basename(source)` (unchanged).

Worked rows (all must appear in handler tests):

| Source | Destination input | Forwarded | Why |
|--------|-------------------|-----------|-----|
| `Inbox/Note.md` | `Renamed` | `Renamed.md` | append (unchanged) |
| `Inbox/Note.md` | `Renamed.md` | `Renamed.md` | verbatim (unchanged) |
| `Inbox/Note.md` | `Renamed.MD` | `Renamed.MD.md` | Markdown keeps byte-exact check (unchanged, FR-012) |
| `Inbox/Note.md` | `Doc.v1.draft` | `Doc.v1.draft.md` | unrecognised segment is stem (unchanged) |
| `Inbox/Note.md` | `Sketch.canvas` | — | reject `type-change` (was `Sketch.canvas.md`) |
| `Boards/Plan.canvas` | `Roadmap` | `Roadmap.canvas` | append source extension (was `Roadmap.md` on rename) |
| `Boards/Plan.canvas` | `Roadmap.canvas` | `Roadmap.canvas` | verbatim, no doubling |
| `Boards/Plan.canvas` | `Plan.md` | — | reject `type-change` |
| `Boards/Plan.canvas` | `Plan.v2` | `Plan.v2.canvas` | unrecognised segment is stem |
| `Views/Tasks.base` | `Open Tasks` | `Open Tasks.base` | append |
| `Att/Photo.PNG` | `New` | `New.PNG` | append in source spelling |
| `Att/Photo.PNG` | `New.png` | `New.png` | same type, case-only difference |
| `Att/Photo.png` | `New.jpg` | — | reject `type-change` (different recognised extension) |
| `Misc/README` | `Readme2` | `Readme2` | source has no extension |
| `Misc/todo.txt` | `done` | `done.txt` | non-core source extension kept |

## Rejection

The `UpstreamError` thrown on an unsupported type or a type change (spec Key Entities: Unsupported-file-type error). Shape and messages: [contracts/errors.md](contracts/errors.md).
