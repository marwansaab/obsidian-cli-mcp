# Escape hatch and meta

The two tools that are not vault primitives: one runs any CLI subcommand, and
one serves the documentation for every other tool. Per-tool contracts are the
`docs/tools/` pages linked below.

| Tool | Pipeline | Contract |
| --- | --- | --- |
| `obsidian_exec` | `invokeBoundedCli` — any subcommand | [docs/tools/obsidian_exec.md](../../docs/tools/obsidian_exec.md) |
| `help` | reads `docs/tools/` from the installed package | [docs/tools/help.md](../../docs/tools/help.md) |

## `obsidian_exec` — the single escape hatch

The server's stance ([README](../../README.md#vision)) is a small set of typed
tools with narrow contracts, plus **one** explicit escape hatch for the long
tail of subcommands. `obsidian_exec` (part of the original bridge, PR #1) is
that escape hatch, and it is the only caller of `invokeBoundedCli`. It gets
looser bounds than the typed tools: a 30 s default timeout, overridable and
clamped silently to 120 s, against a fixed 10 s for typed tools (ADR-007,
Centralized CLI Bounds with Selective Override). It returns `stdout`,
`stderr`, `exitCode` and the exact `argv`, so a client can see precisely what
ran.

It still goes through the same queue, the same dispatch, the same cold-start
retry, the same auto-launch and the same four-priority classification as
every other tool. Bypassing those is the one thing an escape hatch here
cannot do: `architecture.test.ts` keeps `dispatchCli` reachable only through
the two facades.

Several typed tools point to `obsidian_exec` for what they deliberately do not
cover: `rename` on non-`.md` files, `write_note` templates, `properties`
ordered by frequency.

## `help` — progressive disclosure

`help` (BI-030, PR #6) is half of ADR-005 (Token-Optimized Tool Definitions via
Progressive Disclosure). `registerTool` strips per-field descriptions from
every published input schema, so `tools/list` stays small. `help` serves the
long form on demand. With no argument it returns `docs/tools/index.md`; with
`tool_name` it returns `docs/tools/<tool_name>.md`.

It reads from the package's own `docs/tools/` directory, resolved relative to
the compiled handler, so it works the same from `src/` in development and
from the installed `dist/`. The requested name is checked for path traversal
and NUL bytes before any file is opened. A missing doc is
`HELP_TOOL_NOT_FOUND`, and a missing docs directory is `HELP_DOCS_MISSING`.

Because `help` makes the docs part of the runtime, the server also refuses to
start if any registered tool lacks its doc file
([architecture](../architecture.md#boot-spine)).

## Known limits

- `docs/tools/` still holds stub pages for `list_notes`, `list_vaults` and
  `search_vault`. They are not registered tools, so `help` serves a "not yet
  implemented" page for names a client cannot call. `docs/tools/index.md`
  lists them as documentation pending.
