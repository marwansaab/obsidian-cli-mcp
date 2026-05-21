// Original — no upstream. properties handler — single-spawn invokeCli wrapper around the CLI's native `properties` subcommand (R2/R3); branched on input.total — default mode sends `format=json` parameter only, count-only mode sends `total` flag only (mutually exclusive at upstream per R3). Vault-only surface — NO target_mode discriminator (R4 NOT APPLICABLE); target_mode: "specific" is passed to invokeCli only to satisfy the InvokeCliInput type and to ensure input.vault flows through to dispatch verbatim (cli-adapter's stripTargetLocators does NOT execute because parameters never contain file/path/vault keys for this tool). Three load-bearing wrapper transforms per default-mode entry: DROP upstream `type` field per R7/F5/FR-004, RENAME upstream `count` → wrapper `noteCount` per R7/F6/FR-007, and post-fetch case-insensitive-primary sort per R8/FR-013 (byte-order tiebreak from FR-013 is structurally unobservable post-BI-041 — upstream's case-insensitive collapse erases the inputs the tiebreak was designed to disambiguate). All other failure surfaces (output-cap, binary-not-found, vault-not-found per BI-042 reconciliation: upstream validates vault= and emits "Vault not found." which the cli-adapter R5 inspection reclassifies as CLI_REPORTED_ERROR with details.message: "Vault not found.") flow through the dispatch layer's existing classifier without wrapper involvement.
import {
  propertiesUpstreamArraySchema,
  type PropertiesInput,
  type PropertiesOutput,
} from "./schema.js";
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export async function executeProperties(
  input: PropertiesInput,
  deps: ExecuteDeps,
): Promise<PropertiesOutput> {
  const countOnly = input.total === true;
  const parameters: Record<string, string> = {};
  if (!countOnly) parameters.format = "json";
  const flags: string[] = countOnly ? ["total"] : [];

  const result = await invokeCli(
    {
      command: "properties",
      vault: input.vault,
      parameters,
      flags,
      target_mode: "specific",
    },
    {
      spawnFn: deps.spawnFn,
      env: deps.env,
      logger: deps.logger,
      queue: deps.queue,
    },
  );

  const trimmed = result.stdout.trim();

  if (countOnly) {
    // F3: count-only mode upstream returns a plain integer (distinct property names count).
    const count = Number.parseInt(trimmed, 10);
    if (!Number.isInteger(count) || count < 0 || String(count) !== trimmed) {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        message: `Properties total mode returned non-integer stdout: ${JSON.stringify(trimmed)}`,
        details: { stage: "total-parse", stdout: trimmed },
      });
    }
    return { count, properties: [] };
  }

  // Default mode: parse JSON array, drop type, rename count → noteCount, post-fetch sort.
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (cause) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause,
      message: `Properties JSON parse failed: ${(cause as Error).message}`,
      details: { stage: "json-parse", stdout: trimmed },
    });
  }
  const upstreamArray = propertiesUpstreamArraySchema.parse(parsed);
  const properties = upstreamArray
    .map(({ name, count }) => ({ name, noteCount: count }))
    .sort((a, b) => {
      const aLower = a.name.toLowerCase();
      const bLower = b.name.toLowerCase();
      if (aLower !== bLower) return aLower < bLower ? -1 : 1;
      // Tiebreak: byte-order (uppercase letters precede lowercase per ASCII).
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
  return { count: properties.length, properties };
}
