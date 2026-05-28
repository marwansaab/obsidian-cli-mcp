// Original — no upstream.
import { registerTool } from "../_register.js";
import { executeBases, type ExecuteDeps } from "./handler.js";
import { basesInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const BASES_TOOL_NAME = "bases";

export const BASES_DESCRIPTION =
  `Enumerate all Obsidian Bases (\`.base\`) files in the vault and return their vault-relative paths as a sorted list. Siblings in the Bases family: \`query_base\` (query rows from a view), \`views_base\` (list views inside a base), \`create_base\` (create a new item in a base).

Response: \`{ bases: string[], count: number }\`. Paths are sorted lexicographically (path-ascending). Empty vault returns \`{ bases: [], count: 0 }\`. No truncation — all paths returned unconditionally.

Optional \`vault\` (string): accepted for cohort parity but currently silently ignored by the underlying CLI — the tool always operates on the active vault context regardless of the value provided. This is an inherited CLI limitation; the parameter is preserved for forward compatibility.

Read-only — the tool never mutates vault contents.

Typed errors via \`UpstreamError.code\`: \`CLI_REPORTED_ERROR\` (upstream CLI failure); \`VALIDATION_ERROR\` (malformed input, e.g. unknown keys in strict mode). Call \`help({ tool_name: "bases" })\` for worked examples and the error-code roster.`;

export type RegisterDeps = ExecuteDeps;

export function createBasesTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: BASES_TOOL_NAME,
    description: BASES_DESCRIPTION,
    schema: basesInputSchema,
    deps,
    handler: async (input, d) => executeBases(input, d),
  });
}
