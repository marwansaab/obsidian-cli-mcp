// Original — no upstream. paths handler — single invokeEval call (the eval subcommand) with the frozen JS template + base64 JSON payload (anti-injection); single-call architecture branched at envelope-emission on `payload.total` (in-template); a closed vault is brought up by the shared cold-start retry in the dispatch layer, with no per-tool check; stage-1 extraction reads the call's tagged eval answer (spec 080); stages 2-5 multi-stage parse (JSON.parse → envelope safeParse → discriminate on ok → output validation) with structured CLI_REPORTED_ERROR propagation; surfaces two details.code values (FOLDER_NOT_FOUND, NOT_A_FOLDER) under existing CLI_REPORTED_ERROR top-level code per the established sub-discriminator pattern.
import { JS_TEMPLATE } from "./_template.js";
import { pathsEvalEnvelopeSchema, pathsOutputSchema, type PathsInput, type PathsOutput } from "./schema.js";
import { invokeEval, type SpawnLike, type CallScope } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { decodeEvalEnvelope } from "../_active-file.js";
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

  // === Stage 2 — single invokeEval call ===
  const result = await invokeEval({ code, vault: input.target_mode === "specific" ? input.vault : undefined }, deps);

  // === Stages 3–5 — the call's tagged eval answer → JSON.parse → envelope safeParse ===
  const envelope = decodeEvalEnvelope(result, pathsEvalEnvelopeSchema, {
    toolName: "paths",
    malformedCode: "CLI_REPORTED_ERROR",
  });

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
