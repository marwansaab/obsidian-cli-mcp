// Original — no upstream. read_heading handler: single invokeCli wrapper around the eval subcommand with a frozen JS template + base64 payload (R6 anti-injection); reuses Obsidian's pre-parsed metadataCache headings array (R7); two-stage envelope parse with discriminator-mapped UpstreamError (R13); Setext defence-in-depth filter (R14).
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";

import { JS_TEMPLATE } from "./_template.js";
import {
  HEADING_PATH_SEPARATOR,
  readHeadingEvalResponseSchema,
  type ReadHeadingInput,
  type ReadHeadingOutput,
} from "./schema.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export async function executeReadHeading(
  input: ReadHeadingInput,
  deps: ExecuteDeps,
): Promise<ReadHeadingOutput> {
  const payloadJson = JSON.stringify({
    active: input.target_mode === "active",
    path: input.target_mode === "specific" ? input.path ?? null : null,
    file: input.target_mode === "specific" ? input.file ?? null : null,
    segments: input.heading.split(HEADING_PATH_SEPARATOR),
  });
  const payloadB64 = Buffer.from(payloadJson, "utf-8").toString("base64");
  const code = JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64);

  const result = await invokeCli(
    {
      command: "eval",
      vault: input.target_mode === "specific" ? input.vault : undefined,
      parameters: { code },
      flags: [],
      target_mode: input.target_mode,
    },
    { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
  );

  let stdout = result.stdout.trimStart();
  if (stdout.startsWith("=> ")) stdout = stdout.slice(3);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stdout);
  } catch (err) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: err,
      details: { stage: "json-parse", stdout: result.stdout.slice(0, 500) },
      message: `read_heading: eval response is not JSON: ${result.stdout.slice(0, 200)}`,
    });
  }

  const validated = readHeadingEvalResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: validated.error,
      details: { stage: "envelope-parse", stdout: result.stdout.slice(0, 500) },
      message: "read_heading: eval response shape unexpected",
    });
  }

  if (validated.data.ok === true) return { content: validated.data.content };

  const { code: envelopeCode, detail } = validated.data;
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
