// Original — no upstream.
import { registerTool } from "../_register.js";
import { executeViewsBase, type ExecuteDeps } from "./handler.js";
import { viewsBaseInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const VIEWS_BASE_TOOL_NAME = "views_base";

export const VIEWS_BASE_DESCRIPTION =
  `List the views defined inside an Obsidian Bases (\`.base\`) file. Siblings in the Bases family: \`bases\` (enumerate \`.base\` files), \`query_base\` (query rows from a view), \`create_base\` (create a new item in a base).

Two modes. **Named Base** — pass \`base_path\` (a vault-relative \`.base\` path, the same identifier \`bases\` emits and \`query_base\`/\`create_base\` accept) to list THAT Base's views, regardless of what is focused in Obsidian; the named Base is focused as a side effect and always wins over the open Base. **Open Base** — omit \`base_path\` to list the views of the Base currently focused in Obsidian (no human re-focus needed when you name one).

Optional \`vault\` (string): with \`base_path\`, routes to that vault (cross-vault — the named Base is reached whether its vault is focused, open-but-unfocused, or closed). Without \`base_path\`, \`vault\` is an inherited no-op (the underlying active subcommand does not honour it).

Response: \`{ views: string[], count: number }\`. Each name is a CLEAN, query-ready view name — the injected type label is stripped and internal spaces/punctuation are preserved, so a returned name is accepted verbatim as \`query_base\`'s \`view_name\` for the same Base. Names are returned in CLI emission order. An empty declared-views set lists whatever Obsidian materialises (a default view).

Read-only — the tool never mutates vault contents (naming a Base changes which file is focused; no vault content is created, modified, or deleted).

Typed errors via \`UpstreamError.code\`: \`VALIDATION_ERROR\` (malformed input; \`INVALID_BASE_PATH\` sub-issues for an empty / too-long / path-traversal / non-\`.base\` \`base_path\`); \`CLI_REPORTED_ERROR\` with \`details.code\` — \`BASE_NOT_FOUND\` (\`details.reason: "named-missing"\` when a named Base does not exist, \`"not-open"\` when no Base is focused — distinct, never a silent open-Base substitution), \`BASE_MALFORMED\` (the named \`.base\` is unusable), \`VAULT_NOT_FOUND\` (\`details.reason: "unknown"\` for an unregistered \`vault\`). Call \`help({ tool_name: "views_base" })\` for worked examples and the error-code roster.`;

export type RegisterDeps = ExecuteDeps;

export function createViewsBaseTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: VIEWS_BASE_TOOL_NAME,
    description: VIEWS_BASE_DESCRIPTION,
    schema: viewsBaseInputSchema,
    deps,
    handler: async (input, d) => executeViewsBase(input, d),
  });
}
