// Original — no upstream. move tool registration via registerTool — responseFormat: "json" wraps the { moved, fromPath, toPath } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeMove, type ExecuteDeps } from "./handler.js";
import { moveInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const MOVE_TOOL_NAME = "move";

export const MOVE_DESCRIPTION =
  'Move a note within an Obsidian vault (optionally renaming it). Honours the vault\'s "Automatically update internal links" setting; link-rewriting is vault-config-dependent. Call help({ tool_name: "move" }) for full parameter docs and the error-code roster including the active-mode no-focused-note caveat.';

export type RegisterDeps = ExecuteDeps;

export function createMoveTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: MOVE_TOOL_NAME,
    description: MOVE_DESCRIPTION,
    schema: moveInputSchema,
    deps,
    handler: async (input, d) => executeMove(input, d),
  });
}
