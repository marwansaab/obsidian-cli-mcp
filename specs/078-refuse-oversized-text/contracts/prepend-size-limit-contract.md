# Contract: `prepend` content size limit

**Feature**: [../spec.md](../spec.md) | **Research**: [../research.md](../research.md) (D1–D3)

## §1 Limits on `content`

| Limit | Value | Unit | Checked | Error |
|---|---|---|---|---|
| Character limit (unchanged) | `MAX_CONTENT_LENGTH` = 3072 | UTF-16 code units (`String.length`) | input validation, before the handler | `CONTENT_TOO_LARGE`, no `reason` |
| Size limit (new) | `MAX_CONTENT_BYTES` = 3072 | UTF-8 bytes (`Buffer.byteLength(content, "utf8")`) | input validation, before the handler | `CONTENT_TOO_LARGE`, `reason: "bytes"` |

Both limits are inclusive: a value equal to the limit is accepted. Both are checked before target resolution, filesystem access and any Obsidian call, in `specific` and `active` mode, with and without `inline`. Text over both limits gets the character-limit error.

## §2 Errors

### Character limit (unchanged, byte-identical to today)

```json
{
  "code": "VALIDATION_ERROR",
  "message": "content exceeds maximum length of 3072 UTF-16 code units (got <contentLength>)",
  "details": { "code": "CONTENT_TOO_LARGE", "contentLength": <contentLength>, "maxLength": 3072 }
}
```

### Size limit (new)

```json
{
  "code": "VALIDATION_ERROR",
  "message": "content exceeds maximum size of 3072 UTF-8 bytes (got <contentBytes>)",
  "details": { "code": "CONTENT_TOO_LARGE", "reason": "bytes", "contentBytes": <contentBytes>, "maxBytes": 3072 }
}
```

`details` holds exactly these keys and no `issues` array. Returned as an `isError: true` tool result with text content only.

### Closed `reason` set for `(VALIDATION_ERROR, CONTENT_TOO_LARGE)` (ADR-015)

| `details.reason` | Sub-state | Fields |
|---|---|---|
| absent | character limit (origin sub-state) | `contentLength`, `maxLength` |
| `"bytes"` | size limit | `contentBytes`, `maxBytes` |

## §3 Examples

Unless stated otherwise: `target_mode: "specific"`, `vault: "TestVault"`, `path: "n.md"`, default mode. "Accepted" means input validation passes and the handler runs; the call's result then depends on the note, as today.

| # | `content` | Chars | Bytes | Result |
|---|---|---|---|---|
| B1 | 1,500 × `中` | 1,500 | 4,500 | size-limit error, `contentBytes: 4500` |
| B2 | B1 with `inline: true` | 1,500 | 4,500 | same as B1 |
| B3 | B1 with `target_mode: "active"` (no `vault`/`path`) | 1,500 | 4,500 | same as B1 |
| B4 | B1 against a note that does not exist | 1,500 | 4,500 | same as B1 (not `NOTE_NOT_FOUND`) |
| B5 | 3,073 × `a` | 3,073 | 3,073 | character-limit error, `contentLength: 3073` (unchanged) |
| B6 | 1,537 × `🚀` | 3,074 | 6,148 | character-limit error, `contentLength: 3074` (both limits broken) |
| B7 | 3,072 × `a` | 3,072 | 3,072 | accepted |
| B8 | 1,024 × `中` | 1,024 | 3,072 | accepted |
| B9 | 1,536 × `é` | 1,536 | 3,072 | accepted |
| B10 | 768 × `😀` | 1,536 | 3,072 | accepted |
| B11 | 3,071 × `a` + `é` | 3,072 | 3,073 | size-limit error, `contentBytes: 3073` |
| B12 | 769 × `😀` | 1,538 | 3,076 | size-limit error, `contentBytes: 3076` |
| B13 | lone `\uD800` + 3,070 × `a` | 3,071 | 3,073 | size-limit error, `contentBytes: 3073` |
| B14 | 3,000 × `a` + 24 × `中` | 3,024 | 3,072 | accepted |
| B15 | 3,070 × `a` + `\r\n` | 3,072 | 3,072 | accepted (a CRLF counts 2 bytes) |
| B16 | 1,023 × `中` + `\r\n` + `ab` | 1,027 | 3,073 | size-limit error, `contentBytes: 3073` |

For every refused example, no spawn is issued, no file is read, written or stat'ed, and the vault registry is not consulted.

## §4 Unchanged

- Empty content (`CONTENT_EMPTY` / `too_small`), every other validation failure (generic `details.issues[]`), and every handler failure.
- Success results for accepted content: placement, the `{ path, vault, bytes_written, inline }` envelope and `bytes_written`.
- The post-call `post-stat-byte-delta-zero` guard (spec FR-011).
- `inputSchema.properties.content.maxLength` stays 3072. No JSON Schema keyword expresses a byte limit, so the size limit is stated in the parameter description.

## §5 Published surface

| Item | Change |
|---|---|
| Tool name, title, annotations, output schema | none |
| `inputSchema` | `content.description` only (states both limits); fingerprint moves |
| `description` (`PREPEND_DESCRIPTION`) | `write_note` hint and Content paragraph state both limits; fingerprint moves |
| `_register-baseline.json` | prepend's `descriptionFingerprint` and `schemaFingerprint` regenerated; no other entry moves |
| Top-level error codes, `details.code` values | none new |
| `details.reason` values | `"bytes"` added under `(VALIDATION_ERROR, CONTENT_TOO_LARGE)` |
