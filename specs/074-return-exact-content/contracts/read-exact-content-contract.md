# Contract: `read` returns the file's exact content

**Feature**: [../spec.md](../spec.md) | **Research**: [../research.md](../research.md) | **Data model**: [../data-model.md](../data-model.md)

## §1 Input

Unchanged. The same `target_mode` union, `vault`, `file` and `path` fields, constraints and validation errors. The published input schema fingerprint does not move.

## §2 Result

Unchanged shape: `{ content: string }`. New guarantee: `content` is the file's exact text, with nothing added and nothing removed.

| On disk (bytes) | `content` today | `content` after |
|---|---|---|
| `first` | `"first\n"` | `"first"` |
| `first␊` | `"first\n"` | `"first\n"` |
| `a␍␊b␍␊` | `"a\r\nb\r\n"` | `"a\r\nb\r\n"` |
| `a␍␊b` | `"a\r\nb\n"` | `"a\r\nb"` |
| `a␍` | `"a\r\n"` | `"a\r"` |
| `a␊␊` | `"a\n\n"` | `"a\n\n"` |
| `␊` | `"\n"` | `"\n"` |
| (empty) | `""` | `""` |
| `BOM a` | `"a\n"` | `"﻿a"` |
| `BOM a␊` | `"a\n"` | `"﻿a\n"` |
| `BOM` | `""` | `"﻿"` |
| `BOM BOM a` | `"﻿a\n"` | `"﻿﻿a"` |
| `a BOM b` | `"a﻿b\n"` | `"a﻿b"` |

These rows hold for notes, canvases and bases, and for `file`, `path` and active mode alike.

## §3 Errors

Every existing error is unchanged and raised at the same point, before any disk read:

- `VALIDATION_ERROR`, including `UNSUPPORTED_FILE_TYPE`;
- `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR` (closed-vault unavailable included) and `ERR_NO_ACTIVE_FILE`;
- `CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT` and `CLI_OUTPUT_TOO_LARGE`;
- cancellation.

New, and only after a successful CLI read. This is the one new failure spec FR-008 and SC-005 allow:

| Code | When | `details` | Recovery |
|---|---|---|---|
| `FS_WRITE_FAILED` | The file's bytes could not be read from disk to confirm its first and last characters (for example, it was deleted or locked between the CLI read and the check, or the server cannot read the vault folder). | `{ reason: "read", errno, syscall?, path }` (`path` is vault-relative) | Retry. If it persists, check the server's access to the vault folder. The shape is `find_and_replace`'s read-side `FS_WRITE_FAILED`. |

A vault-registry lookup failure in specific mode propagates unchanged. It can only happen if the vault disappeared between the two steps.

## §4 Published description

`READ_DESCRIPTION` changes from "Returns the file's raw UTF-8 text as { content: <stdout> }." to wording stating that the result is the file's exact text: nothing added or removed, line breaks and any byte-order mark kept. The rest of the description (active mode, supported types, the attachment rejection, `open_file`) is unchanged.

## §5 Fingerprint baseline

Only `read`'s description fingerprint moves. Its input schema and annotations do not, nor does anything on any other tool. Regenerate with `npm run baseline:write`, and check that the diff touches only `read`'s description entry.
