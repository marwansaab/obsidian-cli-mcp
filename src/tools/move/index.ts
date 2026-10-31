// Original — no upstream. move tool registration via registerTool — responseFormat: "json" wraps the { moved, fromPath, toPath } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeMove, MOVE_SUPPORTED, type ExecuteDeps } from "./handler.js";
import { moveInputSchema, moveOutputSchema } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import { DESTRUCTIVE_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const MOVE_TOOL_NAME = "move";

export const MOVE_DESCRIPTION = `Move a file within an Obsidian vault (optionally renaming it). Honours the vault's "Automatically update internal links" setting; link-rewriting is vault-config-dependent. ${describeSupport(MOVE_SUPPORTED)} The file keeps its type: a destination without an extension gets the file's own, and one with another type's extension is rejected with UNSUPPORTED_FILE_TYPE (change a type deliberately with obsidian_exec).`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createMoveTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: MOVE_TOOL_NAME,
    title: "Move",
    annotations: DESTRUCTIVE_HINTS,
    description: MOVE_DESCRIPTION,
    schema: moveInputSchema,
    outputSchema: moveOutputSchema,
    deps,
    handler: async (input, d) => executeMove(input, d),
  });
}
