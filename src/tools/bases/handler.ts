// Original — no upstream. Lists vault `.base` files via the native `bases` subcommand;
// the membership filter keeps only clean-exit stdout lines ending in `.base`
// (case-insensitive), so an empty vault's informational line yields { bases: [], count: 0 }.
// A named `vault` routes through the subcommand's own `vault=` (spec 083 research P1); with
// no `vault` the call runs against the vault in front, exactly as before.
import { basesOutputSchema, type BasesInput, type BasesOutput } from "./schema.js";
import { invokeCli, type SpawnLike, type CallScope } from "../../cli-adapter/cli-adapter.js";
import { resolveVaultRootOrRemap } from "../_active-file.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";
import type { VaultRegistry } from "../../vault-registry/registry.js";

export interface ExecuteDeps extends CallScope {
  logger: Logger;
  queue: Queue;
  /**
   * Injected at the composition root (server.ts) — used when `vault` is named to surface a
   * typed VAULT_NOT_FOUND/unknown (via resolveVaultRootOrRemap) BEFORE the `bases` subcommand
   * is spawned. The handler never constructs it (DI discipline).
   */
  vaultRegistry: VaultRegistry;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export async function executeBases(
  input: BasesInput,
  deps: ExecuteDeps,
): Promise<BasesOutput> {
  // Typed unknown-vault error BEFORE anything is spawned (research D2).
  if (input.vault !== undefined) await resolveVaultRootOrRemap(deps.vaultRegistry, input.vault, "bases");

  const result = await invokeCli(
    {
      command: "bases",
      vault: input.vault,
      parameters: {},
      flags: [],
      target_mode: input.vault === undefined ? "active" : "specific",
    },
    deps,
  );

  const bases = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().endsWith(".base"))
    .sort();

  return basesOutputSchema.parse({ bases, count: bases.length });
}
