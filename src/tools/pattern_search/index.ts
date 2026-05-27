// Original — no upstream. pattern_search tool registration via registerTool — ECMAScript-regex search primitive returning a typed { count, matches: [{path, line, offset, match, text}], truncated? } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire. Sixteenth typed-tool wrap.
import { registerTool } from "../_register.js";
import { executePatternSearch, type ExecuteDeps } from "./handler.js";
import { patternSearchInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const PATTERN_SEARCH_TOOL_NAME = "pattern_search";

export const PATTERN_SEARCH_DESCRIPTION =
  `ECMAScript-regex search across every Markdown note in a vault (or under a sub-folder). Returns \`{ count, matches: [{ path, line, offset, match, text }], truncated? }\`.

Pick \`pattern_search\` when you need regex. Pick \`context_search\` for literal substring with simpler payload. Pick \`search\` for path-only matches. Pick \`smart_connections_query\` for semantic similarity.

**CRITICAL — case-sensitivity default flips from \`context_search\`.** \`pattern_search\` defaults to **case-sensitive** matching; \`context_search\` defaults to case-insensitive. Opt into case-insensitive matching explicitly via \`case_sensitive: false\` when porting predicates between the two tools.

Vault-scoped — NO \`target_mode\` discriminator. The optional \`vault\` field routes to a named vault; omitted routes to the focused vault.

Required \`pattern\` (string, 1..1000 chars): ECMAScript regex (Node \`RegExp\`, V8). Supports \`\\d\`, \`\\w\`, \`\\b\`, character classes, alternation, quantifiers, named captures \`(?<name>…)\`, lookahead \`(?=…)\` / \`(?!…)\`, lookbehind \`(?<=…)\` / \`(?<!…)\`. The \`i\` flag is applied when \`case_sensitive: false\`. The \`u\` flag is NOT exposed — \`\\d\` is ASCII-only, \`\\b\` is the ASCII word boundary. Other flags (\`m\`, \`s\`, \`y\`, \`d\`) are NOT exposed. Invalid regex syntax is rejected at the schema boundary with \`VALIDATION_ERROR\` carrying the engine's SyntaxError message verbatim — no partial matches are returned alongside the error.

Optional \`folder\` (string): vault-relative subtree prefix; recursive subtree-prefix match (case-sensitive byte-equal).

Optional \`limit\` (integer 1..10000, default 1000): caps the response \`matches\` array.

Optional \`case_sensitive\` (boolean, **default true**).

Optional \`vault\` (string): routes to a named vault; omitted routes to the focused vault.

\`match\` is the substring matched by the regex — NEVER capped, emitted verbatim. \`text\` is the full line capped at 500 UTF-16 code units + \`…\` ellipsis marker. \`offset\` is the 0-based start of the match within the line. Sort: \`(path, line, offset)\` ascending. Per-occurrence emission — three matches on the same line produce three entries differing only in \`offset\`. Zero-length matches (\`^\`, \`$\`, \`a*\`, \`\\b\`, lookarounds) are SKIPPED — they never emit entries.

**Read-only** — find-and-replace is out of scope; use [\`find_and_replace\`](./find_and_replace.md) for that. Plain-text scanning — matches inside fenced code blocks, frontmatter, or HTML comments ARE returned same as any other position; markdown-aware exclusion is out of scope. Line-scoped — a regex containing \`\\n\` cannot match across line boundaries.

Zero-match valid pattern returns \`{ count: 0, matches: [] }\` (never an error). With \`folder\` supplied, a missing folder surfaces as \`CLI_REPORTED_ERROR\` with \`details.code: "FOLDER_NOT_FOUND"\` (distinguishes wrong-folder from no-matches).

Typed errors via \`UpstreamError.code\`: \`VALIDATION_ERROR\` (including invalid regex), \`CLI_REPORTED_ERROR\` (with sub-discriminators \`FOLDER_NOT_FOUND\` / \`VAULT_NOT_FOUND\` / json-parse / envelope-parse), \`CLI_NON_ZERO_EXIT\`, \`CLI_TIMEOUT\`, \`CLI_OUTPUT_TOO_LARGE\`, \`CLI_BINARY_NOT_FOUND\`. Call \`help({ tool_name: "pattern_search" })\` for ECMAScript-dialect notes, worked examples, and the full failure roster with recovery hints.`;

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
