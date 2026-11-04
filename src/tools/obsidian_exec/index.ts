// Original — no upstream. obsidian_exec tool registration via registerTool — responseFormat: "json" wraps the structured exec output for the MCP wire.
import { registerTool } from "../_register.js";
import { executeObsidianExec, type ExecuteDeps } from "./handler.js";
import { obsidianExecSchema } from "./schema.js";
import { PASSTHROUGH_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const OBSIDIAN_EXEC_TOOL_NAME = "obsidian_exec";

export const OBSIDIAN_EXEC_DESCRIPTION =
  "Run an Obsidian CLI subcommand and return its stdout, stderr, exit code and the exact argv it ran. Use it for any command the typed tools do not cover, since it skips their input checks and structured results. Commands that run code or drive developer tooling are blocked unless `OBSIDIAN_MCP_ALLOW_EVAL` is set.";

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createObsidianExecTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: OBSIDIAN_EXEC_TOOL_NAME,
    title: "Obsidian Exec",
    annotations: PASSTHROUGH_HINTS,
    description: OBSIDIAN_EXEC_DESCRIPTION,
    schema: obsidianExecSchema,
    deps,
    handler: async (input, d) => executeObsidianExec(input, d),
  });
}
