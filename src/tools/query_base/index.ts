// Original — no upstream. query_base tool registration via registerTool — wraps the upstream `obsidian base:query` subcommand to return matched rows from a named view inside an Obsidian Bases (.base) file as a structured `{ columns, rows, truncated, total_rows? }` envelope. Sixteenth typed-tool wrap; ADR-010 mechanical name from `base:query`.
import { registerTool } from "../_register.js";
import { executeQueryBase, type ExecuteDeps } from "./handler.js";
import { queryBaseInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const QUERY_BASE_TOOL_NAME = "query_base";

export const QUERY_BASE_DESCRIPTION =
  `Run a named view from an Obsidian Bases (\`.base\`) file and return its matched rows as a structured JSON envelope. First member of the Bases-family cohort (siblings: \`bases\` to enumerate \`.base\` files, \`views_base\` to enumerate views inside one, \`create_base\` to create a new one).

Required \`base_path\` (string, 1..1000 chars): vault-relative path to the \`.base\` file; MUST end with \`.base\` (case-insensitive on the extension). Required \`view_name\` (string, 1..1000 chars): exact case-sensitive match — no trim, no fuzzy. Optional \`vault\` (string): routes to a named vault; omitted routes to the focused vault.

Response: \`{ columns: string[], rows: Array<Record<string, unknown>>, truncated: boolean, total_rows?: number }\`.

- The reserved key \`path\` always occupies \`columns[0]\` and is present on every row as the vault-relative source-note locator. A view-defined column named \`path\` is renamed to \`path_view\` per the reserved-key collision rule.
- Empty views (zero rows matched) return \`{ columns: ["path"], rows: [], truncated: false }\` — only the reserved \`path\` column appears; view-declared columns only surface when at least one row matches.
- \`total_rows\` is present only when \`truncated: true\` (matched > 1000 rows); when ≤ 1000 rows, \`truncated: false\` and \`total_rows\` is omitted.

**Type-preservation caveat**: frontmatter values are stringified by upstream regardless of declared YAML type. Integer YAML \`count: 42\` surfaces as the string \`"42"\`; boolean YAML \`done: true\` surfaces as \`"true"\`. Parse client-side if numeric / boolean semantics are required — the wrapper does NOT coerce.

**\`file.X\` column emission caveat**: source-property column names declared as \`file.X\` are emitted by upstream as the display label \`"file X"\` with embedded space — \`file.path\` → \`"file path"\`, \`file.name\` → \`"file name"\`. Index by the exact emitted string. The reserved \`path\` column (sourced from row metadata) is distinct from \`"file path"\` (the display label).

Read-only — the tool never mutates vault contents.

Typed errors via \`UpstreamError.code\`: \`VALIDATION_ERROR\` (\`INVALID_BASE_PATH\` with sub-reasons \`empty\`/\`too-long\`/\`wrong-extension\`/\`path-traversal\`; \`INVALID_VIEW_NAME\` with sub-reasons \`empty\`/\`too-long\`); \`CLI_REPORTED_ERROR\` (\`BASE_NOT_FOUND\`; \`BASE_MALFORMED\` with sub-reasons \`empty\`/\`invalid-yaml\`/\`missing-required-key\`/\`unsupported-schema-version\`/\`unknown\`; \`VIEW_NOT_FOUND\`; \`VAULT_NOT_FOUND\` with sub-reasons \`unknown\`/\`not-open\`); \`PATH_ESCAPES_VAULT\`. Call \`help({ tool_name: "query_base" })\` for worked examples and recovery hints.`;

export type RegisterDeps = ExecuteDeps;

export function createQueryBaseTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: QUERY_BASE_TOOL_NAME,
    description: QUERY_BASE_DESCRIPTION,
    schema: queryBaseInputSchema,
    deps,
    handler: async (input, d) => executeQueryBase(input, d),
  });
}
