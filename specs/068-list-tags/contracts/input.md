# Input Contract: `tags`

**Schema of record**: `tagsInputSchema` in `src/tools/tags/schema.ts`. Field table: [data-model.md](../data-model.md) § 1.

```json
{
  "vault": "<vault display name>",
  "file": "<bare note name>",
  "path": "<vault-relative/path.md>",
  "activeOnly": false,
  "sortByCount": false,
  "includeCounts": true
}
```

Every field is optional. `{}` is a valid request: the vault-wide tag index of the focused vault, alphabetical, with counts.

## Scope matrix

`activeOnly: false` (or absent) counts as not set. Rows are checked in order, and the first match is the single reason reported.

| # | Combination | Verdict | Error |
|---|---|---|---|
| 1 | `file` + `path` | reject | `VALIDATION_ERROR`, `details.code: "SCOPE_CONFLICT"`, `details.reason: "file+path"` |
| 2 | `activeOnly: true` + (`file` or `path`) | reject | `VALIDATION_ERROR`, `SCOPE_CONFLICT` / `active+note` |
| 3 | `activeOnly: true` + `vault` | reject | `VALIDATION_ERROR`, `SCOPE_CONFLICT` / `active+vault` |
| 4 | (`file` or `path`) ± `vault` | allow | — |
| 5 | `vault` only, or nothing | allow (vault-wide) | — |
| 6 | `activeOnly: true` only | allow (active note) | — |

## Field-level rejections

| Input | Error |
|---|---|
| `file` or `path` failing structural path safety (empty, leading `/` or `\`, drive letter, `..` segment, control character) | `VALIDATION_ERROR`, `details.code: "INVALID_NOTE"`, `details.reason: "path-traversal"` |
| `file` containing `[[` or `]]` | `VALIDATION_ERROR` (generic issues channel; message asks for the bare name) |
| any unknown top-level key (e.g. `target_mode`, `sort`) | `VALIDATION_ERROR` (generic; zod `unrecognized_keys`) |
| wrong type, or `vault: ""` | `VALIDATION_ERROR` (generic) |

Every rejection happens before any CLI spawn. Every rejection carries `details.issues` (the zod field paths); see [errors.md](errors.md).

**Client-class note (AC-11)**: some MCP clients drop keys absent from the published `inputSchema` before sending. On those clients an unknown key never reaches the server, and the call proceeds as if the key were absent. The server-side rejection above is directly observable only on clients that forward unknown keys. Tests exercise the server path directly.

## Upstream mapping (handler → `invokeCli`)

| Input | CLI argv contribution |
|---|---|
| (always) | `tags format=json counts` (via `invokeCli` with facade `target_mode: "specific"`) |
| `vault` | `vault=<vault>` prefix (omitted → focused vault) |
| `file` | `file=<file>` |
| `path` | `path=<path>` |
| `activeOnly: true` | `active` flag |
| `sortByCount`, `includeCounts` | none (wrapper-side, research D4) |
