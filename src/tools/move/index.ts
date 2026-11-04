// Original — no upstream. move tool registration via registerTool — responseFormat: "json" wraps the { moved, fromPath, toPath } envelope for the MCP wire. Spec 090: the description names the FOLDER_NOT_FOUND failure and its recovery; BI-0177: and the NOT_A_FOLDER failure (a file in the way of the destination folder) and its recovery.
import { registerTool } from "../_register.js";
import { executeMove, MOVE_SUPPORTED, type ExecuteDeps } from "./handler.js";
import { moveInputSchema, moveOutputSchema } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import { DESTRUCTIVE_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const MOVE_TOOL_NAME = "move";

export const MOVE_DESCRIPTION = `Move a file within an Obsidian vault (optionally renaming it). Honours the vault's "Automatically update internal links" setting; link-rewriting is vault-config-dependent. ${describeSupport(MOVE_SUPPORTED)} The file keeps its type: a destination without an extension gets the file's own, and one with another type's extension is rejected with UNSUPPORTED_FILE_TYPE (change a type deliberately with obsidian_exec). A destination folder that does not exist fails with CLI_REPORTED_ERROR, details.code FOLDER_NOT_FOUND and the folder's vault-relative path in details.folder; create the folder, then retry. A file in the way of the destination folder (for example to "Inbox/Note.md/" where Inbox/Note.md is a note) fails with CLI_REPORTED_ERROR, details.code NOT_A_FOLDER and that file's vault-relative path in details.folder; rename or remove that file, or pick another destination.`;

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
