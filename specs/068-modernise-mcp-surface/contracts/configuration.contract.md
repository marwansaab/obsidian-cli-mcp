# Contract: Owner configuration (environment variables)

**Serves**: FR-012, FR-043–FR-046 · **PRs**: 2 (`OBSIDIAN_MCP_ALLOW_EVAL`), 6 (the rest)
**Data model**: [data-model.md §1](../data-model.md)

All four are read once at server start. A change takes effect on the next start. The
README documents all four (FR-012, FR-046); `OBSIDIAN_MCP_ALLOW_EVAL` gets a plain
warning.

| Variable | Values | Default | Effect |
|---|---|---|---|
| `OBSIDIAN_MCP_ALLOW_EVAL` | truthy: `1`, `true`, `yes`, `on` (case-insensitive, trimmed); anything else, or unset, is false | false | true → `obsidian_exec` runs blocked commands (`eval`, `dev:*`, `devtools`, plugin install/enable/disable, `restart`) |
| `OBSIDIAN_MCP_READ_ONLY` | same truthy set | false | true → only tools with `readOnlyHint: true` are registered |
| `OBSIDIAN_MCP_TOOLS` | comma-separated tool names; whitespace around names ignored; empty entries ignored | unset = all tools | only the listed tools are registered |
| `OBSIDIAN_MCP_DISABLE` | comma-separated tool names, same rules | unset = none | listed tools are not registered |

## Composition

1. Start from all tools.
2. If `OBSIDIAN_MCP_TOOLS` is set: keep only those.
3. Remove `OBSIDIAN_MCP_DISABLE` names (deny after allow; deny wins on overlap).
4. If `OBSIDIAN_MCP_READ_ONLY` is true: keep only read-only tools (a write tool in the
   allow list is still dropped).
5. An empty result is allowed. The server starts and offers no tools.

## Start-up failure

If any name in `OBSIDIAN_MCP_TOOLS` or `OBSIDIAN_MCP_DISABLE` is not a tool name, the
server exits before serving. Unknown names from both lists are reported together in one
stderr message, in the same aggregated style as the missing-tool-doc check:

```text
Unknown tool name(s) in OBSIDIAN_MCP_TOOLS / OBSIDIAN_MCP_DISABLE: foo (OBSIDIAN_MCP_TOOLS), bar (OBSIDIAN_MCP_DISABLE). Valid names: append_note, backlinks, …
```

## Tests (Principle II)

- truthy parsing table (each truthy spelling, a falsy spelling, unset) for both boolean
  flags;
- read-only → the registered set equals the `readOnlyHint: true` set;
- allow only, deny only, allow + deny with overlap, read-only + allow naming a write tool;
- unknown names in both lists → one error naming every unknown name;
- empty offered set → server starts, `tools/list` is empty.
