// Original — no upstream.
import { registerTool } from "../_register.js";
import { executeCreateBase, type ExecuteDeps } from "./handler.js";
import { createBaseInputSchema, createBaseOutputSchema, MAX_CONTENT_LENGTH } from "./schema.js";
import { describeSupport, type FileCategory } from "../../file-type/file-type.js";
import { ADDITIVE_WRITE_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const CREATE_BASE_TOOL_NAME = "create_base";

/** create_base adds an item to a base (`path`); others keep their INVALID_BASE_PATH rejection (spec 070 FR-007a). */
export const CREATE_BASE_SUPPORTED = ["base"] as const satisfies readonly FileCategory[];

export const CREATE_BASE_DESCRIPTION =
  `Create a new item (Markdown note) within an Obsidian Bases (\`.base\`) file. Siblings in the Bases family: \`bases\` (enumerate \`.base\` files), \`query_base\` (query rows from a view), \`views_base\` (list views inside a base). ${describeSupport(CREATE_BASE_SUPPORTED)} The created item is a note.

Required \`path\` (string, 1..1000 chars): vault-relative path to the \`.base\` file; MUST end with \`.base\` (case-insensitive). Required \`name\` (string, 1..1000 chars): name for the new item (becomes the Markdown filename). Optional \`content\` (string): body text for the new item; max ${MAX_CONTENT_LENGTH} UTF-16 code units — over-limit fails fast with \`VALIDATION_ERROR\` / \`CONTENT_TOO_LARGE\` before invoking the CLI. Optional \`view\` (string): view name within the base; not validated by the CLI (nonexistent views silently accepted). Optional \`vault\` (string): accepted for cohort parity but silently ignored by the CLI.

Response: \`{ path: string, name: string }\`. \`path\` is the wrapper-constructed vault-relative path of the created item. \`name\` is the actual filename returned by the CLI — may differ from the requested name due to auto-increment on collision (e.g. requesting "Task" when "Task.md" exists yields \`name: "Task 1.md"\`).

Write operation — creates a new Markdown note in the vault.

Typed errors via \`UpstreamError.code\`: \`VALIDATION_ERROR\` (\`INVALID_BASE_PATH\` with sub-reasons \`empty\`/\`too-long\`/\`wrong-extension\`/\`path-traversal\`; \`INVALID_NAME\` with sub-reasons \`empty\`/\`too-long\`; \`CONTENT_TOO_LARGE\`); \`CLI_REPORTED_ERROR\` (\`BASE_NOT_FOUND\` when the specified base file does not exist).`;

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
    handler: async (input, d) => executeCreateBase(input, d),
  });
}
