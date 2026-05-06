// Original — no upstream. obsidian_exec tool registration via registerTool — responseFormat: "json" wraps the structured exec output for the MCP wire.
import { registerTool } from "../_register.js";
import { executeObsidianExec, type ExecuteDeps } from "./handler.js";
import { obsidianExecSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const OBSIDIAN_EXEC_TOOL_NAME = "obsidian_exec";

export const OBSIDIAN_EXEC_DESCRIPTION =
  'Invoke any Obsidian Integrated CLI subcommand. Returns stdout, stderr, exitCode, and the exact argv invoked. Failures (non-zero exit, in-band Error: prefix, missing binary, timeout, output > 10 MiB) surface as structured errors with stable codes. Call help({ tool_name: "obsidian_exec" }) for full parameter docs and the error-code roster.';

export type RegisterDeps = ExecuteDeps;

export function createObsidianExecTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: OBSIDIAN_EXEC_TOOL_NAME,
    description: OBSIDIAN_EXEC_DESCRIPTION,
    schema: obsidianExecSchema,
    deps,
    handler: async (input, d) => executeObsidianExec(input, d),
  });
}
