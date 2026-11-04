// Original — no upstream. move tool registration via registerTool — responseFormat: "json" wraps the { moved, fromPath, toPath } envelope for the MCP wire. The FOLDER_NOT_FOUND and NOT_A_FOLDER failures and their recovery are documented on docs/tools/move.md, not in the description.
import { registerTool } from "../_register.js";
import { executeMove, MOVE_SUPPORTED, type ExecuteDeps } from "./handler.js";
import { moveInputSchema, moveOutputSchema } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import { DESTRUCTIVE_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const MOVE_TOOL_NAME = "move";

export const MOVE_DESCRIPTION = `Move a file to another folder in an Obsidian vault, optionally renaming it. Use \`rename\` for a name change in place and \`delete\` to remove a file. Links are rewritten per the vault's "Automatically update internal links" setting, and the file keeps its type (change it with \`obsidian_exec\`). ${describeSupport(MOVE_SUPPORTED)}`;

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
