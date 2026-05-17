// Original — no upstream. pattern_search tool registration via registerTool — ECMAScript-regex search primitive returning a typed { count, matches: [{path, line, offset, match, text}], truncated? } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire. Sixteenth typed-tool wrap.
import { registerTool } from "../_register.js";
import { executePatternSearch, type ExecuteDeps } from "./handler.js";
import { patternSearchInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const PATTERN_SEARCH_TOOL_NAME = "pattern_search";

export const PATTERN_SEARCH_DESCRIPTION =
  'Scan every Markdown note in a vault (or under a named sub-folder) for an ECMAScript-regex pattern and return one entry per non-empty match carrying { path, line, offset, match, text } — the regex-search companion to the keyword-only sibling `context_search` (BI-035). Sixteenth typed-tool wrap. Required `pattern` (string, 1..1000 chars): ECMAScript dialect (Node `RegExp`, V8) — supports `\\d`, `\\w`, `\\b`, named captures, lookahead, lookbehind, the `i` flag via `case_sensitive: false`; invalid regex is rejected at the zod boundary as `VALIDATION_ERROR` with `details.issues[0].path === ["pattern"]` and the engine\'s SyntaxError message verbatim. Optional `folder` (string, min 1 char): vault-relative subtree prefix; leading/trailing `/` stripped wrapper-side; recursive (every `.md` note whose path begins with `<folder>/`). Optional `limit` (integer 1..10000): caps the response `matches` array; implicit cap is 1000. CRITICAL — optional `case_sensitive` (boolean, **default `true`**): FLIPS from the sibling `context_search` default (which is case-insensitive); agents porting predicates between the two tools must opt into case-insensitive matching explicitly via `case_sensitive: false`. Optional `vault` (string, min 1 char): routes to a named vault; omitted routes to the focused vault. Response shape: `{ count, matches: [{ path, line, offset, match, text }], truncated? }` — `count === matches.length`; entries sorted by `(path` asc UTF-16`, line` asc`, offset` asc`)`; `text` capped at 500 UTF-16 code units with a trailing `…` (U+2026) marker (final length 501 for capped lines) per Q2; the matched substring (`match`) is NEVER capped — emitted verbatim from the regex engine; zero-length matches (`^`, `$`, `a*`, `\\b`, lookarounds) are skipped per Q3 (they never emit entries even when they would otherwise fire at zero width); `truncated: true` field present only when truncation fired (absent === false). Zero-match valid-pattern returns empty success — `{ count: 0, matches: [] }` — NEVER an error (FR-009). Folder-not-found surfaces as `CLI_REPORTED_ERROR` with `details.code: "FOLDER_NOT_FOUND"` and `details.folder` echoing the unknown name. Unknown vault surfaces via the cli-adapter\'s `Vault not found.` classifier as `CLI_REPORTED_ERROR`. Closed-but-registered vault surfaces as `CLI_REPORTED_ERROR` with `details.code: "VAULT_NOT_FOUND"` and `details.reason: "not-open"`. CLI stdout failures route via `CLI_REPORTED_ERROR` with `details.stage: "json-parse"` or `"envelope-parse"`. Read-only — find-and-replace is explicitly out of scope (a separate future tool). Plain-text scanning — matches inside fenced code blocks, frontmatter, or HTML comments ARE returned same as any other position; markdown-aware exclusion is out of scope. Prefer `context_search` when you need literal keyword matching with simpler payloads; prefer `pattern_search` when you need regex semantics — at the cost of the per-line `offset` field and the case-sensitivity default flip. Call help({ tool_name: "pattern_search" }) for the full parameter docs, ECMAScript-dialect notes, five worked examples (BI-token, folder + case-insensitive, folder-not-found, invalid pattern, truncation), and the failure-mode roster.';

export type RegisterDeps = ExecuteDeps;

export function createPatternSearchTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: PATTERN_SEARCH_TOOL_NAME,
    description: PATTERN_SEARCH_DESCRIPTION,
    schema: patternSearchInputSchema,
    deps,
    handler: async (input, d) => executePatternSearch(input, d),
  });
}
