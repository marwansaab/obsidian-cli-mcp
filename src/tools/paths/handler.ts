// Original — no upstream. paths handler — single invokeCli wrapper around the eval subcommand with the frozen JS template + base64 JSON payload (anti-injection); single-call architecture branched at envelope-emission on `payload.total` (in-template); a closed vault is brought up by the shared cold-start retry in the dispatch layer, with no per-tool check; stage-1 extraction uses the trimStart+startsWith pattern; stages 2-5 multi-stage parse (JSON.parse → envelope safeParse → discriminate on ok → output validation) with structured CLI_REPORTED_ERROR propagation; surfaces two details.code values (FOLDER_NOT_FOUND, NOT_A_FOLDER) under existing CLI_REPORTED_ERROR top-level code per the established sub-discriminator pattern.
import { JS_TEMPLATE } from "./_template.js";
import { pathsEvalEnvelopeSchema, pathsOutputSchema, type PathsInput, type PathsOutput } from "./schema.js";
import { invokeCli, type SpawnLike, type CallScope } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { composeEvalCode } from "../_shared.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps extends CallScope {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export async function executePaths(
  input: PathsInput,
  deps: ExecuteDeps,
): Promise<PathsOutput> {
  // === Stage 1 — assemble payload + render template ===
  const code = composeEvalCode(JS_TEMPLATE, {
    folder: input.folder ?? null,
    depth: input.depth ?? null,
    ext: input.ext ?? null,
    total: input.total === true,
  });

  // === Stage 2 — single invokeCli call (subcommand=eval) ===
  const result = await invokeCli(
    {
      command: "eval",
      vault: input.target_mode === "specific" ? input.vault : undefined,
      parameters: { code },
      flags: [],
      target_mode: input.target_mode,
    },
    deps,
  );

  // === Stage 3 — extract JSON via "=> " prefix ===
  const trimmed = result.stdout.trimStart();
  const jsonText = trimmed.startsWith("=> ") ? trimmed.slice(3) : trimmed;

  // === Stage 4 — JSON.parse ===
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch (err) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: err,
      details: { stage: "json-parse", stdout: result.stdout.slice(0, 500) },
      message: `paths: eval response is not JSON: ${result.stdout.slice(0, 200)}`,
    });
  }

  // === Stage 5 — envelope safeParse ===
  const validated = pathsEvalEnvelopeSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: validated.error,
      details: { stage: "envelope-parse", stdout: result.stdout.slice(0, 500) },
      message: "paths: eval response shape unexpected",
    });
  }
  const envelope = validated.data;

  // === Stage 6 — discriminate on ok ===
  if (envelope.ok === false) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: {
        stage: "envelope-error",
        code: envelope.code,
        folder: envelope.folder,
      },
      message: `paths: ${envelope.code} for folder "${envelope.folder}"`,
    });
  }

  // === Stage 7 — output schema validation at the return boundary ===
  return pathsOutputSchema.parse({ count: envelope.count, paths: envelope.paths });
}
