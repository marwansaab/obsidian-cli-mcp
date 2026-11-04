// Original — no upstream. files tool registration via registerTool — folder-scoped typed enumeration; responseFormat: "json" (default) wraps the { count, paths } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeListFiles, type ExecuteDeps } from "./handler.js";
import { filesInputSchema, listFilesOutputSchema } from "./schema.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const FILES_TOOL_NAME = "files";

export const FILES_DESCRIPTION =
  "List the files directly inside one vault folder, or the vault root, without descending into sub-folders. Use `files` for a single folder's own files; use `paths` for a recursive list of every file and sub-folder beneath a folder.";

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createFilesTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: FILES_TOOL_NAME,
    title: "Files",
    annotations: READ_ONLY_HINTS,
    description: FILES_DESCRIPTION,
    schema: filesInputSchema,
    outputSchema: listFilesOutputSchema,
    deps,
    handler: async (input, d) => executeListFiles(input, d),
  });
}
