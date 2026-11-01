// Original — no upstream. read_heading handler: single invokeEval call (the eval subcommand) with a frozen JS template + base64 payload (R6 anti-injection); reuses Obsidian's pre-parsed metadataCache headings array (R7); two-stage envelope parse with discriminator-mapped UpstreamError (R13); Setext defence-in-depth filter (R14).
import { JS_TEMPLATE } from "./_template.js";
import {
  HEADING_PATH_SEPARATOR,
  readHeadingEvalResponseSchema,
  type ReadHeadingInput,
  type ReadHeadingOutput,
} from "./schema.js";
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

export async function executeReadHeading(
  input: ReadHeadingInput,
  deps: ExecuteDeps,
): Promise<ReadHeadingOutput> {
  const code = composeEvalCode(JS_TEMPLATE, {
    active: input.target_mode === "active",
    path: input.target_mode === "specific" ? input.path ?? null : null,
    file: input.target_mode === "specific" ? input.file ?? null : null,
    segments: input.heading.split(HEADING_PATH_SEPARATOR),
  });

  const result = await invokeEval({ code, vault: input.target_mode === "specific" ? input.vault : undefined }, deps);

  const envelope = decodeEvalEnvelope(result, readHeadingEvalResponseSchema, {
    toolName: "read_heading",
    malformedCode: "CLI_REPORTED_ERROR",
  });

  if (envelope.ok === true) return { content: envelope.content };

  const { code: envelopeCode, detail } = envelope;
  if (envelopeCode === "NO_ACTIVE_FILE") {
    throw new UpstreamError({
      code: "ERR_NO_ACTIVE_FILE",
      cause: null,
      details: { stage: "envelope-error", detail },
      message: "read_heading: no note focused; switch to specific mode or focus a note.",
    });
  }
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: { stage: "envelope-error", code: envelopeCode, detail },
    message:
      envelopeCode === "FILE_NOT_FOUND"
        ? `read_heading: file not found (${detail})`
        : `read_heading: heading path not found in file (${detail})`,
  });
}
