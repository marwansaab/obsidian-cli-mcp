// Original — no upstream.
import { registerTool } from "../_register.js";
import { type ExecuteDeps, executeViewsBase, VIEWS_BASE_SUPPORTED } from "./handler.js";
import { viewsBaseInputSchema, viewsBaseOutputSchema } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import { closedVaultNote, READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const VIEWS_BASE_TOOL_NAME = "views_base";

export const VIEWS_BASE_DESCRIPTION =
  `List the views defined inside an Obsidian Bases (\`.base\`) file. Siblings in the Bases family: \`bases\` (enumerate \`.base\` files), \`query_base\` (query rows from a view), \`create_base\` (create a new item in a base). ${describeSupport(VIEWS_BASE_SUPPORTED)}

Two modes. **Named Base** — pass \`base_path\` (a vault-relative \`.base\` path, the same identifier \`bases\` emits and \`query_base\`/\`create_base\` accept) to list THAT Base's views, regardless of what is focused in Obsidian; the named Base is focused as a side effect and always wins over the open Base. **Open Base** — omit \`base_path\` to list the views of the Base currently focused in Obsidian (no human re-focus needed when you name one).

Optional \`vault\` (string): with \`base_path\`, the named Base in that vault (cross-vault — reached whether its vault is focused, open-but-unfocused, or closed); without \`base_path\`, the views of the Base open in that vault (a \`BASE_NOT_FOUND\`/\`not-open\` then carries \`details.vault\`); omitted, the vault in front.

Response: \`{ views: string[], count: number }\`. Each name is a CLEAN, query-ready view name — the injected type label is stripped and internal spaces/punctuation are preserved, so a returned name is accepted verbatim as \`query_base\`'s \`view_name\` for the same Base. Names are returned in CLI emission order. An empty declared-views set lists whatever Obsidian materialises (a default view).

Read-only — the tool never mutates vault contents (naming a Base changes which file is focused; no vault content is created, modified, or deleted).

Typed errors via \`UpstreamError.code\`: \`VALIDATION_ERROR\` (malformed input; \`INVALID_BASE_PATH\` sub-issues for an empty / too-long / path-traversal / non-\`.base\` \`base_path\`); \`CLI_REPORTED_ERROR\` with \`details.code\` — \`BASE_NOT_FOUND\` (\`details.reason: "named-missing"\` when a named Base does not exist, \`"not-open"\` when no Base is focused, with \`details.vault\` when a vault is named — distinct, never a silent open-Base substitution), \`BASE_MALFORMED\` (the \`.base\` — named or open — is malformed: \`details.reason: "invalid-yaml"\` when Obsidian cannot parse its YAML, \`"unknown"\` when a named \`.base\` is otherwise unusable; \`details.message\` carries the bounded upstream report), \`VAULT_NOT_FOUND\` (\`details.reason: "unknown"\` for an unregistered \`vault\`).

${closedVaultNote("base:views")}`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createViewsBaseTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: VIEWS_BASE_TOOL_NAME,
    title: "Views Base",
    annotations: READ_ONLY_HINTS,
    description: VIEWS_BASE_DESCRIPTION,
    schema: viewsBaseInputSchema,
    outputSchema: viewsBaseOutputSchema,
    deps,
    handler: async (input, d) => executeViewsBase(input, d),
  });
}
