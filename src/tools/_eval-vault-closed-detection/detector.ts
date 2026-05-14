// Original — no upstream. detectIfClosed — issues ONE invokeCli to `vaults verbose`, parses the registry output via parseVaultRegistry, returns true iff `vaultName` is a known registered (but currently-closed) vault. Cross-cutting shared module extracted at BI-027 per FR-020 / Q8(c) hybrid extraction; consumed by smart_connections_similar (refactored) and smart_connections_query (new) on the empty-stdout + exit-0 signature observed when an eval call targets a registered-but-closed vault (live-probe verified 2026-05-15 per BI-026 F7 / F8). Stays one layer up from cli-adapter; the 008-refactor surface remains frozen.
import { parseVaultRegistry } from "./registry-parser.js";
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface DetectorDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export interface DetectIfClosedInput {
  vaultName: string;
  deps: DetectorDeps;
}

export async function detectIfClosed(input: DetectIfClosedInput): Promise<boolean> {
  const { vaultName, deps } = input;
  const result = await invokeCli(
    {
      command: "vaults",
      parameters: {},
      flags: ["verbose"],
      target_mode: "specific",
    },
    { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
  );
  return parseVaultRegistry(result.stdout, vaultName);
}
