# Contract: `prepend` on Notes Without a Body

**Spec**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

## §1 Inputs

Unchanged. `prependInputSchema` (`src/tools/prepend/schema.ts`) is not edited.

## §2 Output

Unchanged shape: `{ path, vault, bytes_written, inline }` (`prependOutputSchema`, `bytes_written` int ≥ 1). Only the value of `bytes_written` changes, and only for notes without a body.

## §3 Examples

LF shown as `\n`. "Today" is the observed behaviour from research F2.

| # | Note before | `content` | `inline` | Today: note after / `bytes_written` | After this change: note after / `bytes_written` |
|---|---|---|---|---|---|
| E1 | `""` | `"first"` | false | `"first\n"` / 6 | `"first"` / 5 |
| E2 | `""` | `"first"` | true | `"first"` / 5 | `"first"` / 5 (unchanged) |
| E3 | `""` | `"first\n"` | false | `"first\n\n"` / 7 | `"first\n"` / 6 |
| E4 | `""` | `"café"` | false | `"café\n"` / 6 | `"café"` / 5 |
| E5 | `"---\nkey: v\n---\n"` | `"Lead"` | false | `"---\nkey: v\n---\nLead\n"` / 5 | `"---\nkey: v\n---\nLead"` / 4 |
| E6 | `"---\nkey: v\n---\n"` | `"Lead"` | true | `"---\nkey: v\n---\nLead"` / 4 | unchanged |
| E7 | `"---\r\nkey: v\r\n---\r\n"` | `"Lead"` | false | `"…---\r\nLead\n"` / 5 | `"…---\r\nLead"` / 4 |
| E8 | `"---\nkey: v\n---"` | `"Lead"` | false | `"---\nkey: v\n---Lead\n"` / 5 | `"---\nkey: v\n---Lead"` / 4 (placement unchanged, out of scope) |
| E9 | `"abc"` | `"def"` | false | `"def\nabc"` / 4 | unchanged |
| E10 | `"x\n"` | `"x"` | false | `"x\nx\n"` / 2 | unchanged (ambiguity guard, research D2) |
| E11 | `"\n"` | `"first"` | false | `"first\n\n"` / 6 | unchanged (a note holding a line break has content) |
| E12 | `"---\nkey: v\n---\n"` | `"---"` | false | `"---\nkey: v\n---\n---\n"` / 4 | unchanged (ambiguity guard; documented limitation) |

Mirror check (spec FR-005): for E1, E3 and E4, `append_note` on the same empty note gives the same note and the same `bytes_written`.

## §4 Errors

| Code | `details` | When | State of the note |
|---|---|---|---|
| `FS_WRITE_FAILED` | `reason: "extra-trailing-newline"`, `path`, `vault`, `errno` when known | Obsidian's write landed on a note without a body, and rewriting it without the extra line break failed; or the note was empty before the call and could not be read back. | Holds the content followed by one extra LF. |
| `FS_WRITE_FAILED` | `errno`, `syscall: "open"`, `path` (no `reason`) | Obsidian's write landed on a non-empty note, and the note could not be read back, so the tool cannot tell whether it was properties-only. | Holds the content as Obsidian wrote it, possibly with one extra trailing LF. Do not re-send the content. |
| `FS_WRITE_FAILED` | `errno`, `syscall: "open"`, `path` (no `reason`) | The note could not be read before a default-mode call (any errno other than ENOENT). Inline calls do not read the note first. | Unchanged; Obsidian was not called. |

All existing errors (`post-stat-byte-delta-zero`, `NOTE_NOT_FOUND`, `EXTERNAL_EDITOR_CONFLICT`, `prepend-cli`, validation, path and vault errors) are unchanged. No new top-level code.

Message for the unverified case: `prepend: the content landed in "<path>", but the note could not be read back (<errno>) to check whether Obsidian left an extra trailing line break. Do not send the content again; read the note to check its end.`

Message for `extra-trailing-newline`: `prepend: the content landed in "<path>", but the extra trailing line break Obsidian added could not be removed (<errno or reason>); the note ends with one extra line break. Retry once the file is free, or remove the final line break yourself.`

## §5 Published surface

No tool description, input schema, output schema or annotation changes, so `_register-baseline.json` is unchanged. `docs/tools/prepend.md` (served by `help`) gains the new error row, a `bytes_written` sentence for notes without a body, the properties-only worked example and the E12 limitation.
