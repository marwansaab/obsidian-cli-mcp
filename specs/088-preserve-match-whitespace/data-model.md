# Data Model: Preserve match whitespace

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

No persisted data. These are the values one `context_search` call moves through.

## E1. Wire file (unchanged)

`SearchContextWireFile` (`src/tools/search/schema.ts`): `{ file, matches: [{ line, text }] }`, the parsed `search:context` output.

- `line` is 1-based over the whole note, split on `"\n"` (research F5).
- `text` is that line after `String.prototype.trim` (F6), never shortened (F7).

## E2. Selected row (new name for an existing value)

`{ path, line, text }`, the output of `selectLines(query, wire, appliedCap)`, where `text` is still the CLI's trimmed text, uncapped.

`selectLines` returns `{ rows, truncated }`. The order and membership rules are spec 087's, unchanged:

- **V1**: rows hold only `.md` files and one entry per `(path, line)`, the first in wire order.
- **V2**: a query holding `\r` or `\n` gives no rows.
- **V3**: `truncated` is `deduplicated row count >= appliedCap`.
- **V4**: rows are sorted by `path` (code-unit order), then `line`, and sliced to `appliedCap`.

`lineMatches(query, wire, appliedCap, normaliseText)` (search's deprecated line mode) is `selectLines`, then `capLine(normaliseText(text))` per row. Its output is the same as today (research F2, D2).

## E3. Read-back request (new)

The payload of one read-back eval: compact tuples `[[path, [line, …]], …]`.

- **V5**: every selected row appears in exactly one request, under its own path. Paths keep their first-seen output order, and a path's lines keep output order.
- **V6**: each request's composed eval code (`composeEvalCode(JS_TEMPLATE, request)`) is at most `READ_BACK_CODE_MAX` (2900) characters. The answer-tag wrapper adds 66 more, so every `code=` value stays under 3,000, against the shim's last-answered 4,009 (research F10, D3).
  - Requests are cut between rows, so one note's lines may span requests.
  - Every request holds at least one row.
  - `JS_TEMPLATE` is at most 900 characters.

## E4. Read-back answer (new, eval wire)

The template's JSON answer, validated by a zod schema in `context_search/schema.ts`:

```text
{ notes: Array<
    | { path: string, state: "read", lines: Array<{ line: number, raw: string | null }> }
    | { path: string, state: "note-not-found" }
    | { path: string, state: "read-failed", detail: string } > }
```

- `raw` is `content.split("\n")[line - 1]`, which may end in `\r`, or `null` when `line` is past the end.
- **V7**: an answer that is not JSON, or that fails the schema, is `CLI_REPORTED_ERROR` with `details.stage` `"json-parse"` or `"envelope-parse"` and `stdoutDetails`.
- An answer that omits a requested path or line also fails as `"envelope-parse"`, because the reconciliation cannot find it. Entries beyond the request are ignored.

## E5. Restored row and output (changed)

For each selected row, the restored text is `capLine(lineText(raw))`, with a line-1 byte-order mark removed first (V8). `lineText` (`_note-lines.ts`) drops one trailing `\r` here, since a `split("\n")` element holds no `\n`.

- **V8** (FR-001 to FR-004): the restored text equals the note's line minus its line ending, before the cap. Leading and trailing whitespace of any kind is kept. A mid-line `\r` is kept. On line 1 only, a leading U+FEFF (byte-order mark) is dropped (spec Assumption); a U+FEFF anywhere else is text. `trim()` treats U+FEFF as whitespace, so the reconciliation in V10 accepts the line either way.
- **V9** (FR-005): the cap is applied after the restore, so leading whitespace counts towards the 500 characters.
- **V10** (FR-007, FR-011): a row whose note is missing, unreadable or whose `lineText(raw).trim()` differs from the CLI `text.trim()` (including `raw === null`) fails the whole call. The first such row in output order is named. See the error contract.

The output envelope `{ count, matches: [{ path, line, text }], truncated? }` keeps the exact schema it has today. `count`, `truncated`, paths, lines and order come from E2 unchanged (FR-006).

## Per-call flow

```text
input ─▶ invokeCli(search:context, query = literal phrase)        [unchanged]
      ─▶ zero-match sentinel? ─▶ folder probe / empty envelope     [unchanged, no read-back]
      ─▶ JSON.parse ─▶ searchContextWireSchema                      [unchanged]
      ─▶ selectLines(query, wire, appliedCap) → { rows, truncated } [E2]
      ─▶ rows empty? ─▶ { count: 0, matches: [] }                   [no read-back]
      ─▶ batch rows into requests (V5, V6)                          [E3]
      ─▶ for each request: invokeEval(JS_TEMPLATE, vault = input.vault) → answer (E4)
      ─▶ reconcile every row: missing / unreadable / changed → throw (V10)
      ─▶ text = capLine(lineText(raw))                              [E5]
      ─▶ contextSearchOutputSchema.parse({ count, matches, truncated? })
```
