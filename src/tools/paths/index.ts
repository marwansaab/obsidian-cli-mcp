// Original — no upstream. paths tool registration via registerTool — flat recursive enumeration primitive returning a typed { count, paths } envelope with trailing-slash folder entries. The wrapper composes via the eval subcommand (no single named native subcommand); ADR-010 N/A.
import { registerTool } from "../_register.js";
import { executePaths, type ExecuteDeps } from "./handler.js";
import { pathsInputSchema, pathsOutputSchema } from "./schema.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const PATHS_TOOL_NAME = "paths";

export const PATHS_DESCRIPTION =
  'Flat path list under a vault folder (recursive). Returns { count, paths: string[] }; folder entries end with "/", file entries do not. Required target_mode ("specific"|"active"); active mode uses the focused vault. Optional folder (defaults to vault root), depth (positive integer; unbounded by default), ext (filter, e.g. "md"), total (true returns only the count).';

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
