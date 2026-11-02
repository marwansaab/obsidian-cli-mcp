// Original — no upstream.
import { registerTool } from "../_register.js";
import { executeBases, type ExecuteDeps } from "./handler.js";
import { basesInputSchema, basesOutputSchema } from "./schema.js";
import { closedVaultNote, READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const BASES_TOOL_NAME = "bases";

export const BASES_DESCRIPTION =
  `Enumerate all Obsidian Bases (\`.base\`) files in the vault and return their vault-relative paths as a sorted list. Siblings in the Bases family: \`query_base\` (query rows from a view), \`views_base\` (list views inside a base), \`create_base\` (create a new item in a base).

Response: \`{ bases: string[], count: number }\`. Paths are sorted lexicographically (path-ascending). Empty vault returns \`{ bases: [], count: 0 }\`. No truncation — all paths returned unconditionally.

Optional \`vault\` (string): lists that vault's Bases. Omit to list the vault in front.

Read-only — the tool never mutates vault contents.

Typed errors via \`UpstreamError.code\`: \`CLI_REPORTED_ERROR\` (upstream CLI failure); \`CLI_REPORTED_ERROR\` with \`details.code: "VAULT_NOT_FOUND"\` (\`details.reason: "unknown"\`) for an unregistered \`vault\`; \`VALIDATION_ERROR\` (malformed input, e.g. unknown keys in strict mode).

${closedVaultNote("bases")}`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createBasesTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: BASES_TOOL_NAME,
    title: "Bases",
    annotations: READ_ONLY_HINTS,
    description: BASES_DESCRIPTION,
    schema: basesInputSchema,
    outputSchema: basesOutputSchema,
    deps,
    handler: async (input, d) => executeBases(input, d),
  });
}
