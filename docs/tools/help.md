# `help`

Look up full Markdown documentation for any registered MCP tool. Companion to the schema-stripping utility that this connector applies at registration time per ADR-005 — the agent receives a stripped JSON Schema in `tools/list` (no parameter descriptions) and uses `help` to fetch full docs on demand.

## Input

| Field | Type | Required | Constraint | Description |
|-------|------|----------|------------|-------------|
| `tool_name` | string | NO | length ≥ 1 | The name of the tool to read docs for. When omitted, the call returns the index page listing all available tools. |

The input schema is defined as `z.object({ tool_name: z.string().min(1).optional() }).strict()` — extra keys are rejected at the zod boundary as `VALIDATION_ERROR`.

## Output

The response carries a single text block whose `text` is the full UTF-8 contents of a bundled Markdown file:

- **Named tool, doc exists**: `text` is the contents of `docs/tools/<tool_name>.md`.
- **`tool_name` omitted (or empty input `{}`)**: `text` is the contents of `docs/tools/index.md` — the listing of all available tools.

The file's contents are returned verbatim — no transformation, no transcoding, no summarisation. An empty doc file (zero bytes) returns `text: ""`.

## Errors

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | `tool_name` is the empty string, a non-string value, or the input contains unknown keys. | Agent retries with a non-empty string `tool_name` (or omits the field for the index). |
| `HELP_TOOL_NOT_FOUND` | `tool_name` is provided as a non-empty string but no `<tool_name>.md` file exists in the docs directory; OR `tool_name` is the reserved literal `"index"` (the index page is reached via the no-argument call); OR `tool_name` resolves to a path outside the docs directory (path-traversal probe). | Agent self-corrects: `details.availableTools` lists every tool whose doc file exists. The error message lists the same names; `details.requestedName` carries the original input but the message does NOT echo it (anti-injection). |
| `HELP_DOCS_MISSING` | The bundled `docs/tools/` directory itself is missing, unreadable, or is not a directory. Indicates a packaging or install integrity failure. | Operator-side fix: re-install the npm package, OR check the package layout. NOT agent-recoverable. `details.resolvedDocsDir` carries the absolute path the tool was looking at; `details.ioCode` carries the underlying I/O error code (e.g., `"ENOENT"`, `"ENOTDIR"`, `"EACCES"`) where available. |

## Examples

### Look up the help tool's own docs

```json
{ "name": "help", "arguments": { "tool_name": "help" } }
```

Returns this page.

### Look up `obsidian_exec`'s docs

```json
{ "name": "help", "arguments": { "tool_name": "obsidian_exec" } }
```

Returns the full documentation for the `obsidian_exec` tool.

### List all available tools

```json
{ "name": "help", "arguments": {} }
```

Returns the index page (`index.md`) — a bullet list of every tool that has a doc file.

### Recover from `HELP_TOOL_NOT_FOUND`

A call with an unknown tool name fails with `HELP_TOOL_NOT_FOUND`:

```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "{\"code\":\"HELP_TOOL_NOT_FOUND\",\"message\":\"No documentation file for the requested tool. Available tools: append_note, help, list_notes, list_vaults, obsidian_exec, read, search_vault, write_note.\",\"details\":{\"requestedName\":\"unknown_xyz\",\"availableTools\":[\"append_note\",\"help\",\"list_notes\",\"list_vaults\",\"obsidian_exec\",\"read\",\"search_vault\",\"write_note\"]}}"
  }]
}
```

The agent reads `details.availableTools` and retries with a valid name.

## Path resolution

Doc files are resolved relative to the help tool's compiled module location (via `import.meta.url`), NOT relative to the MCP server process's current working directory. The `help` tool works correctly regardless of where the server process was spawned from. Per FR-009 of feature 005-help-tool's spec.

## Related

- [ADR-005 — Token-Optimized Tool Definitions via Progressive Disclosure](../../.decisions/ADR-005%20-%20Token-Optimized%20Tool%20Definitions%20via%20Progressive%20Disclosure.md) — the design decision this tool implements.
- [the index](./index.md) — listing of all available tool docs.
