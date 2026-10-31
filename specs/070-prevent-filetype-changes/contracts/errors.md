# Contract: Errors

**Feature**: `070-prevent-filetype-changes` · Zero new top-level codes (Principle IV; Clarifications Q2). One new `(code, details.code)` pair with two `details.reason` values (ADR-015). Decisions: [research.md](../research.md) D4, D7, D9.

## New

| Top-level `code` | `details.code` | `details.reason` | Raised by | When |
|------------------|----------------|------------------|-----------|------|
| `VALIDATION_ERROR` | `UNSUPPORTED_FILE_TYPE` | `unsupported-type` | `read`, `write_note`, `append_note`, `prepend`, `outline` | the resolved target's category is not in the tool's declaration |
| `VALIDATION_ERROR` | `UNSUPPORTED_FILE_TYPE` | `type-change` | `rename`, `move` | the destination names a recognised core extension different from the source's |

### `details` fields

| Field | Type | Always | Meaning |
|-------|------|--------|---------|
| `code` | `"UNSUPPORTED_FILE_TYPE"` | yes | discriminator |
| `reason` | `"unsupported-type" \| "type-change"` | yes | sub-state (closed enum) |
| `path` | string | yes | resolved vault-relative path of the source file |
| `extension` | string | yes | the source's extension, original case, `""` if none |
| `supported` | string[] | yes | the tool's declared categories (`"note" \| "canvas" \| "base" \| "attachment"`); rename/move send all four |
| `destination` | string | `type-change` only | the destination name or path as given |
| `destinationExtension` | string | `type-change` only | the destination's extension |
| `alternative` | string | when one exists | tool to use instead: `obsidian_exec` for `type-change`; `open_file` for `read` on an attachment |

### Example envelopes

```json
{ "code": "VALIDATION_ERROR",
  "message": "read: Att/photo.png is an attachment (.png); read supports notes, canvases and bases. Nothing was changed. Use open_file for this file instead.",
  "details": { "code": "UNSUPPORTED_FILE_TYPE", "reason": "unsupported-type", "path": "Att/photo.png",
               "extension": "png", "supported": ["note", "canvas", "base"], "alternative": "open_file" } }
```

```json
{ "code": "VALIDATION_ERROR",
  "message": "rename: Boards/Plan.canvas is a canvas; the new name \"Plan.md\" would make it a note. rename and move keep a file's type. Nothing was changed. Omit the extension to keep it a canvas, or use obsidian_exec to change the type deliberately.",
  "details": { "code": "UNSUPPORTED_FILE_TYPE", "reason": "type-change", "path": "Boards/Plan.canvas",
               "extension": "canvas", "supported": ["note", "canvas", "base", "attachment"],
               "destination": "Plan.md", "destinationExtension": "md", "alternative": "obsidian_exec" } }
```

Messages state the received type, the accepted types, that nothing changed, and the alternative (FR-008, SC-004). The wording is built in `src/file-type/file-type.ts`: `assertSupportedFileType` produces `<tool>: <path> is <a canvas (.canvas) | an attachment (.png) | a ".txt" file | a file with no extension>; <tool> supports <list>. Nothing was changed.` plus ` Use <alternative> for this file instead.` when an alternative exists; `typeChangeError` produces the second example (`the new name` for rename, `the destination` for move). Tests assert the `details` fields, the full message for one case of each reason, and that the message contains the path, the received type and each accepted category.

## Precedence (research D9)

1. Schema validation (`VALIDATION_ERROR` from zod, unchanged).
2. Locator resolution failures, unchanged: `ERR_NO_ACTIVE_FILE`; `CLI_REPORTED_ERROR` from the `file` subcommand (`details.stage: "file-tsv-parse"` or the CLI's not-found reply); `VAULT_NOT_FOUND` remaps.
3. `UNSUPPORTED_FILE_TYPE` (this feature).
4. Everything the tool raised before this feature (CLI errors, filesystem errors, `FILE_EXISTS`, …), unchanged.

For `path` locators step 2 does not run, so a non-existent `photo.png` passed to `read` reports `UNSUPPORTED_FILE_TYPE`.

## Unchanged (FR-007a, research D7)

| Tool | Emission kept as is |
|------|---------------------|
| `links`, `backlinks`, `smart_connections_similar` | `CLI_REPORTED_ERROR` + `details.code: "NOT_MARKDOWN"` |
| `open_file` | `CLI_REPORTED_ERROR` + `details.code: "UNSUPPORTED_FILE_TYPE"` (Obsidian has no view for the extension) |
| `find_and_replace` | `VALIDATION_ERROR` + `details.code: "INVALID_NOTE"`, `reason: "not-eligible"` |
| `views_base`, `query_base`, `create_base` | `INVALID_BASE_PATH` / `wrong-extension` validation issue |

Note: `open_file`'s `UNSUPPORTED_FILE_TYPE` lives under `CLI_REPORTED_ERROR` and means "Obsidian cannot display this"; the new one lives under `VALIDATION_ERROR` and means "this tool does not handle this type". Agents distinguish them by the top-level `code`. Both docs pages say so.
