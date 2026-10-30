// Original — no upstream. The owner's access settings (068 FR-012, FR-043–FR-046, data-model §1, contracts/configuration): parseAccessConfig reads them once from the boot environment, and selectOfferedTools applies them to the tool list (read-only, allow and deny lists, unknown names refused at boot). createServer in server.ts is the only production caller.
import { envFlagEnabled } from "./env-flags.js";

import type { RegisteredTool } from "./tools/_shared.js";

/** The owner's access settings, read once at boot (068 data-model §1, contracts/configuration). */
export interface AccessConfig {
  /** `OBSIDIAN_MCP_ALLOW_EVAL`: lets `obsidian_exec` run the blocked commands. */
  allowEval: boolean;
  /** `OBSIDIAN_MCP_READ_ONLY`: offer only tools whose `readOnlyHint` is true. */
  readOnly: boolean;
  /** `OBSIDIAN_MCP_TOOLS`: offer only these; absent means every tool. */
  allow?: readonly string[];
  /** `OBSIDIAN_MCP_DISABLE`: never offer these. */
  deny: readonly string[];
}

/** Split a comma-separated tool list; blank entries are dropped, and a blank list counts as unset. */
function toolNameList(raw: string | undefined): string[] | undefined {
  const names = (raw ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  return names.length === 0 ? undefined : names;
}

export function parseAccessConfig(env: NodeJS.ProcessEnv): AccessConfig {
  const allow = toolNameList(env.OBSIDIAN_MCP_TOOLS);
  return {
    allowEval: envFlagEnabled(env.OBSIDIAN_MCP_ALLOW_EVAL),
    readOnly: envFlagEnabled(env.OBSIDIAN_MCP_READ_ONLY),
    ...(allow !== undefined && { allow }),
    deny: toolNameList(env.OBSIDIAN_MCP_DISABLE) ?? [],
  };
}

/**
 * The tools to offer (068 FR-043–FR-045): the allow list first, then the deny list (deny wins on
 * overlap), then read-only on top (a write tool on the allow list is still dropped). An empty
 * result is allowed. Every unknown name in either list is reported in one error, before serving.
 */
export function selectOfferedTools(tools: readonly RegisteredTool[], config: AccessConfig): RegisteredTool[] {
  const known = new Set(tools.map((tool) => tool.descriptor.name));
  const unknown = [
    ...(config.allow ?? []).filter((name) => !known.has(name)).map((name) => `${name} (OBSIDIAN_MCP_TOOLS)`),
    ...config.deny.filter((name) => !known.has(name)).map((name) => `${name} (OBSIDIAN_MCP_DISABLE)`),
  ];
  if (unknown.length > 0) {
    throw new Error(
      `Unknown tool name(s) in OBSIDIAN_MCP_TOOLS / OBSIDIAN_MCP_DISABLE: ${unknown.join(", ")}. Valid names: ${[...known].sort().join(", ")}`,
    );
  }
  const allow = config.allow === undefined ? undefined : new Set(config.allow);
  const deny = new Set(config.deny);
  return tools.filter(({ descriptor }) => {
    if (allow !== undefined && !allow.has(descriptor.name)) return false;
    if (deny.has(descriptor.name)) return false;
    return !config.readOnly || descriptor.annotations.readOnlyHint;
  });
}
