// Original — no upstream.
import { registerTool } from "../_register.js";
import { executeViewsBase, type ExecuteDeps } from "./handler.js";
import { viewsBaseInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const VIEWS_BASE_TOOL_NAME = "views_base";

export const VIEWS_BASE_DESCRIPTION =
  `List the views defined inside the currently focused Obsidian Bases (\`.base\`) file. Siblings in the Bases family: \`bases\` (enumerate \`.base\` files), \`query_base\` (query rows from a view), \`create_base\` (create a new item in a base).

**Active-mode-only**: this tool operates exclusively on the file currently focused in Obsidian. There is no \`path\` parameter — the user must have a \`.base\` file open and focused for this tool to succeed. If the focused file is not a \`.base\` file (or no file is focused), the tool returns a structured \`BASE_NOT_FOUND\` error.

Response: \`{ views: string[], count: number }\`. View names are returned in the order emitted by the CLI. Empty base (zero views) returns \`{ views: [], count: 0 }\`.

Optional \`vault\` (string): accepted for cohort parity but currently silently ignored by the underlying CLI — the tool always operates on the active vault context. This is an inherited CLI limitation; the parameter is preserved for forward compatibility.

Read-only — the tool never mutates vault contents.

Typed errors via \`UpstreamError.code\`: \`CLI_REPORTED_ERROR\` (\`BASE_NOT_FOUND\` when the active file is not a \`.base\` file or no file is focused; upstream CLI failure); \`VALIDATION_ERROR\` (malformed input). Call \`help({ tool_name: "views_base" })\` for worked examples and the error-code roster.`;

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
