// Original — no upstream. get_active_file registration via registerTool (BI-063) — the read counterpart of
// open_file. Eval-composed surface (ADR-010 N/A — no native `obsidian active-file` subcommand; the active
// file is read from app.workspace.getActiveFile() via `obsidian eval`). Reports the active file of the
// focused vault (target_mode:"active") or a named vault (target_mode:"specific", routed cross-vault),
// returning { active: { path, name, basename, extension } | null }. Zero new top-level error codes —
// Constitution Principle IV streak preserved (recovery inherited from dispatchCli; no launcher import).
import { executeGetActiveFile, type ExecuteDeps } from "./handler.js";
import { getActiveFileInputSchema, getActiveFileOutputSchema } from "./schema.js";
import { registerTool } from "../_register.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const GET_ACTIVE_FILE_TOOL_NAME = "get_active_file";

export const GET_ACTIVE_FILE_DESCRIPTION =
  `Report which file Obsidian has focused, in the focused vault or a named one, without changing focus. Use \`get_active_file\` to confirm the file an active-target call will act on; use \`open_file\` to make a file active.`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createGetActiveFileTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: GET_ACTIVE_FILE_TOOL_NAME,
    title: "Get Active File",
    annotations: READ_ONLY_HINTS,
    description: GET_ACTIVE_FILE_DESCRIPTION,
    schema: getActiveFileInputSchema,
    outputSchema: getActiveFileOutputSchema,
    deps,
    handler: async (input, d) => executeGetActiveFile(input, d),
  });
}
