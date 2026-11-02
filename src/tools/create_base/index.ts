// Original — no upstream.
import { withDeprecatedParameters } from "../_deprecated-params.js";
import { registerTool } from "../_register.js";
import { CREATE_BASE_SUPPORTED, executeCreateBase, type ExecuteDeps } from "./handler.js";
import { createBaseInputSchema, createBaseOutputSchema, MAX_CONTENT_LENGTH } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import { ADDITIVE_WRITE_HINTS, closedVaultNote, type BootDeps, type RegisteredTool } from "../_shared.js";

export const CREATE_BASE_TOOL_NAME = "create_base";

export const CREATE_BASE_DESCRIPTION =
  `Create a new item (Markdown note) within an Obsidian Bases (\`.base\`) file. Siblings in the Bases family: \`bases\` (enumerate \`.base\` files), \`query_base\` (query rows from a view), \`views_base\` (list views inside a base). ${describeSupport(CREATE_BASE_SUPPORTED)} The created item is a note.

Required \`base_path\` (string, 1..1000 chars): vault-relative path to the \`.base\` file; MUST end with \`.base\` (case-insensitive). Required \`name\` (string, 1..1000 chars): name for the new item (becomes the Markdown filename). Optional \`content\` (string): body text for the new item; max ${MAX_CONTENT_LENGTH} UTF-16 code units — over-limit fails fast with \`VALIDATION_ERROR\` / \`CONTENT_TOO_LARGE\` before invoking the CLI. Optional \`view_name\` (string): view name within the base; not validated by the CLI (nonexistent views silently accepted). Optional \`vault\` (string): creates the item in that vault's Base; omit for the vault in front. With \`vault\`, \`base_path\` and the folder the item will land in are checked to stay inside that vault before anything is created, and the created path is checked again after.

Response: \`{ path: string, name: string }\`. \`path\` in the response is the wrapper-constructed vault-relative path of the created item (not the \`.base\` file). \`name\` is the actual filename returned by the CLI — may differ from the requested name due to auto-increment on collision (e.g. requesting "Task" when "Task.md" exists yields \`name: "Task 1.md"\`).

Write operation — creates a new Markdown note in the vault.

Typed errors via \`UpstreamError.code\`: \`VALIDATION_ERROR\` (\`INVALID_BASE_PATH\` with sub-reasons \`empty\`/\`too-long\`/\`wrong-extension\`/\`path-traversal\`; \`INVALID_NAME\` with sub-reasons \`empty\`/\`too-long\`; \`CONTENT_TOO_LARGE\`); \`CLI_REPORTED_ERROR\` (\`BASE_NOT_FOUND\` when the specified base file does not exist, with \`details.vault\` when a vault is named; \`VAULT_NOT_FOUND\` with \`details.reason: "unknown"\` for an unregistered \`vault\`); \`PATH_ESCAPES_VAULT\` (only when \`vault\` is named: \`base_path\`, the item's folder or the created path resolves outside that vault; when the post-creation check catches it, \`details.createdPath\` names the item, which was written and is kept).

Deprecated names (accepted until the next major release; a call that uses one gets \`deprecated_parameters\` in its result): \`path\` → \`base_path\`, \`view\` → \`view_name\`.

${closedVaultNote("base:create")}`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createCreateBaseTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: CREATE_BASE_TOOL_NAME,
    title: "Create Base",
    annotations: ADDITIVE_WRITE_HINTS,
    description: CREATE_BASE_DESCRIPTION,
    schema: createBaseInputSchema,
    outputSchema: createBaseOutputSchema,
    deps,
    handler: async (input, d) => withDeprecatedParameters(await executeCreateBase(input, d), input.deprecated_parameters),
  });
}
