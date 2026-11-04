// Original — no upstream. paths tool registration via registerTool — flat recursive enumeration primitive returning a typed { count, paths } envelope with trailing-slash folder entries. The wrapper composes via the eval subcommand (no single named native subcommand); ADR-010 N/A.
import { registerTool } from "../_register.js";
import { executePaths, type ExecuteDeps } from "./handler.js";
import { pathsInputSchema, pathsOutputSchema } from "./schema.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const PATHS_TOOL_NAME = "paths";

export const PATHS_DESCRIPTION =
  "List every file and folder beneath a vault folder, or the whole vault, recursively. Use `paths` for the full tree, with folder entries ending in a slash; use `files` for only the files directly inside one folder.";

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createPathsTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: PATHS_TOOL_NAME,
    title: "Paths",
    annotations: READ_ONLY_HINTS,
    description: PATHS_DESCRIPTION,
    schema: pathsInputSchema,
    outputSchema: pathsOutputSchema,
    deps,
    handler: async (input, d) => executePaths(input, d),
  });
}
