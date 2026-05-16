// Original — no upstream. search tool registration via registerTool — vault-text-search
// primitive returning either { count, paths, truncated? } (default mode) or
// { count, matches: [{ path, line, text }], truncated? } (line mode);
// responseFormat: "json" (default) wraps the result for the MCP wire. Seventeenth
// typed-tool wrap and the project's first vault-text-search primitive. Tool name
// `search` follows ADR-010 single-word-verbatim-from-upstream (matches the upstream
// `obsidian search` subcommand; line mode internally routes to `obsidian search:context`
// via the BI-019 multi-subcommand-routing precedent — single MCP tool, two upstream
// subcommands).
import { registerTool } from "../_register.js";
import { executeSearch, type ExecuteDeps } from "./handler.js";
import { searchInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const SEARCH_TOOL_NAME = "search";

export const SEARCH_DESCRIPTION =
  'Return the vault-relative paths of every Markdown note containing a query string (default mode: { count, paths }) or the line-level matches with surrounding text (line mode: { count, matches: [{ path, line, text }] }) — seventeenth typed-tool wrap and the project\'s first vault-text-search primitive. Vault-scoped surface — NO target_mode discriminator (no specific/active modes). Required query (string, 1..1000 chars; whitespace-only rejected). Optional folder (string): vault-relative folder prefix; leading/trailing "/" stripped wrapper-side; case-sensitive segment-boundary match enforced by upstream. Optional limit (integer 1..10000): caps the response array; the implicit cap is 1000. Optional case_sensitive (boolean, default false): when true, sets the upstream `case` flag; otherwise upstream default case-insensitivity applies (ASCII fold only — `É` does NOT match `é`). Optional context_lines (boolean, default false): when true, routes to the `obsidian search:context` subcommand and returns line-level matches; otherwise routes to `obsidian search` and returns file paths only. Optional vault (string, min 1 char; routes to focused vault when omitted). Both output shapes carry a `count` and an optional `truncated: true` flag — the field is ONLY present when truncation fired (absent === false). Default mode: non-`.md` paths defensively filtered out; result sorted UTF-16 ascending. Line mode: per-line `text` capped at 500 chars + a `…` (U+2026) ellipsis marker (final length 501 for capped lines); matches sorted by `path` asc then `line` asc; files whose `matches` array was empty are dropped (R9 inherited limitation — files matched only by filename/metadata, not body text, do not appear in line mode). Truncation in line mode is conservative — fires when underlying file-count equals the applied cap, even when the flat match-set is under cap (R3 trade-off). Zero-match returns the empty envelope ({ count: 0, paths: [] } or { count: 0, matches: [] }) — NEVER an error (FR-012). Unknown vault → CLI_REPORTED_ERROR(details.code:"VAULT_NOT_FOUND") via the cli-adapter\'s success-path stdout inspection. CLI stdout failures route via CLI_REPORTED_ERROR with details.stage:"json-parse" or "wire-parse". Call help({ tool_name: "search" }) for the full parameter docs, four worked examples (minimal default; line mode; folder-scoped; capped+truncated), the six behavioural notes (filename-match inflation; line-mode count divergence; conservative truncation; .md-only result; case-sensitive folder; ASCII-fold case-insensitivity), and the failure roster. DEPRECATION: `context_lines=true` is retained for backward compatibility; prefer the dedicated `context_search` tool (BI-035) for per-line-context queries.';

export type RegisterDeps = ExecuteDeps;

export function createSearchTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: SEARCH_TOOL_NAME,
    description: SEARCH_DESCRIPTION,
    schema: searchInputSchema,
    deps,
    handler: async (input, d) => executeSearch(input, d),
  });
}
