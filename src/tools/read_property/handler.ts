// Original — no upstream. read_property handler: two-call invokeCli wrapper (Call A file-scoped value + Call B vault-scoped type metadata) per R3; type-label translation per R6; No-frontmatter short-circuit per R7; absent-key short-circuit; verbatim name passthrough per FR-018.
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";

import { type PropertyTypeLabel, type ReadPropertyInput, type ReadPropertyOutput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

const OBSIDIAN_TYPE_TO_SPEC_TYPE: Record<string, PropertyTypeLabel> = {
  text: "text", multitext: "list", aliases: "list", tags: "list",
  number: "number", checkbox: "checkbox", date: "date", datetime: "datetime", unknown: "unknown",
};
const translateObsidianType = (label: string): PropertyTypeLabel =>
  OBSIDIAN_TYPE_TO_SPEC_TYPE[label] ?? "unknown";

const NO_FRONTMATTER_PREFIX = "No frontmatter found.";

function parseOrThrow<T>(stdout: string, call: "A" | "B"): T {
  try {
    return JSON.parse(stdout) as T;
  } catch (err) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: err,
      details: { stdout, call },
      message: `read_property could not parse Call ${call} response: ${stdout.slice(0, 200)}`,
    });
  }
}

export async function executeReadProperty(
  input: ReadPropertyInput,
  deps: ExecuteDeps,
): Promise<ReadPropertyOutput> {
  const isSpecific = input.target_mode === "specific";
  const vault = isSpecific ? input.vault! : undefined;
  const adapterDeps = { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue };
  const parametersA: Record<string, string> = isSpecific
    ? {
        ...(input.file !== undefined ? { file: input.file } : {}),
        ...(input.path !== undefined ? { path: input.path } : {}),
        format: "json",
      }
    : { format: "json" };
  const callA = await invokeCli(
    { command: "properties", vault, parameters: parametersA, flags: isSpecific ? [] : ["active"], target_mode: input.target_mode },
    adapterDeps,
  );
  if (callA.stdout.trimStart().startsWith(NO_FRONTMATTER_PREFIX)) {
    return { value: null, type: "unknown" };
  }
  const parsedA = parseOrThrow<Record<string, unknown>>(callA.stdout, "A");
  if (!Object.prototype.hasOwnProperty.call(parsedA, input.name)) {
    return { value: null, type: "unknown" };
  }
  const value = parsedA[input.name];
  const callB = await invokeCli(
    { command: "properties", vault, parameters: { format: "json" }, flags: [], target_mode: input.target_mode },
    adapterDeps,
  );
  const parsedB = parseOrThrow<Array<{ name: string; type: string; count: number }>>(callB.stdout, "B");
  const entry = parsedB.find((p) => p.name === input.name);
  let type: PropertyTypeLabel = entry ? translateObsidianType(entry.type) : "unknown";
  if (type === "list" && Array.isArray(value) && new Set(value.map((v) => typeof v)).size > 1) {
    type = "unknown";
  }
  return { value: value as ReadPropertyOutput["value"], type };
}
