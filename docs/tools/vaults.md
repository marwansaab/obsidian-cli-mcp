# `vaults`

List every vault Obsidian knows, with the name other tools take as `vault` and the vault's folder. Wraps the Obsidian CLI's `vaults verbose` subcommand 1:1 (ADR-010). Read-only.

## When to use this tool

| You want to | Reach for |
|---|---|
| Find the exact vault name to pass as `vault` | `vaults` |
| Check whether a vault added after the server started is now known | `vaults` |
| List the notes or folders inside a vault | [`files`](./files.md) or [`paths`](./paths.md) |
| Find which note Obsidian has focused | [`get_active_file`](./get_active_file.md) |

## Input

None. The input is an empty object; any key is rejected with `VALIDATION_ERROR`.

```json
{}
```

## Output

```json
{
  "count": 2,
  "vaults": [
    { "name": "Work", "path": "C:\\Users\\me\\Vaults\\Work", "open": null },
    { "name": "Personal", "path": "C:\\Users\\me\\Vaults\\Personal", "open": null }
  ]
}
```

- `count` — number of vaults listed; always equals `vaults.length`.
- `vaults[].name` — the vault's Obsidian display name, the value every other tool takes as `vault`.
- `vaults[].path` — the absolute path of the vault folder, exactly as Obsidian reports it.
- `vaults[].open` — whether the vault is open in Obsidian. Always `null` (unknown): the Obsidian CLI does not report which vaults are open, and the server does not guess.
- Vaults appear in the order the Obsidian CLI lists them.
- Two vaults that share a display name are both listed, each with its own `path`. Targeting that name with `vault` still reaches only one of them, so give colliding vaults distinct names.
- When Obsidian knows no vaults, the result is `{ "count": 0, "vaults": [] }`.

The result is returned both as `structuredContent` and as the same JSON in the text block.

## Freshness

Every call re-reads Obsidian's vault list; nothing is cached between calls. The same read refreshes the name lookup the other tools use, so a vault added in Obsidian after the server started can be targeted by name straight away.

Other tools also re-read the list once on their own when they are given a vault name the server has not seen, before failing with the unknown-vault error. No server restart is needed in either case.

## Error roster

| Top-level `code` | When | Recovery |
|---|---|---|
| `VALIDATION_ERROR` | Any input key was given (the input must be `{}`) | Call with no arguments. |
| `CLI_BINARY_NOT_FOUND` | The Obsidian CLI is not installed or not on `PATH` | Install Obsidian 1.12+ with the CLI enabled, or set `OBSIDIAN_BIN`. |
| `CLI_NON_ZERO_EXIT` (`details.reason: "obsidian-not-running"`) | Obsidian could not be reached, even after the usual auto-launch (or auto-launch is off) | Start Obsidian and retry. An error is returned rather than an empty list. |
| `CLI_REPORTED_ERROR` | The CLI reported an error of its own on stdout | Read `message`; retry once Obsidian is responsive. |
| `CLI_TIMEOUT` | The CLI did not answer in time | Retry; check that Obsidian is responsive. |

## Worked examples

### Example 1 — List the vaults

```json
{ "name": "vaults", "arguments": {} }
```

Response:

```json
{
  "count": 2,
  "vaults": [
    { "name": "Work", "path": "C:\\Users\\me\\Vaults\\Work", "open": null },
    { "name": "Personal", "path": "C:\\Users\\me\\Vaults\\Personal", "open": null }
  ]
}
```

### Example 2 — Use a vault added after the server started

1. The user adds the vault `Research` in Obsidian while the server is running.
2. `vaults` now lists `{ "name": "Research", ... }`.
3. `read` with `target_mode: "specific"`, `vault: "Research"` and a `file` succeeds, with no restart.

### Example 3 — An input key is rejected

```json
{ "name": "vaults", "arguments": { "vault": "Work" } }
```

Returns `isError: true` with `code: "VALIDATION_ERROR"`; no CLI call is made.
