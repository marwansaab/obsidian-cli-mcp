// Original — no upstream. context_search tool registration via registerTool —
// vault-text-search-with-line-context primitive returning
// { count, matches: [{ path, line, text }], truncated? } in one call (eighteenth
// typed-tool wrap). Tool name `context_search` follows ADR-010 strict
// composite-namespace reversal of upstream `obsidian search:context` — parity
// with read_property (property:read) / set_property (property:set).
import { registerTool } from "../_register.js";
import { executeContextSearch, type ExecuteDeps } from "./handler.js";
import { contextSearchInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const CONTEXT_SEARCH_TOOL_NAME = "context_search";

export const CONTEXT_SEARCH_DESCRIPTION =
  'Return each match of a literal phrase in a vault as a single entry carrying the vault-relative file path, 1-based line number, and the matching line\'s text — collapsing the dominant "find file → read file → locate line" three-call grep pattern into a single MCP call. Eighteenth typed-tool wrap and the project\'s dedicated per-line-context search primitive. Vault-scoped surface — NO target_mode discriminator (no specific/active modes); the optional `vault` field routes to a named vault, omitted routes to the focused vault. Required query (string, 1..1000 chars; whitespace-only rejected). Optional folder (string): vault-relative folder prefix; leading/trailing "/" stripped wrapper-side; recursive subtree-prefix match enforced by upstream. Optional limit (integer 1..10000): caps the response `matches` array; the implicit cap is 1000. Optional case_sensitive (boolean, default false): when true, sets the upstream `case` flag; otherwise upstream default case-insensitivity applies (ASCII fold only — `É` does NOT match `é`). Optional vault (string, min 1 char; routes to focused vault when omitted). Response shape: { count, matches: [{ path, line, text }], truncated? } — `count` equals `matches.length`; `matches` sorted by `path` asc then `line` asc; `text` capped at 500 chars + a `…` (U+2026) ellipsis marker (final length 501 for capped lines) and any single trailing `\\r` stripped (FR-012, cross-platform CRLF defence); `truncated: true` field present only when truncation fired (absent === false). Truncation is conservative — fires when the underlying file-count equals the applied cap OR the flat match-set exceeds the applied cap (R9 trade-off). Non-`.md` paths defensively filtered out. Zero-match WITHOUT a folder argument returns the empty envelope `{ count: 0, matches: [] }` — NEVER an error. Zero-match WITH a folder argument fires a second `obsidian folder` probe: a missing folder surfaces as CLI_REPORTED_ERROR (details.message starts `Error: Folder`) — distinguishing folder-not-found from folder-exists-with-no-matches per FR-013. Unknown vault → CLI_REPORTED_ERROR (details.message: "Vault not found.") via the cli-adapter\'s success-path stdout inspection. CLI stdout failures route via CLI_REPORTED_ERROR with details.stage:"json-parse" or "wire-parse". Prefer `context_search` over `search` when you need per-match line context in a single call; prefer `search` when you only need the file paths (smaller payload, lighter cap budget). Call help({ tool_name: "context_search" }) for the full parameter docs, four worked examples (minimal happy path; folder-scoped; capped+truncated; folder-not-found error), and the failure roster.';

export type RegisterDeps = ExecuteDeps;

export function createContextSearchTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: CONTEXT_SEARCH_TOOL_NAME,
    description: CONTEXT_SEARCH_DESCRIPTION,
    schema: contextSearchInputSchema,
    deps,
    handler: async (input, d) => executeContextSearch(input, d),
  });
}
