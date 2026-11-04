// Original — no upstream. open_file registration via registerTool (BI-057; cross-vault rewrite
// ADR-031) — eval-composed surface that opens an existing vault file (any recognised type) as the
// focused, active file in ANY open or closed registered vault, switching focus to that vault and
// reporting the placement outcome. Descriptive tool name (ADR-010 N/A — no native `obsidian open`
// subcommand that can focus an existing tab; opening is eval-composed via app.workspace, the same
// mechanism write_note's `open` parameter uses, ADR-009). Zero new top-level error codes — Constitution
// Principle IV streak preserved (recovery is inherited from dispatchCli; no launcher import).
import { type ExecuteDeps, executeOpenFile, OPEN_FILE_SUPPORTED } from "./handler.js";
import { openFileInputSchema, openFileOutputSchema } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import { registerTool } from "../_register.js";
import { REPEATABLE_WRITE_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const OPEN_FILE_TOOL_NAME = "open_file";

export const OPEN_FILE_DESCRIPTION =
  `Show an existing vault file, by path or name, as the active file in Obsidian, switching to the vault you name. Use \`open_file\` to show the user a file you found; use \`get_active_file\` to read which file is active. ${describeSupport(OPEN_FILE_SUPPORTED)}`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createOpenFileTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: OPEN_FILE_TOOL_NAME,
    title: "Open File",
    annotations: REPEATABLE_WRITE_HINTS,
    description: OPEN_FILE_DESCRIPTION,
    schema: openFileInputSchema,
    outputSchema: openFileOutputSchema,
    deps,
    handler: async (input, d) => executeOpenFile(input, d),
  });
}
