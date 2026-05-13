// Original — no upstream. outline handler — single-spawn invokeCli wrapper around the CLI's native `outline` subcommand (R2/R3); branched on input.total — default mode sends `format=json` parameter only, count-only mode sends `total` flag only (mutually exclusive at upstream per F14). Load-bearing wrapper transforms: empty-outline sentinel detection per R9/F7 (literal "No headings found." after trim → { count: 0, headings: [] } in BOTH modes), and the upstream `heading` → wrapper `text` field rename per F1/FR-008. All other failure surfaces (file-not-found, non-`.md`, path-traversal, no-focus, output-cap, binary-not-found) flow through the dispatch layer's existing classifier without wrapper involvement.
import { outlineUpstreamArraySchema, type OutlineInput, type OutlineOutput } from "./schema.js";
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

export const EMPTY_OUTLINE_SENTINEL = "No headings found.";

export async function executeOutline(
  input: OutlineInput,
  deps: ExecuteDeps,
): Promise<OutlineOutput> {
  const countOnly = input.total === true;
  const parameters: Record<string, string> = {};
  if (!countOnly) parameters.format = "json";
  if (input.file !== undefined) parameters.file = input.file;
  if (input.path !== undefined) parameters.path = input.path;
  const flags: string[] = countOnly ? ["total"] : [];

  const result = await invokeCli(
    {
      command: "outline",
      vault: input.vault,
      parameters,
      flags,
      target_mode: input.target_mode,
    },
    {
      spawnFn: deps.spawnFn,
      env: deps.env,
      logger: deps.logger,
      queue: deps.queue,
    },
  );

  const trimmed = result.stdout.trim();

  // R9 / F7: empty-outline sentinel detection — both modes share this branch.
  if (trimmed === EMPTY_OUTLINE_SENTINEL) {
    return { count: 0, headings: [] };
  }

  if (countOnly) {
    // F6: count-only mode upstream returns a plain integer.
    const count = Number.parseInt(trimmed, 10);
    if (!Number.isInteger(count) || count < 0 || String(count) !== trimmed) {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        message: `Outline total mode returned non-integer stdout: ${JSON.stringify(trimmed)}`,
        details: { stage: "total-parse", stdout: trimmed },
      });
    }
    return { count, headings: [] };
  }

  // Default mode: parse JSON array, then heading → text field rename.
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (cause) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause,
      message: `Outline JSON parse failed: ${(cause as Error).message}`,
      details: { stage: "json-parse", stdout: trimmed },
    });
  }
  const upstreamArray = outlineUpstreamArraySchema.parse(parsed);
  const headings = upstreamArray.map((h) => ({
    level: h.level,
    text: h.heading,
    line: h.line,
  }));
  return { count: headings.length, headings };
}
